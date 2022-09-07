/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { LengthObj } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/length';
import { DocumentRangeMap, RangeMapping } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';

suite('merge editor mapping', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('DocumentRangeMap', () => {
		const documentMap = createDocumentRangeMap([
			'1:3',
			['0:2', '0:3'],
			'1:1',
			['1:2', '3:3'],
			'0:2',
			['0:2', '0:3'],
		]);

		test('map', () => assert.deepStrictEqual(documentMap.rangeMappings.map(m => m.toString()), [
			'[2:4, 2:6) -> [2:4, 2:7)',
			'[3:2, 4:3) -> [3:2, 6:4)',
			'[4:5, 4:7) -> [6:6, 6:9)'
		]));

		function f(this: Mocha.Context) {
			return documentMap.project(parsePos(this.test!.title)).toString();
		}

		test('1:1', function () { assert.deepStrictEqual(f.apply(this), '[1:1, 1:1) -> [1:1, 1:1)'); });
		test('2:3', function () { assert.deepStrictEqual(f.apply(this), '[2:3, 2:3) -> [2:3, 2:3)'); });
		test('2:4', function () { assert.deepStrictEqual(f.apply(this), '[2:4, 2:6) -> [2:4, 2:7)'); });
		test('2:5', function () { assert.deepStrictEqual(f.apply(this), '[2:4, 2:6) -> [2:4, 2:7)'); });
		test('2:6', function () { assert.deepStrictEqual(f.apply(this), '[2:6, 2:6) -> [2:7, 2:7)'); });
		test('2:7', function () { assert.deepStrictEqual(f.apply(this), '[2:7, 2:7) -> [2:8, 2:8)'); });
		test('3:1', function () { assert.deepStrictEqual(f.apply(this), '[3:1, 3:1) -> [3:1, 3:1)'); });
		test('3:2', function () { assert.deepStrictEqual(f.apply(this), '[3:2, 4:3) -> [3:2, 6:4)'); });
		test('4:2', function () { assert.deepStrictEqual(f.apply(this), '[3:2, 4:3) -> [3:2, 6:4)'); });
		test('4:3', function () { assert.deepStrictEqual(f.apply(this), '[4:3, 4:3) -> [6:4, 6:4)'); });
		test('4:4', function () { assert.deepStrictEqual(f.apply(this), '[4:4, 4:4) -> [6:5, 6:5)'); });
		test('4:5', function () { assert.deepStrictEqual(f.apply(this), '[4:5, 4:7) -> [6:6, 6:9)'); });
	});
});

function parsePos(str: string): Position {
	const [lineCount, columnCount] = str.split(':');
	return new Position(parseInt(lineCount, 10), parseInt(columnCount, 10));
}

function parseLengthObj(str: string): LengthObj {
	const [lineCount, columnCount] = str.split(':');
	return new LengthObj(parseInt(lineCount, 10), parseInt(columnCount, 10));
}

function toPosition(length: LengthObj): Position {
	return new Position(length.lineCount + 1, length.columnCount + 1);
}

function createDocumentRangeMap(items: ([string, string] | string)[]) {
	const mappings: RangeMapping[] = [];
	let lastLen1 = new LengthObj(0, 0);
	let lastLen2 = new LengthObj(0, 0);
	for (const item of items) {
		if (typeof item === 'string') {
			const len = parseLengthObj(item);
			lastLen1 = lastLen1.add(len);
			lastLen2 = lastLen2.add(len);
		} else {
			const len1 = parseLengthObj(item[0]);
			const len2 = parseLengthObj(item[1]);
			mappings.push(new RangeMapping(
				Range.fromPositions(toPosition(lastLen1), toPosition(lastLen1.add(len1))),
				Range.fromPositions(toPosition(lastLen2), toPosition(lastLen2.add(len2))),
			));
			lastLen1 = lastLen1.add(len1);
			lastLen2 = lastLen2.add(len2);
		}
	}

	return new DocumentRangeMap(mappings, lastLen1.lineCount);
}
