/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { hash } from '../../../../../../base/common/hash.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../../base/common/objects.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostByokDirectEndpointsSettingId, AgentHostByokModelsEnabledSettingId, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService, type IAgentHostConnectionInfo } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostClientConnectionKind } from '../../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { CUSTOM_ENDPOINT_BYOK_VENDOR, findCustomEndpointModelSettings, resolveCustomEndpointRuntimeEndpoint, type CustomEndpointRuntimeEndpointResolution, type ICustomEndpointModelSettings } from '../../../../../../platform/agentHost/common/byokCustomEndpoint.js';
import { getOllamaByokEndpoint, OPENROUTER_BYOK_ENDPOINT, resolveAzureRuntimeEndpoint, resolveCustomOAIRuntimeEndpoint, XAI_BYOK_ENDPOINT } from '../../../../../../platform/agentHost/common/byokVendorEndpoints.js';
import { BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT, getByokEndpointsCredentialOrigins, getByokEndpointsCredentialResource, getByokModelSourceId, getByokModelSourceNamespace, parseByokModelSourceId, readByokEndpointsDefinition, type IByokEndpoint, type IByokEndpointModel, type IByokEndpointsDefinition } from '../../../../../../platform/agentHost/common/byokModelSource.js';
import { ModelSourceAuthRequiredReason, ModelSourceRetentionPolicy, ModelSourceStatus, type ModelSourceRegistration, type RootState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { AhpErrorCodes, AuthenticateTargetKind, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { ROOT_STATE_URI } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { ChatEntitlementContextKeys, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IUserDataProfileService } from '../../../../../services/userDataProfile/common/userDataProfile.js';
import { getLanguageModelSecretStorageKey, getModelContextWindowTotal, ILanguageModelsService, type ILanguageModelChatMetadata } from '../../../common/languageModels.js';
import { ILanguageModelsConfigurationService, type ILanguageModelsProviderGroup } from '../../../common/languageModelsConfiguration.js';

// #region Served models

export const IAgentHostModelSourceStatusService = createDecorator<IAgentHostModelSourceStatusService>('agentHostModelSourceStatusService');

/**
 * The BYOK models the local agent host serves directly from this window's model
 * sources, so the window's BYOK bridge stops listing them.
 */
export interface IAgentHostModelSourceStatusService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	/** The language model identifiers of the models the local agent host serves directly. */
	readonly locallyServedModels: ReadonlySet<string>;
	setLocallyServedModels(models: ReadonlySet<string>): void;
}

export class AgentHostModelSourceStatusService extends Disposable implements IAgentHostModelSourceStatusService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private _locallyServedModels: ReadonlySet<string> = new Set();

	get locallyServedModels(): ReadonlySet<string> {
		return this._locallyServedModels;
	}

	setLocallyServedModels(models: ReadonlySet<string>): void {
		if (models.size !== this._locallyServedModels.size || [...models].some(model => !this._locallyServedModels.has(model))) {
			this._locallyServedModels = models;
			this._onDidChange.fire();
		}
	}
}

// #endregion

// #region Model sources

/** A BYOK provider group this window registers with agent hosts as a model source. */
export interface IByokModelSource {
	readonly vendor: string;
	readonly group: string;
	readonly definition: IByokEndpointsDefinition;
	/**
	 * Identifies the group's stored key without revealing it, and changes when the user replaces the key. The host
	 * publishes the ID of the key it holds, so a window can tell whether that key is still the group's.
	 */
	readonly credentialId: string | undefined;
	/** The language model identifiers of {@link definition}'s models, by model id. */
	readonly modelIdentifiers: ReadonlyMap<string, string>;
}

/**
 * Whether the user's windows may register BYOK provider groups with agent hosts: the policy and the
 * application-scoped setting, which every window shares. When they don't, no window wants any registration.
 */
function areByokModelSourcesAllowed(configurationService: IConfigurationService, chatEntitlementService: IChatEntitlementService): boolean {
	return chatEntitlementService.clientByokEnabled && configurationService.getValue<boolean>(AgentHostByokDirectEndpointsSettingId) === true;
}

/** Whether this window registers its BYOK provider groups with agent hosts. Other windows may differ, by their workspace settings. */
export function areByokModelSourcesEnabled(configurationService: IConfigurationService, chatEntitlementService: IChatEntitlementService): boolean {
	return areByokModelSourcesAllowed(configurationService, chatEntitlementService)
		&& !chatEntitlementService.sentiment.hidden
		&& configurationService.getValue<boolean>(AgentHostByokModelsEnabledSettingId) !== false;
}

