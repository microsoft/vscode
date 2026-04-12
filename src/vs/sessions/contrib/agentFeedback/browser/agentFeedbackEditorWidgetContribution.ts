/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentFeedbackEditorWidget.css';

import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IEditorContribution, IEditorDecorationsCollection, ScrollType } from '../../../../editor/common/editorCommon.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { $, addDisposableListener, addStandardDisposableListener, clearNode, getTotalWidth } from '../../../../base/browser/dom.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { overviewRulerRangeHighlight } from '../../../../editor/common/core/editorColorRegistry.js';
import { OverviewRulerLane } from '../../../../editor/common/model.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import * as nls from '../../../../nls.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IChatSessionFileChange, IChatSessionFileChange2, isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { createAgentFeedbackContext, getSessionForResource } from './agentFeedbackEditorUtils.js';
import { ICodeReviewService, IPRReviewState } from '../../codeReview/browser/codeReviewService.js';
import { getSessionEditorComments, groupNearbySessionEditorComments, ISessionEditorComment, SessionEditorCommentSource, toSessionEditorCommentId } from './sessionEditorComments.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';

interface ICommentItemActions {
	editAction: Action;
	convertAction: Action | undefined;
	removeAction: Action;
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

	private _position: IOverlayWidgetPosition | null = null;
	private _isExpanded: boolean = false;
	private _disposed: boolean = false;
	private _startLineNumber: number = 1;
	private readonly _rangeHighlightDecoration: IEditorDecorationsCollection;

	private readonly _eventStore = this._register(new DisposableStore());

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _commentItems: readonly ISessionEditorComment[],
		private readonly _sessionResource: URI,
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

			if (comment.source !== SessionEditorCommentSource.AgentFeedback) {
				const typeBadge = $('span.agent-feedback-widget-item-type');
				typeBadge.textContent = this._getTypeLabel(comment);
				itemMeta.appendChild(typeBadge);
			}

			itemHeader.appendChild(itemMeta);

			const actionBarContainer = $('div.agent-feedback-widget-item-actions');
			const actionBar = this._eventStore.add(new ActionBar(actionBarContainer));

			const itemActions: ICommentItemActions = { editAction: undefined!, convertAction: undefined, removeAction: undefined! };

			itemActions.editAction = new Action(
				'agentFeedback.widget.edit',
				nls.localize('editComment', "Edit"),
				ThemeIcon.asClassName(Codicon.edit),
				true,
				(): void => { this._startEditing(comment, text, itemActions); },
			);
			actionBar.push(itemActions.editAction, { icon: true, label: false });

			if (comment.canConvertToAgentFeedback) {
				itemActions.convertAction = new Action(
					'agentFeedback.widget.convert',
					nls.localize('convertComment', "Convert to Agent Feedback"),
					ThemeIcon.asClassName(Codicon.check),
					true,
					() => this._convertToAgentFeedback(comment),
				);
				actionBar.push(itemActions.convertAction, { icon: true, label: false });
			}
			itemActions.removeAction = new Action(
				'agentFeedback.widget.remove',
				nls.localize('removeComment', "Remove"),
				ThemeIcon.asClassName(Codicon.close),
				true,
				() => this._removeComment(comment),
			);
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

			this._eventStore.add(addDisposableListener(item, 'mouseenter', () => {
				this._highlightRange(comment);
			}));

			this._eventStore.add(addDisposableListener(item, 'mouseleave', () => {
				this._rangeHighlightDecoration.clear();
			}));

			this._eventStore.add(addDisposableListener(item, 'click', e => {
				if ((e.target as HTMLElement | null)?.closest('.action-bar')) {
					return;
				}
				this.focusFeedback(comment.id);
				this._agentFeedbackService.setNavigationAnchor(this._sessionResource, comment.id);
				this._revealComment(comment);
			}));

