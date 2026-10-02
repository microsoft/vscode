/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
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
import { automationRootConfigSchema } from '../common/automationConfig.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey, sandboxConfigSchema } from '../common/sandboxConfigSchema.js';
import { agentHostProxyConfigSchema, clientOwnedApprovalRootConfigKeys, platformRootSchema, type ISchema, type SchemaDefinition, type SchemaValue } from '../common/agentHostSchema.js';
import { ProtocolError } from '../common/state/sessionProtocol.js';
import { ActionType, type ActionOrigin } from '../common/state/sessionActions.js';
import { isAhpChatChannel, parseSubagentSessionUri, ROOT_STATE_URI, type SessionConfigState, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import type { IAgentHostManagedSettingsService } from './agentHostManagedSettingsService.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { type ISessionSandboxPolicy, readSessionSandboxPolicy, withSessionSandboxPolicy } from '../common/meta/agentSandboxPolicyMeta.js';
import { ISessionSandboxState, readSessionSandboxState, withSessionSandboxState } from '../common/meta/agentSandboxStateMeta.js';
import { getSessionSandboxOverrides } from './sessionSandbox.js';

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
	const own = stateManager.getSessionState(session)?.workingDirectories;
	if (own !== undefined) {
		return own;
	}
	const parentInfo = parseSubagentSessionUri(session);
	if (parentInfo) {
		return stateManager.getSessionState(parentInfo.parentSession.toString())?.workingDirectories;
	}
	return undefined;
}

export interface IAgentSessionConfigurationChangeEvent {
	readonly session: ProtocolURI;
	readonly config: Record<string, unknown>;
	readonly origin: ActionOrigin | undefined;
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

	/** Returns all effective session roots, including inherited parent-session roots. */
	getEffectiveWorkingDirectories(session: ProtocolURI): readonly string[] | undefined;

	/**
	 * Merges a partial config patch into a session's values via a
	 * {@link ActionType.SessionConfigChanged} action. Keys not present in
	 * `patch` are left untouched. The patch is applied atomically through
	 * the state manager's reducer.
	 */
	updateSessionConfig(session: ProtocolURI, patch: Record<string, unknown>): void;

	/** Effective runtime and forwarded VS Code sandbox floor for this configuration owner. */
	getSessionSandboxPolicy(session: ProtocolURI): ISessionSandboxPolicy | undefined;
	setSessionSandboxPolicy(session: ProtocolURI, policy: ISessionSandboxPolicy): void;
	getSessionSandboxEnabled(session: ProtocolURI): boolean | undefined;
	setSessionSandboxEnabled(session: ProtocolURI, enabled: boolean, error?: ISessionSandboxState['error']): void;
	rejectSessionSandboxChange(session: ProtocolURI, values: Record<string, unknown> | undefined, origin: ActionOrigin, message: string): void;

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
	private readonly _sessionSandboxChanges = new Map<ProtocolURI, Record<string, unknown> | undefined>();

