/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Model } from '../model';
import { GitExtension } from './git';
import { getAPI, deprecated } from './api';
import { ApiRepository } from './api0';

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
		return this._model.repositories.map(repository => new ApiRepository(repository));
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
