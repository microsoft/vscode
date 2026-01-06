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
import { AgentSessionSection, AgentSessionStatus, getAgentChangesSummary, hasValidDiff, IAgentSession, IAgentSessionSection, IAgentSessionsModel, isAgentSession, isAgentSessionSection, isAgentSessionsModel, isSessionInProgressStatus } from './agentSessionsModel.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow, getDurationString } from '../../../../../base/common/date.js';
import { FuzzyScore, createMatches } from '../../../../../base/common/filters.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { allowedChatMarkdownHtmlTags } from '../widget/chatContentMarkdownRenderer.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IDragAndDropData } from '../../../../../base/browser/dnd.js';
import { ListViewTargetSector } from '../../../../../base/browser/ui/list/listView.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { fillEditorsDragData } from '../../../../browser/dnd.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IntervalTimer } from '../../../../../base/common/async.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { Event } from '../../../../../base/common/event.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { MarkdownString, IMarkdownString } from '../../../../../base/common/htmlContent.js';

export type AgentSessionListItem = IAgentSession | IAgentSessionSection;

//#region Agent Session Renderer

interface IAgentSessionItemTemplate {
	readonly element: HTMLElement;

	// Column 1
	readonly icon: HTMLElement;

	// Column 2 Row 1
	readonly title: IconLabel;
	readonly titleToolbar: MenuWorkbenchToolBar;

	// Column 2 Row 2
	readonly diffContainer: HTMLElement;
	readonly diffFilesSpan: HTMLSpanElement;
	readonly diffAddedSpan: HTMLSpanElement;
	readonly diffRemovedSpan: HTMLSpanElement;

	readonly badge: HTMLElement;
	readonly description: HTMLElement;
	readonly status: HTMLElement;

	readonly contextKeyService: IContextKeyService;
	readonly elementDisposable: DisposableStore;
	readonly disposables: IDisposable;
}

export interface IAgentSessionRendererOptions {
	getHoverPosition(): HoverPosition;
}

export class AgentSessionRenderer implements ICompressibleTreeRenderer<IAgentSession, FuzzyScore, IAgentSessionItemTemplate> {

	static readonly TEMPLATE_ID = 'agent-session';

	readonly templateId = AgentSessionRenderer.TEMPLATE_ID;

