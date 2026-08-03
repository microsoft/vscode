/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/automationsCards.css';
import './automationsAccessibility.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import type { IAutomation, IAutomationRun, AutomationRunStatus } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IAutomationRunner } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationDialogService } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { DAYS_OF_WEEK } from '../../../../../workbench/contrib/chat/common/automations/schedule.js';
import { automationIcon } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js';
import { basename } from '../../../../../base/common/resources.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { createPixelSpinner } from '../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { Gesture, GestureEvent, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { URI } from '../../../../../base/common/uri.js';

import { AbstractCustomView } from '../../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { Menus } from '../../../../browser/menus.js';
import { Action2, MenuItemAction, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../base/common/actions.js';
import { AutomationsCustomViewFocusContext } from '../../../../common/contextkeys.js';

const $ = DOM.$;

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
		this.historySection = this._register(instantiationService.createInstance(AutomationHistorySection, scrollContent, this.isMarkingAllRead));

		this._register(autorun(reader => {
			const items = this.automationService.automations.read(reader);
			this.cardsSection.render(items);
		}));

		this._register(autorun(reader => {
			if (this.isMarkingAllRead.read(reader)) {
				return;
			}
			const items = this.automationService.automations.read(reader);
			const allRuns = this.automationService.runs.read(reader);
			const sessions = new Map<string, IAutomationRunSessionState>();
			for (const run of allRuns) {
				if (!run.sessionResource) {
					continue;
				}
				const session = this.sessionsManagementService.getSession(URI.parse(run.sessionResource));
				if (session) {
					sessions.set(run.id, { isRead: session.isRead.read(reader) });
				}
			}
			this.historySection.render(allRuns, items, sessions);
		}));
	}

	layout(width: number, height: number): void {
		this.element.style.width = `${width}px`;
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

	render(automations: readonly IAutomation[]): void {
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

	private renderCard(automation: IAutomation): void {
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
		const folderLabel = automation.target.kind === 'workspace' ? basename(automation.target.folderUri) : localize('quickChat', "Quick Chat");
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
		const runBtn = this.createIconButton(actions, Codicon.play, localize('runNow', "Run now"), false);
		this.disposables.add(runBtn.onDidClick(() => {
			void this.runNow(automation);
		}));

		const deleteBtn = this.createIconButton(actions, Codicon.trash, localize('deleteAutomation', "Delete"), false);
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

	private createIconButton(container: HTMLElement, icon: ThemeIcon, tooltip: string, disabled: boolean): Button {
		const button = this.disposables.add(new Button(container, {
			ariaLabel: tooltip,
			disabled,
			supportIcons: true,
			title: tooltip,
		}));
		button.label = `$(${icon.id})`;
		button.element.classList.add('automations-card-action-button');
		return button;
	}

	private async runNow(automation: IAutomation): Promise<void> {
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

		const icon = DOM.append(this.emptyContainer, $('span.automations-cards-empty-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(automationIcon));
		const title = DOM.append(this.emptyContainer, $('h3.automations-cards-empty-title'));
		title.textContent = localize('noAutomationsYet', "No automations yet");
		const desc = DOM.append(this.emptyContainer, $('p.automations-cards-empty-description'));
		desc.textContent = localize('noAutomationsDesc', "Create an automation to schedule an agent session to run on a cadence you choose.");

		const createButton = this.disposables.add(new Button(this.emptyContainer, {
			...defaultButtonStyles,
			title: localize('createAutomation', "Create automation"),
		}));
		createButton.label = localize('createAutomation', "Create automation");
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

	private async openEditDialog(automation: IAutomation): Promise<void> {
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

	private async confirmDelete(automation: IAutomation): Promise<void> {
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
 */
class AutomationHistorySection extends Disposable {

	private readonly container: HTMLElement;
	private readonly disposables = this._register(new DisposableStore());

	constructor(
		parent: HTMLElement,
		private readonly isMarkingAllRead: ISettableObservable<boolean>,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
	) {
		super();
		this.container = DOM.append(parent, $('.automations-history'));
	}

	render(runs: readonly IAutomationRun[], automations: readonly IAutomation[], sessions: ReadonlyMap<string, IAutomationRunSessionState>): void {
		this.disposables.clear();
		DOM.clearNode(this.container);

		if (runs.length === 0) {
			this.container.style.display = 'none';
			return;
		}

		this.container.style.display = '';

		const headerRow = DOM.append(this.container, $('.automations-history-header'));
		const headerLabel = DOM.append(headerRow, $('span'));
		headerLabel.textContent = localize('historyHeader', "History");

		const automationMap = new Map(automations.map(a => [a.id, a]));
		const hasUnread = runs.some(run => isUnreadAutomationRun(run, sessions.get(run.id)));
		if (hasUnread) {
			const markAllButton = this.disposables.add(new Button(headerRow, {
				...defaultButtonStyles,
				secondary: true,
				title: localize('markAllRead', "Mark all as read"),
			}));
			markAllButton.label = localize('markAllRead', "Mark all as read");
			markAllButton.element.classList.add('automations-mark-all-read');
			this.disposables.add(markAllButton.onDidClick(() => {
				markAllButton.enabled = false;
				void this.markAllRunsRead(runs);
			}));
		}

		const groups = groupRunsByDate(runs);

		for (const group of groups) {
			const groupEl = DOM.append(this.container, $('.automations-history-group'));
			const groupHeader = DOM.append(groupEl, $('.automations-history-group-header'));
			groupHeader.textContent = group.label;

			const groupGrid = DOM.append(groupEl, $('.automations-run-cards-grid'));
			for (const run of group.runs) {
				this.renderRunRow(groupGrid, run, automationMap, group.kind, sessions.get(run.id));
			}
		}
	}

	private renderRunRow(parent: HTMLElement, run: IAutomationRun, automationMap: Map<string, IAutomation>, bucketKind: DateBucketKind, sessionState: IAutomationRunSessionState | undefined): void {
		const isUnread = isUnreadAutomationRun(run, sessionState);
		const card = DOM.append(parent, $('.automations-run-card'));
		if (isUnread) {
			card.classList.add('unread');
		}

		const automation = automationMap.get(run.automationId);
		const title = automation?.name ?? localize('unknownAutomation', "Unknown");
		const statusLabel = getRunStatusLabel(run.status);
		const timestamp = formatTimestamp(run.startedAt, bucketKind);
		const ariaLabelParts = [title];
		if (automation?.target.kind === 'workspace') {
			ariaLabelParts.push(basename(automation.target.folderUri));
		}
		ariaLabelParts.push(statusLabel, timestamp);
		if (run.errorMessage) {
			ariaLabelParts.push(localize('automationRunErrorAriaLabel', "Error: {0}", run.errorMessage));
		}
		if (isUnread) {
			ariaLabelParts.push(localize('automationRunUnreadAriaLabel', "Unread"));
		}
		card.setAttribute('role', 'group');
		card.setAttribute('aria-label', ariaLabelParts.join(', '));

		const nameEl = DOM.append(card, $('.automations-run-card-name'));
		if (isUnread) {
			DOM.append(nameEl, $('span.automations-run-card-unread-dot'));
		}
		const titleSpan = DOM.append(nameEl, $('span.automations-run-card-name-title'));
		titleSpan.textContent = title;
		if (automation?.target.kind === 'workspace') {
			const suffixSpan = DOM.append(nameEl, $('span.automations-run-card-name-workspace'));
			suffixSpan.textContent = ` \u00B7 ${basename(automation.target.folderUri)}`;
		}

		// Status icon + timestamp + error (single row)
		const statusRow = DOM.append(card, $('.automations-run-card-status-row'));

		if (run.status === 'running' || run.status === 'pending') {
			const spinnerContainer = DOM.append(statusRow, $('span.automations-run-card-icon'));
			spinnerContainer.setAttribute('aria-hidden', 'true');
			this.disposables.add(createPixelSpinner(spinnerContainer, { variant: 'grid' }));
		} else {
			const statusInfo = runStatusIcon(run.status);
			const iconEl = DOM.append(statusRow, $('span.automations-run-card-icon.codicon'));
			iconEl.classList.add(`codicon-${statusInfo.iconId}`);
			iconEl.setAttribute('aria-hidden', 'true');
		}

		const timeEl = DOM.append(statusRow, $('span.automations-run-card-time'));
		timeEl.textContent = timestamp;

		if (run.errorMessage) {
			DOM.append(statusRow, $('.meta-sep')).textContent = '\u00B7';
			const errorEl = DOM.append(statusRow, $('span.automations-run-card-error'));
			errorEl.textContent = run.errorMessage;
		}

		if (run.sessionResource && sessionState) {
			card.classList.add('clickable');
			card.setAttribute('tabindex', '0');
			card.setAttribute('role', 'button');
			this.disposables.add(Gesture.addTarget(card));
			const activate = () => this.openRunSession(run);
			for (const eventType of [DOM.EventType.CLICK, TouchEventType.Tap]) {
				this.disposables.add(DOM.addDisposableListener(card, eventType, () => {
					void activate();
				}));
			}
			this.disposables.add(DOM.addDisposableListener(card, DOM.EventType.KEY_DOWN, event => {
				if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
					event.preventDefault();
					void activate();
				}
			}));
		}
	}

	private async openRunSession(run: IAutomationRun): Promise<void> {
		if (!run.sessionResource) {
			return;
		}
		const resource = URI.parse(run.sessionResource);
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

	private async markAllRunsRead(runs: readonly IAutomationRun[]): Promise<void> {
		this.isMarkingAllRead.set(true, undefined);
		const sessions = new Map<string, ISession>();
		try {
			for (const run of runs) {
				if ((run.status === 'completed' || run.status === 'failed') && run.sessionResource) {
					const session = this.sessionsManagementService.getSession(URI.parse(run.sessionResource));
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

interface IAutomationRunSessionState {
	readonly isRead: boolean;
}

function isUnreadAutomationRun(run: IAutomationRun, sessionState: IAutomationRunSessionState | undefined): boolean {
	return (run.status === 'completed' || run.status === 'failed') && !!sessionState && !sessionState.isRead;
}

function formatSchedule(automation: IAutomation): string {
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

function groupRunsByDate(runs: readonly IAutomationRun[]): { label: string; kind: DateBucketKind; runs: IAutomationRun[] }[] {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	const lastWeekStart = new Date(today);
	lastWeekStart.setDate(lastWeekStart.getDate() - 7);

	const groups: Map<string, { label: string; kind: DateBucketKind; order: number; runs: IAutomationRun[] }> = new Map();

	for (const run of runs) {
		const t = Date.parse(run.startedAt);
		if (Number.isNaN(t)) {
			continue;
		}
		const date = new Date(t);
		const { label, kind, order } = getDateBucket(date, today, yesterday, lastWeekStart);

		let group = groups.get(label);
		if (!group) {
			group = { label, kind, order, runs: [] };
			groups.set(label, group);
		}
		group.runs.push(run);
	}

	return [...groups.values()].sort((a, b) => a.order - b.order);
}

function getDateBucket(date: Date, today: Date, yesterday: Date, lastWeekStart: Date): { label: string; kind: DateBucketKind; order: number } {
	if (date >= today) {
		return { label: localize('today', "Today"), kind: 'today', order: 0 };
	}
	if (date >= yesterday) {
		return { label: localize('yesterday', "Yesterday"), kind: 'yesterday', order: 1 };
	}
	if (date >= lastWeekStart) {
		return { label: localize('lastWeek', "Last week"), kind: 'week', order: 2 };
	}
	const monthLabel = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
	const monthIndex = date.getFullYear() * 12 + date.getMonth();
	const order = 30000 - monthIndex;
	return { label: monthLabel, kind: 'month', order };
}

function runStatusIcon(s: AutomationRunStatus): { iconId: string; spin: boolean } {
	switch (s) {
		case 'pending': return { iconId: 'circle-outline', spin: false };
		case 'running': return { iconId: 'sync', spin: true };
		case 'completed': return { iconId: 'check', spin: false };
		case 'failed': return { iconId: 'error', spin: false };
	}
}

function getRunStatusLabel(status: AutomationRunStatus): string {
	switch (status) {
		case 'pending': return localize('automationRunPending', "Pending");
		case 'running': return localize('automationRunRunning', "Running");
		case 'completed': return localize('automationRunCompleted', "Completed");
		case 'failed': return localize('automationRunFailed', "Failed");
	}
}

function formatTimestamp(iso: string, kind: DateBucketKind): string {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) {
		return iso;
	}
	const date = new Date(t);
	const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

	switch (kind) {
		case 'today':
		case 'yesterday':
			return time;
		case 'week':
			return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
		case 'month':
			return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
	}
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
class AutomationsCustomViewContribution extends Disposable {

	static readonly ID = 'sessions.contrib.automationsCustomView';

	constructor(
		@ICustomViewService customViewService: ICustomViewService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this._register(customViewService.registerCustomView({
			id: AUTOMATIONS_CUSTOM_VIEW_ID,
			ctor: new SyncDescriptor(AutomationsCustomView),
			actions: { style: 'buttonBar', menuId: Menus.CustomViewAutomations },
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
			menu: [{ id: Menus.CustomViewAutomations, group: 'navigation', order: 1, when: ChatAutomationsEnabledContext }],
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
