/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/automationsCards.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import type { IAutomation, IAutomationRun, AutomationRunStatus } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IAutomationRunner } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationDialogService } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { automationIcon } from '../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js';
import { basename } from '../../../../../base/common/resources.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { createPixelSpinner } from '../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
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

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.element = $('.automations-cards-widget');
		const scrollContent = DOM.append(this.element, $('.automations-cards-scroll-content'));

		this.cardsSection = this._register(instantiationService.createInstance(AutomationCardsSection, scrollContent));
		this.historySection = this._register(instantiationService.createInstance(AutomationHistorySection, scrollContent));

		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, AutomationHistorySection.READ_AUTOMATION_RUNS_KEY, this._store)(() => {
			this.historySection.invalidateReadState();
		}));

		this._register(autorun(reader => {
			const items = this.automationService.automations.read(reader);
			this.cardsSection.render(items);
		}));

		this._register(autorun(reader => {
			const items = this.automationService.automations.read(reader);
			const allRuns = this.automationService.runs.read(reader);
			this.historySection.readStateVersion.read(reader);
			this.historySection.render(allRuns, items);
		}));
	}

	layout(width: number, height: number): void {
		this.element.style.width = `${width}px`;
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
		card.setAttribute('tabindex', '0');
		card.setAttribute('role', 'group');
		card.setAttribute('aria-label', localize('automationCard', "{0} — {1}", automation.name, formatSchedule(automation)));

		// Enter/Space on the card opens edit
		this.disposables.add(DOM.addDisposableListener(card, 'keydown', (e: KeyboardEvent) => {
			if ((e.key === 'Enter' || e.key === ' ') && e.target === card) {
				e.preventDefault();
				this.openEditDialog(automation);
			}
		}));

		const main = DOM.append(card, $('.automations-card-main'));

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

		const folderEl = DOM.append(metaEl, $('span.automations-card-meta-item'));
		folderEl.textContent = automation.target.kind === 'workspace' ? basename(automation.target.folderUri) : localize('quickChat', "Quick Chat");

		// Prompt preview (truncated)
		const promptEl = DOM.append(main, $('.automations-card-prompt'));
		const maxLength = 120;
		promptEl.textContent = automation.prompt.length > maxLength
			? automation.prompt.slice(0, maxLength) + '…'
			: automation.prompt;

		// Action buttons (icon-only with hover tooltips)
		const actions = DOM.append(card, $('.automations-card-actions'));
		actions.setAttribute('role', 'toolbar');
		actions.setAttribute('aria-label', localize('automationActions', "Actions for {0}", automation.name));
		const runBtn = this.createIconButton(actions, Codicon.play, localize('runNow', "Run now"), false);
		this.disposables.add(DOM.addStandardDisposableListener(runBtn, 'click', (e) => {
			DOM.EventHelper.stop(e, true);
			this.automationRunner.runOnce(automation, 'manual', 0, CancellationToken.None);
		}));

		const deleteBtn = this.createIconButton(actions, Codicon.trash, localize('deleteAutomation', "Delete"), false);
		this.disposables.add(DOM.addStandardDisposableListener(deleteBtn, 'click', (e) => {
			DOM.EventHelper.stop(e, true);
			this.confirmDelete(automation);
		}));

		// Click card to edit
		this.disposables.add(DOM.addDisposableListener(card, 'click', () => {
			this.openEditDialog(automation);
		}));
	}

	private createIconButton(container: HTMLElement, icon: ThemeIcon, tooltip: string, disabled: boolean): HTMLElement {
		const button = DOM.append(container, $('button.automations-card-action-button', {
			type: 'button',
			'aria-label': tooltip,
			tabindex: '0',
		})) as HTMLButtonElement;
		button.classList.add(...ThemeIcon.asClassNameArray(icon));
		button.disabled = disabled;
		this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), button, tooltip));
		return button;
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
		const result = await this.automationDialogService.showAutomationDialog({});
		if (!result || result.kind !== 'create') {
			return;
		}
		try {
			const created = await this.automationService.createAutomation(result.value);
			status(localize('automationCreatedStatus', "Created automation {0}", created.name));
		} catch (err) {
			this.logService.error('[AutomationsCards] Failed to create automation', err);
		}
	}

	private async openEditDialog(automation: IAutomation): Promise<void> {
		const result = await this.automationDialogService.showAutomationDialog({ existing: automation });
		if (!result || result.kind !== 'update') {
			return;
		}
		try {
			await this.automationService.updateAutomation(result.id, result.value);
			status(localize('automationUpdatedStatus', "Updated automation {0}", automation.name));
		} catch (err) {
			this.logService.error('[AutomationsCards] Failed to update automation', err);
		}
	}

	private async confirmDelete(automation: IAutomation): Promise<void> {
		const confirmed = await this.dialogService.confirm({
			message: localize('confirmDeleteAutomation', "Delete automation \"{0}\"?", automation.name),
			detail: localize('confirmDeleteDetail', "This will permanently delete the automation and its run history."),
			primaryButton: localize('delete', "Delete"),
		});
		if (!confirmed.confirmed) {
			return;
		}
		try {
			await this.automationService.deleteAutomation(automation.id);
			status(localize('automationDeletedStatus', "Deleted automation {0}", automation.name));
		} catch (err) {
			this.logService.error('[AutomationsCards] Failed to delete automation', err);
		}
	}
}

