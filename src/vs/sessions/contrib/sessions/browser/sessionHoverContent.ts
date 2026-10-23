/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDelayedHoverOptions } from '../../../../base/browser/ui/hover/hover.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { Schemas } from '../../../../base/common/network.js';
import { dirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ISessionSummaryHoverData, ISessionSummaryHoverLocation, ISessionSummaryHoverPullRequest, ISessionSummaryHoverWorkspace, SessionSummaryHoverWidget } from '../../../../workbench/contrib/chat/browser/agentSessions/sessionSummaryHover.js';
import { SHOW_SESSION_APPLICATION_FILTERS_COMMAND_ID } from '../../../common/sessionCommands.js';
import { UNKNOWN_SESSION_APPLICATION_ID } from '../../../common/sessionApplication.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { BRANCH_CHANGES_CHANGESET_ID, getSessionOwnedGitHubPullRequestRefs, getSessionWorkspaceKind, getUntitledSessionTitle, IChat, ISession, ISessionFolder, ISessionWorkspace, SessionWorkspaceKind } from '../../../services/sessions/common/session.js';
import { ISessionChangesStats, readChatChangesStats, readSessionChangesStats } from '../../../services/sessions/common/sessionChangesStatsCache.js';

/** Shared session diff counts, omitting entries without line changes. */
export function getSessionDiffStats(session: ISession, reader?: IReader): ISessionSummaryHoverLocation['changes'] {
	return withLineChanges(readSessionChangesStats(session, reader));
}

function withLineChanges(stats: ISessionChangesStats | undefined): ISessionSummaryHoverLocation['changes'] {
	return stats && (stats.insertions > 0 || stats.deletions > 0) ? stats : undefined;
}

/**
 * A chat's counts for the hover. A provider's catalog summary is the only source when it has one,
 * because reading the chat's changes or changesets can load the chat from its backend.
 */
function getChatHoverChanges(chat: IChat, preferredChangesetId?: string): ISessionSummaryHoverLocation['changes'] {
	if (chat.changesSummary) {
		const summary = chat.changesSummary.get();
		return withLineChanges(summary && { files: summary.files, insertions: summary.additions, deletions: summary.deletions });
	}
	return withLineChanges(readChatChangesStats(chat, undefined, preferredChangesetId));
}

/**
 * The session's catalog counts, else its main chat's catalog counts. A provider without catalog counts keeps the
 * previous reading of the main chat's own changes, because its default changeset can compute a diff when read.
 */
function getSessionHoverChanges(session: ISession): ISessionSummaryHoverLocation['changes'] {
	const summary = session.changesSummary?.get();
	if (summary) {
		return withLineChanges({ files: summary.files, insertions: summary.additions, deletions: summary.deletions });
	}
	const mainChat = session.mainChat.get();
	return mainChat.changesSummary ? getChatHoverChanges(mainChat) : getSessionDiffStats(session);
}

/**
 * The main chat's counts in a multi-folder session's hover: its Branch Changes when the caller already observes them
 * (the row of the open chat shows them), else its catalog counts like any other chat.
 */
function getMainChatHoverChanges(mainChat: IChat, branchChangesObserved: boolean): ISessionSummaryHoverLocation['changes'] {
	if (branchChangesObserved) {
		const branchChanges = readChatChangesStats(mainChat, undefined, BRANCH_CHANGES_CHANGESET_ID);
		if (branchChanges !== undefined) {
			return withLineChanges(branchChanges);
		}
	}
	return getChatHoverChanges(mainChat, BRANCH_CHANGES_CHANGESET_ID);
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
	createdBy?: ISessionSummaryHoverData['createdBy'],
	includeUpdatedAt = false,
	mainChatBranchChangesObserved = false,
): ISessionSummaryHoverData {
	const sessionWorkspace = session.workspace.get();
	const isMultiFolder = (sessionWorkspace?.folders.length ?? 0) > 1;
	const mainChat = isMultiFolder ? session.mainChat.get() : undefined;
	const mainWorkspace = mainChat?.workspace.get() ?? sessionWorkspace;
	const topPullRequestRefs = getPullRequestRefs([isMultiFolder ? mainWorkspace : sessionWorkspace]);
	return {
		...getProviderDetails(session, sessionsProvidersService),
		title: session.title.get() || getUntitledSessionTitle(session.isQuickChat?.get() ?? false),
		...(includeUpdatedAt ? { updatedAt: session.updatedAt.get() } : {}),
		location: getLocation(
			isMultiFolder ? mainWorkspace : sessionWorkspace,
			session.worktreePending?.get() ?? false,
			() => mainChat ? getMainChatHoverChanges(mainChat, mainChatBranchChangesObserved) : getSessionHoverChanges(session),
			labelService,
		),
		pullRequests: toHoverPullRequests(topPullRequestRefs.values(), openerService),
		createdBy,
		application: getApplication(session, openerService),
		...(sessionWorkspace && isMultiFolder ? {
			sessionSummary: {
				workspaces: getWorkspaceSummaries(sessionWorkspace, session.worktreePending?.get() ?? false, labelService),
				changes: getSessionHoverChanges(session),
				// The session-wide union includes the main chat's folders, whose pull requests are listed above.
				pullRequests: toHoverPullRequests(
					[...getSessionPullRequestRefs(session, sessionWorkspace)].filter(([uri]) => !topPullRequestRefs.has(uri)).map(([, ref]) => ref),
					openerService,
				),
			},
		} : {}),
	};
}

