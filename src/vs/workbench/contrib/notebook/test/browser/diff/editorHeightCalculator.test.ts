/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, IReference } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { DiffEditorHeightCalculatorService } from '../../../browser/diff/editorHeightCalculator.js';
import { FontInfo } from '../../../../../../editor/common/config/fontInfo.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { createTextModel as createTextModelWithText } from '../../../../../../editor/test/common/testTextModel.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { DefaultLinesDiffComputer } from '../../../../../../editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js';
import { DiffAlgorithmName, IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { IDocumentDiffProviderOptions, IDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { getEditorPadding } from '../../../browser/diff/diffCellEditorOptions.js';
import { HeightOfHiddenLinesRegionInDiffEditor } from '../../../browser/diff/diffElementViewModel.js';

suite('NotebookDiff EditorHeightCalculator', () => {
	['Hide Unchanged Regions', 'Show Unchanged Regions'].forEach(suiteTitle => {
		suite(suiteTitle, () => {
			const fontInfo: FontInfo = { lineHeight: 18, fontSize: 18 } as FontInfo;
			let disposables: DisposableStore;
			let textModelResolver: ITextModelService;
			let editorWorkerService: IEditorWorkerService;
			const original: URI = URI.parse('original');
			const modified: URI = URI.parse('modified');
			let originalModel: ITextModel;
			let modifiedModel: ITextModel;
			const diffComputer = new DefaultLinesDiffComputer();
			let calculator: DiffEditorHeightCalculatorService;
			const hideUnchangedRegions = suiteTitle.startsWith('Hide');
			const configurationService = new TestConfigurationService({
				notebook: { diff: { ignoreMetadata: true } }, diffEditor: {
					hideUnchangedRegions: {
						enabled: hideUnchangedRegions, minimumLineCount: 3, contextLineCount: 3
					}
				}
			});

			function createTextModel(lines: string[]): ITextModel {
				return createTextModelWithText(lines.join('\n'));
			}

			teardown(() => disposables.dispose());
			ensureNoDisposablesAreLeakedInTestSuite();

			setup(() => {
				disposables = new DisposableStore();
				textModelResolver = new class extends mock<ITextModelService>() {
					override async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
						return {
							dispose: () => { },
							object: {
								textEditorModel: resource === original ? originalModel : modifiedModel,
								getLanguageId: () => 'javascript',
							} as IResolvedTextEditorModel
						};
					}
				};
				editorWorkerService = new class extends mock<IEditorWorkerService>() {
					override async computeDiff(_original: URI, _modified: URI, options: IDocumentDiffProviderOptions, _algorithm: DiffAlgorithmName): Promise<IDocumentDiff | null> {
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

			function getExpectedHeight(visibleLineCount: number, unchangeRegionsHeight: number): number {
				return (visibleLineCount * fontInfo.lineHeight) + getEditorPadding(visibleLineCount).top + getEditorPadding(visibleLineCount).bottom + (unchangeRegionsHeight * HeightOfHiddenLinesRegionInDiffEditor);
			}

			function createLines(count: number, linePrefix = 'Hello World'): string[] {
				return new Array(count).fill(0).map((_, i) => `${linePrefix} ${i}`);
			}
		});
	});
});
