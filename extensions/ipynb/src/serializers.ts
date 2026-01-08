/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as nbformat from '@jupyterlab/nbformat';
import type { NotebookCell, NotebookCellData, NotebookCellOutput, NotebookData, NotebookDocument } from 'vscode';
import { CellOutputMetadata, hasKey, type CellMetadata } from './common';
import { textMimeTypes, NotebookCellKindMarkup, CellOutputMimeTypes, defaultNotebookFormat } from './constants';

const textDecoder = new TextDecoder();

export function createJupyterCellFromNotebookCell(
	vscCell: NotebookCellData,
	preferredLanguage: string | undefined,
): nbformat.IRawCell | nbformat.IMarkdownCell | nbformat.ICodeCell {
	let cell: nbformat.IRawCell | nbformat.IMarkdownCell | nbformat.ICodeCell;
	if (vscCell.kind === NotebookCellKindMarkup) {
		cell = createMarkdownCellFromNotebookCell(vscCell);
	} else if (vscCell.languageId === 'raw') {
		cell = createRawCellFromNotebookCell(vscCell);
	} else {
		cell = createCodeCellFromNotebookCell(vscCell, preferredLanguage);
	}
	return cell;
}


/**
 * Sort the JSON to minimize unnecessary SCM changes.
 * Jupyter notbeooks/labs sorts the JSON keys in alphabetical order.
 * https://github.com/microsoft/vscode-python/issues/13155
 */
export function sortObjectPropertiesRecursively(obj: any): any {
	if (Array.isArray(obj)) {
		return obj.map(sortObjectPropertiesRecursively);
	}
	if (obj !== undefined && obj !== null && typeof obj === 'object' && Object.keys(obj).length > 0) {
		return (
			Object.keys(obj)
				.sort()
				.reduce<Record<string, unknown>>((sortedObj, prop) => {
					sortedObj[prop] = sortObjectPropertiesRecursively(obj[prop]);
					return sortedObj;
				}, {})
		);
	}
	return obj;
}

export function getCellMetadata(options: { cell: NotebookCell | NotebookCellData } | { metadata?: { [key: string]: any } }): CellMetadata {
	if (hasKey(options, { cell: true })) {
		const cell = options.cell;
		const metadata = {
			execution_count: null,
			// it contains the cell id, and the cell metadata, along with other nb cell metadata
			...(cell.metadata ?? {})
		} satisfies CellMetadata;
		if (cell.kind === NotebookCellKindMarkup) {
			delete (metadata as Record<string, unknown>).execution_count;
		}
		return metadata;
	} else {
		const cell = options;
		const metadata = {
			// it contains the cell id, and the cell metadata, along with other nb cell metadata
			...(cell.metadata ?? {})
		};

		return metadata as CellMetadata;
	}
}

export function getVSCodeCellLanguageId(metadata: CellMetadata): string | undefined {
	return metadata.metadata?.vscode?.languageId;
}
export function setVSCodeCellLanguageId(metadata: CellMetadata, languageId: string) {
	metadata.metadata = metadata.metadata || {};
	metadata.metadata.vscode = { languageId };
}
export function removeVSCodeCellLanguageId(metadata: CellMetadata) {
	if (metadata.metadata?.vscode) {
		delete metadata.metadata.vscode;
	}
}

function createCodeCellFromNotebookCell(cell: NotebookCellData, preferredLanguage: string | undefined): nbformat.ICodeCell {
	const cellMetadata: CellMetadata = JSON.parse(JSON.stringify(getCellMetadata({ cell })));
	cellMetadata.metadata = cellMetadata.metadata || {}; // This cannot be empty.
	if (cell.languageId !== preferredLanguage) {
		setVSCodeCellLanguageId(cellMetadata, cell.languageId);
	} else {
		// cell current language is the same as the preferred cell language in the document, flush the vscode custom language id metadata
		removeVSCodeCellLanguageId(cellMetadata);
	}

	const codeCell: nbformat.ICodeCell = {
		cell_type: 'code',
		// Metadata should always contain the execution_count.
		// When ever execution summary data changes we will update the metadata to contain the execution count.
		// Failing to do so means we have a problem.
		// Also do not read the value of executionSummary here, as its possible user reverted changes to metadata
		// & in that case execution summary could contain the data, but metadata will not.
		// In such cases we do not want to re-set the metadata with the value from execution summary (remember, user reverted that).
		execution_count: cellMetadata.execution_count ?? null,
		source: splitCellSourceIntoMultilineString(cell.value),
		outputs: (cell.outputs || []).map(translateCellDisplayOutput),
		metadata: cellMetadata.metadata
	};
	if (cellMetadata?.id) {
		codeCell.id = cellMetadata.id;
	}
	return codeCell;
}