	constructor(
		private readonly options: IAgentSessionRendererOptions,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IProductService private readonly productService: IProductService,
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
						h('div.agent-session-diff-container@diffContainer',
							[
								h('span.agent-session-diff-files@filesSpan'),
								h('span.agent-session-diff-added@addedSpan'),
								h('span.agent-session-diff-removed@removedSpan')
							]),
						h('div.agent-session-badge@badge'),
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

		container.appendChild(elements.item);

		return {
			element: elements.item,
			icon: elements.icon,
			title: disposables.add(new IconLabel(elements.title, { supportHighlights: true, supportIcons: true })),
			titleToolbar,
			diffContainer: elements.diffContainer,
			diffFilesSpan: elements.filesSpan,
			diffAddedSpan: elements.addedSpan,
			diffRemovedSpan: elements.removedSpan,
			badge: elements.badge,
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
		template.diffFilesSpan.textContent = '';
		template.diffAddedSpan.textContent = '';
		template.diffRemovedSpan.textContent = '';
		template.badge.textContent = '';
		template.description.textContent = '';

		// Archived
		template.element.classList.toggle('archived', session.element.isArchived());

		// Icon
		template.icon.className = `agent-session-icon ${ThemeIcon.asClassName(this.getIcon(session.element))}`;

		// Title
		const markdownTitle = new MarkdownString(session.element.label);
		template.title.setLabel(renderAsPlaintext(markdownTitle), undefined, { matches: createMatches(session.filterData) });

		// Title Actions - Update context keys
		ChatContextKeys.isArchivedAgentSession.bindTo(template.contextKeyService).set(session.element.isArchived());
		ChatContextKeys.isReadAgentSession.bindTo(template.contextKeyService).set(session.element.isRead());
		ChatContextKeys.agentSessionType.bindTo(template.contextKeyService).set(session.element.providerType);
		template.titleToolbar.context = session.element;

		// Diff information
		let hasDiff = false;
		const { changes: diff } = session.element;
		if (!isSessionInProgressStatus(session.element.status) && diff && hasValidDiff(diff)) {
			if (this.renderDiff(session, template)) {
				hasDiff = true;
			}
		}
		template.diffContainer.classList.toggle('has-diff', hasDiff);

		// Badge
		let hasBadge = false;
		if (!isSessionInProgressStatus(session.element.status)) {
			hasBadge = this.renderBadge(session, template);
		}
		template.badge.classList.toggle('has-badge', hasBadge);

		// Description (unless diff is shown)
		if (!hasDiff) {
			this.renderDescription(session, template, hasBadge);
		}

		// Status
		this.renderStatus(session, template);

		// Hover
		this.renderHover(session, template);
	}

	private renderBadge(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate): boolean {
		const badge = session.element.badge;
		if (badge) {
			this.renderMarkdownOrText(badge, template.badge, template.elementDisposable);
		}

		return !!badge;
	}

	private renderMarkdownOrText(content: string | IMarkdownString, container: HTMLElement, disposables: DisposableStore): void {
		if (typeof content === 'string') {
			container.textContent = content;
		} else {
			disposables.add(this.markdownRendererService.render(content, {
				sanitizerConfig: {
					replaceWithPlaintext: true,
					allowedTags: {
						override: allowedChatMarkdownHtmlTags,
					},
					allowedLinkSchemes: { augment: [this.productService.urlProtocol] }
				},
			}, container));
		}
	}

	private renderDiff(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate): boolean {
		const diff = getAgentChangesSummary(session.element.changes);
		if (!diff) {
			return false;
		}

		if (diff.files > 0) {
			template.diffFilesSpan.textContent = diff.files === 1 ? localize('diffFile', "1 file") : localize('diffFiles', "{0} files", diff.files);
		}

		if (diff.insertions >= 0 /* render even `0` for more homogeneity */) {
			template.diffAddedSpan.textContent = `+${diff.insertions}`;
		}

		if (diff.deletions >= 0 /* render even `0` for more homogeneity */) {
			template.diffRemovedSpan.textContent = `-${diff.deletions}`;
		}

		return true;
	}

	private getIcon(session: IAgentSession): ThemeIcon {
		if (session.status === AgentSessionStatus.InProgress) {
			return Codicon.sessionInProgress;
		}

		if (session.status === AgentSessionStatus.NeedsInput) {
			return Codicon.report;
		}

		if (session.status === AgentSessionStatus.Failed) {
			return Codicon.error;
		}

		if (!session.isRead() && !session.isArchived()) {
			return Codicon.circleFilled;
		}

		return Codicon.circleSmallFilled;
	}

	private renderDescription(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate, hasBadge: boolean): void {
		const description = session.element.description;
		if (description) {
			this.renderMarkdownOrText(description, template.description, template.elementDisposable);
		}

		// Fallback to state label
		else {
			if (session.element.status === AgentSessionStatus.InProgress) {
				template.description.textContent = localize('chat.session.status.inProgress', "Working...");
			} else if (session.element.status === AgentSessionStatus.NeedsInput) {
				template.description.textContent = localize('chat.session.status.needsInput', "Input needed.");
			} else if (hasBadge && session.element.status === AgentSessionStatus.Completed) {
				template.description.textContent = ''; // no description if completed and has badge
			} else if (
				session.element.timing.finishedOrFailedTime &&
				session.element.timing.inProgressTime &&
				session.element.timing.finishedOrFailedTime > session.element.timing.inProgressTime
			) {
				const duration = this.toDuration(session.element.timing.inProgressTime, session.element.timing.finishedOrFailedTime, false);

				template.description.textContent = session.element.status === AgentSessionStatus.Failed ?
					localize('chat.session.status.failedAfter', "Failed after {0}.", duration ?? '1s') :
					localize('chat.session.status.completedAfter', "Completed in {0}.", duration ?? '1s');
			} else {
				template.description.textContent = session.element.status === AgentSessionStatus.Failed ?
					localize('chat.session.status.failed', "Failed") :
					localize('chat.session.status.completed', "Completed");
			}
		}
	}

	private toDuration(startTime: number, endTime: number, useFullTimeWords: boolean): string | undefined {
		const elapsed = Math.round((endTime - startTime) / 1000) * 1000;
		if (elapsed < 1000) {
			return undefined;
		}

		return getDurationString(elapsed, useFullTimeWords);
	}

	private renderStatus(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate): void {

		const getStatus = (session: IAgentSession) => {
			let timeLabel: string | undefined;
			if (session.status === AgentSessionStatus.InProgress && session.timing.inProgressTime) {
				timeLabel = this.toDuration(session.timing.inProgressTime, Date.now(), false);
			}

			if (!timeLabel) {
				timeLabel = fromNow(session.timing.endTime || session.timing.startTime);
			}

			return `${session.providerLabel} • ${timeLabel}`;
		};

		template.status.textContent = getStatus(session.element);
		const timer = template.elementDisposable.add(new IntervalTimer());
		timer.cancelAndSet(() => template.status.textContent = getStatus(session.element), session.element.status === AgentSessionStatus.InProgress ? 1000 /* every second */ : 60 * 1000 /* every minute */);
	}

	private renderHover(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate): void {
		template.elementDisposable.add(
			this.hoverService.setupDelayedHover(template.element, () => ({
				content: this.buildTooltip(session.element),
				style: HoverStyle.Pointer,
				position: {
					hoverPosition: this.options.getHoverPosition()
				}
			}), { groupId: 'agent.sessions' })
		);
	}

	private buildTooltip(session: IAgentSession): IMarkdownString {
		const lines: string[] = [];

		// Title
		lines.push(`**${session.label}**`);

		// Tooltip (from provider)
		if (session.tooltip) {
			const tooltip = typeof session.tooltip === 'string' ? session.tooltip : session.tooltip.value;
			lines.push(tooltip);
		} else {

			// Description
			if (session.description) {
				const description = typeof session.description === 'string' ? session.description : session.description.value;
				lines.push(description);
			}

			// Badge
			if (session.badge) {
				const badge = typeof session.badge === 'string' ? session.badge : session.badge.value;
				lines.push(badge);
			}
		}

		// Details line: Status • Provider • Duration/Time
		const details: string[] = [];

		// Status
		details.push(toStatusLabel(session.status));

		// Provider
		details.push(session.providerLabel);

		// Duration or start time
		if (session.timing.finishedOrFailedTime && session.timing.inProgressTime) {
			const duration = this.toDuration(session.timing.inProgressTime, session.timing.finishedOrFailedTime, true);
			if (duration) {
				details.push(duration);
			}
		} else {
			details.push(fromNow(session.timing.startTime, true, true));
		}

		lines.push(details.join(' • '));

		// Diff information
		const diff = getAgentChangesSummary(session.changes);
		if (diff && hasValidDiff(session.changes)) {
			const diffParts: string[] = [];
			if (diff.files > 0) {
				diffParts.push(diff.files === 1 ? localize('tooltip.file', "1 file") : localize('tooltip.files', "{0} files", diff.files));
			}
			if (diff.insertions > 0) {
				diffParts.push(`+${diff.insertions}`);
			}
			if (diff.deletions > 0) {
				diffParts.push(`-${diff.deletions}`);
			}
			if (diffParts.length > 0) {
				lines.push(`$(diff) ${diffParts.join(', ')}`);
			}
		}

		// Archived status
		if (session.isArchived()) {
			lines.push(`$(archive) ${localize('tooltip.archived', "Archived")}`);
		}

		return new MarkdownString(lines.join('\n\n'), { supportThemeIcons: true });
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

function toStatusLabel(status: AgentSessionStatus): string {
	let statusLabel: string;
	switch (status) {
		case AgentSessionStatus.NeedsInput:
			statusLabel = localize('agentSessionNeedsInput', "Needs Input");
			break;
		case AgentSessionStatus.InProgress:
			statusLabel = localize('agentSessionInProgress', "In Progress");
			break;
		case AgentSessionStatus.Failed:
			statusLabel = localize('agentSessionFailed', "Failed");
			break;
		default:
			statusLabel = localize('agentSessionCompleted', "Completed");
	}

	return statusLabel;
}

//#endregion

//#region Section Header Renderer

interface IAgentSessionSectionTemplate {
	readonly container: HTMLElement;
	readonly label: HTMLSpanElement;
	readonly toolbar: MenuWorkbenchToolBar;
	readonly contextKeyService: IContextKeyService;
	readonly disposables: IDisposable;
}

export class AgentSessionSectionRenderer implements ICompressibleTreeRenderer<IAgentSessionSection, FuzzyScore, IAgentSessionSectionTemplate> {

	static readonly TEMPLATE_ID = 'agent-session-section';

	readonly templateId = AgentSessionSectionRenderer.TEMPLATE_ID;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) { }

	renderTemplate(container: HTMLElement): IAgentSessionSectionTemplate {
		const disposables = new DisposableStore();

		const elements = h(
			'div.agent-session-section@container',
			[
				h('span.agent-session-section-label@label'),
				h('div.agent-session-section-toolbar@toolbar')
			]
		);

		const contextKeyService = disposables.add(this.contextKeyService.createScoped(elements.container));
		const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, elements.toolbar, MenuId.AgentSessionSectionToolbar, {
			menuOptions: { shouldForwardArgs: true },
		}));

		container.appendChild(elements.container);

		return {
			container: elements.container,
			label: elements.label,
			toolbar,
			contextKeyService,
			disposables
		};
	}

