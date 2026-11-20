/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Gesture, GestureEvent, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, getChatSessionArchiveActionPresentation, getChatSessionArchiveActionWording } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { AgentSessionApprovalModel } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import type { IAutomationRun } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { type AutomationHistoryState, IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { getShowSharedAutomationsByOthers } from '../../../../workbench/contrib/chat/common/automations/automationViewState.js';
import { ChatAutomationsEnabledContext } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { SessionStatusIcon } from '../../../../workbench/contrib/sessions/browser/sessionStatusIcon.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { formatSessionListTime, SessionItemStatusContext, SessionsFlatList } from '../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { SessionIsArchivedContext, SessionIsReadContext, SessionSupportsRenameContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ARCHIVE_SESSION_COMMAND_ID, MARK_SESSION_READ_COMMAND_ID, MARK_SESSION_UNREAD_COMMAND_ID, RENAME_SESSION_COMMAND_ID, UNARCHIVE_SESSION_COMMAND_ID } from '../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { SESSIONS_SEND_LATER_ENABLED_SETTING } from '../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { isActiveSessionStatus, ISession, SessionStatus } from '../../../../workbench/services/sessions/common/session.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { getAutomationsViewContent } from '../../sessions/browser/views/automationCataloguePresentation.js';
import { getErrorMessage } from './automationCommands.js';
import { automationRunWithLocalProgress } from '../../sessions/browser/views/automationRunProgress.js';

const $ = DOM.$;

export interface IAutomationRunHistoryOptions {
	readonly toolbarMenuId?: MenuId;
	readonly contextMenuId?: MenuId;
	readonly toolbarTelemetrySource?: string;
	readonly showHeader?: boolean;
	readonly openSession?: (resource: URI) => Promise<void>;
}

export function resolveAutomationRunSessions(runs: readonly IAutomationRun[], sessions: readonly ISession[], uriIdentityService: IUriIdentityService): ReadonlyMap<string, ISession> {
	const byResource = new Map(sessions.map(session => [uriIdentityService.extUri.getComparisonKey(session.resource), session]));
	const result = new Map<string, ISession>();
	for (const run of runs) {
		if (run.sessionResource) {
			const session = byResource.get(uriIdentityService.extUri.getComparisonKey(run.sessionResource));
			if (session) {
				result.set(run.id, session);
			}
		}
	}
	return result;
}

export class AutomationHistoryActionsContribution extends Disposable {
	static readonly ID = 'sessions.contrib.automationHistoryActions';
	private readonly actions = this._register(new MutableDisposable<IDisposable>());

	constructor(@IConfigurationService configurationService: IConfigurationService) {
		super();
		const update = () => {
			const wording = getChatSessionArchiveActionWording(configurationService);
			this.actions.value = combinedDisposable(
				registerAutomationHistoryItemActions(wording, Menus.AutomationsHistoryItem, Menus.AutomationsHistoryItemContext, { group: '2_delete', order: 1 }),
				registerAutomationHistoryItemActions(wording, AgentsWindowMenus.AutomationsModalHistoryItem, AgentsWindowMenus.AutomationsModalHistoryContext, { group: '4_manage', order: 2 }),
			);
		};
		update();
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(ChatSessionArchiveActionWordingSettingId)) {
				update();
			}
		}));
	}
}

const STOP_AUTOMATION_RUN_SESSION_COMMAND_ID = 'sessions.automations.stopRunSession';

const OPEN_AUTOMATION_RUN_ON_GITHUB_COMMAND_ID = 'sessions.automations.openRunOnGitHub';

const DELETE_AUTOMATION_HISTORY_COMMAND_ID = 'sessions.automations.deleteHistory';

const RETRY_DELETE_AUTOMATION_HISTORY_COMMAND_ID = 'sessions.automations.retryDeleteHistory';

const AutomationRunHasExternalResourceContext = new RawContextKey<boolean>('sessionsAutomationRunHasExternalResource', false);

const AutomationRunCanStopContext = new RawContextKey<boolean>('sessionsAutomationRunCanStop', false);

const AutomationRunStoppingContext = new RawContextKey<boolean>('sessionsAutomationRunStopping', false);

const AutomationRunCanArchiveContext = new RawContextKey<boolean>('sessionsAutomationRunCanArchive', true);

function canArchiveAutomationSession(session: ISession, reader?: IReader): boolean {
	const terminal = (status: SessionStatus) => status === SessionStatus.Completed || status === SessionStatus.Error;
	return terminal(session.status.read(reader))
		&& terminal(session.mainChat.read(reader).status.read(reader))
		&& session.chats.read(reader).every(chat => terminal(chat.status.read(reader)));
}

const AutomationRunHistoryStateContext = new RawContextKey<string>('sessionsAutomationRunHistoryState', '');

const AutomationRunCanDeleteHistoryContext = new RawContextKey<boolean>('sessionsAutomationRunCanDeleteHistory', false);

interface IAutomationHistoryItem {
	readonly run: IAutomationRun;
	readonly session: ISession;
}

interface IAutomationHistoryGroup {
	readonly element: HTMLElement;
	readonly header: HTMLElement;
	readonly runsContainer: HTMLElement;
	readonly temporaryRows: DisposableMap<string, IAutomationTemporaryRunRow>;
	readonly sessionLists: DisposableMap<string, IAutomationHistorySessionList>;
	readonly disposables: DisposableStore;
}

interface IAutomationHistoryOwnerRow extends IDisposable {
	readonly element: HTMLElement;
	update(run: IAutomationRun, name: string, state: AutomationHistoryState, canDelete: boolean): void;
}

interface IAutomationHistorySessionList extends IDisposable {
	readonly listContainer: HTMLElement;
	readonly list: SessionsFlatList;
	readonly runsBySession: Map<string, IAutomationRun>;
	sessions: readonly ISession[];
}

interface IAutomationTemporaryRunRow extends IDisposable {
	readonly element: HTMLElement;
	readonly title: HTMLElement;
	focus(): void;
	update(run: IAutomationRun, title: string): void;
}

