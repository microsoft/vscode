/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSession, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ISessionFileDiff, SessionStatus, type SessionSummary } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ChatSessionStatus, IChatSessionFileChange2, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta } from '../../../common/chatSessionsService.js';
import { getAgentHostIcon } from '../agentSessions.js';

type ICompactSessionFileDiff = { readonly uri: string; readonly added?: number; readonly removed?: number };

function mapDiffsToChanges(diffs: readonly ISessionFileDiff[] | readonly ICompactSessionFileDiff[] | undefined, connectionAuthority: string): readonly IChatSessionFileChange2[] | undefined {
	if (!diffs || diffs.length === 0) {
		return undefined;
	}
	const changes: IChatSessionFileChange2[] = [];
	for (const diff of diffs) {
		const uri = getDiffUri(diff);
		if (uri) {
			changes.push({
				uri: toAgentHostUri(URI.parse(uri), connectionAuthority),
				insertions: getDiffAdded(diff) ?? 0,
				deletions: getDiffRemoved(diff) ?? 0,
			});
		}
	}
	return changes.length > 0 ? changes : undefined;
}

function getDiffUri(diff: ISessionFileDiff | ICompactSessionFileDiff): string | undefined {
	return hasKey(diff, { uri: true }) ? diff.uri : diff.after?.uri ?? diff.before?.uri;
}

function getDiffAdded(diff: ISessionFileDiff | ICompactSessionFileDiff): number | undefined {
	return hasKey(diff, { uri: true }) ? diff.added : diff.diff?.added;
}

function getDiffRemoved(diff: ISessionFileDiff | ICompactSessionFileDiff): number | undefined {
	return hasKey(diff, { uri: true }) ? diff.removed : diff.diff?.removed;
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

	constructor(
		private readonly _sessionType: string,
		private readonly _provider: string,
		private readonly _connection: IAgentConnection,
		private readonly _description: string | undefined,
		private readonly _connectionAuthority: string,
		@IProductService private readonly _productService: IProductService,
	) {
		super();

		// React to protocol notifications for session list changes
		this._register(this._connection.onDidNotification(n => {
			if (n.type === 'notify/sessionAdded' && n.summary.provider === this._provider) {
				const rawId = AgentSession.id(n.summary.resource);
				this._cachedSummaries.set(rawId, n.summary);
				const workingDir = typeof n.summary.workingDirectory === 'string' ? URI.parse(n.summary.workingDirectory) : undefined;
				const item = this._makeItem(rawId, {
					title: n.summary.title,
					status: n.summary.status,
					workingDirectory: workingDir,
					createdAt: n.summary.createdAt,
					modifiedAt: n.summary.modifiedAt,
					diffs: n.summary.diffs,
				});
				this._items.push(item);
				this._onDidChangeChatSessionItems.fire({ addedOrUpdated: [item] });
			} else if (n.type === 'notify/sessionRemoved' && AgentSession.provider(n.session) === this._provider) {
				const removedId = AgentSession.id(n.session);
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

	get items(): readonly IChatSessionItem[] {
		return this._items;
	}

	async refresh(_token: CancellationToken): Promise<void> {
		try {
			const sessions = await this._connection.listSessions();
			const filtered = sessions.filter(s => AgentSession.provider(s.session) === this._provider);
			this._cachedSummaries.clear();
			this._items = filtered.map(s => {
				const rawId = AgentSession.id(s.session);
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
					createdAt: s.startTime,
					modifiedAt: s.modifiedTime,
					workingDirectory: s.workingDirectory?.toString(),
				});
				return this._makeItem(rawId, {
					title: s.summary,
					status,
					workingDirectory: s.workingDirectory,
					createdAt: s.startTime,
					modifiedAt: s.modifiedTime,
					diffs: s.diffs,
				});
			});
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
			workingDirectory: workingDir,
			createdAt: summary.createdAt,
			modifiedAt: summary.modifiedAt,
			diffs,
		});
	}

	private _makeItem(rawId: string, opts: {
		title?: string;
		status?: SessionStatus;
		workingDirectory?: URI;
		createdAt: number;
		modifiedAt: number;
		diffs?: readonly ISessionFileDiff[] | readonly ICompactSessionFileDiff[];
	}): IChatSessionItem {
		return {
			resource: URI.from({ scheme: this._sessionType, path: `/${rawId}` }),
			label: opts.title || `Session ${rawId.substring(0, 8)}`,
			description: this._description,
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

	private _buildMetadata(workingDirectory?: URI): { readonly [key: string]: unknown } | undefined {
		if (!this._description) {
			return undefined;
		}
		const result: { [key: string]: unknown } = { remoteAgentHost: this._description };
		if (workingDirectory) {
			result.workingDirectoryPath = workingDirectory.fsPath;
		}
		return result;
	}
}
