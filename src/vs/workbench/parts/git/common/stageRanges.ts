/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IChange, IModel, IIdentifiedSingleEditOperation } from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { EditOperation } from 'vs/editor/common/core/editOperation';

export class SelectedChange implements IChange {
	readonly originalStartLineNumber: number;
	readonly originalEndLineNumber: number;
	readonly modifiedStartLineNumber: number;
	readonly modifiedEndLineNumber: number;

	readonly fullModifiedStartLineNumber: number;
	readonly fullModifiedEndLineNumber: number;

	constructor(selected: IChange, full: IChange) {
		this.originalStartLineNumber = selected.originalStartLineNumber;
		this.originalEndLineNumber = selected.originalEndLineNumber;
		this.modifiedStartLineNumber = selected.modifiedStartLineNumber;
		this.modifiedEndLineNumber = selected.modifiedEndLineNumber;

		this.fullModifiedStartLineNumber = full.modifiedStartLineNumber;
		this.fullModifiedEndLineNumber = full.modifiedEndLineNumber;
	}

	get isCompletelySelected(): boolean {
		return this.modifiedStartLineNumber === this.fullModifiedStartLineNumber &&
			this.modifiedEndLineNumber === this.fullModifiedEndLineNumber;
	}

	fullChangeEquals(other: SelectedChange): boolean {
		return this.fullModifiedStartLineNumber === other.fullModifiedStartLineNumber &&
			this.fullModifiedEndLineNumber === other.fullModifiedEndLineNumber;
	}
}

function sortChanges(changes: IChange[]): void {
	changes.sort((left, right) => {
		if (left.originalStartLineNumber < right.originalStartLineNumber) {
			return -1;
		} else if (left.originalStartLineNumber > right.originalStartLineNumber) {
			return 1;
		} else if (left.modifiedStartLineNumber < right.modifiedStartLineNumber) {
			return -1;
		}
		return 1;
	});
}

function fullChangeIsSelected(from: number, changes: SelectedChange[]): boolean {
	const change = changes[from];
	if (change.isCompletelySelected) {
		return true;
	} else if (change.modifiedStartLineNumber === change.fullModifiedStartLineNumber) {
		let i = from + 1;
		while (changes[i] && change.fullChangeEquals(changes[i]) && changes[i].modifiedStartLineNumber + 1 === change.modifiedEndLineNumber) {
			if (changes[i].modifiedEndLineNumber === change.fullModifiedEndLineNumber) {
				return true;
			}
		}
	}

	return false;
}

// function coalesceSelectedChanges(changes: SelectedChange[]): SelectedChange[] {
// 	const result: SelectedChange[] = [];
// 	for (let i = 0; i < changes.length; i++) {
// 		const change = changes[i];
// 		if (change.isCompletelySelected) {
// 			result.push(change);
// 		} else {
// 			if (change.modifiedStartLineNumber === change.fullModifiedStartLineNumber) {
// 				let j = i + 1;
// 				while (changes[j] && changes[j].fullModifiedStartLineNumber === change.fullModifiedStartLineNumber) {
// 					if (changes[j].modifiedEndLineNumber === changes[j].fullModifiedEndLineNumber) {
// 						const fullChange: IChange = {
// 							originalStartLineNumber: change.originalStartLineNumber,
// 							originalEndLineNumber: change.originalEndLineNumber,
// 							modifiedStartLineNumber: change.fullModifiedStartLineNumber,
// 							modifiedEndLineNumber: change.fullModifiedEndLineNumber
// 						 };

// 						result.push(new SelectedChange(fullChange, fullChange));
// 						i = j;
// 						break;
// 					}
// 				}
// 			} else {
// 				result.push(change);
// 			}
// 		}
// 	}

// 	return result;
// }

function sortSelections(selections: Selection[]): void {
	selections.sort((left, right) => {
		if (left.getStartPosition().lineNumber < right.getStartPosition().lineNumber) {
			return -1;
		}
		return 1;
	});
}

