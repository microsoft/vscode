/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Dimension, isAncestorOfActiveElement } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Emitter, Event, ValueWithChangeEvent } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, waitForState } from '../../../../base/common/observable.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { AccessibilitySupport } from '../../../../platform/accessibility/common/accessibility.js';
import { IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuService } from '../../../../platform/actions/common/actions.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { emptyProgressRunner, IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../platform/userInteraction/browser/userInteractionService.js';
import { IDiffProviderFactoryService } from '../../../browser/widget/diffEditor/diffProviderFactoryService.js';
import { DiffEditorWidget } from '../../../browser/widget/diffEditor/diffEditorWidget.js';
import { RefCounted } from '../../../browser/widget/diffEditor/utils.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from '../../../browser/widget/multiDiffEditor/model.js';
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
import { createBinaryDocumentDiffItem, createTextDocumentDiffItem } from './multiDiffEditorTestUtils.js';

suite('MultiDiffEditorWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

	/** A widget over 50 files whose contents load on demand; file `pendingIndex` waits for `finish`, file `failingIndex` fails to load. */
	function createLazyWidget(options: { readonly pendingIndex?: number; readonly failingIndex?: number } = {}) {
		const services = new ServiceCollection();
		// Real (not simulated) editor focus, so only the editor that has DOM focus is the focused item.
		services.set(IUserInteractionService, new MockUserInteractionService(false));
		services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() {
			override async playSignal() { }
		}());
		services.set(IActionViewItemService, new NullActionViewItemService());
		services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() {
			override show() { return emptyProgressRunner; }
		}());
		services.set(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		services.set(IStorageService, disposables.add(new InMemoryStorageService()));
		services.set(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(): IMenu {
				return new class extends mock<IMenu>() {
					override readonly onDidChange = Event.None;
					override getActions() { return []; }
					override dispose() { }
				}();
			}
		}());
		const instantiationService = createCodeEditorServices(disposables, services);
		const requests: number[] = [];
		const finish = new DeferredPromise<void>();
		const documents = Array.from({ length: 50 }, (_, index) => {
			const originalUri = URI.parse(`test:///original/${index}`);
			const modifiedUri = URI.parse(`test:///modified/${index}`);
			return disposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>({
				originalUri,
				modifiedUri,
				resolve: async () => {
					requests.push(index);
					if (index === options.pendingIndex) {
						await finish.p;
					}
					if (index === options.failingIndex) {
						throw new Error(`cannot load ${index}`);
					}
					const store = new DisposableStore();
					const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
					const original = store.add(instantiateTextModel(instantiationService, lines.join('\n'), undefined, undefined, originalUri));
					lines[24] = 'changed';
					const modified = store.add(instantiateTextModel(instantiationService, lines.join('\n'), undefined, undefined, modifiedUri));
					return {
						object: { kind: 'text', original, modified, options: { accessibilitySupport: 'off' } },
						dispose: () => store.dispose(),
					};
				},
			}, toDisposable(() => { })));
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		// An Open Diff button exists for files with both sides, as in the workbench.
		const widget = instantiationService.createInstance(MultiDiffEditorWidget, container, { openDiffEditor() { } } satisfies IWorkbenchUIElementFactory, { variant: 'noCards' });
		widget.layout(new Dimension(800, 200));
		const viewModel = widget.createViewModel({ documents: ValueWithChangeEvent.const(documents) });
		disposables.add(toDisposable(() => {
			widget.dispose();
			viewModel.dispose();
		}));
		return { widget, viewModel, requests, finish, container };
	}

	for (const navigation of ['reveal', 'next', 'superseded', 'focus', 'restore'] as const) {
		test(`keeps collapsed files lazy during deferred ${navigation}`, async () => {
			const { widget, viewModel, requests, finish, container } = createLazyWidget({ pendingIndex: 40 });
			await viewModel.waitForDiffOr1s();
			viewModel.collapseAll();
			widget.setViewModel(viewModel, { preserveFocus: true });
			const initialRequests = [...requests];
			const target = viewModel.items.get()[40];
			const range = new Range(25, 1, 25, 4);
			if (navigation === 'restore') {
				target.collapsed.set(false, undefined);
				const state = widget.getViewState();
				widget.setViewState({
					...state,
					activeDiffItemKey: target.getKey(),
					scrollState: { ...state.scrollState, top: widget.getLayoutDebugState().get().items[40].layout.contentRange.start },
				});
			} else if (navigation === 'next' || navigation === 'superseded') {
				viewModel.activeDiffItem.setCache(target, undefined);
				widget.goToNextChange();
				if (navigation === 'superseded') {
					widget.reveal({ original: viewModel.items.get()[0].originalUri, modified: viewModel.items.get()[0].modifiedUri });
				}
			} else {
				widget.reveal({ original: target.originalUri, modified: target.modifiedUri }, { range, highlight: true });
				if (navigation === 'focus') {
					widget.focus();
				}
			}
			const pendingState = {
				requests: [...requests],
				loading: container.querySelector('[aria-busy="true"]')?.getAttribute('aria-label'),
				editor: widget.tryGetCodeEditor(target.modifiedUri!) !== undefined,
			};
			await finish.complete();
			await target.load();
			await target.diffEditorViewModel.waitForDiff();
			await timeout(0);
			const editorInfo = widget.tryGetCodeEditor(target.modifiedUri!);
			const editor = widget.tryGetCodeEditor(target.originalUri!)?.editor;
			const highlights = editor?.getModel()!.getAllDecorations()
				.filter(d => d.options.description === 'symbol-navigate-action-highlight')
				.map(d => d.range);
			assert.deepStrictEqual({
				initialRequests,
				pendingState,
				requests,
				collapsed: target.collapsed.get(),
				highlights,
				active: viewModel.activeDiffItem.get()?.getKey(),
				focused: isAncestorOfActiveElement(editorInfo?.editor.getContainerDomNode() ?? container),
			}, {
				initialRequests: [0, 1, 2, 3, 4],
				pendingState: { requests: [0, 1, 2, 3, 4, 40], loading: 'Loading...', editor: false },
				requests: [0, 1, 2, 3, 4, 40],
				collapsed: false,
				highlights: navigation === 'superseded' ? undefined : navigation === 'next' || navigation === 'restore' ? [] : [range],
				active: navigation === 'superseded' ? viewModel.items.get()[0].getKey() : target.getKey(),
				focused: navigation === 'next' || navigation === 'focus',
			});
		});
	}

	test('does not load a collapsed file on a plain reveal, and next change moves past a file that fails to load', async () => {
		const { widget, viewModel, requests } = createLazyWidget({ failingIndex: 41 });
		const previousErrorHandler = errorHandler.getUnexpectedErrorHandler();
		const reportedErrors: string[] = [];
		setUnexpectedErrorHandler(error => reportedErrors.push(error.message));
		try {
			await viewModel.waitForDiffOr1s();
			viewModel.collapseAll();
			widget.setViewModel(viewModel, { preserveFocus: true });
			const items = viewModel.items.get();
			widget.reveal({ original: items[40].originalUri, modified: items[40].modifiedUri });
			await timeout(0);
			const afterPlainReveal = { requests: [...requests], active: viewModel.activeDiffItem.get()?.getKey() };

			viewModel.activeDiffItem.setCache(items[41], undefined);
			widget.goToNextChange();
			await waitForState(viewModel.activeDiffItem, item => item === items[42]);
			await items[42].load();
			await items[42].diffEditorViewModel.waitForDiff();
			await timeout(0);
			assert.deepStrictEqual({
				afterPlainReveal,
				requests,
				reportedErrors,
				failedLoaded: items[41].isLoaded.get(),
				focusedNext: isAncestorOfActiveElement(widget.tryGetCodeEditor(items[42].modifiedUri!)!.editor.getContainerDomNode()),
			}, {
				afterPlainReveal: { requests: [0, 1, 2, 3, 4], active: items[40].getKey() },
				requests: [0, 1, 2, 3, 4, 41, 42],
				reportedErrors: ['cannot load 41'],
				failedLoaded: false,
				focusedNext: true,
			});
		} finally {
			setUnexpectedErrorHandler(previousErrorHandler);
		}
	});

	test('uses closed variant configurations', () => {
		assert.deepStrictEqual({
			variants: multiDiffEditorVariants,
			cards: getMultiDiffEditorVariantConfiguration('cards'),
			noCardsNonCompact: getMultiDiffEditorVariantConfiguration('noCardsNonCompact'),
			noCards: getMultiDiffEditorVariantConfiguration('noCards'),
		}, {
			variants: ['cards', 'noCards', 'noCardsNonCompact'],
			cards: {
				diffEditorVariant: 'compact',
				classNames: ['multiDiffEditor-compact', 'multiDiffEditor-card'],
				horizontalInsets: { left: 9, right: 9 },
				headerHeight: 40,
				contentBottomPadding: 0,
				headerClickToCollapse: true,
				diffEditorOptions: { hideOriginalLineNumbers: true },
			},
			noCardsNonCompact: {
				classNames: ['multiDiffEditor-standard'],
				horizontalInsets: { left: 9, right: 9 },
				headerHeight: 40,
				contentBottomPadding: 0,
				headerClickToCollapse: false,
			},
			noCards: {
				classNames: ['multiDiffEditor-compact'],
				horizontalInsets: { left: 0, right: 0 },
				headerHeight: 32,
				contentBottomPadding: 8,
				headerClickToCollapse: true,
				diffEditorOptions: { hideOriginalLineNumbers: true },
			},
		});
	});

	test('resolves original line number visibility from variant and explicit options', async () => {
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
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		const originalUri = URI.parse('inmemory://original/line-numbers.js');
		const modifiedUri = URI.parse('inmemory://modified/line-numbers.js');
		const original = instantiateTextModel(instantiationService, 'const value = 1;', undefined, undefined, originalUri);
		const modified = instantiateTextModel(instantiationService, 'const value = 2;', undefined, undefined, modifiedUri);
		const optionsChanged = disposables.add(new Emitter<void>());
		let hideOriginalLineNumbers: boolean | undefined;
		const documentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			originalUri,
			modifiedUri,
			resolve: async () => ({
				object: {
					kind: 'text',
					original,
					modified,
					get options() {
						return hideOriginalLineNumbers === undefined ? {} : { hideOriginalLineNumbers };
					},
					onOptionsDidChange: optionsChanged.event,
				},
				dispose: () => { },
			}),
		}, { dispose() { } });
		const widget = instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			{ variant: 'noCards' },
		);
		widget.setRenderSideBySide(false);
		widget.layout(new Dimension(800, 300));
		const viewModel = widget.createViewModel({ documents: ValueWithChangeEvent.const([documentItem]) });
		disposables.add(toDisposable(() => {
			widget.dispose();
			viewModel.dispose();
			original.dispose();
			modified.dispose();
		}));
		await viewModel.waitForDiffOr1s();
		await waitForState(viewModel.items.get()[0].diffEditorViewModel.isDiffUpToDate, value => value);
		widget.setViewModel(viewModel);
		widget.reveal({ original: originalUri, modified: modifiedUri }, { highlight: false });
		await waitForState(widget.getLayoutDebugState(), state => state.items[0]?.hasTemplate === true);

		const originalEditorWidth = () => Number.parseInt(widget.getRootElement().querySelector<HTMLElement>('.monaco-diff-editor > .editor.original')!.style.width);
		const defaultNoCardsWidth = originalEditorWidth();
		hideOriginalLineNumbers = false;
		optionsChanged.fire();
		await waitForState(viewModel.items.get()[0].diffEditorViewModel.isDiffUpToDate, value => value);
		const explicitShowWidth = originalEditorWidth();
		hideOriginalLineNumbers = true;
		optionsChanged.fire();
		await waitForState(viewModel.items.get()[0].diffEditorViewModel.isDiffUpToDate, value => value);
		const explicitHideWidth = originalEditorWidth();
		hideOriginalLineNumbers = undefined;
		optionsChanged.fire();
		widget.setVariant('cards');
		await waitForState(viewModel.items.get()[0].diffEditorViewModel.isDiffUpToDate, value => value);
		const defaultCardsWidth = originalEditorWidth();
		widget.setVariant('noCardsNonCompact');
		await waitForState(viewModel.items.get()[0].diffEditorViewModel.isDiffUpToDate, value => value);
		const defaultNonCompactWidth = originalEditorWidth();

		assert.deepStrictEqual({
			defaultNoCardsHidden: defaultNoCardsWidth === 0,
			explicitFalseShows: explicitShowWidth > 0,
			explicitTrueHides: explicitHideWidth === 0,
			defaultCardsHidden: defaultCardsWidth === 0,
			defaultNonCompactShows: defaultNonCompactWidth > 0,
		}, {
			defaultNoCardsHidden: true,
			explicitFalseShows: true,
			explicitTrueHides: true,
			defaultCardsHidden: true,
			defaultNonCompactShows: true,
		});
		widget.setViewModel(undefined);
	});

	test('switches variants while preserving view state, focus, and sticky state', async () => {
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
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		const originalUri = URI.parse('inmemory://original/variant-switch.js');
		const modifiedUri = URI.parse('inmemory://modified/variant-switch.js');
		const original = disposables.add(instantiateTextModel(instantiationService, 'const value = 1;\nconst other = 1;', undefined, undefined, originalUri));
		const modified = disposables.add(instantiateTextModel(instantiationService, 'const value = 2;\nconst other = 1;', undefined, undefined, modifiedUri));
		const documentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>(createTextDocumentDiffItem(original, modified), { dispose() { } });
		const secondOriginalUri = URI.parse('inmemory://original/variant-switch-second.js');
		const secondModifiedUri = URI.parse('inmemory://modified/variant-switch-second.js');
		const secondOriginal = disposables.add(instantiateTextModel(instantiationService, 'const second = 1;', undefined, undefined, secondOriginalUri));
		const secondModified = disposables.add(instantiateTextModel(instantiationService, 'const second = 2;', undefined, undefined, secondModifiedUri));
		const secondDocumentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>(createTextDocumentDiffItem(secondOriginal, secondModified), { dispose() { } });
		const widget = disposables.add(instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			{ variant: 'noCards' },
		));
		widget.setRenderSideBySide(false);
		widget.layout(new Dimension(800, 80));
		const viewModel = disposables.add(widget.createViewModel({ documents: ValueWithChangeEvent.const([documentItem, secondDocumentItem]) }));
		await viewModel.waitForDiffOr1s();
		widget.setViewModel(viewModel);
		try {
			widget.reveal({ original: originalUri, modified: modifiedUri }, { highlight: false });
			await waitForState(widget.getLayoutDebugState(), state => state.items[0]?.hasTemplate === true);
			viewModel.items.get()[1].collapsed.set(true, undefined);
			const header = widget.getRootElement().querySelector<HTMLElement>('.multiDiffEntry .header')!;
			assert.strictEqual(header.classList.contains('shadow'), false);
			widget.setViewState({ scrollState: { top: 10, left: 0 } });
			assert.strictEqual(header.classList.contains('shadow'), true);
			widget.setViewState({ scrollState: { top: 0, left: 0 } });
			assert.strictEqual(header.classList.contains('shadow'), false);
			widget.setViewState({ scrollState: { top: 10, left: 0 } });

			const control = widget.getActiveControl()!;
			control.getModifiedEditor().setSelection({ startLineNumber: 1, startColumn: 7, endLineNumber: 1, endColumn: 12 });
			control.getModifiedEditor().focus();
			const previousRoot = widget.getRootElement();
			const previousState = widget.getViewState();

			widget.setVariant('cards');

			const currentRoot = widget.getRootElement();
			const currentControl = widget.getActiveControl()!;
			assert.deepStrictEqual({
				rootWasReplaced: currentRoot !== previousRoot,
				oldRootWasDisposed: !previousRoot.isConnected,
				hasCardsVariant: currentRoot.classList.contains('multiDiffEditor-card'),
				viewState: widget.getViewState(),
				modifiedEditorHasFocus: currentControl.getModifiedEditor().hasTextFocus(),
			}, {
				rootWasReplaced: true,
				oldRootWasDisposed: true,
				hasCardsVariant: true,
				viewState: previousState,
				modifiedEditorHasFocus: true,
			});
		} finally {
			widget.setViewModel(undefined);
		}
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
		const widget = disposables.add(instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			{ variant: 'noCardsNonCompact' },
		));
		widget.layout(new Dimension(800, 200));
		const initialState = widget.getLayoutDebugState().get();
		widget.setPaddingBottom(24);

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
	});

	test('user navigation supersedes a clamped restored scroll state', async () => {
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
		const originalUri = URI.parse('inmemory://original/first.png');
		const modifiedUri = URI.parse('inmemory://modified/first.png');
		const firstItem = disposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>(createBinaryDocumentDiffItem(originalUri, modifiedUri), { dispose() { } }));
		const secondItem = disposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>(createBinaryDocumentDiffItem(URI.parse('inmemory://original/second.png'), URI.parse('inmemory://modified/second.png')), { dispose() { } }));
		const container = document.createElement('div');
		const widget = disposables.add(instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			{ variant: 'noCardsNonCompact' },
		));
		widget.layout(new Dimension(800, 80));
		const viewModel = disposables.add(widget.createViewModel({ documents: ValueWithChangeEvent.const([firstItem, secondItem]) }));
		await viewModel.waitForDiffOr1s();
		widget.setViewModel(viewModel);
		await waitForState(viewModel.isLoading, isLoading => !isLoading);

		try {
			widget.setViewState({ scrollState: { top: 1000, left: 0 } });
			const restoredTop = widget.getViewState().scrollState.top;
			widget.setPaddingBottom(24);
			const topAfterRetry = widget.getViewState().scrollState.top;
			widget.reveal({ original: originalUri, modified: modifiedUri }, { highlight: false });
			const topAfterReveal = widget.getViewState().scrollState.top;
			widget.setPaddingBottom(64);
			const topAfterGrowth = widget.getViewState().scrollState.top;
			assert.deepStrictEqual({
				restoredTop,
				topAfterRetry,
				topAfterReveal,
				topAfterGrowth,
			}, {
				restoredTop: 200,
				topAfterRetry: 224,
				topAfterReveal: 0,
				topAfterGrowth: 0,
			});
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('exposes the host view model and the diff items visible in the viewport', async () => {
		const services = new ServiceCollection();
		// Real (not simulated) editor focus, so scrolled-away items release their templates.
		services.set(IUserInteractionService, new MockUserInteractionService(false));
		services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }());
		services.set(IActionViewItemService, new NullActionViewItemService());
		services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() {
			override show() { return emptyProgressRunner; }
		}());
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
		const names = ['first', 'second', 'third'];
		const documentItems = names.map(name => disposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>(createBinaryDocumentDiffItem(URI.parse(`inmemory://original/${name}.png`), URI.parse(`inmemory://modified/${name}.png`)), { dispose() { } })));
		const container = document.createElement('div');
		const widget = disposables.add(instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			{ variant: 'noCardsNonCompact' },
		));
		widget.layout(new Dimension(800, 100));
		const viewModel = disposables.add(widget.createViewModel({ documents: ValueWithChangeEvent.const(documentItems) }));
		await waitForState(viewModel.items, items => items.length === names.length);
		const visibleNames = () => widget.visibleDiffItems.get().map(item => item.modifiedUri?.path);

		const beforeViewModel = { viewModel: widget.viewModel.get(), visible: visibleNames() };
		widget.setViewModel(viewModel);
		await waitForState(viewModel.isLoading, isLoading => !isLoading);
		const initial = { isHostViewModel: widget.viewModel.get() === viewModel, visible: visibleNames() };
		widget.reveal({ original: documentItems[1].object.originalUri!, modified: documentItems[1].object.modifiedUri! }, { highlight: false });
		const afterReveal = visibleNames();
		widget.setViewState({ scrollState: { top: 200, left: 0 } });
		const afterScroll = visibleNames();
		widget.setVariant('cards');
		const afterVariantChange = { isHostViewModel: widget.viewModel.get() === viewModel, visible: visibleNames() };
		widget.setViewModel(undefined);
		const afterClear = { viewModel: widget.viewModel.get(), visible: visibleNames() };

		assert.deepStrictEqual({ beforeViewModel, initial, afterReveal, afterScroll, afterVariantChange, afterClear }, {
			beforeViewModel: { viewModel: undefined, visible: [] },
			initial: { isHostViewModel: true, visible: ['/first.png'] },
			afterReveal: ['/second.png'],
			afterScroll: ['/second.png', '/third.png'],
			afterVariantChange: { isHostViewModel: true, visible: ['/second.png', '/third.png'] },
			afterClear: { viewModel: undefined, visible: [] },
		});
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
		const documentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>(createBinaryDocumentDiffItem(originalUri, modifiedUri), { dispose() { } });
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
		await viewModel.waitForDiffOr1s();
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
		const documentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>(createTextDocumentDiffItem(original, modified, { accessibilitySupport: 'off' }), { dispose() { } });
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
		await viewModel.waitForDiffOr1s();
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
		const documentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>(createTextDocumentDiffItem(original, undefined, { accessibilitySupport: 'off' }), { dispose() { } });
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
		await viewModel.waitForDiffOr1s();
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

	test('preserves expanded height when a collapsed template is recycled', () => runWithFakedTimers({}, async () => {
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
			documentItems.push(RefCounted.createOfNonDisposable<IDocumentDiffItem>(createTextDocumentDiffItem(original, modified, { accessibilitySupport: 'off' }), { dispose() { } }));
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
		await viewModel.waitForDiffOr1s();
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
	}));
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
