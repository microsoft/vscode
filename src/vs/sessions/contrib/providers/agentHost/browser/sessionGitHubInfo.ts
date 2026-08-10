/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../../base/common/equals.js';
import { derived, derivedOpts, IDerivedReader, IObservable, observableFromPromise } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { readSessionGitState, SessionMeta } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IGitHubInfo } from '../../../../services/sessions/common/session.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { computePullRequestIcon } from '../../../github/common/types.js';
import { computePullRequestIconStatus } from '../../../github/browser/pullRequestIconStatus.js';

/**
 * Shared trace prefix for the pull-request icon pipeline that feeds the session
 * PR status icons. Filter the logs on this token to follow the whole flow
 * end-to-end (coords -> PR number -> live model -> icon).
 */
const TRACE_PREFIX = '[PR-ICON-TRACE]';

/** GitHub coordinates resolved from a session's git state. */
interface IGitHubCoords {
	readonly owner: string;
	readonly repo: string;
	readonly branch: string;
}

/**
 * A promise-backed PR-number observable. {@link observableFromPromise} exposes the
 * resolved value under `value` once the underlying lookup settles (`undefined`
 * until then, and also when no pull request targets the branch).
 */
type PullRequestNumberObservable = IObservable<{ readonly value?: number | undefined }>;

/**
 * Resolves the {@link IGitHubInfo} (owner/repo + pull request + status icon) for a
 * single agent-host session, reactively derived from the session's git state.
 *
 * The pipeline has three stages, each its own observable so the session list and
 * header re-render the moment any input changes:
 *
 * 1. {@link _coords} — owner/repo/branch parsed from the agent host's git state.
 * 2. {@link _pullRequestNumber} — the PR number targeting the branch, resolved
 *    asynchronously by the workbench-side {@link IGitHubService}.
 * 3. {@link gitHubInfo} — the full info, whose icon is computed from a **live,
 *    shared** pull-request model (open/closed/merged/draft) and, for open pull
 *    requests, refined by CI check status and unresolved review threads.
 *
 * A resolved PR number is kept **sticky** per `owner/repo@branch` (see
 * {@link _pullRequestNumberCache}) so a recompute — or an unobserve/re-observe
 * during a session switch or sessions-list re-render — does not transiently drop
 * the pull request, which would release and dispose the shared live model and
 * blank the icon.
 */
export class SessionGitHubInfoResolver {

	/** {@link IGitHubInfo} for the session, including the PR status icon. */
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined>;

	/** GitHub coords (owner/repo/branch) derived from the session git state. */
	private readonly _coords: IObservable<IGitHubCoords | undefined>;

	/** The promise-backed PR-number observable for the current coords (if any). */
	private readonly _pullRequestNumber: IObservable<PullRequestNumberObservable | undefined>;

	/**
	 * Per-coords cache of promise-backed PR-number observables.
	 * {@link observableFromPromise} starts unresolved (`value === undefined`) and
	 * only settles on a later microtask, so creating a fresh one on every recompute
	 * would make the PR number — and therefore `gitHubInfo.pullRequest` — flap back
	 * to `undefined`. Reusing the cached observable keeps a resolved PR number
	 * sticky; a "no PR yet" lookup is evicted so a PR created later is still picked up.
	 */
	private readonly _pullRequestNumberCache = new Map<string, PullRequestNumberObservable>();

	constructor(
		meta: IObservable<SessionMeta | undefined>,
		private readonly _sessionId: string,
		private readonly _gitHubService: IGitHubService | undefined,
		private readonly _logService: ILogService,
	) {
		this._coords = derivedOpts<IGitHubCoords | undefined>(
			{ owner: this, equalsFn: structuralEquals },
			reader => {
				const git = readSessionGitState(meta.read(reader));
				if (git?.githubOwner && git?.githubRepo && git?.branchName) {
					return { owner: git.githubOwner, repo: git.githubRepo, branch: git.branchName };
				}
				return undefined;
			});

		this._pullRequestNumber = derived(this, reader => {
			const coords = this._coords.read(reader);
			if (!coords || !this._gitHubService) {
				return undefined;
			}
			return this._pullRequestNumberFor(coords, this._gitHubService);
		});

		this.gitHubInfo = derived(this, reader => this._computeGitHubInfo(reader));
	}

