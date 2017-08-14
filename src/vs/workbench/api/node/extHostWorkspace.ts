/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { normalize } from 'vs/base/common/paths';
import { delta } from 'vs/base/common/arrays';
import { relative, basename } from 'path';
import { Workspace } from 'vs/platform/workspace/common/workspace';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { IResourceEdit } from 'vs/editor/common/services/bulkEdit';
import { TPromise } from 'vs/base/common/winjs.base';
import { fromRange, EndOfLine } from 'vs/workbench/api/node/extHostTypeConverters';
import { IWorkspaceData, ExtHostWorkspaceShape, MainContext, MainThreadWorkspaceShape } from './extHost.protocol';
import * as vscode from 'vscode';
import { compare } from "vs/base/common/strings";
import { asWinJsPromise } from 'vs/base/common/async';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import { TrieMap } from 'vs/base/common/map';

class Workspace2 extends Workspace {

	static fromData(data: IWorkspaceData) {
		return data ? new Workspace2(data) : null;
	}

	private readonly _folder: vscode.WorkspaceFolder[] = [];
	private readonly _structure = new TrieMap<vscode.WorkspaceFolder>(s => s.split('/'));

	private constructor(data: IWorkspaceData) {
		super(data.id, data.name, data.roots);

		// setup the workspace folder data structure
		this.roots.forEach((uri, index) => {
			const folder = {
				name: basename(uri.fsPath),
				uri,
				index
			};
			this._folder.push(folder);
			this._structure.insert(folder.uri.toString(), folder);
		});
	}

	get folders(): vscode.WorkspaceFolder[] {
		return this._folder.slice(0);
	}

	getWorkspaceFolder(uri: URI): vscode.WorkspaceFolder {
		let str = uri.toString();
		let folder = this._structure.lookUp(str);
		if (folder) {
			// `uri` is a workspace folder so we
			let parts = str.split('/');
			while (parts.length) {
				if (parts.pop()) {
					break;
				}
			}
			str = parts.join('/');
		}
		return this._structure.findSubstr(str);
	}
}

export class ExtHostWorkspace extends ExtHostWorkspaceShape {

	private static _requestIdPool = 0;

	private readonly _onDidChangeWorkspace = new Emitter<vscode.WorkspaceFoldersChangeEvent>();
	private readonly _proxy: MainThreadWorkspaceShape;
	private _workspace: Workspace2;

	readonly onDidChangeWorkspace: Event<vscode.WorkspaceFoldersChangeEvent> = this._onDidChangeWorkspace.event;

	constructor(threadService: IThreadService, data: IWorkspaceData) {
		super();
		this._proxy = threadService.get(MainContext.MainThreadWorkspace);
		this._workspace = Workspace2.fromData(data);
	}

	// --- workspace ---

	get workspace(): Workspace {
		return this._workspace;
	}

	getWorkspaceFolders(): vscode.WorkspaceFolder[] {
		if (!this._workspace) {
			return undefined;
		} else {
			return this._workspace.folders.slice(0);
		}
	}

	getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder {
		if (!this._workspace) {
			return undefined;
		}
		return this._workspace.getWorkspaceFolder(<URI>uri);
	}

	getPath(): string {
		// this is legacy from the days before having
		// multi-root and we keep it only alive if there
		// is just one workspace folder.
		if (!this._workspace) {
			return undefined;
		}
		const { roots } = this._workspace;
		if (roots.length === 0) {
			return undefined;
		}
		return roots[0].fsPath;
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

		const folder = this.getWorkspaceFolder(typeof pathOrUri === 'string'
			? URI.file(pathOrUri)
			: pathOrUri
		);

		if (!folder) {
			return normalize(path);
		}

		if (typeof includeWorkspace === 'undefined') {
			includeWorkspace = this.workspace.roots.length > 1;
		}

		let result = relative(folder.uri.fsPath, path);
		if (includeWorkspace) {
			result = `${folder.name}/${result}`;
		}
		return normalize(result);
	}

	$acceptWorkspaceData(data: IWorkspaceData): void {

		// keep old workspace folder, build new workspace, and
		// capture new workspace folders. Compute delta between
		// them send that as event
		const oldRoots = this._workspace ? this._workspace.folders.sort(ExtHostWorkspace._compareWorkspaceFolder) : [];

		this._workspace = Workspace2.fromData(data);
		const newRoots = this._workspace ? this._workspace.folders.sort(ExtHostWorkspace._compareWorkspaceFolder) : [];

		const { added, removed } = delta(oldRoots, newRoots, ExtHostWorkspace._compareWorkspaceFolder);
		this._onDidChangeWorkspace.fire(Object.freeze({
			added: Object.freeze<vscode.WorkspaceFolder[]>(added),
			removed: Object.freeze<vscode.WorkspaceFolder[]>(removed)
		}));
	}

	private static _compareWorkspaceFolder(a: vscode.WorkspaceFolder, b: vscode.WorkspaceFolder): number {
		return compare(a.uri.toString(), b.uri.toString());
	}

	// --- search ---

	findFiles(include: string, exclude: string, maxResults?: number, token?: vscode.CancellationToken): Thenable<vscode.Uri[]> {
		const requestId = ExtHostWorkspace._requestIdPool++;
		const result = this._proxy.$startSearch(include, exclude, maxResults, requestId);
		if (token) {
			token.onCancellationRequested(() => this._proxy.$cancelSearch(requestId));
		}
		return result;
	}

	saveAll(includeUntitled?: boolean): Thenable<boolean> {
		return this._proxy.$saveAll(includeUntitled);
	}

	appyEdit(edit: vscode.WorkspaceEdit): TPromise<boolean> {

		let resourceEdits: IResourceEdit[] = [];

		let entries = edit.entries();
		for (let entry of entries) {
			let [uri, edits] = entry;

			for (let edit of edits) {
				resourceEdits.push({
					resource: <URI>uri,
					newText: edit.newText,
					newEol: EndOfLine.from(edit.newEol),
					range: edit.range && fromRange(edit.range)
				});
			}
		}

		return this._proxy.$applyWorkspaceEdit(resourceEdits);
	}

	// --- EXPERIMENT: workspace resolver

	private readonly _provider = new Map<number, vscode.FileSystemProvider>();

	public registerFileSystemProvider(authority: string, provider: vscode.FileSystemProvider): vscode.Disposable {

		const handle = this._provider.size;
		this._provider.set(handle, provider);
		const reg = provider.onDidChange(e => this._proxy.$onFileSystemChange(handle, <URI>e));
		this._proxy.$registerFileSystemProvider(handle, authority);
		return new Disposable(() => {
			this._provider.delete(handle);
			reg.dispose();
		});
	}

	$resolveFile(handle: number, resource: URI): TPromise<string> {
		const provider = this._provider.get(handle);
		return asWinJsPromise(token => provider.resolveContents(resource));
	}

	$storeFile(handle: number, resource: URI, content: string): TPromise<any> {
		const provider = this._provider.get(handle);
		return asWinJsPromise(token => provider.writeContents(resource, content));
	}
}
