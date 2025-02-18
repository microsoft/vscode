/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorWhitespace, IPartialViewLinesViewportData, ISpecialLineHeightChangeAccessor, IViewWhitespaceViewportData, IWhitespaceChangeAccessor } from '../viewModel.js';
import * as strings from '../../../base/common/strings.js';
import { SpecialLineHeightsManager } from './specialLineHeights.js';

// I suppose thw second field means that everything after line number needs to be recomputed
interface IPendingChange { id: string; newAfterLineNumber: number; newHeight: number }
interface IPendingRemove { id: string }

class PendingChanges {
	private _hasPending: boolean;
	private _inserts: EditorWhitespace[];
	private _changes: IPendingChange[];
	// Changes and removals are treated differently
	private _removes: IPendingRemove[];

	constructor() {
		this._hasPending = false;
		this._inserts = [];
		this._changes = [];
		this._removes = [];
	}

	// insert a new editor whitespace, the changes will be pending for now
	public insert(x: EditorWhitespace): void {
		this._hasPending = true;
		this._inserts.push(x);
	}

	public change(x: IPendingChange): void {
		this._hasPending = true;
		this._changes.push(x);
	}

	public remove(x: IPendingRemove): void {
		this._hasPending = true;
		this._removes.push(x);
	}

	// if it has pending changes, then we must commit them
	public mustCommit(): boolean {
		return this._hasPending;
	}

	// We commit only if there are pending changes
	public commit(linesLayout: LinesLayout): void {
		if (!this._hasPending) {
			return;
		}

		const inserts = this._inserts;
		const changes = this._changes;
		const removes = this._removes;

		// Set the arrays to nothing once they have been saves elsewhere
		this._hasPending = false;
		this._inserts = [];
		this._changes = [];
		this._removes = [];

		linesLayout._commitPendingChanges(inserts, changes, removes);
	}
}

class PendingSpecialLineHeightChanges {

	private _hasPending: boolean;
	private _inserts: { decorationId: string; lineNumber: number; lineHeight: number }[];
	private _changes: { decorationId: string; lineNumber: number; lineHeight: number }[];
	private _removes: { decorationId: string }[];

	constructor() {
		this._hasPending = false;
		this._inserts = [];
		this._changes = [];
		this._removes = [];
	}

	public insert(x: { decorationId: string; lineNumber: number; lineHeight: number }): void {
		this._hasPending = true;
		this._inserts.push(x);
	}

	public change(x: { decorationId: string; lineNumber: number; lineHeight: number }): void {
		this._hasPending = true;
		this._changes.push(x);
	}

	public remove(x: { decorationId: string }): void {
		this._hasPending = true;
		this._removes.push(x);
	}

	public mustCommit(): boolean {
		return this._hasPending;
	}

	public commit(linesLayout: LinesLayout): void {
		if (!this._hasPending) {
			return;
		}

		const inserts = this._inserts;
		const changes = this._changes;
		const removes = this._removes;

		this._hasPending = false;
		this._inserts = [];
		this._changes = [];
		this._removes = [];

		linesLayout._commitPendingSpecialLineHeightChanges(inserts, changes, removes);
	}
}

export class EditorWhitespace implements IEditorWhitespace {
	public id: string;
	public afterLineNumber: number;
	public ordinal: number;
	public height: number;
	public minWidth: number;
	public prefixSum: number;

	constructor(id: string, afterLineNumber: number, ordinal: number, height: number, minWidth: number) {
		this.id = id;
		this.afterLineNumber = afterLineNumber;
		this.ordinal = ordinal;
		this.height = height;
		this.minWidth = minWidth;
		this.prefixSum = 0;
	}
}

/**
 * Layouting of objects that take vertical space (by having a height) and push down other objects.
 *
 * These objects are basically either text (lines) or spaces between those lines (whitespaces).
 * This provides commodity operations for working with lines that contain whitespace that pushes lines lower (vertically).
 */
export class LinesLayout {

	// We store the total number of instances of the lines layout
	private static INSTANCE_COUNT = 0;

	private readonly _instanceId: string;
	private readonly _pendingChanges: PendingChanges;
	private readonly _pendingSpecialLineHeightChanges: PendingSpecialLineHeightChanges;

	private _lastWhitespaceId: number;
	private _arr: EditorWhitespace[];
	// private _specialLineHeights: SpecialLineHeights[];
	private _prefixSumValidIndex: number;
	private _prefixSumSpecialLineHeightsValidIndex: number;
	private _minWidth: number;
	private _lineCount: number;
	private _lineHeight: number;
	private _paddingTop: number;
	private _paddingBottom: number;
	private _specialLineHeightsManager: SpecialLineHeightsManager;

	constructor(lineCount: number, lineHeight: number, paddingTop: number, paddingBottom: number) {
		this._instanceId = strings.singleLetterHash(++LinesLayout.INSTANCE_COUNT);
		this._pendingChanges = new PendingChanges();
		this._pendingSpecialLineHeightChanges = new PendingSpecialLineHeightChanges();
		this._lastWhitespaceId = 0;
		this._arr = [];
		// this._specialLineHeights = [];
		this._prefixSumValidIndex = -1;
		this._prefixSumSpecialLineHeightsValidIndex = -1;
		this._minWidth = -1; /* marker for not being computed */
		this._lineCount = lineCount;
		this._lineHeight = lineHeight;
		this._paddingTop = paddingTop;
		this._paddingBottom = paddingBottom;
		this._specialLineHeightsManager = new SpecialLineHeightsManager(lineHeight);
	}