function createRawCellFromNotebookCell(cell: NotebookCellData): nbformat.IRawCell {
	const cellMetadata = getCellMetadata({ cell });
	const rawCell: any = {
		cell_type: 'raw',
		source: splitCellSourceIntoMultilineString(cell.value),
		metadata: cellMetadata?.metadata || {} // This cannot be empty.
	};
	if (cellMetadata?.attachments) {
		rawCell.attachments = cellMetadata.attachments;
	}
	if (cellMetadata?.id) {
		rawCell.id = cellMetadata.id;
	}
	return rawCell;
}

/**
 * Splits the source of a cell into an array of strings, each representing a line.
 * Also normalizes line endings to use LF (`\n`) instead of CRLF (`\r\n`).
 * Same is done in deserializer as well.
 */
function splitCellSourceIntoMultilineString(source: string): string[] {
	return splitMultilineString(source.replace(/\r\n/g, '\n'));
}

function splitMultilineString(source: nbformat.MultilineString): string[] {
	if (Array.isArray(source)) {
		return source as string[];
	}
	const str = source.toString();
	if (str.length > 0) {
		// Each line should be a separate entry, but end with a \n if not last entry
		const arr = str.split('\n');
		return arr
			.map((s, i) => {
				if (i < arr.length - 1) {
					return `${s}\n`;
				}
				return s;
			})
			.filter(s => s.length > 0); // Skip last one if empty (it's the only one that could be length 0)
	}
	return [];
}

function translateCellDisplayOutput(output: NotebookCellOutput): JupyterOutput {
	const customMetadata = output.metadata as CellOutputMetadata | undefined;
	let result: JupyterOutput;
	// Possible some other extension added some output (do best effort to translate & save in ipynb).
	// In which case metadata might not contain `outputType`.
	const outputType = customMetadata?.outputType as nbformat.OutputType;
	switch (outputType) {
		case 'error': {
			result = translateCellErrorOutput(output);
			break;
		}
		case 'stream': {
			result = convertStreamOutput(output);
			break;
		}
		case 'display_data': {
			result = {
				output_type: 'display_data',
				data: output.items.reduce((prev: any, curr) => {
					prev[curr.mime] = convertOutputMimeToJupyterOutput(curr.mime, curr.data as Uint8Array);
					return prev;
				}, {}),
				metadata: customMetadata?.metadata || {} // This can never be undefined.
			};
			break;
		}
		case 'execute_result': {
			result = {
				output_type: 'execute_result',
				data: output.items.reduce((prev: any, curr) => {
					prev[curr.mime] = convertOutputMimeToJupyterOutput(curr.mime, curr.data as Uint8Array);
					return prev;
				}, {}),
				metadata: customMetadata?.metadata || {}, // This can never be undefined.
				execution_count:
					typeof customMetadata?.executionCount === 'number' ? customMetadata?.executionCount : null // This can never be undefined, only a number or `null`.
			};
			break;
		}
		case 'update_display_data': {
			result = {
				output_type: 'update_display_data',
				data: output.items.reduce((prev: any, curr) => {
					prev[curr.mime] = convertOutputMimeToJupyterOutput(curr.mime, curr.data as Uint8Array);
					return prev;
				}, {}),
				metadata: customMetadata?.metadata || {} // This can never be undefined.
			};
			break;
		}
		default: {
			const isError =
				output.items.length === 1 && output.items.every((item) => item.mime === CellOutputMimeTypes.error);
			const isStream = output.items.every(
				(item) => item.mime === CellOutputMimeTypes.stderr || item.mime === CellOutputMimeTypes.stdout
			);

			if (isError) {
				return translateCellErrorOutput(output);
			}

			// In the case of .NET & other kernels, we need to ensure we save ipynb correctly.
			// Hence if we have stream output, save the output as Jupyter `stream` else `display_data`
			// Unless we already know its an unknown output type.
			const outputType: nbformat.OutputType =
				<nbformat.OutputType>customMetadata?.outputType || (isStream ? 'stream' : 'display_data');
			let unknownOutput: nbformat.IUnrecognizedOutput | nbformat.IDisplayData | nbformat.IStream;
			if (outputType === 'stream') {
				// If saving as `stream` ensure the mandatory properties are set.
				unknownOutput = convertStreamOutput(output);
			} else if (outputType === 'display_data') {
				// If saving as `display_data` ensure the mandatory properties are set.
				const displayData: nbformat.IDisplayData = {
					data: {},
					metadata: {},
					output_type: 'display_data'
				};
				unknownOutput = displayData;
			} else {
				unknownOutput = {
					output_type: outputType
				};
			}
			if (customMetadata?.metadata) {
				unknownOutput.metadata = customMetadata.metadata;
			}
			if (output.items.length > 0) {
				unknownOutput.data = output.items.reduce((prev: any, curr) => {
					prev[curr.mime] = convertOutputMimeToJupyterOutput(curr.mime, curr.data as Uint8Array);
					return prev;
				}, {});
			}
			result = unknownOutput;
			break;
		}
	}

	// Account for transient data as well
	// `transient.display_id` is used to update cell output in other cells, at least thats one use case we know of.
	if (result && customMetadata && customMetadata.transient) {
		result.transient = customMetadata.transient;
	}
	return result;
}

