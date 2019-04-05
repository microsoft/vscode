/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { Action } from 'vs/base/common/actions';
import * as arrays from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';
import { Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import * as modes from 'vs/editor/common/modes';
import { peekViewBorder } from 'vs/editor/contrib/referenceSearch/referencesWidget';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/zoneWidget';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { CommentGlyphWidget } from 'vs/workbench/contrib/comments/browser/commentGlyphWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { SimpleCommentEditor } from './simpleCommentEditor';
import { URI } from 'vs/base/common/uri';
import { transparent, editorForeground, textLinkActiveForeground, textLinkForeground, focusBorder, textBlockQuoteBackground, textBlockQuoteBorder, contrastBorder, inputValidationErrorBorder, inputValidationErrorBackground, inputValidationErrorForeground } from 'vs/platform/theme/common/colorRegistry';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { IRange } from 'vs/editor/common/core/range';
import { IPosition } from 'vs/editor/common/core/position';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';
import { IMarginData } from 'vs/editor/browser/controller/mouseTarget';
import { CommentNode } from 'vs/workbench/contrib/comments/browser/commentNode';
import { ITextModel } from 'vs/editor/common/model';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { generateUuid } from 'vs/base/common/uuid';
import { ICommentThreadWidget } from 'vs/workbench/contrib/comments/common/commentThreadWidget';

export const COMMENTEDITOR_DECORATION_KEY = 'commenteditordecoration';
const COLLAPSE_ACTION_CLASS = 'expand-review-action octicon octicon-x';
const COMMENT_SCHEME = 'comment';


let INMEM_MODEL_ID = 0;

export class ReviewZoneWidget extends ZoneWidget implements ICommentThreadWidget {
	private _headElement: HTMLElement;
	protected _headingLabel: HTMLElement;
	protected _actionbarWidget: ActionBar;
	private _bodyElement: HTMLElement;
	private _parentEditor: ICodeEditor;
	private _commentEditor: ICodeEditor;
	private _commentsElement: HTMLElement;
	private _commentElements: CommentNode[];
	private _commentForm: HTMLElement;
	private _reviewThreadReplyButton: HTMLElement;
	private _resizeObserver: any;
	private _onDidClose = new Emitter<ReviewZoneWidget | undefined>();
	private _isExpanded?: boolean;
	private _collapseAction: Action;
	private _commentGlyph?: CommentGlyphWidget;
	private _submitActionsDisposables: IDisposable[];
	private _globalToDispose: IDisposable[];
	private _markdownRenderer: MarkdownRenderer;
	private _styleElement: HTMLStyleElement;
	private _formActions: HTMLElement | null;
	private _error: HTMLElement;

	get owner(): string {
		return this._owner;
	}
	get commentThread(): modes.CommentThread {
		return this._commentThread;
	}

	get extensionId(): string | undefined {
		return this._commentThread.extensionId;
	}

	constructor(
		editor: ICodeEditor,
		private _owner: string,
		private _commentThread: modes.CommentThread,
		private _pendingComment: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IModeService private modeService: IModeService,
		@ICommandService private commandService: ICommandService,
		@IModelService private modelService: IModelService,
		@IThemeService private themeService: IThemeService,
		@ICommentService private commentService: ICommentService,
		@IOpenerService private openerService: IOpenerService
	) {
		super(editor, { keepEditorSelection: true });
		this._resizeObserver = null;
		this._isExpanded = _commentThread.collapsibleState ? _commentThread.collapsibleState === modes.CommentThreadCollapsibleState.Expanded : undefined;
		this._globalToDispose = [];
		this._submitActionsDisposables = [];
		this._formActions = null;
		this.create();

		this._styleElement = dom.createStyleSheet(this.domNode);
		this._globalToDispose.push(this.themeService.onThemeChange(this._applyTheme, this));
		this._globalToDispose.push(this.editor.onDidChangeConfiguration(e => {
			if (e.fontInfo) {
				this._applyTheme(this.themeService.getTheme());
			}
		}));
		this._applyTheme(this.themeService.getTheme());

		this._markdownRenderer = new MarkdownRenderer(editor, this.modeService, this.openerService);
		this._parentEditor = editor;
	}

	protected revealLine(lineNumber: number) {
		// we don't do anything here as we always do the reveal ourselves.
	}

	reveal(commentId?: string) {
		if (!this._isExpanded) {
			this.show({ lineNumber: this._commentThread.range.startLineNumber, column: 1 }, 2);
		}

		if (commentId) {
			let height = this.editor.getLayoutInfo().height;
			let matchedNode = this._commentElements.filter(commentNode => commentNode.comment.commentId === commentId);
			if (matchedNode && matchedNode.length) {
				const commentThreadCoords = dom.getDomNodePagePosition(this._commentElements[0].domNode);
				const commentCoords = dom.getDomNodePagePosition(matchedNode[0].domNode);

				this.editor.setScrollTop(this.editor.getTopForLineNumber(this._commentThread.range.startLineNumber) - height / 2 + commentCoords.top - commentThreadCoords.top);
				return;
			}
		}

		this.editor.revealRangeInCenter(this._commentThread.range);
	}

	getPendingComment(): string | null {
		if (this._commentEditor) {
			let model = this._commentEditor.getModel();

			if (model && model.getValueLength() > 0) { // checking length is cheap
				return model.getValue();
			}
		}

		return null;
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('review-widget');
		this._headElement = <HTMLDivElement>dom.$('.head');
		container.appendChild(this._headElement);
		this._fillHead(this._headElement);

		this._bodyElement = <HTMLDivElement>dom.$('.body');
		container.appendChild(this._bodyElement);

		dom.addDisposableListener(this._bodyElement, dom.EventType.FOCUS_IN, e => {
			this.commentService.setActiveCommentThread(this._commentThread);
		});
	}

	protected _fillHead(container: HTMLElement): void {
		let titleElement = dom.append(this._headElement, dom.$('.review-title'));

		this._headingLabel = dom.append(titleElement, dom.$('span.filename'));
		this.createThreadLabel(this._commentThread);

		const actionsContainer = dom.append(this._headElement, dom.$('.review-actions'));
		this._actionbarWidget = new ActionBar(actionsContainer, {});
		this._disposables.push(this._actionbarWidget);

		this._collapseAction = new Action('review.expand', nls.localize('label.collapse', "Collapse"), COLLAPSE_ACTION_CLASS, true, () => this.collapse());

		this._actionbarWidget.push(this._collapseAction, { label: false, icon: true });
	}

	collapse(): Promise<void> {
		if (this._commentThread.comments && this._commentThread.comments.length === 0) {
			if (this._commentThread.commentThreadHandle === undefined) {
				this.dispose();
				return Promise.resolve();
			} else {
				const deleteCommand = this._commentThread.deleteCommand;
				if (deleteCommand) {
					return this.commandService.executeCommand(deleteCommand.id, ...(deleteCommand.arguments || []));
				}
			}
		}

		this.hide();
		return Promise.resolve();
	}

	getGlyphPosition(): number {
		if (this._commentGlyph) {
			return this._commentGlyph.getPosition().position!.lineNumber;
		}
		return 0;
	}

	toggleExpand(lineNumber: number) {
		if (this._isExpanded) {
			this.hide();
			if (this._commentThread === null || this._commentThread.threadId === null) {
				this.dispose();
			}
		} else {
			this.show({ lineNumber: lineNumber, column: 1 }, 2);
		}
	}

	async update(commentThread: modes.CommentThread) {
		// update comment thread comments
		const oldCommentsLen = this._commentElements.length;
		const newCommentsLen = commentThread.comments ? commentThread.comments.length : 0;

		let commentElementsToDel: CommentNode[] = [];
		let commentElementsToDelIndex: number[] = [];
		for (let i = 0; i < oldCommentsLen; i++) {
			let comment = this._commentElements[i].comment;
			let newComment = commentThread.comments ? commentThread.comments.filter(c => c.commentId === comment.commentId) : [];

			if (newComment.length) {
				this._commentElements[i].update(newComment[0]);
			} else {
				commentElementsToDelIndex.push(i);
				commentElementsToDel.push(this._commentElements[i]);
			}
		}

		// del removed elements
		for (let i = commentElementsToDel.length - 1; i >= 0; i--) {
			this._commentElements.splice(commentElementsToDelIndex[i], 1);
			this._commentsElement.removeChild(commentElementsToDel[i].domNode);
		}

		let lastCommentElement: HTMLElement | null = null;
		let newCommentNodeList: CommentNode[] = [];
		for (let i = newCommentsLen - 1; i >= 0; i--) {
			let currentComment = commentThread.comments![i];
			let oldCommentNode = this._commentElements.filter(commentNode => commentNode.comment.commentId === currentComment.commentId);
			if (oldCommentNode.length) {
				oldCommentNode[0].update(currentComment);
				lastCommentElement = oldCommentNode[0].domNode;
				newCommentNodeList.unshift(oldCommentNode[0]);
			} else {
				const newElement = this.createNewCommentNode(currentComment);

				newCommentNodeList.unshift(newElement);
				if (lastCommentElement) {
					this._commentsElement.insertBefore(newElement.domNode, lastCommentElement);
					lastCommentElement = newElement.domNode;
				} else {
					this._commentsElement.appendChild(newElement.domNode);
					lastCommentElement = newElement.domNode;
				}
			}
		}

		// update comment thread label
		if (this._commentThread.label !== commentThread.label) {
			this.createThreadLabel(commentThread);
		}

		// update comment thread commands.
		if (!commentThreadCommandsEquals(this._commentThread, commentThread)) {
			if (this._formActions && this._commentEditor.hasModel()) {
				dom.clearNode(this._formActions);
				const model = this._commentEditor.getModel();
				this.createCommentWidgetActions(this._formActions, model, commentThread);
			}
		}

		this._commentThread = commentThread;
		this._commentElements = newCommentNodeList;

		// Move comment glyph widget and show position if the line has changed.
		const lineNumber = this._commentThread.range.startLineNumber;
		let shouldMoveWidget = false;
		if (this._commentGlyph) {
			if (this._commentGlyph.getPosition().position!.lineNumber !== lineNumber) {
				shouldMoveWidget = true;
				this._commentGlyph.setLineNumber(lineNumber);
			}
		}

		if (!this._reviewThreadReplyButton) {
			this.createReplyButton();
		}

		if (this._commentThread.comments && this._commentThread.comments.length === 0) {
			this.expandReplyArea();
		}

		if (shouldMoveWidget && this._isExpanded) {
			this.show({ lineNumber, column: 1 }, 2);
		}

		// The collapsible state is not initialized yet.
		if (this._isExpanded === undefined) {
			if (this._commentThread.collapsibleState === modes.CommentThreadCollapsibleState.Expanded) {
				this.show({ lineNumber, column: 1 }, 2);
			} else {
				this.hide();
			}
		}
	}

	protected _onWidth(widthInPixel: number): void {
		this._commentEditor.layout({ height: 5 * 18, width: widthInPixel - 54 /* margin 20px * 10 + scrollbar 14px*/ });
	}

	protected _doLayout(heightInPixel: number, widthInPixel: number): void {
		this._commentEditor.layout({ height: 5 * 18, width: widthInPixel - 54 /* margin 20px * 10 + scrollbar 14px*/ });
	}

	display(lineNumber: number) {
		this._commentGlyph = new CommentGlyphWidget(this.editor, lineNumber);

		this._disposables.push(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
		this._disposables.push(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));

		let headHeight = Math.ceil(this.editor.getConfiguration().lineHeight * 1.2);
		this._headElement.style.height = `${headHeight}px`;
		this._headElement.style.lineHeight = this._headElement.style.height;

		this._commentsElement = dom.append(this._bodyElement, dom.$('div.comments-container'));
		this._commentsElement.setAttribute('role', 'presentation');

		this._commentElements = [];
		if (this._commentThread.comments) {
			for (const comment of this._commentThread.comments) {
				const newCommentNode = this.createNewCommentNode(comment);

				this._commentElements.push(newCommentNode);
				this._commentsElement.appendChild(newCommentNode.domNode);
			}
		}

		const hasExistingComments = this._commentThread.comments && this._commentThread.comments.length > 0;
		this._commentForm = dom.append(this._bodyElement, dom.$('.comment-form'));
		this._commentEditor = this.instantiationService.createInstance(SimpleCommentEditor, this._commentForm, SimpleCommentEditor.getEditorOptions(), this._parentEditor, this);

		const modeId = generateUuid() + '-' + (hasExistingComments ? this._commentThread.threadId : ++INMEM_MODEL_ID);
		const params = JSON.stringify({
			extensionId: this.extensionId,
			commentThreadId: this.commentThread.threadId
		});
		const resource = URI.parse(`${COMMENT_SCHEME}:commentinput-${modeId}.md?${params}`);
		const model = this.modelService.createModel(this._pendingComment || '', this.modeService.createByFilepathOrFirstLine(resource.path), resource, false);
		this._disposables.push(model);
		this._commentEditor.setModel(model);
		this._disposables.push(this._commentEditor);
		this._disposables.push(this._commentEditor.getModel()!.onDidChangeContent(() => this.setCommentEditorDecorations()));
		this._disposables.push(this._commentEditor.onDidFocusEditorWidget(() => {
			let commentThread = this._commentThread;
			commentThread.input = {
				uri: this._commentEditor.getModel()!.uri,
				value: this._commentEditor.getValue()
			};
			this.commentService.setActiveCommentThread(this._commentThread);
		}));

		this._disposables.push(this._commentEditor.getModel()!.onDidChangeContent(() => {
			let modelContent = this._commentEditor.getValue();
			let thread = this._commentThread;
			if (thread.input && thread.input.uri === this._commentEditor.getModel()!.uri && thread.input.value !== modelContent) {
				let newInput: modes.CommentInput = thread.input;
				newInput.value = modelContent;
				thread.input = newInput;
			}
		}));

		this._disposables.push(this._commentThread.onDidChangeInput(input => {
			let thread = this._commentThread;

			if (thread.input && thread.input.uri !== this._commentEditor.getModel()!.uri) {
				return;
			}
			if (!input) {
				return;
			}

			if (this._commentEditor.getValue() !== input.value) {
				this._commentEditor.setValue(input.value);

				if (input.value === '') {
					this._pendingComment = '';
					if (dom.hasClass(this._commentForm, 'expand')) {
						dom.removeClass(this._commentForm, 'expand');
					}
					this._commentEditor.getDomNode()!.style.outline = '';
					this._error.textContent = '';
					dom.addClass(this._error, 'hidden');
				}
			}
		}));

		this.setCommentEditorDecorations();

		// Only add the additional step of clicking a reply button to expand the textarea when there are existing comments
		if (hasExistingComments) {
			this.createReplyButton();
		} else {
			if (this._commentThread.comments && this._commentThread.comments.length === 0) {
				this.expandReplyArea();
			}
		}

		this._error = dom.append(this._commentForm, dom.$('.validation-error.hidden'));

		this._formActions = dom.append(this._commentForm, dom.$('.form-actions'));
		this.createCommentWidgetActions(this._formActions, model, this._commentThread);

		this._resizeObserver = new MutationObserver(this._refresh.bind(this));

		this._resizeObserver.observe(this._bodyElement, {
			attributes: true,
			childList: true,
			characterData: true,
			subtree: true
		});

		if (this._commentThread.collapsibleState === modes.CommentThreadCollapsibleState.Expanded) {
			this.show({ lineNumber: lineNumber, column: 1 }, 2);
		}

		// If there are no existing comments, place focus on the text area. This must be done after show, which also moves focus.
		// if this._commentThread.comments is undefined, it doesn't finish initialization yet, so we don't focus the editor immediately.
		if (this._commentThread.comments && !this._commentThread.comments.length) {
			this._commentEditor.focus();
		} else if (this._commentEditor.getModel()!.getValueLength() > 0) {
			this.expandReplyArea();
		}
	}

	private getActiveComment(): CommentNode | ReviewZoneWidget {
		return this._commentElements.filter(node => node.isEditing)[0] || this;
	}

	/**
	 * Command based actions.
	 */
	private createCommentWidgetActions(container: HTMLElement, model: ITextModel, commentThread: modes.CommentThread) {
		const { acceptInputCommand, additionalCommands } = commentThread;

		if (acceptInputCommand) {
			const button = new Button(container);
			this._disposables.push(attachButtonStyler(button, this.themeService));

			button.label = acceptInputCommand.title;
			this._disposables.push(button.onDidClick(async () => {
				commentThread.input = {
					uri: this._commentEditor.getModel()!.uri,
					value: this._commentEditor.getValue()
				};
				this.commentService.setActiveCommentThread(commentThread);
				await this.commandService.executeCommand(acceptInputCommand.id, ...(acceptInputCommand.arguments || []));
			}));

			button.enabled = model.getValueLength() > 0;
			this._disposables.push(this._commentEditor.onDidChangeModelContent(_ => {
				if (this._commentEditor.getValue()) {
					button.enabled = true;
				} else {
					button.enabled = false;
				}
			}));
		}

		if (additionalCommands) {
			additionalCommands.reverse().forEach(command => {
				const button = new Button(container);
				this._disposables.push(attachButtonStyler(button, this.themeService));

				button.label = command.title;
				this._disposables.push(button.onDidClick(async () => {
					commentThread.input = {
						uri: this._commentEditor.getModel()!.uri,
						value: this._commentEditor.getValue()
					};
					this.commentService.setActiveCommentThread(commentThread);
					await this.commandService.executeCommand(command.id, ...(command.arguments || []));
				}));
			});
		}
	}

	private createNewCommentNode(comment: modes.Comment): CommentNode {
		let newCommentNode = this.instantiationService.createInstance(CommentNode,
			this._commentThread,
			comment,
			this.owner,
			this.editor.getModel()!.uri,
			this._parentEditor,
			this,
			this._markdownRenderer);

		this._disposables.push(newCommentNode);
		this._disposables.push(newCommentNode.onDidDelete(deletedNode => {
			const deletedNodeId = deletedNode.comment.commentId;
			const deletedElementIndex = arrays.firstIndex(this._commentElements, commentNode => commentNode.comment.commentId === deletedNodeId);
			if (deletedElementIndex > -1) {
				this._commentElements.splice(deletedElementIndex, 1);
			}

			const deletedCommentIndex = arrays.firstIndex(this._commentThread.comments!, comment => comment.commentId === deletedNodeId);
			if (deletedCommentIndex > -1) {
				this._commentThread.comments!.splice(deletedCommentIndex, 1);
			}

			this._commentsElement.removeChild(deletedNode.domNode);
			deletedNode.dispose();

			if (this._commentThread.comments!.length === 0) {
				this.dispose();
			}
		}));

		return newCommentNode;
	}

	async submitComment(): Promise<void> {
		const activeComment = this.getActiveComment();
		if (activeComment instanceof ReviewZoneWidget) {
			let commentThread = this._commentThread;

			if (commentThread.acceptInputCommand) {
				commentThread.input = {
					uri: this._commentEditor.getModel()!.uri,
					value: this._commentEditor.getValue()
				};
				this.commentService.setActiveCommentThread(this._commentThread);
				let commandId = commentThread.acceptInputCommand.id;
				let args = commentThread.acceptInputCommand.arguments || [];

				await this.commandService.executeCommand(commandId, ...args);
				return;
			}
		}

		if (activeComment instanceof CommentNode) {
			activeComment.editComment();
		}
	}

	private createThreadLabel(commentThread: modes.CommentThread) {
		let label = commentThread.label;

		if (label === undefined) {
			if (commentThread.comments && commentThread.comments.length) {
				const participantsList = commentThread.comments.filter(arrays.uniqueFilter(comment => comment.userName)).map(comment => `@${comment.userName}`).join(', ');
				label = nls.localize('commentThreadParticipants', "Participants: {0}", participantsList);
			} else {
				label = nls.localize('startThread', "Start discussion");
			}
		}

		this._headingLabel.innerHTML = strings.escape(label);
		this._headingLabel.setAttribute('aria-label', label);
	}

	private expandReplyArea() {
		if (!dom.hasClass(this._commentForm, 'expand')) {
			dom.addClass(this._commentForm, 'expand');
			this._commentEditor.focus();
		}
	}

	private createReplyButton() {
		this._reviewThreadReplyButton = <HTMLButtonElement>dom.append(this._commentForm, dom.$('button.review-thread-reply-button'));
		// this._reviewThreadReplyButton.title = this._commentThread.acceptInputCommands.title;
		if (this._commentThread.commentThreadHandle !== undefined) {
		} else {
			this._reviewThreadReplyButton.title = nls.localize('reply', "Reply...");
		}
		this._reviewThreadReplyButton.textContent = nls.localize('reply', "Reply...");
		// bind click/escape actions for reviewThreadReplyButton and textArea
		this._disposables.push(dom.addDisposableListener(this._reviewThreadReplyButton, 'click', _ => this.expandReplyArea()));
		this._disposables.push(dom.addDisposableListener(this._reviewThreadReplyButton, 'focus', _ => this.expandReplyArea()));

		this._commentEditor.onDidBlurEditorWidget(() => {
			if (this._commentEditor.getModel()!.getValueLength() === 0 && dom.hasClass(this._commentForm, 'expand')) {
				dom.removeClass(this._commentForm, 'expand');
			}
		});
	}

	_refresh() {
		if (this._isExpanded && this._bodyElement) {
			let dimensions = dom.getClientArea(this._bodyElement);
			const headHeight = Math.ceil(this.editor.getConfiguration().lineHeight * 1.2);
			const lineHeight = this.editor.getConfiguration().lineHeight;
			const arrowHeight = Math.round(lineHeight / 3);
			const frameThickness = Math.round(lineHeight / 9) * 2;

			const computedLinesNumber = Math.ceil((headHeight + dimensions.height + arrowHeight + frameThickness + 8 /** margin bottom to avoid margin collapse */) / lineHeight);
			this._relayout(computedLinesNumber);
		}
	}

	private setCommentEditorDecorations() {
		const model = this._commentEditor && this._commentEditor.getModel();
		if (model) {
			const valueLength = model.getValueLength();
			const hasExistingComments = this._commentThread.comments && this._commentThread.comments.length > 0;
			const placeholder = valueLength > 0
				? ''
				: hasExistingComments
					? nls.localize('reply', "Reply...")
					: nls.localize('newComment', "Type a new comment");
			const decorations = [{
				range: {
					startLineNumber: 0,
					endLineNumber: 0,
					startColumn: 0,
					endColumn: 1
				},
				renderOptions: {
					after: {
						contentText: placeholder,
						color: `${transparent(editorForeground, 0.4)(this.themeService.getTheme())}`
					}
				}
			}];

			this._commentEditor.setDecorations(COMMENTEDITOR_DECORATION_KEY, decorations);
		}
	}

	private mouseDownInfo: { lineNumber: number } | null;

	private onEditorMouseDown(e: IEditorMouseEvent): void {
		this.mouseDownInfo = null;

		const range = e.target.range;

		if (!range) {
			return;
		}

		if (!e.event.leftButton) {
			return;
		}

		if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
			return;
		}

		const data = e.target.detail as IMarginData;
		const gutterOffsetX = data.offsetX - data.glyphMarginWidth - data.lineNumbersWidth - data.glyphMarginLeft;

		// don't collide with folding and git decorations
		if (gutterOffsetX > 14) {
			return;
		}

		this.mouseDownInfo = { lineNumber: range.startLineNumber };
	}

	private onEditorMouseUp(e: IEditorMouseEvent): void {
		if (!this.mouseDownInfo) {
			return;
		}

		const { lineNumber } = this.mouseDownInfo;
		this.mouseDownInfo = null;

		const range = e.target.range;

		if (!range || range.startLineNumber !== lineNumber) {
			return;
		}

		if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
			return;
		}

		if (!e.target.element) {
			return;
		}

		if (this._commentGlyph && this._commentGlyph.getPosition().position!.lineNumber !== lineNumber) {
			return;
		}

		if (e.target.element.className.indexOf('comment-thread') >= 0) {
			this.toggleExpand(lineNumber);
		}
	}

	private _applyTheme(theme: ITheme) {
		const borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor
		});

		const content: string[] = [];
		const linkColor = theme.getColor(textLinkForeground);
		if (linkColor) {
			content.push(`.monaco-editor .review-widget .body .comment-body a { color: ${linkColor} }`);
		}

		const linkActiveColor = theme.getColor(textLinkActiveForeground);
		if (linkActiveColor) {
			content.push(`.monaco-editor .review-widget .body .comment-body a:hover, a:active { color: ${linkActiveColor} }`);
		}

		const focusColor = theme.getColor(focusBorder);
		if (focusColor) {
			content.push(`.monaco-editor .review-widget .body .comment-body a:focus { outline: 1px solid ${focusColor}; }`);
			content.push(`.monaco-editor .review-widget .body .monaco-editor.focused { outline: 1px solid ${focusColor}; }`);
		}

		const blockQuoteBackground = theme.getColor(textBlockQuoteBackground);
		if (blockQuoteBackground) {
			content.push(`.monaco-editor .review-widget .body .review-comment blockquote { background: ${blockQuoteBackground}; }`);
		}

		const blockQuoteBOrder = theme.getColor(textBlockQuoteBorder);
		if (blockQuoteBOrder) {
			content.push(`.monaco-editor .review-widget .body .review-comment blockquote { border-color: ${blockQuoteBOrder}; }`);
		}

		const hcBorder = theme.getColor(contrastBorder);
		if (hcBorder) {
			content.push(`.monaco-editor .review-widget .body .comment-form .review-thread-reply-button { outline-color: ${hcBorder}; }`);
			content.push(`.monaco-editor .review-widget .body .monaco-editor { outline: 1px solid ${hcBorder}; }`);
		}

		const errorBorder = theme.getColor(inputValidationErrorBorder);
		if (errorBorder) {
			content.push(`.monaco-editor .review-widget .validation-error { border: 1px solid ${errorBorder}; }`);
		}

		const errorBackground = theme.getColor(inputValidationErrorBackground);
		if (errorBackground) {
			content.push(`.monaco-editor .review-widget .validation-error { background: ${errorBackground}; }`);
		}

		const errorForeground = theme.getColor(inputValidationErrorForeground);
		if (errorForeground) {
			content.push(`.monaco-editor .review-widget .body .comment-form .validation-error { color: ${errorForeground}; }`);
		}

		const fontInfo = this.editor.getConfiguration().fontInfo;
		content.push(`.monaco-editor .review-widget .body code {
			font-family: ${fontInfo.fontFamily};
			font-size: ${fontInfo.fontSize}px;
			font-weight: ${fontInfo.fontWeight};
		}`);

		this._styleElement.innerHTML = content.join('\n');

		// Editor decorations should also be responsive to theme changes
		this.setCommentEditorDecorations();
	}

	show(rangeOrPos: IRange | IPosition, heightInLines: number): void {
		this._isExpanded = true;
		super.show(rangeOrPos, heightInLines);
		this._refresh();
	}

	hide() {
		this._isExpanded = false;
		// Focus the container so that the comment editor will be blurred before it is hidden
		this.editor.focus();
		super.hide();
	}

	dispose() {
		super.dispose();
		if (this._resizeObserver) {
			this._resizeObserver.disconnect();
			this._resizeObserver = null;
		}

		if (this._commentGlyph) {
			this._commentGlyph.dispose();
			this._commentGlyph = undefined;
		}

		this._globalToDispose.forEach(global => global.dispose());
		this._submitActionsDisposables.forEach(local => local.dispose());
		this._onDidClose.fire(undefined);
	}
}

function compareArgs(a: any[], b: any[]): boolean {
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}

	return true;
}

function commandEquals(a: modes.Command, b: modes.Command): boolean {
	return a.id === b.id
		&& a.title === b.title
		&& a.tooltip === b.tooltip
		&& (a.arguments && b.arguments ? compareArgs(a.arguments, b.arguments) : a.arguments === b.arguments);
}

function commandListEquals(a: modes.Command[], b: modes.Command[]): boolean {
	if (a.length !== b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i++) {
		if (!commandEquals(a[i], b[i])) {
			return false;
		}
	}

	return true;
}

function commentThreadCommandsEquals(a: modes.CommentThread, b: modes.CommentThread): boolean {
	let result = false;

	if (a.acceptInputCommand && b.acceptInputCommand) {
		result = commandEquals(a.acceptInputCommand, b.acceptInputCommand);
	} else if (a.acceptInputCommand) {
		return false;
	} else if (b.acceptInputCommand) {
		return false;
	}

	if (!result) {
		return false;
	}

	if (a.additionalCommands && b.additionalCommands) {
		result = commandListEquals(a.additionalCommands, b.additionalCommands);
	} else if (a.additionalCommands) {
		return false;
	} else if (b.additionalCommands) {
		return false;
	}

	return result;
}