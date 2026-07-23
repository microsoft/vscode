/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { VSBuffer, encodeBase64 } from '../../../../../base/common/buffer.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { computeLevenshteinDistance } from '../../../../../base/common/diff/diff.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IProgress, IProgressService, IProgressStep, Progress, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { localize } from '../../../../../nls.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ILocalTranscriptionModelStatus, ILocalTranscriptionService, LocalTranscriptionModelState } from '../../../../../platform/localTranscription/common/localTranscription.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IVoiceClientService, IVoiceSessionContext, IVoiceTranscription, IVoiceTurnConfig } from '../../common/voiceClient/voiceClientService.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { AgentsVoiceStorageKeys } from '../../../agentsVoice/common/agentsVoice.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatMessageRole, ILanguageModelsService } from '../../common/languageModels.js';
import { createPcmCaptureNode } from '../pcmCaptureWorklet.js';

export const IChatSpeechToTextService = createDecorator<IChatSpeechToTextService>('chatSpeechToTextService');

/** Sample rate (Hz) of the PCM16 audio streamed to the transcription backend. */
const SAMPLE_RATE = 16000;

/** Number of samples buffered in the worklet before a chunk is posted to the main thread. */
const PCM_CAPTURE_CHUNK_SIZE = 4096;

/** Setting that enables the dictation feature; a kill-switch for rollout. */
const ENABLED_SETTING = 'dictation.enabled';
/**
 * Selects the dictation model. On-device model ids (e.g.
 * `nemotron-speech-streaming-en-0.6b`) run through {@link ILocalTranscriptionService};
 * the sentinel {@link MAI_MODEL_ID} routes to the cloud voice service instead.
 */
const MODEL_SETTING = 'dictation.model';

/** `dictation.model` sentinel selecting the cloud voice backend used by Voice Mode. */
const MAI_MODEL_ID = 'mai';

/**
 * Experimental: when enabled, the final dictation transcript is passed through a
 * small utility language model to restore punctuation, capitalization, and
 * paragraph breaks that the streaming ASR model omits. Requires Copilot/AI to be
 * enabled; falls back to the raw transcript when no model is available or the
 * request fails.
 */
const LLM_CLEANUP_SETTING = 'dictation.experimental.llmCleanup';

/** Upper bound on transcript length (characters) eligible for cleanup; longer transcripts skip cleanup and are returned raw. */
const LLM_CLEANUP_MAX_CHARS = 4000;

/** Bounded deadline for the cleanup request, so a stalled provider can never leave dictation stuck in `Transcribing`. */
const LLM_CLEANUP_TIMEOUT_MS = 10000;

/** Utility model used for transcript cleanup — a small, fast model in the spirit of gpt-4o-mini. */
const LLM_CLEANUP_MODEL_SELECTOR = { vendor: 'copilot', id: 'copilot-utility-small' };

/**
 * Which backend transcribes dictation audio:
 * - `nemo`: an on-device model via {@link ILocalTranscriptionService} (Foundry Local).
 * - `mai`: the cloud voice service used by Voice Mode, via {@link IVoiceClientService}.
 */
type DictationBackend = 'nemo' | 'mai';

/** How long to wait for the voice websocket to connect before failing an MAI session. */
const MAI_CONNECT_TIMEOUT_MS = 8000;
/** How long to wait after `ptt_end` for the backend's final transcript before returning what we have. */
const MAI_FINAL_TIMEOUT_MS = 4000;
/** How long to wait for the backend to acknowledge the opened session before streaming audio anyway. */
const MAI_SESSION_INIT_TIMEOUT_MS = 4000;

type SpeechToTextSessionEvent = {
	outcome: 'completed' | 'cancelled' | 'error';
	backend: string;
	surface: string;
	durationMs: number;
	segments: number;
	partialUpdates: number;
	transcriptLength: number;
	timeToFirstTranscriptMs: number;
	finalizeMs: number;
	errorCode: string;
};
type SpeechToTextSessionClassification = {
	owner: 'meganrogge';
	comment: 'Tracks usage and reliability of built-in dictation (speech-to-text), sliced by backend so backends can be compared.';
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the dictation session ended.' };
	backend: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which transcription backend was used (nemo on-device or mai cloud).' };
	surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which surface dictated: chat, editor, or terminal.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Recording duration in milliseconds.' };
	segments: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of transcript segments returned.' };
	partialUpdates: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of interim transcript updates received; a proxy for transcript churn/stability.' };
	transcriptLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Character length of the final transcript.' };
	timeToFirstTranscriptMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the first streamed audio chunk to the first transcript update; the backend transcription latency (excludes mic acquisition and model download). -1 when no transcript arrived.' };
	finalizeMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from the user stopping recording until the final transcript resolved; the post-stop wait. -1 when not applicable.' };
	errorCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Short error identifier when the session failed, else empty.' };
};

type SpeechToTextModelPrepareEvent = {
	outcome: 'ready' | 'error';
	downloaded: boolean;
	durationMs: number;
	errorCode: string;
};
type SpeechToTextModelPrepareClassification = {
	owner: 'meganrogge';
	comment: 'Tracks download/load success and duration of the on-device dictation (speech-to-text) model.';
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the model became ready or failed to prepare.' };
	downloaded: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether a download to disk was observed (first use) versus loading an already-cached model.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds from starting preparation until the model became ready or errored.' };
	errorCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Short error identifier when preparation failed, else empty.' };
};

type SpeechToTextAccuracyEvent = {
	backend: string;
	surface: string;
	submitted: boolean;
	dictatedLength: number;
	editDistance: number;
	editRate: number;
	edited: boolean;
};
type SpeechToTextAccuracyClassification = {
	owner: 'meganrogge';
	comment: 'Measures how much dictated text the user edited before sending it, as a proxy for transcription accuracy, sliced by backend so backends can be compared. No transcript text is logged, only aggregate character metrics.';
	backend: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which transcription backend produced the dictated text (nemo on-device or mai cloud).' };
	surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which surface dictated: chat, editor, or terminal.' };
	submitted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the measurement was taken at an actual input submission (true) versus the input being cleared or torn down without a confirmed send (false).' };
	dictatedLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Character length of the text originally inserted by dictation.' };
	editDistance: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Levenshtein distance between the dictated text and what the user actually submitted; the number of character corrections.' };
	editRate: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'editDistance normalized by dictatedLength and capped at 1; the fraction of the dictated text that was corrected. Lower is more accurate.' };
	edited: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the dictated text was changed at all before submission.' };
};

