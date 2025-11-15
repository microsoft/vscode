/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { illegalArgument } from '../../../../base/common/errors.js';
import { es5ClassCompat } from './es5ClassCompat.js';
import { Position } from './position.js';

@es5ClassCompat
export class Range {

	static isRange(thing: unknown): thing is vscode.Range {
		if (thing instanceof Range) {
			return true;
		}
		if (!thing || typeof thing !== 'object') {
			return false;
		}
		return Position.isPosition((<Range>thing).start)
			&& Position.isPosition((<Range>thing).end);
	}

	static of(obj: vscode.Range): Range {
		if (obj instanceof Range) {
			return obj;
		}
		if (this.isRange(obj)) {
			return new Range(obj.start, obj.end);
		}
		throw new Error('Invalid argument, is NOT a range-like object');
	}

	protected _start: Position;
	protected _end: Position;

	get start(): Position {
		return this._start;
	}

	get end(): Position {
		return this._end;
	}

	constructor(start: vscode.Position, end: vscode.Position);
	constructor(start: Position, end: Position);
	constructor(startLine: number, startColumn: number, endLine: number, endColumn: number);
	constructor(startLineOrStart: number | Position | vscode.Position, startColumnOrEnd: number | Position | vscode.Position, endLine?: number, endColumn?: number) {
		let start: Position | undefined;
		let end: Position | undefined;

		if (typeof startLineOrStart === 'number' && typeof startColumnOrEnd === 'number' && typeof endLine === 'number' && typeof endColumn === 'number') {
			start = new Position(startLineOrStart, startColumnOrEnd);
			end = new Position(endLine, endColumn);
		} else if (Position.isPosition(startLineOrStart) && Position.isPosition(startColumnOrEnd)) {
			start = Position.of(startLineOrStart);
			end = Position.of(startColumnOrEnd);
		}

		if (!start || !end) {
			throw new Error('Invalid arguments');
		}

		if (start.isBefore(end)) {
			this._start = start;
			this._end = end;
		} else {
			this._start = end;
			this._end = start;
		}
	}

	contains(positionOrRange: Position | Range): boolean {
		if (Range.isRange(positionOrRange)) {
			return this.contains(positionOrRange.start)
				&& this.contains(positionOrRange.end);

		} else if (Position.isPosition(positionOrRange)) {
			if (Position.of(positionOrRange).isBefore(this._start)) {
				return false;
			}
			if (this._end.isBefore(positionOrRange)) {
				return false;
			}
			return true;
		}
		return false;
	}

	isEqual(other: Range): boolean {
		return this._start.isEqual(other._start) && this._end.isEqual(other._end);
	}

	intersection(other: Range): Range | undefined {
		const start = Position.Max(other.start, this._start);
		const end = Position.Min(other.end, this._end);
		if (start.isAfter(end)) {
			// this happens when there is no overlap:
			// |-----|
			//          |----|
			return undefined;
		}
		return new Range(start, end);
	}

	union(other: Range): Range {
		if (this.contains(other)) {
			return this;
		} else if (other.contains(this)) {
			return other;
		}
		const start = Position.Min(other.start, this._start);
		const end = Position.Max(other.end, this.end);
		return new Range(start, end);
	}

	get isEmpty(): boolean {
		return this._start.isEqual(this._end);
	}

	get isSingleLine(): boolean {
		return this._start.line === this._end.line;
	}

	with(change: { start?: Position; end?: Position }): Range;
	with(start?: Position, end?: Position): Range;
	with(startOrChange: Position | undefined | { start?: Position; end?: Position }, end: Position = this.end): Range {

		if (startOrChange === null || end === null) {
			throw illegalArgument();
		}

		let start: Position;
		if (!startOrChange) {
			start = this.start;

		} else if (Position.isPosition(startOrChange)) {
			start = startOrChange;

		} else {
			start = startOrChange.start || this.start;
			end = startOrChange.end || this.end;
		}

		if (start.isEqual(this._start) && end.isEqual(this.end)) {
			return this;
		}
		return new Range(start, end);
	}

	toJSON(): unknown {
		return [this.start, this.end];
	}

	[Symbol.for('debug.description')]() {
		return getDebugDescriptionOfRange(this);
	}
}

export function getDebugDescriptionOfRange(range: vscode.Range): string {
	return range.isEmpty
		? `[${range.start.line}:${range.start.character})`
		: `[${range.start.line}:${range.start.character} -> ${range.end.line}:${range.end.character})`;
}
