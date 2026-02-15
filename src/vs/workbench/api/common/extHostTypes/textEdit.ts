/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument } from '../../../../base/common/errors.js';
import { es5ClassCompat } from './es5ClassCompat.js';
import { Position } from './position.js';
import { Range } from './range.js';

export enum EndOfLine {
	LF = 1,
	CRLF = 2
}

@es5ClassCompat
export class TextEdit {

	static isTextEdit(thing: unknown): thing is TextEdit {
		if (thing instanceof TextEdit) {
			return true;
		}
		if (!thing || typeof thing !== 'object') {
			return false;
		}
		return Range.isRange((<TextEdit>thing))
			&& typeof (<TextEdit>thing).newText === 'string';
	}

	static replace(range: Range, newText: string): TextEdit {
		return new TextEdit(range, newText);
	}

	static insert(position: Position, newText: string): TextEdit {
		return TextEdit.replace(new Range(position, position), newText);
	}

	static delete(range: Range): TextEdit {
		return TextEdit.replace(range, '');
	}

	static setEndOfLine(eol: EndOfLine): TextEdit {
		const ret = new TextEdit(new Range(new Position(0, 0), new Position(0, 0)), '');
		ret.newEol = eol;
		return ret;
	}

	protected _range: Range;
	protected _newText: string | null;
	protected _newEol?: EndOfLine;

	get range(): Range {
		return this._range;
	}

	set range(value: Range) {
		if (value && !Range.isRange(value)) {
			throw illegalArgument('range');
		}
		this._range = value;
	}

	get newText(): string {
		return this._newText || '';
	}

	set newText(value: string) {
		if (value && typeof value !== 'string') {
			throw illegalArgument('newText');
		}
		this._newText = value;
	}

	get newEol(): EndOfLine | undefined {
		return this._newEol;
	}

	set newEol(value: EndOfLine | undefined) {
		if (value && typeof value !== 'number') {
			throw illegalArgument('newEol');
		}
		this._newEol = value;
	}

	constructor(range: Range, newText: string | null) {
		this._range = range;
		this._newText = newText;
	}

	toJSON(): { range: Range; newText: string; newEol: EndOfLine | undefined } {
		return {
			range: this.range,
			newText: this.newText,
			newEol: this._newEol
		};
	}
}
