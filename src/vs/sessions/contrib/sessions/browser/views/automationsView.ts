/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/automationsCards.css';
import './automationsAccessibility.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button, ButtonBar, IButton } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, IReader, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import type { IAutomationDescriptor, IAutomationRun, AutomationTarget } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IAutomationRunner } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationDialogService } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { DAYS_OF_WEEK } from '../../../../../workbench/contrib/chat/common/automations/schedule.js';
import { basename } from '../../../../../base/common/resources.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Gesture, GestureEvent, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';

import { AbstractCustomView } from '../../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { Menus } from '../../../../browser/menus.js';
import { Action2, MenuItemAction, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../base/common/actions.js';
import { AutomationsCustomViewFocusContext, AutomationsHasItemsContext } from '../../../../common/contextkeys.js';
import { SessionsFlatList } from './sessionsList.js';
import { SessionItemStatusContext } from '../../../../common/contextkeys.js';

const $ = DOM.$;
const STOP_AUTOMATION_RUN_SESSION_COMMAND_ID = 'sessions.automations.stopRunSession';
const DELETE_AUTOMATION_RUN_SESSION_COMMAND_ID = 'sessions.automations.deleteRunSession';

registerAutomationHistoryItemActions();

/**
 * Card-style view of automations for the Agents window sessions grid.
 * Uses native VS Code components and styling patterns matching the
 * automationsListWidget in AI Customization.
 */
export class AutomationsCardsWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly cardsSection: AutomationCardsSection;
	private readonly historySection: AutomationHistorySection;
	private readonly isMarkingAllRead = observableValue(this, false);

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.element = $('.automations-cards-widget');
		this.element.tabIndex = -1;
		const focusContext = AutomationsCustomViewFocusContext.bindTo(contextKeyService);
		const focusTracker = this._register(DOM.trackFocus(this.element));
		this._register(focusTracker.onDidFocus(() => focusContext.set(true)));
		this._register(focusTracker.onDidBlur(() => focusContext.set(false)));
		this._register(toDisposable(() => focusContext.reset()));
		const scrollContent = DOM.append(this.element, $('.automations-cards-scroll-content'));

		this.cardsSection = this._register(instantiationService.createInstance(AutomationCardsSection, scrollContent));
		this.historySection = this._register(instantiationService.createInstance(AutomationHistorySection, scrollContent, this.element, this.isMarkingAllRead));

		this._register(autorun(reader => {
			const items = this.automationService.automations.read(reader);
			this.cardsSection.render(items);
		}));

		const sessionDeleted = observableSignalFromEvent(this, this.sessionsManagementService.onDidDeleteSession);
		this._register(autorun(reader => {
			if (this.isMarkingAllRead.read(reader)) {
				return;
			}
			sessionDeleted.read(reader);
			// Read automations so the history re-renders when they change (e.g. deletions).
			this.automationService.automations.read(reader);
			const allRuns = this.automationService.runs.read(reader);
			const sessions = new Map<string, ISession>();
			for (const run of allRuns) {
				if (!run.sessionResource) {
					continue;
				}
				const session = this.sessionsManagementService.getSession(run.sessionResource);
				if (session) {
					session.capabilities.read(reader);
					sessions.set(run.id, session);
				}
			}
			this.historySection.render(allRuns, sessions);
		}));
	}

	layout(width: number, height: number): void {
		this.element.style.width = `${width}px`;
		this.historySection.layout();
	}

	focus(): void {
		this.element.focus();
	}
}

//#region AutomationCardsSection

/**
 * Renders the automation card grid and empty state.
 */
class AutomationCardsSection extends Disposable {

	private readonly container: HTMLElement;
	private readonly emptyContainer: HTMLElement;
	private readonly disposables = this._register(new DisposableStore());

	constructor(
		parent: HTMLElement,
		@IAutomationService private readonly automationService: IAutomationService,
		@IAutomationRunner private readonly automationRunner: IAutomationRunner,
		@IAutomationDialogService private readonly automationDialogService: IAutomationDialogService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.container = DOM.append(parent, $('.automations-cards-grid'));
		this.emptyContainer = DOM.append(parent, $('.automations-cards-empty'));
		this.emptyContainer.style.display = 'none';
	}

