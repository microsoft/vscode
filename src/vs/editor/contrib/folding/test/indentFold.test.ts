/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { RangesCollector } from 'vs/editor/common/model/indentRanges';

interface IndentRange {
	startLineNumber: number;
	endLineNumber: number;
	indent: number;
}

suite('Indentation Folding', () => {
	function r(startLineNumber: number, endLineNumber: number, indent: number): IndentRange {
		return { startLineNumber, endLineNumber, indent };
	}

	test('Limit By indent', () => {
		let input = [r(1, 4, 0), r(3, 4, 2), r(5, 8, 0), r(6, 7, 1), r(9, 15, 0), r(10, 15, 10), r(11, 12, 2000), r(14, 15, 2000)];


		function assertLimit(maxEntries: number, expectedIndentLimit: number) {
			let collector = new RangesCollector(maxEntries);
			for (let i of input) {
				collector.insertFirst(i.startLineNumber, i.endLineNumber, i.indent);
			}
			let indentRanges = collector.toIndentRanges(null);
			assert.equal(indentRanges.indentLimit, expectedIndentLimit);
			assert.ok(input.filter(r => r.indent < expectedIndentLimit).length <= maxEntries);
		}

		assertLimit(8, 11);
		assertLimit(7, 11);
		assertLimit(6, 11);
		assertLimit(5, 10);
		assertLimit(4, 2);
		assertLimit(3, 1);
		assertLimit(2, 0);
		assertLimit(1, 0);
		assertLimit(0, 0);
	});

});
