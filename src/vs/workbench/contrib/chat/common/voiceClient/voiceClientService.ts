/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IReader, observableValue } from '../../../../../base/common/observable.js';
import { hasKey } from '../../../../../base/common/types.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { VoiceCloseKind } from './voiceCloseCodes.js';
import { IChatToolInvocation, type ChatVoiceProgressStage } from '../chatService/chatService.js';

export function normalizeAgentsVoiceId(value: unknown): string {
	const voiceId = typeof value === 'string' ? value.trim() : '';
	switch (voiceId) {
		case 'harper_neutral':
		case 'birch_neutral':
		case 'junho_neutral':
		case 'oak_neutral':
			return voiceId;
		case 'victoria_neutral':
			return 'harper_neutral';
		case 'maya_neutral':
			return 'birch_neutral';
		case 'daniel_neutral':
			return 'junho_neutral';
		case 'kevin_neutral':
			return 'oak_neutral';
		default:
			return 'birch_neutral';
	}
}

/**
 * One selectable option on a pending question, positioned in *displayed* order.
 *
 * Position is what the user hears and says back ("the second one"), so the list
 * is in `getOptionsWithDefaultsFirst` order and both sides number it by index.
 * `value` is the opaque id the chat model wants back and is never spoken.
 */
export interface IVoicePendingOption {
	label: string;
	value: string;
}

/** One question of a pending question form. */
export interface IVoicePendingQuestion {
	id: string;
	type: 'text' | 'singleSelect' | 'multiSelect';
	title: string;
	allow_freeform: boolean;
	options: IVoicePendingOption[];
}

/**
 * What a coding session is currently waiting on, structurally.
 *
 * `agent_state_detail` describes the same thing as prose, which is enough to
 * *say* but not to *act on*: a spoken answer to a question form has nowhere to
 * land without the ids and options below. `pending_id` + `request_id` route a
 * response back to the exact part that raised it, with no "currently focused
 * session" guesswork.
 *
 * Field names are snake_case because this crosses the voice websocket verbatim.
 */
export interface IVoiceSessionPending {
	type: 'questions' | 'approval';
	pending_id: string;
	request_id: string;
	allow_skip?: boolean;
	message?: string;
	questions?: IVoicePendingQuestion[];
}

/**
 * Per-occurrence tokens for pending response parts.
 *
 * Not the part's index in `response.value`: `Response.clear` and
 * `Response.clearToPreviousToolInvocation` splice that list, so a retry can seat
 * a new part at an index already published to the backend. The backend keys
 * partial answers off this id, so a reused id lets a draft written for one form
 * be submitted against another.
 *
 * Most parts use their own object identity. Tool invocations are different: the
 * agent host can update or rehydrate one tool card while its approval stays
 * pending, and callbacks are implementation details that can be recreated (or
 * retained too long). Tool occurrences therefore use a semantic key plus a
 * timestamped token. An occurrence is retired as soon as any live copy is
 * resolved; the remaining copies retain the retired identity so stale cards
 * cannot become actionable again.
 */
const pendingOccurrenceTokens = new WeakMap<object, string>();
let pendingOccurrenceCounter = 0;

interface IActivePendingToolOccurrence {
	readonly requestId: string;
	readonly semanticKey: string;
	readonly token: string;
	readonly participants: Map<IChatToolInvocation, IDisposable>;
	resolved: boolean;
}

const activePendingToolOccurrences = new Map<string, IActivePendingToolOccurrence>();
const resolvedPendingToolOccurrences = new Map<string, IActivePendingToolOccurrence>();
const pendingToolOccurrenceByPart = new WeakMap<IChatToolInvocation, IActivePendingToolOccurrence>();
const pendingToolOccurrenceById = new Map<string, IActivePendingToolOccurrence>();
const pendingToolResolutionVersion = observableValue('pendingToolResolutionVersion', 0);
const MAX_RESOLVED_PENDING_TOOL_OCCURRENCES = 200;

function isPendingToolState(state: IChatToolInvocation.State): boolean {
	return state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
		|| state.type === IChatToolInvocation.StateKind.WaitingForPostApproval
		|| state.type === IChatToolInvocation.StateKind.WaitingForAuthentication;
}

