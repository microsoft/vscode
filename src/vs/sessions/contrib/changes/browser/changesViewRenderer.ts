/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ICompressedTreeElement, ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { ActionRunner } from '../../../../base/common/actions.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { basename, dirname, extUriBiasedIgnorePathCase, relativePath } from '../../../../base/common/resources.js';
import { IResourceNode, ResourceTree } from '../../../../base/common/resourceTree.js';
import { URI } from '../../../../base/common/uri.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IResourceLabel, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatSessionFileChange, IChatSessionFileChange2, isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { chatEditingWidgetFileStateContextKey, ModifiedFileEntryState } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../../services/sessions/common/session.js';
import { ActiveSessionContextKeys, ChangesContextKeys, ChangesViewMode } from '../common/changes.js';
import { ChangesViewModel } from './changesViewModel.js';

const $ = dom.$;

export function toIChangesFileItem(changes: readonly (IChatSessionFileChange | IChatSessionFileChange2)[]): IChangesFileItem[] {
	return changes.map(change => {
		const isAddition = change.originalUri === undefined;
		const isDeletion = change.modifiedUri === undefined;
		const uri = isIChatSessionFileChange2(change)
			? change.uri
			: change.modifiedUri;

		return {
			type: 'file',
			uri,
			originalUri: change.originalUri,
			isDeletion,
			state: ModifiedFileEntryState.Accepted,
			changeType: isAddition
				? 'added'
				: isDeletion
					? 'deleted'
					: 'modified',
			linesAdded: change.insertions,
			linesRemoved: change.deletions
		} satisfies IChangesFileItem;
	});
}

type ChangeType = 'added' | 'modified' | 'deleted' | 'none';

export interface IChangesFileItem {
	readonly type: 'file';
	readonly uri: URI;
	readonly originalUri?: URI;
	readonly state: ModifiedFileEntryState;
	readonly isDeletion: boolean;
	readonly changeType: ChangeType;
	readonly linesAdded: number;
	readonly linesRemoved: number;
}

export interface IChangesRootItem {
	readonly type: 'root';
	readonly uri: URI;
	readonly name: string;
}

export interface IChangesTreeRootInfo {
	readonly root: IChangesRootItem;
	readonly resourceTreeRootUri: URI;
}

export type ChangesTreeElement = IChangesRootItem | IChangesFileItem | IResourceNode<IChangesFileItem, undefined>;

export function isChangesFileItem(element: ChangesTreeElement): element is IChangesFileItem {
	return !ResourceTree.isResourceNode(element) && element.type === 'file';
}

export function isChangesRootItem(element: ChangesTreeElement): element is IChangesRootItem {
	return !ResourceTree.isResourceNode(element) && element.type === 'root';
}

export function buildTreeChildren(items: IChangesFileItem[], treeRootInfo?: IChangesTreeRootInfo): ICompressedTreeElement<ChangesTreeElement>[] {
	if (items.length === 0) {
		return [];
	}

	let rootUri = treeRootInfo?.resourceTreeRootUri ?? URI.file('/');

	// For github-remote-file URIs, set the root to /{owner}/{repo}/{ref}
	// so the tree shows repo-relative paths instead of internal URI segments.
	if (!treeRootInfo && items[0].uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
		const parts = items[0].uri.path.split('/').filter(Boolean);
		if (parts.length >= 3) {
			rootUri = items[0].uri.with({ path: '/' + parts.slice(0, 3).join('/') });
		}
	}

	const resourceTree = new ResourceTree<IChangesFileItem, undefined>(undefined, rootUri, extUriBiasedIgnorePathCase);
	for (const item of items) {
		resourceTree.add(item.uri, item);
	}

	function convertChildren(parent: IResourceNode<IChangesFileItem, undefined>): ICompressedTreeElement<ChangesTreeElement>[] {
		const result: ICompressedTreeElement<ChangesTreeElement>[] = [];
		for (const child of parent.children) {
			if (child.element && child.childrenCount === 0) {
				// Leaf node — just the file item
				result.push({
					element: child.element,
					collapsible: false,
					incompressible: true,
				});
			} else {
				// Folder node. Ensure that the first level of folders under
				// the root folder are not being collapsed with the root folder
				// as that is a special node showing the workspace folder and
				// branch information.
				result.push({
					element: child,
					children: convertChildren(child),
					incompressible: parent === resourceTree.root,
					collapsible: true,
					collapsed: false,
				});
			}
		}
		return result;
	}

	const children = convertChildren(resourceTree.root);
	if (!treeRootInfo) {
		return children;
	}

	return [{
		element: treeRootInfo.root,
		children,
		collapsible: true,
		collapsed: false,
		incompressible: true,
	}];
}

