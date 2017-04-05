/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { IFoldingRange } from 'vs/editor/contrib/folding/common/foldingModel';
import { limitByIndent } from 'vs/editor/contrib/folding/common/indentFoldStrategy';

suite('Indentation Folding', () => {
	function r(startLineNumber: number, endLineNumber: number, indent: number): IFoldingRange {
		return { startLineNumber, endLineNumber, indent };
	}

	test('Limit By indent', () => {
		let ranges = [r(1, 4, 0), r(3, 4, 2), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0), r(10, 15, 10), r(11, 12, 2000), r(14, 15, 2000)];
		assert.deepEqual(limitByIndent(ranges, 8), [r(1, 4, 0), r(3, 4, 2), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0), r(10, 15, 10), r(11, 12, 2000), r(14, 15, 2000)]);
		assert.deepEqual(limitByIndent(ranges, 7), [r(1, 4, 0), r(3, 4, 2), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0), r(10, 15, 10)]);
		assert.deepEqual(limitByIndent(ranges, 6), [r(1, 4, 0), r(3, 4, 2), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0), r(10, 15, 10)]);
		assert.deepEqual(limitByIndent(ranges, 5), [r(1, 4, 0), r(3, 4, 2), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0)]);
		assert.deepEqual(limitByIndent(ranges, 4), [r(1, 4, 0), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0)]);
		assert.deepEqual(limitByIndent(ranges, 3), [r(1, 4, 0), r(5, 8, 0), r(9, 15, 0)]);
		assert.deepEqual(limitByIndent(ranges, 2), []);
		assert.deepEqual(limitByIndent(ranges, 1), []);
		assert.deepEqual(limitByIndent(ranges, 0), []);
	});

});
