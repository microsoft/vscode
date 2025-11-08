/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsessionsviewer.css';
import { addDisposableListener, EventType, h } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { ITreeCompressionDelegate } from '../../../../../base/browser/ui/tree/asyncDataTree.js';
import { ICompressedTreeNode } from '../../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleKeyboardNavigationLabelProvider, ICompressibleTreeRenderer } from '../../../../../base/browser/ui/tree/objectTree.js';
import { ITreeNode, ITreeElementRenderDetails, IAsyncDataSource, ITreeSorter, ITreeDragAndDrop, ITreeDragOverReaction } from '../../../../../base/browser/ui/tree/tree.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IAgentSessionViewModel, IAgentSessionsViewModel, isAgentSession, isAgentSessionsViewModel } from './agentSessionViewModel.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';
import { FuzzyScore, createMatches } from '../../../../../base/common/filters.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { allowedChatMarkdownHtmlTags } from '../chatContentMarkdownRenderer.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IDragAndDropData } from '../../../../../base/browser/dnd.js';
import { ListViewTargetSector } from '../../../../../base/browser/ui/list/listView.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { fillEditorsDragData } from '../../../../browser/dnd.js';
import { ChatSessionStatus } from '../../common/chatSessionsService.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { IWorkbenchLayoutService, Position } from '../../../../services/layout/browser/layoutService.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { AGENT_SESSIONS_VIEW_ID } from './agentSessions.js';
import { IntervalTimer } from '../../../../../base/common/async.js';

interface IAgentSessionItemTemplate {
	readonly element: HTMLElement;

	// Column 1
	readonly icon: HTMLElement;

	// Column 2 Row 1
	readonly title: IconLabel;

	readonly diffFiles: HTMLElement;
	readonly diffAdded: HTMLElement;
	readonly diffRemoved: HTMLElement;

	// Column 2 Row 2
	readonly description: HTMLElement;
	readonly status: HTMLElement;

	readonly elementDisposable: DisposableStore;
	readonly disposables: IDisposable;
}

export class AgentSessionRenderer implements ICompressibleTreeRenderer<IAgentSessionViewModel, FuzzyScore, IAgentSessionItemTemplate> {

	static readonly TEMPLATE_ID = 'agent-session';

	readonly templateId = AgentSessionRenderer.TEMPLATE_ID;

	constructor(
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IProductService private readonly productService: IProductService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IHoverService private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): IAgentSessionItemTemplate {
		// Hack to disable twistie in advent of on official option
		// eslint-disable-next-line no-restricted-syntax
		container.parentElement?.parentElement?.querySelector('.monaco-tl-twistie')?.classList.add('force-no-twistie'); // hack, but no API for hiding twistie on tree

		const disposables = new DisposableStore();
		const elementDisposable = disposables.add(new DisposableStore());

		const elements = h(
			'div.agent-session-item@item',
			[
				h('div.agent-session-icon-col', [
					h('div.agent-session-icon@icon')
				]),
				h('div.agent-session-main-col', [
					h('div.agent-session-title-row', [
						h('div.agent-session-title@title'),
						h('div.agent-session-diff', [
							h('span.agent-session-diff-files@diffFiles'),
							h('span.agent-session-diff-added@diffAdded'),
							h('span.agent-session-diff-removed@diffRemoved')
						]),
					]),
					h('div.agent-session-details-row', [
						h('div.agent-session-description@description'),
						h('div.agent-session-status@status')
					])
				])
			]
		);

		container.appendChild(elements.item);

		return {
			element: elements.item,
			icon: elements.icon,
			title: disposables.add(new IconLabel(elements.title, { supportHighlights: true, supportIcons: true })),
			description: elements.description,
			diffFiles: elements.diffFiles,
			diffAdded: elements.diffAdded,
			diffRemoved: elements.diffRemoved,
			status: elements.status,
			elementDisposable,
			disposables
		};
	}

