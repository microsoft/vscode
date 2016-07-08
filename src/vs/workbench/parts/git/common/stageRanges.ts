/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IChange, IModel} from 'vs/editor/common/editorCommon';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';

function sortChanges(changes:IChange[]):void {
	changes.sort((left, right)=>{
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

function sortSelections(selections:Selection[]):void {
	selections.sort((left, right)=>{
		if (left.getStartPosition().lineNumber < right.getStartPosition().lineNumber) {
			return -1;
		}
		return 1;
	});
}

function isInsertion(change:IChange):boolean {
	return change.originalEndLineNumber <= 0;
}

function isDeletion(change:IChange):boolean {
	return change.modifiedEndLineNumber <= 0;
}


/**
 * Returns an intersection between a change and a selection.
 * Returns null if intersection does not exist.
 */
export function intersectChangeAndSelection(change:IChange, selection:Selection):IChange {
	var result:IChange = {
		modifiedStartLineNumber : Math.max(change.modifiedStartLineNumber, selection.startLineNumber),
		modifiedEndLineNumber : Math.min(change.modifiedEndLineNumber, selection.endLineNumber),
		originalStartLineNumber : change.originalStartLineNumber,
		originalEndLineNumber : change.originalEndLineNumber
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
export function getSelectedChanges(changes:IChange[], selections:Selection[]):IChange[] {
	sortChanges(changes);
	sortSelections(selections);
	var result: IChange[] = [];
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
					result.push(intersectedChange);
					lastLineAdded = intersectedChange.modifiedEndLineNumber;
				} else {
					// Update change such that we do not add same line twice.
					intersectedChange.modifiedStartLineNumber++;
					if (intersectedChange.modifiedStartLineNumber <= intersectedChange.modifiedEndLineNumber) {
						result.push(intersectedChange);
						lastLineAdded = intersectedChange.modifiedEndLineNumber;
					}
				}
			}
			currentSelection++;
		}
	}
	return result;
}

function appendValueFromRange(base:string, model:IModel, range:Range):string {
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
export function applyChangesToModel(original:IModel, modified:IModel, changes:IChange[]): string {
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