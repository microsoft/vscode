/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/tabstitle';
import nls = require('vs/nls');
import {IAction} from 'vs/base/common/actions';
import {prepareActions} from 'vs/workbench/browser/actionBarRegistry';
import arrays = require('vs/base/common/arrays');
import errors = require('vs/base/common/errors');
import DOM = require('vs/base/browser/dom');
import {isMacintosh} from 'vs/base/common/platform';
import {MIME_BINARY} from 'vs/base/common/mime';
import {Position, IEditorInput} from 'vs/platform/editor/common/editor';
import {IEditorGroup, IEditorIdentifier, asFileEditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {LcsDiff} from 'vs/base/common/diff/diff';
import {CommonKeybindings as Kb} from 'vs/base/common/keyCodes';
import {ActionBar, Separator} from 'vs/base/browser/ui/actionbar/actionbar';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {TitleControl} from 'vs/workbench/browser/parts/editor/titleControl';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {ScrollableElement} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {ScrollbarVisibility} from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';
import {extractResources} from 'vs/base/browser/dnd';
import Event, {Emitter} from 'vs/base/common/event';

interface ITabsContainer {
	onInsert: Event<number>;
	onDidInsert: Event<number>;
	onRemove: Event<number>;
	onDidRemove: Event<number>;
	container: HTMLElement;
	splice(index: number, deleteCount: number, ...insert: number[]): HTMLElement[];
	getDOMElement(index: number);
}

class SimpleTabContainer implements ITabsContainer {
	private parent: HTMLElement;
	private tabsContainer: HTMLElement;
	private tabs: HTMLElement[];

	private _onInsert: Emitter<number>;
	private _onDidInsert: Emitter<number>;
	private _onRemove: Emitter<number>;
	private _onDidRemove: Emitter<number>;

	constructor(parent: HTMLElement) {
		this.parent = parent;
		this.tabs = [];

		this._onInsert = new Emitter<number>();
		this._onDidInsert = new Emitter<number>();
		this._onRemove = new Emitter<number>();
		this._onDidRemove = new Emitter<number>();

		this.create();
	}

	public get onInsert(): Event<number> {
		return this._onInsert.event;
	}

	public get onDidInsert(): Event<number> {
		return this._onDidInsert.event;
	}

	public get onRemove(): Event<number> {
		return this._onRemove.event;
	}

	public get onDidRemove(): Event<number> {
		return this._onDidRemove.event;
	}

	public get container(): HTMLElement {
		return this.tabsContainer;
	}

	private create(): void {
		this.tabsContainer = document.createElement('div');
		this.parent.appendChild(this.tabsContainer);
	}

	public splice(index: number, deleteCount: number, ...insert: number[]): HTMLElement[] {
		// console.log('index', index, 'deleteCount', deleteCount, 'insert', insert);
		const deleted: HTMLElement[] = [];

		// Delete: Remove up to deleteCount at index
		for (let i = 0; i < deleteCount; i++) {
			const tabContainer = this.getDOMElement(index);
			if (tabContainer) {
				this._onRemove.fire(index);
				this.tabsContainer.removeChild(tabContainer);
				this._onDidRemove.fire(index);
				deleted.push(...this.tabs.splice(index, 1));
			}
		}

		// Add: Insert all elements to the left of index
		const referenceElement = this.getDOMElement(index);
		for (let i = 0; i < insert.length; i++) {
			const tabIndex = index + i;
			const tabContainer = document.createElement('div');
			this.tabs.splice(tabIndex, 0, tabContainer);
			this._onInsert.fire(tabIndex);

			if (referenceElement) {
				this.tabsContainer.insertBefore(tabContainer, referenceElement);
			} else {
				this.tabsContainer.appendChild(tabContainer);
			}

			this._onDidInsert.fire(tabIndex);
		}

		return deleted;
	}

	public getDOMElement(index: number): HTMLElement {
		return this.tabs[index];
	}
}

interface ITabViewItem {
	id: number;
	editor: IEditorInput;
}

export class TabsTitleControl extends TitleControl {

	private static ID_GENERATOR = 0;

	private titleContainer: HTMLElement;
	private tabsWidget: ITabsContainer;
	private activeTab: HTMLElement;
	private scrollbar: ScrollableElement;

	private groupActionsToolbar: ToolBar;
	private tabDisposeables: { [id: string]: IDisposable };

	private currentPrimaryGroupActionIds: string[];
	private currentSecondaryGroupActionIds: string[];

	private viewModel: ITabViewItem[];

	constructor(
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService
	) {
		super(contextMenuService, instantiationService, configurationService, editorService, editorGroupService, keybindingService, telemetryService, messageService);

		this.currentPrimaryGroupActionIds = [];
		this.currentSecondaryGroupActionIds = [];

		this.tabDisposeables = Object.create(null);
		this.viewModel = [];
	}

	public setContext(group: IEditorGroup): void {
		super.setContext(group);

		this.groupActionsToolbar.context = { group };
	}

	public create(parent: HTMLElement): void {
		this.titleContainer = parent;

		// Tabs widget
		this.tabsWidget = new SimpleTabContainer(parent);
		this.tabsWidget.container.setAttribute('role', 'tablist');
		DOM.addClass(this.tabsWidget.container, 'tabs-container');
		this.toDispose.push(DOM.addDisposableListener(this.tabsWidget.container, DOM.EventType.SCROLL, e => {
			if (DOM.hasClass(this.tabsWidget.container, 'scroll')) {
				this.scrollbar.updateState({
					scrollLeft: this.tabsWidget.container.scrollLeft // during DND the  container gets scrolled so we need to update the custom scrollbar
				});
			}
		}));

		// Eventing
		this.toDispose.push(this.tabsWidget.onInsert(index => this.onTabInserted(index)));
		this.toDispose.push(this.tabsWidget.onRemove(index => this.onTabRemoved(index)));

		// Custom Scrollbar
		this.scrollbar = new ScrollableElement(this.tabsWidget.container, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			scrollYToX: true,
			useShadows: false,
			canUseTranslate3d: true,
			horizontalScrollbarSize: 3
		});

		this.scrollbar.onScroll(e => {
			this.tabsWidget.container.scrollLeft = e.scrollLeft;
		});

		this.titleContainer.appendChild(this.scrollbar.getDomNode());

		// Drag over
		this.toDispose.push(DOM.addDisposableListener(this.tabsWidget.container, DOM.EventType.DRAG_OVER, (e: DragEvent) => {
			DOM.addClass(this.tabsWidget.container, 'scroll'); // enable support to scroll while dragging

			const target = e.target;
			if (target instanceof HTMLElement && target.className.indexOf('tabs-container') === 0) {
				DOM.addClass(this.tabsWidget.container, 'dropfeedback');
			}
		}));

		// Drag leave
		this.toDispose.push(DOM.addDisposableListener(this.tabsWidget.container, DOM.EventType.DRAG_LEAVE, (e: DragEvent) => {
			DOM.removeClass(this.tabsWidget.container, 'dropfeedback');
			DOM.removeClass(this.tabsWidget.container, 'scroll');
		}));

		// Drag end
		this.toDispose.push(DOM.addDisposableListener(this.tabsWidget.container, DOM.EventType.DRAG_END, (e: DragEvent) => {
			DOM.removeClass(this.tabsWidget.container, 'dropfeedback');
			DOM.removeClass(this.tabsWidget.container, 'scroll');
		}));

		// Drop onto tabs container
		this.toDispose.push(DOM.addDisposableListener(this.tabsWidget.container, DOM.EventType.DROP, (e: DragEvent) => {
			DOM.removeClass(this.tabsWidget.container, 'dropfeedback');
			DOM.removeClass(this.tabsWidget.container, 'scroll');

			const target = e.target;
			if (target instanceof HTMLElement && target.className.indexOf('tabs-container') === 0) {
				const group = this.context;
				if (group) {
					const targetPosition = this.stacks.positionOfGroup(group);
					const targetIndex = group.count;

					// Local DND
					const draggedEditor = TitleControl.getDraggedEditor();
					if (draggedEditor) {
						DOM.EventHelper.stop(e, true);

						const sourcePosition = this.stacks.positionOfGroup(draggedEditor.group);

						// Move editor to target position and index
						if (this.isMoveOperation(e, draggedEditor.group, group)) {
							this.editorGroupService.moveEditor(draggedEditor.editor, sourcePosition, targetPosition, targetIndex);
						}

						// Copy: just open editor at target index
						else {
							this.editorService.openEditor(draggedEditor.editor, EditorOptions.create({ pinned: true, index: targetIndex }), targetPosition).done(null, errors.onUnexpectedError);
						}

						this.onEditorDragEnd();
					}

					// External DND
					else {
						this.handleExternalDrop(e, targetPosition, targetIndex);
					}
				}
			}
		}));

		// Group Actions
		const groupActionsContainer = document.createElement('div');
		DOM.addClass(groupActionsContainer, 'group-actions');
		this.titleContainer.appendChild(groupActionsContainer);
		this.groupActionsToolbar = this.doCreateToolbar(groupActionsContainer);
	}

	private onTabInserted(index: number): void {
		const tabContainer = this.tabsWidget.getDOMElement(index);
		const group = this.context;
		const id = this.viewModel[index].id;
		const editor = this.viewModel[index].editor;

		tabContainer.draggable = true;
		tabContainer.tabIndex = 0;
		tabContainer.setAttribute('role', 'tab');
		tabContainer.setAttribute('aria-label', editor.getName());
		DOM.addClass(tabContainer, 'tab monaco-editor-background');

		// Tab Label Container
		const tabLabelContainer = document.createElement('div');
		tabContainer.appendChild(tabLabelContainer);
		DOM.addClass(tabLabelContainer, 'tab-label');

		// Tab Label
		const tabLabel = document.createElement('a');
		tabLabel.innerText = editor.getName();
		tabLabel.title = editor.getDescription(true) || '';
		tabLabelContainer.appendChild(tabLabel);

		// Tab Close
		const tabCloseContainer = document.createElement('div');
		DOM.addClass(tabCloseContainer, 'tab-close');
		tabContainer.appendChild(tabCloseContainer);

		const bar = new ActionBar(tabCloseContainer, { context: { editor, group }, ariaLabel: nls.localize('araLabelTabActions', "Tab actions") });
		bar.push(this.closeEditorAction, { icon: true, label: false });

		// Eventing
		const disposeables = this.hookTabListeners(tabContainer, { editor, group });

		this.tabDisposeables[id] = { dispose: () => dispose(disposeables) };
	}

	private onTabRemoved(index: number): void {
		const id = this.viewModel[index].id;

		dispose(this.tabDisposeables[id]);
		this.tabDisposeables[id] = void 0;
	}

	public allowDragging(element: HTMLElement): boolean {
		return (element.className === 'tabs-container');
	}

	protected doUpdate(): void {
		if (!this.context) {
			return;
		}

		const group = this.context;

		// Tabs container activity state
		const isActive = this.stacks.isActive(group);
		if (isActive) {
			DOM.addClass(this.titleContainer, 'active');
		} else {
			DOM.removeClass(this.titleContainer, 'active');
		}

		// Tab styles
		this.context.getEditors().forEach((editor, index) => {
			const tabContainer = this.tabsWidget.getDOMElement(index);
			const isPinned = group.isPinned(editor);
			const isActive = group.isActive(editor);
			const isDirty = editor.isDirty();

			// Pinned state
			if (isPinned) {
				DOM.addClass(tabContainer, 'pinned');
			} else {
				DOM.removeClass(tabContainer, 'pinned');
			}

			// Active state
			if (isActive) {
				DOM.addClass(tabContainer, 'active');
				tabContainer.setAttribute('aria-selected', 'true');
				this.activeTab = tabContainer;
			} else {
				DOM.removeClass(tabContainer, 'active');
				tabContainer.setAttribute('aria-selected', 'false');
			}

			// Dirty State
			if (isDirty) {
				DOM.addClass(tabContainer, 'dirty');
			} else {
				DOM.removeClass(tabContainer, 'dirty');
			}
		});

		// Ensure active tab is always revealed
		this.layout();
	}

	protected doRefresh(): void {
		const group = this.context;
		const editor = group && group.activeEditor;
		if (!editor) {
			this.tabsWidget.splice(0, this.viewModel.length); // clear all tabs
			this.viewModel = [];

			this.groupActionsToolbar.setActions([], [])();

			this.currentPrimaryGroupActionIds = [];
			this.currentSecondaryGroupActionIds = [];

			return; // return early if we are being closed
		}

		// Refresh Group Actions Toolbar
		const groupActions = this.getGroupActions(group);
		const primaryGroupActions = groupActions.primary;
		const secondaryGroupActions = groupActions.secondary;
		const primaryGroupActionIds = primaryGroupActions.map(a => a.id);
		const secondaryGroupActionIds = secondaryGroupActions.map(a => a.id);

		if (!arrays.equals(primaryGroupActionIds, this.currentPrimaryGroupActionIds) || !arrays.equals(secondaryGroupActionIds, this.currentSecondaryGroupActionIds)) {
			this.groupActionsToolbar.setActions(primaryGroupActions, secondaryGroupActions)();
			this.currentPrimaryGroupActionIds = primaryGroupActionIds;
			this.currentSecondaryGroupActionIds = secondaryGroupActionIds;
		}

		// Refresh Tabs
		this.refreshTabs(group);

		// Update styles
		this.doUpdate();
	}

	private computeNewViewModel(currentViewModel: ITabViewItem[]): ITabViewItem[] {
		const newViewModel: ITabViewItem[] = [];

		this.context.getEditors().forEach(editor => {
			let tabState: ITabViewItem;

			for (let i = 0; i < currentViewModel.length; i++) {
				const state = currentViewModel[i];
				if (state.editor.matches(editor)) {
					tabState = state;
					break;
				}
			}

			if (!tabState) {
				tabState = {
					id: TabsTitleControl.ID_GENERATOR++,
					editor
				};
			}

			newViewModel.push(tabState);
		});

		return newViewModel;
	}

	private refreshTabs(group: IEditorGroup): void {

		// Compute a diff to our current view model
		const oldViewModel = this.viewModel;
		const newViewModel = this.computeNewViewModel(oldViewModel);
		const diff = new LcsDiff({
			getLength: () => oldViewModel.length,
			getElementHash: (i: number) => String(oldViewModel[i].id)
		}, {
			getLength: () => newViewModel.length,
			getElementHash: (i: number) => String(newViewModel[i].id)
		}).ComputeDiff();

		// Update view model
		this.viewModel = newViewModel;

		// Update tabs widget
		diff.forEach(d => {

			// Replace
			if (d.modifiedLength && d.originalLength) {
				this.tabsWidget.splice(d.originalStart, d.originalLength, ...new Array<number>(d.modifiedLength)); // TODO this needs to provide the width of each added tab
			}

			// Add
			else if (d.modifiedLength) {
				this.tabsWidget.splice(d.modifiedStart, 0, ...new Array<number>(d.modifiedLength)); // TODO this needs to provide the width of each added tab
			}

			// Delete
			else if (d.originalLength) {
				this.tabsWidget.splice(d.originalStart, d.originalLength);
			}
		});
	}

	public layout(): void {
		if (!this.activeTab) {
			return;
		}

		const visibleContainerWidth = this.tabsWidget.container.offsetWidth;
		const totalContainerWidth = this.tabsWidget.container.scrollWidth;

		// Update scrollbar
		this.scrollbar.updateState({
			width: visibleContainerWidth,
			scrollWidth: totalContainerWidth
		});

		// Always reveal the active one
		const containerScrollPosX = this.tabsWidget.container.scrollLeft;
		const activeTabPosX = this.activeTab.offsetLeft;
		const activeTabWidth = this.activeTab.offsetWidth;
		const activeTabFits = activeTabWidth <= visibleContainerWidth;

		// Tab is overflowing to the right: Scroll minimally until the element is fully visible to the right
		// Note: only try to do this if we actually have enough width to give to show the tab fully!
		if (activeTabFits && containerScrollPosX + visibleContainerWidth < activeTabPosX + activeTabWidth) {
			this.scrollbar.updateState({
				scrollLeft: containerScrollPosX + ((activeTabPosX + activeTabWidth) /* right corner of tab */ - (containerScrollPosX + visibleContainerWidth) /* right corner of view port */)
			});
		}

		// Tab is overlflowng to the left: Scroll it into view to the left
		else if (containerScrollPosX > activeTabPosX) {
			this.scrollbar.updateState({
				scrollLeft: this.activeTab.offsetLeft
			});
		}

		// Update enablement of certain actions that depend on overflow
		const isOverflowing = (totalContainerWidth > visibleContainerWidth);
		this.showEditorsInGroupAction.enabled = isOverflowing;
	}

	private hookTabListeners(tab: HTMLElement, identifier: IEditorIdentifier): IDisposable[] {
		const tabDisposeables = [];
		const {editor, group} = identifier;
		const position = this.stacks.positionOfGroup(group);

		// Open on Click
		tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			tab.blur();

			if (e.button === 0 /* Left Button */ && !DOM.findParentWithClass(<any>e.target || e.srcElement, 'monaco-action-bar', 'tab')) {
				setTimeout(() => this.editorService.openEditor(editor, null, position).done(null, errors.onUnexpectedError)); // timeout to keep focus in editor after mouse up
			}
		}));

		// Close on mouse middle click
		tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.MOUSE_UP, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);
			tab.blur();

			if (e.button === 1 /* Middle Button */) {
				this.editorService.closeEditor(position, editor).done(null, errors.onUnexpectedError);
			}
		}));

		// Keyboard accessibility
		tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			let handled = false;

			// Run action on Enter/Space
			if (event.equals(Kb.ENTER) || event.equals(Kb.SPACE)) {
				handled = true;
				this.editorService.openEditor(editor, null, position).done(null, errors.onUnexpectedError);
			}

			// Navigate in editors
			else if ([Kb.LEFT_ARROW, Kb.RIGHT_ARROW, Kb.UP_ARROW, Kb.DOWN_ARROW, Kb.HOME, Kb.END].some(kb => event.equals(kb))) {
				const index = group.indexOf(editor);

				let targetIndex: number;
				if (event.equals(Kb.LEFT_ARROW) || event.equals(Kb.UP_ARROW)) {
					targetIndex = index - 1;
				} else if (event.equals(Kb.RIGHT_ARROW) || event.equals(Kb.DOWN_ARROW)) {
					targetIndex = index + 1;
				} else if (event.equals(Kb.HOME)) {
					targetIndex = 0;
				} else {
					targetIndex = group.count - 1;
				}

				const target = group.getEditor(targetIndex);
				if (target) {
					handled = true;
					this.editorService.openEditor(target, EditorOptions.create({ preserveFocus: true }), position).done(null, errors.onUnexpectedError);
					this.tabsWidget.getDOMElement(targetIndex).focus();
				}
			}

			if (handled) {
				event.preventDefault();
				event.stopPropagation();
			}
		}));

		// Pin on double click
		tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DBLCLICK, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);

			this.editorGroupService.pinEditor(position, editor);
		}));

		// Context menu
		tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.CONTEXT_MENU, (e) => this.onContextMenu(identifier, e, tab)));

		// Drag start
		tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_START, (e: DragEvent) => {
			this.onEditorDragStart({ editor, group });
			e.dataTransfer.effectAllowed = 'copyMove';

			// Enable support to drag a file to desktop
			const fileInput = asFileEditorInput(editor, true);
			if (fileInput) {
				e.dataTransfer.setData('DownloadURL', [MIME_BINARY, editor.getName(), fileInput.getResource().toString()].join(':'));
			}
		}));

		// Drag over
		tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_OVER, (e: DragEvent) => {
			DOM.addClass(tab, 'dropfeedback');
		}));

		// Drag leave
		tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_LEAVE, (e: DragEvent) => {
			DOM.removeClass(tab, 'dropfeedback');
		}));

		// Drag end
		tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_END, (e: DragEvent) => {
			DOM.removeClass(tab, 'dropfeedback');

			this.onEditorDragEnd();
		}));

		// Drop
		tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DROP, (e: DragEvent) => {
			DOM.removeClass(tab, 'dropfeedback');

			const targetPosition = this.stacks.positionOfGroup(group);
			const targetIndex = group.indexOf(editor);

			// Local DND
			const draggedEditor = TabsTitleControl.getDraggedEditor();
			if (draggedEditor) {
				DOM.EventHelper.stop(e, true);

				const sourcePosition = this.stacks.positionOfGroup(draggedEditor.group);

				// Move editor to target position and index
				if (this.isMoveOperation(e, draggedEditor.group, group)) {
					this.editorGroupService.moveEditor(draggedEditor.editor, sourcePosition, targetPosition, targetIndex);
				}

				// Copy: just open editor at target index
				else {
					this.editorService.openEditor(draggedEditor.editor, EditorOptions.create({ pinned: true, index: targetIndex }), targetPosition).done(null, errors.onUnexpectedError);
				}

				this.onEditorDragEnd();
			}

			// External DND
			else {
				this.handleExternalDrop(e, targetPosition, targetIndex);
			}
		}));

		return tabDisposeables;
	}

	private handleExternalDrop(e: DragEvent, targetPosition: Position, targetIndex: number): void {
		const resources = extractResources(e).filter(r => r.scheme === 'file' || r.scheme === 'untitled');

		// Open resources if found
		if (resources.length) {
			DOM.EventHelper.stop(e, true);

			this.editorService.openEditors(resources.map(resource => {
				return {
					input: { resource, options: { pinned: true, index: targetIndex } },
					position: targetPosition
				};
			})).done(() => {
				this.editorGroupService.focusGroup(targetPosition);
				window.focus();
			}, errors.onUnexpectedError);
		}
	}

	private isMoveOperation(e: DragEvent, source: IEditorGroup, target: IEditorGroup) {
		const isCopy = (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);

		return !isCopy || source.id === target.id;
	}

	protected getContextMenuActions(identifier: IEditorIdentifier): IAction[] {
		const actions = super.getContextMenuActions(identifier);
		const {editor, group} = identifier;

		// Actions: For active editor
		if (group.isActive(editor)) {
			const editorActions = this.getEditorActions(identifier);
			if (editorActions.primary.length) {
				actions.push(new Separator(), ...prepareActions(editorActions.primary));
			}

			if (editorActions.secondary.length) {
				actions.push(new Separator(), ...prepareActions(editorActions.secondary));
			}
		}

		return actions;
	}

	public dispose(): void {
		super.dispose();

		// Toolbar
		this.groupActionsToolbar.dispose();
	}
}