	/**
	 * Find the insertion index for a new value inside a sorted array of values.
	 * If the value is already present in the sorted array, the insertion index will be after the already existing value.
	 */
	// after line number is the exact line nbumber after which to insert the whitespace
	public static findInsertionIndex(arr: EditorWhitespace[], afterLineNumber: number, ordinal: number): number {
		let low = 0;
		let high = arr.length;

		while (low < high) {
			// Finding the middle value between low and high
			const mid = ((low + high) >>> 1);

			// mid actually corresponds to an index, and we retrieve the middle element and the corresponding line number
			if (afterLineNumber === arr[mid].afterLineNumber) {
				// if the ordinal is lower, then insert lower, otherwise insert at a higher position
				if (ordinal < arr[mid].ordinal) {
					high = mid;
				} else {
					low = mid + 1;
				}
			} else if (afterLineNumber < arr[mid].afterLineNumber) {
				// Since after line number is smaller than the afterLineNumber of the mid index, then that means that we want to insert at a lower position
				high = mid;
			} else {
				// insert at a higher position.
				low = mid + 1;
			}
		}

		return low;
	}

	/**
	 * Change the height of a line in pixels.
	 */
	public setLineHeight(lineHeight: number): void {
		this._checkPendingChanges();
		this._lineHeight = lineHeight;
		this._specialLineHeightsManager.defaultLineHeight = lineHeight;
	}

	/**
	 * Changes the padding used to calculate vertical offsets.
	 */
	public setPadding(paddingTop: number, paddingBottom: number): void {
		this._paddingTop = paddingTop;
		this._paddingBottom = paddingBottom;
	}

	/**
	 * Set the number of lines.
	 *
	 * @param lineCount New number of lines.
	 */
	public onFlushed(lineCount: number): void {
		this._checkPendingChanges();
		this._lineCount = lineCount;
	}

	public changeSpecialLineHeights(callback: (accessor: ISpecialLineHeightChangeAccessor) => void): boolean {
		let hadAChange = false;
		try {
			const accessor: ISpecialLineHeightChangeAccessor = {
				insertSpecialLineHeight: (decorationId: string, lineNumber: number, lineHeight: number): void => {
					hadAChange = true;
					this._pendingSpecialLineHeightChanges.insert({ decorationId, lineNumber, lineHeight });
				},
				changeSpecialLineHeight: (decorationId: string, lineNumber: number, lineHeight: number): void => {
					hadAChange = true;
					this._pendingSpecialLineHeightChanges.change({ decorationId, lineNumber, lineHeight });
				},
				removeSpecialLineHeight: (decorationId: string): void => {
					hadAChange = true;
					this._pendingSpecialLineHeightChanges.remove({ decorationId });
				}
			};
			callback(accessor);
		} finally {
			this._pendingSpecialLineHeightChanges.commit(this);
		}
		return hadAChange;
	}

	public changeWhitespace(callback: (accessor: IWhitespaceChangeAccessor) => void): boolean {
		// initially we assume there has been no change
		let hadAChange = false;
		try {
			const accessor: IWhitespaceChangeAccessor = {
				// we insert a whitespace after a specific line number, with a certain importance
				insertWhitespace: (afterLineNumber: number, ordinal: number, heightInPx: number, minWidth: number): string => {
					hadAChange = true;
					afterLineNumber = afterLineNumber | 0;
					ordinal = ordinal | 0;
					heightInPx = heightInPx | 0;
					minWidth = minWidth | 0;
					// increase the id of the last whitespace, add it to the lines layout id and se this as the whitespace id
					const id = this._instanceId + (++this._lastWhitespaceId);
					this._pendingChanges.insert(new EditorWhitespace(id, afterLineNumber, ordinal, heightInPx, minWidth));
					// returning the id of the inserted whitespace.
					return id;
				},
				changeOneWhitespace: (id: string, newAfterLineNumber: number, newHeight: number): void => {
					hadAChange = true;
					newAfterLineNumber = newAfterLineNumber | 0;
					newHeight = newHeight | 0;
					// When we change we always reference the id of the whitespace we had inserted
					this._pendingChanges.change({ id, newAfterLineNumber, newHeight });
				},
				removeWhitespace: (id: string): void => {
					hadAChange = true;
					this._pendingChanges.remove({ id });
				}
			};
			callback(accessor);
		} finally {
			// we commit the changes in the end
			this._pendingChanges.commit(this);
		}
		return hadAChange;
	}

