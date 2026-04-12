/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { FindMatch } from '../../../../../editor/common/model.js';
import { getTextSearchMatchWithModelContext, editorMatchesToTextSearchResults } from '../../common/searchHelpers.js';
suite('SearchHelpers', () => {
    suite('editorMatchesToTextSearchResults', () => {
        ensureNoDisposablesAreLeakedInTestSuite();
        const mockTextModel = {
            getLineContent(lineNumber) {
                return '' + lineNumber;
            }
        };
        function assertRangesEqual(actual, expected) {
            if (!Array.isArray(actual)) {
                // All of these tests are for arrays...
                throw new Error('Expected array of ranges');
            }
            assert.strictEqual(actual.length, expected.length);
            // These are sometimes Range, sometimes SearchRange
            actual.forEach((r, i) => {
                const expectedRange = expected[i];
                assert.deepStrictEqual({ startLineNumber: r.startLineNumber, startColumn: r.startColumn, endLineNumber: r.endLineNumber, endColumn: r.endColumn }, { startLineNumber: expectedRange.startLineNumber, startColumn: expectedRange.startColumn, endLineNumber: expectedRange.endLineNumber, endColumn: expectedRange.endColumn });
            });
        }
        test('simple', () => {
            const results = editorMatchesToTextSearchResults([new FindMatch(new Range(6, 1, 6, 2), null)], mockTextModel);
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].previewText, '6\n');
            assertRangesEqual(results[0].rangeLocations.map(e => e.preview), [new Range(0, 0, 0, 1)]);
            assertRangesEqual(results[0].rangeLocations.map(e => e.source), [new Range(5, 0, 5, 1)]);
        });
        test('multiple', () => {
            const results = editorMatchesToTextSearchResults([
                new FindMatch(new Range(6, 1, 6, 2), null),
                new FindMatch(new Range(6, 4, 8, 2), null),
                new FindMatch(new Range(9, 1, 10, 3), null),
            ], mockTextModel);
            assert.strictEqual(results.length, 2);
            assertRangesEqual(results[0].rangeLocations.map(e => e.preview), [
                new Range(0, 0, 0, 1),
                new Range(0, 3, 2, 1),
            ]);
            assertRangesEqual(results[0].rangeLocations.map(e => e.source), [
                new Range(5, 0, 5, 1),
                new Range(5, 3, 7, 1),
            ]);
            assert.strictEqual(results[0].previewText, '6\n7\n8\n');
            assertRangesEqual(results[1].rangeLocations.map(e => e.preview), [
                new Range(0, 0, 1, 2),
            ]);
            assertRangesEqual(results[1].rangeLocations.map(e => e.source), [
                new Range(8, 0, 9, 2),
            ]);
            assert.strictEqual(results[1].previewText, '9\n10\n');
        });
    });
    suite('addContextToEditorMatches', () => {
        ensureNoDisposablesAreLeakedInTestSuite();
        const MOCK_LINE_COUNT = 100;
        const mockTextModel = {
            getLineContent(lineNumber) {
                if (lineNumber < 1 || lineNumber > MOCK_LINE_COUNT) {
                    throw new Error(`invalid line count: ${lineNumber}`);
                }
                return '' + lineNumber;
            },
            getLineCount() {
                return MOCK_LINE_COUNT;
            }
        };
        function getQuery(surroundingContext) {
            return {
                folderQueries: [],
                type: 2 /* QueryType.Text */,
                contentPattern: { pattern: 'test' },
                surroundingContext,
            };
        }
        test('no context', () => {
            const matches = [{
                    previewText: 'foo',
                    rangeLocations: [
                        {
                            preview: new Range(0, 0, 0, 10),
                            source: new Range(0, 0, 0, 10)
                        }
                    ]
                }];
            assert.deepStrictEqual(getTextSearchMatchWithModelContext(matches, mockTextModel, getQuery()), matches);
        });
        test('simple', () => {
            const matches = [{
                    previewText: 'foo',
                    rangeLocations: [
                        {
                            preview: new Range(0, 0, 0, 10),
                            source: new Range(1, 0, 1, 10)
                        }
                    ]
                }
            ];
            assert.deepStrictEqual(getTextSearchMatchWithModelContext(matches, mockTextModel, getQuery(1)), [
                {
                    text: '1',
                    lineNumber: 1
                },
                ...matches,
                {
                    text: '3',
                    lineNumber: 3
                },
            ]);
        });
        test('multiple matches next to each other', () => {
            const matches = [
                {
                    previewText: 'foo',
                    rangeLocations: [
                        {
                            preview: new Range(0, 0, 0, 10),
                            source: new Range(1, 0, 1, 10)
                        }
                    ]
                },
                {
                    previewText: 'bar',
                    rangeLocations: [
                        {
                            preview: new Range(0, 0, 0, 10),
                            source: new Range(2, 0, 2, 10)
                        }
                    ]
                }
            ];
            assert.deepStrictEqual(getTextSearchMatchWithModelContext(matches, mockTextModel, getQuery(1)), [
                {
                    text: '1',
                    lineNumber: 1
                },
                ...matches,
                {
                    text: '4',
                    lineNumber: 4
                },
            ]);
        });
        test('boundaries', () => {
            const matches = [
                {
                    previewText: 'foo',
                    rangeLocations: [
                        {
                            preview: new Range(0, 0, 0, 10),
                            source: new Range(0, 0, 0, 10)
                        }
                    ]
                },
                {
                    previewText: 'bar',
                    rangeLocations: [
                        {
                            preview: new Range(0, 0, 0, 10),
                            source: new Range(MOCK_LINE_COUNT - 1, 0, MOCK_LINE_COUNT - 1, 10)
                        }
                    ]
                }
            ];
            assert.deepStrictEqual(getTextSearchMatchWithModelContext(matches, mockTextModel, getQuery(1)), [
                matches[0],
                {
                    text: '2',
                    lineNumber: 2
                },
                {
                    text: '' + (MOCK_LINE_COUNT - 1),
                    lineNumber: MOCK_LINE_COUNT - 1
                },
                matches[1]
            ]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoSGVscGVycy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC90ZXN0L2NvbW1vbi9zZWFyY2hIZWxwZXJzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsU0FBUyxFQUFjLE1BQU0sdUNBQXVDLENBQUM7QUFFOUUsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFckgsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7SUFDM0IsS0FBSyxDQUFDLGtDQUFrQyxFQUFFLEdBQUcsRUFBRTtRQUM5Qyx1Q0FBdUMsRUFBRSxDQUFDO1FBQzFDLE1BQU0sYUFBYSxHQUFHO1lBQ3JCLGNBQWMsQ0FBQyxVQUFrQjtnQkFDaEMsT0FBTyxFQUFFLEdBQUcsVUFBVSxDQUFDO1lBQ3hCLENBQUM7U0FDYSxDQUFDO1FBRWhCLFNBQVMsaUJBQWlCLENBQUMsTUFBcUMsRUFBRSxRQUF3QjtZQUN6RixJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUM1Qix1Q0FBdUM7Z0JBQ3ZDLE1BQU0sSUFBSSxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztZQUM3QyxDQUFDO1lBRUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUVuRCxtREFBbUQ7WUFDbkQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxD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