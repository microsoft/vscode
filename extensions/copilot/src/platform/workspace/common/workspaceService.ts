/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event, FileSystem, NotebookData, NotebookDocument, NotebookDocumentChangeEvent, ResourceTrustRequestOptions, TextDocument, TextDocumentChangeEvent, TextEditorSelectionChangeEvent, Uri, WorkspaceEdit, WorkspaceFolder, WorkspaceFoldersChangeEvent, WorkspaceTrustRequestOptions } from 'vscode';
import { findNotebook } from '../../../util/common/notebooks';
import { createServiceIdentifier } from '../../../util/common/services';
import { Emitter } from '../../../util/vs/base/common/event';
import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import * as path from '../../../util/vs/base/common/path';
import { extUriBiasedIgnorePathCase, relativePath } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { NotebookDocumentSnapshot } from '../../editing/common/notebookDocumentSnapshot';
import { TextDocumentSnapshot } from '../../editing/common/textDocumentSnapshot';

export const IWorkspaceService = createServiceIdentifier<IWorkspaceService>('IWorkspaceService');

export interface IWorkspaceService {
	readonly _serviceBrand: undefined;
	textDocuments: readonly TextDocument[];
	notebookDocuments: readonly NotebookDocument[];
	readonly onDidOpenTextDocument: Event<TextDocument>;
	readonly onDidCloseTextDocument: Event<TextDocument>;
	readonly onDidOpenNotebookDocument: Event<NotebookDocument>;
	readonly onDidCloseNotebookDocument: Event<NotebookDocument>;
	readonly onDidChangeTextDocument: Event<TextDocumentChangeEvent>;
	readonly onDidChangeNotebookDocument: Event<NotebookDocumentChangeEvent>;
	readonly onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent>;
	readonly onDidChangeTextEditorSelection: Event<TextEditorSelectionChangeEvent>;
	openTextDocument(uri: Uri): Promise<TextDocument>;
	fs: FileSystem;
	showTextDocument(document: TextDocument): Promise<void>;
	openTextDocumentAndSnapshot(uri: Uri): Promise<TextDocumentSnapshot>;
	openNotebookDocumentAndSnapshot(uri: Uri, format: 'xml' | 'json' | 'text'): Promise<NotebookDocumentSnapshot>;
	openNotebookDocument(uri: Uri): Promise<NotebookDocument>;
	openNotebookDocument(notebookType: string, content?: NotebookData): Promise<NotebookDocument>;
	getWorkspaceFolders(): URI[];
	getWorkspaceFolder(resource: URI): URI | undefined;
	getWorkspaceFolderName(workspaceFolderUri: URI): string;
	showWorkspaceFolderPicker(): Promise<WorkspaceFolder | undefined>;

	asRelativePath(pathOrUri: string | Uri, includeWorkspaceFolder?: boolean): string;
	applyEdit(edit: WorkspaceEdit): Thenable<boolean>;

	/**
	 * Ensures that the workspace has fully loaded before returning. This is useful for
	 * virtual workspaces where we need to ensure that the contents of the workspace
	 * has been downloaded before we can use them.
	 */
	ensureWorkspaceIsFullyLoaded(): Promise<void>;
	requestResourceTrust(options: ResourceTrustRequestOptions): Thenable<boolean | undefined>;
	requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Thenable<boolean | undefined>;
}

