/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import type { ChangesSummary } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { SessionStatus, type SessionSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ChatSessionStatus, IChatNewSessionRequest, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta } from '../../../common/chatSessionsService.js';
import { getAgentSessionProviderIcon } from '../agentSessions.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { IAgentHostImportConversationStore } from './agentHostImportConversationStore.js';
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
 * by projecting the shared {@link AgentHostSessionListStore} state. The
 * controller is a stateless view: items are derived from the store on demand
 * and change events are a filtered/mapped projection of the store's event.
 */
export class AgentHostSessionListController extends Disposable implements IChatSessionItemController {

	readonly onDidChangeChatSessionItems: Event<IChatSessionItemsDelta>;

	constructor(
		private readonly _sessionType: string,
		private readonly _provider: string,
		private readonly _sessionListStore: AgentHostSessionListStore,
		private readonly _description: string | undefined,
		_connectionAuthority: string,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisional: IAgentHostUntitledProvisionalSessionService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IAgentHostNewSessionFolderService private readonly _newSessionFolderService: IAgentHostNewSessionFolderService,
		@IAgentHostImportConversationStore private readonly _importConversationStore: IAgentHostImportConversationStore,
	) {
		super();
		void _connectionAuthority;

		// Project the store's provider-agnostic delta down to this provider's
		// chat-session-item delta, dropping events that don't touch us. Both
		// combinators are bound to `this._store` so disposing the controller
		// tears down the projection and its subscription to the store event.
		this.onDidChangeChatSessionItems = Event.filter(
			Event.map(this._sessionListStore.onDidChangeSessions, delta => this._projectDelta(delta), this._store),
			(delta: IChatSessionItemsDelta | undefined): delta is IChatSessionItemsDelta => delta !== undefined,
			this._store,
		);
	}

	get items(): readonly IChatSessionItem[] {
		return this._sessionListStore.getSessions(this._provider)
			.map(entry => this._makeItemFromSummary(entry.rawId, entry.summary));
	}

	isNewSession(resource: URI): boolean {
		return resource.scheme === this._sessionType
			&& this._sessionListStore.isPendingNewSession(this._provider, resource.path.substring(1));
	}

	async newChatSessionItem(request: IChatNewSessionRequest, token: CancellationToken): Promise<IChatSessionItem | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}
		const rawId = generateUuid();
		this._sessionListStore.addPendingNewSession(this._provider, rawId);
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

		// `root/sessionRemoved` only fires for sessions the backend had previously announced, so remove the session from
		// the store directly (this also clears any local pending marker). If the notification does fire as well, the
		// second call is a no-op.
		this._sessionListStore.removeSession(this._provider, rawId);
	}

	async refresh(token: CancellationToken): Promise<void> {
		// The store fans out a delta during the await when its list changes, which
		// projects into a change event. When nothing changed (e.g. the store cache
		// was still valid), `items` already reflects the current store state.
		await this._sessionListStore.refresh(token);
	}

	private _projectDelta(delta: IAgentHostSessionListDelta): IChatSessionItemsDelta | undefined {
		let addedOrUpdated: IChatSessionItem[] | undefined;
		for (const entry of delta.addedOrUpdated ?? []) {
			if (entry.provider !== this._provider) {
				continue;
			}
			(addedOrUpdated ??= []).push(this._makeItemFromSummary(entry.rawId, entry.summary));
		}

		let removed: URI[] | undefined;
		for (const removal of delta.removed ?? []) {
			if (removal.provider !== this._provider) {
				continue;
			}
			(removed ??= []).push(this._resource(removal.rawId));
		}

		if (!addedOrUpdated && !removed) {
			return undefined;
		}
		return { ...(addedOrUpdated ? { addedOrUpdated } : undefined), ...(removed ? { removed } : undefined) };
	}

	private _makeItemFromSummary(rawId: string, summary: SessionSummary): IChatSessionItem {
		const workingDir = typeof summary.workingDirectory === 'string' ? URI.parse(summary.workingDirectory) : summary.workingDirectory;
		return this._makeItem(rawId, {
			title: summary.title,
			status: summary.status,
			activity: summary.activity,
			workingDirectory: workingDir,
			createdAt: Date.parse(summary.createdAt),
			modifiedAt: Date.parse(summary.modifiedAt),
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
			resource: this._resource(rawId),
			label: opts.title || `Session ${rawId.substring(0, 8)}`,
			description,
			iconPath: getAgentSessionProviderIcon(this._sessionType),
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
