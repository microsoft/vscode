/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import * as languages from 'vs/editor/common/languages';
import { IMarkdownRendererOptions } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CommentMenus } from 'vs/workbench/contrib/comments/browser/commentMenus';
import { CommentReply } from 'vs/workbench/contrib/comments/browser/commentReply';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { CommentThreadBody } from 'vs/workbench/contrib/comments/browser/commentThreadBody';
import { CommentThreadHeader } from 'vs/workbench/contrib/comments/browser/commentThreadHeader';
import { CommentContextKeys } from 'vs/workbench/contrib/comments/common/commentContextKeys';
import { CommentNode } from 'vs/workbench/contrib/comments/common/commentModel';
import { ICommentThreadWidget } from 'vs/workbench/contrib/comments/common/commentThreadWidget';

export class CommentThreadWidget extends Disposable implements ICommentThreadWidget {
	private _header!: CommentThreadHeader;
	private _body!: CommentThreadBody;
	private _commentReply?: CommentReply;
	private _commentMenus: CommentMenus;
	private _commentThreadDisposables: IDisposable[] = [];
	private _threadIsEmpty: IContextKey<boolean>;
	private _onDidResize = new Emitter<dom.Dimension>();
	onDidResize = this._onDidResize.event;


	constructor(
		container: HTMLElement,
		private _owner: string,
		private _parentResourceUri: URI,
		private _contextKeyService: IContextKeyService,
		private _scopedInstatiationService: IInstantiationService,
		private _commentThread: languages.CommentThread,
		private _pendingComment: string | null,
		private _markdownOptions: IMarkdownRendererOptions,
		private _commentOptions: languages.CommentOptions | undefined,
		private _containerDelegate: {
			actionRunner: (() => void) | null;
			collapse: () => void;
		},
		@ICommentService private commentService: ICommentService
	) {
		super();

		this._threadIsEmpty = CommentContextKeys.commentThreadIsEmpty.bindTo(this._contextKeyService);
		this._threadIsEmpty.set(!_commentThread.comments || !_commentThread.comments.length);

		this._commentMenus = this.commentService.getCommentMenus(this._owner);

		this._header = new CommentThreadHeader(
			container,
			{
				collapse: this.collapse.bind(this)
			},
			this._commentMenus,
			this._commentThread,
			this._contextKeyService,
			this._scopedInstatiationService
		);

		const bodyElement = <HTMLDivElement>dom.$('.body');
		container.appendChild(bodyElement);

		this._body = this._scopedInstatiationService.createInstance(
			CommentThreadBody,
			this._owner,
			this._parentResourceUri,
			bodyElement,
			this._markdownOptions,
			this._commentThread,
			this._scopedInstatiationService,
			this
		);
	}

	updateCommentThread(commentThread: languages.CommentThread) {
		if (this._commentThread !== commentThread) {
			this._commentThreadDisposables.forEach(disposable => disposable.dispose());
		}

		this._commentThread = commentThread;
		this._commentThreadDisposables = [];
		this._bindCommentThreadListeners();

		this._body.updateCommentThread(commentThread);
		this._threadIsEmpty.set(!this._body.length);
		this._header.updateCommentThread(commentThread);
		this._commentReply?.updateCommentThread(commentThread);
	}

	display(lineHeight: number) {
		let headHeight = Math.ceil(lineHeight * 1.2);
		this._header.updateHeight(headHeight);

		this._body.display();

		// create comment thread only when it supports reply
		if (this._commentThread.canReply) {
			this._createCommentForm();
		}

		this._register(this._body.onDidResize(dimension => {
			this._refresh(dimension);
		}));

		// If there are no existing comments, place focus on the text area. This must be done after show, which also moves focus.
		// if this._commentThread.comments is undefined, it doesn't finish initialization yet, so we don't focus the editor immediately.
		if (this._commentThread.canReply && this._commentReply) {
			this._commentReply?.focusIfNeeded();
		}

		this._bindCommentThreadListeners();
	}

	private _refresh(dimension: dom.Dimension) {
		this._body.layout();
		this._onDidResize.fire(dimension);
	}



	private _bindCommentThreadListeners() {
		this._commentThreadDisposables.push(this._commentThread.onDidChangeCanReply(() => {
			if (this._commentReply) {
				this._commentReply.updateCanReply();
			} else {
				if (this._commentThread.canReply) {
					this._createCommentForm();
				}
			}
		}));

		this._commentThreadDisposables.push(this._commentThread.onDidChangeLabel(_ => {
			this._header.createThreadLabel();
		}));
	}

	private _createCommentForm() {
		this._commentReply = this._scopedInstatiationService.createInstance(
			CommentReply,
			this._owner,
			this._body.container,
			this._commentThread,
			this._scopedInstatiationService,
			this._contextKeyService,
			this._commentMenus,
			this._commentOptions,
			this._pendingComment,
			this,
			this._containerDelegate.actionRunner
		);

		this._register(this._commentReply);
	}

	getCommentCoords(commentUniqueId: number) {
		return this._body.getCommentCoords(commentUniqueId);
	}

	getPendingComment(): string | null {
		if (this._commentReply) {
			return this._commentReply.getPendingComment();
		}

		return null;
	}

	getDimensions() {
		return this._body?.getDimensions();
	}

	layout(widthInPixel?: number) {
		this._body.layout();

		if (widthInPixel !== undefined) {
			this._commentReply?.layout(widthInPixel);
		}
	}

	focusCommentEditor() {
		this._commentReply?.focusCommentEditor();
	}

	async submitComment() {
		const activeComment = this._body.activeComment;
		if (activeComment && !(activeComment instanceof CommentNode)) {
			this._commentReply?.submitComment();
		}
	}

	collapse() {
		this._containerDelegate.collapse();
	}

	applyTheme() {
		this._commentReply?.setCommentEditorDecorations();
	}
}
