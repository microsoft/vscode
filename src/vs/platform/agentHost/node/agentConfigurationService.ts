/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { dirname } from '../../../base/common/path.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSandboxEnabledValue } from '../../sandbox/common/settings.js';
import { resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema, defaultAgentHostCustomizationConfigValues } from '../common/agentHostCustomizationConfig.js';
import { getAgentCustomizationSettingsEntries, getProviderBackedRootConfigKeys, withAgentCustomizationSettings, type IAgentCustomizationSettingsRegistration } from '../common/agentCustomizationSettings.js';
import { copilotCliConfigSchema } from '../common/copilotCliConfig.js';
import { agentMergeRootConfigSchema } from '../common/agentMerge.js';
import { chatMoveRootConfigSchema } from '../common/agentHostChatMove.js';
import { automationRootConfigSchema } from '../common/automationConfig.js';
import { sandboxConfigSchema } from '../common/sandboxConfigSchema.js';
import { agentHostProxyConfigSchema, clientOwnedApprovalRootConfigKeys, platformRootSchema, type ISchema, type SchemaDefinition, type SchemaValue } from '../common/agentHostSchema.js';
import { ProtocolError } from '../common/state/sessionProtocol.js';
import { ActionType, type ActionOrigin } from '../common/state/sessionActions.js';
import type { ChatConfigChangedAction, SessionConfigChangedAction } from '../common/state/protocol/actions.js';
import { ChatOriginKind, isAhpChatChannel, parseSubagentSessionUri, readSessionWorkspaceless, ROOT_STATE_URI, type SessionConfigState, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { applyChatConfigLayers, filterChatConfigValues, splitChatConfigPatch } from '../common/sessionConfigProperties.js';
import { inheritedChatFolders } from './agentChatContext.js';
import { getSessionSummarySources } from './agentHostChatsInUse.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { type ISessionSandboxPolicy, readSessionSandboxPolicy, withSessionSandboxPolicy } from '../common/meta/agentSandboxPolicyMeta.js';
import { ISessionSandboxState, readChatSandboxState, readSessionSandboxState, withChatSandboxState, withSessionSandboxState } from '../common/meta/agentSandboxStateMeta.js';
import { getSessionSandboxOverrides, resolveSandboxEnabled } from './sessionSandbox.js';

export const IAgentConfigurationService = createDecorator<IAgentConfigurationService>('agentConfigurationService');

/**
 * @deprecated Use {@link getEffectiveWorkingDirectories} instead, which preserves every root instead of collapsing to the primary.
 */
export function getEffectiveWorkingDirectory(stateManager: AgentHostStateManager, session: ProtocolURI): string | undefined {
	const own = stateManager.getSessionState(session)?.workingDirectories?.[0];
	if (own !== undefined) {
		return own;
	}
	const parentInfo = parseSubagentSessionUri(session);
	if (parentInfo) {
		return stateManager.getSessionState(parentInfo.parentSession.toString())?.workingDirectories?.[0];
	}
	return undefined;
}

export function getEffectiveWorkingDirectories(stateManager: AgentHostStateManager, session: ProtocolURI): string[] | undefined {
	const state = stateManager.getSessionState(session);
	const own = state?.workingDirectories;
	if (own !== undefined) {
		// A chat without folders of its own works in its session's, never in another chat's scratch folder.
		if (isAhpChatChannel(session) && stateManager.getChatState(session)?.workingDirectories === undefined) {
			// A chat whose state isn't hydrated yet (after a restart) still has its own recorded folders in its catalog summary.
			const recorded = state?.chats.find(chat => chat.resource === session)?.workingDirectories;
			if (recorded?.length) {
				return [...recorded];
			}
			return [...inheritedChatFolders(stateManager, own, readSessionWorkspaceless(state?._meta))];
		}
		return own;
	}
	const parentInfo = parseSubagentSessionUri(session);
	if (parentInfo) {
		return stateManager.getSessionState(parentInfo.parentSession.toString())?.workingDirectories;
	}
	return undefined;
}

/**
 * Returns the working directories covered by a session's cumulative Session
 * Changes: the session's own followed by those of the chats in use
 * ({@link getSessionSummarySources}), without duplicates.
 */
export function getSessionSummaryWorkingDirectories(stateManager: AgentHostStateManager, session: ProtocolURI): readonly ProtocolURI[] | undefined {
	const state = stateManager.getSessionState(session);
	if (!state) {
		return undefined;
	}

	const workingDirectories: ProtocolURI[] = [];
	const seen = new Set<ProtocolURI>();
	for (const owner of [session, ...getSessionSummarySources(stateManager, session, stateManager.getDefaultChat(session))]) {
		for (const workingDirectory of getEffectiveWorkingDirectories(stateManager, owner) ?? []) {
			if (!seen.has(workingDirectory)) {
				seen.add(workingDirectory);
				workingDirectories.push(workingDirectory);
			}
		}
	}

	return workingDirectories.length ? workingDirectories : undefined;
}

export interface IAgentSessionConfigurationChangeEvent {
	readonly session: ProtocolURI;
	readonly config: Record<string, unknown>;
	readonly origin: ActionOrigin | undefined;
}

/**
 * A chat whose configuration is read or changed, with the session that owns
 * its configuration. The session is explicit so a chat can be configured
 * while it is being created, before the host has registered it.
 */
export interface IAgentChatConfigurationTarget {
	readonly session: ProtocolURI;
	readonly chat: ProtocolURI;
}

/** Fired for a chat whose effective configuration changed. */
export interface IAgentChatConfigurationChangeEvent {
	readonly session: ProtocolURI;
	readonly chat: ProtocolURI;
	/** The changed keys with the chat's new effective values. */
	readonly config: Record<string, unknown>;
	readonly origin: ActionOrigin | undefined;
}

/** The config values a chat being created starts with, live until the chat is registered. */
export interface IAgentChatConfigurationSeed extends IDisposable {
	/** The chat's own values, including changes made while it was being created. */
	readonly values: Readonly<Record<string, unknown>>;
}

/**
 * Cohesive read/write surface for agent-host configuration.
 *
 * All platform-layer consumers (tool auto-approval, side effects, future
 * host-config editors) should read and mutate config values through this
 * service rather than reaching into raw session state. The service owns
 * the `session → parent session → host` inheritance chain so that
 * host-level defaults, subagent inheritance, and per-session overrides
 * compose the same way everywhere.
 *
 * Reads go through a caller-supplied {@link ISchema}: each raw value is
 * validated against the property's schema before being returned, so a
 * malformed value in one layer transparently falls back to the next.
 */
export interface IAgentConfigurationService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires whenever a {@link ActionType.RootConfigChanged} action is
	 * processed by the state manager, signalling that callers should
	 * re-read any root config values they depend on.
	 */
	readonly onDidRootConfigChange: Event<void>;

	/** Fires whenever a session configuration change is processed. */
	readonly onDidSessionConfigChange: Event<IAgentSessionConfigurationChangeEvent>;

	/**
	 * Fires for every registered chat whose effective configuration changed:
	 * its own values, those of the chat it inherits from, or session values it
	 * does not set itself.
	 */
	readonly onDidChatConfigChange: Event<IAgentChatConfigurationChangeEvent>;

	/**
	 * Returns the effective value of `key` for `session`, walking the
	 * `session → parent session → host` chain and returning the first
	 * layer that provides a value which validates against
	 * `schema.definition[key]`. Layers that provide a malformed value
	 * are logged and skipped. Returns `undefined` when no layer provides
	 * a valid value.
	 */
	getEffectiveValue<D extends SchemaDefinition, K extends keyof D & string>(
		session: ProtocolURI,
		schema: ISchema<D>,
		key: K,
	): SchemaValue<D[K]> | undefined;

	/**
	 * Returns the effective value of `key` for a chat, walking the chat's own
	 * values, those of the chats it was spawned by (subagents), the session's
	 * and the host's. A chat's own values only count for properties the
	 * session's schema lets a chat set.
	 */
	getChatEffectiveValue<D extends SchemaDefinition, K extends keyof D & string>(
		target: IAgentChatConfigurationTarget,
		schema: ISchema<D>,
		key: K,
	): SchemaValue<D[K]> | undefined;

	/**
	 * Returns a chat's config values: the session's values with the chat's own
	 * values (and those of the chats it was spawned by) applied over them,
	 * i.e. every layer of {@link getChatEffectiveValue}'s chain but the host's,
	 * as {@link getSessionConfigValues} is to {@link getEffectiveValue}. A
	 * property only the host sets is absent; read it with
	 * {@link getChatEffectiveValue}. `undefined` when the session has no config.
	 */
	getChatConfigValues(target: IAgentChatConfigurationTarget): Record<string, unknown> | undefined;

	/** Returns the session's schema with the chat's effective values; `undefined` when the session has no config. */
	getChatConfigState(target: IAgentChatConfigurationTarget): SessionConfigState | undefined;

	/**
	 * Returns the values a chat sets for itself, restricted to properties a chat
	 * may set; for a subagent, those of the chat it inherits its values from.
	 */
	getChatOwnConfigValues(target: IAgentChatConfigurationTarget): Record<string, unknown>;

	/**
	 * Applies a config patch for a chat: properties a chat may set change that
	 * chat's own values (for a subagent, those of the chat it inherits from);
	 * every other property changes the session.
	 *
	 * A chat that is neither registered nor being created (see
	 * {@link seedChatConfig}) has no values to change: it was disposed or
	 * removed, typically while a provider event was in flight. Its part of the
	 * patch is dropped with a warning; the session part still applies.
	 */
	updateChatConfig(target: IAgentChatConfigurationTarget, patch: Record<string, unknown>): void;

	/**
	 * Gives a chat that is being created its initial own values, so reads and
	 * writes during its creation see them. Disposing ends the seed; the caller
	 * registers the chat with {@link IAgentChatConfigurationSeed.values}.
	 */
	seedChatConfig(chat: ProtocolURI, values: Readonly<Record<string, unknown>>): IAgentChatConfigurationSeed;

	/** Returns all effective session roots, including inherited parent-session roots. */
	getEffectiveWorkingDirectories(session: ProtocolURI): readonly string[] | undefined;

	/**
	 * Merges a partial config patch into a session's values via a
	 * {@link ActionType.SessionConfigChanged} action. Keys not present in
	 * `patch` are left untouched. The patch is applied atomically through
	 * the state manager's reducer.
	 */
	updateSessionConfig(session: ProtocolURI, patch: Record<string, unknown>): void;

	/**
	 * Maps a session, nested subagent session or registered chat to the
	 * top-level session that owns its configuration; `undefined` for a chat
	 * with no recorded owner.
	 */
	resolveConfigurationOwner(sessionOrChat: ProtocolURI): ProtocolURI | undefined;

	/** Runtime-resolved sandbox floor for this configuration owner. */
	getSessionSandboxPolicy(session: ProtocolURI): ISessionSandboxPolicy | undefined;
	setSessionSandboxPolicy(session: ProtocolURI, policy: ISessionSandboxPolicy): void;
	/**
	 * The applied enablement of the session's own sandbox selection: the default
	 * chat's applied enablement while it uses the session's selection, else the
	 * selection itself when it is `on` or `off`.
	 */
	getSessionSandboxEnabled(session: ProtocolURI): boolean | undefined;
	/** The last enablement a chat's runtime applied successfully, if known. */
	getChatSandboxEnabled(target: IAgentChatConfigurationTarget): boolean | undefined;
	/** The sessions and storages whose attachment snapshots the chat may read (see `AgentHostStateManager.getChatAttachmentScopes`). */
	getChatAttachmentScopes(target: IAgentChatConfigurationTarget): readonly ProtocolURI[];
	/** Records the enablement a chat's runtime applied, with an optional error for the client that requested it. */
	setChatSandboxEnabled(target: IAgentChatConfigurationTarget, enabled: boolean, error?: ISessionSandboxState['error']): void;
	/**
	 * Reports that a chat's runtime failed to apply the sandbox selection it read
	 * as `values` and rolls the selection back where it was set (the chat's own
	 * values or the session's), unless a newer selection superseded it.
	 */
	rejectChatSandboxChange(target: IAgentChatConfigurationTarget, values: Record<string, unknown> | undefined, origin: ActionOrigin, message: string): void;

	/**
	 * Returns the merged config values currently stored on `session`.
	 *
	 * Reflects the live state managed by the reducer: every
	 * {@link ActionType.SessionConfigChanged} action mutates these values
	 * before this method returns. Callers materializing a provisional session
	 * use this to read the user's latest selections without subscribing to
	 * the action stream themselves.
	 */
	getSessionConfigValues(session: ProtocolURI): Record<string, unknown> | undefined;

	/**
	 * Returns the host-level value for `key`, validating it against
	 * `schema.definition[key]`. Invalid persisted values are logged and treated
	 * as missing.
	 */
	getRootValue<D extends SchemaDefinition, K extends keyof D & string>(
		schema: ISchema<D>,
		key: K,
	): SchemaValue<D[K]> | undefined;

	/**
	 * Merges a partial config patch into the host-level value bag and persists
	 * the updated values for future agent-host lifetimes.
	 */
	updateRootConfig(patch: Record<string, unknown>, replace?: boolean): void;

	/**
	 * Persists the current host-level value bag without mutating it.
	 */
	persistRootConfig(): void;

	/**
	 * Resolves once any in-flight root-config write has settled.
	 */
	whenIdle(): Promise<void>;

	registerProviderConfiguration?(registration: IAgentCustomizationSettingsRegistration): void;
	getRootConfigValues?(): Readonly<Record<string, unknown>>;
	publishRootTransientValues?(patch: Readonly<Record<string, unknown>>): void;
}

