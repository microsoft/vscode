/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { hash } from '../../../../base/common/hash.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, dispose } from '../../../../base/common/lifecycle.js';
import * as marked from '../../../../base/common/marked/marked.js';
import { IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { annotateVulnerabilitiesInText } from './annotations.js';
import { getFullyQualifiedId, IChatAgentCommand, IChatAgentData, IChatAgentNameService, IChatAgentResult } from './chatAgents.js';
import { ChatModelInitState, ChatPauseState, IChatModel, IChatProgressRenderableResponseContent, IChatRequestDisablement, IChatRequestModel, IChatRequestVariableEntry, IChatResponseModel, IChatTextEditGroup, IResponse } from './chatModel.js';
import { IParsedChatRequest } from './chatParserTypes.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, IChatCodeCitation, IChatContentReference, IChatFollowup, IChatProgressMessage, IChatResponseErrorDetails, IChatTask, IChatUsedContext } from './chatService.js';
import { countWords } from './chatWordCounter.js';
import { CodeBlockModelCollection } from './codeBlockModelCollection.js';

export function isRequestVM(item: unknown): item is IChatRequestViewModel {
	return !!item && typeof item === 'object' && 'message' in item;
}

export function isResponseVM(item: unknown): item is IChatResponseViewModel {
	return !!item && typeof (item as IChatResponseViewModel).setVote !== 'undefined';
}

export type IChatViewModelChangeEvent = IChatAddRequestEvent | IChangePlaceholderEvent | IChatSessionInitEvent | IChatSetHiddenEvent | null;

export interface IChatAddRequestEvent {
	kind: 'addRequest';
}

export interface IChangePlaceholderEvent {
	kind: 'changePlaceholder';
}

export interface IChatSessionInitEvent {
	kind: 'initialize';
}

export interface IChatSetHiddenEvent {
	kind: 'setHidden';
}

export interface IChatViewModel {
	readonly model: IChatModel;
	readonly initState: ChatModelInitState;
	readonly sessionId: string;
	readonly onDidDisposeModel: Event<void>;
	readonly onDidChange: Event<IChatViewModelChangeEvent>;
	readonly requestInProgress: boolean;
	readonly requestPausibility: ChatPauseState;
	readonly inputPlaceholder?: string;
	getItems(): (IChatRequestViewModel | IChatResponseViewModel)[];
	setInputPlaceholder(text: string): void;
	resetInputPlaceholder(): void;
}

export interface IChatRequestViewModel {
	readonly id: string;
	readonly sessionId: string;
	/** This ID updates every time the underlying data changes */
	readonly dataId: string;
	readonly username: string;
	readonly avatarIcon?: URI | ThemeIcon;
	readonly message: IParsedChatRequest | IChatFollowup;
	readonly messageText: string;
	readonly attempt: number;
	readonly variables: IChatRequestVariableEntry[];
	currentRenderedHeight: number | undefined;
	readonly contentReferences?: ReadonlyArray<IChatContentReference>;
	readonly confirmation?: string;
	readonly shouldBeRemovedOnSend: IChatRequestDisablement | undefined;
	readonly isComplete: boolean;
	readonly isCompleteAddedRequest: boolean;
	readonly slashCommand: IChatAgentCommand | undefined;
	readonly agentOrSlashCommandDetected: boolean;
}

export interface IChatResponseMarkdownRenderData {
	renderedWordCount: number;
	lastRenderTime: number;
	isFullyRendered: boolean;
	originalMarkdown: IMarkdownString;
}

export interface IChatResponseMarkdownRenderData2 {
	renderedWordCount: number;
	lastRenderTime: number;
	isFullyRendered: boolean;
	originalMarkdown: IMarkdownString;
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

export interface IChatTaskRenderData {
	task: IChatTask;
	isSettled: boolean;
	progressLength: number;
}

export interface IChatResponseRenderData {
	renderedParts: IChatRendererContent[];

	renderedWordCount: number;
	lastRenderTime: number;
}

/**
 * Content type for references used during rendering, not in the model
 */
export interface IChatReferences {
	references: ReadonlyArray<IChatContentReference>;
	kind: 'references';
}

export interface IChatWorkingProgress {
	kind: 'working';
	isPaused: boolean;
}

/**
 * Content type for citations used during rendering, not in the model
 */
export interface IChatCodeCitations {
	citations: ReadonlyArray<IChatCodeCitation>;
	kind: 'codeCitations';
}

/**
 * Type for content parts rendered by IChatListRenderer
 */
export type IChatRendererContent = IChatProgressRenderableResponseContent | IChatReferences | IChatCodeCitations | IChatWorkingProgress;

export interface IChatLiveUpdateData {
	totalTime: number;
	lastUpdateTime: number;
	impliedWordLoadRate: number;
	lastWordCount: number;
}

export interface IChatResponseViewModel {
	readonly model: IChatResponseModel;
	readonly id: string;
	readonly sessionId: string;
	/** This ID updates every time the underlying data changes */
	readonly dataId: string;
	/** The ID of the associated IChatRequestViewModel */
	readonly requestId: string;
	readonly username: string;
	readonly avatarIcon?: URI | ThemeIcon;
	readonly agent?: IChatAgentData;
	readonly slashCommand?: IChatAgentCommand;
	readonly agentOrSlashCommandDetected: boolean;
	readonly response: IResponse;
	readonly usedContext: IChatUsedContext | undefined;
	readonly contentReferences: ReadonlyArray<IChatContentReference>;
	readonly codeCitations: ReadonlyArray<IChatCodeCitation>;
	readonly progressMessages: ReadonlyArray<IChatProgressMessage>;
	readonly isComplete: boolean;
	readonly isCanceled: boolean;
	readonly isStale: boolean;
	readonly vote: ChatAgentVoteDirection | undefined;
	readonly voteDownReason: ChatAgentVoteDownReason | undefined;
	readonly replyFollowups?: IChatFollowup[];
	readonly errorDetails?: IChatResponseErrorDetails;
	readonly result?: IChatAgentResult;
	readonly contentUpdateTimings?: IChatLiveUpdateData;
	readonly shouldBeRemovedOnSend: IChatRequestDisablement | undefined;
	readonly isCompleteAddedRequest: boolean;
	readonly isPaused: IObservable<boolean>;
	renderData?: IChatResponseRenderData;
	currentRenderedHeight: number | undefined;
	setVote(vote: ChatAgentVoteDirection): void;
	setVoteDownReason(reason: ChatAgentVoteDownReason | undefined): void;
	usedReferencesExpanded?: boolean;
	vulnerabilitiesListExpanded: boolean;
	setEditApplied(edit: IChatTextEditGroup, editCount: number): void;
}

export class ChatViewModel extends Disposable implements IChatViewModel {

	private readonly _onDidDisposeModel = this._register(new Emitter<void>());
	readonly onDidDisposeModel = this._onDidDisposeModel.event;

	private readonly _onDidChange = this._register(new Emitter<IChatViewModelChangeEvent>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _items: (ChatRequestViewModel | ChatResponseViewModel)[] = [];

	private _inputPlaceholder: string | undefined = undefined;
	get inputPlaceholder(): string | undefined {
		return this._inputPlaceholder;
	}

	get model(): IChatModel {
		return this._model;
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

	get requestPausibility(): ChatPauseState {
		return this._model.requestPausibility;
	}

	get initState() {
		return this._model.initState;
	}

	constructor(
		private readonly _model: IChatModel,
		public readonly codeBlockModelCollection: CodeBlockModelCollection,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		_model.getRequests().forEach((request, i) => {
			const requestModel = this.instantiationService.createInstance(ChatRequestViewModel, request);
			this._items.push(requestModel);
			this.updateCodeBlockTextModels(requestModel);

			if (request.response) {
				this.onAddResponse(request.response);
			}
		});

		this._register(_model.onDidDispose(() => this._onDidDisposeModel.fire()));
		this._register(_model.onDidChange(e => {
			if (e.kind === 'addRequest') {
				const requestModel = this.instantiationService.createInstance(ChatRequestViewModel, e.request);
				this._items.push(requestModel);
				this.updateCodeBlockTextModels(requestModel);

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
					if (item instanceof ChatResponseViewModel) {
						item.dispose();
					}
				}
			}

			const modelEventToVmEvent: IChatViewModelChangeEvent =
				e.kind === 'addRequest' ? { kind: 'addRequest' }
					: e.kind === 'initialize' ? { kind: 'initialize' }
						: e.kind === 'setHidden' ? { kind: 'setHidden' }
							: null;
			this._onDidChange.fire(modelEventToVmEvent);
		}));
	}

	private onAddResponse(responseModel: IChatResponseModel) {
		const response = this.instantiationService.createInstance(ChatResponseViewModel, responseModel, this);
		this._register(response.onDidChange(() => {
			if (response.isComplete) {
				this.updateCodeBlockTextModels(response);
			}
			return this._onDidChange.fire(null);
		}));
		this._items.push(response);
		this.updateCodeBlockTextModels(response);
	}

	getItems(): (IChatRequestViewModel | IChatResponseViewModel)[] {
		return this._items.filter((item) => !item.shouldBeRemovedOnSend || item.shouldBeRemovedOnSend.afterUndoStop);
	}

	override dispose() {
		super.dispose();
		dispose(this._items.filter((item): item is ChatResponseViewModel => item instanceof ChatResponseViewModel));
	}

	updateCodeBlockTextModels(model: IChatRequestViewModel | IChatResponseViewModel) {
		let content: string;
		if (isRequestVM(model)) {
			content = model.messageText;
		} else {
			content = annotateVulnerabilitiesInText(model.response.value).map(x => x.content.value).join('');
		}

		let codeBlockIndex = 0;
		marked.walkTokens(marked.lexer(content), token => {
			if (token.type === 'code') {
				const lang = token.lang || '';
				const text = token.text;
				this.codeBlockModelCollection.update(this._model.sessionId, model, codeBlockIndex++, { text, languageId: lang, isComplete: true });
			}
		});
	}
}

export class ChatRequestViewModel implements IChatRequestViewModel {
	get id() {
		return this._model.id;
	}

	get dataId() {
		return this.id + `_${ChatModelInitState[this._model.session.initState]}_${hash(this.variables)}_${hash(this.isComplete)}`;
	}

	get sessionId() {
		return this._model.session.sessionId;
	}

	get username() {
		return this._model.username;
	}

	get avatarIcon() {
		return this._model.avatarIconUri;
	}

	get message() {
		return this._model.message;
	}

	get messageText() {
		return this.message.text;
	}

	get attempt() {
		return this._model.attempt;
	}

	get variables() {
		return this._model.variableData.variables;
	}

	get contentReferences() {
		return this._model.response?.contentReferences;
	}

	get confirmation() {
		return this._model.confirmation;
	}

	get isComplete() {
		return this._model.response?.isComplete ?? false;
	}

	get isCompleteAddedRequest() {
		return this._model.isCompleteAddedRequest;
	}

	get shouldBeRemovedOnSend() {
		return this._model.shouldBeRemovedOnSend;
	}

	get slashCommand(): IChatAgentCommand | undefined {
		return this._model.response?.slashCommand;
	}

	get agentOrSlashCommandDetected(): boolean {
		return this._model.response?.agentOrSlashCommandDetected ?? false;
	}

	currentRenderedHeight: number | undefined;

	constructor(
		private readonly _model: IChatRequestModel,
	) { }
}

export class ChatResponseViewModel extends Disposable implements IChatResponseViewModel {
	private _modelChangeCount = 0;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	get model() {
		return this._model;
	}

	get id() {
		return this._model.id;
	}

	get dataId() {
		return this._model.id +
			`_${this._modelChangeCount}` +
			`_${ChatModelInitState[this._model.session.initState]}` +
			(this.isLast ? '_last' : '');
	}

	get sessionId() {
		return this._model.session.sessionId;
	}

	get username() {
		if (this.agent) {
			const isAllowed = this.chatAgentNameService.getAgentNameRestriction(this.agent);
			if (isAllowed) {
				return this.agent.fullName || this.agent.name;
			} else {
				return getFullyQualifiedId(this.agent);
			}
		}

		return this._model.username;
	}

	get avatarIcon() {
		return this._model.avatarIcon;
	}

	get agent() {
		return this._model.agent;
	}

	get slashCommand() {
		return this._model.slashCommand;
	}

	get agentOrSlashCommandDetected() {
		return this._model.agentOrSlashCommandDetected;
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

	get codeCitations(): ReadonlyArray<IChatCodeCitation> {
		return this._model.codeCitations;
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

	get shouldBeRemovedOnSend() {
		return this._model.shouldBeRemovedOnSend;
	}

	get isCompleteAddedRequest() {
		return this._model.isCompleteAddedRequest;
	}

	get replyFollowups() {
		return this._model.followups?.filter((f): f is IChatFollowup => f.kind === 'reply');
	}

	get result() {
		return this._model.result;
	}

	get errorDetails(): IChatResponseErrorDetails | undefined {
		return this.result?.errorDetails;
	}

	get vote() {
		return this._model.vote;
	}

	get voteDownReason() {
		return this._model.voteDownReason;
	}

	get requestId() {
		return this._model.requestId;
	}

	get isStale() {
		return this._model.isStale;
	}

	get isLast(): boolean {
		return this._chatViewModel.getItems().at(-1) === this;
	}

	renderData: IChatResponseRenderData | undefined = undefined;
	currentRenderedHeight: number | undefined;

	private _usedReferencesExpanded: boolean | undefined;
	get usedReferencesExpanded(): boolean | undefined {
		if (typeof this._usedReferencesExpanded === 'boolean') {
			return this._usedReferencesExpanded;
		}

		return undefined;
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

	get isPaused() {
		return this._model.isPaused;
	}

	constructor(
		private readonly _model: IChatResponseModel,
		private readonly _chatViewModel: IChatViewModel,
		@ILogService private readonly logService: ILogService,
		@IChatAgentNameService private readonly chatAgentNameService: IChatAgentNameService,
	) {
		super();

		if (!_model.isComplete) {
			this._contentUpdateTimings = {
				totalTime: 0,
				lastUpdateTime: Date.now(),
				impliedWordLoadRate: 0,
				lastWordCount: 0,
			};
		}

		this._register(_model.onDidChange(() => {
			// This is set when the response is loading, but the model can change later for other reasons
			if (this._contentUpdateTimings) {
				const now = Date.now();
				const wordCount = countWords(_model.entireResponse.getMarkdown());

				if (wordCount === this._contentUpdateTimings.lastWordCount) {
					this.trace('onDidChange', `Update- no new words`);
				} else {
					if (this._contentUpdateTimings.lastWordCount === 0) {
						this._contentUpdateTimings.lastUpdateTime = now;
					}

					const timeDiff = Math.min(now - this._contentUpdateTimings.lastUpdateTime, 1000);
					const newTotalTime = Math.max(this._contentUpdateTimings.totalTime + timeDiff, 250);
					const impliedWordLoadRate = wordCount / (newTotalTime / 1000);
					this.trace('onDidChange', `Update- got ${wordCount} words over last ${newTotalTime}ms = ${impliedWordLoadRate} words/s`);
					this._contentUpdateTimings = {
						totalTime: this._contentUpdateTimings.totalTime !== 0 || this.response.value.some(v => v.kind === 'markdownContent') ?
							newTotalTime :
							this._contentUpdateTimings.totalTime,
						lastUpdateTime: now,
						impliedWordLoadRate,
						lastWordCount: wordCount
					};
				}
			}

			// new data -> new id, new content to render
			this._modelChangeCount++;

			this._onDidChange.fire();
		}));
	}

	private trace(tag: string, message: string) {
		this.logService.trace(`ChatResponseViewModel#${tag}: ${message}`);
	}

	setVote(vote: ChatAgentVoteDirection): void {
		this._modelChangeCount++;
		this._model.setVote(vote);
	}

	setVoteDownReason(reason: ChatAgentVoteDownReason | undefined): void {
		this._modelChangeCount++;
		this._model.setVoteDownReason(reason);
	}

	setEditApplied(edit: IChatTextEditGroup, editCount: number) {
		this._modelChangeCount++;
		this._model.setEditApplied(edit, editCount);
	}
}
