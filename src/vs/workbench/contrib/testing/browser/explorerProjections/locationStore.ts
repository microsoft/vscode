/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findFirstInSorted } from 'vs/base/common/arrays';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { Location as ModeLocation } from 'vs/editor/common/modes';

export const locationsEqual = (a: ModeLocation | undefined, b: ModeLocation | undefined) => {
	if (a === undefined || b === undefined) {
		return b === a;
	}

	return a.uri.toString() === b.uri.toString()
		&& a.range.startLineNumber === b.range.startLineNumber
		&& a.range.startColumn === b.range.startColumn
		&& a.range.endLineNumber === b.range.endLineNumber
		&& a.range.endColumn === b.range.endColumn;
};

/**
 * Stores and looks up test-item-like-objects by their uri/range. Used to
 * implement the 'reveal' action efficiently.
 */
export class TestLocationStore<T extends { location?: ModeLocation, depth: number }> {
	private readonly itemsByUri = new Map<string, T[]>();

	public getTestAtPosition(uri: URI, position: Position) {
		const tests = this.itemsByUri.get(uri.toString());
		if (!tests) {
			return;
		}

		return tests.find(test => {
			const range = test.location?.range;
			return range
				&& new Position(range.startLineNumber, range.startColumn).isBeforeOrEqual(position)
				&& position.isBefore(new Position(
					range.endLineNumber ?? range.startLineNumber,
					range.endColumn ?? range.startColumn,
				));
		});
	}

	public remove(item: T, fromLocation = item.location) {
		if (!fromLocation) {
			return;
		}

		const key = fromLocation.uri.toString();
		const arr = this.itemsByUri.get(key);
		if (!arr) {
			return;
		}

		for (let i = 0; i < arr.length; i++) {
			if (arr[i] === item) {
				arr.splice(i, 1);
				return;
			}
		}
	}

	public add(item: T) {
		if (!item.location) {
			return;
		}

		const key = item.location.uri.toString();
		const arr = this.itemsByUri.get(key);
		if (!arr) {
			this.itemsByUri.set(key, [item]);
			return;
		}

		arr.splice(findFirstInSorted(arr, x => x.depth < item.depth), 0, item);
	}
}
