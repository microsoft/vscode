/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRecordingData, IRecordingService, RecordingState } from '../browser/recordingService.js';

const MAX_DURATION_SECONDS = 30;

export class NativeRecordingService extends Disposable implements IRecordingService {
	readonly _serviceBrand: undefined;
	readonly isSupported = true;
	readonly maxDurationSeconds = MAX_DURATION_SECONDS;

	private _state = RecordingState.Idle;
	private readonly _onDidChangeState = this._register(new Emitter<RecordingState>());
	readonly onDidChangeState: Event<RecordingState> = this._onDidChangeState.event;

	private mediaRecorder: MediaRecorder | undefined;
	private mediaStream: MediaStream | undefined;
	private chunks: Blob[] = [];
	private startTime = 0;
	private maxDurationTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(toDisposable(() => this.cleanup()));
	}

	get state(): RecordingState {
		return this._state;
	}

	private setState(state: RecordingState): void {
		if (this._state !== state) {
			this._state = state;
			this._onDidChangeState.fire(state);
		}
	}

	getSupportedFormats(): { mimeType: string; label: string; extension: string }[] {
		const formats: { mimeType: string; label: string; extension: string }[] = [];
		if (typeof MediaRecorder !== 'undefined') {
			if (MediaRecorder.isTypeSupported('video/mp4')) {
				formats.push({ mimeType: 'video/mp4', label: 'MP4', extension: 'mp4' });
			}
			if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
				formats.push({ mimeType: 'video/webm;codecs=vp9', label: 'WebM', extension: 'webm' });
			} else if (MediaRecorder.isTypeSupported('video/webm')) {
				formats.push({ mimeType: 'video/webm', label: 'WebM', extension: 'webm' });
			}
		}
		return formats;
	}

	async startRecording(preferredMimeType?: string): Promise<void> {
		if (this._state === RecordingState.Recording) {
			throw new Error('Recording already in progress.');
		}

		this.cleanup();

		try {
			// Use getDisplayMedia — on Electron desktop this shows the system source picker
			this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
				audio: false,
			});
		} catch (err) {
			this.logService.error('[RecordingService] Failed to get display media:', err);
			throw new Error('Failed to start recording. The user may have cancelled the source picker.');
		}

		// Select mime type: prefer caller's choice, fall back to best available
		let mimeType: string;
		if (preferredMimeType && MediaRecorder.isTypeSupported(preferredMimeType)) {
			mimeType = preferredMimeType;
		} else if (MediaRecorder.isTypeSupported('video/mp4')) {
			mimeType = 'video/mp4';
		} else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
			mimeType = 'video/webm;codecs=vp9';
		} else {
			mimeType = 'video/webm';
		}

		this.chunks = [];
		this.startTime = Date.now();

		try {
			this.mediaRecorder = new MediaRecorder(this.mediaStream, {
				mimeType,
				videoBitsPerSecond: 2_500_000, // 2.5 Mbps — good quality, reasonable file size
			});
		} catch (err) {
			this.logService.error('[RecordingService] Failed to create MediaRecorder:', err);
			this.stopTracks();
			throw new Error('Failed to create media recorder.');
		}

		this.mediaRecorder.ondataavailable = e => {
			if (e.data && e.data.size > 0) {
				this.chunks.push(e.data);
			}
		};

		// If the user stops sharing via the browser/OS UI, treat it as stop
		this.mediaRecorder.onstop = () => {
			// Only move to Stopped if we were Recording (avoid double transition)
			if (this._state === RecordingState.Recording) {
				this.clearMaxDurationTimer();
				this.stopTracks();
				this.setState(RecordingState.Stopped);
			}
		};

		// Also handle the stream ending externally (user clicked "Stop sharing")
		for (const track of this.mediaStream.getTracks()) {
			track.onended = () => {
				if (this._state === RecordingState.Recording && this.mediaRecorder?.state === 'recording') {
					this.mediaRecorder.stop();
				}
			};
		}

		this.mediaRecorder.start(); // No timeslice — collect all data at stop for reliable short recordings
		this.setState(RecordingState.Recording);

		// Enforce max duration
		this.maxDurationTimer = setTimeout(() => {
			if (this._state === RecordingState.Recording) {
				this.logService.info('[RecordingService] Max recording duration reached, stopping.');
				this.mediaRecorder?.stop();
			}
		}, MAX_DURATION_SECONDS * 1000);
	}

	async stopRecording(): Promise<IRecordingData | undefined> {
		if (this._state !== RecordingState.Recording && this._state !== RecordingState.Stopped) {
			return undefined;
		}

		// If still recording, stop the recorder and wait for it to finish
		if (this._state === RecordingState.Recording && this.mediaRecorder?.state === 'recording') {
			const recorder = this.mediaRecorder;
			await new Promise<void>(resolve => {
				// Replace onstop entirely — the original handler fires setState(Stopped)
				// which would cause re-entrant calls via onDidChangeState. Since this is
				// an explicit stop, we handle state ourselves.
				recorder.onstop = () => {
					resolve();
				};
				// Flush any buffered data before stopping
				recorder.requestData();
				recorder.stop();
			});
		}

		this.clearMaxDurationTimer();
		this.stopTracks();

		if (this.chunks.length === 0) {
			this._state = RecordingState.Idle;
			return undefined;
		}

		const mimeType = this.mediaRecorder?.mimeType ?? 'video/webm';
		const blob = new Blob(this.chunks, { type: mimeType });
		const durationMs = Date.now() - this.startTime;

		const data: IRecordingData = {
			blob,
			mimeType,
			durationMs,
			sizeBytes: blob.size,
		};

		this.chunks = [];
		this.mediaRecorder = undefined;
		// Don't fire a state change here — the caller controls the UI state
		// (e.g. showing "Save/Discard" in Stopped, or going back to Idle).
		this._state = RecordingState.Idle;

		return data;
	}

	discardRecording(): void {
		if (this._state === RecordingState.Recording && this.mediaRecorder?.state === 'recording') {
			this.mediaRecorder.onstop = null; // Prevent state transition
			this.mediaRecorder.stop();
		}
		this.cleanup();
		this.setState(RecordingState.Idle);
	}

	private stopTracks(): void {
		if (this.mediaStream) {
			for (const track of this.mediaStream.getTracks()) {
				track.stop();
			}
			this.mediaStream = undefined;
		}
	}

	private clearMaxDurationTimer(): void {
		if (this.maxDurationTimer !== undefined) {
			clearTimeout(this.maxDurationTimer);
			this.maxDurationTimer = undefined;
		}
	}

	private cleanup(): void {
		this.clearMaxDurationTimer();
		this.stopTracks();
		this.chunks = [];
		this.mediaRecorder = undefined;
	}
}
