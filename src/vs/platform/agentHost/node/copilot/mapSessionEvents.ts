/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { stripRedundantCdPrefix } from '../../common/commandLineHelpers.js';
import { IFileEditRecord, ISessionDatabase } from '../../common/sessionDataService.js';
import { ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, buildSubagentSessionUri, type ResponsePart, type StringOrMarkdown, type ToolCallCompletedState, type ToolResultContent, type Turn } from '../../common/state/sessionState.js';
import { getInvocationMessage, getPastTenseMessage, getShellLanguage, getSubagentMetadata, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool, synthesizeSkillToolCall } from './copilotToolDisplay.js';
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
		/**
		 * Origin of this message. The SDK sets this to a non-`'user'` value
		 * (e.g. `'skill-pdf'`) for messages it injects on behalf of a skill or
		 * other internal mechanism. We filter those out so they don't render
		 * as user turns.
		 */
		source?: string;
	};
}

/** Minimal event shape for `skill.invoked`, used to synthesize a tool-style render. */
export interface ISessionEventSkillInvoked {
	type: 'skill.invoked';
	id?: string;
	data: {
		name: string;
		path?: string;
		description?: string;
	};
}

export interface ISessionEventSubagentStarted {
	type: 'subagent.started';
	data: {
		toolCallId: string;
		agentName: string;
		agentDisplayName: string;
		agentDescription: string;
	};
}

/** Minimal event shape for session history mapping. */
export type ISessionEvent =
	| ISessionEventToolStart
	| ISessionEventToolComplete
	| ISessionEventMessage
	| ISessionEventSubagentStarted
	| ISessionEventSkillInvoked
	| { type: string; data?: unknown };

/**
 * Returns true if the event is a SDK-injected `user.message` that should not
 * be shown to the user (e.g. skill-content injection).
 *
 * The SDK marks these via a non-`'user'` `source` field. Older sessions
 * persisted before `source` existed will not be filtered; that is accepted
 * leakage rather than guessed-at content sniffing.
 */
function isSyntheticUserMessage(event: ISessionEvent): boolean {
	if (event.type !== 'user.message') {
		return false;
	}
	const source = (event as ISessionEventMessage).data?.source;
	return !!source && source.toLowerCase() !== 'user';
}

// =============================================================================
// Single-pass turn builder
// =============================================================================

/** Per-tool-call info captured from `tool.execution_start` and reused at `tool.execution_complete`. */
interface IToolStartInfo {
	readonly toolName: string;
	readonly displayName: string;
	readonly invocationMessage: StringOrMarkdown;
	readonly toolInput?: string;
	readonly toolKind?: 'terminal' | 'subagent';
	readonly language?: string;
	readonly subagentAgentName?: string;
	readonly subagentDescription?: string;
	readonly parameters: Record<string, unknown> | undefined;
	readonly parentToolCallId?: string;
}

/** Subagent metadata seen via `subagent.started`, applied to the parent tool call's content at `tool.execution_complete`. */
interface ISubagentInfo {
	readonly agentName: string;
	readonly agentDisplayName: string;
	readonly agentDescription?: string;
}

/**
 * Mutable per-turn state used while iterating events. The parent session
 * has one builder; each subagent turn (one per `parentToolCallId`) has its
 * own builder so inner events route there directly.
 */
interface ITurnBuilder {
	readonly id: string;
	readonly userMessage: { text: string };
	readonly responseParts: ResponsePart[];
	/** Tool starts seen but not yet completed in this turn, keyed by toolCallId. */
	readonly pendingTools: Map<string, IToolStartInfo>;
}

function newTurnBuilder(id: string, text: string): ITurnBuilder {
	return { id, userMessage: { text }, responseParts: [], pendingTools: new Map() };
}

function finalizeTurn(builder: ITurnBuilder, state: TurnState): Turn {
	return {
		id: builder.id,
		userMessage: builder.userMessage,
		responseParts: builder.responseParts,
		usage: undefined,
		state,
	};
}

/**
 * Maps raw SDK session events directly into agent-protocol {@link Turn}s
 * for the parent session and any subagent child sessions, restoring stored
 * file-edit metadata from the session database when available.
 *
 * Subagent inner events are routed to per-`parentToolCallId` turn builders
 * so they appear under their own session view rather than polluting the
 * parent transcript. Each subagent's tool calls are returned via
 * {@link mapSessionEventsToTurns.subagentTurnsByToolCallId} so callers can
 * expose `getSubagentMessages` cheaply.
 *
 * If `workingDirectory` is provided, redundant `cd <workingDirectory> &&`
 * (or PowerShell equivalent) prefixes are stripped from shell tool
 * commands so clients see the simplified form.
 */