class AutomationRunSession implements ISession {
	readonly run: ISettableObservable<IAutomationRun>;
	private readonly progress = derived(this, reader => automationRunWithLocalProgress(this.run.read(reader), this.chatModels.read(reader), reader));
	readonly status = derived(this, reader => {
		const run = this.progress.read(reader);
		return run.status === 'completed' ? SessionStatus.Completed
			: run.status === 'failed' ? SessionStatus.Error
				: run.needsInput ? SessionStatus.NeedsInput : SessionStatus.InProgress;
	});
	readonly description = derived(this, reader => {
		const state = this.status.read(reader);
		if (state === SessionStatus.Completed || state === SessionStatus.Error) {
			return undefined;
		}
		const liveDescription = this.session.status.read(reader) === state ? this.session.description.read(reader) : undefined;
		const run = this.progress.read(reader);
		return liveDescription ?? new MarkdownString().appendText(run.statusDescription ?? (run.status === 'pending'
			? localize('automationRunQueued', "Queued on GitHub")
			: localize('automationRunCloudRunning', "Running on GitHub")));
	});
	readonly updatedAt = derived(this, reader => {
		const run = this.progress.read(reader);
		return new Date(run.updatedAt ?? run.completedAt ?? this.session.updatedAt.read(reader).getTime());
	});
	/** Outcome shown for a completed run, such as a cancellation. */
	readonly completedStatusMessage = derived(this, reader => {
		const run = this.progress.read(reader);
		return run.status === 'completed' ? run.statusDescription : undefined;
	});

	constructor(readonly session: ISession, run: IAutomationRun, private readonly chatModels: IObservable<readonly IChatModel[]>) {
		this.run = observableValue(this, run);
	}

	get sessionId() { return this.session.sessionId; }
	get resource() { return this.session.resource; }
	get providerId() { return this.session.providerId; }
	get sessionType() { return this.session.sessionType; }
	get harness() { return this.session.harness; }
	get environment() { return this.session.environment; }
	get application() { return this.session.application; }
	get icon() { return this.session.icon; }
	get createdAt() { return this.session.createdAt; }
	get workspace() { return this.session.workspace; }
	get hasGitRepository() { return this.session.hasGitRepository; }
	get worktreePending() { return this.session.worktreePending; }
	get isQuickChat() { return this.session.isQuickChat; }
	get isAutomation() { return this.session.isAutomation; }
	get isExternal() { return this.session.isExternal; }
	get remoteConnectionStatus() { return this.session.remoteConnectionStatus; }
	get createdBySession() { return this.session.createdBySession; }
	get title() { return this.session.title; }
	get completedStateIcon() { return this.session.completedStateIcon; }
	get changesSummary() { return this.session.changesSummary; }
	get artifacts() { return this.session.artifacts; }
	get modelId() { return this.session.modelId; }
	get mode() { return this.session.mode; }
	get loading() { return this.session.loading; }
	get isNewSessionRequestInProgress() { return this.session.isNewSessionRequestInProgress; }
	get preparationProgress() { return this.session.preparationProgress; }
	get isRead() { return this.session.isRead; }
	get isArchived() { return this.session.isArchived; }
	get lastTurnEnd() { return this.session.lastTurnEnd; }
	get chats() { return this.session.chats; }
	get mainChat() { return this.session.mainChat; }
	get capabilities() { return this.session.capabilities; }
}

export class AutomationHistorySection extends Disposable {

	private static readonly INITIAL_RUN_COUNT = 10;
	private static readonly PAGE_SIZE = 20;

	private readonly container: HTMLElement;
	private readonly ownersContainer: HTMLElement;
	private readonly groupsContainer: HTMLElement;
	private readonly headerDisposables = this._register(new DisposableStore());
	private readonly persistentGroups = new Map<string, IAutomationHistoryGroup>();
	private readonly persistentOwnerRows = this._register(new DisposableMap<string, IAutomationHistoryOwnerRow>());
	private readonly runFocusTargets = new Map<string, { readonly list: SessionsFlatList; readonly container: HTMLElement; readonly session: ISession }>();
	private readonly approvalModel: AgentSessionApprovalModel;
	private renderedFocusableRunIds: string[] = [];
	private pendingFocusRunId: string | undefined;
	private shouldRestoreFocus = false;
	private headerRow: HTMLElement | undefined;
	private markAllButton: Button | undefined;
	private readonly currentRuns = observableValue<readonly IAutomationRun[]>(this, []);
	private readonly currentSessions = observableValue<ReadonlyMap<string, ISession>>(this, new Map());
	private readonly cloudSessions = new Map<string, AutomationRunSession>();
	private readonly stoppingRuns = observableValue<ReadonlySet<string>>(this, new Set());
	private readonly chatModels: IObservable<readonly IChatModel[]>;
	private readonly visibleRunCount = observableValue(this, AutomationHistorySection.INITIAL_RUN_COUNT);
	private readonly showMoreButton: Button;
	private firstHiddenRunId: string | undefined;
	private nextVisibleRunCount = AutomationHistorySection.INITIAL_RUN_COUNT;

	override dispose(): void {
		this.disposeAllGroups();
		this.cloudSessions.clear();
		super.dispose();
	}

	constructor(
		parent: HTMLElement,
		private readonly focusFallback: HTMLElement,
		private readonly isMarkingAllRead: ISettableObservable<boolean>,
		private readonly options: IAutomationRunHistoryOptions,
		@IAutomationService private readonly automationService: IAutomationService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IHoverService private readonly hoverService: IHoverService,
		@IChatService chatService: IChatService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.chatModels = chatService.chatModels.map(models => [...models]);
		this.container = DOM.append(parent, $('.automations-history'));
		this.ownersContainer = DOM.append(this.container, $('.automations-history-owners'));
		this.groupsContainer = DOM.append(this.container, $('.automations-history-groups'));
		this.approvalModel = this._register(this.instantiationService.createInstance(AgentSessionApprovalModel));
		this.showMoreButton = this._register(new Button(this.container, { ...defaultButtonStyles, secondary: true }));
		this.showMoreButton.element.classList.add('automations-history-show-more');
		this.showMoreButton.label = localize('showMoreHistory', "Show More");
		this._register(autorun(reader => {
			this.showMoreButton.enabled = !this.isMarkingAllRead.read(reader);
		}));
		this._register(this.showMoreButton.onDidClick(() => {
			this.pendingFocusRunId = this.firstHiddenRunId;
			this.shouldRestoreFocus = true;
			this.visibleRunCount.set(this.nextVisibleRunCount, undefined);
			status(localize('moreHistoryShown', "More run history shown."));
		}));
	}

