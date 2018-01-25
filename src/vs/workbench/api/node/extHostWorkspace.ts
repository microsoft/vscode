/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { normalize } from 'vs/base/common/paths';
import { delta } from 'vs/base/common/arrays';
import { relative, dirname } from 'path';
import { Workspace, WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceData, ExtHostWorkspaceShape, MainContext, MainThreadWorkspaceShape, IMainContext } from './extHost.protocol';
import * as vscode from 'vscode';
import { compare } from 'vs/base/common/strings';
import { TernarySearchTree } from 'vs/base/common/map';
import { basenameOrAuthority, isEqual } from 'vs/base/common/resources';
import { isLinux } from 'vs/base/common/platform';
import { onUnexpectedError } from 'vs/base/common/errors';

function isFolderEqual(folderA: URI, folderB: URI): boolean {
	return isEqual(folderA, folderB, !isLinux);
}

class ExtHostWorkspaceImpl extends Workspace {

	static toExtHostWorkspace(data: IWorkspaceData, previousConfirmedWorkspace?: ExtHostWorkspaceImpl, previousUnconfirmedWorkspace?: ExtHostWorkspaceImpl): { workspace: ExtHostWorkspaceImpl, added: vscode.WorkspaceFolder[], removed: vscode.WorkspaceFolder[] } {
		if (!data) {
			return { workspace: null, added: [], removed: [] };
		}

		const { id, name, folders } = data;
		const newWorkspaceFolders: WorkspaceFolder[] = [];

		// If we have an existing workspace, we try to find the folders that match our
		// data and update their properties. It could be that an extension stored them
		// for later use and we want to keep them "live" if they are still present.
		const oldWorkspace = previousUnconfirmedWorkspace || previousConfirmedWorkspace;
		if (oldWorkspace) {
			folders.forEach((folderData, index) => {
				const folderUri = URI.revive(folderData.uri);
				const existingFolder = ExtHostWorkspaceImpl._findFolder(oldWorkspace, folderUri);

				if (existingFolder) {
					existingFolder.name = folderData.name;
					existingFolder.index = folderData.index;

					newWorkspaceFolders.push(existingFolder);
				} else {
					newWorkspaceFolders.push(new WorkspaceFolder({ name: folderData.name, index, uri: folderUri }));
				}
			});
		} else {
			newWorkspaceFolders.push(...folders.map(({ uri, name, index }) => new WorkspaceFolder({ name, index, uri: URI.revive(uri) })));
		}

		const workspace = new ExtHostWorkspaceImpl(id, name, newWorkspaceFolders);

		const oldRoots = oldWorkspace ? oldWorkspace.workspaceFolders.sort(ExtHostWorkspaceImpl.compareWorkspaceFolderByUri) : [];
		const newRoots = workspace.workspaceFolders.sort(ExtHostWorkspaceImpl.compareWorkspaceFolderByUri);

		const { added, removed } = delta(oldRoots, newRoots, ExtHostWorkspaceImpl.compareWorkspaceFolderByUri);

		return { workspace, added, removed };
	}

	static compareWorkspaceFolderByUri(a: vscode.WorkspaceFolder, b: vscode.WorkspaceFolder, includeName?: boolean): number {
		return isFolderEqual(a.uri, b.uri) ? 0 : compare(a.uri.toString(), b.uri.toString());
	}

	static compareWorkspaceFolderByUriAndName(a: vscode.WorkspaceFolder, b: vscode.WorkspaceFolder): number {
		return isFolderEqual(a.uri, b.uri) ? compare(a.name, b.name) : compare(a.uri.toString(), b.uri.toString());
	}

	private static _findFolder(workspace: ExtHostWorkspaceImpl, folderUriToFind: URI): WorkspaceFolder {
		for (let i = 0; i < workspace.folders.length; i++) {
			const folder = workspace.folders[i];
			if (isFolderEqual(folder.uri, folderUriToFind)) {
				return folder;
			}
		}

		return undefined;
	}

	private readonly _workspaceFolders: vscode.WorkspaceFolder[] = [];
	private readonly _structure = TernarySearchTree.forPaths<vscode.WorkspaceFolder>();

