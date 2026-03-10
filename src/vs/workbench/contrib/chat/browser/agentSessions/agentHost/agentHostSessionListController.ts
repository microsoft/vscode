/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IAgentHostService, AgentSession } from '../../../../../../platform/agentHost/common/agentService.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemController } from '../../../common/chatSessionsService.js';
import { getAgentHostIcon } from '../agentSessions.js';

/**
 * Provides session list items for the chat sessions sidebar by querying
 * active sessions from the agent host process.
 */
export class AgentHostSessionListController extends Disposable implements IChatSessionItemController {

	private readonly _onDidChangeChatSessionItems = this._register(new Emitter<void>());
	readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;

	private _items: IChatSessionItem[] = [];

	constructor(
		private readonly _sessionType: string,
		private readonly _provider: string,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IProductService private readonly _productService: IProductService,
	) {
		super();
	}

	get items(): readonly IChatSessionItem[] {
		return this._items;
	}

	async refresh(_token: CancellationToken): Promise<void> {
		try {
			const sessions = await this._agentHostService.listSessions();
			const filtered = sessions.filter(s => AgentSession.provider(s.session) === this._provider);
			const rawId = (s: typeof filtered[0]) => AgentSession.id(s.session);
			this._items = filtered.map(s => ({
				resource: URI.from({ scheme: this._sessionType, path: `/${rawId(s)}` }),
				label: s.summary ?? `Session ${rawId(s).substring(0, 8)}`,
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
		this._onDidChangeChatSessionItems.fire();
	}
}
