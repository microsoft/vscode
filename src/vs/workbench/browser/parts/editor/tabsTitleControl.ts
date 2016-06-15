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
import URI from 'vs/base/common/uri';
import DOM = require('vs/base/browser/dom');
import {isMacintosh} from 'vs/base/common/platform';
import {MIME_BINARY} from 'vs/base/common/mime';
import {Position} from 'vs/platform/editor/common/editor';
import {IEditorGroup, IEditorIdentifier, asFileEditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
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

export class TabsTitleControl extends TitleControl {

	private static draggedEditor: IEditorIdentifier;

	private titleContainer: HTMLElement;
	private tabsContainer: HTMLElement;
	private activeTab: HTMLElement;
	private scrollbar: ScrollableElement;

	private groupActionsToolbar: ToolBar;
	private tabDisposeables: IDisposable[];

	private currentPrimaryGroupActionIds: string[];
	private currentSecondaryGroupActionIds: string[];

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

		this.tabDisposeables = [];
	}

	public setContext(group: IEditorGroup): void {
		super.setContext(group);

		this.groupActionsToolbar.context = { group };
	}

	public create(parent: HTMLElement): void {
		this.titleContainer = parent;

		// Tabs Container
		this.tabsContainer = document.createElement('div');
		DOM.addClass(this.tabsContainer, 'tabs-container');

		// Custom Scrollbar
		this.scrollbar = new ScrollableElement(this.tabsContainer, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			scrollYToX: true,
			useShadows: false,
			canUseTranslate3d: true,
			horizontalScrollbarSize: 3
		});
		this.tabsContainer.style.overflow = 'scroll'; // custom scrollbar is eager on removing this style but we want it for DND scroll feedback

		this.scrollbar.onScroll(e => {
			this.tabsContainer.scrollLeft = e.scrollLeft;
		});

		this.titleContainer.appendChild(this.scrollbar.getDomNode());

		// Drag over
		this.toDispose.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DRAG_OVER, (e: DragEvent) => {
			const target = e.target;
			if (target instanceof HTMLElement && target.className.indexOf('tabs-container') === 0) {
				DOM.addClass(this.tabsContainer, 'dropfeedback');
			}
		}));

		// Drag leave
		this.toDispose.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DRAG_LEAVE, (e: DragEvent) => {
			DOM.removeClass(this.tabsContainer, 'dropfeedback');
		}));

		// Drag end
		this.toDispose.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DRAG_END, (e: DragEvent) => {
			DOM.removeClass(this.tabsContainer, 'dropfeedback');
		}));

		// Drop onto tabs container
		this.toDispose.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.DROP, (e: DragEvent) => {
			DOM.removeClass(this.tabsContainer, 'dropfeedback');

			const target = e.target;
			if (target instanceof HTMLElement && target.className.indexOf('tabs-container') === 0) {
				const group = this.context;
				if (group) {
					const targetPosition = this.stacks.positionOfGroup(group);
					const targetIndex = group.count;

					// Local DND
					if (TabsTitleControl.draggedEditor) {
						e.preventDefault();

						const sourcePosition = this.stacks.positionOfGroup(TabsTitleControl.draggedEditor.group);

						// Move editor to target position and index
						if (this.isMoveOperation(e, TabsTitleControl.draggedEditor.group, group)) {
							this.editorGroupService.moveEditor(TabsTitleControl.draggedEditor.editor, sourcePosition, targetPosition, targetIndex);
						}

						// Copy: just open editor at target index
						else {
							this.editorService.openEditor(TabsTitleControl.draggedEditor.editor, EditorOptions.create({ pinned: true, index: targetIndex }), targetPosition).done(null, errors.onUnexpectedError);
						}
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
			const tabContainer = this.tabsContainer.children[index];
			if (tabContainer instanceof HTMLElement) {
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
					this.activeTab = tabContainer;
				} else {
					DOM.removeClass(tabContainer, 'active');
				}

				// Dirty State
				if (isDirty) {
					DOM.addClass(tabContainer, 'dirty');
				} else {
					DOM.removeClass(tabContainer, 'dirty');
				}
			}
		});

		// Ensure active tab is always revealed
		this.layout();
	}

	protected doRefresh(): void {
		if (!this.context) {
			return;
		}

		const group = this.context;
		const editor = group.activeEditor;
		if (!editor) {
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

	private refreshTabs(group: IEditorGroup): void {

		// Empty container first
		DOM.clearNode(this.tabsContainer);
		dispose(this.tabDisposeables);
		this.tabDisposeables = [];

		const tabContainers: HTMLElement[] = [];

		// Add a tab for each opened editor
		this.context.getEditors().forEach(editor => {
			const tabContainer = document.createElement('div');
			tabContainer.draggable = true;
			tabContainer.tabIndex = 0;
			DOM.addClass(tabContainer, 'tab monaco-editor-background');
			tabContainers.push(tabContainer);

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

			this.tabDisposeables.push(bar);

			// Eventing
			this.hookTabListeners(tabContainer, { editor, group });
		});

		// Add to tabs container
		tabContainers.forEach(tab => this.tabsContainer.appendChild(tab));
	}

	public layout(): void {
		if (!this.activeTab) {
			return;
		}

		const visibleContainerWidth = this.tabsContainer.offsetWidth;
		const totalContainerWidth = this.tabsContainer.scrollWidth;

		// Update scrollbar
		this.scrollbar.updateState({
			width: visibleContainerWidth,
			scrollWidth: totalContainerWidth
		});

		// Always reveal the active one
		const containerScrollPosX = this.tabsContainer.scrollLeft;
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
		this.showEditorsOfLeftGroup.enabled = isOverflowing;
		this.showEditorsOfCenterGroup.enabled = isOverflowing;
		this.showEditorsOfRightGroup.enabled = isOverflowing;
	}

	private hookTabListeners(tab: HTMLElement, identifier: IEditorIdentifier): void {
		const {editor, group} = identifier;
		const position = this.stacks.positionOfGroup(group);

		// Open on Click
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			tab.blur();

			if (e.button === 0 /* Left Button */ && !DOM.findParentWithClass(<any>e.target || e.srcElement, 'monaco-action-bar', 'tab')) {
				setTimeout(() => this.editorService.openEditor(editor, null, position).done(null, errors.onUnexpectedError)); // timeout to keep focus in editor after mouse up
			}
		}));

		// Close on mouse middle click
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.MOUSE_UP, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);
			tab.blur();

			if (e.button === 1 /* Middle Button */) {
				this.editorService.closeEditor(position, editor).done(null, errors.onUnexpectedError);
			}
		}));

		// Keyboard accessibility
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
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
					(<HTMLElement>this.tabsContainer.childNodes[targetIndex]).focus();
				}
			}

			if (handled) {
				event.preventDefault();
				event.stopPropagation();
			}
		}));

		// Pin on double click
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DBLCLICK, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);

			this.editorGroupService.pinEditor(position, editor);
		}));

		// Context menu
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.CONTEXT_MENU, (e: Event) => this.onContextMenu(identifier, e, tab)));

		// Drag start
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_START, (e: DragEvent) => {
			DOM.addClass(tab, 'dragged');
			TabsTitleControl.draggedEditor = { editor, group };
			e.dataTransfer.effectAllowed = 'copyMove';

			// Enable support to drag a file to desktop
			const fileInput = asFileEditorInput(editor, true);
			if (fileInput) {
				e.dataTransfer.setData('DownloadURL', [MIME_BINARY, editor.getName(), fileInput.getResource().toString()].join(':'));
			}
		}));

		// Drag over
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_OVER, (e: DragEvent) => {
			DOM.addClass(tab, 'dropfeedback');
		}));

		// Drag leave
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_LEAVE, (e: DragEvent) => {
			DOM.removeClass(tab, 'dropfeedback');
		}));

		// Drag end
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_END, (e: DragEvent) => {
			DOM.removeClass(tab, 'dragged');
			DOM.removeClass(tab, 'dropfeedback');
			TabsTitleControl.draggedEditor = void 0;
		}));

		// Drop
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DROP, (e: DragEvent) => {
			const targetPosition = this.stacks.positionOfGroup(group);
			const targetIndex = group.indexOf(editor);

			// Local DND
			if (TabsTitleControl.draggedEditor) {
				e.preventDefault();

				const sourcePosition = this.stacks.positionOfGroup(TabsTitleControl.draggedEditor.group);

				// Move editor to target position and index
				if (this.isMoveOperation(e, TabsTitleControl.draggedEditor.group, group)) {
					this.editorGroupService.moveEditor(TabsTitleControl.draggedEditor.editor, sourcePosition, targetPosition, targetIndex);
				}

				// Copy: just open editor at target index
				else {
					this.editorService.openEditor(TabsTitleControl.draggedEditor.editor, EditorOptions.create({ pinned: true, index: targetIndex }), targetPosition).done(null, errors.onUnexpectedError);
				}
			}

			// External DND
			else {
				this.handleExternalDrop(e, targetPosition, targetIndex);
			}
		}));
	}

	private handleExternalDrop(e: DragEvent, targetPosition: Position, targetIndex: number): void {
		let resources: URI[] = [];

		if (e.dataTransfer.types.length > 0) {

			// Check for in-app DND
			const rawData = e.dataTransfer.getData(e.dataTransfer.types[0]);
			if (rawData) {
				const resource = URI.parse(rawData);
				if (resource.scheme === 'file' || resource.scheme === 'untitled') {
					resources.push(resource);
				}
			}

			// Check for external app DND
			else if (e.dataTransfer && e.dataTransfer.files) {
				let thepaths: string[] = [];
				for (let i = 0; i < e.dataTransfer.files.length; i++) {
					if (e.dataTransfer.files[i] && (e.dataTransfer.files[i]).path) {
						thepaths.push(e.dataTransfer.files[i].path);
					}
				}

				resources = thepaths.map(p => URI.file(p));
			}
		}

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
			const editorActions = this.getEditorActions(group);
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