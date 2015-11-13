/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import path = require('path');
import winjs = require('vs/base/common/winjs.base');
import mime = require('vs/base/node/mime');
import pfs = require('vs/base/node/pfs');
import { Repository, GitError } from 'vs/workbench/parts/git/node/git.lib';
import { IRawGitService, RawServiceState, IRawStatus, IHead, GitErrorCodes } from 'vs/workbench/parts/git/common/git';

function pathsAreEqual(p1: string, p2: string): boolean {
	if (/^(win32|darwin)$/.test(process.platform)) {
		p1 = p1.toLowerCase();
		p2 = p2.toLowerCase();
	}

	return p1 === p2;
}

export class RawGitService implements IRawGitService {

	private repo: Repository;
	private repoRealRootPath: winjs.TPromise<string>;

	constructor(repo: Repository) {
		this.repo = repo;
		this.repoRealRootPath = null;
	}

	public serviceState(): winjs.TPromise<RawServiceState> {
		return winjs.TPromise.as<RawServiceState>(this.repo
			? RawServiceState.OK
			: RawServiceState.GitNotFound
		);
	}

	public status(): winjs.TPromise<IRawStatus> {
		return this.checkRoot()
			.then(() => this.repo.getStatus())
			.then(status => this.repo.getHEAD()
				.then(HEAD => {
					if (HEAD.name) {
						return this.repo.getBranch(HEAD.name).then(null, () => HEAD);
					} else {
						return HEAD;
					}
				}, (): IHead => null)
				.then(HEAD => winjs.Promise.join([this.repo.getHeads(), this.repo.getTags()]).then(r => {
					return {
						status: status,
						HEAD: HEAD,
						heads: r[0],
						tags: r[1]
					};
				})))
			.then(null, (err) => {
				if (err.gitErrorCode === GitErrorCodes.BadConfigFile) {
					return winjs.Promise.wrapError(err);
				} else if (err.gitErrorCode === GitErrorCodes.NotAtRepositoryRoot) {
					return winjs.Promise.wrapError(err);
				}

				return null;
			});
	}

	public init(): winjs.TPromise<IRawStatus> {
		return this.repo.init().then(() => this.status());
	}

	public add(filePaths?: string[]): winjs.TPromise<IRawStatus> {
		return this.repo.add(filePaths).then(() => this.status());
	}

	public stage(filePath: string, content: string): winjs.TPromise<IRawStatus> {
		return this.repo.stage(filePath, content).then(() => this.status());
	}

	public branch(name: string, checkout?: boolean): winjs.TPromise<IRawStatus> {
		return this.repo.branch(name, checkout).then(() => this.status());
	}

	public checkout(treeish?: string, filePaths?: string[]): winjs.TPromise<IRawStatus> {
		return this.repo.checkout(treeish, filePaths).then(() => this.status());
	}

	public clean(filePaths: string[]): winjs.TPromise<IRawStatus> {
		return this.repo.clean(filePaths).then(() => this.status());
	}

	public undo(): winjs.TPromise<IRawStatus> {
		return this.repo.undo().then(() => this.status());
	}

	public reset(treeish: string, hard?: boolean): winjs.TPromise<IRawStatus> {
		return this.repo.reset(treeish, hard).then(() => this.status());
	}

	public revertFiles(treeish: string, filePaths?: string[]): winjs.TPromise<IRawStatus> {
		return this.repo.revertFiles(treeish, filePaths).then(() => this.status());
	}

	public fetch(): winjs.TPromise<IRawStatus> {
		return this.repo.fetch().then(null, (err) => {
			if (err.gitErrorCode === GitErrorCodes.NoRemoteRepositorySpecified) {
				return winjs.Promise.as(null);
			}

			return winjs.Promise.wrapError(err);
		}).then(() => this.status());
	}

	public pull(): winjs.TPromise<IRawStatus> {
		return this.repo.pull().then(() => this.status());
	}

	public push(): winjs.TPromise<IRawStatus> {
		return this.repo.push().then(() => this.status());
	}

	public sync(): winjs.TPromise<IRawStatus> {
		return this.repo.sync().then(() => this.status());
	}

	public commit(message:string, amend?: boolean, stage?: boolean): winjs.TPromise<IRawStatus> {
		var promise: winjs.Promise = winjs.Promise.as(null);

		if (stage) {
			promise = this.repo.add(null);
		}

		return promise
			.then(() => this.repo.commit(message, stage, amend))
			.then(() => this.status());
	}

	public detectMimetypes(filePath: string, treeish?: string): winjs.TPromise<string[]> {
		return pfs.exists(path.join(this.repo.path, filePath)).then((exists) => {
			if (exists) {
				return new winjs.TPromise<string[]>((c, e) => {
					mime.detectMimesFromFile(path.join(this.repo.path, filePath), (err, result) => {
						if (err) { e(err); }
						else { c(result.mimes); }
					});
				});
			}

			var child = this.repo.show(treeish + ':' + filePath);

			return new winjs.TPromise<string[]>((c, e) => {
				mime.detectMimesFromStream(child.stdout, filePath, (err, result) => {
					if (err) { e(err); }
					else { c(result.mimes); }
				});
			});
		});
	}

	// careful, this buffers the whole object into memory
	public show(filePath: string, treeish?: string): winjs.TPromise<string> {
		treeish = treeish === '~' ? '' : treeish;
		return this.repo.buffer(treeish + ':' + filePath).then(null, e => {
			if (e instanceof GitError) {
				return ''; // mostly untracked files end up in a git error
			}

			return winjs.TPromise.wrapError<string>(e);
		});
	}

	public onOutput(): winjs.Promise {
		var cancel: () => void;

		return new winjs.Promise((c, e, p) => {
			cancel = this.repo.onOutput(p);
		}, () => cancel());
	}

	private checkRoot(): winjs.Promise {
		if (!this.repoRealRootPath) {
			this.repoRealRootPath = pfs.realpath(this.repo.path);
		}

		return this.repo.getRoot().then(root => {
			return winjs.Promise.join([
				this.repoRealRootPath,
				pfs.realpath(root)
			]).then(paths => {
				if (!pathsAreEqual(paths[0], paths[1])) {
					return winjs.Promise.wrapError(new GitError({
						message: 'Not at the repository root',
						gitErrorCode: GitErrorCodes.NotAtRepositoryRoot
					}));
				}
			});
		});
	}
}
