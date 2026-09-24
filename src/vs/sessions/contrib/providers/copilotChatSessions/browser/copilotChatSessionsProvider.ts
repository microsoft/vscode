/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { raceCancellationError, raceTimeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { IMarkdownString, MarkdownString, markdownStringEqual } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, DisposableMap, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { deepClone } from '../../../../../base/common/objects.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { constObservable, derived, IObservable, ISettableObservable, ITransaction, observableFromPromise, observableValue, observableValueOpts, transaction } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AgentSession } from '../../../../../platform/agentHost/common/agent.js';
import { parseGitHubIssueUrl } from '../../../../../platform/agentHost/common/githubIssueReferences.js';
import { getAgentSessionPullRequestUri, IAgentSession } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { getRepositoryName } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsViewer.js';
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders, AgentSessionTarget } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService, IChatSendRequestOptions } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatSessionStatus, IChatSessionsService, IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem, SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { assertAutomationSessionTemplate, IAutomationSessionTemplate } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationModelConfiguration } from '../../../automations/browser/automationModelConfiguration.js';
import { ChatModelSource, ISession, IChat, ISessionGitRepository, ISessionFolder, ISessionWorkspace, ISideChatSelection, SessionStatus, GITHUB_REMOTE_FILE_SCHEME, IGitHubInfo, IGitHubIssueRef, ISessionArtifact, SessionArtifactKind, ISessionType, ISessionWorkspaceBrowseAction, ISessionFileChange, sessionFileChangesEqual, gitHubInfoEqual, sessionWorkspaceEqual, toSessionId, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_GITHUB, IChatCheckpoints, ChatInteractivity, SessionTypeAuthRequirement, ISessionChangesSummary } from '../../../../services/sessions/common/session.js';
import { linkKey } from '../../../../common/sessionLinks.js';
import { ChatAgentLocation, ChatModeKind, ChatPermissionLevel, isChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { basename, dirname, isEqual } from '../../../../../base/common/resources.js';
import { IAutomationSessionConfiguration, IDeleteChatOptions, ISendRequestOptions, ISessionChangeEvent, ISessionConfigurationSnapshot, ISessionModelPickerOptions, ISessionModelsSnapshot, ISessionsProvider, ISessionsProviderCreateSessionOptions } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionOptionGroup } from '../../../chat/browser/newSession.js';
import { UNIFIED_WORKSPACE_PICKER_SETTING } from '../../../chat/common/constants.js';
import { CancellationToken, CancellationTokenSource, cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { getRegisteredLanguageModels, resolveModelIdentifier, resolveModelIdentifierFromLanguageModels } from '../../../../../workbench/contrib/chat/common/modelSelection.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { computePullRequestIcon, GitHubPullRequestState } from '../../../github/common/types.js';
import { computePullRequestRefPresentation } from '../../../github/browser/pullRequestIconStatus.js';
import { IPullRequestIconCache } from '../../../github/browser/pullRequestIconCache.js';
import { arrayEquals, structuralEquals } from '../../../../../base/common/equals.js';
import { createChangesets } from './copilotChatSessionsChangesets.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { isCloudSandboxEnabled } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { getWorkbenchContribution } from '../../../../../workbench/common/contributions.js';
import { CLOUD_SANDBOX_CREATION_PROVIDER_ID, CloudSandboxAgentHostContribution, type ICloudSandboxProvisionedSession } from '../../remoteAgentHost/browser/cloudSandboxAgentHostContribution.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { resolveGitRepositoryFromGitConfig } from '../../../../services/sessions/browser/gitHubRepositoryResolver.js';
import { IPathService } from '../../../../../workbench/services/path/common/pathService.js';
import { RepositoryPicker } from '../../../../../workbench/contrib/chat/browser/agentSessions/repositoryPicker.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { ReadOnlyChatSession } from '../../../../../workbench/contrib/chat/browser/remoteAgentHost/cloudSandboxReadOnlySessionHandler.js';

/** Copilot Cloud session type - cloud-hosted agent. */
export const CopilotCloudSessionType: ISessionType = {
	id: 'copilot-cloud-agent',
	label: localize('copilotCloud', "Cloud"),
	icon: Codicon.cloud,
	authRequirement: SessionTypeAuthRequirement.GitHub,
};

export const CopilotSandboxSessionType: ISessionType = {
	id: 'copilot-cloud-sandbox',
	label: localize('copilotSandbox', "Copilot"),
	icon: Codicon.copilot,
	authRequirement: SessionTypeAuthRequirement.GitHub,
};

/** Remembers the cloud sandbox choice across new sessions. */
const STORAGE_KEY_USE_SANDBOX = 'sessions.cloudSandboxPicker.useSandbox';

function getGitHubRepositoryId(repository: string): string | undefined {
	const match = /^(?:(?:https?|ssh|git):\/\/(?:git@)?github\.com\/|git@github\.com:)?(?<owner>[^/:\s]+)\/(?<repo>[^/\s]+?)(?:\.git)?\/?$/i.exec(repository);
	return match?.groups ? `${match.groups.owner}/${match.groups.repo}` : undefined;
}

export interface ICopilotChatSession {
	/** Globally unique session ID (`providerId:localId`). */
	readonly sessionId: string;
	/** Resource URI identifying this session. */
	readonly resource: URI;
	/** ID of the provider that owns this session. */
	readonly providerId: string;
	/** Session type ID (e.g., 'copilot-cloud-agent', 'copilot-cloud-sandbox'). */
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
	/** Summary of file changes produced by the session. */
	readonly changesSummary?: IObservable<ISessionChangesSummary | undefined>;
	/** File changes produced by the session. */
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	/** Currently selected model identifier. */
	readonly modelId: IObservable<string | undefined>;
	readonly modelSource: IObservable<ChatModelSource | undefined>;
	/** Currently selected mode identifier and kind. */
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined>;
	/** Whether the session is still initializing. */
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
	readonly artifacts?: IObservable<readonly ISessionArtifact[]>;
	/** Checkpoints associated with this session, if any. */
	readonly checkpoints: IObservable<IChatCheckpoints | undefined>;
	/** Whether this session is still treated as external to VS Code. Absent means `false`. */
	readonly isExternal?: IObservable<boolean>;

	readonly initialAutomationSessionConfiguration?: IAutomationSessionConfiguration;

	/**
	 * For new cloud sessions: whether the session should run in a GitHub-managed sandbox the
	 * client drives over the Agent Host Protocol, instead of the server-run cloud agent. Always
	 * `undefined` for sessions that have no such choice.
	 */
	readonly useSandbox: IObservable<boolean | undefined>;
	setUseSandbox(useSandbox: boolean): void;

	setModelId(modelId: string | undefined, source: ChatModelSource): void;

	/**
	 * Settable observable holding the {@link IChat} representation of this chat.
	 * For committed chats, the value is stable.
	 */
	readonly mainChat: ISettableObservable<IChat>;
}

const OPEN_REPO_COMMAND = 'github.copilot.chat.cloudSessions.openRepository';
const OPEN_ISSUE_COMMAND = 'github.copilot.chat.cloudSessions.openIssue';
const OPEN_PULL_REQUEST_COMMAND = 'github.copilot.chat.cloudSessions.openPullRequest';

interface IGitHubContextSelection {
	readonly repoId: string;
	readonly url: string;
	readonly label: string;
}

/** Provider ID for the Copilot Chat Sessions provider. */
export const COPILOT_PROVIDER_ID = 'default-copilot';

function isChangesSummary(changes: IAgentSession['changes']): changes is { readonly files: number; readonly insertions: number; readonly deletions: number } {
	return !!changes && !Array.isArray(changes);
}

/**
 * Builds an {@link IChat} snapshot from an {@link ICopilotChatSession}. Used to
 * seed the chat's own `mainChat` observable.
 */
function buildChatFromSession(chat: Omit<ICopilotChatSession, 'mainChat'>): IChat {
	return {
		resource: chat.resource,
		createdAt: chat.createdAt,
		workspace: chat.workspace,
		title: chat.title,
		updatedAt: chat.updatedAt,
		status: chat.status,
		changes: chat.changes,
		changesets: constObservable(undefined),
		checkpoints: chat.checkpoints,
		modelId: chat.modelId,
		modelSource: chat.modelSource,
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

function sessionArtifactsEqual(a: readonly ISessionArtifact[], b: readonly ISessionArtifact[]): boolean {
	return arrayEquals(a, b, (left, right) =>
		left.id === right.id
		&& left.kind === right.kind
		&& left.label === right.label
		&& left.isArtifact === right.isArtifact
		&& isEqual(left.link, right.link)
		&& isEqual(left.uri, right.uri)
		&& left.commitHash === right.commitHash
		&& left.isGitHub === right.isGitHub);
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

	readonly lifetimeToken = cancelOnDispose(this._store);

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

	private readonly _workspaceData = observableValue<ISessionWorkspace | undefined>(this, undefined);
	readonly workspace: IObservable<ISessionWorkspace | undefined> = this._workspaceData;

	readonly changes: IObservable<readonly ISessionFileChange[]> = observableValueOpts<readonly ISessionFileChange[]>({ owner: this, equalsFn: sessionFileChangesEqual }, []);

	readonly checkpoints: IObservable<IChatCheckpoints | undefined> = constObservable(undefined);

	private readonly _modelIdObservable = observableValue<string | undefined>(this, undefined);
	readonly modelId: IObservable<string | undefined> = this._modelIdObservable;
	protected readonly _modelSourceObservable = observableValue<ChatModelSource | undefined>(this, undefined);
	readonly modelSource: IObservable<ChatModelSource | undefined> = this._modelSourceObservable;

	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined> = observableValue(this, undefined);

	readonly loading: IObservable<boolean> = observableValue(this, false);

	private readonly _isArchived = observableValue(this, false);
	readonly isArchived: IObservable<boolean> = this._isArchived;
	readonly isRead: IObservable<boolean> = observableValue(this, true);
	readonly description: IObservable<IMarkdownString | undefined> = constObservable(undefined);
	readonly lastTurnEnd: IObservable<Date | undefined> = constObservable(undefined);
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined> = constObservable(undefined);
	private readonly _useSandbox = observableValue<boolean | undefined>(this, false);
	readonly useSandbox: IObservable<boolean | undefined> = this._useSandbox;

	readonly mainChat: ISettableObservable<IChat>;

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

	/**
	 * The repository this session targets, as `owner/repo`. A GitHub workspace root carries a ref
	 * (`/<owner>/<repo>/HEAD`, see {@link CopilotChatSessionsProvider._browseForRepository}), so this
	 * takes only the first two path segments rather than the whole path.
	 */
	get repoNwo(): string | undefined {
		return this._repoUri ? githubRemoteRepoLabel(this._repoUri) : undefined;
	}

	get query(): string | undefined { return this._query; }
	get attachedContext(): IChatRequestVariableEntry[] | undefined { return this._attachedContext; }
	get disabled(): boolean {
		return !this._repoUri && !this.selectedOptions.has('repositories');
	}

	private readonly _whenClauseKeys = new Set<string>();
	readonly modelConfiguration: AutomationModelConfiguration;

	constructor(
		readonly resource: URI,
		readonly sessionWorkspace: ISessionWorkspace,
		readonly target: AgentSessionTarget,
		providerId: string,
		readonly initialAutomationSessionConfiguration: IAutomationSessionConfiguration | undefined,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
	) {
		super();
		this.modelConfiguration = this._register(new AutomationModelConfiguration(languageModelsService, initialAutomationSessionConfiguration?.sessionTemplate));
		this.sessionId = toSessionId(providerId, resource);
		this.providerId = providerId;
		this.sessionType = target;
		this.icon = target === CopilotSandboxSessionType.id ? CopilotSandboxSessionType.icon : CopilotCloudSessionType.icon;
		this.createdAt = new Date();
		this._useSandbox.set(storageService.getBoolean(STORAGE_KEY_USE_SANDBOX, StorageScope.PROFILE, false), undefined);

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

	// -- New session configuration methods --

	setUseSandbox(useSandbox: boolean): void {
		if (this._useSandbox.get() === useSandbox) {
			return;
		}
		this._useSandbox.set(useSandbox, undefined);
		this.storageService.store(STORAGE_KEY_USE_SANDBOX, useSandbox, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	setModelId(modelId: string | undefined, source: ChatModelSource): void {
		this._modelId = modelId;
		// One update, and both halves of it: a model and where it came from are only meaningful as
		// a pair, so naming a source for a model the observable never reports would leave the
		// picker and the conversation disagreeing.
		transaction(tx => {
			this._modelSourceObservable.set(modelId ? source : undefined, tx);
			this._modelIdObservable.set(modelId, tx);
		});
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

	setOption(optionId: string, value: IChatSessionProviderOptionItem | string): void {
		if (typeof value !== 'string') {
			this.selectedOptions.set(optionId, value);
		}
		this.chatSessionsService.setSessionOption(this.resource, optionId, value);
	}

	// --- Option group accessors ---

	getModelOptionsSnapshot(): { readonly modelOption: ISessionOptionGroup | undefined; readonly isResolved: boolean } {
		const groups = this._getOptionGroups();
		if (!groups) {
			return { modelOption: undefined, isResolved: false };
		}
		const group = groups.find(g => isModelOptionGroup(g));
		if (!group) {
			return { modelOption: undefined, isResolved: true };
		}
		return { modelOption: { group, value: this._getValueForGroup(group) }, isResolved: true };
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
 * Display label for a `github-remote-file://` repo URI, in `owner/repo` form. Returns
 * `undefined` for non-GitHub URIs so callers can fall back. Used by both the new-session
 * workspace ({@link CopilotChatSessionsProvider.resolveWorkspace}) and the committed
 * session adapter ({@link AgentSessionAdapter._buildWorkspace}) so a cloud session groups
 * under the same `owner/repo` label before and after commit.
 * TODO: at some point this should be standardized and in the same list as all sessions.
 * Doing it this way for now just to keep supporting the new chat button from the group.
 */
function githubRemoteRepoLabel(uri: URI): string | undefined {
	if (uri.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
		return undefined;
	}
	// Path is `/<owner>/<repo>[/<ref>…]`; take the first two segments.
	const parts = uri.path.replace(/^\//, '').split('/');
	return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined;
}

function resolveGitHubRepositoryId(folder: ISessionFolder): string | undefined {
	const gitHubInfo = folder.gitRepository?.gitHubInfo.get();
	if (gitHubInfo) {
		return `${gitHubInfo.owner}/${gitHubInfo.repo}`;
	}

	return githubRemoteRepoLabel(folder.root);
}

/**
 * Adapts an existing Copilot Cloud {@link IAgentSession} from the chat layer into the new {@link ICopilotChatSession} facade.
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

	private readonly _changesSummary: ReturnType<typeof observableValueOpts<ISessionChangesSummary | undefined>>;
	readonly changesSummary: IObservable<ISessionChangesSummary | undefined>;

	private readonly _checkpoints: ReturnType<typeof observableValueOpts<IChatCheckpoints | undefined>>;
	readonly checkpoints: IObservable<IChatCheckpoints | undefined>;

	private readonly _modelId: ReturnType<typeof observableValue<string | undefined>>;
	private readonly _modelSource = observableValue<ChatModelSource | undefined>('agentSessionModelSource', undefined);
	readonly modelSource: IObservable<ChatModelSource | undefined> = this._modelSource;
	readonly modelId: IObservable<string | undefined>;
	readonly mode: IObservable<{ readonly id: string; readonly kind: string } | undefined>;
	readonly loading: IObservable<boolean>;

	private readonly _isArchived: ReturnType<typeof observableValue<boolean>>;
	readonly isArchived: IObservable<boolean>;

	private readonly _isRead: ReturnType<typeof observableValue<boolean>>;
	readonly isRead: IObservable<boolean>;

	private readonly _isExternal: ReturnType<typeof observableValue<boolean>>;
	readonly isExternal: IObservable<boolean>;

	private readonly _description: ReturnType<typeof observableValue<IMarkdownString | undefined>>;
	readonly description: IObservable<IMarkdownString | undefined>;

	private readonly _lastTurnEnd: ReturnType<typeof observableValue<Date | undefined>>;
	readonly lastTurnEnd: IObservable<Date | undefined>;

	private readonly _baseGitHubInfo: ReturnType<typeof observableValue<IGitHubInfo | undefined>>;
	private readonly _pullRequestBranch: ReturnType<typeof observableValue<string | undefined>>;
	private readonly _pullRequestNumberFromBranch: IObservable<IObservable<{ readonly value?: number | undefined }> | undefined>;
	private readonly _pullRequestNumberCache = new Map<string, IObservable<{ readonly value?: number | undefined }>>();
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined>;
	private readonly _artifacts: ISettableObservable<readonly ISessionArtifact[]>;
	readonly artifacts: IObservable<readonly ISessionArtifact[]>;

	/** Where a committed session runs is already decided; the choice only exists before the first send. */
	readonly useSandbox: IObservable<boolean | undefined> = constObservable(undefined);

	readonly mainChat: ISettableObservable<IChat>;

	constructor(
		session: IAgentSession,
		providerId: string,
		private readonly _gitHubService: IGitHubService,
		private readonly _pullRequestIconCache: IPullRequestIconCache,
		private readonly _logService: ILogService,
	) {
		this.sessionId = toSessionId(providerId, session.resource);
		this.resource = session.resource;
		this.providerId = providerId;
		this.sessionType = session.providerType;
		this.icon = CopilotCloudSessionType.icon;
		this.createdAt = new Date(session.timing.created);

		const artifacts = this._extractIssueArtifacts(session);
		this._artifacts = observableValueOpts({ owner: this, equalsFn: sessionArtifactsEqual }, artifacts);
		this.artifacts = this._artifacts;
		this._baseGitHubInfo = observableValue(this, this._extractGitHubInfo(session, artifacts));
		this._pullRequestBranch = observableValue(this, this._extractPullRequestBranch(session));
		this._pullRequestNumberFromBranch = derived(this, reader => {
			const base = this._baseGitHubInfo.read(reader);
			const branch = this._pullRequestBranch.read(reader);
			if (base?.pullRequest || !base || !branch) {
				return undefined;
			}
			return this._pullRequestNumberForBranch(base.owner, base.repo, branch);
		});
		this.gitHubInfo = derived(this, reader => {
			let info = this._baseGitHubInfo.read(reader);
			if (!info) {
				return undefined;
			}

			if (!info.pullRequest) {
				const pullRequestNumber = this._pullRequestNumberFromBranch.read(reader)?.read(reader).value;
				if (pullRequestNumber === undefined) {
					return info;
				}
				info = {
					...info,
					pullRequest: {
						number: pullRequestNumber,
						uri: URI.parse(`https://github.com/${info.owner}/${info.repo}/pull/${pullRequestNumber}`),
					}
				};
			}

			const pullRequest = info.pullRequest;
			if (!pullRequest) {
				return info;
			}
			if (pullRequest.uri.authority.toLowerCase() !== 'github.com') {
				return info;
			}
			const presentation = computePullRequestRefPresentation(reader, this._gitHubService, this._pullRequestIconCache, {
				owner: info.owner,
				repo: info.repo,
				number: pullRequest.number,
				uri: pullRequest.uri,
				icon: pullRequest.icon,
				title: pullRequest.title,
			}, computePullRequestIcon(GitHubPullRequestState.Open));
			return {
				...info,
				pullRequest: {
					...pullRequest,
					...presentation,
				}
			};
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

		this._changesSummary = observableValueOpts<ISessionChangesSummary | undefined>({ owner: this, equalsFn: structuralEquals }, this._extractChangesSummary(session));
		this.changesSummary = this._changesSummary;

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
		this._isExternal = observableValue(this, this._extractIsExternal(session));
		this.isExternal = this._isExternal;
		this._description = observableValue(this, this._extractDescription(session));
		this.description = this._description;
		this._lastTurnEnd = observableValue(this, session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded) : undefined);
		this.lastTurnEnd = this._lastTurnEnd;

		this.mainChat = observableValue<IChat>(this, buildChatFromSession(this));
	}

	setUseSandbox(useSandbox: boolean): void {
		// Where a committed session runs is already decided.
	}
	setModelId(modelId: string | undefined, source: ChatModelSource): void {
		transaction(tx => {
			this._modelSource.set(modelId ? source : undefined, tx);
			this._modelId.set(modelId, tx);
		});
	}

	/**
	 * Update reactive properties from a refreshed agent session.
	 */
	update(session: IAgentSession): boolean {
		let changed = false;
		transaction(tx => {
			const artifacts = this._extractIssueArtifacts(session);
			const gitHubInfo = this._extractGitHubInfo(session, artifacts);
			const pullRequestBranch = this._extractPullRequestBranch(session);
			changed = setIfChanged(this._title, session.label, tx) || changed;
			changed = setIfChanged(this._workspace, this._buildWorkspace(session), tx, sessionWorkspaceEqual) || changed;
			const updatedTime = session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created;
			changed = setIfChanged(this._updatedAt, new Date(updatedTime), tx, dateEquals) || changed;
			changed = setIfChanged(this._status, toSessionStatus(session.status), tx) || changed;
			changed = setIfChanged(this._changes, this._extractChanges(session), tx, sessionFileChangesEqual) || changed;
			changed = setIfChanged(this._changesSummary, this._extractChangesSummary(session), tx, structuralEquals) || changed;
			changed = setIfChanged(this._checkpoints, this._extractCheckpoints(session), tx, structuralEquals) || changed;
			changed = setIfChanged(this._isArchived, session.isArchived(), tx) || changed;
			changed = setIfChanged(this._isRead, session.isRead(), tx) || changed;
			changed = setIfChanged(this._isExternal, this._extractIsExternal(session), tx) || changed;
			changed = setIfChanged(this._description, this._extractDescription(session), tx, markdownStringEquals) || changed;
			changed = setIfChanged(this._lastTurnEnd, session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded) : undefined, tx, dateEquals) || changed;
			changed = setIfChanged(this._baseGitHubInfo, gitHubInfo, tx, gitHubInfoEqual) || changed;
			changed = setIfChanged(this._artifacts, artifacts, tx, sessionArtifactsEqual) || changed;
			changed = setIfChanged(this._pullRequestBranch, pullRequestBranch, tx) || changed;
		});
		return changed;
	}

	private _pullRequestNumberForBranch(owner: string, repo: string, branch: string): IObservable<{ readonly value?: number | undefined }> {
		const key = `${owner}/${repo}@${branch}`;
		const cached = this._pullRequestNumberCache.get(key);
		if (cached) {
			return cached;
		}

		const lookup = this._gitHubService.findPullRequestNumberByHeadBranch(owner, repo, branch);
		const observable = observableFromPromise(lookup);
		this._pullRequestNumberCache.set(key, observable);
		lookup.then(pullRequestNumber => {
			if (pullRequestNumber === undefined && this._pullRequestNumberCache.get(key) === observable) {
				this._pullRequestNumberCache.delete(key);
			}
		});
		return observable;
	}

	private _extractDescription(session: IAgentSession): IMarkdownString | undefined {
		if (!session.description) {
			return undefined;
		}
		return typeof session.description === 'string' ? new MarkdownString(session.description) : session.description;
	}

	/**
	 * The cloud provider marks tasks that were neither started nor adopted from VS Code. Sending
	 * a message adopts a task, and the refreshed metadata clears the mark.
	 */
	private _extractIsExternal(session: IAgentSession): boolean {
		return session.providerType === AgentSessionProviders.Cloud && session.metadata?.external === true;
	}

	private _extractIssueArtifacts(session: IAgentSession): readonly ISessionArtifact[] {
		const linkedIssues: unknown = session.metadata?.linkedIssues;
		if (linkedIssues === undefined) {
			return [];
		}
		if (!Array.isArray(linkedIssues)) {
			this._logService.warn('Ignoring invalid linked issues metadata for a cloud session.');
			return [];
		}

		const artifacts: ISessionArtifact[] = [];
		const seen = new Set<string>();
		const issues: readonly { readonly url?: unknown; readonly title?: unknown }[] = linkedIssues;
		for (const issue of issues) {
			if (!issue || typeof issue !== 'object' || typeof issue.url !== 'string' || typeof issue.title !== 'string') {
				this._logService.warn('Ignoring invalid linked issue metadata for a cloud session.');
				continue;
			}

			let link: URI;
			try {
				link = URI.parse(issue.url, true);
			} catch (error) {
				this._logService.warn('Ignoring an invalid linked issue URL for a cloud session.', error);
				continue;
			}
			if (link.scheme !== Schemas.https || !link.authority || !/^\/[\w.-]+\/[\w.-]+\/issues\/[1-9]\d*\/?$/.test(link.path)) {
				this._logService.warn('Ignoring an invalid linked issue URL for a cloud session.');
				continue;
			}

			const key = linkKey(issue.url);
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			artifacts.push({
				id: `linked-issue:${key}`,
				kind: SessionArtifactKind.Issue,
				label: issue.title || issue.url,
				isArtifact: true,
				link,
				isGitHub: true,
			});
		}
		return artifacts;
	}

	private _extractGitHubInfo(session: IAgentSession, artifacts: readonly ISessionArtifact[]): IGitHubInfo | undefined {
		const metadata = session.metadata;
		if (!metadata) {
			return undefined;
		}

		const pullRequestUri = this._extractPullRequestUri(session);
		const pullRequestIdentity = pullRequestUri ? this._extractPullRequestIdentity(pullRequestUri) : undefined;
		const { owner, repo } = pullRequestIdentity ?? this._extractOwnerRepo(session);
		if (!owner || !repo) {
			return undefined;
		}

		const issues: IGitHubIssueRef[] = [];
		for (const artifact of artifacts) {
			const issue = artifact.link && parseGitHubIssueUrl(artifact.link.toString(true));
			if (issue && artifact.link) {
				issues.push({ ...issue, uri: artifact.link, title: artifact.label });
			}
		}
		const issueInfo = issues.length ? { issues } : {};

		if (!pullRequestUri || !pullRequestIdentity) {
			return { owner, repo, ...issueInfo };
		}

		const icon = this._extractPullRequestStateIcon(session);

		const baseRefOid = typeof metadata.baseRefOid === 'string' ? metadata.baseRefOid : undefined;
		const headRefOid = typeof metadata.headRefOid === 'string' ? metadata.headRefOid : undefined;

		return {
			owner,
			repo,
			...issueInfo,
			pullRequest: {
				number: pullRequestIdentity.number,
				uri: pullRequestUri,
				icon,
				baseRefOid,
				headRefOid
			}
		};
	}

	private _extractPullRequestBranch(session: IAgentSession): string | undefined {
		if (typeof session.metadata?.host === 'string' && session.metadata.host.toLowerCase() !== 'github.com') {
			return undefined;
		}
		return typeof session.metadata?.branch === 'string' ? session.metadata.branch : undefined;
	}

	private _extractPullRequestIdentity(pullRequestUri: URI): { readonly owner: string; readonly repo: string; readonly number: number } | undefined {
		const match = /^\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)\/?$/.exec(pullRequestUri.path);
		if (!match?.groups) {
			return undefined;
		}
		return {
			owner: decodeURIComponent(match.groups.owner),
			repo: decodeURIComponent(match.groups.repo),
			number: parseInt(match.groups.number, 10),
		};
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
		return getAgentSessionPullRequestUri(session);
	}

	private _extractChanges(session: IAgentSession): readonly ISessionFileChange[] {
		return session.changes && !isChangesSummary(session.changes) ? session.changes : [];
	}

	private _extractChangesSummary(session: IAgentSession): ISessionChangesSummary | undefined {
		if (!isChangesSummary(session.changes)) {
			return undefined;
		}
		return {
			files: session.changes.files,
			additions: session.changes.insertions,
			deletions: session.changes.deletions,
		};
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
		const repoUri = this._extractRepositoryUri(session);
		const repoUriResolved = repoUri ?? URI.parse('unknown:///');

		const gitRepository: ISessionGitRepository = {
			uri: repoUriResolved,
			workTreeUri: undefined,
			isRepository: constObservable(repoUri !== undefined),
			baseBranchName: undefined,
			gitHubInfo: this.gitHubInfo,
		};

		const folder: ISessionFolder = {
			root: repoUriResolved,
			workingDirectory: repoUriResolved,
			name: basename(repoUriResolved),
			description: undefined,
			gitRepository,
		};

		return {
			uri: repoUriResolved,
			label: githubRemoteRepoLabel(repoUriResolved) ?? getRepositoryName(session) ?? basename(repoUriResolved),
			icon: repoUri ? Codicon.repo : Codicon.folder,
			group: repoUri ? SESSION_WORKSPACE_GROUP_GITHUB : SESSION_WORKSPACE_GROUP_LOCAL,
			folders: [folder],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: true,
		};
	}

	/**
	 * Resolves the `github-remote-file` URI of the repository (and branch) a cloud session runs against.
	 */
	private _extractRepositoryUri(session: IAgentSession): URI | undefined {
		const metadata = session.metadata;
		if (typeof metadata?.owner !== 'string' || typeof metadata.name !== 'string') {
			return undefined;
		}
		const branch = typeof metadata.branch === 'string' ? metadata.branch : 'HEAD';
		return URI.from({
			scheme: GITHUB_REMOTE_FILE_SCHEME,
			authority: 'github',
			path: `/${metadata.owner}/${metadata.name}/${encodeURIComponent(branch)}`
		});
	}
}

/**
 * Default sessions provider for Copilot Cloud sessions.
 * Wraps the existing session infrastructure into the extensible provider model.
 */
export class CopilotChatSessionsProvider extends Disposable implements ISessionsProvider {

	/**
	 * How long the first sandbox turn waits for the session's model catalog to arrive before
	 * dispatching without the user's model. Long enough to cover the gap between the relay
	 * connecting and the host publishing its models, short enough not to strand a send behind a
	 * catalog that is never coming. Exceeding it is reported to the user, not only logged.
	 */
	private static readonly SANDBOX_MODEL_WAIT_MS = 5_000;

	get id(): string { return this.providerMode === 'sandbox' ? CLOUD_SANDBOX_CREATION_PROVIDER_ID : COPILOT_PROVIDER_ID; }
	get label(): string { return this.providerMode === 'sandbox' ? localize('sandboxCreationProvider', "GitHub Sandboxes") : localize('copilotChatSessionsProvider', "Copilot Chat"); }
	readonly icon = Codicon.copilot;
	readonly order = 0;

	get sessionTypes(): readonly ISessionType[] {
		return this.providerMode === 'sandbox' ? [CopilotSandboxSessionType] : [CopilotCloudSessionType];
	}

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	private readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }> = this._onDidReplaceSession.event;

	/** Cache of adapted sessions, keyed by resource URI string. */
	private readonly _sessionCache = new Map<string, AgentSessionAdapter | RemoteNewSession>();

	/**
	 * Resources of committed sessions that are currently in-flight (i.e.
	 * between {@link _sendFirstChat} entering the send and the replace
	 * event firing). Protected from spurious removal by
	 * {@link _refreshSessionCache} so that a concurrent model re-resolve
	 * cannot transiently drop them.
	 */
	private readonly _inFlightCommits = new Set<string>();
	private readonly _sandboxSends = new Map<string, ISendRequestOptions>();
	private readonly _sandboxCreationChats = this._register(new DisposableMap<string, ReadOnlyChatSession>());
	private readonly _repositoryPicker = this._register(new MutableDisposable<DisposableStore>());

	/** Cache of ISession wrappers, keyed by session ID. */
	private readonly _sessionWrapperCache = new Map<string, ISession>();

	private readonly _localGitRepositoryState = new Map<string, {
		readonly isRepository: ISettableObservable<boolean>;
		readonly gitHubInfo: ISettableObservable<IGitHubInfo | undefined>;
	}>();
	private readonly _localGitRepositoryResolutionStarted = new Set<string>();

	get supportsLocalWorkspaces(): boolean { return this.providerMode !== 'sandbox'; }

	constructor(
		private readonly providerMode: 'default' | 'sandbox',
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IGitHubService private readonly gitHubService: IGitHubService,
		@IPullRequestIconCache private readonly pullRequestIconCache: IPullRequestIconCache,
		@ILabelService private readonly labelService: ILabelService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
	) {
		super();

		if (providerMode === 'sandbox') {
			this._register(this.chatSessionsService.registerChatSessionContentProvider(CopilotSandboxSessionType.id, {
				provideChatSessionContent: async resource => {
					const sessionId = toSessionId(this.id, resource);
					const options = this._sandboxSends.get(sessionId);
					if (!options) {
						throw new Error(localize('sandbox.draftNotFound', "The GitHub sandbox draft is no longer available."));
					}
					const chat = new ReadOnlyChatSession(resource, [{
						type: 'request',
						prompt: options.query,
						participant: CopilotSandboxSessionType.id,
						variableData: { variables: options.attachedContext ?? [] },
						isHidden: options.hideFromTranscript,
					}, {
						type: 'response',
						participant: CopilotSandboxSessionType.id,
						parts: [{ kind: 'markdownContent', content: new MarkdownString(localize('sandbox.starting', "Starting GitHub sandbox...")) }],
					}], undefined, constObservable(true));
					this._sandboxCreationChats.set(sessionId, chat);
					return chat;
				},
			}));
		}

		this._register(Event.filter(
			this.configurationService.onDidChangeConfiguration,
			event => event.affectsConfiguration(UNIFIED_WORKSPACE_PICKER_SETTING),
		)(() => this._onDidChangeSessionTypes.fire()));

		// Forward session changes from the underlying model
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			this._refreshSessionCache();
		}));

		this._ensureSessionCache();
	}

	get browseActions(): readonly ISessionWorkspaceBrowseAction[] {
		const useConsolidatedRemoteWorkspaces = this.configurationService.getValue<boolean>(UNIFIED_WORKSPACE_PICKER_SETTING);
		const isSandbox = this.providerMode === 'sandbox';
		const repositoryAction: ISessionWorkspaceBrowseAction = {
			label: isSandbox
				? localize('sandbox.chooseRepository', "Choose Repository...")
				: useConsolidatedRemoteWorkspaces ? localize('workInRepository', "Work in Repository...") : localize('repository', "Repository..."),
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			icon: isSandbox || useConsolidatedRemoteWorkspaces ? Codicon.github : Codicon.library,
			providerId: this.id,
			attachesContext: false,
			supportsContextAttachment: !isSandbox,
			run: () => this._browseForRepository(),
		};

		if (isSandbox) {
			return [repositoryAction];
		}

		return [
			repositoryAction,
			{
				label: localize('issue', "Issue..."),
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				icon: Codicon.issues,
				providerId: this.id,
				attachesContext: true,
				run: workspace => this._browseForGitHubContext(OPEN_ISSUE_COMMAND, Codicon.issues, workspace),
			},
			{
				label: localize('pullRequest', "Pull Request..."),
				group: SESSION_WORKSPACE_GROUP_GITHUB,
				icon: useConsolidatedRemoteWorkspaces ? Codicon.github : Codicon.gitPullRequest,
				providerId: this.id,
				attachesContext: true,
				run: workspace => this._browseForGitHubContext(OPEN_PULL_REQUEST_COMMAND, useConsolidatedRemoteWorkspaces ? Codicon.github : Codicon.gitPullRequest, workspace),
			},
		];
	}

	// -- Sessions --

	getSessionTypes(workspaceUri: URI): ISessionType[] {
		if (this.providerMode === 'sandbox') {
			return this.resolveWorkspace(workspaceUri) ? [CopilotSandboxSessionType] : [];
		}
		if (workspaceUri.scheme === GITHUB_REMOTE_FILE_SCHEME || workspaceUri.scheme === SessionType.CopilotCloud) {
			return [CopilotCloudSessionType];
		}
		// Local folders can only host a Cloud session for the GitHub repository they track.
		if (this.configurationService.getValue<boolean>(UNIFIED_WORKSPACE_PICKER_SETTING) && workspaceUri.scheme === Schemas.file) {
			const gitRepository = this._getLocalGitRepository(workspaceUri);
			gitRepository.resolveGitHubInfo?.();
			if (gitRepository.gitHubInfo.get()) {
				return [CopilotCloudSessionType];
			}
		}
		return [];
	}

	getSessions(): ISession[] {
		this._ensureSessionCache();
		return Array.from(this._sessionCache.values(), chat => this._chatToSession(chat));
	}

	// -- Session Lifecycle --

	private readonly _newSessions = this._register(new DisposableMap<string, RemoteNewSession>());

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
	private _clearCurrentNewSessionIfMatch(session: RemoteNewSession, leak?: boolean): void {
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
			this._sessionWrapperCache.delete(sessionId);
		}
	}

	getSession(sessionId: string): ICopilotChatSession | undefined {
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			return newSession;
		}
		return this._findChatSession(sessionId);
	}

	createNewSession(workspaceUri: URI, sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession {
		if (this.providerMode === 'sandbox') {
			if (!isCloudSandboxEnabled(this.configurationService) || this.configurationService.getValue<boolean>(ChatAIDisabledSettingId)) {
				throw new Error(localize('sandbox.disabled', "GitHub sandbox sessions are not enabled."));
			}
			if (sessionTypeId !== CopilotSandboxSessionType.id || options?.automationConfiguration) {
				throw new Error(localize('sandbox.unsupportedConfiguration', "This configuration is not supported for a new GitHub sandbox session."));
			}
		}
		const workspace = this.resolveWorkspace(workspaceUri);
		if (!workspace) {
			throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
		}
		const automationConfiguration = options?.automationConfiguration;
		assertAutomationSessionTemplate(automationConfiguration?.sessionTemplate);

		if (this.providerMode !== 'sandbox' && sessionTypeId !== CopilotCloudSessionType.id) {
			throw new Error(`Unsupported session type '${sessionTypeId}'`);
		}
		const cloudWorkspace = workspaceUri.scheme === GITHUB_REMOTE_FILE_SCHEME
			? workspace
			: this._getCloudWorkspaceForLocalRepository(workspace);
		if (!cloudWorkspace) {
			throw new Error('Copilot Cloud sessions require a local workspace with a GitHub remote');
		}
		const target = this.providerMode === 'sandbox' ? CopilotSandboxSessionType.id : AgentSessionProviders.Cloud;
		const resource = URI.from({ scheme: target, path: `/untitled-${generateUuid()}` });
		const session = this.instantiationService.createInstance(RemoteNewSession, resource, cloudWorkspace, target, this.id, automationConfiguration);
		this._newSessions.set(session.sessionId, session);
		try {
			this._applyAutomationSessionConfiguration(session, automationConfiguration);
			return this._chatToSession(session);
		} catch (error) {
			this._newSessions.deleteAndDispose(session.sessionId);
			throw error;
		}
	}

	private _getCloudWorkspaceForLocalRepository(workspace: ISessionWorkspace): ISessionWorkspace | undefined {
		const gitHubInfo = workspace.folders
			.map(folder => folder.gitRepository?.gitHubInfo.get())
			.find(info => info !== undefined);
		if (!gitHubInfo) {
			return undefined;
		}
		const root = URI.from({
			scheme: GITHUB_REMOTE_FILE_SCHEME,
			authority: 'github',
			path: `/${gitHubInfo.owner}/${gitHubInfo.repo}/HEAD`,
		});
		return this.resolveWorkspace(root);
	}

	getAutomationModelConfiguration(sessionId: string): AutomationModelConfiguration | undefined {
		return this._newSessions.get(sessionId)?.modelConfiguration;
	}

	async getAutomationSessionConfiguration(sessionId: string): Promise<IAutomationSessionConfiguration | undefined> {
		const session = this._newSessions.get(sessionId);
		if (!session) {
			return undefined;
		}
		const modelId = session.modelId.get();
		const modelConfiguration = session.modelConfiguration.captureModelConfiguration(modelId);
		const initialConfiguration = session.initialAutomationSessionConfiguration;
		const initialTemplate = initialConfiguration?.sessionTemplate;
		// Cloud sessions have no client-side mode or permission pickers, so the initial
		// Automation configuration is carried through unchanged.
		const initialMode = initialConfiguration?.mode ?? initialTemplate?.config?.[SessionConfigKey.Mode];
		const mode = typeof initialMode === 'string' ? initialMode : undefined;
		const initialPermissionLevel = initialConfiguration?.permissionLevel ?? initialTemplate?.config?.[SessionConfigKey.AutoApprove];
		const permissionLevel = isChatPermissionLevel(initialPermissionLevel) ? initialPermissionLevel : ChatPermissionLevel.Default;
		const config = { ...initialTemplate?.config };
		if (mode) {
			config[SessionConfigKey.Mode] = mode;
		} else {
			delete config[SessionConfigKey.Mode];
		}
		config[SessionConfigKey.AutoApprove] = permissionLevel;
		const sessionTemplate: IAutomationSessionTemplate = {
			...(modelId ? { modelId } : {}),
			...(modelConfiguration !== undefined ? { modelConfiguration } : {}),
			...(Object.keys(config).length > 0 ? { config } : {}),
		};
		return { sessionTemplate, modelId, mode, permissionLevel };
	}

	createQuickChat(_sessionTypeId: string, _options?: ISessionsProviderCreateSessionOptions): ISession {
		// This provider is workspace-bound and does not advertise
		// `supportsQuickChats`; callers must gate on that capability.
		throw new Error('CopilotChatSessionsProvider does not support quick chats');
	}

	private _applyAutomationSessionConfiguration(session: RemoteNewSession, configuration: IAutomationSessionConfiguration | undefined): void {
		if (!configuration) {
			return;
		}
		const template = configuration.sessionTemplate;
		if (template?.agent) {
			throw new Error(localize('automationCloudAgentUnsupported', "This provider does not support custom agents in Automation session templates."));
		}
		const modelId = template?.modelId ?? configuration.modelId;
		if (modelId) {
			session.setModelId(modelId, ChatModelSource.Chosen);
		}
	}

	get onDidChangeModels(): Event<void> {
		// Models can change because language models are (un)registered or because
		// the extension host updates a cloud session's `models` option group.
		return Event.signal(Event.any(
			this.languageModelsService.onDidChangeLanguageModels,
			this.chatSessionsService.onDidChangeOptionGroups
		));
	}

	getModelsSnapshot(sessionId: string, desiredModelId?: string): ISessionModelsSnapshot {
		if (this.providerMode === 'sandbox') {
			return { models: [], desiredModelResolution: resolveModelIdentifier([], desiredModelId, true), modelTarget: CopilotSandboxSessionType.id };
		}
		const session = this.getSession(sessionId);
		if (session instanceof RemoteNewSession) {
			// Cloud sessions: models come from the extension-host `models` option
			// group rather than from registered language models. Synthesize
			// language-model metadata from each option item so the shared model
			// picker widget can render them like regular language models.
			const { modelOption, isResolved } = session.getModelOptionsSnapshot();
			const models = modelOption?.group.items.map((item): ILanguageModelChatMetadataAndIdentifier => this._toSyntheticModel(item)) ?? [];
			// Cloud model readiness comes from the extension-host option group, not language-model vendors.
			return { models, desiredModelResolution: resolveModelIdentifier(models, desiredModelId, isResolved), modelTarget: session.sessionType };
		}

		// Committed sessions use language models registered against `targetChatSessionType`.
		const sessionType = session?.sessionType;
		if (!sessionType) {
			return { models: [], desiredModelResolution: resolveModelIdentifier([], desiredModelId, false), modelTarget: undefined };
		}
		const allModels = getRegisteredLanguageModels(this.languageModelsService);
		const models = allModels.filter(model => model.metadata.targetChatSessionType === sessionType);
		return {
			models,
			desiredModelResolution: resolveModelIdentifierFromLanguageModels(models, desiredModelId, this.languageModelsService, allModels),
			modelTarget: sessionType,
		};
	}

	getModelPickerOptions(sessionId: string): ISessionModelPickerOptions {
		if (this.providerMode === 'sandbox') {
			return { useGroupedModelPicker: false, showFeatured: false, showUnavailableFeatured: false, showManageModelsAction: false, showAutoModel: true };
		}
		// A session type that requires an explicit model selection cannot fall
		// back to Auto. When it has no models, the picker shows a "No models
		// available" state instead. Derive this from the contribution's
		// declarative `showAutoModel` flag rather than hardcoding session types.
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
				maxContextWindowTokens: modelMetadata?.maxContextWindowTokens,
				capabilities: modelMetadata?.capabilities ? {
					vision: modelMetadata.capabilities.vision,
					toolCalling: modelMetadata.capabilities.toolCalling,
				} : undefined,
				isUserSelectable: true,
				isDefaultForLocation: {},
			},
		};
	}

	setModel(sessionId: string, chatResource: URI, modelId: string, source: ChatModelSource): void {
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			const previousModelId = newSession.modelId.get();
			if (previousModelId && previousModelId !== modelId) {
				const resolution = this.getModelsSnapshot(sessionId, previousModelId).desiredModelResolution;
				if (resolution.kind === 'available' && resolution.model.identifier === modelId) {
					newSession.modelConfiguration.rebindModelConfiguration(previousModelId, modelId);
				}
			}
			newSession.setModelId(modelId, source);
			// Cloud sessions additionally persist the selection as the value of
			// the `models` option group so the extension host honours it.
			const { modelOption } = newSession.getModelOptionsSnapshot();
			const item = modelOption?.group.items.find(i => i.id === modelId);
			if (item) {
				newSession.setOptionValue(modelOption!.group.id, item);
			}
			return;
		}

		this._ensureSessionCache();
		const chatSession = this._sessionCache.get(chatResource.toString()) ?? this._findChatSession(sessionId);
		chatSession?.setModelId(modelId, source);
	}

	async getNewSessionConfig(sessionId: string): Promise<ISessionConfigurationSnapshot | undefined> {
		const session = this._newSessions.get(sessionId);
		if (!session) {
			return undefined;
		}
		return {
			providerConfig: deepClone(Object.fromEntries([...session.selectedOptions].map(([key, value]) => [key, value.id]))),
		};
	}

	// -- Session Actions --

	async archiveSession(sessionId: string): Promise<void> {
		// Uncommitted (NEW) sessions — including those that were cancelled mid-flight —
		// must be archived via their chat-adapter directly. Their agent-host entry
		// (if any, from `getOrCreateChatSession`) is not adapted by
		// `_refreshSessionCache`, so changes made through
		// `agentSession.setArchived(true)` would never propagate to the chat
		// adapter's `_isArchived` observable. The result would be a no-op tick
		// in the UI even though the agent-host model thinks the session is archived.
		const chatSession = this._findChatSession(sessionId);
		if (chatSession instanceof RemoteNewSession) {
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
		if (chatSession instanceof RemoteNewSession) {
			chatSession.setArchived(false);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(chatSession)] });
			return;
		}

		const agentSession = this._findAgentSession(sessionId);
		if (agentSession) {
			agentSession.setArchived(false);
		}
	}

	async setSessionReadState(sessionId: string, isRead: boolean): Promise<void> {
		const agentSession = this._findAgentSession(sessionId);
		if (agentSession && agentSession.isRead() !== isRead) {
			agentSession.setRead(isRead);
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		const agentSession = this._findAgentSession(sessionId);
		if (!agentSession) {
			// Temp session that hasn't been committed — remove it directly
			this._cleanupTempSession(sessionId);
			return;
		}

		await this.chatService.removeHistoryEntry(agentSession.resource);

		this._sessionWrapperCache.delete(sessionId);
		this._refreshSessionCache();
	}

	async deleteSessions(sessionIds: readonly string[]): Promise<void> {
		for (const sessionId of sessionIds) {
			await this.deleteSession(sessionId);
		}
	}

	async renameChat(_sessionId: string, _chatUri: URI, _title: string): Promise<void> {
		throw new Error('Renaming is not supported for Copilot Cloud sessions');
	}

	async renameSession(_sessionId: string, _title: string): Promise<void> {
		throw new Error('Renaming is not supported for Copilot Cloud sessions');
	}

	async deleteChat(_sessionId: string, _chatUri: URI, _options?: IDeleteChatOptions): Promise<boolean> {
		throw new Error('Deleting individual chats is not supported for Copilot Cloud sessions');
	}

	async forkChat(sessionId: string, _sourceChat: URI, _turnId: string): Promise<IChat> {
		throw new Error(`Session '${sessionId}' does not support forking into a chat`);
	}

	async createSideChat(sessionId: string, _sourceChat: URI, _turnId: string, _selection?: ISideChatSelection): Promise<IChat> {
		throw new Error(`Session '${sessionId}' does not support side chats`);
	}

	async createNewChat(sessionId: string, _prompt?: string): Promise<IChat> {
		const session = this._newSessions.get(sessionId);
		if (!session) {
			throw new Error(`[CopilotChatSessionsProvider] Session '${sessionId}' does not support multiple chats`);
		}
		if (this.providerMode !== 'sandbox') {
			(await this._createChatSession(session.resource, session)).dispose();
		}
		const newChat = this._withChangesets(buildChatFromSession(session), session.workspace);
		session.mainChat.set(newChat, undefined);
		return newChat;
	}

	/** Test seam: the contribution registry is global, so tests override this with a stub. */
	protected _getCloudSandboxContribution(): Pick<CloudSandboxAgentHostContribution, 'provisionSession'> {
		return getWorkbenchContribution<CloudSandboxAgentHostContribution>(CloudSandboxAgentHostContribution.ID);
	}

	/** Test seam: overridden so a test can reach the timeout without waiting out the real budget. */
	protected get _sandboxModelWaitMs(): number {
		return CopilotChatSessionsProvider.SANDBOX_MODEL_WAIT_MS;
	}

	/**
	 * Commit a cloud new-session into a GitHub-managed sandbox instead of the server-run cloud
	 * agent: provision the sandbox, then hand the session over to the remote-agent-host provider
	 * that owns it and send the first turn there.
	 *
	 * The committed session belongs to that other provider, which is why this fires
	 * `onDidReplaceSession` across providers — the same swap {@link _sendFirstChat} performs, just
	 * landing outside this provider. Mission Control starts no run for the task it creates, so the
	 * first turn has to be dispatched here rather than being picked up server-side.
	 */
	private async _sendFirstChatToSandbox(session: RemoteNewSession, repoNwo: string, options: ISendRequestOptions): Promise<ISession> {
		session.setTitle((options.title || options.query.split('\n')[0]).substring(0, 100) || localize('new session', "New Session"));
		session.setStatus(SessionStatus.InProgress);
		this._sessionCache.set(session.resource.toString(), session);
		const placeholder = this._chatToSession(session);
		this._onDidChangeSessions.fire({ added: [placeholder], removed: [], changed: [] });

		let provisioned: ICloudSandboxProvisionedSession | undefined;
		// Read before provisioning: the composer session is retired below, and its selection is the
		// only record of what the user picked for this turn.
		const selectedModel = this.providerMode === 'sandbox' ? undefined : this._selectedCloudModel(session);
		const token = this.providerMode === 'sandbox' ? session.lifetimeToken : CancellationToken.None;
		try {
			provisioned = await this._getCloudSandboxContribution().provisionSession({
				repoNwo,
				// No `baseRef`: cloud sessions have no branch picker; Mission Control chooses.
				prompt: options.query,
			}, token);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			// Send into the session's main chat rather than `createNewChat`, which would mint an
			// *additional* peer chat inside a session that already has one.
			const chat = provisioned.session.mainChat.get();
			await this._carryModelToSandbox(provisioned, chat.resource, selectedModel);
			const committed = await provisioned.provider.sendRequest(provisioned.session.sessionId, chat.resource, options);

			// Retire only once the turn is dispatched; swapping earlier bounces the view home.
			this._publishSandboxSession(provisioned, { announce: false });
			this._retirePlaceholder(session, placeholder, committed);
			return committed;
		} catch (error) {
			this.logService.error(`[CopilotChatSessionsProvider] Failed to start cloud sandbox session for ${repoNwo}:`, error);
			// The sandbox outlives a failed first turn, so list it rather than leaving it invisible.
			if (provisioned) {
				this._publishSandboxSession(provisioned);
			}
			this._sessionCache.delete(session.resource.toString());
			this._sessionWrapperCache.delete(session.sessionId);
			this._clearCurrentNewSessionIfMatch(session, /* leak */ true);
			this._onDidChangeSessions.fire({ added: [], removed: [placeholder], changed: [] });
			session.dispose();
			throw error;
		}
	}

	/** Reveal the sandbox session that {@link CloudSandboxAgentHostContribution.provisionSession} withheld from listings. */
	private _publishSandboxSession(provisioned: ICloudSandboxProvisionedSession, options?: { announce?: boolean }): void {
		provisioned.provider.publishWithheldSession(AgentSession.id(provisioned.session.resource), options);
	}

	/**
	 * The composer's model selection as the sandbox knows it, plus the label to name it by.
	 *
	 * Cloud sessions pick from the extension host's `models` option group, whose ids are the
	 * group's own item ids, while a sandbox registers its models from what the agent host
	 * advertises. Different id spaces, so only the underlying model id crosses over.
	 *
	 * Only the model, because only the model exists: an option item's `modelMetadata` is hover and
	 * pricing detail with no configuration schema, so a cloud composer never offers a thinking
	 * level or context tier to carry alongside it.
	 */
	private _selectedCloudModel(session: RemoteNewSession): { readonly rawModelId: string; readonly label: string } | undefined {
		const selectedModelId = session.selectedModelId;
		if (!selectedModelId) {
			return undefined;
		}
		const { modelOption } = session.getModelOptionsSnapshot();
		const item = modelOption?.group.items.find(i => i.id === selectedModelId);
		const rawModelId = item?.modelMetadata?.id ?? item?.id ?? selectedModelId;
		return { rawModelId, label: item?.modelMetadata?.name ?? item?.name ?? rawModelId };
	}

	/**
	 * Apply the model the user picked in the composer to the sandbox session before its first turn.
	 *
	 * Mission Control starts no run, so this client sends that turn — and a session that has never
	 * run has no model of its own to restore. Without this the turn carries no model at all and
	 * runs on whatever the agent host defaults to.
	 *
	 * A freshly connected sandbox publishes its models asynchronously, so an empty catalog is "not
	 * yet" rather than "no": resolution is awaited while it reports `pending`, bounded because the
	 * turn cannot be held indefinitely.
	 *
	 * Every path that gives up tells the user: an absent `Message.model` means "host decides", so
	 * nothing downstream would report running at a capability and price they did not choose.
	 */
	private async _carryModelToSandbox(provisioned: ICloudSandboxProvisionedSession, chatResource: URI, selected: { readonly rawModelId: string; readonly label: string } | undefined): Promise<void> {
		if (!selected) {
			return;
		}
		const { rawModelId, label } = selected;
		const sessionId = provisioned.session.sessionId;
		const provider = provisioned.provider;

		// Agent-host models are published under the session's model target, so that is the vendor
		// prefix their identifiers carry. Without it there is nothing to resolve against.
		const modelTarget = provider.getModelsSnapshot(sessionId).modelTarget;
		if (!modelTarget) {
			this.logService.info(`[CopilotChatSessionsProvider] Sandbox session ${sessionId} reported no model target; letting the agent host choose.`);
			this._notifySandboxModelNotApplied(label);
			return;
		}
		const desiredModelId = `${modelTarget}:${rawModelId}`;

		const store = new DisposableStore();
		try {
			const deadline = Date.now() + this._sandboxModelWaitMs;
			for (; ;) {
				const resolution = provider.getModelsSnapshot(sessionId, desiredModelId).desiredModelResolution;
				if (resolution.kind === 'available') {
					provider.setModel(sessionId, chatResource, resolution.model.identifier, ChatModelSource.CarriedOver);
					return;
				}
				if (resolution.kind !== 'pending') {
					this.logService.info(`[CopilotChatSessionsProvider] Sandbox session ${sessionId} does not advertise model '${rawModelId}'; letting the agent host choose.`);
					this._notifySandboxModelNotApplied(label);
					return;
				}
				const remaining = deadline - Date.now();
				// `raceTimeout` signals a timeout with `undefined`, which is also what a `void`
				// event resolves to — map the event to a value that tells the two apart.
				const published = remaining > 0
					? await raceTimeout(Event.toPromise(provider.onDidChangeModels, store).then(() => true), remaining)
					: undefined;
				if (!published) {
					this.logService.warn(`[CopilotChatSessionsProvider] Sandbox session ${sessionId} had not published model '${rawModelId}' in time; letting the agent host choose.`);
					this._notifySandboxModelNotApplied(label);
					return;
				}
			}
		} finally {
			store.dispose();
		}
	}

	/** Name the model so the substitution is attributable. A warning: the turn still runs. */
	private _notifySandboxModelNotApplied(label: string): void {
		this.notificationService.warn(localize('sandboxModelNotApplied', "Couldn't use {0} for this session. The agent's default model will be used instead.", label));
	}

	/** Retire the optimistic placeholder in favour of the session that now exists. */
	private _retirePlaceholder(session: RemoteNewSession, placeholder: ISession, committed: ISession): void {
		this._sessionCache.delete(session.resource.toString());
		this._sessionWrapperCache.delete(session.sessionId);
		this._clearCurrentNewSessionIfMatch(session);
		this._onDidReplaceSession.fire({ from: placeholder, to: committed });
	}

	async sendRequest(sessionId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		if (this._sandboxSends.has(sessionId)) {
			throw new Error(localize('sandbox.alreadyStarting', "A GitHub sandbox session is already being started. Wait for it to finish before sending another message."));
		}
		const newSession = this._newSessions.get(sessionId);
		if (newSession) {
			if (!this.uriIdentityService.extUri.isEqual(newSession.mainChat.get().resource, chatResource)) {
				throw new Error('Chat resource does not match the main chat of the current new session');
			}
			if (this.providerMode === 'sandbox') {
				if (!newSession.repoNwo || !isCloudSandboxEnabled(this.configurationService) || this.configurationService.getValue<boolean>(ChatAIDisabledSettingId)) {
					throw new Error(localize('sandbox.unavailable', "GitHub sandbox creation is no longer available. Enable the feature and choose a repository to try again."));
				}
				this._sandboxSends.set(sessionId, options);
				try {
					return await this._sendFirstChatToSandbox(newSession, newSession.repoNwo, options);
				} finally {
					this._sandboxSends.delete(sessionId);
					this._sandboxCreationChats.deleteAndDispose(sessionId);
				}
			}
			// `useSandbox` is persisted, so it can outlive the setting being turned off. Re-check
			// rather than trust it: falling back to the cloud agent beats a send that must fail.
			if (newSession.useSandbox.get() && newSession.repoNwo && isCloudSandboxEnabled(this.configurationService)) {
				return this._sendFirstChatToSandbox(newSession, newSession.repoNwo, options);
			}
			return this._sendFirstChat(newSession, chatResource, options);
		}

		if (!this._findChatSession(sessionId)) {
			throw new Error(`Session '${sessionId}' not found`);
		}
		// Follow-up turns on committed sessions are sent from their chat directly; this provider
		// does not add further chats to a session.
		throw new Error('Multiple chats per session is not supported');
	}

	private async _sendFirstChat(session: RemoteNewSession, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		const { query, attachedContext } = options;

		session.setTitle((options.title || query.split('\n')[0]).substring(0, 100) || localize('new session', "New Session"));
		session.setStatus(SessionStatus.InProgress);
		this._sessionCache.set(session.resource.toString(), session);

		// Add the new session to the sessions model immediately so it appears in the sessions list
		const newSession = this._chatToSession(session);
		this._onDidChangeSessions.fire({ added: [newSession], removed: [], changed: [] });

		const contribution = this.chatSessionsService.getChatSessionContribution(session.target);

		// Cloud sessions always run the built-in agent with default permissions.
		const permissionLevel = ChatPermissionLevel.Default;

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: session.selectedModelId,
			userSelectedModelConfiguration: session.modelConfiguration.getModelConfigurationForRequest(session.selectedModelId),
			modeInfo: {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				telemetryModeId: ChatModeKind.Agent,
				applyCodeBlockSuggestionId: undefined,
				permissionLevel,
			},
			agentIdSilent: contribution?.type,
			attachedContext,
			hideFromTranscript: options.hideFromTranscript,
		};

		const ref = await this._updateChatSessionState(chatResource, session, permissionLevel);
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
				this._sessionWrapperCache.delete(session.sessionId);
				this._clearCurrentNewSessionIfMatch(session, /* leak */ true);
				this._onDidChangeSessions.fire({ added: [], removed: [newSession], changed: [] });
				session.dispose();
				throw new Error(`[DefaultCopilotProvider] sendRequest rejected: ${result.reason}`);
			}
			// Extract the response promise to detect cancellation
			const cts = new CancellationTokenSource();
			const responseCreatedPromise = result.kind === 'sent' ? result.data.responseCreatedPromise : undefined;
			responseCreatedPromise?.then(r => {
				if (r?.isCanceled) {
					cts.cancel();
				}
			});

			try {
				// Learn the committed resource (untitled → real) from the commit
				// event, then protect it now that we know it.
				const committedResource = await this._waitForCommittedSession(session.resource, responseCreatedPromise);
				this._inFlightCommits.add(committedResource.toString());

				try {
					// Wait for _refreshSessionCache to populate the committed adapter
					const committedChat = await this._waitForSessionInCache(committedResource, cts.token);
					this._sessionCache.delete(session.resource.toString());
					this._clearCurrentNewSessionIfMatch(session);

					const committedSession = this._chatToSession(committedChat);
					this._sessionWrapperCache.delete(session.sessionId);
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
				this._sessionWrapperCache.delete(session.sessionId);
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
			ref?.dispose();
		}
	}

	private async _createChatSession(resource: URI, session: RemoteNewSession): Promise<IDisposable> {
		await this.chatSessionsService.getOrCreateChatSession(resource, CancellationToken.None);
		return this._updateChatSessionState(resource, session);
	}

	private async _updateChatSessionState(resource: URI, session: RemoteNewSession, permissionLevel?: ChatPermissionLevel): Promise<IDisposable> {
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
		if (session.selectedOptions.size > 0) {
			this.chatSessionsService.updateSessionOptions(resource, session.selectedOptions);
		}
		if (permissionLevel) {
			model.inputModel.setState({ permissionLevel });
		}
		return modelRef;
	}

	/**
	 * Waits for the committed (real) URI for a session by listening to the
	 * {@link IChatSessionsService.onDidCommitSession} event.
	 *
	 * Cloud sessions defer their commit behind a confirmation round-trip and
	 * network delegation. Response completion fires early (at the confirmation)
	 * and is not a signal that the commit won't come, so the wait is bounded by
	 * a generous timeout and by the response being cancelled instead.
	 */
	private async _waitForCommittedSession(untitledResource: URI, responseCreatedPromise?: Promise<IChatResponseModel>): Promise<URI> {
		const timeoutMs = 5 * 60_000;
		const disposables = new DisposableStore();
		try {
			const commitPromise = new Promise<URI>(resolve => {
				disposables.add(this.chatSessionsService.onDidCommitSession(e => {
					if (isEqual(e.original, untitledResource)) {
						resolve(e.committed);
					}
				}));
			});

			// Race commit against a safety timeout. If a response-created
			// promise is available, also race it so we can detect
			// cancellation immediately instead of waiting for the timeout.
			const candidates: Promise<{ kind: 'commit'; uri: URI } | { kind: 'timeout' } | { kind: 'cancelled' }>[] = [
				raceTimeout(commitPromise, timeoutMs).then(uri => uri ? { kind: 'commit' as const, uri } : { kind: 'timeout' as const }),
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

			// The adapter normally appears shortly after the commit event via
			// _refreshSessionCache, but the refresh is gated on the underlying
			// provider's `provideChatSessionItems` call. If we give up too early
			// the chat widget never gets re-bound from the untitled URI to the
			// committed session URI, so a follow-up message would start a new
			// session instead of continuing the existing one. Use a generous
			// timeout that covers a slow refresh while still failing loudly if
			// something is genuinely stuck.
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

	private async _pickRepository(allowRepositoryUrl = false): Promise<string | undefined> {
		if (isWeb) {
			const store = new DisposableStore();
			this._repositoryPicker.value = store;
			const token = cancelOnDispose(store);
			const checkHost = () => {
				if (this.gitHubService.enterpriseHost !== undefined) {
					throw new Error(localize('repositoryPicker.unsupportedHost', "This picker supports github.com repositories only. Switch to a github.com account, then try again."));
				}
			};
			try {
				checkHost();
				await raceCancellationError(this.gitHubService.authenticateForRepositoryAccess(token), token);
				if (token.isCancellationRequested) {
					return undefined;
				}
				checkHost();
				const picker = store.add(this.instantiationService.createInstance(RepositoryPicker));
				const selection = await picker.pickRepository(async (query, requestToken) => {
					checkHost();
					const repositories = await this.gitHubService.getRepositories(getGitHubRepositoryId(query.trim()) ?? query, requestToken);
					checkHost();
					return repositories.map(repository => repository.fullName);
				}, undefined, token);
				if (selection) {
					checkHost();
				}
				return selection?.repository;
			} catch (error) {
				if (!isCancellationError(error) && !token.isCancellationRequested) {
					this.notificationService.error(error);
				}
				return undefined;
			} finally {
				store.dispose();
				if (this._repositoryPicker.value === store) {
					this._repositoryPicker.clear();
				}
			}
		}

		return this.commandService.executeCommand<string>(
			OPEN_REPO_COMMAND,
			undefined,
			{ allowRepositoryUrl },
		);
	}

	private async _browseForRepository(): Promise<ISessionWorkspace | undefined> {
		const allowRepositoryUrl = this._supportsLocalRepositoryActions();
		const repository = await this._pickRepository(allowRepositoryUrl);
		if (!repository) {
			return undefined;
		}
		const repoId = getGitHubRepositoryId(repository);
		if (!repoId) {
			return allowRepositoryUrl ? this._cloneRepository(repository) : undefined;
		}
		const uri = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${repoId}/HEAD` });
		const folder: ISessionFolder = {
			root: uri,
			workingDirectory: uri,
			name: basename(uri),
			description: undefined,
			gitRepository: undefined,
		};
		return {
			uri: URI.parse(`https://github.com/${repoId}`),
			label: this._labelFromUri(uri),
			icon: this._iconFromUri(uri),
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			folders: [folder],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: true,
		};
	}

	private _supportsLocalRepositoryActions(): boolean {
		return this.supportsLocalWorkspaces && !isWeb
			&& (this.pathService.defaultUriScheme === Schemas.file
				|| this.pathService.defaultUriScheme === GITHUB_REMOTE_FILE_SCHEME
				|| this.pathService.defaultUriScheme === SessionType.CopilotCloud);
	}

	private async _cloneRepository(url: string): Promise<ISessionWorkspace | undefined> {
		try {
			const repositoryPath = await this.commandService.executeCommand<string>(
				'git.clone',
				url,
				undefined,
				{ postCloneAction: 'none', returnRepositoryPath: true },
			);
			if (repositoryPath?.endsWith('.code-workspace')) {
				this.notificationService.error(localize('cloneRepository.workspaceFile', "The selected clone is a workspace file. Choose the repository again to select a repository folder."));
				return undefined;
			}
			return repositoryPath ? this.resolveWorkspace(URI.file(repositoryPath)) : undefined;
		} catch (error) {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
			return undefined;
		}
	}

	private async _browseForGitHubContext(commandId: string, icon: ThemeIcon, currentWorkspace: ISessionWorkspace | undefined): Promise<ISessionWorkspace | undefined> {
		const repositoryIds = new Set<string>();
		for (const folder of currentWorkspace?.folders ?? []) {
			const repositoryId = resolveGitHubRepositoryId(folder);
			if (repositoryId) {
				repositoryIds.add(repositoryId);
			}
		}

		const repository = repositoryIds.size === 1
			? repositoryIds.values().next().value
			: currentWorkspace?.folders.length === 1 && currentWorkspace.folders[0].root.scheme === Schemas.file
				? currentWorkspace.folders[0].root
				: await this._pickRepository();
		if (!repository) {
			return undefined;
		}

		const selection = await this.commandService.executeCommand<IGitHubContextSelection>(commandId, repository);
		if (!selection) {
			return undefined;
		}
		const root = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: `/${selection.repoId}/HEAD` });
		return {
			uri: URI.parse(selection.url),
			label: selection.label,
			icon,
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			folders: [{
				root,
				workingDirectory: root,
				name: basename(root),
				description: undefined,
				gitRepository: undefined,
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: true,
		};
	}

	resolveWorkspace(uri: URI): ISessionWorkspace | undefined {
		if (this.providerMode === 'sandbox' && (uri.scheme !== GITHUB_REMOTE_FILE_SCHEME || uri.authority !== 'github' || !/^\/[^/]+\/[^/]+\/HEAD$/.test(uri.path) || uri.query || uri.fragment)) {
			return undefined;
		}
		if (uri.scheme !== Schemas.file && uri.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
			return undefined;
		}
		const folder: ISessionFolder = {
			root: uri,
			workingDirectory: uri,
			name: basename(uri),
			description: undefined,
			gitRepository: uri.scheme === Schemas.file ? this._getLocalGitRepository(uri) : undefined,
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

	private _getLocalGitRepository(uri: URI): ISessionGitRepository {
		const state = this._getLocalGitRepositoryState(uri);
		const resolveRepository = () => this._resolveLocalGitRepository(uri, state);
		return {
			uri,
			workTreeUri: uri,
			baseBranchName: undefined,
			isRepository: state.isRepository,
			gitHubInfo: state.gitHubInfo,
			resolveRepository,
			resolveGitHubInfo: resolveRepository,
		};
	}

	private _getLocalGitRepositoryState(uri: URI): {
		readonly isRepository: ISettableObservable<boolean>;
		readonly gitHubInfo: ISettableObservable<IGitHubInfo | undefined>;
	} {
		const key = this.uriIdentityService.extUri.getComparisonKey(uri);
		let state = this._localGitRepositoryState.get(key);
		if (state) {
			return state;
		}
		if (this._localGitRepositoryState.size >= 50) {
			const oldestKey = this._localGitRepositoryState.keys().next().value;
			if (oldestKey !== undefined) {
				this._localGitRepositoryState.delete(oldestKey);
				this._localGitRepositoryResolutionStarted.delete(oldestKey);
			}
		}
		state = {
			isRepository: observableValue(this, false),
			gitHubInfo: observableValue<IGitHubInfo | undefined>(this, undefined),
		};
		this._localGitRepositoryState.set(key, state);
		return state;
	}

	private _resolveLocalGitRepository(uri: URI, state: {
		readonly isRepository: ISettableObservable<boolean>;
		readonly gitHubInfo: ISettableObservable<IGitHubInfo | undefined>;
	}): void {
		const key = this.uriIdentityService.extUri.getComparisonKey(uri);
		if (this._localGitRepositoryResolutionStarted.has(key)) {
			return;
		}
		this._localGitRepositoryResolutionStarted.add(key);
		void resolveGitRepositoryFromGitConfig(this.fileService, uri).then(repositoryInfo => {
			if (this._localGitRepositoryState.get(key) !== state) {
				this._localGitRepositoryResolutionStarted.delete(key);
				return;
			}
			if (!repositoryInfo) {
				this._localGitRepositoryResolutionStarted.delete(key);
				return;
			}
			const nextGitHubInfo = repositoryInfo.gitHub
				? { owner: repositoryInfo.gitHub.owner, repo: repositoryInfo.gitHub.repo }
				: undefined;
			if (!state.isRepository.get() || !gitHubInfoEqual(state.gitHubInfo.get(), nextGitHubInfo)) {
				transaction(tx => {
					state.isRepository.set(true, tx);
					state.gitHubInfo.set(nextGitHubInfo, tx);
				});
				this._onDidChangeSessionTypes.fire();
			}
			if (!repositoryInfo.gitHub) {
				this._localGitRepositoryResolutionStarted.delete(key);
			}
		}, error => {
			this._localGitRepositoryResolutionStarted.delete(key);
			this.logService.warn(`Failed to resolve Git repository metadata for '${uri.toString()}'.`, error);
		});
	}

	private _labelFromUri(uri: URI): string {
		return githubRemoteRepoLabel(uri) ?? basename(uri);
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

	/**
	 * Cleans up a temp session (one that hasn't been committed) from the cache.
	 * Used when delete/archive is invoked on a session that is still pending
	 * commit (e.g. was stopped before the cloud agent picked it up).
	 */
	private _cleanupTempSession(sessionId: string): void {
		const chatSession = this._findChatSession(sessionId);
		if (!chatSession) {
			return;
		}
		this._sessionCache.delete(chatSession.resource.toString());
		if (this._newSessions.has(chatSession.sessionId)) {
			this._newSessions.deleteAndLeak(chatSession.sessionId);
		}
		const removedSession = this._chatToSession(chatSession);
		this._sessionWrapperCache.delete(chatSession.sessionId);
		this._onDidChangeSessions.fire({ added: [], removed: [removedSession], changed: [] });
		if (chatSession instanceof RemoteNewSession) {
			chatSession.dispose();
		}
	}

	private _refreshSessionCache(): void {
		if (this.providerMode === 'sandbox') {
			return;
		}
		const currentKeys = new Set<string>();
		const addedData: ICopilotChatSession[] = [];
		const changedData: ICopilotChatSession[] = [];
		// Underlying agent sessions whose turn just completed and should be marked
		// unread. Processed after the loop so `setRead` does not re-enter mid-iteration.
		const sessionsToMarkUnread: IAgentSession[] = [];

		for (const session of this.agentSessionsService.model.sessions) {
			// Only Copilot Cloud sessions surface in the Agents window through this provider.
			if (session.providerType !== AgentSessionProviders.Cloud) {
				continue;
			}

			const key = session.resource.toString();
			currentKeys.add(key);

			const existing = this._sessionCache.get(key);
			if (existing) {
				const previousStatus = existing.status.get();
				if (existing.update(session)) {
					changedData.push(existing);
				}
				// A completed turn (InProgress → terminal) marks the session
				// unread. Copilot read state is owned by the agent session model,
				// so route through `setRead(false)`; the adapter mirrors it back.
				const currentStatus = existing.status.get();
				if (previousStatus === SessionStatus.InProgress
					&& currentStatus !== SessionStatus.InProgress
					&& currentStatus !== SessionStatus.Untitled
					&& existing.isRead.get()) {
					sessionsToMarkUnread.push(session);
				}
			} else {
				const adapter = new AgentSessionAdapter(session, this.id, this.gitHubService, this.pullRequestIconCache, this.logService);
				this._sessionCache.set(key, adapter);
				addedData.push(adapter);
			}
		}

		const removedData: ICopilotChatSession[] = [];
		for (const [key, adapter] of this._sessionCache) {
			if (!currentKeys.has(key) && adapter instanceof AgentSessionAdapter && !this._inFlightCommits.has(key)) {
				removedData.push(adapter);
			}
		}
		for (const removed of removedData) {
			this._sessionCache.delete(removed.resource.toString());
		}

		if (addedData.length > 0 || removedData.length > 0 || changedData.length > 0) {
			this._onDidChangeSessions.fire({
				added: addedData.map(d => this._chatToSession(d)),
				removed: removedData.map(d => {
					const session = this._chatToSession(d);
					this._sessionWrapperCache.delete(d.sessionId);
					return session;
				}),
				changed: changedData.map(d => this._chatToSession(d)),
			});
		}

		// Mark completed-turn sessions unread after the change events above (and
		// outside the iteration) so the model's change event re-enters cleanly.
		for (const session of sessionsToMarkUnread) {
			session.setRead(false);
		}
	}

	private _findChatSession(sessionId: string): ICopilotChatSession | undefined {
		return this._sessionCache.get(this._localIdFromSessionId(sessionId));
	}

	private _findAgentSession(sessionId: string): IAgentSession | undefined {
		const adapter = this._findChatSession(sessionId);
		if (!adapter) {
			return undefined;
		}
		return this.agentSessionsService.getSession(adapter.resource);
	}

	private _localIdFromSessionId(sessionId: string): string {
		const prefix = `${this.id}:`;
		return sessionId.startsWith(prefix) ? sessionId.substring(prefix.length) : sessionId;
	}

	/**
	 * Wraps an {@link ICopilotChatSession} into an {@link ISession} with a single chat.
	 * Wrappers are cached per session so repeated lookups return the same instance.
	 */
	private _chatToSession(chat: ICopilotChatSession): ISession {
		const cached = this._sessionWrapperCache.get(chat.sessionId);
		if (cached) {
			return cached;
		}

		const mainChat = chat.mainChat.map(mainChat => this._withChangesets(mainChat, chat.workspace));
		const chatsObs = mainChat.map(c => [c] as readonly IChat[]);
		const session: ISession = {
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
			changesSummary: chat.changesSummary,
			artifacts: chat.artifacts,
			modelId: chat.modelId,
			mode: chat.mode,
			loading: chat.loading,
			isArchived: chat.isArchived,
			isRead: chat.isRead,
			description: chat.description,
			lastTurnEnd: chat.lastTurnEnd,
			chats: chatsObs,
			mainChat,
			isExternal: chat.isExternal,
			capabilities: constObservable({
				supportsMultipleChats: false,
				supportsRename: false,
				supportsDelete: false,
				// Cloud-agent sessions run worktreeCreated tasks server-side during
				// environment provisioning, so the agents-window dispatcher must
				// not re-run them.
				runsWorktreeCreatedTasks: chat.sessionType === CopilotCloudSessionType.id,
			}),
		};
		this._sessionWrapperCache.set(chat.sessionId, session);
		return session;
	}

	private _withChangesets(chat: Omit<IChat, 'changesets'>, workspace: IObservable<ISessionWorkspace | undefined>): IChat {
		return {
			...chat,
			changesets: createChangesets(workspace, constObservable([chat]), this.instantiationService),
		};
	}
}
