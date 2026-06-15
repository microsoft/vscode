/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { equals as objectEquals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { buildBranchChangesetUri, buildSessionChangesetUri, buildUncommittedChangesetUri, formatSessionChangesetDescription } from '../common/changesetUri.js';
import { readSessionGitState, withSessionGitState, type Changeset, type ISessionGitState } from '../common/state/sessionState.js';
import { IAgentHostGitService } from './agentHostGitService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

export class AgentHostSessionGitStateService extends Disposable {

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	/**
	 * Fire-and-forget friendly probe used during normal session lifecycle.
	 * Returns `undefined` when there is no git state change to publish.
	 */
	async attachGitState(session: URI, workingDirectory: URI | undefined): Promise<ISessionGitState | undefined> {
		if (!workingDirectory) {
			return undefined;
		}
		const sessionKey = session.toString();
		try {
			const gitState = await this._gitService.getSessionGitState(workingDirectory);
			if (!gitState) {
				this._stripGitOnlyChangesetEntries(sessionKey);
				return undefined;
			}
			const current = this._stateManager.getSessionState(sessionKey)?._meta;
			if (objectEquals(readSessionGitState(current), gitState)) {
				return undefined;
			}
			this._setSessionGitState(sessionKey, gitState);
			return gitState;
		} catch (e) {
			this._logService.warn(`[AgentHostSessionGitStateService] Failed to compute git state for ${session}`, e);
			return undefined;
		}
	}

	async refreshSessionGitState(sessionKey: string): Promise<ISessionGitState | undefined> {
		const workingDirectoryStr = this._stateManager.getSessionState(sessionKey)?.summary.workingDirectory;
		if (!workingDirectoryStr) {
			return undefined;
		}
		const gitState = await this._gitService.getSessionGitState(URI.parse(workingDirectoryStr));
		if (!gitState) {
			this._stripGitOnlyChangesetEntries(sessionKey);
			return undefined;
		}
		this._setSessionGitState(sessionKey, gitState);
		return gitState;
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
