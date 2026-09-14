/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

// ImageDecoder is available in Chromium, but is not yet declared by lib.dom.
interface IAnimationDecoder {
	readonly tracks: {
		readonly ready: Promise<void>;
		readonly selectedTrack: { readonly frameCount: number } | null;
	};
	decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>;
	close(): void;
}

suite('ProjectBoardAnimation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const ImageDecoder = (mainWindow as Window & {
		ImageDecoder?: new (options: { data: ArrayBuffer; type: string }) => IAnimationDecoder;
	}).ImageDecoder;

	(ImageDecoder ? test : test.skip)('PB-04 grounded feet move backward relative to the right-facing runner, including the loop seam', async () => {
		const data = await new Promise<ArrayBuffer>((resolve, reject) => {
			const request = new XMLHttpRequest();
			// The Electron test runner uses file: resources, while browser tests use HTTP.
			// Unlike fetch, XMLHttpRequest supports both without a custom protocol handler.
			request.open('GET', FileAccess.asFileUri('vs/sessions/contrib/projectBoard/browser/media/running-person.gif').toString(true));
			request.responseType = 'arraybuffer';
			request.onload = () => {
				if ((request.status === 0 || request.status === 200) && request.response instanceof ArrayBuffer) {
					resolve(request.response);
				} else {
					reject(new Error(`Failed to load the running animation: ${request.status}`));
				}
			};
			request.onerror = () => reject(new Error('Failed to load the running animation'));
			request.send();
		});
		const decoder = new ImageDecoder!({ data, type: 'image/gif' });
		try {
			await decoder.tracks.ready;
			assert.strictEqual(decoder.tracks.selectedTrack?.frameCount, 12);
			const canvas = mainWindow.document.createElement('canvas');
			canvas.width = canvas.height = 48;
			const context = canvas.getContext('2d', { willReadFrequently: true })!;
			for (const contactFrames of [[11, 0, 1, 2], [5, 6, 7, 8]]) {
				const positions: number[] = [];
				for (const frameIndex of contactFrames) {
					const { image } = await decoder.decode({ frameIndex });
					try {
						context.clearRect(0, 0, 48, 48);
						context.drawImage(image, 0, 0);
					} finally {
						image.close();
					}
					const { data } = context.getImageData(0, 0, 48, 48);
					let totalX = 0;
					let pixels = 0;
					// Track the low yellow shoe, excluding the raised shoe and blue clothing.
					for (let y = 38; y < 48; y++) {
						for (let x = 0; x < 48; x++) {
							const offset = (y * 48 + x) * 4;
							const [red, green, blue, alpha] = data.subarray(offset, offset + 4);
							if (alpha > 0 && red > 160 && green > 125 && red > blue * 1.45 && green > blue * 1.18) {
								totalX += x;
								pixels++;
							}
						}
					}
					assert.ok(pixels > 0, `Missing grounded shoe in frame ${frameIndex}`);
					positions.push(totalX / pixels);
				}
				assert.ok(positions.slice(1).every((x, index) => x < positions[index] - 1),
					`The grounded shoe must move left, not moonwalk right: ${positions.join(', ')}`);
			}
		} finally {
			decoder.close();
		}
	});
});