	renderElement(session: ITreeNode<IAgentSessionViewModel, FuzzyScore>, index: number, template: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		template.elementDisposable.clear();

		// Icon
		template.icon.className = `agent-session-icon ${ThemeIcon.asClassName(this.getIcon(session.element))}`;

		// Title
		template.title.setLabel(session.element.label, undefined, { matches: createMatches(session.filterData) });

		// Diff
		const { statistics: diff } = session.element;
		template.diffFiles.textContent = diff?.files && diff.files > 0 ? `${diff.files}` : '';
		template.diffAdded.textContent = diff?.insertions && diff.insertions > 0 ? `+${diff.insertions}` : '';
		template.diffRemoved.textContent = diff?.deletions && diff.deletions > 0 ? `-${diff.deletions}` : '';

		// Description
		if (typeof session.element.description === 'string') {
			template.description.textContent = session.element.description;
		} else {
			template.elementDisposable.add(this.markdownRendererService.render(session.element.description, {
				sanitizerConfig: {
					replaceWithPlaintext: true,
					allowedTags: {
						override: allowedChatMarkdownHtmlTags,
					},
					allowedLinkSchemes: { augment: [this.productService.urlProtocol] }
				},
			}, template.description));

			// TODO@bpasero this is needed so that a user can click into a link of the session
			// without opening the session itself. Revisit this approach as we want to move
			// away from allowing different results based on where the user clicks.
			template.elementDisposable.add(addDisposableListener(template.description, EventType.MOUSE_DOWN, e => e.stopPropagation()));
			template.elementDisposable.add(addDisposableListener(template.description, EventType.CLICK, e => e.stopPropagation()));
			template.elementDisposable.add(addDisposableListener(template.description, EventType.AUXCLICK, e => e.stopPropagation()));
		}

		// Status (updated every minute)
		template.status.textContent = this.getStatus(session.element);
		const timer = template.elementDisposable.add(new IntervalTimer());
		timer.cancelAndSet(() => template.status.textContent = this.getStatus(session.element), 60 * 1000);

		this.renderHover(session, template);
	}

	private renderHover(session: ITreeNode<IAgentSessionViewModel, FuzzyScore>, template: IAgentSessionItemTemplate): void {
		const tooltip = session.element.tooltip;
		if (tooltip) {
			template.elementDisposable.add(
				this.hoverService.setupDelayedHover(template.element, () => ({
					content: tooltip,
					style: HoverStyle.Pointer,
					position: {
						hoverPosition: (() => {
							const sideBarPosition = this.layoutService.getSideBarPosition();
							const viewLocation = this.viewDescriptorService.getViewLocationById(AGENT_SESSIONS_VIEW_ID);
							switch (viewLocation) {
								case ViewContainerLocation.Sidebar:
									return sideBarPosition === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT;
								case ViewContainerLocation.AuxiliaryBar:
									return sideBarPosition === Position.LEFT ? HoverPosition.LEFT : HoverPosition.RIGHT;
								default:
									return HoverPosition.RIGHT;
							}
						})()
					}
				}))
			);
		}
	}

	private getIcon(session: IAgentSessionViewModel): ThemeIcon {
		if (session.status === ChatSessionStatus.InProgress) {
			return ThemeIcon.modify(Codicon.loading, 'spin');
		}

		if (session.status === ChatSessionStatus.Failed) {
			return Codicon.error;
		}

		return session.icon;
	}

	private getStatus(session: IAgentSessionViewModel): string {
		return `${session.providerLabel} • ${fromNow(session.timing.startTime)}`;
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<IAgentSessionViewModel>, FuzzyScore>, index: number, templateData: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		throw new Error('Should never happen since session is incompressible');
	}

	disposeElement(element: ITreeNode<IAgentSessionViewModel, FuzzyScore>, index: number, template: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		template.elementDisposable.clear();
	}

