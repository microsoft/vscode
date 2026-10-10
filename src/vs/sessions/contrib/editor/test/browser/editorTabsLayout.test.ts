/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, Dimension, getTotalWidth, ModifierKeyEmitter, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDnd.js';
import { ITreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDndService.js';
import { IMenu, IMenuChangeEvent, IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupsView, IEditorGroupView, IEditorPartsView } from '../../../../../workbench/browser/parts/editor/editor.js';
import { MultiEditorTabsControl } from '../../../../../workbench/browser/parts/editor/multiEditorTabsControl.js';
import { MultiRowEditorControl } from '../../../../../workbench/browser/parts/editor/multiRowEditorTabsControl.js';
import { EditorsOrder, IEditorPartOptions, IToolbarActions } from '../../../../../workbench/common/editor.js';
import { EditorGroupModel } from '../../../../../workbench/common/editor/editorGroupModel.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { INotebookDocumentService, NotebookDocumentWorkbenchService } from '../../../../../workbench/services/notebook/common/notebookDocumentService.js';
import { TestFileEditorInput, TestMenuService, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import '../../../../../workbench/contrib/modernUI/browser/media/tabs.css';
import '../../../../../workbench/contrib/modernUI/browser/connectedEditorTabs.js';
import '../../../../browser/parts/media/editorPart.css';

suite('Sessions - Editor tabs trailing layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let root: HTMLElement;
	let group: HTMLElement;
	let title: HTMLElement;
	let model: EditorGroupModel;
	let partOptions: IEditorPartOptions;
	let control: MultiEditorTabsControl | MultiRowEditorControl;
	let toolbarActions: Map<MenuId, IToolbarActions>;
	let actionsChanged: Emitter<void>;
	let layoutActionsChanged: Emitter<void>;
	let addTabChanged: Emitter<IMenuChangeEvent>;
	let addTabAvailable: boolean;
	let addTabMenu: IMenu;
	let createControl: (separatePinnedRow?: boolean) => void;

	setup(() => {
		store.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));
		partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS, wrapTabs: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120 };
		root = $('.monaco-workbench.modern-ui-tabs.modern-ui-connected-editor-tabs.agent-sessions-workbench.dock-detail-panel');
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-spacing-size80: 8px; --vscode-spacing-size160: 16px; --vscode-spacing-size200: 20px; --vscode-spacing-size280: 28px; --vscode-strokeThickness: 1px; --vscode-cornerRadius-small: 4px; --vscode-cornerRadius-medium: 6px; --vscode-cornerRadius-large: 8px; --vscode-fontSize-body1: 13px; --vscode-fontWeight-regular: 400;';
		const editor = $('.part.editor.editor-tabs-multiple');
		const content = $('.content');
		group = $('.editor-group-container.active');
		title = $('.title.tabs');
		root.appendChild(editor);
		editor.appendChild(content);
		content.appendChild(group);
		group.appendChild(title);
		mainWindow.document.body.appendChild(root);
		store.add(toDisposable(() => root.remove()));
		const services = workbenchInstantiationService(undefined, store);
		services.stub(ITreeViewsDnDService, new TreeViewsDnDService());
		services.stub(INotebookDocumentService, new NotebookDocumentWorkbenchService());
		model = store.add(services.createInstance(EditorGroupModel, undefined));
		for (let index = 0; index < 6; index++) {
			model.openEditor(store.add(new TestFileEditorInput(URI.file(`/path/file${index}.ts`), 'testEditorInput')), { pinned: true, active: index === 0 });
		}
		toolbarActions = new Map([
			[MenuId.EditorTitle, {
				primary: [store.add(new Action('test.context', 'Add File as Context', 'codicon codicon-add'))],
				secondary: [store.add(new Action('test.more', 'More Actions'))],
			}],
			[MenuId.EditorTitleLayout, {
				primary: [store.add(new Action('test.maximize', 'Maximize Editor Area', 'codicon codicon-screen-full')), store.add(new Action('test.details', 'Toggle Details', 'codicon codicon-layout-sidebar-right'))],
				secondary: [],
			}],
		]);
		actionsChanged = store.add(new Emitter<void>());
		layoutActionsChanged = store.add(new Emitter<void>());
		addTabChanged = store.add(new Emitter<IMenuChangeEvent>());
		addTabAvailable = true;
		const groupView: IEditorGroupView = new class extends mock<IEditorGroupView>() {
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
			override isPinned(editor: EditorInput | number) { return model.isPinned(editor); }
			override isSticky(editor: EditorInput | number) { return model.isSticky(editor); }
			override isSelected(editor: EditorInput | number) { return model.isSelected(editor); }
			override createEditorActions(_store: DisposableStore, menuId = MenuId.EditorTitle) { return { actions: toolbarActions.get(menuId) ?? { primary: [], secondary: [] }, onDidChange: menuId === MenuId.EditorTitleLayout ? layoutActionsChanged.event : actionsChanged.event }; }
			override relayout() {
				const width = group.clientWidth;
				control?.layout({ container: new Dimension(width, 33), available: new Dimension(width, 500) });
			}
			override readonly onDidActiveEditorChange = Event.None;
		};
		const groupsView: IEditorGroupsView = new class extends mock<IEditorGroupsView>() {
			override get partOptions() { return partOptions; }
			override get activeGroup() { return groupView; }
			override get groups() { return [groupView]; }
			override readonly onDidChangeEditorPartOptions = Event.None;
			override readonly onDidVisibilityChange = Event.None;
		};
		const partsView = new class extends mock<IEditorPartsView>() {
			override get count() { return 1; }
			override getGroup() { return groupView; }
		};
		const addMenu = MenuId.for('test.sessions.wrappedTabs.addTab');
		services.stub(IMenuService, new class extends TestMenuService {
			override createMenu(id: MenuId): IMenu {
				const menu: IMenu = {
					onDidChange: addTabChanged.event,
					dispose: () => { },
					getActions: options => id === addMenu && addTabAvailable ? [['navigation', [services.createInstance(MenuItemAction, { id: 'test.add', title: 'New Editor' }, undefined, options, undefined, undefined)]]] : [],
				};
				if (id === addMenu) {
					addTabMenu = menu;
				}
				return menu;
			}
		}());
		createControl = separatePinnedRow => {
			control?.dispose();
			title.replaceChildren();
			control = store.add(separatePinnedRow
				? services.createInstance(MultiRowEditorControl, title, partsView, groupsView, groupView, model, { tabsBarAddTab: addMenu }, false, true)
				: services.createInstance(MultiEditorTabsControl, title, partsView, groupsView, groupView, model, { tabsBarAddTab: addMenu }, false, true));
			control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		};
		createControl();
	});

	async function layout(width: number): Promise<void> {
		group.style.width = `${width}px`;
		control.layout({ container: new Dimension(width, 33), available: new Dimension(width, 500) });
		await new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
	}

	function trailingBounds(strip: HTMLElement) {
		const add = strip.querySelector<HTMLElement>('.tabs-bar-add-tab')!;
		const contextual = strip.querySelector<HTMLElement>('.editor-actions')!;
		const layout = strip.querySelector<HTMLElement>('.editor-layout-actions')!;
		const separator = strip.querySelector<HTMLElement>('.editor-actions-separator')!;
		const items = [add, contextual, separator, layout].filter(item => item.getBoundingClientRect().width > 0);
		const bounds = strip.getBoundingClientRect();
		const tabs = Array.from(strip.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
		return {
			actions: [contextual, layout].map(toolbar => toolbar.querySelectorAll('.action-item').length),
			visibleActions: [contextual, layout].map(toolbar => Array.from(toolbar.querySelectorAll<HTMLElement>('.action-label')).filter(action => action.getBoundingClientRect().width > 0 && action.getBoundingClientRect().height > 0).length),
			overlaps: items.some((a, index) => items.slice(index + 1).some(b => {
				const x = a.getBoundingClientRect();
				const y = b.getBoundingClientRect();
				return Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 / 64 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1 / 64;
			})),
			inBounds: items.every(item => {
				const rect = item.getBoundingClientRect();
				return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
			}),
			addPosition: mainWindow.getComputedStyle(add).position,
			tabsClear: !strip.classList.contains('wrapping') || tabs.every(tab => items.every(item => {
				const a = tab.getBoundingClientRect();
				const b = item.getBoundingClientRect();
				return Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 / 64 || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1 / 64;
			})),
		};
	}

	test('wrapped Add Tab and both editor toolbars reserve disjoint trailing bounds', async () => {
		const results = [];
		for (const style of ['legacy', 'pill', 'connected']) {
			root.classList.toggle('modern-ui-tabs', style !== 'legacy');
			root.classList.toggle('modern-ui-connected-editor-tabs', style === 'connected');
			for (const tabHeight of ['default', 'compact'] as const) {
				for (const direction of ['ltr', 'rtl']) {
					root.dir = direction;
					for (const zoom of [1, 1.44]) {
						root.style.zoom = String(zoom);
						for (const width of [400, 240, 180]) {
							for (const wrapTabs of [true, false, true]) {
								const oldOptions = partOptions;
								partOptions = { ...partOptions, tabHeight, wrapTabs };
								control.updateOptions(oldOptions, partOptions);
								await layout(width);
								const strip = title.querySelector<HTMLElement>('.tabs-and-actions-container')!;
								const bounds = trailingBounds(strip);
								results.push({ style, tabHeight, direction, zoom, width, wrapTabs, wrapping: strip.classList.contains('wrapping'), ...bounds, inBounds: wrapTabs ? bounds.inBounds : undefined });
							}
						}
					}
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({
			...result, wrapping: result.wrapTabs, actions: [2, 2], visibleActions: [2, 2], overlaps: false, tabsClear: true,
			inBounds: result.wrapTabs ? true : undefined,
			addPosition: result.style !== 'legacy' && !result.wrapTabs ? 'sticky' : 'static',
		})));
	});

	test('independent toolbar and Add Tab visibility changes refresh the reserved region', async () => {
		await layout(300);
		const editorActions = toolbarActions.get(MenuId.EditorTitle)!;
		const layoutActions = toolbarActions.get(MenuId.EditorTitleLayout)!;
		const results = [];
		for (const [contextual, trailing, add] of [[true, true, true], [true, false, true], [false, true, true], [false, false, true], [true, true, false], [true, true, true]]) {
			toolbarActions.set(MenuId.EditorTitle, contextual ? editorActions : { primary: [], secondary: [] });
			actionsChanged.fire();
			await new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
			toolbarActions.set(MenuId.EditorTitleLayout, trailing ? layoutActions : { primary: [], secondary: [] });
			layoutActionsChanged.fire();
			await new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
			addTabAvailable = add;
			addTabChanged.fire({ menu: addTabMenu, isStructuralChange: true, isEnablementChange: false, isToggleChange: false });
			await new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
			const strip = title.querySelector<HTMLElement>('.tabs-and-actions-container')!;
			const wrapper = strip.querySelector<HTMLElement>('.editor-toolbars')!;
			const separator = strip.querySelector<HTMLElement>('.editor-actions-separator')!;
			const tabs = strip.querySelector<HTMLElement>('.tabs-container')!;
			const finalTab = tabs.querySelector<HTMLElement>('.tab.last-tab')!;
			results.push({
				contextual, trailing, add,
				...trailingBounds(strip),
				separatorVisible: separator.getBoundingClientRect().width > 0,
				reservedWidth: parseFloat(tabs.style.getPropertyValue('--last-tab-margin-right')),
				wrapperWidth: wrapper.offsetWidth,
				finalTabReservation: parseFloat(mainWindow.getComputedStyle(finalTab).getPropertyValue('--last-tab-margin-right')),
				addMarker: strip.classList.contains('has-add-tab'),
			});
		}
		assert.deepStrictEqual(results, results.map(result => ({
			...result, actions: [result.contextual ? 2 : 0, result.trailing ? 2 : 0], visibleActions: [result.contextual ? 2 : 0, result.trailing ? 2 : 0], overlaps: false, inBounds: true, addPosition: 'static', tabsClear: true,
			separatorVisible: result.contextual && result.trailing,
			reservedWidth: result.wrapperWidth,
			finalTabReservation: result.add ? 0 : result.wrapperWidth,
			addMarker: result.add,
		})));
	});

	test('visible Add Tab does not disable the oversized-tab scrolling fallback', async () => {
		const results = [];
		for (const style of ['legacy', 'pill', 'connected']) {
			root.classList.toggle('modern-ui-tabs', style !== 'legacy');
			root.classList.toggle('modern-ui-connected-editor-tabs', style === 'connected');
			for (const tabWidth of [400, 300, 298, 290, 120, 400]) {
				const oldOptions = partOptions;
				partOptions = { ...partOptions, tabSizingFixedMinWidth: tabWidth, tabSizingFixedMaxWidth: tabWidth };
				control.updateOptions(oldOptions, partOptions);
				await layout(300);
				const strip = title.querySelector<HTMLElement>('.tabs-and-actions-container')!;
				const tabs = strip.querySelector<HTMLElement>('.tabs-container')!;
				const viewport = tabs.getBoundingClientRect();
				const stripBounds = strip.getBoundingClientRect();
				const wrapping = strip.classList.contains('wrapping');
				results.push({
					style, tabWidth,
					wrapping,
					horizontalOverflow: tabs.scrollWidth > tabs.clientWidth,
					tabsContained: !wrapping || Array.from(tabs.querySelectorAll<HTMLElement>('.tab')).every(tab => {
						const rect = tab.getBoundingClientRect();
						return rect.left >= Math.max(viewport.left, stripBounds.left) - 1 && rect.right <= Math.min(viewport.right, stripBounds.right) + 1;
					}),
				});
			}
		}
		assert.deepStrictEqual(results, results.map(result => {
			const wrapping = result.tabWidth < 400 && (result.style === 'legacy' || result.tabWidth < 298);
			return { ...result, wrapping, horizontalOverflow: !wrapping, tabsContained: true };
		}));
	});

	test('fit and fixed tabs become upper pills when only Add Tab occupies the last row', async () => {
		model.openEditor(model.getEditorByIndex(model.count - 1)!, { active: true });
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const results = [];
		for (const tabSizing of ['fit', 'fixed'] as const) {
			for (const tabHeight of ['default', 'compact'] as const) {
				const oldOptions = partOptions;
				partOptions = { ...partOptions, tabSizing, tabHeight };
				control.updateOptions(oldOptions, partOptions);
				await layout(2000);
				const strip = title.querySelector<HTMLElement>('.tabs-and-actions-container')!;
				const tabs = Array.from(strip.querySelectorAll<HTMLElement>('.tabs-container > .tab'));
				const add = strip.querySelector<HTMLElement>('.tabs-bar-add-tab')!;
				const toolbar = strip.querySelector<HTMLElement>('.editor-toolbars')!;
				const tabWidth = Math.max(...tabs.map(getTotalWidth));
				const controlsWidth = getTotalWidth(add) + getTotalWidth(toolbar);
				for (const tabsPerRow of [1, 2, 3]) {
					const width = Math.ceil(Math.max(tabsPerRow * tabWidth, controlsWidth)) + 12;
					await layout(width);
					const active = strip.querySelector<HTMLElement>('.tab.active')!;
					results.push({
						tabSizing, tabHeight, width,
						wrapping: strip.classList.contains('wrapping'),
						...trailingBounds(strip),
						addOnlyLastRow: tabs.every(tab => tab.offsetTop < add.offsetTop),
						rowMarkers: tabs.every(tab => tab.classList.contains('connected-tab-upper-row') === (tab.offsetTop !== add.offsetTop)),
						noPhantomCap: !active.classList.contains('connected-tab-upper-row') || mainWindow.getComputedStyle(active.querySelector<HTMLElement>('.tab-fill')!, '::after').content === 'none',
						lastRowHeight: add.getBoundingClientRect().height > 0,
					});
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, wrapping: true, actions: [2, 2], visibleActions: [2, 2], overlaps: false, inBounds: true, tabsClear: true, addPosition: 'static', addOnlyLastRow: true, rowMarkers: true, noPhantomCap: true, lastRowHeight: true })));
	});

	test('an oversized non-final fit tab retains horizontal scrolling with Add Tab visible', async () => {
		const wide = store.add(new class extends TestFileEditorInput {
			override getName(): string { return `${'long-'.repeat(20)}file.ts`; }
		}(URI.file('/path/wide.ts'), 'testEditorInput'));
		const final = store.add(new class extends TestFileEditorInput {
			override getName(): string { return `${'M'.repeat(20)}.ts`; }
		}(URI.file('/path/final.ts'), 'testEditorInput'));
		model.openEditor(wide, { index: 1, pinned: true, active: true });
		model.openEditor(final, { index: model.count, pinned: true, active: false });
		const oldOptions = partOptions;
		partOptions = { ...partOptions, tabSizing: 'fit' };
		control.updateOptions(oldOptions, partOptions);
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
		const results = [];
		for (const style of ['legacy', 'pill', 'connected']) {
			root.classList.toggle('modern-ui-tabs', style !== 'legacy');
			root.classList.toggle('modern-ui-connected-editor-tabs', style === 'connected');
			const beforeMeasurement = partOptions;
			partOptions = { ...partOptions, wrapTabs: false };
			control.updateOptions(beforeMeasurement, partOptions);
			await layout(2000);
			const strip = title.querySelector<HTMLElement>('.tabs-and-actions-container')!;
			const tabs = strip.querySelector<HTMLElement>('.tabs-container')!;
			const last = tabs.querySelector<HTMLElement>('.tab.last-tab')!;
			const toolbar = strip.querySelector<HTMLElement>('.editor-toolbars')!;
			const width = Math.ceil(last.offsetWidth + toolbar.offsetWidth / 2);
			const afterMeasurement = partOptions;
			partOptions = { ...partOptions, wrapTabs: true };
			control.updateOptions(afterMeasurement, partOptions);
			await layout(width);
			results.push({
				style, width,
				earlierTabOversized: tabs.querySelector<HTMLElement>('.tab.active')!.offsetWidth > width,
				finalTabAloneFits: last.offsetWidth < width,
				finalTabWithToolbarDoesNotFit: last.offsetWidth + toolbar.offsetWidth > width,
				wrapping: strip.classList.contains('wrapping'),
				scrolling: tabs.scrollWidth > tabs.clientWidth,
			});
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, earlierTabOversized: true, finalTabAloneFits: true, finalTabWithToolbarDoesNotFit: true, wrapping: false, scrolling: true })));
	});

	test('separate pinned rows reserve actions only in the final bar', async () => {
		for (const editor of model.getEditors(EditorsOrder.SEQUENTIAL).slice(0, 2)) {
			model.stick(editor);
		}
		partOptions = { ...partOptions, pinnedTabsOnSeparateRow: true, pinnedTabSizing: 'normal' };
		createControl(true);
		const results = [];
		for (const tabHeight of ['default', 'compact'] as const) {
			for (const zoom of [1, 1.44]) {
				root.style.zoom = String(zoom);
				const oldOptions = partOptions;
				partOptions = { ...partOptions, tabHeight };
				control.updateOptions(oldOptions, partOptions);
				await layout(300);
				const bars = Array.from(title.querySelectorAll<HTMLElement>('.tabs-and-actions-container'));
				results.push({
					tabHeight, zoom,
					pinnedActionsWidth: bars[0].querySelector<HTMLElement>('.editor-toolbars')!.offsetWidth,
					pinnedReservation: parseFloat(bars[0].querySelector<HTMLElement>('.tabs-container')!.style.getPropertyValue('--last-tab-margin-right')) || 0,
					...trailingBounds(bars[1]),
				});
			}
		}
		assert.deepStrictEqual(results, results.map(result => ({ ...result, pinnedActionsWidth: 0, pinnedReservation: 0, actions: [2, 2], visibleActions: [2, 2], overlaps: false, inBounds: true, addPosition: 'static', tabsClear: true })));
	});
});
