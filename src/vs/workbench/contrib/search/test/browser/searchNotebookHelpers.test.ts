/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../../editor/common/core/range.js';
import { FindMatch, IReadonlyTextBuffer } from '../../../../../editor/common/model.js';
import { IFileMatch, ISearchRange, ITextSearchMatch, QueryType } from '../../../../services/search/common/search.js';
import { ICellViewModel } from '../../../notebook/browser/notebookBrowser.js';
import { CellKind } from '../../../notebook/common/notebookCommon.js';
import { contentMatchesToTextSearchMatches, webviewMatchesToTextSearchMatches } from '../../browser/notebookSearch/searchNotebookHelpers.js';
import { CellFindMatchModel } from '../../../notebook/browser/contrib/find/findModel.js';
import { SearchModelImpl } from '../../browser/searchTreeModel/searchModel.js';
import { URI } from '../../../../../base/common/uri.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { createFileUriFromPathFromRoot, stubModelService, stubNotebookEditorService } from './searchTestCommon.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CellMatch, NotebookCompatibleFileMatch, textSearchMatchesToNotebookMatches } from '../../browser/notebookSearch/notebookSearchModel.js';
import { FolderMatchImpl } from '../../browser/searchTreeModel/folderMatch.js';
import { INotebookFileInstanceMatch } from '../../browser/notebookSearch/notebookSearchModelBase.js';

