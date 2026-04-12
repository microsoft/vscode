/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { DiffEditorHeightCalculatorService } from '../../../browser/diff/editorHeightCalculator.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createTextModel as createTextModelWithText } from '../../../../../../editor/test/common/testTextModel.js';
import { DefaultLinesDiffComputer } from '../../../../../../editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js';
import { getEditorPadding } from '../../../browser/diff/diffCellEditorOptions.js';
import { HeightOfHiddenLinesRegionInDiffEditor } from '../../../browser/diff/diffElementViewModel.js';
suite('NotebookDiff EditorHeightCalculator', () => {
    ['Hide Unchanged Regions', 'Show Unchanged Regions'].forEach(suiteTitle => {
        suite(suiteTitle, () => {
            const fontInfo = { lineHeight: 18, fontSize: 18 };
            let disposables;
            let textModelResolver;
            let editorWorkerService;
            const original = URI.parse('original');
            const modified = URI.parse('modified');
            let originalModel;
            let modifiedModel;
            const diffComputer = new DefaultLinesDiffComputer();
            let calculator;
            const hideUnchangedRegions = suiteTitle.startsWith('Hide');
            const configurationService = new TestConfigurationService({
                notebook: { diff: { ignoreMetadata: true } }, diffEditor: {
                    hideUnchangedRegions: {
                        enabled: hideUnchangedRegions, minimumLineCount: 3, contextLineCount: 3
                    }
                }
            });
            function createTextModel(lines) {
                return createTextModelWithText(lines.join('\n'));
            }
            teardown(() => disposables.dispose());
            ensureNoDisposablesAreLeakedInTestSuite();
            setup(() => {
                disposables = new DisposableStore();
                textModelResolver = new class extends mock() {
                    async createModelReference(resource) {
                        return {
                            dispose: () => { },
                            object: {
                                textEditorModel: resource === original ? originalModel : modifiedModel,
                                getLanguageId: () => 'javascript',
                            }
                        };
                    }
                };
                editorWorkerService = new class extends mock() {
                    async computeDiff(_original, _modified, options, _algorithm) {
                        const originalLines = new Array(originalModel.getLineCount()).fill(0).map((_, i) => originalModel.getLineContent(i + 1));
                        const modifiedLines = new Array(modifiedModel.getLineCount()).fill(0).map((_, i) => modifiedModel.getLineContent(i + 1));
                        const result = diffComputer.computeDiff(originalLines, modifiedLines, options);
                        const identical = originalLines.join('') === modifiedLines.join('');
                        return {
                            identical,
                            quitEarly: result.hitTimeout,
                            changes: result.changes,
                            moves: result.moves,
                        };
                    }
                };
                calculator = new DiffEditorHeightCalculatorService(fontInfo.lineHeight, textModelResolver, editorWorkerService, configurationService);
            });
            test('1 original line with change in same line', async () => {
                originalModel = disposables.add(createTextModel(['Hello World']));
                modifiedModel = disposables.add(createTextModel(['Foo Bar']));
                const height = await calculator.diffAndComputeHeight(original, modified);
                const expectedHeight = getExpectedHeight(1, 0);
                assert.strictEqual(height, expectedHeight);
            });
            test('1 original line with insertion of a new line', async () => {
                originalModel = disposables.add(createTextModel(['Hello World']));
                modifiedModel = disposables.add(createTextModel(['Hello World', 'Foo Bar']));
                const height = await calculator.diffAndComputeHeight(original, modified);
                const expectedHeight = getExpectedHeight(2, 0);
                assert.strictEqual(height, expectedHeight);
            });
            test('1 line with update to a line and insert of a new line', async () => {
                originalModel = disposables.add(createTextModel(['Hello World']));
                modifiedModel = disposables.add(createTextModel(['Foo Bar', 'Bar Baz']));
                const height = await calculator.diffAndComputeHeight(original, modified);
                const expectedHeight = getExpectedHeight(2, 0);
                assert.strictEqual(height, expectedHeight);
            });
            test('10 line with update to a line and insert of a new line', async () => {
                originalModel = disposables.add(createTextModel(createLines(10)));
                modifiedModel = disposables.add(createTextModel(createLines(10).concat('Foo Bar')));
                const height = await calculator.diffAndComputeHeight(original, modified);
                const expectedHeight = getExpectedHeight(hideUnchangedRegions ? 4 : 11, hideUnchangedRegions ? 1 : 0);
                assert.strictEqual(height, expectedHeight);
            });
            test('50 lines with updates, deletions and inserts', async () => {
                originalModel = disposables.add(createTextModel(createLines(60)));
                const modifiedLines = createLines(60);
                modifiedLines[3] = 'Foo Bar';
                modifiedLines.splice(7, 3);
                modifiedLines.splice(10, 0, 'Foo Bar1', 'Foo Bar2', 'Foo Bar3');
                modifiedLines.splice(30, 0, '', '');
                modifiedLines.splice(40, 4);
                modifiedLines.splice(50, 0, '1', '2', '3', '4', '5');
                modifiedModel = disposables.add(createTextModel(modifiedLines));
                const height = await calculator.diffAndComputeHeight(original, modified);
                const expectedHeight = getExpectedHeight(hideUnchangedRegions ? 50 : 70, hideUnchangedRegions ? 3 : 0);
                assert.strictEqual(height, expectedHeight);
            });
            function getExpectedHeight(visibleLineCount, unchangeRegionsHeight) {
                return (visibleLineCount * fontInfo.lineHeight) + getEditorPadding(visibleLineCount).top + getEditorPadding(visibleLineCount).bottom + (unchangeRegionsHeight * HeightOfHiddenLinesRegionInDiffEditor);
            }
            function createLines(count, linePrefix = 'Hello World') {
                return new Array(count).fill(0).map((_, i) => `${linePrefix} ${i}`);
            }
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9ySGVpZ2h0Q2FsY3VsYXRvci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svdGVzdC9icm93c2VyL2RpZmYvZWRpdG9ySGVpZ2h0Q2FsY3VsYXRvci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFjLE1BQU0sNENBQTRDLENBQUM7QUFDekYsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBR3BHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsZUFBZSxJQUFJLHVCQUF1QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFbkgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMkZBQTJGLENBQUM7QUFHckksT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEYsT0FBTyxFQUFFLHFDQUFxQyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFdEcsS0FBSyxDQUFDLHFDQUFxQyxFQUFFLEdBQUcsRUFBRTtJQUNqRCxDQUFDLHdCQUF3QixFQUFFLHdCQUF3QixDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1FBQ3pFLEtBQUssQ0FBQyxVQUFVLEVBQUUsR0FBRyxFQUFFO1lBQ3RCLE1BQU0sUUFBUSxHQUFhLEVBQUUsVUFBVSxFQUFFLEVB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