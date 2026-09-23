/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IGitHubService } from '../../../../platform/github/common/githubService.js';
import { GitHubCommit } from '../../../../platform/github/common/githubQueryService.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export interface IGitHubCommitTarget {
	readonly owner: string;
	readonly repo: string;
	readonly sha: string;
	readonly resource: URI;
}

interface IGitHubCommitEntry {
	readonly target: IGitHubCommitTarget;
	readonly value: ReturnType<typeof observableValue<GitHubCommit | undefined>>;
	readonly subscription: MutableDisposable<DisposableStore>;
	generation: number;
}

export function parseGitHubCommitTarget(resource: URI): IGitHubCommitTarget | undefined {
	if (resource.authority.toLowerCase() !== 'github.com') {
		return undefined;
	}
	const match = /^\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/commit\/(?<sha>[^/]+)(?:\/|$)/.exec(resource.path);
	const owner = match?.groups?.owner;
	const repo = match?.groups?.repo;
	const sha = match?.groups?.sha;
	return owner && repo && sha ? { owner, repo, sha, resource } : undefined;
}

export class GitHubCommitResolver extends Disposable {

	private readonly _entries = new Map<string, IGitHubCommitEntry>();

	constructor(
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._gitHubService.credentials.onDidInvalidate(() => {
			for (const entry of this._entries.values()) {
				this._initialize(entry);
			}
		}));
	}

	get(target: IGitHubCommitTarget): IObservable<GitHubCommit | undefined> {
		const key = commitTargetKey(target);
		let entry = this._entries.get(key);
		if (!entry) {
			entry = {
				target,
				value: observableValue<GitHubCommit | undefined>(this, undefined),
				subscription: this._register(new MutableDisposable<DisposableStore>()),
				generation: 0,
			};
			this._entries.set(key, entry);
			this._initialize(entry);
		}
		return entry.value;
	}

	retain(targets: readonly IGitHubCommitTarget[]): void {
		const retainedKeys = new Set(targets.map(commitTargetKey));
		for (const [key, entry] of this._entries) {
			if (!retainedKeys.has(key)) {
				this._store.delete(entry.subscription);
				this._entries.delete(key);
			}
		}
	}

	private _initialize(entry: IGitHubCommitEntry): void {
		const generation = ++entry.generation;
		const store = new DisposableStore();
		entry.subscription.value = store;
		const controller = new AbortController();
		store.add(toDisposable(() => controller.abort()));
		void this._gitHubService.credentials.getCredential(controller.signal).then(credential => {
			if (controller.signal.aborted || generation !== entry.generation) {
				return;
			}
			const subscription = store.add(this._gitHubService.query.subscribeCommit({
				...credential.account,
				owner: entry.target.owner,
				repo: entry.target.repo,
				sha: entry.target.sha,
			}, { priority: 'visible' }));
			store.add(autorun(reader => entry.value.set(subscription.resource.state.read(reader).value, undefined)));
			void subscription.refresh().catch(error => this._logService.warn('[GitHubCommitResolver] Failed to refresh GitHub commit', error));
		}, error => {
			if (!controller.signal.aborted) {
				this._logService.warn('[GitHubCommitResolver] Failed to resolve GitHub credentials', error);
			}
		});
	}
}

function commitTargetKey(target: IGitHubCommitTarget): string {
	return `${target.owner.toLowerCase()}/${target.repo.toLowerCase()}@${target.sha.toLowerCase()}`;
}
