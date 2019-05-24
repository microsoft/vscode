/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import * as modes from 'vs/editor/common/modes';
import { ActionsOrientation, ActionViewItem, ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button } from 'vs/base/browser/ui/button/button';
import { Action, IActionRunner, IAction } from 'vs/base/common/actions';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/markdownRenderer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { inputValidationErrorBorder } from 'vs/platform/theme/common/colorRegistry';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { SimpleCommentEditor } from 'vs/workbench/contrib/comments/browser/simpleCommentEditor';
import { Selection } from 'vs/editor/common/core/selection';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Emitter, Event } from 'vs/base/common/event';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { assign } from 'vs/base/common/objects';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdown';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { ToggleReactionsAction, ReactionAction, ReactionActionViewItem } from './reactionsAction';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICommentThreadWidget } from 'vs/workbench/contrib/comments/common/commentThreadWidget';
import { MenuItemAction } from 'vs/platform/actions/common/actions';
import { ContextAwareMenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { CommentFormActions } from 'vs/workbench/contrib/comments/browser/commentFormActions';

const UPDATE_COMMENT_LABEL = nls.localize('label.updateComment', "Update comment");
const UPDATE_IN_PROGRESS_LABEL = nls.localize('label.updatingComment', "Updating comment...");

export class CommentNode extends Disposable {
	private _domNode: HTMLElement;
	private _body: HTMLElement;
	private _md: HTMLElement;
	private _clearTimeout: any;

	private _editAction: Action;
	private _commentEditContainer: HTMLElement;
	private _commentDetailsContainer: HTMLElement;
	private _actionsToolbarContainer: HTMLElement;
	private _reactionsActionBar?: ActionBar;
	private _reactionActionsContainer?: HTMLElement;
	private _commentEditor: SimpleCommentEditor | null;
	private _commentEditorDisposables: IDisposable[] = [];
	private _commentEditorModel: ITextModel;
	private _updateCommentButton: Button;
	private _errorEditingContainer: HTMLElement;
	private _isPendingLabel: HTMLElement;
	private _contextKeyService: IContextKeyService;
	private _commentContextValue: IContextKey<string>;

	private _deleteAction: Action;
	protected actionRunner?: IActionRunner;
	protected toolbar: ToolBar;
	private _commentFormActions: CommentFormActions;

	private _onDidDelete = new Emitter<CommentNode>();

	public get domNode(): HTMLElement {
		return this._domNode;
	}

	public isEditing: boolean;

	constructor(
		private commentThread: modes.CommentThread | modes.CommentThread2,
		public comment: modes.Comment,
		private owner: string,
		private resource: URI,
		private parentEditor: ICodeEditor,
		private parentThread: ICommentThreadWidget,
		private markdownRenderer: MarkdownRenderer,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICommentService private commentService: ICommentService,
		@ICommandService private commandService: ICommandService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
		@IDialogService private dialogService: IDialogService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@INotificationService private notificationService: INotificationService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();

		this._domNode = dom.$('div.review-comment');
		this._contextKeyService = contextKeyService.createScoped(this._domNode);
		this._commentContextValue = this._contextKeyService.createKey('comment', comment.contextValue);

		this._domNode.tabIndex = 0;
		const avatar = dom.append(this._domNode, dom.$('div.avatar-container'));
		if (comment.userIconPath) {
			const img = <HTMLImageElement>dom.append(avatar, dom.$('img.avatar'));
			img.src = comment.userIconPath.toString();
			img.onerror = _ => img.remove();
		}
		this._commentDetailsContainer = dom.append(this._domNode, dom.$('.review-comment-contents'));

		this.createHeader(this._commentDetailsContainer);

		this._body = dom.append(this._commentDetailsContainer, dom.$('div.comment-body'));
		this._md = this.markdownRenderer.render(comment.body).element;
		this._body.appendChild(this._md);

		if (this.comment.commentReactions && this.comment.commentReactions.length) {
			this.createReactionsContainer(this._commentDetailsContainer);
		}

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

		if (this.comment.label) {
			this._isPendingLabel.innerText = this.comment.label;
		} else if (this.comment.isDraft) {
			this._isPendingLabel.innerText = 'Pending';
		} else {
			this._isPendingLabel.innerText = '';
		}

		this._actionsToolbarContainer = dom.append(header, dom.$('.comment-actions.hidden'));
		this.createActionsToolbar();
	}

	private createActionsToolbar() {
		const actions: IAction[] = [];

		let reactionGroup = this.commentService.getReactionGroup(this.owner);
		if (reactionGroup && reactionGroup.length) {
			let commentThread = this.commentThread as modes.CommentThread2;
			if (commentThread.commentThreadHandle !== undefined) {
				let toggleReactionAction = this.createReactionPicker2();
				actions.push(toggleReactionAction);
			} else {
				let toggleReactionAction = this.createReactionPicker();
				actions.push(toggleReactionAction);
			}
		}

		if (this.comment.canEdit || this.comment.editCommand) {
			this._editAction = this.createEditAction(this._commentDetailsContainer);
			actions.push(this._editAction);
		}

		if (this.comment.canDelete || this.comment.deleteCommand) {
			this._deleteAction = this.createDeleteAction();
			actions.push(this._deleteAction);
		}

		let commentMenus = this.commentService.getCommentMenus(this.owner);
		const menu = commentMenus.getCommentTitleActions(this.comment, this._contextKeyService);
		this._register(menu);
		this._register(menu.onDidChange(e => {
			const contributedActions = menu.getActions({ shouldForwardArgs: true }).reduce((r, [, actions]) => [...r, ...actions], <MenuItemAction[]>[]);
			this.toolbar.setActions(contributedActions);
		}));

		const contributedActions = menu.getActions({ shouldForwardArgs: true }).reduce((r, [, actions]) => [...r, ...actions], <MenuItemAction[]>[]);
		actions.push(...contributedActions);

		if (actions.length) {
			this.toolbar = new ToolBar(this._actionsToolbarContainer, this.contextMenuService, {
				actionViewItemProvider: action => {
					if (action.id === ToggleReactionsAction.ID) {
						return new DropdownMenuActionViewItem(
							action,
							(<ToggleReactionsAction>action).menuActions,
							this.contextMenuService,
							action => {
								return this.actionViewItemProvider(action as Action);
							},
							this.actionRunner!,
							undefined,
							'toolbar-toggle-pickReactions',
							() => { return AnchorAlignment.RIGHT; }
						);
					}
					return this.actionViewItemProvider(action as Action);
				},
				orientation: ActionsOrientation.HORIZONTAL
			});

			this.toolbar.context = {
				thread: this.commentThread,
				commentUniqueId: this.comment.uniqueIdInThread,
				$mid: 9
			};

			this.registerActionBarListeners(this._actionsToolbarContainer);
			this.toolbar.setActions(actions, [])();
			this._register(this.toolbar);
		}
	}

	actionViewItemProvider(action: Action) {
		let options = {};
		if (action.id === 'comment.delete' || action.id === 'comment.edit' || action.id === ToggleReactionsAction.ID) {
			options = { label: false, icon: true };
		} else {
			options = { label: false, icon: true };
		}

		if (action.id === ReactionAction.ID) {
			let item = new ReactionActionViewItem(action);
			return item;
		} else if (action instanceof MenuItemAction) {
			let item = new ContextAwareMenuEntryActionViewItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
			return item;
		} else {
			let item = new ActionViewItem({}, action, options);
			return item;
		}
	}

	private createReactionPicker2(): ToggleReactionsAction {
		let toggleReactionActionViewItem: DropdownMenuActionViewItem;
		let toggleReactionAction = this._register(new ToggleReactionsAction(() => {
			if (toggleReactionActionViewItem) {
				toggleReactionActionViewItem.show();
			}
		}, nls.localize('commentToggleReaction', "Toggle Reaction")));

		let reactionMenuActions: Action[] = [];
		let reactionGroup = this.commentService.getReactionGroup(this.owner);
		if (reactionGroup && reactionGroup.length) {
			reactionMenuActions = reactionGroup.map((reaction) => {
				return new Action(`reaction.command.${reaction.label}`, `${reaction.label}`, '', true, async () => {
					try {
						await this.commentService.toggleReaction(this.owner, this.resource, this.commentThread as modes.CommentThread2, this.comment, reaction);
					} catch (e) {
						const error = e.message
							? nls.localize('commentToggleReactionError', "Toggling the comment reaction failed: {0}.", e.message)
							: nls.localize('commentToggleReactionDefaultError', "Toggling the comment reaction failed");
						this.notificationService.error(error);
					}
				});
			});
		}

		toggleReactionAction.menuActions = reactionMenuActions;

		toggleReactionActionViewItem = new DropdownMenuActionViewItem(
			toggleReactionAction,
			(<ToggleReactionsAction>toggleReactionAction).menuActions,
			this.contextMenuService,
			action => {
				if (action.id === ToggleReactionsAction.ID) {
					return toggleReactionActionViewItem;
				}
				return this.actionViewItemProvider(action as Action);
			},
			this.actionRunner!,
			undefined,
			'toolbar-toggle-pickReactions',
			() => { return AnchorAlignment.RIGHT; }
		);

		return toggleReactionAction;
	}

	private createReactionPicker(): ToggleReactionsAction {
		let toggleReactionActionViewItem: DropdownMenuActionViewItem;
		let toggleReactionAction = this._register(new ToggleReactionsAction(() => {
			if (toggleReactionActionViewItem) {
				toggleReactionActionViewItem.show();
			}
		}, nls.localize('commentAddReaction', "Add Reaction")));

		let reactionMenuActions: Action[] = [];
		let reactionGroup = this.commentService.getReactionGroup(this.owner);
		if (reactionGroup && reactionGroup.length) {
			reactionMenuActions = reactionGroup.map((reaction) => {
				return new Action(`reaction.command.${reaction.label}`, `${reaction.label}`, '', true, async () => {
					try {
						await this.commentService.addReaction(this.owner, this.resource, this.comment, reaction);
					} catch (e) {
						const error = e.message
							? nls.localize('commentAddReactionError', "Deleting the comment reaction failed: {0}.", e.message)
							: nls.localize('commentAddReactionDefaultError', "Deleting the comment reaction failed");
						this.notificationService.error(error);
					}
				});
			});
		}

		toggleReactionAction.menuActions = reactionMenuActions;

		toggleReactionActionViewItem = new DropdownMenuActionViewItem(
			toggleReactionAction,
			(<ToggleReactionsAction>toggleReactionAction).menuActions,
			this.contextMenuService,
			action => {
				if (action.id === ToggleReactionsAction.ID) {
					return toggleReactionActionViewItem;
				}
				return this.actionViewItemProvider(action as Action);
			},
			this.actionRunner!,
			undefined,
			'toolbar-toggle-pickReactions',
			() => { return AnchorAlignment.RIGHT; }
		);

		return toggleReactionAction;
	}

	private createReactionsContainer(commentDetailsContainer: HTMLElement): void {
		this._reactionActionsContainer = dom.append(commentDetailsContainer, dom.$('div.comment-reactions'));
		this._reactionsActionBar = new ActionBar(this._reactionActionsContainer, {
			actionViewItemProvider: action => {
				if (action.id === ToggleReactionsAction.ID) {
					return new DropdownMenuActionViewItem(
						action,
						(<ToggleReactionsAction>action).menuActions,
						this.contextMenuService,
						action => {
							return this.actionViewItemProvider(action as Action);
						},
						this.actionRunner!,
						undefined,
						'toolbar-toggle-pickReactions',
						() => { return AnchorAlignment.RIGHT; }
					);
				}
				return this.actionViewItemProvider(action as Action);
			}
		});
		this._register(this._reactionsActionBar);

		this.comment.commentReactions!.map(reaction => {
			let action = new ReactionAction(`reaction.${reaction.label}`, `${reaction.label}`, reaction.hasReacted && reaction.canEdit ? 'active' : '', reaction.canEdit, async () => {
				try {
					let commentThread = this.commentThread as modes.CommentThread2;
					if (commentThread.commentThreadHandle !== undefined) {
						await this.commentService.toggleReaction(this.owner, this.resource, this.commentThread as modes.CommentThread2, this.comment, reaction);
					} else {
						if (reaction.hasReacted) {
							await this.commentService.deleteReaction(this.owner, this.resource, this.comment, reaction);
						} else {
							await this.commentService.addReaction(this.owner, this.resource, this.comment, reaction);
						}
					}
				} catch (e) {
					let error: string;

					if (reaction.hasReacted) {
						error = e.message
							? nls.localize('commentDeleteReactionError', "Deleting the comment reaction failed: {0}.", e.message)
							: nls.localize('commentDeleteReactionDefaultError', "Deleting the comment reaction failed");
					} else {
						error = e.message
							? nls.localize('commentAddReactionError', "Deleting the comment reaction failed: {0}.", e.message)
							: nls.localize('commentAddReactionDefaultError', "Deleting the comment reaction failed");
					}
					this.notificationService.error(error);
				}
			}, reaction.iconPath, reaction.count);

			if (this._reactionsActionBar) {
				this._reactionsActionBar.push(action, { label: true, icon: true });
			}
		});

		let reactionGroup = this.commentService.getReactionGroup(this.owner);
		if (reactionGroup && reactionGroup.length) {
			let commentThread = this.commentThread as modes.CommentThread2;
			if (commentThread.commentThreadHandle !== undefined) {
				let toggleReactionAction = this.createReactionPicker2();
				this._reactionsActionBar.push(toggleReactionAction, { label: false, icon: true });
			} else {
				let toggleReactionAction = this.createReactionPicker();
				this._reactionsActionBar.push(toggleReactionAction, { label: false, icon: true });
			}
		}
	}

	private createCommentEditor(): void {
		const container = dom.append(this._commentEditContainer, dom.$('.edit-textarea'));
		this._commentEditor = this.instantiationService.createInstance(SimpleCommentEditor, container, SimpleCommentEditor.getEditorOptions(), this.parentEditor, this.parentThread);
		const resource = URI.parse(`comment:commentinput-${this.comment.commentId}-${Date.now()}.md`);
		this._commentEditorModel = this.modelService.createModel('', this.modeService.createByFilepathOrFirstLine(resource.path), resource, false);

		this._commentEditor.setModel(this._commentEditorModel);
		this._commentEditor.setValue(this.comment.body.value);
		this._commentEditor.layout({ width: container.clientWidth - 14, height: 90 });
		this._commentEditor.focus();

		const lastLine = this._commentEditorModel.getLineCount();
		const lastColumn = this._commentEditorModel.getLineContent(lastLine).length + 1;
		this._commentEditor.setSelection(new Selection(lastLine, lastColumn, lastLine, lastColumn));

		let commentThread = this.commentThread as modes.CommentThread2;
		if (commentThread.commentThreadHandle !== undefined) {
			commentThread.input = {
				uri: this._commentEditor.getModel()!.uri,
				value: this.comment.body.value
			};

			this._commentEditorDisposables.push(this._commentEditor.onDidFocusEditorWidget(() => {
				commentThread.input = {
					uri: this._commentEditor!.getModel()!.uri,
					value: this.comment.body.value
				};
			}));

			this._commentEditorDisposables.push(this._commentEditor.onDidChangeModelContent(e => {
				if (commentThread.input && this._commentEditor && this._commentEditor.getModel()!.uri === commentThread.input.uri) {
					let newVal = this._commentEditor.getValue();
					if (newVal !== commentThread.input.value) {
						let input = commentThread.input;
						input.value = newVal;
						commentThread.input = input;
					}
				}
			}));
		}

		this._register(this._commentEditor);
		this._register(this._commentEditorModel);
	}

	private removeCommentEditor() {
		this.isEditing = false;
		if (this._editAction) {
			this._editAction.enabled = true;
		}
		this._body.classList.remove('hidden');

		if (this._commentEditorModel) {
			this._commentEditorModel.dispose();
		}

		this._commentEditorDisposables.forEach(dispose => dispose.dispose());
		this._commentEditorDisposables = [];
		if (this._commentEditor) {
			this._commentEditor.dispose();
			this._commentEditor = null;
		}

		this._commentEditContainer.remove();
	}

	async editComment(): Promise<void> {
		if (!this._commentEditor) {
			throw new Error('No comment editor');
		}

		this._updateCommentButton.enabled = false;
		this._updateCommentButton.label = UPDATE_IN_PROGRESS_LABEL;

		try {
			const newBody = this._commentEditor.getValue();

			if (this.comment.editCommand) {
				let commentThread = this.commentThread as modes.CommentThread2;
				commentThread.input = {
					uri: this._commentEditor.getModel()!.uri,
					value: newBody
				};
				let commandId = this.comment.editCommand.id;
				let args = this.comment.editCommand.arguments || [];

				await this.commandService.executeCommand(commandId, ...args);
			} else {
				await this.commentService.editComment(this.owner, this.resource, this.comment, newBody);
			}

			this._updateCommentButton.enabled = true;
			this._updateCommentButton.label = UPDATE_COMMENT_LABEL;
			this._commentEditor.getDomNode()!.style.outline = '';
			this.removeCommentEditor();
			const editedComment = assign({}, this.comment, { body: new MarkdownString(newBody) });
			this.update(editedComment);
		} catch (e) {
			this._updateCommentButton.enabled = true;
			this._updateCommentButton.label = UPDATE_COMMENT_LABEL;

			this._commentEditor.getDomNode()!.style.outline = `1px solid ${this.themeService.getTheme().getColor(inputValidationErrorBorder)}`;
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
						if (this.comment.deleteCommand) {
							let commandId = this.comment.deleteCommand.id;
							let args = this.comment.deleteCommand.arguments || [];

							await this.commandService.executeCommand(commandId, ...args);
						} else {
							const didDelete = await this.commentService.deleteComment(this.owner, this.resource, this.comment);
							if (didDelete) {
								this._onDidDelete.fire(this);
							} else {
								throw Error();
							}
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

	public switchToEditMode() {
		if (this.isEditing) {
			return;
		}

		this.isEditing = true;
		this._body.classList.add('hidden');
		this._commentEditContainer = dom.append(this._commentDetailsContainer, dom.$('.edit-container'));
		this.createCommentEditor();
		this._errorEditingContainer = dom.append(this._commentEditContainer, dom.$('.validation-error.hidden'));
		const formActions = dom.append(this._commentEditContainer, dom.$('.form-actions'));

		const menus = this.commentService.getCommentMenus(this.owner);
		const menu = menus.getCommentActions(this.comment, this._contextKeyService);

		this._register(menu);
		this._register(menu.onDidChange(() => {
			this._commentFormActions.setActions(menu);
		}));

		this._commentFormActions = new CommentFormActions(formActions, (action: IAction): void => {
			let text = this._commentEditor!.getValue();

			action.run({
				thread: this.commentThread,
				commentUniqueId: this.comment.uniqueIdInThread,
				text: text,
				$mid: 10
			});

			this.removeCommentEditor();
		}, this.themeService);

		this._commentFormActions.setActions(menu);
	}

	private createEditAction(commentDetailsContainer: HTMLElement): Action {
		return new Action('comment.edit', nls.localize('label.edit', "Edit"), 'octicon octicon-pencil', true, () => {
			return this.editCommentAction(commentDetailsContainer);
		});
	}

	private editCommentAction(commentDetailsContainer: HTMLElement) {
		this.isEditing = true;
		this._body.classList.add('hidden');
		this._commentEditContainer = dom.append(commentDetailsContainer, dom.$('.edit-container'));
		this.createCommentEditor();

		this._errorEditingContainer = dom.append(this._commentEditContainer, dom.$('.validation-error.hidden'));
		const formActions = dom.append(this._commentEditContainer, dom.$('.form-actions'));

		const cancelEditButton = new Button(formActions);
		cancelEditButton.label = nls.localize('label.cancel', "Cancel");
		this._register(attachButtonStyler(cancelEditButton, this.themeService));

		this._register(cancelEditButton.onDidClick(_ => {
			this.removeCommentEditor();
		}));

		this._updateCommentButton = new Button(formActions);
		this._updateCommentButton.label = UPDATE_COMMENT_LABEL;
		this._register(attachButtonStyler(this._updateCommentButton, this.themeService));

		this._register(this._updateCommentButton.onDidClick(_ => {
			this.editComment();
		}));

		this._commentEditorDisposables.push(this._commentEditor!.onDidChangeModelContent(_ => {
			this._updateCommentButton.enabled = !!this._commentEditor!.getValue();
		}));

		this._editAction.enabled = false;
		return Promise.resolve();
	}

	private registerActionBarListeners(actionsContainer: HTMLElement): void {
		this._register(dom.addDisposableListener(this._domNode, 'mouseenter', () => {
			actionsContainer.classList.remove('hidden');
		}));

		this._register(dom.addDisposableListener(this._domNode, 'focus', () => {
			actionsContainer.classList.remove('hidden');
		}));

		this._register(dom.addDisposableListener(this._domNode, 'mouseleave', () => {
			if (!this._domNode.contains(document.activeElement)) {
				actionsContainer.classList.add('hidden');
			}
		}));

		this._register(dom.addDisposableListener(this._domNode, 'focusout', (e: FocusEvent) => {
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

		if (newComment.mode !== undefined && newComment.mode !== this.comment.mode) {
			if (newComment.mode === modes.CommentMode.Editing) {
				this.switchToEditMode();
			} else {
				this.removeCommentEditor();
			}
		}

		const shouldUpdateActions = newComment.editCommand !== this.comment.editCommand || newComment.deleteCommand !== this.comment.deleteCommand;
		this.comment = newComment;

		if (shouldUpdateActions) {
			dom.clearNode(this._actionsToolbarContainer);
			this.createActionsToolbar();
		}


		if (newComment.label) {
			this._isPendingLabel.innerText = newComment.label;
		} else if (newComment.isDraft) {
			this._isPendingLabel.innerText = 'Pending';
		} else {
			this._isPendingLabel.innerText = '';
		}

		// update comment reactions
		if (this._reactionActionsContainer) {
			this._reactionActionsContainer.remove();
		}

		if (this._reactionsActionBar) {
			this._reactionsActionBar.clear();
		}

		if (this.comment.commentReactions && this.comment.commentReactions.length) {
			this.createReactionsContainer(this._commentDetailsContainer);
		}

		if (this.comment.contextValue) {
			this._commentContextValue.set(this.comment.contextValue);
		} else {
			this._commentContextValue.reset();
		}
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