/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { Event } from '../../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun, autorunPerKeyedItem, derived, derivedOpts, IObservable } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { shouldAnnounceChatInputRequest } from '../../accessibility/chatInputRequestAnnouncement.js';
import { IChatSessionInputRequest } from '../../../common/chatSessionInputRequests.js';
import { IChatToolInvocation, isLegacyChatTerminalToolInvocationData } from '../../../common/chatService/chatService.js';
import { ChatModeKind } from '../../../common/constants.js';
import { ChatPlanReviewData } from '../../../common/model/chatProgressTypes/chatPlanReviewData.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatViewModel, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatContentMarkdownRenderer } from '../chatContentMarkdownRenderer.js';
import { DiffEditorPool, EditorPool } from '../chatContentParts/chatContentCodePools.js';
import { IChatContentPart, IChatContentPartRenderContext, InlineTextModelCollection } from '../chatContentParts/chatContentParts.js';
import { ChatElicitationContentPart } from '../chatContentParts/chatElicitationContentPart.js';
import { ChatPlanReviewPart } from '../chatContentParts/chatPlanReviewPart.js';
import { ChatQuestionCarouselPart } from '../chatContentParts/chatQuestionCarouselPart.js';
import { CollapsibleListPool } from '../chatContentParts/chatReferencesContentPart.js';
import { ChatToolConfirmationCarouselPart, IChatInputCarouselContent } from '../chatContentParts/toolInvocationParts/chatToolConfirmationCarouselPart.js';
import { ChatToolInvocationPart } from '../chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { ChatEditorOptions } from '../chatOptions.js';

function plaintext(value: string | IMarkdownString | undefined): string {
	return typeof value === 'string' ? value : value ? renderAsPlaintext(value) : '';
}

function getChatInputRequestTitle(request: IChatSessionInputRequest): string {
	const content = request.content;
	switch (content.kind) {
		case 'toolInvocation': {
			const state = content.state.get();
			if (state.type === IChatToolInvocation.StateKind.WaitingForAuthentication) {
				return localize('inputRequest.authentication', "Authentication required");
			}
			if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
				return localize('inputRequest.result', "Review tool result");
			}
			return plaintext(IChatToolInvocation.getConfirmationMessages(content)?.title) || plaintext(content.invocationMessage);
		}
		case 'questionCarousel':
			return localize('inputRequest.questions', "Questions");
		case 'planReview':
			return localize('inputRequest.plan', "Review plan");
		case 'elicitation2':
			return plaintext(content.title);
	}
}

/** Renders original request objects and source view models, never a copied peer transcript. */
export class ChatSessionInputRequestsPart extends Disposable {
	readonly domNode: HTMLElement;
	private readonly carousel: ChatToolConfirmationCarouselPart;
	private readonly parts = new Map<string, IChatContentPart>();
	private readonly scopedInstantiationService: IInstantiationService;
	private readonly editorPool: EditorPool;
	private readonly diffEditorPool: DiffEditorPool;
	private readonly listPool: CollapsibleListPool;
	private readonly inlineTextModels: InlineTextModelCollection;
	private readonly markdownRenderer: ChatContentMarkdownRenderer;

