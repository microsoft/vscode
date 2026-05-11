/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { stripRedundantCdPrefix } from '../../common/commandLineHelpers.js';
import { IFileEditRecord, ISessionDatabase } from '../../common/sessionDataService.js';
import { ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, buildSubagentSessionUri, type ResponsePart, type StringOrMarkdown, type ToolCallCompletedState, type ToolResultContent, type Turn } from '../../common/state/sessionState.js';
import { getInvocationMessage, getPastTenseMessage, getShellLanguage, getSubagentMetadata, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool, synthesizeSkillToolCall } from '../../node/copilot/copilotToolDisplay.js';
import { buildSessionDbUri } from '../../node/copilot/fileEditTracker.js';
import type { ISessionEvent, ISessionEventMessage, ISessionEventSkillInvoked, ISessionEventSubagentStarted, ISessionEventToolComplete, ISessionEventToolStart } from '../../node/copilot/mapSessionEvents.js';

// =============================================================================
// History-record test fixtures
//
// Flat, declarative DSL used by mock agents and unit tests to build session
// history without manually constructing `Turn[]`. Records mirror the wire
// shape of an SDK event stream — `message`, `tool_start`, `tool_complete`,
// `subagent_started` — so transcripts read like the protocol they're
// emulating.
//
// Production code does NOT depend on this module. The real
// SDK-events-to-Turn[] pipeline in `node/copilot/mapSessionEvents.ts` runs
// in a single pass without producing the intermediate record shape.
// =============================================================================

interface IHistoryRecordBase {
	readonly session: URI;
}

interface IHistoryMessageRecord extends IHistoryRecordBase {
	readonly type: 'message';
	readonly role: 'user' | 'assistant';
	readonly messageId: string;
	readonly content: string;
	readonly toolRequests?: readonly {
		readonly toolCallId: string;
		readonly name: string;
		readonly arguments?: string;
		readonly type?: 'function' | 'custom';
	}[];
	readonly reasoningOpaque?: string;
	readonly reasoningText?: string;
	readonly encryptedContent?: string;
	readonly parentToolCallId?: string;
}

export interface IHistoryToolStartRecord extends IHistoryRecordBase {
	readonly type: 'tool_start';
	readonly toolCallId: string;
	readonly toolName: string;
	readonly displayName: string;
	readonly invocationMessage: StringOrMarkdown;
	readonly toolInput?: string;
	readonly toolKind?: 'terminal' | 'subagent' | 'search';
	readonly language?: string;
	readonly toolArguments?: string;
	readonly subagentAgentName?: string;
	readonly subagentDescription?: string;
	readonly mcpServerName?: string;
	readonly mcpToolName?: string;
	readonly parentToolCallId?: string;
}

interface IHistoryToolCompleteRecord extends IHistoryRecordBase {
	readonly type: 'tool_complete';
	readonly toolCallId: string;
	readonly result: {
		readonly success: boolean;
		readonly pastTenseMessage: StringOrMarkdown;
		readonly content?: ToolResultContent[];
		readonly error?: { readonly message: string; readonly code?: string };
	};
	readonly isUserRequested?: boolean;
	readonly toolTelemetry?: string;
	readonly parentToolCallId?: string;
}

interface IHistorySubagentStartedRecord extends IHistoryRecordBase {
	readonly type: 'subagent_started';
	readonly toolCallId: string;
	readonly agentName: string;
	readonly agentDisplayName: string;
	readonly agentDescription?: string;
}

/** Test fixture record. Hand-constructed by tests to seed mock session histories. */
export type IHistoryRecord =
	| IHistoryMessageRecord
	| IHistoryToolStartRecord
	| IHistoryToolCompleteRecord
	| IHistorySubagentStartedRecord;

function extractSubagentMeta(start: IHistoryToolStartRecord | undefined): { subagentDescription?: string; subagentAgentName?: string } {
	if (!start) {
		return {};
	}
	return {
		subagentDescription: start.subagentDescription,
		subagentAgentName: start.subagentAgentName,
	};
}

/**
 * Builds a parent session's {@link Turn}s from a flat list of history
 * records.
 *
 * Each `user` message starts a new turn. Inner subagent records (those
 * carrying `parentToolCallId`) are skipped — see
 * {@link buildSubagentTurnsFromHistory}.
 */
