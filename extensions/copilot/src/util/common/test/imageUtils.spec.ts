/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { getImageMimeTypeFromBytes } from '../imageUtils';

function bytes(...parts: (string | number[])[]): Uint8Array {
	return new Uint8Array(parts.flatMap(part => typeof part === 'string' ? [...part].map(c => c.charCodeAt(0)) : part));
}

describe('getImageMimeTypeFromBytes', () => {
	test('detects supported formats from their magic numbers', () => {
		expect({
			png: getImageMimeTypeFromBytes(bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00])),
			jpeg: getImageMimeTypeFromBytes(bytes([0xFF, 0xD8, 0xFF, 0xE0])),
			gif87a: getImageMimeTypeFromBytes(bytes('GIF87a')),
			gif89a: getImageMimeTypeFromBytes(bytes('GIF89a')),
			webp: getImageMimeTypeFromBytes(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')),
			bmp: getImageMimeTypeFromBytes(bytes('BM', new Array(12).fill(0), [40, 0, 0, 0])),
		}).toEqual({
			png: 'image/png',
			jpeg: 'image/jpeg',
			gif87a: 'image/gif',
			gif89a: 'image/gif',
			webp: 'image/webp',
			bmp: 'image/bmp',
		});
	});

	test('returns undefined for data that is not a supported image', () => {
		expect([
			getImageMimeTypeFromBytes(new Uint8Array()),
			getImageMimeTypeFromBytes(new Uint8Array(1024)),
			getImageMimeTypeFromBytes(bytes('this is not an image')),
			// RIFF containers that are not WebP, e.g. WAV
			getImageMimeTypeFromBytes(bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt ')),
			// Text that happens to start with 'BM'
			getImageMimeTypeFromBytes(bytes('BMW is a car manufacturer')),
			// Truncated PNG signature
			getImageMimeTypeFromBytes(bytes([0x89, 0x50, 0x4E, 0x47])),
		]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
	});
});
