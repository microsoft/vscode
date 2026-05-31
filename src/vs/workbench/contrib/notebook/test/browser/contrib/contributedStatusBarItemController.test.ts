/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ContributedStatusBarItemController } from '../../../browser/contrib/cellStatusBar/contributedStatusBarItemController.js';
import { INotebookCellStatusBarService } from '../../../common/notebookCellStatusBarService.js';
import { CellKind, INotebookCellStatusBarItemProvider } from '../../../common/notebookCommon.js';
import { withTestNotebook } from '../testNotebookEditor.js';

suite('Notebook Statusbar', () => {
	const testDisposables = new DisposableStore();

	teardown(() => {
		testDisposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Calls item provider', async function () {
		await withTestNotebook(
			[
				['var b = 1;', 'javascript', CellKind.Code, [], {}],
				['# header a', 'markdown', CellKind.Markup, [], {}],
			],
			async (editor, viewModel, _ds, accessor) => {
				const cellStatusbarSvc = accessor.get(INotebookCellStatusBarService);
				testDisposables.add(accessor.createInstance(ContributedStatusBarItemController, editor));

				const provider = testDisposables.add(new class extends Disposable implements INotebookCellStatusBarItemProvider {
					private provideCalls = 0;

					private _onProvideCalled = this._register(new Emitter<number>());
					public onProvideCalled = this._onProvideCalled.event;

					public _onDidChangeStatusBarItems = this._register(new Emitter<void>());
					public onDidChangeStatusBarItems = this._onDidChangeStatusBarItems.event;

					async provideCellStatusBarItems(_uri: URI, index: number, _token: CancellationToken) {
						if (index === 0) {
							this.provideCalls++;
							this._onProvideCalled.fire(this.provideCalls);
						}

						return { items: [] };
					}

					viewType = editor.textModel.viewType;
				});
				const providePromise1 = asPromise(provider.onProvideCalled, 'registering provider');
				testDisposables.add(cellStatusbarSvc.registerCellStatusBarItemProvider(provider));
				assert.strictEqual(await providePromise1, 1, 'should call provider on registration');

				const providePromise2 = asPromise(provider.onProvideCalled, 'updating metadata');
				const cell0 = editor.textModel.cells[0];
				cell0.metadata = { ...cell0.metadata, ...{ newMetadata: true } };
				assert.strictEqual(await providePromise2, 2, 'should call provider on updating metadata');

				const providePromise3 = asPromise(provider.onProvideCalled, 'changing cell language');
				cell0.language = 'newlanguage';
				assert.strictEqual(await providePromise3, 3, 'should call provider on changing language');

				const providePromise4 = asPromise(provider.onProvideCalled, 'manually firing change event');
				provider._onDidChangeStatusBarItems.fire();
				assert.strictEqual(await providePromise4, 4, 'should call provider on manually firing change event');
			});
	});
});

async function asPromise<T>(event: Event<T>, message: string): Promise<T> {
	const error = new Error('asPromise TIMEOUT reached: ' + message);
	return new Promise<T>((resolve, reject) => {
		const handle = setTimeout(() => {
			sub.dispose();
			reject(error);
		}, 1000);

		const sub = event(e => {
			clearTimeout(handle);
			sub.dispose();
			resolve(e);
		});
	});
}
