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

const UPDATE_COMMENT_LABEL = nls.localize('label.updateComment', "Update comment");
const UPDATE_IN_PROGRESS_LABEL = nls.localize('label.updatingComment', "Updating comment...");

export class CommentNode extends Disposable {
	private _domNode: HTMLElement;
	private _body: HTMLElement;
	private _md: HTMLElement;
	private _clearTimeout: any;
	private _editAction: Action;

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

		const header = dom.append(commentDetailsContainer, dom.$('div.comment-title'));
		const author = dom.append(header, dom.$('strong.author'));
		author.innerText = comment.userName;

		if (comment.canEdit) {
			const actionsContainer = dom.append(header, dom.$('.comment-actions'));
			const actionbarWidget = new ActionBar(actionsContainer, {});
			this._toDispose.push(actionbarWidget);

			this._editAction = this.createEditAction(commentDetailsContainer);

			actionbarWidget.push(this._editAction, { label: false, icon: true });
		}

		this._body = dom.append(commentDetailsContainer, dom.$('div.comment-body'));
		this._md = this.markdownRenderer.render(comment.body).element;
		this._body.appendChild(this._md);

		this._domNode.setAttribute('aria-label', `${comment.userName}, ${comment.body.value}`);
		this._domNode.setAttribute('role', 'treeitem');
		this._clearTimeout = null;
	}

	private createEditAction(commentDetailsContainer: HTMLElement): Action {
		return new Action('comment.edit', nls.localize('label.edit', "Edit"), 'octicon octicon-pencil', true, () => {
			this._body.classList.add('hidden');
			const editingContainer = dom.append(commentDetailsContainer, dom.$('.edit-container'));
			const editingBoxContainer = dom.append(editingContainer, dom.$('.edit-textarea'));
			const editBox = this.instantiationService.createInstance(SimpleCommentEditor, editingBoxContainer, SimpleCommentEditor.getEditorOptions());
			this._toDispose.push(editBox);
			const resource = URI.parse(`comment:commentinput-kjalfksjdf.md`);
			const model = this.modelService.createModel('', this.modeService.getOrCreateModeByFilenameOrFirstLine(resource.path), resource, true);
			this._toDispose.push(model);
			editBox.setModel(model);
			editBox.setValue(this.comment.body.value);
			editBox.layout();
			editBox.focus();

			const formActions = dom.append(editingContainer, dom.$('.form-actions'));
			const updateCommentButton = new Button(formActions);
			updateCommentButton.label = UPDATE_COMMENT_LABEL;
			attachButtonStyler(updateCommentButton, this.themeService);

			updateCommentButton.onDidClick(_ => {
				updateCommentButton.enabled = false;
				updateCommentButton.label = UPDATE_IN_PROGRESS_LABEL;

				try {
					this.commentService.editComment(this.owner, this.resource, this.comment, editBox.getValue()).then(editedComment => {
						updateCommentButton.enabled = true;
						updateCommentButton.label = UPDATE_COMMENT_LABEL;

						this._editAction.enabled = true;
						this._body.classList.remove('hidden');
						editingContainer.remove();

						model.dispose();
						editBox.dispose();

						this.update(editedComment);
					});
				} catch (e) {
					// TODO Display error message
					updateCommentButton.enabled = true;
					updateCommentButton.label = UPDATE_COMMENT_LABEL;
				}
			});

			this._toDispose.push(editBox.onDidChangeModelContent(_ => {
				if (editBox.getValue()) {
					updateCommentButton.enabled = true;
				} else {
					updateCommentButton.enabled = false;
				}
			}));

			const cancelEditButton = new Button(formActions);
			cancelEditButton.label = nls.localize('label.cancel', "Cancel");
			attachButtonStyler(cancelEditButton, this.themeService);

			cancelEditButton.onDidClick(_ => {
				this._editAction.enabled = true;
				this._body.classList.remove('hidden');
				editingContainer.remove();

				model.dispose();
				editBox.dispose();
			});

			this._editAction.enabled = false;
			return null;
		});
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