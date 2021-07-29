/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nbformat } from '@jupyterlab/coreutils';
import { extensions, NotebookCellData, NotebookCellExecutionSummary, NotebookCellKind, NotebookCellOutput, NotebookCellOutputItem, NotebookData } from 'vscode';

const jupyterLanguageToMonacoLanguageMapping = new Map([
	['c#', 'csharp'],
	['f#', 'fsharp'],
	['q#', 'qsharp'],
	['c++11', 'c++'],
	['c++12', 'c++'],
	['c++14', 'c++']
]);

export function getPreferredLanguage(metadata?: nbformat.INotebookMetadata) {
	const jupyterLanguage =
		metadata?.language_info?.name ||
		(metadata?.kernelspec as any)?.language;

	// Default to python language only if the Python extension is installed.
	const defaultLanguage = extensions.getExtension('ms-python.python') ? 'python' : 'plaintext';

	// Note, whatever language is returned here, when the user selects a kernel, the cells (of blank documents) get updated based on that kernel selection.
	return translateKernelLanguageToMonaco(jupyterLanguage || defaultLanguage);
}

const textDecoder = new TextDecoder();
function translateKernelLanguageToMonaco(language: string): string {
	language = language.toLowerCase();
	if (language.length === 2 && language.endsWith('#')) {
		return `${language.substring(0, 1)}sharp`;
	}
	return jupyterLanguageToMonacoLanguageMapping.get(language) || language;
}

const orderOfMimeTypes = [
	'application/vnd.*',
	'application/vdom.*',
	'application/geo+json',
	'application/x-nteract-model-debug+json',
	'text/html',
	'application/javascript',
	'image/gif',
	'text/latex',
	'text/markdown',
	'image/png',
	'image/svg+xml',
	'image/jpeg',
	'application/json',
	'text/plain'
];

function sortOutputItemsBasedOnDisplayOrder(outputItems: NotebookCellOutputItem[]): NotebookCellOutputItem[] {
	return outputItems.sort((outputItemA, outputItemB) => {
		const isMimeTypeMatch = (value: string, compareWith: string) => {
			if (value.endsWith('.*')) {
				value = value.substr(0, value.indexOf('.*'));
			}
			return compareWith.startsWith(value);
		};
		const indexOfMimeTypeA = orderOfMimeTypes.findIndex(mime => isMimeTypeMatch(outputItemA.mime, mime));
		const indexOfMimeTypeB = orderOfMimeTypes.findIndex(mime => isMimeTypeMatch(outputItemB.mime, mime));
		return indexOfMimeTypeA - indexOfMimeTypeB;
	});
}


enum CellOutputMimeTypes {
	error = 'application/vnd.code.notebook.error',
	stderr = 'application/vnd.code.notebook.stderr',
	stdout = 'application/vnd.code.notebook.stdout'
}

const textMimeTypes = ['text/plain', 'text/markdown', CellOutputMimeTypes.stderr, CellOutputMimeTypes.stdout];

function concatMultilineString(str: string | string[], trim?: boolean): string {
	const nonLineFeedWhiteSpaceTrim = /(^[\t\f\v\r ]+|[\t\f\v\r ]+$)/g;
	if (Array.isArray(str)) {
		let result = '';
		for (let i = 0; i < str.length; i += 1) {
			const s = str[i];
			if (i < str.length - 1 && !s.endsWith('\n')) {
				result = result.concat(`${s}\n`);
			} else {
				result = result.concat(s);
			}
		}

		// Just trim whitespace. Leave \n in place
		return trim ? result.replace(nonLineFeedWhiteSpaceTrim, '') : result;
	}
	return trim ? str.toString().replace(nonLineFeedWhiteSpaceTrim, '') : str.toString();
}

function convertJupyterOutputToBuffer(mime: string, value: unknown): NotebookCellOutputItem {
	if (!value) {
		return NotebookCellOutputItem.text('', mime);
	}
	try {
		if (
			(mime.startsWith('text/') || textMimeTypes.includes(mime)) &&
			(Array.isArray(value) || typeof value === 'string')
		) {
			const stringValue = Array.isArray(value) ? concatMultilineString(value) : value;
			return NotebookCellOutputItem.text(stringValue, mime);
		} else if (mime.startsWith('image/') && typeof value === 'string' && mime !== 'image/svg+xml') {
			// Images in Jupyter are stored in base64 encoded format.
			// VS Code expects bytes when rendering images.
			if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
				return new NotebookCellOutputItem(Buffer.from(value, 'base64'), mime);
			} else {
				const data = Uint8Array.from(atob(value), c => c.charCodeAt(0));
				return new NotebookCellOutputItem(data, mime);
			}
		} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			return NotebookCellOutputItem.text(JSON.stringify(value), mime);
		} else {
			// For everything else, treat the data as strings (or multi-line strings).
			value = Array.isArray(value) ? concatMultilineString(value) : value;
			return NotebookCellOutputItem.text(value as string, mime);
		}
	} catch (ex) {
		return NotebookCellOutputItem.error(ex);
	}
}