suite('searchNotebookHelpers', () => {
	let instantiationService: TestInstantiationService;
	let mdCellFindMatch: CellFindMatchModel;
	let codeCellFindMatch: CellFindMatchModel;
	let mdInputCell: ICellViewModel;
	let codeCell: ICellViewModel;

	let markdownContentResults: ITextSearchMatch[];
	let codeContentResults: ITextSearchMatch[];
	let codeWebviewResults: ITextSearchMatch[];
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let counter: number = 0;
	setup(() => {

		instantiationService = new TestInstantiationService();
		store.add(instantiationService);
		const modelService = stubModelService(instantiationService, (e) => store.add(e));
		const notebookEditorService = stubNotebookEditorService(instantiationService, (e) => store.add(e));
		instantiationService.stub(IModelService, modelService);
		instantiationService.stub(INotebookEditorService, notebookEditorService);
		mdInputCell = {
			id: 'mdCell',
			cellKind: CellKind.Markup, textBuffer: <IReadonlyTextBuffer>{
				getLineContent(lineNumber: number): string {
					if (lineNumber === 1) {
						return '# Hello World Test';
					} else {
						return '';
					}
				}
			}
		} as ICellViewModel;

		const findMatchMds = [new FindMatch(new Range(1, 15, 1, 19), ['Test'])];
		codeCell = {
			id: 'codeCell',
			cellKind: CellKind.Code, textBuffer: <IReadonlyTextBuffer>{
				getLineContent(lineNumber: number): string {
					if (lineNumber === 1) {
						return 'print("test! testing!!")';
					} else if (lineNumber === 2) {
						return 'print("this is a Test")';
					} else {
						return '';
					}
				}
			}
		} as ICellViewModel;
		const findMatchCodeCells =
			[new FindMatch(new Range(1, 8, 1, 12), ['test']),
			new FindMatch(new Range(1, 14, 1, 18), ['test']),
			new FindMatch(new Range(2, 18, 2, 22), ['Test'])
			];

		const webviewMatches = [{
			index: 0,
			searchPreviewInfo: {
				line: 'test! testing!!',
				range: {
					start: 1,
					end: 5
				}
			}
		},
		{
			index: 1,
			searchPreviewInfo: {
				line: 'test! testing!!',
				range: {
					start: 7,
					end: 11
				}
			}
		},
		{
			index: 3,
			searchPreviewInfo: {
				line: 'this is a Test',
				range: {
					start: 11,
					end: 15
				}
			}
		}

		];


		mdCellFindMatch = new CellFindMatchModel(
			mdInputCell,
			0,
			findMatchMds,
			[],
		);

		codeCellFindMatch = new CellFindMatchModel(
			codeCell,
			5,
			findMatchCodeCells,
			webviewMatches
		);

	});

	teardown(() => {
		instantiationService.dispose();
	});

	suite('notebookEditorMatchesToTextSearchResults', () => {

		function assertRangesEqual(actual: ISearchRange | ISearchRange[], expected: ISearchRange[]) {
			if (!Array.isArray(actual)) {
				actual = [actual];
			}

			assert.strictEqual(actual.length, expected.length);
			actual.forEach((r, i) => {
				const expectedRange = expected[i];
				assert.deepStrictEqual(
					{ startLineNumber: r.startLineNumber, startColumn: r.startColumn, endLineNumber: r.endLineNumber, endColumn: r.endColumn },
					{ startLineNumber: expectedRange.startLineNumber, startColumn: expectedRange.startColumn, endLineNumber: expectedRange.endLineNumber, endColumn: expectedRange.endColumn });
			});
		}

		test('convert CellFindMatchModel to ITextSearchMatch and check results', () => {
			markdownContentResults = contentMatchesToTextSearchMatches(mdCellFindMatch.contentMatches, mdInputCell);
			codeContentResults = contentMatchesToTextSearchMatches(codeCellFindMatch.contentMatches, codeCell);
			codeWebviewResults = webviewMatchesToTextSearchMatches(codeCellFindMatch.webviewMatches);

			assert.strictEqual(markdownContentResults.length, 1);
			assert.strictEqual(markdownContentResults[0].previewText, '# Hello World Test\n');
			assertRangesEqual(markdownContentResults[0].rangeLocations.map(e => e.preview), [new Range(0, 14, 0, 18)]);
			assertRangesEqual(markdownContentResults[0].rangeLocations.map(e => e.source), [new Range(0, 14, 0, 18)]);


			assert.strictEqual(codeContentResults.length, 2);
			assert.strictEqual(codeContentResults[0].previewText, 'print("test! testing!!")\n');
			assert.strictEqual(codeContentResults[1].previewText, 'print("this is a Test")\n');
			assertRangesEqual(codeContentResults[0].rangeLocations.map(e => e.preview), [new Range(0, 7, 0, 11), new Range(0, 13, 0, 17)]);
			assertRangesEqual(codeContentResults[0].rangeLocations.map(e => e.source), [new Range(0, 7, 0, 11), new Range(0, 13, 0, 17)]);

			assert.strictEqual(codeWebviewResults.length, 3);
			assert.strictEqual(codeWebviewResults[0].previewText, 'test! testing!!');
			assert.strictEqual(codeWebviewResults[1].previewText, 'test! testing!!');
			assert.strictEqual(codeWebviewResults[2].previewText, 'this is a Test');

			assertRangesEqual(codeWebviewResults[0].rangeLocations.map(e => e.preview), [new Range(0, 1, 0, 5)]);
			assertRangesEqual(codeWebviewResults[1].rangeLocations.map(e => e.preview), [new Range(0, 7, 0, 11)]);
			assertRangesEqual(codeWebviewResults[2].rangeLocations.map(e => e.preview), [new Range(0, 11, 0, 15)]);
			assertRangesEqual(codeWebviewResults[0].rangeLocations.map(e => e.source), [new Range(0, 1, 0, 5)]);
			assertRangesEqual(codeWebviewResults[1].rangeLocations.map(e => e.source), [new Range(0, 7, 0, 11)]);
			assertRangesEqual(codeWebviewResults[2].rangeLocations.map(e => e.source), [new Range(0, 11, 0, 15)]);
		});

		test('convert ITextSearchMatch to MatchInNotebook', () => {
			const mdCellMatch = new CellMatch(aFileMatch(), mdInputCell, 0);
			const markdownCellContentMatchObjs = textSearchMatchesToNotebookMatches(markdownContentResults, mdCellMatch);

			const codeCellMatch = new CellMatch(aFileMatch(), codeCell, 0);
			const codeCellContentMatchObjs = textSearchMatchesToNotebookMatches(codeContentResults, codeCellMatch);
			const codeWebviewContentMatchObjs = textSearchMatchesToNotebookMatches(codeWebviewResults, codeCellMatch);


			assert.strictEqual(markdownCellContentMatchObjs[0].cell?.id, mdCellMatch.id);
			assertRangesEqual(markdownCellContentMatchObjs[0].range(), [new Range(1, 15, 1, 19)]);

			assert.strictEqual(codeCellContentMatchObjs[0].cell?.id, codeCellMatch.id);
			assert.strictEqual(codeCellContentMatchObjs[1].cell?.id, codeCellMatch.id);
			assertRangesEqual(codeCellContentMatchObjs[0].range(), [new Range(1, 8, 1, 12)]);
			assertRangesEqual(codeCellContentMatchObjs[1].range(), [new Range(1, 14, 1, 18)]);
			assertRangesEqual(codeCellContentMatchObjs[2].range(), [new Range(2, 18, 2, 22)]);

			assert.strictEqual(codeWebviewContentMatchObjs[0].cell?.id, codeCellMatch.id);
			assert.strictEqual(codeWebviewContentMatchObjs[1].cell?.id, codeCellMatch.id);
			assert.strictEqual(codeWebviewContentMatchObjs[2].cell?.id, codeCellMatch.id);
			assertRangesEqual(codeWebviewContentMatchObjs[0].range(), [new Range(1, 2, 1, 6)]);
			assertRangesEqual(codeWebviewContentMatchObjs[1].range(), [new Range(1, 8, 1, 12)]);
			assertRangesEqual(codeWebviewContentMatchObjs[2].range(), [new Range(1, 12, 1, 16)]);

		});


		function aFileMatch(): INotebookFileInstanceMatch {
			const rawMatch: IFileMatch = {
				resource: URI.file('somepath' + ++counter),
				results: []
			};

			const searchModel = instantiationService.createInstance(SearchModelImpl);
			store.add(searchModel);
			const folderMatch = instantiationService.createInstance(FolderMatchImpl, URI.file('somepath'), '', 0, {
				type: QueryType.Text, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
					pattern: ''
				}
			}, searchModel.searchResult.plainTextSearchResult, searchModel.searchResult, null);
			const fileMatch = instantiationService.createInstance(NotebookCompatibleFileMatch, {
				pattern: ''
			}, undefined, undefined, folderMatch, rawMatch, null, '');
			fileMatch.createMatches();
			store.add(folderMatch);
			store.add(fileMatch);

			return fileMatch;
		}
	});
});