	private constructor(id: string, name: string, folders: WorkspaceFolder[]) {
		super(id, name, folders);

		// setup the workspace folder data structure
		this.folders.forEach(({ name, uri, index }) => {
			const workspaceFolder = { name, uri, index };
			this._workspaceFolders.push(workspaceFolder);
			this._structure.set(workspaceFolder.uri.toString(), workspaceFolder);
		});
	}

	get workspaceFolders(): vscode.WorkspaceFolder[] {
		return this._workspaceFolders.slice(0);
	}

	getWorkspaceFolder(uri: URI, resolveParent?: boolean): vscode.WorkspaceFolder {
		if (resolveParent && this._structure.get(uri.toString())) {
			// `uri` is a workspace folder so we check for its parent
			uri = uri.with({ path: dirname(uri.path) });
		}
		return this._structure.findSubstr(uri.toString());
	}
}

export class ExtHostWorkspace implements ExtHostWorkspaceShape {

	private static _requestIdPool = 0;

	private readonly _onDidChangeWorkspace = new Emitter<vscode.WorkspaceFoldersChangeEvent>();
	private readonly _proxy: MainThreadWorkspaceShape;

	private _confirmedWorkspace: ExtHostWorkspaceImpl;
	private _unconfirmedWorkspace: ExtHostWorkspaceImpl;

	readonly onDidChangeWorkspace: Event<vscode.WorkspaceFoldersChangeEvent> = this._onDidChangeWorkspace.event;

