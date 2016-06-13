/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/tabstitle';
import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {IAction} from 'vs/base/common/actions';
import {prepareActions} from 'vs/workbench/browser/actionBarRegistry';
import arrays = require('vs/base/common/arrays');
import errors = require('vs/base/common/errors');
import DOM = require('vs/base/browser/dom');
import {Builder, $} from 'vs/base/browser/builder';
import {IEditorGroup, IEditorIdentifier} from 'vs/workbench/common/editor';
import {ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {ActionBar, Separator} from 'vs/base/browser/ui/actionbar/actionbar';
import {StandardMouseEvent} from 'vs/base/browser/mouseEvent';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {TitleControl} from 'vs/workbench/browser/parts/editor/titleControl';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';

export class TabsTitleControl extends TitleControl {
	private titleContainer: HTMLElement;
	private tabsContainer: HTMLElement;
	private activeTab: HTMLElement;

	private groupActionsToolbar: ToolBar;
	private tabDisposeables: IDisposable[];

	private currentPrimaryGroupActionIds: string[];
	private currentSecondaryGroupActionIds: string[];

	constructor(
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IMessageService messageService: IMessageService
	) {
		super(contextMenuService, instantiationService, editorService, editorGroupService, keybindingService, telemetryService, messageService);

		this.currentPrimaryGroupActionIds = [];
		this.currentSecondaryGroupActionIds = [];

		this.tabDisposeables = [];
	}

	public setContext(group: IEditorGroup): void {
		super.setContext(group);

		this.groupActionsToolbar.context = { group };
	}

	public create(parent: Builder): void {
		this.titleContainer = parent.getHTMLElement();

		// Tabs Container
		this.tabsContainer = document.createElement('div');
		DOM.addClass(this.tabsContainer, 'tabs-container');
		this.titleContainer.appendChild(this.tabsContainer);

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
					const identifier = this.stringToId(e.dataTransfer.getData('text'));
					if (identifier) {
						e.preventDefault();

						const sourcePosition = this.stacks.positionOfGroup(identifier.group);
						const targetPosition = this.stacks.positionOfGroup(group);

						// Move editor to target position at the end
						this.editorGroupService.moveEditor(identifier.editor, sourcePosition, targetPosition, group.count);
					}
				}
			}
		}));

		// Convert mouse wheel vertical scroll to horizontal
		this.toDispose.push(DOM.addDisposableListener(this.tabsContainer, DOM.EventType.WHEEL, (e: WheelEvent) => {
			if (e.deltaY && !e.deltaX) {
				DOM.EventHelper.stop(e);
				this.tabsContainer.scrollLeft += e.deltaY;
			}
		}));

		// Group Actions
		const groupActionsContainer = document.createElement('div');
		DOM.addClass(groupActionsContainer, 'group-actions');
		this.titleContainer.appendChild(groupActionsContainer);
		this.groupActionsToolbar = this.doCreateToolbar($(groupActionsContainer));
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

		// Ensure active tab is always revealed
		this.layout();
	}

	public layout(): void {
		if (!this.activeTab) {
			return;
		}

		// Always reveal the active one
		const containerWidth = this.tabsContainer.offsetWidth;
		const containerScrollPosX = this.tabsContainer.scrollLeft;
		const activeTabPosX = this.activeTab.offsetLeft;
		const activeTabWidth = this.activeTab.offsetWidth;

		// Tab is overflowing to the right: Scroll minimally until the element is fully visible to the right
		if (containerScrollPosX + containerWidth < activeTabPosX + activeTabWidth) {
			this.tabsContainer.scrollLeft += ((activeTabPosX + activeTabWidth) /* right corner of tab */ - (containerScrollPosX + containerWidth) /* right corner of view port */);
		}

		// Tab is overlflowng to the left: Scroll it into view to the left
		else if (containerScrollPosX > activeTabPosX) {
			this.tabsContainer.scrollLeft = this.activeTab.offsetLeft;
		}

		// Update enablement of certain actions that depend on overflow
		const isOverflowing = (this.tabsContainer.scrollWidth > containerWidth);
		this.showEditorsOfLeftGroup.enabled = isOverflowing;
		this.showEditorsOfCenterGroup.enabled = isOverflowing;
		this.showEditorsOfRightGroup.enabled = isOverflowing;
	}

	private hookTabListeners(tab: HTMLElement, identifier: IEditorIdentifier): void {
		const {editor, group} = identifier;
		const position = this.stacks.positionOfGroup(group);

		// Open on Click
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (e.button === 0 /* Left Button */ && !DOM.findParentWithClass(<any>e.target || e.srcElement, 'monaco-action-bar', 'tab')) {
				this.editorService.openEditor(editor, null, position).done(null, errors.onUnexpectedError);
			}
		}));

		// Pin on double click
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DBLCLICK, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);

			this.editorGroupService.pinEditor(position, editor);
		}));

		// Close on mouse middle click
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.MOUSE_UP, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);

			if (e.button === 1 /* Middle Button */) {
				this.editorService.closeEditor(position, editor).done(null, errors.onUnexpectedError);
			}
		}));

		// Context menu
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.CONTEXT_MENU, (e: Event) => {
			DOM.EventHelper.stop(e);

			let anchor: HTMLElement | { x: number, y: number } = tab;
			if (e instanceof MouseEvent) {
				const event = new StandardMouseEvent(e);
				anchor = { x: event.posx, y: event.posy };
			}

			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => TPromise.as(this.getTabActions(identifier)),
				getActionsContext: () => identifier,
				getKeyBinding: (action) => {
					var opts = this.keybindingService.lookupKeybindings(action.id);
					if (opts.length > 0) {
						return opts[0]; // only take the first one
					}

					return null;
				}
			});
		}));

		// Drag start
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DRAG_START, (e: DragEvent) => {
			DOM.addClass(tab, 'dragged');
			e.dataTransfer.setData('text', this.idToString(identifier));
			e.dataTransfer.effectAllowed = 'move';
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
		}));

		// Drop
		this.tabDisposeables.push(DOM.addDisposableListener(tab, DOM.EventType.DROP, (e: DragEvent) => {
			const identifier = this.stringToId(e.dataTransfer.getData('text'));
			if (identifier) {
				e.preventDefault();

				const sourcePosition = this.stacks.positionOfGroup(identifier.group);
				const targetPosition = this.stacks.positionOfGroup(group);
				const targetIndex = group.indexOf(editor);

				// Move editor to target position and index
				this.editorGroupService.moveEditor(identifier.editor, sourcePosition, targetPosition, targetIndex);
			}
		}));
	}

	private idToString(identifier: IEditorIdentifier): string {
		return [identifier.group.id, identifier.group.indexOf(identifier.editor)].join(',');
	}

	private stringToId(str: string): IEditorIdentifier {
		if (str) {
			const parts = str.split(',');
			if (parts.length === 2) {
				const group = this.stacks.getGroup(Number(parts[0]));
				if (group) {
					const editor = group.getEditor(Number(parts[1]));
					if (editor) {
						return { group, editor };
					}
				}
			}
		}

		return void 0;
	}

	private getTabActions(identifier: IEditorIdentifier): IAction[] {
		const {editor, group} = identifier;

		// Enablement
		this.closeOtherEditorsAction.enabled = group.count > 1;
		this.pinEditorAction.enabled = !group.isPinned(editor);
		this.closeRightEditorsAction.enabled = group.indexOf(editor) !== group.count - 1;

		// Actions: For all editors
		const actions: IAction[] = [
			this.closeEditorAction,
			this.closeOtherEditorsAction,
			this.closeRightEditorsAction,
			new Separator(),
			this.pinEditorAction,
		];

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