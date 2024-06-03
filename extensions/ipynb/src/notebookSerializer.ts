/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as nbformat from '@jupyterlab/nbformat';
import * as detectIndent from 'detect-indent';
import * as vscode from 'vscode';
import { defaultNotebookFormat } from './constants';
import { getPreferredLanguage, jupyterNotebookModelToNotebookData } from './deserializers';
import { createJupyterCellFromNotebookCell, pruneCell, sortObjectPropertiesRecursively } from './serializers';
import * as fnv from '@enonic/fnv-plus';
import { useCustomPropertyInMetadata } from './common';

export class NotebookSerializer implements vscode.NotebookSerializer {
	constructor(readonly context: vscode.ExtensionContext) {
	}

	public async deserializeNotebook(content: Uint8Array, _token: vscode.CancellationToken): Promise<vscode.NotebookData> {
		let contents = '';
		try {
			contents = new TextDecoder().decode(content);
		} catch {
		}

		let json = contents && /\S/.test(contents) ? (JSON.parse(contents) as Partial<nbformat.INotebookContent>) : {};

		if (json.__webview_backup) {
			const backupId = json.__webview_backup;
			const uri = this.context.globalStorageUri;
			const folder = uri.with({ path: this.context.globalStorageUri.path.replace('vscode.ipynb', 'ms-toolsai.jupyter') });
			const fileHash = fnv.fast1a32hex(backupId) as string;
			const fileName = `${fileHash}.ipynb`;
			const file = vscode.Uri.joinPath(folder, fileName);
			const data = await vscode.workspace.fs.readFile(file);
			json = data ? JSON.parse(data.toString()) : {};

			if (json.contents && typeof json.contents === 'string') {
				contents = json.contents;
				json = JSON.parse(contents) as Partial<nbformat.INotebookContent>;
			}
		}

		if (json.nbformat && json.nbformat < 4) {
			throw new Error('Only Jupyter notebooks version 4+ are supported');
		}

		// Then compute indent from the contents (only use first 1K characters as a perf optimization)
		const indentAmount = contents ? detectIndent(contents.substring(0, 1_000)).indent : ' ';

		const preferredCellLanguage = getPreferredLanguage(json.metadata);
		// Ensure we always have a blank cell.
		if ((json.cells || []).length === 0) {
			json.cells = [
				{
					cell_type: 'code',
					execution_count: null,
					metadata: {},
					outputs: [],
					source: ''
				}
			];
		}

		// For notebooks without metadata default the language in metadata to the preferred language.
		if (!json.metadata || (!json.metadata.kernelspec && !json.metadata.language_info)) {
			json.metadata = json.metadata || {};
			json.metadata.language_info = json.metadata.language_info || { name: preferredCellLanguage };
		}

		const data = jupyterNotebookModelToNotebookData(
			json,
			preferredCellLanguage
		);
		data.metadata = data.metadata || {};
		data.metadata.indentAmount = indentAmount;

		return data;
	}

	public async serializeNotebook(data: vscode.NotebookData, _token: vscode.CancellationToken): Promise<Uint8Array> {
		return new TextEncoder().encode(await this.serializeNotebookToString(data));
	}

	public async serializeNotebookToString(data: vscode.NotebookData): Promise<string> {
		const notebookContent = getNotebookMetadata(data);
		// use the preferred language from document metadata or the first cell language as the notebook preferred cell language
		const preferredCellLanguage = notebookContent.metadata?.language_info?.name ?? data.cells.find(cell => cell.kind === vscode.NotebookCellKind.Code)?.languageId;

		notebookContent.cells = data.cells
			.map(cell => createJupyterCellFromNotebookCell(cell, preferredCellLanguage))
			.map(pruneCell);

		const indentAmount = data.metadata && 'indentAmount' in data.metadata && typeof data.metadata.indentAmount === 'string' ?
			data.metadata.indentAmount :
			' ';

		const startTime = performance.now();

		// Your existing code here

		// ipynb always ends with a trailing new line (we add this so that SCMs do not show unnecessary changes, resulting from a missing trailing new line).
		const orderedObject = sortObjectPropertiesRecursively(notebookContent);
		console.log(`Sort object - Elapsed time: ${performance.now() - startTime} milliseconds`);

		const stringified = JSON.stringify(orderedObject, undefined, indentAmount) + '\n';
		console.log(`JSON.stringify'd - Elapsed time: ${performance.now() - startTime} milliseconds`);

		let result = '{\n';
		let outerFirst = true;
		for (const key of Object.keys(orderedObject)) {
			if (!outerFirst) {
				result += ',\n';
			}
			outerFirst = false;
			if (key === 'cells') {
				result += `${indentAmount}"${key}": [\n`;
				let first = true;
				for (const cell of orderedObject[key]) {
					if (!first) {
						result += ',\n';
					}
					first = false;
					result += `${indentAmount}${indentAmount}${JSON.stringify(cell, undefined, indentAmount)}`;
					await new Promise(resolve => setTimeout(resolve, 0));
				}
				result += `${indentAmount}]`;
			} else {
				result += `${indentAmount}"${key}": ${JSON.stringify(orderedObject[key], undefined, indentAmount)}`;
			}
		}
		result += '}';
		console.log(`iter stringified - Elapsed time: ${performance.now() - startTime} milliseconds`);

		return result;
	}
}

export function getNotebookMetadata(document: vscode.NotebookDocument | vscode.NotebookData) {
	const existingContent: Partial<nbformat.INotebookContent> = (useCustomPropertyInMetadata() ? document.metadata?.custom : document.metadata) || {};
	const notebookContent: Partial<nbformat.INotebookContent> = {};
	notebookContent.cells = existingContent.cells || [];
	notebookContent.nbformat = existingContent.nbformat || defaultNotebookFormat.major;
	notebookContent.nbformat_minor = existingContent.nbformat_minor ?? defaultNotebookFormat.minor;
	notebookContent.metadata = existingContent.metadata || {};
	return notebookContent;
}
