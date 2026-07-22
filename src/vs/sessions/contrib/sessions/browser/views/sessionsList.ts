/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionsList.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { pauseCSSAnimationsWhenHidden, synchronizeCSSAnimations } from '../../../../../base/browser/animationSync.js';
import { Gesture } from '../../../../../base/browser/touch.js';
import { IListVirtualDelegate, ListDragOverEffectPosition, ListDragOverEffectType, NotSelectableGroupId } from '../../../../../base/browser/ui/list/list.js';
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
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { localize } from '../../../../../nls.js';
import { MenuId, IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { SessionProviderIdContext, SessionSupportsDeleteContext, SessionSupportsRenameContext, SessionTypeContext, IsPhoneLayoutContext, SessionIsArchivedContext, SessionIsReadContext, SessionHasPullRequestContext } from '../../../../common/contextkeys.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IStyleOverride, defaultButtonStyles, defaultFindWidgetStyles, defaultInputBoxStyles, defaultToggleStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { chartsOrange } from '../../../../../platform/theme/common/colors/chartsColors.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISession, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { AgentSessionApprovalModel, agentSessionApprovalId, IAgentSessionApprovalInfo } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { IVoicePlaybackService } from '../../../../../workbench/contrib/chat/common/voicePlaybackService.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { Action, ActionRunner, IAction, Separator, SubmenuAction } from '../../../../../base/common/actions.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { ISessionsManagementService, IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsListModelService, SessionSortMode } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionGroup, ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
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
import { ElementsDragAndDropData, ListViewTargetSector } from '../../../../../base/browser/ui/list/listView.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { buildSessionHoverContent } from '../sessionHoverContent.js';
import { SessionStatusIcon } from '../../../../browser/sessionStatusIcon.js';

const $ = DOM.$;

const SESSION_SECTION_FOCUS_FROM_POINTER_CLASS = 'session-section-focus-from-pointer';
const SESSION_HEADER_DROP_TARGET_CLASS = 'session-header-drop-target';

export const SessionItemToolbarMenuId = new MenuId('SessionItemToolbar');
export const SessionItemContextMenuId = MenuId.SessionItemContextMenu;
export const SessionSectionToolbarMenuId = new MenuId('SessionSectionToolbar');
export const SessionGroupToolbarMenuId = new MenuId('SessionGroupToolbar');

/** Controls whether the empty default Chats group is shown in the sessions list. */
export const SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING = 'sessions.list.showEmptyDefaultGroups';

export const IsSessionPinnedContext = new RawContextKey<boolean>('sessionItem.isPinned', false);
export const SessionItemHasBranchNameContext = new RawContextKey<boolean>('sessionItem.hasBranchName', false);
export const SessionItemStatusContext = new RawContextKey<SessionStatus>('sessionItem.status', SessionStatus.Completed);
/** Whether the focused session item currently belongs to a user group. */
export const SessionItemInGroupContext = new RawContextKey<boolean>('sessionItem.inGroup', false);
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

function sortingToMode(sorting: SessionsSorting): SessionSortMode {
	return sorting === SessionsSorting.Updated ? 'updated' : 'created';
}

/** Fallback spacing (ms) used when assigning synthetic sort keys past an open boundary. */
const SORT_FALLBACK_STEP_MS = 60_000;

export interface ISessionSection {
	readonly id: string;
	readonly label: string;
	readonly sessions: ISession[];
}

/**
 * A user-created group rendered as a section-like header. Carries the backing
 * {@link ISessionGroup} plus its currently-visible member sessions and whether
 * the header should render its inline name editor.
 */
export interface ISessionGroupItem {
	readonly group: ISessionGroup;
	readonly sessions: ISession[];
	readonly editing: boolean;
}

export interface ISessionShowMore {
	readonly showMore: true;
	readonly kind: 'sessions' | 'folders';
	readonly mode: 'more' | 'less';
	readonly sectionId: string;
	readonly sectionLabel: string;
	readonly remainingCount: number;
}

/** Synthetic muted row shown when a section (currently only "Chats") is empty. */
export interface ISessionPlaceholder {
	readonly placeholder: true;
	readonly sectionId: string;
	readonly label: string;
}

export type SessionListItem = ISession | ISessionSection | ISessionGroupItem | ISessionShowMore | ISessionPlaceholder;

function isSessionGroupItem(item: SessionListItem): item is ISessionGroupItem {
	return 'group' in item;
}

function isSessionSection(item: SessionListItem): item is ISessionSection {
	return !isSessionGroupItem(item) && 'sessions' in item && Array.isArray((item as ISessionSection).sessions);
}

function isSessionShowMore(item: SessionListItem): item is ISessionShowMore {
	return 'showMore' in item && (item as ISessionShowMore).showMore === true;
}

function isSessionPlaceholder(item: SessionListItem): item is ISessionPlaceholder {
	return 'placeholder' in item && (item as ISessionPlaceholder).placeholder === true;
}

function isSessionItem(item: SessionListItem): item is ISession {
	return !isSessionGroupItem(item) && !isSessionSection(item) && !isSessionShowMore(item) && !isSessionPlaceholder(item);
}

const SHOW_MORE_FOLDERS_LABEL = '__more_folders__';
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;

/**
 * Default number of terminal-command lines shown in a session row's approval
 * prompt. The blocked-sessions dropdown overrides this to show more lines.
 */
const DEFAULT_APPROVAL_ROW_MAX_LINES = 3;

//#endregion

//#region Tree Delegate

class SessionsTreeDelegate implements IListVirtualDelegate<SessionListItem> {
	private static readonly ITEM_HEIGHT = 54;
	/** Quick-chat rows are single-line — see the `.session-item.quick-chat` rules in `sessionsList.css`. */
	private static readonly ITEM_HEIGHT_QUICK_CHAT = 28;
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
	private static readonly PLACEHOLDER_HEIGHT = 26;

	constructor(
		private readonly _approvalModel: AgentSessionApprovalModel | undefined,
		private readonly _isPhone: () => boolean,
		private readonly _approvalRowMaxLines: number = DEFAULT_APPROVAL_ROW_MAX_LINES,
		private readonly _ciFixModel: ISessionCIFixModel | undefined = undefined,
	) { }

	getHeight(element: SessionListItem): number {
		if (isSessionSection(element) || isSessionGroupItem(element)) {
			return SessionsTreeDelegate.SECTION_HEIGHT;
		}
		if (isSessionShowMore(element)) {
			return SessionsTreeDelegate.SHOW_MORE_HEIGHT;
		}
		if (isSessionPlaceholder(element)) {
			return SessionsTreeDelegate.PLACEHOLDER_HEIGHT;
		}

		let height: number;
		if (this._isPhone()) {
			height = SessionsTreeDelegate.ITEM_HEIGHT_PHONE;
		} else if (isQuickChatSession(element as ISession)) {
			height = SessionsTreeDelegate.ITEM_HEIGHT_QUICK_CHAT;
		} else {
			height = SessionsTreeDelegate.ITEM_HEIGHT;
		}
		if (this._approvalModel) {
			const approval = getFirstApprovalAcrossChats(this._approvalModel, element as ISession, undefined);
			if (approval) {
				height += SessionItemRenderer.getApprovalRowHeight(approval.label, this._approvalRowMaxLines);
			}
		}
		if (this._ciFixModel && this._ciFixModel.getCIFix(element as ISession).get()) {
			height += SessionItemRenderer.CI_ROW_HEIGHT;
		}
		return height;
	}

	hasDynamicHeight(element: SessionListItem): boolean {
		return (!!this._approvalModel || !!this._ciFixModel) && isSessionItem(element);
	}

	getTemplateId(element: SessionListItem): string {
		if (isSessionGroupItem(element)) {
			return SessionGroupRenderer.TEMPLATE_ID;
		}
		if (isSessionSection(element)) {
			return SessionSectionRenderer.TEMPLATE_ID;
		}
		if (isSessionShowMore(element)) {
			return SessionShowMoreRenderer.TEMPLATE_ID;
		}
		if (isSessionPlaceholder(element)) {
			return SessionPlaceholderRenderer.TEMPLATE_ID;
		}
		return SessionItemRenderer.TEMPLATE_ID;
	}
}

//#endregion

//#region Session Item Renderer

/**
 * Resolves inline toolbar actions against either a focused-list handler or the
 * current multi-selection.
 */
class SessionItemActionRunner extends ActionRunner {

	constructor(
		private readonly getMultiSelectedSessions: (session: ISession) => ISession[],
		private readonly handleAction?: (action: IAction, session: ISession) => boolean | Promise<boolean>,
	) {
		super();
	}

	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		if (context && !Array.isArray(context)) {
			if (this.handleAction && await this.handleAction(action, context as ISession)) {
				return;
			}
			await super.runAction(action, this.getMultiSelectedSessions(context as ISession));
			return;
		}
		await super.runAction(action, context);
	}
}

// Keyframes name of the in-progress title shimmer (see `session-title-shimmer`
// in sessionsList.css). Used to phase-align the shimmer across rows.
const SESSION_TITLE_SHIMMER_ANIMATION_NAME = 'session-title-shimmer';
const SESSION_TITLE_SHIMMER_ANIMATION_NAMES = new Set([SESSION_TITLE_SHIMMER_ANIMATION_NAME]);
const SESSION_TITLE_SHIMMER_PAUSED_CLASS = 'session-title-shimmer-paused';

interface ISessionItemTemplate {
	readonly container: HTMLElement;
	readonly statusIcon: SessionStatusIcon;
	readonly title: HighlightedLabel;
	readonly titleContainer: HTMLElement;
	readonly titleToolbar: MenuWorkbenchToolBar | undefined;
	readonly pendingVoiceIndicator: HTMLElement;
	readonly detailsRow: HTMLElement;
	readonly approvalRow: HTMLElement;
	readonly approvalLabel: HTMLElement;
	readonly approvalButtonContainer: HTMLElement;
	readonly ciRow: HTMLElement;
	readonly ciLabel: HTMLElement;
	readonly ciButtonContainer: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly statusContext: IContextKey<SessionStatus>;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

/** Payload emitted when the user approves a session's pending action. */
export interface IApprovedSession {
	readonly session: ISession;
	/**
	 * Identity of the approval that was allowed, so consumers can tell this exact
	 * approval apart from a later, distinct one on the same session.
	 */
	readonly approvalId: string;
}

/** Summary of a session's failing CI checks, backing its "Fix CI" row. */
export interface ISessionCIFixState {
	/** Number of checks that have completed with a failing conclusion. */
	readonly failed: number;
	/** Number of checks still running or queued. */
	readonly pending: number;
}

/**
 * Supplies the per-session "Fix CI" row shown for blocked sessions whose pull
 * request has failing CI checks. Only the blocked-sessions dropdown provides one
 * (via {@link ISessionsFlatListOptions.ciFixModel}), so the row never appears in
 * any other session list.
 */
export interface ISessionCIFixModel {
	/**
	 * Observable CI-failure summary for a session, or `undefined` when it has no
	 * failing checks (or the user already requested a fix for the current commit).
	 */
	getCIFix(session: ISession): IObservable<ISessionCIFixState | undefined>;
	/** Kick off the fix-CI flow for the session in the background (no session is opened). */
	fixCI(session: ISession): void;
}

class SessionItemRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionItemTemplate> {
	static readonly TEMPLATE_ID = 'session-item';
	readonly templateId = SessionItemRenderer.TEMPLATE_ID;

	private static readonly _APPROVAL_ROW_LINE_HEIGHT = 18;
	private static readonly _APPROVAL_ROW_OVERHEAD = 14;

	/** Height of the single-line "Fix CI" row (label + orange button), including its top margin. */
	static readonly CI_ROW_HEIGHT = 32;

	static getApprovalRowHeight(label: string, maxLines: number = DEFAULT_APPROVAL_ROW_MAX_LINES): number {
		const lineCount = Math.min(label.split(/\r?\n/).length, maxLines);
		return lineCount * SessionItemRenderer._APPROVAL_ROW_LINE_HEIGHT + SessionItemRenderer._APPROVAL_ROW_OVERHEAD;
	}

