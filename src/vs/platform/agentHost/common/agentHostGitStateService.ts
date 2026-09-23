/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ISessionGitHubState, ISessionGitState, SessionSummaryMeta } from './state/sessionState.js';

export const META_GIT_STATE = 'agentHost.git';
export const META_GITHUB_STATE = 'agentHost.github';
/** GitHub state of every session folder other than the first, keyed by working-directory key. */
export const META_FOLDER_GITHUB_STATE = 'agentHost.folderGitHub';
export const META_SOURCE_CONTROL_STATE = 'agentHost.sourceControl';

export const GIT_DB_METADATA_KEYS: Record<string, true> = {
	[META_GIT_STATE]: true,
	[META_GITHUB_STATE]: true,
	[META_FOLDER_GITHUB_STATE]: true,
	[META_SOURCE_CONTROL_STATE]: true,
};

export const IAgentHostGitStateService = createDecorator<IAgentHostGitStateService>('agentHostGitStateService');

export interface IAgentHostGitStateService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when the git state for a session is refreshed.
	 */
	readonly onDidRefreshSessionGitState: Event<string>;

	/** Fires when GitHub metadata that affects changeset operations changes. */
	readonly onDidChangeSessionGitHubState: Event<string>;

	/**
	 * Refreshes the git state for a given session.
	 * @param sessionKey The key of the session for which to refresh the git state.
	 * @param workingDirectory Optional working directory override; when omitted, the session summary's working directory is used.
	 */
	refreshSessionGitState(sessionKey: string, workingDirectory?: URI): Promise<void>;

	/** Returns the latest git state for a session or chat changeset owner. */
	readonly getSessionGitState?: (sessionKey: string) => ISessionGitState | undefined;

	/** Merges the branch identity known when an isolated worktree materializes into session metadata. */
	getMaterializedWorktreeMeta(sessionKey: string, branchName: string): SessionSummaryMeta | undefined;

	/** Resolves the canonical base branch selected for a session. */
	resolveSessionBaseBranchName(sessionKey: string): Promise<string | undefined>;

	/**
	 * Returns the GitHub state of the folder a session, chat channel or folder
	 * changeset owner URI resolves to: a chat's first folder, or the session's
	 * first folder, which uses the session-level state.
	 */
	readonly getGitHubState?: (key: string) => ISessionGitHubState | undefined;

	/**
	 * Merges into the GitHub state of the folder a session, chat channel or
	 * folder changeset owner URI resolves to.
	 * @param sessionKey The session, chat channel or folder changeset owner URI whose folder's GitHub state to set.
	 * @param state The GitHub state to set.
	 */
	setSessionGitHubState(sessionKey: string, state: ISessionGitHubState): Promise<void>;

	/** Records a successful direct merge and its resulting target-branch HEAD. */
	recordSessionMerge(sessionKey: string, commit: string): Promise<void>;

	/**
	 * Refresh git state, then reconcile the actionable GitHub pull request for the current branch.
	 * @param sessionKey The key of the session for which to check the GitHub pull request.
	 * @param workingDirectory Optional working directory override; when omitted, the session summary's working directory is used.
	 */
	attachSessionGitHubPullRequest(sessionKey: string, workingDirectory?: URI): Promise<void>;
}
