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
import { IChatService, IChatToolInvocation, ToolConfirmKind, IChatModelReference } from '../../common/chatService/chatService.js';
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
	private _awaitingReplyWatchdog: ReturnType<typeof setTimeout> | undefined;
	/** Tracks whether the initial listen cue has been played after connecting. */
	private _hasPlayedInitialListenCue = false;

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
	) {
		super();

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
		this._voiceEventDisposables.add(this.micCaptureService.onPttDiagnostic((diag: IPttDiagnostic) => {
			// Local log so the same correlation key surfaces in the
			// VS Code log files even if the WS is closed mid-flight.
			this.logService.info(
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
					const stateChanges: { sessionId: string; currentState: string; label: string; detail?: string; lastResponseSummary?: string; detailOnly?: boolean }[] = [];
					const waitingForConfirmationSessions: { sessionId: string; label: string; detail?: string; transition: boolean }[] = [];
					const processedResources = new Set<string>();

					// --- Helper: subscribe to a chat model's observables and detect state changes ---
					const processModel = (model: IChatModel, resource: URI, label: string) => {
						const sessionId = resource.toString();
						// The model is now resident so its idle transition will carry a
						// proper summary; drop any pending deferral/suppression.
						this._pendingIdleNarration.delete(sessionId);
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
						const currentState = info.state;
						const detail = info.detail;
						const lastResponseSummary = info.last_response_summary;

						const prev = this._prevSessionStates.get(sessionId);
						const isStateTransition = prev !== undefined && prev.state !== currentState && currentState !== 'unknown';
						const isDetailTransition = !isStateTransition && prev !== undefined && currentState === 'waiting_for_confirmation' && (detail ?? '') !== prev.detail;
						const isTransition = isStateTransition || isDetailTransition;
						if (isTransition) {
							this.logService.info(`[voice] autorun transition id=${sessionId.slice(-32)} ${prev?.state}→${currentState} detailChanged=${isDetailTransition} hasDetail=${!!detail}`);
							const cancelExpiry = this._userCancelledSessions.get(sessionId);
							if (cancelExpiry) {
								this.logService.info(`[voice] autorun swallowing transition (user-cancelled) id=${sessionId.slice(-32)}`);
								clearTimeout(cancelExpiry);
								this._userCancelledSessions.delete(sessionId);
							} else {
								stateChanges.push({ sessionId, currentState, label, detail, lastResponseSummary, detailOnly: isDetailTransition });
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
							if (s.status === AgentSessionStatus.NeedsInput) {
								this._ensureModelLoaded(s.resource);
							}

							const prev = this._prevSessionStates.get(sessionId);
							const isStateTransition = prev !== undefined && prev.state !== currentState && currentState !== 'unknown';

							// Remote/Copilot sessions don't keep their model resident, so a
							// coarse ``idle`` transition would carry no last_response_summary
							// and the backend would narrate an empty completion. Defer the
							// transition: eagerly load the model and let the autorun re-fire
							// with the summary once it resolves. Do not record the idle state
							// yet so the transition is still detected after the model loads.
							if (isStateTransition && currentState === 'idle') {
								this._deferIdleNarrationUntilModelLoaded(s.resource);
								continue;
							}

							if (isStateTransition) {
								const cancelExpiry = this._userCancelledSessions.get(sessionId);
								if (cancelExpiry) {
									clearTimeout(cancelExpiry);
									this._userCancelledSessions.delete(sessionId);
								} else {
									stateChanges.push({ sessionId, currentState, label: s.label || 'Untitled session' });
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
					// The session_context delta is the sole narration trigger
					// on the BE side. Its handler detects per-session
					// ``agent_state`` transitions and fires ``_proactive_status_update``
					// using the accumulated ``agent_state_detail`` /
					// ``last_response_summary``. Sending ``session_state_change``
					// in addition causes the BE to chain a SECOND narration after
					// the first (see ``_chain_proactive``), which manifested as
					// duplicate / mid-stream-replaced narrations.
					this._sendContext();
					if (stateChanges.length > 0) {
						// For detail-only transitions (same agent_state but
						// different confirmation content), invalidate the
						// cache so _sendDelta treats the session as new and
						// includes agent_state + agent_state_detail together.
						for (const change of stateChanges) {
							if (change.detailOnly) {
								this.voiceClientService.invalidateSessionCache(change.sessionId);
							}
						}
						// Re-send after cache invalidation so the delta
						// picks up the full session fields.
						if (stateChanges.some(c => c.detailOnly)) {
							this._sendContext();
						}
						this.logService.info(`[voice] autorun stateChanges=${stateChanges.length} flushing immediately: ${stateChanges.map(c => `${c.label}:${c.currentState}${c.detailOnly ? ' (detail-only)' : ''}`).join(', ')}`);
						// Flush the 500 ms debounce so the BE picks up the
						// transition (and the accompanying detail / summary)
						// promptly.
						this.voiceClientService.flushSessionContext();
					}
					for (const change of stateChanges) {
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
				this.logService.info(`[voice] connected: isResuming=${isResuming} handsFree=${this._isHandsFreeEnabled()} armListen=${this._enterListenOnSessionInit}`);
				if (this._enterListenOnSessionInit) {
					this._voiceEventDisposables.add(disposableTimeout(() => {
						if (this._enterListenOnSessionInit && this._isConnected.get()) {
							this.logService.info('[voice] session_init not seen within 750ms; entering listening via fallback');
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
			this.logService.info(`[voice] session_init received; armListen=${this._enterListenOnSessionInit}`);
			if (this._enterListenOnSessionInit) {
				this._enterListenOnSessionInit = false;
				this._enterAutoListen();
			}
		}));

		// Speech started → stop TTS, suppress late chunks from the previous turn
		// (same flow as pttDown, but for server-VAD path).
		this._voiceEventDisposables.add(this.voiceClientService.onSpeechStarted(() => {
			this._clearAutoListenTimer();
			this.ttsPlaybackService.stopPlayback();
			this._audioQueue.length = 0;
			this._currentPlaybackSessionId = null;
			this._isProcessingQueue = false;
			this._suppressIncomingAudio = true;
			this._startUserTurn();
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
			this._enqueueAudio(e.codingSessionId, e.audio, e.isFirstChunk, e.isFinal, e.transcript);
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
			const allowedTools = [
				'send_to_chat',
				'get_session_info', 'get_session_changes', 'get_session_thread',
				'approve_confirmation', 'reject_confirmation',
				'auto_approve_session', 'revoke_auto_approve',
				'focus_session',
			];
			if (e.name === 'send_to_chat') {
				const text = typeof e.args?.['text'] === 'string' ? (e.args['text'] as string) : '';
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
					this.voiceClientService.sendToolResult(e.callId, result);
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
		this._audioQueue.length = 0;
		this._currentPlaybackSessionId = null;
		this._isProcessingQueue = false;
		this._suppressIncomingAudio = false;
		this._prevSessionStates.clear();
		for (const t of this._userCancelledSessions.values()) { clearTimeout(t); }
		this._userCancelledSessions.clear();
		for (const t of this._confirmationFlushWatchdogs.values()) { clearTimeout(t); }
		this._confirmationFlushWatchdogs.clear();
		for (const ref of this._eagerModelRefs.values()) { ref.dispose(); }
		this._eagerModelRefs.clear();
		this._eagerModelLoading.clear();
		this._pendingIdleNarration.clear();
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
		if (!this._isConnected.get()) { this.logService.info('[voice] pttDown ignored: not connected'); return; }

		// Toggle mode: second tap finishes recording
		if (this._pttToggleMode) {
			this.logService.info('[voice] pttDown: toggle-mode second tap -> finishing turn');
			this._pttToggleMode = false;
			this._finishPtt();
			return;
		}

		if (this._pttHeld) { this.logService.info('[voice] pttDown ignored: already held'); return; }
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
		if (!this._pttHeld) { return; }
		this._clearAutoListenTimer();
		this._pttHeld = false;
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
		// Default-on: treat only an explicit `false` as disabled so an
		// unresolved/undefined value still enables hands-free (matches the
		// `handsFree` default and the window-service `!== false` check).
		return this.configurationService.getValue<boolean>('agents.voice.handsFree') !== false;
	}

	/** Re-enter listening via synthetic short tap. */
	private _enterAutoListen(): void {
		this._clearAutoListenTimer();
		if (this._autoListenSuppressed || !this._isConnected.get() || this._pttHeld) {
			this.logService.info(`[voice] _enterAutoListen skipped: suppressed=${this._autoListenSuppressed} connected=${this._isConnected.get()} pttHeld=${this._pttHeld}`);
			return;
		}
		// Don't enter listening if audio is still playing or queued.
		if (this.ttsPlaybackService.isPlaying || this._audioQueue.length > 0 || this._currentPlaybackSessionId !== null) {
			this.logService.info(`[voice] _enterAutoListen skipped: audio busy (playing=${this.ttsPlaybackService.isPlaying} queue=${this._audioQueue.length} pbSession=${this._currentPlaybackSessionId !== null})`);
			return;
		}
		this.logService.info('[voice] _enterAutoListen entering listening');
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
		this._clearAutoListenTimer();
		if (this._awaitingReplyWatchdog) {
			clearTimeout(this._awaitingReplyWatchdog);
		}
		this._awaitingReplyWatchdog = setTimeout(() => {
			this._awaitingReplyWatchdog = undefined;
			this._awaitingReplyAudio = false;
			// No reply came — re-enter listening if eligible.
			if (this._isHandsFreeEnabled() && !this._pttHeld) {
				this._enterAutoListen();
			}
		}, 30_000);
	}

	private _clearAwaitingReply(): void {
		this._awaitingReplyAudio = false;
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

	// --- Audio FIFO queue ---

	private _enqueueAudio(sessionId: string | undefined, audio: string, isFirstChunk: boolean, isFinal: boolean, transcript: string | undefined): void {
		// User interrupted (pttDown / onSpeechStarted): drop late chunks from the
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
		this._currentPlaybackSessionId = sessionId;

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

		const ttsEnabled = this.configurationService.getValue<boolean>('agents.voice.textToSpeech') !== false;
		if (ttsEnabled && audio) {
			this._clearAutoListenTimer();
			this._replyPlayedSinceSend = true;
			this.micCaptureService.suppressUntil(Date.now() + 800);
			this._voiceState.set('speaking', undefined);
			this._statusText.set('Speaking...', undefined);
			this.ttsPlaybackService.playAudioChunk(audio, isFinal, this._window!);
		} else if (!ttsEnabled) {
			this._replyPlayedSinceSend = true;
			if (isFinal) {
				this._currentPlaybackSessionId = null;
				this._processQueue();
				if (this._isHandsFreeEnabled()) {
					this._scheduleAutoListen();
				}
			}
		} else {
			this.ttsPlaybackService.playAudioChunk(audio, isFinal, this._window!);
		}
	}

	private _processQueue(): void {
		if (this._audioQueue.length === 0 || this._currentPlaybackSessionId !== null) {
			this._isProcessingQueue = false;
			return;
		}

		this._isProcessingQueue = true;
		const next = this._audioQueue.shift()!;

		for (const chunk of next.chunks) {
			this._playChunk(next.sessionId, chunk.audio, chunk.isFirstChunk, chunk.isFinal, chunk.transcript);
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
			this.logService.info(`[voice] arming confirmation flush watchdog id=${sessionId.slice(-32)} label="${label}"`);
		}
		const timer = setTimeout(() => {
			this._confirmationFlushWatchdogs.delete(sessionId);
			this.logService.info(`[voice] confirmation flush watchdog firing id=${sessionId.slice(-32)} label="${label}"`);
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
		const sessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
		const stateChanges: { sessionId: string; currentState: string; label: string; detail?: string; lastResponseSummary?: string }[] = [];
		const processedResources = new Set<string>();

		for (const s of sessions) {
			processedResources.add(s.resource.toString());
			const sessionId = s.resource.toString();
			const model = this.chatService.getSession(s.resource);
			let currentState: string;
			let detail: string | undefined;
			let lastResponseSummary: string | undefined;
			if (model) {
				const info = this._getAgentStateInfo(model);
				currentState = info.state;
				detail = info.detail;
				lastResponseSummary = info.last_response_summary;
				// Model is resident now; drop any pending idle deferral/suppression.
				this._pendingIdleNarration.delete(sessionId);
			} else {
				currentState = s.status === AgentSessionStatus.InProgress ? 'thinking'
					: s.status === AgentSessionStatus.NeedsInput ? 'waiting_for_confirmation'
						: s.status === AgentSessionStatus.Completed ? 'idle'
							: 'unknown';
				if (s.status === AgentSessionStatus.NeedsInput) {
					this._ensureModelLoaded(s.resource);
				}
			}

			const prev = this._prevSessionStates.get(sessionId);
			const isStateChange = prev !== undefined && prev.state !== currentState && currentState !== 'unknown';
			const isDetailChange = !isStateChange && prev !== undefined && currentState === 'waiting_for_confirmation' && (detail ?? '') !== prev.detail;

			// Defer summary-less idle transitions for remote/Copilot sessions until
			// their model loads (see _deferIdleNarrationUntilModelLoaded).
			if (!model && currentState === 'idle' && isStateChange) {
				this._deferIdleNarrationUntilModelLoaded(s.resource);
				continue;
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
		}

		if (stateChanges.length > 0) {
			this.logService.info(`[voice] onDidChangeSessions detected ${stateChanges.length} state change(s): ${stateChanges.map(c => `${c.label}: ${c.currentState}`).join(', ')}`);
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

		const targetSessionId = this._targetSession.get()?.toString();

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
				if (fallbackState === 'idle' && this._pendingIdleNarration.has(sessionIdStr)) {
					const prev = this._prevSessionStates.get(sessionIdStr);
					if (prev?.state) {
						fallbackState = prev.state;
					}
				}
				return {
					id: sessionIdStr,
					is_active: isActive,
					agent_state: fallbackState,
				};
			}
			const stateInfo = this._getAgentStateInfo(model);
			return {
				id: s.resource.toString(),
				is_active: isActive,
				agent_state: stateInfo.state,
				...(stateInfo.detail ? { agent_state_detail: stateInfo.detail } : {}),
				...(stateInfo.last_response_summary ? { last_response_summary: stateInfo.last_response_summary } : {}),
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
			sessionList.push({
				id: key,
				is_active: key === targetSessionId,
				agent_state: stateInfo.state,
				...(stateInfo.detail ? { agent_state_detail: stateInfo.detail } : {}),
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
		this.logService.info(`[voice] eagerly loading model for session ${key.slice(-32)}`);
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
