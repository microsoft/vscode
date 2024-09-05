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
import { notebookSerializationWorkerData } from './common';

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

	private async serializeViaWorker(workerData: notebookSerializationWorkerData): Promise<string> {
		const workerThreads = await import('node:worker_threads');
		const path = await import('node:path');
		const { Worker } = workerThreads;

		return await new Promise((resolve, reject) => {
			const workerFile = path.join(__dirname, 'notebookSerializerWorker.js');
			const worker = new Worker(workerFile, { workerData });
			worker.on('message', resolve);
			worker.on('error', reject);
			worker.on('exit', (code) => {
				if (code !== 0) {
					reject(new Error(`Worker stopped with exit code ${code}`));
				}
			});
		});
	}

	private serializeNotebookToJSON(notebookContent: Partial<nbformat.INotebookContent>, indentAmount: string): Promise<string> {

		const isInNodeJSContext = typeof process !== 'undefined' && process.release && process.release.name === 'node';
		const experimentalSave = vscode.workspace.getConfiguration('ipynb').get('experimental.serialization', false);
		if (isInNodeJSContext && experimentalSave) {
			return this.serializeViaWorker({
				notebookContent,
				indentAmount
			});
		} else {
			// ipynb always ends with a trailing new line (we add this so that SCMs do not show unnecessary changes, resulting from a missing trailing new line).
			const sorted = sortObjectPropertiesRecursively(notebookContent);

			return Promise.resolve(JSON.stringify(sorted, undefined, indentAmount) + '\n');
		}
	}

	public serializeNotebookToString(data: vscode.NotebookData): Promise<string> {
		const notebookContent = getNotebookMetadata(data);
		// use the preferred language from document metadata or the first cell language as the notebook preferred cell language
		const preferredCellLanguage = notebookContent.metadata?.language_info?.name ?? data.cells.find(cell => cell.kind === vscode.NotebookCellKind.Code)?.languageId;

		notebookContent.cells = data.cells
			.map(cell => createJupyterCellFromNotebookCell(cell, preferredCellLanguage))
			.map(pruneCell);

		const indentAmount = data.metadata && 'indentAmount' in data.metadata && typeof data.metadata.indentAmount === 'string' ?
			data.metadata.indentAmount :
			' ';

		return this.serializeNotebookToJSON(notebookContent, indentAmount);
	}
}

export function getNotebookMetadata(document: vscode.NotebookDocument | vscode.NotebookData) {
	const existingContent: Partial<nbformat.INotebookContent> = document.metadata || {};
	const notebookContent: Partial<nbformat.INotebookContent> = {};
	notebookContent.cells = existingContent.cells || [];
	notebookContent.nbformat = existingContent.nbformat || defaultNotebookFormat.major;
	notebookContent.nbformat_minor = existingContent.nbformat_minor ?? defaultNotebookFormat.minor;
	notebookContent.metadata = existingContent.metadata || {};
	return notebookContent;
}
