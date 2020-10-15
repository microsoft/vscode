/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal, ITerminalAddon, IDisposable, IBuffer, IBufferCell } from 'xterm';
import { ITerminalProcessManager, IBeforeProcessDataEvent } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { Color } from 'vs/base/common/color';

const CSI = '\x1b[';
const SHOW_CURSOR = `${CSI}?25h`;
const HIDE_CURSOR = `${CSI}?25l`;

const setCursorPos = (x: number, y: number) => `${CSI}${y + 1};${x + 1}H`;
const setCursorCoordinate = (buffer: IBuffer, c: ICoordinate) => setCursorPos(c.x, c.y + (c.baseY - buffer.baseY));

const enum ReapplyBehavior {
	/** Applying the prediction to the line is a no-op */
	NoOp,
	/** The prediction can be applied to the given line */
	Apply,
	/** The prediction would overwrite other, unexpected data on the line */
	Mismatch,
}

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
	 * Returns a sequence to roll back a previous `apply()` call.
	 */
	rollback(buffer: IBuffer): string;

	/**
	 * Returns whether the given input is one expected by this prediction.
	 */
	matches(input: string): boolean;

	/**
	 * Returns the reapply behavior for the given line.
	 */
	getReapplyBehavior(buffer: IBuffer, allPredictions: ReadonlyArray<IPrediction>): ReapplyBehavior;
}

/**
 * Boundary added to the prediction timeline to indicate that predictions
 * should be held and not applied until all previous predictions are validated.
 */
interface IPredictionBoundary {
	/**
	 * Checks whether a change was made that satisfies the expectation for the
	 * prediction boundary. For instance is pressing enter, it checks that that
	 * results in a new line.
	 */
	test(input: string): boolean;
}

