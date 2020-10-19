/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { IBeforeProcessDataEvent, ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import type { IBuffer, IBufferCell, IDisposable, ITerminalAddon, Terminal } from 'xterm';

const ESC = '\x1b';
const CSI = `${ESC}[`;
const SHOW_CURSOR = `${CSI}?25h`;
const HIDE_CURSOR = `${CSI}?25l`;
const DELETE_CHAR = `${CSI}X`;
const CSI_STYLE_RE = /^\x1b\[[0-9;]*m/;
const CSI_MOVE_RE = /^\x1b\[([0-9]*)(;[35])?O?([DC])/;
const PASSWORD_INPUT_RE = /(password|passphrase|passwd).*:/i;
const NOT_WORD_RE = /\W/;

/**
 * Codes that should be omitted from sending to the prediction engine and
 * insted omitted directly:
 *  - cursor hide/show
 *  - mode set/reset
 */
const PREDICTION_OMIT_RE = /^(\x1b\[\??25[hl])+/;

const enum CursorMoveDirection {
	Back = 'D',
	Forwards = 'C',
}

const setCursorPos = (x: number, y: number) => `${CSI}${y + 1};${x + 1}H`;
const setCursorCoordinate = (buffer: IBuffer, c: ICoordinate) => setCursorPos(c.x, c.y + (c.baseY - buffer.baseY));

interface ICoordinate {
	x: number;
	y: number;
	baseY: number;
}

const getCellAtCoordinate = (b: IBuffer, c: ICoordinate) => b.getLine(c.y + c.baseY)?.getCell(c.x);

const moveToWordBoundary = (b: IBuffer, cursor: ICoordinate, direction: -1 | 1) => {
	let ateLeadingWhitespace = false;
	if (direction < 0) {
		cursor.x--;
	}

	while (cursor.x >= 0) {
		const cell = getCellAtCoordinate(b, cursor);
		if (!cell?.getCode()) {
			return;
		}

		const chars = cell.getChars();
		if (NOT_WORD_RE.test(chars)) {
			if (ateLeadingWhitespace) {
				break;
			}
		} else {
			ateLeadingWhitespace = true;
		}

		cursor.x += direction;
	}

	if (direction < 0) {
		cursor.x++; // we want to place the cursor after the whitespace starting the word
	}

	cursor.x = Math.max(0, cursor.x);
};

const enum MatchResult {
	/** matched successfully */
	Success,
	/** failed to match */
	Failure,
	/** buffer data, it might match in the future one more data comes in */
	Buffer,
}

interface IPrediction {
	/**
	 * Returns a sequence to apply the prediction.
	 * @param buffer to write to
	 * @param cursor position to write the data. Should advance the cursor.
	 * @returns a string to be written to the user terminal, or optionally a
	 * string for the user terminal and real pty.
	 */
	apply(buffer: IBuffer, cursor: ICoordinate): string;

	/**
	 * Returns a sequence to roll back a previous `apply()` call. If
	 * `rollForwards` is not given, then this is also called if a prediction
	 * is correct before show the user's data.
	 */
	rollback(buffer: IBuffer): string;

	/**
	 * If available, this will be called when the prediction is correct.
	 */
	rollForwards?(buffer: IBuffer, withInput: string): string;

	/**
	 * Returns whether the given input is one expected by this prediction.
	 */
	matches(input: StringReader): MatchResult;
}

class StringReader {
	public index = 0;

	public get remaining() {
		return this.input.length - this.index;
	}

	public get eof() {
		return this.index === this.input.length;
	}

	public get rest() {
		return this.input.slice(this.index);
	}

	constructor(private readonly input: string) { }

	/**
	 * Advances the reader and returns the character if it matches.
	 */
	public eatChar(char: string) {
		if (this.input[this.index] !== char) {
			return;
		}

		this.index++;
		return char;
	}

	/**
	 * Advances the reader and returns the string if it matches.
	 */
	public eatStr(substr: string) {
		if (this.input.slice(this.index, substr.length) !== substr) {
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
	public eatGradually(substr: string): MatchResult {
		let prevIndex = this.index;
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
	public eatRe(re: RegExp) {
		const match = re.exec(this.input.slice(this.index));
		if (!match) {
			return;
		}

		this.index += match[0].length;
		return match;
	}

	/**
	 * Advances the reader and returns the character if the code matches.
	 */
	public eatCharCode(min = 0, max = min + 1) {
		const code = this.input.charCodeAt(this.index);
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
	public apply() {
		return '';
	}

	public rollback() {
		return '';
	}

	public matches() {
		return MatchResult.Failure;
	}
}

/**
 * Wraps another prediction. Does not apply the prediction, but will pass
 * through its `matches` request.
 */
class TentativeBoundary implements IPrediction {
	constructor(private readonly inner: IPrediction) { }

	public apply(buffer: IBuffer, cursor: ICoordinate) {
		this.inner.apply(buffer, cursor);
		return '';
	}

	public rollback() {
		return '';
	}

	public matches(input: StringReader) {
		return this.inner.matches(input);
	}
}

/**
 * Prediction for a single alphanumeric character.
 */
class CharacterPrediction implements IPrediction {
	protected appliedAt?: ICoordinate & {
		oldAttributes: string;
		oldChar: string;
	};

	constructor(private readonly style: string, private readonly char: string) { }

	public apply(buffer: IBuffer, cursor: ICoordinate) {
		const cell = getCellAtCoordinate(buffer, cursor);
		this.appliedAt = cell
			? { ...cursor, oldAttributes: getBufferCellAttributes(cell), oldChar: cell.getChars() }
			: { ...cursor, oldAttributes: '', oldChar: '' };

		cursor.x++;
		return this.style + this.char + `${CSI}0m`;
	}

	public rollback(buffer: IBuffer) {
		if (!this.appliedAt) {
			return ''; // not applied
		}

		const a = this.appliedAt;
		this.appliedAt = undefined;
		return setCursorCoordinate(buffer, a) + (a.oldChar ? `${a.oldAttributes}${a.oldChar}${setCursorCoordinate(buffer, a)}` : DELETE_CHAR);
	}

	public matches(input: StringReader) {
		let startIndex = input.index;

		// remove any styling CSI before checking the char
		while (input.eatRe(CSI_STYLE_RE)) { }

		if (input.eof) {
			return MatchResult.Buffer;
		}

		if (input.eatChar(this.char)) {
			return MatchResult.Success;
		}

		input.index = startIndex;
		return MatchResult.Failure;
	}
}

class BackspacePrediction extends CharacterPrediction {
	constructor() {
		super('', '\b');
	}

	public apply(buffer: IBuffer, cursor: ICoordinate) {
		const cell = getCellAtCoordinate(buffer, cursor);
		this.appliedAt = cell
			? { ...cursor, oldAttributes: getBufferCellAttributes(cell), oldChar: cell.getChars() }
			: { ...cursor, oldAttributes: '', oldChar: '' };

		cursor.x--;
		return setCursorCoordinate(buffer, cursor) + DELETE_CHAR;
	}

	public matches(input: StringReader) {
		// if at end of line, allow backspace + clear line. Zsh does this.
		if (this.appliedAt?.oldChar === '') {
			const r = input.eatGradually(`\b${CSI}K`);
			if (r !== MatchResult.Failure) {
				return r;
			}
		}

		return input.eatGradually('\b');
	}
}

class NewlinePrediction implements IPrediction {
	protected prevPosition?: ICoordinate;

	public apply(_: IBuffer, cursor: ICoordinate) {
		this.prevPosition = { ...cursor };
		cursor.x = 0;
		cursor.y++;
		return '\r\n';
	}

	public rollback(buffer: IBuffer) {
		if (!this.prevPosition) {
			return ''; // not applied
		}

		const p = this.prevPosition;
		this.prevPosition = undefined;
		return setCursorCoordinate(buffer, p) + DELETE_CHAR;
	}

	public rollForwards() {
		return ''; // does not need to rewrite
	}

	public matches(input: StringReader) {
		return input.eatGradually('\r\n');
	}
}

class CursorMovePrediction implements IPrediction {
	private applied?: {
		rollForward: string;
		rollBack: string;
		amount: number;
	};

	constructor(
		private readonly direction: CursorMoveDirection,
		private readonly moveByWords: boolean,
		private readonly amount: number,
	) { }

	public apply(buffer: IBuffer, cursor: ICoordinate) {
		let rollBack = setCursorCoordinate(buffer, cursor);
		const currentCell = getCellAtCoordinate(buffer, cursor);
		if (currentCell) {
			rollBack += getBufferCellAttributes(currentCell);
		}

		const { amount, direction, moveByWords } = this;
		const delta = direction === CursorMoveDirection.Back ? -1 : 1;
		const startX = cursor.x;
		if (moveByWords) {
			for (let i = 0; i < amount; i++) {
				moveToWordBoundary(buffer, cursor, delta);
			}
		} else {
			cursor.x += delta * amount;
		}

		const rollForward = setCursorCoordinate(buffer, cursor);
		this.applied = { amount: Math.abs(cursor.x - startX), rollBack, rollForward };
		return this.applied.rollForward;
	}

	public rollback() {
		return this.applied?.rollBack ?? '';
	}

	public rollForwards() {
		return ''; // does not need to rewrite
	}

	public matches(input: StringReader) {
		if (!this.applied) {
			return MatchResult.Failure;
		}

		const direction = this.direction;
		const { amount, rollForward } = this.applied;

		if (amount === 1) {
			// arg can be omitted to move one character
			const r = input.eatGradually(`${CSI}${direction}`);
			if (r !== MatchResult.Failure) {
				return r;
			}

			// \b is the equivalent to moving one character back
			const r2 = input.eatGradually(`\b`);
			if (r2 !== MatchResult.Failure) {
				return r2;
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
		return input.eatGradually(`${CSI}${amount}${direction}`);
	}
}


class PredictionTimeline {
	/**
	 * Expected queue of events. Only predictions for the lowest are
	 * written into the terminal.
	 */
	private expected: ({ gen: number; p: IPrediction })[] = [];

	/**
	 * Current prediction generation.
	 */
	private currentGen = 0;

	/**
	 * Cursor position -- kept outside the buffer since it can be ahead if
	 * typing swiftly.
	 */
	private cursor: ICoordinate | undefined;

	/**
	 * Previously sent data that was buffered and should be prepended to the
	 * next input.
	 */
	private inputBuffer?: string;

	constructor(public readonly terminal: Terminal) { }

	/**
	 * Should be called when input is incoming to the temrinal.
	 */
	public beforeServerInput(input: string): string {
		if (this.inputBuffer) {
			input = this.inputBuffer + input;
			this.inputBuffer = undefined;
		}

		if (!this.expected.length) {
			this.cursor = undefined;
			return input;
		}

		const buffer = this.getActiveBuffer();
		if (!buffer) {
			this.cursor = undefined;
			return input;
		}

		let output = '';

		const reader = new StringReader(input);
		const startingGen = this.expected[0].gen;
		const emitPredictionOmitted = () => {
			const omit = reader.eatRe(PREDICTION_OMIT_RE);
			if (omit) {
				output += omit[0];
			}
		};

		ReadLoop: while (this.expected.length && reader.remaining > 0) {
			emitPredictionOmitted();

			const prediction = this.expected[0].p;
			let beforeTestReaderIndex = reader.index;
			switch (prediction.matches(reader)) {
				case MatchResult.Success:
					// if the input character matches what the next prediction expected, undo
					// the prediction and write the real character out.
					const eaten = input.slice(beforeTestReaderIndex, reader.index);
					output += prediction.rollForwards?.(buffer, eaten)
						?? (prediction.rollback(buffer) + input.slice(beforeTestReaderIndex, reader.index));
					this.expected.shift();
					break;
				case MatchResult.Buffer:
					// on a buffer, store the remaining data and completely read data
					// to be output as normal.
					this.inputBuffer = input.slice(beforeTestReaderIndex);
					reader.index = input.length;
					break ReadLoop;
				case MatchResult.Failure:
					// on a failure, roll back all remaining items in this generation
					// and clear predictions, since they are no longer valid
					output += this.expected.filter(p => p.gen === startingGen)
						.map(({ p }) => p.rollback(buffer))
						.reverse()
						.join('');
					this.expected = [];
					this.cursor = undefined;
					break ReadLoop;
			}
		}

		emitPredictionOmitted();

		// Extra data (like the result of running a command) should cause us to
		// reset the cursor
		if (!reader.eof) {
			output += reader.rest;
			this.expected = [];
			this.cursor = undefined;
		}

		// If we passed a generation boundary, apply the current generation's predictions
		if (this.expected.length && startingGen !== this.expected[0].gen) {
			for (const { p, gen } of this.expected) {
				if (gen !== this.expected[0].gen) {
					break;
				}

				output += p.apply(buffer, this.getCursor(buffer));
			}
		}

		if (output.length === 0) {
			return '';
		}

		if (this.cursor) {
			output += setCursorCoordinate(buffer, this.cursor);
		}

		// prevent cursor flickering while typing, since output will *always*
		// contains cursor moves if we did anything with predictions:
		output = HIDE_CURSOR + output + SHOW_CURSOR;

		return output;
	}

	/**
	 * Appends a typeahead prediction.
	 */
	public addPrediction(buffer: IBuffer, prediction: IPrediction) {
		this.expected.push({ gen: this.currentGen, p: prediction });
		if (this.currentGen === this.expected[0].gen) {
			const text = prediction.apply(buffer, this.getCursor(buffer));
			this.terminal.write(text);
		}
	}

	/**
	 * Appends a prediction followed by a boundary. The predictions applied
	 * after this one will only be displayed after the give prediction matches
	 * pty output/
	 */
	public addBoundary(buffer: IBuffer, prediction: IPrediction) {
		this.addPrediction(buffer, prediction);
		this.currentGen++;
	}

	public getCursor(buffer: IBuffer) {
		if (!this.cursor) {
			this.cursor = { baseY: buffer.baseY, y: buffer.cursorY, x: buffer.cursorX };
		}

		return this.cursor;
	}

	private getActiveBuffer() {
		const buffer = this.terminal.buffer.active;
		return buffer.type === 'normal' ? buffer : undefined;
	}
}
/**
 * Gets the escape sequence to restore state/appearence in the cell.
 */
const getBufferCellAttributes = (cell: IBufferCell) => cell.isAttributeDefault()
	? `${CSI}0m`
	: [
		cell.isBold() && `${CSI}1m`,
		cell.isDim() && `${CSI}2m`,
		cell.isItalic() && `${CSI}3m`,
		cell.isUnderline() && `${CSI}4m`,
		cell.isBlink() && `${CSI}5m`,
		cell.isInverse() && `${CSI}7m`,
		cell.isInvisible() && `${CSI}8m`,

		cell.isFgRGB() && `${CSI}38;2;${cell.getFgColor() >>> 24};${(cell.getFgColor() >>> 16) & 0xFF};${cell.getFgColor() & 0xFF}m`,
		cell.isFgPalette() && `${CSI}38;5;${cell.getFgColor()}m`,
		cell.isFgDefault() && `${CSI}39m`,

		cell.isBgRGB() && `${CSI}48;2;${cell.getBgColor() >>> 24};${(cell.getBgColor() >>> 16) & 0xFF};${cell.getBgColor() & 0xFF}m`,
		cell.isBgPalette() && `${CSI}48;5;${cell.getBgColor()}m`,
		cell.isBgDefault() && `${CSI}49m`,
	].filter(seq => !!seq).join('');

const parseTypeheadStyle = (style: string | number) => {
	if (typeof style === 'number') {
		return `${CSI}${style}m`;
	}

	const { r, g, b } = Color.fromHex(style).rgba;
	return `${CSI}32;${r};${g};${b}m`;
};

export class TypeAheadAddon implements ITerminalAddon {
	private disposables: IDisposable[] = [];
	private typeheadStyle = parseTypeheadStyle(this.config.config.typeaheadStyle);
	private typeaheadThreshold = this.config.config.typeaheadThreshold;
	private lastRow?: { y: number; startingX: number };
	private timeline?: PredictionTimeline;

	constructor(private readonly _processManager: ITerminalProcessManager, private readonly config: TerminalConfigHelper) {
	}

	public activate(terminal: Terminal): void {
		this.timeline = new PredictionTimeline(terminal);
		this.disposables.push(terminal.onData(e => this.onUserData(e)));
		this.disposables.push(this.config.onConfigChanged(() => {
			this.typeheadStyle = parseTypeheadStyle(this.config.config.typeaheadStyle);
			this.typeaheadThreshold = this.config.config.typeaheadThreshold;
		}));
		this.disposables.push(this._processManager.onBeforeProcessData(e => this.onBeforeProcessData(e)));
	}

	public dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}

	private onUserData(data: string): void {
		if (this.typeaheadThreshold !== 0) {
			return;
		}

		if (this.timeline?.terminal.buffer.active.type !== 'normal') {
			return;
		}

		// console.log('user data:', JSON.stringify(data));

		const terminal = this.timeline.terminal;
		const buffer = terminal.buffer.active;

		// the following code guards the terminal prompt to avoid being able to
		// arrow or backspace-into the prompt. Record the lowest X value at which
		// the user gave input, and mark all additions before that as tentative.
		const actualY = buffer.baseY + buffer.cursorY;
		if (actualY !== this.lastRow?.y) {
			this.lastRow = { y: actualY, startingX: buffer.cursorX };
		} else {
			this.lastRow.startingX = Math.min(this.lastRow.startingX, buffer.cursorX);
		}

		const addLeftNavigating = (p: IPrediction) =>
			this.timeline!.getCursor(buffer).x <= this.lastRow!.startingX
				? this.timeline!.addBoundary(buffer, new TentativeBoundary(p))
				: this.timeline!.addPrediction(buffer, p);

		/** @see https://github.com/xtermjs/xterm.js/blob/1913e9512c048e3cf56bb5f5df51bfff6899c184/src/common/input/Keyboard.ts */
		const reader = new StringReader(data);
		while (reader.remaining > 0) {
			if (reader.eatCharCode(127)) { // backspace
				addLeftNavigating(new BackspacePrediction());
				continue;
			}

			if (reader.eatCharCode(32, 126)) { // alphanum
				const char = data[reader.index - 1];
				this.timeline.addPrediction(buffer, new CharacterPrediction(this.typeheadStyle, char));
				if (this.timeline.getCursor(buffer).x === terminal.cols) {
					this.timeline.addBoundary(buffer, new NewlinePrediction());
				}
				continue;
			}

			const cursorMv = reader.eatRe(CSI_MOVE_RE);
			if (cursorMv) {
				const direction = cursorMv[3] as CursorMoveDirection;
				const p = new CursorMovePrediction(direction, !!cursorMv[2], Number(cursorMv[1]) || 1);
				if (direction === CursorMoveDirection.Back) {
					addLeftNavigating(p);
				} else {
					this.timeline.addPrediction(buffer, p);
				}
				continue;
			}

			if (reader.eatStr(`${ESC}f`)) {
				this.timeline.addPrediction(buffer, new CursorMovePrediction(CursorMoveDirection.Forwards, true, 1));
				continue;
			}

			if (reader.eatStr(`${ESC}b`)) {
				addLeftNavigating(new CursorMovePrediction(CursorMoveDirection.Back, true, 1));
				continue;
			}

			if (reader.eatChar('\r') && buffer.cursorY < terminal.rows - 1) {
				this.timeline.addPrediction(buffer, new NewlinePrediction());
				continue;
			}

			// something else
			this.timeline.addBoundary(buffer, new HardBoundary());
			break;
		}
	}

	private onBeforeProcessData(event: IBeforeProcessDataEvent): void {
		if (this.typeaheadThreshold !== 0) {
			return;
		}

		if (!this.timeline) {
			return;
		}

		// console.log('incoming data:', JSON.stringify(event.data));
		event.data = this.timeline.beforeServerInput(event.data);
		// console.log('emitted data:', JSON.stringify(event.data));

		// If there's something that looks like a password prompt, omit giving
		// input. This is approximate since there's no TTY "password here" code,
		// but should be enough to cover common cases like sudo
		if (PASSWORD_INPUT_RE.test(event.data)) {
			const terminal = this.timeline.terminal;
			this.timeline.addBoundary(terminal.buffer.active, new HardBoundary());
		}
	}
}
