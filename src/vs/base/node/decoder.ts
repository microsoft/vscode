/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import sd = require('string_decoder');

/**
 * Convenient way to iterate over output line by line. This helper accommodates for the fact that
 * a buffer might not end with new lines all the way.
 *
 * To use:
 * - call the write method
 * - forEach() over the result to get the lines
 */
export class LineDecoder {
	private stringDecoder: sd.NodeStringDecoder;
	private remaining: string;

	constructor(encoding: string = 'utf8') {
		this.stringDecoder = new sd.StringDecoder(encoding);
		this.remaining = null;
	}

	public write(buffer: NodeBuffer): string[] {
		let result: string[] = [];
		let value = this.remaining
			? this.remaining + this.stringDecoder.write(buffer)
			: this.stringDecoder.write(buffer);

		if (value.length < 1) {
			return result;
		}
		let start = 0;
		let ch: number;
		while (start < value.length && ((ch = value.charCodeAt(start)) === 13 || ch === 10)) {
			start++;
		}
		let idx = start;
		while (idx < value.length) {
			ch = value.charCodeAt(idx);
			if (ch === 13 || ch === 10) {
				result.push(value.substring(start, idx));
				idx++;
				while (idx < value.length && ((ch = value.charCodeAt(idx)) === 13 || ch === 10)) {
					idx++;
				}
				start = idx;
			} else {
				idx++;
			}
		}
		this.remaining = start < value.length ? value.substr(start) : null;
		return result;
	}

	public end(): string {
		return this.remaining;
	}
}