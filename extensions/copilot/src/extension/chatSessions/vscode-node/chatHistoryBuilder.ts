/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { URI } from '../../../util/vs/base/common/uri';
import { ChatReferenceBinaryData, ChatRequestTurn2 } from '../../../vscodeTypes';
import { tryParseClaudeModelId } from '../claude/node/claudeModelId';
import { completeToolInvocation, createFormattedToolInvocation } from '../claude/common/toolInvocationFormatter';
import { AssistantMessageContent, ContentBlock, IClaudeCodeSession, ImageBlock, ISubagentSession, StoredMessage, SYNTHETIC_MODEL_ID, TextBlock, ThinkingBlock, ToolResultBlock, ToolUseBlock } from '../claude/node/sessionParser/claudeSessionSchema';

// #region Types

interface ToolContext {
	unprocessedToolCalls: Map<string, ContentBlock>;
	pendingToolInvocations: Map<string, vscode.ChatToolInvocationPart>;
}

// #endregion

// #region Type Guards

function isTextBlock(block: ContentBlock): block is TextBlock {
	return block.type === 'text';
}

function isThinkingBlock(block: ContentBlock): block is ThinkingBlock {
	return block.type === 'thinking';
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
	return block.type === 'tool_use';
}

function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
	return block.type === 'tool_result';
}

function isImageBlock(block: ContentBlock): block is ImageBlock {
	return block.type === 'image';
}

// #endregion

// #region Command Message Helpers

/**
 * Regex patterns for Claude Code slash command XML tags in user message content.
 * These are emitted by the Claude Code CLI when the user runs a local command
 * (e.g., /compact, /init). The messages contain structured XML tags:
 *   - <command-name>/compact</command-name>
 *   - <command-message>compact</command-message>
 *   - <command-args>...</command-args>
 *   - <local-command-stdout>...</local-command-stdout>
 */
const COMMAND_NAME_PATTERN = /<command-name>([\s\S]*?)<\/command-name>/;
const COMMAND_STDOUT_PATTERN = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/;

/**
 * Scans user message contents for slash command patterns and extracts
 * the command name and optional stdout output.
 *
 * Returns undefined if no command patterns are found.
 */
function extractCommandInfo(contents: readonly (string | ContentBlock[])[]): { commandName: string; stdout?: string } | undefined {
	let commandName: string | undefined;
	let stdout: string | undefined;

	for (const content of contents) {
		if (typeof content === 'string') {
			const nameMatch = COMMAND_NAME_PATTERN.exec(content);
			if (nameMatch) {
				commandName ??= nameMatch[1].trim();
			}
			const stdoutMatch = COMMAND_STDOUT_PATTERN.exec(content);
			if (stdoutMatch) {
				stdout ??= stdoutMatch[1].trim();
			}
		} else {
			for (const block of content) {
				if (isTextBlock(block)) {
					const nameMatch = COMMAND_NAME_PATTERN.exec(block.text);
					if (nameMatch) {
						commandName ??= nameMatch[1].trim();
					}
					const stdoutMatch = COMMAND_STDOUT_PATTERN.exec(block.text);
					if (stdoutMatch) {
						stdout ??= stdoutMatch[1].trim();
					}
				}
			}
		}
	}

	if (commandName !== undefined) {
		return { commandName, stdout };
	}
	return undefined;
}

// #endregion

// #region Text Content Helpers

/**
 * Checks if a text block contains a system-reminder tag.
 * System-reminders are stored in separate content blocks and should not be rendered.
 */
function isSystemReminderBlock(text: string): boolean {
	return text.includes('<system-reminder>');
}

/**
 * Strips <system-reminder> tags and their content from a string.
 * Used for backwards compatibility with legacy sessions where system-reminders
 * were concatenated with user text in a single string.
 *
 * TODO: Remove this function after a few releases (added in 0.38.x) once legacy
 * sessions with concatenated system-reminders are no longer common.
 */
function stripSystemReminders(text: string): string {
	return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/g, '');
}

/**
 * Extracts visible text content from a user message, filtering out system reminders.
 */
function extractTextContent(content: string | ContentBlock[]): string {
	if (typeof content === 'string') {
		// TODO: Remove this branch when stripSystemReminders is removed (legacy compat)
		return stripSystemReminders(content);
	}

	// For array content (new format), filter out entire blocks that are system-reminders
	return content
		.filter(isTextBlock)
		.filter(block => !isSystemReminderBlock(block.text))
		.map(block => block.text)
		.join('');
}

