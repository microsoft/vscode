/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { Action } from 'vs/base/common/actions';
import { Disposable } from 'vs/base/common/lifecycle';
import * as modes from 'vs/editor/common/modes';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { URI } from 'vs/base/common/uri';
import { ICommentService } from 'vs/workbench/parts/comments/electron-browser/commentService';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';
import { SimpleCommentEditor } from 'vs/workbench/parts/comments/electron-browser/simpleCommentEditor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { inputValidationErrorBorder } from 'vs/platform/theme/common/colorRegistry';
import { ITextModel } from 'vs/editor/common/model';

const UPDATE_COMMENT_LABEL = nls.localize('label.updateComment', "Update comment");
const UPDATE_IN_PROGRESS_LABEL = nls.localize('label.updatingComment', "Updating comment...");

export class CommentNode extends Disposable {
	private _domNode: HTMLElement;
	private _body: HTMLElement;
	private _md: HTMLElement;
	private _clearTimeout: any;

	private _editAction: Action;
	private _commentEditContainer: HTMLElement;
	private _commentEditor: SimpleCommentEditor;
	private _commentEditorModel: ITextModel;

	public get domNode(): HTMLElement {
		return this._domNode;
	}

	constructor(
		public comment: modes.Comment,
		private owner: number,
		private resource: URI,
		private markdownRenderer: MarkdownRenderer,
		private themeService: IThemeService,
		private instantiationService: IInstantiationService,
		private commentService: ICommentService,
		private modelService: IModelService,
		private modeService: IModeService
	) {
		super();

		this._domNode = dom.$('div.review-comment');
		this._domNode.tabIndex = 0;
		const avatar = dom.append(this._domNode, dom.$('div.avatar-container'));
		const img = <HTMLImageElement>dom.append(avatar, dom.$('img.avatar'));
		img.src = comment.gravatar;
		const commentDetailsContainer = dom.append(this._domNode, dom.$('.review-comment-contents'));

		this.createHeader(commentDetailsContainer);

		this._body = dom.append(commentDetailsContainer, dom.$('div.comment-body'));
		this._md = this.markdownRenderer.render(comment.body).element;
		this._body.appendChild(this._md);

		this._domNode.setAttribute('aria-label', `${comment.userName}, ${comment.body.value}`);
		this._domNode.setAttribute('role', 'treeitem');
		this._clearTimeout = null;
	}

	private createHeader(commentDetailsContainer: HTMLElement): void {
		const header = dom.append(commentDetailsContainer, dom.$('div.comment-title'));
		const author = dom.append(header, dom.$('strong.author'));
		author.innerText = this.comment.userName;

		const actions: Action[] = [];
		if (this.comment.canEdit) {
			this._editAction = this.createEditAction(commentDetailsContainer);
			actions.push(this._editAction);
		}

		if (actions.length) {
			const actionsContainer = dom.append(header, dom.$('.comment-actions.hidden'));
			const actionBar = new ActionBar(actionsContainer, {});
			this._toDispose.push(actionBar);
			this.registerActionBarListeners(actionsContainer);

			actions.forEach(action => actionBar.push(action, { label: false, icon: true }));
		}
	}

	private createCommentEditor(): void {
		const container = dom.append(this._commentEditContainer, dom.$('.edit-textarea'));
		this._commentEditor = this.instantiationService.createInstance(SimpleCommentEditor, container, SimpleCommentEditor.getEditorOptions());
		const resource = URI.parse(`comment:commentinput-${this.comment.commentId}-${Date.now()}.md`);
		this._commentEditorModel = this.modelService.createModel('', this.modeService.getOrCreateModeByFilenameOrFirstLine(resource.path), resource, true);

		this._commentEditor.setModel(this._commentEditorModel);
		this._commentEditor.setValue(this.comment.body.value);
		this._commentEditor.layout({ width: container.clientWidth - 14, height: 90 });
		this._commentEditor.focus();

		this._toDispose.push(this._commentEditor);
		this._toDispose.push(this._commentEditorModel);
	}

	private removeCommentEditor() {
		this._editAction.enabled = true;
		this._body.classList.remove('hidden');
		this._commentEditContainer.remove();

		this._commentEditorModel.dispose();
		this._commentEditor.dispose();
	}

	private createEditAction(commentDetailsContainer: HTMLElement): Action {
		return new Action('comment.edit', nls.localize('label.edit', "Edit"), 'octicon octicon-pencil', true, () => {
			this._body.classList.add('hidden');
			this._commentEditContainer = dom.append(commentDetailsContainer, dom.$('.edit-container'));
			this.createCommentEditor();

			const error = dom.append(this._commentEditContainer, dom.$('.validation-error.hidden'));
			const formActions = dom.append(this._commentEditContainer, dom.$('.form-actions'));

			const cancelEditButton = new Button(formActions);
			cancelEditButton.label = nls.localize('label.cancel', "Cancel");
			attachButtonStyler(cancelEditButton, this.themeService);

			this._toDispose.push(cancelEditButton.onDidClick(_ => {
				this.removeCommentEditor();
			}));

			const updateCommentButton = new Button(formActions);
			updateCommentButton.label = UPDATE_COMMENT_LABEL;
			attachButtonStyler(updateCommentButton, this.themeService);

			this._toDispose.push(updateCommentButton.onDidClick(_ => {
				updateCommentButton.enabled = false;
				updateCommentButton.label = UPDATE_IN_PROGRESS_LABEL;

				try {
					this.commentService.editComment(this.owner, this.resource, this.comment, this._commentEditor.getValue()).then(editedComment => {
						updateCommentButton.enabled = true;
						updateCommentButton.label = UPDATE_COMMENT_LABEL;
						this._commentEditor.getDomNode().style.outline = '';
						this.removeCommentEditor();
						this.update(editedComment);
					});
				} catch (e) {
					updateCommentButton.enabled = true;
					updateCommentButton.label = UPDATE_COMMENT_LABEL;

					this._commentEditor.getDomNode().style.outline = `1px solid ${this.themeService.getTheme().getColor(inputValidationErrorBorder)}`;
					error.textContent = nls.localize('commentCreationError', "Updating the comment failed: {0}.", e.message);
					error.classList.remove('hidden');
					this._commentEditor.focus();
				}
			}));

			this._toDispose.push(this._commentEditor.onDidChangeModelContent(_ => {
				updateCommentButton.enabled = !!this._commentEditor.getValue();
			}));

			this._editAction.enabled = false;
			return null;
		});
	}

	private registerActionBarListeners(actionsContainer: HTMLElement): void {
		this._toDispose.push(dom.addDisposableListener(this._domNode, 'mouseenter', () => {
			actionsContainer.classList.remove('hidden');
		}));

		this._toDispose.push(dom.addDisposableListener(this._domNode, 'focus', () => {
			actionsContainer.classList.remove('hidden');
		}));

		this._toDispose.push(dom.addDisposableListener(this._domNode, 'mouseleave', (e: MouseEvent) => {
			if (document.activeElement !== e.target) {
				actionsContainer.classList.add('hidden');
			}
		}));

		this._toDispose.push(dom.addDisposableListener(this._domNode, 'focusout', (e: FocusEvent) => {
			if (!this._domNode.contains((<HTMLElement>e.relatedTarget))) {
				actionsContainer.classList.add('hidden');

				if (this._commentEditor && this._commentEditor.getValue() === this.comment.body.value) {
					this.removeCommentEditor();
				}
			}
		}));
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

	dispose() {
		this._toDispose.forEach(disposeable => disposeable.dispose());
	}
}