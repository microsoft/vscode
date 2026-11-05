/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentFeedbackEditorWidget.css';

import { $, addDisposableListener, addStandardDisposableListener, append, clearNode, DisposableResizeObserver, getTotalWidth, getWindow, isHTMLElement } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { HoverStyle } from '../../../../base/browser/ui/hover/hover.js';
import { createInstantHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ToolBar } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { Action, IAction, Separator } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { overviewRulerRangeHighlight } from '../../../../editor/common/core/editorColorRegistry.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IEditorDecorationsCollection, ScrollType } from '../../../../editor/common/editorCommon.js';
import { OverviewRulerLane } from '../../../../editor/common/model.js';
import * as nls from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { getChatMarkdownRenderOptions } from '../../../../workbench/contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { ICodeReviewService } from '../../codeReview/browser/codeReviewService.js';
import { createAgentFeedbackContext } from './agentFeedbackEditorUtils.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from './agentFeedbackService.js';
import { IAgentFeedbackReply } from './agentFeedbackModel.js';
import { ISessionEditorComment, SessionEditorCommentSource, toSessionEditorCommentId } from './sessionEditorComments.js';

interface ICommentItemActions {
	acceptAction?: Action;
	editAction?: Action;
	removeAction?: Action;
	addReplyAction?: Action;
}

const reviewIcon = registerIcon('agent-feedback-pr-review', Codicon.gitPullRequestComment, nls.localize('agentFeedback.reviewIcon', "Icon for a pull request review comment."));
const acceptIcon = registerIcon('agent-feedback-accept', Codicon.check, nls.localize('agentFeedback.acceptIcon', "Icon for sharing a comment with the agent."));
const deleteIcon = registerIcon('agent-feedback-delete', Codicon.trash, nls.localize('agentFeedback.deleteIcon', "Icon for deleting a comment."));
const editIcon = registerIcon('agent-feedback-edit', Codicon.edit, nls.localize('agentFeedback.editIcon', "Icon for editing a comment."));
const replyIcon = registerIcon('agent-feedback-reply', Codicon.commentDiscussion, nls.localize('agentFeedback.replyIcon', "Icon for replying to a comment."));
const hideIcon = registerIcon('agent-feedback-hide', Codicon.close, nls.localize('agentFeedback.hideIcon', "Icon for hiding a resolved comment."));
const moreIcon = registerIcon('agent-feedback-more', Codicon.toolBarMore, nls.localize('agentFeedback.moreIcon', "Icon for additional comment actions."));

/**
 * An open edit or reply composer. `cancel` closes it and restores the item.
 */
interface IActiveInput {
	readonly textarea: HTMLTextAreaElement;
	readonly cancel: () => void;
}

/**
 * Whether the event target lives inside one of the widget's text inputs, where
 * mouse interactions must be left to the browser so the caret can be placed.
 */
function isTextInputTarget(target: EventTarget | null): boolean {
	return isHTMLElement(target) && target.closest('textarea, input') !== null;
}

function isCopilotReviewAuthor(author: string | undefined): boolean {
	return author === 'copilot-pull-request-reviewer' || author === 'copilot-pull-request-reviewer[bot]';
}

const enum ComposerKind {
	Edit,
	Reply,
}

/**
 * In-progress text of a single open composer.
 */
export interface IComposerDraft {
	readonly kind: ComposerKind;
	readonly text: string;
}

/**
 * Shared composer state that survives widget rebuilds. The contribution owns the
 * single instance and hands it to each widget so drafts (and focus) are not lost
 * when widgets are recreated in response to unrelated feedback / review changes.
 */
export interface IComposerDraftState {
	readonly drafts: Map<string, IComposerDraft>;
	focusedCommentId: string | undefined;
}

/**
 * Widget that displays agent feedback comments for a group of nearby feedback items.
 * Positioned on the right side of the editor as a stack of comment cards.
 */
export class AgentFeedbackEditorWidget extends Disposable implements IOverlayWidget {

	private static _idPool = 0;

	/**
	 * Estimated widget width in px used while the widget DOM node has not been
	 * laid out yet. Matches the `width` of `.agent-feedback-widget` so we
	 * reserve enough scroll space up front; the real width replaces it once the
	 * node is rendered.
	 */
	private static readonly _estimatedWidgetWidth = 320;

	private readonly _id: string = `agent-feedback-widget-${AgentFeedbackEditorWidget._idPool++}`;

	private readonly _domNode: HTMLElement;
	private readonly _bodyNode: HTMLElement;
	private readonly _itemElements = new Map<string, HTMLElement>();
	private readonly _textPreviews = new Map<string, {
		readonly text: HTMLElement;
		readonly button: Button;
		readonly hasDetails: boolean;
		expanded: boolean;
		measurement?: { readonly width: number; readonly height: number; readonly version: number };
	}>();
	private readonly _authorLabels = new Map<ISessionEditorComment, { readonly label: HTMLElement; readonly lineInfo: HTMLElement; readonly item: HTMLElement }>();
	private readonly _activeReplyInputs = new Map<string, IActiveInput>();
	private readonly _activeEditInputs = new Map<string, IActiveInput>();
	private readonly _resizeObserver: DisposableResizeObserver;
	private readonly _hoverDelegate = this._register(createInstantHoverDelegate());
	private readonly _endLineNumber: number;

	private _position: IOverlayWidgetPosition | null = null;
	private _composerToFocus: HTMLTextAreaElement | undefined;
	private _textPreviewVersion = 0;
	private _isExpanded: boolean = false;
	private _disposed: boolean = false;
	private _startLineNumber: number = 1;
	private _cachedMinContentWidth: { readonly widgetWidth: number; readonly value: number } | undefined;
	private readonly _rangeHighlightDecoration: IEditorDecorationsCollection;

