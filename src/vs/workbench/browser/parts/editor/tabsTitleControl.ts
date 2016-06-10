/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/tabstitle';
import nls = require('vs/nls');
import {prepareActions} from 'vs/workbench/browser/actionBarRegistry';
import arrays = require('vs/base/common/arrays');
import errors = require('vs/base/common/errors');
import DOM = require('vs/base/browser/dom');
import {Builder, $} from 'vs/base/browser/builder';
import {IEditorGroup} from 'vs/workbench/common/editor';
import {ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {ActionBar} from 'vs/base/browser/ui/actionbar/actionbar';
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

		// Refresh Tabs
		this.refreshTabs(group);

		// Update Group Actions Toolbar
		const groupActions = this.getGroupActions(group);
		const primaryGroupActions = prepareActions(groupActions.primary);
		const secondaryGroupActions = prepareActions(groupActions.secondary);
		const primaryGroupActionIds = primaryGroupActions.map(a => a.id);
		const secondaryGroupActionIds = secondaryGroupActions.map(a => a.id);

		if (!arrays.equals(primaryGroupActionIds, this.currentPrimaryGroupActionIds) || !arrays.equals(secondaryGroupActionIds, this.currentSecondaryGroupActionIds)) {
			this.groupActionsToolbar.setActions(primaryGroupActions, secondaryGroupActions)();
			this.currentPrimaryGroupActionIds = primaryGroupActionIds;
			this.currentSecondaryGroupActionIds = secondaryGroupActionIds;
		}
	}

	private refreshTabs(group: IEditorGroup): void {

		// Empty container first
		this.tabsContainer.empty();
		while (this.tabActionBars.length) {
			this.tabActionBars.pop().dispose();
		}

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
	}

	private hookTabListeners(tab: Builder, editor: IEditorInput, group: IEditorGroup): void {
		const position = this.stacks.positionOfGroup(group);

		// Open on Click
		tab.on(DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);

			if (!DOM.findParentWithClass(<any>e.target || e.srcElement, 'monaco-action-bar', 'tab')) {
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
	}

	public dispose(): void {
		super.dispose();

		// Toolbar
		this.groupActionsToolbar.dispose();
	}
}