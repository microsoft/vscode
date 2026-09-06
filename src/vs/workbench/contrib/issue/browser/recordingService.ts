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
	/** True if the recording was automatically stopped because it hit the file size limit. */
	readonly stoppedBySize?: boolean;
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

	/**
	 * Returns the list of supported recording MIME types on this platform.
	 */
	getSupportedFormats(): { mimeType: string; label: string; extension: string }[];

	/**
	 * Start recording the current window.
	 * @param mimeType Optional preferred MIME type (e.g. 'video/mp4'). Falls back to default if unsupported.
	 * Rejects if recording is not supported or already in progress.
	 */
	startRecording(mimeType?: string): Promise<void>;

	/**
	 * Stop the current recording.
	 * Returns the recorded data, or undefined if no recording was in progress.
	 */
	stopRecording(): Promise<IRecordingData | undefined>;

	/**
	 * Discard the current recording without saving.
	 */
	discardRecording(): void;

	/**
	 * Returns the current OS screen-capture permission status. On platforms where this
	 * concept doesn't apply (e.g. web) implementations return 'granted' so callers can
	 * proceed straight to the recording flow.
	 */
	getScreenCapturePermissionStatus(): Promise<'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'>;

	/**
	 * Opens the OS-level UI for granting screen-capture permission. No-op on platforms
	 * where this isn't applicable.
	 */
	openScreenCapturePermissionSettings(): void;
}

/**
 * Browser fallback — recording not available in web.
 */
export class BrowserRecordingService implements IRecordingService {
	readonly _serviceBrand: undefined;
	readonly isSupported = false;
	readonly state = RecordingState.Idle;
	readonly onDidChangeState = Event.None;

	getSupportedFormats(): { mimeType: string; label: string; extension: string }[] {
		return [];
	}

	async startRecording(_mimeType?: string): Promise<void> {
		throw new Error('Recording is not supported in web browsers.');
	}

	async stopRecording(): Promise<IRecordingData | undefined> {
		return undefined;
	}

	discardRecording(): void {
		// No-op
	}

	async getScreenCapturePermissionStatus(): Promise<'granted'> {
		return 'granted';
	}

	openScreenCapturePermissionSettings(): void {
		// No-op
	}
}