			this._bodyNode.appendChild(item);
		}
	}

	private _getTypeLabel(comment: ISessionEditorComment): string {
		if (comment.source === SessionEditorCommentSource.PRReview) {
			return nls.localize('prReviewComment', "PR Review");
		}

		if (comment.source === SessionEditorCommentSource.CodeReview) {
			return comment.suggestion
				? nls.localize('reviewSuggestion', "Review Suggestion")
				: nls.localize('reviewComment', "Review");
		}

		return comment.suggestion
			? nls.localize('feedbackSuggestion', "Feedback Suggestion")
			: nls.localize('feedbackComment', "Feedback");
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

	private _removeComment(comment: ISessionEditorComment): void {
		if (comment.source === SessionEditorCommentSource.PRReview) {
			this._codeReviewService.resolvePRReviewThread(this._sessionResource!, comment.sourceId);
			return;
		}
		if (comment.source === SessionEditorCommentSource.CodeReview) {
			this._codeReviewService.removeComment(this._sessionResource, comment.sourceId);
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
	 * Converts a non-agent-feedback comment into an agent feedback item, optionally with edited text.
	 */
	private _convertToAgentFeedbackWithText(comment: ISessionEditorComment, text: string): void {
		if (!comment.canConvertToAgentFeedback) {
			return;
		}

		const sourcePRReviewCommentId = comment.source === SessionEditorCommentSource.PRReview
			? comment.sourceId
			: undefined;

		const feedback = this._agentFeedbackService.addFeedback(
			this._sessionResource,
			comment.resourceUri,
			comment.range,
			text,
			comment.suggestion,
			createAgentFeedbackContext(this._editor, this._codeEditorService, comment.resourceUri, comment.range),
			sourcePRReviewCommentId,
		);
		this._agentFeedbackService.setNavigationAnchor(this._sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedback.id));
		if (comment.source === SessionEditorCommentSource.CodeReview) {
			this._codeReviewService.removeComment(this._sessionResource, comment.sourceId);
		} else if (comment.source === SessionEditorCommentSource.PRReview) {
			this._codeReviewService.markPRReviewCommentConverted(this._sessionResource, comment.sourceId);
		}
	}

	/**
	 * Expand the widget body.
	 */
	expand(): void {
		this._isExpanded = true;
		this._domNode.classList.remove('collapsed');
		this._bodyNode.classList.remove('collapsed');
		this._updateToggleButton();
		this._editor.layoutOverlayWidget(this);
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
	private _sessionResource: URI | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
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
				this._codeReviewService.getReviewState(this._sessionResource).read(reader),
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
		this._sessionResource = getSessionForResource(model.uri, this._chatEditingService, this._sessionsManagementService);
	}

	private _rebuildWidgets(
		reviewState = this._sessionResource ? this._codeReviewService.getReviewState(this._sessionResource).get() : undefined,
		prReviewState: IPRReviewState | undefined = this._sessionResource ? this._codeReviewService.getPRReviewState(this._sessionResource).get() : undefined,
	): void {
		this._clearWidgets();

		if (!this._sessionResource || !reviewState) {
			return;
		}

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const comments = getSessionEditorComments(
			this._sessionResource,
			this._agentFeedbackService.getFeedback(this._sessionResource),
			reviewState,
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
			const widget = this._instantiationService.createInstance(AgentFeedbackEditorWidget, this._editor, group, this._sessionResource);
			this._widgets.push(widget);

			widget.layout(group[0].range.startLineNumber);
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

	private _getSessionChangeForResource(resourceUri: URI): IChatSessionFileChange | IChatSessionFileChange2 | undefined {
		if (!this._sessionResource) {
			return undefined;
		}

		const changes = this._sessionsManagementService.getSession(this._sessionResource)?.changes.get();
		if (!changes) {
			return undefined;
		}

		return changes.find(change => this._changeMatchesFsPath(change, resourceUri));
	}

	private _changeMatchesFsPath(change: IChatSessionFileChange | IChatSessionFileChange2, resourceUri: URI): boolean {
		if (isIChatSessionFileChange2(change)) {
			return change.uri.fsPath === resourceUri.fsPath
				|| change.modifiedUri?.fsPath === resourceUri.fsPath
				|| change.originalUri?.fsPath === resourceUri.fsPath;
		}

		return change.modifiedUri.fsPath === resourceUri.fsPath
			|| change.originalUri?.fsPath === resourceUri.fsPath;
	}

	private _isCurrentOrModifiedResource(change: IChatSessionFileChange | IChatSessionFileChange2, resourceUri: URI): boolean {
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
			this._codeReviewService.getReviewState(this._sessionResource).get(),
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
		for (const widget of this._widgets) {
			widget.dispose();
		}
		this._widgets.length = 0;
	}

	override dispose(): void {
		this._clearWidgets();
		super.dispose();
	}
}

registerEditorContribution(AgentFeedbackEditorWidgetContribution.ID, AgentFeedbackEditorWidgetContribution, EditorContributionInstantiation.Eventually);
