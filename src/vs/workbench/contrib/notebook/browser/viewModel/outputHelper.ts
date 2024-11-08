/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { ICellViewModel } from '../notebookBrowser.js';

export function getOutputText(notebook: NotebookTextModel, viewCell: ICellViewModel): string {
	let outputContent = '';
	const decoder = new TextDecoder();
	for (let i = 0; i < viewCell.outputsViewModels.length; i++) {
		const outputViewModel = viewCell.outputsViewModels[i];
		const outputTextModel = viewCell.model.outputs[i];
		const [mimeTypes, pick] = outputViewModel.resolveMimeTypes(notebook, undefined);
		const mimeType = mimeTypes[pick].mimeType;
		let buffer = outputTextModel.outputs.find(output => output.mime === mimeType);

		if (!buffer || mimeType.startsWith('image')) {
			buffer = outputTextModel.outputs.find(output => !output.mime.startsWith('image'));
		}

		let text = `${mimeType}`; // default in case we can't get the text value for some reason.
		if (buffer) {
			const charLimit = 100_000;
			text = decoder.decode(buffer.data.slice(0, charLimit).buffer);

			if (buffer.data.byteLength > charLimit) {
				text = text + '...(truncated)';
			}

			if (mimeType.endsWith('error')) {
				const metadata = viewCell.model.internalMetadata;
				if (metadata.error?.message) {
					text = metadata.error.message;
					text += '\n' + metadata.error.stack?.replace(/\\x1b\[[0-9;]*m/gi, '').replace(/\\u001b\[[0-9;]*m/gi, '').replaceAll('\\n', '\n');
				} else {
					text = text.replace(/\\u001b\[[0-9;]*m/gi, '').replaceAll('\\n', '\n');
				}
			}
		}

		const index = viewCell.outputsViewModels.length > 1
			? `Cell output ${i + 1} of ${viewCell.outputsViewModels.length}\n`
			: '';
		outputContent = outputContent.concat(`${index}${text}\n`);
	}
	return outputContent.trim();
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