	render(automations: readonly IAutomationDescriptor[]): void {
		this.disposables.clear();
		DOM.clearNode(this.container);

		if (automations.length === 0) {
			this.container.style.display = 'none';
			this.emptyContainer.style.display = '';
			this.renderEmptyState();
			return;
		}

		this.container.style.display = '';
		this.emptyContainer.style.display = 'none';

		for (const automation of automations) {
			this.renderCard(automation);
		}
	}

	private renderCard(automation: IAutomationDescriptor): void {
		const wrapper = DOM.append(this.container, $('.automations-card-wrapper'));
		const card = DOM.append(wrapper, $('.automations-card'));
		card.setAttribute('role', 'group');
		card.setAttribute('aria-label', localize('automationCard', "{0} — {1}", automation.name, formatSchedule(automation)));
		this.disposables.add(Gesture.addTarget(card));

		const main = DOM.append(card, $('button.automations-card-main', {
			type: 'button',
			'aria-label': localize('editAutomationNamed', "Edit automation {0}", automation.name),
		}));

		// Name row with disabled badge
		const nameRow = DOM.append(main, $('.automations-card-name'));
		const nameTextEl = DOM.append(nameRow, $('span.automations-card-name-text'));
		nameTextEl.textContent = automation.name;

		if (!automation.enabled) {
			const badge = DOM.append(nameRow, $('span.automations-card-disabled-badge'));
			badge.textContent = localize('disabled', "Disabled");
		}

		// Metadata row (schedule · folder · last run)
		const metaEl = DOM.append(main, $('.automations-card-meta'));
		const scheduleEl = DOM.append(metaEl, $('span.automations-card-meta-item'));
		scheduleEl.textContent = formatSchedule(automation);

		const folderEl = DOM.append(metaEl, $('span.automations-card-meta-item.automations-card-folder'));
		const folderLabel = getAutomationTargetLabel(automation.target);
		folderEl.textContent = folderLabel;
		this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), folderEl, folderLabel));

		// Prompt preview (truncated)
		const promptEl = DOM.append(main, $('.automations-card-prompt'));
		const maxLength = 120;
		promptEl.textContent = automation.prompt.length > maxLength
			? automation.prompt.slice(0, maxLength) + '…'
			: automation.prompt;

		const actions = DOM.append(card, $('.automations-card-actions'));
		actions.setAttribute('role', 'group');
		actions.setAttribute('aria-label', localize('automationActions', "Actions for {0}", automation.name));
		const runningLabel = DOM.append(actions, $('span.automations-card-running-label'));
		runningLabel.textContent = localize('running', "Running");
		runningLabel.style.display = 'none';
		const buttonBar = this.disposables.add(new ButtonBar(actions));
		const runBtn = this.createIconButton(buttonBar, Codicon.play, localize('runNow', "Run now"), false);
		runBtn.element.classList.add('automations-card-run-button');
		this.disposables.add(autorun(reader => {
			const runs = this.automationService.runs.read(reader);
			const isRunning = runs.some(r => r.automationId === automation.id && (r.status === 'pending' || r.status === 'running'));
			runningLabel.style.display = isRunning ? '' : 'none';
			runBtn.element.classList.toggle('automations-card-run-button-hidden', isRunning);
			actions.classList.toggle('automation-running', isRunning);
			runBtn.enabled = !isRunning;
		}));
		this.disposables.add(runBtn.onDidClick(() => {
			void this.runNow(automation);
		}));

		const deleteBtn = this.createIconButton(buttonBar, Codicon.trash, localize('deleteAutomation', "Delete"), false);
		deleteBtn.element.classList.add('automations-card-secondary-action');
		this.disposables.add(deleteBtn.onDidClick(() => {
			void this.confirmDelete(automation);
		}));

		for (const eventType of [DOM.EventType.CLICK, TouchEventType.Tap]) {
			this.disposables.add(DOM.addDisposableListener(card, eventType, event => {
				const target = (event as GestureEvent).initialTarget ?? event.target;
				if (target instanceof Node && DOM.isAncestor(target, actions)) {
					return;
				}
				void this.openEditDialog(automation);
			}));
		}
	}

	private createIconButton(buttonBar: ButtonBar, icon: ThemeIcon, tooltip: string, disabled: boolean): IButton {
		const button = buttonBar.addButton({
			ariaLabel: tooltip,
			disabled,
			supportIcons: true,
			title: tooltip,
		});
		button.label = `$(${icon.id})`;
		button.element.classList.add('automations-card-action-button');
		return button;
	}

	private async runNow(automation: IAutomationDescriptor): Promise<void> {
		if (!await this.ensureEnabled()) {
			return;
		}
		try {
			const operation = this.automationRunner.runOnce(automation, 'manual', 0, CancellationToken.None);
			const dispatch = await operation.whenDispatched;
			switch (dispatch.kind) {
				case 'started':
					status(localize('automationStartedStatus', "Started automation {0}", automation.name));
					break;
				case 'alreadyRunning':
					status(localize('automationAlreadyRunningStatus', "Automation {0} is already running", automation.name));
					break;
				case 'notStarted':
					status(localize('automationNotStartedStatus', "Automation {0} did not start", automation.name));
					break;
			}
			await operation.whenCompleted;
		} catch (error) {
			this.logService.error('[AutomationsCards] Failed to run automation', error);
			await this.dialogService.error(
				localize('automationRunActionFailed', "Failed to run automation."),
				getErrorMessage(error),
			);
		}
	}

	private renderEmptyState(): void {
		DOM.clearNode(this.emptyContainer);

		const title = DOM.append(this.emptyContainer, $('h3.automations-cards-empty-title'));
		title.textContent = localize('noAutomationsYet', "No automations yet");
		const desc = DOM.append(this.emptyContainer, $('p.automations-cards-empty-description'));
		desc.textContent = localize('noAutomationsDesc', "Create an automation to schedule an agent session to run on a cadence you choose.");

		const createButton = this.disposables.add(new Button(this.emptyContainer, {
			...defaultButtonStyles,
			title: localize('createAutomation', "Create Automation"),
		}));
		createButton.label = localize('createAutomation', "Create Automation");
		createButton.element.classList.add('automations-cards-create-button');
		this.disposables.add(createButton.onDidClick(() => this.openCreateDialog()));
	}

	private async openCreateDialog(): Promise<void> {
		if (!await this.ensureEnabled()) {
			return;
		}
		const result = await this.automationDialogService.showAutomationDialog({});
		if (!result || result.kind !== 'create') {
			return;
		}
		if (!await this.ensureEnabled()) {
			return;
		}
		try {
			const created = await this.automationService.createAutomation(result.value, () => this.throwIfDisabled());
			status(localize('automationCreatedStatus', "Created automation {0}", created.name));
		} catch (err) {
			this.logService.error('[AutomationsCards] Failed to create automation', err);
			await this.dialogService.error(
				localize('automationCreateFailed', "Failed to create automation."),
				getErrorMessage(err),
			);
		}
	}

	private async openEditDialog(automation: IAutomationDescriptor): Promise<void> {
		if (!await this.ensureEnabled()) {
			return;
		}
		const result = await this.automationDialogService.showAutomationDialog({ existing: automation });
		if (!result || result.kind !== 'update') {
			return;
		}
		if (!await this.ensureEnabled()) {
			return;
		}
		try {
			const updateResult = await this.automationService.updateAutomationIfUnchanged(result.id, result.value, automation, () => this.throwIfDisabled());
			if (updateResult.kind === 'conflict') {
				throw new Error(updateResult.current
					? localize('automationChangedDuringEdit', "This automation changed while the dialog was open. Reopen it to review the latest values.")
					: localize('automationDeletedDuringEdit', "This automation was deleted while the dialog was open."));
			}
			status(localize('automationUpdatedStatus', "Updated automation {0}", automation.name));
		} catch (err) {
			this.logService.error('[AutomationsCards] Failed to update automation', err);
			await this.dialogService.error(
				localize('automationUpdateFailed', "Failed to update automation."),
				getErrorMessage(err),
			);
		}
	}

	private async confirmDelete(automation: IAutomationDescriptor): Promise<void> {
		if (!await this.ensureEnabled()) {
			return;
		}
		const confirmed = await this.dialogService.confirm({
			message: localize('confirmDeleteAutomation', "Delete automation \"{0}\"?", automation.name),
			detail: localize('confirmDeleteDetail', "This will permanently delete the automation and its run history."),
			primaryButton: localize('delete', "Delete"),
		});
		if (!confirmed.confirmed) {
			return;
		}
		if (!await this.ensureEnabled()) {
			return;
		}
		try {
			await this.automationService.deleteAutomation(automation.id, () => this.throwIfDisabled());
			status(localize('automationDeletedStatus', "Deleted automation {0}", automation.name));
		} catch (err) {
			this.logService.error('[AutomationsCards] Failed to delete automation', err);
			await this.dialogService.error(
				localize('automationDeleteFailed', "Failed to delete automation."),
				getErrorMessage(err),
			);
		}
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
	}

	private async ensureEnabled(): Promise<boolean> {
		if (this.isEnabled()) {
			return true;
		}
		await showAutomationsDisabled(this.dialogService);
		return false;
	}

	private throwIfDisabled(): void {
		if (!this.isEnabled()) {
			throw new Error(localize('automationsDisabledBeforeSave', "Automations were disabled before the change could be saved."));
		}
	}
}

