/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import * as nls from 'vs/nls';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { CommentNode, CommentsModel, ResourceWithCommentThreads } from 'vs/workbench/contrib/comments/common/commentModel';
import { ITreeFilter, ITreeNode, TreeFilterResult, TreeVisibility } from 'vs/base/browser/ui/tree/tree';
import { IListVirtualDelegate, IListRenderer } from 'vs/base/browser/ui/list/list';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IListService, IWorkbenchAsyncDataTreeOptions, WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TimestampWidget } from 'vs/workbench/contrib/comments/browser/timestamp';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { commentViewThreadStateColorVar, getCommentThreadStateIconColor } from 'vs/workbench/contrib/comments/browser/commentColors';
import { CommentThreadState } from 'vs/editor/common/languages';
import { Color } from 'vs/base/common/color';
import { IMatch } from 'vs/base/common/filters';
import { FilterOptions } from 'vs/workbench/contrib/comments/browser/commentsFilterOptions';
import { basename } from 'vs/base/common/resources';
import { openLinkFromMarkdown } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { IStyleOverride } from 'vs/platform/theme/browser/defaultStyles';
import { IListStyles } from 'vs/base/browser/ui/list/listWidget';

export const COMMENTS_VIEW_ID = 'workbench.panel.comments';
export const COMMENTS_VIEW_STORAGE_ID = 'Comments';
export const COMMENTS_VIEW_ORIGINAL_TITLE = 'Comments';
export const COMMENTS_VIEW_TITLE = nls.localize('comments.view.title', "Comments");

interface IResourceTemplateData {
	resourceLabel: IResourceLabel;
}

interface ICommentThreadTemplateData {
	threadMetadata: {
		icon: HTMLElement;
		userNames: HTMLSpanElement;
		timestamp: TimestampWidget;
		separator: HTMLElement;
		commentPreview: HTMLSpanElement;
		range: HTMLSpanElement;
	};
	repliesMetadata: {
		container: HTMLElement;
		icon: HTMLElement;
		count: HTMLSpanElement;
		lastReplyDetail: HTMLSpanElement;
		separator: HTMLElement;
		timestamp: TimestampWidget;
	};
	disposables: IDisposable[];
}

class CommentsModelVirualDelegate implements IListVirtualDelegate<ResourceWithCommentThreads | CommentNode> {
	private static readonly RESOURCE_ID = 'resource-with-comments';
	private static readonly COMMENT_ID = 'comment-node';


	getHeight(element: any): number {
		if ((element instanceof CommentNode) && element.hasReply()) {
			return 44;
		}
		return 22;
	}

	public getTemplateId(element: any): string {
		if (element instanceof ResourceWithCommentThreads) {
			return CommentsModelVirualDelegate.RESOURCE_ID;
		}
		if (element instanceof CommentNode) {
			return CommentsModelVirualDelegate.COMMENT_ID;
		}

		return '';
	}
}

export class ResourceWithCommentsRenderer implements IListRenderer<ITreeNode<ResourceWithCommentThreads>, IResourceTemplateData> {
	templateId: string = 'resource-with-comments';

	constructor(
		private labels: ResourceLabels
	) {
	}

	renderTemplate(container: HTMLElement) {
		const labelContainer = dom.append(container, dom.$('.resource-container'));
		const resourceLabel = this.labels.create(labelContainer);

		return { resourceLabel };
	}

	renderElement(node: ITreeNode<ResourceWithCommentThreads>, index: number, templateData: IResourceTemplateData, height: number | undefined): void {
		templateData.resourceLabel.setFile(node.element.resource);
	}

	disposeTemplate(templateData: IResourceTemplateData): void {
		templateData.resourceLabel.dispose();
	}
}

export class CommentNodeRenderer implements IListRenderer<ITreeNode<CommentNode>, ICommentThreadTemplateData> {
	templateId: string = 'comment-node';

	constructor(
		@IOpenerService private readonly openerService: IOpenerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeService private themeService: IThemeService
	) { }

