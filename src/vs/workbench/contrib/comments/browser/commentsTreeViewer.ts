/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import * as nls from 'vs/nls';
import { renderMarkdown } from 'vs/base/browser/htmlContentRenderer';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IDataSource, IFilter, IRenderer as ITreeRenderer, ITree } from 'vs/base/parts/tree/browser/tree';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { CommentNode, CommentsModel, ResourceWithCommentThreads } from 'vs/workbench/contrib/comments/common/commentModel';

export class CommentsDataSource implements IDataSource {
	public getId(tree: ITree, element: any): string {
		if (element instanceof CommentsModel) {
			return 'root';
		}
		if (element instanceof ResourceWithCommentThreads) {
			return `${element.owner}-${element.id}`;
		}
		if (element instanceof CommentNode) {
			return `${element.owner}-${element.resource.toString()}-${element.threadId}-${element.comment.uniqueIdInThread}` + (element.isRoot ? '-root' : '');
		}
		return '';
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof CommentsModel || element instanceof ResourceWithCommentThreads || (element instanceof CommentNode && !!element.replies.length);
	}

	public getChildren(tree: ITree, element: any): Promise<ResourceWithCommentThreads[] | CommentNode[]> {
		if (element instanceof CommentsModel) {
			return Promise.resolve(element.resourceCommentThreads);
		}
		if (element instanceof ResourceWithCommentThreads) {
			return Promise.resolve(element.commentThreads);
		}
		if (element instanceof CommentNode) {
			return Promise.resolve(element.replies);
		}
		return Promise.resolve([]);
	}

	public getParent(tree: ITree, element: any): Promise<void> {
		return Promise.resolve(undefined);
	}

	public shouldAutoexpand(tree: ITree, element: any): boolean {
		return true;
	}
}

interface IResourceTemplateData {
	resourceLabel: IResourceLabel;
}

interface ICommentThreadTemplateData {
	icon: HTMLImageElement;
	userName: HTMLSpanElement;
	commentText: HTMLElement;
	disposables: IDisposable[];
}

export class CommentsModelRenderer implements ITreeRenderer {
	private static RESOURCE_ID = 'resource-with-comments';
	private static COMMENT_ID = 'comment-node';

	constructor(
		private labels: ResourceLabels,
		@IOpenerService private readonly openerService: IOpenerService
	) {
	}

	public getHeight(tree: ITree, element: any): number {
		return 22;
	}

	public getTemplateId(tree: ITree, element: any): string {
		if (element instanceof ResourceWithCommentThreads) {
			return CommentsModelRenderer.RESOURCE_ID;
		}
		if (element instanceof CommentNode) {
			return CommentsModelRenderer.COMMENT_ID;
		}

		return '';
	}

	public renderTemplate(ITree: ITree, templateId: string, container: HTMLElement): any {
		switch (templateId) {
			case CommentsModelRenderer.RESOURCE_ID:
				return this.renderResourceTemplate(container);
			case CommentsModelRenderer.COMMENT_ID:
				return this.renderCommentTemplate(container);
		}
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		switch (templateId) {
			case CommentsModelRenderer.RESOURCE_ID:
				(<IResourceTemplateData>templateData).resourceLabel.dispose();
				break;
			case CommentsModelRenderer.COMMENT_ID:
				(<ICommentThreadTemplateData>templateData).disposables.forEach(disposeable => disposeable.dispose());
				break;
		}
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		switch (templateId) {
			case CommentsModelRenderer.RESOURCE_ID:
				return this.renderResourceElement(tree, element, templateData);
			case CommentsModelRenderer.COMMENT_ID:
				return this.renderCommentElement(tree, element, templateData);
		}
	}

	private renderResourceTemplate(container: HTMLElement): IResourceTemplateData {
		const data = <IResourceTemplateData>Object.create(null);
		const labelContainer = dom.append(container, dom.$('.resource-container'));
		data.resourceLabel = this.labels.create(labelContainer);

		return data;
	}

	private renderCommentTemplate(container: HTMLElement): ICommentThreadTemplateData {
		const data = <ICommentThreadTemplateData>Object.create(null);
		const labelContainer = dom.append(container, dom.$('.comment-container'));
		data.userName = dom.append(labelContainer, dom.$('.user'));
		data.commentText = dom.append(labelContainer, dom.$('.text'));
		data.disposables = [];

		return data;
	}

	private renderResourceElement(tree: ITree, element: ResourceWithCommentThreads, templateData: IResourceTemplateData) {
		templateData.resourceLabel.setFile(element.resource);
	}

	private renderCommentElement(tree: ITree, element: CommentNode, templateData: ICommentThreadTemplateData) {
		templateData.userName.textContent = element.comment.userName;
		templateData.commentText.innerHTML = '';
		const disposables = new DisposableStore();
		templateData.disposables.push(disposables);
		const renderedComment = renderMarkdown(element.comment.body, {
			inline: true,
			actionHandler: {
				callback: (content) => {
					try {
						const uri = URI.parse(content);
						this.openerService.open(uri).catch(onUnexpectedError);
					} catch (err) {
						// ignore
					}
				},
				disposeables: disposables
			}
		});

		const images = renderedComment.getElementsByTagName('img');
		for (let i = 0; i < images.length; i++) {
			const image = images[i];
			const textDescription = dom.$('');
			textDescription.textContent = image.alt ? nls.localize('imageWithLabel', "Image: {0}", image.alt) : nls.localize('image', "Image");
			image.parentNode!.replaceChild(textDescription, image);
		}

		templateData.commentText.appendChild(renderedComment);
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