export function createJupyterCellFromNotebookCell(
	vscCell: NotebookCellData
): nbformat.IRawCell | nbformat.IMarkdownCell | nbformat.ICodeCell {
	let cell: nbformat.IRawCell | nbformat.IMarkdownCell | nbformat.ICodeCell;
	if (vscCell.kind === NotebookCellKind.Markup) {
		cell = createMarkdownCellFromNotebookCell(vscCell);
	} else if (vscCell.languageId === 'raw') {
		cell = createRawCellFromNotebookCell(vscCell);
	} else {
		cell = createCodeCellFromNotebookCell(vscCell);
	}
	return cell;
}

function createCodeCellFromNotebookCell(cell: NotebookCellData): nbformat.ICodeCell {
	const cellMetadata = cell.metadata?.custom as CellMetadata | undefined;
	const codeCell: any = {
		cell_type: 'code',
		execution_count: cell.executionSummary?.executionOrder ?? null,
		source: splitMultilineString(cell.value),
		outputs: (cell.outputs || []).map(translateCellDisplayOutput),
		metadata: cellMetadata?.metadata || {} // This cannot be empty.
	};
	return codeCell;
}

function createRawCellFromNotebookCell(cell: NotebookCellData): nbformat.IRawCell {
	const cellMetadata = cell.metadata?.custom as CellMetadata | undefined;
	const rawCell: any = {
		cell_type: 'raw',
		source: splitMultilineString(cell.value),
		metadata: cellMetadata?.metadata || {} // This cannot be empty.
	};
	if (cellMetadata?.attachments) {
		rawCell.attachments = cellMetadata.attachments;
	}
	return rawCell;
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

/**
 * Metadata we store in VS Code cell output items.
 * This contains the original metadata from the Jupyuter Outputs.
 */
interface CellOutputMetadata {
	/**
	 * Cell output metadata.
	 */
	metadata?: any;
	/**
	 * Transient data from Jupyter.
	 */
	transient?: {
		/**
		 * This is used for updating the output in other cells.
		 * We don't know of others properties, but this is definitely used.
		 */
		display_id?: string;
	} & any;
	/**
	 * Original cell output type
	 */
	outputType: nbformat.OutputType | string;
	executionCount?: nbformat.IExecuteResult['ExecutionCount'];
	/**
	 * Whether the original Mime data is JSON or not.
	 * This properly only exists in metadata for NotebookCellOutputItems
	 * (this is something we have added)
	 */
	__isJson?: boolean;
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
				data: output.items.reduceRight((prev: any, curr) => {
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
				data: output.items.reduceRight((prev: any, curr) => {
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
				data: output.items.reduceRight((prev: any, curr) => {
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
				unknownOutput.data = output.items.reduceRight((prev: any, curr) => {
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
	const outputs = output.items
		.filter((opit) => opit.mime === CellOutputMimeTypes.stderr || opit.mime === CellOutputMimeTypes.stdout)
		.map((opit) => convertOutputMimeToJupyterOutput(opit.mime, opit.data as Uint8Array) as string)
		.reduceRight<string[]>((prev, curr) => prev.concat(curr), []);

	const streamType = getOutputStreamType(output) || 'stdout';

	return {
		output_type: 'stream',
		name: streamType,
		text: splitMultilineString(outputs.join(''))
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
				// https://developer.mozilla.org/en-US/docs/Glossary/Base64#solution_1_%E2%80%93_escaping_the_string_before_encoding_it
				const stringValue = textDecoder.decode(value);
				return btoa(encodeURIComponent(stringValue).replace(/%([0-9A-F]{2})/g, function (_match, p1) {
					return String.fromCharCode(Number.parseInt('0x' + p1));
				}));
			}
		} else if (mime.toLowerCase().includes('json')) {
			const stringValue = textDecoder.decode(value);
			return stringValue.length > 0 ? JSON.parse(stringValue) : stringValue;
		} else {
			const stringValue = textDecoder.decode(value);
			return stringValue;
		}
	} catch (ex) {
		return '';
	}
}

function createMarkdownCellFromNotebookCell(cell: NotebookCellData): nbformat.IMarkdownCell {
	const cellMetadata = cell.metadata?.custom as CellMetadata | undefined;
	const markdownCell: any = {
		cell_type: 'markdown',
		source: splitMultilineString(cell.value),
		metadata: cellMetadata?.metadata || {} // This cannot be empty.
	};
	if (cellMetadata?.attachments) {
		markdownCell.attachments = cellMetadata.attachments;
	}
	return markdownCell;
}

/**
 * Metadata we store in VS Code cells.
 * This contains the original metadata from the Jupyuter cells.
 */
interface CellMetadata {
	/**
	 * Stores attachments for cells.
	 */
	attachments?: nbformat.IAttachments;
	/**
	 * Stores cell metadata.
	 */
	metadata?: Partial<nbformat.ICellMetadata>;
}

export function pruneCell(cell: nbformat.ICell): nbformat.ICell {
	// Source is usually a single string on input. Convert back to an array
	const result = {
		...cell,
		source: splitMultilineString(cell.source)
	} as nbformat.ICell;

	// Remove outputs and execution_count from non code cells
	if (result.cell_type !== 'code') {
		delete (<any>result).outputs;
		delete (<any>result).execution_count;
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

function getNotebookCellMetadata(cell: nbformat.IBaseCell): CellMetadata {
	// We put this only for VSC to display in diff view.
	// Else we don't use this.
	const propertiesToClone: (keyof CellMetadata)[] = ['metadata', 'attachments'];
	const custom: CellMetadata = {};
	propertiesToClone.forEach((propertyToClone) => {
		if (cell[propertyToClone]) {
			custom[propertyToClone] = JSON.parse(JSON.stringify(cell[propertyToClone]));
		}
	});
	return custom;
}
function getOutputMetadata(output: nbformat.IOutput): CellOutputMetadata {
	// Add on transient data if we have any. This should be removed by our save functions elsewhere.
	const metadata: CellOutputMetadata = {
		outputType: output.output_type
	};
	if (output.transient) {
		metadata.transient = output.transient;
	}

	switch (output.output_type as nbformat.OutputType) {
		case 'display_data':
		case 'execute_result':
		case 'update_display_data': {
			metadata.executionCount = output.execution_count;
			metadata.metadata = output.metadata ? JSON.parse(JSON.stringify(output.metadata)) : {};
			break;
		}
		default:
			break;
	}

	return metadata;
}


function translateDisplayDataOutput(
	output: nbformat.IDisplayData | nbformat.IDisplayUpdate | nbformat.IExecuteResult
): NotebookCellOutput {
	// Metadata could be as follows:
	// We'll have metadata specific to each mime type as well as generic metadata.
	/*
	IDisplayData = {
		output_type: 'display_data',
		data: {
			'image/jpg': '/////'
			'image/png': '/////'
			'text/plain': '/////'
		},
		metadata: {
			'image/png': '/////',
			'background': true,
			'xyz': '///
		}
	}
	*/
	const metadata = getOutputMetadata(output);
	const items: NotebookCellOutputItem[] = [];
	if (output.data) {
		for (const key in output.data) {
			items.push(convertJupyterOutputToBuffer(key, output.data[key]));
		}
	}

	return new NotebookCellOutput(sortOutputItemsBasedOnDisplayOrder(items), metadata);
}

function translateErrorOutput(output?: nbformat.IError): NotebookCellOutput {
	output = output || { output_type: 'error', ename: '', evalue: '', traceback: [] };
	return new NotebookCellOutput(
		[
			NotebookCellOutputItem.error({
				name: output?.ename || '',
				message: output?.evalue || '',
				stack: (output?.traceback || []).join('\n')
			})
		],
		{ ...getOutputMetadata(output), originalError: output }
	);
}

function translateStreamOutput(output: nbformat.IStream): NotebookCellOutput {
	const value = concatMultilineString(output.text);
	const item = output.name === 'stderr' ? NotebookCellOutputItem.stderr(value) : NotebookCellOutputItem.stdout(value);
	return new NotebookCellOutput([item], getOutputMetadata(output));
}

const cellOutputMappers = new Map<nbformat.OutputType, (output: any) => NotebookCellOutput>();
cellOutputMappers.set('display_data', translateDisplayDataOutput);
cellOutputMappers.set('execute_result', translateDisplayDataOutput);
cellOutputMappers.set('update_display_data', translateDisplayDataOutput);
cellOutputMappers.set('error', translateErrorOutput);
cellOutputMappers.set('stream', translateStreamOutput);

function jupyterCellOutputToCellOutput(output: nbformat.IOutput): NotebookCellOutput {
	/**
	 * Stream, `application/x.notebook.stream`
	 * Error, `application/x.notebook.error-traceback`
	 * Rich, { mime: value }
	 *
	 * outputs: [
			new vscode.NotebookCellOutput([
				new vscode.NotebookCellOutputItem('application/x.notebook.stream', 2),
				new vscode.NotebookCellOutputItem('application/x.notebook.stream', 3),
			]),
			new vscode.NotebookCellOutput([
				new vscode.NotebookCellOutputItem('text/markdown', '## header 2'),
				new vscode.NotebookCellOutputItem('image/svg+xml', [
					"<svg baseProfile=\"full\" height=\"200\" version=\"1.1\" width=\"300\" xmlns=\"http://www.w3.org/2000/svg\">\n",
					"  <rect fill=\"blue\" height=\"100%\" width=\"100%\"/>\n",
					"  <circle cx=\"150\" cy=\"100\" fill=\"green\" r=\"80\"/>\n",
					"  <text fill=\"white\" font-size=\"60\" text-anchor=\"middle\" x=\"150\" y=\"125\">SVG</text>\n",
					"</svg>"
					]),
			]),
		]
	 *
	 */
	const fn = cellOutputMappers.get(output.output_type as nbformat.OutputType);
	let result: NotebookCellOutput;
	if (fn) {
		result = fn(output);
	} else {
		result = translateDisplayDataOutput(output as any);
	}
	return result;
}

function createNotebookCellDataFromRawCell(cell: nbformat.IRawCell): NotebookCellData {
	const cellData = new NotebookCellData(NotebookCellKind.Code, concatMultilineString(cell.source), 'raw');
	cellData.outputs = [];
	cellData.metadata = { custom: getNotebookCellMetadata(cell) };
	return cellData;
}
function createNotebookCellDataFromMarkdownCell(cell: nbformat.IMarkdownCell): NotebookCellData {
	const cellData = new NotebookCellData(
		NotebookCellKind.Markup,
		concatMultilineString(cell.source),
		'markdown'
	);
	cellData.outputs = [];
	cellData.metadata = { custom: getNotebookCellMetadata(cell) };
	return cellData;
}
function createNotebookCellDataFromCodeCell(cell: nbformat.ICodeCell, cellLanguage: string): NotebookCellData {
	const cellOutputs = Array.isArray(cell.outputs) ? cell.outputs : [];
	const outputs = cellOutputs.map(jupyterCellOutputToCellOutput);
	const hasExecutionCount = typeof cell.execution_count === 'number' && cell.execution_count > 0;

	const source = concatMultilineString(cell.source);

	const executionSummary: NotebookCellExecutionSummary = hasExecutionCount
		? { executionOrder: cell.execution_count as number }
		: {};

	const cellData = new NotebookCellData(NotebookCellKind.Code, source, cellLanguage);

	cellData.outputs = outputs;
	cellData.metadata = { custom: getNotebookCellMetadata(cell) };
	cellData.executionSummary = executionSummary;
	return cellData;
}

function createNotebookCellDataFromJupyterCell(
	cellLanguage: string,
	cell: nbformat.IBaseCell
): NotebookCellData | undefined {
	switch (cell.cell_type) {
		case 'raw': {
			return createNotebookCellDataFromRawCell(cell as nbformat.IRawCell);
		}
		case 'markdown': {
			return createNotebookCellDataFromMarkdownCell(cell as nbformat.IMarkdownCell);
		}
		case 'code': {
			return createNotebookCellDataFromCodeCell(cell as nbformat.ICodeCell, cellLanguage);
		}
	}

	return;
}

/**
 * Converts a NotebookModel into VS Code format.
 */
export function jupyterNotebookModelToNotebookData(
	notebookContent: Partial<nbformat.INotebookContent>,
	preferredLanguage: string
): NotebookData {
	const notebookContentWithoutCells = { ...notebookContent, cells: [] };
	if (!notebookContent.cells || notebookContent.cells.length === 0) {
		throw new Error('Notebook content is missing cells');
	}

	const cells = notebookContent.cells
		.map(cell => createNotebookCellDataFromJupyterCell(preferredLanguage, cell))
		.filter((item): item is NotebookCellData => !!item);

	const notebookData = new NotebookData(cells);
	notebookData.metadata = { custom: notebookContentWithoutCells };
	return notebookData;
}
