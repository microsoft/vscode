/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Dimension } from '../../../../base/browser/dom.js';
import { Event, ValueWithChangeEvent } from '../../../../base/common/event.js';
import { autorun, waitForState } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AccessibilitySupport } from '../../../../platform/accessibility/common/accessibility.js';
import { IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuService } from '../../../../platform/actions/common/actions.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { emptyProgressRunner, IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService } from '../../../../platform/storage/common/storage.js';
import { IDiffProviderFactoryService } from '../../../browser/widget/diffEditor/diffProviderFactoryService.js';
import { DiffEditorWidget } from '../../../browser/widget/diffEditor/diffEditorWidget.js';
import { RefCounted } from '../../../browser/widget/diffEditor/utils.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from '../../../browser/widget/multiDiffEditor/model.js';
import { MultiDiffEditorWidget } from '../../../browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IWorkbenchUIElementFactory } from '../../../browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IDocumentDiff, IDocumentDiffProvider } from '../../../common/diff/documentDiffProvider.js';
import { instantiateTextModel } from '../../common/testTextModel.js';
import { TestDiffProviderFactoryService } from '../diff/testDiffProviderFactoryService.js';
import { createCodeEditorServices } from '../testCodeEditor.js';

suite('MultiDiffEditorWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

	test('models bottom padding as trailing scroll content', () => {
		const services = new ServiceCollection();
		services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }());
		services.set(IActionViewItemService, new NullActionViewItemService());
		services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() { }());
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		services.set(IStorageService, disposables.add(new InMemoryStorageService()));
		services.set(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(): IMenu {
				return new class extends mock<IMenu>() {
					override readonly onDidChange = Event.None;
					override getActions() { return []; }
					override dispose(): void { }
				}();
			}
		}());
		const instantiationService = createCodeEditorServices(disposables, services);
		const container = document.createElement('div');
		const widget = instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			undefined,
		);
		widget.layout(new Dimension(800, 200));
		const initialState = widget.getLayoutDebugState().get();
		widget.setPaddingBottom(24);

		try {
			const state = widget.getLayoutDebugState().get();
			assert.deepStrictEqual({
				logicalScrollHeightDelta: state.layout.logicalScrollHeight - initialState.layout.logicalScrollHeight,
				scrollHeightDelta: state.scrollDimensions.scrollHeight - initialState.scrollDimensions.scrollHeight,
				diffItems: state.items.length,
			}, {
				logicalScrollHeightDelta: 24,
				scrollHeightDelta: 24,
				diffItems: 0,
			});
		} finally {
			widget.dispose();
		}
	});

	test('applies document and responsive layout options before attaching the diff model', async () => {
		const services = new ServiceCollection();
		services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }());
		services.set(IActionViewItemService, new NullActionViewItemService());
		services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() { }());
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		services.set(IStorageService, disposables.add(new InMemoryStorageService()));
		services.set(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(): IMenu {
				return new class extends mock<IMenu>() {
					override readonly onDidChange = Event.None;
					override getActions() { return []; }
					override dispose(): void { }
				}();
			}
		}());
		const instantiationService = createCodeEditorServices(disposables, services);

		const originalUri = URI.parse('inmemory://original/test.js');
		const modifiedUri = URI.parse('inmemory://modified/test.js');
		const original = disposables.add(instantiateTextModel(instantiationService, 'const value = 1;', undefined, undefined, originalUri));
		const modified = disposables.add(instantiateTextModel(instantiationService, 'const value = 2;', undefined, undefined, modifiedUri));
		const documentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			original,
			modified,
			options: { accessibilitySupport: 'off' },
		}, { dispose() { } });
		const model: IMultiDiffEditorModel = {
			documents: ValueWithChangeEvent.const([documentItem]),
		};

		const updateOptionsSpy = sinon.spy(DiffEditorWidget.prototype, 'updateOptions');
		const setDiffModelSpy = sinon.spy(DiffEditorWidget.prototype, 'setDiffModel');

		const container = document.createElement('div');
		const widget = instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			undefined,
		);
		widget.setRenderSideBySide(true, { useInlineViewWhenSpaceIsLimited: true });
		widget.layout(new Dimension(800, 600));
		const viewModel = widget.createViewModel(model);
		await waitForState(viewModel.items, items => items.length === 1);
		widget.setViewModel(viewModel);
		widget.reveal({ original: originalUri, modified: modifiedUri }, { highlight: false });

		try {
			const activeControl = widget.getActiveControl();
			const renderSideBySideWhenNarrow = activeControl?.renderSideBySide;
			widget.layout(new Dimension(1000, 600));
			assert.deepStrictEqual({
				configuredAccessibilitySupport: updateOptionsSpy.firstCall.args[0].accessibilitySupport,
				configuredRenderSideBySide: updateOptionsSpy.firstCall.args[0].renderSideBySide,
				configuredUseInlineViewWhenSpaceIsLimited: updateOptionsSpy.firstCall.args[0].useInlineViewWhenSpaceIsLimited,
				renderSideBySideWhenNarrow,
				renderSideBySideWhenWide: activeControl?.renderSideBySide,
				optionsAppliedBeforeModel: updateOptionsSpy.calledBefore(setDiffModelSpy),
				effectiveAccessibilitySupport: activeControl?.getModifiedEditor().getOption(EditorOption.accessibilitySupport),
			}, {
				configuredAccessibilitySupport: 'off',
				configuredRenderSideBySide: true,
				configuredUseInlineViewWhenSpaceIsLimited: true,
				renderSideBySideWhenNarrow: false,
				renderSideBySideWhenWide: true,
				optionsAppliedBeforeModel: true,
				effectiveAccessibilitySupport: AccessibilitySupport.Disabled,
			});
		} finally {
			widget.setViewModel(undefined);
			viewModel.dispose();
			widget.dispose();
			documentItem.dispose();
		}
	});

	test('uses the taller side while binding a deleted file', async () => {
		const services = new ServiceCollection();
		services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }());
		services.set(IActionViewItemService, new NullActionViewItemService());
		services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() { }());
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		services.set(IStorageService, disposables.add(new InMemoryStorageService()));
		services.set(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(): IMenu {
				return new class extends mock<IMenu>() {
					override readonly onDidChange = Event.None;
					override getActions() { return []; }
					override dispose(): void { }
				}();
			}
		}());
		const instantiationService = createCodeEditorServices(disposables, services);

		const originalUri = URI.parse('inmemory://original/deleted.js');
		const originalContent = Array.from({ length: 64 }, (_, index) => `line ${index}`).join('\n');
		const original = disposables.add(instantiateTextModel(instantiationService, originalContent, undefined, undefined, originalUri));
		const documentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			original,
			modified: undefined,
			options: { accessibilitySupport: 'off' },
		}, { dispose() { } });
		const model: IMultiDiffEditorModel = {
			documents: ValueWithChangeEvent.const([documentItem]),
		};

		const container = document.createElement('div');
		const widget = instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			undefined,
		);
		widget.layout(new Dimension(800, 600));
		const viewModel = widget.createViewModel(model);
		await waitForState(viewModel.items, items => items.length === 1);
		await waitForState(viewModel.items.get()[0].diffEditorViewModel.isDiffUpToDate, value => value);

		const observedHeights: number[] = [];
		const observer = autorun(reader => {
			const item = widget.getLayoutDebugState().read(reader).items[0];
			if (item?.hasTemplate) {
				observedHeights.push(item.verticalState.contentHeight);
			}
		});
		try {
			widget.setViewModel(viewModel);
			widget.reveal({ original: originalUri, modified: undefined }, { highlight: false });
			await waitForState(widget.getLayoutDebugState(), state => state.items[0]?.hasTemplate);
			const item = widget.getLayoutDebugState().get().items[0];
			const expectedHeight = widget.getActiveControl()!.getOriginalEditor().getContentHeight() + 40;

			assert.deepStrictEqual({
				minimumObservedHeight: Math.min(...observedHeights),
				finalHeight: item.verticalState.contentHeight,
			}, {
				minimumObservedHeight: expectedHeight,
				finalHeight: expectedHeight,
			});
		} finally {
			observer.dispose();
			widget.setViewModel(undefined);
			viewModel.dispose();
			widget.dispose();
			documentItem.dispose();
		}
	});

	test('preserves expanded height when a collapsed template is recycled', async () => {
		const services = new ServiceCollection();
		services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }());
		services.set(IActionViewItemService, new NullActionViewItemService());
		services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() {
			override show() { return emptyProgressRunner; }
		}());
		services.set(IDiffProviderFactoryService, new PendingDiffProviderFactoryService());
		services.set(IStorageService, disposables.add(new InMemoryStorageService()));
		services.set(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(): IMenu {
				return new class extends mock<IMenu>() {
					override readonly onDidChange = Event.None;
					override getActions() { return []; }
					override dispose(): void { }
				}();
			}
		}());
		const instantiationService = createCodeEditorServices(disposables, services);
		const documentItems: RefCounted<IDocumentDiffItem>[] = [];
		const originalUris: URI[] = [];
		const modifiedUris: URI[] = [];
		for (let index = 0; index < 3; index++) {
			const originalUri = URI.parse(`inmemory://original/test-${index}.js`);
			const modifiedUri = URI.parse(`inmemory://modified/test-${index}.js`);
			const original = disposables.add(instantiateTextModel(instantiationService, '', undefined, undefined, originalUri));
			const modified = disposables.add(instantiateTextModel(instantiationService, 'const value = 1;', undefined, undefined, modifiedUri));
			documentItems.push(RefCounted.createOfNonDisposable<IDocumentDiffItem>({
				original,
				modified,
				options: { accessibilitySupport: 'off' },
			}, { dispose() { } }));
			originalUris.push(originalUri);
			modifiedUris.push(modifiedUri);
		}
		const model: IMultiDiffEditorModel = {
			documents: ValueWithChangeEvent.const(documentItems),
		};
		const container = document.createElement('div');
		const widget = instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			undefined,
		);
		widget.layout(new Dimension(800, 200));
		const viewModel = widget.createViewModel(model);
		await waitForState(viewModel.items, items => items.length === documentItems.length);
		viewModel.items.get()[0].lastTemplateData.set({ expandedContentHeight: 2000, selections: undefined }, undefined);
		widget.setViewModel(viewModel);
		widget.reveal({ original: originalUris[0], modified: modifiedUris[0] }, { highlight: false });

		const observedLastItemHeights: number[] = [];
		const observer = autorun(reader => {
			const lastItem = widget.getLayoutDebugState().read(reader).items.at(-1);
			if (lastItem?.hasTemplate) {
				observedLastItemHeights.push(lastItem.verticalState.contentHeight);
			}
		});
		try {
			const firstItem = widget.getLayoutDebugState().get().items[0];
			viewModel.items.get()[0].collapsed.set(true, undefined);
			widget.reveal({ original: originalUris.at(-1), modified: modifiedUris.at(-1) }, { highlight: false });
			const cachedFirstItemHeight = viewModel.items.get()[0].lastTemplateData.get().expandedContentHeight;
			widget.reveal({ original: originalUris[0], modified: modifiedUris[0] }, { highlight: false });
			viewModel.items.get()[0].collapsed.set(false, undefined);

			assert.deepStrictEqual({
				firstItemHasTemplate: firstItem.hasTemplate,
				firstItemHeight: firstItem.verticalState.contentHeight,
				cachedFirstItemHeight,
				firstObservedLastItemHeight: observedLastItemHeights[0],
				restoredFirstItemHeight: widget.getLayoutDebugState().get().items[0].verticalState.contentHeight,
			}, {
				firstItemHasTemplate: true,
				firstItemHeight: 2000,
				cachedFirstItemHeight: 2000,
				firstObservedLastItemHeight: 500,
				restoredFirstItemHeight: 2000,
			});
		} finally {
			observer.dispose();
			widget.setViewModel(undefined);
			viewModel.dispose();
			widget.dispose();
			for (const documentItem of documentItems) {
				documentItem.dispose();
			}
		}
	});
});

class PendingDiffProviderFactoryService implements IDiffProviderFactoryService {
	declare readonly _serviceBrand: undefined;

	createDiffProvider(): IDocumentDiffProvider {
		return new class extends mock<IDocumentDiffProvider>() {
			override readonly onDidChange = Event.None;
			override computeDiff(): Promise<IDocumentDiff> {
				return new Promise(() => { });
			}
		}();
	}
}
