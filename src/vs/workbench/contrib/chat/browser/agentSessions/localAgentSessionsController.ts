/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableResourceMap } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { equals } from '../../../../../base/common/objects.js';
import { autorun, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { convertLegacyChatSessionTiming, IChatDetail, IChatService, IChatSessionTiming } from '../../common/chatService/chatService.js';
import { chatModelToChatDetail } from '../../common/chatService/chatServiceImpl.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemController, IChatSessionItemsDelta, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { getInProgressSessionDescription } from '../chatSessions/chatSessionDescription.js';
import { chatResponseStateToSessionStatus, getSessionStatusForModel } from '../chatSessions/chatSessions.contribution.js';

export class LocalAgentsSessionsController extends Disposable implements IChatSessionItemController, IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.localAgentsSessionsController';

	readonly chatSessionType = localChatSessionType;

	readonly _onDidChangeChatSessionItems = this._register(new Emitter<IChatSessionItemsDelta>());
	readonly onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;

	private readonly _modelListeners = this._register(new DisposableResourceMap());

	private _isDisposed = false;

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		this._register(this.chatSessionsService.registerChatSessionItemController(this.chatSessionType, this));

		this.registerListeners();
	}

	override dispose(): void {
		this._isDisposed = true;
		super.dispose();
	}

	private _items = new ResourceMap<LocalChatSessionItem>();
	get items(): readonly IChatSessionItem[] {
		return Array.from(this._items.values());
	}

	async refresh(token: CancellationToken): Promise<void> {
		const newItems = await this.provideChatSessionItems(token);

		this._items.clear();
		for (const item of newItems) {
			this._items.set(item.resource, item);
		}
	}

	private registerListeners(): void {
		const addModelListeners = async (model: IChatModel) => {
			if (getChatSessionType(model.sessionResource) !== this.chatSessionType) {
				return;
			}

			await this.refresh(CancellationToken.None);
			if (this._isDisposed) {
				return;
			}

			this.tryUpdateLiveSessionItem(model);

			const requestChangeListener = model.lastRequestObs.map(last => last?.response && observableSignalFromEvent('chatSessions.modelRequestChangeListener', last.response.onDidChange));
			const modelChangeListener = observableSignalFromEvent('chatSessions.modelChangeListener', model.onDidChange);
			this._modelListeners.set(model.sessionResource, autorun(reader => {
				requestChangeListener.read(reader)?.read(reader);
				modelChangeListener.read(reader);

				this.tryUpdateLiveSessionItem(model);
			}));
		};

		this._register(this.chatService.onDidCreateModel(model => addModelListeners(model)));
		for (const model of this.chatService.chatModels.get()) {
			addModelListeners(model);
		}

		this._register(this.chatService.onDidDisposeSession(e => {
			for (const sessionResource of e.sessionResources) {
				this._modelListeners.deleteAndDispose(sessionResource);
			}

			const removedSessionResources = e.sessionResources.filter(resource => getChatSessionType(resource) === this.chatSessionType);
			if (removedSessionResources.length) {
				this._onDidChangeChatSessionItems.fire({ removed: removedSessionResources });
			}
		}));
	}

	private async tryUpdateLiveSessionItem(model: IChatModel): Promise<void> {
		const existing = this._items.get(model.sessionResource);
		if (!existing) {
			return;
		}

		const updated = new LocalChatSessionItem(await chatModelToChatDetail(model), model);
		if (existing.isEqual(updated)) {
			return;
		}

		this._items.set(existing.resource, updated);
		this._onDidChangeChatSessionItems.fire({ addedOrUpdated: [updated] });
	}

	private async provideChatSessionItems(token: CancellationToken): Promise<LocalChatSessionItem[]> {
		const sessions: LocalChatSessionItem[] = [];
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

	private async getHistoryItems(): Promise<LocalChatSessionItem[]> {
		try {
			const historyItems = await this.chatService.getHistorySessionItems();

			return coalesce(historyItems.map(history => this.toChatSessionItem(history)));
		} catch (error) {
			return [];
		}
	}

	private toChatSessionItem(chat: IChatDetail): LocalChatSessionItem | undefined {
		const model = this.chatService.getSession(chat.sessionResource);

		if (model) {
			if (!model.hasRequests) {
				return undefined; // ignore sessions without requests
			}
		} else if (chat.isActive) {
			// Sessions that are active but don't have a chat model are ultimately untitled with no requests
			return undefined;
		}

		return new LocalChatSessionItem(chat, model);
	}
}

class LocalChatSessionItem implements IChatSessionItem {
	readonly resource: URI;
	readonly iconPath = Codicon.chatSparkle;

	readonly label: string;
	readonly description: string | undefined;
	readonly status: ChatSessionStatus | undefined;
	readonly timing: IChatSessionTiming;
	readonly changes: IChatSessionItem['changes'];

	constructor(chatDetail: IChatDetail, model: IChatModel | undefined) {
		this.resource = chatDetail.sessionResource;
		this.label = chatDetail.title;
		this.description = model ? getInProgressSessionDescription(model) : undefined;
		this.status = (model && getSessionStatusForModel(model)) ?? chatResponseStateToSessionStatus(chatDetail.lastResponseState);
		this.timing = convertLegacyChatSessionTiming(chatDetail.timing);
		this.changes = chatDetail.stats ? {
			insertions: chatDetail.stats.added,
			deletions: chatDetail.stats.removed,
			files: chatDetail.stats.fileCount,
		} : undefined;
	}

	isEqual(other: LocalChatSessionItem): boolean {
		return isEqual(this.resource, other.resource)
			&& this.label === other.label
			&& this.description === other.description
			&& this.status === other.status
			&& this.timing.created === other.timing.created
			&& this.timing.lastRequestStarted === other.timing.lastRequestStarted
			&& this.timing.lastRequestEnded === other.timing.lastRequestEnded
			&& equals(this.changes, other.changes);
	}
}
