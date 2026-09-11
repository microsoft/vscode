/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HoverStyle, IDelayedHoverOptions } from '../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IObjectTreeElement, ITreeNode, ITreeRenderer } from '../../../../base/browser/ui/tree/tree.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { AnchorAlignment, AnchorPosition } from '../../../../base/common/layout.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { basename } from '../../../../base/common/path.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { localize } from '../../../../nls.js';
import { IContextViewService, IOpenContextView } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { editorHoverBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { DEFAULT_LABELS_CONTAINER, IResourceLabel, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { IAgentFeedbackVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { createFileIconThemableTreeContainerScope } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';

const $ = dom.$;

// --- Tree Element Types ---

interface IFeedbackFileElement {
	readonly type: 'file';
	readonly uri: URI;
	readonly items: ReadonlyArray<IFeedbackCommentElement>;
}

interface IFeedbackCommentElement {
	readonly type: 'comment';
	readonly id: string;
	readonly text: string;
	readonly resourceUri: URI;
	readonly codeSelection?: string;
	readonly diffHunks?: string;
}

type FeedbackTreeElement = IFeedbackFileElement | IFeedbackCommentElement;

function isFeedbackFileElement(element: FeedbackTreeElement): element is IFeedbackFileElement {
	return element.type === 'file';
}

// --- Tree Delegate ---

class FeedbackTreeDelegate implements IListVirtualDelegate<FeedbackTreeElement> {
	getHeight(_element: FeedbackTreeElement): number {
		return 22;
	}

	getTemplateId(element: FeedbackTreeElement): string {
		return isFeedbackFileElement(element)
			? FeedbackFileRenderer.TEMPLATE_ID
			: FeedbackCommentRenderer.TEMPLATE_ID;
	}
}

// --- File Renderer ---

interface IFeedbackFileTemplate {
	readonly label: IResourceLabel;
	readonly actionBar: ActionBar;
	readonly templateDisposables: DisposableStore;
}

class FeedbackFileRenderer implements ITreeRenderer<IFeedbackFileElement, void, IFeedbackFileTemplate> {
	static readonly TEMPLATE_ID = 'feedbackFile';
	readonly templateId = FeedbackFileRenderer.TEMPLATE_ID;

	constructor(
		private readonly _labels: ResourceLabels,
		private readonly _agentFeedbackService: IAgentFeedbackService | undefined,
		private readonly _sessionResource: URI,
	) { }

	renderTemplate(container: HTMLElement): IFeedbackFileTemplate {
		const templateDisposables = new DisposableStore();

		const label = templateDisposables.add(this._labels.create(container, { supportHighlights: true }));

		const actionBarContainer = $('div.agent-feedback-context-view-action-bar');
		label.element.appendChild(actionBarContainer);
		const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));

		return { label, actionBar, templateDisposables };
	}

	renderElement(node: ITreeNode<IFeedbackFileElement, void>, _index: number, templateData: IFeedbackFileTemplate): void {
		const element = node.element;
		templateData.label.element.style.display = 'flex';

		const name = basename(element.uri.path);


		templateData.label.setResource(
			{ resource: element.uri, name },
			{ fileKind: FileKind.FILE },
		);

		templateData.actionBar.clear();
		if (this._agentFeedbackService) {
			const service = this._agentFeedbackService;
			const sessionResource = this._sessionResource;
			templateData.actionBar.push(new Action(
				'agentFeedback.removeFileComments',
				localize('agentFeedbackContextView.removeAll', "Remove All"),
				ThemeIcon.asClassName(Codicon.close),
				true,
				() => {
					for (const item of element.items) {
						service.removeFeedback(sessionResource, item.id);
					}
				}
			), { icon: true, label: false });
		}
	}

	disposeTemplate(templateData: IFeedbackFileTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

// --- Comment Renderer ---

interface IFeedbackCommentTemplate {
	readonly textElement: HTMLElement;
	readonly row: HTMLElement;
	readonly actionBar: ActionBar;
	readonly templateDisposables: DisposableStore;
	readonly hoverDisposable: MutableDisposable<IDisposable>;
}

class FeedbackCommentRenderer implements ITreeRenderer<IFeedbackCommentElement, void, IFeedbackCommentTemplate> {
	static readonly TEMPLATE_ID = 'feedbackComment';
	readonly templateId = FeedbackCommentRenderer.TEMPLATE_ID;

	constructor(
		private readonly _agentFeedbackService: IAgentFeedbackService,
		private readonly _canDelete: boolean,
		private readonly _sessionResource: URI,
		private readonly _hoverService: IHoverService,
		private readonly _languageService: ILanguageService,
	) { }

	renderTemplate(container: HTMLElement): IFeedbackCommentTemplate {
		const templateDisposables = new DisposableStore();

		const row = dom.append(container, $('div.agent-feedback-context-view-comment-row'));

		const textElement = dom.append(row, $('div.agent-feedback-context-view-comment-text'));

		const actionBarContainer = dom.append(row, $('div.agent-feedback-context-view-action-bar'));
		const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));

		const hoverDisposable = templateDisposables.add(new MutableDisposable());

		return { textElement, row, actionBar, templateDisposables, hoverDisposable };
	}

	renderElement(node: ITreeNode<IFeedbackCommentElement, void>, _index: number, templateData: IFeedbackCommentTemplate): void {
		const element = node.element;

		templateData.textElement.textContent = element.text;

		// In read-only mode, set up a rich markdown hover with comment + code snippet
		if (!this._canDelete) {
			templateData.hoverDisposable.value = this._hoverService.setupDelayedHover(
				templateData.row,
				() => this._buildCommentHover(element),
				{ groupId: 'agent-feedback-comment' }
			);
		}

		templateData.actionBar.clear();
		if (this._canDelete) {
			const service = this._agentFeedbackService;
			const sessionResource = this._sessionResource;
			templateData.actionBar.push(new Action(
				'agentFeedback.removeComment',
				localize('agentFeedbackContextView.remove', "Remove"),
				ThemeIcon.asClassName(Codicon.close),
				true,
				() => {
					service.removeFeedback(sessionResource, element.id);
				}
			), { icon: true, label: false });
		}
	}

	disposeTemplate(templateData: IFeedbackCommentTemplate): void {
		templateData.templateDisposables.dispose();
	}

	private _buildCommentHover(element: IFeedbackCommentElement): IDelayedHoverOptions {
		const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
		markdown.appendText(element.text);

		if (element.codeSelection) {
			const languageId = this._languageService.guessLanguageIdByFilepathOrFirstLine(element.resourceUri);
			markdown.appendMarkdown('\n\n');
			markdown.appendCodeblock(languageId ?? '', element.codeSelection);
		}

		if (element.diffHunks) {
			markdown.appendMarkdown('\n\n');
			markdown.appendCodeblock('diff', element.diffHunks);
		}

		return {
			content: markdown,
			style: HoverStyle.Pointer,
			position: {
				hoverPosition: HoverPosition.RIGHT,
			},
		};
	}
}

// --- Context View ---

/**
 * Creates the context view for the "N comments" attachment.
 * Uses a WorkbenchObjectTree to render files as parent nodes and comments as children,
 * with per-row action bars for removal.
 */
export class AgentFeedbackContextView extends Disposable {

	private _openContextView: IOpenContextView | undefined;
	private _tree: WorkbenchObjectTree<FeedbackTreeElement> | undefined;

	constructor(
		private readonly _element: HTMLElement,
		private readonly _attachment: IAgentFeedbackVariableEntry,
		private readonly _canDelete: boolean,
		@IHoverService private readonly _hoverService: IHoverService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();

		this._store.add(this._hoverService.setupDelayedHover(
			this._element,
			{
				content: localize('agentFeedbackAttachment.viewComments', "View comments"),
				style: HoverStyle.Pointer,
			},
			{ groupId: 'chat-attachments' }
		));

		this._store.add(toDisposable(() => this._openContextView?.close()));
	}

	toggle(): void {
		if (this._openContextView) {
			this._openContextView.close();
			return;
		}
		if (this._attachment.feedbackItems.length < 2) {
			return;
		}

		this._hoverService.hideHover();
		this._show();
	}

	private _show(): void {
		this._openContextView = this._contextViewService.showContextView({
			getAnchor: () => this._element,
			anchorAlignment: AnchorAlignment.LEFT,
			anchorPosition: AnchorPosition.BELOW,
			render: container => this._render(container),
			focus: () => this._tree?.domFocus(),
			onDOMEvent: e => {
				const eventType = e.browserEvent?.type ?? e.type;
				if (eventType === dom.EventType.KEY_DOWN && e.keyCode === KeyCode.Escape) {
					e.preventDefault();
					e.stopPropagation();
					this._openContextView?.close();
					this._element.focus();
					return;
				}
				if (eventType === dom.EventType.CLICK) {
					const target = e.target;
					if (dom.isHTMLElement(target)
						&& !dom.isAncestor(target, this._contextViewService.getContextViewElement())
						&& !dom.isAncestor(target, this._element)) {
						this._openContextView?.close();
					}
				}
			},
			onHide: () => {
				this._element.ariaExpanded = 'false';
				this._tree = undefined;
				this._openContextView = undefined;
			},
		});
		this._element.ariaExpanded = 'true';
	}

	private _render(container: HTMLElement): IDisposable {
		const disposables = new DisposableStore();
		const contextViewElement = dom.append(container, $('.agent-feedback-context-view.monaco-hover.workbench-hover.compact'));
		const treeContainer = dom.append(contextViewElement, $('.results.agent-feedback-context-view-tree'));
		disposables.add(createFileIconThemableTreeContainerScope(treeContainer, this._themeService));

		const resourceLabels = disposables.add(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const { children, commentElements } = this._buildTreeData();

		const tree = disposables.add(this._instantiationService.createInstance(
			WorkbenchObjectTree<FeedbackTreeElement>,
			'AgentFeedbackContextViewTree',
			treeContainer,
			new FeedbackTreeDelegate(),
			[
				new FeedbackFileRenderer(resourceLabels, this._canDelete ? this._agentFeedbackService : undefined, this._attachment.sessionResource),
				new FeedbackCommentRenderer(this._agentFeedbackService, this._canDelete, this._attachment.sessionResource, this._hoverService, this._languageService),
			],
			{
				defaultIndent: 0,
				alwaysConsumeMouseWheel: false,
				openOnSingleClick: true,
				accessibilityProvider: {
					getAriaLabel: (element: FeedbackTreeElement) => {
						if (isFeedbackFileElement(element)) {
							return basename(element.uri.path);
						}
						return element.text;
					},
					getWidgetAriaLabel: () => localize('agentFeedbackContextView.tree', "Feedback Comments"),
				},
				identityProvider: {
					getId: (element: FeedbackTreeElement) => {
						if (isFeedbackFileElement(element)) {
							return `file:${element.uri.toString()}`;
						}
						return `comment:${element.id}`;
					}
				},
				overrideStyles: {
					listFocusBackground: undefined,
					listInactiveFocusBackground: undefined,
					listActiveSelectionBackground: undefined,
					listFocusAndSelectionBackground: undefined,
					listInactiveSelectionBackground: undefined,
					listBackground: editorHoverBackground,
					listFocusForeground: undefined,
					treeStickyScrollBackground: editorHoverBackground,
				}
			}
		));
		this._tree = tree;
		disposables.add(tree.onDidOpen(e => {
			if (e.element && !isFeedbackFileElement(e.element)) {
				this._openContextView?.close();
				void this._agentFeedbackService.revealFeedback(this._attachment.sessionResource, e.element.id);
			}
		}));

		tree.setChildren(null, children);
		if (children[0]?.element) {
			tree.setFocus([children[0].element]);
		}

		const ROW_HEIGHT = 22;
		const MAX_ROWS = 8;
		const totalRows = commentElements.length + children.length;
		const treeHeight = Math.min(totalRows * ROW_HEIGHT, MAX_ROWS * ROW_HEIGHT);
		tree.layout(treeHeight, 200);
		treeContainer.style.height = `${treeHeight}px`;

		return disposables;
	}

	private _buildTreeData(): { children: IObjectTreeElement<FeedbackTreeElement>[]; commentElements: IFeedbackCommentElement[] } {
		const byFile = new Map<string, { uri: URI; comments: IFeedbackCommentElement[] }>();

		for (const item of this._attachment.feedbackItems) {
			const key = item.resourceUri.toString();
			let group = byFile.get(key);
			if (!group) {
				group = { uri: item.resourceUri, comments: [] };
				byFile.set(key, group);
			}
			group.comments.push({
				type: 'comment',
				id: item.id,
				text: item.text,
				resourceUri: item.resourceUri,
				codeSelection: item.codeSelection,
				diffHunks: item.diffHunks,
			});
		}

		const children: IObjectTreeElement<FeedbackTreeElement>[] = [];
		const allComments: IFeedbackCommentElement[] = [];

		for (const [, group] of byFile) {
			const fileElement: IFeedbackFileElement = {
				type: 'file',
				uri: group.uri,
				items: group.comments,
			};

			allComments.push(...group.comments);

			children.push({
				element: fileElement,
				collapsible: true,
				collapsed: false,
				children: group.comments.map(comment => ({
					element: comment,
					collapsible: false,
				})),
			});
		}

		return { children, commentElements: allComments };
	}
}
