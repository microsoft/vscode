/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IAudioCaptureLeaseService } from '../voiceClient/audioCaptureLeaseService.js';
import { getTranscriptionWebSocketUrl } from '../voiceClient/voiceEndpoint.js';
import { IDictationAudioCapture, IDictationAudioCaptureFactory } from './dictationAudioCapture.js';
import { IVoiceCodeTranscriptionClient, IVoiceCodeTranscriptionError } from './voiceCodeTranscriptionClient.js';

const FINAL_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 15_000;
const GITHUB_PROVIDER_ID = 'github';
const GITHUB_EMAIL_SCOPE = 'user:email';

export const IRemoteChatSpeechToTextService = createDecorator<IRemoteChatSpeechToTextService>('remoteChatSpeechToTextService');

export const enum RemoteChatSpeechToTextState {
	Idle = 'idle',
	Starting = 'starting',
	Recording = 'recording',
	Finalizing = 'finalizing',
}

export interface IRemoteChatSpeechToTextService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeState: Event<RemoteChatSpeechToTextState>;
	readonly onDidUpdateTranscript: Event<string>;
	readonly onDidFail: Event<void>;
	readonly state: RemoteChatSpeechToTextState;
	readonly isConfigured: boolean;
	start(window: Window & typeof globalThis): Promise<void>;
	stopAndTranscribe(): Promise<string | undefined>;
	cancel(): void;
}

type RemoteDictationEvent = {
	action: 'start' | 'stop' | 'success' | 'cancel' | 'error';
	errorCode: string;
	connectLatencyMs: number;
	firstPartialLatencyMs: number;
	finalLatencyMs: number;
};

type RemoteDictationClassification = {
	owner: 'meganrogge';
	comment: 'Tracks remote chat-input dictation usage, reliability, and latency without transcript content.';
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The remote dictation lifecycle action.' };
	errorCode: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'A categorized error code, or empty when successful.' };
	connectLatencyMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds spent connecting and initializing the transcription session.' };
	firstPartialLatencyMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from recording start to the first accepted partial transcript.' };
	finalLatencyMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from stop request to authoritative final transcript.' };
};

