/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { TimeoutTimer } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IRecordingData, IRecordingService, RecordingState, ScreenCapturePermissionStatus } from '../browser/recordingService.js';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB — GitHub upload limit
const SIZE_LIMIT_THRESHOLD = 0.9; // Stop at 90% to account for chunk overshoot
const RECORDING_OPERATION_TIMEOUT = 10_000;

export class NativeRecordingService extends Disposable implements IRecordingService {
	readonly _serviceBrand: undefined;
	get isSupported(): boolean {
		return !!this.getMediaDevices()?.getDisplayMedia && this.getSupportedFormats().length > 0;
	}

	private _state = RecordingState.Idle;
	private readonly _onDidChangeState = this._register(new Emitter<RecordingState>());
	readonly onDidChangeState: Event<RecordingState> = this._onDidChangeState.event;
	private readonly _onDidFailRecording = this._register(new Emitter<Error>());
	readonly onDidFailRecording = this._onDidFailRecording.event;

	private mediaRecorder: MediaRecorder | undefined;
	private recorderStopped = false;
	private mediaStream: MediaStream | undefined;
	private chunks: Blob[] = [];
	private bytesRecorded = 0;
	private stoppedBySize = false;
	private startTime = 0;
	private generation = 0;
	private starting = false;
	private startCompletion: { resolve(): void; reject(error: Error): void } | undefined;
	private stopCompletion: { resolve(): void; reject(error: Error): void } | undefined;
	private stopPromise: Promise<IRecordingData | undefined> | undefined;
	private readonly operationTimeout = this._register(new TimeoutTimer());

	constructor(
		@ILogService private readonly logService: ILogService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) {
		super();

		this._register(toDisposable(() => this.discardRecording()));
	}

	getScreenCapturePermissionStatus(): Promise<ScreenCapturePermissionStatus> {
		return this.nativeHostService.getMediaAccessStatus('screen');
	}

	requestScreenCapturePermission(): Promise<boolean> {
		return this.nativeHostService.requestScreenCaptureAccess();
	}

	async openScreenCapturePermissionSettings(): Promise<void> {
		if (isMacintosh) {
			// Deep-link to the Screen Recording pane in macOS Privacy & Security.
			await this.nativeHostService.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
		}
	}

	get state(): RecordingState {
		return this._state;
	}

	protected getMediaRecorderConstructor(): typeof MediaRecorder | undefined {
		return typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder;
	}

	protected getMediaDevices(): MediaDevices | undefined {
		return typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
	}

	protected canPlayType(mimeType: string): boolean {
		return mainWindow.document.createElement('video').canPlayType(mimeType) !== '';
	}

	private isFormatSupported(MediaRecorder: typeof globalThis.MediaRecorder, mimeType: string): boolean {
		return MediaRecorder.isTypeSupported(mimeType) && this.canPlayType(mimeType);
	}

	private setState(state: RecordingState): void {
		if (this._state !== state) {
			this._state = state;
			this._onDidChangeState.fire(state);
		}
	}

	getSupportedFormats(): { mimeType: string; label: string; extension: string }[] {
		const formats: { mimeType: string; label: string; extension: string }[] = [];
		const MediaRecorder = this.getMediaRecorderConstructor();
		if (MediaRecorder) {
			if (this.isFormatSupported(MediaRecorder, 'video/mp4')) {
				formats.push({ mimeType: 'video/mp4', label: 'MP4', extension: 'mp4' });
			}
			if (this.isFormatSupported(MediaRecorder, 'video/webm;codecs=vp9')) {
				formats.push({ mimeType: 'video/webm;codecs=vp9', label: 'WebM', extension: 'webm' });
			} else if (this.isFormatSupported(MediaRecorder, 'video/webm')) {
				formats.push({ mimeType: 'video/webm', label: 'WebM', extension: 'webm' });
			}
		}
		return formats;
	}