/** Maps one vendor's provider groups to model sources. */
interface IByokVendorModelSources {
	readonly vendor: string;
	/** Whether the vendor's requests need the group's key; a group without one keeps using the bridge. */
	readonly requiresKey: boolean;
	/**
	 * The endpoint the runtime calls a model at to send the same requests as the
	 * vendor's provider in the extension, with the capabilities to advertise, or
	 * why it can't and the model keeps using the bridge.
	 */
	resolve(group: ILanguageModelsProviderGroup, metadata: ILanguageModelChatMetadata): IByokVendorModelResolution;
}

type IByokVendorModelResolution =
	| { readonly endpoint: IByokEndpoint; readonly toolCalling?: unknown; readonly vision?: unknown; readonly bridgeReason?: undefined }
	| { readonly endpoint?: undefined; readonly bridgeReason: string };

/** Resolves a model configured in the group's `models`, by the URL rules of the vendor's provider. */
function resolveConfiguredModel(group: ILanguageModelsProviderGroup, metadata: ILanguageModelChatMetadata, resolveEndpoint: (settings: ICustomEndpointModelSettings) => CustomEndpointRuntimeEndpointResolution): IByokVendorModelResolution {
	const settings = findCustomEndpointModelSettings(group, metadata.id);
	if (!settings) {
		return { bridgeReason: 'notConfigured' };
	}
	const resolution = resolveEndpoint(settings);
	return resolution.endpoint ? { endpoint: resolution.endpoint, toolCalling: settings.toolCalling, vision: settings.vision } : resolution;
}

/** Resolves a model the vendor's provider lists itself, at the vendor's fixed endpoint. */
function resolveListedModel(endpoint: IByokEndpoint, metadata: ILanguageModelChatMetadata): IByokVendorModelResolution {
	return { endpoint, toolCalling: metadata.capabilities?.toolCalling, vision: metadata.capabilities?.vision };
}

/**
 * The vendors whose provider groups are registered as model sources, and how the
 * runtime calls their models the way the extension does. Gemini, OpenAI, and
 * Anthropic keep using the bridge: the runtime has no Gemini API, always asks
 * OpenAI for reasoning summaries, and applies its own Claude thinking settings.
 */
const byokVendorModelSources: readonly IByokVendorModelSources[] = [
	{ vendor: CUSTOM_ENDPOINT_BYOK_VENDOR, requiresKey: false, resolve: (group, metadata) => resolveConfiguredModel(group, metadata, resolveCustomEndpointRuntimeEndpoint) },
	{ vendor: 'customoai', requiresKey: false, resolve: (group, metadata) => resolveConfiguredModel(group, metadata, resolveCustomOAIRuntimeEndpoint) },
	// Without a key, the Azure provider signs in with the user's Microsoft account instead.
	{ vendor: 'azure', requiresKey: true, resolve: (group, metadata) => resolveConfiguredModel(group, metadata, settings => resolveAzureRuntimeEndpoint(metadata.id, settings)) },
	{ vendor: 'xai', requiresKey: true, resolve: (_group, metadata) => resolveListedModel(XAI_BYOK_ENDPOINT, metadata) },
	{
		vendor: 'openrouter', requiresKey: true, resolve: (_group, metadata) => metadata.capabilities?.apiType === 'messages' || metadata.id.includes('anthropic/')
			? { bridgeReason: 'messages' }
			: resolveListedModel(OPENROUTER_BYOK_ENDPOINT, metadata),
	},
	{ vendor: 'ollama', requiresKey: false, resolve: (group, metadata) => resolveListedModel(getOllamaByokEndpoint(group.url), metadata) },
];

