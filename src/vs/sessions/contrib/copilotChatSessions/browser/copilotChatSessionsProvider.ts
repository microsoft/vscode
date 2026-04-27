/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { raceCancellationError, raceTimeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, constObservable, derived, IObservable, IReader, observableFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAgentSession } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { getRepositoryName } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsViewer.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders, AgentSessionTarget } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService, IChatSendRequestOptions } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatResponseModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatSessionStatus, IChatSessionsService, IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem, SessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISession, IChat, ISessionRepository, ISessionWorkspace, SessionStatus, GITHUB_REMOTE_FILE_SCHEME, IGitHubInfo, CopilotCLISessionType, CopilotCloudSessionType, ClaudeCodeSessionType, ISessionType, ISessionWorkspaceBrowseAction, ISessionFileChange, toSessionId } from '../../../services/sessions/common/session.js';
import { ChatAgentLocation, ChatModeKind, ChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import { basename, dirname, isEqual } from '../../../../base/common/resources.js';
import { ISendRequestOptions, ISessionChangeEvent, ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
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
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { computePullRequestIcon, GitHubPullRequestState } from '../../github/common/types.js';

export interface ICopilotChatSession {
	/** Globally unique session ID (`providerId:localId`). */
	readonly id: string;
	/** Resource URI identifying this session. */
	readonly resource: URI;
	/** ID of the provider that owns this session. */
	readonly providerId: string;
	/** Session type ID (e.g., 'copilot-cli', 'copilot-cloud'). */
	readonly sessionType: string;
	/** Icon for this session. */
	readonly icon: ThemeIcon;
	/** When the session was created. */
	readonly createdAt: Date;
	/** Workspace this session operates on. */
	readonly workspace: IObservable<ISessionWorkspace | undefined>;

	// Reactive properties

	/** Session display title (changes when auto-titled or renamed). */
	readonly title: IObservable<string>;
	/** When the session was last updated. */
	readonly updatedAt: IObservable<Date>;
	/** Current session status. */
	readonly status: IObservable<SessionStatus>;
	/** File changes produced by the session. */
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	/** Currently selected model identifier. */
	readonly modelId: IObservable<string | undefined>;
	/** Currently selected mode identifier and kind. */
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined>;
	/** Whether the session is still initializing (e.g., resolving git repository). */
	readonly loading: IObservable<boolean>;
	/** Whether the session is archived. */
	readonly isArchived: IObservable<boolean>;
	/** Whether the session has been read. */
	readonly isRead: IObservable<boolean>;
	/** Status description shown while the session is active (e.g., current agent action). */
	readonly description: IObservable<IMarkdownString | undefined>;
	/** Timestamp of when the last agent turn ended, if any. */
	readonly lastTurnEnd: IObservable<Date | undefined>;
	/** GitHub information associated with this session, if any. */
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined>;

	readonly permissionLevel: IObservable<ChatPermissionLevel>;
	setPermissionLevel(level: ChatPermissionLevel): void;

	readonly branch: IObservable<string | undefined>;
	setBranch(branch: string | undefined): void;

	readonly isolationMode: IObservable<IsolationMode | undefined>;
	setIsolationMode(mode: IsolationMode): void;

	setModelId(modelId: string): void;
	setMode(chatMode: IChatMode | undefined): void;
	setOption?(optionId: string, value: IChatSessionProviderOptionItem | string): void;

	readonly gitRepository?: IGitRepository;
	readonly branches: IObservable<readonly string[]>;
}

const OPEN_REPO_COMMAND = 'github.copilot.chat.cloudSessions.openRepository';

/** Provider ID for the Copilot Chat Sessions provider. */
export const COPILOT_PROVIDER_ID = 'default-copilot';

/** Setting key controlling whether the Copilot provider supports multiple chats per session. */
export const COPILOT_MULTI_CHAT_SETTING = 'sessions.github.copilot.multiChatSessions';

/** Setting key controlling whether Claude agent sessions are available. */
export const CLAUDE_CODE_ENABLED_SETTING = 'sessions.chat.claudeAgent.enabled';

const REPOSITORY_OPTION_ID = 'repository';
const PARENT_SESSION_OPTION_ID = 'parentSessionId';
const BRANCH_OPTION_ID = 'branch';
const ISOLATION_OPTION_ID = 'isolation';
const AGENT_OPTION_ID = 'agent';

type NewSession = CopilotCLISession | RemoteNewSession | ClaudeCodeNewSession;

function isNewSession(session: ICopilotChatSession): session is NewSession {
	return session instanceof CopilotCLISession || session instanceof RemoteNewSession || session instanceof ClaudeCodeNewSession;
}

/**
 * Local new session for Background agent sessions.
 * Implements {@link ICopilotChatSession} (session facade) and provides
 * pre-send configuration methods for the new-session flow.
 */
class CopilotCLISession extends Disposable implements ICopilotChatSession {

	static readonly COPILOT_WORKTREE_PATTERN = 'copilot-worktree-';

	// -- ISessionData fields --

	readonly id: string;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;

	private readonly _title = observableValue(this, '');
	readonly title: IObservable<string> = this._title;

	private readonly _description: ReturnType<typeof observableValue<IMarkdownString | undefined>>;
	readonly description: IObservable<IMarkdownString | undefined>;

	private readonly _updatedAt = observableValue(this, new Date());
	readonly updatedAt: IObservable<Date> = this._updatedAt;

	private readonly _status = observableValue(this, SessionStatus.Untitled);
	readonly status: IObservable<SessionStatus> = this._status;

	private readonly _permissionLevel = observableValue(this, ChatPermissionLevel.Default);
	readonly permissionLevel: IObservable<ChatPermissionLevel> = this._permissionLevel;

	private readonly _workspaceData = observableValue<ISessionWorkspace | undefined>(this, undefined);
	readonly workspace: IObservable<ISessionWorkspace | undefined> = this._workspaceData;

	private readonly _branchObservable = observableValue<string | undefined>(this, undefined);
	readonly branch: IObservable<string | undefined> = this._branchObservable;

	private readonly _isolationModeObservable = observableValue<IsolationMode | undefined>(this, 'worktree');
	readonly isolationMode: IObservable<IsolationMode | undefined> = this._isolationModeObservable;

	private readonly _modelIdObservable = observableValue<string | undefined>(this, undefined);
	readonly modelId: IObservable<string | undefined> = this._modelIdObservable;

	private readonly _modeObservable = observableValue<{ readonly id: string; readonly kind: string } | undefined>(this, undefined);
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined> = this._modeObservable;

	private readonly _loading = observableValue(this, true);
	readonly loading: IObservable<boolean> = this._loading;

	private readonly _changes: ReturnType<typeof observableValue<readonly ISessionFileChange[]>>;
	readonly changes: IObservable<readonly ISessionFileChange[]>;

	private readonly _isArchived = observableValue(this, false);
	readonly isArchived: IObservable<boolean> = this._isArchived;
	readonly isRead: IObservable<boolean> = observableValue(this, true);
	readonly lastTurnEnd: IObservable<Date | undefined> = observableValue(this, undefined);
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined> = observableValue(this, undefined);

	private _gitRepository: IGitRepository | undefined;
	private readonly _loadBranchesCts = this._register(new MutableDisposable<CancellationTokenSource>());

	// -- Branch state --

	private readonly _branches = observableValue<readonly string[]>(this, []);
	readonly branches: IObservable<readonly string[]> = this._branches;

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
		this.id = toSessionId(providerId, resource);
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

		this._changes = observableValue<readonly ISessionFileChange[]>(this, []);
		this.changes = this._changes;
	}

	private async _resolveGitRepository(): Promise<void> {
		const repoUri = this.sessionWorkspace.repositories[0]?.uri;
		if (repoUri) {
			try {
				this._gitRepository = await this.gitService.openRepository(repoUri);
				if (!this._gitRepository) {
					this.setIsolationMode('workspace');
				} else if (!this._gitRepository.state.get().HEAD?.commit) {
					// Empty repositories have no HEAD commit and cannot run worktree isolation.
					this.setIsolationMode('workspace');
				}
			} catch {
				// No git repository available
				this.setIsolationMode('workspace');
			}
		}
		if (this._gitRepository) {
			this._loadBranches(this._gitRepository);

			// Automatically update the selected branch when the repository
			// state changes. This is done only for the Folder sessions.
			const currentBranchName = derived(reader => {
				const state = this._gitRepository?.state.read(reader);
				return state?.HEAD?.commit ? state.HEAD.name : undefined;
			});

			this._register(autorun(reader => {
				const isolationMode = this.isolationMode.read(reader);
				if (isolationMode === 'worktree') {
					return;
				}

				const currentBranch = currentBranchName.read(reader);
				this.setBranch(currentBranch ?? this._defaultBranch);
			}));
		}
		this._loading.set(false, undefined);
	}

	private _loadBranches(repo: IGitRepository): void {
		this._loadBranchesCts.value?.cancel();
		const cts = this._loadBranchesCts.value = new CancellationTokenSource();

		repo.getRefs({ pattern: 'refs/heads' }, cts.token).then(refs => {
			if (cts.token.isCancellationRequested) {
				return;
			}
			const hasHeadCommit = !!repo.state.get().HEAD?.commit;
			const branches = refs
				.map(r => r.name)
				.filter((name): name is string => !!name)
				.filter(name => !name.includes(CopilotCLISession.COPILOT_WORKTREE_PATTERN));

			const defaultBranch = hasHeadCommit
				? (branches.find(b => b === 'main')
					?? branches.find(b => b === 'master')
					?? branches.find(b => b === repo.state.get().HEAD?.name)
					?? branches[0])
				: undefined;

			this._defaultBranch = defaultBranch;

			transaction(tx => {
				this._branches.set(branches, tx);
			});

			if (defaultBranch && !this._branch) {
				this.setBranch(defaultBranch);
			}
		}).catch(() => {
			if (!cts.token.isCancellationRequested) {
				transaction(tx => {
					this._branches.set([], tx);
				});
			}
		});
	}

	setIsolationMode(mode: IsolationMode): void {
		if (this._isolationMode !== mode) {
			this._isolationMode = mode;
			this._isolationModeObservable.set(mode, undefined);
			this.setOption(ISOLATION_OPTION_ID, mode);

			if (mode === 'workspace') {
				// When switching to workspace mode, update the branch
				// selection to reflect the current branch as that is
				// what will be used for the folder session
				const head = this._gitRepository?.state.get().HEAD;
				const currentBranch = head?.commit ? head.name : undefined;
				this.setBranch(currentBranch ?? this._defaultBranch);
			} else {
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

	setArchived(archived: boolean): void {
		this._isArchived.set(archived, undefined);
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
		const session = new AgentSessionAdapter(agentSession, this.providerId, undefined);
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
 * Implements {@link ICopilotChatSession} (session facade) and provides
 * pre-send configuration methods for the new-session flow.
 */
export class RemoteNewSession extends Disposable implements ICopilotChatSession {

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

	readonly changes: IObservable<readonly ISessionFileChange[]> = observableValue<readonly ISessionFileChange[]>(this, []);

	private readonly _modelIdObservable = observableValue<string | undefined>(this, undefined);
	readonly modelId: IObservable<string | undefined> = this._modelIdObservable;

	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined> = observableValue(this, undefined);

	readonly loading: IObservable<boolean> = observableValue(this, false);

	private readonly _isArchived = observableValue(this, false);
	readonly isArchived: IObservable<boolean> = this._isArchived;
	readonly isRead: IObservable<boolean> = observableValue(this, true);
	readonly description: IObservable<IMarkdownString | undefined> = constObservable(undefined);
	readonly lastTurnEnd: IObservable<Date | undefined> = constObservable(undefined);
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined> = constObservable(undefined);
	readonly branch: IObservable<string | undefined> = constObservable(undefined);
	readonly isolationMode: IObservable<IsolationMode | undefined> = constObservable(undefined);
	readonly branches: IObservable<readonly string[]> = constObservable([]);
	readonly gitRepository?: IGitRepository | undefined;

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
		this.id = toSessionId(providerId, resource);
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
	setPermissionLevel(level: ChatPermissionLevel): void {
		throw new Error('Method not implemented.');
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

	setArchived(archived: boolean): void {
		this._isArchived.set(archived, undefined);
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
 * New session for Claude agent sessions.
 * Implements {@link ICopilotChatSession} (session facade) and provides
 * pre-send configuration methods for the new-session flow.
 * Simpler than {@link CopilotCLISession} because the Claude agent manages
 * its own worktrees and branches at runtime.
 */
class ClaudeCodeNewSession extends Disposable implements ICopilotChatSession {

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

	readonly changes: IObservable<readonly ISessionFileChange[]> = observableValue<readonly ISessionFileChange[]>(this, []);

	private readonly _modelIdObservable = observableValue<string | undefined>(this, undefined);
	readonly modelId: IObservable<string | undefined> = this._modelIdObservable;

	private readonly _modeObservable = observableValue<{ readonly id: string; readonly kind: string } | undefined>(this, undefined);
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined> = this._modeObservable;

	readonly loading: IObservable<boolean> = observableValue(this, false);

	private readonly _isArchived = observableValue(this, false);
	readonly isArchived: IObservable<boolean> = this._isArchived;
	readonly isRead: IObservable<boolean> = observableValue(this, true);
	readonly description: IObservable<IMarkdownString | undefined> = constObservable(undefined);
	readonly lastTurnEnd: IObservable<Date | undefined> = constObservable(undefined);
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined> = constObservable(undefined);
	readonly branch: IObservable<string | undefined> = constObservable(undefined);
	readonly isolationMode: IObservable<IsolationMode | undefined> = constObservable(undefined);
	readonly branches: IObservable<readonly string[]> = constObservable([]);
	readonly gitRepository?: IGitRepository | undefined;

	// -- New session configuration fields --

	private _modelId: string | undefined;
	private _mode: IChatMode | undefined;

	readonly target = AgentSessionProviders.Claude;
	readonly selectedOptions = new Map<string, IChatSessionProviderOptionItem>();

	get selectedModelId(): string | undefined { return this._modelId; }
	get chatMode(): IChatMode | undefined { return this._mode; }
	get query(): string | undefined { return undefined; }
	get attachedContext(): IChatRequestVariableEntry[] | undefined { return undefined; }
	get disabled(): boolean { return false; }

	constructor(
		readonly resource: URI,
		readonly sessionWorkspace: ISessionWorkspace,
		providerId: string,
	) {
		super();
		this.id = toSessionId(providerId, resource);
		this.providerId = providerId;
		this.sessionType = AgentSessionProviders.Claude;
		this.icon = ClaudeCodeSessionType.icon;
		this.createdAt = new Date();

		this._workspaceData.set(sessionWorkspace, undefined);
	}

	setOption(optionId: string, value: IChatSessionProviderOptionItem | string): void {
		if (typeof value === 'string') {
			this.selectedOptions.set(optionId, { id: value, name: value });
		} else {
			this.selectedOptions.set(optionId, value);
		}
	}

	setPermissionLevel(level: ChatPermissionLevel): void {
		this._permissionLevel.set(level, undefined);
	}

	setIsolationMode(_mode: IsolationMode): void {
		// No-op — Claude agent manages its own worktrees
	}

	setBranch(_branch: string | undefined): void {
		// No-op — Claude agent manages branches at runtime
	}

	setModelId(modelId: string | undefined): void {
		this._modelId = modelId;
		this._modelIdObservable.set(modelId, undefined);
	}

	setTitle(title: string): void {
		this._title.set(title, undefined);
	}

	setStatus(status: SessionStatus): void {
		this._status.set(status, undefined);
	}

	setArchived(archived: boolean): void {
		this._isArchived.set(archived, undefined);
	}

	setMode(mode: IChatMode | undefined): void {
		this._mode = mode;
		if (mode) {
			this._modeObservable.set({ id: mode.id, kind: mode.kind }, undefined);
		} else {
			this._modeObservable.set(undefined, undefined);
		}
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
 * Adapts an existing {@link IAgentSession} from the chat layer into the new {@link ICopilotChatSession} facade.
 */
class AgentSessionAdapter implements ICopilotChatSession {

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

	private readonly _changes: ReturnType<typeof observableValue<readonly ISessionFileChange[]>>;
	readonly changes: IObservable<readonly ISessionFileChange[]>;

	readonly modelId: IObservable<string | undefined>;
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined>;
	readonly loading: IObservable<boolean>;

	private readonly _isArchived: ReturnType<typeof observableValue<boolean>>;
	readonly isArchived: IObservable<boolean>;

	private readonly _isRead: ReturnType<typeof observableValue<boolean>>;
	readonly isRead: IObservable<boolean>;

	private readonly _description: ReturnType<typeof observableValue<IMarkdownString | undefined>>;
	readonly description: IObservable<IMarkdownString | undefined>;

	private readonly _lastTurnEnd: ReturnType<typeof observableValue<Date | undefined>>;
	readonly lastTurnEnd: IObservable<Date | undefined>;

	private readonly _baseGitHubInfo: ReturnType<typeof observableValue<IGitHubInfo | undefined>>;
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined>;

	readonly permissionLevel: IObservable<ChatPermissionLevel> = constObservable(ChatPermissionLevel.Default);
	readonly branch: IObservable<string | undefined> = constObservable(undefined);
	readonly isolationMode: IObservable<IsolationMode | undefined> = constObservable(undefined);
	readonly gitRepository?: IGitRepository | undefined;
	readonly branches: IObservable<readonly string[]> = constObservable([]);

	constructor(
		session: IAgentSession,
		providerId: string,
		private readonly _gitHubService: IGitHubService | undefined,
	) {
		this.id = toSessionId(providerId, session.resource);
		this.resource = session.resource;
		this.providerId = providerId;
		this.sessionType = session.providerType;
		this.icon = this._getSessionTypeIcon(session);
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

		this._changes = observableValue<readonly ISessionFileChange[]>(this, this._extractChanges(session));
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
		this._baseGitHubInfo = observableValue(this, this._extractGitHubInfo(session));
		this.gitHubInfo = this._gitHubService
			? derived(this, reader => {
				const base = this._baseGitHubInfo.read(reader);
				if (!base?.pullRequest || !this._gitHubService) {
					return base;
				}
				const prModel = this._gitHubService.getPullRequest(base.owner, base.repo, base.pullRequest.number);
				const livePR = prModel.pullRequest.read(reader);
				if (!livePR) {
					return base;
				}
				return { ...base, pullRequest: { ...base.pullRequest, icon: computePullRequestIcon(livePR.isDraft ? 'draft' : livePR.state) } };
			})
			: this._baseGitHubInfo;
	}

	setPermissionLevel(level: ChatPermissionLevel): void {
		throw new Error('Method not implemented.');
	}
	setBranch(branch: string | undefined): void {
		throw new Error('Method not implemented.');
	}
	setIsolationMode(mode: IsolationMode): void {
		throw new Error('Method not implemented.');
	}
	setModelId(modelId: string): void {
		throw new Error('Method not implemented.');
	}
	setMode(chatMode: IChatMode | undefined): void {
		throw new Error('Method not implemented.');
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
			this._baseGitHubInfo.set(this._extractGitHubInfo(session), tx);
		});
	}

	private _getSessionTypeIcon(session: IAgentSession): ThemeIcon {
		switch (session.providerType) {
			case AgentSessionProviders.Background:
				return CopilotCLISessionType.icon;
			case AgentSessionProviders.Cloud:
				return CopilotCloudSessionType.icon;
			case AgentSessionProviders.Claude:
				return ClaudeCodeSessionType.icon;
			default:
				return session.icon;
		}
	}

	private _extractDescription(session: IAgentSession): IMarkdownString | undefined {
		if (!session.description) {
			return undefined;
		}
		return typeof session.description === 'string' ? new MarkdownString(session.description) : session.description;
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
		if (typeof state === 'string') {
			return computePullRequestIcon(state as GitHubPullRequestState | 'draft');
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

	private _extractChanges(session: IAgentSession): readonly ISessionFileChange[] {
		if (!session.changes) {
			return [];
		}
		if (Array.isArray(session.changes)) {
			return session.changes as ISessionFileChange[];
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
		const [repoUri, worktreeUri, branchName, baseBranchName] = this._extractRepositoryFromMetadata(session);

		const repository: ISessionRepository = {
			uri: repoUri ?? URI.parse('unknown:///'),
			workingDirectory: worktreeUri,
			detail: branchName,
			baseBranchName,
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
	private _extractRepositoryFromMetadata(session: IAgentSession): [URI | undefined, URI | undefined, string | undefined, string | undefined] {
		const metadata = session.metadata;
		if (!metadata) {
			return [undefined, undefined, undefined, undefined];
		}

		if (session.providerType === AgentSessionProviders.Cloud) {
			const branch = typeof metadata.branch === 'string' ? metadata.branch : 'HEAD';
			const repositoryUri = URI.from({
				scheme: GITHUB_REMOTE_FILE_SCHEME,
				authority: 'github',
				path: `/${metadata.owner}/${metadata.name}/${encodeURIComponent(branch)}`
			});
			return [repositoryUri, undefined, undefined, undefined];
		}

		// Background/CLI sessions: check workingDirectoryPath first
		const workingDirectoryPath = metadata?.workingDirectoryPath as string | undefined;
		if (workingDirectoryPath) {
			return [URI.file(workingDirectoryPath), undefined, undefined, undefined];
		}

		// Fall back to repositoryPath + worktreePath
		const repositoryPath = metadata?.repositoryPath as string | undefined;
		const repositoryPathUri = typeof repositoryPath === 'string' ? URI.file(repositoryPath) : undefined;

		const worktreePath = metadata?.worktreePath as string | undefined;
		const worktreePathUri = typeof worktreePath === 'string' ? URI.file(worktreePath) : undefined;

		const worktreeBranchName = metadata?.branchName as string | undefined;
		const worktreeBaseBranchName = metadata?.baseBranchName as string | undefined;

		return [
			URI.isUri(repositoryPathUri) ? repositoryPathUri : undefined,
			URI.isUri(worktreePathUri) ? worktreePathUri : undefined,
			worktreeBranchName,
			worktreeBaseBranchName,
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
	get sessionTypes(): readonly ISessionType[] {
		const types: ISessionType[] = [CopilotCLISessionType, CopilotCloudSessionType];
		if (this._claudeEnabled) {
			types.push(ClaudeCodeSessionType);
		}
		return types;
	}

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	private readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }> = this._onDidReplaceSession.event;

	/** Cache of adapted sessions, keyed by resource URI string. */
	private readonly _sessionCache = new Map<string, AgentSessionAdapter | CopilotCLISession | RemoteNewSession | ClaudeCodeNewSession>();

	/** Cache of ISession wrappers, keyed by session group ID. */
	private readonly _sessionGroupCache = new Map<string, ISession>();

	/** Cache of chats keyed by raw session ID (resource path without leading slash). */
	private _chatByRawSessionIdCache: Map<string, ICopilotChatSession> | undefined;

	/** Cache of derived group IDs keyed by chat ID. */
	private _groupIdByChatIdCache: Map<string, string> | undefined;

	/** Cache of sorted chat IDs keyed by group ID. */
	private _chatIdsByGroupIdCache: Map<string, string[]> | undefined;

	/**
	 * Emitter fired when the set of chats in a group changes,
	 * used to update the chats observable in `_chatToSession`.
	 */
	private readonly _onDidGroupMembershipChange = this._register(new Emitter<{ sessionId: string }>());

	private readonly _multiChatEnabled: boolean;
	private _claudeEnabled: boolean;

	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IDialogService private readonly dialogService: IDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IGitHubService private readonly gitHubService: IGitHubService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();

		this._multiChatEnabled = this.configurationService.getValue<boolean>(COPILOT_MULTI_CHAT_SETTING) ?? true;
		this._claudeEnabled = this.configurationService.getValue<boolean>(CLAUDE_CODE_ENABLED_SETTING);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CLAUDE_CODE_ENABLED_SETTING)) {
				const claudeEnabled = this.configurationService.getValue<boolean>(CLAUDE_CODE_ENABLED_SETTING);
				if (this._claudeEnabled !== claudeEnabled) {
					this._claudeEnabled = claudeEnabled;
					this._onDidChangeSessionTypes.fire();
					this._refreshSessionCache();
				}
			}
		}));

		this.browseActions = [
			{
				label: localize('folders', "Folders"),
				description: localize('local', "Local"),
				group: 'folders',
				icon: Codicon.folderOpened,
				providerId: this.id,
				run: () => this._browseForFolder(),
			},
			{
				label: localize('repositories', "Repositories"),
				description: localize('github', "GitHub"),
				icon: Codicon.repo,
				providerId: this.id,
				run: () => this._browseForRepo(),
			},
		];

		// Forward session changes from the underlying model
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._refreshSessionCache();
		}));
	}

	// -- Sessions --

	getSessionTypes(workspaceUri: URI): ISessionType[] {
		if (workspaceUri.scheme === GITHUB_REMOTE_FILE_SCHEME || workspaceUri.scheme === SessionType.CopilotCloud) {
			return [CopilotCloudSessionType];
		}
		const types: ISessionType[] = [CopilotCLISessionType];
		if (this._claudeEnabled) {
			types.push(ClaudeCodeSessionType);
		}
		return types;
	}

	getSessions(): ISession[] {
		this._ensureSessionCache();

		if (!this._isMultiChatEnabled()) {
			return Array.from(this._sessionCache.values()).map(chat => this._chatToSession(chat));
		}

		const allChats = Array.from(this._sessionCache.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

		// Group chats using sessionParentId from metadata
		const seen = new Set<string>();
		const sessions: ISession[] = [];

		for (const chat of allChats) {
			const groupId = this._getGroupIdForChat(chat);
			if (!seen.has(groupId)) {
				seen.add(groupId);
				sessions.push(this._chatToSession(chat));
			}
		}
		return sessions;
	}

	// -- Session Lifecycle --

	private _currentNewSession: NewSession | undefined;

	getSession(sessionId: string): ICopilotChatSession | undefined {
		if (this._currentNewSession?.id === sessionId) {
			return this._currentNewSession;
		}
		return this._findChatSession(sessionId);
	}

	createNewSession(workspaceUri: URI, sessionTypeId: string): ISession {
		if (this._currentNewSession) {
			this._currentNewSession.dispose();
			this._currentNewSession = undefined;
		}

		const workspace = this.resolveWorkspace(workspaceUri);
		if (!workspace) {
			throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
		}

		if (workspaceUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			if (sessionTypeId !== CopilotCloudSessionType.id) {
				throw new Error('Only Copilot Cloud sessions can be created for GitHub repositories');
			}
			const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: `/untitled-${generateUuid()}` });
			const session = this.instantiationService.createInstance(RemoteNewSession, resource, workspace, AgentSessionProviders.Cloud, this.id);
			this._currentNewSession = session;
			return this._chatToSession(session);
		}

		if (sessionTypeId === ClaudeCodeSessionType.id) {
			const resource = URI.from({ scheme: AgentSessionProviders.Claude, path: `/untitled-${generateUuid()}` });
			const session = this.instantiationService.createInstance(ClaudeCodeNewSession, resource, workspace, this.id);
			this._currentNewSession = session;
			return this._chatToSession(session);
		}

		if (sessionTypeId !== CopilotCLISessionType.id) {
			throw new Error(`Unsupported session type '${sessionTypeId}' for local workspaces`);
		}
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/untitled-${generateUuid()}` });
		const session = this.instantiationService.createInstance(CopilotCLISession, resource, workspace, this.id);
		this._currentNewSession = session;
		return this._chatToSession(session);
	}

	setModel(sessionId: string, modelId: string): void {
		if (this._currentNewSession?.id === sessionId) {
			this._currentNewSession.setModelId(modelId);
		}
	}

	// -- Session Actions --

	async archiveSession(sessionId: string): Promise<void> {
		const agentSession = this._findAgentSession(sessionId);
		if (agentSession) {
			agentSession.setArchived(true);
			return;
		}

		// Temp session that hasn't been committed — archive it in-place
		// so the user can still review whatever content was produced.
		const chatSession = this._findChatSession(sessionId);
		if (chatSession && isNewSession(chatSession)) {
			chatSession.setArchived(true);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(chatSession)] });
			return;
		}
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		const agentSession = this._findAgentSession(sessionId);
		if (agentSession) {
			agentSession.setArchived(false);
			return;
		}

		// Temp session that hasn't been committed — unarchive it in-place
		const chatSession = this._findChatSession(sessionId);
		if (chatSession && isNewSession(chatSession)) {
			chatSession.setArchived(false);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(chatSession)] });
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		const chatIds = this._getChatIdsInGroup(sessionId);

		// Collect all agent sessions to delete (primary + group members)
		const allChatIds = new Set([sessionId, ...chatIds]);
		const agentSessions: IAgentSession[] = [];
		for (const chatId of allChatIds) {
			const agentSession = this._findAgentSession(chatId);
			if (agentSession) {
				agentSessions.push(agentSession);
			}
		}

		if (agentSessions.length === 0) {
			// Temp session that hasn't been committed — remove it directly
			this._cleanupTempSession(sessionId);
			return;
		}

		// Confirm deletion
		const confirmed = await this.dialogService.confirm({
			message: localize('deleteSession.confirm', "Are you sure you want to delete this session?"),
			detail: agentSessions.length > 1
				? localize('deleteSession.detailMultiple', "This will delete all {0} chats in this session. This action cannot be undone.", agentSessions.length)
				: localize('deleteSession.detail', "This action cannot be undone."),
			primaryButton: localize('deleteSession.delete', "Delete")
		});
		if (!confirmed.confirmed) {
			return;
		}

		await this._deleteAgentSessions(agentSessions);

		this._sessionGroupCache.delete(sessionId);
		this._refreshSessionCache();
	}

	async renameChat(sessionId: string, chatUri: URI, title: string): Promise<void> {
		const agentSession = this.agentSessionsService.getSession(chatUri);
		if (agentSession?.providerType === CopilotCLISessionType.id) {
			await this.commandService.executeCommand('github.copilot.cli.sessions.setTitle', { resource: chatUri }, title);
			return;
		}
		if (agentSession?.providerType === AgentSessionProviders.Claude) {
			await this.commandService.executeCommand('github.copilot.claude.sessions.rename', { resource: chatUri }, title);
			return;
		}
		throw new Error('Renaming is not supported for this session type');
	}

	async deleteChat(sessionId: string, chatUri: URI): Promise<void> {
		const session = this._findSession(sessionId);

		if (!session?.capabilities.supportsMultipleChats) {
			throw new Error('Deleting individual chats is not supported when multi-chat is disabled');
		}

		const chatIds = this._getChatIdsInGroup(sessionId);
		if (chatIds.length <= 1) {
			// Only one chat — delete the entire session
			return this.deleteSession(sessionId);
		}

		// Find the chat matching the URI
		const chatId = chatIds.find(id => {
			const chat = this._sessionCache.get(this._localIdFromchatId(id));
			return chat && chat.resource.toString() === chatUri.toString();
		});
		if (!chatId) {
			return;
		}

		// Delete the underlying agent session first.
		// _refreshSessionCacheMultiChat handles the removed chat gracefully:
		// it detects the chat belongs to a group with remaining siblings and
		// fires a changed event on the parent session instead of a removed event.
		const agentSession = this._findAgentSession(chatId);
		if (agentSession) {
			// Confirm deletion
			const confirmed = await this.dialogService.confirm({
				message: localize('deleteChat.confirm', "Are you sure you want to delete this chat?"),
				detail: localize('deleteChat.detail', "This action cannot be undone."),
				primaryButton: localize('deleteChat.delete', "Delete")
			});
			if (!confirmed.confirmed) {
				return;
			}

			await this._deleteAgentSessions([agentSession]);
		} else {
			// Untitled chat (not yet committed) - clean up directly
			const chat = this._findChatSession(chatId);
			if (chat) {
				const key = chat.resource.toString();
				this._sessionCache.delete(key);
				this._invalidateGroupingCaches();
				if (this._currentNewSession?.id === chatId) {
					this._currentNewSession.dispose();
					this._currentNewSession = undefined;
				}
			}
			this._sessionGroupCache.delete(sessionId);
			this._onDidGroupMembershipChange.fire({ sessionId });
			const remainingChatIds = this._getChatIdsInGroup(sessionId);
			const primaryChatId = remainingChatIds[0];
			const primaryChat = primaryChatId ? this._sessionCache.get(this._localIdFromchatId(primaryChatId)) : undefined;
			if (primaryChat) {
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(primaryChat)] });
			}
		}
	}

	private async _deleteAgentSessions(agentSessions: IAgentSession[]): Promise<void> {
		const cliSessionItems: { resource: URI }[] = [];
		for (const agentSession of agentSessions) {
			if (agentSession.providerType === CopilotCLISessionType.id) {
				cliSessionItems.push({ resource: agentSession.resource });
			} else {
				await this.chatService.removeHistoryEntry(agentSession.resource);
			}
		}
		if (cliSessionItems.length > 0) {
			await this.commandService.executeCommand('agents.github.copilot.cli.deleteSessions', cliSessionItems, { skipConfirmation: true });
		}
	}

	// -- Send --

	async sendAndCreateChat(sessionId: string, options: ISendRequestOptions): Promise<ISession> {
		// Determine if this is the first chat or a subsequent chat
		const session = this._currentNewSession;
		if (session && session.id === sessionId) {
			// First chat — use the existing new-session flow
			return this._sendFirstChat(session, options);
		}

		if (!this._isMultiChatEnabled()) {
			throw new Error(`Session '${sessionId}' not found or not a new session`);
		}

		// Subsequent chat — create a new chat within the existing session
		return this._sendSubsequentChat(sessionId, options);
	}

	addChat(sessionId: string): IChat {
		const session = this._findSession(sessionId);
		if (!session?.capabilities.supportsMultipleChats) {
			throw new Error('Multiple chats per session is not supported');
		}

		const newChatSession = this._createNewSessionFrom(sessionId);

		newChatSession.setTitle(localize('new chat', "New Chat"));
		const key = newChatSession.resource.toString();
		this._sessionCache.set(key, newChatSession);
		this._invalidateGroupingCaches();

		// Invalidate the session group cache so it rebuilds with the new chat
		this._sessionGroupCache.delete(sessionId);
		this._onDidGroupMembershipChange.fire({ sessionId });
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(newChatSession)] });

		return this._toChat(newChatSession);
	}

	async sendRequest(sessionId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		if (!this._isMultiChatEnabled()) {
			throw new Error('Multiple chats per session is not supported');
		}

		// The chat must already exist (created via addChat)
		const key = chatResource.toString();
		const chatSession = this._sessionCache.get(key);
		if (!chatSession || !(chatSession instanceof CopilotCLISession)) {
			throw new Error(`Chat '${chatResource.toString()}' not found in session '${sessionId}'`);
		}

		return this._sendExistingChat(sessionId, chatSession, options);
	}

	/**
	 * Sends the first chat for a newly created session.
	 * Adds the temp session to the cache, waits for commit, then replaces it.
	 */
	private async _sendFirstChat(session: CopilotCLISession | RemoteNewSession | ClaudeCodeNewSession, options: ISendRequestOptions): Promise<ISession> {

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

		// Claude sessions use the ChatSessionItemController API which creates
		// real session URIs upfront, bypassing the untitled→commit→swap flow.
		if (session instanceof ClaudeCodeNewSession) {
			return this._sendFirstChatViaController(session, query, sendOptions);
		}

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
		await this._applySessionModelState(session.resource, session);

		// Send request
		this.logService.debug(`[CopilotChatSessionsProvider] Sending first chat for session ${session.id} with options:`, {
			userSelectedModelId: sendOptions.userSelectedModelId,
		});
		const result = await this.chatService.sendRequest(session.resource, query, sendOptions);
		if (result.kind === 'rejected') {
			throw new Error(`[DefaultCopilotProvider] sendRequest rejected: ${result.reason}`);
		}

		// Extract promises to detect cancellation vs normal completion
		const responseCompletePromise = result.kind === 'sent'
			? result.data.responseCompletePromise
			: undefined;
		const responseCreatedPromise = result.kind === 'sent'
			? result.data.responseCreatedPromise
			: undefined;

		// Add the new session to the sessions model immediately so it appears in the sessions list
		session.setTitle(localize('new session', "New Session"));
		session.setStatus(SessionStatus.InProgress);
		const key = session.resource.toString();
		this._sessionCache.set(key, session);
		this._invalidateGroupingCaches();
		const newSession = this._chatToSession(session);
		this._onDidChangeSessions.fire({ added: [newSession], removed: [], changed: [] });

		try {

			// Wait for the session to be committed (URI swapped from untitled to real)
			const committedResource = await this._waitForCommittedSession(session.resource, responseCompletePromise, responseCreatedPromise);

			// Wait for _refreshSessionCache to populate the committed adapter
			const committedChat = await this._waitForSessionInCache(committedResource);

			// Remove the temp from the cache (the adapter now owns the committed key)
			this._sessionCache.delete(key);
			this._currentNewSession = undefined;
			session.dispose();

			const committedSession = this._chatToSession(committedChat);

			// Notify listeners that the temp session was replaced by the committed one
			this._sessionGroupCache.delete(session.id);
			this._onDidReplaceSession.fire({ from: newSession, to: committedSession });

			return committedSession;
		} catch (error) {
			this._currentNewSession = undefined;

			if (error instanceof CancellationError) {
				// Session was stopped before the agent created a worktree.
				// Keep the temp session in the list so the user can review
				// whatever content the agent produced before cancellation.
				session.setStatus(SessionStatus.Completed);
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [newSession] });
				return newSession;
			}

			// Unexpected error — clean up the temp session entirely
			this._sessionCache.delete(key);
			this._invalidateGroupingCaches();
			this._sessionGroupCache.delete(session.id);
			this._onDidChangeSessions.fire({ added: [], removed: [this._chatToSession(session)], changed: [] });
			session.dispose();
			throw error;
		}
	}

	/**
	 * Sends the first chat for a Claude session using the controller API.
	 *
	 * Unlike the legacy untitled→commit→swap flow, this creates the real
	 * session URI upfront via {@link IChatSessionsService.createNewChatSessionItem},
	 * then sends the request directly to that URI. This avoids the commit
	 * event race and ensures the session appears under the correct workspace
	 * immediately.
	 */
	private async _sendFirstChatViaController(
		session: ClaudeCodeNewSession,
		query: string,
		sendOptions: IChatSendRequestOptions,
	): Promise<ISession> {
		// Create the real session item via the controller's newChatSessionItemHandler.
		// This returns a session with a real (non-untitled) URI.
		const newItem = await this.chatSessionsService.createNewChatSessionItem(
			session.target,
			{ prompt: query, initialSessionOptions: session.selectedOptions.size > 0 ? session.selectedOptions : undefined },
			CancellationToken.None,
		);
		if (!newItem) {
			throw new Error('[CopilotChatSessionsProvider] Failed to create Claude session item');
		}

		const realResource = newItem.resource;

		// Open chat session and widget with the real URI
		await this.chatSessionsService.getOrCreateChatSession(realResource, CancellationToken.None);
		const chatWidget = await this.chatWidgetService.openSession(realResource, ChatViewPaneTarget);
		if (!chatWidget) {
			throw new Error('[CopilotChatSessionsProvider] Failed to open chat widget');
		}

		const permissionLevel = sendOptions.modeInfo?.permissionLevel;
		if (permissionLevel) {
			chatWidget.input.setPermissionLevel(permissionLevel);
		}

		// Load session model and apply selected options
		await this._applySessionModelState(realResource, session);

		// Send request to the real URI — sendRequest skips the
		// createNewChatSessionItem block since the URI is not untitled.
		this.logService.debug(`[CopilotChatSessionsProvider] Sending first Claude chat to ${realResource.toString()} with options:`, {
			userSelectedModelId: sendOptions.userSelectedModelId,
		});
		const result = await this.chatService.sendRequest(realResource, query, sendOptions);
		if (result.kind === 'rejected') {
			throw new Error(`[CopilotChatSessionsProvider] sendRequest rejected: ${result.reason}`);
		}

		// Add the temp session to the cache immediately so it appears in the sessions list
		session.setTitle(newItem.label);
		session.setStatus(SessionStatus.InProgress);
		const tempKey = session.resource.toString();
		this._sessionCache.set(tempKey, session);
		const tempSession = this._chatToSession(session);
		this._onDidChangeSessions.fire({ added: [tempSession], removed: [], changed: [] });

		// Extract response promises for cancellation detection
		const responseCreatedPromise = result.kind === 'sent'
			? result.data.responseCreatedPromise
			: undefined;
		const cts = new CancellationTokenSource();
		// TODO: Understand why we are not awaiting this an only handling the cancellation
		responseCreatedPromise?.then(r => {
			if (r?.isCanceled) {
				cts.cancel();
			}
		});

		try {
			// Wait for the agent sessions model to pick up the real session,
			// racing against cancellation so we don't timeout when the user
			// stops the request before the agent creates a worktree.
			const committedChat = await this._waitForSessionInCache(realResource, cts.token);

			// Clean up temp session and replace with the real adapter
			this._sessionCache.delete(tempKey);
			this._currentNewSession = undefined;
			session.dispose();

			const committedSession = this._chatToSession(committedChat);
			this._sessionGroupCache.delete(session.id);
			this._onDidReplaceSession.fire({ from: tempSession, to: committedSession });

			return committedSession;
		} catch (error) {
			this._currentNewSession = undefined;

			if (error instanceof CancellationError) {
				// Keep the temp session visible so the user can review
				// whatever content the agent produced before the cancellation.
				session.setStatus(SessionStatus.Completed);
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [tempSession] });
				return tempSession;
			}

			// Unexpected error — clean up the temp session entirely
			this._sessionCache.delete(tempKey);
			this._sessionGroupCache.delete(session.id);
			this._onDidChangeSessions.fire({ added: [], removed: [tempSession], changed: [] });
			session.dispose();
			throw error;
		} finally {
			cts.dispose();
		}
	}

	/**
	 * Loads the session model for the given resource and applies the selected
	 * language model, chat mode, and session options from the new session object.
	 */
	private async _applySessionModelState(
		resource: URI,
		session: { selectedModelId?: string; chatMode?: IChatMode; selectedOptions: Map<string, IChatSessionProviderOptionItem> },
	): Promise<void> {
		const modelRef = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
		if (!modelRef) {
			return;
		}
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
			this.chatSessionsService.updateSessionOptions(resource, session.selectedOptions);
		}
		modelRef.dispose();
	}

	/**
	 * Sends a subsequent chat for an existing session that already has chats.
	 * Creates a new {@link CopilotCLISession} from the existing workspace and
	 * fires a `changed` event on the grouped session rather than an `added` event.
	 */
	private async _sendSubsequentChat(sessionId: string, options: ISendRequestOptions): Promise<ISession> {
		// Reuse a chat that was pre-created by addChat(), otherwise create one
		let newChatSession: CopilotCLISession;
		if (this._currentNewSession && this._getGroupIdForChat(this._currentNewSession) === sessionId) {
			newChatSession = this._currentNewSession as CopilotCLISession;
		} else {
			newChatSession = this._createNewSessionFrom(sessionId);
			newChatSession.setTitle(localize('new chat', "New Chat"));
			const key = newChatSession.resource.toString();
			this._sessionCache.set(key, newChatSession);
			this._invalidateGroupingCaches();
			this._sessionGroupCache.delete(sessionId);
			this._onDidGroupMembershipChange.fire({ sessionId });
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(newChatSession)] });
		}

		return this._sendExistingChat(sessionId, newChatSession, options);
	}

	/**
	 * Sends a request for an existing chat session that is already registered
	 * in the cache.
	 */
	private async _sendExistingChat(sessionId: string, newChatSession: CopilotCLISession, options: ISendRequestOptions): Promise<ISession> {
		// Mark as in progress now that we're sending
		newChatSession.setStatus(SessionStatus.InProgress);
		const key = newChatSession.resource.toString();

		// Invalidate the session group cache so it rebuilds with the new chat
		this._sessionGroupCache.delete(sessionId);
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(newChatSession)] });

		const { query, attachedContext } = options;

		const contribution = this.chatSessionsService.getChatSessionContribution(newChatSession.target);

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: newChatSession.selectedModelId,
			modeInfo: {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				modeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: newChatSession.permissionLevel.get(),
			},
			agentIdSilent: contribution?.type,
			attachedContext,
		};

		// Open chat widget
		await this.chatSessionsService.getOrCreateChatSession(newChatSession.resource, CancellationToken.None);
		const chatWidget = await this.chatWidgetService.openSession(newChatSession.resource, ChatViewPaneTarget);
		if (!chatWidget) {
			this._sessionCache.delete(key);
			this._invalidateGroupingCaches();
			throw new Error('[DefaultCopilotProvider] Failed to open chat widget for subsequent chat');
		}

		// Load session model with selected options
		await this._applySessionModelState(newChatSession.resource, newChatSession);

		// Send request
		const result = await this.chatService.sendRequest(newChatSession.resource, query, sendOptions);
		if (result.kind === 'rejected') {
			this._sessionCache.delete(key);
			this._invalidateGroupingCaches();
			throw new Error(`[DefaultCopilotProvider] sendRequest rejected: ${result.reason}`);
		}

		// Extract promises to detect cancellation vs normal completion
		const responseCompletePromise = result.kind === 'sent'
			? result.data.responseCompletePromise
			: undefined;
		const responseCreatedPromise = result.kind === 'sent'
			? result.data.responseCreatedPromise
			: undefined;

		try {
			// Wait for the session to be committed
			const committedResource = await this._waitForCommittedSession(newChatSession.resource, responseCompletePromise, responseCreatedPromise);

			const committedChat = await this._waitForSessionInCache(committedResource);

			// Clean up temp
			this._sessionCache.delete(key);
			this._invalidateGroupingCaches();
			this._currentNewSession = undefined;
			newChatSession.dispose();

			// Invalidate the session group cache so it rebuilds with the committed chat
			this._sessionGroupCache.delete(sessionId);
			this._onDidGroupMembershipChange.fire({ sessionId });
			const updatedSession = this._chatToSession(committedChat);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [updatedSession] });

			return updatedSession;
		} catch (error) {
			this._currentNewSession = undefined;

			if (error instanceof CancellationError) {
				// Cancelled before commit — keep the chat in the group so the
				// user can review the content the agent produced.
				newChatSession.setStatus(SessionStatus.Completed);
				this._sessionGroupCache.delete(sessionId);
				const updatedSession = this._chatToSession(newChatSession);
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [updatedSession] });
				return updatedSession;
			}

			// Unexpected error — clean up on error, fire changed on the parent session group
			this._sessionCache.delete(key);
			this._invalidateGroupingCaches();
			this._sessionGroupCache.delete(sessionId);
			newChatSession.dispose();
			// Find the parent session's primary chat to fire a valid changed event
			const parentChatIds = this._getChatIdsInGroup(sessionId);
			const parentChatId = parentChatIds[0];
			const parentChat = parentChatId ? this._sessionCache.get(this._localIdFromchatId(parentChatId)) : undefined;
			if (parentChat) {
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(parentChat)] });
			}
			throw error;
		}
	}

	/**
	 * Creates a new {@link CopilotCLISession} from an existing session's workspace.
	 * Used for subsequent chats that share the same workspace but are independent conversations.
	 */
	private _createNewSessionFrom(sessionId: string): CopilotCLISession {
		// Find the primary chat for this session
		const chatIds = this._getChatIdsInGroup(sessionId);
		const firstChatId = chatIds[0] ?? sessionId;
		const chat = this._sessionCache.get(this._localIdFromchatId(firstChatId));
		if (!chat) {
			throw new Error(`Session '${sessionId}' not found`);
		}

		if (chat.sessionType === AgentSessionProviders.Cloud) {
			throw new Error('Multiple chats per session is not supported for cloud sessions');
		}

		if (chat.sessionType === AgentSessionProviders.Claude) {
			throw new Error('Multiple chats per session is not supported for Claude sessions');
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

		const newWorkspace = this.resolveWorkspace(repository.workingDirectory || repository.uri);
		if (!newWorkspace) {
			throw new Error(`Cannot resolve workspace for URI: ${(repository.workingDirectory || repository.uri).toString()}`);
		}
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/untitled-${generateUuid()}` });
		const session = this.instantiationService.createInstance(CopilotCLISession, resource, newWorkspace, this.id);
		session.setIsolationMode('workspace');
		session.setOption(PARENT_SESSION_OPTION_ID, chat.resource.path.slice(1));
		this._currentNewSession = session;
		return session;
	}

	/**
	 * Waits for the committed (real) URI for a session by listening to the
	 * {@link IChatSessionsService.onDidCommitSession} event.
	 *
	 * When {@link responseCompletePromise} is provided, the wait is bounded by
	 * response completion. If the response finishes before the commit event,
	 * the commit may still be in-flight (e.g. the user cancelled after the
	 * worktree was initiated but before the commit IPC finished, or the
	 * extension fired the commit mid-turn but it hasn't been delivered yet).
	 * In both cases we wait with the safety timeout. Only if the timeout
	 * expires *and* the response was cancelled do we throw a
	 * {@link CancellationError} — signalling that the commit will never come.
	 */
	private async _waitForCommittedSession(
		untitledResource: URI,
		responseCompletePromise?: Promise<void>,
		responseCreatedPromise?: Promise<IChatResponseModel>,
	): Promise<URI> {
		const disposables = new DisposableStore();
		try {
			const commitPromise = new Promise<URI>(resolve => {
				disposables.add(this.chatSessionsService.onDidCommitSession(e => {
					if (isEqual(e.original, untitledResource)) {
						resolve(e.committed);
					}
				}));
			});

			if (responseCompletePromise) {
				// Race the commit event against the response completing.
				const committed = await Promise.race([
					commitPromise.then(uri => ({ committed: true as const, uri })),
					responseCompletePromise.then(() => ({ committed: false as const })),
				]);

				if (committed.committed) {
					return committed.uri;
				}

				// Response finished before the commit event arrived.
				// The commit may still be in-flight — the agent could have
				// initiated the worktree before the user cancelled, and the
				// async IPC chain hasn't delivered the event yet. Fall through
				// to the safety timeout to give it a chance to arrive.
			}

			// Race commit against a safety timeout. If a response-created
			// promise is available, also race it so we can detect
			// cancellation immediately instead of waiting for the timeout.
			const candidates: Promise<{ kind: 'commit'; uri: URI } | { kind: 'timeout' } | { kind: 'cancelled' }>[] = [
				raceTimeout(commitPromise, 5_000).then(uri => uri ? { kind: 'commit' as const, uri } : { kind: 'timeout' as const }),
			];
			if (responseCreatedPromise) {
				candidates.push(responseCreatedPromise.then(r => r?.isCanceled ? { kind: 'cancelled' as const } : new Promise<never>(() => { /* never resolves */ })));
			}
			const outcome = await Promise.race(candidates);
			if (outcome.kind === 'commit') {
				return outcome.uri;
			}
			if (outcome.kind === 'cancelled') {
				throw new CancellationError();
			}
			// Timed out — last-resort check for cancellation
			const response = responseCreatedPromise ? await responseCreatedPromise : undefined;
			if (response?.isCanceled) {
				throw new CancellationError();
			}
			throw new Error('Timed out waiting for session commit');
		} finally {
			disposables.dispose();
		}
	}

	/**
	 * Waits for an {@link AgentSessionAdapter} with the given resource to appear
	 * in the session cache (populated by {@link _refreshSessionCache}).
	 * Only called once during session initialisation (after the commit event),
	 * so the timeout has no performance impact on steady-state operations.
	 */
	private async _waitForSessionInCache(resource: URI, token?: CancellationToken): Promise<AgentSessionAdapter> {
		const key = resource.toString();
		const existing = this._sessionCache.get(key);
		if (existing instanceof AgentSessionAdapter) {
			return existing;
		}

		const disposables = new DisposableStore();
		try {
			const sessionPromise = new Promise<AgentSessionAdapter>(resolve => {
				disposables.add(this.onDidChangeSessions(e => {
					const cached = this._sessionCache.get(key);
					if (cached instanceof AgentSessionAdapter) {
						resolve(cached);
					}
				}));
			});

			// The adapter should appear almost immediately after the commit
			// event via _refreshSessionCache; use a short safety timeout.
			const result = await raceTimeout(
				token ? raceCancellationError(sessionPromise, token) : sessionPromise,
				5_000,
			);
			if (!result) {
				throw new Error('Timed out waiting for committed session in cache');
			}
			return result;
		} finally {
			disposables.dispose();
		}
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
				repositories: [{ uri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined }],
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
				repositories: [{ uri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined }],
				requiresWorkspaceTrust: false,
			};
		}
		return undefined;
	}

	resolveWorkspace(repositoryUri: URI): ISessionWorkspace | undefined {
		if (repositoryUri.scheme !== Schemas.file && repositoryUri.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
			return undefined;
		}
		return {
			label: this._labelFromUri(repositoryUri),
			description: this._descriptionFromUri(repositoryUri),
			group: repositoryUri.scheme === GITHUB_REMOTE_FILE_SCHEME
				? localize('copilotProvider.workspaceGroupRepositories', "Repositories")
				: localize('copilotProvider.workspaceGroupFolders', "Folders"),
			icon: this._iconFromUri(repositoryUri),
			repositories: [{ uri: repositoryUri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined }],
			requiresWorkspaceTrust: repositoryUri.scheme !== GITHUB_REMOTE_FILE_SCHEME
		};
	}

	private _labelFromUri(uri: URI): string {
		if (uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			return uri.path.substring(1).replace(/\/HEAD$/, '');
		}
		return basename(uri);
	}

	private _descriptionFromUri(uri: URI): string | undefined {
		if (uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			// For GitHub URIs the path is "/<owner>/<repo>", return the owner as description
			const parts = uri.path.substring(1).split('/');
			return parts.length >= 2 ? parts[0] : undefined;
		}
		// For local file URIs, return the tildified parent directory path
		return this.labelService.getUriLabel(dirname(uri), { relative: false });
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

	private _invalidateGroupingCaches(): void {
		this._chatByRawSessionIdCache = undefined;
		this._groupIdByChatIdCache = undefined;
		this._chatIdsByGroupIdCache = undefined;
	}

	private _ensureGroupingCaches(): void {
		if (this._chatByRawSessionIdCache && this._groupIdByChatIdCache && this._chatIdsByGroupIdCache) {
			return;
		}

		const chats = Array.from(this._sessionCache.values());
		const chatByRawSessionId = new Map<string, ICopilotChatSession>();
		for (const chat of chats) {
			chatByRawSessionId.set(chat.resource.path.slice(1), chat);
		}

		const groupIdByChatId = new Map<string, string>();
		const chatsByGroupId = new Map<string, ICopilotChatSession[]>();

		const resolveGroupId = (chat: ICopilotChatSession): string => {
			const cachedGroupId = groupIdByChatId.get(chat.id);
			if (cachedGroupId) {
				return cachedGroupId;
			}

			const trail: ICopilotChatSession[] = [];
			const seen = new Set<string>();
			let current: ICopilotChatSession = chat;

			for (let depth = 0; depth < 100; depth++) {
				const currentCachedGroupId = groupIdByChatId.get(current.id);
				if (currentCachedGroupId) {
					for (const trailChat of trail) {
						groupIdByChatId.set(trailChat.id, currentCachedGroupId);
					}
					return currentCachedGroupId;
				}

				if (seen.has(current.id)) {
					for (const trailChat of trail) {
						groupIdByChatId.set(trailChat.id, current.id);
					}
					return current.id;
				}

				trail.push(current);
				seen.add(current.id);

				const parentRawSessionId = this._getDirectParentRawSessionId(current);
				if (!parentRawSessionId) {
					for (const trailChat of trail) {
						groupIdByChatId.set(trailChat.id, current.id);
					}
					return current.id;
				}

				const parentChat = chatByRawSessionId.get(parentRawSessionId);
				if (!parentChat) {
					const syntheticGroupId = this._getSyntheticGroupId(parentRawSessionId);
					for (const trailChat of trail) {
						groupIdByChatId.set(trailChat.id, syntheticGroupId);
					}
					return syntheticGroupId;
				}

				current = parentChat;
			}

			groupIdByChatId.set(chat.id, chat.id);
			return chat.id;
		};

		for (const chat of chats) {
			const groupId = resolveGroupId(chat);
			const groupChats = chatsByGroupId.get(groupId) ?? [];
			groupChats.push(chat);
			chatsByGroupId.set(groupId, groupChats);
		}

		const chatIdsByGroupId = new Map<string, string[]>();
		for (const [groupId, groupChats] of chatsByGroupId) {
			groupChats.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
			chatIdsByGroupId.set(groupId, groupChats.map(chat => chat.id));
		}

		this._chatByRawSessionIdCache = chatByRawSessionId;
		this._groupIdByChatIdCache = groupIdByChatId;
		this._chatIdsByGroupIdCache = chatIdsByGroupId;
	}

	/**
	 * Cleans up a temp session (one that hasn't been committed) from the cache.
	 * Used when delete/archive is invoked on a session that is still pending
	 * commit (e.g. was stopped before the agent created a worktree).
	 */
	private _cleanupTempSession(sessionId: string): void {
		const chatSession = this._findChatSession(sessionId);
		if (!chatSession) {
			return;
		}

		const key = chatSession.resource.toString();
		this._sessionCache.delete(key);
		this._invalidateGroupingCaches();
		this._sessionGroupCache.delete(chatSession.id);
		if (this._currentNewSession?.id === chatSession.id) {
			this._currentNewSession = undefined;
		}
		const removedSession = this._chatToSession(chatSession);
		this._sessionGroupCache.delete(chatSession.id);
		this._onDidChangeSessions.fire({ added: [], removed: [removedSession], changed: [] });
		if (isNewSession(chatSession)) {
			chatSession.dispose();
		}
	}

	private _refreshSessionCache(): void {
		const currentKeys = new Set<string>();
		const addedData: ICopilotChatSession[] = [];
		const changedData: ICopilotChatSession[] = [];
		let cacheChanged = false;

		for (const session of this.agentSessionsService.model.sessions) {
			if (session.providerType !== AgentSessionProviders.Background
				&& session.providerType !== AgentSessionProviders.Cloud
				&& session.providerType !== AgentSessionProviders.Claude) {
				continue;
			}

			if (session.providerType === AgentSessionProviders.Claude && !this._claudeEnabled) {
				continue;
			}

			const key = session.resource.toString();
			currentKeys.add(key);

			const existing = this._sessionCache.get(key);
			if (existing) {
				existing.update(session);
				changedData.push(existing);
			} else {
				const adapter = new AgentSessionAdapter(session, this.id, this.gitHubService);
				this._sessionCache.set(key, adapter);
				addedData.push(adapter);
				cacheChanged = true;
			}
		}

		const removedData: ICopilotChatSession[] = [];
		for (const [key, adapter] of this._sessionCache) {
			if (!currentKeys.has(key) && adapter instanceof AgentSessionAdapter) {
				this._sessionCache.delete(key);
				removedData.push(adapter);
				cacheChanged = true;
			}
		}

		if (cacheChanged) {
			this._invalidateGroupingCaches();
		}

		if (addedData.length > 0 || removedData.length > 0 || changedData.length > 0) {
			if (this._isMultiChatEnabled()) {
				this._refreshSessionCacheMultiChat(addedData, removedData, changedData);
			} else {
				this._onDidChangeSessions.fire({
					added: addedData.map(d => this._chatToSession(d)),
					removed: removedData.map(d => this._chatToSession(d)),
					changed: changedData.map(d => this._chatToSession(d)),
				});
			}
		}
	}

	private _refreshSessionCacheMultiChat(
		addedData: ICopilotChatSession[],
		removedData: ICopilotChatSession[],
		changedData: ICopilotChatSession[],
	): void {
		// Track session group IDs for removed chats before they leave the cache
		const removedGroupIds = new Map<ICopilotChatSession, string>();
		for (const removed of removedData) {
			removedGroupIds.set(removed, this._getGroupIdForChat(removed));
		}

		// Handle removed chats: if a removed chat belongs to a group with
		// remaining siblings, treat it as a changed event on the parent session
		// instead of a removed session.
		const trulyRemovedSessions: { chat: ICopilotChatSession; groupId: string }[] = [];
		const changedSessionIds = new Set<string>();
		for (const removed of removedData) {
			const sessionId = removedGroupIds.get(removed)!;

			// Check if the group still has chats after removal
			const remainingChatIds = this._getChatIdsInGroup(sessionId);
			if (remainingChatIds.length > 0) {
				// Group still has other chats — invalidate cache and treat as changed
				this._sessionGroupCache.delete(sessionId);
				this._onDidGroupMembershipChange.fire({ sessionId });
				if (!changedSessionIds.has(sessionId)) {
					changedSessionIds.add(sessionId);
					const primaryChat = this._sessionCache.get(this._localIdFromchatId(remainingChatIds[0]));
					if (primaryChat) {
						changedData.push(primaryChat);
					}
				}
			} else {
				this._sessionGroupCache.delete(sessionId);
				trulyRemovedSessions.push({ chat: removed, groupId: sessionId });
			}
		}

		// Separate truly new sessions from chats added to existing groups.
		// Grouping is derived from sessionParentId in metadata.
		const newSessions: ICopilotChatSession[] = [];
		for (const added of addedData) {
			const groupId = this._getGroupIdForChat(added);
			const groupChatIds = this._getChatIdsInGroup(groupId);
			if (groupChatIds.length > 1) {
				// This chat belongs to an existing session group — treat as changed
				this._sessionGroupCache.delete(groupId);
				this._onDidGroupMembershipChange.fire({ sessionId: groupId });
				if (!changedSessionIds.has(groupId)) {
					changedSessionIds.add(groupId);
					changedData.push(added);
				}
			} else {
				newSessions.push(added);
			}
		}

		// Deduplicate changed sessions by group ID
		const seenChanged = new Set<string>();
		const deduplicatedChanged: ICopilotChatSession[] = [];
		for (const d of changedData) {
			const groupId = this._getGroupIdForChat(d);
			if (!seenChanged.has(groupId)) {
				seenChanged.add(groupId);
				deduplicatedChanged.push(d);
			}
		}

		this._onDidChangeSessions.fire({
			added: newSessions.map(d => this._chatToSession(d)),
			removed: trulyRemovedSessions.map(({ chat, groupId }) => {
				const session = this._sessionGroupCache.get(groupId);
				this._sessionGroupCache.delete(groupId);
				return session ?? this._chatToSession(chat);
			}),
			changed: deduplicatedChanged.map(d => this._chatToSession(d)),
		});
	}

	private _findChatSession(chatId: string): ICopilotChatSession | undefined {
		const directMatch = this._sessionCache.get(this._localIdFromchatId(chatId));
		if (directMatch) {
			return directMatch;
		}

		const groupChatIds = this._getChatIdsInGroup(chatId);
		const firstChatId = groupChatIds[0];
		return firstChatId ? this._sessionCache.get(this._localIdFromchatId(firstChatId)) : undefined;
	}

	private _findAgentSession(chatId: string): IAgentSession | undefined {
		const adapter = this._findChatSession(chatId);
		if (!adapter) {
			return undefined;
		}
		return this.agentSessionsService.getSession(adapter.resource);
	}

	/**
	 * Returns the group ID for a given chat.
	 * Grouping is derived from `sessionParentId` in metadata (for committed sessions)
	 * or from `PARENT_SESSION_OPTION_ID` in selected options (for uncommitted sessions).
	 * If the root chat is not loaded, a synthetic provider-scoped group ID is used.
	 */
	private _getGroupIdForChat(chat: ICopilotChatSession): string {
		this._ensureGroupingCaches();
		return this._groupIdByChatIdCache?.get(chat.id) ?? chat.id;
	}

	/**
	 * Returns all chat IDs that belong to the given group,
	 * ordered by creation time (root session first).
	 */
	private _getChatIdsInGroup(groupId: string): string[] {
		this._ensureGroupingCaches();
		return this._chatIdsByGroupIdCache?.get(groupId) ?? [];
	}

	private _getDirectParentRawSessionId(chat: ICopilotChatSession): string | undefined {
		const agentSession = this.agentSessionsService.getSession(chat.resource);
		const sessionParentId = agentSession?.metadata?.sessionParentId;
		if (typeof sessionParentId === 'string' && sessionParentId.length > 0) {
			return sessionParentId;
		}

		if (isNewSession(chat)) {
			const parentOption = chat.selectedOptions.get(PARENT_SESSION_OPTION_ID);
			if (parentOption?.id) {
				return parentOption.id;
			}
		}

		return undefined;
	}

	private _getSyntheticGroupId(rawSessionId: string): string {
		return `${this.id}:group:${rawSessionId}`;
	}

	private _findSession(sessionId: string): ISession | undefined {
		return this._sessionGroupCache.get(sessionId);
	}

	private _localIdFromchatId(chatId: string): string {
		const prefix = `${this.id}:`;
		return chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
	}

	/**
	 * Wraps a primary {@link ICopilotChatSession} and its sibling chats into an {@link ISession}.
	 * When multi-chat is enabled, the `chats` observable is derived from `sessionParentId`
	 * metadata and updates when group membership changes.
	 * When disabled, each session has exactly one chat.
	 */
	private _chatToSession(chat: ICopilotChatSession): ISession {
		if (!this._isMultiChatEnabled()) {
			return this._chatToSingleChatSession(chat);
		}

		const sessionId = this._getGroupIdForChat(chat);

		const cached = this._sessionGroupCache.get(sessionId);
		if (cached) {
			return cached;
		}

		// Resolve the main (first) chat in the group — session-level properties come from it
		const mainChatIds = this._getChatIdsInGroup(sessionId);
		const firstChatId = mainChatIds[0];
		const primaryChat = firstChatId
			? this._sessionCache.get(this._localIdFromchatId(firstChatId)) ?? chat
			: chat;

		const chatsObs = observableFromEvent<readonly IChat[]>(
			this,
			Event.filter(this._onDidGroupMembershipChange.event, e => e.sessionId === sessionId),
			() => {
				const chatIds = this._getChatIdsInGroup(sessionId);
				if (chatIds.length === 0) {
					return [this._toChat(chat)];
				}
				const resolved: ICopilotChatSession[] = [];
				for (const id of chatIds) {
					const c = this._sessionCache.get(this._localIdFromchatId(id));
					if (c) {
						resolved.push(c);
					}
				}
				if (resolved.length === 0) {
					return [this._toChat(chat)];
				}
				return resolved.map(c => this._toChat(c));
			},
		);

		const mainChat = this._toChat(primaryChat);
		const session: ISession = {
			sessionId,
			resource: primaryChat.resource,
			providerId: primaryChat.providerId,
			sessionType: primaryChat.sessionType,
			icon: primaryChat.icon,
			createdAt: primaryChat.createdAt,
			workspace: primaryChat.workspace,
			title: primaryChat.title,
			updatedAt: chatsObs.map((chats, reader) => this._latestDate(chats, c => c.updatedAt.read(reader))!),
			status: chatsObs.map((chats, reader) => this._aggregateStatus(chats, reader)),
			changes: primaryChat.changes,
			modelId: primaryChat.modelId,
			mode: primaryChat.mode,
			loading: primaryChat.loading,
			isArchived: primaryChat.isArchived,
			isRead: chatsObs.map((chats, reader) => chats.every(c => c.isRead.read(reader))),
			description: primaryChat.description,
			lastTurnEnd: chatsObs.map((chats, reader) => this._latestDate(chats, c => c.lastTurnEnd.read(reader))),
			gitHubInfo: primaryChat.gitHubInfo,
			chats: chatsObs,
			mainChat,
			capabilities: { supportsMultipleChats: primaryChat.sessionType === CopilotCLISessionType.id && this._isMultiChatEnabled() },
		};
		this._sessionGroupCache.set(sessionId, session);
		return session;
	}

	private _chatToSingleChatSession(chat: ICopilotChatSession): ISession {
		const mainChat = this._toChat(chat);
		return {
			sessionId: chat.id,
			resource: chat.resource,
			providerId: chat.providerId,
			sessionType: chat.sessionType,
			icon: chat.icon,
			createdAt: chat.createdAt,
			workspace: chat.workspace,
			title: chat.title,
			updatedAt: chat.updatedAt,
			status: chat.status,
			changes: chat.changes,
			modelId: chat.modelId,
			mode: chat.mode,
			loading: chat.loading,
			isArchived: chat.isArchived,
			isRead: chat.isRead,
			description: chat.description,
			lastTurnEnd: chat.lastTurnEnd,
			gitHubInfo: chat.gitHubInfo,
			chats: constObservable([mainChat]),
			mainChat,
			capabilities: { supportsMultipleChats: false },
		};
	}

	private _toChat(chat: ICopilotChatSession): IChat {
		return {
			resource: chat.resource,
			createdAt: chat.createdAt,
			title: chat.title,
			updatedAt: chat.updatedAt,
			status: chat.status,
			changes: chat.changes,
			modelId: chat.modelId,
			mode: chat.mode,
			isArchived: chat.isArchived,
			isRead: chat.isRead,
			description: chat.description,
			lastTurnEnd: chat.lastTurnEnd,
		};
	}

	private _latestDate(chats: readonly IChat[], getter: (chat: IChat) => Date | undefined): Date | undefined {
		let latest: Date | undefined;
		for (const chat of chats) {
			const d = getter(chat);
			if (d && (!latest || d > latest)) {
				latest = d;
			}
		}
		return latest;
	}

	private _aggregateStatus(chats: readonly IChat[], reader: IReader): SessionStatus {
		for (const c of chats) {
			if (c.status.read(reader) === SessionStatus.NeedsInput) {
				return SessionStatus.NeedsInput;
			}
		}
		for (const c of chats) {
			if (c.status.read(reader) === SessionStatus.InProgress) {
				return SessionStatus.InProgress;
			}
		}
		return chats[0].status.read(reader);
	}

	private _isMultiChatEnabled(): boolean {
		return this._multiChatEnabled;
	}
}