/** The command currently presented for a tool approval, if it has one. */
export function getVoiceToolApprovalCommand(invocation: IChatToolInvocation, includeParameters = true): string | undefined {
	const terminalData = invocation.toolSpecificData;
	let command: string | undefined;
	if (terminalData?.kind === 'terminal') {
		command = hasKey(terminalData, { commandLine: true })
			? terminalData.commandLine.userEdited
			?? terminalData.presentationOverrides?.commandLine
			?? terminalData.confirmation?.commandLine
			?? terminalData.commandLine.toolEdited
			?? terminalData.commandLine.original
			: terminalData.command;
	}
	if (!command && includeParameters) {
		const state = invocation.state.get();
		const parameters = state.type === IChatToolInvocation.StateKind.Streaming ? undefined : state.parameters as Record<string, unknown> | undefined;
		const parameterCommand = parameters?.['command'] ?? parameters?.['input'];
		command = typeof parameterCommand === 'string' ? parameterCommand : undefined;
	}
	return command?.trim() || undefined;
}

function pendingToolSemanticKey(requestId: string, invocation: IChatToolInvocation): string | undefined {
	const state = invocation.state.get();
	if (!isPendingToolState(state) || !invocation.toolCallId) {
		return undefined;
	}
	const phase = state.type === IChatToolInvocation.StateKind.WaitingForPostApproval
		? 'post'
		: state.type === IChatToolInvocation.StateKind.WaitingForAuthentication
			? 'authentication'
			: 'pre';
	const command = getVoiceToolApprovalCommand(invocation) ?? '';
	const authenticationResource = state.type === IChatToolInvocation.StateKind.WaitingForAuthentication ? state.server.resource : '';
	return JSON.stringify([requestId, invocation.toolCallId, phase, command, authenticationResource]);
}

function releasePendingToolParticipant(invocation: IChatToolInvocation, occurrence: IActivePendingToolOccurrence): void {
	occurrence.participants.get(invocation)?.dispose();
}

function pendingToolOccurrenceId(occurrence: IActivePendingToolOccurrence): string {
	return `${occurrence.requestId}#${occurrence.token}`;
}

function pruneResolvedPendingToolOccurrences(): void {
	while (resolvedPendingToolOccurrences.size > MAX_RESOLVED_PENDING_TOOL_OCCURRENCES) {
		const oldest = resolvedPendingToolOccurrences.entries().next().value;
		if (!oldest) {
			return;
		}
		const [semanticKey, occurrence] = oldest;
		resolvedPendingToolOccurrences.delete(semanticKey);
		if (occurrence.participants.size === 0 && pendingToolOccurrenceById.get(pendingToolOccurrenceId(occurrence)) === occurrence) {
			pendingToolOccurrenceById.delete(pendingToolOccurrenceId(occurrence));
		}
	}
}

function resolvePendingToolOccurrence(occurrence: IActivePendingToolOccurrence): void {
	if (occurrence.resolved) {
		return;
	}
	occurrence.resolved = true;
	if (activePendingToolOccurrences.get(occurrence.semanticKey) === occurrence) {
		activePendingToolOccurrences.delete(occurrence.semanticKey);
	}
	resolvedPendingToolOccurrences.delete(occurrence.semanticKey);
	resolvedPendingToolOccurrences.set(occurrence.semanticKey, occurrence);
	pruneResolvedPendingToolOccurrences();
	pendingToolResolutionVersion.set(pendingToolResolutionVersion.get() + 1, undefined);
}