function isInsertion(change: IChange): boolean {
	return change.originalEndLineNumber <= 0;
}

function isDeletion(change: IChange): boolean {
	return change.modifiedEndLineNumber <= 0;
}


/**
 * Returns an intersection between a change and a selection.
 * Returns null if intersection does not exist.
 */
export function intersectChangeAndSelection(change: IChange, selection: Selection) {
	var result = {
		modifiedStartLineNumber: Math.max(change.modifiedStartLineNumber, selection.startLineNumber),
		modifiedEndLineNumber: Math.min(change.modifiedEndLineNumber, selection.endLineNumber),
		originalStartLineNumber: change.originalStartLineNumber,
		originalEndLineNumber: change.originalEndLineNumber
	};
	// Deletions have modifiedEndLineNumber = 0. In that case we can not use the simple check if there is an intersection.
	var isDeletionSelected = isDeletion(result) &&
		(change.modifiedStartLineNumber >= selection.startLineNumber) && (change.modifiedStartLineNumber <= selection.endLineNumber);

	if ((result.modifiedStartLineNumber <= result.modifiedEndLineNumber) || isDeletionSelected) {
		return result;
	}
	return null;
}

/**
 * Returns all selected changes (there can be multiple selections due to multiple cursors).
 * If a change is partially selected, the selected part of the change will be returned.
 */
export function getSelectedChanges(changes: IChange[], selections: Selection[]): SelectedChange[] {
	sortChanges(changes);
	sortSelections(selections);
	var result: SelectedChange[] = [];
	var currentSelection = 0;
	var lastLineAdded = -1;

	for (var i = 0; i < changes.length; ++i) {
		// We have to check the previous selection. Since it can contain two changes.
		currentSelection = Math.max(0, currentSelection - 1);
		// Find all selections that are not after the current change.
		while (currentSelection < selections.length &&
			(selections[currentSelection].startLineNumber <= changes[i].modifiedEndLineNumber || isDeletion(changes[i]))) {
			var intersectedChange = intersectChangeAndSelection(changes[i], selections[currentSelection]);
			if (intersectedChange !== null) {
				// Each change needs to be disjoint so we check if we already added this line.
				if (lastLineAdded !== intersectedChange.modifiedStartLineNumber) {
					result.push(new SelectedChange(intersectedChange, changes[i]));
					lastLineAdded = intersectedChange.modifiedEndLineNumber;
				} else {
					// Update change such that we do not add same line twice.
					intersectedChange.modifiedStartLineNumber++;
					if (intersectedChange.modifiedStartLineNumber <= intersectedChange.modifiedEndLineNumber) {
						result.push(new SelectedChange(intersectedChange, changes[i]));
						lastLineAdded = intersectedChange.modifiedEndLineNumber;
					}
				}
			}
			currentSelection++;
		}
	}
	return result;
}

function appendValueFromRange(base: string, model: IModel, range: Range): string {
	var result = base;
	if (result !== '') {
		result += model.getEOL();
	}
	return result + model.getValueInRange(range);
}

/**
 * Applies a list of changes to the original model and returns the new IModel.
 * First sorts changes by line number.
 */