	renderTemplate(container: HTMLElement) {

		const threadContainer = dom.append(container, dom.$('.comment-thread-container'));
		const metadataContainer = dom.append(threadContainer, dom.$('.comment-metadata-container'));
		const threadMetadata = {
			icon: dom.append(metadataContainer, dom.$('.icon')),
			userNames: dom.append(metadataContainer, dom.$('.user')),
			timestamp: new TimestampWidget(this.configurationService, dom.append(metadataContainer, dom.$('.timestamp-container'))),
			separator: dom.append(metadataContainer, dom.$('.separator')),
			commentPreview: dom.append(metadataContainer, dom.$('.text')),
			range: dom.append(metadataContainer, dom.$('.range'))
		};
		threadMetadata.separator.innerText = '\u00b7';

		const snippetContainer = dom.append(threadContainer, dom.$('.comment-snippet-container'));
		const repliesMetadata = {
			container: snippetContainer,
			icon: dom.append(snippetContainer, dom.$('.icon')),
			count: dom.append(snippetContainer, dom.$('.count')),
			lastReplyDetail: dom.append(snippetContainer, dom.$('.reply-detail')),
			separator: dom.append(snippetContainer, dom.$('.separator')),
			timestamp: new TimestampWidget(this.configurationService, dom.append(snippetContainer, dom.$('.timestamp-container'))),
		};
		repliesMetadata.separator.innerText = '\u00b7';
		repliesMetadata.icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.indent));
		const disposables = [threadMetadata.timestamp, repliesMetadata.timestamp];

		return { threadMetadata, repliesMetadata, disposables };
	}

	private getCountString(commentCount: number): string {
		if (commentCount > 1) {
			return nls.localize('commentsCount', "{0} comments", commentCount);
		} else {
			return nls.localize('commentCount', "1 comment");
		}
	}

	private getRenderedComment(commentBody: IMarkdownString, disposables: DisposableStore) {
		const renderedComment = renderMarkdown(commentBody, {
			inline: true,
			actionHandler: {
				callback: (link) => openLinkFromMarkdown(this.openerService, link, commentBody.isTrusted),
				disposables: disposables
			}
		});
		const images = renderedComment.element.getElementsByTagName('img');
		for (let i = 0; i < images.length; i++) {
			const image = images[i];
			const textDescription = dom.$('');
			textDescription.textContent = image.alt ? nls.localize('imageWithLabel', "Image: {0}", image.alt) : nls.localize('image', "Image");
			image.parentNode!.replaceChild(textDescription, image);
		}
		return renderedComment;
	}

	private getIcon(threadState?: CommentThreadState): ThemeIcon {
		if (threadState === CommentThreadState.Unresolved) {
			return Codicon.commentUnresolved;
		} else {
			return Codicon.comment;
		}
	}

	renderElement(node: ITreeNode<CommentNode>, index: number, templateData: ICommentThreadTemplateData, height: number | undefined): void {
		const commentCount = node.element.replies.length + 1;
		templateData.threadMetadata.icon.classList.remove(...Array.from(templateData.threadMetadata.icon.classList.values())
			.filter(value => value.startsWith('codicon')));
		templateData.threadMetadata.icon.classList.add(...ThemeIcon.asClassNameArray(this.getIcon(node.element.threadState)));
		if (node.element.threadState !== undefined) {
			const color = this.getCommentThreadWidgetStateColor(node.element.threadState, this.themeService.getColorTheme());
			templateData.threadMetadata.icon.style.setProperty(commentViewThreadStateColorVar, `${color}`);
			templateData.threadMetadata.icon.style.color = `var(${commentViewThreadStateColorVar})`;
		}
		templateData.threadMetadata.userNames.textContent = node.element.comment.userName;
		templateData.threadMetadata.timestamp.setTimestamp(node.element.comment.timestamp ? new Date(node.element.comment.timestamp) : undefined);
		const originalComment = node.element;

		templateData.threadMetadata.commentPreview.innerText = '';
		templateData.threadMetadata.commentPreview.style.height = '22px';
		if (typeof originalComment.comment.body === 'string') {
			templateData.threadMetadata.commentPreview.innerText = originalComment.comment.body;
		} else {
			const disposables = new DisposableStore();
			templateData.disposables.push(disposables);
			const renderedComment = this.getRenderedComment(originalComment.comment.body, disposables);
			templateData.disposables.push(renderedComment);
			templateData.threadMetadata.commentPreview.appendChild(renderedComment.element.firstElementChild ?? renderedComment.element);
			templateData.threadMetadata.commentPreview.title = renderedComment.element.textContent ?? '';
		}

		if (node.element.range) {
			if (node.element.range.startLineNumber === node.element.range.endLineNumber) {
				templateData.threadMetadata.range.textContent = nls.localize('commentLine', "[Ln {0}]", node.element.range.startLineNumber);
			} else {
				templateData.threadMetadata.range.textContent = nls.localize('commentRange', "[Ln {0}-{1}]", node.element.range.startLineNumber, node.element.range.endLineNumber);
			}
		}

		if (!node.element.hasReply()) {
			templateData.repliesMetadata.container.style.display = 'none';
			return;
		}

		templateData.repliesMetadata.container.style.display = '';
		templateData.repliesMetadata.count.textContent = this.getCountString(commentCount);
		const lastComment = node.element.replies[node.element.replies.length - 1].comment;
		templateData.repliesMetadata.lastReplyDetail.textContent = nls.localize('lastReplyFrom', "Last reply from {0}", lastComment.userName);
		templateData.repliesMetadata.timestamp.setTimestamp(lastComment.timestamp ? new Date(lastComment.timestamp) : undefined);
	}

	private getCommentThreadWidgetStateColor(state: CommentThreadState | undefined, theme: IColorTheme): Color | undefined {
		return (state !== undefined) ? getCommentThreadStateIconColor(state, theme) : undefined;
	}

	disposeTemplate(templateData: ICommentThreadTemplateData): void {
		templateData.disposables.forEach(disposeable => disposeable.dispose());
	}
}