//#endregion

//#region AutomationHistorySection

/**
 * Renders the run history list grouped by date.
 */
class AutomationHistorySection extends Disposable {

	static readonly READ_AUTOMATION_RUNS_KEY = 'sessionsListControl.readAutomationRuns';

	readonly readStateVersion = observableValue<number>('automationEditorReadState', 0);

	private readonly container: HTMLElement;
	private readonly disposables = this._register(new DisposableStore());

	constructor(
		parent: HTMLElement,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IStorageService private readonly storageService: IStorageService,
		@IAutomationService private readonly automationService: IAutomationService,
	) {
		super();
		this.container = DOM.append(parent, $('.automations-history'));
	}

	invalidateReadState(): void {
		this.readStateVersion.set(this.readStateVersion.get() + 1, undefined);
	}

	render(runs: readonly IAutomationRun[], automations: readonly IAutomation[]): void {
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
		const readIds = this.getReadRunIds();

		// Show "Mark all as read" if there are unread runs with valid sessions
		const hasUnread = runs.some(r =>
			(r.status === 'completed' || r.status === 'failed') && r.sessionResource &&
			!!this.sessionsManagementService.getSession(URI.parse(r.sessionResource)) && !readIds.has(r.id)
		);
		if (hasUnread) {
			const markAllButton = this.disposables.add(new Button(headerRow, {
				...defaultButtonStyles,
				secondary: true,
				title: localize('markAllRead', "Mark all as read"),
			}));
			markAllButton.label = localize('markAllRead', "Mark all as read");
			markAllButton.element.classList.add('automations-mark-all-read');
			this.disposables.add(markAllButton.onDidClick(() => {
				this.markAllRunsRead(runs);
			}));
		}

		const groups = groupRunsByDate(runs);

		for (const group of groups) {
			const groupEl = DOM.append(this.container, $('.automations-history-group'));
			const groupHeader = DOM.append(groupEl, $('.automations-history-group-header'));
			groupHeader.textContent = group.label;

			const groupGrid = DOM.append(groupEl, $('.automations-run-cards-grid'));
			for (const run of group.runs) {
				this.renderRunRow(groupGrid, run, automationMap, group.kind, readIds);
			}
		}
	}

	private renderRunRow(parent: HTMLElement, run: IAutomationRun, automationMap: Map<string, IAutomation>, bucketKind: DateBucketKind, readIds: Set<string>): void {
		const sessionExists = run.sessionResource && !!this.sessionsManagementService.getSession(URI.parse(run.sessionResource));
		const isUnread = (run.status === 'completed' || run.status === 'failed') && sessionExists && !readIds.has(run.id);
		const card = DOM.append(parent, $('.automations-run-card'));
		if (isUnread) {
			card.classList.add('unread');
		}

		const automation = automationMap.get(run.automationId);

		// Name + workspace on same line
		const nameEl = DOM.append(card, $('.automations-run-card-name'));
		if (isUnread) {
			DOM.append(nameEl, $('span.automations-run-card-unread-dot'));
		}
		const title = automation?.name ?? localize('unknownAutomation', "Unknown");
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
			createPixelSpinner(spinnerContainer, { variant: 'grid' });
		} else {
			const statusInfo = runStatusIcon(run.status);
			const iconEl = DOM.append(statusRow, $('span.automations-run-card-icon.codicon'));
			iconEl.classList.add(`codicon-${statusInfo.iconId}`);
		}

		const timeEl = DOM.append(statusRow, $('span.automations-run-card-time'));
		timeEl.textContent = formatTimestamp(run.startedAt, bucketKind);

		if (run.errorMessage) {
			DOM.append(statusRow, $('.meta-sep')).textContent = '\u00B7';
			const errorEl = DOM.append(statusRow, $('span.automations-run-card-error'));
			errorEl.textContent = run.errorMessage;
		}

