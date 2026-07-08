/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

/**
 * Session context sent to the voice server for grounding.
 */
export interface IVoiceSessionContext {
	sessions: {
		id: string;
		is_active: boolean;
		agent_state: string;
		agent_state_detail?: string;
		last_response_summary?: string;
	}[];
	active_session?: {
		id: string;
		last_message: string | null;
	};
	display_locale?: string;
}

/**
 * Inbound message types emitted by the voice client service.
 */
export interface IVoiceTranscription {
	readonly text: string;
	readonly status?: 'partial' | 'final';
	readonly committed?: string;
}

export interface IVoiceAudioResponse {
	readonly audio: string;
	readonly isFirstChunk: boolean;
	readonly isFinal: boolean;
	readonly codingSessionId?: string;
	readonly transcript?: string;
}

export interface IVoiceToolCall {
	readonly callId: string;
	readonly name: string;
	readonly args: Record<string, unknown>;
}

export interface IVoiceSpeechStarted { }

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
	/** Tri-state: ``true``/``false`` force ASR gating on/off; ``null`` lets the server derive it. */
	readonly vad_gate_asr: boolean | null;
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

export interface IVoiceClientService {
	readonly _serviceBrand: undefined;

	// --- Connection lifecycle ---
	connect(window: Window & typeof globalThis, authToken?: string): Promise<void>;
	disconnect(): void;

	// --- Outbound messages ---
	sendPttStart(turnId: string): void;
	sendPttAudioChunk(audio: string): void;
	sendPttEnd(): void;
	/**
	 * Barge-in: stream raw mic audio while the assistant speaks (hands-free) so
	 * the backend can detect the user talking over it. Not a turn; not transcribed.
	 */
	sendBargeInStart(): void;
	sendBargeInAudioChunk(audio: string): void;
	sendBargeInStop(): void;
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
	sendToolResult(callId: string, result: string): void;
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
	sendStartSession(context: IVoiceSessionContext, machineId: string, priorTimeline?: readonly IVoicePriorTimelineEntry[]): void;
	sendResumeSession(context: IVoiceSessionContext, machineId: string): void;

	// --- Feedback ---
	submitFeedback(payload: IVoiceFeedbackPayload): Promise<{ ok: boolean; error?: string }>;

	// --- Inbound events ---
	readonly onTranscription: Event<IVoiceTranscription>;
	readonly onAudioResponse: Event<IVoiceAudioResponse>;
	readonly onToolCall: Event<IVoiceToolCall>;
	readonly onSpeechStarted: Event<IVoiceSpeechStarted>;
	readonly onSessionInit: Event<IVoiceSessionInit>;
	readonly onError: Event<string>;
	readonly onDidChangeConnectionState: Event<boolean>;
	/**
	 * Fired when the backend ends a held turn on its own (server VAD silence or
	 * a matched stop phrase). Consumers stop capturing for that turn and clear
	 * the recording UI without sending their own ``ptt_end``.
	 */
	readonly onTurnAutoEnded: Event<IVoiceTurnAutoEnded>;

	// --- State ---
	readonly isConnected: boolean;
	readonly isResuming: boolean;
	/** Backend session id assigned by the realtime server, or ``undefined`` when not yet established. */
	readonly currentSessionId: string | undefined;
}

export const IVoiceClientService = createDecorator<IVoiceClientService>('voiceClientService');