interface IChangesTreeTemplate {
	readonly label: IResourceLabel;
	readonly toolbar: MenuWorkbenchToolBar | undefined;
	readonly contextKeyService: IContextKeyService | undefined;
	readonly reviewCommentsBadge: HTMLElement;
	readonly agentFeedbackBadge: HTMLElement;
	readonly decorationBadge: HTMLElement;
	readonly addedSpan: HTMLElement;
	readonly removedSpan: HTMLElement;
	readonly lineCountsContainer: HTMLElement;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposables: DisposableStore;
}

export class ChangesTreeRenderer implements ICompressibleTreeRenderer<ChangesTreeElement, void, IChangesTreeTemplate> {
	static TEMPLATE_ID = 'changesTreeRenderer';
	readonly templateId: string = ChangesTreeRenderer.TEMPLATE_ID;

	constructor(
		private viewModel: ChangesViewModel,
		private labels: ResourceLabels,
		private actionRunner: ActionRunner | undefined,
		private getRootUri: () => URI | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILabelService private readonly labelService: ILabelService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
	) { }

	renderTemplate(container: HTMLElement): IChangesTreeTemplate {
		const templateDisposables = new DisposableStore();
		const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));

		const reviewCommentsBadge = dom.$('.changes-review-comments-badge');
		label.element.appendChild(reviewCommentsBadge);

		const agentFeedbackBadge = dom.$('.changes-agent-feedback-badge');
		label.element.appendChild(agentFeedbackBadge);

		const lineCountsContainer = $('.working-set-line-counts');
		const addedSpan = dom.$('.working-set-lines-added');
		const removedSpan = dom.$('.working-set-lines-removed');
		lineCountsContainer.appendChild(addedSpan);
		lineCountsContainer.appendChild(removedSpan);
		label.element.appendChild(lineCountsContainer);

		const actionBarContainer = $('.chat-collapsible-list-action-bar');
		const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(actionBarContainer));
		const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		const toolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.ChatEditingSessionChangeToolbar, { menuOptions: { shouldForwardArgs: true, arg: undefined }, actionRunner: this.actionRunner }));
		label.element.appendChild(actionBarContainer);

		templateDisposables.add(bindContextKey(ChatContextKeys.agentSessionType, contextKeyService, reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.sessionType ?? '';
		}));

		templateDisposables.add(bindContextKey(ActiveSessionContextKeys.HasGitRepository, contextKeyService, reader => {
			return this.viewModel.activeSessionHasGitRepositoryObs.read(reader);
		}));

		templateDisposables.add(bindContextKey(ChangesContextKeys.VersionMode, contextKeyService, reader => {
			return this.viewModel.versionModeObs.read(reader);
		}));

		const decorationBadge = dom.$('.changes-decoration-badge');
		label.element.appendChild(decorationBadge);

		return { label, toolbar, contextKeyService, reviewCommentsBadge, agentFeedbackBadge, decorationBadge, addedSpan, removedSpan, lineCountsContainer, elementDisposables: new DisposableStore(), templateDisposables };
	}

	renderElement(node: ITreeNode<ChangesTreeElement, void>, _index: number, templateData: IChangesTreeTemplate): void {
		const element = node.element;
		templateData.label.element.style.display = 'flex';

		if (isChangesRootItem(element)) {
			// Root element
			this.renderRootElement(element, templateData);
		} else if (ResourceTree.isResourceNode(element)) {
			// Folder element
			this.renderFolderElement(element, templateData);
		} else {
			// File element
			this.renderFileElement(element, templateData);
		}
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ChangesTreeElement>, void>, _index: number, templateData: IChangesTreeTemplate): void {
		const compressed = node.element as ICompressedTreeNode<IResourceNode<IChangesFileItem, undefined>>;
		const folder = compressed.elements[compressed.elements.length - 1];

		templateData.label.element.style.display = 'flex';

		const label = compressed.elements.map(e => e.name);
		templateData.label.setResource({ resource: folder.uri, name: label }, {
			fileKind: FileKind.FOLDER,
			separator: this.labelService.getSeparator(folder.uri.scheme),
		});

		// Hide file-specific decorations for folders
		templateData.reviewCommentsBadge.style.display = 'none';
		templateData.agentFeedbackBadge.style.display = 'none';
		templateData.decorationBadge.style.display = 'none';
		templateData.lineCountsContainer.style.display = 'none';

		if (templateData.toolbar) {
			templateData.toolbar.context = folder;
		}
		if (templateData.contextKeyService) {
			chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined!);
		}
	}

	private renderFileElement(data: IChangesFileItem, templateData: IChangesTreeTemplate): void {
		const root = this.getRootUri();
		const viewMode = this.viewModel.viewModeObs.get();

		templateData.label.setResource({
			resource: data.uri,
			name: basename(data.uri),
			description: viewMode === ChangesViewMode.List
				? root
					? relativePath(root, dirname(data.uri))
					: undefined
				: undefined,
		}, {
			fileKind: FileKind.FILE,
			fileDecorations: undefined,
			strikethrough: data.changeType === 'deleted'
		});

		const showChangeDecorations = data.changeType !== 'none';

		// Show file-specific decorations for changed files only
		templateData.lineCountsContainer.style.display = showChangeDecorations ? '' : 'none';
		templateData.decorationBadge.style.display = showChangeDecorations ? '' : 'none';

		// Review comments
		templateData.elementDisposables.add(autorun(reader => {
			const reviewCommentByFile = this.viewModel.activeSessionReviewCommentCountByFileObs.read(reader);
			const reviewCommentCount = reviewCommentByFile?.get(data.uri.fsPath) ?? 0;

			if (reviewCommentCount > 0) {
				templateData.reviewCommentsBadge.style.display = '';
				templateData.reviewCommentsBadge.className = 'changes-review-comments-badge';
				templateData.reviewCommentsBadge.replaceChildren(
					dom.$('.codicon.codicon-comment-unresolved'),
					dom.$('span', undefined, `${reviewCommentCount}`)
				);
			} else {
				templateData.reviewCommentsBadge.style.display = 'none';
				templateData.reviewCommentsBadge.replaceChildren();
			}
		}));

		// Agent feedback
		templateData.elementDisposables.add(autorun(reader => {
			const agentFeedbackByFile = this.viewModel.activeSessionAgentFeedbackCountByFileObs.read(reader);
			const agentFeedbackCount = agentFeedbackByFile?.get(data.uri.fsPath) ?? 0;

			if (agentFeedbackCount > 0) {
				templateData.agentFeedbackBadge.style.display = '';
				templateData.agentFeedbackBadge.className = 'changes-agent-feedback-badge';
				templateData.agentFeedbackBadge.replaceChildren(
					dom.$('.codicon.codicon-comment'),
					dom.$('span', undefined, `${agentFeedbackCount}`)
				);
			} else {
				templateData.agentFeedbackBadge.style.display = 'none';
				templateData.agentFeedbackBadge.replaceChildren();
			}
		}));

		const badge = templateData.decorationBadge;
		badge.className = 'changes-decoration-badge';
		if (showChangeDecorations) {
			// Update decoration badge (A/M/D)
			switch (data.changeType) {
				case 'added':
					badge.textContent = 'A';
					badge.classList.add('added');
					break;
				case 'deleted':
					badge.textContent = 'D';
					badge.classList.add('deleted');
					break;
				case 'modified':
				default:
					badge.textContent = 'M';
					badge.classList.add('modified');
					break;
			}

			templateData.addedSpan.textContent = `+${data.linesAdded}`;
			templateData.removedSpan.textContent = `-${data.linesRemoved}`;

			// eslint-disable-next-line no-restricted-syntax
			templateData.label.element.querySelector('.monaco-icon-name-container')?.classList.add('modified');
		} else {
			badge.textContent = '';
			// eslint-disable-next-line no-restricted-syntax
			templateData.label.element.querySelector('.monaco-icon-name-container')?.classList.remove('modified');
		}

		if (templateData.toolbar) {
			templateData.toolbar.context = data;
		}
		if (templateData.contextKeyService) {
			chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(data.state);
		}
	}

	private renderRootElement(data: IChangesRootItem, templateData: IChangesTreeTemplate): void {
		templateData.label.setResource({
			resource: data.uri,
			name: data.name,
		}, {
			fileKind: FileKind.ROOT_FOLDER,
			separator: this.labelService.getSeparator(data.uri.scheme, data.uri.authority),
		});

		templateData.reviewCommentsBadge.style.display = 'none';
		templateData.agentFeedbackBadge.style.display = 'none';
		templateData.decorationBadge.style.display = 'none';
		templateData.lineCountsContainer.style.display = 'none';

		if (templateData.toolbar) {
			templateData.toolbar.context = data.uri;
		}
		if (templateData.contextKeyService) {
			chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined!);
		}
	}

	private renderFolderElement(node: IResourceNode<IChangesFileItem, undefined>, templateData: IChangesTreeTemplate): void {
		templateData.label.setFile(node.uri, {
			fileKind: FileKind.FOLDER,
			hidePath: true,
		});

		// Hide file-specific decorations for folders
		templateData.reviewCommentsBadge.style.display = 'none';
		templateData.agentFeedbackBadge.style.display = 'none';
		templateData.decorationBadge.style.display = 'none';
		templateData.lineCountsContainer.style.display = 'none';

		if (templateData.toolbar) {
			templateData.toolbar.context = node;
		}
		if (templateData.contextKeyService) {
			chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined!);
		}
	}

	disposeElement(_element: ITreeNode<ChangesTreeElement, void>, _index: number, templateData: IChangesTreeTemplate): void {
		templateData.elementDisposables.clear();
	}

	disposeCompressedElements(_element: ITreeNode<ICompressedTreeNode<ChangesTreeElement>, void>, _index: number, templateData: IChangesTreeTemplate): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IChangesTreeTemplate): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}