	async startRecording(preferredMimeType?: string): Promise<void> {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const MediaRecorder = this.getMediaRecorderConstructor();
		const mediaDevices = this.getMediaDevices();
		const supportedFormats = this.getSupportedFormats();
		if (!MediaRecorder || !mediaDevices?.getDisplayMedia || !supportedFormats.length) {
			throw new Error(localize('recordingUnsupported', "Screen recording is not supported in this environment."));
		}
		if (this.starting || this.stopPromise || this._state === RecordingState.Recording) {
			throw new Error(localize('recordingInProgress', "A recording is already in progress."));
		}

		this.cleanup();
		this.setState(RecordingState.Idle);
		const generation = this.generation;
		this.starting = true;

		try {
			// The main-process display-media handler selects the screen containing the requesting window.
			const stream = await mediaDevices.getDisplayMedia({ video: true, audio: false });
			if (generation !== this.generation) {
				this.releaseStream(stream);
				throw new CancellationError();
			}
			this.mediaStream = stream;
			if (!stream.getVideoTracks().some(track => track.readyState === 'live')) {
				throw new Error(localize('recordingNoLiveTrack', "No live screen capture source is available. Try recording again."));
			}

			const mimeType = preferredMimeType && this.isFormatSupported(MediaRecorder, preferredMimeType) ? preferredMimeType : supportedFormats[0].mimeType;
			const recorder = this.mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });

