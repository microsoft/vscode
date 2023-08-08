/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { CELL_TITLE_OUTPUT_GROUP_ID, INotebookOutputActionContext, NotebookAction } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { NOTEBOOK_CELL_HAS_OUTPUTS } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import * as icons from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { ILogService } from 'vs/platform/log/common/log';

registerAction2(class CopyCellOutputAction extends NotebookAction {
	constructor() {
		super(
			{
				id: 'CopyCellOutput',
				title: localize('notebookActions.copyOutput', "Copy Output to Clipboard"),
				menu: {
					id: MenuId.NotebookOutputToolbar,
					when: NOTEBOOK_CELL_HAS_OUTPUTS,
					group: CELL_TITLE_OUTPUT_GROUP_ID
				},
				icon: icons.copyIcon,
			});
	}

	async runWithContext(accessor: ServicesAccessor, context: INotebookOutputActionContext): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		const logService = accessor.get(ILogService);

		const outputViewModel = context.outputViewModel;
		const outputTextModel = outputViewModel.model;
		const mimeType = outputViewModel.pickedMimeType?.mimeType;
		const buffer = outputTextModel.outputs.find(output => output.mime === mimeType);

		if (!buffer || !mimeType) {
			return;
		}

		const charLimit = 100_000;
		const decoder = new TextDecoder();
		let text = decoder.decode(buffer.data.slice(0, charLimit).buffer);

		if (buffer.data.byteLength > charLimit) {
			text = text + '...(truncated)';
		}

		if (mimeType.endsWith('error')) {
			text = text.replace(/\\u001b\[[0-9;]*m/gi, '').replaceAll('\\n', '\n');
		}

		try {
			await clipboardService.writeText(text);

		} catch (e) {
			logService.error(`Failed to copy content: ${e}`);
		}

	}
});
