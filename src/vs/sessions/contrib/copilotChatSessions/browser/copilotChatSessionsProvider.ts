/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { themeColorFromId, ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAgentSession } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { getRepositoryName } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsViewer.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders, AgentSessionTarget } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService, IChatSendRequestOptions } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatSessionStatus, IChatSessionFileChange, IChatSessionsService, IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionData, ISessionRepository, ISessionWorkspace, SessionStatus, GITHUB_REMOTE_FILE_SCHEME, IGitHubInfo } from '../../sessions/common/sessionData.js';
import { ChatAgentLocation, ChatModeKind, ChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import { basename } from '../../../../base/common/resources.js';
import { ISendRequestOptions, ISessionsBrowseAction, ISessionChangeEvent, ISessionsProvider, ISessionType } from '../../sessions/browser/sessionsProvider.js';
import { ISessionOptionGroup } from '../../chat/browser/newSession.js';
import { IsolationMode } from './isolationPicker.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ILanguageModelToolsService } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { isBuiltinChatMode, IChatMode } from '../../../../workbench/contrib/chat/common/chatModes.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IGitService, IGitRepository } from '../../../../workbench/contrib/git/common/gitService.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { localize } from '../../../../nls.js';
import { CopilotCLISessionType, CopilotCloudSessionType } from '../../sessions/browser/sessionTypes.js';

const OPEN_REPO_COMMAND = 'github.copilot.chat.cloudSessions.openRepository';

/** Provider ID for the Copilot Chat Sessions provider. */
export const COPILOT_PROVIDER_ID = 'default-copilot';


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
}

/**
 * Local new session for Background agent sessions.
 * Implements {@link ISessionData} (session facade) and provides
 * pre-send configuration methods for the new-session flow.
 */
export class CopilotCLISession extends Disposable implements ISessionData {

	static readonly COPILOT_WORKTREE_PATTERN = 'copilot-worktree-';

	// -- ISessionData fields --

	readonly id: string;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;

	private readonly _title = observableValue(this, '');
	readonly title: IObservable<string> = this._title;

	private readonly _description: ReturnType<typeof observableValue<string | undefined>>;
	readonly description: IObservable<string | undefined>;

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

	private readonly _isolationModeObservable = observableValue<string | undefined>(this, 'worktree');
	readonly isolationModeObservable: IObservable<string | undefined> = this._isolationModeObservable;

	private readonly _modelIdObservable = observableValue<string | undefined>(this, undefined);
	readonly modelId: IObservable<string | undefined> = this._modelIdObservable;

	private readonly _modeObservable = observableValue<{ readonly id: string; readonly kind: string } | undefined>(this, undefined);
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined> = this._modeObservable;

	private readonly _loading = observableValue(this, true);
	readonly loading: IObservable<boolean> = this._loading;

	private readonly _changes: ReturnType<typeof observableValue<readonly IChatSessionFileChange[]>>;
	readonly changes: IObservable<readonly IChatSessionFileChange[]>;

	readonly isArchived: IObservable<boolean> = observableValue(this, false);
	readonly isRead: IObservable<boolean> = observableValue(this, true);
	readonly lastTurnEnd: IObservable<Date | undefined> = observableValue(this, undefined);
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined> = observableValue(this, undefined);

	private _gitRepository: IGitRepository | undefined;
	private readonly _loadBranchesCts = this._register(new MutableDisposable<CancellationTokenSource>());

	// -- Branch state --

	private readonly _branches = observableValue<readonly string[]>(this, []);
	readonly branches: IObservable<readonly string[]> = this._branches;

	private readonly _branchesLoading = observableValue(this, false);
	readonly branchesLoading: IObservable<boolean> = this._branchesLoading;

	private _defaultBranch: string | undefined;

	// -- New session configuration fields --

	private _repoUri: URI | undefined;
	private _isolationMode: IsolationMode;
	private _branch: string | undefined;
	private _modelId: string | undefined;
	private _mode: IChatMode | undefined;
	private _query: string | undefined;
	private _attachedContext: IChatRequestVariableEntry[] | undefined;

	readonly target = AgentSessionProviders.Background;
	readonly selectedOptions = new Map<string, IChatSessionProviderOptionItem>();

