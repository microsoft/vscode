/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IChatAgentCommand, IChatAgentData } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatModelInitState, IChatModel, IChatRequestModel, IChatResponseModel, IChatWelcomeMessageContent, IResponse } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatContentReference, IChatProgressMessage, IChatReplyFollowup, IChatResponseCommandFollowup, IChatResponseErrorDetails, IChatResponseProgressFileTreeData, IChatUsedContext, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
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

export type IChatViewModelChangeEvent = IChatAddRequestEvent | IChangePlaceholderEvent | IChatSessionInitEvent | null;

export interface IChatAddRequestEvent {
	kind: 'addRequest';
}

export interface IChangePlaceholderEvent {
	kind: 'changePlaceholder';
}

export interface IChatSessionInitEvent {
	kind: 'initialize';
}

export interface IChatViewModel {
	readonly initState: ChatModelInitState;
	readonly providerId: string;
	readonly sessionId: string;
	readonly onDidDisposeModel: Event<void>;
	readonly onDidChange: Event<IChatViewModelChangeEvent>;
	readonly requestInProgress: boolean;
	readonly inputPlaceholder?: string;
	getItems(): (IChatRequestViewModel | IChatResponseViewModel | IChatWelcomeMessageViewModel)[];
	setInputPlaceholder(text: string): void;
	resetInputPlaceholder(): void;
}

export interface IChatRequestViewModel {
	readonly id: string;
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

export interface IChatProgressMessageRenderData {
	progressMessage: IChatProgressMessage;

	/**
	 * Indicates whether this is part of a group of progress messages that are at the end of the response.
	 * (Not whether this particular item is the very last one in the response).
	 * Need to re-render and add to partsToRender when this changes.
	 */
	isAtEndOfResponse: boolean;

	/**
	 * Whether this progress message the very last item in the response.
	 * Need to re-render to update spinner vs check when this changes.
	 */
	isLast: boolean;
}

export type IChatRenderData = IChatResponseProgressFileTreeData | IChatResponseMarkdownRenderData | IChatProgressMessageRenderData;
export interface IChatResponseRenderData {
	renderedParts: IChatRenderData[];
}

export interface IChatLiveUpdateData {
	loadingStartTime: number;
	lastUpdateTime: number;
	impliedWordLoadRate: number;
	lastWordCount: number;
}

export interface IChatResponseViewModel {
	readonly id: string;
	readonly sessionId: string;
	/** This ID updates every time the underlying data changes */
	readonly dataId: string;
	readonly providerId: string;
	/** The ID of the associated IChatRequestViewModel */
	readonly requestId: string;
	readonly username: string;
	readonly avatarIconUri?: URI;
	readonly agent?: IChatAgentData;
	readonly slashCommand?: IChatAgentCommand;
	readonly response: IResponse;
	readonly usedContext: IChatUsedContext | undefined;
	readonly contentReferences: ReadonlyArray<IChatContentReference>;
	readonly progressMessages: ReadonlyArray<IChatProgressMessage>;
	readonly isComplete: boolean;
	readonly isCanceled: boolean;
	readonly vote: InteractiveSessionVoteDirection | undefined;
	readonly replyFollowups?: IChatReplyFollowup[];
	readonly commandFollowups?: IChatResponseCommandFollowup[];
	readonly errorDetails?: IChatResponseErrorDetails;
	readonly contentUpdateTimings?: IChatLiveUpdateData;
	renderData?: IChatResponseRenderData;
	agentAvatarHasBeenRendered?: boolean;
	currentRenderedHeight: number | undefined;
	setVote(vote: InteractiveSessionVoteDirection): void;
	usedReferencesExpanded?: boolean;
	vulnerabilitiesListExpanded: boolean;
}

export class ChatViewModel extends Disposable implements IChatViewModel {
	private readonly _onDidDisposeModel = this._register(new Emitter<void>());
	readonly onDidDisposeModel = this._onDidDisposeModel.event;

