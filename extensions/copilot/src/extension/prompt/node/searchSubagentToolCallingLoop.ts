/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import type { CancellationToken, ChatRequest, ChatResponseStream, LanguageModelToolInformation, Progress } from 'vscode';
import { IAuthenticationChatUpgradeService } from '../../../platform/authentication/common/authenticationUpgrade';
import { IChatHookService } from '../../../platform/chat/common/chatHookService';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../../platform/chat/common/commonTypes';import { ISessionTranscriptService } from '../../../platform/chat/common/sessionTranscriptService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
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
	/** The top-level turn ID for aggregating credits across subagent calls. */
	topLevelTurnId?: string;
	/** Thoroughness level for the search, passed through to the prompt when thoroughnessEnabled config is on. */
	thoroughness?: 'normal' | 'deep';
}

export class SearchSubagentToolCallingLoop extends ToolCallingLoop<ISearchSubagentToolCallingLoopOptions> {

	public static readonly ID = 'searchSubagentTool';

	// Render proactively at 0.9. If the model still returns a context-overflow 400,
	// we do one retry at an aggressively smaller factor before surfacing
	// a benign fallback to the main agent via the tool wrapper.
	private static readonly INITIAL_SAFETY_FACTOR = 0.9;
	private static readonly RETRY_SAFETY_FACTOR = 0.5;
	private _didRetryAfterOverflow = false;
	private _lastBuildPromptContext: IBuildPromptContext | undefined;

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
		const modelName = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.SearchSubagentModel, this._experimentationService);
		const useAgenticProxy = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.SearchSubagentUseAgenticProxy, this._experimentationService);

		if (useAgenticProxy) {
			// Use agentic proxy with SearchSubagentModel or default to 'agentic-search-v3'
			const agenticProxyModel = modelName || SearchSubagentToolCallingLoop.DEFAULT_AGENTIC_PROXY_MODEL;
			return this.instantiationService.createInstance(ProxyAgenticEndpoint, agenticProxyModel);
		}

		if (modelName) {
			try {
				// Try to get the specified model
				const endpoint = await this.endpointProvider.getChatEndpoint(modelName);
				if (endpoint.supportsToolCalls) {
					return endpoint;
				}
				// Model does not support tool calls, fallback to main agent endpoint.
				// The search subagent is a tool-calling loop, and the endpoint would
				// otherwise strip its search tools from the request body.
				this._logService.warn(`Model ${modelName} does not support tool calls, falling back to main agent endpoint`);
				return await this.endpointProvider.getChatEndpoint(this.options.request);
			} catch (error) {
				// Model not available, fallback to main agent
				this._logService.warn(`Failed to get model ${modelName}, falling back to main agent endpoint: ${error}`);
				return await this.endpointProvider.getChatEndpoint(this.options.request);
			}
		} else {
			// No model name specified, use main agent endpoint
			return await this.endpointProvider.getChatEndpoint(this.options.request);
		}
	}

	protected async buildPrompt(buildPromptContext: IBuildPromptContext, progress: Progress<ChatResponseReferencePart | ChatResponseProgressPart>, token: CancellationToken): Promise<IBuildPromptResult> {
		this._lastBuildPromptContext = buildPromptContext;
		return this._renderPrompt(buildPromptContext, progress, token);
	}

	private async _renderPrompt(buildPromptContext: IBuildPromptContext, progress: Progress<ChatResponseReferencePart | ChatResponseProgressPart>, token: CancellationToken): Promise<IBuildPromptResult> {
		const endpoint = await this.getEndpoint();
		const maxSearchTurns = this.options.toolCallLimit;

		const tools = buildPromptContext.tools?.availableTools;
		const toolTokens = tools?.length ? await endpoint.acquireTokenizer().countToolTokens(tools) : 0;

		const factor = this._didRetryAfterOverflow
			? SearchSubagentToolCallingLoop.RETRY_SAFETY_FACTOR
			: SearchSubagentToolCallingLoop.INITIAL_SAFETY_FACTOR;
		const messageBudget = Math.max(1, Math.floor((endpoint.modelMaxPromptTokens - toolTokens) * factor));
		const renderEndpoint = toolTokens > 0 || this._didRetryAfterOverflow ? endpoint.cloneWithTokenOverride(messageBudget) : endpoint;
		const renderer = PromptRenderer.create(
			this.instantiationService,
			renderEndpoint,
			SearchSubagentPrompt,
			{
				promptContext: buildPromptContext,
				maxSearchTurns,
				thoroughness: this.options.thoroughness,
			}
		);
		return renderer.render(progress, token);
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
		let currentMessages = messages;
		while (true) {
			const response = await endpoint.makeChatRequest2({
				debugName: SearchSubagentToolCallingLoop.ID,
				messages: currentMessages,
				finishedCb,
				location: this.options.location,
				modelCapabilities: { ...modelCapabilities, reasoningEffort: undefined },
				requestOptions: {
					...requestOptions,
					temperature: 0
				},
				// This loop is inside a tool called from another request, so never user initiated
				userInitiatedRequest: false,
				turnId: this.options.request.id,
				topLevelTurnId: this.options.topLevelTurnId,
				telemetryProperties: {
					requestId: this.options.subAgentInvocationId,
					messageId: randomUUID(),
					messageSource: 'chat.editAgent',
					subType: 'search_subagent',
					conversationId: this.options.conversation.sessionId,
					parentToolCallId: this.options.parentToolCallId,
					parentRequestId: this.options.request.id,
					parentHeaderRequestId: this.options.parentHeaderRequestId,
					parentModelCallId: this.options.parentModelCallId,
					iterationNumber: iterationNumber.toString(),
				},
				interactionTypeOverride: 'conversation-subagent'
			}, token);

			if (
				token.isCancellationRequested ||
				!this._lastBuildPromptContext ||
				!isContextOverflowBadRequest(response)
			) {
				return response;
			}

			if (this._didRetryAfterOverflow) {
				this._sendContextOverflowTelemetry('exhausted', endpoint.model, SearchSubagentToolCallingLoop.RETRY_SAFETY_FACTOR);
				return response;
			}

			this._didRetryAfterOverflow = true;
			this._logService.warn(`[searchSubagent] context_length_exceeded from API; re-rendering once at safety factor ${SearchSubagentToolCallingLoop.RETRY_SAFETY_FACTOR}`);
			this._sendContextOverflowTelemetry('retried', endpoint.model, SearchSubagentToolCallingLoop.RETRY_SAFETY_FACTOR);
			const rerendered = await this.buildPrompt(this._lastBuildPromptContext, { report: () => { } }, token);
			currentMessages = rerendered.messages;
		}
	}

	/**
	 * Skip the autopilot auto-retry layer for context-overflow BadRequest.
	 */
	protected override shouldAutoRetry(response: ChatResponse): boolean {
		if (isContextOverflowBadRequest(response)) {
			return false;
		}
		return super.shouldAutoRetry(response);
	}

	private _sendContextOverflowTelemetry(
		outcome: 'retried' | 'exhausted',
		model: string,
		safetyFactor: number,
	): void {
		/* __GDPR__
			"searchSubagent.contextOverflow" : {
				"owner": "t-guomaggie",
				"comment": "Tracks when the search subagent's model returns a 400 with a context-overflow reason, and whether the single shrink-and-retry recovered.",
				"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "One of: 'retried' (overflowed on the initial 0.9 budget, re-rendering at the retry factor), 'exhausted' (also overflowed on the retry; failure surfaced to the tool wrapper as a benign fallback)." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model id used by the subagent." },
				"safetyFactor": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The message-budget multiplier in effect after the shrink. Currently always RETRY_SAFETY_FACTOR, but logged as a value so tuning is visible if we change it." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('searchSubagent.contextOverflow', {
			outcome,
			model,
		}, {
			safetyFactor,
		});
	}
}

const CONTEXT_OVERFLOW_REASON_PATTERNS = [
	'context_length_exceeded',
	'context length',
	'context window',
	'maximum context',
	'prompt is too long',
	'request too large',
	'request_too_large',
];

export function isContextOverflowBadRequest(response: ChatResponse): boolean {
	if (response.type !== ChatFetchResponseType.BadRequest) {
		return false;
	}
	const haystack = `${response.reason ?? ''} ${response.reasonDetail ?? ''}`.toLowerCase();
	return CONTEXT_OVERFLOW_REASON_PATTERNS.some(p => haystack.includes(p));
}
