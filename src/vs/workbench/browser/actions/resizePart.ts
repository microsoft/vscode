/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Registry } from 'vs/platform/platform';
import { Action } from 'vs/base/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';

const RESIZE_INCREMENT = 50;

export class ExpandViewAction extends Action {

	public static ID = 'workbench.action.expandView';
	public static LABEL = nls.localize('expandView', "Expand Current View");

	constructor(
		id: string,
		label: string,
		@IPartService private partService: IPartService,

	) {
		super(id, label);

		this.enabled = !!this.partService;
	}

	public run(): TPromise<any> {

		const isEditorFocus = this.partService.hasFocus(Parts.EDITOR_PART);
		const isSidebarFocus = this.partService.hasFocus(Parts.SIDEBAR_PART);
		const isPanelFocus = this.partService.hasFocus(Parts.PANEL_PART);

		if(isSidebarFocus) {
			return this.partService.resizePart(Parts.SIDEBAR_PART, RESIZE_INCREMENT);
		}
		else if (isPanelFocus) {
			return this.partService.resizePart(Parts.PANEL_PART, RESIZE_INCREMENT);
		}
		else if (isEditorFocus) {
			// console.log('editor f1ocus');
			return this.partService.resizePart(Parts.EDITOR_PART, RESIZE_INCREMENT);
		}
		return TPromise.as(false);
	}
}

export class ContractViewAction extends Action {

	public static ID = 'workbench.action.contractView';
	public static LABEL = nls.localize('contractView', "Contract Current View");

	constructor(
		id: string,
		label: string,
		@IPartService private partService: IPartService,

	) {
		super(id, label);

		this.enabled = !!this.partService;
	}

	public run(): TPromise<any> {

		const isEditorFocus = this.partService.hasFocus(Parts.EDITOR_PART);
		const isPanelFocus = this.partService.hasFocus(Parts.PANEL_PART);
		const isSidebarFocus = this.partService.hasFocus(Parts.SIDEBAR_PART);

		// we ask but layout may not deliver, if limits silently ignore

		if(isSidebarFocus) {
			return this.partService.resizePart(Parts.SIDEBAR_PART, -RESIZE_INCREMENT);
		}
		else if (isPanelFocus) {
			return this.partService.resizePart(Parts.PANEL_PART, -RESIZE_INCREMENT);
		}
		else if (isEditorFocus) {
			return this.partService.resizePart(Parts.EDITOR_PART, -RESIZE_INCREMENT);
		}
		return TPromise.as(false);
	}
}

// probably won't have default key bindings, set up for easy test...

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ExpandViewAction, ExpandViewAction.ID, ExpandViewAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_B }), 'View: Expand View', nls.localize('view', "View"));
registry.registerWorkbenchAction(new SyncActionDescriptor(ContractViewAction, ContractViewAction.ID, ContractViewAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_E }), 'View: Contract View', nls.localize('view', "View"));