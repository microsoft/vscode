/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../base/common/observable.js';
import { IWorkbenchGitHubService } from '../../../services/github/common/githubService.js';
import { GitHubCommit } from '../../../../platform/github/common/githubQueryService.js';
import { IGitHubCommitTarget } from '../../../../platform/github/common/githubUrls.js';
import { ILogService } from '../../../../platform/log/common/log.js';

interface IGitHubCommitEntry {
	readonly target: IGitHubCommitTarget;
	readonly value: ReturnType<typeof observableValue<GitHubCommit | undefined>>;
	readonly subscription: MutableDisposable<DisposableStore>;
	generation: number;
}

export class GitHubCommitResolver extends Disposable {

	private readonly _entries = new Map<string, IGitHubCommitEntry>();

	constructor(
		@IWorkbenchGitHubService private readonly _gitHubService: IWorkbenchGitHubService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._gitHubService.onDidChangeDefaultClient(() => {
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
		}
		if (!entry.subscription.value) {
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
		entry.value.set(undefined, undefined);
		const controller = new AbortController();
		store.add(toDisposable(() => controller.abort()));
		void this._gitHubService.acquireDefaultAccountClient(controller.signal).then(async reference => {
			if (store.isDisposed) {
				reference.dispose();
				return;
			}
			const client = store.add(reference).object;
			const credential = await client.credentials.getCredential(controller.signal);
			if (controller.signal.aborted || generation !== entry.generation) {
				return;
			}
			const subscription = store.add(client.query.subscribeCommit({
				...credential.account,
				owner: entry.target.owner,
				repo: entry.target.repo,
				sha: entry.target.sha,
			}, { priority: 'visible' }));
			store.add(autorun(reader => entry.value.set(subscription.resource.state.read(reader).value, undefined)));
			void subscription.refresh().catch(error => this._logService.warn('[GitHubCommitResolver] Failed to refresh GitHub commit', error));
		}).catch(error => {
			if (!controller.signal.aborted && generation === entry.generation) {
				this._logService.warn('[GitHubCommitResolver] Failed to resolve GitHub credentials', error);
				entry.subscription.clear();
			}
		});
	}
}

function commitTargetKey(target: IGitHubCommitTarget): string {
	return `${target.owner.toLowerCase()}/${target.repo.toLowerCase()}@${target.sha.toLowerCase()}`;
}
