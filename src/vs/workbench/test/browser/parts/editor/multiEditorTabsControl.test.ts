/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import { $, Dimension, EventType, ModifierKeyEmitter, reset, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDnd.js';
import { ITreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDndService.js';
import { IMenu, IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupMenuIds, IEditorGroupsView, IEditorGroupView, IEditorPartsView } from '../../../../browser/parts/editor/editor.js';
import { MultiEditorTabsControl } from '../../../../browser/parts/editor/multiEditorTabsControl.js';
import { MultiRowEditorControl } from '../../../../browser/parts/editor/multiRowEditorTabsControl.js';
import { EditorInputCapabilities, EditorsOrder, IEditorPartOptions, Verbosity } from '../../../../common/editor.js';
import { EditorGroupModel } from '../../../../common/editor/editorGroupModel.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { DecorationsService } from '../../../../services/decorations/browser/decorationsService.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { INotebookDocumentService, NotebookDocumentWorkbenchService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { createEditorPart, TestFileEditorInput, TestHostService, TestMenuService, workbenchInstantiationService } from '../../workbenchTestServices.js';
import '../../../../contrib/modernUI/browser/media/tabs.css';
import '../../../../contrib/modernUI/browser/connectedEditorTabs.js';

suite('MultiEditorTabsControl', () => {

	let disposables: DisposableStore;

	let container: HTMLElement;
	let hostService: TestHostService;
	let control: MultiEditorTabsControl;
	let partOptions: IEditorPartOptions;
	let model: EditorGroupModel;
	let createControl: (menuIds?: IEditorGroupMenuIds) => MultiEditorTabsControl;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let groupView: IEditorGroupView;
	let groupsView: IEditorGroupsView;
	let editorPartsView: IEditorPartsView;
	let addMenuVisible: boolean;
	let addMenuChange: Emitter<void>;

	setup(() => {
		disposables = new DisposableStore();
		partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS };
		addMenuVisible = true;
		addMenuChange = disposables.add(new Emitter<void>());

		// The tabs control resolves the shared modifier key emitter on creation,
		// so dispose it again to keep each test independent of the Alt state that
		// other suites may have left behind
		disposables.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));

		instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(ITreeViewsDnDService, new TreeViewsDnDService());
		instantiationService.stub(INotebookDocumentService, new NotebookDocumentWorkbenchService());

		hostService = instantiationService.get(IHostService) as TestHostService;

		model = disposables.add(instantiationService.createInstance(EditorGroupModel, undefined));
		for (let i = 0; i < 2; i++) {
			const editor = disposables.add(new class extends TestFileEditorInput {
				override getName(): string { return `file${i}.txt`; }
			}(URI.file(`/path/file${i}.txt`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true, active: i === 0 });
		}

		groupView = new class extends mock<IEditorGroupView>() {
			override get id() { return model.id; }
			override get count() { return model.count; }
			override get stickyCount() { return model.stickyCount; }
			override get activeEditor() { return model.activeEditor; }
			override get activeEditorPane() { return undefined; }
			override get selectedEditors() { return model.selectedEditors; }
			override get ariaLabel() { return 'Editor Group 1'; }
			override get groupsView(): IEditorGroupsView { return groupsView; }
			override getEditorByIndex(index: number) { return model.getEditorByIndex(index); }
			override getIndexOfEditor(editor: EditorInput) { return model.indexOf(editor); }
			override getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }) { return model.getEditors(order, options); }
			override isActive(editor: EditorInput) { return model.isActive(editor); }
			override isPinned(editorOrIndex: EditorInput | number) { return model.isPinned(editorOrIndex); }
			override isSticky(editorOrIndex: EditorInput | number) { return model.isSticky(editorOrIndex); }
			override isSelected(editorOrIndex: EditorInput | number) { return model.isSelected(editorOrIndex); }
			override createEditorActions() { return { actions: { primary: [], secondary: [] }, onDidChange: Event.None }; }
			override relayout() { }
			override readonly onDidActiveEditorChange = Event.None;
		};

		groupsView = new class extends mock<IEditorGroupsView>() {
			override get partOptions() { return partOptions; }
			override get activeGroup(): IEditorGroupView { return groupView; }
			override get groups(): IEditorGroupView[] { return [groupView]; }
			override readonly onDidChangeEditorPartOptions = Event.None;
			override readonly onDidVisibilityChange = Event.None;
		};

		editorPartsView = new class extends mock<IEditorPartsView>() {
			override get count() { return 1; }
			override getGroup() { return groupView; }
		};

		container = $('.title.tabs');
		mainWindow.document.body.appendChild(container);

		createControl = menuIds => {
			if (menuIds?.tabsBarAddTab) {
				instantiationService.stub(IMenuService, new class extends TestMenuService {
					override createMenu(id: MenuId): IMenu {
						const menu: IMenu = {
							onDidChange: Event.map(addMenuChange.event, () => ({ menu, isStructuralChange: true, isEnablementChange: false, isToggleChange: false })),
							dispose: () => { },
							getActions: options => addMenuVisible && id === menuIds.tabsBarAddTab ? [['navigation', [
								instantiationService.createInstance(MenuItemAction, { id: 'test.connectedTabs.newEditor', title: 'New Editor' }, undefined, options, undefined, undefined),
							]]] : [],
						};
						return menu;
					}
				}());
			}
			const control = disposables.add(instantiationService.createInstance(MultiEditorTabsControl, container, editorPartsView, groupsView, groupView, model, menuIds, false, false));
			control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
			return control;
		};
		control = createControl();
	});

	teardown(() => {
		container.remove();
		disposables.dispose();
	});

	function tabActions(): string[] {
		return Array.from(container.querySelectorAll('.tabs-container > .tab')).map(tab => {
			const action = tab.querySelector('.tab-actions .action-label');
			if (action?.classList.contains('codicon-close-all')) {
				return 'closeOthers';
			}

			return action?.classList.contains('codicon-close-small') ? 'close' : 'unknown';
		});
	}

	function hoverTab(tabIndex: number): void {
		container.querySelectorAll('.tabs-container > .tab')[tabIndex].dispatchEvent(new MouseEvent(EventType.MOUSE_ENTER));
	}

	function moveMouseOverTabs(altKey: boolean): void {
		container.querySelector('.tabs-container')!.dispatchEvent(new MouseEvent(EventType.MOUSE_MOVE, { altKey, bubbles: true }));
	}

	function mouseDownOnTabAction(tabIndex: number, altKey: boolean): void {
		container.querySelectorAll('.tabs-container > .tab')[tabIndex].querySelector('.tab-actions .action-label')!.dispatchEvent(new MouseEvent(EventType.MOUSE_DOWN, { altKey, bubbles: true, cancelable: true }));
	}

	function alt(pressed: boolean): void {
		mainWindow.dispatchEvent(new KeyboardEvent(pressed ? EventType.KEY_DOWN : EventType.KEY_UP, { key: 'Alt', altKey: pressed }));
	}

	function connectedGroup(): HTMLElement {
		const root = $('.monaco-workbench.modern-ui.modern-ui-tabs.modern-ui-connected-editor-tabs.floating-panels');
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-spacing-size80: 8px; --vscode-spacing-size160: 16px; --vscode-spacing-size200: 20px; --vscode-spacing-size280: 28px; --vscode-strokeThickness: 1px; --vscode-cornerRadius-small: 4px; --vscode-cornerRadius-medium: 6px; --vscode-cornerRadius-large: 8px; --vscode-fontSize-body1: 13px; --vscode-fontWeight-regular: 400;';
		mainWindow.document.body.appendChild(root);
		disposables.add(toDisposable(() => root.remove()));
		const editor = $('.part.editor.editor-tabs-multiple');
		const gridView = $('.monaco-grid-view');
		const content = $('.content');
		const group = $('.editor-group-container.active');
		root.appendChild(gridView);
		gridView.appendChild(editor);
		editor.appendChild(content);
		content.appendChild(group);
		group.appendChild(container);
		return group;
	}

	async function layoutConnectedGroup(group: HTMLElement, width: number, tabsControl: MultiEditorTabsControl | MultiRowEditorControl = control): Promise<void> {
		group.style.width = `${width}px`;
		tabsControl.layout({ container: new Dimension(width, 33), available: new Dimension(width, 300) });
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
	}

	function getTabStrokeStyle(tab: HTMLElement): CSSStyleDeclaration {
		const connectedCap = tab.closest('.modern-ui-connected-editor-tabs') && tab.classList.contains('active') && !tab.classList.contains('connected-tab-upper-row');
		return mainWindow.getComputedStyle(tab.querySelector<HTMLElement>(connectedCap ? '.tab-connected-edge' : '.tab-fill')!);
	}

	function getTabTopAccent(tab: HTMLElement) {
		const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
		const indicator = tab.querySelector<HTMLElement>('.tab-border-top-container')!;
		const insideFill = !!tab.closest('.modern-ui-connected-editor-tabs');
		const surface = insideFill && tab.classList.contains('active') && !tab.classList.contains('connected-tab-upper-row') ? tab.querySelector<HTMLElement>('.tab-connected-edge')! : fill;
		const style = insideFill ? mainWindow.getComputedStyle(surface, '::before') : mainWindow.getComputedStyle(indicator);
		const gradient = insideFill ? mainWindow.getComputedStyle(surface).backgroundImage.match(/^linear-gradient\((?<color>rgba?\([^)]+\)) (?<height>[\d.]+)px,/)?.groups : undefined;
		return {
			style,
			insideFill,
			color: gradient?.color ?? style.backgroundColor,
			visible: !!gradient || style.display !== 'none' && (!insideFill || style.content !== 'none'),
			height: gradient ? Number.parseFloat(gradient.height) : insideFill ? Number.parseFloat(style.height) : indicator.getBoundingClientRect().height,
			topOffset: gradient ? 0 : insideFill
				? Number.parseFloat(mainWindow.getComputedStyle(surface).borderTopWidth) + Number.parseFloat(style.top)
				: indicator.getBoundingClientRect().top - fill.getBoundingClientRect().top,
		};
	}

	test('keeps connected layout current when an Add Tab toolbar follows the editor tabs', async () => {
		const group = connectedGroup();
		group.closest('.monaco-workbench')!.classList.remove('modern-ui');
		const editors = model.getEditors(EditorsOrder.SEQUENTIAL);
		for (const editor of editors) {
			model.closeEditor(editor);
		}
		control.dispose();
		reset(container);
		const menuId = MenuId.for('test.connectedTabs.addTab');
		control = createControl({ tabsBarAddTab: menuId });
		await layoutConnectedGroup(group, 600);
		const emptyHeight = control.getHeight();
		for (const [index, editor] of editors.entries()) {
			model.openEditor(editor, { pinned: true, active: index === 0 });
		}
		control.openEditors(editors);

		const results = [];
		for (const tabHeight of ['default', 'compact'] as const) {
			const oldOptions = partOptions;
			partOptions = { ...partOptions, tabHeight };
			control.updateOptions(oldOptions, partOptions);
			for (const width of [600, 220, 600]) {
				await layoutConnectedGroup(group, width);
				const row = container.querySelector<HTMLElement>('.tabs-and-actions-container')!;
				const addTab = container.querySelector<HTMLElement>('.tabs-bar-add-tab')!;
				const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
				results.push({
					tabHeight,
					width,
					cachedHeight: control.getHeight(),
					renderedHeight: row.offsetHeight,
					visibleEditors: tabs.every(tab => tab.offsetWidth > 0 && !tab.classList.contains('connected-tab-hidden')),
					terminalEditor: tabs.map(tab => tab.classList.contains('connected-tab-last')),
					addTab: {
						visible: !addTab.classList.contains('hidden'),
						isLast: addTab === addTab.parentElement!.lastElementChild,
						terminalEditor: addTab.classList.contains('connected-tab-last'),
						upperRow: addTab.classList.contains('connected-tab-upper-row'),
					},
				});
			}
		}
		assert.deepStrictEqual({ emptyHeight, results }, {
			emptyHeight: 0,
			results: ['default', 'compact'].flatMap(tabHeight => [600, 220, 600].map(width => ({
				tabHeight,
				width,
				cachedHeight: tabHeight === 'compact' ? 23 : 25,
				renderedHeight: tabHeight === 'compact' ? 23 : 25,
				visibleEditors: true,
				terminalEditor: [false, true],
				addTab: { visible: true, isLast: true, terminalEditor: false, upperRow: false },
			}))),
		});
	});

	test('Add Tab spacing matches adjacent tab fill insets without losing the terminal shoulder', async () => {
		const group = connectedGroup();
		control.dispose();
		reset(container);
		control = createControl({ tabsBarAddTab: MenuId.for('test.connectedTabs.addTabSpacing') });
		const results = [];
		for (const { activeIndex, direction } of [0, 1].flatMap(activeIndex => ['ltr', 'rtl'].map(direction => ({ activeIndex, direction })))) {
			group.closest<HTMLElement>('.monaco-workbench')!.dir = direction;
			model.setActive(model.getEditorByIndex(activeIndex)!);
			control.setActive(true);
			control.openEditor(model.activeEditor!);
			for (const width of [500, 300, 500]) {
				await layoutConnectedGroup(group, width);
				const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
				const last = tabs.at(-1)!;
				const fill = last.querySelector<HTMLElement>('.tab-fill')!;
				const button = container.querySelector<HTMLElement>('.tabs-bar-add-tab .action-label')!;
				const lastBounds = last.getBoundingClientRect();
				const fillBounds = fill.getBoundingClientRect();
				results.push({
					activeIndex, direction, width,
					gap: direction === 'rtl' ? fillBounds.left - button.getBoundingClientRect().right : button.getBoundingClientRect().left - fillBounds.right,
					expectedGap: (direction === 'rtl' ? fillBounds.left - lastBounds.left : lastBounds.right - fillBounds.right) + 2,
					terminalMargin: mainWindow.getComputedStyle(last).marginInlineEnd,
					oppositeMargin: mainWindow.getComputedStyle(last).marginInlineStart,
					backplateMatchesButton: Math.abs(Number.parseFloat(mainWindow.getComputedStyle(container.querySelector<HTMLElement>('.tabs-bar-add-tab')!, '::before').width) - button.getBoundingClientRect().width) <= 1 / 32,
					backplateRadius: mainWindow.getComputedStyle(container.querySelector<HTMLElement>('.tabs-bar-add-tab')!, '::before').borderRadius,
					noSquareContainer: mainWindow.getComputedStyle(container.querySelector<HTMLElement>('.tabs-bar-add-tab')!).backgroundColor,
				});
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, gap: result.expectedGap, terminalMargin: '8px', oppositeMargin: '0px', backplateMatchesButton: true, backplateRadius: '4px', noSquareContainer: 'rgba(0, 0, 0, 0)' })));
	});

	test('scrolling tab content is clipped before the rounded sticky Add control', async () => {
		const group = connectedGroup();
		control.dispose();
		reset(container);
		control = createControl({ tabsBarAddTab: MenuId.for('test.connectedTabs.roundedAddOcclusion') });
		const editors = openNamedEditors(['F.ts', 'a-long-inactive-label-that-scrolls-beneath-the-Add-button.ts', 'another-long-inactive-label-that-scrolls-beneath-the-Add-button.ts', 'last.ts']);
		model.openEditor(editors[1], { active: true });
		control.openEditors(editors);
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fit', wrapTabs: false, tabActionReserveSpace: true, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		await layoutConnectedGroup(group, 300);
		const tabs = container.querySelector<HTMLElement>('.tabs-container')!;
		const add = container.querySelector<HTMLElement>('.tabs-bar-add-tab')!;
		const readClipping = (direction: string, zoom: number) => {
			const boundary = direction === 'rtl' ? add.getBoundingClientRect().right + 8 * zoom : add.getBoundingClientRect().left - 8 * zoom;
			const rendered = Array.from(tabs.querySelectorAll<HTMLElement>('.tab'));
			const overlay = container.querySelector<HTMLElement>('.tab-connected-overflow-edge')!;
			const activeFill = tabs.querySelector<HTMLElement>('.tab.active > .tab-fill')!;
			const oppositeShoulder = mainWindow.getComputedStyle(activeFill, direction === 'rtl' ? '::after' : '::before');
			const shoulderWidth = Number.parseFloat(oppositeShoulder.width) * zoom;
			const activeFillBounds = activeFill.getBoundingClientRect();
			const activeVisibleWidth = Math.min(activeFillBounds.right, tabs.getBoundingClientRect().right) - Math.max(activeFillBounds.left, boundary);
			const rtlCapExpected = direction === 'rtl' && activeVisibleWidth > shoulderWidth;
			const oppositeShoulderOutsideViewport = direction === 'rtl'
				? activeFill.getBoundingClientRect().right + shoulderWidth > tabs.getBoundingClientRect().right
				: activeFill.getBoundingClientRect().left - shoulderWidth < tabs.getBoundingClientRect().left;
			return {
				hasClippedTab: rendered.some(tab => direction === 'rtl' ? tab.getBoundingClientRect().left < boundary : tab.getBoundingClientRect().right > boundary),
				hasClippedActive: rendered.some(tab => tab.classList.contains('active') && (direction === 'rtl' ? tab.getBoundingClientRect().left < boundary : tab.getBoundingClientRect().right > boundary)),
				rtlCapAtBoundary: direction !== 'rtl' || (rtlCapExpected
					? Math.abs(overlay.getBoundingClientRect().left - boundary) < 1 / 32
					: !overlay.classList.contains('connected-tab-left-clipped')),
				oppositeShoulderPresentWhenVisible: oppositeShoulderOutsideViewport || oppositeShoulder.content === '""',
				matchingClip: rendered.every(tab => {
					const expected = Math.max(0, (direction === 'rtl' ? boundary - tab.getBoundingClientRect().left : tab.getBoundingClientRect().right - boundary) / zoom);
					const match = mainWindow.getComputedStyle(tab).clipPath.match(direction === 'rtl' ? /^inset\(-1px -8px -1px ([\d.]+)px\)$/ : /^inset\(-1px ([\d.]+)px -1px -8px\)$/);
					return expected < 1 / 32 ? !tab.style.clipPath || !!match && Number.parseFloat(match[1]) < 1 / 32 : !!match && Math.abs(Number.parseFloat(match[1]) - expected) < 1 / 32;
				}),
			};
		};
		const results = [];
		for (const direction of ['ltr', 'rtl']) {
			for (const zoom of [1, 1.25]) {
				const root = group.closest<HTMLElement>('.monaco-workbench')!;
				root.dir = direction;
				root.style.zoom = String(zoom);
				await layoutConnectedGroup(group, 300);
				tabs.classList.add('scroll');
				tabs.scrollLeft = 0;
				tabs.dispatchEvent(new mainWindow.Event(EventType.SCROLL));
				const resting = readClipping(direction, zoom);
				tabs.scrollLeft = direction === 'rtl' ? -90 : 90;
				tabs.dispatchEvent(new mainWindow.Event(EventType.SCROLL));
				results.push({ direction, zoom, resting, scrolled: readClipping(direction, zoom) });
			}
		}
		const previousOptions = partOptions;
		addMenuVisible = false;
		addMenuChange.fire();
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
		const hiddenAddClippingCleared = Array.from(tabs.querySelectorAll<HTMLElement>('.tab')).every(tab => !tab.style.clipPath);
		addMenuVisible = true;
		addMenuChange.fire();
		partOptions = { ...partOptions, wrapTabs: true };
		control.updateOptions(previousOptions, partOptions);
		await layoutConnectedGroup(group, 300);
		assert.deepStrictEqual({
			results, hiddenAddClippingCleared,
			wrappedClippingCleared: Array.from(tabs.querySelectorAll<HTMLElement>('.tab')).every(tab => !tab.style.clipPath),
		}, {
			results: results.map(result => ({ ...result, resting: { hasClippedTab: true, hasClippedActive: true, rtlCapAtBoundary: true, oppositeShoulderPresentWhenVisible: true, matchingClip: true }, scrolled: { hasClippedTab: true, hasClippedActive: true, rtlCapAtBoundary: true, oppositeShoulderPresentWhenVisible: true, matchingClip: true } })),
			hiddenAddClippingCleared: true,
			wrappedClippingCleared: true,
		});
	});

	test('scrolling Add clipping reads every tab before changing clip styles', async () => {
		const group = connectedGroup();
		control.dispose();
		reset(container);
		control = createControl({ tabsBarAddTab: MenuId.for('test.connectedTabs.batchedClipping') });
		openNamedEditors(Array.from({ length: 40 }, (_, index) => `long-filename-${index}-for-scrolling.ts`));
		await layoutConnectedGroup(group, 300);
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
		const readSnapshots: { index: number; clips: string[] }[] = [];
		for (const [index, tab] of tabs.entries()) {
			const getBounds = tab.getBoundingClientRect.bind(tab);
			const replacement = stub(tab, 'getBoundingClientRect').callsFake(() => {
				readSnapshots.push({ index, clips: tabs.map(tab => tab.style.clipPath) });
				return getBounds();
			});
			disposables.add(toDisposable(() => replacement.restore()));
		}
		const scrollContainer = container.querySelector<HTMLElement>('.tabs-container')!;
		scrollContainer.classList.add('scroll');
		scrollContainer.scrollLeft = 90;
		const before = tabs.map(tab => tab.style.clipPath);
		scrollContainer.dispatchEvent(new mainWindow.Event(EventType.SCROLL));
		let batchStart = before;
		const allReadsBeforeWrites = readSnapshots.every(({ index, clips }) => {
			if (index === 0) {
				batchStart = clips;
			}
			return JSON.stringify(clips) === JSON.stringify(batchStart);
		});
		assert.deepStrictEqual({
			readAllTabs: readSnapshots.length >= tabs.length,
			allReadsBeforeWrites,
			clippingUpdated: tabs.some((tab, index) => tab.style.clipPath !== before[index]),
		}, { readAllTabs: true, allReadsBeforeWrites: true, clippingUpdated: true });
	});

	test('Add menu visibility updates wrapped width and scrolling clipping without resize or scroll', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		control.dispose();
		reset(container);
		control = createControl({ tabsBarAddTab: MenuId.for('test.connectedTabs.addVisibility') });
		const editors = openNamedEditors(['F.ts', `a-${'long-label-'.repeat(25)}.ts`, 'last.ts']);
		model.openEditor(editors[1], { active: true });
		control.openEditors(editors);
		const results = [];
		for (const connected of [false, true]) {
			root.classList.toggle('modern-ui-connected-editor-tabs', connected);
			for (const direction of ['ltr', 'rtl']) {
				root.dir = direction;
				for (const wrapTabs of [false, true]) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, wrapTabs, tabSizing: 'fit', tabActionReserveSpace: false };
					control.updateOptions(oldOptions, partOptions);
					await layoutConnectedGroup(group, 300);
					const tabs = container.querySelector<HTMLElement>('.tabs-container')!;
					const add = container.querySelector<HTMLElement>('.tabs-bar-add-tab')!;
					for (const visible of [false, true, false, true]) {
						addMenuVisible = visible;
						addMenuChange.fire();
						await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
						results.push({
							connected, direction, wrapTabs, visible,
							hidden: add.classList.contains('hidden'),
							widthCurrent: Number.parseFloat(tabs.style.getPropertyValue('--last-tab-add-tab-width')) === add.offsetWidth,
							clippingCurrent: Array.from(tabs.querySelectorAll<HTMLElement>('.tab')).some(tab => !!tab.style.clipPath) === (connected && !wrapTabs && visible),
						});
					}
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, hidden: !result.visible, widthCurrent: true, clippingCurrent: true })));
	});

	test('wrapped fit check includes the terminal gutter and the independent controls row', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const results = [];
		for (const hasAdd of [false, true]) {
			control.dispose();
			reset(container);
			control = createControl(hasAdd ? { tabsBarAddTab: MenuId.for('test.connectedTabs.minimumWrappedRow') } : undefined);
			openNamedEditors(['F.ts', `a-${'long-label-'.repeat(25)}.ts`]);
			const oldOptions = partOptions;
			partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fit', tabActionReserveSpace: false };
			control.updateOptions(oldOptions, partOptions);
			const toolbar = container.querySelector<HTMLElement>('.editor-actions')!;
			toolbar.style.width = '56px';
			for (const connected of [false, true]) {
				root.classList.toggle('modern-ui-connected-editor-tabs', connected);
				for (const direction of ['ltr', 'rtl']) {
					root.dir = direction;
					await layoutConnectedGroup(group, 300);
					const tabs = container.querySelector<HTMLElement>('.tabs-container')!;
					const addWidth = container.querySelector<HTMLElement>('.tabs-bar-add-tab')?.offsetWidth ?? 0;
					const terminal = Array.from(tabs.querySelectorAll<HTMLElement>('.tab')).at(-1)!;
					const gutter = Number.parseFloat(mainWindow.getComputedStyle(terminal).marginInlineEnd) - (hasAdd ? 0 : toolbar.offsetWidth);
					const threshold = (hasAdd ? Math.max(80, toolbar.offsetWidth + addWidth) : 80 + toolbar.offsetWidth) + gutter;
					for (const delta of [-2, 2, -2, 2]) {
						await layoutConnectedGroup(group, threshold + delta);
						const row = tabs.closest<HTMLElement>('.tabs-and-actions-container')!;
						results.push({ hasAdd, connected, direction, delta, wrapped: row.classList.contains('wrapping') });
					}
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, wrapped: result.delta > 0 })));
	});

	test('wrapped Add Tab stays unobscured beside the terminal tab or on its own final row', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		control.dispose();
		reset(container);
		control = createControl({ tabsBarAddTab: MenuId.for('test.connectedTabs.wrappedAddTabSpacing') });
		openNamedEditors(['F.ts', `a-${'long-label-'.repeat(25)}.ts`]);
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fit', tabActionReserveSpace: false };
		control.updateOptions(oldOptions, partOptions);
		const toolbar = container.querySelector<HTMLElement>('.editor-actions')!;
		toolbar.style.width = '56px';
		const results = [];
		for (const { connected, direction, tabHeight } of [false, true].flatMap(connected => ['ltr', 'rtl'].flatMap(direction => (['default', 'compact'] as const).map(tabHeight => ({ connected, direction, tabHeight }))))) {
			const previousOptions = partOptions;
			partOptions = { ...partOptions, tabHeight };
			control.updateOptions(previousOptions, partOptions);
			root.dir = direction;
			root.classList.toggle('modern-ui-connected-editor-tabs', connected);
			for (const width of [320, 900, 320, 1500]) {
				await layoutConnectedGroup(group, width);
				const terminal = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab')).at(-1)!;
				const add = container.querySelector<HTMLElement>('.tabs-bar-add-tab')!;
				const row = terminal.closest<HTMLElement>('.tabs-and-actions-container')!;
				const fill = terminal.querySelector<HTMLElement>('.tab-fill')!;
				const button = add.querySelector<HTMLElement>('.action-label')!;
				const buttonBounds = button.getBoundingClientRect();
				const fillBounds = fill.getBoundingClientRect();
				const terminalBounds = terminal.getBoundingClientRect();
				const fillInset = direction === 'rtl' ? fillBounds.left - terminalBounds.left : terminalBounds.right - fillBounds.right;
				const buttonGap = direction === 'rtl' ? fillBounds.left - buttonBounds.right : buttonBounds.left - fillBounds.right;
				const sameRow = terminal.offsetTop === add.offsetTop;
				results.push({
					connected, direction, tabHeight, width,
					wrapped: row.classList.contains('wrapping'),
					sameRow,
					adjacentGap: sameRow ? Math.abs((direction === 'rtl' ? terminal.getBoundingClientRect().left - add.getBoundingClientRect().right : add.getBoundingClientRect().left - terminal.getBoundingClientRect().right) - (connected ? 7 : 4)) <= 1 / 32 : undefined,
					separateRow: sameRow ? undefined : add.offsetTop > terminal.offsetTop && (!connected || terminal.classList.contains('connected-tab-upper-row')),
					contained: add.getBoundingClientRect().left >= row.getBoundingClientRect().left - 1 / 64 && add.getBoundingClientRect().right <= row.getBoundingClientRect().right + 1 / 64,
					visibleButtonGap: sameRow ? !connected || Math.abs(buttonGap - fillInset - 2) <= 1 / 32 : undefined,
					toolbarAligned: !connected || Math.abs(buttonBounds.y + buttonBounds.height / 2 - (toolbar.getBoundingClientRect().y + toolbar.getBoundingClientRect().height / 2)) <= 1 / 32,
				});
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, wrapped: true, adjacentGap: result.sameRow ? true : undefined, separateRow: result.sameRow ? undefined : true, contained: true, visibleButtonGap: result.sameRow ? true : undefined, toolbarAligned: true })));
	});

	test('wrapped terminal fit tabs leave room for editor actions without an Add Tab control', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		openNamedEditors(['F.ts', `a-${'long-label-'.repeat(25)}.ts`]);
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fit', tabActionReserveSpace: false };
		control.updateOptions(oldOptions, partOptions);
		const toolbar = container.querySelector<HTMLElement>('.editor-actions')!;
		toolbar.style.width = '56px';
		const results = [];
		for (const { connected, direction } of [false, true].flatMap(connected => ['ltr', 'rtl'].map(direction => ({ connected, direction })))) {
			root.dir = direction;
			root.classList.toggle('modern-ui-connected-editor-tabs', connected);
			for (const width of [300, 600, 300]) {
				await layoutConnectedGroup(group, width);
				const terminal = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab')).at(-1)!;
				const close = terminal.querySelector<HTMLElement>('.action-label')!;
				close.focus();
				const bounds = close.getBoundingClientRect();
				const target = mainWindow.document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
				results.push({
					connected, direction, width,
					wrapped: terminal.closest('.tabs-and-actions-container')?.classList.contains('wrapping'),
					beforeToolbar: direction === 'rtl' ? bounds.left >= toolbar.getBoundingClientRect().right : bounds.right <= toolbar.getBoundingClientRect().left,
					closeClickable: !!target && (target === close || close.contains(target)),
					noAddTab: !container.querySelector('.tabs-bar-add-tab'),
				});
				close.blur();
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, wrapped: true, beforeToolbar: true, closeClickable: true, noAddTab: true })));
	});

	test('modern editor headers retain an opaque backing during narrow and wide layouts', async () => {
		const group = connectedGroup();
		group.style.setProperty('--vscode-editor-background', '#123456');
		group.style.setProperty('--vscode-editorGroupHeader-tabsBackground', 'rgba(255, 0, 0, 0.25)');
		group.style.setProperty('--vscode-editorGroupHeader-noTabsBackground', 'rgba(0, 255, 0, 0.25)');
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const results = [];
		for (const connected of [false, true]) {
			root.classList.toggle('modern-ui-connected-editor-tabs', connected);
			for (const { width, showTabs } of [500, 180, 500].flatMap(width => [false, true].map(showTabs => ({ width, showTabs })))) {
				container.classList.toggle('tabs', showTabs);
				await layoutConnectedGroup(group, width);
				const style = mainWindow.getComputedStyle(container);
				results.push({
					connected, width, showTabs,
					backing: style.backgroundColor,
					themeLayer: style.backgroundImage,
					connectedRowThemeLayer: connected && showTabs ? mainWindow.getComputedStyle(container.querySelector<HTMLElement>('.tabs-and-actions-container')!).backgroundColor : undefined,
				});
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({
			...result,
			backing: 'rgb(18, 52, 86)',
			themeLayer: result.showTabs
				? result.connected ? 'none' : 'linear-gradient(rgba(255, 0, 0, 0.25), rgba(255, 0, 0, 0.25))'
				: 'linear-gradient(rgba(0, 255, 0, 0.25), rgba(0, 255, 0, 0.25))',
			connectedRowThemeLayer: result.connected && result.showTabs ? 'rgba(255, 0, 0, 0.25)' : undefined,
		})));
	});

	test('editor group owns the header backing while Modern UI can toggle without an important override', async () => {
		const themeService = instantiationService.get(IThemeService);
		assert.ok(themeService instanceof TestThemeService);
		themeService.setTheme(new TestColorTheme({
			'editor.background': '#123456',
			'editorGroupHeader.tabsBackground': '#44556680',
			'editorGroupHeader.noTabsBackground': '#66778880',
		}));
		const part = await createEditorPart(instantiationService, disposables);
		const root = $('.monaco-workbench');
		root.style.setProperty('--vscode-editor-background', '#123456');
		mainWindow.document.body.appendChild(root);
		const partContainer = part.getContainer()!;
		partContainer.classList.add('part', 'editor');
		root.appendChild(partContainer);
		disposables.add(toDisposable(() => root.remove()));
		const results = [];
		for (const showTabs of ['multiple', 'single', 'none'] as const) {
			const override = disposables.add(part.enforcePartOptions({ showTabs }));
			const title = root.querySelector<HTMLElement>('.editor-group-container > .title')!;
			for (const modern of [false, true, false]) {
				root.classList.toggle('modern-ui-tabs', modern);
				results.push({
					showTabs, modern,
					owningInlineColor: title.style.backgroundColor,
					background: mainWindow.getComputedStyle(title).backgroundColor,
					backingPriority: title.style.getPropertyPriority('background-color'),
				});
			}
			override.dispose();
		}
		assert.deepStrictEqual(results, results.map(result => ({
			...result,
			owningInlineColor: `var(--modern-ui-editor-title-background, ${result.showTabs === 'multiple' ? 'rgba(68, 85, 102, 0.5)' : 'rgba(102, 119, 136, 0.5)'})`,
			background: result.modern ? 'rgb(18, 52, 86)' : result.showTabs === 'multiple' ? 'rgba(68, 85, 102, 0.5)' : 'rgba(102, 119, 136, 0.5)',
			backingPriority: '',
		})));
	});
	test('connected labels use end ellipsis before the badge and action', async () => {
		const group = connectedGroup();
		const badgeStyle = document.createElement('style');
		badgeStyle.textContent = '.connected-tabs-labels .monaco-decoration-badge::after { content: "WM"; margin: 0 5px; }';
		group.appendChild(badgeStyle);
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fixed', tabSizingFixedMinWidth: 20, tabSizingFixedMaxWidth: 20, editorActionsLocation: 'hidden', hasIcons: true, showTabIndex: true };
		control.updateOptions(oldOptions, partOptions);
		const tab = container.querySelector<HTMLElement>('.tab')!;
		const label = tab.querySelector<HTMLElement>('.tab-label')!;
		label.classList.add('monaco-decoration-badge');
		await layoutConnectedGroup(group, 200);
		// Resource labels are redrawn on entry to the connected mode.
		label.classList.add('monaco-decoration-badge');
		await layoutConnectedGroup(group, 200);
		const name = tab.querySelector<HTMLElement>('.label-name')!;
		const nameContainer = name.parentElement!;
		const action = tab.querySelector<HTMLElement>('.tab-actions')!;
		const badge = mainWindow.getComputedStyle(label, '::after');
		assert.deepStrictEqual({
			iconVisible: mainWindow.getComputedStyle(label, '::before').display !== 'none',
			name: name.textContent,
			suffix: tab.querySelector('.label-suffix')?.textContent ?? '',
			ellipsis: mainWindow.getComputedStyle(nameContainer).textOverflow,
			truncated: nameContainer.scrollWidth > nameContainer.clientWidth,
			labelBeforeAction: nameContainer.getBoundingClientRect().right <= action.getBoundingClientRect().left,
			badgeVisible: parseFloat(badge.width) > 0,
			fullAriaLabel: tab.getAttribute('aria-label')?.includes('file0.txt'),
		}, {
			iconVisible: true,
			name: '1: file0.txt',
			suffix: '',
			ellipsis: 'ellipsis',
			truncated: true,
			labelBeforeAction: true,
			badgeVisible: true,
			fullAriaLabel: true,
		});
		group.closest('.monaco-workbench')!.classList.remove('modern-ui-connected-editor-tabs');
		await layoutConnectedGroup(group, 200);
		assert.deepStrictEqual([name.textContent, mainWindow.getComputedStyle(label, '::before').display !== 'none'], ['1: file0.txt', true]);
		group.closest('.monaco-workbench')!.classList.remove('modern-ui-tabs');
		await layoutConnectedGroup(group, 200);
		assert.deepStrictEqual([name.textContent, mainWindow.getComputedStyle(label, '::before').display !== 'none'], ['1: file0.txt', true]);
	});

	test('modern tabs preserve file icons across styles, sizing modes, and wrapping', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const iconStyle = document.createElement('style');
		iconStyle.textContent = '.modern-ui-tabs .tab-label::before { content: ""; }';
		group.appendChild(iconStyle);
		openNamedEditors(Array.from({ length: 8 }, (_, index) => `filename-for-layout-${index}.ts`));
		const results = [];
		for (const tabStyle of ['pill', 'connected'] as const) {
			root.classList.toggle('modern-ui-connected-editor-tabs', tabStyle === 'connected');
			for (const tabSizing of ['fit', 'fixed', 'shrink'] as const) {
				for (const wrapTabs of [false, true]) {
					for (const width of [420, 1200]) {
						const oldOptions = partOptions;
						partOptions = { ...partOptions, tabSizing, wrapTabs, tabSizingFixedMinWidth: 80, tabSizingFixedMaxWidth: 130, editorActionsLocation: 'hidden', hasIcons: true };
						control.updateOptions(oldOptions, partOptions);
						await layoutConnectedGroup(group, width);
						const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
						results.push({
							tabStyle,
							tabSizing,
							wrapTabs,
							width,
							allIconsVisible: tabs.every(tab => mainWindow.getComputedStyle(tab.querySelector<HTMLElement>('.tab-label')!, '::before').display !== 'none'),
						});
					}
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, allIconsVisible: true })));
	});

	test('connected shrink tabs preserve icons as the editor width changes', async () => {
		const group = connectedGroup();
		const iconStyle = document.createElement('style');
		iconStyle.textContent = '.connected-tabs-labels .tab-label::before { content: ""; }';
		group.appendChild(iconStyle);
		for (let i = 2; i < 10; i++) {
			const editor = disposables.add(new class extends TestFileEditorInput {
				override getName(): string { return `file${i}.txt`; }
			}(URI.file(`/path/file${i}.txt`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true, active: false });
		}
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'shrink', hasIcons: true, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		const states = [];
		for (const width of [1200, 420, 1200, 420]) {
			await layoutConnectedGroup(group, width);
			const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
			states.push({
				visibleIcons: tabs.filter(tab => mainWindow.getComputedStyle(tab.querySelector<HTMLElement>('.tab-label')!, '::before').display !== 'none').length,
				trimmedNames: tabs.filter(tab => {
					const name = tab.querySelector<HTMLElement>('.monaco-icon-name-container')!;
					return name.scrollWidth > name.clientWidth;
				}).length,
				fullNames: tabs.every(tab => tab.querySelector('.label-name')?.textContent?.endsWith('.txt')),
			});
		}
		assert.deepStrictEqual(states, [
			{ visibleIcons: 10, trimmedNames: 0, fullNames: true },
			{ visibleIcons: 10, trimmedNames: 10, fullNames: true },
			{ visibleIcons: 10, trimmedNames: 0, fullNames: true },
			{ visibleIcons: 10, trimmedNames: 10, fullNames: true },
		]);
	});

	test('connected actions keep active and dirty visible but inactive clean quiet', async () => {
		const group = connectedGroup();
		container.classList.add('tab-actions-reserve-space');
		await layoutConnectedGroup(group, 400);
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'));
		const opacity = () => tabs.map(tab => mainWindow.getComputedStyle(tab.querySelector('.action-label')!).opacity);
		const clean = opacity();
		tabs[1].classList.add('dirty');
		const dirty = opacity();
		tabs[1].classList.remove('dirty');
		const action = tabs[1].querySelector<HTMLElement>('.action-label')!;
		action.tabIndex = 0;
		action.focus();
		const focused = opacity();
		const windowFocused = mainWindow.document.hasFocus();
		action.blur();
		assert.deepStrictEqual({ clean, dirty, focused }, { clean: ['1', '0'], dirty: ['1', '1'], focused: ['1', windowFocused ? '1' : '0'] });
	});

	test('action reservation does not make inactive clean Close buttons visible', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const modified = disposables.add(new TestFileEditorInput(URI.file('/path/modified.ts'), 'testEditorInput'));
		modified.setDirty();
		model.openEditor(modified, { pinned: true, active: false });
		const sticky = disposables.add(new TestFileEditorInput(URI.file('/path/sticky.ts'), 'testEditorInput'));
		model.openEditor(sticky, { pinned: true, active: false });
		model.stick(sticky);
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const measurements = [];
		const expected = [];
		for (const style of ['legacy', 'pill', 'connected']) {
			root.classList.toggle('modern-ui-tabs', style !== 'legacy');
			root.classList.toggle('modern-ui-connected-editor-tabs', style === 'connected');
			for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
				root.classList.add(theme);
				for (const tabActionReserveSpace of [false, true]) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, tabActionReserveSpace, pinnedTabSizing: 'normal', tabActionUnpinVisibility: true };
					control.updateOptions(oldOptions, partOptions);
					await layoutConnectedGroup(group, 600);
					const active = container.querySelector<HTMLElement>('.tab.active')!;
					const clean = container.querySelector<HTMLElement>('.tab:not(.active):not(.dirty):not(.sticky)')!;
					const dirty = container.querySelector<HTMLElement>('.tab.dirty')!;
					const pinned = container.querySelector<HTMLElement>('.tab.sticky')!;
					const visible = (tab: HTMLElement) => Number.parseFloat(mainWindow.getComputedStyle(tab.querySelector<HTMLElement>('.action-label')!).opacity) > 0;
					for (const activeGroup of [true, false]) {
						group.classList.toggle('active', activeGroup);
						const context = { style, theme, tabActionReserveSpace, activeGroup };
						measurements.push({ ...context, atRest: [active, clean, dirty, pinned].map(visible) });
						expected.push({ ...context, atRest: [true, false, true, true] });
					}
					group.classList.add('active');
					const action = clean.querySelector<HTMLElement>('.action-label')!;
					action.tabIndex = 0;
					action.focus();
					const windowFocused = mainWindow.document.hasFocus();
					measurements.push({ style, theme, tabActionReserveSpace, focused: mainWindow.document.activeElement === action, keyboardFocus: windowFocused ? visible(clean) : undefined });
					expected.push({ style, theme, tabActionReserveSpace, focused: true, keyboardFocus: windowFocused ? true : undefined });
					action.blur();
				}
				root.classList.remove(theme);
			}
		}
		assert.deepStrictEqual(measurements, expected);
	});

	test('HC modified pills retain hover and selection side strokes independently of their top bar', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--vscode-tab-border', '#00ffff');
		root.style.setProperty('--vscode-contrastActiveBorder', '#ffaa00');
		const modified = model.getEditorByIndex(0)!;
		assert.ok(modified instanceof TestFileEditorInput);
		modified.setDirty();
		const last = disposables.add(new TestFileEditorInput(URI.file('/path/last.ts'), 'testEditorInput'));
		model.openEditor(last, { pinned: true, active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const themeService = instantiationService.get(IThemeService);
		assert.ok(themeService instanceof TestThemeService);
		themeService.setTheme(new TestColorTheme({ 'tab.inactiveModifiedBorder': '#22d3ee' }));
		const measurements = [];
		const expected = [];
		for (const theme of ['hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const tabHeight of ['default', 'compact'] as const) {
				for (const wrapTabs of [false, true]) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, tabHeight, wrapTabs, highlightModifiedTabs: true, editorActionsLocation: 'hidden', tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120 };
					control.updateOptions(oldOptions, partOptions);
					for (const selected of [false, true]) {
						model.setSelection(last, selected ? [modified] : []);
						control.updateEditorSelections();
						await layoutConnectedGroup(group, wrapTabs ? 150 : 600);
						const tab = container.querySelector<HTMLElement>('.tab.dirty-border-top')!;
						const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
						const before = tab.getBoundingClientRect().toJSON();
						tab.classList.add('hovered');
						const stroke = mainWindow.getComputedStyle(fill);
						const accent = getTabTopAccent(tab);
						const context = { theme, tabHeight, wrapTabs, selected };
						measurements.push({
							...context,
							sides: [stroke.borderLeftStyle, stroke.borderRightStyle, stroke.borderBottomStyle],
							colors: [stroke.borderLeftColor, stroke.borderRightColor, stroke.borderBottomColor],
							accent: [accent.color, accent.height, accent.topOffset],
							geometryStable: JSON.stringify(before) === JSON.stringify(tab.getBoundingClientRect().toJSON()),
						});
						expected.push({ ...context, sides: Array(3).fill(selected ? 'solid' : 'dashed'), colors: Array(3).fill('rgb(255, 170, 0)'), accent: ['rgb(34, 211, 238)', 2, 0], geometryStable: true });
						tab.classList.remove('hovered');
					}
				}
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(measurements, expected);
	});

	test('short fit tab names remain complete beside transient Close actions', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.classList.add('agent-sessions-workbench', 'dock-detail-panel');
		const iconStyle = document.createElement('style');
		iconStyle.textContent = '.modern-ui-tabs .tab-label::before { content: ""; }';
		group.appendChild(iconStyle);
		const editors = openNamedEditors(['F.ts', 'Files.ts', 'Browser', 'Search']);
		for (const editor of editors) {
			editor.getDescription = () => undefined;
			control.updateEditorLabel(editor);
		}
		const results = [];
		for (const connected of [false, true]) {
			root.classList.toggle('modern-ui-connected-editor-tabs', connected);
			for (const tabActionReserveSpace of [false, true]) {
				for (const tabActionLocation of ['left', 'right'] as const) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, tabSizing: 'fit', tabActionReserveSpace, tabActionLocation, hasIcons: true, editorActionsLocation: 'hidden' };
					control.updateOptions(oldOptions, partOptions);
					await layoutConnectedGroup(group, 800);
					const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'));
					const widths = tabs.map(tab => tab.getBoundingClientRect().width);
					for (const [index, tab] of tabs.entries()) {
						hoverTab(index);
						const action = tab.querySelector<HTMLElement>('.action-label')!;
						action.focus();
						const name = tab.querySelector<HTMLElement>('.monaco-icon-name-container')!;
						const range = mainWindow.document.createRange();
						range.selectNodeContents(name);
						results.push({
							connected, tabActionReserveSpace, tabActionLocation, name: name.textContent,
							fullName: range.getBoundingClientRect().width <= name.getBoundingClientRect().width + 1 / 64,
							stableWidth: Math.abs(widths[index] - tab.getBoundingClientRect().width) <= 1 / 64,
						});
						action.blur();
					}
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, fullName: true, stableWidth: true })));
	});

	test('wrapped fit labels ellipsize oversized names within the header', async () => {
		const group = connectedGroup();
		openNamedEditors([`Very long ${'filename segment '.repeat(30)}.ts`, 'F.ts']);
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fit', tabActionReserveSpace: false, wrapTabs: true, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		const results = [];
		for (const width of [300, 900, 300]) {
			await layoutConnectedGroup(group, width);
			const tab = container.querySelector<HTMLElement>('.tab')!;
			const name = tab.querySelector<HTMLElement>('.monaco-icon-name-container')!;
			const row = tab.closest<HTMLElement>('.tabs-container')!;
			results.push({
				width,
				wrapped: tab.closest('.tabs-and-actions-container')?.classList.contains('wrapping'),
				contained: tab.getBoundingClientRect().right <= row.getBoundingClientRect().right + 1 / 64,
				trimmed: name.scrollWidth > name.clientWidth,
				ellipsis: mainWindow.getComputedStyle(name).textOverflow,
			});
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, wrapped: true, contained: true, trimmed: true, ellipsis: 'ellipsis' })));
	});

	test('modern tab labels preserve icons and ellipsis with transient actions across sizing modes', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const iconStyle = document.createElement('style');
		iconStyle.textContent = '.modern-ui-tabs .tab-label::before { content: ""; } .modern-ui-tabs .tab-label.monaco-decoration-badge::after { content: "U"; margin: 0 5px; }';
		group.appendChild(iconStyle);
		openNamedEditors(['Files', 'a-long-tab-name-that-needs-truncation.ts']);
		const results = [];
		for (const connected of [false, true]) {
			root.classList.toggle('modern-ui-connected-editor-tabs', connected);
			for (const tabSizing of ['fit', 'fixed', 'shrink'] as const) {
				for (const { tabActionReserveSpace, tabActionLocation } of [false, true].flatMap(tabActionReserveSpace => (['left', 'right'] as const).map(tabActionLocation => ({ tabActionReserveSpace, tabActionLocation })))) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, tabSizing, tabActionReserveSpace, tabActionLocation, hasIcons: true, tabSizingFixedMinWidth: 80, tabSizingFixedMaxWidth: 80 };
					control.updateOptions(oldOptions, partOptions);
					await layoutConnectedGroup(group, 200);
					const tab = container.querySelector<HTMLElement>('.tab')!;
					tab.querySelector<HTMLElement>('.tab-label')!.classList.add('monaco-decoration-badge');
					tab.style.removeProperty('--tab-sizing-fit-width');
					await layoutConnectedGroup(group, 200);
					hoverTab(0);
					tab.querySelector<HTMLElement>('.action-label')!.focus();
					const name = tab.querySelector<HTMLElement>('.monaco-icon-name-container')!;
					const label = tab.querySelector<HTMLElement>('.monaco-icon-label-container')!;
					const nameStyle = mainWindow.getComputedStyle(name);
					results.push({
						connected, tabSizing, tabActionReserveSpace, tabActionLocation,
						iconVisible: mainWindow.getComputedStyle(tab.querySelector<HTMLElement>('.tab-label')!, '::before').display !== 'none',
						ellipsis: nameStyle.textOverflow,
						textFitsLabel: name.getBoundingClientRect().right <= label.getBoundingClientRect().right + 1 / 64,
					});
					tab.querySelector<HTMLElement>('.action-label')!.blur();
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, iconVisible: true, ellipsis: 'ellipsis', textFitsLabel: true })));
	});

	test('unreserved fit widths refresh when a decoration provider adds or removes a badge', async () => {
		const group = connectedGroup();
		control.dispose();
		reset(container);
		const service = disposables.add(instantiationService.createInstance(DecorationsService));
		instantiationService.stub(IDecorationsService, service);
		const changed = disposables.add(new Emitter<readonly URI[]>());
		const resource = model.getEditorByIndex(1)!.resource!;
		let decorated = false;
		disposables.add(service.registerDecorationsProvider({
			label: 'Fit tab badge',
			onDidChange: changed.event,
			provideDecorations: uri => decorated && uri.toString() === resource.toString() ? { letter: 'M', tooltip: 'Modified' } : undefined,
		}));
		partOptions = { ...partOptions, tabActionReserveSpace: false, tabSizing: 'fit', decorations: { badges: true, colors: true } };
		control = createControl();
		await layoutConnectedGroup(group, 600);
		const tab = container.querySelectorAll<HTMLElement>('.tab')[1];
		const originalWidth = tab.getBoundingClientRect().width;
		const widths = [];
		for (const enabled of [true, false]) {
			decorated = enabled;
			changed.fire([resource]);
			const deadline = Date.now() + 3000;
			while (tab.querySelector('.tab-label')!.classList.contains('monaco-decoration-badge') !== enabled || (enabled ? tab.getBoundingClientRect().width <= originalWidth : Math.abs(tab.getBoundingClientRect().width - originalWidth) >= 1 / 32)) {
				if (Date.now() >= deadline) {
					assert.fail(`Decoration layout did not settle for badge state ${enabled}`);
				}
				await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
			}
			widths.push(tab.getBoundingClientRect().width);
		}
		assert.deepStrictEqual({ expanded: widths[0] > originalWidth, restored: Math.abs(widths[1] - originalWidth) < 1 / 32 }, { expanded: true, restored: true });
	});

	test('connected fit tabs reallocate filename width to transient actions', async () => {
		const group = connectedGroup();
		openNamedEditors(['a-natural-width-label-longer-than-the-short-fit-minimum.ts', 'another-natural-width-label-longer-than-the-short-fit-minimum.ts']);
		model.openEditor(model.getEditorByIndex(0)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fit', tabActionReserveSpace: false };
		control.updateOptions(oldOptions, partOptions);
		await layoutConnectedGroup(group, 400);

		const tab = container.querySelectorAll<HTMLElement>('.tab')[1];
		const label = tab.querySelector<HTMLElement>('.tab-label')!;
		const action = tab.querySelector<HTMLElement>('.action-label')!;
		tab.style.removeProperty('--tab-sizing-fit-width');
		const resting = { tab: tab.getBoundingClientRect().width, label: label.getBoundingClientRect().width };
		hoverTab(1);
		action.focus();
		const focused = { tab: tab.getBoundingClientRect().width, label: label.getBoundingClientRect().width };

		assert.deepStrictEqual({
			stableTabWidth: Math.abs(focused.tab - resting.tab) < 1 / 32,
			labelYieldedSpace: focused.label < resting.label,
			fitWidthMatches: Math.abs(parseFloat(tab.style.getPropertyValue('--tab-sizing-fit-width')) - resting.tab) < 1 / 32,
		}, {
			stableTabWidth: true,
			labelYieldedSpace: true,
			fitWidthMatches: true,
		}, JSON.stringify({ resting, focused, cache: tab.style.getPropertyValue('--tab-sizing-fit-width') }));
	});

	function openNamedEditors(names: string[]): TestFileEditorInput[] {
		for (const editor of model.getEditors(EditorsOrder.SEQUENTIAL)) {
			model.closeEditor(editor);
			control.closeEditor(editor);
		}
		const editors = names.map((name, index) => {
			const editor = disposables.add(new class extends TestFileEditorInput {
				override getName(): string { return name; }
				override getDescription(verbosity?: Verbosity): string {
					return verbosity === Verbosity.LONG ? '/workspace/project/src' : 'src';
				}
			}(URI.file(`/workspace/project/src/${name}`), 'testEditorInput'));
			model.openEditor(editor, { index, pinned: true, active: index === names.length - 1 });
			return editor;
		});
		control.openEditors(editors);
		return editors;
	}

	test('unreserved fit widths follow editor names when tab slots are reused after closing or reordering', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const results = [];
		for (const style of ['pill', 'connected']) {
			root.classList.toggle('modern-ui-connected-editor-tabs', style === 'connected');
			for (const operation of ['close', 'reorder']) {
				const oldOptions = partOptions;
				partOptions = { ...partOptions, tabSizing: 'fit', tabActionReserveSpace: false, editorActionsLocation: 'hidden' };
				control.updateOptions(oldOptions, partOptions);
				const [short, long] = openNamedEditors(['a.ts', 'a-significantly-longer-filename.ts', 'active.ts']);
				await layoutConnectedGroup(group, 1000);
				const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'));
				const widths = tabs.map(tab => tab.getBoundingClientRect().width);
				if (operation === 'close') {
					model.closeEditor(short);
					control.closeEditor(short);
				} else {
					model.moveEditor(long, 0);
					control.moveEditor(long, 1, 0);
				}
				await layoutConnectedGroup(group, 1000);
				const reorderedTabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'));
				results.push({
					style, operation,
					distinctNaturalWidths: widths[1] > widths[0],
					firstName: reorderedTabs[0].querySelector('.label-name')!.textContent,
					longWidthPreserved: reorderedTabs[0].getBoundingClientRect().width === widths[1],
					remainingWidthsPreserved: operation === 'close'
						? reorderedTabs[1].getBoundingClientRect().width === widths[2]
						: reorderedTabs[1].getBoundingClientRect().width === widths[0] && reorderedTabs[2].getBoundingClientRect().width === widths[2],
				});
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, distinctNaturalWidths: true, firstName: 'a-significantly-longer-filename.ts', longWidthPreserved: true, remainingWidthsPreserved: true })));
	});

	test('unreserved fit widths refresh when tab index and label format options change', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const results = [];
		for (const style of ['pill', 'connected']) {
			root.classList.toggle('modern-ui-connected-editor-tabs', style === 'connected');
			let oldOptions = partOptions;
			partOptions = { ...partOptions, tabSizing: 'fit', tabActionReserveSpace: false, showTabIndex: false, labelFormat: 'short', editorActionsLocation: 'hidden' };
			control.updateOptions(oldOptions, partOptions);
			openNamedEditors(['a.ts', 'active.ts']);
			await layoutConnectedGroup(group, 1000);
			const tab = container.querySelector<HTMLElement>('.tab')!;
			const restingWidth = tab.getBoundingClientRect().width;
			oldOptions = partOptions;
			partOptions = { ...partOptions, showTabIndex: true };
			control.updateOptions(oldOptions, partOptions);
			await layoutConnectedGroup(group, 1000);
			const indexedWidth = tab.getBoundingClientRect().width;
			const indexedName = tab.querySelector('.label-name')!.textContent;
			oldOptions = partOptions;
			partOptions = { ...partOptions, labelFormat: 'long' };
			control.updateOptions(oldOptions, partOptions);
			await layoutConnectedGroup(group, 1000);
			const longWidth = tab.getBoundingClientRect().width;
			const description = tab.querySelector('.label-description')!.textContent;
			oldOptions = partOptions;
			partOptions = { ...partOptions, showTabIndex: false, labelFormat: 'short' };
			control.updateOptions(oldOptions, partOptions);
			await layoutConnectedGroup(group, 1000);
			results.push({
				style, indexedName, description,
				indexAddsWidth: indexedWidth > restingWidth,
				descriptionAddsWidth: longWidth > indexedWidth,
				restoredWidth: tab.getBoundingClientRect().width === restingWidth,
			});
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, indexedName: '1: a.ts', description: '/workspace/project/src', indexAddsWidth: true, descriptionAddsWidth: true, restoredWidth: true })));
	});

	test('unreserved fit widths use CSS coordinates at zoom during layout hover and focus', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		openNamedEditors(['a-wide-natural-fit-label.ts', 'another-wide-natural-fit-label.ts']);
		model.openEditor(model.getEditorByIndex(0)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fit', tabActionReserveSpace: false, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		await layoutConnectedGroup(group, 1000);
		const tab = container.querySelectorAll<HTMLElement>('.tab')[1];
		const action = tab.querySelector<HTMLElement>('.action-label')!;
		const results = [];
		for (const style of ['pill', 'connected']) {
			root.classList.toggle('modern-ui-connected-editor-tabs', style === 'connected');
			for (const zoom of [1.25, 1.6]) {
				root.style.zoom = String(zoom);
				for (const trigger of ['layout', 'hover', 'focus']) {
					action.blur();
					tab.dispatchEvent(new MouseEvent(EventType.MOUSE_LEAVE));
					if (trigger !== 'focus') {
						tab.style.removeProperty('--tab-sizing-fit-width');
					}
					const naturalWidth = tab.getBoundingClientRect().width / zoom;
					if (trigger === 'layout') {
						await layoutConnectedGroup(group, 1000);
					} else if (trigger === 'hover') {
						hoverTab(1);
					} else {
						action.focus();
					}
					results.push({
						style, zoom, trigger,
						cachedCssWidth: Math.abs(parseFloat(tab.style.getPropertyValue('--tab-sizing-fit-width')) - naturalWidth) < 1 / 32,
						stableTargetWidth: Math.abs(tab.getBoundingClientRect().width / zoom - naturalWidth) < 1 / 32,
						focused: trigger === 'focus' ? mainWindow.document.activeElement === action : undefined,
					});
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, cachedCssWidth: true, stableTargetWidth: true, focused: result.trigger === 'focus' ? true : undefined })));
	});

	test('uncached fit widths release all wrapping constraints before measuring and restore them together', async () => {
		const group = connectedGroup();
		openNamedEditors(Array.from({ length: 20 }, (_, index) => `long-fit-label-${index}.ts`));
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fit', tabActionReserveSpace: false };
		control.updateOptions(oldOptions, partOptions);
		await layoutConnectedGroup(group, 300);
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
		const writes: { index: number; value: string }[] = [];
		for (const [index, tab] of tabs.entries()) {
			tab.style.removeProperty('--tab-sizing-fit-width');
			tab.style.maxWidth = `${200 + index}px`;
			const descriptor = Object.getOwnPropertyDescriptor(tab.style, 'maxWidth');
			Object.defineProperty(tab.style, 'maxWidth', {
				configurable: true,
				get: () => tab.style.getPropertyValue('max-width'),
				set: (value: string) => {
					writes.push({ index, value });
					tab.style.setProperty('max-width', value);
				},
			});
			disposables.add(toDisposable(() => {
				if (descriptor) {
					Object.defineProperty(tab.style, 'maxWidth', descriptor);
				} else {
					Reflect.deleteProperty(tab.style, 'maxWidth');
				}
			}));
		}
		await layoutConnectedGroup(group, 300);
		assert.deepStrictEqual({
			firstMeasurementWrites: writes.slice(0, tabs.length * 2),
			originalConstraintsRestored: tabs.every((tab, index) => tab.style.maxWidth === `${200 + index}px`),
			allWidthsCached: tabs.every(tab => Number.parseFloat(tab.style.getPropertyValue('--tab-sizing-fit-width')) > 0),
		}, {
			firstMeasurementWrites: [
				...tabs.map((_tab, index) => ({ index, value: 'none' })),
				...tabs.map((_tab, index) => ({ index, value: `${200 + index}px` })),
			],
			originalConstraintsRestored: true,
			allWidthsCached: true,
		});
	});

	test('transient actions do not resize fixed or shrink tabs with reservation on or off', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		openNamedEditors(Array.from({ length: 8 }, (_, index) => `tab-label-for-action-reservation-${index}.ts`));
		const results = [];
		for (const connected of [false, true]) {
			root.classList.toggle('modern-ui-connected-editor-tabs', connected);
			for (const tabSizing of ['fixed', 'shrink'] as const) {
				for (const tabActionReserveSpace of [false, true]) {
					for (const wrapTabs of [false, true]) {
						for (const { tabActionLocation, direction } of (['left', 'right'] as const).flatMap(tabActionLocation => ['ltr', 'rtl'].map(direction => ({ tabActionLocation, direction })))) {
							root.dir = direction;
							const oldOptions = partOptions;
							partOptions = { ...partOptions, tabSizing, tabActionReserveSpace, wrapTabs, tabActionLocation, tabSizingFixedMinWidth: 80, tabSizingFixedMaxWidth: 120 };
							control.updateOptions(oldOptions, partOptions);
							await layoutConnectedGroup(group, wrapTabs ? 500 : 1400);
							const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'));
							const before = tabs.map(tab => tab.getBoundingClientRect().width);
							const action = tabs[1].querySelector<HTMLElement>('.action-label')!;
							action.focus();
							const text = tabs[1].querySelector<HTMLElement>('.monaco-icon-label-container')!.getBoundingClientRect();
							const actionBounds = action.getBoundingClientRect();
							results.push({
								connected, tabSizing, tabActionReserveSpace, wrapTabs, tabActionLocation, direction,
								stableWidths: tabs.every((tab, index) => Math.abs(tab.getBoundingClientRect().width - before[index]) < 1 / 32),
								textClearOfAction: tabActionLocation === 'right' ? text.right <= actionBounds.left + 1 / 32 : text.left >= actionBounds.right - 1 / 32,
							});
							action.blur();
						}
					}
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, stableWidths: true, textClearOfAction: true })), JSON.stringify(results.filter(result => !result.textClearOfAction)));
	});

	test('unreserved fit tab widths and wrapping stay stable when differently named clean tabs are activated', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const results = [];
		for (const style of ['pill', 'connected']) {
			root.classList.toggle('modern-ui-connected-editor-tabs', style === 'connected');
			for (const wrapTabs of [false, true]) {
				const oldOptions = partOptions;
				partOptions = { ...partOptions, tabSizing: 'fit', tabActionReserveSpace: false, wrapTabs, editorActionsLocation: 'hidden' };
				control.updateOptions(oldOptions, partOptions);
				const editors = openNamedEditors(['a.ts', 'a-significantly-longer-filename.ts']);
				const width = wrapTabs ? 240 : 1000;
				await layoutConnectedGroup(group, width);
				const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'));
				const measure = () => ({
					widths: tabs.map(tab => tab.getBoundingClientRect().width),
					rows: tabs.map(tab => tab.offsetTop),
					wrapping: container.querySelector('.tabs-and-actions-container')!.classList.contains('wrapping'),
				});
				const baseline = measure();
				for (const activeIndex of [0, 1, 0, 1]) {
					model.openEditor(editors[activeIndex], { active: true });
					control.openEditors(editors);
					await layoutConnectedGroup(group, width);
					const selected = measure();
					results.push({
						style, wrapTabs, activeIndex,
						baselineWidths: baseline.widths,
						selectedWidths: selected.widths,
						activeTab: tabs[activeIndex].classList.contains('active'),
						stableWidths: selected.widths.every((width, index) => Math.abs(width - baseline.widths[index]) < 1 / 32),
						stableRows: JSON.stringify(selected.rows) === JSON.stringify(baseline.rows),
						stableWrapping: selected.wrapping === baseline.wrapping,
					});
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, activeTab: true, stableWidths: true, stableRows: true, stableWrapping: true })), JSON.stringify(results));
	});

	test('action reservation changes update fit widths in both modern styles and leave Legacy unchanged', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		openNamedEditors(['a-wide-natural-fit-label.ts', 'another-wide-natural-fit-label.ts']);
		const modified = disposables.add(new TestFileEditorInput(URI.file('/path/modified.ts'), 'testEditorInput'));
		modified.setDirty();
		model.openEditor(modified, { pinned: true, active: false });
		const sticky = disposables.add(new TestFileEditorInput(URI.file('/path/sticky.ts'), 'testEditorInput'));
		model.openEditor(sticky, { pinned: true, active: false });
		model.stick(sticky);
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const results = [];
		for (const style of ['legacy', 'pill', 'connected']) {
			root.classList.toggle('modern-ui-tabs', style !== 'legacy');
			root.classList.toggle('modern-ui-connected-editor-tabs', style === 'connected');
			for (const tabActionLocation of ['left', 'right'] as const) {
				let oldOptions = partOptions;
				partOptions = { ...partOptions, tabSizing: 'fit', tabActionReserveSpace: true, tabActionLocation, tabActionUnpinVisibility: true, pinnedTabSizing: 'normal', editorActionsLocation: 'hidden' };
				control.updateOptions(oldOptions, partOptions);
				await layoutConnectedGroup(group, 600);
				const tab = container.querySelector<HTMLElement>('.tab:not(.active):not(.dirty):not(.sticky)')!;
				const persistentTabs = Array.from(container.querySelectorAll<HTMLElement>('.tab:is(.dirty, .sticky)'));
				const persistentWidths = persistentTabs.map(tab => tab.getBoundingClientRect().width);
				const reserved = tab.getBoundingClientRect().width;
				const widths = [];
				let persistentStable = true;
				for (const tabActionReserveSpace of [false, true, false]) {
					oldOptions = partOptions;
					partOptions = { ...partOptions, tabActionReserveSpace };
					control.updateOptions(oldOptions, partOptions);
					await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
					widths.push(tab.getBoundingClientRect().width);
					persistentStable &&= persistentTabs.every((tab, index) => Math.abs(tab.getBoundingClientRect().width - persistentWidths[index]) < 1 / 32);
				}
				results.push({
					style, tabActionLocation,
					toggleRestoresReservation: widths[1] === reserved,
					toggleIsRepeatable: widths[0] === widths[2],
					compactWithoutReservation: style === 'legacy' ? widths[0] === reserved : widths[0] < reserved,
					persistentStable,
				});
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, toggleRestoresReservation: true, toggleIsRepeatable: true, compactWithoutReservation: true, persistentStable: true })));
	});

	test('fit-sized Connected tabs retain short-label icons and match Pill widths', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const iconStyle = document.createElement('style');
		iconStyle.textContent = '.modern-ui-tabs .tab-label::before { content: ""; }';
		group.appendChild(iconStyle);
		for (const name of ['a.ts', 'b.ts']) {
			const editor = disposables.add(new class extends TestFileEditorInput {
				override getName(): string { return name; }
			}(URI.file(`/path/${name}`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true, active: false });
		}
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fit', hasIcons: true, wrapTabs: true, tabActionReserveSpace: true };
		control.updateOptions(oldOptions, partOptions);
		root.classList.remove('modern-ui-connected-editor-tabs');
		await layoutConnectedGroup(group, 300);
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab')).slice(-2);
		const pillWidths = tabs.map(tab => tab.getBoundingClientRect().width);
		root.classList.add('modern-ui-connected-editor-tabs');
		await layoutConnectedGroup(group, 300);
		assert.deepStrictEqual(tabs.map(tab => tab.getBoundingClientRect().width), pillWidths);
	});

	test('connected close actions keep consistent spacing across terminal and wrapped tabs', async () => {
		const group = connectedGroup();
		group.style.setProperty('--vscode-editorGroupHeader-tabsBorder', '#333333');
		const measure = () => {
			const tab = container.querySelector<HTMLElement>('.tab.active')!;
			const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
			const action = tab.querySelector<HTMLElement>('.action-label')!;
			const actions = tab.querySelector<HTMLElement>('.tab-actions')!;
			const label = tab.querySelector<HTMLElement>('.monaco-icon-label-container')!;
			const fillBounds = fill.getBoundingClientRect();
			const actionBounds = action.getBoundingClientRect();
			const actionsBounds = actions.getBoundingClientRect();
			const actionStyle = mainWindow.getComputedStyle(action);
			const actionsStyle = mainWindow.getComputedStyle(actions);
			const tabBounds = tab.getBoundingClientRect();
			return {
				top: actionBounds.top - tabBounds.top,
				bottom: tabBounds.bottom - actionBounds.bottom,
				right: tabBounds.right - actionBounds.right,
				left: actionBounds.left - label.getBoundingClientRect().right,
				width: fillBounds.width,
				target: [actionBounds.width, actionBounds.height],
				reservation: mainWindow.getComputedStyle(tab).getPropertyValue('--modern-ui-tab-action-padding').trim(),
				actionInsets: [
					actionBounds.left - actionsBounds.left - Number.parseFloat(actionsStyle.borderLeftWidth),
					actionsBounds.right - Number.parseFloat(actionsStyle.borderRightWidth) - actionBounds.right,
				],
				padding: [actionStyle.paddingTop, actionStyle.paddingRight, actionStyle.paddingBottom, actionStyle.paddingLeft],
			};
		};

		await layoutConnectedGroup(group, 400);
		const multiple = measure();
		const stroke = Number.parseFloat(mainWindow.getComputedStyle(container.querySelector<HTMLElement>('.tab.active')!).getPropertyValue('--vscode-strokeThickness'));

		const secondEditor = model.getEditorByIndex(1)!;
		model.closeEditor(secondEditor);
		control.closeEditor(secondEditor);
		await layoutConnectedGroup(group, 400);
		const single = measure();

		model.openEditor(secondEditor, { pinned: true, active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		await layoutConnectedGroup(group, 150);
		const wrappedBottom = measure();

		model.openEditor(model.getEditorByIndex(0)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layoutConnectedGroup(group, 150);
		const wrappedUpper = measure();
		const measurements = [multiple, single, wrappedBottom, wrappedUpper];

		const oldWrappedOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: false, tabSizing: 'fit', tabActionLocation: 'left' };
		control.updateOptions(oldWrappedOptions, partOptions);
		await layoutConnectedGroup(group, 400);
		const leftMultiple = measure();

		model.closeEditor(secondEditor);
		control.closeEditor(secondEditor);
		await layoutConnectedGroup(group, 400);
		const leftSingle = measure();

		assert.deepStrictEqual({
			single: {
				top: single.top === multiple.top,
				right: single.right === multiple.right,
				left: single.left === multiple.left,
				width: single.width === multiple.width,
			},
			horizontal: {
				clearance: measurements.map(measurement => [measurement.top, measurement.right, measurement.bottom, measurement.left]),
			},
			leftAction: {
				top: leftSingle.top === leftMultiple.top,
				right: leftSingle.right === leftMultiple.right,
				left: leftSingle.left === leftMultiple.left,
				width: leftSingle.width === leftMultiple.width,
			},
			balancedActionSurface: [...measurements, leftMultiple, leftSingle].every(measurement => Math.abs(measurement.actionInsets[0] - measurement.actionInsets[1]) <= stroke),
			balancedActionInsets: measurements.every(measurement => Math.abs(measurement.right - measurement.left) <= stroke),
			actionPadding: measurements.every(measurement => new Set(measurement.padding).size === 1 && measurement.padding[0] === multiple.padding[0]),
			targets: measurements.map(measurement => measurement.target),
			reservations: measurements.map(measurement => measurement.reservation),
		}, {
			single: { top: true, right: true, left: true, width: true },
			horizontal: { clearance: [[2, 4, 2, 4], [2, 4, 2, 4], [4, 4, 4, 4], [4, 4, 4, 4]] },
			leftAction: { top: true, right: true, left: true, width: true },
			balancedActionSurface: true,
			balancedActionInsets: true,
			actionPadding: true,
			targets: Array.from({ length: 4 }, () => [20, 20]),
			reservations: Array(4).fill('28px'),
		});
	});

	test('pin and close actions share geometry across tab styles and wrapping', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const stickyEditor = model.getEditorByIndex(0)!;
		const activeEditor = model.getEditorByIndex(1)!;
		model.stick(stickyEditor);
		control.stickEditor(stickyEditor);
		model.openEditor(activeEditor, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const measurements = [];

		for (const editorTabStyle of ['connected', 'pill'] as const) {
			root.classList.toggle('modern-ui-connected-editor-tabs', editorTabStyle === 'connected');
			for (const tabActionLocation of ['right', 'left'] as const) {
				for (const wrapTabs of [false, true]) {
					const oldOptions = partOptions;
					partOptions = {
						...partOptions,
						editorActionsLocation: 'hidden',
						pinnedTabSizing: 'normal',
						tabActionLocation,
						tabActionUnpinVisibility: true,
						tabSizing: wrapTabs ? 'fixed' : 'fit',
						tabSizingFixedMinWidth: 120,
						tabSizingFixedMaxWidth: 120,
						wrapTabs,
					};
					control.updateOptions(oldOptions, partOptions);
					await layoutConnectedGroup(group, wrapTabs ? 150 : 400);
					const stickyTab = container.querySelector<HTMLElement>('.tab.sticky')!;
					const activeTab = container.querySelector<HTMLElement>('.tab.active:not(.sticky)')!;
					const measure = (tab: HTMLElement) => {
						const action = tab.querySelector<HTMLElement>('.action-label')!;
						const actionBounds = action.getBoundingClientRect();
						const tabBounds = tab.getBoundingClientRect();
						return {
							target: [actionBounds.width, actionBounds.height],
							clearance: [
								actionBounds.top - tabBounds.top,
								tabActionLocation === 'right' ? tabBounds.right - actionBounds.right : actionBounds.left - tabBounds.left,
								tabBounds.bottom - actionBounds.bottom,
							],
							label: action.getAttribute('aria-label'),
						};
					};
					const pin = measure(stickyTab);
					const close = measure(activeTab);
					measurements.push({
						editorTabStyle,
						tabActionLocation,
						wrapTabs,
						targetsMatch: pin.target[0] === close.target[0] && pin.target[1] === close.target[1],
						clearanceMatches: pin.clearance.every((value, index) => Math.abs(value - close.clearance[index]) <= 1),
						labels: [pin.label, close.label],
					});
				}
			}
		}

		assert.deepStrictEqual(measurements, [
			...['connected', 'pill'].flatMap(editorTabStyle => ['right', 'left'].flatMap(tabActionLocation => [false, true].map(wrapTabs => ({
				editorTabStyle,
				tabActionLocation,
				wrapTabs,
				targetsMatch: true,
				clearanceMatches: true,
				labels: ['Unpin Editor', 'Close'],
			})))),
		]);
	});

	test('close hover targets stay centered in hitboxes across wrapped surface shapes', async () => {
		const group = connectedGroup();
		group.style.setProperty('--vscode-editorGroupHeader-tabsBorder', '#333333');
		const measurements = [];
		const expected = [];
		for (const tabHeight of ['default', 'compact'] as const) {
			for (const tabActionLocation of ['right', 'left'] as const) {
				for (const wrapTabs of [false, true]) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, tabHeight, tabActionLocation, wrapTabs, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
					control.updateOptions(oldOptions, partOptions);
					for (const activeIndex of [0, 1]) {
						model.openEditor(model.getEditorByIndex(activeIndex)!, { active: true });
						control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
						await layoutConnectedGroup(group, wrapTabs ? 150 : 400);
						const tab = container.querySelector<HTMLElement>('.tab.active')!;
						const tabBounds = tab.getBoundingClientRect();
						const action = tab.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect();
						const rowStart = activeIndex === 0 || wrapTabs;
						const upperRow = wrapTabs && activeIndex === 0;
						measurements.push({
							tabHeight, tabActionLocation, wrapTabs, activeIndex,
							top: action.top - tabBounds.top,
							bottom: tabBounds.bottom - action.bottom,
							trailing: tabActionLocation === 'left'
								? action.left - tabBounds.left
								: tabBounds.right - action.right,
							target: [action.width, action.height],
							leftBorder: rowStart && !upperRow ? mainWindow.getComputedStyle(tab.querySelector<HTMLElement>('.tab-fill')!).borderLeftColor : undefined,
						});
						const clearance = wrapTabs ? tabHeight === 'compact' ? 2 : 4 : tabHeight === 'compact' ? 1 : 2;
						expected.push({
							tabHeight, tabActionLocation, wrapTabs, activeIndex,
							top: clearance, bottom: clearance, trailing: tabActionLocation === 'left' ? 5 : 4,
							target: [20, 20],
							leftBorder: rowStart && !upperRow ? 'rgba(0, 0, 0, 0)' : undefined,
						});
					}
				}
			}
		}
		assert.deepStrictEqual(measurements, expected);
	});

	test('reveals the active tab with its right shoulder outside the label and action', async () => {
		const group = connectedGroup();
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fixed', tabSizingFixedMinWidth: 160.25, tabSizingFixedMaxWidth: 160.25, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		const thirdEditor = disposables.add(new TestFileEditorInput(URI.file('/path/file2.txt'), 'testEditorInput'));
		model.openEditor(thirdEditor, { pinned: true, active: false });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layoutConnectedGroup(group, 240);
		model.openEditor(model.getEditorByIndex(1)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		control.layout({ container: new Dimension(240, 33), available: new Dimension(240, 300) }, { forceRevealActiveTab: true });
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
		const tab = container.querySelectorAll<HTMLElement>('.tabs-container > .tab')[1];
		const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
		const action = tab.querySelector<HTMLElement>('.tab-actions')!;
		const viewport = container.querySelector<HTMLElement>('.monaco-scrollable-element')!;
		const shoulderWidth = Number.parseFloat(mainWindow.getComputedStyle(fill, '::after').width);
		assert.deepStrictEqual({
			labelBeforeAction: tab.querySelector<HTMLElement>('.monaco-icon-label-container')!.getBoundingClientRect().right <= action.getBoundingClientRect().left,
			shoulderVisible: fill.getBoundingClientRect().right + shoulderWidth <= viewport.getBoundingClientRect().right,
			clipped: tab.classList.contains('connected-tab-right-edge'),
		}, {
			labelBeforeAction: true,
			shoulderVisible: true,
			clipped: false,
		});
	});

	test('reveals the terminal Connected editor Close action and shoulder before Add Tab', async () => {
		const group = connectedGroup();
		group.closest<HTMLElement>('.monaco-workbench')!.classList.add('agent-sessions-workbench', 'dock-detail-panel');
		control.dispose();
		reset(container);
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: false, tabSizing: 'fixed', tabSizingFixedMinWidth: 160.25, tabSizingFixedMaxWidth: 160.25, editorActionsLocation: 'hidden' };
		control = createControl({ tabsBarAddTab: MenuId.for('test.connectedTabs.terminalAddTab') });
		control.updateOptions(oldOptions, partOptions);
		const third = disposables.add(new TestFileEditorInput(URI.file('/path/browser.ts'), 'testEditorInput'));
		model.openEditor(third, { index: model.count, pinned: true, active: false });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const results = [];
		for (const tabHeight of ['default', 'compact'] as const) {
			const oldOptions = partOptions;
			partOptions = { ...partOptions, tabHeight };
			control.updateOptions(oldOptions, partOptions);
			for (const zoom of [1, 1.25, 1.6]) {
				group.closest<HTMLElement>('.monaco-workbench')!.style.zoom = String(zoom);
				model.openEditor(model.getEditorByIndex(0)!, { active: true });
				control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
				await layoutConnectedGroup(group, 240);
				model.openEditor(third, { active: true });
				control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
				control.layout({ container: new Dimension(240, 33), available: new Dimension(240, 300) }, { forceRevealActiveTab: true });
				await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
				const tab = container.querySelector<HTMLElement>('.tab.active')!;
				const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
				const close = tab.querySelector<HTMLElement>('.action-label')!;
				const addTab = container.querySelector<HTMLElement>('.tabs-bar-add-tab')!;
				const closeBounds = close.getBoundingClientRect();
				const viewport = container.querySelector<HTMLElement>('.tabs-container')!.getBoundingClientRect();
				const rightEdge = addTab.getBoundingClientRect().left;
				const shoulder = Number.parseFloat(mainWindow.getComputedStyle(fill, '::after').width) * zoom;
				const target = mainWindow.document.elementFromPoint(closeBounds.x + closeBounds.width / 2, closeBounds.y + closeBounds.height / 2);
				results.push({
					tabHeight, zoom,
					addTabIsLastChild: tab.nextElementSibling === addTab,
					closeFullyVisible: closeBounds.left >= viewport.left && closeBounds.right <= rightEdge,
					closeReceivesPointer: !!target && (target === close || close.contains(target)),
					shoulderFullyVisible: fill.getBoundingClientRect().right + shoulder <= rightEdge + 1 / 64,
					noClipping: !tab.classList.contains('connected-tab-right-clipped') && !tab.classList.contains('connected-tab-right-edge'),
					noMask: !container.querySelector('.tab-connected-overflow-edge.connected-tab-right-clipped'),
				});
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, addTabIsLastChild: true, closeFullyVisible: true, closeReceivesPointer: true, shoulderFullyVisible: true, noClipping: true, noMask: true })));
	});

	test('reveals the left shoulder of non-first tabs and keeps the first tab flush', async () => {
		const group = connectedGroup();
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fixed', tabSizingFixedMinWidth: 160.25, tabSizingFixedMaxWidth: 160.25, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		for (let i = 2; i < 4; i++) {
			const editor = disposables.add(new TestFileEditorInput(URI.file(`/path/file${i}.txt`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true, active: false });
		}
		const reveal = async (index: number, width: number) => {
			model.openEditor(model.getEditorByIndex(index)!, { active: true });
			control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
			group.style.width = `${width}px`;
			control.layout({ container: new Dimension(width, 33), available: new Dimension(width, 300) }, { forceRevealActiveTab: true });
			await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
		};
		const results = [];
		for (const { width, from } of [{ width: 240, from: 3 }, { width: 172, from: 0 }, { width: 120, from: 0 }]) {
			await reveal(from, width);
			await reveal(1, width);
			const tab = container.querySelector<HTMLElement>('.tab.active')!;
			const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
			const viewport = container.querySelector<HTMLElement>('.monaco-scrollable-element')!.getBoundingClientRect();
			const shoulder = mainWindow.getComputedStyle(fill, '::before');
			const shoulderWidth = Number.parseFloat(shoulder.width);
			results.push({
				width,
				leftShoulderVisible: shoulder.content !== 'none' && fill.getBoundingClientRect().left - shoulderWidth >= viewport.left,
				rightShoulderVisible: fill.getBoundingClientRect().right + shoulderWidth <= viewport.right,
			});
		}
		await reveal(0, 240);
		const firstFill = container.querySelector<HTMLElement>('.tab.active > .tab-fill')!;
		const firstFillStyle = mainWindow.getComputedStyle(firstFill);
		assert.deepStrictEqual({
			results,
			firstBorderInset: firstFillStyle.left,
			firstBorderColor: firstFillStyle.borderLeftColor,
			firstShoulder: mainWindow.getComputedStyle(firstFill, '::before').content,
		}, {
			results: [
				{ width: 240, leftShoulderVisible: true, rightShoulderVisible: true },
				{ width: 172, leftShoulderVisible: true, rightShoulderVisible: false },
				{ width: 120, leftShoulderVisible: true, rightShoulderVisible: false },
			],
			firstBorderInset: '0px',
			firstBorderColor: 'rgba(0, 0, 0, 0)',
			firstShoulder: 'none',
		});
	});

	test('keeps replacement connected tabs visible after closing rightmost scrolled tabs', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.classList.add('hc-black');
		root.style.setProperty('--vscode-focusBorder', '#ffaa00');
		root.style.setProperty('--modern-ui-connected-tab-surface', '#333333');
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fixed', tabSizingFixedMinWidth: 160, tabSizingFixedMaxWidth: 160, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		for (let i = 2; i < 5; i++) {
			const editor = disposables.add(new TestFileEditorInput(URI.file(`/path/file${i}.txt`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true, active: true });
		}
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layoutConnectedGroup(group, 200);
		const tabs = container.querySelector<HTMLElement>('.tabs-container')!;
		const results = [];
		for (let count = 5; count > 2; count--) {
			tabs.classList.add('scroll');
			tabs.scrollLeft = tabs.scrollWidth - tabs.clientWidth;
			tabs.dispatchEvent(new UIEvent(EventType.SCROLL));
			tabs.classList.remove('scroll');
			const oldScrollLeft = tabs.scrollLeft;
			const closedEditor = model.getEditorByIndex(count - 1)!;
			model.closeEditor(closedEditor);
			control.closeEditor(closedEditor);
			const clampedBeforeLayout = tabs.scrollLeft < oldScrollLeft;
			await layoutConnectedGroup(group, 200);
			const activeTab = tabs.querySelector<HTMLElement>('.tab.active')!;
			const fill = activeTab.querySelector<HTMLElement>('.tab-fill')!;
			const fillStyle = mainWindow.getComputedStyle(fill);
			const edge = activeTab.querySelector<HTMLElement>('.tab-connected-edge')!;
			results.push({
				clampedBeforeLayout,
				activeIndex: model.indexOf(model.activeEditor!),
				scrolledToEnd: tabs.scrollLeft === tabs.scrollWidth - tabs.clientWidth,
				fillLeft: fill.getBoundingClientRect().left - tabs.getBoundingClientRect().left + tabs.scrollLeft,
				hidden: activeTab.classList.contains('connected-tab-hidden'),
				fillDisplay: fillStyle.display,
				outlineDisplay: mainWindow.getComputedStyle(edge).display,
				outlineColor: getTabStrokeStyle(activeTab).borderRightColor,
				insetFrame: mainWindow.getComputedStyle(group, '::after').content,
			});
		}
		assert.deepStrictEqual(results, [4, 3, 2].map(count => ({
			clampedBeforeLayout: true,
			activeIndex: count - 1,
			scrolledToEnd: true,
			fillLeft: (count - 1) * 160,
			hidden: false,
			fillDisplay: 'block',
			outlineDisplay: 'block',
			outlineColor: 'rgb(255, 170, 0)',
			insetFrame: 'none',
		})));
	});

	test('connected sticky offsets follow rendered widths without preserving filename extensions', async () => {
		const group = connectedGroup();
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fixed', tabSizingFixedMinWidth: 20, tabSizingFixedMaxWidth: 20, pinnedTabSizing: 'shrink', editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		const longExtension = disposables.add(new class extends TestFileEditorInput {
			override getName(): string { return 'example.dockerignore'; }
		}(URI.file('/path/example.dockerignore'), 'testEditorInput'));
		model.openEditor(longExtension, { index: 0, pinned: true, sticky: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		for (const editor of model.getEditors(EditorsOrder.SEQUENTIAL)) {
			model.stick(editor);
			control.stickEditor(editor);
		}
		await layoutConnectedGroup(group, 400);
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
		assert.deepStrictEqual({
			endEllipsis: mainWindow.getComputedStyle(tabs[0].querySelector<HTMLElement>('.monaco-icon-label-container')!).textOverflow,
			name: tabs[0].querySelector('.label-name')!.textContent,
			suffix: tabs[0].querySelector('.label-suffix')?.textContent ?? '',
			offsets: tabs.map(tab => tab.style.left),
		}, { endEllipsis: 'ellipsis', name: 'example.dockerignore', suffix: '', offsets: ['0px', `${tabs[0].offsetWidth}px`, `${tabs[0].offsetWidth + tabs[1].offsetWidth}px`] });
	});

	test('marks the connected clipping edge when it follows compact sticky tabs', async () => {
		const group = connectedGroup();
		const oldOptions = partOptions;
		partOptions = { ...partOptions, pinnedTabSizing: 'compact', editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		const firstEditor = model.getEditorByIndex(0)!;
		model.stick(firstEditor);
		control.stickEditor(firstEditor);
		model.openEditor(model.getEditorByIndex(1)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layoutConnectedGroup(group, 400);
		const overflowEdge = container.querySelector<HTMLElement>('.tab-connected-overflow-edge')!;
		assert.strictEqual(overflowEdge.classList.contains('connected-tab-adjacent-sticky'), true);
	});

	test('only the bottom wrapped row joins the document and upper row resets when unwrapped', async () => {
		const group = connectedGroup();
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		await layoutConnectedGroup(group, 150);
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'));
		const wrapped = tabs.map(tab => tab.classList.contains('connected-tab-upper-row'));
		const wrappedTop = tabs.map(tab => tab.classList.contains('connected-tab-top-row'));
		const fill = tabs[0].querySelector<HTMLElement>('.tab-fill')!;
		const upper = { inset: mainWindow.getComputedStyle(fill).top, shoulder: mainWindow.getComputedStyle(fill, '::after').content };
		await layoutConnectedGroup(group, 400);
		const unwrapped = tabs.map(tab => tab.classList.contains('connected-tab-upper-row'));
		const unwrappedTop = tabs.map(tab => tab.classList.contains('connected-tab-top-row'));
		assert.deepStrictEqual(
			{ wrapped, wrappedTop, upper, unwrapped, unwrappedTop },
			{ wrapped: [true, false], wrappedTop: [true, false], upper: { inset: '2px', shoulder: 'none' }, unwrapped: [false, false], unwrappedTop: [true, true] }
		);
	});

	test('connected fixed widths settle wrapping on the first scheduled layout', async () => {
		const group = connectedGroup();
		for (const editor of model.getEditors(EditorsOrder.SEQUENTIAL)) {
			model.closeEditor(editor);
			control.closeEditor(editor);
		}
		for (let index = 0; index < 6; index++) {
			const editor = disposables.add(new class extends TestFileEditorInput {
				override getName(): string { return '.markdown'; }
			}(URI.file(`/path/file${index}.markdown`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true, active: index === 0 });
		}
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 50, tabSizingFixedMaxWidth: 160, editorActionsLocation: 'hidden', hasIcons: false };
		control.updateOptions(oldOptions, partOptions);

		const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
		const unstableLayouts = [];
		for (const width of [230, 360, 400, 420, 440, 460, 480]) {
			await layoutConnectedGroup(group, width);
			const firstPass = {
				offsets: tabs.map(tab => tab.offsetTop),
				wrapping: container.querySelector('.tabs-and-actions-container')!.classList.contains('wrapping'),
			};
			await layoutConnectedGroup(group, width);
			const secondPass = {
				offsets: tabs.map(tab => tab.offsetTop),
				wrapping: container.querySelector('.tabs-and-actions-container')!.classList.contains('wrapping'),
			};
			if (firstPass.wrapping !== secondPass.wrapping || firstPass.offsets.some((top, index) => top !== secondPass.offsets[index])) {
				unstableLayouts.push({ width, firstPass, secondPass });
			}
		}

		assert.deepStrictEqual({
			unstableLayouts,
			widthsWithinConfiguredRange: tabs.every(tab => tab.offsetWidth >= 50 && tab.offsetWidth <= 160),
		}, {
			unstableLayouts: [],
			widthsWithinConfiguredRange: true,
		});
	});

	test('the first nonempty connected tab bar owns the top row after the pinned row empties', async () => {
		const group = connectedGroup();
		control.dispose();
		container.replaceChildren();
		const multiRowControl = disposables.add(instantiationService.createInstance(MultiRowEditorControl, container, editorPartsView, groupsView, groupView, model, undefined, false, false));
		multiRowControl.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layoutConnectedGroup(group, 400, multiRowControl);
		const tabBars = Array.from(container.querySelectorAll<HTMLElement>('.tabs-and-actions-container'));
		const unstickyTopRows = () => Array.from(tabBars[1].querySelectorAll<HTMLElement>('.tabs-container > .tab'), tab => tab.classList.contains('connected-tab-top-row'));
		const initiallyEmpty = {
			pinnedRowEmpty: tabBars[0].classList.contains('empty'),
			top: unstickyTopRows(),
		};

		const stickyEditor = model.getEditorByIndex(0)!;
		model.stick(stickyEditor);
		multiRowControl.stickEditor(stickyEditor);
		await layoutConnectedGroup(group, 400, multiRowControl);
		const withPinnedRow = unstickyTopRows();

		model.unstick(stickyEditor);
		multiRowControl.unstickEditor(stickyEditor);
		await layoutConnectedGroup(group, 400, multiRowControl);

		assert.deepStrictEqual({
			initiallyEmpty,
			withPinnedRow,
			pinnedRowEmptyAfterFinalUnpin: tabBars[0].classList.contains('empty'),
			afterFinalUnpin: unstickyTopRows(),
		}, {
			initiallyEmpty: { pinnedRowEmpty: true, top: [true, true] },
			withPinnedRow: [false],
			pinnedRowEmptyAfterFinalUnpin: true,
			afterFinalUnpin: [true, true],
		});
	});

	test('connected wrapping state aggregates across separate pinned and unpinned rows', async () => {
		const group = connectedGroup();
		control.dispose();
		container.replaceChildren();
		for (let index = model.count; index < 6; index++) {
			const editor = disposables.add(new TestFileEditorInput(URI.file(`/path/aggregate-${index}.ts`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true });
		}
		const oldOptions = partOptions;
		partOptions = { ...partOptions, pinnedTabsOnSeparateRow: true, wrapTabs: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
		const multiRowControl = disposables.add(instantiationService.createInstance(MultiRowEditorControl, container, editorPartsView, groupsView, groupView, model, undefined, false, false));
		multiRowControl.updateOptions(oldOptions, partOptions);
		const stickyEditor = model.getEditorByIndex(0)!;
		model.stick(stickyEditor);
		multiRowControl.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layoutConnectedGroup(group, 150, multiRowControl);
		const tabBars = Array.from(container.querySelectorAll<HTMLElement>('.tabs-and-actions-container'));
		const initiallyWrapped = {
			pinned: tabBars[0].classList.contains('wrapping'),
			unpinned: tabBars[1].classList.contains('wrapping'),
			aggregate: container.classList.contains('connected-tabs-wrapping'),
		};

		multiRowControl.updateEditorDirty(stickyEditor);
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));

		assert.deepStrictEqual({
			initiallyWrapped,
			afterPinnedOnlyLayout: container.classList.contains('connected-tabs-wrapping'),
		}, {
			initiallyWrapped: { pinned: false, unpinned: true, aggregate: true },
			afterPinnedOnlyLayout: true,
		});
	});

	test('connected wrapped last tab adds its shoulder to the editor actions margin', async () => {
		const group = connectedGroup();
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);

		await layoutConnectedGroup(group, 150);
		const tabsAndActionsContainer = container.querySelector<HTMLElement>('.tabs-and-actions-container')!;
		const tabsContainer = container.querySelector<HTMLElement>('.tabs-container')!;
		tabsContainer.style.setProperty('--last-tab-margin-right', '17px');
		tabsContainer.style.setProperty('--modern-ui-connected-tab-shoulder-radius', '5px');
		const lastTab = tabsContainer.querySelector<HTMLElement>('.tab:last-child')!;

		assert.deepStrictEqual({
			wrapping: tabsAndActionsContainer.classList.contains('wrapping'),
			active: lastTab.classList.contains('active'),
			margin: mainWindow.getComputedStyle(lastTab).marginRight,
		}, {
			wrapping: true,
			active: false,
			margin: '22px',
		});
	});

	test('connected tab positions and spacing stay fixed when changing selection', async () => {
		const group = connectedGroup();
		for (let index = 2; index < 6; index++) {
			const editor = disposables.add(new TestFileEditorInput(URI.file(`/path/file${index}.txt`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true, active: false });
		}
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
		const measure = () => tabs.map(tab => ({
			left: tab.offsetLeft,
			top: tab.offsetTop,
			width: tab.getBoundingClientRect().width,
			margin: mainWindow.getComputedStyle(tab).marginRight,
		}));
		const mismatches = [];
		for (const { tabSizing, highContrast } of (['fit', 'fixed'] as const).flatMap(tabSizing => [false, true].map(highContrast => ({ tabSizing, highContrast })))) {
			group.closest<HTMLElement>('.monaco-workbench')!.classList.toggle('hc-black', highContrast);
			for (const wrapTabs of [false, true]) {
				const oldOptions = partOptions;
				partOptions = { ...partOptions, tabSizing, wrapTabs, tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
				control.updateOptions(oldOptions, partOptions);
				for (const width of wrapTabs ? [245, 365] : [1000]) {
					await layoutConnectedGroup(group, width);
					const baseline = measure();
					for (let activeIndex = 0; activeIndex < tabs.length; activeIndex++) {
						model.openEditor(model.getEditorByIndex(activeIndex)!, { active: true });
						control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
						await layoutConnectedGroup(group, width);
						const actual = measure();
						if (JSON.stringify(actual) !== JSON.stringify(baseline)) {
							mismatches.push({ tabSizing, highContrast, wrapTabs, width, activeIndex, baseline, actual });
						}
						for (let index = 1; index < tabs.length; index++) {
							const previous = tabs[index - 1].getBoundingClientRect();
							const current = tabs[index].getBoundingClientRect();
							if (previous.top === current.top && Math.abs(current.left - previous.right) > 0.01) {
								mismatches.push({ tabSizing, highContrast, wrapTabs, width, activeIndex, gapAfter: index - 1, gap: current.left - previous.right });
							}
						}
					}
				}
			}
		}
		assert.deepStrictEqual(mismatches, []);
	});

	test('connected close action bounds stay fixed across selection and focus changes', async () => {
		const group = connectedGroup();
		for (let index = 2; index < 6; index++) {
			const editor = disposables.add(new TestFileEditorInput(URI.file(`/path/file${index}.txt`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true, active: false });
		}
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const actions = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab .action-label'));
		const bounds = (action: HTMLElement) => {
			const { x, y, width, height } = action.getBoundingClientRect();
			return { x, y, width, height };
		};
		const measure = () => actions.map(action => {
			const resting = bounds(action);
			action.focus();
			const focused = bounds(action);
			action.blur();
			return { resting, focused };
		});
		const mismatches = [];
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--vscode-contrastActiveBorder', '#f38518');
		root.style.setProperty('--vscode-focusBorder', '#f38518');
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const tabHeight of ['default', 'compact'] as const) {
				for (const tabActionLocation of ['right', 'left'] as const) {
					for (const wrapTabs of [false, true]) {
						const oldOptions = partOptions;
						partOptions = { ...partOptions, tabHeight, tabActionLocation, wrapTabs, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
						control.updateOptions(oldOptions, partOptions);
						await layoutConnectedGroup(group, wrapTabs ? 245 : 1000);
						const baseline = measure().map(({ resting }) => ({ resting, focused: resting }));
						for (let activeIndex = 0; activeIndex < actions.length; activeIndex++) {
							model.openEditor(model.getEditorByIndex(activeIndex)!, { active: true });
							control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
							await layoutConnectedGroup(group, wrapTabs ? 245 : 1000);
							const actual = measure();
							if (JSON.stringify(actual) !== JSON.stringify(baseline)) {
								mismatches.push({ theme, tabHeight, tabActionLocation, wrapTabs, activeIndex, baseline, actual });
							}
						}
					}
				}
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual({ actionCount: actions.length, mismatches }, { actionCount: model.count, mismatches: [] });
	});

	test('connected fills share Pill gutters and round corners away from the frame', async () => {
		const group = connectedGroup();
		for (let index = 2; index < 6; index++) {
			const editor = disposables.add(new TestFileEditorInput(URI.file(`/path/file${index}.txt`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true, active: false });
		}
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
		const actual = [];
		const expected = [];
		for (const compact of [false, true]) {
			group.closest<HTMLElement>('.monaco-workbench')!.classList.toggle('modern-ui-compact', compact);
			for (const wrapTabs of [false, true]) {
				const oldOptions = partOptions;
				partOptions = { ...partOptions, wrapTabs, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
				control.updateOptions(oldOptions, partOptions);
				for (const activeIndex of [0, 1, 4, 5]) {
					model.openEditor(model.getEditorByIndex(activeIndex)!, { active: true });
					control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
					await layoutConnectedGroup(group, wrapTabs ? 245 : 1000);
					for (const [index, tab] of tabs.entries()) {
						const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
						const bounds = tab.getBoundingClientRect();
						const surface = fill.getBoundingClientRect();
						const style = mainWindow.getComputedStyle(fill);
						const rowStart = index === 0 || tabs[index - 1].offsetTop !== tab.offsetTop;
						const upper = tab.classList.contains('connected-tab-upper-row');
						const active = index === activeIndex;
						const radius = active && !upper ? wrapTabs ? '5px' : '7px' : '4px';
						const roundLeft = !rowStart || upper || !active;
						const topLeftRadius = roundLeft ? radius : '0px';
						const context = { compact, wrapTabs, activeIndex, index };
						actual.push({
							...context,
							insets: [surface.left - bounds.left, bounds.right - surface.right, surface.top - bounds.top],
							corners: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
							leftBorder: rowStart ? style.borderLeftColor : undefined,
						});
						expected.push({
							...context,
							insets: active && !upper ? [wrapTabs && rowStart ? -2 : 0, 0, wrapTabs ? 2 : 0] : [2, 2, wrapTabs ? 2 : 0],
							corners: [topLeftRadius, radius, active && !upper ? '0px' : '4px', active && !upper ? '0px' : '4px'],
							leftBorder: rowStart ? 'rgba(0, 0, 0, 0)' : undefined,
						});
					}
				}
			}
		}
		assert.deepStrictEqual(actual, expected);
	});

	test('fit-sized connected row markers stay consistent at wrapping boundaries', async () => {
		const group = connectedGroup();
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fit', editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		for (let index = 2; index < 4; index++) {
			const editor = disposables.add(new TestFileEditorInput(URI.file(`/path/file${index}.txt`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true, active: false });
		}
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layoutConnectedGroup(group, 300);
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
		const mismatches = [];
		for (const tabHeight of ['default', 'compact'] as const) {
			const oldOptions = partOptions;
			partOptions = { ...partOptions, tabHeight };
			control.updateOptions(oldOptions, partOptions);
			container.classList.toggle('compact-height', tabHeight === 'compact');
			await layoutConnectedGroup(group, 300);
			const boundary = tabs[0].offsetWidth + tabs[1].offsetWidth;
			const widths = Array.from({ length: 21 }, (_, index) => boundary - 10 + index);
			for (const width of [...widths, ...widths.reverse()]) {
				for (const activeIndex of [0, 1, 3]) {
					model.openEditor(model.getEditorByIndex(activeIndex)!, { active: true });
					control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
					await layoutConnectedGroup(group, width);
					const wrapping = container.querySelector('.tabs-and-actions-container')!.classList.contains('wrapping');
					for (const [index, tab] of tabs.entries()) {
						const expected = {
							top: tab.offsetTop === tabs[0].offsetTop,
							upper: tab.offsetTop !== tabs.at(-1)!.offsetTop,
							last: wrapping && (index === tabs.length - 1 || tab.offsetTop !== tabs[index + 1].offsetTop),
						};
						const actual = {
							top: tab.classList.contains('connected-tab-top-row'),
							upper: tab.classList.contains('connected-tab-upper-row'),
							last: tab.classList.contains('last-in-row'),
						};
						if (actual.top !== expected.top || actual.upper !== expected.upper || actual.last !== expected.last) {
							mismatches.push({ tabHeight, width, activeIndex, index, expected, actual });
						}
					}
				}
			}
		}
		assert.deepStrictEqual(mismatches, []);
	});

	test('selected wrapped tabs and focused actions use the document surface on every row', async () => {
		const group = connectedGroup();
		const root = group.closest('.monaco-workbench')!;
		group.style.setProperty('--vscode-focusBorder', '#ffaa00');
		group.style.setProperty('--modern-ui-connected-tab-surface', '#123456');
		group.style.setProperty('--vscode-editorGroupHeader-tabsBackground', '#654321');
		group.style.setProperty('--modern-ui-editor-tab-active-background', '#654321');
		group.style.setProperty('--vscode-modernEditorTab-activeActionBackground', '#654321');
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		const measurements = [];
		const expected = [];
		for (const activeIndex of [0, 1]) {
			model.openEditor(model.getEditorByIndex(activeIndex)!, { active: true });
			control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
			await layoutConnectedGroup(group, 150);
			const tab = container.querySelector<HTMLElement>('.tab.active')!;
			const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
			const actions = tab.querySelector<HTMLElement>('.tab-actions')!;
			const action = actions.querySelector<HTMLElement>('.action-label')!;
			action.tabIndex = 0;
			for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
				root.classList.add(theme);
				for (const activeGroup of [true, false]) {
					group.classList.toggle('active', activeGroup);
					action.focus();
					const focusStyle = mainWindow.getComputedStyle(action);
					const windowFocused = mainWindow.document.hasFocus();
					measurements.push({
						activeIndex, theme, activeGroup,
						actionFocused: mainWindow.document.activeElement === action,
						cssFocused: action.matches(':focus'),
						upperRow: tab.classList.contains('connected-tab-upper-row'),
						fill: mainWindow.getComputedStyle(fill).backgroundColor,
						actions: mainWindow.getComputedStyle(actions).backgroundColor,
						focusOutline: theme.startsWith('hc-') && windowFocused ? [focusStyle.outlineWidth, focusStyle.outlineStyle, focusStyle.outlineColor] : undefined,
					});
					expected.push({ activeIndex, theme, activeGroup, actionFocused: true, cssFocused: windowFocused, upperRow: activeIndex === 0, fill: 'rgb(18, 52, 86)', actions: 'rgba(0, 0, 0, 0)', focusOutline: theme.startsWith('hc-') && windowFocused ? ['1px', 'solid', 'rgb(255, 170, 0)'] : undefined });
				}
				root.classList.remove(theme);
			}
			action.blur();
		}
		assert.deepStrictEqual(measurements, expected);
	});

	test('customized connected backgrounds fill the shoulders without straight masks covering their curves', async () => {
		const group = connectedGroup();
		group.style.setProperty('--modern-ui-connected-tab-surface', '#123456');
		group.style.setProperty('--modern-ui-editor-tab-custom-active-background', '#164e63');
		group.style.setProperty('--modern-ui-editor-tab-custom-border', '#22d3ee');
		model.openEditor(model.getEditorByIndex(1)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layoutConnectedGroup(group, 320);
		const tab = container.querySelector<HTMLElement>('.tab.active')!;
		const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
		const edge = tab.querySelector<HTMLElement>('.tab-connected-edge')!;
		assert.deepStrictEqual({
			fill: mainWindow.getComputedStyle(fill).backgroundColor,
			fillBorder: mainWindow.getComputedStyle(fill).borderColor,
			outline: [mainWindow.getComputedStyle(edge).borderLeftColor, mainWindow.getComputedStyle(edge).borderBottomWidth, mainWindow.getComputedStyle(edge).clipPath],
			shoulders: ['::before', '::after'].map(pseudo => mainWindow.getComputedStyle(fill, pseudo).boxShadow),
			masks: ['::before', '::after'].map(pseudo => mainWindow.getComputedStyle(edge, pseudo).content),
		}, {
			fill: 'rgb(22, 78, 99)',
			fillBorder: 'rgba(0, 0, 0, 0)',
			outline: ['rgb(34, 211, 238)', '0px', 'inset(0px 0px 7px)'],
			shoulders: ['rgb(22, 78, 99) 3.5px 3.5px 0px 3.5px', 'rgb(22, 78, 99) -3.5px 3.5px 0px 3.5px'],
			masks: ['none', 'none'],
		});
	});

	test('HC connected multi-selection uses the cap outline and leaves the document join open', async () => {
		const group = connectedGroup();
		const root = group.closest('.monaco-workbench')!;
		root.classList.add('hc-black');
		group.style.setProperty('--vscode-contrastActiveBorder', '#ffaa00');
		group.style.setProperty('--vscode-focusBorder', '#00ff00');
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		model.setSelection(model.activeEditor!, [model.getEditorByIndex(1)!]);
		control.updateEditorSelections();
		await layoutConnectedGroup(group, 320);
		const tab = container.querySelector<HTMLElement>('.tab.active')!;
		tab.blur();
		const fill = mainWindow.getComputedStyle(tab.querySelector<HTMLElement>('.tab-fill')!);
		const indicator = mainWindow.getComputedStyle(tab.querySelector<HTMLElement>('.tab-border-top-container')!);
		assert.deepStrictEqual({
			multiSelected: tab.classList.contains('multi-selected'),
			outline: fill.outlineStyle,
			capColor: getTabStrokeStyle(tab).borderRightColor,
			borders: [indicator.borderTopWidth, indicator.borderRightWidth, indicator.borderBottomWidth, indicator.borderLeftWidth],
			ariaSelected: tab.getAttribute('aria-selected'),
		}, {
			multiSelected: true,
			outline: 'none',
			capColor: 'rgb(255, 170, 0)',
			borders: ['0px', '0px', '0px', '0px'],
			ariaSelected: 'true',
		});
	});

	test('regular-theme Connected active multi-selection leaves the document join open', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--vscode-tab-activeBorderTop', '#ffaa00');
		const themeService = instantiationService.get(IThemeService);
		assert.ok(themeService instanceof TestThemeService);
		themeService.setTheme(new TestColorTheme({ 'tab.activeBorderTop': '#ffaa00', 'tab.selectedBorderTop': '#ffaa00' }));
		const active = model.getEditorByIndex(1)!;
		model.openEditor(active, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const results = [];
		for (const theme of ['vs', 'vs-dark']) {
			root.classList.add(theme);
			for (const tabHeight of ['default', 'compact'] as const) {
				for (const wrapTabs of [false, true]) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, tabHeight, wrapTabs, editorActionsLocation: 'hidden', tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120 };
					control.updateOptions(oldOptions, partOptions);
					model.setSelection(active, [model.getEditorByIndex(0)!]);
					control.updateEditorSelections();
					await layoutConnectedGroup(group, wrapTabs ? 150 : 600);
					const tab = container.querySelector<HTMLElement>('.tab.active')!;
					const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
					const style = mainWindow.getComputedStyle(fill);
					results.push({
						theme, tabHeight, wrapTabs,
						attachedSelection: tab.classList.contains('multi-selected') && !tab.classList.contains('connected-tab-upper-row'),
						fillBottom: [style.borderBottomWidth, style.borderBottomColor],
						capColor: getTabStrokeStyle(tab).borderRightColor,
						capBottom: getTabStrokeStyle(tab).borderBottomWidth,
						shoulderColor: mainWindow.getComputedStyle(fill, '::after').borderBottomColor,
					});
				}
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, attachedSelection: true, fillBottom: ['0px', 'rgba(0, 0, 0, 0)'], capColor: 'rgb(255, 170, 0)', capBottom: '0px', shoulderColor: 'rgb(255, 170, 0)' })));
	});

	test('HC connected selection keeps its outline independent of modified highlighting', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--vscode-contrastBorder', '#00ffff');
		root.style.setProperty('--vscode-focusBorder', '#ffaa00');
		root.style.setProperty('--vscode-contrastActiveBorder', '#ffaa00');
		root.style.setProperty('--vscode-tab-selectedBorderTop', '#0080ff');
		for (const name of ['modifiedOnly', 'modifiedSelected']) {
			const editor = disposables.add(new TestFileEditorInput(URI.file(`/path/${name}.ts`), 'testEditorInput'));
			editor.setDirty();
			model.openEditor(editor, { index: model.count, pinned: true, active: false });
		}
		const editors = model.getEditors(EditorsOrder.SEQUENTIAL);
		control.openEditors(editors);
		const themeService = instantiationService.get(IThemeService);
		assert.ok(themeService instanceof TestThemeService);
		const measurements = [];
		const expected = [];
		for (const theme of ['hc-black', 'hc-light']) {
			root.classList.add(theme);
			themeService.setTheme(new TestColorTheme({
				'tab.activeModifiedBorder': '#ffffff',
				'tab.inactiveModifiedBorder': '#ffffff',
				'tab.selectedBorderTop': '#ffaa00',
			}, theme === 'hc-black' ? ColorScheme.HIGH_CONTRAST_DARK : ColorScheme.HIGH_CONTRAST_LIGHT));
			for (const tabHeight of ['default', 'compact'] as const) {
				for (const wrapTabs of [false, true]) {
					for (const highlightModifiedTabs of [false, true]) {
						const oldOptions = partOptions;
						partOptions = { ...partOptions, tabHeight, wrapTabs, highlightModifiedTabs, editorActionsLocation: 'hidden', tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120 };
						control.updateOptions(oldOptions, partOptions);
						container.classList.toggle('compact-height', tabHeight === 'compact');
						for (const activeIndex of [0, 3]) {
							model.openEditor(editors[activeIndex], { active: true });
							control.openEditors(editors);
							model.setSelection(editors[activeIndex], []);
							control.updateEditorSelections();
							await layoutConnectedGroup(group, wrapTabs ? 150 : 600);
							const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'));
							const geometry = tabs.map(tab => ({
								tab: tab.getBoundingClientRect().toJSON(),
								action: tab.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect().toJSON(),
							}));
							for (const multiSelected of [false, true, false]) {
								model.setSelection(editors[activeIndex], multiSelected ? editors.filter((_, index) => index !== activeIndex && index !== 2) : []);
								control.updateEditorSelections();
								await layoutConnectedGroup(group, wrapTabs ? 150 : 600);
								for (const [index, tab] of tabs.entries()) {
									const accent = getTabTopAccent(tab);
									const style = accent.style;
									const painted = accent.visible && accent.color !== 'rgba(0, 0, 0, 0)';
									const selected = multiSelected && index !== 2;
									const modified = index >= 2 && highlightModifiedTabs;
									const context = { theme, tabHeight, wrapTabs, highlightModifiedTabs, activeIndex, multiSelected, index };
									measurements.push({
										...context,
										color: painted ? accent.color : undefined,
										thickness: painted ? accent.height : undefined,
										topOffset: painted ? accent.topOffset : undefined,
										clippedToFill: mainWindow.getComputedStyle(tab.querySelector<HTMLElement>(tab.classList.contains('active') && !tab.classList.contains('connected-tab-upper-row') ? '.tab-connected-edge' : '.tab-fill')!).overflow === 'hidden',
										selectedStroke: selected ? getTabStrokeStyle(tab).borderRightColor : undefined,
										borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
										geometryStable: JSON.stringify(geometry[index]) === JSON.stringify({ tab: tab.getBoundingClientRect().toJSON(), action: tab.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect().toJSON() }),
										ariaSelected: tab.getAttribute('aria-selected'),
									});
									expected.push({
										...context,
										color: modified ? 'rgb(255, 255, 255)' : undefined,
										thickness: modified ? 2 : undefined,
										topOffset: modified ? 0 : undefined,
										clippedToFill: true,
										selectedStroke: selected ? 'rgb(255, 170, 0)' : undefined,
										borders: ['0px', '0px', '0px', '0px'],
										geometryStable: true,
										ariaSelected: index === activeIndex || selected ? 'true' : 'false',
									});
								}
							}
						}
					}
				}
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(measurements, expected);
	});

	test('freestanding connected neighbors keep one stroke each and equal gutters without moving hit targets', async () => {
		const group = connectedGroup();
		const root = group.closest('.monaco-workbench')!;
		root.classList.add('hc-light');
		const editor = disposables.add(new TestFileEditorInput(URI.file('/path/third.ts'), 'testEditorInput'));
		model.openEditor(editor, { index: model.count, pinned: true, active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layoutConnectedGroup(group, 600);
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'));
		const fills = tabs.map(tab => tab.querySelector<HTMLElement>('.tab-fill')!);
		const inactiveGap = fills[1].getBoundingClientRect().left - fills[0].getBoundingClientRect().right;
		model.openEditor(model.getEditorByIndex(0)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layoutConnectedGroup(group, 600);
		assert.deepStrictEqual({
			inactiveGap,
			activeNeighborLeftBorder: mainWindow.getComputedStyle(fills[1]).borderLeftWidth,
			hitTargetsContiguous: tabs.slice(1).every((tab, index) => tab.getBoundingClientRect().left === tabs[index].getBoundingClientRect().right),
		}, {
			inactiveGap: 4,
			activeNeighborLeftBorder: '1px',
			hitTargetsContiguous: true,
		});
	});

	test('single-row Connected inactive tabs use dividers while retaining high-contrast interaction strokes', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--vscode-tab-border', '#abcdef');
		root.style.setProperty('--vscode-tab-divider', '#abcdef');
		root.style.setProperty('--vscode-focusBorder', '#ffaa00');
		root.style.setProperty('--vscode-contrastActiveBorder', '#ffaa00');
		openNamedEditors(['first.ts', 'second.ts', 'third.ts']);
		model.openEditor(model.getEditorByIndex(0)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const measurements = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const direction of ['ltr', 'rtl']) {
				root.dir = direction;
				for (const tabHeight of ['default', 'compact'] as const) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, wrapTabs: false, tabHeight };
					control.updateOptions(oldOptions, partOptions);
					await layoutConnectedGroup(group, 600);
					const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'));
					const peer = tabs[1];
					const fill = peer.querySelector<HTMLElement>('.tab-fill')!;
					const resting = mainWindow.getComputedStyle(fill);
					const restingBorder = [resting.borderTopColor, resting.borderRightColor, resting.borderBottomColor, resting.borderLeftColor];
					const bounds = peer.getBoundingClientRect().toJSON();
					peer.classList.add('hovered');
					const hoverStroke = mainWindow.getComputedStyle(fill).borderLeftColor;
					peer.classList.remove('hovered');
					peer.classList.add('selected');
					const selectedStroke = mainWindow.getComputedStyle(fill).borderLeftColor;
					peer.classList.remove('selected');
					peer.focus();
					const focusStroke = mainWindow.getComputedStyle(fill).borderLeftColor;
					const cssFocused = peer.matches(':focus');
					peer.blur();
					const dividerElement = tabs[2].querySelector<HTMLElement>('.tab-divider')!;
					const divider = mainWindow.getComputedStyle(dividerElement);
					const dividerBounds = dividerElement.getBoundingClientRect();
					const neighborBounds = peer.getBoundingClientRect();
					measurements.push({
						theme, direction, tabHeight,
						restingBorder,
						divider: [divider.display, divider.backgroundColor, divider.width, divider.height],
						dividerAtBoundary: Math.abs(direction === 'rtl' ? dividerBounds.right - neighborBounds.left : dividerBounds.left - neighborBounds.right) < 1 / 64,
						activeNeighborDivider: mainWindow.getComputedStyle(peer.querySelector<HTMLElement>('.tab-divider')!).display,
						cssFocused,
						interactionStrokes: theme.startsWith('hc-') ? [hoverStroke, selectedStroke, focusStroke] : undefined,
						geometryStable: JSON.stringify(bounds) === JSON.stringify(peer.getBoundingClientRect().toJSON()),
						controlHeight: control.getHeight(),
					});
				}
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(measurements, measurements.map(result => ({
			...result,
			restingBorder: Array(4).fill('rgba(0, 0, 0, 0)'),
			divider: ['block', 'rgb(171, 205, 239)', '1px', '16px'],
			dividerAtBoundary: true,
			activeNeighborDivider: 'none',
			interactionStrokes: result.theme.startsWith('hc-') ? ['rgb(171, 205, 239)', 'rgb(255, 170, 0)', result.cssFocused ? 'rgb(255, 170, 0)' : 'rgb(171, 205, 239)'] : undefined,
			geometryStable: true,
			controlHeight: result.tabHeight === 'compact' ? 23 : 25,
		})));
	});

	test('wrapped fills retain equal content heights and only the active bottom cap joins the document', async () => {
		const group = connectedGroup();
		group.style.setProperty('--modern-ui-connected-tab-surface', '#ffffff');
		group.style.setProperty('--modern-ui-editor-tab-custom-border', '#22d3ee');
		model.openEditor(model.getEditorByIndex(1)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const measurements = [];
		for (const tabHeight of ['default', 'compact'] as const) {
			const oldOptions = partOptions;
			partOptions = { ...partOptions, wrapTabs: true, tabHeight, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
			control.updateOptions(oldOptions, partOptions);
			container.classList.toggle('compact-height', tabHeight === 'compact');
			await layoutConnectedGroup(group, 150);
			const strip = container.querySelector<HTMLElement>('.tabs-and-actions-container')!;
			const tab = strip.querySelector<HTMLElement>('.tab.active')!;
			const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
			const fillStyle = mainWindow.getComputedStyle(fill);
			const shoulderStyle = mainWindow.getComputedStyle(fill, '::after');
			const stripStyle = mainWindow.getComputedStyle(strip, '::after');
			const stripBounds = strip.getBoundingClientRect();
			const tabBounds = tab.getBoundingClientRect();
			const separatorTop = stripBounds.bottom - parseFloat(stripStyle.bottom) - parseFloat(stripStyle.height);
			const clippingBottom = Math.min(...Array.from(strip.querySelectorAll<HTMLElement>('.tabs-container, .monaco-scrollable-element'), element => element.getBoundingClientRect().bottom));
			const fills = Array.from(strip.querySelectorAll<HTMLElement>('.tab-fill'), element => element.getBoundingClientRect());
			const tabs = Array.from(strip.querySelectorAll<HTMLElement>('.tab'), element => element.getBoundingClientRect());
			measurements.push({
				tabHeight,
				stripHeight: strip.getBoundingClientRect().height,
				wrapping: strip.classList.contains('wrapping'),
				upperRow: tab.classList.contains('connected-tab-upper-row'),
				gap: strip.getBoundingClientRect().bottom - fill.getBoundingClientRect().bottom,
				clippingGap: strip.getBoundingClientRect().bottom - clippingBottom,
				bottomRadius: fillStyle.borderBottomRightRadius,
				shoulder: mainWindow.getComputedStyle(fill, '::after').content,
				shoulderStroke: [shoulderStyle.borderLeftColor, shoulderStyle.borderBottomColor],
				shoulderBaselineOffset: fill.getBoundingClientRect().bottom - parseFloat(fillStyle.borderBottomWidth) - parseFloat(shoulderStyle.bottom) - (separatorTop + parseFloat(stripStyle.height)),
				tabContentHeights: fills.map((rect, index) => rect.height - (index === 1 ? 3 : 0)),
				hitboxHeights: tabs.map(rect => rect.height),
				bottomJoin: fill.getBoundingClientRect().bottom - tabBounds.bottom + 2,
				rowGap: fills[1].top - fills[0].bottom,
				overflow: Array.from(strip.querySelectorAll<HTMLElement>('.tabs-container, .monaco-scrollable-element'), element => mainWindow.getComputedStyle(element).overflow),
				separatorOffset: separatorTop - tabBounds.bottom,
				connectionOverlap: fill.getBoundingClientRect().bottom - stripBounds.bottom,
			});
		}
		assert.deepStrictEqual(measurements, [
			{ tabHeight: 'default', stripHeight: 59, wrapping: true, upperRow: false, gap: 0, clippingGap: 0, bottomRadius: '0px', shoulder: '""', shoulderStroke: ['rgb(34, 211, 238)', 'rgb(34, 211, 238)'], shoulderBaselineOffset: 0, tabContentHeights: [24, 24], hitboxHeights: [28, 28], bottomJoin: 3, rowGap: 4, overflow: ['visible', 'visible'], separatorOffset: 0, connectionOverlap: 0 },
			{ tabHeight: 'compact', stripHeight: 51, wrapping: true, upperRow: false, gap: 0, clippingGap: 0, bottomRadius: '0px', shoulder: '""', shoulderStroke: ['rgb(34, 211, 238)', 'rgb(34, 211, 238)'], shoulderBaselineOffset: 0, tabContentHeights: [20, 20], hitboxHeights: [24, 24], bottomJoin: 3, rowGap: 4, overflow: ['visible', 'visible'], separatorOffset: 0, connectionOverlap: 0 },
		]);
	});

	test('wrapped connected tabs include title padding in the available height constraint', async () => {
		const group = connectedGroup();
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		await layoutConnectedGroup(group, 150);
		const strip = container.querySelector<HTMLElement>('.tabs-and-actions-container')!;
		const tabs = container.querySelector<HTMLElement>('.tabs-container')!;
		const wrappedHeights = { strip: strip.offsetHeight, tabs: tabs.offsetHeight };

		control.layout({ container: new Dimension(150, 33), available: new Dimension(150, wrappedHeights.tabs) });
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
		const constrainedByTabsHeight = strip.classList.contains('wrapping');

		control.layout({ container: new Dimension(150, 33), available: new Dimension(150, wrappedHeights.strip) });
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));

		assert.deepStrictEqual({
			wrappedHeights,
			constrainedByTabsHeight,
			fitsAtFullStripHeight: strip.classList.contains('wrapping'),
		}, {
			wrappedHeights: { strip: 59, tabs: 57 },
			constrainedByTabsHeight: false,
			fitsAtFullStripHeight: true,
		});
	});

	test('three wrapped rows retain equal tab heights without a fixed strip height', async () => {
		const group = connectedGroup();
		group.style.setProperty('--modern-ui-connected-tab-surface', '#ffffff');
		const editor = disposables.add(new TestFileEditorInput(URI.file('/path/third.ts'), 'testEditorInput'));
		model.openEditor(editor, { index: model.count, pinned: true, active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const measurements = [];
		for (const tabHeight of ['default', 'compact'] as const) {
			const oldOptions = partOptions;
			partOptions = { ...partOptions, wrapTabs: true, tabHeight, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
			control.updateOptions(oldOptions, partOptions);
			container.classList.toggle('compact-height', tabHeight === 'compact');
			await layoutConnectedGroup(group, 150);
			const strip = container.querySelector<HTMLElement>('.tabs-and-actions-container')!.getBoundingClientRect();
			const fills = Array.from(container.querySelectorAll<HTMLElement>('.tab-fill'), fill => fill.getBoundingClientRect());
			const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'), tab => tab.getBoundingClientRect());
			measurements.push({
				tabHeight,
				stripHeight: strip.height,
				tabContentHeights: fills.map((fill, index) => fill.height - (index === 2 ? 3 : 0)),
				hitboxHeights: tabs.map(tab => tab.height),
				bottomCapActive: container.querySelector<HTMLElement>('.tab.connected-tab-last')!.classList.contains('active'),
				rowGaps: fills.slice(1).map((fill, index) => fill.top - fills[index].bottom),
			});
		}
		assert.deepStrictEqual(measurements, [
			{ tabHeight: 'default', stripHeight: 87, tabContentHeights: [24, 24, 24], hitboxHeights: [28, 28, 28], bottomCapActive: true, rowGaps: [4, 4] },
			{ tabHeight: 'compact', stripHeight: 75, tabContentHeights: [20, 20, 20], hitboxHeights: [24, 24, 24], bottomCapActive: true, rowGaps: [4, 4] },
		]);
	});

	test('connected tabs do not overflow vertically while dragging', async () => {
		const group = connectedGroup();
		group.style.setProperty('--modern-ui-connected-tab-surface', '#ffffff');
		model.openEditor(model.getEditorByIndex(1)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const measurements = [];
		for (const [wrapTabs, width] of [[false, 320], [true, 150]] as const) {
			const oldOptions = partOptions;
			partOptions = { ...partOptions, wrapTabs, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
			control.updateOptions(oldOptions, partOptions);
			await layoutConnectedGroup(group, width);
			const tabs = container.querySelector<HTMLElement>('.tabs-container')!;
			tabs.classList.add('scroll');
			measurements.push({
				wrapTabs,
				wrapping: tabs.closest('.tabs-and-actions-container')!.classList.contains('wrapping'),
				verticalOverflow: tabs.scrollHeight - tabs.clientHeight,
			});
		}
		assert.deepStrictEqual(measurements, [
			{ wrapTabs: false, wrapping: false, verticalOverflow: 0 },
			{ wrapTabs: true, wrapping: true, verticalOverflow: 0 },
		]);
	});

	test('connected row heights match across single, wrapped, and separate pinned layouts', async () => {
		const group = connectedGroup();
		group.style.setProperty('--modern-ui-editor-tab-custom-active-background', '#164e63');
		group.style.setProperty('--modern-ui-editor-tab-custom-inactive-background', '#1e293b');
		control.dispose();
		const third = disposables.add(new TestFileEditorInput(URI.file('/path/third.ts'), 'testEditorInput'));
		model.openEditor(third, { pinned: true, active: false });
		const first = model.getEditorByIndex(0)!;
		const measurements = [];
		for (const tabHeight of ['default', 'compact'] as const) {
			for (const layout of ['single', 'wrapped', 'pinned', 'pinned-wrapped', 'pinned-wrapped-empty'] as const) {
				const wrapped = layout === 'wrapped' || layout.startsWith('pinned-wrapped');
				const separatePinnedRow = layout.startsWith('pinned');
				partOptions = { ...partOptions, tabHeight, wrapTabs: wrapped, pinnedTabsOnSeparateRow: separatePinnedRow, pinnedTabSizing: 'normal', tabActionUnpinVisibility: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
				if (separatePinnedRow && layout !== 'pinned-wrapped-empty') {
					model.stick(first);
				} else {
					model.unstick(first);
				}
				model.openEditor(model.getEditorByIndex(1)!, { active: true });
				const previousContainer = container;
				container = $('.title.tabs');
				container.classList.toggle('compact-height', tabHeight === 'compact');
				previousContainer.replaceWith(container);
				const tabsControl = separatePinnedRow
					? disposables.add(instantiationService.createInstance(MultiRowEditorControl, container, editorPartsView, groupsView, groupView, model, undefined, false, false))
					: createControl();
				tabsControl.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
				await layoutConnectedGroup(group, wrapped ? 150 : 400, tabsControl);
				const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
				measurements.push({
					tabHeight, layout,
					rows: new Set(tabs.map(tab => tab.getBoundingClientRect().top)).size,
					tabHeights: tabs.map(tab => tab.offsetHeight),
					fillHeights: tabs.map(tab => tab.querySelector<HTMLElement>('.tab-fill')!.getBoundingClientRect().height),
					contentHeights: tabs.map(tab => {
						const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
						const fillBounds = fill.getBoundingClientRect();
						const connectedCap = tab.classList.contains('active') && !tab.classList.contains('connected-tab-upper-row');
						return connectedCap ? tab.offsetHeight - Number.parseFloat(mainWindow.getComputedStyle(fill).top) - (wrapped || tabHeight === 'compact' ? 2 : 0) : fillBounds.height;
					}),
					backgrounds: tabs.map(tab => mainWindow.getComputedStyle(tab.querySelector<HTMLElement>('.tab-fill')!).backgroundColor),
					actionTargets: tabs.map(tab => {
						const action = tab.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect();
						return [action.width, action.height];
					}),
				});
				tabsControl.dispose();
			}
		}
		assert.deepStrictEqual(measurements, ['default', 'compact'].flatMap(tabHeight => ['single', 'wrapped', 'pinned', 'pinned-wrapped', 'pinned-wrapped-empty'].map(layout => ({
			tabHeight, layout,
			rows: layout === 'single' ? 1 : layout === 'pinned' ? 2 : 3,
			tabHeights: [0, 1, 2].map(index => layout === 'single' || layout === 'pinned' && index > 0 ? tabHeight === 'default' ? 24 : 22 : tabHeight === 'default' ? 28 : 24),
			fillHeights: [0, 1, 2].map(index => {
				const upper = layout === 'pinned' ? index === 0 : layout !== 'single' && index < 2;
				const extension = (layout === 'single' || layout === 'pinned') && tabHeight === 'default' ? 1 : 3;
				return (tabHeight === 'default' ? 24 : 20) + (!upper && index === 1 ? extension : 0);
			}),
			contentHeights: Array(3).fill(tabHeight === 'default' ? 24 : 20),
			backgrounds: ['rgb(30, 41, 59)', 'rgb(22, 78, 99)', 'rgb(30, 41, 59)'],
			actionTargets: [[20, 20], [20, 20], [20, 20]],
		}))));
	});

	test('wrapped headers contain horizontal tab painting while preserving vertical shoulders', async () => {
		const group = connectedGroup();
		openNamedEditors([`a-${'long-wrapped-tab-name-'.repeat(12)}.txt`, 'short.txt']);
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fit', wrapTabs: true, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		const results = [];
		for (const width of [500, 240, 350, 240]) {
			await layoutConnectedGroup(group, width);
			const titleBounds = container.getBoundingClientRect();
			const name = container.querySelector<HTMLElement>('.label-name')!;
			const range = mainWindow.document.createRange();
			range.selectNodeContents(name);
			const bounds = range.getBoundingClientRect();
			const target = mainWindow.document.elementFromPoint(titleBounds.right + 8, bounds.top + bounds.height / 2);
			const style = mainWindow.getComputedStyle(container);
			results.push({
				width,
				wrapped: container.classList.contains('connected-tabs-wrapping'),
				longLabel: bounds.right > titleBounds.right + 8,
				paintsOutsideGroup: !!target && container.contains(target),
				horizontalOverflow: style.overflowX,
				verticalOverflow: style.overflowY,
			});
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, wrapped: true, longLabel: true, paintsOutsideGroup: false, horizontalOverflow: 'clip', verticalOverflow: 'visible' })));
	});

	test('Add Tab leaves separate pinned-row caps and action hit targets unobstructed', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		model.stick(model.getEditorByIndex(0)!);
		const menuIds = { tabsBarAddTab: MenuId.for('test.connectedTabs.pinnedAddTab') };
		control.dispose();
		reset(container);
		control = createControl(menuIds);
		control.dispose();
		reset(container);
		partOptions = { ...partOptions, pinnedTabsOnSeparateRow: true, pinnedTabSizing: 'normal', tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
		const multiRowControl = disposables.add(instantiationService.createInstance(MultiRowEditorControl, container, editorPartsView, groupsView, groupView, model, menuIds, false, false));
		multiRowControl.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const results = [];
		for (const theme of ['vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const wrapTabs of [false, true]) {
				const oldOptions = partOptions;
				partOptions = { ...partOptions, wrapTabs };
				multiRowControl.updateOptions(oldOptions, partOptions);
				await layoutConnectedGroup(group, 500, multiRowControl);
				const upper = container.querySelector<HTMLElement>('.connected-tab-upper-bar')!;
				const fill = upper.querySelector<HTMLElement>('.tab > .tab-fill')!;
				const add = upper.querySelector<HTMLElement>('.tabs-bar-add-tab')!;
				const button = add.querySelector<HTMLElement>('.action-label')!;
				const bounds = button.getBoundingClientRect();
				const target = mainWindow.document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
				results.push({
					theme, wrapTabs,
					positiveInset: mainWindow.getComputedStyle(button).marginLeft,
					capBeforeButton: fill.getBoundingClientRect().right <= bounds.left,
					backplateInsideControl: mainWindow.getComputedStyle(add, '::before').insetInlineStart,
					clickable: !!target && (target === button || button.contains(target)),
				});
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, positiveInset: '2px', capBeforeButton: true, backplateInsideControl: '2px', clickable: true })));
	});

	test('separate pinned bars share upper-pill geometry and reserve no document seam', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--vscode-tab-border', '#00ffff');
		root.style.setProperty('--vscode-contrastActiveBorder', '#ffaa00');
		const pinned = model.getEditors(EditorsOrder.SEQUENTIAL);
		for (const editor of pinned) {
			model.stick(editor);
		}
		for (let index = 2; index < 6; index++) {
			const editor = disposables.add(new TestFileEditorInput(URI.file(`/path/file${index}.ts`), 'testEditorInput'));
			model.openEditor(editor, { pinned: true, active: false });
		}
		control.dispose();
		reset(container);
		partOptions = { ...partOptions, pinnedTabsOnSeparateRow: true, pinnedTabSizing: 'normal', tabActionUnpinVisibility: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
		const multiRowControl = disposables.add(instantiationService.createInstance(MultiRowEditorControl, container, editorPartsView, groupsView, groupView, model, undefined, false, false));
		multiRowControl.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const measurements = [];
		const expected = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const tabHeight of ['default', 'compact'] as const) {
				for (const wrapTabs of [false, true]) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, tabHeight, wrapTabs };
					multiRowControl.updateOptions(oldOptions, partOptions);
					for (const width of wrapTabs ? [150, 260] : [600]) {
						for (const zoom of wrapTabs ? [1, 1.6] : [1]) {
							root.style.zoom = String(zoom);
							for (const activeIndex of [0, 2]) {
								model.openEditor(model.getEditorByIndex(activeIndex)!, { active: true });
								multiRowControl.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
								await layoutConnectedGroup(group, width, multiRowControl);
								const bars = Array.from(container.querySelectorAll<HTMLElement>('.tabs-and-actions-container'));
								const pinnedTabs = Array.from(bars[0].querySelectorAll<HTMLElement>('.tab'));
								const fills = pinnedTabs.map(tab => tab.querySelector<HTMLElement>('.tab-fill')!);
								const bounds = fills.map(fill => fill.getBoundingClientRect());
								const lowerFill = bars[1].querySelector<HTMLElement>('.tab > .tab-fill')!.getBoundingClientRect();
								const rowHeight = tabHeight === 'default' ? 28 : 24;
								const context = { theme, tabHeight, wrapTabs, width, zoom, activeIndex };
								measurements.push({
									...context,
									upperBar: bars[0].classList.contains('connected-tab-upper-bar'),
									allUpperPills: pinnedTabs.every(tab => tab.classList.contains('connected-tab-upper-row')),
									hitboxes: pinnedTabs.every(tab => Math.abs(tab.getBoundingClientRect().height / zoom - rowHeight) < 1 / 32),
									paintedHeights: bounds.every(bounds => Math.abs(bounds.height / zoom - (rowHeight - 4)) < 1 / 32),
									leftInset: Math.abs((bounds[0].left - group.getBoundingClientRect().left) / zoom - 4) < 1 / 32,
									topInset: Math.abs((bounds[0].top - group.getBoundingClientRect().top) / zoom - 4) < 1 / 32,
									alignedWithWrappedPills: wrapTabs ? Math.abs(bounds[0].left - lowerFill.left) < 1 / 32 : undefined,
									sharedRowGap: wrapTabs ? Math.abs((lowerFill.top - bounds[1].bottom) / zoom - 4) < 1 / 32 : undefined,
									corners: fills.map(fill => mainWindow.getComputedStyle(fill).borderRadius),
									equalLeftStroke: mainWindow.getComputedStyle(fills[0]).borderLeftWidth === mainWindow.getComputedStyle(fills[1]).borderLeftWidth,
									noDocumentSeam: mainWindow.getComputedStyle(bars[0].querySelector<HTMLElement>('.tabs-container')!).paddingBottom === '0px',
									controlHeightMatches: multiRowControl.getHeight() === bars.reduce((height, bar) => height + bar.offsetHeight, 0),
									targets: pinnedTabs.every(tab => {
										const target = tab.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect();
										return Math.abs(target.width / zoom - 20) < 1 / 32 && Math.abs(target.height / zoom - 20) < 1 / 32;
									}),
								});
								expected.push({ ...context, upperBar: true, allUpperPills: true, hitboxes: true, paintedHeights: true, leftInset: true, topInset: true, alignedWithWrappedPills: wrapTabs ? true : undefined, sharedRowGap: wrapTabs ? true : undefined, corners: ['4px', '4px'], equalLeftStroke: true, noDocumentSeam: true, controlHeightMatches: true, targets: true });
							}
						}
					}
				}
			}
			root.classList.remove(theme);
		}
		await layoutConnectedGroup(group, 260, multiRowControl);
		const heightWithPinnedBar = multiRowControl.getHeight();
		for (const editor of pinned) {
			model.unstick(editor);
			multiRowControl.unstickEditor(editor);
		}
		await layoutConnectedGroup(group, 260, multiRowControl);
		const remainingFill = container.querySelector<HTMLElement>('.tabs-and-actions-container:not(.empty) .tab-fill')!;
		const collapsedPinnedBar = {
			sameOuterTop: Math.abs((remainingFill.getBoundingClientRect().top - group.getBoundingClientRect().top) / Number(root.style.zoom) - 4) < 1 / 32,
			heightStable: multiRowControl.getHeight() === heightWithPinnedBar,
		};
		root.classList.remove('modern-ui-connected-editor-tabs');
		await layoutConnectedGroup(group, 600, multiRowControl);
		assert.deepStrictEqual({
			measurements,
			collapsedPinnedBar,
			visibleMarkerClearedForPill: !container.querySelector('.connected-tab-upper-bar:not(.empty)'),
		}, { measurements: expected, collapsedPinnedBar: { sameOuterTop: true, heightStable: true }, visibleMarkerClearedForPill: true });
	});

	test('wrapped Connected pills share Pill padding, gutters, and close targets', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const third = disposables.add(new TestFileEditorInput(URI.file('/path/third.ts'), 'testEditorInput'));
		model.openEditor(third, { index: model.count, pinned: true, active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const results = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const tabHeight of ['default', 'compact'] as const) {
				for (const tabActionLocation of ['left', 'right'] as const) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, wrapTabs: true, tabHeight, tabActionLocation, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
					control.updateOptions(oldOptions, partOptions);
					container.classList.toggle('compact-height', tabHeight === 'compact');
					const read = () => Array.from(container.querySelectorAll<HTMLElement>('.tab')).slice(0, 2).map(tab => {
						const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
						const action = tab.querySelector<HTMLElement>('.action-label')!;
						const hitbox = tab.getBoundingClientRect();
						const surface = fill.getBoundingClientRect();
						const target = action.getBoundingClientRect();
						const style = mainWindow.getComputedStyle(tab);
						return { padding: [style.paddingLeft, style.paddingRight], insets: [surface.left - hitbox.left, hitbox.right - surface.right, surface.top - hitbox.top, hitbox.bottom - surface.bottom], outerOffset: [surface.left - group.getBoundingClientRect().left, surface.top - group.getBoundingClientRect().top], height: surface.height, radius: mainWindow.getComputedStyle(fill).borderRadius, target: [target.width, target.height], actionOffset: tabActionLocation === 'left' ? target.left - hitbox.left : hitbox.right - target.right };
					});
					root.classList.remove('modern-ui-connected-editor-tabs');
					await layoutConnectedGroup(group, 150);
					const pill = read();
					root.classList.add('modern-ui-connected-editor-tabs');
					await layoutConnectedGroup(group, 150);
					const connected = read();
					results.push({ theme, tabHeight, tabActionLocation, same: JSON.stringify(pill) === JSON.stringify(connected) });
				}
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, same: true })));
	});

	test('wrapped freestanding fills own equal gutters and clipped accents across themes and densities', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--vscode-tab-border', '#00ffff');
		const modified = disposables.add(new TestFileEditorInput(URI.file('/path/modified.ts'), 'testEditorInput'));
		modified.setDirty();
		model.openEditor(modified, { index: model.count, pinned: true, active: false });
		const fourth = disposables.add(new TestFileEditorInput(URI.file('/path/fourth.ts'), 'testEditorInput'));
		model.openEditor(fourth, { index: model.count, pinned: true, active: false });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const themeService = instantiationService.get(IThemeService);
		assert.ok(themeService instanceof TestThemeService);
		themeService.setTheme(new TestColorTheme({ 'tab.activeModifiedBorder': '#ffffff', 'tab.inactiveModifiedBorder': '#ffffff' }));
		const measurements = [];
		const expected = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const compactLayout of [false, true]) {
				root.classList.toggle('modern-ui-compact', compactLayout);
				for (const tabHeight of ['default', 'compact'] as const) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, tabHeight, wrapTabs: true, highlightModifiedTabs: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
					control.updateOptions(oldOptions, partOptions);
					container.classList.toggle('compact-height', tabHeight === 'compact');
					for (const zoom of [1, 1.25, 1.6]) {
						root.style.zoom = String(zoom);
						await layoutConnectedGroup(group, 260);
						const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'));
						const fills = tabs.map(tab => tab.querySelector<HTMLElement>('.tab-fill')!);
						const bounds = fills.map(fill => fill.getBoundingClientRect());
						const nominalHeight = tabHeight === 'default' ? 28 : 24;
						const paintedHeight = nominalHeight - 4;
						const gap = 4;
						const accent = getTabTopAccent(tabs[2]);
						const context = { theme, compactLayout, tabHeight, zoom };
						measurements.push({
							...context,
							heights: tabs.map((tab, index) => [Math.abs(tab.getBoundingClientRect().height / zoom - nominalHeight) < 1 / 32, Math.abs(bounds[index].height / zoom - paintedHeight) < 1 / 32]),
							equalGutters: Math.abs((bounds[1].left - bounds[0].right) / zoom - gap) < 1 / 32 && Math.abs((bounds[2].top - bounds[0].bottom) / zoom - gap) < 1 / 32,
							insideHitboxes: tabs.every((tab, index) => {
								const hitbox = tab.getBoundingClientRect();
								return bounds[index].top >= hitbox.top && bounds[index].bottom <= hitbox.bottom;
							}),
							corners: fills.map(fill => mainWindow.getComputedStyle(fill).borderRadius),
							firstStroke: mainWindow.getComputedStyle(fills[0]).borderLeftWidth,
							accent: [accent.insideFill, accent.color, Math.abs(accent.height - 2) < 1 / 64, mainWindow.getComputedStyle(fills[2]).overflow],
							targets: tabs.map(tab => {
								const target = tab.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect();
								return Math.abs(target.width / zoom - 20) < 1 / 32 && Math.abs(target.height / zoom - 20) < 1 / 32;
							}),
						});
						expected.push({ ...context, heights: Array.from({ length: 4 }, () => [true, true]), equalGutters: true, insideHitboxes: true, corners: Array(4).fill('4px'), firstStroke: mainWindow.getComputedStyle(fills[1]).borderLeftWidth, accent: [true, 'rgb(255, 255, 255)', true, 'hidden'], targets: Array(4).fill(true) });
					}
				}
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(measurements, expected);
	});

	test('modified top indicators follow the fill without moving connected close actions', async () => {
		const group = connectedGroup();
		const root = group.closest('.monaco-workbench')!;
		control.dispose();
		const third = disposables.add(new TestFileEditorInput(URI.file('/path/third.ts'), 'testEditorInput'));
		model.openEditor(third, { pinned: true, active: false });
		const first = model.getEditorByIndex(0)!;
		const measurements = [];
		const expected = [];
		for (const connected of [false, true]) {
			root.classList.toggle('modern-ui-connected-editor-tabs', connected);
			for (const tabHeight of ['default', 'compact'] as const) {
				for (const layout of ['single', 'wrapped', 'pinned-wrapped'] as const) {
					for (const tabActionLocation of ['left', 'right'] as const) {
						const wrapped = layout !== 'single';
						const pinned = layout === 'pinned-wrapped';
						partOptions = { ...partOptions, tabHeight, tabActionLocation, wrapTabs: wrapped, pinnedTabsOnSeparateRow: pinned, pinnedTabSizing: 'normal', tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
						if (pinned) {
							model.stick(first);
						} else {
							model.unstick(first);
						}
						model.openEditor(model.getEditorByIndex(1)!, { active: true });
						const previousContainer = container;
						container = $('.title.tabs');
						container.classList.toggle('compact-height', tabHeight === 'compact');
						previousContainer.replaceWith(container);
						const tabsControl = pinned
							? disposables.add(instantiationService.createInstance(MultiRowEditorControl, container, editorPartsView, groupsView, groupView, model, undefined, false, false))
							: createControl();
						tabsControl.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
						await layoutConnectedGroup(group, wrapped ? 150 : 400, tabsControl);
						const tab = container.querySelector<HTMLElement>('.tab.active')!;
						const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
						const action = tab.querySelector<HTMLElement>('.action-label')!;
						const beforeFill = fill.getBoundingClientRect().toJSON();
						const beforeAction = action.getBoundingClientRect();
						tab.classList.add('dirty', 'dirty-border-top');
						tab.style.setProperty('--tab-dirty-border-top-color', '#22d3ee');
						const indicator = getTabTopAccent(tab);
						const afterAction = action.getBoundingClientRect();
						const context = { connected, tabHeight, layout, tabActionLocation };
						measurements.push({
							...context,
							topOffset: indicator.topOffset,
							thickness: indicator.height,
							fillStable: JSON.stringify(beforeFill) === JSON.stringify(fill.getBoundingClientRect().toJSON()),
							actionShift: afterAction.top - beforeAction.top,
							target: [afterAction.width, afterAction.height],
						});
						expected.push({ ...context, topOffset: 0, thickness: 2, fillStable: true, actionShift: connected ? 0 : 1, target: [20, 20] });
						tabsControl.dispose();
					}
				}
			}
		}
		assert.deepStrictEqual(measurements, expected);
	});

	test('both layout densities align Connected painted content with Pill while preserving hitboxes and shoulders', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const results = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const tabHeight of ['default', 'compact'] as const) {
				const oldOptions = partOptions;
				partOptions = { ...partOptions, tabHeight, wrapTabs: false };
				control.updateOptions(oldOptions, partOptions);
				for (const zoom of [1, 1.6]) {
					root.style.zoom = String(zoom);
					root.classList.remove('modern-ui-connected-editor-tabs');
					root.classList.add('modern-ui-compact');
					await layoutConnectedGroup(group, 600);
					const tab = container.querySelector<HTMLElement>('.tab.active')!;
					const pillHeight = tab.querySelector<HTMLElement>('.tab-fill')!.getBoundingClientRect().height / zoom;
					root.classList.add('modern-ui-connected-editor-tabs');
					root.classList.remove('modern-ui-compact');
					await layoutConnectedGroup(group, 600);
					const hitbox = tab.getBoundingClientRect().toJSON();
					const action = tab.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect().toJSON();
					const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
					const beforeHeight = fill.getBoundingClientRect().height / zoom;
					root.classList.add('modern-ui-compact');
					await layoutConnectedGroup(group, 600);
					const fillBounds = fill.getBoundingClientRect();
					const peerBounds = container.querySelector<HTMLElement>('.tab:not(.active) > .tab-fill')!.getBoundingClientRect();
					const cap = getTabStrokeStyle(tab);
					const shoulder = mainWindow.getComputedStyle(fill, '::after');
					results.push({
						theme, tabHeight, zoom,
						contentHeight: Math.round(peerBounds.height / zoom),
						pillHeight: Math.round(pillHeight),
						sameCapHeight: Math.abs(beforeHeight - fillBounds.height / zoom) < 1 / 32,
						defaultContentHeight: Math.round(beforeHeight - (tabHeight === 'compact' ? 3 : 1)),
						samePaintedTop: Math.abs(fillBounds.top - peerBounds.top) < 1 / 32,
						stableHitbox: JSON.stringify(hitbox) === JSON.stringify(tab.getBoundingClientRect().toJSON()),
						stableClose: JSON.stringify(action) === JSON.stringify(tab.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect().toJSON()),
						roundedCap: cap.borderTopRightRadius,
						shoulderRadius: shoulder.borderBottomLeftRadius,
						peerRadius: mainWindow.getComputedStyle(container.querySelector<HTMLElement>('.tab:not(.active) > .tab-fill')!).borderRadius,
						openJoin: mainWindow.getComputedStyle(fill).borderBottomWidth === '0px' && shoulder.content === '""' && shoulder.bottom === '0px',
					});
				}
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, contentHeight: result.pillHeight, sameCapHeight: true, defaultContentHeight: result.pillHeight, samePaintedTop: true, stableHitbox: true, stableClose: true, roundedCap: '7px', shoulderRadius: '7px', peerRadius: '4px', openJoin: true })));
	});

	test('Connected single-row caps match chat curvature while wrapped caps retain their geometry', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.classList.add('modern-ui-compact');
		model.openEditor(model.getEditorByIndex(1)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const results = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const tabHeight of ['default', 'compact'] as const) {
				for (const zoom of [1, 1.6]) {
					root.style.zoom = String(zoom);
					for (const wrapTabs of [false, true]) {
						const oldOptions = partOptions;
						partOptions = { ...partOptions, tabHeight, wrapTabs, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
						control.updateOptions(oldOptions, partOptions);
						await layoutConnectedGroup(group, wrapTabs ? 150 : 600);
						const tab = container.querySelector<HTMLElement>('.tab.active')!;
						const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
						const fillStyle = mainWindow.getComputedStyle(fill);
						const capStyle = getTabStrokeStyle(tab);
						const shoulder = mainWindow.getComputedStyle(fill, '::after');
						results.push({
							theme, tabHeight, zoom, wrapTabs,
							actualWrapping: container.querySelector('.tabs-and-actions-container')!.classList.contains('wrapping'),
							attachedCap: !tab.classList.contains('connected-tab-upper-row'),
							curves: [fillStyle.borderTopRightRadius, capStyle.borderTopRightRadius, shoulder.borderBottomLeftRadius],
							inactiveCorners: Array.from(container.querySelectorAll<HTMLElement>('.tab:not(.active) > .tab-fill'), fill => mainWindow.getComputedStyle(fill).borderRadius),
							shoulderBaseline: Number.parseFloat(shoulder.bottom) + Number.parseFloat(fillStyle.borderBottomWidth),
						});
					}
				}
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, actualWrapping: result.wrapTabs, attachedCap: true, curves: [result.wrapTabs ? '5px' : '7px', result.wrapTabs ? '5px' : '7px', '7px'], inactiveCorners: ['4px'], shoulderBaseline: 0 })));
	});

	test('selecting a bottom Connected tab preserves content height in both layout densities', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const results = [];
		for (const compactLayout of [false, true]) {
			root.classList.toggle('modern-ui-compact', compactLayout);
			for (const tabHeight of ['default', 'compact'] as const) {
				for (const wrapTabs of [false, true]) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, tabHeight, wrapTabs, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
					control.updateOptions(oldOptions, partOptions);
					const width = wrapTabs ? 150 : 600;
					model.openEditor(model.getEditorByIndex(0)!, { active: true });
					control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
					await layoutConnectedGroup(group, width);
					const tab = container.querySelectorAll<HTMLElement>('.tab')[1];
					const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
					const restingHeight = fill.getBoundingClientRect().height;
					const hitbox = tab.getBoundingClientRect().toJSON();
					const action = tab.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect().toJSON();
					model.openEditor(model.getEditorByIndex(1)!, { active: true });
					control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
					await layoutConnectedGroup(group, width);
					const contentHeight = tab.getBoundingClientRect().bottom - (wrapTabs || tabHeight === 'compact' ? 2 : 0) - fill.getBoundingClientRect().top;
					results.push({
						compactLayout, tabHeight, wrapTabs,
						sameContentHeight: Math.abs(contentHeight - restingHeight) < 1 / 32,
						contentHeight: Math.round(contentHeight),
						hitboxStable: JSON.stringify(hitbox) === JSON.stringify(tab.getBoundingClientRect().toJSON()),
						actionStable: JSON.stringify(action) === JSON.stringify(tab.querySelector<HTMLElement>('.action-label')!.getBoundingClientRect().toJSON()),
					});
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, sameContentHeight: true, contentHeight: result.tabHeight === 'default' ? 24 : 20, hitboxStable: true, actionStable: true })));
	});

	test('single-row connected caps align with peer tops without losing rounded corners', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--vscode-focusBorder', '#ffaa00');
		group.style.setProperty('--modern-ui-editor-tab-custom-border', '#445566');
		const measurements = [];
		const expected = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const tabHeight of ['default', 'compact'] as const) {
				const oldOptions = partOptions;
				partOptions = { ...partOptions, tabHeight, wrapTabs: false, pinnedTabsOnSeparateRow: false };
				control.updateOptions(oldOptions, partOptions);
				container.classList.toggle('compact-height', tabHeight === 'compact');
				for (const zoom of [1, 1.25, 1.6]) {
					root.style.zoom = String(zoom);
					await layoutConnectedGroup(group, 600);
					const tab = container.querySelector<HTMLElement>('.tab.active')!;
					tab.classList.add('tab-border-top');
					const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
					const peer = container.querySelector<HTMLElement>('.tab:not(.active) > .tab-fill')!;
					const edge = tab.querySelector<HTMLElement>('.tab-connected-edge')!;
					const nominalHeight = tabHeight === 'default' ? 24 : 22;
					const context = { theme, tabHeight, zoom };
					measurements.push({
						...context,
						topRow: tab.classList.contains('connected-tab-top-row'),
						capTop: getTabStrokeStyle(tab).borderTopColor,
						topAligned: Math.abs(fill.getBoundingClientRect().top - tab.getBoundingClientRect().top) < 1 / 64,
						roundedTop: mainWindow.getComputedStyle(edge).borderTopRightRadius === '7px' && mainWindow.getComputedStyle(fill).borderTopRightRadius === '7px',
						peerInset: Math.round((peer.getBoundingClientRect().top - tab.getBoundingClientRect().top) / zoom),
						edgeTopAligns: Math.abs(edge.getBoundingClientRect().top - fill.getBoundingClientRect().top) < 1 / 64,
						peerHeight: Math.round(peer.getBoundingClientRect().height / zoom),
						connectionExtension: Math.round((fill.getBoundingClientRect().bottom - peer.getBoundingClientRect().bottom) / zoom),
						heightStable: Math.abs(tab.getBoundingClientRect().height / zoom - nominalHeight) < 1 / 64,
						controlHeight: control.getHeight(),
					});
					expected.push({ ...context, topRow: true, capTop: theme.startsWith('hc-') ? 'rgb(255, 170, 0)' : 'rgb(68, 85, 102)', topAligned: true, roundedTop: true, peerInset: 0, edgeTopAligns: true, peerHeight: tabHeight === 'default' ? 24 : 20, connectionExtension: tabHeight === 'default' ? 1 : 3, heightStable: true, controlHeight: nominalHeight + 1 });
				}
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(measurements, expected);
	});

	test('connected shoulders share the cap baseline at fractional zoom', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--vscode-tab-selectedBorderTop', '#ffaa00');
		const third = disposables.add(new TestFileEditorInput(URI.file('/path/third.ts'), 'testEditorInput'));
		model.openEditor(third, { index: model.count, pinned: true, active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		model.setSelection(model.activeEditor!, [model.getEditorByIndex(0)!, model.getEditorByIndex(1)!]);
		control.updateEditorSelections();
		const selectedTabs = Array.from(container.querySelectorAll<HTMLElement>('.tab.selected:not(.active)'));
		selectedTabs.forEach(tab => tab.classList.add('tab-border-top'));
		const measurements = [];
		const expected = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const zoom of [1, 1.25, 1.5, 1.6, 2]) {
				root.style.zoom = String(zoom);
				await layoutConnectedGroup(group, 600);
				const fill = container.querySelector<HTMLElement>('.tab.active > .tab-fill')!;
				const style = mainWindow.getComputedStyle(fill);
				const shoulder = mainWindow.getComputedStyle(fill, '::before');
				const selectionStrokes = theme.startsWith('hc-') ? undefined : selectedTabs.map(tab => {
					const stroke = getTabStrokeStyle(tab);
					return { color: stroke.borderTopColor, clippedToFill: mainWindow.getComputedStyle(tab.querySelector<HTMLElement>('.tab-fill')!).overflow === 'hidden' };
				});
				const context = { theme, zoom };
				measurements.push({
					...context,
					baselineOffset: Number.parseFloat(shoulder.bottom) + Number.parseFloat(style.borderBottomWidth),
					transform: style.transform,
					selectionStrokes,
				});
				expected.push({ ...context, baselineOffset: 0, transform: 'none', selectionStrokes: theme.startsWith('hc-') ? undefined : [{ color: 'rgb(255, 170, 0)', clippedToFill: true }, { color: 'rgb(255, 170, 0)', clippedToFill: true }] });
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(measurements, expected);
	});

	test('clipped Connected caps inherit and clear the active multi-selection outline color', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--vscode-focusBorder', '#00ff00');
		root.style.setProperty('--vscode-contrastBorder', '#00ffff');
		root.style.setProperty('--vscode-contrastActiveBorder', '#ff0000');
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fixed', tabSizingFixedMinWidth: 160, tabSizingFixedMaxWidth: 160, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		const active = model.activeEditor!;
		const results = [];
		for (const theme of ['hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const activeGroup of [true, false]) {
				group.classList.toggle('active', activeGroup);
				for (const selected of [true, false]) {
					model.setSelection(active, selected ? [model.getEditorByIndex(1)!] : []);
					control.updateEditorSelections();
					await layoutConnectedGroup(group, 240);
					const tabs = container.querySelector<HTMLElement>('.tabs-container')!;
					tabs.classList.add('scroll');
					tabs.scrollLeft = 40;
					tabs.dispatchEvent(new mainWindow.Event(EventType.SCROLL));
					const overflow = container.querySelector<HTMLElement>('.tab-connected-overflow-edge')!;
					const cap = container.querySelector<HTMLElement>('.tab.active > .tab-connected-edge')!;
					results.push({
						theme, activeGroup, selected,
						clipped: overflow.classList.contains('connected-tab-left-clipped'),
						cap: mainWindow.getComputedStyle(cap).borderRightColor,
						overflow: mainWindow.getComputedStyle(overflow, '::before').borderLeftColor,
					});
				}
			}
			root.classList.remove(theme);
		}
		root.classList.remove('modern-ui-connected-editor-tabs');
		await layoutConnectedGroup(group, 240);
		assert.deepStrictEqual({
			results,
			overrideCleared: container.querySelector<HTMLElement>('.tab-connected-overflow-edge')!.style.getPropertyValue('--modern-ui-connected-tab-border'),
		}, {
			results: results.map(result => ({ ...result, clipped: true, cap: result.selected ? 'rgb(255, 0, 0)' : result.activeGroup ? 'rgb(0, 255, 0)' : 'rgb(0, 255, 255)', overflow: result.selected ? 'rgb(255, 0, 0)' : result.activeGroup ? 'rgb(0, 255, 0)' : 'rgb(0, 255, 255)' })),
			overrideCleared: '',
		});
	});

	test('clipped Connected caps preserve explicit and modified top paint separately from side strokes', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--vscode-focusBorder', '#00ff00');
		root.style.setProperty('--vscode-contrastActiveBorder', '#ff0000');
		group.style.setProperty('--modern-ui-editor-tab-custom-active-border-top', '#22d3ee');
		group.style.setProperty('--modern-ui-editor-tab-custom-unfocused-active-border-top', '#c084fc');
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fixed', tabSizingFixedMinWidth: 160, tabSizingFixedMaxWidth: 160, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		const active = model.getEditorByIndex(1)!;
		model.openEditor(active, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const results = [];
		for (const theme of ['vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const activeGroup of [true, false]) {
				group.classList.toggle('active', activeGroup);
				for (const modified of [false, true]) {
					await layoutConnectedGroup(group, 240);
					const tab = container.querySelector<HTMLElement>('.tab.active')!;
					tab.classList.add('tab-border-top');
					tab.classList.toggle('dirty-border-top', modified);
					tab.style.setProperty('--tab-dirty-border-top-color', '#ffffff');
					control.layout({ container: new Dimension(240, 33), available: new Dimension(240, 300) }, { forceRevealActiveTab: true });
					await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
					const tabs = container.querySelector<HTMLElement>('.tabs-container')!;
					tabs.classList.add('scroll');
					tabs.scrollLeft = 0;
					tabs.dispatchEvent(new mainWindow.Event(EventType.SCROLL));
					const capStyle = getTabStrokeStyle(tab);
					const overflow = container.querySelector<HTMLElement>('.tab-connected-overflow-edge')!;
					const clippedStyle = mainWindow.getComputedStyle(overflow.querySelector<HTMLElement>('.tab-connected-overflow-right-edge')!);
					results.push({
						theme, activeGroup, modified,
						rightClipped: overflow.classList.contains('connected-tab-right-clipped'),
						topColor: clippedStyle.borderTopColor,
						sameSides: clippedStyle.borderRightColor === capStyle.borderRightColor,
						sameModifiedPaint: clippedStyle.backgroundImage === capStyle.backgroundImage,
					});
				}
			}
			root.classList.remove(theme);
		}
		root.classList.remove('modern-ui-connected-editor-tabs');
		await layoutConnectedGroup(group, 240);
		const overflow = container.querySelector<HTMLElement>('.tab-connected-overflow-edge')!;
		assert.deepStrictEqual({
			results,
			cleared: [overflow.style.getPropertyValue('--modern-ui-connected-tab-overflow-top-border'), overflow.style.getPropertyValue('--modern-ui-connected-tab-overflow-top-background')],
		}, {
			results: results.map(result => ({ ...result, rightClipped: true, topColor: result.modified ? 'rgb(255, 255, 255)' : result.activeGroup ? 'rgb(34, 211, 238)' : 'rgb(192, 132, 252)', sameSides: true, sameModifiedPaint: true })),
			cleared: ['', ''],
		});
	});

	test('customized bottom accents stay inside the upper Connected pill clipping boundary', async () => {
		const group = connectedGroup();
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		await layoutConnectedGroup(group, 150);
		const tab = container.querySelector<HTMLElement>('.tab.active.connected-tab-upper-row')!;
		tab.classList.add('tab-border-bottom');
		tab.style.setProperty('--tab-border-bottom-color', '#22d3ee');
		const fill = tab.querySelector<HTMLElement>('.tab-fill')!;
		const accent = mainWindow.getComputedStyle(fill, '::after');
		assert.deepStrictEqual({
			color: accent.backgroundColor,
			bottom: accent.bottom,
			height: accent.height,
			clipping: mainWindow.getComputedStyle(fill).overflow,
		}, { color: 'rgb(34, 211, 238)', bottom: '0px', height: '1px', clipping: 'hidden' });
	});

	test('connected multi-selection focus keeps Close targets stable and action containers borderless', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--vscode-focusBorder', '#ffaa00');
		root.style.setProperty('--vscode-contrastBorder', '#00ffff');
		root.style.setProperty('--vscode-contrastActiveBorder', '#ffaa00');
		const measurements = [];
		const expected = [];
		for (const theme of ['vs', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const tabHeight of ['default', 'compact'] as const) {
				for (const tabActionLocation of ['left', 'right'] as const) {
					const oldOptions = partOptions;
					partOptions = { ...partOptions, tabHeight, tabActionLocation, tabSizing: 'fixed', tabSizingFixedMinWidth: 140, tabSizingFixedMaxWidth: 140 };
					control.updateOptions(oldOptions, partOptions);
					container.classList.toggle('compact-height', tabHeight === 'compact');
					model.setSelection(model.activeEditor!, [model.getEditorByIndex(1)!]);
					control.updateEditorSelections();
					await layoutConnectedGroup(group, 400);
					const tab = container.querySelector<HTMLElement>('.tab.active')!;
					tab.classList.add('tab-border-top');
					tab.style.setProperty('--tab-border-top-color', '#ffaa00');
					const action = tab.querySelector<HTMLElement>('.action-label')!;
					const actions = tab.querySelector<HTMLElement>('.tab-actions')!;
					const before = action.getBoundingClientRect().toJSON();
					action.tabIndex = 0;
					action.focus();
					const after = action.getBoundingClientRect().toJSON();
					const style = mainWindow.getComputedStyle(actions);
					const context = { theme, tabHeight, tabActionLocation };
					measurements.push({
						...context,
						stable: JSON.stringify(before) === JSON.stringify(after),
						inlineBorders: [style.borderLeftWidth, style.borderRightWidth],
						blockColors: [style.borderTopColor, style.borderBottomColor],
						background: style.backgroundColor,
						focused: mainWindow.document.activeElement === action,
					});
					expected.push({ ...context, stable: true, inlineBorders: tabActionLocation === 'left' ? ['1px', '0px'] : ['0px', '0px'], blockColors: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'], background: 'rgba(0, 0, 0, 0)', focused: true });
					action.blur();
					tab.classList.remove('tab-border-top');
				}
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(measurements, expected);
	});

	test('Connected action overlays leave the fill and modified bar as paint owners', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		root.style.setProperty('--modern-ui-editor-tab-custom-action-hover-background', '#654321');
		root.style.setProperty('--modern-ui-editor-tab-custom-action-active-background', '#654321');
		root.style.setProperty('--modern-ui-editor-tab-custom-action-active-hover-background', '#654321');
		root.style.setProperty('--modern-ui-editor-tab-custom-action-selected-background', '#654321');
		model.setSelection(model.activeEditor!, [model.getEditorByIndex(1)!]);
		control.updateEditorSelections();
		const measurements = [];
		const expected = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const tabHeight of ['default', 'compact'] as const) {
				for (const tabActionReserveSpace of [false, true]) {
					for (const tabActionLocation of ['left', 'right'] as const) {
						const oldOptions = partOptions;
						partOptions = { ...partOptions, tabHeight, tabActionReserveSpace, tabActionLocation };
						control.updateOptions(oldOptions, partOptions);
						await layoutConnectedGroup(group, 600);
						for (const [index, tab] of Array.from(container.querySelectorAll<HTMLElement>('.tab')).entries()) {
							tab.classList.add('dirty', 'dirty-border-top');
							tab.style.setProperty('--tab-dirty-border-top-color', '#22d3ee');
							const action = tab.querySelector<HTMLElement>('.action-label')!;
							const actions = tab.querySelector<HTMLElement>('.tab-actions')!;
							const before = action.getBoundingClientRect().toJSON();
							action.tabIndex = 0;
							action.focus();
							const accent = getTabTopAccent(tab);
							const context = { theme, tabHeight, tabActionReserveSpace, tabActionLocation, index };
							measurements.push({
								...context,
								overlay: mainWindow.getComputedStyle(actions).getPropertyValue('--modern-ui-editor-tab-action-overlay-background').trim(),
								background: mainWindow.getComputedStyle(actions).backgroundColor,
								fade: mainWindow.getComputedStyle(actions, '::before').content,
								accent: [accent.color, accent.height, accent.topOffset],
								stableTarget: JSON.stringify(before) === JSON.stringify(action.getBoundingClientRect().toJSON()),
							});
							expected.push({ ...context, overlay: 'transparent', background: 'rgba(0, 0, 0, 0)', fade: 'none', accent: ['rgb(34, 211, 238)', 2, 0], stableTarget: true });
							action.blur();
						}
					}
				}
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(measurements, expected);
	});

	test('connected tabs reserve separator height without changing classic or shared modern tabs', async () => {
		const group = connectedGroup();
		const root = group.closest<HTMLElement>('.monaco-workbench')!;
		const readHeight = async () => {
			control.layout({ container: Dimension.None, available: Dimension.None });
			await new Promise<void>(resolve => {
				disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve()));
			});
			return control.getHeight();
		};
		const heights = [];
		for (const tabHeight of ['default', 'compact'] as const) {
			const oldOptions = partOptions;
			partOptions = { ...partOptions, tabHeight };
			control.updateOptions(oldOptions, partOptions);
			root.classList.remove('modern-ui', 'modern-ui-tabs', 'modern-ui-connected-editor-tabs');
			const classic = await readHeight();
			root.classList.add('modern-ui-tabs');
			const sharedModern = await readHeight();
			root.classList.add('modern-ui');
			const pill = await readHeight();
			root.classList.add('modern-ui-connected-editor-tabs');
			heights.push({ tabHeight, classic, sharedModern, pill, connected: await readHeight() });
		}
		assert.deepStrictEqual(heights, [
			{ tabHeight: 'default', classic: 35, sharedModern: 32, pill: 32, connected: 25 },
			{ tabHeight: 'compact', classic: 22, sharedModern: 28, pill: 28, connected: 23 },
		]);
	});

	test('single-row connected tabs align their tops and retain inline gutters', () => {
		const root = $('.monaco-workbench.modern-ui.modern-ui-tabs.modern-ui-connected-editor-tabs');
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size80: 8px; --vscode-strokeThickness: 1px;';
		mainWindow.document.body.appendChild(root);
		disposables.add(toDisposable(() => root.remove()));
		const editor = $('.part.editor');
		const content = $('.content');
		const group = $('.editor-group-container.active');
		root.appendChild(editor);
		editor.appendChild(content);
		content.appendChild(group);
		group.appendChild(container);

		const [activeTab, inactiveTab] = container.querySelectorAll<HTMLElement>('.tabs-container > .tab');
		const activeFillStyle = mainWindow.getComputedStyle(activeTab.querySelector<HTMLElement>('.tab-fill')!);
		const activeEdgeStyle = mainWindow.getComputedStyle(activeTab.querySelector<HTMLElement>('.tab-connected-edge')!);
		const inactiveFillStyle = mainWindow.getComputedStyle(inactiveTab.querySelector<HTMLElement>('.tab-fill')!);
		const row = container.querySelector<HTMLElement>('.tabs-and-actions-container')!;
		const rowStyle = mainWindow.getComputedStyle(row);
		const editorActions = row.querySelector<HTMLElement>('.editor-actions')!;
		editorActions.classList.remove('hidden');
		const editorActionsStyle = mainWindow.getComputedStyle(editorActions);

		assert.deepStrictEqual({
			active: { top: activeFillStyle.top, left: activeFillStyle.left, right: activeFillStyle.right, bottom: activeFillStyle.bottom },
			activeEdgeBottom: activeEdgeStyle.bottom,
			inactive: { top: inactiveFillStyle.top, left: inactiveFillStyle.left, right: inactiveFillStyle.right, bottom: inactiveFillStyle.bottom },
			alignItems: rowStyle.alignItems,
			editorActionsHeight: editorActionsStyle.height,
			rowPaddingLeft: rowStyle.paddingLeft,
			rowPaddingTop: rowStyle.paddingTop,
		}, {
			active: { top: '0px', left: '0px', right: '0px', bottom: '-1px' },
			activeEdgeBottom: '-1px',
			inactive: { top: '0px', left: '2px', right: '2px', bottom: '0px' },
			alignItems: 'flex-start',
			editorActionsHeight: '24px',
			rowPaddingLeft: '0px',
			rowPaddingTop: '0px',
		});
	});

	test('keeps the connected outline inside the visible scroll area', async () => {
		const root = $('.monaco-workbench.modern-ui.modern-ui-tabs.modern-ui-connected-editor-tabs');
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-spacing-size80: 8px; --vscode-strokeThickness: 1px; --vscode-cornerRadius-small: 4px; --vscode-editor-background: #ffffff; --modern-ui-connected-tab-surface: #333333; --modern-ui-editor-tab-custom-active-background: #333333; --modern-ui-editor-tab-custom-active-hover-background: #654321;';
		mainWindow.document.body.appendChild(root);
		disposables.add(toDisposable(() => root.remove()));
		const editor = $('.part.editor');
		const content = $('.content');
		const group = $('.editor-group-container.active');
		root.appendChild(editor);
		editor.appendChild(content);
		content.appendChild(group);
		group.appendChild(container);
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fixed', tabSizingFixedMinWidth: 160, tabSizingFixedMaxWidth: 160, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		const layout = async (width: number) => {
			group.style.width = `${width}px`;
			control.layout({ container: new Dimension(width, 33), available: new Dimension(width, 200) });
			await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
		};
		const tabs = container.querySelector<HTMLElement>('.tabs-container')!;
		const scroll = (left: number) => {
			tabs.classList.add('scroll');
			tabs.scrollLeft = left;
			tabs.dispatchEvent(new UIEvent(EventType.SCROLL));
		};
		const [firstTab, secondTab] = tabs.querySelectorAll<HTMLElement>('.tab');
		const firstFill = firstTab.querySelector<HTMLElement>('.tab-fill')!;
		const secondFill = secondTab.querySelector<HTMLElement>('.tab-fill')!;
		const firstEdge = firstTab.querySelector<HTMLElement>('.tab-connected-edge')!;
		const secondEdge = secondTab.querySelector<HTMLElement>('.tab-connected-edge')!;
		const overflowEdge = container.querySelector<HTMLElement>('.tab-connected-overflow-edge')!;
		await layout(240);
		scroll(40);
		firstTab.dispatchEvent(new mainWindow.MouseEvent(EventType.MOUSE_ENTER));
		const clippedHover = {
			hovered: overflowEdge.classList.contains('connected-tab-hovered'),
			background: mainWindow.getComputedStyle(overflowEdge, '::before').backgroundColor,
		};
		firstTab.dispatchEvent(new mainWindow.MouseEvent(EventType.MOUSE_LEAVE));
		const clippedHoverReset = {
			hovered: overflowEdge.classList.contains('connected-tab-hovered'),
			background: mainWindow.getComputedStyle(overflowEdge, '::before').backgroundColor,
		};
		const clippedLeft = {
			edge: firstTab.classList.contains('connected-tab-left-edge'),
			clipped: firstTab.classList.contains('connected-tab-left-clipped'),
			fillOffset: firstFill.style.left,
			edgeOffset: [overflowEdge.style.left, overflowEdge.style.right],
			inset: overflowEdge.getBoundingClientRect().left - tabs.getBoundingClientRect().left,
			stationaryParent: overflowEdge.parentElement === tabs.parentElement,
			ownCapTop: overflowEdge.classList.contains('connected-tab-top-row') && mainWindow.getComputedStyle(overflowEdge, '::before').borderTopColor === 'rgb(51, 51, 51)',
			edgeOverlay: [
				mainWindow.getComputedStyle(firstFill, '::before').content,
				mainWindow.getComputedStyle(overflowEdge).display,
				mainWindow.getComputedStyle(overflowEdge).zIndex,
				mainWindow.getComputedStyle(overflowEdge, '::before').width,
				mainWindow.getComputedStyle(overflowEdge, '::before').borderTopLeftRadius,
				mainWindow.getComputedStyle(overflowEdge, '::before').boxSizing,
				mainWindow.getComputedStyle(overflowEdge, '::before').borderLeftWidth,
				mainWindow.getComputedStyle(overflowEdge, '::before').borderTopWidth,
				mainWindow.getComputedStyle(overflowEdge, '::before').backgroundColor,
			],
		};
		model.setSelection(model.activeEditor!, [model.getEditorByIndex(1)!]);
		control.updateEditorSelections();
		await layout(240);
		scroll(40);
		const multiSelected = {
			clipping: overflowEdge.style.left,
			edge: mainWindow.getComputedStyle(overflowEdge).display,
			radius: mainWindow.getComputedStyle(firstFill).borderRadius,
			connectedClass: firstTab.classList.contains('connected-tab-left-clipped'),
		};
		model.setSelection(model.activeEditor!, []);
		control.updateEditorSelections();
		await layout(240);
		const singleSelected = {
			clipping: overflowEdge.style.left,
			connectedClass: firstTab.classList.contains('connected-tab-left-clipped'),
		};
		model.openEditor(model.getEditorByIndex(1)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layout(400);
		scroll(0);
		const terminalOutline = {
			right: mainWindow.getComputedStyle(secondFill).borderRightWidth,
			rightShoulder: mainWindow.getComputedStyle(secondFill, '::after').content,
			rightMask: mainWindow.getComputedStyle(secondEdge, '::after').content,
		};
		const thirdEditor = disposables.add(new TestFileEditorInput(URI.file('/path/file2.txt'), 'testEditorInput'));
		model.openEditor(thirdEditor, { pinned: true, active: false });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layout(400);
		const normalOutline = {
			left: mainWindow.getComputedStyle(secondFill).borderLeftWidth,
			right: mainWindow.getComputedStyle(secondFill).borderRightWidth,
			leftShoulder: mainWindow.getComputedStyle(secondFill, '::before').content,
			rightShoulder: mainWindow.getComputedStyle(secondFill, '::after').content,
			edge: mainWindow.getComputedStyle(secondEdge).display,
			overflowEdge: mainWindow.getComputedStyle(overflowEdge).display,
			masks: ['::before', '::after'].map(pseudo => mainWindow.getComputedStyle(secondEdge, pseudo).content),
		};
		await layout(324);
		scroll(0);
		const rightShoulderAtViewport = {
			edge: secondTab.classList.contains('connected-tab-right-edge'),
			clipped: secondTab.classList.contains('connected-tab-right-clipped'),
			right: mainWindow.getComputedStyle(secondFill).borderRightWidth,
			rightShoulder: mainWindow.getComputedStyle(secondFill, '::after').content,
			rightMask: mainWindow.getComputedStyle(secondEdge, '::after').content,
			overflowEdge: mainWindow.getComputedStyle(overflowEdge).display,
		};
		scroll(8);
		const rightShoulderRevealed = {
			edge: secondTab.classList.contains('connected-tab-right-edge'),
			clipped: secondTab.classList.contains('connected-tab-right-clipped'),
			rightShoulder: mainWindow.getComputedStyle(secondFill, '::after').content,
			rightMask: mainWindow.getComputedStyle(secondEdge, '::after').content,
		};
		scroll(156);
		const leftShoulderAtViewport = {
			edge: secondTab.classList.contains('connected-tab-left-edge'),
			clipped: secondTab.classList.contains('connected-tab-left-clipped'),
			left: mainWindow.getComputedStyle(secondFill).borderLeftWidth,
			leftShoulder: mainWindow.getComputedStyle(secondFill, '::before').content,
			leftMask: mainWindow.getComputedStyle(secondEdge, '::before').content,
			overflowEdge: mainWindow.getComputedStyle(overflowEdge).display,
		};
		scroll(152);
		const leftShoulderRevealed = {
			edge: secondTab.classList.contains('connected-tab-left-edge'),
			clipped: secondTab.classList.contains('connected-tab-left-clipped'),
			leftShoulder: mainWindow.getComputedStyle(secondFill, '::before').content,
			leftMask: mainWindow.getComputedStyle(secondEdge, '::before').content,
		};
		await layout(240);
		scroll(0);
		const overflowRightOffsets = [];
		for (const position of [0, 1, 2, 3]) {
			scroll(position);
			overflowRightOffsets.push({
				right: overflowEdge.style.right,
				inset: tabs.getBoundingClientRect().right - overflowEdge.getBoundingClientRect().right,
			});
		}
		secondTab.dispatchEvent(new mainWindow.MouseEvent(EventType.MOUSE_ENTER));
		const overflowRight = overflowEdge.querySelector<HTMLElement>('.tab-connected-overflow-right')!;
		const clippedRightHover = {
			hovered: overflowEdge.classList.contains('connected-tab-hovered'),
			mask: mainWindow.getComputedStyle(overflowEdge, '::after').backgroundColor,
			cap: mainWindow.getComputedStyle(overflowRight, '::before').backgroundColor,
			shoulder: mainWindow.getComputedStyle(overflowRight, '::after').boxShadow.includes('rgb(101, 67, 33)'),
		};
		secondTab.dispatchEvent(new mainWindow.MouseEvent(EventType.MOUSE_LEAVE));
		const clippedRightHoverReset = {
			hovered: overflowEdge.classList.contains('connected-tab-hovered'),
			cap: mainWindow.getComputedStyle(overflowRight, '::before').backgroundColor,
			shoulder: mainWindow.getComputedStyle(overflowRight, '::after').boxShadow.includes('rgb(51, 51, 51)'),
		};
		const clippedRight = {
			edge: secondTab.classList.contains('connected-tab-right-edge'),
			clipped: secondTab.classList.contains('connected-tab-right-clipped'),
			fillOffset: secondFill.style.right,
			edgeOffset: [overflowEdge.style.left, overflowEdge.style.right],
			overflowRightOffsets,
			edgeOverlay: [
				mainWindow.getComputedStyle(secondFill, '::after').content,
				mainWindow.getComputedStyle(overflowEdge).display,
				mainWindow.getComputedStyle(overflowEdge).zIndex,
				mainWindow.getComputedStyle(overflowEdge, '::after').width,
				mainWindow.getComputedStyle(overflowEdge, '::after').borderTopRightRadius,
				mainWindow.getComputedStyle(overflowEdge, '::after').boxSizing,
				mainWindow.getComputedStyle(overflowEdge, '::after').borderRightWidth,
				mainWindow.getComputedStyle(overflowEdge, '::after').borderTopWidth,
				mainWindow.getComputedStyle(overflowEdge, '::after').backgroundColor,
			],
			previousTabOverflow: firstEdge.style.left,
			ownCapTop: overflowEdge.classList.contains('connected-tab-top-row') && mainWindow.getComputedStyle(overflowRight.querySelector<HTMLElement>('.tab-connected-overflow-right-edge')!).borderTopColor === 'rgb(51, 51, 51)',
		};
		model.openEditor(model.getEditorByIndex(0)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		await layout(100);
		scroll(firstTab.offsetWidth - 5);
		const hiddenAtFillEdge = [mainWindow.getComputedStyle(firstFill).display, mainWindow.getComputedStyle(overflowEdge).display];
		root.classList.add('hc-black');
		await layout(240);
		scroll(40);
		const highContrast = {
			clipping: overflowEdge.style.left,
			edge: mainWindow.getComputedStyle(overflowEdge).display,
			connectedClass: firstTab.classList.contains('connected-tab-left-clipped'),
		};
		model.openEditor(model.getEditorByIndex(1)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const highContrastRight = [];
		root.style.setProperty('--vscode-focusBorder', '#f38518');
		for (const theme of ['hc-black', 'hc-light']) {
			root.classList.remove('hc-black', 'hc-light');
			root.classList.add(theme);
			root.style.setProperty('--vscode-editor-background', theme === 'hc-black' ? '#000000' : '#ffffff');
			for (const width of [240, 324]) {
				await layout(width);
				scroll(0);
				const outline = overflowEdge.querySelector<HTMLElement>('.tab-connected-overflow-right')!;
				const cap = mainWindow.getComputedStyle(outline, '::before');
				const shoulder = mainWindow.getComputedStyle(outline, '::after');
				const capStroke = mainWindow.getComputedStyle(outline.querySelector<HTMLElement>('.tab-connected-overflow-right-edge')!);
				const capRight = outline.getBoundingClientRect().right - parseFloat(cap.right);
				const shoulderLeft = outline.getBoundingClientRect().right - parseFloat(shoulder.right) - parseFloat(shoulder.width);
				highContrastRight.push({
					theme, width,
					mask: mainWindow.getComputedStyle(overflowEdge, '::after').backgroundColor,
					capReachesBottom: parseFloat(cap.bottom) === 0,
					strokesAlign: capRight - parseFloat(cap.borderRightWidth) === shoulderLeft,
					baselineAligns: outline.getBoundingClientRect().bottom === tabs.getBoundingClientRect().bottom,
					separateStroke: cap.borderRightColor === 'rgba(0, 0, 0, 0)' && capStroke.borderRightColor === 'rgb(243, 133, 24)' && capStroke.clipPath === `inset(0px 0px ${shoulder.height})`,
				});
			}
		}
		root.classList.remove('modern-ui-connected-editor-tabs');
		await layout(100);
		assert.deepStrictEqual({
			clippedHover, clippedHoverReset, clippedLeft, multiSelected, singleSelected, terminalOutline, normalOutline, rightShoulderAtViewport, rightShoulderRevealed, leftShoulderAtViewport, leftShoulderRevealed, clippedRightHover, clippedRightHoverReset, clippedRight, hiddenAtFillEdge, highContrast, highContrastRight,
			reset: overflowEdge.style.left,
		}, {
			clippedHover: { hovered: true, background: 'rgb(101, 67, 33)' },
			clippedHoverReset: { hovered: false, background: 'rgb(51, 51, 51)' },
			clippedLeft: { edge: true, clipped: true, fillOffset: '', edgeOffset: ['0px', '0px'], inset: 0, stationaryParent: true, ownCapTop: true, edgeOverlay: ['none', 'block', '8', '5px', '5px', 'border-box', '1px', '1px', 'rgb(51, 51, 51)'] },
			multiSelected: { clipping: '0px', edge: 'block', radius: '0px 5px 0px 0px', connectedClass: true },
			singleSelected: { clipping: '0px', connectedClass: true },
			terminalOutline: { right: '1px', rightShoulder: '""', rightMask: 'none' },
			normalOutline: { left: '1px', right: '1px', leftShoulder: '""', rightShoulder: '""', edge: 'block', overflowEdge: 'none', masks: ['none', 'none'] },
			rightShoulderAtViewport: { edge: true, clipped: false, right: '1px', rightShoulder: '""', rightMask: 'none', overflowEdge: 'block' },
			rightShoulderRevealed: { edge: false, clipped: false, rightShoulder: '""', rightMask: 'none' },
			leftShoulderAtViewport: { edge: true, clipped: false, left: '1px', leftShoulder: 'none', leftMask: 'none', overflowEdge: 'none' },
			leftShoulderRevealed: { edge: false, clipped: false, leftShoulder: '""', leftMask: 'none' },
			clippedRightHover: { hovered: true, mask: 'rgb(255, 255, 255)', cap: 'rgb(101, 67, 33)', shoulder: true },
			clippedRightHoverReset: { hovered: false, cap: 'rgb(51, 51, 51)', shoulder: true },
			clippedRight: {
				edge: true,
				clipped: true,
				fillOffset: '',
				edgeOffset: ['0px', '0px'],
				overflowRightOffsets: [
					{ right: '0px', inset: 0 },
					{ right: '0px', inset: 0 },
					{ right: '0px', inset: 0 },
					{ right: '0px', inset: 0 },
				],
				edgeOverlay: ['""', 'block', '8', '10px', '0px', 'border-box', '0px', '0px', 'rgb(255, 255, 255)'],
				previousTabOverflow: '',
				ownCapTop: true,
			},
			hiddenAtFillEdge: ['none', 'none'],
			highContrast: { clipping: '0px', edge: 'block', connectedClass: true },
			highContrastRight: [
				{ theme: 'hc-black', width: 240, mask: 'rgb(0, 0, 0)', capReachesBottom: true, strokesAlign: true, baselineAligns: true, separateStroke: true },
				{ theme: 'hc-black', width: 324, mask: 'rgb(0, 0, 0)', capReachesBottom: true, strokesAlign: true, baselineAligns: true, separateStroke: true },
				{ theme: 'hc-light', width: 240, mask: 'rgb(255, 255, 255)', capReachesBottom: true, strokesAlign: true, baselineAligns: true, separateStroke: true },
				{ theme: 'hc-light', width: 324, mask: 'rgb(255, 255, 255)', capReachesBottom: true, strokesAlign: true, baselineAligns: true, separateStroke: true },
			],
			reset: '',
		});
	});

	test('invalidates connected clipping geometry after dirty and capability changes', async () => {
		const root = $('.monaco-workbench.modern-ui.modern-ui-tabs.modern-ui-connected-editor-tabs');
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-spacing-size80: 8px; --vscode-spacing-size280: 28px; --vscode-strokeThickness: 1px; --vscode-cornerRadius-small: 4px; --vscode-editor-background: #ffffff; --modern-ui-connected-tab-surface: #333333;';
		mainWindow.document.body.appendChild(root);
		disposables.add(toDisposable(() => root.remove()));
		const editor = $('.part.editor');
		const content = $('.content');
		const group = $('.editor-group-container.active');
		root.appendChild(editor);
		editor.appendChild(content);
		content.appendChild(group);
		group.appendChild(container);
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fit', tabActionReserveSpace: false, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		const thirdEditor = disposables.add(new TestFileEditorInput(URI.file('/path/file2.txt'), 'testEditorInput'));
		model.openEditor(thirdEditor, { pinned: true });
		model.openEditor(model.getEditorByIndex(1)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		group.style.width = '180px';
		control.layout({ container: new Dimension(180, 33), available: new Dimension(180, 200) });
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));

		const tabs = container.querySelector<HTMLElement>('.tabs-container')!;
		const [firstTab, activeTab] = tabs.querySelectorAll<HTMLElement>('.tab');
		const overflowEdge = container.querySelector<HTMLElement>('.tab-connected-overflow-edge')!;
		const scroll = (left: number) => {
			tabs.classList.add('scroll');
			tabs.scrollLeft = left;
			tabs.dispatchEvent(new UIEvent(EventType.SCROLL));
		};
		scroll(0);
		const firstEditor = model.getEditorByIndex(0) as TestFileEditorInput;
		firstEditor.setDirty();
		control.updateEditorDirty(firstEditor);
		const invalidatedBeforeLayout = overflowEdge.style.left === '' && !activeTab.classList.contains('connected-tab-right-edge');
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));

		const rebuiltAfterLayout = overflowEdge.style.left !== '';
		firstEditor.capabilities = EditorInputCapabilities.CannotClose;
		control.updateEditorCapabilities(firstEditor);
		const capabilityUpdateInvalidated = overflowEdge.style.left === '' && !activeTab.classList.contains('connected-tab-right-edge');

		assert.deepStrictEqual({
			firstTabDirty: firstTab.classList.contains('dirty'),
			invalidatedBeforeLayout,
			rebuiltAfterLayout,
			capabilityUpdateInvalidated,
		}, {
			firstTabDirty: true,
			invalidatedBeforeLayout: true,
			rebuiltAfterLayout: true,
			capabilityUpdateInvalidated: true,
		});
	});

	test('Alt swaps the close action of the hovered tab only', () => {
		const actions = [tabActions()];

		hoverTab(0);
		alt(true);
		actions.push(tabActions());

		alt(false);
		actions.push(tabActions());

		assert.deepStrictEqual(actions, [
			['close', 'close'],
			['closeOthers', 'close'],
			['close', 'close']
		]);
	});

	test('Alt does not stay armed when the window loses focus (#331979)', () => {
		hoverTab(0);
		alt(true);

		const actions = [tabActions()];

		// Alt+Tab to another application: the `keyup` for Alt is
		// delivered to that application and never seen here
		hostService.setFocus(false);
		ModifierKeyEmitter.getInstance().resetKeyStatus();
		actions.push(tabActions());

		// Alt being reported as pressed again when focus returns must not
		// swap the action of a tab that is still hovered from before
		hostService.setFocus(true);
		alt(true);
		actions.push(tabActions());

		// Hovering a tab again arms the swap as usual
		hoverTab(0);
		actions.push(tabActions());

		assert.deepStrictEqual(actions, [
			['closeOthers', 'close'],
			['close', 'close'],
			['close', 'close'],
			['closeOthers', 'close']
		]);
	});

	test('Alt is revalidated from mouse events over the tabs (#331979)', () => {
		hoverTab(0);
		alt(true);

		const actions = [tabActions()];

		// The `keyup` for Alt went to another application, so only the
		// next mouse event reveals that Alt is no longer pressed
		moveMouseOverTabs(false);
		actions.push(tabActions());

		assert.deepStrictEqual(actions, [
			['closeOthers', 'close'],
			['close', 'close']
		]);
	});

	test('Alt is revalidated when pressing the tab action without moving the mouse (#331979)', () => {
		hoverTab(0);
		alt(true);

		const actions = [tabActions()];

		mouseDownOnTabAction(0, false);
		actions.push(tabActions());

		assert.deepStrictEqual(actions, [
			['closeOthers', 'close'],
			['close', 'close']
		]);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
