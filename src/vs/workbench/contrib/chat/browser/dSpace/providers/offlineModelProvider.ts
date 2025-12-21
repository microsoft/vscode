/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ILocalAIService } from '../localInference/localAI.js';
import { ChatMessageRole } from '../../../common/languageModels.js';
import {
	DSpaceModelId,
	IDSpaceMessage,
	IDSpaceModelProvider,
	IDSpaceStreamChunk,
	IDSpaceTool,
	IDSpaceToolCall,
} from './modelProvider.js';

/**
 * Local model ID to use (Qwen 3 0.6B)
 */
const LOCAL_MODEL_ID = 'qwen3-0.6b';

/**
 * Tool call regex pattern to extract tool calls from model output
 * Matches: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
 * Also handles cases where closing tag is missing (end of stream)
 */
const TOOL_CALL_PATTERN = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;

/**
 * Fallback pattern for tool calls without closing tag (at end of stream)
 * Matches: <tool_call>{"name": "...", "arguments": {...}}
 */
const TOOL_CALL_PATTERN_NO_CLOSE = /<tool_call>\s*(\{[\s\S]*\})\s*$/;

/**
 * Pattern to match and remove thinking blocks
 * Matches: <think>...</think> with any content
 */
const THINKING_PATTERN = /<think>[\s\S]*?<\/think>/g;

/**
 * Pattern to detect incomplete thinking block (streaming)
 * Matches: <think> without closing tag
 */
const INCOMPLETE_THINKING_PATTERN = /<think>[\s\S]*$/;

/**
 * Pattern to detect incomplete tool_call block (streaming)
 * Matches: <tool_call> without closing tag
 */
const INCOMPLETE_TOOL_CALL_PATTERN = /<tool_call>[\s\S]*$/;

/**
 * Offline model provider that runs inference locally using WebGPU
 * Uses transformers.js via a WebWorker for non-blocking inference
 */
export class OfflineModelProvider implements IDSpaceModelProvider {
	readonly id = DSpaceModelId.Offline;
	readonly name = 'DSpace Local (Qwen)';

	constructor(
		@ILogService private readonly logService: ILogService,
		@ILocalAIService private readonly localAIService: ILocalAIService
	) { }

	/**
	 * Check if the offline provider is available
	 * Requires WebGPU support
	 */
	async isAvailable(): Promise<boolean> {
		return this.localAIService.isWebGPUAvailable();
	}

	/**
	 * Build the system prompt with tool definitions for local model
	 */
	private buildToolSystemPrompt(tools: IDSpaceTool[]): string {
		if (tools.length === 0) {
			return '';
		}

		const toolDefinitions = tools.map(tool => JSON.stringify({
			name: tool.function.name,
			description: tool.function.description,
			parameters: tool.function.parameters,
		}, null, 2)).join('\n\n');

		return `You are an AI assistant with access to the following tools:

${toolDefinitions}

When you need to use a tool, respond with:
<tool_call>{"name": "tool_name", "arguments": {"arg1": "value1"}}</tool_call>

You can make multiple tool calls if needed. After receiving tool results, continue your response.
Always explain what you're doing before making tool calls.`;
	}

	/**
	 * Convert IDSpaceMessage to format expected by local AI service
	 */
	private convertMessages(messages: IDSpaceMessage[], tools: IDSpaceTool[]): Array<{
		role: ChatMessageRole;
		content: Array<{ type: 'text'; value: string }>;
	}> {
		const result: Array<{
			role: ChatMessageRole;
			content: Array<{ type: 'text'; value: string }>;
		}> = [];

		// Add tool system prompt if tools are available
		if (tools.length > 0) {
			const toolPrompt = this.buildToolSystemPrompt(tools);
			result.push({
				role: ChatMessageRole.System,
				content: [{ type: 'text', value: toolPrompt }],
			});
		}

		// Convert messages
		for (const msg of messages) {
			let role: ChatMessageRole;
			switch (msg.role) {
				case 'system':
					role = ChatMessageRole.System;
					break;
				case 'assistant':
					role = ChatMessageRole.Assistant;
					break;
				case 'tool':
					// Convert tool results to user messages with context
					role = ChatMessageRole.User;
					break;
				default:
					role = ChatMessageRole.User;
			}

			let content = msg.content;

			// For tool results, format them clearly
			if (msg.role === 'tool' && msg.name) {
				content = `Tool result for ${msg.name}:\n${msg.content}`;
			}

			// For assistant messages with tool_calls, format them
			if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
				const toolCallsStr = msg.tool_calls.map(tc =>
					`<tool_call>${JSON.stringify({ name: tc.function.name, arguments: JSON.parse(tc.function.arguments) })}</tool_call>`
				).join('\n');
				content = content ? `${content}\n${toolCallsStr}` : toolCallsStr;
			}

			result.push({
				role,
				content: [{ type: 'text', value: content }],
			});
		}

