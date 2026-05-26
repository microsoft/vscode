/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../../base/common/hash.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../common/session.js';
import { ISendRequestOptions } from '../common/sessionsProvider.js';
import { isChatRequestFileEntry, isImageVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { getExcludes, ISearchConfiguration, ISearchService, QueryType } from '../../../../workbench/services/search/common/search.js';

const TOTAL_REQUESTS_KEY = 'agentSessions.telemetry.totalRequests';
const WORKSPACE_REQUESTS_KEY = 'agentSessions.telemetry.workspaceRequests';
const PROVIDER_REQUESTS_KEY = 'agentSessions.telemetry.providerRequests';

type SessionIsolationKind = 'worktree' | 'folder';

// --- Field group: session (derived from ISession) ---

type SessionFields = {
	sessionId: string;
	providerId: string;
	providerType: string;
	chatCount: number;
};

type SessionFieldsClassification = {
	sessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
};

// --- Field group: chat (derived from IChat) ---

type ChatFields = {
	chatModeKind: string;
};

type ChatFieldsClassification = {
	chatModeKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Built-in chat mode kind (e.g., ask, agent, edit); empty when no mode is selected.' };
};

// --- Field group: workspace (derived from ISessionWorkspace) ---

type WorkspaceFields = {
	isolationKind: SessionIsolationKind;
	workspaceHash: string;
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;
	workspaceFileCount: number;
};

type WorkspaceFieldsClassification = {
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
};

// --- Field group: request (derived from ISendRequestOptions) ---

type RequestFields = {
	queryLength: number;
	totalAttachementCount: number;
	fileAttachmentCount: number;
	imageAttachmentCount: number;
	attachmentKinds: string;
};

type RequestFieldsClassification = {
	queryLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of characters in the user query. Length only, no content.' };
	totalAttachementCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of attached context entries included with the request.' };
	fileAttachmentCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of file attachments included with the request.' };
	imageAttachmentCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of image attachments included with the request.' };
	attachmentKinds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Stringified JSON object mapping each attachment kind (e.g. file, image, symbol) to its count for this request.' };
};

// --- Field group: all sessions in the window (derived from anchor + ISession[]) ---

type AllSessionsFields = {
	currentWorkspaceFolderInProgress: number;
	currentWorkspaceFolderUnread: number;
	currentWorkspaceFolderWaitingForInput: number;
	currentWorkspaceFolderNotDone: number;

	currentWorkspaceInProgress: number;
	currentWorkspaceUnread: number;
	currentWorkspaceWaitingForInput: number;
	currentWorkspaceNotDone: number;

	allWorkspacesInProgress: number;
	allWorkspacesUnread: number;
	allWorkspacesWaitingForInput: number;
	allWorkspacesNotDone: number;
};

type AllSessionsFieldsClassification = {
	currentWorkspaceFolderInProgress: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'In-progress sessions in the current workspace using folder isolation.' };
	currentWorkspaceFolderUnread: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Unread sessions in the current workspace using folder isolation.' };
	currentWorkspaceFolderWaitingForInput: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Sessions waiting for user input in the current workspace using folder isolation.' };
	currentWorkspaceFolderNotDone: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Sessions not marked as done in the current workspace using folder isolation.' };

	currentWorkspaceInProgress: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'In-progress sessions in the current workspace across all isolation modes.' };
	currentWorkspaceUnread: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Unread sessions in the current workspace across all isolation modes.' };
	currentWorkspaceWaitingForInput: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Sessions waiting for user input in the current workspace across all isolation modes.' };
	currentWorkspaceNotDone: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Sessions not marked as done in the current workspace across all isolation modes.' };

	allWorkspacesInProgress: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'In-progress sessions across all workspaces.' };
	allWorkspacesUnread: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Unread sessions across all workspaces.' };
	allWorkspacesWaitingForInput: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Sessions waiting for user input across all workspaces.' };
	allWorkspacesNotDone: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Sessions not marked as done across all workspaces.' };
};

// --- Field group: cumulative user-request counters (read + increment storage) ---

type UserRequestCountersFields = {
	userRequestsTotal: number;
	userRequestsInWorkspace: number;
	userRequestsForProvider: number;
};

type UserRequestCountersFieldsClassification = {
	userRequestsTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cumulative number of requests the user has sent from the Agents window across all workspaces and providers (including this one).' };
	userRequestsInWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cumulative number of requests the user has sent in the current workspace (including this one).' };
	userRequestsForProvider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cumulative number of requests the user has sent for this sessions provider across all workspaces (including this one).' };
};

