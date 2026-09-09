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
import { EditorsOrder, IEditorPartOptions } from '../../../../common/editor.js';
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
			const editor = disposables.add(new TestFileEditorInput(URI.file(`/path/file${i}.txt`), 'testEditorInput'));
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

	test('keeps the connected outline inside the visible scroll area', async () => {
		const root = $('.monaco-workbench.modern-ui.modern-ui-tabs.modern-ui-connected-editor-tabs');
		root.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-spacing-size80: 8px; --vscode-strokeThickness: 1px; --vscode-cornerRadius-small: 4px; --vscode-editor-background: #ffffff; --modern-ui-connected-tab-border: #333333;';
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
		root.classList.remove('modern-ui-connected-editor-tabs');
		await layout(100);
		assert.deepStrictEqual({
			clippedLeft, multiSelected, singleSelected, terminalOutline, normalOutline, rightShoulderAtViewport, rightShoulderRevealed, leftShoulderAtViewport, leftShoulderRevealed, clippedRight, hiddenAtFillEdge, highContrast,
			reset: overflowEdge.style.left,
		}, {
			clippedLeft: { edge: true, clipped: true, fillOffset: '', edgeOffset: ['0px', '0px'], inset: 0, stationaryParent: true, edgeOverlay: ['none', 'block', '8', '5px', '0px', 'border-box', '1px', '1px', 'rgb(255, 255, 255)'] },
			multiSelected: { clipping: '', edge: 'none', radius: '4px', connectedClass: false },
			singleSelected: { clipping: '0px', connectedClass: true },
			terminalOutline: { right: '1px', rightShoulder: 'none', rightMask: 'none' },
			normalOutline: { left: '1px', right: '1px', leftShoulder: '""', rightShoulder: '""', edge: 'block', overflowEdge: 'none', leftMaskHeight: '6px', leftMaskTop: '0px', rightMaskHeight: '6px', rightMaskTop: '0px' },
			rightShoulderAtViewport: { edge: true, clipped: false, right: '1px', rightShoulder: 'none', rightMask: 'none', overflowEdge: 'none' },
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
				edgeOverlay: ['none', 'block', '8', '5px', '0px', 'border-box', '1px', '1px', 'rgb(255, 255, 255)'],
				previousTabOverflow: '',
			},
			hiddenAtFillEdge: ['none', 'none'],
			highContrast: { clipping: '', edge: 'none', connectedClass: false },
			reset: '',
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
