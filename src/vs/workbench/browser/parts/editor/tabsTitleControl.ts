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
import {IEditorGroup} from 'vs/workbench/common/editor';
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
import {IEditorInput} from 'vs/platform/editor/common/editor';

export class TabsTitleControl extends TitleControl {
	private titleContainer: Builder;
	private tabsContainer: Builder;

	private groupActionsToolbar: ToolBar;
	private tabActionBars: ActionBar[];

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

		this.tabActionBars = [];
	}

	public setContext(group: IEditorGroup): void {
		super.setContext(group);

		this.groupActionsToolbar.context = { group };
	}

	public create(parent: Builder): void {
		this.titleContainer = $(parent);

		// Tabs Container
		parent.div({
			'class': 'tabs-container'
		}, (div) => {
			this.tabsContainer = div;

			// Support to scroll the tabs container with the mouse wheel
			// if we detect that scrolling happens in Y-axis
			div.on('wheel', (e: WheelEvent) => {
				if (e.deltaY && !e.deltaX) {
					DOM.EventHelper.stop(e);
					this.tabsContainer.getHTMLElement().scrollLeft += e.deltaY;
				}
			});
		});

		// Group Actions
		parent.div({
			'class': 'group-actions'
		}, (div) => {
			this.groupActionsToolbar = this.doCreateToolbar(div);
		});
	}

	public allowDragging(element: HTMLElement): boolean {
		return (element.className === 'tabs-container');
	}

	public refresh(): void {
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

		// Activity state
		const isActive = this.stacks.isActive(group);
		if (isActive) {
			this.titleContainer.addClass('active');
		} else {
			this.titleContainer.removeClass('active');
		}

		// Update Group Actions Toolbar
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
	}

	private refreshTabs(group: IEditorGroup): void {

		// Empty container first
		this.tabsContainer.empty();
		while (this.tabActionBars.length) {
			this.tabActionBars.pop().dispose();
		}

		let activeTab: HTMLElement;

		// Add a tab for each opened editor
		this.context.getEditors().forEach(editor => {
			const isPinned = group.isPinned(editor);
			const isActive = group.isActive(editor);
			const isDirty = editor.isDirty();

			$(this.tabsContainer).div({ 'class': 'tab monaco-editor-background' }, tab => {

				// Eventing
				this.hookTabListeners(tab, editor, group);

				// Pinned state
				if (isPinned) {
					tab.addClass('pinned');
				} else {
					tab.removeClass('pinned');
				}

				// Active state
				if (isActive) {
					tab.addClass('active');
					activeTab = tab.getHTMLElement();
				} else {
					tab.removeClass('active');
				}

				// Dirty State
				if (isDirty) {
					tab.addClass('dirty');
				} else {
					tab.removeClass('dirty');
				}

				// Tab Label
				tab.div({
					'class': 'tab-label'
				}, (div) => {
					$(div).a().safeInnerHtml(editor.getName()).title(editor.getDescription(true));
				});

				// Tab Close
				tab.div({
					'class': 'tab-close'
				}, (div) => {
					const bar = new ActionBar(div, { context: { editor, group }, ariaLabel: nls.localize('araLabelTabActions', "Tab actions") });
					bar.push(this.closeEditorAction, { icon: true, label: false });

					this.tabActionBars.push(bar);
				});
			});
		});

		// Always reveal the active one
		const container = this.tabsContainer.getHTMLElement();
		const containerWidth = container.offsetWidth;
		const containerScrollPosX = container.scrollLeft;
		const activeTabPosX = activeTab.offsetLeft;
		const activeTabWidth = activeTab.offsetWidth;

		// Tab is overflowing to the right: Scroll minimally until the element is fully visible to the right
		if (containerScrollPosX + containerWidth < activeTabPosX + activeTabWidth) {
			container.scrollLeft += ((activeTabPosX + activeTabWidth) /* right corner of tab */ - (containerScrollPosX + containerWidth) /* right corner of view port */);
		}

		// Tab is overlflowng to the left: Scroll it into view to the left
		else if (containerScrollPosX > activeTabPosX) {
			container.scrollLeft = activeTab.offsetLeft;
		}
	}

	private hookTabListeners(tab: Builder, editor: IEditorInput, group: IEditorGroup): void {
		const position = this.stacks.positionOfGroup(group);

		// Open on Click
		tab.on(DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);

			if (e.button === 0 /* Left Button */ && !DOM.findParentWithClass(<any>e.target || e.srcElement, 'monaco-action-bar', 'tab')) {
				this.editorService.openEditor(editor, null, position).done(null, errors.onUnexpectedError);
			}
		});

		// Pin on double click
		tab.on(DOM.EventType.DBLCLICK, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);

			this.editorGroupService.pinEditor(position, editor);
		});

		// Close on mouse middle click
		tab.on(DOM.EventType.MOUSE_UP, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);

			if (e.button === 1 /* Middle Button */) {
				this.editorService.closeEditor(position, editor).done(null, errors.onUnexpectedError);
			}
		});

		// Context menu
		tab.on(DOM.EventType.CONTEXT_MENU, (e) => {
			DOM.EventHelper.stop(e);

			let anchor: HTMLElement | { x: number, y: number } = tab.getHTMLElement();
			if (e instanceof MouseEvent) {
				const event = new StandardMouseEvent(e);
				anchor = { x: event.posx, y: event.posy };
			}

			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => TPromise.as(this.getTabActions(editor, group)),
				getActionsContext: () => { return { editor, group }; },
				getKeyBinding: (action) => {
					var opts = this.keybindingService.lookupKeybindings(action.id);
					if (opts.length > 0) {
						return opts[0]; // only take the first one
					}

					return null;
				}
			});
		});
	}

	private getTabActions(editor: IEditorInput, group: IEditorGroup): IAction[] {

		// Enablement
		this.closeOtherEditorsAction.enabled = group.count > 1;
		this.pinEditorAction.enabled = !group.isPinned(editor);

		// Actions: For all editors
		const actions:IAction[] = [
			this.closeEditorAction,
			this.closeOtherEditorsAction,
			this.closeAllEditorsAction,
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