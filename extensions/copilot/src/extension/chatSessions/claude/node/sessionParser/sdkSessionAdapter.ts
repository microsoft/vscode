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
		cwd: info.cwd
	};
}

// #endregion

// #region SessionMessage → StoredMessage

/**
 * A map from user message UUID to the agentId of the subagent spawned by
 * a Task tool result in that message. Extracted from raw JSONL `toolUseResult.agentId`
 * during subagent discovery (since the SDK's `getSessionMessages` strips this field).
 */
export type SubagentCorrelationMap = ReadonlyMap<string, string>;

/**
 * Converts an array of `SessionMessage` (from `getSessionMessages`) into
 * `StoredMessage[]` compatible with `chatHistoryBuilder.ts`.
 *
 * Uses existing validators (`vUserMessageContent`, `vAssistantMessageContent`)
 * to narrow the `message: unknown` field into typed content.
 *
 * Messages that fail validation are silently skipped — this matches the parser
 * behavior of ignoring malformed JSONL entries.
 *
 * @param messages SDK session messages
 * @param subagentCorrelation Optional map from user message UUID → subagent agentId,
 *   used to set `toolUseResultAgentId` for subagent tool nesting in the chat UI.
 */
export function sdkSessionMessagesToStoredMessages(
	messages: readonly SessionMessage[],
	subagentCorrelation?: SubagentCorrelationMap,
): StoredMessage[] {
	const result: StoredMessage[] = [];

	for (const msg of messages) {
		const stored = sdkSessionMessageToStoredMessage(msg, subagentCorrelation);
		if (stored) {
			result.push(stored);
		}
	}

	return result;
}

function sdkSessionMessageToStoredMessage(
	msg: SessionMessage,
	subagentCorrelation?: SubagentCorrelationMap,
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
			toolUseResultAgentId: subagentCorrelation?.get(msg.uuid),
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

// #region Full Session Assembly

/**
 * Assembles a full `IClaudeCodeSession` from SDK data and separately-loaded subagents.
 *
 * @param info Session metadata from the SDK
 * @param messages Session transcript from the SDK
 * @param subagents Subagent sessions loaded from raw JSONL (SDK doesn't expose these)
 * @param subagentCorrelation Map from user message UUID → subagent agentId for nesting
 * @param folderName Optional workspace folder name for badge display
 */
export function buildClaudeCodeSession(
	info: SDKSessionInfo,
	messages: readonly SessionMessage[],
	subagents: readonly ISubagentSession[],
	subagentCorrelation?: SubagentCorrelationMap,
	folderName?: string,
): IClaudeCodeSession {
	const sessionInfo = sdkSessionInfoToSessionInfo(info, folderName);
	const storedMessages = sdkSessionMessagesToStoredMessages(messages, subagentCorrelation);

	return {
		...sessionInfo,
		messages: storedMessages,
		subagents,
	};
}

// #endregion
