/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panel';
import * as dom from 'vs/base/browser/dom';
import { IAction } from 'vs/base/common/actions';
import { debounceEvent } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { CollapseAllAction, DefaultAccessibilityProvider, DefaultController, DefaultDragAndDrop } from 'vs/base/parts/tree/browser/treeDefaults';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { CommentThread, CommentThreadChangedEvent } from 'vs/editor/common/modes';
import { localize } from 'vs/nls';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TreeResourceNavigator, WorkbenchTree } from 'vs/platform/list/browser/listService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Panel } from 'vs/workbench/browser/panel';
import { CommentNode, CommentsModel, ResourceWithCommentThreads } from 'vs/workbench/parts/comments/common/commentModel';
import { ReviewController } from 'vs/workbench/parts/comments/electron-browser/commentsEditorContribution';
import { CommentsDataFilter, CommentsDataSource, CommentsModelRenderer } from 'vs/workbench/parts/comments/electron-browser/commentsTreeViewer';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { ICommentService } from 'vs/workbench/services/comments/electron-browser/commentService';

export const COMMENTS_PANEL_ID = 'workbench.panel.comments';
export const COMMENTS_PANEL_TITLE = 'Comments';

export class CommentsPanel extends Panel {
	private tree: WorkbenchTree;
	private treeContainer: HTMLElement;
	private messageBoxContainer: HTMLElement;
	private messageBox: HTMLElement;
	private commentsModel: CommentsModel;
	private collapseAllAction: IAction;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICommentService private commentService: ICommentService,
		@IEditorService private editorService: IEditorService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IActivityService private activityService: IActivityService
	) {
		super(COMMENTS_PANEL_ID, telemetryService, themeService);
	}

	public create(parent: HTMLElement): TPromise<void> {
		super.create(parent);

		dom.addClass(parent, 'comments-panel');

		let container = dom.append(parent, dom.$('.comments-panel-container'));
		this.treeContainer = dom.append(container, dom.$('.tree-container'));
		this.commentsModel = new CommentsModel();

		this.createTree();
		this.createMessageBox(container);

		this.commentService.onDidSetAllCommentThreads(this.onAllCommentsChanged, this);
		this.commentService.onDidUpdateCommentThreads(this.onCommentsUpdated, this);

		return this.render();
	}

	private render(): TPromise<void> {
		dom.toggleClass(this.treeContainer, 'hidden', !this.commentsModel.hasCommentThreads());
		return this.tree.setInput(this.commentsModel).then(() => {
			this.renderMessage();
		});
	}

	public getActions(): IAction[] {
		if (!this.collapseAllAction) {
			this.collapseAllAction = this.instantiationService.createInstance(CollapseAllAction, this.tree, this.commentsModel.hasCommentThreads());
			this.toUnbind.push(this.collapseAllAction);
		}

		return [this.collapseAllAction];
	}

	public layout(dimensions: dom.Dimension): void {
		this.tree.layout(dimensions.height, dimensions.width);
	}

	public getTitle(): string {
		return COMMENTS_PANEL_TITLE;
	}

	private createMessageBox(parent: HTMLElement): void {
		this.messageBoxContainer = dom.append(parent, dom.$('.message-box-container'));
		this.messageBox = dom.append(this.messageBoxContainer, dom.$('span'));
		this.messageBox.setAttribute('tabindex', '0');
	}

	private renderMessage(): void {
		this.messageBox.textContent = this.commentsModel.getMessage();
		dom.toggleClass(this.messageBoxContainer, 'hidden', this.commentsModel.hasCommentThreads());
	}

	private createTree(): void {
		this.tree = this.instantiationService.createInstance(WorkbenchTree, this.treeContainer, {
			dataSource: new CommentsDataSource(),
			renderer: new CommentsModelRenderer(this.instantiationService, this.themeService),
			accessibilityProvider: new DefaultAccessibilityProvider,
			controller: new DefaultController(),
			dnd: new DefaultDragAndDrop(),
			filter: new CommentsDataFilter()
		}, {
				twistiePixels: 20,
				ariaLabel: COMMENTS_PANEL_TITLE
			});

		const commentsNavigator = this._register(new TreeResourceNavigator(this.tree, { openOnFocus: true }));
		this._register(debounceEvent(commentsNavigator.openResource, (last, event) => event, 100, true)(options => {
			this.openFile(options.element, options.editorOptions.pinned, options.sideBySide);
		}));
	}

	private openFile(element: any, pinned: boolean, sideBySide: boolean): boolean {
		if (!element) {
			return false;
		}

		if (!(element instanceof ResourceWithCommentThreads || element instanceof CommentNode)) {
			return false;
		}

		const range = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].range : element.range;
		this.editorService.openEditor({ resource: element.resource, options: { pinned: pinned, selection: range } }, sideBySide)
			.done(editor => {
				// If clicking on the file name, open the first comment thread. If clicking on a comment, open its thread
				const threadToReveal = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].threadId : element.threadId;
				const control = editor.getControl();
				if (threadToReveal && isCodeEditor(control)) {
					const controller = ReviewController.get(control);
					// FIX there is a race between revealing the thread and the widget being created?
					controller.revealCommentThread(threadToReveal);
				}
			});

		return true;
	}

	private refresh(): void {
		if (this.isVisible()) {
			this.updateBadge();
			this.collapseAllAction.enabled = this.commentsModel.hasCommentThreads();

			dom.toggleClass(this.treeContainer, 'hidden', !this.commentsModel.hasCommentThreads());
			this.tree.refresh().then(() => {
				this.renderMessage();
			}, (e) => {
				console.log(e);
			});
		}
	}

	private onAllCommentsChanged(e: CommentThread[]): void {
		this.commentsModel.setCommentThreads(e);
		this.refresh();
	}

	private onCommentsUpdated(e: CommentThreadChangedEvent): void {
		this.commentsModel.updateCommentThreads(e);
		this.refresh();
	}

	private updateBadge(): void {
		const total = this.commentsModel.getCommentsCount();
		const message = localize('totalComments', 'Total {0} Comments', total);
		this.activityService.showActivity(COMMENTS_PANEL_ID, new NumberBadge(total, () => message));
	}
}
