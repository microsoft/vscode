/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/chatEditingExplanationWidget.css';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { $, addDisposableListener, clearNode, getTotalWidth } from '../../../../../base/browser/dom.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { overviewRulerRangeHighlight } from '../../../../../editor/common/core/editorColorRegistry.js';
import { OverviewRulerLane } from '../../../../../editor/common/model.js';
import { themeColorFromId } from '../../../../../platform/theme/common/themeService.js';
import { ChatViewId } from '../chat.js';
import * as nls from '../../../../../nls.js';
import { autorun } from '../../../../../base/common/observable.js';
/**
 * Gets the text content for a change
 */
function getChangeTexts(change, diffInfo) {
    const originalLines = [];
    const modifiedLines = [];
    // Get original text
    for (let i = change.original.startLineNumber; i < change.original.endLineNumberExclusive; i++) {
        const line = diffInfo.originalModel.getLineContent(i);
        originalLines.push(line);
    }
    // Get modified text
    for (let i = change.modified.startLineNumber; i < change.modified.endLineNumberExclusive; i++) {
        const line = diffInfo.modifiedModel.getLineContent(i);
        modifiedLines.push(line);
    }
    return {
        originalText: originalLines.join('\n'),
        modifiedText: modifiedLines.join('\n')
    };
}
/**
 * Groups nearby changes within a threshold number of lines
 * Uses the vertical span from widget position to last line it refers to
 */
function groupNearbyChanges(changes, lineThreshold = 5) {
    if (changes.length === 0) {
        return [];
    }
    const groups = [];
    let currentGroup = [changes[0]];
    for (let i = 1; i < changes.length; i++) {
        const firstChange = currentGroup[0];
        const currentChange = changes[i];
        // Calculate vertical span from widget position (first change) to start of current change
        const widgetLine = firstChange.modified.startLineNumber;
        const lastLine = currentChange.modified.startLineNumber;
        const verticalSpan = lastLine - widgetLine;
        if (verticalSpan <= lineThreshold) {
            currentGroup.push(currentChange);
        }
        else {
            groups.push(currentGroup);
            currentGroup = [currentChange];
        }
    }
    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }
    return groups;
}
/**
 * Widget that displays explanatory comments for chat-made changes
 * Positioned on the right side of the editor like a speech bubble
 */
