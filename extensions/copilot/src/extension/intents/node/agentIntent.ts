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
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { isAnthropicFamily, isGptFamily, modelCanUseApplyPatchExclusively, modelCanUseReplaceStringExclusively, modelSupportsApplyPatch, modelSupportsMultiReplaceString, modelSupportsReplaceString, modelSupportsSimplifiedApplyPatchInstructions } from '../../../platform/endpoint/common/chatModelCapabilities';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IAutomodeService } from '../../../platform/endpoint/node/automodeService';
import { IEnvService } from '../../../platform/env/common/envService';
import { ILogService } from '../../../platform/log/common/logService';
import { IEditLogService } from '../../../platform/multiFileEdit/common/editLogService';
import { CUSTOM_TOOL_SEARCH_NAME, isAnthropicCustomToolSearchEnabled, isAnthropicContextEditingEnabled, isAnthropicToolSearchEnabled } from '../../../platform/networking/common/anthropic';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { modelsWithoutResponsesContextManagement } from '../../../platform/networking/common/openai';
import { INotebookService } from '../../../platform/notebook/common/notebookService';
import { GenAiMetrics } from '../../../platform/otel/common/genAiMetrics';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { ITasksService } from '../../../platform/tasks/common/tasksService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ITestProvider } from '../../../platform/testing/common/testProvider';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';

import { isCancellationError } from '../../../util/vs/base/common/errors';
import { Iterable } from '../../../util/vs/base/common/iterator';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';

import { ChatResponseProgressPart2 } from '../../../vscodeTypes';
import { ICommandService } from '../../commands/node/commandService';
import { Intent } from '../../common/constants';
import { ChatVariablesCollection } from '../../prompt/common/chatVariablesCollection';
import { Conversation, normalizeSummariesOnRounds, RenderedUserMessageMetadata, TurnStatus } from '../../prompt/common/conversation';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { getRequestedToolCallIterationLimit, IContinueOnErrorConfirmation } from '../../prompt/common/specialRequestTypes';
import { ChatTelemetryBuilder } from '../../prompt/node/chatParticipantTelemetry';
import { IDefaultIntentRequestHandlerOptions } from '../../prompt/node/defaultIntentRequestHandler';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { IBuildPromptResult, IIntent, IIntentInvocation } from '../../prompt/node/intents';
import { AgentPrompt, AgentPromptProps } from '../../prompts/node/agent/agentPrompt';
import { BackgroundSummarizationState, BackgroundSummarizer, IBackgroundSummarizationResult } from '../../prompts/node/agent/backgroundSummarizer';
import { AgentPromptCustomizations, PromptRegistry } from '../../prompts/node/agent/promptRegistry';
import { extractInlineSummary, InlineSummarizationUserMessage, SummarizedConversationHistory, SummarizedConversationHistoryMetadata, SummarizedConversationHistoryPropsBuilder } from '../../prompts/node/agent/summarizedConversationHistory';
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

function isResponsesCompactionContextManagementEnabled(endpoint: IChatEndpoint, configurationService: IConfigurationService, experimentationService: IExperimentationService): boolean {
	return endpoint.apiType === 'responses'
		&& configurationService.getExperimentBasedConfig(ConfigKey.ResponsesApiContextManagementEnabled, experimentationService)
		&& !modelsWithoutResponsesContextManagement.has(endpoint.family);
}

