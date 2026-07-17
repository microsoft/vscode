/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, autorun, transaction, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { disposableWindowInterval } from '../../../../../base/browser/dom.js';
import { alert as ariaAlert } from '../../../../../base/browser/ui/aria/aria.js';
import { localize } from '../../../../../nls.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IVoiceTranscriptEntryMetadata, IVoiceTranscriptStore, IVoiceTranscriptTurn, VoiceTranscriptKind } from '../../../agentsVoice/common/voiceTranscriptStore.js';
import { IVoiceClientService, IVoicePriorTimelineEntry, IVoiceSessionContext, IVoiceFeedbackPayload, IVoiceFeedbackTranscriptTurn, IVoiceTranscription, IVoiceTurnAutoEnded, IVoiceNarrationAck, IVoiceNarrationSignal } from '../../common/voiceClient/voiceClientService.js';
import { IMicCaptureService, IPttDiagnostic } from './micCaptureService.js';
import { ITtsPlaybackService } from './ttsPlaybackService.js';
import { IVoiceToolDispatchService, VoiceToolDispatchService } from './voiceToolDispatchService.js';
import { IVoicePlaybackService } from '../../common/voicePlaybackService.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { AgentSessionStatus } from '../agentSessions/agentSessionsModel.js';
import { toAgentHostBackendSessionUri } from '../agentSessions/agentHost/agentHostSessionUri.js';
import { IChatService, IChatToolInvocation, ToolConfirmKind, IChatModelReference } from '../../common/chatService/chatService.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import {
	VoiceFirstConnectClassification, VoiceFirstConnectEvent,
	VoiceSessionStartedClassification, VoiceSessionStartedEvent,
	VoiceSessionEndedClassification, VoiceSessionEndedEvent,
	VoicePttClassification, VoicePttEvent,
	VoiceTtsListenThroughClassification, VoiceTtsListenThroughEvent,
	VoiceToolApprovalClassification, VoiceToolApprovalEvent,
	VoiceReconnectClassification, VoiceReconnectEvent,
	VoiceLatencyClassification, VoiceLatencyEvent,
} from './voiceTelemetry.js';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

/** One buffered audio chunk of a deferred response. */
interface IDeferredChunk {
	readonly audio: string;
	readonly isFirstChunk: boolean;
	readonly isFinal: boolean;
	readonly transcript: string | undefined;
}

/** Result of flushing a session's buffered responses on focus. */
interface IDeferredFlushResult {
	/** True when at least one buffered response was played. */
	readonly flushed: boolean;
	/** Normalized final transcript of every response played, in order. Lets the
	 *  caller mark _lastNarratedText ONLY for text that was actually just read. */
	readonly finalTranscripts: readonly string[];
}

/** One whole deferred response (all its chunks), buffered while its session was
 *  not shown. `finalized` is set once the response's final chunk has arrived. */
interface IDeferredResponse {
	readonly responseId?: string;
	finalized: boolean;
	readonly chunks: IDeferredChunk[];
}

interface IPendingSolicitedNarration {
	readonly sessionId: string;
	readonly kind: 'response' | 'confirmation';
	readonly text: string;
	readonly audioStartTimer: ReturnType<typeof setTimeout>;
	hasReceivedAudio: boolean;
}

export interface IPendingToolConfirmation {
	readonly type: 'approval' | 'input';
	readonly sessionLabel: string;
	readonly sessionResource: URI;
	readonly description: string;
	approve(): void;
	deny(): void;
}

export interface ITranscriptTurn {
	readonly speaker: 'user' | 'assistant';
	readonly text: string;
	/** Stable-recognition prefix of `text`. User turns only; empty otherwise. */
	readonly committed: string;
	/** True while the user is still speaking (live recognition). */
	readonly isPartial: boolean;
}

type TranscriptionTurnPhase = 'active' | 'pending' | 'final';

interface ITranscriptionTurnState {
	readonly turnId: string;
	highestRevision: number | undefined;
	phase: TranscriptionTurnPhase;
}

export interface IVoiceSessionController {
	readonly _serviceBrand: undefined;

	readonly voiceState: IObservable<VoiceState>;
	readonly statusText: IObservable<string>;
	/** Rolling buffer of the last 2 transcript turns (oldest first). */
	readonly transcriptTurns: IObservable<readonly ITranscriptTurn[]>;
	readonly isConnected: IObservable<boolean>;
	readonly isConnecting: IObservable<boolean>;
	readonly isReconnecting: IObservable<boolean>;
	readonly pendingToolConfirmations: IObservable<readonly IPendingToolConfirmation[]>;
	/** The session resource that transcriptions will be sent to. undefined = active session. */
	readonly targetSession: IObservable<URI | undefined>;

	connect(window: Window & typeof globalThis): Promise<void>;
	disconnect(): void;

	pttDown(): void;
	pttUp(): void;

	/**
	 * Stop the current recording / auto-listen loop without disconnecting.
	 * Any in-flight push-to-talk press is finished through the normal
	 * `ptt_end` path (the backend finalizes the turn) and the auto-listen
	 * re-arm loop is suppressed until the user talks again. The WebSocket
	 * stays connected so the user can resume via the Voice Mode button
	 * without a new handshake. Use `disconnect()` to fully end the session.
	 */
	stopListening(): void;

	/**
	 * Stop the current recording WITHOUT finalizing the turn: any in-flight
	 * push-to-talk press is aborted (no `ptt_end` is sent), so the backend
	 * never finalizes the buffered speech into a `send_to_chat`. Use this on
	 * focus changes so speech captured for one session can't be misrouted to a
	 * newly focused session. Like {@link stopListening}, the WebSocket stays
	 * connected and the auto-listen re-arm loop is suppressed until the user
	 * talks again.
	 */
	discardListening(): void;

	/**
	 * Stop listening on a focus change while the user is actively dictating:
	 * finalize the in-flight press (send `ptt_end`) but pin the resulting
	 * submission to `session` — the session the user was dictating into — so
	 * their words are not misrouted to the newly focused session. The WebSocket
	 * stays connected and the auto-listen re-arm loop is suppressed until the
	 * user talks again. Use {@link discardListening} instead when nothing has
	 * been dictated yet.
	 */
	finishListeningAndSubmitTo(session: URI): void;

	/**
	 * Mark a session as having been cancelled by the user from VS Code UI. The
	 * next state-change detected for this session (typically the chat model
	 * transitioning to `idle`) will be suppressed so the backend doesn't
	 * narrate a status update the user already knows about.
	 */
	markUserCancelled(sessionId: string): void;

	/**
	 * Set the target session for transcription. When set, transcriptions are
	 * sent to this session instead of the currently active one.
	 */
	setTargetSession(resource: URI | undefined): void;

	/**
	 * Create a new chat session and set it as the target for transcription.
	 */
	newSessionAsTarget(): void;

	/**
	 * Declares the UI's active session for audio routing (`is_active`, deferral,
	 * and buffered flushes). `undefined` restores focus-based detection.
	 */
	setActiveSessionShown(resource: URI | undefined): void;

	/**
	 * Deterministically route audio to and narrate a session in response to an
	 * explicit UI action (e.g. clicking a session's pending-voice indicator).
	 * Unlike the shown/focus heuristics, this activates even when the session is
	 * already the active/shown one - so a completed background reply the user
	 * clicks to hear is played rather than silently ignored because no focus or
	 * view-model change event fired.
	 */
	activateSession(resource: URI): void;

	/**
	 * Submit user feedback along with full diagnostic data (transcript history,
	 * client state, environment info). Returns success/failure.
	 */
	submitFeedback(feedbackText: string): Promise<{ ok: boolean; error?: string }>;

	/** DEV ONLY: Simulate a connected session with fake transcript for UI testing. */
	simulateConnection(): void;
}

export const IVoiceSessionController = createDecorator<IVoiceSessionController>('voiceSessionController');

export class VoiceSessionController extends Disposable implements IVoiceSessionController {

	declare readonly _serviceBrand: undefined;

	// --- Observables ---
	private readonly _voiceState = observableValue<VoiceState>(this, 'idle');
	readonly voiceState: IObservable<VoiceState> = this._voiceState;

	private readonly _statusText = observableValue<string>(this, 'Tap to start');
	readonly statusText: IObservable<string> = this._statusText;

	// Rolling buffer (max 2). Each `pttDown` and each assistant turn pushes a new
	// entry; the oldest is evicted. Live user transcription mutates the last
	// entry in place while it's still a user turn at the tail.
	private static readonly _MAX_TURNS = 2;
	private readonly _transcriptTurns = observableValue<readonly ITranscriptTurn[]>(this, []);
	readonly transcriptTurns: IObservable<readonly ITranscriptTurn[]> = this._transcriptTurns;

	private readonly _isConnected = observableValue<boolean>(this, false);
	readonly isConnected: IObservable<boolean> = this._isConnected;

	private readonly _isConnecting = observableValue<boolean>(this, false);
	readonly isConnecting: IObservable<boolean> = this._isConnecting;

	private readonly _isReconnecting = observableValue<boolean>(this, false);
	readonly isReconnecting: IObservable<boolean> = this._isReconnecting;

	/** Set when the connection closed terminally (e.g. another window took over
	 *  the session). Suppresses the reconnect display path so the controller
	 *  settles to a clean, restartable state instead of a stuck "Reconnecting...".
	 *  Cleared on the next {@link connect}. */
	private _fatalDisconnect = false;

	private readonly _pendingToolConfirmations = observableValue<readonly IPendingToolConfirmation[]>(this, []);
	readonly pendingToolConfirmations: IObservable<readonly IPendingToolConfirmation[]> = this._pendingToolConfirmations;

	private readonly _targetSession = observableValue<URI | undefined>(this, undefined);
	readonly targetSession: IObservable<URI | undefined> = this._targetSession;

	// --- Internal state ---
	private _pttHeld = false;
	private _pttToggleMode = false;
	/**
	 * True from the backend's `speech_started` until the utterance is finalized
	 * (final transcription / turn ended). Marks a genuinely in-progress user turn
	 * even before any transcription text has arrived.
	 */
	private _userSpeechActive = false;
	/**
	 * True while a passive hands-free barge-in listen is streaming during the
	 * assistant's playback (opened by `_startBargeInListen`). It is NOT toggle
	 * mode — an explicit `pttDown()` promotes this stream into a user-driven
	 * interrupt rather than finishing it. Cleared once the turn ends, is
	 * promoted, or transitions to a normal listening turn when playback stops.
	 */
	private _bargeInListenActive = false;
	/** When true, the auto-listen loop is suppressed (user pressed Stop
	 *  Recording). Cleared on the next explicit `pttDown` or on connect. */
	private _autoListenSuppressed = false;
	/** Timestamp (ms) until which an incoming `send_to_chat` is dropped after a
	 *  discarded turn, so buffered speech from a focus-change discard can't be
	 *  misrouted to the newly focused session. Cleared on the next `pttDown`. */
	private _suppressSendToChatUntil = 0;
	/** One-shot session that the next finalized turn must be submitted to,
	 *  regardless of which session is focused. Set when listening is stopped on
	 *  a focus change while the user is actively dictating, so their words land
	 *  in the session they were dictating into rather than the newly focused
	 *  one. Consumed by the next `send_to_chat`; also cleared on `pttDown` and
	 *  after {@link _PINNED_SUBMIT_EXPIRY_MS}. */
	private _pinnedSubmitSession: URI | undefined;
	private _pinnedSubmitTimer: ReturnType<typeof setTimeout> | undefined;
	/** Armed on a fresh connect (hands-free); consumed on `session_init` to
	 *  enter listening once the backend acks the session. */
	private _enterListenOnSessionInit = false;
	private _pttCurrentTurnId = '';
	private _transcriptionTurnState: ITranscriptionTurnState | undefined;
	private _window: (Window & typeof globalThis) | undefined;
	private readonly _voiceEventDisposables = this._register(new DisposableStore());
	private readonly _voiceAutorunDisposable = this._register(new MutableDisposable());
	/**
	 * Watchdog that resets `isConnecting` (and surfaces feedback) if the connect
	 * handshake never completes. Armed up front in {@link connect} so a step that
	 * hangs (e.g. resolving the GitHub session while a chat request is in flight)
	 * can't leave the toolbar spinner stuck indefinitely.
	 */
	private readonly _connectWatchdog = this._register(new MutableDisposable());
	private static readonly _CONNECT_TIMEOUT_MS = 10000;
	private _connectAttemptGeneration = 0;
	private readonly _autoApprovedSessions = new Set<string>();
	private _transcriptFadeTimer: ReturnType<typeof setTimeout> | undefined;
	private _pttMaxDurationTimer: ReturnType<typeof setTimeout> | undefined;
	private static readonly _PTT_MAX_DURATION_MS = 5 * 60 * 1000;
	/** Short-tap threshold: if the key is held for less than this, enter
	 *  toggle mode where a second tap finishes the recording. */
	private static readonly _PTT_TOGGLE_THRESHOLD_MS = 300;

	/** Debounce before re-entering listening after assistant stops speaking. */
	private static readonly _AUTO_LISTEN_QUIET_MS = 1200;
	private _delayedMicStopTimer: ReturnType<typeof setTimeout> | undefined;
	private _autoListenTimer: ReturnType<typeof setTimeout> | undefined;
	private _pttWaitingForPlayback = false;
	/** Guards auto re-listen: only re-arm after a reply has actually played. */
	private _replyPlayedSinceSend = false;
	/** Set after send_to_chat; blocks auto-listen until the reply TTS starts. */
	private _awaitingReplyAudio = false;
	/**
	 * Session awaiting the user's reply. Other-session narration is unsolicited
	 * even while `_awaitingReplyAudio` is true, so stale on-focus re-reads drop.
	 */
	private _awaitingReplyForSession: string | undefined;
	private _awaitingReplyWatchdog: ReturnType<typeof setTimeout> | undefined;
	/** Tracks whether the initial listen cue has been played after connecting. */
	private _hasPlayedInitialListenCue = false;

	// --- Audio FIFO queue ---
	private readonly _audioQueue: { sessionId: string | undefined; responseId?: string; finalized: boolean; chunks: { audio: string; isFirstChunk: boolean; isFinal: boolean; transcript: string | undefined }[] }[] = [];
	private _currentPlaybackSessionId: string | undefined | null = null; // null = nothing playing
	// The narration id of the response currently occupying the playback slot, if
	// it was a solicited narration. Set when a chunk actually claims the slot and
	// consumed in onPlaybackStopped to mark the reply heard ONLY once its audio
	// has truly finished playing (never merely queued or received - see
	// {@link _markNarrationHeard}).
	private _currentPlaybackResponseId: string | undefined;
	// True once the currently-playing response has received its final audio
	// chunk. A same-session frame arriving after this marks a NEW response and
	// must be serialized (queued) rather than fast-pathed, or its audio would be
	// appended into the finalized playback turn and dropped past `node.stop()`.
	private _currentPlaybackFinalized = false;
	private _isProcessingQueue = false;

	// True while we're suppressing in-flight assistant audio from the previous
	// turn (e.g. user interrupted with PTT). Cleared the moment a new assistant
	// response begins — signalled by `is_first_chunk` on the audio_response —
	// so the next response plays cleanly. Earlier this flag keyed on
	// `transcript` presence, but the streaming pipeline sends a running-concat
	// transcript on every chunk, so a late chunk from the old turn would have
	// incorrectly cleared the flag.
	private _suppressIncomingAudio = false;

	// --- Deferred responses for non-focused sessions ---
	/**
	 * Session resource string most recently *shown* to the user in any chat
	 * widget - updated on focus AND on a widget's view-model swap. `chatWidgetService`
	 * only reports focus for the DOM-focused widget, so opening a session from the
	 * sessions list (which reveals it in the chat view pane without moving DOM
	 * focus off the list) leaves `lastFocusedWidget` pointing at the previously
	 * viewed session. That stale focus makes the first click fail to flush a
	 * buffered response or re-narrate a pending confirmation (it only works on the
	 * second click, once the widget finally takes focus). Tracking the last-shown
	 * session across all widgets closes that gap. */
	private _lastShownSessionId: string | undefined;
	/**
	 * Agents-window active-session override. Beats focus/last-shown heuristics,
	 * which are unreliable with multiple rendered chat widgets.
	 */
	private _activeSessionShown: string | undefined;
	/**
	 * True once an embedder drives the active session via `setActiveSessionShown`.
	 * Focus/last-shown heuristics are then disabled.
	 */
	private _externalActiveSessionMode = false;
	/**
	 * Buffered audio for responses that arrived while their session was not the
	 * one shown to the user. Keyed by session, each session holds a FIFO list of
	 * whole responses (a background session that produces several updates before
	 * the user returns keeps ALL of them, in order). Every response is a group of
	 * audio chunks plus a `finalized` flag (set on its final chunk) so
	 * continuation chunks attach to the still-open response rather than starting a
	 * new one. Flushed - all responses, in order - when the session is shown.
	 */
	private readonly _deferredResponses = new Map<string, IDeferredResponse[]>();
	/**
	 * Maps a backend chat resource string (bare provider scheme, e.g.
	 * `copilotcli:/<id>`) to the UI agent-host session resource string
	 * (`agent-host-<provider>:/<id>`) that owns it. The voice backend tags a
	 * background (unfocused) session's audio with its bare backend id, while the
	 * UI - focus tracking, defer/flush buffer keys, and the sessions-list pending
	 * indicator - all work in the agent-host resource space. Canonicalizing an
	 * incoming id through this map keeps a deferred response's buffer key aligned
	 * with the resource we flush on focus, so it is read exactly once when the
	 * session becomes focused rather than stranded forever. Rebuilt from the live
	 * session list and cleared on disconnect.
	 */
	private readonly _uiResourceByBackendId = new Map<string, string>();
	/** Sessions currently showing a pending-response indicator because they are
	 *  awaiting confirmation while unfocused (client-driven, no audio needed). */
	private readonly _confirmationPendingSessions = new Set<string>();
	/** Sessions showing a pending-response indicator because a reply COMPLETED
	 *  while they were unfocused (client-driven, mirrors the confirmation
	 *  indicator). Maps to the response summary to narrate when the session is
	 *  focused - stored so playback is reliable even if the model has since
	 *  unloaded. Independent of the audio-defer buffer ({@link _deferredResponses}),
	 *  which only exists when the backend proactively sent audio. */
	private readonly _pendingResponseSummaries = new Map<string, string>();
	/**
	 * Keys (session resource string, or ``''`` for untagged audio) of responses
	 * we are currently playing live rather than deferring. Recorded on the first
	 * chunk so the remaining chunks of that response follow the same decision and
	 * a response is never split between playback and the deferred buffer.
	 *
	 * A SET rather than a single key so overlapping responses for DIFFERENT
	 * sessions each keep their own routing: a live reply for session B must not
	 * clear the live route of an in-flight reply for session A (which would send
	 * A's continuation chunks down the focus-based fallback). Two concurrent
	 * responses for the SAME session still can't be told apart without a backend
	 * response/turn id; that remains a known limitation.
	 */
	private readonly _liveReplyKeys = new Set<string>();

	/**
	 * Per-response routing decision, keyed by the backend-echoed `responseId`
	 * (see {@link IVoiceAudioResponse.responseId}). A response's fate (`live` vs
	 * `deferred`) is decided ONCE, when its first chunk is seen, and every later
	 * chunk of that same response follows it - so interleaved responses for
	 * different sessions never steal each other's routing (which a single global
	 * key did) and a response is never split between playback and the buffer. A
	 * deferred entry is flipped to `live` when its session is focused (the buffer
	 * is flushed), so post-flush continuation chunks keep playing. Entries are
	 * removed on the final chunk. Used only when the backend echoes a responseId;
	 * otherwise the legacy session-keyed {@link _liveReplyKeys} path applies.
	 */
	private readonly _responseRoutes = new Map<string, 'live' | 'deferred'>();

	/**
	 * Per-session record of the reply we most recently read for a session (played
	 * live or flushed from the deferred buffer): its transcript and when it was
	 * read. The backend re-emits a session's reply when that session becomes
	 * active (on focus), which would double-read it. We drop a subsequent reply
	 * for the same session ONLY when its transcript matches this one within
	 * `RENARRATION_DEDUPE_WINDOW_MS` - so a genuinely new reply (different text)
	 * always plays, and so does a later identical reply once the window lapses. */
	private readonly _recentlyReadResponse = new Map<string, { transcript: string; at: number }>();
	/** In-flight backend re-narrations we are dropping, so continuation chunks are
	 *  dropped too (not just the first). Keyed by responseId when the backend
	 *  echoes one (so a different same-session response streaming concurrently is
	 *  NOT dropped), else by sessionId as a fallback. */
	private readonly _droppingRenarration = new Set<string>();
	/** Narration ids this client explicitly requested via {@link _narrate} (the
	 *  `narration_id` we sent on `request_narration`, which the backend echoes as
	 *  `responseId` on the audio it produces). Audio whose `responseId` is one of
	 *  these was solicited by us and must never be classified as an unsolicited
	 *  duplicate re-narration, even when its transcript matches content we recently
	 *  read (e.g. narrating a completed reply on focus). Ids are pruned when their
	 *  stream ends (final chunk) and cleared on disconnect. */
	private readonly _solicitedNarrationIds = new Set<string>();
	private static readonly RENARRATION_DEDUPE_WINDOW_MS = 6000;

	/**
	 * Last reply transcript heard per session (persistent, unlike the windowed
	 * `_recentlyReadResponse`). On activation it arms `_recentlyReadResponse` so a
	 * backend re-read of a reply we heard earlier is dropped as a re-narration.
	 */
	private readonly _lastHeardTranscriptById = new Map<string, string>();

	// --- Session audio cache for replay ---
	private readonly _sessionAudioCache = new Map<string, Float32Array>();
	private _replaySourceNode: AudioBufferSourceNode | undefined;

	// --- Session state tracking for explicit change notifications ---
	private readonly _prevSessionStates = new Map<string, { state: string; detail: string; lastResponseSummary: string }>();

	// Sessions the user explicitly cancelled from VS Code UI. We swallow the
	// NEXT state change for each (typically the chat model going `idle`) so the
	// backend doesn't narrate "the session became idle" right after the user
	// already hit Stop. Stored with a safety expiry in case the cancellation
	// never produces a state change.
	private readonly _userCancelledSessions = new Map<string, ReturnType<typeof setTimeout>>();
	private static readonly _USER_CANCEL_SUPPRESS_MS = 10_000;
	/** After a focus-change discard, drop a stray backend `send_to_chat` for
	 *  this long so late-finalized buffered speech isn't misrouted. */
	private static readonly _DISCARD_SEND_SUPPRESS_MS = 2_000;
	/** How long a focus-change submit stays pinned to the original session
	 *  while the backend finalizes the turn and emits `send_to_chat`, before the
	 *  pin is cleared so it can't misroute a much later, unrelated turn. */
	private static readonly _PINNED_SUBMIT_EXPIRY_MS = 15_000;

	// Per-session watchdog timers that re-flush session_context shortly after
	// a confirmation transition. This is a paranoid mitigation: if the
	// transition's immediate flush is dropped (timer race, debounce timing,
	// or WS buffer hiccup), a second flush ~1.5s later guarantees the BE
	// observes the ``waiting_for_confirmation`` state. Subsequent re-sends
	// are no-ops on the BE because the merge-patch detects no field changes.
	private readonly _confirmationFlushWatchdogs = new Map<string, ReturnType<typeof setTimeout>>();
	private static readonly _CONFIRMATION_FLUSH_DELAY_MS = 1500;

	/**
	 * Latest state change per session, buffered and flushed once after a short
	 * settle window (see {@link _emitPendingStateChanges}) so a rapid
	 * ``thinking <-> idle`` replay storm coalesces into a single net emission
	 * instead of spamming the backend with contradictory transitions. Each entry
	 * also records the burst's baseline (``fromState``/``fromDetail``) so a wobble
	 * that returns to its starting state is recognized as net-zero.
	 */
	private readonly _pendingStateChanges = new Map<string, { sessionId: string; currentState: string; label: string; detail?: string; lastResponseSummary?: string; fromState: string; fromDetail: string; fromResponseSummary: string }>();
	private _stateChangeEmitTimer: ReturnType<typeof setTimeout> | undefined;
	private static readonly _STATE_CHANGE_SETTLE_MS = 120;

	/** Model refs eagerly loaded for sessions awaiting input (no UI focus needed). */
	private readonly _eagerModelRefs = new Map<string, IChatModelReference>();

	/** Sessions with an in-flight eager model load, to dedupe concurrent loads. */
	private readonly _eagerModelLoading = new Set<string>();

	/**
	 * Sessions whose ``idle`` transition is being deferred until their chat
	 * model loads, so the narration can include ``last_response_summary``.
	 * While a session id is in this set we suppress emitting a premature,
	 * summary-less ``idle`` to the backend (see _buildSessionContext).
	 */
	private readonly _pendingIdleNarration = new Set<string>();

	/**
	 * Sessions that entered `thinking` during this controller's lifetime and are
	 * therefore genuinely awaiting a completion. A summary-only transition (idle
	 * state unchanged, but `last_response_summary` appeared/changed) only counts
	 * as a NEW reply when the session is in this set - otherwise an OLD summary
	 * surfacing because a dormant model was (re)hydrated would be mistaken for a
	 * fresh response and wrongly light the sessions-list pending indicator.
	 * Armed on an observed idle/waiting→thinking transition (never during eager
	 * loading / replay) and consumed once the resulting idle+summary is accepted.
	 */
	private readonly _sessionsAwaitingResponseSummary = new Set<string>();

	/**
	 * Last response summary captured per session WHILE its chat model was
	 * resident. Copilot/remote session models are disposed as soon as the user
	 * switches away, so a completion that lands while the session is unfocused
	 * would otherwise be reported to the backend as a summary-less ``idle`` and
	 * never narrated (the eager reload to recover the summary races the switch's
	 * re-disposal). Caching the summary here — independent of the model's
	 * lifetime — lets the no-model paths still report ``last_response_summary``.
	 * Refreshed whenever a resident model exposes a summary; cleared when the
	 * session starts a new turn (``thinking``) so a stale reply is never narrated.
	 */
	private readonly _lastResponseSummaryById = new Map<string, string>();

	/**
	 * The exact text last narrated per session, used to de-duplicate narration
	 * requests. Before asking the backend to speak a session's pending item we
	 * check this map: an identical text was already spoken (live or on a prior
	 * focus), so we skip it — this single guard replaces the old summary-identity
	 * dedup, the recently-read window, and the focus/live double-narrate races.
	 * Cleared for a session when it starts a new turn (`thinking`) so a repeated
	 * identical reply later still narrates.
	 */
	private readonly _lastNarratedText = new Map<string, string>();

	/**
	 * Narrations that could not be sent because the socket was closed (see
	 * {@link _narrate}). Replayed once on the next `session_init` so a reply or
	 * confirmation that landed during a disconnect is still spoken on reconnect.
	 */
	private readonly _pendingNarrationRetries = new Map<string, { kind: 'response' | 'confirmation'; text: string }>();

	/**
	 * Narrations we requested (got a `narration_id` back) but whose audio has not
	 * yet finished arriving. Keyed by that narration id. A request being accepted
	 * by the backend is NOT proof the reply was heard - the audio can still be
	 * dropped, deferred, or never returned - so we defer marking the reply as
	 * narrated ({@link _lastNarratedText}) and clearing its pending indicator
	 * until the final audio chunk for this id arrives (see {@link _markNarrationHeard}).
	 * A safety timer releases the in-flight guard if no audio ever comes, so a
	 * later focus/state event can retry rather than the reply being lost.
	 */
	private readonly _pendingSolicitedNarrations = new Map<string, IPendingSolicitedNarration>();
	private static readonly _SOLICITED_NARRATION_AUDIO_START_TIMEOUT_MS = 30_000;

	/**
	 * Narrations the backend bounced (`narration_ack` `busy`) or cancelled
	 * (`narration_interrupted`), awaiting retry. Keyed by canonical session key,
	 * latest-wins (at most one pending per session). Retry is driven by the
	 * `narration_unblocked` nudge, which the server sends only once the playback
	 * guard clears — safe in push-to-talk and hands-free, never interrupting a
	 * live press. See `_retryDeferredNarration` for the revalidation on retry.
	 * Cleared on a new turn (`thinking`) or teardown.
	 */
	private readonly _deferredNarrations = new Map<string, { narrationId: string; kind: 'response' | 'confirmation'; text: string }>();

	/**
	 * The confirmation detail text last actually HEARD (final audio arrived) per
	 * canonical session key. Confirmations are deliberately excluded from
	 * {@link _lastNarratedText} (a tool can legitimately re-raise the identical
	 * prompt), so this is the per-occurrence "already spoken" marker that stops a
	 * still-pending confirmation from being re-narrated on every refocus (see
	 * {@link _activateShownSession}). Recorded only once its audio finalizes (in
	 * {@link _markNarrationHeard}), so a confirmation that was deferred/dropped and
	 * never heard is still retried on focus. Cleared when the session leaves
	 * `waiting_for_confirmation` (in the autorun) so a genuinely new confirmation -
	 * even with identical text - narrates again.
	 */
	private readonly _narratedConfirmation = new Map<string, string>();