// #endregion

// #region Tool Result Processing

/**
 * Processes tool result blocks from a user message, matching them to pending
 * tool invocations and marking them as complete.
 */
function processToolResults(content: string | ContentBlock[], toolContext: ToolContext): void {
	if (typeof content === 'string') {
		return;
	}

	for (const block of content) {
		if (isToolResultBlock(block)) {
			const toolUse = toolContext.unprocessedToolCalls.get(block.tool_use_id);
			if (toolUse && isToolUseBlock(toolUse)) {
				toolContext.unprocessedToolCalls.delete(block.tool_use_id);
				const pendingInvocation = toolContext.pendingToolInvocations.get(block.tool_use_id);
				if (pendingInvocation) {
					pendingInvocation.isComplete = true;
					pendingInvocation.isConfirmed = true;
					pendingInvocation.isError = block.is_error;
					// Populate tool output for display in chat UI
					completeToolInvocation(toolUse, block, pendingInvocation);
					toolContext.pendingToolInvocations.delete(block.tool_use_id);
				}
			}
		}
	}
}

// #endregion

// #region Image Reference Extraction

/**
 * Extracts image blocks from user message contents and converts them to
 * ChatPromptReference objects.
 *
 * - Base64 images become ChatReferenceBinaryData values (binary data for display).
 * - URL images become URI values (the API stored a URL rather than inline data).
 */
function extractImageReferences(contents: readonly (string | ContentBlock[])[]): vscode.ChatPromptReference[] {
	const references: vscode.ChatPromptReference[] = [];
	let imageIndex = 0;
	for (const content of contents) {
		if (typeof content === 'string') {
			continue;
		}
		for (const block of content) {
			if (!isImageBlock(block)) {
				continue;
			}
			const id = `image-${imageIndex + 1}`;
			if (block.source.type === 'base64') {
				const source = block.source;
				// NOTE: The API does not give us any metadata about the image beyond the media type, so
				// we use a generic name and the media type as the MIME type for the binary reference.
				references.push({
					id,
					name: id,
					value: new ChatReferenceBinaryData(
						source.media_type,
						() => Promise.resolve(Buffer.from(source.data, 'base64'))
					),
				});
				imageIndex++;
			} else if (block.source.type === 'url') {
				references.push({
					id,
					name: id,
					value: URI.parse(block.source.url),
				});
				imageIndex++;
			}
		}
	}
	return references;
}

// #endregion

// #region Turn Extraction

/**
 * Extracts a request turn from user message contents, ignoring tool results.
 * Returns undefined if the messages contain only tool results or system reminders.
 */
function extractUserRequest(contents: readonly (string | ContentBlock[])[], messageId: string, modelId: string | undefined): vscode.ChatRequestTurn2 | undefined {
	const textParts: string[] = [];
	for (const content of contents) {
		const text = extractTextContent(content);
		if (text.trim()) {
			textParts.push(text);
		}
	}

	const combinedText = textParts.join('\n\n');
	const imageReferences = extractImageReferences(contents);

	// If no visible text and no images, don't create a request turn
	if (!combinedText.trim() && imageReferences.length === 0) {
		return;
	}

	// If the message indicates it was interrupted, skip it
	if (combinedText === '[Request interrupted by user]') {
		return;
	}

	return new ChatRequestTurn2(combinedText, undefined, imageReferences, '', [], undefined, messageId, modelId, undefined);
}

/**
 * Extracts response parts from consecutive assistant messages.
 */
function extractAssistantParts(messages: readonly AssistantMessageContent[], toolContext: ToolContext): (vscode.ChatResponseMarkdownPart | vscode.ChatResponseThinkingProgressPart | vscode.ChatToolInvocationPart)[] {
	const allParts: (vscode.ChatResponseMarkdownPart | vscode.ChatResponseThinkingProgressPart | vscode.ChatToolInvocationPart)[] = [];

	for (const message of messages) {
		const parts = coalesce(message.content.map(block => {
			if (isTextBlock(block)) {
				return new vscode.ChatResponseMarkdownPart(new vscode.MarkdownString(block.text));
			} else if (isThinkingBlock(block)) {
				return new vscode.ChatResponseThinkingProgressPart(block.thinking);
			} else if (isToolUseBlock(block)) {
				toolContext.unprocessedToolCalls.set(block.id, block);
				const toolInvocation = createFormattedToolInvocation(block);
				if (toolInvocation) {
					toolContext.pendingToolInvocations.set(block.id, toolInvocation);
				}
				return toolInvocation;
			}
		}));
		allParts.push(...parts);
	}

	return allParts;
}

