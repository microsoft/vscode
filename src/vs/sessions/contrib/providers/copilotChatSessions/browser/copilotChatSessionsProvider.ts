/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { raceCancellationError, raceTimeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { IMarkdownString, MarkdownString, markdownStringEqual } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, DisposableMap, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, constObservable, derived, IObservable, IReader, ISettableObservable, ITransaction, observableFromEvent, observableValue, observableValueOpts, transaction } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAgentSession } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { getRepositoryName } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsViewer.js';
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders, AgentSessionTarget } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService, IChatSendRequestOptions } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatSessionStatus, IChatSessionsService, IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem, SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISession, IChat, ISessionGitRepository, ISessionFolder, ISessionWorkspace, SessionStatus, GITHUB_REMOTE_FILE_SCHEME, IGitHubInfo, ISessionType, ISessionWorkspaceBrowseAction, ISessionFileChange, sessionFileChangesEqual, gitHubInfoEqual, sessionWorkspaceEqual, toSessionId, SESSION_WORKSPACE_GROUP_LOCAL, ISessionChangeset, IChatCheckpoints, ChatInteractivity } from '../../../../services/sessions/common/session.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, isChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { basename, dirname, isEqual } from '../../../../../base/common/resources.js';
import { IDeleteChatOptions, ISendRequestOptions, ISessionChangeEvent, ISessionModelPickerOptions, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionOptionGroup } from '../../../chat/browser/newSession.js';
import { IsolationMode } from './isolationPicker.js';
import { ILanguageModelToolsService } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ChatMode, IChatMode, IChatModeService, isBuiltinChatMode } from '../../../../../workbench/contrib/chat/common/chatModes.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IGitService, IGitRepository } from '../../../../../workbench/contrib/git/common/gitService.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { ClaudePreferAgentHostAgentsSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { computePullRequestIcon, GitHubPullRequestState } from '../../../github/common/types.js';
import { computeLivePullRequestIcon } from '../../../github/browser/pullRequestIconStatus.js';
import { structuralEquals } from '../../../../../base/common/equals.js';
import { CopilotCLISessionType } from '../../agentHost/browser/baseAgentHostSessionsProvider.js';
import { createChangesets } from './copilotChatSessionsChangesets.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';

/** Claude Code session type — local agent powered by Claude. */
export const ClaudeCodeSessionType: ISessionType = {
	id: 'claude-code',
	label: localize('claudeCode', "Claude"),
	icon: Codicon.claude,
};

/** Copilot Cloud session type - cloud-hosted agent. */
export const CopilotCloudSessionType: ISessionType = {
	id: 'copilot-cloud-agent',
	label: localize('copilotCloud', "Cloud"),
	icon: Codicon.cloud,
};

const SESSION_WORKSPACE_GROUP_GITHUB = localize('sessionWorkspaceGroup.github', "GitHub");
const STORAGE_KEY_ISOLATION_MODE = 'sessions.isolationPicker.selectedMode';

export interface ICopilotChatSession {
	/** Globally unique session ID (`providerId:localId`). */
	readonly sessionId: string;
	/** Resource URI identifying this session. */
	readonly resource: URI;
	/** ID of the provider that owns this session. */
	readonly providerId: string;
	/** Session type ID (e.g., 'copilot-cli', 'copilot-cloud', 'local'). */
	readonly sessionType: typeof SessionType[keyof typeof SessionType] | string;
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
	/** Checkpoints associated with this session, if any. */
	readonly checkpoints: IObservable<IChatCheckpoints | undefined>;

	readonly permissionLevel: IObservable<ChatPermissionLevel>;
	setPermissionLevel(level: ChatPermissionLevel): void;

	readonly branch: IObservable<string | undefined>;
	setBranch(branch: string | undefined): void;

	readonly isolationMode: IObservable<IsolationMode | undefined>;
	setIsolationMode(mode: IsolationMode): void;

	setModelId(modelId: string | undefined): void;
	setMode(chatMode: IChatMode | undefined): void;
	setOption?(optionId: string, value: IChatSessionProviderOptionItem | string): void;

	readonly gitRepository?: IGitRepository;
	readonly branches: IObservable<readonly string[]>;

	/**
	 * Settable observable holding the {@link IChat} representation of this chat.
	 * For committed chats, the value is stable. For new sessions, the provider
	 * replaces the initial value via {@link createNewChat} once the real backend
	 * resource is known (e.g., Claude assigns a new resource on commit).
	 */
	readonly mainChat: ISettableObservable<IChat>;
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
 * Builds an {@link IChat} snapshot from an {@link ICopilotChatSession}. Used to
 * seed the chat's own `mainChat` observable. An optional `resource` override is
 * supported for cases where the chat resource differs from the session resource
 * (e.g. Claude commits a new resource at send time).
 */
function buildChatFromSession(chat: Omit<ICopilotChatSession, 'mainChat'>, resource?: URI): IChat {
	return {
		resource: resource ?? chat.resource,
		createdAt: chat.createdAt,
		title: chat.title,
		updatedAt: chat.updatedAt,
		status: chat.status,
		changes: chat.changes,
		checkpoints: chat.checkpoints,
		modelId: chat.modelId,
		mode: chat.mode,
		isArchived: chat.isArchived,
		isRead: chat.isRead,
		interactivity: constObservable(ChatInteractivity.Full),
		description: chat.description,
		lastTurnEnd: chat.lastTurnEnd,
	};
}

function setIfChanged<T>(observable: ISettableObservable<T>, value: T, tx: ITransaction, equals: (a: T, b: T) => boolean = Object.is): boolean {
	if (equals(observable.get(), value)) {
		return false;
	}
	observable.set(value, tx, undefined);
	return true;
}

function dateEquals(a: Date | undefined, b: Date | undefined): boolean {
	return a?.getTime() === b?.getTime();
}

function markdownStringEquals(a: IMarkdownString | undefined, b: IMarkdownString | undefined): boolean {
	return a === b || !!a && !!b && markdownStringEqual(a, b);
}

/**
 * Local new session for Background agent sessions.
 * Implements {@link ICopilotChatSession} (session facade) and provides
 * pre-send configuration methods for the new-session flow.
 */
class CopilotCLISession extends Disposable implements ICopilotChatSession {

	static readonly COPILOT_WORKTREE_PATTERN = 'copilot-worktree-';

	// -- ISessionData fields --

	readonly sessionId: string;
	readonly providerId: string;
	readonly sessionType: typeof SessionType.CopilotCLI;
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

	private readonly _checkpoints: ReturnType<typeof observableValueOpts<IChatCheckpoints | undefined>>;
	readonly checkpoints: IObservable<IChatCheckpoints | undefined>;

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

	readonly mainChat: ISettableObservable<IChat>;

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
		@IGitHubService private readonly gitHubService: IGitHubService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.sessionId = toSessionId(providerId, resource);
		this.providerId = providerId;
		this.sessionType = AgentSessionProviders.Background;
		this.icon = CopilotCLISessionType.icon;
		this.createdAt = new Date();

		const repoUri = sessionWorkspace.folders[0]?.root;
		if (repoUri) {
			this._repoUri = repoUri;
			this.setOption(REPOSITORY_OPTION_ID, repoUri.fsPath);
		}

		// Set ISessionData workspace observable
		this._workspaceData.set(sessionWorkspace, undefined);

		const storedMode = storageService.get(STORAGE_KEY_ISOLATION_MODE, StorageScope.PROFILE);
		const initialMode: IsolationMode = storedMode === 'workspace' ? 'workspace' : 'worktree';
		this._isolationMode = initialMode;
		this._isolationModeObservable.set(initialMode, undefined);
		this.setOption(ISOLATION_OPTION_ID, initialMode);

		// Resolve git repository asynchronously
		this._resolveGitRepository();

		this._description = observableValue(this, undefined);
		this.description = this._description;


		this._changes = observableValueOpts<readonly ISessionFileChange[]>({ owner: this, equalsFn: sessionFileChangesEqual }, []);
		this.changes = this._changes;

		this._checkpoints = observableValueOpts<IChatCheckpoints | undefined>({ owner: this, equalsFn: structuralEquals }, undefined);
		this.checkpoints = this._checkpoints;

		this.mainChat = observableValue<IChat>(this, buildChatFromSession(this));
	}

	private async _resolveGitRepository(): Promise<void> {
		const repoUri = this.sessionWorkspace.folders[0]?.root;
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
			this.storageService.store(STORAGE_KEY_ISOLATION_MODE, mode, StorageScope.PROFILE, StorageTarget.MACHINE);

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

	getAgentHostSessionConfig(): Record<string, unknown> {
		const config: Record<string, unknown> = {
			[SessionConfigKey.Isolation]: this._isolationMode === 'worktree' ? 'worktree' : 'folder',
		};
		if (this._isolationMode === 'worktree' && this._branch) {
			config[SessionConfigKey.Branch] = this._branch;

			// Forward the user's `git.branchPrefix` (resource-scoped to the
			// repository) so the agent host prepends it to the worktree branch
			// it creates. Omit when unset/empty to preserve the default naming.
			const branchPrefix = this.configurationService.getValue<string>('git.branchPrefix', { resource: this._repoUri });
			if (typeof branchPrefix === 'string' && branchPrefix.length > 0) {
				config[SessionConfigKey.WorktreeBranchPrefix] = branchPrefix;
			}

			const worktreeIncludeFiles = this.configurationService.getValue<string[]>('git.worktreeIncludeFiles', { resource: this._repoUri });
			if (Array.isArray(worktreeIncludeFiles) && worktreeIncludeFiles.length > 0) {
				config[SessionConfigKey.WorktreeIncludeFiles] = worktreeIncludeFiles;
			}
		}
		return config;
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
		transaction((tx) => {
			const session = new AgentSessionAdapter(agentSession, this.providerId, this.gitHubService);
			this._workspaceData.set(session.workspace.get(), tx);
			this._title.set(session.title.get(), tx);
			this._status.set(session.status.get(), tx);
			this._updatedAt.set(session.updatedAt.get(), tx);
			this._changes.set(session.changes.get(), tx);
			this._checkpoints.set(session.checkpoints.get(), tx);
			this._description.set(session.description.get(), tx);
		});
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

	readonly changes: IObservable<readonly ISessionFileChange[]> = observableValueOpts<readonly ISessionFileChange[]>({ owner: this, equalsFn: sessionFileChangesEqual }, []);

	readonly checkpoints: IObservable<IChatCheckpoints | undefined> = constObservable(undefined);

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

	readonly mainChat: ISettableObservable<IChat>;

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
		this.sessionId = toSessionId(providerId, resource);
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
		this._repoUri = sessionWorkspace.folders[0]?.root;
		if (this._repoUri) {
			const id = this._repoUri.path.substring(1);
			this.setOption('repositories', { id, name: id });
		}

		this.mainChat = observableValue<IChat>(this, buildChatFromSession(this));
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

	readonly sessionId: string;
	readonly providerId: string;
	readonly sessionType: typeof SessionType.ClaudeCode;
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

	readonly changes: IObservable<readonly ISessionFileChange[]> = observableValueOpts<readonly ISessionFileChange[]>({ owner: this, equalsFn: sessionFileChangesEqual }, []);
	readonly checkpoints: IObservable<IChatCheckpoints | undefined> = constObservable(undefined);

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

	readonly mainChat: ISettableObservable<IChat>;

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
		this.sessionId = toSessionId(providerId, resource);
		this.providerId = providerId;
		this.sessionType = AgentSessionProviders.Claude;
		this.icon = ClaudeCodeSessionType.icon;
		this.createdAt = new Date();

		this._workspaceData.set(sessionWorkspace, undefined);

		this.mainChat = observableValue<IChat>(this, buildChatFromSession(this));
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

	readonly sessionId: string;
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

	private readonly _checkpoints: ReturnType<typeof observableValueOpts<IChatCheckpoints | undefined>>;
	readonly checkpoints: IObservable<IChatCheckpoints | undefined>;

	private readonly _modelId: ReturnType<typeof observableValue<string | undefined>>;
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

	readonly mainChat: ISettableObservable<IChat>;

	constructor(
		session: IAgentSession,
		providerId: string,
		private readonly _gitHubService: IGitHubService,
	) {
		this.sessionId = toSessionId(providerId, session.resource);
		this.resource = session.resource;
		this.providerId = providerId;
		this.sessionType = session.providerType;
		this.icon = this._getSessionTypeIcon(session);
		this.createdAt = new Date(session.timing.created);

		this._baseGitHubInfo = observableValue(this, this._extractGitHubInfo(session));
		this.gitHubInfo = derived(this, reader => {
			const base = this._baseGitHubInfo.read(reader);
			if (!base?.pullRequest || !this._gitHubService) {
				return base;
			}
			const prModelRef = reader.store.add(this._gitHubService.createPullRequestModelReference(base.owner, base.repo, base.pullRequest.number));
			const livePR = prModelRef.object.pullRequest.read(reader);
			if (!livePR) {
				return base;
			}
			return { ...base, pullRequest: { ...base.pullRequest, icon: computeLivePullRequestIcon(reader, this._gitHubService, base.owner, base.repo, livePR) } };
		});

		this._workspace = observableValue(this, this._buildWorkspace(session));
		this.workspace = this._workspace;

		this._title = observableValue(this, session.label);
		this.title = this._title;

		const updatedTime = session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created;
		this._updatedAt = observableValue(this, new Date(updatedTime));
		this.updatedAt = this._updatedAt;

		this._status = observableValue(this, toSessionStatus(session.status));
		this.status = this._status;

		this._changes = observableValueOpts<readonly ISessionFileChange[]>({ owner: this, equalsFn: sessionFileChangesEqual }, this._extractChanges(session));
		this.changes = this._changes;

		this._checkpoints = observableValueOpts<IChatCheckpoints | undefined>({ owner: this, equalsFn: structuralEquals }, this._extractCheckpoints(session));
		this.checkpoints = this._checkpoints;

		this._modelId = observableValue<string | undefined>(this, undefined);
		this.modelId = this._modelId;
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

		this.mainChat = observableValue<IChat>(this, buildChatFromSession(this));
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
	setModelId(modelId: string | undefined): void {
		this._modelId.set(modelId, undefined);
	}
	setMode(chatMode: IChatMode | undefined): void {
		throw new Error('Method not implemented.');
	}

	/**
	 * Update reactive properties from a refreshed agent session.
	 */
	update(session: IAgentSession): boolean {
		let changed = false;
		transaction(tx => {
			changed = setIfChanged(this._title, session.label, tx) || changed;
			changed = setIfChanged(this._workspace, this._buildWorkspace(session), tx, sessionWorkspaceEqual) || changed;
			const updatedTime = session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created;
			changed = setIfChanged(this._updatedAt, new Date(updatedTime), tx, dateEquals) || changed;
			changed = setIfChanged(this._status, toSessionStatus(session.status), tx) || changed;
			changed = setIfChanged(this._changes, this._extractChanges(session), tx, sessionFileChangesEqual) || changed;
			changed = setIfChanged(this._checkpoints, this._extractCheckpoints(session), tx, structuralEquals) || changed;
			changed = setIfChanged(this._isArchived, session.isArchived(), tx) || changed;
			changed = setIfChanged(this._isRead, session.isRead(), tx) || changed;
			changed = setIfChanged(this._description, this._extractDescription(session), tx, markdownStringEquals) || changed;
			changed = setIfChanged(this._lastTurnEnd, session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded) : undefined, tx, dateEquals) || changed;
			changed = setIfChanged(this._baseGitHubInfo, this._extractGitHubInfo(session), tx, gitHubInfoEqual) || changed;
		});
		return changed;
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

		const icon = this._extractPullRequestStateIcon(session);

		const baseRefOid = typeof metadata.baseRefOid === 'string' ? metadata.baseRefOid : undefined;
		const headRefOid = typeof metadata.headRefOid === 'string' ? metadata.headRefOid : undefined;

		return {
			owner,
			repo,
			pullRequest: {
				number: prNumber,
				uri: pullRequestUri,
				icon,
				baseRefOid,
				headRefOid
			}
		};
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
		const repoUri = this._buildWorkspace(session)?.folders[0]?.root;
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

	private _extractCheckpoints(session: IAgentSession): IChatCheckpoints | undefined {
		const metadata = session.metadata;
		if (typeof metadata?.firstCheckpointRef !== 'string' || typeof metadata?.lastCheckpointRef !== 'string') {
			return undefined;
		}

		return {
			firstCheckpointRef: metadata.firstCheckpointRef,
			lastCheckpointRef: metadata.lastCheckpointRef,
		} satisfies IChatCheckpoints;
	}

	private _buildWorkspace(session: IAgentSession): ISessionWorkspace | undefined {
		const {
			repoUri,
			worktreeUri,
			branchName,
			baseBranchName,
			baseBranchProtected,
			hasGitHubRemote,
			upstreamBranchName,
			incomingChanges,
			outgoingChanges,
			uncommittedChanges,
			hasGitOperationInProgress
		} = this._extractRepositoryFromMetadata(session);

		const repoUriResolved = repoUri ?? URI.parse('unknown:///');

		const gitRepository: ISessionGitRepository = {
			uri: repoUriResolved,
			workTreeUri: worktreeUri,
			branchName,
			baseBranchName,
			baseBranchProtected,
			hasGitHubRemote,
			upstreamBranchName,
			incomingChanges,
			outgoingChanges,
			uncommittedChanges,
			hasGitOperationInProgress,
			gitHubInfo: this.gitHubInfo,
		};

		const folder: ISessionFolder = {
			root: repoUriResolved,
			workingDirectory: worktreeUri ?? repoUriResolved,
			name: basename(repoUriResolved),
			description: branchName,
			gitRepository,
		};

		return {
			uri: repoUriResolved,
			label: getRepositoryName(session) ?? basename(repoUriResolved),
			icon: repoUri?.scheme === GITHUB_REMOTE_FILE_SCHEME ? Codicon.repo : Codicon.folder,
			group: repoUri?.scheme === GITHUB_REMOTE_FILE_SCHEME ? SESSION_WORKSPACE_GROUP_GITHUB : SESSION_WORKSPACE_GROUP_LOCAL,
			folders: [folder],
			requiresWorkspaceTrust: session.providerType !== AgentSessionProviders.Cloud,
			isVirtualWorkspace: session.providerType === AgentSessionProviders.Cloud,
		};
	}

	/**
	 * Extract repository/worktree information from session metadata.
	 * Mirrors the logic in sessionsManagementService.getRepositoryFromMetadata().
	 */
	private _extractRepositoryFromMetadata(session: IAgentSession): {
		readonly repoUri?: URI;
		readonly worktreeUri?: URI;
		readonly branchName?: string;
		readonly baseBranchName?: string;
		readonly baseBranchProtected?: boolean;
		readonly hasGitHubRemote?: boolean;
		readonly upstreamBranchName?: string;
		readonly incomingChanges?: number;
		readonly outgoingChanges?: number;
		readonly uncommittedChanges?: number;
		readonly hasGitOperationInProgress?: boolean;
	} {
		const metadata = session.metadata;
		if (!metadata) {
			return {};
		}

		if (session.providerType === AgentSessionProviders.Cloud) {
			const branch = typeof metadata.branch === 'string' ? metadata.branch : 'HEAD';
			const repositoryUri = URI.from({
				scheme: GITHUB_REMOTE_FILE_SCHEME,
				authority: 'github',
				path: `/${metadata.owner}/${metadata.name}/${encodeURIComponent(branch)}`
			});
			return { repoUri: repositoryUri };
		}

		const repoUri = typeof metadata?.repositoryPath === 'string'
			? URI.file(metadata.repositoryPath)
			: undefined;
		const worktreeUri = typeof metadata?.worktreePath === 'string'
			? URI.file(metadata.worktreePath)
			: undefined;

		return {
			repoUri,
			worktreeUri,
			branchName: metadata?.branchName as string | undefined,
			baseBranchName: metadata?.baseBranchName as string | undefined,
			baseBranchProtected: metadata?.baseBranchProtected as boolean | undefined,
			hasGitHubRemote: metadata?.hasGitHubRemote as boolean | undefined,
			upstreamBranchName: metadata?.upstreamBranchName as string | undefined,
			incomingChanges: metadata?.incomingChanges as number | undefined,
			outgoingChanges: metadata?.outgoingChanges as number | undefined,
			uncommittedChanges: metadata?.uncommittedChanges as number | undefined,
			hasGitOperationInProgress: metadata?.hasGitOperationInProgress as boolean | undefined
		};
	}
}

/**
 * Default sessions provider for Copilot CLI, Cloud, Claude, and Local session types.
 * Wraps the existing session infrastructure into the extensible provider model.
 */
export class CopilotChatSessionsProvider extends Disposable implements ISessionsProvider {

	readonly id = COPILOT_PROVIDER_ID;
	readonly label = localize('copilotChatSessionsProvider', "Copilot Chat");
	readonly icon = Codicon.copilot;
	readonly order = 0;

	get sessionTypes(): readonly ISessionType[] {
		const types: ISessionType[] = [];
		if (this._isCopilotCliAvailable()) {
			types.push(CopilotCLISessionType);
		}
		types.push(CopilotCloudSessionType);
		if (this._isClaudeAvailable()) {
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

	/**
	 * Resources of committed sessions that are currently in-flight (i.e.
	 * between {@link _sendFirstChat} entering the send and the replace
	 * event firing). Protected from spurious removal by
	 * {@link _refreshSessionCache} so that a concurrent model re-resolve
	 * cannot transiently drop them.
	 */
	private readonly _inFlightCommits = new Set<string>();

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

	/**
	 * Claude is offered by this (Copilot Chat sessions) provider only when the
	 * underlying `claudeAgent.enabled` setting is on AND the user has not opted
	 * the agent-host implementation in via `chat.agents.claude.preferAgentHost`.
	 * When the latter is true, the agent host registers Claude itself and this
	 * provider stays out of the way so the picker shows a single entry. Stepping
	 * aside only makes sense when the agent host is enabled to register Claude in
	 * its place, so the preference is not respected unless `chat.agentHost.enabled`
	 * is also on.
	 */
	private _isClaudeAvailable(): boolean {
		const claudeEnabled = this.configurationService.getValue<boolean>(CLAUDE_CODE_ENABLED_SETTING) ?? false;
		if (!claudeEnabled) {
			return false;
		}
		const preferAgentHost = this.configurationService.getValue<boolean>(ClaudePreferAgentHostAgentsSettingId) ?? false;
		if (this.agentHostEnablementService.enabled && preferAgentHost) {
			return false;
		}
		return true;
	}

	/**
	 * The Extension Host Copilot CLI is offered by this provider unless the user
	 * has hidden it via `chat.agents.copilotCli.hideExtensionHost`, in which case
	 * the Agents window picker only surfaces the Agent Host Copilot CLI entry.
	 * Hiding it only makes sense when the agent host is enabled to surface the
	 * Agent Host Copilot CLI in its place, so the setting is not respected unless
	 * `chat.agentHost.enabled` is also on.
	 */
	private _isCopilotCliAvailable(): boolean {
		const hideExtensionHost = this.configurationService.getValue<boolean>(ChatConfiguration.CopilotCliHideExtensionHostAgents) ?? false;
		if (this.agentHostEnablementService.enabled && hideExtensionHost) {
			return false;
		}
		return true;
	}

	readonly browseActions: readonly ISessionWorkspaceBrowseAction[];
	readonly supportsLocalWorkspaces = true;

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IDialogService private readonly dialogService: IDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAgentHostEnablementService private readonly agentHostEnablementService: IAgentHostEnablementService,
		@ILogService private readonly logService: ILogService,
		@IGitHubService private readonly gitHubService: IGitHubService,
		@ILabelService private readonly labelService: ILabelService,
		@IChatModeService private readonly chatModeService: IChatModeService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super();

		this._multiChatEnabled = this.configurationService.getValue<boolean>(COPILOT_MULTI_CHAT_SETTING) ?? true;

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			const affectsSessionTypes = e.affectsConfiguration(CLAUDE_CODE_ENABLED_SETTING)
				|| e.affectsConfiguration(ClaudePreferAgentHostAgentsSettingId)
				|| e.affectsConfiguration(ChatConfiguration.CopilotCliHideExtensionHostAgents);
			if (!affectsSessionTypes) {
				return;
			}
			this._onDidChangeSessionTypes.fire();
			this._refreshSessionCache();
		}));

		this.browseActions = [
			{
				label: localize('repositories', "Repositories"),
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				icon: Codicon.library,
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
		const types: ISessionType[] = [];
		if (this._isCopilotCliAvailable()) {
			types.push(CopilotCLISessionType);
		}
		if (this._isClaudeAvailable()) {
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

	private readonly _newSessions = this._register(new DisposableMap<string, NewSession>());

	/**
	 * Clear the tracked new session with the given session's id, but only if
	 * the map still holds exactly that instance. Async flows (commit wait,
	 * cache population) may complete after the entry was already replaced or
	 * removed — acting unconditionally would dispose an unrelated session.
	 *
	 * @param session The session that initiated the async flow.
	 * @param leak When `true` use {@link DisposableMap.deleteAndLeak}
	 *             (the session is still referenced elsewhere, e.g. the session
	 *             cache); otherwise use {@link DisposableMap.deleteAndDispose}.
	 */
	private _clearCurrentNewSessionIfMatch(session: NewSession, leak?: boolean): void {
		if (this._newSessions.get(session.sessionId) === session) {
			if (leak) {
				this._newSessions.deleteAndLeak(session.sessionId);
			} else {
				this._newSessions.deleteAndDispose(session.sessionId);
			}
		}
	}

	deleteNewSession(sessionId: string): void {
		if (this._newSessions.has(sessionId)) {
			this._newSessions.deleteAndDispose(sessionId);
		}
	}

	getSession(sessionId: string): ICopilotChatSession | undefined {
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			return newSession;
		}
		return this._findChatSession(sessionId);
	}

	createNewSession(workspaceUri: URI, sessionTypeId: string): ISession {
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
			this._newSessions.set(session.sessionId, session);
			return this._chatToSession(session);
		}

		if (sessionTypeId === ClaudeCodeSessionType.id) {
			const resource = URI.from({ scheme: AgentSessionProviders.Claude, path: `/untitled-${generateUuid()}` });
			const session = this.instantiationService.createInstance(ClaudeCodeNewSession, resource, workspace, this.id);
			this._newSessions.set(session.sessionId, session);
			return this._chatToSession(session);
		}

		if (sessionTypeId !== CopilotCLISessionType.id) {
			throw new Error(`Unsupported session type '${sessionTypeId}' for local workspaces`);
		}
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/untitled-${generateUuid()}` });
		const session = this.instantiationService.createInstance(CopilotCLISession, resource, workspace, this.id);
		session.setPermissionLevel(this._defaultPermissionLevel());
		this._newSessions.set(session.sessionId, session);
		return this._chatToSession(session);
	}

	createQuickChat(_sessionTypeId: string): ISession {
		// This provider is workspace-bound and does not advertise
		// `supportsQuickChats`; callers must gate on that capability.
		throw new Error('CopilotChatSessionsProvider does not support quick chats');
	}

	/**
	 * Resolves the initial permission level for a brand-new session from
	 * `chat.permissions.default`, clamped to `Default` when enterprise policy
	 * disables global auto-approval.
	 */
	private _defaultPermissionLevel(): ChatPermissionLevel {
		const policyRestricted = this.configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
		if (policyRestricted) {
			return ChatPermissionLevel.Default;
		}
		const level = this.configurationService.getValue<string>(ChatConfiguration.DefaultPermissionLevel);
		return isChatPermissionLevel(level) ? level : ChatPermissionLevel.Default;
	}

	get onDidChangeModels(): Event<void> {
		// Models can change because language models are (un)registered or because
		// the extension host updates a cloud session's `models` option group.
		return Event.signal(Event.any(
			this.languageModelsService.onDidChangeLanguageModels,
			this.chatSessionsService.onDidChangeOptionGroups
		));
	}

	getModels(sessionId: string): readonly ILanguageModelChatMetadataAndIdentifier[] {
		const session = this.getSession(sessionId);
		if (session instanceof RemoteNewSession) {
			// Cloud sessions: models come from the extension-host `models` option
			// group rather than from registered language models. Synthesize
			// language-model metadata from each option item so the shared model
			// picker widget can render them like regular language models.
			const modelOption = session.getModelOptionGroup();
			return modelOption?.group.items.map((item): ILanguageModelChatMetadataAndIdentifier => this._toSyntheticModel(item)) ?? [];
		}

		// CLI / Claude sessions: language models registered against the session's
		// `targetChatSessionType`.
		const sessionType = session?.sessionType;
		if (!sessionType) {
			return [];
		}
		return this.languageModelsService.getLanguageModelIds()
			.map((id): ILanguageModelChatMetadataAndIdentifier | undefined => {
				const metadata = this.languageModelsService.lookupLanguageModel(id);
				return metadata && metadata.targetChatSessionType === sessionType ? { identifier: id, metadata } : undefined;
			})
			.filter((m): m is ILanguageModelChatMetadataAndIdentifier => !!m);
	}

	getModelPickerOptions(sessionId: string): ISessionModelPickerOptions {
		// A session type that requires an explicit model selection cannot fall
		// back to Auto. When it has no models (e.g. the Claude agent for a
		// Copilot Free / Student user), the picker shows a "No models available"
		// state instead of Auto. Harnesses that support Auto (e.g. the Copilot
		// CLI agent) keep the Auto fallback. Derive this from the contribution's
		// declarative `showAutoModel` flag rather than hardcoding
		// session-type names.
		const sessionType = this.getSession(sessionId)?.sessionType;
		const showAutoModel = !sessionType || this.chatSessionsService.supportsAutoModelForSessionType(sessionType);
		return {
			useGroupedModelPicker: true,
			showFeatured: true,
			showUnavailableFeatured: false,
			showManageModelsAction: false,
			showAutoModel,
		};
	}

	private _toSyntheticModel(item: IChatSessionProviderOptionItem): ILanguageModelChatMetadataAndIdentifier {
		const modelMetadata = item.modelMetadata;
		return {
			identifier: item.id,
			metadata: {
				extension: new ExtensionIdentifier(''),
				name: modelMetadata?.name ?? item.name,
				id: modelMetadata?.id ?? item.id,
				vendor: modelMetadata?.vendor ?? '',
				version: modelMetadata?.version ?? '',
				family: modelMetadata?.family ?? '',
				tooltip: modelMetadata?.tooltip ?? item.tooltip,
				pricing: modelMetadata?.pricing,
				multiplierNumeric: modelMetadata?.multiplierNumeric,
				inputCost: modelMetadata?.inputCost,
				outputCost: modelMetadata?.outputCost,
				cacheCost: modelMetadata?.cacheCost,
				cacheWriteCost: modelMetadata?.cacheWriteCost,
				longContextInputCost: modelMetadata?.longContextInputCost,
				longContextOutputCost: modelMetadata?.longContextOutputCost,
				longContextCacheCost: modelMetadata?.longContextCacheCost,
				longContextCacheWriteCost: modelMetadata?.longContextCacheWriteCost,
				priceCategory: modelMetadata?.priceCategory,
				promo: modelMetadata?.promo,
				maxInputTokens: modelMetadata?.maxInputTokens ?? 0,
				maxOutputTokens: modelMetadata?.maxOutputTokens ?? 0,
				capabilities: modelMetadata?.capabilities ? {
					vision: modelMetadata.capabilities.vision,
					toolCalling: modelMetadata.capabilities.toolCalling,
				} : undefined,
				isUserSelectable: true,
				isDefaultForLocation: {},
			},
		};
	}

	setModel(sessionId: string, modelId: string): void {
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			newSession.setModelId(modelId);
			// Cloud sessions additionally persist the selection as the value of
			// the `models` option group so the extension host honours it.
			if (newSession instanceof RemoteNewSession) {
				const modelOption = newSession.getModelOptionGroup();
				const item = modelOption?.group.items.find(i => i.id === modelId);
				if (item) {
					newSession.setOptionValue(modelOption!.group.id, item);
				}
			}
			return;
		}

		this._ensureSessionCache();
		this._findChatSession(sessionId)?.setModelId(modelId);
	}

	setMode(sessionId: string, modeId: string): void {
		const setSessionMode = (session: ICopilotChatSession): void => {
			let mode: IChatMode | undefined;
			switch (modeId) {
				case ChatModeKind.Agent:
					mode = ChatMode.Agent;
					break;
				case ChatModeKind.Edit:
					mode = ChatMode.Edit;
					break;
				case ChatModeKind.Ask:
					mode = ChatMode.Ask;
					break;
				default: {
					const modes = this.chatModeService.createModes(session.resource);
					try {
						mode = modes.findModeById(modeId) ?? modes.findModeByName(modeId);
					} finally {
						modes.dispose();
					}
					break;
				}
			}

			if (mode) {
				session.setMode(mode);
			}
		};

		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			setSessionMode(newSession);
			return;
		}

		this._ensureSessionCache();
		const session = this._findChatSession(sessionId);
		if (session) {
			setSessionMode(session);
		}
	}

	setPermissionLevel(sessionId: string, level: string): void {
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			if (isChatPermissionLevel(level)) {
				newSession.setPermissionLevel(level);
			}
			return;
		}

		this._ensureSessionCache();
		const session = this._findChatSession(sessionId);
		if (session && isChatPermissionLevel(level)) {
			session.setPermissionLevel(level);
		}
	}

	setIsolationMode(sessionId: string, mode: string): void {
		if (mode !== 'worktree' && mode !== 'workspace') {
			return;
		}
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			newSession.setIsolationMode(mode);
			return;
		}

		this._ensureSessionCache();
		this._findChatSession(sessionId)?.setIsolationMode(mode);
	}

	setBranch(sessionId: string, branch: string): void {
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			newSession.setBranch(branch);
			return;
		}

		this._ensureSessionCache();
		this._findChatSession(sessionId)?.setBranch(branch);
	}

	// -- Session Actions --

	async archiveSession(sessionId: string): Promise<void> {
		// Uncommitted (NEW) sessions — including those that were cancelled mid-flight —
		// must be archived via their chat-adapter directly. Their agent-host entry
		// (if any, from `getOrCreateChatSession`) has providerType `Local`, which
		// is filtered out by `_refreshSessionCache`, so changes made through
		// `agentSession.setArchived(true)` would never propagate to the chat
		// adapter's `_isArchived` observable. The result would be a no-op tick
		// in the UI even though the agent-host model thinks the session is archived.
		const chatSession = this._findChatSession(sessionId);
		if (chatSession && isNewSession(chatSession)) {
			chatSession.setArchived(true);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(chatSession)] });
			return;
		}

		const agentSession = this._findAgentSession(sessionId);
		if (agentSession) {
			agentSession.setArchived(true);
		}
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		// See `archiveSession` for why NEW sessions take a separate path.
		const chatSession = this._findChatSession(sessionId);
		if (chatSession && isNewSession(chatSession)) {
			chatSession.setArchived(false);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(chatSession)] });
			return;
		}

		const agentSession = this._findAgentSession(sessionId);
		if (agentSession) {
			agentSession.setArchived(false);
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

		await this._deleteAgentSessions(agentSessions);

		this._sessionGroupCache.delete(sessionId);
		this._refreshSessionCache();
	}

	async deleteSessions(sessionIds: readonly string[]): Promise<void> {
		for (const sessionId of sessionIds) {
			await this.deleteSession(sessionId);
		}
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

	async renameSession(sessionId: string, title: string): Promise<void> {
		const session = this._findSession(sessionId);
		if (session) {
			await this.renameChat(sessionId, session.mainChat.get().resource, title);
		}
	}

	async deleteChat(sessionId: string, chatUri: URI, options?: IDeleteChatOptions): Promise<boolean> {
		const session = this._findSession(sessionId);

		if (!session?.capabilities.get().supportsMultipleChats) {
			throw new Error('Deleting individual chats is not supported when multi-chat is disabled');
		}

		const chatIds = this._getChatIdsInGroup(sessionId);

		// Find the chat matching the URI first, before deciding whether to
		// delete the entire session. This prevents accidentally deleting the
		// whole session when the grouping cache is stale and chatIds doesn't
		// include the chat being closed.
		const chatId = chatIds.find(id => {
			const chat = this._sessionCache.get(this._localIdFromchatId(id));
			return chat && chat.resource.toString() === chatUri.toString();
		});
		if (!chatId) {
			return false;
		}

		if (chatIds.length <= 1) {
			// This is the only chat in the session — delete the entire session
			await this.deleteSession(sessionId);
			return true;
		}

		// Delete the underlying agent session first.
		// _refreshSessionCacheMultiChat handles the removed chat gracefully:
		// it detects the chat belongs to a group with remaining siblings and
		// fires a changed event on the parent session instead of a removed event.
		const agentSession = this._findAgentSession(chatId);
		if (agentSession) {
			// Confirm deletion, unless the caller opted out (e.g. discarding a
			// transient untitled draft).
			if (!options?.skipConfirmation) {
				const confirmed = await this.dialogService.confirm({
					message: localize('deleteChat.confirm', "Are you sure you want to delete this chat?"),
					detail: localize('deleteChat.detail', "This action cannot be undone."),
					primaryButton: localize('deleteChat.delete', "Delete")
				});
				if (!confirmed.confirmed) {
					return false;
				}
			}

			await this._deleteAgentSessions([agentSession]);
		} else {
			// Untitled chat (not yet committed) - clean up directly
			const chat = this._findChatSession(chatId);
			if (chat) {
				const key = chat.resource.toString();
				this._sessionCache.delete(key);
				this._invalidateGroupingCaches();
				if (this._newSessions.has(chatId)) {
					this._newSessions.deleteAndDispose(chatId);
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
		return true;
	}

	private async _deleteAgentSessions(agentSessions: IAgentSession[]): Promise<void> {
		const cliSessionItems: { resource: URI; label: string }[] = [];
		for (const agentSession of agentSessions) {
			if (agentSession.providerType === CopilotCLISessionType.id) {
				cliSessionItems.push({ resource: agentSession.resource, label: agentSession.label });
			} else {
				await this.chatService.removeHistoryEntry(agentSession.resource);
			}
		}
		if (cliSessionItems.length > 0) {
			await this.commandService.executeCommand('agents.github.copilot.cli.deleteSessions', cliSessionItems, { skipConfirmation: true });
		}
	}

	async forkChat(sessionId: string, _sourceChat: URI, _turnId: string): Promise<IChat> {
		throw new Error(`Session '${sessionId}' does not support forking into a chat`);
	}

	async createNewChat(sessionId: string, prompt?: string): Promise<IChat> {
		const currentNewSession = this._newSessions.get(sessionId);
		if (currentNewSession) {
			const session = currentNewSession;
			let newChat: IChat;
			// new session
			if (session instanceof ClaudeCodeNewSession) {
				const newItem = await this.chatSessionsService.createNewChatSessionItem(
					session.target,
					{ prompt: prompt ?? '', initialSessionOptions: session.selectedOptions.size > 0 ? session.selectedOptions : undefined, untitledResource: session.resource },
					CancellationToken.None,
				);
				if (!newItem) {
					throw new Error('[CopilotChatSessionsProvider] Failed to create Claude session item');
				}
				(await this._createChatSession(newItem.resource, session)).dispose();
				newChat = this._toChat(session, newItem.resource);
			} else {
				(await this._createChatSession(session.resource, session)).dispose();
				newChat = this._toChat(session);
			}
			session.mainChat.set(newChat, undefined);
			return newChat;
		}

		if (!this._isMultiChatEnabled()) {
			throw new Error(`[CopilotChatSessionsProvider] Session '${sessionId}' does not support multiple chats`);
		}

		return this._createNewSubsequentChat(sessionId);
	}

	private async _createNewSubsequentChat(sessionId: string): Promise<IChat> {
		// Find the primary chat for this session
		const chatIds = this._getChatIdsInGroup(sessionId);
		const firstChatId = chatIds[0] ?? sessionId;
		const chat = this._sessionCache.get(this._localIdFromchatId(firstChatId));
		if (!chat) {
			throw new Error(`Session '${sessionId}' not found`);
		}

		if (chat.sessionType !== CopilotCLISessionType.id) {
			throw new Error('Multiple chats per session is only supported for Copilot CLI sessions');
		}

		const workspace = chat.workspace.get();
		if (!workspace) {
			throw new Error('Chat session has no associated workspace');
		}

		const folder = workspace.folders[0];
		if (!folder) {
			throw new Error('Workspace has no folder');
		}

		const newWorkspace = this.resolveWorkspace(folder.workingDirectory);
		if (!newWorkspace) {
			throw new Error(`Cannot resolve workspace for working directory URI: ${folder.workingDirectory.toString()}`);
		}

		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/untitled-${generateUuid()}` });
		const session = this.instantiationService.createInstance(CopilotCLISession, resource, newWorkspace, this.id);
		session.setModelId(chat.modelId.get());
		session.setIsolationMode('workspace');
		session.setOption(PARENT_SESSION_OPTION_ID, chat.resource.path.slice(1));
		session.setPermissionLevel(this._defaultPermissionLevel());
		session.setTitle(localize('new chat', "New Chat"));
		this._newSessions.set(session.sessionId, session);

		(await this._createChatSession(session.resource, session)).dispose();

		this._sessionCache.set(session.resource.toString(), session);
		this._invalidateGroupingCaches();
		this._sessionGroupCache.delete(sessionId);

		this._onDidGroupMembershipChange.fire({ sessionId });
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(session)] });

		return this._toChat(session);
	}

	async sendRequest(sessionId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			if (!this.uriIdentityService.extUri.isEqual(newSession.mainChat.get().resource, chatResource)) {
				throw new Error('Chat resource does not match the main chat of the current new session');
			}
			return this._sendFirstChat(newSession, chatResource, options);
		}

		const session = this._findSession(sessionId);
		if (!session) {
			throw new Error(`Session '${sessionId}' not found`);
		}

		if (!session.capabilities.get().supportsMultipleChats) {
			throw new Error('Multiple chats per session is not supported');
		}

		if (!session.chats.get().some(chat => this.uriIdentityService.extUri.isEqual(chat.resource, chatResource))) {
			throw new Error(`Chat '${chatResource.toString()}' does not belong to session '${sessionId}'`);
		}

		const key = chatResource.toString();
		const chatSession = this._sessionCache.get(key);
		if (!chatSession || !(chatSession instanceof CopilotCLISession)) {
			throw new Error(`Chat '${chatResource.toString()}' not found in session '${sessionId}'`);
		}

		return this._sendExistingChat(sessionId, chatSession, options);
	}

	private async _sendFirstChat(session: CopilotCLISession | RemoteNewSession | ClaudeCodeNewSession, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {

		const { query, attachedContext } = options;

		session.setTitle((options.title || query.split('\n')[0]).substring(0, 100) || localize('new session', "New Session"));
		session.setStatus(SessionStatus.InProgress);
		this._sessionCache.set(session.resource.toString(), session);
		this._invalidateGroupingCaches();

		// For non-CLI sessions, chatResource is already the resource we will later
		// wait for in the committed session cache. Protect it from spurious
		// removal by _refreshSessionCache before any async work begins — a
		// concurrent model re-resolve can transiently drop the session from
		// agentSessionsService.model.sessions while the send is still in-flight.
		// _refreshSessionCache to fire a `removed` event that tears down the
		// UI while the send is still in-flight.
		const committedKey = !(session instanceof CopilotCLISession)
			? chatResource.toString()
			: undefined;
		if (committedKey) {
			this._inFlightCommits.add(committedKey);
		}

		// Add the new session to the sessions model immediately so it appears in the sessions list
		const newSession = this._chatToSession(session);
		this._onDidChangeSessions.fire({ added: [newSession], removed: [], changed: [] });

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
				telemetryModeId: modeId,
				applyCodeBlockSuggestionId: undefined,
				permissionLevel,
			},
			agentIdSilent: contribution?.type,
			attachedContext,
			agentHostSessionConfig: session instanceof CopilotCLISession ? session.getAgentHostSessionConfig() : undefined,
		};

		const ref = await this._updateChatSessionState(chatResource, session, sendOptions.modeInfo?.permissionLevel);
		this.logService.debug(`[CopilotChatSessionsProvider] Sending first chat for session ${session.sessionId} with options:`, {
			userSelectedModelId: sendOptions.userSelectedModelId,
		});
		try {
			const result = await this.chatService.sendRequest(chatResource, query, sendOptions);
			if (result.kind === 'rejected') {
				// Clean up the temp session that was added to the cache and
				// dispatched as `added` above, so the UI doesn't keep showing
				// a stuck InProgress session that will never make progress.
				this._sessionCache.delete(session.resource.toString());
				this._invalidateGroupingCaches();
				this._sessionGroupCache.delete(session.sessionId);
				this._clearCurrentNewSessionIfMatch(session, /* leak */ true);
				this._onDidChangeSessions.fire({ added: [], removed: [newSession], changed: [] });
				session.dispose();
				throw new Error(`[DefaultCopilotProvider] sendRequest rejected: ${result.reason}`);
			}
			// Extract promises to detect cancellation vs normal completion
			const cts = new CancellationTokenSource();
			const responseCompletePromise = result.kind === 'sent' ? result.data.responseCompletePromise : undefined;
			const responseCreatedPromise = result.kind === 'sent' ? result.data.responseCreatedPromise : undefined;
			responseCreatedPromise?.then(r => {
				if (r?.isCanceled) {
					cts.cancel();
				}
			});

			try {
				let committedResource = chatResource;
				if (session instanceof CopilotCLISession) {
					committedResource = await this._waitForCommittedSession(session.resource, responseCompletePromise, responseCreatedPromise);
					// For CopilotCLI, protect the committed resource now that
					// we know it (Claude sessions were already protected at the
					// top of _sendFirstChat).
					this._inFlightCommits.add(committedResource.toString());
				}

				try {
					// Wait for _refreshSessionCache to populate the committed adapter
					const committedChat = await this._waitForSessionInCache(committedResource, cts.token);
					this._sessionCache.delete(session.resource.toString());
					this._clearCurrentNewSessionIfMatch(session);

					const committedSession = this._chatToSession(committedChat);
					this._sessionGroupCache.delete(session.sessionId);
					this._onDidReplaceSession.fire({ from: newSession, to: committedSession });

					return committedSession;
				} finally {
					this._inFlightCommits.delete(committedResource.toString());
				}
			} catch (error) {
				this._clearCurrentNewSessionIfMatch(session, /* leak */ true);

				if (error instanceof CancellationError) {
					session.setStatus(SessionStatus.Completed);
					this._onDidChangeSessions.fire({ added: [], removed: [], changed: [newSession] });
					return newSession;
				}

				// Unexpected error — clean up the temp session entirely
				this._sessionCache.delete(session.resource.toString());
				this._invalidateGroupingCaches();
				this._sessionGroupCache.delete(session.sessionId);
				this._onDidChangeSessions.fire({ added: [], removed: [this._chatToSession(session)], changed: [] });
				session.dispose();
				throw error;
			} finally {
				cts.dispose();
			}
		} catch (error) {
			this.logService.error(`[CopilotChatSessionsProvider] Failed to send first chat for session ${session.sessionId}:`, error);
			throw error;
		} finally {
			if (committedKey) {
				this._inFlightCommits.delete(committedKey);
			}
			ref?.dispose();
		}
	}

	private async _createChatSession(resource: URI, session: NewSession, permissionLevel?: ChatPermissionLevel): Promise<IDisposable> {
		await this.chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
		return this._updateChatSessionState(resource, session, permissionLevel);
	}

	private async _updateChatSessionState(resource: URI, session: NewSession, permissionLevel?: ChatPermissionLevel): Promise<IDisposable> {
		const modelRef = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
		if (!modelRef) {
			return Disposable.None;
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
		if (permissionLevel) {
			model.inputModel.setState({ permissionLevel });
		}
		return modelRef;
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
				telemetryModeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: newChatSession.permissionLevel.get(),
			},
			agentIdSilent: contribution?.type,
			attachedContext,
			agentHostSessionConfig: newChatSession.getAgentHostSessionConfig(),
		};

		const ref = await this._updateChatSessionState(newChatSession.resource, newChatSession);
		try {
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
				this._clearCurrentNewSessionIfMatch(newChatSession);

				// Invalidate the session group cache so it rebuilds with the committed chat
				this._sessionGroupCache.delete(sessionId);
				this._onDidGroupMembershipChange.fire({ sessionId });
				const updatedSession = this._chatToSession(committedChat);
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [updatedSession] });

				return updatedSession;
			} catch (error) {
				this._clearCurrentNewSessionIfMatch(newChatSession, /* leak */ true);

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
		} finally {
			ref.dispose();
		}
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

			// The adapter normally appears within a few hundred ms of the commit
			// event via _refreshSessionCache, but the refresh is gated on the
			// underlying provider's `provideChatSessionItems` call. Some legacy
			// providers (notably Copilot CLI's V1 contribution) scan disk for
			// session metadata on every refresh and can take 10+ seconds when
			// the on-disk session list is large or cold. If we give up too
			// early the chat widget never gets re-bound from the untitled URI
			// to the committed SDK session URI, so a follow-up message would
			// spawn a brand new SDK session instead of continuing the existing
			// one. Use a generous timeout that covers the slowest realistic
			// refresh while still failing loudly if something is genuinely
			// stuck.
			const result = await raceTimeout(
				token ? raceCancellationError(sessionPromise, token) : sessionPromise,
				30_000,
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

	private async _browseForRepo(): Promise<ISessionWorkspace | undefined> {
		const repoId = await this.commandService.executeCommand<string>(OPEN_REPO_COMMAND);
		if (repoId) {
			const uri = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${repoId}/HEAD` });
			const folder: ISessionFolder = {
				root: uri,
				workingDirectory: uri,
				name: basename(uri),
				description: undefined,
				gitRepository: undefined,
			};
			return {
				uri,
				label: this._labelFromUri(uri),
				icon: this._iconFromUri(uri),
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				folders: [folder],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: true,
			};
		}
		return undefined;
	}

	resolveWorkspace(uri: URI): ISessionWorkspace | undefined {
		if (uri.scheme !== Schemas.file && uri.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
			return undefined;
		}
		const folder: ISessionFolder = {
			root: uri,
			workingDirectory: uri,
			name: basename(uri),
			description: undefined,
			gitRepository: undefined,
		};
		return {
			uri: uri,
			label: this._labelFromUri(uri),
			description: this._descriptionFromUri(uri),
			group: uri.scheme === GITHUB_REMOTE_FILE_SCHEME ? SESSION_WORKSPACE_GROUP_GITHUB : SESSION_WORKSPACE_GROUP_LOCAL,
			icon: this._iconFromUri(uri),
			folders: [folder],
			requiresWorkspaceTrust: uri.scheme !== GITHUB_REMOTE_FILE_SCHEME,
			isVirtualWorkspace: uri.scheme === GITHUB_REMOTE_FILE_SCHEME,
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
			const cachedGroupId = groupIdByChatId.get(chat.sessionId);
			if (cachedGroupId) {
				return cachedGroupId;
			}

			const trail: ICopilotChatSession[] = [];
			const seen = new Set<string>();
			let current: ICopilotChatSession = chat;

			for (let depth = 0; depth < 100; depth++) {
				const currentCachedGroupId = groupIdByChatId.get(current.sessionId);
				if (currentCachedGroupId) {
					for (const trailChat of trail) {
						groupIdByChatId.set(trailChat.sessionId, currentCachedGroupId);
					}
					return currentCachedGroupId;
				}

				if (seen.has(current.sessionId)) {
					for (const trailChat of trail) {
						groupIdByChatId.set(trailChat.sessionId, current.sessionId);
					}
					return current.sessionId;
				}

				trail.push(current);
				seen.add(current.sessionId);

				const parentRawSessionId = this._getDirectParentRawSessionId(current);
				if (!parentRawSessionId) {
					for (const trailChat of trail) {
						groupIdByChatId.set(trailChat.sessionId, current.sessionId);
					}
					return current.sessionId;
				}

				const parentChat = chatByRawSessionId.get(parentRawSessionId);
				if (!parentChat) {
					const syntheticGroupId = this._getSyntheticGroupId(parentRawSessionId);
					for (const trailChat of trail) {
						groupIdByChatId.set(trailChat.sessionId, syntheticGroupId);
					}
					return syntheticGroupId;
				}

				current = parentChat;
			}

			groupIdByChatId.set(chat.sessionId, chat.sessionId);
			return chat.sessionId;
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
			chatIdsByGroupId.set(groupId, groupChats.map(chat => chat.sessionId));
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
		this._sessionGroupCache.delete(chatSession.sessionId);
		if (this._newSessions.has(chatSession.sessionId)) {
			this._newSessions.deleteAndLeak(chatSession.sessionId);
		}
		const removedSession = this._chatToSession(chatSession);
		this._sessionGroupCache.delete(chatSession.sessionId);
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

			if (session.providerType === AgentSessionProviders.Claude && !this._isClaudeAvailable()) {
				continue;
			}

			const key = session.resource.toString();
			currentKeys.add(key);

			const existing = this._sessionCache.get(key);
			if (existing) {
				if (existing.update(session)) {
					changedData.push(existing);
				}
			} else {
				const adapter = new AgentSessionAdapter(session, this.id, this.gitHubService);
				this._sessionCache.set(key, adapter);
				addedData.push(adapter);
				cacheChanged = true;
			}
		}

		const removedData: ICopilotChatSession[] = [];
		for (const [key, adapter] of this._sessionCache) {
			if (!currentKeys.has(key) && adapter instanceof AgentSessionAdapter && !this._inFlightCommits.has(key)) {
				removedData.push(adapter);
				cacheChanged = true;
			}
		}

		// Resolve group IDs for removed sessions BEFORE removing them from the
		// cache and invalidating grouping caches, so that child sessions are
		// correctly mapped to their parent group.
		let removedGroupIds: Map<ICopilotChatSession, string> | undefined;
		if (removedData.length > 0 && this._isMultiChatEnabled()) {
			removedGroupIds = new Map();
			for (const removed of removedData) {
				removedGroupIds.set(removed, this._getGroupIdForChat(removed));
			}
		}

		// Now remove from cache and invalidate grouping caches
		for (const removed of removedData) {
			this._sessionCache.delete(removed.resource.toString());
		}

		if (cacheChanged) {
			this._invalidateGroupingCaches();
		}

		if (addedData.length > 0 || removedData.length > 0 || changedData.length > 0) {
			if (this._isMultiChatEnabled()) {
				this._refreshSessionCacheMultiChat(addedData, removedData, changedData, removedGroupIds!);
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
		removedGroupIds: Map<ICopilotChatSession, string>,
	): void {

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
		return this._groupIdByChatIdCache?.get(chat.sessionId) ?? chat.sessionId;
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

		// The primary chat owns the settable `mainChat` observable. When `createNewChat`
		// commits a new session, it updates `primaryChat.mainChat` so the wrapping ISession
		// reflects the real backend resource without rebuilding the cached wrapper.
		const mainChat = primaryChat.mainChat;

		const groupChatsObs = observableFromEvent<readonly IChat[] | undefined>(
			this,
			Event.filter(this._onDidGroupMembershipChange.event, e => e.sessionId === sessionId),
			() => {
				const chatIds = this._getChatIdsInGroup(sessionId);
				if (chatIds.length === 0) {
					return undefined;
				}
				const resolved: ICopilotChatSession[] = [];
				for (const id of chatIds) {
					const c = this._sessionCache.get(this._localIdFromchatId(id));
					if (c) {
						resolved.push(c);
					}
				}
				if (resolved.length === 0) {
					return undefined;
				}
				return resolved.map(c => this._toChat(c));
			},
		);

		// When the group has no resolved chats (typical for a new session before
		// commit), fall back to the settable `mainChat` so it stays in sync after
		// `createNewChat` swaps it.
		const chatsObs: IObservable<readonly IChat[]> = derived(reader => {
			const groupChats = groupChatsObs.read(reader);
			return groupChats ?? [mainChat.read(reader)];
		});
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
			changesets: this._createChangesets(primaryChat.sessionType, primaryChat.workspace, chatsObs),
			changes: primaryChat.changes,
			modelId: primaryChat.modelId,
			mode: primaryChat.mode,
			loading: primaryChat.loading,
			isArchived: primaryChat.isArchived,
			isRead: chatsObs.map((chats, reader) => chats.every(c => c.isRead.read(reader))),
			description: primaryChat.description,
			lastTurnEnd: chatsObs.map((chats, reader) => this._latestDate(chats, c => c.lastTurnEnd.read(reader))),
			chats: chatsObs,
			mainChat,
			capabilities: constObservable({
				supportsMultipleChats: primaryChat.sessionType === CopilotCLISessionType.id && this._isMultiChatEnabled(),
				supportsRename: this._sessionTypeSupportsRename(primaryChat.sessionType),
				supportsDelete: this._sessionTypeSupportsDelete(primaryChat.sessionType),
				// Cloud-agent sessions run worktreeCreated tasks server-side during
				// environment provisioning, so the agents-window dispatcher must
				// not re-run them. CLI / local sessions don't.
				runsWorktreeCreatedTasks: primaryChat.sessionType === CopilotCloudSessionType.id,
			}),
		};
		this._sessionGroupCache.set(sessionId, session);
		return session;
	}

	private _chatToSingleChatSession(chat: ICopilotChatSession): ISession {
		const mainChat = chat.mainChat;
		const chatsObs = mainChat.map(c => [c] as readonly IChat[]);
		const changesets = this._createChangesets(chat.sessionType, chat.workspace, chatsObs);

		return {
			sessionId: chat.sessionId,
			resource: chat.resource,
			providerId: chat.providerId,
			sessionType: chat.sessionType,
			icon: chat.icon,
			createdAt: chat.createdAt,
			workspace: chat.workspace,
			title: chat.title,
			updatedAt: chat.updatedAt,
			status: chat.status,
			changesets,
			changes: chat.changes,
			modelId: chat.modelId,
			mode: chat.mode,
			loading: chat.loading,
			isArchived: chat.isArchived,
			isRead: chat.isRead,
			description: chat.description,
			lastTurnEnd: chat.lastTurnEnd,
			chats: chatsObs,
			mainChat,
			capabilities: constObservable({
				supportsMultipleChats: false,
				supportsRename: this._sessionTypeSupportsRename(chat.sessionType),
				supportsDelete: this._sessionTypeSupportsDelete(chat.sessionType),
				runsWorktreeCreatedTasks: chat.sessionType === CopilotCloudSessionType.id,
			}),
		};
	}

	/**
	 * Whether {@link renameChat} can rename a session of the given type. Only
	 * the CopilotCLI and Claude backends expose a rename command; others throw.
	 */
	private _sessionTypeSupportsRename(sessionType: string): boolean {
		return sessionType === CopilotCLISessionType.id || sessionType === AgentSessionProviders.Claude;
	}

	private _sessionTypeSupportsDelete(sessionType: string): boolean {
		return sessionType === CopilotCLISessionType.id;
	}

	private _toChat(chat: ICopilotChatSession, resource?: URI, interactivity: ChatInteractivity = ChatInteractivity.Full): IChat {
		return {
			resource: resource ?? chat.resource,
			createdAt: chat.createdAt,
			title: chat.title,
			updatedAt: chat.updatedAt,
			status: chat.status,
			changes: chat.changes,
			checkpoints: chat.checkpoints,
			modelId: chat.modelId,
			mode: chat.mode,
			isArchived: chat.isArchived,
			isRead: chat.isRead,
			interactivity: constObservable(interactivity),
			description: chat.description,
			lastTurnEnd: chat.lastTurnEnd,
		};
	}

	private _createChangesets(sessionType: string, workspaceObs: IObservable<ISessionWorkspace | undefined>, chatsObs: IObservable<readonly IChat[]>): IObservable<readonly ISessionChangeset[]> {
		return createChangesets(sessionType, workspaceObs, chatsObs, this.instantiationService);
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
