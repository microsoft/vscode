/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ISessionGitHubState, ISessionGitState } from './state/sessionState.js';

export const IAgentHostGitStateService = createDecorator<IAgentHostGitStateService>('agentHostGitStateService');

export interface IAgentHostGitStateService {
	readonly _serviceBrand: undefined;

	/**
	 * Refreshes the git state for a given session.
	 * @param sessionKey The key of the session for which to refresh the git state.
	 * @param workingDirectory Optional working directory override; when omitted, the session summary's working directory is used.
	 * @returns A promise that resolves to the updated git state, `undefined` if the git state is unchanged, or `null` if git state is unavailable (no working directory, not a git repo, or an error occurred).
	 */
	refreshSessionGitState(sessionKey: string, workingDirectory?: URI): Promise<ISessionGitState | undefined | null>;

	/**
	 * Gets the GitHub state for a given session.
	 * @param sessionKey The key of the session for which to get the GitHub state.
	 * @returns A promise that resolves to the GitHub state, or `undefined` if it is not available.
	 */
	getSessionGitHubState(sessionKey: string): Promise<ISessionGitHubState | undefined>;

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