/** The shared session hover populated with the peer chat's own title, workspace, changes, and pull requests. */
export function getChatSummaryHoverData(
	session: ISession,
	chat: IChat,
	sessionsProvidersService: ISessionsProvidersService,
	openerService: IOpenerService,
	labelService: ILabelService,
	createdBy?: ISessionSummaryHoverData['createdBy'],
	includeUpdatedAt = false,
): ISessionSummaryHoverData {
	const updatedAt = includeUpdatedAt ? chat.updatedAt.get() : undefined;
	return {
		...getProviderDetails(session, sessionsProvidersService),
		title: chat.title.get().trim() || localize('untitledChat', "Untitled Chat"),
		...(updatedAt ? { updatedAt } : {}),
		location: getLocation(
			chat.workspace.get(),
			false,
			() => getChatHoverChanges(chat, BRANCH_CHANGES_CHANGESET_ID),
			labelService,
		),
		pullRequests: getPullRequests(chat.workspace.get(), openerService),
		createdBy,
		application: getApplication(session, openerService),
	};
}

/** Owns live provenance for each display of the hover, including cached reopens. */
export function createSessionSummaryHover(session: ISession, data: ISessionSummaryHoverData, openerService: IOpenerService): Pick<IDelayedHoverOptions, 'content' | 'onDidShow' | 'onDidHide'> {
	const widget = new SessionSummaryHoverWidget(data);
	let application = session.application?.get();
	let hoverDisposables: DisposableStore | undefined;
	return {
		content: widget.domNode,
		onDidShow: () => {
			hoverDisposables?.dispose();
			hoverDisposables = new DisposableStore();
			hoverDisposables.add(autorun(reader => {
				const currentApplication = session.application?.read(reader);
				if (currentApplication !== application) {
					application = currentApplication;
					widget.updateApplication(getApplication(session, openerService));
				}
			}));
		},
		onDidHide: () => {
			hoverDisposables?.dispose();
			hoverDisposables = undefined;
		},
	};
}

function getLocation(
	workspace: ISessionWorkspace | undefined,
	worktreePending: boolean,
	changes: () => ISessionSummaryHoverLocation['changes'],
	labelService: ILabelService,
): ISessionSummaryHoverLocation | undefined {
	const folder = workspace?.folders[0];
	if (!workspace || !folder) {
		return undefined;
	}

	return getFolderLocation(workspace, folder, worktreePending, changes, labelService);
}

function getWorkspaceSummaries(
	workspace: ISessionWorkspace,
	worktreePending: boolean,
	labelService: ILabelService,
): readonly ISessionSummaryHoverWorkspace[] {
	const isVirtual = getSessionWorkspaceKind(workspace, worktreePending) === SessionWorkspaceKind.Virtual;
	const summaries = new Map<string, ISessionSummaryHoverWorkspace>();
	for (const folder of workspace.folders) {
		const key = folder.root.toString();
		if (!summaries.has(key)) {
			summaries.set(key, {
				name: isVirtual && workspace.folders.length === 1 ? workspace.label : folder.name,
				parentPath: isVirtual ? undefined : labelService.getUriLabel(dirname(folder.root)),
				icon: workspace.typeIcon ?? (isVirtual ? Codicon.cloud : Codicon.folder),
			});
		}
	}
	return [...summaries.values()];
}