export const getAgentTools = async (accessor: ServicesAccessor, request: vscode.ChatRequest) => {
	const toolsService = accessor.get<IToolsService>(IToolsService);
	const testService = accessor.get<ITestProvider>(ITestProvider);
	const tasksService = accessor.get<ITasksService>(ITasksService);
	const configurationService = accessor.get<IConfigurationService>(IConfigurationService);
	const experimentationService = accessor.get<IExperimentationService>(IExperimentationService);
	const endpointProvider = accessor.get<IEndpointProvider>(IEndpointProvider);
	const editToolLearningService = accessor.get<IEditToolLearningService>(IEditToolLearningService);
	const model = await endpointProvider.getChatEndpoint(request);

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

	const searchSubagentEnabled = configurationService.getExperimentBasedConfig(ConfigKey.Advanced.SearchSubagentToolEnabled, experimentationService);
	const isGptOrAnthropic = isGptFamily(model) || isAnthropicFamily(model);
	allowTools[ToolName.SearchSubagent] = isGptOrAnthropic && searchSubagentEnabled;

	const executionSubagentEnabled = configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ExecutionSubagentToolEnabled, experimentationService);
	allowTools[ToolName.ExecutionSubagent] = isGptOrAnthropic && executionSubagentEnabled;

	if (model.family.includes('grok-code')) {
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

	allowTools[CUSTOM_TOOL_SEARCH_NAME] = isAnthropicCustomToolSearchEnabled(model, configurationService, experimentationService);

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

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IEndpointProvider endpointProvider: IEndpointProvider,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
		@ICodeMapperService codeMapperService: ICodeMapperService,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@IChatSessionService chatSessionService: IChatSessionService,
		@IAutomodeService private readonly _automodeService: IAutomodeService,
	) {
		super(instantiationService, endpointProvider, configurationService, expService, codeMapperService, workspaceService, { intentInvocation: AgentIntentInvocation, processCodeblocks: false });
		chatSessionService.onDidDisposeChatSession(sessionId => {
			const summarizer = this._backgroundSummarizers.get(sessionId);
			if (summarizer) {
				summarizer.cancel();
				this._backgroundSummarizers.delete(sessionId);
			}
		});
	}

	getOrCreateBackgroundSummarizer(sessionId: string, modelMaxPromptTokens: number): BackgroundSummarizer {
		let summarizer = this._backgroundSummarizers.get(sessionId);
		if (!summarizer) {
			summarizer = new BackgroundSummarizer(modelMaxPromptTokens);
			this._backgroundSummarizers.set(sessionId, summarizer);
		}
		return summarizer;
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

		return super.handleRequest(conversation, request, stream, token, documentContext, agentName, location, chatTelemetry, yieldRequested);
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

		const promptContext: IBuildPromptContext = {
			history,
			chatVariables: new ChatVariablesCollection([]),
			query: '',
			toolCallRounds: [],
			conversation,
		};

		try {
			const propsBuilder = this.instantiationService.createInstance(SummarizedConversationHistoryPropsBuilder);
			const propsInfo = propsBuilder.getProps({
				priority: 1,
				endpoint,
				location: ChatLocation.Agent,
				promptContext,
				maxToolResultLength: Infinity,
			});

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
		@IEndpointProvider endpointProvider: IEndpointProvider,
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
		@IOTelService override readonly otelService: IOTelService,
	) {
		super(intent, location, endpoint, request, intentOptions, instantiationService, codeMapperService, envService, promptPathRepresentationService, endpointProvider, workspaceService, toolsService, configurationService, editLogService, commandService, telemetryService, notebookService, otelService);
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
		// Add any references from the codebase invocation to the request
		const codebase = await this._getCodebaseReferences(promptContext, token);

		let variables = promptContext.chatVariables;
		let toolReferences: vscode.ChatPromptReference[] = [];
		if (codebase) {
			toolReferences = toNewChatReferences(variables, codebase.references);
			variables = new ChatVariablesCollection([...this.request.references, ...toolReferences]);
		}

		const tools = promptContext.tools?.availableTools;
		const toolSearchEnabled = isAnthropicToolSearchEnabled(this.endpoint, this.configurationService);
		const toolTokens = tools?.length ? await this.endpoint.acquireTokenizer().countToolTokens(tools) : 0;

		const summarizeThresholdOverride = this.configurationService.getConfig<number | undefined>(ConfigKey.Advanced.SummarizeAgentConversationHistoryThreshold);
		if (typeof summarizeThresholdOverride === 'number' && summarizeThresholdOverride < 100 && summarizeThresholdOverride > 0) {
			throw new Error(`Setting github.copilot.${ConfigKey.Advanced.SummarizeAgentConversationHistoryThreshold.id} is too low`);
		}

		const baseBudget = Math.min(
			this.configurationService.getConfig<number | undefined>(ConfigKey.Advanced.SummarizeAgentConversationHistoryThreshold) ?? this.endpoint.modelMaxPromptTokens,
			this.endpoint.modelMaxPromptTokens
		);
		const useTruncation = this.endpoint.apiType === 'responses' && this.configurationService.getConfig(ConfigKey.Advanced.UseResponsesApiTruncation);
		const responsesCompactionContextManagementEnabled = isResponsesCompactionContextManagementEnabled(this.endpoint, this.configurationService, this.expService);
		const summarizationEnabled = this.configurationService.getConfig(ConfigKey.SummarizeAgentConversationHistory) && this.prompt === AgentPrompt && !responsesCompactionContextManagementEnabled;
		const useInlineSummarization = summarizationEnabled && this.configurationService.getExperimentBasedConfig(ConfigKey.Advanced.AgentHistorySummarizationInline, this.expService);

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
		const props: AgentPromptProps = {
			endpoint,
			promptContext: {
				...promptContext,
				tools: promptContext.tools && {
					...promptContext.tools,
					toolReferences: this.stableToolReferences.filter((r) => r.name !== ToolName.Codebase),
				}
			},
			location: this.location,
			enableCacheBreakpoints: summarizationEnabled,
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
		//   Post-render (≥ 80% + Idle): kick off background compaction
		//                                so it is ready for a future turn.
		//
		const backgroundSummarizer = summarizationEnabled ? this._getOrCreateBackgroundSummarizer(promptContext.conversation?.sessionId) : undefined;
		const contextRatio = backgroundSummarizer && baseBudget > 0
			? (this._lastRenderTokenCount + toolTokens) / baseBudget
			: 0;

		// Track whether this iteration already performed compaction-related work
		// (including applying a summary or using a foreground fallback path) so
		// we don't immediately re-trigger background compaction in the post-render check.
		let didSummarizeThisIteration = false;

		// If a previous background pass completed, apply its summary now.
		if (summarizationEnabled && backgroundSummarizer?.state === BackgroundSummarizationState.Completed) {
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
		}

		// Render the prompt without summarization or cache breakpoints, using
		// the original endpoint (not reduced for tools/safety buffer).
		const renderWithoutSummarization = async (reason: string, renderProps: AgentPromptProps = props): Promise<RenderPromptResult> => {
			this.logService.debug(`[Agent] ${reason}, rendering without summarization`);
			const renderer = PromptRenderer.create(this.instantiationService, this.endpoint, this.prompt, {
				...renderProps,
				endpoint: this.endpoint,
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
						this._sendBackgroundCompactionTelemetry(budgetExceededTrigger, 'applied', contextRatio, promptContext);
						didSummarizeThisIteration = true;
						// Re-render with the compacted history
						const renderer = PromptRenderer.create(this.instantiationService, endpoint, this.prompt, { ...props, promptContext });
						result = await renderer.render(progress, token);
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

		// Post-render: kick off background compaction at ≥ 80% if idle.
		if (summarizationEnabled && backgroundSummarizer && !didSummarizeThisIteration) {
			const postRenderRatio = baseBudget > 0
				? (result.tokenCount + toolTokens) / baseBudget
				: 0;

			if (postRenderRatio >= 0.80 && (backgroundSummarizer.state === BackgroundSummarizationState.Idle || backgroundSummarizer.state === BackgroundSummarizationState.Failed)) {
				if (useInlineSummarization) {
					// Compute and cache model capabilities from the current render's
					// messages. These must match the main agent fetch for cache parity.
					const strippedMessages = ToolCallingLoop.stripInternalToolCallIds(result.messages);
					const rawEffort = this.request.modelConfiguration?.reasoningEffort;
					const isSubagent = !!this.request.subAgentInvocationId;
					this._lastModelCapabilities = {
						enableThinking: !isAnthropicFamily(this.endpoint) || ToolCallingLoop.messagesContainThinking(strippedMessages),
						reasoningEffort: typeof rawEffort === 'string' ? rawEffort : undefined,
						enableToolSearch: !isSubagent && isAnthropicToolSearchEnabled(this.endpoint, this.configurationService),
						enableContextEditing: !isSubagent && isAnthropicContextEditingEnabled(this.endpoint, this.configurationService, this.expService),
					};
				}
				this._startBackgroundSummarization(backgroundSummarizer, result.messages, promptContext, props, token, postRenderRatio, useInlineSummarization);
			}
		}

		const lastMessage = result.messages.at(-1);
		if (lastMessage?.role === Raw.ChatRole.User) {
			const currentTurn = promptContext.conversation?.getLatestTurn();
			if (currentTurn && !currentTurn.getMetadata(RenderedUserMessageMetadata)) {
				currentTurn.setMetadata(new RenderedUserMessageMetadata(lastMessage.content));
			}
		}

		addCacheBreakpoints(result.messages);

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
		useInlineSummarization: boolean,
	): void {
		this.logService.debug(`[ConversationHistorySummarizer] context at ${(contextRatio * 100).toFixed(0)}% — starting background compaction (inline=${useInlineSummarization})`);

		const bgStartTime = Date.now();

		// Snapshot rounds so telemetry reflects state at kick-off time, not at
		// completion time (the main loop mutates toolCallRounds). History is
		// stable across a single user turn so a reference is sufficient.
		const rounds = [...(promptContext.toolCallRounds ?? [])];
		const history = promptContext.history;
		let toolCallRoundId: string | undefined;
		if (rounds.length >= 2) {
			// Mark the round before the last, preserving the last round verbatim
			toolCallRoundId = rounds[rounds.length - 2].id;
		} else if (rounds.length === 1) {
			toolCallRoundId = rounds[0].id;
		} else {
			for (let i = history.length - 1; i >= 0 && !toolCallRoundId; i--) {
				const lastRound = history[i].rounds.at(-1);
				if (lastRound) {
					toolCallRoundId = lastRound.id;
				}
			}
		}

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
				if (useInlineSummarization) {
					// Inline mode: fork the exact messages from the main render
					// and append a summary user message. The prompt prefix is
					// byte-identical to the main agent loop for cache hits.
					const strippedMainMessages = ToolCallingLoop.stripInternalToolCallIds(mainRenderMessages);
					const summaryMsgResult = await renderPromptElement(
						this.instantiationService,
						this.endpoint,
						InlineSummarizationUserMessage,
						{ endpoint: this.endpoint },
						undefined,
						bgToken,
					);
					const messages = [
						...strippedMainMessages,
						...summaryMsgResult.messages,
					];

					const response = await this.endpoint.makeChatRequest2({
						debugName: 'summarizeConversationHistory-inline',
						messages,
						finishedCb: undefined,
						location: ChatLocation.Agent,
						conversationId,
						requestOptions: {
							temperature: 0,
							stream: false,
							...toolOpts,
						},
						modelCapabilities,
						telemetryProperties: associatedRequestId ? { associatedRequestId } : undefined,
						enableRetryOnFilter: true,
					}, bgToken);
					if (response.type !== ChatFetchResponseType.Success) {
						throw new Error(`Background inline summarization request failed: ${response.type}`);
					}
					const summaryText = extractInlineSummary(response.value);
					if (!summaryText) {
						throw new Error('Background inline summarization: no <summary> tags found in response');
					}
					if (!toolCallRoundId) {
						throw new Error('Background inline summarization: no round ID to apply summary to');
					}
					this.logService.debug(`[ConversationHistorySummarizer] background inline compaction completed (${summaryText.length} chars, roundId=${toolCallRoundId})`);

					// Send summarizedConversationHistory telemetry for parity
					// with the standard ConversationHistorySummarizer path.
					const numRoundsInHistory = history.reduce((sum, t) => sum + t.rounds.length, 0);
					const numRoundsInCurrentTurn = rounds.length;
					const lastUsedTool = rounds.at(-1)?.toolCalls?.at(-1)?.name
						?? history.at(-1)?.rounds.at(-1)?.toolCalls?.at(-1)?.name ?? 'none';
					/* __GDPR__
						"summarizedConversationHistory" : {
							"owner": "bhavyau",
							"comment": "Tracks background inline summarization outcome",
							"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The success state." },
							"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID." },
							"summarizationMode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The summarization mode." },
							"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether background or foreground." },
							"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Session id." },
							"chatRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat request ID." },
							"lastUsedTool": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The last tool used before summarization." },
							"requestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The request ID from the summarization call." },
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
						summarizationMode: 'inline',
						source: 'background',
						conversationId,
						chatRequestId: associatedRequestId,
						lastUsedTool,
						requestId: response.requestId,
					}, {
						numRounds: numRoundsInHistory + numRoundsInCurrentTurn,
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
						summarizationMode: 'inline',
						numRounds: undefined,
						numRoundsSinceLastSummarization: undefined,
					};
				} else {
					// Standard mode: use triggerSummarize which makes a separate
					// LLM call with a summarization-specific prompt during render.
					const snapshotProps: AgentPromptProps = {
						...props,
						promptContext: {
							...promptContext,
							toolCallRounds: promptContext.toolCallRounds ? [...promptContext.toolCallRounds] : undefined,
							toolCallResults: promptContext.toolCallResults ? { ...promptContext.toolCallResults } : undefined,
						}
					};
					const bgRenderer = PromptRenderer.create(this.instantiationService, this.endpoint, this.prompt, {
						...snapshotProps,
						endpoint: this.endpoint,
						promptContext: snapshotProps.promptContext,
						triggerSummarize: true,
						summarizationSource: 'background',
					});
					const bgProgress: vscode.Progress<vscode.ChatResponseReferencePart | vscode.ChatResponseProgressPart> = { report: () => { } };
					const bgRenderResult = await bgRenderer.render(bgProgress, bgToken);
					const summaryMetadata = bgRenderResult.metadata.get(SummarizedConversationHistoryMetadata);
					if (!summaryMetadata) {
						throw new Error('Background compaction produced no summary metadata');
					}
					this.logService.debug(`[ConversationHistorySummarizer] background compaction completed successfully (roundId=${summaryMetadata.toolCallRoundId})`);
					return {
						summary: summaryMetadata.text,
						toolCallRoundId: summaryMetadata.toolCallRoundId,
						promptTokens: summaryMetadata.usage?.prompt_tokens,
						promptCacheTokens: summaryMetadata.usage?.prompt_tokens_details?.cached_tokens,
						outputTokens: summaryMetadata.usage?.completion_tokens,
						durationMs: Date.now() - bgStartTime,
						model: summaryMetadata.model,
						summarizationMode: summaryMetadata.summarizationMode,
						numRounds: summaryMetadata.numRounds,
						numRoundsSinceLastSummarization: summaryMetadata.numRoundsSinceLastSummarization,
					};
				}
			} catch (err) {
				this.logService.error(err, `[ConversationHistorySummarizer] background compaction failed`);

				// Send failure telemetry for inline background summarization
				if (useInlineSummarization) {
					/* __GDPR__
						"summarizedConversationHistory" : {
							"owner": "bhavyau",
							"comment": "Tracks background inline summarization failure",
							"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The success state." },
							"detailedOutcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Detailed failure reason." },
							"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID." },
							"summarizationMode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The summarization mode." },
							"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether background or foreground." },
							"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Session id." },
							"chatRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat request ID." },
							"duration": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Duration in ms." }
						}
					*/
					this.telemetryService.sendMSFTTelemetryEvent('summarizedConversationHistory', {
						outcome: 'failed',
						detailedOutcome: err instanceof Error ? err.message : String(err),
						model: this.endpoint.model,
						summarizationMode: 'inline',
						source: 'background',
						conversationId,
						chatRequestId: associatedRequestId,
					}, {
						duration: Date.now() - bgStartTime,
					});
				}

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
		return this.intent.getOrCreateBackgroundSummarizer(sessionId, this.endpoint.modelMaxPromptTokens);
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
				"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the background compaction result was applied or produced no usable result." },
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

	override processResponse = undefined;
}