// --- Composed event: vscodeAgents.sessions/requestSent ---

type SessionRequestSentEvent =
	& SessionFields
	& ChatFields
	& WorkspaceFields
	& RequestFields
	& AllSessionsFields
	& UserRequestCountersFields
	& {
		isNewSession: boolean;
		visibleSessionsCount: number;
	};

type SessionRequestSentClassification =
	& SessionFieldsClassification
	& ChatFieldsClassification
	& WorkspaceFieldsClassification
	& RequestFieldsClassification
	& AllSessionsFieldsClassification
	& UserRequestCountersFieldsClassification
	& {
		owner: 'benibenj';
		comment: 'Reports when the user sends a request from a session in the Agents window, including the user state at the time of send.';
		isNewSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'True when the request starts a brand-new session, false when it is a new or continued chat in an existing session.' };
		visibleSessionsCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many sessions are currently visible in the sessions grid.' };
	};

// --- Composed events: session-level lifecycle actions (archive / unarchive /
// delete / chat delete / chat rename). Each event shares the same payload --
// session fields + workspace fields -- only the event name distinguishes them. ---

type SessionActionEvent = SessionFields & WorkspaceFields;

type SessionActionClassification =
	& SessionFieldsClassification
	& WorkspaceFieldsClassification
	& {
		owner: 'benibenj';
		comment: 'Reports when the user performs a lifecycle action on a session or chat (archive, unarchive, delete, rename) in the Agents window.';
	};

/**
 * Owns telemetry emission for the {@link SessionsManagementService}. Each
 * `getXxxFields` method returns a typed group of properties that can be
 * spread into any telemetry event — other events that have, e.g., a session
 * or a workspace can compose the same field shapes by intersecting the
 * corresponding `*FieldsClassification` types and calling the getter.
 */
export class SessionsTelemetryReporter extends Disposable {

	/** Final workspace file counts, keyed by session id (so subsequent log calls for the same session are instant). */
	private readonly _workspaceFileCountCache = new Map<string, number>();
	/** Pending workspace file-count fetches, keyed by workspace URI so a prewarm started before a session-id assignment can be picked up after. */
	private readonly _workspaceFileCountInFlight = new Map<string, Promise<number>>();

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IStorageService private readonly _storageService: IStorageService,
		@ISearchService private readonly _searchService: ISearchService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	// -- public emitters (fire-and-forget; callers do not await) ---------------

	logRequestSent(session: ISession, chat: IChat, isNewSession: boolean, options: ISendRequestOptions, allSessions: readonly ISession[], visibleSessionsCount: number): void {
		// Snapshot all synchronous fields now so the event reflects the state at
		// the time of the send, not when the async file-count fetch resolves.
		const workspace = session.workspace.get();
		const sync = {
			isNewSession,
			visibleSessionsCount,
			...this._getRequestFields(options),
			...this._getSessionFields(session),
			...this._getChatFields(chat),
			...this._getAllSessionsFields(session, allSessions),
			...this._incrementAndGetUserRequestCounters(session.providerId, workspace?.uri.toString()),
		};
		void this._getOrFetchWorkspaceFileCount(session.sessionId, workspace).then(workspaceFileCount => {
			this._telemetryService.publicLog2<SessionRequestSentEvent, SessionRequestSentClassification>('vscodeAgents.sessions/requestSent', {
				...sync,
				...this._getWorkspaceFields(workspace, workspaceFileCount),
			});
		});
	}

	logSessionArchived(session: ISession): void {
		this._logSessionAction('vscodeAgents.sessions/sessionArchived', session);
	}

	logSessionUnarchived(session: ISession): void {
		this._logSessionAction('vscodeAgents.sessions/sessionUnarchived', session);
	}

	logSessionDeleted(session: ISession): void {
		this._logSessionAction('vscodeAgents.sessions/sessionDeleted', session);
	}

	logChatDeleted(session: ISession): void {
		this._logSessionAction('vscodeAgents.sessions/chatDeleted', session);
	}

	logChatRenamed(session: ISession): void {
		this._logSessionAction('vscodeAgents.sessions/chatRenamed', session);
	}

	private _logSessionAction(eventName: string, session: ISession): void {
		const workspace = session.workspace.get();
		const sessionFields = this._getSessionFields(session);
		void this._getOrFetchWorkspaceFileCount(session.sessionId, workspace).then(workspaceFileCount => {
			this._telemetryService.publicLog2<SessionActionEvent, SessionActionClassification>(eventName, {
				...sessionFields,
				...this._getWorkspaceFields(workspace, workspaceFileCount),
			});
		});
	}

