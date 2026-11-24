/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, RunOnceScheduler } from '../../../../../base/common/async.js';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { XtermAttributes, IXtermCore } from '../../../terminal/browser/xterm-private.js';
import { IBeforeProcessDataEvent, ITerminalProcessManager, TERMINAL_CONFIG_SECTION } from '../../../terminal/common/terminal.js';
import type { IBuffer, IDisposable, IMarker, ITerminalAddon, Terminal } from '@xterm/xterm';
import { DEFAULT_LOCAL_ECHO_EXCLUDE, type ITerminalTypeAheadConfiguration } from '../common/terminalTypeAheadConfiguration.js';
import { isNumber, type SingleOrMany } from '../../../../../base/common/types.js';

const enum VT {
	Esc = '\x1b',
	Csi = `\x1b[`,
	ShowCursor = `\x1b[?25h`,
	HideCursor = `\x1b[?25l`,
	DeleteChar = `\x1b[X`,
	DeleteRestOfLine = `\x1b[K`,
}

const CSI_STYLE_RE = /^\x1b\[[0-9;:]*m/;
const CSI_MOVE_RE = /^\x1b(?:\[([0-9]*)(;[35])?|O)([DC])/;
const NOT_WORD_RE = /[^a-z0-9]/i;
const getStyles = (input: string) => input.match(/\x1b\[[0-9;:]*m/g)?.join('') ?? '';

const enum StatsConstants {
	StatsBufferSize = 24,
	StatsSendTelemetryEvery = 1000 * 60 * 5, // how often to collect stats
	StatsMinSamplesToTurnOn = 5,
	StatsMinAccuracyToTurnOn = 0.3,
	StatsToggleOffThreshold = 0.5, // if latency is less than `threshold * this`, turn off
}

/**
 * Codes that should be omitted from sending to the prediction engine and instead omitted directly:
 * - Hide cursor (DECTCEM): We wrap the local echo sequence in hide and show
 *   CSI ? 2 5 l
 * - Show cursor (DECTCEM): We wrap the local echo sequence in hide and show
 *   CSI ? 2 5 h
 * - Device Status Report (DSR): These sequence fire report events from xterm which could cause
 *   double reporting and potentially a stack overflow (#119472)
 *   CSI Ps n
 *   CSI ? Ps n
 */
/** Bound on fragmented escape sequence data withheld while predictions are pending. */
const MAX_INCOMPLETE_ESCAPE_LENGTH = 16 * 1024;

const PREDICTION_OMIT_RE = /^(?:(?:\x1b\[|\x9b)(?:\?(?:25|12)[hl]|\??[0-9;]+n))+/;

/** Carriage returns or absolute positioning indicate that a shell may be repainting the line. */
const REPAINT_HINT_RE = /\r|\x1b\[[0-9;]*H/;

/** Input made only of printable ASCII, which a shell echoes one character per key. */
const PRINTABLE_INPUT_RE = /^[\x20-\x7e]+$/;

const core = (terminal: Terminal): IXtermCore => {
	interface XtermWithCore extends Terminal {
		_core: IXtermCore;
	}
	return (terminal as XtermWithCore)._core;
};
const hasPendingWrites = (terminal: Terminal) => core(terminal)._writeBuffer._pendingData > 0;
const flushOutput = (terminal: Terminal) => {
	// TODO: Flushing output is not possible anymore without async
};

const enum CursorMoveDirection {
	Back = 'D',
	Forwards = 'C',
}

interface ICoordinate {
	x: number;
	y: number;
	baseY: number;
}

const isSameCell = (a: ICoordinate, b: ICoordinate) => a.x === b.x && a.y + a.baseY === b.y + b.baseY;

interface ICellSnapshot {
	chars: string;
	attributes: string;
	width: number;
}

class Cursor implements ICoordinate {
	private _x = 0;
	private _y = 1;
	private _baseY = 1;
	/** Predicted cells, shared copy-on-write between clones. */
	private _cells = new Map<string, ICellSnapshot>();
	private _cellsShared = false;

	get x() {
		return this._x;
	}

	get y() {
		return this._y;
	}

	get baseY() {
		return this._baseY;
	}

	get coordinate(): ICoordinate {
		return { x: this._x, y: this._y, baseY: this._baseY };
	}

	constructor(
		readonly rows: number,
		readonly cols: number,
		private readonly _buffer: IBuffer
	) {
		this._x = _buffer.cursorX;
		this._y = _buffer.cursorY;
		this._baseY = _buffer.baseY;
	}

	getLine() {
		return this._buffer.getLine(this._y + this._baseY);
	}

	getCell(offset = 0): ICellSnapshot | undefined {
		return this.getCellAt({ ...this.coordinate, x: this._x + offset });
	}

	getCellAt(pos: ICoordinate): ICellSnapshot | undefined {
		const predicted = this._cells.get(`${pos.baseY + pos.y}:${pos.x}`);
		if (predicted) {
			return predicted;
		}
		const cell = this._buffer.getLine(pos.y + pos.baseY)?.getCell(pos.x);
		return cell ? { chars: cell.getChars(), attributes: attributesToSeq(cell), width: cell.getWidth() } : undefined;
	}

	setCell(chars: string, attributes: string) {
		this.setCellAt(this.coordinate, chars, attributes);
	}

	setCellAt(pos: ICoordinate, chars: string, attributes: string) {
		if (this._cellsShared) {
			this._cells = new Map(this._cells);
			this._cellsShared = false;
		}
		this._cells.set(`${pos.baseY + pos.y}:${pos.x}`, { chars, attributes, width: 1 });
	}

	moveTo(coordinate: ICoordinate) {
		this._x = coordinate.x;
		this._y = (coordinate.y + coordinate.baseY) - this._baseY;
		return this.moveInstruction();
	}

	clone() {
		const c = new Cursor(this.rows, this.cols, this._buffer);
		c.adopt(this);
		return c;
	}

	adopt(cursor: Cursor) {
		this._cells = cursor._cells;
		this._cellsShared = cursor._cellsShared = true;
		return this.moveTo(cursor);
	}

	move(x: number, y: number) {
		this._x = x;
		this._y = y;
		return this.moveInstruction();
	}

	shift(x: number = 0, y: number = 0) {
		this._x += x;
		this._y += y;
		return this.moveInstruction();
	}

	moveInstruction() {
		if (this._y >= this.rows) {
			this._baseY += this._y - (this.rows - 1);
			this._y = this.rows - 1;
		} else if (this._y < 0) {
			this._baseY -= this._y;
			this._y = 0;
		}

		return `${VT.Csi}${this._y + 1};${this._x + 1}H`;
	}
}

const moveToWordBoundary = (b: IBuffer, cursor: Cursor, direction: -1 | 1) => {
	let ateLeadingWhitespace = false;
	if (direction < 0) {
		cursor.shift(-1);
	}

	while (cursor.x >= 0) {
		const cell = cursor.getCell();
		if (!cell?.chars) {
			return;
		}

		const chars = cell.chars;
		if (NOT_WORD_RE.test(chars)) {
			if (ateLeadingWhitespace) {
				break;
			}
		} else {
			ateLeadingWhitespace = true;
		}

		cursor.shift(direction);
	}

	if (direction < 0) {
		cursor.shift(1); // we want to place the cursor after the whitespace starting the word
	}
};

const enum MatchResult {
	/** matched successfully */
	Success,
	/** failed to match */
	Failure,
	/** buffer data, it might match in the future one more data comes in */
	Buffer,
}

export interface IPrediction {
	/**
	 * Whether applying this prediction can modify the style attributes of the
	 * terminal. If so it means we need to reset the cursor style if it's
	 * rolled back.
	 */
	readonly affectsStyle?: boolean;

	/** Authoritative cursor position before this prediction, when it stays on one row. */
	readonly cursorBefore?: ICoordinate;

	/** Authoritative cursor position after confirmation, when it stays on one row. */
	readonly cursorAfter?: ICoordinate;

	/** Whether a repaint of a row, given as cells by column, shows this edit. */
	isRepainted?(row: ICoordinate, cells: ReadonlyMap<number, ICellSnapshot>): boolean;

	/** Cells repainted by the latest server confirmation. */
	readonly confirmedCells?: readonly ICoordinate[];

	/** Refreshes undo data and redraws an edit overlapping a confirmed cell. */
	reapplyAfterCellChange?(cursor: Cursor, position: ICoordinate, attributes: string): string;

	/**
	 * If set to false, the prediction will not be cleared if no input is
	 * received from the server.
	 */
	readonly clearAfterTimeout?: boolean;

	/**
	 * Returns a sequence to apply the prediction.
	 * @param buffer to write to
	 * @param cursor position to write the data. Should advance the cursor.
	 * @returns a string to be written to the user terminal, or optionally a
	 * string for the user terminal and real pty.
	 */
	apply(buffer: IBuffer, cursor: Cursor): string;

	/**
	 * Returns a sequence to roll back a previous `apply()` call. If
	 * `rollForwards` is not given, then this is also called if a prediction
	 * is correct before show the user's data.
	 */
	rollback(cursor: Cursor, attributes?: string): string;

	/**
	 * If available, this will be called when the prediction is correct.
	 */
	rollForwards(cursor: Cursor, withInput: string, lookBehind?: IPrediction, attributes?: string): string;

	/**
	 * Returns whether the given input is one expected by this prediction.
	 * @param input reader for the input the PTY is giving
	 * @param lookBehind the last successfully-made prediction, if any
	 */
	matches(input: StringReader, lookBehind?: IPrediction): MatchResult;
}

class EscapeSequenceScanner {
	private _state: 'escape' | 'escapeIntermediate' | 'csi' | 'osc' | 'string' | undefined;
	private _stringEscape = false;
	private _csiParameters = '';
	cursorVisibility?: VT.HideCursor | VT.ShowCursor;

	get isIncomplete() {
		return this._state !== undefined;
	}

	scan(input: string): number {
		let start = this.isIncomplete ? 0 : -1;
		for (let i = 0; i < input.length; i++) {
			const char = input[i];
			if (char === '\x18' || char === '\x1a' || char === '\x9c') {
				this._state = undefined;
				this._stringEscape = false;
				this._csiParameters = '';
				continue;
			}
			if (char >= '\x80' && char <= '\x9f') {
				start = i;
				this._state = char === '\x9b' ? 'csi' : char === '\x9d' ? 'osc' : '\x90\x98\x9e\x9f'.includes(char) ? 'string' : undefined;
				this._stringEscape = false;
				this._csiParameters = '';
				continue;
			}
			if (this._stringEscape) {
				this._stringEscape = false;
				if (char === '\\') {
					this._state = undefined;
					continue;
				}
				start = Math.max(0, i - 1);
				this._state = 'escape';
			}
			if (this._state === 'osc' || this._state === 'string') {
				if (this._state === 'osc' && char === '\x07') {
					this._state = undefined;
				} else if (char === VT.Esc) {
					this._stringEscape = true;
				}
			} else if (char === VT.Esc) {
				start = i;
				this._state = 'escape';
				this._csiParameters = '';
			} else if (this._state === 'escape') {
				if (char >= ' ' && char <= '/') {
					this._state = 'escapeIntermediate';
				} else if (char === '[') {
					this._state = 'csi';
					this._csiParameters = '';
				} else if (char === ']') {
					this._state = 'osc';
				} else if ('PX^_'.includes(char)) {
					this._state = 'string';
				} else if (char >= '0' && char <= '~') {
					if (char === 'c') {
						this.cursorVisibility = VT.ShowCursor;
					}
					this._state = undefined;
				}
			} else if (this._state === 'escapeIntermediate' && char >= '0' && char <= '~') {
				this._state = undefined;
			} else if (this._state === 'csi') {
				if (char >= '@' && char <= '~') {
					if ((char === 'h' || char === 'l') && /^\?[0-9;]*$/.test(this._csiParameters)
						&& this._csiParameters.slice(1).split(';').some(value => Number(value) === 25)) {
						this.cursorVisibility = char === 'l' ? VT.HideCursor : VT.ShowCursor;
					} else if (char === 'p' && /^[0-9;]*!$/.test(this._csiParameters)) {
						this.cursorVisibility = VT.ShowCursor;
					}
					this._state = undefined;
					this._csiParameters = '';
				} else if (char >= ' ' && char <= '?') {
					this._csiParameters += char;
				}
			}
		}
		return this.isIncomplete ? start : -1;
	}

	/**
	 * Scans the rest of a sequence that is in progress and returns where it
	 * ends in the input.
	 */
	scanContinuation(input: string): number {
		let end = 0;
		while (end < input.length && this.isIncomplete) {
			this.scan(input[end++]);
		}
		return end;
	}
}

class StringReader {
	index = 0;

	get remaining() {
		return this._input.length - this.index;
	}

	get eof() {
		return this.index === this._input.length;
	}

	get rest() {
		return this._input.slice(this.index);
	}

	constructor(
		private readonly _input: string,
		readonly hasPendingInput = false,
	) { }

	/**
	 * Advances the reader and returns the character if it matches.
	 */
	eatChar(char: string) {
		if (this._input[this.index] !== char) {
			return;
		}

		this.index++;
		return char;
	}

	/**
	 * Advances the reader and returns the string if it matches.
	 */
	eatStr(substr: string) {
		if (!this._input.startsWith(substr, this.index)) {
			return;
		}

		this.index += substr.length;
		return substr;
	}

	/**
	 * Matches and eats the substring character-by-character. If EOF is reached
	 * before the substring is consumed, it will buffer. Index is not moved
	 * if it's not a match.
	 */
	eatGradually(substr: string): MatchResult {
		const prevIndex = this.index;
		for (let i = 0; i < substr.length; i++) {
			if (i > 0 && this.eof) {
				return MatchResult.Buffer;
			}

			if (!this.eatChar(substr[i])) {
				this.index = prevIndex;
				return MatchResult.Failure;
			}
		}

		return MatchResult.Success;
	}

	/**
	 * Advances the reader and returns the regex if it matches.
	 */
	eatRe(re: RegExp) {
		const match = re.exec(this._input.slice(this.index));
		if (!match) {
			return;
		}

		this.index += match[0].length;
		return match;
	}

	/**
	 * Advances the reader and returns the character if the code matches.
	 */
	eatCharCode(min = 0, max = min + 1) {
		const code = this._input.charCodeAt(this.index);
		if (code < min || code >= max) {
			return undefined;
		}

		this.index++;
		return code;
	}
}

/**
 * Preidction which never tests true. Will always discard predictions made
 * after it.
 */
class HardBoundary implements IPrediction {
	readonly clearAfterTimeout = false;

	apply() {
		return '';
	}

	rollback() {
		return '';
	}

	rollForwards() {
		return '';
	}

	matches() {
		return MatchResult.Failure;
	}
}

/**
 * Boundary for input that reached the pty without a prediction. A printable
 * key waits for its own echo, so keys typed before it arrives are matched in
 * order; other input waits for the next output. Keys typed while it is pending
 * are not predicted, and none of these count towards prediction accuracy.
 */
class UnpredictedInputBoundary implements IPrediction {
	readonly clearAfterTimeout = false;

	constructor(private readonly _echo?: CharacterPrediction) { }

	apply() {
		return '';
	}

	rollback() {
		return '';
	}

	rollForwards() {
		return '';
	}

	matches(input: StringReader, lookBehind?: IPrediction) {
		return this._echo?.matches(input, lookBehind) ?? MatchResult.Failure;
	}
}

/**
 * Wraps another prediction. Does not apply the prediction, but will pass
 * through its `matches` request.
 */
class TentativeBoundary implements IPrediction {
	private _appliedCursor?: Cursor;

	constructor(readonly inner: IPrediction) { }

	get confirmedCells() {
		return this.inner.confirmedCells;
	}

	get cursorBefore() {
		return this.inner.cursorBefore;
	}

	get cursorAfter() {
		return this.inner.cursorAfter;
	}

	isRepainted(row: ICoordinate, cells: ReadonlyMap<number, ICellSnapshot>) {
		return !!this.inner.isRepainted?.(row, cells);
	}

	apply(buffer: IBuffer, cursor: Cursor) {
		this._appliedCursor = cursor.clone();
		this.inner.apply(buffer, this._appliedCursor);
		return '';
	}

	rollback(cursor: Cursor) {
		this.inner.rollback(cursor.clone());
		return '';
	}

	rollForwards(cursor: Cursor, withInput: string, lookBehind?: IPrediction, attributes?: string) {
		if (this._appliedCursor) {
			cursor.adopt(this._appliedCursor);
		}
		this.inner.rollForwards(cursor, withInput, lookBehind, attributes);
		return withInput;
	}

	matches(input: StringReader, lookBehind?: IPrediction) {
		return this.inner.matches(input, lookBehind);
	}
}

const isTenativeCharacterPrediction = (p: unknown): p is (TentativeBoundary & { inner: CharacterPrediction }) =>
	p instanceof TentativeBoundary && p.inner instanceof CharacterPrediction;

const isUnpredictedInputBoundary = (p: unknown): p is (TentativeBoundary & { inner: UnpredictedInputBoundary }) =>
	p instanceof TentativeBoundary && p.inner instanceof UnpredictedInputBoundary;

/**
 * Prediction for a single alphanumeric character.
 */
class CharacterPrediction implements IPrediction {
	readonly affectsStyle = true;
	confirmedCells: ICoordinate[] = [];

	appliedAt?: {
		pos: ICoordinate;
		oldAttributes: string;
		oldChar: string;
	};

	get cursorBefore() {
		return this.appliedAt?.pos;
	}

	get cursorAfter() {
		return this.appliedAt ? { ...this.appliedAt.pos, x: this.appliedAt.pos.x + 1 } : undefined;
	}

	isRepainted(row: ICoordinate, cells: ReadonlyMap<number, ICellSnapshot>) {
		return !!this.appliedAt && isSameCell({ ...row, x: this.appliedAt.pos.x }, this.appliedAt.pos) && cells.get(this.appliedAt.pos.x)?.chars === this._char;
	}

	constructor(private readonly _style: TypeAheadStyle, private readonly _char: string) { }

	apply(_: IBuffer, cursor: Cursor) {
		const cell = cursor.getCell();
		this.appliedAt = cell
			? { pos: cursor.coordinate, oldAttributes: cell.attributes, oldChar: cell.chars }
			: { pos: cursor.coordinate, oldAttributes: '', oldChar: '' };

		cursor.setCell(this._char, this._style.currentAttributes);
		cursor.shift(1);

		return this._style.apply + this._char + this._style.undo;
	}

	rollback(cursor: Cursor, attributes = this._style.currentAttributes) {
		if (!this.appliedAt) {
			return ''; // not applied
		}

		const { oldAttributes, oldChar, pos } = this.appliedAt;
		cursor.setCellAt(pos, oldChar, oldAttributes);
		// Erase with the saved style explicitly: rolling back a later cell may have changed the pen.
		return cursor.moveTo(pos) + (oldChar ? oldAttributes + oldChar + cursor.moveTo(pos) : (oldAttributes || attributes) + VT.DeleteChar);
	}

	rollForwards(cursor: Cursor, input: string, lookBehind?: IPrediction, attributes = this._style.currentAttributes + getStyles(input)) {
		if (!this.appliedAt) {
			return ''; // not applied
		}

		this.confirmedCells = [this.appliedAt.pos];
		if (lookBehind instanceof CharacterPrediction && lookBehind.appliedAt
			&& input.endsWith(`\b${lookBehind._char}${this._char}`)) {
			cursor.setCellAt(lookBehind.appliedAt.pos, lookBehind._char, attributes);
			this.confirmedCells.unshift(lookBehind.appliedAt.pos);
		}
		cursor.setCellAt(this.appliedAt.pos, this._char, attributes);
		return cursor.clone().moveTo(this.appliedAt.pos) + input;
	}

	reapplyAfterCellChange(cursor: Cursor, position: ICoordinate, attributes: string) {
		if (!this.appliedAt || !isSameCell(this.appliedAt.pos, position)) {
			return '';
		}

		const cell = cursor.getCellAt(position);
		this.appliedAt.oldChar = cell?.chars ?? '';
		this.appliedAt.oldAttributes = cell?.attributes ?? '';
		cursor.setCellAt(position, this._char, attributes);
		return cursor.clone().moveTo(position) + this._style.apply + this._char + this._style.undo;
	}

	matches(input: StringReader, lookBehind?: IPrediction) {
		const startIndex = input.index;

		// remove any styling CSI before checking the char
		while (input.eatRe(CSI_STYLE_RE) || input.eatRe(PREDICTION_OMIT_RE)) { }

		if (input.eof) {
			return MatchResult.Buffer;
		}

		if (input.eatChar(this._char)) {
			return MatchResult.Success;
		}

		if (lookBehind instanceof CharacterPrediction) {
			// see #112842
			const sillyZshOutcome = input.eatGradually(`\b${lookBehind._char}${this._char}`);
			if (sillyZshOutcome !== MatchResult.Failure) {
				return sillyZshOutcome;
			}
		}

		input.index = startIndex;
		return MatchResult.Failure;
	}
}

class BackspacePrediction implements IPrediction {
	confirmedCells: ICoordinate[] = [];

	protected _appliedAt?: {
		pos: ICoordinate;
		oldAttributes: string;
		oldChar: string;
		isLastChar: boolean;
	};

	get cursorBefore() {
		return this._appliedAt?.pos;
	}

	get cursorAfter() {
		return this._appliedAt ? { ...this._appliedAt.pos, x: Math.max(0, this._appliedAt.pos.x - 1) } : undefined;
	}

	isRepainted(row: ICoordinate, cells: ReadonlyMap<number, ICellSnapshot>) {
		const target = this.cursorAfter;
		return !!target && isSameCell({ ...row, x: target.x }, target) && cells.has(target.x);
	}

	constructor(private readonly _terminal: Terminal) { }

	apply(_: IBuffer, cursor: Cursor) {
		// at eol if everything to the right is whitespace (zsh will emit a "clear line" code in this case)
		// todo: can be optimized if `getTrimmedLength` is exposed from xterm
		const isLastChar = !cursor.getLine()?.translateToString(undefined, cursor.x).trim();
		const pos = cursor.coordinate;
		const move = cursor.shift(cursor.x > 0 ? -1 : 0);
		const cell = cursor.getCell();
		this._appliedAt = cell
			? { isLastChar, pos, oldAttributes: cell.attributes, oldChar: cell.chars }
			: { isLastChar, pos, oldAttributes: '', oldChar: '' };

		cursor.setCell('', '');
		return move + VT.DeleteChar;
	}

	rollback(cursor: Cursor, attributes = attributesToSeq(core(this._terminal)._inputHandler._curAttrData)) {
		if (!this._appliedAt) {
			return ''; // not applied
		}

		const { oldAttributes, oldChar, pos } = this._appliedAt;
		const target = { ...pos, x: Math.max(0, pos.x - 1) };
		cursor.setCellAt(target, oldChar, oldAttributes);
		const move = cursor.moveTo(target);
		if (!oldChar) {
			return move + oldAttributes + VT.DeleteChar + cursor.moveTo(pos) + attributes;
		}

		return move + oldAttributes + oldChar + cursor.moveTo(pos) + attributes;
	}

	rollForwards(cursor: Cursor, input: string, _lookBehind?: IPrediction, attributes = attributesToSeq(core(this._terminal)._inputHandler._curAttrData)) {
		if (!this._appliedAt) {
			return '';
		}

		const pos = this._appliedAt.pos;
		const target = { ...pos, x: Math.max(0, pos.x - 1) };
		if (input === '\b') {
			// A bare backspace only moves the cursor; fish then repaints the rest of the line.
			const { oldChar, oldAttributes } = this._appliedAt;
			cursor.setCellAt(target, oldChar, oldAttributes);
			this.confirmedCells = [target];
			const move = cursor.clone();
			return move.moveTo(target) + oldAttributes + (oldChar || VT.DeleteChar) + attributes + move.moveTo(pos) + input;
		}
		const isSpaceEcho = input === '\b \b';
		const endX = isSpaceEcho ? target.x + 1 : cursor.cols;
		this.confirmedCells = [];
		for (let x = target.x; x < endX; x++) {
			const cellPosition = { ...target, x };
			cursor.setCellAt(cellPosition, isSpaceEcho ? ' ' : '', attributes);
			this.confirmedCells.push(cellPosition);
		}
		return cursor.clone().moveTo(pos) + input;
	}

	reapplyAfterCellChange(cursor: Cursor, position: ICoordinate) {
		if (!this._appliedAt || !isSameCell({ ...this._appliedAt.pos, x: Math.max(0, this._appliedAt.pos.x - 1) }, position)) {
			return '';
		}

		const cell = cursor.getCellAt(position);
		this._appliedAt.oldChar = cell?.chars ?? '';
		this._appliedAt.oldAttributes = cell?.attributes ?? '';
		cursor.setCellAt(position, '', '');
		return cursor.clone().moveTo(position) + VT.DeleteChar;
	}

	matches(input: StringReader) {
		// Erasing to the end is authoritative even when text, such as an autosuggestion, follows.
		const r1 = input.eatGradually(`\b${VT.Csi}K`);
		if (r1 !== MatchResult.Failure) {
			return r1;
		}

		// Mid-line, a space may begin the shell's repaint of the remaining text.
		if (this._appliedAt?.isLastChar) {
			const r2 = input.eatGradually(`\b \b`);
			if (r2 !== MatchResult.Failure) {
				return r2;
			}
		}

		return input.eatChar('\b') ? MatchResult.Success : MatchResult.Failure;
	}
}

class NewlinePrediction implements IPrediction {
	protected _prevPosition?: ICoordinate;

	apply(_: IBuffer, cursor: Cursor) {
		this._prevPosition = cursor.coordinate;
		cursor.move(0, cursor.y + 1);
		return '\r\n';
	}

	rollback(cursor: Cursor) {
		return this._prevPosition ? cursor.moveTo(this._prevPosition) : '';
	}

	rollForwards(cursor: Cursor) {
		return this._prevPosition
			? cursor.clone().moveTo({ ...this._prevPosition, x: 0, y: this._prevPosition.y + 1 })
			: '';
	}

	matches(input: StringReader) {
		return input.eatGradually('\r\n');
	}
}

/**
 * Prediction when the cursor reaches the end of the line. Similar to newline
 * prediction, but shells handle it slightly differently.
 */
class LinewrapPrediction extends NewlinePrediction implements IPrediction {
	override apply(_: IBuffer, cursor: Cursor) {
		this._prevPosition = cursor.coordinate;
		cursor.move(0, cursor.y + 1);
		return ' \r';
	}

	override rollForwards(cursor: Cursor, input = '', _lookBehind?: IPrediction, attributes = '') {
		if (this._prevPosition) {
			// The wrapping space lands at the start of the next row; scrolling or zsh's EL erases that row.
			const row = { ...this._prevPosition, y: this._prevPosition.y + 1 };
			const clearsLine = input.endsWith(VT.DeleteRestOfLine);
			if (clearsLine || this._prevPosition.y >= cursor.rows - 1) {
				for (let x = 0; x < cursor.cols; x++) {
					cursor.setCellAt({ ...row, x }, '', attributes);
				}
			}
			if (input.startsWith(' ') && !clearsLine) {
				cursor.setCellAt({ ...row, x: 0 }, ' ', attributes);
			}
		}
		return super.rollForwards(cursor);
	}

	override matches(input: StringReader) {
		// bash and zshell add a space which wraps in the terminal, then a CR. A lone
		// space is not buffered since it may be a typed space after a deferred wrap.
		if (input.eatStr(' \r')) {
			if (input.eof && input.hasPendingInput) {
				return MatchResult.Buffer;
			}
			// zshell additionally adds a clear line after wrapping to be safe -- eat it
			return input.eatGradually(VT.DeleteRestOfLine) === MatchResult.Buffer ? MatchResult.Buffer : MatchResult.Success;
		}

		return input.eatGradually('\r\n');
	}
}

class CursorMovePrediction implements IPrediction {
	private _applied?: {
		rollForward: string;
		prevPosition: number;
		amount: number;
		start: ICoordinate;
		target: ICoordinate;
	};

	constructor(
		private readonly _direction: CursorMoveDirection,
		private readonly _moveByWords: boolean,
		private readonly _amount: number,
	) { }

	apply(buffer: IBuffer, cursor: Cursor) {
		const prevPosition = cursor.x;
		const target = this.getTarget(buffer, cursor);
		this._applied = {
			amount: Math.abs(cursor.x - target.x),
			prevPosition,
			start: cursor.coordinate,
			target: target.coordinate,
			rollForward: cursor.moveTo(target),
		};

		return this._applied.rollForward;
	}

	get cursorBefore() {
		return this._applied?.start;
	}

	get cursorAfter() {
		return this._applied?.target;
	}

	isRepainted(row: ICoordinate) {
		return !!this._applied && isSameCell({ ...row, x: this._applied.target.x }, this._applied.target);
	}

	getTarget(buffer: IBuffer, cursor: Cursor) {
		const { _amount: amount, _direction: direction, _moveByWords: moveByWords } = this;
		const delta = direction === CursorMoveDirection.Back ? -1 : 1;

		const target = cursor.clone();
		if (moveByWords) {
			for (let i = 0; i < amount; i++) {
				moveToWordBoundary(buffer, target, delta);
			}
		} else {
			target.shift(delta * amount);
		}

		return target;
	}

	rollback(cursor: Cursor) {
		if (!this._applied) {
			return '';
		}

		return cursor.move(this._applied.prevPosition, cursor.y);
	}

	rollForwards() {
		return this._applied?.rollForward ?? '';
	}

	matches(input: StringReader) {
		if (!this._applied) {
			return MatchResult.Failure;
		}

		const direction = this._direction;
		const { amount, rollForward, target } = this._applied;

		if (target.x > 0) {
			const reposition = input.eatGradually(`\r${VT.Csi}${target.x}C`);
			if (reposition !== MatchResult.Failure) {
				return reposition;
			}
		}


		// arg can be omitted to move one character. We don't eatGradually() here
		// or below moves that don't go as far as the cursor would be buffered
		// indefinitely
		if (input.eatStr(`${VT.Csi}${direction}`.repeat(amount))) {
			return MatchResult.Success;
		}

		// \b is the equivalent to moving one character back
		if (direction === CursorMoveDirection.Back) {
			if (input.eatStr(`\b`.repeat(amount))) {
				return MatchResult.Success;
			}
		}

		// check if the cursor position is set absolutely
		if (rollForward) {
			const r = input.eatGradually(rollForward);
			if (r !== MatchResult.Failure) {
				return r;
			}
		}

		// check for a relative move in the direction
		return input.eatGradually(`${VT.Csi}${amount}${direction}`);
	}
}

export class PredictionStats extends Disposable {
	private readonly _stats: [latency: number, correct: boolean][] = [];
	private _index = 0;
	private readonly _addedAtTime = new WeakMap<IPrediction, number>();
	private readonly _changeEmitter = this._register(new Emitter<void>());
	readonly onChange = this._changeEmitter.event;

	/**
	 * Gets the percent (0-1) of predictions that were accurate.
	 */
	get accuracy() {
		let correctCount = 0;
		for (const [, correct] of this._stats) {
			if (correct) {
				correctCount++;
			}
		}

		return correctCount / (this._stats.length || 1);
	}

	/**
	 * Gets the number of recorded stats.
	 */
	get sampleSize() {
		return this._stats.length;
	}

	/**
	 * Gets latency stats of successful predictions.
	 */
	get latency() {
		const latencies = this._stats.filter(([, correct]) => correct).map(([s]) => s).sort((a, b) => a - b);

		return {
			count: latencies.length,
			min: latencies[0],
			median: latencies[Math.floor(latencies.length / 2)],
			max: latencies[latencies.length - 1],
		};
	}

	/**
	 * Gets the maximum observed latency.
	 */
	get maxLatency() {
		let max = -Infinity;
		for (const [latency, correct] of this._stats) {
			if (correct) {
				max = Math.max(latency, max);
			}
		}

		return max;
	}

	constructor(timeline: PredictionTimeline) {
		super();
		this._register(timeline.onPredictionAdded(p => this._addedAtTime.set(p, Date.now())));
		this._register(timeline.onPredictionSucceeded(this._pushStat.bind(this, true)));
		this._register(timeline.onPredictionFailed(this._pushStat.bind(this, false)));
	}

	private _pushStat(correct: boolean, prediction: IPrediction) {
		if (isUnpredictedInputBoundary(prediction)) {
			return;
		}
		const started = this._addedAtTime.get(prediction)!;
		this._stats[this._index] = [Date.now() - started, correct];
		this._index = (this._index + 1) % StatsConstants.StatsBufferSize;
		this._changeEmitter.fire();
	}
}

export class PredictionTimeline extends Disposable {
	/**
	 * Expected queue of events. Only predictions for the lowest are
	 * written into the terminal.
	 */
	private _expected: ({ gen: number; p: IPrediction })[] = [];

	/**
	 * Current prediction generation.
	 */
	private _currentGen = 0;

	/**
	 * Current cursor position -- kept outside the buffer since it can be ahead
	 * if typing swiftly. The position of the cursor that the user is currently
	 * looking at on their screen (or will be looking at after all pending writes
	 * are flushed.)
	 */
	private _physicalCursor: Cursor | undefined;

	/**
	 * Cursor position taking into account all (possibly not-yet-applied)
	 * predictions. A new prediction inserted, if applied, will be applied at
	 * the position of the tentative cursor.
	 */
	private _tenativeCursor: Cursor | undefined;

	/**
	 * Previously sent data that was buffered and should be prepended to the
	 * next input.
	 */
	private _inputBuffer?: string;
	private _incompleteEscapeChunks: string[] = [];
	private readonly _escapeScanner = new EscapeSequenceScanner();
	/** Authoritative attributes can be ahead of xterm's asynchronously parsed pen. */
	private _pendingAttributes?: string;

	/**
	 * Whether predictions are echoed to the terminal. If false, predictions
	 * will still be computed internally for latency metrics, but input will
	 * never be adjusted.
	 */
	private _showPredictions = false;

	/**
	 * The last successfully-made prediction.
	 */
	private _lookBehind?: IPrediction;
	private _hasRepaint = false;

	private readonly _addedEmitter = this._register(new Emitter<IPrediction>());
	readonly onPredictionAdded = this._addedEmitter.event;
	private readonly _failedEmitter = this._register(new Emitter<IPrediction>());
	readonly onPredictionFailed = this._failedEmitter.event;
	private readonly _succeededEmitter = this._register(new Emitter<IPrediction>());
	readonly onPredictionSucceeded = this._succeededEmitter.event;

	private get _currentGenerationPredictions() {
		return this._expected.filter(({ gen }) => gen === this._expected[0].gen).map(({ p }) => p);
	}

	get isShowingPredictions() {
		return this._showPredictions;
	}

	get length() {
		return this._expected.length;
	}

	get hasIncompleteInput() {
		return !!this._inputBuffer || this._escapeScanner.isIncomplete;
	}

	/** Whether input sent without a prediction has not been echoed yet. */
	get hasUnpredictedInput() {
		return this._expected.some(({ p }) => isUnpredictedInputBoundary(p));
	}

	get canPredict() {
		return !hasPendingWrites(this.terminal) || (this._expected.length > 0 && this._pendingAttributes === undefined);
	}

	resetCursorVisibility() {
		this._escapeScanner.cursorVisibility = undefined;
	}

	constructor(readonly terminal: Terminal, private readonly _style: TypeAheadStyle) {
		super();
		this._register(terminal.onWriteParsed(() => {
			if (!hasPendingWrites(terminal)) {
				this._pendingAttributes = undefined;
			}
		}));
	}

	private get _currentAttributes() {
		return this._pendingAttributes ?? this._style.currentAttributes;
	}

	setShowPredictions(show: boolean) {
		if (show === this._showPredictions || (show && this.hasIncompleteInput)) {
			return;
		}

		if (!show && this.hasIncompleteInput) {
			this.undoAllPredictions();
			if (this._incompleteEscapeChunks.length) {
				this.terminal.write(this._incompleteEscapeChunks.join(''));
				this._incompleteEscapeChunks = [];
			}
		}

		// console.log('set predictions:', show);
		this._showPredictions = show;

		const buffer = this._getActiveBuffer();
		if (!buffer) {
			return;
		}

		const toApply = this._currentGenerationPredictions;
		if (show) {
			const tentative = this._tenativeCursor;
			this.clearCursor();
			this.terminal.write(toApply.map(p => p.apply(buffer, this.physicalCursor(buffer))).join(''));
			this._tenativeCursor = tentative;
		} else {
			this.terminal.write(this._rollbackPredictions(toApply, buffer, this.physicalCursor(buffer).clone()));
		}
	}

	/**
	 * Undoes any predictions written and resets expectations.
	 */
	undoAllPredictions(flushIncompleteInput = false) {
		let toFlush = this._inputBuffer ?? '';
		if (flushIncompleteInput) {
			toFlush += this._incompleteEscapeChunks.join('');
			this._incompleteEscapeChunks = [];
		}
		const buffer = this._getActiveBuffer();
		if (this._showPredictions && buffer) {
			this.terminal.write(this._rollbackPredictions(this._currentGenerationPredictions, buffer) + toFlush);
		}

		this._inputBuffer = undefined;
		this._clearPredictionState();
	}

	private _hasLongIncompleteEscape() {
		let length = 0;
		for (const chunk of this._incompleteEscapeChunks) {
			length += chunk.length;
		}
		return length > MAX_INCOMPLETE_ESCAPE_LENGTH;
	}

	/**
	 * Withheld output is not acknowledged for flow control, so a long control
	 * string (e.g. an image or clipboard payload) could pause the pty before its
	 * terminator arrives. Give up on predictions and stream it through instead.
	 */
	private _abandonIncompleteEscape(input: string, originalInput: string): string {
		const buffer = this._getActiveBuffer();
		const output = this._showPredictions
			? (buffer ? this._rollbackPredictions(this._currentGenerationPredictions, buffer) : '') + (this._inputBuffer ?? '') + input + this._incompleteEscapeChunks.join('')
			: originalInput;
		this._inputBuffer = undefined;
		this._incompleteEscapeChunks = [];
		this._clearPredictionState();
		return output;
	}

	private _rollbackPredictions(predictions: IPrediction[], buffer: IBuffer, cursor = this.physicalCursor(buffer), attributes = this._currentAttributes): string {
		const restoreStyle = predictions.some(p => p.affectsStyle)
			? attributes
			: '';
		return predictions.reverse().map(p => p.rollback(cursor, attributes)).join('') + restoreStyle;
	}

	/**
	 * Should be called when input is incoming to the temrinal.
	 */
	beforeServerInput(input: string): string {
		if (!hasPendingWrites(this.terminal)) {
			this._pendingAttributes = undefined;
		}
		// Nothing is drawn while an unpredicted input boundary is at the head, so the rest of an escape sequence
		// that was already streaming passes through, and the boundary waits for the output after it.
		if (this._escapeScanner.isIncomplete && !this._incompleteEscapeChunks.length && isUnpredictedInputBoundary(this._expected[0]?.p)) {
			const end = this._escapeScanner.scanContinuation(input);
			return input.slice(0, end) + (end < input.length ? this.beforeServerInput(input.slice(end)) : '');
		}

		const originalInput = input;
		const incompleteEscape = this._escapeScanner.scan(input);
		if (!this._expected.length) {
			const buffered = (this._inputBuffer ?? '') + this._incompleteEscapeChunks.join('');
			this._inputBuffer = undefined;
			this._incompleteEscapeChunks = [];
			this._clearPredictionState();
			return this._showPredictions ? buffered + input : originalInput;
		}

		if (this._incompleteEscapeChunks.length) {
			if (incompleteEscape === 0) {
				this._incompleteEscapeChunks.push(input);
				return this._hasLongIncompleteEscape()
					? this._abandonIncompleteEscape('', originalInput)
					: this._showPredictions ? '' : originalInput;
			}
			const complete = incompleteEscape === -1 ? input : input.slice(0, incompleteEscape);
			input = this._incompleteEscapeChunks.join('') + complete;
			this._incompleteEscapeChunks = incompleteEscape === -1 ? [] : [originalInput.slice(incompleteEscape)];
		} else if (incompleteEscape !== -1) {
			this._incompleteEscapeChunks.push(input.slice(incompleteEscape));
			input = input.slice(0, incompleteEscape);
		}

		if (this._hasLongIncompleteEscape()) {
			return this._abandonIncompleteEscape(input, originalInput);
		}

		if (this._inputBuffer) {
			input = this._inputBuffer + input;
			this._inputBuffer = undefined;
		}

		const buffer = this._getActiveBuffer();
		if (!buffer) {
			this._clearPredictionState();
			return this._showPredictions ? input : originalInput;
		}

		let output = '';
		let attributes = this._currentAttributes;

		const reader = new StringReader(input, incompleteEscape !== -1);
		const startingGen = this._expected[0].gen;
		const emitPredictionOmitted = () => {
			const omit = reader.eatRe(PREDICTION_OMIT_RE);
			if (omit) {
				output += omit[0];
			}
		};

		ReadLoop: while (this._expected.length && reader.remaining > 0) {
			emitPredictionOmitted();
			if (reader.eof) {
				break;
			}

			const { p: prediction, gen } = this._expected[0];
			const cursor = this.physicalCursor(buffer);
			const beforeTestReaderIndex = reader.index;
			// A repaint cannot confirm unpredicted input.
			const repaint = isUnpredictedInputBoundary(prediction) ? MatchResult.Failure : this._readRepaint(reader, cursor, attributes);
			if (repaint === MatchResult.Buffer) {
				this._inputBuffer = input.slice(beforeTestReaderIndex);
				reader.index = input.length;
				break;
			}
			if (repaint !== MatchResult.Failure) {
				this._hasRepaint = true;
				attributes = repaint.attributes;
				output += cursor.clone().moveTo(repaint.origin) + input.slice(beforeTestReaderIndex, reader.index);
				for (let i = 0; i < repaint.confirmed; i++) {
					const { p } = this._expected.shift()!;
					this._succeededEmitter.fire(p);
					this._lookBehind = p instanceof TentativeBoundary ? p.inner : p;
				}
				if (repaint.confirmed && this._expected[0]?.gen !== startingGen) {
					cursor.moveTo(repaint.end);
				}
				for (const [x, cell] of repaint.cells) {
					const position = { ...repaint.origin, x };
					cursor.setCellAt(position, cell.chars, cell.attributes);
					output += this._reapplyPredictions(cursor, position, startingGen, attributes);
				}
				continue;
			}
			switch (prediction.matches(reader, this._lookBehind)) {
				case MatchResult.Success: {
					// if the input character matches what the next prediction expected, undo
					// the prediction and write the real character out.
					const eaten = input.slice(beforeTestReaderIndex, reader.index);
					attributes += getStyles(eaten);
					if (isUnpredictedInputBoundary(prediction)) {
						// The echo moves the cursor from a position that was never tracked.
						output += eaten;
						this.clearCursor();
					} else if (gen === startingGen) {
						output += prediction.rollForwards?.(cursor, eaten, this._lookBehind, attributes);
					} else {
						prediction.apply(buffer, this.physicalCursor(buffer)); // move cursor for additional apply
						const confirmed = prediction.rollForwards(cursor, eaten, this._lookBehind, attributes);
						output += prediction instanceof TentativeBoundary ? confirmed : eaten;
					}

					this._succeededEmitter.fire(prediction);
					this._lookBehind = prediction instanceof TentativeBoundary ? prediction.inner : prediction;
					this._expected.shift();
					// Confirmed repaints must not overwrite edits that are still pending.
					for (const position of prediction.confirmedCells ?? []) {
						output += this._reapplyPredictions(cursor, position, startingGen, attributes);
					}
					break;
				}
				case MatchResult.Buffer:
					// on a buffer, store the remaining data and completely read data
					// to be output as normal.
					this._inputBuffer = input.slice(beforeTestReaderIndex);
					reader.index = input.length;
					break ReadLoop;
				case MatchResult.Failure: {
					// on a failure, roll back all remaining items in this generation
					// and clear predictions, since they are no longer valid
					output += this._rollbackPredictions(this._expected.filter(p => p.gen === startingGen).map(({ p }) => p), buffer, cursor, attributes);
					this._clearPredictionState();
					this._failedEmitter.fire(prediction);
					break ReadLoop;
				}
			}
		}

		emitPredictionOmitted();
		this._pendingAttributes = attributes;

		// Extra data (like the result of running a command) should cause us to
		// reset the cursor
		if (!reader.eof) {
			output += reader.rest;
			this._clearPredictionState();
		}

		// If we passed a generation boundary, apply the current generation's predictions
		if (this._expected.length && startingGen !== this._expected[0].gen && !isUnpredictedInputBoundary(this._expected[0].p)) {
			for (const { p, gen } of this._expected) {
				if (gen !== this._expected[0].gen) {
					break;
				}
				output += p.apply(buffer, this.physicalCursor(buffer));
			}
			output += attributes;
		}

		// Nothing is drawn while unpredicted input waits for its echo, so the cursor and pen are not known yet.
		if (isUnpredictedInputBoundary(this._expected[0]?.p)) {
			this.clearCursor();
		}

		if (!this._showPredictions) {
			return originalInput;
		}

		if (output.length === 0 || output === input) {
			return output;
		}

		if (this._physicalCursor && this._physicalCursor.x < this.terminal.cols) {
			output += this._physicalCursor.moveInstruction();
		}

		// prevent cursor flickering while typing
		const cursorVisibility = this._escapeScanner.cursorVisibility
			?? (core(this.terminal).coreService.isCursorHidden ? VT.HideCursor : VT.ShowCursor);
		output = VT.HideCursor + output + cursorVisibility;

		return output;
	}

	private _reapplyPredictions(cursor: Cursor, position: ICoordinate, generation: number, attributes: string) {
		let output = '';
		for (const pending of this._expected) {
			if (pending.gen !== generation) {
				break;
			}
			const reapplied = pending.p.reapplyAfterCellChange?.(cursor, position, attributes);
			if (reapplied) {
				output += reapplied + (pending.p.affectsStyle ? attributes : '');
			}
		}
		return output;
	}

	/**
	 * Reads a row-local repaint from the authoritative cursor, such as fish's and
	 * PSReadLine's echoes. Once it has drawn, the next column placement must
	 * confirm pending predictions or return to the origin column.
	 */
	private _readRepaint(input: StringReader, cursor: Cursor, attributes: string) {
		const origin = this._lookBehind?.cursorAfter ?? this._expected[0].p.cursorBefore;
		if (!origin || origin.x >= cursor.cols || origin.baseY !== cursor.baseY || (!this._hasRepaint && !REPAINT_HINT_RE.test(input.rest))) {
			return MatchResult.Failure;
		}
		const start = input.index;
		const cells = new Map<number, ICellSnapshot>();
		let x = origin.x;
		let positioned = false;
		let returned = false;
		const fail = (): MatchResult.Failure => {
			input.index = start;
			return MatchResult.Failure;
		};
		const settle = () => {
			const end = { ...origin, x };
			let confirmed = 0;
			for (let i = 0; i < this._expected.length && this._expected[i].p.isRepainted?.(origin, cells); i++) {
				const after = this._expected[i].p.cursorAfter;
				if (after && isSameCell(after, end)) {
					confirmed = i + 1;
				}
			}
			// A repaint confirming nothing may recolor text before the cursor, but not change it.
			const unchanged = () => [...cells].every(([column, cell]) => column >= origin.x || (cursor.getCellAt({ ...origin, x: column })?.chars || ' ') === (cell.chars || ' '));
			return confirmed || (x === origin.x && unchanged()) ? { origin, end, attributes, cells, confirmed } : undefined;
		};
		while (!input.eof && input.index - start < cursor.cols * 16) {
			const style = input.eatRe(CSI_STYLE_RE);
			if (style) {
				attributes += style[0];
				continue;
			}
			if (input.eatRe(PREDICTION_OMIT_RE)) {
				continue;
			}
			if (input.eatChar('\r')) {
				x = 0;
				positioned = returned = true;
				continue;
			}
			if (input.eatChar('\b')) {
				x = Math.max(0, x - 1);
				continue;
			}
			if (input.eatRe(/^\x1b\[0?K/)) {
				// Erasing to the right clears fish's autosuggestion; pending predictions there are redrawn.
				for (let column = x; column < cursor.cols; column++) {
					if ((cursor.getCellAt({ ...origin, x: column })?.width ?? 1) !== 1) {
						return fail();
					}
					cells.set(column, { chars: '', attributes, width: 1 });
				}
				continue;
			}
			const move = input.eatRe(/^\x1b\[(?<amount>[0-9]*)(?<direction>[CD])/);
			const position = input.eatRe(/^\x1b\[(?<row>[0-9]*)(?:;(?<column>[0-9]*))?H/);
			if (move || position) {
				if (position && (Number(position.groups!.row) || 1) - 1 !== origin.y) {
					return fail();
				}
				x = position
					? (Number(position.groups!.column) || 1) - 1
					: x + (Number(move!.groups!.amount) || 1) * (move!.groups!.direction === 'C' ? 1 : -1);
				if (x < 0 || x >= cursor.cols) {
					return fail();
				}
				positioned = true;
				const settled = settle();
				// Only absolute positioning may precede the repaint; fish's \r CSI n C returns to its cursor.
				if (settled || cells.size || (move && returned)) {
					return settled ?? fail();
				}
				continue;
			}
			const char = input.eatCharCode(32, 127);
			if (char === undefined || x >= cursor.cols || cursor.getCellAt({ ...origin, x })?.width !== 1) {
				return fail();
			}
			cells.set(x, { chars: String.fromCharCode(char), attributes, width: 1 });
			x++;
		}

		const incomplete = input.eof && (this._hasRepaint || (positioned && !cells.size));
		input.index = start;
		return incomplete ? MatchResult.Buffer : MatchResult.Failure;
	}

	/**
	 * Clears any expected predictions and stored state. Should be called when
	 * the pty gives us something we don't recognize.
	 */
	private _clearPredictionState() {
		this._expected = [];
		this.clearCursor();
		this._lookBehind = undefined;
		this._hasRepaint = false;
	}

	/**
	 * Appends a typeahead prediction.
	 */
	addPrediction(buffer: IBuffer, prediction: IPrediction) {
		if (!this._expected.length) {
			this._hasRepaint = false;
		}
		this._expected.push({ gen: this._currentGen, p: prediction });
		this._addedEmitter.fire(prediction);

		if (this._currentGen !== this._expected[0].gen) {
			prediction.apply(buffer, this.tentativeCursor(buffer));
			return false;
		}

		const text = prediction.apply(buffer, this.physicalCursor(buffer));
		this._tenativeCursor = undefined; // next read will get or clone the physical cursor

		if (this._showPredictions && text) {
			// console.log('predict:', JSON.stringify(text));
			this.terminal.write(text);
		}

		return true;
	}

	/**
	 * Appends a prediction followed by a boundary. The predictions applied
	 * after this one will only be displayed after the give prediction matches
	 * pty output/
	 */
	addBoundary(): void;
	addBoundary(buffer: IBuffer, prediction: IPrediction): boolean;
	addBoundary(buffer?: IBuffer, prediction?: IPrediction) {
		let applied = false;
		if (buffer && prediction) {
			// We apply the prediction so that it's matched against, but wrapped
			// in a tentativeboundary so that it doesn't affect the physical cursor.
			// Then we apply it specifically to the tentative cursor.
			applied = this.addPrediction(buffer, new TentativeBoundary(prediction));
			prediction.apply(buffer, this.tentativeCursor(buffer));
		}
		this._currentGen++;
		return applied;
	}

	/**
	 * Peeks the last prediction written.
	 */
	peekEnd(): IPrediction | undefined {
		return this._expected[this._expected.length - 1]?.p;
	}

	/**
	 * Peeks the first pending prediction.
	 */
	peekStart(): IPrediction | undefined {
		return this._expected[0]?.p;
	}

	/**
	 * Current position of the cursor in the terminal.
	 */
	physicalCursor(buffer: IBuffer) {
		if (!this._physicalCursor) {
			if (this._showPredictions) {
				flushOutput(this.terminal);
			}
			this._physicalCursor = new Cursor(this.terminal.rows, this.terminal.cols, buffer);
		}

		return this._physicalCursor;
	}

	/**
	 * Cursor position if all predictions and boundaries that have been inserted
	 * so far turn out to be successfully predicted.
	 */
	tentativeCursor(buffer: IBuffer) {
		if (!this._tenativeCursor) {
			this._tenativeCursor = this.physicalCursor(buffer).clone();
		}

		return this._tenativeCursor;
	}

	clearCursor() {
		this._physicalCursor = undefined;
		this._tenativeCursor = undefined;
	}

	private _getActiveBuffer() {
		const buffer = this.terminal.buffer.active;
		return buffer.type === 'normal' ? buffer : undefined;
	}
}

const foregroundArgs = (cell: XtermAttributes) => {
	const color = cell.getFgColor();
	if (cell.isFgRGB()) {
		return [38, 2, (color >>> 16) & 0xFF, (color >>> 8) & 0xFF, color & 0xFF];
	}
	return cell.isFgPalette() ? [38, 5, color] : [39];
};

/**
 * Gets the escape sequence args to restore state/appearance in the cell.
 */
const attributesToArgs = (cell: XtermAttributes) => {
	if (cell.isAttributeDefault()) { return [0]; }

	const args: SingleOrMany<number>[] = [0];
	if (cell.isBold()) { args.push(1); }
	if (cell.isDim()) { args.push(2); }
	if (cell.isItalic()) { args.push(3); }
	const underlineStyle = cell.getUnderlineStyle();
	if (underlineStyle) {
		args.push(4);
		if (underlineStyle > 1) {
			args.push([underlineStyle]);
		}
	}
	if (cell.isBlink()) { args.push(5); }
	if (cell.isInverse()) { args.push(7); }
	if (cell.isInvisible()) { args.push(8); }
	if (cell.isStrikethrough()) { args.push(9); }
	if (cell.isOverline()) { args.push(53); }

	args.push(...foregroundArgs(cell));

	if (cell.isBgRGB()) { args.push(48, 2, (cell.getBgColor() >>> 16) & 0xFF, (cell.getBgColor() >>> 8) & 0xFF, cell.getBgColor() & 0xFF); }
	if (cell.isBgPalette()) { args.push(48, 5, cell.getBgColor()); }
	if (cell.isBgDefault()) { args.push(49); }

	if (cell.hasExtendedAttrs?.()) {
		if (cell.isUnderlineColorRGB()) { args.push(58, 2, (cell.getUnderlineColor() >>> 16) & 0xFF, (cell.getUnderlineColor() >>> 8) & 0xFF, cell.getUnderlineColor() & 0xFF); }
		if (cell.isUnderlineColorPalette()) { args.push(58, 5, cell.getUnderlineColor()); }
	}

	return args;
};

const styleArgsToSeq = (args: ReadonlyArray<SingleOrMany<number>>) => {
	let params = '';
	for (const arg of args) {
		if (isNumber(arg)) {
			params += `${params ? ';' : ''}${arg}`;
		} else {
			params += `:${arg.map(value => value === -1 ? '' : value).join(':')}`;
		}
	}
	return `${VT.Csi}${params}m`;
};

/**
 * Gets the escape sequence to restore state/appearance in the cell.
 */
const attributesToSeq = (cell: XtermAttributes) => styleArgsToSeq(attributesToArgs(cell));

/**
 * Holds the local echo style. Predicted characters restore the attribute it
 * changes from the parsed pen, which predictions are only made against once
 * authoritative output has been parsed.
 */
class TypeAheadStyle {
	apply!: string;
	private _applyArgs!: number[];

	private get _pen() {
		return core(this._terminal)._inputHandler._curAttrData;
	}

	get currentAttributes(): string {
		return attributesToSeq(this._pen);
	}

	get undo(): string {
		const pen = this._pen;
		switch (this._applyArgs[0]) {
			case 1:
			case 2:
				return styleArgsToSeq([22, ...(pen.isBold() ? [1] : []), ...(pen.isDim() ? [2] : [])]);
			case 3:
				return styleArgsToSeq([pen.isItalic() ? 3 : 23]);
			case 4: {
				const style = pen.getUnderlineStyle();
				return styleArgsToSeq(style ? [4, [style]] : [24]);
			}
			case 7:
				return styleArgsToSeq([pen.isInverse() ? 7 : 27]);
			default:
				return styleArgsToSeq(foregroundArgs(pen));
		}
	}

	constructor(value: ITerminalTypeAheadConfiguration['localEchoStyle'], private readonly _terminal: Terminal) {
		this.onUpdate(value);
	}

	/**
	 * Updates the current typeahead style.
	 */
	onUpdate(style: ITerminalTypeAheadConfiguration['localEchoStyle']) {
		this._applyArgs = this._getArgs(style);
		this.apply = styleArgsToSeq(this._applyArgs);
	}

	private _getArgs(style: ITerminalTypeAheadConfiguration['localEchoStyle']): number[] {
		switch (style) {
			case 'bold':
				return [1];
			case 'dim':
				return [2];
			case 'italic':
				return [3];
			case 'underlined':
				return [4];
			case 'inverted':
				return [7];
			default: {
				let color: Color;
				try {
					color = Color.fromHex(style);
				} catch {
					color = new Color(new RGBA(255, 0, 0, 1));
				}

				const { r, g, b } = color.rgba;
				return [38, 2, r, g, b];
			}
		}
	}
}

const compileExcludeRegexp = (programs = DEFAULT_LOCAL_ECHO_EXCLUDE) =>
	new RegExp(`\\b(${programs.map(escapeRegExpCharacters).join('|')})\\b`, 'i');

export const enum CharPredictState {
	/** No characters typed on this line yet */
	Unknown,
	/** Has a pending character prediction */
	HasPendingChar,
	/** Character validated on this line */
	Validated,
}

export class TypeAheadAddon extends Disposable implements ITerminalAddon {
	private _typeaheadStyle?: TypeAheadStyle;
	private _typeaheadThreshold: number;
	private _excludeProgramRe: RegExp;
	protected _lastRow?: { y: number; startingX: number; endingX: number; charState: CharPredictState };
	private readonly _lastRowMarker = this._register(new MutableDisposable<IMarker>());
	protected _timeline?: PredictionTimeline;
	private _terminalTitle = '';
	stats?: PredictionStats;

	/** Whether xterm.js signaled that the next data event is user input rather than data the terminal sends on its own. */
	private _isUserInput = false;

	/**
	 * Debounce that clears predictions after a timeout if the PTY doesn't apply them.
	 */
	private _clearPredictionDebounce?: IDisposable;
	private readonly _reevaluatePredictorState = this._register(new RunOnceScheduler(() => {
		if (this.stats && this._timeline) {
			this._reevaluatePredictorStateNow(this.stats, this._timeline);
		}
	}, 100));

	constructor(
		private _processManager: ITerminalProcessManager,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._typeaheadThreshold = this._configurationService.getValue<ITerminalTypeAheadConfiguration>(TERMINAL_CONFIG_SECTION).localEchoLatencyThreshold;
		this._excludeProgramRe = compileExcludeRegexp(this._configurationService.getValue<ITerminalTypeAheadConfiguration>(TERMINAL_CONFIG_SECTION).localEchoExcludePrograms);
		this._register(toDisposable(() => this._clearPredictionDebounce?.dispose()));
	}

	override dispose(): void {
		this._timeline?.undoAllPredictions(true);
		super.dispose();
	}

	activate(terminal: Terminal): void {
		const style = this._typeaheadStyle = new TypeAheadStyle(this._configurationService.getValue<ITerminalTypeAheadConfiguration>(TERMINAL_CONFIG_SECTION).localEchoStyle, terminal);
		const timeline = this._timeline = this._register(new PredictionTimeline(terminal, this._typeaheadStyle));
		const stats = this.stats = this._register(new PredictionStats(this._timeline));

		timeline.setShowPredictions(this._typeaheadThreshold === 0);
		// xterm.js signals typed, pasted and composed input right before its data event, but not replies to terminal queries.
		this._register(core(terminal).coreService.onUserInput(() => {
			this._isUserInput = true;
		}));
		this._register(terminal.onData(e => this._onUserData(e)));
		this._register(terminal.onTitleChange(title => {
			this._terminalTitle = title;
			this._reevaluatePredictorState.schedule();
		}));
		this._register(terminal.onResize(() => {
			timeline.setShowPredictions(false);
			timeline.clearCursor();
			this._reevaluatePredictorState.schedule();
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TERMINAL_CONFIG_SECTION)) {
				style.onUpdate(this._configurationService.getValue<ITerminalTypeAheadConfiguration>(TERMINAL_CONFIG_SECTION).localEchoStyle);
				this._typeaheadThreshold = this._configurationService.getValue<ITerminalTypeAheadConfiguration>(TERMINAL_CONFIG_SECTION).localEchoLatencyThreshold;
				this._excludeProgramRe = compileExcludeRegexp(this._configurationService.getValue<ITerminalTypeAheadConfiguration>(TERMINAL_CONFIG_SECTION).localEchoExcludePrograms);
				this._reevaluatePredictorState.schedule();
			}
		}));
		this._register(this._timeline.onPredictionSucceeded(p => {
			if (this._lastRow?.charState === CharPredictState.HasPendingChar && isTenativeCharacterPrediction(p) && p.inner.appliedAt) {
				if (p.inner.appliedAt.pos.y + p.inner.appliedAt.pos.baseY === this._lastRow.y) {
					this._lastRow.charState = CharPredictState.Validated;
				}
			}
		}));
		this._register(timeline.onPredictionFailed(() => {
			if (this._lastRow?.charState === CharPredictState.HasPendingChar) {
				this._lastRow.charState = CharPredictState.Unknown;
			}
		}));
		this._register(this._processManager.onBeforeProcessData(e => this._onBeforeProcessData(e)));

		const nextStatsSend = this._register(new RunOnceScheduler(() => this._sendLatencyStats(stats), StatsConstants.StatsSendTelemetryEvery));
		this._register(stats.onChange(() => {
			if (!nextStatsSend.isScheduled()) {
				nextStatsSend.schedule();
			}

			this._reevaluatePredictorState.schedule();
		}));
	}

	reset() {
		this._lastRow = undefined;
		this._lastRowMarker.clear();
		this._timeline?.resetCursorVisibility();
	}

	/**
	 * Input sent without a prediction still reaches the pty, so later
	 * predictions stay hidden until its echo arrives.
	 */
	private _waitForUnpredictedInput(timeline: PredictionTimeline, data: string, isUserInput: boolean) {
		// Data the terminal sends on its own, like replies to terminal queries, is consumed by the shell without an echo.
		if (!isUserInput) {
			return;
		}
		if (this._lastRow) {
			this._lastRow.charState = CharPredictState.Unknown;
		}
		const buffer = timeline.terminal.buffer.active;
		if (PRINTABLE_INPUT_RE.test(data)) {
			for (const char of data) {
				timeline.addBoundary(buffer, new UnpredictedInputBoundary(new CharacterPrediction(this._typeaheadStyle!, char)));
			}
		} else {
			timeline.addBoundary(buffer, new UnpredictedInputBoundary());
		}
		this._deferClearingPredictions();
	}

	private _deferClearingPredictions() {
		if (!this.stats || !this._timeline) {
			return;
		}

		this._clearPredictionDebounce?.dispose();
		if (this._timeline.length === 0 || this._timeline.peekStart()?.clearAfterTimeout === false) {
			this._clearPredictionDebounce = undefined;
			return;
		}

		this._clearPredictionDebounce = disposableTimeout(
			() => {
				this._timeline?.undoAllPredictions();
				if (this._lastRow?.charState === CharPredictState.HasPendingChar) {
					this._lastRow.charState = CharPredictState.Unknown;
				}
			},
			Math.max(500, this.stats.maxLatency * 3 / 2),
			this._store
		);
	}

	protected _reevaluatePredictorStateNow(stats: PredictionStats, timeline: PredictionTimeline) {
		if (this._excludeProgramRe.test(this._terminalTitle)) {
			timeline.setShowPredictions(false);
		} else if (this._typeaheadThreshold < 0) {
			timeline.setShowPredictions(false);
		} else if (this._typeaheadThreshold === 0) {
			timeline.setShowPredictions(true);
		} else if (stats.sampleSize > StatsConstants.StatsMinSamplesToTurnOn && stats.accuracy > StatsConstants.StatsMinAccuracyToTurnOn) {
			const latency = stats.latency.median;
			if (latency >= this._typeaheadThreshold) {
				timeline.setShowPredictions(true);
			} else if (latency < this._typeaheadThreshold * StatsConstants.StatsToggleOffThreshold) {
				timeline.setShowPredictions(false);
			}
		}
	}

	private _sendLatencyStats(stats: PredictionStats) {
		/* __GDPR__
			"terminalLatencyStats" : {
				"owner": "anthonykim1",
				"min" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"max" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"median" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"count" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"predictionAccuracy" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
			}
		 */
		this._telemetryService.publicLog('terminalLatencyStats', {
			...stats.latency,
			predictionAccuracy: stats.accuracy,
		});
	}

	private _onUserData(data: string): void {
		// Consumed first, so replies sent while this input is handled are not mistaken for user input.
		const isUserInput = this._isUserInput;
		this._isUserInput = false;
		if (this._timeline?.terminal.buffer.active.type !== 'normal') {
			return;
		}
		if (this._timeline.hasIncompleteInput || this._timeline.hasUnpredictedInput) {
			this._waitForUnpredictedInput(this._timeline, data, isUserInput);
			return;
		}

		// console.log('user data:', JSON.stringify(data));

		const terminal = this._timeline.terminal;
		// Predictions assume characters overwrite cells and wrap at the right margin.
		if (terminal.modes.insertMode || !terminal.modes.wraparoundMode) {
			return;
		}
		// xterm.js can restore (DECRC, ?1049l) an underline flag without its extended style; no SGR reproduces that pen.
		const pen = core(terminal)._inputHandler._curAttrData;
		if (pen.isUnderline() && !pen.getUnderlineStyle()) {
			return;
		}
		const buffer = terminal.buffer.active;

		// A virtual cursor covers pending prediction writes, not unparsed authoritative cursor/style changes.
		if (!this._timeline.canPredict) {
			this._waitForUnpredictedInput(this._timeline, data, isUserInput);
			return;
		}

		// An untracked pending wrap cannot be restored with an absolute cursor move.
		if (buffer.cursorX >= terminal.cols && this._timeline.length === 0) {
			return;
		}

		// Detect programs like git log/less that use the normal buffer but don't
		// take input by deafult (fixes #109541)
		if (buffer.cursorX === 1 && buffer.cursorY === terminal.rows - 1) {
			if (buffer.getLine(buffer.cursorY + buffer.baseY)?.getCell(0)?.getChars() === ':') {
				return;
			}
		}

		// the following code guards the terminal prompt to avoid being able to
		// arrow or backspace-into the prompt. Record the lowest X value at which
		// the user gave input, and mark all additions before that as tentative.
		const actualY = buffer.baseY + buffer.cursorY;
		const marker = this._lastRowMarker.value;
		if (actualY !== this._lastRow?.y || marker?.isDisposed || (marker && marker.line !== actualY)) {
			this._lastRow = { y: actualY, startingX: buffer.cursorX, endingX: buffer.cursorX, charState: CharPredictState.Unknown };
			this._lastRowMarker.value = terminal.registerMarker(0);
		} else {
			this._lastRow.startingX = Math.min(this._lastRow.startingX, buffer.cursorX);
			this._lastRow.endingX = Math.max(this._lastRow.endingX, this._timeline.physicalCursor(buffer).x);
		}

		const addNavigating = (p: CursorMovePrediction) => {
			const cursor = this._timeline!.tentativeCursor(buffer);
			const target = p.getTarget(buffer, cursor).x;
			if (target === cursor.x) {
				return;
			}
			if (target < this._lastRow!.startingX || target > this._lastRow!.endingX) {
				this._timeline!.addBoundary(buffer, p);
			} else {
				this._timeline!.addPrediction(buffer, p);
			}
		};

		/** @see https://github.com/xtermjs/xterm.js/blob/1913e9512c048e3cf56bb5f5df51bfff6899c184/src/common/input/Keyboard.ts */
		const reader = new StringReader(data);
		while (reader.remaining > 0) {
			if (reader.eatCharCode(127)) { // backspace
				const cursor = this._timeline.tentativeCursor(buffer);
				if (cursor.getCell(cursor.x > 0 ? -1 : 0)?.width === 0) {
					this._timeline.addBoundary(buffer, new HardBoundary());
					break;
				}
				const previous = this._timeline.peekEnd();
				if (previous && previous instanceof CharacterPrediction) {
					this._timeline.addBoundary();
				}

				// backspace must be able to read the previously-written character in
				// the event that it needs to undo it
				if (this._timeline.isShowingPredictions) {
					flushOutput(this._timeline.terminal);
				}

				if (this._timeline.tentativeCursor(buffer).x <= this._lastRow.startingX) {
					this._timeline.addBoundary(buffer, new BackspacePrediction(this._timeline.terminal));
				} else {
					// Backspace decrements our ability to go right.
					this._lastRow.endingX--;
					this._timeline.addPrediction(buffer, new BackspacePrediction(this._timeline.terminal));
				}

				continue;
			}

			if (reader.eatCharCode(32, 127)) { // alphanum
				if (this._timeline.tentativeCursor(buffer).getCell()?.width === 0) {
					this._timeline.addBoundary(buffer, new HardBoundary());
					break;
				}
				const char = data[reader.index - 1];
				const prediction = new CharacterPrediction(this._typeaheadStyle!, char);
				if (this._lastRow.charState === CharPredictState.Unknown) {
					this._timeline.addBoundary(buffer, prediction);
					this._lastRow.charState = CharPredictState.HasPendingChar;
				} else {
					this._timeline.addPrediction(buffer, prediction);
				}

				this._lastRow.endingX = Math.max(this._lastRow.endingX, this._timeline.tentativeCursor(buffer).x);
				if (this._timeline.tentativeCursor(buffer).x >= terminal.cols) {
					this._timeline.addBoundary(buffer, new LinewrapPrediction());
				}
				continue;
			}

			const cursorMv = reader.eatRe(CSI_MOVE_RE);
			if (cursorMv) {
				const direction = cursorMv[3] as CursorMoveDirection;
				const p = new CursorMovePrediction(direction, !!cursorMv[2], Number(cursorMv[1]) || 1);
				addNavigating(p);
				continue;
			}

			if (reader.eatStr(`${VT.Esc}f`)) {
				addNavigating(new CursorMovePrediction(CursorMoveDirection.Forwards, true, 1));
				continue;
			}

			if (reader.eatStr(`${VT.Esc}b`)) {
				addNavigating(new CursorMovePrediction(CursorMoveDirection.Back, true, 1));
				continue;
			}

			if (reader.eatChar('\r') && this._timeline.tentativeCursor(buffer).y < terminal.rows - 1) {
				this._timeline.addPrediction(buffer, new NewlinePrediction());
				continue;
			}

			// something else
			this._timeline.addBoundary(buffer, new HardBoundary());
			break;
		}

		this._deferClearingPredictions();
	}

	private _onBeforeProcessData(event: IBeforeProcessDataEvent): void {
		if (!this._timeline) {
			return;
		}

		// console.log('incoming data:', JSON.stringify(event.data));
		event.data = this._timeline.beforeServerInput(event.data);
		// console.log('emitted data:', JSON.stringify(event.data));

		this._deferClearingPredictions();
	}
}
