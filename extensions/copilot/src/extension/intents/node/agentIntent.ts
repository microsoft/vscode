/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { Raw, RenderPromptResult } from '@vscode/prompt-tsx';
import { BudgetExceededError } from '@vscode/prompt-tsx/dist/base/materialized';
import type * as vscode from 'vscode';
import { IChatSessionService } from '../../../platform/chat/common/chatSessionService';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../../platform/chat/common/commonTypes';
import { ISessionTranscriptService } from '../../../platform/chat/common/sessionTranscriptService';
import { getTextPart } from '../../../platform/chat/common/globalStringUtils';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { isAnthropicFamily, isGptFamily, modelCanUseApplyPatchExclusively, modelCanUseReplaceStringExclusively, modelSupportsApplyPatch, modelSupportsMultiReplaceString, modelSupportsReplaceString, modelSupportsSimplifiedApplyPatchInstructions } from '../../../platform/endpoint/common/chatModelCapabilities';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IAutomodeService } from '../../../platform/endpoint/node/automodeService';
import { SEARCH_AGENT_FAMILY } from '../../../platform/endpoint/node/searchAgentChatEndpoint';
import { IEnvService } from '../../../platform/env/common/envService';
import { ILogService } from '../../../platform/log/common/logService';
import { IEditLogService } from '../../../platform/multiFileEdit/common/editLogService';
import { CUSTOM_TOOL_SEARCH_NAME, isAnthropicContextEditingEnabled } from '../../../platform/networking/common/anthropic';
import { IChatEndpoint, isCAPIEndpoint } from '../../../platform/networking/common/networking';
import { APIUsage, modelsWithoutResponsesContextManagement, nanoAiuToCredits } from '../../../platform/networking/common/openai';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { GenAiMetrics } from '../../../platform/otel/common/genAiMetrics';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { CustomInstructionsReferenceLogger, IAutomaticInstructionsCollector } from '../../../platform/promptFiles/node/automaticInstructionsCollector';
import { PromptConfig } from '../../../platform/promptFiles/common/promptsService';
import { ITasksService } from '../../../platform/tasks/common/tasksService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ITestProvider } from '../../../platform/testing/common/testProvider';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';

