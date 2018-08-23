/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { $ } from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { Action } from 'vs/base/common/actions';
import * as arrays from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import * as modes from 'vs/editor/common/modes';
import { peekViewBorder } from 'vs/editor/contrib/referenceSearch/referencesWidget';
import { IOptions, ZoneWidget } from 'vs/editor/contrib/zoneWidget/zoneWidget';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { CommentGlyphWidget } from 'vs/workbench/parts/comments/electron-browser/commentGlyphWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { SimpleCommentEditor } from './simpleCommentEditor';
import URI from 'vs/base/common/uri';
import { transparent, editorForeground, textLinkActiveForeground, textLinkForeground, focusBorder, textBlockQuoteBackground, textBlockQuoteBorder, contrastBorder, inputValidationErrorBorder, inputValidationErrorBackground } from 'vs/platform/theme/common/colorRegistry';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ICommentService } from 'vs/workbench/parts/comments/electron-browser/commentService';
import { Range, IRange } from 'vs/editor/common/core/range';
import { IPosition } from 'vs/editor/common/core/position';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';
import { IMarginData } from 'vs/editor/browser/controller/mouseTarget';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';

export const COMMENTEDITOR_DECORATION_KEY = 'commenteditordecoration';
const EXPAND_ACTION_CLASS = 'expand-review-action octicon octicon-chevron-down';
const COLLAPSE_ACTION_CLASS = 'expand-review-action octicon octicon-chevron-up';
const COMMENT_SCHEME = 'comment';

export class CommentNode {
	private _domNode: HTMLElement;
	private _body: HTMLElement;
	private _md: HTMLElement;
	private _clearTimeout: any;

	public get domNode(): HTMLElement {
		return this._domNode;
	}

	constructor(
		public comment: modes.Comment,
		private markdownRenderer: MarkdownRenderer,
	) {
		this._domNode = $('div.review-comment').getHTMLElement();
		this._domNode.tabIndex = 0;
		let avatar = $('div.avatar-container').appendTo(this._domNode).getHTMLElement();
		let img = <HTMLImageElement>$('img.avatar').appendTo(avatar).getHTMLElement();
		img.src = comment.gravatar;
		let commentDetailsContainer = $('.review-comment-contents').appendTo(this._domNode).getHTMLElement();

		let header = $('div').appendTo(commentDetailsContainer).getHTMLElement();
		let author = $('strong.author').appendTo(header).getHTMLElement();
		author.innerText = comment.userName;
		this._body = $('div.comment-body').appendTo(commentDetailsContainer).getHTMLElement();
		this._md = this.markdownRenderer.render(comment.body).element;
		this._body.appendChild(this._md);

		this._domNode.setAttribute('aria-label', `${comment.userName}, ${comment.body.value}`);
		this._domNode.setAttribute('role', 'treeitem');
		this._clearTimeout = null;
	}

	update(newComment: modes.Comment) {
		if (newComment.body !== this.comment.body) {
			this._body.removeChild(this._md);
			this._md = this.markdownRenderer.render(newComment.body).element;
			this._body.appendChild(this._md);
		}

		this.comment = newComment;
	}

	focus() {
		this.domNode.focus();
		if (!this._clearTimeout) {
			dom.addClass(this.domNode, 'focus');
			this._clearTimeout = setTimeout(() => {
				dom.removeClass(this.domNode, 'focus');
			}, 3000);
		}
	}
}

let INMEM_MODEL_ID = 0;

