/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from github/VisualStudio project, obtained from
 * https://github.com/github/VisualStudio/blob/master/src/GitHub.App/Services/PullRequestService.cs
 * ------------------------------------------------------------------------------------------ */

import { Repository } from '../common/models/repository';
import { PullRequestModel } from '../common/models/pullRequestModel';
import { UriString } from '../common/models/uriString';

const InvalidBranchCharsRegex = /[^0-9A-Za-z\-]/g;
const SettingCreatedByGHfVSC = 'created-by-ghfvsc';
const SettingGHfVSCPullRequest = 'ghfvs-pr-owner-number';
const BranchCapture = /branch\.(.+)\.ghfvsc-pr/;

export class PullRequestGitHelper {
	static async checkout(repository: Repository, pullRequest: PullRequestModel, localBranchName: string) {
		let existing = await repository.getBranch(localBranchName);
		if (existing) {
			await repository.checkout(localBranchName);
		} else if (repository.cloneUrl.equals(pullRequest.head.repositoryCloneUrl)) {
			await repository.fetch('origin', localBranchName);
			await repository.checkout(localBranchName);
		} else {
			// nothing matches
			let refSpec = `${pullRequest.head.ref}:${localBranchName}`;
			let remoteName = await PullRequestGitHelper.createRemote(repository, pullRequest.head.repositoryCloneUrl);

			await repository.fetch(remoteName, refSpec);
			await repository.checkout(localBranchName);
			await repository.setTrackingBranch(localBranchName, `refs/remotes/${remoteName}/${pullRequest.head.ref}`);
		}

		var prConfigKey = `branch.${localBranchName}.${SettingGHfVSCPullRequest}`;
		await repository.setConfig(prConfigKey, PullRequestGitHelper.buildGHfVSConfigKeyValue(pullRequest));
	}

	static async getLocalBranchesForPullRequest(repository: Repository, pullRequest: PullRequestModel): Promise<string[]> {
		if (PullRequestGitHelper.isPullRequestFromRepository(repository, pullRequest)) {
			return [pullRequest.head.ref];
		} else {
			let key = PullRequestGitHelper.buildGHfVSConfigKeyValue(pullRequest);

			let configs = await repository.getConfigs();

			return configs.map(config => {
				let matches = BranchCapture.exec(config.key);
				if (matches && matches.length) {
					return {
						branch: matches[1],
						value: config.value
					};
				} else {
					return {
						branch: null,
						value: config.value
					};
				}
			}).filter(c => c.branch && c.value === key).map(c => c.value);
		}
	}

	static async switchToBranch(repository: Repository, pullRequest: PullRequestModel): Promise<void> {
		let matchingBranches = await PullRequestGitHelper.getLocalBranchesForPullRequest(repository, pullRequest);
		if (matchingBranches && matchingBranches.length) {
			let branchName = matchingBranches[0];
			let remoteName = repository.HEAD.upstream.remote;

			if (!remoteName) {
				return;
			}

			await repository.fetch(remoteName, branchName);
			let branch = null;
			try {
				branch = await repository.getBranch(branchName);
			} catch (e) { }

			if (!branch) {
				const trackedBranchName = `refs/remotes/${remoteName}/${branchName}`;
				const trackedBranch = await repository.getBranch(trackedBranchName);

				if (trackedBranch) {
					// create branch
					await repository.createBranch(branchName, trackedBranch.commit);
					await repository.setTrackingBranch(branchName, trackedBranchName);
				} else {
					throw new Error(`Could not find branch '${trackedBranchName}'.`);
				}
			}

			await repository.checkout(branchName);
			await PullRequestGitHelper.markBranchAsPullRequest(repository, pullRequest, branchName);
		}
	}

	static async getDefaultLocalBranchName(repository: Repository, pullRequestNumber: number, pullRequestTitle: string): Promise<string> {
		let initial = 'pr/' + pullRequestNumber + '-' + PullRequestGitHelper.getSafeBranchName(pullRequestTitle);
		let current = initial;
		let index = 2;

		while (true) {
			let currentBranch = await repository.getBranch(current);

			if (currentBranch) {
				current = initial + '-' + index++;
			} else {
				break;
			}
		}

		return current.replace(/-*$/g, '');
	}

	static async getPullRequestForCurrentBranch(repository: Repository) {
		let configKey = `branch.${repository.HEAD.name}.${SettingGHfVSCPullRequest}`;
		let configValue = await repository.getConfig(configKey);
		return PullRequestGitHelper.parseGHfVSConfigKeyValue(configValue);
	}

	static getSafeBranchName(name: string): string {
		let before = name.replace(InvalidBranchCharsRegex, '-').replace(/-*$/g, '');

		for (; ;) {
			let after = before.replace('--', '-');

			if (after === before) {
				return before.toLocaleLowerCase();
			}

			before = after;
		}
	}

	static buildGHfVSConfigKeyValue(pullRequest: PullRequestModel) {
		return pullRequest.base.repositoryCloneUrl.owner + '#' + pullRequest.prNumber;
	}
	static parseGHfVSConfigKeyValue(value: string) {
		if (value) {
			let separator = value.indexOf('#');
			if (separator !== -1) {
				let owner = value.substring(0, separator);
				let prNumber = Number(value.substr(separator + 1));

				if (prNumber) {
					return {
						owner: owner,
						prNumber: prNumber
					};
				}
			}
		}

		return null;
	}

	static async createRemote(repository: Repository, cloneUrl: UriString) {
		let remotes = repository.remotes;

		remotes.forEach(remote => {
			if (new UriString(remote.url).equals(cloneUrl)) {
				return remote.name;
			}
		});

		var remoteName = PullRequestGitHelper.createUniqueRemoteName(repository, cloneUrl.owner);
		await repository.addRemote(remoteName, cloneUrl.toRepositoryUrl().toString());
		await repository.setConfig(`remote.${remoteName}.${SettingCreatedByGHfVSC}`, 'true');
		return remoteName;
	}

	static async isRemoteCreatedForPullRequest(repository: Repository, remoteName: string) {
		let isForPR = await repository.getConfig(`remote.${remoteName}.${SettingCreatedByGHfVSC}`);

		if (isForPR === 'true') {
			return true;
		} else {
			return false;
		}
	}

	static createUniqueRemoteName(repository: Repository, name: string) {
		{
			var uniqueName = name;
			var number = 1;

			while (repository.remotes.find(e => e.remoteName === uniqueName)) {
				uniqueName = name + number++;
			}

			return uniqueName;
		}
	}

	static isPullRequestFromRepository(repository: Repository, pullRequest: PullRequestModel): boolean {
		return repository.cloneUrl && repository.cloneUrl.equals(pullRequest.head.repositoryCloneUrl);
	}

	static async markBranchAsPullRequest(repository: Repository, pullRequest: PullRequestModel, branchName: string) {
		let prConfigKey = `branch.${branchName}.${SettingGHfVSCPullRequest}`;
		await repository.setConfig(prConfigKey, PullRequestGitHelper.buildGHfVSConfigKeyValue(pullRequest));
	}
}