	public _commitPendingChanges(inserts: EditorWhitespace[], changes: IPendingChange[], removes: IPendingRemove[]): void {
		if (inserts.length > 0 || removes.length > 0) {
			this._minWidth = -1; /* marker for not being computed */
		}

		// Suppose there has been exactly one insert, change or removal
		if (inserts.length + changes.length + removes.length <= 1) {
			// when only one thing happened, handle it "delicately"
			for (const insert of inserts) {
				this._insertWhitespace(insert);
			}
			for (const change of changes) {
				this._changeOneWhitespace(change.id, change.newAfterLineNumber, change.newHeight);
			}
			for (const remove of removes) {
				const index = this._findWhitespaceIndex(remove.id);
				if (index === -1) {
					continue;
				}
				this._removeWhitespace(index);
			}
			return;
		}

		// simply rebuild the entire datastructure
		// construct a set containing the whitespaces which should be removed, their IDs
		const toRemove = new Set<string>();
		for (const remove of removes) {
			toRemove.add(remove.id);
		}

		const toChange = new Map<string, IPendingChange>();
		for (const change of changes) {
			toChange.set(change.id, change);
		}

		const applyRemoveAndChange = (whitespaces: EditorWhitespace[]): EditorWhitespace[] => {
			// whitespaces contains all the current editor whitespaces
			const result: EditorWhitespace[] = [];
			for (const whitespace of whitespaces) {
				if (toRemove.has(whitespace.id)) {
					// we apply the removal by not adding it to the new array which is the result array
					continue;
				}
				if (toChange.has(whitespace.id)) {
					// we apply the change by applying the changes to the fetched whitespace
					const change = toChange.get(whitespace.id)!;
					whitespace.afterLineNumber = change.newAfterLineNumber;
					whitespace.height = change.newHeight;

				}
				result.push(whitespace);
			}
			return result;
		};

		// We remove and change the editor whitespaces on the current array, and then we remove and change whitespaces in the inserts array if there are changes to be made
		const result = applyRemoveAndChange(this._arr).concat(applyRemoveAndChange(inserts));
		result.sort((a, b) => {
			// if the afterlinenumbers are equal then we sort by the ordinal, otherwise we sort by the afterLineNumber
			if (a.afterLineNumber === b.afterLineNumber) {
				return a.ordinal - b.ordinal;
			}
			return a.afterLineNumber - b.afterLineNumber;
		});

		// store the resulting array in the _arr field
		this._arr = result;
		// Now none of the prefix sums are equal, so I suppose this means that we need to recompute the prefix sums in a separate piece of code
		this._prefixSumValidIndex = -1;
	}

	public _commitPendingSpecialLineHeightChanges(inserts: { decorationId: string; lineNumber: number; lineHeight: number }[], changes: { decorationId: string; lineNumber: number; lineHeight: number }[], removes: { decorationId: string }[]): void {

		if (inserts.length + changes.length + removes.length <= 1) {
			for (const insert of inserts) {
				this._specialLineHeightsManager.insertSpecialLineHeightUsingDecorationID(insert.decorationId, insert.lineNumber, insert.lineHeight);
			}
			for (const change of changes) {
				this._specialLineHeightsManager.changeSpecialLineHeightUsingDecorationID(change.decorationId, change.lineNumber, change.lineHeight);
			}
			for (const remove of removes) {
				this._specialLineHeightsManager.removeSpecialLineHeightUsingDecorationID(remove.decorationId);
			}
			return;
		}

		const newSpecialLineHeightsManager = new SpecialLineHeightsManager(this._lineHeight, this._specialLineHeightsManager);

		changes.forEach((change) => {
			newSpecialLineHeightsManager.changeSpecialLineHeightUsingDecorationID(change.decorationId, change.lineNumber, change.lineHeight);
			inserts.forEach((value) => {
				if (value.decorationId === change.decorationId) {
					value.lineNumber = change.lineNumber;
					value.lineHeight = change.lineHeight;
				}
			});
		});

		const filteredInserts: { decorationId: string; lineNumber: number; lineHeight: number }[] = inserts;
		removes.forEach((removal) => {
			newSpecialLineHeightsManager.removeSpecialLineHeightUsingDecorationID(removal.decorationId);
			inserts.filter((insert) => insert.decorationId !== removal.decorationId);
		});

		filteredInserts.forEach((insert) => {
			newSpecialLineHeightsManager.insertSpecialLineHeightUsingDecorationID(insert.decorationId, insert.lineNumber, insert.lineHeight);
		});

		this._specialLineHeightsManager = newSpecialLineHeightsManager;
		this._prefixSumSpecialLineHeightsValidIndex = -1;

		/*
		if (inserts.length + changes.length + removes.length <= 1) {
			for (const insert of inserts) {
				this._insertSpecialLineHeight(insert);
			}
			for (const change of changes) {
				this._changeSpecialLineHeight(change);
			}
			for (const remove of removes) {
				this._removeSpecialLineHeight(remove);
			}
			return;
		}
		const toRemove = new Set<string>();
		for (const remove of removes) {
			toRemove.add(remove.decorationId);
		}
		const toChange = new Map<string, { lineNumber: number; lineHeight: number }>();
		for (const change of changes) {
			toChange.set(change.decorationId, change);
		}
		const filteredInserts: { decorationId: string; lineNumber: number; lineHeight: number }[] = [];
		for (const insert of inserts) {
			if (toRemove.has(insert.decorationId)) {
				// we apply the removal by not adding it to the new array which is the result array
				continue;
			}
			if (toChange.has(insert.decorationId)) {
				// we apply the change by applying the changes to the fetched whitespace
				const change = toChange.get(insert.decorationId)!;
				insert.lineHeight = change.lineHeight;
				insert.lineNumber = change.lineNumber;

			}
			filteredInserts.push(insert);
		}
		const filteredSpecialLineHeights: SpecialLineHeights[] = [];
		for (const specialLineHeights of this._specialLineHeights) {
			if (toRemove.has(insert.decorationId)) {
				// But then here I need to iterate over all of the special line heights in the map for the given line number, so this is a double iteration
				continue;
			}
		}
		this._specialLineHeights = filteredSpecialLineHeights;
		*/
	}

	private _checkPendingChanges(): void {
		// if there are pending changes, then we commit the changes
		if (this._pendingChanges.mustCommit()) {
			this._pendingChanges.commit(this);
		}
		if (this._pendingSpecialLineHeightChanges.mustCommit()) {
			this._pendingSpecialLineHeightChanges.commit(this);
		}
	}

