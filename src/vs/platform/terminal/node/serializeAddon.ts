/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * (EXPERIMENTAL) This Addon is still under development
 */

import { Terminal, ITerminalAddon, IBuffer, IBufferCell } from 'xterm';

function constrain(value: number, low: number, high: number): number {
	return Math.max(low, Math.min(value, high));
}

// TODO: Refine this template class later
abstract class BaseSerializeHandler {
	constructor(private _buffer: IBuffer) { }

	public serialize(startRow: number, endRow: number): string {
		// we need two of them to flip between old and new cell
		const cell1 = this._buffer.getNullCell();
		const cell2 = this._buffer.getNullCell();
		let oldCell = cell1;

		this._beforeSerialize(endRow - startRow, startRow, endRow);

		for (let row = startRow; row < endRow; row++) {
			const line = this._buffer.getLine(row);
			if (line) {
				for (let col = 0; col < line.length; col++) {
					const c = line.getCell(col, oldCell === cell1 ? cell2 : cell1);
					if (!c) {
						console.warn(`Can't get cell at row=${row}, col=${col}`);
						continue;
					}
					this._nextCell(c, oldCell, row, col);
					oldCell = c;
				}
			}
			this._rowEnd(row, row === endRow - 1);
		}

		this._afterSerialize();

		return this._serializeString();
	}

	protected _nextCell(cell: IBufferCell, oldCell: IBufferCell, row: number, col: number): void { }
	protected _rowEnd(row: number, isLastRow: boolean): void { }
	protected _beforeSerialize(rows: number, startRow: number, endRow: number): void { }
	protected _afterSerialize(): void { }
	protected _serializeString(): string { return ''; }
}

function equalFg(cell1: IBufferCell, cell2: IBufferCell): boolean {
	return cell1.getFgColorMode() === cell2.getFgColorMode()
		&& cell1.getFgColor() === cell2.getFgColor();
}

function equalBg(cell1: IBufferCell, cell2: IBufferCell): boolean {
	return cell1.getBgColorMode() === cell2.getBgColorMode()
		&& cell1.getBgColor() === cell2.getBgColor();
}

function equalFlags(cell1: IBufferCell, cell2: IBufferCell): boolean {
	return cell1.isInverse() === cell2.isInverse()
		&& cell1.isBold() === cell2.isBold()
		&& cell1.isUnderline() === cell2.isUnderline()
		&& cell1.isBlink() === cell2.isBlink()
		&& cell1.isInvisible() === cell2.isInvisible()
		&& cell1.isItalic() === cell2.isItalic()
		&& cell1.isDim() === cell2.isDim();
}



class StringSerializeHandler extends BaseSerializeHandler {
	private _rowIndex: number = 0;
	private _allRows: string[] = new Array<string>();
	private _allRowSeparators: string[] = new Array<string>();
	private _currentRow: string = '';
	private _nullCellCount: number = 0;

	// we can see a full colored cell and a null cell that only have background the same style
	// but the information isn't preserved by null cell itself
	// so wee need to record it when required.
	private _cursorStyle: IBufferCell = this._buffer1.getNullCell();

	// where exact the cursor styles comes from
	// because we can't copy the cell directly
	// so we remember where the content comes from instead
	private _cursorStyleRow: number = 0;
	private _cursorStyleCol: number = 0;

	// this is a null cell for reference for checking whether background is empty or not
	private _backgroundCell: IBufferCell = this._buffer1.getNullCell();

	private _firstRow: number = 0;
	private _lastCursorRow: number = 0;
	private _lastCursorCol: number = 0;
	private _lastContentCursorRow: number = 0;
	private _lastContentCursorCol: number = 0;

	constructor(private _buffer1: IBuffer, private _terminal: Terminal) {
		super(_buffer1);
	}

	protected override _beforeSerialize(rows: number, start: number, end: number): void {
		this._allRows = new Array<string>(rows);
		this._lastContentCursorRow = start;
		this._lastCursorRow = start;
		this._firstRow = start;
	}