	constructor(
		private readonly requests: IObservable<readonly IChatSessionInputRequest[]>,
		private readonly width: IObservable<number>,
		private readonly focusInput: () => void,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService hoverService: IHoverService,
		@IAccessibilitySignalService accessibilitySignalService: IAccessibilitySignalService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this.carousel = this._register(new ChatToolConfirmationCarouselPart(() => { throw new Error('Source context is required'); }, [], undefined, undefined, undefined, undefined, hoverService));
		this.domNode = this.carousel.domNode;
		dom.hide(this.domNode);
		this._register(this.carousel.onDidEmpty(restoreFocus => {
			if (restoreFocus) {
				this.focusInput();
			}
		}));
		const context = this._register(contextKeyService.createScoped(this.domNode));
		this.scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, context])));
		const editorOptions = this._register(this.scopedInstantiationService.createInstance(ChatEditorOptions, undefined, 'foreground', 'input.background', 'editor.background'));
		const delegate = {
			container: this.domNode,
			getListLength: () => 0,
			currentChatMode: () => ChatModeKind.Agent,
			isStickyScrollEnabled: () => false,
			refreshStickyScroll: () => { },
			stickyScrollTopPadding: 0,
		};
		this.editorPool = this._register(this.scopedInstantiationService.createInstance(EditorPool, editorOptions, delegate, undefined, true));
		this.diffEditorPool = this._register(this.scopedInstantiationService.createInstance(DiffEditorPool, editorOptions, delegate, undefined, true));
		this.listPool = this._register(this.scopedInstantiationService.createInstance(CollapsibleListPool, Event.None, undefined, undefined));
		this.inlineTextModels = this._register(this.scopedInstantiationService.createInstance(InlineTextModelCollection));
		this.markdownRenderer = this.scopedInstantiationService.createInstance(ChatContentMarkdownRenderer);
		this._register(autorunPerKeyedItem(requests, request => request.id, (_id, request$, store) => {
			const content = derivedOpts({
				owner: this,
				equalsFn: (a: IChatSessionInputRequest, b: IChatSessionInputRequest) => a.content === b.content && a.model === b.model && a.requestId === b.requestId,
			}, reader => request$.read(reader));
			store.add(autorun(reader => {
				const request = content.read(reader);
				const isActive = derived(this, reader => request.isActive.read(reader) && requests.read(reader).some(item => item.id === request.id && item.content === request.content));
				reader.store.add(this.carousel.addRequest({
					id: request.id,
					title: getChatInputRequestTitle(request),
					sourceLabel: request.source.label,
					isActive,
					createContent: () => this.createContent(request, isActive),
				}));
				const phase = request.content.kind === 'toolInvocation' ? request.content.state.read(undefined).type : request.content.kind;
				if (shouldAnnounceChatInputRequest(request.content, phase)) {
					accessibilitySignalService.playSignal(AccessibilitySignal.chatUserActionRequired, {
						customAlertMessage: configurationService.getValue(AccessibilityVerbositySettingId.Chat)
							? localize('inputRequest.attention', "{0} needs input: {1}", request.source.label, getChatInputRequestTitle(request))
							: undefined,
					});
				}
			}));
			store.add(autorun(reader => {
				const request = request$.read(reader);
				if (request.content.kind === 'toolInvocation') {
					request.content.state.read(reader);
				}
				this.carousel.updateRequestPresentation(request.id, getChatInputRequestTitle(request), request.source.label);
			}));
		}));
	}

	private createContent(request: IChatSessionInputRequest, isActive: IObservable<boolean>): IChatInputCarouselContent {
		const store = new DisposableStore();
		const viewModel = store.add(this.scopedInstantiationService.createInstance(ChatViewModel, request.model, undefined));
		const element = viewModel.getItems().find(item => isResponseVM(item) && item.requestId === request.requestId);
		if (!element || !isResponseVM(element)) {
			store.dispose();
			return { domNode: dom.$('div', undefined, localize('inputRequest.unavailable', "This request is no longer available.")), dispose: () => { } };
		}
		const context: IChatContentPartRenderContext = {
			element,
			container: this.domNode,
			elementIndex: 0,
			contentIndex: 0,
			content: [request.content],
			codeBlockStartIndex: 0,
			treeStartIndex: 0,
			editorPool: this.editorPool,
			diffEditorPool: this.diffEditorPool,
			inlineTextModels: this.inlineTextModels,
			currentWidth: this.width,
			onDidChangeVisibility: Event.None,
			isRequestActive: () => isActive.get() && !store.isDisposed,
			focusAfterAction: this.focusInput,
		};
		const content = request.content;
		let part: IChatContentPart & { readonly domNode: HTMLElement };
		switch (content.kind) {
			case 'toolInvocation':
				part = store.add(this.scopedInstantiationService.createInstance(ChatToolInvocationPart, content, context, this.markdownRenderer, this.listPool, this.editorPool, () => this.width.get(), undefined, 0));
				break;
			case 'questionCarousel':
				part = store.add(this.scopedInstantiationService.createInstance(ChatQuestionCarouselPart, content, context, {
					shouldAutoFocus: false,
					onSubmit: answers => {
						if (!isActive.get() || content.isUsed || store.isDisposed) {
							return;
						}
						const values = answers ? Object.fromEntries(answers) : undefined;
						content.data = values ?? {};
						content.isUsed = true;
						if (content instanceof ChatQuestionCarouselData) {
							content.draftAnswers = undefined;
							content.draftCurrentIndex = undefined;
							content.completion.complete({ answers: values });
						}
						this.focusInput();
					},
				}));
				break;
			case 'planReview':
				part = store.add(this.scopedInstantiationService.createInstance(ChatPlanReviewPart, content, context, {
					onSubmit: result => {
						if (!isActive.get() || content.isUsed || store.isDisposed) {
							return;
						}
						content.data = result;
						content.isUsed = true;
						if (content instanceof ChatPlanReviewData) {
							content.completion.complete(result);
						}
						this.focusInput();
					},
				}));
				break;
			case 'elicitation2':
				part = store.add(this.scopedInstantiationService.createInstance(ChatElicitationContentPart, content, context));
				break;
		}
		this.parts.set(request.id, part);
		return { domNode: part.domNode, dispose: () => { this.parts.delete(request.id); store.dispose(); } };
	}

	setMaxHeight(height: number | undefined): void {
		this.carousel.setMaxHeight(height);
	}

	get questionCarousel(): ChatQuestionCarouselPart | undefined {
		const part = this.carousel.activeRequestId ? this.parts.get(this.carousel.activeRequestId) : undefined;
		return part instanceof ChatQuestionCarouselPart ? part : undefined;
	}

	focusQuestionCarousel(): boolean {
		const request = this.requests.get().find(request => request.content.kind === 'questionCarousel');
		if (!request) {
			return false;
		}
		this.carousel.activateRequest(request.id);
		this.questionCarousel?.focus();
		return true;
	}

	get toolConfirmation(): IChatToolInvocation | undefined {
		const content = this.requests.get().find(request => request.id === this.carousel.activeRequestId)?.content;
		return content?.kind === 'toolInvocation' ? content : undefined;
	}

	getAccessibleContent(): string {
		return this.requests.get().map(request => {
			const content = request.content;
			const lines = [localize('inputRequest.source', "{0}: {1}", request.source.label, getChatInputRequestTitle(request))];
			if (content.kind === 'toolInvocation') {
				const messages = IChatToolInvocation.getConfirmationMessages(content);
				lines.push(plaintext(messages?.message));
				const data = content.toolSpecificData;
				if (data?.kind === 'input') {
					lines.push(JSON.stringify(data.rawInput, undefined, 2));
				} else if (data?.kind === 'terminal' && !isLegacyChatTerminalToolInvocationData(data)) {
					lines.push(data.commandLine.userEdited ?? data.commandLine.original);
				}
				const state = content.state.get();
				if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
					lines.push(...state.contentForModel.map(part => part.kind === 'text' ? part.value : localize('inputRequest.resultData', "Result attachment")));
				}
			} else if (content.kind === 'questionCarousel') {
				lines.push(plaintext(content.message), ...content.questions.flatMap(question => [question.title, plaintext(question.message), ...(question.options?.map(option => option.label) ?? [])]));
			} else if (content.kind === 'planReview') {
				lines.push(content.content, ...content.actions.map(action => action.label));
			} else {
				lines.push(plaintext(content.message));
			}
			return lines.filter(Boolean).join('\n');
		}).join('\n\n');
	}
}