	private _insertWhitespace(whitespace: EditorWhitespace): void {
		// We find the index at which to insert with one method and then we actually insert with the second method
		const insertIndex = LinesLayout.findInsertionIndex(this._arr, whitespace.afterLineNumber, whitespace.ordinal);
		this._arr.splice(insertIndex, 0, whitespace);
		// We had the previous valid index for the prefix sum, but now that the insertion has taken place, the minimum of the first and the insertion index minus one contains the valid prefix sum
		this._prefixSumValidIndex = Math.min(this._prefixSumValidIndex, insertIndex - 1);
	}

	// given an id of a whitespace, we iterate from left to right across the array and when we find an element that has the correct id, we return the index
	private _findWhitespaceIndex(id: string): number {
		const arr = this._arr;
		for (let i = 0, len = arr.length; i < len; i++) {
			if (arr[i].id === id) {
				return i;
			}
		}
		return -1;
	}

	// We change the whitespace with the given id, and it has to be inserted after the number corresponding to the second parameter
	// We are also given the new height
	private _changeOneWhitespace(id: string, newAfterLineNumber: number, newHeight: number): void {
		// find the index of the whitespaces we are looking for
		const index = this._findWhitespaceIndex(id);
		if (index === -1) {
			return;
		}
		// if the height is not equal to the new height
		// then we set the new height
		if (this._arr[index].height !== newHeight) {
			this._arr[index].height = newHeight;
			// update the valid index for the prefix sum
			this._prefixSumValidIndex = Math.min(this._prefixSumValidIndex, index - 1);
		}
		// if the line corresponding to the afterLineNumber is not valid, then we retrieve the corresponding whitespace
		// we remove the whitespace at the given index
		// update the field afterLineNumber and insert the whitespace again
		if (this._arr[index].afterLineNumber !== newAfterLineNumber) {
			// `afterLineNumber` changed for this whitespace

			// Record old whitespace
			const whitespace = this._arr[index];

			// Since changing `afterLineNumber` can trigger a reordering, we're gonna remove this whitespace
			this._removeWhitespace(index);

			whitespace.afterLineNumber = newAfterLineNumber;

			// And add it again
			this._insertWhitespace(whitespace);
		}
	}

	private _removeWhitespace(removeIndex: number): void {
		this._arr.splice(removeIndex, 1);
		this._prefixSumValidIndex = Math.min(this._prefixSumValidIndex, removeIndex - 1);
	}

	/**
	 * Notify the layouter that lines have been deleted (a continuous zone of lines).
	 *
	 * @param fromLineNumber The line number at which the deletion started, inclusive
	 * @param toLineNumber The line number at which the deletion ended, inclusive
	 */
	public onLinesDeleted(fromLineNumber: number, toLineNumber: number): void {
		// we check the pending changes and then commit them
		this._checkPendingChanges();
		fromLineNumber = fromLineNumber | 0;
		toLineNumber = toLineNumber | 0;

		// we update the total line count
		this._lineCount -= (toLineNumber - fromLineNumber + 1);
		for (let i = 0, len = this._arr.length; i < len; i++) {
			// for each of the whitespaces we retrieve the after line number
			const afterLineNumber = this._arr[i].afterLineNumber;
			// if the after line number is between the lines that were just deleted
			if (fromLineNumber <= afterLineNumber && afterLineNumber <= toLineNumber) {
				// The line this whitespace was after has been deleted
				//  => move whitespace to before first deleted line
				this._arr[i].afterLineNumber = fromLineNumber - 1;
			} else if (afterLineNumber > toLineNumber) {
				// The line this whitespace was after has been moved up
				//  => move whitespace up by the amount of lines that have been deleted
				this._arr[i].afterLineNumber -= (toLineNumber - fromLineNumber + 1);
			}
		}

		for (let i = fromLineNumber; i <= toLineNumber; i++) {
			this._specialLineHeightsManager.removeSpecialLineHeightUsingLineNumber(i);
		}

		for (let i = toLineNumber + 1; i <= this._lineCount; i++) {
			this._specialLineHeightsManager.replaceSpecialLineHeightsFromLineNumbers(i, i - (toLineNumber - fromLineNumber + 1));
		}
	}

	/**
	 * Notify the layouter that lines have been inserted (a continuous zone of lines).
	 *
	 * @param fromLineNumber The line number at which the insertion started, inclusive
	 * @param toLineNumber The line number at which the insertion ended, inclusive.
	 */
	public onLinesInserted(fromLineNumber: number, toLineNumber: number): void {
		this._checkPendingChanges();
		fromLineNumber = fromLineNumber | 0;
		toLineNumber = toLineNumber | 0;
		const numberOfLinesAdded = (toLineNumber - fromLineNumber + 1);

		// Adding the number of lines that have been inserted to the total line count
		this._lineCount += (toLineNumber - fromLineNumber + 1);
		for (let i = 0, len = this._arr.length; i < len; i++) {
			const afterLineNumber = this._arr[i].afterLineNumber;
			// if the whitespace is placed after the insertion range, adjust its position by adding the number of lines that have been inserted
			if (fromLineNumber <= afterLineNumber) {
				this._arr[i].afterLineNumber += numberOfLinesAdded;
			}
		}

		for (let i = fromLineNumber; i <= this._lineCount; i++) {
			this._specialLineHeightsManager.replaceSpecialLineHeightsFromLineNumbers(i, i + numberOfLinesAdded);
		}
	}

	/**
	 * Get the sum of all the whitespaces.
	 */
	public getWhitespacesTotalHeight(): number {
		this._checkPendingChanges();
		// if the array has not whitespaces then the total height is zero
		if (this._arr.length === 0) {
			return 0;
		}
		// find the accumulated height for all the elements in the array
		return this.getWhitespacesAccumulatedHeight(this._arr.length - 1);
	}