export class ReviewZoneWidget extends ZoneWidget {
	private _headElement: HTMLElement;
	protected _headingLabel: HTMLElement;
	protected _actionbarWidget: ActionBar;
	private _bodyElement: HTMLElement;
	private _commentEditor: ICodeEditor;
	private _commentsElement: HTMLElement;
	private _commentElements: CommentNode[];
	private _commentForm: HTMLElement;
	private _reviewThreadReplyButton: HTMLElement;
	private _resizeObserver: any;
	private _onDidClose = new Emitter<ReviewZoneWidget>();
	private _onDidCreateThread = new Emitter<ReviewZoneWidget>();
	private _isCollapsed;
	private _toggleAction: Action;
	private _commentThread: modes.CommentThread;
	private _commentGlyph: CommentGlyphWidget;
	private _owner: number;
	private _localToDispose: IDisposable[];
	private _globalToDispose: IDisposable[];
	private _markdownRenderer: MarkdownRenderer;
	private _styleElement: HTMLStyleElement;
	private _error: HTMLElement;

	public get owner(): number {
		return this._owner;
	}
	public get commentThread(): modes.CommentThread {
		return this._commentThread;
	}

	constructor(
		private instantiationService: IInstantiationService,
		private modeService: IModeService,
		private modelService: IModelService,
		private themeService: IThemeService,
		private commentService: ICommentService,
		private openerService: IOpenerService,
		editor: ICodeEditor,
		owner: number,
		commentThread: modes.CommentThread,
		options: IOptions = {}
	) {
		super(editor, options);
		this._resizeObserver = null;
		this._owner = owner;
		this._commentThread = commentThread;
		this._isCollapsed = commentThread.collapsibleState !== modes.CommentThreadCollapsibleState.Expanded;
		this._globalToDispose = [];
		this._localToDispose = [];
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
	}

	public get onDidClose(): Event<ReviewZoneWidget> {
		return this._onDidClose.event;
	}

	public get onDidCreateThread(): Event<ReviewZoneWidget> {
		return this._onDidCreateThread.event;
	}

	protected revealLine(lineNumber: number) {
		// we don't do anything here as we always do the reveal ourselves.
	}