//#endregion

//#region AutomationHistorySection

/**
 * Renders the run history list grouped by date.
 *
 * Groups and their SessionsFlatList instances are persistent across renders.
 * Only structural changes (groups added/removed, sessions added/removed within
 * a group) mutate the DOM. Status changes within an existing session row are
 * handled reactively by the tree's own autoruns, avoiding the context-key
 * default-value flash that a full tear-down/rebuild would cause.
 */
class AutomationHistorySection extends Disposable {

	private readonly container: HTMLElement;
	private readonly groupsContainer: HTMLElement;
	private readonly headerDisposables = this._register(new DisposableStore());
	private readonly persistentGroups = new Map<string, {
		readonly element: HTMLElement;
		readonly header: HTMLElement;
		readonly grid: HTMLElement;
		readonly listContainer: HTMLElement;
		readonly list: SessionsFlatList;
		readonly runsBySession: Map<string, IAutomationRun>;
		readonly disposables: DisposableStore;
	}>();
	private readonly runFocusTargets = new Map<string, { readonly list: SessionsFlatList; readonly session: ISession }>();
	private renderedFocusableRunIds: string[] = [];
	private pendingFocusRunId: string | undefined;
	private shouldRestoreFocus = false;
	private headerRow: HTMLElement | undefined;
	private markAllButton: Button | undefined;
	private currentRuns: readonly IAutomationRun[] = [];
	private currentSessions: ReadonlyMap<string, ISession> = new Map();