/** The model source entry of a model, or `undefined` when the format can't carry it. */
function toByokEndpointModel(identifier: string, metadata: ILanguageModelChatMetadata, resolution: Extract<IByokVendorModelResolution, { readonly endpoint: IByokEndpoint }>): IByokEndpointModel | undefined {
	const reasoningEffortSchema = metadata.configurationSchema?.properties?.reasoningEffort;
	const reasoningEfforts = reasoningEffortSchema?.enum?.filter((value): value is string => typeof value === 'string');
	const tokenCount = (value: number | undefined) => value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : undefined;
	const maxInputTokens = tokenCount(metadata.maxInputTokens);
	const maxOutputTokens = tokenCount(metadata.maxOutputTokens);
	const maxContextWindowTokens = tokenCount(getModelContextWindowTotal(metadata));
	const model: IByokEndpointModel = {
		id: metadata.id,
		name: metadata.name,
		endpoint: resolution.endpoint,
		...(typeof resolution.toolCalling === 'boolean' ? { toolCalling: resolution.toolCalling } : {}),
		// Unknown vision stays unknown rather than becoming `false`.
		...(typeof resolution.vision === 'boolean' ? { vision: resolution.vision } : {}),
		...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
		...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
		...(maxContextWindowTokens !== undefined ? { maxContextWindowTokens } : {}),
		...(reasoningEfforts?.length ? { reasoningEfforts } : {}),
		...(typeof reasoningEffortSchema?.default === 'string' ? { defaultReasoningEffort: reasoningEffortSchema.default } : {}),
		// The id the BYOK bridge served the model under, `<vendor>/[<group>/]<id>`.
		aliases: [identifier],
	};
	try {
		// The host reads the whole definition with the same rules, and would decline all of the group's models for this one.
		readByokEndpointsDefinition({ models: [model], requiresCredential: true });
		return model;
	} catch {
		return undefined;
	}
}

/**
 * The window's BYOK provider groups as model sources. A group whose key is
 * written into the settings file is left out, since only keys in secret storage
 * are forwarded. While a vendor's provider is (re)starting and hasn't listed its
 * models, or failed to list a group's models, the sources from `previous` are kept
 * if their group's key is unchanged, so an extension host restart or a network
 * error doesn't withdraw them.
 */
export function getByokModelSources(languageModelsService: ILanguageModelsService, languageModelsConfigurationService: ILanguageModelsConfigurationService, logService: ILogService, previous: readonly IByokModelSource[] = []): IByokModelSource[] {
	const configuredGroups = languageModelsConfigurationService.getLanguageModelsProviderGroups();
	const keepPrevious = (vendor: string, group?: string) => previous.filter(source => source.vendor === vendor && (group === undefined || source.group === group)
		&& configuredGroups.some(candidate => candidate.vendor === vendor && candidate.name === source.group && getCredentialId(candidate) === source.credentialId));
	const sources: IByokModelSource[] = [];
	for (const vendorSources of byokVendorModelSources) {
		const { vendor } = vendorSources;
		if (!languageModelsService.hasResolvedVendor(vendor)) {
			sources.push(...keepPrevious(vendor));
			continue;
		}
		for (const { group, modelIdentifiers, status } of languageModelsService.getLanguageModelGroups(vendor)) {
			// The configuration file has the group's current settings, including a replaced key.
			const configured = group && configuredGroups.find(candidate => candidate.vendor === vendor && candidate.name === group.name);
			if (!configured) {
				continue;
			}
			if (status?.severity === Severity.Error) {
				sources.push(...keepPrevious(vendor, configured.name));
				continue;
			}
			const secretKey = getLanguageModelSecretStorageKey(configured.apiKey);
			if ((configured.apiKey !== undefined || vendorSources.requiresKey) && !secretKey) {
				logService.trace(`[AgentHostModelSourceRegistrar] The ${vendor} group ${configured.name} keeps using the bridge: its API key is not in secret storage`);
				continue;
			}
			const models: IByokEndpointModel[] = [];
			const identifiers = new Map<string, string>();
			for (const identifier of modelIdentifiers) {
				const metadata = languageModelsService.lookupLanguageModel(identifier);
				if (!metadata) {
					continue;
				}
				const resolution = vendorSources.resolve(configured, metadata);
				// Without a key, the runtime would authenticate Azure requests with the machine's Azure identity.
				const model = resolution.endpoint && (secretKey || resolution.endpoint.type !== 'azure') ? toByokEndpointModel(identifier, metadata, resolution) : undefined;
				if (model && !identifiers.has(model.id)) {
					models.push(model);
					identifiers.set(model.id, identifier);
				} else {
					logService.trace(`[AgentHostModelSourceRegistrar] ${identifier} keeps using the bridge: ${resolution.bridgeReason ?? 'unsupported'}`);
				}
			}
			if (models.length) {
				sources.push({
					vendor,
					group: configured.name,
					definition: { models, requiresCredential: !!secretKey },
					credentialId: getCredentialId(configured),
					modelIdentifiers: identifiers,
				});
			}
		}
	}
	return sources;
}

