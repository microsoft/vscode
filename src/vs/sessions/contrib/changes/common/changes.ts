/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const CHANGES_VIEW_ID = 'workbench.view.agentSessions.changes';
export const CHANGES_VIEW_CONTAINER_ID = 'workbench.view.agentSessions.changesContainer';

export const enum ChangesViewMode {
	List = 'list',
	Tree = 'tree'
}

export const enum ChangesVersionMode {
	BranchChanges = 'branchChanges',
	UncommittedChanges = 'uncommittedChanges',
	OutgoingChanges = 'outgoingChanges',
	AllChanges = 'allChanges',
	LastTurn = 'lastTurn'
}

export const enum IsolationMode {
	Workspace = 'workspace',
	Worktree = 'worktree'
}

export const ChangesContextKeys = {
	VersionMode: new RawContextKey<ChangesVersionMode>('sessions.changesVersionMode', ChangesVersionMode.BranchChanges),
	ViewMode: new RawContextKey<ChangesViewMode>('sessions.changesViewMode', ChangesViewMode.List)
};

export const ActiveSessionContextKeys = {
	IsolationMode: new RawContextKey<IsolationMode>('sessions.isolationMode', IsolationMode.Workspace),
	HasChanges: new RawContextKey<boolean>('sessions.hasChanges', false),
	HasGitRepository: new RawContextKey<boolean>('sessions.hasGitRepository', true),
	HasUpstream: new RawContextKey<boolean>('sessions.hasUpstream', false),
	HasIncomingChanges: new RawContextKey<boolean>('sessions.hasIncomingChanges', false),
	HasOutgoingChanges: new RawContextKey<boolean>('sessions.hasOutgoingChanges', false),
	HasUncommittedChanges: new RawContextKey<boolean>('sessions.hasUncommittedChanges', true),
	IsMergeBaseBranchProtected: new RawContextKey<boolean>('sessions.isMergeBaseBranchProtected', false),
	HasGitHubRemote: new RawContextKey<boolean>('sessions.hasGitHubRemote', false),
	HasPullRequest: new RawContextKey<boolean>('sessions.hasPullRequest', false),
	HasOpenPullRequest: new RawContextKey<boolean>('sessions.hasOpenPullRequest', false),
};
