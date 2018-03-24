/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Action } from 'vs/base/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IEditorGroupService, GroupOrientation } from 'vs/workbench/services/group/common/groupService';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export class ToggleEditorLayoutAction extends Action {

	public static readonly ID = 'workbench.action.toggleEditorGroupLayout';
	public static readonly LABEL = nls.localize('toggleEditorGroupLayout', "Toggle Editor Group Vertical/Horizontal Layout");

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
		this.enabled = this.editorGroupService.getStacksModel().groups.length > 0;
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

CommandsRegistry.registerCommand('_workbench.editor.setGroupOrientation', function (accessor: ServicesAccessor, args: [GroupOrientation]) {
	const editorGroupService = accessor.get(IEditorGroupService);
	const [orientation] = args;

	editorGroupService.setGroupOrientation(orientation);

	return TPromise.as<void>(null);
});

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
const group = nls.localize('view', "View");
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleEditorLayoutAction, ToggleEditorLayoutAction.ID, ToggleEditorLayoutAction.LABEL, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_0, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_0 } }), 'View: Toggle Editor Group Vertical/Horizontal Layout', group);