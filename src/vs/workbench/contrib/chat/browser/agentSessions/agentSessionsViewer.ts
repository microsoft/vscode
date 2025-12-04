/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsessionsviewer.css';
import { h } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { ITreeCompressionDelegate } from '../../../../../base/browser/ui/tree/asyncDataTree.js';
import { ICompressedTreeNode } from '../../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleKeyboardNavigationLabelProvider, ICompressibleTreeRenderer } from '../../../../../base/browser/ui/tree/objectTree.js';
import { ITreeNode, ITreeElementRenderDetails, IAsyncDataSource, ITreeSorter, ITreeDragAndDrop, ITreeDragOverReaction } from '../../../../../base/browser/ui/tree/tree.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IAgentSession, IAgentSessionsModel, isAgentSession, isAgentSessionsModel } from './agentSessionsModel.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow, getDurationString } from '../../../../../base/common/date.js';
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
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { AgentSessionDiffActionViewItem, AgentSessionShowDiffAction } from './agentSessionsActions.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { Event } from '../../../../../base/common/event.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';

interface IAgentSessionItemTemplate {
	readonly element: HTMLElement;

	// Column 1
	readonly icon: HTMLElement;

	// Column 2 Row 1
	readonly title: IconLabel;
	readonly titleToolbar: MenuWorkbenchToolBar;

	// Column 2 Row 2
	readonly detailsToolbar: ActionBar;
	readonly description: HTMLElement;
	readonly status: HTMLElement;

	readonly contextKeyService: IContextKeyService;
	readonly elementDisposable: DisposableStore;
	readonly disposables: IDisposable;
}

export class AgentSessionRenderer implements ICompressibleTreeRenderer<IAgentSession, FuzzyScore, IAgentSessionItemTemplate> {

	static readonly TEMPLATE_ID = 'agent-session';

	readonly templateId = AgentSessionRenderer.TEMPLATE_ID;

	constructor(
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IProductService private readonly productService: IProductService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) { }