	renderElement(element: ITreeNode<IAgentSessionSection, FuzzyScore>, index: number, template: IAgentSessionSectionTemplate, details?: ITreeElementRenderDetails): void {

		// Label
		template.label.textContent = element.element.label;

		// Toolbar
		ChatContextKeys.agentSessionSection.bindTo(template.contextKeyService).set(element.element.section);
		template.toolbar.context = element.element;
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<IAgentSessionSection>, FuzzyScore>, index: number, templateData: IAgentSessionSectionTemplate, details?: ITreeElementRenderDetails): void {
		throw new Error('Should never happen since section header is incompressible');
	}

	disposeElement(element: ITreeNode<IAgentSessionSection, FuzzyScore>, index: number, template: IAgentSessionSectionTemplate, details?: ITreeElementRenderDetails): void {
		// noop
	}

	disposeTemplate(templateData: IAgentSessionSectionTemplate): void {
		templateData.disposables.dispose();
	}
}

//#endregion

export class AgentSessionsListDelegate implements IListVirtualDelegate<AgentSessionListItem> {

	static readonly ITEM_HEIGHT = 52;
	static readonly SECTION_HEIGHT = 26;

	getHeight(element: AgentSessionListItem): number {
		if (isAgentSessionSection(element)) {
			return AgentSessionsListDelegate.SECTION_HEIGHT;
		}

		return AgentSessionsListDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: AgentSessionListItem): string {
		if (isAgentSessionSection(element)) {
			return AgentSessionSectionRenderer.TEMPLATE_ID;
		}

		return AgentSessionRenderer.TEMPLATE_ID;
	}
}

