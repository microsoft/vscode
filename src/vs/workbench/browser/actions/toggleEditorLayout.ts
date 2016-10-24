/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Registry } from 'vs/platform/platform';
import { Action } from 'vs/base/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IEditorGroupService, GroupOrientation } from 'vs/workbench/services/group/common/groupService';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';

export class ToggleEditorLayoutAction extends Action {

	public static ID = 'workbench.action.toggleEditorGroupLayout';
	public static LABEL = nls.localize('toggleEditorGroupLayout', "Toggle Editor Group Layout");

	private toDispose: IDisposable[];

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(id, label);

		this.toDispose = [];

		this.class = 'toggle-editor-layout';
		this.updateEnablement();
		this.updateLabel();

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.editorGroupService.onEditorsChanged(() => this.updateEnablement()));
		this.toDispose.push(this.editorGroupService.onGroupOrientationChanged(() => this.updateLabel()));
	}

	private updateLabel(): void {
		const editorGroupLayoutVertical = (this.editorGroupService.getGroupOrientation() !== 'horizontal');
		this.label = editorGroupLayoutVertical ? nls.localize('horizontalLayout', "Horizontal Editor Group Layout") : nls.localize('verticalLayout', "Vertical Editor Group Layout");
	}

	private updateEnablement(): void {
		this.enabled = this.editorGroupService.getStacksModel().groups.length > 1;
	}

	public run(): TPromise<any> {
		const groupOrientiation = this.editorGroupService.getGroupOrientation();
		const newGroupOrientation: GroupOrientation = (groupOrientiation === 'vertical') ? 'horizontal' : 'vertical';

		this.editorGroupService.setGroupOrientation(newGroupOrientation);

		return TPromise.as(null);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);

		super.dispose();
	}
}

export class SwitchToVerticalEditorGroupLayoutAction extends Action {

	public static ID = 'workbench.action.verticalEditorGroupLayout';
	public static LABEL = nls.localize('verticalEditorGroupLayout', "Switch to Vertical Editor Group Layout");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.setGroupOrientation('vertical');

		return TPromise.as(null);
	}
}

export class SwitchToHorizontalEditorGroupLayoutAction extends Action {

	public static ID = 'workbench.action.horizontalEditorGroupLayout';
	public static LABEL = nls.localize('horizontalEditorGroupLayout', "Switch to Horizontal Editor Group Layout");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		this.editorGroupService.setGroupOrientation('horizontal');

		return TPromise.as(null);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
const group = nls.localize('view', "View");
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleEditorLayoutAction, ToggleEditorLayoutAction.ID, ToggleEditorLayoutAction.LABEL, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_1, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_1 } }), 'View: Toggle Vertical/Horizontal Layout', group);
registry.registerWorkbenchAction(new SyncActionDescriptor(SwitchToVerticalEditorGroupLayoutAction, SwitchToVerticalEditorGroupLayoutAction.ID, SwitchToVerticalEditorGroupLayoutAction.LABEL, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_2, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_2 } }), 'View: Switch to Vertical Editor Group Layout', group);
registry.registerWorkbenchAction(new SyncActionDescriptor(SwitchToHorizontalEditorGroupLayoutAction, SwitchToHorizontalEditorGroupLayoutAction.ID, SwitchToHorizontalEditorGroupLayoutAction.LABEL, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_3, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_3 } }), 'View: Switch to Horizontal Editor Group Layout', group);