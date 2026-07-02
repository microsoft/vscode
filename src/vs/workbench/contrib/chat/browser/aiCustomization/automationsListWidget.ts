/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { fromNow, getDurationString } from '../../../../../base/common/date.js';
import * as resources from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { IAutomation, IAutomationRun, AutomationRunStatus, AutomationRunTrigger } from '../../common/automations/automation.js';
import { IAutomationRunner } from '../../common/automations/automationRunner.js';
import { IAutomationService } from '../../common/automations/automationService.js';
import { IAutomationDialogService } from '../../common/automations/automationDialogService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../common/automations/automationsEnabled.js';
import { DAYS_OF_WEEK } from '../../common/automations/schedule.js';

const $ = DOM.$;

const AUTOMATION_ROW_HEIGHT = 72;
const HISTORY_ROW_HEIGHT = 28;
const HISTORY_HEADER_HEIGHT = 32;
const HISTORY_EMPTY_HEIGHT = 28;
const HISTORY_MORE_HEIGHT = 22;
const MAX_VISIBLE_RUNS = 20;

interface IAutomationItemEntry {
	readonly type: 'automation-item';
	readonly automation: IAutomation;
	readonly runs: readonly IAutomationRun[];
	readonly expanded: boolean;
	readonly inFlight: boolean;
}

export type IAutomationListEntry = IAutomationItemEntry;

interface IAutomationRowTemplateData {
	readonly container: HTMLElement;
	readonly row: HTMLElement;
	readonly nameEl: HTMLElement;
	readonly nameTextEl: HTMLElement;
	readonly disabledBadge: HTMLElement;
	readonly scheduleEl: HTMLElement;
	readonly sep1: HTMLElement;
	readonly nextEl: HTMLElement;
	readonly sepFolder: HTMLElement;
	readonly folderEl: HTMLElement;
	readonly sep2: HTMLElement;
	readonly lastEl: HTMLElement;
	readonly promptEl: HTMLElement;
	readonly actions: HTMLElement;
	readonly historyPanel: HTMLElement;
	readonly disposables: DisposableStore;
}

class AutomationItemDelegate implements IListVirtualDelegate<IAutomationListEntry> {
	// Initial estimate only. Actual row height is measured from the DOM because
	// the list is created with `supportDynamicHeights` (meta wraps, prompt wraps,
	// and run-error text is variable-height). See `hasDynamicHeight` below.
	getHeight(element: IAutomationListEntry): number {
		if (!element.expanded) {
			return AUTOMATION_ROW_HEIGHT;
		}
		const runs = element.runs;
		const visibleRuns = Math.min(runs.length, MAX_VISIBLE_RUNS);
		if (visibleRuns === 0) {
			return AUTOMATION_ROW_HEIGHT + HISTORY_EMPTY_HEIGHT;
		}
		let historyHeight = HISTORY_HEADER_HEIGHT + visibleRuns * HISTORY_ROW_HEIGHT;
		if (runs.length > MAX_VISIBLE_RUNS) {
			historyHeight += HISTORY_MORE_HEIGHT;
		}
		return AUTOMATION_ROW_HEIGHT + historyHeight;
	}

	hasDynamicHeight(_element: IAutomationListEntry): boolean {
		return true;
	}

	getTemplateId(_element: IAutomationListEntry): string {
		return 'automationItem';
	}
}

class AutomationItemRenderer implements IListRenderer<IAutomationItemEntry, IAutomationRowTemplateData> {
	readonly templateId = 'automationItem';

