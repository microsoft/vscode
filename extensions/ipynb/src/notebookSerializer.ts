/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as nbformat from '@jupyterlab/nbformat';
import * as detectIndent from 'detect-indent';
import * as vscode from 'vscode';
import { getPreferredLanguage, jupyterNotebookModelToNotebookData } from './deserializers';
import * as fnv from '@enonic/fnv-plus';
import { DeferredPromise, generateUuid } from './helper';
import { serializeNotebookToString } from './serializers';

export class NotebookSerializer extends vscode.Disposable implements vscode.NotebookSerializer {
	private experimentalSave = vscode.workspace.getConfiguration('ipynb').get('experimental.serialization', false);
	private disposed: boolean = false;
	private worker?: import('node:worker_threads').Worker;
	private tasks = new Map<string, DeferredPromise<Uint8Array>>();

	constructor(readonly context: vscode.ExtensionContext, private readonly isBrowser: boolean) {
		super(() => { });
		context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('ipynb.experimental.serialization')) {
				this.experimentalSave = vscode.workspace.getConfiguration('ipynb').get('experimental.serialization', false);
			}
		}));
	}

	override dispose() {
		this.disposed = true;
		try {
			void this.worker?.terminate();
		} catch {
			//
		}
		super.dispose();
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
		if (this.disposed) {
			return new Uint8Array(0);
		}

		if (this.experimentalSave && !this.isBrowser) {
			return this.serializeViaWorker2(data);
		}
		const serialized = serializeNotebookToString(data);
		return new TextEncoder().encode(serialized);
	}

	private async startWorker() {
		if (this.disposed) {
			throw new Error('Serializer disposed');
		}
		if (this.worker) {
			return this.worker;
		}
		const { Worker } = await import('node:worker_threads');
		const outputDir = getOutputDir(this.context);
		this.worker = new Worker(vscode.Uri.joinPath(this.context.extensionUri, outputDir, 'notebookSerializerWorker.js').fsPath, {});
		this.worker.on('exit', (exitCode) => {
			if (!this.disposed) {
				console.error(`IPynb Notebook Serializer Worker exited unexpectedly`, exitCode);
			}
			this.worker = undefined;
		});
		this.worker.on('message', (result: { data: Uint8Array; id: string }) => {
			const task = this.tasks.get(result.id);
			if (task) {
				task.complete(result.data);
				this.tasks.delete(result.id);
			}
		});
		this.worker.on('error', (err) => {
			if (!this.disposed) {
				console.error(`IPynb Notebook Serializer Worker errored unexpectedly`, err);
			}
		});
		return this.worker;
	}
	private async serializeViaWorker2(data: vscode.NotebookData): Promise<Uint8Array> {
		const worker = await this.startWorker();
		const id = generateUuid();
		const start1 = performance.now();

		const deferred = new DeferredPromise<Uint8Array>();
		deferred.p.finally(() => {
			const time0 = performance.now() - start1;
			console.log(`Got Ba	ck Buffers`, time0);
		});
		this.tasks.set(id, deferred);
		worker.postMessage({ data, id });

		return deferred.p;
	}
}


function getOutputDir(context: vscode.ExtensionContext): string {
	const main = context.extension.packageJSON.main as string;
	return main.indexOf('/dist/') !== -1 ? 'dist' : 'out';
}
