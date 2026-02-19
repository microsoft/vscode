/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISessionOpenOptions, openSession as openSessionDefault } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsOpener.js';
import { ChatViewId, ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatViewPane } from '../../../../workbench/contrib/chat/browser/widgetHosts/viewPane/chatViewPane.js';
import { IChatSessionItem, IChatSessionProviderOptionItem, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatService, IChatSendRequestOptions } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IAgentSession, isAgentSession } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { LocalChatSessionUri } from '../../../../workbench/contrib/chat/common/model/chatUri.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceEditingService } from '../../../../workbench/services/workspaces/common/workspaceEditing.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';

export const IsNewChatSessionContext = new RawContextKey<boolean>('isNewChatSession', true);

//#region Active Session Service

const LAST_SELECTED_SESSION_KEY = 'agentSessions.lastSelectedSession';
const repositoryOptionId = 'repository';

/**
 * An active session item extends IChatSessionItem with repository information.
 * - For agent session items: repository is the workingDirectory from metadata
 * - For new sessions: repository comes from the session option with id 'repository'
 */
export type IActiveSessionItem = (IChatSessionItem | IAgentSession) & {
	/**
	 * The repository URI for this session.
	 */
	readonly repository: URI | undefined;

	/**
	 * The worktree URI for this session.
	 */
	readonly worktree: URI | undefined;
};

export interface ISessionsManagementService {
	readonly _serviceBrand: undefined;

	/**
	 * Observable for the currently active session.
	 */
	readonly activeSession: IObservable<IActiveSessionItem | undefined>;

	/**
	 * Returns the currently active session, if any.
	 */
	getActiveSession(): IActiveSessionItem | undefined;

	/**
	 * Select an existing session as the active session.
	 * Sets `isNewChatSession` context to false and opens the session.
	 */
	openSession(sessionResource: URI, openOptions?: ISessionOpenOptions): Promise<void>;

	/**
	 * Switch to the new-session view.
	 * No-op if the current session is already a new session.
	 */
	openNewSession(): void;

	/**
	 * Open a new session, apply options, and send the initial request.
	 * This is the main entry point for the new-chat welcome widget.
	 */
	sendRequestForNewSession(sessionResource: URI, query: string, sendOptions: IChatSendRequestOptions, selectedOptions?: ReadonlyMap<string, IChatSessionProviderOptionItem>, folderUri?: URI): Promise<void>;
}

export const ISessionsManagementService = createDecorator<ISessionsManagementService>('sessionsManagementService');

