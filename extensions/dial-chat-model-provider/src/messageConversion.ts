/**
 * Convert between VS Code Language Model API messages and OpenAI-compatible DIAL payloads.
 *
 * VS Code only exposes User and Assistant roles. Messages are forwarded to DIAL as-is
 * (no splitting into system/user based on Copilot XML tags).
 */

import * as vscode from 'vscode';
import {
	assertWithinMaxInputAttachments,
	deploymentAllowsMime,
	isCopilotCustomDataPart,
	isImageMime,
} from './attachmentCapabilities';
import {
	type DialChatMessage,
	type DialDeployment,
	type DialInputAttachment,
	type DialToolChoice,
	type Nullable,
	type OpenAIToolCall,
	type OpenAIToolDefinition,
} from './types';

/** Map VS Code tools to OpenAI `tools` array. */
export function toOpenAITools(
	tools: Nullable<readonly vscode.LanguageModelChatTool[]>,
): Nullable<readonly OpenAIToolDefinition[]> {
	if (!tools || tools.length === 0) {
		return undefined;
	}
	return tools.map((tool) => ({
		type: 'function' as const,
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.inputSchema ?? { type: 'object', properties: {} },
		},
	}));
}

/** Map VS Code tool mode to OpenAI `tool_choice`. */
export function toToolChoice(
	toolMode: Nullable<vscode.LanguageModelChatToolMode>,
	hasTools: boolean,
): Nullable<DialToolChoice> {
	if (!hasTools) {
		return undefined;
	}
	if (toolMode === vscode.LanguageModelChatToolMode.Required) {
		return 'required';
	}
	return 'auto';
}

interface MessageLogSummary {
	readonly role: DialChatMessage['role'];
	readonly contentChars: number;
	readonly attachmentCount?: number;
	readonly attachmentTypes?: readonly string[];
	readonly tool_call_id?: string;
	readonly tool_calls?: number;
}

/** Role/length summary for logs (never log full Copilot prompts or attachment data). */
export function summarizeMessagesForLog(
	messages: readonly DialChatMessage[],
): readonly MessageLogSummary[] {
	return messages.map((m) => {
		if (m.role === 'tool') {
			return {
				role: m.role,
				tool_call_id: m.tool_call_id,
				contentChars: m.content.length,
			};
		}
		if (m.role === 'assistant') {
			return {
				role: m.role,
				contentChars: m.content?.length ?? 0,
				tool_calls: m.tool_calls?.length ?? 0,
			};
		}
		if (m.role === 'user') {
			const attachments = m.custom_content?.attachments;
			return {
				role: m.role,
				contentChars: m.content.length,
				...(attachments && attachments.length > 0
					? {
							attachmentCount: attachments.length,
							attachmentTypes: attachments.map((a: DialInputAttachment) => a.type),
						}
					: {}),
			};
		}
		return {
			role: m.role,
			contentChars: m.content.length,
		};
	});
}

export interface MessageAggregateLogSummary {
	readonly byRole: Readonly<Record<string, number>>;
	readonly totalContentChars: number;
	readonly maxContentChars: number;
	readonly toolCallCount: number;
	readonly attachmentCount: number;
	readonly attachmentTypes?: readonly string[];
}

function messageContentChars(message: DialChatMessage): number {
	if (message.role === 'assistant') {
		return message.content?.length ?? 0;
	}
	return message.content.length;
}

/** Compact history stats for logs (one object instead of per-message rows). */
export function aggregateMessagesForLog(
	messages: readonly DialChatMessage[],
): MessageAggregateLogSummary {
	const byRole: Record<string, number> = {};
	let totalContentChars = 0;
	let maxContentChars = 0;
	let toolCallCount = 0;
	let attachmentCount = 0;
	const attachmentTypeSet = new Set<string>();

	for (const message of messages) {
		byRole[message.role] = (byRole[message.role] ?? 0) + 1;
		const contentChars = messageContentChars(message);
		totalContentChars += contentChars;
		maxContentChars = Math.max(maxContentChars, contentChars);

		if (message.role === 'assistant') {
			toolCallCount += message.tool_calls?.length ?? 0;
		}
		if (message.role === 'user') {
			const attachments = message.custom_content?.attachments;
			if (attachments && attachments.length > 0) {
				attachmentCount += attachments.length;
				for (const attachment of attachments) {
					attachmentTypeSet.add(attachment.type);
				}
			}
		}
	}

	return {
		byRole,
		totalContentChars,
		maxContentChars,
		toolCallCount,
		attachmentCount,
		...(attachmentTypeSet.size > 0
			? { attachmentTypes: [...attachmentTypeSet].sort() }
			: {}),
	};
}

/** VS Code declares request content as `Array<LanguageModelInputPart | unknown>` for forward-compat. */
type RequestMessageContent = vscode.LanguageModelChatRequestMessage['content'];
/** VS Code declares tool-result content as `Array<LanguageModelTextPart | LanguageModelPromptTsxPart | LanguageModelDataPart | unknown>`. */
type ToolResultContent = vscode.LanguageModelToolResultPart['content'];