	override dispose(): void {
		this.disposeAllGroups();
		super.dispose();
	}

	constructor(
		parent: HTMLElement,
		private readonly focusFallback: HTMLElement,
		private readonly isMarkingAllRead: ISettableObservable<boolean>,
		@IAutomationService private readonly automationService: IAutomationService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.container = DOM.append(parent, $('.automations-history'));
		this.groupsContainer = DOM.append(this.container, $('.automations-history-groups'));
	}

	render(runs: readonly IAutomationRun[], sessions: ReadonlyMap<string, ISession>): void {
		this.currentRuns = runs;
		this.currentSessions = sessions;
		this.runFocusTargets.clear();
		this.renderedFocusableRunIds = [];

		if (runs.length === 0) {
			this.container.style.display = 'none';
			this.disposeAllGroups();
			this.restoreFocusAfterRender();
			return;
		}

		this.container.style.display = '';
		this.ensureHeader();

		const groups = groupRunsByDate(runs);
		const activeKeys = new Set<string>();

		// Update or create groups in sorted order
		for (const group of groups) {
			activeKeys.add(group.key);
			const sessionItems = this.resolveSessionItems(group.runs, sessions);

			let entry = this.persistentGroups.get(group.key);
			if (entry) {
				// Update existing group label (may change with locale/date)
				entry.header.textContent = group.label;
				// Update sessions in-place via tree diff
				this.updateGroupSessions(entry, sessionItems);
			} else {
				// Create new group
				entry = this.createGroup(group.key, group.label, sessionItems);
			}

			// Ensure DOM order matches sorted group order
			this.groupsContainer.appendChild(entry.element);

			// Rebuild focus tracking for this group
			for (const item of sessionItems) {
				this.renderedFocusableRunIds.push(item.run.id);
				this.runFocusTargets.set(item.run.id, { list: entry.list, session: item.session });
			}
		}

		// Dispose removed groups
		for (const [key, entry] of this.persistentGroups) {
			if (!activeKeys.has(key)) {
				entry.disposables.dispose();
				entry.element.remove();
				this.persistentGroups.delete(key);
			}
		}

		this.updateMarkAllReadState();
		this.layout();
		this.restoreFocusAfterRender();
	}

	layout(): void {
		for (const entry of this.persistentGroups.values()) {
			this.layoutSessionList(entry.listContainer, entry.list);
		}
	}

