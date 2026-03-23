/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, autorun, observableValue, transaction } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IAgentSession } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatSessionStatus, IChatSessionFileChange } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionData, ISessionRepository, ISessionWorkspace, SessionStatus } from '../common/sessionData.js';
import { ChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import { SessionWorkspace, GITHUB_REMOTE_FILE_SCHEME } from '../common/sessionWorkspace.js';
import { ISessionsBrowseAction, ISessionsChangeEvent, ISessionsProvider, ISessionType } from './sessionsProvider.js';
import { INewSession, INewSessionPickerVisibility, CopilotCLISession, RemoteNewSession } from '../../chat/browser/newSession.js';
import { CloudModelPicker } from '../../chat/browser/modelPicker.js';
import { NewChatPermissionPicker } from '../../chat/browser/newChatPermissionPicker.js';
import { ModePicker } from '../../chat/browser/modePicker.js';
import { EnhancedModelPickerActionItem } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem2.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IModelPickerDelegate } from '../../../../workbench/contrib/chat/browser/widget/input/modelPickerActionItem.js';
import { IChatInputPickerOptions } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { Menus } from '../../../browser/menus.js';
import { IsActiveSessionBackgroundProviderContext, IsNewChatSessionContext, ISessionsManagementService } from './sessionsManagementService.js';
import { IContextKeyService, RawContextKey, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IsolationPicker } from '../../chat/browser/sessionTargetPicker.js';
import { BranchPicker } from '../../chat/browser/branchPicker.js';

const OPEN_REPO_COMMAND = 'github.copilot.chat.cloudSessions.openRepository';

const STORAGE_KEY_RECENT_PROJECTS = 'sessions.recentlyPickedProjects';

interface IStoredProject {
	readonly uri: UriComponents;
	readonly checked?: boolean;
	readonly remoteName?: string;
}

const CopilotCLISessionType: ISessionType = {
	id: AgentSessionProviders.Background,
	label: 'Copilot CLI',
	icon: Codicon.terminal,
};

const CopilotCloudSessionType: ISessionType = {
	id: AgentSessionProviders.Cloud,
	label: 'Cloud',
	icon: Codicon.cloud,
};

// ── Context Keys ──

export const SessionWorkspaceHasRepositoryContext = new RawContextKey<boolean>('sessionWorkspaceHasRepository', false);