/** Shape of {@link vscode.LanguageModelDataPart} on the wire (mimeType + binary payload). */
interface LanguageModelDataPartShape {
	readonly mimeType: string;
	readonly data: Uint8Array;
}

function readStringValue(value: unknown): Nullable<string> {
	if (typeof value === 'string') {
		return value;
	}
	if (
		typeof value === 'object' &&
		value !== null &&
		'value' in value &&
		typeof (value as { value: unknown }).value === 'string'
	) {
		return (value as { value: string }).value;
	}
	return undefined;
}

/**
 * Flatten a single request message to its text content (ignores attachments and
 * tool framing). Used for token counting.
 */
export function flattenRequestMessageText(message: vscode.LanguageModelChatRequestMessage): string {
	const parts: string[] = [];
	for (const part of message.content) {
		if (part instanceof vscode.LanguageModelTextPart) {
			parts.push(part.value);
		} else {
			const value = readStringValue(part);
			if (value) {
				parts.push(value);
			}
		}
	}
	return parts.join('');
}

function isLanguageModelDataPartShape(part: unknown): part is LanguageModelDataPartShape {
	if (typeof part !== 'object' || part === null) {
		return false;
	}
	const candidate = part as { mimeType?: unknown; data?: unknown };
	return typeof candidate.mimeType === 'string' && candidate.data instanceof Uint8Array;
}

function attachmentFromDataPart(part: LanguageModelDataPartShape): DialInputAttachment {
	return {
		type: part.mimeType,
		data: Buffer.from(part.data).toString('base64'),
	};
}

function tryAddDialAttachment(
	attachments: DialInputAttachment[],
	part: LanguageModelDataPartShape,
	deployment: DialDeployment,
): void {
	const mime = part.mimeType;
	if (isCopilotCustomDataPart(mime)) {
		return;
	}
	if (deploymentAllowsMime(deployment, mime)) {
		attachments.push(attachmentFromDataPart(part));
		return;
	}
	if (isImageMime(mime)) {
		const label = deployment.name ?? deployment.id;
		throw new Error(`DIAL model "${label}" does not support attachment type "${mime}".`);
	}
}

function buildUserMessage(
	textParts: readonly string[],
	attachments: readonly DialInputAttachment[],
): Nullable<DialChatMessage> {
	const content = textParts.join('');
	if (!content && attachments.length === 0) {
		return undefined;
	}
	if (attachments.length === 0) {
		return { role: 'user', content };
	}
	return {
		role: 'user',
		content,
		custom_content: { attachments },
	};
}

function buildAssistantMessage(parts: RequestMessageContent): Nullable<DialChatMessage> {
	const textParts: string[] = [];
	const toolCalls: OpenAIToolCall[] = [];

	for (const part of parts) {
		if (part instanceof vscode.LanguageModelTextPart) {
			textParts.push(part.value);
		} else if (part instanceof vscode.LanguageModelToolCallPart) {
			toolCalls.push({
				id: part.callId,
				type: 'function',
				function: {
					name: part.name,
					arguments: JSON.stringify(part.input ?? {}),
				},
			});
		}
	}

	const content = textParts.join('') || null;
	if (toolCalls.length > 0) {
		return { role: 'assistant', content, tool_calls: toolCalls };
	}
	if (content) {
		return { role: 'assistant', content };
	}
	return undefined;
}

function flattenToolResult(content: ToolResultContent): string {
	return content
		.map((part) => {
			if (part instanceof vscode.LanguageModelTextPart) {
				return part.value;
			}
			return readStringValue(part) ?? '';
		})
		.join('');
}

/**
 * Flatten VS Code chat messages into DIAL-compatible messages, including tool calls/results
 * and `custom_content.attachments` with base64 `data` for inline images.
 */
export function toDialMessages(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	deployment: DialDeployment,
): DialChatMessage[] {
	const out: DialChatMessage[] = [];

	for (const msg of messages) {
		if (msg.role === vscode.LanguageModelChatMessageRole.Assistant) {
			const assistant = buildAssistantMessage(msg.content);
			if (assistant) {
				out.push(assistant);
			}
			continue;
		}

		const textParts: string[] = [];
		const attachments: DialInputAttachment[] = [];
		const toolResults: vscode.LanguageModelToolResultPart[] = [];

		for (const part of msg.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				textParts.push(part.value);
			} else if (part instanceof vscode.LanguageModelToolResultPart) {
				toolResults.push(part);
			} else if (isLanguageModelDataPartShape(part)) {
				tryAddDialAttachment(attachments, part, deployment);
			} else {
				const fallback = readStringValue(part);
				if (fallback) {
					textParts.push(fallback);
				}
			}
		}

		if (attachments.length > 0) {
			assertWithinMaxInputAttachments(deployment, attachments.length);
		}

		const userMessage = buildUserMessage(textParts, attachments);
		if (userMessage) {
			out.push(userMessage);
		}

		for (const tr of toolResults) {
			out.push({
				role: 'tool',
				tool_call_id: tr.callId,
				content: flattenToolResult(tr.content),
			});
		}
	}

	return out;
}
