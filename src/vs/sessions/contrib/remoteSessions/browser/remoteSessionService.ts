/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { remoteAgentHostSessionTypeId } from '../../../../platform/agentHost/common/agentHostSessionType.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { readAgentHostResources } from '../../../../platform/agentHost/common/meta/agentHostResources.js';
import { supportsRemoteSessions, toRemoteSessionMessageMetadata, withRemoteSessionOrigin } from '../../../../platform/agentHost/common/meta/agentRemoteSessionMeta.js';
import { buildOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { PolicyState } from '../../../../platform/agentHost/common/state/protocol/channels-root/state.js';
import { withSessionCreationReference } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionType, SessionTypeAuthRequirement } from '../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ICreatedRemoteSession, ICreateRemoteSessionOptions, IRemoteSessionHost, IRemoteSessionService, remoteSessionHostRejections } from '../common/remoteSessions.js';
import { resolveRemoteSessionSource } from './remoteSessionSource.js';
import { IRemoteSessionChatReference, IRemoteSessionChatService } from './remoteSessionChatService.js';

interface IRemoteSessionCandidate {
	readonly provider: IAgentHostSessionsProvider;
	readonly host: IRemoteSessionHost;
	readonly sessionType: ISessionType;
	readonly agentProvider: string;
	readonly modelIdentifier?: string;
	readonly workspace?: URI;
}

type RemoteSessionsProvider = IAgentHostSessionsProvider & { readonly remoteAddress: string };

