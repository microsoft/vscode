/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Model } from '../model';
import { Repository as BaseRepository, Resource } from '../repository';
import { InputBox, Git, API, Repository, Remote, RepositoryState, Branch, Ref, Submodule, Commit, Change } from './git';
import { Event, SourceControlInputBox, Uri } from 'vscode';
import { mapEvent } from '../util';

class ApiInputBox implements InputBox {
	set value(value: string) { this._inputBox.value = value; }
	get value(): string { return this._inputBox.value; }
	constructor(private _inputBox: SourceControlInputBox) { }
}

export class ApiChange implements Change {

	constructor(_resource: Resource) { }
}

export class ApiRepositoryState implements RepositoryState {

	get HEAD(): Branch | undefined { return this._repository.HEAD; }
	get refs(): Ref[] { return [...this._repository.refs]; }
	get remotes(): Remote[] { return [...this._repository.remotes]; }
	get submodules(): Submodule[] { return [...this._repository.submodules]; }
	get rebaseCommit(): Commit | undefined { return this._repository.rebaseCommit; }

	get mergeChanges(): Change[] { return this._repository.mergeGroup.resourceStates.map(r => new ApiChange(r)); }
	get indexChanges(): Change[] { return this._repository.indexGroup.resourceStates.map(r => new ApiChange(r)); }
	get workingTreeChanges(): Change[] { return this._repository.workingTreeGroup.resourceStates.map(r => new ApiChange(r)); }

	readonly onDidChange: Event<void> = this._repository.onDidRunGitStatus;

	constructor(private _repository: BaseRepository) { }
}

export class ApiRepository implements Repository {

	readonly rootUri: Uri = Uri.file(this._repository.root);
	readonly inputBox: InputBox = new ApiInputBox(this._repository.inputBox);
	readonly state: RepositoryState = new ApiRepositoryState(this._repository);

	constructor(private _repository: BaseRepository) { }

	getConfigs(): Promise<{ key: string; value: string; }[]> {
		return this._repository.getConfigs();
	}

	getConfig(key: string): Promise<string> {
		return this._repository.getConfig(key);
	}

	setConfig(key: string, value: string): Promise<string> {
		return this._repository.setConfig(key, value);
	}

	show(ref: string, path: string): Promise<string> {
		return this._repository.show(ref, path);
	}

	getCommit(ref: string): Promise<Commit> {
		return this._repository.getCommit(ref);
	}

	getObjectDetails(treeish: string, path: string): Promise<{ mode: string; object: string; size: number; }> {
		return this._repository.getObjectDetails(treeish, path);
	}

	diffWithHEAD(path: string): Promise<string> {
		return this._repository.diffWithHEAD(path);
	}

	diffWith(ref: string, path: string): Promise<string> {
		return this._repository.diffWith(ref, path);
	}

	diffIndexWithHEAD(path: string): Promise<string> {
		return this._repository.diffIndexWithHEAD(path);
	}

	diffIndexWith(ref: string, path: string): Promise<string> {
		return this._repository.diffIndexWith(ref, path);
	}

	diffBlobs(object1: string, object2: string): Promise<string> {
		return this._repository.diffBlobs(object1, object2);
	}

	diffBetween(ref1: string, ref2: string, path: string): Promise<string> {
		return this._repository.diffBetween(ref1, ref2, path);
	}

	hashObject(data: string): Promise<string> {
		return this._repository.hashObject(data);
	}

	createBranch(name: string, checkout: boolean, ref?: string | undefined): Promise<void> {
		return this._repository.branch(name, checkout, ref);
	}

	deleteBranch(name: string): Promise<void> {
		return this._repository.deleteBranch(name);
	}

	getBranch(name: string): Promise<Branch> {
		return this._repository.getBranch(name);
	}

	setBranchUpstream(name: string, upstream: string): Promise<void> {
		return this._repository.setBranchUpstream(name, upstream);
	}

	getMergeBase(ref1: string, ref2: string): Promise<string> {
		throw new Error('Method not implemented.');
	}

	status(): Promise<void> {
		return this._repository.status();
	}

	checkout(treeish: string): Promise<void> {
		return this._repository.checkout(treeish);
	}

	addRemote(name: string, url: string): Promise<void> {
		return this._repository.addRemote(name, url);
	}

	removeRemote(name: string): Promise<void> {
		return this._repository.removeRemote(name);
	}

	fetch(remote?: string | undefined, ref?: string | undefined): Promise<void> {
		return this._repository.fetch(remote, ref);
	}

	pull(): Promise<void> {
		return this._repository.pull();
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
