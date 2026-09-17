/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WeakCachedFunction } from '../../../../base/common/cache.js';
import { StringSHA1 } from '../../../../base/common/hash.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { derived, IReader } from '../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { isActiveSessionStatus, ISession, ISessionArtifact, ISessionFileChange, ISessionWorkspaceSetup, SessionArtifactKind, SessionStatus } from './session.js';
import { readSessionChangesStats } from './sessionChangesStatsCache.js';

export interface ISessionWorkTrackingState {
	/** Last opening explicitly recorded by the local view layer; absent means unknown. */
	readonly lastOpenedAt?: number;
	readonly reviewedResult?: string;
	readonly keepArchiveSuggestion?: boolean;
}

export interface ISessionWorkSummary {
	readonly attention: 'input' | 'error' | 'connection' | 'setup' | undefined;
	readonly running: boolean;
	/** Incomplete workspace setup, separate from runtime status and recorded results. */
	readonly setupDescription?: string;
	readonly hasResults: boolean;
	readonly hasUnreviewedResults: boolean;
	readonly hasReviewCheckpoint: boolean;
	/** Lazily fingerprints the captured metadata; avoid reading it for display-only updates. */
	readonly resultVersion: string;
	readonly archiveKind: 'suggested' | 'inspect' | 'excluded';
	readonly archiveReason: string;
	readonly lastOpenedAt?: number;
}

export interface ISessionWorkSummaryOptions {
	readonly now: number;
	readonly inactivityDays: number;
	readonly pinned: boolean;
	readonly active: boolean;
	/** Known queued requests across all chats; zero requires every queue to be known empty. Omit when unavailable. */
	readonly pendingRequestCount?: number;
}

