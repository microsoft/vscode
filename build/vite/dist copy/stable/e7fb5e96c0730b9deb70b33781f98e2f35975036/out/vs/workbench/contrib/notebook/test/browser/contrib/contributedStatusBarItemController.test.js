/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ContributedStatusBarItemController } from '../../../browser/contrib/cellStatusBar/contributedStatusBarItemController.js';
import { INotebookCellStatusBarService } from '../../../common/notebookCellStatusBarService.js';
import { CellKind } from '../../../common/notebookCommon.js';
import { withTestNotebook } from '../testNotebookEditor.js';
suite('Notebook Statusbar', () => {
    const testDisposables = new DisposableStore();
    teardown(() => {
        testDisposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Calls item provider', async function () {
        await withTestNotebook([
            ['var b = 1;', 'javascript', CellKind.Code, [], {}],
            ['# header a', 'markdown', CellKind.Markup, [], {}],
        ], async (editor, viewModel, _ds, accessor) => {
            const cellStatusbarSvc = accessor.get(INotebookCellStatusBarService);
            testDisposables.add(accessor.createInstance(ContributedStatusBarItemController, editor));
            const provider = testDisposables.add(new class extends Disposable {
                constructor() {
                    super(...arguments);
                    this.provideCalls = 0;
                    this._onProvideCalled = this._register(new Emitter());
                    this.onProvideCalled = this._onProvideCalled.event;
                    this._onDidChangeStatusBarItems = this._register(new Emitter());
                    this.onDidChangeStatusBarItems = this._onDidChangeStatusBarItems.event;
                    this.viewType = editor.textModel.viewType;
                }
                async provideCellStatusBarItems(_uri, index, _token) {
                    if (index === 0) {
                        this.provideCalls++;
                        this._onProvideCalled.fire(this.provideCalls);
                    }
                    return { items: [] };
                }
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
async function asPromise(event, message) {
    const error = new Error('asPromise TIMEOUT reached: ' + message);
    return new Promise((resolve, reject) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJpYnV0ZWRTdGF0dXNCYXJJdGVtQ29udHJvbGxlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svdGVzdC9icm93c2VyL2NvbnRyaWIvY29udHJpYnV0ZWRTdGF0dXNCYXJJdGVtQ29udHJvbGxlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUU1QixPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV6RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSw4RUFBOEUsQ0FBQztBQUNsSSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsUUFBUSxFQUFzQyxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRTVELEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7SUFDaEMsTUFBTSxlQUFlLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUU5QyxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2IsZUFBZSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3pCLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsS0FBSztRQUNoQyxNQUFNLGdCQUFnQixDQUNyQjtZQUNDLENBQUMsWUFBWSxFQUFFLFlBQVksRUFBRSxRQUFRLENBQUMsSUFBSSxFQUFF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