export class AgentSessionsAccessibilityProvider implements IListAccessibilityProvider<AgentSessionListItem> {

	getWidgetAriaLabel(): string {
		return localize('agentSessions', "Agent Sessions");
	}

	getAriaLabel(element: AgentSessionListItem): string | null {
		if (isAgentSessionSection(element)) {
			return localize('agentSessionSectionAriaLabel', "{0} sessions section", element.label);
		}

		return localize('agentSessionItemAriaLabel', "{0} session {1} ({2}), created {3}", element.providerLabel, element.label, toStatusLabel(element.status), new Date(element.timing.startTime).toLocaleString());
	}
}

export interface IAgentSessionsFilter {

	/**
	 * An event that fires when the filter changes and sessions
	 * should be re-evaluated.
	 */
	readonly onDidChange: Event<void>;

	/**
	 * Optional limit on the number of sessions to show.
	 */
	readonly limitResults?: () => number | undefined;

	/**
	 * Whether to show section headers to group sessions.
	 * When false, sessions are shown as a flat list.
	 */
	readonly groupResults?: () => boolean | undefined;

	/**
	 * A callback to notify the filter about the number of
	 * results after filtering.
	 */
	notifyResults?(count: number): void;

	/**
	 * The logic to exclude sessions from the view.
	 */
	exclude(session: IAgentSession): boolean;
}

export class AgentSessionsDataSource implements IAsyncDataSource<IAgentSessionsModel, AgentSessionListItem> {

	constructor(
		private readonly filter: IAgentSessionsFilter | undefined,
		private readonly sorter: ITreeSorter<IAgentSession>,
	) { }

	hasChildren(element: IAgentSessionsModel | AgentSessionListItem): boolean {

		// Sessions model
		if (isAgentSessionsModel(element)) {
			return true;
		}

		// Sessions	section
		else if (isAgentSessionSection(element)) {
			return element.sessions.length > 0;
		}

		// Session element
		else {
			return false;
		}
	}

