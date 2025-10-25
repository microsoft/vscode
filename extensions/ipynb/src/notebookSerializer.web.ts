/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DeferredPromise, generateUuid } from './helper';
import { NotebookSerializerBase } from './notebookSerializer';

export class NotebookSerializer extends NotebookSerializerBase {
	private experimentalSave = vscode.workspace.getConfiguration('ipynb').get('experimental.serialization', true);
	private worker?: Worker;
	private tasks = new Map<string, DeferredPromise<Uint8Array>>();

	constructor(context: vscode.ExtensionContext) {
		super(context);
		context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('ipynb.experimental.serialization')) {
				this.experimentalSave = vscode.workspace.getConfiguration('ipynb').get('experimental.serialization', true);
			}
		}));
	}

	override dispose() {
		try {
			void this.worker?.terminate();
		} catch {
			//
		}
		super.dispose();
	}

	public override async serializeNotebook(data: vscode.NotebookData, token: vscode.CancellationToken): Promise<Uint8Array> {
		if (this.disposed) {
			return new Uint8Array(0);
		}

		if (this.experimentalSave) {
			return this.serializeViaWorker(data);
		}

		return super.serializeNotebook(data, token);
	}

	private async startWorker() {
		if (this.disposed) {
			throw new Error('Serializer disposed');
		}
		if (this.worker) {
			return this.worker;
		}
		const entry = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'browser', 'notebookSerializerWorker.js');
		this.worker = new Worker(entry.toString());
		this.worker.addEventListener('exit', (exitCode) => {
			if (!this.disposed) {
				console.error(`IPynb Notebook Serializer Worker exited unexpectedly`, exitCode);
			}
			this.worker = undefined;
		});
		this.worker.onmessage = (e) => {
			const result = e.data as { id: string; data: Uint8Array };
			const task = this.tasks.get(result.id);
			if (task) {
				task.complete(result.data);
				this.tasks.delete(result.id);
			}
		};
		this.worker.onerror = (err) => {
			if (!this.disposed) {
				console.error(`IPynb Notebook Serializer Worker errored unexpectedly`, err);
			}
		};
		return this.worker;
	}
	private async serializeViaWorker(data: vscode.NotebookData): Promise<Uint8Array> {
		const worker = await this.startWorker();
		const id = generateUuid();

		const deferred = new DeferredPromise<Uint8Array>();
		this.tasks.set(id, deferred);
		worker.postMessage({ data, id });

		return deferred.p;
	}
}