	get isolationMode(): IsolationMode { return this._isolationMode; }
	get branch(): string | undefined { return this._branch; }
	get selectedModelId(): string | undefined { return this._modelId; }
	get chatMode(): IChatMode | undefined { return this._mode; }
	get query(): string | undefined { return this._query; }
	get attachedContext(): IChatRequestVariableEntry[] | undefined { return this._attachedContext; }
	get gitRepository(): IGitRepository | undefined { return this._gitRepository; }
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
		readonly sessionWorkspace: ISessionWorkspace,
		providerId: string,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IGitService private readonly gitService: IGitService,
	) {
		super();
		this.id = `${providerId}:${resource.toString()}`;
		this.providerId = providerId;
		this.sessionType = AgentSessionProviders.Background;
		this.icon = CopilotCLISessionType.icon;
		this.createdAt = new Date();

		const repoUri = sessionWorkspace.repositories[0]?.uri;
		if (repoUri) {
			this._repoUri = repoUri;
			this.setOption(REPOSITORY_OPTION_ID, repoUri.fsPath);
		}

		// Set ISessionData workspace observable
		this._workspaceData.set(sessionWorkspace, undefined);

		this._isolationMode = 'worktree';
		this.setOption(ISOLATION_OPTION_ID, 'worktree');

		// Resolve git repository asynchronously
		this._resolveGitRepository();

		this._description = observableValue(this, undefined);
		this.description = this._description;

		this._changes = observableValue<readonly IChatSessionFileChange[]>(this, []);
		this.changes = this._changes;
	}

	private async _resolveGitRepository(): Promise<void> {
		const repoUri = this.sessionWorkspace.repositories[0]?.uri;
		if (repoUri) {
			try {
				this._gitRepository = await this.gitService.openRepository(repoUri);
			} catch {
				// No git repository available
			}
		}
		this._loading.set(false, undefined);

		if (this._gitRepository) {
			this._loadBranches();
		}
	}

	private _loadBranches(): void {
		const repo = this._gitRepository;
		if (!repo) {
			return;
		}

		this._loadBranchesCts.value?.cancel();
		const cts = this._loadBranchesCts.value = new CancellationTokenSource();

		this._branchesLoading.set(true, undefined);

		repo.getRefs({ pattern: 'refs/heads' }, cts.token).then(refs => {
			if (cts.token.isCancellationRequested) {
				return;
			}
			const branches = refs
				.map(r => r.name)
				.filter((name): name is string => !!name)
				.filter(name => !name.includes(CopilotCLISession.COPILOT_WORKTREE_PATTERN));

			const defaultBranch = branches.find(b => b === repo.state.get().HEAD?.name)
				?? branches.find(b => b === 'main')
				?? branches.find(b => b === 'master')
				?? branches[0];

			this._defaultBranch = defaultBranch;

			transaction(tx => {
				this._branches.set(branches, tx);
				this._branchesLoading.set(false, tx);
			});

			if (defaultBranch && !this._branch) {
				this.setBranch(defaultBranch);
			}
		}).catch(() => {
			if (!cts.token.isCancellationRequested) {
				transaction(tx => {
					this._branches.set([], tx);
					this._branchesLoading.set(false, tx);
				});
			}
		});
	}

	setIsolationMode(mode: IsolationMode): void {
		if (this._isolationMode !== mode) {
			this._isolationMode = mode;
			this._isolationModeObservable.set(mode, undefined);
			this.setOption(ISOLATION_OPTION_ID, mode);

			if (mode === 'workspace' && this._defaultBranch) {
				this.setBranch(this._defaultBranch);
			}
		}
	}

	setBranch(branch: string | undefined): void {
		if (this._branch !== branch) {
			this._branch = branch;
			this._branchObservable.set(branch, undefined);
			this.setOption(BRANCH_OPTION_ID, branch ?? '');
		}
	}

	setModelId(modelId: string | undefined): void {
		this._modelId = modelId;
		this._modelIdObservable.set(modelId, undefined);
	}

	setModeById(modeId: string, modeKind: string): void {
		this._modeObservable.set({ id: modeId, kind: modeKind }, undefined);
	}

	setPermissionLevel(level: ChatPermissionLevel): void {
		this._permissionLevel.set(level, undefined);
	}

	setTitle(title: string): void {
		this._title.set(title, undefined);
	}

	setStatus(status: SessionStatus): void {
		this._status.set(status, undefined);
	}

	setMode(mode: IChatMode | undefined): void {
		if (this._mode?.id !== mode?.id) {
			this._mode = mode;
			const modeName = mode?.isBuiltin ? undefined : mode?.name.get();
			this.setOption(AGENT_OPTION_ID, modeName ?? '');
		}
	}

	setOption(optionId: string, value: IChatSessionProviderOptionItem | string): void {
		if (typeof value === 'string') {
			this.selectedOptions.set(optionId, { id: value, name: value });
		} else {
			this.selectedOptions.set(optionId, value);
		}
		this.chatSessionsService.setSessionOption(this.resource, optionId, value);
	}

	update(agentSession: IAgentSession): void {
		const session = new AgentSessionAdapter(agentSession, this.providerId);
		this._workspaceData.set(session.workspace.get(), undefined);
		this._title.set(session.title.get(), undefined);
		this._status.set(session.status.get(), undefined);
		this._updatedAt.set(session.updatedAt.get(), undefined);
		this._changes.set(session.changes.get(), undefined);
		this._description.set(session.description.get(), undefined);
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

	readonly id: string;
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

	private readonly _modelIdObservable = observableValue<string | undefined>(this, undefined);
	readonly modelId: IObservable<string | undefined> = this._modelIdObservable;

	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined> = observableValue(this, undefined);

	readonly loading: IObservable<boolean> = observableValue(this, false);

	readonly isArchived: IObservable<boolean> = observableValue(this, false);
	readonly isRead: IObservable<boolean> = observableValue(this, true);
	readonly description: IObservable<string | undefined> = observableValue(this, undefined);
	readonly lastTurnEnd: IObservable<Date | undefined> = observableValue(this, undefined);
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined> = observableValue(this, undefined);

	readonly _hasGitRepo = observableValue(this, false);
	readonly hasGitRepo: IObservable<boolean> = this._hasGitRepo;

	// -- New session configuration fields --

	private _repoUri: URI | undefined;
	private _project: ISessionWorkspace | undefined;
	private _modelId: string | undefined;
	private _query: string | undefined;
	private _attachedContext: IChatRequestVariableEntry[] | undefined;

	private readonly _onDidChangeOptionGroups = this._register(new Emitter<void>());
	readonly onDidChangeOptionGroups: Event<void> = this._onDidChangeOptionGroups.event;

	readonly selectedOptions = new Map<string, IChatSessionProviderOptionItem>();

	get project(): ISessionWorkspace | undefined { return this._project; }
	get isolationMode(): undefined { return undefined; }
	get branch(): string | undefined { return undefined; }
	get selectedModelId(): string | undefined { return this._modelId; }
	get chatMode(): IChatMode | undefined { return undefined; }
	get query(): string | undefined { return this._query; }
	get attachedContext(): IChatRequestVariableEntry[] | undefined { return this._attachedContext; }
	get disabled(): boolean {
		return !this._repoUri && !this.selectedOptions.has('repositories');
	}

	private readonly _whenClauseKeys = new Set<string>();

	constructor(
		readonly resource: URI,
		readonly sessionWorkspace: ISessionWorkspace,
		readonly target: AgentSessionTarget,
		providerId: string,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
		this.id = `${providerId}:${resource.toString()}`;
		this.providerId = providerId;
		this.sessionType = target;
		this.icon = CopilotCloudSessionType.icon;
		this.createdAt = new Date();

		this._updateWhenClauseKeys();
		this._register(this.chatSessionsService.onDidChangeOptionGroups(() => {
			this._updateWhenClauseKeys();
			this._onDidChangeOptionGroups.fire();
		}));
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (this._whenClauseKeys.size > 0 && e.affectsSome(this._whenClauseKeys)) {
				this._onDidChangeOptionGroups.fire();
			}
		}));

		// Set workspace data
		this._workspaceData.set(sessionWorkspace, undefined);
		this._repoUri = sessionWorkspace.repositories[0]?.uri;
		if (this._repoUri) {
			const id = this._repoUri.path.substring(1);
			this.setOption('repositories', { id, name: id });
		}

	}

	// -- New session configuration methods --

	setIsolationMode(_mode: IsolationMode): void {
		// No-op for remote sessions
	}

	setBranch(_branch: string | undefined): void {
		// No-op for remote sessions
	}

	setModelId(modelId: string | undefined): void {
		this._modelId = modelId;
	}

	setTitle(title: string): void {
		this._title.set(title, undefined);
	}

	setStatus(status: SessionStatus): void {
		this._status.set(status, undefined);
	}

	setMode(_mode: IChatMode | undefined): void {
		// Intentionally a no-op: remote sessions do not support client-side mode selection.
	}

	setOption(optionId: string, value: IChatSessionProviderOptionItem | string): void {
		if (typeof value !== 'string') {
			this.selectedOptions.set(optionId, value);
		}
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

	update(_session: IAgentSession): void { }
}

