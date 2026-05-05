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
import { ProxyAgenticEndpoint } from '../../../platform/endpoint/node/proxyAgenticEndpoint';
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
import { SearchSubagentPrompt } from '../../prompts/node/agent/searchSubagentPrompt';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { ToolName } from '../../tools/common/toolNames';
import { IToolsService } from '../../tools/common/toolsService';
import { IBuildPromptContext } from '../common/intents';
import { IBuildPromptResult } from './intents';

export interface ISearchSubagentToolCallingLoopOptions extends IToolCallingLoopOptions {
	request: ChatRequest;
	location: ChatLocation;
	promptText: string;
	/** Optional pre-generated subagent invocation ID. If not provided, a new UUID will be generated. */
	subAgentInvocationId?: string;
	/** The tool_call_id from the parent agent's LLM response that triggered this subagent invocation. */
	parentToolCallId?: string;
	/** The headerRequestId from the parent agent's fetch response that triggered this subagent invocation. */
	parentHeaderRequestId?: string;
	/** The modelCallId from the parent agent's model call that triggered this subagent invocation. */
	parentModelCallId?: string;
	/** Thoroughness level for the search, passed through to the prompt when thoroughnessEnabled config is on. */
	thoroughness?: 'normal' | 'deep';
}

export class SearchSubagentToolCallingLoop extends ToolCallingLoop<ISearchSubagentToolCallingLoopOptions> {

	public static readonly ID = 'searchSubagentTool';

	constructor(
		options: ISearchSubagentToolCallingLoopOptions,
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
				subAgentName: 'search'
			};
		}
		context.query = this.options.promptText;
		return context;
	}

	private static readonly DEFAULT_AGENTIC_PROXY_MODEL = 'vscode-agentic-search-router-a';

	/**
	 * Get the endpoint to use for the search subagent
	 */
	private async getEndpoint() {
		const modelName = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.SearchSubagentModel, this._experimentationService) as ChatEndpointFamily | undefined;
		const useAgenticProxy = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.SearchSubagentUseAgenticProxy, this._experimentationService);

		if (useAgenticProxy) {
			// Use agentic proxy with SearchSubagentModel or default to 'agentic-search-v3'
			const agenticProxyModel = modelName || SearchSubagentToolCallingLoop.DEFAULT_AGENTIC_PROXY_MODEL;
			return this.instantiationService.createInstance(ProxyAgenticEndpoint, agenticProxyModel);
		}

		if (modelName) {
			try {
				// Try to get the specified model
				return await this.endpointProvider.getChatEndpoint(modelName);
			} catch (error) {
				// Model not available or doesn't support tool calls, fallback to main agent
				this._logService.warn(`Failed to get model ${modelName}, falling back to main agent endpoint: ${error}`);
				return await this.endpointProvider.getChatEndpoint(this.options.request);
			}
		} else {
			// No model name specified, use main agent endpoint
			return await this.endpointProvider.getChatEndpoint(this.options.request);
		}
	}

	protected async buildPrompt(buildPromptContext: IBuildPromptContext, progress: Progress<ChatResponseReferencePart | ChatResponseProgressPart>, token: CancellationToken): Promise<IBuildPromptResult> {
		const endpoint = await this.getEndpoint();
		// Use the effective tool call limit from options (already adjusted for thoroughness in the tool)
		const maxSearchTurns = this.options.toolCallLimit;
		const renderer = PromptRenderer.create(
			this.instantiationService,
			endpoint,
			SearchSubagentPrompt,
			{
				promptContext: buildPromptContext,
				maxSearchTurns,
				thoroughness: this.options.thoroughness,
			}
		);
		return await renderer.render(progress, token);
	}

	protected async getAvailableTools(): Promise<LanguageModelToolInformation[]> {
		const endpoint = await this.getEndpoint();
		const allTools = this.toolsService.getEnabledTools(this.options.request, endpoint);

		// Only include tools relevant for search operations.
		// We include semantic_search (Codebase) and the basic search primitives.
		// The Codebase tool checks for inSubAgent context to prevent nested tool calling loops.
		const allowedSearchTools = new Set([
			ToolName.Codebase,  // Semantic search
			ToolName.FindFiles,
			ToolName.FindTextInFiles,
			ToolName.ReadFile
		]);

		return allTools.filter(tool => allowedSearchTools.has(tool.name as ToolName));
	}

	protected async fetch({ messages, finishedCb, requestOptions, modelCapabilities, iterationNumber }: ToolCallingLoopFetchOptions, token: CancellationToken): Promise<ChatResponse> {
		const endpoint = await this.getEndpoint();
		return endpoint.makeChatRequest2({
			debugName: SearchSubagentToolCallingLoop.ID,
			messages,
			finishedCb,
			location: this.options.location,
			modelCapabilities: { ...modelCapabilities, reasoningEffort: undefined },
			requestOptions: {
				...requestOptions,
				temperature: 0
			},
			// This loop is inside a tool called from another request, so never user initiated
			userInitiatedRequest: false,
			telemetryProperties: {
				requestId: this.options.subAgentInvocationId,
				messageId: randomUUID(),
				messageSource: 'chat.editAgent',
				subType: 'subagent/search',
				conversationId: this.options.conversation.sessionId,
				parentToolCallId: this.options.parentToolCallId,
				parentHeaderRequestId: this.options.parentHeaderRequestId,
				parentModelCallId: this.options.parentModelCallId,
				iterationNumber: iterationNumber.toString(),
			},
			requestKindOptions: { kind: 'subagent' }
		}, token);
	}
}
