/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Model } from '../model';
import { Repository as ModelRepository } from '../repository';
import { Uri, SourceControlInputBox } from 'vscode';
import { GitExtension } from './git';
import { getAPI, deprecated } from './api';

class InputBoxImpl implements GitExtension.InputBox {
	set value(value: string) { this.inputBox.value = value; }
	get value(): string { return this.inputBox.value; }
	constructor(private inputBox: SourceControlInputBox) { }
}

class RepositoryImpl implements GitExtension.Repository {

	readonly rootUri: Uri;
	readonly inputBox: GitExtension.InputBox;

	constructor(repository: ModelRepository) {
		this.rootUri = Uri.file(repository.root);
		this.inputBox = new InputBoxImpl(repository.inputBox);
	}
}

class NoModelGitExtension implements GitExtension {

	@deprecated
	async getGitPath(): Promise<string> {
		throw new Error('Git model not found');
	}

	@deprecated
	async getRepositories(): Promise<GitExtension.Repository[]> {
		throw new Error('Git model not found');
	}

	getAPI(): GitExtension.API {
		throw new Error('Git model not found');
	}
}

class GitExtensionImpl implements GitExtension {

	constructor(private _model: Model) { }

	@deprecated
	async getGitPath(): Promise<string> {
		return this._model.git.path;
	}

	@deprecated
	async getRepositories(): Promise<GitExtension.Repository[]> {
		return this._model.repositories.map(repository => new RepositoryImpl(repository));
	}

	getAPI(range: string): GitExtension.API {
		return getAPI(this._model, range);
	}
}

export function createGitExtension(model?: Model): GitExtension {
	if (!model) {
		return new NoModelGitExtension();
	}

	return new GitExtensionImpl(model);
}
