/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { getAgentHostChatId } from '../../../../../../platform/agentHost/common/agentHostChatIdentity.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { withEphemeralSessionMeta } from '../../../../../../platform/agentHost/common/meta/agentEphemeralSessionMeta.js';
import { ChatInteractivity, type ChangesSummary, type SessionChatSummary } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ChatOriginKind, SessionStatus, readSessionEhcliAdoptable, SESSION_META_EHCLI_ADOPTABLE_KEY, type SessionSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatSessionStatus, IChatNewSessionRequest, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta } from '../../../common/chatSessionsService.js';
import { getAgentHostSessionResource } from '../../../common/constants.js';
import { getAgentSessionProviderIcon } from '../agentSessions.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { IAgentHostImportConversationStore } from './agentHostImportConversationStore.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { AgentHostSessionListStore, type IAgentHostSessionListDelta } from './agentHostSessionListStore.js';
import { AgentHostChatMoveTracker, IAgentHostChatMove } from './agentHostChatMoveTracker.js';

function mapSessionStatus(status: SessionStatus | undefined): ChatSessionStatus {
	if (status !== undefined && (status & SessionStatus.InputNeeded) === SessionStatus.InputNeeded) {
		return ChatSessionStatus.NeedsInput;
	}
	if (status !== undefined && (status & SessionStatus.InProgress)) {
		return ChatSessionStatus.InProgress;
	}
	if (status !== undefined && (status & SessionStatus.Error)) {
		return ChatSessionStatus.Failed;
	}
	return ChatSessionStatus.Completed;
}

/**
 * Provides provider-specific session list items for the chat sessions sidebar
 * by projecting the shared {@link AgentHostSessionListStore} state. The
 * controller derives items from the store on demand.
 */
export class AgentHostSessionListController extends Disposable implements IChatSessionItemController {

	readonly onDidChangeChatSessionItems: Event<IChatSessionItemsDelta>;

	private readonly _chatMoves = this._register(new AgentHostChatMoveTracker<{ readonly resource: URI }>());
	/** Fires when a chat of this provider's sessions moved to another of them; resources are chat session resources. */
	readonly onDidMoveChat: Event<IAgentHostChatMove<{ readonly resource: URI }>> = this._chatMoves.onDidMoveChat;

	constructor(
		private readonly _sessionType: string,
		private readonly _provider: string,
		private readonly _sessionListStore: AgentHostSessionListStore,
		private readonly _description: string | undefined,
		private readonly _connectionAuthority: string,
		private readonly _useSessionTitleForDefaultChat: boolean,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisional: IAgentHostUntitledProvisionalSessionService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IAgentHostNewSessionFolderService private readonly _newSessionFolderService: IAgentHostNewSessionFolderService,
		@IAgentHostImportConversationStore private readonly _importConversationStore: IAgentHostImportConversationStore,
		@IChatService chatService: IChatService,
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
	) {
		super();

		this._register(chatService.onDidDisposeSession(event => {
			for (const resource of event.sessionResources) {
				if (resource.scheme === this._sessionType) {
					this._sessionListStore.clearPendingNewSession(this._provider, resource);
				}
			}
		}));

		// Project the store's provider-agnostic delta down to this provider's
		// chat-session-item delta, dropping events that don't touch us. Both
		// combinators are bound to `this._store` so disposing the controller
		// tears down the projection and its subscription to the store event.
		for (const entry of this._sessionListStore.getSessions(this._provider)) {
			this._updateChatCatalog(entry.summary);
		}
		this._register(this._sessionListStore.onDidChangeSessions(delta => {
			for (const entry of delta.addedOrUpdated ?? []) {
				if (entry.provider === this._provider) {
					this._updateChatCatalog(entry.summary);
				}
			}
			for (const removal of delta.removed ?? []) {
				if (removal.provider === this._provider) {
					this._chatMoves.remove({ resource: this._sessionListStore.getSessionResource(removal.session) });
				}
			}
		}));

		this.onDidChangeChatSessionItems = Event.filter(
			Event.map(this._sessionListStore.onDidChangeSessions, delta => this._projectDelta(delta), this._store),
			(delta: IChatSessionItemsDelta | undefined): delta is IChatSessionItemsDelta => delta !== undefined,
			this._store,
		);
	}

