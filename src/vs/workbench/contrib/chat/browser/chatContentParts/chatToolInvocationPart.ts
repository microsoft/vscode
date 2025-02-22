/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IChatMarkdownContent, IChatProgressMessage, IChatToolInvocation, IChatToolInvocationSerialized } from '../../common/chatService.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { CodeBlockModelCollection } from '../../common/codeBlockModelCollection.js';
import { IToolResult } from '../../common/languageModelToolsService.js';
import { CancelChatActionId } from '../actions/chatExecuteActions.js';
import { AcceptToolConfirmationActionId } from '../actions/chatToolActions.js';
import { ChatTreeItem, IChatCodeBlockInfo } from '../chat.js';
import { ICodeBlockRenderOptions } from '../codeBlockPart.js';
import { ChatConfirmationWidget, ChatCustomConfirmationWidget, IChatConfirmationButton } from './chatConfirmationWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatMarkdownContentPart, EditorPool } from './chatMarkdownContentPart.js';
import { ChatCustomProgressPart, ChatProgressContentPart } from './chatProgressContentPart.js';
import { ChatCollapsibleListContentPart, CollapsibleListPool, IChatCollapsibleListItem } from './chatReferencesContentPart.js';

export class ChatToolInvocationPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.subPart?.codeblocks ?? [];
	}

	public get codeblocksPartId(): string | undefined {
		return this.subPart?.codeblocksPartId;
	}

	private subPart!: ChatToolInvocationSubPart;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		renderer: MarkdownRenderer,
		listPool: CollapsibleListPool,
		editorPool: EditorPool,
		currentWidth: number,
		codeBlockModelCollection: CodeBlockModelCollection,
		codeBlockStartIndex: number,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.domNode = dom.$('.chat-tool-invocation-part');
		if (toolInvocation.presentation === 'hidden') {
			return;
		}

		// This part is a bit different, since IChatToolInvocation is not an immutable model object. So this part is able to rerender itself.
		// If this turns out to be a typical pattern, we could come up with a more reusable pattern, like telling the list to rerender an element
		// when the model changes, or trying to make the model immutable and swap out one content part for a new one based on user actions in the view.
		const partStore = this._register(new DisposableStore());
		const render = () => {
			dom.clearNode(this.domNode);
			partStore.clear();

			this.subPart = partStore.add(instantiationService.createInstance(ChatToolInvocationSubPart, toolInvocation, context, renderer, listPool, editorPool, currentWidth, codeBlockModelCollection, codeBlockStartIndex));
			this.domNode.appendChild(this.subPart.domNode);
			partStore.add(this.subPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
			partStore.add(this.subPart.onNeedsRerender(() => {
				render();
				this._onDidChangeHeight.fire();
			}));
		};
		render();
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'toolInvocation' || other.kind === 'toolInvocationSerialized';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}

class ChatToolInvocationSubPart extends Disposable {
	public readonly domNode: HTMLElement;

