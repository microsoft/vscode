/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { IOutputItemDto, isTextStreamMime } from '../../common/notebookCommon.js';
import { ICellOutputViewModel, ICellViewModel } from '../notebookBrowser.js';

interface Error {
	name: string;
	message: string;
	stack?: string;
}

export function getAllOutputsText(notebook: NotebookTextModel, viewCell: ICellViewModel, shortErrors: boolean = false): string {
	const outputText: string[] = [];
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

		let text = '';
		if (isTextStreamMime(mimeType)) {
			const { text: stream, count } = getOutputStreamText(outputViewModel);
			text = stream;
			if (count > 1) {
				i += count - 1;
			}
		} else {
			text = getOutputText(mimeType, buffer, shortErrors);
		}

		outputText.push(text);
	}

	let outputContent: string;
	if (outputText.length > 1) {
		outputContent = outputText.map((output, i) => {
			return `Cell output ${i + 1} of ${outputText.length}\n${output}`;
		}).join('\n');
	} else {
		outputContent = outputText[0] ?? '';
	}

	return outputContent;
}

export function getOutputStreamText(output: ICellOutputViewModel): { text: string; count: number } {
	let text = '';
	const cellViewModel = output.cellViewModel as ICellViewModel;
	let index = cellViewModel.outputsViewModels.indexOf(output);
	let count = 0;
	while (index < cellViewModel.model.outputs.length) {
		const nextCellOutput = cellViewModel.model.outputs[index];
		const nextOutput = nextCellOutput.outputs.find(output => isTextStreamMime(output.mime));
		if (!nextOutput) {
			break;
		}

		text = text + decoder.decode(nextOutput.data.buffer);
		index = index + 1;
		count++;
	}

	return { text: text.trim(), count };
}

const decoder = new TextDecoder();

export function getOutputText(mimeType: string, buffer: IOutputItemDto, shortError: boolean = false): string {
	let text = `${mimeType}`; // default in case we can't get the text value for some reason.

	const charLimit = 100000;
	text = decoder.decode(buffer.data.slice(0, charLimit).buffer);

	if (buffer.data.byteLength > charLimit) {
		text = text + '...(truncated)';
	} else if (mimeType === 'application/vnd.code.notebook.error') {
		text = text.replace(/\\u001b\[[0-9;]*m/gi, '');
		try {
			const error = JSON.parse(text) as Error;
			if (!error.stack || shortError) {
				text = `${error.name}: ${error.message}`;
			} else {
				text = error.stack;
			}
		} catch {
			// just use raw text
		}
	}

	return text.trim();
}

export async function copyCellOutput(mimeType: string | undefined, outputViewModel: ICellOutputViewModel, clipboardService: IClipboardService, logService: ILogService) {
	const cellOutput = outputViewModel.model;
	
	// If a specific mime type is requested and it's text-based, use it
	if (mimeType && TEXT_BASED_MIMETYPES.includes(mimeType)) {
		const output = cellOutput.outputs.find(output => output.mime === mimeType);
		if (output) {
			const text = isTextStreamMime(mimeType) ? getOutputStreamText(outputViewModel).text : getOutputText(mimeType, output);
			try {
				await clipboardService.writeText(text);
			} catch (e) {
				logService.error(`Failed to copy content: ${e}`);
			}
			return;
		}
	}

	// Collect all available formats
	const formats = new Map<string, Uint8Array | string>();
	let hasTextFormat = false;
	
	for (const output of cellOutput.outputs) {
		if (TEXT_BASED_MIMETYPES.includes(output.mime)) {
			const text = isTextStreamMime(output.mime) ? getOutputStreamText(outputViewModel).text : getOutputText(output.mime, output);
			formats.set(output.mime, text);
			hasTextFormat = true;
		} else if (output.mime.startsWith('image/')) {
			// For images, include the binary data
			formats.set(output.mime, new Uint8Array(output.data.buffer));
		}
	}

	// If no formats were collected, fall back to the old behavior
	if (formats.size === 0) {
		const output = cellOutput.outputs.find(output => TEXT_BASED_MIMETYPES.includes(output.mime));
		if (output) {
			const text = isTextStreamMime(output.mime) ? getOutputStreamText(outputViewModel).text : getOutputText(output.mime, output);
			try {
				await clipboardService.writeText(text);
			} catch (e) {
				logService.error(`Failed to copy content: ${e}`);
			}
		}
		return;
	}

	// Try to write multiple formats if supported
	if (clipboardService.writeMultipleFormats && formats.size > 1) {
		try {
			await clipboardService.writeMultipleFormats(formats);
		} catch (e) {
			logService.error(`Failed to copy multiple formats: ${e}`);
			// Fallback to single text format
			if (hasTextFormat) {
				const textEntry = Array.from(formats.entries()).find(([mime]) => TEXT_BASED_MIMETYPES.includes(mime));
				if (textEntry && typeof textEntry[1] === 'string') {
					await clipboardService.writeText(textEntry[1]);
				}
			}
		}
	} else {
		// Fallback to single format (text preferred)
		if (hasTextFormat) {
			const textEntry = Array.from(formats.entries()).find(([mime]) => TEXT_BASED_MIMETYPES.includes(mime));
			if (textEntry && typeof textEntry[1] === 'string') {
				try {
					await clipboardService.writeText(textEntry[1]);
				} catch (e) {
					logService.error(`Failed to copy content: ${e}`);
				}
			}
		}
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
