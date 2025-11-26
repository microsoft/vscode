/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { autorun } from '../../../../../base/common/observable.js';
import { truncate } from '../../../../../base/common/strings.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ModifiedFileEntryState } from '../../common/chatEditingService.js';
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

	private readonly modelListeners = this._register(new DisposableMap<string>());

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		this._register(this.chatSessionsService.registerChatSessionItemProvider(this));

		this.registerListeners();
	}

	private registerListeners(): void {

		// Listen for models being added or removed
		this._register(autorun(reader => {
			const models = this.chatService.chatModels.read(reader);
			this.registerModelListeners(models);
		}));

		// Listen for global session items changes for our session type
		this._register(this.chatSessionsService.onDidChangeSessionItems(sessionType => {
			if (sessionType === this.chatSessionType) {
				this._onDidChange.fire();
			}
		}));
	}

	private registerModelListeners(models: Iterable<IChatModel>): void {
		const seenKeys = new Set<string>();

		for (const model of models) {
			const key = model.sessionResource.toString();
			seenKeys.add(key);

			if (!this.modelListeners.has(key)) {
				this.modelListeners.set(key, this.registerSingleModelListeners(model));
			}
		}

		// Clean up listeners for models that no longer exist
		for (const key of this.modelListeners.keys()) {
			if (!seenKeys.has(key)) {
				this.modelListeners.deleteAndDispose(key);
			}
		}

		this._onDidChange.fire();
	}

	private registerSingleModelListeners(model: IChatModel): IDisposable {
		const store = new DisposableStore();

		this.chatSessionsService.registerModelProgressListener(model, () => {
			this._onDidChangeChatSessionItems.fire();
		});

		store.add(model.onDidChange(e => {
			if (!e || e.kind === 'setCustomTitle') {
				this._onDidChange.fire();
			}
		}));

		return store;
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

		for (const sessionDetail of this.chatService.getLiveSessionItems()) {
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
			return coalesce(historyItems.map(history => this.toChatSessionItem(history)));
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
			if (!description) {
				const responseValue = lastResponse?.response.toString();
				if (responseValue) {
					description = truncate(responseValue.replace(/\r?\n/g, ' '), 100);
				}
			}

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
			statistics: model ? this.getSessionStatistics(model) : undefined
		};
	}

	private getSessionStatistics(chatModel: IChatModel) {
		let linesAdded = 0;
		let linesRemoved = 0;
		const files = new ResourceSet();

		const currentEdits = chatModel.editingSession?.entries.get();
		if (currentEdits) {
			const uncommittedEdits = currentEdits.filter(edit => edit.state.get() === ModifiedFileEntryState.Modified);
			for (const edit of uncommittedEdits) {
				linesAdded += edit.linesAdded?.get() ?? 0;
				linesRemoved += edit.linesRemoved?.get() ?? 0;
				files.add(edit.modifiedURI);
			}
		}

		if (files.size === 0) {
			return undefined;
		}

		return {
			files: files.size,
			insertions: linesAdded,
			deletions: linesRemoved,
		};
	}
}
