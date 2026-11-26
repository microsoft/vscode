/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Dimension, getWindow } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DeferredPromise, installFakeRunWhenIdle, timeout } from '../../../../base/common/async.js';
import { Emitter, Event, ValueWithChangeEvent } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, waitForState } from '../../../../base/common/observable.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { BaseObservable } from '../../../../base/common/observableInternal/observables/baseObservable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { AccessibilitySupport } from '../../../../platform/accessibility/common/accessibility.js';
import { IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IActionViewItemService, NullActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuService } from '../../../../platform/actions/common/actions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { emptyProgressRunner, IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../platform/userInteraction/browser/userInteractionService.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { IDiffProviderFactoryService } from '../../../browser/widget/diffEditor/diffProviderFactoryService.js';
import { DiffEditorWidget } from '../../../browser/widget/diffEditor/diffEditorWidget.js';
import { RefCounted } from '../../../browser/widget/diffEditor/utils.js';
import { DiffItemSource, IDocumentDiffItem, IMultiDiffEditorModel } from '../../../browser/widget/multiDiffEditor/model.js';
import { getMultiDiffEditorVariantConfiguration, multiDiffEditorVariants } from '../../../browser/widget/multiDiffEditor/multiDiffEditorOptions.js';
import { MultiDiffEditorWidget } from '../../../browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IWorkbenchUIElementFactory } from '../../../browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { EditorOption, IDiffEditorOptions } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { IDocumentDiff, IDocumentDiffProvider } from '../../../common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../common/diff/rangeMapping.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { MULTI_DIFF_EDITOR_SYNC_SPLIT_VIEW_SETTING } from '../../../common/multiDiffEditor.js';
import { instantiateTextModel } from '../../common/testTextModel.js';
import { TestDiffProviderFactoryService } from '../diff/testDiffProviderFactoryService.js';
import { createCodeEditorServices } from '../testCodeEditor.js';