function translateCellErrorOutput(output: NotebookCellOutput): nbformat.IError {
	// it should have at least one output item
	const firstItem = output.items[0];
	// Bug in VS Code.
	if (!firstItem.data) {
		return {
			output_type: 'error',
			ename: '',
			evalue: '',
			traceback: []
		};
	}
	const originalError: undefined | nbformat.IError = output.metadata?.originalError;
	const value: Error = JSON.parse(textDecoder.decode(firstItem.data));
	return {
		output_type: 'error',
		ename: value.name,
		evalue: value.message,
		// VS Code needs an `Error` object which requires a `stack` property as a string.
		// Its possible the format could change when converting from `traceback` to `string` and back again to `string`
		// When .NET stores errors in output (with their .NET kernel),
		// stack is empty, hence store the message instead of stack (so that somethign gets displayed in ipynb).
		traceback: originalError?.traceback || splitMultilineString(value.stack || value.message || '')
	};
}


function getOutputStreamType(output: NotebookCellOutput): string | undefined {
	if (output.items.length > 0) {
		return output.items[0].mime === CellOutputMimeTypes.stderr ? 'stderr' : 'stdout';
	}

	return;
}

type JupyterOutput =
	| nbformat.IUnrecognizedOutput
	| nbformat.IExecuteResult
	| nbformat.IDisplayData
	| nbformat.IStream
	| nbformat.IError;

function convertStreamOutput(output: NotebookCellOutput): JupyterOutput {
	const outputs: string[] = [];
	output.items
		.filter((opit) => opit.mime === CellOutputMimeTypes.stderr || opit.mime === CellOutputMimeTypes.stdout)
		.map((opit) => textDecoder.decode(opit.data))
		.forEach(value => {
			// Ensure each line is a separate entry in an array (ending with \n).
			const lines = value.split('\n');
			// If the last item in `outputs` is not empty and the first item in `lines` is not empty, then concate them.
			// As they are part of the same line.
			if (outputs.length && lines.length && lines[0].length > 0) {
				outputs[outputs.length - 1] = `${outputs[outputs.length - 1]}${lines.shift()!}`;
			}
			for (const line of lines) {
				outputs.push(line);
			}
		});

	for (let index = 0; index < (outputs.length - 1); index++) {
		outputs[index] = `${outputs[index]}\n`;
	}

	// Skip last one if empty (it's the only one that could be length 0)
	if (outputs.length && outputs[outputs.length - 1].length === 0) {
		outputs.pop();
	}

	const streamType = getOutputStreamType(output) || 'stdout';

	return {
		output_type: 'stream',
		name: streamType,
		text: outputs
	};
}

function convertOutputMimeToJupyterOutput(mime: string, value: Uint8Array) {
	if (!value) {
		return '';
	}
	try {
		if (mime === CellOutputMimeTypes.error) {
			const stringValue = textDecoder.decode(value);
			return JSON.parse(stringValue);
		} else if (mime.startsWith('text/') || textMimeTypes.includes(mime)) {
			const stringValue = textDecoder.decode(value);
			return splitMultilineString(stringValue);
		} else if (mime.startsWith('image/') && mime !== 'image/svg+xml') {
			// Images in Jupyter are stored in base64 encoded format.
			// VS Code expects bytes when rendering images.
			if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
				return Buffer.from(value).toString('base64');
			} else {
				return btoa(value.reduce((s: string, b: number) => s + String.fromCharCode(b), ''));
			}
		} else if (mime.toLowerCase().includes('json')) {
			const stringValue = textDecoder.decode(value);
			return stringValue.length > 0 ? JSON.parse(stringValue) : stringValue;
		} else if (mime === 'image/svg+xml') {
			return splitMultilineString(textDecoder.decode(value));
		} else {
			return textDecoder.decode(value);
		}
	} catch (ex) {
		return '';
	}
}

