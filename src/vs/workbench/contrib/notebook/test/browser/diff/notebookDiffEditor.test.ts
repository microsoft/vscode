/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NotebookTextDiffEditor } from '../../../browser/diff/notebookDiffEditor.js';
import { INotebookDiffEditorModel, IResolvedNotebookEditorModel } from '../../../common/notebookCommon.js';
import { NotebookDiffEditorInput } from '../../../common/notebookDiffEditorInput.js';

suite('NotebookTextDiffEditor', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	type TestEditor = Pick<NotebookTextDiffEditor, 'clearInput' | 'setInput' | 'currentChangedIndex' | 'input'> & {
		_currentChangedIndex: ISettableObservable<number>;
		_localStore: DisposableStore;
		_modifiedResourceDisposableStore: DisposableStore;
		_layoutCancellationTokenSource: CancellationTokenSource | undefined;
		_model: INotebookDiffEditorModel | null;
		_list: { length: number; clear(): void; splice(start: number, deleteCount: number): void };
		_listViewContainer: { style: { display: string } };
		_attachModel(model: INotebookDiffEditorModel): void;
		_createOriginalWebview(): Promise<void>;
		_createModifiedWebview(): Promise<void>;
		updateLayout(token: CancellationToken): Promise<void>;
	};

	// Exercise the pane's input lifecycle without constructing webviews or the cell list.
	function createEditor(): TestEditor {
		const editor = Object.create(NotebookTextDiffEditor.prototype) as TestEditor;
		editor._currentChangedIndex = observableValue('currentChangedIndex', -1);
		Object.defineProperty(editor, 'currentChangedIndex', { value: editor._currentChangedIndex });
		editor._localStore = store.add(new DisposableStore());
		editor._modifiedResourceDisposableStore = store.add(new DisposableStore());
		editor._model = null;
		editor._list = { length: 0, clear() { }, splice() { } };
		editor._listViewContainer = { style: { display: '' } };
		editor._attachModel = model => { editor._model = model; };
		editor._createOriginalWebview = async () => { };
		editor._createModifiedWebview = async () => { };
		editor.updateLayout = async () => { };
		store.add(toDisposable(() => {
			editor.clearInput();
			editor._layoutCancellationTokenSource?.dispose();
		}));
		return editor;
	}

	function createInput(): NotebookDiffEditorInput {
		const notebook = { onDidChangeContent: Event.None };
		const original = { notebook, viewType: 'test', resource: URI.parse('test:///original') } as IResolvedNotebookEditorModel;
		const modified = { notebook, viewType: 'test', resource: URI.parse('test:///modified') } as IResolvedNotebookEditorModel;
		const model = new class extends mock<Awaited<ReturnType<NotebookDiffEditorInput['resolve']>>>() {
			override original = original;
			override modified = modified;
		};
		return new class extends mock<NotebookDiffEditorInput>() {
			override async resolve() { return model; }
		};
	}

	test('clearing and reusing an input resets the current change index', async () => {
		const editor = createEditor();
		await editor.setInput(createInput(), undefined, { newInGroup: true }, CancellationToken.None);
		editor._currentChangedIndex.set(2, undefined);

		editor.clearInput();
		assert.strictEqual(editor.currentChangedIndex.get(), -1);

		await editor.setInput(createInput(), undefined, { newInGroup: true }, CancellationToken.None);
		assert.strictEqual(editor.currentChangedIndex.get(), -1);
		editor._currentChangedIndex.set(1, undefined);
		editor.clearInput();
		assert.strictEqual(editor.currentChangedIndex.get(), -1);
	});

	for (const stage of ['resolve', 'original webview', 'modified webview'] as const) {
		for (const action of ['clear', 'replace', 'cancel'] as const) {
			test(`${action} input during ${stage} prevents obsolete layout`, async () => {
				const editor = createEditor();
				const input = createInput();
				const reachedStage = new DeferredPromise<void>();
				const resume = new DeferredPromise<void>();
				const wait = async () => {
					await reachedStage.complete();
					await resume.p;
				};
				if (stage === 'resolve') {
					const model = await input.resolve();
					input.resolve = async () => { await wait(); return model; };
				} else if (stage === 'original webview') {
					editor._createOriginalWebview = wait;
				} else {
					editor._createModifiedWebview = wait;
				}

				let layoutCalls = 0;
				editor.updateLayout = async () => { layoutCalls++; };
				const cancellation = store.add(new CancellationTokenSource());
				const opening = editor.setInput(input, undefined, { newInGroup: true }, cancellation.token);
				await reachedStage.p;

				let replacement: NotebookDiffEditorInput | undefined;
				if (action === 'cancel') {
					cancellation.cancel();
				} else {
					editor.clearInput();
					if (action === 'replace') {
						editor._createOriginalWebview = async () => { };
						editor._createModifiedWebview = async () => { };
						replacement = createInput();
						await editor.setInput(replacement, undefined, { newInGroup: true }, CancellationToken.None);
						assert.strictEqual(layoutCalls, 1);
					}
				}

				await resume.complete();
				await opening;
				assert.strictEqual(layoutCalls, replacement ? 1 : 0);
				if (action !== 'cancel') {
					assert.strictEqual(editor.input, replacement);
					assert.strictEqual(editor._model, replacement ? await replacement.resolve() : null);
				}
			});
		}
	}
});
