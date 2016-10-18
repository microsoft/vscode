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

export class ToggleEditorLayoutAction extends Action {

	public static ID = 'workbench.action.toggleEditorLayout';
	public static LABEL = nls.localize('toggleEditorLayout', "Toggle Editor Layout");

	private static editorLayoutConfigurationKey = 'workbench.editor.sideBySideLayout';

	constructor(
		id: string,
		label: string,
		@IMessageService private messageService: IMessageService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService
	) {
		super(id, label);

		this.class = 'toggle-editor-layout';
	}

	public run(): TPromise<any> {
		const editorLayoutVertical = this.configurationService.lookup('workbench.editor.sideBySideLayout').value !== 'horizontal';
		const newEditorLayout = editorLayoutVertical ? 'horizontal' : 'vertical';

		this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: ToggleEditorLayoutAction.editorLayoutConfigurationKey, value: newEditorLayout }).then(null, error => {
			this.messageService.show(Severity.Error, error);
		});

		return TPromise.as(null);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleEditorLayoutAction, ToggleEditorLayoutAction.ID, ToggleEditorLayoutAction.LABEL), 'View: Toggle Editor Layout', nls.localize('view', "View"));