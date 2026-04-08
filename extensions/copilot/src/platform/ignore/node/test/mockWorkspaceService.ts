/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FileSystem, NotebookData, NotebookDocument, NotebookDocumentChangeEvent, ResourceTrustRequestOptions, TextDocument, TextDocumentChangeEvent, TextEditorSelectionChangeEvent, WorkspaceEdit, WorkspaceFolder, WorkspaceFoldersChangeEvent, WorkspaceTrustRequestOptions } from 'vscode';
import { Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { NotebookDocumentSnapshot } from '../../../editing/common/notebookDocumentSnapshot';
import { TextDocumentSnapshot } from '../../../editing/common/textDocumentSnapshot';
import { IWorkspaceService } from '../../../workspace/common/workspaceService';

/**
 * A minimal mock implementation of IWorkspaceService for testing.
 */
export class MockWorkspaceService implements IWorkspaceService {
	declare readonly _serviceBrand: undefined;

	textDocuments: readonly TextDocument[] = [];
	notebookDocuments: readonly NotebookDocument[] = [];

	readonly onDidOpenTextDocument: Event<TextDocument> = Event.None;
	readonly onDidCloseTextDocument: Event<TextDocument> = Event.None;
	readonly onDidOpenNotebookDocument: Event<NotebookDocument> = Event.None;
	readonly onDidCloseNotebookDocument: Event<NotebookDocument> = Event.None;
	readonly onDidChangeTextDocument: Event<TextDocumentChangeEvent> = Event.None;
	readonly onDidChangeNotebookDocument: Event<NotebookDocumentChangeEvent> = Event.None;
	readonly onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent> = Event.None;
	readonly onDidChangeTextEditorSelection: Event<TextEditorSelectionChangeEvent> = Event.None;

	private _workspaceFolders: URI[] = [];

	fs: FileSystem = {} as FileSystem;

	/**
	 * Sets the workspace folders to return from getWorkspaceFolders.
	 */
	setWorkspaceFolders(folders: URI[]): void {
		this._workspaceFolders = folders;
	}

	getWorkspaceFolders(): URI[] {
		return this._workspaceFolders;
	}

	getWorkspaceFolder(_resource: URI): URI | undefined {
		return this._workspaceFolders[0];
	}

	getWorkspaceFolderName(_workspaceFolderUri: URI): string {
		return 'test-workspace';
	}

	openTextDocument(_uri: URI): Promise<TextDocument> {
		return Promise.reject(new Error('Not implemented'));
	}

	showTextDocument(_document: TextDocument): Promise<void> {
		return Promise.resolve();
	}

	openTextDocumentAndSnapshot(_uri: URI): Promise<TextDocumentSnapshot> {
		return Promise.reject(new Error('Not implemented'));
	}

	openNotebookDocumentAndSnapshot(_uri: URI, _format: 'xml' | 'json' | 'text'): Promise<NotebookDocumentSnapshot> {
		return Promise.reject(new Error('Not implemented'));
	}

	openNotebookDocument(_uriOrType: URI | string, _content?: NotebookData): Promise<NotebookDocument> {
		return Promise.reject(new Error('Not implemented'));
	}

	showWorkspaceFolderPicker(): Promise<WorkspaceFolder | undefined> {
		return Promise.resolve(undefined);
	}

	asRelativePath(_pathOrUri: string | URI, _includeWorkspaceFolder?: boolean): string {
		return '';
	}

	applyEdit(_edit: WorkspaceEdit): Thenable<boolean> {
		return Promise.resolve(true);
	}

	ensureWorkspaceIsFullyLoaded(): Promise<void> {
		return Promise.resolve();
	}

	requestResourceTrust(_options: ResourceTrustRequestOptions): Thenable<boolean | undefined> {
		return Promise.resolve(true);
	}

	requestWorkspaceTrust(_options?: WorkspaceTrustRequestOptions): Thenable<boolean | undefined> {
		return Promise.resolve(true);
	}
}
