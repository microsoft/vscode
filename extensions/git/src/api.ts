/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Model } from './model';
import { Repository as ModelRepository } from './repository';
import { SourceControlInputBox } from 'vscode';

export interface InputBox {
	value: string;
}

export class InputBoxImpl implements InputBox {
	set value(value: string) { this.inputBox.value = value; }
	get value(): string { return this.inputBox.value; }
	constructor(private inputBox: SourceControlInputBox) { }
}

// export interface Repository {
// 	readonly rootUri: Uri;
// 	readonly inputBox: InputBox;
// }

// export class RepositoryImpl implements Repository {

// 	readonly rootUri: Uri;
// 	readonly inputBox: InputBox;

// 	constructor(repository: ModelRepository) {
// 		this.rootUri = Uri.file(repository.root);
// 		this.inputBox = new InputBoxImpl(repository.inputBox);
// 	}
// }

export interface API {
	getRepositories(): Promise<ModelRepository[]>;
	getGitPath(): Promise<string>;
	getModel(): Promise<Model>;
}

export class APIImpl implements API {
	private model?: Model;
	constructor(private modelPromise: Promise<Model>) {
		this.model = undefined;
	}

	async getGitPath(): Promise<string> {
		const model = await this.modelPromise;
		return model.git.path;
	}

	async getModel(): Promise<Model> {
		const model = await this.modelPromise;
		this.model = model;
		return model;
	}

	async getRepositories(): Promise<ModelRepository[]> {
		const model = await this.modelPromise;
		this.model = model;
		return this.model.repositories;
	}
}

export function createApi(modelPromise: Promise<Model>): API {
	return new APIImpl(modelPromise);
}