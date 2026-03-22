/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsessionsviewer.css';
import { h } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IIdentityProvider, IListVirtualDelegate, NotSelectableGroupId, NotSelectableGroupIdType } from '../../../../../base/browser/ui/list/list.js';
import { AriaRole } from '../../../../../base/browser/ui/aria/aria.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { ITreeCompressionDelegate } from '../../../../../base/browser/ui/tree/asyncDataTree.js';
import { ICompressedTreeNode } from '../../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleKeyboardNavigationLabelProvider, ICompressibleTreeRenderer } from '../../../../../base/browser/ui/tree/objectTree.js';
import { ITreeNode, ITreeElementRenderDetails, IAsyncDataSource, ITreeSorter, ITreeDragAndDrop, ITreeDragOverReaction } from '../../../../../base/browser/ui/tree/tree.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
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
import { HoverStyle, IDelayedHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IntervalTimer } from '../../../../../base/common/async.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { MarkdownString, IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { AgentSessionHoverWidget } from './agentSessionHoverWidget.js';
import { AgentSessionProviders } from './agentSessions.js';
import { AgentSessionsGrouping, AgentSessionsSorting } from './agentSessionsFilter.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AgentSessionApprovalModel } from './agentSessionApprovalModel.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';

export type AgentSessionListItem = IAgentSession | IAgentSessionSection;

//#region Agent Session Renderer

interface IAgentSessionItemTemplate {
	readonly element: HTMLElement;

	// Column 1
	readonly icon: HTMLElement;

	// Column 2 Row 1
	readonly title: IconLabel;
	readonly statusContainer: HTMLElement;
	readonly statusTime: HTMLElement;
	readonly titleToolbar: MenuWorkbenchToolBar;

	// Column 2 Row 2
	readonly diffContainer: HTMLElement;
	readonly diffAddedSpan: HTMLSpanElement;
	readonly diffRemovedSpan: HTMLSpanElement;

	readonly badge: HTMLElement;
	readonly separator: HTMLElement;
	readonly description: HTMLElement;

	// Approval row
	readonly approvalRow: HTMLElement;
	readonly approvalLabel: HTMLElement;
	readonly approvalButtonContainer: HTMLElement;

	readonly contextKeyService: IContextKeyService;
	readonly elementDisposable: DisposableStore;
	readonly disposables: IDisposable;
}

export interface IAgentSessionRendererOptions {
	readonly disableHover?: boolean;
	getHoverPosition(): HoverPosition;

	isGroupedByRepository?(): boolean;
	isSortedByUpdated?(): boolean;
}

export class AgentSessionRenderer extends Disposable implements ICompressibleTreeRenderer<IAgentSession, FuzzyScore, IAgentSessionItemTemplate> {

	static readonly TEMPLATE_ID = 'agent-session';

	static readonly APPROVAL_ROW_MAX_LINES = 3;
	private static readonly _APPROVAL_ROW_LINE_HEIGHT = 18;
	private static readonly _APPROVAL_ROW_OVERHEAD = 14; // 4px margin-top + 4px padding-top + 4px padding-bottom + 2px border

	static getApprovalRowHeight(label: string): number {
		const lineCount = Math.min(label.split(/\r?\n/).length, AgentSessionRenderer.APPROVAL_ROW_MAX_LINES);
		return lineCount * AgentSessionRenderer._APPROVAL_ROW_LINE_HEIGHT + AgentSessionRenderer._APPROVAL_ROW_OVERHEAD;
	}

	readonly templateId = AgentSessionRenderer.TEMPLATE_ID;

	private readonly sessionHover = this._register(new MutableDisposable<AgentSessionHoverWidget>());