export abstract class AbstractWorkspaceService implements IWorkspaceService {
	declare readonly _serviceBrand: undefined;
	abstract textDocuments: readonly TextDocument[];
	abstract notebookDocuments: readonly NotebookDocument[];
	abstract readonly onDidOpenTextDocument: Event<TextDocument>;
	abstract readonly onDidCloseTextDocument: Event<TextDocument>;
	abstract readonly onDidOpenNotebookDocument: Event<NotebookDocument>;
	abstract readonly onDidCloseNotebookDocument: Event<NotebookDocument>;
	abstract readonly onDidChangeTextDocument: Event<TextDocumentChangeEvent>;
	abstract readonly onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent>;
	abstract readonly onDidChangeNotebookDocument: Event<NotebookDocumentChangeEvent>;
	abstract readonly onDidChangeTextEditorSelection: Event<TextEditorSelectionChangeEvent>;
	abstract openTextDocument(uri: Uri): Promise<TextDocument>;
	abstract fs: FileSystem;
	abstract showTextDocument(document: TextDocument): Promise<void>;
	abstract openNotebookDocument(uri: Uri): Promise<NotebookDocument>;
	abstract openNotebookDocument(notebookType: string, content?: NotebookData): Promise<NotebookDocument>;
	abstract getWorkspaceFolders(): URI[];
	abstract ensureWorkspaceIsFullyLoaded(): Promise<void>;
	abstract showWorkspaceFolderPicker(): Promise<WorkspaceFolder | undefined>;
	abstract getWorkspaceFolderName(workspaceFolderUri: URI): string;
	abstract applyEdit(edit: WorkspaceEdit): Thenable<boolean>;
	abstract requestResourceTrust(options: ResourceTrustRequestOptions): Thenable<boolean | undefined>;
	abstract requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Thenable<boolean | undefined>;

	asRelativePath(pathOrUri: string | Uri, includeWorkspaceFolder?: boolean): string {
		// Copied from the implementation in vscode/extHostWorkspace.ts
		let resource: URI | undefined;
		let path: string = '';
		if (typeof pathOrUri === 'string') {
			resource = URI.file(pathOrUri);
			path = pathOrUri;
		} else if (typeof pathOrUri !== 'undefined') {
			resource = pathOrUri;
			path = pathOrUri.fsPath;
		}

		if (!resource) {
			return path;
		}

		const folder = this.getWorkspaceFolder(resource);

		if (!folder) {
			return path;
		}

		if (typeof includeWorkspaceFolder === 'undefined') {
			includeWorkspaceFolder = this.getWorkspaceFolders().length > 1;
		}

		let result = relativePath(folder, resource);
		if (includeWorkspaceFolder) {
			const name = this.getWorkspaceFolderName(folder);
			result = `${name}/${result}`;
		}
		return result!;
	}

	async openTextDocumentAndSnapshot(uri: Uri): Promise<TextDocumentSnapshot> {
		const doc = await this.openTextDocument(uri);
		return TextDocumentSnapshot.create(doc);
	}

	async openNotebookDocumentAndSnapshot(uri: Uri, format: 'xml' | 'json' | 'text'): Promise<NotebookDocumentSnapshot> {
		// Possible we have an untitled file opened as a notebook.
		const doc = findNotebook(uri, this.notebookDocuments) || await this.openNotebookDocument(uri);

		return NotebookDocumentSnapshot.create(doc, format);
	}

	getWorkspaceFolder(resource: URI): URI | undefined {
		return this.getWorkspaceFolders().find(folder => extUriBiasedIgnorePathCase.isEqualOrParent(resource, folder));
	}
}

export function getWorkspaceFileDisplayPath(workspaceService: IWorkspaceService, file: URI): string {
	const workspaceUri = workspaceService.getWorkspaceFolder(file);
	return workspaceUri ? path.posix.relative(workspaceUri.path, file.path) : file.path;
}

export class NullWorkspaceService extends AbstractWorkspaceService implements IDisposable {
	override fs!: FileSystem;
	private readonly disposables = new DisposableStore();

