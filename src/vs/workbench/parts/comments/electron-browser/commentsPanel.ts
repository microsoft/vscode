/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Panel } from 'vs/workbench/browser/panel';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import * as dom from 'vs/base/browser/dom';
import { WorkbenchTree } from '../../../../platform/list/browser/listService';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { IDataSource, ITree, IRenderer } from 'vs/base/parts/tree/browser/tree';
import { TPromise, Promise } from 'vs/base/common/winjs.base';
import { ICommentService, CommentsModel, ResourceCommentThread, CommentNode } from 'vs/workbench/services/comments/electron-browser/commentService';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import { DefaultAccessibilityProvider, DefaultController, DefaultDragAndDrop, DefaultFilter } from '../../../../base/parts/tree/browser/treeDefaults';

export const COMMENTS_PANEL_ID = 'workbench.panel.comments';
export const COMMENTS_PANEL_TITLE = 'Comments';

export class CommentsDataSource implements IDataSource {
	public getId(tree: ITree, element: any): string {
		if (element instanceof CommentsModel) {
			return 'root';
		}
		if (element instanceof ResourceCommentThread) {
			return element.id;
		}
		if (element instanceof CommentNode) {
			return 'commentNode' + Math.random().toString();
		}
		return '';
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof CommentsModel || element instanceof ResourceCommentThread || (element instanceof CommentNode && element.hasReply());
	}

	public getChildren(tree: ITree, element: any): Promise {
		if (element instanceof CommentsModel) {
			return Promise.as(element.commentThreads);
		}
		if (element instanceof ResourceCommentThread) {
			return Promise.as([element.comments[0]]);
		}
		if (element instanceof CommentNode && element.hasReply()) {
			return Promise.as([element.reply]);
		}
		return null;
	}

	public getParent(tree: ITree, element: any): Promise {
		return TPromise.as(null);
	}

	public shouldAutoexpand(tree: ITree, element: any): boolean {
		return true;
	}
}

export class CommentsModelRenderer implements IRenderer {
	private static COMMENTS_THREAD_ID = 'comments-thread';
	private static COMMENT_ID = 'comment';


	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
	}

	public getHeight(tree: ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: ITree, element: any): string {
		if (element instanceof ResourceCommentThread) {
			return CommentsModelRenderer.COMMENTS_THREAD_ID;
		}
		if (element instanceof CommentNode) {
			return CommentsModelRenderer.COMMENT_ID;
		}

		return '';
	}

	public renderTemplate(ITree: ITree, templateId: string, container: HTMLElement): any {
		switch (templateId) {
			case CommentsModelRenderer.COMMENTS_THREAD_ID:
				return this.renderCommentsThreadTemplate(container);
			case CommentsModelRenderer.COMMENT_ID:
				return this.renderCommentTemplate(container);
		}
	}

	public disposeTemplate(tree: ITree, templateId: string): void {
		// TODO
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		switch (templateId) {
			case CommentsModelRenderer.COMMENTS_THREAD_ID:
				return this.renderCommentsThreadElement(tree, element, templateData);
			case CommentsModelRenderer.COMMENT_ID:
				return this.renderCommentElement(tree, element, templateData);
		}
	}

	private renderCommentsThreadTemplate(container: HTMLElement): IResourceMarkersTemplateData {
		const data = <IResourceMarkersTemplateData>Object.create(null);
		const labelContainer = dom.append(container, dom.$('.comment-thread-container'));
		data.resourceLabel = this.instantiationService.createInstance(ResourceLabel, labelContainer, {});

		return data;
	}

	private renderCommentTemplate(container: HTMLElement): IResourceMarkersTemplateData {
		const data = <IResourceMarkersTemplateData>Object.create(null);
		const labelContainer = dom.append(container, dom.$('.comment-container'));
		data.resourceLabel = this.instantiationService.createInstance(ResourceLabel, labelContainer, {});

		return data;
	}

	private renderCommentsThreadElement(tree: ITree, element: ResourceCommentThread, templateData: IResourceMarkersTemplateData) {
		templateData.resourceLabel.setLabel({ name: element.id });
	}

	private renderCommentElement(tree: ITree, element: CommentNode, templateData: IResourceMarkersTemplateData) {
		templateData.resourceLabel.setLabel({ name: element.comment.body.value });
	}
}

interface IResourceMarkersTemplateData {
	resourceLabel: ResourceLabel;
}
export class CommentsPanel extends Panel {
	private tree: WorkbenchTree;
	private treeContainer: HTMLElement;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICommentService private commentService: ICommentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
	) {
		super(COMMENTS_PANEL_ID, telemetryService, themeService);
	}

	public create(parent: HTMLElement): TPromise<void> {
		super.create(parent);

		dom.addClass(parent, 'markers-panel');

		let container = dom.append(parent, dom.$('.markers-panel-container'));
		this.treeContainer = dom.append(container, dom.$('.tree-container'));

		this.createTree();

		this.commentService.onDidChangeCommentThreads(this.onCommentThreadChanged, this);

		return this.render();
	}

	private onCommentThreadChanged() {
		this.tree.refresh().then(() => {
			console.log('tree refreshed');
		}, (e) => {
			console.log(e);
		});
	}

	private render(): TPromise<void> {
		dom.toggleClass(this.treeContainer, 'hidden', false);
		console.log(this.commentService.commentsModel);
		return this.tree.setInput(this.commentService.commentsModel);
	}

	public layout(dimensions: dom.Dimension): void {
		this.tree.layout(dimensions.height, dimensions.width);
	}

	public getTitle(): string {
		return COMMENTS_PANEL_TITLE;
	}

	private createTree(): void {
		this.tree = this.instantiationService.createInstance(WorkbenchTree, this.treeContainer, {
			dataSource: new CommentsDataSource(),
			renderer: new CommentsModelRenderer(this.instantiationService),
			accessibilityProvider: new DefaultAccessibilityProvider,
			controller: new DefaultController(),
			dnd: new DefaultDragAndDrop(),
			filter: new DefaultFilter()
		}, {
				twistiePixels: 20,
				ariaLabel: COMMENTS_PANEL_TITLE
			});
	}
}
