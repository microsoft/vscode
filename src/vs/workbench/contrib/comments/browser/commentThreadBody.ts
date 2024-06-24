/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import * as nls from 'vs/nls';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import * as languages from 'vs/editor/common/languages';
import { Emitter } from 'vs/base/common/event';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { CommentNode } from 'vs/workbench/contrib/comments/browser/commentNode';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { ICommentThreadWidget } from 'vs/workbench/contrib/comments/common/commentThreadWidget';
import { IMarkdownRendererOptions, MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { IRange } from 'vs/editor/common/core/range';
import { LayoutableEditor } from 'vs/workbench/contrib/comments/browser/simpleCommentEditor';

export class CommentThreadBody<T extends IRange | ICellRange = IRange> extends Disposable {
	private _commentsElement!: HTMLElement;
	private _commentElements: CommentNode<T>[] = [];
	private _resizeObserver: any;
	private _focusedComment: number | undefined = undefined;
	private _onDidResize = new Emitter<dom.Dimension>();
	onDidResize = this._onDidResize.event;

	private _commentDisposable = new Map<CommentNode<T>, IDisposable>();
	private _markdownRenderer: MarkdownRenderer;

	get length() {
		return this._commentThread.comments ? this._commentThread.comments.length : 0;
	}

	get activeComment() {
		return this._commentElements.filter(node => node.isEditing)[0];
	}


	constructor(
		private readonly _parentEditor: LayoutableEditor,
		readonly owner: string,
		readonly parentResourceUri: URI,
		readonly container: HTMLElement,
		private _options: IMarkdownRendererOptions,
		private _commentThread: languages.CommentThread<T>,
		private _pendingEdits: { [key: number]: string } | undefined,
		private _scopedInstatiationService: IInstantiationService,
		private _parentCommentThreadWidget: ICommentThreadWidget,
		@ICommentService private commentService: ICommentService,
		@IOpenerService private openerService: IOpenerService,
		@ILanguageService private languageService: ILanguageService,
	) {
		super();

		this._register(dom.addDisposableListener(container, dom.EventType.FOCUS_IN, e => {
			// TODO @rebornix, limit T to IRange | ICellRange
			this.commentService.setActiveEditingCommentThread(this._commentThread);
		}));

		this._markdownRenderer = this._register(new MarkdownRenderer(this._options, this.languageService, this.openerService));
	}

	focus() {
		this._commentsElement.focus();
	}

	async display() {
		this._commentsElement = dom.append(this.container, dom.$('div.comments-container'));
		this._commentsElement.setAttribute('role', 'presentation');
		this._commentsElement.tabIndex = 0;
		this._updateAriaLabel();

		this._register(dom.addDisposableListener(this._commentsElement, dom.EventType.KEY_DOWN, (e) => {
			const event = new StandardKeyboardEvent(e as KeyboardEvent);
			if ((event.equals(KeyCode.UpArrow) || event.equals(KeyCode.DownArrow)) && (!this._focusedComment || !this._commentElements[this._focusedComment].isEditing)) {
				const moveFocusWithinBounds = (change: number): number => {
					if (this._focusedComment === undefined && change >= 0) { return 0; }
					if (this._focusedComment === undefined && change < 0) { return this._commentElements.length - 1; }
					const newIndex = this._focusedComment! + change;
					return Math.min(Math.max(0, newIndex), this._commentElements.length - 1);
				};

				this._setFocusedComment(event.equals(KeyCode.UpArrow) ? moveFocusWithinBounds(-1) : moveFocusWithinBounds(1));
			}
		}));

		this._commentElements = [];
		if (this._commentThread.comments) {
			for (const comment of this._commentThread.comments) {
				const newCommentNode = this.createNewCommentNode(comment);

				this._commentElements.push(newCommentNode);
				this._commentsElement.appendChild(newCommentNode.domNode);
				if (comment.mode === languages.CommentMode.Editing) {
					await newCommentNode.switchToEditMode();
				}
			}
		}

		this._resizeObserver = new MutationObserver(this._refresh.bind(this));

		this._resizeObserver.observe(this.container, {
			attributes: true,
			childList: true,
			characterData: true,
			subtree: true
		});
	}

	private _refresh() {
		const dimensions = dom.getClientArea(this.container);
		this._onDidResize.fire(dimensions);
	}

	getDimensions() {
		return dom.getClientArea(this.container);
	}

	layout(widthInPixel?: number) {
		this._commentElements.forEach(element => {
			element.layout(widthInPixel);
		});
	}

	getPendingEdits(): { [key: number]: string } {
		const pendingEdits: { [key: number]: string } = {};
		this._commentElements.forEach(element => {
			if (element.isEditing) {
				const pendingEdit = element.getPendingEdit();
				if (pendingEdit) {
					pendingEdits[element.comment.uniqueIdInThread] = pendingEdit;
				}
			}
		});

		return pendingEdits;
	}

	getCommentCoords(commentUniqueId: number): { thread: dom.IDomNodePagePosition; comment: dom.IDomNodePagePosition } | undefined {
		const matchedNode = this._commentElements.filter(commentNode => commentNode.comment.uniqueIdInThread === commentUniqueId);
		if (matchedNode && matchedNode.length) {
			const commentThreadCoords = dom.getDomNodePagePosition(this._commentElements[0].domNode);
			const commentCoords = dom.getDomNodePagePosition(matchedNode[0].domNode);
			return {
				thread: commentThreadCoords,
				comment: commentCoords
			};
		}

		return;
	}

	async updateCommentThread(commentThread: languages.CommentThread<T>, preserveFocus: boolean) {
		const oldCommentsLen = this._commentElements.length;
		const newCommentsLen = commentThread.comments ? commentThread.comments.length : 0;

		const commentElementsToDel: CommentNode<T>[] = [];
		const commentElementsToDelIndex: number[] = [];
		for (let i = 0; i < oldCommentsLen; i++) {
			const comment = this._commentElements[i].comment;
			const newComment = commentThread.comments ? commentThread.comments.filter(c => c.uniqueIdInThread === comment.uniqueIdInThread) : [];

			if (newComment.length) {
				this._commentElements[i].update(newComment[0]);
			} else {
				commentElementsToDelIndex.push(i);
				commentElementsToDel.push(this._commentElements[i]);
			}
		}

		// del removed elements
		for (let i = commentElementsToDel.length - 1; i >= 0; i--) {
			const commentToDelete = commentElementsToDel[i];
			this._commentDisposable.get(commentToDelete)?.dispose();
			this._commentDisposable.delete(commentToDelete);

			this._commentElements.splice(commentElementsToDelIndex[i], 1);
			commentToDelete.domNode.remove();
		}


		let lastCommentElement: HTMLElement | null = null;
		const newCommentNodeList: CommentNode<T>[] = [];
		const newCommentsInEditMode: CommentNode<T>[] = [];
		for (let i = newCommentsLen - 1; i >= 0; i--) {
			const currentComment = commentThread.comments![i];
			const oldCommentNode = this._commentElements.filter(commentNode => commentNode.comment.uniqueIdInThread === currentComment.uniqueIdInThread);
			if (oldCommentNode.length) {
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

				if (currentComment.mode === languages.CommentMode.Editing) {
					await newElement.switchToEditMode();
					newCommentsInEditMode.push(newElement);
				}
			}
		}

		this._commentThread = commentThread;
		this._commentElements = newCommentNodeList;

		if (newCommentsInEditMode.length) {
			const lastIndex = this._commentElements.indexOf(newCommentsInEditMode[newCommentsInEditMode.length - 1]);
			this._focusedComment = lastIndex;
		}

		this._updateAriaLabel();
		if (!preserveFocus) {
			this._setFocusedComment(this._focusedComment);
		}
	}

	private _updateAriaLabel() {
		if (this._commentThread.isDocumentCommentThread()) {
			if (this._commentThread.range) {
				this._commentsElement.ariaLabel = nls.localize('commentThreadAria.withRange', "Comment thread with {0} comments on lines {1} through {2}. {3}.",
					this._commentThread.comments?.length, this._commentThread.range.startLineNumber, this._commentThread.range.endLineNumber,
					this._commentThread.label);
			} else {
				this._commentsElement.ariaLabel = nls.localize('commentThreadAria.document', "Comment thread with {0} comments on the entire document. {1}.",
					this._commentThread.comments?.length, this._commentThread.label);
			}
		} else {
			this._commentsElement.ariaLabel = nls.localize('commentThreadAria', "Comment thread with {0} comments. {1}.",
				this._commentThread.comments?.length, this._commentThread.label);
		}
	}

	private _setFocusedComment(value: number | undefined) {
		if (this._focusedComment !== undefined) {
			this._commentElements[this._focusedComment]?.setFocus(false);
		}

		if (this._commentElements.length === 0 || value === undefined) {
			this._focusedComment = undefined;
		} else {
			this._focusedComment = Math.min(value, this._commentElements.length - 1);
			this._commentElements[this._focusedComment].setFocus(true);
		}
	}

	private createNewCommentNode(comment: languages.Comment): CommentNode<T> {
		const newCommentNode = this._scopedInstatiationService.createInstance(CommentNode,
			this._parentEditor,
			this._commentThread,
			comment,
			this._pendingEdits ? this._pendingEdits[comment.uniqueIdInThread] : undefined,
			this.owner,
			this.parentResourceUri,
			this._parentCommentThreadWidget,
			this._markdownRenderer) as unknown as CommentNode<T>;

		this._register(newCommentNode);
		this._commentDisposable.set(newCommentNode, newCommentNode.onDidClick(clickedNode =>
			this._setFocusedComment(this._commentElements.findIndex(commentNode => commentNode.comment.uniqueIdInThread === clickedNode.comment.uniqueIdInThread))
		));

		return newCommentNode;
	}

	public override dispose(): void {
		super.dispose();

		if (this._resizeObserver) {
			this._resizeObserver.disconnect();
			this._resizeObserver = null;
		}

		this._commentDisposable.forEach(v => v.dispose());
	}
}
