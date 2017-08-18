/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

import { workspace, TextDocument, TextDocumentChangeEvent, TextDocumentContentChangeEvent, Disposable } from 'vscode';
import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';
import { Delayer } from '../utils/async';

interface IDiagnosticRequestor {
	requestDiagnostic(filepath: string): void;
}

function mode2ScriptKind(mode: string): 'TS' | 'TSX' | 'JS' | 'JSX' | undefined {
	switch (mode) {
		case 'typescript': return 'TS';
		case 'typescriptreact': return 'TSX';
		case 'javascript': return 'JS';
		case 'javascriptreact': return 'JSX';
	}
	return undefined;
}

class SyncedBuffer {

	constructor(
		private readonly document: TextDocument,
		private readonly filepath: string,
		private readonly diagnosticRequestor: IDiagnosticRequestor,
		private readonly client: ITypescriptServiceClient
	) { }

	public open(): void {
		const args: Proto.OpenRequestArgs = {
			file: this.filepath,
			fileContent: this.document.getText(),
		};

		if (this.client.apiVersion.has203Features()) {
			const scriptKind = mode2ScriptKind(this.document.languageId);
			if (scriptKind) {
				args.scriptKindName = scriptKind;
			}
		}

		if (this.client.apiVersion.has230Features()) {
			const root = this.client.getWorkspaceRootForResource(this.document.uri);
			if (root) {
				args.projectRootPath = root;
			}
		}

		if (this.client.apiVersion.has240Features()) {
			const tsPluginsForDocument = this.client.plugins
				.filter(x => x.languages.indexOf(this.document.languageId) >= 0);

			if (tsPluginsForDocument.length) {
				(args as any).plugins = tsPluginsForDocument.map(plugin => plugin.name);
			}
		}

		this.client.execute('open', args, false);
	}

	public get lineCount(): number {
		return this.document.lineCount;
	}

	public close(): void {
		const args: Proto.FileRequestArgs = {
			file: this.filepath
		};
		this.client.execute('close', args, false);
	}

	public onContentChanged(events: TextDocumentContentChangeEvent[]): void {
		const filePath = this.client.normalizePath(this.document.uri);
		if (!filePath) {
			return;
		}

		for (const event of events) {
			const range = event.range;
			const text = event.text;
			const args: Proto.ChangeRequestArgs = {
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

	private readonly client: ITypescriptServiceClient;

	private _validate: boolean;
	private readonly modeIds: Set<string>;
	private readonly diagnostics: Diagnostics;
	private readonly disposables: Disposable[] = [];
	private readonly syncedBuffers: Map<string, SyncedBuffer>;

	private pendingDiagnostics = new Map<string, number>();
	private readonly diagnosticDelayer: Delayer<any>;

	constructor(
		client: ITypescriptServiceClient,
		modeIds: string[],
		diagnostics: Diagnostics,
		validate: boolean
	) {
		this.client = client;
		this.modeIds = new Set<string>(modeIds);
		this.diagnostics = diagnostics;
		this._validate = validate;

		this.diagnosticDelayer = new Delayer<any>(300);

		this.syncedBuffers = new Map<string, SyncedBuffer>();
	}

	public listen(): void {
		workspace.onDidOpenTextDocument(this.onDidOpenTextDocument, this, this.disposables);
		workspace.onDidCloseTextDocument(this.onDidCloseTextDocument, this, this.disposables);
		workspace.onDidChangeTextDocument(this.onDidChangeTextDocument, this, this.disposables);
		workspace.textDocuments.forEach(this.onDidOpenTextDocument, this);
	}

	public set validate(value: boolean) {
		this._validate = value;
	}

	public handles(file: string): boolean {
		return this.syncedBuffers.has(file);
	}

	public reOpenDocuments(): void {
		for (const buffer of this.syncedBuffers.values()) {
			buffer.open();
		}
	}

	public dispose(): void {
		while (this.disposables.length) {
			const obj = this.disposables.pop();
			if (obj) {
				obj.dispose();
			}
		}
	}

	private onDidOpenTextDocument(document: TextDocument): void {
		if (!this.modeIds.has(document.languageId)) {
			return;
		}
		const resource = document.uri;
		const filepath = this.client.normalizePath(resource);
		if (!filepath) {
			return;
		}
		const syncedBuffer = new SyncedBuffer(document, filepath, this, this.client);
		this.syncedBuffers.set(filepath, syncedBuffer);
		syncedBuffer.open();
		this.requestDiagnostic(filepath);
	}

	private onDidCloseTextDocument(document: TextDocument): void {
		const filepath = this.client.normalizePath(document.uri);
		if (!filepath) {
			return;
		}
		const syncedBuffer = this.syncedBuffers.get(filepath);
		if (!syncedBuffer) {
			return;
		}
		this.diagnostics.delete(filepath);
		this.syncedBuffers.delete(filepath);
		syncedBuffer.close();
		if (!fs.existsSync(filepath)) {
			this.requestAllDiagnostics();
		}
	}

	private onDidChangeTextDocument(e: TextDocumentChangeEvent): void {
		const filepath = this.client.normalizePath(e.document.uri);
		if (!filepath) {
			return;
		}
		let syncedBuffer = this.syncedBuffers.get(filepath);
		if (!syncedBuffer) {
			return;
		}
		syncedBuffer.onContentChanged(e.contentChanges);
	}

	public requestAllDiagnostics() {
		if (!this._validate) {
			return;
		}
		for (const filePath of this.syncedBuffers.keys()) {
			this.pendingDiagnostics.set(filePath, Date.now());
		}
		this.diagnosticDelayer.trigger(() => {
			this.sendPendingDiagnostics();
		}, 200);
	}

	public requestDiagnostic(file: string): void {
		if (!this._validate) {
			return;
		}

		this.pendingDiagnostics.set(file, Date.now());
		const buffer = this.syncedBuffers.get(file);
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
		let files = Array.from(this.pendingDiagnostics.entries()).map(([key, value]) => {
			return {
				file: key,
				time: value
			};
		}).sort((a, b) => {
			return a.time - b.time;
		}).map((value) => {
			return value.file;
		});

		// Add all open TS buffers to the geterr request. They might be visible
		for (const file of this.syncedBuffers.keys()) {
			if (!this.pendingDiagnostics.get(file)) {
				files.push(file);
			}
		}

		if (files.length) {
			const args: Proto.GeterrRequestArgs = {
				delay: 0,
				files: files
			};
			this.client.execute('geterr', args, false);
		}
		this.pendingDiagnostics.clear();
	}
}