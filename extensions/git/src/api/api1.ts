/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Model } from '../model';
import { GitExtension } from './git';
import { Api } from './api';
import { Event, SourceControlInputBox, Uri } from 'vscode';
import { mapEvent } from '../util';
import { Repository } from '../repository';
import * as cp from 'child_process';

class ApiInputBox implements GitExtension.InputBox {
	set value(value: string) { this._inputBox.value = value; }
	get value(): string { return this._inputBox.value; }
	constructor(private _inputBox: SourceControlInputBox) { }
}

export class ApiRepository implements GitExtension.Repository {

	readonly rootUri: Uri;
	readonly inputBox: GitExtension.InputBox;

	constructor(_repository: Repository) {
		this.rootUri = Uri.file(_repository.root);
		this.inputBox = new ApiInputBox(_repository.inputBox);
	}
}

@Api('1.0.0')
export class ApiImpl implements GitExtension.API {

	get gitPath(): string {
		return this._model.git.path;
	}

	get onDidOpenRepository(): Event<GitExtension.Repository> {
		return mapEvent(this._model.onDidOpenRepository, r => new ApiRepository(r));
	}

	get onDidCloseRepository(): Event<GitExtension.Repository> {
		return mapEvent(this._model.onDidCloseRepository, r => new ApiRepository(r));
	}

	get repositories(): GitExtension.Repository[] {
		return this._model.repositories.map(r => new ApiRepository(r));
	}

	constructor(private _model: Model) { }

	exec(cwd: string, args: string[], options: GitExtension.SpawnOptions = {}): Promise<GitExtension.IExecResult<string>> {
		return this._model.git.exec(cwd, args, options);
	}

	spawn(cwd: string, args: string[], options: GitExtension.SpawnOptions = {}): cp.ChildProcess {
		options = { cwd, ...options };
		return this._model.git.spawn(args, options);
	}
}
