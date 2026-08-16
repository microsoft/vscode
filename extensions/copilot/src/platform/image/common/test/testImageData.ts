/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const pngSignaturePrefix = [0x89, 0x50, 0x4E, 0x47];

export function createPngBytes(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(24);
	bytes.set(pngSignaturePrefix, 0);
	const dataView = new DataView(bytes.buffer);
	dataView.setUint32(16, width, false);
	dataView.setUint32(20, height, false);
	return bytes;
}

export function createPngDataUrl(width: number, height: number): string {
	return `data:image/png;base64,${btoa(String.fromCodePoint(...createPngBytes(width, height)))}`;
}