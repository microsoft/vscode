/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Button, ButtonWithDropdown, IButton } from '../../../../../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Action, Separator } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import Severity from '../../../../../../base/common/severity.js';
import { basename } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IChatPlanApprovalAction, IChatPlanReview, IChatPlanReviewResult } from '../../../common/chatService/chatService.js';
import { ChatPlanReviewData } from '../../../common/model/chatProgressTypes/chatPlanReviewData.js';
import { IChatRendererContent, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import './media/chatPlanReview.css';

export interface IChatPlanReviewPartOptions {
	onSubmit: (result: IChatPlanReviewResult) => void;
}

export class ChatPlanReviewPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private readonly _buttonStore = this._register(new DisposableStore());
	private readonly _messageContentDisposables = this._register(new MutableDisposable<DisposableStore>());

	private readonly _titleActionsEl: HTMLElement;
	private readonly _inlineActionsEl: HTMLElement;
	private readonly _footerButtonsEl: HTMLElement;
	private readonly _messageEl: HTMLElement;
	private readonly _messageScrollable: DomScrollableElement;
	private readonly _collapseButton: Button;
	private readonly _restoreButton: Button;

	private _isCollapsed = false;
	private _isExpanded = false;
	private _isSubmitted = false;
	private _selectedAction: IChatPlanApprovalAction;
	private _feedbackTextarea: HTMLTextAreaElement | undefined;
	private _feedbackSection: HTMLElement | undefined;
	private _isFeedbackMode = false;

	constructor(
		public readonly review: IChatPlanReview,
		context: IChatContentPartRenderContext,
		private readonly _options: IChatPlanReviewPartOptions,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IEditorService private readonly _editorService: IEditorService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();

		this._selectedAction = review.actions.find(a => a.default) ?? review.actions[0];

		if (review instanceof ChatPlanReviewData && typeof review.draftCollapsed === 'boolean') {
			this._isCollapsed = review.draftCollapsed;
		}

		const isResponseComplete = isResponseVM(context.element) && context.element.isComplete;
		this._isSubmitted = !!review.isUsed || isResponseComplete;

		// Build DOM that mirrors chat-confirmation-widget2 so we inherit its
		// styling (title bar, scrollable message, blue/grey button row).
		const elements = dom.h('.chat-confirmation-widget-container.chat-plan-review-container@container', [
			dom.h('.chat-confirmation-widget2.chat-plan-review@root', [
				dom.h('.chat-confirmation-widget-title.chat-plan-review-title@title', [
					dom.h('.chat-plan-review-title-label@titleLabel'),
					dom.h('.chat-plan-review-inline-actions@inlineActions'),
					dom.h('.chat-plan-review-title-actions@titleActions'),
				]),
				dom.h('.chat-confirmation-widget-message.chat-plan-review-body@message'),
				dom.h('.chat-plan-review-feedback@feedback'),
				dom.h('.chat-confirmation-widget-buttons.chat-plan-review-footer', [
					dom.h('.chat-buttons@footerButtons'),
				]),
			]),
		]);

		this.domNode = elements.container;
		this.domNode.id = generateUuid();
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-label', localize('chat.planReview.ariaLabel', 'Plan review: {0}', review.title));

		this._titleActionsEl = elements.titleActions;
		this._inlineActionsEl = elements.inlineActions;
		this._footerButtonsEl = elements.footerButtons;
		this._messageEl = elements.message;

		// Title label + hover for truncated titles.
		elements.titleLabel.textContent = review.title;
		this._register(this._hoverService.setupDelayedHover(elements.titleLabel, { content: review.title }));

		// Optional Edit button.
		if (review.planUri) {
			const fileName = basename(URI.revive(review.planUri));
			const editButton = this._register(new Button(this._titleActionsEl, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: localize('chat.planReview.editTooltip', 'Edit {0}', fileName) }));
			editButton.element.classList.add('chat-plan-review-title-button', 'chat-plan-review-edit');
			editButton.label = `$(${Codicon.edit.id}) ${localize('chat.planReview.edit', 'Edit {0}', fileName)}`;
			this._register(editButton.onDidClick(() => this.openPlanFile()));
		}

		// Restore/expand toggle.
		this._restoreButton = this._register(new Button(this._titleActionsEl, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		this._restoreButton.element.classList.add('chat-plan-review-title-button', 'chat-plan-review-title-icon-button');
		this._register(this._restoreButton.onDidClick(() => this.toggleExpanded()));

		// Chevron collapse toggle.
		this._collapseButton = this._register(new Button(this._titleActionsEl, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		this._collapseButton.element.classList.add('chat-plan-review-title-button', 'chat-plan-review-title-icon-button');
		this._register(this._collapseButton.onDidClick(() => this.toggleCollapsed()));

		// Scrollable message area (markdown).
		const messageParent = this._messageEl.parentElement!;
		const messageNextSibling = this._messageEl.nextSibling;
		this._messageScrollable = this._register(new DomScrollableElement(this._messageEl, {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Hidden,
			consumeMouseWheelIfScrollbarIsNeeded: true,
		}));
		this._messageScrollable.getDomNode().classList.add('chat-confirmation-widget-message-scrollable', 'chat-plan-review-body-scrollable');
		messageParent.insertBefore(this._messageScrollable.getDomNode(), messageNextSibling);
		const resizeObserver = this._register(new dom.DisposableResizeObserver(() => this._messageScrollable.scanDomNode()));
		this._register(resizeObserver.observe(this._messageEl));
		this._register(resizeObserver.observe(this._messageScrollable.getDomNode()));

		this.renderMarkdown();

		if (review.canProvideFeedback) {
			this.renderFeedback(elements.feedback);
			this._feedbackSection = elements.feedback;
			dom.hide(elements.feedback); // Hidden until user clicks "Provide Feedback"
		} else {
			dom.hide(elements.feedback);
		}

		this.renderActionButtons(
			this._isCollapsed ? this._inlineActionsEl : this._footerButtonsEl,
			{ includeReject: !this._isCollapsed },
		);

		this.updateCollapsedPresentation();
		this.updateExpandedPresentation();

		if (this._isSubmitted) {
			this.domNode.classList.add('chat-plan-review-used');
		}

		if (this._feedbackTextarea && review instanceof ChatPlanReviewData && review.draftFeedback) {
			this._feedbackTextarea.value = review.draftFeedback;
		}
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		if (other.kind !== 'planReview') {
			return false;
		}
		if (!!other.isUsed !== !!this.review.isUsed) {
			return false;
		}
		if (this.review.resolveId && other.resolveId) {
			return this.review.resolveId === other.resolveId;
		}
		return other === this.review;
	}

	private renderMarkdown(): void {
		dom.clearNode(this._messageEl);
		const store = new DisposableStore();
		const rendered = store.add(this._markdownRendererService.render(
			new MarkdownString(this.review.content, { supportThemeIcons: true, isTrusted: false }),
			{ asyncRenderCallback: () => this._messageScrollable.scanDomNode() }
		));
		this._messageEl.append(rendered.element);
		this._messageContentDisposables.value = store;
		this._messageScrollable.scanDomNode();
	}

	private renderFeedback(section: HTMLElement): void {
		dom.clearNode(section);
		const label = dom.append(section, dom.$('.chat-plan-review-feedback-label'));
		label.textContent = localize('chat.planReview.feedbackLabel', 'Additional feedback');

		const textarea = dom.append(section, dom.$<HTMLTextAreaElement>('textarea.chat-plan-review-feedback-textarea'));
		textarea.rows = 1;
		textarea.placeholder = localize('chat.planReview.feedbackPlaceholder', 'Suggest changes or add instructions...');
		this._feedbackTextarea = textarea;

		// Matches the behaviour of the question carousel freeform textarea:
		// grow to fit content, capped via CSS `max-height`.
		const autoResize = () => {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight}px`;
			this._onDidChangeHeight.fire();
		};

		this._register(dom.addDisposableListener(textarea, dom.EventType.INPUT, () => {
			autoResize();
			if (this.review instanceof ChatPlanReviewData) {
				this.review.draftFeedback = textarea.value;
			}
		}));

		// Enter submits feedback; Shift+Enter inserts a newline.
		this._register(dom.addDisposableListener(textarea, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const ev = new StandardKeyboardEvent(e);
			if (ev.keyCode === KeyCode.Enter && !ev.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				this.submitFeedback();
			}
		}));
	}

	private renderActionButtons(container: HTMLElement, options?: { includeReject?: boolean }): void {
		const includeReject = options?.includeReject ?? true;
		this._buttonStore.clear();
		dom.clearNode(container);

		// In feedback mode, show Submit + Reject.
		if (this._isFeedbackMode) {
			const submitButton = new Button(container, { ...defaultButtonStyles, supportIcons: true });
			submitButton.label = localize('chat.planReview.submitFeedback', 'Submit');
			this._buttonStore.add(submitButton);
			this._buttonStore.add(submitButton.onDidClick(() => this.submitFeedback()));

			if (includeReject) {
				const rejectButton = new Button(container, { ...defaultButtonStyles, secondary: true });
				rejectButton.label = localize('chat.planReview.reject', 'Reject');
				this._buttonStore.add(rejectButton);
				this._buttonStore.add(rejectButton.onDidClick(() => this.submitRejection()));
			}
			return;
		}

		// Approve button first (blue). Uses ButtonWithDropdown when there are
		// extra actions; otherwise a plain Button.
		const primary = this._selectedAction;
		const moreActions = this.review.actions.filter(a => a !== primary);

		let approveButton: IButton;
		if (moreActions.length > 0) {
			approveButton = new ButtonWithDropdown(container, {
				...defaultButtonStyles,
				supportIcons: true,
				contextMenuProvider: this._contextMenuService,
				addPrimaryActionToDropdown: false,
				actions: moreActions.map(action => {
					const button = new Action(
						action.label,
						action.label,
						undefined,
						true,
						() => {
							this.submitApproval(action);
							return Promise.resolve();
						},
					);
					button.tooltip = action.description || '';
					return this._buttonStore.add(button);
				}) as (Action | Separator)[],
			});
		} else {
			approveButton = new Button(container, { ...defaultButtonStyles, supportIcons: true });
		}
		this._buttonStore.add(approveButton);
		approveButton.label = primary.label;
		if (primary.description) {
			approveButton.element.title = primary.description;
		}
		this._buttonStore.add(approveButton.onDidClick(() => this.submitApproval(primary)));

		// Provide Feedback button (grey secondary) — shown only when feedback
		// is enabled and we are not in collapsed mode.
		if (this.review.canProvideFeedback && includeReject) {
			const feedbackButton = new Button(container, { ...defaultButtonStyles, secondary: true });
			feedbackButton.label = localize('chat.planReview.provideFeedback', 'Provide Feedback');
			this._buttonStore.add(feedbackButton);
			this._buttonStore.add(feedbackButton.onDidClick(() => this.enterFeedbackMode()));
		}

		// Reject button (grey secondary) after the approve button — omitted in
		// the collapsed title bar (parity with chatToolConfirmationCarouselPart
		// which only surfaces the primary action when collapsed).
		if (includeReject) {
			const rejectButton = new Button(container, { ...defaultButtonStyles, secondary: true });
			rejectButton.label = localize('chat.planReview.reject', 'Reject');
			this._buttonStore.add(rejectButton);
			this._buttonStore.add(rejectButton.onDidClick(() => this.submitRejection()));
		}
	}

	private toggleCollapsed(): void {
		this._isCollapsed = !this._isCollapsed;
		if (this._isCollapsed) {
			this._isExpanded = false;
		}
		if (this.review instanceof ChatPlanReviewData) {
			this.review.draftCollapsed = this._isCollapsed;
		}
		this.updateCollapsedPresentation();
		this.updateExpandedPresentation();
		this._onDidChangeHeight.fire();
	}

	private toggleExpanded(): void {
		if (this._isCollapsed) {
			this._isCollapsed = false;
			this.updateCollapsedPresentation();
		}
		this._isExpanded = !this._isExpanded;
		this.updateExpandedPresentation();
		this._onDidChangeHeight.fire();
	}

	private updateCollapsedPresentation(): void {
		this.domNode.classList.toggle('chat-plan-review-collapsed', this._isCollapsed);
		this._collapseButton.label = this._isCollapsed
			? `$(${Codicon.chevronDown.id})`
			: `$(${Codicon.chevronUp.id})`;
		const collapseTooltip = this._isCollapsed
			? localize('chat.planReview.expand', 'Expand')
			: localize('chat.planReview.collapse', 'Collapse');
		this._collapseButton.element.setAttribute('aria-label', collapseTooltip);
		this._collapseButton.element.setAttribute('aria-expanded', String(!this._isCollapsed));
		this._collapseButton.setTitle(collapseTooltip);

		// Move the action buttons between the footer and the inline title
		// slot so the user can approve while collapsed. Reject is omitted in
		// the collapsed view (matches chatToolConfirmationCarouselPart).
		if (!this._isSubmitted) {
			if (this._isCollapsed && this._isFeedbackMode) {
				this._isFeedbackMode = false;
				if (this._feedbackSection) {
					dom.hide(this._feedbackSection);
				}
			}
			const target = this._isCollapsed ? this._inlineActionsEl : this._footerButtonsEl;
			const other = this._isCollapsed ? this._footerButtonsEl : this._inlineActionsEl;
			dom.clearNode(other);
			this.renderActionButtons(target, { includeReject: !this._isCollapsed });
		}
	}

	private updateExpandedPresentation(): void {
		this.domNode.classList.toggle('chat-plan-review-expanded', this._isExpanded && !this._isCollapsed);
		this._restoreButton.label = this._isExpanded
			? `$(${Codicon.screenNormal.id})`
			: `$(${Codicon.screenFull.id})`;
		const tooltip = this._isExpanded
			? localize('chat.planReview.restoreSize', 'Restore Size')
			: localize('chat.planReview.expandSize', 'Expand');
		this._restoreButton.element.setAttribute('aria-label', tooltip);
		this._restoreButton.setTitle(tooltip);
		this._messageScrollable.scanDomNode();
	}

	private async openPlanFile(): Promise<void> {
		if (!this.review.planUri) {
			return;
		}
		const uri = URI.revive(this.review.planUri);
		await this._editorService.openEditor({ resource: uri });
	}

	private async submitApproval(action: IChatPlanApprovalAction): Promise<void> {
		if (this._isSubmitted) {
			return;
		}
		if (action.permissionLevel === 'autopilot') {
			const confirmed = await this.confirmAutopilot();
			if (!confirmed) {
				return;
			}
		}
		this._isSubmitted = true;
		this._options.onSubmit({ action: action.label, rejected: false });
		this.markUsed();
	}

	private submitRejection(): void {
		if (this._isSubmitted) {
			return;
		}
		this._isSubmitted = true;
		this._options.onSubmit({ rejected: true });
		this.markUsed();
	}

	private enterFeedbackMode(): void {
		this._isFeedbackMode = true;
		if (this._feedbackSection) {
			dom.show(this._feedbackSection);
		}
		this.renderActionButtons(this._footerButtonsEl, { includeReject: true });
		this._feedbackTextarea?.focus();
		this._onDidChangeHeight.fire();
	}

	private submitFeedback(): void {
		if (this._isSubmitted) {
			return;
		}
		const feedback = this._feedbackTextarea?.value.trim();
		if (!feedback) {
			return;
		}
		this._isSubmitted = true;
		this._options.onSubmit({ rejected: false, feedback });
		this.markUsed();
	}

	private async confirmAutopilot(): Promise<boolean> {
		const result = await this._dialogService.prompt({
			type: Severity.Warning,
			message: localize('chat.planReview.autopilot.title', 'Enable Autopilot?'),
			buttons: [
				{
					label: localize('chat.planReview.autopilot.confirm', 'Enable'),
					run: () => true
				},
				{
					label: localize('chat.planReview.autopilot.cancel', 'Cancel'),
					run: () => false
				},
			],
			custom: {
				icon: Codicon.rocket,
				markdownDetails: [{
					markdown: new MarkdownString(localize('chat.planReview.autopilot.detail', 'Autopilot will auto-approve all tool calls and continue working autonomously until the task is complete. This includes terminal commands, file edits, and external tool calls. The agent will make decisions on your behalf without asking for confirmation.\n\nYou can stop the agent at any time by clicking the stop button. This applies to the current session only.')),
				}],
			},
		});
		return result.result === true;
	}

	private markUsed(): void {
		this.domNode.classList.add('chat-plan-review-used');
		this._buttonStore.clear();
		if (this._feedbackTextarea) {
			this._feedbackTextarea.disabled = true;
		}
	}
}