function getFolderLocation(
	workspace: ISessionWorkspace,
	folder: ISessionFolder,
	worktreePending: boolean,
	changes: () => ISessionSummaryHoverLocation['changes'],
	labelService: ILabelService,
): ISessionSummaryHoverLocation {
	// A pending worktree still describes the checkout it was started from, so its
	// path, branch and changes are withheld until the worktree exists.
	const isVirtual = getSessionWorkspaceKind(workspace, worktreePending) === SessionWorkspaceKind.Virtual;
	const worktreeUri = worktreePending ? undefined : folder.gitRepository?.workTreeUri;

	// Paths go through the label service, so a path under the user's home reads
	// as `~/projects/vscode` and a remote or virtual one gets its own formatting.
	return {
		// A virtual workspace has no path a user could act on, so it is named by
		// its repository label instead.
		workspace: isVirtual ? (workspace.folders.length === 1 ? workspace.label : folder.name) : labelService.getUriLabel(folder.root),
		workspaceIcon: workspace.typeIcon ?? (isVirtual ? Codicon.cloud : Codicon.folder),
		worktree: worktreeUri ? labelService.getUriLabel(worktreeUri) : undefined,
		worktreePending,
		branch: worktreePending ? undefined : folder.gitRepository?.branchName?.trim() || undefined,
		changes: worktreePending ? undefined : changes(),
	};
}

/**
 * Pull requests produced by or explicitly associated with the session.
 * Excludes inherited checkout PRs and mere references when provider provenance is available.
 */
function getPullRequests(workspace: ISessionWorkspace | undefined, openerService: IOpenerService): readonly ISessionSummaryHoverPullRequest[] | undefined {
	return toHoverPullRequests(getPullRequestRefs([workspace]).values(), openerService);
}

function getSessionPullRequestRefs(session: ISession, sessionWorkspace: ISessionWorkspace): ReadonlyMap<string, SessionPullRequestRef> {
	return getPullRequestRefs([
		sessionWorkspace,
		...session.chats.get().map(chat => chat.workspace.get()),
	]);
}

type SessionPullRequestRef = ReturnType<typeof getSessionOwnedGitHubPullRequestRefs>[number];

/** Session-owned pull request refs of the workspaces' folders, de-duplicated and keyed by PR URI. */
function getPullRequestRefs(workspaces: readonly (ISessionWorkspace | undefined)[]): ReadonlyMap<string, SessionPullRequestRef> {
	const refsByUri = new Map<string, SessionPullRequestRef>();
	for (const workspace of workspaces) {
		for (const folder of workspace?.folders ?? []) {
			const gitHubInfo = folder.gitRepository?.gitHubInfo.get();
			if (!gitHubInfo) {
				continue;
			}
			for (const ref of getSessionOwnedGitHubPullRequestRefs(gitHubInfo)) {
				refsByUri.set(ref.uri.toString(), ref);
			}
		}
	}
	return refsByUri;
}

function toHoverPullRequests(refs: Iterable<SessionPullRequestRef>, openerService: IOpenerService): readonly ISessionSummaryHoverPullRequest[] | undefined {
	const pullRequests = [...refs].map(ref => ({
		title: ref.title ?? `#${ref.number}`,
		icon: ref.icon,
		uri: ref.uri,
		onOpen: () => openerService.open(ref.uri, { openExternal: true }).catch(onUnexpectedError),
	}));
	return pullRequests.length ? pullRequests : undefined;
}

function getApplication(session: ISession, openerService: IOpenerService): ISessionSummaryHoverData['application'] {
	const application = session.application?.get();
	if (!application || application.id === 'vscode' || application.id === UNKNOWN_SESSION_APPLICATION_ID) {
		return undefined;
	}

	return {
		label: application.label,
		onOpen: () => {
			openerService.open(URI.from({ scheme: Schemas.command, path: SHOW_SESSION_APPLICATION_FILTERS_COMMAND_ID }), { allowCommands: true }).catch(onUnexpectedError);
		},
	};
}

function getProviderDetails(
	session: ISession,
	sessionsProvidersService: ISessionsProvidersService,
): Pick<ISessionSummaryHoverData, 'providerLabel' | 'remoteName'> {
	const provider = sessionsProvidersService.getProvider(session.providerId);
	if (!provider) {
		return {};
	}
	const providerLabel = provider.sessionTypes.find(type => type.id === session.sessionType)?.label ?? provider.label;
	return {
		providerLabel,
		...(session.remoteConnectionStatus && providerLabel !== provider.label ? { remoteName: provider.label } : {}),
	};
}
