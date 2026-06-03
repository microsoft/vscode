/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IAutomation } from '../../common/automations/automation.js';
import { IAutomationRunner } from '../../common/automations/automationRunner.js';
import { IAutomationService } from '../../common/automations/automationService.js';
import { IFolderChoice, showAutomationDialog } from '../automations/automationDialog.js';

const $ = DOM.$;

/**
 * Widget that renders the Automations section of the AI Customization editor.
 *
 * Subscribes to {@link IAutomationService.automations} via an `autorun` and
 * (re-)renders the row list. Per-row buttons:
 *  - Run Now (calls {@link IAutomationRunner.runOnce})
 *  - Toggle Enabled
 *  - Edit (opens the create/edit modal)
 *  - Delete (with confirmation)
 *
 * The "New automation" button lives in the section header and is also
 * surfaced as the primary action on the empty state.
 */
export class AutomationsListWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount = this._onDidChangeItemCount.event;

	private readonly headerEl: HTMLElement;
	private readonly listEl: HTMLElement;
	private newButton: Button | undefined;
	private newEmptyStateButton: Button | undefined;

	// Per-render row disposables, cleared on every re-render.
	private readonly rowDisposables = this._register(new DisposableStore());

	// Per-automation "run is in progress" set, used to disable the Run
	// Now button so the user cannot double-fire from the UI.
	private readonly runInFlight = new Set<string>();

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@IAutomationRunner private readonly automationRunner: IAutomationRunner,
		@IDialogService private readonly dialogService: IDialogService,
		@IHoverService private readonly hoverService: IHoverService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IHostService private readonly hostService: IHostService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.element = $('.automations-list-widget');
		this.headerEl = DOM.append(this.element, $('.automations-header'));
		this.listEl = DOM.append(this.element, $('.automations-list', { role: 'list', 'aria-label': localize('automationsListAriaLabel', "Automations") }));

		this.renderHeader();

		this._register(autorun(reader => {
			const items = this.automationService.automations.read(reader);
			this.renderList(items);
			this._onDidChangeItemCount.fire(items.length);
		}));
	}

	private renderHeader(): void {
		const titleRow = DOM.append(this.headerEl, $('.automations-header-row'));
		const titleEl = DOM.append(titleRow, $('h3.automations-header-title'));
		titleEl.textContent = localize('automationsHeaderTitle', "Automations");
		const subtitleEl = DOM.append(this.headerEl, $('p.automations-header-subtitle'));
		subtitleEl.textContent = localize('automationsHeaderSubtitle', "Schedule agent sessions to run on a cadence you choose.");

		const newButton = this._register(new Button(titleRow, { ...defaultButtonStyles, title: localize('newAutomation', "New automation") }));
		newButton.label = localize('newAutomation', "New automation");
		newButton.element.classList.add('automations-new-button');
		this._register(newButton.onDidClick(() => this.openCreateDialog()));
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), newButton.element, localize('newAutomationTooltip', "Create a new automation")));
		this.newButton = newButton;
	}

	private renderList(items: readonly IAutomation[]): void {
		this.rowDisposables.clear();
		this.newEmptyStateButton = undefined;
		DOM.clearNode(this.listEl);

		if (items.length === 0) {
			this.renderEmptyState();
			return;
		}

		this.element.classList.remove('automations-empty');
		for (const automation of items) {
			this.renderRow(automation);
		}
	}

	private renderEmptyState(): void {
		this.element.classList.add('automations-empty');
		const empty = DOM.append(this.listEl, $('.automations-empty-state', { role: 'listitem' }));
		const title = DOM.append(empty, $('h3.automations-empty-title'));
		title.textContent = localize('automationsEmptyTitle', "No automations yet");
		const message = DOM.append(empty, $('p.automations-empty-message'));
		message.textContent = localize('automationsEmptyMessage', "Create an automation to schedule an agent session to run on a cadence you choose.");

		const ctaButton = this.rowDisposables.add(new Button(empty, { ...defaultButtonStyles }));
		ctaButton.label = localize('automationsEmptyCta', "Create automation");
		ctaButton.element.classList.add('automations-empty-cta');
		this.rowDisposables.add(ctaButton.onDidClick(() => this.openCreateDialog()));
		this.newEmptyStateButton = ctaButton;
	}

	private renderRow(automation: IAutomation): void {
		const row = DOM.append(this.listEl, $('.automations-row', { role: 'listitem', 'data-automation-id': automation.id }));

		// Left: name + meta
		const main = DOM.append(row, $('.automations-row-main'));
		const nameEl = DOM.append(main, $('.automations-row-name'));
		nameEl.textContent = automation.name;
		if (!automation.enabled) {
			row.classList.add('automations-row-disabled');
			const disabledBadge = DOM.append(nameEl, $('span.automations-row-disabled-badge'));
			disabledBadge.textContent = localize('automationDisabled', "Disabled");
		}

		const metaEl = DOM.append(main, $('.automations-row-meta'));
		const scheduleEl = DOM.append(metaEl, $('span.automations-row-schedule'));
		scheduleEl.textContent = formatSchedule(automation);
		const sep1 = DOM.append(metaEl, $('span.automations-row-meta-sep'));
		sep1.textContent = '·';
		const nextEl = DOM.append(metaEl, $('span.automations-row-next'));
		nextEl.textContent = formatNextRun(automation);

		if (automation.lastRunAt) {
			const sep2 = DOM.append(metaEl, $('span.automations-row-meta-sep'));
			sep2.textContent = '·';
			const lastEl = DOM.append(metaEl, $('span.automations-row-last'));
			lastEl.textContent = localize('lastRun', "Last run {0}", formatRelativeTimeOrIso(automation.lastRunAt));
		}

		const promptEl = DOM.append(main, $('.automations-row-prompt'));
		promptEl.textContent = truncate(automation.prompt, 160);
		promptEl.title = automation.prompt;

		// Right: action buttons
		const actions = DOM.append(row, $('.automations-row-actions'));
		this.renderRunNowAction(actions, automation);
		this.renderToggleAction(actions, automation);
		this.renderEditAction(actions, automation);
		this.renderDeleteAction(actions, automation);
	}

	private renderRunNowAction(container: HTMLElement, automation: IAutomation): void {
		const isInFlight = this.runInFlight.has(automation.id);
		const button = this.createIconButton(container, Codicon.play, localize('runNow', "Run now"), isInFlight);
		this.rowDisposables.add(DOM.addStandardDisposableListener(button, 'click', () => {
			void this.runNow(automation);
		}));
	}

	private renderToggleAction(container: HTMLElement, automation: IAutomation): void {
		const tooltip = automation.enabled
			? localize('disableAutomation', "Disable")
			: localize('enableAutomation', "Enable");
		const icon = automation.enabled ? Codicon.eye : Codicon.eyeClosed;
		const button = this.createIconButton(container, icon, tooltip, false);
		this.rowDisposables.add(DOM.addStandardDisposableListener(button, 'click', async () => {
			try {
				await this.automationService.updateAutomation(automation.id, { enabled: !automation.enabled });
				status(automation.enabled
					? localize('automationDisabledStatus', "Disabled automation {0}", automation.name)
					: localize('automationEnabledStatus', "Enabled automation {0}", automation.name));
			} catch (err) {
				this.logService.error('[Automations] Failed to toggle automation', err);
			}
		}));
	}

	private renderEditAction(container: HTMLElement, automation: IAutomation): void {
		const button = this.createIconButton(container, Codicon.edit, localize('editAutomation', "Edit"), false);
		this.rowDisposables.add(DOM.addStandardDisposableListener(button, 'click', () => {
			void this.openEditDialog(automation);
		}));
	}

	private renderDeleteAction(container: HTMLElement, automation: IAutomation): void {
		const button = this.createIconButton(container, Codicon.trash, localize('deleteAutomation', "Delete"), false);
		this.rowDisposables.add(DOM.addStandardDisposableListener(button, 'click', async () => {
			const result = await this.dialogService.confirm({
				type: 'warning',
				message: localize('confirmDeleteAutomation', "Delete automation \u201C{0}\u201D?", automation.name),
				detail: localize('confirmDeleteAutomationDetail', "Runs already in flight will continue. This cannot be undone."),
				primaryButton: localize('delete', "Delete"),
			});
			if (!result.confirmed) {
				return;
			}
			try {
				await this.automationService.deleteAutomation(automation.id);
				status(localize('automationDeletedStatus', "Deleted automation {0}", automation.name));
			} catch (err) {
				this.logService.error('[Automations] Failed to delete automation', err);
			}
		}));
	}

	private createIconButton(container: HTMLElement, icon: ThemeIcon, tooltip: string, disabled: boolean): HTMLElement {
		const button = DOM.append(container, $('button.automations-row-action-button', {
			type: 'button',
			'aria-label': tooltip,
			tabindex: '0',
		})) as HTMLButtonElement;
		button.classList.add(...ThemeIcon.asClassNameArray(icon));
		button.disabled = disabled;
		this.rowDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), button, tooltip));
		return button;
	}

	private async runNow(automation: IAutomation): Promise<void> {
		if (this.runInFlight.has(automation.id)) {
			return;
		}
		this.runInFlight.add(automation.id);
		// Re-render to disable the button immediately for visual feedback.
		this.renderList(this.automationService.automations.get());
		const cts = new CancellationTokenSource();
		try {
			await this.automationRunner.runOnce(automation, 'manual', 0, cts.token);
			status(localize('automationStartedStatus', "Started automation {0}", automation.name));
		} catch (err) {
			// runOnce contract: never throws. Defensive log only.
			this.logService.error('[Automations] runNow failed unexpectedly', err);
		} finally {
			cts.dispose();
			this.runInFlight.delete(automation.id);
			this.renderList(this.automationService.automations.get());
		}
	}

	private async openCreateDialog(): Promise<void> {
		const result = await showAutomationDialog(this.keybindingService, this.layoutService, this.hostService, {
			folders: this.collectFolderChoices(),
		});
		if (!result || result.kind !== 'create') {
			return;
		}
		try {
			const created = await this.automationService.createAutomation(result.value);
			status(localize('automationCreatedStatus', "Created automation {0}", created.name));
		} catch (err) {
			this.logService.error('[Automations] Failed to create automation', err);
			await this.dialogService.error(
				localize('automationCreateFailed', "Failed to create automation."),
				err instanceof Error ? err.message : String(err),
			);
		}
	}

	private async openEditDialog(automation: IAutomation): Promise<void> {
		const result = await showAutomationDialog(this.keybindingService, this.layoutService, this.hostService, {
			folders: this.collectFolderChoices(),
			existing: automation,
		});
		if (!result || result.kind !== 'update') {
			return;
		}
		try {
			await this.automationService.updateAutomation(result.id, result.value);
			status(localize('automationUpdatedStatus', "Updated automation {0}", automation.name));
		} catch (err) {
			this.logService.error('[Automations] Failed to update automation', err);
			await this.dialogService.error(
				localize('automationUpdateFailed', "Failed to update automation."),
				err instanceof Error ? err.message : String(err),
			);
		}
	}

	private collectFolderChoices(): IFolderChoice[] {
		return this.workspaceContextService.getWorkspace().folders.map(f => ({
			uri: f.uri,
			label: f.name || URI.from(f.uri).toString(),
		}));
	}

	/**
	 * Re-emits the current count. Called by the editor after wiring the
	 * count listener so the sidebar badge initializes correctly.
	 */
	fireItemCount(): void {
		this._onDidChangeItemCount.fire(this.automationService.automations.get().length);
	}

	focusSearch(): void {
		// No search input yet. Move focus to the most useful entry point:
		// the empty-state CTA if visible, otherwise the header New button.
		const target = this.newEmptyStateButton ?? this.newButton;
		target?.focus();
	}
}