export async function mapSessionEvents(
	session: URI,
	db: ISessionDatabase | undefined,
	events: readonly ISessionEvent[],
	workingDirectory?: URI,
): Promise<{ turns: Turn[]; subagentTurnsByToolCallId: ReadonlyMap<string, Turn[]> }> {
	// First pass: collect tool-arg info and identify edit tool calls so we
	// can batch-load their stored file edits before the second pass needs
	// them at `tool.execution_complete` time.
	const toolInfoByCallId = new Map<string, IToolStartInfo>();
	const editToolCallIds: string[] = [];
	for (const e of events) {
		if (e.type !== 'tool.execution_start') {
			continue;
		}
		const d = (e as ISessionEventToolStart).data;
		if (isHiddenTool(d.toolName)) {
			continue;
		}
		const rawArgs = d.arguments !== undefined ? tryStringify(d.arguments) : undefined;
		let parameters: Record<string, unknown> | undefined;
		if (rawArgs) {
			try { parameters = JSON.parse(rawArgs) as Record<string, unknown>; } catch { /* ignore */ }
		}
		// stripRedundantCdPrefix mutates `parameters` and signals via its
		// return value. We re-stringify only when it changed something so
		// `getToolInputString` sees the cleaned command line.
		const cleaned = stripRedundantCdPrefix(d.toolName, parameters, workingDirectory) ? tryStringify(parameters) : undefined;
		const toolArgs = cleaned ?? rawArgs;
		const toolKind = getToolKind(d.toolName);
		const subagentMeta = toolKind === 'subagent' ? getSubagentMetadata(parameters) : undefined;
		const displayName = getToolDisplayName(d.toolName);
		toolInfoByCallId.set(d.toolCallId, {
			toolName: d.toolName,
			displayName,
			invocationMessage: getInvocationMessage(d.toolName, displayName, parameters),
			toolInput: getToolInputString(d.toolName, parameters, toolArgs),
			toolKind,
			language: toolKind === 'terminal' ? getShellLanguage(d.toolName) : undefined,
			subagentAgentName: subagentMeta?.agentName,
			subagentDescription: subagentMeta?.description,
			parameters,
			parentToolCallId: d.parentToolCallId,
		});
		if (isEditTool(d.toolName)) {
			editToolCallIds.push(d.toolCallId);
		}
	}

	// Pre-load stored file-edit metadata for all edit tool calls.
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
			// Database may not exist yet for new sessions — that's fine.
		}
	}

	const sessionUriStr = session.toString();
	const turns: Turn[] = [];

	// Subagent state. Each subagent has its own active turn builder; only
	// the most recent turn per subagent is built (subagents currently emit
	// at most one turn per invocation).
	const subagentBuilders = new Map<string, ITurnBuilder>();
	const subagentTurns = new Map<string, Turn[]>();
	const subagentInfoByToolCallId = new Map<string, ISubagentInfo>();

	let parentBuilder: ITurnBuilder | undefined;

	const flushSubagent = (parentToolCallId: string): void => {
		const builder = subagentBuilders.get(parentToolCallId);
		if (!builder) {
			return;
		}
		subagentBuilders.delete(parentToolCallId);
		if (builder.responseParts.length === 0) {
			return;
		}
		const list = subagentTurns.get(parentToolCallId) ?? [];
		list.push(finalizeTurn(builder, TurnState.Complete));
		subagentTurns.set(parentToolCallId, list);
	};

	const ensureSubagentBuilder = (parentToolCallId: string): ITurnBuilder => {
		let builder = subagentBuilders.get(parentToolCallId);
		if (!builder) {
			builder = newTurnBuilder(generateUuid(), '');
			subagentBuilders.set(parentToolCallId, builder);
		}
		return builder;
	};

	const targetBuilderFor = (parentToolCallId: string | undefined): ITurnBuilder | undefined => {
		if (parentToolCallId) {
			return ensureSubagentBuilder(parentToolCallId);
		}
		return parentBuilder;
	};

	for (const e of events) {
		switch (e.type) {
			case 'user.message': {
				if (isSyntheticUserMessage(e)) {
					continue;
				}
				const d = (e as ISessionEventMessage).data;
				const messageId = d?.messageId ?? d?.interactionId ?? '';
				const content = d?.content ?? '';
				if (d?.parentToolCallId) {
					// User messages with a parent tool call route into the
					// subagent's transcript. They never start a new parent
					// turn; subagents currently only see assistant messages
					// in practice, but route conservatively.
					const builder = ensureSubagentBuilder(d.parentToolCallId);
					if (content) {
						builder.responseParts.push({
							kind: ResponsePartKind.Markdown,
							id: generateUuid(),
							content,
						});
					}
				} else {
					// A new top-level user message starts a new parent turn.
					if (parentBuilder) {
						turns.push(finalizeTurn(parentBuilder, TurnState.Cancelled));
					}
					parentBuilder = newTurnBuilder(messageId, content);
				}
				break;
			}
			case 'assistant.message': {
				const d = (e as ISessionEventMessage).data;
				const messageId = d?.messageId ?? d?.interactionId ?? '';
				const content = d?.content ?? '';
				const reasoningText = d?.reasoningText;
				const hasToolRequests = !!d?.toolRequests && d.toolRequests.length > 0;
				const builder = targetBuilderFor(d?.parentToolCallId)
					?? (parentBuilder = newTurnBuilder(messageId, ''));
				if (reasoningText) {
					builder.responseParts.push({
						kind: ResponsePartKind.Reasoning,
						id: generateUuid(),
						content: reasoningText,
					});
				}
				if (content) {
					builder.responseParts.push({
						kind: ResponsePartKind.Markdown,
						id: generateUuid(),
						content,
					});
				}
				// A parent assistant message without further tool requests
				// terminates the current parent turn (no more responses
				// expected). Subagent turns are flushed at the parent's
				// `tool.execution_complete` instead.
				if (!d?.parentToolCallId && !hasToolRequests && builder === parentBuilder) {
					turns.push(finalizeTurn(parentBuilder, TurnState.Complete));
					parentBuilder = undefined;
				}
				break;
			}
			case 'subagent.started': {
				const d = (e as ISessionEventSubagentStarted).data;
				subagentInfoByToolCallId.set(d.toolCallId, {
					agentName: d.agentName,
					agentDisplayName: d.agentDisplayName,
					agentDescription: d.agentDescription,
				});
				break;
			}
			case 'tool.execution_start': {
				// Already collected in the first pass; no per-event work
				// needed here. Hidden tools are filtered above.
				break;
			}
			case 'tool.execution_complete': {
				const d = (e as ISessionEventToolComplete).data;
				const info = toolInfoByCallId.get(d.toolCallId);
				if (!info) {
					// Orphan complete (no matching start), or hidden tool.
					continue;
				}
				toolInfoByCallId.delete(d.toolCallId);
				const builder = targetBuilderFor(d.parentToolCallId);
				if (!builder) {
					// No active turn to attach this completion to.
					continue;
				}
				const completedPart = makeCompletedToolCallPart(d, info, sessionUriStr, storedEdits, subagentInfoByToolCallId.get(d.toolCallId));
				builder.responseParts.push(completedPart);
				// When a parent tool call that spawned a subagent completes,
				// flush the subagent's accumulated turn.
				if (!d.parentToolCallId && subagentInfoByToolCallId.has(d.toolCallId)) {
					flushSubagent(d.toolCallId);
				}
				break;
			}
			case 'skill.invoked': {
				const skill = (e as ISessionEventSkillInvoked);
				const synth = synthesizeSkillToolCall(skill.data, skill.id);
				const builder = parentBuilder ?? (parentBuilder = newTurnBuilder(generateUuid(), ''));
				builder.responseParts.push({
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						status: ToolCallStatus.Completed,
						toolCallId: synth.toolCallId,
						toolName: synth.toolName,
						displayName: synth.displayName,
						invocationMessage: synth.invocationMessage,
						success: true,
						pastTenseMessage: synth.pastTenseMessage,
						confirmed: ToolCallConfirmationReason.NotNeeded,
					} satisfies ToolCallCompletedState,
				});
				break;
			}
			default:
				break;
		}
	}

	// Drain any unfinished turns.
	if (parentBuilder) {
		turns.push(finalizeTurn(parentBuilder, TurnState.Cancelled));
		parentBuilder = undefined;
	}
	for (const parentToolCallId of [...subagentBuilders.keys()]) {
		flushSubagent(parentToolCallId);
	}

	return { turns, subagentTurnsByToolCallId: subagentTurns };
}

