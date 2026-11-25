/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import * as languages from '../../../../editor/common/languages.js';
import { Emitter } from '../../../../base/common/event.js';
import { ICommentService } from './commentService.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { CommentNode } from './commentNode.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommentThreadWidget } from '../common/commentThreadWidget.js';
import { IMarkdownRendererExtraOptions } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { ICellRange } from '../../notebook/common/notebookRange.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { LayoutableEditor } from './simpleCommentEditor.js';

export class CommentThreadBody<T extends IRange | ICellRange = IRange> extends Disposable {
	private _commentsElement!: HTMLElement;
	private _commentElements: CommentNode<T>[] = [];
	private _resizeObserver: MutationObserver | null = null;
	private _focusedComment: number | undefined = undefined;
	private _onDidResize = this._register(new Emitter<dom.Dimension>());
	onDidResize = this._onDidResize.event;
	private readonly _onDidChangeCommentsSize = this._register(new Emitter<void>());
	/** Fires when scrollable comments change size. */
	readonly onDidChangeCommentsSize = this._onDidChangeCommentsSize.event;
	private _commentsScrollable: DomScrollableElement | undefined;
	private _naturalWidth: number | undefined;

	private _commentDisposable = new DisposableMap<CommentNode<T>, DisposableStore>();

	get length() {
		return this._commentThread.comments ? this._commentThread.comments.length : 0;
	}

	get activeComment() {
		return this._commentElements.filter(node => node.isEditing)[0];
	}

	/**
	 * Measures the width at which the comments don't wrap. Comments that are being edited take the width of their editor.
	 */
	measureNaturalWidth(): number {
		if (this._naturalWidth === undefined) {
			// Measure a hidden copy, because unwrapping the comments themselves would shorten them, which resets the
			// scroll positions of the comments and of the scrolling parts within them.
			const copy = this._commentsElement.cloneNode(true);
			if (!dom.isHTMLElement(copy)) {
				return 0;
			}
			copy.setAttribute('aria-hidden', 'true');
			copy.style.position = 'absolute';
			copy.style.visibility = 'hidden';
			copy.style.width = 'max-content';
			this.container.appendChild(copy);
			const naturalWidth = copy.offsetWidth;
			copy.remove();
			if (naturalWidth === 0) {
				// The comments aren't rendered, such as while the editor is hidden.
				return 0;
			}
			this._naturalWidth = naturalWidth;
		}
		return this._naturalWidth;
	}

	/**
	 * Measures the height of the comments, and the height of the rest of the body, which holds the reply and the
	 * thread's additional actions. Both are the heights the content needs, even when the body is too short to show it.
	 */
	measureHeights(): { comments: number; besideComments: number } {
		const commentsViewport = this._commentsScrollable?.getDomNode() ?? this._commentsElement;
		const frame = this.container.offsetHeight - this.container.clientHeight;
		return {
			comments: this._commentsElement.offsetHeight,
			besideComments: this.container.scrollHeight + frame - commentsViewport.offsetHeight
		};
	}

	/**
	 * Sets the height within which scrollable comments scroll.
	 */
	layoutCommentsHeight(height: number): void {
		if (this._commentsScrollable) {
			this._commentsScrollable.getDomNode().style.height = `${height}px`;
		}
	}

	/**
	 * Scrolls scrollable comments to the given comment.
	 */
	revealComment(commentUniqueId: number): void {
		const coords = this.getCommentCoords(commentUniqueId);
		if (coords && this._commentsScrollable) {
			// The comments may have just been shown or resized, before their resize observer updated the scroll range.
			this._commentsScrollable.scanDomNode();
			this._commentsScrollable.setScrollPosition({ scrollTop: coords.comment.top - coords.thread.top });
		}
	}

	constructor(
		private readonly _parentEditor: LayoutableEditor,
		readonly owner: string,
		readonly parentResourceUri: URI,
		readonly container: HTMLElement,
		private _markdownRendererOptions: IMarkdownRendererExtraOptions,
		private _commentThread: languages.CommentThread<T>,
		private _pendingEdits: { [key: number]: languages.PendingComment } | undefined,
		private _scopedInstatiationService: IInstantiationService,
		private _parentCommentThreadWidget: ICommentThreadWidget,
		private readonly _scrollableComments: boolean,
		@ICommentService private readonly commentService: ICommentService,
	) {
		super();

		this._register(dom.addDisposableListener(container, dom.EventType.FOCUS_IN, e => {
			// TODO @rebornix, limit T to IRange | ICellRange
			this.commentService.setActiveEditingCommentThread(this._commentThread);
		}));
	}