	/**
	 * Return the sum of the heights of the whitespaces at [0..index].
	 * This includes the whitespace at `index`.
	 *
	 * @param index The index of the whitespace.
	 * @return The sum of the heights of all whitespaces before the one at `index`, including the one at `index`.
	 */
	public getWhitespacesAccumulatedHeight(index: number): number {
		this._checkPendingChanges();
		index = index | 0;

		// Find the first index that has a valid prefix sum
		let startIndex = Math.max(0, this._prefixSumValidIndex + 1);
		// suppose that none of the indices have valid prefix sums
		if (startIndex === 0) {
			// update the index for the first element
			this._arr[0].prefixSum = this._arr[0].height;
			startIndex++;
		}

		// start from the first valid index and go until the index of interest
		for (let i = startIndex; i <= index; i++) {
			// take the prefix sum of the previous element, add to it the height of the previous element to get the current prefix sum
			this._arr[i].prefixSum = this._arr[i - 1].prefixSum + this._arr[i].height;
		}
		// now our current valid index is the maximum of the previous one and the index
		this._prefixSumValidIndex = Math.max(this._prefixSumValidIndex, index);
		// we return the prefix sum for the given index
		return this._arr[index].prefixSum;
	}

	/**
	 * Get the sum of heights for all objects.
	 *
	 * @return The sum of heights for all objects.
	 */
	public getLinesTotalHeight(): number {
		this._checkPendingChanges();
		// We get the height of the lines
		const linesHeight = this._linesHeight();
		// Then we get the total height of the editor whitespaces
		const whitespacesHeight = this.getWhitespacesTotalHeight();

		// Add them together and add also the padding top and the padding bottom
		return linesHeight + whitespacesHeight + this._paddingTop + this._paddingBottom;
	}

	// will need to maybe use an array instead of a map for this because need to use binary search here
	private _linesHeight(_untilLineNumber?: number): number {
		const untilLineNumber = _untilLineNumber ?? this._lineCount;
		return this._specialLineHeightsManager.lineHeightUntilLineNumber(untilLineNumber);
	}

