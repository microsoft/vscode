/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Attachment, JsonValue, SessionEvent } from '@github/copilot-sdk';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { isDefined, isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid, isUUID } from '../../../../base/common/uuid.js';
import { readAttachmentDetail } from '../../common/meta/attachmentMeta.js';
import { MessageAttachmentKind, type MessageAttachment, type TextRange } from '../../common/state/protocol/state.js';
import { getInlineToolInput, getTurnError, ResponsePartKind, ToolCallStatus, ToolResultContentType, TurnState, type MarkdownResponsePart, type ReasoningResponsePart, type ToolCallCompletedState, type ToolResultContent, type ToolResultSubagentContent, type Turn } from '../../common/state/sessionState.js';
import { addSimpleAttachmentDisplayKindToMimeType } from './copilotAttachmentUtils.js';

/**
 * Default schema version stamped on the synthesized `session.start` event.
 *
 * The Copilot SDK owns the authoritative event-format schema version; this
 * value is only meaningful when the resulting `events.jsonl` is actually
 * resumed by a CLI. It is irrelevant to the reconstruction performed by
 * {@link mapSessionEvents} (which ignores it), so unit tests can rely on the
 * default. Callers that write a log for real resume SHOULD pass the version the
 * target CLI expects.
 */
const DEFAULT_SESSION_EVENT_SCHEMA_VERSION = 1;

/**
 * Producer identifier stamped on the synthesized `session.start` event so a
 * migrated event log is attributable to this translation path rather than a
 * genuine agent run.
 */
const MIGRATION_PRODUCER = 'vscode-copilot-migration';

/**
 * Options controlling how {@link buildSessionEventsFromTurns} synthesizes a
 * Copilot SDK event log from VS Code turns.
 */
export interface IBuildSessionEventsOptions {
	/** The target session id (stamped on the `session.start` event). */
	readonly sessionId: string;
	/** Working directory of the session, recorded on `session.start` context. */
	readonly workingDirectory?: string;
	/** Model id for turns that do not record a model this host can use, and the model the log ends on. */
	readonly model?: string;
	/** Copilot application version string for `session.start`. Defaults to `0.0.0`. */
	readonly copilotVersion?: string;
	/** Event-format schema version for `session.start`. See {@link DEFAULT_SESSION_EVENT_SCHEMA_VERSION}. */
	readonly schemaVersion?: number;
	/** Base time for the synthesized (monotonically increasing) event timestamps. Defaults to now. */
	readonly startTime?: Date;
	/** Associates original response parts with their synthesized user-turn and assistant-event IDs. */
	readonly onAssistantMessage?: (turnId: string, responseId: string, parts: readonly (MarkdownResponsePart | ReasoningResponsePart)[]) => void;
}

/**
 * Translates a sequence of VS Code {@link Turn}s into a Copilot SDK
 * {@link SessionEvent} log (the on-disk `events.jsonl` shape), reversing the
 * reconstruction performed by `mapSessionEvents`.
 *
 * The result is a valid parent-linked event chain: a leading `session.start`
 * followed, per turn, by a `user.message`, an `assistant.turn_start`, and the
 * turn's response emitted in order — assistant markdown/reasoning as
 * `assistant.message` events and each completed tool call as a
 * `tool.execution_start` + `tool.execution_complete` pair (preceded by a
 * `subagent.started` when the tool call carries sub-agent content, so the
 * sub-agent name/description survive a resume). Assistant text accumulated
 * before a tool call is flushed as its own `assistant.message` so the
 * reconstructed part order matches the original. A finished turn closes with
 * an `assistant.turn_end`.
 *
 * Every event envelope id must be a UUID (the Copilot runtime rejects non-UUID
 * event ids). A turn whose {@link Turn.id} is already a UUID reuses it as the
 * `user.message` envelope id, so the reconstructed turn keeps the same id the
 * SDK's fork / truncate RPCs address and the caller can seed matching protocol
 * turns; a non-UUID id is replaced with a minted UUID.
 *
 * Only completed tool calls are translated; streaming / pending tool states and
 * file-edit content (which lives in the session database) are not yet emitted.
 * A cancelled turn ({@link TurnState.Cancelled}) emits a trailing `abort` event
 * so it reconstructs as cancelled, and an errored turn ({@link TurnState.Error})
 * a `session.error` carrying its error. Content refs and system notifications
 * are skipped. The event log has no per-turn custom agent, so a turn's
 * `message.agent` is not recorded; the session's agent applies on resume.
 *
 * Each user message carries its translated attachments. Each turn runs on the
 * model its message records, or on {@link IBuildSessionEventsOptions.model}
 * when it records none (e.g. a model this host cannot use); a
 * `session.model_change` precedes any turn whose model differs from the one in
 * effect, so a turn never inherits the previous turn's model. The log ends on
 * {@link IBuildSessionEventsOptions.model} so it agrees with the session's
 * selected model. Without a session model the session runs on the provider's
 * default, which no model change can return to, so no per-turn models are
 * recorded rather than attributing a turn, or the session, to another turn's
 * model.
 */