/**
 * A completed dictation whose text has now left the input (submitted or
 * cleared), measured to compare what was dictated against what was sent. Only
 * aggregate character metrics are logged; the transcript text never is.
 */
export interface IDictationAccuracyMeasurement {
	/** The text originally inserted by dictation. */
	readonly dictatedText: string;
	/** The text occupying the dictated region at the moment it left the input. */
	readonly submittedText: string;
	/** Backend that produced the dictated text, captured when dictation finished. */
	readonly backend: string;
	/** Surface the dictation ran in, for slicing. */
	readonly surface: ChatDictationSurface;
	/** Whether this was measured at an actual submit versus a clear/teardown. */
	readonly submitted: boolean;
}

export const enum ChatSpeechToTextState {
	/** Not recording. */
	Idle = 'idle',
	/** Capturing microphone audio and streaming it for transcription. */
	Recording = 'recording',
	/** Recording stopped, awaiting the final transcript. */
	Transcribing = 'transcribing',
}

/**
 * The surface a dictation session was started from. Reported in telemetry so
 * built-in dictation usage can be attributed to the chat input, an editor, or
 * the terminal.
 */
export type ChatDictationSurface = 'chat' | 'editor' | 'terminal';

/** A live dictation transcript update. */
export interface IChatDictationTranscript {
	/** Full cumulative transcript to display. */
	readonly text: string;
	/**
	 * The leading portion of `text` that is finalized (committed): it should be
	 * rendered without the shimmer. The remainder is the in-progress interim
	 * tail that keeps shimmering until it is finalized.
	 */
	readonly finalizedText: string;
}

export interface IChatSpeechToTextService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeState: Event<ChatSpeechToTextState>;
	readonly state: ChatSpeechToTextState;

	/**
	 * Fires with the cumulative transcript while recording, so callers can
	 * render dictation live as the user speaks. The value grows monotonically
	 * (finalized utterances plus any in-progress delta), and carries the
	 * finalized (non-shimmering) portion of that transcript.
	 */
	readonly onDidUpdateTranscript: Event<IChatDictationTranscript>;

	/**
	 * Whether on-device speech-to-text is available on this platform. Callers
	 * gate the dictation UI on this.
	 */
	readonly isConfigured: boolean;

	/**
	 * Fires when the model-preparation state changes. `true` while the model is
	 * downloading/loading, `false` once it is ready, errors, or the session
	 * ends. Callers swap the mic affordance for a spinner while preparing.
	 */
	readonly onDidChangePreparingModel: Event<boolean>;
	/** Whether the on-device model is currently downloading/loading. */
	readonly isPreparingModel: boolean;

	/**
	 * Fires whenever the on-device model download progress changes while the
	 * model is being prepared, so callers can update a progress ring.
	 */
	readonly onDidChangeModelDownloadProgress: Event<void>;

	/**
	 * Fractional download progress in `[0, 1]` while the model is downloading,
	 * or `undefined` when the fraction is not yet known (indeterminate), the
	 * download has finished and the model is loading into memory, or no
	 * preparation is in progress.
	 */
	readonly modelDownloadProgress: number | undefined;

	/**
	 * Begin capturing microphone audio in the given window and streaming it to
	 * the on-device transcription model. Rejects if the microphone cannot be
	 * accessed. `surface` identifies the dictation surface for telemetry
	 * (defaults to the chat input).
	 */
	start(window: Window & typeof globalThis, surface?: ChatDictationSurface): Promise<void>;

	/**
	 * Stop capturing, flush the final utterance, and resolve with the complete
	 * cumulative transcript (or `undefined` when nothing was transcribed).
	 */
	stopAndTranscribe(): Promise<string | undefined>;

	/** Abort an in-progress recording without keeping the transcript. */
	cancel(): void;

	/** The backend selected for the current/most-recent session (`nemo` or `mai`). */
	readonly currentBackend: string;

	/**
	 * Report how much a finished dictation was edited before it was submitted, as
	 * an accuracy proxy. Computes the edit distance internally and logs only
	 * aggregate metrics; no transcript text is emitted.
	 */
	logDictationAccuracy(measurement: IDictationAccuracyMeasurement): void;
}

