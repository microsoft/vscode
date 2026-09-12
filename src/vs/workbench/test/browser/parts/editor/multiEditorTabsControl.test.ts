/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, Dimension, EventType, ModifierKeyEmitter, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDnd.js';
import { ITreeViewsDnDService } from '../../../../../editor/common/services/treeViewsDndService.js';
import { DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupsView, IEditorGroupView, IEditorPartsView } from '../../../../browser/parts/editor/editor.js';
import { MultiEditorTabsControl } from '../../../../browser/parts/editor/multiEditorTabsControl.js';
import { EditorInputCapabilities, EditorsOrder, IEditorPartOptions } from '../../../../common/editor.js';
import { EditorGroupModel } from '../../../../common/editor/editorGroupModel.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { INotebookDocumentService, NotebookDocumentWorkbenchService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { TestFileEditorInput, TestHostService, workbenchInstantiationService } from '../../workbenchTestServices.js';
import '../../../../contrib/modernUI/browser/media/tabs.css';
import '../../../../contrib/modernUI/browser/connectedEditorTabs.js';

suite('MultiEditorTabsControl', () => {

	let disposables: DisposableStore;

	let container: HTMLElement;
	let hostService: TestHostService;
	let control: MultiEditorTabsControl;
	let partOptions: IEditorPartOptions;
	let model: EditorGroupModel;

	setup(() => {
		disposables = new DisposableStore();
		partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS };

		// The tabs control resolves the shared modifier key emitter on creation,
		// so dispose it again to keep each test independent of the Alt state that
		// other suites may have left behind
		disposables.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));

		const instantiationService = workbenchInstantiationService(undefined, disposables);
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

		const groupView = new class extends mock<IEditorGroupView>() {
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

		const groupsView = new class extends mock<IEditorGroupsView>() {
			override get partOptions() { return partOptions; }
			override get activeGroup(): IEditorGroupView { return groupView; }
			override get groups(): IEditorGroupView[] { return [groupView]; }
			override readonly onDidChangeEditorPartOptions = Event.None;
			override readonly onDidVisibilityChange = Event.None;
		};

		const editorPartsView = new class extends mock<IEditorPartsView>() {
			override get count() { return 1; }
			override getGroup() { return groupView; }
		};

		container = $('.title.tabs');
		mainWindow.document.body.appendChild(container);

		control = disposables.add(instantiationService.createInstance(MultiEditorTabsControl, container, editorPartsView, groupsView, groupView, model, undefined, false, false));
		control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
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
		const root = $('.monaco-workbench.modern-ui.modern-ui-tabs.modern-ui-connected-editor-tabs');
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-spacing-size80: 8px; --vscode-spacing-size160: 16px; --vscode-spacing-size280: 28px; --vscode-strokeThickness: 1px; --vscode-cornerRadius-small: 4px; --vscode-fontSize-body1: 13px; --vscode-fontWeight-regular: 400;';
		mainWindow.document.body.appendChild(root);
		disposables.add(toDisposable(() => root.remove()));
		const editor = $('.part.editor');
		const content = $('.content');
		const group = $('.editor-group-container.active');
		root.appendChild(editor);
		editor.appendChild(content);
		content.appendChild(group);
		group.appendChild(container);
		return group;
	}

	async function layoutConnectedGroup(group: HTMLElement, width: number): Promise<void> {
		group.style.width = `${width}px`;
		control.layout({ container: new Dimension(width, 33), available: new Dimension(width, 300) });
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
	}

	test('connected minimum width preserves basename ellipsis extension badge and action', async () => {
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
		const suffix = tab.querySelector<HTMLElement>('.label-suffix')!;
		const action = tab.querySelector<HTMLElement>('.tab-actions')!;
		const context = document.createElement('canvas').getContext('2d')!;
		const badge = mainWindow.getComputedStyle(label, '::after');
		context.font = badge.font;
		const badgeTextWidth = context.measureText('WM').width;
		context.font = mainWindow.getComputedStyle(name).font;
		assert.deepStrictEqual({
			minimum: tab.offsetWidth >= Math.ceil(context.measureText('1: f….txt').width + badgeTextWidth) + 10 + 34,
			intrinsicBadgeWidth: Math.abs(parseFloat(badge.width) - badgeTextWidth) < 1,
			narrow: tab.classList.contains('connected-tab-narrow'),
			iconHidden: mainWindow.getComputedStyle(label, '::before').display,
			basename: name.textContent,
			extension: suffix.textContent,
			ellipsis: mainWindow.getComputedStyle(nameContainer).textOverflow,
			basenameVisible: nameContainer.clientWidth >= context.measureText('1: f…').width,
			extensionBeforeAction: suffix.getBoundingClientRect().right <= action.getBoundingClientRect().left,
			fullAriaLabel: tab.getAttribute('aria-label')?.includes('file0.txt'),
		}, {
			minimum: true, intrinsicBadgeWidth: true, narrow: true, iconHidden: 'none', basename: '1: file0', extension: '.txt',
			ellipsis: 'ellipsis', basenameVisible: true, extensionBeforeAction: true, fullAriaLabel: true,
		});
		name.style.fontSize = '13px';
		nameContainer.style.fontSize = '20px';
		await layoutConnectedGroup(group, 200);
		context.font = mainWindow.getComputedStyle(name).font;
		const firstCharacterWidth = context.measureText('1: f').width;
		context.font = mainWindow.getComputedStyle(nameContainer).font;
		assert.ok(nameContainer.clientWidth >= firstCharacterWidth + context.measureText('…').width, JSON.stringify({
			message: 'reserve the ellipsis using its container font',
			actual: nameContainer.clientWidth,
			required: firstCharacterWidth + context.measureText('…').width,
			minimum: tab.style.getPropertyValue('--connected-tab-min-width'),
			tabWidth: tab.offsetWidth,
		}));
		group.closest('.monaco-workbench')!.classList.remove('modern-ui-connected-editor-tabs');
		await layoutConnectedGroup(group, 200);
		assert.deepStrictEqual([name.textContent, suffix.textContent, tab.style.getPropertyValue('--connected-tab-min-width')], ['1: file0.txt', '', '']);
	});

	for (const showTabIndex of [false, true]) {
		test(`connected compression preserves initial graphemes and dotfile prefixes (index: ${showTabIndex})`, async () => {
			const group = connectedGroup();
			const cases = [
				{ name: 'e\u0301xample.txt', initial: 'e\u0301' },
				{ name: '\u0915\u093fname.txt', initial: '\u0915\u093f' },
				{ name: '😀example.txt', initial: '😀' },
				{ name: '👍🏽example.txt', initial: '👍🏽' },
				{ name: '👩🏽‍💻example.txt', initial: '👩🏽‍💻' },
				{ name: '🇫🇷example.txt', initial: '🇫🇷' },
				{ name: '.env', initial: '.e' },
				{ name: '.gitignore', initial: '.g' },
				{ name: '.👩🏽‍💻example.txt', initial: '.👩🏽‍💻' },
			];
			for (const { name } of cases) {
				const editor = disposables.add(new class extends TestFileEditorInput {
					override getName(): string { return name; }
				}(URI.file(`/path/${name}`), 'testEditorInput'));
				model.openEditor(editor, { pinned: true, active: false, index: model.count });
			}
			control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
			const oldOptions = partOptions;
			partOptions = { ...partOptions, showTabIndex, tabSizing: 'fixed', tabSizingFixedMinWidth: 20, tabSizingFixedMaxWidth: 20, editorActionsLocation: 'hidden', hasIcons: false };
			control.updateOptions(oldOptions, partOptions);
			await layoutConnectedGroup(group, 260);
			const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tabs-container > .tab')).slice(2);
			const context = $<HTMLCanvasElement>('canvas').getContext('2d')!;
			const results = cases.map(({ name, initial }, index) => {
				const tab = tabs[index];
				const labelName = tab.querySelector<HTMLElement>('.label-name')!;
				const nameContainer = labelName.parentElement!;
				const prefix = showTabIndex ? `${index + 3}: ` : '';
				context.font = mainWindow.getComputedStyle(labelName).font;
				const initialWidth = context.measureText(`${prefix}${initial}`).width;
				context.font = mainWindow.getComputedStyle(nameContainer).font;
				const minimumNameWidth = Math.ceil(initialWidth + context.measureText('…').width);
				return {
					name,
					measuredInitial: parseFloat(tab.style.getPropertyValue('--connected-tab-min-name-width')) === minimumNameWidth,
					initialVisible: nameContainer.clientWidth >= minimumNameWidth,
				};
			});
			assert.deepStrictEqual(results, cases.map(({ name }) => ({ name, measuredInitial: true, initialVisible: true })));
		});
	}

	test('connected shrink tabs collapse and restore icons as the editor width changes', async () => {
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
				collapsedIcons: tabs.filter(tab => tab.classList.contains('connected-tab-narrow')).length,
				trimmedNames: tabs.filter(tab => {
					const name = tab.querySelector<HTMLElement>('.monaco-icon-name-container')!;
					return name.scrollWidth > name.clientWidth;
				}).length,
				preservedExtensions: tabs.every(tab => {
					const suffix = tab.querySelector<HTMLElement>('.label-suffix')!;
					const action = tab.querySelector<HTMLElement>('.tab-actions')!;
					return suffix.textContent === '.txt' && suffix.getBoundingClientRect().right <= action.getBoundingClientRect().left;
				}),
			});
		}
		assert.deepStrictEqual(states, [
			{ collapsedIcons: 0, trimmedNames: 0, preservedExtensions: true },
			{ collapsedIcons: 10, trimmedNames: 10, preservedExtensions: true },
			{ collapsedIcons: 0, trimmedNames: 0, preservedExtensions: true },
			{ collapsedIcons: 10, trimmedNames: 10, preservedExtensions: true },
		]);
	});

	test('protects extensions only when the tab title matches the resource filename', async () => {
		const group = connectedGroup();
		const cases = [
			{ resource: URI.file('/path/archive.tar.gz'), name: 'archive.tar.gz' },
			{ resource: URI.file('/path/.env'), name: '.env' },
			{ resource: URI.file('/path/file.'), name: 'file.' },
			{ resource: URI.file('/path/notes.md'), name: 'Release 1.2 notes and announcements' },
			{ resource: URI.from({ scheme: 'test', path: '/views/123' }), name: 'Example.org documentation' },
			{ resource: undefined, name: 'Release 1.2 notes and announcements' },
		];
		const results = [];
		for (const { resource, name } of cases) {
			const editor = disposables.add(new class extends EditorInput {
				override get typeId(): string { return 'testEditorTitle'; }
				override get resource(): URI | undefined { return resource; }
				override getName(): string { return name; }
			}());
			model.openEditor(editor, { pinned: true, active: true });
			control.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
			await layoutConnectedGroup(group, 240);
			const tab = container.querySelector<HTMLElement>('.tab.active')!;
			results.push({
				name: tab.querySelector('.label-name')?.textContent,
				suffix: tab.querySelector('.label-suffix')?.textContent ?? '',
				accessibleName: tab.getAttribute('aria-label')?.includes(name),
			});
		}
		assert.deepStrictEqual(results, [
			{ name: 'archive.tar', suffix: '.gz', accessibleName: true },
			{ name: '.env', suffix: '', accessibleName: true },
			{ name: 'file.', suffix: '', accessibleName: true },
			{ name: 'Release 1.2 notes and announcements', suffix: '', accessibleName: true },
			{ name: 'Example.org documentation', suffix: '', accessibleName: true },
			{ name: 'Release 1.2 notes and announcements', suffix: '', accessibleName: true },
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
		action.blur();
		assert.deepStrictEqual({ clean, dirty, focused }, { clean: ['1', '0'], dirty: ['1', '1'], focused: ['1', '1'] });
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
		for (const { width, from } of [{ width: 240, from: 3 }, { width: 167, from: 0 }, { width: 120, from: 0 }]) {
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
		assert.deepStrictEqual({
			results,
			firstTabFlush: firstFill.getBoundingClientRect().left === container.querySelector<HTMLElement>('.monaco-scrollable-element')!.getBoundingClientRect().left,
			firstShoulder: mainWindow.getComputedStyle(firstFill, '::before').content,
		}, {
			results: [
				{ width: 240, leftShoulderVisible: true, rightShoulderVisible: true },
				{ width: 167, leftShoulderVisible: true, rightShoulderVisible: true },
				{ width: 120, leftShoulderVisible: true, rightShoulderVisible: false },
			],
			firstTabFlush: true,
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
				scrollLeft: tabs.scrollLeft,
				fillLeft: fill.getBoundingClientRect().left - tabs.getBoundingClientRect().left + tabs.scrollLeft,
				hidden: activeTab.classList.contains('connected-tab-hidden'),
				fillDisplay: fillStyle.display,
				outlineDisplay: mainWindow.getComputedStyle(edge).display,
				outlineColor: fillStyle.borderTopColor,
			});
		}
		assert.deepStrictEqual(results, [4, 3, 2].map(count => ({
			clampedBeforeLayout: true,
			activeIndex: count - 1,
			scrollLeft: count * 160 - 200,
			fillLeft: (count - 1) * 160,
			hidden: false,
			fillDisplay: 'block',
			outlineDisplay: 'block',
			outlineColor: 'rgb(255, 170, 0)',
		})));
	});

	test('connected sticky offsets respect content minimums instead of the classic fixed width', async () => {
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
			contentMinimum: tabs[0].offsetWidth > 80,
			offsets: tabs.map(tab => tab.style.left),
		}, { contentMinimum: true, offsets: ['0px', `${tabs[0].offsetWidth}px`, `${tabs[0].offsetWidth + tabs[1].offsetWidth}px`] });
	});

	test('only the bottom wrapped row joins the document and upper row resets when unwrapped', async () => {
		const group = connectedGroup();
		const oldOptions = partOptions;
		partOptions = { ...partOptions, wrapTabs: true, tabSizing: 'fixed', tabSizingFixedMinWidth: 120, tabSizingFixedMaxWidth: 120, editorActionsLocation: 'hidden' };
		control.updateOptions(oldOptions, partOptions);
		await layoutConnectedGroup(group, 150);
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('.tab'));
		const wrapped = tabs.map(tab => tab.classList.contains('connected-tab-upper-row'));
		const fill = tabs[0].querySelector<HTMLElement>('.tab-fill')!;
		const upper = { inset: mainWindow.getComputedStyle(fill).top, shoulder: mainWindow.getComputedStyle(fill, '::after').content };
		await layoutConnectedGroup(group, 400);
		const unwrapped = tabs.map(tab => tab.classList.contains('connected-tab-upper-row'));
		assert.deepStrictEqual({ wrapped, upper, unwrapped }, { wrapped: [true, false], upper: { inset: '-2px', shoulder: 'none' }, unwrapped: [false, false] });
	});

	test('selected wrapped tabs and focused actions use the document surface on every row', async () => {
		const group = connectedGroup();
		const root = group.closest('.monaco-workbench')!;
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
					measurements.push({
						activeIndex, theme, activeGroup,
						actionFocused: mainWindow.document.activeElement === action,
						upperRow: tab.classList.contains('connected-tab-upper-row'),
						fill: mainWindow.getComputedStyle(fill).backgroundColor,
						actions: mainWindow.getComputedStyle(actions).backgroundColor,
					});
					expected.push({ activeIndex, theme, activeGroup, actionFocused: true, upperRow: activeIndex === 0, fill: 'rgb(18, 52, 86)', actions: 'rgb(18, 52, 86)' });
				}
				root.classList.remove(theme);
			}
			action.blur();
		}
		assert.deepStrictEqual(measurements, expected);
	});

	test('wrapped fills have equal visible heights and the bottom tab reaches the document', async () => {
		const group = connectedGroup();
		group.style.setProperty('--modern-ui-connected-tab-surface', '#ffffff');
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
			const clippingBottom = Math.min(...Array.from(strip.querySelectorAll<HTMLElement>('.tabs-container, .monaco-scrollable-element'), element => element.getBoundingClientRect().bottom));
			const fills = Array.from(strip.querySelectorAll<HTMLElement>('.tab-fill'), element => element.getBoundingClientRect());
			measurements.push({
				tabHeight,
				stripHeight: strip.getBoundingClientRect().height,
				wrapping: strip.classList.contains('wrapping'),
				upperRow: tab.classList.contains('connected-tab-upper-row'),
				gap: strip.getBoundingClientRect().bottom - (fill.getBoundingClientRect().bottom - parseFloat(fillStyle.borderBottomWidth)),
				clippingGap: strip.getBoundingClientRect().bottom - clippingBottom,
				bottomRadius: fillStyle.borderBottomRightRadius,
				shoulder: mainWindow.getComputedStyle(fill, '::after').content,
				visibleHeights: fills.map(rect => Math.min(rect.bottom, clippingBottom) - rect.top),
				rowGap: fills[1].top - fills[0].bottom,
			});
		}
		assert.deepStrictEqual(measurements, [
			{ tabHeight: 'default', stripHeight: 60, wrapping: true, upperRow: false, gap: 0, clippingGap: 0, bottomRadius: '0px', shoulder: '""', visibleHeights: [28, 28], rowGap: 2 },
			{ tabHeight: 'compact', stripHeight: 52, wrapping: true, upperRow: false, gap: 0, clippingGap: 0, bottomRadius: '0px', shoulder: '""', visibleHeights: [24, 24], rowGap: 2 },
		]);
	});

	test('three wrapped rows retain equal tab heights without a fixed strip height', async () => {
		const group = connectedGroup();
		group.style.setProperty('--modern-ui-connected-tab-surface', '#ffffff');
		const editor = disposables.add(new TestFileEditorInput(URI.file('/path/third.ts'), 'testEditorInput'));
		model.openEditor(editor, { pinned: true, active: true });
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
			measurements.push({
				tabHeight,
				stripHeight: strip.height,
				visibleHeights: fills.map(fill => Math.min(fill.bottom, strip.bottom) - fill.top),
				rowGaps: fills.slice(1).map((fill, index) => fill.top - fills[index].bottom),
			});
		}
		assert.deepStrictEqual(measurements, [
			{ tabHeight: 'default', stripHeight: 90, visibleHeights: [28, 28, 28], rowGaps: [2, 2] },
			{ tabHeight: 'compact', stripHeight: 78, visibleHeights: [24, 24, 24], rowGaps: [2, 2] },
		]);
	});

	test('connected tabs reserve separator height without changing classic or shared modern tabs', async () => {
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
			container.classList.remove('modern-ui', 'modern-ui-tabs', 'modern-ui-connected-editor-tabs');
			const classic = await readHeight();
			container.classList.add('modern-ui-tabs');
			const sharedModern = await readHeight();
			container.classList.add('modern-ui');
			const pill = await readHeight();
			container.classList.add('modern-ui-connected-editor-tabs');
			heights.push({ tabHeight, classic, sharedModern, pill, connected: await readHeight() });
		}
		assert.deepStrictEqual(heights, [
			{ tabHeight: 'default', classic: 35, sharedModern: 32, pill: 32, connected: 33 },
			{ tabHeight: 'compact', classic: 22, sharedModern: 28, pill: 28, connected: 29 },
		]);
	});

	test('connected tabs fill row edges without inter-tab gutters', () => {
		const root = $('.monaco-workbench.modern-ui.modern-ui-tabs.modern-ui-connected-editor-tabs');
		root.style.cssText = '--vscode-spacing-size40: 4px; --vscode-strokeThickness: 1px;';
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
		const inactiveFillStyle = mainWindow.getComputedStyle(inactiveTab.querySelector<HTMLElement>('.tab-fill')!);
		const rowStyle = mainWindow.getComputedStyle(container.querySelector<HTMLElement>('.tabs-and-actions-container')!);

		assert.deepStrictEqual({
			active: { top: activeFillStyle.top, left: activeFillStyle.left, right: activeFillStyle.right, bottom: activeFillStyle.bottom },
			inactive: { top: inactiveFillStyle.top, left: inactiveFillStyle.left, right: inactiveFillStyle.right, bottom: inactiveFillStyle.bottom },
			rowPaddingLeft: rowStyle.paddingLeft,
		}, {
			active: { top: '-4px', left: '0px', right: '0px', bottom: '-6px' },
			inactive: { top: '-4px', left: '0px', right: '0px', bottom: '-5px' },
			rowPaddingLeft: '0px',
		});
	});

	test('keeps the connected outline inside the visible scroll area', async () => {
		const root = $('.monaco-workbench.modern-ui.modern-ui-tabs.modern-ui-connected-editor-tabs');
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-spacing-size80: 8px; --vscode-strokeThickness: 1px; --vscode-cornerRadius-small: 4px; --vscode-editor-background: #ffffff; --modern-ui-connected-tab-surface: #333333;';
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
		const clippedLeft = {
			edge: firstTab.classList.contains('connected-tab-left-edge'),
			clipped: firstTab.classList.contains('connected-tab-left-clipped'),
			fillOffset: firstFill.style.left,
			edgeOffset: [overflowEdge.style.left, overflowEdge.style.right],
			inset: overflowEdge.getBoundingClientRect().left - tabs.getBoundingClientRect().left,
			stationaryParent: overflowEdge.parentElement === tabs.parentElement,
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
			leftMaskHeight: mainWindow.getComputedStyle(secondEdge, '::before').height,
			leftMaskTop: mainWindow.getComputedStyle(secondEdge, '::before').borderTopWidth,
			rightMaskHeight: mainWindow.getComputedStyle(secondEdge, '::after').height,
			rightMaskTop: mainWindow.getComputedStyle(secondEdge, '::after').borderTopWidth,
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
				const capRight = outline.getBoundingClientRect().right - parseFloat(cap.right);
				const shoulderLeft = outline.getBoundingClientRect().right - parseFloat(shoulder.right) - parseFloat(shoulder.width);
				highContrastRight.push({
					theme, width,
					mask: mainWindow.getComputedStyle(overflowEdge, '::after').backgroundColor,
					capMeetsShoulder: parseFloat(cap.bottom) === parseFloat(shoulder.height),
					strokesAlign: capRight - parseFloat(cap.borderRightWidth) === shoulderLeft,
					baselineAligns: outline.getBoundingClientRect().bottom === tabs.getBoundingClientRect().bottom,
				});
			}
		}
		root.classList.remove('modern-ui-connected-editor-tabs');
		await layout(100);
		assert.deepStrictEqual({
			clippedLeft, multiSelected, singleSelected, terminalOutline, normalOutline, rightShoulderAtViewport, rightShoulderRevealed, leftShoulderAtViewport, leftShoulderRevealed, clippedRight, hiddenAtFillEdge, highContrast, highContrastRight,
			reset: overflowEdge.style.left,
		}, {
			clippedLeft: { edge: true, clipped: true, fillOffset: '', edgeOffset: ['0px', '0px'], inset: 0, stationaryParent: true, edgeOverlay: ['none', 'block', '8', '5px', '0px', 'border-box', '1px', '1px', 'rgb(51, 51, 51)'] },
			multiSelected: { clipping: '0px', edge: 'block', radius: '5px 5px 0px 0px', connectedClass: true },
			singleSelected: { clipping: '0px', connectedClass: true },
			terminalOutline: { right: '1px', rightShoulder: '""', rightMask: '""' },
			normalOutline: { left: '1px', right: '1px', leftShoulder: '""', rightShoulder: '""', edge: 'block', overflowEdge: 'none', leftMaskHeight: '3px', leftMaskTop: '0px', rightMaskHeight: '3px', rightMaskTop: '0px' },
			rightShoulderAtViewport: { edge: true, clipped: false, right: '1px', rightShoulder: '""', rightMask: '""', overflowEdge: 'block' },
			rightShoulderRevealed: { edge: false, clipped: false, rightShoulder: '""', rightMask: '""' },
			leftShoulderAtViewport: { edge: true, clipped: false, left: '1px', leftShoulder: 'none', leftMask: 'none', overflowEdge: 'none' },
			leftShoulderRevealed: { edge: false, clipped: false, leftShoulder: '""', leftMask: '""' },
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
			},
			hiddenAtFillEdge: ['none', 'none'],
			highContrast: { clipping: '0px', edge: 'block', connectedClass: true },
			highContrastRight: [
				{ theme: 'hc-black', width: 240, mask: 'rgb(0, 0, 0)', capMeetsShoulder: true, strokesAlign: true, baselineAligns: true },
				{ theme: 'hc-black', width: 324, mask: 'rgb(0, 0, 0)', capMeetsShoulder: true, strokesAlign: true, baselineAligns: true },
				{ theme: 'hc-light', width: 240, mask: 'rgb(255, 255, 255)', capMeetsShoulder: true, strokesAlign: true, baselineAligns: true },
				{ theme: 'hc-light', width: 324, mask: 'rgb(255, 255, 255)', capMeetsShoulder: true, strokesAlign: true, baselineAligns: true },
			],
			reset: '',
		});
	});

	test('refreshes connected clipping geometry after dirty width changes', async () => {
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
		const activeFill = activeTab.querySelector<HTMLElement>('.tab-fill')!;
		const overflowEdge = container.querySelector<HTMLElement>('.tab-connected-overflow-edge')!;
		const scroll = (left: number) => {
			tabs.classList.add('scroll');
			tabs.scrollLeft = left;
			tabs.dispatchEvent(new UIEvent(EventType.SCROLL));
		};
		const getLogicalFillRight = () => activeFill.getBoundingClientRect().right - tabs.getBoundingClientRect().left + tabs.scrollLeft;
		scroll(0);
		const cleanFillRight = getLogicalFillRight();
		const firstEditor = model.getEditorByIndex(0) as TestFileEditorInput;
		firstEditor.setDirty();
		control.updateEditorDirty(firstEditor);
		const dirtyFillRight = getLogicalFillRight();
		const invalidatedBeforeLayout = overflowEdge.style.left === '' && !activeTab.classList.contains('connected-tab-right-edge');
		await new Promise<void>(resolve => disposables.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));

		const shoulderExtent = Number.parseFloat(mainWindow.getComputedStyle(activeFill, '::after').width);
		const targetVisibleRight = (cleanFillRight + dirtyFillRight) / 2 + shoulderExtent;
		scroll(targetVisibleRight - tabs.clientWidth);
		const visibleRight = tabs.scrollLeft + tabs.clientWidth;
		const rightEdge = activeTab.classList.contains('connected-tab-right-edge');
		const currentGeometryNeedsEdge = dirtyFillRight + shoulderExtent > visibleRight;
		const staleGeometryWouldNeedEdge = cleanFillRight + shoulderExtent > visibleRight;
		firstEditor.capabilities = EditorInputCapabilities.CannotClose;
		control.updateEditorCapabilities(firstEditor);
		const capabilityUpdateInvalidated = overflowEdge.style.left === '' && !activeTab.classList.contains('connected-tab-right-edge');

		assert.deepStrictEqual({
			firstTabDirty: firstTab.classList.contains('dirty'),
			widthIncreased: dirtyFillRight > cleanFillRight,
			invalidatedBeforeLayout,
			rightEdge,
			currentGeometryNeedsEdge,
			staleGeometryWouldNeedEdge,
			capabilityUpdateInvalidated,
		}, {
			firstTabDirty: true,
			widthIncreased: true,
			invalidatedBeforeLayout: true,
			rightEdge: true,
			currentGeometryNeedsEdge: true,
			staleGeometryWouldNeedEdge: false,
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