const maxRemoteSessionCreations = 25;
const maxRemoteSessionDepth = 3;

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
		@ILogService private readonly logService: ILogService,
		@IRemoteSessionChatService private readonly backgroundChats: IRemoteSessionChatService,
	) { }

	listHosts(): readonly IRemoteSessionHost[] {
		this.checkEnabled();
		return this.remoteProviders().map(provider => this.describeHost(provider));
	}

	createSession(options: ICreateRemoteSessionOptions, source: URI, requestId: string, token: CancellationToken): Promise<ICreatedRemoteSession> {
		this.checkEnabled();
		const key = JSON.stringify([source.toString(), requestId]);
		const input = JSON.stringify(options);
		const previous = this.requests.get(key);
		if (previous) {
			if (previous.input !== input) {
				throw new Error('A remote session creation request cannot be retried with different arguments.');
			}
			return previous.result;
		}
		if (this.requests.size >= maxRemoteSessionCreations) {
			throw new Error(`Remote session creation limit reached (${maxRemoteSessionCreations} requests per window).`);
		}
		const result = this.doCreateSession(options, source, token);
		this.requests.set(key, { input, result });
		return result;
	}

	private checkEnabled(): void {
		if (this.configurationService.getValue<boolean>('chat.disableAIFeatures')
			|| this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId) !== true) {
			throw new Error('Remote agent hosts are disabled.');
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
			agents: agents.map(agent => ({
				provider: agent.provider,
				models: agent.models.filter(model => model.policyState !== PolicyState.Disabled).map(model => ({ id: model.id, name: model.name })),
			})),
			workspaces: [...workspaces.values()],
		};
	}

	private async candidates(options: ICreateRemoteSessionOptions, token: CancellationToken): Promise<IRemoteSessionCandidate[]> {
		const rejected: { hostId: string; reasons: string[] }[] = [];
		const candidates = await Promise.all(this.remoteProviders().map(async provider => {
			const host = this.describeHost(provider);
			const reasons = remoteSessionHostRejections(host, options);
			if (reasons.length) {
				rejected.push({ hostId: host.id, reasons });
				return undefined;
			}
			if (provider.hostGroup?.connectable === false) {
				reasons.push('This host is dedicated to an existing session.');
			}
			const authority = agentHostAuthority(provider.remoteAddress);
			const workspace = options.workspace?.uri.scheme === AGENT_HOST_SCHEME
				? options.workspace.uri
				: options.workspace ? provider.mapAgentHostResource(options.workspace.uri) : undefined;
			if (workspace && workspace.authority !== authority) {
				reasons.push('The workspace belongs to a different host.');
			}
			if (!workspace && !provider.supportsQuickChats) {
				reasons.push('The host does not support workspace-less sessions.');
			}
			const types = workspace ? provider.getSessionTypes(workspace) : provider.sessionTypes;
			const agent = host.agents.find(agent => (options.model === undefined || options.model.provider === agent.provider)
				&& types.some(type => type.chatSessionType === remoteAgentHostSessionTypeId(authority, agent.provider)
					&& (!workspace || type.supportsWorktreeConfiguration === true)));
			const sessionType = agent && types.find(type => type.chatSessionType === remoteAgentHostSessionTypeId(authority, agent.provider));
			if (!sessionType) {
				reasons.push('No agent supports the requested workspace and isolation.');
			}
			if (!reasons.length && workspace) {
				try {
					const [stat, trust] = await raceCancellationError(Promise.all([
						this.fileService.stat(workspace),
						this.workspaceTrustService.getUriTrustInfo(workspace),
					]), token);
					if (!stat.isDirectory) {
						reasons.push('The workspace is not a directory.');
					}
					if (!trust.trusted) {
						reasons.push('The workspace is not trusted. Trust it before starting an unattended session.');
					}
				} catch (error) {
					if (token.isCancellationRequested) {
						throw new CancellationError();
					}
					this.logService.warn(`[RemoteSessions] Could not inspect workspace on ${provider.id}`, error);
					reasons.push(`Workspace inspection failed: ${toErrorMessage(error)}`);
				}
			}
			if (reasons.length || !sessionType || !agent) {
				rejected.push({ hostId: host.id, reasons });
				return undefined;
			}
			return {
				provider, host, sessionType, agentProvider: agent.provider, workspace,
				modelIdentifier: options.model ? `${remoteAgentHostSessionTypeId(authority, agent.provider)}:${options.model.id}` : undefined,
			};
		}));
		const eligible = candidates.filter(candidate => candidate !== undefined);
		if (!eligible.length) {
			throw new Error(`No connected remote agent host matches this request. ${JSON.stringify(rejected)}`);
		}
		return eligible;
	}

	private async doCreateSession(options: ICreateRemoteSessionOptions, sourceResource: URI, token: CancellationToken): Promise<ICreatedRemoteSession> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const source = await resolveRemoteSessionSource(sourceResource, this.sessionsService, this.connectionsService, token);
		const depth = source.depth + 1;
		if (depth > maxRemoteSessionDepth) {
			throw new Error(`Remote session recursion limit reached (maximum depth ${maxRemoteSessionDepth}).`);
		}
		const candidates = await this.candidates(options, token);
		this.checkEnabled();
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const load = (candidate: IRemoteSessionCandidate) => (candidate.provider.getRootState()?.activeSessions ?? Number.POSITIVE_INFINITY) + (this.pendingCreations.get(candidate.host.id) ?? 0);
		candidates.sort((a, b) => load(a) - load(b)
			|| (this.lastSelected.get(a.host.id) ?? 0) - (this.lastSelected.get(b.host.id) ?? 0)
			|| a.host.id.localeCompare(b.host.id));
		const target = candidates[0];
		if (target.provider.connectionStatus?.get().kind !== 'connected') {
			throw new Error(`Remote agent host ${target.host.label} disconnected before session creation.`);
		}
		const pendingCreations = this.pendingCreations.get(target.host.id) ?? 0;
		const runningSessions = target.provider.getRootState()?.activeSessions;
		if (runningSessions === undefined) {
			throw new Error(`Remote agent host ${target.host.label} no longer reports its workload.`);
		}
		this.pendingCreations.set(target.host.id, pendingCreations + 1);
		this.lastSelected.set(target.host.id, ++this.selectionSequence);
		let background: IRemoteSessionChatReference | undefined;
		try {
			const origin = { session: source.session.resource.toString(), chat: source.chat.resource.toString(), depth };
			const metadata = withSessionCreationReference(withRemoteSessionOrigin(undefined, origin), {
				session: origin.session,
				chat: origin.chat,
			});
			const createOptions: ICreateNewSessionOptions = {
				providerId: target.provider.id,
				sessionTypeId: target.sessionType.id,
				modelId: target.modelIdentifier,
				metadata,
				onSessionCreated: async session => {
					background = await this.backgroundChats.acquire(session.mainChat.get().resource, token);
				},
				...(options.workspace ? {
					isolationMode: options.workspace.isolation === 'folder' ? 'workspace' : 'worktree',
					branch: options.workspace.branch,
					worktreeCreateNewBranch: options.workspace.isolation === 'worktree',
				} : {}),
			};
			const request = {
				query: options.prompt,
				metadata: toRemoteSessionMessageMetadata(origin),
				title: options.title,
				background: true,
			};
			const created = target.workspace
				? await this.sessionsService.createAndSendNewChatRequest(target.workspace, request, createOptions, token)
				: await this.sessionsService.createAndSendQuickChatRequest(request, createOptions, token);
			if (!created) {
				throw new Error('Remote session creation ended without a committed session. Do not retry automatically.');
			}
			background?.releaseWhenIdle();
			background = undefined;
			const chat = created.mainChat.get();
			const worktreePending = created.worktreePending?.get() === true;
			const folder = created.workspace.get()?.folders[0];
			const selectedModelId = chat.modelId.get() ?? created.modelId.get();
			const modelId = options.model?.id ?? (selectedModelId
				? target.provider.getModelsSnapshot(created.sessionId).models.find(model => model.identifier === selectedModelId)?.metadata.id
				: undefined);
			return {
				status: 'started',
				session: created.resource.toString(),
				chat: chat.resource.toString(),
				openLink: buildOpenSessionLinkUri(created.resource, chat.resource.fragment),
				host: { id: target.host.id, label: target.host.label },
				model: { provider: target.agentProvider, id: modelId ?? null },
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
			const remaining = (this.pendingCreations.get(target.host.id) ?? 1) - 1;
			if (remaining) {
				this.pendingCreations.set(target.host.id, remaining);
			} else {
				this.pendingCreations.delete(target.host.id);
			}
		}
	}
}
