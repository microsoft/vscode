/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { StringSHA1 } from '../../../vs/base/common/hash';
import { Schemas } from '../../../vs/base/common/network';
import { URI as Uri } from '../../../vs/base/common/uri';
import { NotebookCellKind, NotebookCellOutput, NotebookCellOutputItem, NotebookData } from '../../../vs/workbench/api/common/extHostTypes/notebooks';
import { createTextDocumentData, IExtHostDocumentData } from './textDocument';

interface ISimulationWorkspace {
	addDocument(doc: IExtHostDocumentData): void;
	addNotebookDocument(notebook: ExtHostNotebookDocumentData): void;
}

export interface NotebookCellExecutionSummary {
}

declare type OutputType = 'execute_result' | 'display_data' | 'stream' | 'error' | 'update_display_data';

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

enum CellOutputMimeTypes {
	error = 'application/vnd.code.notebook.error',
	stderr = 'application/vnd.code.notebook.stderr',
	stdout = 'application/vnd.code.notebook.stdout'
}

const textMimeTypes = ['text/plain', 'text/markdown', 'text/latex', CellOutputMimeTypes.stderr, CellOutputMimeTypes.stdout];


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
		} else if (mime === 'application/json') {
			return NotebookCellOutputItem.json(value, mime);
		} else {
			// For everything else, treat the data as strings (or multi-line strings).
			value = Array.isArray(value) ? concatMultilineString(value) : value;
			return NotebookCellOutputItem.text(value as string, mime);
		}
	} catch (ex) {
		return NotebookCellOutputItem.error(ex);
	}
}

export function translateDisplayDataOutput(
	output: any
): NotebookCellOutput {
	const items: NotebookCellOutputItem[] = [];
	if (output.data) {
		for (const key in output.data) {
			items.push(convertJupyterOutputToBuffer(key, output.data[key]));
		}
	}

	return new NotebookCellOutput(items, {});
}

export function translateErrorOutput(output?: any): NotebookCellOutput {
	output = output || { output_type: 'error', ename: '', evalue: '', traceback: [] };
	return new NotebookCellOutput(
		[
			NotebookCellOutputItem.error({
				name: output?.ename || '',
				message: output?.evalue || '',
				stack: (output?.traceback || []).join('\n')
			})
		],
		{ originalError: output }
	);
}

export function translateStreamOutput(output: any): NotebookCellOutput {
	const value = concatMultilineString(output.text);
	const item = output.name === 'stderr' ? NotebookCellOutputItem.stderr(value) : NotebookCellOutputItem.stdout(value);
	return new NotebookCellOutput([item], {});
}

const cellOutputMappers = new Map<OutputType, (output: any) => NotebookCellOutput>();
cellOutputMappers.set('display_data', translateDisplayDataOutput);
cellOutputMappers.set('execute_result', translateDisplayDataOutput);
cellOutputMappers.set('update_display_data', translateDisplayDataOutput);
cellOutputMappers.set('error', translateErrorOutput);
cellOutputMappers.set('stream', translateStreamOutput);


export function jupyterCellOutputToCellOutput(output: any): NotebookCellOutput {
	const fn = cellOutputMappers.get(output.output_type);
	let result: NotebookCellOutput;
	if (fn) {
		result = fn(output);
	} else {
		result = translateDisplayDataOutput(output as any);
	}
	return result;
}

const textDecoder = new TextDecoder();

export interface CellOutputMetadata {
	metadata?: any;
	transient?: {
		display_id?: string;
	} & any;

	outputType: OutputType | string;
	executionCount?: number | null;
	__isJson?: boolean;
}

