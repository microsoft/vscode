/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derivedOpts, IObservable, IReaderWithStore, observableFromEvent } from '../../../../base/common/observable.js';
import { equals } from '../../../../base/common/arrays.js';
import { ILogService, LogLevel } from '../../../../platform/log/common/log.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubCIOverallStatus, GitHubPullRequestState } from '../../github/common/types.js';

const LOG_PREFIX = '[BlockedSessions]';

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
		@ILogService private readonly _logService: ILogService,
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
			const sessions = this._allSessions.read(reader);
			const blocked: IBlockedSession[] = [];
			for (const session of sessions) {
				// `derivedOpts` under-types the store-backed reader as `IReader`; it is an `IDerivedReader` at runtime.
				const blockedSession = this._getBlockedSession(reader as IReaderWithStore, session);
				if (blockedSession !== undefined) {
					blocked.push(blockedSession);
				}
			}
			blocked.sort((a, b) => b.session.updatedAt.read(reader).getTime() - a.session.updatedAt.read(reader).getTime());
			// Traced on every recompute (not only when the result changes) so a
			// session that briefly drops out — e.g. while its pull request or CI data
			// is (re)loading — is visible in the log; such a gap is what makes an
			// acknowledged block look like it came back on its own. The recompute runs
			// on every session change, hence the explicit level check.
			if (this._logService.getLevel() === LogLevel.Trace) {
				this._logService.trace(`${LOG_PREFIX} computed blocked sessions (${blocked.length} of ${sessions.length}): ${describeBlockedSessions(blocked)}`);
			}
			return blocked;
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

		// `delayedStore` (released *after* the recompute) rather than `store`
		// (released *before* it): these are ref-counted, shared models that are
		// disposed once the last reference goes away. Releasing first would drop the
		// last reference on every recompute, so each recompute would tear the loaded
		// models down and re-create empty ones — reporting the session as unblocked
		// until the data is fetched again.
		const prRef = reader.delayedStore.add(this._gitHubService.createPullRequestModelReference(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number));
		const livePR = prRef.object.pullRequest.read(reader);
		if (!livePR) {
			return undefined;
		}

		if (livePR.isDraft || livePR.state !== GitHubPullRequestState.Open) {
			return undefined;
		}

		const ciRef = reader.delayedStore.add(this._gitHubService.createPullRequestCIModelReference(gitHubInfo.owner, gitHubInfo.repo, livePR.number, livePR.headSha));
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

/** Compact, log-friendly rendering of blocked sessions: `sessionId=occurrenceId`. */
export function describeBlockedSessions(blocked: readonly IBlockedSession[]): string {
	return `[${blocked.map(entry => `${entry.session.sessionId}=${entry.occurrenceId}`).join(', ')}]`;
}
