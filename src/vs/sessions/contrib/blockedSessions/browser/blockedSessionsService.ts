/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, IReaderWithStore, observableFromEvent } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { computePullRequestIconStatus } from '../../github/browser/pullRequestIconStatus.js';

export const IBlockedSessionsService = createDecorator<IBlockedSessionsService>('blockedSessionsService');

/**
 * Surfaces the set of "blocked" sessions — sessions that require the user's
 * attention. A session is considered blocked when it:
 *
 * - needs input (`SessionStatus.NeedsInput`), or
 * - has failing CI checks while not in progress, or
 * - has unresolved pull request comments while not in progress.
 *
 * Archived (done) sessions are never reported as blocked.
 */
export interface IBlockedSessionsService {
	readonly _serviceBrand: undefined;

	/** The blocked sessions, most-recently-updated first. */
	readonly blockedSessions: IObservable<readonly ISession[]>;
}

export class BlockedSessionsService extends Disposable implements IBlockedSessionsService {

	declare readonly _serviceBrand: undefined;

	private readonly _allSessions: IObservable<readonly ISession[]>;

	readonly blockedSessions: IObservable<readonly ISession[]>;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IGitHubService private readonly _gitHubService: IGitHubService,
	) {
		super();

		this._allSessions = observableFromEvent(
			this,
			this._sessionsManagementService.onDidChangeSessions,
			() => this._sessionsManagementService.getSessions(),
		);

		this.blockedSessions = derived(this, reader => {
			const blocked = this._allSessions.read(reader).filter(session => this._isBlocked(reader, session));
			return blocked.sort((a, b) => b.updatedAt.read(reader).getTime() - a.updatedAt.read(reader).getTime());
		});
	}

	private _isBlocked(reader: IReaderWithStore, session: ISession): boolean {
		if (session.isArchived.read(reader)) {
			return false;
		}

		const status = session.status.read(reader);
		if (status === SessionStatus.NeedsInput) {
			return true;
		}

		// CI failures and pull request comments only count while the session is
		// not actively in progress.
		if (status === SessionStatus.InProgress) {
			return false;
		}

		const gitHubInfo = session.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
		if (!gitHubInfo?.pullRequest) {
			return false;
		}

		const prRef = reader.store.add(this._gitHubService.createPullRequestModelReference(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number));
		const livePR = prRef.object.pullRequest.read(reader);
		if (!livePR) {
			return false;
		}

		const prStatus = computePullRequestIconStatus(reader, this._gitHubService, gitHubInfo.owner, gitHubInfo.repo, livePR);
		return !!prStatus.hasFailingChecks || !!prStatus.hasUnresolvedComments;
	}
}
