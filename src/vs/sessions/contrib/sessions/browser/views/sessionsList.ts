/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionsList.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Gesture } from '../../../../../base/browser/touch.js';
import { IListVirtualDelegate, NotSelectableGroupId } from '../../../../../base/browser/ui/list/list.js';
import { IListStyles } from '../../../../../base/browser/ui/list/listWidget.js';
import { IObjectTreeElement, ITreeNode, ITreeRenderer, ITreeContextMenuEvent, ObjectTreeElementCollapseState, ITreeDragAndDrop, ITreeDragOverReaction } from '../../../../../base/browser/ui/tree/tree.js';
import { RenderIndentGuides, TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { createMatches, FuzzyScore, IMatch } from '../../../../../base/common/filters.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IObservable, IReader, autorun, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { fromNow } from '../../../../../base/common/date.js';
import { localize } from '../../../../../nls.js';
import { MenuId, IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { ChatSessionProviderIdContext, ChatSessionTypeContext, IsPhoneLayoutContext, SessionIsArchivedContext, SessionIsReadContext } from '../../../../common/contextkeys.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IStyleOverride, defaultButtonStyles, defaultFindWidgetStyles, defaultToggleStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISession, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { AgentSessionApprovalModel, IAgentSessionApprovalInfo } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { ISessionsManagementService, IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsViewService } from '../../../../services/sessions/browser/sessionsViewService.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { IWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/common/assignmentService.js';
// =============================================================================
// TEMPORARY (tracked by https://github.com/microsoft/vscode/issues/320480)
// -----------------------------------------------------------------------------
// `IAgentSessionsService` is a Copilot-provider internal and must normally only
// be consumed by the Copilot chat sessions provider — the rest of the Agents
// window stays provider-agnostic (see SESSIONS.md). This single, deliberate
// exception lets the sessions list trigger lazy resolution of expensive session
// properties (e.g. changes) for rows that scroll into view, until Don
// re-implements it the right way (driven from inside the Copilot provider, or
// via a provider-agnostic visibility signal on the shared services).
// DO NOT add further usages of this import in the sessions workbench, and DO NOT
// copy this suppression elsewhere.
// =============================================================================
// eslint-disable-next-line no-restricted-imports
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { DraggedSessionIdentifier, SessionsDataTransfers } from '../../../../browser/dnd.js';
import { IDragAndDropData } from '../../../../../base/browser/dnd.js';
import { ElementsDragAndDropData } from '../../../../../base/browser/ui/list/listView.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { buildSessionHoverContent } from '../sessionHoverContent.js';
import { SessionStatusIcon } from '../../../../browser/sessionStatusIcon.js';

const $ = DOM.$;

const SESSION_SECTION_FOCUS_FROM_POINTER_CLASS = 'session-section-focus-from-pointer';

export const SessionItemToolbarMenuId = new MenuId('SessionItemToolbar');
export const SessionItemContextMenuId = MenuId.SessionItemContextMenu;
export const SessionSectionToolbarMenuId = new MenuId('SessionSectionToolbar');
export const IsSessionPinnedContext = new RawContextKey<boolean>('sessionItem.isPinned', false);
export const SessionItemHasBranchNameContext = new RawContextKey<boolean>('sessionItem.hasBranchName', false);
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
	readonly kind: 'sessions' | 'folders';
	readonly mode: 'more' | 'less';
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

const SHOW_MORE_FOLDERS_LABEL = '__more_folders__';
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;

//#endregion

//#region Tree Delegate

class SessionsTreeDelegate implements IListVirtualDelegate<SessionListItem> {
	private static readonly ITEM_HEIGHT = 54;
	/**
	 * Phone layout uses a taller row so the inline action toolbar can
	 * meet the 44px minimum touch target without overflowing. Sized to
	 * fit a 44px toolbar centered between the title and details rows.
	 * Keep in sync with the `.phone-layout .session-item` rules in
	 * `sessionsList.css`.
	 */
	private static readonly ITEM_HEIGHT_PHONE = 76;
	private static readonly SECTION_HEIGHT = 26;
	private static readonly SHOW_MORE_HEIGHT = 26;

	constructor(
		private readonly _approvalModel: AgentSessionApprovalModel | undefined,
		private readonly _isPhone: () => boolean,
	) { }

	getHeight(element: SessionListItem): number {
		if (isSessionSection(element)) {
			return SessionsTreeDelegate.SECTION_HEIGHT;
		}
		if (isSessionShowMore(element)) {
			return SessionsTreeDelegate.SHOW_MORE_HEIGHT;
		}

		let height = this._isPhone() ? SessionsTreeDelegate.ITEM_HEIGHT_PHONE : SessionsTreeDelegate.ITEM_HEIGHT;
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
	readonly statusIcon: SessionStatusIcon;
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
		private readonly options: { grouping: () => SessionsGrouping; sorting: () => SessionsSorting; isPinned: (session: ISession) => boolean; isRead: (session: ISession) => boolean; visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> },
		private readonly approvalModel: AgentSessionApprovalModel | undefined,
		private readonly instantiationService: IInstantiationService,
		private readonly contextKeyService: IContextKeyService,
		private readonly markdownRendererService: IMarkdownRendererService,
		private readonly hoverService: IHoverService,
		private readonly sessionsProvidersService: ISessionsProvidersService,
		// TEMPORARY — see the note on the `IAgentSessionsService` import above (#320480).
		private readonly agentSessionsService: IAgentSessionsService,
	) {
	}

	renderTemplate(container: HTMLElement): ISessionItemTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());

		container.classList.add('session-item');

		const iconContainer = DOM.append(container, $('.session-icon'));
		const statusIcon = disposables.add(this.instantiationService.createInstance(SessionStatusIcon, iconContainer));
		const mainCol = DOM.append(container, $('.session-main'));
		const titleRow = DOM.append(mainCol, $('.session-title-row'));
		const title = disposables.add(new HighlightedLabel(DOM.append(titleRow, $('.session-title'))));
		const titleToolbarContainer = DOM.append(titleRow, $('.session-title-toolbar'));
		// The list opens a session on click and on Gesture `tap` (touch).
		// DOM event propagation stops only cover mouse/pointer events; the
		// list's tap handler reads from `Gesture` directly, bypassing
		// bubbling. Combine both: stop pointer/click for mouse, and
		// register the toolbar with `Gesture.ignoreTarget` so synthesized
		// tap events on touch never reach the list either.
		for (const eventType of ['pointerdown', 'pointerup', 'click', 'dblclick'] as const) {
			disposables.add(DOM.addDisposableListener(titleToolbarContainer, eventType, e => e.stopPropagation()));
		}
		disposables.add(Gesture.ignoreTarget(titleToolbarContainer));
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

		return { container, statusIcon, title, titleToolbar, detailsRow, approvalRow, approvalLabel, approvalButtonContainer, contextKeyService, disposables, elementDisposables };
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

		// TEMPORARY (#320480): trigger lazy resolve of expensive session
		// properties (e.g. changes) for rows that scroll into view, so providers
		// that populate them on demand deliver fresh data by the time the row
		// renders. This reaches into a Copilot-provider internal and must be
		// moved into the provider — see the note on the import above.
		this.agentSessionsService.model.observeSession(element.resource);

		// Rich hover on the row showing folder, branch, diff stats and provider.
		// Shown to the right of the row, similar to the extensions list.
		template.elementDisposables.add(this.hoverService.setupDelayedHover(template.container, () => ({
			content: buildSessionHoverContent(element, this.sessionsProvidersService),
			appearance: { showPointer: true },
			position: { hoverPosition: HoverPosition.RIGHT, forcePosition: true },
			persistence: { hideOnHover: false },
		}), { groupId: 'sessions-list' }));

		// Toolbar context
		template.titleToolbar.context = element;

		// Context keys
		const isPinned = this.options.isPinned(element);
		IsSessionPinnedContext.bindTo(template.contextKeyService).set(isPinned);
		SessionIsArchivedContext.bindTo(template.contextKeyService).set(element.isArchived.get());
		SessionIsReadContext.bindTo(template.contextKeyService).set(this.options.isRead(element));
		SessionItemHasBranchNameContext.bindTo(template.contextKeyService).set(!!element.workspace.get()?.folders[0]?.gitRepository?.branchName?.trim());

		// Pinned & archived styling — reactive
		template.elementDisposables.add(autorun(reader => {
			const isArchived = element.isArchived.read(reader);
			template.container.classList.toggle('archived', isArchived);
			// Only apply pinned styling when not archived to avoid persistent toolbars on archived sessions
			template.container.classList.toggle('pinned', isPinned && !isArchived);
		}));

		// Sticky styling — reactive on the wrapper's sticky observable
		template.elementDisposables.add(autorun(reader => {
			const wrapper = this.options.visibleSessions.read(reader).find(s => s?.sessionId === element.sessionId);
			const isSticky = wrapper ? wrapper.sticky.read(reader) : false;
			template.container.classList.toggle('sticky', isSticky);
		}));

		// Icon — reactive based on status, read state, PR, and motion preference.
		// The current icon CSS selector is stored on the template (not a local
		// variable) so it survives across renderSession calls — the tree re-renders
		// all visible rows on every splice, which clears elementDisposables and
		// recreates the autorun. Without template-level tracking, the selector
		// resets to undefined and the DOM is rebuilt every time, restarting the
		// CSS spin animation.
		template.elementDisposables.add(autorun(reader => {
			const sessionStatus = element.status.read(reader);
			const isRead = this.options.isRead(element);
			const isArchived = element.isArchived.read(reader);
			const gitHubInfo = element.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);

			// The status icon (spinner vs. codicon, cross-fade, reduced-motion) is fully
			// owned by the SessionStatusIcon widget; here we just feed it the latest state.
			// Row recycling re-feeds the widget, which cross-fades to the new session's icon.
			template.statusIcon.setStatus(sessionStatus, isRead, isArchived, gitHubInfo?.pullRequest?.icon);
			template.container.classList.toggle('in-progress', sessionStatus === SessionStatus.InProgress);
			template.container.classList.toggle('needs-input', sessionStatus === SessionStatus.NeedsInput);
			template.container.classList.toggle('unread', !isRead && !isArchived);
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
			const changesSummary = element.changesSummary?.read(reader);
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

			if (sessionStatus !== SessionStatus.InProgress) {
				const isWorkspaceSession = workspace &&
					workspace.folders.length > 0 &&
					workspace?.folders[0]?.gitRepository?.workTreeUri === undefined;
				const icon = workspace?.isVirtualWorkspace ? Codicon.cloudCompact : isWorkspaceSession ? Codicon.folderCompact : Codicon.worktreeCompact;
				const typeIconEl = DOM.append(template.detailsRow, $('span.session-details-icon'));
				DOM.append(typeIconEl, $(`span${ThemeIcon.asCSSSelector(icon)}`));
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
			if (!hideDetails && (changesSummary || changes.length > 0)) {
				let insertions = 0, deletions = 0;

				if (changesSummary) {
					insertions = changesSummary.additions;
					deletions = changesSummary.deletions;
				} else if (changes.length > 0) {
					for (const change of changes) {
						insertions += change.insertions;
						deletions += change.deletions;
					}
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

	private getWorkspaceBadgeLabel(workspace: ISessionWorkspace): string | undefined {
		// For GitHub remote sessions, extract owner/name from the repository URI path
		const folder = workspace.folders[0];
		if (folder?.root.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			const parts = folder.root.path.split('/').filter(Boolean);
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
	readonly chevron: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly disposables: DisposableStore;
}

class SessionSectionRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionSectionTemplate> {
	static readonly TEMPLATE_ID = 'session-section';
	readonly templateId = SessionSectionRenderer.TEMPLATE_ID;

	private readonly templatesByElement = new WeakMap<ISessionSection, ISessionSectionTemplate>();

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
		const chevron = DOM.append(container, $('span.session-section-chevron'));
		chevron.setAttribute('aria-hidden', 'true');

		const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
		const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, SessionSectionToolbarMenuId, {
			menuOptions: { shouldForwardArgs: true },
		}));

		return { container, label, count, toolbar, chevron, contextKeyService, disposables };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionSectionTemplate): void {
		const element = node.element;
		if (!isSessionSection(element)) {
			return;
		}
		this.templatesByElement.set(element, template);
		template.label.textContent = element.label;
		if (this.hideSectionCount) {
			template.count.textContent = '';
			template.count.style.display = 'none';
		} else {
			template.count.textContent = String(element.sessions.length);
			template.count.style.display = '';
		}

		this.updateChevron(template, node.collapsible, node.collapsed);

		// Set context key for section type so toolbar actions can use when clauses
		const sectionType = element.id.startsWith('workspace:') ? 'workspace' : element.id;
		SessionSectionTypeContext.bindTo(template.contextKeyService).set(sectionType);
		template.toolbar.context = element;
	}

	/**
	 * Updates the expand/collapse chevron for an already-rendered section. The
	 * tree only re-invokes `renderTwistie` (not `renderElement`) when a section's
	 * collapse state toggles, so the owning list forwards collapse changes here.
	 */
	updateCollapseState(element: ISessionSection, collapsed: boolean): void {
		const template = this.templatesByElement.get(element);
		if (template) {
			this.updateChevron(template, true, collapsed);
		}
	}

	private updateChevron(template: ISessionSectionTemplate, collapsible: boolean, collapsed: boolean): void {
		template.chevron.className = 'session-section-chevron';
		if (collapsible) {
			template.chevron.classList.add('collapsible');
			const icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
			template.chevron.classList.add(...ThemeIcon.asClassNameArray(icon));
		}
	}

	disposeElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, _template: ISessionSectionTemplate): void {
		if (isSessionSection(node.element)) {
			this.templatesByElement.delete(node.element);
		}
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
		const container = template.parentElement;
		container?.classList.toggle('session-show-more-folders', element.kind === 'folders');
		if (element.mode === 'less') {
			template.textContent = element.kind === 'folders'
				? localize('showLessWorkspacesCompact', "Show fewer workspaces")
				: localize('showLessCompact', "Show less");
		} else {
			template.textContent = element.kind === 'folders'
				? element.remainingCount === 1
					? localize('showMoreWorkspaceCompact', "+{0} more workspace", element.remainingCount)
					: localize('showMoreWorkspacesCompact', "+{0} more workspaces", element.remainingCount)
				: localize('showMoreCompact', "+{0} more", element.remainingCount);
		}
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
			if (element.mode === 'less') {
				return element.kind === 'folders'
					? localize('showLessWorkspacesAria', "Show fewer workspaces")
					: localize('showLessAria', "Show fewer sessions");
			}
			return element.kind === 'folders'
				? element.remainingCount === 1
					? localize('showMoreWorkspaceAria', "Show {0} more workspace", element.remainingCount)
					: localize('showMoreWorkspacesAria', "Show {0} more workspaces", element.remainingCount)
				: localize('showMoreAria', "Show {0} more sessions", element.remainingCount);
		}
		const title = element.title.get();
		const created = fromNow(element.createdAt, true);
		return localize('sessionItemAria', "{0}, created {1}", title, created);
	}
}

//#endregion

//#region Drag and Drop

class SessionsListDragAndDrop extends Disposable implements ITreeDragAndDrop<SessionListItem> {

	private readonly _transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();

	getDragURI(element: SessionListItem): string | null {
		if (isSessionSection(element) || isSessionShowMore(element)) {
			return null;
		}
		return element.resource.toString();
	}

	getDragLabel(elements: SessionListItem[]): string | undefined {
		const sessions = elements.filter((e): e is ISession => !isSessionSection(e) && !isSessionShowMore(e));
		if (sessions.length === 0) {
			return undefined;
		}
		if (sessions.length === 1) {
			return sessions[0].title.get();
		}
		return localize('sessions.dragLabel', "{0} sessions", sessions.length);
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const elements = (data instanceof ElementsDragAndDropData ? data.elements : []) as SessionListItem[];
		const sessions = elements.filter((e): e is ISession => !isSessionSection(e) && !isSessionShowMore(e));
		if (sessions.length === 0) {
			return;
		}

		const identifiers = sessions.map(s => new DraggedSessionIdentifier(s.sessionId, s.resource));
		this._transfer.setData(identifiers, DraggedSessionIdentifier.prototype);

		if (originalEvent.dataTransfer) {
			// Expose the first dragged session as a typed payload as well so external
			// drop handlers can read it without using the local transfer.
			const payload = JSON.stringify({ sessionId: sessions[0].sessionId, resource: sessions[0].resource.toString() });
			originalEvent.dataTransfer.setData(SessionsDataTransfers.SESSION, payload);
		}
	}

	onDragEnd(): void {
		this._transfer.clearData(DraggedSessionIdentifier.prototype);
	}

	onDragOver(): boolean | ITreeDragOverReaction {
		return false;
	}

	drop(): void { }
}

//#endregion

//#region Sessions List Control

export interface ISessionsListControlOptions {
	readonly overrideStyles?: IStyleOverride<IListStyles>;
	readonly grouping: () => SessionsGrouping;
	readonly sorting: () => SessionsSorting;
	readonly findWidgetContainer?: HTMLElement;
	onSessionOpen(resource: URI, preserveFocus: boolean, sideBySide: boolean): void;
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
	/**
	 * Returns the sessions currently visible in the list, in display order.
	 * Sessions hidden by workspace group capping ("show more") are excluded.
	 */
	getVisibleSessions(): readonly ISession[];
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
	setOpenWindowSourceFolder(folder: URI | undefined): void;
	collapseAllSections(): void;
}

export class SessionsList extends Disposable implements ISessionsList {

	private static readonly SECTION_COLLAPSE_STATE_KEY = 'sessionsListControl.sectionCollapseState';
	private static readonly EXCLUDED_TYPES_KEY = 'sessionsListControl.excludedSessionTypes';
	private static readonly EXCLUDED_STATUSES_KEY = 'sessionsListControl.excludedStatuses';
	private static readonly EXCLUDE_ARCHIVED_KEY = 'sessionsListControl.excludeArchived';
	private static readonly EXCLUDE_READ_KEY = 'sessionsListControl.excludeRead';
	private static readonly WORKSPACE_GROUP_CAPPED_KEY = 'sessionsListControl.workspaceGroupCapped';
	private static readonly DEFAULT_WORKSPACE_GROUP_LIMIT = 5;

	/**
	 * Experiment treatment that overrides how many sessions are shown per
	 * workspace group before the "show more" affordance appears. Falls back to
	 * {@link DEFAULT_WORKSPACE_GROUP_LIMIT} when the treatment is not set.
	 */
	private static readonly WORKSPACE_GROUP_LIMIT_TREATMENT = 'sessions.workspaceGroupLimit';

	private readonly listContainer: HTMLElement;
	private readonly tree: WorkbenchObjectTree<SessionListItem, FuzzyScore>;
	private sessions: ISession[] = [];
	private visible = true;
	private readonly excludedSessionTypes: Set<string>;
	private readonly excludedStatuses: Set<SessionStatus>;
	private _excludeArchived: boolean;
	private _excludeRead: boolean;
	private workspaceGroupCapped: boolean;

	/**
	 * Maximum number of sessions shown per workspace group before "show more"
	 * is rendered. Backed by an experiment treatment (see
	 * {@link WORKSPACE_GROUP_LIMIT_TREATMENT}) and refreshed whenever the
	 * assignment service refetches its treatments.
	 */
	private readonly workspaceGroupLimit = observableValue<number>(this, SessionsList.DEFAULT_WORKSPACE_GROUP_LIMIT);
	private readonly expandedWorkspaceGroups = new Set<string>();
	private expandedMoreFolders = false;
	private openWindowSourceFolder: URI | undefined;
	private hasFindPattern = false;
	private suspendCollapseStatePersistence = false;

	private readonly _onDidUpdate = this._register(new Emitter<void>());
	readonly onDidUpdate: Event<void> = this._onDidUpdate.event;

	private readonly _onDidChangeFindOpenState = this._register(new Emitter<boolean>());
	readonly onDidChangeFindOpenState: Event<boolean> = this._onDidChangeFindOpenState.event;

	get element(): HTMLElement { return this.listContainer; }

	constructor(
		container: HTMLElement,
		private readonly options: ISessionsListControlOptions,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsViewService private readonly _sessionsViewService: ISessionsViewService,
		@ISessionsListModelService private readonly _sessionsListModelService: ISessionsListModelService,
		@IAgentHostFilterService private readonly _agentHostFilterService: IAgentHostFilterService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
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
		this._register(DOM.addDisposableListener(this.listContainer, DOM.EventType.POINTER_DOWN, () => {
			this.listContainer.classList.add(SESSION_SECTION_FOCUS_FROM_POINTER_CLASS);
		}));
		this._register(DOM.addDisposableListener(this.listContainer.ownerDocument, DOM.EventType.KEY_DOWN, () => {
			this.listContainer.classList.remove(SESSION_SECTION_FOCUS_FROM_POINTER_CLASS);
		}, true));

		const approvalModel = this._register(instantiationService.createInstance(AgentSessionApprovalModel));
		const markdownRendererService = instantiationService.invokeFunction(accessor => accessor.get(IMarkdownRendererService));
		const hoverService = instantiationService.invokeFunction(accessor => accessor.get(IHoverService));
		const sessionsProvidersService = instantiationService.invokeFunction(accessor => accessor.get(ISessionsProvidersService));
		// TEMPORARY (#320480): see the note on the `IAgentSessionsService` import.
		const agentSessionsService = instantiationService.invokeFunction(accessor => accessor.get(IAgentSessionsService));
		const sessionRenderer = new SessionItemRenderer(
			{ grouping: this.options.grouping, sorting: this.options.sorting, isPinned: s => this.isSessionPinned(s), isRead: s => this.isSessionRead(s), visibleSessions: this._sessionsViewService.visibleSessions },
			approvalModel,
			instantiationService,
			contextKeyService,
			markdownRendererService,
			hoverService,
			sessionsProvidersService,
			agentSessionsService,
		);

		const showMoreRenderer = new SessionShowMoreRenderer();
		const sectionRenderer = new SessionSectionRenderer(true /* hideSectionCount */, instantiationService, contextKeyService);

		// Read (don't bind) `IsPhoneLayoutContext` from the parent context so we
		// observe the workbench's value rather than shadowing it with a fresh
		// scoped default of `false`. The reactive height refresh below listens
		// on the same scoped service for changes.
		const delegate = new SessionsTreeDelegate(approvalModel, () => !!IsPhoneLayoutContext.getValue(contextKeyService));

		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<SessionListItem, FuzzyScore>,
			'SessionsListTree',
			this.listContainer,
			delegate,
			[
				sessionRenderer,
				sectionRenderer,
				showMoreRenderer,
			],
			{
				accessibilityProvider: new SessionsAccessibilityProvider(),
				dnd: this._register(new SessionsListDragAndDrop()),
				identityProvider: {
					getId: (element: SessionListItem) => {
						if (isSessionSection(element)) {
							return `section:${element.id}`;
						}
						if (isSessionShowMore(element)) {
							return `show-more:${element.kind}:${element.mode}:${element.sectionLabel}`;
						}
						return element.resource.toString();
					},
					getGroupId: (element: SessionListItem) => {
						if (isSessionSection(element)) {
							return NotSelectableGroupId;
						}
						if (isSessionShowMore(element)) {
							return NotSelectableGroupId;
						}
						return 1;
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
				if (element.kind === 'folders') {
					this.expandedMoreFolders = element.mode === 'more';
				} else {
					if (element.mode === 'more') {
						this.expandedWorkspaceGroups.add(element.sectionLabel);
					} else {
						this.expandedWorkspaceGroups.delete(element.sectionLabel);
					}
				}
				this.update();
				return;
			}
			if (!isSessionSection(element)) {
				this.markRead(element);
				this.options.onSessionOpen(element.resource, e.editorOptions.preserveFocus ?? false, e.sideBySide);
			}
		}));

		this._register(sessionRenderer.onDidChangeItemHeight(session => {
			if (this.tree.hasElement(session)) {
				this.tree.updateElementHeight(session, delegate.getHeight(session));
			}
		}));

		// React to phone <-> desktop viewport transitions: refresh heights
		// for all known sessions so the virtual list reserves the correct
		// space for the new layout. Iterates `this.sessions` (all known
		// sessions) — a phone/desktop transition is a rare event so the
		// extra work over filtered-out sessions is negligible. Relies on
		// the `IsPhoneLayoutContext` reactive signal already maintained by
		// the agents workbench.
		const phoneKeys = new Set<string>([IsPhoneLayoutContext.key]);
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (!e.affectsSome(phoneKeys)) {
				return;
			}
			for (const session of this.sessions) {
				if (this.tree.hasElement(session)) {
					this.tree.updateElementHeight(session, delegate.getHeight(session));
				}
			}
		}));

		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		this._register(this.tree.onDidChangeCollapseState(e => {
			const element = e.node.element;
			if (element && isSessionSection(element)) {
				sectionRenderer.updateCollapseState(element, e.node.collapsed);
				if (!this.suspendCollapseStatePersistence) {
					this.saveSectionCollapseState(element.id, e.node.collapsed);
				}
			}
		}));

		let isFindOpen = false;
		let findPattern = '';
		const updateFindPatternState = () => {
			const hasFindPattern = isFindOpen && findPattern.length > 0;
			if (hasFindPattern !== this.hasFindPattern) {
				this.hasFindPattern = hasFindPattern;
				this.update();
			}
		};

		this._register(this.tree.onDidChangeFindOpenState(open => {
			isFindOpen = open;
			this._onDidChangeFindOpenState.fire(open);
			updateFindPatternState();
		}));

		// Only treat the find as "active" for layout purposes (bypassing workspace
		// capping and per-group limits) once the user has actually typed a pattern
		// and the find widget is open. Opening the empty find widget should not
		// reorder the list, and closing find should restore the capped layout.
		this._register(this.tree.onDidChangeFindPattern(pattern => {
			findPattern = pattern;
			updateFindPatternState();
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

		// Resolve the per-workspace session limit from the experiment service and
		// keep it current when treatments are refetched. The async fetch is
		// confined to `updateWorkspaceGroupLimit`; the rest of the list reads the
		// resolved value synchronously off `workspaceGroupLimit`. The autorun runs
		// immediately for the initial fetch and again whenever treatments refetch.
		const assignmentRefetchSignal = observableSignalFromEvent(this, this.assignmentService.onDidRefetchAssignments);
		this._register(autorun(reader => {
			assignmentRefetchSignal.read(reader);
			this.updateWorkspaceGroupLimit();
		}));

		this.refresh();
	}

	/**
	 * Fetches the workspace group limit treatment and updates the backing
	 * observable. Invalid or unset treatments fall back to the default limit.
	 */
	private updateWorkspaceGroupLimit(): void {
		this.assignmentService.getTreatment<number>(SessionsList.WORKSPACE_GROUP_LIMIT_TREATMENT).then(value => {
			const limit = typeof value === 'number' && Number.isInteger(value) && value > 0
				? value
				: SessionsList.DEFAULT_WORKSPACE_GROUP_LIMIT;
			this.workspaceGroupLimit.set(limit, undefined);
		});
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

		// Partition workspace sections into "primary" (meets criteria) and "more"
		// when grouping by workspace. An active find pattern bypasses partitioning
		// so all matching sessions are visible. When the user has chosen
		// "Show All Sessions" (uncapped), show every workspace group inline instead
		// of hiding some behind a "more workspaces" entry.
		const partitionFolders = grouping === SessionsGrouping.Workspace && !this.hasFindPattern && this.workspaceGroupCapped;
		const moreFolderSectionIds = new Set<string>();
		if (partitionFolders) {
			const workspaceSections = sections.filter(s => s.id.startsWith('workspace:'));
			if (workspaceSections.length > 0) {
				const now = Date.now();
				const isRecent = (section: ISessionSection) =>
					section.sessions.some(s => s.updatedAt.get().getTime() >= now - FOUR_DAYS_MS);
				const isOpenWindow = (section: ISessionSection) =>
					!!this.openWindowSourceFolder && section.sessions.some(s => sessionMatchesFolder(s, this.openWindowSourceFolder!));
				const meetsCriteria = (section: ISessionSection) => isRecent(section) || isOpenWindow(section);

				let anyMeets = false;
				for (const section of workspaceSections) {
					if (meetsCriteria(section)) {
						anyMeets = true;
						break;
					}
				}

				let fallbackId: string | undefined;
				if (!anyMeets) {
					// Criterion 3: pick the folder with the most recently updated session.
					let bestTime = -Infinity;
					for (const section of workspaceSections) {
						for (const s of section.sessions) {
							const t = s.updatedAt.get().getTime();
							if (t > bestTime) {
								bestTime = t;
								fallbackId = section.id;
							}
						}
					}
				}

				for (const section of workspaceSections) {
					if (!meetsCriteria(section) && section.id !== fallbackId) {
						moreFolderSectionIds.add(section.id);
					}
				}
			}
		}

		const children: IObjectTreeElement<SessionListItem>[] = [];

		const workspaceGroupLimit = this.workspaceGroupLimit.get();

		const renderSection = (section: ISessionSection): IObjectTreeElement<SessionListItem> => {
			const isWorkspaceGroup = grouping === SessionsGrouping.Workspace
				&& section.id.startsWith('workspace:');
			const exceedsLimit = isWorkspaceGroup
				&& !this.hasFindPattern
				&& section.sessions.length > workspaceGroupLimit;
			const isExpanded = exceedsLimit && (this.expandedWorkspaceGroups.has(section.label) || !this.workspaceGroupCapped);
			const isCapped = exceedsLimit && !isExpanded;

			let sectionChildren: IObjectTreeElement<SessionListItem>[];
			if (isCapped) {
				const visible = section.sessions.slice(0, workspaceGroupLimit);
				const remainingCount = section.sessions.length - workspaceGroupLimit;
				sectionChildren = [
					...visible.map(session => ({ element: session as SessionListItem })),
					{ element: { showMore: true as const, kind: 'sessions' as const, mode: 'more' as const, sectionLabel: section.label, remainingCount } },
				];
			} else if (isExpanded && this.expandedWorkspaceGroups.has(section.label)) {
				sectionChildren = [
					...section.sessions.map(session => ({ element: session as SessionListItem })),
					{ element: { showMore: true as const, kind: 'sessions' as const, mode: 'less' as const, sectionLabel: section.label, remainingCount: 0 } },
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
		};

		const moreFolderSections: ISessionSection[] = [];
		// The archived ("Done") section should always appear after the
		// "more workspaces" toggle (both collapsed and expanded states)
		// so it remains the very last group in the list.
		let archivedSection: ISessionSection | undefined;
		for (const section of sections) {
			if (moreFolderSectionIds.has(section.id)) {
				moreFolderSections.push(section);
			} else if (partitionFolders && section.id === 'archived') {
				archivedSection = section;
			} else {
				children.push(renderSection(section));
			}
		}

		if (moreFolderSections.length > 0) {
			if (this.expandedMoreFolders) {
				for (const section of moreFolderSections) {
					children.push(renderSection(section));
				}
				children.push({
					element: { showMore: true as const, kind: 'folders' as const, mode: 'less' as const, sectionLabel: SHOW_MORE_FOLDERS_LABEL, remainingCount: 0 },
				});
			} else {
				children.push({
					element: { showMore: true as const, kind: 'folders' as const, mode: 'more' as const, sectionLabel: SHOW_MORE_FOLDERS_LABEL, remainingCount: moreFolderSections.length },
				});
			}
		}
		if (archivedSection) {
			children.push(renderSection(archivedSection));
		}

		this.tree.setChildren(null, children);
		this._onDidUpdate.fire();
	}

	getVisibleSessions(): readonly ISession[] {
		// Derive the visible session list from the tree model so that index-based
		// navigation matches what the user actually sees: this respects collapsed
		// sections, find-widget filtering, and excludes section / show-more nodes.
		const sessions = new Set<ISession>(this.sessions);
		const visibleSessions: ISession[] = [];

		const collect = (node: ITreeNode<SessionListItem | null, FuzzyScore | undefined>): void => {
			if (!node.visible) {
				return;
			}
			if (node.element && sessions.has(node.element as ISession)) {
				visibleSessions.push(node.element as ISession);
			}
			if (node.collapsed) {
				return;
			}
			for (const child of node.children) {
				collect(child);
			}
		};

		const root = this.tree.getNode();
		for (const child of root.children) {
			collect(child);
		}

		return visibleSessions;
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
			[SessionIsArchivedContext.key, element.isArchived.get()],
			[SessionIsReadContext.key, this.isSessionRead(element)],
			[SessionItemHasBranchNameContext.key, !!element.workspace.get()?.folders[0]?.gitRepository?.branchName?.trim()],
			[ChatSessionTypeContext.key, element.sessionType],
			[ChatSessionProviderIdContext.key, element.providerId],
		];

		const menu = this.menuService.createMenu(SessionItemContextMenuId, this.contextKeyService.createOverlay(contextOverlay));

		// Extension contributions on this menu need a marshalled AgentSessionContext arg; built-in actions take ISession[].
		const marshalledArg = {
			$mid: MarshalledId.AgentSessionContext,
			session: { resource: element.resource },
			sessions: selectedSessions.map(s => ({ resource: s.resource })),
		};
		const wrapForExtensions = (action: IAction): IAction => {
			if (!(action instanceof MenuItemAction) || !action.item.source) {
				return action;
			}
			const wrapped = new Action(action.id, action.label, action.class, action.enabled, () => this.commandService.executeCommand(action.id, marshalledArg));
			wrapped.tooltip = action.tooltip;
			wrapped.checked = action.checked;
			return wrapped;
		};

		this.contextMenuService.showContextMenu({
			getActions: () => Separator.join(...menu.getActions({ arg: selectedSessions, shouldForwardArgs: true }).map(([, actions]) => actions.map(wrapForExtensions))),
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
		this.expandedMoreFolders = false;
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

	setOpenWindowSourceFolder(folder: URI | undefined): void {
		const before = this.openWindowSourceFolder?.toString();
		const after = folder?.toString();
		if (before === after) {
			return;
		}
		this.openWindowSourceFolder = folder;
		this.update();
	}

	collapseAllSections(): void {
		this.suspendCollapseStatePersistence = true;
		try {
			this.tree.collapseAll();
		} finally {
			this.suspendCollapseStatePersistence = false;
		}
		this.saveBulkCollapseState(true);
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

	private saveBulkCollapseState(collapsed: boolean): void {
		const state: Record<string, boolean> = {};
		for (const child of this.tree.getNode(null).children) {
			if (child.element && isSessionSection(child.element)) {
				state[child.element.id] = collapsed;
			}
		}
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

//#region Folder Matching

function sessionMatchesFolder(session: ISession, folder: URI): boolean {
	const workspace = session.workspace.get();
	if (!workspace) {
		return false;
	}
	const folderStr = folder.toString();
	for (const folder of workspace.folders) {
		if (folder.workingDirectory?.toString() === folderStr || folder.root.toString() === folderStr) {
			return true;
		}
	}
	return false;
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
