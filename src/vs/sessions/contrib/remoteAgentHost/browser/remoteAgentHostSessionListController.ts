/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AgentSession } from '../../../../platform/agentHost/common/agentService.js';
import { isSessionAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { getAgentHostIcon } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';

/**
 * Provides session list items for a single remote agent host address
 * filtered by a specific agent provider. Listens to protocol notifications
 * for incremental updates.
 */
export class RemoteAgentHostSessionListController extends Disposable implements IChatSessionItemController {

	private readonly _onDidChangeChatSessionItems = this._register(new Emitter<IChatSessionItemsDelta>());
	readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;

	private _items: IChatSessionItem[] = [];

	constructor(
		private readonly _sessionType: string,
		private readonly _provider: string,
		private readonly _address: string,
		private readonly _displayName: string,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();

		this._register(this._remoteAgentHostService.onDidNotification(n => {
			if (n.remoteAddress !== this._address) {
				return;
			}
			if (n.notification.type === 'notify/sessionAdded' && n.notification.summary.provider === this._provider) {
				const rawId = AgentSession.id(n.notification.summary.resource);
				this._items.push({
					resource: URI.from({ scheme: this._sessionType, path: `/${rawId}` }),
					label: n.notification.summary.title ?? `Session ${rawId.substring(0, 8)}`,
					description: this._displayName,
					iconPath: getAgentHostIcon(this._productService),
					status: ChatSessionStatus.Completed,
					timing: {
						created: n.notification.summary.createdAt,
						lastRequestStarted: n.notification.summary.modifiedAt,
						lastRequestEnded: n.notification.summary.modifiedAt,
					},
				});
				this._onDidChangeChatSessionItems.fire({ addedOrUpdated: [this._items[this._items.length - 1]] });
			} else if (n.notification.type === 'notify/sessionRemoved') {
				const removedId = AgentSession.id(n.notification.session);
				const idx = this._items.findIndex(item => item.resource.path === `/${removedId}`);
				if (idx >= 0) {
					const removed = this._items.splice(idx, 1);
					this._onDidChangeChatSessionItems.fire({ removed: [removed[0].resource] });
				}
			}
		}));

		this._register(this._remoteAgentHostService.onDidAction(e => {
			if (e.remoteAddress !== this._address) {
				return;
			}
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
			const sessions = await this._remoteAgentHostService.listSessions(this._address);
			const filtered = sessions.filter(s => AgentSession.provider(s.session) === this._provider);
			const rawId = (s: typeof filtered[0]) => AgentSession.id(s.session);
			this._items = filtered.map(s => ({
				resource: URI.from({ scheme: this._sessionType, path: `/${rawId(s)}` }),
				label: s.summary ?? `Session ${rawId(s).substring(0, 8)}`,
				description: this._displayName,
				iconPath: getAgentHostIcon(this._productService),
				status: ChatSessionStatus.Completed,
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
}
