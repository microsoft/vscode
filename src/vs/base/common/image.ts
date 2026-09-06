/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from './buffer.js';

export interface IImageDimensions {
	readonly width: number;
	readonly height: number;
}

/**
 * Read the pixel dimensions of an image by inspecting the bytes of its encoded
 * buffer. The format is auto-detected from the magic-number prefix.
 *
 * Supports JPEG, PNG, GIF and WebP (lossy, lossless and extended).
 *
 * Returns `undefined` if the buffer does not start with a recognized signature
 * or if the dimensions could not be parsed.
 */
export function readImageDimensions(buffer: VSBuffer): IImageDimensions | undefined {
	const bytes = buffer.buffer;
	if (bytes.length < 12) {
		return undefined;
	}
	// JPEG: FF D8
	if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
		return readJpegDimensions(bytes);
	}
	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
		bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
		return readPngDimensions(bytes);
	}
	// GIF: "GIF87a" or "GIF89a"
	if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
		return readGifDimensions(bytes);
	}
	// WebP: "RIFF" <size> "WEBP"
	if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
		bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
		return readWebPDimensions(bytes);
	}
	return undefined;
}

function readJpegDimensions(bytes: Uint8Array): IImageDimensions | undefined {
	let i = 2;
	while (i < bytes.length - 9) {
		// Skip fill bytes (0xFF) before the marker.
		while (i < bytes.length && bytes[i] === 0xFF) {
			i++;
		}
		if (i >= bytes.length) {
			return undefined;
		}
		const marker = bytes[i];
		i++;
		// Standalone markers without a length field.
		if (marker === 0xD8 || marker === 0xD9 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
			continue;
		}
		if (i + 1 >= bytes.length) {
			return undefined;
		}
		const segLength = (bytes[i] << 8) | bytes[i + 1];
		// The 2-byte length field includes itself, so anything < 2 is corrupt.
		if (segLength < 2) {
			return undefined;
		}
		// SOFn markers (0xC0..0xCF) carry the frame dimensions, except DHT (0xC4), JPG (0xC8) and DAC (0xCC).
		if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
			if (i + 6 >= bytes.length) {
				return undefined;
			}
			const height = (bytes[i + 3] << 8) | bytes[i + 4];
			const width = (bytes[i + 5] << 8) | bytes[i + 6];
			return { width, height };
		}
		i += segLength;
	}
	return undefined;
}

function readPngDimensions(bytes: Uint8Array): IImageDimensions | undefined {
	// The IHDR chunk immediately follows the 8-byte signature: 4-byte length, 4-byte type "IHDR",
	// then 4-byte width (BE) and 4-byte height (BE).
	if (bytes.length < 24 ||
		bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
		return undefined;
	}
	const width = (bytes[16] << 24 | bytes[17] << 16 | bytes[18] << 8 | bytes[19]) >>> 0;
	const height = (bytes[20] << 24 | bytes[21] << 16 | bytes[22] << 8 | bytes[23]) >>> 0;
	return { width, height };
}

function readGifDimensions(bytes: Uint8Array): IImageDimensions | undefined {
	// Logical screen width/height are at bytes 6..9, little-endian.
	if (bytes.length < 10) {
		return undefined;
	}
	const width = bytes[6] | (bytes[7] << 8);
	const height = bytes[8] | (bytes[9] << 8);
	return { width, height };
}

function readWebPDimensions(bytes: Uint8Array): IImageDimensions | undefined {
	// Chunk header at bytes 12..15 selects the WebP variant.
	if (bytes.length < 30) {
		return undefined;
	}
	// The RIFF chunk payload size is declared at bytes 16..19 (LE) and must be large enough
	// to contain the bytes each variant reads, and must fit within the buffer.
	const chunkSize = (bytes[16] | (bytes[17] << 8) | (bytes[18] << 16) | (bytes[19] << 24)) >>> 0;
	if (chunkSize > bytes.length - 20) {
		return undefined;
	}
	// VP8 (lossy, "VP8 " with trailing space). The frame tag occupies bytes 23..25 and must be the
	// 3-byte start code 0x9D 0x01 0x2A; without it the buffer is not a valid VP8 keyframe.
	if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20) {
		if (chunkSize < 10 || bytes[23] !== 0x9D || bytes[24] !== 0x01 || bytes[25] !== 0x2A) {
			return undefined;
		}
		const width = (bytes[26] | (bytes[27] << 8)) & 0x3FFF;
		const height = (bytes[28] | (bytes[29] << 8)) & 0x3FFF;
		return { width, height };
	}
	// VP8L (lossless). The bitstream starts at byte 21 (after the 0x2F signature). Width-1
	// occupies bits 0..13 and height-1 occupies bits 14..27, both little-endian.
	if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4C) {
		if (chunkSize < 5 || bytes[20] !== 0x2F) {
			return undefined;
		}
		const width = ((bytes[21] | (bytes[22] << 8)) & 0x3FFF) + 1;
		const height = (((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0F) << 10)) & 0x3FFF) + 1;
		return { width, height };
	}
	// VP8X (extended)
	if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
		if (chunkSize < 10) {
			return undefined;
		}
		const width = ((bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) & 0xFFFFFF) + 1;
		const height = ((bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) & 0xFFFFFF) + 1;
		return { width, height };
	}
	return undefined;
}
