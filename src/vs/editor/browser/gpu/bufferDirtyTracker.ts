/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IBufferDirtyTrackerReader {
	/**
	 * The index of the first dirty index.
	 */
	readonly dataOffset: number | undefined;
	/**
	 * The index of the last dirty index (inclusive).
	 */
	readonly dirtySize: number | undefined;
	/**
	 * Whether the buffer is dirty.
	 */
	readonly isDirty: boolean;
	/**
	 * Clear the dirty state.
	 */
	clear(): void;
}

/**
 * A simple tracker for dirty regions in a buffer.
 */
export class BufferDirtyTracker implements IBufferDirtyTrackerReader {

	private _startIndex: number | undefined;
	private _endIndex: number | undefined;

	get dataOffset(): number | undefined {
		return this._startIndex;
	}

	get dirtySize(): number | undefined {
		if (this._startIndex === undefined || this._endIndex === undefined) {
			return undefined;
		}
		return this._endIndex - this._startIndex + 1;
	}

	get isDirty(): boolean { return this._startIndex !== undefined; }

	/**
	 * Flag the index(es) as modified. Returns the index flagged.
	 * @param index An index to flag.
	 * @param length An optional length to flag. Defaults to 1.
	 */
	flag(index: number, length: number = 1): number {
		this._flag(index);
		if (length > 1) {
			this._flag(index + length - 1);
		}
		return index;
	}

	private _flag(index: number) {
		if (this._startIndex === undefined || index < this._startIndex) {
			this._startIndex = index;
		}
		if (this._endIndex === undefined || index > this._endIndex) {
			this._endIndex = index;
		}
	}

	clear() {
		this._startIndex = undefined;
		this._endIndex = undefined;
	}
}
