/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as objectEquals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { buildBranchChangesetUri, buildSessionChangesetUri, buildUncommittedChangesetUri, formatSessionChangesetDescription } from '../common/changesetUri.js';
import { readSessionGitState, withSessionGitState, type Changeset, type ISessionGitState } from '../common/state/sessionState.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

export class AgentHostGitStateService implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
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
			return gitState;
		} catch (e) {
			this._logService.warn(`[AgentHostGitStateService][refreshSessionGitState] Failed to compute git state for ${sessionKey}`, e);
			return null;
		}
	}

	private _setSessionGitState(sessionKey: string, gitState: ISessionGitState): void {
		const current = this._stateManager.getSessionState(sessionKey)?._meta;
		this._stateManager.setSessionMeta(sessionKey, withSessionGitState(current, gitState));
		this._updateBranchChangesetDescription(sessionKey, gitState);
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
}
