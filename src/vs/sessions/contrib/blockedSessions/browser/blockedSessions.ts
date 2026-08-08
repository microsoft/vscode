/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derivedOpts, IObservable, IReaderWithStore, observableFromEvent } from '../../../../base/common/observable.js';
import { equals } from '../../../../base/common/arrays.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubCIOverallStatus, GitHubPullRequestState } from '../../github/common/types.js';

/**
 * Why a session is surfaced as "blocked" (i.e. needs the user's attention).
 */
export const enum BlockedSessionReason {
	/** The session is waiting for the user to provide input or approve an action. */
	NeedsInput = 'needsInput',
	/** The session's pull request has failing CI checks. */
	FailingCI = 'failingCI',
}

/** A blocked session paired with the reason it needs attention. */
export interface IBlockedSession {
	readonly session: ISession;
	readonly reason: BlockedSessionReason;
	/** Identifies this occurrence so a later block can be surfaced again. */
	readonly occurrenceId: string;
}

/**
 * Surfaces the set of "blocked" sessions — sessions that require the user's
 * attention. A session is considered blocked when it:
 *
 * - needs input (`SessionStatus.NeedsInput`), or
 * - has failing CI checks while not in progress.
 *
 * Archived (done) sessions are never reported as blocked.
 */
export class BlockedSessions extends Disposable {

	private readonly _allSessions: IObservable<readonly ISession[]>;

	/** The blocked sessions, most-recently-updated first. */
	readonly blockedSessions: IObservable<readonly ISession[]>;

	/** The blocked sessions paired with their reason, most-recently-updated first. */
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

		// Structural equality keeps the deriveds from propagating when a recompute
		// (e.g. an `updatedAt` tick that doesn't reorder, or a reason-only change)
		// yields the same result, so downstream autoruns/renders don't churn.
		this.blockedSessionsWithReasons = derivedOpts({
			owner: this,
			equalsFn: (a, b) => equals(a, b, (x, y) => x.session.sessionId === y.session.sessionId && x.reason === y.reason && x.occurrenceId === y.occurrenceId),
		}, reader => {
			const blocked: IBlockedSession[] = [];
			for (const session of this._allSessions.read(reader)) {
				// `derivedOpts` under-types the store-backed reader as `IReader`; it is an `IDerivedReader` at runtime.
				const blockedSession = this._getBlockedSession(reader as IReaderWithStore, session);
				if (blockedSession !== undefined) {
					blocked.push(blockedSession);
				}
			}
			return blocked.sort((a, b) => b.session.updatedAt.read(reader).getTime() - a.session.updatedAt.read(reader).getTime());
		});

		this.blockedSessions = derivedOpts({
			owner: this,
			equalsFn: (a, b) => equals(a, b, (x, y) => x.sessionId === y.sessionId),
		}, reader => this.blockedSessionsWithReasons.read(reader).map(blocked => blocked.session));
	}

	private _getBlockedSession(reader: IReaderWithStore, session: ISession): IBlockedSession | undefined {
		if (session.isArchived.read(reader)) {
			return undefined;
		}

		const status = session.status.read(reader);
		if (status === SessionStatus.NeedsInput) {
			return {
				session,
				reason: BlockedSessionReason.NeedsInput,
				occurrenceId: BlockedSessionReason.NeedsInput,
			};
		}

		// CI failures only count while the session is not actively in progress.
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

		if (livePR.isDraft || livePR.state !== GitHubPullRequestState.Open) {
			return undefined;
		}

		const ciRef = reader.store.add(this._gitHubService.createPullRequestCIModelReference(gitHubInfo.owner, gitHubInfo.repo, livePR.number, livePR.headSha));
		if (ciRef.object.overallStatus.read(reader) === GitHubCIOverallStatus.Failure) {
			return {
				session,
				reason: BlockedSessionReason.FailingCI,
				occurrenceId: `${BlockedSessionReason.FailingCI}:${livePR.headSha}`,
			};
		}
		return undefined;
	}
}