	focus(commentUniqueId?: number) {
		if (commentUniqueId !== undefined) {
			const comment = this._commentElements.find(commentNode => commentNode.comment.uniqueIdInThread === commentUniqueId);
			if (comment) {
				comment.focus();
				return;
			}
		}
		this._commentsElement.focus();
	}

	hasCommentsInEditMode() {
		return this._commentElements.some(commentNode => commentNode.isEditing);
	}

	ensureFocusIntoNewEditingComment() {
		if (this._commentElements.length === 1 && this._commentElements[0].isEditing) {
			this._commentElements[0].setFocus(true);
		}
	}

	async display() {
		this._commentsElement = dom.$('div.comments-container');
		if (this._scrollableComments) {
			this._createCommentsScrollable();
		} else {
			this.container.appendChild(this._commentsElement);
		}
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

		this._commentDisposable.clearAndDisposeAll();
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

	/**
	 * Lets the comments scroll within the height set by {@link layoutCommentsHeight}, so that the reply and the
	 * thread's additional actions below them stay in view.
	 */
	private _createCommentsScrollable(): void {
		const viewport = dom.$('.comments-scroll-viewport');
		viewport.appendChild(this._commentsElement);
		const scrollable = this._commentsScrollable = this._register(new DomScrollableElement(viewport, {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Hidden
		}));
		this.container.appendChild(scrollable.getDomNode());
		// Focusing a comment that is scrolled out of view scrolls the viewport natively.
		this._register(dom.addDisposableListener(viewport, dom.EventType.SCROLL, () => scrollable.scanDomNode()));

		let commentsWidth: number | undefined;
		const resizeObserver = this._register(new dom.DisposableResizeObserver('commentThreadBody', entries => {
			const commentsEntry = entries.find(entry => entry.target === this._commentsElement);
			if (commentsEntry) {
				if (commentsEntry.contentRect.width === commentsWidth) {
					// The comments changed, rather than wrapped at a new width.
					this._naturalWidth = undefined;
				}
				commentsWidth = commentsEntry.contentRect.width;
				// Comments only update their own scrollbars when they are laid out.
				this.layout();
			}
			scrollable.scanDomNode();
			if (commentsEntry) {
				this._onDidChangeCommentsSize.fire();
			}
		}, dom.getWindow(this.container)));
		this._register(resizeObserver.observe(this._commentsElement));
		this._register(resizeObserver.observe(scrollable.getDomNode()));
	}

	private _containerClientArea: dom.Dimension | undefined = undefined;
	private _refresh() {
		const dimensions = dom.getClientArea(this.container);
		if ((dimensions.height === 0 && dimensions.width === 0) || (dom.Dimension.equals(this._containerClientArea, dimensions))) {
			return;
		}
		this._containerClientArea = dimensions;
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

	getPendingEdits(): { [key: number]: languages.PendingComment } {
		const pendingEdits: { [key: number]: languages.PendingComment } = {};
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
			this._commentDisposable.deleteAndDispose(commentToDelete);

			this._commentElements.splice(commentElementsToDelIndex[i], 1);
			commentToDelete.domNode.remove();
		}


		let lastCommentElement: HTMLElement | null = null;
		const newCommentNodeList: CommentNode<T>[] = [];
		const newCommentsInEditMode: CommentNode<T>[] = [];
		const startEditing: Promise<void>[] = [];

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
					startEditing.push(newElement.switchToEditMode());
					newCommentsInEditMode.push(newElement);
				}
			}
		}

		this._commentThread = commentThread;
		this._commentElements = newCommentNodeList;
		this._naturalWidth = undefined;
		// Start editing *after* updating the thread and elements to avoid a sequencing issue https://github.com/microsoft/vscode/issues/239191
		await Promise.all(startEditing);

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
			this._markdownRendererOptions) as unknown as CommentNode<T>;

		const disposables: DisposableStore = new DisposableStore();
		disposables.add(newCommentNode.onDidClick(clickedNode =>
			this._setFocusedComment(this._commentElements.findIndex(commentNode => commentNode.comment.uniqueIdInThread === clickedNode.comment.uniqueIdInThread))
		));
		disposables.add(newCommentNode);
		this._commentDisposable.set(newCommentNode, disposables);

		return newCommentNode;
	}

	public override dispose(): void {
		super.dispose();

		if (this._resizeObserver) {
			this._resizeObserver.disconnect();
			this._resizeObserver = null;
		}

		this._commentDisposable.dispose();
	}
}
