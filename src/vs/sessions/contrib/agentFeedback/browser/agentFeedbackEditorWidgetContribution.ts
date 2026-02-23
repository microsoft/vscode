/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentFeedbackEditorWidget.css';

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
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
import * as nls from '../../../../nls.js';
import { IAgentFeedback, IAgentFeedbackService } from './agentFeedbackService.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { getSessionForResource } from './agentFeedbackEditorUtils.js';

/**
 * Groups nearby feedback items within a threshold number of lines.
 */
function groupNearbyFeedback(items: readonly IAgentFeedback[], lineThreshold: number = 5): IAgentFeedback[][] {
	if (items.length === 0) {
		return [];
	}

	// Sort by start line number
	const sorted = [...items].sort((a, b) => a.range.startLineNumber - b.range.startLineNumber);

	const groups: IAgentFeedback[][] = [];
	let currentGroup: IAgentFeedback[] = [sorted[0]];

	for (let i = 1; i < sorted.length; i++) {
		const firstItem = currentGroup[0];
		const currentItem = sorted[i];

		const verticalSpan = currentItem.range.startLineNumber - firstItem.range.startLineNumber;

		if (verticalSpan <= lineThreshold) {
			currentGroup.push(currentItem);
		} else {
			groups.push(currentGroup);
			currentGroup = [currentItem];
		}
	}

	if (currentGroup.length > 0) {
		groups.push(currentGroup);
	}

	return groups;
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
		private readonly _feedbackItems: readonly IAgentFeedback[],
		private readonly _agentFeedbackService: IAgentFeedbackService,
		private readonly _sessionResource: URI,
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
		// Remove all feedback items in this widget from the service
		for (const feedback of this._feedbackItems) {
			this._agentFeedbackService.removeFeedback(this._sessionResource, feedback.id);
		}

		this._domNode.classList.add('fadeOut');

		const dispose = () => {
			this.dispose();
		};

		const handle = setTimeout(dispose, 150);
		this._domNode.addEventListener('animationend', () => {
			clearTimeout(handle);
			dispose();
		}, { once: true });
	}

	private _updateTitle(): void {
		const count = this._feedbackItems.length;
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

		for (const feedback of this._feedbackItems) {
			const item = $('div.agent-feedback-widget-item');
			this._itemElements.set(feedback.id, item);

			// Line indicator
			const lineInfo = $('span.agent-feedback-widget-line-info');
			if (feedback.range.startLineNumber === feedback.range.endLineNumber) {
				lineInfo.textContent = nls.localize('lineNumber', "Line {0}", feedback.range.startLineNumber);
			} else {
				lineInfo.textContent = nls.localize('lineRange', "Lines {0}-{1}", feedback.range.startLineNumber, feedback.range.endLineNumber);
			}
			item.appendChild(lineInfo);

			// Feedback text
			const text = $('span.agent-feedback-widget-text');
			text.textContent = feedback.text;
			item.appendChild(text);

			// Hover handlers for range highlighting
			this._eventStore.add(addDisposableListener(item, 'mouseenter', () => {
				this._highlightRange(feedback);
			}));

			this._eventStore.add(addDisposableListener(item, 'mouseleave', () => {
				this._rangeHighlightDecoration.clear();
			}));

			this._bodyNode.appendChild(item);
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

		const feedback = this._feedbackItems.find(f => f.id === feedbackId);
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

	private _highlightRange(feedback: IAgentFeedback): void {
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
		return this._feedbackItems.some(f => f.id === feedbackId);
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

		this._position = {
			stackOrdinal: 2,
			preference: {
				top: this._editor.getTopForLineNumber(startLineNumber) - scrollTop - lineHeight,
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
		if (show && this._feedbackItems.length > 0) {
			this.layout(this._feedbackItems[0].range.startLineNumber);
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
	) {
		super();

		this._store.add(this._agentFeedbackService.onDidChangeFeedback(e => {
			if (this._sessionResource && e.sessionResource.toString() === this._sessionResource.toString()) {
				this._rebuildWidgets();
			}
		}));

		this._store.add(this._agentFeedbackService.onDidChangeNavigation(sessionResource => {
			if (this._sessionResource && sessionResource.toString() === this._sessionResource.toString()) {
				this._handleNavigation();
			}
		}));

		this._store.add(this._editor.onDidChangeModel(() => {
			this._resolveSession();
			this._rebuildWidgets();
		}));

		this._store.add(Event.any(this._editor.onDidScrollChange, this._editor.onDidLayoutChange)(() => {
			for (const widget of this._widgets) {
				widget.relayout();
			}
		}));

		this._resolveSession();
		this._rebuildWidgets();
	}

	private _resolveSession(): void {
		const model = this._editor.getModel();
		if (!model) {
			this._sessionResource = undefined;
			return;
		}
		this._sessionResource = getSessionForResource(model.uri, this._chatEditingService, this._agentSessionsService);
	}

	private _rebuildWidgets(): void {
		this._clearWidgets();

		if (!this._sessionResource) {
			return;
		}

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const allFeedback = this._agentFeedbackService.getFeedback(this._sessionResource);
		// Filter to feedback items belonging to this editor's file
		const fileFeedback = allFeedback.filter(f => f.resourceUri.toString() === model.uri.toString());
		if (fileFeedback.length === 0) {
			return;
		}

		const groups = groupNearbyFeedback(fileFeedback, 5);

		for (const group of groups) {
			const widget = new AgentFeedbackEditorWidget(this._editor, group, this._agentFeedbackService, this._sessionResource);
			this._widgets.push(widget);

			widget.layout(group[0].range.startLineNumber);
		}
	}

	private _handleNavigation(): void {
		if (!this._sessionResource) {
			return;
		}

		const bearing = this._agentFeedbackService.getNavigationBearing(this._sessionResource);
		if (bearing.activeIdx < 0) {
			return;
		}

		const allFeedback = this._agentFeedbackService.getFeedback(this._sessionResource);
		const activeFeedback = allFeedback[bearing.activeIdx];
		if (!activeFeedback) {
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
