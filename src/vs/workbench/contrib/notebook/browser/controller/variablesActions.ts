/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { KERNEL_HAS_VARIABLE_PROVIDER } from '../../common/notebookContextKeys.js';
import { NOTEBOOK_VARIABLE_VIEW_ENABLED } from '../contrib/notebookVariables/notebookVariableContextKeys.js';
import * as icons from '../notebookIcons.js';

import { INotebookActionContext, NotebookAction } from './coreActions.js';

const OPEN_VARIABLES_VIEW_COMMAND_ID = 'notebook.openVariablesView';

registerAction2(class OpenVariablesViewAction extends NotebookAction {

	constructor() {
		super({
			id: OPEN_VARIABLES_VIEW_COMMAND_ID,
			title: localize2('notebookActions.openVariablesView', "Variables"),
			icon: icons.variablesViewIcon,
			menu: [
				{
					id: MenuId.InteractiveToolbar,
					group: 'navigation',
					when: ContextKeyExpr.and(
						KERNEL_HAS_VARIABLE_PROVIDER,
						// jupyter extension currently contributes their own goto variables button
						ContextKeyExpr.notEquals('jupyter.kernel.isjupyter', true),
						NOTEBOOK_VARIABLE_VIEW_ENABLED
					)
				},
				{
					id: MenuId.EditorTitle,
					order: -1,
					group: 'navigation',
					when: ContextKeyExpr.and(
						KERNEL_HAS_VARIABLE_PROVIDER,
						// jupyter extension currently contributes their own goto variables button
						ContextKeyExpr.notEquals('jupyter.kernel.isjupyter', true),
						ContextKeyExpr.notEquals('config.notebook.globalToolbar', true),
						NOTEBOOK_VARIABLE_VIEW_ENABLED
					)
				},
				{
					id: MenuId.NotebookToolbar,
					order: -1,
					group: 'navigation',
					when: ContextKeyExpr.and(
						KERNEL_HAS_VARIABLE_PROVIDER,
						// jupyter extension currently contributes their own goto variables button
						ContextKeyExpr.notEquals('jupyter.kernel.isjupyter', true),
						ContextKeyExpr.equals('config.notebook.globalToolbar', true),
						NOTEBOOK_VARIABLE_VIEW_ENABLED
					)
				}
			]
		});
	}

	override async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext) {
		const variableViewId = 'workbench.notebook.variables';
		accessor.get(IViewsService).openView(variableViewId, true);
	}
});
