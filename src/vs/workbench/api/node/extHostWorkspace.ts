/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { normalize } from 'vs/base/common/paths';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { relative } from 'path';
import { Workspace } from 'vs/platform/workspace/common/workspace';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { IResourceEdit } from 'vs/editor/common/services/bulkEdit';
import { TPromise } from 'vs/base/common/winjs.base';
import { fromRange, EndOfLine } from 'vs/workbench/api/node/extHostTypeConverters';
import { IWorkspaceData, ExtHostWorkspaceShape, MainContext, MainThreadWorkspaceShape } from './extHost.protocol';
import * as vscode from 'vscode';

export class ExtHostWorkspace extends ExtHostWorkspaceShape {

	private static _requestIdPool = 0;

	private readonly _onDidChangeWorkspace = new Emitter<URI[]>();
	private readonly _proxy: MainThreadWorkspaceShape;
	private _workspace: Workspace;

	readonly onDidChangeWorkspace: Event<URI[]> = this._onDidChangeWorkspace.event;

	constructor(threadService: IThreadService, data: IWorkspaceData) {
		super();
		this._proxy = threadService.get(MainContext.MainThreadWorkspace);
		this._workspace = data ? new Workspace(data.id, data.name, data.roots) : null;
	}

	// --- workspace ---

	get workspace(): Workspace {
		return this._workspace;
	}

	getRoots(): URI[] {
		if (!this._workspace) {
			return undefined;
		} else {
			return this._workspace.roots.slice(0);
		}
	}

	getPath(): string {
		// this is legacy from the days before having
		// multi-root and we keep it only alive if there
		// is just one workspace folder.
		if (!this._workspace) {
			return undefined;
		}
		const { roots } = this._workspace;
		if (roots.length === 1) {
			return roots[0].fsPath;
		}
		// return `undefined` when there no or more than 1
		// root folder.
		return undefined;
	}

	getRelativePath(pathOrUri: string | vscode.Uri): string {

		let path: string;
		if (typeof pathOrUri === 'string') {
			path = pathOrUri;
		} else if (typeof pathOrUri !== 'undefined') {
			path = pathOrUri.fsPath;
		}

		if (!path) {
			return path;
		}

		if (!this._workspace || isFalsyOrEmpty(this._workspace.roots)) {
			return normalize(path);
		}

		for (const { fsPath } of this._workspace.roots) {
			let result = relative(fsPath, path);
			if (!result || result.indexOf('..') === 0) {
				continue;
			}
			return normalize(result);
		}

		return normalize(path);
	}

	$acceptWorkspaceData(data: IWorkspaceData): void {
		this._workspace = data ? new Workspace(data.id, data.name, data.roots) : null;
		this._onDidChangeWorkspace.fire(this.getRoots());
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
}
