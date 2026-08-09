/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AgentTaskGetResponse, AgentTaskSessionEvent } from '@vscode/copilot-api';
import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { CLI_TOOL_EVENT_HANDLERS } from '../copilotcli/common/copilotCLITools';
import {
	createResponseEventRenderContext,
	flushPendingAssistantMessage,
	ResponseEventRenderContext,
} from '../common/sessionEventRenderer';
import { TaskCloudAgentBackend } from '../vscode/cloudAgentBackend';
import { isActiveTaskState, isFailedTaskState } from '../vscode/copilotCodingAgentUtils';
import { ChatSessionContentBuilder, extractTaskErrorDetail, formatTaskStoppedMessage } from './copilotCloudSessionContentBuilder';

/**
 * Phase of a single Task turn. The Task API uses `queued | in_progress | idle |
 * waiting_for_user` to mean "the agent still owns the turn"; the rest are terminal.
 * Shared with the detail view and the `activeResponseCallback` gate via
 * {@link isActiveTaskState}.
 */
function isActiveState(state: AgentTaskGetResponse['state'] | undefined): boolean {
	return state !== undefined && isActiveTaskState(state);
}

/**
 * Describes what the caller already knows about the task when streaming begins.
 *
 * - `mode: 'current'` — the latest turn in `task.sessions[]` is already active. Used
 *   by the chat session's `activeResponseCallback` when the view is opened on an
 *   in-progress task.
 * - `mode: 'next'` — the caller just sent a steer (`sendFollowUpToTask`); the new
 *   turn may or may not be visible in `task.sessions[]` yet. We must wait for it
 *   to appear (or for any new events) before applying the settle check, otherwise
 *   we'd see the previous, already-completed turn and exit immediately.
 *
 * `seedEventIds` are event ids already rendered as history so the live loop does
 * not re-emit them.
 */
export type StreamBaseline =
	| { readonly mode: 'current'; readonly seedEventIds: ReadonlySet<string> }
	| { readonly mode: 'next'; readonly seedEventIds: ReadonlySet<string>; readonly priorTurnCount: number };

/**
 * Streams the currently active (or upcoming) Task turn into a `vscode.ChatResponseStream`.
 *
 * Design follows the github-ui agent-sessions package: events drive a small in-memory
 * state machine, and renderable parts are produced eagerly from `assistant.message`
 * (including `toolRequests`) so bootstrap and in-flight work surface immediately
 * instead of waiting for `tool.execution_complete` (which doesn't fire for many
 * agent-host-synthesised setup operations like `run_setup`).
 *
 * Key rules:
 * - **Eager tool rendering.** `assistant.message.toolRequests` items become tool parts
 *   the moment the message arrives. The matching `tool.execution_complete` (if it
 *   arrives at all) is deduplicated against the rendered-tool-call-id set.
 * - **isWorking + currentIntent.** `assistant.turn_start` / `assistant.intent` /
 *   `session.idle` / `abort` drive a progress label pushed via `stream.progress`
 *   so the user sees "Thinking…" (or the latest intent) even when no renderable
 *   content has arrived yet.
 * - **Two-phase lifecycle** keyed off {@link StreamBaseline.mode}:
 *     1. (`mode: 'next'` only) wait for the new turn to start, signalled by
 *        `task.sessions.length` growing past `priorTurnCount`. Bounded by
 *        {@link MAX_WAIT_FOR_TURN_START_MS}. (Earlier versions also accepted
 *        "any unseen event" as evidence, but a trailing event from the prior
 *        turn would then trick the main loop into observing the previous,
 *        now-settled session and exiting before the follow-up streamed.)
 *     2. stream until the latest turn leaves the active state region.
 * - Always returns control once the turn settles or the token cancels; never throws.
 */
export class TaskTurnStreamer {

	/** Default poll interval for both phases. */
	public static readonly DEFAULT_POLL_INTERVAL_MS = 2_000;

	/** Hard cap on how long we'll wait for `mode: 'next'` to observe the new turn. */
	public static readonly MAX_WAIT_FOR_TURN_START_MS = 60_000;

