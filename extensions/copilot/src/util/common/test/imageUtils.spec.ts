/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { getImageDimensions, getImageDimensionsFromBytes, getJpegDimensions } from '../imageUtils';

/** A JPEG whose frame header follows `metadataBytes` of APP1 padding, then `trailingBytes` of scan data. */
function createJpegBytes(width: number, height: number, metadataBytes: number, trailingBytes = 16): Uint8Array {
	const chunks: number[][] = [[0xFF, 0xD8]];
	let remaining = metadataBytes;
	while (remaining > 0) {
		const payload = Math.min(remaining, 0xFFFF - 2);
		chunks.push([0xFF, 0xE1, (payload + 2) >> 8, (payload + 2) & 0xFF], new Array<number>(payload).fill(0));
		remaining -= payload;
	}
	chunks.push([0xFF, 0xC0, 0x00, 0x11, 0x08, height >> 8, height & 0xFF, width >> 8, width & 0xFF], new Array<number>(12).fill(0));
	chunks.push([0xFF, 0xDA], new Array<number>(trailingBytes).fill(0));
	const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return bytes;
}

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let index = 0; index < bytes.length; index += 0x8000) {
		binary += String.fromCodePoint(...bytes.subarray(index, index + 0x8000));
	}
	return btoa(binary);
}

describe('getJpegDimensions', () => {
	it('reads the frame header without decoding the whole payload', () => {
		const base64 = toBase64(createJpegBytes(640, 480, 1024, 512 * 1024));
		const atobSpy = vi.spyOn(globalThis, 'atob');
		try {
			expect(getJpegDimensions(base64)).toEqual({ width: 640, height: 480 });
			expect(atobSpy).toHaveBeenCalledTimes(1);
			expect(atobSpy.mock.calls[0][0].length).toBeLessThan(base64.length);
		} finally {
			atobSpy.mockRestore();
		}
	});

	it('decodes further when metadata pushes the frame header past the first chunk', () => {
		const base64 = toBase64(createJpegBytes(1920, 1080, 200 * 1024));
		expect(getJpegDimensions(base64)).toEqual({ width: 1920, height: 1080 });
		expect(getImageDimensions(`data:image/jpeg;base64,${base64}`)).toEqual({ width: 1920, height: 1080 });
	});

	it('agrees with the byte reader', () => {
		const bytes = createJpegBytes(300, 200, 70 * 1024);
		expect(getImageDimensionsFromBytes(bytes, 'image/jpeg')).toEqual({ width: 300, height: 200 });
		expect(getJpegDimensions(toBase64(bytes))).toEqual({ width: 300, height: 200 });
	});

	it('rejects data without a frame header', () => {
		expect(() => getJpegDimensions(toBase64(Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x04, 0x00, 0x00])))).toThrow('JPEG dimensions not found');
		expect(() => getJpegDimensions(toBase64(Uint8Array.from([0x89, 0x50, 0x4E, 0x47])))).toThrow('Not a valid JPEG image.');
	});
});
