/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panel';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { basename } from 'vs/base/common/resources';
import { isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { CommentNode, CommentsModel, ResourceWithCommentThreads, ICommentThreadChangedEvent } from 'vs/workbench/contrib/comments/common/commentModel';
import { CommentController } from 'vs/workbench/contrib/comments/browser/commentsEditorContribution';
import { IWorkspaceCommentThreadsEvent, ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { IEditorService, ACTIVE_GROUP, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { textLinkForeground, textLinkActiveForeground, focusBorder, textPreformatForeground } from 'vs/platform/theme/common/colorRegistry';
import { ResourceLabels } from 'vs/workbench/browser/labels';
import { CommentsList, COMMENTS_VIEW_ID, COMMENTS_VIEW_TITLE, Filter } from 'vs/workbench/contrib/comments/browser/commentsTreeViewer';
import { ViewPane, IViewPaneOptions, ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewDescriptorService, IViewsService } from 'vs/workbench/common/views';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { IEditor } from 'vs/editor/common/editorCommon';
import { TextModel } from 'vs/editor/common/model/textModel';
import { Action, IAction } from 'vs/base/common/actions';
import { ActionBar, IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { CommentsViewSmallLayoutContextKey, ICommentsView } from 'vs/workbench/contrib/comments/browser/comments';
import { CommentsFilterActionViewItem, CommentsFilters, CommentsFiltersChangeEvent } from 'vs/workbench/contrib/comments/browser/commentsViewActions';
import { Event, Emitter } from 'vs/base/common/event';
import { Memento, MementoObject } from 'vs/workbench/common/memento';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { FilterOptions } from 'vs/workbench/contrib/comments/browser/commentsFilterOptions';

const CONTEXT_KEY_HAS_COMMENTS = new RawContextKey<boolean>('commentsView.hasComments', false);
const VIEW_STORAGE_ID = 'commentsViewState';

export class CommentsPanel extends ViewPane implements ICommentsView {
	private treeLabels!: ResourceLabels;
	private tree: CommentsList | undefined;
	private treeContainer!: HTMLElement;
	private messageBoxContainer!: HTMLElement;
	private commentsModel!: CommentsModel;
	private totalComments: number = 0;
	private readonly hasCommentsContextKey: IContextKey<boolean>;
	private readonly smallLayoutContextKey: IContextKey<boolean>;
	private readonly filter: Filter;
	readonly filters: CommentsFilters;
	private filterActionBar: ActionBar | undefined;

	private currentHeight = 0;
	private currentWidth = 0;
	private readonly viewState: MementoObject;
	private readonly stateMemento: Memento;
	private cachedFilterStats: { total: number; filtered: number } | undefined = undefined;

	readonly onDidChangeVisibility = this.onDidChangeBodyVisibility;

	private readonly _onDidFocusFilter: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidFocusFilter: Event<void> = this._onDidFocusFilter.event;
	private readonly _onDidClearFilterText: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidClearFilterText: Event<void> = this._onDidClearFilterText.event;
	private _onDidChangeFilterStats = this._register(new Emitter<{ total: number; filtered: number }>());
	readonly onDidChangeFilterStats: Event<{ total: number; filtered: number }> = this._onDidChangeFilterStats.event;

	constructor(
		options: IViewPaneOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ICommentService private readonly commentService: ICommentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IStorageService readonly storageService: IStorageService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);
		this.hasCommentsContextKey = CONTEXT_KEY_HAS_COMMENTS.bindTo(contextKeyService);
		this.smallLayoutContextKey = CommentsViewSmallLayoutContextKey.bindTo(this.contextKeyService);
		this.stateMemento = new Memento(VIEW_STORAGE_ID, storageService);
		this.viewState = this.stateMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.USER);

		this.filters = this._register(new CommentsFilters({
			filterText: this.viewState['filter'] || '',
			filterHistory: this.viewState['filterHistory'] || [],
			showResolved: this.viewState['showResolved'] !== false,
			showUnresolved: this.viewState['showUnresolved'] !== false,
			layout: new dom.Dimension(0, 0)
		}));
		this.filter = new Filter(new FilterOptions(this.filters.filterText, this.filters.showResolved, this.filters.showUnresolved));

		this._register(this.commentService.onDidSetAllCommentThreads(e => {
			this.totalComments = e.commentThreads.length;
		}));

		this._register(this.commentService.onDidUpdateCommentThreads(e => {
			this.totalComments += e.added.length;
			this.totalComments -= e.removed.length;
		}));

		this._register(this.filters.onDidChange((event: CommentsFiltersChangeEvent) => {
			if (event.filterText || event.showResolved || event.showUnresolved) {
				this.updateFilter();
			}
		}));
	}

	override saveState(): void {
		this.viewState['filter'] = this.filters.filterText;
		this.viewState['filterHistory'] = this.filters.filterHistory;
		this.viewState['showResolved'] = this.filters.showResolved;
		this.viewState['showUnresolved'] = this.filters.showUnresolved;
		this.stateMemento.saveMemento();
		super.saveState();
	}

	public focusFilter(): void {
		this._onDidFocusFilter.fire();
	}

	public clearFilterText(): void {
		this._onDidClearFilterText.fire();
	}

	public getFilterStats(): { total: number; filtered: number } {
		if (!this.cachedFilterStats) {
			this.cachedFilterStats = {
				total: this.totalComments,
				filtered: this.tree?.getVisibleItemCount() ?? 0
			};
		}

		return this.cachedFilterStats;
	}

	private updateFilter() {
		this.filter.options = new FilterOptions(this.filters.filterText, this.filters.showResolved, this.filters.showUnresolved);
		this.tree?.filterComments();

		this.cachedFilterStats = undefined;
		this._onDidChangeFilterStats.fire(this.getFilterStats());
	}

	private createFilterActionBar(parent: HTMLElement): void {
		this.filterActionBar = this._register(new ActionBar(parent, { actionViewItemProvider: action => this.getActionViewItem(action) }));
		this.filterActionBar.getContainer().classList.add('comments-panel-filter-container');
		this.filterActionBar.getContainer().classList.toggle('hide', !this.smallLayout);
	}

	private get smallLayout(): boolean { return !!this.smallLayoutContextKey.get(); }
	private set smallLayout(smallLayout: boolean) { this.smallLayoutContextKey.set(smallLayout); }

	public override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		container.classList.add('comments-panel');

		const domContainer = dom.append(container, dom.$('.comments-panel-container'));
		this.createFilterActionBar(domContainer);
		this.filterActionBar!.push(new Action(`workbench.actions.treeView.${this.id}.filter`));

		this.treeContainer = dom.append(domContainer, dom.$('.tree-container'));
		this.treeContainer.classList.add('file-icon-themable-tree', 'show-file-icons');
		this.commentsModel = new CommentsModel();

		this.cachedFilterStats = undefined;
		this.createTree();
		this.createMessageBox(domContainer);

		this._register(this.commentService.onDidSetAllCommentThreads(this.onAllCommentsChanged, this));
		this._register(this.commentService.onDidUpdateCommentThreads(this.onCommentsUpdated, this));

		const styleElement = dom.createStyleSheet(container);
		this.applyStyles(styleElement);
		this._register(this.themeService.onDidColorThemeChange(_ => this.applyStyles(styleElement)));

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				this.refresh();
			}
		}));

		this.renderComments();
	}

	public override focus(): void {
		if (this.tree && this.tree.getHTMLElement() === document.activeElement) {
			return;
		}

		if (!this.commentsModel.hasCommentThreads() && this.messageBoxContainer) {
			this.messageBoxContainer.focus();
		} else if (this.tree) {
			this.tree.domFocus();
		}
	}

	private applyStyles(styleElement: HTMLStyleElement) {
		const content: string[] = [];

		const theme = this.themeService.getColorTheme();
		const linkColor = theme.getColor(textLinkForeground);
		if (linkColor) {
			content.push(`.comments-panel .comments-panel-container a { color: ${linkColor}; }`);
		}

		const linkActiveColor = theme.getColor(textLinkActiveForeground);
		if (linkActiveColor) {
			content.push(`.comments-panel .comments-panel-container a:hover, a:active { color: ${linkActiveColor}; }`);
		}

		const focusColor = theme.getColor(focusBorder);
		if (focusColor) {
			content.push(`.comments-panel .comments-panel-container a:focus { outline-color: ${focusColor}; }`);
		}

		const codeTextForegroundColor = theme.getColor(textPreformatForeground);
		if (codeTextForegroundColor) {
			content.push(`.comments-panel .comments-panel-container .text code { color: ${codeTextForegroundColor}; }`);
		}

		styleElement.textContent = content.join('\n');
	}

	private async renderComments(): Promise<void> {
		this.treeContainer.classList.toggle('hidden', !this.commentsModel.hasCommentThreads());
		this.renderMessage();
		await this.tree?.setInput(this.commentsModel);
	}

	public collapseAll() {
		if (this.tree) {
			this.tree.collapseAll();
			this.tree.setSelection([]);
			this.tree.setFocus([]);
			this.tree.domFocus();
			this.tree.focusFirst();
		}
	}

	public get hasRendered(): boolean {
		return !!this.tree;
	}

	public override layoutBody(height: number = this.currentHeight, width: number = this.currentWidth): void {
		super.layoutBody(height, width);
		const wasSmallLayout = this.smallLayout;
		this.smallLayout = width < 600 && height > 100;
		if (this.smallLayout !== wasSmallLayout) {
			this.filterActionBar?.getContainer().classList.toggle('hide', !this.smallLayout);
		}
		const contentHeight = this.smallLayout ? height - 44 : height;
		if (this.messageBoxContainer) {
			this.messageBoxContainer.style.height = `${contentHeight}px`;
		}
		this.tree?.layout(contentHeight, width);
		this.filters.layout = new dom.Dimension(this.smallLayout ? width : width - 200, height);

		this.currentHeight = height;
		this.currentWidth = width;
	}

	private createMessageBox(parent: HTMLElement): void {
		this.messageBoxContainer = dom.append(parent, dom.$('.message-box-container'));
		this.messageBoxContainer.setAttribute('tabIndex', '0');
	}

	private renderMessage(): void {
		this.messageBoxContainer.textContent = this.commentsModel.getMessage();
		this.messageBoxContainer.classList.toggle('hidden', this.commentsModel.hasCommentThreads());
	}

	private createTree(): void {
		this.treeLabels = this._register(this.instantiationService.createInstance(ResourceLabels, this));
		this.tree = this._register(this.instantiationService.createInstance(CommentsList, this.treeLabels, this.treeContainer, {
			overrideStyles: { listBackground: this.getBackgroundColor() },
			selectionNavigation: true,
			filter: this.filter,
			keyboardNavigationLabelProvider: {
				getKeyboardNavigationLabel: (item: CommentsModel | ResourceWithCommentThreads | CommentNode) => {
					return undefined;
				}
			},
			accessibilityProvider: {
				getAriaLabel(element: any): string {
					if (element instanceof CommentsModel) {
						return nls.localize('rootCommentsLabel', "Comments for current workspace");
					}
					if (element instanceof ResourceWithCommentThreads) {
						return nls.localize('resourceWithCommentThreadsLabel', "Comments in {0}, full path {1}", basename(element.resource), element.resource.fsPath);
					}
					if (element instanceof CommentNode) {
						return nls.localize('resourceWithCommentLabel',
							"Comment from ${0} at line {1} column {2} in {3}, source: {4}",
							element.comment.userName,
							element.range.startLineNumber,
							element.range.startColumn,
							basename(element.resource),
							(typeof element.comment.body === 'string') ? element.comment.body : element.comment.body.value
						);
					}
					return '';
				},
				getWidgetAriaLabel(): string {
					return COMMENTS_VIEW_TITLE;
				}
			}
		}));

		this._register(this.tree.onDidOpen(e => {
			this.openFile(e.element, e.editorOptions.pinned, e.editorOptions.preserveFocus, e.sideBySide);
		}));
		this._register(this.tree?.onDidChangeModel(() => {
			this.cachedFilterStats = undefined;
			this.updateFilter();
		}));
	}

	private openFile(element: any, pinned?: boolean, preserveFocus?: boolean, sideBySide?: boolean): boolean {
		if (!element) {
			return false;
		}

		if (!(element instanceof ResourceWithCommentThreads || element instanceof CommentNode)) {
			return false;
		}

		if (!this.commentService.isCommentingEnabled) {
			this.commentService.enableCommenting(true);
		}

		const range = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].range : element.range;

		const activeEditor = this.editorService.activeTextEditorControl;
		// If the active editor is a diff editor where one of the sides has the comment,
		// then we try to reveal the comment in the diff editor.
		const currentActiveResources: IEditor[] = isDiffEditor(activeEditor) ? [activeEditor.getOriginalEditor(), activeEditor.getModifiedEditor()]
			: (activeEditor ? [activeEditor] : []);

		for (const editor of currentActiveResources) {
			const model = editor.getModel();
			if ((model instanceof TextModel) && this.uriIdentityService.extUri.isEqual(element.resource, model.uri)) {
				const threadToReveal = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].threadId : element.threadId;
				const commentToReveal = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].comment.uniqueIdInThread : element.comment.uniqueIdInThread;
				if (threadToReveal && isCodeEditor(editor)) {
					const controller = CommentController.get(editor);
					controller?.revealCommentThread(threadToReveal, commentToReveal, true);
				}

				return true;
			}
		}

		const threadToReveal = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].threadId : element.threadId;
		const commentToReveal = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].comment : element.comment;

		this.editorService.openEditor({
			resource: element.resource,
			options: {
				pinned: pinned,
				preserveFocus: preserveFocus,
				selection: range
			}
		}, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then(editor => {
			if (editor) {
				const control = editor.getControl();
				if (threadToReveal && isCodeEditor(control)) {
					const controller = CommentController.get(control);
					controller?.revealCommentThread(threadToReveal, commentToReveal.uniqueIdInThread, true);
				}
			}
		});

		return true;
	}

	private async refresh(): Promise<void> {
		if (!this.tree) {
			return;
		}
		if (this.isVisible()) {
			this.hasCommentsContextKey.set(this.commentsModel.hasCommentThreads());

			this.treeContainer.classList.toggle('hidden', !this.commentsModel.hasCommentThreads());
			this.cachedFilterStats = undefined;
			this.renderMessage();
			await this.tree.updateChildren();

			if (this.tree.getSelection().length === 0 && this.commentsModel.hasCommentThreads()) {
				const firstComment = this.commentsModel.resourceCommentThreads[0].commentThreads[0];
				if (firstComment) {
					this.tree.setFocus([firstComment]);
					this.tree.setSelection([firstComment]);
				}
			}
		}
	}

	private onAllCommentsChanged(e: IWorkspaceCommentThreadsEvent): void {
		this.commentsModel.setCommentThreads(e.ownerId, e.commentThreads);
		this.refresh();
	}

	private onCommentsUpdated(e: ICommentThreadChangedEvent): void {
		const didUpdate = this.commentsModel.updateCommentThreads(e);
		if (didUpdate) {
			this.refresh();
		}
	}

	public override getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === `workbench.actions.treeView.${this.id}.filter`) {
			return this.instantiationService.createInstance(CommentsFilterActionViewItem, action, this);
		}
		return super.getActionViewItem(action);
	}
}

CommandsRegistry.registerCommand({
	id: 'workbench.action.focusCommentsPanel',
	handler: async (accessor) => {
		const viewsService = accessor.get(IViewsService);
		viewsService.openView(COMMENTS_VIEW_ID, true);
	}
});

registerAction2(class Collapse extends ViewAction<CommentsPanel> {
	constructor() {
		super({
			viewId: COMMENTS_VIEW_ID,
			id: 'comments.collapse',
			title: nls.localize('collapseAll', "Collapse All"),
			f1: false,
			icon: Codicon.collapseAll,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', COMMENTS_VIEW_ID), CONTEXT_KEY_HAS_COMMENTS),
				order: 100
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: CommentsPanel) {
		view.collapseAll();
	}
});