	private readonly _onDidChangeItemHeight = this._register(new Emitter<IAgentSession>());
	readonly onDidChangeItemHeight: Event<IAgentSession> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly options: IAgentSessionRendererOptions,
		private readonly _approvalModel: AgentSessionApprovalModel | undefined,
		private readonly _activeSessionResource: IObservable<URI | undefined>,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IProductService private readonly productService: IProductService,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
	}

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
						h('div.agent-session-badge@badge'),
						h('span.agent-session-separator@separator'),
						h('div.agent-session-diff-container@diffContainer',
							[
								h('span.agent-session-diff-added@addedSpan'),
								h('span.agent-session-diff-removed@removedSpan')
							]),
						h('div.agent-session-description@description'),
						h('div.agent-session-status@statusContainer', [
							h('span.agent-session-status-time@statusTime'),
						]),
					]),
					h('div.agent-session-approval-row@approvalRow', [
						h('span.agent-session-approval-label@approvalLabel'),
						h('div.agent-session-approval-button@approvalButtonContainer'),
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
			badge: elements.badge,
			separator: elements.separator,
			diffContainer: elements.diffContainer,
			diffAddedSpan: elements.addedSpan,
			diffRemovedSpan: elements.removedSpan,
			description: elements.description,
			statusContainer: elements.statusContainer,
			statusTime: elements.statusTime,
			approvalRow: elements.approvalRow,
			approvalLabel: elements.approvalLabel,
			approvalButtonContainer: elements.approvalButtonContainer,
			contextKeyService,
			elementDisposable,
			disposables
		};
	}

	renderElement(session: ITreeNode<IAgentSession, FuzzyScore>, index: number, template: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {

		// Clear old state
		template.elementDisposable.clear();
		template.diffAddedSpan.textContent = '';
		template.diffRemovedSpan.textContent = '';
		template.badge.textContent = '';
		template.description.textContent = '';

		// Archived
		template.element.classList.toggle('archived', session.element.isArchived());

		// Icon
		template.icon.className = `agent-session-icon ${ThemeIcon.asClassName(this.getIcon(session.element))}${session.element.status === AgentSessionStatus.NeedsInput ? ' needs-input' : ''}`;

		// Title
		const markdownTitle = new MarkdownString(session.element.label);
		template.title.setLabel(renderAsPlaintext(markdownTitle), undefined, { matches: createMatches(session.filterData) });

		// Title Actions - Update context keys
		ChatContextKeys.isArchivedAgentSession.bindTo(template.contextKeyService).set(session.element.isArchived());
		ChatContextKeys.isPinnedAgentSession.bindTo(template.contextKeyService).set(session.element.isPinned());
		ChatContextKeys.isReadAgentSession.bindTo(template.contextKeyService).set(session.element.isRead());
		ChatContextKeys.agentSessionType.bindTo(template.contextKeyService).set(session.element.providerType);
		template.titleToolbar.context = session.element;

		// Badge
		const hasBadge = this.renderBadge(session, template);

		// Diff information
		let hasDiff = false;
		const { changes: diff } = session.element;
		if (!isSessionInProgressStatus(session.element.status) && diff && hasValidDiff(diff)) {
			if (this.renderDiff(session, template)) {
				hasDiff = true;
			}
		}

		let hasAgentSessionChanges = false;
		if (
			session.element.providerType === AgentSessionProviders.Background ||
			session.element.providerType === AgentSessionProviders.Cloud
		) {
			// Background and Cloud agents provide the list of changes directly,
			// so we have to use the list of changes to determine whether to show
			// the "View All Changes" action
			hasAgentSessionChanges = Array.isArray(diff) && diff.length > 0;
		} else {
			hasAgentSessionChanges = hasDiff;
		}

		ChatContextKeys.hasAgentSessionChanges.bindTo(template.contextKeyService).set(hasAgentSessionChanges);


		// Description
		const hasDescription = this.renderDescription(session, template);

		// Status
		const hasStatus = this.renderStatus(session, template);

		// When in progress with a description, only show description in the details row
		const hideDetails = hasDescription && isSessionInProgressStatus(session.element.status);
		template.badge.classList.toggle('has-badge', hasBadge && !hideDetails);
		template.diffContainer.classList.toggle('has-diff', hasDiff && !hideDetails);
		template.statusContainer.classList.toggle('hidden', hideDetails);
		template.separator.classList.toggle('has-separator', !hideDetails && hasBadge && hasDiff);
		template.description.classList.toggle('has-separator', hasDescription && !hideDetails && (hasBadge || hasDiff));
		template.statusContainer.classList.toggle('has-separator', !hideDetails && hasStatus && (hasBadge || hasDiff || hasDescription));

		// Hover
		this.renderHover(session, template);

		// Approval row
		if (this._approvalModel) {
			this.renderApprovalRow(session, template);
		}
	}

	private renderBadge(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate): boolean {
		const badge = session.element.badge;
		if (!badge) {
			return false;
		}

		// When grouped by repository, hide the badge only if the name it shows
		// matches the section header (i.e. the repository name for this session).
		// Badges with a different name (e.g. worktree name) are still shown.
		// Archived sessions always keep their badge since they are grouped under
		// the "Archived" section, not a repository section.
		if (this.options.isGroupedByRepository?.() && !session.element.isArchived()) {
			const raw = typeof badge === 'string' ? badge : badge.value;
			const match = raw.match(/^\$\((?:repo|folder|worktree)\)\s*(.+)/);
			if (match) {
				const badgeName = match[1].trim();
				const repoName = getRepositoryName(session.element);
				if (badgeName === repoName) {
					return false;
				}
			}
		}

		const normalisedBadge = this.stripCodicons(badge);
		const badgeValue = typeof normalisedBadge === 'string' ? normalisedBadge : normalisedBadge.value;
		if (!badgeValue) {
			return false;
		}

		this.renderMarkdownOrText(normalisedBadge, template.badge, template.elementDisposable);

		return true;
	}

	private stripCodicons(content: string | IMarkdownString): string | IMarkdownString {
		const raw = typeof content === 'string' ? content : content.value;
		const stripped = raw.replace(/\$\([a-z0-9\-]+\)\s*/gi, '').trim();
		if (typeof content === 'string') {
			return stripped;
		}

		return MarkdownString.lift({ ...content, value: stripped });
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

		if (diff.insertions === 0 && diff.deletions === 0) {
			return false;
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
			return Codicon.circleFilled;
		}

		if (session.status === AgentSessionStatus.Failed) {
			return Codicon.error;
		}

		if (!session.isRead() && !session.isArchived()) {
			return Codicon.circleFilled;
		}

		if (session.providerType === AgentSessionProviders.Local) {
			return Codicon.circleSmallFilled;
		}

		return session.icon;
	}

	private renderDescription(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate): boolean {
		const description = session.element.description;
		if (description) {
			this.renderMarkdownOrText(description, template.description, template.elementDisposable);
			return true;
		}

		// Fallback to state label
		if (session.element.status === AgentSessionStatus.InProgress) {
			template.description.textContent = localize('chat.session.status.inProgress', "Working...");
			return true;
		} else if (session.element.status === AgentSessionStatus.NeedsInput) {
			template.description.textContent = localize('chat.session.status.needsInput', "Input needed.");
			return true;
		} else if (session.element.status === AgentSessionStatus.Failed) {
			template.description.textContent = localize('chat.session.status.failed', "Failed");
			return true;
		}

		template.description.textContent = '';
		return false;
	}

	private toDuration(startTime: number, endTime: number, useFullTimeWords: boolean, disallowNow: boolean): string {
		const elapsed = Math.max(Math.round((endTime - startTime) / 1000) * 1000, 1000 /* clamp to 1s */);
		if (!disallowNow && elapsed < 60000) {
			return localize('secondsDuration', "now");
		}

		return getDurationString(elapsed, useFullTimeWords);
	}

	private renderStatus(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate): boolean {

		const getTimeLabel = (session: IAgentSession) => {
			let timeLabel: string | undefined;
			if (session.status === AgentSessionStatus.InProgress && session.timing.lastRequestStarted) {
				timeLabel = this.toDuration(session.timing.lastRequestStarted, Date.now(), false, false);
			}

			if (!timeLabel) {
				const date = this.options.isSortedByUpdated?.()
					? session.timing.lastRequestEnded ?? session.timing.created
					: session.timing.created;
				const seconds = Math.round((new Date().getTime() - date) / 1000);
				if (seconds < 60) {
					timeLabel = localize('secondsDuration', "now");
				} else {
					timeLabel = sessionDateFromNow(date, true);
				}
			}

			return timeLabel;
		};

		// Time label
		template.statusTime.textContent = getTimeLabel(session.element);
		const timer = template.elementDisposable.add(new IntervalTimer());
		timer.cancelAndSet(() => template.statusTime.textContent = getTimeLabel(session.element), session.element.status === AgentSessionStatus.InProgress ? 1000 /* every second */ : 60 * 1000 /* every minute */);

		return true;
	}

	private renderHover(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate): void {
		if (this.options.disableHover) {
			return;
		}

		if (!isSessionInProgressStatus(session.element.status) && session.element.isRead()) {
			return; // the hover is complex and large, for now limit it to in-progress sessions only
		}

		const reducedDelay = session.element.status === AgentSessionStatus.NeedsInput;
		template.elementDisposable.add(
			this.hoverService.setupDelayedHover(template.element, () => this.buildHoverContent(session.element), { groupId: 'agent.sessions', reducedDelay })
		);
	}

	private buildHoverContent(session: IAgentSession): IDelayedHoverOptions {
		if (this.sessionHover.value?.session.resource.toString() !== session.resource.toString()) {
			// note: hover service use mouseover which triggers again if the mouse moves
			// within the element. Only recreate the hover widget if the session changed.
			this.sessionHover.value = this.instantiationService.createInstance(AgentSessionHoverWidget, session);
		}

		const widget = this.sessionHover.value;
		return {
			id: `agent.session.hover.${session.resource.toString()}`,
			content: widget.domNode,
			style: HoverStyle.Pointer,
			onDidShow: () => widget.onRendered(),
			position: {
				hoverPosition: this.options.getHoverPosition()
			}
		};
	}

	private renderApprovalRow(session: ITreeNode<IAgentSession, FuzzyScore>, template: IAgentSessionItemTemplate): void {
		if (this._approvalModel === undefined) {
			throw new BugIndicatingError('Approval model is required to render approval row');
		}

		const approvalModel = this._approvalModel;
		// Initialize from current model state to avoid unnecessary height changes on first render
		const initialInfo = approvalModel.getApproval(session.element.resource).get();
		let wasVisible = !!initialInfo;
		template.approvalRow.classList.toggle('visible', wasVisible);

		const buttonStore = template.elementDisposable.add(new DisposableStore());

		template.elementDisposable.add(autorun(reader => {
			buttonStore.clear();

			const info = approvalModel.getApproval(session.element.resource).read(reader);
			const visible = !!info;

			template.approvalRow.classList.toggle('visible', visible);

			if (info) {
				// Render up to 3 lines, each as a separate code block so CSS can truncate per-line
				const lines = info.label.split('\n');
				const maxLines = AgentSessionRenderer.APPROVAL_ROW_MAX_LINES;
				const visibleLines = lines.slice(0, maxLines);
				if (lines.length > maxLines) {
					visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1]} \u2026`;
				}
				const langId = info.languageId ?? 'json';
				const labelContent = new MarkdownString();
				for (const line of visibleLines) {
					labelContent.appendCodeblock(langId, line);
				}
				this.renderMarkdownOrText(labelContent, template.approvalLabel, buttonStore);

				// Hover with full content as a code block
				const fullContent = new MarkdownString().appendCodeblock(info.languageId ?? 'json', info.label);
				buttonStore.add(this.hoverService.setupDelayedHover(template.approvalLabel, {
					content: fullContent,
					style: HoverStyle.Pointer,
					position: { hoverPosition: HoverPosition.BELOW },
				}));

				template.approvalButtonContainer.textContent = '';
				const isActive = this._activeSessionResource.read(reader)?.toString() === session.element.resource.toString();
				const button = buttonStore.add(new Button(template.approvalButtonContainer, {
					title: localize('allowActionOnce', "Allow once"),
					secondary: isActive,
					...defaultButtonStyles
				}));
				button.label = localize('allowAction', "Allow");
				buttonStore.add(button.onDidClick(() => info.confirm()));
			}

			if (wasVisible !== visible) {
				wasVisible = visible;
				this._onDidChangeItemHeight.fire(session.element);
			}
		}));
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

export function toStatusLabel(status: AgentSessionStatus): string {
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
	readonly count: HTMLSpanElement;
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
				h('span.agent-session-section-count@count'),
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
			count: elements.count,
			toolbar,
			contextKeyService,
			disposables
		};
	}

	renderElement(element: ITreeNode<IAgentSessionSection, FuzzyScore>, index: number, template: IAgentSessionSectionTemplate, details?: ITreeElementRenderDetails): void {

		// Label
		template.label.textContent = element.element.label;

		// Count
		template.count.textContent = String(element.element.sessions.length);

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

	static readonly ITEM_HEIGHT = 54;
	static readonly SECTION_HEIGHT = 26;

	constructor(private readonly _approvalModel?: AgentSessionApprovalModel) { }

	getHeight(element: AgentSessionListItem): number {
		if (isAgentSessionSection(element)) {
			return AgentSessionsListDelegate.SECTION_HEIGHT;
		}

		let height = AgentSessionsListDelegate.ITEM_HEIGHT;
		const approval = this._approvalModel?.getApproval(element.resource).get();
		if (approval) {
			height += AgentSessionRenderer.getApprovalRowHeight(approval.label);
		}
		return height;
	}

	hasDynamicHeight(element: AgentSessionListItem): boolean {
		return !!this._approvalModel && isAgentSession(element);
	}

	getTemplateId(element: AgentSessionListItem): string {
		if (isAgentSessionSection(element)) {
			return AgentSessionSectionRenderer.TEMPLATE_ID;
		}

		return AgentSessionRenderer.TEMPLATE_ID;
	}
}

export class AgentSessionsAccessibilityProvider implements IListAccessibilityProvider<AgentSessionListItem> {

	getWidgetRole(): AriaRole {
		return 'list';
	}

	getRole(element: AgentSessionListItem): AriaRole | undefined {
		return 'listitem';
	}

	getWidgetAriaLabel(): string {
		return localize('agentSessions', "Agent Sessions");
	}

	getAriaLabel(element: AgentSessionListItem): string | null {
		if (isAgentSessionSection(element)) {
			return localize('agentSessionSectionAriaLabel', "{0} sessions section, {1} sessions", element.label, element.sessions.length);
		}

		return localize('agentSessionItemAriaLabel', "{0} session {1} ({2}), created {3}", element.providerLabel, element.label, toStatusLabel(element.status), new Date(element.timing.created).toLocaleString());
	}
}

export interface IAgentSessionsFilterExcludes {
	readonly providers: readonly string[];
	readonly states: readonly AgentSessionStatus[];

	readonly archived: boolean;
	readonly read: boolean;
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
	 * When undefined, sessions are shown as a flat list.
	 */
	readonly groupResults?: () => AgentSessionsGrouping | undefined;

	/**
	 * The field to sort sessions by.
	 * Defaults to created date when undefined.
	 */
	readonly sortResults?: () => AgentSessionsSorting | undefined;

	/**
	 * A callback to notify the filter about the number of
	 * results after filtering.
	 */
	notifyResults?(count: number): void;

	/**
	 * The logic to exclude sessions from the view.
	 */
	exclude(session: IAgentSession): boolean;

	/**
	 * Get the current filter excludes for display in the UI.
	 */
	getExcludes(): IAgentSessionsFilterExcludes;

	/**
	 * Whether the filter is at its default state (no custom filters applied).
	 */
	isDefault(): boolean;

	/**
	 * Reset the filter to its default state.
	 */
	reset(): void;
}

export class AgentSessionsDataSource extends Disposable implements IAsyncDataSource<IAgentSessionsModel, AgentSessionListItem> {

	private static readonly CAPPED_SESSIONS_LIMIT = 3;

	private readonly _onDidGetChildren = this._register(new Emitter<number>());
	readonly onDidGetChildren: Event<number> = this._onDidGetChildren.event;

	constructor(
		private readonly filter: IAgentSessionsFilter | undefined,
		private readonly sorter: ITreeSorter<IAgentSession>,
	) {
		super();
	}

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
			this._onDidGetChildren.fire(filteredSessions.length);

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
		const isCapped = this.filter?.groupResults?.() === AgentSessionsGrouping.Capped;

		const sorter = this.sorter;
		const sortedSessions = sorter instanceof AgentSessionsSorter
			? sessions.sort((a, b) => sorter.compare(a, b, isCapped /* special sorting for when results are capped to keep active ones top */))
			: sessions.sort(sorter.compare.bind(sorter));

		if (isCapped) {
			if (this.filter?.getExcludes().read) {
				return sortedSessions; // When filtering to show only unread sessions, show a flat list
			}

			return this.groupSessionsCapped(sortedSessions);
		} else if (this.filter?.groupResults?.() === AgentSessionsGrouping.Repository) {
			return this.groupSessionsByRepository(sortedSessions);
		} else {
			return this.groupSessionsByDate(sortedSessions);
		}
	}

	private groupSessionsCapped(sortedSessions: IAgentSession[]): AgentSessionListItem[] {
		const result: AgentSessionListItem[] = [];

		const firstArchivedIndex = sortedSessions.findIndex(session => session.isArchived());
		const nonArchivedCount = firstArchivedIndex === -1 ? sortedSessions.length : firstArchivedIndex;
		const nonArchivedSessions = sortedSessions.slice(0, nonArchivedCount);
		const archivedSessions = sortedSessions.slice(nonArchivedCount);

		// All pinned sessions are always visible
		const pinnedSessions = nonArchivedSessions.filter(session => session.isPinned());
		const unpinnedSessions = nonArchivedSessions.filter(session => !session.isPinned());

		// Take up to N non-pinned sessions from the sorted order (preserves NeedsInput prioritization)
		const topUnpinned = unpinnedSessions.slice(0, AgentSessionsDataSource.CAPPED_SESSIONS_LIMIT);
		const remainingUnpinned = unpinnedSessions.slice(AgentSessionsDataSource.CAPPED_SESSIONS_LIMIT);

		// Add pinned first, then top N non-pinned
		result.push(...pinnedSessions, ...topUnpinned);

		// Add "More" section for the rest (remaining unpinned + archived)
		const othersSessions = [...remainingUnpinned, ...archivedSessions];
		if (othersSessions.length > 0) {
			result.push({
				section: AgentSessionSection.More,
				label: AgentSessionSectionLabels[AgentSessionSection.More],
				sessions: othersSessions
			});
		}

		return result;
	}

	private groupSessionsByDate(sortedSessions: IAgentSession[]): AgentSessionListItem[] {
		const result: AgentSessionListItem[] = [];
		const sortBy = this.filter?.sortResults?.();
		const groupedSessions = groupAgentSessionsByDate(sortedSessions, sortBy);

		for (const { sessions, section, label } of groupedSessions.values()) {
			if (sessions.length === 0) {
				continue;
			}

			result.push({ section, label, sessions });
		}

		return result;
	}

	private groupSessionsByRepository(sortedSessions: IAgentSession[]): AgentSessionListItem[] {
		const repoMap = new Map<string, { label: string; sessions: IAgentSession[] }>();
		const pinnedSessions: IAgentSession[] = [];
		const archivedSessions: IAgentSession[] = [];
		const otherSessions: IAgentSession[] = [];

		for (const session of sortedSessions) {
			if (session.isArchived()) {
				archivedSessions.push(session);
				continue;
			}

			if (session.isPinned()) {
				pinnedSessions.push(session);
				continue;
			}

			const repoName = getRepositoryName(session);
			if (repoName) {
				let group = repoMap.get(repoName);
				if (!group) {
					group = { label: repoName, sessions: [] };
					repoMap.set(repoName, group);
				}
				group.sessions.push(session);
			} else {
				otherSessions.push(session);
			}
		}

		const result: AgentSessionListItem[] = [];

		if (pinnedSessions.length > 0) {
			result.push({
				section: AgentSessionSection.Pinned,
				label: AgentSessionSectionLabels[AgentSessionSection.Pinned],
				sessions: pinnedSessions,
			});
		}

		for (const [, { label, sessions }] of repoMap) {
			result.push({
				section: AgentSessionSection.Repository,
				label,
				sessions,
			});
		}

		if (otherSessions.length > 0) {
			result.push({
				section: AgentSessionSection.Repository,
				label: AgentSessionSectionLabels[AgentSessionSection.Repository],
				sessions: otherSessions,
			});
		}

		if (archivedSessions.length > 0) {
			result.push({
				section: AgentSessionSection.Archived,
				label: AgentSessionSectionLabels[AgentSessionSection.Archived],
				sessions: archivedSessions,
			});
		}

		return result;
	}
}

/**
 * Extracts the repository name for an agent session from its metadata or badge.
 * Used for grouping sessions by repository and for determining whether a badge
 * is redundant with the section header.
 */
export function getRepositoryName(session: IAgentSession): string | undefined {
	const metadata = session.metadata;
	if (metadata) {
		// Remote agent host sessions: group by folder + remote name (e.g. "myproject [dev-box]")
		const remoteAgentHost = metadata.remoteAgentHost as string | undefined;
		if (remoteAgentHost) {
			const workingDir = metadata.workingDirectoryPath as string | undefined;
			if (workingDir) {
				const folderName = extractRepoNameFromPath(workingDir);
				if (folderName) {
					return `${folderName} [${remoteAgentHost}]`;
				}
			}
			return remoteAgentHost;
		}

		// Cloud sessions: metadata.owner + metadata.name
		const owner = metadata.owner as string | undefined;
		const name = metadata.name as string | undefined;
		if (owner && name) {
			return name;
		}

		// repositoryNwo: "owner/repo"
		const nwo = metadata.repositoryNwo as string | undefined;
		if (nwo && nwo.includes('/')) {
			return nwo.split('/').pop()!;
		}

		// repository: could be "owner/repo", a URL, or git@host:owner/repo.git
		const repository = metadata.repository as string | undefined;
		if (repository) {
			const repoName = parseRepositoryName(repository);
			if (repoName) {
				return repoName;
			}
		}

		// repositoryUrl: "https://github.com/owner/repo"
		const repositoryUrl = metadata.repositoryUrl as string | undefined;
		if (repositoryUrl) {
			const repoName = parseRepositoryName(repositoryUrl);
			if (repoName) {
				return repoName;
			}
		}

		// repositoryPath: extract repo name from the directory path basename
		const repositoryPath = metadata.repositoryPath as string | undefined;
		if (repositoryPath) {
			const repoName = extractRepoNameFromPath(repositoryPath);
			if (repoName) {
				return repoName;
			}
		}

		// worktreePath: extract repo name from the worktree path
		const worktreePath = metadata.worktreePath as string | undefined;
		if (worktreePath) {
			const repoName = extractRepoNameFromPath(worktreePath);
			if (repoName) {
				return repoName;
			}
		}

		// workingDirectoryPath: fallback to extract name from the working directory
		const workingDirectoryPath = metadata.workingDirectoryPath as string | undefined;
		if (workingDirectoryPath) {
			const repoName = extractRepoNameFromPath(workingDirectoryPath);
			if (repoName) {
				return repoName;
			}
		}
	}

	// Fallback: extract repo/folder name from badge
	const badge = session.badge;
	if (badge) {
		const raw = typeof badge === 'string' ? badge : badge.value;
		const badgeMatch = raw.match(/\$\((?:repo|folder|worktree)\)\s*(.+)/);
		if (badgeMatch) {
			return badgeMatch[1].trim();
		}
	}

	return undefined;
}

/**
 * Parses a repository name from various formats: "owner/repo", URLs,
 * and git@host:owner/repo.git style references.
 */
function parseRepositoryName(value: string): string | undefined {
	// Direct "owner/repo" style (no scheme, no git@ prefix)
	if (value.includes('/') && !value.includes('://') && !value.startsWith('git@')) {
		let repoSegment = value.split('/').filter(Boolean).pop();
		if (repoSegment?.endsWith('.git')) {
			repoSegment = repoSegment.slice(0, -4);
		}
		return repoSegment || undefined;
	}

	// Standard URL formats (https://..., ssh://..., etc.)
	try {
		const url = new URL(value);
		const parts = url.pathname.split('/').filter(Boolean);
		if (parts.length >= 2) {
			let repoSegment = parts[1];
			if (repoSegment.endsWith('.git')) {
				repoSegment = repoSegment.slice(0, -4);
			}
			return repoSegment || undefined;
		}
	} catch {
		// not a standard URL
	}

	// git@host:owner/repo(.git) style URLs
	if (value.startsWith('git@')) {
		const colonIndex = value.indexOf(':');
		if (colonIndex !== -1 && colonIndex < value.length - 1) {
			const pathPart = value.substring(colonIndex + 1);
			let repoSegment = pathPart.split('/').filter(Boolean).pop();
			if (repoSegment?.endsWith('.git')) {
				repoSegment = repoSegment.slice(0, -4);
			}
			return repoSegment || undefined;
		}
	}

	return undefined;
}

/**
 * Extracts the repository name from a filesystem path, handling git worktree
 * conventions where paths follow `<repo>.worktrees/<worktree-name>`.
 */
function extractRepoNameFromPath(dirPath: string): string | undefined {
	const segments = dirPath.split(/[/\\]/).filter(Boolean);
	if (segments.length < 2) {
		return segments[0];
	}

	const parent = segments[segments.length - 2];
	if (parent.endsWith('.worktrees')) {
		return parent.slice(0, -'.worktrees'.length) || undefined;
	}

	return segments[segments.length - 1];
}

export const AgentSessionSectionLabels = {
	[AgentSessionSection.Pinned]: localize('agentSessions.pinnedSection', "Pinned"),
	[AgentSessionSection.Today]: localize('agentSessions.todaySection', "Today"),
	[AgentSessionSection.Yesterday]: localize('agentSessions.yesterdaySection', "Yesterday"),
	[AgentSessionSection.Week]: localize('agentSessions.weekSection', "Last 7 days"),
	[AgentSessionSection.Older]: localize('agentSessions.olderSection', "Older"),
	[AgentSessionSection.Archived]: localize('agentSessions.archivedSection', "Archived"),
	[AgentSessionSection.More]: localize('agentSessions.moreSection', "More"),
	[AgentSessionSection.Repository]: localize('agentSessions.noRepository', "Other"),
};

const DAY_THRESHOLD = 24 * 60 * 60 * 1000;
const WEEK_THRESHOLD = 7 * DAY_THRESHOLD;

export function groupAgentSessionsByDate(sessions: IAgentSession[], sortBy?: AgentSessionsSorting): Map<AgentSessionSection, IAgentSessionSection> {
	const now = Date.now();
	const startOfToday = new Date(now).setHours(0, 0, 0, 0);
	const startOfYesterday = startOfToday - DAY_THRESHOLD;
	const weekThreshold = now - WEEK_THRESHOLD;

	const pinnedSessions: IAgentSession[] = [];
	const todaySessions: IAgentSession[] = [];
	const yesterdaySessions: IAgentSession[] = [];
	const weekSessions: IAgentSession[] = [];
	const olderSessions: IAgentSession[] = [];
	const archivedSessions: IAgentSession[] = [];

	for (const session of sessions) {
		if (session.isArchived()) {
			archivedSessions.push(session);
		} else if (session.isPinned()) {
			pinnedSessions.push(session);
		} else {
			const sessionTime = sortBy === AgentSessionsSorting.Updated
				? session.timing.lastRequestEnded ?? session.timing.created
				: session.timing.created;
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
		[AgentSessionSection.Pinned, { section: AgentSessionSection.Pinned, label: AgentSessionSectionLabels[AgentSessionSection.Pinned], sessions: pinnedSessions }],
		[AgentSessionSection.Today, { section: AgentSessionSection.Today, label: AgentSessionSectionLabels[AgentSessionSection.Today], sessions: todaySessions }],
		[AgentSessionSection.Yesterday, { section: AgentSessionSection.Yesterday, label: AgentSessionSectionLabels[AgentSessionSection.Yesterday], sessions: yesterdaySessions }],
		[AgentSessionSection.Week, { section: AgentSessionSection.Week, label: AgentSessionSectionLabels[AgentSessionSection.Week], sessions: weekSessions }],
		[AgentSessionSection.Older, { section: AgentSessionSection.Older, label: AgentSessionSectionLabels[AgentSessionSection.Older], sessions: olderSessions }],
		[AgentSessionSection.Archived, { section: AgentSessionSection.Archived, label: AgentSessionSectionLabels[AgentSessionSection.Archived], sessions: archivedSessions }],
	]);
}

export function sessionDateFromNow(sessionTime: number, appendAgoLabel?: boolean): string {
	const now = Date.now();
	const startOfToday = new Date(now).setHours(0, 0, 0, 0);
	const startOfYesterday = startOfToday - DAY_THRESHOLD;
	const startOfTwoDaysAgo = startOfYesterday - DAY_THRESHOLD;

	// our grouping by date uses absolute start times for "Today"
	// and "Yesterday" while `fromNow` only works with full 24h
	// and 48h ranges for these. To prevent a label like "1 day ago"
	// to show under the "Last 7 Days" section, we do a bit of
	// normalization logic.

	if (sessionTime < startOfToday && sessionTime >= startOfYesterday) {
		return appendAgoLabel
			? localize('date.fromNow.days.singular.ago', '1 day ago')
			: localize('date.fromNow.days.singular', '1 day');
	}

	if (sessionTime < startOfYesterday && sessionTime >= startOfTwoDaysAgo) {
		return appendAgoLabel
			? localize('date.fromNow.days.multiple.ago', '2 days ago')
			: localize('date.fromNow.days.multiple', '2 days');
	}

	return fromNow(sessionTime, appendAgoLabel);
}

export class AgentSessionsIdentityProvider implements IIdentityProvider<IAgentSessionsModel | AgentSessionListItem> {

	getId(element: IAgentSessionsModel | AgentSessionListItem): string {
		if (isAgentSessionSection(element)) {
			return `section-${element.section}-${element.label}`;
		}

		if (isAgentSession(element)) {
			return element.resource.toString();
		}

		return 'agent-sessions-id';
	}

	getGroupId(element: IAgentSessionsModel | AgentSessionListItem): number | NotSelectableGroupIdType {
		if (isAgentSessionSection(element) || isAgentSessionsModel(element)) {
			return NotSelectableGroupId;
		}
		return 1;
	}
}

export class AgentSessionsCompressionDelegate implements ITreeCompressionDelegate<AgentSessionListItem> {

	isIncompressible(element: AgentSessionListItem): boolean {
		return true;
	}
}

export class AgentSessionsSorter implements ITreeSorter<IAgentSession> {

	private readonly getSortBy: () => AgentSessionsSorting;

	constructor(getSortBy?: () => AgentSessionsSorting) {
		this.getSortBy = getSortBy ?? (() => AgentSessionsSorting.Created);
	}

	compare(sessionA: IAgentSession, sessionB: IAgentSession, prioritizeActiveSessions = false): number {

		// Special sorting if enabled
		if (prioritizeActiveSessions) {
			const aNeedsInput = sessionA.status === AgentSessionStatus.NeedsInput;
			const bNeedsInput = sessionB.status === AgentSessionStatus.NeedsInput;

			if (aNeedsInput && !bNeedsInput) {
				return -1; // a (needs input) comes before b (other)
			}
			if (!aNeedsInput && bNeedsInput) {
				return 1; // a (other) comes after b (needs input)
			}
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

		// Pinned (non-archived pinned sessions come before non-pinned)
		const aPinned = !aArchived && sessionA.isPinned();
		const bPinned = !bArchived && sessionB.isPinned();

		if (aPinned && !bPinned) {
			return -1;
		}
		if (!aPinned && bPinned) {
			return 1;
		}

		// Sort by time
		const sortBy = this.getSortBy();
		const timeA = prioritizeActiveSessions
			? sessionA.timing.lastRequestStarted ?? sessionA.timing.created
			: sortBy === AgentSessionsSorting.Updated
				? sessionA.timing.lastRequestEnded ?? sessionA.timing.created
				: sessionA.timing.created;
		const timeB = prioritizeActiveSessions
			? sessionB.timing.lastRequestStarted ?? sessionB.timing.created
			: sortBy === AgentSessionsSorting.Updated
				? sessionB.timing.lastRequestEnded ?? sessionB.timing.created
				: sessionB.timing.created;
		return timeB - timeA;
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