	renderTemplate(container: HTMLElement): IAgentSessionItemTemplate {
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
						h('div.agent-session-title-toolbar@titleToolbar'),
					]),
					h('div.agent-session-details-row', [
						h('div.agent-session-details-toolbar@detailsToolbar'),
						h('div.agent-session-description@description'),
						h('div.agent-session-status@status')
					])
				])
			]
		);

		const contextKeyService = disposables.add(this.contextKeyService.createScoped(elements.item));
		const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		const titleToolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, elements.titleToolbar, MenuId.AgentSessionItemToolbar, {
			menuOptions: { shouldForwardArgs: true },
		}));

		const detailsToolbar = disposables.add(new ActionBar(elements.detailsToolbar, {
			actionViewItemProvider: (action, options) => {
				if (action.id === AgentSessionShowDiffAction.ID) {
					return this.instantiationService.createInstance(AgentSessionDiffActionViewItem, action, options);
				}

				return undefined;
			},
		}));

		container.appendChild(elements.item);

		return {
			element: elements.item,
			icon: elements.icon,
			title: disposables.add(new IconLabel(elements.title, { supportHighlights: true, supportIcons: true })),
			titleToolbar,
			detailsToolbar,
			description: elements.description,
			status: elements.status,
			contextKeyService,
			elementDisposable,
			disposables
		};
	}

	renderElement(session: ITreeNode<IAgentSession, FuzzyScore>, index: number, template: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {

		// Clear old state
		template.elementDisposable.clear();
		template.detailsToolbar.clear();
		template.description.textContent = '';

		// Icon
		template.icon.className = `agent-session-icon ${ThemeIcon.asClassName(this.getIcon(session.element))}`;

		// Title
		const markdownTitle = new MarkdownString(session.element.label);
		template.title.setLabel(renderAsPlaintext(markdownTitle), undefined, { matches: createMatches(session.filterData) });

		// Title Actions - Update context keys
		ChatContextKeys.isArchivedAgentSession.bindTo(template.contextKeyService).set(session.element.isArchived());
		template.titleToolbar.context = session.element;

		// Details Actions
		const { statistics: diff } = session.element;
		if (session.element.status !== ChatSessionStatus.InProgress && diff && (diff.files > 0 || diff.insertions > 0 || diff.deletions > 0)) {
			const diffAction = template.elementDisposable.add(new AgentSessionShowDiffAction(session.element));
			template.detailsToolbar.push([diffAction], { icon: false, label: true });
		}

		// Description otherwise
		else {
			this.renderDescription(session, template);
		}

		// Status
		this.renderStatus(session, template);

		// Hover
		this.renderHover(session, template);
	}

	private getIcon(session: IAgentSession): ThemeIcon {
		if (session.status === ChatSessionStatus.InProgress) {
			return ThemeIcon.modify(Codicon.loading, 'spin');
		}

		if (session.status === ChatSessionStatus.Failed) {
			return Codicon.error;
		}

		return Codicon.pass;
	}

	private renderDescription(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate): void {

		// Support description as string
		if (typeof session.element.description === 'string') {
			template.description.textContent = session.element.description;
		}

		// or as markdown
		else if (session.element.description) {
			template.elementDisposable.add(this.markdownRendererService.render(session.element.description, {
				sanitizerConfig: {
					replaceWithPlaintext: true,
					allowedTags: {
						override: allowedChatMarkdownHtmlTags,
					},
					allowedLinkSchemes: { augment: [this.productService.urlProtocol] }
				},
			}, template.description));
		}

		// Fallback to state label
		else {
			if (session.element.status === ChatSessionStatus.InProgress) {
				template.description.textContent = localize('chat.session.status.inProgress', "Working...");
			} else if (
				session.element.timing.finishedOrFailedTime &&
				session.element.timing.inProgressTime &&
				session.element.timing.finishedOrFailedTime > session.element.timing.inProgressTime
			) {
				const duration = this.toDuration(session.element.timing.inProgressTime, session.element.timing.finishedOrFailedTime);

				template.description.textContent = session.element.status === ChatSessionStatus.Failed ?
					localize('chat.session.status.failedAfter', "Failed after {0}.", duration ?? '1s') :
					localize('chat.session.status.completedAfter', "Finished in {0}.", duration ?? '1s');
			} else {
				template.description.textContent = session.element.status === ChatSessionStatus.Failed ?
					localize('chat.session.status.failed', "Failed") :
					localize('chat.session.status.completed', "Finished");
			}
		}
	}

	private toDuration(startTime: number, endTime: number): string | undefined {
		const elapsed = Math.round((endTime - startTime) / 1000) * 1000;
		if (elapsed < 1000) {
			return undefined;
		}

		return getDurationString(elapsed);
	}

	private renderStatus(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate): void {

		const getStatus = (session: IAgentSession) => {
			let timeLabel: string | undefined;
			if (session.status === ChatSessionStatus.InProgress && session.timing.inProgressTime) {
				timeLabel = this.toDuration(session.timing.inProgressTime, Date.now());
			}

			if (!timeLabel) {
				timeLabel = fromNow(session.timing.endTime || session.timing.startTime);
			}
			return `${session.providerLabel} • ${timeLabel}`;
		};

		template.status.textContent = getStatus(session.element);
		const timer = template.elementDisposable.add(new IntervalTimer());
		timer.cancelAndSet(() => template.status.textContent = getStatus(session.element), session.element.status === ChatSessionStatus.InProgress ? 1000 /* every second */ : 60 * 1000 /* every minute */);
	}

	private renderHover(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate): void {
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
				}), { groupId: 'agent.sessions' })
			);
		}
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<IAgentSession>, FuzzyScore>, index: number, templateData: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		throw new Error('Should never happen since session is incompressible');
	}

	disposeElement(element: ITreeNode<IAgentSession, FuzzyScore>, index: number, template: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		template.elementDisposable.clear();
	}

	disposeTemplate(templateData: IAgentSessionItemTemplate): void {
		templateData.disposables.dispose();
	}
}

export class AgentSessionsListDelegate implements IListVirtualDelegate<IAgentSession> {

	static readonly ITEM_HEIGHT = 52;

	getHeight(element: IAgentSession): number {
		return AgentSessionsListDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: IAgentSession): string {
		return AgentSessionRenderer.TEMPLATE_ID;
	}
}

export class AgentSessionsAccessibilityProvider implements IListAccessibilityProvider<IAgentSession> {

	getWidgetAriaLabel(): string {
		return localize('agentSessions', "Agent Sessions");
	}

