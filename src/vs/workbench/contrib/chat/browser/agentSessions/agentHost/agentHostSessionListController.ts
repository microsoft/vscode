/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { AgentSession, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta } from '../../../common/chatSessionsService.js';
import { getAgentHostIcon } from '../agentSessions.js';

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

	constructor(
		private readonly _sessionType: string,
		private readonly _provider: string,
		private readonly _connection: IAgentConnection,
		private readonly _description: string | undefined,
		@IProductService private readonly _productService: IProductService,
	) {
		super();

		// React to protocol notifications for session list changes
		this._register(this._connection.onDidNotification(n => {
			if (n.type === 'notify/sessionAdded' && n.summary.provider === this._provider) {
				const rawId = AgentSession.id(n.summary.resource);
				const workingDir = typeof n.summary.workingDirectory === 'string' ? n.summary.workingDirectory : undefined;
				const item: IChatSessionItem = {
					resource: URI.from({ scheme: this._sessionType, path: `/${rawId}` }),
					label: n.summary.title ?? `Session ${rawId.substring(0, 8)}`,
					description: this._description,
					iconPath: getAgentHostIcon(this._productService),
					status: ChatSessionStatus.Completed,
					metadata: this._buildMetadata(workingDir),
					timing: {
						created: n.summary.createdAt,
						lastRequestStarted: n.summary.modifiedAt,
						lastRequestEnded: n.summary.modifiedAt,
					},
				};
				this._items.push(item);
				this._onDidChangeChatSessionItems.fire({ addedOrUpdated: [item] });
			} else if (n.type === 'notify/sessionRemoved' && AgentSession.provider(n.session) === this._provider) {
				const removedId = AgentSession.id(n.session);
				const idx = this._items.findIndex(item => item.resource.path === `/${removedId}`);
				if (idx >= 0) {
					const [removed] = this._items.splice(idx, 1);
					this._onDidChangeChatSessionItems.fire({ removed: [removed.resource] });
				}
			}
		}));

		// Refresh on turnComplete actions for metadata updates (title, timing)
		this._register(this._connection.onDidAction(e => {
			if (e.action.type === 'session/turnComplete' && isSessionAction(e.action) && AgentSession.provider(e.action.session) === this._provider) {
				const cts = new CancellationTokenSource();
				this.refresh(cts.token).finally(() => cts.dispose());
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
			const rawId = (s: typeof filtered[0]) => AgentSession.id(s.session);
			this._items = filtered.map(s => ({
				resource: URI.from({ scheme: this._sessionType, path: `/${rawId(s)}` }),
				label: s.summary ?? `Session ${rawId(s).substring(0, 8)}`,
				description: this._description,
				iconPath: getAgentHostIcon(this._productService),
				status: ChatSessionStatus.Completed,
				metadata: this._buildMetadata(s.workingDirectory),
				timing: {
					created: s.startTime,
					lastRequestStarted: s.modifiedTime,
					lastRequestEnded: s.modifiedTime,
				},
			}));
		} catch {
			this._items = [];
		}
		this._onDidChangeChatSessionItems.fire({ addedOrUpdated: this._items });
	}

	private _buildMetadata(workingDirectory?: string): { readonly [key: string]: unknown } | undefined {
		if (!this._description) {
			return undefined;
		}
		const result: { [key: string]: unknown } = { remoteAgentHost: this._description };
		if (workingDirectory) {
			result.workingDirectoryPath = workingDirectory;
		}
		return result;
	}
}
