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

export const GIT_DB_METADATA_KEYS: Record<string, true> = {
	[META_GIT_STATE]: true,
	[META_GITHUB_STATE]: true,
};

export const IAgentHostGitStateService = createDecorator<IAgentHostGitStateService>('agentHostGitStateService');

export interface IAgentHostGitStateService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when the git state for a session is refreshed.
	 */
	readonly onDidRefreshSessionGitState: Event<string>;

	/**
	 * Refreshes the git state for a given session.
	 * @param sessionKey The key of the session for which to refresh the git state.
	 * @param workingDirectory Optional working directory override; when omitted, the session summary's working directory is used.
	 */
	refreshSessionGitState(sessionKey: string, workingDirectory?: URI): Promise<void>;

	/**
	 * Sets the GitHub state for a given session.
	 * @param sessionKey The key of the session for which to set the GitHub state.
	 * @param state The GitHub state to set.
	 */
	setSessionGitHubState(sessionKey: string, state: ISessionGitHubState): Promise<void>;

	/**
	 * Find a GitHub pull request for the given session and save it to the session state.
	 * @param sessionKey The key of the session for which to check the GitHub pull request.
	 */
	attachSessionGitHubPullRequest(sessionKey: string): Promise<void>;
}