	getAriaLabel(element: IAgentSession): string | null {
		return element.label;
	}
}

export interface IAgentSessionsFilter {

	readonly onDidChange?: Event<void>;

	/**
	 * Optional limit on the number of sessions to show.
	 */
	readonly limitResults?: () => number | undefined;

	/**
	 * A callback to notify the filter about the number of
	 * results after filtering.
	 */
	notifyResults?(count: number): void;

	exclude?(session: IAgentSession): boolean;
}

export class AgentSessionsDataSource implements IAsyncDataSource<IAgentSessionsModel, IAgentSession> {

	constructor(
		private readonly filter: IAgentSessionsFilter | undefined,
		private readonly sorter: ITreeSorter<IAgentSession>,
	) { }

	hasChildren(element: IAgentSessionsModel | IAgentSession): boolean {
		return isAgentSessionsModel(element);
	}

	getChildren(element: IAgentSessionsModel | IAgentSession): Iterable<IAgentSession> {
		if (!isAgentSessionsModel(element)) {
			return [];
		}

		// Apply filter if configured
		let filteredSessions = element.sessions.filter(session => !this.filter?.exclude?.(session));

		// Apply limiter if configured (requires sorting)
		const limitResultsCount = this.filter?.limitResults?.();
		if (typeof limitResultsCount === 'number') {
			filteredSessions.sort(this.sorter.compare.bind(this.sorter));
			filteredSessions = filteredSessions.slice(0, limitResultsCount);
		}

		// Callback results count
		this.filter?.notifyResults?.(filteredSessions.length);

		return filteredSessions;
	}
}

export class AgentSessionsIdentityProvider implements IIdentityProvider<IAgentSessionsModel | IAgentSession> {

	getId(element: IAgentSessionsModel | IAgentSession): string {
		if (isAgentSession(element)) {
			return element.resource.toString();
		}

		return 'agent-sessions-id';
	}
}

export class AgentSessionsCompressionDelegate implements ITreeCompressionDelegate<IAgentSession> {

	isIncompressible(element: IAgentSession): boolean {
		return true;
	}
}

export class AgentSessionsSorter implements ITreeSorter<IAgentSession> {

	compare(sessionA: IAgentSession, sessionB: IAgentSession): number {
		const aInProgress = sessionA.status === ChatSessionStatus.InProgress;
		const bInProgress = sessionB.status === ChatSessionStatus.InProgress;

		if (aInProgress && !bInProgress) {
			return -1; // a (in-progress) comes before b (finished)
		}
		if (!aInProgress && bInProgress) {
			return 1; // a (finished) comes after b (in-progress)
		}

		const aArchived = sessionA.isArchived();
		const bArchived = sessionB.isArchived();

		if (!aArchived && bArchived) {
			return -1; // a (non-archived) comes before b (archived)
		}
		if (aArchived && !bArchived) {
			return 1; // a (archived) comes after b (non-archived)
		}

		// Both in-progress or finished: sort by end or start time (most recent first)
		return (sessionB.timing.endTime || sessionB.timing.startTime) - (sessionA.timing.endTime || sessionA.timing.startTime);
	}
}

export class AgentSessionsKeyboardNavigationLabelProvider implements ICompressibleKeyboardNavigationLabelProvider<IAgentSession> {

	getKeyboardNavigationLabel(element: IAgentSession): string {
		return element.label;
	}

	getCompressedNodeKeyboardNavigationLabel(elements: IAgentSession[]): { toString(): string | undefined } | undefined {
		return undefined; // not enabled
	}
}

export class AgentSessionsDragAndDrop extends Disposable implements ITreeDragAndDrop<IAgentSession> {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const elements = data.getData() as IAgentSession[];
		const uris = coalesce(elements.map(e => e.resource));
		this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, uris, originalEvent));
	}

	getDragURI(element: IAgentSession): string | null {
		return element.resource.toString();
	}

	getDragLabel?(elements: IAgentSession[], originalEvent: DragEvent): string | undefined {
		if (elements.length === 1) {
			return elements[0].label;
		}

		return localize('agentSessions.dragLabel', "{0} agent sessions", elements.length);
	}

	onDragOver(data: IDragAndDropData, targetElement: IAgentSession | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		return false;
	}

	drop(data: IDragAndDropData, targetElement: IAgentSession | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void { }
}
