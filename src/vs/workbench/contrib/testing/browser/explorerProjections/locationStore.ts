/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findFirstInSorted } from 'vs/base/common/arrays';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IRichLocation } from 'vs/workbench/contrib/testing/common/testCollection';

export const locationsEqual = (a: IRichLocation | undefined, b: IRichLocation | undefined) => {
	if (a === undefined || b === undefined) {
		return b === a;
	}

	return a.uri.toString() === b.uri.toString() && a.range.equalsRange(b.range);
};

/**
 * Stores and looks up test-item-like-objects by their uri/range. Used to
 * implement the 'reveal' action efficiently.
 */
export class TestLocationStore<T extends { location?: IRichLocation, depth: number }> {
	private readonly itemsByUri = new Map<string, T[]>();

	public hasTestInDocument(uri: URI) {
		return !!this.itemsByUri.get(uri.toString())?.length;
	}

	public getTestAtPosition(uri: URI, position: Position) {
		const tests = this.itemsByUri.get(uri.toString());
		if (!tests) {
			return;
		}

		return tests.find(test => {
			const range = test.location?.range;
			return range && Range.lift(range).containsPosition(position);
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