export interface ICommentsListOptions extends IWorkbenchAsyncDataTreeOptions<any, any> {
	overrideStyles?: IStyleOverride<IListStyles>;
}

const enum FilterDataType {
	Resource,
	Comment
}

interface ResourceFilterData {
	type: FilterDataType.Resource;
	uriMatches: IMatch[];
}

interface CommentFilterData {
	type: FilterDataType.Comment;
	textMatches: IMatch[];
}

type FilterData = ResourceFilterData | CommentFilterData;

export class Filter implements ITreeFilter<ResourceWithCommentThreads | CommentNode, FilterData> {

	constructor(public options: FilterOptions) { }

	filter(element: ResourceWithCommentThreads | CommentNode, parentVisibility: TreeVisibility): TreeFilterResult<FilterData> {
		if (this.options.filter === '' && this.options.showResolved && this.options.showUnresolved) {
			return TreeVisibility.Visible;
		}

		if (element instanceof ResourceWithCommentThreads) {
			return this.filterResourceMarkers(element);
		} else {
			return this.filterCommentNode(element, parentVisibility);
		}
	}

	private filterResourceMarkers(resourceMarkers: ResourceWithCommentThreads): TreeFilterResult<FilterData> {
		// Filter by text. Do not apply negated filters on resources instead use exclude patterns
		if (this.options.textFilter.text && !this.options.textFilter.negate) {
			const uriMatches = FilterOptions._filter(this.options.textFilter.text, basename(resourceMarkers.resource));
			if (uriMatches) {
				return { visibility: true, data: { type: FilterDataType.Resource, uriMatches: uriMatches || [] } };
			}
		}

		return TreeVisibility.Recurse;
	}

	private filterCommentNode(comment: CommentNode, parentVisibility: TreeVisibility): TreeFilterResult<FilterData> {
		const matchesResolvedState = (comment.threadState === undefined) || (this.options.showResolved && CommentThreadState.Resolved === comment.threadState) ||
			(this.options.showUnresolved && CommentThreadState.Unresolved === comment.threadState);

		if (!matchesResolvedState) {
			return false;
		}

		if (!this.options.textFilter.text) {
			return true;
		}

		const textMatches =
			// Check body of comment for value
			FilterOptions._messageFilter(this.options.textFilter.text, typeof comment.comment.body === 'string' ? comment.comment.body : comment.comment.body.value)
			// Check first user for value
			|| FilterOptions._messageFilter(this.options.textFilter.text, comment.comment.userName)
			// Check all replies for value
			|| (comment.replies.map(reply => {
				// Check user for value
				return FilterOptions._messageFilter(this.options.textFilter.text, reply.comment.userName)
					// Check body of reply for value
					|| FilterOptions._messageFilter(this.options.textFilter.text, typeof reply.comment.body === 'string' ? reply.comment.body : reply.comment.body.value);
			}).filter(value => !!value) as IMatch[][]).flat();

		// Matched and not negated
		if (textMatches.length && !this.options.textFilter.negate) {
			return { visibility: true, data: { type: FilterDataType.Comment, textMatches } };
		}

		// Matched and negated - exclude it only if parent visibility is not set
		if (textMatches.length && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
			return false;
		}

		// Not matched and negated - include it only if parent visibility is not set
		if ((textMatches.length === 0) && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
			return true;
		}

		return parentVisibility;
	}
}

export class CommentsList extends WorkbenchObjectTree<CommentsModel | ResourceWithCommentThreads | CommentNode, any> {
	constructor(
		labels: ResourceLabels,
		container: HTMLElement,
		options: ICommentsListOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		const delegate = new CommentsModelVirualDelegate();

		const renderers = [
			instantiationService.createInstance(ResourceWithCommentsRenderer, labels),
			instantiationService.createInstance(CommentNodeRenderer)
		];

		super(
			'CommentsTree',
			container,
			delegate,
			renderers,
			{
				accessibilityProvider: options.accessibilityProvider,
				identityProvider: {
					getId: (element: any) => {
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
				},
				expandOnlyOnTwistieClick: (element: any) => {
					if (element instanceof CommentsModel || element instanceof ResourceWithCommentThreads) {
						return false;
					}

					return true;
				},
				collapseByDefault: false,
				overrideStyles: options.overrideStyles,
				filter: options.filter,
				findWidgetEnabled: false
			},
			instantiationService,
			contextKeyService,
			listService,
			configurationService,
		);
	}

	filterComments(): void {
		this.refilter();
	}

	getVisibleItemCount(): number {
		let filtered = 0;
		const root = this.getNode();

		for (const resourceNode of root.children) {
			for (const commentNode of resourceNode.children) {
				if (commentNode.visible && resourceNode.visible) {
					filtered++;
				}
			}
		}

		return filtered;
	}
}
