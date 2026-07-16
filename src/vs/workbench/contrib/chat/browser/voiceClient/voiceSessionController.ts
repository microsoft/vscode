/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, autorun, transaction, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { disposableWindowInterval } from '../../../../../base/browser/dom.js';
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
import { IVoiceClientService, IVoicePriorTimelineEntry, IVoiceSessionContext, IVoiceFeedbackPayload, IVoiceFeedbackTranscriptTurn } from '../../common/voiceClient/voiceClientService.js';
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

	private readonly _pendingToolConfirmations = observableValue<readonly IPendingToolConfirmation[]>(this, []);
	readonly pendingToolConfirmations: IObservable<readonly IPendingToolConfirmation[]> = this._pendingToolConfirmations;

	private readonly _targetSession = observableValue<URI | undefined>(this, undefined);
	readonly targetSession: IObservable<URI | undefined> = this._targetSession;

	// --- Internal state ---
	private _pttHeld = false;
	private _pttToggleMode = false;
	/** When true, the auto-listen loop is suppressed (user pressed Stop
	 *  Recording). Cleared on the next explicit `pttDown` or on connect. */
	private _autoListenSuppressed = false;
	/** Armed on a fresh connect (hands-free); consumed on `session_init` to
	 *  enter listening once the backend acks the session. */
	private _enterListenOnSessionInit = false;
	private _pttCurrentTurnId = '';
	private _window: (Window & typeof globalThis) | undefined;
	private readonly _voiceEventDisposables = this._register(new DisposableStore());
	private readonly _voiceAutorunDisposable = this._register(new MutableDisposable());
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

	/** True while streaming mic audio to the backend during playback (barge-in). */
	private _bargeInMonitorActive = false;

	// --- Audio FIFO queue ---
	private readonly _audioQueue: { sessionId: string | undefined; chunks: { audio: string; isFirstChunk: boolean; isFinal: boolean; transcript: string | undefined }[] }[] = [];
	private _currentPlaybackSessionId: string | undefined | null = null; // null = nothing playing
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
	/** Session resource string currently focused/visible in the chat pane. */
	private _focusedSessionId: string | undefined;
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
	/** Buffered audio for responses that arrived while their session was not
	 *  focused. Flushed to playback when the session becomes focused. */
	private readonly _deferredResponses = new Map<string, { audio: string; isFirstChunk: boolean; isFinal: boolean; transcript: string | undefined }[]>();
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
	/**
	 * Key (session resource string, or ``''`` for untagged audio) of the response
	 * we are currently playing live rather than deferring. Recorded on the first
	 * chunk so the remaining chunks of that response follow the same decision and
	 * a response is never split between playback and the deferred buffer.
	 * ``undefined`` when no response is playing live.
	 */
	private _liveReplyKey: string | undefined;

	/**
	 * Per-session record of the reply we most recently read for a session (played
	 * live or flushed from the deferred buffer): its transcript and when it was
	 * read. The backend re-emits a session's reply when that session becomes
	 * active (on focus), which would double-read it. We drop a subsequent reply
	 * for the same session ONLY when its transcript matches this one within
	 * `RENARRATION_DEDUPE_WINDOW_MS` - so a genuinely new reply (different text)
	 * always plays, and so does a later identical reply once the window lapses. */
	private readonly _recentlyReadResponse = new Map<string, { transcript: string; at: number }>();
	/** Sessions whose in-flight backend re-narration we are dropping (multi-chunk
	 *  safety so continuation chunks are dropped too, not just the first). */
	private readonly _droppingRenarration = new Set<string>();
	private static readonly RENARRATION_DEDUPE_WINDOW_MS = 6000;

	/**
	 * Last reply transcript heard per session (persistent, unlike the windowed
	 * `_recentlyReadResponse`). On activation it arms `_recentlyReadResponse` so a
	 * backend re-read of a reply we heard earlier is dropped as a re-narration.
	 */
	private readonly _lastHeardTranscriptById = new Map<string, string>();

	/**
	 * One-shot override: report sessions as `thinking` so `is_active` ships before
	 * `waiting_for_confirmation`, which the backend only narrates in a later delta.
	 */
	private readonly _forceThinkingOnce = new Set<string>();

	// --- Session audio cache for replay ---
	private readonly _sessionAudioCache = new Map<string, Float32Array>();
	private _replaySourceNode: AudioBufferSourceNode | undefined;

	// --- Session state tracking for explicit change notifications ---
	private readonly _prevSessionStates = new Map<string, { state: string; detail: string }>();

	// Sessions the user explicitly cancelled from VS Code UI. We swallow the
	// NEXT state change for each (typically the chat model going `idle`) so the
	// backend doesn't narrate "the session became idle" right after the user
	// already hit Stop. Stored with a safety expiry in case the cancellation
	// never produces a state change.
	private readonly _userCancelledSessions = new Map<string, ReturnType<typeof setTimeout>>();
	private static readonly _USER_CANCEL_SUPPRESS_MS = 10_000;

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
	private readonly _pendingStateChanges = new Map<string, { sessionId: string; currentState: string; label: string; detail?: string; lastResponseSummary?: string; fromState: string; fromDetail: string }>();
	private _stateChangeEmitTimer: ReturnType<typeof setTimeout> | undefined;
	private static readonly _STATE_CHANGE_SETTLE_MS = 120;

	/**
	 * Pending confirmation phase 2 (see `_activateShownSession`): send
	 * `agent_state` after `is_active` has settled so it narrates.
	 *
	 * Keyed per session so activating one confirmation session never cancels
	 * another's pending phase-2 (which would leave it stuck reporting `thinking`
	 * and only narrate on a second focus).
	 */
	private readonly _confirmationActivateTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private static readonly _CONFIRMATION_ACTIVATE_DELAY_MS = 250;

	/**
	 * The focused session whose confirmation transition we just shipped and
	 * expect the backend to narrate. If a tagged narration for a DIFFERENT
	 * session arrives before this one's own audio, the backend preempted this
	 * confirmation (it narrates one thing at a time and the session's state does
	 * not transition again, so it would be lost forever). We re-assert it once.
	 * Cleared when this session's own audio arrives, or when it stops being the
	 * active/awaiting-confirmation session.
	 */
	private _confirmationNarrationPending: { sessionId: string; at: number; reasserted: boolean } | undefined;
	private static readonly _CONFIRMATION_REASSERT_WINDOW_MS = 12000;

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

		this._window = window;
		this._onFocusedSessionChanged();
		this._isConnecting.set(true, undefined);
		this._statusText.set('Connecting...', undefined);
		this._voiceState.set('idle', undefined);
		this._telemetryConnectStartMs = Date.now();

		// Resolve the GitHub login used as the transcript partition key.
		// Voice Code is tightly coupled to GitHub auth via Copilot — one session
		// is expected to exist. If not, we skip persistence rather than fail.
		let authToken: string | undefined;
		try {
			const sessions = await this.authenticationService.getSessions('github');
			this._userLogin = sessions[0]?.account.label;
			authToken = sessions[0]?.accessToken;
			if (!this._userLogin) {
				this.logService.warn('[voice] no GitHub session found; transcripts will not be persisted');
			} else {
				// Pick up the most recent prior turn id so the new chain
				// continues off the existing one (cosmetic — we only ever
				// chain locally).
				const lastTurn = (await this.voiceTranscriptStore.loadTurns(this._userLogin, { limit: 1 }))[0];
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
					this._pendingPriorTimeline = this._buildPriorTimeline(recent);
				} catch (err) {
					this.logService.warn('[voice] failed to load prior timeline entries for context', err);
					this._pendingPriorTimeline = [];
				}
			}
		} catch (err) {
			this.logService.warn('[voice] failed to resolve GitHub session', err);
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
		// Barge-in: stream mic audio to the backend during assistant playback.
		this._voiceEventDisposables.add(this.micCaptureService.onMonitorAudioChunk(b64 => {
			this.voiceClientService.sendBargeInAudioChunk(b64);
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
			// Telemetry: TTS listen-through rate
			const listenedToEnd = !this._telemetryTtsInterrupted;
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

			// Check if there's more in the queue
			if (this._audioQueue.length > 0) {
				setTimeout(() => this._processQueue(), 500);
			} else {
				this._stopBargeInMonitor();
				if (this._pttHeld) {
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
						this._prevSessionStates.set(s.resource.toString(), { state: currentState, detail: info?.detail ?? '' });
					}
				}
				// Also seed regular chat sessions so the autorun doesn't trigger false transitions
				for (const chatModel of this.chatService.chatModels.get()) {
					const key = chatModel.sessionResource.toString();
					if (seededResources.has(key)) { continue; }
					if (chatModel.getRequests().length === 0) { continue; }
					const info = this._getAgentStateInfo(chatModel);
					if (info.state !== 'unknown') {
						this._prevSessionStates.set(key, { state: info.state, detail: info.detail ?? '' });
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
					const stateChanges: { sessionId: string; currentState: string; label: string; detail?: string; lastResponseSummary?: string; fromState: string; fromDetail: string }[] = [];
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
						const isStateTransition = prev !== undefined && prev.state !== currentState && currentState !== 'unknown';
						const isDetailTransition = !isStateTransition && prev !== undefined && currentState === 'waiting_for_confirmation' && (detail ?? '') !== prev.detail;
						const isTransition = isStateTransition || isDetailTransition;
						if (isTransition) {
							this.logService.trace(`[voice] autorun transition id=${sessionId.slice(-32)} ${prev?.state}→${currentState} detailChanged=${isDetailTransition} hasDetail=${!!detail}`);
							const cancelExpiry = this._userCancelledSessions.get(sessionId);
							if (cancelExpiry) {
								this.logService.trace(`[voice] autorun swallowing transition (user-cancelled) id=${sessionId.slice(-32)}`);
								clearTimeout(cancelExpiry);
								this._userCancelledSessions.delete(sessionId);
							} else {
								stateChanges.push({ sessionId, currentState, label, detail, lastResponseSummary, fromState: prev?.state ?? currentState, fromDetail: prev?.detail ?? '' });
							}
						}
						if (currentState !== 'unknown') {
							this._prevSessionStates.set(sessionId, { state: currentState, detail: detail ?? '' });
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
								if (!this._userCancelledSessions.has(sessionId)) {
									stateChanges.push({ sessionId, currentState, label: s.label || 'Untitled session', lastResponseSummary: cachedSummary, fromState: prev?.state ?? currentState, fromDetail: prev?.detail ?? '' });
								}
								this._prevSessionStates.set(sessionId, { state: currentState, detail: '' });
								continue;
							}

							if (isStateTransition) {
								const cancelExpiry = this._userCancelledSessions.get(sessionId);
								if (cancelExpiry) {
									clearTimeout(cancelExpiry);
									this._userCancelledSessions.delete(sessionId);
								} else {
									stateChanges.push({ sessionId, currentState, label: s.label || 'Untitled session', fromState: prev?.state ?? currentState, fromDetail: prev?.detail ?? '' });
								}
							}
							if (currentState !== 'unknown') {
								this._prevSessionStates.set(sessionId, { state: currentState, detail: '' });
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
					// The session_context delta is the sole narration trigger
					// on the BE side. Its handler detects per-session
					// ``agent_state`` transitions and fires ``_proactive_status_update``
					// using the accumulated ``agent_state_detail`` /
					// ``last_response_summary``. Sending ``session_state_change``
					// in addition causes the BE to chain a SECOND narration after
					// the first (see ``_chain_proactive``), which manifested as
					// duplicate / mid-stream-replaced narrations.
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
								? { ...change, fromState: existing.fromState, fromDetail: existing.fromDetail }
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
			this.logService.trace(`[voice] session_init received; armListen=${this._enterListenOnSessionInit}`);
			if (this._enterListenOnSessionInit) {
				this._enterListenOnSessionInit = false;
				this._enterAutoListen();
			}
		}));

		this._voiceEventDisposables.add(this.voiceClientService.onBargeIn(() => {
			this._interruptAssistantPlayback();
		}));

		// Speech started → stop TTS, suppress late chunks from the previous turn
		// (same flow as pttDown, but for server-VAD path).
		this._voiceEventDisposables.add(this.voiceClientService.onSpeechStarted(() => {
			const wasMonitoring = this._bargeInMonitorActive;
			this._clearAutoListenTimer();
			if (wasMonitoring && !this._pttHeld) {
				// Promote the monitor into a real turn (mic stays warm via pttDown).
				this.pttDown();
				this.pttUp();
				// Clear the playback AEC suppression so the turn start isn't gated.
				this.micCaptureService.suppressUntil(0);
			} else {
				this.ttsPlaybackService.stopPlayback();
				this._audioQueue.length = 0;
				this._currentPlaybackSessionId = null;
				this._isProcessingQueue = false;
				this._suppressIncomingAudio = true;
				this._stopBargeInMonitor();
				this._startUserTurn();
			}
		}));

		// Backend ended the held turn itself (server VAD silence / stop phrase).
		// Treat it like a local ptt_end — stop capture, move to processing — but
		// do NOT send our own ptt_end. Guard against double-ending: ignore if we
		// already released locally, or if the id is for a different turn.
		this._voiceEventDisposables.add(this.voiceClientService.onTurnAutoEnded(e => {
			if (!this._pttHeld) { return; }
			if (e.turnId && e.turnId !== this._pttCurrentTurnId) { return; }
			this._pttToggleMode = false;
			this._finishPtt('auto');
		}));

		// Transcription — mutate the current user turn at the tail of the buffer.
		// We DO NOT send the transcript to chat here. The backend voice LLM
		// decides whether the utterance is a task for the coding agent (→ emits
		// a `send_to_chat` tool call, dispatched below) or chit-chat / status
		// (→ replies in speech, nothing sent to chat). Sending directly on
		// transcription would bypass that routing decision and leak chit-chat
		// utterances into the active chat session.
		this._voiceEventDisposables.add(this.voiceClientService.onTranscription(e => {
			// Track time-to-first-transcription for latency telemetry
			if (!this._telemetryFirstTranscriptionMs && this._telemetryPttDownMs) {
				this._telemetryFirstTranscriptionMs = Date.now();
			}

			const text = e.text;

			this._updateUserTurn(text, e.committed ?? '', e.status === 'partial');
			if (e.status !== 'partial') {
				if (!this._pttHeld) {
					this._voiceState.set('processing', undefined);
					this._statusText.set('Processing...', undefined);
				}
				// Persist the user's final transcript (local-only, no backend coordination).
				this._persistTurn('user', text);
			}
		}));

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
			// Confirmation preemption recovery: the backend narrates one thing at
			// a time. If we just shipped a focused session's confirmation and a
			// TAGGED narration for a DIFFERENT session arrives first, the backend
			// preempted the confirmation and — because the session's state does not
			// transition again — it would be lost forever. Detect that here and
			// re-assert the confirmation once (see _confirmationNarrationPending).
			//
			// TODO: interim client mitigation. The real fix is backend-side: it
			// should serialize/queue proactive narrations (or re-narrate a
			// still-pending confirmation on the next session_context) instead of
			// dropping one when another is in flight. Remove once that lands.
			if (e.isFirstChunk) {
				this._reconcileConfirmationNarration(codingSessionId);
			}
			// If this response is for a session the user isn't currently looking
			// at, don't play it now: buffer it until that session is focused and
			// notify with a short audio cue instead.
			const defer = this._shouldDeferResponse(codingSessionId, e.isFirstChunk);
			if (e.isFirstChunk || e.isFinal) {
				this.logService.trace(`[voice] audio_response codingSessionId=${codingSessionId ?? '<none>'} focused=${this._focusedSessionId ?? '<none>'} isFirstChunk=${e.isFirstChunk} isFinal=${e.isFinal} suppress=${this._suppressIncomingAudio} defer=${defer}`);
			}
			if (defer) {
				this._deferResponse(codingSessionId!, e.audio, e.isFirstChunk, e.isFinal, e.transcript);
			} else if (this._isRenarration(codingSessionId, e.transcript, e.isFirstChunk, e.isFinal)) {
				// Backend re-narrated a reply we already read for this session
				// (matched by content). Drop it so the user never hears it twice.
				this.logService.trace(`[voice] dropping re-narration for session=${codingSessionId} isFirstChunk=${e.isFirstChunk} isFinal=${e.isFinal}`);
			} else {
				// A fresh reply that plays live supersedes any older buffered
				// response for the same session; drop the stale buffer and its
				// pending indicator so we don't leave a phantom indicator behind.
				if (e.isFirstChunk && codingSessionId && this._deferredResponses.has(codingSessionId)) {
					this._deferredResponses.delete(codingSessionId);
					this._markPendingResponse(codingSessionId, false);
				}
				this._enqueueAudio(codingSessionId, e.audio, e.isFirstChunk, e.isFinal, e.transcript);
				if (e.isFinal) {
					this._liveReplyKey = undefined;
					// Record this heard reply so an immediate backend re-narration
					// of it (on activation) is dropped as a re-read, and so later
					// on-focus re-reads of it are deduped by content. Untagged
					// audio that plays live still belongs to the active session, so
					// attribute it there; otherwise a later TAGGED re-narration of
					// the same reply would not match and be read a second time.
					const heardSessionId = codingSessionId ?? this._getActiveSessionId();
					if (heardSessionId && e.transcript) {
						const heard = this._normalizeTranscript(e.transcript);
						if (heard) {
							this._lastHeardTranscriptById.set(heardSessionId, heard);
							this._recentlyReadResponse.set(heardSessionId, { transcript: heard, at: Date.now() });
						}
					}
				}
			}
			// On the final chunk we have the complete assistant transcript to persist.
			if (e.isFinal && e.transcript) {
				this._persistTurn('assistant', e.transcript);
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

		await this.voiceClientService.connect(window, authToken);

		// Timeout: if still connecting after 10s, give up
		const connectTimeout = setTimeout(() => {
			if (this._isConnecting.get() && !this._isConnected.get()) {
				this.disconnect();
			}
		}, 10000);
		this._voiceEventDisposables.add({ dispose: () => clearTimeout(connectTimeout) });
	}

	disconnect(): void {
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
		this._voiceAutorunDisposable.clear();
		this._voiceEventDisposables.clear();
		this.ttsPlaybackService.closeContext();
		this.micCaptureService.stopCapture();
		this.voiceClientService.disconnect();
		this._pttHeld = false;
		this._pttToggleMode = false;
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
		this._bargeInMonitorActive = false;
		this._audioQueue.length = 0;
		this._currentPlaybackSessionId = null;
		this._isProcessingQueue = false;
		this._suppressIncomingAudio = false;
		this._clearDeferredResponses();
		this._uiResourceByBackendId.clear();
		this._liveReplyKey = undefined;
		this._lastShownSessionId = undefined;
		this._recentlyReadResponse.clear();
		this._droppingRenarration.clear();
		this._lastHeardTranscriptById.clear();
		this._forceThinkingOnce.clear();
		this._awaitingReplyForSession = undefined;
		for (const t of this._confirmationActivateTimers.values()) { clearTimeout(t); }
		this._confirmationActivateTimers.clear();
		this._prevSessionStates.clear();
		for (const t of this._userCancelledSessions.values()) { clearTimeout(t); }
		this._userCancelledSessions.clear();
		for (const t of this._confirmationFlushWatchdogs.values()) { clearTimeout(t); }
		this._confirmationFlushWatchdogs.clear();
		if (this._stateChangeEmitTimer) { clearTimeout(this._stateChangeEmitTimer); this._stateChangeEmitTimer = undefined; }
		this._pendingStateChanges.clear();
		this._confirmationNarrationPending = undefined;
		for (const ref of this._eagerModelRefs.values()) { ref.dispose(); }
		this._eagerModelRefs.clear();
		this._eagerModelLoading.clear();
		this._pendingIdleNarration.clear();
		this._lastResponseSummaryById.clear();
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

	private _onConnectionLost(): void {
		this.logService.warn('[voice] connection lost, preserving state for reconnect');
		// Don't stop the mic here — keep the MediaStream alive across the
		// transient disconnect so the OS mic-in-use indicator doesn't blink
		// and so reconnection feels seamless. The mic is cycled (stop+start)
		// when the WS comes back, or fully stopped on terminal `disconnect()`.
		this.ttsPlaybackService.closeContext();
		this._pttHeld = false;
		this._pttToggleMode = false;
		this._isConnected.set(false, undefined);
		this._isReconnecting.set(true, undefined);
		this._voiceState.set('idle', undefined);
		this._statusText.set('Reconnecting...', undefined);
	}

	pttDown(): void {
		if (!this._isConnected.get()) { this.logService.trace('[voice] pttDown ignored: not connected'); return; }

		// Toggle mode: second tap finishes recording
		if (this._pttToggleMode) {
			this.logService.trace('[voice] pttDown: toggle-mode second tap -> finishing turn');
			this._pttToggleMode = false;
			this._finishPtt();
			return;
		}

		if (this._pttHeld) { this.logService.trace('[voice] pttDown ignored: already held'); return; }
		this._pttHeld = true;
		this._autoListenSuppressed = false;
		this._clearAutoListenTimer();
		this._pttCurrentTurnId = generateUuid();
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
		this._isProcessingQueue = false;
		this._suppressIncomingAudio = true;

		this.micCaptureService.isMuted = false;
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
		// Stop the monitor after mic pttDown so its _pttStreaming flag is set
		// first, letting stopMonitor keep the mic warm instead of re-acquiring.
		this._stopBargeInMonitor();
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
		this._stopBargeInMonitor();
		if (this._pttHeld) {
			this._finishPtt('local');
		} else {
			this._voiceState.set('idle', undefined);
			this._statusText.set('Tap to start', undefined);
		}
	}

	/**
	 * Finish the current push-to-talk press.
	 *
	 * ``reason`` is ``'local'`` for a user-driven end (button release / toggle
	 * tap / keyword) — the mic drains its tail and the ``onPttEnd`` → ``ptt_end``
	 * path fires. It is ``'auto'`` when the backend ended the turn itself
	 * (``turn_auto_ended``): the mic is aborted with no drain and NO ``ptt_end``
	 * is sent for the turn.
	 */
	private _finishPtt(reason: 'local' | 'auto' = 'local'): void {
		// End toggle (hands-free) mode on every turn-ending path — even when not held — so an out-of-band finish can't leave a stale toggle that self-kills the next auto-listen.
		this._pttToggleMode = false;
		if (!this._pttHeld) { return; }
		this._clearAutoListenTimer();
		this._pttHeld = false;
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
		if (reason === 'auto') {
			// Backend already ended the turn — stop capturing without draining
			// more audio and without emitting our own ptt_end.
			this.micCaptureService.abortPtt();
		} else {
			this.micCaptureService.pttUp();
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
	 * Start barge-in monitoring: stream mic audio to the backend during
	 * playback so the user can talk over the assistant. Hands-free only;
	 * the backend emits `speech_started`, which `onSpeechStarted` promotes
	 * into a real turn. Inert until the backend consumes `barge_in_*`.
	 */
	private _startBargeInMonitor(): void {
		if (this._bargeInMonitorActive || !this._isConnected.get() || this._pttHeld || !this._window) {
			return;
		}
		if (!this._isHandsFreeEnabled()) {
			return;
		}
		this._bargeInMonitorActive = true;
		this.voiceClientService.sendBargeInStart();
		this.micCaptureService.startMonitor(this._window).catch(err => {
			this.logService.warn('[voice] barge-in monitor failed to start', err);
			this._bargeInMonitorActive = false;
		});
	}

	/** Stop barge-in monitoring and tell the backend to stop listening for it. */
	private _stopBargeInMonitor(): void {
		if (!this._bargeInMonitorActive) {
			return;
		}
		this._bargeInMonitorActive = false;
		this.micCaptureService.stopMonitor();
		this.voiceClientService.sendBargeInStop();
	}

	/**
	 * Send transcription text to the target session or active chat.
	 * If a target session is selected, sends directly via chatService.
	 * Otherwise sends to whatever is currently active via the view pane command.
	 */
	private async _sendTranscriptionToChat(text: string): Promise<void> {
		const target = this._targetSession.get();
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
		this._prevSessionStates.set(sessionResource.toString(), { state: 'thinking', detail: '' });
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
				this._prevSessionStates.set(sessionResource.toString(), { state: 'idle', detail: '' });
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
		if (backend) {
			this._uiResourceByBackendId.set(backend.toString(), uiResource.toString());
		}
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
		this._focusedSessionId = focused;
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

	/**
	 * A session became visible in a chat widget (opened/revealed). Treat it like a
	 * focus change: mark it active, flush any buffered response, clear its pending
	 * indicator, and re-send context so the backend re-narrates a confirmation it
	 * had downgraded while the session was unfocused.
	 */
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

	/**
	 * Make a shown/focused session the active one: flush its buffered response,
	 * clear its pending indicator, and re-send context so the backend narrates a
	 * pending confirmation/response immediately.
	 *
	 * If the session awaits confirmation but its model isn't resident yet, we also
	 * kick off a load so the confirmation detail becomes available. We still send
	 * context immediately - `_buildSessionContext` holds a confirmation whose
	 * detail isn't ready as `thinking`, so the backend narrates exactly once (with
	 * the detail) rather than a detail-less "I don't see an approval" followed by
	 * the real one.
	 */
	private _activateShownSession(resource: URI): void {
		const key = resource.toString();
		this._lastShownSessionId = key;
		const hadDeferred = this._deferredResponses.has(key);
		this._flushDeferredResponse(key);
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
		// Split resident confirmations across deltas: flip `is_active` while
		// holding `thinking`, then send `waiting_for_confirmation` so it narrates.
		// Without this, focusing an unfocused session awaiting confirmation ships
		// the confirmation and `is_active` together and the backend narrates only
		// on the next activation — so it's read on the second focus, not the first.
		const model = this.chatService.getSession(resource);
		const activatedState = model ? this._getAgentStateInfo(model).state : 'no-model';
		const awaitingConfirmation = activatedState === 'waiting_for_confirmation';
		this.logService.trace(`[voice] _activateShownSession key=${key.slice(-32)} state=${activatedState} activeId=${this._getActiveSessionId()?.slice(-32) ?? '<none>'} hadDeferred=${hadDeferred} heardBefore=${this._lastHeardTranscriptById.has(key)} recentlyRead=${this._recentlyReadResponse.has(key)}`);
		if (awaitingConfirmation) {
			this._narrateConfirmationViaTwoPhase(key);
			return;
		}
		this._sendContext();
		this.voiceClientService.flushSessionContext();
	}

	/**
	 * Narrate a focused session's pending confirmation by splitting it across two
	 * deltas: flip `is_active` while holding the session as `thinking`, then send
	 * `waiting_for_confirmation` so the backend observes a fresh
	 * `thinking -> waiting_for_confirmation` transition and narrates it. Without
	 * the split, the confirmation and `is_active` ship together and the backend
	 * only narrates on the next activation (read on the second focus).
	 *
	 * Records {@link _confirmationNarrationPending} so a competing narration for
	 * another session (which preempts this one on the backend) can be detected
	 * and this confirmation re-asserted rather than lost. See onAudioResponse.
	 */
	private _narrateConfirmationViaTwoPhase(key: string, isReassert: boolean = false): void {
		// Phase 1: flip is_active while holding the session as `thinking`.
		this._forceThinkingOnce.add(key);
		this._sendContext();
		this.voiceClientService.flushSessionContext();
		// Phase 2: after `is_active` settles, send `waiting_for_confirmation`.
		// Timers are keyed per session so activating another confirmation
		// session can't cancel this one's phase-2 (which would strand it as
		// `thinking` and narrate only on a second focus).
		const existing = this._confirmationActivateTimers.get(key);
		if (existing) {
			clearTimeout(existing);
		}
		this._confirmationActivateTimers.set(key, setTimeout(() => {
			this._confirmationActivateTimers.delete(key);
			this._forceThinkingOnce.delete(key);
			// Only ship the transition if this session is still active.
			if (this._getActiveSessionId() === key) {
				this._sendContext();
				this.voiceClientService.flushSessionContext();
				// Expect this confirmation to narrate now; track it so a competing
				// narration that preempts it can trigger a single re-assert. If
				// this send is ITSELF the re-assert, mark it consumed so we never
				// loop re-asserting the same confirmation.
				this._confirmationNarrationPending = { sessionId: key, at: Date.now(), reasserted: isReassert };
			}
		}, VoiceSessionController._CONFIRMATION_ACTIVATE_DELAY_MS));
	}

	/**
	 * Reconcile a just-shipped confirmation narration against an incoming audio
	 * response, recovering the "focused a confirmation but it was never read"
	 * case caused by backend narration preemption.
	 *
	 * - Audio for the SAME session clears the pending marker: the confirmation
	 *   (or a following reply) for it narrated, nothing to recover.
	 * - A TAGGED narration for a DIFFERENT session while our confirmation session
	 *   is still the active, still-awaiting-confirmation one means the backend
	 *   narrated that instead and dropped ours. Re-assert the confirmation once
	 *   (fresh `thinking -> waiting_for_confirmation` transition) so it is read.
	 *
	 * The one-shot `reasserted` guard prevents an oscillation loop, and clearing
	 * on the session's own audio prevents a double-read when it did narrate.
	 */
	private _reconcileConfirmationNarration(codingSessionId: string | undefined): void {
		const pending = this._confirmationNarrationPending;
		if (!pending) {
			return;
		}
		// Our confirmation session's own narration arrived — it was read.
		if (codingSessionId === pending.sessionId) {
			this._confirmationNarrationPending = undefined;
			return;
		}
		// Only a tagged narration for another session is unambiguous evidence of
		// preemption; ignore untagged audio (can't attribute it).
		if (!codingSessionId) {
			return;
		}
		const expired = Date.now() - pending.at > VoiceSessionController._CONFIRMATION_REASSERT_WINDOW_MS;
		const stillActive = this._getActiveSessionId() === pending.sessionId;
		let stillAwaiting = false;
		if (stillActive) {
			const model = this.chatService.getSession(URI.parse(pending.sessionId));
			stillAwaiting = !!model && this._getAgentStateInfo(model).state === 'waiting_for_confirmation';
		}
		if (pending.reasserted || expired || !stillActive || !stillAwaiting) {
			// Give up: navigated away, resolved, already retried, or timed out.
			this._confirmationNarrationPending = undefined;
			return;
		}
		this.logService.trace(`[voice] confirmation for ${pending.sessionId.slice(-32)} preempted by narration for ${codingSessionId.slice(-32)}; re-asserting`);
		this._confirmationNarrationPending = undefined;
		this._narrateConfirmationViaTwoPhase(pending.sessionId, /* isReassert */ true);
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

	setActiveSessionShown(resource: URI | undefined): void {
		this._externalActiveSessionMode = true;
		const key = resource?.toString();
		if (key === this._activeSessionShown) {
			return;
		}
		this.logService.trace(`[voice] setActiveSessionShown=${key ?? '<none>'} (was ${this._activeSessionShown ?? '<none>'})`);
		this._activeSessionShown = key;
		if (resource) {
			// Route audio here now: flush buffers, clear pending, and re-send context.
			this._activateShownSession(resource);
		} else {
			this._sendContext();
			this.voiceClientService.flushSessionContext();
		}
	}

	/**
	 * A response is deferred when it is a background narration for a session the
	 * user is NOT actively working with. It plays immediately when it is for the
	 * active session (targeted or focused) or when it is untagged audio we can't
	 * attribute to any session (chit-chat, greetings, direct answers).
	 *
	 * The decision is made on the first chunk and recorded in `_liveReplyKey`;
	 * remaining chunks follow the same decision so a response is never split
	 * between playback and the deferred buffer.
	 */
	private _shouldDeferResponse(sessionId: string | undefined, isFirstChunk: boolean): boolean {
		const key = sessionId ?? '';
		if (isFirstChunk) {
			// Untagged audio can't be attributed to a session — always play it.
			if (!sessionId) {
				this._liveReplyKey = key;
				return false;
			}
			// Play immediately for the session the user is actively working with;
			// defer any other session's narration until the user looks at it.
			// Read live so a stale cache can't misroute the decision (e.g. when
			// the focus event was missed while voice was busy).
			this._focusedSessionId = this._getFocusedSessionId();
			if (this._getActiveSessionId() === sessionId) {
				this._liveReplyKey = key;
				return false;
			}
			this._liveReplyKey = undefined;
			return true;
		}

		// Continuation chunk: stay consistent with how this response started.
		if (this._deferredResponses.has(key)) {
			return true;
		}
		if (this._liveReplyKey === key) {
			return false;
		}
		// Continuation whose first chunk we never observed: fall back to active.
		if (!sessionId) {
			return false;
		}
		this._focusedSessionId = this._getFocusedSessionId();
		return this._getActiveSessionId() !== sessionId;
	}

	private _deferResponse(sessionId: string, audio: string, isFirstChunk: boolean, isFinal: boolean, transcript: string | undefined): void {
		let buffer = this._deferredResponses.get(sessionId);
		if (isFirstChunk || !buffer) {
			// A new response for this session - start a fresh buffer (dropping any
			// older un-played response) and flag the sessions list so the pending
			// indicator shows for the unfocused session.
			buffer = [];
			this._deferredResponses.set(sessionId, buffer);
			this._markPendingResponse(sessionId, true);
			this.logService.trace(`[voice] deferring response for unfocused session=${sessionId}; showing pending indicator`);
		}
		buffer.push({ audio, isFirstChunk, isFinal, transcript });
	}

	/** Play the buffered response for a session that just became focused. */
	private _flushDeferredResponse(sessionId: string): void {
		// Match the buffered key robustly: try the exact string first, then fall
		// back to URI equality so a trivial serialization difference between the
		// backend's coding_session_id and the focused widget's sessionResource
		// can't strand the response (which would leave it stuck as idle with a
		// pending indicator and no playback).
		let key: string | undefined = this._deferredResponses.has(sessionId) ? sessionId : undefined;
		if (!key && this._deferredResponses.size > 0) {
			let focusedUri: URI | undefined;
			try { focusedUri = URI.parse(sessionId); } catch { focusedUri = undefined; }
			if (focusedUri) {
				for (const candidate of this._deferredResponses.keys()) {
					try {
						if (isEqual(URI.parse(candidate), focusedUri)) { key = candidate; break; }
					} catch { /* ignore unparseable keys */ }
				}
			}
		}
		if (!key) {
			if (this._deferredResponses.size > 0) {
				this.logService.trace(`[voice] no buffered response matches focused=${sessionId}; pending keys=[${[...this._deferredResponses.keys()].join(', ')}]`);
			}
			return;
		}

		const buffer = this._deferredResponses.get(key);
		this._deferredResponses.delete(key);
		this._markPendingResponse(key, false);
		if (!buffer || buffer.length === 0) {
			return;
		}
		this.logService.trace(`[voice] flushing ${buffer.length} buffered chunk(s) for now-focused session=${key}`);
		// Record that we just replayed a buffered reply for this session, along
		// with its transcript, so a backend re-narration (same text) arriving
		// shortly after is dropped rather than double-read. A genuinely new reply
		// (different text) is never suppressed. See _recentlyReadResponse.
		const flushedTranscript = this._normalizeTranscript(
			buffer.map(c => c.transcript ?? '').join(' ')
		);
		if (flushedTranscript) {
			this._recentlyReadResponse.set(key, { transcript: flushedTranscript, at: Date.now() });
			this._lastHeardTranscriptById.set(key, flushedTranscript);
		}

		// Exit any active listening / auto-listen so playback can take over.
		// If we don't, the controller can sit in listening and the buffered
		// audio is suppressed instead of played (leaving the user stuck).
		this._clearAutoListenTimer();
		this._autoListenSuppressed = false;
		if (this._pttHeld) {
			this._finishPtt('auto');
		}
		this._pttToggleMode = false;
		this._pttHeld = false;
		this._suppressIncomingAudio = false;

		// Force-reset the playback slot when nothing is actually playing so
		// `_enqueueAudio` can claim it and drive the state machine to 'speaking'.
		// (`undefined` from a prior generic response is NOT `null`, so an
		// explicit reset is required - otherwise the fast-path is skipped and
		// the queue never processes.)
		if (!this.ttsPlaybackService.isPlaying) {
			this._audioQueue.length = 0;
			this._currentPlaybackSessionId = null;
			this._isProcessingQueue = false;
		}

		for (const chunk of buffer) {
			this._enqueueAudio(key, chunk.audio, chunk.isFirstChunk, chunk.isFinal, chunk.transcript);
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
	private _isRenarration(sessionId: string | undefined, transcript: string | undefined, isFirstChunk: boolean, isFinal: boolean): boolean {
		if (!sessionId) {
			return false;
		}
		// Continuation of a re-narration we're already dropping.
		if (!isFirstChunk && this._droppingRenarration.has(sessionId)) {
			if (isFinal) {
				this._droppingRenarration.delete(sessionId);
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
		if (this._liveReplyKey === sessionId) {
			this._liveReplyKey = undefined;
		}
		if (!isFinal) {
			this._droppingRenarration.add(sessionId);
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
		// Show the indicator for every non-active waiting session.
		for (const sessionId of waitingSessionIds) {
			if (sessionId === activeId) {
				continue;
			}
			if (!this._confirmationPendingSessions.has(sessionId)) {
				this._confirmationPendingSessions.add(sessionId);
				this._markPendingResponse(sessionId, true);
			}
		}
		// Clear it for sessions that are now active or no longer waiting.
		for (const sessionId of [...this._confirmationPendingSessions]) {
			if (waitingSessionIds.has(sessionId) && sessionId !== activeId) {
				continue;
			}
			this._clearConfirmationIndicator(sessionId);
		}
	}

	private _clearConfirmationIndicator(sessionId: string): void {
		if (!this._confirmationPendingSessions.delete(sessionId)) {
			return;
		}
		// Don't clear the visible indicator if there is still buffered audio
		// waiting to be played for this session - that indicator is owned by the
		// deferred-response flush path.
		if (!this._deferredResponses.has(sessionId)) {
			this._markPendingResponse(sessionId, false);
		}
	}

	private _clearDeferredResponses(): void {
		for (const sessionId of this._deferredResponses.keys()) {
			this._markPendingResponse(sessionId, false);
		}
		this._deferredResponses.clear();
		for (const sessionId of this._confirmationPendingSessions) {
			this._markPendingResponse(sessionId, false);
		}
		this._confirmationPendingSessions.clear();
	}

	// --- Audio FIFO queue ---

	private _interruptAssistantPlayback(): void {
		this._telemetryTtsInterrupted = this._telemetryTtsInterrupted || this.ttsPlaybackService.isPlaying;
		this._audioQueue.length = 0;
		this._currentPlaybackSessionId = null;
		this._isProcessingQueue = false;
		this._suppressIncomingAudio = true;
		this.ttsPlaybackService.stopPlayback();
		this.voicePlaybackService.notifyPlaybackEnd(undefined);
	}

	private _enqueueAudio(sessionId: string | undefined, audio: string, isFirstChunk: boolean, isFinal: boolean, transcript: string | undefined): void {
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
		if ((nothingPlaying && this._audioQueue.length === 0) || sameSession) {
			this._playChunk(sessionId, audio, isFirstChunk, isFinal, transcript);
			return;
		}

		// Check if there's already a queued entry for this session
		let entry = this._audioQueue.find(e =>
			e.sessionId === sessionId || (e.sessionId === undefined && sessionId === undefined)
		);
		if (!entry) {
			entry = { sessionId, chunks: [] };
			this._audioQueue.push(entry);
		}
		entry.chunks.push({ audio, isFirstChunk, isFinal, transcript });

		// If nothing is currently playing, start processing
		if (this._currentPlaybackSessionId === null && !this._isProcessingQueue) {
			this._processQueue();
		}
	}

	private _playChunk(sessionId: string | undefined, audio: string, isFirstChunk: boolean, isFinal: boolean, transcript: string | undefined): void {
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
			this._clearAutoListenTimer();
			this._replyPlayedSinceSend = true;
			this.micCaptureService.suppressUntil(Date.now() + 800);
			this._voiceState.set('speaking', undefined);
			this._statusText.set('Speaking...', undefined);
			// Hands-free: keep the mic open so the user can barge in.
			this._startBargeInMonitor();
			this.ttsPlaybackService.playAudioChunk(audio, isFinal, this._window!);
		} else if (!speakResponsesEnabled) {
			this._replyPlayedSinceSend = true;
			if (isFinal) {
				this._currentPlaybackSessionId = null;
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
				this._playChunk(next.sessionId, chunk.audio, chunk.isFirstChunk, chunk.isFinal, chunk.transcript);
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
			const stateChanged = change.fromState !== change.currentState;
			const detailOnly = !stateChanged && change.currentState === 'waiting_for_confirmation' && change.fromDetail !== detail;
			if (stateChanged || detailOnly) {
				netChanges.push({ change, detailOnly });
			}
		}
		if (netChanges.length === 0) {
			// The storm settled back to the baseline; still send a fresh context
			// (idempotent — _sendDelta emits nothing) but trace/persist nothing.
			this._sendContext();
			return;
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
		// never stays stuck as a pending indicator with no playback. Use the
		// active session (last-shown / focused) rather than only the raw focused
		// widget, which can lag when a session is opened without taking DOM focus.
		// The flush itself matches the buffered key robustly (exact + URI equality).
		if (this._deferredResponses.size > 0) {
			const active = this._getActiveSessionId();
			if (active) {
				this._flushDeferredResponse(active);
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

			if (isStateChange || isDetailChange) {
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
				this._prevSessionStates.set(sessionId, { state: currentState, detail: detail ?? '' });
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
			if (isStateChange || isDetailChange) {
				if (isDetailChange) {
					this.voiceClientService.invalidateSessionCache(key);
				}
				stateChanges.push({ sessionId: key, currentState, label: chatModel.title || 'Chat', detail, lastResponseSummary });
			}
			if (currentState !== 'unknown') {
				this._prevSessionStates.set(key, { state: currentState, detail: detail ?? '' });
			}
			if (currentState === 'waiting_for_confirmation') {
				waitingSessionIds.add(key);
			}
		}

		// Keep the sessions-list pending indicator in sync for confirmations that
		// arrive on sessions detected here (e.g. remote/unloaded sessions surfaced
		// via onDidChangeSessions or the periodic poll rather than the autorun).
		this._reconcileConfirmationIndicators(waitingSessionIds);

		if (stateChanges.length > 0) {
			this.logService.trace(`[voice] onDidChangeSessions detected ${stateChanges.length} state change(s): ${stateChanges.map(c => `${c.label}: ${c.currentState}`).join(', ')}`);
			// The session_context delta is the sole narration trigger; see
			// the autorun above. We push fresh context + flush the debounce
			// so the BE picks up the transition (and its detail / summary)
			// without waiting up to 500 ms. We do NOT also send
			// ``session_state_change`` — that would cause the BE to chain a
			// second proactive narration after the first.
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
				// A confirmation whose model isn't resident has no detail yet.
				// Report `thinking` (hold) so the backend doesn't narrate a
				// detail-less confirmation ("I don't see an approval") now and the
				// real one moments later; the autorun re-narrates once with detail
				// after the model loads. Ensure that load is in flight.
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
			// A confirmation whose detail hasn't rendered yet is held as
			// `thinking` for the same reason as the no-model case above: narrate
			// exactly once, with the detail, rather than a detail-less one first.
			const detailPending = stateInfo.state === 'waiting_for_confirmation' && !stateInfo.detail;
			// One-shot: hold as `thinking` so `is_active` ships before the real state.
			const forceThinking = this._forceThinkingOnce.has(s.resource.toString());
			// Hold a summary-less idle while an eager reload is still replaying the
			// response, so we don't ship (and consume) the idle before the summary
			// is ready. See _effectiveResidentState.
			const heldState = this._effectiveResidentState(s.resource.toString(), stateInfo);
			const scoped = (detailPending || forceThinking)
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
			display_locale: this._window?.navigator.language,
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