	render(allRuns: readonly IAutomationRun[], sessions: ReadonlyMap<string, ISession>, reader: IReader): void {
		const activeElement = DOM.getActiveElement();
		const historyOwnedFocus = DOM.isHTMLElement(activeElement) && this.groupsContainer.contains(activeElement);
		const focusedList = historyOwnedFocus ? [...this.runFocusTargets.values()].find(target => target.container.contains(activeElement))?.list : undefined;
		const focusedSession = focusedList?.getFocusedSession();
		const focused = focusedSession ? [...this.runFocusTargets].find(([, target]) =>
			target.list === focusedList && target.session === focusedSession) : undefined;
		// Runs that continue a session share it: show the session once, for its newest run.
		const shownSessions = new Set<ISession>();
		const runs = allRuns.filter(run => {
			const session = sessions.get(run.id);
			if (session && shownSessions.has(session)) {
				return false;
			}
			if (session) {
				shownSessions.add(session);
			}
			return true;
		});
		const runIds = new Set(runs.map(run => run.id));
		for (const id of this.cloudSessions.keys()) {
			if (!runIds.has(id) || !sessions.has(id)) {
				this.cloudSessions.delete(id);
			}
		}
		let focusedTemporaryRunId: string | undefined;
		for (const group of this.persistentGroups.values()) {
			for (const [id, row] of group.temporaryRows) {
				if (DOM.isAncestorOfActiveElement(row.element)) {
					focusedTemporaryRunId = id;
					if (sessions.has(id) || !runIds.has(id)) {
						this.pendingFocusRunId = id;
						this.shouldRestoreFocus = true;
					}
				}
			}
		}
		const sessionRuns = runs.filter(run => sessions.has(run.id));
		const historySessions = new Map(this.resolveSessionItems(sessionRuns, sessions).map(item => [item.run.id, item.session]));
		const visibleRuns = runs.filter(run =>
			sessions.has(run.id)
			|| !!run.externalResource
		);
		const historyOwners = new Map<string, IAutomationRun>();
		for (const run of runs) {
			if (this.automationService.getAutomationHistoryState?.(run.automationId) !== undefined && !historyOwners.has(run.automationId)) {
				historyOwners.set(run.automationId, run);
			}
		}
		this.updateHistoryOwners(historyOwners);
		transaction(tx => {
			this.currentRuns.set(sessionRuns, tx);
			this.currentSessions.set(historySessions, tx);
		});
		const visibleRunCount = this.visibleRunCount.read(reader);
		this.firstHiddenRunId = undefined;
		this.nextVisibleRunCount = visibleRunCount;
		let hiddenRunCount = 0;
		const displayedRuns = visibleRuns.filter((run, index) => {
			const session = historySessions.get(run.id);
			const active = session
				? isActiveSessionStatus(session.status.read(reader)) || session instanceof AutomationRunSession && isActiveSessionStatus(session.session.status.read(reader))
				: run.status === 'pending' || run.status === 'running' || run.needsInput;
			const keepsFocus = session && session === focused?.[1].session || run.id === focusedTemporaryRunId;
			if (index < visibleRunCount || active || keepsFocus) {
				return true;
			}
			this.firstHiddenRunId ??= run.id;
			if (++hiddenRunCount <= AutomationHistorySection.PAGE_SIZE) {
				this.nextVisibleRunCount = index + 1;
			}
			return false;
		});
		if (!hiddenRunCount && DOM.isAncestorOfActiveElement(this.showMoreButton.element)) {
			this.focusFallback.focus();
		}
		this.showMoreButton.element.style.display = hiddenRunCount ? '' : 'none';
		this.showMoreButton.element.setAttribute('aria-label', localize('showMoreHistoryLabel', "Show more run history, {0} remaining", hiddenRunCount));
		this.runFocusTargets.clear();
		this.renderedFocusableRunIds = [];

		if (visibleRuns.length === 0 && historyOwners.size === 0) {
			if (historyOwnedFocus) {
				this.focusFallback.focus();
			}
			this.container.style.display = 'none';
			this.disposeAllGroups();
			this.restoreFocusAfterRender();
			return;
		}

		this.container.style.display = '';
		this.ensureHeader();

		const groups = groupRunsByDate(displayedRuns);
		const activeKeys = new Set(groups.map(group => group.key));
		for (const [key, entry] of this.persistentGroups) {
			if (!activeKeys.has(key)) {
				entry.disposables.dispose();
				entry.element.remove();
				this.persistentGroups.delete(key);
			}
		}

		let index = 0;

		for (const group of groups) {
			let entry = this.persistentGroups.get(group.key);
			if (entry) {
				if (entry.header.textContent !== group.label) {
					entry.header.textContent = group.label;
				}
			} else {
				entry = this.createGroup(group.key, group.label);
			}
			this.updateGroupRuns(entry, group.runs, historySessions);

			const currentElement = this.groupsContainer.children.item(index);
			if (currentElement !== entry.element) {
				this.groupsContainer.insertBefore(entry.element, currentElement);
				for (const block of entry.sessionLists.values()) {
					this.layoutSessionList(block.listContainer, block.list);
				}
			}
			index++;
		}

		this.restoreFocusAfterRender();
		if (historyOwnedFocus && DOM.isHTMLElement(activeElement)) {
			// A newer run of a shared session takes over its row, possibly in another date group.
			const target = focused && (this.runFocusTargets.get(focused[0])
				?? [...this.runFocusTargets.values()].find(candidate => isEqual(candidate.session.resource, focused[1].session.resource)));
			if (target && (target.list !== focusedList || target.list.getFocusedSession() !== target.session || !activeElement.isConnected)) {
				target.list.focusSession(target.session, true);
			} else if (!this.groupsContainer.contains(DOM.getActiveElement())) {
				if (activeElement.isConnected) {
					activeElement.focus();
				} else if (target) {
					target.list.focusSession(target.session, true);
				} else {
					this.focusFallback.focus();
				}
			}
		}
	}

	layout(): void {
		for (const entry of this.persistentGroups.values()) {
			for (const block of entry.sessionLists.values()) {
				this.layoutSessionList(block.listContainer, block.list);
			}
		}
	}

	private ensureHeader(): void {
		if (this.options.showHeader === false || this.headerRow) {
			return;
		}
		this.headerDisposables.clear();
		this.headerRow = DOM.$('.automations-history-header');
		this.container.insertBefore(this.headerRow, this.ownersContainer);
		const headerLabel = DOM.append(this.headerRow, $('span'));
		headerLabel.textContent = localize('historyHeader', "History");

		this.markAllButton = this.headerDisposables.add(new Button(this.headerRow, {
			...defaultButtonStyles,
			secondary: true,
			title: localize('markAllRead', "Mark all as read"),
		}));
		this.markAllButton.label = localize('markAllRead', "Mark all as read");
		this.markAllButton.element.classList.add('automations-mark-all-read');
		this.headerDisposables.add(this.markAllButton.onDidClick(() => {
			void this.markAllRunsRead();
		}));
		this.headerDisposables.add(autorun(reader => {
			const runs = this.currentRuns.read(reader);
			const sessions = this.currentSessions.read(reader);
			const isMarkingAllRead = this.isMarkingAllRead.read(reader);
			const hasUnread = runs.some(run => isUnreadAutomationRun(run, sessions.get(run.id), reader));
			this.markAllButton!.element.style.display = hasUnread ? '' : 'none';
			this.markAllButton!.enabled = hasUnread && !isMarkingAllRead;
		}));
	}

