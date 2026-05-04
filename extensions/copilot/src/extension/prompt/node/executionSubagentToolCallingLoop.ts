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
import { ITerminalService } from '../../../platform/terminal/common/terminalService';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseProgressPart, ChatResponseReferencePart, LanguageModelToolResult2 } from '../../../vscodeTypes';
import { IToolCallingLoopOptions, ToolCallingLoop, ToolCallingLoopFetchOptions } from '../../intents/node/toolCallingLoop';
import { ExecutionSubagentPrompt } from '../../prompts/node/agent/executionSubagentPrompt';
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
	/** The headerRequestId from the parent agent's fetch response that triggered this subagent invocation. */
	parentHeaderRequestId?: string;
	/** The modelCallId from the parent agent's model call that triggered this subagent invocation. */
	parentModelCallId?: string;
}

/** A terminal command that is no longer being awaited by the subagent — either
 * it timed out and was moved to the background, or the model invoked it in
 * async/background mode from the start. */
export interface IBackgroundCommand {
	readonly command: string;
	readonly termId: string;
	readonly reason: 'timeout' | 'async';
	/** Only set when `reason === 'timeout'`. */
	readonly timeoutMs?: number;
}

export class ExecutionSubagentToolCallingLoop extends ToolCallingLoop<IExecutionSubagentToolCallingLoopOptions> {

	public static readonly ID = 'executionSubagentTool';

	/** Terminal calls from previous rounds that the subagent is no longer
	 * awaiting (timeout-moved-to-background or async-from-start), deduped by
	 * toolCallId. */
	private readonly _backgroundCommands: IBackgroundCommand[] = [];
	private readonly _seenBackgroundCallIds = new Set<string>();

