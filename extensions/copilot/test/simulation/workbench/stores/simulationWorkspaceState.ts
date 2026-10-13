/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as mobx from 'mobx';
import * as path from 'path';
import { Lazy } from '../../../../src/util/vs/base/common/lazy';
import { IInitialWorkspaceState, IInteractionWorkspaceState, IWorkspaceStateFile } from '../../shared/sharedTypes';
import { ObservablePromise } from '../utils/utils';

export interface IResolvedFile {
	workspacePath: string;
	contents: string;
	languageId: string | undefined;
}

export class InitialWorkspaceState {

	public _source: IInitialWorkspaceState;

	@mobx.computed
	public get kind() {
		return this._source.kind;
	}

	@mobx.computed
	public get languageId() {
		return this._source.languageId;
	}

	@mobx.computed
	public get selection() {
		return this._source.selection;
	}

	@mobx.computed
	public get diagnostics() {
		return this._source.diagnostics;
	}

	@mobx.computed
	public get range() {
		return this._source.range;
	}

	@mobx.computed
	public get file(): ObservablePromise<IResolvedFile | null> {
		return new ObservablePromise(this.getFile(), null);
	}

	@mobx.computed
	public get otherFiles(): ObservablePromise<IResolvedFile[]> {
		return new ObservablePromise(this.getOtherFiles(), []);
	}

	constructor(
		public readonly source: IInitialWorkspaceState,
		private readonly writtenFilesBaseDir: string,
	) {
		this._source = source;
		mobx.makeObservable(this);
	}

	private async getFile(): Promise<IResolvedFile | null> {
		const file = this._source.file;
		if (!file) {
			return null;
		}
		const contents = await fs.promises.readFile(path.join(this.writtenFilesBaseDir, file.relativeDiskPath), 'utf8');
		return {
			workspacePath: file.workspacePath,
			contents: contents,
			languageId: file.languageId
		};
	}

	private async getOtherFiles(): Promise<IResolvedFile[]> {
		return Promise.all(
			(this._source.additionalFiles ?? []).map(async (file) => {
				const contents = await fs.promises.readFile(path.join(this.writtenFilesBaseDir, file.relativeDiskPath), 'utf8');
				return {
					workspacePath: file.workspacePath,
					contents: contents,
					languageId: file.languageId
				};
			})
		);
	}
}

export class InteractionWorkspaceState {

	public _source: IInteractionWorkspaceState;

	@mobx.computed
	public get kind() {
		return this._source.kind;
	}

	@mobx.computed
	public get fileName() {
		return this._source.fileName;
	}

	@mobx.computed
	public get languageId() {
		return this._source.languageId;
	}

	@mobx.computed
	public get selection() {
		return this._source.selection;
	}

	@mobx.computed
	public get range() {
		return this._source.range;
	}

	@mobx.computed
	public get diagnostics() {
		return this._source.diagnostics;
	}

	@mobx.computed
	public get interaction() {
		return this._source.interaction;
	}

	@mobx.computed
	public get requestCount() {
		return this._source.requestCount;
	}

	private readonly _changedFiles = new Lazy(() => new ObservablePromise(this._resolveFiles(this._source.changedFiles), []));

	@mobx.computed
	public get changedFiles(): ObservablePromise<IResolvedFile[]> {
		return this._changedFiles.value;
	}

	constructor(
		public readonly source: IInteractionWorkspaceState,
		private readonly writtenFilesBaseDir: string,
	) {
		this._source = source;
		mobx.makeObservable(this);
	}

	private async _resolveFiles(files: IWorkspaceStateFile[]): Promise<IResolvedFile[]> {
		return Promise.all(
			files.map(async (file) => {
				const contents = await fs.promises.readFile(path.join(this.writtenFilesBaseDir, file.relativeDiskPath), 'utf8');
				return {
					workspacePath: file.workspacePath,
					contents: contents,
					languageId: file.languageId
				};
			})
		);
	}
}

export type WorkspaceState = InitialWorkspaceState | InteractionWorkspaceState;
