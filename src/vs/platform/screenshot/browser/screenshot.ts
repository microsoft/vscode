/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../files/common/files.js';
import { URI } from '../../../base/common/uri.js';
import { getActiveWindow } from '../../../base/browser/dom.js';
import * as path from '../../../base/common/path.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { VSBuffer } from '../../../base/common/buffer.js';

export async function generateFocusedWindowScreenshot(fileService: IFileService, nativeEnvironmentService: INativeEnvironmentService): Promise<IScreenShotContext | undefined> {
	try {
		const tmpDir = nativeEnvironmentService.tmpDir;
		const imgPath = path.join(tmpDir.path, 'screenshot.jpg');

		const bounds = getActiveWindowBounds();
		if (!bounds) {
			return;
		}

		const screenshot = await takeScreenshotAndCrop(bounds.x, bounds.y, bounds.width, bounds.height);
		if (!screenshot) {
			return;
		}

		await fileService.createFolder(URI.file(path.dirname(imgPath)));
		await fileService.writeFile(URI.file(imgPath), VSBuffer.wrap(screenshot));
		console.log('created screenshot');
		const uniqueId = generateIdUsingDateTime();
		return { id: uniqueId, name: 'screenshot-' + uniqueId + '.jpg', value: URI.file(imgPath), isDynamic: true, isImage: true };
	} catch (err) {
		console.error('Error taking screenshot:', err);
		return undefined;
	}
}

async function takeScreenshotAndCrop(x: number, y: number, width: number, height: number): Promise<Uint8Array | undefined> {
	try {
		// Create a video element to play the captured screen source
		const video = document.createElement('video');

		// Create a stream from the screen source (capture screen without audio)
		const stream = await navigator.mediaDevices.getDisplayMedia({
			audio: false,
			video: true
		});

		// Set the stream as the source of the video element
		video.srcObject = stream;

		// Wait for the video to load metadata and ensure it can start playing
		await new Promise<void>((resolve) => {
			video.onloadedmetadata = () => {
				video.play();
				video.oncanplay = () => resolve();
			};
		});

		// Create a canvas element with the size of the cropped region
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');

		if (context) {
			// Draw the portion of the video (x, y) with the specified width and height
			context.drawImage(video, x, y, width, height);
		}

		// Stop the screen stream once the screenshot is taken
		stream.getTracks().forEach((track) => track.stop());

		// Convert the canvas to a Blob (PNG format)
		const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
		if (!blob) {
			throw new Error('Failed to create blob from canvas');
		}

		// Convert the Blob to an ArrayBuffer and then return it as a Uint8Array
		const arrayBuffer = await blob.arrayBuffer();
		return new Uint8Array(arrayBuffer);

	} catch (error) {
		console.error('Error taking screenshot:', error);
		return undefined;
	}
}


function generateIdUsingDateTime(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

	return `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`;
}

function getActiveWindowBounds(): { width: number; height: number; x: number; y: number } | undefined {
	const activeWindow = getActiveWindow();
	if (!activeWindow) {
		return undefined;
	}
	const window = getActiveWindow();
	if (!window) {
		return;
	}
	return { width: activeWindow.innerWidth, height: activeWindow.innerHeight, x: activeWindow.screenX, y: activeWindow.screenY };
}

export interface IScreenShotContext {
	id: string;
	name: string;
	value: URI;
	isDynamic: boolean;
	isImage: true;
}
