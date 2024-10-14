/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from './dom.js';
import { DisposableStore, toDisposable } from '../common/lifecycle.js';
import { isElectron } from './browser.js';

/**
 * Gets a screenshot from the browser. This gets the screenshot via the browser's display media API
 * which will typically offer a picker of all available screens and windows for the user to select.
 */
export async function getScreenshotViaDisplayMedia(): Promise<ArrayBuffer | undefined> {
	if (isElectron) {
		throw new Error('This method is not supported in Electron');
	}

	const store = new DisposableStore();

	// Create a video element to play the captured screen source
	const video = document.createElement('video');
	store.add(toDisposable(() => video.remove()));
	let stream: MediaStream | undefined;
	try {
		// Create a stream from the screen source (capture screen without audio)
		stream = await navigator.mediaDevices.getDisplayMedia({
			audio: false,
			video: true
		});

		// Set the stream as the source of the video element
		video.srcObject = stream;
		video.play();

		// Wait for the video to load properly before capturing the screenshot
		await Promise.all([
			new Promise<void>(r => store.add(addDisposableListener(video, 'loadedmetadata', () => r()))),
			new Promise<void>(r => store.add(addDisposableListener(video, 'canplaythrough', () => r())))
		]);

		const canvas = document.createElement('canvas');
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;

		const ctx = canvas.getContext('2d');
		if (!ctx) {
			return undefined;
		}

		// Draw the portion of the video (x, y) with the specified width and height
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

		// Convert the canvas to a Blob (JPEG format), use .95 for quality
		const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95));
		if (!blob) {
			throw new Error('Failed to create blob from canvas');
		}

		// Convert the Blob to an ArrayBuffer
		return blob.arrayBuffer();

	} catch (error) {
		console.error('Error taking screenshot:', error);
		return undefined;
	} finally {
		store.dispose();
		if (stream) {
			for (const track of stream.getTracks()) {
				track.stop();
			}
		}
	}
}