	disposeTemplate(templateData: IAgentSessionItemTemplate): void {
		templateData.disposables.dispose();
	}
}

export class AgentSessionsListDelegate implements IListVirtualDelegate<IAgentSessionViewModel> {

	static readonly ITEM_HEIGHT = 44;

	getHeight(element: IAgentSessionViewModel): number {
		return AgentSessionsListDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: IAgentSessionViewModel): string {
		return AgentSessionRenderer.TEMPLATE_ID;
	}
}

export class AgentSessionsAccessibilityProvider implements IListAccessibilityProvider<IAgentSessionViewModel> {

	getWidgetAriaLabel(): string {
		return localize('agentSessions', "Agent Sessions");
	}

	getAriaLabel(element: IAgentSessionViewModel): string | null {
		return element.label;
	}
}

export class AgentSessionsDataSource implements IAsyncDataSource<IAgentSessionsViewModel, IAgentSessionViewModel> {

	hasChildren(element: IAgentSessionsViewModel | IAgentSessionViewModel): boolean {
		return isAgentSessionsViewModel(element);
	}

	getChildren(element: IAgentSessionsViewModel | IAgentSessionViewModel): Iterable<IAgentSessionViewModel> {
		if (!isAgentSessionsViewModel(element)) {
			return [];
		}

		return element.sessions;
	}
}

export class AgentSessionsIdentityProvider implements IIdentityProvider<IAgentSessionsViewModel | IAgentSessionViewModel> {

	getId(element: IAgentSessionsViewModel | IAgentSessionViewModel): string {
		if (isAgentSession(element)) {
			return element.resource.toString();
		}

		return 'agent-sessions-id';
	}
}

export class AgentSessionsCompressionDelegate implements ITreeCompressionDelegate<IAgentSessionViewModel> {

	isIncompressible(element: IAgentSessionViewModel): boolean {
		return true;
	}
}

export class AgentSessionsSorter implements ITreeSorter<IAgentSessionViewModel> {

	compare(sessionA: IAgentSessionViewModel, sessionB: IAgentSessionViewModel): number {
		const aHasEndTime = !!sessionA.timing.endTime;
		const bHasEndTime = !!sessionB.timing.endTime;

		if (!aHasEndTime && bHasEndTime) {
			return -1; // a (in-progress) comes before b (finished)
		}
		if (aHasEndTime && !bHasEndTime) {
			return 1; // a (finished) comes after b (in-progress)
		}

		// Both in-progress or finished: sort by start time (most recent first)
		return sessionB.timing.startTime - sessionA.timing.startTime;
	}
}

export class AgentSessionsKeyboardNavigationLabelProvider implements ICompressibleKeyboardNavigationLabelProvider<IAgentSessionViewModel> {

	getKeyboardNavigationLabel(element: IAgentSessionViewModel): string {
		return element.label;
	}

	getCompressedNodeKeyboardNavigationLabel(elements: IAgentSessionViewModel[]): { toString(): string | undefined } | undefined {
		return undefined; // not enabled
	}
}

export class AgentSessionsDragAndDrop extends Disposable implements ITreeDragAndDrop<IAgentSessionViewModel> {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const elements = data.getData() as IAgentSessionViewModel[];
		const uris = coalesce(elements.map(e => e.resource));
		this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, uris, originalEvent));
	}

	getDragURI(element: IAgentSessionViewModel): string | null {
		return element.resource.toString();
	}

	getDragLabel?(elements: IAgentSessionViewModel[], originalEvent: DragEvent): string | undefined {
		if (elements.length === 1) {
			return elements[0].label;
		}

		return localize('agentSessions.dragLabel', "{0} agent sessions", elements.length);
	}

	onDragOver(data: IDragAndDropData, targetElement: IAgentSessionViewModel | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		return false;
	}

	drop(data: IDragAndDropData, targetElement: IAgentSessionViewModel | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void { }
}