	private readonly _onDidChangeItemHeight = new Emitter<ISession>();
	readonly onDidChangeItemHeight: Event<ISession> = this._onDidChangeItemHeight.event;

	private readonly _onDidApproveSession = new Emitter<IApprovedSession>();
	/** Fires when the user approves a session's pending action via its "Allow" button. */
	readonly onDidApproveSession: Event<IApprovedSession> = this._onDidApproveSession.event;

	constructor(
		private readonly options: { grouping: () => SessionsGrouping; isPinned: (session: ISession) => boolean; isRead: (session: ISession) => boolean; visibleSessions: IObservable<readonly (IActiveSession | undefined)[]>; getMultiSelectedSessions: (session: ISession) => ISession[]; showHover: boolean; approvalRowMaxLines: number; toolbarMenuId: MenuId | undefined; handleToolbarAction?: (action: IAction, session: ISession) => boolean | Promise<boolean> },
		private readonly approvalModel: AgentSessionApprovalModel | undefined,
		private readonly ciFixModel: ISessionCIFixModel | undefined,
		private readonly instantiationService: IInstantiationService,
		private readonly contextKeyService: IContextKeyService,
		private readonly markdownRendererService: IMarkdownRendererService,
		private readonly hoverService: IHoverService,
		private readonly sessionsProvidersService: ISessionsProvidersService,
		// TEMPORARY — see the note on the `IAgentSessionsService` import above (#320480).
		private readonly agentSessionsService: IAgentSessionsService,
		private readonly _voicePlaybackService: IVoicePlaybackService,
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
		const titleContainer = DOM.append(titleRow, $('.session-title'));
		const title = disposables.add(new HighlightedLabel(titleContainer));
		// The shimmer's CSS animation restarts from zero whenever it (re)starts —
		// e.g. selecting then deselecting an in-progress row re-adds the animation
		// via the `:not(.selected)` selector, and rows already shimmering at first
		// render each started on their own clock. Anchor every (re)start to the
		// shared document timeline so all rows stay perfectly in phase. This fires
		// once per start (not per frame), so it is effectively free.
		disposables.add(DOM.addDisposableListener(titleContainer, DOM.EventType.ANIMATION_START, (e: AnimationEvent) => {
			if (e.target === titleContainer && e.animationName === SESSION_TITLE_SHIMMER_ANIMATION_NAME) {
				synchronizeCSSAnimations(titleContainer, { animationNames: SESSION_TITLE_SHIMMER_ANIMATION_NAMES });
			}
		}));
		disposables.add(pauseCSSAnimationsWhenHidden(titleContainer, {
			pausedClass: SESSION_TITLE_SHIMMER_PAUSED_CLASS,
			animationNames: SESSION_TITLE_SHIMMER_ANIMATION_NAMES,
		}));
		const titleToolbarContainer = DOM.append(titleRow, $('.session-title-toolbar'));
		// Shown when a voice response arrived while this session was unfocused and
		// is held until it is (mirrors the main window's sessions viewer).
		const pendingVoiceIndicator = DOM.append(titleRow, $('.session-pending-voice-indicator'));
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

		// Fix-CI row — shown only in the blocked-sessions list for sessions whose
		// pull request has failing CI checks. Styled like the chat input's CI banner.
		const ciRow = DOM.append(mainCol, $('.session-ci-row'));
		const ciLabel = DOM.append(ciRow, $('span.session-ci-label'));
		const ciButtonContainer = DOM.append(ciRow, $('.session-ci-button'));
		// The list opens a session on click/tap. The "Fix CI" button opens the
		// session itself as part of its flow, so swallow row clicks here to stop
		// them bubbling to the tree and triggering a second, racing open.
		for (const eventType of ['pointerdown', 'pointerup', 'click', 'dblclick'] as const) {
			disposables.add(DOM.addDisposableListener(ciRow, eventType, e => e.stopPropagation()));
		}
		disposables.add(Gesture.ignoreTarget(ciRow));

		const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
		const statusContext = SessionItemStatusContext.bindTo(contextKeyService);
		const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		let titleToolbar: MenuWorkbenchToolBar | undefined;
		if (this.options.toolbarMenuId) {
			const actionRunner = disposables.add(new SessionItemActionRunner(this.options.getMultiSelectedSessions, this.options.handleToolbarAction));
			titleToolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, titleToolbarContainer, this.options.toolbarMenuId, {
				menuOptions: { shouldForwardArgs: true },
				actionRunner,
			}));
		}

