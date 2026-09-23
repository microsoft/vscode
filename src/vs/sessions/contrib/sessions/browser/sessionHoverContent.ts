/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDelayedHoverOptions } from '../../../../base/browser/ui/hover/hover.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ISessionSummaryHoverData, ISessionSummaryHoverLocation, ISessionSummaryHoverPullRequest, SessionSummaryHoverWidget } from '../../../../workbench/contrib/chat/browser/agentSessions/sessionSummaryHover.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { IPreferencesService } from '../../../../workbench/services/preferences/common/preferences.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { getSessionOwnedGitHubPullRequestRefs, getSessionWorkspaceKind, getUntitledSessionTitle, ISession, SessionWorkspaceKind } from '../../../services/sessions/common/session.js';
import { readSessionChangesStats } from '../../../services/sessions/common/sessionChangesStatsCache.js';

/** Shared session diff counts, omitting entries without line changes. */
export function getSessionDiffStats(session: ISession, reader?: IReader): { files: number; insertions: number; deletions: number } | undefined {
	const stats = readSessionChangesStats(session, reader);
	return stats && (stats.insertions > 0 || stats.deletions > 0) ? stats : undefined;
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
	includeUpdatedAt = false,
): ISessionSummaryHoverData {
	return {
		title: session.title.get() || getUntitledSessionTitle(session.isQuickChat?.get() ?? false),
		...(includeUpdatedAt ? { updatedAt: session.updatedAt.get() } : {}),
		location: getLocation(session, labelService),
		pullRequests: getPullRequests(session, openerService),
		createdBy,
		externalSession: getExternalSession(session, preferencesService),
		providerLabel: getProviderLabel(session, sessionsProvidersService),
	};
}

/** Owns live external status for each display of the hover, including cached reopens. */
export function createSessionSummaryHover(session: ISession, data: ISessionSummaryHoverData, preferencesService: IPreferencesService): Pick<IDelayedHoverOptions, 'content' | 'onDidShow' | 'onDidHide'> {
	const widget = new SessionSummaryHoverWidget(data);
	let external = session.isExternal?.get();
	let hoverDisposables: DisposableStore | undefined;
	return {
		content: widget.domNode,
		onDidShow: () => {
			hoverDisposables?.dispose();
			hoverDisposables = new DisposableStore();
			hoverDisposables.add(autorun(reader => {
				const current = session.isExternal?.read(reader);
				if (current !== external) {
					external = current;
					widget.updateExternalSession(getExternalSession(session, preferencesService));
				}
			}));
		},
		onDidHide: () => {
			hoverDisposables?.dispose();
			hoverDisposables = undefined;
		},
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
 * Pull requests produced by or explicitly associated with the session.
 * Excludes inherited checkout PRs and mere references when provider provenance is available.
 */
function getPullRequests(session: ISession, openerService: IOpenerService): readonly ISessionSummaryHoverPullRequest[] | undefined {
	const gitHubInfo = session.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
	if (!gitHubInfo) {
		return undefined;
	}

	const refs = getSessionOwnedGitHubPullRequestRefs(gitHubInfo);

	return refs.length
		? refs.map(ref => ({
			title: ref.title ?? `#${ref.number}`,
			icon: ref.icon,
			uri: ref.uri,
			onOpen: () => openerService.open(ref.uri, { openExternal: true }).catch(onUnexpectedError),
		}))
		: undefined;
}

/** Links a session still treated as external to its visibility setting. */
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
