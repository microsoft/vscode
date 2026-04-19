/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import type { OpenAI } from 'openai';
import { Response } from '../../../platform/networking/common/fetcherService';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { AsyncIterableObject } from '../../../util/vs/base/common/async';
import { binaryIndexOf } from '../../../util/vs/base/common/buffer';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { SSEParser } from '../../../util/vs/base/common/sseParser';
import { isDefined } from '../../../util/vs/base/common/types';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { ILogService } from '../../log/common/logService';
import { FinishedCallback, getRequestId, IResponseDelta, OpenAiResponsesFunctionTool } from '../../networking/common/fetch';
import { IChatEndpoint, ICreateEndpointBodyOptions, IEndpointBody } from '../../networking/common/networking';
import { ChatCompletion, FinishedCompletionReason, modelsWithoutResponsesContextManagement, openAIContextManagementCompactionType, OpenAIContextManagementResponse, rawMessageToCAPI, TokenLogProb } from '../../networking/common/openai';
import { sendEngineMessagesTelemetry, sendResponsesApiCompactionTelemetry } from '../../networking/node/chatStream';
import { IChatWebSocketManager } from '../../networking/node/chatWebSocketManager';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { TelemetryData } from '../../telemetry/common/telemetryData';
import { getVerbosityForModelSync } from '../common/chatModelCapabilities';
import { rawPartAsCompactionData } from '../common/compactionDataContainer';
import { rawPartAsPhaseData } from '../common/phaseDataContainer';
import { getIndexOfStatefulMarker, getStatefulMarkerAndIndex } from '../common/statefulMarkerContainer';
import { rawPartAsThinkingData } from '../common/thinkingDataContainer';

export function getResponsesApiCompactionThreshold(configService: IConfigurationService, expService: IExperimentationService, endpoint: IChatEndpoint): number | undefined {
	const contextManagementEnabled = configService.getExperimentBasedConfig(ConfigKey.ResponsesApiContextManagementEnabled, expService) && !modelsWithoutResponsesContextManagement.has(endpoint.family);
	if (!contextManagementEnabled) {
		return undefined;
	}

	return endpoint.modelMaxPromptTokens > 0
		? Math.floor(endpoint.modelMaxPromptTokens * 0.9)
		: 50000;
}

export function createResponsesRequestBody(accessor: ServicesAccessor, options: ICreateEndpointBodyOptions, model: string, endpoint: IChatEndpoint): IEndpointBody {
	const configService = accessor.get(IConfigurationService);
	const expService = accessor.get(IExperimentationService);
	const verbosity = getVerbosityForModelSync(endpoint);
	const compactThreshold = getResponsesApiCompactionThreshold(configService, expService, endpoint);
	// compaction supported for all the models but works well for codex models and any future models after 5.3

	const webSocketStatefulMarker = resolveWebSocketStatefulMarker(accessor, options);
	// When WebSocket is in use, always defer to the WebSocket marker (which may be
	// undefined if the connection is new or the summary state changed). Never fall
	// back to the HTTP marker lookup in that case.
	const ignoreStatefulMarker = !!options.ignoreStatefulMarker || !!options.useWebSocket;

	const body: IEndpointBody = {
		model,
		...rawMessagesToResponseAPI(model, options.messages, ignoreStatefulMarker, webSocketStatefulMarker),
		stream: true,
		tools: options.requestOptions?.tools?.map((tool): OpenAI.Responses.FunctionTool & OpenAiResponsesFunctionTool => ({
			...tool.function,
			type: 'function',
			strict: false,
			parameters: (tool.function.parameters || {}) as Record<string, unknown>,
		})),
		// Only a subset of completion post options are supported, and some
		// are renamed. Handle them manually:
		max_output_tokens: options.postOptions.max_tokens,
		tool_choice: typeof options.postOptions.tool_choice === 'object'
			? { type: 'function', name: options.postOptions.tool_choice.function.name }
			: options.postOptions.tool_choice,
		top_logprobs: options.postOptions.logprobs ? 3 : undefined,
		store: false,
		text: verbosity ? { verbosity } : undefined,
	};

	if (compactThreshold !== undefined) {
		body.context_management = [{
			'type': openAIContextManagementCompactionType,
			// Trigger compaction at 90% of the model max prompt context to keep headroom for active turns.
			'compact_threshold': compactThreshold
		}];
	}

	body.truncation = configService.getConfig(ConfigKey.Advanced.UseResponsesApiTruncation) ?
		'auto' :
		'disabled';
	const summaryConfig = configService.getExperimentBasedConfig(ConfigKey.ResponsesApiReasoningSummary, expService);
	const shouldDisableReasoningSummary = endpoint.family === 'gpt-5.3-codex-spark-preview';
	const effortFromSetting = configService.getConfig(ConfigKey.Advanced.ReasoningEffortOverride);
	const effort = endpoint.supportsReasoningEffort?.length
		? (effortFromSetting || options.modelCapabilities?.reasoningEffort || 'medium')
		: undefined;
	const summary = summaryConfig === 'off' || shouldDisableReasoningSummary ? undefined : summaryConfig;
	if (effort || summary) {
		body.reasoning = {
			...(effort ? { effort } : {}),
			...(summary ? { summary } : {})
		};
	}

	body.include = ['reasoning.encrypted_content'];

	const promptCacheKeyEnabled = configService.getExperimentBasedConfig(ConfigKey.ResponsesApiPromptCacheKeyEnabled, expService);
	if (promptCacheKeyEnabled && options.conversationId) {
		body.prompt_cache_key = `${options.conversationId}:${endpoint.family}`;
	}

	return body;
}

