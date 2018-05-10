/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Remote } from './remote';
import { GitProcess } from 'dugite';
import { uniqBy, anyEvent, filterEvent, isDescendant } from '../util';
import { parseRemote } from '../remote';
import { CredentialStore } from '../../credentials';
import { PullRequestModel, PRType } from './pullRequestModel';
import { UriString } from './uriString';
import { GitError, GitErrorCodes } from './gitError';

export enum RefType {
	Head,
	RemoteHead,
	Tag
}

export interface Ref {
	type: RefType;
	name?: string;
	commit?: string;
	remote?: string;
}

export interface UpstreamRef {
	remote: string;
	name: string;
}

export interface Branch extends Ref {
	upstream?: UpstreamRef;
	ahead?: number;
	behind?: number;
}

export class Repository {
	public path: string;

	private _onDidRunGitStatus = new vscode.EventEmitter<void>();
	readonly onDidRunGitStatus: vscode.Event<void> = this._onDidRunGitStatus.event;

	public githubRepositories?: GitHubRepository[];

	private _HEAD: Branch | undefined;
	get HEAD(): Branch | undefined {
		return this._HEAD;
	}

	private _refs: Ref[] = [];
	get refs(): Ref[] {
		return this._refs;
	}

	private _remotes: Remote[] = [];
	get remotes(): Remote[] {
		return this._remotes;
	}

	// todo
	private _cloneUrl: UriString;
	get cloneUrl(): UriString {
		return this._cloneUrl;
	}

	private statusTimeout: any;
	private disposables: vscode.Disposable[] = [];

	constructor(path: string, workspaceState: vscode.Memento) {
		this.path = path;

		const fsWatcher = vscode.workspace.createFileSystemWatcher('**');
		this.disposables.push(fsWatcher);

		const onWorkspaceChange = anyEvent(fsWatcher.onDidChange, fsWatcher.onDidCreate, fsWatcher.onDidDelete);
		const onRepositoryChange = filterEvent(onWorkspaceChange, uri => isDescendant(this.path, uri.fsPath));
		const onRelevantRepositoryChange = filterEvent(onRepositoryChange, uri => !/\/\.git(\/index\.lock)?$/.test(uri.path));
		onRelevantRepositoryChange(this.onFSChange, this, this.disposables);

		this.status();
	}

	onFSChange() {
		clearTimeout(this.statusTimeout);

		this.statusTimeout = setTimeout(() => {
			this.status();
		}, 1000);
	}

	async status() {
		let HEAD: Branch | undefined;

		try {
			HEAD = await this.getHEAD();

			if (HEAD.name) {
				try {
					HEAD = await this.getBranch(HEAD.name);
				} catch (err) {
					// noop
				}
			}
		} catch (err) {
			// noop
		}

		const [refs, remotes] = await Promise.all([this.getRefs(), this.getRemotes()]);
		this._HEAD = HEAD;
		this._refs = refs;
		this._remotes = remotes;

		if (this._HEAD.upstream && this._HEAD.upstream.remote) {
			let currentRemote = this._remotes.filter(remote => remote.remoteName === this._HEAD.upstream.remote);
			if (currentRemote && currentRemote.length) {
				this._cloneUrl = new UriString(currentRemote[0].url);
			}
		}

		this._onDidRunGitStatus.fire();
	}

	async connectGitHub(credentialStore: CredentialStore) {
		let ret: GitHubRepository[] = [];
		await Promise.all(this.remotes.map(async remote => {
			let octo = await credentialStore.getOctokit(remote);
			if (octo) {
				ret.push(new GitHubRepository(remote, octo));
			}
		}));

		this.githubRepositories = ret;
	}

	async fetch(remoteName: string, branch: string) {
		const result = await GitProcess.exec(
			[
				'fetch',
				remoteName,
				branch
			],
			this.path
		);

		if (result.exitCode !== 0) {
			throw (result.stderr);
		}
	}