function pendingToolOccurrence(requestId: string, invocation: IChatToolInvocation, mint: boolean, store?: DisposableStore, restoreResolved = false): IActivePendingToolOccurrence | undefined {
	const semanticKey = pendingToolSemanticKey(requestId, invocation);
	const current = pendingToolOccurrenceByPart.get(invocation);
	if (!semanticKey) {
		if (current) {
			releasePendingToolParticipant(invocation, current);
		}
		return undefined;
	}
	if (current?.semanticKey === semanticKey) {
		return current;
	}
	if (current) {
		// The actionable command changed without a pending-state transition.
		// Retire the old occurrence before publishing the refreshed card.
		resolvePendingToolOccurrence(current);
		releasePendingToolParticipant(invocation, current);
	}

	let occurrence = activePendingToolOccurrences.get(semanticKey);
	if (!occurrence && restoreResolved) {
		occurrence = resolvedPendingToolOccurrences.get(semanticKey);
	}
	if (!occurrence) {
		if (!mint) {
			return undefined;
		}
		occurrence = {
			requestId,
			semanticKey,
			token: `t${Date.now().toString(36)}-${++pendingOccurrenceCounter}`,
			participants: new Map(),
			resolved: false,
		};
		activePendingToolOccurrences.set(semanticKey, occurrence);
		pendingToolOccurrenceById.set(pendingToolOccurrenceId(occurrence), occurrence);
	}

	pendingToolOccurrenceByPart.set(invocation, occurrence);
	const trackedOccurrence = occurrence;
	const observer = new MutableDisposable();
	const tracking = toDisposable(() => {
		if (pendingToolOccurrenceByPart.get(invocation) === trackedOccurrence) {
			pendingToolOccurrenceByPart.delete(invocation);
		}
		store?.deleteAndLeak(tracking);
		if (trackedOccurrence.participants.get(invocation) === tracking) {
			trackedOccurrence.participants.delete(invocation);
		}
		if (trackedOccurrence.participants.size === 0 && activePendingToolOccurrences.get(trackedOccurrence.semanticKey) === trackedOccurrence) {
			activePendingToolOccurrences.delete(trackedOccurrence.semanticKey);
		}
		if (
			trackedOccurrence.participants.size === 0
			&& (!trackedOccurrence.resolved || resolvedPendingToolOccurrences.get(trackedOccurrence.semanticKey) !== trackedOccurrence)
			&& pendingToolOccurrenceById.get(pendingToolOccurrenceId(trackedOccurrence)) === trackedOccurrence
		) {
			pendingToolOccurrenceById.delete(pendingToolOccurrenceId(trackedOccurrence));
		}
		observer.dispose();
	});
	observer.value = autorun(reader => {
		if (!isPendingToolState(invocation.state.read(reader))) {
			// One authoritative copy leaving pending means the user or host handled
			// this occurrence. Retire every rehydrated copy immediately instead of
			// waiting for stale models to catch up.
			resolvePendingToolOccurrence(trackedOccurrence);
			tracking.dispose();
		}
	});
	occurrence.participants.set(invocation, tracking);
	store?.add(tracking);
	return occurrence;
}

/** Compatibility identity for incomplete/test invocation shapes without a protocol tool-call id. */
function fallbackPendingOccurrenceIdentity(part: object): object {
	const invocation = part as Partial<IChatToolInvocation>;
	if (invocation.kind !== 'toolInvocation' || !invocation.state) {
		return part;
	}
	const state = invocation.state.get();
	if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation
		|| state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
		return typeof state.confirm === 'function' ? state.confirm : part;
	}
	if (state.type === IChatToolInvocation.StateKind.WaitingForAuthentication) {
		return typeof state.cancel === 'function' ? state.cancel : part;
	}
	return part;
}

/**
 * Derive the id that routes a voice response back to this exact pending part.
 *
 * Call this only when publishing a part as the session's pending request; it
 * mints a token on first sight. Use `peekPendingId` for an id that came back
 * from the backend, so a part never offered cannot be matched by a stale id.
 */


export function derivePendingId(requestId: string, part: object, store?: DisposableStore): string {
	const invocation = part as Partial<IChatToolInvocation>;
	if (invocation.kind === 'toolInvocation' && invocation.state) {
		const occurrence = pendingToolOccurrence(requestId, invocation as IChatToolInvocation, true, store);
		if (occurrence) {
			return `${requestId}#${occurrence.token}`;
		}
	}

	const fallbackIdentity = fallbackPendingOccurrenceIdentity(part);
	let token = pendingOccurrenceTokens.get(fallbackIdentity);
	if (token === undefined) {
		token = `p${++pendingOccurrenceCounter}`;
		pendingOccurrenceTokens.set(fallbackIdentity, token);
	}
	return `${requestId}#${token}`;
}

/**
 * Retire a published tool approval after the user acts on it.
 *
 * Tool providers are allowed to leave the invocation in a pending state while
 * they send the response to another process. Explicit retirement closes that
 * gap and prevents another live copy from submitting the same approval again.
 */
export function markPendingIdResolved(pendingId: string): boolean {
	const occurrence = pendingToolOccurrenceById.get(pendingId);
	if (!occurrence) {
		return false;
	}
	resolvePendingToolOccurrence(occurrence);
	return true;
}

