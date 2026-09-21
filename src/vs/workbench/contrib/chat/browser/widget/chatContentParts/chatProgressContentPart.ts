/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, isHTMLElement } from '../../../../../../base/browser/dom.js';
import { IRenderedMarkdown, renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { alert } from '../../../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString, type IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { stripIcons } from '../../../../../../base/common/iconLabels.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { localize } from '../../../../../../nls.js';
import { IChatProgressMessage, IChatTask, IChatTaskSerialized, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { IChatRendererContent, IChatWorkingProgress, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { renderFileWidgets } from './chatInlineAnchorWidget.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { getToolApprovalMessage, isAskQuestionsToolInvocation } from './toolInvocationParts/chatToolPartUtilities.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AccessibilityWorkbenchSettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { HoverStyle } from '../../../../../../base/browser/ui/hover/hover.js';
import { ILanguageModelToolsService } from '../../../common/tools/languageModelToolsService.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { buildPhrasePool, defaultThinkingMessages, maybePickFunWorkingMessage } from './chatThinkingContentPart.js';
import { getChatWorkingProgressIcon, getCompactCodicon } from '../../chatIcons.js';
import { ChatWorkingProgressLogo } from '../chatWorkingLogo.js';

export class ChatProgressContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly showSpinner: boolean;
	private readonly isHidden: boolean;
	private readonly persistentProgress: boolean;
	private useShimmer = false;
	private readonly renderedMessage = this._register(new MutableDisposable<IRenderedMarkdown>());
	private readonly _fileWidgetStore = this._register(new DisposableStore());
	protected currentContent: IMarkdownString;
	protected progressIconElement: HTMLElement | undefined;

	constructor(
		progress: IChatProgressMessage | IChatTask | IChatTaskSerialized | { content: IMarkdownString },
		private readonly chatContentMarkdownRenderer: IMarkdownRenderer,
		context: IChatContentPartRenderContext,
		forceShowSpinner: boolean | undefined,
		forceShowMessage: boolean | undefined,
		icon: ThemeIcon | undefined,
		private readonly toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized | undefined,
		shimmer: boolean | undefined,
		isWorkingProgress: boolean | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this.currentContent = progress.content;
		this.persistentProgress = !!context.suppressProgressShimmer;

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
		const isLoadingIcon = !!icon && ThemeIcon.isEqual(icon, ThemeIcon.modify(Codicon.loading, 'spin'));
		// Even if callers request shimmer, only the active (spinner-visible) progress row should animate.
		this.useShimmer = (!!isWorkingProgress || !context.suppressProgressShimmer)
			&& (shimmer ?? (!icon || isLoadingIcon))
			&& this.showSpinner;
		// The persistent footer owns the in-progress signal, so rows without an explicit icon keep the
		// check they show when shimmering instead of a spinner glyph that would compete with it.
		const fallbackIcon = this.showSpinner && !this.persistentProgress ? ThemeIcon.modify(Codicon.loading, 'spin') : Codicon.check;
		const progressIcon = this.useShimmer && !(isWorkingProgress && this.persistentProgress)
			? Codicon.check
			: (icon ?? fallbackIcon);
		const result = this.chatContentMarkdownRenderer.render(progress.content);
		result.element.classList.add('progress-step');
		renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._fileWidgetStore);
		if (this.useShimmer) {
			syncShimmerPhase(this.applyShimmer(result.element));
		}

		const tooltip: IMarkdownString | undefined = this.createApprovalMessage();
		const progressPart = this._register(instantiationService.createInstance(ChatProgressSubPart, result.element, progressIcon, tooltip));
		this.domNode = progressPart.domNode;
		this.progressIconElement = progressPart.iconElement;
		if (this.useShimmer) {
			this.domNode.classList.add('shimmer-progress');
		}
		this.renderedMessage.value = result;
	}

	/**
	 * Applies the shimmer treatment and returns the elements that actually animate, so their
	 * animation phase can be synced. A partial shimmer wraps only the leading verb in spans;
	 * otherwise the whole message paragraph shimmers.
	 */
	private applyShimmer(element: HTMLElement): readonly HTMLElement[] {
		const firstChild = element.firstElementChild;
		const messageElement = isHTMLElement(firstChild) && firstChild.tagName === 'P' ? firstChild : element;
		const boundary = this.toolInvocation ? this.computeShimmerBoundary(messageElement) : -1;
		if (boundary <= 0) {
			return [messageElement];
		}

		element.classList.add('chat-progress-partial-shimmer');
		return this.wrapLeadingText(messageElement, boundary);
	}

	/**
	 * How many leading characters of the progress message should shimmer. Ask-question rows
	 * shimmer everything before the ` (` summary; streaming rows shimmer only the stable leading
	 * verb so moving parts (line counts, file names) stay still. Non-positive skips partial shimmer.
	 */
	private computeShimmerBoundary(messageElement: HTMLElement): number {
		if (isAskQuestionsToolInvocation(this.toolInvocation!)) {
			return messageElement.textContent?.indexOf(' (') ?? -1;
		}
		if (IChatToolInvocation.isStreaming(this.toolInvocation!)) {
			return leadingStableTextLength(messageElement);
		}
		return -1;
	}

	private wrapLeadingText(element: HTMLElement, length: number): HTMLElement[] {
		const spans: HTMLElement[] = [];
		let remaining = length;
		const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		while (remaining > 0) {
			const node = walker.nextNode();
			if (!node) {
				return spans;
			}

			const text = node.nodeValue ?? '';
			if (!text) {
				continue;
			}

			const shimmerText = text.slice(0, remaining);
			const suffixText = text.slice(remaining);
			const span = $<HTMLSpanElement>('span');
			span.classList.add('chat-progress-shimmer-text');
			span.textContent = shimmerText;
			node.parentNode?.insertBefore(span, node);
			if (suffixText) {
				node.nodeValue = suffixText;
			} else {
				node.parentNode?.removeChild(node);
			}
			spans.push(span);
			remaining -= shimmerText.length;
		}
		return spans;
	}

	updateMessage(content: IMarkdownString): void {
		if (this.isHidden) {
			return;
		}

		if (this.persistentProgress) {
			this.currentContent = content;
		}
		// Render the new message
		const previousElement = this.renderedMessage.value?.element;
		const result = this.chatContentMarkdownRenderer.render(content);
		this.renderedMessage.value = result;
		result.element.classList.add('progress-step');
		this._fileWidgetStore.clear();
		renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._fileWidgetStore);
		if (this.persistentProgress && this.useShimmer) {
			syncShimmerPhase(this.applyShimmer(result.element));
		}

		// Replace the old message container with the new one
		if (previousElement?.parentElement) {
			previousElement.replaceWith(result.element);
		} else {
			this.domNode.appendChild(result.element);
		}
	}

	protected setShimmerActive(active: boolean): void {
		if (this.useShimmer === active) {
			return;
		}

		this.useShimmer = active;
		this.domNode.classList.toggle('shimmer-progress', active);
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

/**
 * Length of the leading, non-moving portion of a streaming progress message — the verb before
 * the first digit, `(`, or inline element (e.g. a file anchor). Trailing whitespace is excluded
 * so the shimmer ends on the word rather than the gap before the static suffix.
 */
function leadingStableTextLength(messageElement: HTMLElement): number {
	const fullText = messageElement.textContent ?? '';
	let length = 0;
	for (const node of messageElement.childNodes) {
		if (node.nodeType === Node.TEXT_NODE) {
			const nodeText = node.nodeValue ?? '';
			const movingPart = /[(\d]/.exec(nodeText);
			if (movingPart) {
				length += movingPart.index;
				break;
			}
			length += nodeText.length;
		} else {
			break;
		}
	}
	while (length > 0 && /\s/.test(fullText[length - 1])) {
		length--;
	}
	return length;
}

const SHIMMER_ANIMATION_DURATION_MS = 2000;
const shimmerEpochMs = Date.now();

/**
 * Aligns freshly-rendered shimmer elements to a shared timeline via a negative `animation-delay`.
 * Streaming progress recreates its DOM on every update, which would otherwise restart the CSS
 * animation from 0% and make the sweep appear frozen; a phase offset keeps it continuous.
 */
function syncShimmerPhase(animatedElements: readonly HTMLElement[]): void {
	const animationDelay = `-${(Date.now() - shimmerEpochMs) % SHIMMER_ANIMATION_DURATION_MS}ms`;
	for (const element of animatedElements) {
		element.style.animationDelay = animationDelay;
	}
}

export class ChatProgressSubPart extends Disposable {
	public readonly domNode: HTMLElement;
	public readonly iconElement: HTMLElement;

	constructor(
		messageElement: HTMLElement,
		icon: ThemeIcon,
		tooltip: IMarkdownString | string | undefined,
		@IHoverService hoverService: IHoverService,
	) {
		super();

		this.domNode = $('.progress-container');
		this.iconElement = $('div');
		this.iconElement.classList.add(...ThemeIcon.asClassNameArray(getCompactCodicon(icon)));
		if (tooltip) {
			this._register(hoverService.setupDelayedHover(this.iconElement, {
				content: tooltip,
				style: HoverStyle.Pointer,
			}));
			this._register(hoverService.setupDelayedHover(messageElement, {
				content: tooltip,
				style: HoverStyle.Pointer,
			}));
		}
		append(this.domNode, this.iconElement);

		messageElement.classList.add('progress-step');
		append(this.domNode, messageElement);
	}
}

const WORKING_LABEL_MIN_DWELL_MS = 1200;
const lastPickedWorkingLabelByElement = new WeakMap<ChatTreeItem, { label: string; pickedAt: number; progressStep?: number }>();
const lastPickedLegacyWorkingLabelByElement = new Map<string, { label: string; pickedAt: number }>();

function pickLegacyWorkingLabel(elementId: string, configurationService: IConfigurationService): string {
	const now = Date.now();
	for (const [id, entry] of lastPickedLegacyWorkingLabelByElement) {
		if (now - entry.pickedAt >= WORKING_LABEL_MIN_DWELL_MS) {
			lastPickedLegacyWorkingLabelByElement.delete(id);
		}
	}
	const existing = lastPickedLegacyWorkingLabelByElement.get(elementId);
	if (existing && now - existing.pickedAt < WORKING_LABEL_MIN_DWELL_MS) {
		existing.pickedAt = now;
		return existing.label;
	}
	const fun = maybePickFunWorkingMessage(configurationService);
	const label = fun ?? (() => {
		const pool = buildPhrasePool(defaultThinkingMessages, configurationService);
		return pool[Math.floor(Math.random() * pool.length)];
	})();
	lastPickedLegacyWorkingLabelByElement.set(elementId, { label, pickedAt: now });
	return label;
}

/** Keeps labels stable within an activity and gives new phrases a minimum dwell time. */
export function pickWorkingLabel(element: ChatTreeItem, configurationService: IConfigurationService, progressStep?: number): string {
	if (progressStep === undefined) {
		return pickLegacyWorkingLabel(element.id, configurationService);
	}
	const now = Date.now();
	const existing = lastPickedWorkingLabelByElement.get(element);
	if (existing) {
		const sameActivity = progressStep !== undefined && existing.progressStep === progressStep;
		existing.progressStep = progressStep;
		if (sameActivity || now - existing.pickedAt < WORKING_LABEL_MIN_DWELL_MS) {
			return existing.label;
		}
	}

	const fun = maybePickFunWorkingMessage(configurationService);
	const label = fun && fun !== existing?.label ? fun : (() => {
		const pool = buildPhrasePool(defaultThinkingMessages, configurationService);
		const alternatives = pool.filter(label => label !== existing?.label);
		const candidates = alternatives.length ? alternatives : pool;
		return candidates[Math.floor(Math.random() * candidates.length)];
	})();
	lastPickedWorkingLabelByElement.set(element, { label, pickedAt: now, progressStep });
	return label;
}

export class ChatWorkingProgressContentPart extends ChatProgressContentPart implements IChatContentPart {
	private explicitContent: IMarkdownString | undefined;
	private isActive: boolean;
	private readonly contextElement: ChatTreeItem;
	private readonly workingLogo: ChatWorkingProgressLogo | undefined;

	constructor(
		workingProgress: IChatWorkingProgress,
		chatContentMarkdownRenderer: IMarkdownRenderer,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@IConfigurationService private readonly workingConfigurationService: IConfigurationService,
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService,
		@IProductService productService: IProductService,
	) {
		const explicitContent = workingProgress.content;
		const isActive = workingProgress.isActive ?? true;
		const isInsiders = productService.quality === 'insider';
		const progressMessage: IChatProgressMessage = {
			kind: 'progressMessage',
			content: explicitContent ?? new MarkdownString().appendText(pickWorkingLabel(context.element, workingConfigurationService))
		};
		super(progressMessage, chatContentMarkdownRenderer, context,
			context.suppressProgressShimmer ? isActive : undefined,
			context.suppressProgressShimmer ? true : undefined,
			context.suppressProgressShimmer ? getChatWorkingProgressIcon(productService.quality) : undefined,
			undefined,
			context.suppressProgressShimmer ? isActive : true,
			context.suppressProgressShimmer ? true : undefined,
			instantiationService, chatMarkdownAnchorService, workingConfigurationService);
		if (context.suppressProgressShimmer) {
			this.domNode.classList.add('chat-working-progress');
			this.domNode.classList.toggle('chat-working-progress-active', isActive);
			if (!this.progressIconElement) {
				throw new Error('Working progress requires an icon container');
			}
			this.progressIconElement.classList.add('chat-progress-icon', isInsiders ? 'chat-working-progress-icon-insiders' : 'chat-working-progress-icon-stable');
			this.progressIconElement.setAttribute('aria-hidden', 'true');
			this.workingLogo = this._register(instantiationService.createInstance(ChatWorkingProgressLogo, isInsiders ? 'insider' : 'stable'));
			this.workingLogo.domNode.classList.add('chat-working-logo-compact');
			this.workingLogo.setActive(isActive);
			this.progressIconElement.appendChild(this.workingLogo.domNode);
		}
		this.explicitContent = explicitContent;
		this.isActive = isActive;
		this.contextElement = context.element;

		this._register(languageModelToolsService.onDidPrepareToolCallBecomeUnresponsive(e => {
			if (isEqual(context.element.sessionResource, e.sessionResource)) {
				this.updateMessage(new MarkdownString(localize('toolCallUnresponsive', "Waiting for tool '{0}' to respond...", e.toolData.displayName)));
			}
		}));
	}

	get workingLabel(): string {
		return renderAsPlaintext(this.currentContent);
	}

	updateWorkingContent(content: IMarkdownString | undefined, isActive = this.isActive, announce = false): void {
		const resolvedContent = content ?? new MarkdownString().appendText(pickWorkingLabel(this.contextElement, this.workingConfigurationService));
		if (this.workingLogo && content?.value === this.explicitContent?.value && resolvedContent.value === this.currentContent.value && isActive === this.isActive) {
			return;
		}
		// The retained footer swaps its text in place, so a new blocking state ("1 confirmation pending",
		// "Authentication required") must be announced the way a freshly created row would be.
		const shouldAnnounce = announce && !!this.workingLogo && !!content && content.value !== this.explicitContent?.value
			&& this.workingConfigurationService.getValue(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates);
		this.explicitContent = content;
		this.isActive = isActive;
		if (this.workingLogo) {
			this.domNode.classList.toggle('chat-working-progress-active', isActive);
			this.workingLogo.setActive(isActive);
			this.setShimmerActive(isActive);
		}
		this.updateMessage(resolvedContent);
		if (shouldAnnounce) {
			alert(stripIcons(renderAsPlaintext(resolvedContent)));
		}
	}

	override hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'working'
			&& other.content?.value === this.explicitContent?.value
			&& (other.isActive ?? true) === this.isActive;
	}
}
