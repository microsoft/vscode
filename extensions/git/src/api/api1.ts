/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Model } from '../model';
import { Repository as BaseRepository } from '../repository';
import { InputBox, ExecResult, SpawnOptions, Git, API, Repository } from './git';
import { Api } from './api';
import { Event, SourceControlInputBox, Uri } from 'vscode';
import { mapEvent } from '../util';
import * as cp from 'child_process';

class ApiInputBox implements InputBox {
	set value(value: string) { this._inputBox.value = value; }
	get value(): string { return this._inputBox.value; }
	constructor(private _inputBox: SourceControlInputBox) { }
}

export class ApiRepository implements Repository {

	readonly rootUri: Uri;
	readonly inputBox: InputBox;

	constructor(_repository: BaseRepository) {
		this.rootUri = Uri.file(_repository.root);
		this.inputBox = new ApiInputBox(_repository.inputBox);
	}
}

export class ApiGit implements Git {

	get path(): string { return this._model.git.path; }

	constructor(private _model: Model) { }

	exec(args: string[], options: SpawnOptions): Promise<ExecResult<string>> {
		return this._model.git.exec2(args, options);
	}

	spawn(args: string[], options: SpawnOptions): cp.ChildProcess {
		return this._model.git.spawn(args, options);
	}
}

@Api('1.0.0')
export class ApiImpl implements API {

	readonly git = new ApiGit(this._model);

	get onDidOpenRepository(): Event<Repository> {
		return mapEvent(this._model.onDidOpenRepository, r => new ApiRepository(r));
	}

	get onDidCloseRepository(): Event<Repository> {
		return mapEvent(this._model.onDidCloseRepository, r => new ApiRepository(r));
	}

	get repositories(): Repository[] {
		return this._model.repositories.map(r => new ApiRepository(r));
	}

	constructor(private _model: Model) { }
}
