/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IProgress, IProgressService, IProgressStep, Progress, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { localize } from '../../../../../nls.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ILocalTranscriptionModelStatus, ILocalTranscriptionService, LocalTranscriptionModelState } from '../../../../../platform/localTranscription/common/localTranscription.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { AgentsVoiceStorageKeys } from '../../../agentsVoice/common/agentsVoice.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

export const IChatSpeechToTextService = createDecorator<IChatSpeechToTextService>('chatSpeechToTextService');

/** Sample rate (Hz) of the PCM16 audio streamed to the transcription backend. */
const SAMPLE_RATE = 16000;

/** Setting that enables the dictation feature; a kill-switch for rollout. */
const ENABLED_SETTING = 'chat.speechToText.enabled';
/** Setting that controls the tap-vs-hold behavior of the dictation shortcut. */
const MODE_SETTING = 'chat.speechToText.mode';

type SpeechToTextSessionEvent = {
	outcome: 'completed' | 'cancelled' | 'error';
	mode: string;
	durationMs: number;
	segments: number;
	transcriptLength: number;
	errorCode: string;
};
type SpeechToTextSessionClassification = {
	owner: 'meganrogge';
	comment: 'Tracks usage and reliability of chat-input dictation (speech-to-text).';
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the dictation session ended.' };
	mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Configured dictation shortcut mode (auto, toggle, or pushToTalk).' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Recording duration in milliseconds.' };
	segments: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of transcript segments returned.' };
	transcriptLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Character length of the final transcript.' };
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

export const enum ChatSpeechToTextState {
	/** Not recording. */
	Idle = 'idle',
	/** Capturing microphone audio and streaming it for transcription. */
	Recording = 'recording',
	/** Recording stopped, awaiting the final transcript. */
	Transcribing = 'transcribing',
}

export interface IChatSpeechToTextService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeState: Event<ChatSpeechToTextState>;
	readonly state: ChatSpeechToTextState;

	/**
	 * Fires with the cumulative transcript while recording, so callers can
	 * render dictation live as the user speaks. The value grows monotonically
	 * (finalized utterances plus any in-progress delta).
	 */
	readonly onDidUpdateTranscript: Event<string>;

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
	 * Begin capturing microphone audio in the given window and streaming it to
	 * the on-device transcription model. Rejects if the microphone cannot be
	 * accessed.
	 */
	start(window: Window & typeof globalThis): Promise<void>;

	/**
	 * Stop capturing, flush the final utterance, and resolve with the complete
	 * cumulative transcript (or `undefined` when nothing was transcribed).
	 */
	stopAndTranscribe(): Promise<string | undefined>;

	/** Abort an in-progress recording without keeping the transcript. */
	cancel(): void;
}

