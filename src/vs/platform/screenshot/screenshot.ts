/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import screenshot from 'screenshot-desktop';
import sharp from 'sharp';
import { tmpdir } from 'os';
import { getActiveWindow } from '../../base/browser/dom.js';
import path from 'path';
import * as fs from 'fs';

export function getWindowBounds(): { width: number; height: number; x: number; y: number } | undefined {
	const activeWindow = getActiveWindow();
	if (!activeWindow) {
		return undefined;
	}
	return { width: activeWindow.innerWidth, height: activeWindow.innerHeight, x: activeWindow.screenX, y: activeWindow.screenY };
}

export async function generateFocusedWindowScreenshotPath(): Promise<string | undefined> {
	try {
		const tmpDir = tmpdir();
		const imgPath = path.join(tmpDir, 'screenshot.jpg');

		const window = getActiveWindow();
		if (!window) {
			throw new Error('No focused window detected.');
		}

		const bounds = getWindowBounds();
		if (!bounds) {
			return;
		}

		const { x, y, width, height } = bounds;

		const imgBuffer: Buffer = await screenshot({ format: 'jpg' });

		const croppedImage = await sharp(imgBuffer)
			.extract({ left: x, top: y, width, height })
			.toBuffer();

		// Ensure the temporary directory exists
		await fs.mkdir(path.dirname(imgPath), () => { });

		await fs.writeFile(imgPath, croppedImage, () => { });

		return imgPath;
	} catch (err) {
		console.error('Error taking screenshot:', err);
		return undefined;
	}
}

export function generateIdUsingDateTime(): string {
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
