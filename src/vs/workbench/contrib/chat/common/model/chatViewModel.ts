/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, dispose } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatRequestVariableEntry } from '../attachments/chatVariableEntries.js';
import { ChatAgentVoteDirection, ChatAgentVoteDownReason, ChatRequestQueueKind, IChatCodeCitation, IChatContentReference, IChatFollowup, IChatMcpServersStarting, IChatProgressMessage, IChatQuestionCarousel, IChatResponseErrorDetails, IChatTask, IChatUsedContext } from '../chatService/chatService.js';
import { getFullyQualifiedId, IChatAgentCommand, IChatAgentData, IChatAgentNameService, IChatAgentResult } from '../participants/chatAgents.js';
import { IParsedChatRequest } from '../requestParser/chatParserTypes.js';
import { CodeBlockModelCollection } from '../widget/codeBlockModelCollection.js';
import { IChatModel, IChatProgressRenderableResponseContent, IChatRequestDisablement, IChatRequestModel, IChatResponseModel, IChatTextEditGroup, IResponse } from './chatModel.js';
import { ChatStreamStatsTracker, IChatStreamStats } from './chatStreamStats.js';
import { countWords } from './chatWordCounter.js';

export function isRequestVM(item: unknown): item is IChatRequestViewModel {
	return !!item && typeof item === 'object' && 'message' in item;
}

export function isResponseVM(item: unknown): item is IChatResponseViewModel {
	return !!item && typeof (item as IChatResponseViewModel).setVote !== 'undefined';
}

export function isPendingDividerVM(item: unknown): item is IChatPendingDividerViewModel {
	return !!item && typeof item === 'object' && (item as IChatPendingDividerViewModel).kind === 'pendingDivider';
}

export function isChatTreeItem(item: unknown): item is IChatRequestViewModel | IChatResponseViewModel {
	return isRequestVM(item) || isResponseVM(item);
}

export function assertIsResponseVM(item: unknown): asserts item is IChatResponseViewModel {
	if (!isResponseVM(item)) {
		throw new Error('Expected item to be IChatResponseViewModel');
	}
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
	readonly sessionResource: URI;
	readonly onDidDisposeModel: Event<void>;
	readonly onDidChange: Event<IChatViewModelChangeEvent>;
	readonly inputPlaceholder?: string;
	getItems(): (IChatRequestViewModel | IChatResponseViewModel | IChatPendingDividerViewModel)[];
	setInputPlaceholder(text: string): void;
	resetInputPlaceholder(): void;
	editing?: IChatRequestViewModel;
	setEditing(editing: IChatRequestViewModel): void;
}