export class SessionsManagementService extends Disposable implements ISessionsManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly _activeSession = observableValue<IActiveSessionItem | undefined>(this, undefined);
	readonly activeSession: IObservable<IActiveSessionItem | undefined> = this._activeSession;

	private lastSelectedSession: URI | undefined;
	private readonly isNewChatSessionContext: IContextKey<boolean>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super();

		// Bind context key to active session state.
		// isNewSession is false when there are any established sessions in the model.
		this.isNewChatSessionContext = IsNewChatSessionContext.bindTo(contextKeyService);

		// Load last selected session
		this.lastSelectedSession = this.loadLastSelectedSession();

		// Save on shutdown
		this._register(this.storageService.onWillSaveState(() => this.saveLastSelectedSession()));

		// Update active session when session options change
		this._register(this.chatSessionsService.onDidChangeSessionOptions(sessionResource => {
			const currentActive = this._activeSession.get();
			if (currentActive && currentActive.resource.toString() === sessionResource.toString()) {
				// Re-fetch the repository from session options and update the active session
				const repository = this.getRepositoryFromSessionOption(sessionResource);
				if (currentActive.repository?.toString() !== repository?.toString()) {
					this._activeSession.set({ ...currentActive, repository }, undefined);
				}
			}
		}));

		// Update active session when the agent sessions model changes (e.g., metadata updates with worktree/repository info)
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => this.refreshActiveSessionFromModel()));
	}

	private refreshActiveSessionFromModel(): void {
		const currentActive = this._activeSession.get();
		if (!currentActive) {
			return;
		}

		const agentSession = this.agentSessionsService.model.getSession(currentActive.resource);
		if (!agentSession) {
			// Only switch sessions if the active session was a known agent session
			// that got deleted. New session resources that aren't yet in the model
			// should not trigger a switch.
			if (isAgentSession(currentActive)) {
				this.showNextSession();
			}
			return;
		}

		const [repository, worktree] = this.getRepositoryFromMetadata(agentSession.metadata);
		const activeSessionItem: IActiveSessionItem = {
			...agentSession,
			repository,
			worktree,
		};
		this._activeSession.set(activeSessionItem, undefined);
	}

	private showNextSession(): void {
		const sessions = this.agentSessionsService.model.sessions
			.filter(s => !s.isArchived())
			.sort((a, b) => (b.timing.lastRequestEnded ?? b.timing.created) - (a.timing.lastRequestEnded ?? a.timing.created));

		if (sessions.length > 0) {
			this.setActiveSession(sessions[0]);
			this.instantiationService.invokeFunction(openSessionDefault, sessions[0]);
		} else {
			this.openNewSession();
		}
	}

	private getRepositoryFromMetadata(metadata: { readonly [key: string]: unknown } | undefined): [URI | undefined, URI | undefined] {
		if (!metadata) {
			return [undefined, undefined];
		}

		const repositoryPath = metadata?.repositoryPath as string | undefined;
		const repositoryPathUri = typeof repositoryPath === 'string' ? URI.file(repositoryPath) : undefined;

		const worktreePath = metadata?.worktreePath as string | undefined;
		const worktreePathUri = typeof worktreePath === 'string' ? URI.file(worktreePath) : undefined;

		return [
			URI.isUri(repositoryPathUri) ? repositoryPathUri : undefined,
			URI.isUri(worktreePathUri) ? worktreePathUri : undefined];
	}

	private getRepositoryFromSessionOption(sessionResource: URI): URI | undefined {
		const optionValue = this.chatSessionsService.getSessionOption(sessionResource, repositoryOptionId);
		if (!optionValue) {
			return undefined;
		}

		// Option value can be a string or IChatSessionProviderOptionItem
		const optionId = typeof optionValue === 'string' ? optionValue : (optionValue as IChatSessionProviderOptionItem).id;
		if (!optionId) {
			return undefined;
		}

		try {
			return URI.parse(optionId);
		} catch {
			return undefined;
		}
	}

	getActiveSession(): IActiveSessionItem | undefined {
		return this._activeSession.get();
	}

	async openSession(sessionResource: URI, openOptions?: ISessionOpenOptions): Promise<void> {
		this.isNewChatSessionContext.set(false);

		const existingSession = this.agentSessionsService.model.getSession(sessionResource);
		if (existingSession) {
			await this.openExistingSession(existingSession, openOptions);
		} else if (LocalChatSessionUri.isLocalSession(sessionResource)) {
			await this.openLocalSession();
		} else {
			await this.openNewRemoteSession(sessionResource);
		}
	}

	/**
	 * Open an existing agent session - set it as active and reveal it.
	 */
	private async openExistingSession(session: IAgentSession, openOptions?: ISessionOpenOptions): Promise<void> {
		this.setActiveSession(session);
		await this.instantiationService.invokeFunction(openSessionDefault, session, openOptions);
	}

	/**
	 * Open a fresh local chat session - show the ChatViewPane and clear the widget.
	 */
	private async openLocalSession(): Promise<void> {
		const view = await this.viewsService.openView(ChatViewId) as ChatViewPane | undefined;
		if (view) {
			await view.widget.clear();
			if (view.widget.viewModel) {
				const folder = this.workspaceContextService.getWorkspace().folders[0];
				const activeSessionItem: IActiveSessionItem = {
					resource: view.widget.viewModel.sessionResource,
					label: view.widget.viewModel.model.title || '',
					timing: view.widget.viewModel.model.timing,
					repository: folder?.uri,
					worktree: undefined
				};
				this._activeSession.set(activeSessionItem, undefined);
			}
		}
	}

	/**
	 * Open a new remote session - load the model first, then show it in the ChatViewPane.
	 */
	private async openNewRemoteSession(sessionResource: URI): Promise<void> {
		const modelRef = await this.chatService.loadSessionForResource(sessionResource, ChatAgentLocation.Chat, CancellationToken.None);
		const chatWidget = await this.chatWidgetService.openSession(sessionResource, ChatViewPaneTarget);
		if (!chatWidget?.viewModel) {
			this.logService.warn(`[ActiveSessionService] Failed to open session: ${sessionResource.toString()}`);
			modelRef?.dispose();
			return;
		}
		const repository = this.getRepositoryFromSessionOption(sessionResource);
		const activeSessionItem: IActiveSessionItem = {
			resource: sessionResource,
			label: chatWidget.viewModel.model.title || '',
			timing: chatWidget.viewModel.model.timing,
			repository,
			worktree: undefined
		};
		this.logService.info(`[ActiveSessionService] Active session changed (new): ${sessionResource.toString()}, repository: ${repository?.toString() ?? 'none'}`);
		this._activeSession.set(activeSessionItem, undefined);
	}

	async sendRequestForNewSession(sessionResource: URI, query: string, sendOptions: IChatSendRequestOptions, selectedOptions?: ReadonlyMap<string, IChatSessionProviderOptionItem>, folderUri?: URI): Promise<void> {
		if (LocalChatSessionUri.isLocalSession(sessionResource)) {
			await this.sendLocalSession(sessionResource, query, sendOptions, folderUri);
		} else {
			await this.sendCustomSession(sessionResource, query, sendOptions, selectedOptions);
		}
	}

	/**
	 * Local sessions run directly through the ChatWidget.
	 * Set the workspace folder, open a fresh chat view, and submit via acceptInput.
	 */
	private async sendLocalSession(sessionResource: URI, query: string, sendOptions: IChatSendRequestOptions, folderUri?: URI): Promise<void> {
		if (folderUri) {
			await this.workspaceEditingService.updateFolders(0, this.workspaceContextService.getWorkspace().folders.length, [{ uri: folderUri }]);
		}

		await this.openSession(sessionResource);

		const widget = this.chatWidgetService.lastFocusedWidget;
		if (widget) {
			if (sendOptions.attachedContext?.length) {
				widget.attachmentModel.addContext(...sendOptions.attachedContext);
			}
			widget.setInput(query);
			widget.acceptInput(query);
		}
	}

	/**
	 * Custom sessions (worktree, cloud, etc.) go through the chat service.
	 * Apply selected options, send the request, then wait for the extension
	 * to create an agent session so it appears in the sidebar.
	 */
	private async sendCustomSession(sessionResource: URI, query: string, sendOptions: IChatSendRequestOptions, selectedOptions?: ReadonlyMap<string, IChatSessionProviderOptionItem>): Promise<void> {
		// 1. Open the session - loads the model and shows the ChatViewPane
		await this.openSession(sessionResource);

		// 2. Apply selected options (repository, branch, etc.) to the contributed session
		if (selectedOptions && selectedOptions.size > 0) {
			const modelRef = this.chatService.getActiveSessionReference(sessionResource);
			if (modelRef) {
				const model = modelRef.object;
				const contributedSession = model.contributedChatSession;
				if (contributedSession) {
					const initialSessionOptions = [...selectedOptions.entries()].map(
						([optionId, value]) => ({ optionId, value })
					);
					model.setContributedChatSession({
						...contributedSession,
						initialSessionOptions,
					});
				}
				modelRef.dispose();
			}
		}

		// 3. Send the request
		const existingResources = new Set(
			this.agentSessionsService.model.sessions.map(s => s.resource.toString())
		);
		const result = await this.chatService.sendRequest(sessionResource, query, sendOptions);
		if (result.kind === 'rejected') {
			this.logService.error(`[ActiveSessionService] sendRequest rejected: ${result.reason}`);
			return;
		}

		// 4. Wait for the extension to create an agent session, then set it as active
		let newSession = this.agentSessionsService.model.sessions.find(
			s => !existingResources.has(s.resource.toString())
		);

		if (!newSession) {
			let listener: IDisposable | undefined;
			newSession = await Promise.race([
				new Promise<IAgentSession>(resolve => {
					listener = this.agentSessionsService.model.onDidChangeSessions(() => {
						const session = this.agentSessionsService.model.sessions.find(
							s => !existingResources.has(s.resource.toString())
						);
						if (session) {
							resolve(session);
						}
					});
				}),
				new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 30_000)),
			]);
			listener?.dispose();
		}

		if (newSession) {
			this.setActiveSession(newSession);
		}
	}

	openNewSession(): void {
		// No-op if the current session is already a new session
		if (this.isNewChatSessionContext.get()) {
			return;
		}
		this.isNewChatSessionContext.set(true);
		this._activeSession.set(undefined, undefined);
	}

	private setActiveSession(session: IAgentSession): void {
		this.lastSelectedSession = session.resource;
		const [repository, worktree] = this.getRepositoryFromMetadata(session.metadata);
		const activeSessionItem: IActiveSessionItem = {
			...session,
			repository,
			worktree,
		};
		this.logService.info(`[ActiveSessionService] Active session changed: ${session.resource.toString()}, repository: ${repository?.toString() ?? 'none'}`);
		this._activeSession.set(activeSessionItem, undefined);
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
}

//#endregion
