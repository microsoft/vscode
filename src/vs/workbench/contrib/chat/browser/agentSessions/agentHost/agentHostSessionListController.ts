/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import type { ChangesSummary } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { SessionStatus, type SessionSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ChatSessionStatus, IChatNewSessionRequest, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta } from '../../../common/chatSessionsService.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { AgentHostSessionListStore, type IAgentHostSessionListDelta } from './agentHostSessionListStore.js';

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
 * by projecting the shared {@link AgentHostSessionListStore} state.
 */
export class AgentHostSessionListController extends Disposable implements IChatSessionItemController {

	private readonly _onDidChangeChatSessionItems = this._register(new Emitter<IChatSessionItemsDelta>());
	readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;

	private _itemsByRawId = new Map<string, IChatSessionItem>();
	/** Final-looking resources created locally before the backend session exists. */
	private readonly _pendingNewSessions = new Set<string>();

	constructor(
		private readonly _sessionType: string,
		private readonly _provider: string,
		private readonly _sessionListStore: AgentHostSessionListStore,
		private readonly _description: string | undefined,
		_connectionAuthority: string,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisional: IAgentHostUntitledProvisionalSessionService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IAgentHostNewSessionFolderService private readonly _newSessionFolderService: IAgentHostNewSessionFolderService,
	) {
		super();
		void _connectionAuthority;

		this._register(this._sessionListStore.onDidChangeSessions(delta => this._applyDelta(delta)));

		// Seed from the store's current snapshot so a controller created after the
		// store is already populated has its items immediately; later changes
		// arrive as incremental deltas. No event is fired here because the
		// consumer pulls `items` after the initial `refresh()`.
		for (const entry of this._sessionListStore.getSessions(this._provider)) {
			this._itemsByRawId.set(entry.rawId, this._makeItemFromSummary(entry.rawId, entry.summary));
		}
	}

	get items(): readonly IChatSessionItem[] {
		return [...this._itemsByRawId.values()];
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

	async deleteChatSessionItem(resource: URI, _token: CancellationToken): Promise<void> {
		if (resource.scheme !== this._sessionType) {
			return;
		}

		const rawId = AgentSession.id(resource);
		await this._sessionListStore.disposeSession(this._provider, rawId);
		this._pendingNewSessions.delete(rawId);

		// `root/sessionRemoved` only fires for sessions the backend had previously announced, so remove the item from
		// our cache directly. If the notification does fire as well, the second call is a no-op.
		this._sessionListStore.removeSession(this._provider, rawId);
	}

	async refresh(token: CancellationToken): Promise<void> {
		// The store fans out a delta during the await when its list changes, which
		// `_applyDelta` projects into items. When nothing changed (e.g. the store
		// cache was still valid), the items seeded in the constructor / kept live
		// by deltas are already current.
		await this._sessionListStore.refresh(token);
	}

	private _applyDelta(delta: IAgentHostSessionListDelta): void {
		const addedOrUpdated: IChatSessionItem[] = [];
		const removed: URI[] = [];

		for (const entry of delta.addedOrUpdated ?? []) {
			if (entry.provider !== this._provider) {
				continue;
			}
			this._pendingNewSessions.delete(entry.rawId);
			const item = this._makeItemFromSummary(entry.rawId, entry.summary);
			// `set` appends a new raw id and replaces an existing one in place.
			this._itemsByRawId.set(entry.rawId, item);
			addedOrUpdated.push(item);
		}

		for (const removal of delta.removed ?? []) {
			if (removal.provider !== this._provider) {
				continue;
			}
			this._pendingNewSessions.delete(removal.rawId);
			const existing = this._itemsByRawId.get(removal.rawId);
			if (!existing) {
				continue;
			}
			this._itemsByRawId.delete(removal.rawId);
			removed.push(existing.resource);
		}

		this._fireDelta({
			...(addedOrUpdated.length > 0 ? { addedOrUpdated } : undefined),
			...(removed.length > 0 ? { removed } : undefined),
		});
	}

	private _fireDelta(delta: IChatSessionItemsDelta | undefined): void {
		if (!delta || (!delta.addedOrUpdated?.length && !delta.removed?.length)) {
			return;
		}
		this._onDidChangeChatSessionItems.fire(delta);
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
			changesSummary: summary.changes,
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
