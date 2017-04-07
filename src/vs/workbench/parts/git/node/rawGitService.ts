/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { join, isAbsolute, relative } from 'path';
import { TPromise, Promise } from 'vs/base/common/winjs.base';
import { detectMimesFromFile, detectMimesFromStream } from 'vs/base/node/mime';
import { realpath, exists } from 'vs/base/node/pfs';
import { Repository, GitError } from 'vs/workbench/parts/git/node/git.lib';
import { IRawGitService, RawServiceState, IRawStatus, IRef, GitErrorCodes, IPushOptions, ICommit } from 'vs/workbench/parts/git/common/git';
import Event, { Emitter, delayed } from 'vs/base/common/event';

export class RawGitService implements IRawGitService {

	private repo: Repository;
	private _repositoryRoot: TPromise<string>;
	private _onOutput: Emitter<string>;
	get onOutput(): Event<string> { return this._onOutput.event; }

	constructor(repo: Repository) {
		this.repo = repo;

		let listener: () => void;

		this._onOutput = new Emitter<string>({
			onFirstListenerAdd: () => {
				listener = this.repo.onOutput(output => this._onOutput.fire(output));
			},
			onLastListenerRemove: () => {
				listener();
				listener = null;
			}
		});
	}

	getVersion(): TPromise<string> {
		if (!this.repo) {
			return TPromise.as(null);
		}

		return TPromise.as(this.repo.git.version);
	}

	private getRepositoryRoot(): TPromise<string> {
		return this._repositoryRoot || (this._repositoryRoot = realpath(this.repo.path));
	}

	serviceState(): TPromise<RawServiceState> {
		return TPromise.as<RawServiceState>(this.repo
			? RawServiceState.OK
			: RawServiceState.GitNotFound
		);
	}

	statusCount(): TPromise<number> {
		if (!this.repo) {
			return TPromise.as(0);
		}

		return this.status().then(r => r ? r.status.length : 0);
	}

	status(): TPromise<IRawStatus> {
		return this.repo.getStatus()
			.then(status => this.repo.getHEAD()
				.then(HEAD => {
					if (HEAD.name) {
						return this.repo.getBranch(HEAD.name).then(null, () => HEAD);
					} else {
						return HEAD;
					}
				}, (): IRef => null)
				.then(HEAD => Promise.join([this.getRepositoryRoot(), this.repo.getRefs(), this.repo.getRemotes()]).then(r => {
					return {
						repositoryRoot: r[0],
						status: status,
						HEAD: HEAD,
						refs: r[1],
						remotes: r[2]
					};
				})))
			.then(null, (err) => {
				if (err.gitErrorCode === GitErrorCodes.BadConfigFile) {
					return Promise.wrapError(err);
				} else if (err.gitErrorCode === GitErrorCodes.NotAtRepositoryRoot) {
					return Promise.wrapError(err);
				}

				return null;
			});
	}

	init(): TPromise<IRawStatus> {
		return this.repo.init().then(() => this.status());
	}

	add(filePaths?: string[]): TPromise<IRawStatus> {
		return this.repo.add(filePaths).then(() => this.status());
	}

	stage(filePath: string, content: string): TPromise<IRawStatus> {
		return this.repo.stage(filePath, content).then(() => this.status());
	}

	branch(name: string, checkout?: boolean): TPromise<IRawStatus> {
		return this.repo.branch(name, checkout).then(() => this.status());
	}

	checkout(treeish?: string, filePaths?: string[]): TPromise<IRawStatus> {
		return this.repo.checkout(treeish, filePaths).then(() => this.status());
	}

	clean(filePaths: string[]): TPromise<IRawStatus> {
		return this.repo.clean(filePaths).then(() => this.status());
	}

	undo(): TPromise<IRawStatus> {
		return this.repo.undo().then(() => this.status());
	}

	reset(treeish: string, hard?: boolean): TPromise<IRawStatus> {
		return this.repo.reset(treeish, hard).then(() => this.status());
	}

	revertFiles(treeish: string, filePaths?: string[]): TPromise<IRawStatus> {
		return this.repo.revertFiles(treeish, filePaths).then(() => this.status());
	}

	fetch(): TPromise<IRawStatus> {
		return this.repo.fetch().then(null, (err) => {
			if (err.gitErrorCode === GitErrorCodes.NoRemoteRepositorySpecified) {
				return TPromise.as(null);
			}

			return Promise.wrapError(err);
		}).then(() => this.status());
	}

	pull(rebase?: boolean): TPromise<IRawStatus> {
		return this.repo.pull(rebase).then(() => this.status());
	}

	push(remote?: string, name?: string, options?: IPushOptions): TPromise<IRawStatus> {
		return this.repo.push(remote, name, options).then(() => this.status());
	}

