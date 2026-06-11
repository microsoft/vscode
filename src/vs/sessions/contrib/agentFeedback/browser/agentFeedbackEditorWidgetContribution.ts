/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentFeedbackEditorWidget.css';

import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IEditorContribution, IEditorDecorationsCollection, ScrollType } from '../../../../editor/common/editorCommon.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { $, addDisposableListener, addStandardDisposableListener, clearNode, getTotalWidth, isHTMLElement } from '../../../../base/browser/dom.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { overviewRulerRangeHighlight } from '../../../../editor/common/core/editorColorRegistry.js';
import { OverviewRulerLane } from '../../../../editor/common/model.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import * as nls from '../../../../nls.js';
import { AgentFeedbackKind, IAgentFeedbackService, AgentFeedbackState } from './agentFeedbackService.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { createAgentFeedbackContext } from './agentFeedbackEditorUtils.js';
import { ICodeReviewService, IPRReviewState } from '../../codeReview/browser/codeReviewService.js';
import { getSessionEditorComments, groupNearbySessionEditorComments, ISessionEditorComment, SessionEditorCommentSource, toSessionEditorCommentId } from './sessionEditorComments.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { ISessionFileChange } from '../../../services/sessions/common/session.js';

interface ICommentItemActions {
	editAction: Action;
	convertAction: Action | undefined;
	removeAction: Action;
	addReplyAction: Action;
}

/**
 * Shared in-progress reply state that survives widget rebuilds. The contribution
 * owns the single instance and hands it to each widget so drafts (and focus)
 * are not lost when widgets are torn down and recreated in response to
 * unrelated feedback / review changes.
 */
interface IReplyDraftState {
	readonly drafts: Map<string, string>;
	focusedCommentId: string | undefined;
}

/**
 * Widget that displays agent feedback comments for a group of nearby feedback items.
 * Positioned on the right side of the editor like a speech bubble.
 */
export class AgentFeedbackEditorWidget extends Disposable implements IOverlayWidget {

	private static _idPool = 0;
	private readonly _id: string = `agent-feedback-widget-${AgentFeedbackEditorWidget._idPool++}`;

	private readonly _domNode: HTMLElement;
	private readonly _headerNode: HTMLElement;
	private readonly _titleNode: HTMLElement;
	private readonly _toggleButton: HTMLElement;
	private readonly _bodyNode: HTMLElement;
	private readonly _itemElements = new Map<string, HTMLElement>();
	private readonly _activeReplyInputs = new Map<string, { container: HTMLElement; textarea: HTMLTextAreaElement }>();

	private _position: IOverlayWidgetPosition | null = null;
	private _isExpanded: boolean = false;
	private _disposed: boolean = false;
	private _startLineNumber: number = 1;
	private readonly _rangeHighlightDecoration: IEditorDecorationsCollection;

	private readonly _eventStore = this._register(new DisposableStore());

	private readonly _onDidExpand = this._register(new Emitter<void>());
	readonly onDidExpand: Event<void> = this._onDidExpand.event;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _commentItems: readonly ISessionEditorComment[],
		private readonly _sessionResource: URI,
		private readonly _replyDraftState: IReplyDraftState | undefined,
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

			const itemActions: ICommentItemActions = { editAction: undefined!, convertAction: undefined, removeAction: undefined!, addReplyAction: undefined! };

			itemActions.editAction = this._eventStore.add(new Action(
				'agentFeedback.widget.edit',
				nls.localize('editComment', "Edit"),
				ThemeIcon.asClassName(Codicon.edit),
				true,
				(): void => { this._startEditing(comment, text, itemActions); },
			));
			actionBar.push(itemActions.editAction, { icon: true, label: false });

			itemActions.addReplyAction = this._eventStore.add(new Action(
				'agentFeedback.widget.addReply',
				nls.localize('addToComment', "Add to Comment"),
				ThemeIcon.asClassName(Codicon.commentDiscussion),
				true,
				(): void => { this._startAddingReply(comment, item, itemActions); },
			));
			actionBar.push(itemActions.addReplyAction, { icon: true, label: false });

