/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Formats a byte range from a Uint8Array in a hexdump-style format.
 *
 * Each line contains:
 * - An 8-character hex offset
 * - Up to 16 bytes shown as two-digit hex values (grouped in pairs of 8)
 * - An ASCII representation where non-printable bytes are shown as '.'
 *
 * Example output:
 * ```
 * 00000000  4d 5a 90 00 03 00 00 00  04 00 00 00 ff ff 00 00  |MZ..............|
 * 00000010  b8 00 00 00 00 00 00 00  40 00 00 00 00 00 00 00  |........@.......|
 * ```
 */
export function formatHexdump(data: Uint8Array, startOffset: number = 0, maxBytes?: number): string {
	const bytesToFormat = maxBytes !== undefined ? Math.min(data.length - startOffset, maxBytes) : data.length - startOffset;
	if (bytesToFormat <= 0) {
		return '';
	}

	const lines: string[] = [];
	const bytesPerLine = 16;

	for (let i = 0; i < bytesToFormat; i += bytesPerLine) {
		const offset = startOffset + i;
		const lineBytes = Math.min(bytesPerLine, bytesToFormat - i);
		const slice = data.subarray(startOffset + i, startOffset + i + lineBytes);

		// Offset column
		const offsetStr = offset.toString(16).padStart(8, '0');

		// Hex columns (two groups of 8 bytes)
		const hexParts: string[] = [];
		for (let j = 0; j < bytesPerLine; j++) {
			if (j === 8) {
				hexParts.push('');
			}
			if (j < lineBytes) {
				hexParts.push(slice[j].toString(16).padStart(2, '0'));
			} else {
				hexParts.push('  ');
			}
		}
		const hexStr = hexParts.join(' ');

		// ASCII column
		let ascii = '';
		for (let j = 0; j < lineBytes; j++) {
			const byte = slice[j];
			ascii += (byte >= 0x20 && byte <= 0x7e) ? String.fromCharCode(byte) : '.';
		}

		lines.push(`${offsetStr}  ${hexStr}  |${ascii}|`);
	}

	return lines.join('\n');
}

/**
 * Returns true if the data appears to be binary content rather than valid text.
 * Uses the same heuristic as git: the presence of any null byte (0x00) in the
 * first 8KB indicates binary content.
 */
export function isBinaryContent(data: Uint8Array): boolean {
	const checkLength = Math.min(data.length, 8192);
	for (let i = 0; i < checkLength; i++) {
		if (data[i] === 0) {
			return true;
		}
	}
	return false;
}