		return result;
	}

	/**
	 * Parse tool calls from model output
	 * Handles both complete <tool_call>...</tool_call> and incomplete tags at end of stream
	 */
	private parseToolCalls(text: string, isEndOfStream: boolean = false): IDSpaceToolCall[] {
		const toolCalls: IDSpaceToolCall[] = [];
		let match;

		// Reset lastIndex for global regex
		TOOL_CALL_PATTERN.lastIndex = 0;

		// First try complete tool call pattern
		while ((match = TOOL_CALL_PATTERN.exec(text)) !== null) {
			this.tryParseToolCall(match[1], toolCalls);
		}

		// If at end of stream and no complete tool calls found, try fallback pattern
		if (isEndOfStream && toolCalls.length === 0) {
			const fallbackMatch = TOOL_CALL_PATTERN_NO_CLOSE.exec(text);
			if (fallbackMatch) {
				this.logService.info('[OfflineModelProvider] Using fallback tool call pattern (no closing tag)');
				this.tryParseToolCall(fallbackMatch[1], toolCalls);
			}
		}

		return toolCalls;
	}

	/**
	 * Try to parse a JSON string as a tool call and add to array
	 */
	private tryParseToolCall(jsonStr: string, toolCalls: IDSpaceToolCall[]): void {
		try {
			const parsed = JSON.parse(jsonStr);
			if (parsed.name) {
				toolCalls.push({
					id: `local-${Date.now()}-${Math.random().toString(36).substring(7)}`,
					type: 'function',
					function: {
						name: parsed.name,
						arguments: typeof parsed.arguments === 'string'
							? parsed.arguments
							: JSON.stringify(parsed.arguments || {}),
					},
				});
				this.logService.info(`[OfflineModelProvider] Parsed tool call: ${parsed.name}`);
			}
		} catch (e) {
			this.logService.warn('[OfflineModelProvider] Failed to parse tool call:', e);
		}
	}

	/**
	 * Remove thinking blocks from text
	 * Handles both complete <think>...</think> and incomplete blocks
	 */
	private removeThinkingBlocks(text: string, isEndOfStream: boolean = false): string {
		// Remove complete thinking blocks
		let result = text.replace(THINKING_PATTERN, '');

		// If at end of stream, also remove incomplete thinking block
		if (isEndOfStream) {
			result = result.replace(INCOMPLETE_THINKING_PATTERN, '');
		}

		return result;
	}

	/**
	 * Remove tool call tags and thinking blocks from text for clean display
	 */
	private removeToolCallTags(text: string, isEndOfStream: boolean = false): string {
		let result = text.replace(TOOL_CALL_PATTERN, '');

		// Also remove tool calls without closing tag at end of stream
		if (isEndOfStream) {
			result = result.replace(TOOL_CALL_PATTERN_NO_CLOSE, '');
		}

		// Remove thinking blocks
		result = this.removeThinkingBlocks(result, isEndOfStream);

		return result.trim();
	}

	/**
	 * Find the safe text length, avoiding partial special tags
	 * Returns the length up to which it's safe to yield text
	 */
	private findSafeTextLength(text: string): number {
		// Check for partial tags that might be incomplete
		const partialTags = ['<think', '<tool_call', '</think', '</tool_call'];
		let safeLength = text.length;

		for (const tag of partialTags) {
			// Look for partial tag at the end of text
			for (let i = 1; i <= tag.length; i++) {
				const partial = tag.substring(0, i);
				if (text.endsWith(partial)) {
					safeLength = Math.min(safeLength, text.length - i);
					break;
				}
			}
		}

		return safeLength;
	}

	/**
	 * Generate streaming response from local model
	 */
	async *generateStream(
		messages: IDSpaceMessage[],
		tools: IDSpaceTool[],
		token: CancellationToken
	): AsyncIterable<IDSpaceStreamChunk> {
		this.logService.info('[OfflineModelProvider] Starting local inference');

		// Convert messages to local AI format
		const convertedMessages = this.convertMessages(messages, tools);

		// Buffer for accumulating text to detect tool calls and thinking blocks
		let accumulatedText = '';
		let lastYieldedLength = 0;

		try {
			// Stream tokens from local model
			const textStream = this.localAIService.generateText(
				LOCAL_MODEL_ID,
				convertedMessages,
				{
					maxTokens: 2048,
					temperature: 0.7,
					topP: 0.9,
				},
				token
			);

			for await (const chunk of textStream) {
				if (token.isCancellationRequested) {
					break;
				}

				accumulatedText += chunk;

				// Check for complete tool calls in accumulated text
				const toolCalls = this.parseToolCalls(accumulatedText, false);

				if (toolCalls.length > 0) {
					// We found tool calls - yield any text before the tool call tag
					const cleanText = this.removeToolCallTags(accumulatedText, false);
					const newText = cleanText.substring(lastYieldedLength);

					if (newText) {
						yield {
							type: 'text',
							content: newText,
						};
						lastYieldedLength = cleanText.length;
					}

					// Yield the tool calls
					yield {
						type: 'tool_calls',
						toolCalls,
						finishReason: 'tool_calls',
					};

					// Clear the buffer after extracting tool calls
					accumulatedText = '';
					lastYieldedLength = 0;
				} else {
					// No complete tool calls yet - clean text and yield safely
					// Remove complete thinking blocks first
					const cleanedText = this.removeThinkingBlocks(accumulatedText, false);

					// Check for incomplete blocks (currently inside <think> or <tool_call>)
					const incompleteThinkingMatch = INCOMPLETE_THINKING_PATTERN.exec(cleanedText);
					const incompleteToolCallMatch = INCOMPLETE_TOOL_CALL_PATTERN.exec(cleanedText);

					let safeLength: number;

					if (incompleteThinkingMatch) {
						// We're inside a thinking block - don't yield anything after <think>
						safeLength = cleanedText.indexOf('<think');
						if (safeLength < 0) {
							safeLength = 0;
						}
						this.logService.trace('[OfflineModelProvider] Inside incomplete thinking block, safe length:', safeLength);
					} else if (incompleteToolCallMatch) {
						// We're inside a tool_call block - don't yield anything after <tool_call>
						safeLength = cleanedText.indexOf('<tool_call');
						if (safeLength < 0) {
							safeLength = 0;
						}
						this.logService.trace('[OfflineModelProvider] Inside incomplete tool_call block, safe length:', safeLength);
					} else {
						// Check for partial special tags at the end
						safeLength = this.findSafeTextLength(cleanedText);
					}

					if (safeLength > lastYieldedLength) {
						const newText = cleanedText.substring(lastYieldedLength, safeLength);
						if (newText) {
							yield {
								type: 'text',
								content: newText,
							};
							lastYieldedLength = safeLength;
						}
					}
				}
			}

			// Yield any remaining text (end of stream)
			this.logService.info('[OfflineModelProvider] Stream ended, processing remaining text');

			// At end of stream, use isEndOfStream=true for final parsing
			const finalToolCalls = this.parseToolCalls(accumulatedText, true);

			if (finalToolCalls.length > 0) {
				this.logService.info(`[OfflineModelProvider] Found ${finalToolCalls.length} tool call(s) at end of stream`);

				// Clean the text and yield any remaining content before tool calls
				const cleanText = this.removeToolCallTags(accumulatedText, true);
				const newText = cleanText.substring(lastYieldedLength);

				if (newText && newText.trim()) {
					yield {
						type: 'text',
						content: newText,
					};
				}

				// Yield the tool calls
				yield {
					type: 'tool_calls',
					toolCalls: finalToolCalls,
					finishReason: 'tool_calls',
				};
			} else {
				// No tool calls - yield remaining clean text
				const cleanText = this.removeToolCallTags(accumulatedText, true);
				const remainingText = cleanText.substring(lastYieldedLength);

				if (remainingText && remainingText.trim()) {
					yield {
						type: 'text',
						content: remainingText,
					};
				}
			}

			// Yield done
			yield {
				type: 'done',
				finishReason: finalToolCalls.length > 0 ? 'tool_calls' : 'stop',
			};

			this.logService.info('[OfflineModelProvider] Stream completed');
		} catch (error) {
			this.logService.error('[OfflineModelProvider] Error during generation:', error);
			throw error;
		}
	}
}