			if (comment.canConvertToAgentFeedback) {
				itemActions.convertAction = this._eventStore.add(new Action(
					'agentFeedback.widget.convert',
					nls.localize('convertComment', "Convert to Agent Feedback"),
					ThemeIcon.asClassName(Codicon.check),
					true,
					() => this._convertToAgentFeedback(comment),
				));
				actionBar.push(itemActions.convertAction, { icon: true, label: false });
			}
			if (comment.source === SessionEditorCommentSource.AgentFeedback && comment.state === AgentFeedbackState.Created) {
				const acceptAction = this._eventStore.add(new Action(
					'agentFeedback.widget.accept',
					nls.localize('acceptComment', "Accept"),
					ThemeIcon.asClassName(Codicon.check),
					true,
					() => { this._acceptFeedback(comment); return Promise.resolve(); },
				));
				actionBar.push(acceptAction, { icon: true, label: false });
			}
			itemActions.removeAction = this._eventStore.add(new Action(
				'agentFeedback.widget.remove',
				nls.localize('removeComment', "Remove"),
				ThemeIcon.asClassName(Codicon.close),
				true,
				() => this._removeComment(comment),
			));
			actionBar.push(itemActions.removeAction, { icon: true, label: false });

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
				if (target?.closest('.agent-feedback-widget-text, .agent-feedback-widget-suggestion-text, .agent-feedback-widget-reply-text')) {
					this._domNode.focus({ preventScroll: true });
				}
			};
			this._eventStore.add(addDisposableListener(item, 'mousedown', onSelectableMousedown));

			this._bodyNode.appendChild(item);

			// Restore an in-progress reply draft if one exists for this comment.
			// This keeps the reply input alive across widget rebuilds that
			// happen while the user is typing (e.g. when an unrelated feedback
			// or review change fires onDidChangeFeedback).
			const draft = this._replyDraftState?.drafts.get(comment.id);
			if (draft !== undefined) {
				this._startAddingReply(comment, item, itemActions, draft);
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

	private _renderReplies(replies: readonly string[]): HTMLElement {
		const repliesNode = $('div.agent-feedback-widget-replies');

		for (const reply of replies) {
			const replyNode = $('div.agent-feedback-widget-reply');
			const replyText = $('div.agent-feedback-widget-reply-text');
			const rendered = this._markdownRendererService.render(new MarkdownString(reply));
			this._eventStore.add(rendered);
			replyText.appendChild(rendered.element);
			replyNode.appendChild(replyText);
			repliesNode.appendChild(replyNode);
		}

		return repliesNode;
	}

	private _removeComment(comment: ISessionEditorComment): void {
		if (comment.source === SessionEditorCommentSource.PRReview) {
			this._codeReviewService.resolvePRReviewThread(this._sessionResource!, comment.sourceId);
			return;
		}

		this._agentFeedbackService.removeFeedback(this._sessionResource, comment.sourceId);
	}

	private _startEditing(comment: ISessionEditorComment, textContainer: HTMLElement, actions: ICommentItemActions): void {
		// Disable all actions while editing
		actions.editAction.enabled = false;
		if (actions.convertAction) {
			actions.convertAction.enabled = false;
		}
		actions.removeAction.enabled = false;
		actions.addReplyAction.enabled = false;

		const editStore = new DisposableStore();
		this._eventStore.add(editStore);

		clearNode(textContainer);
		textContainer.classList.add('editing');

		const textarea = $('textarea.agent-feedback-widget-edit-textarea') as HTMLTextAreaElement;
		textarea.value = comment.text;
		textarea.rows = 1;
		textContainer.appendChild(textarea);

		// Auto-size the textarea
		const autoSize = () => {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight}px`;
			this._editor.layoutOverlayWidget(this);
		};
		autoSize();

		editStore.add(addDisposableListener(textarea, 'input', autoSize));

		editStore.add(addStandardDisposableListener(textarea, 'keydown', (e) => {
			if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				const newText = textarea.value.trim();
				if (newText) {
					this._saveEdit(comment, newText);
				}
				// Widget will be rebuilt by the change event
			} else if (e.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this._stopEditing(comment, textContainer, editStore, actions);
			}
		}));

		// Stop editing when focus is lost
		editStore.add(addDisposableListener(textarea, 'blur', () => {
			this._stopEditing(comment, textContainer, editStore, actions);
		}));

		textarea.focus();
	}

	private _startAddingReply(comment: ISessionEditorComment, itemNode: HTMLElement, actions: ICommentItemActions, initialText?: string): void {
		// If a reply input is already open for this item, just focus it.
		const existing = this._activeReplyInputs.get(comment.id);
		if (existing) {
			existing.textarea.focus();
			return;
		}

		// Disable item actions while replying so the action bar doesn't conflict.
		actions.editAction.enabled = false;
		if (actions.convertAction) {
			actions.convertAction.enabled = false;
		}
		actions.removeAction.enabled = false;
		actions.addReplyAction.enabled = false;

		const replyStore = new DisposableStore();
		this._eventStore.add(replyStore);

		const replyContainer = $('div.agent-feedback-widget-add-reply');
		const textarea = $('textarea.agent-feedback-widget-edit-textarea') as HTMLTextAreaElement;
		textarea.placeholder = nls.localize('addReplyPlaceholder', "Add a comment\u2026");
		textarea.rows = 1;
		if (initialText !== undefined) {
			textarea.value = initialText;
		}
		replyContainer.appendChild(textarea);
		itemNode.appendChild(replyContainer);
		this._activeReplyInputs.set(comment.id, { container: replyContainer, textarea });

		// Ensure the draft store has an entry so subsequent rebuilds know to
		// restore the input even before the user has typed anything.
		this._replyDraftState?.drafts.set(comment.id, textarea.value);

		const autoSize = () => {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight}px`;
			this._editor.layoutOverlayWidget(this);
		};
		autoSize();

		replyStore.add(addDisposableListener(textarea, 'input', () => {
			this._replyDraftState?.drafts.set(comment.id, textarea.value);
			autoSize();
		}));

		const clearDraft = () => {
			if (!this._replyDraftState) {
				return;
			}
			this._replyDraftState.drafts.delete(comment.id);
			if (this._replyDraftState.focusedCommentId === comment.id) {
				this._replyDraftState.focusedCommentId = undefined;
			}
		};

		const cleanup = () => {
			replyStore.dispose();
			actions.editAction.enabled = true;
			if (actions.convertAction) {
				actions.convertAction.enabled = true;
			}
			actions.removeAction.enabled = true;
			actions.addReplyAction.enabled = true;
			this._activeReplyInputs.delete(comment.id);
			replyContainer.remove();
			clearDraft();
			this._editor.layoutOverlayWidget(this);
		};

		replyStore.add(addStandardDisposableListener(textarea, 'keydown', (e) => {
			if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				const newReply = textarea.value.trim();
				if (newReply) {
					// Clear the draft before triggering the change so the
					// rebuilt widget doesn't re-open the reply input.
					clearDraft();
					this._saveReply(comment, newReply);
					// Widget will be rebuilt by the change event.
				} else {
					cleanup();
				}
			} else if (e.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				cleanup();
			}
		}));

		// Cancel the reply when focus leaves and the textarea is empty.
		// When the textarea contains text, keep it open so the user doesn't
		// lose their draft just because focus moved elsewhere.
		// Skip cleanup entirely if the widget is being disposed — the browser
		// fires blur as part of removing the textarea from the DOM, and we
		// don't want that teardown blur to wipe out the draft that the
		// rebuilt widget needs to restore.
		replyStore.add(addDisposableListener(textarea, 'blur', () => {
			if (this._disposed) {
				return;
			}
			if (textarea.value.trim() === '') {
				cleanup();
			}
		}));

		// Only steal focus when this is an explicit user-triggered open. For
		// drafts restored across a rebuild, only refocus if the textarea had
		// focus at the moment the previous widget was torn down.
		if (initialText === undefined || this._replyDraftState?.focusedCommentId === comment.id) {
			textarea.focus();
			// Place caret at the end of any restored text so typing continues
			// naturally from where the user left off.
			const len = textarea.value.length;
			textarea.setSelectionRange(len, len);
		}
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

		// Re-enable actions
		actions.editAction.enabled = true;
		if (actions.convertAction) {
			actions.convertAction.enabled = true;
		}
		actions.removeAction.enabled = true;
		actions.addReplyAction.enabled = true;

		textContainer.classList.remove('editing');
		clearNode(textContainer);
		const rendered = this._markdownRendererService.render(new MarkdownString(comment.text));
		this._eventStore.add(rendered);
		textContainer.appendChild(rendered.element);
		this._editor.layoutOverlayWidget(this);
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
	 * Returns the comment id whose active reply textarea matches the given
	 * element, or `undefined` if none. Used by the contribution to remember
	 * which reply input had focus immediately before tearing widgets down,
	 * so focus can be restored on the new widget.
	 */
	findReplyCommentIdForElement(element: HTMLElement): string | undefined {
		for (const [commentId, { textarea }] of this._activeReplyInputs) {
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

/**
 * Editor contribution that manages agent feedback widgets.
 * Groups feedback items and creates combined widgets for nearby items.
 * Widgets start collapsed and expand when navigated to.
 */
class AgentFeedbackEditorWidgetContribution extends Disposable implements IEditorContribution {

	static readonly ID = 'agentFeedback.editorWidgetContribution';

	private readonly _widgets: AgentFeedbackEditorWidget[] = [];
	private readonly _widgetListeners = this._register(new DisposableStore());
	private _sessionResource: URI | undefined;

	/**
	 * Reply input state shared across widget rebuilds. Without this, any
	 * unrelated feedback / review state change would dispose the active
	 * widget and discard the textarea the user was typing in.
	 */
	private readonly _replyDraftState: IReplyDraftState = {
		drafts: new Map<string, string>(),
		focusedCommentId: undefined,
	};

	constructor(
		private readonly _editor: ICodeEditor,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ICodeReviewService private readonly _codeReviewService: ICodeReviewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._store.add(this._agentFeedbackService.onDidChangeNavigation(sessionResource => {
			if (this._sessionResource && sessionResource.toString() === this._sessionResource.toString()) {
				this._handleNavigation();
			}
		}));

		const rebuildSignal = observableSignalFromEvent(this, Event.any(
			this._agentFeedbackService.onDidChangeFeedback,
			this._editor.onDidChangeModel,
		));

		this._store.add(Event.any(this._editor.onDidScrollChange, this._editor.onDidLayoutChange)(() => {
			for (const widget of this._widgets) {
				widget.relayout();
			}
		}));

		this._store.add(autorun(reader => {
			rebuildSignal.read(reader);
			this._resolveSession();
			if (!this._sessionResource) {
				this._clearWidgets();
				return;
			}

			this._rebuildWidgets(
				this._codeReviewService.getPRReviewState(this._sessionResource).read(reader),
			);
			this._handleNavigation();
		}));
	}

	private _resolveSession(): void {
		const model = this._editor.getModel();
		if (!model) {
			this._sessionResource = undefined;
			return;
		}
		this._sessionResource = this._agentFeedbackService.getSessionForFile(model.uri)?.resource;
	}

	private _rebuildWidgets(
		prReviewState: IPRReviewState | undefined = this._sessionResource ? this._codeReviewService.getPRReviewState(this._sessionResource).get() : undefined,
	): void {
		this._clearWidgets();

		if (!this._sessionResource) {
			return;
		}

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const comments = getSessionEditorComments(
			this._sessionResource,
			this._agentFeedbackService.getFeedback(this._sessionResource),
			prReviewState,
		);
		const fileComments = this._getCommentsForModel(model.uri, comments);
		if (fileComments.length === 0) {
			return;
		}

		const groups = groupNearbySessionEditorComments(fileComments, 5);

		// Create widgets in reverse file order so that widgets further up in the
		// file are added to the DOM last and therefore render on top of widgets
		// further down.
		for (let i = groups.length - 1; i >= 0; i--) {
			const group = groups[i];
			const widget = this._instantiationService.createInstance(AgentFeedbackEditorWidget, this._editor, group, this._sessionResource, this._replyDraftState);
			this._widgets.push(widget);

			// Ensure only one widget is expanded per file at a time: when a
			// widget expands, collapse all others.
			this._widgetListeners.add(widget.onDidExpand(() => {
				for (const other of this._widgets) {
					if (other !== widget && other.isExpanded) {
						other.collapse();
					}
				}
			}));

			widget.layout(group[0].range.startLineNumber);
		}

		this._pruneOrphanedReplyDrafts();
	}

	/**
	 * Remove draft entries for comments that no longer exist in any widget.
	 * Without this, deleted comments would leave drafts in the map forever.
	 */
	private _pruneOrphanedReplyDrafts(): void {
		if (this._replyDraftState.drafts.size === 0 && this._replyDraftState.focusedCommentId === undefined) {
			return;
		}
		const knownCommentIds = new Set<string>();
		for (const widget of this._widgets) {
			for (const commentId of widget.getCommentIds()) {
				knownCommentIds.add(commentId);
			}
		}
		for (const commentId of [...this._replyDraftState.drafts.keys()]) {
			if (!knownCommentIds.has(commentId)) {
				this._replyDraftState.drafts.delete(commentId);
			}
		}
		if (this._replyDraftState.focusedCommentId !== undefined && !knownCommentIds.has(this._replyDraftState.focusedCommentId)) {
			this._replyDraftState.focusedCommentId = undefined;
		}
	}

	private _getCommentsForModel(resourceUri: URI, comments: readonly ISessionEditorComment[]): readonly ISessionEditorComment[] {
		const change = this._getSessionChangeForResource(resourceUri);
		if (!change) {
			return comments.filter(comment => isEqual(comment.resourceUri, resourceUri));
		}

		if (!this._isCurrentOrModifiedResource(change, resourceUri)) {
			return [];
		}

		return comments.filter(comment => comment.resourceUri.fsPath === resourceUri.fsPath);
	}

	private _getSessionChangeForResource(resourceUri: URI): ISessionFileChange | undefined {
		if (!this._sessionResource) {
			return undefined;
		}

		const changes = this._sessionsManagementService.getSession(this._sessionResource)?.changes.get();
		if (!changes) {
			return undefined;
		}

		return changes.find(change => this._changeMatchesFsPath(change, resourceUri));
	}

	private _changeMatchesFsPath(change: ISessionFileChange, resourceUri: URI): boolean {
		if (isIChatSessionFileChange2(change)) {
			return change.uri.fsPath === resourceUri.fsPath
				|| change.modifiedUri?.fsPath === resourceUri.fsPath
				|| change.originalUri?.fsPath === resourceUri.fsPath;
		}

		return change.modifiedUri.fsPath === resourceUri.fsPath
			|| change.originalUri?.fsPath === resourceUri.fsPath;
	}

	private _isCurrentOrModifiedResource(change: ISessionFileChange, resourceUri: URI): boolean {
		if (isIChatSessionFileChange2(change)) {
			return isEqual(change.uri, resourceUri) || (change.modifiedUri ? isEqual(change.modifiedUri, resourceUri) : false);
		}

		return isEqual(change.modifiedUri, resourceUri);
	}

	private _handleNavigation(): void {
		if (!this._sessionResource) {
			return;
		}

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const comments = getSessionEditorComments(
			this._sessionResource,
			this._agentFeedbackService.getFeedback(this._sessionResource),
			this._codeReviewService.getPRReviewState(this._sessionResource).get(),
		);
		const bearing = this._agentFeedbackService.getNavigationBearing(this._sessionResource, comments);
		if (bearing.activeIdx < 0) {
			return;
		}

		const activeFeedback = comments[bearing.activeIdx];
		if (!activeFeedback) {
			return;
		}

		if (this._getCommentsForModel(model.uri, [activeFeedback]).length === 0) {
			for (const widget of this._widgets) {
				widget.collapse();
			}
			return;
		}

		// Expand the widget containing the active feedback, collapse all others
		for (const widget of this._widgets) {
			if (widget.containsFeedback(activeFeedback.id)) {
				widget.expand();
				widget.focusFeedback(activeFeedback.id);
			} else {
				widget.collapse();
			}
		}

		// Reveal the feedback range in the editor
		const range = new Range(
			activeFeedback.range.startLineNumber, 1,
			activeFeedback.range.endLineNumber, 1
		);
		this._editor.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
	}

	private _clearWidgets(): void {
		// Capture which reply textarea (if any) currently has focus so the
		// rebuilt widget can refocus it. The textarea's own blur event would
		// fire as part of the teardown below and clear this state, so we
		// snapshot it synchronously here instead of relying on focus tracking.
		this._captureFocusedReplyCommentId();

		this._widgetListeners.clear();
		for (const widget of this._widgets) {
			widget.dispose();
		}
		this._widgets.length = 0;
	}

	private _captureFocusedReplyCommentId(): void {
		// Always recompute from scratch — the previously-captured value may
		// be stale (e.g. the user clicked elsewhere after typing).
		this._replyDraftState.focusedCommentId = undefined;
		if (this._widgets.length === 0) {
			return;
		}
		const activeElement = this._editor.getDomNode()?.ownerDocument.activeElement;
		if (!isHTMLElement(activeElement)) {
			return;
		}
		for (const widget of this._widgets) {
			const commentId = widget.findReplyCommentIdForElement(activeElement);
			if (commentId !== undefined) {
				this._replyDraftState.focusedCommentId = commentId;
				return;
			}
		}
	}

	override dispose(): void {
		this._clearWidgets();
		super.dispose();
	}
}

registerEditorContribution(AgentFeedbackEditorWidgetContribution.ID, AgentFeedbackEditorWidgetContribution, EditorContributionInstantiation.Eventually);