	/**
	 * Exit the main poll loop after this many consecutive `fetchTaskContent` failures
	 * to avoid spinning forever when the backend is unreachable. At the default poll
	 * interval (2s) this is ~30s of repeated failure before bailing.
	 */
	public static readonly MAX_CONSECUTIVE_FETCH_FAILURES = 15;

	constructor(
		private readonly _backend: TaskCloudAgentBackend,
		private readonly _contentBuilder: ChatSessionContentBuilder,
		private readonly _logService: ILogService,
		private readonly _pollIntervalMs: number = TaskTurnStreamer.DEFAULT_POLL_INTERVAL_MS,
	) { }

	async stream(
		stream: vscode.ChatResponseStream,
		taskId: string,
		baseline: StreamBaseline,
		token: vscode.CancellationToken,
	): Promise<void> {
		const ctx = createResponseEventRenderContext(this._logService, CLI_TOOL_EVENT_HANDLERS);
		const sink = new StreamSink(stream, ctx, this._logService, taskId);
		const state: IngestState = {
			seen: new Set<string>(baseline.seedEventIds),
			renderedToolCallIds: new Set<string>(),
			isWorking: false,
			currentIntent: null,
			assistantMessageContent: new Map<string, string>(),
			activeMessageId: null,
			renderedError: false,
		};
		let lastProgressLabel: string | undefined;

		const publishProgress = () => {
			const label = this._progressLabel(state);
			if (label !== null && label !== lastProgressLabel) {
				stream.progress(label);
				lastProgressLabel = label;
			}
		};

		try {
			if (baseline.mode === 'next') {
				const observed = await this._waitForTurnStart(taskId, baseline.priorTurnCount, state.seen, token);
				if (!observed) {
					// Server never produced the new turn within the wait budget. Bail without
					// emitting anything; the caller's `stream.markdown('begun work…')` stays.
					return;
				}
				this._ingestBatch(observed.events, ctx, state);
				sink.flush();
				publishProgress();
			}

			let consecutiveFetchFailures = 0;
			while (!token.isCancellationRequested) {
				const [task, events] = await Promise.all([this._fetchTask(taskId), this._fetchEvents(taskId)]);

				if (task === undefined) {
					consecutiveFetchFailures++;
					if (consecutiveFetchFailures >= TaskTurnStreamer.MAX_CONSECUTIVE_FETCH_FAILURES) {
						this._logService.warn(`[TaskTurnStreamer] Giving up on task ${taskId} after ${consecutiveFetchFailures} consecutive fetchTaskContent failures.`);
						return;
					}
				} else {
					consecutiveFetchFailures = 0;
				}

				this._ingestBatch(events, ctx, state);
				sink.flush();

				const sessions = task?.sessions;
				const latestTurn = sessions?.[sessions.length - 1];
				// Settle when the task itself reached a terminal state, even if its latest turn's
				// session state is still active. A task that failed to launch (e.g. "Failed to
				// launch agent") never advances the turn out of `queued`/`in_progress`, so the
				// per-turn check below would otherwise poll forever.
				if (task !== undefined && !isActiveState(task.state)) {
					if (isFailedTaskState(task.state)) {
						// Surface the stop in-stream too, so it shows even after partial content
						// streamed. Skip the concrete detail if a `session.error` already rendered it.
						sink.flush();
						const detail = state.renderedError ? undefined : extractTaskErrorDetail(events);
						this._logService.trace(`[TaskTurnStreamer] task ${taskId} settled stopped (state=${task.state}); renderedError=${state.renderedError}; errorDetail=${detail ?? 'none'}`);
						stream.markdown(formatTaskStoppedMessage(task.state, detail));
					}
					state.isWorking = false;
					return;
				}
				if (latestTurn && !isActiveState(latestTurn.state)) {
					state.isWorking = false;
					return;
				}
				// Defensive: missing task with no sessions and no events → nothing to wait for.
				if (!latestTurn && events.length === 0) {
					return;
				}

				publishProgress();

				await delay(this._pollIntervalMs, token);
			}
		} catch (err) {
			this._logService.warn(`[TaskTurnStreamer] Unexpected error streaming task ${taskId}: ${err}`);
		}
	}