	/**
	 * Get — or create and cache — the sticky promise-backed PR-number observable for
	 * `coords`. See {@link _pullRequestNumberCache} for why the observable is reused.
	 */
	private _pullRequestNumberFor(coords: IGitHubCoords, gitHubService: IGitHubService): PullRequestNumberObservable {
		const key = `${coords.owner}/${coords.repo}@${coords.branch}`;
		const cached = this._pullRequestNumberCache.get(key);
		if (cached) {
			// Sticky hit: reusing the same observable is what keeps the PR number (and
			// therefore the icon) from flapping on recompute. Repeated *misses* logged
			// below for the same key would indicate the stickiness has regressed.
			this._logService.trace(`${TRACE_PREFIX} [IconAdapter] Session ${this._sessionId} reusing sticky PR-number observable for ${key} (current value ${cached.get().value ?? 'unresolved'})`);
			return cached;
		}

		this._logService.trace(`${TRACE_PREFIX} [IconAdapter] Session ${this._sessionId} no cached PR-number observable for ${key}; starting lookup`);
		const lookup = gitHubService.findPullRequestNumberByHeadBranch(coords.owner, coords.repo, coords.branch);
		const prNumberObs = observableFromPromise(lookup);
		this._pullRequestNumberCache.set(key, prNumberObs);
		// Don't pin a "no PR yet" result: drop it so a later recompute re-queries
		// (the GitHub service likewise only caches resolved PR numbers indefinitely).
		lookup.then(prNumber => {
			if (prNumber === undefined) {
				const evicted = this._pullRequestNumberCache.get(key) === prNumberObs;
				if (evicted) {
					this._pullRequestNumberCache.delete(key);
				}
				this._logService.trace(`${TRACE_PREFIX} [IconAdapter] Session ${this._sessionId} PR-number lookup for ${key} resolved with no PR${evicted ? '; evicted cache entry so a later recompute retries' : ' (cache entry already replaced)'}`);
			} else {
				this._logService.trace(`${TRACE_PREFIX} [IconAdapter] Session ${this._sessionId} PR-number lookup for ${key} resolved PR #${prNumber}; kept sticky`);
			}
		});
		return prNumberObs;
	}

	private _computeGitHubInfo(reader: IDerivedReader): IGitHubInfo | undefined {
		const coords = this._coords.read(reader);
		if (!coords) {
			this._logService.trace(`${TRACE_PREFIX} [IconAdapter] Session ${this._sessionId} has no GitHub coords (missing owner/repo/branch in git state); no PR icon`);
			return undefined;
		}

		const coordsLabel = `${coords.owner}/${coords.repo}@${coords.branch}`;
		const pullRequestNumberObs = this._pullRequestNumber.read(reader);
		if (!pullRequestNumberObs) {
			// With coords present, `_pullRequestNumber` is only `undefined` when no
			// GitHub service is wired up, so the PR number can never resolve.
			this._logService.trace(`${TRACE_PREFIX} [IconAdapter] Session ${this._sessionId} coords ${coordsLabel}: no GitHub service available; emitting gitHubInfo without pullRequest`);
			return { owner: coords.owner, repo: coords.repo };
		}

		// `observableFromPromise` starts as `{}` and becomes `{ value }` once the lookup
		// settles, so a present `value` key (even when its value is `undefined`) means the
		// lookup resolved with no PR — distinct from a still-pending lookup.
		const resolved = pullRequestNumberObs.read(reader);
		const prNumber = resolved.value;
		if (prNumber === undefined) {
			const reason = Object.hasOwn(resolved, 'value') ? 'no pull request targets this branch' : 'PR number lookup still pending';
			this._logService.trace(`${TRACE_PREFIX} [IconAdapter] Session ${this._sessionId} coords ${coordsLabel}: ${reason}; emitting gitHubInfo without pullRequest`);
			return { owner: coords.owner, repo: coords.repo };
		}

		const uri = URI.parse(`https://github.com/${coords.owner}/${coords.repo}/pull/${prNumber}`);
		const icon = this._computePullRequestIcon(reader, coords, prNumber);
		return {
			owner: coords.owner,
			repo: coords.repo,
			pullRequest: { number: prNumber, uri, icon },
		};
	}

	/**
	 * Compute the PR status icon from the live, shared pull-request model. For open,
	 * non-draft pull requests the icon is refined by CI check status (failing checks)
	 * and unresolved review threads. Returns `undefined` until the live model has been
	 * refreshed (or when no GitHub service is available), so the caller can keep the
	 * pull request without an icon while the first fetch is in flight.
	 */
	private _computePullRequestIcon(reader: IDerivedReader, coords: IGitHubCoords, prNumber: number): ThemeIcon | undefined {
		const gitHubService = this._gitHubService;
		if (!gitHubService) {
			this._logService.trace(`${TRACE_PREFIX} [IconAdapter] Session ${this._sessionId} PR ${coords.owner}/${coords.repo}#${prNumber}: no GitHub service available; icon undefined`);
			return undefined;
		}

		const prRef = reader.store.add(gitHubService.createPullRequestModelReference(coords.owner, coords.repo, prNumber));
		const livePR = prRef.object.pullRequest.read(reader);
		if (!livePR) {
			this._logService.trace(`${TRACE_PREFIX} [IconAdapter] Session ${this._sessionId} PR ${coords.owner}/${coords.repo}#${prNumber}: livePR not loaded yet; icon undefined (waiting for PR model refresh)`);
			return undefined;
		}

		const status = computePullRequestIconStatus(reader, gitHubService, coords.owner, coords.repo, livePR);
		const icon = computePullRequestIcon(livePR.isDraft ? 'draft' : livePR.state, status);
		this._logService.trace(`${TRACE_PREFIX} [IconAdapter] Session ${this._sessionId} PR ${coords.owner}/${coords.repo}#${prNumber}: livePR present (state ${livePR.state}, isDraft ${livePR.isDraft}, headSha ${livePR.headSha}), hasFailingChecks ${!!status.hasFailingChecks}, hasUnresolvedComments ${!!status.hasUnresolvedComments} -> icon ${icon?.id ?? 'none'}`);
		return icon;
	}
}