	public get backgroundCommands(): readonly IBackgroundCommand[] {
		return this._backgroundCommands;
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
		@ITerminalService private readonly terminalService: ITerminalService,
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
		const shellType = this.terminalService.terminalShellType;

		if (useAgenticProxy) {
			// Our custom models are not trained for PowerShell yet. Fall back to main agent endpoint.
			if (shellType === 'powershell') {
				return await this.endpointProvider.getChatEndpoint(this.options.request);
			}
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

		const render = (hasBackgroundCommand: boolean) => PromptRenderer.create(
			this.instantiationService,
			endpoint,
			ExecutionSubagentPrompt,
			{
				promptContext: buildpromptContext,
				maxExecutionTurns,
				hasBackgroundCommand,
			}
		).render(progress, token);

		// If a previous render observed any background terminal commands, tell the
		// prompt to nudge the model to stop issuing tool calls and produce its
		// <final_answer>. Even with `getAvailableTools` returning [], the model
		// may still attempt a (failed) tool call and trigger another iteration,
		// so the nudge needs to persist across iterations.
		const hadBackgroundBefore = this._backgroundCommands.length > 0;
		let result = await render(hadBackgroundBefore);

		// After rendering, scan the rendered tool results for background commands.
		// Every tool call rendered into the prompt (including those executed just
		// now during this render) emits a ToolResultMetadata entry on
		// `result.metadata`.
		this.collectBackgroundCommands(buildpromptContext, result);

		// If a background command was first detected during this render, the nudge
		// wasn't in the prompt we just built. Re-render with the nudge so the LLM
		// in this same iteration sees the instruction to produce <final_answer>.
		if (!hadBackgroundBefore && this._backgroundCommands.length > 0) {
			const cache = buildpromptContext.toolCallResults;
			// Write to the tool result cache so that the second render doesn't
			// re-run all tool calls that happened during the first render
			if (cache) {
				for (const meta of result.metadata.getAll(ToolResultMetadata)) {
					cache[meta.toolCallId] = meta.result;
				}
			}
			result = await render(true);
		}

		return result;
	}

	private collectBackgroundCommands(buildpromptContext: IBuildPromptContext, result: IBuildPromptResult): void {
		const lastRound = buildpromptContext.toolCallRounds?.at(-1);
		if (!lastRound) {
			return;
		}

		// Index only this round's terminal calls. Calls from earlier rounds were
		// already evaluated on prior iterations.
		interface ITerminalCall {
			readonly command: string;
			/** True if the model called the tool with mode="async" or
			 *  isBackground=true, regardless of how it actually ran. */
			readonly invokedAsAsync: boolean;
		}
		const terminalCallsById = new Map<string, ITerminalCall>();
		for (const tc of lastRound.toolCalls) {
			if (tc.name !== ToolName.CoreRunInTerminal || this._seenBackgroundCallIds.has(tc.id)) {
				continue;
			}
			let command = '';
			let invokedAsAsync = false;
			try {
				const args = JSON.parse(tc.arguments) as { command?: unknown; mode?: unknown; isBackground?: unknown };
				if (typeof args?.command === 'string') {
					command = args.command;
				}
				invokedAsAsync = args?.mode === 'async' || args?.isBackground === true;
			} catch {
				// arguments may not be valid JSON on partial rounds; skip extraction
			}
			terminalCallsById.set(tc.id, { command, invokedAsAsync });
		}
		if (terminalCallsById.size === 0) {
			return;
		}

		for (const meta of result.metadata.getAll(ToolResultMetadata)) {
			const call = terminalCallsById.get(meta.toolCallId);
			if (!call) {
				continue;
			}
			const termId = this.getTerminalId(meta.result);
			if (!termId) {
				// No termId means the call didn't produce a terminal (e.g., errored
				// before execution). Nothing to track or note about.
				continue;
			}
			const timeoutMs = this.getTimeoutMsIfTimedOut(meta.result);
			if (timeoutMs !== undefined) {
				this._seenBackgroundCallIds.add(meta.toolCallId);
				this._backgroundCommands.push({
					command: call.command,
					termId,
					reason: 'timeout',
					timeoutMs,
				});
			} else if (call.invokedAsAsync) {
				this._seenBackgroundCallIds.add(meta.toolCallId);
				this._backgroundCommands.push({
					command: call.command,
					termId,
					reason: 'async',
				});
			}
		}
	}

	/**
	 * Reads the `id` (terminal ID) field from a `run_in_terminal` tool result's
	 * `toolMetadata`, if present. `toolMetadata` is exposed on tool results via
	 * the chatParticipantPrivate proposed API and is not on the public
	 * LanguageModelToolResult2 type, so we narrow with an `in` check.
	 */
	private getTerminalId(toolResult: LanguageModelToolResult2): string | undefined {
		if (!('toolMetadata' in toolResult)) {
			return undefined;
		}
		const metadata = (toolResult as { toolMetadata?: unknown }).toolMetadata;
		if (!metadata || typeof metadata !== 'object') {
			return undefined;
		}
		const m = metadata as { id?: unknown };
		return typeof m.id === 'string' ? m.id : undefined;
	}

	/**
	 * Returns the configured timeout (ms) if the result indicates a sync
	 * `run_in_terminal` call timed out and was moved to the background; returns
	 * `undefined` otherwise. See vscode core: runInTerminalTool.ts which sets
	 * `timedOut: true` and `timeoutMs` on `toolMetadata` for that case.
	 */
	private getTimeoutMsIfTimedOut(toolResult: LanguageModelToolResult2): number | undefined {
		if (!('toolMetadata' in toolResult)) {
			return undefined;
		}
		const metadata = (toolResult as { toolMetadata?: unknown }).toolMetadata;
		if (!metadata || typeof metadata !== 'object') {
			return undefined;
		}
		const m = metadata as { timedOut?: unknown; timeoutMs?: unknown };
		if (m.timedOut !== true) {
			return undefined;
		}
		return typeof m.timeoutMs === 'number' ? m.timeoutMs : undefined;
	}

	protected async getAvailableTools(): Promise<LanguageModelToolInformation[]> {
		// If any previous terminal call has moved to the background (timeout or
		// async), expose no tools so the model cannot make further calls and is
		// forced to produce its <final_answer>.
		if (this._backgroundCommands.length > 0) {
			return [];
		}

		const endpoint = await this.getEndpoint();
		const allTools = this.toolsService.getEnabledTools(this.options.request, endpoint);

		const allowedExecutionTools = new Set([
			ToolName.CoreRunInTerminal
		]);

		return allTools.filter(tool => allowedExecutionTools.has(tool.name as ToolName));
	}

	protected async fetch({ messages, finishedCb, requestOptions, modelCapabilities, iterationNumber }: ToolCallingLoopFetchOptions, token: CancellationToken): Promise<ChatResponse> {
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
				parentHeaderRequestId: this.options.parentHeaderRequestId,
				parentModelCallId: this.options.parentModelCallId,
				iterationNumber: iterationNumber.toString(),
			},
		}, token);
	}
}
