/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/tabstitle';
import {prepareActions} from 'vs/workbench/browser/actionBarRegistry';
import arrays = require('vs/base/common/arrays');
import {Builder, $} from 'vs/base/browser/builder';
import {IEditorGroup} from 'vs/workbench/common/editor';
import {ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {TitleControl} from 'vs/workbench/browser/parts/editor/titleControl';

export class TabsTitleControl extends TitleControl {
	private titleContainer: Builder;

	private groupActionsToolbar: ToolBar;

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

			
		});

		// Group Actions Container
		parent.div({
			'class': 'group-actions'
		}, (div) => {

			// Group actions toolbar
			this.groupActionsToolbar = this.doCreateToolbar(div);
		});
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

		const isActive = this.stacks.isActive(group);

		// Activity state
		if (isActive) {
			this.titleContainer.removeClass('inactive');
		} else {
			this.titleContainer.addClass('inactive');
		}

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

	public dispose(): void {
		super.dispose();

		// Toolbars
		this.groupActionsToolbar.dispose();
	}
}