	sync(): TPromise<IRawStatus> {
		return this.repo.sync().then(() => this.status());
	}

	commit(message: string, amend?: boolean, stage?: boolean, signoff?: boolean): TPromise<IRawStatus> {
		let promise: Promise = TPromise.as(null);

		if (stage) {
			promise = this.repo.add(null);
		}

		return promise
			.then(() => this.repo.commit(message, stage, amend, signoff))
			.then(() => this.status());
	}

	detectMimetypes(filePath: string, treeish?: string): TPromise<string[]> {
		return exists(join(this.repo.path, filePath)).then((exists) => {
			if (exists) {
				return detectMimesFromFile(join(this.repo.path, filePath))
					.then(result => result.mimes);
			}

			const child = this.repo.show(treeish + ':' + filePath);

			return new TPromise<string[]>((c, e) =>
				detectMimesFromStream(child.stdout, filePath)
					.then(result => result.mimes)
			);
		});
	}

	// careful, this buffers the whole object into memory
	show(filePath: string, treeish?: string): TPromise<string> {
		treeish = (!treeish || treeish === '~') ? '' : treeish;

		if (isAbsolute(filePath)) {
			filePath = relative(this.repo.path, filePath).replace(/\\/g, '/');
		}

		return this.repo.buffer(treeish + ':' + filePath).then(null, e => {
			if (e instanceof GitError) {
				return ''; // mostly untracked files end up in a git error
			}

			return TPromise.wrapError<string>(e);
		});
	}

	clone(url: string, parentPath: string): TPromise<string> {
		return this.repo.git.clone(url, parentPath);
	}

	getCommitTemplate(): TPromise<string> {
		return this.repo.getCommitTemplate();
	}

	getCommit(ref: string): TPromise<ICommit> {
		return this.repo.getCommit(ref);
	}
}

export class DelayedRawGitService implements IRawGitService {
	constructor(private raw: TPromise<IRawGitService>) { }
	onOutput: Event<string> = delayed(this.raw.then(r => r.onOutput));
	getVersion(): TPromise<string> { return this.raw.then(r => r.getVersion()); }
	serviceState(): TPromise<RawServiceState> { return this.raw.then(r => r.serviceState()); }
	statusCount(): TPromise<number> { return this.raw.then(r => r.statusCount()); }
	status(): TPromise<IRawStatus> { return this.raw.then(r => r.status()); }
	init(): TPromise<IRawStatus> { return this.raw.then(r => r.init()); }
	add(filesPaths?: string[]): TPromise<IRawStatus> { return this.raw.then(r => r.add(filesPaths)); }
	stage(filePath: string, content: string): TPromise<IRawStatus> { return this.raw.then(r => r.stage(filePath, content)); }
	branch(name: string, checkout?: boolean): TPromise<IRawStatus> { return this.raw.then(r => r.branch(name, checkout)); }
	checkout(treeish?: string, filePaths?: string[]): TPromise<IRawStatus> { return this.raw.then(r => r.checkout(treeish, filePaths)); }
	clean(filePaths: string[]): TPromise<IRawStatus> { return this.raw.then(r => r.clean(filePaths)); }
	undo(): TPromise<IRawStatus> { return this.raw.then(r => r.undo()); }
	reset(treeish: string, hard?: boolean): TPromise<IRawStatus> { return this.raw.then(r => r.reset(treeish, hard)); }
	revertFiles(treeish: string, filePaths?: string[]): TPromise<IRawStatus> { return this.raw.then(r => r.revertFiles(treeish, filePaths)); }
	fetch(): TPromise<IRawStatus> { return this.raw.then(r => r.fetch()); }
	pull(rebase?: boolean): TPromise<IRawStatus> { return this.raw.then(r => r.pull(rebase)); }
	push(remote?: string, name?: string, options?: IPushOptions): TPromise<IRawStatus> { return this.raw.then(r => r.push(remote, name, options)); }
	sync(): TPromise<IRawStatus> { return this.raw.then(r => r.sync()); }
	commit(message: string, amend?: boolean, stage?: boolean, signoff?: boolean): TPromise<IRawStatus> { return this.raw.then(r => r.commit(message, amend, stage, signoff)); }
	detectMimetypes(path: string, treeish?: string): TPromise<string[]> { return this.raw.then(r => r.detectMimetypes(path, treeish)); }
	show(path: string, treeish?: string): TPromise<string> { return this.raw.then(r => r.show(path, treeish)); }
	clone(url: string, parentPath: string): TPromise<string> { return this.raw.then(r => r.clone(url, parentPath)); }
	getCommitTemplate(): TPromise<string> { return this.raw.then(r => r.getCommitTemplate()); }
	getCommit(ref: string): TPromise<ICommit> { return this.raw.then(r => r.getCommit(ref)); }
}