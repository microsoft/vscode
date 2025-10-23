/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../../../editor/common/core/range.js';
import { FindMatch, ITextBuffer, ValidAnnotatedEditOperation } from '../../../../../../editor/common/model.js';
import { USUAL_WORD_SEPARATORS } from '../../../../../../editor/common/core/wordHelper.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { FindReplaceState } from '../../../../../../editor/contrib/find/browser/findState.js';
import { IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NotebookFindFilters } from '../../../browser/contrib/find/findFilters.js';
import { CellFindMatchModel, FindModel } from '../../../browser/contrib/find/findModel.js';
import { IActiveNotebookEditor, ICellModelDecorations, ICellModelDeltaDecorations } from '../../../browser/notebookBrowser.js';
import { NotebookViewModel } from '../../../browser/viewModel/notebookViewModelImpl.js';
import { CellEditType, CellKind } from '../../../common/notebookCommon.js';
import { TestCell, withTestNotebook } from '../testNotebookEditor.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('Notebook Find', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const configurationValue: IConfigurationValue<any> = {
		value: USUAL_WORD_SEPARATORS
	};
	const configurationService = new class extends TestConfigurationService {
		override inspect() {
			return configurationValue;
		}
	}();

	const setupEditorForTest = (editor: IActiveNotebookEditor, viewModel: NotebookViewModel) => {
		editor.changeModelDecorations = (callback) => {
			return callback({
				deltaDecorations: (oldDecorations: ICellModelDecorations[], newDecorations: ICellModelDeltaDecorations[]) => {
					const ret: ICellModelDecorations[] = [];
					newDecorations.forEach(dec => {
						const cell = viewModel.viewCells.find(cell => cell.handle === dec.ownerId);
						const decorations = cell?.deltaModelDecorations([], dec.decorations) ?? [];

						if (decorations.length > 0) {
							ret.push({ ownerId: dec.ownerId, decorations: decorations });
						}
					});

					return ret;
				}
			});
		};
	};

	test('Update find matches basics', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 2', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				accessor.stub(IConfigurationService, configurationService);
				const state = disposables.add(new FindReplaceState<NotebookFindFilters>());
				const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));

				const found = new Promise<boolean>(resolve => disposables.add(state.onFindReplaceStateChange(e => {
					if (e.matchesCount) { resolve(true); }
				})));
				state.change({ isRevealed: true }, true);
				state.change({ searchString: '1' }, true);
				await found;
				assert.strictEqual(model.findMatches.length, 2);
				assert.strictEqual(model.currentMatch, 0);
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 1);
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 0);
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 1);

				assert.strictEqual(editor.textModel.length, 3);

				const found2 = new Promise<boolean>(resolve => disposables.add(state.onFindReplaceStateChange(e => {
					if (e.matchesCount) { resolve(true); }
				})));
				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 3, count: 0, cells: [
						disposables.add(new TestCell(viewModel.viewType, 3, '# next paragraph 1', 'markdown', CellKind.Code, [], accessor.get(ILanguageService))),
					]
				}], true, undefined, () => undefined, undefined, true);
				await found2;
				assert.strictEqual(editor.textModel.length, 4);
				assert.strictEqual(model.findMatches.length, 3);
				assert.strictEqual(model.currentMatch, 1);
			});
	});

	test('Update find matches basics 2', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1.1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1.2', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1.3', 'markdown', CellKind.Markup, [], {}],
				['paragraph 2', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				setupEditorForTest(editor, viewModel);
				accessor.stub(IConfigurationService, configurationService);
				const state = disposables.add(new FindReplaceState<NotebookFindFilters>());
				const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
				const found = new Promise<boolean>(resolve => disposables.add(state.onFindReplaceStateChange(e => {
					if (e.matchesCount) { resolve(true); }
				})));
				state.change({ isRevealed: true }, true);
				state.change({ searchString: '1' }, true);
				await found;
				// find matches is not necessarily find results
				assert.strictEqual(model.findMatches.length, 4);
				assert.strictEqual(model.currentMatch, 0);
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 1);
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 2);
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 3);

				const found2 = new Promise<boolean>(resolve => disposables.add(state.onFindReplaceStateChange(e => {
					if (e.matchesCount) { resolve(true); }
				})));
				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 2, count: 1, cells: []
				}], true, undefined, () => undefined, undefined, true);
				await found2;
				assert.strictEqual(model.findMatches.length, 3);

				assert.strictEqual(model.currentMatch, 0);
				model.find({ previous: true });
				assert.strictEqual(model.currentMatch, 3);
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 0);
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 1);
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 2);
			});
	});

	test('Update find matches basics 3', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1.1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1.2', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1.3', 'markdown', CellKind.Markup, [], {}],
				['paragraph 2', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				setupEditorForTest(editor, viewModel);
				accessor.stub(IConfigurationService, configurationService);
				const state = disposables.add(new FindReplaceState<NotebookFindFilters>());
				const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
				const found = new Promise<boolean>(resolve => disposables.add(state.onFindReplaceStateChange(e => {
					if (e.matchesCount) { resolve(true); }
				})));
				state.change({ isRevealed: true }, true);
				state.change({ searchString: '1' }, true);
				await found;
				// find matches is not necessarily find results
				assert.strictEqual(model.findMatches.length, 4);
				assert.strictEqual(model.currentMatch, 0);
				model.find({ previous: true });
				assert.strictEqual(model.currentMatch, 4);

				const found2 = new Promise<boolean>(resolve => disposables.add(state.onFindReplaceStateChange(e => {
					if (e.matchesCount) { resolve(true); }
				})));
				editor.textModel.applyEdits([{
					editType: CellEditType.Replace, index: 2, count: 1, cells: []
				}], true, undefined, () => undefined, undefined, true);
				await found2;
				assert.strictEqual(model.findMatches.length, 3);
				assert.strictEqual(model.currentMatch, 0);
				model.find({ previous: true });
				assert.strictEqual(model.currentMatch, 3);
				model.find({ previous: true });
				assert.strictEqual(model.currentMatch, 2);
			});
	});

	test('Update find matches, #112748', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1.1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1.2', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1.3', 'markdown', CellKind.Markup, [], {}],
				['paragraph 2', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				setupEditorForTest(editor, viewModel);
				accessor.stub(IConfigurationService, configurationService);
				const state = disposables.add(new FindReplaceState<NotebookFindFilters>());
				const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
				const found = new Promise<boolean>(resolve => disposables.add(state.onFindReplaceStateChange(e => {
					if (e.matchesCount) { resolve(true); }
				})));
				state.change({ isRevealed: true }, true);
				state.change({ searchString: '1' }, true);
				await found;
				// find matches is not necessarily find results
				assert.strictEqual(model.findMatches.length, 4);
				assert.strictEqual(model.currentMatch, 0);
				model.find({ previous: false });
				model.find({ previous: false });
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 3);
				const found2 = new Promise<boolean>(resolve => disposables.add(state.onFindReplaceStateChange(e => {
					if (e.matchesCount) { resolve(true); }
				})));
				(viewModel.viewCells[1].textBuffer as ITextBuffer).applyEdits([
					new ValidAnnotatedEditOperation(null, new Range(1, 1, 1, 14), '', false, false, false)
				], false, true);
				// cell content updates, recompute
				model.research();
				await found2;
				assert.strictEqual(model.currentMatch, 1);
			});
	});

	test('Reset when match not found, #127198', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 1', 'markdown', CellKind.Markup, [], {}],
				['paragraph 2', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				accessor.stub(IConfigurationService, configurationService);
				const state = disposables.add(new FindReplaceState<NotebookFindFilters>());
				const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
				const found = new Promise<boolean>(resolve => disposables.add(state.onFindReplaceStateChange(e => {
					if (e.matchesCount) { resolve(true); }
				})));
				state.change({ isRevealed: true }, true);
				state.change({ searchString: '1' }, true);
				await found;
				assert.strictEqual(model.findMatches.length, 2);
				assert.strictEqual(model.currentMatch, 0);
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 1);
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 0);
				model.find({ previous: false });
				assert.strictEqual(model.currentMatch, 1);

				assert.strictEqual(editor.textModel.length, 3);

				const found2 = new Promise<boolean>(resolve => disposables.add(state.onFindReplaceStateChange(e => {
					if (e.matchesCount) { resolve(true); }
				})));
				state.change({ searchString: '3' }, true);
				await found2;
				assert.strictEqual(model.currentMatch, -1);
				assert.strictEqual(model.findMatches.length, 0);
			});
	});

	test('CellFindMatchModel', async function () {
		await withTestNotebook(
			[
				['# header 1', 'markdown', CellKind.Markup, [], {}],
				['print(1)', 'typescript', CellKind.Code, [], {}],
			],
			async (editor) => {
				const mdCell = editor.cellAt(0);
				const mdModel = new CellFindMatchModel(mdCell, 0, [], []);
				assert.strictEqual(mdModel.length, 0);

				mdModel.contentMatches.push(new FindMatch(new Range(1, 1, 1, 2), []));
				assert.strictEqual(mdModel.length, 1);
				mdModel.webviewMatches.push({
					index: 0,
					searchPreviewInfo: {
						line: '',
						range: {
							start: 0,
							end: 0,
						}
					}
				}, {
					index: 1,
					searchPreviewInfo: {
						line: '',
						range: {
							start: 0,
							end: 0,
						}
					}
				});

				assert.strictEqual(mdModel.length, 3);
				assert.strictEqual(mdModel.getMatch(0), mdModel.contentMatches[0]);
				assert.strictEqual(mdModel.getMatch(1), mdModel.webviewMatches[0]);
				assert.strictEqual(mdModel.getMatch(2), mdModel.webviewMatches[1]);
			});
	});
});