import { findLast } from '../../../util/vs/base/common/arraysFind';
import { raceTimeout } from '../../../util/vs/base/common/async';
import { CancellationError, isCancellationError } from '../../../util/vs/base/common/errors';
import { Iterable } from '../../../util/vs/base/common/iterator';
import { DisposableMap, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';

import { ChatResponseAutoModeResolutionPart, ChatResponseProgressPart2 } from '../../../vscodeTypes';
import { ICommandService } from '../../commands/node/commandService';
import { Intent } from '../../common/constants';
import { ChatVariablesCollection } from '../../prompt/common/chatVariablesCollection';
import { Conversation, normalizeSummariesOnRounds, RenderedUserMessageMetadata, TurnStatus, TurnTokenUsageMetadata } from '../../prompt/common/conversation';
import { IBuildPromptContext, InternalToolReference } from '../../prompt/common/intents';
import { getRequestedToolCallIterationLimit, IContinueOnErrorConfirmation } from '../../prompt/common/specialRequestTypes';
import { ChatTelemetryBuilder } from '../../prompt/node/chatParticipantTelemetry';
import { IDefaultIntentRequestHandlerOptions } from '../../prompt/node/defaultIntentRequestHandler';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { IBuildPromptResult, IIntent, IIntentInvocation } from '../../prompt/node/intents';
import { AgentPrompt, AgentPromptProps } from '../../prompts/node/agent/agentPrompt';
import { BackgroundSummarizationState, BackgroundSummarizationThresholds, BackgroundSummarizer, IBackgroundSummarizationResult, resolveSummaryAnchorRoundId, shouldKickOffBackgroundSummarization } from '../../prompts/node/agent/backgroundSummarizer';
import { formatCompactionFailureError, renderCompactionMessages, resolveCompactionEndpoint } from '../../prompts/node/agent/compactionEndpoint';
import { AgentPromptCustomizations, PromptRegistry } from '../../prompts/node/agent/promptRegistry';
import { extractSummary, decidePrismRouting, SummarizationUserMessage, SummarizedConversationHistory, SummarizedConversationHistoryMetadata, SummarizedConversationHistoryPropsBuilder, appendTranscriptHintToSummary, computeSummarizationRoundCounts } from '../../prompts/node/agent/summarizedConversationHistory';
import { PromptRenderer, renderPromptElement } from '../../prompts/node/base/promptRenderer';
import { ICodeMapperService } from '../../prompts/node/codeMapper/codeMapperService';
import { EditCodePrompt2 } from '../../prompts/node/panel/editCodePrompt2';
import { NotebookInlinePrompt } from '../../prompts/node/panel/notebookInlinePrompt';
import { ToolResultMetadata } from '../../prompts/node/panel/toolCalling';
import { IEditToolLearningService } from '../../tools/common/editToolLearningService';
import { normalizeToolSchema } from '../../tools/common/toolSchemaNormalizer';
import { ContributedToolName, ToolName } from '../../tools/common/toolNames';
import { IToolsService } from '../../tools/common/toolsService';
import { applyPatch5Description } from '../../tools/node/applyPatchTool';
import { multiReplaceStringPrimaryDescription } from '../../tools/node/multiReplaceStringTool';
import { replaceStringBatchDescription } from '../../tools/node/replaceStringTool';
import { getAgentMaxRequests } from '../common/agentConfig';
import { addCacheBreakpoints } from './cacheBreakpoints';
import { EditCodeIntent, EditCodeIntentInvocation, EditCodeIntentInvocationOptions, mergeMetadata, toNewChatReferences } from './editCodeIntent';
import { ToolCallingLoop } from './toolCallingLoop';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { BackgroundTodoAgentProcessor, getSessionResource } from '../../prompts/node/agent/backgroundTodoAgent/backgroundTodoAgentProcessor';

function isResponsesCompactionContextManagementEnabled(endpoint: IChatEndpoint, configurationService: IConfigurationService, experimentationService: IExperimentationService): boolean {
	return endpoint.apiType === 'responses'
		&& configurationService.getExperimentBasedConfig(ConfigKey.ResponsesApiContextManagementEnabled, experimentationService)
		&& !modelsWithoutResponsesContextManagement.has(endpoint.family);
}

/**
 * Applies the user's "Context Size" model-picker selection to the endpoint used
 * for the agent's model requests.
 *
 * The picker offers two tiers — the model's default context max and its full
 * native window (see `getContextSizeOptions`). For server-managed context (the
 * Responses-API compaction path) the request endpoint's `modelMaxPromptTokens`
 * is what drives the `compact_threshold` sent to the server. If the default
 * tier is not propagated to the request endpoint, the server compacts against
 * the model's full window and the stateful conversation grows far past the
 * user's selection — billing them for the larger context. Mirrors the override
 * applied on the `vscode.lm` path in `languageModelAccess.ts`.
 *
 * Only clamps when the selection is strictly smaller than the model window so
 * the full tier ("Longer sessions") stays uncompacted.
 *
 * When no explicit selection is present, falls back to the default context-max tier, unless the tiers cost the same and `chat.preferLongContext.enabled` is set, in which case the full native window is used.
 *
 * @internal - exported for testing
 */
export function applyContextSizeOverride(endpoint: IChatEndpoint, request: vscode.ChatRequest, preferLongContext: boolean = false): IChatEndpoint {
	const contextSize = request.modelConfiguration?.contextSize;
	// Prefer a valid explicit selection; otherwise fall back to the default tier. Guard against non-positive / non-finite selections (0, -1, NaN, Infinity). When tiers cost the same and the user prefers long context, skip the fallback and use the full window. See microsoft/vscode#322950, microsoft/vscode#323116.
	const hasLongContextSurcharge = !!endpoint.tokenPricing?.longContext;
	const useDefaultTierFallback = !preferLongContext || hasLongContextSurcharge;
	const effectiveSize = (typeof contextSize === 'number' && Number.isFinite(contextSize) && contextSize > 0)
		? contextSize
		: useDefaultTierFallback ? endpoint.tokenPricing?.default.contextMax : undefined;
	if (typeof effectiveSize === 'number' && effectiveSize > 0 && effectiveSize < endpoint.modelMaxPromptTokens) {
		return endpoint.cloneWithTokenOverride(effectiveSize);
	}
	return endpoint;
}

/**
 * Returns true when the user explicitly referenced the todo tool (e.g. typed
 * `#todo` in their message) or a custom agent configuration includes it as a
 * tool reference. Checking `request.toolReferences` is a stronger signal than
 * `request.tools` because core tools always appear as enabled in the default
 * tool picker state, which would prevent the experiment from taking effect.
 *
 * @internal - exported for testing
 */
export function isTodoToolExplicitlyEnabled(request: vscode.ChatRequest): boolean {
	const todoReferenceName = 'todo';
	return request.toolReferences.some(ref =>
		ref.name === todoReferenceName
		|| ref.name === ToolName.CoreManageTodoList
	);
}

/**
 * Returns true when the background todo agent should manage todos instead of
 * exposing the regular todo tool to the main agent.
 *
 * @internal - exported for testing
 */
export function isBackgroundTodoAgentEnabled(
	endpoint: IChatEndpoint,
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
	authenticationService: IAuthenticationService,
	request: vscode.ChatRequest): boolean {
	const token = authenticationService.copilotToken;

	// Disable background todo agent for experimental models temporarily
	if (endpoint.modelProvider?.toLowerCase() === 'experimental') {
		return false;
	}

	// Only enable for a signed in no-free plan user talking to the CAPI endpoint.
	const isEnabledForToken = token !== undefined && !token.isFreeUser && !token.isNoAuthUser && isCAPIEndpoint(endpoint);
	return isEnabledForToken && configurationService.getExperimentBasedConfig(ConfigKey.Advanced.BackgroundTodoAgentEnabled, experimentationService)
		&& !isTodoToolExplicitlyEnabled(request);
}

/**
 * Resolve the configured summarization threshold into an absolute token count.
 *
 * The setting accepts two interchangeable units so users can express the
 * compaction trigger however is most natural:
 *
 *  - **Ratio** (`0 < value <= 1`): a fraction of the model's context window,
 *    e.g. `0.8` means "compact at 80% of the window". This is resolved against
 *    `effectiveMaxTokens` so it automatically tracks model/context-size changes.
 *  - **Absolute tokens** (`value >= 100`): a fixed token budget, e.g. `60000`.
 *
 * Values in the ambiguous `(1, 100)` gap (too large to be a sensible ratio, too
 * small to be a useful token budget) are rejected so a typo like `80` — which a
 * user likely meant as "80%" — fails loudly instead of silently compacting after
 * 80 tokens.
 *
 * Returns `undefined` when unset (or non-positive), meaning "use the model's full
 * context window".
 *
 * @internal - exported for testing
 */
export function resolveSummarizeThresholdTokens(value: number | undefined, effectiveMaxTokens: number, settingId: string): number | undefined {
	if (typeof value !== 'number' || value <= 0) {
		return undefined;
	}
	if (value <= 1) {
		// Ratio of the model's context window.
		return Math.max(1, Math.floor(effectiveMaxTokens * value));
	}
	if (value < 100) {
		throw new Error(`Setting github.copilot.${settingId} is too low; use a ratio in the range (0, 1] (e.g. 0.8 for 80%) or an absolute token count of at least 100.`);
	}
	// Absolute token count.
	return value;
}

export const getAgentTools = async (accessor: ServicesAccessor, request: vscode.ChatRequest, model?: IChatEndpoint) => {
	const toolsService = accessor.get<IToolsService>(IToolsService);
	const testService = accessor.get<ITestProvider>(ITestProvider);
	const tasksService = accessor.get<ITasksService>(ITasksService);
	const configurationService = accessor.get<IConfigurationService>(IConfigurationService);
	const experimentationService = accessor.get<IExperimentationService>(IExperimentationService);
	const endpointProvider = accessor.get<IEndpointProvider>(IEndpointProvider);
	const editToolLearningService = accessor.get<IEditToolLearningService>(IEditToolLearningService);
	const authenticationService = accessor.get<IAuthenticationService>(IAuthenticationService);
	const logService = accessor.get<ILogService>(ILogService);

	model ??= await endpointProvider.getChatEndpoint(request);

	const allowTools: Record<string, boolean> = {};

	const learned = editToolLearningService.getPreferredEndpointEditTool(model);
	if (learned) { // a learning-enabled (BYOK) model, we should go with what it prefers
		allowTools[ToolName.EditFile] = learned.includes(ToolName.EditFile);
		allowTools[ToolName.ReplaceString] = learned.includes(ToolName.ReplaceString);
		allowTools[ToolName.MultiReplaceString] = learned.includes(ToolName.MultiReplaceString);
		allowTools[ToolName.ApplyPatch] = learned.includes(ToolName.ApplyPatch);
	} else {
		allowTools[ToolName.EditFile] = true;
		allowTools[ToolName.ReplaceString] = modelSupportsReplaceString(model);
		allowTools[ToolName.ApplyPatch] = modelSupportsApplyPatch(model) && !!toolsService.getTool(ToolName.ApplyPatch);

		if (allowTools[ToolName.ApplyPatch] && modelCanUseApplyPatchExclusively(model)) {
			allowTools[ToolName.EditFile] = false;
		}

		if (modelCanUseReplaceStringExclusively(model)) {
			allowTools[ToolName.ReplaceString] = true;
			allowTools[ToolName.EditFile] = false;
		}

		if (allowTools[ToolName.ReplaceString] && modelSupportsMultiReplaceString(model)) {
			allowTools[ToolName.MultiReplaceString] = true;
		}
	}

	allowTools[ToolName.CoreRunTest] = await testService.hasAnyTests();
	allowTools[ToolName.CoreRunTask] = tasksService.getTasks().length > 0;

	// The specialized subagents and semantic search only work when the main
	// agent is on CAPI. semantic_search relies on embeddings that require a
	// Copilot token source, so on BYOK / custom endpoints it can abort the chat
	// turn (e.g. when the GitHub auth provider is unavailable). Keep it off
	// there. See https://github.com/microsoft/vscode/issues/322525.
	if (!isCAPIEndpoint(model)) {
		allowTools[ToolName.SearchSubagent] = false;
		allowTools[ToolName.ExploreSubagent] = false;
		allowTools[ToolName.ExecutionSubagent] = false;
		allowTools[ToolName.Codebase] = false;
	} else {
		const searchSubagentEnabled = configurationService.getExperimentBasedConfig(ConfigKey.Advanced.SearchSubagentToolEnabled, experimentationService);
		const exploreAgentEnabled = configurationService.getExperimentBasedConfig(ConfigKey.ExploreAgentEnabled, experimentationService);
		const executionSubagentEnabled = configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ExecutionSubagentToolEnabled, experimentationService);
		const isGptOrAnthropic = isGptFamily(model) || isAnthropicFamily(model);

		// Only look up endpoints when a subagent that depends on model availability
		// could actually be enabled, since the lookup is otherwise unnecessary.
		const allEndpoints = isGptOrAnthropic && (searchSubagentEnabled || executionSubagentEnabled)
			? await endpointProvider.getAllChatEndpoints().catch(err => {
				logService.warn(`getAgentTools: failed to fetch chat endpoints, disabling availability-gated subagents: ${err}`);
				return [] as IChatEndpoint[];
			})
			: [];

		const searchAgentAvailable = allEndpoints.some(e => e.family === SEARCH_AGENT_FAMILY);
		allowTools[ToolName.SearchSubagent] = isGptOrAnthropic && searchSubagentEnabled && exploreAgentEnabled && searchAgentAvailable;
		allowTools[ToolName.ExploreSubagent] = isGptOrAnthropic && searchSubagentEnabled && !exploreAgentEnabled && searchAgentAvailable;

		// The execution subagent is powered by gemini-3-flash, so it can only be
		// offered when that model is actually available to the user. If it isn't
		// in the user's endpoints, keep the tool disabled regardless of the setting.
		const hasGemini3Flash = allEndpoints.some(ep => ep.family.toLowerCase().includes('gemini-3-flash'));
		allowTools[ToolName.ExecutionSubagent] = isGptOrAnthropic && executionSubagentEnabled && hasGemini3Flash;
	}

	const skillToolEnabled = configurationService.getExperimentBasedConfig(ConfigKey.Advanced.SkillToolEnabled, experimentationService);
	allowTools[ToolName.Skill] = skillToolEnabled;

	const getSCMChangesEnabled = configurationService.getExperimentBasedConfig(ConfigKey.Advanced.GetChangedFilesToolEnabled, experimentationService);
	allowTools[ToolName.GetScmChanges] = getSCMChangesEnabled;

	allowTools[ToolName.SessionStoreSql] = true;

	allowTools[CUSTOM_TOOL_SEARCH_NAME] = !!model.supportsToolSearch;

	if (model.family.includes('grok-code')) {
		allowTools[ToolName.CoreManageTodoList] = false;
	}

	if (isBackgroundTodoAgentEnabled(model, configurationService, experimentationService, authenticationService, request)) {
		allowTools[ToolName.CoreManageTodoList] = false;
	}

	// Enable task_complete in autopilot mode so the model can signal task completion.
	// The tool is registered in core as a built-in but needs explicit opt-in here.
	allowTools['task_complete'] = request.permissionLevel === 'autopilot';

	allowTools[ToolName.EditFilesPlaceholder] = false;
	// todo@connor4312: string check here is for back-compat for 1.109 Insiders
	if (Iterable.some(request.tools, ([t, enabled]) => (typeof t === 'string' ? t : t.name) === ContributedToolName.EditFilesPlaceholder && enabled === false)) {
		allowTools[ToolName.ApplyPatch] = false;
		allowTools[ToolName.EditFile] = false;
		allowTools[ToolName.ReplaceString] = false;
		allowTools[ToolName.MultiReplaceString] = false;
	}

	if (model.family.toLowerCase().includes('gemini-3') && configurationService.getExperimentBasedConfig(ConfigKey.Advanced.Gemini3MultiReplaceString, experimentationService)) {
		allowTools[ToolName.MultiReplaceString] = true;
	}

	const tools = toolsService.getEnabledTools(request, model, tool => {
		if (typeof allowTools[tool.name] === 'boolean') {
			return allowTools[tool.name];
		}

		// Must return undefined to fall back to other checks
		return undefined;
	});

	if (modelSupportsSimplifiedApplyPatchInstructions(model) && configurationService.getExperimentBasedConfig(ConfigKey.Advanced.Gpt5AlternativePatch, experimentationService)) {
		const ap = tools.findIndex(t => t.name === ToolName.ApplyPatch);
		if (ap !== -1) {
			tools[ap] = { ...tools[ap], description: applyPatch5Description };
		}
	}

	if (configurationService.getExperimentBasedConfig(ConfigKey.Advanced.BatchReplaceStringDescriptions, experimentationService)) {
		const rs = tools.findIndex(t => t.name === ToolName.ReplaceString);
		if (rs !== -1) {
			tools[rs] = { ...tools[rs], description: replaceStringBatchDescription };
		}
		const mrs = tools.findIndex(t => t.name === ToolName.MultiReplaceString);
		if (mrs !== -1) {
			tools[mrs] = { ...tools[mrs], description: multiReplaceStringPrimaryDescription };
		}
	}

	return tools;
};

export class AgentIntent extends EditCodeIntent {

	static override readonly ID = Intent.Agent;

	override readonly id = AgentIntent.ID;

	private readonly _backgroundSummarizers = new Map<string, BackgroundSummarizer>();
	private readonly _backgroundTodoProcessors = new DisposableMap<string, BackgroundTodoAgentProcessor>();

