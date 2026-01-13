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
import { IChatModel } from '../../common/model/chatModel.js';
import { IChatDetail, IChatService, ResponseModelState } from '../../common/chatService/chatService.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemProvider, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';

interface IChatSessionItemWithProvider extends IChatSessionItem {
	readonly provider: IChatSessionItemProvider;
}

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

		this._register(this.chatSessionsService.onDidChangeSessionItems(sessionType => {
			if (sessionType === this.chatSessionType) {
				this._onDidChange.fire();
			}
		}));

		this._register(this.chatService.onDidDisposeSession(e => {
			const session = e.sessionResource.filter(resource => getChatSessionType(resource) === this.chatSessionType);
			if (session.length > 0) {
				this._onDidChangeChatSessionItems.fire();
			}
		}));
	}

	async provideChatSessionItems(token: CancellationToken): Promise<IChatSessionItem[]> {
		const sessions: IChatSessionItemWithProvider[] = [];
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

	private async getHistoryItems(): Promise<IChatSessionItemWithProvider[]> {
		try {
			const historyItems = await this.chatService.getHistorySessionItems();

			return coalesce(historyItems.map(history => this.toChatSessionItem(history)));
		} catch (error) {
			return [];
		}
	}

	private toChatSessionItem(chat: IChatDetail): IChatSessionItemWithProvider | undefined {
		const model = this.chatService.getSession(chat.sessionResource);

		let description: string | undefined;
		if (model) {
			if (!model.hasRequests) {
				return undefined; // ignore sessions without requests
			}

			description = this.chatSessionsService.getInProgressSessionDescription(model);
		}

		return {
			resource: chat.sessionResource,
			provider: this,
			label: chat.title,
			description,
			status: model ? this.modelToStatus(model) : this.chatResponseStateToStatus(chat.lastResponseState),
			iconPath: Codicon.chatSparkle,
			timing: chat.timing,
			changes: chat.stats ? {
				insertions: chat.stats.added,
				deletions: chat.stats.removed,
				files: chat.stats.fileCount,
			} : undefined
		};
	}

	private modelToStatus(model: IChatModel): ChatSessionStatus | undefined {
		if (model.requestInProgress.get()) {
			return ChatSessionStatus.InProgress;
		}

		const lastRequest = model.getRequests().at(-1);
		if (lastRequest?.response) {
			if (lastRequest.response.state === ResponseModelState.NeedsInput) {
				return ChatSessionStatus.NeedsInput;
			} else if (lastRequest.response.isCanceled || lastRequest.response.result?.errorDetails?.code === 'canceled') {
				return ChatSessionStatus.Completed;
			} else if (lastRequest.response.result?.errorDetails) {
				return ChatSessionStatus.Failed;
			} else if (lastRequest.response.isComplete) {
				return ChatSessionStatus.Completed;
			} else {
				return ChatSessionStatus.InProgress;
			}
		}

		return undefined;
	}

	private chatResponseStateToStatus(state: ResponseModelState): ChatSessionStatus {
		switch (state) {
			case ResponseModelState.Cancelled:
			case ResponseModelState.Complete:
				return ChatSessionStatus.Completed;
			case ResponseModelState.Failed:
				return ChatSessionStatus.Failed;
			case ResponseModelState.Pending:
				return ChatSessionStatus.InProgress;
			case ResponseModelState.NeedsInput:
				return ChatSessionStatus.NeedsInput;
		}
	}
}