/** Whether a published tool approval has already been acted on. */
export function isPendingIdResolved(pendingId: string, reader?: IReader): boolean {
	pendingToolResolutionVersion.read(reader);
	return pendingToolOccurrenceById.get(pendingId)?.resolved === true;
}

/** Restore the retired id for a late rehydrated copy of an already-handled tool approval. */
export function restoreResolvedPendingId(requestId: string, part: object, store?: DisposableStore): string | undefined {
	const invocation = part as Partial<IChatToolInvocation>;
	if (invocation.kind !== 'toolInvocation' || !invocation.state) {
		return undefined;
	}
	const occurrence = pendingToolOccurrence(requestId, invocation as IChatToolInvocation, false, store, true);
	return occurrence?.resolved ? pendingToolOccurrenceId(occurrence) : undefined;
}

/**
 * Resolve the id of an already-published pending part, or `undefined`.
 *
 * Does not mint: a part the client never published as pending has no id, so an
 * echoed id can only match the part it was issued for.
 */
export function peekPendingId(requestId: string, part: object): string | undefined {
	const invocation = part as Partial<IChatToolInvocation>;
	if (invocation.kind === 'toolInvocation' && invocation.state) {
		const occurrence = pendingToolOccurrence(requestId, invocation as IChatToolInvocation, false);
		if (occurrence && !occurrence.resolved) {
			return `${requestId}#${occurrence.token}`;
		}
	}
	const token = pendingOccurrenceTokens.get(fallbackPendingOccurrenceIdentity(part));
	return token === undefined ? undefined : `${requestId}#${token}`;
}

/**
 * Session context sent to the voice server for grounding.
 */
export interface IVoiceSessionContext {
	sessions: {
		id: string;
		/** Human-readable name, so the backend can tell two sessions apart. */
		label?: string;
		/** Which frontend session surface owns this conversation. */
		session_type?: 'agent' | 'chat';
		is_active: boolean;
		agent_state: string;
		agent_state_detail?: string;
		confirmation_type?: VoiceConfirmationType;
		/** The model currently selected for this session's next request. */
		selected_model?: IVoiceModelReference;
		/** Names only: file contents remain in the frontend until a request is sent. */
		attachment_names?: string[];
		attachment_count?: number;
		last_response_summary?: string;
		pending?: IVoiceSessionPending;
	}[];
	display_locale: string;
}

export interface IVoiceModelReference {
	readonly identifier: string;
	readonly name: string;
	readonly vendor: string;
}

export type VoiceConfirmationType = 'questionnaire' | 'elicitation' | 'plan' | 'tool' | 'generic';
export type VoiceCheckpointId = ChatVoiceProgressStage;

export function isVoiceCheckpointId(value: unknown): value is VoiceCheckpointId {
	return value === 'investigating' || value === 'planning' || value === 'editing' || value === 'validating' || value === 'recovering';
}

export interface IVoiceCheckpointNarrationMetadata {
	readonly requestId: string;
	readonly checkpointId: VoiceCheckpointId;
	readonly sequence: number;
}

/**
 * What a client-requested narration is speaking. Mirrors `NarrationKind` in the
 * voice backend.
 *
 * `'question'` is spoken verbatim by the backend rather than being paraphrased
 * by the narration model: the numbered options are the ordinals the user says
 * back, so a summary that drops them breaks answering.
 */
export type VoiceNarrationKind = 'response' | 'confirmation' | 'question' | 'checkpoint';

/**
 * Structured outcome of a dispatched voice tool call. The backend speaks an
 * acknowledgement only after seeing one, so a dishonest `ok` becomes the
 * assistant claiming something that never happened.
 */
export interface IVoiceDispatchResult {
	readonly ok: boolean;
	readonly reason?: 'stale_pending' | 'invalid_answer' | 'no_session' | 'unsupported';
}

/**
 * Inbound message types emitted by the voice client service.
 */
export interface IVoiceTranscription {
	readonly text: string;
	readonly status?: 'partial' | 'final';
	readonly committed?: string;
	/** Client capture turn identifier translated from the wire's `turn_id`. */
	readonly turnId?: string;
	/** Monotonically increasing backend revision within a scoped turn. */
	readonly revision?: number;
}

