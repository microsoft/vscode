/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const CHANGES_VIEW_ID = 'workbench.view.agentSessions.changes';
export const CHANGES_VIEW_CONTAINER_ID = 'workbench.view.agentSessions.changesContainer';

/**
 * Command id that opens the session's multi-file diff (Changes) editor, revealing
 * the (possibly hidden) editor area. Defined here (cycle-free common) so both the
 * action (`changesActions.ts`) and the header surfaces (`changesView.ts`) can
 * reference it without creating an import cycle.
 */
export const VIEW_SESSION_CHANGES_COMMAND_ID = 'workbench.agentSessions.action.viewChanges';

/**
 * Setting key that controls whether clicking a file in the Changes view opens a
 * single file diff editor instead of the multi file diff editor.
 *
 * This setting is registered (and only meaningful) in the Agents app.
 */
export const SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING = 'sessions.changes.openSingleFileDiff';

export const enum ChangesViewMode {
	List = 'list',
	Tree = 'tree'
}

export const enum IsolationMode {
	Workspace = 'workspace',
	Worktree = 'worktree'
}

export const ChangesContextKeys = {
	ChangeKind: new RawContextKey<'root' | 'folder' | 'file'>('sessions.changeKind', 'file'),
	VersionMode: new RawContextKey<string>('sessions.changesVersionMode', ''),
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
	HasBranchChanges: new RawContextKey<boolean>('sessions.hasBranchChanges', false),
	IsMergeBaseBranchProtected: new RawContextKey<boolean>('sessions.isMergeBaseBranchProtected', false),
	HasGitHubRemote: new RawContextKey<boolean>('sessions.hasGitHubRemote', false),
	HasPullRequest: new RawContextKey<boolean>('sessions.hasPullRequest', false),
	HasGitOperationInProgress: new RawContextKey<boolean>('sessions.hasGitOperationInProgress', false),
	HasOpenPullRequest: new RawContextKey<boolean>('sessions.hasOpenPullRequest', false),
};
