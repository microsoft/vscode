/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { AgentSession, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { ChangesSummary } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { SessionStatus, type SessionSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ChatSessionStatus, IChatNewSessionRequest, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta } from '../../../common/chatSessionsService.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';

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
 * Provides session list items for the chat sessions sidebar by querying
 * active sessions from an agent host connection. Listens to protocol
 * notifications for incremental updates.
 *
 * Works with both local and remote agent host connections via the
 * {@link IAgentConnection} interface.
 */
export class AgentHostSessionListController extends Disposable implements IChatSessionItemController {

	private readonly _onDidChangeChatSessionItems = this._register(new Emitter<IChatSessionItemsDelta>());
	readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;

	private _items: IChatSessionItem[] = [];
	/** Cached full summaries per session so partial updates can be applied. */
	private readonly _cachedSummaries = new Map<string, SessionSummary>();
	/** Final-looking resources created locally before the backend session exists. */
	private readonly _pendingNewSessions = new Set<string>();
	/**
	 * Once `listSessions()` has succeeded, the in-memory list is kept in
	 * sync by `notify/sessionAdded`, `notify/sessionRemoved`, and
	 * `notify/sessionSummaryChanged`. Subsequent `refresh()` calls then
	 * just re-emit the cached items instead of re-issuing the RPC.
	 *
	 * Lifetime: the controller is created per agent registration and
	 * disposed when the registration is torn down (e.g. on connection
	 * replacement), so this flag naturally resets on reconnect.
	 */
	private _cacheValid = false;
	/**
	 * Incremented whenever the in-memory list is mutated outside of
	 * {@link refresh}. Used to detect races where a `root/sessionAdded`,
	 * `root/sessionRemoved`, or `root/sessionSummaryChanged` notification
	 * arrives while a `listSessions()` round-trip is in flight — in that
	 * case our snapshot is stale and we must discard it and re-fetch
	 * instead of overwriting the just-updated `_items`/`_cachedSummaries`.
	 */
	private _mutationGeneration = 0;

	constructor(
		private readonly _sessionType: string,
		private readonly _provider: string,
		private readonly _connection: IAgentConnection,
		private readonly _description: string | undefined,
		_connectionAuthority: string,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisional: IAgentHostUntitledProvisionalSessionService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IAgentHostNewSessionFolderService private readonly _newSessionFolderService: IAgentHostNewSessionFolderService,
	) {
		super();
		void _connectionAuthority;

		// React to protocol notifications for session list changes
		this._register(this._connection.onDidNotification(n => {
			if (n.type === 'root/sessionAdded' && n.summary.provider === this._provider) {
				const rawId = AgentSession.id(n.summary.resource);
				this._pendingNewSessions.delete(rawId);
				const workingDir = typeof n.summary.workingDirectory === 'string' ? URI.parse(n.summary.workingDirectory) : n.summary.workingDirectory;
				if (!this._isWorkingDirectoryInWorkspace(workingDir)) {
					return;
				}
				this._mutationGeneration++;
				this._cachedSummaries.set(rawId, n.summary);
				const item = this._makeItemFromSummary(rawId, n.summary);
				const existingIndex = this._items.findIndex(item => item.resource.path === `/${rawId}`);
				if (existingIndex >= 0) {
					this._items[existingIndex] = item;
				} else {
					this._items.push(item);
				}
				this._onDidChangeChatSessionItems.fire({ addedOrUpdated: [item] });
			} else if (n.type === 'root/sessionRemoved' && AgentSession.provider(n.session) === this._provider) {
				const removedId = AgentSession.id(n.session);
				this._pendingNewSessions.delete(removedId);
				const idx = this._items.findIndex(item => item.resource.path === `/${removedId}`);
				if (idx >= 0) {
					this._mutationGeneration++;
					const [removed] = this._items.splice(idx, 1);
					this._cachedSummaries.delete(removedId);
					this._onDidChangeChatSessionItems.fire({ removed: [removed.resource] });
				}
			} else if (n.type === 'root/sessionSummaryChanged' && AgentSession.provider(n.session) === this._provider) {
				const rawId = AgentSession.id(n.session);
				const cached = this._cachedSummaries.get(rawId);
				if (!cached) {
					return;
				}
				this._mutationGeneration++;
				const updated = { ...cached, ...n.changes };
				this._cachedSummaries.set(rawId, updated);

				const item = this._makeItemFromSummary(rawId, updated);
				const idx = this._items.findIndex(i => i.resource.path === `/${rawId}`);
				if (idx >= 0) {
					this._items[idx] = item;
				} else {
					this._items.unshift(item);
				}
				this._onDidChangeChatSessionItems.fire({ addedOrUpdated: [item] });
			}
		}));

		// Re-fetch the session list whenever the set of VS Code workspace
		// folders changes, since filtering depends on it. The agent host
		// itself doesn't know which workspace this VS Code window has open,
		// so we have to drive the refresh from this side.
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._cacheValid = false;
			void this.refresh(CancellationToken.None);
		}));
	}

	/** Reset the list-sessions cache so the next {@link refresh} re-fetches from the agent host. */
	resetCache(): void {
		this._cacheValid = false;
	}

	get items(): readonly IChatSessionItem[] {
		return this._items;
	}

	isNewSession(resource: URI): boolean {
		return resource.scheme === this._sessionType && this._pendingNewSessions.has(resource.path.substring(1));
	}

	async newChatSessionItem(request: IChatNewSessionRequest, token: CancellationToken): Promise<IChatSessionItem | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}
		const rawId = generateUuid();
		this._pendingNewSessions.add(rawId);
		const now = Date.now();
		const item = this._makeItem(rawId, {
			title: request.prompt.trim(),
			status: SessionStatus.InProgress,
			createdAt: now,
			modifiedAt: now,
		});

		// Bridge any pre-creation provisional session the user built up
		// against the untitled chat-input URI to the freshly-minted real
		// resource. The provisional service is the source of truth for the
		// `state.config.values` the user picked via chips; copying them
		// here means the agent's `_materializeProvisional` will see them on
		// first send. Best-effort — if no provisional exists or the rebind
		// fails, the handler falls through to its standard
		// `_createAndSubscribe` path with no user selections.
		if (request.untitledResource) {
			const workingDirectory = this._newSessionFolderService.getFolder(request.untitledResource)
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
			await this._provisional.tryRebind(request.untitledResource, item.resource, this._provider, workingDirectory);
		}

		return item;
	}

	async refresh(token: CancellationToken): Promise<void> {
		if (this._cacheValid) {
			// Cache is kept in sync by notify/sessionAdded,
			// notify/sessionRemoved, and notify/sessionSummaryChanged. No
			// need to round-trip through the agent host on every refresh.
			if (this._items.length > 0) {
				this._onDidChangeChatSessionItems.fire({ addedOrUpdated: this._items });
			}
			return;
		}
		const previousResources = this._items.map(item => item.resource);
		const startGeneration = this._mutationGeneration;
		let sessions;
		try {
			sessions = await this._connection.listSessions();
		} catch {
			// If notifications mutated the list while we were fetching,
			// the in-memory state is more up-to-date than our (now failed)
			// fetch. Bail out without clobbering it.
			if (startGeneration !== this._mutationGeneration) {
				return;
			}
			if (this._items.length === 0) {
				return;
			}
			const removed = previousResources;
			this._cachedSummaries.clear();
			this._items = [];
			this._onDidChangeChatSessionItems.fire({ removed });
			return;
		}
		// If notifications mutated the list between the request and the
		// response, our snapshot is stale — discard it and re-fetch
		// instead of overwriting the just-updated `_items` /
		// `_cachedSummaries`.
		if (startGeneration !== this._mutationGeneration) {
			return this.refresh(token);
		}
		const filtered = sessions.filter(s =>
			AgentSession.provider(s.session) === this._provider
			&& this._isWorkingDirectoryInWorkspace(s.workingDirectory)
		);
		this._cachedSummaries.clear();
		this._items = filtered.map(s => {
			const rawId = AgentSession.id(s.session);
			this._pendingNewSessions.delete(rawId);
			let status = s.status ?? SessionStatus.Idle;
			if (s.isRead) {
				status |= SessionStatus.IsRead;
			}
			if (s.isArchived) {
				status |= SessionStatus.IsArchived;
			}
			this._cachedSummaries.set(rawId, {
				resource: s.session.toString(),
				provider: this._provider,
				title: s.summary ?? `Session ${rawId.substring(0, 8)}`,
				status,
				activity: s.activity,
				createdAt: s.startTime,
				modifiedAt: s.modifiedTime,
				changes: s.changes,
				workingDirectory: s.workingDirectory?.toString(),
			});
			return this._makeItem(rawId, {
				title: s.summary,
				status,
				activity: s.activity,
				workingDirectory: s.workingDirectory,
				createdAt: s.startTime,
				modifiedAt: s.modifiedTime,
				changesSummary: s.changes,
			});
		});
		this._cacheValid = true;
		const currentResources = new Set(this._items.map(item => item.resource.toString()));
		const removed = previousResources.filter(r => !currentResources.has(r.toString()));
		if (this._items.length === 0 && removed.length === 0) {
			return;
		}
		this._onDidChangeChatSessionItems.fire({
			...(this._items.length > 0 ? { addedOrUpdated: this._items } : undefined),
			...(removed.length > 0 ? { removed } : undefined),
		});
	}

	/**
	 * Returns `true` if a session with the given working directory belongs
	 * to the current VS Code workspace. When the window has no workspace
	 * folders open (e.g. the Agents window, or an empty VS Code window),
	 * filtering is disabled and every session is considered in-scope.
	 *
	 * Sessions without a working directory are excluded when a workspace
	 * is open since they cannot be attributed to any folder.
	 */
	private _isWorkingDirectoryInWorkspace(workingDirectory: URI | undefined): boolean {
		const folders = this._workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return true;
		}
		if (!workingDirectory) {
			return false;
		}
		return folders.some(folder => extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, folder.uri));
	}

	private _makeItemFromSummary(rawId: string, summary: SessionSummary): IChatSessionItem {
		const workingDir = typeof summary.workingDirectory === 'string' ? URI.parse(summary.workingDirectory) : summary.workingDirectory;
		return this._makeItem(rawId, {
			title: summary.title,
			status: summary.status,
			activity: summary.activity,
			workingDirectory: workingDir,
			createdAt: summary.createdAt,
			modifiedAt: summary.modifiedAt,
		});
	}

	private _makeItem(rawId: string, opts: {
		title?: string;
		status?: SessionStatus;
		activity?: string;
		workingDirectory?: URI;
		createdAt: number;
		modifiedAt: number;
		changesSummary?: ChangesSummary;
	}): IChatSessionItem {
		const inProgress = opts.status !== undefined && (opts.status & SessionStatus.InProgress) !== 0;
		const description = inProgress && opts.activity ? opts.activity : this._description;
		return {
			resource: URI.from({ scheme: this._sessionType, path: `/${rawId}` }),
			label: opts.title || `Session ${rawId.substring(0, 8)}`,
			description,
			iconPath: Codicon.copilot,
			status: mapSessionStatus(opts.status),
			archived: opts.status !== undefined && (opts.status & SessionStatus.IsArchived) === SessionStatus.IsArchived,
			metadata: this._buildMetadata(opts.workingDirectory),
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
