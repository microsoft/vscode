/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatEditingExplanationWidget.css';

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from '../../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { DetailedLineRangeMapping, LineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { $, addDisposableListener, clearNode, getTotalWidth } from '../../../../../base/browser/dom.js';
import { ChatMessageRole, ILanguageModelsService } from '../../common/languageModels.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { overviewRulerRangeHighlight } from '../../../../../editor/common/core/editorColorRegistry.js';
import { IEditorDecorationsCollection } from '../../../../../editor/common/editorCommon.js';
import { ITextModel, OverviewRulerLane } from '../../../../../editor/common/model.js';
import { themeColorFromId } from '../../../../../platform/theme/common/themeService.js';
import { ChatViewId, IChatWidgetService } from '../chat.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import * as nls from '../../../../../nls.js';
import { basename } from '../../../../../base/common/resources.js';

/**
 * Simple diff info interface for explanation widgets
 * Does not require chat editing session methods like keep/undo
 */
export interface IExplanationDiffInfo {
	readonly changes: readonly (LineRangeMapping | DetailedLineRangeMapping)[];
	readonly identical: boolean;
	readonly originalModel: ITextModel;
	readonly modifiedModel: ITextModel;
}

/**
 * Explanation data for a single change hunk
 */
interface IChangeExplanation {
	readonly startLineNumber: number;
	readonly endLineNumber: number;
	explanation: string;
	read: boolean;
	loading: boolean;
	readonly originalText: string;
	readonly modifiedText: string;
}

/**
 * Gets the text content for a change
 */
