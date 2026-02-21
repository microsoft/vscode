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
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/path.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { DEFAULT_LABELS_CONTAINER, IResourceLabel, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { IAgentFeedbackVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { editorHoverBackground } from '../../../../platform/theme/common/colorRegistry.js';

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
	readonly range: IRange;
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
		private readonly _agentFeedbackService: IAgentFeedbackService,
		private readonly _sessionResource: URI,
	) { }

	renderTemplate(container: HTMLElement): IFeedbackFileTemplate {
		const templateDisposables = new DisposableStore();

		const label = templateDisposables.add(this._labels.create(container, { supportHighlights: true, supportIcons: true }));

		const actionBarContainer = $('div.agent-feedback-hover-action-bar');
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
		templateData.actionBar.push(new Action(
			'agentFeedback.removeFileComments',
			localize('agentFeedbackHover.removeAll', "Remove All"),
			ThemeIcon.asClassName(Codicon.close),
			true,
			() => {
				for (const item of element.items) {
					this._agentFeedbackService.removeFeedback(this._sessionResource, item.id);
				}
			}
		), { icon: true, label: false });
	}

	disposeTemplate(templateData: IFeedbackFileTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

// --- Comment Renderer ---

interface IFeedbackCommentTemplate {
	readonly textElement: HTMLElement;
	readonly actionBar: ActionBar;
	readonly templateDisposables: DisposableStore;
	element: IFeedbackCommentElement | undefined;
}

class FeedbackCommentRenderer implements ITreeRenderer<IFeedbackCommentElement, void, IFeedbackCommentTemplate> {
	static readonly TEMPLATE_ID = 'feedbackComment';
	readonly templateId = FeedbackCommentRenderer.TEMPLATE_ID;

	constructor(
		private readonly _agentFeedbackService: IAgentFeedbackService,
		private readonly _sessionResource: URI,
	) { }

	renderTemplate(container: HTMLElement): IFeedbackCommentTemplate {
		const templateDisposables = new DisposableStore();

		const row = dom.append(container, $('div.agent-feedback-hover-comment-row'));

		const textElement = dom.append(row, $('div.agent-feedback-hover-comment-text'));

		const actionBarContainer = dom.append(row, $('div.agent-feedback-hover-action-bar'));
		const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));

		const templateData: IFeedbackCommentTemplate = { textElement, actionBar, templateDisposables, element: undefined };

		templateDisposables.add(dom.addDisposableListener(row, dom.EventType.CLICK, (e) => {
			const data = templateData.element;
			if (data) {
				e.preventDefault();
				e.stopPropagation();
				this._agentFeedbackService.revealFeedback(this._sessionResource, data.id);
			}
		}));

		return templateData;
	}

	renderElement(node: ITreeNode<IFeedbackCommentElement, void>, _index: number, templateData: IFeedbackCommentTemplate): void {
		const element = node.element;

		templateData.textElement.textContent = element.text;
		templateData.element = element;

		templateData.actionBar.clear();
		templateData.actionBar.push(new Action(
			'agentFeedback.removeComment',
			localize('agentFeedbackHover.remove', "Remove"),
			ThemeIcon.asClassName(Codicon.close),
			true,
			() => {
				this._agentFeedbackService.removeFeedback(this._sessionResource, element.id);
			}
		), { icon: true, label: false });
	}

	disposeTemplate(templateData: IFeedbackCommentTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

// --- Hover ---

/**
 * Creates the custom hover content for the "N comments" attachment.
 * Uses a WorkbenchObjectTree to render files as parent nodes and comments as children,
 * with per-row action bars for removal.
 */
export class AgentFeedbackHover extends Disposable {

	constructor(
		private readonly _element: HTMLElement,
		private readonly _attachment: IAgentFeedbackVariableEntry,
		@IHoverService private readonly _hoverService: IHoverService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
	) {
		super();

		// Show on hover (delayed)
		this._store.add(this._hoverService.setupDelayedHover(
			this._element,
			() => this._store.add(this._buildHoverContent()), // needs a better disposable story
			{ groupId: 'chat-attachments' }
		));

		// Show immediately on click
		this._store.add(dom.addDisposableListener(this._element, dom.EventType.CLICK, (e) => {
			e.preventDefault();
			e.stopPropagation();
			this._showHoverNow();
		}));
	}

	private _showHoverNow(): void {
		const opts = this._buildHoverContent();
		this._register(opts);
		this._hoverService.showInstantHover({
			content: opts.content,
			target: this._element,
			style: opts.style,
			position: opts.position,
			trapFocus: opts.trapFocus,
		});
	}

	private _buildHoverContent(): IDelayedHoverOptions & IDisposable {
		const disposables = new DisposableStore();
		const hoverElement = $('div.agent-feedback-hover');

		// Tree container
		const treeContainer = dom.append(hoverElement, $('.results.show-file-icons.file-icon-themable-tree.agent-feedback-hover-tree'));

		// Resource labels (shared across all file renderers)
		const resourceLabels = disposables.add(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));

		// Build tree data
		const { children, commentElements } = this._buildTreeData();

		// Create tree
		const tree = disposables.add(this._instantiationService.createInstance(
			WorkbenchObjectTree<FeedbackTreeElement>,
			'AgentFeedbackHoverTree',
			treeContainer,
			new FeedbackTreeDelegate(),
			[
				new FeedbackFileRenderer(resourceLabels, this._agentFeedbackService, this._attachment.sessionResource),
				new FeedbackCommentRenderer(this._agentFeedbackService, this._attachment.sessionResource),
			],
			{
				defaultIndent: 0,
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: {
					getAriaLabel: (element: FeedbackTreeElement) => {
						if (isFeedbackFileElement(element)) {
							return basename(element.uri.path);
						}
						return element.text;
					},
					getWidgetAriaLabel: () => localize('agentFeedbackHover.tree', "Feedback Comments"),
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

		// Set tree data
		tree.setChildren(null, children);

		// Layout tree: clamp to reasonable height
		const ROW_HEIGHT = 22;
		const MAX_ROWS = 8;
		const totalRows = commentElements.length + children.length;
		const treeHeight = Math.min(totalRows * ROW_HEIGHT, MAX_ROWS * ROW_HEIGHT);
		tree.layout(treeHeight, 200);
		treeContainer.style.height = `${treeHeight}px`;

		return {
			content: hoverElement,
			style: HoverStyle.Pointer,
			position: { hoverPosition: HoverPosition.ABOVE },
			trapFocus: true,
			appearance: { compact: true },
			additionalClasses: ['agent-feedback-hover-container'],
			dispose: () => disposables.dispose(),
		};
	}

	private _buildTreeData(): { children: IObjectTreeElement<FeedbackTreeElement>[]; commentElements: IFeedbackCommentElement[] } {
		// Group feedback items by file
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
				range: item.range,
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