export function buildSessionEventsFromTurns(turns: readonly Turn[], options: IBuildSessionEventsOptions): SessionEvent[] {
	const events: SessionEvent[] = [];
	let parentId: string | null = null;
	let currentModel = options.model;

	// Synthesize strictly increasing ISO timestamps so the event order on disk
	// is unambiguous even for turns that were originally seconds apart. A turn
	// that records when it started and how long it took is stamped at those
	// times instead, so the reconstructed turn keeps its original timing; the
	// clock never runs backwards, so the order stays intact either way.
	const startedAtMs = (turn: Turn): number | undefined => {
		const ms = turn.startedAt === undefined ? NaN : Date.parse(turn.startedAt);
		return Number.isFinite(ms) ? ms : undefined;
	};
	const firstStartedAt = turns.length ? startedAtMs(turns[0]) : undefined;
	let clock = options.startTime?.getTime() ?? (firstStartedAt !== undefined ? firstStartedAt - 10 : Date.now());
	const nextTimestamp = (): string => new Date(clock++).toISOString();
	const advanceTo = (ms: number | undefined): void => {
		if (ms !== undefined) {
			clock = Math.max(clock, ms);
		}
	};

	const push = (event: SessionEvent): void => {
		events.push(event);
		parentId = event.id;
	};

	/** Emits the `tool.execution_start` + `tool.execution_complete` pair for a completed tool call. */
	const pushCompletedToolCall = (tc: ToolCallCompletedState): void => {
		let parsedToolInput: Record<string, JsonValue> | undefined;
		const toolInput = getInlineToolInput(tc.toolInput);
		if (toolInput) {
			try {
				const parsed = JSON.parse(toolInput);
				if (isObject(parsed)) {
					parsedToolInput = parsed as Record<string, JsonValue>;
				}
			} catch {
				// Non-JSON tool input: omit structured arguments (the forward
				// mapper regenerates the invocation display from the tool name).
			}
		}
		// If the tool call carries sub-agent identity, emit `subagent.started`
		// first so a resume reconstructs the sub-agent name/description onto the
		// parent tool call (the SDK keys this by `toolCallId`). Required fields
		// fall back to the title so the event stays well-formed.
		const subagent = tc.content?.find((c): c is ToolResultSubagentContent => c.type === ToolResultContentType.Subagent);
		if (subagent) {
			push({
				id: generateUuid(),
				parentId,
				timestamp: nextTimestamp(),
				type: 'subagent.started',
				data: {
					toolCallId: tc.toolCallId,
					agentName: subagent.agentName ?? subagent.title,
					agentDisplayName: subagent.title,
					agentDescription: subagent.description ?? '',
				},
			});
		}
		push({
			id: generateUuid(),
			parentId,
			timestamp: nextTimestamp(),
			type: 'tool.execution_start',
			data: {
				toolCallId: tc.toolCallId,
				toolName: tc.toolName,
				...(parsedToolInput ? { arguments: parsedToolInput } : {}),
			},
		});
		const resultText = extractToolResultText(tc.content);
		push({
			id: generateUuid(),
			parentId,
			timestamp: nextTimestamp(),
			type: 'tool.execution_complete',
			data: {
				toolCallId: tc.toolCallId,
				success: tc.success,
				...(tc.success ? { result: { content: resultText } } : {}),
				...(tc.error ? { error: { message: tc.error.message, ...(tc.error.code ? { code: tc.error.code } : {}) } } : {}),
			},
		});
	};

	push({
		id: generateUuid(),
		parentId,
		timestamp: nextTimestamp(),
		type: 'session.start',
		data: {
			sessionId: options.sessionId,
			copilotVersion: options.copilotVersion ?? '0.0.0',
			producer: MIGRATION_PRODUCER,
			startTime: nextTimestamp(),
			version: options.schemaVersion ?? DEFAULT_SESSION_EVENT_SCHEMA_VERSION,
			...(options.model ? { selectedModel: options.model } : {}),
			...(options.workingDirectory ? { context: { cwd: options.workingDirectory } } : {}),
		},
	});

	const pushModelChange = (newModel: string | undefined): void => {
		if (!newModel || newModel === currentModel) {
			return;
		}
		push({
			id: generateUuid(),
			parentId,
			timestamp: nextTimestamp(),
			type: 'session.model_change',
			data: {
				newModel,
				...(currentModel ? { previousModel: currentModel } : {}),
			},
		});
		currentModel = newModel;
	};

	for (const turn of turns) {
		// Without a session model the session runs on the provider's default, which a
		// model change cannot return to, so per-turn models are not recorded.
		if (options.model) {
			pushModelChange(turn.message.model?.id ?? options.model);
		}
		// Reuse the turn id as the user-message envelope id when it is already a
		// UUID (the runtime rejects non-UUID event ids) so the reconstructed turn
		// keeps the id the SDK's fork/truncate RPCs address and a caller can seed
		// a matching protocol turn; otherwise mint a fresh UUID.
		const turnId = isUUID(turn.id) ? turn.id : generateUuid();
		const attachments = toSdkAttachments(turn.message.attachments);
		const turnStartedAt = startedAtMs(turn);
		advanceTo(turnStartedAt);
		push({
			id: turnId,
			parentId,
			timestamp: nextTimestamp(),
			type: 'user.message',
			data: {
				content: turn.message.text,
				source: 'user',
				...(attachments ? { attachments } : {}),
			},
		});
		const sdkTurnId = '0';
		push({
			id: generateUuid(),
			parentId,
			timestamp: nextTimestamp(),
			type: 'assistant.turn_start',
			data: { turnId: sdkTurnId, ...(currentModel ? { model: currentModel } : {}) },
		});

		let markdown = '';
		let reasoning = '';
		let parts: (MarkdownResponsePart | ReasoningResponsePart)[] = [];
		// Whether the last response event is an assistant message, which completes the reconstructed turn.
		let endsWithAssistantMessage = false;
		const pushAssistantMessage = (content: string, reasoningText?: string): string => {
			const responseId = generateUuid();
			push({
				id: responseId,
				parentId,
				timestamp: nextTimestamp(),
				type: 'assistant.message',
				data: {
					content,
					messageId: generateUuid(),
					...(reasoningText ? { reasoningText } : {}),
					...(currentModel ? { model: currentModel } : {}),
				},
			});
			endsWithAssistantMessage = true;
			return responseId;
		};
		const flushAssistantMessage = (): void => {
			if (!markdown && !reasoning) {
				return;
			}
			const responseId = pushAssistantMessage(markdown, reasoning);
			options.onAssistantMessage?.(turnId, responseId, parts);
			markdown = '';
			reasoning = '';
			parts = [];
		};

		for (const part of turn.responseParts) {
			if (part.kind === ResponsePartKind.Markdown) {
				// Flush pending reasoning first: the reverse mapper emits reasoning
				// before content within a single assistant.message, so interleaved
				// reasoning/markdown must be split into separate messages to keep
				// the original stream order.
				if (reasoning) {
					flushAssistantMessage();
				}
				markdown += part.content;
				parts.push({ ...part });
			} else if (part.kind === ResponsePartKind.Reasoning) {
				if (markdown) {
					flushAssistantMessage();
				}
				reasoning += part.content;
				parts.push({ ...part });
			} else if (part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed) {
				// Flush accumulated assistant text before the tool call so the
				// reconstructed part order matches the original interleaving.
				flushAssistantMessage();
				pushCompletedToolCall(part.toolCall);
				endsWithAssistantMessage = false;
			}
			// Content refs and system notifications are not yet translated.
		}
		flushAssistantMessage();

		// The turn's last event marks when it finished.
		advanceTo(turnStartedAt !== undefined && turn.duration !== undefined && Number.isFinite(turn.duration) ? turnStartedAt + turn.duration : undefined);
		// A cancelled turn reconstructs as `TurnState.Cancelled` only if the event
		// stream ends without a finalizing assistant message (the reverse mapper
		// defaults to cancelled and upgrades to complete on a final message). Emit
		// an explicit `abort` after the already-flushed content so the turn is
		// marked cancelled while keeping its text.
		if (turn.state === TurnState.Cancelled) {
			push({
				id: generateUuid(),
				parentId,
				timestamp: nextTimestamp(),
				type: 'abort',
				data: { reason: 'user_initiated' },
			});
		} else if (turn.state === TurnState.Error) {
			// The error ends the turn, so no finalizing assistant message is needed.
			const error = getTurnError(turn);
			push({
				id: generateUuid(),
				parentId,
				timestamp: nextTimestamp(),
				type: 'session.error',
				data: {
					errorType: error?.errorType ?? 'error',
					message: error?.message ?? '',
					...(error?.stack ? { stack: error.stack } : {}),
					originatingMessageId: turnId,
				},
			});
			push({
				id: generateUuid(),
				parentId,
				timestamp: nextTimestamp(),
				type: 'assistant.turn_end',
				data: { turnId: sdkTurnId, ...(currentModel ? { model: currentModel } : {}) },
			});
		} else {
			// A finished turn must end on an assistant message (an empty one when it
			// ended on a tool call or had no response) and close with `turn_end`.
			// Otherwise the reverse mapper treats the final turn as still running and
			// a cold restore reports it as interrupted.
			if (!endsWithAssistantMessage) {
				pushAssistantMessage('');
			}
			push({
				id: generateUuid(),
				parentId,
				timestamp: nextTimestamp(),
				type: 'assistant.turn_end',
				data: { turnId: sdkTurnId, ...(currentModel ? { model: currentModel } : {}) },
			});
		}
	}
	pushModelChange(options.model);

	return events;
}

