/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import * as languages from 'vs/editor/common/languages';
import { ActionsOrientation, ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action, IActionRunner, IAction, Separator, ActionRunner } from 'vs/base/common/actions';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { LayoutableEditor, STARTING_EDITOR_HEIGHT, SimpleCommentEditor, calculateEditorHeight } from 'vs/workbench/contrib/comments/browser/simpleCommentEditor';
import { Selection } from 'vs/editor/common/core/selection';
import { Emitter, Event } from 'vs/base/common/event';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { ToggleReactionsAction, ReactionAction, ReactionActionViewItem } from './reactionsAction';
import { ICommentThreadWidget } from 'vs/workbench/contrib/comments/common/commentThreadWidget';
import { MenuItemAction, SubmenuItemAction, IMenu, MenuId } from 'vs/platform/actions/common/actions';
import { MenuEntryActionViewItem, SubmenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { CommentFormActions } from 'vs/workbench/contrib/comments/browser/commentFormActions';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from 'vs/base/browser/ui/mouseCursor/mouseCursor';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { TimestampWidget } from 'vs/workbench/contrib/comments/browser/timestamp';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IRange } from 'vs/editor/common/core/range';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { CommentMenus } from 'vs/workbench/contrib/comments/browser/commentMenus';
import { Scrollable, ScrollbarVisibility } from 'vs/base/common/scrollable';
import { SmoothScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { DomEmitter } from 'vs/base/browser/event';
import { CommentContextKeys } from 'vs/workbench/contrib/comments/common/commentContextKeys';
import { FileAccess } from 'vs/base/common/network';
import { COMMENTS_SECTION, ICommentsConfiguration } from 'vs/workbench/contrib/comments/common/commentsConfiguration';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';

class CommentsActionRunner extends ActionRunner {
	protected override async runAction(action: IAction, context: any[]): Promise<void> {
		await action.run(...context);
	}
}

export class CommentNode<T extends IRange | ICellRange> extends Disposable {
	private _domNode: HTMLElement;
	private _body: HTMLElement;
	private _md: HTMLElement | undefined;
	private _plainText: HTMLElement | undefined;
	private _clearTimeout: any;

	private _editAction: Action | null = null;
	private _commentEditContainer: HTMLElement | null = null;
	private _commentDetailsContainer: HTMLElement;
	private _actionsToolbarContainer!: HTMLElement;
	private _reactionsActionBar?: ActionBar;
	private _reactionActionsContainer?: HTMLElement;
	private _commentEditor: SimpleCommentEditor | null = null;
	private _commentEditorDisposables: IDisposable[] = [];
	private _commentEditorModel: ITextModel | null = null;
	private _editorHeight = STARTING_EDITOR_HEIGHT;

	private _isPendingLabel!: HTMLElement;
	private _timestamp: HTMLElement | undefined;
	private _timestampWidget: TimestampWidget | undefined;
	private _contextKeyService: IContextKeyService;
	private _commentContextValue: IContextKey<string>;
	private _commentMenus: CommentMenus;

	private _scrollable!: Scrollable;
	private _scrollableElement!: SmoothScrollableElement;

	protected actionRunner?: IActionRunner;
	protected toolbar: ToolBar | undefined;
	private _commentFormActions: CommentFormActions | null = null;
	private _commentEditorActions: CommentFormActions | null = null;

	private readonly _onDidClick = new Emitter<CommentNode<T>>();

	public get domNode(): HTMLElement {
		return this._domNode;
	}

	public isEditing: boolean = false;

	constructor(
		private readonly parentEditor: LayoutableEditor,
		private commentThread: languages.CommentThread<T>,
		public comment: languages.Comment,
		private pendingEdit: string | undefined,
		private owner: string,
		private resource: URI,
		private parentThread: ICommentThreadWidget,
		private markdownRenderer: MarkdownRenderer,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICommentService private commentService: ICommentService,
		@IModelService private modelService: IModelService,
		@ILanguageService private languageService: ILanguageService,
		@INotificationService private notificationService: INotificationService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IAccessibilityService private accessibilityService: IAccessibilityService
	) {
		super();

		this._domNode = dom.$('div.review-comment');
		this._contextKeyService = contextKeyService.createScoped(this._domNode);
		this._commentContextValue = CommentContextKeys.commentContext.bindTo(this._contextKeyService);
		if (this.comment.contextValue) {
			this._commentContextValue.set(this.comment.contextValue);
		}
		this._commentMenus = this.commentService.getCommentMenus(this.owner);

		this._domNode.tabIndex = -1;
		const avatar = dom.append(this._domNode, dom.$('div.avatar-container'));
		if (comment.userIconPath) {
			const img = <HTMLImageElement>dom.append(avatar, dom.$('img.avatar'));
			img.src = FileAccess.uriToBrowserUri(URI.revive(comment.userIconPath)).toString(true);
			img.onerror = _ => img.remove();
		}
		this._commentDetailsContainer = dom.append(this._domNode, dom.$('.review-comment-contents'));

		this.createHeader(this._commentDetailsContainer);
		this._body = document.createElement(`div`);
		this._body.classList.add('comment-body', MOUSE_CURSOR_TEXT_CSS_CLASS_NAME);
		if (configurationService.getValue<ICommentsConfiguration | undefined>(COMMENTS_SECTION)?.maxHeight !== false) {
			this._body.classList.add('comment-body-max-height');
		}

		this.createScroll(this._commentDetailsContainer, this._body);
		this.updateCommentBody(this.comment.body);

		if (this.comment.commentReactions && this.comment.commentReactions.length && this.comment.commentReactions.filter(reaction => !!reaction.count).length) {
			this.createReactionsContainer(this._commentDetailsContainer);
		}

		this._domNode.setAttribute('aria-label', `${comment.userName}, ${this.commentBodyValue}`);
		this._domNode.setAttribute('role', 'treeitem');
		this._clearTimeout = null;

		this._register(dom.addDisposableListener(this._domNode, dom.EventType.CLICK, () => this.isEditing || this._onDidClick.fire(this)));
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.CONTEXT_MENU, e => {
			return this.onContextMenu(e);
		}));

		if (pendingEdit) {
			this.switchToEditMode();
		}
		this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => {
			this.toggleToolbarHidden(true);
		}));
	}

	private createScroll(container: HTMLElement, body: HTMLElement) {
		this._scrollable = new Scrollable({
			forceIntegerValues: true,
			smoothScrollDuration: 125,
			scheduleAtNextAnimationFrame: cb => dom.scheduleAtNextAnimationFrame(cb)
		});
		this._scrollableElement = this._register(new SmoothScrollableElement(body, {
			horizontal: ScrollbarVisibility.Visible,
			vertical: ScrollbarVisibility.Visible
		}, this._scrollable));

		this._register(this._scrollableElement.onScroll(e => {
			if (e.scrollLeftChanged) {
				body.scrollLeft = e.scrollLeft;
			}
			if (e.scrollTopChanged) {
				body.scrollTop = e.scrollTop;
			}
		}));

		const onDidScrollViewContainer = this._register(new DomEmitter(body, 'scroll')).event;
		this._register(onDidScrollViewContainer(_ => {
			const position = this._scrollableElement.getScrollPosition();
			const scrollLeft = Math.abs(body.scrollLeft - position.scrollLeft) <= 1 ? undefined : body.scrollLeft;
			const scrollTop = Math.abs(body.scrollTop - position.scrollTop) <= 1 ? undefined : body.scrollTop;

			if (scrollLeft !== undefined || scrollTop !== undefined) {
				this._scrollableElement.setScrollPosition({ scrollLeft, scrollTop });
			}
		}));

		container.appendChild(this._scrollableElement.getDomNode());
	}

	private updateCommentBody(body: string | IMarkdownString) {
		this._body.innerText = '';
		this._md = undefined;
		this._plainText = undefined;
		if (typeof body === 'string') {
			this._plainText = dom.append(this._body, dom.$('.comment-body-plainstring'));
			this._plainText.innerText = body;
		} else {
			this._md = this.markdownRenderer.render(body).element;
			this._body.appendChild(this._md);
		}
	}

	public get onDidClick(): Event<CommentNode<T>> {
		return this._onDidClick.event;
	}

	private createTimestamp(container: HTMLElement) {
		this._timestamp = dom.append(container, dom.$('span.timestamp-container'));
		this.updateTimestamp(this.comment.timestamp);
	}

	private updateTimestamp(raw?: string) {
		if (!this._timestamp) {
			return;
		}

		const timestamp = raw !== undefined ? new Date(raw) : undefined;
		if (!timestamp) {
			this._timestampWidget?.dispose();
		} else {
			if (!this._timestampWidget) {
				this._timestampWidget = new TimestampWidget(this.configurationService, this._timestamp, timestamp);
				this._register(this._timestampWidget);
			} else {
				this._timestampWidget.setTimestamp(timestamp);
			}
		}
	}

	private createHeader(commentDetailsContainer: HTMLElement): void {
		const header = dom.append(commentDetailsContainer, dom.$(`div.comment-title.${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`));
		const infoContainer = dom.append(header, dom.$('comment-header-info'));
		const author = dom.append(infoContainer, dom.$('strong.author'));
		author.innerText = this.comment.userName;
		this.createTimestamp(infoContainer);
		this._isPendingLabel = dom.append(infoContainer, dom.$('span.isPending'));

		if (this.comment.label) {
			this._isPendingLabel.innerText = this.comment.label;
		} else {
			this._isPendingLabel.innerText = '';
		}

		this._actionsToolbarContainer = dom.append(header, dom.$('.comment-actions'));
		this.toggleToolbarHidden(true);
		this.createActionsToolbar();
	}

	private toggleToolbarHidden(hidden: boolean) {
		if (hidden && !this.accessibilityService.isScreenReaderOptimized()) {
			this._actionsToolbarContainer.classList.add('hidden');
		} else {
			this._actionsToolbarContainer.classList.remove('hidden');
		}
	}

	private getToolbarActions(menu: IMenu): { primary: IAction[]; secondary: IAction[] } {
		const contributedActions = menu.getActions({ shouldForwardArgs: true });
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };
		fillInActions(contributedActions, result, false, g => /^inline/.test(g));
		return result;
	}

	private get commentNodeContext() {
		return [{
			thread: this.commentThread,
			commentUniqueId: this.comment.uniqueIdInThread,
			$mid: MarshalledId.CommentNode
		},
		{
			commentControlHandle: this.commentThread.controllerHandle,
			commentThreadHandle: this.commentThread.commentThreadHandle,
			$mid: MarshalledId.CommentThread
		}];
	}

	private createToolbar() {
		this.toolbar = new ToolBar(this._actionsToolbarContainer, this.contextMenuService, {
			actionViewItemProvider: action => {
				if (action.id === ToggleReactionsAction.ID) {
					return new DropdownMenuActionViewItem(
						action,
						(<ToggleReactionsAction>action).menuActions,
						this.contextMenuService,
						{
							actionViewItemProvider: action => this.actionViewItemProvider(action as Action),
							actionRunner: this.actionRunner,
							classNames: ['toolbar-toggle-pickReactions', ...ThemeIcon.asClassNameArray(Codicon.reactions)],
							anchorAlignmentProvider: () => AnchorAlignment.RIGHT
						}
					);
				}
				return this.actionViewItemProvider(action as Action);
			},
			orientation: ActionsOrientation.HORIZONTAL
		});

		this.toolbar.context = this.commentNodeContext;
		this.toolbar.actionRunner = new CommentsActionRunner();

		this.registerActionBarListeners(this._actionsToolbarContainer);
		this._register(this.toolbar);
	}

	private createActionsToolbar() {
		const actions: IAction[] = [];

		const hasReactionHandler = this.commentService.hasReactionHandler(this.owner);

		if (hasReactionHandler) {
			const toggleReactionAction = this.createReactionPicker(this.comment.commentReactions || []);
			actions.push(toggleReactionAction);
		}

		const menu = this._commentMenus.getCommentTitleActions(this.comment, this._contextKeyService);
		this._register(menu);
		this._register(menu.onDidChange(e => {
			const { primary, secondary } = this.getToolbarActions(menu);
			if (!this.toolbar && (primary.length || secondary.length)) {
				this.createToolbar();
			}

			this.toolbar!.setActions(primary, secondary);
		}));

		const { primary, secondary } = this.getToolbarActions(menu);
		actions.push(...primary);

		if (actions.length || secondary.length) {
			this.createToolbar();
			this.toolbar!.setActions(actions, secondary);
		}
	}

	actionViewItemProvider(action: Action) {
		let options = {};
		if (action.id === ToggleReactionsAction.ID) {
			options = { label: false, icon: true };
		} else {
			options = { label: false, icon: true };
		}

		if (action.id === ReactionAction.ID) {
			const item = new ReactionActionViewItem(action);
			return item;
		} else if (action instanceof MenuItemAction) {
			return this.instantiationService.createInstance(MenuEntryActionViewItem, action, undefined);
		} else if (action instanceof SubmenuItemAction) {
			return this.instantiationService.createInstance(SubmenuEntryActionViewItem, action, undefined);
		} else {
			const item = new ActionViewItem({}, action, options);
			return item;
		}
	}

	async submitComment(): Promise<void> {
		if (this._commentEditor && this._commentFormActions) {
			await this._commentFormActions.triggerDefaultAction();
			this.pendingEdit = undefined;
		}
	}

	private createReactionPicker(reactionGroup: languages.CommentReaction[]): ToggleReactionsAction {
		const toggleReactionAction = this._register(new ToggleReactionsAction(() => {
			toggleReactionActionViewItem?.show();
		}, nls.localize('commentToggleReaction', "Toggle Reaction")));

		let reactionMenuActions: Action[] = [];
		if (reactionGroup && reactionGroup.length) {
			reactionMenuActions = reactionGroup.map((reaction) => {
				return new Action(`reaction.command.${reaction.label}`, `${reaction.label}`, '', true, async () => {
					try {
						await this.commentService.toggleReaction(this.owner, this.resource, this.commentThread, this.comment, reaction);
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

		const toggleReactionActionViewItem: DropdownMenuActionViewItem = new DropdownMenuActionViewItem(
			toggleReactionAction,
			(<ToggleReactionsAction>toggleReactionAction).menuActions,
			this.contextMenuService,
			{
				actionViewItemProvider: action => {
					if (action.id === ToggleReactionsAction.ID) {
						return toggleReactionActionViewItem;
					}
					return this.actionViewItemProvider(action as Action);
				},
				actionRunner: this.actionRunner,
				classNames: 'toolbar-toggle-pickReactions',
				anchorAlignmentProvider: () => AnchorAlignment.RIGHT
			}
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
						{
							actionViewItemProvider: action => this.actionViewItemProvider(action as Action),
							actionRunner: this.actionRunner,
							classNames: ['toolbar-toggle-pickReactions', ...ThemeIcon.asClassNameArray(Codicon.reactions)],
							anchorAlignmentProvider: () => AnchorAlignment.RIGHT
						}
					);
				}
				return this.actionViewItemProvider(action as Action);
			}
		});
		this._register(this._reactionsActionBar);

		const hasReactionHandler = this.commentService.hasReactionHandler(this.owner);
		this.comment.commentReactions!.filter(reaction => !!reaction.count).map(reaction => {
			const action = new ReactionAction(`reaction.${reaction.label}`, `${reaction.label}`, reaction.hasReacted && (reaction.canEdit || hasReactionHandler) ? 'active' : '', (reaction.canEdit || hasReactionHandler), async () => {
				try {
					await this.commentService.toggleReaction(this.owner, this.resource, this.commentThread, this.comment, reaction);
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

			this._reactionsActionBar?.push(action, { label: true, icon: true });
		});

		if (hasReactionHandler) {
			const toggleReactionAction = this.createReactionPicker(this.comment.commentReactions || []);
			this._reactionsActionBar.push(toggleReactionAction, { label: false, icon: true });
		}
	}

	get commentBodyValue(): string {
		return (typeof this.comment.body === 'string') ? this.comment.body : this.comment.body.value;
	}

	private createCommentEditor(editContainer: HTMLElement): void {
		const container = dom.append(editContainer, dom.$('.edit-textarea'));
		this._commentEditor = this.instantiationService.createInstance(SimpleCommentEditor, container, SimpleCommentEditor.getEditorOptions(this.configurationService), this._contextKeyService, this.parentThread);
		const resource = URI.parse(`comment:commentinput-${this.comment.uniqueIdInThread}-${Date.now()}.md`);
		this._commentEditorModel = this.modelService.createModel('', this.languageService.createByFilepathOrFirstLine(resource), resource, false);

		this._commentEditor.setModel(this._commentEditorModel);
		this._commentEditor.setValue(this.pendingEdit ?? this.commentBodyValue);
		this.pendingEdit = undefined;
		this._commentEditor.layout({ width: container.clientWidth - 14, height: this._editorHeight });
		this._commentEditor.focus();

		dom.scheduleAtNextAnimationFrame(() => {
			this._commentEditor!.layout({ width: container.clientWidth - 14, height: this._editorHeight });
			this._commentEditor!.focus();
		});

		const lastLine = this._commentEditorModel.getLineCount();
		const lastColumn = this._commentEditorModel.getLineLength(lastLine) + 1;
		this._commentEditor.setSelection(new Selection(lastLine, lastColumn, lastLine, lastColumn));

		const commentThread = this.commentThread;
		commentThread.input = {
			uri: this._commentEditor.getModel()!.uri,
			value: this.commentBodyValue
		};
		this.commentService.setActiveCommentThread(commentThread);

		this._commentEditorDisposables.push(this._commentEditor.onDidFocusEditorWidget(() => {
			commentThread.input = {
				uri: this._commentEditor!.getModel()!.uri,
				value: this.commentBodyValue
			};
			this.commentService.setActiveCommentThread(commentThread);
		}));

		this._commentEditorDisposables.push(this._commentEditor.onDidChangeModelContent(e => {
			if (commentThread.input && this._commentEditor && this._commentEditor.getModel()!.uri === commentThread.input.uri) {
				const newVal = this._commentEditor.getValue();
				if (newVal !== commentThread.input.value) {
					const input = commentThread.input;
					input.value = newVal;
					commentThread.input = input;
					this.commentService.setActiveCommentThread(commentThread);
				}
			}
		}));

		this.calculateEditorHeight();

		this._register((this._commentEditorModel.onDidChangeContent(() => {
			if (this._commentEditor && this.calculateEditorHeight()) {
				this._commentEditor.layout({ height: this._editorHeight, width: this._commentEditor.getLayoutInfo().width });
				this._commentEditor.render(true);
			}
		})));

		this._register(this._commentEditor);
		this._register(this._commentEditorModel);
	}

	private calculateEditorHeight(): boolean {
		if (this._commentEditor) {
			const newEditorHeight = calculateEditorHeight(this.parentEditor, this._commentEditor, this._editorHeight);
			if (newEditorHeight !== this._editorHeight) {
				this._editorHeight = newEditorHeight;
				return true;
			}
		}
		return false;
	}

	getPendingEdit(): string | undefined {
		const model = this._commentEditor?.getModel();
		if (model && model.getValueLength() > 0) {
			return model.getValue();
		}
		return undefined;
	}

	private removeCommentEditor() {
		this.isEditing = false;
		if (this._editAction) {
			this._editAction.enabled = true;
		}
		this._body.classList.remove('hidden');

		this._commentEditorModel?.dispose();

		this._commentEditorDisposables.forEach(dispose => dispose.dispose());
		this._commentEditorDisposables = [];
		if (this._commentEditor) {
			this._commentEditor.dispose();
			this._commentEditor = null;
		}

		this._commentEditContainer!.remove();
	}

	layout() {
		this._commentEditor?.layout({ width: this._commentEditor.getLayoutInfo().width, height: this._editorHeight });
		const scrollWidth = this._body.scrollWidth;
		const width = dom.getContentWidth(this._body);
		const scrollHeight = this._body.scrollHeight;
		const height = dom.getContentHeight(this._body) + 4;
		this._scrollableElement.setScrollDimensions({ width, scrollWidth, height, scrollHeight });
	}

	public switchToEditMode() {
		if (this.isEditing) {
			return;
		}

		this.isEditing = true;
		this._body.classList.add('hidden');
		this._commentEditContainer = dom.append(this._commentDetailsContainer, dom.$('.edit-container'));
		this.createCommentEditor(this._commentEditContainer);

		const formActions = dom.append(this._commentEditContainer, dom.$('.form-actions'));
		const otherActions = dom.append(formActions, dom.$('.other-actions'));
		this.createCommentWidgetFormActions(otherActions);
		const editorActions = dom.append(formActions, dom.$('.editor-actions'));
		this.createCommentWidgetEditorActions(editorActions);

	}

	private createCommentWidgetFormActions(container: HTMLElement) {
		const menus = this.commentService.getCommentMenus(this.owner);
		const menu = menus.getCommentActions(this.comment, this._contextKeyService);

		this._register(menu);
		this._register(menu.onDidChange(() => {
			this._commentFormActions?.setActions(menu);
		}));

		this._commentFormActions = new CommentFormActions(container, (action: IAction): void => {
			const text = this._commentEditor!.getValue();

			action.run({
				thread: this.commentThread,
				commentUniqueId: this.comment.uniqueIdInThread,
				text: text,
				$mid: MarshalledId.CommentThreadNode
			});

			this.removeCommentEditor();
		});

		this._register(this._commentFormActions);
		this._commentFormActions.setActions(menu);
	}

	private createCommentWidgetEditorActions(container: HTMLElement) {
		const menus = this.commentService.getCommentMenus(this.owner);
		const menu = menus.getCommentEditorActions(this._contextKeyService);

		this._register(menu);
		this._register(menu.onDidChange(() => {
			this._commentEditorActions?.setActions(menu);
		}));

		this._commentEditorActions = new CommentFormActions(container, (action: IAction): void => {
			const text = this._commentEditor!.getValue();

			action.run({
				thread: this.commentThread,
				commentUniqueId: this.comment.uniqueIdInThread,
				text: text,
				$mid: MarshalledId.CommentThreadNode
			});

			this._commentEditor?.focus();
		});

		this._register(this._commentEditorActions);
		this._commentEditorActions.setActions(menu, true);
	}

	setFocus(focused: boolean, visible: boolean = false) {
		if (focused) {
			this._domNode.focus();
			this.toggleToolbarHidden(false);
			this._actionsToolbarContainer.classList.add('tabfocused');
			this._domNode.tabIndex = 0;
			if (this.comment.mode === languages.CommentMode.Editing) {
				this._commentEditor?.focus();
			}
		} else {
			if (this._actionsToolbarContainer.classList.contains('tabfocused') && !this._actionsToolbarContainer.classList.contains('mouseover')) {
				this.toggleToolbarHidden(true);
				this._domNode.tabIndex = -1;
			}
			this._actionsToolbarContainer.classList.remove('tabfocused');
		}
	}

	private registerActionBarListeners(actionsContainer: HTMLElement): void {
		this._register(dom.addDisposableListener(this._domNode, 'mouseenter', () => {
			this.toggleToolbarHidden(false);
			actionsContainer.classList.add('mouseover');
		}));
		this._register(dom.addDisposableListener(this._domNode, 'mouseleave', () => {
			if (actionsContainer.classList.contains('mouseover') && !actionsContainer.classList.contains('tabfocused')) {
				this.toggleToolbarHidden(true);
			}
			actionsContainer.classList.remove('mouseover');
		}));
	}

	update(newComment: languages.Comment) {

		if (newComment.body !== this.comment.body) {
			this.updateCommentBody(newComment.body);
		}

		const isChangingMode: boolean = newComment.mode !== undefined && newComment.mode !== this.comment.mode;

		this.comment = newComment;

		if (isChangingMode) {
			if (newComment.mode === languages.CommentMode.Editing) {
				this.switchToEditMode();
			} else {
				this.removeCommentEditor();
			}
		}

		if (newComment.label) {
			this._isPendingLabel.innerText = newComment.label;
		} else {
			this._isPendingLabel.innerText = '';
		}

		// update comment reactions
		this._reactionActionsContainer?.remove();

		this._reactionsActionBar?.clear();

		if (this.comment.commentReactions && this.comment.commentReactions.some(reaction => !!reaction.count)) {
			this.createReactionsContainer(this._commentDetailsContainer);
		}

		if (this.comment.contextValue) {
			this._commentContextValue.set(this.comment.contextValue);
		} else {
			this._commentContextValue.reset();
		}

		if (this.comment.timestamp) {
			this.updateTimestamp(this.comment.timestamp);
		}
	}


	private onContextMenu(e: MouseEvent) {
		const event = new StandardMouseEvent(e);

		this.contextMenuService.showContextMenu({
			getAnchor: () => event,
			menuId: MenuId.CommentThreadCommentContext,
			menuActionOptions: { shouldForwardArgs: true },
			contextKeyService: this._contextKeyService,
			actionRunner: new CommentsActionRunner(),
			getActionsContext: () => {
				return this.commentNodeContext;
			},
		});
	}

	focus() {
		this.domNode.focus();
		if (!this._clearTimeout) {
			this.domNode.classList.add('focus');
			this._clearTimeout = setTimeout(() => {
				this.domNode.classList.remove('focus');
			}, 3000);
		}
	}
}

function fillInActions(groups: [string, Array<MenuItemAction | SubmenuItemAction>][], target: IAction[] | { primary: IAction[]; secondary: IAction[] }, useAlternativeActions: boolean, isPrimaryGroup: (group: string) => boolean = group => group === 'navigation'): void {
	for (const tuple of groups) {
		let [group, actions] = tuple;
		if (useAlternativeActions) {
			actions = actions.map(a => (a instanceof MenuItemAction) && !!a.alt ? a.alt : a);
		}

		if (isPrimaryGroup(group)) {
			const to = Array.isArray(target) ? target : target.primary;

			to.unshift(...actions);
		} else {
			const to = Array.isArray(target) ? target : target.secondary;

			if (to.length > 0) {
				to.push(new Separator());
			}

			to.push(...actions);
		}
	}
}