	private _thisRowLastChar: IBufferCell = this._buffer1.getNullCell();
	private _thisRowLastSecondChar: IBufferCell = this._buffer1.getNullCell();
	private _nextRowFirstChar: IBufferCell = this._buffer1.getNullCell();
	protected override _rowEnd(row: number, isLastRow: boolean): void {
		// if there is colorful empty cell at line end, whe must pad it back, or the the color block will missing
		if (this._nullCellCount > 0 && !equalBg(this._cursorStyle, this._backgroundCell)) {
			// use clear right to set background.
			this._currentRow += `\x1b[${this._nullCellCount}X`;
		}

		let rowSeparator = '';

		// handle row separator
		if (!isLastRow) {
			// Enable BCE
			if (row - this._firstRow >= this._terminal.rows) {
				this._buffer1.getLine(this._cursorStyleRow)?.getCell(this._cursorStyleCol, this._backgroundCell);
			}

			// Fetch current line
			const currentLine = this._buffer1.getLine(row)!;
			// Fetch next line
			const nextLine = this._buffer1.getLine(row + 1)!;

			if (!nextLine.isWrapped) {
				// just insert the line break
				rowSeparator = '\r\n';
				// we sended the enter
				this._lastCursorRow = row + 1;
				this._lastCursorCol = 0;
			} else {
				rowSeparator = '';
				const thisRowLastChar = currentLine.getCell(currentLine.length - 1, this._thisRowLastChar)!;
				const thisRowLastSecondChar = currentLine.getCell(currentLine.length - 2, this._thisRowLastSecondChar)!;
				const nextRowFirstChar = nextLine.getCell(0, this._nextRowFirstChar)!;
				const isNextRowFirstCharDoubleWidth = nextRowFirstChar.getWidth() > 1;

				// validate whether this line wrap is ever possible
				// which mean whether cursor can placed at a overflow position (x === row) naturally
				let isValid = false;

				if (
					// you must output character to cause overflow, control sequence can't do this
					nextRowFirstChar.getChars() &&
						isNextRowFirstCharDoubleWidth ? this._nullCellCount <= 1 : this._nullCellCount <= 0
				) {
					if (
						// the last character can't be null,
						// you can't use control sequence to move cursor to (x === row)
						(thisRowLastChar.getChars() || thisRowLastChar.getWidth() === 0) &&
						// change background of the first wrapped cell also affects BCE
						// so we mark it as invalid to simply the process to determine line separator
						equalBg(thisRowLastChar, nextRowFirstChar)
					) {
						isValid = true;
					}

					if (
						// the second to last character can't be null if the next line starts with CJK,
						// you can't use control sequence to move cursor to (x === row)
						isNextRowFirstCharDoubleWidth &&
						(thisRowLastSecondChar.getChars() || thisRowLastSecondChar.getWidth() === 0) &&
						// change background of the first wrapped cell also affects BCE
						// so we mark it as invalid to simply the process to determine line separator
						equalBg(thisRowLastChar, nextRowFirstChar) &&
						equalBg(thisRowLastSecondChar, nextRowFirstChar)
					) {
						isValid = true;
					}
				}

				if (!isValid) {
					// force the wrap with magic
					// insert enough character to force the wrap
					rowSeparator = '-'.repeat(this._nullCellCount + 1);
					// move back and erase next line head
					rowSeparator += '\x1b[1D\x1b[1X';

					if (this._nullCellCount > 0) {
						// do these because we filled the last several null slot, which we shouldn't
						rowSeparator += '\x1b[A';
						rowSeparator += `\x1b[${currentLine.length - this._nullCellCount}C`;
						rowSeparator += `\x1b[${this._nullCellCount}X`;
						rowSeparator += `\x1b[${currentLine.length - this._nullCellCount}D`;
						rowSeparator += '\x1b[B';
					}

					// This is content and need the be serialized even it is invisible.
					// without this, wrap will be missing from outputs.
					this._lastContentCursorRow = row + 1;
					this._lastContentCursorCol = 0;

					// force commit the cursor position
					this._lastCursorRow = row + 1;
					this._lastCursorCol = 0;
				}
			}
		}

		this._allRows[this._rowIndex] = this._currentRow;
		this._allRowSeparators[this._rowIndex++] = rowSeparator;
		this._currentRow = '';
		this._nullCellCount = 0;
	}

