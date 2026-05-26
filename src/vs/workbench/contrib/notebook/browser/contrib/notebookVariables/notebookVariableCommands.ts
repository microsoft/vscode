/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI, UriComponents } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { contextMenuArg } from './notebookVariablesView.js';
import { INotebookKernelService, VariablesResult } from '../../../common/notebookKernelService.js';
import { INotebookService } from '../../../common/notebookService.js';

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
			const variableIterable = selectedKernel.provideVariables(notebookTextModel.uri, undefined, 'named', 0, CancellationToken.None);
			const collected: VariablesResult[] = [];
			for await (const variable of variableIterable) {
				collected.push(variable);
			}
			return collected;
		}

		return [];
	}
});