/** Identifies the group's stored key without revealing it: replacing a key stores it under a new secret storage key. */
function getCredentialId(group: ILanguageModelsProviderGroup): string | undefined {
	const secretKey = getLanguageModelSecretStorageKey(group.apiKey);
	return secretKey ? hash(secretKey).toString(16) : undefined;
}

/**
 * Whether a remote agent host can reach `baseUrl` as this window means it: an
 * https URL on a public name or address. A loopback, private, or single-label
 * host would resolve on the agent host's machine or network instead.
 */
export function isReachableFromRemoteAgentHost(baseUrl: string): boolean {
	let url: URL;
	try {
		url = new URL(baseUrl);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:') {
		return false;
	}
	const host = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
	if (host.includes(':')) {
		return !(host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:'));
	}
	const ipv4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
	if (ipv4) {
		const first = Number(ipv4[1]);
		const second = Number(ipv4[2]);
		return !(first === 0 || first === 10 || first === 127 || (first === 100 && second >= 64 && second <= 127) || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168));
	}
	return host.includes('.') && !/(^|\.)(localhost|local|internal|home\.arpa)$/.test(host);
}

// #endregion

const INSTALLATION_ID_STORAGE_KEY = 'chat.agentHost.byokModelSources.installationId';
const REMOTE_HOST_CONSENT_STORAGE_KEY = 'chat.agentHost.byokModelSources.remoteHosts';

/** Whether this window may register model sources with a connection, once the user decided. */
const enum HostConsent {
	Allowed,
	Denied,
	Undecided,
}

/**
 * Registers the window's BYOK provider groups with every connected agent host
 * whose agent reads {@link BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT}, and delivers
 * each group's API key when the host asks for it. The host's agent then calls
 * the endpoints directly. Models the runtime can't call the way the vendor's
 * own provider does are left out, and keep using the window's bridge.
 *
 * A remote agent host is used only after the user allows it, and only with
 * endpoints it can reach the same way this machine does. Relayed connections are
 * never used, since a relay could read the keys.
 */
