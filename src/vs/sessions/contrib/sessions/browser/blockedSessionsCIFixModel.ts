/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ChatSendResult, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { buildFixCIPrompt, getFailedChecks } from '../../changes/browser/checksActions.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../github/browser/models/githubPullRequestCIModel.js';
import { GitHubCheckStatus } from '../../github/common/types.js';
import { ISessionCIFixModel, ISessionCIFixState } from './views/sessionsList.js';

/**
 * Backs the per-session "Fix CI" row shown in the blocked-sessions dropdown for
 * sessions whose pull request has failing CI checks. Exposes a reactive summary
 * of the failing/pending check counts and, on demand, submits the `fix-ci`
 * prompt to the session's chat **in the background** — the session starts
 * working without being opened or made visible.
 *
 * While a fix is being submitted the session is reported via
 * {@link hiddenSessions} so the blocked-sessions list can drop it immediately;
 * by the time the submit resolves the session is in progress and so is no longer
 * blocked, keeping it out of the list without a flicker.
 */
export class BlockedSessionsCIFixModel extends Disposable implements ISessionCIFixModel {

	/** Cached CI-state observables, keyed by session, to keep references stable and GC-friendly. */
	private readonly _states = new WeakMap<ISession, IObservable<ISessionCIFixState | undefined>>();

	/**
	 * Session ids whose fix-CI submission is in flight. Doubles as the guard that
	 * stops repeated clicks submitting duplicate prompts, and as the set the
	 * blocked-sessions indicator hides while the background work runs.
	 */
	private readonly _hiddenSessions: ISettableObservable<ReadonlySet<string>> = observableValue(this, new Set());
	readonly hiddenSessions: IObservable<ReadonlySet<string>> = this._hiddenSessions;

	constructor(
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@IChatService private readonly _chatService: IChatService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	getCIFix(session: ISession): IObservable<ISessionCIFixState | undefined> {
		let obs = this._states.get(session);
		if (!obs) {
			obs = derived(this, reader => {
				const gitHubInfo = session.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
				if (!gitHubInfo?.pullRequest) {
					return undefined;
				}

				const prRef = reader.store.add(this._gitHubService.createPullRequestModelReference(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number));
				const livePR = prRef.object.pullRequest.read(reader);
				if (!livePR) {
					return undefined;
				}

				const ciRef = reader.store.add(this._gitHubService.createPullRequestCIModelReference(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number, livePR.headSha));
				const ciModel = ciRef.object;

				// Once a fix has been requested for the current head commit, hide the
				// row until a new commit lands (mirrors the chat input CI banner).
				if (ciModel.fixRequested.read(reader)) {
					return undefined;
				}

				const checks = ciModel.checks.read(reader);
				const failed = getFailedChecks(checks).length;
				if (failed === 0) {
					return undefined;
				}
				const completed = checks.filter(check => check.status === GitHubCheckStatus.Completed).length;
				const pending = checks.length - completed;
				return { failed, pending };
			});
			this._states.set(session, obs);
		}
		return obs;
	}

	fixCI(session: ISession): void {
		if (this._hiddenSessions.get().has(session.sessionId)) {
			return;
		}
		this._setHidden(session.sessionId, true);
		this._fixCI(session)
			.catch(err => this._logService.error('[BlockedSessionsCIFixModel] Failed to fix CI checks', err))
			// Release the optimistic hide once the submit settles: by now the
			// request has been sent and the session is in progress, so the blocked
			// model no longer reports it as blocked and it stays out of the list.
			.finally(() => this._setHidden(session.sessionId, false));
	}

	private async _fixCI(session: ISession): Promise<void> {
		// Hold our own CI-model reference for the whole flow: the session drops out
		// of the blocked list as soon as we hide it, which releases the row's
		// reference, so we must keep the model alive to build the prompt and mark
		// the fix requested.
		const store = new DisposableStore();
		try {
			const ciModel = this._acquireCIModel(session, store);
			if (!ciModel) {
				return;
			}

			const prompt = await buildFixCIPrompt(ciModel);
			if (!prompt) {
				return;
			}

			// Load the session's chat model in the background (without opening it in
			// the UI) and submit the prompt. `session.resource.scheme` is the agent
			// id used for routing (matching the agent-host skill-button flow); an
			// unknown scheme falls back to the default agent.
			const ref = await this._chatService.acquireOrLoadSession(session.resource, ChatAgentLocation.Chat, CancellationToken.None, 'BlockedSessionsCIFix');
			if (!ref) {
				this._logService.error('[BlockedSessionsCIFixModel] Cannot fix CI checks: failed to load session', session.resource.toString());
				return;
			}
			try {
				let result = await this._chatService.sendRequest(session.resource, prompt, { agentIdSilent: session.resource.scheme });
				if (ChatSendResult.isQueued(result)) {
					result = await result.deferred;
				}
				if (ChatSendResult.isSent(result)) {
					ciModel.markFixRequested();
				} else if (ChatSendResult.isRejected(result)) {
					this._logService.error('[BlockedSessionsCIFixModel] Fix CI request rejected', result.reason);
				}
			} finally {
				ref.dispose();
			}
		} finally {
			store.dispose();
		}
	}

	private _acquireCIModel(session: ISession, store: DisposableStore): GitHubPullRequestCIModel | undefined {
		const gitHubInfo = session.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
		if (!gitHubInfo?.pullRequest) {
			return undefined;
		}

		const prRef = store.add(this._gitHubService.createPullRequestModelReference(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number));
		const livePR = prRef.object.pullRequest.get();
		if (!livePR) {
			return undefined;
		}

		const ciRef = store.add(this._gitHubService.createPullRequestCIModelReference(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number, livePR.headSha));
		return ciRef.object;
	}

	private _setHidden(sessionId: string, hidden: boolean): void {
		const current = this._hiddenSessions.get();
		if (current.has(sessionId) === hidden) {
			return;
		}
		const next = new Set(current);
		if (hidden) {
			next.add(sessionId);
		} else {
			next.delete(sessionId);
		}
		this._hiddenSessions.set(next, undefined);
	}
}