	async checkout(branch: string) {
		const result = await GitProcess.exec(
			[
				'checkout',
				branch
			],
			this.path
		);

		if (result.exitCode !== 0) {
			let rej = new GitError({
				stdout: result.stdout,
				stderr: result.stderr,
			});
			if (/error: Your local changes to the following files would be overwritten/.test(result.stderr || '')) {
				rej.gitErrorCode = GitErrorCodes.LocalChangesOverwritten;
			}
			throw rej;
		}
	}

	async getHEAD(): Promise<Ref> {
		try {
			const result = await GitProcess.exec(['symbolic-ref', '--short', 'HEAD'], this.path);

			if (!result.stdout) {
				throw new Error('Not in a branch');
			}

			return { name: result.stdout.trim(), commit: void 0, type: RefType.Head };
		} catch (err) {
			const result = await GitProcess.exec(['rev-parse', 'HEAD'], this.path);

			if (!result.stdout) {
				throw new Error('Error parsing HEAD');
			}

			return { name: void 0, commit: result.stdout.trim(), type: RefType.Head };
		}
	}

	async createBranch(branchName: string, tip?: string) {
		const result = await GitProcess.exec(['branch', branchName, tip ? tip : ''], this.path);

		if (result.exitCode !== 0) {
			throw new Error(result.stderr);
		}
	}

	async getBranch(name: string): Promise<Branch> {
		if (name === 'HEAD') {
			return this.getHEAD();
		}

		const result = await GitProcess.exec(['rev-parse', name], this.path);

		if (result.exitCode !== 0 || !result.stdout) {
			return null;
		}

		const commit = result.stdout.trim();

		try {
			const res2 = await GitProcess.exec(['rev-parse', '--symbolic-full-name', name + '@{u}'], this.path);
			const fullUpstream = res2.stdout.trim();
			const match = /^refs\/remotes\/([^/]+)\/(.+)$/.exec(fullUpstream);

			if (!match) {
				throw new Error(`Could not parse upstream branch: ${fullUpstream}`);
			}

			const upstream = { remote: match[1], name: match[2] };
			const res3 = await GitProcess.exec(['rev-list', '--left-right', name + '...' + fullUpstream], this.path);

			let ahead = 0, behind = 0;
			let i = 0;

			while (i < res3.stdout.length) {
				switch (res3.stdout.charAt(i)) {
					case '<': ahead++; break;
					case '>': behind++; break;
					default: i++; break;
				}

				while (res3.stdout.charAt(i++) !== '\n') { /* no-op */ }
			}

			return { name, type: RefType.Head, commit, upstream, ahead, behind };
		} catch (err) {
			return { name, type: RefType.Head, commit };
		}
	}

	async getRefs(): Promise<Ref[]> {
		const result = await GitProcess.exec(['for-each-ref', '--format', '%(refname) %(objectname)', '--sort', '-committerdate'], this.path);

		const fn = (line: string): Ref | null => {
			let match: RegExpExecArray | null;

			if (match = /^refs\/heads\/([^ ]+) ([0-9a-f]{40})$/.exec(line)) {
				return { name: match[1], commit: match[2], type: RefType.Head };
			} else if (match = /^refs\/remotes\/([^/]+)\/([^ ]+) ([0-9a-f]{40})$/.exec(line)) {
				return { name: `${match[1]}/${match[2]}`, commit: match[3], type: RefType.RemoteHead, remote: match[1] };
			} else if (match = /^refs\/tags\/([^ ]+) ([0-9a-f]{40})$/.exec(line)) {
				return { name: match[1], commit: match[2], type: RefType.Tag };
			}

			return null;
		};

		return result.stdout.trim().split('\n')
			.filter(line => !!line)
			.map(fn)
			.filter(ref => !!ref) as Ref[];
	}