	/**
	 * Returns the accumulated height of whitespaces before the given line number.
	 *
	 * @param lineNumber The line number
	 */
	public getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber: number): number {
		this._checkPendingChanges();
		lineNumber = lineNumber | 0;

		// We find the last whitespace before the given line number
		const lastWhitespaceBeforeLineNumber = this._findLastWhitespaceBeforeLineNumber(lineNumber);

		// if there is no whitespace before the given line number, then return 0
		if (lastWhitespaceBeforeLineNumber === -1) {
			return 0;
		}

		// Otherwise find the total height of the whitespace from 0 to this index
		return this.getWhitespacesAccumulatedHeight(lastWhitespaceBeforeLineNumber);
	}

	private _findLastWhitespaceBeforeLineNumber(lineNumber: number): number {
		lineNumber = lineNumber | 0;

		// Find the whitespace before line number
		const arr = this._arr;
		let low = 0;
		let high = arr.length - 1;

		while (low <= high) {
			const delta = (high - low) | 0;
			const halfDelta = (delta / 2) | 0;
			const mid = (low + halfDelta) | 0;

			// If the element at the index has an afterLineNumber strictly smaller than line number
			// but also the element on the next index, has value strictly bigger than line number, then return mid
			if (arr[mid].afterLineNumber < lineNumber) {
				if (mid + 1 >= arr.length || arr[mid + 1].afterLineNumber >= lineNumber) {
					return mid;
				} else {
					low = (mid + 1) | 0;
				}
			} else {
				high = (mid - 1) | 0;
			}
		}

		return -1;
	}

	// This is the opposite method which tries to find the first whitespace after the given line number
	private _findFirstWhitespaceAfterLineNumber(lineNumber: number): number {
		lineNumber = lineNumber | 0;

		const lastWhitespaceBeforeLineNumber = this._findLastWhitespaceBeforeLineNumber(lineNumber);
		const firstWhitespaceAfterLineNumber = lastWhitespaceBeforeLineNumber + 1;

		// If the index is a valid index within the bounds of this._arr then return it, otherwise return -1
		if (firstWhitespaceAfterLineNumber < this._arr.length) {
			return firstWhitespaceAfterLineNumber;
		}

		return -1;
	}

	/**
	 * Find the index of the first whitespace which has `afterLineNumber` >= `lineNumber`.
	 * @return The index of the first whitespace with `afterLineNumber` >= `lineNumber` or -1 if no whitespace is found.
	 */
	public getFirstWhitespaceIndexAfterLineNumber(lineNumber: number): number {
		this._checkPendingChanges();
		lineNumber = lineNumber | 0;

		return this._findFirstWhitespaceAfterLineNumber(lineNumber);
	}

	/**
	 * Get the vertical offset (the sum of heights for all objects above) a certain line number.
	 *
	 * @param lineNumber The line number
	 * @return The sum of heights for all objects above `lineNumber`.
	 */
	public getVerticalOffsetForLineNumber(lineNumber: number, includeViewZones = false): number {
		this._checkPendingChanges();
		lineNumber = lineNumber | 0;

		let previousLinesHeight: number;
		if (lineNumber > 1) {
			// find the height of all of the lines before the given line number
			previousLinesHeight = this._linesHeight(lineNumber - 1);
		} else {
			previousLinesHeight = 0;
		}

		// then decide whether you want to include the view zone corrresponding to the given line number and calculate the total height of the whitespace
		const previousWhitespacesHeight = this.getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber - (includeViewZones ? 1 : 0));

		// add the height for the whitespaces, the height for the line number as well as the padding top values
		return previousLinesHeight + previousWhitespacesHeight + this._paddingTop;
	}

	public getLineHeightForLineNumber(lineNumber: number): number {
		return this._specialLineHeightsManager.lineHeightForLineNumber(lineNumber);
	}

	/**
	 * Get the vertical offset (the sum of heights for all objects above) a certain line number.
	 *
	 * @param lineNumber The line number
	 * @return The sum of heights for all objects above `lineNumber`.
	 */
	public getVerticalOffsetAfterLineNumber(lineNumber: number, includeViewZones = false): number {
		this._checkPendingChanges();
		lineNumber = lineNumber | 0;
		const previousLinesHeight = this._linesHeight(lineNumber);
		const previousWhitespacesHeight = this.getWhitespaceAccumulatedHeightBeforeLineNumber(lineNumber + (includeViewZones ? 1 : 0));
		return previousLinesHeight + previousWhitespacesHeight + this._paddingTop;
	}

	/**
	 * Returns if there is any whitespace in the document.
	 */
	public hasWhitespace(): boolean {
		this._checkPendingChanges();
		return this.getWhitespacesCount() > 0;
	}

	/**
	 * The maximum min width for all whitespaces.
	 */
	public getWhitespaceMinWidth(): number {
		this._checkPendingChanges();
		if (this._minWidth === -1) {
			let minWidth = 0;
			// We iterate over all of the editor whitespaces in order to find the minimum width
			for (let i = 0, len = this._arr.length; i < len; i++) {
				minWidth = Math.max(minWidth, this._arr[i].minWidth);
			}
			this._minWidth = minWidth;
		}
		return this._minWidth;
	}

	/**
	 * Check if `verticalOffset` is below all lines.
	 */
	public isAfterLines(verticalOffset: number): boolean {
		this._checkPendingChanges();
		const totalHeight = this.getLinesTotalHeight();
		return verticalOffset > totalHeight;
	}

	public isInTopPadding(verticalOffset: number): boolean {
		if (this._paddingTop === 0) {
			return false;
		}
		this._checkPendingChanges();
		return (verticalOffset < this._paddingTop);
	}

	public isInBottomPadding(verticalOffset: number): boolean {
		if (this._paddingBottom === 0) {
			return false;
		}
		this._checkPendingChanges();
		const totalHeight = this.getLinesTotalHeight();
		// The value on the right is essentially the start in pixels of the bottom padding
		return (verticalOffset >= totalHeight - this._paddingBottom);
	}

	/**
	 * Find the first line number that is at or after vertical offset `verticalOffset`.
	 * i.e. if getVerticalOffsetForLine(line) is x and getVerticalOffsetForLine(line + 1) is y, then
	 * getLineNumberAtOrAfterVerticalOffset(i) = line, x <= i < y.
	 * Meaning that we round is down
	 *
	 * @param verticalOffset The vertical offset to search at.
	 * @return The line number at or after vertical offset `verticalOffset`.
	 */
	public getLineNumberAtOrAfterVerticalOffset(verticalOffset: number): number {
		this._checkPendingChanges();
		verticalOffset = verticalOffset | 0;

		if (verticalOffset < 0) {
			return 1;
		}

		const linesCount = this._lineCount | 0;
		let minLineNumber = 1;
		let maxLineNumber = linesCount;

		while (minLineNumber < maxLineNumber) {
			const midLineNumber = ((minLineNumber + maxLineNumber) / 2) | 0;

			const lineHeight = this.getLineHeightForLineNumber(midLineNumber);
			const midLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(midLineNumber) | 0;

			// vertical offset is higher than the bottom of the mid line number
			if (verticalOffset >= midLineNumberVerticalOffset + lineHeight) {
				// vertical offset is after mid line number
				minLineNumber = midLineNumber + 1;
			} else if (verticalOffset >= midLineNumberVerticalOffset) {
				// Hit
				return midLineNumber;
			} else {
				// vertical offset is before mid line number, but mid line number could still be what we're searching for
				maxLineNumber = midLineNumber;
			}
		}

		if (minLineNumber > linesCount) {
			return linesCount;
		}

		return minLineNumber;
	}

	/**
	 * Get all the lines and their relative vertical offsets that are positioned between `verticalOffset1` and `verticalOffset2`.
	 *
	 * @param verticalOffset1 The beginning of the viewport.
	 * @param verticalOffset2 The end of the viewport.
	 * @return A structure describing the lines positioned between `verticalOffset1` and `verticalOffset2`.
	 */
	public getLinesViewportData(verticalOffset1: number, verticalOffset2: number): IPartialViewLinesViewportData {
		this._checkPendingChanges();
		verticalOffset1 = verticalOffset1 | 0;
		verticalOffset2 = verticalOffset2 | 0;

		// Find first line number
		// We don't live in a perfect world, so the line number might start before or after verticalOffset1
		const startLineNumber = this.getLineNumberAtOrAfterVerticalOffset(verticalOffset1) | 0;
		const startLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(startLineNumber) | 0;

		let endLineNumber = this._lineCount | 0;

		// Also keep track of what whitespace we've got
		let whitespaceIndex = this.getFirstWhitespaceIndexAfterLineNumber(startLineNumber) | 0;
		const whitespaceCount = this.getWhitespacesCount() | 0;
		let currentWhitespaceHeight: number;
		let currentWhitespaceAfterLineNumber: number;

		if (whitespaceIndex === -1) {
			whitespaceIndex = whitespaceCount;
			currentWhitespaceAfterLineNumber = endLineNumber + 1;
			currentWhitespaceHeight = 0;
		} else {
			currentWhitespaceAfterLineNumber = this.getAfterLineNumberForWhitespaceIndex(whitespaceIndex) | 0;
			currentWhitespaceHeight = this.getHeightForWhitespaceIndex(whitespaceIndex) | 0;
		}

		let currentVerticalOffset = startLineNumberVerticalOffset;
		let currentLineRelativeOffset = currentVerticalOffset;

		// IE (all versions) cannot handle units above about 1,533,908 px, so every 500k pixels bring numbers down
		const STEP_SIZE = 500000;
		let bigNumbersDelta = 0;
		if (startLineNumberVerticalOffset >= STEP_SIZE) {
			// Compute a delta that guarantees that lines are positioned at `lineHeight` increments
			bigNumbersDelta = Math.floor(startLineNumberVerticalOffset / STEP_SIZE) * STEP_SIZE;
			bigNumbersDelta = Math.floor(bigNumbersDelta / this._lineHeight) * this._lineHeight;

			currentLineRelativeOffset -= bigNumbersDelta;
		}

		const linesOffsets: number[] = [];

		const verticalCenter = verticalOffset1 + (verticalOffset2 - verticalOffset1) / 2;
		let centeredLineNumber = -1;

		// Figure out how far the lines go
		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			const lineHeight = this.getLineHeightForLineNumber(lineNumber);
			if (centeredLineNumber === -1) {
				const currentLineTop = currentVerticalOffset;
				const currentLineBottom = currentVerticalOffset + lineHeight;
				if ((currentLineTop <= verticalCenter && verticalCenter < currentLineBottom) || currentLineTop > verticalCenter) {
					centeredLineNumber = lineNumber;
				}
			}

			// Count current line height in the vertical offsets
			currentVerticalOffset += lineHeight;
			linesOffsets[lineNumber - startLineNumber] = currentLineRelativeOffset;

			// Next line starts immediately after this one
			currentLineRelativeOffset += lineHeight;
			while (currentWhitespaceAfterLineNumber === lineNumber) {
				// Push down next line with the height of the current whitespace
				currentLineRelativeOffset += currentWhitespaceHeight;

				// Count current whitespace in the vertical offsets
				currentVerticalOffset += currentWhitespaceHeight;
				whitespaceIndex++;

				if (whitespaceIndex >= whitespaceCount) {
					currentWhitespaceAfterLineNumber = endLineNumber + 1;
				} else {
					currentWhitespaceAfterLineNumber = this.getAfterLineNumberForWhitespaceIndex(whitespaceIndex) | 0;
					currentWhitespaceHeight = this.getHeightForWhitespaceIndex(whitespaceIndex) | 0;
				}
			}

			if (currentVerticalOffset >= verticalOffset2) {
				// We have covered the entire viewport area, time to stop
				endLineNumber = lineNumber;
				break;
			}
		}

		if (centeredLineNumber === -1) {
			centeredLineNumber = endLineNumber;
		}

		const endLineNumberVerticalOffset = this.getVerticalOffsetForLineNumber(endLineNumber) | 0;

		let completelyVisibleStartLineNumber = startLineNumber;
		let completelyVisibleEndLineNumber = endLineNumber;

		if (completelyVisibleStartLineNumber < completelyVisibleEndLineNumber) {
			if (startLineNumberVerticalOffset < verticalOffset1) {
				completelyVisibleStartLineNumber++;
			}
		}
		if (completelyVisibleStartLineNumber < completelyVisibleEndLineNumber) {
			const endLineHeight = this.getLineHeightForLineNumber(endLineNumber);
			if (endLineNumberVerticalOffset + endLineHeight > verticalOffset2) {
				completelyVisibleEndLineNumber--;
			}
		}

		return {
			bigNumbersDelta: bigNumbersDelta,
			startLineNumber: startLineNumber,
			endLineNumber: endLineNumber,
			relativeVerticalOffset: linesOffsets,
			centeredLineNumber: centeredLineNumber,
			// The completely visible start line number does not correspond to the start line number
			completelyVisibleStartLineNumber: completelyVisibleStartLineNumber,
			completelyVisibleEndLineNumber: completelyVisibleEndLineNumber,
			lineHeight: this._lineHeight,
		};
	}

	public getVerticalOffsetForWhitespaceIndex(whitespaceIndex: number): number {
		this._checkPendingChanges();
		whitespaceIndex = whitespaceIndex | 0;

		// The line number which is before the whitespace with the given index
		const afterLineNumber = this.getAfterLineNumberForWhitespaceIndex(whitespaceIndex);

		let previousLinesHeight: number;
		if (afterLineNumber >= 1) {
			previousLinesHeight = this._linesHeight(afterLineNumber);
		} else {
			previousLinesHeight = 0;
		}

		let previousWhitespacesHeight: number;
		if (whitespaceIndex > 0) {
			// the height of the previous whitespaces
			previousWhitespacesHeight = this.getWhitespacesAccumulatedHeight(whitespaceIndex - 1);
		} else {
			previousWhitespacesHeight = 0;
		}
		// add also the padding top
		return previousLinesHeight + previousWhitespacesHeight + this._paddingTop;
	}

	public getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset: number): number {
		this._checkPendingChanges();
		verticalOffset = verticalOffset | 0;

		let minWhitespaceIndex = 0;
		let maxWhitespaceIndex = this.getWhitespacesCount() - 1;

		if (maxWhitespaceIndex < 0) {
			return -1;
		}

		// Special case: nothing to be found
		const maxWhitespaceVerticalOffset = this.getVerticalOffsetForWhitespaceIndex(maxWhitespaceIndex);
		const maxWhitespaceHeight = this.getHeightForWhitespaceIndex(maxWhitespaceIndex);
		if (verticalOffset >= maxWhitespaceVerticalOffset + maxWhitespaceHeight) {
			return -1;
		}

		while (minWhitespaceIndex < maxWhitespaceIndex) {
			const midWhitespaceIndex = Math.floor((minWhitespaceIndex + maxWhitespaceIndex) / 2);

			const midWhitespaceVerticalOffset = this.getVerticalOffsetForWhitespaceIndex(midWhitespaceIndex);
			const midWhitespaceHeight = this.getHeightForWhitespaceIndex(midWhitespaceIndex);

			if (verticalOffset >= midWhitespaceVerticalOffset + midWhitespaceHeight) {
				// vertical offset is after whitespace
				minWhitespaceIndex = midWhitespaceIndex + 1;
			} else if (verticalOffset >= midWhitespaceVerticalOffset) {
				// Hit
				return midWhitespaceIndex;
			} else {
				// vertical offset is before whitespace, but midWhitespaceIndex might still be what we're searching for
				maxWhitespaceIndex = midWhitespaceIndex;
			}
		}
		return minWhitespaceIndex;
	}

	/**
	 * Get exactly the whitespace that is layouted at `verticalOffset`.
	 *
	 * @param verticalOffset The vertical offset.
	 * @return Precisely the whitespace that is layouted at `verticaloffset` or null.
	 */
	public getWhitespaceAtVerticalOffset(verticalOffset: number): IViewWhitespaceViewportData | null {
		this._checkPendingChanges();
		verticalOffset = verticalOffset | 0;

		// the index of the whitespace at or after
		// we check after that the whitespace so as to contain the vertical offset
		const candidateIndex = this.getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset);

		if (candidateIndex < 0) {
			return null;
		}

		if (candidateIndex >= this.getWhitespacesCount()) {
			return null;
		}

		const candidateTop = this.getVerticalOffsetForWhitespaceIndex(candidateIndex);

		if (candidateTop > verticalOffset) {
			return null;
		}

		const candidateHeight = this.getHeightForWhitespaceIndex(candidateIndex);
		const candidateId = this.getIdForWhitespaceIndex(candidateIndex);
		const candidateAfterLineNumber = this.getAfterLineNumberForWhitespaceIndex(candidateIndex);

		return {
			id: candidateId,
			afterLineNumber: candidateAfterLineNumber,
			verticalOffset: candidateTop,
			height: candidateHeight
		};
	}

	/**
	 * Get a list of whitespaces that are positioned between `verticalOffset1` and `verticalOffset2`.
	 *
	 * @param verticalOffset1 The beginning of the viewport.
	 * @param verticalOffset2 The end of the viewport.
	 * @return An array with all the whitespaces in the viewport. If no whitespace is in viewport, the array is empty.
	 */
	public getWhitespaceViewportData(verticalOffset1: number, verticalOffset2: number): IViewWhitespaceViewportData[] {
		this._checkPendingChanges();
		verticalOffset1 = verticalOffset1 | 0;
		verticalOffset2 = verticalOffset2 | 0;

		const startIndex = this.getWhitespaceIndexAtOrAfterVerticallOffset(verticalOffset1);
		const endIndex = this.getWhitespacesCount() - 1;

		if (startIndex < 0) {
			return [];
		}

		const result: IViewWhitespaceViewportData[] = [];
		for (let i = startIndex; i <= endIndex; i++) {
			const top = this.getVerticalOffsetForWhitespaceIndex(i);
			const height = this.getHeightForWhitespaceIndex(i);
			if (top >= verticalOffset2) {
				break;
			}

			result.push({
				id: this.getIdForWhitespaceIndex(i),
				afterLineNumber: this.getAfterLineNumberForWhitespaceIndex(i),
				verticalOffset: top,
				height: height
			});
		}

		return result;
	}

	/**
	 * Get all whitespaces.
	 */
	public getWhitespaces(): IEditorWhitespace[] {
		this._checkPendingChanges();
		// make a copy of all the array containing the whitespaces
		return this._arr.slice(0);
	}

	/**
	 * The number of whitespaces.
	 */
	public getWhitespacesCount(): number {
		this._checkPendingChanges();
		return this._arr.length;
	}

	/**
	 * Get the `id` for whitespace at index `index`.
	 *
	 * @param index The index of the whitespace.
	 * @return `id` of whitespace at `index`.
	 */
	public getIdForWhitespaceIndex(index: number): string {
		this._checkPendingChanges();
		index = index | 0;

		return this._arr[index].id;
	}

	/**
	 * Get the `afterLineNumber` for whitespace at index `index`.
	 *
	 * @param index The index of the whitespace.
	 * @return `afterLineNumber` of whitespace at `index`.
	 */
	public getAfterLineNumberForWhitespaceIndex(index: number): number {
		this._checkPendingChanges();
		index = index | 0;

		return this._arr[index].afterLineNumber;
	}

	/**
	 * Get the `height` for whitespace at index `index`.
	 *
	 * @param index The index of the whitespace.
	 * @return `height` of whitespace at `index`.
	 */
	public getHeightForWhitespaceIndex(index: number): number {
		this._checkPendingChanges();
		index = index | 0;

		return this._arr[index].height;
	}
}
