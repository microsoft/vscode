/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Model } from '../model';
import { GitExtension, Repository, API } from './git';
import { ApiRepository, ApiImpl } from './api1';

export function deprecated(target: any, key: string, descriptor: any): void {
	if (typeof descriptor.value !== 'function') {
		throw new Error('not supported');
	}

	const fn = descriptor.value;
	descriptor.value = function () {
		console.warn(`Git extension API method '${key}' is deprecated.`);
		return fn.apply(this, arguments);
	};
}

class NoModelGitExtension implements GitExtension {

	@deprecated
	async getGitPath(): Promise<string> {
		throw new Error('Git model not found');
	}

	@deprecated
	async getRepositories(): Promise<Repository[]> {
		throw new Error('Git model not found');
	}

	getAPI(): API {
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
	async getRepositories(): Promise<Repository[]> {
		return this._model.repositories.map(repository => new ApiRepository(repository));
	}

	getAPI(version: number): API {
		if (version !== 1) {
			throw new Error(`No API version ${version} found.`);
		}

		return new ApiImpl(this._model);
	}
}

export function createGitExtension(model?: Model): GitExtension {
	if (!model) {
		return new NoModelGitExtension();
	}

	return new GitExtensionImpl(model);
}
