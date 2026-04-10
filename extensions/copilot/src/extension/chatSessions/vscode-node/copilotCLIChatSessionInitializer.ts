/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SweCustomAgent } from '@github/copilot/sdk';
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { IPromptsService, ParsedPromptFile } from '../../../platform/promptFiles/common/promptsService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../util/common/services';
import { DisposableStore, IReference } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';
import { ChatVariablesCollection, extractDebugTargetSessionIds, isPromptFile } from '../../prompt/common/chatVariablesCollection';
import { FolderRepositoryInfo, IFolderRepositoryManager, IsolationMode } from '../common/folderRepositoryManager';
import { emptyWorkspaceInfo, getWorkingDirectory, isIsolationEnabled, IWorkspaceInfo } from '../common/workspaceInfo';
import { SessionIdForCLI } from '../copilotcli/common/utils';
import { COPILOT_CLI_REASONING_EFFORT_PROPERTY, ICopilotCLIAgents, ICopilotCLIModels } from '../copilotcli/node/copilotCli';
import { ICopilotCLISession } from '../copilotcli/node/copilotcliSession';
import { ICopilotCLISessionService } from '../copilotcli/node/copilotcliSessionService';
import { buildMcpServerMappings, McpServerMappings } from '../copilotcli/node/mcpHandler';

function isReasoningEffortFeatureEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getConfig(ConfigKey.Advanced.CLIThinkingEffortEnabled);
}

export interface SessionInitOptions {
	isolation?: IsolationMode;
	branch?: string;
	folder?: vscode.Uri;
	newBranch?: Promise<string | undefined>;
	stream: vscode.ChatResponseStream;
}

export interface ICopilotCLIChatSessionInitializer {
	readonly _serviceBrand: undefined;

	/**
	 * Get or create a session for a chat request with a chat session context.
	 * Handles working directory initialization, model/agent resolution,
	 * session creation, worktree properties, workspace folder tracking,
	 * stream attachment, permission level, and request metadata recording.
	 */
	getOrCreateSession(
		request: vscode.ChatRequest,
		chatResource: vscode.Uri,
		options: SessionInitOptions,
		disposables: DisposableStore,
		token: vscode.CancellationToken
	): Promise<{ session: IReference<ICopilotCLISession> | undefined; isNewSession: boolean; model: { model: string; reasoningEffort?: string } | undefined; agent: SweCustomAgent | undefined; trusted: boolean }>;

	/**
	 * Initialize a working directory, optionally based on a chat session context.
	 * Used for both normal requests and delegation flows.
	 */
	initializeWorkingDirectory(
		chatResource: vscode.Uri | undefined,
		options: SessionInitOptions,
		toolInvocationToken: vscode.ChatParticipantToolToken,
		token: vscode.CancellationToken
	): Promise<{ workspaceInfo: IWorkspaceInfo; cancelled: boolean; trusted: boolean }>;

	/**
	 * Create a new session for delegation and handle post-creation bookkeeping
	 * including request metadata recording.
	 */
	createDelegatedSession(
		request: vscode.ChatRequest,
		workspace: IWorkspaceInfo,
		options: { mcpServerMappings: McpServerMappings },
		token: vscode.CancellationToken
	): Promise<{ session: IReference<ICopilotCLISession>; model: { model: string; reasoningEffort?: string } | undefined; agent: SweCustomAgent | undefined }>;
}

export const ICopilotCLIChatSessionInitializer = createServiceIdentifier<ICopilotCLIChatSessionInitializer>('ICopilotCLIChatSessionInitializer');