export interface IChatRequestViewModel {
	readonly id: string;
	readonly sessionResource: URI;
	/** This ID updates every time the underlying data changes */
	readonly dataId: string;
	readonly username: string;
	readonly avatarIcon?: URI | ThemeIcon;
	readonly message: IParsedChatRequest | IChatFollowup;
	readonly messageText: string;
	readonly attempt: number;
	readonly variables: readonly IChatRequestVariableEntry[];
	currentRenderedHeight: number | undefined;
	readonly contentReferences?: ReadonlyArray<IChatContentReference>;
	readonly confirmation?: string;
	readonly shouldBeRemovedOnSend: IChatRequestDisablement | undefined;
	readonly isComplete: boolean;
	readonly isCompleteAddedRequest: boolean;
	readonly slashCommand: IChatAgentCommand | undefined;
	readonly agentOrSlashCommandDetected: boolean;
	readonly shouldBeBlocked: IObservable<boolean>;
	readonly modelId?: string;
	readonly timestamp: number;
	/** The kind of pending request, or undefined if not pending */
	readonly pendingKind?: ChatRequestQueueKind;
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

/**
 * Content type for the "Working" progress message
 */
export interface IChatWorkingProgress {
	kind: 'working';
}


/**
 * Content type for citations used during rendering, not in the model
 */
export interface IChatCodeCitations {
	citations: ReadonlyArray<IChatCodeCitation>;
	kind: 'codeCitations';
}

export interface IChatErrorDetailsPart {
	kind: 'errorDetails';
	errorDetails: IChatResponseErrorDetails;
	isLast: boolean;
}

export interface IChatChangesSummaryPart {
	readonly kind: 'changesSummary';
	readonly requestId: string;
	readonly sessionResource: URI;
}

/**
 * Type for content parts rendered by IChatListRenderer (not necessarily in the model)
 */
export type IChatRendererContent = IChatProgressRenderableResponseContent | IChatReferences | IChatCodeCitations | IChatErrorDetailsPart | IChatChangesSummaryPart | IChatWorkingProgress | IChatMcpServersStarting | IChatQuestionCarousel;

export interface IChatResponseViewModel {
	readonly model: IChatResponseModel;
	readonly id: string;
	readonly session: IChatViewModel;
	readonly sessionResource: URI;
	/** This ID updates every time the underlying data changes */
	readonly dataId: string;
	/** The ID of the associated IChatRequestViewModel */
	readonly requestId: string;
	readonly username: string;
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
	readonly contentUpdateTimings?: IChatStreamStats;
	readonly shouldBeRemovedOnSend: IChatRequestDisablement | undefined;
	readonly isCompleteAddedRequest: boolean;
	renderData?: IChatResponseRenderData;
	currentRenderedHeight: number | undefined;
	setVote(vote: ChatAgentVoteDirection): void;
	setVoteDownReason(reason: ChatAgentVoteDownReason | undefined): void;
	usedReferencesExpanded?: boolean;
	vulnerabilitiesListExpanded: boolean;
	setEditApplied(edit: IChatTextEditGroup, editCount: number): void;
	readonly shouldBeBlocked: IObservable<boolean>;
}

export interface IChatPendingDividerViewModel {
	readonly kind: 'pendingDivider';
	readonly id: string; // e.g., 'pending-divider-steering' or 'pending-divider-queued'
	readonly sessionResource: URI;
	readonly isComplete: true;
	readonly dividerKind: ChatRequestQueueKind;
	currentRenderedHeight: number | undefined;
}

export interface IChatViewModelOptions {
	/**
	 * Maximum number of items to return from getItems().
	 * When set, only the last N items are returned (most recent request/response pairs).
	 */
	readonly maxVisibleItems?: number;
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

	get sessionResource(): URI {
		return this._model.sessionResource;
	}

