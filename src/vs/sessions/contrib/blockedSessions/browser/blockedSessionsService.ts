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
 * Why a session is surfaced as "blocked" (i.e. needs the user's attention).
 */
export const enum BlockedSessionReason {
	/** The session is waiting for the user to provide input or approve an action. */
	NeedsInput = 'needsInput',
	/** The session's pull request has failing CI checks. */
	FailingCI = 'failingCI',
	/** The session's pull request has unresolved review comments. */
	UnresolvedComments = 'unresolvedComments',
}

/** A blocked session paired with the reason it needs attention. */
export interface IBlockedSession {
	readonly session: ISession;
	readonly reason: BlockedSessionReason;
}

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

	/** The blocked sessions paired with their reason, most-recently-updated first. */
	readonly blockedSessionsWithReasons: IObservable<readonly IBlockedSession[]>;
}

export class BlockedSessionsService extends Disposable implements IBlockedSessionsService {

	declare readonly _serviceBrand: undefined;

	private readonly _allSessions: IObservable<readonly ISession[]>;

	readonly blockedSessions: IObservable<readonly ISession[]>;
	readonly blockedSessionsWithReasons: IObservable<readonly IBlockedSession[]>;

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

		this.blockedSessionsWithReasons = derived(this, reader => {
			const blocked: IBlockedSession[] = [];
			for (const session of this._allSessions.read(reader)) {
				const reason = this._getBlockedReason(reader, session);
				if (reason !== undefined) {
					blocked.push({ session, reason });
				}
			}
			return blocked.sort((a, b) => b.session.updatedAt.read(reader).getTime() - a.session.updatedAt.read(reader).getTime());
		});

		this.blockedSessions = derived(this, reader => this.blockedSessionsWithReasons.read(reader).map(blocked => blocked.session));
	}

	private _getBlockedReason(reader: IReaderWithStore, session: ISession): BlockedSessionReason | undefined {
		if (session.isArchived.read(reader)) {
			return undefined;
		}

		const status = session.status.read(reader);
		if (status === SessionStatus.NeedsInput) {
			return BlockedSessionReason.NeedsInput;
		}

		// CI failures and pull request comments only count while the session is
		// not actively in progress.
		if (status === SessionStatus.InProgress) {
			return undefined;
		}

		const gitHubInfo = session.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
		if (!gitHubInfo?.pullRequest) {
			return undefined;
		}

		const prRef = reader.store.add(this._gitHubService.createPullRequestModelReference(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number));
		const livePR = prRef.object.pullRequest.read(reader);
		if (!livePR) {
			return undefined;
		}

		const prStatus = computePullRequestIconStatus(reader, this._gitHubService, gitHubInfo.owner, gitHubInfo.repo, livePR);
		if (prStatus.hasFailingChecks) {
			return BlockedSessionReason.FailingCI;
		}
		if (prStatus.hasUnresolvedComments) {
			return BlockedSessionReason.UnresolvedComments;
		}
		return undefined;
	}
}