	/**
	 * Holds long-lived subscriptions for this intent (e.g. the session-dispose
	 * cleanup below). AgentIntent is an app-lifetime singleton that is never
	 * disposed, so this mainly keeps the subscription owned rather than dropped
	 * on the floor.
	 */
	private readonly _sessionListeners = new DisposableStore();

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IEndpointProvider endpointProvider: IEndpointProvider,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
		@ICodeMapperService codeMapperService: ICodeMapperService,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@IChatSessionService chatSessionService: IChatSessionService,
		@IAutomodeService private readonly _automodeService: IAutomodeService,
		@ILogService private readonly _logService: ILogService,
		@IToolsService private readonly _toolsService: IToolsService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super(instantiationService, endpointProvider, configurationService, expService, codeMapperService, workspaceService, { intentInvocation: AgentIntentInvocation, processCodeblocks: false });
		this._sessionListeners.add(chatSessionService.onDidDisposeChatSession(sessionId => {
			const summarizer = this._backgroundSummarizers.get(sessionId);
			if (summarizer) {
				summarizer.cancel();
				this._backgroundSummarizers.delete(sessionId);
			}
			// deleteAndDispose() runs the processor's dispose(), which cancels the
			// in-flight generation and tears down its queue, CTS and history store.
			this._backgroundTodoProcessors.deleteAndDispose(sessionId);
		}));
	}

	getOrCreateBackgroundSummarizer(sessionId: string, modelMaxPromptTokens: number, endpointId: string): BackgroundSummarizer {
		let summarizer = this._backgroundSummarizers.get(sessionId);
		if (summarizer && summarizer.endpointId !== endpointId) {
			// Endpoint switched mid-session. A summary kicked off against the
			// previous endpoint's prefix would be applied unconditionally on the
			// next pre-render, producing a surprising "Compacted conversation"
			// notice on the new endpoint — cancel and start fresh.
			summarizer.cancel();
			this._backgroundSummarizers.delete(sessionId);
			summarizer = undefined;
		}
		if (!summarizer) {
			summarizer = new BackgroundSummarizer(modelMaxPromptTokens, endpointId);
			this._backgroundSummarizers.set(sessionId, summarizer);
		}
		return summarizer;
	}

	/**
	 * Cancel and forget the background summarizer for this session. Used by
	 * `/compact` so a pending background result doesn't immediately overwrite
	 * the user's explicit foreground compaction on the next turn.
	 */
	cancelBackgroundSummarizer(sessionId: string): void {
		const summarizer = this._backgroundSummarizers.get(sessionId);
		if (summarizer) {
			summarizer.cancel();
			this._backgroundSummarizers.delete(sessionId);
		}
	}

	getOrCreateBackgroundTodoProcessor(promptContext: IBuildPromptContext): BackgroundTodoAgentProcessor | undefined {
		const sessionId = promptContext.conversation?.sessionId;
		if (sessionId === undefined) {
			return undefined;
		}
		let processor = this._backgroundTodoProcessors.get(sessionId);
		if (!processor) {
			processor = new BackgroundTodoAgentProcessor(
				sessionId,
				getSessionResource(promptContext),
				this._toolsService,
				this._telemetryService,
				this.instantiationService,
				this._logService
			);
			this._backgroundTodoProcessors.set(sessionId, processor);
		}
		return processor;
	}

	protected override getIntentHandlerOptions(request: vscode.ChatRequest): IDefaultIntentRequestHandlerOptions | undefined {
		return {
			maxToolCallIterations: getRequestedToolCallIterationLimit(request) ??
				this.instantiationService.invokeFunction(getAgentMaxRequests),
			temperature: this.configurationService.getConfig(ConfigKey.Advanced.AgentTemperature) ?? 0,
			overrideRequestLocation: ChatLocation.Agent
		};
	}

	override async handleRequest(
		conversation: Conversation,
		request: vscode.ChatRequest,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken,
		documentContext: IDocumentContext | undefined,
		agentName: string,
		location: ChatLocation,
		chatTelemetry: ChatTelemetryBuilder,
		yieldRequested: () => boolean
	): Promise<vscode.ChatResult> {
		if (request.command === 'compact') {
			return this.handleSummarizeCommand(conversation, request, stream, token);
		}

		// Report auto-mode routing decision if one was made during endpoint resolution
		const routingDecision = this._automodeService.consumeLastRoutingDecision();
		if (routingDecision) {
			stream.push(new ChatResponseAutoModeResolutionPart(routingDecision.resolvedModel, routingDecision.resolvedModelName, routingDecision.predictedLabel, routingDecision.confidence));
		}

		try {
			return await super.handleRequest(conversation, request, stream, token, documentContext, agentName, location, chatTelemetry, yieldRequested);
		} finally {
			// Fire one final bg todo review pass once the agent loop has ended for
			// this turn. The per-round passes never see the very last round, so any
			// task that just completed otherwise stays stuck as 'in-progress'.
			// Await completion so this final pass runs before we return, while the
			// request's tool invocation token is (hopefully) still valid.

			if (request.subAgentInvocationId === undefined && request.subAgentName === undefined) {
				const todoProcessor = this._backgroundTodoProcessors.get(conversation.sessionId);
				if (todoProcessor) {
					await raceTimeout(
						todoProcessor.endTurn(conversation.getLatestTurn().id, request.toolInvocationToken),
						5000,
						() => todoProcessor.cancel()
					);
				}
			}
		}
	}

	private async handleSummarizeCommand(
		conversation: Conversation,
		request: vscode.ChatRequest,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<vscode.ChatResult> {
		normalizeSummariesOnRounds(conversation.turns);

		// Exclude the current /compact turn.
		const history = conversation.turns.slice(0, -1);
		if (history.length === 0) {
			stream.markdown(l10n.t('Nothing to compact. Start a conversation first.'));
			return {};
		}

		// The summarization metadata needs to be associated with a tool call round.
		const lastRoundId = history.at(-1)?.rounds.at(-1)?.id;
		if (!lastRoundId) {
			stream.markdown(l10n.t('Nothing to compact. Start a conversation with tool calls first.'));
			return {};
		}

		const endpoint = await this.endpointProvider.getChatEndpoint(request);
		if (isResponsesCompactionContextManagementEnabled(endpoint, this.configurationService, this.expService)) {
			stream.markdown(l10n.t('Compaction is already managed by context management for this session.'));
			return {};
		}

		// Foreground compaction is now authoritative for this session. Cancel any
		// pending background summarizer so its (potentially stale) result doesn't
		// overwrite this `/compact` on the next render.
		this.cancelBackgroundSummarizer(conversation.sessionId);

		const availableTools = await this.instantiationService.invokeFunction(getAgentTools, request, endpoint);
		const promptContext: IBuildPromptContext = {
			history,
			chatVariables: new ChatVariablesCollection([]),
			query: '',
			toolCallRounds: [],
			conversation,
			tools: {
				availableTools,
				toolReferences: request.toolReferences.map(InternalToolReference.from),
				toolInvocationToken: request.toolInvocationToken,
			},
		};

		try {
			const propsBuilder = this.instantiationService.createInstance(SummarizedConversationHistoryPropsBuilder);
			const propsInfo = propsBuilder.getProps({
				priority: 1,
				endpoint,
				location: ChatLocation.Agent,
				promptContext,
				tools: availableTools,
				maxToolResultLength: Infinity,
			});
			if (!propsInfo) {
				stream.markdown(l10n.t('Nothing to compact yet.'));
				return {};
			}

			stream.progress(l10n.t('Compacting conversation...'));

			const progress: vscode.Progress<vscode.ChatResponseReferencePart | vscode.ChatResponseProgressPart> = {
				report: () => { }
			};
			const renderer = PromptRenderer.create(this.instantiationService, endpoint, SummarizedConversationHistory, {
				...propsInfo.props,
				triggerSummarize: true,
				summarizationInstructions: request.prompt || undefined,
			});
			const result = await renderer.render(progress, token);
			const summaryMetadata = result.metadata.get(SummarizedConversationHistoryMetadata);
			if (!summaryMetadata) {
				stream.markdown(l10n.t('Unable to compact conversation.'));
				return {};
			}

			if (summaryMetadata.usage) {
				stream.usage({
					promptTokens: summaryMetadata.usage.prompt_tokens,
					completionTokens: summaryMetadata.usage.completion_tokens,
					copilotCredits: nanoAiuToCredits(summaryMetadata.usage.copilot_usage?.total_nano_aiu),
					promptTokenDetails: summaryMetadata.promptTokenDetails,
				});
			}

			stream.markdown(l10n.t('Compacted conversation.'));
			const lastTurn = conversation.getLatestTurn();
			// Next turn if using auto will select a new endpoint
			this._automodeService.invalidateRouterCache(request);

			const chatResult: vscode.ChatResult = {
				metadata: {
					summary: {
						toolCallRoundId: summaryMetadata.toolCallRoundId,
						text: summaryMetadata.text,
					}
				}
			};

			// setResponse must be called so that turn.resultMetadata?.summary
			// is available for normalizeSummariesOnRounds on subsequent turns.
			lastTurn.setResponse(
				TurnStatus.Success,
				{ type: 'model', message: '' },
				undefined,
				chatResult,
			);

			lastTurn.setMetadata(summaryMetadata);

			return chatResult;
		} catch (e) {
			if (isCancellationError(e)) {
				return {};
			}

			const message = e instanceof Error ? e.message : String(e);
			stream.markdown(l10n.t('Failed to compact conversation: {0}', message));
			return {};
		}
	}
}

export class AgentIntentInvocation extends EditCodeIntentInvocation implements IIntentInvocation {

	public override readonly codeblocksRepresentEdits = false;

	protected prompt: typeof AgentPrompt | typeof EditCodePrompt2 | typeof NotebookInlinePrompt = AgentPrompt;

	protected extraPromptProps: Partial<AgentPromptProps> | undefined;

	private _resolvedCustomizations: AgentPromptCustomizations | undefined;

	private _lastRenderTokenCount: number = 0;

	/** Cached model capabilities from the most recent main agent render, reused by the background summarizer. */
	private _lastModelCapabilities: { enableThinking: boolean; reasoningEffort: string | undefined; enableToolSearch: boolean; enableContextEditing: boolean } | undefined;

	/**
	 * RNG used to jitter the background-summarization trigger threshold around 0.80.
	 * Tests may overwrite this directly (e.g. `(invocation as any)._thresholdRng = () => 0.5`).
	 */
	private _thresholdRng: () => number = Math.random;

