/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../base/common/observable.js';
import type { IAgentHostGitService } from '../../common/agentHostGitService.js';

const defaultGitService = createNoopGitService();

export class TestAgentHostGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	getCurrentBranch(...args: Parameters<IAgentHostGitService['getCurrentBranch']>) { return defaultGitService.getCurrentBranch(...args); }
	getHEAD(...args: Parameters<IAgentHostGitService['getHEAD']>) { return defaultGitService.getHEAD(...args); }
	getDefaultBranch(...args: Parameters<IAgentHostGitService['getDefaultBranch']>) { return defaultGitService.getDefaultBranch(...args); }
	getDefaultBranch2(...args: Parameters<IAgentHostGitService['getDefaultBranch2']>) { return defaultGitService.getDefaultBranch2(...args); }
	getBranch(...args: Parameters<IAgentHostGitService['getBranch']>) { return defaultGitService.getBranch(...args); }
	getRefs(...args: Parameters<IAgentHostGitService['getRefs']>) { return defaultGitService.getRefs(...args); }
	getBranches(...args: Parameters<IAgentHostGitService['getBranches']>) { return defaultGitService.getBranches(...args); }
	hasGitRoot(...args: Parameters<IAgentHostGitService['hasGitRoot']>) { return defaultGitService.hasGitRoot(...args); }
	getRepositoryRoot(...args: Parameters<IAgentHostGitService['getRepositoryRoot']>) { return defaultGitService.getRepositoryRoot(...args); }
	getWorktreeRoots(...args: Parameters<IAgentHostGitService['getWorktreeRoots']>) { return defaultGitService.getWorktreeRoots(...args); }
	getWorktrees(...args: Parameters<IAgentHostGitService['getWorktrees']>) { return defaultGitService.getWorktrees(...args); }
	addWorktree(...args: Parameters<IAgentHostGitService['addWorktree']>) { return defaultGitService.addWorktree(...args); }
	copyWorktreeIncludeFiles(...args: Parameters<IAgentHostGitService['copyWorktreeIncludeFiles']>) { return defaultGitService.copyWorktreeIncludeFiles(...args); }
	symlinkWorktreeFolders(...args: Parameters<IAgentHostGitService['symlinkWorktreeFolders']>) { return defaultGitService.symlinkWorktreeFolders(...args); }
	addExistingWorktree(...args: Parameters<IAgentHostGitService['addExistingWorktree']>) { return defaultGitService.addExistingWorktree(...args); }
	isWorktreeRegistered(...args: Parameters<IAgentHostGitService['isWorktreeRegistered']>) { return defaultGitService.isWorktreeRegistered(...args); }
	removeWorktree(...args: Parameters<IAgentHostGitService['removeWorktree']>) { return defaultGitService.removeWorktree(...args); }
	branchExists(...args: Parameters<IAgentHostGitService['branchExists']>) { return defaultGitService.branchExists(...args); }
	createBranch(...args: Parameters<IAgentHostGitService['createBranch']>) { return defaultGitService.createBranch(...args); }
	checkout(...args: Parameters<IAgentHostGitService['checkout']>) { return defaultGitService.checkout(...args); }
	hasUncommittedChanges(...args: Parameters<IAgentHostGitService['hasUncommittedChanges']>) { return defaultGitService.hasUncommittedChanges(...args); }
	createStash(...args: Parameters<IAgentHostGitService['createStash']>) { return defaultGitService.createStash(...args); }
	commitAll(...args: Parameters<IAgentHostGitService['commitAll']>) { return defaultGitService.commitAll(...args); }
	mergeBranch(...args: Parameters<IAgentHostGitService['mergeBranch']>) { return defaultGitService.mergeBranch(...args); }
	restore(...args: Parameters<IAgentHostGitService['restore']>) { return defaultGitService.restore(...args); }
	hasUpstream(...args: Parameters<IAgentHostGitService['hasUpstream']>) { return defaultGitService.hasUpstream(...args); }
	fetch(...args: Parameters<IAgentHostGitService['fetch']>) { return defaultGitService.fetch(...args); }
	pull(...args: Parameters<IAgentHostGitService['pull']>) { return defaultGitService.pull(...args); }
	push(...args: Parameters<IAgentHostGitService['push']>) { return defaultGitService.push(...args); }
	getSessionGitState(...args: Parameters<IAgentHostGitService['getSessionGitState']>) { return defaultGitService.getSessionGitState(...args); }
	computeSessionFileDiffs(...args: Parameters<IAgentHostGitService['computeSessionFileDiffs']>) { return defaultGitService.computeSessionFileDiffs(...args); }
	resolveBranchBaselineCommit(...args: Parameters<IAgentHostGitService['resolveBranchBaselineCommit']>) { return defaultGitService.resolveBranchBaselineCommit(...args); }
	showBlob(...args: Parameters<IAgentHostGitService['showBlob']>) { return defaultGitService.showBlob(...args); }
	captureWorkingTreeAsTree(...args: Parameters<IAgentHostGitService['captureWorkingTreeAsTree']>) { return defaultGitService.captureWorkingTreeAsTree(...args); }
	commitTree(...args: Parameters<IAgentHostGitService['commitTree']>) { return defaultGitService.commitTree(...args); }
	updateRef(...args: Parameters<IAgentHostGitService['updateRef']>) { return defaultGitService.updateRef(...args); }
	deleteRefs(...args: Parameters<IAgentHostGitService['deleteRefs']>) { return defaultGitService.deleteRefs(...args); }
	revParse(...args: Parameters<IAgentHostGitService['revParse']>) { return defaultGitService.revParse(...args); }
	overlayPathIntoTree(...args: Parameters<IAgentHostGitService['overlayPathIntoTree']>) { return defaultGitService.overlayPathIntoTree(...args); }
	diffTreePaths(...args: Parameters<IAgentHostGitService['diffTreePaths']>) { return defaultGitService.diffTreePaths(...args); }
	computeFileDiffsBetweenRefs(...args: Parameters<IAgentHostGitService['computeFileDiffsBetweenRefs']>) { return defaultGitService.computeFileDiffsBetweenRefs(...args); }
	getFetchRemoteUrls(...args: Parameters<IAgentHostGitService['getFetchRemoteUrls']>) { return defaultGitService.getFetchRemoteUrls(...args); }
	getFetchRemotes(...args: Parameters<IAgentHostGitService['getFetchRemotes']>) { return defaultGitService.getFetchRemotes(...args); }
	getUntrackedPaths(...args: Parameters<IAgentHostGitService['getUntrackedPaths']>) { return defaultGitService.getUntrackedPaths(...args); }
	getBranchDiffSafetyInfo(...args: Parameters<IAgentHostGitService['getBranchDiffSafetyInfo']>) { return defaultGitService.getBranchDiffSafetyInfo(...args); }
	getDiffPatchBetweenRefs(...args: Parameters<IAgentHostGitService['getDiffPatchBetweenRefs']>) { return defaultGitService.getDiffPatchBetweenRefs(...args); }
}

