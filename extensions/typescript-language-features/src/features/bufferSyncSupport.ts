/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { CancellationTokenSource, Disposable, EventEmitter, TextDocument, TextDocumentChangeEvent, TextDocumentContentChangeEvent, Uri, workspace } from 'vscode';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { Delayer } from '../utils/async';
import { disposeAll } from '../utils/dispose';
import * as languageModeIds from '../utils/languageModeIds';
import * as typeConverters from '../utils/typeConverters';
import { ResourceMap } from './resourceMap';

enum BufferKind {
	TypeScript = 1,
	JavaScript = 2,
}

function mode2ScriptKind(mode: string): 'TS' | 'TSX' | 'JS' | 'JSX' | undefined {
	switch (mode) {
		case languageModeIds.typescript: return 'TS';
		case languageModeIds.typescriptreact: return 'TSX';
		case languageModeIds.javascript: return 'JS';
		case languageModeIds.javascriptreact: return 'JSX';
	}
	return undefined;
}

class SyncedBuffer {

	constructor(
		private readonly document: TextDocument,
		public readonly filepath: string,
		private readonly client: ITypeScriptServiceClient
	) { }

	public open(): void {
		const args: Proto.OpenRequestArgs = {
			file: this.filepath,
			fileContent: this.document.getText(),
		};

		if (this.client.apiVersion.gte(API.v203)) {
			const scriptKind = mode2ScriptKind(this.document.languageId);
			if (scriptKind) {
				args.scriptKindName = scriptKind;
			}
		}

		if (this.client.apiVersion.gte(API.v230)) {
			args.projectRootPath = this.client.getWorkspaceRootForResource(this.document.uri);
		}

		if (this.client.apiVersion.gte(API.v240)) {
			const tsPluginsForDocument = this.client.plugins
				.filter(x => x.languages.indexOf(this.document.languageId) >= 0);

			if (tsPluginsForDocument.length) {
				(args as any).plugins = tsPluginsForDocument.map(plugin => plugin.name);
			}
		}

		this.client.execute('open', args, false);
	}

	public get resource(): Uri {
		return this.document.uri;
	}

	public get lineCount(): number {
		return this.document.lineCount;
	}

	public get kind(): BufferKind {
		switch (this.document.languageId) {
			case languageModeIds.javascript:
			case languageModeIds.javascriptreact:
				return BufferKind.JavaScript;

			case languageModeIds.typescript:
			case languageModeIds.typescriptreact:
			default:
				return BufferKind.TypeScript;
		}
	}

	public close(): void {
		const args: Proto.FileRequestArgs = {
			file: this.filepath
		};
		this.client.execute('close', args, false);
	}

	public onContentChanged(events: TextDocumentContentChangeEvent[]): void {
		for (const { range, text } of events) {
			const args: Proto.ChangeRequestArgs = {
				insertString: text,
				...typeConverters.Range.toFormattingRequestArgs(this.filepath, range)
			};
			this.client.execute('change', args, false);
		}
	}
}

class SyncedBufferMap extends ResourceMap<SyncedBuffer> {

	public getForPath(filePath: string): SyncedBuffer | undefined {
		return this.get(Uri.file(filePath));
	}

	public get allBuffers(): Iterable<SyncedBuffer> {
		return this.values;
	}

	public get allResources(): Iterable<string> {
		return this.keys;
	}
}

class PendingDiagnostics {
	private readonly _pendingDiagnostics = new Map<string, number>();

	public set(file: string, time: number): void {
		this._pendingDiagnostics.set(file, time);
	}

	public has(file: string): boolean {
		return this._pendingDiagnostics.has(file);
	}

	public clear(): void {
		this._pendingDiagnostics.clear();
	}

	public getFileList(): Set<string> {
		return new Set(Array.from(this._pendingDiagnostics.entries())
			.sort((a, b) => a[1] - b[1])
			.map(entry => entry[0]));
	}
}

export default class BufferSyncSupport {

	private readonly client: ITypeScriptServiceClient;

	private _validateJavaScript: boolean = true;
	private _validateTypeScript: boolean = true;
	private readonly modeIds: Set<string>;
	private readonly disposables: Disposable[] = [];
	private readonly syncedBuffers: SyncedBufferMap;

	private readonly pendingDiagnostics = new PendingDiagnostics();
	private readonly diagnosticDelayer: Delayer<any>;
	private pendingGetErr: { request: Promise<any>, files: string[], token: CancellationTokenSource } | undefined;
	private listening: boolean = false;

	constructor(
		client: ITypeScriptServiceClient,
		modeIds: string[]
	) {
		this.client = client;
		this.modeIds = new Set<string>(modeIds);

		this.diagnosticDelayer = new Delayer<any>(300);

		this.syncedBuffers = new SyncedBufferMap(path => this.normalizePath(path));

		this.updateConfiguration();
		workspace.onDidChangeConfiguration(this.updateConfiguration, this, this.disposables);
	}

	private readonly _onDelete = new EventEmitter<Uri>();
	public readonly onDelete = this._onDelete.event;

	public listen(): void {
		if (this.listening) {
			return;
		}
		this.listening = true;
		workspace.onDidOpenTextDocument(this.openTextDocument, this, this.disposables);
		workspace.onDidCloseTextDocument(this.onDidCloseTextDocument, this, this.disposables);
		workspace.onDidChangeTextDocument(this.onDidChangeTextDocument, this, this.disposables);
		workspace.textDocuments.forEach(this.openTextDocument, this);
	}

