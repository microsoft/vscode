/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getGitHubPullRequestRefs, getUntitledSessionTitle, ISession, isActiveSessionStatus, SessionStatus } from '../../../services/sessions/common/session.js';
import { fuzzyContains } from '../../../../base/common/strings.js';
import { IAgentsDashboardCalculatedUsage } from './agentsDashboardHistory.js';
import { IWorktreeDashboardEntry, WorktreeEntryStatus } from './worktreeDashboard.js';

/** A working directory shown for a dashboard session. */
export interface IAgentsDashboardWorkingDirectory {
	readonly path: string;
	readonly isWorktree: boolean;
}

/** A single row in the Manage Sessions table. */
export interface IAgentsDashboardSessionRow {
	readonly session: ISession;
	readonly title: string;
	readonly status: SessionStatus;
	readonly archived: boolean;
	readonly workingDirectories: readonly IAgentsDashboardWorkingDirectory[];
	readonly chatCount: number;
	readonly worktreeSizeBytes: number | undefined;
	readonly credits: number | undefined;
	readonly creditsPartial: boolean;
}

/** Aggregate operational metrics shown above the dashboard table. */
export interface IAgentsDashboardSummary {
	readonly sessions: number;
	readonly activeSessions: number;
	readonly archivedSessions: number;
	readonly doneSessions: number;
	readonly pullRequests: number;
	readonly worktreeSizeBytes: number;
}

/** Builds the Sessions table rows from every known session, most recently updated first. */
export function buildSessionRows(
	sessions: readonly ISession[],
	worktreeEntries: readonly IWorktreeDashboardEntry[] = [],
	calculatedUsage: ReadonlyMap<string, IAgentsDashboardCalculatedUsage> = new Map(),
): IAgentsDashboardSessionRow[] {
	const worktreeBySession = new Map(
		worktreeEntries
			.filter(entry => entry.session)
			.map(entry => [entry.session!.resource.toString(), entry] as const)
	);
	return sessions
		.map(session => {
			const worktree = worktreeBySession.get(session.resource.toString());
			const providerCredits = session.usage?.get()?.credits;
			const calculatedCredits = calculatedUsage.get(session.sessionId);
			return {
				session,
				title: session.title.get() || getUntitledSessionTitle(session.isQuickChat?.get() ?? false),
				status: session.status.get(),
				archived: session.isArchived.get(),
				workingDirectories: session.workspace.get()?.folders.map(folder => ({
					path: folder.workingDirectory.fsPath,
					isWorktree: folder.gitRepository?.workTreeUri !== undefined,
				})) ?? [],
				chatCount: session.chats.get().length,
				worktreeSizeBytes: worktree?.sizeBytes,
				credits: providerCredits ?? calculatedCredits?.credits,
				creditsPartial: providerCredits === undefined && calculatedCredits?.partial === true,
			};
		})
		.sort((a, b) => b.session.updatedAt.get().getTime() - a.session.updatedAt.get().getTime());
}

/** Filters session rows using the text users see in the Sessions table and chat list. */
export function filterSessionRows(rows: readonly IAgentsDashboardSessionRow[], query: string): IAgentsDashboardSessionRow[] {
	const terms = query.trim().split(/\s+/).filter(Boolean);
	if (terms.length === 0) {
		return [...rows];
	}
	return rows.filter(row => {
		const status = sessionStatusSearchLabel(row.status);
		const searchableText = [
			row.title,
			...row.workingDirectories.map(directory => directory.path),
			...row.session.chats.get().map(chat => chat.title.get()),
			status,
			row.archived ? 'archived' : '',
		].join(' ');
		return terms.every(term => fuzzyContains(searchableText, term));
	});
}

function sessionStatusSearchLabel(status: SessionStatus): string {
	switch (status) {
		case SessionStatus.Untitled: return 'new untitled';
		case SessionStatus.InProgress: return 'working in progress';
		case SessionStatus.NeedsInput: return 'input needed';
		case SessionStatus.Completed: return 'done completed';
		case SessionStatus.Error: return 'failed error';
	}
}

/** Builds the aggregate operational report from the visible session rows. */
export function buildAgentsDashboardSummary(rows: readonly IAgentsDashboardSessionRow[]): IAgentsDashboardSummary {
	return {
		sessions: rows.length,
		activeSessions: rows.filter(row => isActiveSessionStatus(row.status)).length,
		archivedSessions: rows.filter(row => row.archived).length,
		doneSessions: rows.filter(row => row.status === SessionStatus.Completed).length,
		pullRequests: countPullRequests(rows),
		worktreeSizeBytes: rows.reduce((total, row) => total + (row.worktreeSizeBytes ?? 0), 0),
	};
}

function countPullRequests(rows: readonly IAgentsDashboardSessionRow[]): number {
	const pullRequests = new Set<string>();
	for (const row of rows) {
		for (const folder of row.session.workspace.get()?.folders ?? []) {
			for (const pullRequest of getGitHubPullRequestRefs(folder.gitRepository?.gitHubInfo.get())) {
				pullRequests.add(pullRequest.uri.toString());
			}
		}
	}
	return pullRequests.size;
}

/** Returns worktrees still on disk for archived sessions. */
export function getArchivedSessionWorktrees(entries: readonly IWorktreeDashboardEntry[]): IWorktreeDashboardEntry[] {
	return entries.filter(entry => entry.status === WorktreeEntryStatus.SessionArchived);
}

/** Returns idle sessions whose associated pull request is explicitly known to be merged. */
export function getMergedPullRequestSessions(sessions: readonly ISession[]): ISession[] {
	return sessions.filter(session => {
		if (session.isArchived.get() || isActiveSessionStatus(session.status.get())) {
			return false;
		}

		return hasMergedPullRequest(session);
	});
}

function hasMergedPullRequest(session: ISession): boolean {
	return session.workspace.get()?.folders.some(folder => {
		const gitHubInfo = folder.gitRepository?.gitHubInfo.get();
		if (!gitHubInfo) {
			return false;
		}
		if (gitHubInfo.pullRequest?.liveState === 'merged' || gitHubInfo.pullRequest?.state === 'merged') {
			return true;
		}
		return gitHubInfo.pullRequests?.some(pullRequest =>
			pullRequest.createdByThisSession === true
			&& (pullRequest.liveState === 'merged' || pullRequest.state === 'merged')
		) ?? false;
	}) ?? false;
}