	private _diffStyle(cell: IBufferCell, oldCell: IBufferCell): number[] {
		const sgrSeq: number[] = [];
		const fgChanged = !equalFg(cell, oldCell);
		const bgChanged = !equalBg(cell, oldCell);
		const flagsChanged = !equalFlags(cell, oldCell);

		if (fgChanged || bgChanged || flagsChanged) {
			if (cell.isAttributeDefault()) {
				if (!oldCell.isAttributeDefault()) {
					sgrSeq.push(0);
				}
			} else {
				if (fgChanged) {
					const color = cell.getFgColor();
					if (cell.isFgRGB()) { sgrSeq.push(38, 2, (color >>> 16) & 0xFF, (color >>> 8) & 0xFF, color & 0xFF); }
					else if (cell.isFgPalette()) {
						if (color >= 16) { sgrSeq.push(38, 5, color); }
						else { sgrSeq.push(color & 8 ? 90 + (color & 7) : 30 + (color & 7)); }
					}
					else { sgrSeq.push(39); }
				}
				if (bgChanged) {
					const color = cell.getBgColor();
					if (cell.isBgRGB()) { sgrSeq.push(48, 2, (color >>> 16) & 0xFF, (color >>> 8) & 0xFF, color & 0xFF); }
					else if (cell.isBgPalette()) {
						if (color >= 16) { sgrSeq.push(48, 5, color); }
						else { sgrSeq.push(color & 8 ? 100 + (color & 7) : 40 + (color & 7)); }
					}
					else { sgrSeq.push(49); }
				}
				if (flagsChanged) {
					if (cell.isInverse() !== oldCell.isInverse()) { sgrSeq.push(cell.isInverse() ? 7 : 27); }
					if (cell.isBold() !== oldCell.isBold()) { sgrSeq.push(cell.isBold() ? 1 : 22); }
					if (cell.isUnderline() !== oldCell.isUnderline()) { sgrSeq.push(cell.isUnderline() ? 4 : 24); }
					if (cell.isBlink() !== oldCell.isBlink()) { sgrSeq.push(cell.isBlink() ? 5 : 25); }
					if (cell.isInvisible() !== oldCell.isInvisible()) { sgrSeq.push(cell.isInvisible() ? 8 : 28); }
					if (cell.isItalic() !== oldCell.isItalic()) { sgrSeq.push(cell.isItalic() ? 3 : 23); }
					if (cell.isDim() !== oldCell.isDim()) { sgrSeq.push(cell.isDim() ? 2 : 22); }
				}
			}
		}

		return sgrSeq;
	}

