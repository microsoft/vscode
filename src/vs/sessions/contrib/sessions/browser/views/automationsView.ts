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
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, IReader, ISettableObservable, observableSignalFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import type { IAutomationDescriptor, IAutomationRun, AutomationTarget } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IAutomationRunner } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationDialogService } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { DAYS_OF_WEEK } from '../../../../../workbench/contrib/chat/common/automations/schedule.js';
import { AgentSessionApprovalModel } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
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
import { SessionStatusIcon } from '../../../../browser/sessionStatusIcon.js';

import { AbstractCustomView } from '../../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Menus } from '../../../../browser/menus.js';
import { Action2, MenuItemAction, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../base/common/actions.js';
import { AutomationsCustomViewFocusContext, AutomationsHasItemsContext, SessionSupportsDeleteContext } from '../../../../common/contextkeys.js';
import { SessionsFlatList, SessionItemStatusContext } from './sessionsList.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../automationsConstants.js';

const $ = DOM.$;
const STOP_AUTOMATION_RUN_SESSION_COMMAND_ID = 'sessions.automations.stopRunSession';
const DELETE_AUTOMATION_RUN_SESSION_COMMAND_ID = 'sessions.automations.deleteRunSession';

interface IAutomationCardEntry {
	readonly element: HTMLElement;
	readonly card: HTMLElement;
	readonly main: HTMLElement;
	readonly actions: HTMLElement;
	readonly nameText: HTMLElement;
	readonly scheduleEl: HTMLElement;
	readonly folderEl: HTMLElement;
	readonly folderHover: MutableDisposable<IDisposable>;
	readonly promptEl: HTMLElement;
	readonly disabledBadge: HTMLElement;
	readonly disposables: DisposableStore;
}

interface IAutomationHistoryItem {
	readonly run: IAutomationRun;
	readonly session: ISession;
}

interface IAutomationHistoryGroup {
	readonly element: HTMLElement;
	readonly header: HTMLElement;
	readonly temporaryRowsContainer: HTMLElement;
	readonly temporaryRows: DisposableMap<string, IAutomationTemporaryRunRow>;
	readonly listContainer: HTMLElement;
	readonly listDisposables: MutableDisposable<DisposableStore>;
	list: SessionsFlatList | undefined;
	readonly runsBySession: Map<string, IAutomationRun>;
	sessions: readonly ISession[];
	readonly disposables: DisposableStore;
}

interface IAutomationTemporaryRunRow extends IDisposable {
	readonly element: HTMLElement;
	readonly title: HTMLElement;
}

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
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
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
		const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			if (this.isMarkingAllRead.read(reader)) {
				return;
			}
			sessionDeleted.read(reader);
			sessionsChanged.read(reader);
			this.automationService.automations.read(reader);
			const allRuns = this.automationService.runs.read(reader);
			const sessionsByResource = new Map(this.sessionsManagementService.getSessions().map(session => [
				this.uriIdentityService.extUri.getComparisonKey(session.resource),
				session,
			]));
			const sessions = new Map<string, ISession>();
			for (const run of allRuns) {
				if (!run.sessionResource) {
					continue;
				}
				const session = sessionsByResource.get(this.uriIdentityService.extUri.getComparisonKey(run.sessionResource));
				if (session) {
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
	private readonly persistentCards = new Map<string, IAutomationCardEntry>();
	private readonly latestAutomations = new Map<string, IAutomationDescriptor>();
	private readonly emptyStateDisposables = this._register(new DisposableStore());

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
		this.renderEmptyState();
		this._register(toDisposable(() => {
			for (const card of this.persistentCards.values()) {
				card.disposables.dispose();
				card.element.remove();
			}
			this.persistentCards.clear();
			this.latestAutomations.clear();
		}));
	}

	render(automations: readonly IAutomationDescriptor[]): void {
		const activeAutomationIds = new Set(automations.map(automation => automation.id));
		for (const [automationId, card] of this.persistentCards) {
			if (activeAutomationIds.has(automationId)) {
				continue;
			}
			card.disposables.dispose();
			card.element.remove();
			this.persistentCards.delete(automationId);
			this.latestAutomations.delete(automationId);
		}

		let index = 0;

		for (const automation of automations) {
			const prev = this.latestAutomations.get(automation.id);
			this.latestAutomations.set(automation.id, automation);

			let card = this.persistentCards.get(automation.id);
			if (!card) {
				card = this.renderCard(automation);
				this.persistentCards.set(automation.id, card);
			} else if (prev !== automation) {
				this.updateCard(card, automation, prev);
			}

			const currentElement = this.container.children.item(index);
			if (currentElement !== card.element) {
				this.container.insertBefore(card.element, currentElement);
			}
			index++;
		}

		if (automations.length === 0) {
			this.container.style.display = 'none';
			this.emptyContainer.style.display = '';
			return;
		}

		this.container.style.display = '';
		this.emptyContainer.style.display = 'none';

	}

	private renderCard(automation: IAutomationDescriptor): IAutomationCardEntry {
		const disposables = new DisposableStore();
		const wrapper = $('.automations-card-wrapper');
		const card = DOM.append(wrapper, $('.automations-card'));
		card.setAttribute('role', 'group');
		disposables.add(Gesture.addTarget(card));

		const main = DOM.append(card, $('button.automations-card-main', {
			type: 'button',
		}));

		const nameRow = DOM.append(main, $('.automations-card-name'));
		const nameTextEl = DOM.append(nameRow, $('span.automations-card-name-text'));
		const disabledBadge = DOM.append(nameRow, $('span.automations-card-disabled-badge'));
		disabledBadge.textContent = localize('disabled', "Disabled");

		const metaEl = DOM.append(main, $('.automations-card-meta'));
		const scheduleEl = DOM.append(metaEl, $('span.automations-card-meta-item.automations-card-schedule'));
		const folderEl = DOM.append(metaEl, $('span.automations-card-meta-item.automations-card-folder'));
		const folderHover = disposables.add(new MutableDisposable());

		const promptEl = DOM.append(main, $('.automations-card-prompt'));

		const actions = DOM.append(card, $('.automations-card-actions'));
		actions.setAttribute('role', 'group');
		const buttonBar = disposables.add(new ButtonBar(actions));
		const runNowLabel = localize('runNow', "Run now");
		const runningLabel = localize('running', "Running");
		const runBtn = this.createIconButton(buttonBar, Codicon.play, runNowLabel, false);
		runBtn.element.classList.add('automations-card-run-button');
		disposables.add(runBtn.onDidClick((e) => {
			e?.stopPropagation();
			const currentAutomation = this.latestAutomations.get(automation.id);
			if (!currentAutomation) {
				return;
			}
			runBtn.enabled = false;
			runBtn.setAriaLabel(runningLabel);
			runBtn.setTitle(runningLabel);
			disposableTimeout(() => {
				runBtn.enabled = true;
				runBtn.setAriaLabel(runNowLabel);
				runBtn.setTitle(runNowLabel);
			}, 10_000, disposables);
			void this.runNow(currentAutomation);
		}));

		const deleteBtn = this.createIconButton(buttonBar, Codicon.trash, localize('deleteAutomation', "Delete"), false);
		disposables.add(deleteBtn.onDidClick(() => {
			const currentAutomation = this.latestAutomations.get(automation.id);
			if (!currentAutomation) {
				return;
			}
			void this.confirmDelete(currentAutomation);
		}));

		for (const eventType of [DOM.EventType.CLICK, TouchEventType.Tap]) {
			disposables.add(DOM.addDisposableListener(card, eventType, event => {
				const target = (event as GestureEvent).initialTarget ?? event.target;
				if (target instanceof Node && DOM.isAncestor(target, actions)) {
					return;
				}
				const currentAutomation = this.latestAutomations.get(automation.id);
				if (!currentAutomation) {
					return;
				}
				void this.openEditDialog(currentAutomation);
			}));
		}

		const entry = {
			element: wrapper,
			card,
			main,
			actions,
			nameText: nameTextEl,
			scheduleEl,
			folderEl,
			folderHover,
			promptEl,
			disabledBadge,
			disposables,
		};
		this.updateCard(entry, automation);
		return entry;
	}

	private updateCard(card: IAutomationCardEntry, automation: IAutomationDescriptor, previous?: IAutomationDescriptor): void {
		const schedule = formatSchedule(automation);
		const scheduleChanged = !previous || formatSchedule(previous) !== schedule;
		const nameChanged = !previous || previous.name !== automation.name;
		if (nameChanged || scheduleChanged) {
			card.card.setAttribute('aria-label', localize('automationCard', "{0} — {1}", automation.name, schedule));
		}
		if (nameChanged) {
			card.main.setAttribute('aria-label', localize('editAutomationNamed', "Edit automation {0}", automation.name));
			card.actions.setAttribute('aria-label', localize('automationActions', "Actions for {0}", automation.name));
			card.nameText.textContent = automation.name;
		}
		if (!previous || previous.enabled !== automation.enabled) {
			card.disabledBadge.style.display = automation.enabled ? 'none' : '';
		}
		if (scheduleChanged) {
			card.scheduleEl.textContent = schedule;
		}

		const folderLabel = getAutomationTargetLabel(automation.target);
		if (!previous || getAutomationTargetLabel(previous.target) !== folderLabel) {
			card.folderEl.textContent = folderLabel;
			card.folderHover.value = this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), card.folderEl, folderLabel);
		}

		if (!previous || previous.prompt !== automation.prompt) {
			const maxLength = 120;
			card.promptEl.textContent = automation.prompt.length > maxLength
				? automation.prompt.slice(0, maxLength) + '…'
				: automation.prompt;
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
		const title = DOM.append(this.emptyContainer, $('h3.automations-cards-empty-title'));
		title.textContent = localize('noAutomationsYet', "No automations yet");
		const desc = DOM.append(this.emptyContainer, $('p.automations-cards-empty-description'));
		desc.textContent = localize('noAutomationsDesc', "Create an automation to schedule an agent session to run on a cadence you choose.");

		const createButton = this.emptyStateDisposables.add(new Button(this.emptyContainer, {
			...defaultButtonStyles,
			title: localize('createAutomation', "Create Automation"),
		}));
		createButton.label = localize('createAutomation', "Create Automation");
		createButton.element.classList.add('automations-cards-create-button');
		this.emptyStateDisposables.add(createButton.onDidClick(() => this.openCreateDialog()));
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
		try {
			const result = await this.automationDialogService.showAutomationDialog({ existing: automation });
			if (!result || result.kind !== 'update') {
				return;
			}
			if (!await this.ensureEnabled()) {
				return;
			}
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
 * Renders the run history list grouped by date. Groups are persistent to avoid
 * the context-key default-value flash that a full tear-down/rebuild would cause.
 */
class AutomationHistorySection extends Disposable {

	private readonly container: HTMLElement;
	private readonly groupsContainer: HTMLElement;
	private readonly headerDisposables = this._register(new DisposableStore());
	private readonly persistentGroups = new Map<string, IAutomationHistoryGroup>();
	private readonly runFocusTargets = new Map<string, { readonly list: SessionsFlatList; readonly session: ISession }>();
	private readonly approvalModel: AgentSessionApprovalModel;
	private renderedFocusableRunIds: string[] = [];
	private pendingFocusRunId: string | undefined;
	private shouldRestoreFocus = false;
	private headerRow: HTMLElement | undefined;
	private markAllButton: Button | undefined;
	private readonly currentRuns = observableValue<readonly IAutomationRun[]>(this, []);
	private readonly currentSessions = observableValue<ReadonlyMap<string, ISession>>(this, new Map());

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
		this.approvalModel = this._register(this.instantiationService.createInstance(AgentSessionApprovalModel));
	}

	render(runs: readonly IAutomationRun[], sessions: ReadonlyMap<string, ISession>): void {
		const sessionRuns = runs.filter(run => sessions.has(run.id));
		const visibleRuns = runs.filter(run =>
			sessions.has(run.id)
			|| isTemporaryAutomationRun(run)
			|| (!!run.sessionResource && !!this.sessionsManagementService.getSession(run.sessionResource))
		);
		transaction(tx => {
			this.currentRuns.set(sessionRuns, tx);
			this.currentSessions.set(sessions, tx);
		});
		this.runFocusTargets.clear();
		this.renderedFocusableRunIds = [];

		if (visibleRuns.length === 0) {
			this.container.style.display = 'none';
			this.disposeAllGroups();
			this.restoreFocusAfterRender();
			return;
		}

		this.container.style.display = '';
		this.ensureHeader();

		const groups = groupRunsByDate(visibleRuns);
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
			const sessionItems = this.resolveSessionItems(group.runs, sessions);
			const temporaryRuns = group.runs.filter(run => !sessions.has(run.id));

			let entry = this.persistentGroups.get(group.key);
			if (entry) {
				if (entry.header.textContent !== group.label) {
					entry.header.textContent = group.label;
				}
				this.updateTemporaryRuns(entry, temporaryRuns);
				this.updateGroupSessions(entry, sessionItems);
			} else {
				entry = this.createGroup(group.key, group.label, temporaryRuns, sessionItems);
			}

			const currentElement = this.groupsContainer.children.item(index);
			if (currentElement !== entry.element) {
				this.groupsContainer.insertBefore(entry.element, currentElement);
				if (entry.list) {
					this.layoutSessionList(entry.listContainer, entry.list);
				}
			}
			index++;

			for (const item of sessionItems) {
				if (!entry.list) {
					continue;
				}
				this.renderedFocusableRunIds.push(item.run.id);
				this.runFocusTargets.set(item.run.id, { list: entry.list, session: item.session });
			}
		}

		this.restoreFocusAfterRender();
	}

	layout(): void {
		for (const entry of this.persistentGroups.values()) {
			if (entry.list) {
				this.layoutSessionList(entry.listContainer, entry.list);
			}
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
			void this.markAllRunsRead(this.currentRuns.get());
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
				items.push({ run, session });
			}
		}
		return items;
	}

	private createGroup(key: string, label: string, temporaryRuns: readonly IAutomationRun[], items: readonly IAutomationHistoryItem[]): IAutomationHistoryGroup {
		const disposables = new DisposableStore();
		const element = $('.automations-history-group');
		const header = DOM.append(element, $('.automations-history-group-header'));
		header.textContent = label;
		const runsContainer = DOM.append(element, $('.automations-history-group-runs'));
		const temporaryRowsContainer = DOM.append(runsContainer, $('.automations-temporary-runs'));
		const listContainer = DOM.append(runsContainer, $('.automations-run-session-list'));

		const runsBySession = new Map<string, IAutomationRun>();
		const entry: IAutomationHistoryGroup = {
			element,
			header,
			temporaryRowsContainer,
			temporaryRows: disposables.add(new DisposableMap()),
			listContainer,
			listDisposables: disposables.add(new MutableDisposable()),
			list: undefined,
			runsBySession,
			sessions: [],
			disposables,
		};
		this.persistentGroups.set(key, entry);

		this.updateTemporaryRuns(entry, temporaryRuns);
		this.updateGroupSessions(entry, items);
		return entry;
	}

	private ensureGroupList(entry: IAutomationHistoryGroup): SessionsFlatList {
		if (entry.list) {
			return entry.list;
		}

		const disposables = new DisposableStore();
		const list = disposables.add(this.instantiationService.createInstance(SessionsFlatList, entry.listContainer, {
			showSessionHover: false,
			alwaysConsumeMouseWheel: false,
			useCompactQuickChatRows: false,
			toolbarMenuId: Menus.AutomationsHistoryItem,
			markSessionReadOnOpen: false,
			approvalModel: this.approvalModel,
			onSessionOpen: resource => void this.openRunSession(resource),
			onToolbarAction: (action, session) => this.handleSessionToolbarAction(action, session, entry.runsBySession),
		}));
		disposables.add(list.onDidChangeContentHeight(() => this.layoutSessionList(entry.listContainer, list)));
		entry.list = list;
		entry.listDisposables.value = disposables;
		return list;
	}

	private updateTemporaryRuns(entry: IAutomationHistoryGroup, runs: readonly IAutomationRun[]): void {
		const activeRunIds = new Set(runs.map(run => run.id));
		for (const runId of entry.temporaryRows.keys()) {
			if (!activeRunIds.has(runId)) {
				entry.temporaryRows.deleteAndDispose(runId);
			}
		}

		let index = 0;
		for (const run of runs) {
			const title = this.getAutomationName(run);
			let row = entry.temporaryRows.get(run.id);
			if (!row) {
				row = this.createTemporaryRunRow(title);
				entry.temporaryRows.set(run.id, row);
			} else if (row.title.textContent !== title) {
				row.title.textContent = title;
				row.element.setAttribute('aria-label', localize('automationRunWorkingAriaLabel', "{0}, Working...", title));
			}

			const currentElement = entry.temporaryRowsContainer.children.item(index);
			if (currentElement !== row.element) {
				entry.temporaryRowsContainer.insertBefore(row.element, currentElement);
			}
			index++;
		}
	}

	private createTemporaryRunRow(title: string): IAutomationTemporaryRunRow {
		const disposables = new DisposableStore();
		const element = $('.automations-temporary-run.session-item');
		element.setAttribute('role', 'group');
		element.setAttribute('aria-label', localize('automationRunWorkingAriaLabel', "{0}, Working...", title));
		const icon = DOM.append(element, $('.session-icon'));
		const statusIcon = disposables.add(this.instantiationService.createInstance(SessionStatusIcon, icon));
		statusIcon.setStatus(SessionStatus.InProgress, true, false);
		const main = DOM.append(element, $('.session-main'));
		const titleRow = DOM.append(main, $('.session-title-row'));
		const titleElement = DOM.append(titleRow, $('span.session-title'));
		titleElement.textContent = title;
		const detailsRow = DOM.append(main, $('.session-details-row'));
		DOM.append(detailsRow, $('span.session-description')).textContent = localize('automationRunWorking', "Working...");
		return {
			element,
			title: titleElement,
			dispose: () => {
				disposables.dispose();
				element.remove();
			},
		};
	}

	private updateGroupSessions(
		entry: IAutomationHistoryGroup,
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
		if (sessions.length === 0) {
			entry.list = undefined;
			entry.listDisposables.clear();
			DOM.clearNode(entry.listContainer);
			entry.listContainer.style.height = '';
			return;
		}
		const list = this.ensureGroupList(entry);
		list.setSessions(sessions);
		this.layoutSessionList(entry.listContainer, list);
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
		// Capture focus before the confirmation dialog moves it.
		const hadFocus = this.container.contains(DOM.getActiveElement());
		const confirmed = await this.dialogService.confirm({
			message: localize('confirmDeleteAutomationRunSession', "Delete the session for \"{0}\"?", automationName),
			detail: localize('confirmDeleteAutomationRunSessionDetail', "This will permanently delete the session and remove this item from run history. This action cannot be undone."),
			primaryButton: localize('delete', "Delete"),
		});
		if (!confirmed.confirmed) {
			return;
		}
		const focusRunId = hadFocus ? this.getFocusRunIdAfterDeletion(run.id) : undefined;
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
		if (hadFocus) {
			this.pendingFocusRunId = focusRunId;
			this.shouldRestoreFocus = true;
		}
		try {
			await this.automationService.deleteRun(run.id);
			this.restoreFocusAfterRender();
			status(localize('automationRunSessionDeletedStatus', "Deleted the session for {0}", automationName));
		} catch (error) {
			this.restoreFocusAfterRender();
			this.logService.error('[AutomationsCards] Failed to remove deleted automation run from history', error);
			await this.dialogService.error(
				localize('automationRunHistoryDeleteFailed', "The session was deleted, but its run history item could not be removed."),
				getErrorMessage(error),
			);
		}
	}

	private getFocusRunIdAfterDeletion(runId: string): string | undefined {
		const index = this.renderedFocusableRunIds.indexOf(runId);
		return index >= 0
			? this.renderedFocusableRunIds[index + 1] ?? this.renderedFocusableRunIds[index - 1]
			: undefined;
	}

	private restoreFocusAfterRender(): void {
		if (!this.shouldRestoreFocus) {
			return;
		}
		const target = this.pendingFocusRunId ? this.runFocusTargets.get(this.pendingFocusRunId) : undefined;
		this.clearPendingFocus();
		if (target) {
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

function isUnreadAutomationRun(run: IAutomationRun, session: ISession | undefined, reader: IReader): boolean {
	return (run.status === 'completed' || run.status === 'failed') && !!session && !session.isRead.read(reader);
}

function isTemporaryAutomationRun(run: IAutomationRun): boolean {
	return run.status === 'pending' || run.status === 'running';
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
	return target.kind === 'workspace' ? basename(target.folderUri) : localize('quickChat', "No workspace");
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

		this._register(registerAutomationHistoryItemActions());

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

function registerAutomationHistoryItemActions(): IDisposable {
	return combinedDisposable(
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
		}),
		MenuRegistry.appendMenuItem(Menus.AutomationsHistoryItem, {
			command: {
				id: DELETE_AUTOMATION_RUN_SESSION_COMMAND_ID,
				title: localize('deleteAutomationRunSessionAction', "Delete"),
				icon: Codicon.trash,
			},
			group: 'navigation',
			order: 1,
			when: ContextKeyExpr.and(
				SessionSupportsDeleteContext,
				ContextKeyExpr.or(
					SessionItemStatusContext.isEqualTo(SessionStatus.Completed),
					SessionItemStatusContext.isEqualTo(SessionStatus.Error),
				),
			),
		}),
	);
}

class PrimaryButtonActionViewItem extends BaseActionViewItem {

	private button: Button | undefined;

	constructor(context: unknown, action: IAction, options: IActionViewItemOptions) {
		super(context, action, options);
	}

	override render(container: HTMLElement): void {
		this.element = container;
		container.classList.add('chat-pill-item');
		const button = this.button = this._register(new Button(container, { secondary: false, ...defaultButtonStyles }));
		button.element.classList.add('monaco-text-button', 'chat-pill-button');
		this._register(button.onDidClick(() => {
			if (this._action.enabled) {
				this.actionRunner.run(this._action, this._context);
			}
		}));
		this.updateLabel();
		this.updateEnabled();
	}

	// Focus must restore the tab stop that `blur` removed, otherwise arrow
	// navigation can leave the containing toolbar with no tabbable item.
	override focus(): void { if (this.button) { this.button.element.tabIndex = 0; this.button.focus(); } }
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
