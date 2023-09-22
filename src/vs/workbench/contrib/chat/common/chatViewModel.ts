/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IChatModel, IChatRequestModel, IChatResponseModel, IChatWelcomeMessageContent, IResponse, Response } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatReplyFollowup, IChatResponseCommandFollowup, IChatResponseErrorDetails, IChatResponseProgressFileTreeData, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { countWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';

export function isRequestVM(item: unknown): item is IChatRequestViewModel {
	return !!item && typeof item === 'object' && 'message' in item;
}

export function isResponseVM(item: unknown): item is IChatResponseViewModel {
	return !!item && typeof (item as IChatResponseViewModel).setVote !== 'undefined';
}

export function isWelcomeVM(item: unknown): item is IChatWelcomeMessageViewModel {
	return !!item && typeof item === 'object' && 'content' in item;
}

export type IChatViewModelChangeEvent = IChatAddRequestEvent | null;

export interface IChatAddRequestEvent {
	kind: 'addRequest';
}

export interface IChatViewModel {
	readonly isInitialized: boolean;
	readonly providerId: string;
	readonly sessionId: string;
	readonly onDidDisposeModel: Event<void>;
	readonly onDidChange: Event<IChatViewModelChangeEvent>;
	readonly requestInProgress: boolean;
	readonly inputPlaceholder?: string;
	getItems(): (IChatRequestViewModel | IChatResponseViewModel | IChatWelcomeMessageViewModel)[];
}

export interface IChatRequestViewModel {
	readonly id: string;
	readonly providerRequestId: string | undefined;
	readonly sessionId: string;
	/** This ID updates every time the underlying data changes */
	readonly dataId: string;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly message: IParsedChatRequest | IChatReplyFollowup;
	readonly messageText: string;
	currentRenderedHeight: number | undefined;
}

export interface IChatResponseMarkdownRenderData {
	renderedWordCount: number;
	lastRenderTime: number;
	isFullyRendered: boolean;
}

export interface IChatResponseRenderData {
	renderedParts: (IChatResponseProgressFileTreeData | IChatResponseMarkdownRenderData)[];
}

export interface IChatLiveUpdateData {
	wordCountAfterLastUpdate: number;
	loadingStartTime: number;
	lastUpdateTime: number;
	impliedWordLoadRate: number;
}

export interface IChatResponseViewModel {
	readonly id: string;
	readonly sessionId: string;
	/** This ID updates every time the underlying data changes */
	readonly dataId: string;
	readonly providerId: string;
	readonly providerResponseId: string | undefined;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly response: IResponse;
	readonly isComplete: boolean;
	readonly isCanceled: boolean;
	readonly isPlaceholder: boolean;
	readonly vote: InteractiveSessionVoteDirection | undefined;
	readonly replyFollowups?: IChatReplyFollowup[];
	readonly commandFollowups?: IChatResponseCommandFollowup[];
	readonly errorDetails?: IChatResponseErrorDetails;
	readonly contentUpdateTimings?: IChatLiveUpdateData;
	renderData?: IChatResponseRenderData;
	currentRenderedHeight: number | undefined;
	setVote(vote: InteractiveSessionVoteDirection): void;
}

export class ChatViewModel extends Disposable implements IChatViewModel {
	private readonly _onDidDisposeModel = this._register(new Emitter<void>());
	readonly onDidDisposeModel = this._onDidDisposeModel.event;

	private readonly _onDidChange = this._register(new Emitter<IChatViewModelChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _items: (ChatRequestViewModel | ChatResponseViewModel)[] = [];

	get inputPlaceholder(): string | undefined {
		return this._model.inputPlaceholder;
	}

	get sessionId() {
		return this._model.sessionId;
	}

	get requestInProgress(): boolean {
		return this._model.requestInProgress;
	}

	get providerId() {
		return this._model.providerId;
	}

	get isInitialized() {
		return this._model.isInitialized;
	}

	constructor(
		private readonly _model: IChatModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		_model.getRequests().forEach((request, i) => {
			this._items.push(new ChatRequestViewModel(request));
			if (request.response) {
				this.onAddResponse(request.response);
			}
		});

		this._register(_model.onDidDispose(() => this._onDidDisposeModel.fire()));
		this._register(_model.onDidChange(e => {
			if (e.kind === 'addRequest') {
				this._items.push(new ChatRequestViewModel(e.request));
				if (e.request.response) {
					this.onAddResponse(e.request.response);
				}
			} else if (e.kind === 'addResponse') {
				this.onAddResponse(e.response);
			} else if (e.kind === 'removeRequest') {
				const requestIdx = this._items.findIndex(item => isRequestVM(item) && item.providerRequestId === e.requestId);
				if (requestIdx >= 0) {
					this._items.splice(requestIdx, 1);
				}

				const responseIdx = e.responseId && this._items.findIndex(item => isResponseVM(item) && item.providerResponseId === e.responseId);
				if (typeof responseIdx === 'number' && responseIdx >= 0) {
					const items = this._items.splice(responseIdx, 1);
					const item = items[0];
					if (isResponseVM(item)) {
						item.dispose();
					}
				}
			}

			this._onDidChange.fire(e.kind === 'addRequest' ? { kind: 'addRequest' } : null);
		}));
	}

	private onAddResponse(responseModel: IChatResponseModel) {
		const response = this.instantiationService.createInstance(ChatResponseViewModel, responseModel);
		this._register(response.onDidChange(() => this._onDidChange.fire(null)));
		this._items.push(response);
	}

	getItems(): (IChatRequestViewModel | IChatResponseViewModel | IChatWelcomeMessageViewModel)[] {
		return [...(this._model.welcomeMessage ? [this._model.welcomeMessage] : []), ...this._items];
	}

	override dispose() {
		super.dispose();
		this._items
			.filter((item): item is ChatResponseViewModel => item instanceof ChatResponseViewModel)
			.forEach((item: ChatResponseViewModel) => item.dispose());
	}
}

export class ChatRequestViewModel implements IChatRequestViewModel {
	get id() {
		return this._model.id;
	}

	get providerRequestId() {
		return this._model.providerRequestId;
	}

	get dataId() {
		return this.id + (this._model.session.isInitialized ? '' : '_initializing');
	}

	get sessionId() {
		return this._model.session.sessionId;
	}

	get username() {
		return this._model.username;
	}

	get avatarIconUri() {
		return this._model.avatarIconUri;
	}

	get message() {
		return this._model.message;
	}

	get messageText() {
		return 'kind' in this.message ? this.message.message : this.message.text;
	}

	currentRenderedHeight: number | undefined;

	constructor(readonly _model: IChatRequestModel) { }
}

export class ChatResponseViewModel extends Disposable implements IChatResponseViewModel {
	private _modelChangeCount = 0;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	get id() {
		return this._model.id;
	}

	get dataId() {
		return this._model.id + `_${this._modelChangeCount}` + (this._model.session.isInitialized ? '' : '_initializing');
	}

	get providerId() {
		return this._model.providerId;
	}

	get providerResponseId() {
		return this._model.providerResponseId;
	}

	get sessionId() {
		return this._model.session.sessionId;
	}

	get username() {
		return this._model.username;
	}

	get avatarIconUri() {
		return this._model.avatarIconUri;
	}

	get response(): IResponse {
		if (this._isPlaceholder) {
			return new Response(new MarkdownString(localize('thinking', "Thinking") + '\u2026'));
		}

		return this._model.response;
	}

	get isComplete() {
		return this._model.isComplete;
	}

	get isCanceled() {
		return this._model.isCanceled;
	}

	private _isPlaceholder = false;
	get isPlaceholder() {
		return this._isPlaceholder;
	}

	get replyFollowups() {
		return this._model.followups?.filter((f): f is IChatReplyFollowup => f.kind === 'reply');
	}

	get commandFollowups() {
		return this._model.followups?.filter((f): f is IChatResponseCommandFollowup => f.kind === 'command');
	}

	get errorDetails() {
		return this._model.errorDetails;
	}

	get vote() {
		return this._model.vote;
	}

	renderData: IChatResponseRenderData | undefined = undefined;

	currentRenderedHeight: number | undefined;

	private _contentUpdateTimings: IChatLiveUpdateData | undefined = undefined;
	get contentUpdateTimings(): IChatLiveUpdateData | undefined {
		return this._contentUpdateTimings;
	}

	constructor(
		private readonly _model: IChatResponseModel,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._isPlaceholder = !_model.response.asString() && !_model.isComplete;

		if (!_model.isComplete) {
			this._contentUpdateTimings = {
				loadingStartTime: Date.now(),
				lastUpdateTime: Date.now(),
				wordCountAfterLastUpdate: this._isPlaceholder ? 0 : countWords(_model.response.asString()), // don't count placeholder text
				impliedWordLoadRate: 0
			};
		}

		this._register(_model.onDidChange(() => {
			if (this._isPlaceholder && (_model.response.value || this.isComplete)) {
				this._isPlaceholder = false;
			}

			if (this._contentUpdateTimings) {
				// This should be true, if the model is changing
				const now = Date.now();
				const wordCount = countWords(_model.response.asString());
				const timeDiff = now - this._contentUpdateTimings!.loadingStartTime;
				const impliedWordLoadRate = wordCount / (timeDiff / 1000);
				const renderedWordCount = this.renderData?.renderedParts.reduce((acc, part) => acc += ('label' in part ? 0 : part.renderedWordCount), 0);
				if (!this.isComplete) {
					this.trace('onDidChange', `Update- got ${wordCount} words over ${timeDiff}ms = ${impliedWordLoadRate} words/s. ${renderedWordCount} words are rendered.`);
					this._contentUpdateTimings = {
						loadingStartTime: this._contentUpdateTimings!.loadingStartTime,
						lastUpdateTime: now,
						wordCountAfterLastUpdate: wordCount,
						impliedWordLoadRate
					};
				} else {
					this.trace(`onDidChange`, `Done- got ${wordCount} words over ${timeDiff}ms = ${impliedWordLoadRate} words/s. ${renderedWordCount} words are rendered.`);
				}
			} else {
				this.logService.warn('ChatResponseViewModel#onDidChange: got model update but contentUpdateTimings is not initialized');
			}

			// new data -> new id, new content to render
			this._modelChangeCount++;

			this._onDidChange.fire();
		}));
	}

	private trace(tag: string, message: string) {
		this.logService.trace(`ChatResponseViewModel#${tag}: ${message}`);
	}

	setVote(vote: InteractiveSessionVoteDirection): void {
		this._modelChangeCount++;
		this._model.setVote(vote);
	}
}

export interface IChatWelcomeMessageViewModel {
	readonly id: string;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly content: IChatWelcomeMessageContent[];
	currentRenderedHeight?: number;
}
