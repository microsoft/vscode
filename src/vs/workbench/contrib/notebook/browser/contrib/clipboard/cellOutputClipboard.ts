/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ICellOutputViewModel } from '../../notebookBrowser.js';
import { getOutputText } from '../../viewModel/outputHelper.js';

export async function copyCellOutput(mimeType: string | undefined, outputViewModel: ICellOutputViewModel, clipboardService: IClipboardService, logService: ILogService) {
	const cellOutput = outputViewModel.model;
	const output = mimeType && TEXT_BASED_MIMETYPES.includes(mimeType) ?
		cellOutput.outputs.find(output => output.mime === mimeType) :
		cellOutput.outputs.find(output => TEXT_BASED_MIMETYPES.includes(output.mime));

	mimeType = output?.mime;

	if (!mimeType || !output) {
		return;
	}

	const text = getOutputText(mimeType, output);

	try {
		await clipboardService.writeText(text);

	} catch (e) {
		logService.error(`Failed to copy content: ${e}`);
	}
}

export const TEXT_BASED_MIMETYPES = [
	'text/latex',
	'text/html',
	'application/vnd.code.notebook.error',
	'application/vnd.code.notebook.stdout',
	'application/x.notebook.stdout',
	'application/x.notebook.stream',
	'application/vnd.code.notebook.stderr',
	'application/x.notebook.stderr',
	'text/plain',
	'text/markdown',
	'application/json'
];