			recorder.ondataavailable = e => {
				if (this.mediaRecorder !== recorder || !e.data?.size) {
					return;
				}
				this.chunks.push(e.data);
				this.bytesRecorded += e.data.size;
				if (!this.stoppedBySize && this.bytesRecorded >= MAX_FILE_SIZE_BYTES * SIZE_LIMIT_THRESHOLD && recorder.state === 'recording') {
					this.stoppedBySize = true;
					this.stopRecorder(recorder);
				}
			};
			recorder.onstop = () => {
				if (this.mediaRecorder !== recorder) {
					return;
				}
				this.operationTimeout.cancel();
				this.recorderStopped = true;
				this.stopTracks();
				if (this.startCompletion) {
					this.startCompletion.reject(new Error(localize('recordingEndedBeforeStart', "Screen capture ended before recording could start. Try again.")));
				} else if (this.stopCompletion) {
					this.stopCompletion.resolve();
				} else if (this._state === RecordingState.Recording) {
					this.setState(RecordingState.Stopped);
				}
			};
			recorder.onerror = event => this.handleRecordingError(recorder, event.error);
			for (const track of stream.getTracks()) {
				track.onended = () => this.stopRecorder(recorder);
			}
			await new Promise<void>((resolve, reject) => {
				this.startCompletion = { resolve, reject };
				this.operationTimeout.cancelAndSet(() => reject(new Error(localize('recordingStartTimeout', "Screen recording did not start. Try again."))), RECORDING_OPERATION_TIMEOUT);
				recorder.onstart = () => {
					if (this.mediaRecorder !== recorder) {
						return;
					}
					this.operationTimeout.cancel();
					this.startCompletion = undefined;
					resolve();
				};
				recorder.start(1000);
			});
			if (generation !== this.generation) {
				throw new CancellationError();
			}
			if (recorder.state !== 'recording' || !stream.getVideoTracks().some(track => track.readyState === 'live')) {
				throw new Error(localize('recordingEndedDuringStart', "Screen capture ended while starting the recording. Try again."));
			}
			this.starting = false;
			this.startTime = Date.now();
			this.setState(RecordingState.Recording);
		} catch (error) {
			const cancelled = generation !== this.generation;
			if (!cancelled) {
				this.discardRecording();
			}
			if (cancelled || isCancellationError(error)) {
				throw new CancellationError();
			}
			this.logService.error('[RecordingService] Failed to start recording:', error);
			throw new Error(localize('recordingStartFailed', "Unable to start screen recording. Try again."), { cause: error });
		}
	}

	stopRecording(): Promise<IRecordingData | undefined> {
		if (this.stopPromise) {
			return this.stopPromise;
		}
		if (this.starting) {
			this.discardRecording();
			return Promise.resolve(undefined);
		}
		if (this._state !== RecordingState.Recording && this._state !== RecordingState.Stopped) {
			return Promise.resolve(undefined);
		}
		const promise = this.finishRecording();
		this.stopPromise = promise;
		const clear = () => {
			if (this.stopPromise === promise) {
				this.stopPromise = undefined;
			}
		};
		void promise.then(clear, clear);
		return promise;
	}

	private async finishRecording(): Promise<IRecordingData | undefined> {
		const generation = this.generation;
		const recorder = this.mediaRecorder;
		try {
			if (recorder && !this.recorderStopped) {
				await new Promise<void>((resolve, reject) => {
					this.stopCompletion = { resolve, reject };
					this.operationTimeout.cancelAndSet(() => reject(new Error(localize('recordingStopTimeout', "Screen recording did not finish. Try recording again."))), RECORDING_OPERATION_TIMEOUT);
					if (recorder.state !== 'inactive') {
						recorder.requestData();
						this.stopRecorder(recorder);
					}
				});
			}
			if (generation !== this.generation) {
				return undefined;
			}
			if (!this.chunks.length) {
				throw new Error(localize('recordingEmpty', "No video was captured. Try recording again."));
			}
			const mimeType = recorder?.mimeType ?? 'video/webm';
			const blob = new Blob(this.chunks, { type: mimeType });
			return {
				blob, mimeType, durationMs: Date.now() - this.startTime,
				sizeBytes: blob.size, stoppedBySize: this.stoppedBySize,
			};
		} finally {
			if (generation === this.generation) {
				this.discardRecording();
			}
		}
	}

	private stopRecorder(recorder: MediaRecorder): void {
		if (this.mediaRecorder !== recorder || recorder.state === 'inactive') {
			return;
		}
		try {
			recorder.stop();
		} catch (error) {
			this.handleRecordingError(recorder, error);
		}
	}

	private handleRecordingError(recorder: MediaRecorder, cause: unknown): void {
		if (this.mediaRecorder !== recorder) {
			return;
		}
		this.logService.error('[RecordingService] Recorder failed:', cause);
		const error = new Error(localize('recordingInterrupted', "Screen recording failed. Try recording again."), { cause });
		if (this.startCompletion) {
			this.startCompletion.reject(error);
		} else if (this.stopCompletion) {
			this.stopCompletion.reject(error);
		} else {
			this.discardRecording();
			this._onDidFailRecording.fire(error);
		}
	}

	discardRecording(): void {
		this.cleanup();
		this.setState(RecordingState.Idle);
	}

	private releaseStream(stream: MediaStream): void {
		for (const track of stream.getTracks()) {
			track.onended = null;
			track.stop();
		}
	}

	private stopTracks(): void {
		if (this.mediaStream) {
			this.releaseStream(this.mediaStream);
			this.mediaStream = undefined;
		}
	}

	private cleanup(): void {
		this.generation++;
		this.starting = false;
		this.operationTimeout.cancel();
		this.startCompletion?.reject(new CancellationError());
		this.startCompletion = undefined;
		this.stopCompletion?.resolve();
		this.stopCompletion = undefined;
		const recorder = this.mediaRecorder;
		this.mediaRecorder = undefined;
		this.recorderStopped = false;
		if (recorder) {
			recorder.onstart = null;
			recorder.ondataavailable = null;
			recorder.onstop = null;
			recorder.onerror = null;
			if (recorder.state !== 'inactive') {
				try {
					recorder.stop();
				} catch (error) {
					this.logService.error('[RecordingService] Failed to stop recorder:', error);
				}
			}
		}
		this.stopTracks();
		this.chunks = [];
		this.bytesRecorded = 0;
		this.stoppedBySize = false;
	}
}