/**
 * Translates imported message attachments into the SDK attachments recorded on
 * a `user.message`, mirroring the send path's mapping. The event log records
 * local paths only, so a reference to a non-`file` resource is kept as a text
 * attachment naming the resource instead of being misread as a path.
 *
 * A selection is recorded with its text only when the attachment carries the
 * text that was originally sent. Otherwise it becomes a file reference scoped
 * to the selected lines, so the history never presents the file's current
 * contents as what was selected at the time.
 */
function toSdkAttachments(attachments: readonly MessageAttachment[] | undefined): Attachment[] | undefined {
	const result = attachments?.map(toSdkAttachment).filter(isDefined);
	return result?.length ? result : undefined;
}

function toSdkAttachment(attachment: MessageAttachment): Attachment | undefined {
	switch (attachment.type) {
		case MessageAttachmentKind.Simple:
			return attachment.modelRepresentation
				? { type: 'blob', data: encodeBase64(VSBuffer.fromString(attachment.modelRepresentation)), mimeType: addSimpleAttachmentDisplayKindToMimeType(attachment), displayName: attachment.label }
				: undefined;
		case MessageAttachmentKind.EmbeddedResource:
			return { type: 'blob', data: attachment.data, mimeType: attachment.contentType, displayName: attachment.label };
		case MessageAttachmentKind.Resource: {
			const uri = URI.parse(attachment.uri);
			if (uri.scheme !== Schemas.file) {
				return { type: 'blob', data: encodeBase64(VSBuffer.fromString(attachment.uri)), mimeType: 'text/plain', displayName: attachment.label };
			}
			if (attachment.selection) {
				const text = readAttachmentDetail(attachment)?.text;
				return text !== undefined
					? { type: 'selection', filePath: uri.fsPath, displayName: attachment.label, text, selection: attachment.selection.range }
					: { type: 'file', path: uri.fsPath, displayName: attachment.label, lineRange: toLineRange(attachment.selection.range) };
			}
			return { type: attachment.displayKind === 'directory' ? 'directory' : 'file', path: uri.fsPath, displayName: attachment.label };
		}
		default:
			return undefined;
	}
}