export function buildTurnsFromHistory(messages: readonly IHistoryRecord[]): Turn[] {
	const turns: Turn[] = [];
	const subagentsByToolCallId = new Map<string, IHistorySubagentStartedRecord>();
	let currentTurn: {
		id: string;
		userMessage: { text: string };
		responseParts: ResponsePart[];
		pendingTools: Map<string, IHistoryToolStartRecord>;
	} | undefined;

	const finalizeTurn = (turn: NonNullable<typeof currentTurn>, state: TurnState): void => {
		turns.push({
			id: turn.id,
			userMessage: turn.userMessage,
			responseParts: turn.responseParts,
			usage: undefined,
			state,
		});
	};

	const startTurn = (id: string, text: string): NonNullable<typeof currentTurn> => ({
		id,
		userMessage: { text },
		responseParts: [],
		pendingTools: new Map(),
	});

	for (const msg of messages) {
		if (msg.type === 'message' && msg.role === 'user') {
			if (currentTurn) {
				finalizeTurn(currentTurn, TurnState.Cancelled);
			}
			currentTurn = startTurn(msg.messageId, msg.content);
		} else if (msg.type === 'message' && msg.role === 'assistant') {
			if (msg.parentToolCallId) {
				continue;
			}
			if (!currentTurn) {
				currentTurn = startTurn(msg.messageId, '');
			}
			if (msg.reasoningText) {
				currentTurn.responseParts.push({
					kind: ResponsePartKind.Reasoning,
					id: generateUuid(),
					content: msg.reasoningText,
				});
			}
			if (msg.content) {
				currentTurn.responseParts.push({
					kind: ResponsePartKind.Markdown,
					id: generateUuid(),
					content: msg.content,
				});
			}
			if (!msg.toolRequests || msg.toolRequests.length === 0) {
				finalizeTurn(currentTurn, TurnState.Complete);
				currentTurn = undefined;
			}
		} else if (msg.type === 'subagent_started') {
			subagentsByToolCallId.set(msg.toolCallId, msg);
		} else if (msg.type === 'tool_start') {
			if (msg.parentToolCallId) {
				continue;
			}
			currentTurn?.pendingTools.set(msg.toolCallId, msg);
		} else if (msg.type === 'tool_complete') {
			if (msg.parentToolCallId) {
				continue;
			}
			if (currentTurn) {
				const start = currentTurn.pendingTools.get(msg.toolCallId);
				currentTurn.pendingTools.delete(msg.toolCallId);

				const subagentEvent = subagentsByToolCallId.get(msg.toolCallId);
				const contentWithSubagent = msg.result.content ? [...msg.result.content] : [];
				if (subagentEvent) {
					const parentSessionStr = msg.session.toString();
					contentWithSubagent.push({
						type: ToolResultContentType.Subagent,
						resource: buildSubagentSessionUri(parentSessionStr, msg.toolCallId),
						title: subagentEvent.agentDisplayName,
						agentName: subagentEvent.agentName,
						description: subagentEvent.agentDescription,
					});
				}

				const tc: ToolCallCompletedState = {
					status: ToolCallStatus.Completed,
					toolCallId: msg.toolCallId,
					toolName: start?.toolName ?? 'unknown',
					displayName: start?.displayName ?? 'Unknown Tool',
					invocationMessage: start?.invocationMessage ?? 'Unknown tool',
					toolInput: start?.toolInput,
					success: msg.result.success,
					pastTenseMessage: msg.result.pastTenseMessage,
					content: contentWithSubagent.length > 0 ? contentWithSubagent : undefined,
					error: msg.result.error,
					confirmed: ToolCallConfirmationReason.NotNeeded,
					_meta: {
						toolKind: start?.toolKind,
						language: start?.language,
						...extractSubagentMeta(start),
					},
				};
				currentTurn.responseParts.push({
					kind: ResponsePartKind.ToolCall,
					toolCall: tc,
				});
			}
		}
	}

	if (currentTurn) {
		finalizeTurn(currentTurn, TurnState.Cancelled);
	}

	return turns;
}

/**
 * Builds the {@link Turn}s for a subagent child session by filtering the
 * parent's history for records carrying the matching `parentToolCallId`.
 * Returns a single turn containing all inner tool calls and assistant
 * messages.
 */
