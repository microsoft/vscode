/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import * as languages from '../../../../editor/common/languages.js';
import { ActionsOrientation, ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action, IAction, Separator, ActionRunner } from '../../../../base/common/actions.js';
import { Disposable, DisposableStore, IDisposable, IReference, MutableDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IMarkdownRenderResult, MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommentService } from './commentService.js';
import { LayoutableEditor, MIN_EDITOR_HEIGHT, SimpleCommentEditor, calculateEditorHeight } from './simpleCommentEditor.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ToolBar } from '../../../../base/browser/ui/toolbar/toolbar.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { AnchorAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { ToggleReactionsAction, ReactionAction, ReactionActionViewItem } from './reactionsAction.js';
import { ICommentThreadWidget } from '../common/commentThreadWidget.js';
import { MenuItemAction, SubmenuItemAction, IMenu, MenuId } from '../../../../platform/actions/common/actions.js';
import { MenuEntryActionViewItem, SubmenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IContextKeyService, IContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { CommentFormActions } from './commentFormActions.js';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from '../../../../base/browser/ui/mouseCursor/mouseCursor.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { DropdownMenuActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { TimestampWidget } from './timestamp.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { ICellRange } from '../../notebook/common/notebookRange.js';
import { CommentMenus } from './commentMenus.js';
import { Scrollable, ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { SmoothScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { DomEmitter } from '../../../../base/browser/event.js';
import { CommentContextKeys } from '../common/commentContextKeys.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { COMMENTS_SECTION, ICommentsConfiguration } from '../common/commentsConfiguration.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { MarshalledCommentThread } from '../../../common/comments.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { Position } from '../../../../editor/common/core/position.js';

class CommentsActionRunner extends ActionRunner {
	protected override async runAction(action: IAction, context: any[]): Promise<void> {
		await action.run(...context);
	}
}

export class CommentNode<T extends IRange | ICellRange> extends Disposable {
	private _domNode: HTMLElement;
	private _body: HTMLElement;
	private _avatar: HTMLElement;
	private readonly _md: MutableDisposable<IMarkdownRenderResult> = this._register(new MutableDisposable());
	private _plainText: HTMLElement | undefined;
	private _clearTimeout: any;

	private _editAction: Action | null = null;
	private _commentEditContainer: HTMLElement | null = null;
	private _commentDetailsContainer: HTMLElement;
	private _actionsToolbarContainer!: HTMLElement;
	private readonly _reactionsActionBar: MutableDisposable<ActionBar> = this._register(new MutableDisposable());
	private readonly _reactionActions: DisposableStore = this._register(new DisposableStore());
	private _reactionActionsContainer?: HTMLElement;
	private _commentEditor: SimpleCommentEditor | null = null;
	private _commentEditorDisposables: IDisposable[] = [];
	private _commentEditorModel: IReference<IResolvedTextEditorModel> | null = null;
	private _editorHeight = MIN_EDITOR_HEIGHT;

	private _isPendingLabel!: HTMLElement;
	private _timestamp: HTMLElement | undefined;
	private _timestampWidget: TimestampWidget | undefined;
	private _contextKeyService: IContextKeyService;
	private _commentContextValue: IContextKey<string>;
	private _commentMenus: CommentMenus;

	private _scrollable!: Scrollable;
	private _scrollableElement!: SmoothScrollableElement;

	private readonly _actionRunner: CommentsActionRunner = this._register(new CommentsActionRunner());
	private readonly toolbar: MutableDisposable<ToolBar> = this._register(new MutableDisposable());
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
		private pendingEdit: languages.PendingComment | undefined,
		private owner: string,
		private resource: URI,
		private parentThread: ICommentThreadWidget,
		private markdownRenderer: MarkdownRenderer,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICommentService private commentService: ICommentService,
		@INotificationService private notificationService: INotificationService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IHoverService private hoverService: IHoverService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@ITextModelService private readonly textModelService: ITextModelService,
	) {
		super();

		this._domNode = dom.$('div.review-comment');
		this._contextKeyService = this._register(contextKeyService.createScoped(this._domNode));
		this._commentContextValue = CommentContextKeys.commentContext.bindTo(this._contextKeyService);
		if (this.comment.contextValue) {
			this._commentContextValue.set(this.comment.contextValue);
		}
		this._commentMenus = this.commentService.getCommentMenus(this.owner);

		this._domNode.tabIndex = -1;
		this._avatar = dom.append(this._domNode, dom.$('div.avatar-container'));
		this.updateCommentUserIcon(this.comment.userIconPath);

		this._commentDetailsContainer = dom.append(this._domNode, dom.$('.review-comment-contents'));

		this.createHeader(this._commentDetailsContainer);
		this._body = document.createElement(`div`);
		this._body.classList.add('comment-body', MOUSE_CURSOR_TEXT_CSS_CLASS_NAME);
		if (configurationService.getValue<ICommentsConfiguration | undefined>(COMMENTS_SECTION)?.maxHeight !== false) {
			this._body.classList.add('comment-body-max-height');
		}

		this.createScroll(this._commentDetailsContainer, this._body);
		this.updateCommentBody(this.comment.body);

		this.createReactionsContainer(this._commentDetailsContainer);

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

		this.activeCommentListeners();
	}

	private activeCommentListeners() {
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.FOCUS_IN, () => {
			this.commentService.setActiveCommentAndThread(this.owner, { thread: this.commentThread, comment: this.comment });
		}, true));
	}

	private createScroll(container: HTMLElement, body: HTMLElement) {
		this._scrollable = this._register(new Scrollable({
			forceIntegerValues: true,
			smoothScrollDuration: 125,
			scheduleAtNextAnimationFrame: cb => dom.scheduleAtNextAnimationFrame(dom.getWindow(container), cb)
		}));
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
		this._md.clear();
		this._plainText = undefined;
		if (typeof body === 'string') {
			this._plainText = dom.append(this._body, dom.$('.comment-body-plainstring'));
			this._plainText.innerText = body;
		} else {
			this._md.value = this.markdownRenderer.render(body);
			this._body.appendChild(this._md.value.element);
		}
	}

	private updateCommentUserIcon(userIconPath: UriComponents | undefined) {
		this._avatar.textContent = '';
		if (userIconPath) {
			const img = dom.append(this._avatar, dom.$('img.avatar')) as HTMLImageElement;
			img.src = FileAccess.uriToBrowserUri(URI.revive(userIconPath)).toString(true);
			img.onerror = _ => img.remove();
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
				this._timestampWidget = new TimestampWidget(this.configurationService, this.hoverService, this._timestamp, timestamp);
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
		this.createActionsToolbar();
	}

	private getToolbarActions(menu: IMenu): { primary: IAction[]; secondary: IAction[] } {
		const contributedActions = menu.getActions({ shouldForwardArgs: true });
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };
		fillInActions(contributedActions, result, false, g => /^inline/.test(g));
		return result;
	}

	private get commentNodeContext(): [any, MarshalledCommentThread] {
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
		this.toolbar.value = new ToolBar(this._actionsToolbarContainer, this.contextMenuService, {
			actionViewItemProvider: (action, options) => {
				if (action.id === ToggleReactionsAction.ID) {
					return new DropdownMenuActionViewItem(
						action,
						(<ToggleReactionsAction>action).menuActions,
						this.contextMenuService,
						{
							...options,
							actionViewItemProvider: (action, options) => this.actionViewItemProvider(action as Action, options),
							classNames: ['toolbar-toggle-pickReactions', ...ThemeIcon.asClassNameArray(Codicon.reactions)],
							anchorAlignmentProvider: () => AnchorAlignment.RIGHT
						}
					);
				}
				return this.actionViewItemProvider(action as Action, options);
			},
			orientation: ActionsOrientation.HORIZONTAL
		});

		this.toolbar.value.context = this.commentNodeContext;
		this.toolbar.value.actionRunner = this._actionRunner;
	}

	private createActionsToolbar() {
		const actions: IAction[] = [];

		const menu = this._commentMenus.getCommentTitleActions(this.comment, this._contextKeyService);
		this._register(menu);
		this._register(menu.onDidChange(e => {
			const { primary, secondary } = this.getToolbarActions(menu);
			if (!this.toolbar && (primary.length || secondary.length)) {
				this.createToolbar();
			}
			this.toolbar.value!.setActions(primary, secondary);
		}));

		const { primary, secondary } = this.getToolbarActions(menu);
		actions.push(...primary);

		if (actions.length || secondary.length) {
			this.createToolbar();
			this.toolbar.value!.setActions(actions, secondary);
		}
	}

	actionViewItemProvider(action: Action, options: IActionViewItemOptions) {
		if (action.id === ToggleReactionsAction.ID) {
			options = { label: false, icon: true };
		} else {
			options = { label: false, icon: true };
		}

		if (action.id === ReactionAction.ID) {
			const item = new ReactionActionViewItem(action);
			return item;
		} else if (action instanceof MenuItemAction) {
			return this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
		} else if (action instanceof SubmenuItemAction) {
			return this.instantiationService.createInstance(SubmenuEntryActionViewItem, action, options);
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
		const toggleReactionAction = this._reactionActions.add(new ToggleReactionsAction(() => {
			toggleReactionActionViewItem?.show();
		}, nls.localize('commentToggleReaction', "Toggle Reaction")));

		let reactionMenuActions: Action[] = [];
		if (reactionGroup && reactionGroup.length) {
			reactionMenuActions = reactionGroup.map((reaction) => {
				return this._reactionActions.add(new Action(`reaction.command.${reaction.label}`, `${reaction.label}`, '', true, async () => {
					try {
						await this.commentService.toggleReaction(this.owner, this.resource, this.commentThread, this.comment, reaction);
					} catch (e) {
						const error = e.message
							? nls.localize('commentToggleReactionError', "Toggling the comment reaction failed: {0}.", e.message)
							: nls.localize('commentToggleReactionDefaultError', "Toggling the comment reaction failed");
						this.notificationService.error(error);
					}
				}));
			});
		}

		toggleReactionAction.menuActions = reactionMenuActions;

		const toggleReactionActionViewItem: DropdownMenuActionViewItem = this._reactionActions.add(new DropdownMenuActionViewItem(
			toggleReactionAction,
			(<ToggleReactionsAction>toggleReactionAction).menuActions,
			this.contextMenuService,
			{
				actionViewItemProvider: (action, options) => {
					if (action.id === ToggleReactionsAction.ID) {
						return toggleReactionActionViewItem;
					}
					return this.actionViewItemProvider(action as Action, options);
				},
				classNames: 'toolbar-toggle-pickReactions',
				anchorAlignmentProvider: () => AnchorAlignment.RIGHT
			}
		));

		return toggleReactionAction;
	}

	private createReactionsContainer(commentDetailsContainer: HTMLElement): void {
		this._reactionActionsContainer?.remove();
		this._reactionsActionBar.clear();
		this._reactionActions.clear();

		this._reactionActionsContainer = dom.append(commentDetailsContainer, dom.$('div.comment-reactions'));
		this._reactionsActionBar.value = new ActionBar(this._reactionActionsContainer, {
			actionViewItemProvider: (action, options) => {
				if (action.id === ToggleReactionsAction.ID) {
					return new DropdownMenuActionViewItem(
						action,
						(<ToggleReactionsAction>action).menuActions,
						this.contextMenuService,
						{
							actionViewItemProvider: (action, options) => this.actionViewItemProvider(action as Action, options),
							classNames: ['toolbar-toggle-pickReactions', ...ThemeIcon.asClassNameArray(Codicon.reactions)],
							anchorAlignmentProvider: () => AnchorAlignment.RIGHT
						}
					);
				}
				return this.actionViewItemProvider(action as Action, options);
			}
		});

		const hasReactionHandler = this.commentService.hasReactionHandler(this.owner);
		this.comment.commentReactions?.filter(reaction => !!reaction.count).map(reaction => {
			const action = this._reactionActions.add(new ReactionAction(`reaction.${reaction.label}`, `${reaction.label}`, reaction.hasReacted && (reaction.canEdit || hasReactionHandler) ? 'active' : '', (reaction.canEdit || hasReactionHandler), async () => {
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
			}, reaction.reactors, reaction.iconPath, reaction.count));

			this._reactionsActionBar.value?.push(action, { label: true, icon: true });
		});

		if (hasReactionHandler) {
			const toggleReactionAction = this.createReactionPicker(this.comment.commentReactions || []);
			this._reactionsActionBar.value?.push(toggleReactionAction, { label: false, icon: true });
		}
	}

	get commentBodyValue(): string {
		return (typeof this.comment.body === 'string') ? this.comment.body : this.comment.body.value;
	}

	private async createCommentEditor(editContainer: HTMLElement): Promise<void> {
		const container = dom.append(editContainer, dom.$('.edit-textarea'));
		this._commentEditor = this.instantiationService.createInstance(SimpleCommentEditor, container, SimpleCommentEditor.getEditorOptions(this.configurationService), this._contextKeyService, this.parentThread);

		const resource = URI.from({
			scheme: Schemas.commentsInput,
			path: `/commentinput-${this.comment.uniqueIdInThread}-${Date.now()}.md`
		});
		const modelRef = await this.textModelService.createModelReference(resource);
		this._commentEditorModel = modelRef;

		this._commentEditor.setModel(this._commentEditorModel.object.textEditorModel);
		this._commentEditor.setValue(this.pendingEdit?.body ?? this.commentBodyValue);
		if (this.pendingEdit) {
			this._commentEditor.setPosition(this.pendingEdit.cursor);
		} else {
			const lastLine = this._commentEditorModel.object.textEditorModel.getLineCount();
			const lastColumn = this._commentEditorModel.object.textEditorModel.getLineLength(lastLine) + 1;
			this._commentEditor.setPosition(new Position(lastLine, lastColumn));
		}
		this.pendingEdit = undefined;
		this._commentEditor.layout({ width: container.clientWidth - 14, height: this._editorHeight });
		this._commentEditor.focus();

		dom.scheduleAtNextAnimationFrame(dom.getWindow(editContainer), () => {
			this._commentEditor!.layout({ width: container.clientWidth - 14, height: this._editorHeight });
			this._commentEditor!.focus();
		});

		const commentThread = this.commentThread;
		commentThread.input = {
			uri: this._commentEditor.getModel()!.uri,
			value: this.commentBodyValue
		};
		this.commentService.setActiveEditingCommentThread(commentThread);
		this.commentService.setActiveCommentAndThread(this.owner, { thread: commentThread, comment: this.comment });

		this._commentEditorDisposables.push(this._commentEditor.onDidFocusEditorWidget(() => {
			commentThread.input = {
				uri: this._commentEditor!.getModel()!.uri,
				value: this.commentBodyValue
			};
			this.commentService.setActiveEditingCommentThread(commentThread);
			this.commentService.setActiveCommentAndThread(this.owner, { thread: commentThread, comment: this.comment });
		}));

		this._commentEditorDisposables.push(this._commentEditor.onDidChangeModelContent(e => {
			if (commentThread.input && this._commentEditor && this._commentEditor.getModel()!.uri === commentThread.input.uri) {
				const newVal = this._commentEditor.getValue();
				if (newVal !== commentThread.input.value) {
					const input = commentThread.input;
					input.value = newVal;
					commentThread.input = input;
					this.commentService.setActiveEditingCommentThread(commentThread);
					this.commentService.setActiveCommentAndThread(this.owner, { thread: commentThread, comment: this.comment });
				}
			}
		}));

		this.calculateEditorHeight();

		this._register((this._commentEditorModel.object.textEditorModel.onDidChangeContent(() => {
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

	getPendingEdit(): languages.PendingComment | undefined {
		const model = this._commentEditor?.getModel();
		if (this._commentEditor && model && model.getValueLength() > 0) {
			return { body: model.getValue(), cursor: this._commentEditor.getPosition()! };
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

		dispose(this._commentEditorDisposables);
		this._commentEditorDisposables = [];
		this._commentEditor?.dispose();
		this._commentEditor = null;

		this._commentEditContainer!.remove();
	}

	layout(widthInPixel?: number) {
		const editorWidth = widthInPixel !== undefined ? widthInPixel - 72 /* - margin and scrollbar*/ : (this._commentEditor?.getLayoutInfo().width ?? 0);
		this._commentEditor?.layout({ width: editorWidth, height: this._editorHeight });
		const scrollWidth = this._body.scrollWidth;
		const width = dom.getContentWidth(this._body);
		const scrollHeight = this._body.scrollHeight;
		const height = dom.getContentHeight(this._body) + 4;
		this._scrollableElement.setScrollDimensions({ width, scrollWidth, height, scrollHeight });
	}

	public async switchToEditMode() {
		if (this.isEditing) {
			return;
		}

		this.isEditing = true;
		this._body.classList.add('hidden');
		this._commentEditContainer = dom.append(this._commentDetailsContainer, dom.$('.edit-container'));
		await this.createCommentEditor(this._commentEditContainer);

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

		this._commentFormActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, (action: IAction): void => {
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
			this._commentEditorActions?.setActions(menu, true);
		}));

		this._commentEditorActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, (action: IAction): void => {
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
			this._actionsToolbarContainer.classList.add('tabfocused');
			this._domNode.tabIndex = 0;
			if (this.comment.mode === languages.CommentMode.Editing) {
				this._commentEditor?.focus();
			}
		} else {
			if (this._actionsToolbarContainer.classList.contains('tabfocused') && !this._actionsToolbarContainer.classList.contains('mouseover')) {
				this._domNode.tabIndex = -1;
			}
			this._actionsToolbarContainer.classList.remove('tabfocused');
		}
	}

	async update(newComment: languages.Comment) {

		if (newComment.body !== this.comment.body) {
			this.updateCommentBody(newComment.body);
		}

		if (this.comment.userIconPath && newComment.userIconPath && (URI.from(this.comment.userIconPath).toString() !== URI.from(newComment.userIconPath).toString())) {
			this.updateCommentUserIcon(newComment.userIconPath);
		}

		const isChangingMode: boolean = newComment.mode !== undefined && newComment.mode !== this.comment.mode;

		this.comment = newComment;

		if (isChangingMode) {
			if (newComment.mode === languages.CommentMode.Editing) {
				await this.switchToEditMode();
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
		this.createReactionsContainer(this._commentDetailsContainer);

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
		const event = new StandardMouseEvent(dom.getWindow(this._domNode), e);
		this.contextMenuService.showContextMenu({
			getAnchor: () => event,
			menuId: MenuId.CommentThreadCommentContext,
			menuActionOptions: { shouldForwardArgs: true },
			contextKeyService: this._contextKeyService,
			actionRunner: this._actionRunner,
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

	override dispose(): void {
		super.dispose();
		dispose(this._commentEditorDisposables);
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
