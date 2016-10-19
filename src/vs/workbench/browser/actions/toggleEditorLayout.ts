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
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';

export class ToggleEditorLayoutAction extends Action {

	public static ID = 'workbench.action.toggleEditorLayout';
	public static LABEL = nls.localize('toggleEditorLayout', "Toggle Vertical/Horizontal Layout");

	private static editorLayoutConfigurationKey = 'workbench.editor.sideBySideLayout';

	private toDispose: IDisposable[];

	constructor(
		id: string,
		label: string,
		@IMessageService private messageService: IMessageService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService
	) {
		super(id, label);

		this.toDispose = [];

		this.class = 'toggle-editor-layout';
		this.updateEnablement();

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.editorGroupService.onEditorsChanged(() => this.updateEnablement()));
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(() => this.updateLabel()));
	}

	private updateLabel(): void {
		const editorLayoutVertical = this.configurationService.lookup('workbench.editor.sideBySideLayout').value !== 'horizontal';
		this.label = editorLayoutVertical ? nls.localize('horizontalLayout', "Horizontal Editor Layout") : nls.localize('verticalLayout', "Vertical Editor Layout");
	}

	private updateEnablement(): void {
		this.enabled = this.editorGroupService.getStacksModel().groups.length > 1;
	}

	public run(): TPromise<any> {
		const editorLayoutVertical = this.configurationService.lookup('workbench.editor.sideBySideLayout').value !== 'horizontal';
		const newEditorLayout = editorLayoutVertical ? 'horizontal' : 'vertical';

		this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: ToggleEditorLayoutAction.editorLayoutConfigurationKey, value: newEditorLayout }).then(null, error => {
			this.messageService.show(Severity.Error, error);
		});

		return TPromise.as(null);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);

		super.dispose();
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleEditorLayoutAction, ToggleEditorLayoutAction.ID, ToggleEditorLayoutAction.LABEL, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_1, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_1 } }), 'View: Toggle Vertical/Horizontal Layout', nls.localize('view', "View"));