	constructor(
		private readonly _model: IChatModel,
		public readonly codeBlockModelCollection: CodeBlockModelCollection,
		private readonly _options: IChatViewModelOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		_model.getRequests().forEach((request, i) => {
			const requestModel = this.instantiationService.createInstance(ChatRequestViewModel, request);
			this._items.push(requestModel);

			if (request.response) {
				this.onAddResponse(request.response);
			}
		});

		this._register(_model.onDidDispose(() => this._onDidDisposeModel.fire()));
		this._register(_model.onDidChangePendingRequests(() => this._onDidChange.fire(null)));
		this._register(_model.onDidChange(e => {
			if (e.kind === 'addRequest') {
				const requestModel = this.instantiationService.createInstance(ChatRequestViewModel, e.request);
				this._items.push(requestModel);

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
			return this._onDidChange.fire(null);
		}));
		this._items.push(response);
	}

	getItems(): (IChatRequestViewModel | IChatResponseViewModel | IChatPendingDividerViewModel)[] {
		let items: (IChatRequestViewModel | IChatResponseViewModel | IChatPendingDividerViewModel)[] = this._items.filter((item) => !item.shouldBeRemovedOnSend || item.shouldBeRemovedOnSend.afterUndoStop);
		if (this._options?.maxVisibleItems !== undefined && items.length > this._options.maxVisibleItems) {
			items = items.slice(-this._options.maxVisibleItems);
		}

		const pendingRequests = this._model.getPendingRequests();
		if (pendingRequests.length > 0) {
			// Separate steering and queued requests
			const steeringRequests = pendingRequests.filter(p => p.kind === ChatRequestQueueKind.Steering);
			const queuedRequests = pendingRequests.filter(p => p.kind === ChatRequestQueueKind.Queued);

			// Add steering requests with their divider first
			if (steeringRequests.length > 0) {
				items.push({ kind: 'pendingDivider', id: 'pending-divider-steering', sessionResource: this._model.sessionResource, isComplete: true, dividerKind: ChatRequestQueueKind.Steering, currentRenderedHeight: undefined });
				for (const pending of steeringRequests) {
					const requestVM = this.instantiationService.createInstance(ChatRequestViewModel, pending.request, pending.kind);
					items.push(requestVM);
				}
			}

			// Add queued requests with their divider
			if (queuedRequests.length > 0) {
				items.push({ kind: 'pendingDivider', id: 'pending-divider-queued', sessionResource: this._model.sessionResource, isComplete: true, dividerKind: ChatRequestQueueKind.Queued, currentRenderedHeight: undefined });
				for (const pending of queuedRequests) {
					const requestVM = this.instantiationService.createInstance(ChatRequestViewModel, pending.request, pending.kind);
					items.push(requestVM);
				}
			}
		}

		return items;
	}


	private _editing: IChatRequestViewModel | undefined = undefined;
	get editing(): IChatRequestViewModel | undefined {
		return this._editing;
	}

	setEditing(editing: IChatRequestViewModel | undefined): void {
		if (this.editing && editing && this.editing.id === editing.id) {
			return; // already editing this request
		}

		this._editing = editing;
	}

	override dispose() {
		super.dispose();
		dispose(this._items.filter((item): item is ChatResponseViewModel => item instanceof ChatResponseViewModel));
	}
}

export class ChatRequestViewModel implements IChatRequestViewModel {
	get id() {
		return this._model.id;
	}

	/**
	 * An ID that changes when the request should be re-rendered.
	 */
	get dataId() {
		return `${this.id}_${this._model.version + (this._model.response?.isComplete ? 1 : 0)}`;
	}

	get sessionResource() {
		return this._model.session.sessionResource;
	}

	get username() {
		return 'User';
	}

	get avatarIcon(): ThemeIcon {
		return Codicon.account;
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

	get shouldBeBlocked() {
		return this._model.shouldBeBlocked;
	}

	get slashCommand(): IChatAgentCommand | undefined {
		return this._model.response?.slashCommand;
	}

	get agentOrSlashCommandDetected(): boolean {
		return this._model.response?.agentOrSlashCommandDetected ?? false;
	}

	currentRenderedHeight: number | undefined;

	get modelId() {
		return this._model.modelId;
	}

	get timestamp() {
		return this._model.timestamp;
	}

	get pendingKind() {
		return this._pendingKind;
	}

	constructor(
		private readonly _model: IChatRequestModel,
		private readonly _pendingKind?: ChatRequestQueueKind,
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
			(this.isLast ? '_last' : '');
	}

	get sessionResource(): URI {
		return this._model.session.sessionResource;
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

	get shouldBeBlocked() {
		return this._model.shouldBeBlocked;
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
		return this.session.getItems().at(-1) === this;
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

	private readonly liveUpdateTracker: ChatStreamStatsTracker | undefined;

	get contentUpdateTimings(): IChatStreamStats | undefined {
		return this.liveUpdateTracker?.data;
	}

	constructor(
		private readonly _model: IChatResponseModel,
		public readonly session: IChatViewModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatAgentNameService private readonly chatAgentNameService: IChatAgentNameService,
	) {
		super();

		if (!_model.isComplete) {
			this.liveUpdateTracker = this.instantiationService.createInstance(ChatStreamStatsTracker);
		}

		this._register(_model.onDidChange(() => {
			if (this.liveUpdateTracker) {
				const wordCount = countWords(_model.entireResponse.getMarkdown());
				this.liveUpdateTracker.update({ totalWordCount: wordCount });
			}

			// new data -> new id, new content to render
			this._modelChangeCount++;

			this._onDidChange.fire();
		}));
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