export function isSessionWorkTimestamp(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function readTurnEnd(value: Date | undefined): number | undefined {
	const time = value?.getTime();
	return isSessionWorkTimestamp(time) ? time : undefined;
}

function fileChangeVersion(change: ISessionFileChange): string {
	return JSON.stringify([
		isIChatSessionFileChange2(change) ? getComparisonKey(change.uri) : null,
		change.originalUri ? getComparisonKey(change.originalUri) : null,
		change.modifiedUri ? getComparisonKey(change.modifiedUri) : null,
		change.insertions,
		change.deletions,
	]);
}

function artifactVersion(artifact: ISessionArtifact): string {
	return JSON.stringify([
		artifact.id, artifact.kind, artifact.isArtifact,
		artifact.link ? getComparisonKey(artifact.link) : null,
		artifact.uri ? getComparisonKey(artifact.uri) : null,
		artifact.commitHash,
	]);
}

function computeWorkMetadata(session: ISession, reader: IReader | undefined) {
	const status = session.status.read(reader);
	const sessionTurnEnd = session.lastTurnEnd.read(reader);
	const lastTurnEnd = readTurnEnd(sessionTurnEnd);
	const mainChat = session.mainChat.read(reader);
	const chats = session.chats.read(reader);
	const allChats = mainChat && !chats.some(chat => isEqual(chat.resource, mainChat.resource)) ? [...chats, mainChat] : chats;
	const chatMetadata = allChats.map(chat => {
		const turnEnd = chat.lastTurnEnd.read(reader);
		return {
			resource: getComparisonKey(chat.resource),
			status: chat.status.read(reader),
			lastTurnEnd: readTurnEnd(turnEnd),
			invalidTurnEnd: turnEnd !== undefined && !isSessionWorkTimestamp(turnEnd.getTime()),
			changes: chat.changes.read(reader),
			lastTurnChanges: chat.lastTurnChanges?.read(reader) ?? [],
		};
	});
	const changes = session.changes.read(reader);
	const stats = readSessionChangesStats(session, reader);
	const changesets = session.changesets.read(reader)?.map(changeset => ({
		id: changeset.id,
		loading: changeset.isLoadingChanges.read(reader),
		changes: changeset.changes.read(reader),
		original: changeset.originalCheckpointRef.read(reader),
		modified: changeset.modifiedCheckpointRef.read(reader),
	}));
	const artifacts = session.artifacts?.read(reader) ?? [];
	const workspace = session.workspace.read(reader);
	const folders = workspace?.folders ?? [];
	const changeCollections = [...new Set<readonly ISessionFileChange[]>([
		changes,
		...chatMetadata.flatMap(chat => [chat.changes, chat.lastTurnChanges]),
		...changesets?.map(changeset => changeset.changes) ?? [],
	])];
	const hasChanges = changeCollections.some(changes => changes.length > 0) || (stats?.files ?? 0) > 0 || (stats?.insertions ?? 0) > 0 || (stats?.deletions ?? 0) > 0;
	const hasResults = hasChanges || lastTurnEnd !== undefined || chatMetadata.some(chat => chat.lastTurnEnd !== undefined)
		|| artifacts.some(artifact => artifact.isArtifact);
	const statuses = [status, ...chatMetadata.map(chat => chat.status)];
	const resultVersion = new Lazy(() => {
		const fileVersions = new WeakCachedFunction(fileChangeVersion);
		const collectionVersions = new WeakCachedFunction((changes: readonly ISessionFileChange[]) => changes.map(change => fileVersions.get(change)).sort());
		const sha = new StringSHA1();
		sha.update(JSON.stringify({
			status,
			lastTurnEnd,
			chats: chatMetadata.map(chat => JSON.stringify([
				chat.resource, chat.status, chat.lastTurnEnd,
				collectionVersions.get(chat.changes), collectionVersions.get(chat.lastTurnChanges),
			])).sort(),
			changes: collectionVersions.get(changes),
			stats,
			changesets: changesets?.map(changeset => JSON.stringify([
				changeset.id, changeset.original, changeset.modified, collectionVersions.get(changeset.changes),
			])).sort(),
			artifacts: artifacts.map(artifactVersion).sort(),
		}));
		return `1:${sha.digest()}`;
	});
	return {
		statuses, stats, artifacts, hasChanges, hasResults,
		get resultVersion() { return resultVersion.value; },
		unknownChatState: allChats.length === 0 || sessionTurnEnd !== undefined && lastTurnEnd === undefined || chatMetadata.some(chat => chat.invalidTurnEnd),
		gitOperationInProgress: folders.some(folder => folder.gitRepository?.hasGitOperationInProgress),
		uncommittedOrUnpublishedChanges: folders.some(folder => (folder.gitRepository?.uncommittedChanges ?? 0) > 0 || (folder.gitRepository?.outgoingChanges ?? 0) > 0),
		loadingChanges: changesets?.some(changeset => changeset.loading) ?? false,
		unreviewedChanges: changeCollections.some(changes => changes.some(change => change.reviewed === false)),
		invalidChanges: changeCollections.some(changes => changes.some(change => !Number.isFinite(change.insertions) || change.insertions < 0 || !Number.isFinite(change.deletions) || change.deletions < 0)),
	};
}

const workMetadata = new WeakCachedFunction((session: ISession) => derived(session, reader => computeWorkMetadata(session, reader)));

function readWorkMetadata(session: ISession, reader: IReader | undefined) {
	// Imperative review/archive validation must not reuse an unobserved snapshot.
	return reader ? workMetadata.get(session).read(reader) : computeWorkMetadata(session, undefined);
}

/** Fingerprints known output metadata, never transcript text, activity messages, or read state. */
export function readSessionWorkResultVersion(session: ISession, reader?: IReader): string {
	return readWorkMetadata(session, reader).resultVersion;
}

function getWorkspaceSetupSummary(setup: ISessionWorkspaceSetup | undefined): { running: boolean; description: string } | undefined {
	if (!setup) {
		return undefined;
	}

	switch (setup.phase) {
		case 'requested':
			return { running: true, description: localize('sessionWork.setupRequested', "Workspace setup requested.") };
		case 'preparing':
			return { running: true, description: localize('sessionWork.setupPreparing', "Preparing the workspace.") };
		case 'failed':
			return { running: false, description: localize('sessionWork.setupFailed', "Workspace setup failed.") };
		case 'cancelled':
			return { running: false, description: localize('sessionWork.setupCancelled', "Workspace setup was cancelled.") };
		case 'attached':
			switch (setup.continuation) {
				case 'completed':
					return undefined;
				case 'pending':
					return { running: true, description: localize('sessionWork.setupContinuationPending', "Workspace ready; waiting to continue the task.") };
				case 'running':
					return { running: true, description: localize('sessionWork.setupContinuationRunning', "Workspace ready; continuing the task.") };
				case 'not-started':
					return { running: false, description: localize('sessionWork.setupContinuationNotStarted', "Workspace ready; the task has not continued.") };
				case 'failed':
					return { running: false, description: localize('sessionWork.setupContinuationFailed', "Workspace ready; the task could not continue.") };
				case 'cancelled':
					return { running: false, description: localize('sessionWork.setupContinuationCancelled', "Workspace ready; task continuation was cancelled.") };
				default:
					return { running: false, description: localize('sessionWork.setupContinuationUnknown', "Workspace ready; task continuation status is unknown.") };
			}
		default:
			return { running: false, description: localize('sessionWork.setupUnknown', "Workspace setup status is unknown.") };
	}
}

/** Summarizes provider-neutral metadata without reading lazy GitHub presentation state. */
export function readSessionWorkSummary(session: ISession, state: ISessionWorkTrackingState, options: ISessionWorkSummaryOptions, reader?: IReader): ISessionWorkSummary {
	const metadata = readWorkMetadata(session, reader);
	const archived = session.isArchived.read(reader);
	const loading = session.loading.read(reader);
	const preparing = session.isNewSessionRequestInProgress?.read(reader) || session.worktreePending?.read(reader);
	const setup = getWorkspaceSetupSummary(session.workspaceSetup?.read(reader));
	const connection = session.remoteConnectionStatus?.read(reader);
	const disconnected = session.remoteConnectionStatus !== undefined && connection?.kind !== 'connected';
	const running = !!preparing || !!setup?.running || metadata.statuses.includes(SessionStatus.InProgress);
	const needsInput = metadata.statuses.includes(SessionStatus.NeedsInput);
	const error = metadata.statuses.includes(SessionStatus.Error);
	const pendingRequestCount = options.pendingRequestCount;
	const knownPendingRequests = pendingRequestCount !== undefined && Number.isSafeInteger(pendingRequestCount) && pendingRequestCount >= 0;
	const lastOpenedAt = isSessionWorkTimestamp(state.lastOpenedAt) ? state.lastOpenedAt : undefined;
	const hasUnreviewedResults = metadata.hasResults && (state.reviewedResult === undefined || state.reviewedResult !== metadata.resultVersion);
	const result = (archiveKind: ISessionWorkSummary['archiveKind'], archiveReason: string): ISessionWorkSummary => ({
		attention: disconnected ? 'connection' : needsInput ? 'input' : error ? 'error' : setup && !setup.running ? 'setup' : undefined,
		running,
		...(setup ? { setupDescription: setup.description } : {}),
		hasResults: metadata.hasResults,
		hasUnreviewedResults,
		hasReviewCheckpoint: state.reviewedResult !== undefined,
		get resultVersion() { return metadata.resultVersion; },
		archiveKind,
		archiveReason,
		lastOpenedAt,
	});

	if (archived) {
		return result('excluded', localize('sessionWork.archived', "Already archived."));
	}
	if (options.active) {
		return result('excluded', localize('sessionWork.active', "Currently open as the active session."));
	}
	if (options.pinned || state.keepArchiveSuggestion) {
		return result('excluded', options.pinned ? localize('sessionWork.pinned', "Pinned sessions are kept.")
			: localize('sessionWork.kept', "You chose to keep this session."));
	}
	if (loading || metadata.loadingChanges || preparing) {
		return result('excluded', localize('sessionWork.loading', "Session metadata or changes are still being prepared."));
	}
	if (setup?.running) {
		return result('excluded', setup.description);
	}
	if (metadata.gitOperationInProgress) {
		return result('excluded', localize('sessionWork.gitOperation', "A Git operation is still in progress."));
	}
	if (metadata.statuses.includes(SessionStatus.Untitled)) {
		return result('excluded', localize('sessionWork.draft', "The session has an unsent chat."));
	}
	if (metadata.statuses.some(isActiveSessionStatus)) {
		return result('excluded', localize('sessionWork.working', "A chat is still working or waiting for input."));
	}
	if (knownPendingRequests && pendingRequestCount > 0) {
		return result('excluded', localize('sessionWork.queued', "Queued requests are waiting to run."));
	}
	if (disconnected) {
		return result('inspect', localize('sessionWork.connection', "The connection is unavailable; execution state may be stale."));
	}
	if (error || metadata.unknownChatState || metadata.statuses.some(status => status !== SessionStatus.Completed)) {
		return result('inspect', localize('sessionWork.notCompleted', "Successful completion is not known for every chat."));
	}
	if (setup) {
		return result('inspect', setup.description);
	}
	if (!isSessionWorkTimestamp(options.now) || !Number.isFinite(options.inactivityDays) || options.inactivityDays <= 0
		|| !Number.isFinite(options.inactivityDays * 24 * 60 * 60 * 1000)) {
		return result('inspect', localize('sessionWork.invalidAge', "Choose a valid inactivity period before archiving."));
	}
	if (lastOpenedAt === undefined || lastOpenedAt > options.now) {
		return result('inspect', localize('sessionWork.unknownAge', "The time this session was last opened here is unknown."));
	}
	if (options.now - lastOpenedAt < options.inactivityDays * 24 * 60 * 60 * 1000) {
		return result('excluded', localize('sessionWork.recent', "Opened here less than {0} days ago.", options.inactivityDays));
	}
	if (hasUnreviewedResults || metadata.unreviewedChanges) {
		return result('inspect', localize('sessionWork.unreviewed', "Recorded results or file changes still need review."));
	}
	if (metadata.uncommittedOrUnpublishedChanges) {
		return result('inspect', localize('sessionWork.unpublishedChanges', "The workspace still reports uncommitted or unpublished changes."));
	}
	if (!metadata.stats || metadata.invalidChanges || !Number.isSafeInteger(metadata.stats.files) || metadata.stats.files < 0
		|| !Number.isFinite(metadata.stats.insertions) || metadata.stats.insertions < 0 || !Number.isFinite(metadata.stats.deletions) || metadata.stats.deletions < 0) {
		return result('inspect', localize('sessionWork.unknownChanges', "File-change metadata is not yet known."));
	}
	if (!knownPendingRequests) {
		return result('inspect', localize('sessionWork.unknownQueue', "Pending request information is unavailable. Inspect the session before archiving."));
	}
	if (metadata.hasChanges) {
		return result('inspect', localize('sessionWork.unconfirmedPublication', "File changes are recorded, but published or merged state cannot be confirmed from metadata."));
	}
	if (metadata.artifacts.some(artifact => artifact.isArtifact && artifact.kind === SessionArtifactKind.PullRequest)) {
		return result('inspect', localize('sessionWork.unconfirmedPullRequest', "Pull request completion cannot be confirmed from metadata."));
	}
	return result('suggested', localize('sessionWork.inactive', "Last opened here at least {0} days ago; known results are reviewed and no unfinished work is reported.", options.inactivityDays));
}