	constructor(
		private readonly widget: AutomationsListWidget,
		private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): IAutomationRowTemplateData {
		const disposables = new DisposableStore();
		container.classList.add('automations-row-wrapper');

		const row = DOM.append(container, $('.automations-row'));
		const main = DOM.append(row, $('.automations-row-main'));
		const nameEl = DOM.append(main, $('.automations-row-name'));
		const nameTextEl = DOM.append(nameEl, $('span.automations-row-name-text'));
		const disabledBadge = DOM.append(nameEl, $('span.automations-row-disabled-badge'));

		const metaEl = DOM.append(main, $('.automations-row-meta'));
		const scheduleEl = DOM.append(metaEl, $('span.automations-row-schedule'));
		const sep1 = DOM.append(metaEl, $('span.automations-row-meta-sep'));
		const nextEl = DOM.append(metaEl, $('span.automations-row-next'));
		const sepFolder = DOM.append(metaEl, $('span.automations-row-meta-sep'));
		const folderEl = DOM.append(metaEl, $('span.automations-row-folder'));
		const sep2 = DOM.append(metaEl, $('span.automations-row-meta-sep'));
		const lastEl = DOM.append(metaEl, $('span.automations-row-last'));

		const promptEl = DOM.append(main, $('.automations-row-prompt'));
		const actions = DOM.append(row, $('.automations-row-actions'));
		const historyPanel = DOM.append(container, $('.automations-row-history'));

		return { container, row, nameEl, nameTextEl, disabledBadge, scheduleEl, sep1, nextEl, sepFolder, folderEl, sep2, lastEl, promptEl, actions, historyPanel, disposables };
	}

	renderElement(element: IAutomationItemEntry, _index: number, templateData: IAutomationRowTemplateData): void {
		templateData.disposables.clear();
		const { automation, runs, expanded, inFlight } = element;

		templateData.nameTextEl.textContent = automation.name;
		templateData.row.classList.toggle('automations-row-disabled', !automation.enabled);
		templateData.disabledBadge.textContent = !automation.enabled ? localize('automationDisabled', "Disabled") : '';
		templateData.disabledBadge.style.display = !automation.enabled ? '' : 'none';

		templateData.scheduleEl.textContent = formatSchedule(automation);
		templateData.sep1.textContent = '·';
		templateData.nextEl.textContent = formatNextRun(automation);
		templateData.sepFolder.textContent = '·';
		const folderLabel = this.widget.formatFolderLabel(automation.folderUri);
		templateData.folderEl.textContent = localize('automationFolderLabel', "in {0}", folderLabel);
		templateData.folderEl.title = automation.folderUri.toString();

		if (automation.lastRunAt) {
			templateData.sep2.textContent = '·';
			templateData.sep2.style.display = '';
			templateData.lastEl.textContent = localize('lastRun', "Last run {0}", formatRelativeTimeOrIso(automation.lastRunAt));
			templateData.lastEl.style.display = '';
		} else {
			templateData.sep2.style.display = 'none';
			templateData.lastEl.style.display = 'none';
		}

		templateData.promptEl.textContent = truncate(automation.prompt, 160);
		templateData.promptEl.title = automation.prompt;

		DOM.clearNode(templateData.actions);
		this.renderActions(templateData, automation, expanded, inFlight);

		DOM.clearNode(templateData.historyPanel);
		templateData.historyPanel.id = `automation-history-${automation.id}`;
		if (expanded) {
			this.renderHistoryPanel(templateData, automation, runs);
		}
		templateData.historyPanel.style.display = expanded ? '' : 'none';
	}

	private renderActions(templateData: IAutomationRowTemplateData, automation: IAutomation, expanded: boolean, inFlight: boolean): void {
		const { actions, disposables } = templateData;

		const runBtn = this.createIconButton(actions, Codicon.play, localize('runNow', "Run now"), inFlight, disposables);
		disposables.add(DOM.addStandardDisposableListener(runBtn, 'click', () => {
			void this.widget.runNow(automation);
		}));

		const toggleIcon = automation.enabled ? Codicon.eye : Codicon.eyeClosed;
		const toggleTooltip = automation.enabled ? localize('disableAutomation', "Disable") : localize('enableAutomation', "Enable");
		const toggleBtn = this.createIconButton(actions, toggleIcon, toggleTooltip, false, disposables);
		disposables.add(DOM.addStandardDisposableListener(toggleBtn, 'click', () => {
			void this.widget.toggleEnabled(automation);
		}));

		const editBtn = this.createIconButton(actions, Codicon.edit, localize('editAutomation', "Edit"), false, disposables);
		disposables.add(DOM.addStandardDisposableListener(editBtn, 'click', () => {
			void this.widget.openEditDialog(automation);
		}));

		const deleteBtn = this.createIconButton(actions, Codicon.trash, localize('deleteAutomation', "Delete"), false, disposables);
		disposables.add(DOM.addStandardDisposableListener(deleteBtn, 'click', () => {
			void this.widget.deleteAutomation(automation);
		}));

		const histIcon = expanded ? Codicon.chevronDown : Codicon.chevronRight;
		const histTooltip = expanded ? localize('hideHistory', "Hide history") : localize('showHistory', "Show history");
		const histBtn = this.createIconButton(actions, histIcon, histTooltip, false, disposables);
		histBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
		histBtn.setAttribute('aria-controls', `automation-history-${automation.id}`);
		disposables.add(DOM.addStandardDisposableListener(histBtn, 'click', () => {
			this.widget.toggleExpanded(automation.id);
		}));
	}

