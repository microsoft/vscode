/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, autorun, observableValue, transaction } from '../../../../base/common/observable.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
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
import { AgentSessionProviders, AgentSessionTarget } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatSessionStatus, IChatSessionFileChange, IChatSessionsService, IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionData, ISessionRepository, ISessionWorkspace, SessionStatus } from '../common/sessionData.js';
import { ChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import { SessionWorkspace, GITHUB_REMOTE_FILE_SCHEME } from '../common/sessionWorkspace.js';
import { ISessionsBrowseAction, ISessionsChangeEvent, ISessionsProvider, ISessionType } from './sessionsProvider.js';
import { INewSessionPickerVisibility, ISessionOptionGroup, NewSessionChangeType } from '../../chat/browser/newSession.js';
import { IsolationMode, IsolationPicker } from '../../chat/browser/sessionTargetPicker.js';
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
import { ISessionsManagementService, IsActiveSessionBackgroundProviderContext, IsNewChatSessionContext, SessionWorkspaceHasRepositoryContext } from './sessionsManagementService.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { BranchPicker } from '../../chat/browser/branchPicker.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatMode } from '../../../../workbench/contrib/chat/common/chatModes.js';

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

const REPOSITORY_OPTION_ID = 'repository';
const BRANCH_OPTION_ID = 'branch';
const ISOLATION_OPTION_ID = 'isolation';
const AGENT_OPTION_ID = 'agent';

/**
 * Provider-specific observable fields on new Copilot sessions.
 * Used by pickers and contributions that need to read/write provider-internal state.
 */
export interface ICopilotNewSessionData extends ISessionData {
	readonly permissionLevel: IObservable<ChatPermissionLevel>;
	readonly branchObservable: IObservable<string | undefined>;
	readonly isolationModeObservable: IObservable<string | undefined>;
	readonly hasGitRepo: IObservable<boolean>;
}

/**
 * Local new session for Background agent sessions.
 * Implements {@link ISessionData} (session facade) and provides
 * pre-send configuration methods for the new-session flow.
 */
export class CopilotCLISession extends Disposable implements ISessionData {

	// -- ISessionData fields --

	readonly sessionId: string;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;

	private readonly _title = observableValue(this, '');
	readonly title: IObservable<string> = this._title;

	private readonly _updatedAt = observableValue(this, new Date());
	readonly updatedAt: IObservable<Date> = this._updatedAt;

	private readonly _status = observableValue(this, SessionStatus.Untitled);
	readonly status: IObservable<SessionStatus> = this._status;

	private readonly _permissionLevel = observableValue(this, ChatPermissionLevel.Default);
	readonly permissionLevel: IObservable<ChatPermissionLevel> = this._permissionLevel;

	private readonly _workspaceData = observableValue<ISessionWorkspace | undefined>(this, undefined);
	readonly workspace: IObservable<ISessionWorkspace | undefined> = this._workspaceData;

	private readonly _branchObservable = observableValue<string | undefined>(this, undefined);
	readonly branchObservable: IObservable<string | undefined> = this._branchObservable;

	private readonly _isolationModeObservable = observableValue<string | undefined>(this, undefined);
	readonly isolationModeObservable: IObservable<string | undefined> = this._isolationModeObservable;

	readonly changes: IObservable<readonly IChatSessionFileChange[]> = observableValue<readonly IChatSessionFileChange[]>(this, []);

	readonly _hasGitRepo = observableValue(this, false);
	readonly hasGitRepo: IObservable<boolean> = this._hasGitRepo;

	// -- New session configuration fields --

	private _repoUri: URI | undefined;
	private _project: SessionWorkspace | undefined;
	private _isolationMode: IsolationMode;
	private _branch: string | undefined;
	private _modelId: string | undefined;
	private _mode: IChatMode | undefined;
	private _query: string | undefined;
	private _attachedContext: IChatRequestVariableEntry[] | undefined;

	private readonly _onDidChange = this._register(new Emitter<NewSessionChangeType>());
	readonly onDidChange: Event<NewSessionChangeType> = this._onDidChange.event;

	readonly target = AgentSessionProviders.Background;
	readonly selectedOptions = new Map<string, IChatSessionProviderOptionItem>();
	readonly pickerVisibility: INewSessionPickerVisibility = {
		localModel: true,
		mode: true,
		permission: true,
	};

	get project(): SessionWorkspace | undefined { return this._project; }
	get isolationMode(): IsolationMode { return this._isolationMode; }
	get branch(): string | undefined { return this._branch; }
	get modelId(): string | undefined { return this._modelId; }
	get mode(): IChatMode | undefined { return this._mode; }
	get query(): string | undefined { return this._query; }
	get attachedContext(): IChatRequestVariableEntry[] | undefined { return this._attachedContext; }
	get disabled(): boolean {
		if (!this._repoUri) {
			return true;
		}
		if (this._isolationMode === 'worktree' && !this._branch) {
			return true;
		}
		return false;
	}

