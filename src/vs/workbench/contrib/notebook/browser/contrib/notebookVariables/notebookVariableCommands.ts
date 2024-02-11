/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { contextMenuArg } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariablesView';

export const COPY_NOTEBOOK_VARIABLE_VALUE_ID = 'workbench.debug.viewlet.action.copyWorkspaceVariableValue';
export const COPY_NOTEBOOK_VARIABLE_VALUE_LABEL = localize('copyWorkspaceVariableValue', "Copy Value");
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: COPY_NOTEBOOK_VARIABLE_VALUE_ID,
			title: COPY_NOTEBOOK_VARIABLE_VALUE_LABEL,
			f1: false,
		});
	}

	run(accessor: ServicesAccessor, context: contextMenuArg): void {
		const clipboardService = accessor.get(IClipboardService);

		if (context.value) {
			clipboardService.writeText(context.value);
		}
	}
});