export class RemoteChatSpeechToTextService extends Disposable implements IRemoteChatSpeechToTextService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeState = this._register(new Emitter<RemoteChatSpeechToTextState>());
	readonly onDidChangeState = this._onDidChangeState.event;

	private readonly _onDidUpdateTranscript = this._register(new Emitter<string>());
	readonly onDidUpdateTranscript = this._onDidUpdateTranscript.event;

	private readonly _onDidFail = this._register(new Emitter<void>());
	readonly onDidFail = this._onDidFail.event;

	private readonly _audioCapture: IDictationAudioCapture;
	private readonly _audioLease = this._register(new MutableDisposable<IDisposable>());
	private _finalResult: DeferredPromise<string | undefined> | undefined;
	private _state = RemoteChatSpeechToTextState.Idle;
	private _turnId: string | undefined;
	private _operationId = 0;
	private _startInProgress = false;
	private _stopPromise: Promise<string | undefined> | undefined;
	private _recordingStartedAt = 0;
	private _stopRequestedAt = 0;
	private _connectLatencyMs = 0;
	private _firstPartialLatencyMs = 0;

	get state(): RemoteChatSpeechToTextState {
		return this._state;
	}

	get isConfigured(): boolean {
		return !!getTranscriptionWebSocketUrl(this._configurationService, this._productService);
	}

	constructor(
		@IDictationAudioCaptureFactory audioCaptureFactory: IDictationAudioCaptureFactory,
		@IVoiceCodeTranscriptionClient private readonly _client: IVoiceCodeTranscriptionClient,
		@IAudioCaptureLeaseService private readonly _audioCaptureLeaseService: IAudioCaptureLeaseService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IProductService private readonly _productService: IProductService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._audioCapture = this._register(audioCaptureFactory.create());
		this._register(this._audioCapture.onAudioChunk(audio => {
			if ((this._state === RemoteChatSpeechToTextState.Recording || this._state === RemoteChatSpeechToTextState.Finalizing) && this._turnId) {
				this._client.sendPttAudioChunk(this._turnId, audio);
			}
		}));
		this._register(this._client.onTranscription(result => {
			if (result.turnId !== this._turnId) {
				return;
			}
			if (result.status === 'partial') {
				if (!this._firstPartialLatencyMs && this._recordingStartedAt) {
					this._firstPartialLatencyMs = Date.now() - this._recordingStartedAt;
				}
				this._onDidUpdateTranscript.fire(result.text);
				return;
			}
			this._finalResult?.complete(result.text);
		}));
		this._register(this._client.onError(error => this._handleServerError(error)));
		this._register(this._client.onDidClose(() => {
			if (this._state !== RemoteChatSpeechToTextState.Idle) {
				this._fail('connectionLost', localize('chatDictation.connectionLost', "Dictation disconnected before transcription completed."));
			}
		}));
	}

	async start(window: Window & typeof globalThis): Promise<void> {
		if (this._state !== RemoteChatSpeechToTextState.Idle || this._startInProgress || this._stopPromise) {
			return;
		}
		if (!this.isConfigured) {
			throw new Error('Remote dictation is not configured');
		}
		const lease = this._audioCaptureLeaseService.acquire('chat-dictation');
		if (!lease) {
			this._notificationService.warn(localize('chatDictation.audioBusy', "Finish Voice Mode or the other dictation before starting dictation."));
			throw new Error('Audio capture is busy');
		}
		this._audioLease.value = lease;
		this._startInProgress = true;
		const operationId = ++this._operationId;
		this._setState(RemoteChatSpeechToTextState.Starting);
		this._logTelemetry('start');

		try {
			const token = await this._getGitHubToken();
			if (operationId !== this._operationId) {
				return;
			}
			const connectStartedAt = Date.now();
			await this._withTimeout(this._client.connect(window, token), CONNECT_TIMEOUT_MS, 'connect');
			await this._withTimeout(this._client.startSession(), CONNECT_TIMEOUT_MS, 'session initialization');
			this._connectLatencyMs = Date.now() - connectStartedAt;
			if (operationId !== this._operationId) {
				return;
			}
			await this._audioCapture.acquire(window);
			if (operationId !== this._operationId) {
				return;
			}
			this._turnId = generateUuid();
			this._client.sendPttStart(this._turnId);
			this._audioCapture.start();
			this._recordingStartedAt = Date.now();
			this._setState(RemoteChatSpeechToTextState.Recording);
			this._accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStarted);
		} catch (error) {
			if (operationId === this._operationId) {
				const message = microphoneErrorMessage(error) ?? localize('chatDictation.startError', "Could not start dictation.");
				this._fail('start', message);
				throw error;
			}
		} finally {
			this._startInProgress = false;
		}
	}

	async stopAndTranscribe(): Promise<string | undefined> {
		if (this._stopPromise) {
			return this._stopPromise;
		}
		const stop = this._stopAndTranscribe();
		this._stopPromise = stop;
		try {
			return await stop;
		} finally {
			if (this._stopPromise === stop) {
				this._stopPromise = undefined;
			}
		}
	}

	private async _stopAndTranscribe(): Promise<string | undefined> {
		if (this._state !== RemoteChatSpeechToTextState.Recording || !this._turnId) {
			return undefined;
		}
		this._setState(RemoteChatSpeechToTextState.Finalizing);
		this._stopRequestedAt = Date.now();
		this._logTelemetry('stop');
		this._accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStopped);

		const turnId = this._turnId;
		const finalResult = new DeferredPromise<string | undefined>();
		this._finalResult = finalResult;
		try {
			await this._audioCapture.stop();
			this._client.sendPttEnd(turnId);
			const text = await raceTimeout(finalResult.p, FINAL_TIMEOUT_MS);
			if (text === undefined) {
				throw new Error('Timed out waiting for final transcription');
			}
			this._logTelemetry('success', '', Date.now() - this._stopRequestedAt);
			return text.trim() ? text : undefined;
		} catch (error) {
			this._fail('final', localize('chatDictation.finalError', "Dictation did not receive a final transcription."));
			throw error;
		} finally {
			this._cleanup();
		}
	}

	cancel(): void {
		if (this._state === RemoteChatSpeechToTextState.Idle) {
			return;
		}
		this._operationId++;
		this._logTelemetry('cancel');
		if (this._state === RemoteChatSpeechToTextState.Recording) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStopped);
		}
		this._cleanup();
	}

	private async _getGitHubToken(): Promise<string> {
		const sessions = await this._authenticationService.getSessions(GITHUB_PROVIDER_ID, undefined, undefined, true);
		const session = sessions.find(candidate => candidate.scopes.includes(GITHUB_EMAIL_SCOPE))
			?? await this._authenticationService.createSession(GITHUB_PROVIDER_ID, [GITHUB_EMAIL_SCOPE]);
		if (!session.accessToken) {
			throw new Error('GitHub authentication did not return an access token');
		}
		return session.accessToken;
	}

	private _handleServerError(error: IVoiceCodeTranscriptionError): void {
		if (error.turnId && error.turnId !== this._turnId) {
			return;
		}
		if (!error.terminal && this._state !== RemoteChatSpeechToTextState.Starting) {
			this._notificationService.warn(error.detail);
			return;
		}
		switch (error.code) {
			case 'daily_transcription_limit_reached':
				this._fail(error.code, localize('chatDictation.dailyLimit', "You have reached today's dictation limit."));
				break;
			case 'transcription_quota_unavailable':
				this._fail(error.code, localize('chatDictation.quotaUnavailable', "Dictation quota could not be verified. Try again later."));
				break;
			default:
				this._fail(error.code ?? 'backend', localize('chatDictation.backendError', "Dictation failed: {0}", error.detail));
		}
	}

	private _fail(errorCode: string, message: string): void {
		if (this._state === RemoteChatSpeechToTextState.Idle) {
			return;
		}
		this._logService.error(`[chat-dictation] ${errorCode}`);
		this._operationId++;
		this._logTelemetry('error', errorCode);
		this._notificationService.notify({ severity: Severity.Error, message });
		this._finalResult?.error(new Error(errorCode));
		this._onDidFail.fire();
		this._cleanup();
	}

	private _cleanup(): void {
		this._audioCapture.cancel();
		this._client.disconnect();
		this._audioLease.clear();
		this._finalResult?.cancel();
		this._finalResult = undefined;
		this._turnId = undefined;
		this._setState(RemoteChatSpeechToTextState.Idle);
	}

	private _setState(state: RemoteChatSpeechToTextState): void {
		if (this._state === state) {
			return;
		}
		this._state = state;
		this._onDidChangeState.fire(state);
	}

	private async _withTimeout(promise: Promise<void>, timeoutMs: number, operation: string): Promise<void> {
		const completed = await raceTimeout(promise.then(() => true), timeoutMs);
		if (!completed) {
			this._client.disconnect();
			throw new Error(`Timed out during transcription ${operation}`);
		}
	}

	private _logTelemetry(action: RemoteDictationEvent['action'], errorCode = '', finalLatencyMs = 0): void {
		this._telemetryService.publicLog2<RemoteDictationEvent, RemoteDictationClassification>('chatSpeechToText.remote', {
			action,
			errorCode,
			connectLatencyMs: this._connectLatencyMs,
			firstPartialLatencyMs: this._firstPartialLatencyMs,
			finalLatencyMs,
		});
		if (action === 'start') {
			this._connectLatencyMs = 0;
			this._firstPartialLatencyMs = 0;
		}
	}
}

function microphoneErrorMessage(error: unknown): string | undefined {
	if (!(error instanceof DOMException)) {
		return undefined;
	}
	if (error.name === 'NotAllowedError') {
		return localize('chatDictation.permissionDenied', "Microphone access was denied. Grant microphone permission in your system settings to use dictation.");
	}
	if (error.name === 'NotFoundError') {
		return localize('chatDictation.noMicrophone', "No microphone is available for dictation.");
	}
	return undefined;
}
