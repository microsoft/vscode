/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IAgentSession, isAgentSession } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';
import { ISessionType, ISendRequestOptions, ISessionsChangeEvent } from './sessionsProvider.js';
import { ISessionData, ISessionWorkspace, GITHUB_REMOTE_FILE_SCHEME } from '../common/sessionData.js';
import { IGitHubSessionContext } from '../../github/common/types.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';

/**
 * Configuration properties available on new/pending sessions.
 * Not part of the public {@link ISessionData} contract but present on
 * concrete session implementations (CopilotCLISession, RemoteNewSession, AgentHostNewSession).
 */

export const IsNewChatSessionContext = new RawContextKey<boolean>('isNewChatSession', true);

/**
 * The provider ID of the active session (e.g., 'default-copilot', 'agenthost-hostA').
 */
export const ActiveSessionProviderIdContext = new RawContextKey<string>('activeSessionProviderId', '', localize('activeSessionProviderId', "The provider ID of the active session"));

/**
 * The session type of the active session (e.g., 'copilotcli', 'cloud').
 */
export const ActiveSessionTypeContext = new RawContextKey<string>('activeSessionType', '', localize('activeSessionType', "The session type of the active session"));

export const IsActiveSessionBackgroundProviderContext = new RawContextKey<boolean>('isActiveSessionBackgroundProvider', false, localize('isActiveSessionBackgroundProvider', "Whether the active session uses the background agent provider"));

//#region Active Session Service

const LAST_SELECTED_SESSION_KEY = 'agentSessions.lastSelectedSession';
const ACTIVE_PROVIDER_KEY = 'sessions.activeProviderId';

/**
 * An active session item extends IChatSessionItem with repository information.
 * - For agent session items: repository is the workingDirectory from metadata
 * - For new sessions: repository comes from the session option with id 'repository'
 */
export interface ISessionsManagementService {
	readonly _serviceBrand: undefined;

	// -- Sessions --

	/**
	 * Get all sessions from all registered providers.
	 */
	getSessions(): ISessionData[];

	/**
	 * Get a session by its resource URI.
	 */
	getSession(resource: URI): ISessionData | undefined;

	/**
	 * Get all session types from all registered providers.
	 */
	getAllSessionTypes(): ISessionType[];

	/**
	 * Fires when available session types change (providers added/removed).
	 */
	readonly onDidChangeSessionTypes: Event<void>;

	/**
	 * Fires when sessions change across any provider.
	 */
	readonly onDidChangeSessions: Event<ISessionsChangeEvent>;

	// -- Active Session --

	/**
	 * Observable for the currently active session as {@link ISessionData}.
	 */
	readonly activeSession: IObservable<ISessionData | undefined>;

	/**
	 * Observable for the currently active sessions provider ID.
	 * When only one provider exists, it is selected automatically.
	 */
	readonly activeProviderId: IObservable<string | undefined>;

	/**
	 * Set the active sessions provider by ID.
	 */
	setActiveProvider(providerId: string): void;

	/**
	 * Select an existing session as the active session.
	 * Sets `isNewChatSession` context to false and opens the session.
	 */
	openSession(sessionResource: URI): Promise<void>;

	/**
	 * Switch to the new-session view.
	 * No-op if the current session is already a new session.
	 */
	openNewSessionView(): void;

	/**
	 * Returns the repository URI for the given session, if available.
	 */
	getSessionRepositoryUri(session: IAgentSession): URI | undefined;

	/**
	 * Create a new session for the given workspace.
	 * Delegates to the provider identified by providerId.
	 */
	createNewSession(providerId: string, workspace: ISessionWorkspace): ISessionData;

	/**
	 * Send the initial request for a session.
	 */
	sendRequest(session: ISessionData, options: ISendRequestOptions): Promise<void>;

	/**
	 * Update the session type for a new session.
	 * The provider may recreate the session object.
	 * If the session is the active session, the active session data is updated.
	 */
	setSessionType(session: ISessionData, type: ISessionType): Promise<void>;

	/**
	 * Commit files in a worktree and refresh the agent sessions model
	 * so the Changes view reflects the update.
	 */
	commitWorktreeFiles(session: ISessionData, fileUris: URI[]): Promise<void>;