		return { container, statusIcon, title, titleContainer, titleToolbar, pendingVoiceIndicator, detailsRow, approvalRow, approvalLabel, approvalButtonContainer, ciRow, ciLabel, ciButtonContainer, contextKeyService, statusContext, disposables, elementDisposables };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionItemTemplate): void {
		const element = node.element;
		if (!isSessionItem(element)) {
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

		if (this.options.showHover) {
			// Rich hover on the row showing folder, branch, diff stats and provider.
			template.elementDisposables.add(this.hoverService.setupDelayedHover(template.container, () => ({
				content: buildSessionHoverContent(element, this.sessionsProvidersService),
				appearance: { showPointer: true },
				position: { hoverPosition: HoverPosition.RIGHT, forcePosition: true },
				persistence: { hideOnHover: false },
			}), { groupId: 'sessions-list' }));
		}

		// Pending voice response indicator: a response arrived while this session
		// was unfocused and is held until it is.
		const pendingVoiceResource = element.resource;
		template.pendingVoiceIndicator.className = 'session-pending-voice-indicator ' + ThemeIcon.asClassName(Codicon.unmute);
		template.elementDisposables.add(this.hoverService.setupManagedHover(
			getDefaultHoverDelegate('mouse'),
			template.pendingVoiceIndicator,
			localize('pendingVoiceResponse', "Voice response ready"),
		));
		template.elementDisposables.add(autorun(reader => {
			this._voicePlaybackService.pendingResponseVersion.read(reader);
			template.pendingVoiceIndicator.classList.toggle('visible', this._voicePlaybackService.hasPendingResponse(pendingVoiceResource));
		}));

		// Toolbar context
		if (template.titleToolbar) {
			template.titleToolbar.context = element;
		}

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
			template.statusContext.set(sessionStatus);
			const isRead = this.options.isRead(element);
			const isArchived = element.isArchived.read(reader);
			const gitHubInfo = element.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
			const isQuickChat = element.isQuickChat?.read(reader) ?? false;
			const completedStateIcon = gitHubInfo?.pullRequest?.icon;

			// The status icon (spinner vs. codicon, cross-fade, reduced-motion) is fully
			// owned by the SessionStatusIcon widget; here we just feed it the latest state.
			// Row recycling re-feeds the widget, which cross-fades to the new session's icon.
			template.statusIcon.setStatus(sessionStatus, isRead, isArchived, completedStateIcon);
			// The title shimmer (toggled by the `in-progress` class) is phase-aligned
			// across rows via an `animationstart` handler on the title element, so no
			// per-state work is needed here.
			template.container.classList.toggle('in-progress', sessionStatus === SessionStatus.InProgress);
			template.container.classList.toggle('needs-input', sessionStatus === SessionStatus.NeedsInput);
			template.container.classList.toggle('unread', !isRead && !isArchived);
			// Quick-chat rows use a more compact layout (smaller icon, tighter row height).
			template.container.classList.toggle('quick-chat', isQuickChat);
		}));

		// Title — reactive
		template.elementDisposables.add(autorun(reader => {
			const titleText = element.title.read(reader);
			template.title.set(titleText, matches);
		}));

		// Details row — reactive: badge · diff stats · time · status description
		// (quick chats use a more compact row: no diff stats/time/type-icon, and
		// no "Working..." text since their spinner status icon already conveys it)
		const timeDisposable = template.elementDisposables.add(new MutableDisposable());
		const descriptionDisposable = template.elementDisposables.add(new MutableDisposable());
		template.elementDisposables.add(autorun(reader => {
			const sessionStatus = element.status.read(reader);
			const workspace = element.workspace.read(reader);
			const description = element.description.read(reader);
			const isQuickChat = element.isQuickChat?.read(reader) ?? false;

			// Clear and rebuild details row
			DOM.clearNode(template.detailsRow);

			// Quick chats are single-line rows with no details row at all (hidden
			// via CSS) — skip building its content entirely.
			if (isQuickChat) {
				descriptionDisposable.clear();
				timeDisposable.clear();
				return;
			}

			const changes = element.changes.read(reader);
			const changesSummary = element.changesSummary?.read(reader);
			let timeDate: Date | undefined;

			// When the session is InProgress or NeedsInput, hide workspace/diff/time details in this row
			const hideDetails = sessionStatus === SessionStatus.InProgress || sessionStatus === SessionStatus.NeedsInput;

			if (!hideDetails) {
				timeDate = element.updatedAt.read(reader);
			}

			const parts: HTMLElement[] = [];

			// Type icon (folder/worktree/cloud) — regular sessions only. Quick
			// chats show their chat icon on the status icon instead (see above).
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

		// Fix-CI row — reactive (only supplied by the blocked-sessions list)
		if (this.ciFixModel) {
			this.renderCIRow(element, template);
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
				// Render up to `maxLines` lines as separate code blocks
				const lines = info.label.split('\n');
				const maxLines = this.options.approvalRowMaxLines;
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

				if (this.options.showHover) {
					const fullContent = new MarkdownString().appendCodeblock(info.languageId ?? 'json', info.label);
					buttonStore.add(this.hoverService.setupDelayedHover(template.approvalLabel, {
						content: fullContent,
						style: HoverStyle.Pointer,
						position: { hoverPosition: HoverPosition.BELOW },
					}));
				}

				template.approvalButtonContainer.textContent = '';
				const button = buttonStore.add(new Button(template.approvalButtonContainer, {
					title: localize('allowActionOnce', "Allow once"),
					secondary: true,
					...defaultButtonStyles
				}));
				button.label = localize('allowAction', "Allow");
				buttonStore.add(button.onDidClick(() => {
					// Capture the approval's identity BEFORE confirming: `confirm()` may
					// synchronously clear the pending approval, so we can't read it after.
					const approvalId = agentSessionApprovalId(info);
					info.confirm();
					this._onDidApproveSession.fire({ session: element, approvalId });
				}));
			}

			if (wasVisible !== visible) {
				wasVisible = visible;
				this._onDidChangeItemHeight.fire(element);
			}
		}));
	}

	private renderCIRow(element: ISession, template: ISessionItemTemplate): void {
		if (!this.ciFixModel) {
			return;
		}

		const ciFixModel = this.ciFixModel;
		const stateObs = ciFixModel.getCIFix(element);
		let wasVisible = !!stateObs.get();
		template.ciRow.classList.toggle('visible', wasVisible);

		const buttonStore = template.elementDisposables.add(new DisposableStore());

		template.elementDisposables.add(autorun(reader => {
			buttonStore.clear();

			const state = stateObs.read(reader);
			const visible = !!state;

			template.ciRow.classList.toggle('visible', visible);

			if (state) {
				template.ciLabel.textContent = localize('ci.blockedRow', "{0} checks failed, {1} pending", state.failed, state.pending);

				template.ciButtonContainer.textContent = '';
				// Match the chat input CI banner's prominent orange action button.
				const button = buttonStore.add(new Button(template.ciButtonContainer, {
					title: localize('ci.fixCITooltip', "Fix failing CI checks"),
					...defaultButtonStyles,
					buttonBackground: asCssVariable(chartsOrange),
					buttonHoverBackground: `color-mix(in srgb, ${asCssVariable(chartsOrange)} 88%, black)`,
					buttonBorder: asCssVariable(chartsOrange),
				}));
				button.label = localize('ci.fixCI', "Fix CI");
				buttonStore.add(button.onDidClick(() => ciFixModel.fixCI(element)));
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
	readonly icon: HTMLElement;
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
	private readonly templatesById = new Map<string, ISessionSectionTemplate>();

	constructor(
		private readonly hideSectionCount: boolean,
		private readonly instantiationService: IInstantiationService,
		private readonly contextKeyService: IContextKeyService,
	) { }

	renderTemplate(container: HTMLElement): ISessionSectionTemplate {
		const disposables = new DisposableStore();

		container.classList.add('session-section');
		const icon = DOM.append(container, $('span.session-section-icon'));
		icon.setAttribute('aria-hidden', 'true');
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

		return { container, icon, label, count, toolbar, chevron, contextKeyService, disposables };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionSectionTemplate): void {
		const element = node.element;
		if (!isSessionSection(element)) {
			return;
		}
		this.templatesByElement.set(element, template);
		this.templatesById.set(element.id, template);
		template.container.classList.remove(SESSION_HEADER_DROP_TARGET_CLASS);

		// Leading icon for the "Pinned" and "Chats" (quick chats) section headers.
		// Templates are reused across rows, so recompute the icon every render.
		const sectionIcon = element.id === QUICK_CHATS_SECTION_ID ? Codicon.commentDiscussion
			: element.id === 'pinned' ? Codicon.pinned
				: undefined;
		template.icon.className = sectionIcon ? `session-section-icon ${ThemeIcon.asClassName(sectionIcon)}` : 'session-section-icon';
		template.icon.style.display = sectionIcon ? '' : 'none';

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

	setDropTarget(sectionId: string, active: boolean): void {
		const template = this.templatesById.get(sectionId);
		template?.container.classList.toggle(SESSION_HEADER_DROP_TARGET_CLASS, active);
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
			this.templatesById.delete(node.element.id);
		}
	}

	disposeTemplate(template: ISessionSectionTemplate): void {
		template.disposables.dispose();
	}
}

//#endregion

//#region Session Group Renderer

interface ISessionGroupTemplate {
	readonly container: HTMLElement;
	readonly label: HTMLElement;
	readonly inputContainer: HTMLElement;
	readonly toolbar: MenuWorkbenchToolBar;
	readonly chevron: HTMLElement;
	readonly contextKeyService: IContextKeyService;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

/**
 * Callbacks the group renderer uses to commit or cancel inline renaming.
 */
interface ISessionGroupRendererDelegate {
	commitEdit(group: ISessionGroup, name: string): void;
	cancelEdit(group: ISessionGroup): void;
}

class SessionGroupRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, ISessionGroupTemplate> {
	static readonly TEMPLATE_ID = 'session-group';
	readonly templateId = SessionGroupRenderer.TEMPLATE_ID;

	private readonly templatesByElement = new WeakMap<ISessionGroupItem, ISessionGroupTemplate>();
	private readonly templatesById = new Map<string, ISessionGroupTemplate>();

	constructor(
		private readonly delegate: ISessionGroupRendererDelegate,
		private readonly instantiationService: IInstantiationService,
		private readonly contextKeyService: IContextKeyService,
	) { }

	renderTemplate(container: HTMLElement): ISessionGroupTemplate {
		const disposables = new DisposableStore();

		container.classList.add('session-section', 'session-group');
		const label = DOM.append(container, $('span.session-section-label'));
		const inputContainer = DOM.append(container, $('.session-group-input'));
		const toolbarContainer = DOM.append(container, $('.session-section-toolbar'));
		const chevron = DOM.append(container, $('span.session-section-chevron'));
		chevron.setAttribute('aria-hidden', 'true');

		const contextKeyService = disposables.add(this.contextKeyService.createScoped(container));
		const scopedInstantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
		const toolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, SessionGroupToolbarMenuId, {
			menuOptions: { shouldForwardArgs: true },
		}));

		return { container, label, inputContainer, toolbar, chevron, contextKeyService, disposables, elementDisposables: disposables.add(new DisposableStore()) };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionGroupTemplate): void {
		const element = node.element;
		if (!isSessionGroupItem(element)) {
			return;
		}
		template.elementDisposables.clear();
		this.templatesByElement.set(element, template);
		this.templatesById.set(element.group.id, template);
		template.container.classList.remove(SESSION_HEADER_DROP_TARGET_CLASS);

		template.label.textContent = element.group.name;
		this.updateChevron(template, node.collapsible, node.collapsed);
		template.toolbar.context = element;

		template.container.classList.toggle('session-group-editing', element.editing);
		if (element.editing) {
			this.renderInput(element, template);
		} else {
			template.inputContainer.style.display = 'none';
			template.label.style.display = '';
		}
	}

	private renderInput(element: ISessionGroupItem, template: ISessionGroupTemplate): void {
		template.label.style.display = 'none';
		template.inputContainer.style.display = '';
		DOM.clearNode(template.inputContainer);

		const input = template.elementDisposables.add(new InputBox(template.inputContainer, undefined, {
			inputBoxStyles: defaultInputBoxStyles,
			ariaLabel: localize('sessionGroupName', "Group name"),
		}));
		input.value = element.group.name;
		input.focus();
		input.select();

		let done = false;
		const commit = () => {
			if (done) {
				return;
			}
			done = true;
			this.delegate.commitEdit(element.group, input.value.trim());
		};
		const cancel = () => {
			if (done) {
				return;
			}
			done = true;
			this.delegate.cancelEdit(element.group);
		};

		template.elementDisposables.add(DOM.addStandardDisposableListener(input.inputElement, DOM.EventType.KEY_DOWN, e => {
			if (e.equals(KeyCode.Enter)) {
				e.preventDefault();
				e.stopPropagation();
				commit();
			} else if (e.equals(KeyCode.Escape)) {
				e.preventDefault();
				e.stopPropagation();
				cancel();
			}
		}));
		template.elementDisposables.add(DOM.addDisposableListener(input.inputElement, DOM.EventType.BLUR, () => commit()));
	}

	/** Forwarded from the owning list when the group's collapse state toggles. */
	updateCollapseState(element: ISessionGroupItem, collapsed: boolean): void {
		const template = this.templatesByElement.get(element);
		if (template) {
			this.updateChevron(template, true, collapsed);
		}
	}

	setDropTarget(groupId: string, active: boolean): void {
		const template = this.templatesById.get(groupId);
		template?.container.classList.toggle(SESSION_HEADER_DROP_TARGET_CLASS, active);
	}

	private updateChevron(template: ISessionGroupTemplate, collapsible: boolean, collapsed: boolean): void {
		template.chevron.className = 'session-section-chevron';
		if (collapsible) {
			template.chevron.classList.add('collapsible');
			const icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
			template.chevron.classList.add(...ThemeIcon.asClassNameArray(icon));
		}
	}

	disposeElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: ISessionGroupTemplate): void {
		if (isSessionGroupItem(node.element)) {
			this.templatesByElement.delete(node.element);
			this.templatesById.delete(node.element.group.id);
		}
		template.elementDisposables.clear();
	}

	disposeTemplate(template: ISessionGroupTemplate): void {
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

class SessionPlaceholderRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, HTMLElement> {
	static readonly TEMPLATE_ID = 'session-placeholder';
	readonly templateId = SessionPlaceholderRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): HTMLElement {
		container.classList.add('session-placeholder');
		return DOM.append(container, $('span.session-placeholder-label'));
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: HTMLElement): void {
		const element = node.element;
		if (!isSessionPlaceholder(element)) {
			return;
		}
		template.textContent = element.label;
	}

	disposeTemplate(_template: HTMLElement): void { }
}

//#region Accessibility

class SessionsAccessibilityProvider {
	getWidgetAriaLabel(): string {
		return localize('sessionsList', "Sessions");
	}

	getAriaLabel(element: SessionListItem): string | null {
		if (isSessionGroupItem(element)) {
			return `${element.group.name}, ${element.sessions.length}`;
		}
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
		if (isSessionPlaceholder(element)) {
			return element.label;
		}
		const title = element.title.get();
		const updated = fromNow(element.updatedAt.get(), true);
		return localize('sessionItemAria', "{0}, updated {1}", title, updated);
	}
}

//#endregion

//#region Drag and Drop

/**
 * Callbacks the sessions list provides to its drag-and-drop controller so the
 * controller can validate and apply manual reordering without owning the list
 * model itself.
 */
interface ISessionsListDndDelegate {
	/** Whether a session may participate in reordering within its current section. */
	isReorderable(session: ISession): boolean;
	/** Whether a session currently renders in the Pinned section. */
	isSessionPinned(session: ISession): boolean;
	/** Whether the dragged sessions may be reordered relative to the given target. */
	canDropOn(dragged: ISession[], target: ISession): boolean;
	/** Apply the reorder, placing the dragged sessions before/after the target. */
	reorder(dragged: ISession[], target: ISession, position: 'before' | 'after'): void;
	/** The id of the group the session belongs to, or `undefined`. */
	getGroupIdOfSession(session: ISession): string | undefined;
	/** Add the given sessions to the group. */
	addSessionsToGroup(sessions: ISession[], groupId: string, target: ISession | undefined, position: 'before' | 'after' | undefined): void;
	/** Pin the given sessions, optionally placing them before/after a pinned target. */
	pinSessions(sessions: ISession[], target: ISession | undefined, position: 'before' | 'after' | undefined): void;
	/** Highlight only the header that will receive the dragged sessions. */
	setDropTargetHeader(header: ISessionDropTargetHeader | undefined): void;
	/** Reorder a top-level header (group or workspace section) before/after another. */
	reorderSection(draggedId: string, targetId: string, position: 'before' | 'after', isWorkspace: boolean): void;
}

interface ISessionDropTargetHeader {
	readonly kind: 'group' | 'section';
	readonly id: string;
}

interface ISessionMembershipDropTarget {
	readonly sessions: ISession[];
	readonly header: ISessionDropTargetHeader;
	readonly target: ISession | undefined;
	readonly position: 'before' | 'after' | undefined;
}

interface ISessionAddToGroupDropTarget extends ISessionMembershipDropTarget {
	readonly groupId: string;
}

/** A top-level header (group or workspace section) currently being dragged to reorder. */
interface IDraggedHeader {
	/** The reorder identity (`group:<id>` or `workspace:<label>`). */
	readonly id: string;
	/** Whether the dragged header is a workspace section (vs. a user group). */
	readonly isWorkspace: boolean;
}

class SessionsListDragAndDrop extends Disposable implements ITreeDragAndDrop<SessionListItem> {

	private readonly _transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();

	constructor(private readonly delegate: ISessionsListDndDelegate) {
		super();
	}

	getDragURI(element: SessionListItem): string | null {
		if (isSessionGroupItem(element)) {
			return `sessionGroup:${element.group.id}`;
		}
		if (isSessionSection(element)) {
			// Only workspace sections are reorderable; Pinned, Done and the date
			// sections stay fixed and are therefore not draggable.
			return element.id.startsWith('workspace:') ? `sessionWorkspace:${element.id}` : null;
		}
		if (isSessionShowMore(element)) {
			return null;
		}
		if (isSessionPlaceholder(element)) {
			return null;
		}
		return element.resource.toString();
	}

	getDragLabel(elements: SessionListItem[]): string | undefined {
		const groupItem = elements.find(isSessionGroupItem);
		if (groupItem) {
			return groupItem.group.name;
		}
		const workspaceSection = elements.find((e): e is ISessionSection => isSessionSection(e) && e.id.startsWith('workspace:'));
		if (workspaceSection) {
			return workspaceSection.label;
		}
		const sessions = this.toSessions(elements);
		if (sessions.length === 0) {
			return undefined;
		}
		if (sessions.length === 1) {
			return sessions[0].title.get();
		}
		return localize('sessions.dragLabel', "{0} sessions", sessions.length);
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const sessions = this.toSessions(data instanceof ElementsDragAndDropData ? data.elements as SessionListItem[] : []);
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
		this.delegate.setDropTargetHeader(undefined);
	}

	onDragOver(data: IDragAndDropData, targetElement: SessionListItem | undefined, _targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined): boolean | ITreeDragOverReaction {
		const draggedHeader = this.draggedHeader(data);
		if (draggedHeader) {
			this.delegate.setDropTargetHeader(undefined);
			return this.onHeaderDragOver(draggedHeader, targetElement, targetSector);
		}

		const pinTarget = this.resolvePinTarget(data, targetElement, targetSector);
		if (pinTarget) {
			this.delegate.setDropTargetHeader(pinTarget.header);
			return this.toMembershipDropReaction(pinTarget);
		}

		const addToGroupTarget = this.resolveAddToGroupTarget(data, targetElement, targetSector);
		if (addToGroupTarget) {
			this.delegate.setDropTargetHeader(addToGroupTarget.header);
			return this.toMembershipDropReaction(addToGroupTarget);
		}

		this.delegate.setDropTargetHeader(undefined);
		const target = this.resolveReorderTarget(data, targetElement);
		if (!target) {
			return false;
		}
		const position = sectorToPosition(targetSector);
		return {
			accept: true,
			effect: {
				type: ListDragOverEffectType.Move,
				position: position === 'after' ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before,
			},
		};
	}

	drop(data: IDragAndDropData, targetElement: SessionListItem | undefined, _targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined): void {
		this.delegate.setDropTargetHeader(undefined);
		try {
			const draggedHeader = this.draggedHeader(data);
			if (draggedHeader) {
				if (targetElement) {
					const targetRef = this.headerRefOf(targetElement);
					if (targetRef && targetRef !== draggedHeader.id) {
						this.delegate.reorderSection(draggedHeader.id, targetRef, sectorToPosition(targetSector), draggedHeader.isWorkspace);
					}
				}
				return;
			}

			const pinTarget = this.resolvePinTarget(data, targetElement, targetSector);
			if (pinTarget) {
				this.delegate.pinSessions(pinTarget.sessions, pinTarget.target, pinTarget.position);
				return;
			}

			const addToGroupTarget = this.resolveAddToGroupTarget(data, targetElement, targetSector);
			if (addToGroupTarget) {
				this.delegate.addSessionsToGroup(addToGroupTarget.sessions, addToGroupTarget.groupId, addToGroupTarget.target, addToGroupTarget.position);
				return;
			}

			const target = this.resolveReorderTarget(data, targetElement);
			if (!target) {
				return;
			}
			this.delegate.reorder(this.draggedSessions(data), target, sectorToPosition(targetSector));
		} finally {
			this.delegate.setDropTargetHeader(undefined);
		}
	}

	private onHeaderDragOver(draggedHeader: IDraggedHeader, targetElement: SessionListItem | undefined, targetSector: ListViewTargetSector | undefined): boolean | ITreeDragOverReaction {
		if (!targetElement) {
			return false;
		}
		const targetRef = this.headerRefOf(targetElement);
		if (!targetRef || targetRef === draggedHeader.id) {
			return false;
		}
		const position = sectorToPosition(targetSector);
		return {
			accept: true,
			effect: {
				type: ListDragOverEffectType.Move,
				position: position === 'after' ? ListDragOverEffectPosition.After : ListDragOverEffectPosition.Before,
			},
		};
	}

	private resolvePinTarget(data: IDragAndDropData, targetElement: SessionListItem | undefined, targetSector: ListViewTargetSector | undefined): ISessionMembershipDropTarget | undefined {
		if (!targetElement) {
			return undefined;
		}

		let target: ISession | undefined;
		if (isSessionSection(targetElement)) {
			if (targetElement.id !== 'pinned') {
				return undefined;
			}
		} else if (isSessionItem(targetElement) && this.delegate.isSessionPinned(targetElement)) {
			target = targetElement;
		} else {
			return undefined;
		}

		const dragged = this.draggedSessions(data);
		const hasArchived = dragged.some(session => session.isArchived.get());
		const allPinned = dragged.every(session => this.delegate.isSessionPinned(session));
		if (dragged.length === 0 || hasArchived || allPinned) {
			return undefined;
		}
		if (target && dragged.some(session => session.sessionId === target.sessionId)) {
			return undefined;
		}
		return {
			sessions: dragged,
			header: { kind: 'section', id: 'pinned' },
			target,
			position: target ? sectorToPosition(targetSector) : undefined,
		};
	}

	private resolveAddToGroupTarget(data: IDragAndDropData, targetElement: SessionListItem | undefined, targetSector: ListViewTargetSector | undefined): ISessionAddToGroupDropTarget | undefined {
		if (!targetElement) {
			return undefined;
		}
		let groupId: string | undefined;
		let target: ISession | undefined;
		if (isSessionGroupItem(targetElement)) {
			groupId = targetElement.group.id;
		} else if (isSessionItem(targetElement)) {
			groupId = this.delegate.getGroupIdOfSession(targetElement);
			target = groupId === undefined ? undefined : targetElement;
		}
		if (groupId === undefined) {
			return undefined;
		}

		const dragged = this.draggedSessions(data);
		const hasArchived = dragged.some(session => session.isArchived.get());
		const allInGroup = dragged.every(session => this.delegate.getGroupIdOfSession(session) === groupId);
		if (dragged.length === 0 || hasArchived || allInGroup) {
			return undefined;
		}
		if (target && dragged.some(session => session.sessionId === target.sessionId)) {
			return undefined;
		}
		return {
			sessions: dragged,
			groupId,
			header: { kind: 'group', id: groupId },
			target,
			position: target ? sectorToPosition(targetSector) : undefined,
		};
	}

	/**
	 * Resolve the session the drop should be positioned against, or `undefined`
	 * if the current drag is not a valid in-list reorder.
	 */
	private resolveReorderTarget(data: IDragAndDropData, targetElement: SessionListItem | undefined): ISession | undefined {
		if (!targetElement || !isSessionItem(targetElement)) {
			return undefined;
		}
		const target = targetElement;
		if (!this.delegate.isReorderable(target)) {
			return undefined;
		}
		const dragged = this.draggedSessions(data);
		if (dragged.length === 0 || dragged.some(s => s.sessionId === target.sessionId)) {
			return undefined;
		}
		if (dragged.some(s => !this.delegate.isReorderable(s))) {
			return undefined;
		}
		if (!this.delegate.canDropOn(dragged, target)) {
			return undefined;
		}
		return target;
	}

	private toMembershipDropReaction(target: ISessionMembershipDropTarget): ITreeDragOverReaction {
		let position = ListDragOverEffectPosition.Over;
		if (target.position === 'after') {
			position = ListDragOverEffectPosition.After;
		} else if (target.position === 'before') {
			position = ListDragOverEffectPosition.Before;
		}
		return {
			accept: true,
			effect: {
				type: ListDragOverEffectType.Move,
				position,
			},
		};
	}

	private draggedHeader(data: IDragAndDropData): IDraggedHeader | undefined {
		if (!(data instanceof ElementsDragAndDropData)) {
			return undefined;
		}
		const elements = data.elements as SessionListItem[];
		const groupItem = elements.find(isSessionGroupItem);
		if (groupItem) {
			return { id: `group:${groupItem.group.id}`, isWorkspace: false };
		}
		const workspaceSection = elements.find((e): e is ISessionSection => isSessionSection(e) && e.id.startsWith('workspace:'));
		if (workspaceSection) {
			return { id: workspaceSection.id, isWorkspace: true };
		}
		return undefined;
	}

	/** The reorder identity of a top-level header element, or `undefined` when it is not reorderable. */
	private headerRefOf(element: SessionListItem): string | undefined {
		if (isSessionGroupItem(element)) {
			return `group:${element.group.id}`;
		}
		if (isSessionSection(element) && element.id.startsWith('workspace:')) {
			return element.id;
		}
		return undefined;
	}

	private draggedSessions(data: IDragAndDropData): ISession[] {
		return this.toSessions(data instanceof ElementsDragAndDropData ? data.elements as SessionListItem[] : []);
	}

	private toSessions(elements: SessionListItem[]): ISession[] {
		return elements.filter(isSessionItem);
	}
}

function sectorToPosition(sector: ListViewTargetSector | undefined): 'before' | 'after' {
	return sector !== undefined && sector >= ListViewTargetSector.CENTER_BOTTOM ? 'after' : 'before';
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
	 * Sessions hidden by section capping ("show more") are excluded.
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
	createGroupFromSessions(sessions: ISession[]): void;
	beginRenameGroup(groupId: string): void;
	addSessionsToGroup(sessions: ISession[], groupId: string, target?: ISession, position?: 'before' | 'after'): void;
	getGroupsInDisplayOrder(): ISessionGroup[];
}

export class SessionsList extends Disposable implements ISessionsList {

	private static readonly SECTION_COLLAPSE_STATE_KEY = 'sessionsListControl.sectionCollapseState';
	private static readonly EXCLUDED_TYPES_KEY = 'sessionsListControl.excludedSessionTypes';
	private static readonly EXCLUDED_STATUSES_KEY = 'sessionsListControl.excludedStatuses';
	private static readonly EXCLUDE_ARCHIVED_KEY = 'sessionsListControl.excludeArchived';
	private static readonly EXCLUDE_READ_KEY = 'sessionsListControl.excludeRead';
	private static readonly WORKSPACE_GROUP_CAPPED_KEY = 'sessionsListControl.workspaceGroupCapped';
	private static readonly DEFAULT_SESSION_GROUP_LIMIT = 5;

	/**
	 * Experiment treatment that overrides how many sessions are shown per group
	 * before the "show more" affordance appears.
	 */
	private static readonly SESSION_GROUP_LIMIT_TREATMENT = 'sessions.workspaceGroupLimit';

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
	 * Maximum number of sessions shown per workspace section or user group.
	 */
	private readonly sessionGroupLimit = observableValue<number>(this, SessionsList.DEFAULT_SESSION_GROUP_LIMIT);
	private readonly expandedSessionGroups = new Set<string>();
	private expandedMoreFolders = false;
	private openWindowSourceFolder: URI | undefined;
	private hasFindPattern = false;
	private suspendCollapseStatePersistence = false;

	/** The group whose header is currently showing its inline name editor. */
	private _editingGroupId: string | undefined;
	private _groupRenderer!: SessionGroupRenderer;
	private _sectionRenderer!: SessionSectionRenderer;
	private _sessionsProvidersService!: ISessionsProvidersService;
	private _dropTargetHeader: ISessionDropTargetHeader | undefined;

	/**
	 * Snapshot of the currently-rendered reorderable top-level headers (groups
	 * and, in workspace mode, workspace sections) in display order, by reorder
	 * identity. Captured each render and used as the basis for drag-reorder math.
	 */
	private _topLevelOrder: string[] = [];

	private readonly _onDidUpdate = this._register(new Emitter<void>());
	readonly onDidUpdate: Event<void> = this._onDidUpdate.event;

	private readonly _onDidChangeFindOpenState = this._register(new Emitter<boolean>());
	readonly onDidChangeFindOpenState: Event<boolean> = this._onDidChangeFindOpenState.event;

	get element(): HTMLElement { return this.listContainer; }

	constructor(
		container: HTMLElement,
		private readonly options: ISessionsListControlOptions,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsListModelService private readonly _sessionsListModelService: ISessionsListModelService,
		@ISessionGroupsService private readonly _sessionGroupsService: ISessionGroupsService,
		@ISessionSectionOrderService private readonly _sessionSectionOrderService: ISessionSectionOrderService,
		@IAgentHostFilterService private readonly _agentHostFilterService: IAgentHostFilterService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ICommandService private readonly commandService: ICommandService,
		@IVoicePlaybackService private readonly _listVoicePlaybackService: IVoicePlaybackService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
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
		this._sessionsProvidersService = sessionsProvidersService;
		// Re-render so the always-visible "Chats" section appears/disappears when a
		// quick-chat-capable provider is (de)registered (e.g. agent host toggled),
		// or when a registered provider toggles a capability at runtime (e.g. its
		// `supportsQuickChats` flips with agent-host enablement).
		const providerCapabilityListeners = this._register(new DisposableStore());
		const subscribeProviderCapabilities = () => {
			providerCapabilityListeners.clear();
			for (const provider of sessionsProvidersService.getProviders()) {
				if (provider.onDidChangeCapabilities) {
					providerCapabilityListeners.add(provider.onDidChangeCapabilities(() => this.update()));
				}
			}
		};
		subscribeProviderCapabilities();
		this._register(sessionsProvidersService.onDidChangeProviders(() => {
			subscribeProviderCapabilities();
			this.update();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING)) {
				this.update();
			}
		}));
		// TEMPORARY (#320480): see the note on the `IAgentSessionsService` import.
		const agentSessionsService = instantiationService.invokeFunction(accessor => accessor.get(IAgentSessionsService));
		const voicePlaybackService = instantiationService.invokeFunction(accessor => accessor.get(IVoicePlaybackService));
		const sessionRenderer = new SessionItemRenderer(
			{ grouping: this.options.grouping, isPinned: s => this.isSessionPinned(s), isRead: s => s.isRead.get(), visibleSessions: this._sessionsService.visibleSessions, getMultiSelectedSessions: s => this.getMultiSelectedSessions(s), showHover: true, approvalRowMaxLines: DEFAULT_APPROVAL_ROW_MAX_LINES, toolbarMenuId: SessionItemToolbarMenuId },
			approvalModel,
			undefined,
			instantiationService,
			contextKeyService,
			markdownRendererService,
			hoverService,
			sessionsProvidersService,
			agentSessionsService,
			voicePlaybackService,
		);

		const showMoreRenderer = new SessionShowMoreRenderer();
		const placeholderRenderer = new SessionPlaceholderRenderer();
		const sectionRenderer = new SessionSectionRenderer(true /* hideSectionCount */, instantiationService, contextKeyService);
		this._sectionRenderer = sectionRenderer;
		const groupRenderer = new SessionGroupRenderer({
			commitEdit: (group, name) => this.commitGroupEdit(group, name),
			cancelEdit: group => this.cancelGroupEdit(group),
		}, instantiationService, contextKeyService);
		this._groupRenderer = groupRenderer;

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
				groupRenderer,
				showMoreRenderer,
				placeholderRenderer,
			],
			{
				accessibilityProvider: new SessionsAccessibilityProvider(),
				dnd: this._register(new SessionsListDragAndDrop({
					isReorderable: session => this.isReorderable(session),
					isSessionPinned: session => this.isSessionPinned(session),
					canDropOn: (dragged, target) => this.canReorderOnto(dragged, target),
					reorder: (dragged, target, position) => this.reorderSessions(dragged, target, position),
					getGroupIdOfSession: session => this._sessionGroupsService.getGroupOfSession(session.sessionId),
					addSessionsToGroup: (sessions, groupId, target, position) => this.addSessionsToGroup(sessions, groupId, target, position),
					pinSessions: (sessions, target, position) => this.pinSessions(sessions, target, position),
					setDropTargetHeader: header => this.setDropTargetHeader(header),
					reorderSection: (draggedId, targetId, position, isWorkspace) => this.reorderSection(draggedId, targetId, position, isWorkspace),
				})),
				identityProvider: {
					getId: (element: SessionListItem) => {
						if (isSessionGroupItem(element)) {
							return `group:${element.group.id}`;
						}
						if (isSessionSection(element)) {
							return `section:${element.id}`;
						}
						if (isSessionShowMore(element)) {
							return `show-more:${element.kind}:${element.mode}:${element.sectionId}`;
						}
						if (isSessionPlaceholder(element)) {
							return `placeholder:${element.sectionId}`;
						}
						return element.resource.toString();
					},
					getGroupId: (element: SessionListItem) => {
						if (isSessionGroupItem(element)) {
							return NotSelectableGroupId;
						}
						if (isSessionSection(element)) {
							return NotSelectableGroupId;
						}
						if (isSessionShowMore(element)) {
							return NotSelectableGroupId;
						}
						if (isSessionPlaceholder(element)) {
							return NotSelectableGroupId;
						}
						// Use a distinct group for archived (done) sessions so that
						// multi-selection cannot span the workspace and done sections.
						return element.isArchived.get() ? 2 : 1;
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
						if (isSessionGroupItem(element)) {
							return element.group.name;
						}
						if (isSessionSection(element)) {
							return element.label;
						}
						if (isSessionShowMore(element)) {
							return element.sectionLabel;
						}
						if (isSessionPlaceholder(element)) {
							return element.label;
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
						this.expandedSessionGroups.add(element.sectionId);
					} else {
						this.expandedSessionGroups.delete(element.sectionId);
					}
				}
				this.update();
				return;
			}
			if (isSessionPlaceholder(element)) {
				return;
			}
			if (!isSessionSection(element) && !isSessionGroupItem(element)) {
				this.markRead(element);
				// A deliberate left mouse click on a session should move keyboard
				// focus into the chat input so the user can start typing right
				// away. A single click always reports `preserveFocus: true`, so
				// detect the mouse click explicitly. Keyboard navigation keeps
				// `preserveFocus` as reported so browsing the list never steals
				// focus from it.
				const isLeftClick = DOM.isMouseEvent(e.browserEvent) && e.browserEvent.button === 0;
				const preserveFocus = isLeftClick ? false : (e.editorOptions.preserveFocus ?? false);
				this.options.onSessionOpen(element.resource, preserveFocus, e.sideBySide);
				// If this session has an unheard voice response, opening it may not
				// change the active-session observable (it can already be the active
				// session, just not focused), so the voice controller would never
				// re-activate it. Ask it to narrate the pending item explicitly.
				if (this._listVoicePlaybackService.hasPendingResponse(element.resource)) {
					this.commandService.executeCommand('_chat.voice.activateSession', element.resource.toString());
				}
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
			if (element && isSessionGroupItem(element)) {
				this._groupRenderer.updateCollapseState(element, e.node.collapsed);
				if (!this.suspendCollapseStatePersistence) {
					this.saveSectionCollapseState(`group:${element.group.id}`, e.node.collapsed);
				}
			} else if (element && isSessionSection(element)) {
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

		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			if (this.visible) {
				this.refresh();
			}
			// A removed session may have been the last one in its workspace.
			// Garbage-collect manual order / promotion entries for identities
			// that no longer exist. This runs only on removals (never on
			// additions or the initial load) so that asynchronous session
			// loading on a window reload can never prune the user's manual
			// ordering of workspaces relative to groups before their sessions
			// have loaded.
			if (e.removed.length > 0) {
				this._sessionSectionOrderService.retain(this.liveSectionOrderIds());
			}
		}));

		this._register(this._sessionsListModelService.onDidChange(() => {
			if (this.visible) {
				this.update();
			}
		}));

		this._register(this._sessionGroupsService.onDidChange(e => {
			if (this.visible) {
				this.update();
			}
			// Garbage-collect manual order / promotion entries when groups are
			// deleted or evicted. Group changes are user-driven and happen after
			// sessions have loaded, so pruning here is safe (unlike at render
			// time during the asynchronous initial load).
			if (e.groupsChanged) {
				this._sessionSectionOrderService.retain(this.liveSectionOrderIds());
			}
		}));

		this._register(this._sessionSectionOrderService.onDidChange(() => {
			if (this.visible) {
				this.update();
			}
		}));

		this._register(this._agentHostFilterService.onDidChange(() => {
			if (this.visible) {
				this.update();
			}
		}));

		// Re-render when the active session changes.
		this._register(autorun(reader => {
			this._sessionsService.activeSession.read(reader);
			if (this.visible) {
				this.update();
			}
		}));

		// Resolve the per-group session limit from the experiment service and
		// keep it current when treatments are refetched. The async fetch is
		// confined to `updateSessionGroupLimit`; the rest of the list reads the
		// resolved value synchronously off `sessionGroupLimit`. The autorun runs
		// immediately for the initial fetch and again whenever treatments refetch.
		const assignmentRefetchSignal = observableSignalFromEvent(this, this.assignmentService.onDidRefetchAssignments);
		this._register(autorun(reader => {
			assignmentRefetchSignal.read(reader);
			this.updateSessionGroupLimit();
		}));

		this.refresh();
	}

	/**
	 * Fetches the session group limit treatment and updates the backing
	 * observable. Invalid or unset treatments fall back to the default limit.
	 */
	private updateSessionGroupLimit(): void {
		this.assignmentService.getTreatment<number>(SessionsList.SESSION_GROUP_LIMIT_TREATMENT).then(value => {
			const limit = typeof value === 'number' && Number.isInteger(value) && value > 0
				? value
				: SessionsList.DEFAULT_SESSION_GROUP_LIMIT;
			if (this.sessionGroupLimit.get() !== limit) {
				this.sessionGroupLimit.set(limit, undefined);
				if (this.visible) {
					this.update();
				}
			}
		});
	}

	refresh(): void {
		this.sessions = this._sessionsManagementService.getSessions();
		for (const session of this.sessions) {
			this._sessionsListModelService.migrateLegacyReadState(session);
		}
		this.update();
	}

	update(expandAll?: boolean): void {
		const activeSession = this._sessionsService.activeSession.get();

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
			filtered = filtered.filter(s => !s.isRead.get());
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
		const sorting = this.options.sorting();
		const sortKeyForGrouping = (s: ISession, srt: SessionsSorting) => this._sessionsListModelService.getSortKey(s, sortingToMode(srt));

		// Pull regular (non-pinned, non-archived) grouped sessions out of the
		// normal date/workspace sectioning so they render under their group.
		// Pinned and archived sessions keep their precedence and stay in their
		// sections even when they belong to a group (their membership is
		// retained so they return to the group once unpinned/restored).
		const groupedMembers = new Map<string, ISession[]>();
		const groupedRegularIds = new Set<string>();
		for (const s of filtered) {
			if (s.isArchived.get() || this.isSessionPinned(s)) {
				continue;
			}
			const groupId = this._sessionGroupsService.getGroupOfSession(s.sessionId);
			if (groupId !== undefined && this._sessionGroupsService.getGroup(groupId)) {
				let members = groupedMembers.get(groupId);
				if (!members) {
					members = [];
					groupedMembers.set(groupId, members);
				}
				members.push(s);
				groupedRegularIds.add(s.sessionId);
			}
		}
		// Keep a group being renamed visible even if it currently has no visible
		// members, so its inline name editor stays on screen.
		if (this._editingGroupId && this._sessionGroupsService.getGroup(this._editingGroupId) && !groupedMembers.has(this._editingGroupId)) {
			groupedMembers.set(this._editingGroupId, []);
		}

		const forSections = groupedRegularIds.size > 0 ? filtered.filter(s => !groupedRegularIds.has(s.sessionId)) : filtered;

		// Build the group blocks with members sorted by the normal sort logic.
		// Groups are fully user-managed: their order is owned by the section-order
		// service (defaulting to newest-first), independent of their members'
		// recency, and is shared across both grouping modes.
		const groupItemsById = new Map<string, ISessionGroupItem>();
		for (const [groupId, members] of groupedMembers) {
			const group = this._sessionGroupsService.getGroup(groupId)!;
			const sortedMembers = sortSessions(members, sorting, sortKeyForGrouping);
			groupItemsById.set(groupId, { group, sessions: sortedMembers, editing: group.id === this._editingGroupId });
		}
		const defaultGroupIds = [...groupItemsById.values()]
			.sort((a, b) => b.group.createdAt - a.group.createdAt)
			.map(item => `group:${item.group.id}`);

		const sections = groupSessionsForList(forSections, grouping, sorting, session => this.isSessionPinned(session), (s, srt) => this._sessionsListModelService.getSortKey(s, sortingToMode(srt)));

		const hasRecentSessions = sections.some(s => s.id === 'recent' && s.sessions.length > 0);

		// Keep the "Chats" default section visible even when empty so it stays
		// discoverable, unless the user opts out via the setting. The "Pinned"
		// section is only shown when it actually has pinned sessions.
		const showEmptyDefaultGroups = this.configurationService.getValue<boolean>(SESSIONS_LIST_SHOW_EMPTY_DEFAULT_GROUPS_SETTING);

		// Keep the "Chats" section always visible (even with no quick chats) so its
		// header — leading chat icon, label, and the "+" create action — is always
		// reachable. Only when a provider can actually serve quick chats.
		if (showEmptyDefaultGroups && this._someProviderSupportsQuickChats() && !sections.some(s => s.id === QUICK_CHATS_SECTION_ID)) {
			sections.push({ id: QUICK_CHATS_SECTION_ID, label: localize('chatsSection', "Chats"), sessions: [] });
		}

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
					if (!meetsCriteria(section) && section.id !== fallbackId && !this._sessionSectionOrderService.isPromoted(section.id)) {
						moreFolderSectionIds.add(section.id);
					}
				}
			}
		}

		const children: IObjectTreeElement<SessionListItem>[] = [];

		const sessionGroupLimit = this.sessionGroupLimit.get();

		const toSessionChildren = (sessions: readonly ISession[]): IObjectTreeElement<SessionListItem>[] =>
			sessions.map(session => ({ element: session as SessionListItem }));

		const renderSessionChildren = (sessions: readonly ISession[], sectionId: string, sectionLabel: string, enabled: boolean): IObjectTreeElement<SessionListItem>[] => {
			const limited = limitSessionsForList(sessions, sessionGroupLimit, {
				enabled,
				expanded: this.expandedSessionGroups.has(sectionId),
				sectionId,
				sectionLabel,
			});
			const children = toSessionChildren(limited.sessions);
			if (limited.showMore) {
				children.push({ element: limited.showMore });
			}
			return children;
		};

		const renderSection = (section: ISessionSection): IObjectTreeElement<SessionListItem> => {
			const isWorkspaceGroup = grouping === SessionsGrouping.Workspace
				&& section.id.startsWith('workspace:');
			const limitSessions = isWorkspaceGroup
				&& !this.hasFindPattern
				&& this.workspaceGroupCapped;
			let sectionChildren = renderSessionChildren(section.sessions, section.id, section.label, limitSessions);

			// The always-visible "Chats" section shows a muted placeholder row
			// when it has no sessions yet.
			if (section.id === QUICK_CHATS_SECTION_ID && section.sessions.length === 0) {
				sectionChildren = [{ element: { placeholder: true as const, sectionId: section.id, label: localize('noChats', "No chats") } }];
			}

			// Default collapse state for older time sections
			let defaultCollapsed: boolean | ObjectTreeElementCollapseState = ObjectTreeElementCollapseState.PreserveOrExpanded;
			if (grouping === SessionsGrouping.Date && hasRecentSessions) {
				const olderSections = ['older', 'archived'];
				if (olderSections.includes(section.id)) {
					defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
				}
			}
			if (section.id === 'archived') {
				defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
			}

			// The "Pinned" and "Chats" sections start collapsed on first open; the
			// user's later choice is persisted and honored via getSavedCollapseState.
			if (section.id === 'pinned' || section.id === QUICK_CHATS_SECTION_ID) {
				defaultCollapsed = ObjectTreeElementCollapseState.PreserveOrCollapsed;
			}

			return {
				element: section as SessionListItem,
				collapsible: true,
				collapsed: this.getSavedCollapseState(section.id) ?? defaultCollapsed,
				children: sectionChildren,
			};
		};

		const renderGroup = (groupItem: ISessionGroupItem): IObjectTreeElement<SessionListItem> => {
			return {
				element: groupItem,
				collapsible: true,
				collapsed: this.getSavedCollapseState(`group:${groupItem.group.id}`) ?? ObjectTreeElementCollapseState.PreserveOrExpanded,
				children: renderSessionChildren(groupItem.sessions, `group:${groupItem.group.id}`, groupItem.group.name, !this.hasFindPattern && this.workspaceGroupCapped),
			};
		};

		const pinnedSection = sections.find(s => s.id === 'pinned');
		if (pinnedSection) {
			children.push(renderSection(pinnedSection));
		}

		// Quick chats render as a single "Chats" entry directly below Pinned (above
		// the workspace/date groups) in both grouping modes.
		const quickChatsSection = sections.find(s => s.id === QUICK_CHATS_SECTION_ID);
		if (quickChatsSection) {
			children.push(renderSection(quickChatsSection));
		}

		const renderGroupById = (id: string): void => {
			const groupItem = groupItemsById.get(id.slice('group:'.length));
			if (groupItem) {
				children.push(renderGroup(groupItem));
			}
		};

		if (grouping === SessionsGrouping.Date) {
			// Groups form a contiguous, fully user-ordered block right below the
			// Pinned section. They no longer interleave with the date sections by
			// recency and never mix into Today/Yesterday/etc. Pinned stays at the
			// top, Done (archived) stays at the bottom.
			const resolvedGroupIds = this._sessionSectionOrderService.resolveOrder(defaultGroupIds);
			this._topLevelOrder = resolvedGroupIds;
			for (const id of resolvedGroupIds) {
				renderGroupById(id);
			}
			for (const section of sections) {
				if (section.id === 'pinned' || section.id === 'archived' || section.id === QUICK_CHATS_SECTION_ID) {
					continue;
				}
				children.push(renderSection(section));
			}
			const archived = sections.find(s => s.id === 'archived');
			if (archived) {
				children.push(renderSection(archived));
			}
		} else {
			// Workspace grouping: groups and (primary) workspace sections share one
			// freely-reorderable, user-managed order right below Pinned. Groups
			// default above workspaces; workspaces default to their alphabetical
			// order. Pinned stays first, Done last, and hidden ("+N more")
			// workspaces are appended below the ordered block.
			const workspaceSections = sections.filter(s => s.id.startsWith('workspace:'));
			const sectionById = new Map(workspaceSections.map(s => [s.id, s] as const));
			const primaryWorkspaceIds = workspaceSections
				.filter(s => !moreFolderSectionIds.has(s.id))
				.map(s => s.id);

			const defaultOrder = [...defaultGroupIds, ...primaryWorkspaceIds];
			const resolvedIds = this._sessionSectionOrderService.resolveOrder(defaultOrder);
			this._topLevelOrder = resolvedIds;
			for (const id of resolvedIds) {
				if (id.startsWith('group:')) {
					renderGroupById(id);
				} else {
					const section = sectionById.get(id);
					if (section) {
						children.push(renderSection(section));
					}
				}
			}

			const moreFolderSections = workspaceSections.filter(s => moreFolderSectionIds.has(s.id));
			if (moreFolderSections.length > 0) {
				if (this.expandedMoreFolders) {
					for (const section of moreFolderSections) {
						children.push(renderSection(section));
					}
					children.push({
						element: { showMore: true as const, kind: 'folders' as const, mode: 'less' as const, sectionId: SHOW_MORE_FOLDERS_LABEL, sectionLabel: SHOW_MORE_FOLDERS_LABEL, remainingCount: 0 },
					});
				} else {
					children.push({
						element: { showMore: true as const, kind: 'folders' as const, mode: 'more' as const, sectionId: SHOW_MORE_FOLDERS_LABEL, sectionLabel: SHOW_MORE_FOLDERS_LABEL, remainingCount: moreFolderSections.length },
					});
				}
			}

			// The archived ("Done") section is always the very last entry.
			const archivedSection = sections.find(s => s.id === 'archived');
			if (archivedSection) {
				children.push(renderSection(archivedSection));
			}
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

	/**
	 * Whether a session may participate in manual reordering. Archived (Done)
	 * sessions keep their fixed section.
	 */
	private isReorderable(session: ISession): boolean {
		return !session.isArchived.get();
	}

	/**
	 * Whether the dragged sessions can be reordered relative to the target.
	 * Reordering stays within the same scope: dragged sessions must share the
	 * target's group membership, and (when grouping by workspace) its workspace.
	 */
	private canReorderOnto(dragged: ISession[], target: ISession): boolean {
		const targetPinned = this.isSessionPinned(target);
		if (dragged.some(s => this.isSessionPinned(s) !== targetPinned)) {
			return false;
		}
		if (targetPinned) {
			return true;
		}

		const targetGroup = this._sessionGroupsService.getGroupOfSession(target.sessionId);
		if (dragged.some(s => this._sessionGroupsService.getGroupOfSession(s.sessionId) !== targetGroup)) {
			return false;
		}
		if (targetGroup === undefined && this.options.grouping() === SessionsGrouping.Workspace) {
			const targetLabel = sessionWorkspaceLabel(target);
			return dragged.every(s => sessionWorkspaceLabel(s) === targetLabel);
		}
		return true;
	}

	/**
	 * Reorder the dragged sessions so they land as a contiguous block before or
	 * after the target session, persisting a synthetic sort key (the midpoint of
	 * the surrounding sessions' keys). When the dragged sessions' natural
	 * timestamps already sort them into the dropped slot, any stored override is
	 * dropped instead so the list falls back to natural ordering.
	 */
	private reorderSessions(dragged: ISession[], target: ISession, position: 'before' | 'after'): void {
		const mode = sortingToMode(this.options.sorting());
		const grouping = this.options.grouping();
		const getKey = (s: ISession) => this._sessionsListModelService.getSortKey(s, mode);

		// Derive neighbours from the actual visible display order (which already
		// respects filtering and grouping) so the drop slot matches what the user
		// sees.
		const targetPinned = this.isSessionPinned(target);
		let scope = this.getVisibleSessions().filter(s => this.isReorderable(s));
		scope = scope.filter(s => this.isSessionPinned(s) === targetPinned);
		if (!targetPinned) {
			const targetGroup = this._sessionGroupsService.getGroupOfSession(target.sessionId);
			scope = scope.filter(s => this._sessionGroupsService.getGroupOfSession(s.sessionId) === targetGroup);
			if (targetGroup === undefined && grouping === SessionsGrouping.Workspace) {
				const targetLabel = sessionWorkspaceLabel(target);
				scope = scope.filter(s => sessionWorkspaceLabel(s) === targetLabel);
			}
		}

		const draggedIds = new Set(dragged.map(s => s.sessionId));
		const draggedOrdered = scope.filter(s => draggedIds.has(s.sessionId));
		if (draggedOrdered.length === 0) {
			return;
		}
		const remaining = scope.filter(s => !draggedIds.has(s.sessionId));

		const targetIndex = remaining.findIndex(s => s.sessionId === target.sessionId);
		if (targetIndex === -1) {
			return;
		}

		const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
		const above = remaining[insertIndex - 1];
		const below = remaining[insertIndex];

		const { set, clear } = computeReorderSortChanges({
			draggedIds: draggedOrdered.map(s => s.sessionId),
			naturalKeys: draggedOrdered.map(s => this._sessionsListModelService.getNaturalSortKey(s, mode)),
			aboveKey: above ? getKey(above) : undefined,
			belowKey: below ? getKey(below) : undefined,
			now: Date.now(),
			fallbackStep: SORT_FALLBACK_STEP_MS,
		});
		this._sessionsListModelService.applySortChanges(mode, set, clear);
	}

	// -- Groups --

	/**
	 * Create a new group containing the given sessions and start renaming it.
	 * Archived (Done) sessions are ignored.
	 */
	createGroupFromSessions(sessions: ISession[]): void {
		const groupSessions = sessions.filter(session => !session.isArchived.get());
		if (groupSessions.length === 0) {
			return;
		}
		this._sessionsListModelService.unpinSessions(groupSessions);
		const group = this._sessionGroupsService.createGroup(localize('newGroupName', "New Group"), groupSessions.map(s => s.sessionId));
		this._editingGroupId = group.id;
		this.update();
		this.revealGroup(group.id);
	}

	/** Scroll the group's header into view so its inline name editor is visible. */
	private revealGroup(groupId: string): void {
		const root = this.tree.getNode();
		for (const node of root.children) {
			const element = node.element;
			if (element && isSessionGroupItem(element) && element.group.id === groupId) {
				if (this.tree.hasElement(element) && this.tree.getRelativeTop(element) === null) {
					this.tree.reveal(element, 0.5);
				}
				return;
			}
		}
	}

	/** Begin inline renaming of the group's header. */
	beginRenameGroup(groupId: string): void {
		if (!this._sessionGroupsService.getGroup(groupId)) {
			return;
		}
		this._editingGroupId = groupId;
		this.update();
	}

	addSessionsToGroup(sessions: ISession[], groupId: string, target?: ISession, position?: 'before' | 'after'): void {
		const groupSessions = sessions.filter(session => !session.isArchived.get());
		this._sessionsListModelService.unpinSessions(groupSessions);
		this._sessionGroupsService.addToGroup(groupSessions.map(s => s.sessionId), groupId);
		if (target && position) {
			this.reorderSessions(groupSessions, target, position);
		}
	}

	private commitGroupEdit(group: ISessionGroup, name: string): void {
		this._editingGroupId = undefined;
		const trimmed = name.trim();
		if (trimmed) {
			this._sessionGroupsService.renameGroup(group.id, trimmed);
		}
		this.update();
	}

	private cancelGroupEdit(_group: ISessionGroup): void {
		this._editingGroupId = undefined;
		this.update();
	}

	/**
	 * Reorder a top-level header (group or workspace section) so it lands
	 * before/after the target header. The new order is persisted to the
	 * section-order service. When the dragged header is a workspace it is also
	 * promoted so it stays visible (escapes the "+N more workspaces" capping).
	 */
	private reorderSection(draggedId: string, targetId: string, position: 'before' | 'after', isWorkspace: boolean): void {
		this._sessionSectionOrderService.reorder(this._topLevelOrder, draggedId, targetId, position, isWorkspace ? draggedId : undefined);
	}

	/**
	 * Groups in their current top-to-bottom display order. Groups are fully
	 * user-managed (see {@link ISessionSectionOrderService}); the order defaults
	 * to newest-first and is shared with the list. Used to keep the "Add to
	 * Group" / "Move to Group" menu consistent with the rendered order.
	 */
	getGroupsInDisplayOrder(): ISessionGroup[] {
		const groups = this._sessionGroupsService.getGroups();
		const byId = new Map<string, ISessionGroup>(groups.map(g => [`group:${g.id}`, g]));
		const defaultIds = [...groups]
			.sort((a, b) => b.createdAt - a.createdAt)
			.map(g => `group:${g.id}`);
		return this._sessionSectionOrderService.resolveOrder(defaultIds)
			.map(id => byId.get(id))
			.filter((g): g is ISessionGroup => !!g);
	}

	/**
	 * The set of top-level reorder identities that currently exist (every group,
	 * plus every workspace label present across all sessions, regardless of
	 * grouping mode or capping). Used to garbage-collect stale manual order and
	 * promotion entries. Reads sessions fresh from the management service so it
	 * reflects the latest loaded state even when the list is not visible.
	 */
	private liveSectionOrderIds(): Set<string> {
		const ids = new Set<string>();
		for (const group of this._sessionGroupsService.getGroups()) {
			ids.add(`group:${group.id}`);
		}
		for (const session of this._sessionsManagementService.getSessions()) {
			ids.add(`workspace:${sessionWorkspaceLabel(session)}`);
		}
		return ids;
	}

	private setDropTargetHeader(header: ISessionDropTargetHeader | undefined): void {
		const current = this._dropTargetHeader;
		if (current?.kind === header?.kind && current?.id === header?.id) {
			this.toggleDropTargetHeader(header, header !== undefined);
			return;
		}
		this.toggleDropTargetHeader(current, false);
		this._dropTargetHeader = header;
		this.toggleDropTargetHeader(header, true);
	}

	private toggleDropTargetHeader(header: ISessionDropTargetHeader | undefined, active: boolean): void {
		if (!header) {
			return;
		}
		if (header.kind === 'group') {
			this._groupRenderer.setDropTarget(header.id, active);
		} else {
			this._sectionRenderer.setDropTarget(header.id, active);
		}
	}

	private getMultiSelectedSessions(session: ISession): ISession[] {
		const selection = this.tree.getSelection().filter((s): s is ISession => !!s && isSessionItem(s));
		return selection.includes(session) ? [session, ...selection.filter(s => s !== session)] : [session];
	}

	private onContextMenu(e: ITreeContextMenuEvent<SessionListItem | null>): void {
		const element = e.element;
		if (!element || isSessionSection(element) || isSessionShowMore(element) || isSessionPlaceholder(element)) {
			return;
		}

		if (isSessionGroupItem(element)) {
			this.showGroupContextMenu(element, e.anchor);
			return;
		}

		const selectedSessions = this.getMultiSelectedSessions(element);

		const inGroup = this._sessionGroupsService.getGroupOfSession(element.sessionId) !== undefined;
		const contextOverlay: [string, boolean | string][] = [
			[IsSessionPinnedContext.key, this.isSessionPinned(element)],
			[SessionIsArchivedContext.key, element.isArchived.get()],
			[SessionIsReadContext.key, element.isRead.get()],
			[SessionItemHasBranchNameContext.key, !!element.workspace.get()?.folders[0]?.gitRepository?.branchName?.trim()],
			[SessionItemInGroupContext.key, inGroup],
			[SessionTypeContext.key, element.sessionType],
			[SessionProviderIdContext.key, element.providerId],
			[SessionSupportsRenameContext.key, element.capabilities.get().supportsRename ?? false],
			[SessionSupportsDeleteContext.key, element.capabilities.get().supportsDelete ?? false],
			[SessionHasPullRequestContext.key, !!element.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get()?.pullRequest],
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
			getActions: () => {
				const base = Separator.join(...menu.getActions({ arg: selectedSessions, shouldForwardArgs: true }).map(([, actions]) => actions.map(wrapForExtensions)));
				const groupActions = this.getGroupSessionActions(selectedSessions);
				return groupActions.length > 0 ? [...base, new Separator(), ...groupActions] : base;
			},
			getAnchor: () => e.anchor,
			getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id) ?? undefined,
		});

		menu.dispose();
	}

	/**
	 * Build the group-related context menu actions for the given session(s):
	 * "Create Group", an "Add to Group"/"Move to Group" submenu listing the
	 * groups in display order, and "Remove from Group" when applicable.
	 */
	private getGroupSessionActions(selected: ISession[]): IAction[] {
		const actions: IAction[] = [];
		if (selected.some(session => session.isArchived.get())) {
			return actions;
		}

		actions.push(new Action('sessions.createGroup', localize('createGroupAction', "Create Group"), undefined, true, async () => {
			this.createGroupFromSessions(selected);
		}));

		const currentGroupIds = new Set(selected.map(s => this._sessionGroupsService.getGroupOfSession(s.sessionId)));
		const currentGroupId = currentGroupIds.size === 1 ? [...currentGroupIds][0] : undefined;

		const targetGroups = this.getGroupsInDisplayOrder().filter(g => g.id !== currentGroupId);
		if (targetGroups.length > 0) {
			const subActions = targetGroups.map(g => new Action(`sessions.addToGroup.${g.id}`, g.name, undefined, true, async () => {
				this.addSessionsToGroup(selected, g.id);
			}));
			const label = currentGroupId !== undefined ? localize('moveToGroupAction', "Move to Group") : localize('addToGroupAction', "Add to Group");
			actions.push(new SubmenuAction('sessions.addToGroupSubmenu', label, subActions));
		}

		if (currentGroupId !== undefined) {
			actions.push(new Action('sessions.removeFromGroup', localize('removeFromGroupAction', "Remove from Group"), undefined, true, async () => {
				for (const session of selected) {
					this._sessionGroupsService.removeFromGroup(session.sessionId);
				}
			}));
		}

		return actions;
	}

	private showGroupContextMenu(groupItem: ISessionGroupItem, anchor: ITreeContextMenuEvent<SessionListItem>['anchor']): void {
		const actions: IAction[] = [
			new Action('sessions.renameGroupAction', localize('renameGroupAction', "Rename..."), undefined, true, async () => {
				this.beginRenameGroup(groupItem.group.id);
			}),
			new Action('sessions.deleteGroupAction', localize('deleteGroupAction', "Delete Group"), undefined, true, async () => {
				this._sessionGroupsService.deleteGroup(groupItem.group.id);
			}),
		];
		this.contextMenuService.showContextMenu({
			getActions: () => actions,
			getAnchor: () => anchor,
		});
	}

	resetSectionCollapseState(): void {
		this.storageService.remove(SessionsList.SECTION_COLLAPSE_STATE_KEY, StorageScope.PROFILE);
	}

	// -- Pinning --

	pinSession(session: ISession): void {
		this._sessionsListModelService.pinSession(session);
	}

	private pinSessions(sessions: ISession[], target?: ISession, position?: 'before' | 'after'): void {
		const pinnable = sessions.filter(session => !session.isArchived.get());
		for (const session of pinnable) {
			this._sessionsListModelService.pinSession(session);
		}
		if (target && position) {
			this.reorderSessions(pinnable, target, position);
		}
	}

	unpinSession(session: ISession): void {
		this._sessionsListModelService.unpinSession(session);
	}

	isSessionPinned(session: ISession): boolean {
		return this._sessionsListModelService.isSessionPinned(session);
	}

	/** Whether any registered provider can create quick chats (gates the always-visible "Chats" section). */
	private _someProviderSupportsQuickChats(): boolean {
		return this._sessionsProvidersService.getProviders().some(p => !!p.supportsQuickChats);
	}

	// -- Read/Unread --

	markRead(session: ISession): void {
		this._sessionsManagementService.markRead(session);
	}

	markUnread(session: ISession): void {
		this._sessionsManagementService.markUnread(session);
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
		this.expandedSessionGroups.clear();
		this.expandedMoreFolders = false;
		this.update();
	}

	// Session group capping

	setWorkspaceGroupCapped(capped: boolean): void {
		this.workspaceGroupCapped = capped;
		this.storageService.store(SessionsList.WORKSPACE_GROUP_CAPPED_KEY, capped, StorageScope.PROFILE, StorageTarget.USER);
		if (capped) {
			this.expandedSessionGroups.clear();
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

export function getFirstApprovalAcrossChats(approvalModel: AgentSessionApprovalModel, session: ISession, reader: IReader | undefined,): IAgentSessionApprovalInfo | undefined {
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

export function sortSessions(sessions: ISession[], sorting: SessionsSorting, getSortKey?: (session: ISession, sorting: SessionsSorting) => number): ISession[] {
	const key = getSortKey ?? defaultSortKey;
	return [...sessions].sort((a, b) => key(b, sorting) - key(a, sorting));
}

export interface ISessionLimitResult {
	readonly sessions: readonly ISession[];
	readonly showMore: ISessionShowMore | undefined;
}

export function limitSessionsForList(
	sessions: readonly ISession[],
	limit: number,
	options: { readonly enabled: boolean; readonly expanded: boolean; readonly sectionId: string; readonly sectionLabel: string },
): ISessionLimitResult {
	if (!options.enabled || sessions.length <= limit) {
		return { sessions, showMore: undefined };
	}

	if (options.expanded) {
		return {
			sessions,
			showMore: {
				showMore: true,
				kind: 'sessions',
				mode: 'less',
				sectionId: options.sectionId,
				sectionLabel: options.sectionLabel,
				remainingCount: 0,
			},
		};
	}

	return {
		sessions: sessions.slice(0, limit),
		showMore: {
			showMore: true,
			kind: 'sessions',
			mode: 'more',
			sectionId: options.sectionId,
			sectionLabel: options.sectionLabel,
			remainingCount: sessions.length - limit,
		},
	};
}

function defaultSortKey(session: ISession, sorting: SessionsSorting): number {
	if (sorting === SessionsSorting.Updated) {
		return session.updatedAt.get().getTime();
	}
	return session.createdAt.getTime();
}

export interface IReorderSortInput {
	/** Dragged session ids in display (descending-key) order. */
	readonly draggedIds: readonly string[];
	/** Natural sort key per dragged session (same order as {@link draggedIds}). */
	readonly naturalKeys: readonly number[];
	/** Effective key of the neighbour above the drop point (higher), if any. */
	readonly aboveKey: number | undefined;
	/** Effective key of the neighbour below the drop point (lower), if any. */
	readonly belowKey: number | undefined;
	/** Current time, used when dropping above the first session. */
	readonly now: number;
	/** Spacing used when stepping past an open boundary. */
	readonly fallbackStep: number;
}

/**
 * Compute the manual sort-override changes for a reorder drop. Assigns the
 * dragged block strictly-descending synthetic keys spread between the
 * surrounding neighbours, except when the sessions' natural keys already sort
 * them into the dropped slot — in which case any existing override is dropped.
 */
export function computeReorderSortChanges(input: IReorderSortInput): { set: Map<string, number>; clear: string[] } {
	const { draggedIds, naturalKeys, aboveKey, belowKey, now, fallbackStep } = input;
	const count = draggedIds.length;

	// "Drop the fake value": when every dragged session's natural key already
	// lands strictly inside the surrounding gap (and in descending display
	// order), clear overrides instead of storing synthetic keys.
	const upperFit = aboveKey ?? Number.POSITIVE_INFINITY;
	const lowerFit = belowKey ?? Number.NEGATIVE_INFINITY;
	let naturalFits = true;
	for (let i = 0; i < count; i++) {
		if (!(naturalKeys[i] < upperFit && naturalKeys[i] > lowerFit)) {
			naturalFits = false;
			break;
		}
		if (i > 0 && !(naturalKeys[i] < naturalKeys[i - 1])) {
			naturalFits = false;
			break;
		}
	}

	const set = new Map<string, number>();
	const clear: string[] = [];
	if (naturalFits) {
		for (const id of draggedIds) {
			clear.push(id);
		}
	} else {
		// Spread `count` strictly-descending synthetic keys across the gap. An
		// open top boundary uses the current time so the block sorts to the very
		// top; an open bottom boundary steps below the last key.
		const upper = aboveKey ?? now;
		const lower = belowKey ?? (upper - (count + 1) * fallbackStep);
		const step = (upper - lower) / (count + 1);
		for (let i = 0; i < count; i++) {
			set.set(draggedIds[i], upper - (i + 1) * step);
		}
	}
	return { set, clear };
}

/** Fixed section id for workspace-less "quick chat" sessions. */
export const QUICK_CHATS_SECTION_ID = 'quickchats';

/**
 * Whether a session is a workspace-less "quick chat", per the session's own
 * {@link ISession.isQuickChat} flag (absent means `false`).
 */
export function isQuickChatSession(session: ISession): boolean {
	return session.isQuickChat?.get() ?? false;
}

export function groupSessionsForList(
	sessions: ISession[],
	grouping: SessionsGrouping,
	sorting: SessionsSorting,
	isSessionPinned: (session: ISession) => boolean,
	getSortKey?: (session: ISession, sorting: SessionsSorting) => number,
): ISessionSection[] {
	const sorted = sortSessions(sessions, sorting, getSortKey);

	// Archived wins over pinned (done sessions stay grouped); pinned wins over the
	// quick-chats bucket so a pinned quick chat still surfaces in Pinned.
	const pinned: ISession[] = [];
	const archived: ISession[] = [];
	const quickChats: ISession[] = [];
	const regular: ISession[] = [];
	for (const session of sorted) {
		if (session.isArchived.get()) {
			archived.push(session);
		} else if (isSessionPinned(session)) {
			pinned.push(session);
		} else if (isQuickChatSession(session)) {
			quickChats.push(session);
		} else {
			regular.push(session);
		}
	}

	const sections: ISessionSection[] = [];
	if (pinned.length > 0) {
		sections.push({ id: 'pinned', label: localize('pinned', "Pinned"), sessions: pinned });
	}

	// Quick chats render as a single "Chats" entry directly below Pinned (above
	// the workspace/date groups), regardless of grouping mode.
	if (quickChats.length > 0) {
		sections.push({ id: QUICK_CHATS_SECTION_ID, label: localize('chatsSection', "Chats"), sessions: quickChats });
	}

	sections.push(...(grouping === SessionsGrouping.Workspace
		? groupByWorkspace(regular)
		: groupByDate(regular, sorting, getSortKey)));

	if (archived.length > 0) {
		sections.push({ id: 'archived', label: localize('archived', "Done"), sessions: archived });
	}

	return sections;
}

/** The workspace group label a session belongs to (matches {@link groupByWorkspace}). */
function sessionWorkspaceLabel(session: ISession): string {
	return session.workspace.get()?.label || localize('unknown', "Unknown");
}

export function groupByWorkspace(sessions: ISession[]): ISessionSection[] {
	const groups = new Map<string, ISession[]>();
	for (const session of sessions) {
		const label = sessionWorkspaceLabel(session);
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

/** Maximum number of sessions shown in the "Recent" date section. */
const RECENT_SESSIONS_LIMIT = 10;

export function groupByDate(sessions: ISession[], sorting: SessionsSorting, getSortKey?: (session: ISession, sorting: SessionsSorting) => number): ISessionSection[] {
	const key = getSortKey ?? defaultSortKey;
	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const startOfWeek = startOfToday - 7 * 86_400_000;

	const recent: ISession[] = [];
	const older: ISession[] = [];

	// `sessions` arrive sorted most-recent-first, so the first sessions within
	// the last 7 days (capped at RECENT_SESSIONS_LIMIT) form the "Recent"
	// section; everything else falls into "Older".
	for (const session of sessions) {
		const time = key(session, sorting);

		if (time >= startOfWeek && recent.length < RECENT_SESSIONS_LIMIT) {
			recent.push(session);
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

	addGroup('recent', localize('recent', "Recent"), recent);
	addGroup('older', localize('older', "Older"), older);

	return sections;
}

//#endregion

//#region Flat List

export interface ISessionsFlatListOptions {
	readonly overrideStyles?: IStyleOverride<IListStyles>;
	readonly showSessionHover?: boolean;
	/** Called when a session row is opened (clicked / activated). */
	onSessionOpen(resource: URI, preserveFocus: boolean, sideBySide: boolean): void;
	/**
	 * Approval model tracking pending tool confirmations for the shown sessions.
	 * When omitted the list creates and owns its own; injectable so tests and
	 * fixtures can supply pending approvals without a live chat session.
	 */
	readonly approvalModel?: AgentSessionApprovalModel;
	/**
	 * Supplies the per-session "Fix CI" row for sessions whose pull request has
	 * failing CI checks. Only the blocked-sessions dropdown passes one, so the row
	 * never appears in other lists. When omitted no fix-CI rows are rendered.
	 */
	readonly ciFixModel?: ISessionCIFixModel;
	/**
	 * Maximum number of terminal-command lines shown in a session's approval
	 * prompt. Defaults to the same limit as the main sessions list; the
	 * blocked-sessions dropdown passes a larger value.
	 */
	readonly approvalRowMaxLines?: number;
	/**
	 * Menu used by each session row's inline toolbar. Defaults to the main sessions
	 * item toolbar menu.
	 */
	readonly toolbarMenuId?: MenuId;
	/** Allows focused list surfaces to handle actions from their custom toolbar menu. */
	readonly onToolbarAction?: (action: IAction, session: ISession) => boolean | Promise<boolean>;
}

/**
 * A lightweight, flat sessions list that renders session rows exactly like the
 * main {@link SessionsList} but without any sections, groups or workspace
 * headers. Only the sessions passed to {@link setSessions} are shown. Used by
 * surfaces that need a focused, sectionless view of a specific set of sessions
 * (e.g. the titlebar "N blocked" hover).
 */
export class SessionsFlatList extends Disposable {

	private static readonly ROW_HEIGHT = 54;

	private readonly _onDidChangeContentHeight = this._register(new Emitter<void>());
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;
	private readonly _onDidApproveSession = this._register(new Emitter<IApprovedSession>());
	/** Fires when a session's pending action is approved from its "Allow" button. */
	readonly onDidApproveSession: Event<IApprovedSession> = this._onDidApproveSession.event;
	private readonly tree: WorkbenchObjectTree<SessionListItem, FuzzyScore>;
	private readonly _delegate: SessionsTreeDelegate;
	private _sessions: readonly ISession[] = [];

	constructor(
		container: HTMLElement,
		private readonly options: ISessionsFlatListOptions,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsListModelService private readonly _sessionsListModelService: ISessionsListModelService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMarkdownRendererService markdownRendererService: IMarkdownRendererService,
		@IHoverService hoverService: IHoverService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IVoicePlaybackService voicePlaybackService: IVoicePlaybackService,
	) {
		super();

		// Wrap in `.sessions-list-control` so the row styles scoped to that class
		// (needs-input/pinned row highlights) apply exactly like the main list.
		const listRoot = DOM.append(container, $('.sessions-list-control'));
		const approvalModel = this.options.approvalModel ?? this._register(instantiationService.createInstance(AgentSessionApprovalModel));

		// TEMPORARY (#320480): the row renderer reaches into a Copilot-provider
		// internal to lazily resolve expensive session properties. Resolved via
		// the instantiation service so this file's single suppressed import stays
		// the only reference. See the note on the `IAgentSessionsService` import.
		const agentSessionsService = instantiationService.invokeFunction(accessor => accessor.get(IAgentSessionsService));

		const sessionRenderer = new SessionItemRenderer(
			{
				grouping: () => SessionsGrouping.Date,
				isPinned: s => this._sessionsListModelService.isSessionPinned(s),
				isRead: s => s.isRead.get(),
				visibleSessions: this._sessionsService.visibleSessions,
				getMultiSelectedSessions: s => [s],
				showHover: this.options.showSessionHover ?? true,
				approvalRowMaxLines: this.options.approvalRowMaxLines ?? DEFAULT_APPROVAL_ROW_MAX_LINES,
				toolbarMenuId: this.options.toolbarMenuId ?? SessionItemToolbarMenuId,
				handleToolbarAction: this.options.onToolbarAction,
			},
			approvalModel,
			this.options.ciFixModel,
			instantiationService,
			contextKeyService,
			markdownRendererService,
			hoverService,
			sessionsProvidersService,
			agentSessionsService,
			voicePlaybackService,
		);

		this._delegate = new SessionsTreeDelegate(approvalModel, () => false, this.options.approvalRowMaxLines ?? DEFAULT_APPROVAL_ROW_MAX_LINES, this.options.ciFixModel);

		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<SessionListItem, FuzzyScore>,
			'SessionsFlatList',
			listRoot,
			this._delegate,
			[sessionRenderer],
			{
				accessibilityProvider: new SessionsAccessibilityProvider(),
				identityProvider: {
					getId: (element: SessionListItem) => (element as ISession).resource.toString(),
				},
				horizontalScrolling: false,
				multipleSelectionSupport: false,
				indent: 0,
				overrideStyles: this.options.overrideStyles,
				renderIndentGuides: RenderIndentGuides.None,
				twistieAdditionalCssClass: () => 'force-no-twistie',
			}
		));

		this._register(this.tree.onDidOpen(e => {
			const element = e.element;
			if (!element || !isSessionItem(element)) {
				return;
			}
			this._sessionsManagementService.markRead(element);
			const isLeftClick = DOM.isMouseEvent(e.browserEvent) && e.browserEvent.button === 0;
			const preserveFocus = isLeftClick ? false : (e.editorOptions.preserveFocus ?? false);
			this.options.onSessionOpen(element.resource, preserveFocus, e.sideBySide);
		}));

		this._register(sessionRenderer.onDidChangeItemHeight(session => {
			if (this.tree.hasElement(session)) {
				this.tree.updateElementHeight(session, this._delegate.getHeight(session));
				this._onDidChangeContentHeight.fire();
			}
		}));

		this._register(sessionRenderer.onDidApproveSession(approved => this._onDidApproveSession.fire(approved)));
	}

	setSessions(sessions: readonly ISession[]): void {
		this._sessions = sessions;
		this.tree.setChildren(null, sessions.map(session => ({ element: session })));
	}

	/** The total pixel height required to render all current rows without scrolling. */
	getContentHeight(): number {
		return this._sessions.reduce((total, session) => total + this._delegate.getHeight(session), 0);
	}

	getRowHeight(): number {
		return SessionsFlatList.ROW_HEIGHT;
	}

	layout(height: number, width: number): void {
		this.tree.layout(height, width);
	}

	focus(): void {
		this.tree.domFocus();
	}
}

//#endregion