	protected override _nextCell(cell: IBufferCell, oldCell: IBufferCell, row: number, col: number): void {
		// a width 0 cell don't need to be count because it is just a placeholder after a CJK character;
		const isPlaceHolderCell = cell.getWidth() === 0;

		if (isPlaceHolderCell) {
			return;
		}

		// this cell don't have content
		const isEmptyCell = cell.getChars() === '';

		const sgrSeq = this._diffStyle(cell, this._cursorStyle);

		// the empty cell style is only assumed to be changed when background changed, because foreground is always 0.
		const styleChanged = isEmptyCell ? !equalBg(this._cursorStyle, cell) : sgrSeq.length > 0;

		/**
		 *  handles style change
		 */
		if (styleChanged) {
			// before update the style, we need to fill empty cell back
			if (this._nullCellCount > 0) {
				// use clear right to set background.
				if (!equalBg(this._cursorStyle, this._backgroundCell)) {
					this._currentRow += `\x1b[${this._nullCellCount}X`;
				}
				// use move right to move cursor.
				this._currentRow += `\x1b[${this._nullCellCount}C`;
				this._nullCellCount = 0;
			}

			this._lastContentCursorRow = this._lastCursorRow = row;
			this._lastContentCursorCol = this._lastCursorCol = col;

			this._currentRow += `\x1b[${sgrSeq.join(';')}m`;

			// update the last cursor style
			const line = this._buffer1.getLine(row);
			if (line !== undefined) {
				line.getCell(col, this._cursorStyle);
				this._cursorStyleRow = row;
				this._cursorStyleCol = col;
			}
		}

		/**
		 *  handles actual content
		 */
		if (isEmptyCell) {
			this._nullCellCount += cell.getWidth();
		} else {
			if (this._nullCellCount > 0) {
				// we can just assume we have same style with previous one here
				// because style change is handled by previous stage
				// use move right when background is empty, use clear right when there is background.
				if (equalBg(this._cursorStyle, this._backgroundCell)) {
					this._currentRow += `\x1b[${this._nullCellCount}C`;
				} else {
					this._currentRow += `\x1b[${this._nullCellCount}X`;
					this._currentRow += `\x1b[${this._nullCellCount}C`;
				}
				this._nullCellCount = 0;
			}

			this._currentRow += cell.getChars();

			// update cursor
			this._lastContentCursorRow = this._lastCursorRow = row;
			this._lastContentCursorCol = this._lastCursorCol = col + cell.getWidth();
		}
	}

	protected override _serializeString(): string {
		let rowEnd = this._allRows.length;

		// the fixup is only required for data without scrollback
		// because it will always be placed at last line otherwise
		if (this._buffer1.length - this._firstRow <= this._terminal.rows) {
			rowEnd = this._lastContentCursorRow + 1 - this._firstRow;
			this._lastCursorCol = this._lastContentCursorCol;
			this._lastCursorRow = this._lastContentCursorRow;
		}

		let content = '';

		for (let i = 0; i < rowEnd; i++) {
			content += this._allRows[i];
			if (i + 1 < rowEnd) {
				content += this._allRowSeparators[i];
			}
		}

		// restore the cursor
		const realCursorRow = this._buffer1.baseY + this._buffer1.cursorY;
		const realCursorCol = this._buffer1.cursorX;

		const cursorMoved = (realCursorRow !== this._lastCursorRow || realCursorCol !== this._lastCursorCol);

		const moveRight = (offset: number): void => {
			if (offset > 0) {
				content += `\u001b[${offset}C`;
			} else if (offset < 0) {
				content += `\u001b[${-offset}D`;
			}
		};
		const moveDown = (offset: number): void => {
			if (offset > 0) {
				content += `\u001b[${offset}B`;
			} else if (offset < 0) {
				content += `\u001b[${-offset}A`;
			}
		};

		if (cursorMoved) {
			moveDown(realCursorRow - this._lastCursorRow);
			moveRight(realCursorCol - this._lastCursorCol);
		}


		return content;
	}
}

export class SerializeAddon implements ITerminalAddon {
	private _terminal: Terminal | undefined;

	constructor() { }

	public activate(terminal: Terminal): void {
		this._terminal = terminal;
	}

	private _getString(buffer: IBuffer, scrollback?: number): string {
		const maxRows = buffer.length;
		const handler = new StringSerializeHandler(buffer, this._terminal!);

		const correctRows = (scrollback === undefined) ? maxRows : constrain(scrollback + this!._terminal!.rows, 0, maxRows);
		const result = handler.serialize(maxRows - correctRows, maxRows);

		return result;
	}

	public serialize(scrollback?: number): string {
		// TODO: Add combinedData support
		if (!this._terminal) {
			throw new Error('Cannot use addon until it has been loaded');
		}

		if (this._terminal.buffer.active.type === 'normal') {
			return this._getString(this._terminal.buffer.active, scrollback);
		}

		const normalScreenContent = this._getString(this._terminal.buffer.normal, scrollback);
		// alt screen don't have scrollback
		const alternativeScreenContent = this._getString(this._terminal.buffer.alternate, undefined);

		return normalScreenContent
			+ '\u001b[?1049h\u001b[H'
			+ alternativeScreenContent;
	}

	public dispose(): void { }
}
