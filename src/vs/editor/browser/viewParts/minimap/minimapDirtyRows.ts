/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The rows `[start, end)` in which two frames differ.
 */
export interface IDirtyRows {
	readonly start: number;
	readonly end: number;
}

/**
 * Describes what a frame draws on each pixel row of a canvas, so that two frames
 * can be compared without reading their pixels back.
 */
export class RowSignatures {

	private readonly _rows: string[];

	constructor(public readonly height: number) {
		this._rows = new Array<string>(height).fill('');
	}

	/**
	 * Records a drawing that covers the rows from `y` to `y + height`.
	 * @param uniform Whether the drawing looks the same on every row it covers, like a filled
	 * rectangle. Otherwise, like text, each row also records where it is in the drawing.
	 */
	public add(y: number, height: number, signature: string, uniform: boolean): void {
		const bottom = y + height;
		const first = Math.max(0, Math.floor(y));
		const last = Math.min(this.height, Math.ceil(bottom));
		for (let row = first; row < last; row++) {
			// Partly covered rows record how much of them is covered.
			const coverage = `${Math.max(y, row) - row},${Math.min(bottom, row + 1) - row}`;
			this._rows[row] += uniform ? `${signature}@${coverage};` : `${signature}@${row - y},${coverage};`;
		}
	}

	/**
	 * Finds the smallest band of rows that contains every row drawn differently
	 * in the two frames. Returns `null` when they draw the same.
	 */
	public static diff(previous: RowSignatures | null, next: RowSignatures): IDirtyRows | null {
		if (!previous || previous.height !== next.height) {
			return next.height > 0 ? { start: 0, end: next.height } : null;
		}
		const a = previous._rows;
		const b = next._rows;
		let start = 0;
		while (start < next.height && a[start] === b[start]) {
			start++;
		}
		if (start === next.height) {
			return null;
		}
		let end = next.height;
		while (end > start && a[end - 1] === b[end - 1]) {
			end--;
		}
		return { start, end };
	}
}

interface IRecordedDrawing {
	readonly top: number;
	readonly bottom: number;
	readonly draw: (target: CanvasRenderingContext2D) => void;
}

/**
 * Records the drawings of a frame instead of drawing them, so that only the rows
 * that differ from the previous frame need to be drawn.
 */
export class RecordedFrame {

	private readonly _drawings: IRecordedDrawing[] = [];
	public readonly rows: RowSignatures;

	constructor(height: number) {
		this.rows = new RowSignatures(height);
	}

	public fillRect(fillStyle: string, x: number, y: number, width: number, height: number): void {
		if (width === 0 || height === 0) {
			return;
		}
		this.add(y, height, `rect:${fillStyle}:${x}:${width}`, true, target => {
			target.fillStyle = fillStyle;
			target.fillRect(x, y, width, height);
		});
	}

	/**
	 * Records a drawing that touches no pixel outside the rows from `y` to `y + height`.
	 * @param signature Identifies how the drawing looks: two drawings with the same
	 * signature at the same position must draw the same pixels.
	 */
	public add(y: number, height: number, signature: string, uniform: boolean, draw: (target: CanvasRenderingContext2D) => void): void {
		this.rows.add(y, height, signature, uniform);
		this._drawings.push({ top: y, bottom: y + height, draw });
	}

	/**
	 * Draws, in order, every recorded drawing that touches the given rows.
	 */
	public replay(target: CanvasRenderingContext2D, rows: IDirtyRows): void {
		for (const drawing of this._drawings) {
			if (drawing.bottom > rows.start && drawing.top < rows.end) {
				drawing.draw(target);
			}
		}
	}
}