	constructor(
		intent: IIntent,
		location: ChatLocation,
		endpoint: IChatEndpoint,
		request: vscode.ChatRequest,
		intentOptions: EditCodeIntentInvocationOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeMapperService codeMapperService: ICodeMapperService,
		@IEnvService envService: IEnvService,
		@IPromptPathRepresentationService promptPathRepresentationService: IPromptPathRepresentationService,
		@IEndpointProvider private readonly _endpointProvider: IEndpointProvider,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@IToolsService toolsService: IToolsService,
		@IConfigurationService configurationService: IConfigurationService,
		@IEditLogService editLogService: IEditLogService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotebookService notebookService: INotebookService,
		@ILogService private readonly logService: ILogService,
		@IExperimentationService private readonly expService: IExperimentationService,
		@IAutomodeService private readonly automodeService: IAutomodeService,
		@IOTelService protected override readonly otelService: IOTelService,
		@ISessionTranscriptService private readonly sessionTranscriptService: ISessionTranscriptService,
		@IAutomaticInstructionsCollector private readonly _automaticInstructionsCollector: IAutomaticInstructionsCollector,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
	) {
		// Apply the user's "Context Size" picker selection to the request endpoint
		// so the server-managed compaction threshold (Responses API) is keyed to the
		// selected tier rather than the model's full native window. See
		// applyContextSizeOverride for the cost rationale.
		super(intent, location, applyContextSizeOverride(endpoint, request, configurationService.getConfig(ConfigKey.PreferLongContext)), request, intentOptions, instantiationService, codeMapperService, envService, promptPathRepresentationService, _endpointProvider, workspaceService, toolsService, configurationService, editLogService, commandService, telemetryService, notebookService, otelService);
	}

	public override getAvailableTools(): Promise<vscode.LanguageModelToolInformation[]> {
		return this.instantiationService.invokeFunction(getAgentTools, this.request);
	}