	private readonly _onDidRootConfigChange = this._register(new Emitter<void>());
	readonly onDidRootConfigChange: Event<void> = this._onDidRootConfigChange.event;
	private readonly _onDidSessionConfigChange = this._register(new Emitter<IAgentSessionConfigurationChangeEvent>());
	readonly onDidSessionConfigChange: Event<IAgentSessionConfigurationChangeEvent> = this._onDidSessionConfigChange.event;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
		private readonly _rootConfigResource?: URI,
		providerConfigurations: readonly IAgentCustomizationSettingsRegistration[] = [],
		private readonly _managedSettingsService?: IAgentHostManagedSettingsService,
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
		const automationSchema = automationRootConfigSchema.toProtocol();
		this._stateManager.rootState.config = {
			schema: {
				type: 'object',
				properties: { ...existing?.schema.properties, ...ownSchema.properties, ...sandboxSchema.properties, ...copilotCliSchema.properties, ...agentMergeSchema.properties, ...automationSchema.properties },
			},
			values: { ...existing?.values, ...this._loadPersistedRootConfig() },
		};
		for (const registration of providerConfigurations) {
			this.registerProviderConfiguration(registration);
		}
		this._register(this._stateManager.onDidRemoveSession(session => {
			this._sessionSandboxPolicies.delete(session);
			this._sessionSandboxChanges.delete(session);
		}));
		if (this._managedSettingsService) {
			this._register(this._managedSettingsService.onDidChangeSandboxRequired(() => {
				for (const session of this._stateManager.getSessionUris()) {
					this._publishSessionSandboxPolicy(session);
				}
			}));
		}

		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.RootConfigChanged) {
				for (const session of this._stateManager.getSessionUris()) {
					this._publishSessionSandboxPolicy(session);
				}
				this._onDidRootConfigChange.fire();
			} else if (envelope.action.type === ActionType.SessionConfigChanged) {
				this._publishSessionSandboxPolicy(envelope.channel);
				if (Object.hasOwn(envelope.action.config, SessionConfigKey.SandboxEnabled)) {
					this._sessionSandboxChanges.set(envelope.channel, this.getSessionConfigValues(envelope.channel));
				}
				this._onDidSessionConfigChange.fire({
					session: envelope.channel,
					config: envelope.action.config,
					origin: envelope.origin,
				});
			}
		}));
	}

	getEffectiveValue<D extends SchemaDefinition, K extends keyof D & string>(
		session: ProtocolURI,
		schema: ISchema<D>,
		key: K,
	): SchemaValue<D[K]> | undefined {
		for (const values of this._effectiveChain(session)) {
			const raw = values[key];
			if (raw === undefined) {
				continue;
			}
			try {
				schema.assertValid(key, raw);
				return raw;
			} catch (err) {
				const reason = err instanceof ProtocolError ? err.message : String(err);
				this._logService.warn(`[AgentConfigurationService] Value for '${key}' on ${session} failed schema validation, falling back: ${reason}`);
			}
		}
		return undefined;
	}

	getEffectiveWorkingDirectories(session: ProtocolURI): readonly string[] | undefined {
		return getEffectiveWorkingDirectories(this._stateManager, session);
	}

	updateSessionConfig(session: ProtocolURI, patch: Record<string, unknown>): void {
		this._stateManager.dispatchServerAction(session, {
			type: ActionType.SessionConfigChanged,
			config: patch,
		});
	}

	/** Reconciles restored selections with current policy before notifying live provider runtimes. */
	restoreSessionConfig(session: ProtocolURI, config: SessionConfigState): void {
		this._stateManager.setSessionConfig(session, config);
		if (!this._publishSessionSandboxPolicy(session)) {
			this._onDidSessionConfigChange.fire({
				session,
				config: { ...config.values, [SessionConfigKey.SandboxEnabled]: config.values[SessionConfigKey.SandboxEnabled] },
				origin: undefined,
			});
		}
	}

	getSessionSandboxPolicy(session: ProtocolURI): ISessionSandboxPolicy | undefined {
		const owner = resolveAgentHostSession(URI.parse(session)).toString();
		const runtimePolicy = this._sessionSandboxPolicies.get(owner);
		const sandbox = this.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox);
		// Windows uses its own enablement setting, not ChatAgentSandboxEnabled.
		if (process.platform === 'win32' || !this._managedSettingsService?.sandboxRequired) {
			return runtimePolicy;
		}
		const runtimeAllowsBypass = runtimePolicy?.allowBypass !== false
			&& (!runtimePolicy?.enabled || runtimePolicy.allowBypass === true);
		return {
			...runtimePolicy,
			enabled: true,
			allowBypass: runtimeAllowsBypass && sandbox?.[AgentHostSandboxKey.AllowUnsandboxedCommands] === true,
			// A known VS Code requirement must not offer the runtime's retry-Off path for unresolved policy.
			...(runtimePolicy?.failClosed ? { failClosed: false } : {}),
		};
	}

	setSessionSandboxPolicy(session: ProtocolURI, policy: ISessionSandboxPolicy): void {
		session = resolveAgentHostSession(URI.parse(session)).toString();
		this._sessionSandboxPolicies.set(session, policy);
		this._publishSessionSandboxPolicy(session);
	}

	private _publishSessionSandboxPolicy(session: ProtocolURI): boolean {
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
		if (!policy?.failClosed && this.getSessionConfigValues(session)?.[SessionConfigKey.SandboxEnabled] === 'off'
			&& getSessionSandboxOverrides(this, session).enabled === AgentSandboxEnabledValue.On) {
			this.updateSessionConfig(session, { [SessionConfigKey.SandboxEnabled]: AgentSandboxEnabledValue.On });
			return true;
		}
		if (policyChanged) {
			this._onDidSessionConfigChange.fire({ session, config: { [SessionConfigKey.SandboxEnabled]: this.getSessionConfigValues(session)?.[SessionConfigKey.SandboxEnabled] }, origin: undefined });
		}
		return policyChanged;
	}

	getSessionSandboxEnabled(session: ProtocolURI): boolean | undefined {
		return readSessionSandboxState(this._stateManager.getSessionState(session))?.enabled;
	}

	setSessionSandboxEnabled(session: ProtocolURI, enabled: boolean, error?: ISessionSandboxState['error']): void {
		const state = this._stateManager.getSessionState(session);
		const previous = readSessionSandboxState(state);
		if (previous?.enabled === enabled && !previous.error && !error) {
			return;
		}
		this._stateManager.setSessionMeta(session, withSessionSandboxState(state?._meta, { enabled, ...(error ? { error } : {}) }));
	}

	rejectSessionSandboxChange(session: ProtocolURI, values: Record<string, unknown> | undefined, origin: ActionOrigin, message: string): void {
		const state = this._stateManager.getSessionState(session);
		const previous = readSessionSandboxState(state);
		if (!previous || this._sessionSandboxChanges.get(session) !== values) {
			return;
		}
		// Publish the failure before rollback so clients can notify before reconciling the toggle.
		this._stateManager.setSessionMeta(session, withSessionSandboxState(state?._meta, {
			enabled: previous.enabled,
			error: { clientId: origin.clientId, clientSeq: origin.clientSeq, message },
		}));
		this.updateSessionConfig(session, { [SessionConfigKey.SandboxEnabled]: previous.enabled ? 'on' : 'off' });
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
	 * for `session`, in precedence order: session, parent subagent
	 * session (if any), host.
	 */
	private *_effectiveChain(session: ProtocolURI): Iterable<Record<string, unknown>> {
		const own = this._stateManager.getSessionState(session)?.config?.values;
		if (own) {
			yield own;
		}
		const parentInfo = parseSubagentSessionUri(session);
		if (parentInfo) {
			const parent = this._stateManager.getSessionState(parentInfo.parentSession.toString())?.config?.values;
			if (parent) {
				yield parent;
			}
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
			const raw = fs.readFileSync(this._rootConfigResource.fsPath, 'utf8');
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			return {
				...this._loadPersistedPlatformRootConfig(parsed),
				...agentHostCustomizationConfigSchema.validateOrDefault(parsed, defaults),
				...sandboxConfigSchema.validateOrDefault(parsed, {}),
				...copilotCliConfigSchema.validateOrDefault(parsed, {}),
				...agentMergeRootConfigSchema.validateOrDefault(parsed, {}),
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
