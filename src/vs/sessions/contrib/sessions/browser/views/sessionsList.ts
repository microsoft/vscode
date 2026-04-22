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
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { createMatches, FuzzyScore, IMatch } from '../../../../../base/common/filters.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IReader, autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { fromNow } from '../../../../../base/common/date.js';
import { localize } from '../../../../../nls.js';
import { MenuId, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatSessionProviderIdContext } from '../../../../common/contextkeys.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IStyleOverride, defaultButtonStyles, defaultFindWidgetStyles, defaultToggleStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { CopilotCLISessionType, GITHUB_REMOTE_FILE_SCHEME, ISession, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { AgentSessionApprovalModel, IAgentSessionApprovalInfo } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { Separator } from '../../../../../base/common/actions.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsListModelService } from './sessionsListModelService.js';
import { IAgentHostFilterService } from '../../../remoteAgentHost/common/agentHostFilter.js';

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
	readonly sessions: ISession[];
}

export interface ISessionShowMore {
	readonly showMore: true;
	readonly sectionLabel: string;
	readonly remainingCount: number;
}

export type SessionListItem = ISession | ISessionSection | ISessionShowMore;

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
			const approval = getFirstApprovalAcrossChats(this._approvalModel, element as ISession, undefined);
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
	readonly title: HighlightedLabel;
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
		const lineCount = Math.min(label.split(/\r?\n/).length, SessionItemRenderer.APPROVAL_ROW_MAX_LINES);
		return lineCount * SessionItemRenderer._APPROVAL_ROW_LINE_HEIGHT + SessionItemRenderer._APPROVAL_ROW_OVERHEAD;
	}

	private readonly _onDidChangeItemHeight = new Emitter<ISession>();
	readonly onDidChangeItemHeight: Event<ISession> = this._onDidChangeItemHeight.event;

	constructor(
		private readonly options: { grouping: () => SessionsGrouping; sorting: () => SessionsSorting; isPinned: (session: ISession) => boolean; isRead: (session: ISession) => boolean },
		private readonly approvalModel: AgentSessionApprovalModel | undefined,
		private readonly instantiationService: IInstantiationService,
		private readonly contextKeyService: IContextKeyService,
		private readonly markdownRendererService: IMarkdownRendererService,
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): ISessionItemTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());

		container.classList.add('session-item');

		const iconContainer = DOM.append(container, $('.session-icon'));
		const mainCol = DOM.append(container, $('.session-main'));
		const titleRow = DOM.append(mainCol, $('.session-title-row'));
		const title = disposables.add(new HighlightedLabel(DOM.append(titleRow, $('.session-title'))));
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

		return { container, iconContainer, title, titleToolbar, detailsRow, approvalRow, approvalLabel, approvalButtonContainer, contextKeyService, disposables, elementDisposables };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionItemTemplate): void {
		const element = node.element;
		if (isSessionSection(element) || isSessionShowMore(element)) {
			return;
		}
		this.renderSession(element, template, createMatches(node.filterData));
	}

	private renderSession(element: ISession, template: ISessionItemTemplate, matches?: IMatch[]): void {
		template.elementDisposables.clear();

		// Toolbar context
		template.titleToolbar.context = element;

		// Context keys
		const isPinned = this.options.isPinned(element);
		IsSessionPinnedContext.bindTo(template.contextKeyService).set(isPinned);
		IsSessionArchivedContext.bindTo(template.contextKeyService).set(element.isArchived.get());
		IsSessionReadContext.bindTo(template.contextKeyService).set(this.options.isRead(element));

		// Pinned & archived styling — reactive
		template.elementDisposables.add(autorun(reader => {
			const isArchived = element.isArchived.read(reader);
			template.container.classList.toggle('archived', isArchived);
			// Only apply pinned styling when not archived to avoid persistent toolbars on archived sessions
			template.container.classList.toggle('pinned', isPinned && !isArchived);
		}));

		// Icon — reactive based on status, read state, and PR
		template.elementDisposables.add(autorun(reader => {
			const sessionStatus = element.status.read(reader);
			const isRead = this.options.isRead(element);
			const isArchived = element.isArchived.read(reader);
			const gitHubInfo = element.gitHubInfo.read(reader);
			DOM.clearNode(template.iconContainer);
			const icon = this.getStatusIcon(sessionStatus, isRead, isArchived, gitHubInfo?.pullRequest?.icon);
			const iconSpan = DOM.append(template.iconContainer, $(`span${ThemeIcon.asCSSSelector(icon)}`));
			iconSpan.style.color = icon.color ? asCssVariable(icon.color.id) : '';
			template.iconContainer.classList.toggle('session-icon-pulse', sessionStatus === SessionStatus.NeedsInput);
			template.container.classList.toggle('in-progress', sessionStatus === SessionStatus.InProgress);
		}));

		// Title — reactive
		template.elementDisposables.add(autorun(reader => {
			const titleText = element.title.read(reader);
			template.title.set(titleText, matches);
		}));

		// Details row — reactive: badge · diff stats · time
		const timeDisposable = template.elementDisposables.add(new MutableDisposable());
		const descriptionDisposable = template.elementDisposables.add(new MutableDisposable());
		template.elementDisposables.add(autorun(reader => {
			const sessionStatus = element.status.read(reader);
			const changes = element.changes.read(reader);
			const workspace = element.workspace.read(reader);
			const description = element.description.read(reader);
			let timeDate: Date | undefined;

			// When the session is InProgress or NeedsInput, hide workspace/diff/time details in this row
			const hideDetails = sessionStatus === SessionStatus.InProgress || sessionStatus === SessionStatus.NeedsInput;

			if (!hideDetails) {
				timeDate = this.options.sorting() === SessionsSorting.Updated ? element.updatedAt.read(reader) : element.createdAt;
			}
			// Clear and rebuild details row
			DOM.clearNode(template.detailsRow);
			const parts: HTMLElement[] = [];

			const isWorkspaceSession = workspace &&
				workspace.repositories.length > 0 &&
				workspace?.repositories[0].workingDirectory === undefined;

			// Session type icon in details row
			// Disabling background icon - hacky but couldn't figure out how to do it from the new provider
			if (element.sessionType !== CopilotCLISessionType.id) {
				const typeIconEl = DOM.append(template.detailsRow, $('span.session-details-icon'));
				DOM.append(typeIconEl, $(`span${ThemeIcon.asCSSSelector(element.icon)}`));
				parts.push(typeIconEl);
			} else if (
				element.sessionType === CopilotCLISessionType.id &&
				sessionStatus !== SessionStatus.InProgress &&
				isWorkspaceSession
			) {
				const typeIconEl = DOM.append(template.detailsRow, $('span.session-details-icon'));
				DOM.append(typeIconEl, $(`span${ThemeIcon.asCSSSelector(Codicon.folder)}`));
				parts.push(typeIconEl);
			}

			// Workspace badge — show when not grouped by workspace,
			// or when the session is pinned/archived (their section headers
			// don't carry the workspace name)
			if (!hideDetails && workspace && (
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
			if (!hideDetails && changes.length > 0) {
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
				if (description) {
					descriptionDisposable.value = this.markdownRendererService.render(description, { sanitizerConfig: { replaceWithPlaintext: true } }, statusEl);
				} else {
					descriptionDisposable.clear();
					statusEl.textContent = localize('working', "Working...");
				}
				parts.push(statusEl);
			} else if (sessionStatus === SessionStatus.NeedsInput) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
				if (description) {
					descriptionDisposable.value = this.markdownRendererService.render(description, { sanitizerConfig: { replaceWithPlaintext: true } }, statusEl);
				} else {
					descriptionDisposable.clear();
					statusEl.textContent = localize('needsInput', "Input needed");
				}
				parts.push(statusEl);
			} else if (sessionStatus === SessionStatus.Error) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				const statusEl = DOM.append(template.detailsRow, $('span.session-description'));
				if (description) {
					descriptionDisposable.value = this.markdownRendererService.render(description, { sanitizerConfig: { replaceWithPlaintext: true } }, statusEl);
				} else {
					descriptionDisposable.clear();
					statusEl.textContent = localize('failed', "Failed");
				}
				parts.push(statusEl);
			} else {
				descriptionDisposable.clear();
			}

			// Timestamp — visible when not hiding details
			if (!hideDetails && timeDate) {
				if (parts.length > 0) {
					DOM.append(template.detailsRow, $('span.session-separator.has-separator'));
				}
				const timeEl = DOM.append(template.detailsRow, $('span.session-time'));
				const definiteTimeDate = timeDate;
				const formatTime = () => {
					const seconds = Math.round((Date.now() - definiteTimeDate.getTime()) / 1000);
					return seconds < 60 ? localize('secondsDuration', "now") : fromNow(definiteTimeDate, true);
				};
				timeEl.textContent = formatTime();
				const targetWindow = DOM.getWindow(timeEl);
				const interval = targetWindow.setInterval(() => {
					timeEl.textContent = formatTime();
				}, 60_000);
				timeDisposable.value = toDisposable(() => targetWindow.clearInterval(interval));
			} else {
				timeDisposable.clear();
			}
		}));

		// Approval row — reactive
		if (this.approvalModel) {
			this.renderApprovalRow(element, template);
		}
	}

	private renderApprovalRow(element: ISession, template: ISessionItemTemplate): void {
		if (!this.approvalModel) {
			return;
		}

		const approvalModel = this.approvalModel;
		const initialInfo = getFirstApprovalAcrossChats(approvalModel, element, undefined);
		let wasVisible = !!initialInfo;
		template.approvalRow.classList.toggle('visible', wasVisible);

		const buttonStore = template.elementDisposables.add(new DisposableStore());

		template.elementDisposables.add(autorun(reader => {
			buttonStore.clear();

			const info = getFirstApprovalAcrossChats(approvalModel, element, reader);
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

				// Hover with full content as a code block
				const fullContent = new MarkdownString().appendCodeblock(info.languageId ?? 'json', info.label);
				buttonStore.add(this.hoverService.setupDelayedHover(template.approvalLabel, {
					content: fullContent,
					style: HoverStyle.Pointer,
					position: { hoverPosition: HoverPosition.BELOW },
				}));

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
			case SessionStatus.InProgress: return { ...ThemeIcon.modify(Codicon.loading, 'spin'), color: themeColorFromId('textLink.foreground') };
			case SessionStatus.NeedsInput: return { ...Codicon.circleFilled, color: themeColorFromId('list.warningForeground') };
			case SessionStatus.Error: return { ...Codicon.error, color: themeColorFromId('errorForeground') };
			default:
				if (pullRequestIcon) {
					return pullRequestIcon;
				}

				if (!isRead && !isArchived) {
					return { ...Codicon.circleFilled, color: themeColorFromId('textLink.foreground') };
				}
				return { ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
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
		const title = element.title.get();
		const created = fromNow(element.createdAt, true);
		return localize('sessionItemAria', "{0}, created {1}", title, created);
	}
}

//#endregion

//#region Sessions List Control

export interface ISessionsListControlOptions {
	readonly overrideStyles?: IStyleOverride<IListStyles>;
	readonly grouping: () => SessionsGrouping;
	readonly sorting: () => SessionsSorting;
	readonly findWidgetContainer?: HTMLElement;
	onSessionOpen(resource: URI, preserveFocus: boolean): void;
}

/**
 * @deprecated Use {@link ISessionsListControlOptions} instead.
 */
export type ISessionsListOptions = ISessionsListControlOptions;

export interface ISessionsList {
	readonly element: HTMLElement;
	readonly onDidUpdate: Event<void>;
	readonly onDidChangeFindOpenState: Event<boolean>;
	refresh(): void;
	reveal(sessionResource: URI): boolean;
	clearFocus(): void;
	hasFocusOrSelection(): boolean;
	setVisible(visible: boolean): void;
	layout(height: number, width: number): void;
	focus(): void;
	update(expandAll?: boolean): void;
	openFind(): void;
	closeFind(): void;
	resetSectionCollapseState(): void;
	pinSession(session: ISession): void;
	unpinSession(session: ISession): void;
	isSessionPinned(session: ISession): boolean;
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
	private static readonly EXCLUDED_TYPES_KEY = 'sessionsListControl.excludedSessionTypes';
	private static readonly EXCLUDED_STATUSES_KEY = 'sessionsListControl.excludedStatuses';
	private static readonly EXCLUDE_ARCHIVED_KEY = 'sessionsListControl.excludeArchived';
	private static readonly EXCLUDE_READ_KEY = 'sessionsListControl.excludeRead';
	private static readonly WORKSPACE_GROUP_CAPPED_KEY = 'sessionsListControl.workspaceGroupCapped';
	private static readonly WORKSPACE_GROUP_LIMIT = 5;

	private readonly listContainer: HTMLElement;
	private readonly tree: WorkbenchObjectTree<SessionListItem, FuzzyScore>;
	private sessions: ISession[] = [];
	private visible = true;
	private readonly excludedSessionTypes: Set<string>;
	private readonly excludedStatuses: Set<SessionStatus>;
	private _excludeArchived: boolean;
	private _excludeRead: boolean;
	private workspaceGroupCapped: boolean;
	private readonly expandedWorkspaceGroups = new Set<string>();
	private findOpen = false;

	private readonly _onDidUpdate = this._register(new Emitter<void>());
	readonly onDidUpdate: Event<void> = this._onDidUpdate.event;

	private readonly _onDidChangeFindOpenState = this._register(new Emitter<boolean>());
	readonly onDidChangeFindOpenState: Event<boolean> = this._onDidChangeFindOpenState.event;

	get element(): HTMLElement { return this.listContainer; }

	constructor(
		container: HTMLElement,
		private readonly options: ISessionsListControlOptions,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsListModelService private readonly _sessionsListModelService: ISessionsListModelService,
		@IAgentHostFilterService private readonly _agentHostFilterService: IAgentHostFilterService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();

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
		const hoverService = instantiationService.invokeFunction(accessor => accessor.get(IHoverService));
		const sessionRenderer = new SessionItemRenderer(
			{ grouping: this.options.grouping, sorting: this.options.sorting, isPinned: s => this.isSessionPinned(s), isRead: s => this.isSessionRead(s) },
			approvalModel,
			instantiationService,
			contextKeyService,
			markdownRendererService,
			hoverService,
		);

		const showMoreRenderer = new SessionShowMoreRenderer();

		const delegate = new SessionsTreeDelegate(approvalModel);

		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<SessionListItem, FuzzyScore>,
			'SessionsListTree',
			this.listContainer,
			delegate,
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
				findWidgetContainer: this.options.findWidgetContainer,
				findWidgetStyles: {
					...defaultFindWidgetStyles,
					toggleStyles: {
						...defaultToggleStyles,
						inputActiveOptionBorder: 'transparent',
					},
				},
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
				this.markRead(element);
				this.options.onSessionOpen(element.resource, e.editorOptions.preserveFocus ?? false);
			}
		}));

		this._register(sessionRenderer.onDidChangeItemHeight(session => {
			if (this.tree.hasElement(session)) {
				this.tree.updateElementHeight(session, delegate.getHeight(session));
			}
		}));

		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		this._register(this.tree.onDidChangeCollapseState(e => {
			const element = e.node.element;
			if (element && isSessionSection(element)) {
				this.saveSectionCollapseState(element.id, e.node.collapsed);
			}
		}));

		this._register(this.tree.onDidChangeFindOpenState(open => {
			this.findOpen = open;
			this._onDidChangeFindOpenState.fire(open);
			this.update();
		}));

		this._register(this._sessionsManagementService.onDidChangeSessions(() => {
			if (this.visible) {
				this.refresh();
			}
		}));

		this._register(this._sessionsListModelService.onDidChange(() => {
			if (this.visible) {
				this.update();
			}
		}));

		this._register(this._agentHostFilterService.onDidChange(() => {
			if (this.visible) {
				this.update();
			}
		}));

		// Re-update when the active session changes so that a filtered-out
		// session becomes visible while active and hides again when unselected.
		// Also mark the newly active session as read.
		this._register(autorun(reader => {
			const activeSession = this._sessionsManagementService.activeSession.read(reader);
			if (activeSession) {
				this._sessionsListModelService.markRead(activeSession);
			}
			if (this.visible) {
				this.update();
			}
		}));

		this.refresh();
	}

	refresh(): void {
		this.sessions = this._sessionsManagementService.getSessions();
		this.update();
	}

	update(expandAll?: boolean): void {
		const activeSession = this._sessionsManagementService.activeSession.get();

		// Filter by session type and status
		let filtered = this.sessions;
		const hostFilter = this._agentHostFilterService.selectedProviderId;
		if (hostFilter !== undefined) {
			filtered = filtered.filter(s => s.providerId === hostFilter);
		}
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
			filtered = filtered.filter(s => !this.isSessionRead(s));
		}

		// Always include the active session even if it was filtered out,
		// so it remains visible while selected
		if (activeSession && !filtered.some(s => s.sessionId === activeSession.sessionId)) {
			const match = this.sessions.find(s => s.sessionId === activeSession.sessionId);
			if (match) {
				filtered = [...filtered, match];
			}
		}

		const grouping = this.options.grouping();
		const sections = groupSessionsForList(filtered, grouping, this.options.sorting(), session => this.isSessionPinned(session));

		const hasTodaySessions = sections.some(s => s.id === 'today' && s.sessions.length > 0);

		const children: IObjectTreeElement<SessionListItem>[] = [];

		children.push(...sections.map(section => {
			const isWorkspaceGroup = grouping === SessionsGrouping.Workspace
				&& section.id.startsWith('workspace:');
			const isCapped = isWorkspaceGroup && this.workspaceGroupCapped
				&& !this.findOpen
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

		if (this.tree.getFocus().length === 0) {
			this.tree.focusFirst();
		}
	}

	openFind(): void {
		this.tree.openFind();
	}

	closeFind(): void {
		this.tree.closeFind();
	}

	// Context menu

	private onContextMenu(e: ITreeContextMenuEvent<SessionListItem | null>): void {
		const element = e.element;
		if (!element || isSessionSection(element) || isSessionShowMore(element)) {
			return;
		}

		const selection = this.tree.getSelection().filter((s): s is ISession => !!s && !isSessionSection(s) && !isSessionShowMore(s));
		const selectedSessions = selection.includes(element) ? [element, ...selection.filter(s => s !== element)] : [element];

		const contextOverlay: [string, boolean | string][] = [
			[IsSessionPinnedContext.key, this.isSessionPinned(element)],
			[IsSessionArchivedContext.key, element.isArchived.get()],
			[IsSessionReadContext.key, this.isSessionRead(element)],
			['chatSessionType', element.sessionType],
			[ChatSessionProviderIdContext.key, element.providerId],
		];

		const menu = this.menuService.createMenu(SessionItemContextMenuId, this.contextKeyService.createOverlay(contextOverlay));

		this.contextMenuService.showContextMenu({
			getActions: () => Separator.join(...menu.getActions({ arg: selectedSessions, shouldForwardArgs: true }).map(([, actions]) => actions)),
			getAnchor: () => e.anchor,
			getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id) ?? undefined,
		});

		menu.dispose();
	}

	resetSectionCollapseState(): void {
		this.storageService.remove(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
	}

	// -- Pinning --

	pinSession(session: ISession): void {
		this._sessionsListModelService.pinSession(session);
	}

	unpinSession(session: ISession): void {
		this._sessionsListModelService.unpinSession(session);
	}

	isSessionPinned(session: ISession): boolean {
		return this._sessionsListModelService.isSessionPinned(session);
	}

	// -- Read/Unread --

	markRead(session: ISession): void {
		this._sessionsListModelService.markRead(session);
	}

	markUnread(session: ISession): void {
		this._sessionsListModelService.markUnread(session);
	}

	isSessionRead(session: ISession): boolean {
		return this._sessionsListModelService.isSessionRead(session);
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

}

//#endregion

//#region Approval Helpers

function getFirstApprovalAcrossChats(approvalModel: AgentSessionApprovalModel, session: ISession, reader: IReader | undefined,): IAgentSessionApprovalInfo | undefined {
	let oldest: IAgentSessionApprovalInfo | undefined;
	for (const chat of session.chats.read(reader)) {
		const approval = approvalModel.getApproval(chat.resource).read(reader);
		if (approval && (!oldest || approval.since.getTime() < oldest.since.getTime())) {
			oldest = approval;
		}
	}
	return oldest;
}

//#endregion

//#region Sorting & Grouping Helpers

export function sortSessions(sessions: ISession[], sorting: SessionsSorting): ISession[] {
	return [...sessions].sort((a, b) => {
		if (sorting === SessionsSorting.Updated) {
			return b.updatedAt.get().getTime() - a.updatedAt.get().getTime();
		}
		return b.createdAt.getTime() - a.createdAt.getTime();
	});
}

export function groupSessionsForList(
	sessions: ISession[],
	grouping: SessionsGrouping,
	sorting: SessionsSorting,
	isSessionPinned: (session: ISession) => boolean,
): ISessionSection[] {
	const sorted = sortSessions(sessions, sorting);

	// Archived always wins over pinned so done sessions stay grouped together.
	const pinned: ISession[] = [];
	const archived: ISession[] = [];
	const regular: ISession[] = [];
	for (const session of sorted) {
		if (session.isArchived.get()) {
			archived.push(session);
		} else if (isSessionPinned(session)) {
			pinned.push(session);
		} else {
			regular.push(session);
		}
	}

	const sections: ISessionSection[] = [];
	if (pinned.length > 0) {
		sections.push({ id: 'pinned', label: localize('pinned', "Pinned"), sessions: pinned });
	}

	sections.push(...(grouping === SessionsGrouping.Workspace
		? groupByWorkspace(regular)
		: groupByDate(regular, sorting)));

	if (archived.length > 0) {
		sections.push({ id: 'archived', label: localize('archived', "Done"), sessions: archived });
	}

	return sections;
}

export function groupByWorkspace(sessions: ISession[]): ISessionSection[] {
	const groups = new Map<string, ISession[]>();
	for (const session of sessions) {
		const workspace = session.workspace.get();
		const label = workspace?.label || localize('unknown', "Unknown");
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

export function groupByDate(sessions: ISession[], sorting: SessionsSorting): ISessionSection[] {
	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const startOfYesterday = startOfToday - 86_400_000;
	const startOfWeek = startOfToday - 7 * 86_400_000;

	const today: ISession[] = [];
	const yesterday: ISession[] = [];
	const week: ISession[] = [];
	const older: ISession[] = [];

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
	const addGroup = (id: string, label: string, groupSessions: ISession[]) => {
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
