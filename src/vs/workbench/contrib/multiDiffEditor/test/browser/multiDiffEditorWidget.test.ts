/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { IMultiDiffEditorViewState } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { MultiDiffEditorWidget } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { DocumentDiffItemViewModel, MultiDiffEditorViewModel } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IWorkbenchUIElementFactory } from '../../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { TestUserDataProfileService } from '../../../../test/common/workbenchTestServices.js';

suite('MultiDiffEditorWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not reapply restored state when the document list changes', async () => {
		const harness = createHarness();
		const documentA = harness.createDocument('a');
		const documentB = harness.createDocument('b');
		const documentC = harness.createDocument('c');
		const documents = new ValueWithChangeEvent<readonly RefCounted<IDocumentDiffItem>[]>([documentA.ref, documentB.ref]);
		const restoredSelection = new Selection(1, 1, 1, 1);
		const currentSelection = new Selection(1, 5, 1, 5);
		const viewState: IMultiDiffEditorViewState = {
			scrollState: { top: 0, left: 0 },
			docStates: {
				[documentA.key]: { collapsed: false, selections: [restoredSelection] },
				[documentB.key]: { collapsed: false },
			},
			activeDiffItemKey: documentA.key,
		};
		const viewModel = harness.createViewModel({ documents });
		harness.widget.setViewModel(viewModel, { preserveFocus: true, viewState });
		await waitForItems(viewModel, 2);

		const itemA = getItem(viewModel, documentA.key);
		setEditorSelection(harness.widget, itemA, currentSelection);
		itemA.collapsed.set(true, undefined);

		documents.value = [documentA.ref, documentB.ref, documentC.ref];
		await waitForItems(viewModel, 3);

		const updatedItemA = getItem(viewModel, documentA.key);
		const afterRefresh = {
			sameViewModel: updatedItemA === itemA,
			collapsed: updatedItemA.collapsed.get(),
			selections: serializeSelections(updatedItemA),
			newDocumentCollapsed: getItem(viewModel, documentC.key).collapsed.get(),
		};
		harness.widget.setViewState(viewState);

		const actual = {
			afterRefresh,
			afterRepeatedRestore: {
				collapsed: updatedItemA.collapsed.get(),
				selections: serializeSelections(updatedItemA),
			},
			viewState,
		};
		await harness.dispose();

		assert.deepStrictEqual(actual, {
			afterRefresh: {
				sameViewModel: true,
				collapsed: true,
				selections: [serializeSelection(currentSelection)],
				newDocumentCollapsed: false,
			},
			afterRepeatedRestore: {
				collapsed: true,
				selections: [serializeSelection(currentSelection)],
			},
			viewState: {
				scrollState: { top: 0, left: 0 },
				docStates: {
					[documentA.key]: { collapsed: false, selections: [restoredSelection] },
					[documentB.key]: { collapsed: false },
				},
				activeDiffItemKey: documentA.key,
			},
		});
	});

	test('restores delayed documents once', async () => {
		const harness = createHarness();
		const documentA = harness.createDocument('a');
		const documentC = harness.createDocument('c');
		const documentD = harness.createDocument('d');
		const documents = new ValueWithChangeEvent<readonly RefCounted<IDocumentDiffItem>[]>([documentA.ref]);
		const restoredSelection = new Selection(1, 2, 1, 2);
		const currentSelection = new Selection(1, 6, 1, 6);
		const viewModel = harness.createViewModel({ documents });
		harness.widget.setViewModel(viewModel, {
			preserveFocus: true,
			viewState: {
				scrollState: { top: 0, left: 0 },
				docStates: {
					[documentA.key]: { collapsed: false },
					[documentC.key]: { collapsed: true, selections: [restoredSelection] },
				},
				activeDiffItemKey: documentA.key,
			},
		});
		await waitForItems(viewModel, 1);

		documents.value = [documentA.ref, documentC.ref];
		await waitForItems(viewModel, 2);
		const itemC = getItem(viewModel, documentC.key);
		const initiallyRestored = {
			collapsed: itemC.collapsed.get(),
			selections: serializeSelections(itemC),
		};

		itemC.collapsed.set(false, undefined);
		setEditorSelection(harness.widget, itemC, currentSelection);
		documents.value = [documentA.ref, documentC.ref, documentD.ref];
		await waitForItems(viewModel, 3);

		const actual = {
			initiallyRestored,
			afterRefresh: {
				collapsed: getItem(viewModel, documentC.key).collapsed.get(),
				selections: serializeSelections(getItem(viewModel, documentC.key)),
			},
		};
		await harness.dispose();

		assert.deepStrictEqual(actual, {
			initiallyRestored: {
				collapsed: true,
				selections: [serializeSelection(restoredSelection)],
			},
			afterRefresh: {
				collapsed: false,
				selections: [serializeSelection(currentSelection)],
			},
		});
	});

	test('preserves document state when pooled editors are reused', async () => {
		const harness = createHarness();
		harness.widget.layout(new Dimension(800, 20));
		const documentA = harness.createDocument('a');
		const documentB = harness.createDocument('b');
		const documentC = harness.createDocument('c');
		const documents = new ValueWithChangeEvent<readonly RefCounted<IDocumentDiffItem>[]>([documentA.ref, documentB.ref]);
		const restoredSelectionA = new Selection(1, 2, 1, 2);
		const restoredSelectionB = new Selection(1, 3, 1, 3);
		const defaultSelection = new Selection(1, 1, 1, 1);
		const currentSelectionA = new Selection(1, 5, 1, 5);
		const currentSelectionB = new Selection(1, 8, 1, 8);
		const viewModel = harness.createViewModel({
			documents,
		});
		harness.widget.setViewModel(viewModel, {
			preserveFocus: true,
			viewState: {
				scrollState: { top: 0, left: 0 },
				docStates: {
					[documentA.key]: { collapsed: false, selections: [restoredSelectionA] },
					[documentB.key]: { collapsed: false, selections: [restoredSelectionB] },
				},
				activeDiffItemKey: documentA.key,
			},
		});
		await waitForItems(viewModel, 2);

		const itemA = getItem(viewModel, documentA.key);
		const itemB = getItem(viewModel, documentB.key);
		const editorForA = getEditor(harness.widget, itemA);
		setEditorSelection(harness.widget, itemA, currentSelectionA);
		itemA.collapsed.set(true, undefined);

		revealModified(harness.widget, itemB);
		setEditorSelection(harness.widget, itemB, currentSelectionB);

		documents.value = [documentB.ref, documentC.ref];
		await waitForItems(viewModel, 2);
		const itemC = getItem(viewModel, documentC.key);
		revealModified(harness.widget, itemC);
		const editorForC = getEditor(harness.widget, itemC);
		const selectionForC = serializeEditorSelections(editorForC);

		documents.value = [documentA.ref, documentB.ref, documentC.ref];
		await waitForItems(viewModel, 3);
		const recreatedItemA = getItem(viewModel, documentA.key);
		revealModified(harness.widget, recreatedItemA);
		const editorForAAgain = getEditor(harness.widget, recreatedItemA);

		const actual = {
			reusedForC: editorForC === editorForA,
			selectionForC,
			recreatedA: recreatedItemA !== itemA,
			restoredA: {
				collapsed: recreatedItemA.collapsed.get(),
				selections: serializeEditorSelections(editorForAAgain),
			},
			restoredB: serializeSelections(getItem(viewModel, documentB.key)),
		};
		await harness.dispose();

		assert.deepStrictEqual(actual, {
			reusedForC: true,
			selectionForC: [serializeSelection(defaultSelection)],
			recreatedA: true,
			restoredA: {
				collapsed: true,
				selections: [serializeSelection(currentSelectionA)],
			},
			restoredB: [serializeSelection(currentSelectionB)],
		});
	});

	test('preserves current state across view model recreation without leaking across models', async () => {
		const harness = createHarness();
		const documentA = harness.createDocument('a');
		const documentB = harness.createDocument('b');
		const documents = new ValueWithChangeEvent<readonly RefCounted<IDocumentDiffItem>[]>([documentA.ref, documentB.ref]);
		const currentSelection = new Selection(1, 4, 1, 4);
		const viewModel = harness.createViewModel({ documents });
		const viewState: IMultiDiffEditorViewState = {
			scrollState: { top: 0, left: 0 },
			docStates: {
				[documentA.key]: { collapsed: false },
				[documentB.key]: { collapsed: false },
			},
			activeDiffItemKey: documentA.key,
		};
		harness.widget.setViewModel(viewModel, {
			preserveFocus: true,
			viewState,
		});
		await waitForItems(viewModel, 2);

		const originalItemA = getItem(viewModel, documentA.key);
		setEditorSelection(harness.widget, originalItemA, currentSelection);
		originalItemA.collapsed.set(true, undefined);
		documents.value = [documentB.ref];
		await waitForItems(viewModel, 1);
		harness.widget.setViewState(viewState);
		documents.value = [documentA.ref, documentB.ref];
		await waitForItems(viewModel, 2);

		const recreatedItemA = getItem(viewModel, documentA.key);
		const recreatedState = {
			newViewModel: recreatedItemA !== originalItemA,
			collapsed: recreatedItemA.collapsed.get(),
			selections: serializeSelections(recreatedItemA),
		};

		const replacementViewModel = harness.createViewModel({
			documents: ValueWithChangeEvent.const([documentA.ref]),
		});
		harness.widget.setViewModel(replacementViewModel, { preserveFocus: true });
		await waitForItems(replacementViewModel, 1);
		const replacementItemA = getItem(replacementViewModel, documentA.key);
		const replacementState = {
			collapsed: replacementItemA.collapsed.get(),
			cachedSelections: serializeSelections(replacementItemA),
			editorSelections: serializeEditorSelections(getEditor(harness.widget, replacementItemA)),
		};
		const lateRestoredSelection = new Selection(1, 3, 1, 3);
		harness.widget.setViewState({
			scrollState: { top: 0, left: 0 },
			docStates: {
				[documentA.key]: { collapsed: true, selections: [lateRestoredSelection] },
			},
			activeDiffItemKey: documentA.key,
		});

		const actual = {
			recreatedState,
			replacementState,
			lateRestoredState: {
				collapsed: replacementItemA.collapsed.get(),
				selections: serializeSelections(replacementItemA),
			},
		};
		await harness.dispose();

		assert.deepStrictEqual(actual, {
			recreatedState: {
				newViewModel: true,
				collapsed: true,
				selections: [serializeSelection(currentSelection)],
			},
			replacementState: {
				collapsed: false,
				cachedSelections: undefined,
				editorSelections: [serializeSelection(new Selection(1, 1, 1, 1))],
			},
			lateRestoredState: {
				collapsed: true,
				selections: [serializeSelection(lateRestoredSelection)],
			},
		});
	});

	function createHarness(): TestHarness {
		const serviceDisposables = new DisposableStore();
		const modelDisposables = new DisposableStore();
		const documentDisposables = new DisposableStore();
		const container = document.createElement('div');
		document.body.appendChild(container);
		const services = new ServiceCollection();
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() {
			override show() {
				return { total: () => { }, worked: () => { }, done: () => { } };
			}
			override showWhile(): Promise<void> {
				return Promise.resolve();
			}
		}());
		services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() {
			override playSignal(): Promise<void> {
				return Promise.resolve();
			}
		}());
		services.set(IMenuService, new class extends mock<IMenuService>() {
			override createMenu() {
				return {
					onDidChange: Event.None,
					dispose: () => { },
					getActions: () => [],
				};
			}
		}());
		services.set(IContextMenuService, new class extends mock<IContextMenuService>() {
			override readonly onDidShowContextMenu = Event.None;
			override readonly onDidHideContextMenu = Event.None;
			override showContextMenu(): void { }
		}());
		services.set(IContextViewService, {
			_serviceBrand: undefined,
			showContextView: () => ({ close: () => { } }),
			hideContextView: () => { },
			getContextViewElement: () => container,
			layout: () => { },
		});
		services.set(IHoverService, NullHoverService);
		services.set(IStorageService, serviceDisposables.add(new InMemoryStorageService()));
		services.set(IUserDataProfileService, new TestUserDataProfileService());
		services.set(IActionViewItemService, new NullActionViewItemService());
		const instantiationService = createCodeEditorServices(serviceDisposables, services);
		const modelService = instantiationService.get(IModelService);
		const widget = instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			undefined,
		);
		const viewModels = new DisposableStore();
		const cleanup = disposables.add(new DisposableStore());
		cleanup.add(toDisposable(() => widget.setViewModel(undefined)));
		cleanup.add(widget);
		cleanup.add(viewModels);
		cleanup.add(documentDisposables);
		cleanup.add(modelDisposables);
		cleanup.add(serviceDisposables);
		cleanup.add(toDisposable(() => container.remove()));

		widget.layout(new Dimension(800, 600));

		return {
			widget,
			createDocument(name: string): TestDocument {
				const original = modelDisposables.add(modelService.createModel('const value = 1;', null, URI.parse(`inmemory://original/${name}.ts`)));
				const modified = modelDisposables.add(modelService.createModel('const value = 2;', null, URI.parse(`inmemory://modified/${name}.ts`)));
				const ref = documentDisposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>({ original, modified }, Disposable.None));
				return {
					ref,
					key: JSON.stringify([original.uri.toString(), modified.uri.toString()]),
				};
			},
			createViewModel(model: IMultiDiffEditorModel): MultiDiffEditorViewModel {
				return viewModels.add(widget.createViewModel(model));
			},
			async dispose(): Promise<void> {
				cleanup.dispose();
				await timeout(0);
			},
		};
	}
});

