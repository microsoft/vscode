/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


export function getImageDimensions(base64: string) {
	if (!base64.startsWith('data:image/')) {
		throw new Error('Could not read image: invalid base64 image string');
	}
	const rawString = base64.split(',')[1];
	switch (getMimeType(rawString)) {
		case 'image/png':
			return getPngDimensions(rawString);
		case 'image/gif':
			return getGifDimensions(rawString);
		case 'image/jpeg':
		case 'image/jpg':
			return getJpegDimensions(rawString);
		case 'image/webp':
			return getWebPDimensions(rawString);
		default:
			throw new Error('Unsupported image format');
	}
}

export function getImageDimensionsFromBytes(data: Uint8Array, mimeType: string | undefined) {
	switch (normalizeMimeType(mimeType)) {
		case 'image/png':
			return getPngDimensionsFromBytes(data);
		case 'image/gif':
			return getGifDimensionsFromBytes(data);
		case 'image/jpeg':
		case 'image/jpg':
			return getJpegDimensionsFromBytes(data);
		case 'image/webp':
			return getWebPDimensionsFromBytes(data);
		default:
			throw new Error('Unsupported image format');
	}
}

export function getPngDimensions(base64: string) {
	return getPngDimensionsFromBytes(base64ToBytes(base64.slice(0, 50)));
}

export function getGifDimensions(base64: string) {
	return getGifDimensionsFromBytes(base64ToBytes(base64.slice(0, 50)));
}

export function getJpegDimensions(base64: string) {
	return getJpegDimensionsFromBytes(base64ToBytes(base64));
}

function getPngDimensionsFromBytes(data: Uint8Array) {
	if (!hasBytes(data, 0, [0x89, 0x50, 0x4E, 0x47])) {
		throw new Error('Not a valid PNG image.');
	}

	const dataView = new DataView(data.buffer, data.byteOffset + 16, 8);

	return {
		width: dataView.getUint32(0, false),
		height: dataView.getUint32(4, false)
	};
}

function getGifDimensionsFromBytes(data: Uint8Array) {
	if (!hasAsciiSequence(data, 0, 'GIF8')) {
		throw new Error('Not a valid GIF image.');
	}

	const dataView = new DataView(data.buffer, data.byteOffset + 6, 4);

	return {
		width: dataView.getUint16(0, true),
		height: dataView.getUint16(2, true)
	};
}

function getJpegDimensionsFromBytes(data: Uint8Array) {
	if (!hasBytes(data, 0, [0xFF, 0xD8])) {
		throw new Error('Not a valid JPEG image.');
	}

	const length = data.length;
	let offset = 2;

	while (offset + 3 < length) {
		const marker = (data[offset] << 8) | data[offset + 1];
		const segmentLength = (data[offset + 2] << 8) | data[offset + 3];

		if (marker >= 0xFFC0 && marker <= 0xFFC2) {
			const dataView = new DataView(data.buffer, data.byteOffset + offset + 5, 4);
			return {
				height: dataView.getUint16(0, false),
				width: dataView.getUint16(2, false)
			};
		}

		offset += 2 + segmentLength;
	}

	throw new Error('JPEG dimensions not found');
}

export function getWebPDimensions(base64String: string) {
	return getWebPDimensionsFromBytes(base64ToBytes(base64String));
}

function getWebPDimensionsFromBytes(binaryData: Uint8Array) {
	if (!hasAsciiSequence(binaryData, 0, 'RIFF') || !hasAsciiSequence(binaryData, 8, 'WEBP')) {
		throw new Error('Not a valid WebP image.');
	}

	const chunkHeader = readAscii(binaryData, 12, 4);

	if (chunkHeader === 'VP8 ') {
		const width = (binaryData[26] | (binaryData[27] << 8)) & 0x3FFF;
		const height = (binaryData[28] | (binaryData[29] << 8)) & 0x3FFF;
		return { width, height };
	} else if (chunkHeader === 'VP8L') {
		const width = (binaryData[21] | (binaryData[22] << 8)) & 0x3FFF;
		const height = (binaryData[23] | (binaryData[24] << 8)) & 0x3FFF;
		return { width, height };
	} else if (chunkHeader === 'VP8X') {
		const width = ((binaryData[24] | (binaryData[25] << 8) | (binaryData[26] << 16)) & 0xFFFFFF) + 1;
		const height = ((binaryData[27] | (binaryData[28] << 8) | (binaryData[29] << 16)) & 0xFFFFFF) + 1;
		return { width, height };
	} else {
		throw new Error('Unsupported WebP format.');
	}
}

function normalizeMimeType(mimeType: string | undefined): string | undefined {
	return mimeType?.toLowerCase().split(';')[0].trim();
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	return Uint8Array.from(binary, char => char.codePointAt(0) ?? 0);
}

function hasBytes(data: Uint8Array, offset: number, bytes: readonly number[]): boolean {
	for (let index = 0; index < bytes.length; index++) {
		if (data[offset + index] !== bytes[index]) {
			return false;
		}
	}
	return true;
}

function hasAsciiSequence(data: Uint8Array, offset: number, sequence: string): boolean {
	for (let index = 0; index < sequence.length; index++) {
		if (data[offset + index] !== sequence.codePointAt(index)) {
			return false;
		}
	}
	return true;
}

function readAscii(data: Uint8Array, offset: number, length: number): string {
	return String.fromCodePoint(...data.subarray(offset, offset + length));
}

export function getMimeType(base64String: string): string | undefined {
	const mimeTypes: { [key: string]: string } = {
		'/9j/': 'image/jpeg',
		'iVBOR': 'image/png',
		'R0lGOD': 'image/gif',
		'UklGR': 'image/webp',
	};

	for (const prefix of Object.keys(mimeTypes)) {
		if (base64String.startsWith(prefix)) {
			return mimeTypes[prefix];
		}
	}
}

export function extractImageAttributes(line: string, refineExisting?: boolean): string | undefined {
	// Regex to match markdown image syntax ![alt text](<?image_path>?)
	const markdownImageRegex = /!\[([^\]]*)\]\(<?([^)<>]+?)>?\)/;
	// Updated regex to match HTML image syntax with alt and src in any order
	const htmlImageRegex = /<img\s+(?:alt=["']([^"']*)["']\s*)?src=["']([^"']+)["'](?:\s*alt=["']([^"']*)["'])?/;

	let match;
	let imagePath = '';
	let altText = '';

	if ((match = markdownImageRegex.exec(line)) !== null) {
		imagePath = match[2];
		altText = match[1];
	} else if ((match = htmlImageRegex.exec(line)) !== null) {
		imagePath = match[2]; // src is always the second group
		altText = match[1] || match[3] || ''; // alt is sometimes first or third
	} else {
		// Try Learn Markdown format - check if it's a Learn Markdown image
		const learnMarkdownRegex = /:::image\s+.*?source=["']([^"']+)["'].*?:::/;
		const sourceMatch = learnMarkdownRegex.exec(line);
		if (sourceMatch) {
			imagePath = sourceMatch[1];
			// Check if there's an alt-text attribute
			const altTextRegex = /alt-text=["']([^"']*?)["']/;
			const altMatch = altTextRegex.exec(line);
			altText = altMatch ? altMatch[1] : '';
		} else {
			return undefined;
		}
	}

	if (refineExisting ? !altText : !!altText) {
		return undefined;
	}

	return imagePath;
}