export class AgentHostModelSourceRegistrar extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostModelSourceRegistrar';

	private readonly _connections = this._register(new DisposableMap<IAgentConnection, ConnectionModelSourceRegistrar>());
	private readonly _prompted = new Set<string>();
	private readonly _namespace: string;
	private _sources: readonly IByokModelSource[] = [];
	/** Which registrations in this window's namespace no window of the profile wants, once that is known. */
	private _isStale: ((id: string) => boolean) | undefined;
	private _configurationReady = false;

	constructor(
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILanguageModelsConfigurationService private readonly _languageModelsConfigurationService: ILanguageModelsConfigurationService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IAgentHostModelSourceStatusService private readonly _statusService: IAgentHostModelSourceStatusService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		let installationId = this._storageService.get(INSTALLATION_ID_STORAGE_KEY, StorageScope.APPLICATION);
		if (!installationId) {
			installationId = generateUuid();
			this._storageService.store(INSTALLATION_ID_STORAGE_KEY, installationId, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		this._namespace = getByokModelSourceNamespace(installationId, userDataProfileService.currentProfile.id);
		const byokContextKeys = new Set([ChatEntitlementContextKeys.clientByokEnabled.key]);
		this._register(Event.any(
			Event.debounce(this._languageModelsService.onDidChangeLanguageModels, () => undefined, 500),
			this._languageModelsConfigurationService.onDidChangeLanguageModelGroups,
			this._chatEntitlementService.onDidChangeSentiment,
			Event.filter(contextKeyService.onDidChangeContext, event => event.affectsSome(byokContextKeys)),
			Event.filter(this._configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(AgentHostByokDirectEndpointsSettingId) || event.affectsConfiguration(AgentHostByokModelsEnabledSettingId)),
		)(() => this._update()));
		this._register(this._connectionsService.onDidChangeConnections(() => this._updateConnections()));
		this._languageModelsConfigurationService.whenReady.then(() => {
			this._configurationReady = true;
			this._update();
		});
		this._update();
	}

	private _update(): void {
		const enabled = areByokModelSourcesEnabled(this._configurationService, this._chatEntitlementService);
		this._sources = enabled ? getByokModelSources(this._languageModelsService, this._languageModelsConfigurationService, this._logService, this._sources) : [];
		// Removing a registration ends the chats that use it for every window, so only what all of the profile's
		// windows share decides it: the policy and application setting, and the profile's provider groups.
		// Otherwise a window withdraws just its own contribution.
		if (!areByokModelSourcesAllowed(this._configurationService, this._chatEntitlementService)) {
			this._isStale = () => true;
		} else if (this._configurationReady) {
			const configured = new Set(this._languageModelsConfigurationService.getLanguageModelsProviderGroups().map(group => JSON.stringify([group.vendor, group.name])));
			this._isStale = id => {
				const parsed = parseByokModelSourceId(id);
				return !parsed || !byokVendorModelSources.some(({ vendor }) => vendor === parsed.vendor) || !configured.has(JSON.stringify([parsed.vendor, parsed.group]));
			};
		} else {
			this._isStale = undefined;
		}
		this._updateConnections();
	}

	private _updateConnections(): void {
		const live = new Map(this._connectionsService.connections.flatMap(info => info.connection ? [[info.connection, info] as const] : []));
		for (const connection of [...this._connections.keys()]) {
			if (!live.has(connection)) {
				this._connections.deleteAndDispose(connection);
			}
		}
		for (const [connection, info] of live) {
			const kind = connection.clientConnectionKind;
			// A relay sees what passes through it, and an unknown connection may be one.
			if (kind === AgentHostClientConnectionKind.WebPubSub || kind === AgentHostClientConnectionKind.MissionControl || kind === AgentHostClientConnectionKind.Unknown) {
				continue;
			}
			let registrar = this._connections.get(connection);
			if (!registrar) {
				registrar = new ConnectionModelSourceRegistrar(connection, this._namespace, source => this._resolveApiKey(source), () => this._publishServedModels(), this._logService);
				this._connections.set(connection, registrar);
			}
			const isLocal = kind === AgentHostClientConnectionKind.Local;
			const sources = isLocal ? this._sources : this._remoteSources();
			const consent = isLocal || !sources.length ? HostConsent.Allowed : this._consentFor(info);
			if (consent === HostConsent.Undecided) {
				this._askConsent(info);
			}
			registrar.setSources(consent === HostConsent.Allowed ? sources : consent === HostConsent.Denied ? [] : undefined, this._isStale);
		}
		this._publishServedModels();
	}

	private _publishServedModels(): void {
		const served = new Set<string>();
		for (const [connection, registrar] of this._connections) {
			if (connection.clientConnectionKind === AgentHostClientConnectionKind.Local) {
				for (const model of registrar.servedModels) {
					served.add(model);
				}
			}
		}
		this._statusService.setLocallyServedModels(served);
	}

	/** The sources with only the models a remote agent host can reach. */
	private _remoteSources(): IByokModelSource[] {
		return this._sources.flatMap(source => {
			const models = source.definition.models.filter(model => isReachableFromRemoteAgentHost(model.endpoint.baseUrl));
			return models.length ? [{ ...source, definition: { ...source.definition, models } }] : [];
		});
	}

	/** Identifies the machine of a remote agent host, for the user's decision. */
	private _hostKey(info: IAgentHostConnectionInfo): string {
		return info.address ?? `${this._environmentService.remoteAuthority ?? ''}#${info.authority}`;
	}

	private _consentFor(info: IAgentHostConnectionInfo): HostConsent {
		const decision = this._readConsent()[this._hostKey(info)];
		return decision === true ? HostConsent.Allowed : decision === false ? HostConsent.Denied : HostConsent.Undecided;
	}

	private _readConsent(): Record<string, boolean> {
		try {
			const value: unknown = JSON.parse(this._storageService.get(REMOTE_HOST_CONSENT_STORAGE_KEY, StorageScope.APPLICATION, '{}'));
			return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')) : {};
		} catch {
			return {};
		}
	}

	private _askConsent(info: IAgentHostConnectionInfo): void {
		const key = this._hostKey(info);
		if (this._prompted.has(key)) {
			return;
		}
		this._prompted.add(key);
		const decide = (allowed: boolean) => {
			this._storageService.store(REMOTE_HOST_CONSENT_STORAGE_KEY, JSON.stringify({ ...this._readConsent(), [key]: allowed }), StorageScope.APPLICATION, StorageTarget.MACHINE);
			this._updateConnections();
		};
		this._notificationService.prompt(
			Severity.Info,
			localize('agentHostModelSources.remoteConsent', "Allow the agent host {0} to call your language model providers directly? It receives the API keys of your providers.", info.name),
			[
				{ label: localize('agentHostModelSources.allow', "Allow"), run: () => decide(true) },
				{ label: localize('agentHostModelSources.deny', "Don't Allow"), run: () => decide(false) },
			],
			{ sticky: true },
		);
	}

	/** The group's current API key, if the window may still deliver it. */
	private async _resolveApiKey(source: IByokModelSource): Promise<string | undefined> {
		if (!this._sources.some(candidate => candidate.vendor === source.vendor && candidate.group === source.group)) {
			return undefined;
		}
		const apiKey = await this._languageModelsService.resolveLanguageModelsProviderGroupApiKey(source.vendor, source.group);
		// The key or the policy changed while it was read: the next update delivers the right key, if any.
		const current = this._sources.find(candidate => candidate.vendor === source.vendor && candidate.group === source.group);
		if (!areByokModelSourcesEnabled(this._configurationService, this._chatEntitlementService) || current?.credentialId !== source.credentialId) {
			return undefined;
		}
		return apiKey || undefined;
	}
}

interface IDesiredRegistration {
	readonly registration: ModelSourceRegistration;
	readonly source: IByokModelSource;
}

const MAX_DELIVERY_RETRY_DELAY = 60_000;

/** The registrations and credential deliveries of this window on one agent host connection. */
class ConnectionModelSourceRegistrar extends Disposable {

	/** The registrations this window dispatched, by ID, so it only replaces one after a local change. */
	private readonly _registered = new Map<string, ModelSourceRegistration>();
	/** Registrations the host rejected; not dispatched again until they change. */
	private readonly _rejected = new Map<string, ModelSourceRegistration>();
	/** Registrations this window dispatched whose echo hasn't arrived: root state doesn't show them yet. */
	private readonly _inFlight = new Set<string>();
	/** Removals this window dispatched whose echo hasn't arrived. */
	private readonly _removing = new Set<string>();
	/** Withdrawals of this window's contribution whose echo hasn't arrived. */
	private readonly _withdrawing = new Set<string>();
	/** The credential nonce and credential ID each registration's key is being delivered for. */
	private readonly _delivering = new Map<string, string>();
	/** Failed deliveries by registration, for backing off. */
	private readonly _deliveryFailures = new Map<string, number>();
	private readonly _pending = this._register(new DisposableStore());
	/** `undefined` until the user decides whether this host may have the sources. */
	private _sources: readonly IByokModelSource[] | undefined;
	private _isStale: ((id: string) => boolean) | undefined;
	private _servedModels: ReadonlySet<string> = new Set();

	constructor(
		private readonly _connection: IAgentConnection,
		private readonly _namespace: string,
		private readonly _resolveApiKey: (source: IByokModelSource) => Promise<string | undefined>,
		private readonly _onDidChangeServedModels: () => void,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(this._connection.rootState.onDidChange(() => this._sync()));
	}

	/** The language model identifiers of the models the host has ready from this window's registrations. */
	get servedModels(): ReadonlySet<string> {
		return this._servedModels;
	}

	/**
	 * @param isStale Which of the host's registrations in this window's namespace
	 * no window wants, so they can be removed. The window withdraws only its own
	 * contribution to the others it doesn't want. `undefined` until it is known.
	 */
	setSources(sources: readonly IByokModelSource[] | undefined, isStale: ((id: string) => boolean) | undefined): void {
		this._sources = sources;
		this._isStale = isStale;
		this._sync();
	}

	private _sync(): void {
		const root = this._connection.rootState.value;
		if (!root || root instanceof Error || this._store.isDisposed) {
			return;
		}
		const current = new Map((root.modelSourceRegistrations ?? []).map(registration => [registration.id, registration]));
		const clientId = this._connection.clientId;
		for (const id of [...this._removing]) {
			if (!current.has(id)) {
				this._removing.delete(id);
			}
		}
		for (const id of [...this._withdrawing]) {
			if (!current.get(id)?.contributingClientIds?.includes(clientId)) {
				this._withdrawing.delete(id);
			}
		}
		if (!this._sources) {
			this._updateServedModels(new Map(), current);
			return;
		}
		const desired = this._desiredRegistrations(root, this._sources);
		for (const id of [...this._registered.keys()]) {
			if (!desired.has(id)) {
				this._forget(id);
			}
		}
		for (const [id, existing] of current) {
			if (!id.startsWith(this._namespace) || desired.has(id) || this._removing.has(id) || this._withdrawing.has(id)) {
				continue;
			}
			if (this._isStale?.(id)) {
				this._removing.add(id);
				this._connection.dispatch(ROOT_STATE_URI, { type: ActionType.RootModelSourceRegistrationRemoved, id });
			} else if (existing.contributingClientIds?.includes(clientId)) {
				// Another window of the profile may still want it; the host removes it when its last contributor withdraws.
				this._withdrawing.add(id);
				this._connection.dispatch(ROOT_STATE_URI, { type: ActionType.RootModelSourceContributorRemoved, id, clientId });
			}
		}
		for (const [id, { registration, source }] of desired) {
			const existing = current.get(id);
			const previous = this._registered.get(id);
			const rejected = this._rejected.get(id);
			if (rejected && equals(rejected, registration)) {
				continue;
			}
			if (this._inFlight.has(id)) {
				continue;
			}
			if (existing && !isSameRouting(existing, registration)) {
				// Replacing the routing resets the source's status. Do it for a change here, but not to undo another
				// window's copy that differs only until it sees the same change.
				if (!previous || !equals(previous, registration)) {
					this._dispatchRegistration(registration);
				}
				continue;
			}
			// Joining an unchanged source keeps its status and key.
			if (!existing || !existing.contributingClientIds?.includes(clientId) || existing.retention !== registration.retention || existing.displayName !== registration.displayName) {
				this._dispatchRegistration(registration);
				continue;
			}
			this._registered.set(id, registration);
			this._deliverCredential(existing, source);
		}
		this._updateServedModels(desired, current);
	}

	private _forget(id: string): void {
		this._registered.delete(id);
		this._rejected.delete(id);
		this._inFlight.delete(id);
		this._delivering.delete(id);
		this._deliveryFailures.delete(id);
	}

	private _updateServedModels(desired: ReadonlyMap<string, IDesiredRegistration>, current: ReadonlyMap<string, ModelSourceRegistration>): void {
		const served = new Set<string>();
		for (const [id, { registration, source }] of desired) {
			const existing = current.get(id);
			if (existing?.state?.kind === ModelSourceStatus.Ready && isSameRouting(existing, registration)) {
				for (const identifier of source.modelIdentifiers.values()) {
					served.add(identifier);
				}
			}
		}
		if (served.size !== this._servedModels.size || [...served].some(model => !this._servedModels.has(model))) {
			this._servedModels = served;
			this._onDidChangeServedModels();
		}
	}

	private _desiredRegistrations(root: RootState, sources: readonly IByokModelSource[]): Map<string, IDesiredRegistration> {
		const desired = new Map<string, IDesiredRegistration>();
		// The local host is shared by this user's windows, so its sources outlive the window that registered them.
		const retention = this._connection.clientConnectionKind === AgentHostClientConnectionKind.Local ? ModelSourceRetentionPolicy.Host : ModelSourceRetentionPolicy.ContributingClient;
		for (const agent of root.agents) {
			if (!agent.capabilities?.modelSourceRegistration?.formats.includes(BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT)) {
				continue;
			}
			for (const source of sources) {
				const id = getByokModelSourceId(this._namespace, agent.provider, source);
				desired.set(id, {
					source,
					registration: {
						id,
						provider: agent.provider,
						displayName: source.group,
						format: BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT,
						definition: source.definition,
						retention,
					},
				});
			}
		}
		return desired;
	}

	private _dispatchRegistration(registration: ModelSourceRegistration): void {
		this._registered.set(registration.id, registration);
		this._delivering.delete(registration.id);
		this._deliveryFailures.delete(registration.id);
		this._inFlight.add(registration.id);
		const isCurrent = () => equals(this._registered.get(registration.id), registration);
		this._connection.dispatchConfirmed(ROOT_STATE_URI, this._connection.rootState, { type: ActionType.RootModelSourceRegistrationSet, registration, clientId: this._connection.clientId }, CancellationToken.None).then(envelope => {
			if (!isCurrent()) {
				return;
			}
			this._inFlight.delete(registration.id);
			if (envelope.rejectionReason) {
				this._logService.warn(`[AgentHostModelSourceRegistrar] The agent host declined the BYOK provider group ${registration.displayName}: ${envelope.rejectionReason}`);
				this._rejected.set(registration.id, registration);
			} else {
				// Picks up a registration removed again before its echo arrived.
				this._sync();
			}
		}, error => {
			if (isCurrent()) {
				// The next root state update, such as a reconnect, registers it again.
				this._inFlight.delete(registration.id);
			}
			this._logService.warn(`[AgentHostModelSourceRegistrar] Failed to register the BYOK provider group ${registration.displayName}: ${toErrorMessage(error)}`);
		});
	}

	/**
	 * Sends the group's key when the host needs it: when it holds none or its
	 * lease lapsed, or when it holds, or rejected, a key the user has since
	 * replaced. Never sends the key the host reported as rejected or revoked,
	 * or to a destination that isn't in this window's copy of the definition.
	 */
	private _deliverCredential(existing: ModelSourceRegistration, source: IByokModelSource): void {
		const nonce = existing.credentialNonce;
		const resource = existing.credentialResource?.resource;
		const delivery = JSON.stringify([nonce, source.credentialId ?? null]);
		if (!source.definition.requiresCredential || nonce === undefined || resource === undefined || !needsCredential(existing, source.credentialId)
			|| resource !== getByokEndpointsCredentialResource(source.definition)?.resource || !hasOnlyOrigins(existing, source.definition)
			|| this._delivering.get(existing.id) === delivery) {
			return;
		}
		this._delivering.set(existing.id, delivery);
		const store = this._pending.add(new DisposableStore());
		const isCurrent = () => !store.isDisposed && this._delivering.get(existing.id) === delivery;
		const retry = () => {
			const failures = (this._deliveryFailures.get(existing.id) ?? 0) + 1;
			this._deliveryFailures.set(existing.id, failures);
			disposableTimeout(() => {
				if (this._delivering.get(existing.id) === delivery) {
					this._delivering.delete(existing.id);
					this._sync();
				}
			}, Math.min(MAX_DELIVERY_RETRY_DELAY, 1000 * 2 ** failures), this._pending);
		};
		this._resolveApiKey(source).then(async apiKey => {
			if (!isCurrent()) {
				return;
			}
			if (!apiKey) {
				// The key changed or was unreadable while it was read; ask again later rather than never.
				retry();
				return;
			}
			await this._connection.authenticate({
				resource,
				token: apiKey,
				target: { kind: AuthenticateTargetKind.ModelSource, modelSourceId: existing.id, credentialNonce: nonce, ...(source.credentialId !== undefined ? { credentialId: source.credentialId } : {}) },
			});
			this._deliveryFailures.delete(existing.id);
		}).catch(error => {
			if (!isCurrent()) {
				return;
			}
			// A changed registration fences the stale nonce; the next root state update asks again.
			if (error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict) {
				return;
			}
			this._logService.warn(`[AgentHostModelSourceRegistrar] Failed to deliver the API key of the BYOK provider group ${existing.displayName}: ${toErrorMessage(error)}`);
			retry();
		}).finally(() => this._pending.delete(store));
	}
}

/** Whether the host needs the window's current key, whose ID is `credentialId`. */
function needsCredential(existing: ModelSourceRegistration, credentialId: string | undefined): boolean {
	const state = existing.state;
	if (state?.kind === ModelSourceStatus.Ready) {
		// The host holds a key the user has since replaced.
		return existing.credentialId !== credentialId;
	}
	if (state?.kind !== ModelSourceStatus.AuthRequired) {
		return false;
	}
	switch (state.reason) {
		case ModelSourceAuthRequiredReason.Required:
		case ModelSourceAuthRequiredReason.Expired:
			return true;
		default:
			// A rejected or revoked key is sent again only once the user replaced it.
			return existing.credentialId !== credentialId;
	}
}

/** Whether every destination the host sends the key to is in the window's copy of the definition. */
function hasOnlyOrigins(existing: ModelSourceRegistration, definition: IByokEndpointsDefinition): boolean {
	const origins = new Set(getByokEndpointsCredentialOrigins(definition));
	return !!existing.credentialOrigins?.length && existing.credentialOrigins.every(origin => origins.has(origin));
}

/** Whether the host's copy of a registration routes requests as this window's does, so a `Set` joins it. */
function isSameRouting(existing: ModelSourceRegistration, registration: ModelSourceRegistration): boolean {
	return existing.provider === registration.provider && existing.format === registration.format && equals(existing.definition, registration.definition);
}
