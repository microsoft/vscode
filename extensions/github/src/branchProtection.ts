/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter, LogOutputChannel, Memento, Uri, workspace } from 'vscode';
import { getOctokit } from './auth';
import { API, BranchProtection, BranchProtectionProvider, BranchProtectionRule, Repository } from './typings/git';
import { DisposableStore, getRepositoryFromUrl } from './util';

interface RepositoryRuleset {
	readonly id: number;
	readonly conditions: {
		ref_name: {
			exclude: string[];
			include: string[];
		};
	};
	readonly enforcement: 'active' | 'disabled' | 'evaluate';
	readonly rules: RepositoryRule[];
	readonly target: 'branch' | 'tag';
}

interface RepositoryRule {
	readonly type: string;
}

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
				this.providerDisposables.add(this.gitAPI.registerBranchProtectionProvider(repository.rootUri, new GithubBranchProtectionProvider(repository, this.globalState, this.logger)));
			}
		} else {
			this.providerDisposables.dispose();
		}

		this._enabled = enabled;
	}

	constructor(
		private readonly gitAPI: API,
		private readonly globalState: Memento,
		private readonly logger: LogOutputChannel) {
		this.disposables.add(this.gitAPI.onDidOpenRepository(repository => {
			if (this._enabled) {
				this.providerDisposables.add(gitAPI.registerBranchProtectionProvider(repository.rootUri, new GithubBranchProtectionProvider(repository, this.globalState, this.logger)));
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

	constructor(
		private readonly repository: Repository,
		private readonly globalState: Memento,
		private readonly logger: LogOutputChannel) {
		// Restore branch protection from global state
		this.branchProtection = this.globalState.get<BranchProtection[]>(this.globalStateKey, []);

		repository.status()
			.then(() => this.initializeBranchProtection());
	}

	provideBranchProtection(): BranchProtection[] {
		return this.branchProtection;
	}

	private async initializeBranchProtection(): Promise<void> {
		try {
			// Branch protection (HEAD)
			await this.updateHEADBranchProtection();

			// Branch protection (remotes)
			await this.updateRepositoryBranchProtection();
		} catch (err) {
			// noop
			this.logger.warn(`Failed to initialize branch protection: ${this.formatErrorMessage(err)}`);
		}
	}

	private async hasPushPermission(repository: { owner: string; repo: string }): Promise<boolean> {
		try {
			const octokit = await getOctokit();
			const response = await octokit.repos.get({ ...repository });

			return response.data.permissions?.push === true;
		} catch (err) {
			this.logger.warn(`Failed to get repository permissions for repository (${repository.owner}/${repository.repo}): ${this.formatErrorMessage(err)}`);
			throw err;
		}
	}

	private async getBranchRules(repository: { owner: string; repo: string }, branch: string): Promise<RepositoryRule[]> {
		try {
			const octokit = await getOctokit();
			const response = await octokit.request('GET /repos/{owner}/{repo}/rules/branches/{branch}', {
				...repository,
				branch,
				headers: {
					'X-GitHub-Api-Version': '2022-11-28'
				}
			});
			return response.data as RepositoryRule[];
		} catch (err) {
			this.logger.warn(`Failed to get branch rules for repository (${repository.owner}/${repository.repo}), branch (${branch}): ${this.formatErrorMessage(err)}`);
			throw err;
		}
	}

	private async getRepositoryRulesets(repository: { owner: string; repo: string }): Promise<RepositoryRuleset[]> {

		try {
			const rulesets: RepositoryRuleset[] = [];
			const octokit = await getOctokit();
			for await (const response of octokit.paginate.iterator('GET /repos/{owner}/{repo}/rulesets', { ...repository, includes_parents: true })) {
				if (response.status !== 200) {
					continue;
				}

				for (const ruleset of response.data as RepositoryRuleset[]) {
					if (ruleset.target !== 'branch' || ruleset.enforcement !== 'active') {
						continue;
					}

					const response = await octokit.request('GET /repos/{owner}/{repo}/rulesets/{id}', {
						...repository,
						id: ruleset.id,
						headers: {
							'X-GitHub-Api-Version': '2022-11-28'
						}
					});

					const rulesetWithDetails = response.data as RepositoryRuleset;
					if (rulesetWithDetails?.rules.find(r => r.type === 'pull_request')) {
						rulesets.push(rulesetWithDetails);
					}
				}
			}

			return rulesets;
		}
		catch (err) {
			this.logger.warn(`Failed to get repository rulesets for repository (${repository.owner}/${repository.repo}): ${this.formatErrorMessage(err)}`);
			throw err;
		}
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

			if (!(await this.hasPushPermission(repository))) {
				return;
			}

			const rules = await this.getBranchRules(repository, HEAD.name);
			if (!rules.find(r => r.type === 'pull_request')) {
				return;
			}

			this.branchProtection = [{ remote: remote.name, rules: [{ include: [HEAD.name] }] }];
			this._onDidChangeBranchProtection.fire(this.repository.rootUri);
		} catch (err) {
			this.logger.warn(`Failed to update HEAD branch protection: ${this.formatErrorMessage(err)}`);
			throw err;
		}
	}

	private async updateRepositoryBranchProtection(): Promise<void> {
		try {
			const branchProtection: BranchProtection[] = [];

			for (const remote of this.repository.state.remotes) {
				const repository = getRepositoryFromUrl(remote.pushUrl ?? remote.fetchUrl ?? '');

				if (!repository) {
					continue;
				}

				if (!(await this.hasPushPermission(repository))) {
					continue;
				}

				// Repository details
				const octokit = await getOctokit();
				const response = await octokit.repos.get({ ...repository });

				// Repository rulesets
				const rulesets = await this.getRepositoryRulesets(repository);

				const parseRef = (ref: string): string => {
					if (ref.startsWith('refs/heads/')) {
						return ref.substring(11);
					} else if (ref === '~DEFAULT_BRANCH') {
						return response.data.default_branch;
					} else if (ref === '~ALL') {
						return '**/*';
					}

					return ref;
				};

				const rules: BranchProtectionRule[] = [];
				for (const ruleset of rulesets) {
					rules.push({
						include: ruleset.conditions.ref_name.include.map(r => parseRef(r)),
						exclude: ruleset.conditions.ref_name.exclude.map(r => parseRef(r))
					});
				}

				branchProtection.push({ remote: remote.name, rules });
			}

			this.branchProtection = branchProtection;
			this._onDidChangeBranchProtection.fire(this.repository.rootUri);

			// Save branch protection to global state
			await this.globalState.update(this.globalStateKey, branchProtection);
		} catch (err) {
			this.logger.warn(`Failed to update repository branch protection: ${this.formatErrorMessage(err)}`);
			throw err;
		}
	}

	private formatErrorMessage(err: any): string {
		return `${err.message ?? ''}${err.status ? ` (${err.status})` : ''}`;
	}
}