/**
 * Builds a {@link ToolCallCompletedState}-shaped response part from an
 * SDK `tool.execution_complete` event. Restores file-edit content
 * references from `storedEdits` and merges subagent metadata when the
 * tool call spawned a child session.
 */
function makeCompletedToolCallPart(
	d: ISessionEventToolComplete['data'],
	info: IToolStartInfo,
	sessionUriStr: string,
	storedEdits: Map<string, IFileEditRecord[]> | undefined,
	subagent: ISubagentInfo | undefined,
): ResponsePart {
	const toolOutput = d.error?.message ?? d.result?.content;
	const content: ToolResultContent[] = [];
	if (toolOutput !== undefined) {
		content.push({ type: ToolResultContentType.Text, text: toolOutput });
	}

	// Restore file edit content references from the database.
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

	if (subagent) {
		content.push({
			type: ToolResultContentType.Subagent,
			resource: buildSubagentSessionUri(sessionUriStr, d.toolCallId),
			title: subagent.agentDisplayName,
			agentName: subagent.agentName,
			description: subagent.agentDescription,
		});
	}

	const tc: ToolCallCompletedState = {
		status: ToolCallStatus.Completed,
		toolCallId: d.toolCallId,
		toolName: info.toolName,
		displayName: info.displayName,
		invocationMessage: info.invocationMessage,
		toolInput: info.toolInput,
		success: d.success,
		pastTenseMessage: getPastTenseMessage(info.toolName, info.displayName, info.parameters, d.success),
		content: content.length > 0 ? content : undefined,
		error: d.error,
		confirmed: ToolCallConfirmationReason.NotNeeded,
		_meta: {
			toolKind: info.toolKind,
			language: info.language,
			subagentDescription: info.subagentDescription,
			subagentAgentName: info.subagentAgentName,
		},
	};
	return { kind: ResponsePartKind.ToolCall, toolCall: tc };
}