	override async buildPrompt(
		promptContext: IBuildPromptContext,
		progress: vscode.Progress<vscode.ChatResponseReferencePart | vscode.ChatResponseProgressPart>,
		token: vscode.CancellationToken
	): Promise<IBuildPromptResult> {
		this._resolvedCustomizations = await PromptRegistry.resolveAllCustomizations(this.instantiationService, this.endpoint);

		// Only collect automatic instructions in the extension when the corresponding core setting opts in.
		// Otherwise the core workbench performs the collection before the request reaches the extension.
		const collectInstructionsInExtension = this.configurationService.getNonExtensionConfig<boolean>(PromptConfig.COLLECT_INSTRUCTIONS_IN_EXTENSION) === true;
		if (collectInstructionsInExtension) {
			const addedInstructionsAndIndex = await this._automaticInstructionsCollector.collect(this.request, token);
			if (addedInstructionsAndIndex.length > 0) {
				promptContext = { ...promptContext, chatVariables: ChatVariablesCollection.merge(promptContext.chatVariables, new ChatVariablesCollection(addedInstructionsAndIndex)) };
			}
		} else {
			await this.instantiationService.createInstance(CustomInstructionsReferenceLogger).compare(this.request, this._automaticInstructionsCollector, token);
		}
		await this.instantiationService.createInstance(CustomInstructionsReferenceLogger).logReferences(promptContext.conversation?.sessionId, promptContext.chatVariables.references, collectInstructionsInExtension);


		// Add any references from the codebase invocation to the request
		const codebase = await this._getCodebaseReferences(promptContext, token);

		let variables = promptContext.chatVariables;
		let toolReferences: vscode.ChatPromptReference[] = [];
		if (codebase) {
			toolReferences = toNewChatReferences(variables, codebase.references);
			variables = new ChatVariablesCollection([...variables.references, ...toolReferences]);
		}

		const tools = promptContext.tools?.availableTools;
		const toolSearchEnabled = !!this.endpoint.supportsToolSearch;
		const toolTokens = tools?.length ? await this.endpoint.acquireTokenizer().countToolTokens(tools) : 0;

		const summarizeThresholdOverride = this.configurationService.getConfig<number | undefined>(ConfigKey.Advanced.SummarizeAgentConversationHistoryThreshold);

		// Apply context size override if configured by the user in the model picker
		const configuredContextSize = this.request.modelConfiguration?.contextSize;
		const effectiveMaxTokens = typeof configuredContextSize === 'number' && configuredContextSize < this.endpoint.modelMaxPromptTokens
			? configuredContextSize
			: this.endpoint.modelMaxPromptTokens;

		// The override may be expressed as a ratio of the context window (0-1) or
		// an absolute token count (>= 100); resolve it to tokens before clamping.
		const summarizeThresholdTokens = resolveSummarizeThresholdTokens(summarizeThresholdOverride, effectiveMaxTokens, ConfigKey.Advanced.SummarizeAgentConversationHistoryThreshold.id);

		const baseBudget = Math.min(
			summarizeThresholdTokens ?? effectiveMaxTokens,
			effectiveMaxTokens
		);
		const useTruncation = this.endpoint.apiType === 'responses' && this.configurationService.getConfig(ConfigKey.Advanced.UseResponsesApiTruncation);
		const responsesCompactionContextManagementEnabled = isResponsesCompactionContextManagementEnabled(this.endpoint, this.configurationService, this.expService);
		const summarizationEnabled = this.configurationService.getConfig(ConfigKey.SummarizeAgentConversationHistory) && this.prompt === AgentPrompt && !responsesCompactionContextManagementEnabled;

		// When tools are present, apply a 10% safety margin on the message portion
		// to account for tokenizer discrepancies between our tool-token counter and
		// the model's actual tokenizer. Without this, an undercount could cause an
		// API-level context_length_exceeded error instead of a graceful
		// BudgetExceededError from prompt-tsx. When there are no tools the endpoint's
		// own modelMaxPromptTokens is used unchanged.
		const messageBudget = Math.max(1, Math.floor((baseBudget - toolTokens) * 0.9));
		const safeBudget = useTruncation ? Number.MAX_SAFE_INTEGER : messageBudget;
		const endpoint = toolTokens > 0 ? this.endpoint.cloneWithTokenOverride(safeBudget) : this.endpoint;

		this.logService.debug(`[Agent] rendering with budget=${safeBudget} (baseBudget: ${baseBudget}, toolTokens: ${toolTokens}, totalTools: ${tools?.length ?? 0}, toolSearchEnabled: ${toolSearchEnabled}), summarizationEnabled=${summarizationEnabled}`);
		let result: RenderPromptResult;
		// For the Anthropic Messages API, cache_control placement is owned
		// entirely by messagesApi.ts. Suppress prompt-tsx breakpoints to avoid
		// duplicating or shifting them — but keep summarization on, since the
		// summarization rendering path is independent from cache breakpoints.
		const isMessagesApi = this.endpoint.apiType === 'messages';
		const props: AgentPromptProps = {
			endpoint,
			promptContext: {
				...promptContext,
				chatVariables: variables,
				tools: promptContext.tools && {
					...promptContext.tools,
					toolReferences: this.stableToolReferences.filter((r) => r.name !== ToolName.Codebase),
				}
			},
			location: this.location,
			enableSummarization: summarizationEnabled,
			enableCacheBreakpoints: summarizationEnabled && !isMessagesApi,
			...this.extraPromptProps,
			customizations: this._resolvedCustomizations
		};

		// ── Background compaction ────────────────────────────────────────
		//
		//   Pre-render: if a previous bg pass completed, apply it now.
		//
		//   BudgetExceeded: if bg is InProgress/Completed, wait/apply.
		//                   Otherwise fall back to foreground summarization.
		//
		//   Post-render: kick off background compaction if Idle and the
		//                jittered/emergency threshold is met (see
		//                shouldKickOffBackgroundSummarization) so it is
		//                ready for a future turn.
		//
		const backgroundSummarizer = summarizationEnabled ? this._getOrCreateBackgroundSummarizer(promptContext.conversation?.sessionId) : undefined;
		// Walk back through turns to find the most recent one with token usage
		// metadata. On iteration 1 of a fresh user turn, the current turn has
		// no fetch yet, so fall back to the previous turn — otherwise the floor
		// would be 0 and offer no protection across user-turn boundaries.
		const lastTurnPromptTokens = findLast(promptContext.conversation?.turns ?? [], turn => !!turn.getMetadata(TurnTokenUsageMetadata))
			?.getMetadata(TurnTokenUsageMetadata)?.promptTokens;
		const contextRatio = backgroundSummarizer && baseBudget > 0
			? Math.max(this._lastRenderTokenCount + toolTokens, lastTurnPromptTokens ?? 0) / baseBudget
			: 0;

		// Track whether this iteration already performed compaction-related work
		// (including applying a summary or using a foreground fallback path) so
		// we don't immediately re-trigger background compaction in the post-render check.
		let didSummarizeThisIteration = false;

		// If a previous background pass completed, apply its summary now — but
		// only when the current context ratio still warrants it. After a model
		// switch to a larger window (or an increased context-size override) the
		// ratio can drop below `applyMinRatio`; applying a stale summary in that
		// case surfaces a confusing "Compacted conversation" notice with
		// plenty of headroom remaining.
		if (summarizationEnabled && backgroundSummarizer?.state === BackgroundSummarizationState.Completed) {
			if (contextRatio >= BackgroundSummarizationThresholds.applyMinRatio) {
				const bgResult = backgroundSummarizer.consumeAndReset();
				if (bgResult) {
					this.logService.debug(`[ConversationHistorySummarizer] applying completed background summary (roundId=${bgResult.toolCallRoundId})`);
					progress.report(new ChatResponseProgressPart2(l10n.t('Compacted conversation'), async () => l10n.t('Compacted conversation')));
					this._applySummaryToRounds(bgResult, promptContext);
					this._persistSummaryOnTurn(bgResult, promptContext, this._lastRenderTokenCount);
					this._sendBackgroundCompactionTelemetry('preRender', 'applied', contextRatio, promptContext);
					didSummarizeThisIteration = true;
				} else {
					this.logService.warn(`[ConversationHistorySummarizer] background compaction state was Completed but consumeAndReset returned no result`);
					this._sendBackgroundCompactionTelemetry('preRender', 'noResult', contextRatio, promptContext);
					this._recordBackgroundCompactionFailure(promptContext, 'preRender');
				}
			} else {
				// Drop the stale summary so a fresh kick-off can replace it later.
				backgroundSummarizer.consumeAndReset();
				this.logService.debug(`[ConversationHistorySummarizer] discarding completed background summary; contextRatio ${(contextRatio * 100).toFixed(0)}% below applyMinRatio ${(BackgroundSummarizationThresholds.applyMinRatio * 100).toFixed(0)}% (likely model switch or context-size override)`);
				this._sendBackgroundCompactionTelemetry('preRender', 'discardedBelowApplyMinRatio', contextRatio, promptContext);
			}
		}

		// Render the prompt without summarization or cache breakpoints, using
		// the original endpoint (not reduced for tools/safety buffer).
		const renderWithoutSummarization = async (reason: string, renderProps: AgentPromptProps = props): Promise<RenderPromptResult> => {
			this.logService.debug(`[Agent] ${reason}, rendering without summarization`);
			const renderer = PromptRenderer.create(this.instantiationService, this.endpoint, this.prompt, {
				...renderProps,
				endpoint: this.endpoint,
				enableSummarization: false,
				enableCacheBreakpoints: false
			});
			try {
				return await renderer.render(progress, token);
			} catch (e) {
				if (e instanceof BudgetExceededError) {
					this.logService.error(e, `[Agent] fallback render failed due to budget exceeded`);
					const maxTokens = this.endpoint.modelMaxPromptTokens;
					throw new Error(`Unable to build prompt, modelMaxPromptTokens = ${maxTokens} (${e.message})`);
				}
				throw e;
			}
		};

		// Helper function for synchronous summarization flow with fallbacks
		const renderWithSummarization = async (reason: string, renderProps: AgentPromptProps = props): Promise<RenderPromptResult> => {
			// Check if a previous foreground summarization already failed in this
			// turn.  The metadata is set on the turn returned by getLatestTurn(),
			// which is the same turn throughout a single buildPrompt call since
			// the conversation doesn't advance mid-render.
			const turn = promptContext.conversation?.getLatestTurn();
			const previousForegroundSummary = turn?.getMetadata(SummarizedConversationHistoryMetadata);
			if (previousForegroundSummary?.source === 'foreground' && previousForegroundSummary.outcome && previousForegroundSummary.outcome !== 'success') {
				this.logService.debug(`[ConversationHistorySummarizer] ${reason}, skipping repeated foreground summarization after prior failure (${previousForegroundSummary.outcome})`);
				/* __GDPR__
					"triggerSummarizeSkipped" : {
						"owner": "bhavyau",
						"comment": "Tracks when foreground summarization was skipped because a previous attempt already failed in this turn.",
						"previousOutcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the previous failed summarization attempt." },
						"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID." }
					}
				*/
				this.telemetryService.sendMSFTTelemetryEvent('triggerSummarizeSkipped', { previousOutcome: previousForegroundSummary.outcome, model: renderProps.endpoint.model });
				GenAiMetrics.incrementAgentSummarizationCount(this.otelService, 'skipped');
				return renderWithoutSummarization(`skipping repeated foreground summarization after prior failure (${previousForegroundSummary.outcome})`, renderProps);
			}

			this.logService.debug(`[ConversationHistorySummarizer] ${reason}, triggering summarization`);
			try {
				const renderer = PromptRenderer.create(this.instantiationService, this.endpoint, this.prompt, {
					...renderProps,
					endpoint: this.endpoint,
					promptContext: renderProps.promptContext,
					triggerSummarize: true,
					forceSimpleSummary: true,
				});
				return await renderer.render(progress, token);
			} catch (e) {
				this.logService.error(e, `[ConversationHistorySummarizer] summarization failed`);
				const errorKind = e instanceof BudgetExceededError ? 'budgetExceeded' : 'error';
				/* __GDPR__
					"triggerSummarizeFailed" : {
						"owner": "roblourens",
						"comment": "Tracks when triggering summarization failed - for example, a summary was created but not applied successfully.",
						"errorKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The success state or failure reason of the summarization." },
						"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID used for the summarization." }
					}
				*/
				this.telemetryService.sendMSFTTelemetryEvent('triggerSummarizeFailed', { errorKind, model: renderProps.endpoint.model });
				GenAiMetrics.incrementAgentSummarizationCount(this.otelService, 'failed');

				// Track failed foreground compaction
				const turn = promptContext.conversation?.getLatestTurn();
				turn?.setMetadata(new SummarizedConversationHistoryMetadata(
					'', // no toolCallRoundId for failures
					'', // no summary text for failures
					{
						model: renderProps.endpoint.model,
						source: 'foreground',
						outcome: errorKind,
						contextLengthBefore: this._lastRenderTokenCount,
					},
				));

				return renderWithoutSummarization(`summarization failed (${errorKind})`, renderProps);
			}
		};

		const contextLengthBefore = this._lastRenderTokenCount;

		try {
			const renderer = PromptRenderer.create(this.instantiationService, endpoint, this.prompt, props);
			result = await renderer.render(progress, token);
		} catch (e) {
			if (e instanceof BudgetExceededError && summarizationEnabled) {
				if (!promptContext.toolCallResults) {
					promptContext = {
						...promptContext,
						toolCallResults: {}
					};
				}
				e.metadata.getAll(ToolResultMetadata).forEach((metadata) => {
					promptContext.toolCallResults![metadata.toolCallId] = metadata.result;
				});

				// If a background compaction is already running or completed,
				// wait for / apply it instead of firing another LLM request.
				if (backgroundSummarizer && (backgroundSummarizer.state === BackgroundSummarizationState.InProgress || backgroundSummarizer.state === BackgroundSummarizationState.Completed)) {
					let budgetExceededTrigger: string;
					if (backgroundSummarizer.state === BackgroundSummarizationState.InProgress) {
						budgetExceededTrigger = 'budgetExceededWaited';
						this.logService.debug(`[ConversationHistorySummarizer] budget exceeded — waiting on in-progress background compaction instead of new request`);
						const summaryPromise = backgroundSummarizer.waitForCompletion();
						progress.report(new ChatResponseProgressPart2(l10n.t('Compacting conversation...'), async () => {
							try { await summaryPromise; } catch { }
							return l10n.t('Compacted conversation');
						}));
						await summaryPromise;
					} else {
						budgetExceededTrigger = 'budgetExceededReady';
						this.logService.debug(`[ConversationHistorySummarizer] budget exceeded — applying already-completed background compaction`);
						progress.report(new ChatResponseProgressPart2(l10n.t('Compacted conversation'), async () => l10n.t('Compacted conversation')));
					}
					const bgResult = backgroundSummarizer.consumeAndReset();
					if (bgResult) {
						this.logService.debug(`[ConversationHistorySummarizer] background compaction applied after budget exceeded (roundId=${bgResult.toolCallRoundId})`);
						this._applySummaryToRounds(bgResult, promptContext);
						this._persistSummaryOnTurn(bgResult, promptContext, contextLengthBefore);
						didSummarizeThisIteration = true;
						try {
							const reRenderer = PromptRenderer.create(this.instantiationService, endpoint, this.prompt, { ...props, promptContext });
							result = await reRenderer.render(progress, token);
							this._sendBackgroundCompactionTelemetry(budgetExceededTrigger, 'applied', contextRatio, promptContext);
						} catch (reRenderError) {
							if (reRenderError instanceof BudgetExceededError) {
								this.logService.debug(`[ConversationHistorySummarizer] re-render after background compaction still exceeded budget — falling back`);
								this._sendBackgroundCompactionTelemetry(budgetExceededTrigger, 'appliedButReRenderFailed', contextRatio, promptContext);
								result = await renderWithoutSummarization('budget exceeded after background compaction applied', { ...props, promptContext });
							} else {
								throw reRenderError;
							}
						}
					} else {
						this.logService.debug(`[ConversationHistorySummarizer] background compaction produced no usable result after budget exceeded — falling back to synchronous summarization`);
						this._sendBackgroundCompactionTelemetry(budgetExceededTrigger, 'noResult', contextRatio, promptContext);
						this._recordBackgroundCompactionFailure(promptContext, budgetExceededTrigger);
						// Background compaction failed — fall back to synchronous summarization
						result = await renderWithSummarization(`budget exceeded(${e.message}), background compaction failed`);
						didSummarizeThisIteration = true;
					}
				} else {
					result = await renderWithSummarization(`budget exceeded(${e.message})`);
					didSummarizeThisIteration = true;
				}
			} else {
				throw e;
			}
		}

		this._lastRenderTokenCount = result.tokenCount;

		// Track foreground compaction if summarization happened during rendering
		const summaryMeta = result.metadata.get(SummarizedConversationHistoryMetadata);
		if (summaryMeta) {
			const turn = promptContext.conversation?.getLatestTurn();
			turn?.setMetadata(new SummarizedConversationHistoryMetadata(
				summaryMeta.toolCallRoundId,
				summaryMeta.text,
				{
					thinking: summaryMeta.thinking,
					usage: summaryMeta.usage,
					promptTokenDetails: summaryMeta.promptTokenDetails,
					model: summaryMeta.model,
					summarizationMode: summaryMeta.summarizationMode,
					numRounds: summaryMeta.numRounds,
					numRoundsSinceLastSummarization: summaryMeta.numRoundsSinceLastSummarization,
					durationMs: summaryMeta.durationMs,
					source: 'foreground',
					outcome: 'success',
					contextLengthBefore,
				},
			));
		}

		// Post-render: kick off background compaction if idle and over the
		// threshold. Prompt cache parity with the main agent fetch matters
		// here — so we gate kick-off on a completed tool call (cache has been
		// warmed) and jitter the threshold around 0.80 to avoid firing at the
		// same exact boundary every time.
		if (summarizationEnabled && backgroundSummarizer && !didSummarizeThisIteration) {
			const usePrismCompaction = this.configurationService.getExperimentBasedConfig(
				ConfigKey.ConversationUsePrismCompaction,
				this.expService,
			);

			if (usePrismCompaction) {
				// Prism experiment path: route compaction kick-off through the
				// trajectory-compaction CAPI endpoint (subject to filter).
				const localPostRender = result.tokenCount + toolTokens;
				const effectivePostRender = Math.max(localPostRender, lastTurnPromptTokens ?? 0);
				const postRenderRatio = baseBudget > 0
					? effectivePostRender / baseBudget
					: 0;

				const idleOrFailed = backgroundSummarizer.state === BackgroundSummarizationState.Idle
					|| backgroundSummarizer.state === BackgroundSummarizationState.Failed;

				const routingDecision = await decidePrismRouting(
					this.endpoint,
					this.configurationService,
					this.expService,
					this._endpointProvider,
					this.logService,
				);

				if (routingDecision.usePrism) {
					// Prism endpoint shares no prompt-cache prefix with the main
					// agent loop, so force cacheWarm=true to skip the cache-warm
					// gate (a same-endpoint optimization).
					const cacheWarm = true;
					const kickOff = shouldKickOffBackgroundSummarization(postRenderRatio, cacheWarm, this._thresholdRng);
					if (kickOff && idleOrFailed) {
						this.logService.debug(
							`[ConversationHistorySummarizer] background compaction trigger: postRenderRatio=${postRenderRatio.toFixed(3)}, ` +
							`contextTokens=${effectivePostRender}, baseBudget=${baseBudget}, cacheWarm=${cacheWarm}, ` +
							`agentEndpoint=${this.endpoint.model} (modelMaxPromptTokens=${this.endpoint.modelMaxPromptTokens}), ` +
							`routing: usePrism=true — ${routingDecision.reason}`
						);
						this._startPrismBackgroundSummarization(backgroundSummarizer, promptContext, token, postRenderRatio);
					}
				} else {
					// Filter excluded this model — production-style kickoff.
					const cacheWarm = (promptContext.toolCallRounds?.length ?? 0) > 0;
					const kickOff = shouldKickOffBackgroundSummarization(postRenderRatio, cacheWarm, this._thresholdRng);
					if (kickOff && idleOrFailed) {
						const strippedMessages = ToolCallingLoop.stripInternalToolCallIds(result.messages);
						const rawEffort = this.request.modelConfiguration?.reasoningEffort;
						const isSubagent = !!this.request.subAgentInvocationId;
						const shouldDisableThinking = !!promptContext.isContinuation && isAnthropicFamily(this.endpoint) && !ToolCallingLoop.messagesContainThinking(strippedMessages);
						this._lastModelCapabilities = {
							enableThinking: !shouldDisableThinking,
							reasoningEffort: typeof rawEffort === 'string' ? rawEffort : undefined,
							enableToolSearch: !isSubagent && !!this.endpoint.supportsToolSearch,
							enableContextEditing: !isSubagent && isAnthropicContextEditingEnabled(this.endpoint, this.configurationService, this.expService),
						};
						this._startBackgroundSummarization(backgroundSummarizer, result.messages, promptContext, props, token, postRenderRatio);
					}
				}
			} else {
				// Production path (off-flag): byte-identical to pre-prism upstream.
				const localPostRender = result.tokenCount + toolTokens;
				const effectivePostRender = Math.max(localPostRender, lastTurnPromptTokens ?? 0);
				const postRenderRatio = baseBudget > 0
					? effectivePostRender / baseBudget
					: 0;

				const idleOrFailed = backgroundSummarizer.state === BackgroundSummarizationState.Idle
					|| backgroundSummarizer.state === BackgroundSummarizationState.Failed;

				const cacheWarm = (promptContext.toolCallRounds?.length ?? 0) > 0;
				const kickOff = shouldKickOffBackgroundSummarization(postRenderRatio, cacheWarm, this._thresholdRng);
				if (kickOff && idleOrFailed) {
					// Compute and cache model capabilities from the current render's
					// messages. These must match the main agent fetch for cache parity.
					const strippedMessages = ToolCallingLoop.stripInternalToolCallIds(result.messages);
					const rawEffort = this.request.modelConfiguration?.reasoningEffort;
					const isSubagent = !!this.request.subAgentInvocationId;
					// Must match the main agent's enableThinking logic in
					// toolCallingLoop.ts runOne() — thinking is only disabled
					// on continuation turns for Anthropic when no thinking
					// blocks exist yet in the messages.
					const shouldDisableThinking = !!promptContext.isContinuation && isAnthropicFamily(this.endpoint) && !ToolCallingLoop.messagesContainThinking(strippedMessages);
					this._lastModelCapabilities = {
						enableThinking: !shouldDisableThinking,
						reasoningEffort: typeof rawEffort === 'string' ? rawEffort : undefined,
						enableToolSearch: !isSubagent && !!this.endpoint.supportsToolSearch,
						enableContextEditing: !isSubagent && isAnthropicContextEditingEnabled(this.endpoint, this.configurationService, this.expService),
					};
					this._startBackgroundSummarization(backgroundSummarizer, result.messages, promptContext, props, token, postRenderRatio);
				}
			}
		}

		// Background todo processing
		this._maybeStartBackgroundTodoAgentPass(endpoint, promptContext, token);

		const lastMessage = result.messages.at(-1);
		if (lastMessage?.role === Raw.ChatRole.User) {
			const currentTurn = promptContext.conversation?.getLatestTurn();
			if (currentTurn && !currentTurn.getMetadata(RenderedUserMessageMetadata)) {
				currentTurn.setMetadata(new RenderedUserMessageMetadata(lastMessage.content));
			}
		}

		if (this.endpoint.apiType !== 'messages') {
			addCacheBreakpoints(result.messages);
		}

		if (this.request.command === 'error') {
			// Should trigger a 400
			result.messages.push({
				role: Raw.ChatRole.Assistant,
				content: [],
				toolCalls: [{ type: 'function', id: '', function: { name: 'tool', arguments: '{' } }]
			});
		}


		return {
			...result,
			// The codebase tool is not actually called/referenced in the edit prompt, so we ned to
			// merge its metadata so that its output is not lost and it's not called repeatedly every turn
			// todo@connor4312/joycerhl: this seems a bit janky
			metadata: codebase ? mergeMetadata(result.metadata, codebase.metadatas) : result.metadata,
			// Don't report file references that came in via chat variables in an editing session, unless they have warnings,
			// because they are already displayed as part of the working set
			// references: result.references.filter((ref) => this.shouldKeepReference(editCodeStep, ref, toolReferences, chatVariables)),
		};
	}

