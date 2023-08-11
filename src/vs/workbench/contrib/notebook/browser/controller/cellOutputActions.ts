/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { INotebookOutputActionContext, NotebookAction } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { NOTEBOOK_CELL_HAS_OUTPUTS } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { ILogService } from 'vs/platform/log/common/log';
import { copyCellOutput } from 'vs/workbench/contrib/notebook/browser/contrib/clipboard/cellOutputClipboard';

export const COPY_OUTPUT_COMMAND_ID = 'notebook.cellOutput.copyToClipboard';

registerAction2(class CopyCellOutputAction extends NotebookAction {
	constructor() {
		super(
			{
				id: COPY_OUTPUT_COMMAND_ID,
				title: localize('notebookActions.copyOutput', "Copy Output to Clipboard"),
				menu: {
					id: MenuId.NotebookOutputToolbar,
					when: NOTEBOOK_CELL_HAS_OUTPUTS
				},
				icon: icons.copyIcon,
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookOutputActionContext): Promise<void> {
		const outputViewModel = context.outputViewModel;

		const mimeType = outputViewModel.pickedMimeType?.mimeType;
		const clipboardService = accessor.get(IClipboardService);
		const logService = accessor.get(ILogService);

		copyCellOutput(mimeType, outputViewModel, clipboardService, logService);
	}
});