function getChangeTexts(change: LineRangeMapping | DetailedLineRangeMapping, diffInfo: IExplanationDiffInfo): { originalText: string; modifiedText: string } {
	const originalLines: string[] = [];
	const modifiedLines: string[] = [];

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
function groupNearbyChanges<T extends LineRangeMapping>(changes: readonly T[], lineThreshold: number = 5): T[][] {
	if (changes.length === 0) {
		return [];
	}

	const groups: T[][] = [];
	let currentGroup: T[] = [changes[0]];

	for (let i = 1; i < changes.length; i++) {
		const firstChange = currentGroup[0];
		const currentChange = changes[i];

		// Calculate vertical span from widget position (first change) to start of current change
		const widgetLine = firstChange.modified.startLineNumber;
		const lastLine = currentChange.modified.startLineNumber;
		const verticalSpan = lastLine - widgetLine;

		if (verticalSpan <= lineThreshold) {
			currentGroup.push(currentChange);
		} else {
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
export class ChatEditingExplanationWidget extends Disposable implements IOverlayWidget {

	private static _idPool = 0;
	private readonly _id: string = `chat-explanation-widget-${ChatEditingExplanationWidget._idPool++}`;

	private readonly _domNode: HTMLElement;
	private readonly _headerNode: HTMLElement;
	private readonly _readIndicator: HTMLElement;
	private readonly _titleNode: HTMLElement;
	private readonly _dismissButton: HTMLElement;
	private readonly _toggleButton: HTMLElement;
	private readonly _bodyNode: HTMLElement;
	private readonly _explanationItems: Map<number, { item: HTMLElement; readIndicator: HTMLElement; textElement: HTMLElement }> = new Map();

	private _position: IOverlayWidgetPosition | null = null;
	private _explanations: IChangeExplanation[] = [];
	private _isExpanded: boolean = true;
	private _isAllRead: boolean = false;
	private _disposed: boolean = false;
	private _startLineNumber: number = 1;
	private readonly _uri: URI;
	private readonly _rangeHighlightDecoration: IEditorDecorationsCollection;

	private readonly _eventStore = this._register(new DisposableStore());

	constructor(
		private readonly _editor: ICodeEditor,
		private _changes: readonly (LineRangeMapping | DetailedLineRangeMapping)[],
		diffInfo: IExplanationDiffInfo,
		private readonly _chatWidgetService: IChatWidgetService,
		private readonly _viewsService: IViewsService,
	) {
		super();

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

	private _setupEventHandlers(): void {
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

	private _toggleExpanded(): void {
		this._isExpanded = !this._isExpanded;
		this._bodyNode.classList.toggle('collapsed', !this._isExpanded);
		this._updateToggleButton();
		this._editor.layoutOverlayWidget(this);
	}

	private _dismiss(): void {
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

	private _updateReadIndicator(): void {
		clearNode(this._readIndicator);
		const allRead = this._explanations.every(e => e.read);
		const someRead = this._explanations.some(e => e.read);
		this._isAllRead = allRead;

		if (allRead) {
			this._readIndicator.appendChild(renderIcon(Codicon.circle));
			this._readIndicator.classList.add('read');
			this._readIndicator.classList.remove('partial', 'unread');
			this._readIndicator.title = nls.localize('markAsUnread', "Mark as unread");
		} else if (someRead) {
			this._readIndicator.appendChild(renderIcon(Codicon.circleFilled));
			this._readIndicator.classList.remove('read', 'unread');
			this._readIndicator.classList.add('partial');
			this._readIndicator.title = nls.localize('markAllAsRead', "Mark all as read");
		} else {
			this._readIndicator.appendChild(renderIcon(Codicon.circleFilled));
			this._readIndicator.classList.remove('read', 'partial');
			this._readIndicator.classList.add('unread');
			this._readIndicator.title = nls.localize('markAsRead', "Mark as read");
		}
	}

	private _updateTitle(): void {
		const count = this._explanations.length;
		if (count === 1) {
			this._titleNode.textContent = nls.localize('oneChange', "1 change");
		} else {
			this._titleNode.textContent = nls.localize('nChanges', "{0} changes", count);
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

	private _buildExplanationItems(): void {
		clearNode(this._bodyNode);
		this._explanationItems.clear();

		for (let i = 0; i < this._explanations.length; i++) {
			const exp = this._explanations[i];
			const item = $('div.chat-explanation-item');

			// Line indicator
			const lineInfo = $('span.chat-explanation-line-info');
			if (exp.startLineNumber === exp.endLineNumber) {
				lineInfo.textContent = nls.localize('lineNumber', "Line {0}", exp.startLineNumber);
			} else {
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
			} else {
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
				const chatWidget = this._chatWidgetService.lastFocusedWidget;
				if (chatWidget) {
					const range = new Range(exp.startLineNumber, 1, exp.endLineNumber, 1);
					chatWidget.attachmentModel.addContext(
						chatWidget.attachmentModel.asFileVariableEntry(this._uri, range)
					);
				}
				await this._viewsService.openView(ChatViewId, true);
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
	 * Sets the explanation for a specific change index.
	 * Called by the manager after batch generation completes.
	 */
	setExplanation(changeIndex: number, explanation: string): void {
		if (changeIndex >= 0 && changeIndex < this._explanations.length) {
			const exp = this._explanations[changeIndex];
			exp.explanation = explanation;
			exp.loading = false;
			this._updateExplanationText(changeIndex);
		}
	}

	/**
	 * Marks all explanations as failed to generate.
	 */
	setAllFailed(): void {
		for (let i = 0; i < this._explanations.length; i++) {
			const exp = this._explanations[i];
			if (exp.loading) {
				exp.explanation = nls.localize('failedToGenerateExplanation', "Failed to generate explanation.");
				exp.loading = false;
				this._updateExplanationText(i);
			}
		}
	}

	/**
	 * Gets the number of explanations in this widget.
	 */
	get explanationCount(): number {
		return this._explanations.length;
	}

	private _updateExplanationText(index: number): void {
		const itemData = this._explanationItems.get(index);
		const exp = this._explanations[index];
		if (itemData && exp) {
			clearNode(itemData.textElement);
			itemData.textElement.textContent = exp.explanation;
		}
	}

	private _updateItemReadIndicator(element: HTMLElement, read: boolean): void {
		clearNode(element);
		if (read) {
			element.appendChild(renderIcon(Codicon.circle));
			element.classList.add('read');
			element.classList.remove('unread');
		} else {
			element.appendChild(renderIcon(Codicon.circleFilled));
			element.classList.remove('read');
			element.classList.add('unread');
		}
	}

	private _updateExplanationItemsReadState(): void {
		this._explanationItems.forEach(({ readIndicator }, index) => {
			const exp = this._explanations[index];
			this._updateItemReadIndicator(readIndicator, exp.read);
		});
	}

	/**
	 * Updates the widget position and layout
	 */
	layout(startLineNumber: number): void {
		if (this._disposed) {
			return;
		}

		this._startLineNumber = startLineNumber;

		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
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
	toggle(show: boolean): void {
		this._domNode.classList.toggle('visible', show);
		if (show && this._explanations.length > 0) {
			this.layout(this._explanations[0].startLineNumber);
		}
	}

	/**
	 * Relayouts the widget at its current line number
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
 * Manager for explanation widgets in an editor
 * Groups changes and creates combined widgets for nearby changes
 */
export class ChatEditingExplanationWidgetManager extends Disposable {

	private readonly _widgets: ChatEditingExplanationWidget[] = [];
	private _visible: boolean = false;

	private _modelUri: URI | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _chatWidgetService: IChatWidgetService,
		private readonly _viewsService: IViewsService,
	) {
		super();

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
				} else {
					// Switched to a different file - hide widgets
					for (const widget of this._widgets) {
						widget.toggle(false);
					}
				}
			}
		}));
	}

	/**
	 * Updates the diff info and generates explanations.
	 * Creates widgets immediately and starts LLM generation.
	 * @param visible Whether widgets should be visible (default: false)
	 */
	update(diffInfo: IExplanationDiffInfo, visible: boolean = false): void {
		this._modelUri = diffInfo.modifiedModel.uri;

		// Clear existing widgets
		this._clearWidgets();

		if (diffInfo.identical || diffInfo.changes.length === 0) {
			this._visible = visible;
			return;
		}

		// Group nearby changes
		const groups = groupNearbyChanges(diffInfo.changes, 5);

		// Create a widget for each group
		for (const group of groups) {
			const widget = new ChatEditingExplanationWidget(
				this._editor,
				group,
				diffInfo,
				this._chatWidgetService,
				this._viewsService,
			);
			this._widgets.push(widget);
			this._register(widget);

			// Layout at the first change in the group
			widget.layout(group[0].modified.startLineNumber);
			widget.toggle(visible);
		}

		this._visible = visible;

		// Relayout on scroll/layout changes
		this._register(Event.any(this._editor.onDidScrollChange, this._editor.onDidLayoutChange)(() => {
			for (const widget of this._widgets) {
				widget.relayout();
			}
		}));
	}

	/**
	 * Gets the widgets managed by this manager.
	 */
	get widgets(): readonly ChatEditingExplanationWidget[] {
		return this._widgets;
	}

	/**
	 * Generates explanations for all changes directly from diff info in a single LLM request.
	 * This is a static function that can be called after creating widget managers.
	 */
	static async generateExplanations(
		widgets: readonly ChatEditingExplanationWidget[],
		diffInfo: IExplanationDiffInfo,
		languageModelsService: ILanguageModelsService,
		cancellationToken: import('../../../../../base/common/cancellation.js').CancellationToken
	): Promise<void> {
		if (diffInfo.changes.length === 0) {
			return;
		}

		// Build change data directly from diffInfo
		const fileName = basename(diffInfo.modifiedModel.uri);
		const changeData = diffInfo.changes.map(change => {
			const { originalText, modifiedText } = getChangeTexts(change, diffInfo);
			return {
				startLineNumber: change.modified.startLineNumber,
				endLineNumber: change.modified.endLineNumberExclusive - 1,
				originalText,
				modifiedText,
			};
		});

		try {
			// Select a high-end model for better understanding of all changes together
			let models = await languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'claude-3.5-sonnet' });
			if (!models.length) {
				models = await languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o' });
			}
			if (!models.length) {
				models = await languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4' });
			}
			if (!models.length) {
				// Fallback to any available model
				models = await languageModelsService.selectLanguageModels({ vendor: 'copilot' });
			}
			if (!models.length) {
				for (const widget of widgets) {
					widget.setAllFailed();
				}
				return;
			}

			// Build a prompt with all changes
			const changesDescription = changeData.map((data, index) => {
				return `=== CHANGE ${index} (File: ${fileName}, Lines ${data.startLineNumber}-${data.endLineNumber}) ===
BEFORE:
${data.originalText || '(empty)'}

AFTER:
${data.modifiedText || '(empty)'}`;
			}).join('\n\n');

			const prompt = `Analyze these ${changeData.length} code changes and provide a brief explanation for each one.

${changesDescription}

Respond with a JSON array containing exactly ${changeData.length} objects, one for each change in order.
Each object should have an "explanation" field with a brief sentence (max 15 words) explaining what changed and why.
Be specific about the actual code changes. Return ONLY valid JSON, no markdown.

Example response format:
[{"explanation": "Added null check to prevent crash"}, {"explanation": "Renamed variable for clarity"}]`;

			const response = await languageModelsService.sendChatRequest(
				models[0],
				new ExtensionIdentifier('core'),
				[{ role: ChatMessageRole.User, content: [{ type: 'text', value: prompt }] }],
				{},
				cancellationToken
			);

			let responseText = '';
			for await (const part of response.stream) {
				if (Array.isArray(part)) {
					for (const p of part) {
						if (p.type === 'text') {
							responseText += p.value;
						}
					}
				} else if (part.type === 'text') {
					responseText += part.value;
				}
			}

			await response.result;

			// Parse the JSON response
			try {
				// Handle potential markdown wrapping
				let jsonText = responseText.trim();
				if (jsonText.startsWith('```')) {
					jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
				}

				const explanations: { explanation: string }[] = JSON.parse(jsonText);

				// Map explanations back to widgets based on change indices
				let changeIndex = 0;
				for (const widget of widgets) {
					const count = widget.explanationCount;
					for (let i = 0; i < count; i++) {
						const parsed = explanations[changeIndex];
						const explanation = parsed?.explanation?.trim() || nls.localize('codeWasModified', "Code was modified.");
						widget.setExplanation(i, explanation);
						changeIndex++;
					}
				}
			} catch {
				// JSON parsing failed, set generic message for all
				for (const widget of widgets) {
					for (let i = 0; i < widget.explanationCount; i++) {
						widget.setExplanation(i, nls.localize('codeWasModified', "Code was modified."));
					}
				}
			}
		} catch {
			for (const widget of widgets) {
				widget.setAllFailed();
			}
		}
	}

	/**
	 * Shows all widgets
	 */
	show(): void {
		this._visible = true;
		for (const widget of this._widgets) {
			widget.toggle(true);
			widget.relayout();
		}
	}

	/**
	 * Hides all widgets
	 */
	hide(): void {
		this._visible = false;
		for (const widget of this._widgets) {
			widget.toggle(false);
		}
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