export function getResponsesApiCompactionThresholdFromBody(body: Pick<IEndpointBody, 'context_management'>): number | undefined {
	const contextManagement = body.context_management;
	if (!Array.isArray(contextManagement)) {
		return undefined;
	}

	for (const item of contextManagement) {
		if (item.type === openAIContextManagementCompactionType && typeof item.compact_threshold === 'number') {
			return item.compact_threshold;
		}
	}

	return undefined;
}

interface ResponseInputAssistantTextContentPart {
	type: 'output_text';
	text: string;
}

interface ResponseInputAssistantMessageWithPhase {
	type: 'message';
	role: 'assistant';
	content: ResponseInputAssistantTextContentPart[];
	phase?: string;
}

interface ResponseOutputItemWithPhase {
	phase?: string;
}

interface LatestCompactionOutput {
	readonly item: OpenAIContextManagementResponse;
	readonly outputIndex: number;
}

type CompactionResponseOutputItem = OpenAI.Responses.ResponseOutputItem & OpenAIContextManagementResponse;

interface CompactionItemInChunk {
	readonly item: OpenAIContextManagementResponse;
	readonly outputIndex: number | undefined;
}

interface ResponseStreamEventWithOutputItem {
	readonly item: unknown;
	readonly output_index: number;
}

interface ResponseStreamEventWithResponseOutput {
	readonly response: {
		readonly output: OpenAI.Responses.ResponseOutputItem[];
	};
}

function resolveWebSocketStatefulMarker(accessor: ServicesAccessor, options: ICreateEndpointBodyOptions): string | undefined {
	if (options.ignoreStatefulMarker || !options.useWebSocket || !options.conversationId) {
		return undefined;
	}
	const wsManager = accessor.get(IChatWebSocketManager);
	// If client-side summarization state changed since the stateful marker
	// was stored (new summary, or rollback removing a summary), the server's
	// state no longer matches. Skip the marker so the full history is sent.
	const connSummarizedAt = wsManager.getSummarizedAtRoundId(options.conversationId);
	if (options.summarizedAtRoundId !== connSummarizedAt) {
		return undefined;
	}
	return wsManager.getStatefulMarker(options.conversationId);
}

