/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IAgentMessageEvent, IAgentToolCompleteEvent, IAgentToolStartEvent } from '../../common/agentService.js';
import { IFileEditRecord, ISessionDatabase } from '../../common/sessionDataService.js';
import { ToolResultContentType, type IToolResultContent } from '../../common/state/sessionState.js';
import { getInvocationMessage, getPastTenseMessage, getShellLanguage, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool } from './copilotToolDisplay.js';
import { buildSessionDbUri } from './fileEditTracker.js';

function tryStringify(value: unknown): string | undefined {
	try {
		return JSON.stringify(value);
	} catch {
		return undefined;
	}
}

// ---- Minimal event shapes matching the SDK's SessionEvent union ---------
// Defined here so tests can construct events without importing the SDK.

export interface ISessionEventToolStart {
	type: 'tool.execution_start';
	data: {
		toolCallId: string;
		toolName: string;
		arguments?: unknown;
		mcpServerName?: string;
		mcpToolName?: string;
		parentToolCallId?: string;
	};
}

export interface ISessionEventToolComplete {
	type: 'tool.execution_complete';
	data: {
		toolCallId: string;
		success: boolean;
		result?: { content?: string };
		error?: { message: string; code?: string };
		isUserRequested?: boolean;
		toolTelemetry?: unknown;
		parentToolCallId?: string;
	};
}

export interface ISessionEventMessage {
	type: 'assistant.message' | 'user.message';
	data?: {
		messageId?: string;
		interactionId?: string;
		content?: string;
		toolRequests?: readonly { toolCallId: string; name: string; arguments?: unknown; type?: 'function' | 'custom' }[];
		reasoningOpaque?: string;
		reasoningText?: string;
		encryptedContent?: string;
		parentToolCallId?: string;
	};
}

/** Minimal event shape for session history mapping. */
export type ISessionEvent = ISessionEventToolStart | ISessionEventToolComplete | ISessionEventMessage | { type: string; data?: unknown };

/**
 * Maps raw SDK session events into agent protocol events, restoring
 * stored file-edit metadata from the session database when available.
 *
 * Extracted as a standalone function so it can be tested without the
 * full CopilotAgent or SDK dependencies.
 */