	private resolveSessionItems(runs: readonly IAutomationRun[], sessions: ReadonlyMap<string, ISession>): IAutomationHistoryItem[] {
		const items: IAutomationHistoryItem[] = [];
		for (const run of runs) {
			const session = sessions.get(run.id);
			if (session) {
				if (run.externalResource) {
					let projected = this.cloudSessions.get(run.id);
					if (!projected || projected.session !== session) {
						projected = new AutomationRunSession(session, run, this.chatModels);
						this.cloudSessions.set(run.id, projected);
					}
					projected.run.set(run, undefined);
					items.push({ run, session: projected });
				} else {
					items.push({ run, session });
				}
			}
		}
		return items;
	}

	private createGroup(key: string, label: string): IAutomationHistoryGroup {
		const disposables = new DisposableStore();
		const element = $('.automations-history-group');
		const header = DOM.append(element, $('.automations-history-group-header'));
		header.textContent = label;
		const runsContainer = DOM.append(element, $('.automations-history-group-runs'));
		const entry: IAutomationHistoryGroup = {
			element,
			header,
			runsContainer,
			temporaryRows: disposables.add(new DisposableMap()),
			sessionLists: disposables.add(new DisposableMap()),
			disposables,
		};
		this.persistentGroups.set(key, entry);
		return entry;
	}

	private updateHistoryOwners(owners: ReadonlyMap<string, IAutomationRun>): void {
		for (const id of this.persistentOwnerRows.keys()) {
			if (!owners.has(id)) {
				const row = this.persistentOwnerRows.get(id);
				if (row && DOM.isAncestorOfActiveElement(row.element)) {
					this.focusFallback.focus();
				}
				this.persistentOwnerRows.deleteAndDispose(id);
			}
		}
		let index = 0;
		for (const [id, run] of owners) {
			const state = this.automationService.getAutomationHistoryState?.(id);
			if (!state) {
				continue;
			}
			let row = this.persistentOwnerRows.get(id);
			if (!row) {
				row = this.createHistoryOwnerRow(run);
				this.persistentOwnerRows.set(id, row);
			}
			row.update(run, this.getAutomationName(run), state, this.automationService.canDeleteAutomationHistory?.(id) === true);
			const current = this.ownersContainer.children.item(index++);
			if (current !== row.element) {
				this.ownersContainer.insertBefore(row.element, current);
			}
		}
	}

	private createHistoryOwnerRow(initialRun: IAutomationRun): IAutomationHistoryOwnerRow {
		let run = initialRun;
		const disposables = new DisposableStore();
		const element = DOM.append(this.ownersContainer, $('.automations-history-owner.session-item', { role: 'group' }));
		const main = DOM.append(element, $('.session-main'));
		const titleRow = DOM.append(main, $('.session-title-row'));
		const title = DOM.append(titleRow, $('span.session-title'));
		const detailsRow = DOM.append(main, $('.session-details-row'));
		const description = DOM.append(detailsRow, $('span.session-description'));
		const actions = DOM.append(element, $('.automations-run-actions'));
		const button = disposables.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
		disposables.add(button.onDidClick(() => void this.confirmAndDeleteHistory(run)));
		return {
			element,
			update: (nextRun, name, state, canDelete) => {
				run = nextRun;
				title.textContent = name;
				description.textContent = state === 'deleting'
					? localize('automationHistoryDeleting', "Deleting run history...")
					: state === 'interrupted'
						? localize('automationHistoryDeletionInterrupted', "Run history deletion was interrupted.")
						: localize('automationHistoryRetained', "Run history is retained.");
				button.label = state === 'deleting'
					? localize('deletingHistory', "Deleting...")
					: state === 'interrupted'
						? localize('retryDeleteHistory', "Retry Delete Run History")
						: localize('deleteHistory', "Delete Run History");
				button.enabled = state !== 'deleting' && canDelete;
				element.setAttribute('aria-label', localize('automationHistoryOwnerState', "{0}, {1}", name, description.textContent));
			},
			dispose: () => {
				disposables.dispose();
				element.remove();
			},
		};
	}

	private createSessionList(container: HTMLElement): IAutomationHistorySessionList {
		const disposables = new DisposableStore();
		const listContainer = DOM.append(container, $('.automations-run-session-list'));
		const runsBySession = new Map<string, IAutomationRun>();
		const list = disposables.add(this.instantiationService.createInstance(SessionsFlatList, listContainer, {
			showSessionHover: false,
			alwaysConsumeMouseWheel: false,
			useCompactQuickChatRows: false,
			toolbarMenuId: this.options.toolbarMenuId ?? Menus.AutomationsHistoryItem,
			toolbarTelemetrySource: this.options.toolbarTelemetrySource ?? 'automationsView.historyRow',
			contextMenuId: this.options.contextMenuId ?? Menus.AutomationsHistoryItemContext,
			markSessionReadOnOpen: false,
			approvalModel: this.approvalModel,
			onSessionOpen: resource => void this.openRunSession(resource),
			onToolbarAction: (action, session) => this.handleSessionAction(action, session, runsBySession),
			onContextMenuAction: (action, session) => this.handleSessionAction(action, session, runsBySession),
			showMetadataWhileActive: session => runsBySession.get(session.resource.toString())?.externalResource !== undefined,
			getCompletedStatusMessage: (session, reader) => session instanceof AutomationRunSession ? session.completedStatusMessage.read(reader) : undefined,
			getAdditionalContextKeys: (session, reader) => {
				const run = this.currentRuns.read(reader).find(run => isEqual(run.sessionResource, session.resource));
				return [
					[AutomationRunHasExternalResourceContext.key, run?.externalResource !== undefined],
					[AutomationRunCanStopContext.key, run?.externalResource !== undefined && this.automationService.canStopRun?.(run) === true],
					[AutomationRunStoppingContext.key, run !== undefined && this.stoppingRuns.read(reader).has(run.id)],
					[AutomationRunCanArchiveContext.key, !run?.externalResource || canArchiveAutomationSession(session, reader)],
					[AutomationRunHistoryStateContext.key, run ? this.automationService.getAutomationHistoryState?.(run.automationId) ?? '' : ''],
					[AutomationRunCanDeleteHistoryContext.key, run ? this.automationService.canDeleteAutomationHistory?.(run.automationId) === true : false],
				];
			},
		}));
		disposables.add(list.onDidChangeContentHeight(() => this.layoutSessionList(listContainer, list)));
		return {
			listContainer, list, runsBySession, sessions: [],
			dispose: () => {
				disposables.dispose();
				listContainer.remove();
			},
		};
	}

