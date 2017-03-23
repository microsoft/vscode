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

const RESIZE_INCREMENT = 6.5;

export abstract class BaseResizeViewAction extends Action {

	constructor(
		id: string,
		label: string,
		@IPartService protected partService: IPartService
	) {
		super(id, label);
	}

	protected resizePart(sizeChange: number): void {

		const isEditorFocus = this.partService.hasFocus(Parts.EDITOR_PART);
		const isSidebarFocus = this.partService.hasFocus(Parts.SIDEBAR_PART);
		const isPanelFocus = this.partService.hasFocus(Parts.PANEL_PART);

		if (isSidebarFocus) {
			this.partService.resizePart(Parts.SIDEBAR_PART, sizeChange);
		}
		else if (isPanelFocus) {
			this.partService.resizePart(Parts.PANEL_PART, sizeChange);
		}
		else if (isEditorFocus) {
			this.partService.resizePart(Parts.EDITOR_PART, sizeChange);
		}
		return;
	}

}


export class IncreaseViewSizeAction extends BaseResizeViewAction {

	public static ID = 'workbench.action.increaseViewSize';
	public static LABEL = nls.localize('increaseViewSize', "Increase Current View Size");

	constructor(
		id: string,
		label: string,
		@IPartService partService: IPartService

	) {
		super(id, label, partService);


	}

	public run(): TPromise<boolean> {
		this.resizePart(RESIZE_INCREMENT);
		return TPromise.as(true);
	}
}

export class DecreaseViewSizeAction extends BaseResizeViewAction {

	public static ID = 'workbench.action.decreaseViewSize';
	public static LABEL = nls.localize('decreaseViewSize', "Decrease Current View Size");

	constructor(
		id: string,
		label: string,
		@IPartService partService: IPartService

	) {
		super(id, label, partService);


	}

	public run(): TPromise<boolean> {
		this.resizePart(-RESIZE_INCREMENT);
		return TPromise.as(true);
	}
}

// probably won't have default key bindings, set up for easy test...

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(IncreaseViewSizeAction, IncreaseViewSizeAction.ID, IncreaseViewSizeAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_B }), 'View: Increase View Size', nls.localize('view', "View"));
registry.registerWorkbenchAction(new SyncActionDescriptor(DecreaseViewSizeAction, DecreaseViewSizeAction.ID, DecreaseViewSizeAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_E }), 'View: Decrease View Size', nls.localize('view', "View"));