/** Preserves a plain, spreadable service object for existing factory callers. */
export function createNoopGitService(): IAgentHostGitService {
	return {
		_serviceBrand: undefined,
		getCurrentBranch: async () => undefined,
		getHEAD: async () => undefined,
		getDefaultBranch: async () => undefined,
		getDefaultBranch2: async () => undefined,
		getBranch: async () => undefined,
		getRefs: async () => [],
		getBranches: async () => [],
		hasGitRoot: () => constObservable(undefined),
		getRepositoryRoot: async () => undefined,
		getWorktreeRoots: async () => [],
		getWorktrees: async () => [],
		addWorktree: async () => { },
		copyWorktreeIncludeFiles: async () => { },
		symlinkWorktreeFolders: async () => [],
		addExistingWorktree: async () => { },
		isWorktreeRegistered: async () => true,
		removeWorktree: async () => { },
		branchExists: async () => false,
		createBranch: async () => { },
		checkout: async () => { },
		hasUncommittedChanges: async () => false,
		createStash: async () => { },
		commitAll: async () => { },
		mergeBranch: async () => '',
		restore: async () => { },
		hasUpstream: async () => false,
		fetch: async () => { },
		pull: async () => { },
		push: async () => { },
		getSessionGitState: async () => undefined,
		computeSessionFileDiffs: async () => undefined,
		resolveBranchBaselineCommit: async () => undefined,
		showBlob: async () => undefined,
		captureWorkingTreeAsTree: async () => undefined,
		commitTree: async () => undefined,
		updateRef: async () => { },
		deleteRefs: async () => { },
		revParse: async () => undefined,
		overlayPathIntoTree: async () => undefined,
		diffTreePaths: async () => undefined,
		computeFileDiffsBetweenRefs: async () => undefined,
		getFetchRemoteUrls: async () => undefined,
		getFetchRemotes: async () => undefined,
		getUntrackedPaths: async () => [],
		getBranchDiffSafetyInfo: async () => undefined,
		getDiffPatchBetweenRefs: async () => undefined,
	};
}
