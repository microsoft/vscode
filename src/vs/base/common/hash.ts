/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// copied from TypeScript/src/compiler/core/hash.ts and adjusted to external module syntax

'use strict';	


export function computeMurmur2StringHashCode(key: string): number {
	// 'm' and 'r' are mixing constants generated offline.
	// They're not really 'magic', they just happen to work well.
	var m = 0x5bd1e995;
	var r = 24;

	var start = 0;
	var len = key.length;
	var numberOfCharsLeft = len;

	// Initialize the hash to a 'random' value.
	var h = (0 ^ numberOfCharsLeft);

	// Mix 4 bytes at a time into the hash.  NOTE: 4 bytes is two chars, so we iterate
	// through the string two chars at a time.
	var index = start;
	while (numberOfCharsLeft >= 2) {
		var c1 = key.charCodeAt(index);
		var c2 = key.charCodeAt(index + 1);

		var k = c1 | (c2 << 16);

		k *= m;
		k ^= k >> r;
		k *= m;

		h *= m;
		h ^= k;

		index += 2;
		numberOfCharsLeft -= 2;
	}

	// Handle the last char (or 2 bytes) if they exist.  This happens if the original string had
	// odd length.
	if (numberOfCharsLeft === 1) {
		h ^= key.charCodeAt(index);
		h *= m;
	}

	// Do a few final mixes of the hash to ensure the last few bytes are well-incorporated.

	h ^= h >> 13;
	h *= m;
	h ^= h >> 15;

	return h;
}

export function combine(value:number, currentHash:number): number {
	// Ensure we stay within 31 bits.
	return (((currentHash << 5) + currentHash) + value) & 0x7FFFFFFF;
}