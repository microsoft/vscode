/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IDelegate, IRenderer as ListRenderer } from 'vs/base/browser/ui/list/list';
import { flatten } from 'vs/base/common/arrays';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { IDataSource, IFilter, IRenderer as ITreeRenderer, ITree } from 'vs/base/parts/tree/browser/tree';
import { Comment, CommentThread } from 'vs/editor/common/modes';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { FileLabel, ResourceLabel } from 'vs/workbench/browser/labels';
import { CommentsModel, ResourceWithCommentThreads, instanceOfCommentThread } from 'vs/workbench/parts/comments/common/commentModel';

export class CommentsDataSource implements IDataSource {
	public getId(tree: ITree, element: any): string {
		if (element instanceof CommentsModel) {
			return 'root';
		}
		if (element instanceof ResourceWithCommentThreads) {
			return element.id;
		}
		if (instanceOfCommentThread(element)) {
			return element.threadId;
		}
		return '';
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof CommentsModel || element instanceof ResourceWithCommentThreads;
	}

	public getChildren(tree: ITree, element: any): Promise {
		if (element instanceof CommentsModel) {
			return Promise.as(element.resourceCommentThreads);
		}
		if (element instanceof ResourceWithCommentThreads) {
			return Promise.as(element.commentThreads);
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

export interface ICommentTemplateData {
	comment: HTMLElement;
	icon: HTMLImageElement;
	userName: HTMLSpanElement;
	text: HTMLElement;
}

export class CommentRenderer implements ListRenderer<Comment, ICommentTemplateData> {

	get templateId() {
		return 'comment';
	}

	renderTemplate(container: HTMLElement): ICommentTemplateData {
		const data: ICommentTemplateData = Object.create(null);
		data.comment = dom.append(container, dom.$('.comment'));
		data.userName = dom.append(data.comment, dom.$('.user'));
		data.text = dom.append(data.comment, dom.$('.text'));

		return data;
	}

	renderElement(comment: Comment, index: number, data: ICommentTemplateData): void {
		data.userName.textContent = comment.userName;
		data.text.textContent = comment.body.value;
	}

	disposeTemplate(templateData) {
		// no op
	}
}

export class Delegate implements IDelegate<Comment> {
	getHeight() { return 22; }
	getTemplateId() { return 'comment'; }
}

interface IResourceTemplateData {
	resourceLabel: FileLabel;
	count: CountBadge;
	styler: IDisposable;
}

interface ICommentThreadTemplateData {
	icon: HTMLImageElement;
	resourceLabel: ResourceLabel;
	userName: HTMLSpanElement;
	comments: WorkbenchList<Comment>;
}

export class CommentsModelRenderer implements ITreeRenderer {
	private static RESOURCE_ID = 'resource-comments-thread';
	private static COMMENT_THREAD_ID = 'comments-thread';


	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService
	) {
	}

	public getHeight(tree: ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: ITree, element: any): string {
		if (element instanceof ResourceWithCommentThreads) {
			return CommentsModelRenderer.RESOURCE_ID;
		}
		if (instanceOfCommentThread(element)) {
			return CommentsModelRenderer.COMMENT_THREAD_ID;
		}

		return '';
	}

	public renderTemplate(ITree: ITree, templateId: string, container: HTMLElement): any {
		switch (templateId) {
			case CommentsModelRenderer.RESOURCE_ID:
				return this.renderResourceTemplate(container);
			case CommentsModelRenderer.COMMENT_THREAD_ID:
				return this.renderCommentThreadTemplate(container);
		}
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		switch (templateId) {
			case CommentsModelRenderer.RESOURCE_ID:
				(<IResourceTemplateData>templateData).resourceLabel.dispose();
				(<IResourceTemplateData>templateData).styler.dispose();
			case CommentsModelRenderer.COMMENT_THREAD_ID:
				(<ICommentThreadTemplateData>templateData).comments.dispose();
		}
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		switch (templateId) {
			case CommentsModelRenderer.RESOURCE_ID:
				return this.renderResourceElement(tree, element, templateData);
			case CommentsModelRenderer.COMMENT_THREAD_ID:
				return this.renderCommentThreadElement(tree, element, templateData);
		}
	}

	private renderResourceTemplate(container: HTMLElement): IResourceTemplateData {
		const data = <IResourceTemplateData>Object.create(null);
		const labelContainer = dom.append(container, dom.$('.comment-thread-container'));
		data.resourceLabel = this.instantiationService.createInstance(FileLabel, labelContainer, {});

		const badgeWrapper = dom.append(labelContainer, dom.$('.count-badge-wrapper'));
		data.count = new CountBadge(badgeWrapper);
		data.styler = attachBadgeStyler(data.count, this.themeService);

		return data;
	}

	private renderCommentThreadTemplate(container: HTMLElement): ICommentThreadTemplateData {
		const data = <ICommentThreadTemplateData>Object.create(null);

		const commentList = dom.append(container, dom.$('.comment-list'));
		const delegate = new Delegate();
		const renderer = this.instantiationService.createInstance(CommentRenderer);
		data.comments = this.instantiationService.createInstance(WorkbenchList, commentList, delegate, [renderer], {}) as WorkbenchList<Comment>;

		return data;
	}

	private renderResourceElement(tree: ITree, element: ResourceWithCommentThreads, templateData: IResourceTemplateData) {
		templateData.resourceLabel.setFile(element.resource);
		const allComments = flatten(element.commentThreads.map(thread => thread.comments));
		templateData.count.setCount(allComments.length);
	}

	private renderCommentThreadElement(tree: ITree, element: CommentThread, templateData: ICommentThreadTemplateData) {
		templateData.comments.splice(0, templateData.comments.length, element.comments);
		templateData.comments.layout(500);
	}
}

export class CommentsDataFilter implements IFilter {
	public isVisible(tree: ITree, element: any): boolean {
		if (element instanceof CommentsModel) {
			return element.resourceCommentThreads.length > 0;
		}
		if (element instanceof ResourceWithCommentThreads) {
			return element.commentThreads.length > 0;
		}
		return true;
	}
}