	// -- field-group getters (reusable by other telemetry events) --------------

	private _getSessionFields(session: ISession): SessionFields {
		return {
			sessionId: session.sessionId,
			providerId: session.providerId,
			providerType: session.sessionType,
			chatCount: session.chats.get().length,
		};
	}

	private _getChatFields(chat: IChat): ChatFields {
		return {
			chatModeKind: chat.mode.get()?.kind ?? '',
		};
	}

	private _getWorkspaceFields(workspace: ISessionWorkspace | undefined, workspaceFileCount: number): WorkspaceFields {
		if (!workspace) {
			return {
				isolationKind: 'folder',
				workspaceHash: '',
				hasGitRepository: false,
				isVirtualWorkspace: false,
				workspaceFileCount,
			};
		}
		const hasWorktree = workspace.folders.some(folder => folder.gitRepository?.workTreeUri !== undefined);
		return {
			isolationKind: hasWorktree ? 'worktree' : 'folder',
			workspaceHash: hash(workspace.uri.toString()).toString(16),
			hasGitRepository: workspace.folders.some(folder => folder.gitRepository !== undefined),
			isVirtualWorkspace: workspace.uri.scheme !== Schemas.file,
			workspaceFileCount,
		};
	}

	private _getOrFetchWorkspaceFileCount(sessionId: string, workspace: ISessionWorkspace | undefined): Promise<number> {
		const cached = this._workspaceFileCountCache.get(sessionId);
		if (cached !== undefined) {
			return Promise.resolve(cached);
		}
		const pending = this._startWorkspaceFileCountFetch(workspace);
		if (!pending) {
			return Promise.resolve(-1);
		}
		return pending.then(count => {
			this._workspaceFileCountCache.set(sessionId, count);
			return count;
		});
	}

	/**
	 * Kick off the workspace file-count fetch (non-blocking) so its result is
	 * already available — or close to it — by the time a subsequent
	 * {@link logRequestSent} call awaits it. Safe to call multiple times for
	 * the same workspace.
	 */
	prewarmWorkspaceFileCount(workspace: ISessionWorkspace | undefined): void {
		this._startWorkspaceFileCountFetch(workspace);
	}

	private _startWorkspaceFileCountFetch(workspace: ISessionWorkspace | undefined): Promise<number> | undefined {
		if (!workspace || workspace.folders.length === 0) {
			return undefined;
		}
		const workspaceKey = workspace.uri.toString();
		let pending = this._workspaceFileCountInFlight.get(workspaceKey);
		if (!pending) {
			pending = this._computeWorkspaceFileCount(workspace).then(count => {
				this._workspaceFileCountInFlight.delete(workspaceKey);
				return count;
			}, () => {
				this._workspaceFileCountInFlight.delete(workspaceKey);
				return -1;
			});
			this._workspaceFileCountInFlight.set(workspaceKey, pending);
		}
		return pending;
	}

	private async _computeWorkspaceFileCount(workspace: ISessionWorkspace): Promise<number> {
		const excludePattern = getExcludes(this._configurationService.getValue<ISearchConfiguration>({ resource: workspace.uri }));
		const result = await this._searchService.fileSearch({
			folderQueries: workspace.folders.map(folder => ({ folder: folder.root, disregardIgnoreFiles: false })),
			type: QueryType.File,
			filePattern: '',
			excludePattern,
		});
		return result.results.length;
	}

	private _getRequestFields(options: ISendRequestOptions): RequestFields {
		const attachments = options.attachedContext ?? [];
		return {
			queryLength: options.query?.length ?? 0,
			totalAttachementCount: attachments.length,
			fileAttachmentCount: attachments.filter(isChatRequestFileEntry).length,
			imageAttachmentCount: attachments.filter(isImageVariableEntry).length,
			attachmentKinds: JSON.stringify(countAttachmentsByKind(attachments)),
		};
	}

