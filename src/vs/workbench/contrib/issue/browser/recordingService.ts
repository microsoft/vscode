/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IRecordingData {
	/** The raw video data as a Blob. */
	readonly blob: Blob;
	/** MIME type of the recording, e.g. 'video/webm'. */
	readonly mimeType: string;
	/** Duration in milliseconds. */
	readonly durationMs: number;
	/** File size in bytes. */
	readonly sizeBytes: number;
}

export const enum RecordingState {
	Idle = 'idle',
	Recording = 'recording',
	Stopped = 'stopped',
}

export const IRecordingService = createDecorator<IRecordingService>('recordingService');

export interface IRecordingService {
	readonly _serviceBrand: undefined;

	/** Whether recording is supported on this platform. */
	readonly isSupported: boolean;

	/** Current recording state. */
	readonly state: RecordingState;

	/** Fires when recording state changes. */
	readonly onDidChangeState: Event<RecordingState>;

	/** Maximum recording duration in seconds. */
	readonly maxDurationSeconds: number;

	/**
	 * Returns the list of supported recording MIME types on this platform.
	 */
	getSupportedFormats(): { mimeType: string; label: string; extension: string }[];

	/**
	 * Start recording the current window.
	 * @param mimeType Optional preferred MIME type (e.g. 'video/mp4'). Falls back to default if unsupported.
	 * @param cropElement Optional DOM element to crop the recording to (uses Region Capture API).
	 * Rejects if recording is not supported or already in progress.
	 */
	startRecording(mimeType?: string, cropElement?: HTMLElement): Promise<void>;

	/**
	 * Stop the current recording.
	 * Returns the recorded data, or undefined if no recording was in progress.
	 */
	stopRecording(): Promise<IRecordingData | undefined>;

	/**
	 * Discard the current recording without saving.
	 */
	discardRecording(): void;
}

/**
 * Browser fallback — recording not available in web.
 */
export class BrowserRecordingService implements IRecordingService {
	readonly _serviceBrand: undefined;
	readonly isSupported = false;
	readonly state = RecordingState.Idle;
	readonly maxDurationSeconds = 0;
	readonly onDidChangeState = Event.None;

	getSupportedFormats(): { mimeType: string; label: string; extension: string }[] {
		return [];
	}

	async startRecording(_mimeType?: string, _cropElement?: HTMLElement): Promise<void> {
		throw new Error('Recording is not supported in web browsers.');
	}

	async stopRecording(): Promise<IRecordingData | undefined> {
		return undefined;
	}

	discardRecording(): void {
		// No-op
	}
}