	modifyErrorDetails(errorDetails: vscode.ChatErrorDetails, response: ChatResponse): vscode.ChatErrorDetails {
		if (!errorDetails.responseIsFiltered) {
			errorDetails.confirmationButtons = [
				...(errorDetails.confirmationButtons ?? []),
				{ data: { copilotContinueOnError: true } satisfies IContinueOnErrorConfirmation, label: l10n.t('Try Again') },
			];
		}
		return errorDetails;
	}

	getAdditionalVariables(promptContext: IBuildPromptContext): ChatVariablesCollection | undefined {
		const lastTurn = promptContext.conversation?.turns.at(-1);
		if (!lastTurn) {
			return;
		}

		// Search backwards to find the first real request and return those variables too.
		// Variables aren't re-attached to requests from confirmations.
		// TODO https://github.com/microsoft/vscode/issues/262858, more to do here
		if (lastTurn.acceptedConfirmationData) {
			const turns = promptContext.conversation!.turns.slice(0, -1);
			for (const turn of Iterable.reverse(turns)) {
				if (!turn.acceptedConfirmationData) {
					return turn.promptVariables;
				}
			}
		}
	}

	private _startBackgroundSummarization(
		backgroundSummarizer: BackgroundSummarizer,
		mainRenderMessages: Raw.ChatMessage[],
		promptContext: IBuildPromptContext,
		props: AgentPromptProps,
		token: vscode.CancellationToken,
		contextRatio: number,
	): void {
		// Snapshot rounds so telemetry reflects state at kick-off time, not at
		// completion time (the main loop mutates toolCallRounds). History is
		// stable across a single user turn so a reference is sufficient.
		const rounds = [...(promptContext.toolCallRounds ?? [])];
		const history = promptContext.history;

		// Resolve the round the summary will attach to up front. Without an
		// anchor (e.g. an early turn before any tool-call round exists, reached
		// via a cold-cache emergency kick-off) there is nothing to attach the
		// result to, so skip *before* firing the expensive summarization request
		// rather than running it for many seconds only to discard the result —
		// which, on slow models, also stalls a later budget-exceeded render that
		// waits on the in-flight request.
		const toolCallRoundId = resolveSummaryAnchorRoundId(rounds, history);
		if (!toolCallRoundId) {
			this.logService.debug(`[ConversationHistorySummarizer] skipping background compaction at ${(contextRatio * 100).toFixed(0)}% — no tool call round to attach summary to (rounds=${rounds.length}, history=${history.length})`);
			return;
		}

		this.logService.debug(`[ConversationHistorySummarizer] context at ${(contextRatio * 100).toFixed(0)}% — starting background compaction`);

		const bgStartTime = Date.now();

		// Build tool schemas matching the main agent loop so the prompt
		// prefix (system + tools + messages) is identical for cache hits.
		const availableTools = promptContext.tools?.availableTools;
		const normalizedTools = availableTools?.length ? normalizeToolSchema(
			this.endpoint.family,
			availableTools.map(tool => ({
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.inputSchema && Object.keys(tool.inputSchema).length ? tool.inputSchema : undefined
				},
				type: 'function' as const,
			})),
			(tool, rule) => {
				this.logService.warn(`[ConversationHistorySummarizer] Tool ${tool} failed validation: ${rule}`);
			},
		) : undefined;
		const toolOpts = normalizedTools?.length ? {
			tools: normalizedTools,
		} : undefined;

		const associatedRequestId = promptContext.conversation?.getLatestTurn()?.id;
		const conversationId = promptContext.conversation?.sessionId;
		const modelCapabilities = this._lastModelCapabilities;

