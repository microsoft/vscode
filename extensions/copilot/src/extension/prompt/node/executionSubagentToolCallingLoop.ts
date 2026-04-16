/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import type { CancellationToken, ChatRequest, ChatResponseStream, LanguageModelToolInformation, Progress } from 'vscode';
import { IAuthenticationChatUpgradeService } from '../../../platform/authentication/common/authenticationUpgrade';
import { IChatHookService } from '../../../platform/chat/common/chatHookService';
import { ChatLocation, ChatResponse } from '../../../platform/chat/common/commonTypes';
import { ISessionTranscriptService } from '../../../platform/chat/common/sessionTranscriptService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ChatEndpointFamily, IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IGitService } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { IRequestLogger } from '../../../platform/requestLogger/common/requestLogger';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseProgressPart, ChatResponseReferencePart } from '../../../vscodeTypes';
import { IToolCallingLoopOptions, ToolCallingLoop, ToolCallingLoopFetchOptions } from '../../intents/node/toolCallingLoop';
import { ExecutionSubagentPrompt } from '../../prompts/node/agent/executionSubagentPrompt';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { ToolName } from '../../tools/common/toolNames';
import { IToolsService } from '../../tools/common/toolsService';
import { IBuildPromptContext } from '../common/intents';
import { IBuildPromptResult } from './intents';

export interface IExecutionSubagentToolCallingLoopOptions extends IToolCallingLoopOptions {
	request: ChatRequest;
	location: ChatLocation;
	promptText: string;
	/** Optional pre-generated subagent invocation ID. If not provided, a new UUID will be generated. */
	subAgentInvocationId?: string;
	/** The tool_call_id from the parent agent's LLM response that triggered this subagent invocation. */
	parentToolCallId?: string;
}

export class ExecutionSubagentToolCallingLoop extends ToolCallingLoop<IExecutionSubagentToolCallingLoopOptions> {

	public static readonly ID = 'executionSubagentTool';

	constructor(
		options: IExecutionSubagentToolCallingLoopOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IRequestLogger requestLogger: IRequestLogger,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IToolsService private readonly toolsService: IToolsService,
		@IAuthenticationChatUpgradeService authenticationChatUpgradeService: IAuthenticationChatUpgradeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService experimentationService: IExperimentationService,
		@IChatHookService chatHookService: IChatHookService,
		@ISessionTranscriptService sessionTranscriptService: ISessionTranscriptService,
		@IFileSystemService fileSystemService: IFileSystemService,
		@IOTelService otelService: IOTelService,
		@IGitService gitService: IGitService,
	) {
		super(options, instantiationService, endpointProvider, logService, requestLogger, authenticationChatUpgradeService, telemetryService, configurationService, experimentationService, chatHookService, sessionTranscriptService, fileSystemService, otelService, gitService);
	}

	protected override createPromptContext(availableTools: LanguageModelToolInformation[], outputStream: ChatResponseStream | undefined): IBuildPromptContext {
		const context = super.createPromptContext(availableTools, outputStream);
		if (context.tools) {
			context.tools = {
				...context.tools,
				toolReferences: [],
				subAgentInvocationId: this.options.subAgentInvocationId ?? randomUUID(),
				subAgentName: 'execution'
			};
		}
		context.query = this.options.promptText;
		return context;
	}

	/**
	 * Get the endpoint to use for the execution subagent
	 */
	private async getEndpoint() {
		const modelName = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ExecutionSubagentModel, this._experimentationService) as ChatEndpointFamily;
		if (modelName) {
			try {
				let endpoint = await this.endpointProvider.getChatEndpoint(modelName);
				if (!endpoint.supportsToolCalls) {
					this._logService.warn(`[ExecutionSubagentToolCallingLoop] Configured model ${modelName} does not support tool calls. Falling back to request's endpoint.`);
					endpoint = await this.endpointProvider.getChatEndpoint(this.options.request);
				}
				return endpoint;
			}
			catch (error) {
				this._logService.warn(`[ExecutionSubagentToolCallingLoop] Failed to get endpoint for model ${modelName}: ${error}. Falling back to request's endpoint.`);
				return await this.endpointProvider.getChatEndpoint(this.options.request);
			}
		} else {
			return await this.endpointProvider.getChatEndpoint(this.options.request);
		}
	}

	protected async buildPrompt(buildpromptContext: IBuildPromptContext, progress: Progress<ChatResponseReferencePart | ChatResponseProgressPart>, token: CancellationToken): Promise<IBuildPromptResult> {
		const endpoint = await this.getEndpoint();
		const maxExecutionTurns = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ExecutionSubagentToolCallLimit, this._experimentationService);
		const renderer = PromptRenderer.create(
			this.instantiationService,
			endpoint,
			ExecutionSubagentPrompt,
			{
				promptContext: buildpromptContext,
				maxExecutionTurns
			}
		);
		return await renderer.render(progress, token);
	}

	protected async getAvailableTools(): Promise<LanguageModelToolInformation[]> {
		const endpoint = await this.getEndpoint();
		const allTools = this.toolsService.getEnabledTools(this.options.request, endpoint);

		const allowedExecutionTools = new Set([
			ToolName.CoreRunInTerminal,
			ToolName.CoreGetTerminalOutput,
			ToolName.CoreSendToTerminal,
			ToolName.CoreKillTerminal,
		]);

		return allTools.filter(tool => allowedExecutionTools.has(tool.name as ToolName));
	}

	protected async fetch({ messages, finishedCb, requestOptions, modelCapabilities }: ToolCallingLoopFetchOptions, token: CancellationToken): Promise<ChatResponse> {
		const endpoint = await this.getEndpoint();
		return endpoint.makeChatRequest2({
			debugName: ExecutionSubagentToolCallingLoop.ID,
			messages,
			finishedCb,
			location: this.options.location,
			modelCapabilities: { ...modelCapabilities, reasoningEffort: undefined },
			requestOptions: {
				...(requestOptions ?? {}),
				temperature: 0
			},
			// This loop is inside a tool called from another request, so never user initiated
			userInitiatedRequest: false,
			telemetryProperties: {
				requestId: this.options.subAgentInvocationId,
				messageId: randomUUID(),
				messageSource: 'chat.editAgent',
				subType: 'subagent/execution',
				conversationId: this.options.conversation.sessionId,
				parentToolCallId: this.options.parentToolCallId,
			},
		}, token);
	}
}
