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
import { ICommandService } from 'vs/platform/commands/common/commands';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { renderMarkdown } from 'vs/base/browser/htmlContentRenderer';
import { CommentGlyphWidget } from 'vs/workbench/parts/comments/electron-browser/commentGlyphWidget';

const EXPAND_ACTION_CLASS = 'expand-review-action octicon octicon-chevron-down';
const COLLAPSE_ACTION_CLASS = 'expand-review-action octicon octicon-chevron-up';

declare var ResizeObserver: any;
export class CommentNode {
	private _domNode: HTMLElement;
	private _body: HTMLElement;
	private _md: HTMLElement;
	public get domNode(): HTMLElement {
		return this._domNode;
	}
	constructor(public comment: modes.Comment, ) {
		this._domNode = $('div.review-comment').getHTMLElement();
		let avatar = $('div.avatar-container').appendTo(this._domNode).getHTMLElement();
		let img = <HTMLImageElement>$('img.avatar').appendTo(avatar).getHTMLElement();
		img.src = comment.gravatar;
		let commentDetailsContainer = $('.review-comment-contents').appendTo(this._domNode).getHTMLElement();

		let header = $('div').appendTo(commentDetailsContainer).getHTMLElement();
		let author = $('strong.author').appendTo(header).getHTMLElement();
		author.innerText = comment.userName;
		this._body = $('comment-body').appendTo(commentDetailsContainer).getHTMLElement();
		this._md = renderMarkdown(comment.body);
		this._body.appendChild(this._md);
	}

	update(newComment: modes.Comment) {
		if (newComment.body !== this.comment.body) {
			this._body.removeChild(this._md);
			this._md = renderMarkdown(newComment.body);
			this._body.appendChild(this._md);
		}

		this.comment = newComment;
	}
}

export class ReviewZoneWidget extends ZoneWidget {
	private _headElement: HTMLElement;
	protected _primaryHeading: HTMLElement;
	protected _secondaryHeading: HTMLElement;
	protected _metaHeading: HTMLElement;
	protected _actionbarWidget: ActionBar;
	private _bodyElement: HTMLElement;
	private _textArea: HTMLTextAreaElement;
	private _commentsElement: HTMLElement;
	private _commentElements: CommentNode[];
	private _resizeObserver: any;
	private _onDidClose = new Emitter<ReviewZoneWidget>();
	private _isCollapsed;
	private _toggleAction: Action;
	private _commentThread: modes.CommentThread;
	public get commentThread(): modes.CommentThread {
		return this._commentThread;
	}
	private _replyCommand: modes.Command;
	private _owner: number;
	public get owner(): number {
		return this._owner;
	}

	private _decorationIDs: string[];
	private _localToDispose: IDisposable[];

	constructor(
		editor: ICodeEditor,
		owner: number,
		commentThread: modes.CommentThread,
		replyCommand: modes.Command,
		options: IOptions = {},
		private readonly themeService: IThemeService,
		private readonly commandService: ICommandService
	) {
		super(editor, options);
		this._resizeObserver = null;
		this._owner = owner;
		this._commentThread = commentThread;
		this._replyCommand = replyCommand;
		this._isCollapsed = commentThread.collapsibleState !== modes.CommentThreadCollapsibleState.Expanded;
		this._decorationIDs = [];
		this._localToDispose = [];
		this.create();
		this.themeService.onThemeChange(this._applyTheme, this);
	}

	public get onDidClose(): Event<ReviewZoneWidget> {
		return this._onDidClose.event;
	}