export class ChatEditingExplanationWidget extends Disposable {
    static { this._idPool = 0; }
    constructor(_editor, _changes, diffInfo, _chatWidgetService, _viewsService, _chatSessionResource) {
        super();
        this._editor = _editor;
        this._changes = _changes;
        this._chatWidgetService = _chatWidgetService;
        this._viewsService = _viewsService;
        this._chatSessionResource = _chatSessionResource;
        this._id = `chat-explanation-widget-${ChatEditingExplanationWidget._idPool++}`;
        this._explanationItems = new Map();
        this._position = null;
        this._explanations = [];
        this._isExpanded = true;
        this._isAllRead = false;
        this._disposed = false;
        this._startLineNumber = 1;
        this._eventStore = this._register(new DisposableStore());
        this._uri = diffInfo.modifiedModel.uri;
        // Create decoration collection for range highlighting on hover
        this._rangeHighlightDecoration = this._editor.createDecorationsCollection();
        // Build explanations from changes with loading state
        this._explanations = this._changes.map(change => {
            const { originalText, modifiedText } = getChangeTexts(change, diffInfo);
            return {
                startLineNumber: change.modified.startLineNumber,
                endLineNumber: change.modified.endLineNumberExclusive - 1,
                explanation: nls.localize('generatingExplanation', "Generating explanation..."),
                read: false,
                loading: true,
                originalText,
                modifiedText,
            };
        });
        // Create DOM structure
        this._domNode = $('div.chat-explanation-widget');
        // Header
        this._headerNode = $('div.chat-explanation-header');
        // Read indicator (checkbox-like)
        this._readIndicator = $('div.chat-explanation-read-indicator');
        this._updateReadIndicator();
        this._headerNode.appendChild(this._readIndicator);
        // Title showing change count
        this._titleNode = $('span.chat-explanation-title');
        this._updateTitle();
        this._headerNode.appendChild(this._titleNode);
        // Spacer
        this._headerNode.appendChild($('span.chat-explanation-spacer'));
        // Toggle expand/collapse button
        this._toggleButton = $('div.chat-explanation-toggle');
        this._updateToggleButton();
        this._headerNode.appendChild(this._toggleButton);
        // Dismiss button
        this._dismissButton = $('div.chat-explanation-dismiss');
        this._dismissButton.appendChild(renderIcon(Codicon.close));
        this._dismissButton.title = nls.localize('dismiss', "Dismiss");
        this._headerNode.appendChild(this._dismissButton);
        this._domNode.appendChild(this._headerNode);
        // Body (collapsible)
        this._bodyNode = $('div.chat-explanation-body');
        // Body starts expanded by default
        this._buildExplanationItems();
        this._domNode.appendChild(this._bodyNode);
        // Arrow pointer
        const arrow = $('div.chat-explanation-arrow');
        this._domNode.appendChild(arrow);
        // Event handlers
        this._setupEventHandlers();
        // Add visible class for initial display
        this._domNode.classList.add('visible');
        // Add to editor
        this._editor.addOverlayWidget(this);
    }
    _setupEventHandlers() {
        // Read indicator click - toggle all read/unread
        this._eventStore.add(addDisposableListener(this._readIndicator, 'click', (e) => {
            e.stopPropagation();
            this._isAllRead = !this._isAllRead;
            for (const exp of this._explanations) {
                exp.read = this._isAllRead;
            }
            this._updateReadIndicator();
            this._updateExplanationItemsReadState();
        }));
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
    _toggleExpanded() {
        this._isExpanded = !this._isExpanded;
        this._bodyNode.classList.toggle('collapsed', !this._isExpanded);
        this._updateToggleButton();
        this._editor.layoutOverlayWidget(this);
    }
    _dismiss() {
        this._domNode.classList.add('fadeOut');
        const dispose = () => {
            this.dispose();
        };
        // Listen for animation end
        const handle = setTimeout(dispose, 150);
        this._domNode.addEventListener('animationend', () => {
            clearTimeout(handle);
            dispose();
        }, { once: true });
    }
    _updateReadIndicator() {
        clearNode(this._readIndicator);
        const allRead = this._explanations.every(e => e.read);
        const someRead = this._explanations.some(e => e.read);
        this._isAllRead = allRead;
        if (allRead) {
            this._readIndicator.appendChild(renderIcon(Codicon.circle));
            this._readIndicator.classList.add('read');
            this._readIndicator.classList.remove('partial', 'unread');
            this._readIndicator.title = nls.localize('markAsUnread', "Mark as unread");
        }
        else if (someRead) {
            this._readIndicator.appendChild(renderIcon(Codicon.circleFilled));
            this._readIndicator.classList.remove('read', 'unread');
            this._readIndicator.classList.add('partial');
            this._readIndicator.title = nls.localize('markAllAsRead', "Mark all as read");
        }
        else {
            this._readIndicator.appendChild(renderIcon(Codicon.circleFilled));
            this._readIndicator.classList.remove('read', 'partial');
            this._readIndicator.classList.add('unread');
            this._readIndicator.title = nls.localize('markAsRead', "Mark as read");
        }
    }
    _updateTitle() {
        const count = this._explanations.length;
        if (count === 1) {
            this._titleNode.textContent = nls.localize('oneChange', "1 change");
        }
        else {
            this._titleNode.textContent = nls.localize('nChanges', "{0} changes", count);
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
    _buildExplanationItems() {
        clearNode(this._bodyNode);
        this._explanationItems.clear();
        for (let i = 0; i < this._explanations.length; i++) {
            const exp = this._explanations[i];
            const item = $('div.chat-explanation-item');
            // Line indicator
            const lineInfo = $('span.chat-explanation-line-info');
            if (exp.startLineNumber === exp.endLineNumber) {
                lineInfo.textContent = nls.localize('lineNumber', "Line {0}", exp.startLineNumber);
            }
            else {
                lineInfo.textContent = nls.localize('lineRange', "Lines {0}-{1}", exp.startLineNumber, exp.endLineNumber);
            }
            item.appendChild(lineInfo);
            // Explanation text with loading indicator
            const text = $('span.chat-explanation-text');
            if (exp.loading) {
                const loadingIcon = renderIcon(ThemeIcon.modify(Codicon.loading, 'spin'));
                loadingIcon.classList.add('chat-explanation-loading');
                text.appendChild(loadingIcon);
                const loadingText = document.createTextNode(' ' + exp.explanation);
                text.appendChild(loadingText);
            }
            else {
                text.textContent = exp.explanation;
            }
            item.appendChild(text);
            // Item read indicator
            const itemReadIndicator = $('div.chat-explanation-item-read');
            this._updateItemReadIndicator(itemReadIndicator, exp.read);
            item.appendChild(itemReadIndicator);
            // Reply button to add context to chat
            const replyButton = $('div.chat-explanation-reply-button');
            replyButton.appendChild(renderIcon(Codicon.arrowRight));
            replyButton.title = nls.localize('followUpOnChange', "Follow up on this change");
            item.appendChild(replyButton);
            // Reply button click handler
            this._eventStore.add(addDisposableListener(replyButton, 'click', async (e) => {
                e.stopPropagation();
                const range = new Range(exp.startLineNumber, 1, exp.endLineNumber, 1);
                let chatWidget;
                if (this._chatSessionResource) {
                    chatWidget = await this._chatWidgetService.openSession(this._chatSessionResource);
                }
                else {
                    await this._viewsService.openView(ChatViewId, true);
                    chatWidget = this._chatWidgetService.lastFocusedWidget;
                }
                if (chatWidget) {
                    chatWidget.attachmentModel.addContext(chatWidget.attachmentModel.asFileVariableEntry(this._uri, range));
                }
            }));
            // Click on item to mark as read
            this._eventStore.add(addDisposableListener(item, 'click', (e) => {
                e.stopPropagation();
                exp.read = !exp.read;
                this._updateItemReadIndicator(itemReadIndicator, exp.read);
                this._updateReadIndicator();
            }));
            // Hover handlers for range highlighting
            this._eventStore.add(addDisposableListener(item, 'mouseenter', () => {
                const range = new Range(exp.startLineNumber, 1, exp.endLineNumber, this._editor.getModel()?.getLineMaxColumn(exp.endLineNumber) ?? 1);
                this._rangeHighlightDecoration.set([
                    // Line highlight with gutter decoration
                    {
                        range,
                        options: {
                            description: 'chat-explanation-range-highlight',
                            className: 'rangeHighlight',
                            isWholeLine: true,
                            linesDecorationsClassName: 'chat-explanation-range-glyph',
                        }
                    },
                    // Overview ruler indicator
                    {
                        range,
                        options: {
                            description: 'chat-explanation-range-highlight-overview',
                            overviewRuler: {
                                color: themeColorFromId(overviewRulerRangeHighlight),
                                position: OverviewRulerLane.Full,
                            }
                        }
                    }
                ]);
            }));
            this._eventStore.add(addDisposableListener(item, 'mouseleave', () => {
                this._rangeHighlightDecoration.clear();
            }));
            this._explanationItems.set(i, { item, readIndicator: itemReadIndicator, textElement: text });
            this._bodyNode.appendChild(item);
        }
    }
    /**
     * Sets the explanation for a change matching the given line number range.
     * @returns true if a matching explanation was found and updated
     */
    setExplanationByLineNumber(startLineNumber, endLineNumber, explanation) {
        for (let i = 0; i < this._explanations.length; i++) {
            const exp = this._explanations[i];
            if (exp.startLineNumber === startLineNumber && exp.endLineNumber === endLineNumber) {
                exp.explanation = explanation;
                exp.loading = false;
                this._updateExplanationText(i);
                return true;
            }
        }
        return false;
    }
    /**
     * Gets the number of explanations in this widget.
     */
    get explanationCount() {
        return this._explanations.length;
    }
    _updateExplanationText(index) {
        const itemData = this._explanationItems.get(index);
        const exp = this._explanations[index];
        if (itemData && exp) {
            clearNode(itemData.textElement);
            itemData.textElement.textContent = exp.explanation;
        }
    }
    _updateItemReadIndicator(element, read) {
        clearNode(element);
        if (read) {
            element.appendChild(renderIcon(Codicon.circle));
            element.classList.add('read');
            element.classList.remove('unread');
        }
        else {
            element.appendChild(renderIcon(Codicon.circleFilled));
            element.classList.remove('read');
            element.classList.add('unread');
        }
    }
    _updateExplanationItemsReadState() {
        this._explanationItems.forEach(({ readIndicator }, index) => {
            const exp = this._explanations[index];
            this._updateItemReadIndicator(readIndicator, exp.read);
        });
    }
    /**
     * Updates the widget position and layout
     */
    layout(startLineNumber) {
        if (this._disposed) {
            return;
        }
        this._startLineNumber = startLineNumber;
        const lineHeight = this._editor.getOption(75 /* EditorOption.lineHeight */);
        const { contentLeft, contentWidth, verticalScrollbarWidth } = this._editor.getLayoutInfo();
        const scrollTop = this._editor.getScrollTop();
        // Position at right edge like DiffHunkWidget
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
     * Shows or hides the widget
     */
    toggle(show) {
        this._domNode.classList.toggle('visible', show);
        if (show && this._explanations.length > 0) {
            this.layout(this._explanations[0].startLineNumber);
        }
    }
    /**
     * Relayouts the widget at its current line number
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
}
/**
 * Manager for explanation widgets in an editor
 * Groups changes and creates combined widgets for nearby changes
 */
export class ChatEditingExplanationWidgetManager extends Disposable {
    constructor(_editor, _chatWidgetService, _viewsService, modelManager, _modelUri) {
        super();
        this._editor = _editor;
        this._chatWidgetService = _chatWidgetService;
        this._viewsService = _viewsService;
        this._modelUri = _modelUri;
        this._widgets = [];
        this._visible = false;
        // Listen for model changes - hide/show widgets based on whether current model matches
        this._register(this._editor.onDidChangeModel(() => {
            const newUri = this._editor.getModel()?.uri;
            if (this._modelUri) {
                if (newUri && newUri.toString() === this._modelUri.toString()) {
                    // Switched back to the file - show widgets
                    for (const widget of this._widgets) {
                        widget.toggle(this._visible);
                        widget.relayout();
                    }
                }
                else {
                    // Switched to a different file - hide widgets
                    for (const widget of this._widgets) {
                        widget.toggle(false);
                    }
                }
            }
        }));
        // Observe state from model manager
        this._register(autorun(r => {
            const state = modelManager.state.read(r);
            const uriState = state.get(this._modelUri);
            if (uriState) {
                // Update diffInfo and chatSessionResource from state
                this._diffInfo = uriState.diffInfo;
                this._chatSessionResource = uriState.chatSessionResource;
                // Ensure widgets are created
                if (this._widgets.length === 0 && this._diffInfo) {
                    this._createWidgets(this._diffInfo, this._chatSessionResource);
                }
                // Handle explanation state changes
                if (uriState.progress === 'complete') {
                    this._handleExplanations(this._modelUri, uriState.explanations);
                }
                this.show();
            }
            else {
                this.hide();
            }
        }));
    }
    _createWidgets(diffInfo, chatSessionResource) {
        if (diffInfo.identical || diffInfo.changes.length === 0) {
            return;
        }
        // Group nearby changes
        const groups = groupNearbyChanges(diffInfo.changes, 5);
        // Create a widget for each group
        for (const group of groups) {
            const widget = new ChatEditingExplanationWidget(this._editor, group, diffInfo, this._chatWidgetService, this._viewsService, chatSessionResource);
            this._widgets.push(widget);
            this._register(widget);
            // Layout at the first change in the group
            widget.layout(group[0].modified.startLineNumber);
        }
        // Relayout on scroll/layout changes
        this._register(Event.any(this._editor.onDidScrollChange, this._editor.onDidLayoutChange)(() => {
            for (const widget of this._widgets) {
                widget.relayout();
            }
        }));
    }
    _handleExplanations(uri, explanations) {
        if (!this._modelUri || uri.toString() !== this._modelUri.toString()) {
            return;
        }
        // Map explanations to widgets by matching line numbers
        for (const explanation of explanations) {
            for (const widget of this._widgets) {
                // Try to set the explanation on the widget - it will match by line number
                if (widget.setExplanationByLineNumber(explanation.startLineNumber, explanation.endLineNumber, explanation.explanation)) {
                    break; // Found the matching widget, no need to check others
                }
            }
        }
    }
    /**
     * Shows all widgets
     */
    show() {
        this._visible = true;
        for (const widget of this._widgets) {
            widget.toggle(true);
            widget.relayout();
        }
    }
    /**
     * Hides all widgets
     */
    hide() {
        this._visible = false;
        for (const widget of this._widgets) {
            widget.toggle(false);
        }
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
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdFeHBsYW5hdGlvbldpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ0V4cGxhbmF0aW9uV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sMENBQTBDLENBQUM7QUFFbEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBSTVELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN4RyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFcEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRXZHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxVQUFVLEVBQW1DLE1BQU0sWUFBWSxDQUFDO0FBRXpFLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUJBQXVCLENBQUM7QUFFN0MsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBZW5FOztHQUVHO0FBQ0gsU0FBUyxjQUFjLENBQUMsTUFBbUQs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