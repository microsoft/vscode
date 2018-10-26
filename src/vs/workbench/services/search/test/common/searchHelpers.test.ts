/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITextModel, FindMatch } from 'vs/editor/common/model';
import { editorMatchesToTextSearchResults } from 'vs/workbench/services/search/common/searchHelpers';
import { Range } from 'vs/editor/common/core/range';

suite('editorMatchesToTextSearchResults', () => {
	const mockTextModel: ITextModel = <ITextModel>{
		getLineContent(lineNumber: number): string {
			return '' + lineNumber;
		}
	};

	test('simple', () => {
		const results = editorMatchesToTextSearchResults([new FindMatch(new Range(6, 1, 6, 2), null)], mockTextModel);
		assert.equal(results.length, 1);
		assert.equal(results[0].preview.text, '6');
		assert.deepEqual(results[0].preview.matches, [new Range(0, 0, 0, 1)]);
		assert.deepEqual(results[0].ranges, [new Range(5, 0, 5, 1)]);
	});

	test('multiple', () => {
		const results = editorMatchesToTextSearchResults(
			[
				new FindMatch(new Range(6, 1, 6, 2), null),
				new FindMatch(new Range(6, 4, 8, 2), null),
				new FindMatch(new Range(9, 1, 10, 3), null),
			],
			mockTextModel);
		assert.equal(results.length, 2);
		assert.deepEqual(results[0].preview.matches, [
			new Range(0, 0, 0, 1),
			new Range(0, 3, 2, 1),
		]);
		assert.deepEqual(results[0].ranges, [
			new Range(5, 0, 5, 1),
			new Range(5, 3, 7, 1),
		]);
		assert.equal(results[0].preview.text, '6\n7\n8');

		assert.deepEqual(results[1].preview.matches, [
			new Range(0, 0, 1, 2),
		]);
		assert.deepEqual(results[1].ranges, [
			new Range(8, 0, 9, 2),
		]);
		assert.equal(results[1].preview.text, '9\n10');
	});
});