	// --- Telemetry tracking ---
	private _telemetrySessionIndex = 0;
	private _telemetrySessionStart: number | undefined;
	private _telemetryTurnCount = 0;
	private _telemetryReconnectCount = 0;
	private _telemetryFirstConnect = true;
	private _telemetryConnectStartMs: number | undefined;
	private _telemetryLastConnectMs: number | undefined;
	private _telemetryPttDownMs: number | undefined;
	private _telemetryPttUpMs: number | undefined;
	private _telemetryFirstTranscriptionMs: number | undefined;
	private _telemetryTtsInterrupted = false;

	// --- Transcript persistence (local-only) ---
	/** Cached GitHub login resolved on connect; used as transcript partition key. */
	private _userLogin: string | undefined;
	/** Locally-persisted turn id of the last assistant turn we appended.
	 * Used as the ancestor of the next user turn we persist. */
	private _lastPersistedTurnId: string | undefined;
	/** Last-N cross-session timeline entries — voice turns, voice tool
	 * calls, coding-session events, plus a synthesized first-2-sentences
	 * summary of the latest Copilot reply per active session. Sent to the
	 * BE on the next start_session and then cleared — single-shot recall. */
	private _pendingPriorTimeline: IVoicePriorTimelineEntry[] = [];
	/**
	 * How many of the most recent persisted timeline entries we forward
	 * to the BE (across all kinds). Coding-agent reply synthesis happens
	 * on top of this — we add one entry per active coding session.
	 */
	private static readonly PRIOR_TIMELINE_ENTRY_LIMIT = 30;
	/**
	 * Max sentences of Copilot's last reply we include per active coding
	 * session when synthesizing ``coding_agent_reply`` entries. Bounded
	 * because the full reply can be arbitrarily long.
	 */
	private static readonly CODING_AGENT_REPLY_SENTENCE_LIMIT = 2;

	constructor(
		@IVoiceClientService private readonly voiceClientService: IVoiceClientService,
		@IMicCaptureService private readonly micCaptureService: IMicCaptureService,
		@ITtsPlaybackService private readonly ttsPlaybackService: ITtsPlaybackService,
		@IVoiceToolDispatchService private readonly voiceToolDispatchService: IVoiceToolDispatchService,
		@IVoicePlaybackService private readonly voicePlaybackService: IVoicePlaybackService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatService private readonly chatService: IChatService,
		@ICommandService private readonly commandService: ICommandService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IVoiceTranscriptStore private readonly voiceTranscriptStore: IVoiceTranscriptStore,
		@ILogService private readonly logService: ILogService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilitySignalService private readonly accessibilitySignalService: IAccessibilitySignalService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		// Track the focused chat session so we can defer voice responses that
		// arrive for a session the user isn't currently looking at, and flush
		// them once that session becomes focused.
		this._register(this.chatWidgetService.onDidChangeFocusedSession(() => this._onFocusedSessionChanged()));

		// `onDidChangeFocusedSession` only fires for the DOM-focused widget, so a
		// session opened into a non-focused widget (e.g. revealed in the chat view
		// pane from the sessions list while focus stays on the list) is missed.
		// Watch every widget's view-model so we also react when a session is
		// *shown* without taking focus - this is what makes a pending confirmation
		// narrate / a buffered response flush on the first click rather than the
		// second.
		for (const widget of this.chatWidgetService.getAllWidgets()) {
			this._trackWidgetSession(widget);
		}
		this._register(this.chatWidgetService.onDidAddWidget(widget => this._trackWidgetSession(widget)));

		// Set up the tool dispatch delegate — uses command bridge for widget ops
		this.voiceToolDispatchService.setDelegate({
			acceptInput: (text: string): boolean => {
				this.commandService.executeCommand('_chat.voice.acceptInput', text).catch(err => {
					this.logService.warn('[voice] acceptInput delegate failed:', err);
				});
				return true;
			},
			getCurrentSessionResource: async (): Promise<URI | undefined> => {
				const resourceStr = await this.commandService.executeCommand<string | undefined>('_chat.voice.getCurrentSession').catch(() => undefined);
				return resourceStr ? URI.parse(resourceStr) : undefined;
			},
			switchToSession: (resource: URI): void => {
				this.commandService.executeCommand('_chat.voice.switchToSession', resource.toString());
			},
			getAutoApprovedSessions: (): Set<string> => {
				return this._autoApprovedSessions;
			},
			addAllAutoApprovedSessions: (): void => {
				const sessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
				for (const s of sessions) {
					this._autoApprovedSessions.add(s.resource.toString());
					const model = this.chatService.getSession(s.resource);
					if (model) {
						for (const req of model.getRequests()) {
							const pending = req.response?.isPendingConfirmation.get();
							if (pending && req.response) {
								for (const part of req.response.response.value) {
									if (part.kind === 'toolInvocation') {
										IChatToolInvocation.confirmWith(part as IChatToolInvocation, { type: ToolConfirmKind.UserAction });
									}
								}
							}
						}
					}
				}
			},
			removeAutoApprovedSession: (resource: string): void => {
				this._autoApprovedSessions.delete(resource);
			},
			triggerAutoApproveCheck: (): void => {
				this._autoApproveCheck();
			},
		});

		// Always-on autorun to track pending tool confirmations across all sessions
		// (both agent sessions AND regular chat sessions).
		this._register(autorun(reader => {
			const agentSessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
			const toolConfirmations: IPendingToolConfirmation[] = [];
			const processedResources = new Set<string>();

			// Collect chat models from agent sessions
			const modelsToCheck: { model: IChatModel; resource: URI; label: string }[] = [];
			for (const s of agentSessions) {
				processedResources.add(s.resource.toString());
				// Keep the backend→UI resource alias fresh so a response the voice
				// backend tags with the bare backend id (for an unfocused session)
				// canonicalizes to this UI resource for defer/flush/pending keys.
				this._recordSessionAlias(s.resource);
				const model = this.chatService.getSession(s.resource);
				if (model) {
					modelsToCheck.push({ model, resource: s.resource, label: s.label || 'Untitled session' });
				}
			}

			// Also collect regular (non-agent) chat sessions reactively
			for (const chatModel of this.chatService.chatModels.read(reader)) {
				const key = chatModel.sessionResource.toString();
				if (processedResources.has(key)) { continue; }
				if (chatModel.getRequests().length === 0) { continue; }
				processedResources.add(key);
				modelsToCheck.push({ model: chatModel, resource: chatModel.sessionResource, label: chatModel.title || 'Chat' });
			}

			for (const { model, resource, label } of modelsToCheck) {
				const lastReq = model.lastRequestObs.read(reader);
				if (lastReq?.response) {
					const pending = lastReq.response.isPendingConfirmation.read(reader);
					if (pending && !this._autoApprovedSessions.has(resource.toString())) {
						const confirmType = this._classifyPendingType(lastReq.response);
						const desc = this._getConfirmationDescription(lastReq.response);
						toolConfirmations.push({
							type: confirmType,
							sessionLabel: label,
							sessionResource: resource,
							description: desc || pending.detail || (confirmType === 'input' ? 'Needs your input' : 'Needs approval'),
							approve: () => {
								if (lastReq.response) {
									for (const part of lastReq.response.response.value) {
										if (part.kind === 'toolInvocation') {
											IChatToolInvocation.confirmWith(part as IChatToolInvocation, { type: ToolConfirmKind.UserAction });
										}
									}
								}
							},
							deny: () => {
								if (lastReq.response) {
									for (const part of lastReq.response.response.value) {
										if (part.kind === 'toolInvocation') {
											IChatToolInvocation.confirmWith(part as IChatToolInvocation, { type: ToolConfirmKind.Denied });
										}
									}
								}
							},
						});
					}

					// Fallback: detect WaitingForConfirmation without confirmationMessages
					// (e.g. askQuestions). Read tool states reactively so the autorun
					// re-fires when a tool enters WaitingForConfirmation.
					if (!pending && !this._autoApprovedSessions.has(resource.toString())) {
						for (const part of lastReq.response.response.value) {
							if (part.kind === 'toolInvocation') {
								const toolState = (part as IChatToolInvocation).state.read(reader);
								if (toolState.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
									const params = toolState.parameters as Record<string, unknown> | undefined;
									const questions = params?.['questions'];
									let desc = '';
									if (Array.isArray(questions) && questions.length > 0) {
										desc = questions.map((q: Record<string, unknown>) => {
											const title = q['header'] || q['question'];
											if (!title) {
												return '';
											}
											const options = q['options'];
											if (Array.isArray(options) && options.length > 0) {
												const labels = options
													.map((o: Record<string, unknown>) => o['label'])
													.filter(Boolean);
												if (labels.length > 0) {
													return `${title}: ${labels.join(', ')}`;
												}
											}
											return title;
										}).filter(Boolean).join('; ');
									}
									toolConfirmations.push({
										type: 'input',
										sessionLabel: label,
										sessionResource: resource,
										description: desc || 'Needs your input',
										approve: () => {
											IChatToolInvocation.confirmWith(part as IChatToolInvocation, { type: ToolConfirmKind.UserAction });
										},
										deny: () => {
											IChatToolInvocation.confirmWith(part as IChatToolInvocation, { type: ToolConfirmKind.Denied });
										},
									});
									break;
								}
							}
						}
					}
				}
			}
			this._pendingToolConfirmations.set(toolConfirmations, undefined);
		}));

		// Register replay/stop commands for VoicePlaybackService
		this._register(CommandsRegistry.registerCommand('_chat.voicePlayback.replay', (_accessor, payload?: { sessionId?: string; transcript?: string }) => {
			const sessionId = payload?.sessionId;
			if (!sessionId) { return; }
			this._replaySessionAudio(sessionId);
		}));
		this._register(CommandsRegistry.registerCommand('_chat.voicePlayback.stop', (_accessor, payload?: { sessionId?: string }) => {
			this._stopReplay();
			if (payload?.sessionId) {
				this.voicePlaybackService.notifyPlaybackEnd(URI.parse(payload.sessionId));
			}
		}));

		this._register({ dispose: () => this.disconnect() });
	}