	public readonly didOpenTextDocumentEmitter = this.disposables.add(new Emitter<TextDocument>());
	public readonly didCloseTextDocumentEmitter = this.disposables.add(new Emitter<TextDocument>());
	public readonly didOpenNotebookDocumentEmitter = this.disposables.add(new Emitter<NotebookDocument>());
	public readonly didCloseNotebookDocumentEmitter = this.disposables.add(new Emitter<NotebookDocument>());
	public readonly didChangeTextDocumentEmitter = this.disposables.add(new Emitter<TextDocumentChangeEvent>());
	public readonly didChangeWorkspaceFoldersEmitter = this.disposables.add(new Emitter<WorkspaceFoldersChangeEvent>());
	public readonly didChangeNotebookDocumentEmitter = this.disposables.add(new Emitter<NotebookDocumentChangeEvent>());
	public readonly didChangeTextEditorSelectionEmitter = this.disposables.add(new Emitter<TextEditorSelectionChangeEvent>());

	public override readonly onDidChangeTextDocument = this.didChangeTextDocumentEmitter.event;
	public override readonly onDidCloseTextDocument = this.didCloseTextDocumentEmitter.event;
	public override readonly onDidOpenNotebookDocument = this.didOpenNotebookDocumentEmitter.event;
	public override readonly onDidCloseNotebookDocument = this.didCloseNotebookDocumentEmitter.event;
	public override readonly onDidOpenTextDocument = this.didOpenTextDocumentEmitter.event;
	public override readonly onDidChangeWorkspaceFolders = this.didChangeWorkspaceFoldersEmitter.event;
	public override readonly onDidChangeNotebookDocument = this.didChangeNotebookDocumentEmitter.event;
	public override readonly onDidChangeTextEditorSelection = this.didChangeTextEditorSelectionEmitter.event;

	private readonly workspaceFolder: URI[];
	private readonly _textDocuments: TextDocument[] = [];
	private readonly _notebookDocuments: NotebookDocument[] = [];

	constructor(workspaceFolders: URI[] = [], textDocuments: TextDocument[] = [], notebookDocuments: NotebookDocument[] = []) {
		super();
		this.workspaceFolder = workspaceFolders;
		this._textDocuments = textDocuments;
		this._notebookDocuments = notebookDocuments;
	}

	get textDocuments(): TextDocument[] {
		return this._textDocuments;
	}

	override showTextDocument(document: TextDocument): Promise<void> {
		return Promise.resolve();
	}

	override async openTextDocument(uri: Uri): Promise<TextDocument> {
		const doc = this.textDocuments.find(d => d.uri.toString() === uri.toString());
		if (doc) {
			return doc;
		}

		throw new Error(`Unknown document: ${uri}`);
	}

	override async openNotebookDocument(uri: Uri): Promise<NotebookDocument>;
	override async openNotebookDocument(notebookType: string, content?: NotebookData): Promise<NotebookDocument>;
	override async openNotebookDocument(arg1: Uri | string, arg2?: NotebookData): Promise<NotebookDocument> {
		if (typeof arg1 === 'string') {
			// Handle the overload for notebookType and content
			throw new Error('Not implemented');
		} else {
			const notebook = this.notebookDocuments.find(d => d.uri.toString() === arg1.toString());
			if (notebook) {
				return notebook;
			}

			throw new Error(`Unknown notebook: ${arg1}`);
		}
	}

	get notebookDocuments(): readonly NotebookDocument[] {
		return this._notebookDocuments;
	}

	getWorkspaceFolders(): URI[] {
		return this.workspaceFolder;
	}

	override getWorkspaceFolderName(workspaceFolderUri: URI): string {
		return 'default';
	}

	override ensureWorkspaceIsFullyLoaded(): Promise<void> {
		// We aren't using virtual workspaces here, so we can just return
		return Promise.resolve();
	}

	showWorkspaceFolderPicker(): Promise<undefined> {
		return Promise.resolve(undefined);
	}

	override applyEdit(): Promise<boolean> {
		return Promise.resolve(true);
	}

	public dispose() {
		this.disposables.dispose();
	}

	override requestResourceTrust(options: ResourceTrustRequestOptions): Thenable<boolean | undefined> {
		return Promise.resolve(true);
	}

	override requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Thenable<boolean | undefined> {
		return Promise.resolve(true);
	}
}
