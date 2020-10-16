/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { IBeforeProcessDataEvent, ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import type { IBuffer, IBufferCell, IDisposable, ITerminalAddon, Terminal } from 'xterm';

const CSI = '\x1b[';
const SHOW_CURSOR = `${CSI}?25h`;
const HIDE_CURSOR = `${CSI}?25l`;
const DELETE_CHAR = `${CSI}X`;
const CSI_STYLE_RE = /^\x1b\[[0-9;]+m/;
const CSI_MOVE_RE = /^\x1b\[([0-9]*)([DC])/;

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

interface IPrediction {
	/**
	 * Returns a sequence to apply the prediction.
	 * @param buffer to write to
	 * @param cursor position to write the data. Should advance the cursor.
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
	matches(input: StringReader): boolean;
}


class StringReader {
	public index = 0;

	public get remaining() {
		return this.input.length - this.index;
	}

	constructor(private readonly input: string) { }

	public eatStr(substr: string) {
		if (this.input.slice(this.index, this.index + substr.length) !== substr) {
			return;
		}

		this.index += substr.length;
		return substr;
	}

	public eatRe(re: RegExp) {
		const match = re.exec(this.input.slice(this.index));
		if (!match) {
			return;
		}

		this.index += match[0].length;
		return match;
	}

	public eatCharCode(min = 0, max = Infinity) {
		const code = this.input.charCodeAt(this.index);
		if (code < min || code >= max) {
			return undefined;
		}

		this.index++;
		return code;
	}

	public rest() {
		return this.input.slice(this.index);
	}
}

/**
 * Boundary which never tests true. Will always discard predictions.
 */
class HardBoundary implements IPrediction {
	public apply() {
		return '';
	}

	public rollback() {
		return '';
	}

	public matches() {
		return false;
	}
}

class CharacterPrediction implements IPrediction {
	protected appliedAt?: {
		x: number;
		y: number;
		baseY: number;
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
		if (input.eatStr(this.char)) {
			return true;
		}

		input.index = startIndex;
		return false;
	}
}

class BackspacePrediction extends CharacterPrediction {
	public apply(buffer: IBuffer, cursor: ICoordinate) {
		const cell = getCellAtCoordinate(buffer, cursor);
		this.appliedAt = cell
			? { ...cursor, oldAttributes: getBufferCellAttributes(cell), oldChar: cell.getChars() }
			: { ...cursor, oldAttributes: '', oldChar: '' };

		cursor.x--;
		return setCursorCoordinate(buffer, cursor) + DELETE_CHAR;
	}

	public matches(input: StringReader) {
		return !!input.eatStr('\b');
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
		return !!input.eatStr('\r\n');
	}
}

class CursorMovePrediction implements IPrediction {
	constructor(private readonly direction: CursorMoveDirection, private readonly amount: number) { }

	public apply(_: IBuffer, cursor: ICoordinate) {
		const { amount, direction } = this;
		cursor.x += (direction === CursorMoveDirection.Back ? -1 : 1) * amount;
		return `${CSI}${amount}${direction}`;
	}

	public rollback() {
		const fn = this.direction === CursorMoveDirection.Back ? CursorMoveDirection.Forwards : CursorMoveDirection.Back;
		return `${CSI}${this.amount}${fn}`;
	}

	public rollForwards() {
		return ''; // does not need to rewrite
	}

	public matches(input: StringReader) {
		const { amount, direction } = this;
		if (amount === 1 && input.eatStr(`${CSI}${direction}`)) {
			return true;
		}

		if (amount === 1 && this.direction === CursorMoveDirection.Back && input.eatStr('\b')) {
			return true;
		}

		return !!input.eatStr(`${CSI}${amount}${direction}`);
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

	constructor(public readonly terminal: Terminal) { }

	/**
	 * Should be called when input is incoming to the temrinal.
	 */
	public beforeServerInput(input: string): string {
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
		while (this.expected.length && reader.remaining > 0) {
			const prediction = this.expected[0].p;
			let beforeTestReaderIndex = reader.index;

			// if the input character matches what the next prediction expected, undo
			// the prediction and write the real character out.
			if (prediction.matches(reader)) {
				const eaten = input.slice(beforeTestReaderIndex, reader.index);
				output += prediction.rollForwards?.(buffer, eaten)
					?? (prediction.rollback(buffer) + input.slice(beforeTestReaderIndex, reader.index));
				this.expected.shift();
			}
			// otherwise, roll back all pending predictions
			else {
				output += this.expected.filter(p => p.gen === startingGen)
					.map(({ p }) => p.rollback(buffer))
					.reverse()
					.join('');
				this.expected = [];
				this.cursor = undefined;
				break;
			}
		}

		output += reader.rest();

		// If we passed a generation boundary, apply the current generation's predictions
		if (this.expected.length && startingGen !== this.expected[0].gen) {
			for (const { p, gen } of this.expected) {
				if (gen !== this.expected[0].gen) {
					break;
				}

				output += p.apply(buffer, this.getCursor(buffer));
			}
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
			console.log('prediction:', JSON.stringify(text));
			this.terminal.write(text);
		}
	}

	/**
	 * Appends a boundary to the prediction.
	 */
	public addBoundary() {
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
	private timeline?: PredictionTimeline;

	constructor(private readonly _processManager: ITerminalProcessManager, private readonly config: TerminalConfigHelper) {
	}

	public activate(terminal: Terminal): void {
		this.timeline = new PredictionTimeline(terminal);
		this.disposables.push(terminal.onData(e => this.onUserData(e)));
		this.disposables.push(this.config.onConfigChanged(() => this.typeheadStyle = parseTypeheadStyle(this.config.config.typeaheadStyle)));
		this.disposables.push(this._processManager.onBeforeProcessData(e => this.onBeforeProcessData(e)));
	}

	public dispose(): void {
		// this.disposables.forEach(d => d.dispose());
	}

	private onUserData(data: string): void {
		if (this.timeline?.terminal.buffer.active.type !== 'normal') {
			return;
		}

		console.log('user data:', JSON.stringify(data));

		const terminal = this.timeline.terminal;
		const buffer = terminal.buffer.active;
		const reader = new StringReader(data);
		while (reader.remaining > 0) {
			if (reader.eatStr('\b')) { // backspace
				this.timeline.addPrediction(buffer, new BackspacePrediction(this.typeheadStyle, '\b'));
				continue;
			}

			if (reader.eatCharCode(32, 126)) { // alphanum
				const char = data[reader.index - 1];
				this.timeline.addPrediction(buffer, new CharacterPrediction(this.typeheadStyle, char));
				if (this.timeline.getCursor(buffer).x === terminal.cols) {
					this.timeline.addPrediction(buffer, new NewlinePrediction());
					this.timeline.addBoundary();
				}
				continue;
			}

			const cursorMv = reader.eatRe(CSI_MOVE_RE);
			if (cursorMv) {
				this.timeline.addPrediction(buffer, new CursorMovePrediction(
					cursorMv[2] as CursorMoveDirection, Number(cursorMv[1]) || 1));
				continue;
			}

			// something else
			this.timeline.addPrediction(buffer, new HardBoundary());
			this.timeline.addBoundary();
			break;
		}
	}

	private onBeforeProcessData(event: IBeforeProcessDataEvent): void {
		if (!this.timeline) {
			return;
		}

		console.log('incoming data:', JSON.stringify(event.data));
		event.data = this.timeline.beforeServerInput(event.data);
		console.log('emitted data:', JSON.stringify(event.data));
	}
}
