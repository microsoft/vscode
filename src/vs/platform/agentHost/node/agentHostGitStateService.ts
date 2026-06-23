/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as objectEquals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { buildBranchChangesetUri, buildSessionChangesetUri, buildUncommittedChangesetUri, formatSessionChangesetDescription } from '../common/changesetUri.js';
import { ISessionGitHubState, readSessionGitHubState, readSessionGitState, SessionLifecycle, withSessionGitHubState, withSessionGitState, type Changeset, type ISessionGitState } from '../common/state/sessionState.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { ISessionDataService } from '../common/sessionDataService.js';

export const META_GIT_STATE = 'agentHost.git';
export const META_GITHUB_STATE = 'agentHost.github';

export class AgentHostGitStateService implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) { }

	async refreshSessionGitState(sessionKey: string, workingDirectory: URI | undefined): Promise<ISessionGitState | undefined | null> {
		if (!workingDirectory) {
			const workingDirectoryStr = this._stateManager.getSessionState(sessionKey)?.summary.workingDirectory;
			if (workingDirectoryStr) {
				workingDirectory = URI.parse(workingDirectoryStr);
			}
		}

		if (!workingDirectory) {
			return null;
		}

		try {
			const gitState = await this._gitService.getSessionGitState(workingDirectory);
			if (!gitState) {
				this._stripGitOnlyChangesetEntries(sessionKey);
				return null;
			}

			const current = this._stateManager.getSessionState(sessionKey)?._meta;
			if (objectEquals(readSessionGitState(current), gitState)) {
				return undefined;
			}

			this._setSessionGitState(sessionKey, gitState);

			if (gitState.githubOwner || gitState.githubRepo) {
				void this.setSessionGitHubState(sessionKey, {
					owner: gitState.githubOwner,
					repo: gitState.githubRepo
				} satisfies ISessionGitHubState);
			}

			return gitState;
		} catch (e) {
			this._logService.warn(`[AgentHostGitStateService][refreshSessionGitState] Failed to compute git state for ${sessionKey}`, e);
			return null;
		}
	}

	async getSessionGitHubState(sessionKey: string): Promise<ISessionGitHubState | undefined> {
		// Attempt to load the GitHub state from the state manager
		const currentMeta = this._stateManager.getSessionState(sessionKey)?.summary._meta;
		const currentGitHubState = readSessionGitHubState(currentMeta);
		if (currentGitHubState) {
			return currentGitHubState;
		}

		// Load the GitHub state from the session database
		let databaseRef;
		try {
			databaseRef = this._sessionDataService.openDatabase(URI.parse(sessionKey));
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService][getSessionGitHubState] Failed to open session database for ${sessionKey}`, error);
			return undefined;
		}

		try {
			const githubStateStr = await databaseRef.object.getMetadata(META_GITHUB_STATE);
			if (githubStateStr) {
				const githubState = JSON.parse(githubStateStr) as ISessionGitHubState;
				this._stateManager.setSessionSummaryMeta(sessionKey, withSessionGitHubState(currentMeta, githubState));

				return githubState;
			}
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService][_getSessionGitHubState] Failed to load GitHub state for ${sessionKey}`, error);
		} finally {
			databaseRef.dispose();
		}

		return undefined;
	}

	async setSessionGitHubState(sessionKey: string, state: ISessionGitHubState): Promise<void> {
		const current = await this.getSessionGitHubState(sessionKey);
		const next = { ...current, ...state } satisfies ISessionGitHubState;

		if (objectEquals(current, next)) {
			return;
		}

		// Update session state manager
		const currentMeta = this._stateManager.getSessionState(sessionKey)?.summary._meta;
		const nextMeta = withSessionGitHubState(currentMeta, next);
		this._stateManager.setSessionSummaryMeta(sessionKey, nextMeta);

		// Update session database
		void this._saveSessionState(sessionKey, META_GITHUB_STATE, JSON.stringify(next));
	}

	private _setSessionGitState(sessionKey: string, gitState: ISessionGitState): void {
		this._updateBranchChangesetDescription(sessionKey, gitState);

		// Update session state manager
		const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
		const nextMeta = withSessionGitState(currentMeta, gitState);
		this._stateManager.setSessionMeta(sessionKey, nextMeta);

		// Update session database
		void this._saveSessionState(sessionKey, META_GIT_STATE, JSON.stringify(gitState));
	}

	private _stripGitOnlyChangesetEntries(sessionKey: string): void {
		const state = this._stateManager.getSessionState(sessionKey);
		const current = state?.changesets;
		if (!current || current.length === 0) {
			return;
		}
		const branchUri = buildSessionChangesetUri(sessionKey);
		const uncommittedUri = buildUncommittedChangesetUri(sessionKey);
		const filtered = current.filter((c: Changeset) => c.uriTemplate !== branchUri && c.uriTemplate !== uncommittedUri);
		if (filtered.length === current.length) {
			return;
		}
		this._stateManager.setSessionChangesets(sessionKey, filtered);
	}

	private _updateBranchChangesetDescription(sessionKey: string, gitState: ISessionGitState): void {
		const description = formatSessionChangesetDescription(gitState);
		const state = this._stateManager.getSessionState(sessionKey);
		const current = state?.changesets;
		if (!current || current.length === 0) {
			return;
		}
		const branchUri = buildBranchChangesetUri(sessionKey);
		let changed = false;
		const next = current.map((c: Changeset) => {
			if (c.uriTemplate !== branchUri) {
				return c;
			}
			if (c.description === description) {
				return c;
			}
			changed = true;
			if (description === undefined) {
				const { description: _omit, ...rest } = c;
				return rest;
			}
			return { ...c, description };
		});
		if (!changed) {
			return;
		}
		this._stateManager.setSessionChangesets(sessionKey, next);
	}

	private async _saveSessionState(sessionKey: string, key: string, value: string): Promise<void> {
		// Skip saving session state if the session is not materialized
		const state = this._stateManager.getSessionState(sessionKey);
		if (state?.lifecycle === SessionLifecycle.Creating) {
			return;
		}

		let databaseRef;
		try {
			databaseRef = this._sessionDataService.openDatabase(URI.parse(sessionKey));
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService][_saveSessionState] Failed to open session database for ${sessionKey}`, error);
			return;
		}

		try {
			await databaseRef.object.setMetadata(key, value);
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService][_saveSessionState] Failed to persist ${key}`, error);
		} finally {
			databaseRef.dispose();
		}
	}
}
