/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LanguagesRegistry } from '../../../../../editor/common/services/languagesRegistry.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { INotebookCellOutlineDataSourceFactory } from '../../browser/viewModel/notebookOutlineDataSourceFactory.js';
import { CellKind } from '../../common/notebookCommon.js';
import { createTestNotebookEditor, setupInstantiationService, withTestNotebook, withTestNotebookDiffModel } from './testNotebookEditor.js';

suite('Notebook test helpers', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('isolates outlines for editors created at the same time', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const disposables = store.add(new DisposableStore());
			const instantiationService = setupInstantiationService(disposables);
			instantiationService.stub(IMarkerService, disposables.add(new MarkerService()));

			const first = createTestNotebookEditor(instantiationService, disposables, [['   ', 'markdown', CellKind.Markup]]);
			const second = createTestNotebookEditor(instantiationService, disposables, [['!@#$\nheading', 'markdown', CellKind.Markup]]);
			const factory = instantiationService.get(INotebookCellOutlineDataSourceFactory);
			const firstOutline = disposables.add(factory.getOrCreate(first.editor));
			const secondOutline = disposables.add(factory.getOrCreate(second.editor));

			assert.deepStrictEqual({
				distinctEditorIds: first.editor.getId() !== second.editor.getId(),
				labels: [firstOutline.object.entries[0].label, secondOutline.object.entries[0].label],
				ownsSecondCell: secondOutline.object.entries[0].cell === second.viewModel.viewCells[0],
			}, {
				distinctEditorIds: true,
				labels: ['empty cell', '!@#$'],
				ownsSecondCell: true,
			});
		});
	});

	function testCleanup(name: string, run: (callback: (disposables: DisposableStore) => string | Promise<string>) => Promise<string>) {
		suite(name, () => {
			for (const asyncCallback of [false, true]) {
				const callbackKind = asyncCallback ? 'asynchronous' : 'synchronous';

				test(`cleans up when the ${callbackKind} callback succeeds`, async () => {
					const languageRegistryCount = LanguagesRegistry.instanceCount;
					let disposed = false;
					const result = await run(disposables => {
						store.add(disposables);
						disposables.add(toDisposable(() => disposed = true));
						return asyncCallback ? Promise.resolve('result') : 'result';
					});

					assert.deepStrictEqual(
						{ result, disposed, languageRegistryCount: LanguagesRegistry.instanceCount },
						{ result: 'result', disposed: true, languageRegistryCount }
					);
				});

				test(`cleans up when the ${callbackKind} callback fails`, async () => {
					const languageRegistryCount = LanguagesRegistry.instanceCount;
					const error = new Error('Test callback failed');
					let disposed = false;
					await assert.rejects(run(disposables => {
						store.add(disposables);
						disposables.add(toDisposable(() => disposed = true));
						if (asyncCallback) {
							return Promise.reject(error);
						}
						throw error;
					}), actual => actual === error);

					assert.deepStrictEqual(
						{ disposed, languageRegistryCount: LanguagesRegistry.instanceCount },
						{ disposed: true, languageRegistryCount }
					);
				});
			}
		});
	}

	testCleanup('withTestNotebook', callback => withTestNotebook([], (_editor, _viewModel, disposables) => callback(disposables)));
	testCleanup('withTestNotebookDiffModel', callback => withTestNotebookDiffModel([], [], (_model, disposables) => callback(disposables)));
});
