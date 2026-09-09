/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as objectEquals } from '../../../base/common/objects.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { parseUpstreamBranchName, type IAgentHostGitService } from '../common/agentHostGitService.js';
import { readSessionArtifacts, SessionArtifactType } from '../common/sessionArtifacts.js';
import { getSessionPullRequestUrlKey, readSessionGitHubState, readSessionGitState, withMostRecentSessionPullRequest, type ISessionGitHubState, type ISessionGitState, type ISessionWithDefaultChat, type SessionSummaryMeta } from '../common/state/sessionState.js';
import type { CreatedPullRequest, IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';

interface IRestrictedPullRequestResolution {
	readonly checkoutIdentity: string;
	readonly artifactUrls: readonly string[];
	readonly candidateUrls: readonly string[];
	readonly selectedUrl: string | undefined;
	readonly selectedState: 'open' | 'closed' | undefined;
}

interface IRestrictedPullRequestCandidates {
	readonly artifactUrls: readonly string[];
	readonly associatedUrls: readonly string[];
	readonly candidateUrls: readonly string[];
	readonly candidateKeys: ReadonlySet<string>;
	readonly restrictedState: ISessionGitHubState;
}

interface ICurrentPullRequestAssociation {
	readonly url: string | undefined;
	readonly eligible: boolean;
	readonly explicitlyAssociated: boolean;
	readonly state: 'open' | 'closed' | undefined;
}

interface ICurrentRestrictedState {
	readonly gitHubState: ISessionGitHubState;
}

/** Live session inputs and callbacks needed to guard an asynchronous reconciliation. */
export interface IRestrictedPullRequestReconciliationContext {
	readonly sessionKey: string;
	readonly sessionState: ISessionWithDefaultChat;
	readonly gitHubState: ISessionGitHubState;
	readonly gitState: ISessionGitState | undefined;
	readonly getAuthToken: () => string | undefined;
	readonly getCurrentSessionState: () => ISessionWithDefaultChat | undefined;
	readonly isRestrictedMode: () => boolean;
}

export type RestrictedPullRequestReconciliationResult =
	| { readonly kind: 'complete'; readonly changed: boolean; readonly gitHubState: ISessionGitHubState }
	| { readonly kind: 'failed'; readonly changed: boolean; readonly gitHubState: ISessionGitHubState; readonly error: Error }
	| { readonly kind: 'retry' };

function pullRequestSelectionState(state: ISessionGitHubState['pullRequestState']): 'open' | 'closed' | undefined {
	return state === 'open' ? 'open' : state === 'closed' || state === 'merged' ? 'closed' : undefined;
}

function distinctPullRequestUrls(...groups: readonly (readonly string[] | undefined)[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const group of groups) {
		for (const url of group ?? []) {
			const key = getSessionPullRequestUrlKey(url);
			if (!seen.has(key)) {
				seen.add(key);
				result.push(url);
			}
		}
	}
	return result;
}

function getPullRequestArtifactUrls(meta: SessionSummaryMeta | undefined): string[] {
	const urls: string[] = [];
	for (const artifact of readSessionArtifacts(meta)) {
		if (artifact.type === SessionArtifactType.PullRequest && artifact.isArtifact && artifact.isGitHub === true && artifact.link) {
			urls.push(artifact.link);
		}
	}
	return urls.reverse();
}

/** Resolves checkout pull requests and owns restricted-mode candidate selection state. */
export class AgentHostPullRequestAssociationResolver extends Disposable {

	private readonly _restrictedResolutions = new Map<string, IRestrictedPullRequestResolution>();
	private readonly _abortController = new AbortController();

	constructor(
		private readonly _gitService: IAgentHostGitService,
		private readonly _octoKitService: IAgentHostOctoKitService,
	) {
		super();
		this._register(toDisposable(() => this._abortController.abort()));
	}

	resetRestrictedState(): void {
		this._restrictedResolutions.clear();
	}

	removeSession(sessionKey: string): void {
		this._restrictedResolutions.delete(sessionKey);
	}

	/** Resolves the current checkout by remote head branch, then by exact HEAD commit. */
	async resolveForCheckout(
		state: ISessionWithDefaultChat,
		owner: string,
		repo: string,
		gitState: ISessionGitState | undefined,
		branchName: string,
		authToken: string,
		allowedPullRequestUrls?: readonly string[],
	): Promise<CreatedPullRequest | undefined> {
		const githubHeadOwner = gitState?.githubHeadOwner;
		const upstreamBranch = githubHeadOwner ? parseUpstreamBranchName(gitState?.upstreamBranchName) : undefined;
		const headBranch = upstreamBranch?.branch ?? branchName;
		const headOwner = githubHeadOwner ?? owner;
		const signal = this._abortController.signal;

		const pullRequestByBranch = await this._octoKitService.findPullRequestByHeadBranch(owner, repo, headBranch, authToken, signal, headOwner, allowedPullRequestUrls);
		if (pullRequestByBranch) {
			return pullRequestByBranch;
		}

		const workingDirectory = state.workingDirectories?.[0];
		if (!workingDirectory) {
			return undefined;
		}

		const headSha = await this._gitService.revParse(URI.parse(workingDirectory), 'HEAD');
		return headSha
			? this._octoKitService.findPullRequestByHeadSha(owner, repo, headSha, authToken, signal, allowedPullRequestUrls)
			: undefined;
	}

	/** Reconciles branch-aware GitHub state against artifact and explicit-association candidates. */
	async reconcileRestricted(context: IRestrictedPullRequestReconciliationContext): Promise<RestrictedPullRequestReconciliationResult> {
		const { sessionKey, sessionState, gitHubState, gitState } = context;
		const branchName = gitState?.branchName;
		const candidates = this._getRestrictedCandidates(sessionState._meta, gitHubState);
		const { artifactUrls, candidateUrls, restrictedState } = candidates;
		const owner = gitHubState.owner;
		const repo = gitHubState.repo;

		if (!owner || !repo || !branchName || branchName === gitState?.baseBranchName) {
			this._recordResolution(sessionKey, owner, repo, branchName, gitState, artifactUrls, candidateUrls);
			return this._complete(gitHubState, restrictedState);
		}

		const current = this._getCurrentAssociation(candidates, branchName);
		const previous = this._restrictedResolutions.get(sessionKey);
		if (this._canReuseResolution(previous, current, owner, repo, branchName, gitState, artifactUrls, candidateUrls)) {
			this._recordResolution(sessionKey, owner, repo, branchName, gitState, artifactUrls, candidateUrls, current.eligible ? current.url : undefined, current.eligible ? current.state : undefined);
			return this._complete(gitHubState, restrictedState);
		}

		const authToken = context.getAuthToken();
		if (!authToken) {
			return this._complete(gitHubState, restrictedState);
		}

		const orderedCandidates = this._orderCandidates(candidates, current, previous);
		let pullRequest: CreatedPullRequest | undefined;
		try {
			pullRequest = await this.resolveForCheckout(sessionState, owner, repo, gitState, branchName, authToken, orderedCandidates);
		} catch (error) {
			return {
				kind: 'failed',
				changed: !objectEquals(gitHubState, restrictedState),
				gitHubState: restrictedState,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
		const currentState = this._getCurrentRestrictedState(context, owner, repo, branchName, artifactUrls, candidateUrls);
		if (!currentState) {
			return { kind: 'retry' };
		}

		const nextState = this._withResolvedPullRequest(currentState.gitHubState, candidates.candidateKeys, branchName, pullRequest);
		this._recordResolution(sessionKey, owner, repo, branchName, gitState, artifactUrls, candidateUrls, pullRequest?.url, pullRequest?.state);
		return this._complete(currentState.gitHubState, nextState);
	}

	private _getRestrictedCandidates(meta: SessionSummaryMeta | undefined, gitHubState: ISessionGitHubState): IRestrictedPullRequestCandidates {
		const artifactUrls = getPullRequestArtifactUrls(meta);
		const associatedUrls = gitHubState.associatedPullRequestUrls ?? [];
		const candidateUrls = distinctPullRequestUrls(artifactUrls, associatedUrls);
		const candidateKeys = new Set(candidateUrls.map(getSessionPullRequestUrlKey));
		return {
			artifactUrls,
			associatedUrls,
			candidateUrls,
			candidateKeys,
			restrictedState: this._restrictPullRequestState(gitHubState, candidateKeys),
		};
	}

	private _getCurrentAssociation(candidates: IRestrictedPullRequestCandidates, branchName: string): ICurrentPullRequestAssociation {
		const { associatedUrls, candidateKeys, restrictedState } = candidates;
		const url = restrictedState.pullRequestBranchName === branchName ? restrictedState.pullRequestUrls?.[0] : undefined;
		const eligible = url !== undefined && candidateKeys.has(getSessionPullRequestUrlKey(url));
		const explicitlyAssociated = url !== undefined && associatedUrls.some(candidate => getSessionPullRequestUrlKey(candidate) === getSessionPullRequestUrlKey(url));
		const state = url && restrictedState.pullRequestStateUrl && getSessionPullRequestUrlKey(url) === getSessionPullRequestUrlKey(restrictedState.pullRequestStateUrl)
			? pullRequestSelectionState(restrictedState.pullRequestState)
			: undefined;
		return { url, eligible, explicitlyAssociated, state };
	}

	private _canReuseResolution(
		previous: IRestrictedPullRequestResolution | undefined,
		current: ICurrentPullRequestAssociation,
		owner: string,
		repo: string,
		branchName: string,
		gitState: ISessionGitState | undefined,
		artifactUrls: readonly string[],
		candidateUrls: readonly string[],
	): boolean {
		const artifactInputsChanged = previous !== undefined && !this._sameUrls(previous.artifactUrls, artifactUrls);
		const inputsUnchanged = previous?.checkoutIdentity === this._checkoutIdentity(owner, repo, branchName, gitState)
			&& this._sameUrls(previous.artifactUrls, artifactUrls)
			&& this._sameUrls(previous.candidateUrls, candidateUrls);
		const reconsiderNonOpenSelection = current.eligible
			&& candidateUrls.length > 1
			&& current.state !== undefined
			&& current.state !== 'open'
			&& (!previous || previous.selectedUrl === undefined || !this._sameUrl(previous.selectedUrl, current.url) || previous.selectedState !== current.state);

		return candidateUrls.length === 0
			|| (current.eligible && (previous !== undefined || current.explicitlyAssociated) && !artifactInputsChanged && !reconsiderNonOpenSelection)
			|| (!current.eligible && inputsUnchanged && previous?.selectedUrl === undefined);
	}

	private _orderCandidates(candidates: IRestrictedPullRequestCandidates, current: ICurrentPullRequestAssociation, previous: IRestrictedPullRequestResolution | undefined): string[] {
		const previousArtifactKeys = new Set(previous?.artifactUrls.map(getSessionPullRequestUrlKey));
		const newlyAddedArtifactUrls = previous
			? candidates.artifactUrls.filter(url => !previousArtifactKeys.has(getSessionPullRequestUrlKey(url)))
			: [];
		const fallbackCandidates = previous
			? distinctPullRequestUrls(candidates.restrictedState.pullRequestUrls, candidates.artifactUrls, candidates.associatedUrls)
			: distinctPullRequestUrls(candidates.artifactUrls, candidates.restrictedState.pullRequestUrls, candidates.associatedUrls);
		return distinctPullRequestUrls(
			newlyAddedArtifactUrls,
			current.eligible && current.url && (previous !== undefined || current.explicitlyAssociated) ? [current.url] : undefined,
			fallbackCandidates,
		);
	}

	private _getCurrentRestrictedState(
		context: IRestrictedPullRequestReconciliationContext,
		owner: string,
		repo: string,
		branchName: string,
		artifactUrls: readonly string[],
		candidateUrls: readonly string[],
	): ICurrentRestrictedState | undefined {
		const sessionState = context.getCurrentSessionState();
		const gitState = readSessionGitState(sessionState?._meta);
		if (!sessionState || gitState?.branchName !== branchName || !context.isRestrictedMode()) {
			return undefined;
		}
		const gitHubState = readSessionGitHubState(sessionState._meta);
		if (gitHubState?.owner !== owner || gitHubState.repo !== repo) {
			return undefined;
		}
		const currentCandidates = this._getRestrictedCandidates(sessionState._meta, gitHubState);
		return this._sameUrls(currentCandidates.artifactUrls, artifactUrls) && this._sameUrls(currentCandidates.candidateUrls, candidateUrls)
			? { gitHubState }
			: undefined;
	}

	private _withResolvedPullRequest(gitHubState: ISessionGitHubState, candidateKeys: ReadonlySet<string>, branchName: string, pullRequest: CreatedPullRequest | undefined): ISessionGitHubState {
		let nextState = this._restrictPullRequestState(gitHubState, candidateKeys);
		if (!pullRequest) {
			return !nextState.pullRequestBranchName || nextState.pullRequestBranchName === branchName
				? this._withoutSelectedPullRequest(nextState)
				: nextState;
		}
		if (nextState.pullRequestStateUrl && !this._sameUrl(nextState.pullRequestStateUrl, pullRequest.url)) {
			nextState = this._withoutPullRequestStatus(nextState);
		}
		return {
			...nextState,
			...withMostRecentSessionPullRequest(nextState, pullRequest.url, branchName),
			...(nextState.initialPullRequestUrls !== undefined
				? { initialPullRequestUrls: nextState.initialPullRequestUrls.filter(url => !this._sameUrl(url, pullRequest.url)) }
				: {}),
		};
	}

	private _sameUrls(left: readonly string[], right: readonly string[]): boolean {
		return objectEquals(left.map(getSessionPullRequestUrlKey), right.map(getSessionPullRequestUrlKey));
	}

	private _sameUrl(left: string, right: string | undefined): boolean {
		return right !== undefined && getSessionPullRequestUrlKey(left) === getSessionPullRequestUrlKey(right);
	}

	private _recordResolution(
		sessionKey: string,
		owner: string | undefined,
		repo: string | undefined,
		branchName: string | undefined,
		gitState: ISessionGitState | undefined,
		artifactUrls: readonly string[],
		candidateUrls: readonly string[],
		selectedUrl?: string,
		selectedState?: 'open' | 'closed',
	): void {
		this._restrictedResolutions.set(sessionKey, {
			checkoutIdentity: this._checkoutIdentity(owner, repo, branchName, gitState),
			artifactUrls,
			candidateUrls,
			selectedUrl,
			selectedState,
		});
	}

	private _checkoutIdentity(owner: string | undefined, repo: string | undefined, branchName: string | undefined, gitState: ISessionGitState | undefined): string {
		return JSON.stringify([owner, repo, branchName, gitState?.upstreamBranchName, gitState?.githubHeadOwner]);
	}

	private _complete(previousState: ISessionGitHubState, gitHubState: ISessionGitHubState): RestrictedPullRequestReconciliationResult {
		return { kind: 'complete', changed: !objectEquals(previousState, gitHubState), gitHubState };
	}

	private _restrictPullRequestState(gitHubState: ISessionGitHubState, candidateKeys: ReadonlySet<string>): ISessionGitHubState {
		const currentUrl = gitHubState.pullRequestUrls?.[0];
		const pullRequestUrls = gitHubState.pullRequestUrls?.filter(url => candidateKeys.has(getSessionPullRequestUrlKey(url))) ?? [];
		const initialPullRequestUrls = gitHubState.initialPullRequestUrls?.filter(url => candidateKeys.has(getSessionPullRequestUrlKey(url)));
		const next: {
			owner?: string;
			repo?: string;
			pullRequestUrls?: readonly string[];
			initialPullRequestUrls?: readonly string[];
			associatedPullRequestUrls?: readonly string[];
			pullRequestState?: ISessionGitHubState['pullRequestState'];
			pullRequestStateUrl?: string;
			pullRequestBranchName?: string;
		} = { ...gitHubState };
		if (pullRequestUrls.length > 0) {
			next.pullRequestUrls = pullRequestUrls;
		} else {
			delete next.pullRequestUrls;
		}
		if (initialPullRequestUrls !== undefined) {
			next.initialPullRequestUrls = initialPullRequestUrls;
		}
		if (currentUrl && pullRequestUrls[0] && getSessionPullRequestUrlKey(currentUrl) === getSessionPullRequestUrlKey(pullRequestUrls[0])) {
			return next;
		}
		return this._withoutSelectedPullRequest(next);
	}

	private _withoutSelectedPullRequest(gitHubState: ISessionGitHubState): ISessionGitHubState {
		const { pullRequestBranchName: _ignoredBranch, pullRequestUrls: _ignoredUrls, ...next } = this._withoutPullRequestStatus(gitHubState);
		return next;
	}

	private _withoutPullRequestStatus(gitHubState: ISessionGitHubState): ISessionGitHubState {
		const { pullRequestState: _ignoredState, pullRequestStateUrl: _ignoredStateUrl, ...next } = gitHubState;
		return next;
	}
}
