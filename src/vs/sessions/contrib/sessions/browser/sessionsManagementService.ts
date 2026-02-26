/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { equals } from '../../../../base/common/objects.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISessionOpenOptions, openSession as openSessionDefault } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsOpener.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatSessionProviderOptionItem, IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatService, IChatSendRequestOptions } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../workbench/contrib/chat/common/constants.js';
import { IAgentSession, isAgentSession } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { INewSession, LocalNewSession, RemoteNewSession } from '../../chat/browser/newSession.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IWorkspaceEditingService } from '../../../../workbench/services/workspaces/common/workspaceEditing.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

export const IsNewChatSessionContext = new RawContextKey<boolean>('isNewChatSession', true);

//#region Active Session Service

const LAST_SELECTED_SESSION_KEY = 'agentSessions.lastSelectedSession';
const repositoryOptionId = 'repository';

/**
 * An active session item extends IChatSessionItem with repository information.
 * - For agent session items: repository is the workingDirectory from metadata
 * - For new sessions: repository comes from the session option with id 'repository'
 */
export interface IActiveSessionItem {
	readonly resource: URI;
	readonly isUntitled: boolean;
	readonly label: string | undefined;
	readonly repository: URI | undefined;
	readonly worktree: URI | undefined;
	readonly providerType: string;
}

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
	openNewSessionView(): void;

	/**
	 * Create a pending session object for the given target type.
	 * Local sessions collect options locally; remote sessions notify the extension.
	 */
	createNewSessionForTarget(target: AgentSessionProviders, sessionResource: URI, defaultRepoUri?: URI): Promise<INewSession>;

	/**
	 * Open a new session, apply options, and send the initial request.
	 * Looks up the session by resource URI and builds send options from it.
	 * When `openNewSessionView` is true, opens a new session view after sending
	 * instead of navigating to the newly created session.
	 */
	sendRequestForNewSession(sessionResource: URI, options?: { openNewSessionView?: boolean }): Promise<void>;

	/**
	 * Commit files in a worktree and refresh the agent sessions model
	 * so the Changes view reflects the update.
	 */
	commitWorktreeFiles(session: IActiveSessionItem, fileUris: URI[]): Promise<void>;
}

export const ISessionsManagementService = createDecorator<ISessionsManagementService>('sessionsManagementService');