export function buildSubagentTurnsFromHistory(
	parentMessages: readonly IHistoryRecord[],
	parentToolCallId: string,
	childSessionUri: string,
): Turn[] {
	const innerToolCallIds = new Set<string>();
	for (const msg of parentMessages) {
		if ((msg.type === 'tool_start' || msg.type === 'tool_complete') && msg.parentToolCallId === parentToolCallId) {
			innerToolCallIds.add(msg.toolCallId);
		}
	}

	const subagentsByToolCallId = new Map<string, IHistorySubagentStartedRecord>();
	for (const msg of parentMessages) {
		if (msg.type === 'subagent_started' && innerToolCallIds.has(msg.toolCallId)) {
			subagentsByToolCallId.set(msg.toolCallId, msg);
		}
	}

	const innerMessages = parentMessages.filter(msg => {
		if (msg.type === 'tool_start' || msg.type === 'tool_complete') {
			return msg.parentToolCallId === parentToolCallId;
		}
		if (msg.type === 'message') {
			return msg.parentToolCallId === parentToolCallId;
		}
		return false;
	});

	if (innerMessages.length === 0) {
		return [];
	}

	const responseParts: ResponsePart[] = [];
	const pendingTools = new Map<string, IHistoryToolStartRecord>();

	for (const msg of innerMessages) {
		if (msg.type === 'tool_start') {
			pendingTools.set(msg.toolCallId, msg);
		} else if (msg.type === 'tool_complete') {
			const start = pendingTools.get(msg.toolCallId);
			pendingTools.delete(msg.toolCallId);

			const subagentEvent = subagentsByToolCallId.get(msg.toolCallId);
			const contentWithSubagent = msg.result.content ? [...msg.result.content] : [];
			if (subagentEvent) {
				contentWithSubagent.push({
					type: ToolResultContentType.Subagent,
					resource: buildSubagentSessionUri(childSessionUri, msg.toolCallId),
					title: subagentEvent.agentDisplayName,
					agentName: subagentEvent.agentName,
					description: subagentEvent.agentDescription,
				});
			}

			const tc: ToolCallCompletedState = {
				status: ToolCallStatus.Completed,
				toolCallId: msg.toolCallId,
				toolName: start?.toolName ?? 'unknown',
				displayName: start?.displayName ?? 'Unknown Tool',
				invocationMessage: start?.invocationMessage ?? 'Unknown tool',
				toolInput: start?.toolInput,
				success: msg.result.success,
				pastTenseMessage: msg.result.pastTenseMessage,
				content: contentWithSubagent.length > 0 ? contentWithSubagent : undefined,
				error: msg.result.error,
				confirmed: ToolCallConfirmationReason.NotNeeded,
				_meta: {
					toolKind: start?.toolKind,
					language: start?.language,
					...extractSubagentMeta(start),
				},
			};
			responseParts.push({
				kind: ResponsePartKind.ToolCall,
				toolCall: tc,
			});
		} else if (msg.type === 'message' && msg.role === 'assistant') {
			if (msg.reasoningText) {
				responseParts.push({
					kind: ResponsePartKind.Reasoning,
					id: generateUuid(),
					content: msg.reasoningText,
				});
			}
			if (msg.content) {
				responseParts.push({
					kind: ResponsePartKind.Markdown,
					id: generateUuid(),
					content: msg.content,
				});
			}
		}
	}

	if (responseParts.length === 0) {
		return [];
	}

	return [{
		id: generateUuid(),
		userMessage: { text: '' },
		responseParts,
		usage: undefined,
		state: TurnState.Complete,
	}];
}

// =============================================================================
// SDK-events-to-history-records (test fixture loader)
//
// Translates raw Copilot SDK session events into a flat IHistoryRecord
// stream. This is the test-side equivalent of the production single-pass
// `mapSessionEvents` (which goes directly to Turn[]). It exists so JSONL
// fixtures captured from real `~/.copilot/session-state/` files can be
// loaded into the test DSL without forcing tests to also adopt Turn[].
// =============================================================================

function tryStringify(value: unknown): string | undefined {
	try {
		return JSON.stringify(value);
	} catch {
		return undefined;
	}
}