function splitMultilineString(source: string | string[]): string[] {
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

function translateCellErrorOutput(output: vscode.NotebookCellOutput) {
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
	const originalError = output.metadata?.originalError;
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

function convertStreamOutput(output: vscode.NotebookCellOutput) {
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

function getOutputStreamType(output: vscode.NotebookCellOutput): string | undefined {
	if (output.items.length > 0) {
		return output.items[0].mime === CellOutputMimeTypes.stderr ? 'stderr' : 'stdout';
	}

	return;
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

function translateCellDisplayOutput(output: vscode.NotebookCellOutput): any {
	const customMetadata = output.metadata as CellOutputMetadata | undefined;
	let result;
	// Possible some other extension added some output (do best effort to translate & save in ipynb).
	// In which case metadata might not contain `outputType`.
	const outputType = customMetadata?.outputType as OutputType;
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
			const outputType: OutputType =
				<OutputType>customMetadata?.outputType || (isStream ? 'stream' : 'display_data');
			let unknownOutput: any;
			if (outputType === 'stream') {
				// If saving as `stream` ensure the mandatory properties are set.
				unknownOutput = convertStreamOutput(output);
			} else if (outputType === 'display_data') {
				// If saving as `display_data` ensure the mandatory properties are set.
				const displayData = {
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


export class ExtHostCell {
	index: number;
	notebook: ExtHostNotebookDocumentData;
	kind: NotebookCellKind;
	documentData: IExtHostDocumentData;
	metadata: { readonly [key: string]: any };
	private _outputs: vscode.NotebookCellOutput[];
	executionSummary: NotebookCellExecutionSummary | undefined;

	get document() {
		return this.documentData.document;
	}

	private _apiCell: vscode.NotebookCell | undefined;

	constructor(
		index: number,
		kind: NotebookCellKind,
		notebook: ExtHostNotebookDocumentData,
		documentData: IExtHostDocumentData,
		metadata: { readonly [key: string]: any },
		outputs: vscode.NotebookCellOutput[],
		executionSummary: NotebookCellExecutionSummary | undefined,
	) {
		this.documentData = documentData;
		this.index = index;
		this.kind = kind;
		this.metadata = metadata;
		this._outputs = outputs;
		this.executionSummary = executionSummary;
		this.notebook = notebook;
	}

	get apiCell(): vscode.NotebookCell {
		if (!this._apiCell) {
			const that = this;
			const apiCell: vscode.NotebookCell = {
				get index() { return that.notebook.getCellIndex(that); },
				notebook: that.notebook.document,
				kind: that.kind,
				document: that.document,
				get outputs() { return that._outputs.slice(0); },
				get metadata() { return that.metadata; },
				get executionSummary() { return that.executionSummary; }
			};
			this._apiCell = Object.freeze(apiCell);
		}
		return this._apiCell;
	}

	appendOutput(outputs: vscode.NotebookCellOutput[]) {
		this._outputs.push(...outputs);
	}
}


function generateCellFragment(index: number): string {
	const hash = new StringSHA1();
	hash.update(`index${index}`);
	return hash.digest().substring(0, 8);
}

export class ExtHostNotebookDocumentData {
	public static createJupyterNotebook(uri: Uri, contents: string, simulationWorkspace?: ISimulationWorkspace): ExtHostNotebookDocumentData {
		const notebook = JSON.parse(contents);
		const codeLanguageId = notebook.metadata?.language_info?.language ?? notebook.metadata?.language_info?.name ?? 'python';
		const notebookDocument = new ExtHostNotebookDocumentData(uri, 'jupyter-notebook', notebook.metadata, []);
		const cells: ExtHostCell[] = [];

		for (const [index, cell] of notebook.cells.entries()) {
			const content = cell.source.join('');

			if (cell.cell_type === 'code') {
				const doc = createTextDocumentData(uri.with({ scheme: Schemas.vscodeNotebookCell, fragment: generateCellFragment(index) }), content, codeLanguageId);
				if (simulationWorkspace) {
					simulationWorkspace.addDocument(doc);
				}
				const cellOutputs = Array.isArray(cell.outputs) ? cell.outputs : [];
				const outputs = cellOutputs.map(jupyterCellOutputToCellOutput);

				cells.push(new ExtHostCell(index, NotebookCellKind.Code, notebookDocument, doc, cell.metadata, outputs, undefined));
			} else {
				const doc = createTextDocumentData(uri.with({ scheme: Schemas.vscodeNotebookCell, fragment: generateCellFragment(index) }), content, 'markdown');
				if (simulationWorkspace) {
					simulationWorkspace.addDocument(doc);
				}
				cells.push(new ExtHostCell(index, NotebookCellKind.Markup, notebookDocument, doc, cell.metadata, [], undefined));
			}
		}
		notebookDocument.cells = cells;

		if (simulationWorkspace) {
			simulationWorkspace.addNotebookDocument(notebookDocument);
		}

		return notebookDocument;
	}

	public static createGithubIssuesNotebook(uri: Uri, contents: string, simulationWorkspace?: ISimulationWorkspace): ExtHostNotebookDocumentData {
		const notebook = JSON.parse(contents);
		const notebookDocument = new ExtHostNotebookDocumentData(uri, 'github-issues', {}, []);
		const cells: ExtHostCell[] = [];

		for (const [index, cell] of notebook.entries()) {
			const doc = createTextDocumentData(uri.with({ scheme: Schemas.vscodeNotebookCell, fragment: generateCellFragment(index) }), cell.value, cell.language);
			if (simulationWorkspace) {
				simulationWorkspace.addDocument(doc);
			}
			cells.push(new ExtHostCell(index, cell.kind, notebookDocument, doc, {}, [], undefined));
		}
		notebookDocument.cells = cells;

		if (simulationWorkspace) {
			simulationWorkspace.addNotebookDocument(notebookDocument);
		}
		return notebookDocument;
	}

	public static fromNotebookData(uri: Uri, data: NotebookData, notebookType: string, simulationWorkspace?: ISimulationWorkspace): ExtHostNotebookDocumentData {
		const notebookDocument = new ExtHostNotebookDocumentData(uri, notebookType, data.metadata || {}, []);
		const cells: ExtHostCell[] = [];

		for (const [index, cell] of data.cells.entries()) {
			const doc = createTextDocumentData(uri.with({ scheme: Schemas.vscodeNotebookCell, fragment: generateCellFragment(index) }), cell.value, cell.languageId);
			if (cell.outputs?.length) {
				throw new Error('Not implemented');
			}
			if (simulationWorkspace) {
				simulationWorkspace.addDocument(doc);
			}
			cells.push(new ExtHostCell(index, cell.kind, notebookDocument, doc, cell.metadata || {}, [], undefined));
		}
		notebookDocument.cells = cells;
		if (simulationWorkspace) {
			simulationWorkspace.addNotebookDocument(notebookDocument);
		}

		return notebookDocument;
	}

	public static applyEdits(notebookDocument: ExtHostNotebookDocumentData, edits: vscode.NotebookEdit[], simulationWorkspace?: ISimulationWorkspace) {
		for (const edit of edits) {
			if (edit.newNotebookMetadata) {
				throw new Error('Not Supported');
			}
			if (edit.newCellMetadata) {
				throw new Error('Not Supported');
			}
			if (edit.newCells) {
				ExtHostNotebookDocumentData.replaceCells(notebookDocument, edit.range, edit.newCells, simulationWorkspace);
			} else {
				notebookDocument._cells.splice(edit.range.start, edit.range.end - edit.range.start);
			}
		}
	}

	private static replaceCells(notebookDocument: ExtHostNotebookDocumentData, range: vscode.NotebookRange, cells: vscode.NotebookCellData[], simulationWorkspace?: ISimulationWorkspace) {
		const uri = notebookDocument.uri;
		const docs = cells.map((cell, index) => {
			const doc = createTextDocumentData(uri.with({ scheme: Schemas.vscodeNotebookCell, fragment: generateCellFragment(notebookDocument.cells.length + index + 1) }), cell.value, cell.languageId);
			if (simulationWorkspace) {
				simulationWorkspace.addDocument(doc);
			}
			if (cell.outputs?.length) {
				// throw new Error('Not implemented');
			}
			return doc;
		});
		const extCells = docs.map((doc, index) => new ExtHostCell(index, cells[index].kind, notebookDocument, doc, cells[index].metadata || {}, [], undefined));
		if (notebookDocument.cells.length) {
			notebookDocument.cells.splice(range.start, range.end > range.start ? range.end - range.start : 0, ...extCells);
		} else {
			notebookDocument.cells.push(...extCells);
		}
	}

	private _cells: ExtHostCell[] = [];
	set cells(cells: ExtHostCell[]) {
		this._cells = cells;
	}
	get cells() {
		return this._cells;
	}
	uri: Uri;

	private readonly _notebookType: string;

	private _notebook: vscode.NotebookDocument | undefined;
	private _metadata: Record<string, any>;
	private _versionId: number = 0;
	private _isDirty: boolean = false;
	private _disposed: boolean = false;

	constructor(
		uri: Uri,
		notebookType: string,
		metadata: { [key: string]: any },
		cells: ExtHostCell[],
	) {
		this.uri = uri;
		this._notebookType = notebookType;
		this._metadata = metadata;
		this._cells = cells;
	}

	get document(): vscode.NotebookDocument {
		if (!this._notebook) {
			const that = this;
			const apiObject: vscode.NotebookDocument = {
				get uri() { return that.uri; },
				get version() { return that._versionId; },
				get notebookType() { return that._notebookType; },
				get isDirty() { return that._isDirty; },
				get isUntitled() { return that.uri.scheme === 'untitled'; },
				get isClosed() { return that._disposed; },
				get metadata() { return that._metadata; },
				get cellCount() { return that._cells.length; },
				cellAt(index) {
					return that._cells[index].apiCell;
				},
				getCells(range) {
					const cells = range ? that._getCells(range) : that._cells;
					return cells.map(cell => cell.apiCell);
				},
				save() {
					return Promise.resolve(true);
				}
			};
			this._notebook = Object.freeze(apiObject);
		}
		return this._notebook;
	}

	get cellCount(): number {
		return this._cells.length;
	}
	cellAt(index: number): ExtHostCell {
		return this._cells[index];
	}

	private _getCells(range: vscode.NotebookRange): ExtHostCell[] {
		const result: ExtHostCell[] = [];
		for (let i = range.start; i < range.end; i++) {
			result.push(this._cells[i]);
		}
		return result;
	}

	getCellIndex(cell: ExtHostCell): number {
		return this._cells.indexOf(cell);
	}

	getText(): string {
		return JSON.stringify({
			cells: this._cells.map(cell => ({
				cell_type: cell.kind === 2 ? 'code' : 'markdown',
				source: [cell.document.getText()],
				metadata: cell.metadata,
				outputs: (cell.apiCell.outputs || []).map(translateCellDisplayOutput),
			})),
			metadata: this._metadata,
		}, undefined, 4);
	}

	appendCellOutput(cellIndex: number, outputs: vscode.NotebookCellOutput[]): void {
		this._cells[cellIndex].appendOutput(outputs);
	}
}
// export const _documents = new ResourceMap<ExtHostNotebookDocumentData>();

// export function addNotebookDocument(notebook: ExtHostNotebookDocumentData) {
// 	_documents.set(notebook.uri, notebook);
// }

// export function getNotebookDocuments(): vscode.NotebookDocument[] {
// 	return Array.from(_documents.values()).map(data => data.document);
// }
