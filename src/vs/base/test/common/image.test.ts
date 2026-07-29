/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../common/buffer.js';
import { readImageDimensions } from '../../common/image.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

function buf(...bytes: number[]): VSBuffer {
	return VSBuffer.wrap(new Uint8Array(bytes));
}

function corruptByte(input: VSBuffer, offset: number, value: number): VSBuffer {
	const copy = new Uint8Array(input.buffer);
	copy[offset] = value;
	return VSBuffer.wrap(copy);
}

/**
 * Build a minimal JPEG containing only SOI, an APP0 segment, an SOFn segment with the requested
 * dimensions, and EOI. Not decodable, but valid for header parsing.
 */
function makeJpeg(width: number, height: number): VSBuffer {
	return buf(
		0xFF, 0xD8, // SOI
		// APP0 segment (length 4: just the length field plus 2 dummy bytes) to exercise the segment skip
		0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00,
		// SOF0 segment: marker FF C0, length 0x0011, precision 8, height (BE), width (BE), 3 components
		0xFF, 0xC0, 0x00, 0x11, 0x08,
		(height >> 8) & 0xFF, height & 0xFF,
		(width >> 8) & 0xFF, width & 0xFF,
		0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
		0xFF, 0xD9 // EOI
	);
}

function makePng(width: number, height: number): VSBuffer {
	return buf(
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // signature
		0x00, 0x00, 0x00, 0x0D, // IHDR length
		0x49, 0x48, 0x44, 0x52, // "IHDR"
		(width >>> 24) & 0xFF, (width >>> 16) & 0xFF, (width >>> 8) & 0xFF, width & 0xFF,
		(height >>> 24) & 0xFF, (height >>> 16) & 0xFF, (height >>> 8) & 0xFF, height & 0xFF,
		0x08, 0x06, 0x00, 0x00, 0x00 // bit depth, color type, etc.
	);
}

function makeGif(width: number, height: number): VSBuffer {
	return buf(
		0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
		width & 0xFF, (width >> 8) & 0xFF,
		height & 0xFF, (height >> 8) & 0xFF,
		0x00, 0x00, 0x00 // packed field, bg color index, pixel aspect ratio
	);
}

/** Build a minimal WebP/VP8 (lossy) container with the given 14-bit dimensions. */
function makeWebPVp8(width: number, height: number): VSBuffer {
	return buf(
		0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, // "RIFF" <size> "WEBP"
		0x56, 0x50, 0x38, 0x20, 10, 0, 0, 0, // "VP8 " <chunkSize=10>
		0x00, 0x00, 0x00, // frame tag
		0x9D, 0x01, 0x2A, // start code
		width & 0xFF, (width >> 8) & 0x3F,
		height & 0xFF, (height >> 8) & 0x3F
	);
}

/** Build a minimal WebP/VP8L (lossless) container. Width and height are 1-based and 14-bit. */
function makeWebPVp8l(width: number, height: number): VSBuffer {
	const w = width - 1;
	const h = height - 1;
	// Width-1 in bits 0..13, height-1 in bits 14..27 of bytes 21..24.
	const b21 = w & 0xFF;
	const b22 = ((w >> 8) & 0x3F) | ((h & 0x03) << 6);
	const b23 = (h >> 2) & 0xFF;
	const b24 = (h >> 10) & 0x0F;
	return buf(
		0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
		0x56, 0x50, 0x38, 0x4C, 10, 0, 0, 0, // "VP8L" <chunkSize=10>
		0x2F, // VP8L signature byte
		b21, b22, b23, b24,
		0, 0, 0, 0, 0 // padding to satisfy the 30-byte minimum
	);
}

/** Build a minimal WebP/VP8X (extended) container. */
function makeWebPVp8x(width: number, height: number): VSBuffer {
	const w = width - 1;
	const h = height - 1;
	return buf(
		0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
		0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, // "VP8X" <chunkSize=10>
		0x00, 0x00, 0x00, 0x00, // flags + reserved
		w & 0xFF, (w >> 8) & 0xFF, (w >> 16) & 0xFF,
		h & 0xFF, (h >> 8) & 0xFF, (h >> 16) & 0xFF
	);
}

suite('readImageDimensions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses dimensions across supported formats and rejects unrecognized buffers', () => {
		const fixtures = {
			jpeg: { input: makeJpeg(640, 480), expected: { width: 640, height: 480 } },
			png: { input: makePng(1920, 1080), expected: { width: 1920, height: 1080 } },
			gif: { input: makeGif(50, 25), expected: { width: 50, height: 25 } },
			webpVp8: { input: makeWebPVp8(300, 200), expected: { width: 300, height: 200 } },
			webpVp8l: { input: makeWebPVp8l(1024, 768), expected: { width: 1024, height: 768 } },
			webpVp8x: { input: makeWebPVp8x(8000, 6000), expected: { width: 8000, height: 6000 } },
			empty: { input: VSBuffer.alloc(0), expected: undefined },
			tooShort: { input: buf(0xFF, 0xD8, 0xFF, 0xE0), expected: undefined },
			unknown: { input: buf(0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B), expected: undefined },
			webpVp8MissingStartCode: { input: corruptByte(makeWebPVp8(300, 200), 23, 0x00), expected: undefined },
			webpVp8lMissingSignature: { input: corruptByte(makeWebPVp8l(1024, 768), 20, 0x00), expected: undefined },
			webpVp8ChunkTooSmall: { input: corruptByte(makeWebPVp8(300, 200), 16, 4), expected: undefined },
			webpVp8xChunkTooSmall: { input: corruptByte(makeWebPVp8x(8000, 6000), 16, 4), expected: undefined },
			jpegZeroSegmentLength: {
				input: buf(
					0xFF, 0xD8, // SOI
					0xFF, 0xE0, 0x00, 0x00, // APP0 with invalid length 0
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 // padding to pass the outer < 12 check
				), expected: undefined
			},
		};

		const actual = Object.fromEntries(
			Object.entries(fixtures).map(([k, v]) => [k, readImageDimensions(v.input)])
		);
		const expected = Object.fromEntries(
			Object.entries(fixtures).map(([k, v]) => [k, v.expected])
		);

		assert.deepStrictEqual(actual, expected);
	});
});