export interface IVoiceAudioResponse {
	readonly audio: string;
	readonly isFirstChunk: boolean;
	readonly isFinal: boolean;
	readonly codingSessionId?: string;
	readonly transcript?: string;
	/** Backend turn identifier from the wire's `turn_id`. */
	readonly turnId?: string;
	/**
	 * Stable id correlating all chunks of ONE narration/response stream, echoed
	 * by the backend from the `narration_id` the client sent on
	 * `request_narration` (or the backend's own `turn_id`). Lets playback routing
	 * decide a response's fate once and keep every chunk on that decision, even
	 * when responses for different sessions interleave. Absent for untagged
	 * direct replies and for backends that don't yet echo it (legacy fallback).
	 */
	readonly responseId?: string;
	readonly requestId?: string;
	readonly checkpointId?: VoiceCheckpointId;
	readonly sequence?: number;
	readonly narrationKind?: VoiceNarrationKind;
	readonly playbackId?: string;
}

export interface IVoiceBargeIn {
	readonly turnId: string;
	readonly interruptedTurnId: string;
}

/** Disposition of a client `request_narration`, reported by `narration_ack`. */
export type IVoiceNarrationDisposition = 'accepted' | 'busy' | 'invalid' | 'suppressed';

/** The backend's acknowledgement of a `request_narration`. */
export interface IVoiceNarrationAck {
	readonly narrationId: string;
	readonly codingSessionId: string;
	readonly disposition: IVoiceNarrationDisposition;
	/** Present on `busy`/`invalid`: why the narration could not play. */
	readonly reason?: string;
}

/**
 * A correlation-only server signal about a previously requested narration:
 * `narration_unblocked` (the guard cleared, you may retry) or
 * `narration_interrupted` (an accepted narration was cancelled by barge-in).
 * Carries no text — the client revalidates against current session state.
 */
export interface IVoiceNarrationSignal {
	readonly narrationId: string;
	readonly codingSessionId: string;
	readonly retryable?: boolean;
	readonly reason?: string;
}

export interface IVoiceToolCall {
	readonly callId: string;
	readonly name: string;
	readonly args: Record<string, unknown>;
}

export interface IVoiceSpeechStarted {
	readonly turnId?: string;
}

export interface IVoiceSessionInit {
	readonly sessionId: string;
}

/**
 * Client turn-endpointing configuration sent to the backend. Serialized
 * verbatim into the ``turn_config`` object on ``start_session`` /
 * ``resume_session`` and the ``set_turn_config`` live-update event, so the
 * field names are snake_case to match the wire contract (same convention as
 * ``IVoiceSessionContext``).
 */
export interface IVoiceTurnConfig {
	/** How (if at all) the backend ends a held turn on its own. */
	readonly auto_end_mode: 'off' | 'vad' | 'phrase' | 'both';
	/** Trailing silence (ms) before VAD ends the turn; used when mode is ``vad``/``both``. The server clamps. */
	readonly silence_ms: number;
	/** Phrases matched at the end of the transcript; the server normalizes and strips them. */
	readonly stop_phrases: readonly string[];
	/** Whether the backend gates ASR on its voice-activity detector. Always ``true``: only forward audio to speech recognition when the VAD hears speech. */
	readonly vad_gate_asr: boolean;
}

/** Why the backend ended the turn on its own. */
export type IVoiceTurnAutoEndReason = 'vad_silence' | 'stop_phrase';

/**
 * Emitted when the backend ends a held turn itself (server VAD silence or a
 * matched stop phrase) while the user is still "holding" push-to-talk. The
 * consumer must treat this like a local ``ptt_end`` — stop capturing/streaming
 * and clear the recording UI — but MUST NOT send its own ``ptt_end`` for the
 * turn. ``turnId`` guards against double-ending.
 */
export interface IVoiceTurnAutoEnded {
	readonly reason: IVoiceTurnAutoEndReason;
	readonly turnId: string;
}

/**
 * Payload for a terminal websocket close. Despite the name this covers every
 * close that will not reconnect, including an expected end of session: `kind`
 * distinguishes them, and an `expected` close must not paint the UI red or
 * raise a toast. `clientSide` marks a failure that never reached the network,
 * such as an unconfigured backend URL.
 */
export interface IVoiceFatalDisconnect {
	readonly code: number;
	readonly reason: string;
	readonly kind?: VoiceCloseKind;
	readonly clientSide?: boolean;
}

/** A recoverable connection problem; the client keeps retrying. */
export interface IVoiceConnectionIssue {
	readonly code: number;
	readonly reason: string;
}

