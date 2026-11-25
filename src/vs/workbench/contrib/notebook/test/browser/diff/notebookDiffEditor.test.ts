/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy, stub } from 'sinon';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IDiffEditorHeightCalculatorService } from '../../../browser/diff/editorHeightCalculator.js';
import { NotebookDiffEditorEventDispatcher } from '../../../browser/diff/eventDispatcher.js';
import { NotebookTextDiffEditor } from '../../../browser/diff/notebookDiffEditor.js';
import { NotebookDiffViewModel } from '../../../browser/diff/notebookDiffViewModel.js';
import { CellKind, INotebookDiffEditorModel, INotebookDiffResult, IResolvedNotebookEditorModel } from '../../../common/notebookCommon.js';
import { NotebookDiffEditorInput } from '../../../common/notebookDiffEditorInput.js';
import { INotebookService } from '../../../common/notebookService.js';
import { INotebookEditorWorkerService } from '../../../common/services/notebookWorkerService.js';
import { withTestNotebookDiffModel } from '../testNotebookEditor.js';

suite('NotebookTextDiffEditor', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	type TestEditor = Pick<NotebookTextDiffEditor, 'clearInput' | 'setInput' | 'currentChangedIndex' | 'input'> & {
		_currentChangedIndex: ISettableObservable<number>;
		_localStore: DisposableStore;
		_modifiedResourceDisposableStore: DisposableStore;
		_layoutCancellationTokenSource: CancellationTokenSource | undefined;
		_model: INotebookDiffEditorModel | null;
		notebookDiffViewModel: NotebookDiffViewModel | undefined;
		_eventDispatcher: NotebookDiffEditorEventDispatcher | undefined;
		notebookEditorWorkerService: INotebookEditorWorkerService;
		configurationService: IConfigurationService;
		notebookService: INotebookService;
		diffEditorCalcuator: IDiffEditorHeightCalculatorService;
		_list: { length: number; rowsContainer: HTMLElement; onDidChangeContentHeight: Event<void>; onDidChangeFocus: Event<{ indexes: number[] }>; clear(): void; splice(start: number, deleteCount: number): void };
		_listViewContainer: { style: { display: string } };
		_notebookOptions: { computeDiffWebviewOptions(): object };
		instantiationService: Pick<IInstantiationService, 'createInstance'>;
		_generateFontFamily(): string;
		_attachModel(model: INotebookDiffEditorModel): void;
		_createOriginalWebview(id: string, viewType: string, resource: URI): Promise<void>;
		_createModifiedWebview(id: string, viewType: string, resource: URI): Promise<void>;
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
		editor._list = { length: 0, rowsContainer: document.createElement('div'), onDidChangeContentHeight: Event.None, onDidChangeFocus: Event.None, clear() { }, splice() { } };
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

	function createInput(resolvedModel?: INotebookDiffEditorModel): NotebookDiffEditorInput {
		const notebook = { onDidChangeContent: Event.None };
		const original = (resolvedModel?.original ?? { notebook, viewType: 'test', resource: URI.parse('test:///original') }) as IResolvedNotebookEditorModel;
		const modified = (resolvedModel?.modified ?? { notebook, viewType: 'test', resource: URI.parse('test:///modified') }) as IResolvedNotebookEditorModel;
		const model = new class extends mock<Awaited<ReturnType<NotebookDiffEditorInput['resolve']>>>() {
			override original = original;
			override modified = modified;
		};
		return new class extends mock<NotebookDiffEditorInput>() {
			override async resolve() { return model; }
		};
	}

	function createModelEditor(notebookService: INotebookService, computeDiff: () => Promise<INotebookDiffResult>): TestEditor {
		const editor = createEditor();
		const prototype = Object.getPrototypeOf(editor) as TestEditor;
		editor._attachModel = prototype._attachModel;
		editor.updateLayout = prototype.updateLayout;
		Object.defineProperty(editor, 'window', { value: mainWindow });
		Object.defineProperty(editor, 'fontInfo', { value: undefined });
		editor.configurationService = new TestConfigurationService({ notebook: { diff: { ignoreMetadata: true } } });
		editor.notebookService = notebookService;
		editor.notebookEditorWorkerService = new class extends mock<INotebookEditorWorkerService>() {
			override computeDiff = computeDiff;
		};
		editor.diffEditorCalcuator = {
			diffAndComputeHeight: async () => 0,
			computeHeightFromLines: () => 0
		};
		return editor;
	}

	const diffResult: INotebookDiffResult = {
		cellsDiff: { changes: [{ originalStart: 0, originalLength: 1, modifiedStart: 0, modifiedLength: 1 }], quitEarly: false },
		metadataChanged: false
	};

	for (const action of ['clear', 'replace'] as const) {
		test(`${action} input disposes the attached view model and dispatcher`, async () => {
			await withTestNotebookDiffModel([
				['original', 'javascript', CellKind.Code, [], {}]
			], [
				['modified', 'javascript', CellKind.Code, [], {}]
			], async (model, _disposables, accessor) => {
				const editor = createModelEditor(accessor.get(INotebookService), async () => diffResult);
				await editor.setInput(createInput(model), undefined, { newInGroup: true }, CancellationToken.None);
				const viewModel = editor.notebookDiffViewModel!;
				const dispatcher = editor._eventDispatcher!;
				const disposeViewModel = spy(viewModel, 'dispose');
				const disposeDispatcher = spy(dispatcher, 'dispose');
				try {
					assert.deepStrictEqual(viewModel.items.map(item => item.type), ['modified']);
					if (action === 'clear') {
						editor.clearInput();
					} else {
						await editor.setInput(createInput(model), undefined, { newInGroup: true }, CancellationToken.None);
					}
					assert.deepStrictEqual({ viewModel: disposeViewModel.callCount, dispatcher: disposeDispatcher.callCount, items: viewModel.items.length },
						{ viewModel: 1, dispatcher: 1, items: 0 });
					if (action === 'clear') {
						await editor.setInput(createInput(model), undefined, { newInGroup: true }, CancellationToken.None);
					}
					assert.notStrictEqual(editor.notebookDiffViewModel, viewModel);
					assert.notStrictEqual(editor._eventDispatcher, dispatcher);
					assert.deepStrictEqual(editor.notebookDiffViewModel!.items.map(item => item.type), ['modified']);
				} finally {
					disposeViewModel.restore();
					disposeDispatcher.restore();
					editor.clearInput();
					viewModel.dispose();
					dispatcher.dispose();
				}
			});
		});

		test(`${action} input cancels a pending diff before disposing its owner`, async () => {
			await withTestNotebookDiffModel([
				['original', 'javascript', CellKind.Code, [], {}]
			], [
				['modified', 'javascript', CellKind.Code, [], {}]
			], async (model, _disposables, accessor) => {
				const started = new DeferredPromise<void>();
				const pendingDiff = new DeferredPromise<INotebookDiffResult>();
				const editor = createModelEditor(accessor.get(INotebookService), () => {
					void started.complete();
					return pendingDiff.p;
				});
				const opening = editor.setInput(createInput(model), undefined, { newInGroup: true }, CancellationToken.None);
				await started.p;
				const viewModel = editor.notebookDiffViewModel!;
				const layoutToken = editor._layoutCancellationTokenSource!.token;
				let cancelledWhenDisposed = false;
				const disposeViewModel = spy(viewModel, 'dispose');
				editor._localStore.add(toDisposable(() => cancelledWhenDisposed = layoutToken.isCancellationRequested));
				try {
					if (action === 'clear') {
						editor.clearInput();
					} else {
						editor.notebookEditorWorkerService.computeDiff = async () => diffResult;
						await editor.setInput(createInput(model), undefined, { newInGroup: true }, CancellationToken.None);
					}
					assert.deepStrictEqual({ cancelled: layoutToken.isCancellationRequested, cancelledWhenDisposed, disposed: disposeViewModel.callCount },
						{ cancelled: true, cancelledWhenDisposed: true, disposed: 1 });
					await opening;
					await pendingDiff.complete(diffResult);
					assert.deepStrictEqual(viewModel.items, []);
					assert.deepStrictEqual(editor.notebookDiffViewModel?.items.map(item => item.type), action === 'replace' ? ['modified'] : undefined);
				} finally {
					await pendingDiff.complete(diffResult);
					await opening;
					disposeViewModel.restore();
					editor.clearInput();
					viewModel.dispose();
				}
			});
		});
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

	test('replacing an input without clearing resets the current change index', async () => {
		const editor = createEditor();
		await editor.setInput(createInput(), undefined, { newInGroup: true }, CancellationToken.None);
		editor._currentChangedIndex.set(2, undefined);

		await editor.setInput(createInput(), undefined, { newInGroup: true }, CancellationToken.None);
		assert.strictEqual(editor.currentChangedIndex.get(), -1);
	});

	class TestWebview extends Disposable {
		readonly element = document.createElement('div');
		isDisposed = false;
		createWebview(): void { }
		override dispose(): void {
			this.isDisposed = true;
			super.dispose();
		}
	}

	for (const stage of ['_createOriginalWebview', '_createModifiedWebview'] as const) {
		for (const action of ['clear', 'replace', 'cancel'] as const) {
			test(`${action} input after ${stage} cleans up the created webviews`, async () => {
				const editor = createEditor();
				const prototype = Object.getPrototypeOf(editor) as TestEditor;
				editor._createOriginalWebview = prototype._createOriginalWebview;
				editor._createModifiedWebview = prototype._createModifiedWebview;
				Object.defineProperty(editor, 'window', { value: mainWindow });
				editor._notebookOptions = { computeDiffWebviewOptions: () => ({}) };
				editor._generateFontFamily = () => 'monospace';
				const webviews: TestWebview[] = [];
				editor.instantiationService = {
					createInstance: stub().callsFake(() => {
						const webview = store.add(new TestWebview());
						webviews.push(webview);
						return webview;
					})
				};
				const reachedStage = new DeferredPromise<void>();
				const resume = new DeferredPromise<void>();
				editor[stage] = async (id, viewType, resource) => {
					await prototype[stage].call(editor, id, viewType, resource);
					await reachedStage.complete();
					await resume.p;
				};
				const cancellation = store.add(new CancellationTokenSource());
				const opening = editor.setInput(createInput(), undefined, { newInGroup: true }, cancellation.token);
				await reachedStage.p;
				const obsoleteWebviews = webviews.slice();
				assert.ok(obsoleteWebviews.every(webview => !webview.isDisposed && webview.element.parentElement));

				if (action === 'cancel') {
					cancellation.cancel();
				} else {
					editor.clearInput();
					if (action === 'replace') {
						editor[stage] = prototype[stage];
						await editor.setInput(createInput(), undefined, { newInGroup: true }, CancellationToken.None);
					}
				}
				await resume.complete();
				await opening;
				if (action === 'cancel') {
					editor.clearInput();
				}
				assert.deepStrictEqual(obsoleteWebviews.map(webview => ({ disposed: webview.isDisposed, parent: webview.element.parentElement })),
					obsoleteWebviews.map(() => ({ disposed: true, parent: null })));
				if (action === 'replace') {
					assert.ok(webviews.slice(obsoleteWebviews.length).every(webview => !webview.isDisposed && webview.element.parentElement));
				}
			});
		}
	}

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