	public reveal() {
		if (this._isCollapsed) {
			this._isCollapsed = false;

			if (this._decorationIDs && this._decorationIDs.length) {
				let range = this.editor.getModel().getDecorationRange(this._decorationIDs[0]);
				this.show(range, 2);
			} else {
				this.show({ lineNumber: this._commentThread.range.startLineNumber, column: 1 }, 2);
			}
		}
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

		this._primaryHeading = $('span.filename').appendTo(titleElement).getHTMLElement();
		this._secondaryHeading = $('span.dirname').appendTo(titleElement).getHTMLElement();
		this._metaHeading = $('span.meta').appendTo(titleElement).getHTMLElement();

		let primaryHeading = 'Reviewers:';
		$(this._primaryHeading).safeInnerHtml(primaryHeading);
		this._primaryHeading.setAttribute('aria-label', primaryHeading);

		let secondaryHeading = this._commentThread.comments.filter(arrays.uniqueFilter(comment => comment.userName)).map(comment => `@${comment.userName}`).join(', ');
		$(this._secondaryHeading).safeInnerHtml(secondaryHeading);

		const actionsContainer = $('.review-actions').appendTo(this._headElement);
		this._actionbarWidget = new ActionBar(actionsContainer.getHTMLElement(), {});
		this._disposables.push(this._actionbarWidget);

		this._toggleAction = new Action('review.expand', nls.localize('label.expand', "Expand"), this._isCollapsed ? EXPAND_ACTION_CLASS : COLLAPSE_ACTION_CLASS, true, () => {
			if (this._isCollapsed) {
				this._isCollapsed = false;
				this.show({ lineNumber: this._commentThread.range.startLineNumber, column: 1 }, 2);
			}
			else {
				this._isCollapsed = true;
				this.hide();
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

		if (this._commentElements.length === 0) {
			this._commentThread = commentThread;
			commentThread.comments.forEach(comment => {
				let newElement = new CommentNode(comment);
				this._commentElements.push(newElement);
				this._commentsElement.appendChild(newElement.domNode);
			});
			return;
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
				let newElement = new CommentNode(currentComment);
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
	}

	display(lineNumber: number) {
		const commentWidget = new CommentGlyphWidget(`review_${lineNumber}`, this.editor, lineNumber, () => {
			this.toggleExpand();
		});
		this.editor.layoutContentWidget(commentWidget);

		this._localToDispose.push(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
		this._localToDispose.push(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));

		var headHeight = Math.ceil(this.editor.getConfiguration().lineHeight * 1.2);
		this._headElement.style.height = `${headHeight}px`;
		this._headElement.style.lineHeight = this._headElement.style.height;

		this._commentsElement = $('div.comments-container').appendTo(this._bodyElement).getHTMLElement();
		this._commentElements = [];
		for (let i = 0; i < this._commentThread.comments.length; i++) {
			let newCommentNode = new CommentNode(this._commentThread.comments[i]);
			this._commentElements.push(newCommentNode);
			this._commentsElement.appendChild(newCommentNode.domNode);
		}

		if (this._commentThread.reply) {
			const commentForm = $('.comment-form').appendTo(this._bodyElement).getHTMLElement();
			this._textArea = <HTMLTextAreaElement>$('textarea').appendTo(commentForm).getHTMLElement();
			const hasExistingComments = this._commentThread.comments.length > 0;
			this._textArea.placeholder = hasExistingComments ? 'Reply...' : 'Type a new comment';

			// Only add the additional step of clicking a reply button to expand the textarea when there are existing comments
			if (hasExistingComments) {
				const reviewThreadReplyButton = <HTMLButtonElement>$('button.review-thread-reply-button').appendTo(commentForm).getHTMLElement();
				reviewThreadReplyButton.title = 'Reply...';
				reviewThreadReplyButton.textContent = 'Reply...';
				// bind click/escape actions for reviewThreadReplyButton and textArea
				reviewThreadReplyButton.onclick = () => {
					if (!dom.hasClass(commentForm, 'expand')) {
						dom.addClass(commentForm, 'expand');
						this._textArea.focus();
					}
				};

				dom.addDisposableListener(this._textArea, 'blur', () => {
					if (this._textArea.value === '' && dom.hasClass(commentForm, 'expand')) {
						dom.removeClass(commentForm, 'expand');
					}
				});
			} else {
				dom.addClass(commentForm, 'expand');
			}

			dom.addDisposableListener(this._textArea, 'keydown', (ev: KeyboardEvent) => {
				if (this._textArea.value === '' && ev.keyCode === 27) {
					if (dom.hasClass(commentForm, 'expand')) {
						dom.removeClass(commentForm, 'expand');
					}
				}
			});

			const formActions = $('.form-actions').appendTo(commentForm).getHTMLElement();

			const button = new Button(formActions);
			attachButtonStyler(button, this.themeService);
			button.label = this.commentThread.reply.title;
			button.onDidClick(async () => {
				let newComment = await this.commandService.executeCommand(this._replyCommand.id, this.editor.getModel().uri, {
					start: { line: lineNumber, column: 1 },
					end: { line: lineNumber, column: 1 }
				}, this._commentThread, this._textArea.value);
				if (newComment) {
					this._textArea.value = '';
					this._commentThread.comments.push(newComment);
					let newCommentNode = new CommentNode(newComment);
					this._commentElements.push(newCommentNode);
					this._commentsElement.appendChild(newCommentNode.domNode);
					let secondaryHeading = this._commentThread.comments.filter(arrays.uniqueFilter(comment => comment.userName)).map(comment => `@${comment.userName}`).join(', ');
					$(this._secondaryHeading).safeInnerHtml(secondaryHeading);
				}
			});
		}

		this._resizeObserver = new ResizeObserver(entries => {
			if (entries[0].target === this._bodyElement && !this._isCollapsed) {
				const lineHeight = this.editor.getConfiguration().lineHeight;
				const arrowHeight = Math.round(lineHeight / 3);
				const computedLinesNumber = Math.ceil((headHeight + entries[0].contentRect.height + arrowHeight) / lineHeight);
				this._relayout(computedLinesNumber);
			}
		});

		this._resizeObserver.observe(this._bodyElement);

		if (this._commentThread.collapsibleState === modes.CommentThreadCollapsibleState.Expanded) {
			this.show({ lineNumber: lineNumber, column: 1 }, 2);
		}

		// If there are no existing comments, place focus on the text area. This must be done after show, which also moves focus.
		if (this._commentThread.reply && !this._commentThread.comments.length) {
			this._textArea.focus();
		}
	}

	private mouseDownInfo: { lineNumber: number, iconClicked: boolean };

	private onEditorMouseDown(e: IEditorMouseEvent): void {
		if (!e.event.leftButton) {
			return;
		}

		let range = e.target.range;
		if (!range) {
			return;
		}

		let iconClicked = false;
		switch (e.target.type) {
			case MouseTargetType.GUTTER_GLYPH_MARGIN:
				iconClicked = true;
				break;
			default:
				return;
		}

		this.mouseDownInfo = { lineNumber: range.startLineNumber, iconClicked };
	}

	private onEditorMouseUp(e: IEditorMouseEvent): void {
		if (!this.mouseDownInfo) {
			return;
		}
		let lineNumber = this.mouseDownInfo.lineNumber;
		let iconClicked = this.mouseDownInfo.iconClicked;

		let range = e.target.range;
		if (!range || range.startLineNumber !== lineNumber) {
			return;
		}

		if (this.position && this.position.lineNumber !== lineNumber) {
			return;
		}

		if (!this.position && lineNumber !== this._commentThread.range.startLineNumber) {
			return;
		}

		if (iconClicked) {
			if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN) {
				return;
			}
		}

		if (this._isCollapsed) {
			this._isCollapsed = !this._isCollapsed;
			this.show({ lineNumber: lineNumber, column: 1 }, 2);
		} else {
			this._isCollapsed = !this._isCollapsed;
			this.hide();
		}
	}

	private _applyTheme(theme: ITheme) {
		let borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor
		});
	}

	dispose() {
		super.dispose();
		if (this._resizeObserver) {
			this._resizeObserver.disconnect();
			this._resizeObserver = null;
		}
		this.editor.changeDecorations(accessor => {
			accessor.deltaDecorations(this._decorationIDs, []);
		});
		this._localToDispose.forEach(local => local.dispose());
		this._onDidClose.fire();
	}
}