function rawMessagesToResponseAPI(modelId: string, messages: readonly Raw.ChatMessage[], ignoreStatefulMarker: boolean, webSocketStatefulMarker: string | undefined): { input: OpenAI.Responses.ResponseInputItem[]; previous_response_id?: string } {
	const latestCompactionMessageIndex = getLatestCompactionMessageIndex(messages);
	const latestCompactionMessage = latestCompactionMessageIndex !== undefined ? createCompactionRoundTripMessage(messages[latestCompactionMessageIndex]) : undefined;

	let previousResponseId: string | undefined;
	let markerIndex: number | undefined;

	if (webSocketStatefulMarker) {
		// WebSocket path: use the connection's current stateful marker if present in messages
		markerIndex = getIndexOfStatefulMarker(webSocketStatefulMarker, messages);
		if (markerIndex !== undefined) {
			previousResponseId = webSocketStatefulMarker;
		}
	} else if (!ignoreStatefulMarker) {
		// HTTP path: look up the latest marker for this model from messages
		const statefulMarkerAndIndex = getStatefulMarkerAndIndex(modelId, messages);
		if (statefulMarkerAndIndex) {
			previousResponseId = statefulMarkerAndIndex.statefulMarker;
			markerIndex = statefulMarkerAndIndex.index;
		}
	}

	if (markerIndex !== undefined) {
		// Requests that resume from previous_response_id send only post-marker history,
		// but they still need the latest compaction item even when that item predates
		// the marker. This keeps both websocket and non-websocket traffic aligned.
		messages = messages.slice(markerIndex + 1);
		if (latestCompactionMessageIndex !== undefined) {
			if (latestCompactionMessageIndex > markerIndex) {
				messages = messages.slice(latestCompactionMessageIndex - (markerIndex + 1));
			} else if (latestCompactionMessage) {
				messages = [latestCompactionMessage, ...messages];
			}
		}
	} else if (latestCompactionMessageIndex !== undefined) {
		messages = messages.slice(latestCompactionMessageIndex);
	}

	const input: OpenAI.Responses.ResponseInputItem[] = [];
	for (const message of messages) {
		switch (message.role) {
			case Raw.ChatRole.Assistant:
				if (message.content.length) {
					input.push(...extractCompactionData(message.content));
					input.push(...extractThinkingData(message.content));
					const asstContent = message.content.map(rawContentToResponsesAssistantContent).filter(isDefined);
					if (asstContent.length) {
						const assistantMessage: ResponseInputAssistantMessageWithPhase = {
							role: 'assistant',
							content: asstContent,
							type: 'message',
							phase: extractPhaseData(message.content),
						};
						// The Responses API expects previous assistant message content as output_text/refusal,
						// but the SDK's ResponseOutputMessage type requires response-only id/status fields.
						input.push(assistantMessage as OpenAI.Responses.ResponseInputItem);
					}
				}
				if (message.toolCalls) {
					for (const toolCall of message.toolCalls) {
						input.push({ type: 'function_call', name: toolCall.function.name, arguments: toolCall.function.arguments, call_id: toolCall.id });
					}
				}
				break;
			case Raw.ChatRole.Tool:
				if (message.toolCallId) {
					const asText = message.content
						.filter(c => c.type === Raw.ChatCompletionContentPartKind.Text)
						.map(c => c.text)
						.join('');
					const asImages = message.content
						.filter(c => c.type === Raw.ChatCompletionContentPartKind.Image)
						.map((c): OpenAI.Responses.ResponseInputImage => ({
							type: 'input_image',
							detail: c.imageUrl.detail || 'auto',
							image_url: c.imageUrl.url,
						}));

					// todod@connor4312: hack while responses API only supports text output from tools
					input.push({ type: 'function_call_output', call_id: message.toolCallId, output: asText });
					if (asImages.length) {
						input.push({ role: 'user', content: [{ type: 'input_text', text: 'Image associated with the above tool call:' }, ...asImages] });
					}
				}
				break;
			case Raw.ChatRole.User:
				input.push({ role: 'user', content: message.content.map(rawContentToResponsesContent).filter(isDefined) });
				break;
			case Raw.ChatRole.System:
				input.push({ role: 'system', content: message.content.map(rawContentToResponsesContent).filter(isDefined) });
				break;
		}
	}

	return { input, previous_response_id: previousResponseId };
}

function createCompactionRoundTripMessage(message: Raw.ChatMessage): Raw.ChatMessage | undefined {
	if (message.role !== Raw.ChatRole.Assistant) {
		return undefined;
	}

	const content = message.content.filter(part => part.type === Raw.ChatCompletionContentPartKind.Opaque && rawPartAsCompactionData(part));
	if (!content.length) {
		return undefined;
	}

	return {
		role: Raw.ChatRole.Assistant,
		content,
	};
}

function getLatestCompactionMessageIndex(messages: readonly Raw.ChatMessage[]): number | undefined {
	for (let idx = messages.length - 1; idx >= 0; idx--) {
		const message = messages[idx];
		for (const part of message.content) {
			if (part.type === Raw.ChatCompletionContentPartKind.Opaque && rawPartAsCompactionData(part)) {
				return idx;
			}
		}
	}

	return undefined;
}

function rawContentToResponsesContent(part: Raw.ChatCompletionContentPart): OpenAI.Responses.ResponseInputContent | undefined {
	switch (part.type) {
		case Raw.ChatCompletionContentPartKind.Text:
			return { type: 'input_text', text: part.text };
		case Raw.ChatCompletionContentPartKind.Image:
			return { type: 'input_image', detail: part.imageUrl.detail || 'auto', image_url: part.imageUrl.url };
		case Raw.ChatCompletionContentPartKind.Opaque: {
			const maybeCast = part.value as OpenAI.Responses.ResponseInputContent;
			if (maybeCast.type === 'input_text' || maybeCast.type === 'input_image' || maybeCast.type === 'input_file') {
				return maybeCast;
			}
		}
	}
}

