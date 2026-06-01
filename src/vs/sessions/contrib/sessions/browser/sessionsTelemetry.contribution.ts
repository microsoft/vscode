/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../../base/common/hash.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { isChatRequestFileEntry, isImageVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { getExcludes, ISearchConfiguration, ISearchService, QueryType } from '../../../../workbench/services/search/common/search.js';
import { IAgentFeedbackAddedEvent, IAgentFeedbackConvertedEvent, IAgentFeedbackReplyAddedEvent, IAgentFeedbackService, IAgentFeedbackSubmittedEvent } from '../../agentFeedback/browser/agentFeedbackService.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISendRequestSentEvent, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISendRequestOptions } from '../../../services/sessions/common/sessionsProvider.js';
import { ISessionsPartService } from '../../../browser/parts/sessionsPartService.js';

const TOTAL_REQUESTS_KEY = 'agentSessions.telemetry.totalRequests';
const WORKSPACE_REQUESTS_KEY = 'agentSessions.telemetry.workspaceRequests';
const PROVIDER_REQUESTS_KEY = 'agentSessions.telemetry.providerRequests';

/**
 * Listens to lifecycle events from {@link ISessionsManagementService} and
 * emits telemetry for them. The per-event classifications declared below are
 * intentionally flat (not composed via intersections) so that the telemetry
 * classification scanner can resolve every event from a single literal type.
 * The internal `getXxxFields` getters simply assemble the payload that is then
 * handed to the appropriate `publicLog2<...>` call site.
 */
export class SessionsTelemetryContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsTelemetry';

	/** Final workspace file counts, keyed by session id (so subsequent log calls for the same session are instant). */
	private readonly _workspaceFileCountCache = new Map<string, number>();
	/** Pending workspace file-count fetches, keyed by workspace URI so a prewarm started before a session-id assignment can be picked up after. */
	private readonly _workspaceFileCountInFlight = new Map<string, Promise<number>>();

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IStorageService private readonly _storageService: IStorageService,
		@ISearchService private readonly _searchService: ISearchService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICommandService commandService: ICommandService,
		@IAgentFeedbackService agentFeedbackService: IAgentFeedbackService,
		@ISessionsPartService sessionsPartService: ISessionsPartService,
	) {
		super();

		this._register(this._sessionsManagementService.onWillSendRequest(session => {
			// Kick off the workspace file-count fetch now so it has time to
			// resolve while the provider sends the request. The result is
			// picked up under the (possibly updated) session id when
			// `onDidSendRequest` fires.
			this._startWorkspaceFileCountFetch(session.workspace.get());
		}));
		this._register(this._sessionsManagementService.onDidSendRequest(e => this._logRequestSent(e)));
		this._register(this._sessionsManagementService.onDidArchiveSession(session => this._logSessionArchived(session)));
		this._register(this._sessionsManagementService.onDidUnarchiveSession(session => this._logSessionUnarchived(session)));
		this._register(this._sessionsManagementService.onDidDeleteSession(session => this._logSessionDeleted(session)));
		this._register(this._sessionsManagementService.onDidDeleteChat(session => this._logChatDeleted(session)));
		this._register(this._sessionsManagementService.onDidRenameChat(session => this._logChatRenamed(session)));
		this._register(this._sessionsManagementService.onDidToggleSessionStickiness(e => this._logSessionStickinessToggled(e.session, e.sticky)));
		this._register(sessionsPartService.onDidToggleMaximizeSession(e => this._logSessionMaximizeToggled(e.session, e.maximized)));

		this._register(commandService.onDidExecuteCommand(e => {
			// Commands fire very frequently. Match on the command id first
			// (cheap) and only resolve the session for matched ids.
			let log: ((session: ISession) => void) | undefined;
			switch (e.commandId) {
				case 'github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR':
				case 'workbench.action.agentSessions.runSkill.createPR':
					log = session => this._logCreatePullRequest(session);
					break;
				case 'workbench.action.agentSessions.runSkill.createDraftPR':
					log = session => this._logCreateDraftPullRequest(session);
					break;
				case 'workbench.action.agentSessions.runSkill.updatePR':
					log = session => this._logUpdatePullRequest(session);
					break;
				case 'github.copilot.chat.mergeCopilotCLIAgentSessionChanges.merge':
				case 'workbench.action.agentSessions.runSkill.merge':
					log = session => this._logMergePullRequest(session);
					break;
				case 'github.copilot.chat.checkoutPullRequestReroute':
				case 'pr.checkoutFromChat':
					log = session => this._logCheckoutPullRequest(session);
					break;
				case 'github.copilot.sessions.initializeRepository':
				case 'github.copilot.claude.sessions.initializeRepository':
					log = session => this._logInitializeRepository(session);
					break;
				case 'github.copilot.sessions.commit':
				case 'github.copilot.claude.sessions.commit':
					log = session => this._logCommit(session);
					break;
				case 'github.copilot.sessions.commitAndSync':
				case 'github.copilot.claude.sessions.commitAndSync':
					log = session => this._logCommitAndSync(session);
					break;
				case 'agentSession.restore':
					log = session => this._logSessionRestored(session);
					break;
				case 'sessions.action.fixCIChecks':
					log = session => this._logFixCIChecks(session);
					break;
				default:
					return;
			}
			const session = this._getSessionFromCommandArgs(e.args);
			if (session) {
				log(session);
			}
		}));

		this._register(agentFeedbackService.onDidAddFeedback(e => this._logFeedbackAdded(e)));
		this._register(agentFeedbackService.onDidConvertFeedback(e => this._logFeedbackConverted(e)));
		this._register(agentFeedbackService.onDidAddReply(e => this._logFeedbackReplyAdded(e)));
		this._register(agentFeedbackService.onDidSubmitFeedback(e => this._logFeedbackSubmitted(e)));
	}

	/**
	 * Resolves the session a session-scoped command was invoked on. The first
	 * argument is expected to be either a session resource {@link URI} or a
	 * `{ resource: URI }` shape (e.g. a `ChatSessionItem`). Returns `undefined`
	 * if the argument is not a recognized session reference.
	 */
	private _getSessionFromCommandArgs(args: readonly unknown[]): ISession | undefined {
		const first = args[0];
		let resource: URI | undefined;
		if (URI.isUri(first)) {
			resource = first;
		} else if (first && typeof first === 'object' && URI.isUri((first as { resource?: unknown }).resource)) {
			resource = (first as { resource: URI }).resource;
		}
		return resource ? this._sessionsManagementService.getSession(resource) : undefined;
	}

	// -- event handlers --------------------------------------------------------

	private _logRequestSent(e: ISendRequestSentEvent): void {
		const { session, chat, isNewSession, options } = e;
		const allSessions = this._sessionsManagementService.getSessions();
		const visibleSessionsCount = this._sessionsManagementService.visibleSessions.get().filter(s => s !== undefined).length;
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
			this._telemetryService.publicLog2<SessionRequestSentEvent, SessionRequestSentClassification>('agents/requestSent', {
				...sync,
				...this._getWorkspaceFields(workspace, workspaceFileCount),
			});
		});
	}

	private _logSessionArchived(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, SessionArchivedClassification>('agents/sessionArchived', payload);
		});
	}

	private _logSessionUnarchived(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, SessionUnarchivedClassification>('agents/sessionUnarchived', payload);
		});
	}

	private _logSessionDeleted(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, SessionDeletedClassification>('agents/sessionDeleted', payload);
		});
	}

	private _logChatDeleted(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, ChatDeletedClassification>('agents/chatDeleted', payload);
		});
	}

	private _logChatRenamed(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, ChatRenamedClassification>('agents/chatRenamed', payload);
		});
	}

	private _logSessionStickinessToggled(session: ISession, sticky: boolean): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionStickinessToggledEvent, SessionStickinessToggledClassification>('agents/sessionStickinessToggled', {
				...payload,
				sticky,
			});
		});
	}

	private _logSessionMaximizeToggled(session: ISession, maximized: boolean): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionMaximizeToggledEvent, SessionMaximizeToggledClassification>('agents/sessionMaximizeToggled', {
				...payload,
				maximized,
			});
		});
	}

	private _logCreatePullRequest(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, CreatePullRequestClassification>('agents/createPullRequest', payload);
		});
	}

	private _logCreateDraftPullRequest(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, CreateDraftPullRequestClassification>('agents/createDraftPullRequest', payload);
		});
	}

	private _logUpdatePullRequest(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, UpdatePullRequestClassification>('agents/updatePullRequest', payload);
		});
	}

	private _logMergePullRequest(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, MergePullRequestClassification>('agents/mergePullRequest', payload);
		});
	}

	private _logCheckoutPullRequest(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, CheckoutPullRequestClassification>('agents/checkoutPullRequest', payload);
		});
	}

	private _logInitializeRepository(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, InitializeRepositoryClassification>('agents/initializeRepository', payload);
		});
	}

	private _logCommit(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, CommitClassification>('agents/commit', payload);
		});
	}

	private _logCommitAndSync(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, CommitAndSyncClassification>('agents/commitAndSync', payload);
		});
	}

	private _logSessionRestored(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, SessionRestoredClassification>('agents/sessionRestored', payload);
		});
	}

	private _logFixCIChecks(session: ISession): void {
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<SessionActionEvent, FixCIChecksClassification>('agents/fixCIChecks', payload);
		});
	}

	private _logFeedbackAdded(e: IAgentFeedbackAddedEvent): void {
		const session = this._sessionsManagementService.getSession(e.sessionResource);
		if (!session) {
			return;
		}
		const hasSuggestion = !!e.feedback.suggestion;
		const hasExistingFeedbackForFile = e.hasExistingFeedbackForFile;
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<FeedbackAddedEvent, FeedbackAddedClassification>('agents/feedbackAdded', {
				...payload,
				hasSuggestion,
				hasExistingFeedbackForFile,
			});
		});
	}

	private _logFeedbackConverted(e: IAgentFeedbackConvertedEvent): void {
		const session = this._sessionsManagementService.getSession(e.sessionResource);
		if (!session) {
			return;
		}
		const feedbackKind = e.kind;
		const hasSuggestion = !!e.feedback.suggestion;
		const hasExistingFeedbackForFile = e.hasExistingFeedbackForFile;
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<FeedbackConvertedEvent, FeedbackConvertedClassification>('agents/feedbackConverted', {
				...payload,
				feedbackKind,
				hasSuggestion,
				hasExistingFeedbackForFile,
			});
		});
	}

	private _logFeedbackReplyAdded(e: IAgentFeedbackReplyAddedEvent): void {
		const session = this._sessionsManagementService.getSession(e.sessionResource);
		if (!session) {
			return;
		}
		const feedbackKind = e.feedback.kind;
		const replyCount = e.replyCount;
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<FeedbackReplyAddedEvent, FeedbackReplyAddedClassification>('agents/feedbackReplyAdded', {
				...payload,
				feedbackKind,
				replyCount,
			});
		});
	}

	private _logFeedbackSubmitted(e: IAgentFeedbackSubmittedEvent): void {
		const session = this._sessionsManagementService.getSession(e.sessionResource);
		if (!session) {
			return;
		}
		const { totalCount, userCount, codeReviewCount, prReviewCount, replyCount } = e;
		void this._getSessionActionPayload(session).then(payload => {
			this._telemetryService.publicLog2<FeedbackSubmittedEvent, FeedbackSubmittedClassification>('agents/feedbackSubmitted', {
				...payload,
				totalCount,
				userCount,
				codeReviewCount,
				prReviewCount,
				replyCount,
			});
		});
	}

	private _getSessionActionPayload(session: ISession): Promise<SessionActionEvent> {
		const workspace = session.workspace.get();
		const sessionFields = this._getSessionFields(session);
		const changesFields = this._getSessionChangesFields(session);
		return this._getOrFetchWorkspaceFileCount(session.sessionId, workspace).then(workspaceFileCount => ({
			...sessionFields,
			...this._getWorkspaceFields(workspace, workspaceFileCount),
			...changesFields,
		}));
	}

	// -- field-group getters (reusable by other telemetry events) --------------

	private _getSessionFields(session: ISession): SessionFields {
		return {
			agentSessionId: session.sessionId,
			providerId: session.providerId,
			providerType: session.sessionType,
			chatCount: session.chats.get().length,
		};
	}

	private _getSessionChangesFields(session: ISession): ChangesFields {
		const summary = session.changesSummary?.get();
		if (summary) {
			return {
				sessionFilesChanged: summary.files,
				sessionLinesAdded: summary.additions,
				sessionLinesDeleted: summary.deletions,
			};
		}
		// Fall back to computing from the per-change list when the provider
		// does not report an aggregated summary.
		let sessionFilesChanged = 0;
		let sessionLinesAdded = 0;
		let sessionLinesDeleted = 0;
		for (const change of session.changes.get()) {
			sessionFilesChanged++;
			sessionLinesAdded += change.insertions;
			sessionLinesDeleted += change.deletions;
		}
		return { sessionFilesChanged, sessionLinesAdded, sessionLinesDeleted };
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

type SessionIsolationKind = 'worktree' | 'folder';

// --- Internal field-group types used as return values for helper getters
// that build the payload for each event. These are NOT telemetry
// classifications; each event below declares its own flat classification so
// that the telemetry classification scanner can resolve every event from a
// single literal type. ---

type SessionFields = {
	agentSessionId: string;
	providerId: string;
	providerType: string;
	chatCount: number;
};

type ChatFields = {
	chatModeKind: string;
};

type WorkspaceFields = {
	isolationKind: SessionIsolationKind;
	workspaceHash: string;
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;
	workspaceFileCount: number;
};

type ChangesFields = {
	sessionFilesChanged: number;
	sessionLinesAdded: number;
	sessionLinesDeleted: number;
};

type RequestFields = {
	queryLength: number;
	totalAttachementCount: number;
	fileAttachmentCount: number;
	imageAttachmentCount: number;
	attachmentKinds: string;
};

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

type UserRequestCountersFields = {
	userRequestsTotal: number;
	userRequestsInWorkspace: number;
	userRequestsForProvider: number;
};

// --- Event: agents/requestSent ---

type SessionRequestSentEvent = {
	isNewSession: boolean;
	visibleSessionsCount: number;
	agentSessionId: string;
	providerId: string;
	providerType: string;
	chatCount: number;
	chatModeKind: string;
	isolationKind: SessionIsolationKind;
	workspaceHash: string;
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;
	workspaceFileCount: number;
	queryLength: number;
	totalAttachementCount: number;
	fileAttachmentCount: number;
	imageAttachmentCount: number;
	attachmentKinds: string;
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
	userRequestsTotal: number;
	userRequestsInWorkspace: number;
	userRequestsForProvider: number;
};

// --- Events: session-level lifecycle actions (archive / unarchive / delete /
// chat delete / chat rename). All five share the same flat payload shape; each
// has its own classification literal so the telemetry classification scanner
// can resolve every event individually. ---

type SessionActionEvent = {
	agentSessionId: string;
	providerId: string;
	providerType: string;
	chatCount: number;
	isolationKind: SessionIsolationKind;
	workspaceHash: string;
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;
	workspaceFileCount: number;
	sessionFilesChanged: number;
	sessionLinesAdded: number;
	sessionLinesDeleted: number;
};

// Classifications

type SessionRequestSentClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user sends a request from a session in the Agents window, including the user state at the time of send.';
	isNewSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'True when the request starts a brand-new session, false when it is a new or continued chat in an existing session.' };
	visibleSessionsCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many sessions are currently visible in the sessions grid.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	chatModeKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Built-in chat mode kind (e.g., ask, agent, edit); empty when no mode is selected.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	queryLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of characters in the user query. Length only, no content.' };
	totalAttachementCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of attached context entries included with the request.' };
	fileAttachmentCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of file attachments included with the request.' };
	imageAttachmentCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of image attachments included with the request.' };
	attachmentKinds: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Stringified JSON object mapping each attachment kind (e.g. file, image, symbol) to its count for this request.' };
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
	userRequestsTotal: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cumulative number of requests the user has sent from the Agents window across all workspaces and providers (including this one).' };
	userRequestsInWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cumulative number of requests the user has sent in the current workspace (including this one).' };
	userRequestsForProvider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Cumulative number of requests the user has sent for this sessions provider across all workspaces (including this one).' };
};

type SessionArchivedClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user archives a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type SessionUnarchivedClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user unarchives a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type SessionDeletedClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user deletes a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type ChatDeletedClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user deletes a chat from a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type ChatRenamedClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user renames a chat in a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type CreatePullRequestClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user runs the Create Pull Request command for a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type CreateDraftPullRequestClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user runs the Create Draft Pull Request command for a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type UpdatePullRequestClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user runs the Update (Sync) Pull Request command for a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type MergePullRequestClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user runs the Merge Pull Request command for a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type CheckoutPullRequestClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user runs the Checkout Pull Request command for a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type InitializeRepositoryClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user runs the Initialize Repository command for a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type CommitClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user runs the Commit command for a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type CommitAndSyncClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user runs the Commit and Sync command for a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type SessionRestoredClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user restores a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

type FixCIChecksClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user runs the Fix CI Checks command for a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
};

// --- Events: agent feedback ---

type FeedbackAddedEvent = {
	agentSessionId: string;
	providerId: string;
	providerType: string;
	chatCount: number;
	isolationKind: SessionIsolationKind;
	workspaceHash: string;
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;
	workspaceFileCount: number;
	sessionFilesChanged: number;
	sessionLinesAdded: number;
	sessionLinesDeleted: number;
	hasSuggestion: boolean;
	hasExistingFeedbackForFile: boolean;
};

type FeedbackAddedClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user adds a new agent feedback comment to a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
	hasSuggestion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the feedback comment includes a suggested code edit.' };
	hasExistingFeedbackForFile: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the session already had at least one feedback comment for the same file before this one was added.' };
};

type FeedbackConvertedEvent = {
	agentSessionId: string;
	providerId: string;
	providerType: string;
	chatCount: number;
	isolationKind: SessionIsolationKind;
	workspaceHash: string;
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;
	workspaceFileCount: number;
	sessionFilesChanged: number;
	sessionLinesAdded: number;
	sessionLinesDeleted: number;
	feedbackKind: 'codeReview' | 'prReview';
	hasSuggestion: boolean;
	hasExistingFeedbackForFile: boolean;
};

type FeedbackConvertedClassification = {
	owner: 'benibenj';
	comment: 'Reports when an external review comment (code review or PR review) is converted into agent feedback for a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
	feedbackKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Origin of the converted comment: codeReview (in-product code review) or prReview (pull request review).' };
	hasSuggestion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the converted comment includes a suggested code edit.' };
	hasExistingFeedbackForFile: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the session already had at least one feedback comment for the same file before the conversion.' };
};

type FeedbackReplyAddedEvent = {
	agentSessionId: string;
	providerId: string;
	providerType: string;
	chatCount: number;
	isolationKind: SessionIsolationKind;
	workspaceHash: string;
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;
	workspaceFileCount: number;
	sessionFilesChanged: number;
	sessionLinesAdded: number;
	sessionLinesDeleted: number;
	feedbackKind: 'user' | 'codeReview' | 'prReview';
	replyCount: number;
};

type FeedbackReplyAddedClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user adds a reply to an existing agent feedback thread in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
	feedbackKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Origin of the feedback thread that received the reply (user, codeReview, prReview).' };
	replyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of replies on the feedback thread after the new reply was appended.' };
};

type FeedbackSubmittedEvent = {
	agentSessionId: string;
	providerId: string;
	providerType: string;
	chatCount: number;
	isolationKind: SessionIsolationKind;
	workspaceHash: string;
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;
	workspaceFileCount: number;
	sessionFilesChanged: number;
	sessionLinesAdded: number;
	sessionLinesDeleted: number;
	totalCount: number;
	userCount: number;
	codeReviewCount: number;
	prReviewCount: number;
	replyCount: number;
};

type FeedbackSubmittedClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user submits the accumulated agent feedback for a session in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
	totalCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of feedback items being submitted.' };
	userCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of user-authored feedback items being submitted.' };
	codeReviewCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of feedback items being submitted that originated as code review comments.' };
	prReviewCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of feedback items being submitted that originated as PR review comments.' };
	replyCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of replies across all feedback items being submitted.' };
};

// --- Events: sticky toggle / maximize toggle ---

type SessionStickinessToggledEvent = {
	agentSessionId: string;
	providerId: string;
	providerType: string;
	chatCount: number;
	isolationKind: SessionIsolationKind;
	workspaceHash: string;
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;
	workspaceFileCount: number;
	sessionFilesChanged: number;
	sessionLinesAdded: number;
	sessionLinesDeleted: number;
	sticky: boolean;
};

type SessionStickinessToggledClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user toggles a session\'s stickiness in the sessions grid in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
	sticky: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session\'s stickiness state after the toggle: true when the session is now sticky, false when it was unstuck.' };
};

type SessionMaximizeToggledEvent = {
	agentSessionId: string;
	providerId: string;
	providerType: string;
	chatCount: number;
	isolationKind: SessionIsolationKind;
	workspaceHash: string;
	hasGitRepository: boolean;
	isVirtualWorkspace: boolean;
	workspaceFileCount: number;
	sessionFilesChanged: number;
	sessionLinesAdded: number;
	sessionLinesDeleted: number;
	maximized: boolean;
};

type SessionMaximizeToggledClassification = {
	owner: 'benibenj';
	comment: 'Reports when the user toggles the maximized state of a session view in the sessions grid in the Agents window.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Globally unique session id (providerId:resourceUri), used to correlate events for the same session.' };
	providerId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The sessions provider identifier (e.g., remote agent host or local).' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session type identifier provided by the sessions provider.' };
	chatCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of chats currently in the session.' };
	isolationKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Isolation mode used by the session (worktree or folder).' };
	workspaceHash: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Non-reversible hash of the workspace URI, used to correlate events across the same workspace without disclosing the path.' };
	hasGitRepository: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether any of the workspace folders has a git repository.' };
	isVirtualWorkspace: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the workspace URI uses a non-file scheme (virtual/remote).' };
	workspaceFileCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files in the workspace (honoring user excludes); -1 if the workspace could not be scanned.' };
	sessionFilesChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of files changed in the session at the time of the action.' };
	sessionLinesAdded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines added across all changed files in the session at the time of the action.' };
	sessionLinesDeleted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Total number of lines deleted across all changed files in the session at the time of the action.' };
	maximized: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The session view\'s maximized state after the toggle: true when the view is now maximized, false when it was restored.' };
};