/**
 * Maps the existing {@link ChatSessionStatus} to the new {@link SessionStatus}.
 */
function toSessionStatus(status: ChatSessionStatus): SessionStatus {
	switch (status) {
		case ChatSessionStatus.InProgress:
			return SessionStatus.InProgress;
		case ChatSessionStatus.NeedsInput:
			return SessionStatus.NeedsInput;
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

	readonly id: string;
	readonly resource: URI;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;

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

	readonly modelId: IObservable<string | undefined>;
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined>;
	readonly loading: IObservable<boolean>;

	private readonly _isArchived: ReturnType<typeof observableValue<boolean>>;
	readonly isArchived: IObservable<boolean>;

	private readonly _isRead: ReturnType<typeof observableValue<boolean>>;
	readonly isRead: IObservable<boolean>;

	private readonly _description: ReturnType<typeof observableValue<string | undefined>>;
	readonly description: IObservable<string | undefined>;

	private readonly _lastTurnEnd: ReturnType<typeof observableValue<Date | undefined>>;
	readonly lastTurnEnd: IObservable<Date | undefined>;

	private readonly _gitHubInfo: ReturnType<typeof observableValue<IGitHubInfo | undefined>>;
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined>;

	constructor(
		session: IAgentSession,
		providerId: string,
	) {
		this.id = `${providerId}:${session.resource.toString()}`;
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

		this.modelId = observableValue(this, undefined);
		this.mode = observableValue(this, undefined);
		this.loading = observableValue(this, false);

		this._isArchived = observableValue(this, session.isArchived());
		this.isArchived = this._isArchived;
		this._isRead = observableValue(this, session.isRead());
		this.isRead = this._isRead;
		this._description = observableValue(this, this._extractDescription(session));
		this.description = this._description;
		this._lastTurnEnd = observableValue(this, session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded) : undefined);
		this.lastTurnEnd = this._lastTurnEnd;
		this._gitHubInfo = observableValue(this, this._extractGitHubInfo(session));
		this.gitHubInfo = this._gitHubInfo;
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
			this._isArchived.set(session.isArchived(), tx);
			this._isRead.set(session.isRead(), tx);
			this._description.set(this._extractDescription(session), tx);
			this._lastTurnEnd.set(session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded) : undefined, tx);
			this._gitHubInfo.set(this._extractGitHubInfo(session), tx);
		});
	}

	private _extractDescription(session: IAgentSession): string | undefined {
		if (!session.description) {
			return undefined;
		}
		return typeof session.description === 'string' ? session.description : session.description.value;
	}

	private _extractGitHubInfo(session: IAgentSession): IGitHubInfo | undefined {
		const metadata = session.metadata;
		if (!metadata) {
			return undefined;
		}

		const { owner, repo } = this._extractOwnerRepo(session);
		if (!owner || !repo) {
			return undefined;
		}

		const pullRequestUri = this._extractPullRequestUri(session);
		if (!pullRequestUri) {
			return { owner, repo };
		}

		const prNumber = this._extractPullRequestNumber(session, pullRequestUri);
		if (prNumber === undefined) {
			return { owner, repo };
		}

		return { owner, repo, pullRequest: { number: prNumber, uri: pullRequestUri, icon: this._extractPullRequestStateIcon(session) } };
	}

	private _extractPullRequestNumber(session: IAgentSession, pullRequestUri: URI): number | undefined {
		const metadata = session.metadata;
		if (typeof metadata?.pullRequestNumber === 'number') {
			return metadata.pullRequestNumber as number;
		}
		const match = /\/pull\/(\d+)/.exec(pullRequestUri.path);
		if (match) {
			return parseInt(match[1], 10);
		}
		return undefined;
	}

	private _extractOwnerRepo(session: IAgentSession): { owner: string | undefined; repo: string | undefined } {
		const metadata = session.metadata;
		if (!metadata) {
			return { owner: undefined, repo: undefined };
		}

		// Direct owner + name fields
		if (typeof metadata.owner === 'string' && typeof metadata.name === 'string') {
			return { owner: metadata.owner, repo: metadata.name };
		}

		// repositoryNwo: "owner/repo"
		if (typeof metadata.repositoryNwo === 'string') {
			const parts = (metadata.repositoryNwo as string).split('/');
			if (parts.length === 2) {
				return { owner: parts[0], repo: parts[1] };
			}
		}

		// Parse from workspace repository URI (cloud sessions)
		const repoUri = this._buildWorkspace(session)?.repositories[0]?.uri;
		if (repoUri && repoUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			const parts = repoUri.path.split('/').filter(Boolean);
			if (parts.length >= 2) {
				return { owner: decodeURIComponent(parts[0]), repo: decodeURIComponent(parts[1]) };
			}
		}

		// Parse from pullRequestUrl
		if (typeof metadata.pullRequestUrl === 'string') {
			const match = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(metadata.pullRequestUrl as string);
			if (match) {
				return { owner: match[1], repo: match[2] };
			}
		}

		return { owner: undefined, repo: undefined };
	}

	private _extractPullRequestStateIcon(session: IAgentSession): ThemeIcon | undefined {
		const metadata = session.metadata;
		const state = metadata?.pullRequestState;
		if (state) {
			switch (state) {
				case 'merged':
					return { ...Codicon.gitPullRequestDone, color: themeColorFromId('charts.purple') };
				case 'closed':
					return { ...Codicon.gitPullRequestClosed, color: themeColorFromId('charts.red') };
				case 'draft':
					return { ...Codicon.gitPullRequestDraft, color: themeColorFromId('descriptionForeground') };
				default:
					return { ...Codicon.gitPullRequest, color: themeColorFromId('charts.green') };
			}
		}
		return undefined;
	}

	private _extractPullRequestUri(session: IAgentSession): URI | undefined {
		const metadata = session.metadata;
		if (!metadata) {
			return undefined;
		}

		const url = metadata.pullRequestUrl as string | undefined;
		if (url) {
			try {
				return URI.parse(url);
			} catch {
				// fall through
			}
		}

		// Construct from pullRequestNumber + owner/repo
		const prNumber = metadata.pullRequestNumber as number | undefined;
		if (typeof prNumber === 'number') {
			const owner = metadata.owner as string | undefined;
			const name = metadata.name as string | undefined;
			if (owner && name) {
				return URI.parse(`https://github.com/${owner}/${name}/pull/${prNumber}`);
			}
		}

		return undefined;
	}

	private _extractChanges(session: IAgentSession): readonly IChatSessionFileChange[] {
		if (!session.changes) {
			return [];
		}
		if (Array.isArray(session.changes)) {
			return session.changes as IChatSessionFileChange[];
		}
		// Summary object — create a synthetic entry for total insertions/deletions
		const summary = session.changes as { readonly files: number; readonly insertions: number; readonly deletions: number };
		if (summary.insertions > 0 || summary.deletions > 0) {
			return [{
				modifiedUri: URI.parse('summary://changes'),
				insertions: summary.insertions,
				deletions: summary.deletions,
			}];
		}
		return [];
	}

	private _buildWorkspace(session: IAgentSession): ISessionWorkspace | undefined {
		const [repoUri, worktreeUri, branchName, baseBranchName, baseBranchProtected] = this._extractRepositoryFromMetadata(session);

		const repository: ISessionRepository = {
			uri: repoUri ?? URI.parse('unknown://'),
			workingDirectory: worktreeUri,
			detail: branchName,
			baseBranchName,
			baseBranchProtected,
		};

		return {
			label: getRepositoryName(session) ?? basename(repository.uri),
			icon: repoUri?.scheme === GITHUB_REMOTE_FILE_SCHEME ? Codicon.repo : Codicon.folder,
			repositories: [repository],
			requiresWorkspaceTrust: session.providerType !== AgentSessionProviders.Cloud,
		};
	}

	/**
	 * Extract repository/worktree information from session metadata.
	 * Mirrors the logic in sessionsManagementService.getRepositoryFromMetadata().
	 */
	private _extractRepositoryFromMetadata(session: IAgentSession): [URI | undefined, URI | undefined, string | undefined, string | undefined, boolean | undefined] {
		const metadata = session.metadata;
		if (!metadata) {
			return [undefined, undefined, undefined, undefined, undefined];
		}

		if (session.providerType === AgentSessionProviders.Cloud) {
			const branch = typeof metadata.branch === 'string' ? metadata.branch : 'HEAD';
			const repositoryUri = URI.from({
				scheme: GITHUB_REMOTE_FILE_SCHEME,
				authority: 'github',
				path: `/${metadata.owner}/${metadata.name}/${encodeURIComponent(branch)}`
			});
			return [repositoryUri, undefined, undefined, undefined, undefined];
		}

		// Background/CLI sessions: check workingDirectoryPath first
		const workingDirectoryPath = metadata?.workingDirectoryPath as string | undefined;
		if (workingDirectoryPath) {
			return [URI.file(workingDirectoryPath), undefined, undefined, undefined, undefined];
		}

		// Fall back to repositoryPath + worktreePath
		const repositoryPath = metadata?.repositoryPath as string | undefined;
		const repositoryPathUri = typeof repositoryPath === 'string' ? URI.file(repositoryPath) : undefined;

		const worktreePath = metadata?.worktreePath as string | undefined;
		const worktreePathUri = typeof worktreePath === 'string' ? URI.file(worktreePath) : undefined;

		const worktreeBranchName = metadata?.branchName as string | undefined;
		const worktreeBaseBranchName = metadata?.baseBranchName as string | undefined;
		const worktreeBaseBranchProtected = metadata?.baseBranchProtected as boolean | undefined;

		return [
			URI.isUri(repositoryPathUri) ? repositoryPathUri : undefined,
			URI.isUri(worktreePathUri) ? worktreePathUri : undefined,
			worktreeBranchName,
			worktreeBaseBranchName,
			worktreeBaseBranchProtected,
		];
	}
}

