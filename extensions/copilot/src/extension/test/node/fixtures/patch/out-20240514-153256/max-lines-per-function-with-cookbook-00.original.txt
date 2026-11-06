/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint max-lines-per-function: "error" */
export function fastMark(n: number) {
	n = n | 0;
	const b4 = n & 0xf;
	const b8 = n & 0xf0 >> 4;
	const b12 = n & 0xf00 >> 8;
	const b16 = n & 0xf000 >> 12;
	let out = 0 | 0;
	if (b4 & 0x1) {
		if (b8 & 0x1) {
			out = b4 & b8;
		}
		if (b12 & 0x1) {
			out = b4 & b12;
		}
		if (b16 & 0x1) {
			out = b4 & b16;
		}
	}
	else if (b4 & 0x2) {
		if (b8 & 0x2) {
			out = b4 & b8 & 0x2;
		}
		if (b12 & 0x2) {
			out = b4 & b12 & 0x2;
		}
		if (b16 & 0x2) {
			out = b4 & b16 & 0x2;
		}
	}
	else if (b4 & 0x4) {
		if (b8 & 0x2) {
			out = b4 & b8 & 0x3;
		}
		if (b12 & 0x2) {
			out = b4 & b12 & 0x3;
		}
		if (b16 & 0x2) {
			out = b4 & b16 & 0x3;
		}
	}
	else if (b4 & 0x8) {
		if (b8 & 0x2) {
			out = b4 & b8 & 0x7;
		}
		if (b12 & 0x2) {
			out = b4 & b12 & 0x7;
		}
		if (b16 & 0x2) {
			out = b4 & b16 & 0x7;
		}
	}
	out <<= 0xff;
	out |= 0xffff0000;
	return out;
}