	getChildren(element: IAgentSessionsModel | AgentSessionListItem): Iterable<AgentSessionListItem> {

		// Sessions model
		if (isAgentSessionsModel(element)) {

			// Apply filter if configured
			let filteredSessions = element.sessions.filter(session => !this.filter?.exclude(session));

			// Apply sorter unless we group into sections or we are to limit results
			const limitResultsCount = this.filter?.limitResults?.();
			if (!this.filter?.groupResults?.() || typeof limitResultsCount === 'number') {
				filteredSessions.sort(this.sorter.compare.bind(this.sorter));
			}

			// Apply limiter if configured (requires sorting)
			if (typeof limitResultsCount === 'number') {
				filteredSessions = filteredSessions.slice(0, limitResultsCount);
			}

			// Callback results count
			this.filter?.notifyResults?.(filteredSessions.length);

			// Group sessions into sections if enabled
			if (this.filter?.groupResults?.()) {
				return this.groupSessionsIntoSections(filteredSessions);
			}

			// Otherwise return flat sorted list
			return filteredSessions;
		}

		// Sessions	section
		else if (isAgentSessionSection(element)) {
			return element.sessions;
		}

		// Session element
		else {
			return [];
		}
	}

	private groupSessionsIntoSections(sessions: IAgentSession[]): AgentSessionListItem[] {
		const result: AgentSessionListItem[] = [];

		const sortedSessions = sessions.sort(this.sorter.compare.bind(this.sorter));
		const groupedSessions = groupAgentSessions(sortedSessions);

		for (const { sessions, section, label } of groupedSessions.values()) {
			if (sessions.length === 0) {
				continue;
			}

			result.push({ section, label, sessions });
		}

		return result;
	}
}

const DAY_THRESHOLD = 24 * 60 * 60 * 1000;
const WEEK_THRESHOLD = 7 * DAY_THRESHOLD;

export const AgentSessionSectionLabels = {
	[AgentSessionSection.InProgress]: localize('agentSessions.inProgressSection', "In Progress"),
	[AgentSessionSection.Today]: localize('agentSessions.todaySection', "Today"),
	[AgentSessionSection.Yesterday]: localize('agentSessions.yesterdaySection', "Yesterday"),
	[AgentSessionSection.Week]: localize('agentSessions.weekSection', "Last Week"),
	[AgentSessionSection.Older]: localize('agentSessions.olderSection', "Older"),
	[AgentSessionSection.Archived]: localize('agentSessions.archivedSection', "Archived"),
};

export function groupAgentSessions(sessions: IAgentSession[]): Map<AgentSessionSection, IAgentSessionSection> {
	const now = Date.now();
	const startOfToday = new Date(now).setHours(0, 0, 0, 0);
	const startOfYesterday = startOfToday - DAY_THRESHOLD;
	const weekThreshold = now - WEEK_THRESHOLD;

	const inProgressSessions: IAgentSession[] = [];
	const todaySessions: IAgentSession[] = [];
	const yesterdaySessions: IAgentSession[] = [];
	const weekSessions: IAgentSession[] = [];
	const olderSessions: IAgentSession[] = [];
	const archivedSessions: IAgentSession[] = [];

	for (const session of sessions) {
		if (isSessionInProgressStatus(session.status)) {
			inProgressSessions.push(session);
		} else if (session.isArchived()) {
			archivedSessions.push(session);
		} else {
			const sessionTime = session.timing.endTime || session.timing.startTime;
			if (sessionTime >= startOfToday) {
				todaySessions.push(session);
			} else if (sessionTime >= startOfYesterday) {
				yesterdaySessions.push(session);
			} else if (sessionTime >= weekThreshold) {
				weekSessions.push(session);
			} else {
				olderSessions.push(session);
			}
		}
	}

	return new Map<AgentSessionSection, IAgentSessionSection>([
		[AgentSessionSection.InProgress, { section: AgentSessionSection.InProgress, label: AgentSessionSectionLabels[AgentSessionSection.InProgress], sessions: inProgressSessions }],
		[AgentSessionSection.Today, { section: AgentSessionSection.Today, label: AgentSessionSectionLabels[AgentSessionSection.Today], sessions: todaySessions }],
		[AgentSessionSection.Yesterday, { section: AgentSessionSection.Yesterday, label: AgentSessionSectionLabels[AgentSessionSection.Yesterday], sessions: yesterdaySessions }],
		[AgentSessionSection.Week, { section: AgentSessionSection.Week, label: AgentSessionSectionLabels[AgentSessionSection.Week], sessions: weekSessions }],
		[AgentSessionSection.Older, { section: AgentSessionSection.Older, label: AgentSessionSectionLabels[AgentSessionSection.Older], sessions: olderSessions }],
		[AgentSessionSection.Archived, { section: AgentSessionSection.Archived, label: AgentSessionSectionLabels[AgentSessionSection.Archived], sessions: archivedSessions }],
	]);
}