	constructor(mainContext: IMainContext, data: IWorkspaceData) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadWorkspace);
		this._confirmedWorkspace = ExtHostWorkspaceImpl.toExtHostWorkspace(data).workspace;
	}

	// --- workspace ---

	get workspace(): Workspace {
		return this._actualWorkspace;
	}

	private get _actualWorkspace(): ExtHostWorkspaceImpl {
		return this._unconfirmedWorkspace || this._confirmedWorkspace;
	}

	getWorkspaceFolders(): vscode.WorkspaceFolder[] {
		if (!this._actualWorkspace) {
			return undefined;
		}
		return this._actualWorkspace.workspaceFolders.slice(0);
	}

	updateWorkspaceFolders(extensionName: string, index: number, deleteCount: number, ...workspaceFoldersToAdd: { uri: vscode.Uri, name?: string }[]): boolean {
		const validatedDistinctWorkspaceFoldersToAdd: { uri: vscode.Uri, name?: string }[] = [];
		if (Array.isArray(workspaceFoldersToAdd)) {
			workspaceFoldersToAdd.forEach(folderToAdd => {
				if (URI.isUri(folderToAdd.uri) && !validatedDistinctWorkspaceFoldersToAdd.some(f => isFolderEqual(f.uri, folderToAdd.uri))) {
					validatedDistinctWorkspaceFoldersToAdd.push(folderToAdd);
				}
			});
		}

		if ([index, deleteCount].some(i => typeof i !== 'number' || i < 0)) {
			return false; // validate numbers
		}

		if (deleteCount === 0 && validatedDistinctWorkspaceFoldersToAdd.length === 0) {
			return false; // nothing to delete or add
		}

		const currentWorkspaceFolders: vscode.WorkspaceFolder[] = this._actualWorkspace ? this._actualWorkspace.workspaceFolders : [];
		if (index + deleteCount > currentWorkspaceFolders.length) {
			return false; // cannot delete more than we have
		}

		const newWorkspaceFolders = currentWorkspaceFolders.slice(0);
		newWorkspaceFolders.splice(index, deleteCount, ...validatedDistinctWorkspaceFoldersToAdd.map((f, index) => ({ uri: f.uri, name: f.name || basenameOrAuthority(f.uri), index })));
		const oldRoots = currentWorkspaceFolders.sort(ExtHostWorkspaceImpl.compareWorkspaceFolderByUri);
		const newRoots = newWorkspaceFolders.sort(ExtHostWorkspaceImpl.compareWorkspaceFolderByUri);
		const { added, removed } = delta(oldRoots, newRoots, ExtHostWorkspaceImpl.compareWorkspaceFolderByUriAndName);
		if (added.length === 0 && removed.length === 0) {
			return false; // nothing actually changed
		}

		// Trigger on main side
		this._proxy.$updateWorkspaceFolders(extensionName, index, deleteCount, validatedDistinctWorkspaceFoldersToAdd).then(null, onUnexpectedError);

		// Try to accept directly
		const accepted = this.trySetWorkspaceData({ id: this._actualWorkspace.id, name: this._actualWorkspace.name, configuration: this._actualWorkspace.configuration, folders: newWorkspaceFolders } as IWorkspaceData);

		return accepted;
	}

	getWorkspaceFolder(uri: vscode.Uri, resolveParent?: boolean): vscode.WorkspaceFolder {
		if (!this._actualWorkspace) {
			return undefined;
		}
		return this._actualWorkspace.getWorkspaceFolder(uri, resolveParent);
	}

	getPath(): string {

		// this is legacy from the days before having
		// multi-root and we keep it only alive if there
		// is just one workspace folder.
		if (!this._actualWorkspace) {
			return undefined;
		}

		const { folders } = this._actualWorkspace;
		if (folders.length === 0) {
			return undefined;
		}
		return folders[0].uri.fsPath;
	}

	getRelativePath(pathOrUri: string | vscode.Uri, includeWorkspace?: boolean): string {

		let path: string;
		if (typeof pathOrUri === 'string') {
			path = pathOrUri;
		} else if (typeof pathOrUri !== 'undefined') {
			path = pathOrUri.fsPath;
		}

		if (!path) {
			return path;
		}

		const folder = this.getWorkspaceFolder(
			typeof pathOrUri === 'string' ? URI.file(pathOrUri) : pathOrUri,
			true
		);

		if (!folder) {
			return path;
		}

		if (typeof includeWorkspace === 'undefined') {
			includeWorkspace = this._actualWorkspace.folders.length > 1;
		}

		let result = relative(folder.uri.fsPath, path);
		if (includeWorkspace) {
			result = `${folder.name}/${result}`;
		}
		return normalize(result, true);
	}

	private trySetWorkspaceData(data: IWorkspaceData): boolean {

		// Update directly here. The workspace is unconfirmed as long as we did not get an
		// acknowledgement from the main side (via $acceptWorkspaceData)
		if (this._actualWorkspace) {
			this._unconfirmedWorkspace = ExtHostWorkspaceImpl.toExtHostWorkspace(data, this._actualWorkspace).workspace;

			return true;
		}

		return false;
	}

	$acceptWorkspaceData(data: IWorkspaceData): void {

		const { workspace, added, removed } = ExtHostWorkspaceImpl.toExtHostWorkspace(data, this._confirmedWorkspace, this._unconfirmedWorkspace);

		// Update our workspace object. We have a confirmed workspace, so we drop our
		// unconfirmed workspace.
		this._confirmedWorkspace = workspace;
		this._unconfirmedWorkspace = undefined;

		// Events
		if (added.length || removed.length) {
			this._onDidChangeWorkspace.fire(Object.freeze({
				added: Object.freeze<vscode.WorkspaceFolder[]>(added),
				removed: Object.freeze<vscode.WorkspaceFolder[]>(removed)
			}));
		}
	}

	// --- search ---

	findFiles(include: vscode.GlobPattern, exclude: vscode.GlobPattern, maxResults?: number, token?: vscode.CancellationToken): Thenable<vscode.Uri[]> {
		const requestId = ExtHostWorkspace._requestIdPool++;

		let includePattern: string;
		let includeFolder: string;
		if (include) {
			if (typeof include === 'string') {
				includePattern = include;
			} else {
				includePattern = include.pattern;
				includeFolder = include.base;
			}
		}

		let excludePattern: string;
		if (exclude) {
			if (typeof exclude === 'string') {
				excludePattern = exclude;
			} else {
				excludePattern = exclude.pattern;
			}
		}

		const result = this._proxy.$startSearch(includePattern, includeFolder, excludePattern, maxResults, requestId);
		if (token) {
			token.onCancellationRequested(() => this._proxy.$cancelSearch(requestId));
		}
		return result.then(data => data.map(URI.revive));
	}

	saveAll(includeUntitled?: boolean): Thenable<boolean> {
		return this._proxy.$saveAll(includeUntitled);
	}
}