	private readonly _eventStore = this._register(new DisposableStore());

	private readonly _onDidExpand = this._register(new Emitter<void>());
	readonly onDidExpand: Event<void> = this._onDidExpand.event;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _commentItems: readonly ISessionEditorComment[],
		private readonly _sessionResource: URI,
		private readonly _composerDraftState: IComposerDraftState | undefined,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@ICodeReviewService private readonly _codeReviewService: ICodeReviewService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
	) {
		super();

		this._endLineNumber = this._commentItems.reduce((endLineNumber, comment) => Math.max(endLineNumber, comment.range.endLineNumber), 1);
		this._rangeHighlightDecoration = this._editor.createDecorationsCollection();

		// Create DOM structure
		this._domNode = $('div.agent-feedback-widget');
		this._domNode.classList.add('collapsed');
		this._domNode.setAttribute('role', 'group');
		this._domNode.setAttribute('aria-label', nls.localize('feedbackComments', "Comments"));
		// Make focusable so that mousedown in selectable regions can pull focus
		// away from the editor's textarea, allowing native Ctrl/Cmd+C to copy
		// the DOM selection of the comment content.
		this._domNode.tabIndex = -1;

		this._resizeObserver = this._register(new DisposableResizeObserver('AgentFeedbackEditorWidget', () => this.relayout(), getWindow(this._domNode)));
		this._register(this._resizeObserver.observe(this._domNode));

		this._bodyNode = $('div.agent-feedback-widget-body');
		this._buildFeedbackItems();
		this._domNode.appendChild(this._bodyNode);

		this._register(this._defaultAccountService.onDidChangeDefaultAccount(() => {
			for (const [comment, { label, lineInfo, item }] of this._authorLabels) {
				label.textContent = this._getAuthorLabel(comment);
				item.setAttribute('aria-label', nls.localize('commentLocation', "{0}, {1}", label.textContent, lineInfo.textContent));
			}
		}));

		// Event handlers
		this._setupEventHandlers();

		// Add visible class for initial display
		this._domNode.classList.add('visible');

		// Add to editor
		this._editor.addOverlayWidget(this);
	}

	private _setupEventHandlers(): void {
		this._eventStore.add(addDisposableListener(this._bodyNode, 'wheel', e => {
			if (this._bodyNode.classList.contains('scrollable')) {
				e.stopPropagation();
			}
		}, { passive: true }));

		// Escape inside a textarea is handled there and stops propagating, so this only fires from the widget chrome.
		this._eventStore.add(addStandardDisposableListener(this._domNode, 'keydown', (e) => {
			if (e.keyCode !== KeyCode.Escape || !this._cancelActiveInputs()) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
		}));
	}

	/**
	 * Closes every open edit / reply composer. Returns whether any was open.
	 */
	private _cancelActiveInputs(): boolean {
		const cancels = [...this._activeEditInputs.values(), ...this._activeReplyInputs.values()].map(input => input.cancel);
		for (const cancel of cancels) {
			cancel();
		}
		return cancels.length > 0;
	}

	private _setDraft(commentId: string, kind: ComposerKind, text: string): void {
		this._composerDraftState?.drafts.set(commentId, { kind, text });
	}

	private _clearDraft(commentId: string): void {
		if (!this._composerDraftState) {
			return;
		}
		this._composerDraftState.drafts.delete(commentId);
		if (this._composerDraftState.focusedCommentId === commentId) {
			this._composerDraftState.focusedCommentId = undefined;
		}
	}

	/**
	 * Whether a composer should take focus: always for an explicit user action,
	 * and for a restored draft only if it had focus when the widget was rebuilt.
	 */
	private _shouldFocusComposer(commentId: string, restoredText: string | undefined): boolean {
		return restoredText === undefined || this._composerDraftState?.focusedCommentId === commentId;
	}

	private _focusComposer(textarea: HTMLTextAreaElement): void {
		this._composerToFocus = textarea;
		if (textarea.isConnected) {
			this.restoreComposerFocus();
		}
	}

	private _buildFeedbackItems(): void {
		clearNode(this._bodyNode);
		this._itemElements.clear();
		this._activeReplyInputs.clear();
		this._activeEditInputs.clear();
		this._textPreviews.clear();
		this._authorLabels.clear();

		for (const comment of this._commentItems) {
			const item = $('div.agent-feedback-widget-item');
			item.classList.add(`agent-feedback-widget-item-${comment.source}`);
			if (comment.suggestion) {
				item.classList.add('agent-feedback-widget-item-suggestion');
			}
			this._itemElements.set(comment.id, item);
			item.tabIndex = -1;
			item.setAttribute('role', 'group');

			const itemHeader = $('div.agent-feedback-widget-item-header');
			if (comment.kind === AgentFeedbackKind.PRReview) {
				const icon = renderIcon(reviewIcon);
				icon.classList.add('agent-feedback-widget-review-icon');
				icon.setAttribute('aria-hidden', 'true');
				append(itemHeader, icon);
			}

			const author = append(itemHeader, $('span.agent-feedback-widget-author'));
			author.textContent = this._getAuthorLabel(comment);
			this._eventStore.add(this._hoverService.setupDelayedHover(author, () => ({
				content: this._getAuthorLabel(comment),
				style: HoverStyle.Pointer,
			}), { groupId: `${this._id}.authors` }));

			const lineInfo = $('span.agent-feedback-widget-line-info');
			if (comment.range.startLineNumber === comment.range.endLineNumber) {
				lineInfo.textContent = nls.localize('lineNumber', "Line {0}", comment.range.startLineNumber);
			} else {
				lineInfo.textContent = nls.localize('lineRange', "Lines {0}-{1}", comment.range.startLineNumber, comment.range.endLineNumber);
			}
			this._authorLabels.set(comment, { label: author, lineInfo, item });
			item.setAttribute('aria-label', nls.localize('commentLocation', "{0}, {1}", author.textContent, lineInfo.textContent));

			const status = append(itemHeader, $('span.agent-feedback-widget-status'));
			status.setAttribute('role', 'status');
			if (comment.state === AgentFeedbackState.Submitted) {
				status.textContent = nls.localize('investigatingComment', "Investigating");
			} else if (comment.kind === AgentFeedbackKind.PRReview && comment.state === AgentFeedbackState.Accepted) {
				status.textContent = nls.localize('acceptedComment', "Accepted");
			}

			const text = $('div.agent-feedback-widget-text.collapsed');
			text.id = `${this._id}-text-${this._textPreviews.size}`;
			this._renderCommentText(text, comment);
			const itemActions = this._renderItemActions(comment, item, text, itemHeader, status);
			append(item, itemHeader, lineInfo, text);

			const previewContentIds = [text.id];
			if (comment.suggestion?.edits.length) {
				const suggestion = append(item, this._renderSuggestion(comment));
				suggestion.id = `${text.id}-suggestion`;
				previewContentIds.push(suggestion.id);
			}
			if (comment.replies?.length) {
				const replies = append(item, this._renderReplies(comment.replies));
				replies.id = `${text.id}-replies`;
				previewContentIds.push(replies.id);
			}

			const expandButton = this._eventStore.add(new Button(item, {
				...defaultButtonStyles,
				buttonBackground: undefined,
				buttonHoverBackground: undefined,
				buttonForeground: undefined,
				buttonBorder: undefined,
				hoverDelegate: this._hoverDelegate,
			}));
			expandButton.element.classList.add('agent-feedback-widget-expand');
			expandButton.element.setAttribute('aria-controls', previewContentIds.join(' '));
			expandButton.element.setAttribute('aria-expanded', 'false');
			expandButton.label = nls.localize('seeMoreComment', "See more");
			expandButton.element.hidden = true;
			this._textPreviews.set(comment.id, {
				text,
				button: expandButton,
				hasDetails: !!(comment.suggestion?.edits.length || comment.replies?.length),
				expanded: false,
			});
			this._eventStore.add(expandButton.onDidClick(e => {
				e.stopPropagation();
				this._setCommentExpanded(comment.id, !this._textPreviews.get(comment.id)!.expanded);
				this.relayout();
			}));

			this._eventStore.add(addDisposableListener(item, 'mouseenter', () => {
				this._highlightRange(comment);
			}));

			this._eventStore.add(addDisposableListener(item, 'mouseleave', () => {
				this._rangeHighlightDecoration.clear();
			}));

			this._eventStore.add(addDisposableListener(item, 'click', e => {
				const target = e.target as HTMLElement | null;
				if (target?.closest('.monaco-toolbar, .agent-feedback-widget-expand')) {
					return;
				}
				// Don't trigger navigation when interacting with the reply input.
				if (target?.closest('.agent-feedback-widget-add-reply')) {
					return;
				}
				// Don't navigate when placing the caret in a composer.
				if (isTextInputTarget(target)) {
					return;
				}
				// Don't navigate if the user just selected text inside the comment.
				if (target?.closest('.agent-feedback-widget-text, .agent-feedback-widget-suggestion-text, .agent-feedback-widget-reply-text')) {
					const selection = this._domNode.ownerDocument.defaultView?.getSelection();
					if (selection && !selection.isCollapsed && this._domNode.contains(selection.anchorNode)) {
						return;
					}
				}
				this.focusFeedback(comment.id);
				this._agentFeedbackService.setNavigationAnchor(this._sessionResource, comment.id);
				this._revealComment(comment);
			}));

			// Pull focus to the widget when starting a selection in selectable
			// regions so that Ctrl/Cmd+C copies the DOM selection instead of
			// triggering the editor's copy action.
			const onSelectableMousedown = (e: MouseEvent) => {
				const target = e.target as HTMLElement | null;
				// Stealing focus here would blur the composer the user is clicking into.
				if (isTextInputTarget(target)) {
					return;
				}
				if (target?.closest('.agent-feedback-widget-text, .agent-feedback-widget-suggestion-text, .agent-feedback-widget-reply-text')) {
					this._domNode.focus({ preventScroll: true });
				}
			};
			this._eventStore.add(addDisposableListener(item, 'mousedown', onSelectableMousedown));

			this._bodyNode.appendChild(item);

			// Restore an in-progress composer so drafts survive widget rebuilds.
			const draft = comment.state !== AgentFeedbackState.Submitted && comment.state !== AgentFeedbackState.Resolved
				? this._composerDraftState?.drafts.get(comment.id)
				: undefined;
			if (draft?.kind === ComposerKind.Reply) {
				this._startAddingReply(comment, item, itemActions, draft.text);
			} else if (draft?.kind === ComposerKind.Edit) {
				this._startEditing(comment, text, itemActions, draft.text);
			}
		}
	}

	private _getAuthorLabel(comment: ISessionEditorComment): string {
		if (isCopilotReviewAuthor(comment.author)) {
			return nls.localize('copilotCommentAuthor', "Copilot (AI)");
		}
		if (comment.author) {
			return nls.localize('commentAuthor', "@{0}", comment.author);
		}
		if (comment.kind === AgentFeedbackKind.AgentReview) {
			return nls.localize('agentCommentAuthor', "Agent (AI)");
		}
		if (comment.kind === AgentFeedbackKind.PRReview) {
			return nls.localize('prCommentAuthor', "PR reviewer");
		}
		const accountName = this._defaultAccountService.currentDefaultAccount?.accountName;
		return accountName ? nls.localize('commentAuthor', "@{0}", accountName) : nls.localize('userCommentAuthor', "You");
	}

	private _renderCommentText(container: HTMLElement, comment: ISessionEditorComment): void {
		this._renderMarkdown(container, comment.text, comment.kind === AgentFeedbackKind.AgentReview || isCopilotReviewAuthor(comment.author));
	}

	private _renderMarkdown(container: HTMLElement, value: string, isAgentAuthored: boolean): void {
		this._textPreviewVersion++;
		const options = {
			asyncRenderCallback: () => {
				this._textPreviewVersion++;
				this.relayout();
			},
		};
		const rendered = this._eventStore.add(this._markdownRendererService.render(new MarkdownString(value), isAgentAuthored ? getChatMarkdownRenderOptions(options) : options));
		append(container, rendered.element);
	}

	private _setCommentExpanded(commentId: string, expanded: boolean): void {
		const preview = this._textPreviews.get(commentId);
		if (!preview) {
			return;
		}
		const wasExpanded = this._isExpanded;
		preview.expanded = expanded;
		preview.text.classList.toggle('collapsed', !expanded);
		this._itemElements.get(commentId)?.classList.toggle('expanded', expanded);
		preview.button.label = expanded ? nls.localize('seeLessComment', "See less") : nls.localize('seeMoreComment', "See more");
		preview.button.element.setAttribute('aria-expanded', String(expanded));
		this._isExpanded = [...this._textPreviews.values()].some(value => value.expanded);
		this._domNode.classList.toggle('collapsed', !this._isExpanded);
		if (this._isExpanded && !wasExpanded) {
			this._onDidExpand.fire();
		}
	}

	private _updateTextPreviews(): void {
		const scrollTop = this._bodyNode.scrollTop;
		for (const preview of this._textPreviews.values()) {
			if (preview.text.classList.contains('editing')) {
				preview.button.element.hidden = true;
				continue;
			}
			const width = preview.text.clientWidth;
			const height = preview.text.clientHeight;
			if (height === 0 || (preview.measurement?.width === width && preview.measurement.height === height && preview.measurement.version === this._textPreviewVersion)) {
				continue;
			}
			if (preview.hasDetails) {
				preview.button.element.hidden = false;
			} else {
				if (preview.expanded) {
					preview.text.classList.add('collapsed');
				}
				preview.button.element.hidden = preview.text.scrollHeight <= preview.text.clientHeight + 1;
				if (preview.expanded) {
					preview.text.classList.remove('collapsed');
				}
			}
			preview.measurement = { width: preview.text.clientWidth, height: preview.text.clientHeight, version: this._textPreviewVersion };
		}
		// Measuring collapsed previews can clamp the live reading position.
		if (this._bodyNode.scrollTop !== scrollTop) {
			this._bodyNode.scrollTop = scrollTop;
		}
	}

	private _renderItemActions(comment: ISessionEditorComment, item: HTMLElement, text: HTMLElement, header: HTMLElement, status: HTMLElement): ICommentItemActions {
		const actions: ICommentItemActions = {};
		if (comment.state === AgentFeedbackState.Submitted) {
			return actions;
		}
		const container = append(header, $('div.agent-feedback-widget-item-actions'));
		const toolbar = this._eventStore.add(new ToolBar(container, this._contextMenuService, {
			ariaLabel: nls.localize('commentActions', "Comment Actions"),
			hoverDelegate: this._hoverDelegate,
			moreIcon,
			getSecondaryActionsPosition: () => 0,
		}));
		this._eventStore.add(toolbar.actionRunner.onDidRun(event => {
			if (event.error) {
				onUnexpectedError(event.error);
			}
		}));
		if (comment.state === AgentFeedbackState.Resolved) {
			toolbar.setActions([this._eventStore.add(new Action('agentFeedback.widget.hide', nls.localize('hideComment', "Hide"), ThemeIcon.asClassName(hideIcon), true, () => this._hideComment(comment)))]);
			return actions;
		}

		actions.addReplyAction = this._eventStore.add(new Action(
			'agentFeedback.widget.addReply', nls.localize('addToComment', "Add to Comment"), ThemeIcon.asClassName(replyIcon), true,
			() => this._startAddingReply(comment, item, actions),
		));
		actions.editAction = this._eventStore.add(new Action(
			'agentFeedback.widget.edit', nls.localize('editComment', "Edit"), ThemeIcon.asClassName(editIcon), true,
			() => this._startEditing(comment, text, actions),
		));
		actions.removeAction = this._eventStore.add(new Action(
			'agentFeedback.widget.remove',
			comment.source === SessionEditorCommentSource.PRReview ? nls.localize('resolvePRComment', "Resolve PR Comment") : nls.localize('deleteComment', "Delete"),
			ThemeIcon.asClassName(deleteIcon), true, () => this._removeComment(comment),
		));

		let needsAcceptance = comment.canConvertToAgentFeedback || comment.state === AgentFeedbackState.Created;
		const updateToolbar = () => {
			const primary: IAction[] = [];
			if (needsAcceptance && actions.acceptAction) {
				primary.push(actions.acceptAction);
			} else if (comment.kind === AgentFeedbackKind.UserReview) {
				primary.push(actions.editAction!);
			}
			primary.push(actions.removeAction!);
			const secondary: IAction[] = [actions.addReplyAction!, actions.editAction!];
			if (needsAcceptance && actions.acceptAction) {
				secondary.push(new Separator(), actions.acceptAction);
			}
			secondary.push(actions.removeAction!);
			toolbar.setActions(primary, secondary);
		};
		if (needsAcceptance) {
			actions.acceptAction = this._eventStore.add(new Action(
				'agentFeedback.widget.accept',
				nls.localize('acceptComment', "Share Comment with Agent"),
				ThemeIcon.asClassName(acceptIcon), true,
				() => {
					if (comment.canConvertToAgentFeedback) {
						this._convertToAgentFeedback(comment);
					} else {
						this._acceptFeedback(comment);
					}
					if (this._disposed) {
						return;
					}
					needsAcceptance = false;
					if (comment.kind === AgentFeedbackKind.PRReview) {
						status.textContent = nls.localize('acceptedComment', "Accepted");
					}
					updateToolbar();
					item.focus({ preventScroll: true });
					this.relayout();
				},
			));
		}
		updateToolbar();
		return actions;
	}

	private _renderSuggestion(comment: ISessionEditorComment): HTMLElement {
		const suggestionNode = $('div.agent-feedback-widget-suggestion');

		for (const edit of comment.suggestion?.edits ?? []) {
			const editNode = $('div.agent-feedback-widget-suggestion-edit');

			const header = $('div.agent-feedback-widget-suggestion-header');
			if (edit.range.startLineNumber === edit.range.endLineNumber) {
				header.textContent = nls.localize('suggestedChangeLine', "Suggested Change \u2022 Line {0}", edit.range.startLineNumber);
			} else {
				header.textContent = nls.localize('suggestedChangeLines', "Suggested Change \u2022 Lines {0}-{1}", edit.range.startLineNumber, edit.range.endLineNumber);
			}
			editNode.appendChild(header);

			const newText = $('pre.agent-feedback-widget-suggestion-text');
			newText.textContent = edit.newText;
			editNode.appendChild(newText);
			suggestionNode.appendChild(editNode);
		}

		return suggestionNode;
	}

	private _renderReplies(replies: readonly IAgentFeedbackReply[]): HTMLElement {
		const repliesNode = $('div.agent-feedback-widget-replies');

		for (const reply of replies) {
			const replyNode = $('div.agent-feedback-widget-reply');
			if (reply.author === 'agent') {
				const author = $('div.agent-feedback-widget-reply-author');
				author.textContent = nls.localize('agentFeedback.replyFromAgent', "Agent");
				replyNode.appendChild(author);
			}
			const replyText = $('div.agent-feedback-widget-reply-text');
			this._renderMarkdown(replyText, reply.text, reply.author === 'agent');
			replyNode.appendChild(replyText);
			repliesNode.appendChild(replyNode);
		}

		return repliesNode;
	}

	private _removeComment(comment: ISessionEditorComment): void | Promise<void> {
		if (comment.source === SessionEditorCommentSource.PRReview) {
			return this._codeReviewService.resolvePRReviewThread(this._sessionResource, comment.sourceId, comment.sourcePullRequest);
		}

		if (comment.kind === AgentFeedbackKind.PRReview && comment.sourcePRReviewCommentId) {
			this._codeReviewService.dismissPRReviewComment(this._sessionResource, comment.sourcePRReviewCommentId);
		}
		this._agentFeedbackService.removeFeedback(this._sessionResource, comment.sourceId);
	}

	private _hideComment(comment: ISessionEditorComment): void {
		this._agentFeedbackService.hideFeedbackInEditor(this._sessionResource, comment.sourceId);
	}

	private _startEditing(comment: ISessionEditorComment, textContainer: HTMLElement, actions: ICommentItemActions, restoredText?: string): void {
		const existing = this._activeEditInputs.get(comment.id);
		if (existing) {
			existing.textarea.focus();
			return;
		}

		// Disable all actions while editing
		this._setItemActionsEnabled(actions, false);

		const editStore = new DisposableStore();
		this._eventStore.add(editStore);

		clearNode(textContainer);
		textContainer.classList.add('editing');
		this._updateTextPreviews();

		const textarea = $('textarea.agent-feedback-widget-edit-textarea') as HTMLTextAreaElement;
		textarea.value = restoredText ?? comment.text;
		textarea.setAttribute('aria-label', nls.localize('editCommentInput', "Edit Comment"));
		textarea.rows = 1;
		textContainer.appendChild(textarea);

		this._activeEditInputs.set(comment.id, {
			textarea,
			cancel: () => this._stopEditing(comment, textContainer, editStore, actions),
		});
		this._setDraft(comment.id, ComposerKind.Edit, textarea.value);

		// Auto-size the textarea
		const autoSize = () => {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight}px`;
			this.relayout();
		};
		autoSize();

		editStore.add(addDisposableListener(textarea, 'input', () => {
			this._setDraft(comment.id, ComposerKind.Edit, textarea.value);
			autoSize();
		}));

		// Editing ends only on Enter or Escape so an incidental click never discards the draft.
		editStore.add(addStandardDisposableListener(textarea, 'keydown', (e) => {
			if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				const newText = textarea.value.trim();
				if (newText) {
					// Clear the draft first so the rebuilt widget doesn't re-open the composer.
					this._clearDraft(comment.id);
					this._saveEdit(comment, newText);
				} else {
					this._stopEditing(comment, textContainer, editStore, actions);
				}
			} else if (e.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this._stopEditing(comment, textContainer, editStore, actions);
			}
		}));

		if (this._shouldFocusComposer(comment.id, restoredText)) {
			this._focusComposer(textarea);
		}
	}

	private _startAddingReply(comment: ISessionEditorComment, itemNode: HTMLElement, actions: ICommentItemActions, restoredText?: string): void {
		// If a reply input is already open for this item, just focus it.
		const existing = this._activeReplyInputs.get(comment.id);
		if (existing) {
			existing.textarea.focus();
			return;
		}

		// Disable item actions while replying so the action bar doesn't conflict.
		this._setItemActionsEnabled(actions, false);

		const replyStore = new DisposableStore();
		this._eventStore.add(replyStore);

		const replyContainer = $('div.agent-feedback-widget-add-reply');
		const textarea = $('textarea.agent-feedback-widget-edit-textarea') as HTMLTextAreaElement;
		textarea.placeholder = nls.localize('addReplyPlaceholder', "Add a comment\u2026");
		textarea.setAttribute('aria-label', nls.localize('replyCommentInput', "Add to Comment"));
		textarea.rows = 1;
		if (restoredText !== undefined) {
			textarea.value = restoredText;
		}
		replyContainer.appendChild(textarea);
		this._setCommentExpanded(comment.id, true);
		itemNode.appendChild(replyContainer);
		this._activeReplyInputs.set(comment.id, { textarea, cancel: () => cleanup() });
		this._setDraft(comment.id, ComposerKind.Reply, textarea.value);

		const autoSize = () => {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight}px`;
			this.relayout();
		};
		autoSize();

		replyStore.add(addDisposableListener(textarea, 'input', () => {
			this._setDraft(comment.id, ComposerKind.Reply, textarea.value);
			autoSize();
		}));

		const cleanup = () => {
			replyStore.dispose();
			this._setItemActionsEnabled(actions, true);
			this._activeReplyInputs.delete(comment.id);
			replyContainer.remove();
			this._clearDraft(comment.id);
			itemNode.focus({ preventScroll: true });
			this.relayout();
		};

		// Replying ends only on Enter or Escape so an incidental click never discards the draft.
		replyStore.add(addStandardDisposableListener(textarea, 'keydown', (e) => {
			if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				const newReply = textarea.value.trim();
				if (newReply) {
					// Clear the draft first so the rebuilt widget doesn't re-open the composer.
					this._clearDraft(comment.id);
					this._saveReply(comment, newReply);
				} else {
					cleanup();
				}
			} else if (e.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				cleanup();
			}
		}));

		if (this._shouldFocusComposer(comment.id, restoredText)) {
			this._focusComposer(textarea);
		}
	}

	/**
	 * Focuses the composer restored from a draft, if any. Must be called once the
	 * widget is in the DOM — focusing a detached element has no effect.
	 */
	restoreComposerFocus(): void {
		const textarea = this._composerToFocus;
		this._composerToFocus = undefined;
		if (!textarea) {
			return;
		}
		textarea.focus();
		// Place caret at the end so typing continues where the user left off.
		textarea.setSelectionRange(textarea.value.length, textarea.value.length);
	}

	private _saveReply(comment: ISessionEditorComment, replyText: string): void {
		if (comment.source === SessionEditorCommentSource.AgentFeedback) {
			this._agentFeedbackService.addReply(this._sessionResource, comment.sourceId, replyText);
			return;
		}

		// For PR review comments, convert to agent feedback first preserving
		// the original text, then add the reply so that the original comment and
		// the reply live in the same thread.
		if (!comment.canConvertToAgentFeedback) {
			return;
		}

		const feedback = this._agentFeedbackService.addFeedback(
			this._sessionResource,
			comment.resourceUri,
			comment.range,
			comment.text,
			comment.suggestion,
			createAgentFeedbackContext(this._editor, this._codeEditorService, comment.resourceUri, comment.range),
			comment.sourceId,
			AgentFeedbackKind.PRReview,
			undefined,
			comment.sourcePullRequest,
			comment.author,
		);
		this._agentFeedbackService.addReply(this._sessionResource, feedback.id, replyText);
		this._agentFeedbackService.setNavigationAnchor(this._sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedback.id));
		this._codeReviewService.markPRReviewCommentConverted(this._sessionResource, comment.sourceId);
	}

	private _saveEdit(comment: ISessionEditorComment, newText: string): void {
		if (comment.source === SessionEditorCommentSource.AgentFeedback) {
			this._agentFeedbackService.updateFeedback(this._sessionResource, comment.sourceId, newText);
		} else {
			// PR review and code review comments are converted to agent feedback on edit
			this._convertToAgentFeedbackWithText(comment, newText);
		}
	}

	private _stopEditing(comment: ISessionEditorComment, textContainer: HTMLElement, editStore: DisposableStore, actions: ICommentItemActions): void {
		editStore.dispose();
		this._activeEditInputs.delete(comment.id);
		this._clearDraft(comment.id);

		// Re-enable actions
		this._setItemActionsEnabled(actions, true);

		textContainer.classList.remove('editing');
		clearNode(textContainer);
		this._renderCommentText(textContainer, comment);
		this._itemElements.get(comment.id)?.focus({ preventScroll: true });
		this.relayout();
	}

	private _setItemActionsEnabled(actions: ICommentItemActions, enabled: boolean): void {
		for (const action of [actions.acceptAction, actions.editAction, actions.removeAction, actions.addReplyAction]) {
			if (action) {
				action.enabled = enabled;
			}
		}
	}

	private _convertToAgentFeedback(comment: ISessionEditorComment): void {
		this._convertToAgentFeedbackWithText(comment, comment.text);
	}

	/**
	 * Accept a Created agent feedback item so it becomes submittable.
	 */
	private _acceptFeedback(comment: ISessionEditorComment): void {
		if (comment.source !== SessionEditorCommentSource.AgentFeedback) {
			return;
		}
		this._agentFeedbackService.acceptFeedback(this._sessionResource, comment.sourceId);
		this._agentFeedbackService.setNavigationAnchor(this._sessionResource, comment.id);
	}

	/**
	 * Converts a non-agent-feedback comment into an agent feedback item, optionally with edited text.
	 */
	private _convertToAgentFeedbackWithText(comment: ISessionEditorComment, text: string): void {
		if (!comment.canConvertToAgentFeedback) {
			return;
		}

		const feedback = this._agentFeedbackService.addFeedback(
			this._sessionResource,
			comment.resourceUri,
			comment.range,
			text,
			comment.suggestion,
			createAgentFeedbackContext(this._editor, this._codeEditorService, comment.resourceUri, comment.range),
			comment.sourceId,
			AgentFeedbackKind.PRReview,
			undefined,
			comment.sourcePullRequest,
			comment.author,
		);
		this._agentFeedbackService.setNavigationAnchor(this._sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedback.id));
		this._codeReviewService.markPRReviewCommentConverted(this._sessionResource, comment.sourceId);
	}

	/**
	 * Expand the widget body.
	 */
	expand(): void {
		for (const comment of this._commentItems) {
			this._setCommentExpanded(comment.id, true);
		}
		this.relayout();
	}

	get isExpanded(): boolean {
		return this._isExpanded;
	}

	/**
	 * Collapse the widget body.
	 */
	collapse(): void {
		for (const comment of this._commentItems) {
			this._setCommentExpanded(comment.id, false);
		}
		this.clearFocus();
		this.relayout();
	}

	/**
	 * Focus a specific feedback item within this widget.
	 * Reveals it in the card stack and highlights its editor range.
	 */
	focusFeedback(feedbackId: string): void {
		// Clear previous focus
		for (const el of this._itemElements.values()) {
			el.classList.remove('focused');
		}

		const feedback = this._commentItems.find(f => f.id === feedbackId);
		if (!feedback) {
			return;
		}

		// Add focused class to the item
		const itemEl = this._itemElements.get(feedbackId);
		itemEl?.classList.add('focused');
		if (itemEl && this._bodyNode.classList.contains('scrollable')) {
			const itemTop = itemEl.offsetTop;
			const itemHeight = itemEl.offsetHeight;
			const itemBottom = itemTop + itemHeight;
			const { scrollTop, clientHeight } = this._bodyNode;
			const overlapsViewport = itemBottom > scrollTop && itemTop < scrollTop + clientHeight;
			if (itemHeight <= clientHeight || !overlapsViewport) {
				this._bodyNode.scrollTop = Math.min(itemTop, Math.max(scrollTop, itemBottom - clientHeight));
			}
		}

		// Show range highlighting
		this._highlightRange(feedback);
	}

	/**
	 * Clear focus state and range highlighting.
	 */
	clearFocus(): void {
		for (const el of this._itemElements.values()) {
			el.classList.remove('focused');
		}
		this._rangeHighlightDecoration.clear();
	}

	private _highlightRange(feedback: ISessionEditorComment): void {
		const endLineNumber = feedback.range.endLineNumber;
		const range = new Range(
			feedback.range.startLineNumber, 1,
			endLineNumber, this._editor.getModel()?.getLineMaxColumn(endLineNumber) ?? 1
		);
		this._rangeHighlightDecoration.set([
			{
				range,
				options: {
					description: 'agent-feedback-range-highlight',
					className: 'rangeHighlight',
					isWholeLine: true,
					linesDecorationsClassName: 'agent-feedback-widget-range-glyph',
				}
			},
			{
				range,
				options: {
					description: 'agent-feedback-range-highlight-overview',
					overviewRuler: {
						color: themeColorFromId(overviewRulerRangeHighlight),
						position: OverviewRulerLane.Full,
					}
				}
			}
		]);
	}

	/**
	 * Returns true if this widget contains the given feedback item (by id).
	 */
	containsFeedback(feedbackId: string): boolean {
		return this._commentItems.some(f => f.id === feedbackId);
	}

	/**
	 * Returns the comment id whose open composer is the given element, or
	 * `undefined` if none. Lets the contribution restore focus after a rebuild.
	 */
	findComposerCommentIdForElement(element: HTMLElement): string | undefined {
		for (const [commentId, { textarea }] of [...this._activeEditInputs, ...this._activeReplyInputs]) {
			if (textarea === element) {
				return commentId;
			}
		}
		return undefined;
	}

	/**
	 * Ids of the comments rendered by this widget. Used by the contribution
	 * to prune draft state for comments that no longer exist.
	 */
	getCommentIds(): readonly string[] {
		return this._commentItems.map(comment => comment.id);
	}

	/**
	 * Lays out previews and keeps groups with visible comment ranges inside the editor viewport.
	 */
	layout(startLineNumber: number): void {
		if (this._disposed) {
			return;
		}

		// Invalidate the reserved-width cache when the anchor line changes so it
		// is recomputed for the new line during `layoutOverlayWidget` below.
		if (startLineNumber !== this._startLineNumber) {
			this._cachedMinContentWidth = undefined;
		}

		this._startLineNumber = startLineNumber;

		const bodyScrollTop = this._bodyNode.scrollTop;
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const { contentLeft, contentWidth, verticalScrollbarWidth, horizontalScrollbarHeight, height } = this._editor.getLayoutInfo();
		const scrollTop = this._editor.getScrollTop();
		const availableHeight = Math.max(0, height - horizontalScrollbarHeight);
		this._domNode.style.maxWidth = `${Math.max(0, contentWidth - 2 * verticalScrollbarWidth)}px`;
		this._bodyNode.style.maxHeight = `${availableHeight}px`;
		this._updateTextPreviews();

		const scrollable = this._bodyNode.scrollHeight > availableHeight;
		if (scrollable !== this._bodyNode.classList.contains('scrollable')) {
			this._bodyNode.classList.toggle('scrollable', scrollable);
			if (scrollable) {
				this._bodyNode.tabIndex = 0;
				this._bodyNode.setAttribute('role', 'region');
				this._bodyNode.setAttribute('aria-label', nls.localize('scrollableComments', "Scrollable comments"));
			} else {
				this._bodyNode.removeAttribute('tabindex');
				this._bodyNode.removeAttribute('role');
				this._bodyNode.removeAttribute('aria-label');
			}
			this._updateTextPreviews();
		}
		if (this._bodyNode.scrollTop !== bodyScrollTop) {
			this._bodyNode.scrollTop = bodyScrollTop;
		}

		const renderedWidth = getTotalWidth(this._domNode);
		if (this._cachedMinContentWidth && this._cachedMinContentWidth.widgetWidth !== renderedWidth) {
			this._cachedMinContentWidth = undefined;
		}
		const widgetWidth = renderedWidth || AgentFeedbackEditorWidget._estimatedWidgetWidth;
		const widgetHeight = this._domNode.offsetHeight || 0;
		const headerHeight = this._bodyNode.firstElementChild?.firstElementChild?.clientHeight || lineHeight;

		// Align the header center with the start line center before clamping within the editor content area.
		const contentRelativeTop = this._editor.getTopForLineNumber(startLineNumber) + (lineHeight - headerHeight) / 2;
		const scrollHeight = this._editor.getScrollHeight() - horizontalScrollbarHeight;
		const clampedContentTop = Math.min(Math.max(0, contentRelativeTop), Math.max(0, scrollHeight - widgetHeight));
		const anchorTop = contentRelativeTop - scrollTop;
		const groupBottom = this._editor.getBottomForLineNumber(Math.max(startLineNumber, this._endLineNumber)) - scrollTop;
		const groupVisible = anchorTop < availableHeight && groupBottom > 0;
		const viewportTop = clampedContentTop - scrollTop;

		this._position = {
			stackOrdinal: 2,
			preference: {
				top: groupVisible ? Math.max(0, Math.min(viewportTop, availableHeight - widgetHeight)) : viewportTop,
				left: contentLeft + contentWidth - (2 * verticalScrollbarWidth + widgetWidth)
			}
		};

		this._editor.layoutOverlayWidget(this);
	}

	/**
	 * Shows or hides the widget.
	 */
	toggle(show: boolean): void {
		this._domNode.classList.toggle('visible', show);
		this._domNode.inert = !show;
		if (show && this._commentItems.length > 0) {
			this.layout(this._commentItems[0].range.startLineNumber);
		}
	}

	/**
	 * Relayouts the widget at its current line number.
	 */
	relayout(): void {
		if (this._startLineNumber) {
			this.layout(this._startLineNumber);
		}
	}

	// IOverlayWidget implementation

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return this._position;
	}

	/**
	 * Reserves horizontal scroll space for the card plus its anchored code so covered lines can be revealed.
	 * Caches measurements only while the anchor and rendered card width are unchanged.
	 */
	getMinContentWidthInPx(): number {
		if (this._disposed) {
			return 0;
		}

		if (this._cachedMinContentWidth !== undefined) {
			return this._cachedMinContentWidth.value;
		}

		const model = this._editor.getModel();
		if (!model) {
			return 0;
		}

		// Use the real rendered width when available, otherwise fall back to an
		// estimate. When estimating we avoid caching so the value is recomputed
		// once the widget has actually been rendered.
		const renderedWidth = getTotalWidth(this._domNode);
		const hasRenderedWidth = renderedWidth > 0;
		const widgetWidth = hasRenderedWidth ? renderedWidth : AgentFeedbackEditorWidget._estimatedWidgetWidth;

		const lineCount = model.getLineCount();
		let maxLineWidth = 0;
		let measuredAnyLine = false;
		for (let lineNumber = this._startLineNumber - 1; lineNumber <= this._startLineNumber + 1; lineNumber++) {
			if (lineNumber < 1 || lineNumber > lineCount) {
				continue;
			}
			// Returns -1 when the line is not currently rendered; ignore those.
			const lineWidth = this._editor.getWidthOfLine(lineNumber);
			if (lineWidth < 0) {
				continue;
			}
			measuredAnyLine = true;
			if (lineWidth > maxLineWidth) {
				maxLineWidth = lineWidth;
			}
		}

		const { verticalScrollbarWidth } = this._editor.getLayoutInfo();
		const result = maxLineWidth + widgetWidth + 2 * verticalScrollbarWidth;

		// Only cache once the computation is based on the real widget width and
		// at least one anchored line has actually been measured; otherwise keep
		// recomputing so the value settles once everything is rendered.
		if (hasRenderedWidth && measuredAnyLine) {
			this._cachedMinContentWidth = { widgetWidth: renderedWidth, value: result };
		}

		return result;
	}

	override dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._rangeHighlightDecoration.clear();
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	private _revealComment(comment: ISessionEditorComment): void {
		const range = new Range(
			comment.range.startLineNumber,
			1,
			comment.range.endLineNumber,
			this._editor.getModel()?.getLineMaxColumn(comment.range.endLineNumber) ?? 1,
		);
		this._editor.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
	}
}