// #endregion

// #region Subagent Tool Extraction

/**
 * Builds a map from parentToolUseId to ISubagentSession for quick lookup.
 */
function buildSubagentMap(subagents: readonly ISubagentSession[]): Map<string, ISubagentSession> {
	const map = new Map<string, ISubagentSession>();
	for (const subagent of subagents) {
		if (subagent.parentToolUseId) {
			map.set(subagent.parentToolUseId, subagent);
		}
	}
	return map;
}

/**
 * Extracts tool invocation parts from a subagent session's messages.
 * These are the tool calls made by the subagent during its execution.
 * Each tool invocation has subAgentInvocationId set to associate it with the parent Task.
 */
function extractSubagentToolParts(
	subagent: ISubagentSession,
	taskToolUseId: string
): vscode.ChatToolInvocationPart[] {
	const toolContext: ToolContext = {
		unprocessedToolCalls: new Map(),
		pendingToolInvocations: new Map()
	};
	const parts: vscode.ChatToolInvocationPart[] = [];

	for (const message of subagent.messages) {
		if (message.type === 'assistant') {
			const assistantContent = message.message as AssistantMessageContent;
			for (const block of assistantContent.content) {
				if (isToolUseBlock(block)) {
					toolContext.unprocessedToolCalls.set(block.id, block);
					const toolInvocation = createFormattedToolInvocation(block, true);
					if (toolInvocation) {
						toolInvocation.subAgentInvocationId = taskToolUseId;
						toolContext.pendingToolInvocations.set(block.id, toolInvocation);
						parts.push(toolInvocation);
					}
				}
			}
		} else if (message.type === 'user') {
			const content = message.message.content;
			if (typeof content !== 'string') {
				processToolResults(content, toolContext);
			}
		}
	}

	return parts;
}

// #endregion

// #region Model ID Resolution

/**
 * Looks ahead from a given index in the message array to find the model ID
 * from the first non-synthetic assistant message. Converts SDK model IDs
 * to endpoint format using {@link tryParseClaudeModelId}.
 *
 * @param messages The session's stored messages
 * @param startIndex The index to start looking from (typically after user messages)
 * @returns The endpoint model ID, or undefined if not found
 */
function findModelIdForRequest(
	messages: readonly StoredMessage[],
	startIndex: number,
): string | undefined {
	for (let j = startIndex; j < messages.length; j++) {
		const msg = messages[j];
		if (msg.type === 'assistant' && msg.message.role === 'assistant') {
			const assistantMsg = msg.message as AssistantMessageContent;
			if (assistantMsg.model && assistantMsg.model !== SYNTHETIC_MODEL_ID) {
				return tryParseClaudeModelId(assistantMsg.model)?.toEndpointModelId() ?? assistantMsg.model;
			}
		}
	}
	return undefined;
}

// #endregion

/**
 * Converts a Claude Code session into VS Code chat history turns.
 *
 * In the Anthropic API, tool results are sent as user messages, so a single
 * agentic turn (assistant calls tools, gets results, calls more tools, etc.)
 * appears as alternating assistant/user messages in the JSONL. VS Code's chat
 * API expects all of that to be a single ChatResponseTurn2, so we accumulate
 * response parts across tool-result boundaries and only finalize a response
 * when we encounter a user message with actual text (a new user request).
 *
 * @param session The Claude Code session to convert
 */
