/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Dimension } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event, ValueWithChangeEvent } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue, waitForState } from '../../../../base/common/observable.js';
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
import { DiffItemSource, IDocumentDiffItem, IMultiDiffEditorModel } from '../../../browser/widget/multiDiffEditor/model.js';
import { getMultiDiffEditorVariantConfiguration, multiDiffEditorVariants } from '../../../browser/widget/multiDiffEditor/multiDiffEditorOptions.js';
import { MultiDiffEditorWidget } from '../../../browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IWorkbenchUIElementFactory } from '../../../browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Range } from '../../../common/core/range.js';
import { IDocumentDiff, IDocumentDiffProvider } from '../../../common/diff/documentDiffProvider.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { instantiateTextModel } from '../../common/testTextModel.js';
import { TestDiffProviderFactoryService } from '../diff/testDiffProviderFactoryService.js';
import { createCodeEditorServices } from '../testCodeEditor.js';

suite('MultiDiffEditorWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

	function createOnDemandWidget(count: number, loading?: Promise<void>) {
		const services = new ServiceCollection();
		services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { });
		services.set(IActionViewItemService, new NullActionViewItemService());
		services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() {
			override show() { return emptyProgressRunner; }
		});
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		services.set(IStorageService, disposables.add(new InMemoryStorageService()));
		services.set(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(): IMenu {
				return new class extends mock<IMenu>() {
					override readonly onDidChange = Event.None;
					override getActions() { return []; }
					override dispose(): void { }
				};
			}
		});
		const instantiationService = createCodeEditorServices(disposables, services);
		const requested: number[] = [];
		const documents = Array.from({ length: count }, (_, index) => {
			const resource = URI.parse(`inmemory://modified/file${index}.ts`);
			return disposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>({
				original: undefined,
				modified: new DiffItemSource(resource, undefined),
				load: async () => {
					requested.push(index);
					await loading;
					const text = Array.from({ length: 64 }, (_, line) => `file ${index} line ${line}`).join('\n');
					const model = instantiateTextModel(instantiationService, text, undefined, undefined, resource);
					return RefCounted.createOfNonDisposable<IDocumentDiffItem>({
						original: undefined,
						modified: new DiffItemSource(resource, model),
					}, model);
				},
			}, { dispose() { } }));
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const widget = disposables.add(instantiationService.createInstance(MultiDiffEditorWidget, container, {} satisfies IWorkbenchUIElementFactory, { variant: 'noCards' }));
		widget.layout(new Dimension(800, 200));
		const viewModel = disposables.add(widget.createViewModel({ documents: ValueWithChangeEvent.const(documents) }));
		return { widget, viewModel, requested, container };
	}

	test('loads visible rows only and reuses them after switching views', async () => {
		const { widget, viewModel, requested } = createOnDemandWidget(100);
		await waitForState(viewModel.items, items => items.length === 100);
		const beforeAttach = requested.length;
		widget.setViewModel(viewModel, { preserveFocus: true });
		await waitForState(viewModel.items.get()[0].isLoading, loading => !loading);
		widget.setViewModel(undefined);
		widget.setViewModel(viewModel, { preserveFocus: true });
		const target = viewModel.items.get()[91];
		widget.reveal({ original: target.originalUri, modified: target.modifiedUri });
		await waitForState(target.isLoading, loading => !loading);
		assert.deepStrictEqual({ beforeAttach, requested, itemCount: viewModel.items.get().length }, {
			beforeAttach: 0, requested: [0, 91], itemCount: 100,
		});
	});

	test('keeps collapsed rows unloaded until expanded', async () => {
		const { widget, viewModel, requested } = createOnDemandWidget(20);
		await waitForState(viewModel.items, items => items.length === 20);
		viewModel.collapseAll();
		const items = viewModel.items.get();
		widget.setViewModel(viewModel, {
			preserveFocus: true,
			viewState: {
				scrollState: { top: 0, left: 0 },
				activeDiffItemKey: items[0].getKey(),
				docStates: Object.fromEntries(items.map(item => [item.getKey(), { collapsed: true }])),
			},
		});
		const collapsedReads = requested.length;
		viewModel.expand(items[1]);
		await waitForState(items[1].isLoading, loading => !loading);
		assert.deepStrictEqual({ collapsedReads, requested }, { collapsedReads: 0, requested: [1] });
	});

	test('reports a busy file and does not steal focus when loading finishes', async () => {
		const gate = new DeferredPromise<void>();
		const { widget, viewModel, container } = createOnDemandWidget(1, gate.p);
		await waitForState(viewModel.items, items => items.length === 1);
		widget.setViewModel(viewModel);
		await waitForState(viewModel.items.get()[0].isFocused, focused => focused);
		const placeholder = container.querySelector<HTMLElement>('.file-loading-placeholder');
		const loadingState = {
			focused: document.activeElement === placeholder,
			busy: placeholder?.getAttribute('aria-busy'),
			message: placeholder?.textContent,
		};
		const outside = document.createElement('button');
		document.body.appendChild(outside);
		disposables.add(toDisposable(() => outside.remove()));
		outside.focus();
		await gate.complete();
		await waitForState(viewModel.items.get()[0].isLoading, loading => !loading);
		assert.deepStrictEqual({ loadingState, outsideStillFocused: document.activeElement === outside, busy: placeholder?.getAttribute('aria-busy') }, {
			loadingState: { focused: true, busy: 'true', message: 'Loading file...' },
			outsideStillFocused: true,
			busy: 'false',
		});
	});

	test('moves focus from a loading placeholder into the resolved diff', async () => {
		const gate = new DeferredPromise<void>();
		const { widget, viewModel } = createOnDemandWidget(1, gate.p);
		await waitForState(viewModel.items, items => items.length === 1);
		widget.setViewModel(viewModel);
		await waitForState(viewModel.items.get()[0].isFocused, focused => focused);
		await gate.complete();
		await waitForState(viewModel.items.get()[0].isLoading, loading => !loading);
		assert.strictEqual(widget.getActiveControl()?.hasTextFocus(), true);
	});

	test('reveals a requested range after deferred contents arrive', async () => {
		const gate = new DeferredPromise<void>();
		const { widget, viewModel, requested } = createOnDemandWidget(1, gate.p);
		await waitForState(viewModel.items, items => items.length === 1);
		widget.setViewModel(viewModel, { preserveFocus: true });
		const item = viewModel.items.get()[0];
		widget.reveal({ original: item.originalUri, modified: item.modifiedUri }, { range: new Range(45, 1, 45, 2), highlight: false });
		await gate.complete();
		await waitForState(item.isLoading, loading => !loading);
		const diff = item.diffEditorViewModel;
		assert.ok(diff);
		await waitForState(diff.isDiffUpToDate, ready => ready);
		assert.deepStrictEqual({
			requested,
			scrolledToRange: (widget.getActiveControl()?.getModifiedEditor().getScrollTop() ?? 0) > 0,
		}, { requested: [0], scrolledToRange: true });
	});

	test('navigates to a deferred file without loading intervening offscreen rows', async () => {
		const { widget, viewModel, requested } = createOnDemandWidget(100);
		await waitForState(viewModel.items, items => items.length === 100);
		widget.setViewModel(viewModel, { preserveFocus: true });
		const first = viewModel.items.get()[0];
		await waitForState(first.isLoading, loading => !loading);
		assert.ok(first.diffEditorViewModel);
		await waitForState(first.diffEditorViewModel.isDiffUpToDate, ready => ready);
		widget.goToNextChange();
		const next = viewModel.items.get()[1];
		await waitForState(next.isLoading, loading => !loading);
		await waitForState(viewModel.activeDiffItem, active => active === next);
		await waitForState(next.isFocused, focused => focused);
		assert.deepStrictEqual({
			requested,
			focused: [first.isFocused.get(), next.isFocused.get()],
			activeResource: widget.getActiveControl()?.getModifiedEditor().getModel()?.uri.toString(),
		}, {
			requested: [0, 1],
			focused: [false, true],
			activeResource: next.modifiedUri?.toString(),
		});
	});

	test('disposes the view without rebinding retained models', async () => {
		const { widget, viewModel, requested } = createOnDemandWidget(20);
		await waitForState(viewModel.items, items => items.length === 20);
		widget.setViewModel(viewModel, { preserveFocus: true });
		const item = viewModel.items.get()[0];
		await waitForState(item.isLoading, loading => !loading);
		widget.dispose();
		assert.deepStrictEqual({ requested, modelRetained: item.isAlive.get() }, { requested: [0], modelRetained: true });
	});

	test('releases view-owned focus without clearing a newer attachment', async () => {
		const { viewModel } = createOnDemandWidget(1);
		await waitForState(viewModel.items, items => items.length === 1);
		const item = viewModel.items.get()[0];
		const oldFocus = observableValue('oldFocus', true);
		const newFocus = observableValue('newFocus', true);
		const oldAttachment = disposables.add(item.setIsFocused(oldFocus, undefined));
		const newAttachment = disposables.add(item.setIsFocused(newFocus, undefined));
		oldAttachment.dispose();
		const newerAttachmentStillFocused = item.isFocused.get();
		newAttachment.dispose();
		newFocus.set(false, undefined);
		newFocus.set(true, undefined);
		assert.deepStrictEqual({ newerAttachmentStillFocused, detachedFocus: item.isFocused.get() }, {
			newerAttachmentStillFocused: true, detachedFocus: false,
		});
	});

	test('uses closed variant configurations', () => {
		assert.deepStrictEqual({
			variants: multiDiffEditorVariants,
			noCardsNonCompact: getMultiDiffEditorVariantConfiguration('noCardsNonCompact'),
			noCards: getMultiDiffEditorVariantConfiguration('noCards'),
		}, {
			variants: ['noCards', 'noCardsNonCompact'],
			noCardsNonCompact: {
				className: 'multiDiffEditor-standard',
				horizontalInsets: { left: 9, right: 9 },
				headerHeight: 40,
				contentBottomPadding: 0,
				headerClickToCollapse: false,
			},
			noCards: {
				className: 'multiDiffEditor-compact',
				horizontalInsets: { left: 0, right: 0 },
				headerHeight: 32,
				contentBottomPadding: 8,
				headerClickToCollapse: true,
			},
		});
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
			{ variant: 'noCardsNonCompact' },
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

	test('renders binary files as a placeholder', async () => {
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
		const originalUri = URI.parse('inmemory://original/image.png');
		const modifiedUri = URI.parse('inmemory://modified/image.png');
		const documentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			original: new DiffItemSource(originalUri, undefined),
			modified: new DiffItemSource(modifiedUri, undefined),
		}, { dispose() { } });
		const model: IMultiDiffEditorModel = {
			documents: ValueWithChangeEvent.const([documentItem]),
		};
		let openedDiff: { original: URI; modified: URI } | undefined;
		const container = document.createElement('div');
		const widget = instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{
				openDiffEditor: (original, modified) => openedDiff = { original, modified },
			} satisfies IWorkbenchUIElementFactory,
			{ variant: 'noCardsNonCompact' },
		);
		widget.layout(new Dimension(800, 600));
		const viewModel = widget.createViewModel(model);
		await waitForState(viewModel.items, items => items.length === 1);
		widget.setViewModel(viewModel);
		widget.reveal({ original: originalUri, modified: modifiedUri }, { highlight: false });
		await waitForState(widget.getLayoutDebugState(), state => state.items[0]?.hasTemplate === true);

		try {
			const placeholder = widget.getRootElement().querySelector<HTMLElement>('.binary-file-placeholder');
			const editor = widget.getRootElement().querySelector<HTMLElement>('.editorContainer');
			const openDiffButton = placeholder?.querySelector<HTMLElement>('.monaco-button');
			const focusSpy = sinon.spy(Button.prototype, 'focus');
			const canFocusActiveItem = widget.focus();
			openDiffButton?.click();
			assert.deepStrictEqual({
				text: placeholder?.textContent,
				display: placeholder?.style.display,
				tabIndex: placeholder?.tabIndex,
				role: placeholder?.getAttribute('role'),
				ariaLabel: placeholder?.getAttribute('aria-label'),
				openDiffButtonText: openDiffButton?.textContent,
				openDiffButtonSecondary: openDiffButton?.classList.contains('secondary'),
				openDiffButtonFocused: focusSpy.calledOnce,
				openedOriginalUri: openedDiff?.original.toString(),
				openedModifiedUri: openedDiff?.modified.toString(),
				editorDisplay: editor?.style.display,
				itemHeight: widget.getLayoutDebugState().get().items[0].verticalState.contentHeight,
				canFocusActiveItem,
				findsDocumentItem: widget.findDocumentDiffItem(modifiedUri) === documentItem.object,
				hasCodeEditorForBinaryResource: widget.tryGetCodeEditor(modifiedUri) !== undefined,
			}, {
				text: 'Binary file changedOpen Diff',
				display: 'grid',
				tabIndex: -1,
				role: 'group',
				ariaLabel: 'Binary file changed',
				openDiffButtonText: 'Open Diff',
				openDiffButtonSecondary: true,
				openDiffButtonFocused: true,
				openedOriginalUri: originalUri.toString(),
				openedModifiedUri: modifiedUri.toString(),
				editorDisplay: 'none',
				itemHeight: 140,
				canFocusActiveItem: true,
				findsDocumentItem: true,
				hasCodeEditorForBinaryResource: false,
			});
		} finally {
			widget.setViewModel(undefined);
			viewModel.dispose();
			widget.dispose();
			documentItem.dispose();
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
			original: new DiffItemSource(originalUri, original),
			modified: new DiffItemSource(modifiedUri, modified),
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
			{ variant: 'noCardsNonCompact' },
		);
		widget.setViewMode('automatic');
		widget.layout(new Dimension(800, 600));
		const viewModel = widget.createViewModel(model);
		await waitForState(viewModel.items, items => items.length === 1);
		widget.setViewModel(viewModel);
		widget.reveal({ original: originalUri, modified: modifiedUri }, { highlight: false });

		try {
			const activeControl = widget.getActiveControl();
			const renderSideBySideWhenNarrow = activeControl?.renderSideBySide;
			const automaticLayoutWhenNarrow = widget.getContextKeyService().getContextKeyValue(EditorContextKeys.diffEditorAutomaticRenderSideBySide.key);
			widget.layout(new Dimension(1000, 600));
			assert.deepStrictEqual({
				configuredAccessibilitySupport: updateOptionsSpy.firstCall.args[0].accessibilitySupport,
				configuredRenderSideBySide: updateOptionsSpy.firstCall.args[0].renderSideBySide,
				configuredUseInlineViewWhenSpaceIsLimited: updateOptionsSpy.firstCall.args[0].useInlineViewWhenSpaceIsLimited,
				renderSideBySideWhenNarrow,
				renderSideBySideWhenWide: activeControl?.renderSideBySide,
				automaticLayoutWhenNarrow,
				automaticLayoutWhenWide: widget.getContextKeyService().getContextKeyValue(EditorContextKeys.diffEditorAutomaticRenderSideBySide.key),
				optionsAppliedBeforeModel: updateOptionsSpy.calledBefore(setDiffModelSpy),
				effectiveAccessibilitySupport: activeControl?.getModifiedEditor().getOption(EditorOption.accessibilitySupport),
			}, {
				configuredAccessibilitySupport: 'off',
				configuredRenderSideBySide: true,
				configuredUseInlineViewWhenSpaceIsLimited: true,
				renderSideBySideWhenNarrow: false,
				renderSideBySideWhenWide: true,
				automaticLayoutWhenNarrow: false,
				automaticLayoutWhenWide: true,
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
			original: new DiffItemSource(originalUri, original),
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
			{ variant: 'noCardsNonCompact' },
		);
		widget.layout(new Dimension(800, 600));
		const viewModel = widget.createViewModel(model);
		await waitForState(viewModel.items, items => items.length === 1);
		const diffViewModel = viewModel.items.get()[0].diffEditorViewModel;
		assert.ok(diffViewModel);
		await waitForState(diffViewModel.isDiffUpToDate, value => value);

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
				original: new DiffItemSource(originalUri, original),
				modified: new DiffItemSource(modifiedUri, modified),
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
			{ variant: 'noCardsNonCompact' },
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
