/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import * as resources from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { editorWindowAgentHostClientInfo } from '../../../../platform/agentHost/common/agentHostClientInfo.js';
import { agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { remoteAgentHostSessionTypeId } from '../../../../platform/agentHost/common/agentHostSessionType.js';
import { AgentHostProtocolClient } from '../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { WebSocketClientTransport } from '../../../../platform/agentHost/browser/webSocketClientTransport.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IAgentHostFileSystemService } from '../../../services/agentHost/common/agentHostFileSystemService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { AgentHostLanguageModelProvider, agentHostProviderSupportsAutoModel } from '../browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { AgentHostSessionHandler } from '../browser/agentSessions/agentHost/agentHostSessionHandler.js';
import { IChatService } from '../common/chatService/chatService.js';
import { IChatSessionsService } from '../common/chatSessionsService.js';
import { ILanguageModelsService } from '../common/languageModels.js';
import { ChatSessionPosition, getResourceForNewChatSession, openChatSession } from '../browser/chatSessions/chatSessions.contribution.js';
import { ChatEditorInput } from '../browser/widgetHosts/editor/chatEditorInput.js';
import { getEvaluationSessionConfig, isEvaluationAutoApprovePolicyRestricted, markEvaluationSessionRequestActive, readEvaluationSessionRequest, waitForEvaluationTarget, writeEvaluationSessionError, writeEvaluationSessionIdentity } from '../browser/agentSessions/evaluation/evaluationSessionRequest.js';

class EvaluationSessionEditorContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.evaluationSessionEditor';

	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const path = environmentService.evaluationSessionRequest;
		if (!path) {
			return;
		}
		markEvaluationSessionRequestActive();
		this._register(instantiationService.createInstance(EvaluationSessionEditorRunner, path));
	}
}

class EvaluationSessionEditorRunner extends Disposable {
	private readonly evaluationRemoteStore = this._register(new DisposableStore());

	constructor(
		path: string,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IFileService fileService: IFileService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IChatService chatService: IChatService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
		@IAgentHostFileSystemService agentHostFileSystemService: IAgentHostFileSystemService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		logService.info('[EvaluationSession] Editor request detected.');
		void runEditorEvaluationSession(
			path,
			fileService,
			logService,
			instantiationService,
			chatSessionsService,
			chatService,
			languageModelsService,
			agentHostFileSystemService,
			workspaceContextService,
			editorGroupService,
			editorService,
			configurationService,
			this.evaluationRemoteStore,
		);
	}
}

async function runEditorEvaluationSession(
	path: string,
	fileService: IFileService,
	logService: ILogService,
	instantiationService: IInstantiationService,
	chatSessionsService: IChatSessionsService,
	chatService: IChatService,
	languageModelsService: ILanguageModelsService,
	agentHostFileSystemService: IAgentHostFileSystemService,
	workspaceContextService: IWorkspaceContextService,
	editorGroupService: IEditorGroupsService,
	editorService: IEditorService,
	configurationService: IConfigurationService,
	evaluationRemoteStore: DisposableStore,
): Promise<void> {
	try {
		logService.info('[EvaluationSession] Reading Editor request.');
		const request = await readEvaluationSessionRequest(path, fileService);
		if (request.surface !== 'editor') {
			throw new Error(`Evaluation session request targets '${request.surface}', not 'editor'.`);
		}
		const type = request.remoteHost
			? await registerEvaluationRemoteAgent(
				request.remoteHost.address,
				request.remoteHost.connectionToken,
				request.agent,
				instantiationService,
				chatSessionsService,
				languageModelsService,
				agentHostFileSystemService,
				workspaceContextService,
				evaluationRemoteStore,
			)
			: `agent-host-${request.agent}`;
		logService.info(`[EvaluationSession] Waiting for Editor target '${type}'.`);
		await waitForEvaluationTarget(
			() => chatSessionsService.getChatSessionContribution(type) !== undefined,
			chatSessionsService.onDidChangeItemsProviders,
			CancellationToken.None,
		);
		logService.info(`[EvaluationSession] Editor target '${type}' is available.`);

		const newSessionOptions = {
			type,
			position: ChatSessionPosition.Editor,
			displayName: localize('evaluationSession.editorTitle', "{0} evaluation", request.agent),
		};
		const sessionResource = getResourceForNewChatSession(newSessionOptions);
		const openOptions = { ...newSessionOptions, resource: sessionResource };
		await instantiationService.invokeFunction(openAccessor => openChatSession(openAccessor, openOptions));

		const result = await chatService.sendRequest(sessionResource, request.prompt, {
			agentIdSilent: type,
			userSelectedModelId: request.modelId,
			agentHostSessionConfig: {
				...getEvaluationSessionConfig(
					request.agent,
					request.approvals,
					isEvaluationAutoApprovePolicyRestricted(configurationService),
				),
			},
		});
		if (result.kind === 'rejected') {
			throw new Error(`Evaluation session request was rejected: ${result.reason}`);
		}
		if (result.kind !== 'sent') {
			throw new Error(`Evaluation session request was not sent (${result.kind}).`);
		}
		const finalResource = result.newSessionResource ?? sessionResource;
		if (!resources.isEqual(finalResource, sessionResource)) {
			for (const group of editorGroupService.groups) {
				const editor = group.editors.find(candidate => candidate instanceof ChatEditorInput && resources.isEqual(candidate.sessionResource, sessionResource));
				if (editor) {
					await editorService.replaceEditors([{
						editor,
						replacement: {
							resource: finalResource,
							options: { override: ChatEditorInput.EditorID, pinned: true },
						},
					}], group);
					break;
				}
			}
		}
		await writeEvaluationSessionIdentity(path, fileService, request, finalResource);
	} catch (error) {
		logService.error('[EvaluationSession] Editor run failed.', error);
		await writeEvaluationSessionError(path, fileService, error);
	}
}