// ---------------------------------------------------------------------------
// Formatting helpers (deliberately local so they can evolve with the widget
// without affecting the service layer).
// ---------------------------------------------------------------------------

function formatSchedule(a: IAutomation): string {
	switch (a.schedule.interval) {
		case 'manual':
			return localize('scheduleManual', "Manual");
		case 'hourly':
			return localize('scheduleHourly', "Hourly");
		case 'daily':
			return localize('scheduleDaily', "Daily at {0}", formatHourMinute(a.schedule.scheduleHour, a.schedule.scheduleMinute));
		case 'weekly': {
			const day = dayName(a.schedule.scheduleDay);
			return localize('scheduleWeekly', "Weekly on {0} at {1}", day, formatHourMinute(a.schedule.scheduleHour, a.schedule.scheduleMinute));
		}
	}
}

function formatHourMinute(hour: number, minute: number): string {
	const h = String(Math.max(0, Math.min(23, hour | 0))).padStart(2, '0');
	const m = String(Math.max(0, Math.min(59, minute | 0))).padStart(2, '0');
	return `${h}:${m}`;
}

function dayName(day: number): string {
	const names = [
		localize('automation.day.sun', "Sunday"),
		localize('automation.day.mon', "Monday"),
		localize('automation.day.tue', "Tuesday"),
		localize('automation.day.wed', "Wednesday"),
		localize('automation.day.thu', "Thursday"),
		localize('automation.day.fri', "Friday"),
		localize('automation.day.sat', "Saturday"),
	];
	const idx = ((day % 7) + 7) % 7;
	return names[idx];
}