function rawContentToResponsesAssistantContent(part: Raw.ChatCompletionContentPart): Pick<OpenAI.Responses.ResponseOutputText, 'type' | 'text'> | undefined {
	switch (part.type) {
		case Raw.ChatCompletionContentPartKind.Text:
			if (part.text.trim()) {
				return { type: 'output_text', text: part.text };
			}
	}
}

function extractThinkingData(content: Raw.ChatCompletionContentPart[]): OpenAI.Responses.ResponseReasoningItem[] {
	return coalesce(content.map(part => {
		if (part.type === Raw.ChatCompletionContentPartKind.Opaque) {
			const thinkingData = rawPartAsThinkingData(part);
			if (thinkingData) {
				return {
					type: 'reasoning',
					id: thinkingData.id,
					summary: [],
					encrypted_content: thinkingData.encrypted,
				} satisfies OpenAI.Responses.ResponseReasoningItem;
			}
		}
	}));
}

function extractPhaseData(content: Raw.ChatCompletionContentPart[]): string | undefined {
	for (const part of content) {
		if (part.type === Raw.ChatCompletionContentPartKind.Opaque) {
			const phase = rawPartAsPhaseData(part);
			if (phase) {
				return phase;
			}
		}
	}
	return undefined;
}

/**
 * Extracts compaction data from opaque content parts and converts them to
 * Responses API input items for round-tripping.
 */
function extractCompactionData(content: Raw.ChatCompletionContentPart[]): OpenAI.Responses.ResponseInputItem[] {
	return coalesce(content.map(part => {
		if (part.type === Raw.ChatCompletionContentPartKind.Opaque) {
			const compaction = rawPartAsCompactionData(part);
			if (compaction) {
				return {
					type: openAIContextManagementCompactionType,
					id: compaction.id,
					encrypted_content: compaction.encrypted_content,
				} as unknown as OpenAI.Responses.ResponseInputItem;
			}
		}
	}));
}

/**
 * This is an approximate responses input -> raw messages helper, should be used for logging only
 */
export function responseApiInputToRawMessagesForLogging(body: OpenAI.Responses.ResponseCreateParams): Raw.ChatMessage[] {
	const messages: Raw.ChatMessage[] = [];
	const pendingFunctionCalls: Raw.ChatMessageToolCall[] = [];

	const flushPendingFunctionCalls = () => {
		if (pendingFunctionCalls.length > 0) {
			messages.push({
				role: Raw.ChatRole.Assistant,
				content: [],
				toolCalls: pendingFunctionCalls.splice(0)
			});
		}
	};

	// Add system instructions if provided
	if (body.instructions) {
		messages.push({
			role: Raw.ChatRole.System,
			content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: body.instructions }]
		});
	}

	// Convert input to array format if it's a string
	const inputItems = typeof body.input === 'string' ? [{ role: 'user' as const, content: body.input, type: 'message' as const }] : (body.input ?? []);

	for (const item of inputItems) {
		// Handle message items with roles
		if ('role' in item) {
			switch (item.role) {
				case 'user':
					flushPendingFunctionCalls();
					messages.push({
						role: Raw.ChatRole.User,
						content: ensureContentArray(item.content).map(responseContentToRawContent).filter(isDefined)
					});
					break;
				case 'system':
				case 'developer':
					flushPendingFunctionCalls();
					messages.push({
						role: Raw.ChatRole.System,
						content: ensureContentArray(item.content).map(responseContentToRawContent).filter(isDefined)
					});
					break;
				case 'assistant':
					flushPendingFunctionCalls();
					if (isResponseOutputMessage(item)) {
						messages.push({
							role: Raw.ChatRole.Assistant,
							content: item.content.map(responseOutputToRawContent).filter(isDefined)
						});
					} else if (isResponseInputItemMessage(item)) {
						messages.push({
							role: Raw.ChatRole.Assistant,
							content: ensureContentArray(item.content).map(responseContentToRawContent).filter(isDefined)
						});
					}
					break;
			}
		} else if ('type' in item) {
			// Handle other item types without roles
			switch (item.type) {
				case 'function_call':
					// Collect function calls to be grouped with the next assistant message
					pendingFunctionCalls.push({
						id: item.call_id,
						type: 'function',
						function: {
							name: item.name,
							arguments: item.arguments
						}
					});
					break;
				case 'function_call_output': {
					flushPendingFunctionCalls();
					const content = responseFunctionOutputToRawContents(item.output);
					messages.push({
						role: Raw.ChatRole.Tool,
						content,
						toolCallId: item.call_id
					});
					break;
				}
				case 'reasoning':
					// We can't perfectly reconstruct the original thinking data
					// but we can add a placeholder for logging
					flushPendingFunctionCalls();
					messages.push({
						role: Raw.ChatRole.Assistant,
						content: [{
							type: Raw.ChatCompletionContentPartKind.Text,
							text: `Reasoning summary: ${item.summary.map(s => s.text).join('\n\n')}`
						}]
					});
					break;
			}
		}
	}

	// Flush any remaining function calls at the end
	if (pendingFunctionCalls.length > 0) {
		messages.push({
			role: Raw.ChatRole.Assistant,
			content: [],
			toolCalls: pendingFunctionCalls.splice(0)
		});
	}

	return messages;
}

