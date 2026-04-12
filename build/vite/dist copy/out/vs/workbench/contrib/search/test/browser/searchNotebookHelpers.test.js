/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Range } from '../../../../../editor/common/core/range.js';
import { FindMatch } from '../../../../../editor/common/model.js';
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
suite('searchNotebookHelpers', () => {
    let instantiationService;
    let mdCellFindMatch;
    let codeCellFindMatch;
    let mdInputCell;
    let codeCell;
    let markdownContentResults;
    let codeContentResults;
    let codeWebviewResults;
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let counter = 0;
    setup(() => {
        instantiationService = new TestInstantiationService();
        store.add(instantiationService);
        const modelService = stubModelService(instantiationService, (e) => store.add(e));
        const notebookEditorService = stubNotebookEditorService(instantiationService, (e) => store.add(e));
        instantiationService.stub(IModelService, modelService);
        instantiationService.stub(INotebookEditorService, notebookEditorService);
        mdInputCell = {
            id: 'mdCell',
            cellKind: CellKind.Markup, textBuffer: {
                getLineContent(lineNumber) {
                    if (lineNumber === 1) {
                        return '# Hello World Test';
                    }
                    else {
                        return '';
                    }
                }
            }
        };
        const findMatchMds = [new FindMatch(new Range(1, 15, 1, 19), ['Test'])];
        codeCell = {
            id: 'codeCell',
            cellKind: CellKind.Code, textBuffer: {
                getLineContent(lineNumber) {
                    if (lineNumber === 1) {
                        return 'print("test! testing!!")';
                    }
                    else if (lineNumber === 2) {
                        return 'print("this is a Test")';
                    }
                    else {
                        return '';
                    }
                }
            }
        };
        const findMatchCodeCells = [new FindMatch(new Range(1, 8, 1, 12), ['test']),
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
        mdCellFindMatch = new CellFindMatchModel(mdInputCell, 0, findMatchMds, []);
        codeCellFindMatch = new CellFindMatchModel(codeCell, 5, findMatchCodeCells, webviewMatches);
    });
    teardown(() => {
        instantiationService.dispose();
    });
    suite('notebookEditorMatchesToTextSearchResults', () => {
        function assertRangesEqual(actual, expected) {
            if (!Array.isArray(actual)) {
                actual = [actual];
            }
            assert.strictEqual(actual.length, expected.length);
            actual.forEach((r, i) => {
                const expectedRange = expected[i];
                assert.deepStrictEqual({ startLineNumber: r.startLineNumber, startColumn: r.startColumn, endLineNumber: r.endLineNumber, endColumn: r.endColumn }, { startLineNumber: expectedRange.startLineNumber, startColumn: expectedRange.startColumn, endLineNumber: expectedRange.endLineNumber, endColumn: expectedRange.endColumn });
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
        function aFileMatch() {
            const rawMatch = {
                resource: URI.file('somepath' + ++counter),
                results: []
            };
            const searchModel = instantiationService.createInstance(SearchModelImpl);
            store.add(searchModel);
            const folderMatch = instantiationService.createInstance(FolderMatchImpl, URI.file('somepath'), '', 0, {
                type: 2 /* QueryType.Text */, folderQueries: [{ folder: createFileUriFromPathFromRoot() }], contentPattern: {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoTm90ZWJvb2tIZWxwZXJzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvdGVzdC9icm93c2VyL3NlYXJjaE5vdGVib29rSGVscGVycy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFNBQVMsRUFBdUIsTUFBTSx1Q0FBdUMsQ0FBQztBQUd2RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDN0ksT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDekYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN6SCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsZ0JBQWdCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNuSCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDckcsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLFNBQVMsRUFBRSwyQkFBMkIsRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pKLE9B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