function formatNextRun(a: IAutomation): string {
	if (a.schedule.interval === 'manual' || !a.nextRunAt) {
		return localize('nextRunNever', "No scheduled run");
	}
	return localize('nextRun', "Next run {0}", formatRelativeTimeOrIso(a.nextRunAt));
}

function formatRelativeTimeOrIso(iso: string): string {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) {
		return iso;
	}
	const date = new Date(t);
	const diffMs = t - Date.now();
	const absMs = Math.abs(diffMs);
	const minute = 60_000;
	const hour = 60 * minute;
	const day = 24 * hour;

	let rel: string;
	if (absMs < minute) {
		rel = diffMs >= 0 ? localize('inMomentaryFuture', "in a moment") : localize('justNow', "just now");
	} else if (absMs < hour) {
		const mins = Math.round(absMs / minute);
		rel = diffMs >= 0
			? localize('inMinutes', "in {0} min", mins)
			: localize('agoMinutes', "{0} min ago", mins);
	} else if (absMs < day) {
		const hrs = Math.round(absMs / hour);
		rel = diffMs >= 0
			? localize('inHours', "in {0} hr", hrs)
			: localize('agoHours', "{0} hr ago", hrs);
	} else {
		const days = Math.round(absMs / day);
		rel = diffMs >= 0
			? localize('inDays', "in {0} day(s)", days)
			: localize('agoDays', "{0} day(s) ago", days);
	}

	const absolute = date.toLocaleString();
	return `${rel} (${absolute})`;
}

function truncate(s: string, max: number): string {
	const single = s.replace(/\s+/g, ' ').trim();
	if (single.length <= max) {
		return single;
	}
	return single.slice(0, Math.max(0, max - 1)) + '\u2026';
}

