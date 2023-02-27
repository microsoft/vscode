/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Range } from 'vs/editor/common/core/range';
import { FindMatch, IReadonlyTextBuffer } from 'vs/editor/common/model';
import { notebookEditorMatchesToTextSearchResults } from 'vs/workbench/contrib/search/browser/searchNotebookHelpers';
import { ISearchRange } from 'vs/workbench/services/search/common/search';
import { CellFindMatchWithIndex, ICellViewModel, CellWebviewFindMatch } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';

suite('searchNotebookHelpers', () => {
	setup(() => {
	});
	suite('notebookEditorMatchesToTextSearchResults', () => {

		function assertRangesEqual(actual: ISearchRange | ISearchRange[], expected: ISearchRange[]) {
			if (!Array.isArray(actual)) {
				// All of these tests are for arrays...
				throw new Error('Expected array of ranges');
			}

			assert.strictEqual(actual.length, expected.length);

			// These are sometimes Range, sometimes SearchRange
			actual.forEach((r, i) => {
				const expectedRange = expected[i];
				assert.deepStrictEqual(
					{ startLineNumber: r.startLineNumber, startColumn: r.startColumn, endLineNumber: r.endLineNumber, endColumn: r.endColumn },
					{ startLineNumber: expectedRange.startLineNumber, startColumn: expectedRange.startColumn, endLineNumber: expectedRange.endLineNumber, endColumn: expectedRange.endColumn });
			});
		}

		test('simple', () => {
			const cell = {
				cellKind: CellKind.Code, textBuffer: <IReadonlyTextBuffer>{
					getLineContent(lineNumber: number): string {
						return 'test';
					}
				}
			} as ICellViewModel;

			const findMatch = new FindMatch(new Range(5, 1, 5, 2), null);
			const cellFindMatchWithIndex: CellFindMatchWithIndex = <CellFindMatchWithIndex>{
				cell,
				index: 0,
				length: 5,
				getMatch(index: number): FindMatch | CellWebviewFindMatch {
					return findMatch;
				},
				contentMatches: [findMatch],
				webviewMatches: []
			};

			const results = notebookEditorMatchesToTextSearchResults([cellFindMatchWithIndex]);
			assert.strictEqual(results.length, 1);
			assert.strictEqual(results[0].preview.text, 'test\n');
			assertRangesEqual(results[0].preview.matches, [new Range(0, 0, 0, 1)]);
			assertRangesEqual(results[0].ranges, [new Range(4, 0, 4, 1)]);
		});

	});
});
