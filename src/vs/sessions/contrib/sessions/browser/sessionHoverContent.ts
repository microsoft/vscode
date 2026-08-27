/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ISessionSummaryHoverData, ISessionSummaryHoverLocation, ISessionSummaryHoverPullRequest } from '../../../../workbench/contrib/chat/browser/agentSessions/sessionSummaryHover.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { getSessionWorkspaceKind, getUntitledSessionTitle, IGitHubPullRequestRef, ISession, SessionWorkspaceKind } from '../../../services/sessions/common/session.js';

/**
 * Aggregated insertions/deletions across all of a session's changes,
 * or `undefined` when the session has no pending changes.
 */
export function getSessionDiffStats(session: ISession): { files: number; insertions: number; deletions: number } | undefined {
	const changes = session.changes.get();
	if (changes.length === 0) {
		return undefined;
	}
	let insertions = 0;
	let deletions = 0;
	for (const change of changes) {
		insertions += change.insertions;
		deletions += change.deletions;
	}
	if (insertions === 0 && deletions === 0) {
		return undefined;
	}
	return { files: changes.length, insertions, deletions };
}

/**
 * The Agents window's adapter onto the shared session hover: reads a live
 * {@link ISession} into the provider-neutral data the widget renders.
 *
 * This is the richest of the adapters — the Agents window owns the full session
 * model — so it is the one that can fill in the worktree, the branch, pending
 * changes and the session's pull requests. Windows backed by a thinner data
 * source populate what they have and omit the rest.
 */
export function getSessionSummaryHoverData(
	session: ISession,
	sessionsProvidersService: ISessionsProvidersService,
	createdBy?: ISessionSummaryHoverData['createdBy'],
): ISessionSummaryHoverData {
	return {
		title: session.title.get() || getUntitledSessionTitle(session.isQuickChat?.get() ?? false),
		location: getLocation(session),
		pullRequests: getPullRequests(session),
		createdBy,
		providerLabels: getProviderLabels(session, sessionsProvidersService),
	};
}

function getLocation(session: ISession): ISessionSummaryHoverLocation | undefined {
	const workspace = session.workspace.get();
	const folder = workspace?.folders[0];
	if (!workspace || !folder) {
		return undefined;
	}

	// A pending worktree still describes the checkout it was started from, so its
	// path, branch and changes are withheld until the worktree exists.
	const worktreePending = session.worktreePending?.get() ?? false;
	const isVirtual = getSessionWorkspaceKind(workspace, worktreePending) === SessionWorkspaceKind.Virtual;
	const worktreeUri = worktreePending ? undefined : folder.gitRepository?.workTreeUri;

	return {
		// A virtual workspace has no path a user could act on, so it is named by
		// its repository label instead.
		workspace: isVirtual ? workspace.label : locationLabel(folder.root),
		workspaceIcon: workspace.typeIcon ?? (isVirtual ? Codicon.cloud : Codicon.folder),
		worktree: worktreeUri ? locationLabel(worktreeUri) : undefined,
		worktreePending,
		branch: worktreePending ? undefined : folder.gitRepository?.branchName?.trim() || undefined,
		changes: worktreePending ? undefined : getSessionDiffStats(session),
	};
}

/**
 * Pull requests the session itself produced. Pull requests inherited from the
 * checkout it started from, or merely referenced by the agent, are left out —
 * they are not this session's work.
 */
function getPullRequests(session: ISession): readonly ISessionSummaryHoverPullRequest[] | undefined {
	const gitHubInfo = session.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
	if (!gitHubInfo) {
		return undefined;
	}

	// Providers that do not distinguish created from inherited pull requests
	// publish only the main one, which is the pull request of the session.
	const refs: readonly IGitHubPullRequestRef[] = gitHubInfo.pullRequests
		? gitHubInfo.pullRequests.filter(ref => ref.createdByThisSession)
		: gitHubInfo.pullRequest
			? [{ owner: gitHubInfo.owner, repo: gitHubInfo.repo, ...gitHubInfo.pullRequest }]
			: [];

	return refs.length
		? refs.map(ref => ({ title: ref.title ?? `#${ref.number}`, icon: ref.icon }))
		: undefined;
}

/** The session type and the provider serving it, e.g. "Claude · Local Agent Host". */
function getProviderLabels(session: ISession, sessionsProvidersService: ISessionsProvidersService): readonly string[] | undefined {
	const provider = sessionsProvidersService.getProvider(session.providerId);
	if (!provider) {
		return undefined;
	}
	const sessionType = provider.sessionTypes.find(type => type.id === session.sessionType);
	return sessionType && sessionType.label !== provider.label
		? [sessionType.label, provider.label]
		: [provider.label];
}

/** A readable label for a location: a filesystem path where there is one. */
function locationLabel(uri: URI): string {
	return uri.scheme === Schemas.file ? uri.fsPath : uri.toString(true);
}
