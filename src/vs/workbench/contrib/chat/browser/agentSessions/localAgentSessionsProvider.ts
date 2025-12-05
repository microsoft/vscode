/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IChatModel } from '../../common/chatModel.js';
import { IChatDetail, IChatService } from '../../common/chatService.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemProvider, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { ChatSessionItemWithProvider } from '../chatSessions/common.js';

export class LocalAgentsSessionsProvider extends Disposable implements IChatSessionItemProvider, IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.localAgentsSessionsProvider';

	readonly chatSessionType = localChatSessionType;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	readonly _onDidChangeChatSessionItems = this._register(new Emitter<void>());
	readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		this._register(this.chatSessionsService.registerChatSessionItemProvider(this));

		this.registerListeners();
	}

	private registerListeners(): void {

		this._register(this.chatSessionsService.registerChatModelChangeListeners(
			this.chatService,
			Schemas.vscodeLocalChatSession,
			() => this._onDidChangeChatSessionItems.fire()
		));

		// Listen for global session items changes for our session type
		this._register(this.chatSessionsService.onDidChangeSessionItems(sessionType => {
			if (sessionType === this.chatSessionType) {
				this._onDidChange.fire();
			}
		}));
	}


	private modelToStatus(model: IChatModel): ChatSessionStatus | undefined {
		if (model.requestInProgress.get()) {
			return ChatSessionStatus.InProgress;
		}

		const requests = model.getRequests();
		if (requests.length > 0) {

			// Check if the last request was completed successfully or failed
			const lastRequest = requests[requests.length - 1];
			if (lastRequest?.response) {
				if (lastRequest.response.isCanceled || lastRequest.response.result?.errorDetails) {
					return ChatSessionStatus.Failed;
				} else if (lastRequest.response.isComplete) {
					return ChatSessionStatus.Completed;
				} else {
					return ChatSessionStatus.InProgress;
				}
			}
		}

		return undefined;
	}

	async provideChatSessionItems(token: CancellationToken): Promise<IChatSessionItem[]> {
		const sessions: ChatSessionItemWithProvider[] = [];
		const sessionsByResource = new ResourceSet();

		for (const sessionDetail of await this.chatService.getLiveSessionItems()) {
			const editorSession = this.toChatSessionItem(sessionDetail);
			if (!editorSession) {
				continue;
			}

			sessionsByResource.add(sessionDetail.sessionResource);
			sessions.push(editorSession);
		}

		if (!token.isCancellationRequested) {
			const history = await this.getHistoryItems();
			sessions.push(...history.filter(historyItem => !sessionsByResource.has(historyItem.resource)));
		}

		return sessions;
	}

	private async getHistoryItems(): Promise<ChatSessionItemWithProvider[]> {
		try {
			const historyItems = await this.chatService.getHistorySessionItems();
			return coalesce(historyItems.map(history => {
				const sessionItem = this.toChatSessionItem(history);
				return sessionItem ? {
					...sessionItem,
					//todo@bpasero remove this property once classic view is gone
					history: true
				} : undefined;
			}));
		} catch (error) {
			return [];
		}
	}

	private toChatSessionItem(chat: IChatDetail): ChatSessionItemWithProvider | undefined {
		const model = this.chatService.getSession(chat.sessionResource);

		let description: string | undefined;
		let startTime: number | undefined;
		let endTime: number | undefined;
		if (model) {
			if (!model.hasRequests) {
				return undefined; // ignore sessions without requests
			}

			const lastResponse = model.getRequests().at(-1)?.response;
			description = this.chatSessionsService.getSessionDescription(model);

			startTime = model.timestamp;
			if (lastResponse) {
				endTime = lastResponse.completedAt ?? lastResponse.timestamp;
			}
		} else {
			startTime = chat.lastMessageDate;
		}

		return {
			resource: chat.sessionResource,
			provider: this,
			label: chat.title,
			description,
			status: model ? this.modelToStatus(model) : undefined,
			iconPath: Codicon.chatSparkle,
			timing: {
				startTime,
				endTime
			},
			statistics: chat.stats ? {
				insertions: chat.stats.added,
				deletions: chat.stats.removed,
				files: chat.stats.fileCount
			} : undefined
		};
	}
}
