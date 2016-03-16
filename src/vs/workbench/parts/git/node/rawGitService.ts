/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import path = require('path');
import { TPromise, Promise } from 'vs/base/common/winjs.base';
import mime = require('vs/base/node/mime');
import pfs = require('vs/base/node/pfs');
import { Repository, GitError } from 'vs/workbench/parts/git/node/git.lib';
import { IRawGitService, RawServiceState, IRawStatus, IHead, GitErrorCodes, IPushOptions } from 'vs/workbench/parts/git/common/git';

export class RawGitService implements IRawGitService {

	private repo: Repository;
	private _repositoryRoot: TPromise<string>;

	constructor(repo: Repository) {
		this.repo = repo;
	}

	getVersion(): TPromise<string> {
		return TPromise.as(this.repo.version);
	}

	private getRepositoryRoot(): TPromise<string> {
		return this._repositoryRoot || (this._repositoryRoot = pfs.realpath(this.repo.path));
	}

	public serviceState(): TPromise<RawServiceState> {
		return TPromise.as<RawServiceState>(this.repo
			? RawServiceState.OK
			: RawServiceState.GitNotFound
		);
	}

	public status(): TPromise<IRawStatus> {
		return this.repo.getStatus()
			.then(status => this.repo.getHEAD()
				.then(HEAD => {
					if (HEAD.name) {
						return this.repo.getBranch(HEAD.name).then(null, () => HEAD);
					} else {
						return HEAD;
					}
				}, (): IHead => null)
				.then(HEAD => Promise.join([this.getRepositoryRoot(), this.repo.getHeads(), this.repo.getTags(), this.repo.getRemotes()]).then(r => {
					return {
						repositoryRoot: r[0],
						status: status,
						HEAD: HEAD,
						heads: r[1],
						tags: r[2],
						remotes: r[3]
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

	public init(): TPromise<IRawStatus> {
		return this.repo.init().then(() => this.status());
	}

	public add(filePaths?: string[]): TPromise<IRawStatus> {
		return this.repo.add(filePaths).then(() => this.status());
	}

	public stage(filePath: string, content: string): TPromise<IRawStatus> {
		return this.repo.stage(filePath, content).then(() => this.status());
	}

	public branch(name: string, checkout?: boolean): TPromise<IRawStatus> {
		return this.repo.branch(name, checkout).then(() => this.status());
	}

	public checkout(treeish?: string, filePaths?: string[]): TPromise<IRawStatus> {
		return this.repo.checkout(treeish, filePaths).then(() => this.status());
	}

	public clean(filePaths: string[]): TPromise<IRawStatus> {
		return this.repo.clean(filePaths).then(() => this.status());
	}

	public undo(): TPromise<IRawStatus> {
		return this.repo.undo().then(() => this.status());
	}

	public reset(treeish: string, hard?: boolean): TPromise<IRawStatus> {
		return this.repo.reset(treeish, hard).then(() => this.status());
	}

	public revertFiles(treeish: string, filePaths?: string[]): TPromise<IRawStatus> {
		return this.repo.revertFiles(treeish, filePaths).then(() => this.status());
	}

	public fetch(): TPromise<IRawStatus> {
		return this.repo.fetch().then(null, (err) => {
			if (err.gitErrorCode === GitErrorCodes.NoRemoteRepositorySpecified) {
				return TPromise.as(null);
			}

			return Promise.wrapError(err);
		}).then(() => this.status());
	}

	public pull(rebase?: boolean): TPromise<IRawStatus> {
		return this.repo.pull(rebase).then(() => this.status());
	}

	public push(remote?: string, name?: string, options?:IPushOptions): TPromise<IRawStatus> {
		return this.repo.push(remote, name, options).then(() => this.status());
	}

	public sync(): TPromise<IRawStatus> {
		return this.repo.sync().then(() => this.status());
	}

	public commit(message:string, amend?: boolean, stage?: boolean): TPromise<IRawStatus> {
		var promise: Promise = TPromise.as(null);

		if (stage) {
			promise = this.repo.add(null);
		}

		return promise
			.then(() => this.repo.commit(message, stage, amend))
			.then(() => this.status());
	}

	public detectMimetypes(filePath: string, treeish?: string): TPromise<string[]> {
		return pfs.exists(path.join(this.repo.path, filePath)).then((exists) => {
			if (exists) {
				return new TPromise<string[]>((c, e) => {
					mime.detectMimesFromFile(path.join(this.repo.path, filePath), (err, result) => {
						if (err) { e(err); }
						else { c(result.mimes); }
					});
				});
			}

			var child = this.repo.show(treeish + ':' + filePath);

			return new TPromise<string[]>((c, e) => {
				mime.detectMimesFromStream(child.stdout, filePath, (err, result) => {
					if (err) { e(err); }
					else { c(result.mimes); }
				});
			});
		});
	}

	// careful, this buffers the whole object into memory
	public show(filePath: string, treeish?: string): TPromise<string> {
		treeish = treeish === '~' ? '' : treeish;
		return this.repo.buffer(treeish + ':' + filePath).then(null, e => {
			if (e instanceof GitError) {
				return ''; // mostly untracked files end up in a git error
			}

			return TPromise.wrapError<string>(e);
		});
	}

	public onOutput(): Promise {
		var cancel: () => void;

		return new Promise((c, e, p) => {
			cancel = this.repo.onOutput(p);
		}, () => cancel());
	}
}

export class DelayedRawGitService implements IRawGitService {

	constructor(private raw: TPromise<IRawGitService>) { }

	getVersion(): TPromise<string> {
		return this.raw.then(raw => raw.getVersion());
	}

	public serviceState(): TPromise<RawServiceState> {
		return this.raw.then(raw => raw.serviceState());
	}

	public status(): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.status());
	}

	public init(): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.init());
	}

	public add(filesPaths?: string[]): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.add(filesPaths));
	}

	public stage(filePath: string, content: string): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.stage(filePath, content));
	}

	public branch(name: string, checkout?: boolean): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.branch(name, checkout));
	}

	public checkout(treeish?: string, filePaths?: string[]): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.checkout(treeish, filePaths));
	}

	public clean(filePaths: string[]): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.clean(filePaths));
	}

	public undo(): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.undo());
	}

	public reset(treeish: string, hard?: boolean): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.reset(treeish, hard));
	}

	public revertFiles(treeish: string, filePaths?: string[]): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.revertFiles(treeish, filePaths));
	}

	public fetch(): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.fetch());
	}

	public pull(rebase?: boolean): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.pull(rebase));
	}

	public push(origin?: string, name?: string, options?:IPushOptions): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.push(origin, name, options));
	}

	public sync(): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.sync());
	}

	public commit(message: string, amend?: boolean, stage?: boolean): TPromise<IRawStatus> {
		return this.raw.then(raw => raw.commit(message, amend, stage));
	}

	public detectMimetypes(path: string, treeish?: string): TPromise<string[]> {
		return this.raw.then(raw => raw.detectMimetypes(path, treeish));
	}

	public show(path: string, treeish?: string): TPromise<string> {
		return this.raw.then(raw => raw.show(path, treeish));
	}

	public onOutput(): Promise {
		return this.raw.then(raw => raw.onOutput());
	}
}