	/**
	 * Phase 1 (only for `mode: 'next'`): block until evidence of the new turn appears.
	 * Returns the snapshot we observed so phase 2 doesn't re-fetch the same events.
	 */
	private async _waitForTurnStart(
		taskId: string,
		priorTurnCount: number,
		_seen: ReadonlySet<string>,
		token: vscode.CancellationToken,
	): Promise<{ events: readonly AgentTaskSessionEvent[] } | undefined> {
		const startedAt = Date.now();
		while (!token.isCancellationRequested) {
			if (Date.now() - startedAt > TaskTurnStreamer.MAX_WAIT_FOR_TURN_START_MS) {
				this._logService.warn(`[TaskTurnStreamer] Timed out waiting for new turn on task ${taskId}.`);
				return undefined;
			}

			const [task, events] = await Promise.all([this._fetchTask(taskId), this._fetchEvents(taskId)]);
			const turnCount = task?.sessions?.length ?? 0;

			// Only `turnCount > priorTurnCount` is reliable evidence the new turn exists.
			// A trailing event from the prior turn (e.g. a late `tool.execution_complete`)
			// also looks "unseen" but would let the main loop immediately observe the
			// previous, now-settled session and exit before the follow-up turn is streamed.
			// We tolerate the slightly slower start in exchange for correctness.
			if (turnCount > priorTurnCount) {
				return { events };
			}

			await delay(this._pollIntervalMs, token);
		}
		return undefined;
	}

