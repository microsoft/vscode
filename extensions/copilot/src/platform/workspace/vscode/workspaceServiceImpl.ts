/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileSystem, NotebookData, NotebookDocument, ResourceTrustRequestOptions, TextDocument, Uri, window, workspace, WorkspaceFolder, WorkspaceTrustRequestOptions, type WorkspaceEdit } from 'vscode';
import { findNotebook } from '../../../util/common/notebooks';
import { URI } from '../../../util/vs/base/common/uri';
import { ILogService } from '../../log/common/logService';
import { isGitHubRemoteRepository } from '../../remoteRepositories/common/utils';
import { IRemoteRepositoriesService } from '../../remoteRepositories/vscode/remoteRepositories';
import { AbstractWorkspaceService } from '../common/workspaceService';

export class ExtensionTextDocumentManager extends AbstractWorkspaceService {
	private _fullyLoadedPromise: Promise<void> | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IRemoteRepositoriesService private readonly _remoteRepositoriesService: IRemoteRepositoriesService,
	) {
		super();
	}

	get textDocuments(): readonly TextDocument[] {
		return workspace.textDocuments;
	}

	readonly onDidOpenTextDocument = workspace.onDidOpenTextDocument;
	readonly onDidChangeTextDocument = workspace.onDidChangeTextDocument;
	readonly onDidOpenNotebookDocument = workspace.onDidOpenNotebookDocument;
	readonly onDidCloseNotebookDocument = workspace.onDidCloseNotebookDocument;
	readonly onDidCloseTextDocument = workspace.onDidCloseTextDocument;
	readonly onDidChangeWorkspaceFolders = workspace.onDidChangeWorkspaceFolders;
	readonly onDidChangeNotebookDocument = workspace.onDidChangeNotebookDocument;
	readonly onDidChangeTextEditorSelection = window.onDidChangeTextEditorSelection;

	override async openTextDocument(uri: Uri): Promise<TextDocument> {
		return await workspace.openTextDocument(uri);
	}

	override get fs(): FileSystem {
		return workspace.fs;
	}

	override async showTextDocument(document: TextDocument): Promise<void> {
		await window.showTextDocument(document);
	}

	override async openNotebookDocument(uri: Uri): Promise<NotebookDocument>;
	override async openNotebookDocument(notebookType: string, content?: NotebookData): Promise<NotebookDocument>;
	override async openNotebookDocument(arg1: Uri | string, arg2?: NotebookData): Promise<NotebookDocument> {
		if (typeof arg1 === 'string') {
			// Handle the overload for notebookType and content
			return await workspace.openNotebookDocument(arg1, arg2);
		} else {
			// Handle the overload for Uri
			// Possible we have an untitled file opened as a notebook.
			return findNotebook(arg1, workspace.notebookDocuments) || await workspace.openNotebookDocument(arg1);
		}
	}

	get notebookDocuments(): readonly NotebookDocument[] {
		return workspace.notebookDocuments;
	}

	getWorkspaceFolders(): URI[] {
		return workspace.workspaceFolders?.map(f => f.uri) ?? [];
	}

	override getWorkspaceFolderName(workspaceFolderUri: URI): string {
		const workspaceFolder = workspace.getWorkspaceFolder(workspaceFolderUri);
		if (workspaceFolder) {
			return workspaceFolder.name;
		}
		return '';
	}

	override asRelativePath(pathOrUri: string | Uri, includeWorkspaceFolder?: boolean): string {
		return workspace.asRelativePath(pathOrUri, includeWorkspaceFolder);
	}

	override applyEdit(edit: WorkspaceEdit): Thenable<boolean> {
		return workspace.applyEdit(edit);
	}

	// NOTE: I don't think it's possible to have a multi-root workspace with virtual workspaces
	// so we shouldn't need to handle when the workspace folders change... but something to be
	// aware of if we ever do support multi-root workspaces
	override ensureWorkspaceIsFullyLoaded(): Promise<void> {
		this._fullyLoadedPromise ??= (async () => {
			for (const uri of this.getWorkspaceFolders()) {
				if (isGitHubRemoteRepository(uri)) {
					this._logService.debug(`Preloading virtual workspace contents for ${uri}`);
					try {
						const result = await this._remoteRepositoriesService.loadWorkspaceContents(uri);
						this._logService.info(`loading virtual workspace contents resulted in ${result} for: ${uri}`);
					} catch (e) {
						this._logService.error(`Error loading virtual workspace contents for ${uri}: ${e}`);
					}
				}
			}
		})();
		return this._fullyLoadedPromise;
	}
	override async showWorkspaceFolderPicker(): Promise<WorkspaceFolder | undefined> {
		const workspaceFolders = this.getWorkspaceFolders();
		if (workspaceFolders) {
			return window.showWorkspaceFolderPick();
		}
		return;
	}


	override requestResourceTrust(options: ResourceTrustRequestOptions): Thenable<boolean | undefined> {
		return workspace.requestResourceTrust(options);
	}

	override requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Thenable<boolean | undefined> {
		return workspace.requestWorkspaceTrust(options);
	}
}