async function registerEvaluationRemoteAgent(
	address: string,
	connectionToken: string,
	provider: string,
	instantiationService: IInstantiationService,
	chatSessionsService: IChatSessionsService,
	languageModelsService: ILanguageModelsService,
	agentHostFileSystemService: IAgentHostFileSystemService,
	workspaceContextService: IWorkspaceContextService,
	evaluationRemoteStore: DisposableStore,
): Promise<string> {
	const authority = agentHostAuthority(address);
	const sessionType = remoteAgentHostSessionTypeId(authority, provider);
	const transportFactory = () => instantiationService.createInstance(WebSocketClientTransport, address, connectionToken, undefined);
	const connection = evaluationRemoteStore.add(instantiationService.createInstance(
		AgentHostProtocolClient,
		address,
		transportFactory,
		{ clientInfo: editorWindowAgentHostClientInfo },
	));
	await connection.connect();
	const rootState = connection.rootState.value;
	if (!rootState || rootState instanceof Error) {
		throw rootState ?? new Error('Evaluation remote Agent Host published no root state.');
	}
	const agent = rootState.agents.find(candidate => candidate.provider === provider);
	if (!agent) {
		throw new Error(`Evaluation remote Agent Host did not advertise '${provider}'.`);
	}

	evaluationRemoteStore.add(agentHostFileSystemService.registerAuthority(authority, connection));
	evaluationRemoteStore.add(chatSessionsService.registerChatSessionContribution({
		type: sessionType,
		name: sessionType,
		displayName: agent.displayName,
		description: agent.description,
		canDelegate: true,
		requiresCustomModels: true,
		supportsAutoModel: agentHostProviderSupportsAutoModel(agent.provider),
		agentHostProviderId: agent.provider,
		supportsDelegation: true,
		capabilities: {
			supportsCheckpoints: true,
			supportsPromptAttachments: true,
			supportsImageAttachments: true,
			get terminalCommandPrefix() {
				return connection.initializeResult.get()?.terminalCommandPrefix;
			},
		},
	}));
	const sessionHandler = evaluationRemoteStore.add(instantiationService.createInstance(AgentHostSessionHandler, {
		provider: agent.provider,
		agentId: sessionType,
		sessionType,
		fullName: agent.displayName,
		description: agent.description,
		connection,
		connectionAuthority: authority,
		extensionId: 'vscode.evaluation-remote-agent-host',
		extensionDisplayName: 'Evaluation Remote Agent Host',
		resolveWorkingDirectory: () => workspaceContextService.getWorkspace().folders[0]?.uri,
		isNewSession: resource => resource.path.substring(1).startsWith('untitled-'),
		allowUntitledSessionContent: true,
		onSessionMaterialized: resource => chatSessionsService.notifySessionMaterialized?.(resource),
		resolveAuthentication: async () => true,
	}));
	evaluationRemoteStore.add(chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));

	const vendor = sessionType;
	const descriptor = { vendor, displayName: agent.displayName, configuration: undefined, managementCommand: undefined, when: undefined };
	languageModelsService.deltaLanguageModelChatProviderDescriptors([descriptor], []);
	evaluationRemoteStore.add(toDisposable(() => languageModelsService.deltaLanguageModelChatProviderDescriptors([], [descriptor])));
	const modelProvider = evaluationRemoteStore.add(new AgentHostLanguageModelProvider(sessionType, vendor));
	evaluationRemoteStore.add(languageModelsService.registerLanguageModelProvider(vendor, modelProvider));
	modelProvider.updateModels(agent.models);
	evaluationRemoteStore.add(connection.rootState.onDidChange(state => {
		if (state instanceof Error) {
			return;
		}
		const updatedAgent = state.agents.find(candidate => candidate.provider === provider);
		if (updatedAgent) {
			modelProvider.updateModels(updatedAgent.models);
		}
	}));
	return sessionType;
}

registerWorkbenchContribution2(EvaluationSessionEditorContribution.ID, EvaluationSessionEditorContribution, WorkbenchPhase.AfterRestored);