	private _onNeedsRerender = this._register(new Emitter<void>());
	public readonly onNeedsRerender = this._onNeedsRerender.event;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private markdownPart: ChatMarkdownContentPart | undefined;
	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.markdownPart?.codeblocks ?? [];
	}

	public get codeblocksPartId(): string | undefined {
		return this.markdownPart?.codeblocksPartId;
	}

	constructor(
		private readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		private readonly context: IChatContentPartRenderContext,
		private readonly renderer: MarkdownRenderer,
		private readonly listPool: CollapsibleListPool,
		private readonly editorPool: EditorPool,
		private readonly currentWidth: number,
		private readonly codeBlockModelCollection: CodeBlockModelCollection,
		private readonly codeBlockStartIndex: number,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();

		if (toolInvocation.kind === 'toolInvocation' && toolInvocation.confirmationMessages) {
			this.domNode = this.createConfirmationWidget(toolInvocation);
		} else if (toolInvocation.presentation === 'withCodeblocks' && typeof toolInvocation.invocationMessage !== 'string') {
			this.domNode = this.createMarkdownProgressPart(toolInvocation);
		} else if (toolInvocation.resultDetails?.length) {
			this.domNode = this.createResultList(toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage, toolInvocation.resultDetails);
		} else {
			this.domNode = this.createProgressPart();
		}

		if (toolInvocation.kind === 'toolInvocation' && !toolInvocation.isComplete) {
			toolInvocation.isCompletePromise.then(() => this._onNeedsRerender.fire());
		}
	}

	private createConfirmationWidget(toolInvocation: IChatToolInvocation): HTMLElement {
		if (!toolInvocation.confirmationMessages) {
			throw new Error('Confirmation messages are missing');
		}
		const title = toolInvocation.confirmationMessages.title;
		const message = toolInvocation.confirmationMessages.message;
		const continueLabel = localize('continue', "Continue");
		const continueKeybinding = this.keybindingService.lookupKeybinding(AcceptToolConfirmationActionId)?.getLabel();
		const continueTooltip = continueKeybinding ? `${continueLabel} (${continueKeybinding})` : continueLabel;
		const cancelLabel = localize('cancel', "Cancel");
		const cancelKeybinding = this.keybindingService.lookupKeybinding(CancelChatActionId)?.getLabel();
		const cancelTooltip = cancelKeybinding ? `${cancelLabel} (${cancelKeybinding})` : cancelLabel;

		const buttons: IChatConfirmationButton[] = [
			{
				label: continueLabel,
				data: true,
				tooltip: continueTooltip
			},
			{
				label: cancelLabel,
				data: false,
				isSecondary: true,
				tooltip: cancelTooltip
			}];
		let confirmWidget: ChatConfirmationWidget | ChatCustomConfirmationWidget;
		if (typeof message === 'string') {
			confirmWidget = this._register(this.instantiationService.createInstance(
				ChatConfirmationWidget,
				title,
				message,
				buttons
			));
		} else {
			const chatMarkdownContent: IChatMarkdownContent = {
				kind: 'markdownContent',
				content: message,
			};
			const codeBlockRenderOptions: ICodeBlockRenderOptions = {
				hideToolbar: true,
				reserveWidth: 19,
				verticalPadding: 5
			};
			this.markdownPart = this._register(this.instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, this.context, this.editorPool, false, this.codeBlockStartIndex, this.renderer, this.currentWidth, this.codeBlockModelCollection, { codeBlockRenderOptions }));
			this._register(this.markdownPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
			confirmWidget = this._register(this.instantiationService.createInstance(
				ChatCustomConfirmationWidget,
				title,
				this.markdownPart.domNode,
				buttons
			));
		}

		this._register(confirmWidget.onDidClick(button => {
			toolInvocation.confirmed.complete(button.data);
		}));
		this._register(confirmWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		toolInvocation.confirmed.p.then(() => {
			this._onNeedsRerender.fire();
		});
		return confirmWidget.domNode;
	}

	private createProgressPart(): HTMLElement {
		let content: IMarkdownString;
		if (this.toolInvocation.isComplete && this.toolInvocation.isConfirmed !== false && this.toolInvocation.pastTenseMessage) {
			content = typeof this.toolInvocation.pastTenseMessage === 'string' ?
				new MarkdownString().appendText(this.toolInvocation.pastTenseMessage) :
				this.toolInvocation.pastTenseMessage;
		} else {
			content = typeof this.toolInvocation.invocationMessage === 'string' ?
				new MarkdownString().appendText(this.toolInvocation.invocationMessage + '…') :
				new MarkdownString(this.toolInvocation.invocationMessage.value + '…');
		}

		const progressMessage: IChatProgressMessage = {
			kind: 'progressMessage',
			content
		};
		const iconOverride = this.toolInvocation.isConfirmed === false ?
			Codicon.error :
			this.toolInvocation.isComplete ?
				Codicon.check : undefined;
		const progressPart = this._register(this.instantiationService.createInstance(ChatProgressContentPart, progressMessage, this.renderer, this.context, undefined, true, iconOverride));
		if (this.toolInvocation.tooltip) {
			this._register(this.hoverService.setupDelayedHover(progressPart.domNode, { content: this.toolInvocation.tooltip, additionalClasses: ['chat-tool-hover'] }));
		}

		return progressPart.domNode;
	}

	private createMarkdownProgressPart(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): HTMLElement {
		const content = toolInvocation.isComplete ?
			(toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage)
			: toolInvocation.invocationMessage;
		const chatMarkdownContent: IChatMarkdownContent = {
			kind: 'markdownContent',
			content: content as IMarkdownString,
		};

		const codeBlockRenderOptions: ICodeBlockRenderOptions = {
			hideToolbar: true,
			reserveWidth: 19,
			verticalPadding: 5
		};
		this.markdownPart = this._register(this.instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, this.context, this.editorPool, false, this.codeBlockStartIndex, this.renderer, this.currentWidth, this.codeBlockModelCollection, { codeBlockRenderOptions }));
		this._register(this.markdownPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		const icon = this.toolInvocation.isConfirmed === false ?
			Codicon.error :
			this.toolInvocation.isComplete ?
				Codicon.check : ThemeIcon.modify(Codicon.loading, 'spin');
		const progressPart = this.instantiationService.createInstance(ChatCustomProgressPart, this.markdownPart.domNode, icon);
		return progressPart.domNode;
	}

	private createResultList(
		message: string | IMarkdownString,
		toolDetails: NonNullable<IToolResult['toolResultDetails']>,
	): HTMLElement {
		const collapsibleListPart = this._register(this.instantiationService.createInstance(
			ChatCollapsibleListContentPart,
			toolDetails.map<IChatCollapsibleListItem>(detail => ({
				kind: 'reference',
				reference: detail,
			})),
			message,
			this.context,
			this.listPool,
		));
		this._register(collapsibleListPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		return collapsibleListPart.domNode;
	}
}