function isSyntheticUserMessage(event: ISessionEvent): boolean {
	if (event.type !== 'user.message') {
		return false;
	}
	const source = (event as ISessionEventMessage).data?.source;
	return !!source && source.toLowerCase() !== 'user';
}

/**
 * Maps raw SDK session events into a flat list of {@link IHistoryRecord}s,
 * restoring stored file-edit metadata from the session database when
 * available. Test-fixture-only.
 */
export async function mapSessionEventsToHistoryRecords(
	session: URI,
	db: ISessionDatabase | undefined,
	events: readonly ISessionEvent[],
	workingDirectory?: URI,
): Promise<IHistoryRecord[]> {
	const result: IHistoryRecord[] = [];
	const toolInfoByCallId = new Map<string, { toolName: string; parameters: Record<string, unknown> | undefined; rewrittenArgs?: string }>();
	const editToolCallIds: string[] = [];

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
			const rewrittenArgs = stripRedundantCdPrefix(d.toolName, parameters, workingDirectory) ? tryStringify(parameters) : undefined;
			toolInfoByCallId.set(d.toolCallId, { toolName: d.toolName, parameters, rewrittenArgs });
			if (isEditTool(d.toolName)) {
				editToolCallIds.push(d.toolCallId);
			}
		}
	}

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
		} catch {
			// Database may not exist yet — that's fine.
		}
	}

	const sessionUriStr = session.toString();

	for (const e of events) {
		if (e.type === 'assistant.message' || e.type === 'user.message') {
			if (isSyntheticUserMessage(e)) {
				continue;
			}
			const d = (e as ISessionEventMessage).data;
			result.push({
				session,
				type: 'message',
				role: e.type === 'user.message' ? 'user' : 'assistant',
				messageId: d?.messageId ?? d?.interactionId ?? '',
				content: d?.content ?? '',
				toolRequests: d?.toolRequests?.map(tr => ({
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
			const toolArgs = info?.rewrittenArgs ?? (d.arguments !== undefined ? tryStringify(d.arguments) : undefined);
			const subagentMeta = toolKind === 'subagent' ? getSubagentMetadata(info?.parameters) : undefined;
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
				subagentAgentName: subagentMeta?.agentName,
				subagentDescription: subagentMeta?.description,
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
			const content: ToolResultContent[] = [];
			if (toolOutput !== undefined) {
				content.push({ type: ToolResultContentType.Text, text: toolOutput });
			}
			const edits = storedEdits?.get(d.toolCallId);
			if (edits) {
				for (const edit of edits) {
					const beforeUri = edit.kind === 'rename' && edit.originalPath
						? URI.file(edit.originalPath).toString()
						: URI.file(edit.filePath).toString();
					const afterUri = URI.file(edit.filePath).toString();
					const hasBefore = edit.kind !== 'create';
					const hasAfter = edit.kind !== 'delete';
					content.push({
						type: ToolResultContentType.FileEdit,
						before: hasBefore ? {
							uri: beforeUri,
							content: { uri: buildSessionDbUri(sessionUriStr, edit.toolCallId, edit.filePath, 'before') },
						} : undefined,
						after: hasAfter ? {
							uri: afterUri,
							content: { uri: buildSessionDbUri(sessionUriStr, edit.toolCallId, edit.filePath, 'after') },
						} : undefined,
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
		} else if (e.type === 'subagent.started') {
			const d = (e as ISessionEventSubagentStarted).data;
			result.push({
				session,
				type: 'subagent_started',
				toolCallId: d.toolCallId,
				agentName: d.agentName,
				agentDisplayName: d.agentDisplayName,
				agentDescription: d.agentDescription,
			});
		} else if (e.type === 'skill.invoked') {
			const skillEvent = e as ISessionEventSkillInvoked;
			const synth = synthesizeSkillToolCall(skillEvent.data, skillEvent.id);
			result.push(
				{ session, type: 'tool_start', toolCallId: synth.toolCallId, toolName: synth.toolName, displayName: synth.displayName, invocationMessage: synth.invocationMessage },
				{ session, type: 'tool_complete', toolCallId: synth.toolCallId, result: { success: true, pastTenseMessage: synth.pastTenseMessage } },
			);
		}
	}

	return result;
}