function isResponseOutputMessage(item: OpenAI.Responses.ResponseInputItem): item is OpenAI.Responses.ResponseOutputMessage {
	return 'role' in item && item.role === 'assistant' && 'type' in item && item.type === 'message' && 'content' in item && Array.isArray(item.content);
}

function isResponseInputItemMessage(item: OpenAI.Responses.ResponseInputItem): item is OpenAI.Responses.ResponseInputItem.Message {
	return 'role' in item && item.role === 'assistant' && (!('type' in item) || item.type !== 'message');
}

function ensureContentArray(content: string | OpenAI.Responses.ResponseInputMessageContentList): OpenAI.Responses.ResponseInputMessageContentList {
	if (typeof content === 'string') {
		return [{ type: 'input_text', text: content }];
	}
	return content;
}

function responseContentToRawContent(part: OpenAI.Responses.ResponseInputContent | OpenAI.Responses.ResponseFunctionCallOutputItem): Raw.ChatCompletionContentPart | undefined {
	switch (part.type) {
		case 'input_text':
			return { type: Raw.ChatCompletionContentPartKind.Text, text: part.text };
		case 'input_image':
			return {
				type: Raw.ChatCompletionContentPartKind.Image,
				imageUrl: {
					url: part.image_url || '',
					detail: part.detail === 'auto' ?
						undefined :
						(part.detail ?? undefined)
				}
			};
		case 'input_file':
			// This is a rough approximation for logging
			return {
				type: Raw.ChatCompletionContentPartKind.Opaque,
				value: `[File Input - Filename: ${part.filename || 'unknown'}]`
			};
	}
}

function responseOutputToRawContent(part: OpenAI.Responses.ResponseOutputText | OpenAI.Responses.ResponseOutputRefusal): Raw.ChatCompletionContentPart | undefined {
	switch (part.type) {
		case 'output_text':
			return { type: Raw.ChatCompletionContentPartKind.Text, text: part.text };
		case 'refusal':
			return { type: Raw.ChatCompletionContentPartKind.Text, text: `[Refusal: ${part.refusal}]` };
	}
}

function responseFunctionOutputToRawContents(output: string | OpenAI.Responses.ResponseFunctionCallOutputItemList): Raw.ChatCompletionContentPart[] {
	if (typeof output === 'string') {
		return [{ type: Raw.ChatCompletionContentPartKind.Text, text: output }];
	}
	return coalesce(output.map(responseContentToRawContent));
}

function isCompactionItem(value: unknown): value is OpenAIContextManagementResponse {
	return typeof value === 'object' && value !== null && 'type' in value && String(value.type) === openAIContextManagementCompactionType;
}

function hasOutputItem(chunk: OpenAI.Responses.ResponseStreamEvent): chunk is OpenAI.Responses.ResponseStreamEvent & ResponseStreamEventWithOutputItem {
	return 'item' in chunk && 'output_index' in chunk && typeof chunk.output_index === 'number';
}

function hasResponseOutput(chunk: OpenAI.Responses.ResponseStreamEvent): chunk is OpenAI.Responses.ResponseStreamEvent & ResponseStreamEventWithResponseOutput {
	return 'response' in chunk && Array.isArray(chunk.response.output);
}

function getOutputItemIndex(chunk: ResponseStreamEventWithOutputItem): number {
	return chunk.output_index;
}

function isCompactionOutputItem(item: OpenAI.Responses.ResponseOutputItem): item is CompactionResponseOutputItem {
	return isCompactionItem(item);
}

function getLatestCompactionOutput(output: OpenAI.Responses.ResponseOutputItem[], preferredOutputIndex: number | undefined): LatestCompactionOutput | undefined {
	let latestCompactionOutput: LatestCompactionOutput | undefined;
	for (let idx = output.length - 1; idx >= 0; idx--) {
		const item = output[idx];
		if (isCompactionOutputItem(item)) {
			latestCompactionOutput = { item, outputIndex: idx };
			break;
		}
	}

	if (preferredOutputIndex !== undefined) {
		const preferredItem = output[preferredOutputIndex];
		if (preferredItem && isCompactionOutputItem(preferredItem) && (!latestCompactionOutput || preferredOutputIndex >= latestCompactionOutput.outputIndex)) {
			return { item: preferredItem, outputIndex: preferredOutputIndex };
		}
	}

	return latestCompactionOutput;
}