	private renderHistoryPanel(templateData: IAutomationRowTemplateData, automation: IAutomation, runs: readonly IAutomationRun[]): void {
		const panel = templateData.historyPanel;
		panel.setAttribute('role', 'region');
		panel.setAttribute('aria-label', localize('historyAriaLabel', "Run history for {0}", automation.name));

		if (runs.length === 0) {
			const empty = DOM.append(panel, $('.automations-history-empty'));
			empty.textContent = localize('noRunsYet', "No runs yet.");
			return;
		}

		const heading = DOM.append(panel, $('h4.automations-history-heading'));
		heading.textContent = localize('runHistory', "Run history");

		const runsList = DOM.append(panel, $('ul.automations-history-list'));
		const visibleRuns = runs.slice(0, MAX_VISIBLE_RUNS);
		for (const run of visibleRuns) {
			this.renderRunRow(runsList, run);
		}
		if (runs.length > MAX_VISIBLE_RUNS) {
			const more = DOM.append(panel, $('.automations-history-more'));
			more.textContent = localize('historyMore', "{0} more run(s) not shown.", runs.length - visibleRuns.length);
		}
	}

	private renderRunRow(container: HTMLElement, run: IAutomationRun): void {
		const li = DOM.append(container, $('li.automations-history-row', {
			'data-run-id': run.id,
			'data-run-status': run.status,
		}));

		const statusIcon = DOM.append(li, $('span.automations-history-status.codicon'));
		const { iconId, spin } = runStatusIcon(run.status);
		statusIcon.classList.add(`codicon-${iconId}`);
		if (spin) {
			statusIcon.classList.add('codicon-modifier-spin');
		}
		statusIcon.setAttribute('aria-hidden', 'true');

		const text = DOM.append(li, $('.automations-history-row-text'));
		const first = DOM.append(text, $('.automations-history-row-first'));
		const statusLabel = DOM.append(first, $('span.automations-history-row-status'));
		statusLabel.textContent = runStatusLabel(run.status);
		const sep = DOM.append(first, $('span.automations-history-row-sep'));
		sep.textContent = '·';
		const trig = DOM.append(first, $('span.automations-history-row-trigger'));
		trig.textContent = runTriggerLabel(run.trigger);
		const sep2 = DOM.append(first, $('span.automations-history-row-sep'));
		sep2.textContent = '·';
		const started = DOM.append(first, $('span.automations-history-row-started'));
		started.textContent = localize('runStarted', "Started {0}", formatRelativeTimeOrIso(run.startedAt));
		const dur = formatRunDuration(run);
		if (dur) {
			const sep3 = DOM.append(first, $('span.automations-history-row-sep'));
			sep3.textContent = '·';
			const durEl = DOM.append(first, $('span.automations-history-row-duration'));
			durEl.textContent = dur;
		}

		if (run.errorMessage) {
			const err = DOM.append(text, $('.automations-history-row-error'));
			err.textContent = run.errorMessage;
			err.setAttribute('role', 'status');
			err.setAttribute('aria-live', 'polite');
		}
	}

	private createIconButton(container: HTMLElement, icon: ThemeIcon, tooltip: string, disabled: boolean, disposables: DisposableStore): HTMLElement {
		const button = DOM.append(container, $('button.automations-row-action-button', {
			type: 'button',
			'aria-label': tooltip,
			tabindex: '0',
		})) as HTMLButtonElement;
		button.classList.add(...ThemeIcon.asClassNameArray(icon));
		button.disabled = disabled;
		disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), button, tooltip));
		return button;
	}

	disposeTemplate(templateData: IAutomationRowTemplateData): void {
		templateData.disposables.dispose();
	}
}

/**
 * Widget that renders the Automations section of the AI Customization editor
 * using a virtualized {@link WorkbenchList}.
 */
