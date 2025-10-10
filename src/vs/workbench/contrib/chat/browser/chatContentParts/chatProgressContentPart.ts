/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IMarkdownRenderer } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IRenderedMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../../nls.js';
import { IChatProgressMessage, IChatTask, IChatTaskSerialized } from '../../common/chatService.js';
import { IChatRendererContent, isResponseVM } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { renderFileWidgets } from '../chatInlineAnchorWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { AccessibilityWorkbenchSettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';

export class ChatProgressContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly showSpinner: boolean;
	private readonly isHidden: boolean;
	private readonly renderedMessage = this._register(new MutableDisposable<IRenderedMarkdown>());

	constructor(
		progress: IChatProgressMessage | IChatTask | IChatTaskSerialized,
		private readonly chatContentMarkdownRenderer: IMarkdownRenderer,
		context: IChatContentPartRenderContext,
		forceShowSpinner: boolean | undefined,
		forceShowMessage: boolean | undefined,
		icon: ThemeIcon | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

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

		this.domNode = $('.progress-container');
		const iconElement = $('div');
		iconElement.classList.add(...ThemeIcon.asClassNameArray(codicon));
		append(this.domNode, iconElement);
		append(this.domNode, result.element);
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
		return other.kind === 'progressMessage' && this.showSpinner === showSpinner;
	}
}

function shouldShowSpinner(followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
	return isResponseVM(element) && !element.isComplete && followingContent.length === 0;
}


export class ChatCustomProgressPart {
	public readonly domNode: HTMLElement;

	constructor(
		messageElement: HTMLElement,
		icon: ThemeIcon,
	) {
		this.domNode = $('.progress-container');
		const iconElement = $('div');
		iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
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
		@IConfigurationService configurationService: IConfigurationService
	) {
		const progressMessage: IChatProgressMessage = {
			kind: 'progressMessage',
			content: new MarkdownString().appendText(localize('workingMessage', "Working..."))
		};
		super(progressMessage, chatContentMarkdownRenderer, context, undefined, undefined, undefined, instantiationService, chatMarkdownAnchorService, configurationService);
	}

	override hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'working';
	}
}
