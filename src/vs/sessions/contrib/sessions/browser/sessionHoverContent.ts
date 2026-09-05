/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ISessionSummaryHoverData, ISessionSummaryHoverLocation, ISessionSummaryHoverPullRequest } from '../../../../workbench/contrib/chat/browser/agentSessions/sessionSummaryHover.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { IPreferencesService } from '../../../../workbench/services/preferences/common/preferences.js';
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
	openerService: IOpenerService,
	labelService: ILabelService,
	preferencesService: IPreferencesService,
	createdBy?: ISessionSummaryHoverData['createdBy'],
): ISessionSummaryHoverData {
	return {
		title: session.title.get() || getUntitledSessionTitle(session.isQuickChat?.get() ?? false),
		location: getLocation(session, labelService),
		pullRequests: getPullRequests(session, openerService),
		createdBy,
		externalSession: getExternalSession(session, preferencesService),
		providerLabel: getProviderLabel(session, sessionsProvidersService),
	};
}

function getLocation(session: ISession, labelService: ILabelService): ISessionSummaryHoverLocation | undefined {
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

	// Paths go through the label service, so a path under the user's home reads
	// as `~/projects/vscode` and a remote or virtual one gets its own formatting.
	return {
		// A virtual workspace has no path a user could act on, so it is named by
		// its repository label instead.
		workspace: isVirtual ? workspace.label : labelService.getUriLabel(folder.root),
		workspaceIcon: workspace.typeIcon ?? (isVirtual ? Codicon.cloud : Codicon.folder),
		worktree: worktreeUri ? labelService.getUriLabel(worktreeUri) : undefined,
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
function getPullRequests(session: ISession, openerService: IOpenerService): readonly ISessionSummaryHoverPullRequest[] | undefined {
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
		? refs.map(ref => ({
			title: ref.title ?? `#${ref.number}`,
			icon: ref.icon,
			uri: ref.uri,
			onOpen: () => openerService.open(ref.uri, { openExternal: true }).catch(onUnexpectedError),
		}))
		: undefined;
}

/**
 * A session created in another application is listed only because
 * {@link ChatConfiguration.ShowExternalAgentSessions} says such sessions are
 * shown, so the row both names that origin and leads to the setting behind it.
 */
function getExternalSession(session: ISession, preferencesService: IPreferencesService): ISessionSummaryHoverData['externalSession'] {
	if (session.isExternal?.get() !== true) {
		return undefined;
	}

	return {
		onOpen: () => {
			preferencesService.openSettings({
				jsonEditor: false,
				query: `@id:${ChatConfiguration.ShowExternalAgentSessions}`,
			}).catch(onUnexpectedError);
		},
	};
}

/** The kind of agent serving the session, e.g. "Claude". */
function getProviderLabel(session: ISession, sessionsProvidersService: ISessionsProvidersService): string | undefined {
	const provider = sessionsProvidersService.getProvider(session.providerId);
	if (!provider) {
		return undefined;
	}
	return provider.sessionTypes.find(type => type.id === session.sessionType)?.label ?? provider.label;
}
