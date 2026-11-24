/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { Event } from '../../../../../../base/common/event.js';
import { hash } from '../../../../../../base/common/hash.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../../base/common/objects.js';
import { AgentHostByokCustomEndpointDirectSettingId, AgentHostByokModelsEnabledSettingId, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostClientConnectionKind } from '../../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { CUSTOM_ENDPOINT_BYOK_VENDOR, CUSTOM_ENDPOINT_MODEL_SOURCE_FORMAT, findCustomEndpointModelSettings, getCustomEndpointModelSourceCredentialResource, toCustomEndpointModelSourceModel, type CustomEndpointModelSourceDefinition, type CustomEndpointModelSourceModel } from '../../../../../../platform/agentHost/common/byokCustomEndpoint.js';
import { ModelSourceRetentionPolicy, ModelSourceStatus, type ModelSourceRegistration, type RootState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, AuthRequiredReason } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { AhpErrorCodes, AuthenticateTargetKind, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { ROOT_STATE_URI } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { ChatEntitlementContextKeys, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { getLanguageModelSecretStorageKey, getModelContextWindowTotal, ILanguageModelsService } from '../../../common/languageModels.js';
import { ILanguageModelsConfigurationService } from '../../../common/languageModelsConfiguration.js';

/** A Custom Endpoint provider group this window registers with each agent host that reads its format. */
export interface ICustomEndpointModelSource {
	readonly group: string;
	readonly definition: CustomEndpointModelSourceDefinition;
	/** Identifies the group's stored API key without revealing it, so a replaced key is delivered again. */
	readonly credentialVersion: string | undefined;
}

/** The registration ID of a Custom Endpoint provider group for one agent provider. */
export function getCustomEndpointModelSourceId(provider: string, group: string): string {
	return `vscode.customendpoint/${encodeURIComponent(provider)}/${encodeURIComponent(group)}`;
}

/** Whether this window registers its Custom Endpoint provider groups with agent hosts. */
export function areCustomEndpointModelSourcesEnabled(configurationService: IConfigurationService, chatEntitlementService: IChatEntitlementService): boolean {
	return chatEntitlementService.clientByokEnabled
		&& configurationService.getValue<boolean>(AgentHostByokCustomEndpointDirectSettingId) === true
		&& configurationService.getValue<boolean>(AgentHostByokModelsEnabledSettingId) !== false;
}

/**
 * The window's Custom Endpoint provider groups as model sources, each with the
 * models the runtime can call the way the Copilot extension does. A group with
 * none, or whose key is written into the settings file, is left out.
 */
export function getCustomEndpointModelSources(languageModelsService: ILanguageModelsService, languageModelsConfigurationService: ILanguageModelsConfigurationService, logService: ILogService): ICustomEndpointModelSource[] {
	const configuredGroups = languageModelsConfigurationService.getLanguageModelsProviderGroups();
	const sources: ICustomEndpointModelSource[] = [];
	for (const { group, modelIdentifiers } of languageModelsService.getLanguageModelGroups(CUSTOM_ENDPOINT_BYOK_VENDOR)) {
		// The configuration file has the group's current settings, including a replaced key.
		const configured = group && configuredGroups.find(candidate => candidate.vendor === CUSTOM_ENDPOINT_BYOK_VENDOR && candidate.name === group.name);
		if (!configured) {
			continue;
		}
		// A key written into the settings file is not read from secret storage, so it is never forwarded.
		const secretKey = getLanguageModelSecretStorageKey(configured.apiKey);
		if (configured.apiKey !== undefined && !secretKey) {
			logService.trace(`[AgentHostModelSourceRegistrar] Custom Endpoint group ${configured.name} keeps using the bridge: its API key is not stored securely`);
			continue;
		}
		const models: CustomEndpointModelSourceModel[] = [];
		for (const identifier of modelIdentifiers) {
			const metadata = languageModelsService.lookupLanguageModel(identifier);
			const settings = metadata && findCustomEndpointModelSettings(configured, metadata.id);
			if (!metadata || !settings) {
				continue;
			}
			const reasoningEffortSchema = metadata.configurationSchema?.properties?.reasoningEffort;
			const entry = toCustomEndpointModelSourceModel(metadata.id, settings, {
				name: metadata.name,
				maxInputTokens: metadata.maxInputTokens,
				maxOutputTokens: metadata.maxOutputTokens,
				maxContextWindowTokens: getModelContextWindowTotal(metadata),
				reasoningEfforts: reasoningEffortSchema?.enum?.filter((value): value is string => typeof value === 'string'),
				defaultReasoningEffort: typeof reasoningEffortSchema?.default === 'string' ? reasoningEffortSchema.default : undefined,
			});
			if (entry.model) {
				models.push(entry.model);
			} else {
				logService.trace(`[AgentHostModelSourceRegistrar] ${identifier} keeps using the bridge: ${entry.bridgeReason}`);
			}
		}
		if (models.length) {
			sources.push({
				group: configured.name,
				definition: { models, requiresApiKey: secretKey !== undefined },
				credentialVersion: secretKey ? hash(secretKey).toString(16) : undefined,
			});
		}
	}
	return sources;
}

/**
 * Registers the window's Custom Endpoint BYOK provider groups with every
 * connected agent host whose agent reads {@link CUSTOM_ENDPOINT_MODEL_SOURCE_FORMAT},
 * and delivers each group's API key when the host asks for it. The host's agent
 * then calls the endpoints directly. Models the runtime can't call the way the
 * Copilot extension does are left out, and keep using the window's bridge.
 */
export class AgentHostModelSourceRegistrar extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostModelSourceRegistrar';

	private readonly _connections = this._register(new DisposableMap<IAgentConnection, ConnectionModelSourceRegistrar>());
	private _sources: readonly ICustomEndpointModelSource[] = [];

	constructor(
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILanguageModelsConfigurationService private readonly _languageModelsConfigurationService: ILanguageModelsConfigurationService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const byokContextKeys = new Set([ChatEntitlementContextKeys.clientByokEnabled.key]);
		this._register(Event.any(
			Event.debounce(this._languageModelsService.onDidChangeLanguageModels, () => undefined, 500),
			this._languageModelsConfigurationService.onDidChangeLanguageModelGroups,
			Event.filter(contextKeyService.onDidChangeContext, event => event.affectsSome(byokContextKeys)),
			Event.filter(this._configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(AgentHostByokCustomEndpointDirectSettingId) || event.affectsConfiguration(AgentHostByokModelsEnabledSettingId)),
		)(() => this._update()));
		this._register(this._connectionsService.onDidChangeConnections(() => this._updateConnections()));
		this._update();
	}

	private _update(): void {
		this._sources = areCustomEndpointModelSourcesEnabled(this._configurationService, this._chatEntitlementService)
			? getCustomEndpointModelSources(this._languageModelsService, this._languageModelsConfigurationService, this._logService)
			: [];
		this._updateConnections();
	}

	private _updateConnections(): void {
		const live = new Set(this._connectionsService.connections.flatMap(info => info.connection ? [info.connection] : []));
		for (const connection of [...this._connections.keys()]) {
			if (!live.has(connection)) {
				this._connections.deleteAndDispose(connection);
			}
		}
		for (const connection of live) {
			let registrar = this._connections.get(connection);
			if (!registrar) {
				registrar = new ConnectionModelSourceRegistrar(connection, source => this._resolveApiKey(source), this._logService);
				this._connections.set(connection, registrar);
			}
			registrar.setSources(this._sources);
		}
	}

	/** The group's current API key, if the window may still deliver it. */
	private async _resolveApiKey(source: ICustomEndpointModelSource): Promise<string | undefined> {
		if (!this._sources.includes(source)) {
			return undefined;
		}
		const apiKey = await this._languageModelsService.resolveLanguageModelsProviderGroupApiKey(CUSTOM_ENDPOINT_BYOK_VENDOR, source.group);
		// The key or the policy changed while it was read: the next update delivers the right key, if any.
		const current = this._sources.find(candidate => candidate.group === source.group);
		if (!this._chatEntitlementService.clientByokEnabled || current?.credentialVersion !== source.credentialVersion) {
			return undefined;
		}
		return apiKey || undefined;
	}
}

/** The registrations and credential deliveries of this window on one agent host connection. */
class ConnectionModelSourceRegistrar extends Disposable {

	/** The registrations this window dispatched, by ID, so it only replaces one after a local change. */
	private readonly _registered = new Map<string, ModelSourceRegistration>();
	/** Registrations the host rejected; not dispatched again until they change. */
	private readonly _rejected = new Map<string, ModelSourceRegistration>();
	/** Registrations this window dispatched whose echo hasn't arrived: root state doesn't show them yet. */
	private readonly _inFlight = new Set<string>();
	/** The credential version this window last delivered for each registration, and the nonce it answered. */
	private readonly _delivered = new Map<string, { readonly credentialVersion: string | undefined; readonly nonce: string }>();
	private readonly _pending = this._register(new DisposableStore());
	private _sources: readonly ICustomEndpointModelSource[] = [];

	constructor(
		private readonly _connection: IAgentConnection,
		private readonly _resolveApiKey: (source: ICustomEndpointModelSource) => Promise<string | undefined>,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(this._connection.rootState.onDidChange(() => this._sync()));
	}

	setSources(sources: readonly ICustomEndpointModelSource[]): void {
		this._sources = sources;
		this._sync();
	}

	private _sync(): void {
		const root = this._connection.rootState.value;
		if (!root || root instanceof Error) {
			return;
		}
		const desired = this._desiredRegistrations(root);
		const current = new Map((root.modelSourceRegistrations ?? []).map(registration => [registration.id, registration]));
		for (const id of [...this._registered.keys()]) {
			if (!desired.has(id)) {
				this._registered.delete(id);
				this._rejected.delete(id);
				this._delivered.delete(id);
				this._inFlight.delete(id);
				if (current.has(id)) {
					this._connection.dispatch(ROOT_STATE_URI, { type: ActionType.RootModelSourceRegistrationRemoved, id });
				}
			}
		}
		for (const [id, { registration, source }] of desired) {
			const existing = current.get(id);
			const previous = this._registered.get(id);
			const rejected = this._rejected.get(id);
			if (rejected && equals(rejected, registration)) {
				continue;
			}
			// Another client may have registered the same group: replace it only after a change here,
			// or when it is gone, so windows with different copies of a group don't take turns.
			if (!previous || !equals(previous, registration)) {
				this._dispatchRegistration(registration);
			} else if (!existing) {
				if (!this._inFlight.has(id)) {
					this._dispatchRegistration(registration);
				}
			} else {
				this._deliverCredential(existing, registration, source);
			}
		}
	}

	private _desiredRegistrations(root: RootState): Map<string, { readonly registration: ModelSourceRegistration; readonly source: ICustomEndpointModelSource }> {
		const desired = new Map<string, { readonly registration: ModelSourceRegistration; readonly source: ICustomEndpointModelSource }>();
		// The local host is shared by this user's windows, so its sources outlive the window that registered them.
		const retention = this._connection.clientConnectionKind === AgentHostClientConnectionKind.Local ? ModelSourceRetentionPolicy.Host : ModelSourceRetentionPolicy.ContributingClient;
		for (const agent of root.agents) {
			if (!agent.capabilities?.modelSourceRegistration?.formats.includes(CUSTOM_ENDPOINT_MODEL_SOURCE_FORMAT)) {
				continue;
			}
			for (const source of this._sources) {
				const id = getCustomEndpointModelSourceId(agent.provider, source.group);
				desired.set(id, {
					source,
					registration: {
						id,
						provider: agent.provider,
						displayName: source.group,
						format: CUSTOM_ENDPOINT_MODEL_SOURCE_FORMAT,
						definition: source.definition,
						clientId: this._connection.clientId,
						retention,
					},
				});
			}
		}
		return desired;
	}

	private _dispatchRegistration(registration: ModelSourceRegistration): void {
		this._registered.set(registration.id, registration);
		this._delivered.delete(registration.id);
		this._inFlight.add(registration.id);
		const isCurrent = () => equals(this._registered.get(registration.id), registration);
		this._connection.dispatchConfirmed(ROOT_STATE_URI, this._connection.rootState, { type: ActionType.RootModelSourceRegistrationSet, registration }, CancellationToken.None).then(envelope => {
			if (!isCurrent()) {
				return;
			}
			this._inFlight.delete(registration.id);
			if (envelope.rejectionReason) {
				this._logService.warn(`[AgentHostModelSourceRegistrar] The agent host declined the Custom Endpoint group ${registration.displayName}: ${envelope.rejectionReason}`);
				this._rejected.set(registration.id, registration);
			} else if (!this._store.isDisposed) {
				// Picks up a registration removed again before its echo arrived.
				this._sync();
			}
		}, error => {
			if (isCurrent()) {
				// The next root state update, such as a reconnect, registers it again.
				this._inFlight.delete(registration.id);
			}
			this._logService.warn(`[AgentHostModelSourceRegistrar] Failed to register the Custom Endpoint group ${registration.displayName}: ${toErrorMessage(error)}`);
		});
	}

	/**
	 * Sends the group's key when the host asks for one, or when the key was
	 * replaced since this window last sent it. Never answers a registration whose
	 * definition differs from this window's copy, or a challenge for a key the
	 * host reported as expired with the key it already has.
	 */
	private _deliverCredential(existing: ModelSourceRegistration, registration: ModelSourceRegistration, source: ICustomEndpointModelSource): void {
		const nonce = existing.credentialNonce;
		const resource = existing.credentialResource?.resource;
		const state = existing.state;
		if (!source.definition.requiresApiKey || nonce === undefined || resource === undefined || !state
			|| existing.provider !== registration.provider || existing.format !== registration.format || !equals(existing.definition, registration.definition)
			|| resource !== getCustomEndpointModelSourceCredentialResource(source.definition)?.resource) {
			return;
		}
		const delivered = this._delivered.get(existing.id);
		if (delivered?.nonce === nonce && delivered.credentialVersion === source.credentialVersion) {
			return;
		}
		// An expired key is never sent again: only a key replaced since this window sent one.
		const replaced = delivered !== undefined && delivered.credentialVersion !== source.credentialVersion;
		const requested = state.kind === ModelSourceStatus.AuthRequired && (state.reason === AuthRequiredReason.Required || replaced);
		if (!requested && !(state.kind === ModelSourceStatus.Ready && replaced)) {
			return;
		}
		this._delivered.set(existing.id, { credentialVersion: source.credentialVersion, nonce });
		const store = this._pending.add(new DisposableStore());
		this._resolveApiKey(source).then(async apiKey => {
			if (!apiKey || store.isDisposed) {
				return;
			}
			await this._connection.authenticate({
				resource,
				token: apiKey,
				target: { kind: AuthenticateTargetKind.ModelSource, modelSourceId: existing.id, credentialNonce: nonce },
			});
		}).catch(error => {
			// A changed registration fences the stale nonce; the next root state update asks again.
			if (!(error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict)) {
				this._logService.warn(`[AgentHostModelSourceRegistrar] Failed to deliver the API key of the Custom Endpoint group ${registration.displayName}: ${toErrorMessage(error)}`);
			}
		}).finally(() => this._pending.delete(store));
	}
}
