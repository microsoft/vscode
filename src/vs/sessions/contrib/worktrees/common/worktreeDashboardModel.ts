/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../base/common/path.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorktreeDashboardEntry, WorktreeEntryStatus } from './worktreeDashboard.js';
import { ISession, isActiveSessionStatus } from '../../../services/sessions/common/session.js';

export interface IDiscoveredWorktreeDirectory {
	readonly repositoryRoot: URI;
	readonly path: URI;
	readonly name: string;
	readonly branchName?: string;
}

interface ISessionWorktreeRef {
	readonly repositoryRoot: URI;
	readonly worktreePath: URI;
	readonly name: string;
	readonly branchName: string | undefined;
	readonly session: ISession;
	readonly status: WorktreeEntryStatus;
	readonly hasUncommittedChanges: boolean | undefined;
}

export interface ICorrelateWorktreesOptions {
	readonly existingWorktreePaths?: ReadonlySet<string>;
	/** On-disk size in bytes per worktree path (as `URI.toString()`), when known. */
	readonly sizesByPath?: ReadonlyMap<string, number>;
}

export function correlateWorktrees(
	sessions: readonly ISession[],
	perRepoDirectories: ReadonlyMap<string, readonly IDiscoveredWorktreeDirectory[]>,
	options?: ICorrelateWorktreesOptions,
): IWorktreeDashboardEntry[] {
	const sessionRefs = collectSessionWorktreeRefs(sessions);
	const matchedSessionPaths = new Set<string>();
	const entries: IWorktreeDashboardEntry[] = [];

	for (const directories of perRepoDirectories.values()) {
		for (const directory of directories) {
			const sessionRef = findSessionWorktreeRef(sessionRefs.values(), directory.path);
			if (sessionRef) {
				matchedSessionPaths.add(sessionRef.worktreePath.toString());
				entries.push(toSessionEntry(sessionRef, options));
			} else {
				entries.push({
					repositoryRoot: directory.repositoryRoot,
					worktreePath: directory.path,
					name: directory.name,
					branchName: directory.branchName,
					status: WorktreeEntryStatus.Orphaned,
					session: undefined,
					hasUncommittedChanges: undefined,
					sizeBytes: options?.sizesByPath?.get(directory.path.toString()),
				});
			}
		}
	}

	for (const sessionRef of sessionRefs.values()) {
		if (matchedSessionPaths.has(sessionRef.worktreePath.toString())) {
			continue;
		}

		const exists = worktreeExists(sessionRef, options);
		entries.push({
			...toSessionEntry(sessionRef, options),
			status: exists ? sessionRef.status : WorktreeEntryStatus.Missing,
			sizeBytes: exists ? options?.sizesByPath?.get(sessionRef.worktreePath.toString()) : undefined,
		});
	}

	return entries.sort(compareEntries);
}

function collectSessionWorktreeRefs(sessions: readonly ISession[]): Map<string, ISessionWorktreeRef> {
	const refs = new Map<string, ISessionWorktreeRef>();

	for (const session of sessions) {
		const workspace = session.workspace.get();
		if (!workspace) {
			continue;
		}

		for (const folder of workspace.folders) {
			const gitRepository = folder.gitRepository;
			const worktreePath = gitRepository?.workTreeUri;
			if (!gitRepository || !worktreePath || isEqual(gitRepository.uri, worktreePath)) {
				continue;
			}

			const ref: ISessionWorktreeRef = {
				repositoryRoot: gitRepository.uri,
				worktreePath,
				name: basename(worktreePath.fsPath),
				branchName: gitRepository.branchName,
				session,
				status: getSessionWorktreeStatus(session),
				hasUncommittedChanges: gitRepository.uncommittedChanges === undefined ? undefined : gitRepository.uncommittedChanges > 0,
			};

			const key = worktreePath.toString();
			const existing = refs.get(key);
			if (!existing || shouldReplaceSessionRef(existing, ref)) {
				refs.set(key, ref);
			}
		}
	}

	return refs;
}

function shouldReplaceSessionRef(current: ISessionWorktreeRef, candidate: ISessionWorktreeRef): boolean {
	const currentPriority = getSessionPriority(current.status);
	const candidatePriority = getSessionPriority(candidate.status);
	if (candidatePriority !== currentPriority) {
		return candidatePriority > currentPriority;
	}

	return candidate.session.updatedAt.get().getTime() > current.session.updatedAt.get().getTime();
}

function getSessionPriority(status: WorktreeEntryStatus): number {
	switch (status) {
		case WorktreeEntryStatus.SessionActive:
			return 3;
		case WorktreeEntryStatus.SessionIdle:
			return 2;
		case WorktreeEntryStatus.SessionArchived:
			return 1;
		default:
			return 0;
	}
}

function getSessionWorktreeStatus(session: ISession): WorktreeEntryStatus {
	if (session.isArchived.get()) {
		return WorktreeEntryStatus.SessionArchived;
	}

	return isActiveSessionStatus(session.status.get())
		? WorktreeEntryStatus.SessionActive
		: WorktreeEntryStatus.SessionIdle;
}

function worktreeExists(sessionRef: ISessionWorktreeRef, options: ICorrelateWorktreesOptions | undefined): boolean {
	if (options?.existingWorktreePaths) {
		return options.existingWorktreePaths.has(sessionRef.worktreePath.toString());
	}

	return false;
}

function toSessionEntry(sessionRef: ISessionWorktreeRef, options: ICorrelateWorktreesOptions | undefined): IWorktreeDashboardEntry {
	return {
		repositoryRoot: sessionRef.repositoryRoot,
		worktreePath: sessionRef.worktreePath,
		name: sessionRef.name,
		branchName: sessionRef.branchName,
		status: sessionRef.status,
		session: sessionRef.session,
		hasUncommittedChanges: sessionRef.hasUncommittedChanges,
		sizeBytes: options?.sizesByPath?.get(sessionRef.worktreePath.toString()),
	};
}

function findSessionWorktreeRef(sessionRefs: Iterable<ISessionWorktreeRef>, directoryPath: URI): ISessionWorktreeRef | undefined {
	for (const sessionRef of sessionRefs) {
		if (isEqual(sessionRef.worktreePath, directoryPath)) {
			return sessionRef;
		}
	}

	return undefined;
}

function compareEntries(a: IWorktreeDashboardEntry, b: IWorktreeDashboardEntry): number {
	const repositoryOrder = a.repositoryRoot.toString().localeCompare(b.repositoryRoot.toString());
	if (repositoryOrder !== 0) {
		return repositoryOrder;
	}

	return a.worktreePath.toString().localeCompare(b.worktreePath.toString());
}
