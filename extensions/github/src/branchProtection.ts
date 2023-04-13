/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter, Memento, Uri, workspace } from 'vscode';
import { getOctokit } from './auth';
import { API, BranchProtection, BranchProtectionProvider, Repository } from './typings/git';
import { DisposableStore, getRepositoryFromUrl } from './util';

export class GithubBranchProtectionProviderManager {

	private readonly disposables = new DisposableStore();
	private readonly providerDisposables = new DisposableStore();

	private _enabled = false;
	private set enabled(enabled: boolean) {
		if (this._enabled === enabled) {
			return;
		}

		if (enabled) {
			for (const repository of this.gitAPI.repositories) {
				this.providerDisposables.add(this.gitAPI.registerBranchProtectionProvider(repository.rootUri, new GithubBranchProtectionProvider(repository, this.globalState)));
			}
		} else {
			this.providerDisposables.dispose();
		}

		this._enabled = enabled;
	}

	constructor(private readonly gitAPI: API, private readonly globalState: Memento) {
		this.disposables.add(this.gitAPI.onDidOpenRepository(repository => {
			if (this._enabled) {
				this.providerDisposables.add(gitAPI.registerBranchProtectionProvider(repository.rootUri, new GithubBranchProtectionProvider(repository, this.globalState)));
			}
		}));

		this.disposables.add(workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('github.branchProtection')) {
				this.updateEnablement();
			}
		}));

		this.updateEnablement();
	}

	private updateEnablement(): void {
		const config = workspace.getConfiguration('github', null);
		this.enabled = config.get<boolean>('branchProtection', true) === true;
	}

	dispose(): void {
		this.enabled = false;
		this.disposables.dispose();
	}

}

export class GithubBranchProtectionProvider implements BranchProtectionProvider {
	private readonly _onDidChangeBranchProtection = new EventEmitter<Uri>();
	onDidChangeBranchProtection = this._onDidChangeBranchProtection.event;

	private branchProtection: BranchProtection[];
	private readonly globalStateKey = `branchProtection:${this.repository.rootUri.toString()}`;

	constructor(private readonly repository: Repository, private readonly globalState: Memento) {
		// Restore branch protection from global state
		this.branchProtection = this.globalState.get<BranchProtection[]>(this.globalStateKey, []);

		repository.status()
			.then(() => this.initializeBranchProtection());
	}

	provideBranchProtection(): BranchProtection[] {
		return this.branchProtection;
	}

	private async initializeBranchProtection(): Promise<void> {
		// Branch protection (HEAD)
		await this.updateHEADBranchProtection();

		// Branch protection (remotes)
		await this.updateBranchProtection();
	}

	private async updateHEADBranchProtection(): Promise<void> {
		try {
			const HEAD = this.repository.state.HEAD;

			if (!HEAD?.name || !HEAD?.upstream?.remote) {
				return;
			}

			const remoteName = HEAD.upstream.remote;
			const remote = this.repository.state.remotes.find(r => r.name === remoteName);

			if (!remote) {
				return;
			}

			const repository = getRepositoryFromUrl(remote.pushUrl ?? remote.fetchUrl ?? '');

			if (!repository) {
				return;
			}

			const octokit = await getOctokit();
			const response = await octokit.repos.getBranch({ ...repository, branch: HEAD.name });

			if (!response.data.protected) {
				return;
			}

			this.branchProtection = [{ remote: remote.name, branches: [HEAD.name] }];
			this._onDidChangeBranchProtection.fire(this.repository.rootUri);
		} catch {
			// todo@lszomoru - add logging
		}
	}

	private async updateBranchProtection(): Promise<void> {
		try {
			const branchProtection: BranchProtection[] = [];

			for (const remote of this.repository.state.remotes) {
				const repository = getRepositoryFromUrl(remote.pushUrl ?? remote.fetchUrl ?? '');

				if (!repository) {
					continue;
				}

				const octokit = await getOctokit();

				let page = 1;
				const protectedBranches: string[] = [];

				while (true) {
					const response = await octokit.repos.listBranches({ ...repository, protected: true, per_page: 100, page });

					if (response.data.length === 0) {
						break;
					}

					protectedBranches.push(...response.data.map(b => b.name));
					page++;
				}

				branchProtection.push({ remote: remote.name, branches: protectedBranches });
			}

			this.branchProtection = branchProtection;
			this._onDidChangeBranchProtection.fire(this.repository.rootUri);

			// Save branch protection to global state
			await this.globalState.update(this.globalStateKey, branchProtection);
		} catch {
			// todo@lszomoru - add logging
		}
	}

}