	private updateGroupRuns(entry: IAutomationHistoryGroup, runs: readonly IAutomationRun[], sessions: ReadonlyMap<string, ISession>): void {
		const activeRunIds = new Set(runs.filter(run => !sessions.has(run.id)).map(run => run.id));
		for (const runId of entry.temporaryRows.keys()) {
			if (!activeRunIds.has(runId)) {
				entry.temporaryRows.deleteAndDispose(runId);
			}
		}

		const activeLists = new Set<string>();
		let listKey = '';
		let childIndex = 0;
		for (let index = 0; index < runs.length;) {
			const run = runs[index];
			let element: HTMLElement;
			if (sessions.has(run.id)) {
				const items: IAutomationHistoryItem[] = [];
				while (index < runs.length) {
					const session = sessions.get(runs[index].id);
					if (!session) {
						break;
					}
					items.push({ run: runs[index++], session });
				}
				activeLists.add(listKey);
				let block = entry.sessionLists.get(listKey);
				if (!block) {
					block = this.createSessionList(entry.runsContainer);
					entry.sessionLists.set(listKey, block);
				}
				this.updateGroupSessions(block, items);
				element = block.listContainer;
				for (const item of items) {
					this.renderedFocusableRunIds.push(item.run.id);
					this.runFocusTargets.set(item.run.id, { list: block.list, container: block.listContainer, session: item.session });
				}
			} else {
				const title = this.getAutomationName(run);
				let row = entry.temporaryRows.get(run.id);
				if (!row) {
					row = this.createTemporaryRunRow(run, title);
					entry.temporaryRows.set(run.id, row);
				}
				row.update(run, title);
				element = row.element;
				listKey = run.id;
				index++;
			}
			const currentElement = entry.runsContainer.children.item(childIndex++);
			if (currentElement !== element) {
				entry.runsContainer.insertBefore(element, currentElement);
			}
		}
		for (const key of entry.sessionLists.keys()) {
			if (!activeLists.has(key)) {
				entry.sessionLists.deleteAndDispose(key);
			}
		}
	}

