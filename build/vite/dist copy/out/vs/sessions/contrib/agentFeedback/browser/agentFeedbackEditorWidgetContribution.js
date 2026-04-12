/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AgentFeedbackEditorWidget_1;
import './media/agentFeedbackEditorWidget.css';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { autorun, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { $, addDisposableListener, addStandardDisposableListener, clearNode, getTotalWidth } from '../../../../base/browser/dom.js';
import { Range } from '../../../../editor/common/core/range.js';
import { overviewRulerRangeHighlight } from '../../../../editor/common/core/editorColorRegistry.js';
import { OverviewRulerLane } from '../../../../editor/common/model.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import * as nls from '../../../../nls.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { createAgentFeedbackContext, getSessionForResource } from './agentFeedbackEditorUtils.js';
import { ICodeReviewService } from '../../codeReview/browser/codeReviewService.js';
import { getSessionEditorComments, groupNearbySessionEditorComments, toSessionEditorCommentId } from './sessionEditorComments.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
/**
 * Widget that displays agent feedback comments for a group of nearby feedback items.
 * Positioned on the right side of the editor like a speech bubble.
 */
let AgentFeedbackEditorWidget = class AgentFeedbackEditorWidget extends Disposable {
    static { AgentFeedbackEditorWidget_1 = this; }
    static { this._idPool = 0; }
    constructor(_editor, _commentItems, _sessionResource, _agentFeedbackService, _codeReviewService, _markdownRendererService, _codeEditorService) {
        super();
        this._editor = _editor;
        this._commentItems = _commentItems;
        this._sessionResource = _sessionResource;
        this._agentFeedbackService = _agentFeedbackService;
        this._codeReviewService = _codeReviewService;
        this._markdownRendererService = _markdownRendererService;
        this._codeEditorService = _codeEditorService;
        this._id = `agent-feedback-widget-${AgentFeedbackEditorWidget_1._idPool++}`;
        this._itemElements = new Map();
        this._position = null;
        this._isExpanded = false;
        this._disposed = false;
        this._startLineNumber = 1;
        this._eventStore = this._register(new DisposableStore());
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
    _setupEventHandlers() {
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
    _toggleExpanded() {
        if (this._isExpanded) {
            this.collapse();
        }
        else {
            this.expand();
        }
    }
    _updateTitle() {
        const count = this._commentItems.length;
        if (count === 1) {
            this._titleNode.textContent = this._commentItems[0].text;
        }
        else {
            this._titleNode.textContent = nls.localize('nComments', "{0} comments", count);
        }
    }
    _updateToggleButton() {
        clearNode(this._toggleButton);
        if (this._isExpanded) {
            this._toggleButton.appendChild(renderIcon(Codicon.chevronUp));
            this._toggleButton.title = nls.localize('collapse', "Collapse");
        }
        else {
            this._toggleButton.appendChild(renderIcon(Codicon.chevronDown));
            this._toggleButton.title = nls.localize('expand', "Expand");
        }
    }
    _buildFeedbackItems() {
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
            }
            else {
                lineInfo.textContent = nls.localize('lineRange', "Lines {0}-{1}", comment.range.startLineNumber, comment.range.endLineNumber);
            }
            itemMeta.appendChild(lineInfo);
            if (comment.source !== "agentFeedback" /* SessionEditorCommentSource.AgentFeedback */) {
                const typeBadge = $('span.agent-feedback-widget-item-type');
                typeBadge.textContent = this._getTypeLabel(comment);
                itemMeta.appendChild(typeBadge);
            }
            itemHeader.appendChild(itemMeta);
            const actionBarContainer = $('div.agent-feedback-widget-item-actions');
            const actionBar = this._eventStore.add(new ActionBar(actionBarContainer));
            const itemActions = { editAction: undefined, convertAction: undefined, removeAction: undefined };
            itemActions.editAction = new Action('agentFeedback.widget.edit', nls.localize('editComment', "Edit"), ThemeIcon.asClassName(Codicon.edit), true, () => { this._startEditing(comment, text, itemActions); });
            actionBar.push(itemActions.editAction, { icon: true, label: false });
            if (comment.canConvertToAgentFeedback) {
                itemActions.convertAction = new Action('agentFeedback.widget.convert', nls.localize('convertComment', "Convert to Agent Feedback"), ThemeIcon.asClassName(Codicon.check), true, () => this._convertToAgentFeedback(comment));
                actionBar.push(itemActions.convertAction, { icon: true, label: false });
            }
            itemActions.removeAction = new Action('agentFeedback.widget.remove', nls.localize('removeComment', "Remove"), ThemeIcon.asClassName(Codicon.close), true, () => this._removeComment(comment));
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
                if (e.target?.closest('.action-bar')) {
                    return;
                }
                this.focusFeedback(comment.id);
                this._agentFeedbackService.setNavigationAnchor(this._sessionResource, comment.id);
                this._revealComment(comment);
            }));
            this._bodyNode.appendChild(item);
        }
    }
    _getTypeLabel(comment) {
        if (comment.source === "prReview" /* SessionEditorCommentSource.PRReview */) {
            return nls.localize('prReviewComment', "PR Review");
        }
        if (comment.source === "codeReview" /* SessionEditorCommentSource.CodeReview */) {
            return comment.suggestion
                ? nls.localize('reviewSuggestion', "Review Suggestion")
                : nls.localize('reviewComment', "Review");
        }
        return comment.suggestion
            ? nls.localize('feedbackSuggestion', "Feedback Suggestion")
            : nls.localize('feedbackComment', "Feedback");
    }
    _renderSuggestion(comment) {
        const suggestionNode = $('div.agent-feedback-widget-suggestion');
        for (const edit of comment.suggestion?.edits ?? []) {
            const editNode = $('div.agent-feedback-widget-suggestion-edit');
            const header = $('div.agent-feedback-widget-suggestion-header');
            if (edit.range.startLineNumber === edit.range.endLineNumber) {
                header.textContent = nls.localize('suggestedChangeLine', "Suggested Change \u2022 Line {0}", edit.range.startLineNumber);
            }
            else {
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
    _removeComment(comment) {
        if (comment.source === "prReview" /* SessionEditorCommentSource.PRReview */) {
            this._codeReviewService.resolvePRReviewThread(this._sessionResource, comment.sourceId);
            return;
        }
        if (comment.source === "codeReview" /* SessionEditorCommentSource.CodeReview */) {
            this._codeReviewService.removeComment(this._sessionResource, comment.sourceId);
            return;
        }
        this._agentFeedbackService.removeFeedback(this._sessionResource, comment.sourceId);
    }
    _startEditing(comment, textContainer, actions) {
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
        const textarea = $('textarea.agent-feedback-widget-edit-textarea');
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
            if (e.keyCode === 3 /* KeyCode.Enter */ && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                const newText = textarea.value.trim();
                if (newText) {
                    this._saveEdit(comment, newText);
                }
                // Widget will be rebuilt by the change event
            }
            else if (e.keyCode === 9 /* KeyCode.Escape */) {
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
    _saveEdit(comment, newText) {
        if (comment.source === "agentFeedback" /* SessionEditorCommentSource.AgentFeedback */) {
            this._agentFeedbackService.updateFeedback(this._sessionResource, comment.sourceId, newText);
        }
        else {
            // PR review and code review comments are converted to agent feedback on edit
            this._convertToAgentFeedbackWithText(comment, newText);
        }
    }
    _stopEditing(comment, textContainer, editStore, actions) {
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
    _convertToAgentFeedback(comment) {
        this._convertToAgentFeedbackWithText(comment, comment.text);
    }
    /**
     * Converts a non-agent-feedback comment into an agent feedback item, optionally with edited text.
     */
    _convertToAgentFeedbackWithText(comment, text) {
        if (!comment.canConvertToAgentFeedback) {
            return;
        }
        const sourcePRReviewCommentId = comment.source === "prReview" /* SessionEditorCommentSource.PRReview */
            ? comment.sourceId
            : undefined;
        const feedback = this._agentFeedbackService.addFeedback(this._sessionResource, comment.resourceUri, comment.range, text, comment.suggestion, createAgentFeedbackContext(this._editor, this._codeEditorService, comment.resourceUri, comment.range), sourcePRReviewCommentId);
        this._agentFeedbackService.setNavigationAnchor(this._sessionResource, toSessionEditorCommentId("agentFeedback" /* SessionEditorCommentSource.AgentFeedback */, feedback.id));
        if (comment.source === "codeReview" /* SessionEditorCommentSource.CodeReview */) {
            this._codeReviewService.removeComment(this._sessionResource, comment.sourceId);
        }
        else if (comment.source === "prReview" /* SessionEditorCommentSource.PRReview */) {
            this._codeReviewService.markPRReviewCommentConverted(this._sessionResource, comment.sourceId);
        }
    }
    /**
     * Expand the widget body.
     */
    expand() {
        this._isExpanded = true;
        this._domNode.classList.remove('collapsed');
        this._bodyNode.classList.remove('collapsed');
        this._updateToggleButton();
        this._editor.layoutOverlayWidget(this);
    }
    /**
     * Collapse the widget body.
     */
    collapse() {
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
    focusFeedback(feedbackId) {
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
    clearFocus() {
        for (const el of this._itemElements.values()) {
            el.classList.remove('focused');
        }
        this._rangeHighlightDecoration.clear();
    }
    _highlightRange(feedback) {
        const endLineNumber = feedback.range.endLineNumber;
        const range = new Range(feedback.range.startLineNumber, 1, endLineNumber, this._editor.getModel()?.getLineMaxColumn(endLineNumber) ?? 1);
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
    containsFeedback(feedbackId) {
        return this._commentItems.some(f => f.id === feedbackId);
    }
    /**
     * Updates the widget position and layout.
     */
    layout(startLineNumber) {
        if (this._disposed) {
            return;
        }
        this._startLineNumber = startLineNumber;
        const lineHeight = this._editor.getOption(75 /* EditorOption.lineHeight */);
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
    toggle(show) {
        this._domNode.classList.toggle('visible', show);
        if (show && this._commentItems.length > 0) {
            this.layout(this._commentItems[0].range.startLineNumber);
        }
    }
    /**
     * Relayouts the widget at its current line number.
     */
    relayout() {
        if (this._startLineNumber) {
            this.layout(this._startLineNumber);
        }
    }
    // IOverlayWidget implementation
    getId() {
        return this._id;
    }
    getDomNode() {
        return this._domNode;
    }
    getPosition() {
        return this._position;
    }
    dispose() {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        this._rangeHighlightDecoration.clear();
        this._editor.removeOverlayWidget(this);
        super.dispose();
    }
    _revealComment(comment) {
        const range = new Range(comment.range.startLineNumber, 1, comment.range.endLineNumber, this._editor.getModel()?.getLineMaxColumn(comment.range.endLineNumber) ?? 1);
        this._editor.revealRangeInCenterIfOutsideViewport(range, 0 /* ScrollType.Smooth */);
    }
};
AgentFeedbackEditorWidget = AgentFeedbackEditorWidget_1 = __decorate([
    __param(3, IAgentFeedbackService),
    __param(4, ICodeReviewService),
    __param(5, IMarkdownRendererService),
    __param(6, ICodeEditorService)
], AgentFeedbackEditorWidget);
export { AgentFeedbackEditorWidget };
/**
 * Editor contribution that manages agent feedback widgets.
 * Groups feedback items and creates combined widgets for nearby items.
 * Widgets start collapsed and expand when navigated to.
 */
let AgentFeedbackEditorWidgetContribution = class AgentFeedbackEditorWidgetContribution extends Disposable {
    static { this.ID = 'agentFeedback.editorWidgetContribution'; }
    constructor(_editor, _agentFeedbackService, _chatEditingService, _sessionsManagementService, _codeReviewService, _instantiationService) {
        super();
        this._editor = _editor;
        this._agentFeedbackService = _agentFeedbackService;
        this._chatEditingService = _chatEditingService;
        this._sessionsManagementService = _sessionsManagementService;
        this._codeReviewService = _codeReviewService;
        this._instantiationService = _instantiationService;
        this._widgets = [];
        this._store.add(this._agentFeedbackService.onDidChangeNavigation(sessionResource => {
            if (this._sessionResource && sessionResource.toString() === this._sessionResource.toString()) {
                this._handleNavigation();
            }
        }));
        const rebuildSignal = observableSignalFromEvent(this, Event.any(this._agentFeedbackService.onDidChangeFeedback, this._editor.onDidChangeModel));
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
            this._rebuildWidgets(this._codeReviewService.getReviewState(this._sessionResource).read(reader), this._codeReviewService.getPRReviewState(this._sessionResource).read(reader));
            this._handleNavigation();
        }));
    }
    _resolveSession() {
        const model = this._editor.getModel();
        if (!model) {
            this._sessionResource = undefined;
            return;
        }
        this._sessionResource = getSessionForResource(model.uri, this._chatEditingService, this._sessionsManagementService);
    }
    _rebuildWidgets(reviewState = this._sessionResource ? this._codeReviewService.getReviewState(this._sessionResource).get() : undefined, prReviewState = this._sessionResource ? this._codeReviewService.getPRReviewState(this._sessionResource).get() : undefined) {
        this._clearWidgets();
        if (!this._sessionResource || !reviewState) {
            return;
        }
        const model = this._editor.getModel();
        if (!model) {
            return;
        }
        const comments = getSessionEditorComments(this._sessionResource, this._agentFeedbackService.getFeedback(this._sessionResource), reviewState, prReviewState);
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
    _getCommentsForModel(resourceUri, comments) {
        const change = this._getSessionChangeForResource(resourceUri);
        if (!change) {
            return comments.filter(comment => isEqual(comment.resourceUri, resourceUri));
        }
        if (!this._isCurrentOrModifiedResource(change, resourceUri)) {
            return [];
        }
        return comments.filter(comment => comment.resourceUri.fsPath === resourceUri.fsPath);
    }
    _getSessionChangeForResource(resourceUri) {
        if (!this._sessionResource) {
            return undefined;
        }
        const changes = this._sessionsManagementService.getSession(this._sessionResource)?.changes.get();
        if (!changes) {
            return undefined;
        }
        return changes.find(change => this._changeMatchesFsPath(change, resourceUri));
    }
    _changeMatchesFsPath(change, resourceUri) {
        if (isIChatSessionFileChange2(change)) {
            return change.uri.fsPath === resourceUri.fsPath
                || change.modifiedUri?.fsPath === resourceUri.fsPath
                || change.originalUri?.fsPath === resourceUri.fsPath;
        }
        return change.modifiedUri.fsPath === resourceUri.fsPath
            || change.originalUri?.fsPath === resourceUri.fsPath;
    }
    _isCurrentOrModifiedResource(change, resourceUri) {
        if (isIChatSessionFileChange2(change)) {
            return isEqual(change.uri, resourceUri) || (change.modifiedUri ? isEqual(change.modifiedUri, resourceUri) : false);
        }
        return isEqual(change.modifiedUri, resourceUri);
    }
    _handleNavigation() {
        if (!this._sessionResource) {
            return;
        }
        const model = this._editor.getModel();
        if (!model) {
            return;
        }
        const comments = getSessionEditorComments(this._sessionResource, this._agentFeedbackService.getFeedback(this._sessionResource), this._codeReviewService.getReviewState(this._sessionResource).get(), this._codeReviewService.getPRReviewState(this._sessionResource).get());
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
            }
            else {
                widget.collapse();
            }
        }
        // Reveal the feedback range in the editor
        const range = new Range(activeFeedback.range.startLineNumber, 1, activeFeedback.range.endLineNumber, 1);
        this._editor.revealRangeInCenterIfOutsideViewport(range, 0 /* ScrollType.Smooth */);
    }
    _clearWidgets() {
        for (const widget of this._widgets) {
            widget.dispose();
        }
        this._widgets.length = 0;
    }
    dispose() {
        this._clearWidgets();
        super.dispose();
    }
};
AgentFeedbackEditorWidgetContribution = __decorate([
    __param(1, IAgentFeedbackService),
    __param(2, IChatEditingService),
    __param(3, ISessionsManagementService),
    __param(4, ICodeReviewService),
    __param(5, IInstantiationService)
], AgentFeedbackEditorWidgetContribution);
registerEditorContribution(AgentFeedbackEditorWidgetContribution.ID, AgentFeedbackEditorWidgetContribution, 3 /* EditorContributionInstantiation.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFja0VkaXRvcldpZGdldENvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvYWdlbnRGZWVkYmFjay9icm93c2VyL2FnZW50RmVlZGJhY2tFZGl0b3JXaWRnZXRDb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sdUNBQXVDLENBQUM7QUFFL0MsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFM0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFOUYsT0FBTyxFQUFtQywwQkFBMEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRTdILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLDZCQUE2QixFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUVwSSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDaEUsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDcEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdkUsT0FBTyxFQUFFLGdCQUFnQixF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