export class CopilotCLIChatSessionInitializer implements ICopilotCLIChatSessionInitializer {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ICopilotCLISessionService private readonly sessionService: ICopilotCLISessionService,
		@IFolderRepositoryManager private readonly folderRepositoryManager: IFolderRepositoryManager,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ICopilotCLIModels private readonly copilotCLIModels: ICopilotCLIModels,
		@ICopilotCLIAgents private readonly copilotCLIAgents: ICopilotCLIAgents,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	async getOrCreateSession(
		request: vscode.ChatRequest,
		chatResource: vscode.Uri,
		options: SessionInitOptions,
		disposables: DisposableStore,
		token: vscode.CancellationToken
	): Promise<{ session: IReference<ICopilotCLISession> | undefined; isNewSession: boolean; model: { model: string; reasoningEffort?: string } | undefined; agent: SweCustomAgent | undefined; trusted: boolean }> {
		const sessionId = SessionIdForCLI.parse(chatResource);
		const isNewSession = this.sessionService.isNewSessionId(sessionId);
		const { stream } = options;

		const [{ workspaceInfo, cancelled, trusted }, model, agent] = await Promise.all([
			this.initializeWorkingDirectory(chatResource, options, request.toolInvocationToken, token),
			this.resolveModel(request, token),
			this.resolveAgent(request, token),
		]);
		const workingDirectory = getWorkingDirectory(workspaceInfo);
		const worktreeProperties = workspaceInfo.worktreeProperties;
		if (cancelled || token.isCancellationRequested) {
			return { session: undefined, isNewSession, model, agent, trusted };
		}

		const debugTargetSessionIds = extractDebugTargetSessionIds(request.references);
		const mcpServerMappings = buildMcpServerMappings(request.tools);
		const session = isNewSession ?
			await this.sessionService.createSession({ sessionId, model: model?.model, reasoningEffort: model?.reasoningEffort, workspace: workspaceInfo, agent, debugTargetSessionIds, mcpServerMappings }, token) :
			await this.sessionService.getSession({ sessionId, model: model?.model, reasoningEffort: model?.reasoningEffort, workspace: workspaceInfo, agent, debugTargetSessionIds, mcpServerMappings }, token);

		if (!session) {
			stream.warning(l10n.t('Chat session not found.'));
			return { session: undefined, isNewSession, model, agent, trusted };
		}
		this.logService.info(`Using Copilot CLI session: ${session.object.sessionId} (isNewSession: ${isNewSession}, isolationEnabled: ${isIsolationEnabled(workspaceInfo)}, workingDirectory: ${workingDirectory}, worktreePath: ${worktreeProperties?.worktreePath})`);

		disposables.add(session);
		disposables.add(session.object.attachStream(stream));
		session.object.setPermissionLevel(request.permissionLevel);

		return { session, isNewSession, model, agent, trusted };
	}

	async initializeWorkingDirectory(
		chatResource: vscode.Uri | undefined,
		options: SessionInitOptions,
		toolInvocationToken: vscode.ChatParticipantToolToken,
		token: vscode.CancellationToken
	): Promise<{ workspaceInfo: IWorkspaceInfo; cancelled: boolean; trusted: boolean }> {
		let folderInfo: FolderRepositoryInfo;
		const { stream } = options;
		let folder: undefined | vscode.Uri = options?.folder;
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		if (workspaceFolders.length === 1 && !folder) {
			folder = workspaceFolders[0];
		}
		if (chatResource) {
			const sessionId = SessionIdForCLI.parse(chatResource);
			const isNewSession = this.sessionService.isNewSessionId(sessionId);

			if (isNewSession) {
				const isolation = options?.isolation ?? IsolationMode.Workspace;
				const branch = options?.branch;

				// Use FolderRepositoryManager to initialize folder/repository with worktree creation
				folderInfo = await this.folderRepositoryManager.initializeFolderRepository(sessionId, { stream, toolInvocationToken, branch, isolation, folder, newBranch: options?.newBranch }, token);
			} else {
				// Existing session - use getFolderRepository for resolution with trust check
				folderInfo = await this.folderRepositoryManager.getFolderRepository(sessionId, { promptForTrust: true, stream }, token);
			}
		} else {
			// No chat session context (e.g., delegation) - initialize with active repository
			folderInfo = await this.folderRepositoryManager.initializeFolderRepository(undefined, { stream, toolInvocationToken, isolation: options?.isolation, folder }, token);
		}

		if (folderInfo.trusted === false || folderInfo.cancelled) {
			return { workspaceInfo: emptyWorkspaceInfo(), cancelled: true, trusted: folderInfo.trusted !== false };
		}

		const workspaceInfo = Object.assign({}, folderInfo);
		return { workspaceInfo, cancelled: false, trusted: true };
	}

