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
import { isTextStreamMime } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CLIPBOARD_COMPATIBLE_MIMETYPES } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';

export const COPY_OUTPUT_COMMAND_ID = 'notebook.cellOutput.copyToClipboard';

registerAction2(class CopyCellOutputAction extends NotebookAction {
	constructor() {
		super(
			{
				id: COPY_OUTPUT_COMMAND_ID,
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
		const outputViewModel = context.outputViewModel;
		const outputTextModel = outputViewModel.model;

		const mimeType = outputViewModel.pickedMimeType?.mimeType;
		const output = mimeType && CLIPBOARD_COMPATIBLE_MIMETYPES.includes(mimeType) ?
			outputTextModel.outputs.find(output => output.mime === mimeType) :
			outputTextModel.outputs.find(output => CLIPBOARD_COMPATIBLE_MIMETYPES.includes(output.mime));

		if (!mimeType || !output) {
			return;
		}

		const decoder = new TextDecoder();
		let text = decoder.decode(output.data.buffer);
		let totalLength = output.data.byteLength;

		// append adjacent text streams since they are concatenated in the renderer
		if (isTextStreamMime(mimeType)) {
			const cellViewModel = outputViewModel.cellViewModel as ICellViewModel;
			let index = cellViewModel.outputsViewModels.indexOf(outputViewModel) + 1;
			while (index < cellViewModel.outputsViewModels.length) {
				const nextOutputViewModel = cellViewModel.outputsViewModels[index];
				const nextMimeType = nextOutputViewModel?.pickedMimeType?.mimeType;
				const nextOutputTextModel = cellViewModel.model.outputs[index];

				if (!nextOutputViewModel || !nextMimeType || !isTextStreamMime(nextMimeType)) {
					break;
				}

				const nextOutput = nextOutputTextModel.outputs.find(output => output.mime === nextMimeType);
				if (nextOutput) {
					text = text + decoder.decode(nextOutput.data.buffer);
					totalLength = totalLength + nextOutput.data.byteLength;
				}
				index = index + 1;
			}
		}

		if (mimeType.endsWith('error')) {
			text = text.replace(/\\u001b\[[0-9;]*m/gi, '').replaceAll('\\n', '\n');
		}

		const clipboardService = accessor.get(IClipboardService);
		const logService = accessor.get(ILogService);
		try {
			await clipboardService.writeText(text);

		} catch (e) {
			logService.error(`Failed to copy content: ${e}`);
		}
	}
});
