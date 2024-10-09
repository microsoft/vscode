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

		const screenshot = await takeScreenshot(...bounds);
		if (!screenshot) {
			return;
		}

		await fileService.createFolder(URI.file(path.dirname(imgPath)));
		await fileService.writeFile(URI.file(imgPath), VSBuffer.wrap(screenshot));
		console.log('created screenshot');
		const uniqueId = generateIdUsingDateTime();
		return { id: uniqueId, name: 'screenshot-' + uniqueId + '.jpg', value: imgPath, isDynamic: true, isImage: true };
	} catch (err) {
		console.error('Error taking screenshot:', err);
		return undefined;
	}
}

async function takeScreenshotAndCrop(x: number, y: number, width: number, height: number): Promise<Uint8Array | undefined> {
	try {
		// Request screen capture stream
		const stream = await (navigator.mediaDevices as any).getDisplayMedia({
			video: { cursor: 'always' }
		});

		// Create a video element to capture the frame
		const video = document.createElement('video');
		video.srcObject = stream;

		// Play the video to be able to draw a frame from it
		await new Promise((resolve) => (video.onloadedmetadata = resolve));
		video.play();

		// Create a canvas that matches the size of the cropped region
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;

		const context = canvas.getContext('2d');
		if (context) {
			// Draw the portion of the video based on x, y, width, and height
			context.drawImage(video, x, y, width, height, 0, 0, width, height);
		}

		// Stop all tracks after capturing the frame
		stream.getTracks().forEach((track) => track.stop());

		// Convert the canvas to a Blob
		const blob: Blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')!);

		// Convert the Blob to an ArrayBuffer and then a Uint8Array
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
	value: string;
	isDynamic: boolean;
	isImage: boolean;
}