	public handles(resource: Uri): boolean {
		return this.syncedBuffers.has(resource);
	}

	public toResource(filePath: string): Uri {
		const buffer = this.syncedBuffers.getForPath(filePath);
		if (buffer) {
			return buffer.resource;
		}
		return Uri.file(filePath);
	}

	public reOpenDocuments(): void {
		for (const buffer of this.syncedBuffers.allBuffers) {
			buffer.open();
		}
	}

	public dispose(): void {
		disposeAll(this.disposables);
		this._onDelete.dispose();
	}

	public openTextDocument(document: TextDocument): void {
		if (!this.modeIds.has(document.languageId)) {
			return;
		}
		const resource = document.uri;
		const filepath = this.client.normalizedPath(resource);
		if (!filepath) {
			return;
		}

		if (this.syncedBuffers.has(resource)) {
			return;
		}

		const syncedBuffer = new SyncedBuffer(document, filepath, this.client);
		this.syncedBuffers.set(resource, syncedBuffer);
		syncedBuffer.open();
		this.requestDiagnostic(resource);
	}

	public closeResource(resource: Uri): void {
		const syncedBuffer = this.syncedBuffers.get(resource);
		if (!syncedBuffer) {
			return;
		}
		this.syncedBuffers.delete(resource);
		syncedBuffer.close();
		if (!fs.existsSync(resource.fsPath)) {
			this._onDelete.fire(resource);
			this.requestAllDiagnostics();
		}
	}

	private onDidCloseTextDocument(document: TextDocument): void {
		this.closeResource(document.uri);
	}

	private onDidChangeTextDocument(e: TextDocumentChangeEvent): void {
		const syncedBuffer = this.syncedBuffers.get(e.document.uri);
		if (!syncedBuffer) {
			return;
		}

		syncedBuffer.onContentChanged(e.contentChanges);
		this.requestDiagnostic(syncedBuffer.resource);

		if (this.pendingGetErr) {
			this.pendingGetErr.token.cancel();
			this.pendingGetErr = undefined;

			this.triggerDiagnostics();
		}
	}

	public requestAllDiagnostics() {
		for (const buffer of this.syncedBuffers.allBuffers) {
			if (this.shouldValidate(buffer)) {
				this.pendingDiagnostics.set(buffer.filepath, Date.now());
			}
		}
		this.triggerDiagnostics();
	}

	public getErr(resources: Uri[]): any {
		const handledResources = resources.filter(resource => this.handles(resource));
		if (!handledResources.length) {
			return;
		}

		for (const resource of handledResources) {
			const file = this.client.normalizedPath(resource);
			if (file) {
				this.pendingDiagnostics.set(file, Date.now());
			}
		}

		this.triggerDiagnostics();
	}

	private triggerDiagnostics(delay: number = 200) {
		this.diagnosticDelayer.trigger(() => {
			this.sendPendingDiagnostics();
		}, delay);
	}

	public requestDiagnostic(resource: Uri): void {
		const file = this.client.normalizedPath(resource);
		if (!file) {
			return;
		}

		this.pendingDiagnostics.set(file, Date.now());
		const buffer = this.syncedBuffers.get(resource);
		if (!buffer || !this.shouldValidate(buffer)) {
			return;
		}

		const lineCount = buffer.lineCount;
		const delay = Math.min(Math.max(Math.ceil(lineCount / 20), 300), 800);
		this.triggerDiagnostics(delay);
	}

	public hasPendingDiagnostics(resource: Uri): boolean {
		const file = this.client.normalizedPath(resource);
		return !file || this.pendingDiagnostics.has(file);
	}

	private sendPendingDiagnostics(): void {
		const fileList = this.pendingDiagnostics.getFileList();

		// Add all open TS buffers to the geterr request. They might be visible
		for (const file of this.syncedBuffers.allResources) {
			if (!this.pendingDiagnostics.has(file)) {
				fileList.add(file);
			}
		}

		if (this.pendingGetErr) {
			for (const file of this.pendingGetErr.files) {
				fileList.add(file);
			}
		}

		if (fileList.size) {
			const files = Array.from(fileList);
			const args: Proto.GeterrRequestArgs = {
				delay: 0,
				files
			};
			const token = new CancellationTokenSource();

			const getErr = this.pendingGetErr = {
				request: this.client.executeAsync('geterr', args, token.token)
					.then(undefined, () => { })
					.then(() => {
						if (this.pendingGetErr === getErr) {
							this.pendingGetErr = undefined;
						}
					}),
				files,
				token
			};
		}
		this.pendingDiagnostics.clear();
	}

	private updateConfiguration() {
		const jsConfig = workspace.getConfiguration('javascript', null);
		const tsConfig = workspace.getConfiguration('typescript', null);

		this._validateJavaScript = jsConfig.get<boolean>('validate.enable', true);
		this._validateTypeScript = tsConfig.get<boolean>('validate.enable', true);
	}

	private shouldValidate(buffer: SyncedBuffer) {
		switch (buffer.kind) {
			case BufferKind.JavaScript:
				return this._validateJavaScript;

			case BufferKind.TypeScript:
			default:
				return this._validateTypeScript;
		}
	}

	private normalizePath(path: Uri): string | null {
		return this.client.normalizedPath(path);
	}
}