export class AutomationsListWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidChangeItemCount = this._register(new Emitter<number>());
	readonly onDidChangeItemCount = this._onDidChangeItemCount.event;

	private readonly headerEl: HTMLElement;
	private readonly listContainer: HTMLElement;
	private readonly emptyContainer: HTMLElement;
	private list!: WorkbenchList<IAutomationListEntry>;
	private newEmptyStateButton: Button | undefined;

	private readonly newButtonHover = this._register(new MutableDisposable());
	private readonly newEmptyStateButtonHover = this._register(new MutableDisposable());
	private readonly _emptyStateStore = this._register(new DisposableStore());

	private readonly runInFlight = new Set<string>();
	private readonly expandedRows = new Set<string>();
	private displayEntries: IAutomationListEntry[] = [];

	private lastHeight = 0;
	private lastWidth = 0;
	private _layoutDeferred = false;
	private readonly _layoutRAF = this._register(new MutableDisposable());

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@IAutomationRunner private readonly automationRunner: IAutomationRunner,
		@IDialogService private readonly dialogService: IDialogService,
		@IAutomationDialogService private readonly automationDialogService: IAutomationDialogService,
		@IHoverService private readonly hoverService: IHoverService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.element = $('.automations-list-widget');
		this.headerEl = DOM.append(this.element, $('.automations-header'));
		this.emptyContainer = DOM.append(this.element, $('.automations-empty-state'));
		this.emptyContainer.style.display = 'none';
		this.listContainer = DOM.append(this.element, $('.automations-list'));

		this.renderHeader();
		this.createList();

		this._register(autorun(reader => {
			const items = this.automationService.automations.read(reader);
			this.automationService.runs.read(reader);
			this.updateList(items);
			this._onDidChangeItemCount.fire(items.length);
		}));
	}

	private renderHeader(): void {
		const titleRow = DOM.append(this.headerEl, $('.automations-header-row'));
		const titleEl = DOM.append(titleRow, $('h2.automations-header-title'));
		titleEl.textContent = localize('automationsHeaderTitle', "Automations");
		const subtitleEl = DOM.append(this.headerEl, $('p.automations-header-subtitle'));
		subtitleEl.textContent = localize('automationsHeaderSubtitle', "Schedule agent sessions to run on a cadence you choose.");

		const newButton = this._register(new Button(titleRow, { ...defaultButtonStyles, title: localize('newAutomation', "New automation") }));
		newButton.label = localize('newAutomation', "New automation");
		newButton.element.classList.add('automations-new-button');
		this._register(newButton.onDidClick(() => this.openCreateDialog()));
		this.newButtonHover.value = this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), newButton.element, localize('newAutomationTooltip', "Create a new automation"));
	}

	private createList(): void {
		const delegate = new AutomationItemDelegate();
		const renderer = new AutomationItemRenderer(this, this.hoverService);

		this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList<IAutomationListEntry>,
			'AutomationsManagementList',
			this.listContainer,
			delegate,
			[renderer],
			{
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				supportDynamicHeights: true,
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: (element: IAutomationListEntry) => {
						const a = element.automation;
						return a.enabled
							? localize('automationAriaLabel', "{0}, {1}", a.name, formatSchedule(a))
							: localize('automationAriaLabelDisabled', "{0}, disabled", a.name);
					},
					getWidgetAriaLabel() {
						return localize('automationsListAriaLabel', "Automations");
					}
				},
				identityProvider: {
					getId(element: IAutomationListEntry) {
						return element.automation.id;
					}
				}
			}
		));
	}

	private updateList(items: readonly IAutomation[]): void {
		if (items.length === 0) {
			this.element.classList.add('automations-empty');
			this.emptyContainer.style.display = '';
			this.listContainer.style.display = 'none';
			this.renderEmptyState();
			this.displayEntries = [];
			this.list.splice(0, this.list.length, []);
			return;
		}

		this.element.classList.remove('automations-empty');
		this.emptyContainer.style.display = 'none';
		this.listContainer.style.display = '';
		this.newEmptyStateButton = undefined;
		this.newEmptyStateButtonHover.clear();

		this.displayEntries = items.map(automation => ({
			type: 'automation-item' as const,
			automation,
			runs: this.automationService.runsFor(automation.id).get(),
			expanded: this.expandedRows.has(automation.id),
			inFlight: this.runInFlight.has(automation.id),
		}));

		this.list.splice(0, this.list.length, this.displayEntries);
	}

	private renderEmptyState(): void {
		this._emptyStateStore.clear();
		DOM.clearNode(this.emptyContainer);
		this.emptyContainer.setAttribute('role', 'status');
		const title = DOM.append(this.emptyContainer, $('h3.automations-empty-title'));
		title.textContent = localize('automationsEmptyTitle', "No automations yet");
		const message = DOM.append(this.emptyContainer, $('p.automations-empty-message'));
		message.textContent = localize('automationsEmptyMessage', "Create an automation to schedule an agent session to run on a cadence you choose.");

		const ctaButton = this._emptyStateStore.add(new Button(this.emptyContainer, { ...defaultButtonStyles }));
		ctaButton.label = localize('automationsEmptyCta', "Create automation");
		ctaButton.element.classList.add('automations-empty-cta');
		this._emptyStateStore.add(ctaButton.onDidClick(() => this.openCreateDialog()));
		this.newEmptyStateButton = ctaButton;
		this.newEmptyStateButtonHover.value = this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), ctaButton.element, localize('newAutomationTooltip', "Create a new automation"));
	}

	toggleExpanded(automationId: string): void {
		if (this.expandedRows.has(automationId)) {
			this.expandedRows.delete(automationId);
		} else {
			this.expandedRows.add(automationId);
		}
		this.updateList(this.automationService.automations.get());
	}

	async runNow(automation: IAutomation): Promise<void> {
		if (!this._isEnabled()) {
			await this._notifyDisabled();
			return;
		}
		if (this.runInFlight.has(automation.id)) {
			return;
		}
		this.runInFlight.add(automation.id);
		this.updateList(this.automationService.automations.get());
		try {
			// The runner does not support cancellation yet.
			await this.automationRunner.runOnce(automation, 'manual', 0, CancellationToken.None);
			status(localize('automationStartedStatus', "Started automation {0}", automation.name));
		} catch (err) {
			this.logService.error('[Automations] runNow failed unexpectedly', err);
		} finally {
			this.runInFlight.delete(automation.id);
			this.updateList(this.automationService.automations.get());
		}
	}

	async toggleEnabled(automation: IAutomation): Promise<void> {
		if (!this._isEnabled()) {
			await this._notifyDisabled();
			return;
		}
		try {
			await this.automationService.updateAutomation(automation.id, { enabled: !automation.enabled });
			status(automation.enabled
				? localize('automationDisabledStatus', "Disabled automation {0}", automation.name)
				: localize('automationEnabledStatus', "Enabled automation {0}", automation.name));
		} catch (err) {
			this.logService.error('[Automations] Failed to toggle automation', err);
		}
	}

	async deleteAutomation(automation: IAutomation): Promise<void> {
		if (!this._isEnabled()) {
			await this._notifyDisabled();
			return;
		}
		const result = await this.dialogService.confirm({
			type: 'warning',
			message: localize('confirmDeleteAutomation', "Delete automation \u201C{0}\u201D?", automation.name),
			detail: localize('confirmDeleteAutomationDetail', "Runs already in flight will continue. This cannot be undone."),
			primaryButton: localize('delete', "Delete"),
		});
		if (!result.confirmed) {
			return;
		}
		if (!this._isEnabled()) {
			await this._notifyDisabled();
			return;
		}
		try {
			await this.automationService.deleteAutomation(automation.id);
			status(localize('automationDeletedStatus', "Deleted automation {0}", automation.name));
		} catch (err) {
			this.logService.error('[Automations] Failed to delete automation', err);
		}
	}

	async openEditDialog(automation: IAutomation): Promise<void> {
		if (!this._isEnabled()) {
			await this._notifyDisabled();
			return;
		}
		const result = await this.automationDialogService.showAutomationDialog({
			existing: automation,
		});
		if (!result || result.kind !== 'update') {
			return;
		}
		if (!this._isEnabled()) {
			await this._notifyDisabled();
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

	formatFolderLabel(folderUri: URI): string {
		const folders = this.workspaceContextService.getWorkspace().folders;
		const match = folders.find(f => resources.isEqual(f.uri, folderUri));
		if (match) {
			return match.name || match.uri.toString();
		}
		const segments = folderUri.path.split('/').filter(s => s.length > 0);
		return segments[segments.length - 1] ?? folderUri.toString();
	}

	private _isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
	}

	private async _notifyDisabled(): Promise<void> {
		await this.dialogService.info(
			localize('automationsDisabledTitle', "Automations are disabled."),
			localize('automationsDisabledDetail', "Enable \u201C{0}\u201D to make changes.", CHAT_AUTOMATIONS_ENABLED_SETTING),
		);
	}

	private async openCreateDialog(): Promise<void> {
		if (!this._isEnabled()) {
			await this._notifyDisabled();
			return;
		}
		const result = await this.automationDialogService.showAutomationDialog({});
		if (!result || result.kind !== 'create') {
			return;
		}
		if (!this._isEnabled()) {
			await this._notifyDisabled();
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

	layout(height: number, width: number): void {
		this.lastHeight = height;
		this.lastWidth = width;

		this.element.style.height = `${height}px`;

		// Measure the header to calculate the list height.
		// When offsetHeight returns 0 the container may have just become visible
		// after display:none and the browser hasn't reflowed yet. Defer layout
		// once so measurements are accurate. Only retry once to avoid an endless
		// loop when the widget is created while permanently hidden.
		const headerHeight = this.headerEl.offsetHeight;
		if (headerHeight === 0 && !this._layoutDeferred) {
			this._layoutDeferred = true;
			this._layoutRAF.value = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.element), () => {
				this._layoutDeferred = false;
				this.layout(this.lastHeight, this.lastWidth);
			});
			return;
		}
		const listHeight = Math.max(0, height - headerHeight);

		this.listContainer.style.height = `${listHeight}px`;
		this.list.layout(listHeight, width);
	}

	fireItemCount(): void {
		this._onDidChangeItemCount.fire(this.automationService.automations.get().length);
	}

	/** Test-only: number of rows currently in the virtualized list. */
	get itemCount(): number {
		return this.list.length;
	}

	/**
	 * Test-only: snapshot of the view-model rows the list is displaying.
	 * The virtualized {@link WorkbenchList} does not lay out rows in a unit-test
	 * DOM, so tests assert the derived render state (expansion, runs, in-flight)
	 * here instead of querying row elements.
	 */
	getDisplayEntriesForTest(): readonly IAutomationListEntry[] {
		return this.displayEntries;
	}

	focusSearch(): void {
		this.newEmptyStateButton?.focus();
	}
}

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
	const date = new Date();
	date.setHours(Math.max(0, Math.min(23, hour | 0)), Math.max(0, Math.min(59, minute | 0)), 0, 0);
	return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dayName(day: number): string {
	const idx = ((day % 7) + 7) % 7;
	return DAYS_OF_WEEK[idx];
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
	const rel = fromNow(date, true);
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

function runStatusIcon(status: AutomationRunStatus): { iconId: string; spin: boolean } {
	switch (status) {
		case 'pending': return { iconId: 'circle-outline', spin: false };
		case 'running': return { iconId: 'sync', spin: true };
		case 'completed': return { iconId: 'check', spin: false };
		case 'failed': return { iconId: 'error', spin: false };
	}
}

function runStatusLabel(status: AutomationRunStatus): string {
	switch (status) {
		case 'pending': return localize('runStatusPending', "Pending");
		case 'running': return localize('runStatusRunning', "Running");
		case 'completed': return localize('runStatusCompleted', "Completed");
		case 'failed': return localize('runStatusFailed', "Failed");
	}
}

function runTriggerLabel(trigger: AutomationRunTrigger): string {
	switch (trigger) {
		case 'schedule': return localize('runTriggerSchedule', "Scheduled");
		case 'manual': return localize('runTriggerManual', "Manual");
		case 'catch_up': return localize('runTriggerCatchUp', "Catch-up");
	}
}

function formatRunDuration(run: IAutomationRun): string | undefined {
	if (!run.completedAt) {
		return undefined;
	}
	const startMs = Date.parse(run.startedAt);
	const endMs = Date.parse(run.completedAt);
	if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
		return undefined;
	}
	const durationMs = Math.max(0, endMs - startMs);
	return getDurationString(durationMs);
}
