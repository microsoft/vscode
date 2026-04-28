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
import { ChatResponseProgressPart, ChatResponseReferencePart, LanguageModelToolResult2 } from '../../../vscodeTypes';
import { IToolCallingLoopOptions, ToolCallingLoop, ToolCallingLoopFetchOptions } from '../../intents/node/toolCallingLoop';
import { ExecutionSubagentPrompt, ITimedOutCommand } from '../../prompts/node/agent/executionSubagentPrompt';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { ToolResultMetadata } from '../../prompts/node/panel/toolCalling';
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

	/** Terminal calls from previous rounds that timed out, deduped by toolCallId. */
	private readonly _timedOutCommands: ITimedOutCommand[] = [];
	private readonly _seenTimedOutCallIds = new Set<string>();

	public get timedOutCommands(): readonly ITimedOutCommand[] {
		return this._timedOutCommands;
	}

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

	private static readonly DEFAULT_AGENTIC_PROXY_MODEL = 'exec-subagent-router-a';

	/**
	 * Get the endpoint to use for the execution subagent
	 */
	private async getEndpoint() {
		const modelName = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ExecutionSubagentModel, this._experimentationService) as ChatEndpointFamily | undefined;
		const useAgenticProxy = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ExecutionSubagentUseAgenticProxy, this._experimentationService);

		if (useAgenticProxy) {
			// Use agentic proxy with ExecutionSubagentModel or default to DEFAULT_AGENTIC_PROXY_MODEL
			const agenticProxyModel = modelName || ExecutionSubagentToolCallingLoop.DEFAULT_AGENTIC_PROXY_MODEL;
			return this.instantiationService.createInstance(ProxyAgenticEndpoint, agenticProxyModel);
		}

		if (modelName) {
			try {
				// Try to get the specified model
				const endpoint = await this.endpointProvider.getChatEndpoint(modelName);
				if (endpoint.supportsToolCalls) {
					return endpoint;
				}
				// Model does not support tool calls, fallback to main agent endpoint
				return await this.endpointProvider.getChatEndpoint(this.options.request);
			} catch (error) {
				// Model not available, fallback to main agent endpoint
				return await this.endpointProvider.getChatEndpoint(this.options.request);
			}
		} else {
			// No model name specified, use main agent endpoint
			return await this.endpointProvider.getChatEndpoint(this.options.request);
		}
	}

	protected async buildPrompt(buildpromptContext: IBuildPromptContext, progress: Progress<ChatResponseReferencePart | ChatResponseProgressPart>, token: CancellationToken): Promise<IBuildPromptResult> {
		const endpoint = await this.getEndpoint();
		const maxExecutionTurns = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ExecutionSubagentToolCallLimit, this._experimentationService);

		// If the previous render observed any timed-out terminal commands, tell the
		// prompt to nudge the model to stop issuing tool calls and produce its
		// <final_answer>. The natural "no tool calls" exit then ends the loop.
		const renderer = PromptRenderer.create(
			this.instantiationService,
			endpoint,
			ExecutionSubagentPrompt,
			{
				promptContext: buildpromptContext,
				maxExecutionTurns,
				hasTimedOutCommand: this._timedOutCommands.length > 0,
			}
		);
		const result = await renderer.render(progress, token);

		// After rendering, scan the rendered tool results for timeouts. Every tool
		// call rendered into the prompt (including those executed just now during
		// this render) emits a ToolResultMetadata entry on `result.metadata`.
		this.collectTimedOutCommands(buildpromptContext, result);

		return result;
	}

	private collectTimedOutCommands(buildpromptContext: IBuildPromptContext, result: IBuildPromptResult): void {
		const lastRound = buildpromptContext.toolCallRounds?.at(-1);
		if (!lastRound) {
			return;
		}

		// Index only this round's terminal calls. Calls from earlier rounds were
		// already evaluated on prior iterations.
		const terminalCallsById = new Map<string, string>();
		for (const tc of lastRound.toolCalls) {
			if (tc.name !== ToolName.CoreRunInTerminal || this._seenTimedOutCallIds.has(tc.id)) {
				continue;
			}
			let command = '';
			try {
				const args = JSON.parse(tc.arguments) as { command?: unknown };
				if (typeof args?.command === 'string') {
					command = args.command;
				}
			} catch {
				// arguments may not be valid JSON on partial rounds; skip command extraction
			}
			terminalCallsById.set(tc.id, command);
		}
		if (terminalCallsById.size === 0) {
			return;
		}

		for (const meta of result.metadata.getAll(ToolResultMetadata)) {
			const command = terminalCallsById.get(meta.toolCallId);
			if (command === undefined) {
				continue;
			}
			const timeoutInfo = this.getTerminalTimeoutInfo(meta.result);
			if (!timeoutInfo) {
				continue;
			}
			this._seenTimedOutCallIds.add(meta.toolCallId);
			this._timedOutCommands.push({
				command,
				termId: timeoutInfo.termId,
				timeoutMs: timeoutInfo.timeoutMs,
			});
		}
	}

	/**
	 * Returns timeout details if `toolResult` is a `run_in_terminal` result that
	 * timed out and was moved to the background, otherwise `undefined`.
	 *
	 * `run_in_terminal` sets a structured `timedOut: true` flag on `toolMetadata`
	 * (along with `id` and `timeoutMs`) when a sync command exceeds its timeout.
	 * See vscode core: runInTerminalTool.ts. `toolMetadata` is exposed on tool
	 * results via the chatParticipantPrivate proposed API and is not on the public
	 * LanguageModelToolResult2 type, so we narrow with an `in` check.
	 */
	private getTerminalTimeoutInfo(toolResult: LanguageModelToolResult2): { termId: string; timeoutMs?: number } | undefined {
		if (!('toolMetadata' in toolResult)) {
			return undefined;
		}
		const metadata = (toolResult as { toolMetadata?: unknown }).toolMetadata;
		if (!metadata || typeof metadata !== 'object') {
			return undefined;
		}
		const m = metadata as { timedOut?: unknown; id?: unknown; timeoutMs?: unknown };
		if (m.timedOut !== true) {
			return undefined;
		}
		return {
			termId: typeof m.id === 'string' ? m.id : '',
			timeoutMs: typeof m.timeoutMs === 'number' ? m.timeoutMs : undefined,
		};
	}

	protected async getAvailableTools(): Promise<LanguageModelToolInformation[]> {
		const endpoint = await this.getEndpoint();
		const allTools = this.toolsService.getEnabledTools(this.options.request, endpoint);

		const allowedExecutionTools = new Set([
			ToolName.CoreRunInTerminal
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
