/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSession, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ISessionFileDiff, SessionStatus, type SessionSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ChatSessionStatus, IChatNewSessionRequest, IChatSessionFileChange2, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta } from '../../../common/chatSessionsService.js';
import { getAgentHostIcon } from '../agentSessions.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';

function mapDiffsToChanges(diffs: readonly ISessionFileDiff[] | undefined, connectionAuthority: string): readonly IChatSessionFileChange2[] | undefined {
	if (!diffs || diffs.length === 0) {
		return undefined;
	}
	const changes: IChatSessionFileChange2[] = [];
	for (const diff of diffs) {
		const uri = diff.after?.uri ?? diff.before?.uri;
		if (uri) {
			changes.push({
				uri: toAgentHostUri(URI.parse(uri), connectionAuthority),
				insertions: diff.diff?.added ?? 0,
				deletions: diff.diff?.removed ?? 0,
			});
		}
	}
	return changes.length > 0 ? changes : undefined;
}

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

	constructor(
		private readonly _sessionType: string,
		private readonly _provider: string,
		private readonly _connection: IAgentConnection,
		private readonly _description: string | undefined,
		private readonly _connectionAuthority: string,
		@IProductService private readonly _productService: IProductService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisional: IAgentHostUntitledProvisionalSessionService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		// React to protocol notifications for session list changes
		this._register(this._connection.onDidNotification(n => {
			if (n.type === 'notify/sessionAdded' && n.summary.provider === this._provider) {
				const rawId = AgentSession.id(n.summary.resource);
				this._pendingNewSessions.delete(rawId);
				this._cachedSummaries.set(rawId, n.summary);
				const item = this._makeItemFromSummary(rawId, n.summary, n.summary.diffs);
				const existingIndex = this._items.findIndex(item => item.resource.path === `/${rawId}`);
				if (existingIndex >= 0) {
					this._items[existingIndex] = item;
				} else {
					this._items.push(item);
				}
				this._onDidChangeChatSessionItems.fire({ addedOrUpdated: [item] });
			} else if (n.type === 'notify/sessionRemoved' && AgentSession.provider(n.session) === this._provider) {
				const removedId = AgentSession.id(n.session);
				this._pendingNewSessions.delete(removedId);
				const idx = this._items.findIndex(item => item.resource.path === `/${removedId}`);
				if (idx >= 0) {
					const [removed] = this._items.splice(idx, 1);
					this._cachedSummaries.delete(removedId);
					this._onDidChangeChatSessionItems.fire({ removed: [removed.resource] });
				}
			} else if (n.type === 'notify/sessionSummaryChanged' && AgentSession.provider(n.session) === this._provider) {
				const rawId = AgentSession.id(n.session);
				const cached = this._cachedSummaries.get(rawId);
				if (!cached) {
					return;
				}
				const updated = { ...cached, ...n.changes };
				this._cachedSummaries.set(rawId, updated);

				const item = this._makeItemFromSummary(rawId, updated, updated.diffs);
				const idx = this._items.findIndex(i => i.resource.path === `/${rawId}`);
				if (idx >= 0) {
					this._items[idx] = item;
				} else {
					this._items.unshift(item);
				}
				this._onDidChangeChatSessionItems.fire({ addedOrUpdated: [item] });
			}
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
			const workingDirectory = this._workspaceContextService.getWorkspace().folders[0]?.uri;
			await this._provisional.tryRebind(request.untitledResource, item.resource, this._provider, workingDirectory);
		}

		return item;
	}

	async refresh(_token: CancellationToken): Promise<void> {
		if (this._cacheValid) {
			// Cache is kept in sync by notify/sessionAdded,
			// notify/sessionRemoved, and notify/sessionSummaryChanged. No
			// need to round-trip through the agent host on every refresh.
			this._onDidChangeChatSessionItems.fire({ addedOrUpdated: this._items });
			return;
		}
		try {
			const sessions = await this._connection.listSessions();
			const filtered = sessions.filter(s => AgentSession.provider(s.session) === this._provider);
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
					workingDirectory: s.workingDirectory?.toString(),
				});
				return this._makeItem(rawId, {
					title: s.summary,
					status,
					activity: s.activity,
					workingDirectory: s.workingDirectory,
					createdAt: s.startTime,
					modifiedAt: s.modifiedTime,
					diffs: s.diffs,
				});
			});
			this._cacheValid = true;
		} catch {
			this._cachedSummaries.clear();
			this._items = [];
		}
		this._onDidChangeChatSessionItems.fire({ addedOrUpdated: this._items });
	}

	private _makeItemFromSummary(rawId: string, summary: SessionSummary, diffs: readonly ISessionFileDiff[] | undefined): IChatSessionItem {
		const workingDir = typeof summary.workingDirectory === 'string' ? URI.parse(summary.workingDirectory) : summary.workingDirectory;
		return this._makeItem(rawId, {
			title: summary.title,
			status: summary.status,
			activity: summary.activity,
			workingDirectory: workingDir,
			createdAt: summary.createdAt,
			modifiedAt: summary.modifiedAt,
			diffs,
		});
	}

	private _makeItem(rawId: string, opts: {
		title?: string;
		status?: SessionStatus;
		activity?: string;
		workingDirectory?: URI;
		createdAt: number;
		modifiedAt: number;
		diffs?: readonly ISessionFileDiff[];
	}): IChatSessionItem {
		const inProgress = opts.status !== undefined && (opts.status & SessionStatus.InProgress) !== 0;
		const description = inProgress && opts.activity ? opts.activity : this._description;
		return {
			resource: URI.from({ scheme: this._sessionType, path: `/${rawId}` }),
			label: opts.title || `Session ${rawId.substring(0, 8)}`,
			description,
			iconPath: getAgentHostIcon(this._productService),
			status: mapSessionStatus(opts.status),
			archived: opts.status !== undefined && (opts.status & SessionStatus.IsArchived) === SessionStatus.IsArchived,
			metadata: this._buildMetadata(opts.workingDirectory),
			timing: {
				created: opts.createdAt,
				lastRequestStarted: opts.modifiedAt,
				lastRequestEnded: opts.modifiedAt,
			},
			changes: mapDiffsToChanges(opts.diffs, this._connectionAuthority),
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
