/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../../base/browser/dom.js';
import { alert } from '../../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString, type IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IRenderedMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../../../nls.js';
import { IChatProgressMessage, IChatTask, IChatTaskSerialized, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { IChatRendererContent, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { renderFileWidgets } from './chatInlineAnchorWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { getToolApprovalMessage } from './toolInvocationParts/chatToolPartUtilities.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AccessibilityWorkbenchSettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { HoverStyle } from '../../../../../../base/browser/ui/hover/hover.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { isEqual } from '../../../../../../base/common/resources.js';

export class ChatProgressContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly showSpinner: boolean;
	private readonly isHidden: boolean;
	private readonly renderedMessage = this._register(new MutableDisposable<IRenderedMarkdown>());
	private currentContent: IMarkdownString;

	constructor(
		progress: IChatProgressMessage | IChatTask | IChatTaskSerialized | { content: IMarkdownString },
		private readonly chatContentMarkdownRenderer: IMarkdownRenderer,
		context: IChatContentPartRenderContext,
		forceShowSpinner: boolean | undefined,
		forceShowMessage: boolean | undefined,
		icon: ThemeIcon | undefined,
		private readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this.currentContent = progress.content;

		const followingContent = context.content.slice(context.contentIndex + 1);
		this.showSpinner = forceShowSpinner ?? shouldShowSpinner(followingContent, context.element);
		this.isHidden = forceShowMessage !== true && followingContent.some(part => part.kind !== 'progressMessage');
		if (this.isHidden) {
			// Placeholder, don't show the progress message
			this.domNode = $('');
			return;
		}

		if (this.showSpinner && !this.configurationService.getValue(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates)) {
			// TODO@roblourens is this the right place for this?
			// this step is in progress, communicate it to SR users
			alert(progress.content.value);
		}
		const codicon = icon ? icon : this.showSpinner ? ThemeIcon.modify(Codicon.loading, 'spin') : Codicon.check;
		const result = this.chatContentMarkdownRenderer.render(progress.content);
		result.element.classList.add('progress-step');
		renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._store);

		const tooltip: IMarkdownString | undefined = this.createApprovalMessage();
		const progressPart = this._register(instantiationService.createInstance(ChatProgressSubPart, result.element, codicon, tooltip));
		this.domNode = progressPart.domNode;
		this.renderedMessage.value = result;
	}

	updateMessage(content: MarkdownString): void {
		if (this.isHidden) {
			return;
		}

		// Render the new message
		const result = this._register(this.chatContentMarkdownRenderer.render(content));
		result.element.classList.add('progress-step');
		renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._store);

		// Replace the old message container with the new one
		if (this.renderedMessage.value) {
			this.renderedMessage.value.element.replaceWith(result.element);
		} else {
			this.domNode.appendChild(result.element);
		}

		this.renderedMessage.value = result;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		// Progress parts render render until some other content shows up, then they hide.
		// When some other content shows up, need to signal to be rerendered as hidden.
		if (followingContent.some(part => part.kind !== 'progressMessage') && !this.isHidden) {
			return false;
		}

		// Needs rerender when spinner state changes
		const showSpinner = shouldShowSpinner(followingContent, element);

		// Needs rerender when content changes
		if (other.kind === 'progressMessage' && other.content.value !== this.currentContent.value) {
			return false;
		}

		return other.kind === 'progressMessage' && this.showSpinner === showSpinner;
	}

	private createApprovalMessage(): IMarkdownString | undefined {
		return this.toolInvocation && getToolApprovalMessage(this.toolInvocation);
	}
}

function shouldShowSpinner(followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
	return isResponseVM(element) && !element.isComplete && followingContent.length === 0;
}


export class ChatProgressSubPart extends Disposable {
	public readonly domNode: HTMLElement;

	constructor(
		messageElement: HTMLElement,
		icon: ThemeIcon,
		tooltip: IMarkdownString | string | undefined,
		@IHoverService hoverService: IHoverService,
	) {
		super();

		this.domNode = $('.progress-container');
		const iconElement = $('div');
		iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
		if (tooltip) {
			this._register(hoverService.setupDelayedHover(iconElement, {
				content: tooltip,
				style: HoverStyle.Pointer,
			}));
		}
		append(this.domNode, iconElement);

		messageElement.classList.add('progress-step');
		append(this.domNode, messageElement);
	}
}

export class ChatWorkingProgressContentPart extends ChatProgressContentPart implements IChatContentPart {
	constructor(
		_workingProgress: { kind: 'working' },
		chatContentMarkdownRenderer: IMarkdownRenderer,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService
	) {
		const progressMessage: IChatProgressMessage = {
			kind: 'progressMessage',
			content: new MarkdownString().appendText(localize('workingMessage', "Working..."))
		};
		super(progressMessage, chatContentMarkdownRenderer, context, undefined, undefined, undefined, undefined, instantiationService, chatMarkdownAnchorService, configurationService);
		this.domNode.classList.add('working-progress');
		this._register(languageModelToolsService.onDidPrepareToolCallBecomeUnresponsive(e => {
			if (isEqual(context.element.sessionResource, e.sessionResource)) {
				this.updateMessage(new MarkdownString(localize('toolCallUnresponsive', "Waiting for tool '{0}' to respond...", e.toolData.displayName)));
			}
		}));
	}

	override hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'working';
	}
}
