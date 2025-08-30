/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';

export interface ClipboardData {
	values: Map<string, any>; // key: "row,col", value: cell value
	sourceRange: {
		startRow: number;
		endRow: number;
		startColumn: number;
		endColumn: number;
	};
	operation: 'copy' | 'cut';
	timestamp: number;
}

/**
 * Manages clipboard operations for the data explorer
 * Stores copied/cut data in memory for paste operations
 */
export class ClipboardManager extends Disposable {
	
	private clipboardData: ClipboardData | null = null;

	private readonly _onDidCopy = this._register(new Emitter<ClipboardData>());
	readonly onDidCopy: Event<ClipboardData> = this._onDidCopy.event;

	private readonly _onDidCut = this._register(new Emitter<ClipboardData>());
	readonly onDidCut: Event<ClipboardData> = this._onDidCut.event;

	private readonly _onDidPaste = this._register(new Emitter<{sourceData: ClipboardData, targetRange: {startRow: number, startColumn: number}}>());
	readonly onDidPaste: Event<{sourceData: ClipboardData, targetRange: {startRow: number, startColumn: number}}> = this._onDidPaste.event;

	private readonly _onDidClear = this._register(new Emitter<void>());
	readonly onDidClear: Event<void> = this._onDidClear.event;

	/**
	 * Store data from a copy operation
	 */
	copy(values: Map<string, any>, sourceRange: {startRow: number, endRow: number, startColumn: number, endColumn: number}): void {
		this.clipboardData = {
			values: new Map(values),
			sourceRange: { ...sourceRange },
			operation: 'copy',
			timestamp: Date.now()
		};

		this._onDidCopy.fire(this.clipboardData);
	}

	/**
	 * Store data from a cut operation
	 */
	cut(values: Map<string, any>, sourceRange: {startRow: number, endRow: number, startColumn: number, endColumn: number}): void {
		this.clipboardData = {
			values: new Map(values),
			sourceRange: { ...sourceRange },
			operation: 'cut',
			timestamp: Date.now()
		};

		this._onDidCut.fire(this.clipboardData);
	}

	/**
	 * Get the current clipboard data
	 */
	getClipboardData(): ClipboardData | null {
		return this.clipboardData ? {
			values: new Map(this.clipboardData.values),
			sourceRange: { ...this.clipboardData.sourceRange },
			operation: this.clipboardData.operation,
			timestamp: this.clipboardData.timestamp
		} : null;
	}

	/**
	 * Check if there is data available to paste
	 */
	hasData(): boolean {
		return this.clipboardData !== null;
	}

	/**
	 * Check if the clipboard contains cut data (which should be cleared after paste)
	 */
	hasCutData(): boolean {
		return this.clipboardData !== null && this.clipboardData.operation === 'cut';
	}

	/**
	 * Check if the clipboard contains copy data
	 */
	hasCopyData(): boolean {
		return this.clipboardData !== null && this.clipboardData.operation === 'copy';
	}

	/**
	 * Clear the clipboard (typically called after cut->paste operation)
	 */
	clear(): void {
		this.clipboardData = null;
		this._onDidClear.fire();
	}

	/**
	 * Get the size of the clipboard data (rows x columns)
	 */
	getDataSize(): {rows: number, columns: number} | null {
		if (!this.clipboardData) {
			return null;
		}

		const range = this.clipboardData.sourceRange;
		return {
			rows: range.endRow - range.startRow + 1,
			columns: range.endColumn - range.startColumn + 1
		};
	}

	/**
	 * Notify that a paste operation has occurred
	 */
	notifyPaste(targetRange: {startRow: number, startColumn: number}): void {
		if (this.clipboardData) {
			this._onDidPaste.fire({
				sourceData: this.clipboardData,
				targetRange
			});
		}
	}


}




