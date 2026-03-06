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
import { IEditorContribution, IEditorDecorationsCollection, ScrollType } from '../../../../editor/common/editorCommon.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { $, addDisposableListener, clearNode, getTotalWidth } from '../../../../base/browser/dom.js';
import { URI } from '../../../../base/common/uri.js';
import { Range } from '../../../../editor/common/core/range.js';
import { overviewRulerRangeHighlight } from '../../../../editor/common/core/editorColorRegistry.js';
import { OverviewRulerLane } from '../../../../editor/common/model.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import * as nls from '../../../../nls.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { getSessionForResource } from './agentFeedbackEditorUtils.js';
import { ICodeReviewService } from '../../codeReview/browser/codeReviewService.js';
import { getResourceEditorComments, getSessionEditorComments, groupNearbySessionEditorComments, ISessionEditorComment, SessionEditorCommentSource, toSessionEditorCommentId } from './sessionEditorComments.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { isEqual } from '../../../../base/common/resources.js';

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
	private readonly _dismissButton: HTMLElement;
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
	) {
		super();

		this._rangeHighlightDecoration = this._editor.createDecorationsCollection();

		// Create DOM structure
		this._domNode = $('div.agent-feedback-widget');
		this._domNode.classList.add('collapsed');

		// Header
		this._headerNode = $('div.agent-feedback-widget-header');

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

		// Dismiss button
		this._dismissButton = $('div.agent-feedback-widget-dismiss');
		this._dismissButton.appendChild(renderIcon(Codicon.close));
		this._dismissButton.title = nls.localize('dismiss', "Dismiss");
		this._headerNode.appendChild(this._dismissButton);

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

		// Dismiss button click
		this._eventStore.add(addDisposableListener(this._dismissButton, 'click', (e) => {
			e.stopPropagation();
			this._dismiss();
		}));
	}

	private _toggleExpanded(): void {
		if (this._isExpanded) {
			this.collapse();
		} else {
			this.expand();
		}
	}

	private _dismiss(): void {
		for (const comment of this._commentItems) {
			this._removeComment(comment);
		}
	}

	private _updateTitle(): void {
		const count = this._commentItems.length;
		if (count === 1) {
			this._titleNode.textContent = nls.localize('oneComment', "1 comment");
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
			if (comment.canConvertToAgentFeedback) {
				actionBar.push(new Action(
					'agentFeedback.widget.convert',
					nls.localize('convertComment', "Convert to Agent Feedback"),
					ThemeIcon.asClassName(Codicon.comment),
					true,
					() => this._convertToAgentFeedback(comment),
				), { icon: true, label: false });
			}
			actionBar.push(new Action(
				'agentFeedback.widget.remove',
				nls.localize('removeComment', "Remove"),
				ThemeIcon.asClassName(Codicon.close),
				true,
				() => this._removeComment(comment),
			), { icon: true, label: false });
			itemHeader.appendChild(actionBarContainer);
			item.appendChild(itemHeader);

			const text = $('span.agent-feedback-widget-text');
			text.textContent = comment.text;
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
		const title = $('div.agent-feedback-widget-suggestion-title');
		title.textContent = nls.localize('suggestedChange', "Suggested Change");
		suggestionNode.appendChild(title);

		for (const edit of comment.suggestion?.edits ?? []) {
			const editNode = $('div.agent-feedback-widget-suggestion-edit');
			const rangeLabel = $('div.agent-feedback-widget-suggestion-range');
			if (edit.range.startLineNumber === edit.range.endLineNumber) {
				rangeLabel.textContent = nls.localize('suggestionLineNumber', "Line {0}", edit.range.startLineNumber);
			} else {
				rangeLabel.textContent = nls.localize('suggestionLineRange', "Lines {0}-{1}", edit.range.startLineNumber, edit.range.endLineNumber);
			}
			editNode.appendChild(rangeLabel);

			const newText = $('pre.agent-feedback-widget-suggestion-text');
			newText.textContent = edit.newText;
			editNode.appendChild(newText);
			suggestionNode.appendChild(editNode);
		}

		return suggestionNode;
	}

	private _removeComment(comment: ISessionEditorComment): void {
		if (comment.source === SessionEditorCommentSource.CodeReview) {
			this._codeReviewService.removeComment(this._sessionResource, comment.sourceId);
			return;
		}

		this._agentFeedbackService.removeFeedback(this._sessionResource, comment.sourceId);
	}

	private _convertToAgentFeedback(comment: ISessionEditorComment): void {
		if (!comment.canConvertToAgentFeedback) {
			return;
		}

		const feedback = this._agentFeedbackService.addFeedback(this._sessionResource, comment.resourceUri, comment.range, comment.text, comment.suggestion);
		this._agentFeedbackService.setNavigationAnchor(this._sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedback.id));
		if (comment.source === SessionEditorCommentSource.CodeReview) {
			this._codeReviewService.removeComment(this._sessionResource, comment.sourceId);
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

		// Compute content-relative top and clamp to keep the widget within the editor content area
		const contentRelativeTop = this._editor.getTopForLineNumber(startLineNumber) - lineHeight;
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
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@ICodeReviewService private readonly _codeReviewService: ICodeReviewService,
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

			this._rebuildWidgets(this._codeReviewService.getReviewState(this._sessionResource).read(reader));
			this._handleNavigation();
		}));
	}

	private _resolveSession(): void {
		const model = this._editor.getModel();
		if (!model) {
			this._sessionResource = undefined;
			return;
		}
		this._sessionResource = getSessionForResource(model.uri, this._chatEditingService, this._agentSessionsService);
	}

	private _rebuildWidgets(reviewState = this._sessionResource ? this._codeReviewService.getReviewState(this._sessionResource).get() : undefined): void {
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
		);
		const fileComments = getResourceEditorComments(model.uri, comments);
		if (fileComments.length === 0) {
			return;
		}

		const groups = groupNearbySessionEditorComments(fileComments, 5);

		for (const group of groups) {
			const widget = new AgentFeedbackEditorWidget(this._editor, group, this._sessionResource, this._agentFeedbackService, this._codeReviewService);
			this._widgets.push(widget);

			widget.layout(group[0].range.startLineNumber);
		}
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
		);
		const bearing = this._agentFeedbackService.getNavigationBearing(this._sessionResource, comments);
		if (bearing.activeIdx < 0) {
			return;
		}

		const activeFeedback = comments[bearing.activeIdx];
		if (!activeFeedback) {
			return;
		}

		if (!isEqual(activeFeedback.resourceUri, model.uri)) {
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