	constructor(
		readonly resource: URI,
		defaultRepoUri: URI | undefined,
		providerId: string,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IGitService private readonly gitService: IGitService,
	) {
		super();
		this.sessionId = `${providerId}:${resource.toString()}`;
		this.providerId = providerId;
		this.sessionType = AgentSessionProviders.Background;
		this.icon = Codicon.copilot;
		this.createdAt = new Date();

		if (defaultRepoUri) {
			this._repoUri = defaultRepoUri;
			this.setOption(REPOSITORY_OPTION_ID, defaultRepoUri.fsPath);
		}
		this._isolationMode = 'worktree';
		this.setOption(ISOLATION_OPTION_ID, 'worktree');
	}

	// -- ISessionData option routing --

	setSessionDataOption(key: string, value: unknown): void {
		switch (key) {
			case 'branch':
				this._branchObservable.set(value as string | undefined, undefined);
				this.setBranch(value as string | undefined);
				break;
			case 'modelId':
				this.setModelId(value as string | undefined);
				break;
			case 'mode':
				this.setMode(value as IChatMode | undefined);
				break;
			case 'isolationMode':
				this._isolationModeObservable.set(value as string | undefined, undefined);
				this.setIsolationMode(value as IsolationMode);
				break;
			case 'project':
				this.setProject(value as SessionWorkspace);
				break;
			case 'permissionLevel':
				this._permissionLevel.set(value as ChatPermissionLevel, undefined);
				break;
		}
	}

	// -- New session configuration methods --

	setProject(project: SessionWorkspace): void {
		this._project = project;
		this._repoUri = project.uri;
		this.setIsolationMode('worktree');
		this._branch = undefined;
		this._onDidChange.fire('repoUri');
		this._onDidChange.fire('disabled');
		this.setOption(REPOSITORY_OPTION_ID, project.uri.fsPath);

		// Update ISessionData workspace observable
		this._workspaceData.set({
			label: project.uri.fsPath.split('/').pop() || project.uri.fsPath,
			icon: Codicon.folder,
			repositories: [{
				uri: project.uri,
				workingDirectory: undefined,
				detail: undefined,
				baseBranchProtected: undefined,
			}],
		}, undefined);

		// Resolve git repository
		if (project.isFolder) {
			this._resolveGitRepository(project);
		}
	}

	private async _resolveGitRepository(workspace: SessionWorkspace): Promise<void> {
		try {
			const repository = await this.gitService.openRepository(workspace.uri);
			if (this._project === workspace) {
				this._project = workspace.withRepository(repository);
			}
			this._hasGitRepo.set(!!repository, undefined);
		} catch {
			this._hasGitRepo.set(false, undefined);
		}
	}

	setIsolationMode(mode: IsolationMode): void {
		if (this._isolationMode !== mode) {
			this._isolationMode = mode;
			this._onDidChange.fire('isolationMode');
			this._onDidChange.fire('disabled');
			this.setOption(ISOLATION_OPTION_ID, mode);
		}
	}

	setBranch(branch: string | undefined): void {
		if (this._branch !== branch) {
			this._branch = branch;
			this._onDidChange.fire('branch');
			this._onDidChange.fire('disabled');
			this.setOption(BRANCH_OPTION_ID, branch ?? '');
		}
	}

	setModelId(modelId: string | undefined): void {
		this._modelId = modelId;
	}

	setMode(mode: IChatMode | undefined): void {
		if (this._mode?.id !== mode?.id) {
			this._mode = mode;
			this._onDidChange.fire('agent');
			const modeName = mode?.isBuiltin ? undefined : mode?.name.get();
			this.setOption(AGENT_OPTION_ID, modeName ?? '');
		}
	}

	setQuery(query: string): void {
		this._query = query;
	}

	setAttachedContext(context: IChatRequestVariableEntry[] | undefined): void {
		this._attachedContext = context;
	}

	setOption(optionId: string, value: IChatSessionProviderOptionItem | string): void {
		if (typeof value === 'string') {
			this.selectedOptions.set(optionId, { id: value, name: value });
		} else {
			this.selectedOptions.set(optionId, value);
		}
		this.chatSessionsService.setSessionOption(this.resource, optionId, value);
	}
}

function isModelOptionGroup(group: IChatSessionProviderOptionGroup): boolean {
	if (group.id === 'models') {
		return true;
	}
	const nameLower = group.name.toLowerCase();
	return nameLower === 'model' || nameLower === 'models';
}

function isRepositoriesOptionGroup(group: IChatSessionProviderOptionGroup): boolean {
	return group.id === 'repositories';
}

