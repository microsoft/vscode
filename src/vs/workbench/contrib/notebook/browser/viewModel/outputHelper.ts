/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { IOutputItemDto } from '../../common/notebookCommon.js';
import { ICellViewModel } from '../notebookBrowser.js';

interface Error {
	name: string;
	message: string;
	stack?: string;
}

export function getAllOutputsText(notebook: NotebookTextModel, viewCell: ICellViewModel): string {
	let outputContent = '';
	for (let i = 0; i < viewCell.outputsViewModels.length; i++) {
		const outputViewModel = viewCell.outputsViewModels[i];
		const outputTextModel = viewCell.model.outputs[i];
		const [mimeTypes, pick] = outputViewModel.resolveMimeTypes(notebook, undefined);
		const mimeType = mimeTypes[pick].mimeType;
		let buffer = outputTextModel.outputs.find(output => output.mime === mimeType);

		if (!buffer || mimeType.startsWith('image')) {
			buffer = outputTextModel.outputs.find(output => !output.mime.startsWith('image'));
		}

		if (!buffer) {
			continue;
		}

		const text = getOutputText(mimeType, buffer);

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

const decoder = new TextDecoder();

export function getOutputText(mimeType: string, buffer: IOutputItemDto) {
	let text = `${mimeType}`; // default in case we can't get the text value for some reason.

	const charLimit = 100000;
	text = decoder.decode(buffer.data.slice(0, charLimit).buffer);

	if (buffer.data.byteLength > charLimit) {
		text = text + '...(truncated)';
	} else if (mimeType.endsWith('error')) {
		text = text.replace(/\\u001b\[[0-9;]*m/gi, '');
		try {
			const error = JSON.parse(text) as Error;
			if (error.stack) {
				text = error.stack;
			} else {
				text = `${error.name}: ${error.message}`;
			}
		} catch {
			// just use raw text
		}
	}

	return text;
}

