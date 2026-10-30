/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from '../../../../base/common/buffer.js';
import {
	ByokLmImageMimeType,
	IByokLmChatRequest,
	IByokLmChatResult,
	IByokLmContentPart,
	IByokLmInputItem,
	IByokLmOutputItem,
	IByokLmStreamDelta,
	IByokLmStreamDeltaBody,
	IByokLmTool,
} from '../../common/agentHostByokLm.js';

interface IResponsesContentPart {
	readonly type?: string;
	readonly text?: string;
	readonly image_url?: string;
	readonly detail?: string;
	readonly filename?: string;
	readonly file_data?: string;
	readonly file_id?: string;
}

interface IResponsesSummaryPart {
	readonly type?: string;
	readonly text?: string;
}

function isSupportedImageMimeType(mimeType: string): mimeType is ByokLmImageMimeType {
	switch (mimeType) {
		case 'image/png':
		case 'image/jpeg':
		case 'image/gif':
		case 'image/webp':
		case 'image/bmp':
			return true;
		default:
			return false;
	}
}

interface IResponsesInputItem {
	readonly type?: string;
	readonly role?: string;
	readonly content?: string | IResponsesContentPart[];
	readonly id?: string;
	readonly summary?: IResponsesSummaryPart[];
	readonly encrypted_content?: string | null;
	readonly call_id?: string;
	readonly name?: string;
	readonly arguments?: string;
	readonly input?: string;
	readonly output?: string | IResponsesContentPart[];
}

interface IResponsesTool {
	readonly type?: string;
	readonly name?: string;
	readonly description?: string;
	readonly parameters?: object;
}

export interface IResponsesRequest {
	readonly model?: string;
	readonly instructions?: string;
	readonly input?: string | IResponsesInputItem[];
	readonly tools?: IResponsesTool[];
	readonly previous_response_id?: string;
	readonly reasoning?: {
		readonly effort?: string;
	};
	readonly temperature?: number;
	readonly top_p?: number;
	readonly max_output_tokens?: number;
	readonly [key: string]: unknown;
}

export class ResponsesTranslationError extends Error { }

function toBridgeRole(role: string | undefined): 'system' | 'developer' | 'user' | 'assistant' {
	switch (role) {
		case 'system':
		case 'developer':
		case 'assistant':
		case 'user':
			return role;
		default:
			throw new ResponsesTranslationError(`Unsupported message role '${role ?? ''}'`);
	}
}

/**
 * The Copilot runtime sends document attachments (e.g. a referenced PDF) as
 * Responses `input_file` parts. BYOK models are served through the LM API,
 * which has no capability declaring document input, so the file is replaced
 * with a note telling the model it was omitted rather than failing the turn.
 * The note is wrapped in newlines because the renderer concatenates adjacent
 * text parts verbatim.
 */
function omittedFileText(part: IResponsesContentPart): string {
	const mimeType = part.file_data ? /^data:(?<mimeType>[^;,]+)/.exec(part.file_data)?.groups?.mimeType : undefined;
	const name = part.filename || part.file_id || 'file';
	return `\n[${name}${mimeType ? ` (${mimeType})` : ''} omitted: this model does not accept file inputs]\n`;
}

