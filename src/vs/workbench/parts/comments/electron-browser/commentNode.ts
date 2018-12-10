/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import * as modes from 'vs/editor/common/modes';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { Action } from 'vs/base/common/actions';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { inputValidationErrorBorder } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICommentService } from 'vs/workbench/parts/comments/electron-browser/commentService';
import { SimpleCommentEditor } from 'vs/workbench/parts/comments/electron-browser/simpleCommentEditor';
import { KeyCode } from 'vs/base/common/keyCodes';
import { isMacintosh } from 'vs/base/common/platform';
import { Selection } from 'vs/editor/common/core/selection';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Emitter, Event } from 'vs/base/common/event';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { assign } from 'vs/base/common/objects';
import { MarkdownString } from 'vs/base/common/htmlContent';

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
	private _updateCommentButton: Button;
	private _errorEditingContainer: HTMLElement;
	private _isPendingLabel: HTMLElement;

	private _deleteAction: Action;
	private _onDidDelete = new Emitter<CommentNode>();

	public get domNode(): HTMLElement {
		return this._domNode;
	}

	constructor(
		public comment: modes.Comment,
		private owner: string,
		private resource: URI,
		private markdownRenderer: MarkdownRenderer,
		private themeService: IThemeService,
		private instantiationService: IInstantiationService,
		private commentService: ICommentService,
		private modelService: IModelService,
		private modeService: IModeService,
		private dialogService: IDialogService,
		private notificationService: INotificationService
	) {
		super();

		this._domNode = dom.$('div.review-comment');
		this._domNode.tabIndex = 0;
		const avatar = dom.append(this._domNode, dom.$('div.avatar-container'));
		if (comment.userIconPath) {
			const img = <HTMLImageElement>dom.append(avatar, dom.$('img.avatar'));
			img.src = comment.userIconPath.toString();
			img.onerror = _ => img.remove();
		}
		const commentDetailsContainer = dom.append(this._domNode, dom.$('.review-comment-contents'));

		this.createHeader(commentDetailsContainer);

		this._body = dom.append(commentDetailsContainer, dom.$('div.comment-body'));
		this._md = this.markdownRenderer.render(comment.body).element;
		this._body.appendChild(this._md);

		this._domNode.setAttribute('aria-label', `${comment.userName}, ${comment.body.value}`);
		this._domNode.setAttribute('role', 'treeitem');
		this._clearTimeout = null;
	}

	public get onDidDelete(): Event<CommentNode> {
		return this._onDidDelete.event;
	}

	private createHeader(commentDetailsContainer: HTMLElement): void {
		const header = dom.append(commentDetailsContainer, dom.$('div.comment-title'));
		const author = dom.append(header, dom.$('strong.author'));
		author.innerText = this.comment.userName;

		this._isPendingLabel = dom.append(header, dom.$('span.isPending'));

		if (this.comment.isDraft) {
			this._isPendingLabel.innerText = 'Pending';
		}

		const actions: Action[] = [];
		if (this.comment.canEdit) {
			this._editAction = this.createEditAction(commentDetailsContainer);
			actions.push(this._editAction);
		}

		if (this.comment.canDelete) {
			this._deleteAction = this.createDeleteAction();
			actions.push(this._deleteAction);
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
		this._commentEditorModel = this.modelService.createModel('', this.modeService.createByFilepathOrFirstLine(resource.path), resource, true);

		this._commentEditor.setModel(this._commentEditorModel);
		this._commentEditor.setValue(this.comment.body.value);
		this._commentEditor.layout({ width: container.clientWidth - 14, height: 90 });
		this._commentEditor.focus();
		const lastLine = this._commentEditorModel.getLineCount();
		const lastColumn = this._commentEditorModel.getLineContent(lastLine).length + 1;
		this._commentEditor.setSelection(new Selection(lastLine, lastColumn, lastLine, lastColumn));

		this._toDispose.push(this._commentEditor.onKeyDown((e: IKeyboardEvent) => {
			const isCmdOrCtrl = isMacintosh ? e.metaKey : e.ctrlKey;
			if (this._updateCommentButton.enabled && e.keyCode === KeyCode.Enter && isCmdOrCtrl) {
				this.editComment();
			}
		}));

		this._toDispose.push(this._commentEditor);
		this._toDispose.push(this._commentEditorModel);
	}

	private removeCommentEditor() {
		this._editAction.enabled = true;
		this._body.classList.remove('hidden');

		this._commentEditorModel.dispose();
		this._commentEditor.dispose();
		this._commentEditor = null;

		this._commentEditContainer.remove();
	}

	private async editComment(): Promise<void> {
		this._updateCommentButton.enabled = false;
		this._updateCommentButton.label = UPDATE_IN_PROGRESS_LABEL;

		try {
			const newBody = this._commentEditor.getValue();
			await this.commentService.editComment(this.owner, this.resource, this.comment, newBody);

			this._updateCommentButton.enabled = true;
			this._updateCommentButton.label = UPDATE_COMMENT_LABEL;
			this._commentEditor.getDomNode().style.outline = '';
			this.removeCommentEditor();
			const editedComment = assign({}, this.comment, { body: new MarkdownString(newBody) });
			this.update(editedComment);
		} catch (e) {
			this._updateCommentButton.enabled = true;
			this._updateCommentButton.label = UPDATE_COMMENT_LABEL;

			this._commentEditor.getDomNode().style.outline = `1px solid ${this.themeService.getTheme().getColor(inputValidationErrorBorder)}`;
			this._errorEditingContainer.textContent = e.message
				? nls.localize('commentEditError', "Updating the comment failed: {0}.", e.message)
				: nls.localize('commentEditDefaultError', "Updating the comment failed.");
			this._errorEditingContainer.classList.remove('hidden');
			this._commentEditor.focus();
		}
	}

	private createDeleteAction(): Action {
		return new Action('comment.delete', nls.localize('label.delete', "Delete"), 'octicon octicon-x', true, () => {
			return this.dialogService.confirm({
				message: nls.localize('confirmDelete', "Delete comment?"),
				type: 'question',
				primaryButton: nls.localize('label.delete', "Delete")
			}).then(async result => {
				if (result.confirmed) {
					try {
						const didDelete = await this.commentService.deleteComment(this.owner, this.resource, this.comment);
						if (didDelete) {
							this._onDidDelete.fire(this);
						} else {
							throw Error();
						}
					} catch (e) {
						const error = e.message
							? nls.localize('commentDeletionError', "Deleting the comment failed: {0}.", e.message)
							: nls.localize('commentDeletionDefaultError', "Deleting the comment failed");
						this.notificationService.error(error);
					}
				}
			});
		});
	}

	private createEditAction(commentDetailsContainer: HTMLElement): Action {
		return new Action('comment.edit', nls.localize('label.edit', "Edit"), 'octicon octicon-pencil', true, () => {
			this._body.classList.add('hidden');
			this._commentEditContainer = dom.append(commentDetailsContainer, dom.$('.edit-container'));
			this.createCommentEditor();

			this._errorEditingContainer = dom.append(this._commentEditContainer, dom.$('.validation-error.hidden'));
			const formActions = dom.append(this._commentEditContainer, dom.$('.form-actions'));

			const cancelEditButton = new Button(formActions);
			cancelEditButton.label = nls.localize('label.cancel', "Cancel");
			attachButtonStyler(cancelEditButton, this.themeService);

			this._toDispose.push(cancelEditButton.onDidClick(_ => {
				this.removeCommentEditor();
			}));

			this._updateCommentButton = new Button(formActions);
			this._updateCommentButton.label = UPDATE_COMMENT_LABEL;
			attachButtonStyler(this._updateCommentButton, this.themeService);

			this._toDispose.push(this._updateCommentButton.onDidClick(_ => {
				this.editComment();
			}));

			this._toDispose.push(this._commentEditor.onDidChangeModelContent(_ => {
				this._updateCommentButton.enabled = !!this._commentEditor.getValue();
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
			if (!this._domNode.contains(document.activeElement)) {
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

		if (newComment.isDraft) {
			this._isPendingLabel.innerText = 'Pending';
		} else {
			this._isPendingLabel.innerText = '';
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