/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { workspace, TextDocument, TextDocumentChangeEvent, TextDocumentContentChangeEvent, Disposable } from 'vscode';
import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';
import { Delayer } from '../utils/async';

interface IDiagnosticRequestor {
	requestDiagnostic(filepath: string): void;
}

class SyncedBuffer {

	private document: TextDocument;
	private filepath: string;
	private diagnosticRequestor: IDiagnosticRequestor;
	private client: ITypescriptServiceClient;

	constructor(document: TextDocument, filepath: string, diagnosticRequestor: IDiagnosticRequestor, client: ITypescriptServiceClient) {
		this.document = document;
		this.filepath = filepath;
		this.diagnosticRequestor = diagnosticRequestor;
		this.client = client;
	}

	public open(): void {
		let args: Proto.OpenRequestArgs = {
			file: this.filepath,
			fileContent: this.document.getText()
		};
		this.client.execute('open', args, false);
	}

	public close(): void {
		let args: Proto.FileRequestArgs = {
			file: this.filepath
		};
		this.client.execute('close', args, false);
	}

	onContentChanged(events: TextDocumentContentChangeEvent[]): void {
		let filePath = this.client.asAbsolutePath(this.document.uri);
		if (!filePath) {
			return;
		}

		for (let i = 0; i < events.length; i++) {
			let event = events[i];
			let range = event.range;
			let text = event.text;
			let args: Proto.ChangeRequestArgs = {
				file: filePath,
				line: range.start.line + 1,
				offset: range.start.character + 1,
				endLine: range.end.line + 1,
				endOffset: range.end.character + 1,
				insertString: text
			};
			this.client.execute('change', args, false);
		}
		this.diagnosticRequestor.requestDiagnostic(filePath);
	}
}

export interface Diagnostics {
	delete(file: string): void;
}

export default class BufferSyncSupport {

	private client: ITypescriptServiceClient;

	private _validate: boolean;
	private modeIds: Map<boolean>;
	private extensions: Map<boolean>;
	private diagnostics: Diagnostics;
	private disposables: Disposable[] = [];
	private syncedBuffers: Map<SyncedBuffer>;

	private projectValidationRequested: boolean;

	private pendingDiagnostics: { [key: string]: number; };
	private diagnosticDelayer: Delayer<any>;

	constructor(client: ITypescriptServiceClient, modeIds: string[], diagnostics: Diagnostics, extensions: Map<boolean>, validate: boolean = true) {
		this.client = client;
		this.modeIds = Object.create(null);
		modeIds.forEach(modeId => this.modeIds[modeId] = true);
		this.diagnostics = diagnostics;
		this.extensions = extensions;
		this._validate = validate;

		this.projectValidationRequested = false;

		this.pendingDiagnostics = Object.create(null);
		this.diagnosticDelayer = new Delayer<any>(100);

		this.syncedBuffers = Object.create(null);
	}

	public listen(): void {
		workspace.onDidOpenTextDocument(this.onDidOpenTextDocument, this, this.disposables);
		workspace.onDidCloseTextDocument(this.onDidCloseTextDocument, this, this.disposables);
		workspace.onDidChangeTextDocument(this.onDidChangeTextDocument, this, this.disposables);
		workspace.textDocuments.forEach(this.onDidOpenTextDocument, this);
	}

	public get validate(): boolean {
		return this._validate;
	}

	public set validate(value: boolean) {
		this._validate = value;
	}

	public handles(file: string): boolean {
		return !!this.syncedBuffers[file];
	}

	public reOpenDocuments(): void {
		Object.keys(this.syncedBuffers).forEach(key => {
			this.syncedBuffers[key].open();
		});
	}

	public dispose(): void {
		while (this.disposables.length) {
			this.disposables.pop().dispose();
		}
	}

	private onDidOpenTextDocument(document: TextDocument): void {
		if (!this.modeIds[document.languageId]) {
			return;
		}
		if (document.isUntitled) {
			return;
		}
		let resource = document.uri;
		let filepath = this.client.asAbsolutePath(resource);
		if (!filepath) {
			return;
		}
		let syncedBuffer = new SyncedBuffer(document, filepath, this, this.client);
		this.syncedBuffers[filepath] = syncedBuffer;
		syncedBuffer.open();
		this.requestDiagnostic(filepath);
	}

	private onDidCloseTextDocument(document: TextDocument): void {
		let filepath: string = this.client.asAbsolutePath(document.uri);
		if (!filepath) {
			return;
		}
		let syncedBuffer = this.syncedBuffers[filepath];
		if (!syncedBuffer) {
			return;
		}
		this.diagnostics.delete(filepath);
		delete this.syncedBuffers[filepath];
		syncedBuffer.close();
	}

	private onDidChangeTextDocument(e: TextDocumentChangeEvent): void {
		let filepath: string = this.client.asAbsolutePath(e.document.uri);
		if (!filepath) {
			return;
		}
		let syncedBuffer = this.syncedBuffers[filepath];
		if (!syncedBuffer) {
			return;
		}
		syncedBuffer.onContentChanged(e.contentChanges);
	}

	public requestAllDiagnostics() {
		if (!this._validate) {
			return;
		}
		Object.keys(this.syncedBuffers).forEach(filePath => this.pendingDiagnostics[filePath] = Date.now());
		this.diagnosticDelayer.trigger(() => {
			this.sendPendingDiagnostics();
		});
	}

	public requestDiagnostic(file: string): void {
		if (!this._validate || this.client.experimentalAutoBuild) {
			return;
		}

		this.pendingDiagnostics[file] = Date.now();
		this.diagnosticDelayer.trigger(() => {
			this.sendPendingDiagnostics();
		});
	}

	private sendPendingDiagnostics(): void {
		if (!this._validate) {
			return;
		}
		let files = Object.keys(this.pendingDiagnostics).map((key) => {
			return {
				file: key,
				time: this.pendingDiagnostics[key]
			};
		}).sort((a, b) => {
			return a.time - b.time;
		}).map((value) => {
			return value.file;
		});

		// Add all open TS buffers to the geterr request. They might be visible
		Object.keys(this.syncedBuffers).forEach((file) => {
			if (!this.pendingDiagnostics[file]) {
				files.push(file);
			}
		});

		let args: Proto.GeterrRequestArgs = {
			delay: 0,
			files: files
		};
		this.client.execute('geterr', args, false);
		this.pendingDiagnostics = Object.create(null);
	}
}