	private _ingestBatch<TToolCall>(events: readonly AgentTaskSessionEvent[], ctx: ResponseEventRenderContext<TToolCall>, state: IngestState): void {
		const fresh = events.filter(e => !state.seen.has(e.id));
		if (fresh.length > 0) {
			this._logService.trace(`[TaskTurnStreamer] ingesting ${fresh.length} new event(s): ${fresh.map(e => `${e.type}#${e.id.slice(0, 8)}`).join(', ')}`);
		}
		for (const event of fresh) {
			state.seen.add(event.id);
			this._ingestEvent(event, ctx, state);
		}
	}

	private _ingestEvent<TToolCall>(event: AgentTaskSessionEvent, ctx: ResponseEventRenderContext<TToolCall>, state: IngestState): void {
		// Working-state transitions.
		switch (event.type) {
			case 'assistant.turn_start':
				state.isWorking = true;
				break;
			case 'assistant.intent': {
				const intent = (event.data as { intent?: unknown }).intent;
				if (typeof intent === 'string' && intent.trim().length > 0) {
					state.currentIntent = intent;
				}
				break;
			}
			case 'assistant.turn_end':
			case 'session.idle':
			case 'session.shutdown':
			case 'abort':
				state.isWorking = false;
				state.currentIntent = null;
				break;
		}

		if (event.dismissed) {
			return;
		}

		if (event.type === 'session.error') {
			// A `session.error` renders inline via the default path below; remember it so the
			// terminal-failure notice on settle doesn't repeat the same detail.
			state.renderedError = true;
		}

		// Skip `tool.execution_complete` for tool calls we already rendered eagerly
		// from `assistant.message.toolRequests` — otherwise the same tool card appears
		// twice. The complete event's result payload is lost here; that's the trade-off
		// for showing tools as soon as they're requested rather than when they finish.
		if (event.type === 'tool.execution_complete') {
			const toolCallId = (event.data as { toolCallId?: string }).toolCallId;
			if (toolCallId && state.renderedToolCallIds.has(toolCallId)) {
				this._logService.trace(`[TaskTurnStreamer] dedup tool.execution_complete ${toolCallId.slice(0, 12)}`);
				return;
			}
		}

		const partsBefore = ctx.currentResponseParts.length;

		// `assistant.message` needs special handling: the Task API emits the same
		// `messageId` multiple times with progressively-longer `content` snapshots
		// (no `assistant.message_delta` events). The default helper path would render
		// each snapshot as a new markdown part, duplicating earlier prefixes — see
		// the "Exploring codebase…" duplication bug. Instead we synthesize deltas
		// ourselves so the helper accumulates chunks like a real streaming message.
		// Other event types go through the default path unchanged.
		if (event.type === 'assistant.message') {
			this._ingestAssistantMessage(event, ctx, state);
		} else {
			ChatSessionContentBuilder.appendTaskEventToContext(event, ctx);
		}

		const partsAfter = ctx.currentResponseParts.length;
		if (partsAfter > partsBefore) {
			const added = ctx.currentResponseParts.slice(partsBefore);
			this._logService.trace(`[TaskTurnStreamer] ${event.type} produced ${added.length} part(s): ${added.map(p => (p as { constructor: { name: string } }).constructor.name).join(', ')}`);
		}
	}

	private _ingestAssistantMessage<TToolCall>(event: AgentTaskSessionEvent, ctx: ResponseEventRenderContext<TToolCall>, state: IngestState): void {
		const data = event.data as { parentToolCallId?: string; toolRequests?: ToolRequest[]; content?: string; messageId?: string };
		this._logService.trace(`[TaskTurnStreamer] assistant.message messageId=${data.messageId?.slice(0, 12)} parentToolCallId=${data.parentToolCallId ? 'yes' : 'no'} contentLen=${data.content?.length ?? 0} toolRequests=${data.toolRequests?.length ?? 0}`);

		if (data.parentToolCallId) {
			// Child message of a tool call — render via default path (tool result text).
			ChatSessionContentBuilder.appendTaskEventToContext(event, ctx);
			return;
		}

		// 1. Content. Only render when the message has NO toolRequests — those messages
		//    carry intermediate narration alongside the tools (e.g. the model dumping a
		//    raw diff next to an `edit` request, or "Committed and pushed:" next to a
		//    `report_progress`). Rendering that narration as markdown produces the
		//    cluttered "tool, raw text, tool, raw text" layout. The model's actual
		//    reply to the user always arrives as an `assistant.message` with no
		//    `toolRequests` (typically `messageId="turn-N"`), so we still emit those.
		//    Dedupe per messageId by feeding only the suffix as a delta.
		const content = data.content ?? '';
		const messageId = data.messageId;
		const hasToolRequests = !!data.toolRequests && data.toolRequests.length > 0;
		if (content && messageId && !hasToolRequests) {
			if (state.activeMessageId && state.activeMessageId !== messageId) {
				flushPendingAssistantMessage(ctx);
			}
			state.activeMessageId = messageId;

			const prior = state.assistantMessageContent.get(messageId) ?? '';
			if (content !== prior) {
				if (content.startsWith(prior)) {
					const suffix = content.slice(prior.length);
					state.assistantMessageContent.set(messageId, content);
					const deltaEvent = {
						...event,
						id: `${event.id}-delta`,
						type: 'assistant.message_delta',
						data: { messageId, deltaContent: suffix },
					} as unknown as AgentTaskSessionEvent;
					ChatSessionContentBuilder.appendTaskEventToContext(deltaEvent, ctx);
					flushPendingAssistantMessage(ctx);
					this._logService.trace(`[TaskTurnStreamer] assistant.message ${messageId.slice(0, 12)} +${suffix.length} chars (flushed)`);
				} else {
					this._logService.warn(`[TaskTurnStreamer] assistant.message ${messageId} content diverges from prior snapshot (prior=${prior.length}c, new=${content.length}c); skipping to avoid duplication.`);
				}
			}
		}

		// 2. Tool requests carried by `assistant.message`. Rendered eagerly because the agent
		//    host emits `tool.execution_start` for these but rarely a matching
		//    `tool.execution_complete`, so deferring would leave bootstrap and in-flight tools
		//    invisible. The matching `tool.execution_complete` (if any) is deduped in the caller.
		if (data.toolRequests) {
			for (const req of data.toolRequests) {
				if (!req?.toolCallId || state.renderedToolCallIds.has(req.toolCallId)) {
					continue;
				}
				state.renderedToolCallIds.add(req.toolCallId);
				const part = this._renderToolRequest(req);
				if (part) {
					ctx.currentResponseParts.push(part);
					this._logService.trace(`[TaskTurnStreamer] eager-rendered tool ${req.name}#${req.toolCallId.slice(0, 12)} as ${part.constructor.name}`);
				}
			}
		}
	}

	private _renderToolRequest(req: ToolRequest): vscode.ChatToolInvocationPart | vscode.ChatResponseThinkingProgressPart | undefined {
		return this._contentBuilder.createToolPartFromRequest(req);
	}

	private _progressLabel(state: IngestState): string | null {
		if (!state.isWorking) {
			return null;
		}
		// Fall back to a generic working label until the agent emits its first `assistant.intent`,
		// otherwise the user sees no progress text for the first several seconds of a turn.
		return state.currentIntent;
	}

	private async _fetchTask(taskId: string): Promise<AgentTaskGetResponse | undefined> {
		try {
			const content = await this._backend.fetchTaskContent(taskId);
			return content?.task;
		} catch (e) {
			this._logService.warn(`[TaskTurnStreamer] fetchTaskContent failed for ${taskId}: ${e}`);
			return undefined;
		}
	}

	private async _fetchEvents(taskId: string): Promise<readonly AgentTaskSessionEvent[]> {
		try {
			return await this._backend.fetchTaskEvents(taskId);
		} catch (e) {
			this._logService.warn(`[TaskTurnStreamer] fetchTaskEvents failed for ${taskId}: ${e}`);
			return [];
		}
	}
}

interface IngestState {
	seen: Set<string>;
	renderedToolCallIds: Set<string>;
	isWorking: boolean;
	currentIntent: string | null;
	/**
	 * The highest-water-mark `content` we've emitted for each `assistant.message`
	 * messageId. The Task API sends progressive snapshots of the same message; we
	 * dedupe by feeding only the suffix (`content.slice(prior.length)`) as a
	 * synthesized `assistant.message_delta` event.
	 */
	assistantMessageContent: Map<string, string>;
	/** The messageId currently accumulating chunks in the render context, for flushing on boundaries. */
	activeMessageId: string | null;
	/** Whether a non-dismissed `session.error` was already rendered into the stream, so the terminal
	 * failure notice doesn't repeat the same error detail. */
	renderedError: boolean;
}

interface ToolRequest {
	readonly name: string;
	readonly toolCallId: string;
	readonly arguments?: unknown;
}

/** Pushes newly-produced render-context parts into a chat response stream, tracking the watermark. */
class StreamSink<TToolCall> {

	private _emittedPartsCount = 0;

	constructor(
		private readonly _stream: vscode.ChatResponseStream,
		private readonly _ctx: ResponseEventRenderContext<TToolCall>,
		private readonly _logService: ILogService,
		private readonly _taskId: string,
	) { }

	flush(): void {
		flushPendingAssistantMessage(this._ctx);
		const parts = this._ctx.currentResponseParts;
		for (let i = this._emittedPartsCount; i < parts.length; i++) {
			try {
				this._stream.push(parts[i] as unknown as vscode.ChatResponsePart);
			} catch (e) {
				this._logService.warn(`[TaskTurnStreamer] stream.push failed for task ${this._taskId}: ${e}`);
			}
		}
		this._emittedPartsCount = parts.length;
	}
}

function delay(ms: number, token: vscode.CancellationToken): Promise<void> {
	return new Promise<void>(resolve => {
		const handle = setTimeout(() => {
			disposable.dispose();
			resolve();
		}, ms);
		const disposable = token.onCancellationRequested(() => {
			clearTimeout(handle);
			disposable.dispose();
			resolve();
		});
	});
}