/**
 * One entry in the cross-session timeline the FE replays to the BE on
 * ``start_session``. The BE's coding_agent renders these into a
 * ``[PRIOR_CONTEXT]`` block on the *first* command after reconnect so the
 * model can answer "what were we doing?" / "remember xyz?" without any
 * server-side persistence.
 *
 * Kinds:
 *   user_voice         — what the user said
 *   agent_voice        — what the voice agent spoke back
 *   agent_tool_call    — a tool the voice agent dispatched (send_to_chat, etc.)
 *   coding_event       — a coding-session status transition
 *                        (e.g. ``thinking → waiting_for_confirmation``)
 *   coding_agent_reply — first ~2 sentences of the latest Copilot Chat
 *                        response per active session (synthesized
 *                        FE-side at connect time, never persisted to disk)
 */
export type IVoicePriorTimelineKind =
	| 'user_voice'
	| 'agent_voice'
	| 'agent_tool_call'
	| 'coding_event'
	| 'coding_agent_reply';

export interface IVoicePriorTimelineEntry {
	readonly kind: IVoicePriorTimelineKind;
	/** ISO 8601 wall-clock time of the entry. Used for chronological ordering. */
	readonly timestamp: string;
	/**
	 * Human/LLM-readable one-line summary. The BE renders this directly
	 * into the prompt without further parsing.
	 */
	readonly text: string;
	/** Tool name for ``agent_tool_call`` entries (also encoded inside ``text``). */
	readonly toolName?: string;
	/** Originating coding-session id for ``coding_event`` / ``coding_agent_reply``. */
	readonly codingSessionId?: string;
	/** Status string for ``coding_event`` (e.g. ``thinking``, ``idle``). */
	readonly codingStatus?: string;
}

/**
 * Payload sent to the backend for a user-initiated feedback submission.
 */
export interface IVoiceFeedbackPayload {
	readonly feedbackText: string;
	readonly machineId: string;
	readonly userId: string;
	readonly sessionId: string;
	readonly submissionId: string;
	readonly transcriptHistory: readonly IVoiceFeedbackTranscriptTurn[];
	readonly clientSessionState: Record<string, unknown>;
	readonly clientEnvironment: Record<string, unknown>;
	readonly timestamp: string;
}

export interface IVoiceFeedbackTranscriptTurn {
	readonly role: 'user' | 'assistant';
	readonly text: string;
	readonly timestamp: string;
}

export interface IVoicePttStartOptions {
	readonly hasActiveSession: boolean;
	readonly passive?: boolean;
}

export interface IVoiceClientService {
	readonly _serviceBrand: undefined;

	// --- Connection lifecycle ---
	connect(window: Window & typeof globalThis, authToken?: string): Promise<void>;
	disconnect(): void;

