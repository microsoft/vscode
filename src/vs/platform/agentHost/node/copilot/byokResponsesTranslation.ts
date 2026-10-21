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

function toResponsesOutputItem(item: IByokLmOutputItem): ResponsesOutputItem {
	switch (item.type) {
		case 'message':
			return {
				id: nextId('msg'),
				type: 'message',
				role: 'assistant',
				status: 'completed',
				content: item.content.map(part => ({ type: 'output_text', text: part.text, annotations: [], logprobs: [] })),
			};
		case 'reasoning':
			return {
				id: item.id?.startsWith('rs') ? item.id : nextId('rs'),
				type: 'reasoning',
				status: 'completed',
				summary: item.summary.map(text => ({ type: 'summary_text', text })),
				encrypted_content: item.encryptedContent ?? null,
			};
		case 'function_call':
			return {
				id: nextId('fc'),
				type: 'function_call',
				status: 'completed',
				call_id: item.callId,
				name: item.name,
				arguments: item.argumentsJson,
			};
		case 'custom_tool_call':
			return {
				id: nextId('ctc'),
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

function responseEnvelope(responseId: string, model: string, status: 'in_progress' | 'completed', output: readonly ResponsesOutputItem[], usage: unknown) {
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

function prepareResponse(result: IByokLmChatResult, model: string) {
	const responseId = result.responseId ?? nextId('resp');
	const output = result.output.map(toResponsesOutputItem);
	const inputTokens = result.usage?.inputTokens ?? 0;
	const outputTokens = result.usage?.outputTokens ?? 0;
	const usage = {
		input_tokens: inputTokens,
		input_tokens_details: { cached_tokens: 0 },
		output_tokens: outputTokens,
		output_tokens_details: { reasoning_tokens: result.usage?.reasoningTokens ?? 0 },
		total_tokens: inputTokens + outputTokens,
	};
	return {
		responseId,
		output,
		completed: responseEnvelope(responseId, model, 'completed', output, usage),
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

export function bridgeResultToResponsesSseFrames(result: IByokLmChatResult, model: string): string[] {
	const { responseId, output, completed } = prepareResponse(result, model);
	const sequence = { value: 0 };
	const frames: string[] = [];
	const skeleton = responseEnvelope(responseId, model, 'in_progress', [], undefined);
	frames.push(sseEvent('response.created', { type: 'response.created', sequence_number: sequence.value++, response: skeleton }));
	frames.push(sseEvent('response.in_progress', { type: 'response.in_progress', sequence_number: sequence.value++, response: skeleton }));

	output.forEach((item, outputIndex) => {
		frames.push(sseEvent('response.output_item.added', {
			type: 'response.output_item.added',
			sequence_number: sequence.value++,
			output_index: outputIndex,
			item: toInProgressOutputItem(item),
		}));
		switch (item.type) {
			case 'message':
				frames.push(...messageFrames(item, outputIndex, sequence));
				break;
			case 'reasoning':
				frames.push(...reasoningFrames(item, outputIndex, sequence));
				break;
			case 'function_call':
			case 'custom_tool_call':
				frames.push(...callFrames(item, outputIndex, sequence));
				break;
		}
		frames.push(sseEvent('response.output_item.done', {
			type: 'response.output_item.done',
			sequence_number: sequence.value++,
			output_index: outputIndex,
			item,
		}));
	});

	frames.push(sseEvent('response.completed', {
		type: 'response.completed',
		sequence_number: sequence.value++,
		response: completed,
	}));
	return frames;
}

export function responsesErrorBody(message: string, type = 'api_error'): string {
	return JSON.stringify({ error: { message, type } });
}
