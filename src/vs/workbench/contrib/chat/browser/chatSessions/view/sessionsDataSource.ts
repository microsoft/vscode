/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource } from '../../../../../../base/browser/ui/tree/tree.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IChatService } from '../../../common/chatService.js';
import { IChatSessionItemProvider } from '../../../common/chatSessionsService.js';
import { ChatSessionTracker } from '../chatSessionTracker.js';
import { ChatSessionItemWithProvider, extractTimestamp, processSessionsWithTimeGrouping } from '../common.js';
import { LocalChatSessionsProvider } from '../localChatSessionsProvider.js';

// Chat sessions item data source for the tree
export class SessionsDataSource implements IAsyncDataSource<IChatSessionItemProvider, ChatSessionItemWithProvider> {

	constructor(
		private readonly provider: IChatSessionItemProvider,
		private readonly chatService: IChatService,
		private readonly sessionTracker: ChatSessionTracker,
	) {
	}

	hasChildren(element: IChatSessionItemProvider | ChatSessionItemWithProvider): boolean {
		const isProvider = element === this.provider;
		if (isProvider) {
			// Root provider always has children
			return true;
		}

		// Check if this is the "Show history..." node
		if ('id' in element && element.id === LocalChatSessionsProvider.HISTORY_NODE_ID) {
			return true;
		}

		return false;
	}

	async getChildren(element: IChatSessionItemProvider | ChatSessionItemWithProvider): Promise<ChatSessionItemWithProvider[]> {
		if (element === this.provider) {
			try {
				const items = await this.provider.provideChatSessionItems(CancellationToken.None);
				const itemsWithProvider = items.map(item => {
					const itemWithProvider: ChatSessionItemWithProvider = { ...item, provider: this.provider };

					// Extract timestamp using the helper function
					itemWithProvider.timing = { startTime: extractTimestamp(item) ?? 0 };

					return itemWithProvider;
				});

				// Add hybrid local editor sessions for this provider using the centralized service
				if (this.provider.chatSessionType !== 'local') {
					const hybridSessions = await this.sessionTracker.getHybridSessionsForProvider(this.provider);
					itemsWithProvider.push(...(hybridSessions as ChatSessionItemWithProvider[]));
				}

				// For non-local providers, apply time-based sorting and grouping
				if (this.provider.chatSessionType !== 'local') {
					processSessionsWithTimeGrouping(itemsWithProvider);
				}

				return itemsWithProvider;
			} catch (error) {
				return [];
			}
		}

		// Check if this is the "Show history..." node
		if ('id' in element && element.id === LocalChatSessionsProvider.HISTORY_NODE_ID) {
			return this.getHistoryItems();
		}

		// Individual session items don't have children
		return [];
	}

	private async getHistoryItems(): Promise<ChatSessionItemWithProvider[]> {
		try {
			// Get all chat history
			const allHistory = await this.chatService.getHistory();

			// Create history items with provider reference and timestamps
			const historyItems = allHistory.map((historyDetail: any): ChatSessionItemWithProvider => ({
				id: historyDetail.sessionId,
				label: historyDetail.title,
				iconPath: Codicon.chatSparkle,
				provider: this.provider,
				timing: {
					startTime: historyDetail.lastMessageDate ?? Date.now()
				},
				isHistory: true,
			}));

			// Apply sorting and time grouping
			processSessionsWithTimeGrouping(historyItems);

			return historyItems;

		} catch (error) {
			return [];
		}
	}
}
