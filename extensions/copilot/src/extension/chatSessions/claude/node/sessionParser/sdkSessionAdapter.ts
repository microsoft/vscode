/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * SDK Session Adapter
 *
 * Thin conversion layer between the `@anthropic-ai/claude-agent-sdk` session APIs
 * and our internal types (`IClaudeCodeSessionInfo`, `IClaudeCodeSession`, `StoredMessage`).
 *
 * The SDK provides:
 * - `listSessions()` / `getSessionInfo()` → `SDKSessionInfo`
 * - `getSessionMessages()` → `SessionMessage[]`
 *
 * This adapter converts those into the shapes consumed by `chatHistoryBuilder.ts`
 * and `claudeChatSessionContentProvider.ts` without any JSONL parsing.
 */

import type { SDKSessionInfo, SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import {
	AssistantMessageContent,
	IClaudeCodeSession,
	IClaudeCodeSessionInfo,
	ISubagentSession,
	StoredMessage,
	UserMessageContent,
	vAssistantMessageContent,
	vUserMessageContent,
} from './claudeSessionSchema';

// #region Label Helpers

/**
 * Strips `<system-reminder>` tags and their content from a string.
 * The SDK includes raw system-reminder blocks in `summary` and `firstPrompt` fields.
 */
function stripSystemReminders(text: string): string {
	return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/g, '').trim();
}

/**
 * Computes a clean display label from SDK session info.
 * Priority: customTitle > stripped summary > stripped firstPrompt > fallback.
 */
function computeSessionLabel(info: SDKSessionInfo): string {
	if (info.customTitle) {
		return info.customTitle;
	}

	const summary = info.summary ? stripSystemReminders(info.summary) : '';
	if (summary) {
		return truncateLabel(summary);
	}

	const firstPrompt = info.firstPrompt ? stripSystemReminders(info.firstPrompt) : '';
	if (firstPrompt) {
		return truncateLabel(firstPrompt);
	}

	return 'Claude Session';
}

const MAX_LABEL_LENGTH = 50;

function truncateLabel(text: string): string {
	const singleLine = text.replace(/\s+/g, ' ');
	if (singleLine.length <= MAX_LABEL_LENGTH) {
		return singleLine;
	}
	return singleLine.slice(0, MAX_LABEL_LENGTH) + '…';
}

// #endregion

// #region SDKSessionInfo → IClaudeCodeSessionInfo

/**
 * Converts an `SDKSessionInfo` (from `listSessions` / `getSessionInfo`) into
 * the lightweight `IClaudeCodeSessionInfo` used by the session list UI.
 */
export function sdkSessionInfoToSessionInfo(
	info: SDKSessionInfo,
	folderName?: string,
): IClaudeCodeSessionInfo {
	return {
		id: info.sessionId,
		label: computeSessionLabel(info),
		created: info.createdAt ?? info.lastModified,
		lastRequestEnded: info.lastModified,
		folderName,
		cwd: info.cwd,
		gitBranch: info.gitBranch,
	};
}

// #endregion

// #region SessionMessage → StoredMessage

/**
 * Converts an array of `SessionMessage` (from `getSessionMessages`) into
 * `StoredMessage[]` compatible with `chatHistoryBuilder.ts`.
 *
 * Uses existing validators (`vUserMessageContent`, `vAssistantMessageContent`)
 * to narrow the `message: unknown` field into typed content.
 *
 * Messages that fail validation are silently skipped — this matches the parser
 * behavior of ignoring malformed JSONL entries.
 */
export function sdkSessionMessagesToStoredMessages(
	messages: readonly SessionMessage[],
): StoredMessage[] {
	const result: StoredMessage[] = [];

	for (const msg of messages) {
		const stored = sdkSessionMessageToStoredMessage(msg);
		if (stored) {
			result.push(stored);
		}
	}

	return result;
}

function sdkSessionMessageToStoredMessage(
	msg: SessionMessage,
): StoredMessage | undefined {
	if (msg.type === 'user') {
		const validated = vUserMessageContent.validate(msg.message);
		if (validated.error) {
			return undefined;
		}
		return {
			uuid: msg.uuid,
			sessionId: msg.session_id,
			timestamp: new Date(0),
			parentUuid: null,
			type: 'user',
			message: validated.content as UserMessageContent,
		};
	}

	if (msg.type === 'assistant') {
		const validated = vAssistantMessageContent.validate(msg.message);
		if (validated.error) {
			return undefined;
		}
		return {
			uuid: msg.uuid,
			sessionId: msg.session_id,
			timestamp: new Date(0),
			parentUuid: null,
			type: 'assistant',
			message: validated.content as AssistantMessageContent,
		};
	}

	return undefined;
}

// #endregion

// #region Subagent Session Building

function extractParentToolUseId(messages: readonly SessionMessage[]): string | undefined {
	for (const msg of messages) {
		if (msg.type !== 'assistant' || msg.message === null || typeof msg.message !== 'object') {
			continue;
		}
		if ('parent_tool_use_id' in msg.message) {
			const id = msg.message.parent_tool_use_id;
			if (typeof id === 'string') {
				return id;
			}
		}
	}
	return undefined;
}

/**
 * Converts SDK `SessionMessage[]` (from `getSubagentMessages`) into an
 * `ISubagentSession` for display in the chat history.
 *
 * Extracts `parent_tool_use_id` from the first assistant message that
 * contains one, to link the subagent back to its spawning Agent tool_use
 * in the parent session.
 */
export function sdkSubagentMessagesToSubagentSession(
	agentId: string,
	messages: readonly SessionMessage[],
): ISubagentSession | null {
	const storedMessages = sdkSessionMessagesToStoredMessages(messages);
	if (storedMessages.length === 0) {
		return null;
	}

	return {
		agentId,
		parentToolUseId: extractParentToolUseId(messages),
		messages: storedMessages,
		timestamp: storedMessages[storedMessages.length - 1].timestamp,
	};
}

// #endregion

// #region Full Session Assembly

/**
 * Assembles a full `IClaudeCodeSession` from SDK data and separately-loaded subagents.
 */
export function buildClaudeCodeSession(
	info: SDKSessionInfo,
	messages: readonly SessionMessage[],
	subagents: readonly ISubagentSession[],
	folderName?: string,
): IClaudeCodeSession {
	const sessionInfo = sdkSessionInfoToSessionInfo(info, folderName);
	const storedMessages = sdkSessionMessagesToStoredMessages(messages);

	return {
		...sessionInfo,
		messages: storedMessages,
		subagents,
	};
}

// #endregion
