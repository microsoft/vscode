/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentFeedbackEditorWidget.css';

import { $, addDisposableListener, addStandardDisposableListener, clearNode, getTotalWidth, isHTMLElement } from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
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
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { ICodeReviewService } from '../../codeReview/browser/codeReviewService.js';
import { createAgentFeedbackContext } from './agentFeedbackEditorUtils.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from './agentFeedbackService.js';
import { IAgentFeedbackReply } from './agentFeedbackModel.js';
import { ISessionEditorComment, SessionEditorCommentSource, toSessionEditorCommentId } from './sessionEditorComments.js';

interface ICommentItemActions {
	editAction?: Action;
	removeAction?: Action;
	addReplyAction?: Action;
}

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
 * Positioned on the right side of the editor like a speech bubble.
 */
export class AgentFeedbackEditorWidget extends Disposable implements IOverlayWidget {

	private static _idPool = 0;

	/**
	 * Estimated widget width in px used while the widget DOM node has not been
	 * laid out yet. Matches the `max-width` of `.agent-feedback-widget` so we
	 * reserve enough scroll space up front; the real width replaces it once the
	 * node is rendered.
	 */
	private static readonly _estimatedWidgetWidth = 280;

	private readonly _id: string = `agent-feedback-widget-${AgentFeedbackEditorWidget._idPool++}`;

	private readonly _domNode: HTMLElement;
	private readonly _headerNode: HTMLElement;
	private readonly _titleNode: HTMLElement;
	private readonly _toggleButton: HTMLElement;
	private readonly _bodyNode: HTMLElement;
	private readonly _itemElements = new Map<string, HTMLElement>();
	private readonly _activeReplyInputs = new Map<string, IActiveInput>();
	private readonly _activeEditInputs = new Map<string, IActiveInput>();
	private readonly _actionBarElements = new Map<string, HTMLElement>();

