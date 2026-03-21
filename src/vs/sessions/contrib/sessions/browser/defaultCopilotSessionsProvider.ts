/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IAgentSession } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatSessionStatus, IChatSessionFileChange } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionData, ISessionRepository, ISessionWorkspace, SessionStatus } from '../common/sessionData.js';
import { SessionWorkspace, GITHUB_REMOTE_FILE_SCHEME, AGENT_HOST_SCHEME } from '../common/sessionWorkspace.js';
import { ISessionsBrowseAction, ISessionsChangeEvent, ISessionsProvider, ISessionType } from './sessionsProvider.js';
import { INewSession, CopilotCLISession, RemoteNewSession } from '../../chat/browser/newSession.js';

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

/**
 * Maps the existing {@link ChatSessionStatus} to the new {@link SessionStatus}.
 */
function toSessionStatus(status: ChatSessionStatus): SessionStatus {
	switch (status) {
		case ChatSessionStatus.InProgress:
		case ChatSessionStatus.NeedsInput:
			return SessionStatus.Active;
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
	readonly workspace: ISessionWorkspace | undefined;

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
		this.workspace = this._buildWorkspace(session);

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

	createNewSession(type: ISessionType, resource: URI, workspace?: SessionWorkspace): INewSession {
		if (type.id === AgentSessionProviders.Background) {
			return this.instantiationService.createInstance(CopilotCLISession, resource, workspace?.uri);
		}
		return this.instantiationService.createInstance(RemoteNewSession, resource, type.id);
	}

	// ── Session Actions ──

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

	// ── Menu Contributions ──

	registerMenuContributions(): IDisposable {
		// TODO: Register picker actions into NewSessions.* menus
		// (isolation, branch, model, mode, permissions pickers scoped by sessionsProviderId)
		return new DisposableStore();
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