/** The 1-based inclusive lines a 0-based range covers; a range ending at a line start excludes that line. */
function toLineRange(range: TextRange): { start: number; end: number } {
	const endLine = range.end.character === 0 && range.end.line > range.start.line ? range.end.line - 1 : range.end.line;
	return { start: range.start.line + 1, end: endLine + 1 };
}

/** Concatenates the text of a completed tool call's textual result content blocks. */
function extractToolResultText(content: readonly ToolResultContent[] | undefined): string {
	if (!content) {
		return '';
	}
	let text = '';
	for (const item of content) {
		if (item.type === ToolResultContentType.Text) {
			text += item.text;
		}
	}
	return text;
}

/**
 * Serializes SDK session events into the on-disk `events.jsonl` representation:
 * one JSON object per line, terminated by a newline so a subsequent append
 * starts on a fresh line. Returns the empty string for an empty event list.
 */
export function serializeSessionEventsToJsonl(events: readonly SessionEvent[]): string {
	if (events.length === 0) {
		return '';
	}
	return events.map(event => JSON.stringify(event)).join('\n') + '\n';
}

/**
 * Convenience combining {@link buildSessionEventsFromTurns} and
 * {@link serializeSessionEventsToJsonl}: turns the given VS Code turns directly
 * into the `events.jsonl` bytes to write for the target session.
 */