	private _position: IOverlayWidgetPosition | null = null;
	private _composerToFocus: HTMLTextAreaElement | undefined;
	private _isExpanded: boolean = false;
	private _disposed: boolean = false;
	private _startLineNumber: number = 1;
	private _cachedMinContentWidth: number | undefined;
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
	) {
		super();

		this._rangeHighlightDecoration = this._editor.createDecorationsCollection();

		// Create DOM structure
		this._domNode = $('div.agent-feedback-widget');
		this._domNode.classList.add('collapsed');
		// Make focusable so that mousedown in selectable regions can pull focus
		// away from the editor's textarea, allowing native Ctrl/Cmd+C to copy
		// the DOM selection of the comment content.
		this._domNode.tabIndex = -1;

		// Header
		this._headerNode = $('div.agent-feedback-widget-header');

		// Comment icon (decorative, hidden from screen readers)
		const commentIcon = renderIcon(Codicon.comment);
		commentIcon.setAttribute('aria-hidden', 'true');
		this._headerNode.appendChild(commentIcon);

		// Title showing feedback count
		this._titleNode = $('span.agent-feedback-widget-title');
		this._updateTitle();
		this._headerNode.appendChild(this._titleNode);

		// Spacer
		this._headerNode.appendChild($('span.agent-feedback-widget-spacer'));

		// Toggle expand/collapse button
		this._toggleButton = $('div.agent-feedback-widget-toggle');
		this._updateToggleButton();
		this._headerNode.appendChild(this._toggleButton);

		this._domNode.appendChild(this._headerNode);

		// Body (collapsible) — starts collapsed
		this._bodyNode = $('div.agent-feedback-widget-body');
		this._bodyNode.classList.add('collapsed');
		this._buildFeedbackItems();
		this._domNode.appendChild(this._bodyNode);

		// Arrow pointer
		const arrow = $('div.agent-feedback-widget-arrow');
		this._domNode.appendChild(arrow);

		// Event handlers
		this._setupEventHandlers();

		// Add visible class for initial display
		this._domNode.classList.add('visible');

		// Add to editor
		this._editor.addOverlayWidget(this);
	}

	private _setupEventHandlers(): void {
		// Toggle button click - expand/collapse
		this._eventStore.add(addDisposableListener(this._toggleButton, 'click', (e) => {
			e.stopPropagation();
			this._toggleExpanded();
		}));

		// Header click - also toggles expand/collapse
		this._eventStore.add(addDisposableListener(this._headerNode, 'click', () => {
			this._toggleExpanded();
		}));

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

	private _toggleExpanded(): void {
		if (this._isExpanded) {
			this.collapse();
		} else {
			this.expand();
		}
	}

	private _updateTitle(): void {
		const count = this._commentItems.length;
		if (count === 1) {
			this._titleNode.textContent = this._commentItems[0].text;
		} else {
			this._titleNode.textContent = nls.localize('nComments', "{0} comments", count);
		}
	}

	private _updateToggleButton(): void {
		clearNode(this._toggleButton);
		if (this._isExpanded) {
			this._toggleButton.appendChild(renderIcon(Codicon.chevronUp));
			this._toggleButton.title = nls.localize('collapse', "Collapse");
		} else {
			this._toggleButton.appendChild(renderIcon(Codicon.chevronDown));
			this._toggleButton.title = nls.localize('expand', "Expand");
		}
	}

	private _buildFeedbackItems(): void {
		clearNode(this._bodyNode);
		this._itemElements.clear();
		this._activeReplyInputs.clear();
		this._activeEditInputs.clear();
		this._actionBarElements.clear();

		for (const comment of this._commentItems) {
			const item = $('div.agent-feedback-widget-item');
			item.classList.add(`agent-feedback-widget-item-${comment.source}`);
			if (comment.suggestion) {
				item.classList.add('agent-feedback-widget-item-suggestion');
			}
			this._itemElements.set(comment.id, item);

			const itemHeader = $('div.agent-feedback-widget-item-header');
			const itemMeta = $('div.agent-feedback-widget-item-meta');

			const lineInfo = $('span.agent-feedback-widget-line-info');
			if (comment.range.startLineNumber === comment.range.endLineNumber) {
				lineInfo.textContent = nls.localize('lineNumber', "Line {0}", comment.range.startLineNumber);
			} else {
				lineInfo.textContent = nls.localize('lineRange', "Lines {0}-{1}", comment.range.startLineNumber, comment.range.endLineNumber);
			}
			itemMeta.appendChild(lineInfo);

			const typeLabel = this._getTypeLabel(comment);
			if (typeLabel) {
				const typeBadge = $('span.agent-feedback-widget-item-type');
				typeBadge.textContent = typeLabel;
				itemMeta.appendChild(typeBadge);
			}

			itemHeader.appendChild(itemMeta);

			const actionBarContainer = $('div.agent-feedback-widget-item-actions');
			const actionBar = this._eventStore.add(new ActionBar(actionBarContainer));

			const itemActions: ICommentItemActions = {};
			const showActionButtonsBar = comment.canConvertToAgentFeedback
				|| (comment.source === SessionEditorCommentSource.AgentFeedback && comment.state === AgentFeedbackState.Created);

			if (comment.state === AgentFeedbackState.Resolved) {
				actionBar.push(this._eventStore.add(new Action(
					'agentFeedback.widget.hide',
					nls.localize('hideComment', "Hide"),
					ThemeIcon.asClassName(Codicon.close),
					true,
					() => this._hideComment(comment),
				)), { icon: true, label: false });
			} else {
				itemActions.addReplyAction = this._eventStore.add(new Action(
					'agentFeedback.widget.addReply',
					nls.localize('addToComment', "Add to Comment"),
					ThemeIcon.asClassName(Codicon.commentDiscussion),
					true,
					(): void => { this._startAddingReply(comment, item, itemActions); },
				));
				actionBar.push(itemActions.addReplyAction, { icon: true, label: false });

				itemActions.editAction = this._eventStore.add(new Action(
					'agentFeedback.widget.edit',
					nls.localize('editComment', "Edit"),
					ThemeIcon.asClassName(Codicon.edit),
					true,
					(): void => { this._startEditing(comment, text, itemActions); },
				));
				actionBar.push(itemActions.editAction, { icon: true, label: false });

				itemActions.removeAction = this._eventStore.add(new Action(
					'agentFeedback.widget.remove',
					nls.localize('removeComment', "Remove"),
					ThemeIcon.asClassName(Codicon.close),
					true,
					() => this._removeComment(comment),
				));
				if (!showActionButtonsBar) {
					actionBar.push(itemActions.removeAction, { icon: true, label: false });
				}
			}

			itemHeader.appendChild(actionBarContainer);
			item.appendChild(itemHeader);

			const text = $('div.agent-feedback-widget-text');
			const rendered = this._markdownRendererService.render(new MarkdownString(comment.text));
			this._eventStore.add(rendered);
			text.appendChild(rendered.element);
			item.appendChild(text);

			if (comment.suggestion?.edits.length) {
				item.appendChild(this._renderSuggestion(comment));
			}

			if (comment.replies?.length) {
				item.appendChild(this._renderReplies(comment.replies));
			}

			if (showActionButtonsBar) {
				this._renderActionButtons(comment, item);
			}

			this._eventStore.add(addDisposableListener(item, 'mouseenter', () => {
				this._highlightRange(comment);
			}));

			this._eventStore.add(addDisposableListener(item, 'mouseleave', () => {
				this._rangeHighlightDecoration.clear();
			}));

			this._eventStore.add(addDisposableListener(item, 'click', e => {
				const target = e.target as HTMLElement | null;
				if (target?.closest('.action-bar')) {
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
			const draft = this._composerDraftState?.drafts.get(comment.id);
			if (draft?.kind === ComposerKind.Reply) {
				this._startAddingReply(comment, item, itemActions, draft.text);
			} else if (draft?.kind === ComposerKind.Edit) {
				this._startEditing(comment, text, itemActions, draft.text);
			}
		}
	}

	private _getTypeLabel(comment: ISessionEditorComment): string | undefined {
		switch (comment.kind) {
			case AgentFeedbackKind.PRReview:
				return nls.localize('prReviewComment', "PR Review");
			case AgentFeedbackKind.AgentReview:
				return nls.localize('agentReviewComment', "Agent Review");
			default:
				return undefined;
		}
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
			const rendered = this._markdownRendererService.render(new MarkdownString(reply.text));
			this._eventStore.add(rendered);
			replyText.appendChild(rendered.element);
			replyNode.appendChild(replyText);
			repliesNode.appendChild(replyNode);
		}

		return repliesNode;
	}

	/**
	 * Renders the Accept / Remove button bar shown at the bottom of a
	 * `created` agent feedback comment or a PR review comment. Clicking either
	 * button performs the action and removes the bar. For PR review comments
	 * "Accept" converts the comment into agent feedback; for agent feedback it
	 * marks the comment as accepted.
	 */
	private _renderActionButtons(comment: ISessionEditorComment, item: HTMLElement): void {
		const buttonBar = $('div.agent-feedback-widget-actions-bar');

		const buttonStore = new DisposableStore();
		this._eventStore.add(buttonStore);

		// Prevent clicks on the button bar from bubbling up to the item click
		// handler (which would navigate/reveal the comment).
		buttonStore.add(addDisposableListener(buttonBar, 'click', e => e.stopPropagation()));

		const dismiss = () => {
			buttonStore.dispose();
			buttonBar.remove();
			this._actionBarElements.delete(comment.id);
			// Move focus back to the widget so keyboard/screen reader users
			// don't lose their place when the (now removed) button is gone.
			this._domNode.focus({ preventScroll: true });
			this._editor.layoutOverlayWidget(this);
		};

		const isPRComment = comment.source === SessionEditorCommentSource.PRReview;
		const acceptTooltip = isPRComment
			? nls.localize('acceptPRFeedbackTooltip', "Share PR comment with agent")
			: nls.localize('acceptAgentFeedbackTooltip', "Share comment with agent");
		const deleteTooltip = isPRComment
			? nls.localize('deletePRFeedbackTooltip', "Remove and mark as resolved on GitHub")
			: nls.localize('deleteAgentFeedbackTooltip', "Remove agent comment");

		const acceptButton = buttonStore.add(new Button(buttonBar, {
			title: acceptTooltip,
			buttonBackground: 'var(--vscode-charts-purple)',
			buttonHoverBackground: 'color-mix(in srgb, var(--vscode-charts-purple) 85%, var(--vscode-foreground))',
			buttonForeground: 'var(--vscode-button-foreground)',
			buttonBorder: 'var(--vscode-charts-purple)',
		}));
		acceptButton.label = nls.localize('acceptFeedbackButton', "Accept");
		buttonStore.add(acceptButton.onDidClick(() => {
			if (comment.canConvertToAgentFeedback) {
				this._convertToAgentFeedback(comment);
			} else {
				this._acceptFeedback(comment);
			}
			dismiss();
		}));

		const deleteButton = buttonStore.add(new Button(buttonBar, {
			title: deleteTooltip,
			secondary: true,
			buttonSecondaryBackground: 'var(--vscode-button-secondaryBackground)',
			buttonSecondaryHoverBackground: 'var(--vscode-button-secondaryHoverBackground)',
			buttonSecondaryForeground: 'var(--vscode-button-secondaryForeground)',
			buttonSecondaryBorder: 'var(--vscode-button-secondaryBorder)',
		}));
		deleteButton.label = nls.localize('deleteFeedbackButton', "Delete");
		buttonStore.add(deleteButton.onDidClick(() => {
			this._removeComment(comment);
			dismiss();
		}));

		item.appendChild(buttonBar);
		this._actionBarElements.set(comment.id, buttonBar);
	}

	private _removeComment(comment: ISessionEditorComment): void {
		if (comment.source === SessionEditorCommentSource.PRReview) {
			this._codeReviewService.resolvePRReviewThread(this._sessionResource!, comment.sourceId);
			return;
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

		const textarea = $('textarea.agent-feedback-widget-edit-textarea') as HTMLTextAreaElement;
		textarea.value = restoredText ?? comment.text;
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
			this._editor.layoutOverlayWidget(this);
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
		textarea.rows = 1;
		if (restoredText !== undefined) {
			textarea.value = restoredText;
		}
		replyContainer.appendChild(textarea);
		// Keep the action button bar (Accept/Remove) as the very last element so
		// the reply composer appears above it.
		const actionsBar = this._actionBarElements.get(comment.id);
		if (actionsBar) {
			itemNode.insertBefore(replyContainer, actionsBar);
		} else {
			itemNode.appendChild(replyContainer);
		}
		this._activeReplyInputs.set(comment.id, { textarea, cancel: () => cleanup() });
		this._setDraft(comment.id, ComposerKind.Reply, textarea.value);

		const autoSize = () => {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight}px`;
			this._editor.layoutOverlayWidget(this);
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
			this._editor.layoutOverlayWidget(this);
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
		const rendered = this._markdownRendererService.render(new MarkdownString(comment.text));
		this._eventStore.add(rendered);
		textContainer.appendChild(rendered.element);
		this._editor.layoutOverlayWidget(this);
	}

	private _setItemActionsEnabled(actions: ICommentItemActions, enabled: boolean): void {
		for (const action of [actions.editAction, actions.removeAction, actions.addReplyAction]) {
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
		);
		this._agentFeedbackService.setNavigationAnchor(this._sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedback.id));
		this._codeReviewService.markPRReviewCommentConverted(this._sessionResource, comment.sourceId);
	}

	/**
	 * Expand the widget body.
	 */
	expand(): void {
		const wasExpanded = this._isExpanded;
		this._isExpanded = true;
		this._domNode.classList.remove('collapsed');
		this._bodyNode.classList.remove('collapsed');
		this._updateToggleButton();
		this._editor.layoutOverlayWidget(this);
		if (!wasExpanded) {
			this._onDidExpand.fire();
		}
	}

	get isExpanded(): boolean {
		return this._isExpanded;
	}

	/**
	 * Collapse the widget body.
	 */
	collapse(): void {
		this._isExpanded = false;
		this._domNode.classList.add('collapsed');
		this._bodyNode.classList.add('collapsed');
		this._updateToggleButton();
		this.clearFocus();
		this._editor.layoutOverlayWidget(this);
	}

	/**
	 * Focus a specific feedback item within this widget.
	 * Highlights its range in the editor and marks it as focused.
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
	 * Updates the widget position and layout.
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

		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const { contentLeft, contentWidth, verticalScrollbarWidth } = this._editor.getLayoutInfo();
		const scrollTop = this._editor.getScrollTop();

		const widgetWidth = getTotalWidth(this._domNode) || 280;
		const widgetHeight = this._domNode.offsetHeight || 0;
		const headerHeight = this._headerNode.offsetHeight || lineHeight;

		// Align the header center with the start line center before clamping within the editor content area.
		const contentRelativeTop = this._editor.getTopForLineNumber(startLineNumber) + (lineHeight - headerHeight) / 2;
		const scrollHeight = this._editor.getScrollHeight();
		const clampedContentTop = Math.min(Math.max(0, contentRelativeTop), Math.max(0, scrollHeight - widgetHeight));

		this._position = {
			stackOrdinal: 2,
			preference: {
				top: clampedContentTop - scrollTop,
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
	 * Reserve enough horizontal scroll width so the user can always scroll the
	 * editor content out from underneath the widget. The widget is anchored to
	 * the right edge of the editor content area, so without this reservation any
	 * line that extends under the widget cannot be revealed because the editor
	 * cannot scroll past its longest line.
	 *
	 * The reserved width is the widget width plus the widest content among the
	 * anchored line and the lines immediately above and below it. The result is
	 * computed once using the real rendered widget width and cached afterwards.
	 * Until the widget DOM node has a real width we fall back to an estimate and
	 * skip caching so the value is recomputed once it is actually rendered. The
	 * cache is also invalidated by `layout` whenever the anchor line changes.
	 */
	getMinContentWidthInPx(): number {
		if (this._disposed) {
			return 0;
		}

		if (this._cachedMinContentWidth !== undefined) {
			return this._cachedMinContentWidth;
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
			this._cachedMinContentWidth = result;
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