suite('MultiDiffEditorWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		// Unlike test editors, the editors of a multi diff editor have every registered editor contribution, and create most
		// of them when the window is idle. A run of all test files registers workbench contributions too, which need services
		// that these tests do not provide.
		disposables.add(installFakeRunWhenIdle(() => Disposable.None));
	});

	teardown(() => {
		sinon.restore();
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
			original: new DiffItemSource(originalUri, original),
			modified: new DiffItemSource(modifiedUri, modified),
			get options() {
				return hideOriginalLineNumbers === undefined ? {} : { hideOriginalLineNumbers };
			},
			onOptionsDidChange: optionsChanged.event,
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
		await waitForState(viewModel.items, items => items.length === 1);
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
		const documentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			original: new DiffItemSource(originalUri, original),
			modified: new DiffItemSource(modifiedUri, modified),
		}, { dispose() { } });
		const secondOriginalUri = URI.parse('inmemory://original/variant-switch-second.js');
		const secondModifiedUri = URI.parse('inmemory://modified/variant-switch-second.js');
		const secondOriginal = disposables.add(instantiateTextModel(instantiationService, 'const second = 1;', undefined, undefined, secondOriginalUri));
		const secondModified = disposables.add(instantiateTextModel(instantiationService, 'const second = 2;', undefined, undefined, secondModifiedUri));
		const secondDocumentItem = RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			original: new DiffItemSource(secondOriginalUri, secondOriginal),
			modified: new DiffItemSource(secondModifiedUri, secondModified),
		}, { dispose() { } });
		const widget = disposables.add(instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			{ variant: 'noCards' },
		));
		widget.setRenderSideBySide(false);
		widget.layout(new Dimension(800, 80));
		const viewModel = disposables.add(widget.createViewModel({ documents: ValueWithChangeEvent.const([documentItem, secondDocumentItem]) }));
		await waitForState(viewModel.items, items => items.length === 2);
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
		const firstItem = disposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			original: new DiffItemSource(originalUri, undefined),
			modified: new DiffItemSource(modifiedUri, undefined),
		}, { dispose() { } }));
		const secondItem = disposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			original: new DiffItemSource(URI.parse('inmemory://original/second.png'), undefined),
			modified: new DiffItemSource(URI.parse('inmemory://modified/second.png'), undefined),
		}, { dispose() { } }));
		const container = document.createElement('div');
		const widget = disposables.add(instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			{ variant: 'noCardsNonCompact' },
		));
		widget.layout(new Dimension(800, 80));
		const viewModel = disposables.add(widget.createViewModel({ documents: ValueWithChangeEvent.const([firstItem, secondItem]) }));
		await waitForState(viewModel.items, items => items.length === 2);
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

	/**
	 * Shows a file below a small one in a widget of 800x300 pixels, and scrolls to the file. Their diffs are computed
	 * before, unless the caller computes them later.
	 */
	async function showFileBelowAnother(originalContent: string, modifiedContent: string, options: { readonly renderSideBySide?: boolean; readonly diffWordWrap?: 'on' | 'off'; readonly editorOptions?: IDiffEditorOptions; readonly computeDiffsLater?: boolean; readonly withoutInnerChanges?: boolean } = {}) {
		const diffProviderFactory = new DelayedDiffProviderFactoryService(options.withoutInnerChanges);
		const services = new ServiceCollection();
		services.set(IAccessibilitySignalService, new class extends mock<IAccessibilitySignalService>() { }());
		services.set(IActionViewItemService, new NullActionViewItemService());
		services.set(IEditorProgressService, new class extends mock<IEditorProgressService>() {
			override show() { return emptyProgressRunner; }
		}());
		services.set(IDiffProviderFactoryService, diffProviderFactory);
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
		const models = [['a\nb', 'a\nc'], [originalContent, modifiedContent]].map(([original, modified], index) => [
			instantiateTextModel(instantiationService, original, undefined, undefined, URI.parse(`inmemory://original/${index}.js`)),
			instantiateTextModel(instantiationService, modified, undefined, undefined, URI.parse(`inmemory://modified/${index}.js`)),
		]);
		const documentItems = models.map(([original, modified]) => disposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			original: new DiffItemSource(original.uri, original),
			modified: new DiffItemSource(modified.uri, modified),
			options: options.editorOptions,
		}, { dispose() { } })));
		const widget = instantiationService.createInstance(MultiDiffEditorWidget, container, {} satisfies IWorkbenchUIElementFactory, { variant: 'noCardsNonCompact' });
		if (options.renderSideBySide !== undefined) {
			widget.setRenderSideBySide(options.renderSideBySide);
		}
		if (options.diffWordWrap) {
			widget.setDiffWordWrap(options.diffWordWrap);
		}
		widget.layout(new Dimension(800, 300));
		const documents = new ValueWithChangeEvent<readonly RefCounted<IDocumentDiffItem>[]>(documentItems);
		const viewModel = widget.createViewModel({ documents });
		disposables.add(toDisposable(() => {
			widget.dispose();
			viewModel.dispose();
			models.flat().forEach(model => model.dispose());
		}));
		const computeDiffs = async () => {
			diffProviderFactory.computeDiffs();
			await waitForState(viewModel.items, items => items.length === 2);
			for (const item of viewModel.items.get()) {
				await waitForState(item.diffEditorViewModel.isDiffUpToDate, value => value);
			}
		};
		if (options.computeDiffsLater) {
			// A view model shows its items without their diffs after a second.
			await waitForState(viewModel.items, items => items.length === 2);
		} else {
			await computeDiffs();
		}
		widget.setViewModel(viewModel);
		const resource = { original: models[1][0].uri, modified: models[1][1].uri };
		widget.reveal(resource, { highlight: false });
		await waitForState(widget.getLayoutDebugState(), state => state.items[1]?.hasTemplate === true);
		return { widget, resource, computeDiffs, documents };
	}

	/** Returns whether a position is in the visible part of an editor's content. */
	function isVisible(editor: ICodeEditor, position: Position): boolean {
		const left = editor.getOffsetForColumn(position.lineNumber, position.column);
		return editor.getVisibleRanges().some(range => range.containsPosition(position))
			&& editor.getScrollLeft() <= left && left <= editor.getScrollLeft() + editor.getLayoutInfo().contentWidth;
	}

	/** Returns the ranges that reveals highlight in an editor. */
	function getHighlights(editor: ICodeEditor): Range[] {
		return editor.getModel()!.getAllDecorations().filter(decoration => decoration.options.description === 'symbol-navigate-action-highlight').map(decoration => decoration.range);
	}

	test('reveals a range far into a file by scrolling the list, so that later layouts keep it visible', async () => {
		// Every third line changes, so that no unchanged region is hidden and the file is much taller than the viewport.
		const lines = Array.from({ length: 400 }, (_, index) => `line ${index + 1}`);
		const { widget, resource } = await showFileBelowAnother(lines.join('\n'), lines.map((line, index) => index % 3 === 0 ? `changed ${index + 1}` : line).join('\n'));

		try {
			const itemTop = widget.getViewState().scrollState.top;
			const editor = widget.tryGetCodeEditor(resource.modified)!.editor;
			const showsLine = () => editor.getVisibleRanges().some(range => range.startLineNumber <= 301 && 301 <= range.endLineNumber);
			const before = showsLine();
			widget.reveal(resource, { range: new Range(301, 1, 301, 1), side: 'modified', highlight: false });
			const scrolledList = widget.getViewState().scrollState.top > itemTop;
			const after = showsLine();
			widget.layout(new Dimension(800, 301));

			assert.deepStrictEqual({ before, scrolledList, after, afterLayout: showsLine() }, { before: false, scrolledList: true, after: true, afterLayout: true });
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('reveals the row of a wrapped line that shows the range', async () => {
		const lines = Array.from({ length: 400 }, (_, index) => `line ${index + 1}`);
		const modifiedLines = lines.map((line, index) => index % 3 === 0 ? `changed ${index + 1}` : line);
		modifiedLines[300] = Array.from({ length: 500 }, (_, index) => `word${index}`).join(' ');
		const { widget, resource } = await showFileBelowAnother(lines.join('\n'), modifiedLines.join('\n'), { renderSideBySide: true, diffWordWrap: 'on' });

		try {
			const editor = widget.tryGetCodeEditor(resource.modified)!.editor;
			const end = new Position(301, modifiedLines[300].length + 1);
			widget.reveal(resource, { range: Range.fromPositions(end), side: 'modified', highlight: false });

			assert.deepStrictEqual({
				endIsScreensBelowLineTop: editor.getTopForPosition(end.lineNumber, end.column) - editor.getTopForLineNumber(end.lineNumber) > 300,
				visible: isVisible(editor, end),
			}, { endIsScreensBelowLineTop: true, visible: true });
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('reveals a range of the original document in the modified editor of an inline diff', async () => {
		const lines = Array.from({ length: 300 }, (_, index) => `line ${index + 1}`);
		const modifiedLines = [
			...Array.from({ length: 200 }, (_, index) => `inserted ${index + 1}`),
			...lines.map((line, index) => index === 149 ? `changed ${index + 1}` : line),
		];
		const { widget, resource } = await showFileBelowAnother(lines.join('\n'), modifiedLines.join('\n'), { renderSideBySide: false });

		try {
			const editor = widget.tryGetCodeEditor(resource.modified)!.editor;
			// Without a side, the range refers to the original document, whose line 150 is line 350 of the modified one.
			widget.reveal(resource, { range: new Range(150, 1, 150, 9), highlight: true });

			assert.deepStrictEqual({ highlights: getHighlights(editor), visible: isVisible(editor, new Position(350, 1)) }, { highlights: [new Range(350, 1, 350, 12)], visible: true });
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('reveals a range once the diff of its file is computed, unless another reveal supersedes it', () => runWithFakedTimers({}, async () => {
		const lines = Array.from({ length: 300 }, (_, index) => `line ${index + 1}`);
		const modifiedLines = [
			...Array.from({ length: 200 }, (_, index) => `inserted ${index + 1}`),
			...lines.map((line, index) => index === 149 || index === 249 ? `changed ${index + 1}` : line),
		];
		const { widget, resource, computeDiffs } = await showFileBelowAnother(lines.join('\n'), modifiedLines.join('\n'), { renderSideBySide: false, computeDiffsLater: true });

		try {
			const editor = widget.tryGetCodeEditor(resource.modified)!.editor;
			// Only the diff tells that the line 150 of the original document is line 350 of the modified one.
			widget.reveal(resource, { range: new Range(250, 1, 250, 9), highlight: true });
			widget.reveal(resource, { range: new Range(150, 1, 150, 9), highlight: true });
			await computeDiffs();
			// The reveal continues after the transaction that sets the diff.
			await timeout(0);

			assert.deepStrictEqual({ highlights: getHighlights(editor), visible: isVisible(editor, new Position(350, 1)) }, { highlights: [new Range(350, 1, 350, 12)], visible: true });
		} finally {
			widget.setViewModel(undefined);
		}
	}));

	test('stops waiting for the diff of a file that is removed while a range in it waits to be revealed', () => runWithFakedTimers({}, async () => {
		const lines = Array.from({ length: 300 }, (_, index) => `line ${index + 1}`);
		const { widget, resource, documents } = await showFileBelowAnother(lines.join('\n'), lines.map((line, index) => index % 3 === 0 ? `changed ${index + 1}` : line).join('\n'), { computeDiffsLater: true });

		try {
			const viewModel = widget.viewModel.get()!;
			const item = viewModel.items.get()[1];
			const isDiffUpToDate = item.diffEditorViewModel.isDiffUpToDate as unknown as BaseObservable<boolean>;
			widget.reveal(resource, { range: new Range(250, 1, 250, 5), highlight: false });
			// The other file becomes the active one without a reveal, as when the user focuses it, so that no reveal follows.
			viewModel.items.get()[0].setIsFocused(constObservable(true), undefined);
			documents.value = [documents.value[0]];
			await waitForState(viewModel.items, items => items.length === 1);
			// The diff view model of the removed file releases its own wait for the diff asynchronously.
			await timeout(0);

			// The diff of a removed file is never computed, so a wait for it would keep the file.
			assert.deepStrictEqual({ isAlive: item.isAlive.get(), observers: isDiffUpToDate.debugGetObservers().size }, { isAlive: false, observers: 0 });
		} finally {
			widget.setViewModel(undefined);
		}
	}));

	test('reveals deleted text of an inline diff in the view zone that shows it', async () => {
		const lines = Array.from({ length: 400 }, (_, index) => `line ${index + 1}`);
		// The modified editor shows the deleted lines 101 to 300 in a view zone, which ends where its line 101 starts.
		const { widget, resource } = await showFileBelowAnother(lines.join('\n'), [...lines.slice(0, 100), ...lines.slice(300)].join('\n'), { renderSideBySide: false });

		try {
			const editor = widget.tryGetCodeEditor(resource.modified)!.editor;
			const lineHeight = editor.getOption(EditorOption.lineHeight);
			const showsDeletedLine = (lineNumber: number) => {
				const top = editor.getTopForLineNumber(101) - (301 - lineNumber) * lineHeight;
				return editor.getScrollTop() <= top && top + lineHeight <= editor.getScrollTop() + editor.getLayoutInfo().height;
			};
			widget.reveal(resource, { range: new Range(150, 1, 150, 9), highlight: false });
			const showsRange = showsDeletedLine(150);
			widget.reveal(resource, { range: Range.fromPositions(new Position(250, 3)), highlight: false });

			assert.deepStrictEqual({ showsRange, showsPosition: showsDeletedLine(250) }, { showsRange: true, showsPosition: true });
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('highlights text next to replaced text of an inline diff without the replacement', async () => {
		const lines = Array.from({ length: 300 }, (_, index) => `line ${index + 1}`);
		const originalLines = [...lines];
		originalLines[149] = 'one foo two';
		const modifiedLines = [...Array.from({ length: 200 }, (_, index) => `inserted ${index + 1}`), ...lines];
		modifiedLines[349] = 'one baz two';
		const { widget, resource } = await showFileBelowAnother(originalLines.join('\n'), modifiedLines.join('\n'), { renderSideBySide: false });

		try {
			const editor = widget.tryGetCodeEditor(resource.modified)!.editor;
			// "one " ends where "foo" starts, which "baz" replaced, and " two" starts where it ends.
			widget.reveal(resource, { range: new Range(150, 1, 150, 5), highlight: true });
			widget.reveal(resource, { range: new Range(150, 8, 150, 12), highlight: true });

			assert.deepStrictEqual(getHighlights(editor), [new Range(350, 1, 350, 5), new Range(350, 8, 350, 12)]);
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('reveals and highlights the modified lines of a change without inner changes in an inline diff, and the rest of a range after them', async () => {
		const lines = Array.from({ length: 300 }, (_, index) => `line ${index + 1}`);
		const modifiedLines = [
			...Array.from({ length: 200 }, (_, index) => `inserted ${index + 1}`),
			...lines.map((line, index) => index === 149 ? `changed ${index + 1}` : line),
		];
		const { widget, resource } = await showFileBelowAnother(lines.join('\n'), modifiedLines.join('\n'), { renderSideBySide: false, withoutInnerChanges: true });

		try {
			const editor = widget.tryGetCodeEditor(resource.modified)!.editor;
			widget.reveal(resource, { range: new Range(150, 1, 150, 9), highlight: true });
			widget.reveal(resource, { range: new Range(150, 1, 152, 5), highlight: true });

			assert.deepStrictEqual({ highlights: getHighlights(editor), visible: isVisible(editor, new Position(350, 1)) }, { highlights: [new Range(350, 1, 351, 1), new Range(350, 1, 352, 5)], visible: true });
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('reveals the row of a wrapped deleted line of an inline diff that shows the range', async () => {
		const lines = Array.from({ length: 400 }, (_, index) => `line ${index + 1}`);
		const originalLines = [...lines];
		originalLines[199] = Array.from({ length: 500 }, (_, index) => `word${index}`).join(' ');
		// Deletes the lines 101 to 300.
		const { widget, resource } = await showFileBelowAnother(originalLines.join('\n'), [...lines.slice(0, 100), ...lines.slice(300)].join('\n'), { renderSideBySide: false, diffWordWrap: 'on' });

		try {
			const editor = widget.tryGetCodeEditor(resource.modified)!.editor;
			const originalEditor = widget.tryGetCodeEditor(resource.original)!.editor;
			widget.reveal(resource, { range: Range.fromPositions(new Position(200, originalLines[199].length + 1)), highlight: false });
			const lineHeight = editor.getOption(EditorOption.lineHeight);
			// The hidden original editor aligns its lines with the view zone, which shows the last row of line 200 above line 201.
			const top = originalEditor.getTopForLineNumber(201) - lineHeight;

			assert.deepStrictEqual({
				wrapsOverScreens: top - originalEditor.getTopForLineNumber(200) > 300,
				showsRow: editor.getScrollTop() <= top && top + lineHeight <= editor.getScrollTop() + editor.getLayoutInfo().height,
			}, { wrapsOverScreens: true, showsRow: true });
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('reveals deleted and replaced text that a true inline diff shows in the wrapped rows of modified lines', async () => {
		const words = (prefix: string) => Array.from({ length: 300 }, (_, index) => `${prefix}${index}`).join(' ');
		const lines = Array.from({ length: 400 }, (_, index) => `line ${index + 1}`);
		const originalLines = [...lines];
		originalLines[149] = words('a');
		originalLines[150] = words('b');
		originalLines[151] = `keep ${words('c')} keep`;
		originalLines[152] = `keep ${words('d')} keep`;
		const modifiedLines = [...lines];
		// The changed words of the long lines 150 and 151 make them one change with line 152, whose words are deleted, and
		// line 153, whose words are replaced.
		modifiedLines[149] = words('a').replace('a5 ', 'x5 ');
		modifiedLines[150] = words('b').replace('b5 ', 'y5 ');
		modifiedLines[151] = 'keep keep';
		modifiedLines[152] = 'keep ZZZ keep';
		const { widget, resource } = await showFileBelowAnother(originalLines.join('\n'), modifiedLines.join('\n'), { renderSideBySide: false, diffWordWrap: 'on', editorOptions: { experimental: { useTrueInlineView: true } } });

		try {
			const editor = widget.tryGetCodeEditor(resource.modified)!.editor;
			// The modified editor shows the deleted words in front of the text after them, where a word far into them is rows below their start.
			const revealsWord = (lineNumber: number, word: string) => {
				const column = originalLines[lineNumber - 1].indexOf(word) + 1;
				widget.reveal(resource, { range: new Range(lineNumber, column, lineNumber, column + word.length), highlight: false });
				editor.render(true);
				return [...editor.getDomNode()!.querySelectorAll('.view-line')].some(line => line.textContent?.includes(word));
			};

			assert.deepStrictEqual({
				deleted: revealsWord(152, 'c250'),
				replaced: revealsWord(153, 'd250'),
			}, { deleted: true, replaced: true });
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('reveals text that a true inline diff shows after wrapped deleted text', async () => {
		const words = (prefix: string) => Array.from({ length: 300 }, (_, index) => `${prefix}${index}`).join(' ');
		const lines = Array.from({ length: 400 }, (_, index) => `line ${index + 1}`);
		const originalLines = [...lines];
		originalLines[151] = `keep(${words('c')})after`;
		originalLines[251] = `keep(${words('d')})rest`;
		const modifiedLines = [...lines];
		// The words of line 152 are deleted, and those of line 252 replaced.
		modifiedLines[151] = 'keep()after';
		modifiedLines[251] = 'keep(ZZZ)rest';
		const { widget, resource } = await showFileBelowAnother(originalLines.join('\n'), modifiedLines.join('\n'), { renderSideBySide: false, diffWordWrap: 'on', editorOptions: { experimental: { useTrueInlineView: true } } });

		try {
			const editor = widget.tryGetCodeEditor(resource.modified)!.editor;
			// The modified editor shows the deleted words in front of the text after them, which starts rows below them.
			const revealsText = (lineNumber: number, text: string, side: 'original' | 'modified', shownText: string) => {
				const column = (side === 'original' ? originalLines : modifiedLines)[lineNumber - 1].indexOf(text) + 1;
				widget.reveal(resource, { range: new Range(lineNumber, column, lineNumber, column + text.length), side, highlight: false });
				editor.render(true);
				return [...editor.getDomNode()!.querySelectorAll('.view-line')].some(line => line.textContent?.includes(shownText));
			};

			assert.deepStrictEqual({
				textAfterDeletedText: revealsText(152, ')after', 'original', 'after'),
				replacement: revealsText(252, 'ZZZ', 'modified', 'ZZZ'),
			}, { textAfterDeletedText: true, replacement: true });
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('expands a collapsed file to reveal a range in it', async () => {
		const lines = Array.from({ length: 400 }, (_, index) => `line ${index + 1}`);
		const { widget, resource } = await showFileBelowAnother(lines.join('\n'), lines.map((line, index) => index % 3 === 0 ? `changed ${index + 1}` : line).join('\n'));

		try {
			const item = widget.viewModel.get()!.items.get()[1];
			item.collapsed.set(true, undefined);
			widget.reveal(resource, { range: new Range(301, 1, 301, 1), side: 'modified', highlight: false });

			assert.deepStrictEqual({
				collapsed: item.collapsed.get(),
				visible: isVisible(widget.tryGetCodeEditor(resource.modified)!.editor, new Position(301, 1)),
			}, { collapsed: false, visible: true });
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('reveals a range beyond the right edge by scrolling all files horizontally, and keeps the editor where the list scrolled it', async () => {
		const lines = Array.from({ length: 400 }, (_, index) => `line ${index + 1}`);
		const originalLines = [...lines];
		originalLines[300] = Array.from({ length: 100 }, (_, index) => `word${index}`).join(' ');
		// Surrounding lines make the editor's own reveal scroll vertically.
		const { widget, resource } = await showFileBelowAnother(originalLines.join('\n'), lines.map((line, index) => index % 3 === 0 ? `changed ${index + 1}` : line).join('\n'), { renderSideBySide: true, diffWordWrap: 'off', editorOptions: { cursorSurroundingLines: 10 } });

		try {
			const editor = widget.tryGetCodeEditor(resource.original)!.editor;
			const end = new Position(301, originalLines[300].length + 1);
			const range = new Range(301, end.column - 5, 301, end.column);
			widget.reveal(resource, { range, highlight: false });
			const scrollTop = editor.getScrollTop();
			const sharesScrollLeft = widget.getViewState().scrollState.left === editor.getScrollLeft();
			const visible = isVisible(editor, end);
			// Revealing the range again neither scrolls the list nor widens the editor, either of which would render the list.
			widget.reveal(resource, { range, highlight: false });

			assert.deepStrictEqual({ sharesScrollLeft, visible, keepsScrollTop: editor.getScrollTop() === scrollTop }, { sharesScrollLeft: true, visible: true, keepsScrollTop: true });
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
		const names = ['first', 'second', 'third'];
		const documentItems = names.map(name => disposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			original: new DiffItemSource(URI.parse(`inmemory://original/${name}.png`), undefined),
			modified: new DiffItemSource(URI.parse(`inmemory://modified/${name}.png`), undefined),
		}, { dispose() { } })));
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
		widget.reveal({ original: documentItems[1].object.original!.uri, modified: documentItems[1].object.modified!.uri }, { highlight: false });
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
		viewModel.items.get()[0].lastTemplateData.set({ expandedContentHeight: 2000, selections: undefined, splitViewRatio: undefined }, undefined);
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

	test('restores the diff at the top of the viewport into a new view model of changed files', () => runWithFakedTimers({}, async () => {
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
		const createDocuments = (snapshot: string, names: readonly string[]) => names.map(name => {
			const originalUri = URI.parse(`inmemory://${snapshot}/original/${name}`);
			const modifiedUri = URI.parse(`inmemory://${snapshot}/modified/${name}`);
			const original = disposables.add(instantiateTextModel(instantiationService, '', undefined, undefined, originalUri));
			const modified = disposables.add(instantiateTextModel(instantiationService, 'const value = 1;', undefined, undefined, modifiedUri));
			return RefCounted.createOfNonDisposable<IDocumentDiffItem>({
				original: new DiffItemSource(originalUri, original),
				modified: new DiffItemSource(modifiedUri, modified),
				options: { accessibilitySupport: 'off' },
				key: name,
			}, { dispose() { } });
		});
		const shownDocuments = createDocuments('first', ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js']);
		const restoredDocuments = createDocuments('second', ['b.js', 'c.js', 'd.js', 'e.js', 'f.js']);
		const container = document.createElement('div');
		const widget = instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			{ variant: 'noCardsNonCompact' },
		);
		widget.layout(new Dimension(800, 200));
		const createViewModel = async (documents: readonly RefCounted<IDocumentDiffItem>[]) => {
			const viewModel = widget.createViewModel({ documents: ValueWithChangeEvent.const(documents) });
			await waitForState(viewModel.items, items => items.length === documents.length);
			return viewModel;
		};
		const describeViewport = () => {
			const state = widget.getLayoutDebugState().get();
			const top = state.items.find(item => item.layout.visibility === 'visible')!;
			return {
				top: top.modifiedUri,
				offset: state.layout.contentViewport.start - top.layout.contentRange.start,
				collapsed: state.items.filter(item => item.collapsed).map(item => item.modifiedUri),
				active: widget.viewModel.get()?.activeDiffItem.get()?.modifiedUri?.toString(),
			};
		};

		const shownViewModel = await createViewModel(shownDocuments);
		// Smaller than the estimated height of diffs that were not rendered yet.
		for (const item of shownViewModel.items.get()) {
			item.lastTemplateData.set({ expandedContentHeight: 100, selections: undefined, splitViewRatio: undefined }, undefined);
		}
		const restoredViewModel = await createViewModel(restoredDocuments);
		try {
			widget.setViewModel(shownViewModel);
			shownViewModel.items.get()[1].collapsed.set(true, undefined);
			widget.reveal({ original: shownDocuments[3].object.original!.uri, modified: shownDocuments[3].object.modified!.uri }, { highlight: false });
			widget.setViewState({ scrollState: { top: widget.getViewState().scrollState.top + 30, left: 0 } });
			const shown = describeViewport();
			const viewState = widget.getViewState();

			widget.setViewModel(undefined);
			widget.setViewModel(restoredViewModel, { viewState });

			assert.deepStrictEqual({ shown, restored: describeViewport() }, {
				shown: { top: 'inmemory://first/modified/d.js', offset: 30, collapsed: ['inmemory://first/modified/b.js'], active: 'inmemory://first/modified/d.js' },
				restored: { top: 'inmemory://second/modified/d.js', offset: 30, collapsed: ['inmemory://second/modified/b.js'], active: 'inmemory://second/modified/d.js' },
			});
		} finally {
			widget.setViewModel(undefined);
			shownViewModel.dispose();
			restoredViewModel.dispose();
			widget.dispose();
			for (const documentItem of [...shownDocuments, ...restoredDocuments]) {
				documentItem.dispose();
			}
		}
	}));

	test('keeps the split view ratio with its file when templates are recycled', () => runWithFakedTimers({}, async () => {
		const services = new ServiceCollection();
		services.set(IConfigurationService, new TestConfigurationService({ [MULTI_DIFF_EDITOR_SYNC_SPLIT_VIEW_SETTING]: false }));
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
		const resources: { original: URI; modified: URI }[] = [];
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
			resources.push({ original: originalUri, modified: modifiedUri });
		}
		const container = document.createElement('div');
		const widget = instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			{ variant: 'noCardsNonCompact' },
		);
		// Each item is taller than the viewport, so revealing an item releases the template of the previous one.
		widget.layout(new Dimension(1200, 200));
		const viewModel = widget.createViewModel({ documents: ValueWithChangeEvent.const(documentItems) });
		await waitForState(viewModel.items, items => items.length === documentItems.length);
		widget.setViewModel(viewModel);
		const revealEditor = (index: number) => {
			widget.reveal(resources[index], { highlight: false });
			return widget.getActiveControl()!;
		};

		try {
			const firstEditor = revealEditor(0);
			firstEditor.setSplitViewRatio(0.3);
			const lastEditor = revealEditor(2);
			const lastItemRatio = lastEditor.getSplitViewRatio();
			const restoredFirstItemRatio = revealEditor(0).getSplitViewRatio();

			assert.deepStrictEqual({
				recycledTemplate: lastEditor === firstEditor,
				lastItemRatio,
				restoredFirstItemRatio,
			}, {
				recycledTemplate: true,
				lastItemRatio: undefined,
				restoredFirstItemRatio: 0.3,
			});
		} finally {
			widget.setViewModel(undefined);
			viewModel.dispose();
			widget.dispose();
			for (const documentItem of documentItems) {
				documentItem.dispose();
			}
		}
	}));

	test('resizes the split of all files together while it is synced', () => runWithFakedTimers({}, async () => {
		const configurationService = new TestConfigurationService({ [MULTI_DIFF_EDITOR_SYNC_SPLIT_VIEW_SETTING]: false });
		const setSynced = (synced: boolean) => {
			configurationService.setUserConfiguration(MULTI_DIFF_EDITOR_SYNC_SPLIT_VIEW_SETTING, synced);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([MULTI_DIFF_EDITOR_SYNC_SPLIT_VIEW_SETTING]),
				change: { keys: [MULTI_DIFF_EDITOR_SYNC_SPLIT_VIEW_SETTING], overrides: [] },
				affectsConfiguration: key => key === MULTI_DIFF_EDITOR_SYNC_SPLIT_VIEW_SETTING,
			});
		};
		const services = new ServiceCollection();
		services.set(IConfigurationService, configurationService);
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
		const resources: { original: URI; modified: URI }[] = [];
		for (let index = 0; index < 4; index++) {
			const originalUri = URI.parse(`inmemory://original/test-${index}.js`);
			const modifiedUri = URI.parse(`inmemory://modified/test-${index}.js`);
			const original = disposables.add(instantiateTextModel(instantiationService, '', undefined, undefined, originalUri));
			const modified = disposables.add(instantiateTextModel(instantiationService, 'const value = 1;', undefined, undefined, modifiedUri));
			documentItems.push(RefCounted.createOfNonDisposable<IDocumentDiffItem>({
				original: new DiffItemSource(originalUri, original),
				modified: new DiffItemSource(modifiedUri, modified),
				options: { accessibilitySupport: 'off' },
			}, { dispose() { } }));
			resources.push({ original: originalUri, modified: modifiedUri });
		}
		const container = document.createElement('div');
		const widget = instantiationService.createInstance(
			MultiDiffEditorWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			{ variant: 'noCardsNonCompact' },
		);
		// Two of the four 500px high files fit into the viewport.
		widget.layout(new Dimension(1200, 800));
		const viewModel = widget.createViewModel({ documents: ValueWithChangeEvent.const(documentItems) });
		await waitForState(viewModel.items, items => items.length === documentItems.length);
		widget.setViewModel(viewModel);
		const ratios = () => resources.map(resource => {
			const editor = widget.tryGetCodeEditor(resource.modified)?.diffEditor;
			if (!(editor instanceof DiffEditorWidget)) {
				return 'not rendered';
			}
			const ratio = editor.getSplitViewRatio();
			return ratio === undefined ? 'default' : Math.round(ratio * 100) / 100;
		});
		const dragSash = (index: number, deltaX: number) => {
			const editor = widget.tryGetCodeEditor(resources[index].modified)?.diffEditor;
			assert.ok(editor instanceof DiffEditorWidget);
			const sash = editor.getContainerDomNode().querySelector('.monaco-sash.vertical')!;
			const targetWindow = getWindow(sash);
			sash.dispatchEvent(new MouseEvent('mousedown', { clientX: 600 }));
			targetWindow.dispatchEvent(new MouseEvent('mousemove', { clientX: 600 + deltaX }));
			targetWindow.dispatchEvent(new MouseEvent('mouseup', { clientX: 600 + deltaX }));
		};

		try {
			widget.reveal(resources[0], { highlight: false });
			dragSash(0, -240);
			const notSynced = ratios();
			setSynced(true);
			const syncedToLastResize = ratios();
			dragSash(1, 120);
			const resizedTogether = ratios();
			widget.reveal(resources[3], { highlight: false });
			const revealedWhileSynced = ratios();
			setSynced(false);
			dragSash(3, -120);
			const resizedAlone = ratios();
			widget.reveal(resources[0], { highlight: false });
			const revealedAfterSyncing = ratios();
			// Syncing is turned off while the files are detached, such as while another editor is active.
			setSynced(true);
			widget.setViewModel(undefined);
			setSynced(false);
			widget.setViewModel(viewModel);
			widget.reveal(resources[3], { highlight: false });
			const turnedOffWhileDetached = ratios();

			assert.deepStrictEqual({ notSynced, syncedToLastResize, resizedTogether, revealedWhileSynced, resizedAlone, revealedAfterSyncing, turnedOffWhileDetached }, {
				notSynced: [0.3, 'default', 'not rendered', 'not rendered'],
				syncedToLastResize: [0.3, 0.3, 'not rendered', 'not rendered'],
				resizedTogether: [0.4, 0.4, 'not rendered', 'not rendered'],
				revealedWhileSynced: ['not rendered', 'not rendered', 0.4, 0.4],
				resizedAlone: ['not rendered', 'not rendered', 0.4, 0.3],
				revealedAfterSyncing: [0.4, 0.4, 'not rendered', 'not rendered'],
				turnedOffWhileDetached: ['not rendered', 'not rendered', 0.3, 0.3],
			});
		} finally {
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

/** Computes diffs like {@link TestDiffProviderFactoryService}, once {@link computeDiffs} is called. */
class DelayedDiffProviderFactoryService implements IDiffProviderFactoryService {
	declare readonly _serviceBrand: undefined;

	private readonly _diffProviderFactory = new TestDiffProviderFactoryService();
	private readonly _canComputeDiffs = new DeferredPromise<void>();

	/**
	 * @param _withoutInnerChanges Whether the changes have no inner changes, like the changes of the legacy diff algorithm
	 * that have 20 or more lines on a side.
	 */
	constructor(private readonly _withoutInnerChanges = false) { }

	computeDiffs(): void {
		this._canComputeDiffs.complete();
	}

	createDiffProvider(): IDocumentDiffProvider {
		const diffProvider = this._diffProviderFactory.createDiffProvider();
		return {
			onDidChange: diffProvider.onDidChange,
			computeDiff: async (original, modified, options, cancellationToken) => {
				await this._canComputeDiffs.p;
				const diff = await diffProvider.computeDiff(original, modified, options, cancellationToken);
				return this._withoutInnerChanges ? { ...diff, changes: diff.changes.map(change => new DetailedLineRangeMapping(change.original, change.modified, undefined)) } : diff;
			},
		};
	}
}