	async getRemotes(): Promise<Remote[]> {
		const result = await GitProcess.exec(['remote', '--verbose'], this.path);
		const regex = /^([^\s]+)\s+([^\s]+)\s/;
		const rawRemotes = result.stdout.trim().split('\n')
			.filter(b => !!b)
			.map(line => regex.exec(line) as RegExpExecArray)
			.filter(g => !!g)
			.map((groups: RegExpExecArray) => ({ name: groups[1], url: groups[2] }));

		return uniqBy(rawRemotes, remote => remote.name).map(remote => parseRemote(remote.name, remote.url));
	}

	async show(filePath: string): Promise<string> {
		try {
			const result = await GitProcess.exec(['show', filePath], this.path);
			return result.stdout.trim();
		} catch (e) {
			return '';
		}
	}

	async diff(filePath: string, compareWithCommit: string): Promise<string> {
		try {
			let args = ['diff', filePath];
			if (compareWithCommit) {
				args = ['diff', compareWithCommit, '--', filePath];
			}

			const result = await GitProcess.exec(args, this.path);
			return result.stdout.trim();
		} catch (e) {
			return '';
		}
	}

	async setConfig(key: string, value: string) {
		await GitProcess.exec(['config', '--local', key, value], this.path);
	}

	async getConfig(key: string) {
		let result = await GitProcess.exec(['config', '--local', '--get', key], this.path);

		if (result.exitCode !== 0) {
			return null;
		}

		return result.stdout.trim();
	}

	async getConfigs() {
		let result = await GitProcess.exec(['config', '--local', '-l'], this.path);

		if (result.exitCode !== 0) {
			return [];
		}

		let entries = result.stdout.trim().split(/\r|\r\n|\n/);

		return entries.map(entry => {
			let ret = entry.split('=');
			return {
				key: ret[0],
				value: ret[1]
			};
		});
	}

	async setTrackingBranch(localBranchName: string, trackedBranchName: string) {
		let result = await GitProcess.exec(['branch', `--set-upstream-to=${trackedBranchName}`, localBranchName], this.path);

		if (result.exitCode !== 0) {
			throw (result.exitCode);
		}
	}

	async addRemote(name: string, remoteUrl: string) {
		let result = await GitProcess.exec(['remote', 'add', name, remoteUrl], this.path);

		if (result.exitCode !== 0) {
			throw (result.exitCode);
		}
	}
}

export class GitHubRepository {
	constructor(public readonly remote: Remote, public readonly octokit: any) {
	}

	async getPullRequests(prType: PRType) {
		if (prType === PRType.All) {
			let result = await this.octokit.pullRequests.getAll({
				owner: this.remote.owner,
				repo: this.remote.name,
			});
			let ret = result.data.map(item => new PullRequestModel(this.octokit, this.remote, item));
			return ret;
		} else {

			const user = await this.octokit.users.get();
			const { data } = await this.octokit.search.issues({
				q: this.getPRFetchQuery(this.remote.owner, this.remote.name, user.data.login, prType)
			});
			let promises = [];

			data.items.forEach(item => {
				promises.push(new Promise(async (resolve, reject) => {
					let prData = await this.octokit.pullRequests.get({
						owner: this.remote.owner,
						repo: this.remote.name,
						number: item.number
					});
					resolve(prData);
				}));
			});

			return Promise.all(promises).then(values => {
				return values.map(item => new PullRequestModel(this.octokit, this.remote, item.data));
			});
		}
	}

	async getPullRequest(id: number) {
		let { data } = await this.octokit.pullRequests.get({
			owner: this.remote.owner,
			repo: this.remote.name,
			number: id
		});
		let ret = new PullRequestModel(this.octokit, this.remote, data);
		return ret;
	}

	async getUser() {
		return await this.octokit.users.get();
	}

	private getPRFetchQuery(owner: string, repo: string, user: string, type: PRType) {
		let filter = '';
		switch (type) {
			case PRType.RequestReview:
				filter = `review-requested:${user}`;
				break;
			case PRType.ReviewedByMe:
				filter = `reviewed-by:${user}`;
				break;
			case PRType.Mine:
				filter = `author:${user}`;
				break;
			default:
				break;
		}

		return `is:open ${filter} type:pr repo:${owner}/${repo}`;
	}
}