export class AgentSessionsIdentityProvider implements IIdentityProvider<IAgentSessionsModel | AgentSessionListItem> {

	getId(element: IAgentSessionsModel | AgentSessionListItem): string {
		if (isAgentSessionSection(element)) {
			return `section-${element.section}`;
		}

		if (isAgentSession(element)) {
			return element.resource.toString();
		}

		return 'agent-sessions-id';
	}
}

export class AgentSessionsCompressionDelegate implements ITreeCompressionDelegate<AgentSessionListItem> {

	isIncompressible(element: AgentSessionListItem): boolean {
		return true;
	}
}

export interface IAgentSessionsSorterOptions {
	overrideCompare?(sessionA: IAgentSession, sessionB: IAgentSession): number | undefined;
}

export class AgentSessionsSorter implements ITreeSorter<IAgentSession> {

	constructor(private readonly options?: IAgentSessionsSorterOptions) { }

	compare(sessionA: IAgentSession, sessionB: IAgentSession): number {

		// Input Needed
		const aNeedsInput = sessionA.status === AgentSessionStatus.NeedsInput;
		const bNeedsInput = sessionB.status === AgentSessionStatus.NeedsInput;

		if (aNeedsInput && !bNeedsInput) {
			return -1; // a (needs input) comes before b (other)
		}
		if (!aNeedsInput && bNeedsInput) {
			return 1; // a (other) comes after b (needs input)
		}

		// In Progress
		const aInProgress = sessionA.status === AgentSessionStatus.InProgress;
		const bInProgress = sessionB.status === AgentSessionStatus.InProgress;

		if (aInProgress && !bInProgress) {
			return -1; // a (in-progress) comes before b (finished)
		}
		if (!aInProgress && bInProgress) {
			return 1; // a (finished) comes after b (in-progress)
		}

		// Archived
		const aArchived = sessionA.isArchived();
		const bArchived = sessionB.isArchived();

		if (!aArchived && bArchived) {
			return -1; // a (non-archived) comes before b (archived)
		}
		if (aArchived && !bArchived) {
			return 1; // a (archived) comes after b (non-archived)
		}

		// Before we compare by time, allow override
		const override = this.options?.overrideCompare?.(sessionA, sessionB);
		if (typeof override === 'number') {
			return override;
		}

		//Sort by end or start time (most recent first)
		return (sessionB.timing.endTime || sessionB.timing.startTime) - (sessionA.timing.endTime || sessionA.timing.startTime);
	}
}

export class AgentSessionsKeyboardNavigationLabelProvider implements ICompressibleKeyboardNavigationLabelProvider<AgentSessionListItem> {

	getKeyboardNavigationLabel(element: AgentSessionListItem): string {
		if (isAgentSessionSection(element)) {
			return element.label;
		}

		return element.label;
	}

	getCompressedNodeKeyboardNavigationLabel(elements: AgentSessionListItem[]): { toString(): string | undefined } | undefined {
		return undefined; // not enabled
	}
}

export class AgentSessionsDragAndDrop extends Disposable implements ITreeDragAndDrop<AgentSessionListItem> {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const elements = (data.getData() as AgentSessionListItem[]).filter(e => isAgentSession(e));
		const uris = coalesce(elements.map(e => e.resource));
		this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, uris, originalEvent));
	}

	getDragURI(element: AgentSessionListItem): string | null {
		if (isAgentSessionSection(element)) {
			return null; // section headers are not draggable
		}

		return element.resource.toString();
	}

	getDragLabel?(elements: AgentSessionListItem[], originalEvent: DragEvent): string | undefined {
		const sessions = elements.filter(e => isAgentSession(e));
		if (sessions.length === 1) {
			return sessions[0].label;
		}

		return localize('agentSessions.dragLabel', "{0} agent sessions", sessions.length);
	}

	onDragOver(data: IDragAndDropData, targetElement: AgentSessionListItem | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		return false;
	}

	drop(data: IDragAndDropData, targetElement: AgentSessionListItem | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void { }
}