	private createTemporaryRunRow(run: IAutomationRun, title: string): IAutomationTemporaryRunRow {
		let currentRun = run;
		const disposables = new DisposableStore();
		const element = $('.automations-temporary-run.session-item');
		element.setAttribute('role', 'group');
		const icon = DOM.append(element, $('.session-icon'));
		const statusIcon = disposables.add(this.instantiationService.createInstance(SessionStatusIcon, icon));
		statusIcon.setStatus(SessionStatus.InProgress, true, false);
		const main = DOM.append(element, $('.session-main'));
		const titleRow = DOM.append(main, $('.session-title-row'));
		const titleElement = DOM.append(titleRow, $('span.session-title'));
		titleElement.textContent = title;
		const detailsRow = DOM.append(main, $('.session-details-row'));
		const repositoryLabel = run.externalResource ? DOM.append(detailsRow, $('span.session-details-icon')) : undefined;
		if (repositoryLabel) {
			DOM.append(repositoryLabel, $(`span${ThemeIcon.asCSSSelector(Codicon.cloudCompact)}`, { 'aria-hidden': 'true' }));
		}
		const repository = run.externalResource ? DOM.append(detailsRow, $('span.session-badge')) : undefined;
		const statusSeparator = run.externalResource ? DOM.append(detailsRow, $('span.session-separator', { 'aria-hidden': 'true' })) : undefined;
		const description = DOM.append(detailsRow, $('span.session-description'));
		if (run.externalResource) {
			DOM.append(detailsRow, $('span.session-separator.has-separator', { 'aria-hidden': 'true' }));
		}
		const timestamp = run.externalResource ? DOM.append(detailsRow, $('span.session-time')) : undefined;
		let timeDate = new Date(run.updatedAt ?? run.completedAt ?? run.startedAt);
		if (timestamp) {
			const targetWindow = DOM.getWindow(timestamp);
			const interval = targetWindow.setInterval(() => timestamp.textContent = formatSessionListTime(timeDate), 60_000);
			disposables.add(toDisposable(() => targetWindow.clearInterval(interval)));
		}
		const titleHover = disposables.add(new MutableDisposable());
		const detailsHover = disposables.add(new MutableDisposable());
		let updateActions: (() => void) | undefined;
		let focus = () => this.focusFallback.focus();
		if (run.externalResource) {
			const actions = DOM.append(element, $('.automations-run-actions'));
			const toolbar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar, actions, { telemetrySource: 'automationRun' }));
			focus = () => currentRun.sessionResource ? main.focus() : toolbar.focus();
			disposables.add(Gesture.addTarget(element));
			for (const eventType of [DOM.EventType.CLICK, TouchEventType.Tap]) {
				disposables.add(DOM.addDisposableListener(element, eventType, event => {
					const target = (event as GestureEvent).initialTarget ?? event.target;
					if (target instanceof Node && DOM.isAncestor(target, actions)) {
						return;
					}
					if (currentRun.sessionResource) {
						void this.openRunSession(currentRun.sessionResource);
					}
				}));
			}
			disposables.add(DOM.addDisposableListener(main, DOM.EventType.KEY_DOWN, event => {
				if (event.target === main && currentRun.sessionResource && (event.key === 'Enter' || event.key === ' ')) {
					DOM.EventHelper.stop(event, true);
					void this.openRunSession(currentRun.sessionResource);
				}
			}));
			const external = disposables.add(new Action(OPEN_AUTOMATION_RUN_ON_GITHUB_COMMAND_ID, localize('automationOpenExternal', "Open on GitHub"), ThemeIcon.asClassName(Codicon.linkExternal), true, () => this.openRunOnGitHub(currentRun)));
			const stop = disposables.add(new Action(STOP_AUTOMATION_RUN_SESSION_COMMAND_ID, localize('stopAutomationRunSessionAction', "Stop"), ThemeIcon.asClassName(Codicon.stopCircle), true, async () => {
				await this.stopCloudRun(currentRun);
			}));
			const archivePresentation = getChatSessionArchiveActionPresentation(getChatSessionArchiveActionWording(this.configurationService));
			const archive = disposables.add(new Action(ARCHIVE_SESSION_COMMAND_ID,
				typeof archivePresentation.archive.title === 'string' ? archivePresentation.archive.title : archivePresentation.archive.title.value,
				ThemeIcon.asClassName(archivePresentation.archive.icon), true, async () => {
					archive.enabled = false;
					try {
						const resource = currentRun.sessionResource && await this.sessionsManagementService.resolveSessionResource(currentRun.sessionResource, 'open');
						const session = resource && this.sessionsManagementService.getSession(resource);
						if (!session) {
							throw new Error(localize('automationRunSessionUnavailable', "The cloud session is not available yet. Try again or open it on GitHub."));
						}
						if (!canArchiveAutomationSession(session)) {
							throw new Error(localize('automationRunArchiveActive', "Wait for the cloud run to finish before marking it as done. Use Stop to cancel it."));
						}
						await this.sessionsManagementService.archiveSession(session);
					} catch (error) {
						if (!isCancellationError(error)) {
							this.logService.error('[Automations] Failed to archive cloud run', error);
							await this.dialogService.error(localize('automationRunArchiveFailed', "Failed to archive the automation run."), getErrorMessage(error));
						}
					} finally {
						if (!disposables.isDisposed) {
							archive.enabled = true;
						}
					}
				}));
			let actionsKey: string | undefined;
			updateActions = () => {
				if (disposables.isDisposed) {
					return;
				}
				const canStop = this.automationService.canStopRun?.(currentRun) === true;
				const canOpen = currentRun.sessionResource !== undefined;
				const canArchive = canOpen && (currentRun.status === 'completed' || currentRun.status === 'failed');
				stop.enabled = canStop && !this.stoppingRuns.get().has(currentRun.id);
				const key = `${canOpen}:${canStop}:${canArchive}`;
				if (actionsKey !== key) {
					const hadFocus = actions.contains(DOM.getActiveElement());
					actionsKey = key;
					toolbar.setActions([external, ...(canStop ? [stop] : []), ...(canArchive ? [archive] : [])]);
					if (hadFocus) {
						toolbar.focus(0);
					}
				}
			};
			disposables.add(autorun(reader => {
				this.stoppingRuns.read(reader);
				updateActions?.();
			}));
		}
		return {
			element,
			title: titleElement,
			focus,
			update: (run, title) => {
				currentRun = run;
				titleElement.textContent = title;
				const label = run.externalResource ? run.statusDescription ?? (
					run.status === 'pending' ? localize('automationRunQueued', "Queued on GitHub")
						: run.status === 'running' ? localize('automationRunCloudRunning', "Running on GitHub")
							: run.status === 'completed' ? localize('automationRunCloudCompleted', "Completed on GitHub")
								: localize('automationRunCloudFailed', "Failed on GitHub: {0}", run.errorMessage ?? ''))
					: localize('automationRunWorking', "Working...");
				description.textContent = run.externalResource && run.status === 'completed' && !run.statusDescription ? '' : label;
				statusSeparator?.classList.toggle('has-separator', !!description.textContent);
				timeDate = new Date(run.updatedAt ?? run.completedAt ?? run.startedAt);
				let details = label;
				if (repository && timestamp && run.externalResource) {
					repository.textContent = run.externalResource.path.split('/').filter(Boolean).slice(0, 2).join('/');
					timestamp.textContent = formatSessionListTime(timeDate);
					details = localize('automationRunDetails', "{0}, {1}, {2}", repository.textContent, label, timeDate.toLocaleString());
				}
				element.setAttribute('aria-label', localize('automationRunState', "{0}, {1}", title, details));
				if (run.externalResource) {
					const canOpen = run.sessionResource !== undefined;
					element.classList.toggle('can-open', canOpen);
					if (canOpen) {
						main.tabIndex = 0;
						main.setAttribute('role', 'button');
						main.setAttribute('aria-label', localize('automationOpenRunSession', "Open session: {0}, {1}", title, details));
					} else {
						main.removeAttribute('tabindex');
						main.removeAttribute('role');
						main.removeAttribute('aria-label');
					}
				}
				titleHover.value = this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), titleElement, title);
				detailsHover.value = this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), detailsRow, details);
				if (run.externalResource) {
					statusIcon.setStatus(run.status === 'completed' ? SessionStatus.Completed : run.status === 'failed' ? SessionStatus.Error : run.needsInput ? SessionStatus.NeedsInput : SessionStatus.InProgress, true, false);
				}
				updateActions?.();
			},
			dispose: () => {
				disposables.dispose();
				element.remove();
			},
		};
	}

	private updateGroupSessions(
		entry: IAutomationHistorySessionList,
		items: readonly IAutomationHistoryItem[],
	): void {
		entry.runsBySession.clear();
		for (const item of items) {
			entry.runsBySession.set(item.session.resource.toString(), item.run);
		}

		const sessions = items.map(item => item.session);
		if (entry.sessions.length === sessions.length && entry.sessions.every((session, index) => session === sessions[index])) {
			return;
		}
		entry.sessions = sessions;
		entry.list.setSessions(sessions);
		this.layoutSessionList(entry.listContainer, entry.list);
	}

	private disposeAllGroups(): void {
		for (const [key, entry] of this.persistentGroups) {
			entry.disposables.dispose();
			entry.element.remove();
			this.persistentGroups.delete(key);
		}
		if (this.headerRow) {
			this.headerRow.remove();
			this.headerRow = undefined;
			this.markAllButton = undefined;
			this.headerDisposables.clear();
		}
	}

	private layoutSessionList(container: HTMLElement, list: SessionsFlatList): void {
		const height = list.getContentHeight();
		const width = container.clientWidth;
		container.style.height = `${height}px`;
		list.layout(height, width);
	}

	private async handleSessionAction(action: IAction, session: ISession, runsBySession: ReadonlyMap<string, IAutomationRun>): Promise<boolean> {
		const run = runsBySession.get(session.resource.toString());
		if (!run) {
			return false;
		}
		switch (action.id) {
			case OPEN_AUTOMATION_RUN_ON_GITHUB_COMMAND_ID:
				await this.openRunOnGitHub(run);
				return true;
			case STOP_AUTOMATION_RUN_SESSION_COMMAND_ID:
				if (run.externalResource) {
					await this.stopCloudRun(run);
					return true;
				}
				action.enabled = false;
				await this.stopRunSession(session, this.getAutomationName(run), action);
				return true;
			case ARCHIVE_SESSION_COMMAND_ID:
				if (run.externalResource && !canArchiveAutomationSession(session)) {
					await this.dialogService.info(localize('automationRunArchiveActive', "Wait for the cloud run to finish before marking it as done. Use Stop to cancel it."));
					return true;
				}
				await this.sessionsManagementService.archiveSession(session);
				return true;
			case DELETE_AUTOMATION_HISTORY_COMMAND_ID:
			case RETRY_DELETE_AUTOMATION_HISTORY_COMMAND_ID:
				await this.confirmAndDeleteHistory(run);
				return true;
			default:
				return false;
		}
	}

	private async confirmAndDeleteHistory(run: IAutomationRun): Promise<void> {
		const name = this.getAutomationName(run);
		const retrying = this.automationService.getAutomationHistoryState?.(run.automationId) === 'interrupted';
		const confirmed = await this.dialogService.confirm({
			message: retrying
				? localize('confirmRetryDeleteAutomationHistory', "Retry deleting run history for \"{0}\"?", name)
				: localize('confirmDeleteRetainedAutomationHistory', "Delete run history for \"{0}\"?", name),
			detail: localize('confirmDeleteRetainedAutomationHistoryDetail', "This permanently deletes every retained run for this automation."),
			primaryButton: retrying ? localize('retryDelete', "Retry Delete") : localize('delete', "Delete"),
		});
		if (!confirmed.confirmed) {
			return;
		}
		try {
			if (!this.automationService.deleteAutomationHistory) {
				throw new Error(localize('automationHistoryDeleteUnsupported', "This Automation provider does not support deleting retained run history."));
			}
			await this.automationService.deleteAutomationHistory(run.automationId);
			status(localize('automationHistoryDeletedStatus', "Deleted run history for {0}", name));
		} catch (error) {
			this.logService.error('[AutomationsCards] Failed to delete retained Automation history', error);
			await this.dialogService.error(localize('automationHistoryDeleteFailed', "Failed to delete run history."), getErrorMessage(error));
		}
	}

	private getAutomationName(run: IAutomationRun): string {
		return this.automationService.automations.get().find(automation => automation.id === run.automationId)?.name
			?? this.automationService.getAutomationHistoryName?.(run.automationId)
			?? localize('unknownAutomation', "Unknown");
	}

	private async openRunSession(resource: URI): Promise<void> {
		try {
			const resolved = this.sessionsManagementService.getSession(resource) ? resource : await this.sessionsManagementService.resolveSessionResource(resource, 'open');
			if (!this.sessionsManagementService.getSession(resolved)) {
				throw new Error(localize('automationRunSessionUnavailable', "The cloud session is not available yet. Try again or open it on GitHub."));
			}
			if (this.options.openSession) {
				await this.options.openSession(resolved);
			} else {
				await this.sessionsService.openSession(resolved, { preserveFocus: false, source: 'automation' });
			}
		} catch (error) {
			this.logService.error('[AutomationsCards] Failed to open automation run', error);
			await this.dialogService.error(
				localize('automationRunOpenFailed', "Failed to open automation run."),
				getErrorMessage(error),
			);
		}
	}

	private async stopRunSession(session: ISession, automationName: string, action: IAction): Promise<void> {
		try {
			await this.sessionsManagementService.cancelCurrentRequest(session);
			status(localize('automationRunSessionStoppedStatus', "Stopped the session for {0}", automationName));
		} catch (error) {
			action.enabled = true;
			this.logService.error('[AutomationsCards] Failed to stop automation run session', error);
			await this.dialogService.error(
				localize('automationRunSessionStopFailed', "Failed to stop the automation run session."),
				getErrorMessage(error),
			);
		}
	}

	private async openRunOnGitHub(run: IAutomationRun): Promise<void> {
		try {
			if (!run.externalResource || !await this.openerService.open(run.externalResource, { openExternal: true, allowCommands: false })) {
				throw new Error(localize('automationRunOpenRejected', "The link could not be opened."));
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				this.logService.error('[Automations] Failed to open run on GitHub', error);
				await this.dialogService.error(localize('automationRunExternalFailed', "Failed to open the run on GitHub."), getErrorMessage(error));
			}
		}
	}

	private async stopCloudRun(run: IAutomationRun): Promise<void> {
		if (this.stoppingRuns.get().has(run.id)) {
			return;
		}
		this.stoppingRuns.set(new Set([...this.stoppingRuns.get(), run.id]), undefined);
		try {
			if (!this.automationService.canStopRun?.(run) || !this.automationService.stopRun) {
				throw new Error(localize('automationRunStopUnavailable', "This automation run cannot be stopped from VS Code."));
			}
			await this.automationService.stopRun(run);
			status(localize('automationRunStopRequested', "Stop requested for {0}. History will update when available.", this.getAutomationName(run)));
		} catch (error) {
			if (!isCancellationError(error)) {
				this.logService.error('[Automations] Failed to stop run', error);
				await this.dialogService.error(localize('automationRunStopFailed', "Failed to stop the automation run."), getErrorMessage(error));
			}
		} finally {
			if (!this._store.isDisposed) {
				const pending = new Set(this.stoppingRuns.get());
				pending.delete(run.id);
				this.stoppingRuns.set(pending, undefined);
			}
		}
	}

	private restoreFocusAfterRender(): void {
		if (!this.shouldRestoreFocus) {
			return;
		}
		const runId = this.pendingFocusRunId;
		const target = runId ? this.runFocusTargets.get(runId) : undefined;
		const temporaryRow = runId
			? [...this.persistentGroups.values()].map(group => group.temporaryRows.get(runId)).find(row => row !== undefined)
			: undefined;
		this.clearPendingFocus();
		if (target) {
			target.list.focusSession(target.session, true);
		} else if (temporaryRow) {
			temporaryRow.focus();
			temporaryRow.element.scrollIntoView({ block: 'nearest' });
		} else {
			this.focusFallback.focus();
		}
	}

	private clearPendingFocus(): void {
		this.pendingFocusRunId = undefined;
		this.shouldRestoreFocus = false;
	}

	private async markAllRunsRead(): Promise<void> {
		this.isMarkingAllRead.set(true, undefined);
		try {
			await markAllAutomationRunsRead(
				this.automationService, this.sessionsManagementService, this.uriIdentityService,
				this.chatModels.get(), this.logService, this.dialogService,
				this.configurationService,
				this.storageService,
			);
		} finally {
			this.isMarkingAllRead.set(false, undefined);
		}
	}
}