interface TestHarness {
	readonly widget: MultiDiffEditorWidget;
	createDocument(name: string): TestDocument;
	createViewModel(model: IMultiDiffEditorModel): MultiDiffEditorViewModel;
	dispose(): Promise<void>;
}

interface TestDocument {
	readonly ref: RefCounted<IDocumentDiffItem>;
	readonly key: string;
}

async function waitForItems(viewModel: MultiDiffEditorViewModel, count: number): Promise<void> {
	await viewModel.waitForDiffOr1s();
	await waitForState(viewModel.items, items => items.length === count);
}

function getItem(viewModel: MultiDiffEditorViewModel, key: string): DocumentDiffItemViewModel {
	const item = viewModel.items.get().find(item => item.getKey() === key);
	assert.ok(item);
	return item;
}

function setEditorSelection(widget: MultiDiffEditorWidget, item: DocumentDiffItemViewModel, selection: Selection): void {
	getEditor(widget, item).setSelections([selection]);
}

function getEditor(widget: MultiDiffEditorWidget, item: DocumentDiffItemViewModel) {
	const resource = item.modifiedUri;
	assert.ok(resource);
	const editor = widget.tryGetCodeEditor(resource)?.editor;
	assert.ok(editor);
	return editor;
}

function revealModified(widget: MultiDiffEditorWidget, item: DocumentDiffItemViewModel): void {
	const modified = item.modifiedUri;
	assert.ok(modified);
	widget.reveal({ original: item.originalUri, modified }, { highlight: false });
}

function serializeEditorSelections(editor: ReturnType<typeof getEditor>) {
	return editor.getSelections()?.map(serializeSelection);
}

function serializeSelections(item: DocumentDiffItemViewModel) {
	return item.lastTemplateData.get().selections?.map(serializeSelection);
}

function serializeSelection(selection: Selection) {
	return {
		selectionStartLineNumber: selection.selectionStartLineNumber,
		selectionStartColumn: selection.selectionStartColumn,
		positionLineNumber: selection.positionLineNumber,
		positionColumn: selection.positionColumn,
	};
}