function keepLatestCompactionOutput(output: OpenAI.Responses.ResponseOutputItem[], preferredOutputIndex: number | undefined): OpenAI.Responses.ResponseOutputItem[] {
	const latestCompactionOutput = getLatestCompactionOutput(output, preferredOutputIndex);
	if (!latestCompactionOutput) {
		return output;
	}

	return output.filter((item, idx) => !isCompactionOutputItem(item) || idx === latestCompactionOutput.outputIndex);
}

export async function processResponseFromChatEndpoint(instantiationService: IInstantiationService, telemetryService: ITelemetryService, logService: ILogService, response: Response, expectedNumChoices: number, finishCallback: FinishedCallback, telemetryData: TelemetryData, compactionThreshold?: number): Promise<AsyncIterableObject<ChatCompletion>> {
	return new AsyncIterableObject<ChatCompletion>(async feed => {
		const requestId = response.headers.get('X-Request-ID') ?? generateUuid();
		const ghRequestId = response.headers.get('x-github-request-id') ?? '';
		const { serverExperiments } = getRequestId(response.headers);
		const processor = instantiationService.createInstance(OpenAIResponsesProcessor, telemetryData, telemetryService, requestId, ghRequestId, serverExperiments, compactionThreshold);
		const parser = new SSEParser((ev) => {
			try {
				logService.trace(`SSE: ${ev.data}`);
				const completion = processor.push({ type: ev.type, ...JSON.parse(ev.data) }, finishCallback);
				if (completion) {
					sendCompletionOutputTelemetry(telemetryService, logService, completion, telemetryData);
					feed.emitOne(completion);
				}
			} catch (e) {
				feed.reject(e);
			}
		});

		for await (const chunk of response.body) {
			parser.feed(chunk);
		}
	}, async () => {
		await response.body.destroy();
	});
}

export function sendCompletionOutputTelemetry(telemetryService: ITelemetryService, logService: ILogService, completion: ChatCompletion, telemetryData: TelemetryData): void {
	const telemetryMessage = rawMessageToCAPI(completion.message);
	let telemetryDataWithUsage = telemetryData;
	if (completion.usage) {
		telemetryDataWithUsage = telemetryData.extendedBy({}, {
			promptTokens: completion.usage.prompt_tokens,
			completionTokens: completion.usage.completion_tokens,
			totalTokens: completion.usage.total_tokens,
		});
	}
	sendEngineMessagesTelemetry(telemetryService, [telemetryMessage], telemetryDataWithUsage, true, logService);
}

interface CapiResponsesTextDeltaEvent extends Omit<OpenAI.Responses.ResponseTextDeltaEvent, 'logprobs'> {
	logprobs: Array<OpenAI.Responses.ResponseTextDeltaEvent.Logprob> | undefined;
}

export class OpenAIResponsesProcessor {
	private textAccumulator: string = '';
	private hasReceivedReasoningSummary = false;
	private sawCompactionMessage = false;
	private latestCompactionOutputIndex: number | undefined;
	private latestCompactionItem: OpenAIContextManagementResponse | undefined;
	/** Maps output_index to { name, callId, arguments } for streaming tool call updates */
	private readonly toolCallInfo = new Map<number, { name: string; callId: string; arguments: string }>();

	constructor(
		private readonly telemetryData: TelemetryData,
		private readonly telemetryService: ITelemetryService,
		private readonly requestId: string,
		private readonly ghRequestId: string,
		private readonly serverExperiments: string,
		private readonly compactionThreshold: number | undefined,
		@ILogService private readonly logService: ILogService,
	) { }

	private getCompactionItemsInChunk(chunk: OpenAI.Responses.ResponseStreamEvent): CompactionItemInChunk[] {
		const compactionItems: CompactionItemInChunk[] = [];

		if (hasOutputItem(chunk) && isCompactionItem(chunk.item)) {
			const outputIndex = getOutputItemIndex(chunk);
			compactionItems.push({ item: chunk.item, outputIndex });
		}

		if (hasResponseOutput(chunk)) {
			for (let idx = 0; idx < chunk.response.output.length; idx++) {
				const item = chunk.response.output[idx];
				if (isCompactionItem(item)) {
					compactionItems.push({ item, outputIndex: idx });
				}
			}
		}

		return compactionItems;
	}