export function buildChatHistory(session: IClaudeCodeSession): (vscode.ChatRequestTurn2 | vscode.ChatResponseTurn2)[] {
	const result: (vscode.ChatRequestTurn2 | vscode.ChatResponseTurn2)[] = [];
	const toolContext: ToolContext = {
		unprocessedToolCalls: new Map(),
		pendingToolInvocations: new Map()
	};
	let i = 0;
	const messages = session.messages;
	let pendingResponseParts: (vscode.ChatResponseMarkdownPart | vscode.ChatResponseThinkingProgressPart | vscode.ChatToolInvocationPart)[] = [];

	// Build a map from parentToolUseId to subagent for quick lookup
	const subagentMap = buildSubagentMap(session.subagents);

	while (i < messages.length) {
		const currentType = messages[i].type;
		const currentMessageId = messages[i].uuid;
		if (currentType === 'user') {
			// Collect all consecutive user messages (preserving the full StoredMessage for metadata)
			const userMessages: StoredMessage[] = [];
			while (i < messages.length && messages[i].type === 'user' && messages[i].message.role === 'user') {
				userMessages.push(messages[i]);
				i++;
			}

			const userContents = userMessages.map(m => m.message.content as string | ContentBlock[]);

			// Always process tool results to update pending tool invocations
			for (const content of userContents) {
				processToolResults(content, toolContext);
			}

			// After processing tool results, inject subagent tool calls for subagents correlated via parentToolUseId.
			// Each subagent's parentToolUseId links it to the Agent or legacy Task tool_use that spawned it.
			// We match tool_result blocks in user messages to those subagents via tool_use_id.
			for (const content of userContents) {
				if (typeof content === 'string') {
					continue;
				}
				for (const block of content) {
					if (isToolResultBlock(block)) {
						const subagent = subagentMap.get(block.tool_use_id);
						if (subagent) {
							const subagentParts = extractSubagentToolParts(subagent, block.tool_use_id);
							pendingResponseParts.push(...subagentParts);
						}
					}
				}
			}

			// Check for slash command patterns (e.g., /compact, /init)
			const commandInfo = extractCommandInfo(userContents);
			const modelId = findModelIdForRequest(messages, i);
			if (commandInfo) {
				// Finalize any pending response first
				if (pendingResponseParts.length > 0) {
					result.push(new vscode.ChatResponseTurn2(pendingResponseParts, {}, ''));
					pendingResponseParts = [];
				}
				// Emit the command as a request turn
				result.push(new ChatRequestTurn2(commandInfo.commandName, undefined, [], '', [], undefined, currentMessageId, modelId, undefined));
				// Emit stdout as a response turn if present
				if (commandInfo.stdout) {
					result.push(new vscode.ChatResponseTurn2(
						[new vscode.ChatResponseMarkdownPart(new vscode.MarkdownString(commandInfo.stdout))],
						{},
						''
					));
				}
			} else {
				// Check if there's actual user text (not just tool results)
				const requestTurn = extractUserRequest(userContents, currentMessageId, modelId);
				if (requestTurn) {
					// Real user message — finalize any pending response first
					if (pendingResponseParts.length > 0) {
						result.push(new vscode.ChatResponseTurn2(pendingResponseParts, {}, ''));
						pendingResponseParts = [];
					}
					result.push(requestTurn);
				}
				// Otherwise this was a tool-result-only message — don't break the response grouping
			}
		} else if (currentType === 'assistant') {
			// Collect all consecutive assistant messages, skipping synthetic ones
			// (e.g., "No response requested." from abort)
			const assistantMessages: AssistantMessageContent[] = [];
			while (i < messages.length && messages[i].type === 'assistant' && messages[i].message.role === 'assistant') {
				const assistantMessage = messages[i].message as AssistantMessageContent;
				if (assistantMessage.model !== SYNTHETIC_MODEL_ID) {
					assistantMessages.push(assistantMessage);
				}
				i++;
			}

			// Accumulate parts into the pending response
			const parts = extractAssistantParts(assistantMessages, toolContext);
			pendingResponseParts.push(...parts);
		} else if (currentType === 'system') {
			// System entries (e.g., "Conversation compacted") are appended as an
			// additional markdown part in the pending response. We don't emit them
			// as a separate ChatResponseTurn2 because the VS Code chat widget
			// merges consecutive response turns without an intervening request,
			// which causes the system text to lose its visual separation.
			const msg = messages[i];
			if (msg.message.role === 'system') {
				const content = (msg.message as { role: 'system'; content: string }).content;
				pendingResponseParts.push(
					new vscode.ChatResponseMarkdownPart(new vscode.MarkdownString(`\n\n---\n\n*${content}*`))
				);
			}
			i++;
		} else {
			// Skip unknown message types
			i++;
		}
	}

	// Finalize any remaining pending response
	if (pendingResponseParts.length > 0) {
		result.push(new vscode.ChatResponseTurn2(pendingResponseParts, {}, ''));
	}

	return result;
}

// #endregion
