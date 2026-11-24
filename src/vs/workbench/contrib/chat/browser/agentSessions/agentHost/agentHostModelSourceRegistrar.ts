/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { hash } from '../../../../../../base/common/hash.js';
import { Disposable, DisposableMap } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostByokDirectEndpointsSettingId, AgentHostByokModelsEnabledSettingId, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService, type IAgentHostConnectionInfo } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostClientConnectionKind } from '../../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { CUSTOM_ENDPOINT_BYOK_VENDOR, findCustomEndpointModelSettings, resolveCustomEndpointRuntimeEndpoint, type CustomEndpointRuntimeEndpointResolution, type ICustomEndpointModelSettings } from '../../../../../../platform/agentHost/common/byokCustomEndpoint.js';
import { ANTHROPIC_BYOK_ENDPOINT, GEMINI_BYOK_ENDPOINT, getGeminiByokModelId, getOllamaByokEndpoint, getOpenAIByokEndpoint, OPENROUTER_BYOK_ENDPOINT, resolveAzureRuntimeEndpoint, resolveCustomOAIRuntimeEndpoint, XAI_BYOK_ENDPOINT } from '../../../../../../platform/agentHost/common/byokVendorEndpoints.js';
import { BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT, getByokEndpointsCredentialResource, getByokEndpointsNonce, getByokModelSourceId, isByokModelSourceId, parseByokModelSourceId, readByokEndpointsDefinition, type IByokEndpoint, type IByokEndpointModel, type IByokEndpointsDefinition } from '../../../../../../platform/agentHost/common/byokModelSource.js';
import { ModelSourceAuthRequiredReason, ModelSourceRetentionPolicy, ModelSourceStatus, type ModelSource, type RootState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { AuthenticateTargetKind } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
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
	/** The source's `nonce`, from {@link definition}. */
	readonly nonce: string;
	/**
	 * Names the group's stored key without revealing it, and changes when the user replaces the key. Sent as the
	 * `accountId` of `authenticate`, so the host's `accountId` says whether it holds the group's current key.
	 */
	readonly accountId: string | undefined;
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
	| { readonly endpoint: IByokEndpoint; readonly modelId?: string; readonly toolCalling?: unknown; readonly vision?: unknown; readonly bridgeReason?: undefined }
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
function resolveListedModel(endpoint: IByokEndpoint, metadata: ILanguageModelChatMetadata, modelId?: string): IByokVendorModelResolution {
	return { endpoint, ...(modelId !== undefined ? { modelId } : {}), toolCalling: metadata.capabilities?.toolCalling, vision: metadata.capabilities?.vision };
}

/** The reasoning efforts a model offers, from its configuration schema. */
function getReasoningEfforts(metadata: ILanguageModelChatMetadata): string[] | undefined {
	return metadata.configurationSchema?.properties?.reasoningEffort?.enum?.filter((value): value is string => typeof value === 'string');
}

/**
 * The vendors whose provider groups are registered as model sources, and the
 * API format the runtime calls their models in. The runtime applies its own
 * request settings, such as thinking budgets and output caps. OpenRouter's
 * Anthropic models keep using the bridge: the extension sends OpenRouter's
 * Messages API the key as a bearer token, and the runtime's Anthropic
 * provider sends it as `x-api-key`.
 */
const byokVendorModelSources: readonly IByokVendorModelSources[] = [
	{ vendor: CUSTOM_ENDPOINT_BYOK_VENDOR, requiresKey: false, resolve: (group, metadata) => resolveConfiguredModel(group, metadata, resolveCustomEndpointRuntimeEndpoint) },
	{ vendor: 'customoai', requiresKey: false, resolve: (group, metadata) => resolveConfiguredModel(group, metadata, resolveCustomOAIRuntimeEndpoint) },
	// Without a key, the Azure provider signs in with the user's Microsoft account instead.
	{ vendor: 'azure', requiresKey: true, resolve: (group, metadata) => resolveConfiguredModel(group, metadata, settings => resolveAzureRuntimeEndpoint(metadata.id, settings)) },
	{ vendor: 'openai', requiresKey: true, resolve: (_group, metadata) => resolveListedModel(getOpenAIByokEndpoint(!!getReasoningEfforts(metadata)?.length), metadata) },
	{ vendor: 'anthropic', requiresKey: true, resolve: (_group, metadata) => resolveListedModel(ANTHROPIC_BYOK_ENDPOINT, metadata) },
	{ vendor: 'gemini', requiresKey: true, resolve: (_group, metadata) => resolveListedModel(GEMINI_BYOK_ENDPOINT, metadata, getGeminiByokModelId(metadata.id)) },
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
	const reasoningEfforts = getReasoningEfforts(metadata);
	const tokenCount = (value: number | undefined) => value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : undefined;
	const maxInputTokens = tokenCount(metadata.maxInputTokens);
	const maxOutputTokens = tokenCount(metadata.maxOutputTokens);
	const maxContextWindowTokens = tokenCount(getModelContextWindowTotal(metadata));
	const model: IByokEndpointModel = {
		id: resolution.modelId ?? metadata.id,
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
		&& configuredGroups.some(candidate => candidate.vendor === vendor && candidate.name === source.group && getAccountId(candidate) === source.accountId));
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
				// In a stable order, so the nonce only changes with the definition.
				const definition: IByokEndpointsDefinition = { models: models.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), requiresCredential: !!secretKey };
				sources.push({
					vendor,
					group: configured.name,
					definition,
					nonce: getByokEndpointsNonce(definition),
					accountId: getAccountId(configured),
					modelIdentifiers: identifiers,
				});
			}
		}
	}
	return sources;
}