export async function markAllAutomationRunsRead(
	automationService: IAutomationService,
	sessionsManagementService: ISessionsManagementService,
	uriIdentityService: IUriIdentityService,
	chatModels: Iterable<IChatModel>,
	logService: ILogService,
	dialogService: IDialogService,
	configurationService: IConfigurationService,
	storageService: IStorageService,
): Promise<void> {
	try {
		const { runs } = getAutomationsViewContent(
			automationService.automations.get(), automationService.runs.get(),
			getShowSharedAutomationsByOthers(storageService),
			configurationService.getValue<boolean>(SESSIONS_SEND_LATER_ENABLED_SETTING) === true,
		);
		const models = [...chatModels];
		const sessionsByResource = new Map(sessionsManagementService.getSessions().map(session => [
			uriIdentityService.extUri.getComparisonKey(session.resource), session,
		]));
		const unreadSessions = new Map<string, ISession>();
		for (const run of runs) {
			if (!run.sessionResource) {
				continue;
			}
			const key = uriIdentityService.extUri.getComparisonKey(run.sessionResource);
			const session = sessionsByResource.get(key);
			if (!session || session.isRead.get()) {
				continue;
			}
			const progress = automationRunWithLocalProgress(run, models);
			const completed = run.externalResource
				? progress.status === 'completed' || progress.status === 'failed'
				: session.status.get() === SessionStatus.Completed || session.status.get() === SessionStatus.Error;
			if (completed) {
				unreadSessions.set(key, session);
			}
		}
		await sessionsManagementService.markAllRead([...unreadSessions.values()]);
	} catch (error) {
		logService.error('[AutomationsCards] Failed to mark automation runs read', error);
		await dialogService.error(
			localize('automationMarkAllReadFailed', "Failed to mark automation runs as read."),
			getErrorMessage(error),
		);
	}
}