export class SessionsManagementService extends Disposable implements ISessionsManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly _activeSession = observableValue<IActiveSessionItem | undefined>(this, undefined);
	readonly activeSession: IObservable<IActiveSessionItem | undefined> = this._activeSession;
	private readonly _activeSessionDisposables = this._register(new DisposableStore());

	private readonly _newSession = this._register(new MutableDisposable<INewSession>());
	private lastSelectedSession: URI | undefined;
	private readonly isNewChatSessionContext: IContextKey<boolean>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();

		// Bind context key to active session state.
		// isNewSession is false when there are any established sessions in the model.
		this.isNewChatSessionContext = IsNewChatSessionContext.bindTo(contextKeyService);

		// Load last selected session
		this.lastSelectedSession = this.loadLastSelectedSession();

		// Save on shutdown
		this._register(this.storageService.onWillSaveState(() => this.saveLastSelectedSession()));

		// Update active session when the agent sessions model changes (e.g., metadata updates with worktree/repository info)
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => this.refreshActiveSessionFromModel()));

		// Clear active session if the active session gets archived
		this._register(this.agentSessionsService.model.onDidChangeSessionArchivedState(e => {
			if (e.isArchived()) {
				const currentActive = this._activeSession.get();
				if (currentActive && currentActive.resource.toString() === e.resource.toString()) {
					this.openNewSessionView();
				}
			}
		}));
	}

	private refreshActiveSessionFromModel(): void {
		const currentActive = this._activeSession.get();
		if (!currentActive) {
			return;
		}

		const agentSession = this.agentSessionsService.model.getSession(currentActive.resource);
		if (!agentSession) {
			if (currentActive.isUntitled) {
				// The untitled session was committed by the extension via
				// onDidCommitChatSessionItem, which replaces the untitled
				// resource with a new committed resource. The commit handler
				// already swapped the ChatViewPane widget to the new resource,
				// so find it by checking the widget's current session resource.
				const chatViewWidgets = this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat);
				const committedResource = chatViewWidgets[0]?.viewModel?.sessionResource;
				const committedSession = committedResource ? this.agentSessionsService.model.getSession(committedResource) : undefined;
				if (committedSession) {
					this.setActiveSession(committedSession);
				}
			} else {
				this.showNextSession();
			}
			return;
		}

		this.setActiveSession(agentSession);
	}

	private showNextSession(): void {
		const sessions = this.agentSessionsService.model.sessions
			.filter(s => !s.isArchived())
			.sort((a, b) => (b.timing.lastRequestEnded ?? b.timing.created) - (a.timing.lastRequestEnded ?? a.timing.created));

		if (sessions.length > 0) {
			this.setActiveSession(sessions[0]);
			this.instantiationService.invokeFunction(openSessionDefault, sessions[0]);
		} else {
			this.openNewSessionView();
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
		} else if (this._newSession.value && this.uriIdentityService.extUri.isEqual(sessionResource, this._newSession.value.resource)) {
			await this.openNewSession(this._newSession.value);
		}
	}

	async createNewSessionForTarget(target: AgentSessionProviders, sessionResource: URI, defaultRepoUri?: URI): Promise<INewSession> {
		if (!this.isNewChatSessionContext.get()) {
			this.isNewChatSessionContext.set(true);
		}

		let newSession: INewSession;
		if (target === AgentSessionProviders.Background || target === AgentSessionProviders.Local) {
			newSession = this.instantiationService.createInstance(LocalNewSession, sessionResource, defaultRepoUri);
		} else {
			newSession = this.instantiationService.createInstance(RemoteNewSession, sessionResource, target);
		}
		this._newSession.value = newSession;
		this.setActiveSession(newSession);
		return newSession;
	}

	/**
	 * Open an existing agent session - set it as active and reveal it.
	 */
	private async openExistingSession(session: IAgentSession, openOptions?: ISessionOpenOptions): Promise<void> {
		this.setActiveSession(session);
		await this.instantiationService.invokeFunction(openSessionDefault, session, openOptions);
	}

	/**
	 * Open a new remote session - load the model first, then show it in the ChatViewPane.
	 */
	private async openNewSession(newSession: INewSession): Promise<void> {
		this.setActiveSession(newSession);
		const sessionResource = newSession.resource;
		const chatWidget = await this.chatWidgetService.openSession(sessionResource, ChatViewPaneTarget);
		if (!chatWidget?.viewModel) {
			this.logService.warn(`[ActiveSessionService] Failed to open session: ${sessionResource.toString()}`);
			return;
		}
		const repository = this.getRepositoryFromSessionOption(sessionResource);
		this.logService.info(`[ActiveSessionService] Active session changed (new): ${sessionResource.toString()}, repository: ${repository?.toString() ?? 'none'}`);
	}

	async sendRequestForNewSession(sessionResource: URI, options?: { openNewSessionView?: boolean }): Promise<void> {
		const session = this._newSession.value;
		if (!session) {
			this.logService.error(`[SessionsManagementService] No new session found for resource: ${sessionResource.toString()}`);
			return;
		}

		if (!this.uriIdentityService.extUri.isEqual(sessionResource, session.resource)) {
			this.logService.error(`[SessionsManagementService] Session resource mismatch. Expected: ${session.resource.toString()}, received: ${sessionResource.toString()}`);
			return;
		}

		const query = session.query;
		if (!query) {
			this.logService.error('[SessionsManagementService] No query set on session');
			return;
		}

		const contribution = this.chatSessionsService.getChatSessionContribution(session.target);
		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: session.modelId,
			modeInfo: {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				modeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
			},
			agentIdSilent: contribution?.type,
			attachedContext: session.attachedContext,
		};

		await this.chatSessionsService.getOrCreateChatSession(session.resource, CancellationToken.None);
		await this.doSendRequestForNewSession(session, query, sendOptions, session.selectedOptions, options?.openNewSessionView);

		// Clean up the session after sending (setter disposes the previous value)
		this._newSession.value = undefined;
	}

	private async doSendRequestForNewSession(session: INewSession, query: string, sendOptions: IChatSendRequestOptions, selectedOptions?: ReadonlyMap<string, IChatSessionProviderOptionItem>, openNewSessionView?: boolean): Promise<void> {
		// 1. Open the session - loads the model and shows the ChatViewPane
		await this.openSession(session.resource);
		if (openNewSessionView) {
			this.openNewSessionView();
		}

		// 2. Apply selected model and options to the session
		const modelRef = this.chatService.acquireExistingSession(session.resource);
		if (modelRef) {
			const model = modelRef.object;

			// Set the selected model on the input model so the model picker reflects it
			if (session.modelId) {
				const languageModel = this.languageModelsService.lookupLanguageModel(session.modelId);
				if (languageModel) {
					model.inputModel.setState({
						selectedModel: { identifier: session.modelId, metadata: languageModel }
					});
				}
			}

			// Apply selected options (repository, branch, etc.) to the contributed session
			if (selectedOptions && selectedOptions.size > 0) {
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
			}
			modelRef.dispose();
		}

		// 3. Send the request
		const existingResources = new Set(
			this.agentSessionsService.model.sessions.map(s => s.resource.toString())
		);
		const result = await this.chatService.sendRequest(session.resource, query, sendOptions);
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

		if (newSession && !openNewSessionView) {
			this.setActiveSession(newSession);
		}
	}

	openNewSessionView(): void {
		// No-op if the current session is already a new session
		if (this.isNewChatSessionContext.get()) {
			return;
		}
		this.isNewChatSessionContext.set(true);
		this.setActiveSession(undefined);
	}

	private setActiveSession(session: IAgentSession | INewSession | undefined): void {
		this._activeSessionDisposables.clear();
		let activeSessionItem: IActiveSessionItem | undefined;
		if (session) {
			if (isAgentSession(session)) {
				this.lastSelectedSession = session.resource;
				const [repository, worktree] = this.getRepositoryFromMetadata(session.metadata);
				activeSessionItem = {
					isUntitled: this.chatService.getSession(session.resource)?.contributedChatSession?.isUntitled ?? true,
					label: session.label,
					resource: session.resource,
					repository,
					worktree,
					providerType: session.providerType,
				};
			} else {
				activeSessionItem = {
					isUntitled: true,
					label: undefined,
					resource: session.resource,
					repository: session.repoUri,
					worktree: undefined,
					providerType: session.target,
				};
				this._activeSessionDisposables.add(session.onDidChange(e => {
					if (e === 'repoUri') {
						this.doSetActiveSession({
							isUntitled: true,
							label: undefined,
							resource: session.resource,
							repository: session.repoUri,
							worktree: undefined,
							providerType: session.target,
						});
					}
				}));
			}
		}

		this.doSetActiveSession(activeSessionItem);
	}

	private doSetActiveSession(activeSessionItem: IActiveSessionItem | undefined): void {
		if (equals(this._activeSession.get(), activeSessionItem)) {
			return;
		}

		if (activeSessionItem) {
			this.logService.info(`[ActiveSessionService] Active session changed: ${activeSessionItem.resource.toString()}, repository: ${activeSessionItem.repository?.toString() ?? 'none'}`);
		} else {
			this.logService.trace('[ActiveSessionService] Active session cleared');
		}

		const currentRepo = this.workspaceContextService.getWorkspace().folders[0]?.uri;
		const activeSessionRepo = activeSessionItem?.providerType === AgentSessionProviders.Background ? activeSessionItem?.worktree ?? activeSessionItem?.repository : undefined;
		if (activeSessionRepo) {
			if (currentRepo) {
				if (!this.uriIdentityService.extUri.isEqual(currentRepo, activeSessionRepo)) {
					this.workspaceEditingService.updateFolders(0, 1, [{ uri: activeSessionRepo }], true);
				}
			} else {
				this.workspaceEditingService.addFolders([{ uri: activeSessionRepo }], true);
			}
		} else {
			this.workspaceEditingService.removeFolders([currentRepo], true);
		}
		this._activeSession.set(activeSessionItem, undefined);
	}

	async commitWorktreeFiles(session: IActiveSessionItem, fileUris: URI[]): Promise<void> {
		const worktreeUri = session.worktree;
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
