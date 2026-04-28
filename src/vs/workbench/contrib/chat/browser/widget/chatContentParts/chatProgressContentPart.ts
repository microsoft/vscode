/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../../base/browser/dom.js';
import { IRenderedMarkdown, renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { alert } from '../../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString, type IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { stripIcons } from '../../../../../../base/common/iconLabels.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../../../nls.js';
import { IChatProgressMessage, IChatTask, IChatTaskSerialized, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { IChatRendererContent, IChatWorkingProgress, IChatWorkingProgressState, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { renderFileWidgets } from './chatInlineAnchorWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { getToolApprovalMessage } from './toolInvocationParts/chatToolPartUtilities.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { AccessibilityWorkbenchSettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { HoverStyle } from '../../../../../../base/browser/ui/hover/hover.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { buildPhrasePool, defaultThinkingMessages } from './chatThinkingContentPart.js';

export class ChatProgressContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly showSpinner: boolean;
	private readonly isHidden: boolean;
	private readonly renderedMessage = this._register(new MutableDisposable<IRenderedMarkdown>());
	private readonly _fileWidgetStore = this._register(new DisposableStore());
	private currentContent: IMarkdownString;

	constructor(
		progress: IChatProgressMessage | IChatTask | IChatTaskSerialized | { content: IMarkdownString },
		private readonly chatContentMarkdownRenderer: IMarkdownRenderer,
		context: IChatContentPartRenderContext,
		forceShowSpinner: boolean | undefined,
		forceShowMessage: boolean | undefined,
		icon: ThemeIcon | undefined,
		private readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized | undefined,
		shimmer: boolean | undefined,
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

		if (this.showSpinner && this.configurationService.getValue(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates)) {
			// this step is in progress, communicate it to SR users
			alert(stripIcons(renderAsPlaintext(progress.content)));
		}
		const isLoadingIcon = icon && ThemeIcon.isEqual(icon, ThemeIcon.modify(Codicon.loading, 'spin'));
		// Even if callers request shimmer, only the active (spinner-visible) progress row should animate.
		const useShimmer = (shimmer ?? (!icon || isLoadingIcon)) && this.showSpinner;
		// if we have shimmer, don't show spinner
		const codicon = useShimmer ? Codicon.check : (icon ?? (this.showSpinner ? ThemeIcon.modify(Codicon.loading, 'spin') : Codicon.check));
		const result = this.chatContentMarkdownRenderer.render(progress.content);
		result.element.classList.add('progress-step');
		renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._fileWidgetStore);

		const tooltip: IMarkdownString | undefined = this.createApprovalMessage();
		const progressPart = this._register(instantiationService.createInstance(ChatProgressSubPart, result.element, codicon, tooltip));
		this.domNode = progressPart.domNode;
		if (useShimmer) {
			this.domNode.classList.add('shimmer-progress');
		}
		this.renderedMessage.value = result;
	}

	updateMessage(content: IMarkdownString): void {
		if (this.isHidden) {
			return;
		}

		// Render the new message
		const result = this._register(this.chatContentMarkdownRenderer.render(content));
		result.element.classList.add('progress-step');
		this._fileWidgetStore.clear();
		renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._fileWidgetStore);

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
			this._register(hoverService.setupDelayedHover(messageElement, {
				content: tooltip,
				style: HoverStyle.Pointer,
			}));
		}
		append(this.domNode, iconElement);

		messageElement.classList.add('progress-step');
		append(this.domNode, messageElement);
	}
}

export class ChatWorkingProgressContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;
	private readonly labelElement: HTMLElement;
	private readonly statsElement: HTMLElement;
	private explicitContent: IMarkdownString | undefined;
	private readonly label: string;
	private readonly hasState: boolean;
	private readonly isCompleteState: boolean;

	constructor(
		workingProgress: IChatWorkingProgress,
		chatContentMarkdownRenderer: IMarkdownRenderer,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super();
		this.explicitContent = workingProgress.content;
		const persistentProgressEnabled = configurationService.getValue<boolean>(ChatConfiguration.ChatPersistentProgressEnabled) !== false
			&& (configurationService.getValue<boolean>(ChatConfiguration.ProgressBorder) !== true || accessibilityService.isMotionReduced());
		if (persistentProgressEnabled) {
			const pool = buildPhrasePool(defaultThinkingMessages, configurationService);
			this.label = pool[Math.floor(Math.random() * pool.length)];
		} else {
			this.label = localize('workingMessage', "Working");
		}

		// Build the DOM
		this.domNode = $('.progress-container');
		const iconElement = $('div');
		const state = workingProgress.state;
		this.hasState = !!state;
		const isComplete = state?.isComplete ?? false;
		this.isCompleteState = isComplete;

		if (isComplete) {
			iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
		} else {
			iconElement.classList.add(...ThemeIcon.asClassNameArray(ThemeIcon.modify(Codicon.loading, 'spin')));
		}
		append(this.domNode, iconElement);

		// Structure: .progress-container > .rendered-markdown.progress-step.chat-working-progress-step > p (shimmered label) + span (stats, no shimmer)
		const messageContainer = $('div.rendered-markdown.progress-step.chat-working-progress-step');
		this.labelElement = $('p');
		this.statsElement = $('span');
		append(messageContainer, this.labelElement);
		append(messageContainer, this.statsElement);
		append(this.domNode, messageContainer);

		if (!isComplete) {
			this.domNode.classList.add('shimmer-progress');
		}

		if (state) {
			this.initializeWithState(state);
		} else {
			// No state provided - show explicit content or label
			this.labelElement.textContent = this.explicitContent
				? renderAsPlaintext(this.explicitContent)
				: this.label;
		}

		this._register(languageModelToolsService.onDidPrepareToolCallBecomeUnresponsive(e => {
			if (isEqual(context.element.sessionResource, e.sessionResource)) {
				this.updateWorkingContent(new MarkdownString(localize('toolCallUnresponsive', "Waiting for tool '{0}' to respond...", e.toolData.displayName)));
			}
		}));
	}

	private initializeWithState(state: IChatWorkingProgressState): void {
		if (state.isComplete) {
			// Past tense: show final elapsed time and tokens
			this.renderCompletedProgress(state);
		} else {
			// Active: start timer and observe tokens
			this.startLiveProgress(state);
		}
	}

	private renderCompletedProgress(state: IChatWorkingProgressState): void {
		// Stats are intentionally hidden in the minimal shipping version.
	}

	private startLiveProgress(state: IChatWorkingProgressState): void {
		// If explicit content was set (e.g., tool unresponsive), show that; otherwise
		// just show the shimmered working label. Stats are intentionally hidden in
		// the minimal shipping version.
		if (!this.explicitContent) {
			this.labelElement.textContent = this.label;
		}
	}

	updateWorkingContent(content: IMarkdownString): void {
		this.explicitContent = content;
		this.labelElement.textContent = renderAsPlaintext(content);
		this.statsElement.textContent = '';
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		if (other.kind !== 'working') {
			return false;
		}
		if (!!other.state !== this.hasState) {
			return false;
		}
		// Re-render when completion state changes (in-progress to complete)
		if ((other.state?.isComplete ?? false) !== this.isCompleteState) {
			return false;
		}
		return other.content?.value === this.explicitContent?.value;
	}
}
