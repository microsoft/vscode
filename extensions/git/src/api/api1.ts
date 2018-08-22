/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Model } from '../model';
import { Repository as BaseRepository } from '../repository';
import { InputBox, Git, API, Repository } from './git';
import { Event, SourceControlInputBox, Uri } from 'vscode';
import { mapEvent } from '../util';

class ApiInputBox implements InputBox {
	set value(value: string) { this._inputBox.value = value; }
	get value(): string { return this._inputBox.value; }
	constructor(private _inputBox: SourceControlInputBox) { }
}

export class ApiRepository implements Repository {

	readonly rootUri: Uri = Uri.file(this._repository.root);
	readonly inputBox: InputBox = new ApiInputBox(this._repository.inputBox);

	readonly onDidRunGitStatus: Event<void> = this._repository.onDidRunGitStatus;

	constructor(private _repository: BaseRepository) {
	}

	status(): Promise<void> {
		return this._repository.status();
	}
}

export class ApiGit implements Git {

	get path(): string { return this._model.git.path; }

	constructor(private _model: Model) { }
}

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