const csiRe = /\x1b\[*?[a-zA-Z]/g;

/**
 * Boundary which never tests true. Will always discard predictions.
 */
class HardBoundary implements IPredictionBoundary {
	public test() {
		return false;
	}
}

class CharacterPrediction implements IPrediction {
	private appliedAt?: {
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
		return setCursorCoordinate(buffer, a) + (a.oldChar ? `${a.oldAttributes}${a.oldChar}${setCursorCoordinate(buffer, a)}` : `${CSI}X`);
	}

	public matches(input: string) {
		csiRe.lastIndex = 0;
		return input.replace(csiRe, '') === this.char;
	}

	public getReapplyBehavior(buffer: IBuffer) {
		if (!this.appliedAt) {
			return ReapplyBehavior.Apply;
		}

		const cellText = getCellAtCoordinate(buffer, this.appliedAt)?.getChars() ?? '';
		if (cellText === this.char) {
			return ReapplyBehavior.NoOp;
		} else if (cellText === this.appliedAt.oldChar) {
			return ReapplyBehavior.Apply;
		} else {
			return ReapplyBehavior.Mismatch;
		}
	}
}

interface IPredictionGroup {
	boundary?: IPredictionBoundary;
	predictions: IPrediction[];
}

const invalidatedRestoreInterval = 200;

class PredictionTimeline {
	/**
	 * Expected queue of events, separated whenever a PredictionBoundary is
	 * emitted. Prediction groups _always_ apply to the active row.
	 */
	private expected: IPredictionGroup[] = [];

	/**
	 * Last-invalidated set of predictions. These are restored if the predictions
	 * become valid again in a short period of time. Some terminal programs
	 * rewrite lines or the entire display on backspace, for example, which will
	 * invalidate the predictions even if they become valid again a moment later.
	 */
	private invalidated: { at: number; p: IPredictionGroup[] } | undefined;

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
		let brokeBoundary = false;
		for (let i = 0; i < input.length; i++) {
			const test = this.expected[0]?.predictions[0];
			const char = input[i];

			// if we reached the end of our tests, try to break through the boundary
			// and start applying its items.
			if (!test) {
				this.expected.shift();
				if (!this.expected.length) {
					return output + input.slice(i);
				}
				brokeBoundary = true;
				if (this.expected[0].boundary?.test(char) === false) {
					this.expected = [];
					return output + input.slice(i); // boundary assumption invalid, throw out predictions
				}
			}
			// if the input character matches what the next prediction expected, undo
			// the prediction and write the real character out.
			else if (test.matches(char)) {
				output += test.rollback(buffer) + char;
				this.expected[0].predictions.shift();
			}
			// otherwise, roll back all pending predictions and move the current stack
			// of predictions into the "invalidated" key (for possible resurrection).
			else {
				this.invalidated = { at: Date.now(), p: this.expected };
				this.expected = [];
				this.cursor = undefined;
				if (!brokeBoundary) { // on a new boundary, we did not apply predictions yet
					output += this.invalidated.p[0].predictions.map(p => p.rollback(buffer)).reverse().join('');
				}

				output += input.slice(i);
				break;
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
	 * Should be called after data is applied to the terminal.
	 */
	public afterServerInput() {
		const buffer = this.getActiveBuffer();
		if (buffer && this.invalidated && Date.now() - this.invalidated.at < invalidatedRestoreInterval) {
			this.tryReapplyInvalidated(buffer, this.invalidated.p);
		}
	}

	/**
	 * Appends a typeahead prediction.
	 */
	public addPrediction(buffer: IBuffer, prediction: IPrediction) {
		const l = this.expected.length - 1;
		if (l === -1) {
			this.expected = [{ predictions: [prediction] }];
		} else {
			this.expected[l].predictions.push(prediction);
		}

		if (l <= 1) {
			const text = prediction.apply(buffer, this.getCursor(buffer));
			console.log('prediction:', text);
			this.terminal.write(text);
		}
	}

	/**
	 * Appends a boundary to the preduction.
	 */
	public addBoundary(boundary: IPredictionBoundary) {
		this.expected.push({ boundary, predictions: [] });
	}

	private getCursor(buffer: IBuffer) {
		if (!this.cursor) {
			this.cursor = { baseY: buffer.baseY, y: buffer.cursorY, x: buffer.cursorX };
		}

		return this.cursor;
	}

	private getActiveBuffer() {
		const buffer = this.terminal.buffer.active;
		return buffer.type === 'normal' ? buffer : undefined;
	}

	private tryReapplyInvalidated(buffer: IBuffer, invalidated: IPredictionGroup[]) {
		if (!invalidated.length) {
			return;
		}

		const predictions = invalidated[0].predictions;
		let lastNoop = -1;
		let hasApply = false;
		for (let i = 0; i < predictions.length; i++) {
			switch (predictions[i].getReapplyBehavior(buffer, predictions)) {
				case ReapplyBehavior.NoOp:
					if (!hasApply) { lastNoop = i; }
					break;
				case ReapplyBehavior.Mismatch:
					return; // do not reapply any prediction in this set if there's a mismatch
				case ReapplyBehavior.Apply:
					hasApply = true;
					break;
			}
		}

		if (!hasApply) {
			return;
		}

		for (let i = lastNoop + 1; i < predictions.length; i++) {
			this.terminal.write(predictions[i].apply(buffer, this.getCursor(buffer)));
		}

		this.expected = invalidated.slice(1);

		if (lastNoop < predictions.length - 1) {
			this.expected.unshift({ predictions: predictions.slice(lastNoop) });
		}
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

		console.log('user data:', data);
		if (data.length !== 1) {
			this.timeline.addBoundary(new HardBoundary());
			return;
		}

		const terminal = this.timeline.terminal;
		const code = data.charCodeAt(0);
		if (code >= 32 && code < 126) {
			if (terminal.buffer.active.cursorX === terminal.cols - 1) {
			} else {
				this.timeline.addPrediction(terminal.buffer.active, new CharacterPrediction(this.typeheadStyle, data));
			}
		}
	}

	private onBeforeProcessData(event: IBeforeProcessDataEvent): void {
		if (!this.timeline) {
			return;
		}

		console.log('incoming data:', event.data);
		event.data = this.timeline.beforeServerInput(event.data);
		console.log('emitted data:', event.data);
	}
}
