/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import * as fs from 'fs';

import { workspace, TextDocument, TextDocumentChangeEvent, TextDocumentContentChangeEvent, Disposable } from 'vscode';
import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';
import { Delayer } from '../utils/async';
import LinkedMap from './linkedMap';

interface IDiagnosticRequestor {
	requestDiagnostic(filepath: string): void;
}

const Mode2ScriptKind: Map<'TS' | 'JS' | 'TSX' | 'JSX'> = {
	'typescript': 'TS',
	'typescriptreact': 'TSX',
	'javascript': 'JS',
	'javascriptreact': 'JSX'
};

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
			fileContent: this.document.getText(),
		};
		if (this.client.apiVersion.has203Features()) {
			// we have no extension. So check the mode and
			// set the script kind accordningly.
			const ext = path.extname(this.filepath);
			if (ext === '') {
				const scriptKind = Mode2ScriptKind[this.document.languageId];
				if (scriptKind) {
					args.scriptKindName = scriptKind;
				}
			}
		}
		this.client.execute('open', args, false);
	}

	public get lineCount(): number {
		return this.document.lineCount;
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
	private emitQueue: LinkedMap<string>;

	constructor(client: ITypescriptServiceClient, modeIds: string[], diagnostics: Diagnostics, extensions: Map<boolean>, validate: boolean = true) {
		this.client = client;
		this.modeIds = Object.create(null);
		modeIds.forEach(modeId => this.modeIds[modeId] = true);
		this.diagnostics = diagnostics;
		this.extensions = extensions;
		this._validate = validate;

		this.projectValidationRequested = false;

		this.pendingDiagnostics = Object.create(null);
		this.diagnosticDelayer = new Delayer<any>(300);

		this.syncedBuffers = Object.create(null);
		this.emitQueue = new LinkedMap<string>();
	}

	public listen(): void {
		workspace.onDidOpenTextDocument(this.onDidOpenTextDocument, this, this.disposables);
		workspace.onDidCloseTextDocument(this.onDidCloseTextDocument, this, this.disposables);
		workspace.onDidChangeTextDocument(this.onDidChangeTextDocument, this, this.disposables);
		workspace.onDidSaveTextDocument(this.onDidSaveTextDocument, this, this.disposables);
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
		if (!fs.existsSync(filepath)) {
			this.requestAllDiagnostics();
		}
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

	private onDidSaveTextDocument(document: TextDocument): void {
		let filepath: string = this.client.asAbsolutePath(document.uri);
		if (!filepath) {
			return;
		}
		let syncedBuffer = this.syncedBuffers[filepath];
		if (!syncedBuffer) {
			return;
		}
	}

	public requestAllDiagnostics() {
		if (!this._validate) {
			return;
		}
		Object.keys(this.syncedBuffers).forEach(filePath => this.pendingDiagnostics[filePath] = Date.now());
		this.diagnosticDelayer.trigger(() => {
			this.sendPendingDiagnostics();
		}, 200);
	}

	public requestDiagnostic(file: string): void {
		if (!this._validate || this.client.experimentalAutoBuild) {
			return;
		}

		this.pendingDiagnostics[file] = Date.now();
		let buffer = this.syncedBuffers[file];
		let delay = 300;
		if (buffer) {
			let lineCount = buffer.lineCount;
			delay = Math.min(Math.max(Math.ceil(lineCount / 20), 300), 800);
		}
		this.diagnosticDelayer.trigger(() => {
			this.sendPendingDiagnostics();
		}, delay);
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