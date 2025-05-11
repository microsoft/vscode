/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType } from '../../../../../base/browser/dom.js';
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatProgressMessage, IChatTask } from '../../common/chatService.js';
import { IChatRendererContent, IChatWorkingProgress, isResponseVM } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { InlineAnchorWidget } from '../chatInlineAnchorWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';

export class ChatProgressContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly showSpinner: boolean;
	private readonly isHidden: boolean;

	constructor(
		progress: IChatProgressMessage | IChatTask,
		renderer: MarkdownRenderer,
		context: IChatContentPartRenderContext,
		forceShowSpinner: boolean | undefined,
		forceShowMessage: boolean | undefined,
		icon: ThemeIcon | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
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

		if (this.showSpinner) {
			// TODO@roblourens is this the right place for this?
			// this step is in progress, communicate it to SR users
			alert(progress.content.value);
		}
		const codicon = icon ? icon : this.showSpinner ? ThemeIcon.modify(Codicon.loading, 'spin') : Codicon.check;
		const result = this._register(renderer.render(progress.content));
		result.element.classList.add('progress-step');
		this.renderFileWidgets(result.element);

		this.domNode = $('.progress-container');
		const iconElement = $('div');
		iconElement.classList.add(...ThemeIcon.asClassNameArray(codicon));
		append(this.domNode, iconElement);
		append(this.domNode, result.element);
	}

	private renderFileWidgets(element: HTMLElement): void {
		const links = element.querySelectorAll('a');
		links.forEach(a => {
			// Empty link text -> render file widget
			if (!a.textContent?.trim()) {
				const href = a.getAttribute('data-href');
				const uri = href ? URI.parse(href) : undefined;
				if (uri?.scheme) {
					const widget = this._register(this.instantiationService.createInstance(InlineAnchorWidget, a, { kind: 'inlineReference', inlineReference: uri }));
					this._register(this.chatMarkdownAnchorService.register(widget));
				}
			}
		});
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

export class ChatWorkingProgressContentPart extends ChatProgressContentPart implements IChatContentPart {
	constructor(
		private readonly workingProgress: IChatWorkingProgress,
		renderer: MarkdownRenderer,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService chatMarkdownAnchorService: IChatMarkdownAnchorService,
	) {
		const progressMessage: IChatProgressMessage = {
			kind: 'progressMessage',
			content: workingProgress.isPaused ?
				new MarkdownString().appendText(localize('pausedMessage', "Paused")) :
				new MarkdownString().appendText(localize('workingMessage', "Working..."))
		};
		super(progressMessage, renderer, context, undefined, undefined, workingProgress.isPaused ? Codicon.debugPause : undefined, instantiationService, chatMarkdownAnchorService);

		if (workingProgress.isPaused) {
			this.domNode.style.cursor = 'pointer';
			this.domNode.title = localize('resume', "Click to resume");
			this._register(addDisposableListener(this.domNode, EventType.CLICK, () => {
				workingProgress.setPaused(false);
			}));
		}
	}

	override hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'working' && this.workingProgress.isPaused === other.isPaused;
	}
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