export class ChatSpeechToTextService extends Disposable implements IChatSpeechToTextService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeState = this._register(new Emitter<ChatSpeechToTextState>());
	readonly onDidChangeState = this._onDidChangeState.event;

	private readonly _onDidUpdateTranscript = this._register(new Emitter<IChatDictationTranscript>());
	readonly onDidUpdateTranscript = this._onDidUpdateTranscript.event;

	private readonly _onDidChangePreparingModel = this._register(new Emitter<boolean>());
	readonly onDidChangePreparingModel = this._onDidChangePreparingModel.event;

	private _isPreparingModel = false;
	get isPreparingModel(): boolean {
		return this._isPreparingModel;
	}

	private readonly _onDidChangeModelDownloadProgress = this._register(new Emitter<void>());
	readonly onDidChangeModelDownloadProgress = this._onDidChangeModelDownloadProgress.event;

	private _modelDownloadProgress: number | undefined;
	get modelDownloadProgress(): number | undefined {
		return this._modelDownloadProgress;
	}

	/**
	 * Active download-progress notification, shown while the on-device model is
	 * downloading to disk. `report` drives the progress bar, `complete` resolves
	 * the backing task so the notification dismisses. `lastReported` is the last
	 * percentage pushed, so we can translate absolute progress into increments.
	 */
	private _downloadNotification: { readonly report: IProgress<IProgressStep>; readonly complete: () => void; lastReported: number } | undefined;

	/** Most recent model status, used to re-sync the notification on screen-reader changes. */
	private _lastModelStatus: ILocalTranscriptionModelStatus | undefined;

	private _state = ChatSpeechToTextState.Idle;
	get state(): ChatSpeechToTextState {
		return this._state;
	}

	private readonly _recordingContextKey: IContextKey<boolean>;
	private readonly _configuredContextKey: IContextKey<boolean>;
	private readonly _preparingContextKey: IContextKey<boolean>;

	private _mediaStream: MediaStream | undefined;
	private _audioContext: AudioContext | undefined;
	private _sourceNode: MediaStreamAudioSourceNode | undefined;
	private _workletNode: AudioWorkletNode | undefined;

	private readonly _localSessionDisposables = this._register(new DisposableStore());

	/** Backend selected for the in-progress session; set at `start`. */
	private _activeBackend: DictationBackend = 'nemo';

	// --- MAI (cloud voice) session state. ---
	/** Disposables for the active MAI session (transcription listener, etc.). */
	private readonly _maiSessionDisposables = this._register(new DisposableStore());
	/** Capture turn id for the active MAI push-to-talk turn. */
	private _maiTurnId = '';
	/** Highest transcription revision seen for the active MAI turn; drops stale/out-of-order events. */
	private _maiRevision = -1;
	/** Whether this dictation established the shared voice connection (and may thus tear it down). */
	private _maiOwnsConnection = false;
	/** Resolves when the backend emits the final transcript after `ptt_end`. */
	private _maiFinalTranscript: DeferredPromise<void> | undefined;

	get isConfigured(): boolean {
		if (this._configurationService.getValue<boolean>(ENABLED_SETTING) === false) {
			return false;
		}
		if (this._getBackend() === 'mai') {
			// The cloud backend needs a configured voice websocket endpoint;
			// GitHub sign-in and connectivity are validated when a session starts.
			return !!this._voiceWsUrl();
		}
		// On-device transcription needs no configuration — the model downloads
		// on first use. It is only unavailable where the platform lacks native
		// inference support (e.g. web).
		return this._localTranscription.isSupported;
	}

	/** Finalized (committed) utterances, space-joined. */
	private _finalizedText = '';
	/** In-progress text for the current utterance (from delta events). */
	private _deltaText = '';

	// Per-session telemetry accumulators.
	private _sessionStartMs = 0;
	private _sessionSegments = 0;
	private _sessionPartialUpdates = 0;
	private _sessionErrorCode = '';
	private _sessionSurface: ChatDictationSurface = 'chat';
	/** Timestamp of the first streamed audio chunk, to measure transcription latency. */
	private _firstAudioMs = 0;
	/** Timestamp of the first transcript update, to measure transcription latency. */
	private _firstTranscriptMs = 0;
	/** Milliseconds from stopping recording to the final transcript resolving; -1 until measured. */
	private _finalizeMs = -1;

	/** Cancellation for the in-flight experimental LLM cleanup request, aborted when the session is cancelled or disposed. */
	private readonly _cleanupCts = this._register(new MutableDisposable<CancellationTokenSource>());

	// Model-preparation telemetry accumulator. `_prepareStartMs` is non-zero
	// while a preparation is being tracked, so the terminal Ready/Error status
	// can report the elapsed download/load time exactly once.
	private _prepareStartMs = 0;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IProgressService private readonly _progressService: IProgressService,
		@ILogService private readonly _logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILocalTranscriptionService private readonly _localTranscription: ILocalTranscriptionService,
		@IVoiceClientService private readonly _voiceClientService: IVoiceClientService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IProductService private readonly _productService: IProductService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
	) {
		super();
		this._recordingContextKey = ChatContextKeys.speechToTextRecording.bindTo(contextKeyService);
		this._configuredContextKey = ChatContextKeys.speechToTextConfigured.bindTo(contextKeyService);
		this._preparingContextKey = ChatContextKeys.speechToTextPreparing.bindTo(contextKeyService);
		this._updateConfiguredContextKey();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ENABLED_SETTING) || e.affectsConfiguration(MODEL_SETTING)) {
				this._updateConfiguredContextKey();
			}
		}));
	}

	/** Read the configured dictation backend, derived from the selected model. */
	private _getBackend(): DictationBackend {
		return this._configurationService.getValue<string>(MODEL_SETTING) === MAI_MODEL_ID ? 'mai' : 'nemo';
	}

	get currentBackend(): string {
		return this._activeBackend;
	}

	logDictationAccuracy(measurement: IDictationAccuracyMeasurement): void {
		const { dictatedText, submittedText, backend, surface, submitted } = measurement;
		if (!dictatedText) {
			return;
		}
		const editDistance = computeLevenshteinDistance(dictatedText, submittedText);
		const editRate = Math.min(1, editDistance / dictatedText.length);
		this._telemetryService.publicLog2<SpeechToTextAccuracyEvent, SpeechToTextAccuracyClassification>('chatSpeechToText.accuracy', {
			backend,
			surface,
			submitted,
			dictatedLength: dictatedText.length,
			editDistance,
			editRate,
			edited: editDistance > 0,
		});
	}

	/** Voice websocket endpoint used by the MAI backend (shared with Voice Mode). */
	private _voiceWsUrl(): string {
		const configured = this._configurationService.getValue<string>('agents.voice.backendUrl');
		const url = typeof configured === 'string' ? configured.trim() : '';
		return url || this._productService.voiceWsUrl || '';
	}

	private _updateConfiguredContextKey(): void {
		this._configuredContextKey.set(this.isConfigured);
	}

	private _setPreparingModel(preparing: boolean): void {
		if (this._isPreparingModel === preparing) {
			return;
		}
		this._isPreparingModel = preparing;
		this._preparingContextKey.set(preparing);
		if (!preparing) {
			this._setModelDownloadProgress(undefined);
		}
		this._onDidChangePreparingModel.fire(preparing);
	}

	private _setModelDownloadProgress(progress: number | undefined): void {
		if (this._modelDownloadProgress === progress) {
			return;
		}
		this._modelDownloadProgress = progress;
		this._onDidChangeModelDownloadProgress.fire();
	}

	private _logSessionTelemetry(outcome: 'completed' | 'cancelled' | 'error'): void {
		if (this._sessionStartMs === 0) {
			return;
		}
		const durationMs = Date.now() - this._sessionStartMs;
		const timeToFirstTranscriptMs = this._firstAudioMs && this._firstTranscriptMs
			? Math.max(0, this._firstTranscriptMs - this._firstAudioMs)
			: -1;
		this._telemetryService.publicLog2<SpeechToTextSessionEvent, SpeechToTextSessionClassification>('chatSpeechToText.session', {
			outcome,
			backend: this._activeBackend,
			surface: this._sessionSurface,
			durationMs,
			segments: this._sessionSegments,
			partialUpdates: this._sessionPartialUpdates,
			transcriptLength: this._transcript.length,
			timeToFirstTranscriptMs,
			finalizeMs: this._finalizeMs,
			errorCode: this._sessionErrorCode,
		});
		this._sessionStartMs = 0;
	}

	/**
	 * Emit the model-preparation telemetry event once, when the on-device model
	 * reaches a terminal state (ready or error). `_prepareStartMs` guards against
	 * duplicate emission, since `_handleModelStatus` can fire repeatedly.
	 */
	private _logModelPrepareTelemetry(status: ILocalTranscriptionModelStatus): void {
		if (this._prepareStartMs === 0) {
			return;
		}
		const outcome = status.state === LocalTranscriptionModelState.Ready ? 'ready' : 'error';
		const durationMs = Date.now() - this._prepareStartMs;
		this._telemetryService.publicLog2<SpeechToTextModelPrepareEvent, SpeechToTextModelPrepareClassification>('chatSpeechToText.modelPrepare', {
			outcome,
			downloaded: status.downloaded === true,
			durationMs,
			errorCode: outcome === 'error' ? (status.errorCode || 'unknown') : '',
		});
		this._prepareStartMs = 0;
	}

	private _setState(state: ChatSpeechToTextState): void {
		if (this._state === state) {
			return;
		}
		this._state = state;
		this._recordingContextKey.set(state === ChatSpeechToTextState.Recording);
		this._onDidChangeState.fire(state);
	}

	private get _transcript(): string {
		return [this._finalizedText, this._deltaText].filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim();
	}

	async start(window: Window & typeof globalThis, surface: ChatDictationSurface = 'chat'): Promise<void> {
		if (this._state !== ChatSpeechToTextState.Idle) {
			return;
		}

		if (this._configurationService.getValue<boolean>(ENABLED_SETTING) === false) {
			return;
		}

		const backend = this._getBackend();
		this._activeBackend = backend;

		if (backend === 'nemo' && !this._localTranscription.isSupported) {
			this._notificationService.notify({
				severity: Severity.Warning,
				message: localize('chatStt.notSupported', "On-device speech-to-text is not available on this platform."),
			});
			return;
		}
		if (backend === 'mai' && !this._voiceWsUrl()) {
			this._notificationService.notify({
				severity: Severity.Warning,
				message: localize('chatStt.maiNotConfigured', "Cloud speech-to-text is not available: no voice service is configured."),
			});
			return;
		}

		this._sessionStartMs = Date.now();
		this._sessionSegments = 0;
		this._sessionPartialUpdates = 0;
		this._sessionErrorCode = '';
		this._sessionSurface = surface;
		this._firstAudioMs = 0;
		this._firstTranscriptMs = 0;
		this._finalizeMs = -1;
		// Defensively clear any transcript left over from a previous session so a
		// new dictation never starts by re-emitting the prior transcript (teardown
		// already clears these, but a start without a clean teardown must not leak).
		this._finalizedText = '';
		this._deltaText = '';

		let stream: MediaStream;
		try {
			stream = await this._acquireStream(window);
		} catch (err) {
			this._sessionErrorCode = this._sessionErrorCode || 'microphone';
			this._logSessionTelemetry('error');
			this._logService.error('[chat-stt] microphone acquisition failed', err);
			this._notificationService.error(localize('chatStt.micError', "Could not access the microphone for speech-to-text: {0}", toErrorMessage(err)));
			throw err;
		}

		this._mediaStream = stream;

		try {
			await this._startBackendSession(window);
		} catch (err) {
			this._teardown();
			this._sessionErrorCode = this._sessionErrorCode || 'connect';
			this._logSessionTelemetry('error');
			this._logService.error('[chat-stt] failed to start transcription', err);
			this._notificationService.error(localize('chatStt.connectError', "Could not start speech-to-text: {0}", toErrorMessage(err)));
			throw err;
		}

		try {
			await this._startCapture(window, stream);
		} catch (err) {
			// Capture setup (AudioContext/nodes) can fail after the mic and the
			// transcription session are already live; make sure both are torn
			// down instead of leaking an active recording in the Idle state.
			this._cancelBackend();
			this._teardown();
			this._sessionErrorCode = this._sessionErrorCode || 'capture';
			this._logSessionTelemetry('error');
			this._logService.error('[chat-stt] failed to start audio capture', err);
			this._notificationService.error(localize('chatStt.captureError', "Could not start audio capture for speech-to-text: {0}", toErrorMessage(err)));
			throw err;
		}
		this._setState(ChatSpeechToTextState.Recording);
		// Only cue "recording started" once we are actually listening. If the
		// model is still downloading/loading, defer the cue until it becomes
		// ready (see _handleModelStatus), so it lands with the "Listening…"
		// placeholder rather than at the start of the download.
		if (!this._isPreparingModel) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStarted);
		}
	}

	/** Start the transcription session for the active backend. */
	private async _startBackendSession(window: Window & typeof globalThis): Promise<void> {
		if (this._activeBackend === 'mai') {
			return this._startMaiSession(window);
		}
		return this._startLocalSession();
	}

	/**
	 * Record a transcript update on the shared cumulative surface and accumulate
	 * the latency/stability telemetry, regardless of backend. `text` is the full
	 * cumulative transcript; `finalizedText` is its committed (non-shimmering)
	 * prefix; `isFinal` marks the terminal update after the session stops.
	 */
	private _emitTranscript(text: string, finalizedText: string, isFinal: boolean): void {
		this._finalizedText = text;
		this._deltaText = '';
		if (!isFinal) {
			this._sessionSegments++;
			this._sessionPartialUpdates++;
		}
		if (this._firstTranscriptMs === 0 && this._transcript.length > 0) {
			this._firstTranscriptMs = Date.now();
		}
		this._onDidUpdateTranscript.fire({ text: this._transcript, finalizedText });
	}

	/**
	 * Begin a cloud transcription session over the shared Voice Mode websocket:
	 * connect, then open a single push-to-talk turn whose streamed audio the
	 * backend transcribes. Interim/final `transcription` events are piped onto
	 * the shared cumulative-transcript surface.
	 *
	 * The websocket is a single connection shared with Voice Mode. We refuse to
	 * start when it is already connected (another owner holds it) and only tear
	 * down a connection we ourselves established, so dictation and Voice Mode
	 * cannot disconnect each other.
	 */
	private async _startMaiSession(window: Window & typeof globalThis): Promise<void> {
		if (this._voiceClientService.isConnected) {
			throw new Error(localize('chatStt.maiBusy', "Cloud dictation is unavailable while Voice Mode is connected."));
		}
		const authToken = await this._getGitHubToken();
		if (!authToken) {
			throw new Error(localize('chatStt.maiSignIn', "Sign in to GitHub to use cloud dictation."));
		}

		this._maiTurnId = generateUuid();
		this._maiRevision = -1;
		this._maiSessionDisposables.add(this._voiceClientService.onTranscription(e => this._handleMaiTranscription(e)));
		// A terminal close (e.g. code 4008 when another window takes over the
		// single voice session) stops reconnection; without this the mic would
		// stay open in Recording while audio is silently dropped.
		this._maiSessionDisposables.add(this._voiceClientService.onFatalDisconnect(() =>
			this._failMaiSession(localize('chatStt.maiDisconnected', "Cloud dictation was disconnected."))));
		this._maiSessionDisposables.add(this._voiceClientService.onError(msg =>
			this._logService.warn(`[chat-stt] voice service error during dictation: ${msg}`)));

		// We are initiating the connection; mark ownership before connecting so a
		// failed/partial connect is still torn down by our teardown path.
		this._maiOwnsConnection = true;
		// Connecting to the cloud voice service and opening the session takes a
		// moment on the first dictation; surface the same spinner affordance the
		// on-device path uses while its model prepares. Cleared once the session
		// is established (below) or by teardown on failure.
		this._setPreparingModel(true);
		await this._voiceClientService.connect(window, authToken);
		await this._awaitVoiceConnected();

		// The backend drops PTT audio until a session is opened, so establish a
		// minimal (session-less) dictation session and wait for the backend to
		// acknowledge it before streaming audio. The websocket preserves order,
		// but the ack guarantees the session exists server-side first.
		//
		// Dictation is one continuous turn: the user taps to start, speaks
		// several phrases with pauses in between, and taps to stop. Disable the
		// backend's automatic turn endpointing (VAD silence / stop phrases) so a
		// pause between phrases does not end the turn — otherwise everything
		// after the first pause lands in a new (dropped) turn and is lost.
		const context: IVoiceSessionContext = { sessions: [], display_locale: '' };
		const turnConfig: IVoiceTurnConfig = { auto_end_mode: 'off', silence_ms: 0, stop_phrases: [], vad_gate_asr: false };
		this._voiceClientService.sendStartSession(context, this._telemetryService.machineId, undefined, turnConfig);
		await this._awaitSessionInit();

		// Session is live; drop the connecting spinner so the mic reads as
		// recording when start() transitions to the Recording state.
		this._setPreparingModel(false);
		this._voiceClientService.sendPttStart(this._maiTurnId);
	}

	/**
	 * Wait for the backend to acknowledge the opened session (`onSessionInit`),
	 * resolving on a timeout so a missing ack cannot wedge dictation: the
	 * websocket preserves order, so `ptt_start` still follows `start_session`.
	 */
	private async _awaitSessionInit(): Promise<void> {
		await new Promise<void>(resolve => {
			const store = new DisposableStore();
			this._maiSessionDisposables.add(store);
			const timer = setTimeout(() => {
				store.dispose();
				resolve();
			}, MAI_SESSION_INIT_TIMEOUT_MS);
			store.add(toDisposable(() => clearTimeout(timer)));
			store.add(this._voiceClientService.onSessionInit(() => {
				store.dispose();
				resolve();
			}));
		});
	}

	/**
	 * Handle a transcription event from the shared voice socket. Events for a
	 * different (non-empty) turn are dropped so a stale/foreign frame — e.g. a
	 * replay from a previous session on the shared backend — cannot resurrect
	 * the prior transcript; a frame without a turnId is accepted since the
	 * conversational socket does not always tag transcription frames. Within our
	 * turn, a stale (non-increasing) revision is dropped so a late event cannot
	 * overwrite newer text or resolve the final waiter early. `text` is the full
	 * cumulative transcript for the turn.
	 */
	private _handleMaiTranscription(e: IVoiceTranscription): void {
		if (e.turnId !== undefined && this._maiTurnId && e.turnId !== this._maiTurnId) {
			this._logService.trace(`[chat-stt] mai transcription dropped (turn ${e.turnId} != ${this._maiTurnId})`);
			return;
		}
		if (e.revision !== undefined) {
			if (e.revision <= this._maiRevision) {
				this._logService.trace(`[chat-stt] mai transcription dropped (revision ${e.revision} <= ${this._maiRevision})`);
				return;
			}
			this._maiRevision = e.revision;
		}
		this._logService.trace(`[chat-stt] mai transcription status=${e.status ?? 'none'} revision=${e.revision ?? 'none'} len=${e.text.length}`);
		this._emitTranscript(e.text, e.committed ?? '', e.status === 'final');
		if (e.status === 'final') {
			this._maiFinalTranscript?.complete();
		}
	}

	/**
	 * Abort an in-progress MAI dictation after a terminal disconnect: log the
	 * failure, release the final waiter so `stopAndTranscribe` does not hang,
	 * tear down the mic/session, and surface an actionable message.
	 */
	private _failMaiSession(message: string): void {
		if (this._activeBackend !== 'mai' || this._state === ChatSpeechToTextState.Idle) {
			return;
		}
		this._sessionErrorCode = this._sessionErrorCode || 'disconnect';
		this._logSessionTelemetry('error');
		this._maiFinalTranscript?.complete();
		this._cancelBackend();
		this._teardown();
		this._setState(ChatSpeechToTextState.Idle);
		this._notificationService.error(message);
	}

	/** Resolve the GitHub access token used to authenticate the voice websocket. */
	private async _getGitHubToken(): Promise<string | undefined> {
		try {
			const sessions = await this._authenticationService.getSessions('github');
			return sessions[0]?.accessToken;
		} catch (err) {
			this._logService.warn('[chat-stt] could not resolve a GitHub session for cloud dictation', err);
			return undefined;
		}
	}

	/** Wait for the voice websocket to report connected, or reject on timeout. */
	private async _awaitVoiceConnected(): Promise<void> {
		if (this._voiceClientService.isConnected) {
			return;
		}
		await new Promise<void>((resolve, reject) => {
			const store = new DisposableStore();
			this._maiSessionDisposables.add(store);
			const timer = setTimeout(() => {
				store.dispose();
				reject(new Error('Timed out connecting to the voice service.'));
			}, MAI_CONNECT_TIMEOUT_MS);
			store.add(toDisposable(() => clearTimeout(timer)));
			store.add(this._voiceClientService.onDidChangeConnectionState(connected => {
				if (connected) {
					store.dispose();
					resolve();
				}
			}));
		});
	}

	/**
	 * Begin an on-device transcription session in the utility process and pipe
	 * its interim/final results onto the shared cumulative-transcript surface.
	 */
	private async _startLocalSession(): Promise<void> {
		const local = this._localTranscription;
		this._localSessionDisposables.add(local.onDidTranscribe(result => {
			// The local service returns the full cumulative transcript each time.
			this._emitTranscript(result.text, result.finalizedText ?? '', result.isFinal);
		}));
		const cacheDir = joinPath(this._environmentService.cacheHome, 'chatDictationModels').fsPath;
		const model = this._getModelId();
		await local.start({ cacheDir, model });

		// The model loads in the utility process in the background (start()
		// returns immediately). On first use it may download hundreds of MB, so
		// surface progress until it is ready; recording proceeds meanwhile and
		// interim transcripts begin once the model finishes loading.
		const status = await local.getModelStatus();
		if (status.state !== LocalTranscriptionModelState.Ready && status.state !== LocalTranscriptionModelState.Error) {
			this._trackModelPreparation();
		}
	}

	private _getModelId(): string | undefined {
		const value = this._configurationService.getValue<string>(MODEL_SETTING);
		return value ? value.trim() || undefined : undefined;
	}

	/**
	 * Track model download/load so the toolbar mic can show a spinner until the
	 * model is ready. While the model is downloading to disk (which can be
	 * hundreds of MB on first use) a progress notification is also shown so the
	 * user understands why dictation has not started yet; it dismisses once the
	 * download finishes. Recording proceeds meanwhile and interim transcripts
	 * begin once the model finishes loading.
	 */
	private _trackModelPreparation(): void {
		this._setPreparingModel(true);
		// Start timing preparation (download + load) for the model-prepare
		// telemetry event, emitted once the model reaches Ready or Error.
		this._prepareStartMs = Date.now();
		// Guarantee the download notification is dismissed no matter how the
		// session ends (teardown, cancel, or the service being disposed).
		this._localSessionDisposables.add(toDisposable(() => {
			this._lastModelStatus = undefined;
			this._completeDownloadNotification();
		}));
		// The accessible progress notification is only shown to screen-reader
		// users, so re-sync it whenever screen-reader optimization is toggled
		// mid-preparation (a change on its own emits no model status).
		this._localSessionDisposables.add(this._accessibilityService.onDidChangeScreenReaderOptimized(() => {
			if (this._lastModelStatus) {
				this._updateDownloadNotification(this._lastModelStatus);
			}
		}));
		// Register the status listener BEFORE snapshotting the current status. A
		// Downloading→Ready/Error transition can land between the snapshot and the
		// subscription; if it did, the completion event would be missed and the
		// spinner and download notification would be stranded for the rest of the
		// recording. Registering first, then re-querying, makes the handoff
		// race-free — any transition is caught by the listener, and the snapshot
		// settles the current state.
		this._localSessionDisposables.add(this._localTranscription.onDidChangeModelStatus(status => this._handleModelStatus(status)));
		this._localTranscription.getModelStatus().then(status => this._handleModelStatus(status), () => { /* errors also surface via onDidChangeModelStatus */ });
	}

	/**
	 * Drive the progress ring, download notification, and error handling from a
	 * model status. Safe to call repeatedly and from both the status snapshot and
	 * the change listener, since the progress and preparing-state updates are
	 * idempotent.
	 */
	private _handleModelStatus(status: ILocalTranscriptionModelStatus): void {
		this._lastModelStatus = status;
		this._updateModelDownloadProgress(status);
		this._updateDownloadNotification(status);
		if (status.state === LocalTranscriptionModelState.Ready) {
			this._logModelPrepareTelemetry(status);
			const wasPreparing = this._isPreparingModel;
			this._setPreparingModel(false);
			// The recording-started cue was deferred while the model prepared;
			// now that we are actually listening, play it (if still recording).
			if (wasPreparing && this._state === ChatSpeechToTextState.Recording) {
				this._accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStarted);
			}
		} else if (status.state === LocalTranscriptionModelState.Error) {
			this._logModelPrepareTelemetry(status);
			this._setPreparingModel(false);
			this._failSession('model', localize('chatStt.modelError', "On-device speech-to-text model failed to load: {0}", status.error ?? ''));
		}
	}

	/**
	 * Feed the toolbar progress ring: expose the download fraction while it is
	 * known, and `undefined` (indeterminate ring) before the first byte total
	 * arrives or once the download completes and the model is loading.
	 */
	private _updateModelDownloadProgress(status: ILocalTranscriptionModelStatus): void {
		if (status.state === LocalTranscriptionModelState.Downloading && typeof status.progress === 'number') {
			this._setModelDownloadProgress(Math.max(0, Math.min(1, status.progress)));
		} else {
			this._setModelDownloadProgress(undefined);
		}
	}

	/**
	 * Surface model-preparation progress to screen-reader users via a progress
	 * notification that stays visible across the download and load phases.
	 */
	private _updateDownloadNotification(status: ILocalTranscriptionModelStatus): void {
		const preparing = status.state === LocalTranscriptionModelState.Downloading
			|| status.state === LocalTranscriptionModelState.Loading;
		// Only screen-reader users get this notification (sighted users get the
		// toolbar download ring and its rich hover, which assistive technology
		// cannot reach). Dismiss it once preparation ends or if a screen reader
		// is no longer active.
		if (!preparing || !this._accessibilityService.isScreenReaderOptimized()) {
			this._completeDownloadNotification();
			return;
		}
		if (!this._downloadNotification) {
			const deferred = new DeferredPromise<void>();
			let report: IProgress<IProgressStep> = Progress.None;
			this._progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('chatStt.preparingModel', "Preparing speech-to-text model…"),
				delay: 500,
			}, progress => {
				report = progress;
				return deferred.p;
			});
			this._downloadNotification = { report, complete: () => deferred.complete(), lastReported: 0 };
		}
		if (status.state === LocalTranscriptionModelState.Loading) {
			// Download finished; the bar no longer moves, so make the wait
			// self-explanatory rather than a seemingly stuck full bar.
			this._downloadNotification.report.report({ message: localize('chatStt.loadingModel', "Loading model…") });
			return;
		}
		if (typeof status.progress === 'number') {
			const percent = Math.max(0, Math.min(100, Math.round(status.progress * 100)));
			const increment = percent - this._downloadNotification.lastReported;
			const message = localize('chatStt.downloadingPercent', "Downloading… {0}%", percent);
			if (increment > 0) {
				this._downloadNotification.report.report({ increment, total: 100, message });
				this._downloadNotification.lastReported = percent;
			} else {
				// Keep the message fresh (e.g. while still at 0%) so the bar is
				// never blank and unlabeled during the initial download stall.
				this._downloadNotification.report.report({ message });
			}
		} else {
			// Byte total not known yet (e.g. still contacting the model host):
			// show an indeterminate "Downloading…" rather than a blank bar.
			this._downloadNotification.report.report({ message: localize('chatStt.downloading', "Downloading…") });
		}
	}

	private _completeDownloadNotification(): void {
		this._downloadNotification?.complete();
		this._downloadNotification = undefined;
	}

	/**
	 * Abort the active recording because of an unrecoverable error (e.g. the
	 * model failed to download/load), surfacing a notification instead of
	 * silently returning an empty transcript.
	 */
	private _failSession(errorCode: string, message: string): void {
		if (this._state === ChatSpeechToTextState.Idle) {
			return;
		}
		this._sessionErrorCode = this._sessionErrorCode || errorCode;
		this._logSessionTelemetry('error');
		this._cancelBackend();
		this._teardown();
		this._setState(ChatSpeechToTextState.Idle);
		this._notificationService.error(message);
	}

	/**
	 * A `pushAudio` IPC call rejected (e.g. the utility process exited or the
	 * channel failed). Stop the recording once and surface the error rather than
	 * leaving the UI showing an active recording with unhandled rejections.
	 */
	private _onAudioPushError(err: unknown): void {
		if (this._state !== ChatSpeechToTextState.Recording) {
			return;
		}
		this._logService.error('[chat-stt] failed to stream audio to transcription', err);
		this._failSession('audio', localize('chatStt.audioError', "Speech-to-text stopped because audio could not be sent for transcription: {0}", toErrorMessage(err instanceof Error ? err : new Error(String(err)))));
	}

	async stopAndTranscribe(): Promise<string | undefined> {
		if (this._state !== ChatSpeechToTextState.Recording) {
			return undefined;
		}

		this._setState(ChatSpeechToTextState.Transcribing);
		this._stopCapture();
		this._accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStopped);

		const stopMs = Date.now();
		let text = this._transcript;
		try {
			const finalText = await this._finishBackend();
			if (finalText) {
				text = finalText;
			}
		} catch (err) {
			this._sessionErrorCode = this._sessionErrorCode || 'transcribe';
			this._logService.error('[chat-stt] final transcription failed', err);
		}

		if (text && this._configurationService.getValue<boolean>(LLM_CLEANUP_SETTING) === true) {
			const cts = this._cleanupCts.value = new CancellationTokenSource();
			const cleaned = await this._cleanupWithLanguageModel(text, cts.token);
			if (cts.token.isCancellationRequested) {
				// The session was cancelled or disposed while cleanup was running:
				// `cancel()` has already torn down and may have started a new
				// session, so we must not touch shared state or return a result.
				return undefined;
			}
			if (cleaned) {
				text = cleaned;
			}
		}

		// Measured after cleanup so it reflects the transcript actually returned
		// to the caller, including any language-model latency.
		this._finalizeMs = Date.now() - stopMs;
		this._logSessionTelemetry(this._sessionErrorCode ? 'error' : 'completed');
		this._teardown();
		this._setState(ChatSpeechToTextState.Idle);
		return text || undefined;
	}

	/**
	 * Experimental: run the raw ASR transcript through a small utility language
	 * model to restore punctuation, capitalization, and paragraph breaks that the
	 * streaming model omits. Returns the cleaned text, or `undefined` when cleanup
	 * is skipped or fails (no model available, over-length input, timeout,
	 * cancellation, or a streaming/result error) — in which case the caller keeps
	 * the raw transcript. Only a fully successful response can replace it.
	 */
	private async _cleanupWithLanguageModel(text: string, token: CancellationToken): Promise<string | undefined> {
		// Over-length transcripts are returned raw rather than truncated: sending
		// only a prefix and replacing the whole transcript would silently drop the
		// remainder, breaking the raw-transcript fallback guarantee.
		if (text.length > LLM_CLEANUP_MAX_CHARS) {
			return undefined;
		}

		const cts = new CancellationTokenSource(token);
		const timer = setTimeout(() => cts.cancel(), LLM_CLEANUP_TIMEOUT_MS);
		try {
			const models = await this._languageModelsService.selectLanguageModels(LLM_CLEANUP_MODEL_SELECTOR);
			if (!models.length || cts.token.isCancellationRequested) {
				return undefined;
			}

			const systemPrompt = [
				'You clean up raw speech-to-text (dictation) output. The input is a verbatim transcript with little or no punctuation or capitalization.',
				'Add sentence punctuation, capitalization, and paragraph breaks so it reads naturally. Split run-on sentences and group related sentences into paragraphs separated by a blank line.',
				'Preserve the wording exactly: do not add, reword, translate, summarize, or answer the content — only fix punctuation, casing, and spacing. The single exception is that you should delete filler words (such as "um" and "uh") and obvious false starts.',
				'Reply with the cleaned transcript only — no preamble, no quotes, no commentary. This is a benign formatting task: never refuse.',
			].join(' ');

			const response = await this._languageModelsService.sendChatRequest(
				models[0],
				undefined,
				[
					{ role: ChatMessageRole.System, content: [{ type: 'text', value: systemPrompt }] },
					{ role: ChatMessageRole.User, content: [{ type: 'text', value: text }] },
				],
				{},
				cts.token,
			);

			// Consume the stream with strict error propagation and await the
			// result: `getTextResponseFromStream` would return accumulated partial
			// text on a mid-stream failure, which could replace the complete raw
			// transcript with a truncated one. Any error here falls through to the
			// catch and yields `undefined` (raw-transcript fallback).
			let cleaned = '';
			for await (const part of response.stream) {
				if (cts.token.isCancellationRequested) {
					return undefined;
				}
				const parts = Array.isArray(part) ? part : [part];
				for (const item of parts) {
					if (item.type === 'text') {
						cleaned += item.value;
					}
				}
			}
			await response.result;
			if (cts.token.isCancellationRequested) {
				return undefined;
			}
			return cleaned.trim() || undefined;
		} catch (err) {
			this._logService.warn('[chat-stt] language model transcript cleanup failed; using raw transcript', err);
			return undefined;
		} finally {
			clearTimeout(timer);
			cts.dispose();
		}
	}

	/**
	 * Finish the active backend's turn and resolve with its final transcript:
	 * the on-device service's `stop()`, or — for MAI — a `ptt_end` followed by a
	 * short wait for the backend's final `transcription`.
	 */
	private async _finishBackend(): Promise<string | undefined> {
		if (this._activeBackend === 'mai') {
			this._maiFinalTranscript = new DeferredPromise<void>();
			this._voiceClientService.sendPttEnd();
			await Promise.race([
				this._maiFinalTranscript.p,
				new Promise<void>(resolve => setTimeout(resolve, MAI_FINAL_TIMEOUT_MS)),
			]);
			return this._transcript;
		}
		return this._localTranscription.stop();
	}

	cancel(): void {
		const wasRecording = this._state === ChatSpeechToTextState.Recording;
		this._cleanupCts.value?.cancel();
		this._logSessionTelemetry('cancelled');
		this._cancelBackend();
		this._teardown();
		this._setState(ChatSpeechToTextState.Idle);
		if (wasRecording) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStopped);
		}
	}

	/** Abort the active backend's session, discarding any transcript in flight. */
	private _cancelBackend(): void {
		if (this._activeBackend === 'mai') {
			// Only tear down a connection we established (never Voice Mode's).
			if (this._maiOwnsConnection) {
				this._voiceClientService.disconnect();
				this._maiOwnsConnection = false;
			}
			return;
		}
		this._localTranscription.cancel();
	}

	private async _startCapture(window: Window & typeof globalThis, stream: MediaStream): Promise<void> {
		const ctx = new window.AudioContext({ sampleRate: SAMPLE_RATE });
		this._audioContext = ctx;
		// The context is created several awaits after the user gesture (mic
		// acquisition + model startup), so it can start suspended; resume it or
		// the worklet never runs and no audio is streamed.
		ctx.resume().catch(() => { /* ignore */ });
		const source = ctx.createMediaStreamSource(stream);
		this._sourceNode = source;

		// Load the capture worklet (see `createPcmCaptureNode`). ScriptProcessorNode
		// is deprecated and its `onaudioprocess` callback is throttled/stops on the
		// main thread; the worklet runs on the audio thread and streams PCM reliably.
		const node = await createPcmCaptureNode(window, ctx, PCM_CAPTURE_CHUNK_SIZE, samples => {
			this._pushAudio(samples, window);
		});

		// The session may have been torn down while the module was loading.
		if (this._audioContext !== ctx) {
			try { node.disconnect(); } catch { /* ignore */ }
			return;
		}

		this._workletNode = node;
		source.connect(node);
		node.connect(ctx.destination);
	}

	/**
	 * Stream one captured PCM16 chunk to the active backend, recording the
	 * first-chunk timestamp used for transcription-latency telemetry.
	 */
	private _pushAudio(samples: Float32Array, window: Window & typeof globalThis): void {
		if (this._firstAudioMs === 0) {
			this._firstAudioMs = Date.now();
		}
		const buffer = encodeRawPcm16Buffer(samples);
		if (this._activeBackend === 'mai') {
			this._voiceClientService.sendPttAudioChunk(encodeBase64(buffer));
			return;
		}
		this._localTranscription.pushAudio(buffer).catch(err => this._onAudioPushError(err));
	}

	private _stopCapture(): void {
		if (this._workletNode) {
			this._workletNode.port.onmessage = null;
			try { this._workletNode.disconnect(); } catch { /* ignore */ }
			this._workletNode = undefined;
		}
		try { this._sourceNode?.disconnect(); } catch { /* ignore */ }
		this._sourceNode = undefined;
		this._audioContext?.close().catch(() => { /* ignore */ });
		this._audioContext = undefined;
		this._mediaStream?.getTracks().forEach(track => track.stop());
		this._mediaStream = undefined;
	}

	private _teardown(): void {
		this._stopCapture();
		this._setPreparingModel(false);
		this._completeDownloadNotification();
		// Drop any in-progress preparation timing; a session torn down before the
		// model reached a terminal state does not emit a model-prepare event.
		this._prepareStartMs = 0;
		this._localSessionDisposables.clear();
		// Release the cloud voice session and its listeners (idempotent if the
		// backend was already cancelled/disconnected).
		this._maiSessionDisposables.clear();
		this._maiFinalTranscript = undefined;
		this._maiTurnId = '';
		this._maiRevision = -1;
		// Release the shared voice connection only if this dictation owns it, so
		// tearing down never disconnects a session Voice Mode established.
		if (this._activeBackend === 'mai' && this._maiOwnsConnection) {
			this._voiceClientService.disconnect();
			this._maiOwnsConnection = false;
		}
		// Do not retain transcript text beyond the session that produced it.
		this._finalizedText = '';
		this._deltaText = '';
	}

	private async _acquireStream(window: Window & typeof globalThis): Promise<MediaStream> {
		// Honor the microphone chosen for Voice Mode (shared setting) so both
		// features record from the same device. Falls back to the system default
		// if the stored device is stale/unplugged.
		const deviceId = this._storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
		const audioConstraints: MediaTrackConstraints = {
			channelCount: 1,
			echoCancellation: true,
			noiseSuppression: true,
		};
		if (deviceId) {
			audioConstraints.deviceId = { exact: deviceId };
		}

		try {
			return await window.navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
		} catch (err) {
			const isDeviceError = deviceId && err instanceof DOMException &&
				(err.name === 'OverconstrainedError' || err.name === 'NotFoundError');
			if (!isDeviceError) {
				throw err;
			}
			this._logService.warn(`[chat-stt] preferred microphone ${deviceId.slice(0, 8)}… unavailable, falling back to default`);
			delete audioConstraints.deviceId;
			return window.navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
		}
	}
}

function encodeRawPcm16Buffer(samples: Float32Array): VSBuffer {
	const bytes = new Uint8Array(samples.length * 2);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
	}
	return VSBuffer.wrap(bytes);
}

function toErrorMessage(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	return String(err);
}