		backgroundSummarizer.start(async bgToken => {
			try {
				// Fork the exact messages from the main render and append a
				// summary user message. The prompt prefix is byte-identical
				// to the main agent loop for cache hits.
				const strippedMainMessages = ToolCallingLoop.stripInternalToolCallIds(mainRenderMessages);
				const summaryMsgResult = await renderPromptElement(
					this.instantiationService,
					this.endpoint,
					SummarizationUserMessage,
					{ endpoint: this.endpoint },
					undefined,
					bgToken,
				);
				const messages = [
					...strippedMainMessages,
					...summaryMsgResult.messages,
				];

				const response = await this.endpoint.makeChatRequest2({
					debugName: 'summarizeConversationHistory',
					messages,
					finishedCb: undefined,
					location: ChatLocation.Agent,
					conversationId,
					requestOptions: {
						temperature: 0,
						...toolOpts,
					},
					modelCapabilities,
					telemetryProperties: associatedRequestId ? { associatedRequestId } : undefined,
					enableRetryOnFilter: true,
					interactionTypeOverride: 'conversation-compaction',
				}, bgToken);
				if (response.type !== ChatFetchResponseType.Success) {
					throw new Error(`Background summarization request failed: ${response.type}`);
				}
				const rawSummaryText = extractSummary(response.value);
				if (rawSummaryText === undefined) {
					throw new Error('Background summarization: no <summary> tags found in response');
				}
				// Flush the transcript before snapshotting the line count so
				// the baked "N lines" hint matches the on-disk file at this
				// moment (mirrors the full/simple path in SummarizedConversationHistory.render).
				if (conversationId && this.sessionTranscriptService.getTranscriptPath(conversationId)) {
					await this.sessionTranscriptService.flush(conversationId);
				}
				const summaryText = conversationId
					? appendTranscriptHintToSummary(rawSummaryText, conversationId, this.sessionTranscriptService)
					: rawSummaryText;
				this.logService.debug(`[ConversationHistorySummarizer] background compaction completed (${summaryText.length} chars, roundId=${toolCallRoundId})`);

				// Send summarizedConversationHistory telemetry for parity
				// with the standard ConversationHistorySummarizer path.
				const { numRounds, numRoundsSinceLastSummarization } = computeSummarizationRoundCounts(history, rounds);
				const numRoundsInCurrentTurn = rounds.length;
				const lastUsedTool = rounds.at(-1)?.toolCalls?.at(-1)?.name
					?? history.at(-1)?.rounds.at(-1)?.toolCalls?.at(-1)?.name ?? 'none';
				const promptTypes = messages.map(msg => `${msg.role}${'name' in msg && msg.name ? `-${msg.name}` : ''}:${getTextPart(msg.content).length}`).join(',');
				/* __GDPR__
					"summarizedConversationHistory" : {
						"owner": "bhavyau",
						"comment": "Tracks background summarization outcome",
						"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The success state." },
						"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID." },
						"summarizationMode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The summarization mode." },
						"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Session id." },
						"chatRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat request ID." },
						"lastUsedTool": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The last tool used before summarization." },
						"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request ID from the summarization call." },
						"promptTypes": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Role and character count of each prompt message in order, as a proxy for cache hit rate (e.g. system:1234,user:567)." },
						"numRounds": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total tool call rounds." },
						"turnIndex": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The index of the current turn." },
						"curTurnRoundIndex": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The index of the current round within the current turn." },
						"isDuringToolCalling": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Whether this was triggered during tool calling." },
						"duration": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Duration in ms." },
						"promptTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Prompt tokens." },
						"promptCacheTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Cached prompt tokens." },
						"responseTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Output tokens." }
					}
				*/
				this.telemetryService.sendMSFTTelemetryEvent('summarizedConversationHistory', {
					outcome: 'success',
					model: this.endpoint.model,
					summarizationMode: 'full',
					conversationId,
					chatRequestId: associatedRequestId,
					lastUsedTool,
					requestId: response.requestId,
					promptTypes,
				}, {
					numRounds,
					turnIndex: history.length,
					curTurnRoundIndex: numRoundsInCurrentTurn,
					isDuringToolCalling: numRoundsInCurrentTurn > 0 ? 1 : 0,
					duration: Date.now() - bgStartTime,
					promptTokenCount: response.usage?.prompt_tokens,
					promptCacheTokenCount: response.usage?.prompt_tokens_details?.cached_tokens,
					responseTokenCount: response.usage?.completion_tokens,
				});

				return {
					summary: summaryText,
					toolCallRoundId,
					promptTokens: response.usage?.prompt_tokens,
					promptCacheTokens: response.usage?.prompt_tokens_details?.cached_tokens,
					outputTokens: response.usage?.completion_tokens,
					durationMs: Date.now() - bgStartTime,
					model: this.endpoint.model,
					summarizationMode: 'full',
					numRounds,
					numRoundsSinceLastSummarization,
				};
			} catch (err) {
				this.logService.error(err, `[ConversationHistorySummarizer] background compaction failed`);

				/* __GDPR__
					"summarizedConversationHistory" : {
						"owner": "bhavyau",
						"comment": "Tracks background summarization failure",
						"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The success state." },
						"detailedOutcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Detailed failure reason." },
						"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID." },
						"summarizationMode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The summarization mode." },
						"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Session id." },
						"chatRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat request ID." },
						"duration": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Duration in ms." }
					}
				*/
				this.telemetryService.sendMSFTTelemetryEvent('summarizedConversationHistory', {
					outcome: 'failed',
					detailedOutcome: err instanceof Error ? err.message : String(err),
					model: this.endpoint.model,
					summarizationMode: 'full',
					conversationId,
					chatRequestId: associatedRequestId,
				}, {
					duration: Date.now() - bgStartTime,
				});

				throw err;
			}
		}, token);
	}

	/**
	 * Prism background-compaction path: routes the trajectory-compaction
	 * request to a separately resolved CAPI endpoint. The cache-parity
	 * machinery used by `_startBackgroundSummarization` doesn't apply since
	 * the target model differs from the agent endpoint; the prompt is
	 * re-rendered against the compaction endpoint and sent without tools.
	 */
	private _startPrismBackgroundSummarization(
		backgroundSummarizer: BackgroundSummarizer,
		promptContext: IBuildPromptContext,
		token: vscode.CancellationToken,
		contextRatio: number,
	): void {
		this.logService.debug(`[ConversationHistorySummarizer] context at ${(contextRatio * 100).toFixed(0)}% — starting prism background compaction`);

		const bgStartTime = Date.now();

		// Snapshot rounds so telemetry reflects state at kick-off time, not at
		// completion time (the main loop mutates toolCallRounds). History is
		// stable across a single user turn so a reference is sufficient.
		const rounds = [...(promptContext.toolCallRounds ?? [])];
		const history = promptContext.history;
		const availableTools = promptContext.tools?.availableTools;
		const associatedRequestId = promptContext.conversation?.getLatestTurn()?.id;
		const conversationId = promptContext.conversation?.sessionId;

		backgroundSummarizer.start(async bgToken => {
			// Hoisted so the failure-telemetry block below can attribute the
			// outcome to the resolved compaction endpoint. Undefined if
			// resolution itself threw — fall back to the agent model.
			let compactionEndpoint: IChatEndpoint | undefined;
			try {
				compactionEndpoint = await resolveCompactionEndpoint(
					this.endpoint,
					this.configurationService,
					this.expService,
					this._endpointProvider,
					this.logService,
				);

				const rendered = await this._renderCrossEndpointCompactionMessages(
					compactionEndpoint,
					promptContext,
					availableTools,
					bgToken,
				);
				if (!rendered) {
					// Nothing to summarize (or render cancelled mid-flight). Treated
					// as cancellation so the catch below skips failure telemetry.
					throw new CancellationError();
				}
				const messages = rendered.messages;
				// Trust the freshly-rendered round id — the helper rendered
				// the prompt that summarizes up through
				// `rendered.summarizedToolCallRoundId`, so the resulting
				// summary must attach to that same round.
				const toolCallRoundId = rendered.summarizedToolCallRoundId;

				const response = await compactionEndpoint.makeChatRequest2({
					debugName: 'summarizeConversationHistory',
					messages,
					finishedCb: undefined,
					location: ChatLocation.Agent,
					conversationId,
					requestOptions: {
						temperature: 0,
					},
					telemetryProperties: associatedRequestId ? { associatedRequestId } : undefined,
					enableRetryOnFilter: true,
					interactionTypeOverride: 'conversation-compaction',
				}, bgToken);
				let rawResponseText: string;
				let responseUsage: APIUsage | undefined;
				if (response.type === ChatFetchResponseType.Success) {
					rawResponseText = response.value;
					responseUsage = response.usage;
				} else if (response.type === ChatFetchResponseType.Length) {
					// Model hit its output token cap mid-completion; partial text is in
					// `truncatedValue` and `extractSummary` tolerates a missing `</summary>`
					// close tag, so prefer using it over failing outright.
					rawResponseText = response.truncatedValue;
					this.logService.warn(`[ConversationHistorySummarizer] prism background compaction response truncated by model length limit (${rawResponseText.length} chars)`);
				} else {
					throw formatCompactionFailureError(response as never);
				}
				const rawSummaryText = extractSummary(rawResponseText);
				if (rawSummaryText === undefined) {
					throw new Error('Background summarization: no <summary> tags found in response');
				}
				// Flush the transcript before snapshotting the line count so
				// the baked "N lines" hint matches the on-disk file at this
				// moment (mirrors the full/simple path in SummarizedConversationHistory.render).
				if (conversationId && this.sessionTranscriptService.getTranscriptPath(conversationId)) {
					await this.sessionTranscriptService.flush(conversationId);
				}
				const summaryText = conversationId
					? appendTranscriptHintToSummary(rawSummaryText, conversationId, this.sessionTranscriptService)
					: rawSummaryText;
				this.logService.debug(`[ConversationHistorySummarizer] prism background compaction completed (${summaryText.length} chars, roundId=${toolCallRoundId})`);

				const { numRounds, numRoundsSinceLastSummarization } = computeSummarizationRoundCounts(history, rounds);
				const numRoundsInCurrentTurn = rounds.length;
				const lastUsedTool = rounds.at(-1)?.toolCalls?.at(-1)?.name
					?? history.at(-1)?.rounds.at(-1)?.toolCalls?.at(-1)?.name ?? 'none';
				const promptTypes = messages.map(msg => `${msg.role}${'name' in msg && msg.name ? `-${msg.name}` : ''}:${getTextPart(msg.content).length}`).join(',');
				this.telemetryService.sendMSFTTelemetryEvent('summarizedConversationHistory', {
					outcome: 'success',
					model: compactionEndpoint.model,
					summarizationMode: 'full',
					conversationId,
					chatRequestId: associatedRequestId,
					lastUsedTool,
					requestId: response.requestId,
					promptTypes,
				}, {
					numRounds,
					turnIndex: history.length,
					curTurnRoundIndex: numRoundsInCurrentTurn,
					isDuringToolCalling: numRoundsInCurrentTurn > 0 ? 1 : 0,
					duration: Date.now() - bgStartTime,
					promptTokenCount: responseUsage?.prompt_tokens,
					promptCacheTokenCount: responseUsage?.prompt_tokens_details?.cached_tokens,
					responseTokenCount: responseUsage?.completion_tokens,
				});

				return {
					summary: summaryText,
					toolCallRoundId,
					promptTokens: responseUsage?.prompt_tokens,
					promptCacheTokens: responseUsage?.prompt_tokens_details?.cached_tokens,
					outputTokens: responseUsage?.completion_tokens,
					durationMs: Date.now() - bgStartTime,
					model: compactionEndpoint.model,
					summarizationMode: 'full',
					numRounds,
					numRoundsSinceLastSummarization,
				};
			} catch (err) {
				// Token-driven cancellation is expected — the outer
				// BackgroundSummarizer.start discards the result. Don't log
				// or telemeter as a failure; rethrow so the outer state
				// machine still transitions.
				if (bgToken.isCancellationRequested || isCancellationError(err)) {
					this.logService.debug(`[ConversationHistorySummarizer] prism background compaction cancelled`);
					throw err;
				}

				this.logService.error(err, `[ConversationHistorySummarizer] prism background compaction failed`);

				this.telemetryService.sendMSFTTelemetryEvent('summarizedConversationHistory', {
					outcome: 'failed',
					detailedOutcome: err instanceof Error ? err.message : String(err),
					model: compactionEndpoint?.model ?? this.endpoint.model,
					summarizationMode: 'full',
					conversationId,
					chatRequestId: associatedRequestId,
				}, {
					duration: Date.now() - bgStartTime,
				});

				throw err;
			}
		}, token);
	}

	/**
	 * Returns the `BackgroundSummarizer` for this session, or `undefined` if
	 * the intent is not an `AgentIntent` (e.g. `AskAgentIntent`).
	 */
	private _getOrCreateBackgroundSummarizer(sessionId: string | undefined): BackgroundSummarizer | undefined {
		if (!sessionId || !(this.intent instanceof AgentIntent)) {
			return undefined;
		}
		// Compose a stable endpoint identity. `model` alone is not unique across
		// providers (the same model id can come from different providers / api
		// types), so include those to avoid reusing a summary built against a
		// different endpoint's prefix.
		const endpointId = `${this.endpoint.modelProvider}:${this.endpoint.model}${this.endpoint.apiType ? `:${this.endpoint.apiType}` : ''}`;
		return this.intent.getOrCreateBackgroundSummarizer(sessionId, this.endpoint.modelMaxPromptTokens, endpointId);
	}

	/**
	 * Cross-endpoint re-render of the compaction prompt — needed when the
	 * prism compaction model differs from the main agent endpoint. Tools are
	 * intentionally omitted; the summarization prompt is self-contained.
	 */
	private async _renderCrossEndpointCompactionMessages(
		compactionEndpoint: IChatEndpoint,
		promptContext: IBuildPromptContext,
		availableTools: ReadonlyArray<vscode.LanguageModelToolInformation> | undefined,
		bgToken: vscode.CancellationToken,
	): Promise<{ messages: Raw.ChatMessage[]; summarizedToolCallRoundId: string } | undefined> {
		const rendered = await renderCompactionMessages(
			compactionEndpoint,
			promptContext,
			availableTools,
			this.instantiationService,
			this.logService,
			bgToken,
		);
		if (!rendered) {
			return undefined;
		}
		return { messages: rendered.messages, summarizedToolCallRoundId: rendered.summarizedToolCallRoundId };
	}

	/**
	 * Apply a background-compaction result onto the in-memory rounds so
	 * that the next render picks up the `<conversation-summary>` element.
	 */
	private _applySummaryToRounds(bgResult: { summary: string; toolCallRoundId: string }, promptContext: IBuildPromptContext): void {
		// Check current-turn rounds first
		const currentRound = promptContext.toolCallRounds?.find(r => r.id === bgResult.toolCallRoundId);
		if (currentRound) {
			currentRound.summary = bgResult.summary;
		} else {
			// Fall back to history turns
			let found = false;
			for (const turn of [...promptContext.history].reverse()) {
				const round = turn.rounds.find(r => r.id === bgResult.toolCallRoundId);
				if (round) {
					round.summary = bgResult.summary;
					found = true;
					break;
				}
			}
			if (!found) {
				this.logService.warn(`[ConversationHistorySummarizer] background compaction round ${bgResult.toolCallRoundId} not found in toolCallRounds or history — summary dropped`);
			}
		}
		// Invalidate the auto mode router cache so the next getChatEndpoint()
		// call re-evaluates which model to use after compaction.
		this.automodeService.invalidateRouterCache(this.request);
	}

	/**
	 * Persist the summary on the current turn's `resultMetadata` so that
	 * `normalizeSummariesOnRounds` restores it on subsequent turns.
	 */
	private _persistSummaryOnTurn(bgResult: IBackgroundSummarizationResult, promptContext: IBuildPromptContext, contextLengthBefore?: number): void {
		const turn = promptContext.conversation?.getLatestTurn();
		const chatResult = turn?.responseChatResult;
		if (chatResult) {
			const metadata = (chatResult.metadata ?? {}) as Record<string, unknown>;
			const existingSummaries = (metadata['summaries'] as unknown[] ?? []);
			existingSummaries.push({ toolCallRoundId: bgResult.toolCallRoundId, text: bgResult.summary });
			metadata['summaries'] = existingSummaries;
			(chatResult as { metadata: unknown }).metadata = metadata;
		}
		// Also store as a pending summary on the turn so normalizeSummariesOnRounds
		// can restore it even when chatResult doesn't exist yet (mid-tool-call-loop).
		turn?.addPendingSummary(bgResult.toolCallRoundId, bgResult.summary);
		const usage = bgResult.promptTokens !== undefined && bgResult.outputTokens !== undefined
			? { prompt_tokens: bgResult.promptTokens, completion_tokens: bgResult.outputTokens, total_tokens: bgResult.promptTokens + bgResult.outputTokens, ...(bgResult.promptCacheTokens !== undefined ? { prompt_tokens_details: { cached_tokens: bgResult.promptCacheTokens } } : {}) }
			: undefined;
		turn?.setMetadata(new SummarizedConversationHistoryMetadata(
			bgResult.toolCallRoundId,
			bgResult.summary,
			{
				usage,
				model: bgResult.model,
				summarizationMode: bgResult.summarizationMode,
				numRounds: bgResult.numRounds,
				numRoundsSinceLastSummarization: bgResult.numRoundsSinceLastSummarization,
				durationMs: bgResult.durationMs,
				source: 'background',
				outcome: 'success',
				contextLengthBefore,
			},
		));
	}

	/**
	 * Record a background compaction failure on the current turn's metadata,
	 * matching how foreground compaction records its failures.
	 */
	private _recordBackgroundCompactionFailure(promptContext: IBuildPromptContext, trigger: string): void {
		const turn = promptContext.conversation?.getLatestTurn();
		turn?.setMetadata(new SummarizedConversationHistoryMetadata(
			'', // no toolCallRoundId for failures
			'', // no summary text for failures
			{
				model: this.endpoint.model,
				source: 'background',
				outcome: `noResult_${trigger}`,
				contextLengthBefore: this._lastRenderTokenCount,
			},
		));
	}

	private _sendBackgroundCompactionTelemetry(
		trigger: string,
		outcome: string,
		contextRatio: number,
		promptContext: IBuildPromptContext,
	): void {
		/* __GDPR__
			"backgroundSummarizationApplied" : {
				"owner": "bhavyau",
				"comment": "Tracks background compaction orchestration decisions and outcomes in the agent loop.",
				"trigger": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The code path that triggered background compaction consumption." },
				"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Outcome of the background compaction consumption. One of: 'applied' (result applied and re-render succeeded), 'appliedButReRenderFailed' (result applied but the subsequent re-render still exceeded budget and required a fallback), 'noResult' (no usable result was produced), 'discardedBelowApplyMinRatio' (a completed background result was thrown away because the current context ratio dropped below the apply threshold \u2014 typically after a model switch to a larger window)." },
				"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id for the current chat conversation." },
				"chatRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat request ID that this background compaction was consumed during." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID used." },
				"contextRatio": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The context window usage ratio when background compaction was consumed." }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('backgroundSummarizationApplied', {
			trigger,
			outcome,
			conversationId: promptContext.conversation?.sessionId,
			chatRequestId: promptContext.conversation?.getLatestTurn()?.id,
			model: this.endpoint.model,
		}, {
			contextRatio,
		});
		GenAiMetrics.incrementAgentSummarizationCount(this.otelService, outcome);
	}

	// ── Background todo processing ──────────────────────────────────
	private _getOrCreateBackgroundTodoAgentProcessor(promptContext: IBuildPromptContext) {
		if (!(this.intent instanceof AgentIntent)) {
			return undefined;
		}
		return this.intent.getOrCreateBackgroundTodoProcessor(promptContext);
	}
	private _maybeStartBackgroundTodoAgentPass(endpoint: IChatEndpoint, promptContext: IBuildPromptContext, token: vscode.CancellationToken) {
		if (
			!isBackgroundTodoAgentEnabled(endpoint, this.configurationService, this.expService, this.authenticationService, this.request) ||
			isTodoToolExplicitlyEnabled(this.request) ||
			this.request.subAgentInvocationId !== undefined ||
			this.request.subAgentName !== undefined ||
			!isBackgroundTodoAgentEnabled(endpoint, this.configurationService, this.expService, this.authenticationService, this.request) ||
			isTodoToolExplicitlyEnabled(this.request)
		) {
			return;
		}

		const processor = this._getOrCreateBackgroundTodoAgentProcessor(promptContext);
		if (processor === undefined) {
			return;
		}

		processor.trackTurnRound(promptContext, token);
	}

	override processResponse = undefined;
}
