/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { marked } from 'vs/base/common/marked/marked';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import { TextEdit } from 'vs/editor/common/languages';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { annotateVulnerabilitiesInText } from 'vs/workbench/contrib/chat/common/annotations';
import { IChatAgentCommand, IChatAgentData, IChatAgentResult } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatModelInitState, IChatModel, IChatRequestModel, IChatResponseModel, IChatWelcomeMessageContent, IResponse } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatCommandButton, IChatContentReference, IChatFollowup, IChatProgressMessage, IChatResponseErrorDetails, IChatResponseProgressFileTreeData, IChatUsedContext, InteractiveSessionVoteDirection } from 'vs/workbench/contrib/chat/common/chatService';
import { countWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { CodeBlockModelCollection } from './codeBlockModelCollection';

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
	readonly model: IChatModel;
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
	readonly avatarIcon?: URI | ThemeIcon;
	readonly message: IParsedChatRequest | IChatFollowup;
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

export type IChatRenderData = IChatResponseProgressFileTreeData | IChatResponseMarkdownRenderData | IChatProgressMessageRenderData | IChatCommandButton;
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
	readonly avatarIcon?: URI | ThemeIcon;
	readonly agent?: IChatAgentData;
	readonly slashCommand?: IChatAgentCommand;
	readonly agentOrSlashCommandDetected: boolean;
	readonly response: IResponse;
	readonly usedContext: IChatUsedContext | undefined;
	readonly contentReferences: ReadonlyArray<IChatContentReference>;
	readonly progressMessages: ReadonlyArray<IChatProgressMessage>;
	readonly edits: ResourceMap<TextEdit[]>;
	readonly isComplete: boolean;
	readonly isCanceled: boolean;
	readonly isStale: boolean;
	readonly vote: InteractiveSessionVoteDirection | undefined;
	readonly replyFollowups?: IChatFollowup[];
	readonly errorDetails?: IChatResponseErrorDetails;
	readonly result?: IChatAgentResult;
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

	get providerId() {
		return this._model.providerId;
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

			const modelEventToVmEvent: IChatViewModelChangeEvent = e.kind === 'addRequest' ? { kind: 'addRequest' } :
				e.kind === 'initialize' ? { kind: 'initialize' } :
					null;
			this._onDidChange.fire(modelEventToVmEvent);
		}));
	}

	private onAddResponse(responseModel: IChatResponseModel) {
		const response = this.instantiationService.createInstance(ChatResponseViewModel, responseModel);
		this._register(response.onDidChange(() => {
			if (response.isComplete) {
				this.updateCodeBlockTextModels(response);
			}
			return this._onDidChange.fire(null);
		}));
		this._items.push(response);
		this.updateCodeBlockTextModels(response);
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

	updateCodeBlockTextModels(model: IChatRequestViewModel | IChatResponseViewModel) {
		let content: string;
		if (isRequestVM(model)) {
			content = model.messageText;
		} else {
			content = annotateVulnerabilitiesInText(model.response.value).map(x => x.content.value).join('');
		}

		let codeBlockIndex = 0;
		const renderer = new marked.Renderer();
		renderer.code = (value, languageId) => {
			languageId ??= '';
			const newText = this.fixCodeText(value, languageId);
			this.codeBlockModelCollection.update(this._model.sessionId, model, codeBlockIndex++, { text: newText, languageId });
			return '';
		};

		marked.parse(this.ensureFencedCodeBlocksTerminated(content), { renderer });
	}

	private fixCodeText(text: string, languageId: string): string {
		if (languageId === 'php') {
			if (!text.trim().startsWith('<')) {
				return `<?php\n${text}\n?>`;
			}
		}

		return text;
	}

	/**
	 * Marked doesn't consistently render fenced code blocks that aren't terminated.
	 *
	 * Try to close them ourselves to workaround this.
	 */
	private ensureFencedCodeBlocksTerminated(content: string): string {
		const lines = content.split('\n');
		let inCodeBlock = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.startsWith('```')) {
				inCodeBlock = !inCodeBlock;
			}
		}

		// If we're still in a code block at the end of the content, add a closing fence
		if (inCodeBlock) {
			lines.push('```');
		}

		return lines.join('\n');
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

	get avatarIcon() {
		return this._model.avatarIconUri;
	}

	get message() {
		return this._model.message;
	}

	get messageText() {
		return this.message.text;
	}

	currentRenderedHeight: number | undefined;

	constructor(
		readonly _model: IChatRequestModel,
	) { }
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

	get progressMessages(): ReadonlyArray<IChatProgressMessage> {
		return this._model.progressMessages;
	}

	get edits(): ResourceMap<TextEdit[]> {
		return this._model.edits;
	}

	get isComplete() {
		return this._model.isComplete;
	}

	get isCanceled() {
		return this._model.isCanceled;
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

	get requestId() {
		return this._model.requestId;
	}

	get isStale() {
		return this._model.isStale;
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
		@ILogService private readonly logService: ILogService,
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
				const timeDiff = now - this._contentUpdateTimings.loadingStartTime;
				const impliedWordLoadRate = this._contentUpdateTimings.lastWordCount / (timeDiff / 1000);
				this.trace('onDidChange', `Update- got ${this._contentUpdateTimings.lastWordCount} words over ${timeDiff}ms = ${impliedWordLoadRate} words/s. ${wordCount} words are now available.`);
				this._contentUpdateTimings = {
					loadingStartTime: this._contentUpdateTimings.loadingStartTime,
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
	readonly avatarIcon?: URI | ThemeIcon;
	readonly content: IChatWelcomeMessageContent[];
	readonly sampleQuestions: IChatFollowup[];
	currentRenderedHeight?: number;
}