/**
 * Default sessions provider for Copilot CLI and Cloud session types.
 * Wraps the existing session infrastructure into the extensible provider model.
 */
export class CopilotChatSessionsProvider extends Disposable implements ISessionsProvider {

	readonly id = COPILOT_PROVIDER_ID;
	readonly label = localize('copilotChatSessionsProvider', "Copilot Chat");
	readonly icon = Codicon.copilot;
	readonly sessionTypes: readonly ISessionType[] = [CopilotCLISessionType, CopilotCloudSessionType];

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	private readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISessionData; readonly to: ISessionData }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISessionData; readonly to: ISessionData }> = this._onDidReplaceSession.event;

	/** Cache of adapted sessions, keyed by resource URI string. */
	private readonly _sessionCache = new Map<string, AgentSessionAdapter | CopilotCLISession | RemoteNewSession>();

	readonly browseActions: readonly ISessionsBrowseAction[];

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
	) {
		super();

		this.browseActions = [
			{
				label: localize('folders', "Folders"),
				icon: Codicon.folderOpened,
				providerId: this.id,
				execute: () => this._browseForFolder(),
			},
			{
				label: localize('repositories', "Repositories"),
				icon: Codicon.repo,
				providerId: this.id,
				execute: () => this._browseForRepo(),
			},
		];

		// Forward session changes from the underlying model
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._refreshSessionCache();
		}));
	}

	// -- Workspaces --

	// -- Sessions --

	getSessionTypes(chatId: string): ISessionType[] {
		const session = this._currentNewSession?.id === chatId ? this._currentNewSession : this._findChatSession(chatId);
		if (!session) {
			return [];
		}
		if (session instanceof CopilotCLISession) {
			return [CopilotCLISessionType];
		}
		if (session instanceof RemoteNewSession) {
			return [CopilotCloudSessionType];
		}
		return [];
	}

	getSessions(): ISessionData[] {
		this._ensureSessionCache();
		return Array.from(this._sessionCache.values());
	}

	// -- Session Lifecycle --

	private _currentNewSession: (CopilotCLISession | RemoteNewSession) | undefined;

	getUntitledSession(): ISessionData | undefined {
		return this._currentNewSession;
	}

	createNewSession(workspace: ISessionWorkspace): ISessionData {
		const workspaceUri = workspace.repositories[0]?.uri;
		if (!workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}

		if (this._currentNewSession) {
			this._currentNewSession.dispose();
			this._currentNewSession = undefined;
		}

		if (workspaceUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: `/untitled-${generateUuid()}` });
			const session = this.instantiationService.createInstance(RemoteNewSession, resource, workspace, AgentSessionProviders.Cloud, this.id);
			this._currentNewSession = session;
			return session;
		}

		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/untitled-${generateUuid()}` });
		const session = this.instantiationService.createInstance(CopilotCLISession, resource, workspace, this.id);
		this._currentNewSession = session;
		return session;
	}

	createNewSessionFrom(chatId: string): ISessionData {
		const chat = this._findChatSession(chatId);
		if (!chat) {
			throw new Error(`Session '${chatId}' not found`);
		}

		if (chat.sessionType === AgentSessionProviders.Cloud) {
			throw new Error('Cloning cloud sessions is not supported');
		}

		const workspace = chat.workspace.get();
		if (!workspace) {
			throw new Error('Chat session has no associated workspace');
		}

		const repository = workspace.repositories[0];
		if (!repository) {
			throw new Error('Workspace has no repository');
		}

		if (this._currentNewSession) {
			this._currentNewSession.dispose();
			this._currentNewSession = undefined;
		}

		const newWorkspace: ISessionWorkspace = this.resolveWorkspace(repository.workingDirectory || repository.uri);
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/untitled-${generateUuid()}` });
		const session = this.instantiationService.createInstance(CopilotCLISession, resource, newWorkspace, this.id);
		session.setIsolationMode('workspace');
		this._currentNewSession = session;
		return session;
	}

	setSessionType(chatId: string, type: ISessionType): ISessionData {
		throw new Error('Session type cannot be changed');
	}

	setModel(chatId: string, modelId: string): void {
		if (this._currentNewSession?.id === chatId) {
			this._currentNewSession.setModelId(modelId);
		}
	}

	// -- Session Actions --

	async archiveSession(chatId: string): Promise<void> {
		const agentSession = this._findAgentSession(chatId);
		if (agentSession) {
			agentSession.setArchived(true);
		}
	}

	async unarchiveSession(chatId: string): Promise<void> {
		const agentSession = this._findAgentSession(chatId);
		if (agentSession) {
			agentSession.setArchived(false);
		}
	}

	async deleteSession(chatId: string): Promise<void> {
		const agentSession = this._findAgentSession(chatId);
		if (agentSession) {
			if (agentSession.providerType === CopilotCLISessionType.id) {
				this.commandService.executeCommand('github.copilot.cli.sessions.delete', { resource: agentSession.resource });
			} else {
				await this.chatService.removeHistoryEntry(agentSession.resource);
				this._refreshSessionCache();
			}
		}
	}

	async renameSession(chatId: string, title: string): Promise<void> {
		const agentSession = this._findAgentSession(chatId);
		if (agentSession) {
			if (agentSession.providerType === CopilotCLISessionType.id) {
				this.commandService.executeCommand('github.copilot.cli.sessions.setTitle', { resource: agentSession.resource }, title);
			} else {
				this.chatService.setChatSessionTitle(agentSession.resource, title);
			}
		}
	}

	setRead(chatId: string, read: boolean): void {
		const agentSession = this._findAgentSession(chatId);
		if (agentSession) {
			agentSession.setRead(read);
		}
	}

	// -- Send --

	async sendRequest(chatId: string, options: ISendRequestOptions): Promise<ISessionData> {
		const session = this._currentNewSession;
		if (!session || session.id !== chatId) {
			throw new Error(`Session '${chatId}' not found or not a new session`);
		}

		const { query, attachedContext } = options;

		const contribution = this.chatSessionsService.getChatSessionContribution(session.target);

		// Resolve mode
		const modeKind = session.chatMode?.kind ?? ChatModeKind.Agent;
		const modeIsBuiltin = session.chatMode ? isBuiltinChatMode(session.chatMode) : true;
		const modeId: 'ask' | 'agent' | 'edit' | 'custom' | undefined = modeIsBuiltin ? modeKind : 'custom';

		const rawModeInstructions = session.chatMode?.modeInstructions?.get();
		const modeInstructions = rawModeInstructions ? {
			name: session.chatMode!.name.get(),
			content: rawModeInstructions.content,
			toolReferences: this.toolsService.toToolReferences(rawModeInstructions.toolReferences),
			metadata: rawModeInstructions.metadata,
		} : undefined;

		const permissionLevel = session.permissionLevel.get();

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: session.selectedModelId,
			modeInfo: {
				kind: modeKind,
				isBuiltin: modeIsBuiltin,
				modeInstructions,
				modeId,
				applyCodeBlockSuggestionId: undefined,
				permissionLevel,
			},
			agentIdSilent: contribution?.type,
			attachedContext,
		};

		// Open chat widget and set permission level
		await this.chatSessionsService.getOrCreateChatSession(session.resource, CancellationToken.None);
		const chatWidget = await this.chatWidgetService.openSession(session.resource, ChatViewPaneTarget);
		if (!chatWidget) {
			throw new Error('[DefaultCopilotProvider] Failed to open chat widget');
		}

		if (permissionLevel) {
			chatWidget.input.setPermissionLevel(permissionLevel);
		}

		// Load session model with selected options
		const modelRef = await this.chatService.acquireOrLoadSession(session.resource, ChatAgentLocation.Chat, CancellationToken.None);
		if (modelRef) {
			const model = modelRef.object;
			if (session.selectedModelId) {
				const languageModel = this.languageModelsService.lookupLanguageModel(session.selectedModelId);
				if (languageModel) {
					model.inputModel.setState({ selectedModel: { identifier: session.selectedModelId, metadata: languageModel } });
				}
			}
			if (session.chatMode) {
				model.inputModel.setState({ mode: { id: session.chatMode.id, kind: session.chatMode.kind } });
			}
			if (session.selectedOptions.size > 0) {
				const contributedSession = model.contributedChatSession;
				if (contributedSession) {
					model.setContributedChatSession({ ...contributedSession, initialSessionOptions: session.selectedOptions });
				}
			}
			modelRef.dispose();
		}

		// Send request
		const result = await this.chatService.sendRequest(session.resource, query, sendOptions);
		if (result.kind === 'rejected') {
			throw new Error(`[DefaultCopilotProvider] sendRequest rejected: ${result.reason}`);
		}

		// Add the new session to the sessions model immediately so it appears in the sessions list
		session.setTitle(localize('new session', "New Session"));
		session.setStatus(SessionStatus.InProgress);
		const key = session.resource.toString();
		this._sessionCache.set(key, session);
		this._onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });

		try {

			// Wait for the session to be committed (URI swapped from untitled to real)
			const committedResource = await this._waitForCommittedSession(session.resource);

			// Wait for _refreshSessionCache to populate the committed adapter
			const committedSession = await this._waitForSessionInCache(committedResource);

			// Remove the temp from the cache (the adapter now owns the committed key)
			this._sessionCache.delete(key);
			this._currentNewSession = undefined;
			session.dispose();

			// Notify listeners that the temp session was replaced by the committed one
			this._onDidReplaceSession.fire({ from: session, to: committedSession });

			return committedSession;
		} catch (error) {
			// Clean up temp session on error
			this._sessionCache.delete(key);
			this._currentNewSession = undefined;
			this._onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
			session.dispose();
			throw error;
		}
	}

	/**
	 * Waits for the committed (real) URI for a session by listening to the
	 * {@link IChatSessionsService.onDidCommitSession} event.
	 */
	private _waitForCommittedSession(untitledResource: URI): Promise<URI> {
		return new Promise<URI>(resolve => {
			const listener = this.chatSessionsService.onDidCommitSession(e => {
				if (e.original.toString() === untitledResource.toString()) {
					listener.dispose();
					resolve(e.committed);
				}
			});
		});
	}

	/**
	 * Waits for an {@link AgentSessionAdapter} with the given resource to appear
	 * in the session cache (populated by {@link _refreshSessionCache}).
	 */
	private _waitForSessionInCache(resource: URI): Promise<AgentSessionAdapter> {
		const key = resource.toString();
		const existing = this._sessionCache.get(key);
		if (existing instanceof AgentSessionAdapter) {
			return Promise.resolve(existing);
		}
		return new Promise<AgentSessionAdapter>(resolve => {
			const listener = this.onDidChangeSessions(e => {
				const found = e.added.find(s => s.resource.toString() === key);
				if (found instanceof AgentSessionAdapter) {
					listener.dispose();
					resolve(found);
				}
			});
		});
	}

	// -- Private --

	private async _browseForFolder(): Promise<ISessionWorkspace | undefined> {
		const result = await this.fileDialogService.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
		});
		if (result?.length) {
			const uri = result[0];
			return {
				label: this._labelFromUri(uri),
				icon: this._iconFromUri(uri),
				repositories: [{ uri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
				requiresWorkspaceTrust: true
			};
		}
		return undefined;
	}

	private async _browseForRepo(): Promise<ISessionWorkspace | undefined> {
		const repoId = await this.commandService.executeCommand<string>(OPEN_REPO_COMMAND);
		if (repoId) {
			const uri = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${repoId}/HEAD` });
			return {
				label: this._labelFromUri(uri),
				icon: this._iconFromUri(uri),
				repositories: [{ uri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
				requiresWorkspaceTrust: false,
			};
		}
		return undefined;
	}

	resolveWorkspace(repositoryUri: URI): ISessionWorkspace {
		return {
			label: this._labelFromUri(repositoryUri),
			icon: this._iconFromUri(repositoryUri),
			repositories: [{ uri: repositoryUri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
			requiresWorkspaceTrust: repositoryUri.scheme !== GITHUB_REMOTE_FILE_SCHEME
		};
	}

	private _labelFromUri(uri: URI): string {
		if (uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			return uri.path.substring(1).replace(/\/HEAD$/, '');
		}
		return basename(uri);
	}

	private _iconFromUri(uri: URI): ThemeIcon {
		if (uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			return Codicon.repo;
		}
		return Codicon.folder;
	}

	private _ensureSessionCache(): void {
		if (this._sessionCache.size > 0) {
			return;
		}
		this._refreshSessionCache();
	}

	private _refreshSessionCache(): void {
		const currentKeys = new Set<string>();
		const added: ISessionData[] = [];
		const changed: ISessionData[] = [];

		for (const session of this.agentSessionsService.model.sessions) {
			if (session.providerType !== AgentSessionProviders.Background
				&& session.providerType !== AgentSessionProviders.Cloud) {
				continue;
			}

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
			if (!currentKeys.has(key) && adapter instanceof AgentSessionAdapter) {
				this._sessionCache.delete(key);
				removed.push(adapter);
			}
		}

		if (added.length > 0 || removed.length > 0 || changed.length > 0) {
			this._onDidChangeSessions.fire({ added, removed, changed });
		}
	}

	private _findChatSession(chatId: string): ISessionData | undefined {
		return this._sessionCache.get(this._localIdFromchatId(chatId));
	}

	private _findAgentSession(chatId: string): IAgentSession | undefined {
		const adapter = this._findChatSession(chatId);
		if (!adapter) {
			return undefined;
		}
		return this.agentSessionsService.getSession(adapter.resource);
	}

	private _localIdFromchatId(chatId: string): string {
		const prefix = `${this.id}:`;
		return chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
	}
}
