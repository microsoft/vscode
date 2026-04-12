/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CopilotCLISession_1;
import { Emitter, Event } from '../../../../base/common/event.js';
import { raceTimeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, observableFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { themeColorFromId } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { getRepositoryName } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsViewer.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../sessions/common/sessionData.js';
import { ChatAgentLocation, ChatModeKind, ChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ILanguageModelToolsService } from '../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { isBuiltinChatMode } from '../../../../workbench/contrib/chat/common/chatModes.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { IContextKeyService, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../nls.js';
import { CopilotCLISessionType, CopilotCloudSessionType } from '../../sessions/browser/sessionTypes.js';
import { SessionsGroupModel } from '../../sessions/browser/sessionsGroupModel.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
const OPEN_REPO_COMMAND = 'github.copilot.chat.cloudSessions.openRepository';
/** Provider ID for the Copilot Chat Sessions provider. */
export const COPILOT_PROVIDER_ID = 'default-copilot';
/** Setting key controlling whether the Copilot provider supports multiple chats per session. */
export const COPILOT_MULTI_CHAT_SETTING = 'sessions.github.copilot.multiChatSessions';
const REPOSITORY_OPTION_ID = 'repository';
const BRANCH_OPTION_ID = 'branch';
const ISOLATION_OPTION_ID = 'isolation';
const AGENT_OPTION_ID = 'agent';
/**
 * Local new session for Background agent sessions.
 * Implements {@link ICopilotChatSession} (session facade) and provides
 * pre-send configuration methods for the new-session flow.
 */
let CopilotCLISession = class CopilotCLISession extends Disposable {
    static { CopilotCLISession_1 = this; }
    static { this.COPILOT_WORKTREE_PATTERN = 'copilot-worktree-'; }
    get selectedModelId() { return this._modelId; }
    get chatMode() { return this._mode; }
    get query() { return this._query; }
    get attachedContext() { return this._attachedContext; }
    get gitRepository() { return this._gitRepository; }
    get disabled() {
        if (!this._repoUri) {
            return true;
        }
        if (this._isolationMode === 'worktree' && !this._branch) {
            return true;
        }
        return false;
    }
    constructor(resource, sessionWorkspace, providerId, chatSessionsService, gitService) {
        super();
        this.resource = resource;
        this.sessionWorkspace = sessionWorkspace;
        this.chatSessionsService = chatSessionsService;
        this.gitService = gitService;
        this._title = observableValue(this, '');
        this.title = this._title;
        this._updatedAt = observableValue(this, new Date());
        this.updatedAt = this._updatedAt;
        this._status = observableValue(this, 0 /* SessionStatus.Untitled */);
        this.status = this._status;
        this._permissionLevel = observableValue(this, ChatPermissionLevel.Default);
        this.permissionLevel = this._permissionLevel;
        this._workspaceData = observableValue(this, undefined);
        this.workspace = this._workspaceData;
        this._branchObservable = observableValue(this, undefined);
        this.branch = this._branchObservable;
        this._isolationModeObservable = observableValue(this, 'worktree');
        this.isolationMode = this._isolationModeObservable;
        this._modelIdObservable = observableValue(this, undefined);
        this.modelId = this._modelIdObservable;
        this._modeObservable = observableValue(this, undefined);
        this.mode = this._modeObservable;
        this._loading = observableValue(this, true);
        this.loading = this._loading;
        this.isArchived = observableValue(this, false);
        this.isRead = observableValue(this, true);
        this.lastTurnEnd = observableValue(this, undefined);
        this.gitHubInfo = observableValue(this, undefined);
        this._loadBranchesCts = this._register(new MutableDisposable());
        // -- Branch state --
        this._branches = observableValue(this, []);
        this.branches = this._branches;
        this.target = AgentSessionProviders.Background;
        this.selectedOptions = new Map();
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
        this._changes = observableValue(this, []);
        this.changes = this._changes;
    }
    async _resolveGitRepository() {
        const repoUri = this.sessionWorkspace.repositories[0]?.uri;
        if (repoUri) {
            try {
                this._gitRepository = await this.gitService.openRepository(repoUri);
                if (!this._gitRepository) {
                    this.setIsolationMode('workspace');
                }
            }
            catch {
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
                return state?.HEAD?.name;
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
    _loadBranches(repo) {
        this._loadBranchesCts.value?.cancel();
        const cts = this._loadBranchesCts.value = new CancellationTokenSource();
        repo.getRefs({ pattern: 'refs/heads' }, cts.token).then(refs => {
            if (cts.token.isCancellationRequested) {
                return;
            }
            const branches = refs
                .map(r => r.name)
                .filter((name) => !!name)
                .filter(name => !name.includes(CopilotCLISession_1.COPILOT_WORKTREE_PATTERN));
            const defaultBranch = branches.find(b => b === 'main')
                ?? branches.find(b => b === 'master')
                ?? branches.find(b => b === repo.state.get().HEAD?.name)
                ?? branches[0];
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
    setIsolationMode(mode) {
        if (this._isolationMode !== mode) {
            this._isolationMode = mode;
            this._isolationModeObservable.set(mode, undefined);
            this.setOption(ISOLATION_OPTION_ID, mode);
            if (mode === 'workspace') {
                // When switching to workspace mode, update the branch
                // selection to reflect the current branch as that is
                // what will be used for the folder session
                const currentBranch = this._gitRepository?.state.get().HEAD?.name;
                this.setBranch(currentBranch ?? this._defaultBranch);
            }
            else {
                this.setBranch(this._defaultBranch);
            }
        }
    }
    setBranch(branch) {
        if (this._branch !== branch) {
            this._branch = branch;
            this._branchObservable.set(branch, undefined);
            this.setOption(BRANCH_OPTION_ID, branch ?? '');
        }
    }
    setModelId(modelId) {
        this._modelId = modelId;
        this._modelIdObservable.set(modelId, undefined);
    }
    setModeById(modeId, modeKind) {
        this._modeObservable.set({ id: modeId, kind: modeKind }, undefined);
    }
    setPermissionLevel(level) {
        this._permissionLevel.set(level, undefined);
    }
    setTitle(title) {
        this._title.set(title, undefined);
    }
    setStatus(status) {
        this._status.set(status, undefined);
    }
    setMode(mode) {
        if (this._mode?.id !== mode?.id) {
            this._mode = mode;
            const modeName = mode?.isBuiltin ? undefined : mode?.name.get();
            this.setOption(AGENT_OPTION_ID, modeName ?? '');
        }
    }
    setOption(optionId, value) {
        if (typeof value === 'string') {
            this.selectedOptions.set(optionId, { id: value, name: value });
        }
        else {
            this.selectedOptions.set(optionId, value);
        }
        this.chatSessionsService.setSessionOption(this.resource, optionId, value);
    }
    update(agentSession) {
        const session = new AgentSessionAdapter(agentSession, this.providerId);
        this._workspaceData.set(session.workspace.get(), undefined);
        this._title.set(session.title.get(), undefined);
        this._status.set(session.status.get(), undefined);
        this._updatedAt.set(session.updatedAt.get(), undefined);
        this._changes.set(session.changes.get(), undefined);
        this._description.set(session.description.get(), undefined);
    }
};
CopilotCLISession = CopilotCLISession_1 = __decorate([
    __param(3, IChatSessionsService),
    __param(4, IGitService)
], CopilotCLISession);
function isModelOptionGroup(group) {
    if (group.id === 'models') {
        return true;
    }
    const nameLower = group.name.toLowerCase();
    return nameLower === 'model' || nameLower === 'models';
}
function isRepositoriesOptionGroup(group) {
    return group.id === 'repositories';
}
/**
 * Remote new session for Cloud agent sessions.
 * Implements {@link ICopilotChatSession} (session facade) and provides
 * pre-send configuration methods for the new-session flow.
 */
let RemoteNewSession = class RemoteNewSession extends Disposable {
    get project() { return this._project; }
    get selectedModelId() { return this._modelId; }
    get chatMode() { return undefined; }
    get query() { return this._query; }
    get attachedContext() { return this._attachedContext; }
    get disabled() {
        return !this._repoUri && !this.selectedOptions.has('repositories');
    }
    constructor(resource, sessionWorkspace, target, providerId, chatSessionsService, contextKeyService) {
        super();
        this.resource = resource;
        this.sessionWorkspace = sessionWorkspace;
        this.target = target;
        this.chatSessionsService = chatSessionsService;
        this.contextKeyService = contextKeyService;
        this._title = observableValue(this, '');
        this.title = this._title;
        this._updatedAt = observableValue(this, new Date());
        this.updatedAt = this._updatedAt;
        this._status = observableValue(this, 0 /* SessionStatus.Untitled */);
        this.status = this._status;
        this._permissionLevel = observableValue(this, ChatPermissionLevel.Default);
        this.permissionLevel = this._permissionLevel;
        this._workspaceData = observableValue(this, undefined);
        this.workspace = this._workspaceData;
        this.changes = observableValue(this, []);
        this._modelIdObservable = observableValue(this, undefined);
        this.modelId = this._modelIdObservable;
        this.mode = observableValue(this, undefined);
        this.loading = observableValue(this, false);
        this.isArchived = observableValue(this, false);
        this.isRead = observableValue(this, true);
        this.description = constObservable(undefined);
        this.lastTurnEnd = constObservable(undefined);
        this.gitHubInfo = constObservable(undefined);
        this.branch = constObservable(undefined);
        this.isolationMode = constObservable(undefined);
        this.branches = constObservable([]);
        this._hasGitRepo = observableValue(this, false);
        this.hasGitRepo = this._hasGitRepo;
        this._onDidChangeOptionGroups = this._register(new Emitter());
        this.onDidChangeOptionGroups = this._onDidChangeOptionGroups.event;
        this.selectedOptions = new Map();
        this._whenClauseKeys = new Set();
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
    setPermissionLevel(level) {
        throw new Error('Method not implemented.');
    }
    // -- New session configuration methods --
    setIsolationMode(_mode) {
        // No-op for remote sessions
    }
    setBranch(_branch) {
        // No-op for remote sessions
    }
    setModelId(modelId) {
        this._modelId = modelId;
    }
    setTitle(title) {
        this._title.set(title, undefined);
    }
    setStatus(status) {
        this._status.set(status, undefined);
    }
    setMode(_mode) {
        // Intentionally a no-op: remote sessions do not support client-side mode selection.
    }
    setOption(optionId, value) {
        if (typeof value !== 'string') {
            this.selectedOptions.set(optionId, value);
        }
        this.chatSessionsService.setSessionOption(this.resource, optionId, value);
    }
    // --- Option group accessors ---
    getModelOptionGroup() {
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
    getOtherOptionGroups() {
        const groups = this._getOptionGroups();
        if (!groups) {
            return [];
        }
        return groups
            .filter(g => !isModelOptionGroup(g) && !isRepositoriesOptionGroup(g) && this._isOptionGroupVisible(g))
            .map(g => ({ group: g, value: this._getValueForGroup(g) }));
    }
    getOptionValue(groupId) {
        return this.selectedOptions.get(groupId);
    }
    setOptionValue(groupId, value) {
        this.setOption(groupId, value);
    }
    // --- Internals ---
    _getOptionGroups() {
        return this.chatSessionsService.getOptionGroupsForSessionType(this.target);
    }
    _isOptionGroupVisible(group) {
        if (!group.when) {
            return true;
        }
        const expr = ContextKeyExpr.deserialize(group.when);
        return !expr || this.contextKeyService.contextMatchesRules(expr);
    }
    _updateWhenClauseKeys() {
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
    _getValueForGroup(group) {
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
    update(_session) { }
};
RemoteNewSession = __decorate([
    __param(4, IChatSessionsService),
    __param(5, IContextKeyService)
], RemoteNewSession);
export { RemoteNewSession };
/**
 * Maps the existing {@link ChatSessionStatus} to the new {@link SessionStatus}.
 */
function toSessionStatus(status) {
    switch (status) {
        case 2 /* ChatSessionStatus.InProgress */:
            return 1 /* SessionStatus.InProgress */;
        case 3 /* ChatSessionStatus.NeedsInput */:
            return 2 /* SessionStatus.NeedsInput */;
        case 1 /* ChatSessionStatus.Completed */:
            return 3 /* SessionStatus.Completed */;
        case 0 /* ChatSessionStatus.Failed */:
            return 4 /* SessionStatus.Error */;
    }
}
/**
 * Adapts an existing {@link IAgentSession} from the chat layer into the new {@link ICopilotChatSession} facade.
 */
class AgentSessionAdapter {
    constructor(session, providerId) {
        this.permissionLevel = constObservable(ChatPermissionLevel.Default);
        this.branch = constObservable(undefined);
        this.isolationMode = constObservable(undefined);
        this.branches = constObservable([]);
        this.id = `${providerId}:${session.resource.toString()}`;
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
        this._changes = observableValue(this, this._extractChanges(session));
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
    setPermissionLevel(level) {
        throw new Error('Method not implemented.');
    }
    setBranch(branch) {
        throw new Error('Method not implemented.');
    }
    setIsolationMode(mode) {
        throw new Error('Method not implemented.');
    }
    setModelId(modelId) {
        throw new Error('Method not implemented.');
    }
    setMode(chatMode) {
        throw new Error('Method not implemented.');
    }
    /**
     * Update reactive properties from a refreshed agent session.
     */
    update(session) {
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
    _getSessionTypeIcon(session) {
        switch (session.providerType) {
            case AgentSessionProviders.Background:
                return CopilotCLISessionType.icon;
            case AgentSessionProviders.Cloud:
                return CopilotCloudSessionType.icon;
            default:
                return session.icon;
        }
    }
    _extractDescription(session) {
        if (!session.description) {
            return undefined;
        }
        return typeof session.description === 'string' ? new MarkdownString(session.description) : session.description;
    }
    _extractGitHubInfo(session) {
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
    _extractPullRequestNumber(session, pullRequestUri) {
        const metadata = session.metadata;
        if (typeof metadata?.pullRequestNumber === 'number') {
            return metadata.pullRequestNumber;
        }
        const match = /\/pull\/(\d+)/.exec(pullRequestUri.path);
        if (match) {
            return parseInt(match[1], 10);
        }
        return undefined;
    }
    _extractOwnerRepo(session) {
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
            const parts = metadata.repositoryNwo.split('/');
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
            const match = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(metadata.pullRequestUrl);
            if (match) {
                return { owner: match[1], repo: match[2] };
            }
        }
        return { owner: undefined, repo: undefined };
    }
    _extractPullRequestStateIcon(session) {
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
    _extractPullRequestUri(session) {
        const metadata = session.metadata;
        if (!metadata) {
            return undefined;
        }
        const url = metadata.pullRequestUrl;
        if (url) {
            try {
                return URI.parse(url);
            }
            catch {
                // fall through
            }
        }
        // Construct from pullRequestNumber + owner/repo
        const prNumber = metadata.pullRequestNumber;
        if (typeof prNumber === 'number') {
            const owner = metadata.owner;
            const name = metadata.name;
            if (owner && name) {
                return URI.parse(`https://github.com/${owner}/${name}/pull/${prNumber}`);
            }
        }
        return undefined;
    }
    _extractChanges(session) {
        if (!session.changes) {
            return [];
        }
        if (Array.isArray(session.changes)) {
            return session.changes;
        }
        // Summary object — create a synthetic entry for total insertions/deletions
        const summary = session.changes;
        if (summary.insertions > 0 || summary.deletions > 0) {
            return [{
                    modifiedUri: URI.parse('summary://changes'),
                    insertions: summary.insertions,
                    deletions: summary.deletions,
                }];
        }
        return [];
    }
    _buildWorkspace(session) {
        const [repoUri, worktreeUri, branchName, baseBranchName, baseBranchProtected] = this._extractRepositoryFromMetadata(session);
        const repository = {
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
    _extractRepositoryFromMetadata(session) {
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
        const workingDirectoryPath = metadata?.workingDirectoryPath;
        if (workingDirectoryPath) {
            return [URI.file(workingDirectoryPath), undefined, undefined, undefined, undefined];
        }
        // Fall back to repositoryPath + worktreePath
        const repositoryPath = metadata?.repositoryPath;
        const repositoryPathUri = typeof repositoryPath === 'string' ? URI.file(repositoryPath) : undefined;
        const worktreePath = metadata?.worktreePath;
        const worktreePathUri = typeof worktreePath === 'string' ? URI.file(worktreePath) : undefined;
        const worktreeBranchName = metadata?.branchName;
        const worktreeBaseBranchName = metadata?.baseBranchName;
        const worktreeBaseBranchProtected = metadata?.baseBranchProtected;
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
let CopilotChatSessionsProvider = class CopilotChatSessionsProvider extends Disposable {
    get capabilities() {
        return {
            multipleChatsPerSession: this._isMultiChatEnabled(),
        };
    }
    constructor(agentSessionsService, chatService, chatSessionsService, chatWidgetService, fileDialogService, commandService, instantiationService, languageModelsService, toolsService, storageService, configurationService) {
        super();
        this.agentSessionsService = agentSessionsService;
        this.chatService = chatService;
        this.chatSessionsService = chatSessionsService;
        this.chatWidgetService = chatWidgetService;
        this.fileDialogService = fileDialogService;
        this.commandService = commandService;
        this.instantiationService = instantiationService;
        this.languageModelsService = languageModelsService;
        this.toolsService = toolsService;
        this.configurationService = configurationService;
        this.id = COPILOT_PROVIDER_ID;
        this.label = localize('copilotChatSessionsProvider', "Copilot Chat");
        this.icon = Codicon.copilot;
        this.sessionTypes = [CopilotCLISessionType, CopilotCloudSessionType];
        this._onDidChangeSessions = this._register(new Emitter());
        this.onDidChangeSessions = this._onDidChangeSessions.event;
        this._onDidReplaceSession = this._register(new Emitter());
        this.onDidReplaceSession = this._onDidReplaceSession.event;
        /** Cache of adapted sessions, keyed by resource URI string. */
        this._sessionCache = new Map();
        /** Cache of ISession wrappers, keyed by session group ID. */
        this._sessionGroupCache = new Map();
        this._groupModel = this._register(new SessionsGroupModel(storageService));
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
    // -- Sessions --
    getSessionTypes(sessionId) {
        const session = this._currentNewSession?.id === sessionId ? this._currentNewSession : this._findChatSession(sessionId);
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
    getSessions() {
        this._ensureSessionCache();
        if (!this._isMultiChatEnabled()) {
            return Array.from(this._sessionCache.values()).map(chat => this._chatToSession(chat));
        }
        const allChats = Array.from(this._sessionCache.values());
        // Group chats using the group model
        const seen = new Set();
        const sessions = [];
        for (const chat of allChats) {
            const groupId = this._groupModel.getSessionIdForChat(chat.id) ?? chat.id;
            if (!seen.has(groupId)) {
                seen.add(groupId);
                sessions.push(this._chatToSession(chat));
            }
        }
        return sessions;
    }
    getSession(sessionId) {
        if (this._currentNewSession?.id === sessionId) {
            return this._currentNewSession;
        }
        return this._findChatSession(sessionId);
    }
    createNewSession(workspace) {
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
            return this._chatToSession(session);
        }
        const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/untitled-${generateUuid()}` });
        const session = this.instantiationService.createInstance(CopilotCLISession, resource, workspace, this.id);
        this._currentNewSession = session;
        return this._chatToSession(session);
    }
    setSessionType(sessionId, type) {
        throw new Error('Session type cannot be changed');
    }
    setModel(sessionId, modelId) {
        if (this._currentNewSession?.id === sessionId) {
            this._currentNewSession.setModelId(modelId);
        }
    }
    // -- Session Actions --
    async archiveSession(sessionId) {
        const agentSession = this._findAgentSession(sessionId);
        if (agentSession) {
            agentSession.setArchived(true);
            return;
        }
        // Temp session that hasn't been committed — remove it directly
        this._cleanupTempSession(sessionId);
    }
    async unarchiveSession(sessionId) {
        const agentSession = this._findAgentSession(sessionId);
        if (agentSession) {
            agentSession.setArchived(false);
        }
    }
    async deleteSession(sessionId) {
        // Collect all chat IDs in this session group
        const chatIds = this._isMultiChatEnabled()
            ? this._groupModel.getChatIds(sessionId)
            : [];
        // Delete the primary session
        const agentSession = this._findAgentSession(sessionId);
        if (agentSession) {
            if (agentSession.providerType === CopilotCLISessionType.id) {
                this.commandService.executeCommand('github.copilot.cli.sessions.delete', { resource: agentSession.resource });
            }
            else {
                await this.chatService.removeHistoryEntry(agentSession.resource);
            }
            // Delete all other chats in the group
            for (const chatId of chatIds) {
                if (chatId === sessionId) {
                    continue; // Already deleted above
                }
                const chatSession = this._findAgentSession(chatId);
                if (chatSession) {
                    if (chatSession.providerType === CopilotCLISessionType.id) {
                        this.commandService.executeCommand('github.copilot.cli.sessions.delete', { resource: chatSession.resource });
                    }
                    else {
                        await this.chatService.removeHistoryEntry(chatSession.resource);
                    }
                }
            }
            // Clean up group model
            if (this._isMultiChatEnabled()) {
                this._groupModel.deleteSession(sessionId);
                this._sessionGroupCache.delete(sessionId);
            }
            this._refreshSessionCache();
            return;
        }
        // Temp session that hasn't been committed — remove it directly
        this._cleanupTempSession(sessionId);
    }
    async renameChat(sessionId, _chatUri, title) {
        const agentSession = this._findAgentSession(sessionId);
        if (agentSession) {
            if (agentSession.providerType === CopilotCLISessionType.id) {
                this.commandService.executeCommand('github.copilot.cli.sessions.setTitle', { resource: agentSession.resource }, title);
            }
            else {
                this.chatService.setChatSessionTitle(agentSession.resource, title);
            }
        }
    }
    async deleteChat(sessionId, chatUri) {
        if (!this._isMultiChatEnabled()) {
            throw new Error('Deleting individual chats is not supported when multi-chat is disabled');
        }
        const chatIds = this._groupModel.getChatIds(sessionId);
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
            if (agentSession.providerType === CopilotCLISessionType.id) {
                this.commandService.executeCommand('github.copilot.cli.sessions.delete', { resource: agentSession.resource });
            }
            else {
                await this.chatService.removeHistoryEntry(agentSession.resource);
            }
        }
    }
    setRead(sessionId, read) {
        const agentSession = this._findAgentSession(sessionId);
        if (agentSession) {
            agentSession.setRead(read);
        }
    }
    // -- Send --
    async sendAndCreateChat(sessionId, options) {
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
    /**
     * Sends the first chat for a newly created session.
     * Adds the temp session to the cache, waits for commit, then replaces it.
     */
    async _sendFirstChat(session, options) {
        const { query, attachedContext } = options;
        const contribution = this.chatSessionsService.getChatSessionContribution(session.target);
        // Resolve mode
        const modeKind = session.chatMode?.kind ?? ChatModeKind.Agent;
        const modeIsBuiltin = session.chatMode ? isBuiltinChatMode(session.chatMode) : true;
        const modeId = modeIsBuiltin ? modeKind : 'custom';
        const rawModeInstructions = session.chatMode?.modeInstructions?.get();
        const modeInstructions = rawModeInstructions ? {
            name: session.chatMode.name.get(),
            content: rawModeInstructions.content,
            toolReferences: this.toolsService.toToolReferences(rawModeInstructions.toolReferences),
            metadata: rawModeInstructions.metadata,
        } : undefined;
        const permissionLevel = session.permissionLevel.get();
        const sendOptions = {
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
                this.chatSessionsService.updateSessionOptions(session.resource, session.selectedOptions);
            }
            modelRef.dispose();
        }
        // Send request
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
        session.setStatus(1 /* SessionStatus.InProgress */);
        const key = session.resource.toString();
        this._sessionCache.set(key, session);
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
            // Register the committed chat in the group model
            this._groupModel.addChat(committedChat.id, committedChat.id);
            const committedSession = this._chatToSession(committedChat);
            // Notify listeners that the temp session was replaced by the committed one
            this._sessionGroupCache.delete(session.id);
            this._onDidReplaceSession.fire({ from: newSession, to: committedSession });
            return committedSession;
        }
        catch (error) {
            // Clean up temp session on error
            this._sessionCache.delete(key);
            this._sessionGroupCache.delete(session.id);
            this._currentNewSession = undefined;
            this._onDidChangeSessions.fire({ added: [], removed: [this._chatToSession(session)], changed: [] });
            session.dispose();
            throw error;
        }
    }
    /**
     * Sends a subsequent chat for an existing session that already has chats.
     * Creates a new {@link CopilotCLISession} from the existing workspace,
     * registers it in the group model, and fires a `changed` event (not `added`).
     */
    async _sendSubsequentChat(sessionId, options) {
        const newChatSession = this._createNewSessionFrom(sessionId);
        // Add the temp session to the cache and group model immediately
        // so the chats observable picks it up and tabs appear right away.
        newChatSession.setTitle(localize('new chat', "New Chat"));
        newChatSession.setStatus(1 /* SessionStatus.InProgress */);
        const key = newChatSession.resource.toString();
        this._sessionCache.set(key, newChatSession);
        this._groupModel.addChat(sessionId, newChatSession.id);
        // Invalidate the session group cache so it rebuilds with the new chat
        this._sessionGroupCache.delete(sessionId);
        this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._chatToSession(newChatSession)] });
        const { query, attachedContext } = options;
        const contribution = this.chatSessionsService.getChatSessionContribution(newChatSession.target);
        const sendOptions = {
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
            this._groupModel.removeChat(newChatSession.id);
            throw new Error('[DefaultCopilotProvider] Failed to open chat widget for subsequent chat');
        }
        // Send request
        const result = await this.chatService.sendRequest(newChatSession.resource, query, sendOptions);
        if (result.kind === 'rejected') {
            this._sessionCache.delete(key);
            this._groupModel.removeChat(newChatSession.id);
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
            this._currentNewSession = undefined;
            newChatSession.dispose();
            // Update group model: replace temp ID with committed ID
            this._groupModel.removeChat(newChatSession.id);
            if (this._groupModel.hasGroupForSession(committedChat.id)) {
                this._groupModel.deleteSession(committedChat.id);
            }
            this._groupModel.addChat(sessionId, committedChat.id);
            // Invalidate the session group cache so it rebuilds with the new chat
            this._sessionGroupCache.delete(sessionId);
            const updatedSession = this._chatToSession(committedChat);
            this._onDidChangeSessions.fire({ added: [], removed: [], changed: [updatedSession] });
            return updatedSession;
        }
        catch (error) {
            // Clean up on error — fire changed on the parent session group
            this._sessionCache.delete(key);
            this._groupModel.removeChat(newChatSession.id);
            this._sessionGroupCache.delete(sessionId);
            this._currentNewSession = undefined;
            newChatSession.dispose();
            // Find the parent session's primary chat to fire a valid changed event
            const parentChatIds = this._groupModel.getChatIds(sessionId);
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
    _createNewSessionFrom(sessionId) {
        // Find the primary chat for this session
        const chatIds = this._groupModel.getChatIds(sessionId);
        const firstChatId = chatIds[0] ?? sessionId;
        const chat = this._sessionCache.get(this._localIdFromchatId(firstChatId));
        if (!chat) {
            throw new Error(`Session '${sessionId}' not found`);
        }
        if (chat.sessionType === AgentSessionProviders.Cloud) {
            throw new Error('Multiple chats per session is not supported for cloud sessions');
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
        const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/untitled-${generateUuid()}` });
        const session = this.instantiationService.createInstance(CopilotCLISession, resource, newWorkspace, this.id);
        session.setIsolationMode('workspace');
        this._currentNewSession = session;
        return session;
    }
    /**
     * Waits for the committed (real) URI for a session by listening to the
     * {@link IChatSessionsService.onDidCommitSession} event.
     *
     * When {@link responseCompletePromise} is provided, the wait is bounded by
     * response completion. If the response finishes before the commit event:
     * - If the response was **cancelled**, the session was stopped before the
     *   agent created the backing resource → throw immediately.
     * - If the response completed **normally**, the commit event is legitimately
     *   in-flight (the extension fired it mid-turn but the async IPC chain in
     *   {@link MainThreadChatSessions.$onDidCommitChatSessionItem} hasn't finished
     *   yet) → keep waiting with the safety timeout.
     */
    async _waitForCommittedSession(untitledResource, responseCompletePromise, responseCreatedPromise) {
        const disposables = new DisposableStore();
        try {
            const commitPromise = new Promise(resolve => {
                disposables.add(this.chatSessionsService.onDidCommitSession(e => {
                    if (isEqual(e.original, untitledResource)) {
                        resolve(e.committed);
                    }
                }));
            });
            if (responseCompletePromise) {
                // Race the commit event against the response completing.
                const committed = await Promise.race([
                    commitPromise.then(uri => ({ committed: true, uri })),
                    responseCompletePromise.then(() => ({ committed: false })),
                ]);
                if (committed.committed) {
                    return committed.uri;
                }
                // Response finished before the commit event arrived.
                // Check whether it was cancelled — if so, the commit will never come.
                const response = await responseCreatedPromise;
                if (response?.isCanceled) {
                    throw new Error('Session was cancelled before being committed');
                }
                // Response completed normally — the commit is in-flight (the extension
                // fired it before the response finished, but the async IPC chain hasn't
                // delivered it yet). It should arrive in milliseconds; use a short
                // safety timeout to avoid blocking forever on an IPC failure.
            }
            const result = await raceTimeout(commitPromise, 5_000);
            if (!result) {
                throw new Error('Timed out waiting for session commit');
            }
            return result;
        }
        finally {
            disposables.dispose();
        }
    }
    /**
     * Waits for an {@link AgentSessionAdapter} with the given resource to appear
     * in the session cache (populated by {@link _refreshSessionCache}).
     * Only called once during session initialisation (after the commit event),
     * so the timeout has no performance impact on steady-state operations.
     */
    async _waitForSessionInCache(resource) {
        const key = resource.toString();
        const existing = this._sessionCache.get(key);
        if (existing instanceof AgentSessionAdapter) {
            return existing;
        }
        const disposables = new DisposableStore();
        try {
            const sessionPromise = new Promise(resolve => {
                disposables.add(this.onDidChangeSessions(e => {
                    const cached = this._sessionCache.get(key);
                    if (cached instanceof AgentSessionAdapter) {
                        resolve(cached);
                    }
                }));
            });
            // The adapter should appear almost immediately after the commit
            // event via _refreshSessionCache; use a short safety timeout.
            const result = await raceTimeout(sessionPromise, 5_000);
            if (!result) {
                throw new Error('Timed out waiting for committed session in cache');
            }
            return result;
        }
        finally {
            disposables.dispose();
        }
    }
    // -- Private --
    async _browseForFolder() {
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
    async _browseForRepo() {
        const repoId = await this.commandService.executeCommand(OPEN_REPO_COMMAND);
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
    resolveWorkspace(repositoryUri) {
        return {
            label: this._labelFromUri(repositoryUri),
            icon: this._iconFromUri(repositoryUri),
            repositories: [{ uri: repositoryUri, workingDirectory: undefined, detail: undefined, baseBranchName: undefined, baseBranchProtected: undefined }],
            requiresWorkspaceTrust: repositoryUri.scheme !== GITHUB_REMOTE_FILE_SCHEME
        };
    }
    _labelFromUri(uri) {
        if (uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
            return uri.path.substring(1).replace(/\/HEAD$/, '');
        }
        return basename(uri);
    }
    _iconFromUri(uri) {
        if (uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
            return Codicon.repo;
        }
        return Codicon.folder;
    }
    _ensureSessionCache() {
        if (this._sessionCache.size > 0) {
            return;
        }
        this._refreshSessionCache();
    }
    /**
     * Cleans up a temp session (one that hasn't been committed) from the cache.
     * Used when delete/archive is invoked on a session that is still pending
     * commit (e.g. was stopped before the agent created a worktree).
     */
    _cleanupTempSession(sessionId) {
        const chatSession = this._findChatSession(sessionId);
        if (!chatSession) {
            return;
        }
        const key = chatSession.resource.toString();
        this._sessionCache.delete(key);
        this._sessionGroupCache.delete(chatSession.id);
        if (this._currentNewSession?.id === chatSession.id) {
            this._currentNewSession = undefined;
        }
        const removedSession = this._chatToSession(chatSession);
        this._sessionGroupCache.delete(chatSession.id);
        this._onDidChangeSessions.fire({ added: [], removed: [removedSession], changed: [] });
        if (chatSession instanceof CopilotCLISession || chatSession instanceof RemoteNewSession) {
            chatSession.dispose();
        }
    }
    _refreshSessionCache() {
        const currentKeys = new Set();
        const addedData = [];
        const changedData = [];
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
                changedData.push(existing);
            }
            else {
                const adapter = new AgentSessionAdapter(session, this.id);
                this._sessionCache.set(key, adapter);
                addedData.push(adapter);
            }
        }
        const removedData = [];
        for (const [key, adapter] of this._sessionCache) {
            if (!currentKeys.has(key) && adapter instanceof AgentSessionAdapter) {
                this._sessionCache.delete(key);
                removedData.push(adapter);
            }
        }
        if (addedData.length > 0 || removedData.length > 0 || changedData.length > 0) {
            if (this._isMultiChatEnabled()) {
                this._refreshSessionCacheMultiChat(addedData, removedData, changedData);
            }
            else {
                this._onDidChangeSessions.fire({
                    added: addedData.map(d => this._chatToSession(d)),
                    removed: removedData.map(d => this._chatToSession(d)),
                    changed: changedData.map(d => this._chatToSession(d)),
                });
            }
        }
    }
    _refreshSessionCacheMultiChat(addedData, removedData, changedData) {
        // Track session group IDs for removed chats before modifying the group model
        const removedGroupIds = new Map();
        for (const removed of removedData) {
            removedGroupIds.set(removed, this._groupModel.getSessionIdForChat(removed.id));
        }
        // Handle removed chats: if a removed chat belongs to a group with
        // remaining siblings, treat it as a changed event on the parent session
        // instead of a removed session.
        const trulyRemovedSessions = [];
        const changedSessionIds = new Set();
        for (const removed of removedData) {
            const sessionId = removedGroupIds.get(removed);
            this._groupModel.removeChat(removed.id);
            if (sessionId && this._groupModel.getChatIds(sessionId).length > 0) {
                // Group still has other chats — invalidate cache and treat as changed
                this._sessionGroupCache.delete(sessionId);
                if (!changedSessionIds.has(sessionId)) {
                    changedSessionIds.add(sessionId);
                    const primaryChatId = this._groupModel.getChatIds(sessionId)[0];
                    const primaryChat = this._sessionCache.get(this._localIdFromchatId(primaryChatId));
                    if (primaryChat) {
                        changedData.push(primaryChat);
                    }
                }
            }
            else {
                const groupId = sessionId ?? removed.id;
                this._sessionGroupCache.delete(groupId);
                trulyRemovedSessions.push({ chat: removed, groupId });
            }
        }
        // Seed ungrouped chats into the group model
        for (const added of addedData) {
            if (!this._groupModel.getSessionIdForChat(added.id)) {
                this._groupModel.addChat(added.id, added.id);
            }
        }
        // Separate truly new sessions from chats added to existing groups
        const newSessions = [];
        for (const added of addedData) {
            const existingGroupId = this._groupModel.getSessionIdForChat(added.id);
            if (existingGroupId && existingGroupId !== added.id) {
                // This chat belongs to an existing session group — treat as changed
                if (!changedSessionIds.has(existingGroupId)) {
                    changedSessionIds.add(existingGroupId);
                    changedData.push(added);
                }
            }
            else {
                newSessions.push(added);
            }
        }
        // Deduplicate changed sessions by group ID
        const seenChanged = new Set();
        const deduplicatedChanged = [];
        for (const d of changedData) {
            const groupId = this._groupModel.getSessionIdForChat(d.id) ?? d.id;
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
    _findChatSession(chatId) {
        return this._sessionCache.get(this._localIdFromchatId(chatId));
    }
    _findAgentSession(chatId) {
        const adapter = this._findChatSession(chatId);
        if (!adapter) {
            return undefined;
        }
        return this.agentSessionsService.getSession(adapter.resource);
    }
    _localIdFromchatId(chatId) {
        const prefix = `${this.id}:`;
        return chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
    }
    /**
     * Wraps a primary {@link ICopilotChatSession} and its sibling chats into an {@link ISession}.
     * When multi-chat is enabled, the `chats` observable is derived from the group model
     * and updates automatically when the group model fires a change event.
     * When disabled, each session has exactly one chat.
     */
    _chatToSession(chat) {
        if (!this._isMultiChatEnabled()) {
            return this._chatToSingleChatSession(chat);
        }
        const sessionId = this._groupModel.getSessionIdForChat(chat.id) ?? chat.id;
        const cached = this._sessionGroupCache.get(sessionId);
        if (cached) {
            return cached;
        }
        // Resolve the main (first) chat in the group — session-level properties come from it
        const mainChatIds = this._groupModel.getChatIds(sessionId);
        const firstChatId = mainChatIds[0];
        const primaryChat = firstChatId
            ? this._sessionCache.get(this._localIdFromchatId(firstChatId)) ?? chat
            : chat;
        const chatsObs = observableFromEvent(this, Event.filter(this._groupModel.onDidChange, e => e.sessionId === sessionId), () => {
            const chatIds = this._groupModel.getChatIds(sessionId);
            if (chatIds.length === 0) {
                return [this._toChat(chat)];
            }
            const allChats = Array.from(this._sessionCache.values());
            const chatById = new Map(allChats.map(c => [c.id, c]));
            const chatOrder = new Map(chatIds.map((id, index) => [id, index]));
            const resolved = chatIds.map(id => chatById.get(id)).filter((c) => !!c);
            if (resolved.length === 0) {
                return [this._toChat(chat)];
            }
            return resolved
                .sort((a, b) => (chatOrder.get(a.id) ?? Infinity) - (chatOrder.get(b.id) ?? Infinity))
                .map(c => this._toChat(c));
        });
        const mainChat = this._toChat(primaryChat);
        const session = {
            sessionId,
            resource: primaryChat.resource,
            providerId: primaryChat.providerId,
            sessionType: primaryChat.sessionType,
            icon: primaryChat.icon,
            createdAt: primaryChat.createdAt,
            workspace: primaryChat.workspace,
            title: primaryChat.title,
            updatedAt: chatsObs.map((chats, reader) => this._latestDate(chats, c => c.updatedAt.read(reader))),
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
        };
        this._sessionGroupCache.set(sessionId, session);
        return session;
    }
    _chatToSingleChatSession(chat) {
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
        };
    }
    _toChat(chat) {
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
    _latestDate(chats, getter) {
        let latest;
        for (const chat of chats) {
            const d = getter(chat);
            if (d && (!latest || d > latest)) {
                latest = d;
            }
        }
        return latest;
    }
    _aggregateStatus(chats, reader) {
        for (const c of chats) {
            if (c.status.read(reader) === 2 /* SessionStatus.NeedsInput */) {
                return 2 /* SessionStatus.NeedsInput */;
            }
        }
        for (const c of chats) {
            if (c.status.read(reader) === 1 /* SessionStatus.InProgress */) {
                return 1 /* SessionStatus.InProgress */;
            }
        }
        return chats[0].status.read(reader);
    }
    _isMultiChatEnabled() {
        return this.configurationService.getValue(COPILOT_MULTI_CHAT_SETTING) ?? false;
    }
};
CopilotChatSessionsProvider = __decorate([
    __param(0, IAgentSessionsService),
    __param(1, IChatService),
    __param(2, IChatSessionsService),
    __param(3, IChatWidgetService),
    __param(4, IFileDialogService),
    __param(5, ICommandService),
    __param(6, IInstantiationService),
    __param(7, ILanguageModelsService),
    __param(8, ILanguageModelToolsService),
    __param(9, IStorageService),
    __param(10, IConfigurationService)
], CopilotChatSessionsProvider);
export { CopilotChatSessionsProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jb3BpbG90Q2hhdFNlc3Npb25zL2Jyb3dzZXIvY29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFtQixjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN6RixPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBd0IsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25LLE9BQU8sRUFBRSxnQkFBZ0IsRUFBYSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUZBQWlGLENBQUM7QUFDcEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0ZBQWtGLENB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