	private captureCompactionItem(item: OpenAIContextManagementResponse, outputIndex: number | undefined, onProgress: (delta: IResponseDelta) => undefined): void {
		if (outputIndex !== undefined && this.latestCompactionOutputIndex !== undefined && outputIndex < this.latestCompactionOutputIndex) {
			return;
		}

		const previousCompactionItem = this.latestCompactionItem;
		this.sawCompactionMessage = true;
		this.latestCompactionOutputIndex = outputIndex ?? this.latestCompactionOutputIndex;
		this.latestCompactionItem = item;

		if (previousCompactionItem?.id === item.id && previousCompactionItem.encrypted_content === item.encrypted_content) {
			return;
		}

		onProgress({
			text: '',
			contextManagement: {
				type: openAIContextManagementCompactionType,
				id: item.id,
				encrypted_content: item.encrypted_content,
			}
		});
	}

	public push(chunk: OpenAI.Responses.ResponseStreamEvent, _onProgress: FinishedCallback): ChatCompletion | undefined {
		const onProgress = (delta: IResponseDelta): undefined => {
			this.textAccumulator += delta.text;
			_onProgress(this.textAccumulator, 0, delta);
		};
		const compactionItems = this.getCompactionItemsInChunk(chunk);
		if (chunk.type !== 'response.completed') {
			for (const { item, outputIndex } of compactionItems) {
				this.captureCompactionItem(item, outputIndex, onProgress);
			}
		}

		switch (chunk.type) {
			case 'error':
				return onProgress({ text: '', copilotErrors: [{ agent: 'openai', code: chunk.code || 'unknown', message: chunk.message, type: 'error', identifier: chunk.param || undefined }] });
			case 'response.output_text.delta': {
				const capiChunk: CapiResponsesTextDeltaEvent = chunk;
				const haystack = new Lazy(() => new TextEncoder().encode(capiChunk.delta));
				return onProgress({
					text: capiChunk.delta,
					logprobs: capiChunk.logprobs && {
						content: capiChunk.logprobs.map(lp => ({
							...mapLogProp(haystack, lp),
							top_logprobs: lp.top_logprobs?.map(l => mapLogProp(haystack, l)) || []
						}))
					},
				});
			}
			case 'response.output_item.added':
				if (chunk.item.type === 'function_call') {
					this.toolCallInfo.set(chunk.output_index, { name: chunk.item.name, callId: chunk.item.call_id, arguments: '' });
					onProgress({
						text: '',
						beginToolCalls: [{ name: chunk.item.name, id: chunk.item.call_id }]
					});
				}
				return;
			case 'response.function_call_arguments.delta': {
				const info = this.toolCallInfo.get(chunk.output_index);
				if (info) {
					info.arguments += chunk.delta;
					onProgress({
						text: '',
						copilotToolCallStreamUpdates: [{
							id: info.callId,
							name: info.name,
							arguments: info.arguments,
						}],
					});
				}
				return;
			}
			case 'response.output_item.done':
				if (chunk.item.type === 'function_call') {
					this.toolCallInfo.delete(chunk.output_index);
					onProgress({
						text: '',
						copilotToolCalls: [{
							id: chunk.item.call_id,
							name: chunk.item.name,
							arguments: chunk.item.arguments,
						}],
						phase: (chunk.item as ResponseOutputItemWithPhase).phase
					});
				} else if (chunk.item.type === 'reasoning') {
					onProgress({
						text: '',
						thinking: chunk.item.encrypted_content ? {
							id: chunk.item.id,
							// CAPI models don't stream the reasoning summary for some reason, byok do, so don't duplicate it
							text: this.hasReceivedReasoningSummary ?
								undefined :
								chunk.item.summary.map(s => s.text),
							encrypted: chunk.item.encrypted_content,
						} : undefined
					});
				} else if (chunk.item.type === 'message') {
					onProgress({
						text: '',
						phase: (chunk.item as ResponseOutputItemWithPhase).phase
					});
				}
				return;
			case 'response.reasoning_summary_text.delta':
				this.hasReceivedReasoningSummary = true;
				return onProgress({
					text: '',
					thinking: {
						id: chunk.item_id,
						text: chunk.delta,
					}
				});
			case 'response.reasoning_summary_part.done':
				this.hasReceivedReasoningSummary = true;
				return onProgress({
					text: '',
					thinking: {
						id: chunk.item_id
					}
				});
			case 'response.completed': {
				const normalizedOutput = keepLatestCompactionOutput(chunk.response.output, this.latestCompactionOutputIndex);
				const latestCompactionOutput = getLatestCompactionOutput(normalizedOutput, this.latestCompactionOutputIndex);
				const latestCompactionItem = latestCompactionOutput?.item;
				const previousCompactionItem = this.latestCompactionItem;
				if (latestCompactionItem) {
					this.sawCompactionMessage = true;
					this.latestCompactionOutputIndex = latestCompactionOutput.outputIndex;
				}

				const shouldEmitResolvedCompaction = latestCompactionItem && (
					!previousCompactionItem ||
					previousCompactionItem.id !== latestCompactionItem.id ||
					previousCompactionItem.encrypted_content !== latestCompactionItem.encrypted_content
				);
				if (latestCompactionItem) {
					this.latestCompactionItem = latestCompactionItem;
				}
				if (this.compactionThreshold !== undefined && this.sawCompactionMessage) {
					const promptTokens = chunk.response.usage?.input_tokens ?? 0;
					const totalTokens = chunk.response.usage?.total_tokens ?? 0;
					sendResponsesApiCompactionTelemetry(this.telemetryService, {
						outcome: 'compaction_returned',
						headerRequestId: this.requestId,
						gitHubRequestId: this.ghRequestId,
						model: chunk.response.model,
					}, {
						compactThreshold: this.compactionThreshold,
						promptTokens,
						totalTokens,
					});
					this.logService.debug(`[responsesAPI_compaction] Compaction enabled. headerRequestId=${this.requestId}`);
				} else if (this.compactionThreshold !== undefined && (chunk.response.usage?.input_tokens ?? 0) >= this.compactionThreshold) {
					const promptTokens = chunk.response.usage?.input_tokens ?? 0;
					const totalTokens = chunk.response.usage?.total_tokens ?? 0;
					sendResponsesApiCompactionTelemetry(this.telemetryService, {
						outcome: 'threshold_met_no_compaction',
						headerRequestId: this.requestId,
						gitHubRequestId: this.ghRequestId,
						model: chunk.response.model,
					}, {
						compactThreshold: this.compactionThreshold,
						promptTokens,
						totalTokens,
					});
					this.logService.debug(`[responsesAPI_compaction] Compaction enabled but context not compacted after threshold was met. headerRequestId=${this.requestId}, gitHubRequestId=${this.ghRequestId}, promptTokens=${promptTokens}, totalTokens=${totalTokens}`);
				}
				onProgress({
					text: '',
					statefulMarker: chunk.response.id,
					contextManagement: shouldEmitResolvedCompaction ? latestCompactionItem : undefined,
				});
				return {
					blockFinished: true,
					choiceIndex: 0,
					model: chunk.response.model,
					tokens: [],
					telemetryData: this.telemetryData,
					requestId: { headerRequestId: this.requestId, gitHubRequestId: this.ghRequestId, completionId: chunk.response.id, created: chunk.response.created_at, deploymentId: '', serverExperiments: this.serverExperiments },
					usage: {
						prompt_tokens: chunk.response.usage?.input_tokens ?? 0,
						completion_tokens: chunk.response.usage?.output_tokens ?? 0,
						total_tokens: chunk.response.usage?.total_tokens ?? 0,
						prompt_tokens_details: {
							cached_tokens: chunk.response.usage?.input_tokens_details.cached_tokens ?? 0,
						},
						completion_tokens_details: {
							reasoning_tokens: chunk.response.usage?.output_tokens_details.reasoning_tokens ?? 0,
							accepted_prediction_tokens: 0,
							rejected_prediction_tokens: 0,
						},
					},
					finishReason: FinishedCompletionReason.Stop,
					message: {
						role: Raw.ChatRole.Assistant,
						content: normalizedOutput.map((item): Raw.ChatCompletionContentPart | undefined => {
							if (item.type === 'message') {
								return { type: Raw.ChatCompletionContentPartKind.Text, text: item.content.map(c => c.type === 'output_text' ? c.text : c.refusal).join('') };
							} else if (item.type === 'image_generation_call' && item.result) {
								return { type: Raw.ChatCompletionContentPartKind.Image, imageUrl: { url: item.result } };
							}
						}).filter(isDefined),
					}
				};
			}
		}
	}
}

function mapLogProp(text: Lazy<Uint8Array>, lp: OpenAI.Responses.ResponseTextDeltaEvent.Logprob.TopLogprob): TokenLogProb {
	let bytes: number[] = [];
	if (lp.token) {
		const needle = new TextEncoder().encode(lp.token);
		const haystack = text.value;
		const idx = binaryIndexOf(haystack, needle);
		if (idx !== -1) {
			bytes = [idx, idx + needle.length];
		}
	}

	return {
		token: lp.token!,
		bytes,
		logprob: lp.logprob!,
	};
}