export class ChatSpeechToTextService extends Disposable implements IChatSpeechToTextService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeState = this._register(new Emitter<ChatSpeechToTextState>());
	readonly onDidChangeState = this._onDidChangeState.event;

	private readonly _onDidUpdateTranscript = this._register(new Emitter<string>());
	readonly onDidUpdateTranscript = this._onDidUpdateTranscript.event;

	private readonly _onDidChangePreparingModel = this._register(new Emitter<boolean>());
	readonly onDidChangePreparingModel = this._onDidChangePreparingModel.event;

	private _isPreparingModel = false;
	get isPreparingModel(): boolean {
		return this._isPreparingModel;
	}

	/**
	 * Active download-progress notification, shown while the on-device model is
	 * downloading to disk. `report` drives the progress bar, `complete` resolves
	 * the backing task so the notification dismisses. `lastReported` is the last
	 * percentage pushed, so we can translate absolute progress into increments.
	 */
	private _downloadNotification: { readonly report: IProgress<IProgressStep>; readonly complete: () => void; lastReported: number } | undefined;

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
	private _processorNode: ScriptProcessorNode | undefined;

	private readonly _localSessionDisposables = this._register(new DisposableStore());

	get isConfigured(): boolean {
		if (this._configurationService.getValue<boolean>(ENABLED_SETTING) === false) {
			return false;
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
	private _sessionErrorCode = '';

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
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
	) {
		super();
		this._recordingContextKey = ChatContextKeys.speechToTextRecording.bindTo(contextKeyService);
		this._configuredContextKey = ChatContextKeys.speechToTextConfigured.bindTo(contextKeyService);
		this._preparingContextKey = ChatContextKeys.speechToTextPreparing.bindTo(contextKeyService);
		this._updateConfiguredContextKey();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ENABLED_SETTING)) {
				this._updateConfiguredContextKey();
			}
		}));
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
		this._onDidChangePreparingModel.fire(preparing);
	}

	private _logSessionTelemetry(outcome: 'completed' | 'cancelled' | 'error'): void {
		if (this._sessionStartMs === 0) {
			return;
		}
		const durationMs = Date.now() - this._sessionStartMs;
		this._telemetryService.publicLog2<SpeechToTextSessionEvent, SpeechToTextSessionClassification>('chatSpeechToText.session', {
			outcome,
			mode: this._getDictationMode(),
			durationMs,
			segments: this._sessionSegments,
			transcriptLength: this._transcript.length,
			errorCode: this._sessionErrorCode,
		});
		this._sessionStartMs = 0;
	}

	/**
	 * Read the configured dictation shortcut mode for telemetry, normalizing any
	 * unexpected value to the `auto` default so the event stays low-cardinality.
	 */
	private _getDictationMode(): string {
		const value = this._configurationService.getValue<string>(MODE_SETTING);
		return value === 'toggle' || value === 'pushToTalk' ? value : 'auto';
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

	async start(window: Window & typeof globalThis): Promise<void> {
		if (this._state !== ChatSpeechToTextState.Idle) {
			return;
		}

		if (this._configurationService.getValue<boolean>(ENABLED_SETTING) === false) {
			return;
		}

		if (!this._localTranscription.isSupported) {
			this._notificationService.notify({
				severity: Severity.Warning,
				message: localize('chatStt.notSupported', "On-device speech-to-text is not available on this platform."),
			});
			return;
		}

		this._sessionStartMs = Date.now();
		this._sessionSegments = 0;
		this._sessionErrorCode = '';

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

		this._finalizedText = '';
		this._deltaText = '';
		this._mediaStream = stream;

		try {
			await this._startLocalSession();
		} catch (err) {
			this._teardown();
			this._sessionErrorCode = this._sessionErrorCode || 'connect';
			this._logSessionTelemetry('error');
			this._logService.error('[chat-stt] failed to start transcription', err);
			this._notificationService.error(localize('chatStt.connectError', "Could not start speech-to-text: {0}", toErrorMessage(err)));
			throw err;
		}

		try {
			this._startCapture(window, stream);
		} catch (err) {
			// Capture setup (AudioContext/nodes) can fail after the mic and the
			// utility-process session are already live; make sure both are torn
			// down instead of leaking an active recording in the Idle state.
			this._localTranscription.cancel();
			this._teardown();
			this._sessionErrorCode = this._sessionErrorCode || 'capture';
			this._logSessionTelemetry('error');
			this._logService.error('[chat-stt] failed to start audio capture', err);
			this._notificationService.error(localize('chatStt.captureError', "Could not start audio capture for speech-to-text: {0}", toErrorMessage(err)));
			throw err;
		}
		this._setState(ChatSpeechToTextState.Recording);
		this._accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStarted);
	}

	/**
	 * Begin an on-device transcription session in the utility process and pipe
	 * its interim/final results onto the shared cumulative-transcript surface.
	 */
	private async _startLocalSession(): Promise<void> {
		const local = this._localTranscription;
		this._localSessionDisposables.add(local.onDidTranscribe(result => {
			// The local service returns the full cumulative transcript each time.
			this._finalizedText = result.text;
			this._deltaText = '';
			if (!result.isFinal) {
				this._sessionSegments++;
			}
			this._onDidUpdateTranscript.fire(this._transcript);
		}));
		const cacheDir = joinPath(this._environmentService.cacheHome, 'chatDictationModels').fsPath;
		await local.start({ cacheDir });

		// The model loads in the utility process in the background (start()
		// returns immediately). On first use it may download hundreds of MB, so
		// surface progress until it is ready; recording proceeds meanwhile and
		// interim transcripts begin once the model finishes loading.
		const status = await local.getModelStatus();
		if (status.state !== LocalTranscriptionModelState.Ready && status.state !== LocalTranscriptionModelState.Error) {
			this._trackModelPreparation();
		}
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
		this._localSessionDisposables.add(toDisposable(() => this._completeDownloadNotification()));
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
	 * Drive the spinner, download notification, and error handling from a model
	 * status. Safe to call repeatedly and from both the status snapshot and the
	 * change listener, since the notification and preparing-state updates are
	 * idempotent.
	 */
	private _handleModelStatus(status: ILocalTranscriptionModelStatus): void {
		this._updateDownloadNotification(status);
		if (status.state === LocalTranscriptionModelState.Ready) {
			this._logModelPrepareTelemetry(status);
			this._setPreparingModel(false);
		} else if (status.state === LocalTranscriptionModelState.Error) {
			this._logModelPrepareTelemetry(status);
			this._setPreparingModel(false);
			this._failSession('model', localize('chatStt.modelError', "On-device speech-to-text model failed to load: {0}", status.error ?? ''));
		}
	}

	/**
	 * Show a progress notification while the model is downloading, updating its
	 * progress bar as bytes arrive, and dismiss it as soon as the model leaves
	 * the `Downloading` state (loading into memory, ready, or errored).
	 */
	private _updateDownloadNotification(status: ILocalTranscriptionModelStatus): void {
		if (status.state !== LocalTranscriptionModelState.Downloading) {
			this._completeDownloadNotification();
			return;
		}
		if (!this._downloadNotification) {
			const deferred = new DeferredPromise<void>();
			let report: IProgress<IProgressStep> = Progress.None;
			this._progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('chatStt.downloadingModel', "Downloading speech-to-text model…"),
				delay: 500,
			}, progress => {
				report = progress;
				return deferred.p;
			});
			this._downloadNotification = { report, complete: () => deferred.complete(), lastReported: 0 };
		}
		if (typeof status.progress === 'number') {
			const percent = Math.max(0, Math.min(100, Math.round(status.progress * 100)));
			const increment = percent - this._downloadNotification.lastReported;
			if (increment > 0) {
				this._downloadNotification.report.report({ increment, total: 100 });
				this._downloadNotification.lastReported = percent;
			}
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
		this._localTranscription.cancel();
		this._teardown();
		this._finalizedText = '';
		this._deltaText = '';
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

		let text = this._transcript;
		try {
			const finalText = await this._localTranscription.stop();
			if (finalText) {
				text = finalText;
			}
		} catch (err) {
			this._sessionErrorCode = this._sessionErrorCode || 'transcribe';
			this._logService.error('[chat-stt] on-device final transcription failed', err);
		}
		this._logSessionTelemetry(this._sessionErrorCode ? 'error' : 'completed');
		this._teardown();
		this._setState(ChatSpeechToTextState.Idle);
		return text || undefined;
	}

	cancel(): void {
		const wasRecording = this._state === ChatSpeechToTextState.Recording;
		this._logSessionTelemetry('cancelled');
		this._localTranscription.cancel();
		this._teardown();
		this._finalizedText = '';
		this._deltaText = '';
		this._setState(ChatSpeechToTextState.Idle);
		if (wasRecording) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStopped);
		}
	}

	private _startCapture(window: Window & typeof globalThis, stream: MediaStream): void {
		const ctx = new window.AudioContext({ sampleRate: SAMPLE_RATE });
		this._audioContext = ctx;
		// The context is created several awaits after the user gesture (mic
		// acquisition + model startup), so it can start suspended; resume it or
		// `onaudioprocess` never fires and no audio is streamed.
		ctx.resume().catch(() => { /* ignore */ });
		const source = ctx.createMediaStreamSource(stream);
		this._sourceNode = source;

		const processor = ctx.createScriptProcessor(4096, 1, 1);
		this._processorNode = processor;

		processor.onaudioprocess = e => {
			const samples = e.inputBuffer.getChannelData(0);
			this._localTranscription.pushAudio(encodeRawPcm16Buffer(samples)).catch(err => this._onAudioPushError(err));
		};

		source.connect(processor);
		processor.connect(ctx.destination);
	}

	private _stopCapture(): void {
		if (this._processorNode) {
			this._processorNode.onaudioprocess = null;
			try { this._processorNode.disconnect(); } catch { /* ignore */ }
			this._processorNode = undefined;
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
