/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Model } from './model';
import { Repository as ModelRepository } from './repository';
import { Uri, SourceControlInputBox } from 'vscode';
import { GitExtension } from './api';

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

export function createGitExtension(model?: Model): GitExtension {
	if (!model) {
		return {
			getGitPath() { throw new Error('Git model not found'); },
			getRepositories() { throw new Error('Git model not found'); }
		};
	}

	return {
		async getGitPath() { return model.git.path; },
		async getRepositories() { return model.repositories.map(repository => new RepositoryImpl(repository)); }
	};
}
