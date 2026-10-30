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
import { generateUuid } from '../../../base/common/uuid.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSandboxEnabledValue } from '../../sandbox/common/settings.js';
import { resolveAgentHostSession } from '../common/agentHostSubscriptionService.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema, defaultAgentHostCustomizationConfigValues } from '../common/agentHostCustomizationConfig.js';
import { getAgentCustomizationSettingsEntries, getProviderBackedRootConfigKeys, withAgentCustomizationSettings, type IAgentCustomizationSettingsRegistration } from '../common/agentCustomizationSettings.js';
import { copilotCliConfigSchema } from '../common/copilotCliConfig.js';
import { agentMergeRootConfigSchema, readAgentMergeInjectedConfiguration, withoutAgentMergeElevation } from '../common/agentMerge.js';
import { chatMoveRootConfigSchema } from '../common/agentHostChatMove.js';
import { ChatProvidersConfigKey, chatProvidersRootConfigSchema } from '../common/agentHostChatProviders.js';
import { AgentHostMultipleChatProvidersEnabledEnvVar } from '../common/agentService.js';
import { automationRootConfigSchema } from '../common/automationConfig.js';
import { sandboxConfigSchema } from '../common/sandboxConfigSchema.js';
import { agentHostProxyConfigSchema, clientOwnedApprovalRootConfigKeys, platformRootSchema, type ISchema, type SchemaDefinition, type SchemaValue } from '../common/agentHostSchema.js';
import { ProtocolError } from '../common/state/sessionProtocol.js';
import { ActionType, type ActionOrigin } from '../common/state/sessionActions.js';
import type { ChatConfigChangedAction, SessionConfigChangedAction } from '../common/state/protocol/actions.js';
import type { SessionConfigSchema } from '../common/state/protocol/commands.js';
import { ChatOriginKind, isAhpChatChannel, parseSubagentSessionUri, readSessionWorkspaceless, ROOT_STATE_URI, type SessionConfigState, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { applyChatConfigLayers, filterChatConfigValues, getCompleteChatConfigValues, getEffectiveChatConfig, isChatConfigProperty, splitChatConfigPatch, withChatSchemaDefaults } from '../common/sessionConfigProperties.js';
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

/**
 * The `ChatConfigChanged` actions the host dispatches to complete a chat's values, or to publish what a session's
 * default chat takes from its session: they change no chat's effective config.
 */
const chatConfigCompletionActions = new WeakSet<object>();

/** The completion actions that leave a chat's own (persisted) values unchanged. */
const ownConfigUnchangedActions = new WeakSet<object>();

/**
 * Whether `action` leaves the values a chat persists unchanged: it only publishes what a session's default chat takes
 * from its session (for example once its session's config is restored), so persisting it again would write the same row.
 */
export function isChatOwnConfigUnchanged(action: object): boolean {
	return ownConfigUnchangedActions.has(action);
}

/** Whether `action` only completes a chat's values or publishes what a default chat takes from its session. */
export function isChatConfigCompletion(action: object): boolean {
	return chatConfigCompletionActions.has(action);
}

/**
 * Seeds the host's root `multipleChatProviders.enabled` from {@link AgentHostMultipleChatProvidersEnabledEnvVar}, which
 * the local starters set when the setting is on, before the host's first handshake: the first `initialize` then
 * advertises `multipleChatProviders` and the client needn't re-initialize. Only turns it on: the client's mirror of the
 * setting stays authoritative afterwards, and with the setting off nothing is forwarded, so nothing changes.
 */
export function seedMultipleChatProvidersFromEnvironment(configurationService: IAgentConfigurationService, env: Readonly<Record<string, string | undefined>>): void {
	if (env[AgentHostMultipleChatProvidersEnabledEnvVar] === 'true' && configurationService.getRootValue(chatProvidersRootConfigSchema, ChatProvidersConfigKey.Enabled) !== true) {
		configurationService.updateRootConfig({ [ChatProvidersConfigKey.Enabled]: true });
	}
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
	seedChatConfig(chat: ProtocolURI, values: Readonly<Record<string, unknown>>, schema?: SessionConfigSchema): IAgentChatConfigurationSeed;

	/**
	 * Gives the chats of `session` that were registered before its config was known their complete values (a chat's
	 * values are its complete config: the session's config never changes them).
	 */
	completeChatConfigs(session: ProtocolURI): void;

	/**
	 * The complete values of a chat of `session` whose own values are `own`: the session's values of the properties a
	 * chat may set (without Agent Merge's elevation and host-reported read-only ones), with `own` over them.
	 */
	getCompleteChatConfigValues(session: ProtocolURI, own: Readonly<Record<string, unknown>>): Record<string, unknown>;

	/**
	 * The values of a chat to persist: its published values, except a session's default chat's that its session gives
	 * it (which follow the session).
	 */
	getChatPersistedConfigValues(chat: ProtocolURI): Readonly<Record<string, unknown>> | undefined;

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
	/** Records or transfers applied enablement and errors; enablement can be unknown before the first successful update. */
	setChatSandboxEnabled(target: IAgentChatConfigurationTarget, enabled: boolean | undefined, error?: ISessionSandboxState['error']): void;
	/** Reports a background conflict without changing the last confirmed enablement or the requested selection. */
	reportChatSandboxConflict(target: IAgentChatConfigurationTarget, message: string): void;
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
	/**
	 * Chats whose `ChatState.config` values are their complete config. A chat registered before its session has config,
	 * or restored from an older build's overlay, is completed once its session's config is known (see
	 * {@link _completeChatConfig}); until then its values apply over the session's, as older builds read them.
	 */
	private readonly _completedChats = new Set<ProtocolURI>();
	/**
	 * The properties a session's default chat publishes from its session rather than sets itself. The session's config
	 * is its default chat's, as older clients and the session-level pickers and policies write it: the default chat
	 * takes the session's values of the properties it has not set, and publishes them so its values are complete.
	 */
	private readonly _inheritedChatKeys = new Map<ProtocolURI, Set<string>>();
	/** A default chat's own values, by its published values. */
	private readonly _ownValues = new WeakMap<object, Record<string, unknown>>();
	/** Whether chat values were complete when last checked (see {@link _onDidChangeChatValuesComplete}). */
	private _wasChatValuesComplete: boolean | undefined;
	/** How many live seeds carry their own schema. */
	private _chatSchemaSeeds = 0;
	private readonly _chatConfigSeeds = new Map<ProtocolURI, { values: Record<string, unknown>; readonly schema?: SessionConfigSchema }>();
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
		const chatProvidersSchema = chatProvidersRootConfigSchema.toProtocol();
		const automationSchema = automationRootConfigSchema.toProtocol();
		this._stateManager.rootState.config = {
			schema: {
				type: 'object',
				properties: { ...existing?.schema.properties, ...ownSchema.properties, ...sandboxSchema.properties, ...copilotCliSchema.properties, ...agentMergeSchema.properties, ...chatMoveSchema.properties, ...chatProvidersSchema.properties, ...automationSchema.properties },
			},
			values: { ...existing?.values, ...this._loadPersistedRootConfig() },
		};
		for (const registration of providerConfigurations) {
			this.registerProviderConfiguration(registration);
		}
		this._wasChatValuesComplete = this._chatValuesComplete;
		this._register(this._stateManager.onDidRemoveSession(session => {
			this._sessionSandboxPolicies.delete(session);
			this._sessionSandboxUserSelections.delete(session);
		}));
		// Reduction precedes the envelope and knows the previous values, so a replacement's removed keys are known too.
		this._register(this._stateManager.onDidChangeSessionConfig(event => this._reducedChanges.set(event.session.toString(), changedConfigKeys(event.previous?.values, event.current?.values))));
		this._register(this._stateManager.onDidChangeChatConfig(event => this._reducedChanges.set(event.chat.toString(), changedConfigKeys(event.previous?.values, event.current?.values))));
		this._register(this._stateManager.onDidRegisterChat(({ chat, session }) => {
			// After the registration: the chat is announced with the values it was registered with.
			queueMicrotask(() => {
				if (!this._store.isDisposed && this._stateManager.getChatOwner(chat) === session) {
					this._completeChatConfig(session, chat);
				}
			});
		}));
		this._register(this._stateManager.onDidChangeChatOwner(({ chat, current }) => {
			// A default chat that moves becomes a peer: what it took from its session is its own from then on.
			if (this._stateManager.getDefaultChat(current) !== chat && this._inheritedChatKeys.delete(chat)) {
				this._completedChats.add(chat);
			}
		}));
		this._register(this._stateManager.onDidUnregisterChat(({ chat }) => {
			this._completedChats.delete(chat);
			this._inheritedChatKeys.delete(chat);
			this._chatValues.delete(chat);
			this._chatSandboxChanges.delete(chat);
			this._chatSandboxUserSelections.delete(chat);
		}));

		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.RootConfigChanged) {
				this._onDidChangeChatValuesComplete();
				for (const session of this._stateManager.getSessionUris()) {
					this._publishSessionSandboxPolicy(session);
				}
				this._onDidRootConfigChange.fire();
			} else if (envelope.action.type === ActionType.SessionConfigChanged) {
				const clearedDefaultChatKeys = this._clearDefaultChatOwnValues(envelope.channel, envelope.action.replace ? [...new Set([...Object.keys(envelope.action.config), ...(this._reducedChanges.get(envelope.channel) ?? [])])] : Object.keys(envelope.action.config));
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
				const changedKeys = this._changedKeys(envelope.channel, envelope.action.config);
				// The session may have just got its config: the chats registered before it take theirs now.
				this.completeChatConfigs(envelope.channel);
				this._fireSessionConfigChange({
					session: envelope.channel,
					config: envelope.action.config,
					origin: envelope.origin,
				}, changedKeys);
				this._syncDefaultChatConfig(envelope.channel, clearedDefaultChatKeys);
			} else if (envelope.action.type === ActionType.ChatConfigChanged) {
				const session = this._stateManager.getChatOwner(envelope.channel);
				if (chatConfigCompletionActions.has(envelope.action)) {
					// Completing a chat's values changes none of its effective values.
					this._changedKeys(envelope.channel, envelope.action.config);
				} else if (session !== undefined) {
					const inherited = this._inheritedChatKeys.get(envelope.channel);
					if (inherited) {
						// What a default chat sets is its own from here on; a replacement leaves it only what it sets.
						for (const key of envelope.action.replace ? [...inherited] : Object.keys(envelope.action.config)) {
							inherited.delete(key);
						}
						if (envelope.action.replace) {
							queueMicrotask(() => {
								if (!this._store.isDisposed) {
									this._syncDefaultChatConfig(session);
								}
							});
						}
					}
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
		return this._firstValid(this._chatChain(target, key), schema, key, target.chat);
	}

	getChatConfigState(target: IAgentChatConfigurationTarget): SessionConfigState | undefined {
		const own = this._ownChatSchema(target.chat);
		if (own) {
			return { schema: own.schema, values: this.getChatConfigValues(target)! };
		}
		const config = this._stateManager.getSessionState(target.session)?.config;
		const values = this.getChatConfigValues(target);
		return config && values && values !== config.values ? { schema: config.schema, values } : config;
	}

	getChatConfigValues(target: IAgentChatConfigurationTarget): Record<string, unknown> | undefined {
		const own = this._ownChatSchema(target.chat);
		if (own) {
			// A chat whose agent differs from its session's has its own config: it does not inherit the session's.
			const inputs = [own.schema, ...[...this._chatAncestry(target.chat)].map(chat => this._ownChatValues(chat))];
			const cached = this._chatValues.get(target.chat);
			if (cached && cached.inputs.length === inputs.length && cached.inputs.every((input, index) => input === inputs[index])) {
				return cached.values;
			}
			const values = applyChatConfigLayers(withChatSchemaDefaults(own.schema, undefined), [...this._chatLayers(target)]);
			this._chatValues.set(target.chat, { inputs, values });
			return values;
		}
		const session = this._stateManager.getSessionState(target.session)?.config;
		if (!session) {
			return undefined;
		}
		const complete = this._isChatConfigComplete(target.chat);
		const inputs = [target.session, session, complete, ...[...this._chatAncestry(target.chat)].map(chat => this._ownChatValues(chat))];
		const cached = this._chatValues.get(target.chat);
		if (cached && cached.inputs.length === inputs.length && cached.inputs.every((input, index) => input === inputs[index])) {
			return cached.values;
		}
		let values: Record<string, unknown>;
		if (complete) {
			// The chat's values are its complete config; only session-wide properties come from the session.
			values = getEffectiveChatConfig(session, { values: this._ownChatValues(this._configurableChat(target.chat)) ?? {} }).values;
		} else {
			const layers = [...this._chatLayers(target)];
			values = layers.length === 0 ? session.values : applyChatConfigLayers(session.values, layers);
		}
		this._chatValues.set(target.chat, { inputs, values });
		return values;
	}

	getChatOwnConfigValues(target: IAgentChatConfigurationTarget): Record<string, unknown> {
		return filterChatConfigValues(this._chatSchema(target), this._ownChatValues(this._configurableChat(target.chat)));
	}

	updateChatConfig(target: IAgentChatConfigurationTarget, patch: Record<string, unknown>): void {
		this._updateChatConfig(target, patch, false);
	}

	private _updateChatConfig(target: IAgentChatConfigurationTarget, patch: Record<string, unknown>, isSandboxRollback: boolean): void {
		const ownSchema = this._ownChatSchema(target.chat)?.schema;
		const { chat, session } = splitChatConfigPatch(ownSchema ?? this._stateManager.getSessionState(target.session)?.config?.schema, patch);
		if (Object.keys(session).length > 0) {
			if (ownSchema) {
				// The session's agent owns the session's config; a chat with its own agent never changes it.
				this._logService.warn(`[AgentConfigurationService] Dropping config the schema of chat ${target.chat} does not have: ${Object.keys(session).join(', ')}`);
			} else {
				this.updateSessionConfig(target.session, session);
			}
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

	seedChatConfig(chat: ProtocolURI, values: Readonly<Record<string, unknown>>, schema?: SessionConfigSchema): IAgentChatConfigurationSeed {
		const seed = { values: { ...values }, schema };
		this._chatConfigSeeds.set(chat, seed);
		if (schema) {
			this._chatSchemaSeeds++;
		}
		const disposable = toDisposable(() => {
			if (schema) {
				this._chatSchemaSeeds--;
			}
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
		const seed = this._chatConfigSeeds.get(chat)?.values;
		if (seed) {
			return seed;
		}
		const values = this._stateManager.getChatConfig(chat)?.values;
		const inherited = this._inheritedChatKeys.get(chat);
		if (!values || !inherited || inherited.size === 0) {
			return values;
		}
		const cached = this._ownValues.get(values);
		if (cached) {
			return cached;
		}
		const own = Object.fromEntries(Object.entries(values).filter(([key]) => !inherited.has(key)));
		this._ownValues.set(values, own);
		return own;
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

	/**
	 * The own values of the chat and of the chats it was spawned by, innermost first, restricted to properties a chat
	 * may set. A chat with its own agent ends the chain: it does not take values of chats of another agent.
	 */
	private *_chatLayers(target: IAgentChatConfigurationTarget): Iterable<Record<string, unknown>> {
		const own = this._ownChatSchema(target.chat);
		const schema = own?.schema ?? this._stateManager.getSessionState(target.session)?.config?.schema;
		for (const chat of this._chatAncestry(target.chat)) {
			const values = filterChatConfigValues(schema, this._ownChatValues(chat));
			if (Object.keys(values).length > 0) {
				yield values;
			}
			if (chat === own?.chat) {
				return;
			}
		}
	}

	/**
	 * The value bags of a chat's effective config for `key`, in precedence order. A chat's values are its complete
	 * config, so a property it may set comes from its values, its schema's default and the host, never the session; a
	 * session-wide property comes from the session and the host. A chat with its own agent takes everything from its
	 * own values and schema. A chat whose values are not complete yet still applies them over the session's.
	 */
	private *_chatChain(target: IAgentChatConfigurationTarget, key: string): Iterable<Record<string, unknown>> {
		const host = this._stateManager.rootState.config?.values;
		const own = this._ownChatSchema(target.chat);
		if (own) {
			yield* this._chatLayers(target);
			yield withChatSchemaDefaults(own.schema, undefined);
			if (host) {
				yield host;
			}
			return;
		}
		if (!this._isChatConfigComplete(target.chat)) {
			yield* this._chatLayers(target);
			yield* this._effectiveChain(target.session);
			return;
		}
		const schema = this._stateManager.getSessionState(target.session)?.config?.schema;
		if (!isChatConfigProperty(schema, key)) {
			yield* this._effectiveChain(target.session);
			return;
		}
		yield filterChatConfigValues(schema, this._ownChatValues(this._configurableChat(target.chat)));
		yield withChatSchemaDefaults({ type: 'object', properties: { [key]: schema!.properties[key] } }, undefined);
		if (host) {
			yield host;
		}
	}

	/**
	 * Whether a chat's values are its complete config: only while chats may use their own agents (the root
	 * `multipleChatProviders.enabled`). Otherwise a chat's values are an overlay on its session's, as before: a property
	 * it didn't set follows its session, and the host neither completes, mirrors nor rewrites any chat's values.
	 */
	private get _chatValuesComplete(): boolean {
		return this.getRootValue(chatProvidersRootConfigSchema, ChatProvidersConfigKey.Enabled) === true;
	}

	/**
	 * Follows the setting at runtime. Turned on: the loaded chats take their complete values now (unloaded ones when
	 * restored). Turned off: chats read their values as overlays again, which complete values remain valid as; a session's
	 * default chat publishes only its own values again, so it follows its session, and nothing is written.
	 */
	private _onDidChangeChatValuesComplete(): void {
		const complete = this._chatValuesComplete;
		const previous = this._wasChatValuesComplete;
		this._wasChatValuesComplete = complete;
		if (previous === undefined || previous === complete) {
			return;
		}
		if (complete) {
			for (const session of this._stateManager.getSessionUris()) {
				this.completeChatConfigs(session);
			}
			return;
		}
		this._completedChats.clear();
		for (const [chat, inherited] of [...this._inheritedChatKeys]) {
			this._inheritedChatKeys.delete(chat);
			const values = this._stateManager.getChatConfig(chat)?.values;
			if (!values || inherited.size === 0 || this._stateManager.getChatOwner(chat) === undefined) {
				continue;
			}
			const action = { type: ActionType.ChatConfigChanged as const, config: Object.fromEntries(Object.entries(values).filter(([key]) => !inherited.has(key))), replace: true };
			chatConfigCompletionActions.add(action);
			ownConfigUnchangedActions.add(action);
			this._stateManager.dispatchServerAction(chat, action);
		}
	}

	/** Whether the chat `chat` takes its config from has complete values (always so for a chat with its own agent). */
	private _isChatConfigComplete(chat: ProtocolURI): boolean {
		const configurable = this._configurableChat(chat);
		if (this._ownChatSchema(configurable) !== undefined) {
			return true;
		}
		if (!this._chatValuesComplete) {
			return false;
		}
		// A session's default chat follows its session for what it has not set itself, also one a move promoted.
		const owner = this._stateManager.getChatOwner(configurable);
		return this._completedChats.has(configurable) && (owner === undefined || this._stateManager.getDefaultChat(owner) !== configurable);
	}

	/**
	 * Completes the values of the chats of `session` registered before its config was known, or restored from an
	 * older build's overlay (see {@link _completeChatConfig}).
	 */
	completeChatConfigs(session: ProtocolURI): void {
		for (const chat of this._stateManager.getSessionState(session)?.chats ?? []) {
			this._completeChatConfig(session, chat.resource);
		}
	}

	/**
	 * Makes a chat's values its complete config, once, as soon as its session has config: the session's values of the
	 * properties a chat may set, with the chat's own values over them. A chat created with complete values, or one
	 * completed by an earlier run, changes at most by properties its session's schema gained since. Subagents have no
	 * values of their own, and a chat with its own agent is complete from its creation.
	 */
	private _completeChatConfig(session: ProtocolURI, chat: ProtocolURI): void {
		if (!this._chatValuesComplete) {
			// A chat's values are an overlay on its session's, as before chats could use their own agents.
			return;
		}
		if (this._stateManager.getDefaultChat(session) === chat) {
			this._syncDefaultChatConfig(session);
			return;
		}
		if (this._completedChats.has(chat) || this._stateManager.getChatOrigin(chat)?.kind === ChatOriginKind.Tool || this._ownChatSchema(chat)) {
			return;
		}
		const config = this._stateManager.getSessionState(session)?.config;
		if (!config) {
			return;
		}
		this._completedChats.add(chat);
		if (this._chatConfigSeeds.has(chat)) {
			// A chat being created is registered with the complete values it was seeded with.
			return;
		}
		const own = this._ownChatValues(chat) ?? {};
		const complete = this.getCompleteChatConfigValues(session, own);
		const patch = Object.fromEntries(Object.entries(complete).filter(([key, value]) => !Object.hasOwn(own, key) || !equals(own[key], value)));
		// Every chat of a session with config publishes its config, even with no values.
		if (Object.keys(patch).length === 0 && this._stateManager.getChatConfig(chat) !== undefined) {
			return;
		}
		const action = { type: ActionType.ChatConfigChanged as const, config: patch };
		chatConfigCompletionActions.add(action);
		this._stateManager.dispatchServerAction(chat, action);
	}

	/**
	 * A session config write changes the session's default chat too: the default chat's own values of the written
	 * properties it may set are dropped, so it takes the session's again (session-level pickers are its pickers). Peers,
	 * forks and side chats keep theirs. Host-reported (read-only) properties are not the default chat's choice and stay.
	 * Returns whether any own value was dropped.
	 */
	private _clearDefaultChatOwnValues(session: ProtocolURI, keys: readonly string[]): boolean {
		if (!this._chatValuesComplete) {
			return false;
		}
		const chat = this._stateManager.getDefaultChat(session);
		const schema = this._stateManager.getSessionState(session)?.config?.schema;
		const values = chat === undefined ? undefined : this._stateManager.getChatConfig(chat)?.values;
		if (chat === undefined || !schema || !values || this._ownChatSchema(chat) || this._chatConfigSeeds.has(chat)) {
			return false;
		}
		const own = this._ownChatValues(chat) ?? {};
		const cleared = keys.filter(key => isChatConfigProperty(schema, key) && schema.properties[key]?.readOnly !== true && Object.hasOwn(own, key));
		if (cleared.length === 0) {
			return false;
		}
		let inherited = this._inheritedChatKeys.get(chat);
		if (!inherited) {
			inherited = new Set();
			this._inheritedChatKeys.set(chat, inherited);
		}
		for (const key of cleared) {
			inherited.add(key);
		}
		// The own values are cached by the published ones, which have not changed yet.
		this._ownValues.delete(values);
		if (cleared.includes(SessionConfigKey.SandboxEnabled)) {
			this._chatSandboxUserSelections.delete(chat);
		}
		return true;
	}

	getChatPersistedConfigValues(chat: ProtocolURI): Readonly<Record<string, unknown>> | undefined {
		return this._chatConfigSeeds.has(chat) ? this._stateManager.getChatConfig(chat)?.values : this._ownChatValues(chat);
	}

	getCompleteChatConfigValues(session: ProtocolURI, own: Readonly<Record<string, unknown>>): Record<string, unknown> {
		const config = this._stateManager.getSessionState(session)?.config;
		if (!config || !this._chatValuesComplete) {
			return { ...own };
		}
		// Agent Merge's elevation belongs to the session, not to a copy in a chat.
		const values = withoutAgentMergeElevation(config.values, readAgentMergeInjectedConfiguration(config.values));
		return getCompleteChatConfigValues({ schema: config.schema, values: { ...values } }, own);
	}

	/**
	 * Publishes a session's default chat's complete values: the session's values of the properties a chat may set that
	 * the default chat has not set itself, with its own over them (see {@link _inheritedChatKeys}).
	 */
	private _syncDefaultChatConfig(session: ProtocolURI, force = false): void {
		if (!this._chatValuesComplete) {
			return;
		}
		const chat = this._stateManager.getDefaultChat(session);
		if (chat === undefined || !this._stateManager.getSessionState(session)?.config || this._stateManager.getChatOwner(chat) === undefined || this._ownChatSchema(chat)) {
			return;
		}
		const own = this._ownChatValues(chat) ?? {};
		const inheritedValues = Object.fromEntries(Object.entries(this.getCompleteChatConfigValues(session, {})).filter(([key]) => !Object.hasOwn(own, key)));
		const next = { ...inheritedValues, ...own };
		const current = this._stateManager.getChatConfig(chat)?.values;
		this._inheritedChatKeys.set(chat, new Set(Object.keys(inheritedValues)));
		// Forced when the chat's own values changed but its published ones did not, so that they are persisted.
		if (!force && current && equals(current, next)) {
			return;
		}
		const action = { type: ActionType.ChatConfigChanged as const, config: next, replace: true };
		chatConfigCompletionActions.add(action);
		if (!force) {
			// Its own values are unchanged: only what it takes from its session is published, which is never persisted.
			ownConfigUnchangedActions.add(action);
		}
		this._stateManager.dispatchServerAction(chat, action);
	}

	/**
	 * The chat whose agent differs from its session's that `chat` takes its config from, with its own schema: the chat
	 * itself or the chat that spawned it. `undefined` when the chat uses its session's config.
	 */
	private _ownChatSchema(chat: ProtocolURI): { readonly chat: ProtocolURI; readonly schema: SessionConfigSchema } | undefined {
		if (this._chatSchemaSeeds === 0 && !this._stateManager.hasChatsWithOwnConfigSchema()) {
			// No chat uses an agent other than its session's (always the case behind the off setting).
			return undefined;
		}
		for (const candidate of this._chatAncestry(chat)) {
			const schema = this._chatConfigSeeds.get(candidate)?.schema ?? this._stateManager.getChatOwnConfigSchema(candidate);
			if (schema) {
				return { chat: candidate, schema };
			}
		}
		return undefined;
	}

	/** The schema of the properties of a chat's config: its own, or the session's. */
	private _chatSchema(target: IAgentChatConfigurationTarget): SessionConfigSchema | undefined {
		return this._ownChatSchema(target.chat)?.schema ?? this._stateManager.getSessionState(target.session)?.config?.schema;
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
			if (this._ownChatSchema(chat.resource)) {
				// A chat with its own agent does not take the session's values.
				continue;
			}
			// A chat with complete values takes only the session-wide properties from its session.
			const schema = this._stateManager.getSessionState(event.session)?.config?.schema;
			const changed = this._isChatConfigComplete(chat.resource)
				? keys.filter(key => !isChatConfigProperty(schema, key))
				: (overridden => keys.filter(key => !overridden.has(key)))(new Set([...this._chatLayers(target)].flatMap(layer => Object.keys(layer))));
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
		// Chats restored from an older build's overlay of their own values take their complete values now.
		this.completeChatConfigs(session);
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
			// Retain confirmed Off only when the new floor permits bypass.
			const meta = policy?.enabled && !previousPolicy?.enabled && policy.allowBypass !== true
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
				&& this._ownChatValues(chat.resource)?.[SessionConfigKey.SandboxEnabled] === 'off'
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
		if (defaultChat !== undefined && !Object.hasOwn(this._ownChatValues(defaultChat) ?? {}, SessionConfigKey.SandboxEnabled)) {
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

	setChatSandboxEnabled(target: IAgentChatConfigurationTarget, enabled: boolean | undefined, error?: ISessionSandboxState['error']): void {
		const state = this._stateManager.getSessionState(target.session);
		if (!state) {
			return;
		}
		const previous = this._readChatSandboxState(target);
		if (previous && previous.enabled === enabled && !previous.error && !error && readChatSandboxState(state, target.chat)) {
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

	reportChatSandboxConflict(target: IAgentChatConfigurationTarget, message: string): void {
		const previous = this._readChatSandboxState(target);
		if (previous?.error && hasKey(previous.error, { id: true }) && previous.error.message === message) {
			return;
		}
		this._writeChatSandboxState(target, { ...previous, error: { id: generateUuid(), message } });
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
		if (previous?.enabled === undefined || this._chatSandboxChanges.get(target.chat) !== values) {
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
				...chatProvidersRootConfigSchema.validateOrDefault(parsed, {}),
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
