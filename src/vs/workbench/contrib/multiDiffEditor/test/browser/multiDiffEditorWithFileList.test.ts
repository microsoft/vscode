/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../../base/browser/dom.js';
import { Emitter, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord, ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDiffProviderFactoryService } from '../../../../../editor/browser/widget/diffEditor/diffProviderFactoryService.js';
import { RefCounted } from '../../../../../editor/browser/widget/diffEditor/utils.js';
import { DiffItemSource, IDocumentDiffItem } from '../../../../../editor/browser/widget/multiDiffEditor/model.js';
import { IWorkbenchUIElementFactory } from '../../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { InMemoryTextModelService } from '../../../../../editor/common/services/inMemoryTextModelService.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { TestDiffProviderFactoryService } from '../../../../../editor/test/browser/diff/testDiffProviderFactoryService.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../platform/userInteraction/browser/userInteractionService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../../accessibility/common/accessibilityCommands.js';
import { MultiDiffEditor } from '../../browser/multiDiffEditor.js';
import { MultiDiffEditorWithFileListWidget } from '../../browser/multiDiffEditorWithFileListWidget.js';
import { MultiDiffEditorFileListAvailableContext, MultiDiffEditorFileListPosition, MultiDiffEditorFileListViewMode, MultiDiffEditorFileListVisibleContext, multiDiffEditorExperimentalFileListSetting } from '../../common/multiDiffEditor.js';

class TestMultiDiffEditor extends MultiDiffEditor {
	override createEditor(parent: HTMLElement): void {
		super.createEditor(parent);
	}
}

suite('MultiDiffEditorWithFileListWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IDiffProviderFactoryService, new TestDiffProviderFactoryService());
		instantiationService.stub(IEditorProgressService, new class extends mock<IEditorProgressService>() { }());
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService(false));
		// Disposes the synthetic documents of binary items synchronously, like the editor widget tests.
		instantiationService.stub(ITextModelService, instantiationService.createInstance(InMemoryTextModelService));
	});

	function createComposite(fileListVisible: IObservable<boolean>, fileListViewMode: IObservable<MultiDiffEditorFileListViewMode> = constObservable('list'), fileListPosition: IObservable<MultiDiffEditorFileListPosition> = constObservable('right')) {
		const container = document.createElement('div');
		document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const composite = disposables.add(instantiationService.createInstance(
			MultiDiffEditorWithFileListWidget,
			container,
			{} satisfies IWorkbenchUIElementFactory,
			{ variant: 'noCardsNonCompact' },
			fileListVisible,
			fileListViewMode,
			fileListPosition,
		));
		return { container, composite };
	}

	function createBinaryItem(original: URI | undefined, modified: URI | undefined) {
		return disposables.add(RefCounted.createOfNonDisposable<IDocumentDiffItem>({
			original: original ? new DiffItemSource(original, undefined) : undefined,
			modified: modified ? new DiffItemSource(modified, undefined) : undefined,
		}, { dispose() { } }));
	}

	for (const enabled of [false, true]) {
		test(`uses the ${enabled ? 'composite' : 'original'} widget when the experimental setting is ${enabled}`, () => {
			instantiationService.stub(IConfigurationService, new TestConfigurationService({
				[multiDiffEditorExperimentalFileListSetting]: enabled,
			}));
			const container = document.createElement('div');
			document.body.appendChild(container);
			disposables.add(toDisposable(() => container.remove()));
			const editor = disposables.add(instantiationService.createInstance(TestMultiDiffEditor, new TestEditorGroupView(1)));
			editor.createEditor(container);
			editor.layout(new Dimension(1000, 100));
			const contextKeyService = instantiationService.get(IContextKeyService);

			assert.deepStrictEqual({
				hasDiffEditor: container.querySelector('.multiDiffEditor') !== null,
				hasComposite: container.querySelector('.multi-diff-editor-with-file-list') !== null,
				hasFiles: container.querySelector('.multi-diff-editor-with-file-list-files') !== null,
				fileListAvailable: contextKeyService.getContextKeyValue(MultiDiffEditorFileListAvailableContext.key) === true,
				fileListVisible: contextKeyService.getContextKeyValue(MultiDiffEditorFileListVisibleContext.key) === true,
			}, { hasDiffEditor: true, hasComposite: enabled, hasFiles: enabled, fileListAvailable: enabled, fileListVisible: enabled });
		});
	}

	test('lists the files, follows the visible file and reveals opened files', async () => {
		const { container, composite } = createComposite(observableValue('fileListVisible', true));
		const widget = composite.multiDiffEditorWidget;
		composite.layout(new Dimension(1000, 100));
		const documentItems = [
			createBinaryItem(undefined, URI.file('/repo/added.png')),
			createBinaryItem(URI.file('/repo/deleted.png'), undefined),
			createBinaryItem(URI.file('/repo/old.png'), URI.file('/repo/renamed.png')),
			createBinaryItem(URI.from({ scheme: 'original', path: '/repo/modified.png' }), URI.file('/repo/modified.png')),
			createBinaryItem(undefined, URI.file('/repo/$(zap).png')),
		];
		const viewModel = disposables.add(widget.createViewModel({ documents: ValueWithChangeEvent.const(documentItems) }));
		await waitForState(viewModel.items, items => items.length === documentItems.length);
		widget.setViewModel(viewModel, { preserveFocus: true });
		await waitForState(viewModel.isLoading, isLoading => !isLoading);

		const diffRoot = widget.getRootElement();
		const row = (index: number) => container.querySelector<HTMLElement>(`.monaco-list-row[data-index="${index}"]`)!;
		const selectedRows = () => [...container.querySelectorAll<HTMLElement>('.monaco-list-row.selected')].map(r => Number(r.dataset.index));
		const activeFile = () => viewModel.activeDiffItem.get()?.modifiedUri?.path ?? viewModel.activeDiffItem.get()?.originalUri?.path;

		try {
			const rows = [0, 1, 2, 3, 4].map(index => ({
				name: row(index).querySelector('.label-name')?.textContent,
				status: row(index).querySelector('.multi-diff-file-list-item-status')?.textContent,
			}));
			const initialSelection = selectedRows();

			row(2).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
			const afterClick = { selection: selectedRows(), active: activeFile(), focusInDiff: diffRoot.contains(document.activeElement) };

			const deletedItem = viewModel.items.get()[1];
			viewModel.collapse(deletedItem);
			row(1).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
			const afterDoubleClick = { selection: selectedRows(), active: activeFile(), collapsed: deletedItem.collapsed.get(), focusInDiff: diffRoot.contains(document.activeElement) };

			assert.deepStrictEqual({ rows, initialSelection, afterClick, afterDoubleClick }, {
				rows: [
					{ name: 'added.png', status: 'A' },
					{ name: 'deleted.png', status: 'D' },
					{ name: 'renamed.png', status: 'R' },
					{ name: 'modified.png', status: 'M' },
					{ name: '$(zap).png', status: 'A' },
				],
				initialSelection: [0],
				afterClick: { selection: [2], active: '/repo/renamed.png', focusInDiff: false },
				afterDoubleClick: { selection: [1], active: '/repo/deleted.png', collapsed: false, focusInDiff: true },
			});
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('tells screen reader users how to open the accessibility help, unless the hint is turned off', async () => {
		const configurationService = new TestConfigurationService({ [AccessibilityVerbositySettingId.MultiDiffEditorFileList]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configurationService);
		let screenReaderOptimized = false;
		const onDidChangeScreenReaderOptimized = disposables.add(new Emitter<void>());
		instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
			override onDidChangeScreenReaderOptimized = onDidChangeScreenReaderOptimized.event;
			override isScreenReaderOptimized(): boolean { return screenReaderOptimized; }
		}());
		let helpKeybinding: ResolvedKeybinding | undefined = undefined;
		const onDidUpdateKeybindings = disposables.add(new Emitter<void>());
		instantiationService.stub(IKeybindingService, new class extends MockKeybindingService {
			override get onDidUpdateKeybindings() { return onDidUpdateKeybindings.event; }
			override lookupKeybinding(commandId: string): ResolvedKeybinding | undefined {
				return commandId === AccessibilityCommandId.OpenAccessibilityHelp ? helpKeybinding : undefined;
			}
		}());
		const { container } = createComposite(constObservable(true));
		const label = () => container.querySelector('.monaco-list')?.getAttribute('aria-label');

		const withoutScreenReader = label();
		screenReaderOptimized = true;
		onDidChangeScreenReaderOptimized.fire();
		const withoutKeybinding = label();
		helpKeybinding = new USLayoutResolvedKeybinding([new KeyCodeChord(false, false, true, false, KeyCode.F1)], OperatingSystem.Windows);
		onDidUpdateKeybindings.fire();
		const withKeybinding = label();
		await configurationService.setUserConfiguration(AccessibilityVerbositySettingId.MultiDiffEditorFileList, false);
		configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(configuration: string): boolean {
				return configuration === AccessibilityVerbositySettingId.MultiDiffEditorFileList;
			}
		}());
		const hintTurnedOff = label();

		assert.deepStrictEqual({ withoutScreenReader, withoutKeybinding, withKeybinding, hintTurnedOff }, {
			withoutScreenReader: 'Changed Files',
			withoutKeybinding: 'Changed Files, run the Open Accessibility Help command for more information',
			withKeybinding: 'Changed Files, use Alt+F1 for accessibility help',
			hintTurnedOff: 'Changed Files',
		});
	});

	test('groups the files into compressed folders in tree mode and switches back to the flat list', async () => {
		const viewMode = observableValue<MultiDiffEditorFileListViewMode>('viewMode', 'tree');
		const { container, composite } = createComposite(constObservable(true), viewMode);
		const widget = composite.multiDiffEditorWidget;
		composite.layout(new Dimension(1000, 300));
		const documentItems = [
			createBinaryItem(URI.file('/repo/src/app/a.png'), URI.file('/repo/src/app/a.png')),
			createBinaryItem(URI.file('/repo/src/app/b.png'), URI.file('/repo/src/app/b.png')),
			createBinaryItem(URI.from({ scheme: 'git', path: '/repo/docs/c.png' }), undefined),
			createBinaryItem(undefined, URI.file('/repo/lib/util/deep/d.png')),
		];
		const viewModel = disposables.add(widget.createViewModel({ documents: ValueWithChangeEvent.const(documentItems) }));
		await waitForState(viewModel.items, items => items.length === documentItems.length);
		widget.setViewModel(viewModel, { preserveFocus: true });
		await waitForState(viewModel.isLoading, isLoading => !isLoading);

		const rowElements = () => [...container.querySelectorAll<HTMLElement>('.monaco-list-row')].sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
		const rows = () => rowElements().map(row => {
			const status = row.querySelector('.multi-diff-file-list-item-status')?.textContent;
			const hasPath = !!row.querySelector('.label-description')?.textContent;
			return [
				row.classList.contains('selected') ? '>' : ' ',
				row.querySelector('.monaco-icon-name-container')?.textContent,
				status ? ` ${status}` : '',
				hasPath ? ' (path)' : '',
			].join('');
		});

		try {
			const tree = rows();
			rowElements().find(row => row.querySelector('.monaco-icon-name-container')?.textContent === 'c.png')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
			const treeAfterClick = rows();
			viewMode.set('list', undefined);
			const list = rows();

			assert.deepStrictEqual({ tree, treeAfterClick, list }, {
				tree: [' src/app', '>a.png M', ' b.png M', ' docs', ' c.png D', ' lib/util/deep', ' d.png A'],
				treeAfterClick: [' src/app', ' a.png M', ' b.png M', ' docs', '>c.png D', ' lib/util/deep', ' d.png A'],
				list: [' a.png M (path)', ' b.png M (path)', '>c.png D (path)', ' d.png A (path)'],
			});
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('starts the tree at the workspace folder so files that share one folder still show it', async () => {
		instantiationService.stub(IWorkspaceContextService, new TestContextService(testWorkspace(URI.file('/repo'))));
		const { container, composite } = createComposite(constObservable(true), constObservable('tree'));
		const widget = composite.multiDiffEditorWidget;
		composite.layout(new Dimension(1000, 300));
		// Like a commit opened from the Source Control Graph, both sides use `git:` URIs.
		const gitUri = (path: string) => URI.from({ scheme: 'git', path, query: JSON.stringify({ path, ref: 'HEAD' }) });
		const documentItems = [
			createBinaryItem(gitUri('/repo/src/app/a.png'), gitUri('/repo/src/app/a.png')),
			createBinaryItem(gitUri('/repo/src/app/b.png'), undefined),
		];
		const viewModel = disposables.add(widget.createViewModel({ documents: ValueWithChangeEvent.const(documentItems) }));
		await waitForState(viewModel.items, items => items.length === documentItems.length);
		widget.setViewModel(viewModel, { preserveFocus: true });
		await waitForState(viewModel.isLoading, isLoading => !isLoading);

		try {
			const rows = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
				.sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
				.map(row => row.querySelector('.monaco-icon-name-container')?.textContent);
			assert.deepStrictEqual(rows, ['src/app', 'a.png', 'b.png']);
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('shows a file and a folder that share a path in tree mode, and selects files in both', async () => {
		const { container, composite } = createComposite(constObservable(true), constObservable('tree'));
		const widget = composite.multiDiffEditorWidget;
		composite.layout(new Dimension(1000, 300));
		const settingsUri = URI.file('/repo/config/settings.json');
		const documentItems = [
			createBinaryItem(URI.file('/repo/config'), undefined),
			createBinaryItem(undefined, settingsUri),
		];
		const viewModel = disposables.add(widget.createViewModel({ documents: ValueWithChangeEvent.const(documentItems) }));
		await waitForState(viewModel.items, items => items.length === documentItems.length);
		widget.setViewModel(viewModel, { preserveFocus: true });
		await waitForState(viewModel.isLoading, isLoading => !isLoading);

		const rows = () => [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
			.sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
			.map(row => {
				const status = row.querySelector('.multi-diff-file-list-item-status')?.textContent;
				return `${row.classList.contains('selected') ? '>' : ' '}${row.querySelector('.monaco-icon-name-container')?.textContent}${status ? ` ${status}` : ''}`;
			});

		try {
			const initial = rows();
			widget.reveal({ original: undefined, modified: settingsUri }, { highlight: false });
			const afterReveal = rows();

			assert.deepStrictEqual({ initial, afterReveal }, {
				initial: ['>config D', ' config', ' settings.json A'],
				afterReveal: [' config D', ' config', '>settings.json A'],
			});
		} finally {
			widget.setViewModel(undefined);
		}
	});

	test('shows the list only when enabled and wide enough, using the stored width', () => {
		const storageService = instantiationService.get(IStorageService);
		const state = ({ container, composite }: ReturnType<typeof createComposite>) => ({
			fileListVisible: composite.isFileListVisible.get(),
			diffWidth: composite.multiDiffEditorWidget.getLayoutDebugState().get().scrollDimensions.width,
			hasList: container.querySelector('.monaco-list') !== null,
		});

		const withDefaultWidth = createComposite(observableValue('fileListVisible', true));
		withDefaultWidth.composite.layout(new Dimension(1000, 100));
		const defaultWidth = state(withDefaultWidth);

		storageService.store(MultiDiffEditorWithFileListWidget.FILE_LIST_WIDTH_STORAGE_KEY, 300, StorageScope.PROFILE, StorageTarget.USER);
		const enabled = observableValue('fileListVisible', false);
		const withStoredWidth = createComposite(enabled);
		withStoredWidth.composite.layout(new Dimension(1000, 100));
		const disabledInitially = state(withStoredWidth);
		enabled.set(true, undefined);
		const afterEnable = state(withStoredWidth);
		withStoredWidth.composite.layout(new Dimension(600, 100));
		const squeezed = state(withStoredWidth);
		withStoredWidth.composite.layout(new Dimension(500, 100));
		const narrow = state(withStoredWidth);
		withStoredWidth.composite.layout(new Dimension(1000, 100));
		const wideAgain = state(withStoredWidth);
		enabled.set(false, undefined);
		const afterDisable = state(withStoredWidth);

		assert.deepStrictEqual({ defaultWidth, disabledInitially, afterEnable, squeezed, narrow, wideAgain, afterDisable }, {
			defaultWidth: { fileListVisible: true, diffWidth: 740, hasList: true },
			disabledInitially: { fileListVisible: false, diffWidth: 1000, hasList: false },
			afterEnable: { fileListVisible: true, diffWidth: 700, hasList: true },
			squeezed: { fileListVisible: true, diffWidth: 400, hasList: true },
			narrow: { fileListVisible: false, diffWidth: 500, hasList: true },
			wideAgain: { fileListVisible: true, diffWidth: 700, hasList: true },
			afterDisable: { fileListVisible: false, diffWidth: 1000, hasList: false },
		});
	});

	test('fits the diffs into editor groups narrower than their minimum width while the list is hidden', () => {
		const enabled = observableValue('fileListVisible', false);
		const { composite } = createComposite(enabled);
		const state = () => ({
			fileListVisible: composite.isFileListVisible.get(),
			diffWidth: composite.multiDiffEditorWidget.getLayoutDebugState().get().scrollDimensions.width,
		});

		composite.layout(new Dimension(300, 100));
		const disabled = state();
		enabled.set(true, undefined);
		const enabledButNarrow = state();
		composite.layout(new Dimension(1000, 100));
		const wide = state();
		composite.layout(new Dimension(300, 100));
		const narrowAgain = state();
		composite.layout(new Dimension(600, 100));
		const squeezed = state();

		assert.deepStrictEqual({ disabled, enabledButNarrow, wide, narrowAgain, squeezed }, {
			disabled: { fileListVisible: false, diffWidth: 300 },
			enabledButNarrow: { fileListVisible: false, diffWidth: 300 },
			wide: { fileListVisible: true, diffWidth: 740 },
			narrowAgain: { fileListVisible: false, diffWidth: 300 },
			squeezed: { fileListVisible: true, diffWidth: 400 },
		});
	});

	test('moves the existing list to either edge, retaining focus and preferred width through hidden layouts', () => {
		instantiationService.get(IStorageService).store(MultiDiffEditorWithFileListWidget.FILE_LIST_WIDTH_STORAGE_KEY, 300, StorageScope.PROFILE, StorageTarget.USER);
		const visible = observableValue('visible', true);
		const position = observableValue<MultiDiffEditorFileListPosition>('position', 'left');
		const { container, composite } = createComposite(visible, constObservable('tree'), position);
		composite.layout(new Dimension(1000, 100));
		const list = container.querySelector('.monaco-list');
		const state = () => ({
			position: container.querySelector('.split-view-view')?.firstElementChild?.classList.contains('multi-diff-editor-with-file-list-files') ? 'left' : 'right',
			visible: composite.isFileListVisible.get(),
			diffWidth: composite.multiDiffEditorWidget.getLayoutDebugState().get().scrollDimensions.width,
		});
		const initiallyLeft = state();
		composite.focusFileList();
		position.set('right', undefined);
		const movedRight = { ...state(), sameList: container.querySelector('.monaco-list') === list, focused: list?.contains(document.activeElement) };
		composite.layout(new Dimension(600, 100));
		position.set('left', undefined);
		const squeezed = state();
		composite.layout(new Dimension(500, 100));
		position.set('right', undefined);
		const narrow = state();
		composite.layout(new Dimension(1000, 100));
		const restored = state();
		visible.set(false, undefined);
		position.set('left', undefined);
		const hidden = state();
		visible.set(true, undefined);
		const shown = state();
		position.set('right', undefined);
		const rightAgain = state();

		assert.deepStrictEqual({ initiallyLeft, movedRight, squeezed, narrow, restored, hidden, shown, rightAgain }, {
			initiallyLeft: { position: 'left', visible: true, diffWidth: 700 },
			movedRight: { position: 'right', visible: true, diffWidth: 700, sameList: true, focused: true },
			squeezed: { position: 'left', visible: true, diffWidth: 400 },
			narrow: { position: 'right', visible: false, diffWidth: 500 },
			restored: { position: 'right', visible: true, diffWidth: 700 },
			hidden: { position: 'left', visible: false, diffWidth: 1000 },
			shown: { position: 'left', visible: true, diffWidth: 700 },
			rightAgain: { position: 'right', visible: true, diffWidth: 700 },
		});
	});
});
