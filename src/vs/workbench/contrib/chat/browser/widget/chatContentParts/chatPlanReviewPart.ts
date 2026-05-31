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
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import Severity from '../../../../../../base/common/severity.js';
import { basename } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorOptions, ShowLightbulbIconMode } from '../../../../../../editor/common/config/editorOptions.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../../nls.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { IChatPlanApprovalAction, IChatPlanReview, IChatPlanReviewResult } from '../../../common/chatService/chatService.js';
import { IPlanReviewFeedbackItem, IPlanReviewFeedbackService } from '../../planReviewFeedback/planReviewFeedbackService.js';
import { ChatPlanReviewData } from '../../../common/model/chatProgressTypes/chatPlanReviewData.js';
import { IChatRendererContent, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import './media/chatPlanReview.css';

// Sub-path for the embedded editor's in-memory model. Uses `inmemory:` so
// `ITextModelService.createModelReference` resolves without a custom provider.
const PLAN_REVIEW_EDITING_PATH_PREFIX = '/chat-plan-review';

export interface IChatPlanReviewPartOptions {
	onSubmit: (result: IChatPlanReviewResult) => void;
}

export class ChatPlanReviewPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private readonly _buttonStore = this._register(new DisposableStore());
	private _submitButton: Button | undefined;
	private _renderedSubmitInlineCount = -1;
	private readonly _messageContentDisposables = this._register(new MutableDisposable<DisposableStore>());

	private readonly _titleActionsEl: HTMLElement;
	private readonly _inlineActionsEl: HTMLElement;
	private readonly _footerButtonsEl: HTMLElement;
	private readonly _messageEl: HTMLElement;
	private readonly _messageScrollable: DomScrollableElement;
	private readonly _collapseButton: Button;
	private readonly _restoreButton: Button;
	private _reviewButton: Button | undefined;

	private _isCollapsed = false;
	private _isExpanded = false;
	private _isSubmitted = false;
	private _selectedAction: IChatPlanApprovalAction;
	private _feedbackTextarea: HTMLTextAreaElement | undefined;
	private _feedbackSection: HTMLElement | undefined;
	private _commentsListEl: HTMLElement | undefined;
	private _commentsListScrollable: DomScrollableElement | undefined;
	private _clearAllButtonEl: HTMLElement | undefined;
	private _isFeedbackMode = false;
	private readonly _planReviewRegistration = this._register(new MutableDisposable());
	private readonly _commentRowDisposables = this._register(new DisposableStore());
	private _inlineEditorMountId = 0;
	private _suppressFeedbackModeAutoOpen = false;

	// Bound to an in-memory model so typing doesn't dirty the real file's
	// working copy (which would trip `TextFileEditorTracker` into opening it).
	private _messageEditor: CodeEditorWidget | undefined;
	private _editingUri: URI | undefined;
	// Used on feedback submission to skip a no-op write and to update `review.content`.
	private _initialEditorContent: string | undefined;
	private readonly _messageEditorDisposables = this._register(new DisposableStore());

	constructor(
		public readonly review: IChatPlanReview,
		context: IChatContentPartRenderContext,
		private readonly _options: IChatPlanReviewPartOptions,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IEditorService private readonly _editorService: IEditorService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IPlanReviewFeedbackService private readonly _planReviewFeedbackService: IPlanReviewFeedbackService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._selectedAction = review.actions.find(a => a.default) ?? review.actions[0];

		if (review instanceof ChatPlanReviewData && typeof review.draftCollapsed === 'boolean') {
			this._isCollapsed = review.draftCollapsed;
		}

		const isResponseComplete = isResponseVM(context.element) && context.element.isComplete;
		this._isSubmitted = !!review.isUsed || isResponseComplete;

		// Register with the plan review feedback service so the editor
		// contribution can show inline feedback input for this plan file.
		// Subscribe to feedback changes so the comments list and Submit
		// button label stay in sync.
		if (review.planUri && review.canProvideFeedback && !this._isSubmitted) {
			const planUri = URI.revive(review.planUri);
			const planUriString = planUri.toString();
			const registrationStore = new DisposableStore();
			registrationStore.add(this._planReviewFeedbackService.registerPlanReview(planUri, (result) => {
				if (this._isSubmitted) {
					return;
				}
				this._isSubmitted = true;
				this._options.onSubmit(result);
				void this.markUsed();
			}));
			registrationStore.add(this._planReviewFeedbackService.onDidChangeFeedback(uri => {
				// Match the plan URI or the editing URI used while the editor is mounted.
				const uriString = uri.toString();
				if (uriString === planUriString || uriString === this._editingUri?.toString()) {
					this.onInlineFeedbackChanged();
				}
			}));
			this._planReviewRegistration.value = registrationStore;
		}

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

		// Review button — opens the plan file and enters feedback mode.
		if (review.planUri) {
			const fileName = basename(URI.revive(review.planUri));
			const reviewButtonTooltip = review.canProvideFeedback
				? localize('chat.planReview.reviewTooltip', 'Review {0}', fileName)
				: localize('chat.planReview.openTooltip', 'Open {0}', fileName);
			const reviewButton = this._register(new Button(this._titleActionsEl, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: reviewButtonTooltip, ariaLabel: reviewButtonTooltip }));
			reviewButton.element.classList.add('chat-plan-review-title-button', 'chat-plan-review-review-button');
			this._reviewButton = reviewButton;
			this._register(reviewButton.onDidClick(() => {
				if (this._isFeedbackMode) {
					void this.exitFeedbackMode();
				} else {
					void this.enterReviewMode();
				}
			}));
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
		const resizeObserver = this._register(new dom.DisposableResizeObserver('ChatPlanReviewPart.messageScrollable', () => this._messageScrollable.scanDomNode()));
		// The inner `_messageEl` is `height: 100%`, so observing only the
		// wrapper is enough; markdown content reflow is handled by the
		// renderer's `asyncRenderCallback`.
		this._register(resizeObserver.observe(this._messageScrollable.getDomNode()));

		this.renderMarkdown();

		if (review.canProvideFeedback) {
			this.renderFeedback(elements.feedback);
			this._feedbackSection = elements.feedback;
			if (review.planUri) {
				dom.hide(elements.feedback); // Hidden until the user enters review mode or inline feedback exists.
			} else {
				// No plan file: there's no inline editor surface to coordinate
				// with, so we don't toggle into "feedback mode". Instead leave
				// the textarea visible alongside the regular Approve/Reject
				// buttons and let the user optionally type a comment that
				// rides along with whichever action they pick.
				this.domNode.classList.add('chat-plan-review-textarea-mode');
			}
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
			// Match the auto-resize wired up on `input` so a multi-line
			// restored draft renders with the right height.
			this._feedbackTextarea.style.height = 'auto';
			this._feedbackTextarea.style.height = `${this._feedbackTextarea.scrollHeight}px`;
		}

		// Promote into review mode if inline feedback is already present
		// (e.g. restored from a prior session).
		if (!this._isSubmitted && this.getInlineFeedbackItems().length > 0) {
			void this.enterFeedbackMode({ focus: false });
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
		// Parent the store before populating so the leak tracker doesn't flag it.
		const store = new DisposableStore();
		this._messageContentDisposables.value = store;
		const rendered = store.add(this._markdownRendererService.render(
			new MarkdownString(this.review.content, { supportThemeIcons: true, isTrusted: false }),
			{ asyncRenderCallback: () => this._messageScrollable.scanDomNode() }
		));
		this._messageEl.append(rendered.element);
		this._messageScrollable.scanDomNode();
	}

	private renderFeedback(section: HTMLElement): void {
		dom.clearNode(section);
		const header = dom.append(section, dom.$('.chat-plan-review-feedback-header'));
		const label = dom.append(header, dom.$('.chat-plan-review-feedback-label'));
		label.textContent = localize('chat.planReview.feedbackLabel', 'Feedback');

		const headerActions = dom.append(header, dom.$('.chat-plan-review-feedback-header-actions'));

		// Clear All — visibility is toggled with the comments list.
		if (this.review.planUri) {
			const clearAllLabel = localize('chat.planReview.clearAll', "Clear All");
			const clearAllButton = this._register(new Button(headerActions, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: clearAllLabel, ariaLabel: clearAllLabel }));
			clearAllButton.element.classList.add('chat-plan-review-title-button', 'chat-plan-review-feedback-clear-all');
			clearAllButton.label = clearAllLabel;
			this._register(clearAllButton.onDidClick(() => this.clearAllInlineFeedback()));
			this._clearAllButtonEl = clearAllButton.element;
		}

		// Close — non-destructive exit from feedback mode. Per-row × buttons
		// and Clear All handle deletion explicitly.
		if (this.review.planUri) {
			const closeButtonLabel = localize('chat.planReview.close', "Close");
			const closeButton = this._register(new Button(headerActions, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: closeButtonLabel, ariaLabel: closeButtonLabel }));
			closeButton.element.classList.add('chat-plan-review-title-button', 'chat-plan-review-title-icon-button', 'chat-plan-review-feedback-close');
			closeButton.label = `$(${Codicon.close.id})`;
			this._register(closeButton.onDidClick(() => this.exitFeedbackMode()));
		}

		// Inline comments list — wrapped in a Monaco scrollable for a styled
		// scrollbar consistent with the rest of the workbench.
		this._commentsListEl = dom.$('.chat-plan-review-comments-list');
		this._commentsListScrollable = this._register(new DomScrollableElement(this._commentsListEl, {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Hidden,
			consumeMouseWheelIfScrollbarIsNeeded: true,
		}));
		this._commentsListScrollable.getDomNode().classList.add('chat-plan-review-comments-list-scrollable');
		dom.append(section, this._commentsListScrollable.getDomNode());
		dom.hide(this._commentsListScrollable.getDomNode());
		this.renderCommentsList();

		const textarea = dom.append(section, dom.$<HTMLTextAreaElement>('textarea.chat-plan-review-feedback-textarea'));
		textarea.rows = 1;
		textarea.placeholder = localize('chat.planReview.feedbackPlaceholder', 'Add an overall comment for the agent...');
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
			// Auto-resize fires _onDidChangeHeight which can shift sibling
			// layout; rescan so the body's scrollbar geometry stays accurate.
			this._messageScrollable.scanDomNode();
			if (this.review instanceof ChatPlanReviewData) {
				this.review.draftFeedback = textarea.value;
			}
			// Update the cached Submit button rather than re-rendering the
			// whole button row on every keystroke.
			this.updateSubmitButtonState();
		}));

		// Enter submits feedback; Shift+Enter inserts a newline. Only wired
		// up in plan-mode (where Submit Feedback is the primary action).
		// In the no-planUri textarea-only flow the user must explicitly pick
		// Approve or Reject, so Enter falls through to the default newline
		// behaviour to avoid an accidental feedback-only submit.
		if (this.review.planUri) {
			this._register(dom.addDisposableListener(textarea, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				const ev = new StandardKeyboardEvent(e);
				if (ev.keyCode === KeyCode.Enter && !ev.shiftKey) {
					e.preventDefault();
					e.stopPropagation();
					void this.submitFeedback();
				}
			}));
		}
	}

	private renderCommentsList(): void {
		if (!this._commentsListEl) {
			return;
		}
		this._commentRowDisposables.clear();
		dom.clearNode(this._commentsListEl);

		const items = this.getInlineFeedbackItems();
		if (this._clearAllButtonEl) {
			if (items.length > 0) {
				dom.show(this._clearAllButtonEl);
			} else {
				dom.hide(this._clearAllButtonEl);
			}
		}
		const scrollableNode = this._commentsListScrollable?.getDomNode();
		if (items.length === 0) {
			if (scrollableNode) {
				dom.hide(scrollableNode);
			}
			this._commentsListScrollable?.scanDomNode();
			return;
		}
		if (scrollableNode) {
			dom.show(scrollableNode);
		}

		for (const item of items) {
			const row = dom.append(this._commentsListEl, dom.$('.chat-plan-review-comment-row'));
			const rowLabel = localize('chat.planReview.commentRowAriaLabel', 'Line {0}: {1}', item.line, item.text);

			const revealButton = dom.append(row, dom.$<HTMLButtonElement>('button.chat-plan-review-comment-reveal'));
			revealButton.type = 'button';
			revealButton.setAttribute('aria-label', rowLabel);

			const lineEl = dom.append(revealButton, dom.$('span.chat-plan-review-comment-line'));
			lineEl.textContent = localize('chat.planReview.commentRowLine', 'Line {0}', item.line);

			const textEl = dom.append(revealButton, dom.$('span.chat-plan-review-comment-text'));
			textEl.textContent = item.text;

			this._commentRowDisposables.add(dom.addDisposableListener(revealButton, dom.EventType.CLICK, () => {
				this.revealInlineComment(item.id, item.line, item.column);
			}));

			const removeLabel = localize('chat.planReview.removeComment', "Remove comment on line {0}", item.line);
			const removeButton = dom.append(row, dom.$<HTMLButtonElement>('button.chat-plan-review-comment-remove'));
			removeButton.type = 'button';
			removeButton.setAttribute('aria-label', removeLabel);
			removeButton.title = removeLabel;
			removeButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.close));

			this._commentRowDisposables.add(dom.addDisposableListener(removeButton, dom.EventType.CLICK, e => {
				e.stopPropagation();
				this.removeInlineComment(item.id);
			}));
		}
		this._commentsListScrollable?.scanDomNode();
	}

	// Comments can be keyed on the real plan URI or on the in-memory editing URI
	// used by the mounted inline editor.
	private getCommentUri(): URI | undefined {
		if (this._editingUri) {
			return this._editingUri;
		}
		return this.review.planUri ? URI.revive(this.review.planUri) : undefined;
	}

	private getInlineFeedbackItems(): readonly IPlanReviewFeedbackItem[] {
		const editingItems = this._editingUri ? this._planReviewFeedbackService.getFeedback(this._editingUri) : [];
		const planItems = this.review.planUri ? this._planReviewFeedbackService.getFeedback(URI.revive(this.review.planUri)) : [];
		return [...editingItems, ...planItems].sort((first, second) => first.line - second.line || first.column - second.column);
	}

	private async revealInlineComment(itemId: string, line: number, column: number): Promise<void> {
		const uri = this.getCommentUri();
		if (!uri) {
			return;
		}
		this._planReviewFeedbackService.setNavigationAnchor(uri, itemId);
		if (this._messageEditor) {
			this._messageEditor.revealLineInCenterIfOutsideViewport(line);
			this._messageEditor.setPosition({ lineNumber: line, column });
			this._messageEditor.focus();
			return;
		}
		if (this.review.planUri) {
			await this._editorService.openEditor({
				resource: URI.revive(this.review.planUri),
				options: { selection: { startLineNumber: line, startColumn: column } },
			});
		}
	}

	private removeInlineComment(itemId: string): void {
		if (this._isSubmitted) {
			return;
		}
		for (const uri of this.getFeedbackUris()) {
			this._planReviewFeedbackService.removeFeedback(uri, itemId);
		}
	}

	private async clearAllInlineFeedback(): Promise<void> {
		if (this._isSubmitted) {
			return;
		}
		const items = this.getInlineFeedbackItems();
		if (items.length === 0) {
			return;
		}
		const result = await this._dialogService.confirm({
			type: Severity.Warning,
			message: localize('chat.planReview.clearAllConfirm', 'Clear {0} inline comment(s)?', items.length),
			detail: localize('chat.planReview.clearAllDetail', 'These comments will be removed from the plan file and not sent to the agent.'),
			primaryButton: localize('chat.planReview.clearAllConfirmPrimary', 'Clear All'),
		});
		if (!result.confirmed) {
			return;
		}
		for (const uri of this.getFeedbackUris()) {
			this._planReviewFeedbackService.clearFeedback(uri);
		}
	}

	private getFeedbackUris(): URI[] {
		const uris: URI[] = [];
		if (this._editingUri) {
			uris.push(this._editingUri);
		}
		if (this.review.planUri) {
			uris.push(URI.revive(this.review.planUri));
		}
		return uris;
	}

	private onInlineFeedbackChanged(): void {
		if (this._isSubmitted) {
			return;
		}
		const items = this.getInlineFeedbackItems();

		// Auto-promote into review mode the first time a comment shows up.
		if (items.length > 0 && !this._suppressFeedbackModeAutoOpen && !this._isFeedbackMode && !this._isCollapsed) {
			void this.enterFeedbackMode({ focus: false });
			return;
		}

		this.renderCommentsList();
		if (this._isFeedbackMode) {
			this.updateSubmitButtonState();
		}
		this._messageScrollable.scanDomNode();
		this._onDidChangeHeight.fire();
	}

	/**
	 * Render the action buttons into the active container (footer when
	 * expanded, inline title slot when collapsed). Clears the inactive slot
	 * so the same buttons can never appear in two places at once.
	 */
	private renderCurrentActionButtons(): void {
		if (this._isSubmitted) {
			return;
		}
		const target = this._isCollapsed ? this._inlineActionsEl : this._footerButtonsEl;
		const other = this._isCollapsed ? this._footerButtonsEl : this._inlineActionsEl;
		dom.clearNode(other);
		this.renderActionButtons(target, { includeReject: !this._isCollapsed });
	}

	private renderActionButtons(container: HTMLElement, options?: { includeReject?: boolean }): void {
		const includeReject = options?.includeReject ?? true;
		this._buttonStore.clear();
		this._submitButton = undefined;
		this._renderedSubmitInlineCount = -1;
		dom.clearNode(container);

		// In feedback mode, show Submit + Reject. Submit's label includes
		// the count of pending inline comments.
		if (this._isFeedbackMode) {
			const inlineCount = this.getInlineFeedbackItems().length;
			const submitButton = new Button(container, { ...defaultButtonStyles, supportIcons: true });
			submitButton.label = this.computeSubmitLabel(inlineCount);
			submitButton.enabled = this.canSubmitFeedback();
			this._submitButton = submitButton;
			this._renderedSubmitInlineCount = inlineCount;
			this._buttonStore.add(submitButton);
			this._buttonStore.add(submitButton.onDidClick(() => void this.submitFeedback()));

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

		// Reject button (grey secondary) immediately after the approve button
		// so the primary Approve / Reject pair stays grouped together —
		// omitted in the collapsed title bar (parity with
		// chatToolConfirmationCarouselPart which only surfaces the primary
		// action when collapsed).
		if (includeReject) {
			const rejectButton = new Button(container, { ...defaultButtonStyles, secondary: true });
			rejectButton.label = localize('chat.planReview.reject', 'Reject');
			this._buttonStore.add(rejectButton);
			this._buttonStore.add(rejectButton.onDidClick(() => this.submitRejection()));
		}
	}

	private canSubmitFeedback(): boolean {
		const textareaText = this._feedbackTextarea?.value.trim() ?? '';
		if (textareaText) {
			return true;
		}
		return this.getInlineFeedbackItems().length > 0;
	}

	private computeSubmitLabel(inlineCount: number): string {
		return inlineCount > 0
			? localize('chat.planReview.submitFeedbackWithCount', 'Submit Feedback ({0})', inlineCount)
			: localize('chat.planReview.submitFeedback', 'Submit Feedback');
	}

	/**
	 * Update the cached Submit button's enabled state and label without
	 * destroying the button row. Cheap enough to run on every keystroke.
	 */
	private updateSubmitButtonState(): void {
		if (!this._submitButton || !this._isFeedbackMode) {
			return;
		}
		this._submitButton.enabled = this.canSubmitFeedback();
		const inlineCount = this.getInlineFeedbackItems().length;
		if (inlineCount !== this._renderedSubmitInlineCount) {
			this._submitButton.label = this.computeSubmitLabel(inlineCount);
			this._renderedSubmitInlineCount = inlineCount;
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
		this._restoreButton.element.classList.toggle('chat-plan-review-hidden', this._isCollapsed);
		this._collapseButton.label = this._isCollapsed
			? `$(${Codicon.chevronUp.id})`
			: `$(${Codicon.chevronDown.id})`;
		const collapseTooltip = this._isCollapsed
			? localize('chat.planReview.expand', 'Expand')
			: localize('chat.planReview.collapse', 'Collapse');
		this._collapseButton.element.setAttribute('aria-label', collapseTooltip);
		this._collapseButton.element.setAttribute('aria-expanded', String(!this._isCollapsed));
		this._collapseButton.setTitle(collapseTooltip);

		// Collapsed title bar uses a pencil icon; expanded uses a text
		// label that hints at the feedback flow.
		if (this._reviewButton) {
			const isIconOnly = this._isCollapsed;
			this._reviewButton.element.classList.toggle('chat-plan-review-title-icon-button', isIconOnly);
			let label: string;
			let tooltip: string;
			if (isIconOnly) {
				label = `$(${Codicon.edit.id})`;
				const fileName = this.review.planUri ? basename(URI.revive(this.review.planUri)) : '';
				tooltip = this.review.canProvideFeedback
					? localize('chat.planReview.reviewTooltip', 'Review {0}', fileName)
					: localize('chat.planReview.openTooltip', 'Open {0}', fileName);
			} else if (this._isFeedbackMode) {
				label = localize('chat.planReview.cancelButtonLabel', "Cancel");
				tooltip = localize('chat.planReview.cancelTooltip', "Exit feedback mode");
			} else {
				const fileName = this.review.planUri ? basename(URI.revive(this.review.planUri)) : '';
				if (this.review.canProvideFeedback) {
					label = localize('chat.planReview.reviewButtonLabel', "Edit or Provide Feedback");
					tooltip = localize('chat.planReview.reviewTooltip', 'Review {0}', fileName);
				} else {
					label = localize('chat.planReview.openButtonLabel', "Open Plan");
					tooltip = localize('chat.planReview.openTooltip', 'Open {0}', fileName);
				}
			}
			this._reviewButton.label = label;
			this._reviewButton.element.setAttribute('aria-label', tooltip);
			this._reviewButton.setTitle(tooltip);
		}

		// Move action buttons between footer (expanded) and inline title
		// slot (collapsed). Reject is omitted when collapsed.
		this.renderCurrentActionButtons();
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
		// Re-measure the row against the new max-height/min-height.
		this._onDidChangeHeight.fire();
	}

	private async enterReviewMode(): Promise<void> {
		// Read-only / submitted plans: fall back to opening the file in an editor.
		if (!this.review.canProvideFeedback || this._isSubmitted) {
			if (this.review.planUri) {
				await this._editorService.openEditor({ resource: URI.revive(this.review.planUri) });
			}
			return;
		}
		if (this._isCollapsed) {
			this._isCollapsed = false;
			if (this.review instanceof ChatPlanReviewData) {
				this.review.draftCollapsed = false;
			}
			this.updateCollapsedPresentation();
			this.updateExpandedPresentation();
		}
		await this.enterFeedbackMode({ focus: true });
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
		// Only the textarea-only flow (no planUri) attaches a draft to the action click.
		const ridesAlong = !this.review.planUri;
		const textareaFeedback = ridesAlong ? this._feedbackTextarea?.value.trim() : undefined;
		this._options.onSubmit({
			action: action.label,
			...(action.id ? { actionId: action.id } : {}),
			rejected: false,
			...(textareaFeedback ? { feedback: textareaFeedback, feedbackOverall: textareaFeedback } : {}),
		});
		void this.markUsed();
	}

	private submitRejection(): void {
		if (this._isSubmitted) {
			return;
		}
		this._isSubmitted = true;
		const ridesAlong = !this.review.planUri;
		const textareaFeedback = ridesAlong ? this._feedbackTextarea?.value.trim() : undefined;
		this._options.onSubmit({
			rejected: true,
			...(textareaFeedback ? { feedback: textareaFeedback, feedbackOverall: textareaFeedback } : {}),
		});
		void this.markUsed();
	}

	private async enterFeedbackMode(options?: { focus?: boolean }): Promise<void> {
		if (this._isFeedbackMode) {
			if (options?.focus) {
				this.focusFeedbackInput();
			}
			return;
		}
		this._isFeedbackMode = true;
		if (this._feedbackSection) {
			dom.show(this._feedbackSection);
		}
		this.domNode.classList.add('chat-plan-review-feedback-mode');
		this.renderCommentsList();
		// `updateCollapsedPresentation` re-renders the action buttons, so we don't call
		// `renderCurrentActionButtons` explicitly here to avoid double work.
		this.updateCollapsedPresentation();
		const mountId = ++this._inlineEditorMountId;
		if (this.isInlineEditorEnabled()) {
			await this.mountInlineEditor(mountId);
		} else if (this.review.planUri) {
			// No inline editor surface: open the plan file in an editor so the user has
			// somewhere to edit. Covers paths that bypass `enterReviewMode` (e.g. the
			// constructor auto-promote when restored inline comments exist).
			await this._editorService.openEditor({ resource: URI.revive(this.review.planUri) });
		}
		if (options?.focus !== false) {
			this.focusFeedbackInput();
		}
		this._messageScrollable.scanDomNode();
		this._onDidChangeHeight.fire();
	}

	private async exitFeedbackMode(): Promise<void> {
		if (!this._isFeedbackMode) {
			return;
		}

		// Closing is non-destructive: discards the temporary inline editor model;
		// comments and the textarea draft persist.
		this._isFeedbackMode = false;
		if (this._feedbackSection) {
			dom.hide(this._feedbackSection);
		}
		this.domNode.classList.remove('chat-plan-review-feedback-mode');
		await this.unmountInlineEditor();
		this.renderMarkdown();
		// `updateCollapsedPresentation` re-renders the action buttons.
		this.updateCollapsedPresentation();
		this._messageScrollable.scanDomNode();
		this._onDidChangeHeight.fire();
	}

	private focusFeedbackInput(): void {
		if (this._messageEditor) {
			this._messageEditor.focus();
		} else {
			this._feedbackTextarea?.focus();
		}
	}

	// Mount a Monaco editor over the message body backed by an in-memory model
	// seeded from the plan file. Avoids dirtying the real file's working copy;
	// the buffer is only written back via `ITextFileService.write` on submission.
	private async mountInlineEditor(mountId: number): Promise<void> {
		if (!this.canContinueInlineEditorMount(mountId) || !this.review.planUri) {
			return;
		}
		const planUri = URI.revive(this.review.planUri);

		// Abort on read failure rather than seeding `''` which would clobber the file.
		let initialContent: string;
		try {
			const stat = await this._textFileService.read(planUri);
			initialContent = stat.value;
		} catch {
			return;
		}
		if (!this.canContinueInlineEditorMount(mountId)) {
			return;
		}

		// Unique scratch URI per mount; same basename for nicer tooltips.
		const editingUri = URI.from({
			scheme: Schemas.inMemory,
			path: `${PLAN_REVIEW_EDITING_PATH_PREFIX}/${generateUuid()}/${basename(planUri)}`,
		});
		const language = this._languageService.createByFilepathOrFirstLine(planUri);
		const model = this._modelService.createModel(initialContent, language, editingUri);

		// Pin a model reference so sub-features (WordHighlighter, hovers) don't
		// trigger `destroyModel` while the editor is mounted.
		let pinnedRef: IDisposable | undefined;
		try {
			pinnedRef = await this._textModelService.createModelReference(editingUri);
		} catch {
			// Non-fatal: editing still works, only some sub-features may misbehave.
		}
		if (!this.canContinueInlineEditorMount(mountId)) {
			pinnedRef?.dispose();
			model.dispose();
			return;
		}

		this._messageEditorDisposables.clear();
		this._messageContentDisposables.clear();
		dom.clearNode(this._messageEl);
		this._messageEl.classList.add('chat-plan-review-body-editor');

		const editorOptions: IEditorOptions = {
			wordWrap: 'on',
			lineNumbers: 'on',
			lineNumbersMinChars: 2,
			glyphMargin: true,
			folding: false,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			overviewRulerLanes: 0,
			overviewRulerBorder: false,
			hideCursorInOverviewRuler: true,
			lineDecorationsWidth: 6,
			renderLineHighlight: 'none',
			lightbulb: { enabled: ShowLightbulbIconMode.Off },
			padding: { top: 0, bottom: 0 },
			automaticLayout: true,
			scrollbar: {
				vertical: 'auto',
				horizontal: 'auto',
				alwaysConsumeMouseWheel: false,
			},
		};

		let editor: CodeEditorWidget;
		try {
			editor = this._instantiationService.createInstance(CodeEditorWidget, this._messageEl, editorOptions, {
				isSimpleWidget: false,
			});
		} catch {
			pinnedRef?.dispose();
			model.dispose();
			this._messageEl.classList.remove('chat-plan-review-body-editor');
			dom.clearNode(this._messageEl);
			this.renderMarkdown();
			return;
		}
		// Explicitly detach the scratch model before either the editor or model is
		// disposed. This tears down editor ModelData (ViewModel + View) while the
		// model is still alive, avoiding leaked editor internals.
		this._messageEditorDisposables.add(toDisposable(() => editor.setModel(null)));
		this._messageEditorDisposables.add(editor);
		this._messageEditorDisposables.add(model);
		if (pinnedRef) {
			this._messageEditorDisposables.add(pinnedRef);
		}
		this._editingUri = editingUri;
		this._initialEditorContent = initialContent;

		// Register the editing URI before migrating: addFeedback no-ops on unregistered URIs.
		const editingRegistration = this._planReviewFeedbackService.registerPlanReview(editingUri, () => {
			void this.submitFeedback();
		});
		this._messageEditorDisposables.add(editingRegistration);
		this._messageEditorDisposables.add(toDisposable(() => {
			this._editingUri = undefined;
		}));

		try {
			editor.setModel(model);
		} catch {
			this._messageEditorDisposables.clear();
			this._messageEl.classList.remove('chat-plan-review-body-editor');
			dom.clearNode(this._messageEl);
			this.renderMarkdown();
			return;
		}
		this._messageEditor = editor;

		// Migrate pre-existing comments to the editing URI; restored on unmount.
		const preExistingComments = this._planReviewFeedbackService.getFeedback(planUri);
		if (preExistingComments.length > 0) {
			for (const item of preExistingComments) {
				this._planReviewFeedbackService.addFeedback(editingUri, item.line, item.column, item.text);
			}
			this._planReviewFeedbackService.clearFeedback(planUri);
		}

		this._messageScrollable.scanDomNode();
		this._onDidChangeHeight.fire();
		editor.focus();
	}

	private canContinueInlineEditorMount(mountId: number): boolean {
		return this._inlineEditorMountId === mountId
			&& !this._messageEditor
			&& this._isFeedbackMode
			&& !this._isSubmitted
			&& !this._messageEditorDisposables.isDisposed;
	}

	private isInlineEditorEnabled(): boolean {
		return this._configurationService.getValue<boolean>(ChatConfiguration.PlanReviewInlineEditorEnabled) !== false;
	}

	private migrateInlineFeedbackToPlan(editingUri: URI, planUri: URI): void {
		const items = [...this._planReviewFeedbackService.getFeedback(editingUri)];
		if (items.length === 0) {
			return;
		}

		this._suppressFeedbackModeAutoOpen = true;
		try {
			for (const item of items) {
				this._planReviewFeedbackService.addFeedback(planUri, item.line, item.column, item.text);
			}
			this._planReviewFeedbackService.clearFeedback(editingUri);
		} finally {
			this._suppressFeedbackModeAutoOpen = false;
		}
	}

	// Tear down the editor; if requested, write changed scratch text back to disk.
	private async unmountInlineEditor(options?: { writeBack?: boolean }): Promise<void> {
		this._inlineEditorMountId++;
		if (!this._messageEditor) {
			return;
		}
		const editor = this._messageEditor;
		const editingUri = this._editingUri;
		const model = editingUri ? this._modelService.getModel(editingUri) : undefined;
		const planUri = this.review.planUri ? URI.revive(this.review.planUri) : undefined;
		const initialContent = this._initialEditorContent;

		// Snapshot before disposing — clearing the store disposes the model.
		const text = model && !model.isDisposed() ? model.getValue() : undefined;
		if (editingUri && planUri) {
			this.migrateInlineFeedbackToPlan(editingUri, planUri);
		}

		this._messageEditor = undefined;
		this._initialEditorContent = undefined;
		try {
			editor.setModel(null);
		} finally {
			this._messageEditorDisposables.clear();
			this._messageEl.classList.remove('chat-plan-review-body-editor');
			dom.clearNode(this._messageEl);
		}

		// Skip writes when nothing changed to avoid mtime bumps / watcher fires.
		if (options?.writeBack && text !== undefined && planUri && text !== initialContent) {
			if (this.review instanceof ChatPlanReviewData) {
				this.review.content = text;
			}
			try {
				await this._textFileService.write(planUri, text);
			} catch {
				// Don't fail submission on a transient write error.
			}
		}
	}

	private async submitFeedback(): Promise<void> {
		if (this._isSubmitted) {
			return;
		}
		const textareaFeedback = this._feedbackTextarea?.value.trim();

		const editorFeedbackItems = [...this.getInlineFeedbackItems()];

		if (!textareaFeedback && editorFeedbackItems.length === 0) {
			return;
		}
		this._isSubmitted = true;

		// Flush in-widget edits to disk before notifying the agent.
		await this.unmountInlineEditor({ writeBack: true });

		// Keep overall and inline blocks separate so the transcript can render them distinctly.
		let feedbackInlineMarkdown: string | undefined;
		if (editorFeedbackItems.length > 0) {
			const planUri = this.review.planUri ? URI.revive(this.review.planUri) : undefined;
			const fileName = planUri ? basename(planUri) : '';
			const heading = fileName
				? localize('chat.planReview.inlineCommentsHeading', "Inline comments on `{0}`:", fileName)
				: localize('chat.planReview.inlineCommentsHeadingNoFile', "Inline comments:");
			const bullets = editorFeedbackItems.map(item => {
				const location = item.column > 1
					? localize('chat.planReview.inlineCommentLocation', "Line {0}, Column {1}", item.line, item.column)
					: localize('chat.planReview.inlineCommentLocationLine', "Line {0}", item.line);
				return `- **${location}:** ${item.text}`;
			});
			feedbackInlineMarkdown = [heading, ...bullets].join('\n');
		}

		const sections: string[] = [];
		if (textareaFeedback) {
			sections.push(textareaFeedback);
		}
		if (feedbackInlineMarkdown) {
			sections.push(feedbackInlineMarkdown);
		}

		const feedback = sections.join('\n\n');
		this._options.onSubmit({
			rejected: false,
			feedback,
			feedbackOverall: textareaFeedback || undefined,
			feedbackInlineMarkdown,
		});
		await this.markUsed();
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

	private async markUsed(): Promise<void> {
		this.domNode.classList.add('chat-plan-review-used');
		this._buttonStore.clear();
		this._submitButton = undefined;
		this._renderedSubmitInlineCount = -1;
		// Hide the editor contribution even if the plan file is still open.
		this._planReviewRegistration.clear();
		if (this._messageEditor) {
			await this.unmountInlineEditor({ writeBack: false });
			this.renderMarkdown();
		}
		if (this._feedbackTextarea) {
			this._feedbackTextarea.disabled = true;
		}
	}
}