	// --- Outbound messages ---
	sendPttStart(turnId: string, options: IVoicePttStartOptions): void;
	sendPttAudioChunk(audio: string): void;
	sendPttEnd(): void;
	/**
	 * Send a per-press post-mortem diagnostic payload for tail-loss
	 * investigation. Fired ~500ms after `pttUp` by the mic service.
	 * `metrics` is an opaque object echoed straight into a structured
	 * backend log keyed by `turnId`.
	 */
	sendPttDiagnostic(turnId: string, metrics: Record<string, unknown>): void;
	sendSessionContext(context: IVoiceSessionContext): void;
	/**
	 * Synchronously flush any pending debounced ``session_context`` delta on the
	 * wire. Use this before sending a ``session_state_change`` so the backend
	 * has the latest per-session ``last_response_summary`` / ``agent_state``
	 * before it reacts to the state transition (e.g. to run summarisation).
	 * Safe to call when no flush is pending — it just no-ops.
	 */
	flushSessionContext(): void;
	/**
	 * Clear the cached last-sent fields for a session so the next
	 * ``_sendDelta`` treats it as a brand-new session (full field send).
	 * Use when the confirmation detail changes within the same
	 * ``agent_state`` — the normal merge-patch would strip the detail
	 * because the state field itself didn't change.
	 */
	invalidateSessionCache(sessionId: string): void;
	sendToolResult(callId: string, result: string | IVoiceDispatchResult): void;
	/** Report that one correlated checkpoint playback attempt finished locally. */
	sendNarrationPlaybackComplete(codingSessionId: string, narrationId: string, playbackId: string): void;
	/**
	 * Ask the backend to speak `text` for a session now; returns the narration id
	 * echoed on the resulting `audio_response`, or `undefined` if nothing was
	 * sent. Pass `narrationId` to reuse a prior id (a `busy` retry) so the backend
	 * can dedup a lost ack; omit it to mint a fresh one.
	 *
	 * `pending` names the form a `'question'` narration speaks. The backend drops
	 * the request if that form has moved on, and otherwise re-renders whichever
	 * question the form is now waiting on: it owns the draft of answers given so
	 * far, which is why the caller names a form and not a question. `text` is
	 * therefore only spoken verbatim during the debounce window before the
	 * backend's mirror has caught up. The id is deliberately *not* folded into
	 * `text`, which every dedup and retry-reuse guard keys on.
	 */
	requestNarration(codingSessionId: string, kind: VoiceNarrationKind, text: string, narrationId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata, confirmationType?: VoiceConfirmationType, pending?: { pendingId: string }): string | undefined;
	/**
	 * Notify the backend of a session state transition.
	 *
	 * ``detail`` carries the human-readable description of the transition
	 * (e.g. the confirmation prompt content for ``waiting_for_confirmation``)
	 * and ``lastResponseSummary`` carries the agent's last response text for
	 * ``idle`` transitions. Including them inline ensures the BE has the data
	 * it needs to react/summarise without depending on the separate (debounced)
	 * ``session_context`` delta arriving first or being current.
	 */
	sendSessionStateChange(sessionId: string, newState: string, label: string, detail?: string, lastResponseSummary?: string): void;
	stopSpeaking(): void;
	sendStartSession(context: IVoiceSessionContext, machineId: string, priorTimeline?: readonly IVoicePriorTimelineEntry[], turnConfigOverride?: IVoiceTurnConfig, voiceInstructions?: string): void;
	sendResumeSession(context: IVoiceSessionContext, machineId: string, voiceInstructions?: string): void;

	// --- Feedback ---
	submitFeedback(payload: IVoiceFeedbackPayload): Promise<{ ok: boolean; error?: string }>;

	// --- Inbound events ---
	readonly onTranscription: Event<IVoiceTranscription>;
	readonly onAudioResponse: Event<IVoiceAudioResponse>;
	readonly onBargeIn: Event<IVoiceBargeIn>;
	/** Fired on `narration_ack`. Absent from older backends, so consumers must tolerate a narration that is never acked. */
	readonly onNarrationAck: Event<IVoiceNarrationAck>;
	/** Fired when the guard clears for a narration earlier bounced `busy`; see {@link IVoiceNarrationSignal}. */
	readonly onNarrationUnblocked: Event<IVoiceNarrationSignal>;
	/** Fired when an accepted narration is cancelled by barge-in; see {@link IVoiceNarrationSignal}. */
	readonly onNarrationInterrupted: Event<IVoiceNarrationSignal>;
	readonly onToolCall: Event<IVoiceToolCall>;
	readonly onSpeechStarted: Event<IVoiceSpeechStarted>;
	readonly onSessionInit: Event<IVoiceSessionInit>;
	readonly onError: Event<string>;
	readonly onDidChangeConnectionState: Event<boolean>;
	/**
	 * Fired when the current socket will not reconnect: a refusal, an expected
	 * end of session, or a give-up. Consumers should tear down to a clean,
	 * restartable state rather than entering a reconnect loop.
	 */
	readonly onFatalDisconnect: Event<IVoiceFatalDisconnect>;

	/** Fired on a recoverable close so the UI can explain what it is waiting on. */
	readonly onConnectionIssue: Event<IVoiceConnectionIssue>;
	/**
	 * Fired when the backend ends a held turn on its own (server VAD silence or
	 * a matched stop phrase). Consumers stop capturing for that turn and clear
	 * the recording UI without sending their own ``ptt_end``.
	 */
	readonly onTurnAutoEnded: Event<IVoiceTurnAutoEnded>;

	// --- State ---
	readonly isConnected: boolean;
	readonly isResuming: boolean;
	/** Whether the current socket close has an automatic retry scheduled. */
	readonly willReconnect: boolean;
	/** Backend session id assigned by the realtime server, or ``undefined`` when not yet established. */
	readonly currentSessionId: string | undefined;
}

export const IVoiceClientService = createDecorator<IVoiceClientService>('voiceClientService');
export const VOICE_AGENT_PROGRESS_SETTING = 'agents.voice.agentProgress';