	private ensureHeader(): void {
		if (this.headerRow) {
			return;
		}
		this.headerDisposables.clear();
		this.headerRow = DOM.$('.automations-history-header');
		this.container.insertBefore(this.headerRow, this.groupsContainer);
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
			this.markAllButton!.enabled = false;
			void this.markAllRunsRead(this.currentRuns);
		}));
		this.headerDisposables.add(autorun(reader => {
			const hasUnread = this.currentRuns.some(run => isUnreadAutomationRun(run, this.currentSessions.get(run.id), reader));
			this.markAllButton!.element.style.display = hasUnread ? '' : 'none';
			this.markAllButton!.enabled = hasUnread;
		}));
	}

	private updateMarkAllReadState(): void {
		// The autorun in ensureHeader handles reactive updates via session.isRead observables.
		// This method is a no-op placeholder for any imperative updates needed in the future.
	}

	private resolveSessionItems(runs: readonly IAutomationRun[], sessions: ReadonlyMap<string, ISession>): { readonly run: IAutomationRun; readonly session: ISession }[] {
		const items: { readonly run: IAutomationRun; readonly session: ISession }[] = [];
		for (const run of runs) {
			const session = sessions.get(run.id);
			if (session) {
				items.push({ run, session });
			}
		}
		return items;
	}

	private createGroup(key: string, label: string, items: readonly { readonly run: IAutomationRun; readonly session: ISession }[]): NonNullable<ReturnType<typeof this.persistentGroups.get>> {
		const disposables = new DisposableStore();
		const element = $('.automations-history-group');
		const header = DOM.append(element, $('.automations-history-group-header'));
		header.textContent = label;
		const grid = DOM.append(element, $('.automations-run-cards-grid'));
		const listContainer = DOM.append(grid, $('.automations-run-session-list'));

		const runsBySession = new Map<string, IAutomationRun>();
		const list = disposables.add(this.instantiationService.createInstance(SessionsFlatList, listContainer, {
			showSessionHover: false,
			alwaysConsumeMouseWheel: false,
			toolbarMenuId: Menus.AutomationsHistoryItem,
			markReadOnOpen: false,
			onSessionOpen: resource => void this.openRunSession(resource),
			onToolbarAction: (action, session) => this.handleSessionToolbarAction(action, session, runsBySession),
		}));
		disposables.add(list.onDidChangeContentHeight(() => this.layoutSessionList(listContainer, list)));

		const entry = { element, header, grid, listContainer, list, runsBySession, disposables };
		this.persistentGroups.set(key, entry);

		this.updateGroupSessions(entry, items);
		return entry;
	}

	private updateGroupSessions(
		entry: NonNullable<ReturnType<typeof this.persistentGroups.get>>,
		items: readonly { readonly run: IAutomationRun; readonly session: ISession }[],
	): void {
		// Update the mutable runsBySession map so toolbar action closures see current data
		entry.runsBySession.clear();
		for (const item of items) {
			entry.runsBySession.set(item.session.resource.toString(), item.run);
		}
		entry.list.setSessions(items.map(item => item.session));
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

	private async handleSessionToolbarAction(action: IAction, session: ISession, runsBySession: ReadonlyMap<string, IAutomationRun>): Promise<boolean> {
		const run = runsBySession.get(session.resource.toString());
		if (!run) {
			return false;
		}
		switch (action.id) {
			case STOP_AUTOMATION_RUN_SESSION_COMMAND_ID:
				action.enabled = false;
				await this.stopRunSession(session, this.getAutomationName(run), action);
				return true;
			case DELETE_AUTOMATION_RUN_SESSION_COMMAND_ID:
				await this.confirmDeleteRunSession(run, session, this.getAutomationName(run));
				return true;
			default:
				return false;
		}
	}

	private getAutomationName(run: IAutomationRun): string {
		return this.automationService.automations.get().find(automation => automation.id === run.automationId)?.name
			?? localize('unknownAutomation', "Unknown");
	}

	private async openRunSession(resource: URI): Promise<void> {
		if (!this.sessionsManagementService.getSession(resource)) {
			return;
		}
		try {
			await this.sessionsService.openSession(resource, { preserveFocus: false });
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

	private async confirmDeleteRunSession(run: IAutomationRun, session: ISession, automationName: string): Promise<void> {
		const confirmed = await this.dialogService.confirm({
			message: localize('confirmDeleteAutomationRunSession', "Delete the session for \"{0}\"?", automationName),
			detail: localize('confirmDeleteAutomationRunSessionDetail', "This will permanently delete the session and remove this item from run history. This action cannot be undone."),
			primaryButton: localize('delete', "Delete"),
		});
		if (!confirmed.confirmed) {
			return;
		}
		this.prepareFocusAfterDeletion(run.id);
		try {
			await this.sessionsManagementService.deleteSession(session);
		} catch (error) {
			this.clearPendingFocus();
			this.logService.error('[AutomationsCards] Failed to delete automation run session', error);
			await this.dialogService.error(
				localize('automationRunSessionDeleteFailed', "Failed to delete the automation run session."),
				getErrorMessage(error),
			);
			return;
		}
		this.prepareFocusAfterDeletion(run.id);
		try {
			await this.automationService.deleteRun(run.id);
			this.restoreFocusAfterRender();
			status(localize('automationRunSessionDeletedStatus', "Deleted the session for {0}", automationName));
		} catch (error) {
			this.clearPendingFocus();
			this.logService.error('[AutomationsCards] Failed to remove deleted automation run from history', error);
			await this.dialogService.error(
				localize('automationRunHistoryDeleteFailed', "The session was deleted, but its run history item could not be removed."),
				getErrorMessage(error),
			);
		}
	}

	private prepareFocusAfterDeletion(runId: string): void {
		const index = this.renderedFocusableRunIds.indexOf(runId);
		this.pendingFocusRunId = index >= 0
			? this.renderedFocusableRunIds[index + 1] ?? this.renderedFocusableRunIds[index - 1]
			: undefined;
		this.shouldRestoreFocus = true;
	}

	private restoreFocusAfterRender(): void {
		if (!this.shouldRestoreFocus) {
			return;
		}
		const target = this.pendingFocusRunId ? this.runFocusTargets.get(this.pendingFocusRunId) : undefined;
		this.clearPendingFocus();
		if (target instanceof HTMLElement) {
			target.focus();
		} else if (target) {
			target.list.focusSession(target.session);
		} else {
			this.focusFallback.focus();
		}
	}

	private clearPendingFocus(): void {
		this.pendingFocusRunId = undefined;
		this.shouldRestoreFocus = false;
	}

	private async markAllRunsRead(runs: readonly IAutomationRun[]): Promise<void> {
		this.isMarkingAllRead.set(true, undefined);
		const sessions = new Map<string, ISession>();
		try {
			for (const run of runs) {
				if ((run.status === 'completed' || run.status === 'failed') && run.sessionResource) {
					const session = this.sessionsManagementService.getSession(run.sessionResource);
					if (session && !session.isRead.get()) {
						sessions.set(session.resource.toString(), session);
					}
				}
			}
			await this.sessionsManagementService.markAllRead([...sessions.values()]);
		} catch (error) {
			this.logService.error('[AutomationsCards] Failed to mark automation runs read', error);
			await this.dialogService.error(
				localize('automationMarkAllReadFailed', "Failed to mark automation runs as read."),
				getErrorMessage(error),
			);
		} finally {
			this.isMarkingAllRead.set(false, undefined);
		}
	}
}

//#endregion

//#region Helpers

type DateBucketKind = 'today' | 'yesterday' | 'week' | 'month';

function isUnreadAutomationRun(run: IAutomationRun, session: ISession | undefined, reader: IReader): boolean {
	return (run.status === 'completed' || run.status === 'failed') && !!session && !session.isRead.read(reader);
}

function formatSchedule(automation: IAutomationDescriptor): string {
	const { interval, scheduleHour, scheduleMinute } = automation.schedule;
	const time = formatHourMinute(scheduleHour, scheduleMinute);
	switch (interval) {
		case 'hourly': return localize('scheduleHourly', "Hourly");
		case 'daily': return localize('scheduleDailyAt', "Daily at {0}", time);
		case 'weekly': {
			const day = DAYS_OF_WEEK[((automation.schedule.scheduleDay % 7) + 7) % 7];
			return localize('scheduleWeeklyAt', "{0} at {1}", day, time);
		}
		case 'manual': return localize('scheduleManual', "Manual");
		default: return localize('scheduleManual', "Manual");
	}
}

function formatHourMinute(hour: number, minute: number): string {
	const date = new Date(Date.UTC(2000, 0, 1, Math.max(0, Math.min(23, hour | 0)), Math.max(0, Math.min(59, minute | 0))));
	return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

function getAutomationTargetLabel(target: AutomationTarget): string {
	return target.kind === 'workspace' ? basename(target.folderUri) : localize('quickChat', "Quick Chat");
}

function groupRunsByDate(runs: readonly IAutomationRun[]): { key: string; label: string; kind: DateBucketKind; runs: IAutomationRun[] }[] {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	const lastWeekStart = new Date(today);
	lastWeekStart.setDate(lastWeekStart.getDate() - 7);

	const groups: Map<string, { key: string; label: string; kind: DateBucketKind; order: number; runs: IAutomationRun[] }> = new Map();

	for (const run of runs) {
		const t = Date.parse(run.startedAt);
		if (Number.isNaN(t)) {
			continue;
		}
		const date = new Date(t);
		const { key, label, kind, order } = getDateBucket(date, today, yesterday, lastWeekStart);

		let group = groups.get(key);
		if (!group) {
			group = { key, label, kind, order, runs: [] };
			groups.set(key, group);
		}
		group.runs.push(run);
	}

	return [...groups.values()].sort((a, b) => a.order - b.order);
}

function getDateBucket(date: Date, today: Date, yesterday: Date, lastWeekStart: Date): { key: string; label: string; kind: DateBucketKind; order: number } {
	if (date >= today) {
		return { key: 'today', label: localize('today', "Today"), kind: 'today', order: 0 };
	}
	if (date >= yesterday) {
		return { key: 'yesterday', label: localize('yesterday', "Yesterday"), kind: 'yesterday', order: 1 };
	}
	if (date >= lastWeekStart) {
		return { key: 'week', label: localize('lastWeek', "Last week"), kind: 'week', order: 2 };
	}
	const monthLabel = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
	const monthIndex = date.getFullYear() * 12 + date.getMonth();
	const order = 30000 - monthIndex;
	return { key: `month-${date.getFullYear()}-${date.getMonth()}`, label: monthLabel, kind: 'month', order };
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function showAutomationsDisabled(dialogService: IDialogService): Promise<void> {
	await dialogService.info(
		localize('automationsDisabledTitle', "Automations are disabled."),
		localize('automationsDisabledDetail', "Enable \u201C{0}\u201D to make changes.", CHAT_AUTOMATIONS_ENABLED_SETTING),
	);
}

//#endregion

//#region AutomationsView (Custom View)

export const AUTOMATIONS_CUSTOM_VIEW_ID = 'sessions.customView.automations';

/**
 * A custom view that hosts the automations management page inside the
 * agents window, using the CustomViewGridPart infrastructure.
 */
export class AutomationsCustomView extends AbstractCustomView {

	readonly title: IObservable<string> = constObservable(localize('automationsTitle', "Automations"));
	override readonly description: IObservable<string | undefined> = constObservable(
		localize('automationsDescription', "Schedule agent sessions to run automatically on a cadence you choose."));

	private _widget: AutomationsCardsWidget | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	render(container: HTMLElement): void {
		container.classList.add('automations-cards-content');
		this._widget = this._register(this.instantiationService.createInstance(AutomationsCardsWidget));
		container.appendChild(this._widget.element);
	}

	layout(width: number, height: number): void {
		this._widget?.layout(width, height);
	}

	override focus(): void {
		this._widget?.focus();
	}
}

/**
 * Registers the Automations custom view with the custom view service.
 */
export class AutomationsCustomViewContribution extends Disposable {

	static readonly ID = 'sessions.contrib.automationsCustomView';

	constructor(
		@ICustomViewService customViewService: ICustomViewService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAutomationService automationService: IAutomationService,
	) {
		super();

		const hasItemsContext = AutomationsHasItemsContext.bindTo(contextKeyService);
		this._register(autorun(reader => {
			hasItemsContext.set(automationService.automations.read(reader).length > 0);
		}));

		this._register(customViewService.registerCustomView({
			id: AUTOMATIONS_CUSTOM_VIEW_ID,
			ctor: new SyncDescriptor(AutomationsCustomView),
			actions: { style: 'buttonBar', menuId: Menus.CustomViewAutomations },
		}, {
			restore: contextKeyService.getContextKeyValue<boolean>(ChatAutomationsEnabledContext.key) === true,
		}));

		const automationContextKeys = new Set([ChatAutomationsEnabledContext.key]);
		this._register(contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(automationContextKeys)
				&& !contextKeyService.getContextKeyValue<boolean>(ChatAutomationsEnabledContext.key)
				&& customViewService.activeCustomView.get()?.id === AUTOMATIONS_CUSTOM_VIEW_ID) {
				customViewService.hideCustomView();
			}
		}));

		// Render the "New Automation" button as primary instead of secondary
		this._register(actionViewItemService.register(Menus.CustomViewAutomations, 'sessionsView.newAutomation', (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(PrimaryButtonActionViewItem, undefined, action, options);
		}));
	}
}

function registerAutomationHistoryItemActions(): void {
	// Stop — visible when the session is in progress or waiting for input
	MenuRegistry.appendMenuItem(Menus.AutomationsHistoryItem, {
		command: {
			id: STOP_AUTOMATION_RUN_SESSION_COMMAND_ID,
			title: localize('stopAutomationRunSessionAction', "Stop"),
			icon: Codicon.stopCircle,
		},
		group: 'navigation',
		order: 1,
		when: ContextKeyExpr.or(
			SessionItemStatusContext.isEqualTo(SessionStatus.InProgress),
			SessionItemStatusContext.isEqualTo(SessionStatus.NeedsInput),
		),
	});
	// Delete — visible when the session has completed or errored
	MenuRegistry.appendMenuItem(Menus.AutomationsHistoryItem, {
		command: {
			id: DELETE_AUTOMATION_RUN_SESSION_COMMAND_ID,
			title: localize('deleteAutomationRunSessionAction', "Delete"),
			icon: Codicon.trash,
		},
		group: 'navigation',
		order: 1,
		when: ContextKeyExpr.or(
			SessionItemStatusContext.isEqualTo(SessionStatus.Completed),
			SessionItemStatusContext.isEqualTo(SessionStatus.Error),
		),
	});
}

registerWorkbenchContribution2(AutomationsCustomViewContribution.ID, AutomationsCustomViewContribution, WorkbenchPhase.BlockRestore);

class PrimaryButtonActionViewItem extends BaseActionViewItem {

	private button: Button | undefined;

	constructor(context: unknown, action: IAction, options: IActionViewItemOptions) {
		super(context, action, options);
	}

	override render(container: HTMLElement): void {
		this.element = container;
		container.classList.add('chat-composite-bar-meta-item');
		const button = this.button = this._register(new Button(container, { secondary: false, ...defaultButtonStyles }));
		button.element.classList.add('monaco-text-button', 'chat-composite-bar-meta-item-button');
		this._register(button.onDidClick(() => {
			if (this._action.enabled) {
				this.actionRunner.run(this._action, this._context);
			}
		}));
		this.updateLabel();
		this.updateEnabled();
	}

	override focus(): void { this.button?.focus(); }
	override blur(): void { if (this.button) { this.button.element.tabIndex = -1; this.button.element.blur(); } }
	override setFocusable(focusable: boolean): void { if (this.button) { this.button.element.tabIndex = focusable ? 0 : -1; } }

	protected override updateEnabled(): void {
		if (this.button) { this.button.enabled = this._action.enabled; }
	}

	protected override updateLabel(): void {
		if (!this.button) { return; }
		DOM.reset(this.button.element, this._action.label);
	}
}

registerAction2(class NewAutomationAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsView.newAutomation',
			title: localize2('newAutomation', "New Automation"),
			precondition: ChatAutomationsEnabledContext,
			menu: [{ id: Menus.CustomViewAutomations, group: 'navigation', order: 1, when: ContextKeyExpr.and(ChatAutomationsEnabledContext, AutomationsHasItemsContext) }],
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const automationDialogService = accessor.get(IAutomationDialogService);
		const automationService = accessor.get(IAutomationService);
		const configurationService = accessor.get(IConfigurationService);
		const dialogService = accessor.get(IDialogService);
		const logService = accessor.get(ILogService);
		const isEnabled = () => configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
		if (!isEnabled()) {
			await showAutomationsDisabled(dialogService);
			return;
		}
		const result = await automationDialogService.showAutomationDialog({});
		if (!result || result.kind !== 'create') {
			return;
		}
		if (!isEnabled()) {
			await showAutomationsDisabled(dialogService);
			return;
		}
		try {
			await automationService.createAutomation(result.value, () => {
				if (!isEnabled()) {
					throw new Error(localize('automationsDisabledBeforeSave', "Automations were disabled before the change could be saved."));
				}
			});
		} catch (err) {
			logService.error('[Automations] Failed to create automation', err);
			await dialogService.error(
				localize('automationCreateFailed', "Failed to create automation."),
				getErrorMessage(err),
			);
		}
	}
});

//#endregion