function toContentParts(content: string | IResponsesContentPart[] | undefined, path: string): IByokLmContentPart[] {
	if (typeof content === 'string') {
		return content ? [{ type: 'text', text: content }] : [];
	}
	if (!Array.isArray(content)) {
		return [];
	}
	return content.map((part, contentIndex) => {
		const partPath = `${path}[${contentIndex}]`;
		if ((part.type === 'input_text' || part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string') {
			return { type: 'text' as const, text: part.text };
		}
		if (part.type === 'input_image' && typeof part.image_url === 'string') {
			const match = /^data:(?<mimeType>image\/[^;,]+)(?:;[^,]*)?;base64,(?<data>.*)$/.exec(part.image_url);
			if (match?.groups) {
				if (!isSupportedImageMimeType(match.groups.mimeType)) {
					throw new ResponsesTranslationError(`Unsupported ${partPath}.image_url MIME type '${match.groups.mimeType}'`);
				}
				try {
					decodeBase64(match.groups.data);
				} catch {
					throw new ResponsesTranslationError(`Invalid ${partPath}.image_url`);
				}
				return {
					type: 'image' as const,
					mimeType: match.groups.mimeType,
					data: match.groups.data,
				};
			}
			throw new ResponsesTranslationError(`Unsupported ${partPath}.image_url`);
		}
		if (part.type === 'input_file') {
			return { type: 'text' as const, text: omittedFileText(part) };
		}
		throw new ResponsesTranslationError(`Unsupported ${partPath} type '${part.type ?? ''}'`);
	});
}

/**
 * Maps a Responses tool output to the bridge's text `output` and, when it
 * carries images, the ordered `content` parts. The Copilot runtime sends a
 * content-part array (`input_text` / `input_image`) instead of a string when a
 * tool result carries images and the model declares vision support.
 */
function toToolOutput(output: string | IResponsesContentPart[] | undefined, path: string): { output: string; content?: IByokLmContentPart[] } {
	if (!Array.isArray(output)) {
		return { output: output ?? '' };
	}
	const content = toContentParts(output, path);
	const text = content.map(part => part.type === 'text' ? part.text : '').join('');
	return content.some(part => part.type === 'image') ? { output: text, content } : { output: text };
}

function requiredString(value: string | undefined, path: string): string {
	if (!value) {
		throw new ResponsesTranslationError(`${path} is required`);
	}
	return value;
}

function toBridgeInputItem(item: IResponsesInputItem, index: number): IByokLmInputItem {
	switch (item.type) {
		case 'message':
			return {
				type: 'message',
				role: toBridgeRole(item.role),
				content: toContentParts(item.content, `input[${index}].content`),
			};
		case 'reasoning':
			return {
				type: 'reasoning',
				id: item.id,
				summary: (item.summary ?? []).map((part, summaryIndex) => {
					if (part.type !== 'summary_text' || typeof part.text !== 'string') {
						throw new ResponsesTranslationError(`Unsupported input[${index}].summary[${summaryIndex}]`);
					}
					return part.text;
				}),
				encryptedContent: item.encrypted_content ?? undefined,
			};
		case 'function_call':
			return {
				type: 'function_call',
				callId: requiredString(item.call_id, `input[${index}].call_id`),
				name: requiredString(item.name, `input[${index}].name`),
				argumentsJson: item.arguments ?? '{}',
			};
		case 'function_call_output':
			return {
				type: 'function_call_output',
				callId: requiredString(item.call_id, `input[${index}].call_id`),
				...toToolOutput(item.output, `input[${index}].output`),
			};
		case 'custom_tool_call':
			return {
				type: 'custom_tool_call',
				callId: requiredString(item.call_id, `input[${index}].call_id`),
				name: requiredString(item.name, `input[${index}].name`),
				input: item.input ?? '',
			};
		case 'custom_tool_call_output':
			return {
				type: 'custom_tool_call_output',
				callId: requiredString(item.call_id, `input[${index}].call_id`),
				...toToolOutput(item.output, `input[${index}].output`),
			};
		default:
			throw new ResponsesTranslationError(`Unsupported input[${index}] type '${item.type ?? ''}'`);
	}
}

function toBridgeTools(tools: IResponsesTool[] | undefined): IByokLmTool[] | undefined {
	if (!tools?.length) {
		return undefined;
	}
	return tools.map((tool, index) => {
		switch (tool.type) {
			case 'function':
				return {
					type: 'function',
					name: requiredString(tool.name, `tools[${index}].name`),
					description: tool.description,
					parametersSchema: tool.parameters,
				};
			case 'custom':
				return {
					type: 'custom',
					name: requiredString(tool.name, `tools[${index}].name`),
					description: tool.description,
				};
			default:
				throw new ResponsesTranslationError(`Unsupported tools[${index}] type '${tool.type ?? ''}'`);
		}
	});
}

export function responsesRequestToBridge(vendor: string, body: IResponsesRequest): IByokLmChatRequest {
	const modelId = requiredString(body.model, 'model');
	let input: IByokLmInputItem[];
	if (typeof body.input === 'string') {
		input = [{ type: 'message', role: 'user', content: [{ type: 'text', text: body.input }] }];
	} else if (Array.isArray(body.input)) {
		input = body.input.map(toBridgeInputItem);
	} else {
		input = [];
	}

	const modelOptions: Record<string, unknown> = {};
	if (typeof body.temperature === 'number') {
		modelOptions.temperature = body.temperature;
	}
	if (typeof body.top_p === 'number') {
		modelOptions.top_p = body.top_p;
	}
	if (typeof body.max_output_tokens === 'number') {
		modelOptions.max_tokens = body.max_output_tokens;
	}

	return {
		vendor,
		modelId,
		instructions: body.instructions,
		input,
		tools: toBridgeTools(body.tools),
		previousResponseId: body.previous_response_id,
		reasoningEffort: body.reasoning?.effort,
		modelOptions: Object.keys(modelOptions).length ? modelOptions : undefined,
	};
}

/**
 * Most tools a BYOK request may carry. OpenAI-compatible providers reject
 * requests with more, and the Copilot SDK runtime only defers tools behind
 * tool search for models it serves natively, so BYOK requests are capped here.
 */
export const BYOK_MAX_TOOLS = 128;

/**
 * Trims {@link IByokLmChatRequest.tools} to at most {@link maxTools}. Tools the
 * conversation already called are kept first so their calls stay valid; the
 * remaining budget follows the runtime's order, which lists its built-in tools
 * before client, MCP, and extension tools. The kept tools stay in their original
 * order so the request prefix remains stable across turns.
 */
export function capBridgeTools(request: IByokLmChatRequest, maxTools = BYOK_MAX_TOOLS): { readonly request: IByokLmChatRequest; readonly droppedToolNames: readonly string[] } {
	const tools = request.tools;
	if (!tools || tools.length <= maxTools) {
		return { request, droppedToolNames: [] };
	}
	const calledToolNames = new Set(request.input.flatMap(item => item.type === 'function_call' || item.type === 'custom_tool_call' ? [item.name] : []));
	const kept = new Set<IByokLmTool>();
	for (const tool of tools) {
		if (kept.size < maxTools && calledToolNames.has(tool.name)) {
			kept.add(tool);
		}
	}
	for (const tool of tools) {
		if (kept.size >= maxTools) {
			break;
		}
		kept.add(tool);
	}
	return {
		request: { ...request, tools: tools.filter(tool => kept.has(tool)) },
		droppedToolNames: tools.filter(tool => !kept.has(tool)).map(tool => tool.name),
	};
}

/**
 * Whether the request input ends with a user message, ignoring any trailing
 * system or developer messages. This holds for the first model call of a turn,
 * including one after a cancelled turn's retained tool results, and for a call
 * after a steering message. It doesn't hold when the call continues after tool
 * results.
 */
export function endsWithUserMessage(input: readonly IByokLmInputItem[]): boolean {
	for (let i = input.length - 1; i >= 0; i--) {
		const item = input[i];
		if (item.type !== 'message' || item.role === 'assistant') {
			return false;
		}
		if (item.role === 'user') {
			return true;
		}
	}
	return false;
}

/**
 * Whether bridge output contains something the Copilot runtime counts as a
 * visible response: non-whitespace text, a tool call, or non-whitespace
 * reasoning summary text. When a model call that answers a user message has
 * none of these, the runtime fails the turn with a generic "No response was
 * returned" error.
 */
export function hasVisibleBridgeOutput(output: readonly IByokLmOutputItem[]): boolean {
	return output.some(item => {
		switch (item.type) {
			case 'message':
				return item.content.some(part => part.text.trim().length > 0);
			case 'reasoning':
				return item.summary.some(text => text.trim().length > 0);
			case 'function_call':
			case 'custom_tool_call':
				return true;
		}
	});
}

/**
 * Whether a streamed delta contains visible output: non-whitespace text,
 * non-whitespace reasoning summary text, or a tool call.
 */
export function hasVisibleDelta(delta: IByokLmStreamDeltaBody): boolean {
	switch (delta.kind) {
		case 'text':
			return delta.delta.trim().length > 0;
		case 'reasoning':
			return delta.delta.trim().length > 0;
		case 'toolCall':
			return true;
		default:
			return false;
	}
}

let responseCounter = 0;

function nextId(prefix: string): string {
	responseCounter = (responseCounter + 1) % Number.MAX_SAFE_INTEGER;
	return `${prefix}_byok_${Date.now().toString(36)}_${responseCounter.toString(36)}`;
}

function sseEvent(eventName: string, data: unknown): string {
	return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

type ResponsesOutputItem =
	| { readonly id: string; readonly type: 'message'; readonly role: 'assistant'; readonly status: 'completed'; readonly content: Array<{ readonly type: 'output_text'; readonly text: string; readonly annotations: unknown[]; readonly logprobs: unknown[] }> }
	| { readonly id: string; readonly type: 'reasoning'; readonly status: 'completed'; readonly summary: Array<{ readonly type: 'summary_text'; readonly text: string }>; readonly encrypted_content: string | null }
	| { readonly id: string; readonly type: 'function_call'; readonly status: 'completed'; readonly call_id: string; readonly name: string; readonly arguments: string }
	| { readonly id: string; readonly type: 'custom_tool_call'; readonly status: 'completed'; readonly call_id: string; readonly name: string; readonly input: string };

/**
 * The wire id an output item is advertised under. Reasoning items keep the
 * provider's `rs*` id so a replayed reasoning item stays recognizable; every
 * other kind gets a proxy-generated one.
 */
function outputItemId(type: IByokLmOutputItem['type'], id?: string): string {
	if (type === 'reasoning' && id?.startsWith('rs')) {
		return id;
	}
	switch (type) {
		case 'message':
			return nextId('msg');
		case 'reasoning':
			return nextId('rs');
		case 'function_call':
			return nextId('fc');
		case 'custom_tool_call':
			return nextId('ctc');
	}
}

function toInProgressOutputItem(item: ResponsesOutputItem): object {
	switch (item.type) {
		case 'message':
			return { ...item, status: 'in_progress', content: [] };
		case 'reasoning':
			return { ...item, status: 'in_progress', summary: [], encrypted_content: null };
		case 'function_call':
			return { ...item, status: 'in_progress', arguments: '' };
		case 'custom_tool_call':
			return { ...item, status: 'in_progress', input: '' };
	}
}

function toResponsesOutputItem(item: IByokLmOutputItem, id: string = outputItemId(item.type, item.type === 'reasoning' ? item.id : undefined)): ResponsesOutputItem {
	switch (item.type) {
		case 'message':
			return {
				id,
				type: 'message',
				role: 'assistant',
				status: 'completed',
				content: item.content.map(part => ({ type: 'output_text', text: part.text, annotations: [], logprobs: [] })),
			};
		case 'reasoning':
			return {
				id,
				type: 'reasoning',
				status: 'completed',
				summary: item.summary.map(text => ({ type: 'summary_text', text })),
				encrypted_content: item.encryptedContent ?? null,
			};
		case 'function_call':
			return {
				id,
				type: 'function_call',
				status: 'completed',
				call_id: item.callId,
				name: item.name,
				arguments: item.argumentsJson,
			};
		case 'custom_tool_call':
			return {
				id,
				type: 'custom_tool_call',
				status: 'completed',
				call_id: item.callId,
				name: item.name,
				input: item.input,
			};
	}
}

function outputText(items: readonly ResponsesOutputItem[]): string {
	return items
		.filter((item): item is Extract<ResponsesOutputItem, { type: 'message' }> => item.type === 'message')
		.flatMap(item => item.content)
		.map(part => part.text)
		.join('');
}

function responseEnvelope(responseId: string, model: string, status: 'in_progress' | 'completed' | 'failed', output: readonly ResponsesOutputItem[], usage: unknown) {
	return {
		id: responseId,
		object: 'response',
		created_at: Math.floor(Date.now() / 1000),
		status,
		error: null,
		incomplete_details: null,
		instructions: null,
		model,
		output,
		output_text: outputText(output),
		parallel_tool_calls: true,
		temperature: 1,
		tool_choice: 'auto',
		tools: [],
		top_p: 1,
		usage,
	};
}

function usageEnvelope(result: IByokLmChatResult) {
	const inputTokens = result.usage?.inputTokens ?? 0;
	const outputTokens = result.usage?.outputTokens ?? 0;
	return {
		input_tokens: inputTokens,
		input_tokens_details: { cached_tokens: 0 },
		output_tokens: outputTokens,
		output_tokens_details: { reasoning_tokens: result.usage?.reasoningTokens ?? 0 },
		total_tokens: inputTokens + outputTokens,
	};
}

function prepareResponse(result: IByokLmChatResult, model: string, responseId: string = result.responseId ?? nextId('resp')) {
	const output = result.output.map(item => toResponsesOutputItem(item));
	return {
		responseId,
		output,
		completed: responseEnvelope(responseId, model, 'completed', output, usageEnvelope(result)),
	};
}

export function bridgeResultToResponsesBody(result: IByokLmChatResult, model: string): string {
	return JSON.stringify(prepareResponse(result, model).completed);
}

function reasoningFrames(item: Extract<ResponsesOutputItem, { type: 'reasoning' }>, outputIndex: number, sequence: { value: number }): string[] {
	const frames: string[] = [];
	item.summary.forEach((part, summaryIndex) => {
		frames.push(sseEvent('response.reasoning_summary_part.added', {
			type: 'response.reasoning_summary_part.added',
			sequence_number: sequence.value++,
			item_id: item.id,
			output_index: outputIndex,
			summary_index: summaryIndex,
			part: { type: 'summary_text', text: '' },
		}));
		frames.push(sseEvent('response.reasoning_summary_text.delta', {
			type: 'response.reasoning_summary_text.delta',
			sequence_number: sequence.value++,
			item_id: item.id,
			output_index: outputIndex,
			summary_index: summaryIndex,
			delta: part.text,
		}));
		frames.push(sseEvent('response.reasoning_summary_text.done', {
			type: 'response.reasoning_summary_text.done',
			sequence_number: sequence.value++,
			item_id: item.id,
			output_index: outputIndex,
			summary_index: summaryIndex,
			text: part.text,
		}));
		frames.push(sseEvent('response.reasoning_summary_part.done', {
			type: 'response.reasoning_summary_part.done',
			sequence_number: sequence.value++,
			item_id: item.id,
			output_index: outputIndex,
			summary_index: summaryIndex,
			part,
		}));
	});
	return frames;
}

function messageFrames(item: Extract<ResponsesOutputItem, { type: 'message' }>, outputIndex: number, sequence: { value: number }): string[] {
	const frames: string[] = [];
	item.content.forEach((part, contentIndex) => {
		frames.push(sseEvent('response.content_part.added', {
			type: 'response.content_part.added',
			sequence_number: sequence.value++,
			item_id: item.id,
			output_index: outputIndex,
			content_index: contentIndex,
			part: { type: 'output_text', text: '', annotations: [], logprobs: [] },
		}));
		frames.push(sseEvent('response.output_text.delta', {
			type: 'response.output_text.delta',
			sequence_number: sequence.value++,
			item_id: item.id,
			output_index: outputIndex,
			content_index: contentIndex,
			delta: part.text,
			logprobs: [],
		}));
		frames.push(sseEvent('response.output_text.done', {
			type: 'response.output_text.done',
			sequence_number: sequence.value++,
			item_id: item.id,
			output_index: outputIndex,
			content_index: contentIndex,
			text: part.text,
			logprobs: [],
		}));
		frames.push(sseEvent('response.content_part.done', {
			type: 'response.content_part.done',
			sequence_number: sequence.value++,
			item_id: item.id,
			output_index: outputIndex,
			content_index: contentIndex,
			part,
		}));
	});
	return frames;
}

function callFrames(item: Extract<ResponsesOutputItem, { type: 'function_call' | 'custom_tool_call' }>, outputIndex: number, sequence: { value: number }): string[] {
	if (item.type === 'function_call') {
		return [
			sseEvent('response.function_call_arguments.delta', {
				type: 'response.function_call_arguments.delta',
				sequence_number: sequence.value++,
				item_id: item.id,
				output_index: outputIndex,
				delta: item.arguments,
			}),
			sseEvent('response.function_call_arguments.done', {
				type: 'response.function_call_arguments.done',
				sequence_number: sequence.value++,
				item_id: item.id,
				output_index: outputIndex,
				arguments: item.arguments,
			}),
		];
	}
	return [
		sseEvent('response.custom_tool_call_input.delta', {
			type: 'response.custom_tool_call_input.delta',
			sequence_number: sequence.value++,
			item_id: item.id,
			output_index: outputIndex,
			delta: item.input,
		}),
		sseEvent('response.custom_tool_call_input.done', {
			type: 'response.custom_tool_call_input.done',
			sequence_number: sequence.value++,
			item_id: item.id,
			output_index: outputIndex,
			input: item.input,
		}),
	];
}

/** Frames that stream a complete output item: `added`, its content, and `done`. */
function outputItemFrames(item: ResponsesOutputItem, outputIndex: number, sequence: { value: number }): string[] {
	switch (item.type) {
		case 'message':
			return messageFrames(item, outputIndex, sequence);
		case 'reasoning':
			return reasoningFrames(item, outputIndex, sequence);
		case 'function_call':
		case 'custom_tool_call':
			return callFrames(item, outputIndex, sequence);
	}
}

/**
 * One output item being streamed. `key` is the renderer-side identity that
 * decides whether a delta extends the open item (a reasoning item's provider id,
 * `undefined` for text and tool calls). It is kept separate from the wire `id`
 * the client sees, because `outputItemId` replaces ids it cannot reuse.
 */
interface IStreamedOutputItem {
	readonly index: number;
	readonly id: string;
	readonly type: ResponsesOutputItem['type'];
	readonly key: string | undefined;
	readonly callId: string;
	readonly name: string;
	/** Message text, function-call arguments, custom-tool input, or the open reasoning summary part. */
	text: string;
	/** Reasoning summary parts that are closed; the part still streaming is `text`. */
	readonly summary: string[];
	/** Whether `text` is materialized on the wire as a content part or summary part. */
	partOpen: boolean;
	encryptedContent: string | undefined;
}

/**
 * Writes OpenAI Responses SSE frames incrementally, so a BYOK completion reaches
 * the runtime as it is produced rather than after it is complete.
 *
 * Frames are emitted in the order {@link bridgeResultToResponsesSseFrames} uses
 * for a whole result, which is defined in terms of this emitter: a request that
 * streams no deltas therefore produces the frame sequence it always produced.
 */
export interface IResponsesSseEmitter {
	/** The response id advertised in `response.created` and `response.completed`. */
	readonly responseId: string;
	/** Frames for the response skeleton. Write these before the first delta frame. */
	begin(): string[];
	/** Frames for one streamed delta, in delta order. */
	push(delta: IByokLmStreamDelta): string[];
	/**
	 * Frames that close the open item and complete the response. `result` is
	 * authoritative: streamed items adopt its content, and items it contains that
	 * were never streamed — an older renderer, or a delta this client did not
	 * observe — are emitted here in full.
	 */
	complete(result: IByokLmChatResult): string[];
	/** Frames that fail the response in-stream, for a failure after the first delta was written. */
	fail(message: string): string[];
}

export function createResponsesSseEmitter(model: string, responseId: string = nextId('resp')): IResponsesSseEmitter {
	const sequence = { value: 0 };
	const streamed: IStreamedOutputItem[] = [];
	let open: IStreamedOutputItem | undefined;

	const frame = (event: string, data: object): string => sseEvent(event, { sequence_number: sequence.value++, ...data });

	const skeleton = responseEnvelope(responseId, model, 'in_progress', [], undefined);
	const skeletonFrames = [
		frame('response.created', { type: 'response.created', response: skeleton }),
		frame('response.in_progress', { type: 'response.in_progress', response: skeleton }),
	];

	/** The wire item for what has been streamed so far, for frames written before the result is known. */
	const streamedItem = (item: IStreamedOutputItem): ResponsesOutputItem => {
		const summary = item.partOpen ? [...item.summary, item.text] : item.summary;
		switch (item.type) {
			case 'message':
				return { id: item.id, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: item.text, annotations: [], logprobs: [] }] };
			case 'reasoning':
				return { id: item.id, type: 'reasoning', status: 'completed', summary: summary.map(text => ({ type: 'summary_text', text })), encrypted_content: item.encryptedContent ?? null };
			case 'function_call':
				return { id: item.id, type: 'function_call', status: 'completed', call_id: item.callId, name: item.name, arguments: item.text };
			case 'custom_tool_call':
				return { id: item.id, type: 'custom_tool_call', status: 'completed', call_id: item.callId, name: item.name, input: item.text };
		}
	};

	const openItem = (item: IStreamedOutputItem): string[] => {
		open = item;
		streamed.push(item);
		return [frame('response.output_item.added', {
			type: 'response.output_item.added',
			output_index: item.index,
			item: toInProgressOutputItem(streamedItem(item)),
		})];
	};

	const closeSummaryPart = (item: IStreamedOutputItem): string[] => {
		const summaryIndex = item.summary.length;
		const text = item.text;
		item.summary.push(text);
		item.text = '';
		item.partOpen = false;
		return [
			frame('response.reasoning_summary_text.done', { type: 'response.reasoning_summary_text.done', item_id: item.id, output_index: item.index, summary_index: summaryIndex, text }),
			frame('response.reasoning_summary_part.done', { type: 'response.reasoning_summary_part.done', item_id: item.id, output_index: item.index, summary_index: summaryIndex, part: { type: 'summary_text', text } }),
		];
	};

	/**
	 * Closes the open item, if any. `item` is what `response.output_item.done`
	 * advertises; without one the accumulated state is used.
	 */
	const closeOpenItem = (item?: ResponsesOutputItem): string[] => {
		const current = open;
		if (!current) {
			return [];
		}
		const done = item ?? streamedItem(current);
		const frames: string[] = [];
		if (current.type === 'message' && done.type === 'message') {
			const text = done.content.map(part => part.text).join('');
			frames.push(
				frame('response.output_text.done', { type: 'response.output_text.done', item_id: current.id, output_index: current.index, content_index: 0, text, logprobs: [] }),
				frame('response.content_part.done', { type: 'response.content_part.done', item_id: current.id, output_index: current.index, content_index: 0, part: { type: 'output_text', text, annotations: [], logprobs: [] } }),
			);
		} else if (current.type === 'reasoning' && current.partOpen) {
			frames.push(...closeSummaryPart(current));
		} else if (current.type === 'function_call' && done.type === 'function_call') {
			frames.push(frame('response.function_call_arguments.done', { type: 'response.function_call_arguments.done', item_id: current.id, output_index: current.index, arguments: done.arguments }));
		} else if (current.type === 'custom_tool_call' && done.type === 'custom_tool_call') {
			frames.push(frame('response.custom_tool_call_input.done', { type: 'response.custom_tool_call_input.done', item_id: current.id, output_index: current.index, input: done.input }));
		}
		frames.push(frame('response.output_item.done', { type: 'response.output_item.done', output_index: current.index, item: done }));
		open = undefined;
		return frames;
	};

	return {
		responseId,

		begin(): string[] {
			return skeletonFrames;
		},

		push(delta: IByokLmStreamDelta): string[] {
			const frames: string[] = [];

			if (delta.kind === 'text') {
				if (open?.type !== 'message') {
					frames.push(
						...closeOpenItem(),
						...openItem({ index: streamed.length, id: outputItemId('message'), type: 'message', key: undefined, callId: '', name: '', text: '', summary: [], partOpen: true, encryptedContent: undefined }),
					);
					frames.push(frame('response.content_part.added', {
						type: 'response.content_part.added',
						item_id: open!.id,
						output_index: open!.index,
						content_index: 0,
						part: { type: 'output_text', text: '', annotations: [], logprobs: [] },
					}));
				}
				open!.text += delta.delta;
				frames.push(frame('response.output_text.delta', { type: 'response.output_text.delta', item_id: open!.id, output_index: open!.index, content_index: 0, delta: delta.delta, logprobs: [] }));
				return frames;
			}

			if (delta.kind === 'reasoning') {
				if (open?.type !== 'reasoning' || open.key !== delta.id) {
					frames.push(
						...closeOpenItem(),
						...openItem({ index: streamed.length, id: outputItemId('reasoning', delta.id), type: 'reasoning', key: delta.id, callId: '', name: '', text: '', summary: [], partOpen: false, encryptedContent: undefined }),
					);
				}
				const item = open!;
				if (delta.encryptedContent !== undefined) {
					item.encryptedContent = delta.encryptedContent;
				}
				if (item.partOpen && delta.newSummaryPart) {
					frames.push(...closeSummaryPart(item));
				}
				if (!item.partOpen && (delta.newSummaryPart || delta.delta.length > 0)) {
					item.partOpen = true;
					frames.push(frame('response.reasoning_summary_part.added', {
						type: 'response.reasoning_summary_part.added',
						item_id: item.id,
						output_index: item.index,
						summary_index: item.summary.length,
						part: { type: 'summary_text', text: '' },
					}));
				}
				if (item.partOpen) {
					item.text += delta.delta;
					frames.push(frame('response.reasoning_summary_text.delta', {
						type: 'response.reasoning_summary_text.delta',
						item_id: item.id,
						output_index: item.index,
						summary_index: item.summary.length,
						delta: delta.delta,
					}));
				}
				return frames;
			}

			// A tool call is always complete when it arrives, and always starts a new item.
			const type = delta.isCustom ? 'custom_tool_call' : 'function_call';
			frames.push(
				...closeOpenItem(),
				...openItem({ index: streamed.length, id: outputItemId(type), type, key: undefined, callId: delta.callId, name: delta.name, text: delta.value, summary: [], partOpen: true, encryptedContent: undefined }),
			);
			frames.push(delta.isCustom
				? frame('response.custom_tool_call_input.delta', { type: 'response.custom_tool_call_input.delta', item_id: open!.id, output_index: open!.index, delta: delta.value })
				: frame('response.function_call_arguments.delta', { type: 'response.function_call_arguments.delta', item_id: open!.id, output_index: open!.index, delta: delta.value }));
			return frames;
		},

		complete(result: IByokLmChatResult): string[] {
			const frames: string[] = [];
			const items: ResponsesOutputItem[] = [];
			for (let i = 0; i < streamed.length; i++) {
				const current = streamed[i];
				const authoritative = i < result.output.length ? result.output[i] : undefined;
				// Items closed mid-stream used accumulated content, which by construction
				// matches the result; the content the result reports wins wherever it is
				// available, so encrypted provider state is always exact.
				items.push(authoritative && authoritative.type === current.type
					? toResponsesOutputItem(authoritative, current.id)
					: streamedItem(current));
			}
			// Only the last streamed item can still be open, and it closes with the
			// item the result reports for that index.
			if (open) {
				frames.push(...closeOpenItem(items[open.index]));
			}
			for (let i = streamed.length; i < result.output.length; i++) {
				const item = toResponsesOutputItem(result.output[i]);
				frames.push(frame('response.output_item.added', { type: 'response.output_item.added', output_index: i, item: toInProgressOutputItem(item) }));
				frames.push(...outputItemFrames(item, i, sequence));
				frames.push(frame('response.output_item.done', { type: 'response.output_item.done', output_index: i, item }));
				items.push(item);
			}
			frames.push(frame('response.completed', { type: 'response.completed', response: responseEnvelope(responseId, model, 'completed', items, usageEnvelope(result)) }));
			return frames;
		},

		fail(message: string): string[] {
			return [frame('response.failed', {
				type: 'response.failed',
				response: { ...responseEnvelope(responseId, model, 'failed', [], undefined), error: { code: 'server_error', message } },
			})];
		},
	};
}

export function bridgeResultToResponsesSseFrames(result: IByokLmChatResult, model: string): string[] {
	// This path has the whole result up front, so it can keep advertising the
	// provider's own response id in every frame.
	const emitter = createResponsesSseEmitter(model, result.responseId ?? nextId('resp'));
	return [...emitter.begin(), ...emitter.complete(result)];
}

export function responsesErrorBody(message: string, type = 'api_error'): string {
	return JSON.stringify({ error: { message, type } });
}
