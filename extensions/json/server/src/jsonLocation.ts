/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export class JSONLocation {
	private segments: string[];

	constructor(segments: string[]) {
		this.segments = segments;
	}

	public append(segment: string): JSONLocation {
		return new JSONLocation(this.segments.concat(segment));
	}

	public getSegments() {
		return this.segments;
	}

	public matches(segments: string[]) {
		let k = 0;
		for (let i = 0; k < segments.length && i < this.segments.length; i++) {
			if (segments[k] === this.segments[i] || segments[k] === '*') {
				k++;
			} else if (segments[k] !== '**') {
				return false;
			}
		}
		return k === segments.length;
	}

	public toString(): string {
		return '[' + this.segments.join('][') + ']';
	}
}