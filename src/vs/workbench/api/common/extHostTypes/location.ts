/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { URI } from '../../../../base/common/uri.js';
import { es5ClassCompat } from './es5ClassCompat.js';
import { Position } from './position.js';
import { Range } from './range.js';

@es5ClassCompat
export class Location {

	static isLocation(thing: unknown): thing is vscode.Location {
		if (thing instanceof Location) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Range.isRange((<Location>thing).range)
			&& URI.isUri((<Location>thing).uri);
	}

	uri: URI;
	range!: Range;

	constructor(uri: URI, rangeOrPosition: Range | Position) {
		this.uri = uri;

		if (!rangeOrPosition) {
			//that's OK
		} else if (Range.isRange(rangeOrPosition)) {
			this.range = Range.of(rangeOrPosition);
		} else if (Position.isPosition(rangeOrPosition)) {
			this.range = new Range(rangeOrPosition, rangeOrPosition);
		} else {
			throw new Error('Illegal argument');
		}
	}

	toJSON(): any {
		return {
			uri: this.uri,
			range: this.range
		};
	}
}
