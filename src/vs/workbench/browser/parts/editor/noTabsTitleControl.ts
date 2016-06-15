/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notabstitle';
import {prepareActions} from 'vs/workbench/browser/actionBarRegistry';
import errors = require('vs/base/common/errors');
import arrays = require('vs/base/common/arrays');
import {Builder, $} from 'vs/base/browser/builder';
import {IEditorGroup, EditorInput} from 'vs/workbench/common/editor';
import DOM = require('vs/base/browser/dom');
import {ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {TitleControl} from 'vs/workbench/browser/parts/editor/titleControl';

export class NoTabsTitleControl extends TitleControl {
	private titleContainer: Builder;
	private titleLabel: Builder;
	private titleDecoration: Builder;
	private titleDescription: Builder;

	private editorActionsToolbar: ToolBar;

	private currentPrimaryEditorActionIds: string[];
	private currentSecondaryEditorActionIds: string[];

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

		this.currentPrimaryEditorActionIds = [];
		this.currentSecondaryEditorActionIds = [];
	}

	public setContext(group: IEditorGroup): void {
		super.setContext(group);

		this.editorActionsToolbar.context = { group };
	}

	public create(parent: Builder): void {
		this.titleContainer = $(parent);

		// Pin on double click
		parent.on(DOM.EventType.DBLCLICK, (e: MouseEvent) => {
			DOM.EventHelper.stop(e);

			this.onTitleDoubleClick();
		});

		// Detect mouse click
		parent.on(DOM.EventType.MOUSE_UP, (e: MouseEvent) => {
			DOM.EventHelper.stop(e, false);

			this.onTitleClick(e);
		});

		// Left Title Decoration
		parent.div({
			'class': 'title-decoration'
		}, (div) => {
			this.titleDecoration = div;
		});

		// Left Title Label & Description
		parent.div({
			'class': 'title-label'
		}, (div) => {

			// Label
			this.titleLabel = $(div).a();

			// Description
			this.titleDescription = $(div).span();
		});

		// Right Actions Container
		parent.div({
			'class': 'title-actions'
		}, (div) => {

			// Editor actions
			this.editorActionsToolbar = this.doCreateToolbar(div);
		});

		// Context Menu
		this.titleContainer.on(DOM.EventType.CONTEXT_MENU, (e: Event) => this.onContextMenu({ group: this.context, editor: this.context.activeEditor }, e, this.titleContainer.getHTMLElement()));
	}

	private onTitleDoubleClick(): void {
		if (!this.context) {
			return;
		}

		const group = this.context;
		const position = this.stacks.positionOfGroup(group);

		this.editorGroupService.pinEditor(position, group.activeEditor);
	}

	private onTitleClick(e: MouseEvent): void {
		if (!this.context) {
			return;
		}

		const group = this.context;
		const position = this.stacks.positionOfGroup(group);

		// Close editor on middle mouse click
		if (e.button === 1 /* Middle Button */) {
			this.editorService.closeEditor(position, group.activeEditor).done(null, errors.onUnexpectedError);
		}

		// Focus editor group unless click on toolbar
		else if (this.stacks.groups.length === 1 && !DOM.isAncestor(<any>e.target || e.srcElement, this.editorActionsToolbar.getContainer().getHTMLElement())) {
			this.editorGroupService.focusGroup(position);
		}
	}

	protected doRefresh(): void {
		if (!this.context) {
			return;
		}

		const group = this.context;
		const editor = group.activeEditor;
		if (!editor) {
			this.editorActionsToolbar.setActions([], [])();

			this.currentPrimaryEditorActionIds = [];
			this.currentSecondaryEditorActionIds = [];

			return; // return early if we are being closed
		}

		const isPinned = group.isPinned(group.activeEditor);
		const isActive = this.stacks.isActive(group);

		// Pinned state
		if (isPinned) {
			this.titleContainer.addClass('pinned');
		} else {
			this.titleContainer.removeClass('pinned');
		}

		// Activity state
		if (isActive) {
			this.titleContainer.addClass('active');
		} else {
			this.titleContainer.removeClass('active');
		}

		// Editor Title
		let name = editor.getName() || '';
		let description = isActive ? (editor.getDescription() || '') : '';
		let verboseDescription = editor.getDescription(true) || '';
		if (description === verboseDescription) {
			verboseDescription = ''; // dont repeat what is already shown
		}

		this.titleLabel.safeInnerHtml(name);
		this.titleLabel.title(verboseDescription);

		this.titleDescription.safeInnerHtml(description);
		this.titleDescription.title(verboseDescription);

		// Editor Decoration
		if (editor.isDirty()) {
			this.titleDecoration.addClass('dirty');
		} else {
			this.titleDecoration.removeClass('dirty');
		}

		// Update Editor Actions Toolbar
		const editorActions = this.getEditorActions(group);
		const primaryEditorActions = prepareActions(editorActions.primary);
		if (isActive && editor instanceof EditorInput && editor.supportsSplitEditor()) {
			primaryEditorActions.push(this.splitEditorAction);
		}
		const secondaryEditorActions = prepareActions(editorActions.secondary);

		const primaryEditorActionIds = primaryEditorActions.map(a => a.id);
		primaryEditorActionIds.push(this.closeEditorAction.id);
		const secondaryEditorActionIds = secondaryEditorActions.map(a => a.id);

		if (!arrays.equals(primaryEditorActionIds, this.currentPrimaryEditorActionIds) || !arrays.equals(secondaryEditorActionIds, this.currentSecondaryEditorActionIds)) {
			this.editorActionsToolbar.setActions(primaryEditorActions, secondaryEditorActions)();
			this.editorActionsToolbar.addPrimaryAction(this.closeEditorAction)();

			this.currentPrimaryEditorActionIds = primaryEditorActionIds;
			this.currentSecondaryEditorActionIds = secondaryEditorActionIds;
		}
	}

	public dispose(): void {
		super.dispose();

		// Toolbars
		this.editorActionsToolbar.dispose();
	}
}