export async function mapSessionEvents(
	session: URI,
	db: ISessionDatabase | undefined,
	events: readonly ISessionEvent[],
): Promise<(IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[]> {
	const result: (IAgentMessageEvent | IAgentToolStartEvent | IAgentToolCompleteEvent)[] = [];
	const toolInfoByCallId = new Map<string, { toolName: string; parameters: Record<string, unknown> | undefined }>();

	// Collect all tool call IDs for edit tools so we can batch-query the database
	const editToolCallIds: string[] = [];

	// First pass: collect tool info and identify edit tool calls
	for (const e of events) {
		if (e.type === 'tool.execution_start') {
			const d = (e as ISessionEventToolStart).data;
			if (isHiddenTool(d.toolName)) {
				continue;
			}
			const toolArgs = d.arguments !== undefined ? tryStringify(d.arguments) : undefined;
			let parameters: Record<string, unknown> | undefined;
			if (toolArgs) {
				try { parameters = JSON.parse(toolArgs) as Record<string, unknown>; } catch { /* ignore */ }
			}
			toolInfoByCallId.set(d.toolCallId, { toolName: d.toolName, parameters });
			if (isEditTool(d.toolName)) {
				editToolCallIds.push(d.toolCallId);
			}
		}
	}

	// Query the database for stored file edits (metadata only)
	let storedEdits: Map<string, IFileEditRecord[]> | undefined;
	if (db && editToolCallIds.length > 0) {
		try {
			const records = await db.getFileEdits(editToolCallIds);
			if (records.length > 0) {
				storedEdits = new Map();
				for (const r of records) {
					let list = storedEdits.get(r.toolCallId);
					if (!list) {
						list = [];
						storedEdits.set(r.toolCallId, list);
					}
					list.push(r);
				}
			}
		} catch (_e) {
			// Database may not exist yet for new sessions — that's fine
		}
	}

	const sessionUriStr = session.toString();

	// Second pass: build result events
	for (const e of events) {
		if (e.type === 'assistant.message' || e.type === 'user.message') {
			const d = (e as ISessionEventMessage).data;
			result.push({
				session,
				type: 'message',
				role: e.type === 'user.message' ? 'user' : 'assistant',
				messageId: d?.messageId ?? d?.interactionId ?? '',
				content: d?.content ?? '',
				toolRequests: d?.toolRequests?.map((tr) => ({
					toolCallId: tr.toolCallId,
					name: tr.name,
					arguments: tr.arguments !== undefined ? tryStringify(tr.arguments) : undefined,
					type: tr.type,
				})),
				reasoningOpaque: d?.reasoningOpaque,
				reasoningText: d?.reasoningText,
				encryptedContent: d?.encryptedContent,
				parentToolCallId: d?.parentToolCallId,
			});
		} else if (e.type === 'tool.execution_start') {
			const d = (e as ISessionEventToolStart).data;
			if (isHiddenTool(d.toolName)) {
				continue;
			}
			const info = toolInfoByCallId.get(d.toolCallId);
			const displayName = getToolDisplayName(d.toolName);
			const toolKind = getToolKind(d.toolName);
			const toolArgs = d.arguments !== undefined ? tryStringify(d.arguments) : undefined;
			result.push({
				session,
				type: 'tool_start',
				toolCallId: d.toolCallId,
				toolName: d.toolName,
				displayName,
				invocationMessage: getInvocationMessage(d.toolName, displayName, info?.parameters),
				toolInput: getToolInputString(d.toolName, info?.parameters, toolArgs),
				toolKind,
				language: toolKind === 'terminal' ? getShellLanguage(d.toolName) : undefined,
				toolArguments: toolArgs,
				mcpServerName: d.mcpServerName,
				mcpToolName: d.mcpToolName,
				parentToolCallId: d.parentToolCallId,
			});
		} else if (e.type === 'tool.execution_complete') {
			const d = (e as ISessionEventToolComplete).data;
			const info = toolInfoByCallId.get(d.toolCallId);
			if (!info) {
				continue;
			}
			toolInfoByCallId.delete(d.toolCallId);
			const displayName = getToolDisplayName(info.toolName);
			const toolOutput = d.error?.message ?? d.result?.content;
			const content: IToolResultContent[] = [];
			if (toolOutput !== undefined) {
				content.push({ type: ToolResultContentType.Text, text: toolOutput });
			}

			// Restore file edit content references from the database
			const edits = storedEdits?.get(d.toolCallId);
			if (edits) {
				for (const edit of edits) {
					content.push({
						type: ToolResultContentType.FileEdit,
						beforeURI: buildSessionDbUri(sessionUriStr, edit.toolCallId, edit.filePath, 'before'),
						afterURI: buildSessionDbUri(sessionUriStr, edit.toolCallId, edit.filePath, 'after'),
						diff: (edit.addedLines !== undefined || edit.removedLines !== undefined)
							? { added: edit.addedLines, removed: edit.removedLines }
							: undefined,
					});
				}
			}

			result.push({
				session,
				type: 'tool_complete',
				toolCallId: d.toolCallId,
				result: {
					success: d.success,
					pastTenseMessage: getPastTenseMessage(info.toolName, displayName, info.parameters, d.success),
					content: content.length > 0 ? content : undefined,
					error: d.error,
				},
				isUserRequested: d.isUserRequested,
				toolTelemetry: d.toolTelemetry !== undefined ? tryStringify(d.toolTelemetry) : undefined,
				parentToolCallId: d.parentToolCallId,
			});
		}
	}
	return result;
}
