/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TreeNode } from './TreeNode';
import { PRType, PullRequestModel } from '../models/pullRequestModel';
import { PullRequestGitHelper } from '../common/pullRequestGitHelper';
import { Repository } from '../models/repository';
import { Resource } from '../common/resources';
import { PRNode } from './prNode';

export enum PRGroupActionType {
	Empty,
	More
}

export class PRGroupActionNode extends TreeNode implements vscode.TreeItem {
	public readonly label: string;
	public collapsibleState: vscode.TreeItemCollapsibleState;
	public iconPath?: { light: string | vscode.Uri; dark: string | vscode.Uri };
	public type: PRGroupActionType;
	constructor(type: PRGroupActionType) {
		super();
		this.type = type;
		this.collapsibleState = vscode.TreeItemCollapsibleState.None;
		switch (type) {
			case PRGroupActionType.Empty:
				this.label = '0 pull request in this category';
				break;
			case PRGroupActionType.More:
				this.label = 'Load more';
				this.iconPath = {
					light: Resource.icons.light.fold,
					dark: Resource.icons.dark.fold
				};
				break;
			default:
				break;
		}
	}

	getTreeItem(): vscode.TreeItem {
		return this;
	}
}

export class PRGroupTreeNode extends TreeNode implements vscode.TreeItem {
	public readonly label: string;
	public collapsibleState: vscode.TreeItemCollapsibleState;
	public prs: PullRequestModel[];
	public type: PRType;

	constructor(
		private repository: Repository,
		type: PRType
	) {
		super();

		this.prs = [];
		this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
		this.type = type;
		switch (type) {
			case PRType.All:
				this.label = 'All';
				break;
			case PRType.RequestReview:
				this.label = 'Waiting For My Review';
				break;
			case PRType.ReviewedByMe:
				this.label = 'Reviewed By Me';
				break;
			case PRType.Mine:
				this.label = 'Created By Me';
				break;
			case PRType.LocalPullRequest:
				this.label = 'Local Pull Request Branches';
				break;
			default:
				break;
		}
	}

	async getChildren(): Promise<TreeNode[]> {
		let prItems = await this.getPRs();
		if (prItems && prItems.length) {
			return prItems.map(prItem => new PRNode(this.repository, prItem));
		} else {
			return [new PRGroupActionNode(PRGroupActionType.Empty)];
		}
	}

	getTreeItem(): vscode.TreeItem {
		return this;
	}

	async getPRs(): Promise<PullRequestModel[]> {
		if (this.type === PRType.LocalPullRequest) {
			let infos = await PullRequestGitHelper.getLocalBranchesMarkedAsPullRequest(this.repository);
			let promises = infos.map(async info => {
				let owner = info.owner;
				let prNumber = info.prNumber;
				let githubRepo = this.repository.githubRepositories.find(repo => repo.remote.owner.toLocaleLowerCase() === owner.toLocaleLowerCase());

				if (!githubRepo) {
					return Promise.resolve([]);
				}

				return [await githubRepo.getPullRequest(prNumber)];
			});

			return Promise.all(promises).then(values => {
				return values.reduce((prev, curr) => prev.concat(...curr), []).filter(value => value !== null);
			});
		}

		let promises = this.repository.githubRepositories.map(async githubRepository => {
			let remote = githubRepository.remote.remoteName;
			let isRemoteForPR = await PullRequestGitHelper.isRemoteCreatedForPullRequest(this.repository, remote);
			if (isRemoteForPR) {
				return Promise.resolve([]);
			}
			return [await githubRepository.getPullRequests(this.type)];
		});

		return Promise.all(promises).then(values => {
			return values.reduce((prev, curr) => prev.concat(...curr), []);
		});
	}
}
