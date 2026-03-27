/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionsList.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { IListStyles } from '../../../../../base/browser/ui/list/listWidget.js';
import { IObjectTreeElement, ITreeNode, ITreeRenderer, ITreeContextMenuEvent, ObjectTreeElementCollapseState } from '../../../../../base/browser/ui/tree/tree.js';
import { RenderIndentGuides, TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { fromNow } from '../../../../../base/common/date.js';
import { localize } from '../../../../../nls.js';
import { MenuId, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IStyleOverride, defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISessionData, ISessionWorkspace, SessionStatus } from '../../common/sessionData.js';
import { ISessionsManagementService } from '../sessionsManagementService.js';
import { AgentSessionApprovalModel } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { Separator } from '../../../../../base/common/actions.js';
import { AgentSessionProviders } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';

const $ = DOM.$;

export const SessionItemToolbarMenuId = new MenuId('SessionItemToolbar');
export const SessionItemContextMenuId = new MenuId('SessionItemContextMenu');
export const SessionSectionToolbarMenuId = new MenuId('SessionSectionToolbar');
export const IsSessionPinnedContext = new RawContextKey<boolean>('sessionItem.isPinned', false);
export const IsSessionArchivedContext = new RawContextKey<boolean>('sessionItem.isArchived', false);
export const IsSessionReadContext = new RawContextKey<boolean>('sessionItem.isRead', true);
export const SessionSectionTypeContext = new RawContextKey<string>('sessionSection.type', '');

//#region Types

export enum SessionsGrouping {
	Workspace = 'workspace',
	Date = 'date',
}

export enum SessionsSorting {
	Created = 'created',
	Updated = 'updated',
}

export interface ISessionSection {
	readonly id: string;
	readonly label: string;
	readonly sessions: ISessionData[];
}

export interface ISessionShowMore {
	readonly showMore: true;
	readonly sectionLabel: string;
	readonly remainingCount: number;
}

export type SessionListItem = ISessionData | ISessionSection | ISessionShowMore;

function isSessionSection(item: SessionListItem): item is ISessionSection {
	return 'sessions' in item && Array.isArray((item as ISessionSection).sessions);
}

function isSessionShowMore(item: SessionListItem): item is ISessionShowMore {
	return 'showMore' in item && (item as ISessionShowMore).showMore === true;
}

//#endregion

//#region Tree Delegate

class SessionsTreeDelegate implements IListVirtualDelegate<SessionListItem> {
	private static readonly ITEM_HEIGHT = 54;
	private static readonly SECTION_HEIGHT = 26;
	private static readonly SHOW_MORE_HEIGHT = 26;

	constructor(private readonly _approvalModel?: AgentSessionApprovalModel) { }

	getHeight(element: SessionListItem): number {
		if (isSessionSection(element)) {
			return SessionsTreeDelegate.SECTION_HEIGHT;
		}
		if (isSessionShowMore(element)) {
			return SessionsTreeDelegate.SHOW_MORE_HEIGHT;
		}

		let height = SessionsTreeDelegate.ITEM_HEIGHT;
		if (this._approvalModel) {
			const approval = this._approvalModel.getApproval(element.resource).get();
			if (approval) {
				height += SessionItemRenderer.getApprovalRowHeight(approval.label);
			}
		}
		return height;
	}

	hasDynamicHeight(element: SessionListItem): boolean {
		return !!this._approvalModel && !isSessionSection(element) && !isSessionShowMore(element);
	}

	getTemplateId(element: SessionListItem): string {
		if (isSessionSection(element)) {
			return SessionSectionRenderer.TEMPLATE_ID;
		}
		if (isSessionShowMore(element)) {
			return SessionShowMoreRenderer.TEMPLATE_ID;
		}
		return SessionItemRenderer.TEMPLATE_ID;
	}
}

//#endregion

//#region Session Item Renderer

interface ISessionItemTemplate {
	readonly container: HTMLElement;
	readonly iconContainer: HTMLElement;
	readonly title: HTMLElement;
	readonly pinnedIndicator: HTMLElement;
	readonly titleToolbar: MenuWorkbenchToolBar;
	readonly detailsRow: HTMLElement;
	readonly approvalRow: HTMLElement;
	readonly approvalLabel: HTMLElement;
	readonly approvalButtonContainer: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class SessionItemRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionItemTemplate> {
	static readonly TEMPLATE_ID = 'session-item';
	readonly templateId = SessionItemRenderer.TEMPLATE_ID;

	private static readonly APPROVAL_ROW_MAX_LINES = 3;
	private static readonly _APPROVAL_ROW_LINE_HEIGHT = 18;
	private static readonly _APPROVAL_ROW_OVERHEAD = 14;

	static getApprovalRowHeight(label: string): number {
		const lineCount = Math.min(label.split(/\\r?\\n/).length, SessionItemRenderer.APPROVAL_ROW_MAX_LINES);
		return lineCount * SessionItemRenderer._APPROVAL_ROW_LINE_HEIGHT + SessionItemRenderer._APPROVAL_ROW_OVERHEAD;
	}

	private readonly _onDidChangeItemHeight = new Emitter<ISessionData>();
	readonly onDidChangeItemHeight: Event<ISessionData> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly options: { grouping: () => SessionsGrouping; sorting: () => SessionsSorting; isPinned: (session: ISessionData) => boolean },
		private readonly approvalModel: AgentSessionApprovalModel | undefined,
		private readonly instantiationService: IInstantiationService,
		private readonly contextKeyService: IContextKeyService,
		private readonly markdownRendererService: IMarkdownRendererService,
	) { }

	renderTemplate(container: HTMLElement): ISessionItemTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());

		container.classList.add('session-item');

		const iconContainer = DOM.append(container, $('.session-icon'));
		const mainCol = DOM.append(container, $('.session-main'));
		const titleRow = DOM.append(mainCol, $('.session-title-row'));
		const title = DOM.append(titleRow, $('.session-title'));
		const pinnedIndicator = DOM.append(titleRow, $('.session-pinned-indicator'));
		const titleToolbarContainer = DOM.append(titleRow, $('.session-title-toolbar'));
		const detailsRow = DOM.append(mainCol, $('.session-details-row'));

		// Approval row
		const approvalRow = DOM.append(mainCol, $('.session-approval-row'));
		const approvalLabel = DOM.append(approvalRow, $('span.session-approval-label'));
		const approvalButtonContainer = DOM.append(approvalRow, $('.session-approval-button'));

		const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
		const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		const titleToolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, titleToolbarContainer, SessionItemToolbarMenuId, {
			menuOptions: { shouldForwardArgs: true },
		}));

		return { container, iconContainer, title, pinnedIndicator, titleToolbar, detailsRow, approvalRow, approvalLabel, approvalButtonContainer, contextKeyService, disposables, elementDisposables };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionItemTemplate): void {
		const element = node.element;
		if (isSessionSection(element) || isSessionShowMore(element)) {
			return;
		}
		this.renderSession(element, template);
	}

	private renderSession(element: ISessionData, template: ISessionItemTemplate): void {
		template.elementDisposables.clear();

		// Toolbar context
		template.titleToolbar.context = element;

		// Context key: isPinned
		const isPinned = this.options.isPinned(element);
		IsSessionPinnedContext.bindTo(template.contextKeyService).set(isPinned);
		IsSessionArchivedContext.bindTo(template.contextKeyService).set(element.isArchived.get());

		// Pinned indicator — inline pin icon, hidden on hover when toolbar shows
		template.pinnedIndicator.className = 'session-pinned-indicator ' + ThemeIcon.asClassName(Codicon.pinned);
		template.pinnedIndicator.classList.toggle('visible', isPinned);
		IsSessionReadContext.bindTo(template.contextKeyService).set(element.isRead.get());

		// Archived styling — reactive
		template.elementDisposables.add(autorun(reader => {
			template.container.classList.toggle('archived', element.isArchived.read(reader));
		}));


		// Icon — reactive based on status, read state, and PR
		template.elementDisposables.add(autorun(reader => {
			const sessionStatus = element.status.read(reader);
			const isRead = element.isRead.read(reader);
			const isArchived = element.isArchived.read(reader);
			const pullRequest = element.pullRequest.read(reader);
			DOM.clearNode(template.iconContainer);
			const icon = this.getStatusIcon(sessionStatus, isRead, isArchived, pullRequest?.icon);
			const iconSpan = DOM.append(template.iconContainer, $(`span${ThemeIcon.asCSSSelector(icon)}`));
			iconSpan.style.color = icon.color ? asCssVariable(icon.color.id) : '';
			template.iconContainer.classList.toggle('session-icon-pulse', sessionStatus === SessionStatus.NeedsInput);
			template.iconContainer.classList.toggle('session-icon-active', sessionStatus === SessionStatus.InProgress);
			template.iconContainer.classList.toggle('session-icon-error', sessionStatus === SessionStatus.Error);
			template.iconContainer.classList.toggle('session-icon-unread', !isRead && !isArchived && sessionStatus !== SessionStatus.InProgress && sessionStatus !== SessionStatus.NeedsInput && sessionStatus !== SessionStatus.Error);
		}));

		// Title — reactive
		template.elementDisposables.add(autorun(reader => {
			const titleText = element.title.read(reader);
			template.title.textContent = titleText;
		}));

		// Details row — reactive: badge · diff stats · time
		const timeDisposable = template.elementDisposables.add(new MutableDisposable());
		template.elementDisposables.add(autorun(reader => {
			const sessionStatus = element.status.read(reader);
			const changes = element.changes.read(reader);
			const workspace = element.workspace.read(reader);
			const description = element.description.read(reader);
			const timeDate = this.options.sorting() === SessionsSorting.Updated ? element.updatedAt.read(reader) : element.createdAt;

			// Clear and rebuild details row
			DOM.clearNode(template.detailsRow);
			const parts: HTMLElement[] = [];

			// Session type icon in details row
			// Disabling background icon - hacky but couldn't figure out how to do it from the new provider
			if (element.sessionType !== AgentSessionProviders.Background) {
				const typeIconEl = DOM.append(template.detailsRow, $('span.session-details-icon'));
				DOM.append(typeIconEl, $(`span${ThemeIcon.asCSSSelector(element.icon)}`));
				parts.push(typeIconEl);
			}

			// Workspace badge — show when not grouped by workspace,
			// or when the session is pinned/archived (their section headers
			// don't carry the workspace name)
			if (workspace && (
				this.options.grouping() !== SessionsGrouping.Workspace ||
				this.options.isPinned(element) ||
				element.isArchived.read(reader)
			)) {
				const badgeLabel = this.getWorkspaceBadgeLabel(workspace);
				if (badgeLabel) {
					const badgeEl = DOM.append(template.detailsRow, $('span.session-badge'));
					badgeEl.textContent = badgeLabel;
					parts.push(badgeEl);
				}
			}

			// Diff stats
			if (changes.length > 0 && sessionStatus !== SessionStatus.InProgress) {
				let insertions = 0;
				let deletions = 0;
				for (const change of changes) {
					insertions += change.insertions;
					deletions += change.deletions;
				}
				if (insertions > 0 || deletions > 0) {
					if (parts.length > 0) {
						DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
					}
					const diffEl = DOM.append(template.detailsRow, $('span.session-diff'));
					DOM.append(diffEl, $('span.session-diff-added')).textContent = `+${insertions}`;
					DOM.append(diffEl, $('span')).textContent = ' ';
					DOM.append(diffEl, $('span.session-diff-removed')).textContent = `-${deletions}`;
					parts.push(diffEl);
				}
			}

			// Status description
			if (sessionStatus === SessionStatus.InProgress) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
				statusEl.textContent = description ?? localize('working', "Working...");
				parts.push(statusEl);
			} else if (sessionStatus === SessionStatus.NeedsInput) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
				statusEl.textContent = description ?? localize('needsInput', "Input needed");
				parts.push(statusEl);
			} else if (sessionStatus === SessionStatus.Error) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
				statusEl.textContent = localize('failed', "Failed");
				parts.push(statusEl);
			}

			// Timestamp — always visible
			if (parts.length > 0) {
				DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
			}
			const timeEl = DOM.append(template.detailsRow, $('span.session-time'));
			const formatTime = () => {
				const seconds = Math.round((Date.now() - timeDate.getTime()) / 1000);
				return seconds < 60 ? localize('secondsDuration', "now") : fromNow(timeDate, true);
			};
			timeEl.textContent = formatTime();
			const targetWindow = DOM.getWindow(timeEl);
			const interval = targetWindow.setInterval(() => {
				timeEl.textContent = formatTime();
			}, 60_000);
			timeDisposable.value = toDisposable(() => targetWindow.clearInterval(interval));
		}));

		// Approval row — reactive
		if (this.approvalModel) {
			this.renderApprovalRow(element, template);
		}
	}

	private renderApprovalRow(element: ISessionData, template: ISessionItemTemplate): void {
		if (!this.approvalModel) {
			return;
		}

		const approvalModel = this.approvalModel;
		const initialInfo = approvalModel.getApproval(element.resource).get();
		let wasVisible = !!initialInfo;
		template.approvalRow.classList.toggle('visible', wasVisible);

		const buttonStore = template.elementDisposables.add(new DisposableStore());

		template.elementDisposables.add(autorun(reader => {
			buttonStore.clear();

			const info = approvalModel.getApproval(element.resource).read(reader);
			const visible = !!info;

			template.approvalRow.classList.toggle('visible', visible);

			if (info) {
				// Render up to 3 lines as separate code blocks
				const lines = info.label.split('\n');
				const maxLines = SessionItemRenderer.APPROVAL_ROW_MAX_LINES;
				const visibleLines = lines.slice(0, maxLines);
				if (lines.length > maxLines) {
					visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1]} \u2026`;
				}
				const langId = info.languageId ?? 'json';
				const labelContent = new MarkdownString();
				for (const line of visibleLines) {
					labelContent.appendCodeblock(langId, line);
				}

				template.approvalLabel.textContent = '';
				buttonStore.add(this.markdownRendererService.render(labelContent, {}, template.approvalLabel));

				template.approvalButtonContainer.textContent = '';
				const button = buttonStore.add(new Button(template.approvalButtonContainer, {
					title: localize('allowActionOnce', "Allow once"),
					secondary: true,
					...defaultButtonStyles
				}));
				button.label = localize('allowAction', "Allow");
				buttonStore.add(button.onDidClick(() => info.confirm()));
			}

			if (wasVisible !== visible) {
				wasVisible = visible;
				this._onDidChangeItemHeight.fire(element);
			}
		}));
	}

	private getStatusIcon(status: SessionStatus, isRead: boolean, isArchived: boolean, pullRequestIcon?: ThemeIcon): ThemeIcon {
		switch (status) {
			case SessionStatus.InProgress: return Codicon.sessionInProgress;
			case SessionStatus.NeedsInput: return Codicon.circleFilled;
			case SessionStatus.Error: return Codicon.error;
			default:
				if (pullRequestIcon) {
					return pullRequestIcon;
				}

				if (!isRead && !isArchived) {
					return Codicon.circleFilled;
				}
				// Status-only: show small dot for read sessions
				return Codicon.circleSmallFilled;
		}
	}

	private getWorkspaceBadgeLabel(workspace: ISessionWorkspace): string | undefined {
		// For GitHub remote sessions, extract owner/name from the repository URI path
		const repo = workspace.repositories[0];
		if (repo?.uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			const parts = repo.uri.path.split('/').filter(Boolean);
			if (parts.length >= 2) {
				return `${parts[0]}/${parts[1]}`;
			}
		}

		return workspace.label;
	}



	disposeElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionItemTemplate): void {
		template.elementDisposables.clear();
	}

	disposeTemplate(template: ISessionItemTemplate): void {
		template.disposables.dispose();
	}
}

//#endregion

//#region Section Header Renderer

interface ISessionSectionTemplate {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
	readonly count: HTMLElement;
	readonly toolbar: MenuWorkbenchToolBar;
	readonly contextKeyService: IContextKeyService;
	readonly disposables: DisposableStore;
}

class SessionSectionRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionSectionTemplate> {
	static readonly TEMPLATE_ID = 'session-section';
	readonly templateId = SessionSectionRenderer.TEMPLATE_ID;

	constructor(
		private readonly hideSectionCount: boolean,
		private readonly instantiationService: IInstantiationService,
		private readonly contextKeyService: IContextKeyService,
	) { }

	renderTemplate(container: HTMLElement): ISessionSectionTemplate {
		const disposables = new DisposableStore();

		container.classList.add('session-section');
		const label = DOM.append(container, $('span.session-section-label'));
		const count = DOM.append(container, $('span.session-section-count'));
		const toolbarContainer = DOM.append(container, $('.session-section-toolbar'));

		const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
		const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, SessionSectionToolbarMenuId, {
			menuOptions: { shouldForwardArgs: true },
		}));

		return { container, label, count, toolbar, contextKeyService, disposables };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionSectionTemplate): void {
		const element = node.element;
		if (!isSessionSection(element)) {
			return;
		}
		template.label.textContent = element.label;
		if (this.hideSectionCount) {
			template.count.textContent = '';
			template.count.style.display = 'none';
		} else {
			template.count.textContent = String(element.sessions.length);
			template.count.style.display = '';
		}

		// Set context key for section type so toolbar actions can use when clauses
		const sectionType = element.id.startsWith('workspace:') ? 'workspace' : element.id;
		SessionSectionTypeContext.bindTo(template.contextKeyService).set(sectionType);
		template.toolbar.context = element;
	}

	disposeTemplate(template: ISessionSectionTemplate): void {
		template.disposables.dispose();
	}
}

//#endregion

//#region Show More Renderer

class SessionShowMoreRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, HTMLElement> {
	static readonly TEMPLATE_ID = 'session-show-more';
	readonly templateId = SessionShowMoreRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): HTMLElement {
		container.classList.add('session-show-more');
		return DOM.append(container, $('span.session-show-more-label'));
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: HTMLElement): void {
		const element = node.element;
		if (!isSessionShowMore(element)) {
			return;
		}
		template.textContent = localize('showMoreCompact', "+{0} more", element.remainingCount);
	}

	disposeTemplate(_template: HTMLElement): void { }
}

//#region Accessibility

class SessionsAccessibilityProvider {
	getWidgetAriaLabel(): string {
		return localize('sessionsList', "Sessions");
	}

	getAriaLabel(element: SessionListItem): string | null {
		if (isSessionSection(element)) {
			return `${element.label}, ${element.sessions.length}`;
		}
		if (isSessionShowMore(element)) {
			return localize('showMoreAria', "Show {0} more sessions", element.remainingCount);
		}
		return element.title.get();
	}
}

//#endregion

//#region Sessions List Control

export interface ISessionsListControlOptions {
	readonly overrideStyles?: IStyleOverride<IListStyles>;
	readonly grouping: () => SessionsGrouping;
	readonly sorting: () => SessionsSorting;
	onSessionOpen(resource: URI): void;
}

/**
 * @deprecated Use {@link ISessionsListControlOptions} instead.
 */
export type ISessionsListOptions = ISessionsListControlOptions;

export interface ISessionsList {
	readonly element: HTMLElement;
	readonly onDidUpdate: Event<void>;
	refresh(): void;
	reveal(sessionResource: URI): boolean;
	clearFocus(): void;
	hasFocusOrSelection(): boolean;
	setVisible(visible: boolean): void;
	layout(height: number, width: number): void;
	focus(): void;
	update(expandAll?: boolean): void;
	openFind(): void;
	resetSectionCollapseState(): void;
	pinSession(session: ISessionData): void;
	unpinSession(session: ISessionData): void;
	isSessionPinned(session: ISessionData): boolean;
	setSessionTypeExcluded(sessionTypeId: string, excluded: boolean): void;
	isSessionTypeExcluded(sessionTypeId: string): boolean;
	setStatusExcluded(status: SessionStatus, excluded: boolean): void;
	isStatusExcluded(status: SessionStatus): boolean;
	setExcludeArchived(exclude: boolean): void;
	isExcludeArchived(): boolean;
	setExcludeRead(exclude: boolean): void;
	isExcludeRead(): boolean;
	resetFilters(): void;
	setWorkspaceGroupCapped(capped: boolean): void;
	isWorkspaceGroupCapped(): boolean;
}

export class SessionsList extends Disposable implements ISessionsList {

	private static readonly SECTION_COLLAPSE_STATE_KEY = 'sessionsListControl.sectionCollapseState';
	private static readonly PINNED_SESSIONS_KEY = 'sessionsListControl.pinnedSessions';
	private static readonly EXCLUDED_TYPES_KEY = 'sessionsListControl.excludedSessionTypes';
	private static readonly EXCLUDED_STATUSES_KEY = 'sessionsListControl.excludedStatuses';
	private static readonly EXCLUDE_ARCHIVED_KEY = 'sessionsListControl.excludeArchived';
	private static readonly EXCLUDE_READ_KEY = 'sessionsListControl.excludeRead';
	private static readonly WORKSPACE_GROUP_CAPPED_KEY = 'sessionsListControl.workspaceGroupCapped';
	private static readonly WORKSPACE_GROUP_LIMIT = 5;

	private readonly listContainer: HTMLElement;
	private readonly tree: WorkbenchObjectTree<SessionListItem, FuzzyScore>;
	private sessions: ISessionData[] = [];
	private visible = true;
	private readonly _pinnedSessionIds: Set<string>;
	private readonly excludedSessionTypes: Set<string>;
	private readonly excludedStatuses: Set<SessionStatus>;
	private _excludeArchived: boolean;
	private _excludeRead: boolean;
	private workspaceGroupCapped: boolean;
	private readonly expandedWorkspaceGroups = new Set<string>();

	private readonly _onDidUpdate = this._register(new Emitter<void>());
	readonly onDidUpdate: Event<void> = this._onDidUpdate.event;

	get element(): HTMLElement { return this.listContainer; }

	constructor(
		container: HTMLElement,
		private readonly options: ISessionsListControlOptions,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();

		// Load pinned sessions from storage
		this._pinnedSessionIds = this.loadPinnedSessions();

		// Load excluded session types from storage
		this.excludedSessionTypes = this.loadExcludedSessionTypes();

		// Load excluded statuses from storage
		this.excludedStatuses = this.loadExcludedStatuses();

		// Load archived/read filter state
		this._excludeArchived = this.storageService.getBoolean(SessionsList.EXCLUDE_ARCHIVED_KEY, StorageScope.PROFILE, true);
		this._excludeRead = this.storageService.getBoolean(SessionsList.EXCLUDE_READ_KEY, StorageScope.PROFILE, false);
		this.workspaceGroupCapped = this.storageService.getBoolean(SessionsList.WORKSPACE_GROUP_CAPPED_KEY, StorageScope.PROFILE, true);

		this.listContainer = DOM.append(container, $('.sessions-list-control'));

		const approvalModel = this._register(instantiationService.createInstance(AgentSessionApprovalModel));
		const markdownRendererService = instantiationService.invokeFunction(accessor => accessor.get(IMarkdownRendererService));
		const sessionRenderer = new SessionItemRenderer(
			{ grouping: this.options.grouping, sorting: this.options.sorting, isPinned: s => this.isSessionPinned(s) },
			approvalModel,
			instantiationService,
			contextKeyService,
			markdownRendererService,
		);

		const showMoreRenderer = new SessionShowMoreRenderer();

		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<SessionListItem, FuzzyScore>,
			'SessionsListTree',
			this.listContainer,
			new SessionsTreeDelegate(approvalModel),
			[
				sessionRenderer,
				new SessionSectionRenderer(true /* hideSectionCount */, instantiationService, contextKeyService),
				showMoreRenderer,
			],
			{
				accessibilityProvider: new SessionsAccessibilityProvider(),
				identityProvider: {
					getId: (element: SessionListItem) => {
						if (isSessionSection(element)) {
							return `section:${element.id}`;
						}
						if (isSessionShowMore(element)) {
							return `show-more:${element.sectionLabel}`;
						}
						return element.resource.toString();
					}
				},
				horizontalScrolling: false,
				multipleSelectionSupport: true,
				indent: 0,
				findWidgetEnabled: true,
				defaultFindMode: TreeFindMode.Filter,
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (element: SessionListItem) => {
						if (isSessionSection(element)) {
							return element.label;
						}
						if (isSessionShowMore(element)) {
							return element.sectionLabel;
						}
						return element.title.get();
					}
				},
				overrideStyles: this.options.overrideStyles,
				renderIndentGuides: RenderIndentGuides.None,
				twistieAdditionalCssClass: () => 'force-no-twistie',
			}
		));

		this._register(this.tree.onDidOpen(e => {
			const element = e.element;
			if (!element) {
				return;
			}
			if (isSessionShowMore(element)) {
				this.expandedWorkspaceGroups.add(element.sectionLabel);
				this.update();
				return;
			}
			if (!isSessionSection(element)) {
				this.options.onSessionOpen(element.resource);
			}
		}));

		this._register(sessionRenderer.onDidChangeItemHeight(session => {
			if (this.tree.hasElement(session)) {
				this.tree.updateElementHeight(session, undefined);
			}
		}));

		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		this._register(this.tree.onDidChangeCollapseState(e => {
			const element = e.node.element;
			if (element && isSessionSection(element)) {
				this.saveSectionCollapseState(element.id, e.node.collapsed);
			}
		}));

		this._register(this._sessionsManagementService.onDidChangeSessions(() => {
			if (this.visible) {
				this.refresh();
			}
		}));

		this.refresh();
	}

	refresh(): void {
		this.sessions = this._sessionsManagementService.getSessions();
		this.update();
	}

	update(expandAll?: boolean): void {
		// Filter by session type and status
		let filtered = this.sessions;
		if (this.excludedSessionTypes.size > 0) {
			filtered = filtered.filter(s => !this.excludedSessionTypes.has(s.sessionType));
		}
		if (this.excludedStatuses.size > 0) {
			filtered = filtered.filter(s => !this.excludedStatuses.has(s.status.get()));
		}
		if (this._excludeArchived) {
			filtered = filtered.filter(s => !s.isArchived.get());
		}
		if (this._excludeRead) {
			filtered = filtered.filter(s => !s.isRead.get());
		}

		const sorted = this.sortSessions(filtered);

		// Separate pinned and archived sessions (archived always wins over pinned)
		const pinned: ISessionData[] = [];
		const archived: ISessionData[] = [];
		const regular: ISessionData[] = [];
		for (const session of sorted) {
			if (session.isArchived.get()) {
				archived.push(session);
			} else if (this.isSessionPinned(session)) {
				pinned.push(session);
			} else {
				regular.push(session);
			}
		}

		const grouping = this.options.grouping();
		const sections: ISessionSection[] = [];

		// Group remaining non-archived sessions
		const grouped = grouping === SessionsGrouping.Workspace
			? this.groupByWorkspace(regular)
			: this.groupByDate(regular);
		sections.push(...grouped);

		// Add archived section at the bottom
		if (archived.length > 0) {
			sections.push({ id: 'archived', label: localize('archived', "Archived"), sessions: archived });
		}

		const hasTodaySessions = sections.some(s => s.id === 'today' && s.sessions.length > 0);

		// Pinned sessions appear flat at the top (no section header)
		const children: IObjectTreeElement<SessionListItem>[] = [
			...pinned.map(session => ({ element: session as SessionListItem })),
		];

		children.push(...sections.map(section => {
			const isWorkspaceGroup = grouping === SessionsGrouping.Workspace
				&& section.id !== 'archived';
			const isCapped = isWorkspaceGroup && this.workspaceGroupCapped
				&& !this.expandedWorkspaceGroups.has(section.label)
				&& section.sessions.length > SessionsList.WORKSPACE_GROUP_LIMIT;

			let sectionChildren: IObjectTreeElement<SessionListItem>[];
			if (isCapped) {
				const visible = section.sessions.slice(0, SessionsList.WORKSPACE_GROUP_LIMIT);
				const remainingCount = section.sessions.length - SessionsList.WORKSPACE_GROUP_LIMIT;
				sectionChildren = [
					...visible.map(session => ({ element: session as SessionListItem })),
					{ element: { showMore: true as const, sectionLabel: section.label, remainingCount } },
				];
			} else {
				sectionChildren = section.sessions.map(session => ({ element: session as SessionListItem }));
			}

			// Default collapse state for older time sections
			let defaultCollapsed: boolean | ObjectTreeElementCollapseState = ObjectTreeElementCollapseState.PreserveOrExpanded;
			if (grouping === SessionsGrouping.Date && hasTodaySessions) {
				const olderSections = ['yesterday', 'thisWeek', 'older', 'archived'];
				if (olderSections.includes(section.id)) {
					defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
				}
			}
			if (section.id === 'archived') {
				defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
			}

			return {
				element: section as SessionListItem,
				collapsible: true,
				collapsed: this.getSavedCollapseState(section.id) ?? defaultCollapsed,
				children: sectionChildren,
			};
		}));

		this.tree.setChildren(null, children);
		this._onDidUpdate.fire();
	}

	reveal(sessionResource: URI): boolean {
		const resourceStr = sessionResource.toString();
		for (const session of this.sessions) {
			if (session.resource.toString() === resourceStr) {
				if (this.tree.hasElement(session)) {
					if (this.tree.getRelativeTop(session) === null) {
						this.tree.reveal(session, 0.5);
					}
					this.tree.setFocus([session]);
					this.tree.setSelection([session]);
					return true;
				}
			}
		}
		return false;
	}

	clearFocus(): void {
		this.tree.setFocus([]);
		this.tree.setSelection([]);
	}

	hasFocusOrSelection(): boolean {
		return this.tree.getFocus().length > 0 || this.tree.getSelection().length > 0;
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		if (this.visible) {
			this.refresh();
		}
	}

	layout(height: number, width: number): void {
		this.tree.layout(height, width);
	}

	focus(): void {
		this.tree.domFocus();
	}

	openFind(): void {
		this.tree.openFind();
	}

	// Context menu

	private onContextMenu(e: ITreeContextMenuEvent<SessionListItem | null>): void {
		const element = e.element;
		if (!element || isSessionSection(element) || isSessionShowMore(element)) {
			return;
		}

		const contextOverlay: [string, boolean | string][] = [
			[IsSessionPinnedContext.key, this.isSessionPinned(element)],
			[IsSessionArchivedContext.key, element.isArchived.get()],
			[IsSessionReadContext.key, element.isRead.get()],
			['chatSessionType', element.sessionType],
			['chatSessionProviderId', element.providerId],
		];

		const menu = this.menuService.createMenu(SessionItemContextMenuId, this.contextKeyService.createOverlay(contextOverlay));

		this.contextMenuService.showContextMenu({
			getActions: () => Separator.join(...menu.getActions({ arg: element, shouldForwardArgs: true }).map(([, actions]) => actions)),
			getAnchor: () => e.anchor,
			getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id) ?? undefined,
		});

		menu.dispose();
	}

	resetSectionCollapseState(): void {
		this.storageService.remove(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
	}

	// -- Pinning --

	pinSession(session: ISessionData): void {
		this._pinnedSessionIds.add(session.sessionId);
		this.savePinnedSessions();
		this.update();
	}

	unpinSession(session: ISessionData): void {
		this._pinnedSessionIds.delete(session.sessionId);
		this.savePinnedSessions();
		this.update();
	}

	isSessionPinned(session: ISessionData): boolean {
		return this._pinnedSessionIds.has(session.sessionId);
	}

	private loadPinnedSessions(): Set<string> {
		const raw = this.storageService.get(SessionsList.PINNED_SESSIONS_KEY, StorageScope.PROFILE);
		if (raw) {
			try {
				const arr = JSON.parse(raw);
				if (Array.isArray(arr)) {
					return new Set(arr);
				}
			} catch {
				// ignore corrupt data
			}
		}
		return new Set();
	}

	private savePinnedSessions(): void {
		if (this._pinnedSessionIds.size === 0) {
			this.storageService.remove(SessionsList.PINNED_SESSIONS_KEY, StorageScope.PROFILE);
		} else {
			this.storageService.store(SessionsList.PINNED_SESSIONS_KEY, JSON.stringify([...this._pinnedSessionIds]), StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	// -- Session type filtering --

	setSessionTypeExcluded(sessionTypeId: string, excluded: boolean): void {
		if (excluded) {
			this.excludedSessionTypes.add(sessionTypeId);
		} else {
			this.excludedSessionTypes.delete(sessionTypeId);
		}
		this.saveExcludedSessionTypes();
		this.update();
	}

	isSessionTypeExcluded(sessionTypeId: string): boolean {
		return this.excludedSessionTypes.has(sessionTypeId);
	}

	private loadExcludedSessionTypes(): Set<string> {
		const raw = this.storageService.get(SessionsList.EXCLUDED_TYPES_KEY, StorageScope.PROFILE);
		if (raw) {
			try {
				const arr = JSON.parse(raw);
				if (Array.isArray(arr)) {
					return new Set(arr);
				}
			} catch {
				// ignore corrupt data
			}
		}
		return new Set();
	}

	private saveExcludedSessionTypes(): void {
		if (this.excludedSessionTypes.size === 0) {
			this.storageService.remove(SessionsList.EXCLUDED_TYPES_KEY, StorageScope.PROFILE);
		} else {
			this.storageService.store(SessionsList.EXCLUDED_TYPES_KEY, JSON.stringify([...this.excludedSessionTypes]), StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	// -- Status filtering --

	setStatusExcluded(status: SessionStatus, excluded: boolean): void {
		if (excluded) {
			this.excludedStatuses.add(status);
		} else {
			this.excludedStatuses.delete(status);
		}
		this.saveExcludedStatuses();
		this.update();
	}

	isStatusExcluded(status: SessionStatus): boolean {
		return this.excludedStatuses.has(status);
	}

	private loadExcludedStatuses(): Set<SessionStatus> {
		const raw = this.storageService.get(SessionsList.EXCLUDED_STATUSES_KEY, StorageScope.PROFILE);
		if (raw) {
			try {
				const arr = JSON.parse(raw);
				if (Array.isArray(arr)) {
					return new Set(arr);
				}
			} catch {
				// ignore corrupt data
			}
		}
		return new Set();
	}

	private saveExcludedStatuses(): void {
		if (this.excludedStatuses.size === 0) {
			this.storageService.remove(SessionsList.EXCLUDED_STATUSES_KEY, StorageScope.PROFILE);
		} else {
			this.storageService.store(SessionsList.EXCLUDED_STATUSES_KEY, JSON.stringify([...this.excludedStatuses]), StorageScope.PROFILE, StorageTarget.USER);
		}
	}

	// -- Archived / Read filtering --

	setExcludeArchived(exclude: boolean): void {
		this._excludeArchived = exclude;
		this.storageService.store(SessionsList.EXCLUDE_ARCHIVED_KEY, exclude, StorageScope.PROFILE, StorageTarget.USER);
		this.update();
	}

	isExcludeArchived(): boolean {
		return this._excludeArchived;
	}

	setExcludeRead(exclude: boolean): void {
		this._excludeRead = exclude;
		this.storageService.store(SessionsList.EXCLUDE_READ_KEY, exclude, StorageScope.PROFILE, StorageTarget.USER);
		this.update();
	}

	isExcludeRead(): boolean {
		return this._excludeRead;
	}

	resetFilters(): void {
		this.excludedSessionTypes.clear();
		this.saveExcludedSessionTypes();
		this.excludedStatuses.clear();
		this.saveExcludedStatuses();
		this._excludeArchived = true;
		this.storageService.store(SessionsList.EXCLUDE_ARCHIVED_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
		this._excludeRead = false;
		this.storageService.store(SessionsList.EXCLUDE_READ_KEY, false, StorageScope.PROFILE, StorageTarget.USER);
		this.workspaceGroupCapped = true;
		this.storageService.store(SessionsList.WORKSPACE_GROUP_CAPPED_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
		this.expandedWorkspaceGroups.clear();
		this.update();
	}

	// Workspace group capping

	setWorkspaceGroupCapped(capped: boolean): void {
		this.workspaceGroupCapped = capped;
		this.storageService.store(SessionsList.WORKSPACE_GROUP_CAPPED_KEY, capped, StorageScope.PROFILE, StorageTarget.USER);
		if (capped) {
			this.expandedWorkspaceGroups.clear();
		}
		this.update();
	}

	isWorkspaceGroupCapped(): boolean {
		return this.workspaceGroupCapped;
	}

	// -- Section collapse persistence --

	private getSavedCollapseState(sectionId: string): boolean | undefined {
		const raw = this.storageService.get(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
		if (raw) {
			try {
				const state: Record<string, boolean> = JSON.parse(raw);
				if (typeof state[sectionId] === 'boolean') {
					return state[sectionId];
				}
			} catch {
				// ignore corrupt data
			}
		}
		return undefined;
	}

	private saveSectionCollapseState(sectionId: string, collapsed: boolean): void {
		let state: Record<string, boolean> = {};
		const raw = this.storageService.get(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
					state = parsed;
				}
			} catch {
				// ignore corrupt data
			}
		}
		state[sectionId] = collapsed;
		this.storageService.store(SessionsList.SECTION_COLLAPSE_STATE_KEY, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.USER);
	}

	// -- Sorting --

	private sortSessions(sessions: ISessionData[]): ISessionData[] {
		return sortSessions(sessions, this.options.sorting());
	}

	// -- Grouping --

	private groupByWorkspace(sessions: ISessionData[]): ISessionSection[] {
		return groupByWorkspace(sessions);
	}

	private groupByDate(sessions: ISessionData[]): ISessionSection[] {
		return groupByDate(sessions, this.options.sorting());
	}
}

//#endregion

//#region Sorting & Grouping Helpers

export function sortSessions(sessions: ISessionData[], sorting: SessionsSorting): ISessionData[] {
	return [...sessions].sort((a, b) => {
		if (sorting === SessionsSorting.Updated) {
			return b.updatedAt.get().getTime() - a.updatedAt.get().getTime();
		}
		return b.createdAt.getTime() - a.createdAt.getTime();
	});
}

export function groupByWorkspace(sessions: ISessionData[]): ISessionSection[] {
	const groups = new Map<string, ISessionData[]>();
	for (const session of sessions) {
		const workspace = session.workspace.get();
		const label = workspace?.label ?? localize('unknown', "Unknown");
		let group = groups.get(label);
		if (!group) {
			group = [];
			groups.set(label, group);
		}
		group.push(session);
	}

	const unknownWorkspaceLabel = localize('unknown', "Unknown");
	const order = [...groups.keys()]
		.filter(k => k !== unknownWorkspaceLabel)
		.sort((a, b) => a.localeCompare(b));

	const result: ISessionSection[] = order.map(label => ({
		id: `workspace:${label}`,
		label,
		sessions: groups.get(label)!,
	}));

	// "Unknown Workspace" always at the bottom
	const unknownWorkspace = groups.get(unknownWorkspaceLabel);
	if (unknownWorkspace) {
		result.push({ id: `workspace:${unknownWorkspaceLabel}`, label: unknownWorkspaceLabel, sessions: unknownWorkspace });
	}

	return result;
}

export function groupByDate(sessions: ISessionData[], sorting: SessionsSorting): ISessionSection[] {
	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const startOfYesterday = startOfToday - 86_400_000;
	const startOfWeek = startOfToday - 7 * 86_400_000;

	const today: ISessionData[] = [];
	const yesterday: ISessionData[] = [];
	const week: ISessionData[] = [];
	const older: ISessionData[] = [];

	for (const session of sessions) {
		const time = sorting === SessionsSorting.Updated
			? session.updatedAt.get().getTime()
			: session.createdAt.getTime();

		if (time >= startOfToday) {
			today.push(session);
		} else if (time >= startOfYesterday) {
			yesterday.push(session);
		} else if (time >= startOfWeek) {
			week.push(session);
		} else {
			older.push(session);
		}
	}

	const sections: ISessionSection[] = [];
	const addGroup = (id: string, label: string, groupSessions: ISessionData[]) => {
		if (groupSessions.length > 0) {
			sections.push({ id, label, sessions: groupSessions });
		}
	};

	addGroup('today', localize('today', "Today"), today);
	addGroup('yesterday', localize('yesterday', "Yesterday"), yesterday);
	addGroup('thisWeek', localize('lastSevenDays', "Last 7 Days"), week);
	addGroup('older', localize('older', "Older"), older);

	return sections;
}

//#endregion