	public reveal(commentId?: string) {
		if (this._isCollapsed) {
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

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('review-widget');
		this._headElement = <HTMLDivElement>$('.head').getHTMLElement();
		container.appendChild(this._headElement);
		this._fillHead(this._headElement);

		this._bodyElement = <HTMLDivElement>$('.body').getHTMLElement();
		container.appendChild(this._bodyElement);
	}

	protected _fillHead(container: HTMLElement): void {
		var titleElement = $('.review-title').
			appendTo(this._headElement).
			getHTMLElement();

		this._headingLabel = $('span.filename').appendTo(titleElement).getHTMLElement();
		this.createThreadLabel();

		const actionsContainer = $('.review-actions').appendTo(this._headElement);
		this._actionbarWidget = new ActionBar(actionsContainer.getHTMLElement(), {});
		this._disposables.push(this._actionbarWidget);

		this._toggleAction = new Action('review.expand', nls.localize('label.collapse', "Collapse"), this._isCollapsed ? EXPAND_ACTION_CLASS : COLLAPSE_ACTION_CLASS, true, () => {
			if (this._isCollapsed) {
				this.show({ lineNumber: this._commentThread.range.startLineNumber, column: 1 }, 2);
				this._toggleAction.label = nls.localize('label.collapse', "Collapse");
			}
			else {
				if (this._commentThread.comments.length === 0) {
					this.dispose();
					return null;
				}
				this._isCollapsed = true;
				this.hide();
				this._toggleAction.label = nls.localize('label.expand', "Expand");
			}
			return null;
		});

		this._actionbarWidget.push(this._toggleAction, { label: false, icon: true });
	}

	toggleExpand() {
		this._toggleAction.run();
	}

	update(commentThread: modes.CommentThread) {
		const oldCommentsLen = this._commentElements.length;
		const newCommentsLen = commentThread.comments.length;

		let commentElementsToDel: CommentNode[] = [];
		let commentElementsToDelIndex: number[] = [];
		for (let i = 0; i < oldCommentsLen; i++) {
			let comment = this._commentElements[i].comment;
			let newComment = commentThread.comments.filter(c => c.commentId === comment.commentId);

			if (newComment.length) {
				this._commentElements[i].update(newComment[0]);
			} else {
				commentElementsToDelIndex.push(i);
				commentElementsToDel.push(this._commentElements[i]);
			}
		}

		// del removed elements
		for (let i = commentElementsToDel.length - 1; i >= 0; i--) {
			this._commentElements.splice(commentElementsToDelIndex[i]);
			this._commentsElement.removeChild(commentElementsToDel[i].domNode);
		}

		let lastCommentElement: HTMLElement = null;
		let newCommentNodeList: CommentNode[] = [];
		for (let i = newCommentsLen - 1; i >= 0; i--) {
			let currentComment = commentThread.comments[i];
			let oldCommentNode = this._commentElements.filter(commentNode => commentNode.comment.commentId === currentComment.commentId);
			if (oldCommentNode.length) {
				lastCommentElement = oldCommentNode[0].domNode;
				newCommentNodeList.unshift(oldCommentNode[0]);
			} else {
				let newElement = new CommentNode(currentComment, this._markdownRenderer);
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

		this._commentThread = commentThread;
		this._commentElements = newCommentNodeList;
		this.createThreadLabel();
	}

	protected _doLayout(heightInPixel: number, widthInPixel: number): void {
		this._commentEditor.layout({ height: (this._commentEditor.hasWidgetFocus() ? 5 : 1) * 18, width: widthInPixel - 42 /* margin */ });
	}

	display(lineNumber: number, commentsOptions: ModelDecorationOptions) {
		this._commentGlyph = new CommentGlyphWidget(this.editor, lineNumber, commentsOptions, () => {
			this.toggleExpand();
		});

		this._localToDispose.push(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
		this._localToDispose.push(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));
		var headHeight = Math.ceil(this.editor.getConfiguration().lineHeight * 1.2);
		this._headElement.style.height = `${headHeight}px`;
		this._headElement.style.lineHeight = this._headElement.style.height;

		this._commentsElement = $('div.comments-container').appendTo(this._bodyElement).getHTMLElement();
		this._commentsElement.setAttribute('role', 'presentation');

		this._commentElements = [];
		for (let i = 0; i < this._commentThread.comments.length; i++) {
			let newCommentNode = new CommentNode(this._commentThread.comments[i], this._markdownRenderer);
			this._commentElements.push(newCommentNode);
			this._commentsElement.appendChild(newCommentNode.domNode);
		}

		const hasExistingComments = this._commentThread.comments.length > 0;
		this._commentForm = $('.comment-form').appendTo(this._bodyElement).getHTMLElement();
		this._commentEditor = this.instantiationService.createInstance(SimpleCommentEditor, this._commentForm, SimpleCommentEditor.getEditorOptions());
		const modeId = hasExistingComments ? this._commentThread.threadId : ++INMEM_MODEL_ID;
		const resource = URI.parse(`${COMMENT_SCHEME}:commentinput-${modeId}.md`);
		const model = this.modelService.createModel('', this.modeService.getOrCreateModeByFilenameOrFirstLine(resource.path), resource, true);
		this._localToDispose.push(model);
		this._commentEditor.setModel(model);
		this._localToDispose.push(this._commentEditor);
		this._localToDispose.push(this._commentEditor.getModel().onDidChangeContent(() => this.setCommentEditorDecorations()));
		this.setCommentEditorDecorations();

		// Only add the additional step of clicking a reply button to expand the textarea when there are existing comments
		if (hasExistingComments) {
			this.createReplyButton();
		} else {
			if (!dom.hasClass(this._commentForm, 'expand')) {
				dom.addClass(this._commentForm, 'expand');
				this._commentEditor.focus();
			}
		}


		this._localToDispose.push(this._commentEditor.onKeyDown((ev: IKeyboardEvent) => {
			const hasExistingComments = this._commentThread.comments.length > 0;

			if (this._commentEditor.getModel().getValueLength() === 0 && ev.keyCode === KeyCode.Escape) {
				if (hasExistingComments) {
					if (dom.hasClass(this._commentForm, 'expand')) {
						dom.removeClass(this._commentForm, 'expand');
					}
				} else {
					this.dispose();
				}
			}

			if (this._commentEditor.getModel().getValueLength() !== 0 && ev.keyCode === KeyCode.Enter && (ev.ctrlKey || ev.metaKey)) {
				let lineNumber = this._commentGlyph.getPosition().position.lineNumber;
				this.createComment(lineNumber);
			}
		}));

		this._error = $('.validation-error.hidden').appendTo(this._commentForm).getHTMLElement();

		const formActions = $('.form-actions').appendTo(this._commentForm).getHTMLElement();

		const button = new Button(formActions);
		attachButtonStyler(button, this.themeService);
		button.label = 'Add comment';

		button.enabled = false;
		this._localToDispose.push(this._commentEditor.onDidChangeModelContent(_ => {
			if (this._commentEditor.getValue()) {
				button.enabled = true;
			} else {
				button.enabled = false;
			}
		}));

		button.onDidClick(async () => {
			let lineNumber = this._commentGlyph.getPosition().position.lineNumber;
			this.createComment(lineNumber);
		});

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
		if (this._commentThread.reply && !this._commentThread.comments.length) {
			this._commentEditor.focus();
		}
	}

	private async createComment(lineNumber: number): Promise<void> {
		try {
			let newCommentThread;
			const isReply = this._commentThread.threadId !== null;

			if (isReply) {
				newCommentThread = await this.commentService.replyToCommentThread(
					this._owner,
					this.editor.getModel().uri,
					new Range(lineNumber, 1, lineNumber, 1),
					this._commentThread,
					this._commentEditor.getValue()
				);
			} else {
				newCommentThread = await this.commentService.createNewCommentThread(
					this._owner,
					this.editor.getModel().uri,
					new Range(lineNumber, 1, lineNumber, 1),
					this._commentEditor.getValue()
				);

				if (newCommentThread) {
					this.createReplyButton();
				}
			}

			if (newCommentThread) {
				this._commentEditor.setValue('');
				if (dom.hasClass(this._commentForm, 'expand')) {
					dom.removeClass(this._commentForm, 'expand');
				}
				this._commentEditor.getDomNode().style.outline = '';
				this._error.textContent = '';
				dom.addClass(this._error, 'hidden');
				this.update(newCommentThread);

				if (!isReply) {
					this._onDidCreateThread.fire(this);
				}
			}
		} catch (e) {
			this._error.textContent = e.message
				? nls.localize('commentCreationError', "Adding a comment failed: {0}.", e.message)
				: nls.localize('commentCreationDefaultError', "Adding a comment failed. Please try again or report an issue with the extension if the problem persists.");
			this._commentEditor.getDomNode().style.outline = `1px solid ${this.themeService.getTheme().getColor(inputValidationErrorBorder)}`;
			dom.removeClass(this._error, 'hidden');
		}
	}

	private createThreadLabel() {
		let label: string;
		if (this._commentThread.comments.length) {
			const participantsList = this._commentThread.comments.filter(arrays.uniqueFilter(comment => comment.userName)).map(comment => `@${comment.userName}`).join(', ');
			label = nls.localize('commentThreadParticipants', "Participants: {0}", participantsList);
		} else {
			label = nls.localize('startThread', "Start discussion");
		}

		$(this._headingLabel).safeInnerHtml(label);
		this._headingLabel.setAttribute('aria-label', label);
	}

	private createReplyButton() {
		this._reviewThreadReplyButton = <HTMLButtonElement>$('button.review-thread-reply-button').appendTo(this._commentForm).getHTMLElement();
		this._reviewThreadReplyButton.title = nls.localize('reply', "Reply...");
		this._reviewThreadReplyButton.textContent = nls.localize('reply', "Reply...");
		// bind click/escape actions for reviewThreadReplyButton and textArea
		this._reviewThreadReplyButton.onclick = () => {
			if (!dom.hasClass(this._commentForm, 'expand')) {
				dom.addClass(this._commentForm, 'expand');
				this._commentEditor.focus();
			}
		};

		this._commentEditor.onDidBlurEditorWidget(() => {
			if (this._commentEditor.getModel().getValueLength() === 0 && dom.hasClass(this._commentForm, 'expand')) {
				dom.removeClass(this._commentForm, 'expand');
			}
		});
	}

	_refresh() {
		if (!this._isCollapsed && this._bodyElement) {
			let dimensions = dom.getClientArea(this._bodyElement);
			const headHeight = Math.ceil(this.editor.getConfiguration().lineHeight * 1.2);
			const lineHeight = this.editor.getConfiguration().lineHeight;
			const arrowHeight = Math.round(lineHeight / 3);
			const frameThickness = Math.round(lineHeight / 9) * 2;

			const computedLinesNumber = Math.ceil((headHeight + dimensions.height + arrowHeight + frameThickness) / lineHeight);
			this._relayout(computedLinesNumber);
		}
	}

	private setCommentEditorDecorations() {
		const model = this._commentEditor && this._commentEditor.getModel();
		if (model) {
			let valueLength = model.getValueLength();
			const hasExistingComments = this._commentThread.comments.length > 0;
			let placeholder = valueLength > 0
				? ''
				: (hasExistingComments
					? nls.localize('replytoCommentThread', "Reply... (press Ctrl+Enter to submit)")
					: nls.localize('createCommentThread', "Type a new comment (press Ctrl+Enter to submit)"));
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
						color: transparent(editorForeground, 0.4)(this.themeService.getTheme()).toString()
					}
				}
			}];

			this._commentEditor.setDecorations(COMMENTEDITOR_DECORATION_KEY, decorations);
		}
	}

	private mouseDownInfo: { lineNumber: number };

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

		if (this._commentGlyph && this._commentGlyph.getPosition().position.lineNumber !== lineNumber) {
			return;
		}

		if (e.target.element.className.indexOf('comment-thread') >= 0) {
			if (this._isCollapsed) {
				this.show({ lineNumber: lineNumber, column: 1 }, 2);
			} else {
				this.hide();
				if (this._commentThread === null) {
					this.dispose();
				}
			}
		}
	}

	private _applyTheme(theme: ITheme) {
		let borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor
		});

		const content: string[] = [];
		const linkColor = theme.getColor(textLinkForeground);
		if (linkColor) {
			content.push(`.monaco-editor .review-widget .body .review-comment a { color: ${linkColor} }`);
		}

		const linkActiveColor = theme.getColor(textLinkActiveForeground);
		if (linkActiveColor) {
			content.push(`.monaco-editor .review-widget .body .review-comment a:hover, a:active { color: ${linkActiveColor} }`);
		}

		const focusColor = theme.getColor(focusBorder);
		if (focusColor) {
			content.push(`.monaco-editor .review-widget .body .review-comment a:focus { outline: 1px solid ${focusColor}; }`);
			content.push(`.monaco-editor .review-widget .body .comment-form .monaco-editor.focused { outline: 1px solid ${focusColor}; }`);
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
			content.push(`.monaco-editor .review-widget .body .comment-form .monaco-editor { outline: 1px solid ${hcBorder}; }`);
		}

		const errorBorder = theme.getColor(inputValidationErrorBorder);
		if (errorBorder) {
			content.push(`.monaco-editor .review-widget .body .comment-form .validation-error { border: 1px solid ${errorBorder}; }`);
		}

		const errorBackground = theme.getColor(inputValidationErrorBackground);
		if (errorBackground) {
			content.push(`.monaco-editor .review-widget .body .comment-form .validation-error { background: ${errorBackground}; }`);
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
		this._isCollapsed = false;
		super.show(rangeOrPos, heightInLines);
		this._refresh();
	}

	hide() {
		this._isCollapsed = true;
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
			this._commentGlyph = null;
		}

		this._globalToDispose.forEach(global => global.dispose());
		this._localToDispose.forEach(local => local.dispose());
		this._onDidClose.fire();
	}
}