// ── Static Menu Registrations ──

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.isolationPicker',
			title: localize2('isolationPicker', "Isolation Mode"),
			f1: false,
			menu: [{
				id: Menus.NewSessionRepositoryConfig,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(
					IsActiveSessionBackgroundProviderContext,
					SessionWorkspaceHasRepositoryContext,
					ContextKeyExpr.equals('config.github.copilot.chat.cli.isolationOption.enabled', true),
				),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.branchPicker',
			title: localize2('branchPicker', "Branch"),
			f1: false,
			menu: [{
				id: Menus.NewSessionRepositoryConfig,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(
					IsActiveSessionBackgroundProviderContext,
					SessionWorkspaceHasRepositoryContext,
				),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.modePicker',
			title: localize2('modePicker', "Mode"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 0,
				when: IsActiveSessionBackgroundProviderContext,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.localModelPicker',
			title: localize2('localModelPicker', "Model"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 1,
				when: IsActiveSessionBackgroundProviderContext,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.cloudModelPicker',
			title: localize2('cloudModelPicker', "Model"),
			f1: false,
			menu: [{
				id: Menus.NewSessionConfig,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(IsNewChatSessionContext, IsActiveSessionBackgroundProviderContext.negate()),
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.defaultCopilot.permissionPicker',
			title: localize2('permissionPicker', "Permissions"),
			f1: false,
			menu: [{
				id: Menus.NewSessionControl,
				group: 'navigation',
				order: 1,
				when: IsActiveSessionBackgroundProviderContext,
			}],
		});
	}
	override async run(): Promise<void> { /* handled by action view item */ }
});

/**
 * Wraps a standalone picker widget (like IsolationPicker, BranchPicker) as a
 * {@link BaseActionViewItem} so it can be rendered by a {@link MenuWorkbenchToolBar}.
 */
class PickerActionViewItem extends BaseActionViewItem {
	constructor(private readonly picker: { render(container: HTMLElement): void; dispose(): void }) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
	}

	override render(container: HTMLElement): void {
		this.picker.render(container);
	}

	override dispose(): void {
		this.picker.dispose();
		super.dispose();
	}
}

/**
 * Adapts an {@link INewSession} (pre-send configuration) into the {@link ISessionData} facade.
 * The provider holds the `INewSession` internally and routes `setSessionOption()` to it.
 */
class NewSessionDataAdapter implements ISessionData {

	readonly sessionId: string;
	readonly resource: URI;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;
	readonly pickerVisibility: INewSessionPickerVisibility;

	private readonly _title: ReturnType<typeof observableValue<string>>;
	readonly title: IObservable<string>;

	private readonly _updatedAt: ReturnType<typeof observableValue<Date>>;
	readonly updatedAt: IObservable<Date>;

	private readonly _status: ReturnType<typeof observableValue<SessionStatus>>;
	readonly status: IObservable<SessionStatus>;

	private readonly _permissionLevel: ReturnType<typeof observableValue<ChatPermissionLevel>>;
	readonly permissionLevel: IObservable<ChatPermissionLevel>;

	private readonly _workspace: ReturnType<typeof observableValue<ISessionWorkspace | undefined>>;
	readonly workspace: IObservable<ISessionWorkspace | undefined>;

	private readonly _branch: ReturnType<typeof observableValue<string | undefined>>;
	readonly branch: IObservable<string | undefined>;

	private readonly _isolationMode: ReturnType<typeof observableValue<string | undefined>>;
	readonly isolationMode: IObservable<string | undefined>;

	readonly changes: IObservable<readonly IChatSessionFileChange[]>;

	/** The underlying new session object — internal to the provider. */
	readonly _newSession: INewSession;

	constructor(
		newSession: INewSession,
		providerId: string,
	) {
		this._newSession = newSession;
		this.sessionId = `${providerId}:${newSession.resource.toString()}`;
		this.resource = newSession.resource;
		this.providerId = providerId;
		this.sessionType = newSession.target;
		this.icon = Codicon.copilot;
		this.createdAt = new Date();
		this.pickerVisibility = newSession.pickerVisibility;

		this._title = observableValue(this, '');
		this.title = this._title;
		this._updatedAt = observableValue(this, new Date());
		this.updatedAt = this._updatedAt;
		this._status = observableValue(this, SessionStatus.Untitled);
		this.status = this._status;
		this._permissionLevel = observableValue(this, ChatPermissionLevel.Default);
		this.permissionLevel = this._permissionLevel;
		this._workspace = observableValue<ISessionWorkspace | undefined>(this, undefined);
		this.workspace = this._workspace;
		this._branch = observableValue<string | undefined>(this, undefined);
		this.branch = this._branch;
		this._isolationMode = observableValue<string | undefined>(this, undefined);
		this.isolationMode = this._isolationMode;
		this.changes = observableValue<readonly IChatSessionFileChange[]>(this, []);
	}

	/**
	 * Routes a configuration option to the underlying {@link INewSession}.
	 */
	setOption(key: string, value: unknown): void {
		switch (key) {
			case 'branch':
				this._branch.set(value as string | undefined, undefined);
				this._newSession.setBranch(value as string | undefined);
				break;
			case 'modelId':
				this._newSession.setModelId(value as string | undefined);
				break;
			case 'mode':
				this._newSession.setMode(value as any);
				break;
			case 'isolationMode':
				this._isolationMode.set(value as string | undefined, undefined);
				this._newSession.setIsolationMode(value as any);
				break;
			case 'project':
				this._newSession.setProject(value as SessionWorkspace);
				break;
			case 'permissionLevel':
				this._permissionLevel.set(value as ChatPermissionLevel, undefined);
				break;
		}
	}
}

/**
 * Maps the existing {@link ChatSessionStatus} to the new {@link SessionStatus}.
 */
function toSessionStatus(status: ChatSessionStatus): SessionStatus {
	switch (status) {
		case ChatSessionStatus.InProgress:
		case ChatSessionStatus.NeedsInput:
			return SessionStatus.InProgress;
		case ChatSessionStatus.Completed:
			return SessionStatus.Completed;
		case ChatSessionStatus.Failed:
			return SessionStatus.Error;
	}
}

/**
 * Adapts an existing {@link IAgentSession} from the chat layer into the new {@link ISessionData} facade.
 */
class AgentSessionAdapter implements ISessionData {

	readonly sessionId: string;
	readonly resource: URI;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;
	readonly pickerVisibility: INewSessionPickerVisibility = {};

	private readonly _workspace: ReturnType<typeof observableValue<ISessionWorkspace | undefined>>;
	readonly workspace: IObservable<ISessionWorkspace | undefined>;

	private readonly _title: ReturnType<typeof observableValue<string>>;
	readonly title: IObservable<string>;

	private readonly _updatedAt: ReturnType<typeof observableValue<Date>>;
	readonly updatedAt: IObservable<Date>;

	private readonly _status: ReturnType<typeof observableValue<SessionStatus>>;
	readonly status: IObservable<SessionStatus>;

	private readonly _changes: ReturnType<typeof observableValue<readonly IChatSessionFileChange[]>>;
	readonly changes: IObservable<readonly IChatSessionFileChange[]>;

	constructor(
		session: IAgentSession,
		providerId: string,
	) {
		this.sessionId = `${providerId}:${session.resource.toString()}`;
		this.resource = session.resource;
		this.providerId = providerId;
		this.sessionType = session.providerType;
		this.icon = session.icon;
		this.createdAt = new Date(session.timing.created);
		this._workspace = observableValue(this, this._buildWorkspace(session));
		this.workspace = this._workspace;

		this._title = observableValue(this, session.label);
		this.title = this._title;

		const updatedTime = session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created;
		this._updatedAt = observableValue(this, new Date(updatedTime));
		this.updatedAt = this._updatedAt;

		this._status = observableValue(this, toSessionStatus(session.status));
		this.status = this._status;

		this._changes = observableValue<readonly IChatSessionFileChange[]>(this, this._extractChanges(session));
		this.changes = this._changes;
	}

	/**
	 * Update reactive properties from a refreshed agent session.
	 */
	update(session: IAgentSession): void {
		transaction(tx => {
			this._title.set(session.label, tx);
			const updatedTime = session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created;
			this._updatedAt.set(new Date(updatedTime), tx);
			this._status.set(toSessionStatus(session.status), tx);
			this._changes.set(this._extractChanges(session), tx);
		});
	}

	private _extractChanges(session: IAgentSession): readonly IChatSessionFileChange[] {
		if (!session.changes) {
			return [];
		}
		if (Array.isArray(session.changes)) {
			return session.changes as IChatSessionFileChange[];
		}
		// Summary object — no individual file changes available
		return [];
	}

	private _buildWorkspace(session: IAgentSession): ISessionWorkspace | undefined {
		const metadata = session.metadata as Record<string, unknown> | undefined;
		if (!metadata) {
			return undefined;
		}

		const repoUri = this._extractRepoUri(session);
		if (!repoUri) {
			return undefined;
		}

		const worktreeUri = metadata['worktree'] ? URI.parse(metadata['worktree'] as string) : undefined;
		const branchName = metadata['branchName'] as string | undefined;
		const baseBranchProtected = metadata['baseBranchProtected'] as boolean | undefined;

		const label = repoUri.scheme === GITHUB_REMOTE_FILE_SCHEME
			? this._repoLabelFromUri(repoUri)
			: repoUri.fsPath.split('/').pop() ?? repoUri.fsPath;

		const repository: ISessionRepository = {
			uri: repoUri,
			workingDirectory: worktreeUri,
			detail: branchName,
			baseBranchProtected,
		};

		return {
			label,
			icon: repoUri.scheme === GITHUB_REMOTE_FILE_SCHEME ? Codicon.repo : Codicon.folder,
			repositories: [repository],
		};
	}

	private _extractRepoUri(session: IAgentSession): URI | undefined {
		const metadata = session.metadata as Record<string, unknown> | undefined;
		if (!metadata) {
			return undefined;
		}
		if (session.providerType === AgentSessionProviders.Background) {
			const folder = metadata['folder'] as string | undefined;
			return folder ? URI.parse(folder) : undefined;
		}
		// Cloud sessions: look for repository in metadata
		const repo = metadata['repository'] as string | undefined;
		return repo ? URI.parse(repo) : undefined;
	}

	private _repoLabelFromUri(uri: URI): string {
		// github-remote-file://github/{owner}/{repo}/HEAD → "owner/repo"
		const parts = uri.path.split('/').filter(Boolean);
		if (parts.length >= 2) {
			return `${parts[0]}/${parts[1]}`;
		}
		return uri.path;
	}
}

/**
 * Default sessions provider for Copilot CLI and Cloud session types.
 * Wraps the existing session infrastructure into the extensible provider model.
 */
export class DefaultCopilotChatSessionsProvider extends Disposable implements ISessionsProvider {

	readonly id = 'default-copilot';
	readonly label = 'Copilot';
	readonly icon = Codicon.copilot;
	readonly sessionTypes: readonly ISessionType[] = [CopilotCLISessionType, CopilotCloudSessionType];

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionsChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionsChangeEvent> = this._onDidChangeSessions.event;

	/** Cache of adapted sessions, keyed by resource URI string. */
	private readonly _sessionCache = new Map<string, AgentSessionAdapter>();

	readonly browseActions: readonly ISessionsBrowseAction[];

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatService private readonly chatService: IChatService,
		@IStorageService private readonly storageService: IStorageService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IActionViewItemService private readonly actionViewItemService: IActionViewItemService,
		@IGitService private readonly gitService: IGitService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this.browseActions = [
			{
				label: 'Browse Folders...',
				icon: Codicon.folderOpened,
				providerId: this.id,
				execute: () => this._browseForFolder(),
			},
			{
				label: 'Browse Repositories...',
				icon: Codicon.repo,
				providerId: this.id,
				execute: () => this._browseForRepo(),
			},
		];

		// Forward session changes from the underlying model
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._refreshSessionCache();
		}));

		// Track whether the active session's workspace has a repository
		const hasRepoKey = SessionWorkspaceHasRepositoryContext.bindTo(this.contextKeyService);
		this._register(autorun(reader => {
			const session = this.sessionsManagementService.activeSessionData.read(reader);
			if (session) {
				const workspace = session.workspace.read(reader);
				hasRepoKey.set(!!(workspace?.repositories.length));
			} else {
				hasRepoKey.set(false);
			}
		}));

		// Register action view item factories for picker widgets
		this._register(this.actionViewItemService.register(
			Menus.NewSessionRepositoryConfig, 'sessions.defaultCopilot.isolationPicker',
			(_action, _options) => {
				const picker = this.instantiationService.createInstance(IsolationPicker);
				return new PickerActionViewItem(picker);
			},
		));
		this._register(this.actionViewItemService.register(
			Menus.NewSessionRepositoryConfig, 'sessions.defaultCopilot.branchPicker',
			(_action, _options) => {
				const picker = this.instantiationService.createInstance(BranchPicker);
				return new PickerActionViewItem(picker);
			},
		));
		this._register(this.actionViewItemService.register(
			Menus.NewSessionConfig, 'sessions.defaultCopilot.modePicker',
			(_action, _options) => {
				const picker = this.instantiationService.createInstance(ModePicker);
				return new PickerActionViewItem(picker);
			},
		));
		this._register(this.actionViewItemService.register(
			Menus.NewSessionConfig, 'sessions.defaultCopilot.localModelPicker',
			(_action, _options) => {
				const currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('currentModel', undefined);
				const delegate: IModelPickerDelegate = {
					currentModel,
					setModel: (model: ILanguageModelChatMetadataAndIdentifier) => {
						currentModel.set(model, undefined);
					},
					getModels: () => this._getAvailableModels(),
					useGroupedModelPicker: () => true,
					showManageModelsAction: () => false,
					showUnavailableFeatured: () => false,
					showFeatured: () => true,
				};
				const pickerOptions: IChatInputPickerOptions = {
					hideChevrons: observableValue('hideChevrons', false),
					hoverPosition: { hoverPosition: HoverPosition.ABOVE },
				};
				const action = { id: 'sessions.modelPicker', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } };
				const modelPicker = this.instantiationService.createInstance(EnhancedModelPickerActionItem, action, delegate, pickerOptions);

				// Initialize with first available model, or wait for models to load
				const initModel = () => {
					if (!currentModel.get()) {
						const models = this._getAvailableModels();
						if (models[0]) {
							currentModel.set(models[0], undefined);
						}
					}
				};
				initModel();
				this._register(this.languageModelsService.onDidChangeLanguageModels(() => initModel()));

				return modelPicker;
			},
		));
		this._register(this.actionViewItemService.register(
			Menus.NewSessionConfig, 'sessions.defaultCopilot.cloudModelPicker',
			(_action, _options) => {
				const picker = this.instantiationService.createInstance(CloudModelPicker);
				return new PickerActionViewItem(picker);
			},
		));
		this._register(this.actionViewItemService.register(
			Menus.NewSessionControl, 'sessions.defaultCopilot.permissionPicker',
			(_action, _options) => {
				const picker = this.instantiationService.createInstance(NewChatPermissionPicker);
				return new PickerActionViewItem(picker);
			},
		));
	}

	// ── Workspaces ──

	getWorkspaces(): SessionWorkspace[] {
		const stored = this._getRecentProjects();
		return stored.map(p => new SessionWorkspace(URI.revive(p.uri)));
	}

	canHandle(workspace: SessionWorkspace): boolean {
		return workspace.isFolder || workspace.isRepo;
	}

	// ── Sessions ──

	getSessions(): ISessionData[] {
		this._ensureSessionCache();
		return Array.from(this._sessionCache.values());
	}

	// ── Session Lifecycle ──

	private _currentNewSession: NewSessionDataAdapter | undefined;

	createNewSession(type: ISessionType, resource: URI, workspace?: SessionWorkspace): ISessionData {
		const newSession = type.id === AgentSessionProviders.Background
			? this.instantiationService.createInstance(CopilotCLISession, resource, workspace?.uri)
			: this.instantiationService.createInstance(RemoteNewSession, resource, type.id);

		const adapter = new NewSessionDataAdapter(newSession, this.id);
		this._currentNewSession = adapter;

		// For local sessions, resolve git repository and attach to project
		if (type.id === AgentSessionProviders.Background && workspace?.isFolder) {
			this._resolveGitRepository(newSession, workspace);
		}

		return adapter;
	}

	// ── Session Configuration ──

	setSessionOption(sessionId: string, key: string, value: unknown): void {
		// Route to the current new session if it matches
		if (this._currentNewSession?.sessionId === sessionId) {
			this._currentNewSession.setOption(key, value);
		}
	}

	/**
	 * Opens the git repository for a workspace folder and attaches it to the session's project.
	 * Pickers (branch, isolation) observe the session and react automatically.
	 */
	private async _resolveGitRepository(session: INewSession, workspace: SessionWorkspace): Promise<void> {
		try {
			const repository = await this.gitService.openRepository(workspace.uri);
			if (session.project) {
				session.setProject(session.project.withRepository(repository));
			}
		} catch {
			// No git repo at this path — pickers will handle the undefined case
		}
	}

	// ── Session Actions ──

	private _getAvailableModels(): ILanguageModelChatMetadataAndIdentifier[] {
		return this.languageModelsService.getLanguageModelIds()
			.map(id => {
				const metadata = this.languageModelsService.lookupLanguageModel(id);
				return metadata ? { metadata, identifier: id } : undefined;
			})
			.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m && m.metadata.targetChatSessionType === AgentSessionProviders.Background);
	}

	async archiveSession(sessionId: string): Promise<void> {
		const agentSession = this._findAgentSession(sessionId);
		if (agentSession) {
			agentSession.setArchived(true);
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		const agentSession = this._findAgentSession(sessionId);
		if (agentSession) {
			await this.chatService.removeHistoryEntry(agentSession.resource);
		}
	}

	async renameSession(sessionId: string, title: string): Promise<void> {
		const agentSession = this._findAgentSession(sessionId);
		if (agentSession) {
			this.chatService.setChatSessionTitle(agentSession.resource, title);
		}
	}

	// ── Private ──

	private async _browseForFolder(): Promise<SessionWorkspace | undefined> {
		const result = await this.fileDialogService.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
		});
		if (result?.length) {
			return new SessionWorkspace(result[0]);
		}
		return undefined;
	}

	private async _browseForRepo(): Promise<SessionWorkspace | undefined> {
		const repoId = await this.commandService.executeCommand<string>(OPEN_REPO_COMMAND);
		if (repoId) {
			const uri = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${repoId}/HEAD` });
			return new SessionWorkspace(uri);
		}
		return undefined;
	}

	private _getRecentProjects(): IStoredProject[] {
		const raw = this.storageService.get(STORAGE_KEY_RECENT_PROJECTS, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		try {
			return JSON.parse(raw) as IStoredProject[];
		} catch {
			return [];
		}
	}

	private _isOwnedSession(session: IAgentSession): boolean {
		return session.providerType === AgentSessionProviders.Background
			|| session.providerType === AgentSessionProviders.Cloud;
	}

	private _ensureSessionCache(): void {
		if (this._sessionCache.size > 0) {
			return;
		}
		this._refreshSessionCache();
	}

	private _refreshSessionCache(): void {
		const currentSessions = this.agentSessionsService.model.sessions.filter(s => this._isOwnedSession(s));
		const currentKeys = new Set<string>();
		const added: ISessionData[] = [];
		const changed: ISessionData[] = [];

		for (const session of currentSessions) {
			const key = session.resource.toString();
			currentKeys.add(key);

			const existing = this._sessionCache.get(key);
			if (existing) {
				existing.update(session);
				changed.push(existing);
			} else {
				const adapter = new AgentSessionAdapter(session, this.id);
				this._sessionCache.set(key, adapter);
				added.push(adapter);
			}
		}

		const removed: ISessionData[] = [];
		for (const [key, adapter] of this._sessionCache) {
			if (!currentKeys.has(key)) {
				this._sessionCache.delete(key);
				removed.push(adapter);
			}
		}

		if (added.length > 0 || removed.length > 0 || changed.length > 0) {
			this._onDidChangeSessions.fire({ added, removed, changed });
		}
	}

	private _findAgentSession(sessionId: string): IAgentSession | undefined {
		const adapter = this._sessionCache.get(this._localIdFromSessionId(sessionId));
		if (!adapter) {
			return undefined;
		}
		return this.agentSessionsService.getSession(adapter.resource);
	}

	private _localIdFromSessionId(sessionId: string): string {
		const prefix = `${this.id}:`;
		return sessionId.startsWith(prefix) ? sessionId.substring(prefix.length) : sessionId;
	}
}