	async connect(window: Window & typeof globalThis): Promise<void> {
		if (this._isConnecting.get() || this._isConnected.get()) { return; }
		const connectAttemptGeneration = ++this._connectAttemptGeneration;

		this._window = window;
		this._onFocusedSessionChanged();
		this._fatalDisconnect = false;
		this._isConnecting.set(true, undefined);
		this._statusText.set('Connecting...', undefined);
		this._voiceState.set('idle', undefined);
		this._telemetryConnectStartMs = Date.now();

		// Arm the watchdog before any awaited work below (resolving the GitHub
		// session, loading transcripts) so a step that hangs can't leave the
		// toolbar spinner stuck indefinitely — a real report when a chat request
		// is in progress. Cleared on a successful handshake or an explicit
		// disconnect.
		this._armConnectWatchdog();

		// Resolve the GitHub login used as the transcript partition key.
		// Voice Code is tightly coupled to GitHub auth via Copilot — one session
		// is expected to exist. If not, we skip persistence rather than fail.
		let authToken: string | undefined;
		try {
			const sessions = await this.authenticationService.getSessions('github');
			if (connectAttemptGeneration !== this._connectAttemptGeneration) {
				return;
			}
			this._userLogin = sessions[0]?.account.label;
			authToken = sessions[0]?.accessToken;
			if (!this._userLogin) {
				this.logService.warn('[voice] no GitHub session found; transcripts will not be persisted');
			} else {
				// Pick up the most recent prior turn id so the new chain
				// continues off the existing one (cosmetic — we only ever
				// chain locally).
				const lastTurn = (await this.voiceTranscriptStore.loadTurns(this._userLogin, { limit: 1 }))[0];
				if (connectAttemptGeneration !== this._connectAttemptGeneration) {
					return;
				}
				this._lastPersistedTurnId = lastTurn?.turnId;

				// Pull the last few persisted timeline entries (voice turns,
				// voice tool calls, coding events) and synthesize one
				// coding_agent_reply per active session. The BE consumes
				// this once on the first command after reconnect so the
				// model can answer "what were we doing?" / "remember xyz?".
				try {
					const recent = await this.voiceTranscriptStore.loadTurns(
						this._userLogin,
						{ limit: VoiceSessionController.PRIOR_TIMELINE_ENTRY_LIMIT }
					);
					if (connectAttemptGeneration !== this._connectAttemptGeneration) {
						return;
					}
					this._pendingPriorTimeline = this._buildPriorTimeline(recent);
				} catch (err) {
					this.logService.warn('[voice] failed to load prior timeline entries for context', err);
					this._pendingPriorTimeline = [];
				}
			}
		} catch (err) {
			this.logService.warn('[voice] failed to resolve GitHub session', err);
		}

		// The watchdog (or an explicit disconnect) may have reset us while the
		// awaited auth/transcript calls were in flight; bail rather than opening a
		// late connection the user is no longer expecting.
		if (!this._isConnecting.get() || connectAttemptGeneration !== this._connectAttemptGeneration) {
			return;
		}

		this._voiceEventDisposables.clear();

		// Streaming PTT: send start/chunks/end as they arrive
		this._voiceEventDisposables.add(this.micCaptureService.onPttStart(() => {
			this.voiceClientService.sendPttStart(this._pttCurrentTurnId);
		}));
		this._voiceEventDisposables.add(this.micCaptureService.onPttAudioChunk(b64 => {
			this.voiceClientService.sendPttAudioChunk(b64);
		}));
		this._voiceEventDisposables.add(this.micCaptureService.onPttEnd(() => {
			this.voiceClientService.sendPttEnd();
		}));
		this._voiceEventDisposables.add(this.micCaptureService.onPttDiagnostic((diag: IPttDiagnostic) => {
			// Local log so the same correlation key surfaces in the
			// VS Code log files even if the WS is closed mid-flight.
			this.logService.trace(
				`[voice] ptt.diagnostic turn_id=${diag.turnId} ` +
				`msHeld=${diag.msHeld} chunksSent=${diag.chunksSent} samplesSent=${diag.samplesSent} ` +
				`drainFired=${diag.drainFired} drainChunks=${diag.drainChunks} drainSamples=${diag.drainSamples} drainWindowMs=${diag.drainWindowMs} ` +
				`drainSkippedByMute=${diag.drainSkippedByMute} drainSkippedBySuppression=${diag.drainSkippedBySuppression} ` +
				`postReleaseCallbacks=${diag.postReleaseCallbacks} postReleaseSamples=${diag.postReleaseSamples} ` +
				`postReleaseSkippedByMute=${diag.postReleaseSkippedByMute} postReleaseSkippedBySuppression=${diag.postReleaseSkippedBySuppression} ` +
				`postReleaseWindowMs=${diag.postReleaseWindowMs} ` +
				`releasedDuringAcquire=${diag.releasedDuringAcquire} pttUpWithoutCapture=${diag.pttUpWithoutCapture}`
			);
			this.voiceClientService.sendPttDiagnostic(diag.turnId, {
				ms_held: diag.msHeld,
				chunks_sent: diag.chunksSent,
				samples_sent: diag.samplesSent,
				drain_fired: diag.drainFired,
				drain_chunks: diag.drainChunks,
				drain_samples: diag.drainSamples,
				drain_window_ms: diag.drainWindowMs,
				drain_skipped_by_mute: diag.drainSkippedByMute,
				drain_skipped_by_suppression: diag.drainSkippedBySuppression,
				post_release_callbacks: diag.postReleaseCallbacks,
				post_release_samples: diag.postReleaseSamples,
				post_release_skipped_by_mute: diag.postReleaseSkippedByMute,
				post_release_skipped_by_suppression: diag.postReleaseSkippedBySuppression,
				post_release_window_ms: diag.postReleaseWindowMs,
				released_during_acquire: diag.releasedDuringAcquire,
				ptt_up_without_capture: diag.pttUpWithoutCapture,
			});
		}));

		// TTS playback stopped → cache audio, process next in queue or restore status
		this._voiceEventDisposables.add(this.ttsPlaybackService.onPlaybackStopped(() => {
			// Capture the interruption flag FIRST: onPlaybackStopped also fires when
			// playback is stopped intentionally (barge-in, PTT, _interruptAssistantPlayback,
			// disconnect), and we must not treat an interrupted reply as heard.
			const wasInterrupted = this._telemetryTtsInterrupted;
			// Telemetry: TTS listen-through rate
			const listenedToEnd = !wasInterrupted;
			this.telemetryService.publicLog2<VoiceTtsListenThroughEvent, VoiceTtsListenThroughClassification>('voiceTtsListenThrough', {
				listenedToEnd,
				listenedPct: listenedToEnd ? 100 : 50, // approximation; exact % requires tracking audio position
			});
			this._telemetryTtsInterrupted = false;
			// Cache the played audio for replay
			const finishedSessionId = this._currentPlaybackSessionId;
			const samples = this.ttsPlaybackService.getLastPlayedSamples();
			if (samples && finishedSessionId !== null) {
				const cacheKey = finishedSessionId ?? '__generic__';
				this._sessionAudioCache.set(cacheKey, samples);
			}

			this.voicePlaybackService.notifyPlaybackEnd(undefined);
			this._currentPlaybackSessionId = null;
			this._currentPlaybackFinalized = false;
			const finishedResponseId = this._currentPlaybackResponseId;
			this._currentPlaybackResponseId = undefined;
			if (finishedResponseId && !wasInterrupted) {
				// The response actually played to the end: mark it heard (set the
				// exactly-once dedup and clear its pending indicator). This is the
				// only point that means the audio truly played through, not merely
				// that it was queued or received.
				this._markNarrationHeard(finishedResponseId);
			} else if (finishedResponseId && wasInterrupted) {
				// Interrupted before finishing: DON'T mark heard - leave the pending
				// summary + indicator intact so the reply stays retryable. Drop the
				// in-flight solicited-narration guard now (rather than waiting for
				// its timeout) so clicking the session again re-requests immediately.
				const pending = this._pendingSolicitedNarrations.get(finishedResponseId);
				if (pending) {
					this._clearPendingSolicitedNarration(finishedResponseId, pending);
				}
			}

			// Check if there's more in the queue
			if (this._audioQueue.length > 0) {
				setTimeout(() => this._processQueue(), 500);
			} else {
				if (this._pttHeld) {
					if (this._bargeInListenActive) {
						// The passive barge-in turn opened during playback is now
						// a normal listening turn (the user stayed silent through
						// playback). Behave like an auto-listen turn: a tap stops
						// it, and the backend's server-VAD ends it via
						// `turn_auto_ended`.
						this._bargeInListenActive = false;
						this._pttToggleMode = true;
					}
					this._voiceState.set('listening', undefined);
					this._statusText.set('Listening...', undefined);
				} else {
					this._voiceState.set('idle', undefined);
					this._statusText.set('Hold to speak...', undefined);
					if (this._pttWaitingForPlayback) {
						this._scheduleDelayedMicStop();
					}
					// Hands-free: re-enter listening after the assistant's reply
					// audio finishes.
					if (this._isHandsFreeEnabled() && !this._awaitingReplyAudio && this._replyPlayedSinceSend) {
						this._scheduleAutoListen();
					}
				}
			}
		}));

		// Connection state → start mic + send start session
		this._voiceEventDisposables.add(this.voiceClientService.onDidChangeConnectionState(async connected => {
			if (connected) {
				const pbCtx = this.ttsPlaybackService.ensureContext(window);
				pbCtx.resume();

				const isResuming = this.voiceClientService.isResuming;

				// --- Telemetry: session/connect ---
				const now = Date.now();
				const connectMs = this._telemetryConnectStartMs ? now - this._telemetryConnectStartMs : 0;
				if (this._telemetryFirstConnect) {
					this._telemetryFirstConnect = false;
					this.telemetryService.publicLog2<VoiceFirstConnectEvent, VoiceFirstConnectClassification>('voiceFirstConnect', { timeToConnectMs: connectMs });
				}
				if (isResuming) {
					this._telemetryReconnectCount++;
					const secSinceLast = this._telemetryLastConnectMs ? Math.round((now - this._telemetryLastConnectMs) / 1000) : 0;
					this.telemetryService.publicLog2<VoiceReconnectEvent, VoiceReconnectClassification>('voiceReconnect', { timeSinceLastConnectSec: secSinceLast });
				} else {
					this._telemetrySessionIndex++;
					this._telemetrySessionStart = now;
					this._telemetryTurnCount = 0;
					this._telemetryReconnectCount = 0;
					this.telemetryService.publicLog2<VoiceSessionStartedEvent, VoiceSessionStartedClassification>('voiceSessionStarted', { sessionIndex: this._telemetrySessionIndex });
				}
				this._telemetryLastConnectMs = now;
				if (isResuming) {
					this.voiceClientService.sendResumeSession(this._buildSessionContext(), this._getMachineId());
				} else {
					const priorTimeline = this._pendingPriorTimeline;
					this._pendingPriorTimeline = [];
					this.voiceClientService.sendStartSession(this._buildSessionContext(), this._getMachineId(), priorTimeline);
				}

				// On a reconnect cycle, refresh the mic stream: the old MediaStream
				// may have gone stale while the WS was down, so we stop+start to
				// guarantee a clean capture before the user PTTs again.
				if (isResuming) {
					this.micCaptureService.stopCapture();
				}
				this.micCaptureService.prepare(window);
				// Mic is acquired lazily on the first pttDown, not eagerly on
				// connect. This avoids switching bluetooth headsets into speech
				// mode and prevents the backend from hearing ambient audio.

				transaction(tx => {
					this._isConnecting.set(false, tx);
					this._isReconnecting.set(false, tx);
					this._isConnected.set(true, tx);
				});
				// Handshake completed — the connect watchdog is no longer needed.
				this._connectWatchdog.clear();

				// Seed previous session states so existing sessions don't trigger false transitions
				const seededResources = new Set<string>();
				for (const s of this.agentSessionsService.model.sessions.filter(ss => !ss.isArchived())) {
					seededResources.add(s.resource.toString());
					const model = this.chatService.getSession(s.resource);
					const info = model ? this._getAgentStateInfo(model) : undefined;
					const currentState = info?.state
						?? (s.status === AgentSessionStatus.InProgress ? 'thinking'
							: s.status === AgentSessionStatus.NeedsInput ? 'waiting_for_confirmation'
								: s.status === AgentSessionStatus.Completed ? 'idle'
									: 'unknown');
					if (currentState !== 'unknown') {
						this._prevSessionStates.set(s.resource.toString(), { state: currentState, detail: info?.detail ?? '', lastResponseSummary: info?.last_response_summary ?? '' });
					}
				}
				// Also seed regular chat sessions so the autorun doesn't trigger false transitions
				for (const chatModel of this.chatService.chatModels.get()) {
					const key = chatModel.sessionResource.toString();
					if (seededResources.has(key)) { continue; }
					if (chatModel.getRequests().length === 0) { continue; }
					const info = this._getAgentStateInfo(chatModel);
					if (info.state !== 'unknown') {
						this._prevSessionStates.set(key, { state: info.state, detail: info.detail ?? '', lastResponseSummary: info.last_response_summary ?? '' });
					}
				}

				// Reactive session context autorun
				const sessionChangeListener = this.agentSessionsService.model.onDidChangeSessions(() => {
					// Check state changes first so any deferred idle narration is
					// registered (and premature idle suppressed) before we flush
					// the session context to the backend.
					this._checkSessionStateChanges();
					this._sendContext();
				});
				const autorunDisposable = autorun(reader => {
					const agentSessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
					let needsRecheck = false;
					const stateChanges: { sessionId: string; currentState: string; label: string; detail?: string; lastResponseSummary?: string; fromState: string; fromDetail: string; fromResponseSummary: string }[] = [];
					const waitingForConfirmationSessions: { sessionId: string; label: string; detail?: string; transition: boolean }[] = [];
					const processedResources = new Set<string>();

					// --- Helper: subscribe to a chat model's observables and detect state changes ---
					const processModel = (model: IChatModel, resource: URI, label: string) => {
						const sessionId = resource.toString();
						const lastReq = model.lastRequestObs.read(reader);
						if (lastReq?.response) {
							lastReq.response.isIncomplete.read(reader);
							const pending = lastReq.response.isPendingConfirmation.read(reader);

							if (pending && this._autoApprovedSessions.has(sessionId)) {
								for (const part of lastReq.response.response.value) {
									if (part.kind === 'toolInvocation') {
										if (IChatToolInvocation.confirmWith(part as IChatToolInvocation, { type: ToolConfirmKind.UserAction })) {
											needsRecheck = true;
										}
									}
								}
							}

							// Always subscribe to response changes so the autorun
							// re-fires when tool parts change (new confirmations,
							// questions added, or existing ones resolved). Without
							// this, a pending→pending detail change is invisible.
							const responseSignal = observableSignalFromEvent(lastReq.response, lastReq.response.onDidChange);
							responseSignal.read(reader);
						}

						// Detect state changes
						const info = this._getAgentStateInfo(model);
						// Hold a summary-less idle while an eager reload is still
						// replaying this session's response (see _effectiveResidentState),
						// so the idle transition isn't consumed before the summary
						// exists. Once we stop holding, the model is resident with a
						// proper summary, so drop the pending idle deferral.
						const currentState = this._effectiveResidentState(sessionId, info);
						if (currentState === info.state) {
							this._pendingIdleNarration.delete(sessionId);
						}
						const detail = info.detail;
						const lastResponseSummary = info.last_response_summary;
						// Capture the summary while the model is resident so a later
						// completion reported after disposal can still narrate.
						this._cacheResponseSummary(sessionId, info.state, lastResponseSummary);

						const prev = this._prevSessionStates.get(sessionId);
						const normalizedSummary = lastResponseSummary ?? '';
						const isStateTransition = prev !== undefined && prev.state !== currentState && currentState !== 'unknown';
						const isDetailTransition = !isStateTransition && prev !== undefined && currentState === 'waiting_for_confirmation' && (detail ?? '') !== prev.detail;
						// A completed reply's summary often lands AFTER the idle
						// transition (or updates while still idle); the model stays
						// idle so no state transition fires. Detect the summary
						// becoming available/changing as its own narratable transition,
						// mirroring the confirmation detail transition above - but ONLY
						// for a session that actually ran this lifetime (see
						// _sessionsAwaitingResponseSummary), so an old summary surfacing
						// from a rehydrated dormant model isn't mistaken for a new reply.
						const isResponseSummaryTransition = !isStateTransition && prev !== undefined && currentState === 'idle' && !!normalizedSummary && normalizedSummary !== prev.lastResponseSummary && this._sessionsAwaitingResponseSummary.has(sessionId);
						const isTransition = isStateTransition || isDetailTransition || isResponseSummaryTransition;
						if (isTransition) {
							this.logService.trace(`[voice] autorun transition id=${sessionId.slice(-32)} ${prev?.state}→${currentState} detailChanged=${isDetailTransition} summaryChanged=${isResponseSummaryTransition} hasDetail=${!!detail}`);
							// A new turn supersedes prior narration; clear dedup here (before coalescing collapses a fast idle→thinking→idle to net-zero), skipping eager-reload wobble. Arm the awaiting-summary marker so this run's completion (whenever its summary lands) is recognized as new.
							if (currentState === 'thinking' && !this._eagerModelLoading.has(sessionId)) {
								this._clearLastNarratedText(sessionId);
								// A new turn also supersedes any narration deferred from the
								// previous turn. Clear it here in the immediate path because
								// coalescing can collapse an idle→thinking→idle burst to
								// net-zero, so _handleNarratableStateChange never sees the
								// `thinking` and would otherwise leave the stale entry behind.
								this._clearDeferred(this._sessionKey(sessionId));
								this._sessionsAwaitingResponseSummary.add(sessionId);
							}
							// The completion for this run has been accepted; consume the marker so a later rehydration of the same summary can't re-fire.
							if (currentState === 'idle' && !!normalizedSummary) {
								this._sessionsAwaitingResponseSummary.delete(sessionId);
							}
							const cancelExpiry = this._userCancelledSessions.get(sessionId);
							if (cancelExpiry) {
								this.logService.trace(`[voice] autorun swallowing transition (user-cancelled) id=${sessionId.slice(-32)}`);
								clearTimeout(cancelExpiry);
								this._userCancelledSessions.delete(sessionId);
							} else {
								stateChanges.push({ sessionId, currentState, label, detail, lastResponseSummary, fromState: prev?.state ?? currentState, fromDetail: prev?.detail ?? '', fromResponseSummary: prev?.lastResponseSummary ?? '' });
							}
						}
						if (currentState !== 'unknown') {
							// Preserve a known summary rather than clobbering it with ''
							// so a model unload→reload can't manufacture an ''→old-summary
							// "transition" that looks like a fresh reply.
							const rememberedSummary = normalizedSummary || this._lastResponseSummaryById.get(sessionId) || prev?.lastResponseSummary || '';
							this._prevSessionStates.set(sessionId, { state: currentState, detail: detail ?? '', lastResponseSummary: rememberedSummary });
							// Leaving waiting_for_confirmation releases the per-occurrence
							// narration marker, so the next confirmation - even with
							// identical text - is narrated afresh on focus.
							if (currentState !== 'waiting_for_confirmation') {
								this._narratedConfirmation.delete(this._sessionKey(sessionId));
							}
						}

						if (currentState === 'waiting_for_confirmation') {
							waitingForConfirmationSessions.push({ sessionId, label, detail, transition: isTransition });
						}
					};

					// --- Process agent sessions ---
					for (const s of agentSessions) {
						processedResources.add(s.resource.toString());
						const model = this.chatService.getSession(s.resource);
						if (model) {
							processModel(model, s.resource, s.label || 'Untitled session');
						} else {
							// No model loaded — fall back to agent session status
							const sessionId = s.resource.toString();
							const currentState = s.status === AgentSessionStatus.InProgress ? 'thinking'
								: s.status === AgentSessionStatus.NeedsInput ? 'waiting_for_confirmation'
									: s.status === AgentSessionStatus.Completed ? 'idle'
										: 'unknown';
							// A new turn (thinking) supersedes any cached summary even
							// without a resident model, so a later completion never
							// narrates the previous reply.
							this._cacheResponseSummary(sessionId, currentState, undefined);
							if (s.status === AgentSessionStatus.NeedsInput) {
								this._ensureModelLoaded(s.resource);
							}

							const prev = this._prevSessionStates.get(sessionId);
							const isStateTransition = prev !== undefined && prev.state !== currentState && currentState !== 'unknown';

							// Arm the awaiting-summary marker on a genuine new turn so the
							// completion detected once the model loads counts as new.
							if (isStateTransition && currentState === 'thinking') {
								this._sessionsAwaitingResponseSummary.add(sessionId);
							}

							// Remote/Copilot sessions don't keep their model resident, so a
							// coarse ``idle`` transition would carry no last_response_summary
							// and the backend would narrate an empty completion. If we
							// captured the summary while the model was resident, narrate
							// now using the cache. Otherwise defer: eagerly load the model
							// and let the autorun re-fire with the summary once it resolves
							// (do not record the idle state yet so the transition is still
							// detected after the model loads).
							if (isStateTransition && currentState === 'idle') {
								const cachedSummary = this._lastResponseSummaryById.get(sessionId);
								if (!cachedSummary) {
									this._deferIdleNarrationUntilModelLoaded(s.resource);
									continue;
								}
								this._sessionsAwaitingResponseSummary.delete(sessionId);
								if (!this._userCancelledSessions.has(sessionId)) {
									stateChanges.push({ sessionId, currentState, label: s.label || 'Untitled session', lastResponseSummary: cachedSummary, fromState: prev?.state ?? currentState, fromDetail: prev?.detail ?? '', fromResponseSummary: prev?.lastResponseSummary ?? '' });
								}
								this._prevSessionStates.set(sessionId, { state: currentState, detail: '', lastResponseSummary: cachedSummary ?? '' });
								continue;
							}

							if (isStateTransition) {
								const cancelExpiry = this._userCancelledSessions.get(sessionId);
								if (cancelExpiry) {
									clearTimeout(cancelExpiry);
									this._userCancelledSessions.delete(sessionId);
								} else {
									stateChanges.push({ sessionId, currentState, label: s.label || 'Untitled session', fromState: prev?.state ?? currentState, fromDetail: prev?.detail ?? '', fromResponseSummary: prev?.lastResponseSummary ?? '' });
								}
							}
							if (currentState !== 'unknown') {
								// Preserve a known summary rather than clobbering with ''
								// (a later reload of the same summary must not look new).
								const rememberedSummary = this._lastResponseSummaryById.get(sessionId) || prev?.lastResponseSummary || '';
								this._prevSessionStates.set(sessionId, { state: currentState, detail: '', lastResponseSummary: rememberedSummary });
								// Mirror the resident path: drop the confirmation-occurrence
								// marker once this session is no longer awaiting confirmation.
								if (currentState !== 'waiting_for_confirmation') {
									this._narratedConfirmation.delete(this._sessionKey(sessionId));
								}
							}
							if (currentState === 'waiting_for_confirmation') {
								waitingForConfirmationSessions.push({ sessionId, label: s.label || 'Untitled session', detail: undefined, transition: isStateTransition });
							}
						}
					}

					// --- Process regular (non-agent) chat sessions reactively ---
					for (const chatModel of this.chatService.chatModels.read(reader)) {
						const key = chatModel.sessionResource.toString();
						if (processedResources.has(key)) { continue; }
						if (chatModel.getRequests().length === 0) { continue; }
						processedResources.add(key);
						processModel(chatModel, chatModel.sessionResource, chatModel.title || 'Chat');
					}

					if (needsRecheck) {
						setTimeout(() => this._autoApproveCheck(), 500);
					}
					// Evict per-session caches for sessions that are no longer tracked
					// (archived/removed/disposed), so long-lived voice connections don't
					// retain summaries or state for sessions that will never be narrated.
					this._pruneSessionCaches(processedResources);
					// Context tracks per-session state only; it is NO LONGER a narration trigger (backend speaks solely on `request_narration`). Still coalesce so shipped context reflects the settled state.
					if (stateChanges.length > 0) {
						// Coalesce rapid transitions into a single settled emission
						// (see _pendingStateChanges). Buffer the latest change per
						// session (preserving the burst's baseline so a net-zero
						// wobble is recognized) and (re)arm the settle timer; the
						// flush, cache invalidation and timeline persist all happen
						// once the storm settles, in _emitPendingStateChanges().
						//
						// Deliberately do NOT `_sendContext()` here: staging the
						// intermediate (glitching) state into the shared pending
						// context would let a `flushSessionContext()` during the
						// settle window (e.g. _activateShownSession) ship the wobble
						// and bypass coalescing.
						for (const change of stateChanges) {
							const existing = this._pendingStateChanges.get(change.sessionId);
							this._pendingStateChanges.set(change.sessionId, existing
								? { ...change, fromState: existing.fromState, fromDetail: existing.fromDetail, fromResponseSummary: existing.fromResponseSummary }
								: change);
						}
						this._scheduleStateChangeEmit();
					} else {
						this._sendContext();
					}

					// Arm a paranoid re-flush watchdog for any session currently
					// awaiting confirmation. If the immediate flush above is
					// somehow not picked up by the BE (race, debounce hiccup),
					// a second flush ~1.5s later guarantees the state ships.
					// The merge-patch in _sendDelta short-circuits when no
					// fields changed, so re-narration is impossible.
					for (const w of waitingForConfirmationSessions) {
						this._armConfirmationFlushWatchdog(w.sessionId, w.label, w.transition);
					}
					// Clear watchdogs for sessions that are no longer awaiting confirmation
					const stillWaiting = new Set(waitingForConfirmationSessions.map(w => w.sessionId));
					// Keep the sessions-list pending indicator in sync with the set
					// of sessions awaiting confirmation while unfocused.
					this._reconcileConfirmationIndicators(stillWaiting);
					for (const id of [...this._confirmationFlushWatchdogs.keys()]) {
						if (!stillWaiting.has(id)) {
							const t = this._confirmationFlushWatchdogs.get(id);
							if (t) { clearTimeout(t); }
							this._confirmationFlushWatchdogs.delete(id);
						}
					}
					// Release eagerly-loaded model refs for sessions no longer awaiting input
					for (const id of [...this._eagerModelRefs.keys()]) {
						if (!stillWaiting.has(id)) {
							this._eagerModelRefs.get(id)!.dispose();
							this._eagerModelRefs.delete(id);
						}
					}
				});
				// Periodic fallback: check session state changes every 5s
				// to catch transitions missed when the chat model isn't loaded
				// (e.g. remote agent host sessions that haven't been opened).
				const connectionDisposables = new DisposableStore();
				connectionDisposables.add(sessionChangeListener);
				connectionDisposables.add(autorunDisposable);
				connectionDisposables.add(disposableWindowInterval(this._window!, () => this._checkSessionStateChanges(), 5000));
				this._voiceAutorunDisposable.value = connectionDisposables;

				this.micCaptureService.isMuted = false;
				this._statusText.set('Hold to speak...', undefined);
				this._voiceState.set('idle', undefined);

				// Enter listening as soon as a fresh session is ready. Starting
				// voice mode always begins the first turn listening, regardless
				// of `handsFree` (which only controls whether we RE-listen after
				// the assistant speaks). We wait for the backend `session_init`
				// ack (see onSessionInit below) rather than acting here, because
				// the mic/handshake isn't settled yet at connection time.
				// Previously this was deferred until a welcome greeting finished
				// playing, but the greeting was removed. A short fallback timer
				// covers backends that don't emit `session_init`.
				this._enterListenOnSessionInit = !isResuming;
				this.logService.trace(`[voice] connected: isResuming=${isResuming} handsFree=${this._isHandsFreeEnabled()} armListen=${this._enterListenOnSessionInit}`);
				if (this._enterListenOnSessionInit) {
					this._voiceEventDisposables.add(disposableTimeout(() => {
						if (this._enterListenOnSessionInit && this._isConnected.get()) {
							this.logService.trace('[voice] session_init not seen within 750ms; entering listening via fallback');
							this._enterListenOnSessionInit = false;
							this._enterAutoListen();
						}
					}, 750));
				}
			} else if (this._fatalDisconnect) {
				// Terminal close already handled by _handleFatalDisconnect: stay in
				// the clean, restartable state and do NOT enter the reconnect path
				// (which would strand the UI on "Reconnecting..." with no reconnect).
			} else if (this._isConnected.get()) {
				this._onConnectionLost();
			} else if (this._isReconnecting.get()) {
				this._isReconnecting.set(false, undefined);
				this._voiceState.set('idle', undefined);
				this._statusText.set('Tap to start', undefined);
			} else if (this._isConnecting.get()) {
				// Connection failed during initial handshake (e.g. fatal WS close).
				// Clear isConnecting so callers awaiting the state settle properly.
				this._isConnecting.set(false, undefined);
				this._voiceState.set('idle', undefined);
				this._statusText.set('Tap to start', undefined);
			} else {
				this._voiceState.set('idle', undefined);
			}
		}));

		// Session ready: the backend has acked start_session. This is the
		// point at which the mic/handshake is settled and a turn will stick,
		// so enter hands-free listening here (armed in the connect handler).
		this._voiceEventDisposables.add(this.voiceClientService.onSessionInit(() => {
			this.logService.trace(`[voice] session_init received; armListen=${this._enterListenOnSessionInit} pendingRetries=${this._pendingNarrationRetries.size}`);
			// Replay any narration that was dropped because the socket was closed
			// (see _narrate). Do this BEFORE entering listening: a real pending
			// narration should play now (its playback drives re-listen) rather
			// than being torn down right after we start listening. On a normal
			// first connect there are no pending retries, so listening is entered
			// as usual.
			let narrated = false;
			if (this._pendingNarrationRetries.size > 0) {
				const retries = [...this._pendingNarrationRetries.entries()];
				this._pendingNarrationRetries.clear();
				for (const [sessionId, item] of retries) {
					narrated = this._narrate(sessionId, item.kind, item.text) || narrated;
				}
			}
			if (this._enterListenOnSessionInit && !narrated) {
				this._enterListenOnSessionInit = false;
				this._enterAutoListen();
			} else if (narrated) {
				this._enterListenOnSessionInit = false;
			}
		}));

		this._voiceEventDisposables.add(this.voiceClientService.onBargeIn(() => this._handleBargeIn()));

		// NACK + client-revalidation protocol for client-driven narration.
		this._voiceEventDisposables.add(this.voiceClientService.onNarrationAck(e => {
			this._handleNarrationAck(e);
		}));
		this._voiceEventDisposables.add(this.voiceClientService.onNarrationUnblocked(e => {
			this._retryDeferredNarration(this._sessionKey(e.codingSessionId));
		}));
		this._voiceEventDisposables.add(this.voiceClientService.onNarrationInterrupted(e => {
			this._handleNarrationInterrupted(e);
		}));

		// Speech started → stop TTS, suppress late chunks from the previous turn
		// (same flow as pttDown, but for server-VAD path).
		this._voiceEventDisposables.add(this.voiceClientService.onSpeechStarted(() => {
			this._clearAutoListenTimer();
			this._userSpeechActive = true;
			this.ttsPlaybackService.stopPlayback();
			this._audioQueue.length = 0;
			this._currentPlaybackSessionId = null;
			this._currentPlaybackResponseId = undefined;
			this._isProcessingQueue = false;
			this._suppressIncomingAudio = true;
			this._startUserTurn();
		}));

		// Backend ended the held turn itself (server VAD silence / stop phrase).
		// Treat it like a local ptt_end — stop capture, move to processing — but
		// do NOT send our own ptt_end. Guard against double-ending: ignore if we
		// already released locally, or if the id is for a different turn.
		this._voiceEventDisposables.add(this.voiceClientService.onTurnAutoEnded(e => this._handleTurnAutoEnded(e)));

		// Transcription — mutate the current user turn at the tail of the buffer.
		// We DO NOT send the transcript to chat here. The backend voice LLM
		// decides whether the utterance is a task for the coding agent (→ emits
		// a `send_to_chat` tool call, dispatched below) or chit-chat / status
		// (→ replies in speech, nothing sent to chat). Sending directly on
		// transcription would bypass that routing decision and leak chit-chat
		// utterances into the active chat session.
		this._voiceEventDisposables.add(this.voiceClientService.onTranscription(e => this._handleTranscription(e)));

		// Audio response → fade transcript, queue for sequential playback
		this._voiceEventDisposables.add(this.voiceClientService.onAudioResponse(e => {
			// Latency telemetry: first audio chunk marks end of turn
			if (e.isFirstChunk && this._telemetryPttUpMs) {
				const ttft = this._telemetryFirstTranscriptionMs && this._telemetryPttDownMs
					? this._telemetryFirstTranscriptionMs - this._telemetryPttDownMs : 0;
				const e2e = Date.now() - this._telemetryPttUpMs;
				this.telemetryService.publicLog2<VoiceLatencyEvent, VoiceLatencyClassification>('voiceLatency', {
					timeToFirstTranscriptionMs: ttft,
					endToEndTurnMs: e2e,
				});
				this._telemetryPttUpMs = undefined;
			}
			// The backend tags a background (unfocused) session's audio with its
			// bare backend id, while focus tracking and the deferred-buffer keys
			// live in the UI agent-host resource space. Canonicalize once here so a
			// deferred response's buffer key matches the resource we flush on focus
			// (otherwise it is stranded and never read). Untagged / non-agent-host
			// ids pass through unchanged.
			const codingSessionId = this._canonicalSessionId(e.codingSessionId);
			if (e.audio) {
				this._markSolicitedNarrationAudioStarted(e.responseId);
			}
			// If this response is for a session the user isn't currently looking
			// at, don't play it now: buffer it until that session is focused and
			// notify with a short audio cue instead. When the backend echoes a
			// per-response id, the decision is made once (on the first chunk) and
			// every later chunk of that response follows it; otherwise fall back to
			// the legacy session-keyed heuristic.
			// Classify a backend re-narration BEFORE deciding to defer, so a
			// duplicate of a reply we already read is dropped outright rather than
			// buffered and replayed when its session is later focused. Awaited
			// replies bypass this inside _isRenarration.
			const isRenarration = this._isRenarration(e.responseId, codingSessionId, e.transcript, e.isFirstChunk, e.isFinal);
			const defer = isRenarration ? false : this._shouldDeferResponseStream(e.responseId, codingSessionId, e.isFirstChunk);
			if (e.isFirstChunk || e.isFinal) {
				this.logService.trace(`[voice] audio_response codingSessionId=${codingSessionId ?? '<none>'} responseId=${e.responseId?.slice(0, 8) ?? '<none>'} shown=${this._shownSessionId() ?? '<none>'} focused=${this._getFocusedSessionId() ?? '<none>'} external=${this._activeSessionShown ?? '<none>'} awaiting=${this._awaitingReplyForSession ?? '<none>'} isFirstChunk=${e.isFirstChunk} isFinal=${e.isFinal} suppress=${this._suppressIncomingAudio} renarration=${isRenarration} defer=${defer}`);
			}
			if (isRenarration) {
				// Backend re-narrated a reply we already read for this session
				// (matched by content). Drop it so the user never hears it twice.
				this.logService.trace(`[voice] dropping re-narration for session=${codingSessionId} responseId=${e.responseId?.slice(0, 8) ?? '<none>'} isFirstChunk=${e.isFirstChunk} isFinal=${e.isFinal}`);
			} else if (defer) {
				this._deferResponse(codingSessionId!, e.audio, e.isFirstChunk, e.isFinal, e.transcript, e.responseId);
			} else {
				// A fresh reply is about to play live for this session. Anything
				// still buffered for it (earlier background updates the user never
				// returned to hear) must be played FIRST, in order, so nothing is
				// lost - then this newer reply plays after. Guard on responseId so a
				// response being promoted from deferred to live (same id) isn't
				// flushed-and-replayed as if it were a different, older response.
				if (e.isFirstChunk && codingSessionId && this._deferredResponses.has(codingSessionId)
					&& !this._deferredBufferHasResponse(codingSessionId, e.responseId)) {
					this._flushDeferredResponse(codingSessionId);
				}
				this._enqueueAudio(codingSessionId, e.audio, e.isFirstChunk, e.isFinal, e.transcript, e.responseId);
				if (e.isFinal) {
					this._liveReplyKeys.delete(codingSessionId ?? '');
					// Record this heard reply so an immediate backend re-narration
					// of it (on activation) is dropped as a re-read, and so later
					// on-focus re-reads of it are deduped by content. Untagged
					// audio that plays live belongs to the session the user is
					// awaiting a reply for, else the one they're viewing — the same
					// notion the deferral uses. Do NOT use the sticky
					// `_getActiveSessionId()` (input-routing) here: it can point at a
					// not-currently-viewed session and poison another session's dedup
					// (dropping its next reply / misrouting this one). See
					// _reconcileConfirmationIndicators for the same caveat.
					const heardSessionId = codingSessionId ?? this._awaitingReplyForSession ?? this._shownSessionId();
					if (heardSessionId && e.transcript) {
						const heard = this._normalizeTranscript(e.transcript);
						if (heard) {
							const heardKey = this._sessionKey(heardSessionId);
							this._lastHeardTranscriptById.set(heardKey, heard);
							this._recentlyReadResponse.set(heardKey, { transcript: heard, at: Date.now() });
						}
					}
				}
			}
			// On the final chunk we have the complete assistant transcript to persist.
			if (e.isFinal && e.transcript) {
				this._persistTurn('assistant', e.transcript);
			}
			// NOTE: a reply is marked "heard" (dedup set, pending indicator cleared)
			// only when its audio finishes PLAYING - see onPlaybackStopped and the
			// speech-disabled branch of _playChunk, keyed by responseId. Final-chunk
			// RECEIPT here is not proof of playback (the audio may be queued behind
			// another session, or later dropped/interrupted), so we deliberately do
			// not mark it heard at this point.
			// Retire the per-response route once its stream ends. Done last so the
			// route stays inspectable for the whole handler (defer/dedupe/enqueue).
			if (e.isFinal && e.responseId) {
				this._responseRoutes.delete(e.responseId);
			}
		}));

		// Tool calls → dispatch the binary-router tools from the voice LLM.
		// send_to_chat is the LLM's signal that the utterance is a task for the
		// active coding session; the backend has already overwritten args.text
		// with the user's verbatim final transcript, so we just forward it.
		// We route send_to_chat through the controller's own send path (which
		// honors the user-picked _targetSession and the workbench chat
		// commands), not through the generic dispatch service.
		this._voiceEventDisposables.add(this.voiceClientService.onToolCall(e => {
			this.logService.trace(`[voice] tool_call received name=${e.name} coding_session_id=${typeof e.args?.['coding_session_id'] === 'string' ? String(e.args['coding_session_id']).slice(-32) : '<none>'} activeId=${this._getActiveSessionId()?.slice(-32) ?? '<none>'}`);
			const allowedTools = [
				'send_to_chat',
				'get_session_info', 'get_session_changes', 'get_session_thread',
				'approve_confirmation', 'reject_confirmation',
				'auto_approve_session', 'revoke_auto_approve',
				'focus_session',
			];
			if (e.name === 'send_to_chat') {
				// Drop a stray finalization from a turn we just discarded on a
				// focus change, so buffered speech isn't misrouted to the newly
				// focused session.
				if (Date.now() < this._suppressSendToChatUntil) {
					this.logService.trace('[voice] dropping send_to_chat: turn discarded on focus change');
					this.voiceClientService.sendToolResult(e.callId, 'ok');
					return;
				}
				const rawText = typeof e.args?.['text'] === 'string' ? (e.args['text'] as string) : '';
				// Defensively strip a trailing stop phrase (e.g. "send it") that
				// the backend should have removed but sometimes leaves in.
				const text = this._stripStopPhrase(rawText);
				if (text !== rawText && e.args) {
					e.args['text'] = text;
				}
				this._statusText.set(VoiceToolDispatchService.getActionLabel(e.name), undefined);
				this._persistEntry('agent_tool_call', this._renderToolCallSummary(e.name, e.args), {
					toolName: e.name,
					toolArgs: e.args,
				});
				this._setAwaitingReply();
				const sendPromise = text.trim()
					? this._sendTranscriptionToChat(text)
					: Promise.resolve();
				sendPromise.finally(() => {
					this.voiceClientService.sendToolResult(e.callId, 'ok');
					this._voiceState.set('idle', undefined);
					this._statusText.set('Hold to speak...', undefined);
					this._sendContext();
				});
				return;
			}
			if (allowedTools.includes(e.name)) {
				// Answer read-only backend queries without touching PTT/state, so the backend's connect-time probe can't end a just-started auto-listen.
				const passiveTools = ['get_session_info', 'get_session_changes', 'get_session_thread'];
				if (passiveTools.includes(e.name)) {
					this.voiceToolDispatchService.dispatchToolCall(e).then(result => {
						this.voiceClientService.sendToolResult(e.callId, result);
					}, err => {
						// Always answer, even on failure, so the backend isn't left waiting on this callId.
						this.logService.error(`[voice] passive tool ${e.name} dispatch failed`, err);
						this.voiceClientService.sendToolResult(e.callId, 'error');
					});
					return;
				}
				this._statusText.set(VoiceToolDispatchService.getActionLabel(e.name), undefined);
				this._persistEntry('agent_tool_call', this._renderToolCallSummary(e.name, e.args), {
					toolName: e.name,
					toolArgs: e.args,
				});
				// Telemetry: tool approval/rejection via voice
				if (e.name === 'approve_confirmation' || e.name === 'reject_confirmation') {
					this.telemetryService.publicLog2<VoiceToolApprovalEvent, VoiceToolApprovalClassification>('voiceToolApproval', {
						toolName: e.name,
						approved: e.name === 'approve_confirmation',
					});
				}
				// Exit listening mode so the response audio isn't suppressed.
				if (this._pttHeld) {
					this._finishPtt();
				}
				this._suppressIncomingAudio = false;
				this._setAwaitingReply();
				this.voiceToolDispatchService.dispatchToolCall(e).then(result => {
					// Approve/reject outcomes are surfaced for diagnosis, but the
					// backend contract for these has always been a bare 'ok' ack;
					// preserve that so only the diagnostic changes, not behavior.
					if (e.name === 'approve_confirmation' || e.name === 'reject_confirmation') {
						this.logService.trace(`[voice] ${e.name} dispatch result=${result} coding_session_id=${typeof e.args?.['coding_session_id'] === 'string' ? String(e.args['coding_session_id']).slice(-32) : '<none>'}`);
						this.voiceClientService.sendToolResult(e.callId, 'ok');
					} else {
						this.voiceClientService.sendToolResult(e.callId, result);
					}
					this._voiceState.set('idle', undefined);
					this._statusText.set('Hold to speak...', undefined);
					this._sendContext();
				}, err => {
					// Always answer, even on failure, so the backend isn't left waiting on this callId.
					this.logService.error(`[voice] tool ${e.name} dispatch failed`, err);
					this.voiceClientService.sendToolResult(e.callId, 'error');
					this._voiceState.set('idle', undefined);
					this._statusText.set('Hold to speak...', undefined);
					this._sendContext();
				});
			} else {
				// Unknown / disallowed tool — return noop result so the
				// backend doesn't block waiting for us.
				this.voiceClientService.sendToolResult(e.callId, 'ok');
			}
		}));

		// Errors (only surface if not in connecting/reconnect phase)
		this._voiceEventDisposables.add(this.voiceClientService.onError(detail => {
			if (!this._isConnecting.get()) {
				this._voiceState.set('error', undefined);
				this._statusText.set(`Error: ${detail}`, undefined);
			}
		}));

		this._voiceEventDisposables.add(this.voiceClientService.onFatalDisconnect(e => {
			this._handleFatalDisconnect(e.code, e.reason);
		}));

		await this.voiceClientService.connect(window, authToken);
		if (!this._isConnecting.get() || connectAttemptGeneration !== this._connectAttemptGeneration) {
			return;
		}
		// Re-arm so the WebSocket handshake gets a fresh timeout window
		// independent of how long the awaited auth/transcript work took above.
		this._armConnectWatchdog();
	}