function isUnreadAutomationRun(run: IAutomationRun, session: ISession | undefined, reader: IReader): boolean {
	const state = run.externalResource ? session?.status.read(reader) : undefined;
	const completed = state !== undefined ? state === SessionStatus.Completed || state === SessionStatus.Error : run.status === 'completed' || run.status === 'failed';
	return completed && !!session && !session.isRead.read(reader);
}

function groupRunsByDate(runs: readonly IAutomationRun[]): { key: string; label: string; runs: IAutomationRun[] }[] {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	const lastWeekStart = new Date(today);
	lastWeekStart.setDate(lastWeekStart.getDate() - 7);

	const groups: Map<string, { key: string; label: string; order: number; runs: IAutomationRun[] }> = new Map();

	for (const run of runs) {
		const t = Date.parse(run.startedAt);
		if (Number.isNaN(t)) {
			continue;
		}
		const date = new Date(t);
		const { key, label, order } = getDateBucket(date, today, yesterday, lastWeekStart);

		let group = groups.get(key);
		if (!group) {
			group = { key, label, order, runs: [] };
			groups.set(key, group);
		}
		group.runs.push(run);
	}

	return [...groups.values()].sort((a, b) => a.order - b.order);
}

function getDateBucket(date: Date, today: Date, yesterday: Date, lastWeekStart: Date): { key: string; label: string; order: number } {
	if (date >= today) {
		return { key: 'today', label: localize('today', "Today"), order: 0 };
	}
	if (date >= yesterday) {
		return { key: 'yesterday', label: localize('yesterday', "Yesterday"), order: 1 };
	}
	if (date >= lastWeekStart) {
		return { key: 'week', label: localize('lastWeek', "Last week"), order: 2 };
	}
	const monthLabel = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
	const monthIndex = date.getFullYear() * 12 + date.getMonth();
	const order = 30000 - monthIndex;
	return { key: `month-${date.getFullYear()}-${date.getMonth()}`, label: monthLabel, order };
}

export function registerAutomationHistoryItemActions(archiveWording: ChatSessionArchiveActionWording, toolbarMenu: MenuId, contextMenu: MenuId, deletion: { readonly group: string; readonly order: number }): IDisposable {
	const archivePresentation = getChatSessionArchiveActionPresentation(archiveWording);
	return combinedDisposable(
		...[toolbarMenu, contextMenu].map(menu => MenuRegistry.appendMenuItem(menu, {
			command: {
				id: OPEN_AUTOMATION_RUN_ON_GITHUB_COMMAND_ID,
				title: localize('automationOpenExternal', "Open on GitHub"),
				icon: Codicon.linkExternal,
			},
			group: 'navigation',
			order: 0,
			when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext, AutomationRunHasExternalResourceContext),
		})),
		...[toolbarMenu, contextMenu].map(menu => MenuRegistry.appendMenuItem(menu, {
			command: {
				id: STOP_AUTOMATION_RUN_SESSION_COMMAND_ID,
				title: localize('stopAutomationRunSessionAction', "Stop"),
				icon: Codicon.stopCircle,
				precondition: AutomationRunStoppingContext.negate(),
			},
			group: 'navigation',
			order: 1,
			when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext, ContextKeyExpr.or(
				AutomationRunCanStopContext,
				menu === toolbarMenu ? ContextKeyExpr.and(
					AutomationRunHasExternalResourceContext.negate(),
					ContextKeyExpr.or(SessionItemStatusContext.isEqualTo(SessionStatus.InProgress), SessionItemStatusContext.isEqualTo(SessionStatus.NeedsInput)),
				) : undefined,
			)),
		})),
		MenuRegistry.appendMenuItem(contextMenu, {
			command: {
				id: MARK_SESSION_READ_COMMAND_ID,
				title: localize('markAutomationRunSessionReadAction', "Mark as Read"),
			},
			group: '1_state',
			order: 1,
			when: ContextKeyExpr.and(SessionIsReadContext.negate(), SessionIsArchivedContext.negate()),
		}),
		MenuRegistry.appendMenuItem(contextMenu, {
			command: {
				id: MARK_SESSION_UNREAD_COMMAND_ID,
				title: localize('markAutomationRunSessionUnreadAction', "Mark as Unread"),
			},
			group: '1_state',
			order: 1,
			when: ContextKeyExpr.and(SessionIsReadContext, SessionIsArchivedContext.negate()),
		}),
		MenuRegistry.appendMenuItem(contextMenu, {
			command: {
				id: RENAME_SESSION_COMMAND_ID,
				title: localize('renameAutomationRunSessionAction', "Rename..."),
			},
			group: '4_manage',
			order: 1,
			when: SessionSupportsRenameContext,
		}),
		...[toolbarMenu, contextMenu].map(menu => MenuRegistry.appendMenuItem(menu, {
			command: {
				id: ARCHIVE_SESSION_COMMAND_ID,
				title: archivePresentation.archive.title,
				icon: archivePresentation.archive.icon,
				precondition: AutomationRunCanArchiveContext,
			},
			group: menu === toolbarMenu ? 'navigation' : '1_state',
			order: 2,
			when: SessionIsArchivedContext.negate(),
		})),
		MenuRegistry.appendMenuItem(contextMenu, {
			command: {
				id: UNARCHIVE_SESSION_COMMAND_ID,
				title: archivePresentation.unarchive.title,
			},
			group: '1_state',
			order: 2,
			when: SessionIsArchivedContext,
		}),
		MenuRegistry.appendMenuItem(contextMenu, {
			command: {
				id: DELETE_AUTOMATION_HISTORY_COMMAND_ID,
				title: localize('deleteRetainedAutomationHistoryAction', "Delete Run History..."),
				precondition: AutomationRunCanDeleteHistoryContext,
			},
			...deletion,
			when: AutomationRunHistoryStateContext.isEqualTo('retained'),
		}),
		MenuRegistry.appendMenuItem(contextMenu, {
			command: {
				id: RETRY_DELETE_AUTOMATION_HISTORY_COMMAND_ID,
				title: localize('retryDeleteRetainedAutomationHistoryAction', "Retry Delete Run History..."),
				precondition: AutomationRunCanDeleteHistoryContext,
			},
			...deletion,
			when: AutomationRunHistoryStateContext.isEqualTo('interrupted'),
		}),
	);
}