/** Names the group's stored key without revealing it: replacing a key stores it under a new secret storage key. */
function getAccountId(group: ILanguageModelsProviderGroup): string | undefined {
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

const REMOTE_HOST_CONSENT_STORAGE_KEY = 'chat.agentHost.byokModelSources.remoteHosts';

/** Whether this window may register model sources with a connection, once the user decided. */
const enum HostConsent {
	Allowed,
	Denied,
	Undecided,
}

/** A key for a provider group, unique across vendors. */
function groupKey(vendor: string, group: string): string {
	return JSON.stringify([vendor, group]);
}

/**
 * Registers the window's BYOK provider groups with every connected agent host
 * whose agent reads {@link BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT}, and delivers
 * each group's API key when the host asks for it. The host's agent then calls
 * the endpoints directly. Models the runtime can't call the way the vendor's
 * own provider does are left out, and keep using the window's bridge.
 *
 * Every window and device that has a group configured registers the same
 * source, by the group's ID and its definition's nonce. A window removes a
 * source only when the user removes it from the configuration.
 *
 * A remote agent host is used only after the user allows it, and only with
 * endpoints it can reach the same way this machine does. Relayed connections are
 * never used, since a relay could read the keys.
 */
export class AgentHostModelSourceRegistrar extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostModelSourceRegistrar';

	private readonly _connections = this._register(new DisposableMap<IAgentConnection, ConnectionModelSourceRegistrar>());
	private readonly _prompted = new Set<string>();
	private _sources: readonly IByokModelSource[] = [];
	private _configurationReady = false;
	/** The `accountId` of each configured group's key, by {@link groupKey}. */
	private readonly _accountIds = new Map<string, string | undefined>();
	/** The `accountId`s of keys the user replaced in this session, by {@link groupKey}. */
	private readonly _replacedAccountIds = new Map<string, Set<string>>();

	constructor(
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILanguageModelsConfigurationService private readonly _languageModelsConfigurationService: ILanguageModelsConfigurationService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IAgentHostModelSourceStatusService private readonly _statusService: IAgentHostModelSourceStatusService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
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
		const previous = this._sources;
		this._sources = enabled ? getByokModelSources(this._languageModelsService, this._languageModelsConfigurationService, this._logService, previous) : [];
		this._trackAccountIds();
		// A source that disappears while this window serves its group's vendor is one the user removed from the
		// configuration: the group was deleted, or its key or models changed so none can be called directly.
		// A vendor that is reloading or failed to list keeps its sources, so this is never a transient failure.
		const removed = enabled && this._configurationReady
			? previous.filter(source => !this._sources.some(candidate => candidate.vendor === source.vendor && candidate.group === source.group)).map(source => groupKey(source.vendor, source.group))
			: [];
		this._updateConnections(new Set(removed));
	}

	/** Records the key of each group whose key the user replaced, so a host still holding it gets the new one. */
	private _trackAccountIds(): void {
		if (!this._configurationReady) {
			return;
		}
		for (const group of this._languageModelsConfigurationService.getLanguageModelsProviderGroups()) {
			const key = groupKey(group.vendor, group.name);
			const accountId = getAccountId(group);
			const last = this._accountIds.get(key);
			if (last !== undefined && last !== accountId) {
				let replaced = this._replacedAccountIds.get(key);
				if (!replaced) {
					replaced = new Set();
					this._replacedAccountIds.set(key, replaced);
				}
				replaced.add(last);
			}
			this._accountIds.set(key, accountId);
		}
	}

	private _updateConnections(removedGroups: ReadonlySet<string> = new Set()): void {
		const live = new Map(this._connectionsService.connections.flatMap(info => info.connection ? [[info.connection, info] as const] : []));
		for (const connection of [...this._connections.keys()]) {
			if (!live.has(connection)) {
				this._connections.deleteAndDispose(connection);
			}
		}
		const allowed = areByokModelSourcesAllowed(this._configurationService, this._chatEntitlementService);
		for (const [connection, info] of live) {
			const kind = connection.clientConnectionKind;
			// A relay sees what passes through it, and an unknown connection may be one.
			if (kind === AgentHostClientConnectionKind.WebPubSub || kind === AgentHostClientConnectionKind.MissionControl || kind === AgentHostClientConnectionKind.Unknown) {
				continue;
			}
			let registrar = this._connections.get(connection);
			if (!registrar) {
				registrar = new ConnectionModelSourceRegistrar(connection, {
					resolveApiKey: source => this._resolveApiKey(source),
					wasReplaced: (source, accountId) => this._replacedAccountIds.get(groupKey(source.vendor, source.group))?.has(accountId) === true,
					onDidChangeServedModels: () => this._publishServedModels(),
				}, this._logService);
				this._connections.set(connection, registrar);
			}
			const isLocal = kind === AgentHostClientConnectionKind.Local;
			const sources = isLocal ? this._sources : this._remoteSources();
			const consent = isLocal || !sources.length ? HostConsent.Allowed : this._consentFor(info);
			if (consent === HostConsent.Undecided) {
				this._askConsent(info);
			}
			registrar.update({
				sources: consent === HostConsent.Allowed ? sources : consent === HostConsent.Denied ? [] : undefined,
				// Only this installation's windows use the local host, and the policy and setting are theirs too.
				removeAll: isLocal && !allowed,
				removedGroups: consent === HostConsent.Allowed ? removedGroups : new Set(),
			});
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
			if (!models.length) {
				return [];
			}
			const definition = { ...source.definition, models };
			return [{ ...source, definition, nonce: getByokEndpointsNonce(definition) }];
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
		if (!areByokModelSourcesEnabled(this._configurationService, this._chatEntitlementService) || current?.accountId !== source.accountId) {
			return undefined;
		}
		return apiKey || undefined;
	}
}

interface IDesiredModelSource {
	readonly modelSource: ModelSource;
	readonly definition: IByokEndpointsDefinition;
	readonly source: IByokModelSource;
}

interface IConnectionModelSourceUpdate {
	/** The sources to register, or `undefined` until the user decides whether this host may have them. */
	readonly sources: readonly IByokModelSource[] | undefined;
	/** Whether to remove every BYOK model source, because no window of the user may register any. */
	readonly removeAll: boolean;
	/** The groups, by {@link groupKey}, that the user just removed from the configuration. */
	readonly removedGroups: ReadonlySet<string>;
}

interface IConnectionModelSourceDelegate {
	resolveApiKey(source: IByokModelSource): Promise<string | undefined>;
	/** Whether `accountId` names a key of the group the user replaced. */
	wasReplaced(source: IByokModelSource, accountId: string): boolean;
	onDidChangeServedModels(): void;
}

/** The model sources and credential deliveries of this window on one agent host connection. */
class ConnectionModelSourceRegistrar extends Disposable {

	/** This window's copy of each source it registered, or found registered differently, so a local change can be told apart. */
	private readonly _known = new Map<string, IDesiredModelSource>();
	/** Sources this window registered, or registered again, since it connected or last reconnected. */
	private readonly _contributed = new Set<string>();
	/** Sources another client removed after this window registered them. Not added back until a reconnect or a local change. */
	private readonly _removedElsewhere = new Set<string>();
	/** The nonce of each source the host declined; not registered again until it changes. */
	private readonly _rejected = new Map<string, string>();
	/** Sources this window dispatched whose echo hasn't arrived. */
	private readonly _inFlight = new Set<string>();
	/** Removals this window dispatched whose echo hasn't arrived. */
	private readonly _removing = new Set<string>();
	/** The delivery of each source's key in progress, until it is sent or given up. */
	private readonly _delivering = new Map<string, object>();
	private _sources: readonly IByokModelSource[] | undefined;
	private _removeAll = false;
	private _servedModels: ReadonlySet<string> = new Set();

	constructor(
		private readonly _connection: IAgentConnection,
		private readonly _delegate: IConnectionModelSourceDelegate,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(this._connection.rootState.onDidChange(() => this._sync()));
		// A snapshot follows connecting and every reconnect, when a client registers its sources again to be counted.
		if (this._connection.rootState.onDidApplySnapshot) {
			this._register(this._connection.rootState.onDidApplySnapshot(() => {
				this._contributed.clear();
				this._removedElsewhere.clear();
				this._sync();
			}));
		}
	}

	/** The language model identifiers of the models the host has ready from this window's sources. */
	get servedModels(): ReadonlySet<string> {
		return this._servedModels;
	}

	update({ sources, removeAll, removedGroups }: IConnectionModelSourceUpdate): void {
		this._sources = sources;
		this._removeAll = removeAll;
		this._removeGroups(removedGroups);
		this._sync();
	}

	/** Removes, for every client, the sources of groups the user removed from the configuration. */
	private _removeGroups(removedGroups: ReadonlySet<string>): void {
		const root = this._connection.rootState.value;
		if (!removedGroups.size || !root || root instanceof Error) {
			return;
		}
		for (const modelSource of root.modelSources ?? []) {
			const parsed = parseByokModelSourceId(modelSource.id);
			if (parsed && removedGroups.has(groupKey(parsed.vendor, parsed.group))) {
				this._remove(modelSource.id);
			}
		}
	}

	private _remove(id: string): void {
		if (this._removing.has(id)) {
			return;
		}
		this._forget(id);
		this._removing.add(id);
		this._connection.dispatch(ROOT_STATE_URI, { type: ActionType.RootModelSourceRemoved, id });
	}

	private _sync(): void {
		const root = this._connection.rootState.value;
		if (!root || root instanceof Error || this._store.isDisposed) {
			return;
		}
		const current = new Map((root.modelSources ?? []).map(modelSource => [modelSource.id, modelSource]));
		for (const id of [...this._removing]) {
			if (!current.has(id)) {
				this._removing.delete(id);
			}
		}
		for (const id of [...this._contributed]) {
			if (!current.has(id) && !this._inFlight.has(id)) {
				this._contributed.delete(id);
				this._removedElsewhere.add(id);
			}
		}
		if (this._removeAll) {
			for (const id of current.keys()) {
				if (isByokModelSourceId(id)) {
					this._remove(id);
				}
			}
		}
		if (!this._sources) {
			this._updateServedModels(new Map(), current);
			return;
		}
		const desired = this._desiredModelSources(root, this._sources);
		for (const id of [...this._known.keys()]) {
			if (!desired.has(id)) {
				this._forget(id);
			}
		}
		for (const [id, entry] of desired) {
			const { modelSource } = entry;
			if (this._rejected.get(id) === modelSource.nonce || this._inFlight.has(id) || this._removing.has(id)) {
				continue;
			}
			const existing = current.get(id);
			const known = this._known.get(id);
			const changedLocally = known !== undefined && !isSameModelSource(known.modelSource, modelSource);
			if (!existing) {
				// Another client removed it: add it back only after a reconnect, or when the user changes it here.
				if (this._removedElsewhere.has(id) && !changedLocally) {
					continue;
				}
				this._dispatchModelSource(entry);
				continue;
			}
			if (!isSameModelSource(existing, modelSource)) {
				// Another client has a different definition. Replacing it here, unless the user changed the source here,
				// would make the two replace each other's indefinitely.
				if (changedLocally) {
					this._dispatchModelSource(entry);
				} else if (!known) {
					this._known.set(id, entry);
				}
				continue;
			}
			// Registering the unchanged source again keeps its status and key, and counts this window as a contributor.
			if (!this._contributed.has(id)) {
				this._dispatchModelSource(entry);
				continue;
			}
			this._known.set(id, entry);
			this._deliverCredential(existing, entry);
		}
		this._updateServedModels(desired, current);
	}

	private _forget(id: string): void {
		this._known.delete(id);
		this._contributed.delete(id);
		this._removedElsewhere.delete(id);
		this._rejected.delete(id);
		this._inFlight.delete(id);
		this._delivering.delete(id);
	}

	private _updateServedModels(desired: ReadonlyMap<string, IDesiredModelSource>, current: ReadonlyMap<string, ModelSource>): void {
		const served = new Set<string>();
		for (const [id, { modelSource, source }] of desired) {
			const existing = current.get(id);
			if (existing?.state?.kind === ModelSourceStatus.Ready && isSameModelSource(existing, modelSource)) {
				for (const identifier of source.modelIdentifiers.values()) {
					served.add(identifier);
				}
			}
		}
		if (served.size !== this._servedModels.size || [...served].some(model => !this._servedModels.has(model))) {
			this._servedModels = served;
			this._delegate.onDidChangeServedModels();
		}
	}

	private _desiredModelSources(root: RootState, sources: readonly IByokModelSource[]): Map<string, IDesiredModelSource> {
		const desired = new Map<string, IDesiredModelSource>();
		// The local host is shared by this user's windows, so its sources outlive the window that registered them.
		const retention = this._connection.clientConnectionKind === AgentHostClientConnectionKind.Local ? ModelSourceRetentionPolicy.Host : ModelSourceRetentionPolicy.ContributingClient;
		for (const agent of root.agents) {
			if (!agent.capabilities?.modelSourceRegistration?.formats.some(info => info.format === BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT)) {
				continue;
			}
			for (const source of sources) {
				const id = getByokModelSourceId(agent.provider, source);
				desired.set(id, {
					source,
					definition: source.definition,
					modelSource: {
						id,
						provider: agent.provider,
						displayName: source.group,
						format: BYOK_ENDPOINTS_MODEL_SOURCE_FORMAT,
						definition: source.definition,
						nonce: source.nonce,
						retention,
					},
				});
			}
		}
		return desired;
	}

	private _dispatchModelSource(entry: IDesiredModelSource): void {
		const { modelSource } = entry;
		const id = modelSource.id;
		this._known.set(id, entry);
		this._removedElsewhere.delete(id);
		this._delivering.delete(id);
		this._inFlight.add(id);
		const isCurrent = () => this._known.get(id) === entry;
		this._connection.dispatchConfirmed(ROOT_STATE_URI, this._connection.rootState, { type: ActionType.RootModelSourceSet, modelSource }, CancellationToken.None).then(envelope => {
			if (!isCurrent()) {
				return;
			}
			this._inFlight.delete(id);
			if (envelope.rejectionReason) {
				this._logService.warn(`[AgentHostModelSourceRegistrar] The agent host declined the BYOK provider group ${modelSource.displayName}: ${envelope.rejectionReason}`);
				this._rejected.set(id, modelSource.nonce);
			} else {
				this._contributed.add(id);
				this._sync();
			}
		}, error => {
			if (isCurrent()) {
				// The next root state update, such as a reconnect, registers it again.
				this._inFlight.delete(id);
			}
			this._logService.warn(`[AgentHostModelSourceRegistrar] Failed to register the BYOK provider group ${modelSource.displayName}: ${toErrorMessage(error)}`);
		});
	}

	/**
	 * Sends the group's key when the host needs it, as the source's state
	 * allows. Never sends a key the host reported as rejected, or one it holds
	 * from another window or device that the user didn't replace here, and only
	 * for a host definition that sends it nowhere this window's copy doesn't.
	 */
	private _deliverCredential(existing: ModelSource, entry: IDesiredModelSource): void {
		const { source, definition } = entry;
		const resource = getByokEndpointsCredentialResource(definition)?.resource;
		if (resource === undefined || this._delivering.has(existing.id)
			|| !needsCredential(existing, source.accountId, accountId => this._delegate.wasReplaced(source, accountId))
			|| !canSendKey(existing, entry)) {
			return;
		}
		const delivery = {};
		this._delivering.set(existing.id, delivery);
		const isCurrent = () => !this._store.isDisposed && this._delivering.get(existing.id) === delivery;
		this._delegate.resolveApiKey(source).then(async apiKey => {
			// A key that changed or was unreadable while it was read is asked for again on the next state change.
			if (!isCurrent() || !apiKey) {
				return;
			}
			// Another client may have changed the host's definition while the key was read.
			const latest = this._currentModelSource(existing.id);
			if (!latest || !canSendKey(latest, entry)) {
				return;
			}
			await this._connection.authenticate({
				resource,
				token: apiKey,
				...(source.accountId !== undefined ? { accountId: source.accountId } : {}),
				target: { kind: AuthenticateTargetKind.ModelSource, modelSourceId: existing.id },
			});
		}).catch(error => {
			if (isCurrent()) {
				this._logService.warn(`[AgentHostModelSourceRegistrar] Failed to deliver the API key of the BYOK provider group ${existing.displayName}: ${toErrorMessage(error)}`);
			}
		}).finally(() => {
			// The host reports the source's new state before it answers, so the next sync delivers again only if it still needs the key.
			if (isCurrent()) {
				this._delivering.delete(existing.id);
			}
		});
	}

	private _currentModelSource(id: string): ModelSource | undefined {
		const root = this._connection.rootState.value;
		return root && !(root instanceof Error) ? root.modelSources?.find(modelSource => modelSource.id === id) : undefined;
	}
}

/**
 * Whether the host needs this window's key, named `accountId`. `wasReplaced`
 * tells whether the user replaced the key the host's `accountId` names.
 */
function needsCredential(existing: ModelSource, accountId: string | undefined, wasReplaced: (accountId: string) => boolean): boolean {
	const held = existing.accountId;
	// The host has a key the user replaced here. A key that merely differs, from another window or device, stays.
	const holdsReplacedKey = held !== undefined && held !== accountId && wasReplaced(held);
	switch (existing.state?.kind) {
		case ModelSourceStatus.Starting:
		case ModelSourceStatus.Ready:
			return holdsReplacedKey;
		case ModelSourceStatus.AuthRequired:
			switch (existing.state.reason) {
				case ModelSourceAuthRequiredReason.Required:
				case ModelSourceAuthRequiredReason.Expired:
					return true;
				case ModelSourceAuthRequiredReason.Rejected:
					// Only a different key, never the one the endpoint refused.
					return held !== accountId;
				default:
					// A revoked key is replaced only by the user's action.
					return holdsReplacedKey;
			}
		default:
			return false;
	}
}

/**
 * Whether this window may send its key for the host's copy of a source: the
 * same agent, format, and credential resource, and a definition whose every
 * endpoint the key reaches is one this window's copy sends it to. It compares
 * the definition itself, since another client chooses the `nonce`.
 */
function canSendKey(existing: ModelSource, { modelSource, definition }: IDesiredModelSource): boolean {
	const resource = getByokEndpointsCredentialResource(definition)?.resource;
	if (resource === undefined || existing.provider !== modelSource.provider || existing.format !== modelSource.format || existing.credentialResource?.resource !== resource) {
		return false;
	}
	let held: IByokEndpointsDefinition;
	try {
		held = readByokEndpointsDefinition(existing.definition);
	} catch {
		return false;
	}
	const endpoints = new Set(definition.models.map(model => endpointKey(model.endpoint)));
	return held.requiresCredential && held.models.every(model => endpoints.has(endpointKey(model.endpoint)));
}

function endpointKey(endpoint: IByokEndpoint): string {
	return JSON.stringify([endpoint.type, endpoint.wireApi ?? null, endpoint.baseUrl, endpoint.azureApiVersion ?? null]);
}

/** Whether the host's source has this window's definition: the same agent, format, and nonce. */
function isSameModelSource(existing: Pick<ModelSource, 'provider' | 'format' | 'nonce'>, modelSource: Pick<ModelSource, 'provider' | 'format' | 'nonce'>): boolean {
	return existing.provider === modelSource.provider && existing.format === modelSource.format && existing.nonce === modelSource.nonce;
}