	/**
	 * Derive a GitHub context (owner, repo, prNumber) from an active session.
	 * Returns `undefined` if the session is not associated with a GitHub repository.
	 */
	getGitHubContext(session: ISessionData): IGitHubSessionContext | undefined;

	/**
	 * Derive a GitHub context from a session resource URI.
	 * Looks up the agent session internally and resolves repository info.
	 */
	getGitHubContextForSession(sessionResource: URI): IGitHubSessionContext | undefined;

	/**
	 * Resolve a relative file path to a full URI based on the session's repository/worktree.
	 */
	resolveSessionFileUri(sessionResource: URI, relativePath: string): URI | undefined;

	// -- Session Actions --

	/** Archive a session. */
	archiveSession(session: ISessionData): Promise<void>;
	/** Unarchive a session. */
	unarchiveSession(session: ISessionData): Promise<void>;
	/** Delete a session. */
	deleteSession(session: ISessionData): Promise<void>;
	/** Rename a session. */
	renameSession(session: ISessionData, title: string): Promise<void>;
	/** Mark a session as read or unread. */
	setRead(session: ISessionData, read: boolean): void;
}

export const ISessionsManagementService = createDecorator<ISessionsManagementService>('sessionsManagementService');

export class SessionsManagementService extends Disposable implements ISessionsManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionsChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionsChangeEvent> = this._onDidChangeSessions.event;

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	private _sessionTypes: readonly ISessionType[] = [];

	private readonly _activeSession = observableValue<ISessionData | undefined>(this, undefined);
	readonly activeSession: IObservable<ISessionData | undefined> = this._activeSession;
	private readonly _newSessionObservable = observableValue<ISessionData | undefined>(this, undefined);
	readonly newSession: IObservable<ISessionData | undefined> = this._newSessionObservable;
	private readonly _activeProviderId = observableValue<string | undefined>(this, undefined);
	readonly activeProviderId: IObservable<string | undefined> = this._activeProviderId;
	private lastSelectedSession: URI | undefined;
	private readonly isNewChatSessionContext: IContextKey<boolean>;
	private readonly _activeSessionProviderId: IContextKey<string>;
	private readonly _activeSessionType: IContextKey<string>;
	private readonly _isBackgroundProvider: IContextKey<boolean>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();

		// Bind context key to active session state.
		// isNewSession is false when there are any established sessions in the model.
		this.isNewChatSessionContext = IsNewChatSessionContext.bindTo(contextKeyService);
		this._activeSessionProviderId = ActiveSessionProviderIdContext.bindTo(contextKeyService);
		this._activeSessionType = ActiveSessionTypeContext.bindTo(contextKeyService);
		this._isBackgroundProvider = IsActiveSessionBackgroundProviderContext.bindTo(contextKeyService);

		// Load last selected session
		this.lastSelectedSession = this.loadLastSelectedSession();

		// Save on shutdown
		this._register(this.storageService.onWillSaveState(() => this.saveLastSelectedSession()));

		// Forward session change events from providers and update active session
		this._register(this.sessionsProvidersService.onDidChangeSessions(e => this.onDidChangeSessionsFromSessionsProviders(e)));

		// Restore or auto-select active provider
		this._initActiveProvider();
		this._register(this.sessionsProvidersService.onDidChangeProviders(() => {
			this._initActiveProvider();
			this._updateSessionTypes();
		}));
	}

	private _initActiveProvider(): void {
		const providers = this.sessionsProvidersService.getProviders();
		if (providers.length === 0) {
			return;
		}

		// If already set and still valid, keep it
		const current = this._activeProviderId.get();
		if (current && providers.some(p => p.id === current)) {
			return;
		}

		// Try to restore from storage
		const stored = this.storageService.get(ACTIVE_PROVIDER_KEY, StorageScope.PROFILE);
		if (stored && providers.some(p => p.id === stored)) {
			this._activeProviderId.set(stored, undefined);
			return;
		}

		// Auto-select the first (or only) provider
		this._activeProviderId.set(providers[0].id, undefined);
	}

	setActiveProvider(providerId: string): void {
		this._activeProviderId.set(providerId, undefined);
		this.storageService.store(ACTIVE_PROVIDER_KEY, providerId, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private onDidChangeSessionsFromSessionsProviders(e: ISessionsChangeEvent): void {
		this._onDidChangeSessions.fire(e);
		const currentActive = this._activeSession.get();
		if (!currentActive) {
			return;
		}

		if (e.removed.length) {
			if (e.removed.some(r => r.sessionId === currentActive.sessionId)) {
				this.openNewSessionView();
				return;
			}
		}

		if (e.changed.length) {
			const updated = e.changed.find(s => s.sessionId === currentActive.sessionId);
			if (updated?.isArchived.get()) {
				this.openNewSessionView();
				return;
			}
			if (updated) {
				this._activeSession.set(updated, undefined);
				return;
			}
		}
	}

	private getRepositoryFromMetadata(session: IAgentSession): [URI | undefined, URI | undefined, string | undefined, boolean | undefined] {
		const metadata = session.metadata;
		if (!metadata) {
			return [undefined, undefined, undefined, undefined];
		}

		if (session.providerType === AgentSessionProviders.Cloud) {
			//TODO: @osortega pass branch in metadata from extension
			const branch = typeof metadata.branch === 'string' ? metadata.branch : 'HEAD';
			const repositoryUri = URI.from({
				scheme: GITHUB_REMOTE_FILE_SCHEME,
				authority: 'github',
				path: `/${metadata.owner}/${metadata.name}/${encodeURIComponent(branch)}`
			});
			return [repositoryUri, undefined, undefined, undefined];
		}

		const workingDirectoryPath = metadata?.workingDirectoryPath as string | undefined;
		if (workingDirectoryPath) {
			return [URI.file(workingDirectoryPath), undefined, undefined, undefined];
		}

		const repositoryPath = metadata?.repositoryPath as string | undefined;
		const repositoryPathUri = typeof repositoryPath === 'string' ? URI.file(repositoryPath) : undefined;

		const worktreePath = metadata?.worktreePath as string | undefined;
		const worktreePathUri = typeof worktreePath === 'string' ? URI.file(worktreePath) : undefined;

		const worktreeBranchName = metadata?.branchName as string | undefined;
		const worktreeBaseBranchProtected = metadata?.baseBranchProtected as boolean | undefined;

		return [
			URI.isUri(repositoryPathUri) ? repositoryPathUri : undefined,
			URI.isUri(worktreePathUri) ? worktreePathUri : undefined,
			worktreeBranchName,
			worktreeBaseBranchProtected];
	}

	getSessions(): ISessionData[] {
		return this.sessionsProvidersService.getSessions();
	}

	getSession(resource: URI): ISessionData | undefined {
		return this.sessionsProvidersService.getSessions().find(s => this.uriIdentityService.extUri.isEqual(s.resource, resource));
	}

	getAllSessionTypes(): ISessionType[] {
		return [...this._sessionTypes];
	}

	private _collectSessionTypes(): ISessionType[] {
		const types: ISessionType[] = [];
		const seen = new Set<string>();
		for (const provider of this.sessionsProvidersService.getProviders()) {
			for (const type of provider.sessionTypes) {
				if (!seen.has(type.id)) {
					seen.add(type.id);
					types.push(type);
				}
			}
		}
		return types;
	}

	private _updateSessionTypes(): void {
		const newTypes = this._collectSessionTypes();
		const oldIds = new Set(this._sessionTypes.map(t => t.id));
		const newIds = new Set(newTypes.map(t => t.id));
		if (oldIds.size !== newIds.size || [...oldIds].some(id => !newIds.has(id))) {
			this._sessionTypes = newTypes;
			this._onDidChangeSessionTypes.fire();
		}
	}

	async openSession(sessionResource: URI): Promise<void> {
		const sessionData = this.getSession(sessionResource);
		if (!sessionData) {
			this.logService.warn(`[SessionsManagement] openSession: session not found: ${sessionResource.toString()}`);
			throw new Error(`Session with resource ${sessionResource.toString()} not found`);
		}
		this.logService.info(`[SessionsManagement] openSession: ${sessionResource.toString()} provider=${sessionData.providerId}`);
		this.isNewChatSessionContext.set(false);
		this.setActiveSession(sessionData);

		await this.chatWidgetService.openSession(sessionResource, ChatViewPaneTarget);
	}

	createNewSession(providerId: string, workspace: ISessionWorkspace): ISessionData {
		if (!this.isNewChatSessionContext.get()) {
			this.isNewChatSessionContext.set(true);
		}

		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === providerId);
		if (!provider) {
			throw new Error(`Sessions provider '${providerId}' not found`);
		}

		const sessionData = provider.createNewSession(workspace);

		this._newSessionObservable.set(sessionData, undefined);
		this.setActiveSession(sessionData);
		this._activeSession.set(sessionData, undefined);
		return sessionData;
	}

	async setSessionType(session: ISessionData, type: ISessionType): Promise<void> {
		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
		if (!provider) {
			throw new Error(`Sessions provider '${session.providerId}' not found`);
		}

		const updatedSession = provider.setSessionType(session.sessionId, type);

		const activeSession = this._activeSession.get();
		if (activeSession && activeSession.sessionId === session.sessionId) {
			this._newSessionObservable.set(updatedSession, undefined);
			this._activeSession.set(updatedSession, undefined);
		}
	}

	async sendRequest(session: ISessionData, options: ISendRequestOptions): Promise<void> {
		this.isNewChatSessionContext.set(false);

		const provider = this.sessionsProvidersService.getProviders().find(p => p.id === session.providerId);
		if (!provider) {
			throw new Error(`Sessions provider '${session.providerId}' not found`);
		}

		// Delegate to the provider
		const result = await provider.sendRequest(session.sessionId, options);

		// Set the new agent session as active
		if (result) {
			this._activeSession.set(result, undefined);
		}

		// Clean up
		this._newSessionObservable.set(undefined, undefined);
	}

	openNewSessionView(): void {
		// No-op if the current session is already a new session
		if (this.isNewChatSessionContext.get()) {
			return;
		}
		this.setActiveSession(undefined);
		this.isNewChatSessionContext.set(true);
	}

	getSessionRepositoryUri(session: IAgentSession): URI | undefined {
		const [repositoryUri] = this.getRepositoryFromMetadata(session);
		return repositoryUri;
	}

	private setActiveSession(session: ISessionData | undefined): void {
		// Update context keys from session data
		this._activeSessionProviderId.set(session?.providerId ?? '');
		this._activeSessionType.set(session?.sessionType ?? '');
		this._isBackgroundProvider.set(session?.sessionType === AgentSessionProviders.Background);

		if (session && isAgentSession(session)) {
			this.lastSelectedSession = session.resource;
		}

		if (session) {
			this.logService.info(`[ActiveSessionService] Active session changed: ${session.resource.toString()}`);
		} else {
			this.logService.trace('[ActiveSessionService] Active session cleared');
		}

		this._activeSession.set(session, undefined);
	}

	async commitWorktreeFiles(session: ISessionData, fileUris: URI[]): Promise<void> {
		const worktreeUri = session.workspace.get()?.repositories[0]?.workingDirectory;
		if (!worktreeUri) {
			throw new Error('Cannot commit worktree files: active session has no associated worktree');
		}
		for (const fileUri of fileUris) {
			await this.commandService.executeCommand(
				'github.copilot.cli.sessions.commitToWorktree',
				{ worktreeUri, fileUri }
			);
		}
		await this.agentSessionsService.model.resolve(AgentSessionProviders.Background);
	}

	getGitHubContext(session: ISessionData): IGitHubSessionContext | undefined {
		// 1. Try parsing a github-remote-file URI (Cloud sessions)
		const repoUri = session.workspace.get()?.repositories[0]?.uri;
		if (repoUri && repoUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			const parts = repoUri.path.split('/').filter(Boolean);
			if (parts.length >= 2) {
				const owner = decodeURIComponent(parts[0]);
				const repo = decodeURIComponent(parts[1]);
				const prNumber = this._parsePRNumberFromSession(session);
				return { owner, repo, prNumber };
			}
		}

		// 2. Try from agent session metadata (Background sessions)
		const agentSession = this.agentSessionsService.model.getSession(session.resource);
		if (agentSession?.metadata) {
			const metadata = agentSession.metadata;

			// owner + name fields
			if (typeof metadata.owner === 'string' && typeof metadata.name === 'string') {
				const prNumber = this._parsePRNumberFromSession(session);
				return { owner: metadata.owner, repo: metadata.name, prNumber };
			}

			// repositoryNwo: "owner/repo"
			if (typeof metadata.repositoryNwo === 'string') {
				const parts = (metadata.repositoryNwo as string).split('/');
				if (parts.length === 2) {
					const prNumber = this._parsePRNumberFromSession(session);
					return { owner: parts[0], repo: parts[1], prNumber };
				}
			}

			// pullRequestUrl: "https://github.com/{owner}/{repo}/pull/{number}"
			if (typeof metadata.pullRequestUrl === 'string') {
				const match = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(metadata.pullRequestUrl as string);
				if (match) {
					return { owner: match[1], repo: match[2], prNumber: parseInt(match[3], 10) };
				}
			}
		}

		return undefined;
	}

	getGitHubContextForSession(sessionResource: URI): IGitHubSessionContext | undefined {
		// Try finding the ISessionData first (preferred path)
		const sessionData = this.sessionsProvidersService.getSessions().find(s => s.resource.toString() === sessionResource.toString());
		if (sessionData) {
			return this.getGitHubContext(sessionData);
		}

		// Fallback: construct context directly from agent session metadata
		const agentSession = this.agentSessionsService.model.getSession(sessionResource);
		if (!agentSession) {
			return undefined;
		}
		const [repository] = this.getRepositoryFromMetadata(agentSession);
		if (repository && repository.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			const parts = repository.path.split('/').filter(Boolean);
			if (parts.length >= 2) {
				return { owner: decodeURIComponent(parts[0]), repo: decodeURIComponent(parts[1]), prNumber: undefined };
			}
		}
		return undefined;
	}

	resolveSessionFileUri(sessionResource: URI, relativePath: string): URI | undefined {
		const agentSession = this.agentSessionsService.model.getSession(sessionResource);
		if (!agentSession) {
			return undefined;
		}
		const [repository, worktree] = this.getRepositoryFromMetadata(agentSession);
		const baseUri = worktree ?? repository;
		if (!baseUri) {
			return undefined;
		}
		return URI.joinPath(baseUri, relativePath);
	}

	private _parsePRNumberFromSession(session: ISessionData): number | undefined {
		const prUri = session.pullRequest.get()?.uri;
		if (prUri) {
			const match = /\/pull\/(\d+)/.exec(prUri.path);
			if (match) {
				return parseInt(match[1], 10);
			}
		}
		return undefined;
	}

	private loadLastSelectedSession(): URI | undefined {
		const cached = this.storageService.get(LAST_SELECTED_SESSION_KEY, StorageScope.WORKSPACE);
		if (!cached) {
			return undefined;
		}

		try {
			return URI.parse(cached);
		} catch {
			return undefined;
		}
	}

	private saveLastSelectedSession(): void {
		if (this.lastSelectedSession) {
			this.storageService.store(LAST_SELECTED_SESSION_KEY, this.lastSelectedSession.toString(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	// -- Session Actions --

	async archiveSession(session: ISessionData): Promise<void> {
		await this.sessionsProvidersService.archiveSession(session.sessionId);
	}

	async unarchiveSession(session: ISessionData): Promise<void> {
		await this.sessionsProvidersService.unarchiveSession(session.sessionId);
	}

	async deleteSession(session: ISessionData): Promise<void> {
		// Clear the chat widget before removing from storage
		await this.chatWidgetService.getWidgetBySessionResource(session.resource)?.clear();
		await this.sessionsProvidersService.deleteSession(session.sessionId);
	}

	async renameSession(session: ISessionData, title: string): Promise<void> {
		await this.sessionsProvidersService.renameSession(session.sessionId, title);
	}

	setRead(session: ISessionData, read: boolean): void {
		this.sessionsProvidersService.setRead(session.sessionId, read);
	}
}

//#endregion