export function buildSessionEventLogFromTurns(turns: readonly Turn[], options: IBuildSessionEventsOptions): string {
	return serializeSessionEventsToJsonl(buildSessionEventsFromTurns(turns, options));
}

/**
 * Session-database metadata key holding the original duration of each imported
 * turn, keyed by turn id. An event log only has event timestamps, from which a
 * replay infers a duration; those are synthesized for imported turns, so the
 * inferred duration would be invented for a turn whose duration was never
 * known, and distorted where events had to be moved to stay in order.
 */
export const IMPORTED_TURN_DURATIONS_DB_KEY = 'agentHost.importedTurnDurations';

/** Serializes each imported turn's duration (`null` when unknown) for {@link IMPORTED_TURN_DURATIONS_DB_KEY}. */
export function serializeImportedTurnDurations(turns: readonly Turn[]): string | undefined {
	const durations: Record<string, number | null> = {};
	for (const turn of turns) {
		if (isUUID(turn.id)) {
			durations[turn.id] = turn.duration !== undefined && Number.isFinite(turn.duration) && turn.duration >= 0 ? turn.duration : null;
		}
	}
	return Object.keys(durations).length ? JSON.stringify(durations) : undefined;
}

/** Reads the value written by {@link serializeImportedTurnDurations}; malformed entries are ignored. */
export function parseImportedTurnDurations(value: string | undefined): ReadonlyMap<string, number | undefined> | undefined {
	if (!value) {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return undefined;
	}
	if (!isObject(parsed) || Array.isArray(parsed)) {
		return undefined;
	}
	const durations = new Map<string, number | undefined>();
	for (const [turnId, duration] of Object.entries(parsed)) {
		if (duration === null) {
			durations.set(turnId, undefined);
		} else if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) {
			durations.set(turnId, duration);
		}
	}
	return durations;
}

/** Replaces the inferred durations of imported turns with their recorded originals. */
export function withImportedTurnDurations(turns: Turn[], durations: ReadonlyMap<string, number | undefined> | undefined): Turn[] {
	if (!durations?.size) {
		return turns;
	}
	return turns.map(turn => {
		if (!durations.has(turn.id)) {
			return turn;
		}
		const { duration: _inferred, ...rest } = turn;
		const duration = durations.get(turn.id);
		return duration === undefined ? rest : { ...rest, duration };
	});
}
