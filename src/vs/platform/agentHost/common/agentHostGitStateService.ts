/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ISessionGitHubState } from './state/sessionState.js';

export const META_GIT_STATE = 'agentHost.git';
export const META_GITHUB_STATE = 'agentHost.github';
export const META_SOURCE_CONTROL_STATE = 'agentHost.sourceControl';

export const GIT_DB_METADATA_KEYS: Record<string, true> = {
	[META_GIT_STATE]: true,
	[META_GITHUB_STATE]: true,
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

	/** Resolves the canonical base branch selected for a session. */
	resolveSessionBaseBranchName(sessionKey: string): Promise<string | undefined>;

	/**
	 * Sets the GitHub state for a given session.
	 * @param sessionKey The key of the session for which to set the GitHub state.
	 * @param state The GitHub state to set.
	 */
	setSessionGitHubState(sessionKey: string, state: ISessionGitHubState): Promise<void>;

	/** Records a successful direct merge and its resulting target-branch HEAD. */
	recordSessionMerge(sessionKey: string, commit: string): Promise<void>;

	/**
	 * Refresh git state, then find and save a GitHub pull request for the current branch.
	 * @param sessionKey The key of the session for which to check the GitHub pull request.
	 * @param workingDirectory Optional working directory override; when omitted, the session summary's working directory is used.
	 */
	attachSessionGitHubPullRequest(sessionKey: string, workingDirectory?: URI): Promise<void>;

	/** Adds GitHub issues and pull requests referenced in a user message to the session. */
	attachSessionGitHubReferences(sessionKey: string, text: string): Promise<void>;
}
