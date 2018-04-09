/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Model } from './model';
import { Repository as ModelRepository } from './repository';
import { Uri, SourceControlInputBox, SourceControl, EventEmitter, Event } from 'vscode';

export interface InputBox {
	value: string;
}

export class InputBoxImpl implements InputBox {
	set value(value: string) { this.inputBox.value = value; }
	get value(): string { return this.inputBox.value; }
	constructor(private inputBox: SourceControlInputBox) { }
}

export interface Repository {
	readonly rootUri: Uri;
	readonly inputBox: InputBox;
}

export class RepositoryImpl implements Repository {

	readonly rootUri: Uri;
	readonly inputBox: InputBox;
	readonly sourceControl: SourceControl;

	constructor(repository: ModelRepository) {
		this.rootUri = Uri.file(repository.root);
		this.inputBox = new InputBoxImpl(repository.inputBox);
		this.sourceControl = repository.sourceControl;
	}
}

export interface API {
	getRepositories(): Promise<Repository[]>;
	getGitPath(): Promise<string>;
}

export class APIImpl implements API {
	private _onDidOpenRepository = new EventEmitter<Repository>();
	readonly onDidOpenRepository: Event<Repository> = this._onDidOpenRepository.event;

	constructor(private modelPromise: Promise<Model>) {
		modelPromise.then(model => {
			model.onDidOpenRepository(repository => {
				this._onDidOpenRepository.fire(new RepositoryImpl(repository));
			});
		});
	}

	async getGitPath(): Promise<string> {
		const model = await this.modelPromise;
		return model.git.path;
	}

	async getRepositories(): Promise<Repository[]> {
		const model = await this.modelPromise;
		return model.repositories.map(repository => new RepositoryImpl(repository));
	}
}

export function createApi(modelPromise: Promise<Model>): API {
	return new APIImpl(modelPromise);
}