export function applyChangesToModel(original: IModel, modified: IModel, changes: IChange[]): string {
	sortChanges(changes);
	var result = '';
	var positionInOriginal = 1;

	for (var i = 0; i < changes.length; ++i) {
		// We have to update orginalStartLineNumber for insertions, their start line is always one line behind.
		var originalStartLineUpdated = isInsertion(changes[i]) ? changes[i].originalStartLineNumber + 1 : changes[i].originalStartLineNumber;
		if (positionInOriginal < originalStartLineUpdated) {
			result = appendValueFromRange(result, original,
				new Range(positionInOriginal, 1, originalStartLineUpdated - 1, original.getLineMaxColumn(originalStartLineUpdated - 1)));
			positionInOriginal = originalStartLineUpdated;
		}

		if (!isDeletion(changes[i])) {
			result = appendValueFromRange(result, modified,
				new Range(changes[i].modifiedStartLineNumber, 1, changes[i].modifiedEndLineNumber, modified.getLineMaxColumn(changes[i].modifiedEndLineNumber)));
		}
		// Update position in the original file where we continue to concatanate.
		// Only update position if it was not an insertion.
		if (!isInsertion(changes[i])) {
			positionInOriginal = changes[i].originalEndLineNumber + 1;
		}
	}

	// Append the last chunk after all the changes.
	if (positionInOriginal <= original.getLineCount()) {
		result = appendValueFromRange(result, original,
			new Range(positionInOriginal, 1, original.getLineCount(), original.getLineMaxColumn(original.getLineCount())));
	}

	return result;
}

export function getChangeRevertEdits(original: IModel, modified: IModel, changes: SelectedChange[]): IIdentifiedSingleEditOperation[] {
	sortChanges(changes);

	return changes.map((change, i) => {
		if (isInsertion(change)) {
			// Delete inserted range
			const fullRange = getLinesRangeWithOneSurroundingNewline(modified, change.modifiedStartLineNumber, change.modifiedEndLineNumber);
			return EditOperation.delete(fullRange);
		} else if (isDeletion(change)) {
			// Get the original lines and insert at the deleted position
			const value = original.getValueInRange(getLinesRangeWithOneSurroundingNewline(original, change.originalStartLineNumber, change.originalEndLineNumber));
			return EditOperation.insert(new Position(change.modifiedStartLineNumber + 1, 1), value);
		} else {
			// If the entire change hunk is selected, then revert the whole thing.
			// But if only a portion is selected, then get the matching lines from the original side and revert with that.

			// Get the original lines and replace the new lines with it
			if (fullChangeIsSelected(i, changes)) {
				// skip the other changes
				const value = original.getValueInRange(new Range(change.originalStartLineNumber, 1, change.originalEndLineNumber + 1, 1));
				return EditOperation.replace(new Range(change.modifiedStartLineNumber, 1, change.modifiedEndLineNumber + 1, 1), value);
			} else {
				const copyOffset = change.modifiedStartLineNumber - change.fullModifiedStartLineNumber;
				const numLinesToCopy = change.modifiedEndLineNumber - change.modifiedStartLineNumber;
				const copyStartLine = change.originalStartLineNumber + copyOffset;
				const copyEndLine = Math.min(copyStartLine + numLinesToCopy, original.getLineCount());
				const originalRange = new Range(change.originalStartLineNumber, 1, change.originalEndLineNumber, original.getLineMaxColumn(change.originalEndLineNumber));
				const rangeToCopy = originalRange.intersectRanges(
					new Range(copyStartLine, 1, copyEndLine, original.getLineMaxColumn(copyEndLine)));

				if (!rangeToCopy) {
					const fullRange = getLinesRangeWithOneSurroundingNewline(modified, change.modifiedStartLineNumber, change.modifiedEndLineNumber);
					return EditOperation.delete(fullRange);
				}

				const value = original.getValueInRange(rangeToCopy);
				return EditOperation.replace(new Range(change.modifiedStartLineNumber, 1, change.modifiedEndLineNumber, modified.getLineMaxColumn(change.modifiedEndLineNumber)), value);
			}
		}
	});
}

function getLinesRangeWithOneSurroundingNewline(model: IModel, startLine: number, endLine: number): Range {
	let startColumn = 1;
	let endColumn = model.getLineMaxColumn(endLine);
	if (endLine < model.getLineCount()) {
		endLine++;
		endColumn = 1;
	} else if (startLine > 1) {
		startLine--;
		startColumn = model.getLineMaxColumn(startLine);
	}

	return new Range(startLine, startColumn, endLine, endColumn);
}