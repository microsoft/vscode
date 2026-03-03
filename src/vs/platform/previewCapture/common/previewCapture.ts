/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IPreviewCaptureService = createDecorator<IPreviewCaptureService>('previewCaptureService');

export interface ClipThumbnail {
	index: number;
	timestamp: number;
	preview: string;   // base64 JPEG data URL (~160px for main view)
	strip: string;     // base64 JPEG data URL (~64px for filmstrip)
}

export interface IPreviewCaptureService {
	readonly _serviceBrand: undefined;

	/** Capture a screenshot of the page loaded from the given proxy port. */
	screenshot(proxyPort: number, deviceInfo?: { width: number; height: number; dpr: number }): Promise<{ dataUrl: string }>;

	/** Start continuous clip buffer capture from the proxy port at ~20 FPS. */
	startClipBuffer(proxyPort: number): Promise<void>;

	/** Stop the clip buffer. */
	stopClipBuffer(): Promise<void>;

	/** Get thumbnails for the last N seconds of captured frames. Freezes a snapshot. */
	getClipThumbnails(seconds: number): Promise<ClipThumbnail[]>;

	/** Run scene detection on the snapshot and return suggested keyframe indices. */
	getSuggestedIndices(seconds: number, maxFrames: number): Promise<number[]>;

	/** Save selected frames as PNG files and return their paths. */
	grabSelected(indices: number[]): Promise<{ filePaths: string[] }>;

	/** Check if the clip buffer is active. */
	getClipStatus(): Promise<{ active: boolean; frameCount: number }>;
}