	private readonly _onDidChange = this._register(new Emitter<IChatViewModelChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _items: (ChatRequestViewModel | ChatResponseViewModel)[] = [];

	private _inputPlaceholder: string | undefined = undefined;
	get inputPlaceholder(): string | undefined {
		return this._inputPlaceholder ?? this._model.inputPlaceholder;
	}

	setInputPlaceholder(text: string): void {
		this._inputPlaceholder = text;
		this._onDidChange.fire({ kind: 'changePlaceholder' });
	}

	resetInputPlaceholder(): void {
		this._inputPlaceholder = undefined;
		this._onDidChange.fire({ kind: 'changePlaceholder' });
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

	get initState() {
		return this._model.initState;
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
				const requestIdx = this._items.findIndex(item => isRequestVM(item) && item.id === e.requestId);
				if (requestIdx >= 0) {
					this._items.splice(requestIdx, 1);
				}

				const responseIdx = e.responseId && this._items.findIndex(item => isResponseVM(item) && item.id === e.responseId);
				if (typeof responseIdx === 'number' && responseIdx >= 0) {
					const items = this._items.splice(responseIdx, 1);
					const item = items[0];
					if (isResponseVM(item)) {
						item.dispose();
					}
				}
			}

			const modelEventToVmEvent: IChatViewModelChangeEvent = e.kind === 'addRequest' ? { kind: 'addRequest' } :
				e.kind === 'initialize' ? { kind: 'initialize' } :
					null;
			this._onDidChange.fire(modelEventToVmEvent);
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

	get dataId() {
		return this.id + `_${ChatModelInitState[this._model.session.initState]}`;
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
		return this._model.id + `_${this._modelChangeCount}` + `_${ChatModelInitState[this._model.session.initState]}`;
	}

	get providerId() {
		return this._model.providerId;
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

	get agent() {
		return this._model.agent;
	}

	get slashCommand() {
		return this._model.slashCommand;
	}

	get response(): IResponse {
		return this._model.response;
	}

	get usedContext(): IChatUsedContext | undefined {
		return this._model.usedContext;
	}

	get contentReferences(): ReadonlyArray<IChatContentReference> {
		return this._model.contentReferences;
	}

	get progressMessages(): ReadonlyArray<IChatProgressMessage> {
		return this._model.progressMessages;
	}

	get isComplete() {
		return this._model.isComplete;
	}

	get isCanceled() {
		return this._model.isCanceled;
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

	get requestId() {
		return this._model.requestId;
	}

	renderData: IChatResponseRenderData | undefined = undefined;
	agentAvatarHasBeenRendered?: boolean;
	currentRenderedHeight: number | undefined;

	private _usedReferencesExpanded: boolean | undefined;
	get usedReferencesExpanded(): boolean | undefined {
		if (typeof this._usedReferencesExpanded === 'boolean') {
			return this._usedReferencesExpanded;
		}

		return this.response.value.length === 0;
	}

	set usedReferencesExpanded(v: boolean) {
		this._usedReferencesExpanded = v;
	}

	private _vulnerabilitiesListExpanded: boolean = false;
	get vulnerabilitiesListExpanded(): boolean {
		return this._vulnerabilitiesListExpanded;
	}

	set vulnerabilitiesListExpanded(v: boolean) {
		this._vulnerabilitiesListExpanded = v;
	}

	private _contentUpdateTimings: IChatLiveUpdateData | undefined = undefined;
	get contentUpdateTimings(): IChatLiveUpdateData | undefined {
		return this._contentUpdateTimings;
	}

	constructor(
		private readonly _model: IChatResponseModel,
		@ILogService private readonly logService: ILogService
	) {
		super();

		if (!_model.isComplete) {
			this._contentUpdateTimings = {
				loadingStartTime: Date.now(),
				lastUpdateTime: Date.now(),
				impliedWordLoadRate: 0,
				lastWordCount: 0
			};
		}

		this._register(_model.onDidChange(() => {
			if (this._contentUpdateTimings) {
				// This should be true, if the model is changing
				const now = Date.now();
				const wordCount = countWords(_model.response.asString());
				const timeDiff = now - this._contentUpdateTimings!.loadingStartTime;
				const impliedWordLoadRate = this._contentUpdateTimings.lastWordCount / (timeDiff / 1000);
				this.trace('onDidChange', `Update- got ${this._contentUpdateTimings.lastWordCount} words over ${timeDiff}ms = ${impliedWordLoadRate} words/s. ${wordCount} words are now available.`);
				this._contentUpdateTimings = {
					loadingStartTime: this._contentUpdateTimings!.loadingStartTime,
					lastUpdateTime: now,
					impliedWordLoadRate,
					lastWordCount: wordCount
				};
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
	readonly sampleQuestions: IChatReplyFollowup[];
	currentRenderedHeight?: number;
}
