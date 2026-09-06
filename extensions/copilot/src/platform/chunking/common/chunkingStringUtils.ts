/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { splitLines } from '../../../util/vs/base/common/strings';

export function truncateToMaxUtf8Length(str: string, maxBytes: number): string {
	// utf-16 strings have at most 4 bytes per character (2 * 2)
	// If we're under that, skip the more expensive checks
	const upperEstimatedByteLength = str.length * 4;
	if (upperEstimatedByteLength <= maxBytes) {
		return str;
	}

	const encoder = new TextEncoder();
	const encodedStr = encoder.encode(str);

	if (encodedStr.length <= maxBytes) {
		return str;
	}

	const truncatedBytes = encodedStr.slice(0, maxBytes);

	// Decode the truncated bytes back to a string, ensuring no partial characters
	return new TextDecoder().decode(truncatedBytes, {
		stream: true // Don't emit partial characters
	});
}

/**
 * Returned chunks are formatted with extra metadata:
 *
 * File: `fileName.ext`:
 * ```lang
 * chunk text
 * ```
 *
 * Try to strip this out
 */

export function stripChunkTextMetadata(text: string): string {
	const lines = splitLines(text);
	if (lines.length >= 3 && lines[0].startsWith('File: ') && lines[1].startsWith('```') && lines.at(-1)?.startsWith('```')) {
		return lines.slice(2, -1).join('\n');
	}
	return text;
}

