/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Model } from '../model';
import { GitExtension, Repository, API } from './git';
import { ApiRepository, ApiImpl } from './api1';
import { Event, EventEmitter } from 'vscode';
import { CloneManager } from '../cloneManager';

function deprecated(original: any, context: ClassMemberDecoratorContext) {
	if (context.kind !== 'method') {
		throw new Error('not supported');
	}

	const key = context.name.toString();
	return function (this: any, ...args: any[]): any {
		console.warn(`Git extension API method '${key}' is deprecated.`);
		return original.apply(this, args);
	};
}

export class GitExtensionImpl implements GitExtension {

	enabled: boolean = false;

	private _onDidChangeEnablement = new EventEmitter<boolean>();
	readonly onDidChangeEnablement: Event<boolean> = this._onDidChangeEnablement.event;

	private _model: Model | undefined = undefined;
	private _cloneManager: CloneManager | undefined = undefined;

	set model(model: Model | undefined) {
		this._model = model;

		const enabled = !!model;

		if (this.enabled === enabled) {
			return;
		}

		this.enabled = enabled;
		this._onDidChangeEnablement.fire(this.enabled);
	}

	get model(): Model | undefined {
		return this._model;
	}

	set cloneManager(cloneManager: CloneManager | undefined) {
		this._cloneManager = cloneManager;
	}

	constructor(privates?: { model: Model; cloneManager: CloneManager }) {
		if (privates) {
			this.enabled = true;
			this._model = privates.model;
			this._cloneManager = privates.cloneManager;
		}
	}

	@deprecated
	async getGitPath(): Promise<string> {
		if (!this._model) {
			throw new Error('Git model not found');
		}

		return this._model.git.path;
	}

	@deprecated
	async getRepositories(): Promise<Repository[]> {
		if (!this._model) {
			throw new Error('Git model not found');
		}

		return this._model.repositories.map(repository => new ApiRepository(repository));
	}

	getAPI(version: number): API {
		if (!this._model || !this._cloneManager) {
			throw new Error('Git model not found');
		}

		if (version !== 1) {
			throw new Error(`No API version ${version} found.`);
		}

		return new ApiImpl({ model: this._model, cloneManager: this._cloneManager });
	}
}