/**
 * Remote new session for Cloud agent sessions.
 * Implements {@link ISessionData} (session facade) and provides
 * pre-send configuration methods for the new-session flow.
 */
export class RemoteNewSession extends Disposable implements ISessionData {

	// -- ISessionData fields --

	readonly sessionId: string;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;

	private readonly _title = observableValue(this, '');
	readonly title: IObservable<string> = this._title;

	private readonly _updatedAt = observableValue(this, new Date());
	readonly updatedAt: IObservable<Date> = this._updatedAt;

	private readonly _status = observableValue(this, SessionStatus.Untitled);
	readonly status: IObservable<SessionStatus> = this._status;

	private readonly _permissionLevel = observableValue(this, ChatPermissionLevel.Default);
	readonly permissionLevel: IObservable<ChatPermissionLevel> = this._permissionLevel;

	private readonly _workspaceData = observableValue<ISessionWorkspace | undefined>(this, undefined);
	readonly workspace: IObservable<ISessionWorkspace | undefined> = this._workspaceData;

	readonly changes: IObservable<readonly IChatSessionFileChange[]> = observableValue<readonly IChatSessionFileChange[]>(this, []);

	readonly _hasGitRepo = observableValue(this, false);
	readonly hasGitRepo: IObservable<boolean> = this._hasGitRepo;

	// -- New session configuration fields --

	private _repoUri: URI | undefined;
	private _project: SessionWorkspace | undefined;
	private _modelId: string | undefined;
	private _query: string | undefined;
	private _attachedContext: IChatRequestVariableEntry[] | undefined;

	private readonly _onDidChange = this._register(new Emitter<NewSessionChangeType>());
	readonly onDidChange: Event<NewSessionChangeType> = this._onDidChange.event;

	private readonly _onDidChangeOptionGroups = this._register(new Emitter<void>());
	readonly onDidChangeOptionGroups: Event<void> = this._onDidChangeOptionGroups.event;

	readonly selectedOptions = new Map<string, IChatSessionProviderOptionItem>();
	readonly pickerVisibility: INewSessionPickerVisibility = {
		cloudModel: true,
		hasToolbarOptionGroups: true,
	};

	get project(): SessionWorkspace | undefined { return this._project; }
	get isolationMode(): undefined { return undefined; }
	get branch(): string | undefined { return undefined; }
	get modelId(): string | undefined { return this._modelId; }
	get mode(): IChatMode | undefined { return undefined; }
	get query(): string | undefined { return this._query; }
	get attachedContext(): IChatRequestVariableEntry[] | undefined { return this._attachedContext; }
	get disabled(): boolean {
		return !this._repoUri && !this.selectedOptions.has('repositories');
	}

	private readonly _whenClauseKeys = new Set<string>();