		if (run.sessionResource) {
			card.classList.add('clickable');
			card.setAttribute('tabindex', '0');
			card.setAttribute('role', 'button');
			this.disposables.add(DOM.addDisposableListener(card, 'click', () => {
				const session = this.sessionsManagementService.getSession(URI.parse(run.sessionResource!));
				if (!session) {
					return;
				}
				this.markRunRead(run.id);
				this.sessionsService.openSession(URI.parse(run.sessionResource!), { preserveFocus: false });
			}));
		}
	}

	private markRunRead(runId: string): void {
		const raw = this.storageService.get(AutomationHistorySection.READ_AUTOMATION_RUNS_KEY, StorageScope.PROFILE);
		let ids: string[];
		try {
			ids = raw ? JSON.parse(raw) : [];
		} catch {
			ids = [];
		}
		if (!ids.includes(runId)) {
			ids.push(runId);
			// Prune stale IDs to prevent unbounded growth
			const currentRunIds = new Set(this.automationService.runs.get().map(r => r.id));
			ids = ids.filter(id => id === runId || currentRunIds.has(id));
			this.storageService.store(
				AutomationHistorySection.READ_AUTOMATION_RUNS_KEY,
				JSON.stringify(ids),
				StorageScope.PROFILE,
				StorageTarget.USER,
			);
		}
	}

	private getReadRunIds(): Set<string> {
		const raw = this.storageService.get(AutomationHistorySection.READ_AUTOMATION_RUNS_KEY, StorageScope.PROFILE);
		try {
			return new Set(raw ? JSON.parse(raw) : []);
		} catch {
			return new Set();
		}
	}

	private markAllRunsRead(runs: readonly IAutomationRun[]): void {
		const ids: string[] = [];
		for (const run of runs) {
			if ((run.status === 'completed' || run.status === 'failed') && run.sessionResource) {
				if (this.sessionsManagementService.getSession(URI.parse(run.sessionResource))) {
					ids.push(run.id);
				}
			}
		}
		this.storageService.store(
			AutomationHistorySection.READ_AUTOMATION_RUNS_KEY,
			JSON.stringify(ids),
			StorageScope.PROFILE,
			StorageTarget.USER,
		);
	}
}

//#endregion

//#region Helpers

type DateBucketKind = 'today' | 'yesterday' | 'week' | 'month';

function formatSchedule(automation: IAutomation): string {
	const { interval, scheduleHour, scheduleMinute } = automation.schedule;
	const hour12 = scheduleHour % 12 || 12;
	const ampm = scheduleHour < 12 ? 'AM' : 'PM';
	const time = `${hour12}:${String(scheduleMinute).padStart(2, '0')} ${ampm}`;
	switch (interval) {
		case 'hourly': return localize('scheduleHourly', "Hourly");
		case 'daily': return localize('scheduleDailyAt', "Daily at {0}", time);
		case 'weekly': {
			const days = [
				localize('sunday', "Sunday"),
				localize('monday', "Monday"),
				localize('tuesday', "Tuesday"),
				localize('wednesday', "Wednesday"),
				localize('thursday', "Thursday"),
				localize('friday', "Friday"),
				localize('saturday', "Saturday"),
			];
			const day = days[automation.schedule.scheduleDay] ?? '';
			return localize('scheduleWeeklyAt', "{0} at {1}", day, time);
		}
		case 'manual': return localize('scheduleManual', "Manual");
		default: return localize('scheduleManual', "Manual");
	}
}

function groupRunsByDate(runs: readonly IAutomationRun[]): { label: string; kind: DateBucketKind; runs: IAutomationRun[] }[] {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today.getTime() - 86400000);
	const lastWeekStart = new Date(today.getTime() - 7 * 86400000);

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
		container.style.outline = 'none';
		this._widget = this._register(this.instantiationService.createInstance(AutomationsCardsWidget));
		container.appendChild(this._widget.element);
	}

	layout(width: number, height: number): void {
		this._widget?.layout(width, height);
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
	) {
		super();

		this._register(customViewService.registerCustomView({
			id: AUTOMATIONS_CUSTOM_VIEW_ID,
			title: localize('automationsTitle', "Automations"),
			ctor: new SyncDescriptor(AutomationsCustomView),
			actions: { style: 'buttonBar', menuId: Menus.CustomViewAutomations },
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
			menu: [{ id: Menus.CustomViewAutomations, group: 'navigation', order: 1 }],
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const automationDialogService = accessor.get(IAutomationDialogService);
		const automationService = accessor.get(IAutomationService);
		const result = await automationDialogService.showAutomationDialog({});
		if (!result || result.kind !== 'create') {
			return;
		}
		await automationService.createAutomation(result.value);
	}
});

//#endregion
