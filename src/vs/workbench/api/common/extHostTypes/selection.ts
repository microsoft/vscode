/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { es5ClassCompat } from './es5ClassCompat.js';
import { Position } from './position.js';
import { getDebugDescriptionOfRange, Range } from './range.js';

@es5ClassCompat
export class Selection extends Range {

	static isSelection(thing: unknown): thing is Selection {
		if (thing instanceof Selection) {
			return true;
		}
		if (!thing || typeof thing !== 'object') {
			return false;
		}
		return Range.isRange(thing)
			&& Position.isPosition((<Selection>thing).anchor)
			&& Position.isPosition((<Selection>thing).active)
			&& typeof (<Selection>thing).isReversed === 'boolean';
	}

	private _anchor: Position;

	public get anchor(): Position {
		return this._anchor;
	}

	private _active: Position;

	public get active(): Position {
		return this._active;
	}

	constructor(anchor: Position, active: Position);
	constructor(anchorLine: number, anchorColumn: number, activeLine: number, activeColumn: number);
	constructor(anchorLineOrAnchor: number | Position, anchorColumnOrActive: number | Position, activeLine?: number, activeColumn?: number) {
		let anchor: Position | undefined;
		let active: Position | undefined;

		if (typeof anchorLineOrAnchor === 'number' && typeof anchorColumnOrActive === 'number' && typeof activeLine === 'number' && typeof activeColumn === 'number') {
			anchor = new Position(anchorLineOrAnchor, anchorColumnOrActive);
			active = new Position(activeLine, activeColumn);
		} else if (Position.isPosition(anchorLineOrAnchor) && Position.isPosition(anchorColumnOrActive)) {
			anchor = Position.of(anchorLineOrAnchor);
			active = Position.of(anchorColumnOrActive);
		}

		if (!anchor || !active) {
			throw new Error('Invalid arguments');
		}

		super(anchor, active);

		this._anchor = anchor;
		this._active = active;
	}

	get isReversed(): boolean {
		return this._anchor === this._end;
	}

	override toJSON() {
		return {
			start: this.start,
			end: this.end,
			active: this.active,
			anchor: this.anchor
		};
	}


	[Symbol.for('debug.description')]() {
		return getDebugDescriptionOfSelection(this);
	}
}

export function getDebugDescriptionOfSelection(selection: vscode.Selection): string {
	let rangeStr = getDebugDescriptionOfRange(selection);
	if (!selection.isEmpty) {
		if (selection.active.isEqual(selection.start)) {
			rangeStr = `|${rangeStr}`;
		} else {
			rangeStr = `${rangeStr}|`;
		}
	}
	return rangeStr;
}