	/**
	 * Arms (or re-arms) the watchdog that resets voice mode if the connect
	 * handshake never completes. Without this, a hung connect step leaves the
	 * toolbar spinner spinning forever with no way to recover; on timeout we drop
	 * back to a disconnected state and tell the user so they can retry.
	 */
	private _armConnectWatchdog(): void {
		this._connectWatchdog.value = disposableTimeout(() => {
			if (!this._isConnecting.get() || this._isConnected.get()) {
				return;
			}
			this.logService.warn('[voice] connect handshake timed out; resetting voice mode');
			this.disconnect();
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('voice.connectFailed', "Voice mode could not connect. Please try again."),
			});
		}, VoiceSessionController._CONNECT_TIMEOUT_MS);
	}

	disconnect(): void {
		this._connectAttemptGeneration++;

		// Telemetry: session ended
		if (this._telemetrySessionStart) {
			const durationSec = Math.round((Date.now() - this._telemetrySessionStart) / 1000);
			this.telemetryService.publicLog2<VoiceSessionEndedEvent, VoiceSessionEndedClassification>('voiceSessionEnded', {
				turnCount: this._telemetryTurnCount,
				durationSec,
				reconnectCount: this._telemetryReconnectCount,
			});
			this._telemetrySessionStart = undefined;
		}

		this._isConnecting.set(false, undefined);
		this._isReconnecting.set(false, undefined);
		this._connectWatchdog.clear();
		this._voiceAutorunDisposable.clear();
		this._voiceEventDisposables.clear();
		this.ttsPlaybackService.closeContext();
		this.micCaptureService.stopCapture();
		this.voiceClientService.disconnect();
		this._pttHeld = false;
		this._userSpeechActive = false;
		this._pttToggleMode = false;
		this._pttCurrentTurnId = '';
		this._resetTranscriptionTurn();
		this._bargeInListenActive = false;
		this._isConnected.set(false, undefined);
		this._voiceState.set('idle', undefined);
		this._statusText.set('Tap to start', undefined);
		this._transcriptTurns.set([], undefined);
		this._clearAutoListenTimer();
		this._clearAwaitingReply();
		this._autoListenSuppressed = false;
		this._enterListenOnSessionInit = false;
		this._hasPlayedInitialListenCue = false;
		this._replyPlayedSinceSend = false;
		this._audioQueue.length = 0;
		this._currentPlaybackSessionId = null;
		this._currentPlaybackResponseId = undefined;
		this._isProcessingQueue = false;
		this._suppressIncomingAudio = false;
		this._clearDeferredResponses();
		this._uiResourceByBackendId.clear();
		this._liveReplyKeys.clear();
		this._lastShownSessionId = undefined;
		// Terminal disconnect: drop embedder-driven active-session state too, so a
		// later reconnect starts from focus-based detection until the embedder
		// re-asserts the active session (rather than pinning a stale one and
		// silently ignoring focus events).
		this._activeSessionShown = undefined;
		this._externalActiveSessionMode = false;
		this._recentlyReadResponse.clear();
		this._droppingRenarration.clear();
		this._solicitedNarrationIds.clear();
		this._lastHeardTranscriptById.clear();
		this._awaitingReplyForSession = undefined;
		this._prevSessionStates.clear();
		for (const t of this._userCancelledSessions.values()) { clearTimeout(t); }
		this._userCancelledSessions.clear();
		for (const t of this._confirmationFlushWatchdogs.values()) { clearTimeout(t); }
		this._confirmationFlushWatchdogs.clear();
		if (this._stateChangeEmitTimer) { clearTimeout(this._stateChangeEmitTimer); this._stateChangeEmitTimer = undefined; }
		this._pendingStateChanges.clear();
		for (const ref of this._eagerModelRefs.values()) { ref.dispose(); }
		this._eagerModelRefs.clear();
		this._eagerModelLoading.clear();
		this._pendingIdleNarration.clear();
		this._sessionsAwaitingResponseSummary.clear();
		this._lastResponseSummaryById.clear();
		this._lastNarratedText.clear();
		this._pendingNarrationRetries.clear();
		for (const [narrationId, pending] of this._pendingSolicitedNarrations) {
			this._clearPendingSolicitedNarration(narrationId, pending);
		}
		this._pendingSolicitedNarrations.clear();
		this._deferredNarrations.clear();
		this._narratedConfirmation.clear();
		this._userLogin = undefined;
		this._lastPersistedTurnId = undefined;
		this._pendingPriorTimeline = [];
		this._stopReplay();
		this._sessionAudioCache.clear();
	}

	/** DEV ONLY: Simulate a connected session with fake transcript for UI testing. */
	simulateConnection(): void {
		this._isConnected.set(true, undefined);
		this._isConnecting.set(false, undefined);
		this._voiceState.set('idle', undefined);
		this._statusText.set('Hold to speak...', undefined);

		// Simulate a user speaking after 1s
		this._voiceEventDisposables.add(disposableTimeout(() => {
			if (!this._isConnected.get()) { return; }
			this._voiceState.set('listening', undefined);
			this._transcriptTurns.set([{ speaker: 'user', text: 'Create a', committed: '', isPartial: true }], undefined);
		}, 1000));

		// Partial grows
		this._voiceEventDisposables.add(disposableTimeout(() => {
			if (!this._isConnected.get()) { return; }
			this._transcriptTurns.set([{ speaker: 'user', text: 'Create a new React component', committed: 'Create a ', isPartial: true }], undefined);
		}, 2000));

		// Final user turn
		this._voiceEventDisposables.add(disposableTimeout(() => {
			if (!this._isConnected.get()) { return; }
			this._transcriptTurns.set([{ speaker: 'user', text: 'Create a new React component for the dashboard', committed: 'Create a new React component for the dashboard', isPartial: false }], undefined);
			this._voiceState.set('idle', undefined);
		}, 3000));

		// Assistant response
		this._voiceEventDisposables.add(disposableTimeout(() => {
			if (!this._isConnected.get()) { return; }
			this._transcriptTurns.set([
				{ speaker: 'user', text: 'Create a new React component for the dashboard', committed: 'Create a new React component for the dashboard', isPartial: false },
				{ speaker: 'assistant', text: 'I\'ll create a Dashboard component with some widgets...', committed: '', isPartial: false },
			], undefined);
		}, 4500));
	}

	/**
	 * Handle a terminal, non-recoverable close (e.g. another window took over the
	 * single voice session -> backend closes this one with 4008). Unlike a
	 * transient drop (see {@link _onConnectionLost}), there is no reconnect, so
	 * fully tear down capture/playback and settle to a clean, restartable state
	 * instead of leaving the UI stuck on "Reconnecting...". Fires before the
	 * connection-state change, so `_fatalDisconnect` short-circuits that path.
	 */
	private _handleFatalDisconnect(code: number, reason: string): void {
		this.logService.warn(`[voice] fatal disconnect code=${code} reason=${reason}; tearing down (no reconnect)`);
		this._fatalDisconnect = true;
		// No reconnect is coming: release the mic and playback so the OS
		// mic-in-use indicator clears and no stale audio lingers. Drop any
		// queued/pending audio BEFORE closing the context: closeContext()
		// synchronously fires onPlaybackStopped while audio is active, and that
		// handler re-schedules _processQueue() ~500ms later when the queue is
		// non-empty - which would recreate the context and play stale audio
		// after this terminal disconnect.
		this._audioQueue.length = 0;
		this._currentPlaybackSessionId = null;
		this._currentPlaybackResponseId = undefined;
		this._isProcessingQueue = false;
		this.ttsPlaybackService.closeContext();
		this.micCaptureService.stopCapture();
		this._pttHeld = false;
		this._userSpeechActive = false;
		this._pttToggleMode = false;
		// No reconnect is coming and a later connect() does not reset narration
		// bookkeeping, so clear the deferred/in-flight narration state and its
		// timers here (as disconnect() does). Otherwise a narration_unblocked on a
		// new connection could retry narration from this evicted session, and the
		// solicited-narration safety timers would linger past teardown.
		for (const [narrationId, pending] of this._pendingSolicitedNarrations) {
			this._clearPendingSolicitedNarration(narrationId, pending);
		}
		this._pendingSolicitedNarrations.clear();
		this._solicitedNarrationIds.clear();
		this._pendingNarrationRetries.clear();
		this._deferredNarrations.clear();
		this._narratedConfirmation.clear();
		transaction(tx => {
			this._isConnecting.set(false, tx);
			this._isReconnecting.set(false, tx);
			this._isConnected.set(false, tx);
		});
		this._voiceState.set('error', undefined);
		// Code 4008 = the session was taken over by another window. Surface an
		// actionable message; any other fatal code shows the server reason.
		const message = code === 4008
			? localize('voice.movedToAnotherWindow', "Voice moved to another window. Tap to start.")
			: (reason || localize('voice.fatalDisconnect', "Voice disconnected. Tap to start."));
		this._statusText.set(message, undefined);
		// The status text only renders into a plain div, so screen-reader users
		// otherwise get no notification that recording stopped or that another
		// window took over. Announce it assertively via ARIA.
		ariaAlert(message);
	}

	private _onConnectionLost(): void {
		this.logService.warn('[voice] connection lost, preserving state for reconnect');
		// Don't stop the mic here — keep the MediaStream alive across the
		// transient disconnect so the OS mic-in-use indicator doesn't blink
		// and so reconnection feels seamless. The mic is cycled (stop+start)
		// when the WS comes back, or fully stopped on terminal `disconnect()`.
		this.ttsPlaybackService.closeContext();
		this._pttHeld = false;
		this._pttToggleMode = false;
		this._pttCurrentTurnId = '';
		this._resetTranscriptionTurn();
		this._isConnected.set(false, undefined);
		this._isReconnecting.set(true, undefined);
		this._voiceState.set('idle', undefined);
		this._statusText.set('Reconnecting...', undefined);
	}

	private _beginTranscriptionTurn(turnId: string): void {
		this._transcriptionTurnState = {
			turnId,
			highestRevision: undefined,
			phase: 'active',
		};
	}

	private _markTranscriptionTurnPending(): void {
		if (this._transcriptionTurnState?.turnId === this._pttCurrentTurnId && this._transcriptionTurnState.phase === 'active') {
			this._transcriptionTurnState.phase = 'pending';
		}
	}

	private _resetTranscriptionTurn(): void {
		this._transcriptionTurnState = undefined;
	}

	private _handleTurnAutoEnded(event: IVoiceTurnAutoEnded): void {
		if (!this._pttHeld) {
			return;
		}
		if (event.turnId && event.turnId !== this._pttCurrentTurnId) {
			return;
		}
		this._pttToggleMode = false;
		this._finishPtt('auto');
	}

	private _handleBargeIn(): void {
		this._resetTranscriptionTurn();
		this._interruptAssistantPlayback();
	}

	private _handleTranscription(event: IVoiceTranscription): void {
		const state = this._transcriptionTurnState;
		if (event.turnId) {
			if (!state || state.turnId !== event.turnId || state.phase === 'final') {
				return;
			}
			if (event.revision !== undefined) {
				if (state.highestRevision !== undefined && event.revision <= state.highestRevision) {
					return;
				}
				state.highestRevision = event.revision;
			}
		}

		if (!this._telemetryFirstTranscriptionMs && this._telemetryPttDownMs) {
			this._telemetryFirstTranscriptionMs = Date.now();
		}

		const isPartial = event.status === 'partial';
		// Live (word-by-word) transcripts are opt-in: when disabled, we don't
		// render the interim streaming text as the user speaks and only act on
		// the final transcript, so the user still sees what they said once the
		// utterance settles.
		if (isPartial && !this._isLiveTranscriptEnabled()) {
			return;
		}
		this._updateUserTurn(event.text, event.committed ?? '', isPartial);
		if (isPartial) {
			return;
		}

		if (!this._pttHeld) {
			this._voiceState.set('processing', undefined);
			this._statusText.set('Processing...', undefined);
		}
		this._userSpeechActive = false;
		this._persistTurn('user', event.text);
		if (event.turnId && state) {
			state.phase = 'final';
		}
	}

	pttDown(): void {
		if (!this._isConnected.get()) { this.logService.trace('[voice] pttDown ignored: not connected'); return; }

		// A fresh user press starts a new turn — no longer suppress send_to_chat
		// from a previously discarded turn, nor pin it to a prior session.
		this._suppressSendToChatUntil = 0;
		this._setPinnedSubmitSession(undefined);

		// Toggle mode: second tap finishes recording
		if (this._pttToggleMode) {
			this.logService.trace('[voice] pttDown: toggle-mode second tap -> finishing turn');
			this._pttToggleMode = false;
			this._finishPtt();
			return;
		}

		// Promote a passive barge-in listen into a user-driven interrupt. The
		// mic is already streaming this turn to the backend (ptt_start already
		// sent), so we keep the SAME turn — do NOT re-acquire the mic or send a
		// second ptt_start — and apply the interrupt side effects. Releasing the
		// button afterwards goes through the normal `pttUp()` path.
		if (this._bargeInListenActive) {
			this.logService.trace('[voice] pttDown: promoting passive barge-in listen to user interrupt');
			this._bargeInListenActive = false;
			this._autoListenSuppressed = false;
			this._pttWaitingForPlayback = false;
			// Re-anchor hold timing to the real press so pttUp's tap/hold split works.
			this._telemetryPttDownMs = Date.now();
			this._telemetryFirstTranscriptionMs = undefined;
			this._telemetryTurnCount++;
			this._telemetryTtsInterrupted = this.ttsPlaybackService.isPlaying;
			if (this._delayedMicStopTimer) {
				clearTimeout(this._delayedMicStopTimer);
				this._delayedMicStopTimer = undefined;
			}
			this._cancelTranscriptFade();
			this._startUserTurn();
			this._audioQueue.length = 0;
			this._currentPlaybackSessionId = null;
			this._isProcessingQueue = false;
			this._suppressIncomingAudio = true;
			this.ttsPlaybackService.stopPlayback();
			this._voiceState.set('listening', undefined);
			this._statusText.set('Listening...', undefined);
			if (!this._pttMaxDurationTimer) {
				this._pttMaxDurationTimer = setTimeout(() => {
					if (this._pttHeld) {
						this._statusText.set('Max duration reached', undefined);
						this.pttUp();
					}
				}, VoiceSessionController._PTT_MAX_DURATION_MS);
			}
			return;
		}

		if (this._pttHeld) { this.logService.trace('[voice] pttDown ignored: already held'); return; }
		this._pttHeld = true;
		this._autoListenSuppressed = false;
		this._clearAutoListenTimer();
		this._pttCurrentTurnId = generateUuid();
		this._beginTranscriptionTurn(this._pttCurrentTurnId);
		this._pttWaitingForPlayback = false;
		this._telemetryPttDownMs = Date.now();
		this._telemetryFirstTranscriptionMs = undefined;
		this._telemetryTurnCount++;
		this._telemetryTtsInterrupted = this.ttsPlaybackService.isPlaying;
		if (this._delayedMicStopTimer) {
			clearTimeout(this._delayedMicStopTimer);
			this._delayedMicStopTimer = undefined;
		}
		this._cancelTranscriptFade();
		// New user turn pushed to the rolling buffer — the previous assistant
		// turn (if any) stays visible above as conversation context.
		this._startUserTurn();

		// Cancel the assistant turn fully:
		//   1. ttsPlaybackService.stopPlayback() — kills WebAudio source + invalidates
		//      in-flight decodes via its generation counter.
		//   2. _audioQueue cleared — drop any chunks queued for cross-session playback.
		//   3. _currentPlaybackSessionId reset — _enqueueAudio's fast-path won't append.
		//   4. _suppressIncomingAudio set — any further audio_response chunks the
		//      server has already generated/queued for the previous turn are dropped
		//      in _enqueueAudio. The flag clears on the first chunk of a NEW turn
		//      (carries a transcript) so the next response plays cleanly.
		this._audioQueue.length = 0;
		this._currentPlaybackSessionId = null;
		this._currentPlaybackResponseId = undefined;
		this._isProcessingQueue = false;
		this._suppressIncomingAudio = true;

		this.micCaptureService.isMuted = false;
		this.micCaptureService.suppressUntil(0);
		// Lazily acquire the mic — fire-and-forget. The mic service handles
		// the case where the user releases before acquisition completes.
		this.micCaptureService.pttDown(this._pttCurrentTurnId).catch((err) => {
			this.logService.warn('[voice] mic acquisition failed on pttDown; disconnecting', err);
			this._pttHeld = false;
			this._statusText.set('Microphone denied', undefined);
			this._voiceState.set('error', undefined);
			// Disconnect entirely so the user isn't stuck in a connected state
			// with no way to record. The notification from micCaptureService
			// tells them how to fix permissions.
			if (this._pttMaxDurationTimer) {
				clearTimeout(this._pttMaxDurationTimer);
				this._pttMaxDurationTimer = undefined;
			}
			this.disconnect();
		});
		this.ttsPlaybackService.stopPlayback();
		this._voiceState.set('listening', undefined);
		this._statusText.set('Listening...', undefined);
		// Audible cue: for non-screen-reader users, only play on the first
		// listen after connecting. For screen reader users, play every time.
		if (this._isHandsFreeEnabled()) {
			if (!this._hasPlayedInitialListenCue) {
				this._hasPlayedInitialListenCue = true;
				this.accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStarted);
			} else if (this.accessibilityService.isScreenReaderOptimized()) {
				this.accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStarted);
			}
		}

		this._pttMaxDurationTimer = setTimeout(() => {
			if (this._pttHeld) {
				this._statusText.set('Max duration reached', undefined);
				this.pttUp();
			}
		}, VoiceSessionController._PTT_MAX_DURATION_MS);
	}

	pttUp(): void {
		if (!this._pttHeld) { return; }

		// Short tap: enter toggle mode — keep recording until next tap
		const holdMs = this._telemetryPttDownMs ? Date.now() - this._telemetryPttDownMs : Infinity;
		if (holdMs < VoiceSessionController._PTT_TOGGLE_THRESHOLD_MS) {
			this._pttToggleMode = true;
			return;
		}

		this._finishPtt();
	}

	stopListening(): void {
		// Stop the current recording / auto-listen loop WITHOUT tearing down
		// the WebSocket. Any in-flight press is finished through the normal
		// `ptt_end` path so the backend finalizes the turn; the auto-listen
		// re-arm loop (auto-send mode) is suppressed until the user talks
		// again. The connection stays open so the user can resume via the
		// Voice Mode button without a new handshake.
		if (!this._isConnected.get()) { return; }
		this._autoListenSuppressed = true;
		this._pttToggleMode = false;
		this._clearAutoListenTimer();
		if (this._pttHeld) {
			this._finishPtt('local');
		} else {
			this._voiceState.set('idle', undefined);
			this._statusText.set('Tap to start', undefined);
		}
	}

	discardListening(): void {
		// Stop the current recording WITHOUT finalizing the turn. Any in-flight
		// press is aborted (mic drops its buffer, NO `ptt_end` is sent) so the
		// backend never turns the buffered speech into a `send_to_chat` — which
		// would otherwise be routed to the now-focused session. Also drop a
		// stray `send_to_chat` the backend may already have in flight (e.g. it
		// auto-ended the turn via VAD before we discarded).
		if (!this._isConnected.get()) { return; }
		this._autoListenSuppressed = true;
		this._pttToggleMode = false;
		this._clearAutoListenTimer();
		this._suppressSendToChatUntil = Date.now() + VoiceSessionController._DISCARD_SEND_SUPPRESS_MS;
		if (this._pttHeld) {
			this._finishPtt('discard');
		} else {
			this._voiceState.set('idle', undefined);
			this._statusText.set('Tap to start', undefined);
		}
	}

	finishListeningAndSubmitTo(session: URI): void {
		// Stop listening on a focus change, but the user has already dictated —
		// so finalize the turn (send `ptt_end`) and pin the resulting
		// `send_to_chat` to `session` (the session they were dictating into) so
		// their words aren't misrouted to the newly focused session.
		if (!this._isConnected.get()) { return; }
		this._autoListenSuppressed = true;
		this._pttToggleMode = false;
		this._clearAutoListenTimer();
		this._setPinnedSubmitSession(session);
		if (this._pttHeld) {
			this._finishPtt('local');
		} else {
			// The backend already auto-ended the turn (VAD) and a `send_to_chat`
			// is in flight; the pin routes it. Reflect the pending submission.
			this._voiceState.set('processing', undefined);
			this._statusText.set('Processing...', undefined);
		}
	}

	private _setPinnedSubmitSession(session: URI | undefined): void {
		if (this._pinnedSubmitTimer) {
			clearTimeout(this._pinnedSubmitTimer);
			this._pinnedSubmitTimer = undefined;
		}
		this._pinnedSubmitSession = session;
		if (session) {
			this._pinnedSubmitTimer = setTimeout(() => {
				this._pinnedSubmitTimer = undefined;
				this._pinnedSubmitSession = undefined;
			}, VoiceSessionController._PINNED_SUBMIT_EXPIRY_MS);
		}
	}

	private _consumePinnedSubmitSession(): URI | undefined {
		const pinned = this._pinnedSubmitSession;
		if (pinned) {
			this._setPinnedSubmitSession(undefined);
		}
		return pinned;
	}

	/**
	 * Finish the current push-to-talk press.
	 *
	 * ``reason`` is ``'local'`` for a user-driven end (button release / toggle
	 * tap / keyword) — the mic drains its tail and the ``onPttEnd`` → ``ptt_end``
	 * path fires. It is ``'auto'`` when the backend ended the turn itself
	 * (``turn_auto_ended``): the mic is aborted with no drain and NO ``ptt_end``
	 * is sent for the turn. ``'immediate'`` is for a known-silent passive turn:
	 * abort with no drain and send ``ptt_end`` synchronously so the backend
	 * clears its ``user_is_speaking`` latch before the next frame. ``'discard'``
	 * throws the press away on a focus change: like ``'auto'`` the mic is aborted
	 * with NO ``ptt_end`` (so the backend never finalizes it into a
	 * `send_to_chat`), but the state settles to ``idle`` rather than
	 * ``processing`` since nothing is being sent.
	 */
	private _finishPtt(reason: 'local' | 'auto' | 'immediate' | 'discard' = 'local'): void {
		// End toggle (hands-free) mode on every turn-ending path — even when not held — so an out-of-band finish can't leave a stale toggle that self-kills the next auto-listen.
		this._pttToggleMode = false;
		this._bargeInListenActive = false;
		if (!this._pttHeld) { return; }
		this._clearAutoListenTimer();
		this._pttHeld = false;
		this._userSpeechActive = false;
		// End toggle (hands-free) mode on every turn-ending path, so an out-of-band finish can't leave a stale toggle that self-kills the next auto-listen.
		this._pttToggleMode = false;
		this._telemetryPttUpMs = Date.now();
		const holdMs = this._telemetryPttDownMs ? Date.now() - this._telemetryPttDownMs : 0;
		this.telemetryService.publicLog2<VoicePttEvent, VoicePttClassification>('voicePtt', { holdDurationMs: holdMs });
		if (this._pttMaxDurationTimer) {
			clearTimeout(this._pttMaxDurationTimer);
			this._pttMaxDurationTimer = undefined;
		}
		this._voiceState.set('processing', undefined);
		this._statusText.set('Processing...', undefined);
		this._replyPlayedSinceSend = false;
		this._clearAwaitingReply();
		this._suppressIncomingAudio = false;
		this._markTranscriptionTurnPending();
		if (reason === 'auto' || reason === 'discard') {
			// Backend already ended the turn, or we're discarding it — stop
			// capturing without draining more audio and without emitting our
			// own ptt_end.
			this.micCaptureService.abortPtt();
		} else if (reason === 'immediate') {
			// Silent passive turn: stop now (no drain) and send ptt_end synchronously so a following narration request isn't NACK'd `busy: user_speaking`.
			this.micCaptureService.abortPtt();
			this.voiceClientService.sendPttEnd();
		} else {
			this.micCaptureService.pttUp();
		}
		if (reason === 'discard') {
			// Nothing is being sent, so don't leave the UI stuck in 'Processing'.
			this._voiceState.set('idle', undefined);
			this._statusText.set('Tap to start', undefined);
		}
		if (this.accessibilityService.isScreenReaderOptimized()) {
			this.accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStopped);
		}
	}

	markUserCancelled(sessionId: string): void {
		const existing = this._userCancelledSessions.get(sessionId);
		if (existing) { clearTimeout(existing); }
		const expiry = setTimeout(() => {
			this._userCancelledSessions.delete(sessionId);
		}, VoiceSessionController._USER_CANCEL_SUPPRESS_MS);
		this._userCancelledSessions.set(sessionId, expiry);
	}

	setTargetSession(resource: URI | undefined): void {
		this._targetSession.set(resource, undefined);
	}

	newSessionAsTarget(): void {
		const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
		const resource = ref.object.sessionResource;
		ref.dispose();
		this._targetSession.set(resource, undefined);
		// Try to switch the view to the new session (works if chat pane is open)
		this.commandService.executeCommand('_chat.voice.switchToSession', resource.toString()).catch(() => { /* pane may not exist */ });
	}

	private _scheduleDelayedMicStop(): void {
		if (this._delayedMicStopTimer) {
			clearTimeout(this._delayedMicStopTimer);
		}
		this._delayedMicStopTimer = setTimeout(() => {
			this._delayedMicStopTimer = undefined;
			this._pttWaitingForPlayback = false;
		}, 1000);
	}

	private _isHandsFreeEnabled(): boolean {
		// Default-off: hands-free auto-listen is opt-in, so only an explicit
		// `true` enables it. An unresolved/undefined value resolves to the
		// `handsFree` default (`false`) and stays disabled.
		return this.configurationService.getValue<boolean>('agents.voice.handsFree') === true;
	}

	private _isLiveTranscriptEnabled(): boolean {
		// Default-off: live word-by-word transcripts are opt-in, so only an
		// explicit `true` enables the interim rendering. An unresolved/undefined
		// value resolves to the `liveTranscript` default (`false`).
		return this.configurationService.getValue<boolean>('agents.voice.liveTranscript') === true;
	}

	/**
	 * Strip a trailing stop phrase (e.g. "send it") from a transcript before it
	 * is sent to chat. The backend is supposed to strip the matched phrase from
	 * `agents.voice.turn.stopPhrases`, but when it doesn't the raw phrase leaks
	 * into the request, so we defensively strip it client-side. Matching is
	 * case-insensitive, ignores trailing punctuation, and only strips on a word
	 * boundary so phrases aren't removed from the middle of a word.
	 */
	private _stripStopPhrase(text: string): string {
		const raw = this.configurationService.getValue<string[]>('agents.voice.turn.stopPhrases');
		const phrases = Array.isArray(raw)
			? raw.map(p => (typeof p === 'string' ? p.trim() : '')).filter(p => p.length > 0)
			: [];
		if (phrases.length === 0) {
			return text;
		}
		// Strip trailing punctuation that speech recognizers often append.
		const trimmed = text.trimEnd().replace(/[.,!?;:]+$/, '').trimEnd();
		const trimmedLower = trimmed.toLowerCase();
		// Prefer the longest matching phrase so more specific phrases win.
		const sorted = [...phrases].sort((a, b) => b.length - a.length);
		for (const phrase of sorted) {
			const phraseLower = phrase.toLowerCase();
			if (!trimmedLower.endsWith(phraseLower)) {
				continue;
			}
			const idx = trimmed.length - phrase.length;
			// Only strip on a word boundary (start of string or preceded by
			// whitespace) so "out" isn't removed from "checkout".
			if (idx === 0 || /\s/.test(trimmed[idx - 1])) {
				return trimmed.slice(0, idx).replace(/[.,!?;:\s]+$/, '');
			}
		}
		return text;
	}

	/** Re-enter listening via synthetic short tap. */
	private _enterAutoListen(): void {
		this._clearAutoListenTimer();
		if (this._autoListenSuppressed || !this._isConnected.get() || this._pttHeld) {
			this.logService.trace(`[voice] _enterAutoListen skipped: suppressed=${this._autoListenSuppressed} connected=${this._isConnected.get()} pttHeld=${this._pttHeld}`);
			return;
		}
		// Don't enter listening if audio is still playing or queued.
		if (this.ttsPlaybackService.isPlaying || this._audioQueue.length > 0 || this._currentPlaybackSessionId !== null) {
			this.logService.trace(`[voice] _enterAutoListen skipped: audio busy (playing=${this.ttsPlaybackService.isPlaying} queue=${this._audioQueue.length} pbSession=${this._currentPlaybackSessionId !== null})`);
			return;
		}
		this.logService.trace('[voice] _enterAutoListen entering listening');
		this.pttDown();
		this.pttUp();
	}

	/**
	 * Hands-free barge-in listen: open a passive PTT streaming turn WITHOUT
	 * interrupting the assistant's playback, so the backend's server-VAD keeps
	 * receiving mic audio and can detect the user talking over the assistant.
	 *
	 * Unlike `pttDown()` (a user-driven interrupt) this does NOT stop playback,
	 * clear the audio queue, or suppress incoming audio. The backend decides
	 * when a real interruption happened and emits `speech_started` / `barge_in`
	 * (already wired to cut off TTS). If the user stays silent the turn simply
	 * stays open and becomes the next listening turn once playback ends
	 * (`onPlaybackStopped` sees `_pttHeld` and stays in 'listening').
	 *
	 * Reuses the warm mic left by the previous turn's `abortPtt`, so no
	 * `getUserMedia` re-acquisition occurs. Idempotent: a no-op while a turn is
	 * already held.
	 */
	private _startBargeInListen(): void {
		if (!this._isHandsFreeEnabled() || !this._isConnected.get() || this._pttHeld || this._autoListenSuppressed || !this._window) {
			return;
		}
		this._clearAutoListenTimer();
		this._pttCurrentTurnId = generateUuid();
		this._pttHeld = true;
		// Track this as a passive barge-in listen (NOT toggle mode) so an
		// explicit `pttDown()` promotes it into a user-driven interrupt instead
		// of the toggle branch finishing it. The turn stays open on its own —
		// nothing calls `pttUp()`/`_finishPtt()` — until the backend ends it
		// (`turn_auto_ended`), the user promotes it, or playback stops.
		this._bargeInListenActive = true;
		// NOTE: this marks the turn start at playback time, not when the user
		// actually starts speaking, so voice latency/hold telemetry in
		// hands-free mode includes playback duration. Accepted known limitation
		// (the backend latches `user_is_speaking` on `ptt_start`); a precise
		// measure would key off the backend's first speech/transcription signal.
		this._telemetryPttDownMs = Date.now();
		this.micCaptureService.isMuted = false;
		this.micCaptureService.suppressUntil(0);
		this.micCaptureService.pttDown(this._pttCurrentTurnId).catch(err => {
			this.logService.warn('[voice] barge-in listen failed to start', err);
			this._pttHeld = false;
			this._bargeInListenActive = false;
		});
	}

	/** Debounced re-listen after assistant stops speaking. */
	private _scheduleAutoListen(): void {
		this._clearAutoListenTimer();
		this._autoListenTimer = setTimeout(() => {
			this._autoListenTimer = undefined;
			// Re-check: don't enter listening if we're now awaiting reply audio.
			if (this._awaitingReplyAudio) { return; }
			this._enterAutoListen();
		}, VoiceSessionController._AUTO_LISTEN_QUIET_MS);
	}

	private _clearAutoListenTimer(): void {
		if (this._autoListenTimer) {
			clearTimeout(this._autoListenTimer);
			this._autoListenTimer = undefined;
		}
	}

	/** Block auto-listen until reply audio arrives (with 30s watchdog). */
	private _setAwaitingReply(): void {
		this._awaitingReplyAudio = true;
		this._awaitingReplyForSession = this._getActiveSessionId();
		this._clearAutoListenTimer();
		if (this._awaitingReplyWatchdog) {
			clearTimeout(this._awaitingReplyWatchdog);
		}
		this._awaitingReplyWatchdog = setTimeout(() => {
			this._awaitingReplyWatchdog = undefined;
			this._awaitingReplyAudio = false;
			this._awaitingReplyForSession = undefined;
			// No reply came — re-enter listening if eligible.
			if (this._isHandsFreeEnabled() && !this._pttHeld) {
				this._enterAutoListen();
			}
		}, 30_000);
	}

	private _clearAwaitingReply(): void {
		this._awaitingReplyAudio = false;
		this._awaitingReplyForSession = undefined;
		if (this._awaitingReplyWatchdog) {
			clearTimeout(this._awaitingReplyWatchdog);
			this._awaitingReplyWatchdog = undefined;
		}
	}

	/**
	 * Send transcription text to the target session or active chat.
	 * If a target session is selected, sends directly via chatService.
	 * Otherwise sends to whatever is currently active via the view pane command.
	 */
	private async _sendTranscriptionToChat(text: string): Promise<void> {
		// A focus-change submit pins routing to the session the user was
		// dictating into; it takes priority over the user-picked target and the
		// currently focused session so their words land where they were aimed.
		const target = this._consumePinnedSubmitSession() ?? this._targetSession.get();
		if (target) {
			// Check if target is the currently visible session
			const currentSession = await this.commandService.executeCommand<string | undefined>('_chat.voice.getCurrentSession').catch(() => undefined);
			const isTargetVisible = currentSession === target.toString();

			if (isTargetVisible) {
				// Target is visible — send via the chat pane directly
				await this.commandService.executeCommand('_chat.voice.acceptInput', text).catch(err => {
					this.logService.warn('[voice] acceptInput failed for visible target:', err);
				});
			} else {
				// Target is NOT visible — ensure session is loaded, then send
				const cts = new CancellationTokenSource();
				const ref = await this.chatService.acquireOrLoadSession(target, ChatAgentLocation.Chat, cts.token, 'voice-send').catch(err => {
					this.logService.warn('[voice] Failed to load target session:', err);
					return undefined;
				});
				cts.dispose();
				if (!ref) {
					this.logService.warn('[voice] Could not load target session, falling back to switch');
					// Fallback: switch to the session and send via the UI
					const switched = await this.commandService.executeCommand<boolean>('_chat.voice.switchToSession', target.toString()).catch(() => false);
					if (switched) {
						await new Promise(resolve => setTimeout(resolve, 200));
						await this.commandService.executeCommand('_chat.voice.acceptInput', text).catch(() => { });
					}
					return;
				}
				const result = await this.chatService.sendRequest(target, text).catch(err => {
					this.logService.warn('[voice] Error sending transcription to target session:', err);
					return undefined;
				});
				if (result && result.kind !== 'rejected') {
					// Surface response in floating window
					this._watchResponseForFloatingWindow(target);
					// Open the floating window so user can see the response
					this.commandService.executeCommand('_agentsVoice.openWindow').catch(() => { /* ignore */ });
					// Keep the session model loaded until the response completes
					// so the autorun can observe state transitions and trigger narration.
					const model = this.chatService.getSession(target);
					if (model) {
						const lastReq = model.getRequests().at(-1);
						if (lastReq?.response && !lastReq.response.isComplete && !lastReq.response.isCanceled) {
							const responseDisposable = lastReq.response.onDidChange(() => {
								if (lastReq.response!.isComplete || lastReq.response!.isCanceled) {
									responseDisposable.dispose();
									ref.dispose();
								}
							});
						} else {
							ref.dispose();
						}
					} else {
						ref.dispose();
					}
				} else {
					ref.dispose();
				}
			}
		} else {
			// Use the currently focused chat session if available
			const currentSession = await this.commandService.executeCommand<string | undefined>('_chat.voice.getCurrentSession').catch(() => undefined);
			if (currentSession) {
				// There's an active chat widget — send to it
				this.commandService.executeCommand('_chat.voice.acceptInput', text).catch(err => {
					this.logService.warn('[voice] acceptInput failed for current session:', err);
				});
			} else {
				// No focused chat session — find the most recent existing session
				// instead of creating a new one, so voice continues the conversation.
				const models = [...this.chatService.chatModels.get()];
				const existingSession = models.length > 0 ? models[models.length - 1] : undefined;
				const sessionResource = existingSession?.sessionResource;

				if (sessionResource) {
					// Switch to and send to the existing session
					const switched = await this.commandService.executeCommand<boolean>('_chat.voice.switchToSession', sessionResource.toString()).catch(() => false);
					if (switched) {
						await new Promise(resolve => setTimeout(resolve, 200));
						await this.commandService.executeCommand('_chat.voice.acceptInput', text).catch(err => {
							this.logService.warn('[voice] acceptInput failed after switch to existing:', err);
						});
					} else {
						// Direct send as fallback
						this.chatService.sendRequest(sessionResource, text).catch(err => {
							this.logService.warn('[voice] Error sending transcription to existing session:', err);
						});
					}
				} else {
					// Truly no sessions exist — create one
					const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
					const resource = ref.object.sessionResource;
					ref.dispose();
					// Switch to the new session so the user sees the response
					this.commandService.executeCommand('_chat.voice.switchToSession', resource.toString()).catch(() => { /* pane may not exist */ });
					this.chatService.sendRequest(resource, text).catch(err => {
						this.logService.warn('[voice] Error sending transcription to new session:', err);
					});
				}
			}

			// Ensure the chat view is visible so the user sees/hears the response
			this.commandService.executeCommand('workbench.panel.chat.view.copilot.focus').catch(() => { /* ignore */ });
		}
	}

	/**
	 * Watch a session's latest response and surface it in the floating window
	 * transcript. Called when voice sends to a non-visible session so the user
	 * can see the reply without switching the chat panel.
	 */
	private _watchResponseForFloatingWindow(sessionResource: URI): void {
		const model = this.chatService.getSession(sessionResource);
		if (!model) {
			return;
		}

		// Seed the state cache so the delta mechanism sees thinking→idle as a transition
		// and includes last_response_summary in the patch.
		this._prevSessionStates.set(sessionResource.toString(), { state: 'thinking', detail: '', lastResponseSummary: '' });
		this._sendContext();

		const disposables = new DisposableStore();
		let lastText = '';

		const updateFromResponse = () => {
			const lastReq = model.lastRequest;
			const response = lastReq?.response;
			if (!response) {
				return;
			}

			const markdown = response.response.getMarkdown();
			// Only first ~200 chars for the floating window transcript preview
			const previewText = markdown.length > 200 ? markdown.slice(0, 200) + '…' : markdown;
			if (previewText && previewText !== lastText) {
				const isFirst = lastText === '';
				lastText = previewText;
				this._setAssistantTurn(previewText, { startNewTurn: isFirst });
			}

			if (response.isComplete || response.isCanceled) {
				// Notify the voice backend of the state transition so it can
				// narrate the response for this non-focused session.
				this._prevSessionStates.set(sessionResource.toString(), { state: 'idle', detail: '', lastResponseSummary: '' });
				this._sendContext();
				this.voiceClientService.flushSessionContext();
				disposables.dispose();
			}
		};

		// Listen for response changes
		const checkResponse = () => {
			const lastReq = model.lastRequest;
			if (lastReq?.response) {
				disposables.add(lastReq.response.onDidChange(() => updateFromResponse()));
				updateFromResponse();
			}
		};

		// The response may not exist yet — listen for model changes
		disposables.add(model.onDidChange(e => {
			if (e.kind === 'addResponse') {
				checkResponse();
			}
		}));
		checkResponse();

		// Safety: dispose after 5 minutes in case the response never completes
		const timeout = setTimeout(() => disposables.dispose(), 5 * 60 * 1000);
		disposables.add({ dispose: () => clearTimeout(timeout) });
	}

	// --- Transcript buffer helpers ---

	private _pushTurn(turn: ITranscriptTurn): void {
		const cur = this._transcriptTurns.get();
		const next = [...cur, turn].slice(-VoiceSessionController._MAX_TURNS);
		this._transcriptTurns.set(next, undefined);
	}

	/**
	 * Start a new user turn at the tail of the buffer. If the previous tail is
	 * already an empty user turn (rapid PTT toggle before any transcription
	 * landed), reuse it instead of pushing a duplicate empty entry.
	 */
	private _startUserTurn(): void {
		const cur = this._transcriptTurns.get();
		const last = cur[cur.length - 1];
		if (last && last.speaker === 'user' && !last.text) {
			return;
		}
		this._pushTurn({ speaker: 'user', text: '', committed: '', isPartial: true });
	}

	private _updateUserTurn(text: string, committed: string, isPartial: boolean): void {
		const cur = this._transcriptTurns.get();
		const last = cur[cur.length - 1];
		if (!last || last.speaker !== 'user') {
			// Server-VAD or other path that delivered transcription before a
			// formal turn was started — open one now.
			this._pushTurn({ speaker: 'user', text, committed, isPartial });
			return;
		}
		const updated: ITranscriptTurn = { speaker: 'user', text, committed, isPartial };
		this._transcriptTurns.set([...cur.slice(0, -1), updated], undefined);
	}

	/** Whether the user is mid-utterance: VAD speech is active, or the transcript tail is a non-empty partial user turn. */
	private _isActivelyDictating(): boolean {
		if (this._userSpeechActive) {
			return true;
		}
		const turns = this._transcriptTurns.get();
		const last = turns[turns.length - 1];
		return !!last && last.speaker === 'user' && last.isPartial && last.text.trim().length > 0;
	}

	/**
	 * Update the assistant turn at the tail of the buffer with `text`.
	 *
	 * The streaming TTS pipeline pushes a monotonically-growing transcript
	 * with each audio chunk of a response. `startNewTurn` distinguishes
	 * the first chunk of a NEW response (push a fresh assistant turn)
	 * from continuation chunks of the SAME response (replace the tail's
	 * text as the transcript grows). This prevents two distinct
	 * assistant responses from collapsing into one when they happen
	 * back-to-back without an intervening user turn (e.g. proactive
	 * narration followed by a command reply).
	 */
	private _setAssistantTurn(text: string, opts: { startNewTurn: boolean } = { startNewTurn: true }): void {
		const cur = this._transcriptTurns.get();
		const last = cur[cur.length - 1];
		if (!opts.startNewTurn && last && last.speaker === 'assistant') {
			const updated: ITranscriptTurn = { speaker: 'assistant', text, committed: '', isPartial: false };
			this._transcriptTurns.set([...cur.slice(0, -1), updated], undefined);
			return;
		}
		this._pushTurn({ speaker: 'assistant', text, committed: '', isPartial: false });
	}

	private _cancelTranscriptFade(): void {
		if (this._transcriptFadeTimer) {
			clearTimeout(this._transcriptFadeTimer);
			this._transcriptFadeTimer = undefined;
		}
	}

	// --- Transcript persistence (local-only) ---

	/**
	 * Append a final entry to the on-disk transcript store.
	 *
	 * Entry ids are generated locally — voice_code's backend has no persistent
	 * conversation memory today, so there's no server-issued id to defer to.
	 * Each new entry chains off the previous one via ``ancestorIds`` so a UI
	 * can show the linear conversation order.
	 *
	 * ``user_voice`` and ``agent_voice`` are user-visible in the transcripts
	 * pane. ``agent_tool_call`` and ``coding_event`` are persisted only so we
	 * can replay them as cross-session context to the backend on reconnect.
	 */
	private _persistEntry(
		kind: VoiceTranscriptKind,
		text: string,
		metadata?: IVoiceTranscriptEntryMetadata,
	): void {
		const userId = this._userLogin;
		if (!userId || !text) {
			return;
		}
		const entry: IVoiceTranscriptTurn = {
			turnId: generateUuid(),
			ancestorIds: this._lastPersistedTurnId ? [this._lastPersistedTurnId] : [],
			kind,
			role: kind === 'user_voice' ? 'user' : 'assistant',
			text,
			timestamp: new Date().toISOString(),
			...(metadata ? { metadata } : {}),
		};
		this._lastPersistedTurnId = entry.turnId;
		this.voiceTranscriptStore.appendTurn(userId, entry).catch(err => {
			this.logService.warn('[voice] failed to persist transcript entry', err);
		});
	}

	/** Back-compat thin shim for the two existing voice call sites. */
	private _persistTurn(role: 'user' | 'assistant', text: string): void {
		this._persistEntry(role === 'user' ? 'user_voice' : 'agent_voice', text);
	}

	/**
	 * One-line, human/LLM-readable summary of a voice tool call for the
	 * timeline. Backend's prior_timeline renderer expects this format — keep
	 * it stable.
	 *
	 *   send_to_chat(text="Open a new terminal and cd into the current directory.")
	 *   new_sessions(sessions=[{"text": "Refactor upload service"}])
	 *   approve_confirmation(...)
	 */
	private _renderToolCallSummary(name: string, args: Record<string, unknown> | undefined): string {
		if (!args || Object.keys(args).length === 0) {
			return `${name}()`;
		}
		const pairs: string[] = [];
		for (const [k, v] of Object.entries(args)) {
			// Bound long values — full args are still in metadata.toolArgs.
			let rendered: string;
			if (typeof v === 'string') {
				rendered = v.length > 200 ? `${v.slice(0, 197)}...` : v;
				rendered = JSON.stringify(rendered);
			} else {
				try {
					const json = JSON.stringify(v);
					rendered = json.length > 200 ? `${json.slice(0, 197)}...` : json;
				} catch {
					rendered = String(v);
				}
			}
			pairs.push(`${k}=${rendered}`);
		}
		return `${name}(${pairs.join(', ')})`;
	}

	/**
	 * Convert persisted transcript turns into typed timeline entries for
	 * the BE, then top up with a synthesized ``coding_agent_reply`` per
	 * active coding session (first ~2 sentences of the latest Copilot
	 * response). The synthetic entries are *not* persisted — they read
	 * live ``IChatModel`` state so the summary stays fresh on every
	 * reconnect.
	 *
	 * Output is chronological (oldest first), matching what the BE
	 * renders into its ``[PRIOR_CONTEXT]`` block. Synthetic
	 * ``coding_agent_reply`` entries are appended at the end since they
	 * represent the *current* state of coding sessions at reconnect.
	 */
	private _buildPriorTimeline(turns: readonly IVoiceTranscriptTurn[]): IVoicePriorTimelineEntry[] {
		const out: IVoicePriorTimelineEntry[] = [];

		for (const t of turns) {
			// Pre-timeline rows (no kind) are filtered out by the store's
			// auto-wipe in loadTurns; anything that reaches us here is
			// well-formed. Guard anyway in case of partial-rollout cases.
			const kind: VoiceTranscriptKind | undefined = t.kind;
			if (!kind) {
				continue;
			}
			const entry: IVoicePriorTimelineEntry = {
				kind,
				text: t.text,
				timestamp: new Date(t.timestamp).toISOString(),
				...(t.metadata?.toolName ? { toolName: t.metadata.toolName } : {}),
				...(t.metadata?.codingSessionId ? { codingSessionId: t.metadata.codingSessionId } : {}),
				...(t.metadata?.codingStatus ? { codingStatus: t.metadata.codingStatus } : {}),
			};
			out.push(entry);
		}

		// Synthesize coding_agent_reply per active session — reflects the
		// model's latest response without any extra persistence layer.
		try {
			const sessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
			for (const session of sessions) {
				const model = this.chatService.getSession(session.resource);
				const lastReq = model?.getRequests().at(-1);
				const value = lastReq?.response?.response.value;
				if (!value) {
					continue;
				}
				const full = value
					.filter(p => p.kind === 'markdownContent')
					.map(p => (p as { content: { value: string } }).content.value)
					.join(' ')
					.trim();
				if (!full) {
					continue;
				}
				const summary = this._firstSentences(full, VoiceSessionController.CODING_AGENT_REPLY_SENTENCE_LIMIT);
				if (!summary) {
					continue;
				}
				out.push({
					kind: 'coding_agent_reply',
					text: summary,
					timestamp: new Date().toISOString(),
					codingSessionId: session.resource.toString(),
				});
			}
		} catch (err) {
			this.logService.warn('[voice] failed to synthesize coding_agent_reply timeline entries', err);
		}

		return out;
	}

	/**
	 * Return the first ``n`` sentences of ``text``. Cheap regex split —
	 * good enough for a prompt-prefix summary; we don't need perfect NLP
	 * boundaries here. Falls back to a hard char cap if no terminator
	 * shows up in the first 600 chars.
	 */
	private _firstSentences(text: string, n: number): string {
		const collapsed = text.replace(/\s+/g, ' ').trim();
		if (!collapsed) {
			return '';
		}
		const sentences: string[] = [];
		const re = /[^.!?]+[.!?]+(\s|$)/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(collapsed)) !== null && sentences.length < n) {
			sentences.push(m[0].trim());
		}
		if (sentences.length === 0) {
			return collapsed.length > 600 ? `${collapsed.slice(0, 597)}...` : collapsed;
		}
		return sentences.join(' ');
	}

	// --- Deferred responses for non-focused sessions ---

	/**
	 * Record the backend→UI resource alias for an agent-host session so a response
	 * the voice backend tags with the bare backend id resolves to this UI session
	 * resource (the space in which focus, defer/flush buffer keys, and the pending
	 * indicator operate). No-op for non-agent-host resources.
	 */
	private _recordSessionAlias(uiResource: URI): void {
		const backend = toAgentHostBackendSessionUri(uiResource);
		if (!backend) {
			return;
		}
		const from = backend.toString();
		const to = uiResource.toString();
		if (this._uiResourceByBackendId.get(from) === to) {
			return;
		}
		this._uiResourceByBackendId.set(from, to);
		// A newly-learned alias means any state stored under the bare backend id
		// must move to the canonical UI key, so the two id spaces never diverge and
		// no alias-aware iteration is needed anywhere else.
		this._rekeySession(from, to);
	}

	/** Move every session-scoped entry (and the visible indicator) from a bare
	 *  backend id to its canonical UI key once the alias becomes known. */
	private _rekeySession(from: string, to: string): void {
		if (from === to) {
			return;
		}
		const rekeyMap = <V>(m: Map<string, V>): void => {
			if (m.has(from)) {
				if (!m.has(to)) {
					m.set(to, m.get(from)!);
				}
				m.delete(from);
			}
		};
		const rekeySet = (s: Set<string>): void => {
			if (s.has(from)) {
				s.delete(from);
				s.add(to);
			}
		};
		rekeyMap(this._deferredResponses);
		rekeyMap(this._pendingResponseSummaries);
		rekeyMap(this._lastNarratedText);
		rekeyMap(this._lastHeardTranscriptById);
		rekeyMap(this._recentlyReadResponse);
		rekeyMap(this._lastResponseSummaryById);
		rekeyMap(this._pendingNarrationRetries);
		rekeyMap(this._deferredNarrations);
		rekeyMap(this._narratedConfirmation);
		rekeySet(this._confirmationPendingSessions);
		rekeySet(this._liveReplyKeys);
		rekeySet(this._sessionsAwaitingResponseSummary);
		rekeySet(this._pendingIdleNarration);
		this._markPendingResponse(from, false);
		if (this._pendingOwned(to)) {
			this._markPendingResponse(to, true);
		}
	}

	/**
	 * The single canonical key for a session: the UI agent-host resource when the
	 * backend tagged it with the bare backend id, else the id unchanged. Every
	 * session-scoped collection is keyed by this, so the two id spaces never
	 * diverge and ownership checks are plain O(1) map/set lookups.
	 */
	private _sessionKey(id: string): string {
		return this._uiResourceByBackendId.get(id) ?? id;
	}

	/** Whether any of the three indicator owners still holds this canonical key. */
	private _pendingOwned(key: string): boolean {
		return this._confirmationPendingSessions.has(key)
			|| this._deferredResponses.has(key)
			|| this._pendingResponseSummaries.has(key);
	}

	/**
	 * Canonicalize a session id to the UI agent-host resource space when the
	 * backend tagged it with the bare backend id. Untagged / non-agent-host ids
	 * pass through unchanged.
	 */
	private _canonicalSessionId(id: string | undefined): string | undefined {
		return id ? (this._uiResourceByBackendId.get(id) ?? id) : id;
	}

	/**
	 * Refresh the cached focused session and flush any response that was held
	 * for the session that just became focused.
	 */
	/**
	 * The session the user is currently looking at, read live from the
	 * last-focused chat widget (the same source that fires
	 * `onDidChangeFocusedSession`). Reading live - rather than trusting a value
	 * cached on the change event - protects the defer/flush decision from a
	 * missed or out-of-order focus event, which would otherwise leave a response
	 * buffered forever or drop it into the wrong session.
	 */
	private _getFocusedSessionId(): string | undefined {
		return this.chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource?.toString();
	}

	private _onFocusedSessionChanged(): void {
		// In embedder-driven mode, focus is unreliable; ignore focus activation.
		if (this._externalActiveSessionMode) {
			return;
		}
		const focused = this._getFocusedSessionId();
		if (focused) {
			this._activateShownSession(URI.parse(focused));
			return;
		}
		// Re-send + flush context on focus change so the backend's notion of the
		// active session (is_active) tracks focus promptly rather than waiting
		// for the next poll.
		this._sendContext();
		this.voiceClientService.flushSessionContext();
	}

	/**
	 * Track a chat widget's view-model so we notice when a session is shown in it,
	 * even if that widget never takes DOM focus (so `onDidChangeFocusedSession`
	 * stays silent). Opening a session from the sessions list reveals it in the
	 * chat view pane this way.
	 */
	private _trackWidgetSession(widget: IChatWidget): void {
		this._register(widget.onDidChangeViewModel(e => this._onSessionShown(e.currentSessionResource)));
		// Seed from the widget's current view-model. When a session opens in a
		// freshly-created widget, its view-model is often already set by the time
		// we subscribe above, so the initial `onDidChangeViewModel` never fires
		// and the shown session would otherwise be missed (leaving a buffered
		// response stuck until the stale focus path happens to catch up).
		this._onSessionShown(widget.viewModel?.sessionResource);
	}

	/** A session became visible (opened/revealed): treat like a focus change — make it active, flush any buffered response, clear its pending indicator, and narrate its pending item. */
	private _onSessionShown(resource: URI | undefined): void {
		// In embedder-driven mode, widget swaps are not authoritative and can
		// flush the wrong session or thrash the active one.
		if (this._externalActiveSessionMode) {
			return;
		}
		const key = resource?.toString();
		if (!key || key === this._lastShownSessionId) {
			return;
		}
		this.logService.trace(`[voice] session shown=${key}; flushing/re-sending context`);
		this._activateShownSession(resource!);
	}

	/** Make a shown/focused session active: flush its buffered response, clear its pending indicator, and narrate its pending confirmation/response (loading the model first if a confirmation's detail isn't resident). */
	private _activateShownSession(resource: URI): void {
		const key = resource.toString();
		this._lastShownSessionId = key;
		// Refresh the backend→UI alias for this resource up front so a response
		// buffered under the bare backend id (alias not yet known at arrival)
		// resolves to this key, and so future responses for it route correctly.
		this._recordSessionAlias(resource);
		// Nothing can be flushed or narrated while disconnected: requestNarration
		// can't send, and doing this work here (e.g. from a focus/widget event, or
		// the _onFocusedSessionChanged() call at the start of connect()) would
		// stash a pending narration that session_init later replays - stopping the
		// freshly entered listening turn. Alias/last-shown bookkeeping above is
		// kept so routing is correct once connected; the reply is narrated on the
		// next focus/state event (or an explicit activateSession) after connect.
		if (!this._isConnected.get()) {
			this.logService.trace(`[voice] _activateShownSession(${key.slice(-32)}) skipped: controller not connected (external=${this._externalActiveSessionMode})`);
			return;
		}
		const flushResult = this._flushDeferredResponse(key);
		this._clearConfirmationIndicator(key);
		if (this._confirmationDetailPending(resource)) {
			this._ensureModelLoaded(resource);
		}
		// In embedder-driven mode, arm dedupe with the last heard reply so matching
		// on-focus re-reads drop; new replies and confirmations still narrate.
		if (this._externalActiveSessionMode && !this._recentlyReadResponse.has(key)) {
			const heard = this._lastHeardTranscriptById.get(key);
			if (heard) {
				this._recentlyReadResponse.set(key, { transcript: heard, at: Date.now() });
			}
		}
		// Ask the backend to speak this session's pending item now that it's shown.
		// If we just replayed this session's completed reply, that IS the response
		// read - don't also narrate the stored summary (a double-read). But decide
		// that by TRANSCRIPT IDENTITY, not the mere fact that some audio was
		// flushed: the buffer may have held a different, partial, or older response
		// (e.g. the user clicked while a second reply was still streaming), and the
		// stored summary is the authoritative, complete text - it must still be
		// narrated unless its own transcript was among those just played.
		let narratable = this._currentNarratable(resource);
		const sessionKey = this._sessionKey(key);
		const pendingSummary = this._pendingResponseSummaries.get(sessionKey);
		const pendingSummaryFlushed = !!pendingSummary
			&& flushResult.finalTranscripts.includes(this._normalizeTranscript(pendingSummary));
		this.logService.trace(`[voice] activate shown=${key.slice(-32)} pendingKey=${this._pendingResponseSummaries.has(sessionKey) ? sessionKey.slice(-32) : '<none>'} narratable=${narratable?.kind ?? '<none>'} flushedFinal=${flushResult.finalTranscripts.length} pendingFlushed=${pendingSummaryFlushed}`);
		// Fall back to the stored summary (the source of the pending indicator)
		// when the model isn't resident to surface the completed reply - but only
		// if that exact summary wasn't just flushed as audio (else it'd read twice).
		if (!narratable && pendingSummary && !pendingSummaryFlushed) {
			narratable = { kind: 'response', text: pendingSummary };
		}
		// Only treat the response as handled (and clear its indicator below) when
		// its own reply was actually accounted for: the stored summary's transcript
		// was just played, OR a narration is issued/deduped for the narratable item.
		// Never initialize this from flushResult.flushed - partial/other buffered
		// audio must not be taken as "this session's reply was read".
		let handledResponse = pendingSummaryFlushed;
		if (narratable) {
			const wasJustPlayed = narratable.kind === 'response'
				&& flushResult.finalTranscripts.includes(this._normalizeTranscript(narratable.text));
			if (wasJustPlayed) {
				this._lastNarratedText.set(sessionKey, narratable.text);
				handledResponse = true;
			} else {
				// Narrate a fresh item for the now-shown session. _narrate exits
				// listening/auto-listen first (so the echoed audio isn't suppressed
				// or captured as the user's turn), then requests narration -
				// responses on focus are narrated exactly like confirmations.
				const alreadyNarrated = narratable.kind === 'response'
					&& this._getLastNarratedText(key) === narratable.text;
				// A still-pending confirmation we already spoke must not be
				// re-narrated on a mere refocus. _narratedConfirmation records the
				// text only once its audio finalized, so a confirmation that was
				// deferred/dropped (never heard) still retries here, while one the
				// user already heard stays silent until it changes or resolves.
				const confirmationAlreadyHeard = narratable.kind === 'confirmation'
					&& this._narratedConfirmation.get(sessionKey) === narratable.text;
				// Only narrate a response on focus when it's a completion recorded
				// THIS run - i.e. the session owns a pending-response summary, set on
				// the observed idle transition in _handleNarratableStateChange. A
				// resident model surfaced by focus or eager-load carries whatever
				// reply it last held, including one that completed before we started
				// tracking (e.g. an old session revealed by a list/filter change);
				// that predates our observation and must not be read out. The
				// pending-summary token is the per-turn freshness signal (the same one
				// that drives the unread-reply indicator), so focus narrates exactly
				// the replies that show as unread. Confirmations are exempt: they are
				// current actionable state, deduped separately by _narratedConfirmation.
				const staleResponse = narratable.kind === 'response'
					&& !this._pendingResponseSummaries.has(sessionKey);
				if (confirmationAlreadyHeard) {
					this.logService.trace(`[voice] activate skip: confirmation already heard for ${key.slice(-32)}`);
				} else if (staleResponse) {
					this.logService.trace(`[voice] activate skip: stale response (no pending summary) for ${key.slice(-32)}`);
				} else {
					this._narrate(key, narratable.kind, narratable.text);
				}
				if (narratable.kind === 'response') {
					// A request being SENT is not the reply being heard: keep the
					// pending indicator until its audio finalizes (_markNarrationHeard
					// clears it then). Only an already-narrated reply is handled here,
					// so a re-focus of a genuinely-read reply still clears promptly.
					handledResponse = handledResponse || alreadyNarrated;
				}
			}
		}
		// Clear this session's pending reply indicator/summary only once its reply
		// was actually handled: its buffered audio was flushed/played, or it was
		// already narrated (a re-focus of a reply we read before). A freshly
		// REQUESTED narration does NOT clear here - a sent request is not a heard
		// reply; its indicator is cleared from _markNarrationHeard once the audio
		// actually finishes playing (or is retained if the audio never arrives, so
		// a later focus/state event can retry). Mirrors how the confirmation
		// indicator is cleared on focus (see _clearConfirmationIndicator).
		if (handledResponse) {
			this._clearPendingResponse(sessionKey);
		}
		this._sendContext();
		this.voiceClientService.flushSessionContext();
	}

	/** Ask the backend to narrate a session's pending item, de-duped by the exact text last spoken for it ({@link _lastNarratedText}) and by any in-flight request for the same text ({@link _pendingSolicitedNarrations}); the single narration trigger for both live and on-focus paths. Returns `true` when a request was actually SENT - NOT that the reply was heard (the audio may still be dropped/deferred/never arrive). The reply is marked narrated and its pending indicator cleared only once its audio finalizes (see {@link _markNarrationHeard}). */
	private _narrate(sessionId: string, kind: 'response' | 'confirmation', text: string, reuseId?: string): boolean {
		if (!text) {
			return false;
		}
		// Persistent exactly-once dedup applies only to completed responses: a
		// response is immutable content, so re-reading the same text on focus is
		// undesirable. A confirmation is current actionable state - two separate
		// tools can legitimately raise identical prompts ("Allow this command?"),
		// and each must be narrated, so confirmations are never suppressed here.
		if (kind === 'response' && this._getLastNarratedText(sessionId) === text) {
			return false;
		}
		// A request for this exact text+kind is already in flight (its audio hasn't
		// finalized yet); don't re-request or we'd narrate it twice. Match on kind
		// too so an in-flight response can't suppress a same-text confirmation.
		const sessionKey = this._sessionKey(sessionId);
		for (const s of this._pendingSolicitedNarrations.values()) {
			if (s.kind === kind && s.text === text && this._sessionKey(s.sessionId) === sessionKey) {
				return false;
			}
		}
		this.logService.trace(`[voice] narrate kind=${kind} id=${sessionId.slice(-32)}`);
		// A silent hands-free auto-listen/barge-in turn keeps the backend's `user_is_speaking` latch set, which NACKs the narration request `busy: user_speaking`; end it first (real `ptt_end`) so the request is accepted. Skip while the user is genuinely mid-utterance (defer instead) or when the socket is closed (retry below).
		const endPassiveTurnFirst = this._pttHeld && !this._isActivelyDictating() && this.voiceClientService.canRequestNarration;
		if (endPassiveTurnFirst) {
			this._prepareForPlayback(true);
		}
		const narrationId = this.voiceClientService.requestNarration(sessionId, kind, text, reuseId);
		if (!narrationId) {
			// Socket was closed, so nothing was sent: don't touch playback/listening
			// state (that would tear down a freshly-entered listen on connect).
			// Remember the item so the next session_init replays it after resume;
			// leaving the dedup unset lets a later focus/state event retry too.
			this._pendingNarrationRetries.set(sessionId, { kind, text });
			return false;
		}
		if (!endPassiveTurnFirst) {
			// Narration audio is inbound: leave listening/auto-listen so the echoed audio isn't suppressed or captured as the user's turn.
			this._prepareForPlayback();
		}
		this._pendingNarrationRetries.delete(sessionId);
		// This newer request supersedes any older busy/interrupted entry deferred
		// for this session (latest-wins per session). Without this, a later
		// narration_unblocked could retry the stale entry and, since confirmations
		// are not text-deduped, speak the same prompt a second time.
		this._clearDeferred(sessionKey);
		// Remember this id so the echoed audio (responseId === narrationId) is
		// never dropped as an unsolicited duplicate by _isRenarration, even when
		// its transcript matches a reply we recently read for this session. Bound
		// the set so ids that never yield audio (legacy backends that don't echo
		// them, interrupted streams) can't leak across a long session.
		if (this._solicitedNarrationIds.size >= 64) {
			const oldest = this._solicitedNarrationIds.values().next().value;
			if (oldest !== undefined) {
				this._solicitedNarrationIds.delete(oldest);
			}
		}
		this._solicitedNarrationIds.add(narrationId);
		// Do NOT mark the reply narrated / clear its pending indicator yet - a
		// request being accepted is not the reply being heard. Wait for the
		// backend to start returning audio: if it never does, the watchdog below
		// releases the guard and restores state so voice mode can't get stuck on
		// a completed response that never produced audio. Once audio starts, the
		// stream is left to finalize normally (_markNarrationHeard) with no
		// timeout on the remainder.
		const audioStartTimer = setTimeout(() => {
			this._handleSolicitedNarrationAudioStartTimeout(narrationId);
		}, VoiceSessionController._SOLICITED_NARRATION_AUDIO_START_TIMEOUT_MS);
		this._pendingSolicitedNarrations.set(narrationId, {
			sessionId,
			kind,
			text,
			audioStartTimer,
			hasReceivedAudio: false,
		});
		return true;
	}

	private _markSolicitedNarrationAudioStarted(narrationId: string | undefined): void {
		if (!narrationId) {
			return;
		}
		const pending = this._pendingSolicitedNarrations.get(narrationId);
		if (!pending || pending.hasReceivedAudio) {
			return;
		}
		// Audio has started arriving, so the "no audio at all" watchdog is done.
		// The rest of the stream is left to finalize normally (_markNarrationHeard);
		// we don't time out a stream that is actively coming in.
		pending.hasReceivedAudio = true;
		clearTimeout(pending.audioStartTimer);
	}

	private _handleSolicitedNarrationAudioStartTimeout(narrationId: string): void {
		const pending = this._pendingSolicitedNarrations.get(narrationId);
		if (!pending || pending.hasReceivedAudio) {
			return;
		}
		this._pendingSolicitedNarrations.delete(narrationId);
		this._solicitedNarrationIds.delete(narrationId);
		// Only restore state when this was the last thing we were waiting on. If a
		// direct chat reply is still expected (`_awaitingReplyAudio`) or another
		// solicited narration is still waiting for its audio to start, restoring
		// idle / re-entering the hands-free mic here could suppress that other
		// response's audio. Leave restoration to whichever watchdog fires last.
		if (this._awaitingReplyAudio || this._hasNarrationAwaitingAudio()) {
			this.logService.trace(`[voice] solicited narration ${narrationId.slice(0, 8)} timed out waiting for audio start; another response still expected, deferring state restore`);
			return;
		}
		this.logService.trace(`[voice] solicited narration ${narrationId.slice(0, 8)} timed out waiting for audio start; restoring idle state`);
		this._restoreVoiceStateAfterNarrationTimeout();
	}

	/** True while any tracked solicited narration is still waiting for its audio
	 *  to start (i.e. a no-audio watchdog is still outstanding). */
	private _hasNarrationAwaitingAudio(): boolean {
		for (const pending of this._pendingSolicitedNarrations.values()) {
			if (!pending.hasReceivedAudio) {
				return true;
			}
		}
		return false;
	}

	private _clearPendingSolicitedNarration(narrationId: string, pending: IPendingSolicitedNarration): void {
		clearTimeout(pending.audioStartTimer);
		this._pendingSolicitedNarrations.delete(narrationId);
	}

	private _restoreVoiceStateAfterNarrationTimeout(): void {
		if (this.ttsPlaybackService.isPlaying || this._audioQueue.length > 0 || this._currentPlaybackSessionId !== null || this._pttHeld) {
			return;
		}
		if (this._isHandsFreeEnabled() && this._window && this._isConnected.get()) {
			this._enterAutoListen();
			return;
		}
		this._voiceState.set('idle', undefined);
		this._statusText.set('Hold to speak...', undefined);
	}

	/** Mark a solicited narration's reply as actually heard once its final audio
	 *  chunk arrives (responseId === the narration id we sent). Only now do we set
	 *  the exactly-once dedup and clear the session's pending-response indicator,
	 *  since a mere request acceptance is not proof the reply played. */
	private _markNarrationHeard(narrationId: string): void {
		const solicited = this._pendingSolicitedNarrations.get(narrationId);
		if (!solicited) {
			return;
		}
		this._clearPendingSolicitedNarration(narrationId, solicited);
		// Only responses populate the persistent text dedup (and own the pending
		// indicator). A confirmation is transient actionable state that must be
		// re-narratable, so heard confirmations leave _lastNarratedText untouched.
		const sessionKey = this._sessionKey(solicited.sessionId);
		if (solicited.kind === 'response') {
			this._lastNarratedText.set(sessionKey, solicited.text);
			this._clearPendingResponse(sessionKey);
		} else {
			// Confirmation heard: mark THIS occurrence spoken so a mere refocus
			// while it is still pending doesn't re-narrate it (see
			// _activateShownSession). Cleared when the session leaves
			// waiting_for_confirmation (autorun), so a genuinely new confirmation -
			// even with identical text - narrates again.
			this._narratedConfirmation.set(sessionKey, solicited.text);
			this.logService.trace(`[voice] confirmation heard for ${sessionKey.slice(-32)}; marking occurrence spoken`);
		}
	}

	/**
	 * Handle a `narration_ack` for a `request_narration` we sent.
	 *
	 * `accepted` needs nothing: the request is already tracked in
	 * {@link _pendingSolicitedNarrations} and its audio will finalize normally.
	 * `busy` means the backend could not play right now (user speaking / reply in
	 * flight); it will nudge us with `narration_unblocked` when the guard clears,
	 * so we stop tracking the id as in-flight and remember it for a revalidated
	 * retry. `invalid` is terminal, so we drop it entirely.
	 */
	private _handleNarrationAck(e: IVoiceNarrationAck): void {
		if (e.disposition === 'accepted') {
			return;
		}
		const key = this._sessionKey(e.codingSessionId);
		const solicited = this._pendingSolicitedNarrations.get(e.narrationId);
		if (solicited) {
			this._clearPendingSolicitedNarration(e.narrationId, solicited);
		}
		this._solicitedNarrationIds.delete(e.narrationId);
		if (e.disposition === 'invalid') {
			this.logService.trace(`[voice] narration_ack invalid id=${e.narrationId.slice(0, 8)} reason=${e.reason ?? '<none>'}; dropping`);
			this._clearDeferred(key);
			return;
		}
		// busy: defer for a revalidated retry once the guard clears.
		const kind = solicited?.kind;
		const text = solicited?.text;
		if (kind && text) {
			this.logService.trace(`[voice] narration_ack busy id=${e.narrationId.slice(0, 8)} reason=${e.reason ?? '<none>'}; deferring`);
			this._deferredNarrations.set(key, { narrationId: e.narrationId, kind, text });
		}
	}

	/**
	 * Handle a `narration_interrupted`: an accepted, in-flight narration was
	 * cancelled by barge-in. The backend evicted the id, so stop tracking it and
	 * defer a revalidated retry (driven by the `narration_unblocked` that follows
	 * once the barge-in turn ends).
	 */
	private _handleNarrationInterrupted(e: IVoiceNarrationSignal): void {
		const key = this._sessionKey(e.codingSessionId);
		const solicited = this._pendingSolicitedNarrations.get(e.narrationId);
		if (solicited) {
			this._clearPendingSolicitedNarration(e.narrationId, solicited);
		}
		this._solicitedNarrationIds.delete(e.narrationId);
		if (solicited) {
			this.logService.trace(`[voice] narration_interrupted id=${e.narrationId.slice(0, 8)}; deferring for revalidation`);
			this._deferredNarrations.set(key, { narrationId: e.narrationId, kind: solicited.kind, text: solicited.text });
		}
	}

	/**
	 * The `narration_unblocked` nudge fired for a deferred narration. Revalidate
	 * against the current session state and only re-request if it is still
	 * warranted, reusing the same id when the text is unchanged (so the backend
	 * dedups a lost ack) and minting a fresh one when the text changed. If it is
	 * no longer warranted (resolved, or a different kind), drop it without
	 * speaking.
	 */
	private _retryDeferredNarration(sessionKey: string): void {
		const deferred = this._deferredNarrations.get(sessionKey);
		if (!deferred) {
			this.logService.trace(`[voice] narration_unblocked for ${sessionKey.slice(-32)} but nothing deferred; nothing to retry`);
			return;
		}
		let resource: URI | undefined;
		try {
			resource = URI.parse(sessionKey);
		} catch {
			resource = undefined;
		}
		const narratable = resource ? this._currentNarratable(resource) : undefined;
		if (!narratable || narratable.kind !== deferred.kind) {
			this.logService.trace(`[voice] deferred narration for ${sessionKey.slice(-32)} no longer warranted; dropping`);
			this._clearDeferred(sessionKey);
			return;
		}
		// The session may no longer be the one shown (the user switched away while
		// the backend was busy). Speaking now would play this session's item over
		// the newly shown session, bypassing the "background sessions wait until
		// focused" policy; drop it instead - the confirmation/response indicators
		// surface it when the user focuses this session again.
		if (this._shouldDeferForSession(sessionKey)) {
			this.logService.trace(`[voice] deferred narration for ${sessionKey.slice(-32)} no longer shown; dropping`);
			this._clearDeferred(sessionKey);
			return;
		}
		const reuseId = narratable.text === deferred.text ? deferred.narrationId : undefined;
		this.logService.trace(`[voice] retrying deferred narration for ${sessionKey.slice(-32)} reuse=${!!reuseId}`);
		this._clearDeferred(sessionKey);
		this._narrate(sessionKey, narratable.kind, narratable.text, reuseId);
	}

	/** Drop a deferred narration. */
	private _clearDeferred(sessionKey: string): void {
		this._deferredNarrations.delete(sessionKey);
	}

	/** The pending item a session would narrate now (waiting confirmation prompt or completed reply summary), from the resident model or cached summary/status; returns undefined (kicking off a load) if a confirmation's detail isn't ready. */
	private _currentNarratable(resource: URI): { kind: 'response' | 'confirmation'; text: string } | undefined {
		const model = this.chatService.getSession(resource);
		if (model) {
			const info = this._getAgentStateInfo(model);
			if (info.state === 'waiting_for_confirmation' && info.detail) {
				return { kind: 'confirmation', text: info.detail };
			}
			if (info.state === 'idle' && info.last_response_summary) {
				return { kind: 'response', text: info.last_response_summary };
			}
			return undefined;
		}
		const session = this.agentSessionsService.model.sessions.find(s => !s.isArchived() && isEqual(s.resource, resource));
		if (session?.status === AgentSessionStatus.NeedsInput) {
			// Detail lives on the model; load it and let the state-change path narrate once it renders.
			this._ensureModelLoaded(resource);
			return undefined;
		}
		if (session?.status === AgentSessionStatus.Completed) {
			const summary = this._lastResponseSummaryById.get(resource.toString());
			if (summary) {
				return { kind: 'response', text: summary };
			}
			// The reply summary lives on the model and wasn't cached (the session
			// never went resident this turn, e.g. a remote/Copilot reply that
			// completed while unfocused). Load it and let the on-focus re-activation
			// in _ensureModelLoaded narrate it once it renders - mirrors the
			// NeedsInput branch above so a completed background reply is read when
			// focused instead of staying silent.
			this._ensureModelLoaded(resource);
			return undefined;
		}
		return undefined;
	}

	/**
	 * True when a session is awaiting confirmation but its confirmation detail is
	 * not yet available (model not loaded, or the pending-confirmation part hasn't
	 * rendered). Used to avoid narrating a detail-less confirmation on the first
	 * context send followed by the detailed one moments later.
	 */
	private _confirmationDetailPending(resource: URI): boolean {
		const session = this.agentSessionsService.model.sessions.find(s => !s.isArchived() && isEqual(s.resource, resource));
		if (!session || session.status !== AgentSessionStatus.NeedsInput) {
			return false;
		}
		const model = this.chatService.getSession(resource);
		if (!model) {
			return true;
		}
		const info = this._getAgentStateInfo(model);
		return info.state !== 'waiting_for_confirmation' || !info.detail;
	}

	/**
	 * The session the user is actively working with for the purpose of routing
	 * voice audio: the explicitly targeted session if one is set, otherwise the
	 * session most recently shown to the user (across all widgets, so an opened
	 * session that hasn't taken DOM focus still counts), falling back to the raw
	 * focused widget. This mirrors how `_buildSessionContext` computes the
	 * backend's `is_active` session, so playback and the backend agree on which
	 * session is "active" and everything else is a background narration.
	 */
	private _getActiveSessionId(): string | undefined {
		if (this._externalActiveSessionMode) {
			// Embedder is authoritative; ignore polluted focus/last-shown heuristics.
			return this._targetSession.get()?.toString() ?? this._activeSessionShown;
		}
		return this._targetSession.get()?.toString() ?? this._activeSessionShown ?? this._lastShownSessionId ?? this._getFocusedSessionId();
	}

	/**
	 * The session the user is currently looking at, used to route deferral and
	 * decide which completions narrate immediately vs. defer + indicate.
	 *
	 * In focus-based (main-window) mode this is the LIVE focused session, NOT the
	 * sticky `_lastShownSessionId`: that field is updated by any tracked chat
	 * widget's view-model swap (see `_trackWidgetSession`), so while the backend
	 * works a background session it can transiently point there and make that
	 * session look "shown" - which suppressed deferral, the pending indicator, and
	 * on-focus playback for responses. The confirmation indicator has always used
	 * live focus (see `_reconcileConfirmationIndicators`) and worked correctly;
	 * this keeps responses consistent with it. Opening a session still flushes its
	 * buffer directly via `_onSessionShown`, so the sticky value isn't needed here.
	 * Unlike {@link _getActiveSessionId} it ignores the sticky input
	 * `_targetSession` (where the next utterance is sent, not what is viewed).
	 */
	private _shownSessionId(): string | undefined {
		if (this._externalActiveSessionMode) {
			return this._activeSessionShown;
		}
		return this._getFocusedSessionId();
	}

	setActiveSessionShown(resource: URI | undefined): void {
		const key = resource?.toString();
		// `undefined` means the embedder has no active session to pin (e.g. a
		// draft composer). Per the interface contract this RESTORES focus-based
		// detection: leaving external mode on while blanking `_activeSessionShown`
		// would wedge narration - `_shownSessionId()` returns undefined, so no
		// session is ever "shown", every tagged reply defers forever, and both
		// focus paths stay gated off. Reset to focus-based instead.
		if (!resource) {
			if (!this._externalActiveSessionMode && this._activeSessionShown === undefined) {
				return;
			}
			this.logService.trace(`[voice] setActiveSessionShown=<none>; restoring focus-based detection (was ${this._activeSessionShown ?? '<none>'})`);
			this._externalActiveSessionMode = false;
			this._activeSessionShown = undefined;
			this._onFocusedSessionChanged();
			return;
		}
		this._externalActiveSessionMode = true;
		const definedKey = key!;
		if (this._isSameSession(definedKey, this._activeSessionShown)) {
			// Same session re-pinned. Normally already activated, but its pending
			// item may still be unheard: a response can arrive-and-defer for it
			// AFTER it became active (backend tagged it with a not-yet-aliased bare
			// id, so the defer decision couldn't tell it was the shown session), or
			// a completed background reply / confirmation can be pending. Re-activate
			// so any stranded buffer, pending summary, or pending confirmation
			// resolves and is heard, rather than being silently stuck.
			const sessionKey = this._sessionKey(definedKey);
			if (this._pendingOwned(sessionKey)) {
				this.logService.trace(`[voice] re-pinned active session=${definedKey} has pending voice work; re-activating`);
				this._activateShownSession(resource);
			}
			return;
		}
		this.logService.trace(`[voice] setActiveSessionShown=${definedKey} (was ${this._activeSessionShown ?? '<none>'})`);
		this._activeSessionShown = definedKey;
		// Route audio here now: flush buffers, clear pending, and re-send context.
		this._activateShownSession(resource);
	}

	activateSession(resource: URI): void {
		const key = resource.toString();
		this.logService.trace(`[voice] activateSession=${key} (explicit UI action)`);
		// In embedder-driven (Agents) mode, routing follows _activeSessionShown, so
		// pin it here too - otherwise a click on an already-active session (whose
		// activeSession observable didn't change, so setActiveSessionShown was never
		// re-called) would flush/narrate but audio routing wouldn't point here.
		if (this._externalActiveSessionMode) {
			this._activeSessionShown = key;
		}
		this._activateShownSession(resource);
	}

	/**
	 * Routing decision for one audio-response chunk. When the backend echoes a
	 * per-response id, decide the whole response's fate once (on its first chunk),
	 * store it in {@link _responseRoutes}, and make every later chunk of that id
	 * follow it - so interleaved responses for different sessions never steal each
	 * other's routing and a response is never split. Without a responseId, defer
	 * to the legacy session-keyed {@link _shouldDeferResponse}.
	 */
	private _shouldDeferResponseStream(responseId: string | undefined, sessionId: string | undefined, isFirstChunk: boolean): boolean {
		if (!responseId) {
			return this._shouldDeferResponse(sessionId, isFirstChunk);
		}
		const known = this._responseRoutes.get(responseId);
		if (known !== undefined) {
			// Every chunk after the first follows the first chunk's decision, even
			// if focus changed meanwhile (a focus change promotes via the flush
			// path, which rewrites the route to 'live').
			return known === 'deferred';
		}
		const defer = this._shouldDeferForSession(sessionId);
		this._responseRoutes.set(responseId, defer ? 'deferred' : 'live');
		return defer;
	}

	/** Whether two session ids refer to the same session, tolerant of the two id
	 *  spaces (bare backend id vs UI resource) and trivial serialization
	 *  differences. Mirrors the matching used to flush buffered responses so the
	 *  defer decision and the flush agree on identity. */
	private _isSameSession(a: string | undefined, b: string | undefined): boolean {
		if (!a || !b) {
			return false;
		}
		if (a === b || this._canonicalSessionId(a) === this._canonicalSessionId(b)) {
			return true;
		}
		try {
			return isEqual(URI.parse(a), URI.parse(b));
		} catch {
			return false;
		}
	}

	/** Alias-aware read of the last text narrated for a session, used for
	 *  exactly-once dedupe. */
	private _getLastNarratedText(sessionId: string): string | undefined {
		return this._lastNarratedText.get(this._sessionKey(sessionId));
	}

	/** Clear the last-narrated dedupe for a session. */
	private _clearLastNarratedText(sessionId: string): void {
		this._lastNarratedText.delete(this._sessionKey(sessionId));
	}

	/** Whether a response for `sessionId` should defer: true unless it is the
	 *  session currently shown to the user (untagged audio → play). A reply the
	 *  user is awaiting is NOT exempted: if they switched away before it arrived,
	 *  it is deferred like any other background narration and flushed on return. */
	private _shouldDeferForSession(sessionId: string | undefined): boolean {
		if (!sessionId) {
			return false;
		}
		return !this._isSameSession(this._shownSessionId(), sessionId);
	}

	/** True when one of the session's buffered responses is the SAME stream as
	 *  `responseId` (so a live chunk for it is a promotion, not a new response). */
	private _deferredBufferHasResponse(sessionId: string, responseId: string | undefined): boolean {
		if (!responseId) {
			return false;
		}
		return this._deferredResponses.get(sessionId)?.some(r => r.responseId === responseId) ?? false;
	}

	/**
	 * A response is deferred when it is a background narration for a session the
	 * user is NOT looking at. It plays immediately only for the shown session (or
	 * when it is untagged audio); a reply the user was awaiting but has since
	 * switched away from is deferred like any other background narration.
	 *
	 * The decision is made on the first chunk and recorded in `_liveReplyKeys`;
	 * remaining chunks follow the same decision so a response is never split
	 * between playback and the deferred buffer. This session-keyed heuristic is
	 * the fallback for backends that don't echo a per-response id; when they do,
	 * {@link _shouldDeferResponseStream} routes by that id instead.
	 */
	private _shouldDeferResponse(sessionId: string | undefined, isFirstChunk: boolean): boolean {
		const key = sessionId ? this._sessionKey(sessionId) : '';
		if (isFirstChunk) {
			// Untagged audio can't be attributed to a session — always play it.
			if (!sessionId) {
				this._liveReplyKeys.add(key);
				return false;
			}
			// Play live only for the shown session; defer the rest.
			if (!this._shouldDeferForSession(sessionId)) {
				this._liveReplyKeys.add(key);
				return false;
			}
			this._liveReplyKeys.delete(key);
			return true;
		}

		// Continuation chunk: stay consistent with how this response started.
		if (this._deferredResponses.has(key)) {
			return true;
		}
		if (this._liveReplyKeys.has(key)) {
			return false;
		}
		// Continuation whose first chunk we never observed: fall back to the shown
		// session (mirrors the first-chunk decision above).
		return this._shouldDeferForSession(sessionId);
	}

	private _deferResponse(sessionId: string, audio: string, isFirstChunk: boolean, isFinal: boolean, transcript: string | undefined, responseId?: string): void {
		const key = this._sessionKey(sessionId);
		let responses = this._deferredResponses.get(key);
		if (!responses) {
			responses = [];
			this._deferredResponses.set(key, responses);
		}
		// A first chunk begins a NEW response (appended after any already buffered
		// for this session, so all are kept and later played in order). A
		// continuation attaches to ITS OWN response: prefer an exact responseId
		// match so interleaved same-session streams (R1 first, R2 first, R1 cont,
		// R2 cont) don't cross-contaminate; fall back to the most recent still-open
		// response only when the backend didn't echo a responseId.
		let response: IDeferredResponse | undefined;
		if (!isFirstChunk) {
			response = responseId
				? responses.find(r => r.responseId === responseId)
				: [...responses].reverse().find(r => !r.finalized);
		}
		if (!response) {
			response = { responseId, finalized: false, chunks: [] };
			responses.push(response);
			this._markPendingResponse(key, true);
			this.logService.trace(`[voice] deferring response for unfocused session=${key} (buffered=${responses.length}); showing pending indicator`);
		}
		response.chunks.push({ audio, isFirstChunk, isFinal, transcript });
		if (isFinal) {
			response.finalized = true;
		}
	}

	/** Find the buffered-response key for a now-shown session. The buffer is keyed
	 *  by the canonical session key ({@link _sessionKey}); a structural URI-equality
	 *  fallback guards a trivial serialization difference between the backend's
	 *  coding_session_id and the focused sessionResource. */
	private _matchDeferredKey(sessionId: string): string | undefined {
		const key = this._sessionKey(sessionId);
		if (this._deferredResponses.has(key)) {
			return key;
		}
		if (this._deferredResponses.size === 0) {
			return undefined;
		}
		let focusedUri: URI | undefined;
		try { focusedUri = URI.parse(key); } catch { focusedUri = undefined; }
		if (focusedUri) {
			for (const candidate of this._deferredResponses.keys()) {
				try {
					if (isEqual(URI.parse(candidate), focusedUri)) { return candidate; }
				} catch { /* ignore unparseable keys */ }
			}
		}
		return undefined;
	}

	/** Replays all buffered responses for a now-shown session, in arrival order.
	 *  Returns whether anything was flushed plus the normalized final transcript
	 *  of each response played, so the caller can mark _lastNarratedText only for
	 *  text that was actually read (never a newer, unplayed summary). */
	private _flushDeferredResponse(sessionId: string): IDeferredFlushResult {
		const key = this._matchDeferredKey(sessionId);
		if (!key) {
			if (this._deferredResponses.size > 0) {
				this.logService.trace(`[voice] no buffered response matches focused=${sessionId}; pending keys=[${[...this._deferredResponses.keys()].join(', ')}]`);
			}
			return { flushed: false, finalTranscripts: [] };
		}

		const responses = this._deferredResponses.get(key);
		this._deferredResponses.delete(key);
		this._maybeHideIndicator(key);
		if (!responses || responses.length === 0) {
			return { flushed: false, finalTranscripts: [] };
		}
		const totalChunks = responses.reduce((n, r) => n + r.chunks.length, 0);
		this.logService.trace(`[voice] flushing ${responses.length} buffered response(s) (${totalChunks} chunk(s)) for now-focused session=${key}`);
		// Promote any still-open (not-yet-finalized) response's route from
		// 'deferred' to 'live' so the remaining chunks (arriving after this flush)
		// play immediately instead of being re-buffered - a response is never
		// split across a focus change. A finished response has no route (retired
		// on its final chunk), so there is nothing to promote.
		for (const r of responses) {
			if (r.responseId && !r.finalized) {
				this._responseRoutes.set(r.responseId, 'live');
			}
		}
		// The normalized final transcript of each response (its last non-empty
		// chunk holds the complete, cumulative text). Returned to the caller and
		// used below for dedupe.
		const finalTranscripts = responses
			.map(r => this._normalizeTranscript([...r.chunks].reverse().find(c => c.transcript)?.transcript ?? ''))
			.filter(t => !!t);
		// Record that we just replayed this session's buffered reply, so a backend
		// re-narration (same text) arriving shortly after is dropped rather than
		// double-read. The LAST response is the most recent - the one the backend
		// would re-narrate on activation - so dedupe against its final transcript.
		const flushedTranscript = finalTranscripts[finalTranscripts.length - 1];
		if (flushedTranscript) {
			this._recentlyReadResponse.set(key, { transcript: flushedTranscript, at: Date.now() });
			this._lastHeardTranscriptById.set(key, flushedTranscript);
		}

		// Exit any active listening / auto-listen and reset the playback slot so
		// the buffered chunks can play (see _prepareForPlayback).
		this._prepareForPlayback();

		// Play every buffered response for this session, in the order they arrived.
		for (const r of responses) {
			for (const chunk of r.chunks) {
				this._enqueueAudio(key, chunk.audio, chunk.isFirstChunk, chunk.isFinal, chunk.transcript, r.responseId);
			}
		}
		// NOTE: do NOT mark these narrations heard here - enqueuing is not playing.
		// The audio may still be dropped by a later activation / PTT / queue reset
		// / interruption before it plays. It is marked heard from onPlaybackStopped
		// (or the speech-disabled branch of _playChunk), keyed by responseId, only
		// once the audio has actually finished - preserving the pending state so an
		// unplayed reply can be retried instead of silently lost.
		return { flushed: true, finalTranscripts };
	}

	/**
	 * Get the controller out of listening/auto-listen and ready the playback slot
	 * so an about-to-arrive (or just-buffered) narration actually plays instead of
	 * being suppressed. Used before flushing a deferred response AND before
	 * narrating a freshly-shown session's pending item (e.g. a confirmation, which
	 * carries no buffered audio and so never hits the flush path) - otherwise the
	 * controller can sit in listening and the echoed audio is dropped, leaving the
	 * user staring at a focused session that never speaks.
	 */
	private _prepareForPlayback(endOpenTurn = false): void {
		this._clearAutoListenTimer();
		this._autoListenSuppressed = false;
		if (this._pttHeld) {
			// `endOpenTurn` sends a real `ptt_end` (backend clears its latch) vs. a local-only abort.
			this._finishPtt(endOpenTurn ? 'immediate' : 'auto');
		}
		this._pttToggleMode = false;
		this._pttHeld = false;
		this._suppressIncomingAudio = false;
		// Reset the playback slot when nothing is actually playing so `_enqueueAudio`
		// can claim it and drive the state machine to 'speaking'. A prior generic
		// response leaves the slot `undefined` (not `null`), which skips the
		// fast-path, so an explicit reset is required. Do NOT wipe `_audioQueue`:
		// valid audio can be pending during the ~500ms post-playback re-process gap
		// (isPlaying is false but the queue is non-empty), and clearing it here
		// would silently drop those responses.
		if (!this.ttsPlaybackService.isPlaying && this._currentPlaybackSessionId !== null) {
			this._currentPlaybackSessionId = null;
		}
	}

	/**
	 * True when an incoming reply is a re-narration of a reply we recently read
	 * for this session (played live or flushed from the deferred buffer). The
	 * backend re-emits a session's reply when that session becomes active (on
	 * focus), which would otherwise be read a second time. We drop it ONLY when
	 * its transcript matches what we recently read AND arrives within
	 * RENARRATION_DEDUPE_WINDOW_MS - so a genuinely new reply (different text)
	 * always plays, and so does a later identical reply once the window lapses.
	 * The whole response (including continuation chunks) is dropped until final.
	 *
	 * This is purely content-based: it never suppresses a reply just because the
	 * session was heard before, which is what let the backend's server-side
	 * deferral of a NEW reply (delivered as an on-focus narration) be swallowed.
	 */
	private _isRenarration(responseId: string | undefined, sessionId: string | undefined, transcript: string | undefined, isFirstChunk: boolean, isFinal: boolean): boolean {
		if (!sessionId) {
			return false;
		}
		// Key the drop marker by responseId when present so a DIFFERENT same-session
		// response streaming concurrently isn't dropped just because an earlier one
		// was a re-narration; fall back to sessionId when no id was echoed.
		const dropKey = responseId ?? sessionId;
		// Audio we explicitly solicited (its responseId is one we sent on
		// request_narration) is always allowed to play - it can't be an
		// unsolicited duplicate. Retire the id once its stream ends.
		if (responseId && this._solicitedNarrationIds.has(responseId)) {
			if (isFinal) {
				this._solicitedNarrationIds.delete(responseId);
			}
			return false;
		}
		// Continuation of a re-narration we're already dropping.
		if (!isFirstChunk && this._droppingRenarration.has(dropKey)) {
			if (isFinal) {
				this._droppingRenarration.delete(dropKey);
			}
			return true;
		}
		if (!isFirstChunk) {
			return false;
		}
		// A solicited reply the user is actively awaiting always plays.
		if (this._awaitingReplyAudio && this._awaitingReplyForSession === sessionId) {
			return false;
		}
		const recent = this._recentlyReadResponse.get(sessionId);
		if (recent === undefined) {
			return false;
		}
		if (Date.now() - recent.at > VoiceSessionController.RENARRATION_DEDUPE_WINDOW_MS) {
			this._recentlyReadResponse.delete(sessionId);
			return false;
		}
		// Only drop when the incoming reply is the SAME text we recently read.
		// A genuinely new reply (different text) for the same session must still
		// play, so we never suppress on the time window alone.
		const incoming = this._normalizeTranscript(transcript ?? '');
		if (!incoming || !(recent.transcript === incoming || recent.transcript.startsWith(incoming))) {
			return false;
		}
		// This first chunk is the re-narration; keep dropping its continuation
		// chunks (if any) until final. The marker is left in place so repeated
		// re-narrations within the window are also dropped; it expires by time or
		// is overwritten when a new reply is read.
		this._liveReplyKeys.delete(sessionId);
		if (!isFinal) {
			this._droppingRenarration.add(dropKey);
		}
		return true;
	}

	/** Lowercase, collapse whitespace and strip surrounding punctuation so two
	 *  transcripts of the same reply compare equal despite minor formatting. */
	private _normalizeTranscript(text: string): string {
		return text.toLowerCase().replace(/\s+/g, ' ').replace(/^[\s.,!?;:'"]+|[\s.,!?;:'"]+$/g, '').trim();
	}

	private _markPendingResponse(sessionId: string, pending: boolean): void {
		try {
			this.voicePlaybackService.setPendingResponse(URI.parse(sessionId), pending);
		} catch {
			// sessionId isn't a parseable resource - nothing to indicate.
		}
	}

	/**
	 * Reconcile the sessions-list "pending response" indicator for confirmations.
	 * A session that is awaiting user confirmation while NOT focused should show
	 * the indicator; once it is focused or the confirmation is resolved the
	 * indicator is cleared. This is driven purely from client-observed session
	 * state, so it is accurate regardless of whether the backend narrates the
	 * confirmation as audio.
	 */
	private _reconcileConfirmationIndicators(waitingSessionIds: Set<string>): void {
		// Suppress the indicator only for the session the user is currently
		// viewing. In the agents window use the embedder-provided shown session
		// (raw chat-widget focus is unreliable there); in the main window use
		// the focused session. Deliberately avoid the _getActiveSessionId()
		// fallback chain (_targetSession / _lastShownSessionId), which can point
		// at a not-currently-visible session and wrongly hide its indicator.
		const activeId = this._externalActiveSessionMode
			? this._activeSessionShown
			: this._getFocusedSessionId();
		const activeKey = activeId ? this._sessionKey(activeId) : undefined;
		const waitingKeys = new Set<string>();
		for (const sessionId of waitingSessionIds) {
			const key = this._sessionKey(sessionId);
			waitingKeys.add(key);
			if (key === activeKey) {
				// Now the active session - make sure any entry is gone.
				this._clearConfirmationIndicator(key);
				continue;
			}
			if (!this._confirmationPendingSessions.has(key)) {
				this._confirmationPendingSessions.add(key);
				this._markPendingResponse(key, true);
			}
		}
		// Clear it for sessions that are now active or no longer waiting.
		for (const key of [...this._confirmationPendingSessions]) {
			if (waitingKeys.has(key) && key !== activeKey) {
				continue;
			}
			this._clearConfirmationIndicator(key);
		}
	}

	private _clearConfirmationIndicator(sessionId: string): void {
		const key = this._sessionKey(sessionId);
		if (this._confirmationPendingSessions.delete(key)) {
			this._maybeHideIndicator(key);
		}
	}

	/** Drop a session's pending-response (completed-reply) indicator/summary. */
	private _clearPendingResponse(sessionId: string): void {
		const key = this._sessionKey(sessionId);
		if (this._pendingResponseSummaries.delete(key)) {
			this._maybeHideIndicator(key);
		}
	}

	/** Hide the sessions-list indicator only when no owner still needs it. The
	 *  same visible indicator is shared by three independent sources - an
	 *  unfocused confirmation, buffered deferred audio, and a completed
	 *  background reply - so it must stay visible until all are resolved. */
	private _maybeHideIndicator(sessionId: string): void {
		const key = this._sessionKey(sessionId);
		if (this._pendingOwned(key)) {
			return;
		}
		this._markPendingResponse(key, false);
	}

	private _clearDeferredResponses(): void {
		for (const key of this._deferredResponses.keys()) {
			this._markPendingResponse(key, false);
		}
		this._deferredResponses.clear();
		this._responseRoutes.clear();
		for (const key of this._confirmationPendingSessions) {
			this._markPendingResponse(key, false);
		}
		this._confirmationPendingSessions.clear();
		for (const key of this._pendingResponseSummaries.keys()) {
			this._markPendingResponse(key, false);
		}
		this._pendingResponseSummaries.clear();
	}

	// --- Audio FIFO queue ---

	private _interruptAssistantPlayback(): void {
		this._telemetryTtsInterrupted = this._telemetryTtsInterrupted || this.ttsPlaybackService.isPlaying;
		this._audioQueue.length = 0;
		this._currentPlaybackSessionId = null;
		this._isProcessingQueue = false;
		this._suppressIncomingAudio = true;
		this.ttsPlaybackService.stopPlayback();
		// Clear any narration id left over if stopPlayback didn't fire onPlaybackStopped
		// (e.g. nothing was playing), so a later stray stop can't consume a stale id.
		this._currentPlaybackResponseId = undefined;
		this.voicePlaybackService.notifyPlaybackEnd(undefined);
	}

	private _enqueueAudio(sessionId: string | undefined, audio: string, isFirstChunk: boolean, isFinal: boolean, transcript: string | undefined, responseId?: string): void {
		// An incoming response frame means the assistant is actively replying, so
		// cancel any pending auto-listen. Otherwise a debounced listen scheduled
		// when the previous session's playback stopped can fire mid-response and
		// its synthetic pttDown suppresses this session's audio. This matters most
		// when a response leads with a transcript-only frame (empty audio): it
		// consumes the first-chunk flag without starting playback, so the later
		// audio chunks arrive as non-first chunks and would be dropped.
		this._clearAutoListenTimer();

		// User interrupted (pttDown / onSpeechStarted / barge_in): drop late chunks from the
		// previous turn. The backend marks the first audio chunk of a new
		// response with `is_first_chunk: true` — that's our signal that a fresh
		// response is starting and suppression should clear. (We can't key on
		// `transcript` here anymore because the streaming pipeline sends a
		// running-concat transcript on every chunk, including late chunks of
		// the suppressed previous response.)
		if (this._suppressIncomingAudio) {
			if (isFirstChunk) {
				this._suppressIncomingAudio = false;
			} else {
				return;
			}
		}

		if (isFirstChunk) {
			this._clearAwaitingReply();
		}

		// If nothing is playing and queue is empty, or same session is playing, play immediately
		const nothingPlaying = this._currentPlaybackSessionId === null;
		const sameSession = !nothingPlaying && this._currentPlaybackSessionId === sessionId;
		// Only fast-path CONTINUATION chunks of the response that is currently
		// playing (same session, not a first chunk, and not yet finalized). A
		// first chunk always begins a NEW response: even for the same session it
		// must never be appended to the current playback turn, or an overlapping
		// response's audio is pushed past the current turn's scheduled
		// `node.stop()` boundary and one of the two streams is silently dropped.
		// Once the current response's final chunk has been sent, the TTS
		// service's single playback turn has scheduled `node.stop()` at that
		// response's boundary, so a continuation must serialize through the queue
		// too - forcing a fresh turn once the current one finishes.
		const continuationOfCurrent = sameSession && !isFirstChunk && !this._currentPlaybackFinalized;
		if ((nothingPlaying && this._audioQueue.length === 0) || continuationOfCurrent) {
			this._playChunk(sessionId, audio, isFirstChunk, isFinal, transcript, responseId);
			return;
		}

		// Queue this chunk. A response's chunks must never merge with a DIFFERENT
		// response for the same session: playing a later response's audio into an
		// already-finalized entry's buffer would push it past that entry's
		// scheduled `node.stop()` and silently drop it. So every first chunk
		// starts a fresh entry; continuation chunks attach to that session's most
		// recent still-open (not-yet-finalized) entry.
		let entry = isFirstChunk
			? undefined
			: [...this._audioQueue].reverse().find(e =>
				!e.finalized && (e.sessionId === sessionId || (e.sessionId === undefined && sessionId === undefined))
			);
		if (!entry) {
			entry = { sessionId, responseId, finalized: false, chunks: [] };
			this._audioQueue.push(entry);
		}
		entry.chunks.push({ audio, isFirstChunk, isFinal, transcript });
		if (isFinal) {
			entry.finalized = true;
		}

		// If nothing is currently playing, start processing
		if (this._currentPlaybackSessionId === null && !this._isProcessingQueue) {
			this._processQueue();
		}
	}

	private _playChunk(sessionId: string | undefined, audio: string, isFirstChunk: boolean, isFinal: boolean, transcript: string | undefined, responseId?: string): void {
		// Streaming pipeline sends a monotonically-growing transcript on every
		// chunk. On the FIRST chunk of a response we push a fresh assistant
		// turn into the rolling buffer; on subsequent chunks we REPLACE that
		// turn's text as the transcript grows. `_setAssistantTurn` does the
		// right thing in both cases (replace-if-tail-is-assistant), but we
		// gate on `transcript` presence so empty-final degenerate frames
		// don't blank the in-flight turn.
		if (transcript) {
			this._setAssistantTurn(transcript, { startNewTurn: isFirstChunk });
		}

		const sessionResource = sessionId ? URI.parse(sessionId) : undefined;
		if (sessionResource) {
			this.voicePlaybackService.notifyPlaybackStart(sessionResource, transcript);
		}

		const speakResponsesEnabled = this.configurationService.getValue<boolean>('agents.voice.speakResponses') !== false;
		if (speakResponsesEnabled && audio) {
			// Claim the playback slot only when we actually have audio to play.
			// A transcript-only frame (empty audio) must NOT claim it, or the
			// slot would stay pinned to a session that never starts playback
			// (onPlaybackStopped never fires), deadlocking every other
			// session's queued audio.
			this._currentPlaybackSessionId = sessionId;
			// Track the response now occupying the slot so onPlaybackStopped can
			// mark it heard once its audio truly finishes (not merely queued).
			this._currentPlaybackResponseId = responseId;
			// A same-session frame arriving after the final chunk is a NEW
			// response and must be serialized (see `_enqueueAudio`).
			this._currentPlaybackFinalized = isFinal;
			this._clearAutoListenTimer();
			this._replyPlayedSinceSend = true;
			this._voiceState.set('speaking', undefined);
			this._statusText.set('Speaking...', undefined);
			this.ttsPlaybackService.playAudioChunk(audio, isFinal, this._window!);
			if (this._isHandsFreeEnabled()) {
				// Hands-free: keep the mic streaming while the assistant speaks so
				// the backend's server-VAD can hear the user barge in over it. The
				// backend signals a real interruption via `speech_started` / `barge_in`
				// (already wired to stop playback); until then this is a passive,
				// non-interrupting listen that becomes the next listening turn if the
				// user stays silent.
				this._startBargeInListen();
			} else {
				this.micCaptureService.suppressUntil(Date.now() + 800);
			}
		} else if (!speakResponsesEnabled) {
			this._replyPlayedSinceSend = true;
			if (isFinal) {
				this._currentPlaybackSessionId = null;
				this._currentPlaybackResponseId = undefined;
				// Speech is disabled so no audio plays and onPlaybackStopped won't
				// fire: the reply is nonetheless consumed, so mark the solicited
				// narration heard here to clear its pending indicator.
				if (responseId) {
					this._markNarrationHeard(responseId);
				}
				// Avoid re-entering _processQueue if we're already inside its
				// drain loop; that loop will continue on its own.
				if (!this._isProcessingQueue) {
					this._processQueue();
				}
				if (this._isHandsFreeEnabled()) {
					this._scheduleAutoListen();
				}
			}
		} else {
			// TTS enabled but no audio in this frame. Forward it so a final
			// frame can flush/stop an in-flight playback turn; a non-final
			// empty frame is a no-op and leaves the slot untouched.
			// If this empty frame finalizes the currently-playing response,
			// mark it so a later same-session frame serializes as a new turn.
			if (isFinal && this._currentPlaybackSessionId === sessionId) {
				this._currentPlaybackFinalized = true;
			}
			this.ttsPlaybackService.playAudioChunk(audio, isFinal, this._window!);
		}
	}

	private _processQueue(): void {
		// Drain entries until one actually claims the playback slot (starts
		// audio) or the queue empties. Entries that produce no audio (e.g.
		// transcript-only frames) would otherwise stall the chain, since
		// nothing fires onPlaybackStopped to pump the next entry.
		this._isProcessingQueue = true;
		while (this._currentPlaybackSessionId === null && this._audioQueue.length > 0) {
			const next = this._audioQueue.shift()!;
			for (const chunk of next.chunks) {
				this._playChunk(next.sessionId, chunk.audio, chunk.isFirstChunk, chunk.isFinal, chunk.transcript, next.responseId);
			}
		}
		this._isProcessingQueue = false;
	}

	// --- Replay from cache ---

	private _replaySessionAudio(sessionId: string): void {
		this._stopReplay();

		const samples = this._sessionAudioCache.get(sessionId);
		if (!samples || !this._window) { return; }

		const ctx = this.ttsPlaybackService.ensureContext(this._window);
		const buffer = ctx.createBuffer(1, samples.length, 24000);
		buffer.getChannelData(0).set(samples);

		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(ctx.destination);
		this._replaySourceNode = source;

		const sessionResource = URI.parse(sessionId);
		this.voicePlaybackService.notifyPlaybackStart(sessionResource, undefined);
		this._voiceState.set('speaking', undefined);
		this._statusText.set('Replaying...', undefined);

		source.onended = () => {
			if (this._replaySourceNode === source) {
				this._replaySourceNode = undefined;
				this.voicePlaybackService.notifyPlaybackEnd(sessionResource);
				this._voiceState.set('idle', undefined);
				this._statusText.set('Hold to speak...', undefined);
			}
		};

		source.start(0);
	}

	private _stopReplay(): void {
		if (this._replaySourceNode) {
			try { this._replaySourceNode.stop(); } catch { /* already stopped */ }
			this._replaySourceNode = undefined;
		}
	}

	// --- Private helpers ---

	private _sendContext(): void {
		this.voiceClientService.sendSessionContext(this._buildSessionContext());
	}

	/**
	 * (Re)arm the settle timer that emits buffered session state changes. Each
	 * detected transition resets the timer, so a rapid burst (e.g. the history
	 * replay ``thinking <-> idle`` storm) is collapsed to one emission once the
	 * state stops changing. See {@link _pendingStateChanges}.
	 */
	private _scheduleStateChangeEmit(): void {
		if (this._stateChangeEmitTimer) {
			clearTimeout(this._stateChangeEmitTimer);
		}
		this._stateChangeEmitTimer = setTimeout(() => {
			this._stateChangeEmitTimer = undefined;
			this._emitPendingStateChanges();
		}, VoiceSessionController._STATE_CHANGE_SETTLE_MS);
	}

	/** React to a session reaching a narratable state. If it's the shown session, speak it now; a completed reply on a background session instead shows the sessions-list pending indicator and is read when focused. A new turn (`thinking`) clears both the dedup and any stale pending indicator. */
	private _handleNarratableStateChange(sessionId: string, currentState: string, detail: string | undefined, lastResponseSummary: string | undefined, shownNow: string | undefined): void {
		const sessionKey = this._sessionKey(sessionId);
		if (currentState === 'thinking') {
			this._clearLastNarratedText(sessionKey);
			// A new turn supersedes any completed reply that was waiting to be
			// read on focus - drop the stale pending-response indicator.
			this._clearPendingResponse(sessionKey);
			// A deferred narration from the previous turn is now stale.
			this._clearDeferred(sessionKey);
		}
		if (!this._isSameSession(sessionId, shownNow)) {
			// Background session. A completed reply must not play now: show the
			// sessions-list indicator and remember the summary so focusing the
			// session reads it (mirrors the confirmation indicator, which is
			// client-driven and does not depend on the backend sending audio).
			// Confirmations get their own indicator via
			// _reconcileConfirmationIndicators, so only responses are handled here.
			if (currentState === 'idle' && lastResponseSummary) {
				// Skip a reply already read for this session (its exact text is in
				// _lastNarratedText). That map is cleared when the session starts a
				// new turn (thinking, above), so a genuinely new reply still shows
				// the indicator; this only suppresses re-indicating an old reply
				// resurfaced by a reconnect/poll state sync.
				const alreadyRead = this._lastNarratedText.get(sessionKey) === lastResponseSummary;
				const existingSummary = this._pendingResponseSummaries.get(sessionKey);
				if (!alreadyRead && existingSummary !== lastResponseSummary) {
					this._pendingResponseSummaries.set(sessionKey, lastResponseSummary);
					this._markPendingResponse(sessionKey, true);
					this.logService.trace(`[voice] response completed for unfocused session=${sessionKey.slice(-32)}; showing pending indicator`);
				}
			}
			return;
		}
		if (currentState === 'idle' && lastResponseSummary) {
			// Narrate the shown session's reply now. Clear its pending indicator
			// only if it was ALREADY read (a re-fire of a reply we narrated before);
			// a freshly requested narration keeps the indicator until its audio
			// finalizes (_markNarrationHeard clears it then), so a request that is
			// accepted but never produces audio doesn't lose the reply.
			const alreadyNarrated = this._lastNarratedText.get(sessionKey) === lastResponseSummary;
			this._narrate(sessionId, 'response', lastResponseSummary);
			if (alreadyNarrated) {
				this._clearPendingResponse(sessionKey);
			}
		} else if (currentState === 'waiting_for_confirmation' && detail) {
			this._narrate(sessionId, 'confirmation', detail);
		}
	}

	/**
	 * Flush the coalesced session state changes to the backend and persist only
	 * true net changes to the local timeline. {@link _sendContext} rebuilds the
	 * full context from the now-settled model state and `_sendDelta` merge-patches
	 * against the last-sent snapshot, so an oscillation that returned to its prior
	 * state produces no delta. Each buffered change carries the burst's baseline
	 * (`fromState`/`fromDetail`); we compare the settled state against it so a
	 * net-zero wobble is neither traced nor persisted as a `coding_event` (which
	 * would otherwise replay a phantom transition to the backend on reconnect),
	 * and a detail change reached via an intermediate state (e.g.
	 * `waiting(old) → thinking → waiting(new)`) is still treated as detail-only.
	 */
	private _emitPendingStateChanges(): void {
		const changes = [...this._pendingStateChanges.values()];
		this._pendingStateChanges.clear();
		if (changes.length === 0) {
			return;
		}
		// Keep only changes whose settled state differs from the burst baseline;
		// classify a same-state confirmation whose detail changed as detail-only.
		const netChanges: { change: typeof changes[number]; detailOnly: boolean }[] = [];
		for (const change of changes) {
			const detail = change.detail ?? '';
			const summary = change.lastResponseSummary ?? '';
			const stateChanged = change.fromState !== change.currentState;
			const detailOnly = !stateChanged && change.currentState === 'waiting_for_confirmation' && change.fromDetail !== detail;
			// A summary that appeared/changed while the session stayed idle is a
			// real narratable change even though the coarse state didn't move.
			const responseSummaryOnly = !stateChanged && change.currentState === 'idle' && !!summary && change.fromResponseSummary !== summary;
			if (stateChanged || detailOnly || responseSummaryOnly) {
				netChanges.push({ change, detailOnly });
			}
		}
		if (netChanges.length === 0) {
			// The storm settled back to the baseline; still send a fresh context
			// (idempotent — _sendDelta emits nothing) but trace/persist nothing.
			this._sendContext();
			return;
		}
		// Speak the settled item for the shown session; a background session's item
		// waits until the user focuses it. Both this coalesced path and the direct
		// _checkSessionStateChanges path feed this, so remote/unloaded sessions
		// surfaced only by the latter are covered too.
		const shownNow = this._shownSessionId();
		for (const { change } of netChanges) {
			this._handleNarratableStateChange(change.sessionId, change.currentState, change.detail, change.lastResponseSummary, shownNow);
		}
		// For detail-only transitions (same agent_state but different confirmation
		// content), invalidate the cache so _sendDelta treats the session as new
		// and includes agent_state + agent_state_detail together.
		for (const { change, detailOnly } of netChanges) {
			if (detailOnly) {
				this.voiceClientService.invalidateSessionCache(change.sessionId);
			}
		}
		this._sendContext();
		this.logService.trace(`[voice] emitting ${netChanges.length} settled stateChange(s): ${netChanges.map(({ change, detailOnly }) => `${change.label}:${change.currentState}${detailOnly ? ' (detail-only)' : ''}`).join(', ')}`);
		this.voiceClientService.flushSessionContext();
		for (const { change } of netChanges) {
			// Persist as a coding_event in the local timeline so
			// "session X went from thinking → waiting_for_confirmation"
			// can be replayed as cross-session context on reconnect.
			this._persistEntry(
				'coding_event',
				`session "${change.label}" → ${change.currentState}`,
				{
					codingSessionId: change.sessionId,
					codingStatus: change.currentState,
					codingSessionLabel: change.label,
				},
			);
		}
	}

	/**
	 * Paranoid mitigation for the "confirmation narration not fired while user
	 * is on the same session" symptom. Even though the autorun calls
	 * `_sendContext + flushSessionContext` at the transition, in practice
	 * users observed that the BE-side narration ("I need approval to run X")
	 * only fires after they navigate AWAY from the session.
	 *
	 * As a guarded re-flush we schedule a single delayed `_sendContext + flush`
	 * per session that's awaiting confirmation. The merge-patch in
	 * `_sendDelta` short-circuits when no fields changed (see lines 393-395),
	 * so a no-op re-send is silent on the BE — but if the FIRST send was
	 * dropped (race condition, debounce hiccup, WS coalescing), this second
	 * send pushes the state through.
	 *
	 * The watchdog auto-clears once the autorun observes the session has left
	 * `waiting_for_confirmation`.
	 */
	private _armConfirmationFlushWatchdog(sessionId: string, label: string, isTransition: boolean): void {
		// Already armed — leave it alone. We want exactly one delayed
		// re-flush per confirmation window, not a refreshed timer.
		if (this._confirmationFlushWatchdogs.has(sessionId)) {
			return;
		}
		if (isTransition) {
			this.logService.trace(`[voice] arming confirmation flush watchdog id=${sessionId.slice(-32)} label="${label}"`);
		}
		const timer = setTimeout(() => {
			this._confirmationFlushWatchdogs.delete(sessionId);
			this.logService.trace(`[voice] confirmation flush watchdog firing id=${sessionId.slice(-32)} label="${label}"`);
			// Re-publish the current context. _sendDelta merge-patch will be
			// a no-op if the BE already received the prior delta.
			this._sendContext();
			this.voiceClientService.flushSessionContext();
		}, VoiceSessionController._CONFIRMATION_FLUSH_DELAY_MS);
		this._confirmationFlushWatchdogs.set(sessionId, timer);
	}

	/**
	 * Check all sessions for state changes and send notifications to backend.
	 * This catches state transitions for sessions without a loaded chat model
	 * (which the autorun can't track via observables), and also regular chat
	 * sessions that are not agent sessions.
	 */
	private _checkSessionStateChanges(): void {
		// Safety net: if the focus-change event was missed while voice was busy,
		// flush any buffered response for the session now shown to the user so it
		// never stays stuck as a pending indicator with no playback. Use the SHOWN
		// session (not `_getActiveSessionId()`, which prefers the sticky input
		// `_targetSession` and would flush a background session's reply over the
		// one the user is viewing). The flush matches the buffered key robustly.
		if (this._deferredResponses.size > 0) {
			const shown = this._shownSessionId();
			if (shown) {
				this._flushDeferredResponse(shown);
			}
		}

		const sessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
		const stateChanges: { sessionId: string; currentState: string; label: string; detail?: string; lastResponseSummary?: string }[] = [];
		const processedResources = new Set<string>();
		const waitingSessionIds = new Set<string>();

		for (const s of sessions) {
			processedResources.add(s.resource.toString());
			const sessionId = s.resource.toString();
			const model = this.chatService.getSession(s.resource);
			let currentState: string;
			let detail: string | undefined;
			let lastResponseSummary: string | undefined;
			if (model) {
				const info = this._getAgentStateInfo(model);
				// Hold a summary-less idle while an eager reload is still replaying
				// (see _effectiveResidentState); once we stop holding the model is
				// resident with a proper summary, so drop the pending idle deferral.
				currentState = this._effectiveResidentState(sessionId, info);
				detail = info.detail;
				lastResponseSummary = currentState === info.state ? info.last_response_summary : undefined;
				// Capture the summary while resident so a later completion after
				// disposal can still narrate.
				this._cacheResponseSummary(sessionId, info.state, info.last_response_summary);
				if (currentState === info.state) {
					this._pendingIdleNarration.delete(sessionId);
				}
			} else {
				currentState = s.status === AgentSessionStatus.InProgress ? 'thinking'
					: s.status === AgentSessionStatus.NeedsInput ? 'waiting_for_confirmation'
						: s.status === AgentSessionStatus.Completed ? 'idle'
							: 'unknown';
				// A new turn supersedes any cached summary even without a resident
				// model, so a later completion never narrates the previous reply.
				this._cacheResponseSummary(sessionId, currentState, undefined);
				if (s.status === AgentSessionStatus.NeedsInput) {
					this._ensureModelLoaded(s.resource);
				}
			}

			const prev = this._prevSessionStates.get(sessionId);
			const isStateChange = prev !== undefined && prev.state !== currentState && currentState !== 'unknown';
			const isDetailChange = !isStateChange && prev !== undefined && currentState === 'waiting_for_confirmation' && (detail ?? '') !== prev.detail;

			// Arm the awaiting-summary marker on a genuine new turn so this run's
			// completion is later recognized as new (see autorun for rationale).
			if (isStateChange && currentState === 'thinking' && !this._eagerModelLoading.has(sessionId)) {
				this._sessionsAwaitingResponseSummary.add(sessionId);
			}

			// Summary-less idle transitions for remote/Copilot sessions: narrate
			// from the cached summary if we have one, otherwise defer until the
			// model loads (see _deferIdleNarrationUntilModelLoaded).
			if (!model && currentState === 'idle' && isStateChange) {
				const cachedSummary = this._lastResponseSummaryById.get(sessionId);
				if (!cachedSummary) {
					this._deferIdleNarrationUntilModelLoaded(s.resource);
					continue;
				}
				lastResponseSummary = cachedSummary;
			}

			// A completed reply's summary can land after the idle transition (or
			// change while still idle), producing no state change; treat it as its
			// own narratable transition so the reply is still surfaced/narrated -
			// but ONLY for a session that actually ran this lifetime, so an old
			// summary surfacing from a rehydrated dormant model isn't mistaken for
			// a new reply.
			const normalizedSummary = lastResponseSummary ?? '';
			const isResponseSummaryChange = !isStateChange && prev !== undefined && currentState === 'idle' && !!normalizedSummary && normalizedSummary !== prev.lastResponseSummary && this._sessionsAwaitingResponseSummary.has(sessionId);

			// The completion for this run has been accepted; consume the marker.
			if ((isStateChange && currentState === 'idle' && !!normalizedSummary) || isResponseSummaryChange) {
				this._sessionsAwaitingResponseSummary.delete(sessionId);
			}

			if (isStateChange || isDetailChange || isResponseSummaryChange) {
				const cancelExpiry = this._userCancelledSessions.get(sessionId);
				if (cancelExpiry) {
					clearTimeout(cancelExpiry);
					this._userCancelledSessions.delete(sessionId);
				} else {
					if (isDetailChange) {
						this.voiceClientService.invalidateSessionCache(sessionId);
					}
					stateChanges.push({ sessionId, currentState, label: s.label || 'Untitled session', detail, lastResponseSummary });
				}
			}
			if (currentState !== 'unknown') {
				// Preserve a known summary rather than clobbering with '' so a
				// model unload→reload can't manufacture a fresh-reply transition.
				const rememberedSummary = normalizedSummary || this._lastResponseSummaryById.get(sessionId) || prev?.lastResponseSummary || '';
				this._prevSessionStates.set(sessionId, { state: currentState, detail: detail ?? '', lastResponseSummary: rememberedSummary });
			}
			if (currentState === 'waiting_for_confirmation') {
				waitingSessionIds.add(sessionId);
			}
		}

		// Also check regular (non-agent) chat sessions
		for (const chatModel of this.chatService.chatModels.get()) {
			const key = chatModel.sessionResource.toString();
			if (processedResources.has(key)) { continue; }
			if (chatModel.getRequests().length === 0) { continue; }

			const info = this._getAgentStateInfo(chatModel);
			const currentState = info.state;
			const detail = info.detail;
			const lastResponseSummary = info.last_response_summary;

			const prev = this._prevSessionStates.get(key);
			const isStateChange = prev !== undefined && prev.state !== currentState && currentState !== 'unknown';
			const isDetailChange = !isStateChange && prev !== undefined && currentState === 'waiting_for_confirmation' && (detail ?? '') !== prev.detail;

			// Arm the awaiting-summary marker on a genuine new turn.
			if (isStateChange && currentState === 'thinking' && !this._eagerModelLoading.has(key)) {
				this._sessionsAwaitingResponseSummary.add(key);
			}

			const normalizedSummary = lastResponseSummary ?? '';
			const isResponseSummaryChange = !isStateChange && prev !== undefined && currentState === 'idle' && !!normalizedSummary && normalizedSummary !== prev.lastResponseSummary && this._sessionsAwaitingResponseSummary.has(key);

			// The completion for this run has been accepted; consume the marker.
			if ((isStateChange && currentState === 'idle' && !!normalizedSummary) || isResponseSummaryChange) {
				this._sessionsAwaitingResponseSummary.delete(key);
			}

			if (isStateChange || isDetailChange || isResponseSummaryChange) {
				if (isDetailChange) {
					this.voiceClientService.invalidateSessionCache(key);
				}
				stateChanges.push({ sessionId: key, currentState, label: chatModel.title || 'Chat', detail, lastResponseSummary });
			}
			if (currentState !== 'unknown') {
				const rememberedSummary = normalizedSummary || this._lastResponseSummaryById.get(key) || prev?.lastResponseSummary || '';
				this._prevSessionStates.set(key, { state: currentState, detail: detail ?? '', lastResponseSummary: rememberedSummary });
			}
			if (currentState === 'waiting_for_confirmation') {
				waitingSessionIds.add(key);
			}
		}

		// Keep the sessions-list pending indicator in sync for confirmations that
		// arrive on sessions detected here (e.g. remote/unloaded sessions surfaced
		// via onDidChangeSessions or the periodic poll rather than the autorun).
		this._reconcileConfirmationIndicators(waitingSessionIds);

		// Speak the settled item for the shown session; completions surfaced ONLY
		// here (e.g. remote/unloaded sessions) are covered too. Background sessions
		// are spoken on focus.
		const shownNow = this._shownSessionId();
		for (const change of stateChanges) {
			this._handleNarratableStateChange(change.sessionId, change.currentState, change.detail, change.lastResponseSummary, shownNow);
		}

		if (stateChanges.length > 0) {
			this.logService.trace(`[voice] onDidChangeSessions detected ${stateChanges.length} state change(s): ${stateChanges.map(c => `${c.label}: ${c.currentState}`).join(', ')}`);
			// Push fresh context + flush the debounce so the backend picks up the transition without a 500ms wait; this only updates tracked state (narration is requested via _handleNarratableStateChange above).
			this._sendContext();
			this.voiceClientService.flushSessionContext();
			for (const change of stateChanges) {
				this._persistEntry(
					'coding_event',
					`session "${change.label}" → ${change.currentState}`,
					{
						codingSessionId: change.sessionId,
						codingStatus: change.currentState,
						codingSessionLabel: change.label,
					},
				);
			}
		}
	}

	/**
	 * Scope confirmations to the active session before reporting to the backend.
	 *
	 * Only the active (focused/target) session's `waiting_for_confirmation` state
	 * is reported as such; any OTHER session awaiting confirmation is downgraded
	 * to `thinking` (and its confirmation detail dropped). This does two things:
	 *
	 *  1. The backend only ever sees a single confirmation, so it never asks the
	 *     user "which one do you want me to approve?".
	 *  2. When the user focuses a session that was awaiting confirmation while
	 *     unfocused, `_buildSessionContext` starts reporting it as
	 *     `waiting_for_confirmation`. The backend observes the fresh
	 *     `thinking -> waiting_for_confirmation` transition and narrates the
	 *     confirmation at that moment (the "read it out on focus" behaviour).
	 *
	 * The sessions-list pending indicator for the unfocused confirmation is
	 * driven separately from client-observed state (_reconcileConfirmationIndicators),
	 * so it stays accurate even though the backend isn't told about it.
	 */
	private _reportedAgentState(realState: string, isActive: boolean): { state: string; hideConfirmationDetail: boolean } {
		if (realState === 'waiting_for_confirmation' && !isActive) {
			return { state: 'thinking', hideConfirmationDetail: true };
		}
		return { state: realState, hideConfirmationDetail: false };
	}



	private _buildSessionContext(): IVoiceSessionContext {
		const oneHourAgo = Date.now() - 60 * 60 * 1000;
		const sessions = this.agentSessionsService.model.sessions.filter(s => {
			if (s.isArchived()) { return false; }
			if (s.status === AgentSessionStatus.InProgress || s.status === AgentSessionStatus.NeedsInput) { return true; }
			if (s.status === AgentSessionStatus.Completed) {
				const endedAt = s.timing.lastRequestEnded ?? s.timing.created;
				return endedAt !== undefined && endedAt > oneHourAgo;
			}
			return false;
		});

		// Prefer an explicit target session, but fall back to the currently
		// active (last-shown / focused) session so the backend always has a
		// single active session to act on. Without this, when several sessions
		// await confirmation the backend has no active session and asks the user
		// which one to use.
		const targetSessionId = this._getActiveSessionId();

		const sessionList = sessions.map(s => {
			const model = this.chatService.getSession(s.resource);
			const isActive = s.resource.toString() === targetSessionId;
			if (!model) {
				const sessionIdStr = s.resource.toString();
				let fallbackState = s.status === AgentSessionStatus.InProgress ? 'thinking'
					: s.status === AgentSessionStatus.NeedsInput ? 'waiting_for_confirmation'
						: s.status === AgentSessionStatus.Completed ? 'idle'
							: 'unknown';
				// If this idle transition is deferred until the model loads, keep
				// reporting the prior state so the backend doesn't narrate a
				// premature, summary-less completion. See _pendingIdleNarration.
				// If we already cached a summary while the model was resident we
				// can narrate now, so don't hold in that case.
				if (fallbackState === 'idle' && this._pendingIdleNarration.has(sessionIdStr) && !this._lastResponseSummaryById.has(sessionIdStr)) {
					const prev = this._prevSessionStates.get(sessionIdStr);
					if (prev?.state) {
						fallbackState = prev.state;
					}
				}
				// A confirmation whose model isn't resident has no detail yet; report `thinking` (and load the model) so the backend's state tracking doesn't briefly show a detail-less confirmation. Narration follows once the detail renders.
				if (fallbackState === 'waiting_for_confirmation') {
					this._ensureModelLoaded(s.resource);
					fallbackState = 'thinking';
				}
				const scoped = this._reportedAgentState(fallbackState, isActive);
				// Supply the summary captured while the model was resident, so an
				// idle completion that lands after the model is disposed still
				// narrates instead of shipping a summary-less (silent) idle.
				const cachedSummary = fallbackState === 'idle' ? this._lastResponseSummaryById.get(sessionIdStr) : undefined;
				return {
					id: sessionIdStr,
					is_active: isActive,
					agent_state: scoped.state,
					...(cachedSummary ? { last_response_summary: cachedSummary } : {}),
				};
			}
			const stateInfo = this._getAgentStateInfo(model);
			// Capture the summary while the model is resident so a later
			// completion reported after the model is disposed can still narrate.
			this._cacheResponseSummary(s.resource.toString(), stateInfo.state, stateInfo.last_response_summary);
			// Report a detail-less confirmation as `thinking` so the backend's state tracking doesn't briefly show a confirmation without its detail; narration is driven separately once the detail renders.
			const detailPending = stateInfo.state === 'waiting_for_confirmation' && !stateInfo.detail;
			// Hold a summary-less idle while an eager reload is still replaying the
			// response, so we don't ship (and consume) the idle before the summary
			// is ready. See _effectiveResidentState.
			const heldState = this._effectiveResidentState(s.resource.toString(), stateInfo);
			const scoped = detailPending
				? { state: 'thinking', hideConfirmationDetail: true }
				: this._reportedAgentState(heldState, isActive);
			const shipSummary = heldState === stateInfo.state ? stateInfo.last_response_summary : undefined;
			return {
				id: s.resource.toString(),
				is_active: isActive,
				agent_state: scoped.state,
				...(!scoped.hideConfirmationDetail && stateInfo.detail ? { agent_state_detail: stateInfo.detail } : {}),
				...(shipSummary ? { last_response_summary: shipSummary } : {}),
			};
		});

		// Also include regular (non-agent) chat sessions with requests so the
		// backend can track their state (confirmations, completions, etc.)
		const agentResources = new Set(this.agentSessionsService.model.sessions.map(s => s.resource.toString()));
		for (const chatModel of this.chatService.chatModels.get()) {
			const key = chatModel.sessionResource.toString();
			if (agentResources.has(key)) { continue; }
			if (chatModel.getRequests().length === 0) { continue; }
			const stateInfo = this._getAgentStateInfo(chatModel);
			// Include active/waiting sessions always, idle only if recent
			if (stateInfo.state === 'idle') {
				const lastActive = chatModel.lastMessageDate;
				if (lastActive < oneHourAgo) { continue; }
			}
			const isActive = key === targetSessionId;
			const scoped = this._reportedAgentState(stateInfo.state, isActive);
			sessionList.push({
				id: key,
				is_active: isActive,
				agent_state: scoped.state,
				...(!scoped.hideConfirmationDetail && stateInfo.detail ? { agent_state_detail: stateInfo.detail } : {}),
				...(stateInfo.last_response_summary ? { last_response_summary: stateInfo.last_response_summary } : {}),
			});
		}

		// Try to get active session from chatViewPane via command
		let activeSession: { id: string; last_message: string | null } | undefined;
		try {
			// This is fire-and-forget; the sync command bridge populates active_session
			// For now, we omit active_session when called from controller
			// (the chatViewPane's context already had this, the floating window didn't)
		} catch {
			// ignore
		}

		const context: IVoiceSessionContext = {
			sessions: sessionList,
			display_locale: this._window?.navigator.language || 'en-US',
		};
		if (activeSession) {
			context.active_session = activeSession;
		}
		return context;
	}

	/**
	 * Eagerly load a chat model for a session that needs input but hasn't been
	 * opened in the UI yet. Once loaded, the autorun observables will re-fire
	 * with full confirmation detail so the backend can narrate properly.
	 */
	private _ensureModelLoaded(resource: URI): void {
		const key = resource.toString();
		// Skip if already loaded, resident in the UI, or a load is in flight.
		// The in-flight guard prevents repeated onDidChangeSessions/autorun
		// cycles from starting concurrent loads whose refs would overwrite each
		// other in _eagerModelRefs and leak the prior ref.
		if (this._eagerModelRefs.has(key) || this._eagerModelLoading.has(key) || this.chatService.getSession(resource)) {
			return;
		}
		this.logService.trace(`[voice] eagerly loading model for session ${key.slice(-32)}`);
		this._eagerModelLoading.add(key);
		const cts = new CancellationTokenSource();
		this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, cts.token, 'VoiceSessionController#eagerLoad').then(ref => {
			this._eagerModelLoading.delete(key);
			if (ref) {
				const existing = this._eagerModelRefs.get(key);
				if (!this._isConnected.get() || existing) {
					ref.dispose();
					if (!this._isConnected.get()) {
						this._pendingIdleNarration.delete(key);
					}
				} else {
					this._eagerModelRefs.set(key, ref);
					// Model state/detail are now readable; flush so confirmation narrates
					// immediately instead of waiting for the next context send.
					this._checkSessionStateChanges();
					this._sendContext();
					this.voiceClientService.flushSessionContext();
					// If the user is looking at this session, narrate its now-resident
					// pending item directly. _checkSessionStateChanges only narrates on
					// a state transition, but a completed reply focused after it settled
					// shows no idle->idle transition and would otherwise stay silent.
					// _narrate's _lastNarratedText guard prevents double-reading an
					// already-read reply; this mirrors the confirmation-on-focus path.
					if (this._shownSessionId() === key) {
						this._activateShownSession(resource);
					}
				}
			} else {
				// Load failed; stop suppressing the coarse idle for this session.
				this._pendingIdleNarration.delete(key);
			}
			cts.dispose();
		}, () => { this._eagerModelLoading.delete(key); this._pendingIdleNarration.delete(key); cts.dispose(); });
	}

	/**
	 * Defer narrating a session's ``idle`` transition until its chat model is
	 * resident, so the narration can include ``last_response_summary``. Remote/
	 * Copilot sessions don't keep their model loaded, so without this the
	 * backend would only ever see a summary-less completion. Eagerly loads the
	 * model; once it resolves the autorun re-fires and narrates with the summary.
	 */
	private _deferIdleNarrationUntilModelLoaded(resource: URI): void {
		this._pendingIdleNarration.add(resource.toString());
		this._ensureModelLoaded(resource);
	}

	/**
	 * Cache (or invalidate) a session's response summary based on the current
	 * state observed from its resident model. Called wherever a resident model's
	 * state is computed so the summary survives the model's disposal.
	 * - `idle` with a summary → cache it (the completed reply).
	 * - `thinking` → a new turn started; drop the stale summary so a later
	 *   completion never narrates the previous reply.
	 */
	private _cacheResponseSummary(sessionId: string, state: string, summary: string | undefined): void {
		if (state === 'idle' && summary) {
			this._lastResponseSummaryById.set(sessionId, summary);
		} else if (state === 'thinking') {
			this._lastResponseSummaryById.delete(sessionId);
		}
	}

	/**
	 * Drop per-session caches for sessions no longer in the tracked set, so a
	 * long-lived voice connection doesn't retain summaries/state for archived,
	 * removed, or disposed sessions that will never be narrated again.
	 */
	private _pruneSessionCaches(liveSessionIds: Set<string>): void {
		for (const id of this._lastResponseSummaryById.keys()) {
			if (!liveSessionIds.has(id)) {
				this._lastResponseSummaryById.delete(id);
			}
		}
		for (const id of this._lastNarratedText.keys()) {
			if (!liveSessionIds.has(id)) {
				this._lastNarratedText.delete(id);
			}
		}
		for (const id of Array.from(this._sessionsAwaitingResponseSummary)) {
			if (!liveSessionIds.has(id)) {
				this._sessionsAwaitingResponseSummary.delete(id);
			}
		}
		// A background session that completed a reply but was archived/removed
		// before being focused would otherwise keep its pending-response summary
		// and sessions-list indicator for the life of the voice connection.
		// _clearPendingResponse drops the summary and hides the indicator (only
		// when no other owner still needs it).
		for (const id of [...this._pendingResponseSummaries.keys()]) {
			if (!liveSessionIds.has(id)) {
				this._clearPendingResponse(id);
			}
		}
	}

	/**
	 * The state to report for a resident model, applying the idle-narration hold.
	 *
	 * When a completion is detected for an unfocused session we eagerly reload
	 * its (disposed) model to recover ``last_response_summary``. That reloaded
	 * model is briefly resident with an EMPTY response while its history is still
	 * replaying, so reporting its bare ``idle`` now would ship a summary-less
	 * completion (which the backend never narrates) AND consume the ``idle``
	 * transition before the summary exists. While the eager load is still in
	 * flight we therefore hold — report the prior state — so the ``idle`` isn't
	 * shipped until it can carry the summary. The load always resolves (its
	 * callback clears ``_eagerModelLoading``), so the hold can never last forever.
	 */
	private _effectiveResidentState(sessionId: string, stateInfo: { state: string; last_response_summary?: string }): string {
		if (stateInfo.state === 'idle'
			&& !stateInfo.last_response_summary
			&& this._pendingIdleNarration.has(sessionId)
			&& this._eagerModelLoading.has(sessionId)) {
			const prev = this._prevSessionStates.get(sessionId);
			return prev?.state ?? 'thinking';
		}
		return stateInfo.state;
	}

	private _getAgentStateInfo(model: IChatModel | undefined | null): { state: string; detail?: string; last_response_summary?: string } {
		if (!model) {
			return { state: 'unknown' };
		}

		const lastRequest = model.getRequests().at(-1);
		const pendingConfirmation = lastRequest?.response?.isPendingConfirmation.get();
		if (pendingConfirmation) {
			// Scan ALL response parts to find the most recent pending item.
			// We iterate the full list and keep overwriting `confirmDetail` so
			// the LAST match wins — response parts are ordered chronologically,
			// so earlier tools (already confirmed) will have left
			// WaitingForConfirmation while the newest pending item is last.
			let confirmDetail = '';
			for (const part of lastRequest?.response?.response.value ?? []) {
				if (part.kind === 'questionCarousel' && !(part as { isUsed?: boolean }).isUsed) {
					const carousel = part as { questions?: { title?: string }[]; message?: string | { value: string } };
					const titles = (carousel.questions ?? []).map(q => q.title).filter(Boolean);
					if (titles.length > 0) {
						confirmDetail = `questions: ${titles.join(', ')}`;
					} else {
						const msg = carousel.message;
						confirmDetail = msg ? (typeof msg === 'string' ? msg : msg.value) : 'asking clarifying questions';
					}
				} else if (part.kind === 'planReview' && !(part as { isUsed?: boolean }).isUsed) {
					confirmDetail = 'review the plan to continue';
				} else if (part.kind === 'elicitation2') {
					const elicitation = part as { state: IObservable<string>; title?: string | { value: string } };
					if (elicitation.state.get() === 'pending') {
						const title = elicitation.title;
						confirmDetail = title ? (typeof title === 'string' ? title : title.value) : 'needs input';
					}
				} else if (part.kind === 'confirmation' && !(part as { isUsed?: boolean }).isUsed) {
					const conf = part as { title?: string };
					confirmDetail = conf.title ?? 'needs approval';
				} else if (part.kind === 'toolInvocation') {
					const state = part.state.get();
					if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
						const params = state.parameters as Record<string, unknown> | undefined;
						const command = params?.['command'] ?? params?.['input'];
						const explanation = params?.['explanation'] ?? params?.['goal'];
						if (typeof command === 'string' && command) {
							confirmDetail = `command: ${command}`;
							if (typeof explanation === 'string' && explanation) {
								confirmDetail += `\nreason: ${explanation}`;
							}
						} else {
							confirmDetail = pendingConfirmation.detail ?? '';
						}
					}
				}
			}

			return {
				state: 'waiting_for_confirmation',
				detail: confirmDetail || pendingConfirmation.detail || '',
			};
		}

		// Fallback: some tools (e.g. askQuestions) enter WaitingForConfirmation
		// without setting confirmationMessages, so isPendingConfirmation is
		// undefined. Scan response parts directly to catch these.
		if (lastRequest?.response) {
			let fallbackDetail: string | undefined;
			for (const part of lastRequest.response.response.value) {
				if (part.kind === 'toolInvocation') {
					const state = part.state.get();
					if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
						const params = state.parameters as Record<string, unknown> | undefined;
						const questions = params?.['questions'];
						let detail = '';
						if (Array.isArray(questions) && questions.length > 0) {
							const headers = questions
								.map((q: Record<string, unknown>) => q['header'] || q['question'])
								.filter(Boolean)
								.join(', ');
							detail = headers ? `questions: ${headers}` : 'asking clarifying questions';
						}
						if (!detail) {
							const invMsg = (part as { invocationMessage?: string | { value: string } }).invocationMessage;
							detail = invMsg ? (typeof invMsg === 'string' ? invMsg : invMsg.value) : 'needs input';
						}
						fallbackDetail = detail;
					}
				}
			}
			if (fallbackDetail !== undefined) {
				return {
					state: 'waiting_for_confirmation',
					detail: fallbackDetail,
				};
			}
		}

		const incomplete = lastRequest?.response?.isIncomplete.get() ?? false;
		if (incomplete) {
			return { state: 'thinking' };
		}

		const responseText = lastRequest?.response?.response.getMarkdown().trim() ?? '';
		return { state: 'idle', ...(responseText ? { last_response_summary: responseText } : {}) };
	}

	private _classifyPendingType(response: { response: { value: readonly { kind: string }[] } }): 'approval' | 'input' {
		// Return the type of the LAST pending part (most recently added)
		let result: 'approval' | 'input' = 'input';
		for (const part of response.response.value) {
			if (part.kind === 'toolInvocation') {
				const invocation = part as IChatToolInvocation;
				const state = invocation.state.get();
				if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ||
					state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
					result = 'approval';
				}
			}
			if (part.kind === 'confirmation' && !(part as { isUsed?: boolean }).isUsed) {
				result = 'approval';
			}
			if (part.kind === 'questionCarousel' && !(part as { isUsed?: boolean }).isUsed) {
				result = 'input';
			}
			if (part.kind === 'planReview' && !(part as { isUsed?: boolean }).isUsed) {
				result = 'input';
			}
			if (part.kind === 'elicitation2') {
				result = 'input';
			}
		}
		return result;
	}

	private _getConfirmationDescription(response: { response: { value: readonly { kind: string }[] } }): string {
		// Return the description of the LAST pending part (most recently added)
		let desc = '';
		for (const part of response.response.value) {
			if (part.kind === 'toolInvocation') {
				const invocation = part as IChatToolInvocation;
				const state = invocation.state.get();
				if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
					const params = state.parameters as Record<string, unknown> | undefined;
					const command = params?.['command'] ?? params?.['input'];
					const explanation = params?.['explanation'] ?? params?.['goal'];
					if (typeof command === 'string' && command) {
						desc = typeof explanation === 'string' ? `${command} — ${explanation}` : command;
					}
				}
			} else if (part.kind === 'questionCarousel' && !(part as { isUsed?: boolean }).isUsed) {
				const carousel = part as { questions?: { title?: string }[]; message?: string | { value: string } };
				const titles = (carousel.questions ?? []).map(q => q.title).filter(Boolean);
				if (titles.length > 0) {
					desc = titles.join(', ');
				} else {
					const msg = carousel.message;
					desc = msg ? (typeof msg === 'string' ? msg : msg.value) : 'asking clarifying questions';
				}
			} else if (part.kind === 'elicitation2') {
				const elicitation = part as unknown as { state: IObservable<string>; title?: string | { value: string } };
				if (elicitation.state.get() === 'pending') {
					const title = elicitation.title;
					desc = title ? (typeof title === 'string' ? title : title.value) : 'needs input';
				}
			} else if (part.kind === 'planReview' && !(part as { isUsed?: boolean }).isUsed) {
				desc = 'review the plan to continue';
			} else if (part.kind === 'confirmation' && !(part as { isUsed?: boolean }).isUsed) {
				desc = (part as { title?: string }).title ?? 'needs approval';
			}
		}
		return desc;
	}

	private _autoApproveCheck(): void {
		if (this._autoApprovedSessions.size === 0) { return; }
		const sessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
		for (const s of sessions) {
			if (!this._autoApprovedSessions.has(s.resource.toString())) { continue; }
			const model = this.chatService.getSession(s.resource);
			if (!model) { continue; }
			for (const req of model.getRequests()) {
				const pending = req.response?.isPendingConfirmation.get();
				if (pending && req.response) {
					for (const part of req.response.response.value) {
						if (part.kind === 'toolInvocation') {
							IChatToolInvocation.confirmWith(part as IChatToolInvocation, { type: ToolConfirmKind.UserAction });
						}
					}
				}
			}
		}
	}

	// --- Machine ID ---

	private _getMachineId(): string {
		return (this.environmentService as { machineId?: string }).machineId ?? 'unknown';
	}

	// --- Feedback ---

	async submitFeedback(feedbackText: string): Promise<{ ok: boolean; error?: string }> {
		let userId = this._userLogin;
		if (!userId) {
			try {
				const sessions = await this.authenticationService.getSessions('github');
				userId = sessions[0]?.account.label ?? 'unknown';
			} catch {
				userId = 'unknown';
			}
		}
		let transcriptHistory: IVoiceFeedbackTranscriptTurn[] = [];
		try {
			const turns = await this.voiceTranscriptStore.loadTurns(userId);
			transcriptHistory = turns.map(t => ({
				role: t.role,
				text: t.text,
				timestamp: t.timestamp,
			}));
		} catch (err) {
			this.logService.warn('[voice] failed to load transcript history for feedback', err);
		}

		const sessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
		const clientSessionState: Record<string, unknown> = {
			voiceState: this._voiceState.get(),
			isConnected: this._isConnected.get(),
			isConnecting: this._isConnecting.get(),
			isReconnecting: this._isReconnecting.get(),
			pendingToolConfirmations: this._pendingToolConfirmations.get().map(tc => ({
				type: tc.type,
				sessionLabel: tc.sessionLabel,
				description: tc.description,
			})),
			activeSessions: sessions.map(s => ({
				id: s.resource.toString(),
				label: s.label,
				status: s.status,
			})),
		};

		const clientEnvironment: Record<string, unknown> = {
			machineId: this._getMachineId(),
		};

		const payload: IVoiceFeedbackPayload = {
			feedbackText,
			machineId: this._getMachineId(),
			userId,
			sessionId: this.voiceClientService.currentSessionId ?? '',
			submissionId: generateUuid(),
			transcriptHistory,
			clientSessionState,
			clientEnvironment,
			timestamp: new Date().toISOString(),
		};

		return this.voiceClientService.submitFeedback(payload);
	}
}

registerSingleton(IVoiceSessionController, VoiceSessionController, InstantiationType.Delayed);
