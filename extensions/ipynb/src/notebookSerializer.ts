/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { nbformat } from '@jupyterlab/coreutils';
import * as detectIndent from 'detect-indent';
import * as vscode from 'vscode';
import { defaultNotebookFormat } from './constants';
import { getPreferredLanguage, jupyterNotebookModelToNotebookData } from './deserializers';
import { createJupyterCellFromNotebookCell, pruneCell } from './serializers';
import * as fnv from '@enonic/fnv-plus';

export class NotebookSerializer implements vscode.NotebookSerializer {
	constructor(readonly context: vscode.ExtensionContext) {
	}

	public async deserializeNotebook(content: Uint8Array, _token: vscode.CancellationToken): Promise<vscode.NotebookData> {
		let contents = '';
		try {
			contents = new TextDecoder().decode(content);
		} catch {
		}

		let json = contents ? (JSON.parse(contents) as Partial<nbformat.INotebookContent>) : {};

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

		// Then compute indent from the contents
		const indentAmount = contents ? detectIndent(contents).indent : ' ';

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
			json.metadata = json.metadata || { orig_nbformat: defaultNotebookFormat.major };
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

	public serializeNotebook(data: vscode.NotebookData, _token: vscode.CancellationToken): Uint8Array {
		return new TextEncoder().encode(this.serializeNotebookToString(data));
	}

	public serializeNotebookToString(data: vscode.NotebookData): string {
		const notebookContent: Partial<nbformat.INotebookContent> = data.metadata?.custom || {};
		notebookContent.cells = notebookContent.cells || [];
		notebookContent.nbformat = notebookContent.nbformat || 4;
		notebookContent.nbformat_minor = notebookContent.nbformat_minor || 2;
		notebookContent.metadata = notebookContent.metadata || { orig_nbformat: 4 };

		notebookContent.cells = data.cells
			.map(cell => createJupyterCellFromNotebookCell(cell))
			.map(pruneCell);

		const indentAmount = data.metadata && 'indentAmount' in data.metadata && typeof data.metadata.indentAmount === 'string' ?
			data.metadata.indentAmount :
			' ';
		return JSON.stringify(notebookContent, undefined, indentAmount);
	}
}