	private _getAllSessionsFields(anchorSession: ISession, allSessions: readonly ISession[]): AllSessionsFields {
		const anchorWorkspaceUri = anchorSession.workspace.get()?.uri;
		const isSameWorkspace = (other: ISession): boolean => {
			if (!anchorWorkspaceUri) {
				return false;
			}
			const otherWorkspaceUri = other.workspace.get()?.uri;
			return otherWorkspaceUri !== undefined && this._uriIdentityService.extUri.isEqual(anchorWorkspaceUri, otherWorkspaceUri);
		};

		const inCurrentWorkspaceFolderOnly: ISession[] = [];
		const inCurrentWorkspace: ISession[] = [];
		const inAll: ISession[] = [];

		for (const session of allSessions) {
			if (session.isArchived.get()) {
				continue;
			}
			inAll.push(session);
			if (isSameWorkspace(session)) {
				inCurrentWorkspace.push(session);
				const hasWorktree = session.workspace.get()?.folders.some(folder => folder.gitRepository?.workTreeUri !== undefined) ?? false;
				if (!hasWorktree) {
					inCurrentWorkspaceFolderOnly.push(session);
				}
			}
		}

		const folderOnly = countByStatus(inCurrentWorkspaceFolderOnly);
		const currentWorkspace = countByStatus(inCurrentWorkspace);
		const all = countByStatus(inAll);
		return {
			currentWorkspaceFolderInProgress: folderOnly.inProgress,
			currentWorkspaceFolderUnread: folderOnly.unread,
			currentWorkspaceFolderWaitingForInput: folderOnly.waitingForInput,
			currentWorkspaceFolderNotDone: folderOnly.notDone,

			currentWorkspaceInProgress: currentWorkspace.inProgress,
			currentWorkspaceUnread: currentWorkspace.unread,
			currentWorkspaceWaitingForInput: currentWorkspace.waitingForInput,
			currentWorkspaceNotDone: currentWorkspace.notDone,

			allWorkspacesInProgress: all.inProgress,
			allWorkspacesUnread: all.unread,
			allWorkspacesWaitingForInput: all.waitingForInput,
			allWorkspacesNotDone: all.notDone,
		};
	}

	private _incrementAndGetUserRequestCounters(providerId: string, workspaceUri: string | undefined): UserRequestCountersFields {
		const userRequestsTotal = this._storageService.getNumber(TOTAL_REQUESTS_KEY, StorageScope.APPLICATION, 0) + 1;
		this._storageService.store(TOTAL_REQUESTS_KEY, userRequestsTotal, StorageScope.APPLICATION, StorageTarget.MACHINE);

		const providerCounts = this._readCounterMap(PROVIDER_REQUESTS_KEY);
		const userRequestsForProvider = (providerCounts[providerId] ?? 0) + 1;
		providerCounts[providerId] = userRequestsForProvider;
		this._storageService.store(PROVIDER_REQUESTS_KEY, JSON.stringify(providerCounts), StorageScope.APPLICATION, StorageTarget.MACHINE);

		let userRequestsInWorkspace = 0;
		if (workspaceUri) {
			const workspaceCounts = this._readCounterMap(WORKSPACE_REQUESTS_KEY);
			userRequestsInWorkspace = (workspaceCounts[workspaceUri] ?? 0) + 1;
			workspaceCounts[workspaceUri] = userRequestsInWorkspace;
			this._storageService.store(WORKSPACE_REQUESTS_KEY, JSON.stringify(workspaceCounts), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		return { userRequestsTotal, userRequestsInWorkspace, userRequestsForProvider };
	}

	private _readCounterMap(key: string): Record<string, number> {
		const raw = this._storageService.get(key, StorageScope.APPLICATION);
		if (!raw) {
			return {};
		}
		try {
			const parsed = JSON.parse(raw);
			return (parsed && typeof parsed === 'object') ? parsed as Record<string, number> : {};
		} catch {
			return {};
		}
	}
}

interface ISessionStatusCounts {
	readonly inProgress: number;
	readonly unread: number;
	readonly waitingForInput: number;
	readonly notDone: number;
}

function countByStatus(sessions: readonly ISession[]): ISessionStatusCounts {
	let inProgress = 0;
	let unread = 0;
	let waitingForInput = 0;
	for (const session of sessions) {
		const status = session.status.get();
		if (status === SessionStatus.InProgress) {
			inProgress++;
		}
		if (status === SessionStatus.NeedsInput) {
			waitingForInput++;
		}
		if (!session.isRead.get()) {
			unread++;
		}
	}
	// Archived sessions were filtered upstream, so every session here is "not done".
	return { inProgress, unread, waitingForInput, notDone: sessions.length };
}

function countAttachmentsByKind(attachments: readonly { readonly kind: string }[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const attachment of attachments) {
		counts[attachment.kind] = (counts[attachment.kind] ?? 0) + 1;
	}
	return counts;
}
