/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../files/common/files.js';
import { URI } from '../../../base/common/uri.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { getActiveWindow } from '../../../base/browser/dom.js';
import * as path from '../../../base/common/path.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { importAMDNodeModule } from '../../../amdX.js';
// import screenshot from 'screenshot-desktop';
// import sharp from 'sharp';

export async function generateFocusedWindowScreenshot(fileService: IFileService, nativeEnvironmentService: INativeEnvironmentService): Promise<IScreenShotContext | undefined> {
	try {
		const sharp = await importAMDNodeModule<typeof import('sharp')>('sharp', 'lib/sharp.js');
		const screenshot = await importAMDNodeModule<typeof import('screenshot-desktop')>('@types/screenshot-desktop', 'index.d.ts');
		const tmpDir = nativeEnvironmentService.tmpDir;
		const imgPath = path.join(tmpDir.path, 'screenshot.jpg');

		const bounds = getActiveWindowBounds();
		if (!bounds) {
			return;
		}
		const { x, y, width, height } = bounds;

		const imgBuffer: Buffer = await screenshot({ format: 'jpg' });

		const croppedImage = await sharp(imgBuffer)
			.extract({ left: x, top: y, width, height })
			.toBuffer();

		const croppedImageBuffer = VSBuffer.wrap(croppedImage);

		await fileService.createFolder(URI.file(path.dirname(imgPath)));
		await fileService.writeFile(URI.file(imgPath), croppedImageBuffer);

		const uniqueId = generateIdUsingDateTime();
		return { id: uniqueId, name: 'screenshot-' + uniqueId + '.jpg', value: imgPath, isDynamic: true, isImage: true };
	} catch (err) {
		console.error('Error taking screenshot:', err);
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