	constructor(
		readonly resource: URI,
		readonly target: AgentSessionTarget,
		providerId: string,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
		this.sessionId = `${providerId}:${resource.toString()}`;
		this.providerId = providerId;
		this.sessionType = target;
		this.icon = Codicon.copilot;
		this.createdAt = new Date();

		this._updateWhenClauseKeys();

		this._register(this.chatSessionsService.onDidChangeOptionGroups(() => {
			this._updateWhenClauseKeys();
			this._onDidChangeOptionGroups.fire();
			this._onDidChange.fire('options');
		}));
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (this._whenClauseKeys.size > 0 && e.affectsSome(this._whenClauseKeys)) {
				this._onDidChangeOptionGroups.fire();
			}
		}));
	}

	// -- ISessionData option routing --

	setSessionDataOption(key: string, value: unknown): void {
		switch (key) {
			case 'modelId':
				this.setModelId(value as string | undefined);
				break;
			case 'mode':
				this.setMode(value as IChatMode | undefined);
				break;
			case 'project':
				this.setProject(value as SessionWorkspace);
				break;
			case 'permissionLevel':
				this._permissionLevel.set(value as ChatPermissionLevel, undefined);
				break;
		}
	}

	// -- New session configuration methods --

	setProject(project: SessionWorkspace): void {
		this._project = project;
		this._repoUri = project.uri;
		this._onDidChange.fire('repoUri');
		this._onDidChange.fire('disabled');
		const id = project.uri.path.substring(1);
		this.setOption('repositories', { id, name: id });
	}

	setIsolationMode(_mode: IsolationMode): void {
		// No-op for remote sessions
	}

	setBranch(_branch: string | undefined): void {
		// No-op for remote sessions
	}

	setModelId(modelId: string | undefined): void {
		this._modelId = modelId;
	}

	setMode(_mode: IChatMode | undefined): void {
		// Intentionally a no-op: remote sessions do not support client-side mode selection.
	}

	setQuery(query: string): void {
		this._query = query;
	}

	setAttachedContext(context: IChatRequestVariableEntry[] | undefined): void {
		this._attachedContext = context;
	}

	setOption(optionId: string, value: IChatSessionProviderOptionItem | string): void {
		if (typeof value !== 'string') {
			this.selectedOptions.set(optionId, value);
		}
		this._onDidChange.fire('options');
		this._onDidChange.fire('disabled');
		this.chatSessionsService.setSessionOption(this.resource, optionId, value);
	}

	// --- Option group accessors ---

	getModelOptionGroup(): ISessionOptionGroup | undefined {
		const groups = this._getOptionGroups();
		if (!groups) {
			return undefined;
		}
		const group = groups.find(g => isModelOptionGroup(g));
		if (!group) {
			return undefined;
		}
		return { group, value: this._getValueForGroup(group) };
	}

	getOtherOptionGroups(): ISessionOptionGroup[] {
		const groups = this._getOptionGroups();
		if (!groups) {
			return [];
		}
		return groups
			.filter(g => !isModelOptionGroup(g) && !isRepositoriesOptionGroup(g) && this._isOptionGroupVisible(g))
			.map(g => ({ group: g, value: this._getValueForGroup(g) }));
	}

	getOptionValue(groupId: string): IChatSessionProviderOptionItem | undefined {
		return this.selectedOptions.get(groupId);
	}

	setOptionValue(groupId: string, value: IChatSessionProviderOptionItem): void {
		this.setOption(groupId, value);
	}

	// --- Internals ---

	private _getOptionGroups(): IChatSessionProviderOptionGroup[] | undefined {
		return this.chatSessionsService.getOptionGroupsForSessionType(this.target);
	}

	private _isOptionGroupVisible(group: IChatSessionProviderOptionGroup): boolean {
		if (!group.when) {
			return true;
		}
		const expr = ContextKeyExpr.deserialize(group.when);
		return !expr || this.contextKeyService.contextMatchesRules(expr);
	}

	private _updateWhenClauseKeys(): void {
		this._whenClauseKeys.clear();
		const groups = this._getOptionGroups();
		if (!groups) {
			return;
		}
		for (const group of groups) {
			if (group.when) {
				const expr = ContextKeyExpr.deserialize(group.when);
				if (expr) {
					for (const key of expr.keys()) {
						this._whenClauseKeys.add(key);
					}
				}
			}
		}
	}

	private _getValueForGroup(group: IChatSessionProviderOptionGroup): IChatSessionProviderOptionItem | undefined {
		const selected = this.selectedOptions.get(group.id);
		if (selected) {
			return selected;
		}
		// Check for extension-set session option
		const sessionOption = this.chatSessionsService.getSessionOption(this.resource, group.id);
		if (sessionOption && typeof sessionOption !== 'string') {
			return sessionOption;
		}
		if (typeof sessionOption === 'string') {
			const item = group.items.find(i => i.id === sessionOption.trim());
			if (item) {
				return item;
			}
		}
		// Default to first item marked as default, or first item
		return group.items.find(i => i.default === true) ?? group.items[0];
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
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
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

	private _currentNewSession: (CopilotCLISession | RemoteNewSession) | undefined;

	createNewSession(type: ISessionType, resource: URI, workspace?: SessionWorkspace): ISessionData {
		if (type.id === AgentSessionProviders.Background) {
			const session = this.instantiationService.createInstance(CopilotCLISession, resource, workspace?.uri, this.id);
			this._currentNewSession = session;
			return session;
		}

		const session = this.instantiationService.createInstance(RemoteNewSession, resource, type.id, this.id);
		this._currentNewSession = session;
		return session;
	}

	// ── Session Configuration ──

	setSessionOption(sessionId: string, key: string, value: unknown): void {
		// Route to the current new session if it matches
		if (this._currentNewSession?.sessionId === sessionId) {
			this._currentNewSession.setSessionDataOption(key, value);
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

class DefaultCopilotActiveSessionContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.defaultCopilotActiveSession';

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const hasRepositoryKey = SessionWorkspaceHasRepositoryContext.bindTo(contextKeyService);

		this._register(autorun(reader => {
			const session = sessionsManagementService.activeSessionData.read(reader);
			if (session?.providerId === 'default-copilot') {
				// Read hasGitRepo from the session (CopilotCLISession or RemoteNewSession)
				const hasGitRepo = (session as ICopilotNewSessionData).hasGitRepo?.read?.(reader) ?? false;
				hasRepositoryKey.set(hasGitRepo);
			} else {
				hasRepositoryKey.set(false);
			}
		}));
	}
}

registerWorkbenchContribution2(DefaultCopilotActiveSessionContribution.ID, DefaultCopilotActiveSessionContribution, WorkbenchPhase.AfterRestored);
