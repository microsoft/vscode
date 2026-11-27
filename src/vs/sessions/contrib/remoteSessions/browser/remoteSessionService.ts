/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { isEqual } from '../../../../base/common/resources.js';
import { isString } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { remoteAgentHostSessionTypeId } from '../../../../platform/agentHost/common/agentHostSessionType.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { ContextSizeConfigKey, ContextTierConfigKey, CopilotReasoningEffortConfigKey, getContextSizeForTier, withExplicitModelConfiguration } from '../../../../platform/agentHost/common/agentModelConfiguration.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { readAgentHostResources } from '../../../../platform/agentHost/common/meta/agentHostResources.js';
import { supportsRemoteSessions, toRemoteSessionMessageMetadata, withRemoteSessionOrigin } from '../../../../platform/agentHost/common/meta/agentRemoteSessionMeta.js';
import { buildOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { isReasoningEffortLevel, ReasoningEffortConfigKey } from '../../../../platform/agentHost/common/reasoningEffort.js';
import { getSessionModeProperty, isSessionConfigWritable } from '../../../../platform/agentHost/common/sessionConfigProperties.js';
import { PolicyState } from '../../../../platform/agentHost/common/state/protocol/channels-root/state.js';
import type { ResolveSessionConfigResult } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { JsonPrimitive } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { withSessionCreationReference } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { getRegisteredLanguageModels, getVisibleLanguageModelsForTarget } from '../../../../workbench/contrib/chat/common/modelSelection.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { AutomationModelConfiguration, InvalidStoredModelConfigurationError } from '../../../../workbench/contrib/sessions/browser/automationModelConfiguration.js';
import { LocalDevContainerEnvironmentHost } from '../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionPermissionOption } from '../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { ISessionType, SessionTypeAuthRequirement } from '../../../../workbench/services/sessions/common/session.js';
import { isAutomationModelConfiguration } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { modelConfigurationPreferences } from '../../../../workbench/contrib/chat/browser/widget/input/chatModelConfigurationLogic.js';
import { ICreateNewSessionOptions, ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { areRemoteSessionModelOptionsEnabled, areRemoteSessionToolsEnabled, ICreatedRemoteSession, ICreateRemoteSessionOptions, IRemoteSessionDestination, IRemoteSessionHost, IRemoteSessionHostName, IRemoteSessionModel, IRemoteSessionService, IRemoteSessionSourceModelInfo, IRemoteSessionWorkspace, matchesRemoteSessionAgent, RemoteSessionSettingSource, remoteSessionHostRejections } from '../common/remoteSessions.js';
import { assertRemoteSessionSource, IRemoteSessionSource, IRemoteSessionSourceModel, resolveRemoteSessionSource } from './remoteSessionSource.js';
import { IRemoteSessionChatReference, IRemoteSessionChatService } from './remoteSessionChatService.js';

interface IRemoteSessionCandidate {
	readonly provider: RemoteSessionsProvider;
	readonly connection: IAgentConnection;
	readonly clientId: string;
	readonly host: IRemoteSessionHost;
	readonly sessionType: ISessionType;
	readonly agentProvider: string;
	/** The provider-native ID of the model the session starts with, requested or the source chat's; undefined leaves it to the provider. */
	readonly modelId?: string;
	readonly modelIdentifier?: string;
	/** The model configuration the session starts with; undefined leaves it to the provider. */
	readonly modelConfiguration?: Readonly<Record<string, JsonPrimitive>>;
	readonly workspace?: URI;
}

type RemoteSessionsProvider = IAgentHostSessionsProvider & { readonly remoteAddress: string };

/** The permissions and mode of the creating chat, which a new session inherits where its target offers them. */
interface IRemoteSessionSourceSettings {
	/** Undefined when the chat's permissions could not be read, which allows only permissions that are not elevated. */
	readonly permission?: ISessionPermissionOption;
	readonly mode?: string;
}

interface IRemoteSessionSettings {
	readonly permission?: { readonly id: string; readonly source: RemoteSessionSettingSource };
	readonly mode?: { readonly id: string; readonly source: RemoteSessionSettingSource };
	readonly notInherited: readonly string[];
}

const maxRemoteSessionCreations = 500;
const maxRemoteSessionDepth = 10;

/**
 * Labels a directory on its host without formatting it for this client: its path, or `//authority/path` for a UNC
 * directory. A URI path never starts with `//` without an authority, so the label identifies the directory.
 */
function getDirectoryLabel(directory: URI): string {
	return directory.authority ? `//${directory.authority}${directory.path}` : directory.path;
}

/**
 * The source chat's model options as the new session's own choices, including values that were defaults or managed
 * on the source host, so the session starts with the options the source chat runs with rather than the target's
 * defaults. The target's schema and locked options still apply when the session resolves them.
 */
function toInheritedModelConfiguration(config: Readonly<Record<string, JsonPrimitive>> | undefined): Readonly<Record<string, JsonPrimitive>> | undefined {
	if (!config || !isAutomationModelConfiguration(config)) {
		return undefined;
	}
	const preferences = modelConfigurationPreferences(config, true);
	return isAutomationModelConfiguration(preferences) && Object.keys(preferences).length ? preferences : undefined;
}

export class RemoteSessionService implements IRemoteSessionService {
	declare readonly _serviceBrand: undefined;

	private readonly pendingCreations = new Map<string, number>();
	private readonly lastSelected = new Map<string, number>();
	private readonly requests = new Map<string, { readonly input: string; readonly result: Promise<ICreatedRemoteSession> }>();
	private selectionSequence = 0;

	constructor(
		@ISessionsProvidersService private readonly providersService: ISessionsProvidersService,
		@ISessionsManagementService private readonly sessionsService: ISessionsManagementService,
		@IAgentHostConnectionsService private readonly connectionsService: IAgentHostConnectionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@ILogService private readonly logService: ILogService,
		@IRemoteSessionChatService private readonly backgroundChats: IRemoteSessionChatService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) { }

	listHosts(): readonly IRemoteSessionHost[] {
		this.checkEnabled();
		return this.remoteProviders().map(provider => this.describeHost(provider));
	}

	getHostRejections(hostId: string, workspace: IRemoteSessionWorkspace): readonly string[] {
		this.checkEnabled();
		const provider = this.remoteProviders().find(provider => provider.id === hostId);
		if (!provider) {
			return [localize('remoteSessions.hostUnavailable', "The host is not available in this Agents window.")];
		}
		return this.getCandidate(provider, { prompt: '', hostId, requirements: {}, workspace }).reasons;
	}

	getRequestedDestination(options: ICreateRemoteSessionOptions): IRemoteSessionDestination {
		const providers = this.remoteProviders();
		const requested = options.workspace?.uri;
		const pinnedBy = options.hostId ?? (requested?.scheme === AGENT_HOST_SCHEME ? requested.authority : undefined);
		const provider = options.hostId !== undefined
			? providers.find(provider => provider.id === options.hostId)
			: requested?.scheme === AGENT_HOST_SCHEME ? providers.find(provider => agentHostAuthority(provider.remoteAddress) === requested.authority) : undefined;
		let workspace: string | undefined;
		if (requested?.scheme === AGENT_HOST_SCHEME) {
			// Only the host's own connection decodes its URIs; creation fails for a URI of another host or an unavailable one.
			const uris = provider && requested.authority === agentHostAuthority(provider.remoteAddress)
				? this.connectionsService.getConnectionByAddress(provider.remoteAddress)?.resourceUris : undefined;
			workspace = uris ? getDirectoryLabel(uris.toAgentHost(requested)) : requested.path;
		} else if (requested) {
			workspace = getDirectoryLabel(requested);
		}
		return { host: provider && this.getHostName(provider, providers), pinnedBy, workspace };
	}

	async getSourceModel(source: URI, token: CancellationToken): Promise<IRemoteSessionSourceModelInfo | undefined> {
		this.checkEnabled();
		const { model } = await resolveRemoteSessionSource(source, this.sessionsService, this.connectionsService, token, true);
		if (!model) {
			return undefined;
		}
		const config = model.selection.config;
		const reasoningEffort = config?.[ReasoningEffortConfigKey] ?? config?.[CopilotReasoningEffortConfigKey];
		return {
			provider: model.provider,
			id: model.selection.id,
			...(typeof reasoningEffort === 'string' && isReasoningEffortLevel(reasoningEffort) ? { reasoningEffort } : {}),
		};
	}

	private getHostName(provider: RemoteSessionsProvider, providers: readonly RemoteSessionsProvider[]): IRemoteSessionHostName {
		const containerHost = provider.devContainerEnvironmentHost;
		if (containerHost === undefined) {
			return { label: provider.label };
		}
		return {
			label: provider.label,
			containerHost: containerHost === LocalDevContainerEnvironmentHost
				? localize('remoteSessions.thisComputer', "This Computer")
				: providers.find(host => host.remoteAddress === containerHost)?.label ?? containerHost,
		};
	}

	createSession(options: ICreateRemoteSessionOptions, source: URI, requestId: string, token: CancellationToken): Promise<ICreatedRemoteSession> {
		this.checkEnabled();
		const key = JSON.stringify([source.toString(), requestId]);
		const input = JSON.stringify(options);
		const previous = this.requests.get(key);
		if (previous) {
			if (previous.input !== input) {
				throw new Error(localize('remoteSessions.changedRetry', "A remote session creation request cannot be retried with different arguments."));
			}
			return previous.result;
		}
		if (this.requests.size >= maxRemoteSessionCreations) {
			throw new Error(localize('remoteSessions.creationLimit', "Remote session creation limit reached ({0} requests per window).", maxRemoteSessionCreations));
		}
		const result = this.doCreateSession(options, source, token);
		this.requests.set(key, { input, result });
		return result;
	}

	private checkEnabled(): void {
		if (!areRemoteSessionToolsEnabled(this.configurationService)) {
			throw new Error(localize('remoteSessions.disabled', "Remote session tools are disabled."));
		}
	}

	private remoteProviders(): RemoteSessionsProvider[] {
		return this.providersService.getProviders().filter(isAgentHostProvider).filter((provider): provider is RemoteSessionsProvider => provider.remoteAddress !== undefined);
	}

	private describeHost(provider: RemoteSessionsProvider): IRemoteSessionHost {
		const status = provider.connectionStatus?.get().kind ?? 'disconnected';
		const root = status === 'connected' ? provider.getRootState() : undefined;
		const agents = root?.agents.filter(agent => provider.sessionTypes.some(type =>
			type.chatSessionType === remoteAgentHostSessionTypeId(agentHostAuthority(provider.remoteAddress), agent.provider)
			&& type.authRequirement !== SessionTypeAuthRequirement.Unusable)) ?? [];
		const allModels = getRegisteredLanguageModels(this.languageModelsService);
		const workspaces = new Map<string, { readonly uri: string; readonly label: string }>();
		for (const session of provider.getSessions()) {
			const workspace = session.workspace.get();
			if (workspace) {
				workspaces.set(workspace.uri.toString(), { uri: workspace.uri.toString(), label: workspace.label });
			}
		}
		return {
			id: provider.id,
			label: provider.label,
			status,
			supportsRemoteSessions: root ? supportsRemoteSessions(root) : null,
			resources: readAgentHostResources(root),
			runningSessions: root?.activeSessions !== undefined && Number.isSafeInteger(root.activeSessions) && root.activeSessions >= 0 ? root.activeSessions : undefined,
			pendingCreations: this.pendingCreations.get(provider.id) ?? 0,
			agents: agents.map(agent => {
				const target = remoteAgentHostSessionTypeId(agentHostAuthority(provider.remoteAddress), agent.provider);
				const visibleModels = new Set(getVisibleLanguageModelsForTarget(allModels, target, this.languageModelsService).map(model => model.identifier));
				return {
					provider: agent.provider,
					models: agent.models.filter(model => model.policyState !== PolicyState.Disabled && visibleModels.has(`${target}:${model.id}`))
						.map(model => ({ id: model.id, name: model.name })),
					permissions: provider.getPermissionOptionsForCreation(agent.provider)
						.map(option => ({ id: option.id, label: option.label, ...(option.locked ? { locked: true as const } : {}) })),
				};
			}),
			workspaces: [...workspaces.values()],
		};
	}

	private getCandidate(provider: RemoteSessionsProvider, options: ICreateRemoteSessionOptions, sourceModel?: IRemoteSessionSourceModel): { candidate?: IRemoteSessionCandidate; reasons: string[] } {
		const connection = this.connectionsService.getConnectionByAddress(provider.remoteAddress);
		const host = this.describeHost(provider);
		const reasons = remoteSessionHostRejections(host, options);
		if (reasons.length) {
			return { reasons };
		}
		if (!connection) {
			reasons.push(localize('remoteSessions.connectionUnavailable', "The host connection is not available."));
		}
		if (provider.hostGroup?.connectable === false) {
			reasons.push(localize('remoteSessions.dedicatedHost', "This host is dedicated to an existing session."));
		}
		const authority = agentHostAuthority(provider.remoteAddress);
		const workspace = options.workspace?.uri.scheme === AGENT_HOST_SCHEME
			? options.workspace.uri
			: options.workspace ? provider.mapAgentHostResource(options.workspace.uri) : undefined;
		if (workspace && workspace.authority !== authority) {
			reasons.push(localize('remoteSessions.workspaceHostMismatch', "The workspace belongs to a different host."));
		}
		if (!workspace && !provider.supportsQuickChats) {
			reasons.push(localize('remoteSessions.workspaceRequired', "The host does not support workspace-less sessions."));
		}
		const types = workspace ? provider.getSessionTypes(workspace) : provider.sessionTypes;
		const qualifies = (agent: IRemoteSessionHost['agents'][number]) => {
			const target = remoteAgentHostSessionTypeId(authority, agent.provider);
			return matchesRemoteSessionAgent(agent, options)
				&& (agent.models.length > 0 || this.chatSessionsService.supportsAutoModelForSessionType(target))
				&& types.some(type => type.chatSessionType === target
					&& (!workspace || type.supportsWorktreeConfiguration === true));
		};
		// Without a requested model, the session continues on the source chat's model where an agent offers it.
		const offersSourceModel = (agent: IRemoteSessionHost['agents'][number]) => !options.model && !!sourceModel
			&& agent.provider === sourceModel.provider && agent.models.some(model => model.id === sourceModel.selection.id);
		const agent = host.agents.find(agent => offersSourceModel(agent) && qualifies(agent)) ?? host.agents.find(qualifies);
		const sessionType = agent && types.find(type => type.chatSessionType === remoteAgentHostSessionTypeId(authority, agent.provider));
		if (!sessionType) {
			reasons.push(localize('remoteSessions.unsupportedWorkspace', "No agent supports the requested workspace and isolation with an available model or Auto fallback."));
		}
		if (reasons.length || !sessionType || !agent || !connection) {
			return { reasons };
		}
		let modelId: string | undefined;
		let modelIdentifier: string | undefined;
		let modelConfiguration: Readonly<Record<string, JsonPrimitive>> | undefined;
		if (options.model) {
			modelId = options.model.id;
			modelIdentifier = `${remoteAgentHostSessionTypeId(authority, agent.provider)}:${options.model.id}`;
			// Like create_session, a named model keeps the source chat's options only while agents can choose model options.
			const sourceConfiguration = areRemoteSessionModelOptionsEnabled(this.configurationService)
				&& sourceModel?.provider === options.model.provider && sourceModel.selection.id === options.model.id
				? toInheritedModelConfiguration(sourceModel.selection.config) : undefined;
			modelConfiguration = this.getModelConfiguration(provider, modelIdentifier, options.model, options, reasons, sourceConfiguration);
			if (reasons.length) {
				return { reasons };
			}
		} else if (sourceModel && offersSourceModel(agent)) {
			modelId = sourceModel.selection.id;
			modelIdentifier = `${remoteAgentHostSessionTypeId(authority, agent.provider)}:${modelId}`;
			modelConfiguration = provider.supportsModelConfigurationForCreation === true
				? toInheritedModelConfiguration(sourceModel.selection.config) : undefined;
		}
		return {
			candidate: {
				provider, connection, clientId: connection.clientId, host, sessionType, agentProvider: agent.provider, workspace,
				modelId, modelIdentifier, modelConfiguration,
			},
			reasons,
		};
	}

	/**
	 * The configuration a new session on {@link provider} starts with for the model: the source chat's configuration
	 * when it runs on the same model, else the user's saved choices for it, as the model picker applies them to a new
	 * session, with the requested reasoning effort and context tier set as explicit choices. Adds a reason to
	 * {@link reasons} for a requested option the model does not offer on the host.
	 */
	private getModelConfiguration(provider: RemoteSessionsProvider, modelIdentifier: string, model: IRemoteSessionModel, options: ICreateRemoteSessionOptions, reasons: string[], sourceConfiguration: Readonly<Record<string, JsonPrimitive>> | undefined): Readonly<Record<string, JsonPrimitive>> | undefined {
		const modelLabel = `${model.provider}/${model.id}`;
		if (provider.supportsModelConfigurationForCreation !== true) {
			if (options.reasoningEffort !== undefined || options.contextTier !== undefined) {
				reasons.push(localize('remoteSessions.modelOptionsUnsupported', "The host cannot apply a reasoning effort or context tier to a new session."));
			}
			return undefined;
		}
		const properties = this.languageModelsService.lookupLanguageModel(modelIdentifier)?.configurationSchema?.properties;
		const requested: Record<string, JsonPrimitive> = {};
		if (options.reasoningEffort !== undefined) {
			const key = properties?.[ReasoningEffortConfigKey] ? ReasoningEffortConfigKey : CopilotReasoningEffortConfigKey;
			const property = properties?.[key];
			if (!property?.enum?.includes(options.reasoningEffort)) {
				reasons.push(property?.enum?.length
					? localize('remoteSessions.unsupportedReasoningEffort', "Model {0} does not support reasoning effort {1}. Use one of: {2}.", modelLabel, options.reasoningEffort, property.enum.join(', '))
					: localize('remoteSessions.noReasoningEffort', "Model {0} has no reasoning effort option.", modelLabel));
			} else if (property.readOnly) {
				reasons.push(localize('remoteSessions.reasoningEffortLocked', "Reasoning effort is locked for model {0}.", modelLabel));
			} else {
				requested[key] = options.reasoningEffort;
			}
		}
		if (options.contextTier !== undefined) {
			const key = properties?.[ContextSizeConfigKey] ? ContextSizeConfigKey : ContextTierConfigKey;
			const property = properties?.[key];
			const value = key === ContextSizeConfigKey ? getContextSizeForTier(property, options.contextTier) : options.contextTier;
			if (!property || (key === ContextSizeConfigKey && (property.enum?.length ?? 0) < 2)) {
				reasons.push(localize('remoteSessions.singleContextWindow', "Model {0} has a single context window, so a context tier does not apply.", modelLabel));
			} else if (value === undefined || !property.enum?.includes(value)) {
				reasons.push(localize('remoteSessions.unsupportedContextTier', "Model {0} does not support context tier {1}.", modelLabel, options.contextTier));
			} else if (property.readOnly) {
				reasons.push(localize('remoteSessions.contextSizeLocked', "Context size is locked for model {0}.", modelLabel));
			} else {
				requested[key] = value;
			}
		}
		if (reasons.length) {
			return undefined;
		}
		const withRequested = (base: Readonly<Record<string, JsonPrimitive>> | undefined) => Object.keys(requested).length
			? withExplicitModelConfiguration({ id: modelIdentifier, config: { ...base } }, requested).config
			: base;
		if (sourceConfiguration) {
			return withRequested(sourceConfiguration);
		}
		const saved = new AutomationModelConfiguration(this.languageModelsService);
		try {
			return withRequested(saved.captureModelConfiguration(modelIdentifier));
		} catch (error) {
			if (!(error instanceof InvalidStoredModelConfigurationError)) {
				throw error;
			}
			this.logService.warn(`[RemoteSessions] Invalid saved options for ${modelIdentifier}`, error);
			reasons.push(localize('remoteSessions.invalidSavedModelOptions', "Saved options for model {0} must contain only JSON primitive values.", modelLabel));
			return undefined;
		} finally {
			saved.dispose();
		}
	}

	private assertTargetConnection(candidate: IRemoteSessionCandidate): void {
		const connection = this.connectionsService.getConnectionByAddress(candidate.provider.remoteAddress);
		if (!this.remoteProviders().includes(candidate.provider)
			|| candidate.provider.connectionStatus?.get().kind !== 'connected'
			|| connection !== candidate.connection
			|| connection?.clientId !== candidate.clientId) {
			throw new Error(localize('remoteSessions.connectionChanged', "Remote agent host {0} connection changed during session creation.", candidate.host.label));
		}
	}

	private async candidates(options: ICreateRemoteSessionOptions, sourceModel: IRemoteSessionSourceModel | undefined, token: CancellationToken): Promise<(IRemoteSessionCandidate & { needsTrust: boolean })[]> {
		const rejected: { hostId: string; reasons: string[] }[] = [];
		const candidates = await Promise.all(this.remoteProviders().map(async provider => {
			const { candidate, reasons } = this.getCandidate(provider, options, sourceModel);
			let needsTrust = false;
			if (candidate?.workspace) {
				try {
					const [stat, trust] = await raceCancellationError(Promise.all([
						this.fileService.stat(candidate.workspace),
						this.workspaceTrustService.getUriTrustInfo(candidate.workspace),
					]), token);
					if (!stat.isDirectory) {
						reasons.push(localize('remoteSessions.workspaceNotDirectory', "The workspace is not a directory."));
					}
					const directory = candidate.connection.resourceUris.toAgentHost(candidate.workspace);
					if (directory.path !== candidate.workspace.path || (!trust.trusted && directory.authority)) {
						// The trust store keys remote folders by host and visible path, not by wrapper query metadata.
						reasons.push(localize('remoteSessions.ambiguousTrustFolder', "Workspace Trust cannot identify this remote folder unambiguously."));
					}
					needsTrust = !trust.trusted;
				} catch (error) {
					if (token.isCancellationRequested) {
						throw new CancellationError();
					}
					this.logService.warn(`[RemoteSessions] Could not inspect workspace on ${provider.id}`, error);
					reasons.push(localize('remoteSessions.workspaceInspectionFailed', "Workspace inspection failed: {0}", toErrorMessage(error)));
				}
			}
			// Requested permissions and mode depend on each host's configuration, so only those hosts are asked for it.
			if (candidate && !reasons.length && (options.permissions !== undefined || options.mode !== undefined)) {
				try {
					const config = await raceCancellationError(candidate.provider.resolveSessionConfigForCreation(candidate.workspace, candidate.sessionType.id, token), token);
					reasons.push(...this.getRequestedSettingRejections(candidate, config, options));
				} catch (error) {
					if (token.isCancellationRequested) {
						throw new CancellationError();
					}
					this.logService.warn(`[RemoteSessions] Could not resolve the session configuration on ${provider.id}`, error);
					reasons.push(localize('remoteSessions.configurationUnavailable', "The session configuration could not be resolved: {0}", toErrorMessage(error)));
				}
			}
			if (reasons.length || !candidate) {
				rejected.push({ hostId: provider.id, reasons });
				return undefined;
			}
			return { ...candidate, needsTrust };
		}));
		const eligible = candidates.filter(candidate => candidate !== undefined);
		if (!eligible.length) {
			throw new Error(localize('remoteSessions.noMatchingHost', "No connected remote agent host matches this request. {0}", JSON.stringify(rejected)));
		}
		return eligible;
	}

	private async doCreateSession(options: ICreateRemoteSessionOptions, sourceResource: URI, token: CancellationToken): Promise<ICreatedRemoteSession> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const source = await resolveRemoteSessionSource(sourceResource, this.sessionsService, this.connectionsService, token, true);
		const depth = source.depth + 1;
		if (depth > maxRemoteSessionDepth) {
			throw new Error(localize('remoteSessions.recursionLimit', "Remote session recursion limit reached (maximum depth {0}).", maxRemoteSessionDepth));
		}
		const sourceSettings = await this.readSourceSettings(source, token);
		const candidates = await this.candidates(options, source.model, token);
		this.checkEnabled();
		assertRemoteSessionSource(source, this.sessionsService, this.connectionsService);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const load = (candidate: IRemoteSessionCandidate) => (candidate.provider.getRootState()?.activeSessions ?? Number.POSITIVE_INFINITY) + (this.pendingCreations.get(candidate.host.id) ?? 0);
		candidates.sort((a, b) => Number(a.needsTrust) - Number(b.needsTrust)
			|| load(a) - load(b)
			|| (this.lastSelected.get(a.host.id) ?? 0) - (this.lastSelected.get(b.host.id) ?? 0)
			|| a.host.id.localeCompare(b.host.id));
		const selected = candidates[0];
		this.assertTargetConnection(selected);
		const pendingCreations = this.pendingCreations.get(selected.host.id) ?? 0;
		this.pendingCreations.set(selected.host.id, pendingCreations + 1);
		this.lastSelected.set(selected.host.id, ++this.selectionSequence);
		let background: IRemoteSessionChatReference | undefined;
		try {
			if (selected.needsTrust && selected.workspace) {
				const trusted = await raceCancellationError(this.workspaceTrustRequestService.requestResourcesTrust({
					uri: selected.workspace,
					remoteHostLabel: selected.host.label,
					message: localize('remoteSessions.trustFolder', "An agent session will be able to read files, run commands, and make changes in this folder."),
				}), token);
				if (!trusted) {
					throw new Error(localize('remoteSessions.workspaceNotTrusted', "The remote session was not created because the folder on {0} was not trusted.", selected.host.label));
				}
				this.checkEnabled();
				assertRemoteSessionSource(source, this.sessionsService, this.connectionsService);
				this.assertTargetConnection(selected);
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
			}
			const { candidate: target, reasons } = this.getCandidate(selected.provider, options, source.model);
			if (!target) {
				throw new Error(localize('remoteSessions.hostNoLongerMatches', "Remote agent host {0} no longer matches this request. {1}", selected.host.label, JSON.stringify(reasons)));
			}
			if (!isEqual(target.workspace, selected.workspace)) {
				throw new Error(localize('remoteSessions.workspaceChanged', "Remote agent host {0} workspace changed during session creation.", target.host.label));
			}
			const runningSessions = target.host.runningSessions;
			if (runningSessions === undefined) {
				throw new Error(localize('remoteSessions.workloadLost', "Remote agent host {0} no longer reports its workload.", target.host.label));
			}
			const settings = await this.resolveSettings(target, options, { ...sourceSettings, agentProvider: source.agentProvider }, token);
			this.checkEnabled();
			assertRemoteSessionSource(source, this.sessionsService, this.connectionsService);
			this.assertTargetConnection(target);
			const origin = { session: source.session.resource.toString(), chat: source.chat.resource.toString(), depth };
			const metadata = withSessionCreationReference(withRemoteSessionOrigin(undefined, origin), {
				session: origin.session,
				chat: origin.chat,
			});
			const createOptions: ICreateNewSessionOptions = {
				providerId: target.provider.id,
				sessionTypeId: target.sessionType.id,
				modelId: target.modelIdentifier,
				...(target.modelConfiguration ? { modelConfiguration: target.modelConfiguration } : {}),
				...(settings.permission ? { permissionId: settings.permission.id } : {}),
				...(settings.mode ? { modeId: settings.mode.id } : {}),
				metadata,
				onSessionCreated: async session => {
					background = await this.backgroundChats.acquire(session.mainChat.get().resource, token);
					this.checkEnabled();
					assertRemoteSessionSource(source, this.sessionsService, this.connectionsService);
					this.assertTargetConnection(target);
				},
				...(options.workspace ? {
					isolationMode: options.workspace.isolation === 'folder' ? 'workspace' : 'worktree',
					branch: options.workspace.branch,
				} : {}),
			};
			const request = {
				query: options.prompt,
				metadata: toRemoteSessionMessageMetadata(origin.session, source.sourceChat),
				title: options.title,
				background: true,
			};
			const created = target.workspace
				? await this.sessionsService.createAndSendNewChatRequest(target.workspace, request, createOptions, token)
				: await this.sessionsService.createAndSendQuickChatRequest(request, createOptions, token);
			if (!created) {
				throw new Error(localize('remoteSessions.creationUnconfirmed', "Remote session creation ended without a committed session. Do not retry automatically."));
			}
			background?.releaseWhenIdle();
			background = undefined;
			const chat = created.mainChat.get();
			const worktreePending = created.worktreePending?.get() === true;
			const folder = created.workspace.get()?.folders[0];
			const selectedModelId = chat.modelId.get() ?? created.modelId.get();
			const modelId = target.modelId ?? (selectedModelId
				? target.provider.getModelsSnapshot(created.sessionId).models.find(model => model.identifier === selectedModelId)?.metadata.id
				: undefined);
			return {
				status: 'started',
				session: created.resource.toString(),
				chat: chat.resource.toString(),
				openLink: buildOpenSessionLinkUri(created.resource, chat.resource.fragment),
				host: { id: target.host.id, label: target.host.label },
				model: { provider: target.agentProvider, id: modelId ?? null },
				permissions: settings.permission ?? null,
				mode: settings.mode ?? null,
				notInherited: settings.notInherited,
				workspace: target.workspace && options.workspace ? {
					requestedUri: target.workspace.toString(),
					uri: !worktreePending && folder ? folder.workingDirectory.toString() : null,
					isolation: options.workspace.isolation,
					branch: !worktreePending ? folder?.gitRepository?.branchName : undefined,
					baseBranch: !worktreePending ? folder?.gitRepository?.baseBranchName : undefined,
					worktreePending,
				} : null,
				placement: { runningSessions, pendingCreations },
			};
		} finally {
			background?.dispose();
			const remaining = (this.pendingCreations.get(selected.host.id) ?? 1) - 1;
			if (remaining) {
				this.pendingCreations.set(selected.host.id, remaining);
			} else {
				this.pendingCreations.delete(selected.host.id);
			}
		}
	}

	/** Reads the creating chat's permissions and mode as its provider presents them, like model comparisons do. */
	private async readSourceSettings(source: IRemoteSessionSource, token: CancellationToken): Promise<IRemoteSessionSourceSettings> {
		const { sessionId, providerId } = source.session;
		const provider = this.providersService.getProvider(providerId, sessionId);
		if (!provider || !isAgentHostProvider(provider)) {
			return {};
		}
		try {
			const lease = await provider.acquireSessionConfig(sessionId, source.chat.resource, token);
			try {
				const config = provider.getSessionConfig(sessionId, source.chat.resource);
				const modeProperty = getSessionModeProperty(config?.schema);
				const mode = modeProperty && config ? config.values[modeProperty.key] ?? modeProperty.schema.default : undefined;
				return {
					permission: provider.getPermissionOptionForSession?.(sessionId, source.chat.resource),
					...(isString(mode) ? { mode } : {}),
				};
			} finally {
				lease.dispose();
			}
		} catch (error) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this.logService.warn('[RemoteSessions] Could not read the configuration of the creating chat', error);
			return {};
		}
	}

	/** Permission choices the target's resolved configuration can apply now, without policy-locked ones. */
	private getApplicablePermissions(target: IRemoteSessionCandidate, config: ResolveSessionConfigResult): readonly ISessionPermissionOption[] {
		return target.provider.getPermissionOptionsForCreation(target.sessionType.id, config).filter(option => !option.locked);
	}

	/** Why the target's resolved configuration cannot apply the requested permissions and mode; empty when it can. */
	private getRequestedSettingRejections(target: IRemoteSessionCandidate, config: ResolveSessionConfigResult, options: ICreateRemoteSessionOptions): string[] {
		const reasons: string[] = [];
		if (options.permissions !== undefined) {
			const permissions = this.getApplicablePermissions(target, config);
			if (!permissions.some(option => option.id === options.permissions)) {
				reasons.push(localize('remoteSessions.permissionNotOffered', "Permission {0} is not available for {1}. Available: {2}.", options.permissions, target.agentProvider, permissions.map(option => option.id).join(', ') || localize('remoteSessions.none', "none")));
			}
		}
		if (options.mode !== undefined && !getWritableModes(config).includes(options.mode)) {
			reasons.push(localize('remoteSessions.modeNotOffered', "Mode {0} is not available for {1}.", options.mode, target.agentProvider));
		}
		return reasons;
	}

	/**
	 * Applies requested permissions and mode strictly, and otherwise inherits the creating chat's where the target offers
	 * them. Neither may exceed the creating chat's: the fallbacks are the target's default permissions and interactive
	 * mode, not the user's remembered or configured defaults, which could be more permissive.
	 */
	private async resolveSettings(target: IRemoteSessionCandidate, options: ICreateRemoteSessionOptions, source: IRemoteSessionSourceSettings & { readonly agentProvider?: string }, token: CancellationToken): Promise<IRemoteSessionSettings> {
		const notInherited: string[] = [];
		const host = target.host.label;
		const sameAgent = source.agentProvider === target.agentProvider;
		const config = await raceCancellationError(target.provider.resolveSessionConfigForCreation(target.workspace, target.sessionType.id, token), token);
		const rejections = this.getRequestedSettingRejections(target, config, options);
		if (rejections.length) {
			throw new Error(localize('remoteSessions.hostNoLongerMatches', "Remote agent host {0} no longer matches this request. {1}", host, JSON.stringify(rejections)));
		}

		const permissions = this.getApplicablePermissions(target, config);
		let permission: IRemoteSessionSettings['permission'];
		if (options.permissions !== undefined) {
			const option = permissions.find(option => option.id === options.permissions)!;
			if (option.isElevated && !(source.permission?.isAllowAll || (sameAgent && source.permission?.id === option.id))) {
				throw new Error(localize('remoteSessions.permissionEscalation', "Permission {0} is more permissive than the creating chat's permissions ({1}).", option.id, source.permission?.label ?? localize('remoteSessions.unknownPermission', "unknown")));
			}
			permission = { id: option.id, source: 'explicit' };
		} else {
			const sourcePermission = source.permission;
			// Across agents, only allow-all and the default correspond.
			const inherited = sourcePermission && permissions.find(option => sameAgent ? option.id === sourcePermission.id
				: sourcePermission.isAllowAll ? option.isAllowAll === true : sourcePermission.isDefault === true && option.isDefault === true);
			const fallback = permissions.find(option => option.isDefault);
			if (inherited) {
				permission = { id: inherited.id, source: 'inherited' };
			} else if (fallback) {
				permission = { id: fallback.id, source: 'default' };
				notInherited.push(sourcePermission
					? localize('remoteSessions.permissionNotInherited', "Permission {0} is not available for {1} on {2}; {3} is used.", sourcePermission.label, target.agentProvider, host, fallback.label)
					: localize('remoteSessions.permissionUnknown', "The creating chat's permissions could not be read; {0} is used.", fallback.label));
			} else if (sourcePermission && !sourcePermission.isDefault) {
				notInherited.push(localize('remoteSessions.permissionNotConfigurable', "Permission {0} is not available for {1} on {2}; the agent's default behavior is used.", sourcePermission.label, target.agentProvider, host));
			}
		}

		const modes = getWritableModes(config);
		let mode: IRemoteSessionSettings['mode'];
		if (options.mode !== undefined) {
			if (options.mode === 'autopilot' && source.mode !== 'autopilot') {
				throw new Error(localize('remoteSessions.autopilotEscalation', "Mode {0} is only available when the creating chat uses it.", 'autopilot'));
			}
			mode = { id: options.mode, source: 'explicit' };
		} else if (source.mode && modes.includes(source.mode)) {
			mode = { id: source.mode, source: 'inherited' };
		} else if (modes.includes('interactive')) {
			mode = { id: 'interactive', source: 'default' };
			if (source.mode && source.mode !== 'interactive') {
				notInherited.push(localize('remoteSessions.modeNotInherited', "Mode {0} is not available for {1} on {2}; {3} is used.", source.mode, target.agentProvider, host, 'interactive'));
			}
		} else if (source.mode && source.mode !== 'interactive') {
			notInherited.push(localize('remoteSessions.modeNotConfigurable', "Mode {0} is not available for {1} on {2}; the agent's default behavior is used.", source.mode, target.agentProvider, host));
		}

		return { permission, mode, notInherited };
	}
}

/** The modes a new session can be configured with. */
function getWritableModes(config: ResolveSessionConfigResult): readonly string[] {
	const property = getSessionModeProperty(config.schema);
	return property && isSessionConfigWritable(property.schema, true) ? (property.schema.enum ?? []).filter(isString) : [];
}
