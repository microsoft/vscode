/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { URI, UriComponents } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { contextMenuArg } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariablesView';
import { INotebookKernelService, VariablesResult } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

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


registerAction2(class extends Action2 {
	constructor() {
		super({
			id: '_executeNotebookVariableProvider',
			title: localize('executeNotebookVariableProvider', "Execute Notebook Variable Provider"),
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, resource: UriComponents | undefined): Promise<VariablesResult[]> {
		if (!resource) {
			return [];
		}

		const uri = URI.revive(resource);
		const notebookKernelService = accessor.get(INotebookKernelService);
		const notebookService = accessor.get(INotebookService);
		const notebookTextModel = notebookService.getNotebookTextModel(uri);

		if (!notebookTextModel) {
			return [];
		}

		const selectedKernel = notebookKernelService.getMatchingKernel(notebookTextModel).selected;
		if (selectedKernel && selectedKernel.hasVariableProvider) {
			const variables = selectedKernel.provideVariables(notebookTextModel.uri, undefined, 'named', 0, CancellationToken.None);
			return await variables
				.map(variable => { return variable; })
				.toPromise();
		}

		return [];
	}
});