export class AgentConfigurationService extends Disposable implements IAgentConfigurationService {
	declare readonly _serviceBrand: undefined;
	private _rootConfigWrite = Promise.resolve();
	private readonly _rootTransientValueKeys = new Set<string>();
	private readonly _sessionSandboxPolicies = new Map<ProtocolURI, ISessionSandboxPolicy>();
	/** Sessions and chats whose sandbox selection a client made last; a policy allowing bypass keeps their `off`. */
	private readonly _sessionSandboxUserSelections = new Set<ProtocolURI>();
	private readonly _chatSandboxUserSelections = new Set<ProtocolURI>();
	/** Rollbacks of a rejected sandbox selection, which keep the rejection reported. */
	private readonly _sandboxRollbackActions = new WeakSet<object>();

	private readonly _onDidRootConfigChange = this._register(new Emitter<void>());
	readonly onDidRootConfigChange: Event<void> = this._onDidRootConfigChange.event;
	private readonly _onDidSessionConfigChange = this._register(new Emitter<IAgentSessionConfigurationChangeEvent>());
	readonly onDidSessionConfigChange: Event<IAgentSessionConfigurationChangeEvent> = this._onDidSessionConfigChange.event;
	private readonly _onDidChatConfigChange = this._register(new Emitter<IAgentChatConfigurationChangeEvent>());
	readonly onDidChatConfigChange: Event<IAgentChatConfigurationChangeEvent> = this._onDidChatConfigChange.event;
	private readonly _chatConfigSeeds = new Map<ProtocolURI, { values: Record<string, unknown> }>();
	/** A chat's effective values with the inputs they were computed from, so unchanged inputs return the same object. */
	private readonly _chatValues = new Map<ProtocolURI, { readonly inputs: readonly unknown[]; readonly values: Record<string, unknown> }>();
	/** The keys the config change being reduced changed, by channel, until its envelope is processed. */
	private readonly _reducedChanges = new Map<ProtocolURI, readonly string[]>();
	/** A chat's effective values when its sandbox selection last changed; a rejection of older values is stale. */
	private readonly _chatSandboxChanges = new Map<ProtocolURI, Record<string, unknown> | undefined>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
		private readonly _rootConfigResource?: URI,
		providerConfigurations: readonly IAgentCustomizationSettingsRegistration[] = [],
	) {
		super();
		// Merge our customization schema/values into the existing root config
		// (which already carries platform properties like permissions) rather
		// than replacing it.
		const existing = this._stateManager.rootState.config;
		const ownSchema = agentHostCustomizationConfigSchema.toProtocol();
		const sandboxSchema = sandboxConfigSchema.toProtocol();
		const copilotCliSchema = copilotCliConfigSchema.toProtocol();
		const agentMergeSchema = agentMergeRootConfigSchema.toProtocol();
		const chatMoveSchema = chatMoveRootConfigSchema.toProtocol();
		const automationSchema = automationRootConfigSchema.toProtocol();
		this._stateManager.rootState.config = {
			schema: {
				type: 'object',
				properties: { ...existing?.schema.properties, ...ownSchema.properties, ...sandboxSchema.properties, ...copilotCliSchema.properties, ...agentMergeSchema.properties, ...chatMoveSchema.properties, ...automationSchema.properties },
			},
			values: { ...existing?.values, ...this._loadPersistedRootConfig() },
		};
		for (const registration of providerConfigurations) {
			this.registerProviderConfiguration(registration);
		}
		this._register(this._stateManager.onDidRemoveSession(session => {
			this._sessionSandboxPolicies.delete(session);
			this._sessionSandboxUserSelections.delete(session);
		}));
		// Reduction precedes the envelope and knows the previous values, so a replacement's removed keys are known too.
		this._register(this._stateManager.onDidChangeSessionConfig(event => this._reducedChanges.set(event.session.toString(), changedConfigKeys(event.previous?.values, event.current?.values))));
		this._register(this._stateManager.onDidChangeChatConfig(event => this._reducedChanges.set(event.chat.toString(), changedConfigKeys(event.previous?.values, event.current?.values))));
		this._register(this._stateManager.onDidUnregisterChat(({ chat }) => {
			this._chatValues.delete(chat);
			this._chatSandboxChanges.delete(chat);
			this._chatSandboxUserSelections.delete(chat);
		}));

		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.RootConfigChanged) {
				for (const session of this._stateManager.getSessionUris()) {
					this._publishSessionSandboxPolicy(session);
				}
				this._onDidRootConfigChange.fire();
			} else if (envelope.action.type === ActionType.SessionConfigChanged) {
				const sandboxConfigChanged = Object.hasOwn(envelope.action.config, SessionConfigKey.SandboxEnabled);
				if (sandboxConfigChanged && !this._sandboxRollbackActions.has(envelope.action)) {
					// A new selection for the chats that take the session's.
					this._clearSandboxRejectedSelections(envelope.channel, chat => !Object.hasOwn(this.getChatOwnConfigValues({ session: envelope.channel, chat }), SessionConfigKey.SandboxEnabled), true);
				}
				if (sandboxConfigChanged) {
					if (envelope.origin) {
						this._sessionSandboxUserSelections.add(envelope.channel);
					} else {
						this._sessionSandboxUserSelections.delete(envelope.channel);
					}
				}
				this._publishSessionSandboxPolicy(envelope.channel, !!envelope.origin);
				if (Object.hasOwn(envelope.action.config, SessionConfigKey.SandboxEnabled)) {
					this._recordSandboxChanges(envelope.channel, undefined);
				}
				this._fireSessionConfigChange({
					session: envelope.channel,
					config: envelope.action.config,
					origin: envelope.origin,
				}, this._changedKeys(envelope.channel, envelope.action.config));
			} else if (envelope.action.type === ActionType.ChatConfigChanged) {
				const session = this._stateManager.getChatOwner(envelope.channel);
				if (session !== undefined) {
					if (Object.hasOwn(envelope.action.config, SessionConfigKey.SandboxEnabled)) {
						if (!this._sandboxRollbackActions.has(envelope.action)) {
							const changed = envelope.channel;
							this._clearSandboxRejectedSelections(session, chat => chat === changed, this._stateManager.getDefaultChat(session) === changed);
						}
						if (envelope.origin) {
							this._chatSandboxUserSelections.add(envelope.channel);
						} else {
							this._chatSandboxUserSelections.delete(envelope.channel);
						}
						this._recordSandboxChanges(session, envelope.channel);
					}
					this._fireChatConfigChange(session, envelope.channel, this._changedKeys(envelope.channel, envelope.action.config), envelope.origin);
				}
			}
		}));
	}

	getEffectiveValue<D extends SchemaDefinition, K extends keyof D & string>(
		session: ProtocolURI,
		schema: ISchema<D>,
		key: K,
	): SchemaValue<D[K]> | undefined {
		return this._firstValid(this._effectiveChain(session), schema, key, session);
	}

	private _firstValid<D extends SchemaDefinition, K extends keyof D & string>(chain: Iterable<Record<string, unknown>>, schema: ISchema<D>, key: K, resource: ProtocolURI): SchemaValue<D[K]> | undefined {
		for (const values of chain) {
			const raw = values[key];
			if (raw === undefined) {
				continue;
			}
			try {
				schema.assertValid(key, raw);
				return raw;
			} catch (err) {
				const reason = err instanceof ProtocolError ? err.message : String(err);
				this._logService.warn(`[AgentConfigurationService] Value for '${key}' on ${resource} failed schema validation, falling back: ${reason}`);
			}
		}
		return undefined;
	}

	getEffectiveWorkingDirectories(session: ProtocolURI): readonly string[] | undefined {
		return getEffectiveWorkingDirectories(this._stateManager, session);
	}

	getChatEffectiveValue<D extends SchemaDefinition, K extends keyof D & string>(
		target: IAgentChatConfigurationTarget,
		schema: ISchema<D>,
		key: K,
	): SchemaValue<D[K]> | undefined {
		return this._firstValid(this._chatChain(target), schema, key, target.chat);
	}

	getChatConfigState(target: IAgentChatConfigurationTarget): SessionConfigState | undefined {
		const config = this._stateManager.getSessionState(target.session)?.config;
		const values = this.getChatConfigValues(target);
		return config && values && values !== config.values ? { schema: config.schema, values } : config;
	}

	getChatConfigValues(target: IAgentChatConfigurationTarget): Record<string, unknown> | undefined {
		const session = this._stateManager.getSessionState(target.session)?.config;
		if (!session) {
			return undefined;
		}
		const inputs = [target.session, session, ...[...this._chatAncestry(target.chat)].map(chat => this._ownChatValues(chat))];
		const cached = this._chatValues.get(target.chat);
		if (cached && cached.inputs.length === inputs.length && cached.inputs.every((input, index) => input === inputs[index])) {
			return cached.values;
		}
		const layers = [...this._chatLayers(target)];
		const values = layers.length === 0 ? session.values : applyChatConfigLayers(session.values, layers);
		this._chatValues.set(target.chat, { inputs, values });
		return values;
	}

	getChatOwnConfigValues(target: IAgentChatConfigurationTarget): Record<string, unknown> {
		const schema = this._stateManager.getSessionState(target.session)?.config?.schema;
		return filterChatConfigValues(schema, this._ownChatValues(this._configurableChat(target.chat)));
	}

	updateChatConfig(target: IAgentChatConfigurationTarget, patch: Record<string, unknown>): void {
		this._updateChatConfig(target, patch, false);
	}

	private _updateChatConfig(target: IAgentChatConfigurationTarget, patch: Record<string, unknown>, isSandboxRollback: boolean): void {
		const { chat, session } = splitChatConfigPatch(this._stateManager.getSessionState(target.session)?.config?.schema, patch);
		if (Object.keys(session).length > 0) {
			this.updateSessionConfig(target.session, session);
		}
		if (Object.keys(chat).length === 0) {
			return;
		}
		const owner = this._configurableChat(target.chat);
		const seed = this._chatConfigSeeds.get(owner);
		if (seed) {
			seed.values = { ...seed.values, ...chat };
			this._onDidChatConfigChange.fire({ session: target.session, chat: owner, config: this._effectiveValuesOf({ session: target.session, chat: owner }, Object.keys(chat)), origin: undefined });
		} else if (this._stateManager.getChatOwner(owner) !== undefined) {
			this._dispatchTagged(owner, { type: ActionType.ChatConfigChanged, config: chat }, isSandboxRollback);
		} else {
			this._logService.warn(`[AgentConfigurationService] Dropping config for unregistered chat ${owner}: ${Object.keys(chat).join(', ')}`);
		}
	}

	seedChatConfig(chat: ProtocolURI, values: Readonly<Record<string, unknown>>): IAgentChatConfigurationSeed {
		const seed = { values: { ...values } };
		this._chatConfigSeeds.set(chat, seed);
		const disposable = toDisposable(() => {
			if (this._chatConfigSeeds.get(chat) === seed) {
				this._chatConfigSeeds.delete(chat);
			}
		});
		return {
			get values() { return seed.values; },
			dispose: () => disposable.dispose(),
		};
	}

	/** The chat's own values, from its seed while it is being created. */
	private _ownChatValues(chat: ProtocolURI): Readonly<Record<string, unknown>> | undefined {
		return this._chatConfigSeeds.get(chat)?.values ?? this._stateManager.getChatConfig(chat)?.values;
	}

	/** The chat whose own values `chat` uses: the chat itself, or for a subagent the nearest ancestor that is not one. */
	private _configurableChat(chat: ProtocolURI): ProtocolURI {
		const seen = new Set<ProtocolURI>();
		let current = chat;
		while (!seen.has(current) && this._stateManager.getChatOrigin(current)?.kind === ChatOriginKind.Tool) {
			seen.add(current);
			const parent = this._stateManager.getChatParent(current);
			if (parent === undefined) {
				break;
			}
			current = parent;
		}
		return current;
	}

	/** The chat and the chats it was spawned by, innermost first, from the recorded spawn edges. */
	private *_chatAncestry(chat: ProtocolURI): Iterable<ProtocolURI> {
		const seen = new Set<ProtocolURI>();
		let current: ProtocolURI | undefined = chat;
		while (current !== undefined && !seen.has(current)) {
			seen.add(current);
			yield current;
			current = this._stateManager.getChatParent(current);
		}
	}

	/** The own values of the chat and of the chats it was spawned by, innermost first, restricted to properties a chat may set. */
	private *_chatLayers(target: IAgentChatConfigurationTarget): Iterable<Record<string, unknown>> {
		const schema = this._stateManager.getSessionState(target.session)?.config?.schema;
		for (const chat of this._chatAncestry(target.chat)) {
			const own = filterChatConfigValues(schema, this._ownChatValues(chat));
			if (Object.keys(own).length > 0) {
				yield own;
			}
		}
	}

	/** The value bags of a chat's effective config in precedence order: its layers, the session, the host. */
	private *_chatChain(target: IAgentChatConfigurationTarget): Iterable<Record<string, unknown>> {
		yield* this._chatLayers(target);
		yield* this._effectiveChain(target.session);
	}

	private _effectiveValuesOf(target: IAgentChatConfigurationTarget, keys: readonly string[]): Record<string, unknown> {
		const values = this.getChatConfigValues(target) ?? {};
		return Object.fromEntries(keys.map(key => [key, values[key]]));
	}

	/** The keys a config change touched: those it set and those whose value it changed (a replacement removes keys). */
	private _changedKeys(channel: ProtocolURI, config: Record<string, unknown>): string[] {
		const reduced = this._reducedChanges.get(channel) ?? [];
		this._reducedChanges.delete(channel);
		return [...new Set([...Object.keys(config), ...reduced])];
	}

	/** Fires the session event and, for every registered chat of the session, the chat event for the keys the chat does not set itself. */
	private _fireSessionConfigChange(event: IAgentSessionConfigurationChangeEvent, keys: readonly string[] = Object.keys(event.config)): void {
		this._onDidSessionConfigChange.fire(event);
		for (const chat of this._stateManager.getSessionState(event.session)?.chats ?? []) {
			const target = { session: event.session, chat: chat.resource };
			const overridden = new Set([...this._chatLayers(target)].flatMap(layer => Object.keys(layer)));
			const changed = keys.filter(key => !overridden.has(key));
			if (changed.length > 0) {
				this._onDidChatConfigChange.fire({ ...target, config: this._effectiveValuesOf(target, changed), origin: event.origin });
			}
		}
	}

	/** Fires the chat event for a chat and for every registered chat it spawned, directly or not. */
	private _fireChatConfigChange(session: ProtocolURI, chat: ProtocolURI, keys: readonly string[], origin: ActionOrigin | undefined): void {
		for (const summary of this._stateManager.getSessionState(session)?.chats ?? []) {
			if ([...this._chatAncestry(summary.resource)].includes(chat)) {
				const target = { session, chat: summary.resource };
				this._onDidChatConfigChange.fire({ ...target, config: this._effectiveValuesOf(target, keys), origin });
			}
		}
	}

	updateSessionConfig(session: ProtocolURI, patch: Record<string, unknown>): void {
		this._dispatchSessionConfigChange(session, patch, false);
	}

	private _dispatchSessionConfigChange(session: ProtocolURI, patch: Record<string, unknown>, isSandboxRollback: boolean): void {
		const action = {
			type: ActionType.SessionConfigChanged as const,
			config: patch,
		};
		this._dispatchTagged(session, action, isSandboxRollback);
	}

	private _dispatchTagged(channel: ProtocolURI, action: SessionConfigChangedAction | ChatConfigChangedAction, isSandboxRollback: boolean): void {
		if (isSandboxRollback) {
			this._sandboxRollbackActions.add(action);
		}
		try {
			this._stateManager.dispatchServerAction(channel, action);
		} finally {
			if (isSandboxRollback) {
				this._sandboxRollbackActions.delete(action);
			}
		}
	}

	/** Reconciles restored selections with current policy before notifying live provider runtimes. */
	restoreSessionConfig(session: ProtocolURI, config: SessionConfigState): void {
		this._stateManager.setSessionConfig(session, config);
		this._clearSandboxRejectedSelections(session, () => true, true);
		if (!this._publishSessionSandboxPolicy(session)) {
			this._fireSessionConfigChange({
				session,
				config: { ...config.values, [SessionConfigKey.SandboxEnabled]: config.values[SessionConfigKey.SandboxEnabled] },
				origin: undefined,
			});
		}
	}

	resolveConfigurationOwner(sessionOrChat: ProtocolURI): ProtocolURI | undefined {
		return resolveAgentHostSession(URI.parse(sessionOrChat), chat => this._stateManager.getChatOwner(chat))?.toString();
	}

	getSessionSandboxPolicy(session: ProtocolURI): ISessionSandboxPolicy | undefined {
		const owner = this.resolveConfigurationOwner(session);
		return owner === undefined ? undefined : this._sessionSandboxPolicies.get(owner);
	}

	setSessionSandboxPolicy(session: ProtocolURI, policy: ISessionSandboxPolicy): void {
		const owner = this.resolveConfigurationOwner(session);
		if (owner === undefined) {
			this._logService.trace(`[AgentConfigurationService] Ignoring sandbox policy for unknown chat: ${session}`);
			return;
		}
		session = owner;
		this._sessionSandboxPolicies.set(session, policy);
		this._publishSessionSandboxPolicy(session);
	}

	private _publishSessionSandboxPolicy(session: ProtocolURI, isUserChange = false): boolean {
		const state = this._stateManager.getSessionState(session);
		const previousPolicy = readSessionSandboxPolicy(state);
		const policy = this.getSessionSandboxPolicy(session);
		if (!state) {
			return false;
		}
		if (!state.config?.schema.properties[SessionConfigKey.SandboxEnabled] && !this._sessionSandboxPolicies.has(session)) {
			return false;
		}
		const policyChanged = !equals(previousPolicy, policy);
		if (policyChanged) {
			// A previously unmanaged Off is not an authorized bypass of a new floor.
			const meta = policy?.enabled && !previousPolicy?.enabled
				? withSessionSandboxState(state._meta, undefined)
				: state._meta;
			this._stateManager.setSessionMeta(session, withSessionSandboxPolicy(meta, policy));
		}
		// An `off` that the floor no longer allows becomes `on`, unless a client chose it and the policy allows bypassing the
		// floor (and has not changed since): a chat's own, like the session's below.
		for (const chat of state.chats) {
			const target = { session, chat: chat.resource };
			const preserveChatSelection = !policyChanged && this._chatSandboxUserSelections.has(chat.resource) && policy?.allowBypass === true;
			if (!policy?.failClosed && !preserveChatSelection && this._stateManager.getChatOrigin(chat.resource)?.kind !== ChatOriginKind.Tool
				&& this._stateManager.getChatConfig(chat.resource)?.values[SessionConfigKey.SandboxEnabled] === 'off'
				&& getSessionSandboxOverrides(this, target).enabled === AgentSandboxEnabledValue.On) {
				this.updateChatConfig(target, { [SessionConfigKey.SandboxEnabled]: AgentSandboxEnabledValue.On });
			}
		}
		const preserveSelection = (isUserChange || (!policyChanged && this._sessionSandboxUserSelections.has(session))) && policy?.allowBypass === true;
		if (!policy?.failClosed && !preserveSelection && this.getSessionConfigValues(session)?.[SessionConfigKey.SandboxEnabled] === 'off'
			&& resolveSandboxEnabled('off', policy, this.getSessionSandboxEnabled(session)) === AgentSandboxEnabledValue.On) {
			this.updateSessionConfig(session, { [SessionConfigKey.SandboxEnabled]: AgentSandboxEnabledValue.On });
			return true;
		}
		if (policyChanged) {
			this._fireSessionConfigChange({ session, config: { [SessionConfigKey.SandboxEnabled]: this.getSessionConfigValues(session)?.[SessionConfigKey.SandboxEnabled] }, origin: undefined });
		}
		return policyChanged;
	}

	getSessionSandboxEnabled(session: ProtocolURI): boolean | undefined {
		const defaultChat = this._stateManager.getDefaultChat(session);
		if (defaultChat !== undefined && !Object.hasOwn(this._stateManager.getChatConfig(defaultChat)?.values ?? {}, SessionConfigKey.SandboxEnabled)) {
			return readSessionSandboxState(this._stateManager.getSessionState(session))?.enabled;
		}
		const selection = this.getSessionConfigValues(session)?.[SessionConfigKey.SandboxEnabled];
		return selection === 'on' ? true : selection === 'off' ? false : undefined;
	}

	getChatAttachmentScopes(target: IAgentChatConfigurationTarget): readonly ProtocolURI[] {
		return [...new Set([target.session, ...this._stateManager.getChatAttachmentScopes(target.chat) ?? []])];
	}

	getChatSandboxEnabled(target: IAgentChatConfigurationTarget): boolean | undefined {
		return this._readChatSandboxState(target)?.enabled;
	}

	setChatSandboxEnabled(target: IAgentChatConfigurationTarget, enabled: boolean, error?: ISessionSandboxState['error']): void {
		const state = this._stateManager.getSessionState(target.session);
		if (!state) {
			return;
		}
		const previous = this._readChatSandboxState(target);
		if (previous?.enabled === enabled && !previous.error && !error && readChatSandboxState(state, target.chat)) {
			return;
		}
		// A rejected selection stays reported until a new one is made.
		this._writeChatSandboxState(target, { enabled, ...(previous?.rejectedSelection ? { rejectedSelection: true } : {}), ...(error ? { error } : {}) });
	}

	private _writeChatSandboxState(target: IAgentChatConfigurationTarget, next: ISessionSandboxState): void {
		const state = this._stateManager.getSessionState(target.session);
		if (!state) {
			return;
		}
		let meta = withChatSandboxState(state._meta, target.chat, next);
		// Older clients read the session-level state, which describes the default chat.
		if (this._stateManager.getDefaultChat(target.session) === target.chat) {
			meta = withSessionSandboxState(meta, next);
		}
		this._stateManager.setSessionMeta(target.session, meta);
	}

	/**
	 * Clears the reported rejection of the chats `affected` matches (a new
	 * selection supersedes it), and of the session-level state when
	 * `includeSessionLevel`.
	 */
	private _clearSandboxRejectedSelections(session: ProtocolURI, affected: (chat: ProtocolURI) => boolean, includeSessionLevel: boolean): void {
		const state = this._stateManager.getSessionState(session);
		if (!state) {
			return;
		}
		let meta = state._meta;
		const sessionLevel = readSessionSandboxState(state);
		if (includeSessionLevel && sessionLevel?.rejectedSelection) {
			meta = withSessionSandboxState(meta, { enabled: sessionLevel.enabled, ...(sessionLevel.error ? { error: sessionLevel.error } : {}) });
		}
		for (const { resource: chat } of state.chats) {
			const chatState = readChatSandboxState(state, chat);
			if (chatState?.rejectedSelection && affected(chat)) {
				meta = withChatSandboxState(meta, chat, { enabled: chatState.enabled, ...(chatState.error ? { error: chatState.error } : {}) });
			}
		}
		if (meta !== state._meta) {
			this._stateManager.setSessionMeta(session, meta);
		}
	}

	rejectChatSandboxChange(target: IAgentChatConfigurationTarget, values: Record<string, unknown> | undefined, origin: ActionOrigin, message: string): void {
		const previous = this._readChatSandboxState(target);
		if (!previous || this._chatSandboxChanges.get(target.chat) !== values) {
			return;
		}
		// Publish the failure before rollback so clients can notify before reconciling the toggle.
		this._writeChatSandboxState(target, {
			enabled: previous.enabled,
			rejectedSelection: true,
			error: { clientId: origin.clientId, clientSeq: origin.clientSeq, message },
		});
		const rollback = { [SessionConfigKey.SandboxEnabled]: previous.enabled ? 'on' : 'off' };
		if (Object.hasOwn(this.getChatOwnConfigValues(target), SessionConfigKey.SandboxEnabled)) {
			this._updateChatConfig(target, rollback, true);
		} else {
			this._dispatchSessionConfigChange(target.session, rollback, true);
		}
	}

	/**
	 * Records the values each affected chat had when a sandbox selection changed:
	 * the chat that changed it (or, for a session change, every chat without its
	 * own selection) and the chats it spawned.
	 */
	private _recordSandboxChanges(session: ProtocolURI, changedChat: ProtocolURI | undefined): void {
		for (const summary of this._stateManager.getSessionState(session)?.chats ?? []) {
			const target = { session, chat: summary.resource };
			const affected = changedChat !== undefined
				? [...this._chatAncestry(summary.resource)].includes(changedChat)
				: !Object.hasOwn(this.getChatOwnConfigValues(target), SessionConfigKey.SandboxEnabled);
			if (affected) {
				this._chatSandboxChanges.set(summary.resource, this.getChatConfigValues(target));
			}
		}
	}

	/** A chat's applied sandbox state; the default chat falls back to the session-level state older builds wrote. */
	private _readChatSandboxState(target: IAgentChatConfigurationTarget): ISessionSandboxState | undefined {
		const state = this._stateManager.getSessionState(target.session);
		return readChatSandboxState(state, target.chat)
			?? (this._stateManager.getDefaultChat(target.session) === target.chat ? readSessionSandboxState(state) : undefined);
	}

	getSessionConfigValues(session: ProtocolURI): Record<string, unknown> | undefined {
		if (isAhpChatChannel(session)) {
			throw new Error(`Expected a session URI, received chat channel ${session}`);
		}
		return this._stateManager.getSessionState(session)?.config?.values;
	}

	getRootValue<D extends SchemaDefinition, K extends keyof D & string>(
		schema: ISchema<D>,
		key: K,
	): SchemaValue<D[K]> | undefined {
		const root = this._stateManager.rootState.config?.values;
		const raw = root?.[key];
		if (raw === undefined) {
			return undefined;
		}
		try {
			schema.assertValid(key, raw);
			return raw;
		} catch (err) {
			const reason = err instanceof ProtocolError ? err.message : String(err);
			this._logService.warn(`[AgentConfigurationService] Host value for '${key}' failed schema validation, ignoring: ${reason}`);
			return undefined;
		}
	}

	updateRootConfig(patch: Record<string, unknown>, replace = false): void {
		this._stateManager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: patch,
			replace,
		});
		this.persistRootConfig();
	}

	persistRootConfig(): void {
		if (!this._rootConfigResource) {
			return;
		}

		const values = { ...(this._stateManager.rootState.config?.values ?? { [AgentHostConfigKey.Customizations]: [] }) };
		for (const key of this._rootTransientValueKeys) {
			delete values[key];
		}
		for (const key of getProviderBackedRootConfigKeys(this._stateManager.rootState)) {
			delete values[key];
		}
		const content = JSON.stringify(values, undefined, '\t');
		const resource = this._rootConfigResource;

		this._rootConfigWrite = this._rootConfigWrite
			.catch(err => {
				this._logService.warn('[AgentConfigurationService] Previous host config write failed', err);
			})
			.then(async () => {
				await fs.promises.mkdir(dirname(resource.fsPath), { recursive: true });
				await fs.promises.writeFile(resource.fsPath, `${content}\n`, 'utf8');
			})
			.catch(err => {
				this._logService.error(`[AgentConfigurationService] Failed to persist host config to ${resource.fsPath}`, err);
			});
	}

	async whenIdle(): Promise<void> {
		await this._rootConfigWrite;
	}

	registerProviderConfiguration(registration: IAgentCustomizationSettingsRegistration): void {
		const config = this._stateManager.rootState.config;
		if (!config) {
			return;
		}
		Object.assign(config.schema.properties, registration.properties);
		for (const [key, property] of Object.entries(registration.properties)) {
			if (config.values[key] === undefined && property.default !== undefined) {
				config.values[key] = property.default;
			}
		}
		const registrations = getAgentCustomizationSettingsEntries(this._stateManager.rootState).filter(entry => entry.provider !== registration.provider);
		this._stateManager.rootState._meta = withAgentCustomizationSettings(this._stateManager.rootState, [...registrations, {
			provider: registration.provider,
			title: registration.title,
			description: registration.description,
			settings: registration.settings,
			configurationFile: registration.configurationFile,
		}]);
	}

	getRootConfigValues(): Readonly<Record<string, unknown>> {
		return this._stateManager.rootState.config?.values ?? {};
	}

	publishRootTransientValues(patch: Readonly<Record<string, unknown>>): void {
		for (const key of Object.keys(patch)) {
			this._rootTransientValueKeys.add(key);
		}
		this._stateManager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { ...patch },
		});
	}

	/**
	 * Yields the raw value bags that contribute to the effective config
	 * for `session`, in precedence order: session, host. A chat inherits from
	 * the chat that spawned it through its recorded spawn edge, never through
	 * the shape of a URI (see {@link _chatChain}).
	 */
	private *_effectiveChain(session: ProtocolURI): Iterable<Record<string, unknown>> {
		const own = this._stateManager.getSessionState(session)?.config?.values;
		if (own) {
			yield own;
		}
		const host = this._stateManager.rootState.config?.values;
		if (host) {
			yield host;
		}
	}

	private _loadPersistedRootConfig(): Record<string, unknown> {
		const defaults = defaultAgentHostCustomizationConfigValues;
		if (!this._rootConfigResource) {
			return { ...defaults };
		}

		try {
			// eslint-disable-next-line local/code-no-sync-fs -- TODO: load configuration before service construction; dependent services read root settings immediately and must not initialize from defaults pending I/O.
			const raw = fs.readFileSync(this._rootConfigResource.fsPath, 'utf8');
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			return {
				...this._loadPersistedPlatformRootConfig(parsed),
				...agentHostCustomizationConfigSchema.validateOrDefault(parsed, defaults),
				...sandboxConfigSchema.validateOrDefault(parsed, {}),
				...copilotCliConfigSchema.validateOrDefault(parsed, {}),
				...agentMergeRootConfigSchema.validateOrDefault(parsed, {}),
				...chatMoveRootConfigSchema.validateOrDefault(parsed, {}),
				...automationRootConfigSchema.validateOrDefault(parsed, {}),
				...agentHostProxyConfigSchema.validateOrDefault(parsed, {}),
			};
		} catch (err) {
			const code = err && typeof err === 'object' && hasKey(err, { code: true }) ? String(err.code) : undefined;
			if (code !== 'ENOENT') {
				this._logService.warn(`[AgentConfigurationService] Failed to read host config from ${this._rootConfigResource.fsPath}: ${err instanceof Error ? err.message : String(err)}`);
			}
			return { ...defaults };
		}
	}

	/**
	 * Restores the platform-owned half of the persisted bag. The host reads
	 * some of these before any client connects (`showExternalSessions`, the
	 * migrate-legacy gate, provider enablement), so without this a restart
	 * runs its first pass against the schema default.
	 */
	private _loadPersistedPlatformRootConfig(parsed: Record<string, unknown>): Record<string, unknown> {
		const values: Record<string, unknown> = { ...platformRootSchema.validateOrDefault(parsed, {}) };
		// Approval and policy values are a snapshot of one client's settings and
		// are re-pushed on every connect, so restoring them could re-grant an
		// approval that was tightened while the host was stopped.
		for (const key of clientOwnedApprovalRootConfigKeys) {
			delete values[key];
		}
		return values;
	}
}

function changedConfigKeys(previous: Readonly<Record<string, unknown>> | undefined, current: Readonly<Record<string, unknown>> | undefined): string[] {
	return [...new Set([...Object.keys(previous ?? {}), ...Object.keys(current ?? {})])].filter(key => !equals(previous?.[key], current?.[key]));
}