	async createDelegatedSession(
		request: vscode.ChatRequest,
		workspace: IWorkspaceInfo,
		options: { mcpServerMappings: McpServerMappings },
		token: vscode.CancellationToken
	): Promise<{ session: IReference<ICopilotCLISession>; model: { model: string; reasoningEffort?: string } | undefined; agent: SweCustomAgent | undefined }> {
		const [model, agent] = await Promise.all([
			this.resolveModel(request, token),
			this.resolveAgent(request, token),
		]);

		const session = await this.sessionService.createSession({ workspace, agent, model: model?.model, reasoningEffort: model?.reasoningEffort, mcpServerMappings: options.mcpServerMappings }, token);

		return { session, model, agent };
	}

	/**
	 * Resolve the model ID to use for a request.
	 */
	async resolveModel(request: vscode.ChatRequest | undefined, token: vscode.CancellationToken): Promise<{ model: string; reasoningEffort?: string } | undefined> {
		const promptFile = request ? await this.getPromptInfoFromRequest(request, token) : undefined;
		const model = promptFile?.header?.model ? await this.getModelFromPromptFile(promptFile.header.model) : undefined;
		if (token.isCancellationRequested) {
			return undefined;
		}
		if (model) {
			return { model };
		}
		// Get model from request.
		const preferredModelInRequest = request?.model?.id ? await this.copilotCLIModels.resolveModel(request.model.id) : undefined;
		if (preferredModelInRequest) {
			const reasoningEffort = isReasoningEffortFeatureEnabled(this.configurationService) ? request?.modelConfiguration?.[COPILOT_CLI_REASONING_EFFORT_PROPERTY] : undefined;
			return {
				model: preferredModelInRequest,
				reasoningEffort: typeof reasoningEffort === 'string' && reasoningEffort ? reasoningEffort : undefined
			};
		}
		const defaultModel = await this.copilotCLIModels.getDefaultModel();
		if (!defaultModel) {
			return undefined;
		}
		return { model: defaultModel };
	}

	/**
	 * Resolve the agent to use for a request.
	 */
	async resolveAgent(request: vscode.ChatRequest | undefined, token: vscode.CancellationToken): Promise<SweCustomAgent | undefined> {
		if (request?.modeInstructions2) {
			const customAgent = request.modeInstructions2.uri ? await this.copilotCLIAgents.resolveAgent(request.modeInstructions2.uri.toString()) : await this.copilotCLIAgents.resolveAgent(request.modeInstructions2.name);
			if (customAgent) {
				const tools = (request.modeInstructions2.toolReferences || []).map(t => t.name);
				if (tools.length > 0) {
					customAgent.tools = tools;
				}
				return customAgent;
			}
		}
		return undefined;
	}

	private async getPromptInfoFromRequest(request: vscode.ChatRequest, token: vscode.CancellationToken): Promise<ParsedPromptFile | undefined> {
		const promptFile = new ChatVariablesCollection(request.references).find(isPromptFile);
		if (!promptFile || !URI.isUri(promptFile.reference.value)) {
			return undefined;
		}
		try {
			return await this.promptsService.parseFile(promptFile.reference.value, token);
		} catch (ex) {
			this.logService.error(`Failed to parse the prompt file: ${promptFile.reference.value.toString()}`, ex);
			return undefined;
		}
	}

	private async getModelFromPromptFile(models: readonly string[]): Promise<string | undefined> {
		for (const model of models) {
			let modelId = await this.copilotCLIModels.resolveModel(model);
			if (modelId) {
				return modelId;
			}
			// Sometimes the models can contain ` (Copilot)` suffix, try stripping that and resolving again.
			if (!model.includes('(')) {
				continue;
			}
			modelId = await this.copilotCLIModels.resolveModel(model.substring(0, model.indexOf('(')).trim());
			if (modelId) {
				return modelId;
			}
		}
		return undefined;
	}
}
