/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Repository } from '../models/repository';
import { PullRequestModel } from '../models/pullRequestModel';
import { Protocol } from '../models/protocol';
import { Remote } from '../models/remote';

const PullRequestRemoteMetadataKey = 'github-pr-remote';
const PullRequestMetadataKey = 'github-pr-owner-number';
const PullRequestBranchRegex = /branch\.(.+)\.github-pr-owner-number/;

export class PullRequestGitHelper {
	static async createAndCheckout(repository: Repository, pullRequest: PullRequestModel) {
		let localBranchName = await PullRequestGitHelper.getBranchNameForPullRequest(repository, pullRequest);

		let existing = await repository.getBranch(localBranchName);
		if (existing) {
			// already exist but the metadata is missing.
			await repository.checkout(localBranchName);
		} else {
			// the branch is from a fork
			// create remote for this fork
			let remoteName = await PullRequestGitHelper.createRemote(repository, pullRequest.head.repositoryCloneUrl);
			// fetch the branch
			let ref = `${pullRequest.head.ref}:${localBranchName}`;
			await repository.fetch(remoteName, ref);
			await repository.checkout(localBranchName);
			// set remote tracking branch for the local branch
			await repository.setTrackingBranch(localBranchName, `refs/remotes/${remoteName}/${pullRequest.head.ref}`);
		}

		let prBranchMetadataKey = `branch.${localBranchName}.${PullRequestMetadataKey}`;
		await repository.setConfig(prBranchMetadataKey, PullRequestGitHelper.buildPullRequestMetadata(pullRequest));
	}

	static async checkout(repository: Repository, remote: Remote, branchName: string, pullRequest: PullRequestModel): Promise<void> {
		let remoteName = remote.remoteName;
		await repository.fetch(remoteName);
		let branch = await repository.getBranch(branchName);

		if (!branch) {
			await PullRequestGitHelper.fetchAndCreateBranch(repository, remote, branchName, pullRequest);
		}

		await repository.checkout(branchName);
		await PullRequestGitHelper.markBranchAsPullRequest(repository, pullRequest, branchName);
	}

	static async getBranchForPullRequestFromExistingRemotes(repository: Repository, pullRequest: PullRequestModel) {
		let headRemote = PullRequestGitHelper.getHeadRemoteForPullRequest(repository, pullRequest);
		if (headRemote) {
			// the head of the PR is in this repository (not fork), we can just fetch
			return {
				remote: headRemote,
				branch: pullRequest.head.ref
			};
		} else {
			let key = PullRequestGitHelper.buildPullRequestMetadata(pullRequest);
			let configs = await repository.getConfigs();

			let branchInfos = configs.map(config => {
				let matches = PullRequestBranchRegex.exec(config.key);
				return {
					branch: matches && matches.length ? matches[1] : null,
					value: config.value
				};
			}).filter(c => c.branch && c.value === key);

			if (branchInfos && branchInfos.length) {
				let remoteName = await repository.getConfig(`branch.${branchInfos[0].branch}.remote`);
				let headRemote = repository.remotes.filter(remote => remote.remoteName === remoteName);
				if (headRemote && headRemote.length) {
					return {
						remote: headRemote[0],
						branch: branchInfos[0].branch
					};
				}
			}

			return null;
		}
	}

	static async fetchAndCreateBranch(repository: Repository, remote: Remote, branchName: string, pullRequest: PullRequestModel) {
		let remoteName = remote.remoteName;
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

	static buildPullRequestMetadata(pullRequest: PullRequestModel) {
		return pullRequest.base.repositoryCloneUrl.owner + '#' + pullRequest.prNumber;
	}

	static parsePullRequestMetadata(value: string) {
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

	static async getMatchingPullRequestMetadataForBranch(repository: Repository, branchName: string) {
		let configKey = `branch.${branchName}.${PullRequestMetadataKey}`;
		let configValue = await repository.getConfig(configKey);
		return PullRequestGitHelper.parsePullRequestMetadata(configValue);
	}

	static async createRemote(repository: Repository, cloneUrl: Protocol) {
		let remotes = repository.remotes;

		remotes.forEach(remote => {
			if (new Protocol(remote.url).equals(cloneUrl)) {
				return remote.repositoryName;
			}
		});

		let remoteName = PullRequestGitHelper.getUniqueRemoteName(repository, cloneUrl.owner);
		await repository.addRemote(remoteName, cloneUrl.normalizeUri().toString());
		await repository.setConfig(`remote.${remoteName}.${PullRequestRemoteMetadataKey}`, 'true');
		return remoteName;
	}

	static async isRemoteCreatedForPullRequest(repository: Repository, remoteName: string) {
		let isForPR = await repository.getConfig(`remote.${remoteName}.${PullRequestRemoteMetadataKey}`);

		if (isForPR === 'true') {
			return true;
		} else {
			return false;
		}
	}

	static async getBranchNameForPullRequest(repository: Repository, pullRequest: PullRequestModel): Promise<string> {
		let branchName = `pr/${pullRequest.author.login}/${pullRequest.prNumber}`;
		let result = branchName;
		let number = 1;

		while (true) {
			let currentBranch = await repository.getBranch(result);

			if (currentBranch) {
				result = branchName + '-' + number++;
			} else {
				break;
			}
		}

		return result;
	}

	static getUniqueRemoteName(repository: Repository, name: string) {
		let uniqueName = name;
		let number = 1;

		while (repository.remotes.find(e => e.remoteName === uniqueName)) {
			uniqueName = name + number++;
		}

		return uniqueName;
	}

	static getHeadRemoteForPullRequest(repository: Repository, pullRequest: PullRequestModel): Remote {
		let repos = repository.githubRepositories;
		for (let i = 0; i < repos.length; i++) {
			let remote = repos[i].remote;
			if (remote.gitProtocol && remote.gitProtocol.equals(pullRequest.head.repositoryCloneUrl)) {
				return remote;
			}
		}

		return null;
	}

	static async markBranchAsPullRequest(repository: Repository, pullRequest: PullRequestModel, branchName: string) {
		let prConfigKey = `branch.${branchName}.${PullRequestMetadataKey}`;
		await repository.setConfig(prConfigKey, PullRequestGitHelper.buildPullRequestMetadata(pullRequest));
	}

	static async getLocalBranchesMarkedAsPullRequest(repository: Repository) {
		let branches = await repository.getLocalBranches();

		let ret = [];
		for (let i = 0; i < branches.length; i++) {
			let matchingPRMetadata = await PullRequestGitHelper.getMatchingPullRequestMetadataForBranch(repository, branches[i]);
			if (matchingPRMetadata) {
				ret.push(matchingPRMetadata);
			}
		}

		return ret;
	}
}