/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { localize } from '../../../../../nls.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ILocalTranscriptionService, LocalTranscriptionModelState } from '../../../../../platform/localTranscription/common/localTranscription.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { AgentsVoiceStorageKeys } from '../../../agentsVoice/common/agentsVoice.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

export const IChatSpeechToTextService = createDecorator<IChatSpeechToTextService>('chatSpeechToTextService');

/** Sample rate (Hz) of the PCM16 audio streamed to the transcription backend. */
const SAMPLE_RATE = 16000;

/** Setting that enables the dictation feature; a kill-switch for rollout. */
const ENABLED_SETTING = 'chat.speechToText.enabled';
/** On-device Whisper model to use for dictation. */
const MODEL_SETTING = 'chat.speechToText.model';

type SpeechToTextSessionEvent = {
	outcome: 'completed' | 'cancelled' | 'error';
	durationMs: number;
	segments: number;
	transcriptLength: number;
	errorCode: string;
};
type SpeechToTextSessionClassification = {
	owner: 'meganrogge';
	comment: 'Tracks usage and reliability of chat-input dictation (speech-to-text).';
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the dictation session ended.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Recording duration in milliseconds.' };
	segments: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Number of transcript segments returned.' };
	transcriptLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Character length of the final transcript.' };
	errorCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Short error identifier when the session failed, else empty.' };
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

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
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
			durationMs,
			segments: this._sessionSegments,
			transcriptLength: this._transcript.length,
			errorCode: this._sessionErrorCode,
		});
		this._sessionStartMs = 0;
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
	 * model is ready. Intentionally silent — the spinner in place of the mic is
	 * the only progress affordance; no notification is shown. Recording proceeds
	 * meanwhile and interim transcripts begin once the model finishes loading.
	 */
	private _trackModelPreparation(): void {
		this._setPreparingModel(true);
		this._localSessionDisposables.add(this._localTranscription.onDidChangeModelStatus(status => {
			if (status.state === LocalTranscriptionModelState.Ready) {
				this._setPreparingModel(false);
			} else if (status.state === LocalTranscriptionModelState.Error) {
				this._setPreparingModel(false);
				this._failSession('model', localize('chatStt.modelError', "On-device speech-to-text model failed to load: {0}", status.error ?? ''));
			}
		}));
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