export function createMarkdownCellFromNotebookCell(cell: NotebookCellData): nbformat.IMarkdownCell {
	const cellMetadata = getCellMetadata({ cell });
	const markdownCell: any = {
		cell_type: 'markdown',
		source: splitCellSourceIntoMultilineString(cell.value),
		metadata: cellMetadata?.metadata || {} // This cannot be empty.
	};
	if (cellMetadata?.attachments) {
		markdownCell.attachments = cellMetadata.attachments;
	}
	if (cellMetadata?.id) {
		markdownCell.id = cellMetadata.id;
	}
	return markdownCell;
}

export function pruneCell(cell: nbformat.ICell): nbformat.ICell {
	// Source is usually a single string on input. Convert back to an array
	const result: nbformat.ICell = {
		...cell,
		source: splitMultilineString(cell.source)
	};

	// Remove outputs and execution_count from non code cells
	if (result.cell_type !== 'code') {
		delete (result as Record<string, unknown>).outputs;
		delete (result as Record<string, unknown>).execution_count;
	} else {
		// Clean outputs from code cells
		result.outputs = result.outputs ? (result.outputs as nbformat.IOutput[]).map(fixupOutput) : [];
	}

	return result;
}
const dummyStreamObj: nbformat.IStream = {
	output_type: 'stream',
	name: 'stdout',
	text: ''
};
const dummyErrorObj: nbformat.IError = {
	output_type: 'error',
	ename: '',
	evalue: '',
	traceback: ['']
};
const dummyDisplayObj: nbformat.IDisplayData = {
	output_type: 'display_data',
	data: {},
	metadata: {}
};
const dummyExecuteResultObj: nbformat.IExecuteResult = {
	output_type: 'execute_result',
	name: '',
	execution_count: 0,
	data: {},
	metadata: {}
};
const AllowedCellOutputKeys = {
	['stream']: new Set(Object.keys(dummyStreamObj)),
	['error']: new Set(Object.keys(dummyErrorObj)),
	['display_data']: new Set(Object.keys(dummyDisplayObj)),
	['execute_result']: new Set(Object.keys(dummyExecuteResultObj))
};

function fixupOutput(output: nbformat.IOutput): nbformat.IOutput {
	let allowedKeys: Set<string>;
	switch (output.output_type) {
		case 'stream':
		case 'error':
		case 'execute_result':
		case 'display_data':
			allowedKeys = AllowedCellOutputKeys[output.output_type];
			break;
		default:
			return output;
	}
	const result = { ...output };
	for (const k of Object.keys(output)) {
		if (!allowedKeys.has(k)) {
			delete result[k];
		}
	}
	return result;
}


export function serializeNotebookToString(data: NotebookData): string {
	const notebookContent = getNotebookMetadata(data);
	// use the preferred language from document metadata or the first cell language as the notebook preferred cell language
	const preferredCellLanguage = notebookContent.metadata?.language_info?.name ?? data.cells.find(cell => cell.kind === 2)?.languageId;

	notebookContent.cells = data.cells
		.map(cell => createJupyterCellFromNotebookCell(cell, preferredCellLanguage))
		.map(pruneCell);

	const indentAmount = data.metadata && typeof data.metadata.indentAmount === 'string' ?
		data.metadata.indentAmount :
		' ';

	return serializeNotebookToJSON(notebookContent, indentAmount);
}
function serializeNotebookToJSON(notebookContent: Partial<nbformat.INotebookContent>, indentAmount: string): string {
	// ipynb always ends with a trailing new line (we add this so that SCMs do not show unnecessary changes, resulting from a missing trailing new line).
	const sorted = sortObjectPropertiesRecursively(notebookContent);

	return JSON.stringify(sorted, undefined, indentAmount) + '\n';
}

export function getNotebookMetadata(document: NotebookDocument | NotebookData) {
	const existingContent: Partial<nbformat.INotebookContent> = document.metadata || {};
	const notebookContent: Partial<nbformat.INotebookContent> = {};
	notebookContent.cells = existingContent.cells || [];
	notebookContent.nbformat = existingContent.nbformat || defaultNotebookFormat.major;
	notebookContent.nbformat_minor = existingContent.nbformat_minor ?? defaultNotebookFormat.minor;
	notebookContent.metadata = existingContent.metadata || {};
	return notebookContent;
}