	get items(): readonly IChatSessionItem[] {
		return this._sessionListStore.getSessions(this._provider)
			.map(entry => this._makeItemFromSummary(entry.summary, entry.statusKnown));
	}

	isNewSession(resource: URI): boolean {
		return resource.scheme === this._sessionType
			&& this._sessionListStore.isPendingNewSession(this._provider, resource);
	}

	notifySessionMaterialized(resource: URI): void {
		if (resource.scheme === this._sessionType) {
			this._sessionListStore.clearPendingNewSession(this._provider, resource);
		}
	}

	async newChatSessionItem(request: IChatNewSessionRequest, token: CancellationToken): Promise<IChatSessionItem | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}
		const rawId = generateUuid();
		const resource = this._resource(rawId);
		this._sessionListStore.addPendingNewSession(this._provider, resource);
		const now = Date.now();
		let item = this._makeItem(resource, {
			title: request.prompt.trim(),
			status: SessionStatus.InProgress,
			createdAt: now,
			modifiedAt: now,
		});
		const metadata = withEphemeralSessionMeta(request._meta, request.isEphemeral ? true : undefined);
		if (metadata) {
			this._provisional.setSessionCreationMetadata(item.resource, metadata);
		}

		// Graduate the draft's backend and chip selections without recreating a matching session.
		if (request.untitledResource) {
			const workingDirectory = this._newSessionFolderService.getFolder(request.untitledResource)
				?? this._newSessionFolderService.getDefaultFolder()
				?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
			// Carry the chosen folder forward onto the real resource so the
			// handler's working-directory resolution stays consistent after the
			// untitled-to-real rebind. The untitled entry is left in place and
			// cleaned up when its compose model disposes; clearing it here would
			// briefly fire a change while the widget still points at the untitled
			// resource, flickering the chip back to the first folder.
			if (workingDirectory) {
				this._newSessionFolderService.setFolder(item.resource, workingDirectory);
			}
			// Carry any imported ("Continue in…") conversation snapshot from the
			// untitled chat-input resource to the freshly-minted real resource so
			// the provisional `getOrCreate` for the real resource seeds it.
			this._importConversationStore.rename(request.untitledResource, item.resource);
			let rebound: URI | undefined;
			try {
				rebound = await this._provisional.tryRebind(request.untitledResource, item.resource, this._provider, token);
			} catch (error) {
				this._sessionListStore.clearPendingNewSession(this._provider, item.resource);
				this._newSessionFolderService.clear(item.resource);
				this._provisional.clearSessionCreationMetadata(item.resource);
				this._importConversationStore.rename(item.resource, request.untitledResource);
				throw error;
			}
			const previousResource = item.resource;
			// Use the retained backend identity; failed or retired allocations must not be reused.
			const nextResource = previousResource.with({ path: rebound?.path ?? `/${generateUuid()}` });
			if (nextResource.path !== previousResource.path) {
				const pending = this._sessionListStore.isPendingNewSession(this._provider, previousResource);
				this._sessionListStore.clearPendingNewSession(this._provider, previousResource);
				if (pending || !rebound) {
					this._sessionListStore.addPendingNewSession(this._provider, nextResource);
				}
				const currentDirectory = rebound
					? this._provisional.getProvisionalWorkingDirectories(nextResource)?.[0]
					: this._newSessionFolderService.getFolder(request.untitledResource)
					?? this._newSessionFolderService.getDefaultFolder()
					?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
				if (currentDirectory) {
					this._newSessionFolderService.setFolder(nextResource, currentDirectory);
				}
				this._newSessionFolderService.clear(previousResource);
				this._importConversationStore.rename(previousResource, nextResource);
				if (metadata) {
					this._provisional.setSessionCreationMetadata(nextResource, metadata);
				}
				item = { ...item, resource: nextResource };
			}
		}

		return item;
	}

	async deleteChatSessionItem(resource: URI, _token: CancellationToken): Promise<void> {
		if (resource.scheme !== this._sessionType) {
			return;
		}

		const session = this._resolveSession(resource);
		const entry = this._sessionListStore.getSession(this._provider, session);
		if (resource.fragment) {
			const chat = entry?.summary.chats?.find(chat => getAgentHostChatId(chat.resource) === resource.fragment);
			if (!chat) {
				throw new Error(`Cannot resolve chat '${resource.fragment}' in session '${session.toString()}'`);
			}
			await this._sessionListStore.disposeChat(URI.parse(chat.resource));
			return;
		}

		await this._sessionListStore.disposeSession(session);

		// `root/sessionRemoved` only fires for sessions the backend had previously announced, so remove the session from
		// the store directly (this also clears any local pending marker). If the notification does fire as well, the
		// second call is a no-op.
		this._sessionListStore.removeSession(this._provider, session);
	}

	setChatSessionItemArchived(resource: URI, archived: boolean): void {
		if (resource.scheme !== this._sessionType) {
			return;
		}

		this._sessionListStore.setSessionArchived(this._provider, this._resolveSession(resource), archived);
	}

	setChatSessionItemRead(resource: URI, isRead: boolean): void {
		if (resource.scheme !== this._sessionType) {
			return;
		}

		this._sessionListStore.setSessionRead(this._provider, this._resolveSession(resource), isRead);
	}

	async refresh(token: CancellationToken): Promise<void> {
		// The store fans out a delta during the await when its list changes, which
		// projects into a change event. When nothing changed (e.g. the store cache
		// was still valid), `items` already reflects the current store state.
		await this._sessionListStore.refresh(token);
	}

	private _projectDelta(delta: IAgentHostSessionListDelta): IChatSessionItemsDelta | undefined {
		let addedOrUpdated: IChatSessionItem[] | undefined;
		let removed: URI[] | undefined;
		for (const entry of delta.addedOrUpdated ?? []) {
			if (entry.provider !== this._provider) {
				continue;
			}
			(addedOrUpdated ??= []).push(this._makeItemFromSummary(entry.summary, entry.statusKnown));
		}

		for (const removal of delta.removed ?? []) {
			if (removal.provider !== this._provider) {
				continue;
			}
			(removed ??= []).push(this._sessionListStore.getSessionResource(removal.session));
		}

		if (!addedOrUpdated && !removed) {
			return undefined;
		}
		return { ...(addedOrUpdated ? { addedOrUpdated } : undefined), ...(removed ? { removed } : undefined) };
	}

	private _makeItemFromSummary(summary: SessionSummary, statusKnown: boolean): IChatSessionItem {
		const resource = this._sessionListStore.getSessionResource(URI.parse(summary.resource));
		const workingDir = typeof summary.workingDirectories?.[0] === 'string' ? URI.parse(summary.workingDirectories?.[0]) : summary.workingDirectories?.[0];
		const base = {
			title: summary.title,
			status: summary.status,
			statusKnown,
			activity: summary.activity,
			workingDirectory: workingDir,
			createdAt: Date.parse(summary.createdAt),
			modifiedAt: Date.parse(summary.modifiedAt),
			changesSummary: summary.changes,
			adoptable: readSessionEhcliAdoptable(summary._meta),
		};
		if (!summary.chats?.length) {
			return this._makeItem(resource, base);
		}

		const defaultChat = summary.chats.find(chat => this._isDefaultChat(summary, chat));
		const peerChats = summary.chats.filter(chat =>
			chat !== defaultChat &&
			chat.interactivity !== ChatInteractivity.Hidden &&
			chat.origin?.kind !== ChatOriginKind.Tool &&
			chat.origin?.kind !== ChatOriginKind.SideChat
		);
		return this._makeItem(resource, {
			...base,
			title: this._useSessionTitleForDefaultChat ? summary.title : defaultChat?.title || summary.title,
			children: peerChats.length ? peerChats.map(chat => this._makeItem(resource, {
				title: chat.title || summary.title,
				workingDirectory: base.workingDirectory,
				createdAt: base.createdAt,
				modifiedAt: base.modifiedAt,
				chat,
			})) : undefined,
		});
	}

	private _makeItem(resource: URI, opts: {
		title?: string;
		status?: SessionStatus;
		/** Whether `status`'s session-scoped flag bits came from the host. */
		statusKnown?: boolean;
		activity?: string;
		workingDirectory?: URI;
		createdAt: number;
		modifiedAt: number;
		changesSummary?: ChangesSummary;
		/** Un-adopted legacy Copilot CLI session surfaced as adoptable; must not be passively restored. */
		adoptable?: boolean;
		chat?: SessionChatSummary;
		children?: readonly IChatSessionItem[];
	}): IChatSessionItem {
		const inProgress = opts.status !== undefined && (opts.status & SessionStatus.InProgress) !== 0;
		const description = inProgress && opts.activity ? opts.activity : this._description;
		const metadata = opts.adoptable
			? { ...(this._buildMetadata(opts.workingDirectory) ?? {}), [SESSION_META_EHCLI_ADOPTABLE_KEY]: true }
			: this._buildMetadata(opts.workingDirectory);
		return {
			resource: opts.chat ? resource.with({ fragment: getAgentHostChatId(opts.chat.resource) }) : resource,
			label: opts.title || `Session ${AgentSession.id(resource).substring(0, 8)}`,
			children: opts.children,
			description,
			iconPath: getAgentSessionProviderIcon(this._sessionType),
			...(opts.status !== undefined ? { status: mapSessionStatus(opts.status) } : undefined),
			archived: opts.status !== undefined && (opts.status & SessionStatus.IsArchived) === SessionStatus.IsArchived,
			// Without a host-provided status there is no opinion on read state —
			// a pending new session, or a cold one the host has no record for.
			// Leave it unset rather than reporting the synthesized bit as unread.
			isRead: opts.status !== undefined && opts.statusKnown !== false
				? (opts.status & SessionStatus.IsRead) === SessionStatus.IsRead
				: undefined,
			metadata,
			timing: {
				created: opts.createdAt,
				lastRequestStarted: opts.modifiedAt,
				lastRequestEnded: opts.modifiedAt,
			},
			changes: opts.changesSummary
				? {
					files: opts.changesSummary.files ?? 0,
					insertions: opts.changesSummary.additions ?? 0,
					deletions: opts.changesSummary.deletions ?? 0,
				}
				: undefined,
		};
	}

	private _resolveSession(resource: URI): URI {
		const registered = this._connectionsService.resolveSessionResourceIdentity(resource);
		const identity = registered?.backendSessionIsAdvertised ? registered
			: this._connectionsService.resolveSessionResourceIdentity(getAgentHostSessionResource(resource));
		if (!identity || identity.connectionAuthority !== this._connectionAuthority) {
			throw new Error(`Cannot resolve session '${resource.toString()}' on '${this._connectionAuthority}'`);
		}
		return identity.backendSession;
	}

	/** Tells the move tracker which chats the session lists, each with its chat session resource; a summary without a catalog says nothing about it. */
	private _updateChatCatalog(summary: SessionSummary): void {
		if (!summary.chats) {
			return;
		}
		const resource = this._sessionListStore.getSessionResource(URI.parse(summary.resource));
		this._chatMoves.update({ resource }, new Map(summary.chats.map(chat => [
			chat.resource.toString(),
			this._isDefaultChat(summary, chat) ? resource : resource.with({ fragment: getAgentHostChatId(chat.resource) }),
		])));
	}

	private _isDefaultChat(summary: SessionSummary, chat: SessionChatSummary): boolean {
		return summary.defaultChat === chat.resource;
	}

	private _resource(rawId: string): URI {
		return URI.from({ scheme: this._sessionType, path: `/${rawId}` });
	}

	private _buildMetadata(workingDirectory: URI | undefined): { readonly [key: string]: unknown } | undefined {
		if (!this._description && !workingDirectory) {
			return undefined;
		}
		const result: { [key: string]: unknown } = {};
		if (this._description) {
			result.remoteAgentHost = this._description;
		}
		if (workingDirectory) {
			result.workingDirectoryPath = workingDirectory.fsPath;
		}
		return Object.keys(result).length > 0 ? result : undefined;
	}
}
