/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsDashboardEditor.css';
import * as DOM from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ITableRenderer, ITableVirtualDelegate } from '../../../../base/browser/ui/table/table.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { getChatSessionArchiveActionPresentation, getChatSessionArchiveActionWording } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { WorkbenchTable } from '../../../../platform/list/browser/listService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { URI } from '../../../../base/common/uri.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { formatCopilotCredits } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { AbstractCustomView } from '../../../services/customView/browser/customView.js';
import { AgentsDashboardCustomViewFocusContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';
import { ARCHIVE_SESSION_COMMAND_ID, UNARCHIVE_SESSION_COMMAND_ID } from '../../../common/sessionCommands.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { buildAgentsDashboardSummary, buildSessionRows, IAgentsDashboardSessionRow, IAgentsDashboardSummary } from '../common/agentsDashboardModel.js';
import { AgentsDashboardHistoryRange, buildAgentsDashboardHistoryBuckets, IAgentsDashboardHistoryBucket, IAgentsDashboardHistoryService } from '../common/agentsDashboardHistory.js';
import { IWorktreeDashboardService } from '../common/worktreeDashboard.js';
import { IAgentsDashboardChartSeries, renderAgentsDashboardChart } from './agentsDashboardCharts.js';

const $ = DOM.$;
const TABLE_HEADER_HEIGHT = 30;

//#region Sessions table

const SESSION_ROW_HEIGHT = 32;
const SESSION_ROW_TEMPLATE_ID = 'agentsDashboard.sessionRow';

class SessionsTableDelegate implements ITableVirtualDelegate<IAgentsDashboardSessionRow> {
	readonly headerRowHeight = TABLE_HEADER_HEIGHT;
	getHeight(): number { return SESSION_ROW_HEIGHT; }
}

interface ISessionCellTemplateData {
	readonly container: HTMLElement;
	readonly title: HTMLElement;
	readonly hover: MutableDisposable<IDisposable>;
}

class SessionColumnRenderer implements ITableRenderer<IAgentsDashboardSessionRow, ISessionCellTemplateData> {
	static readonly TEMPLATE_ID = SESSION_ROW_TEMPLATE_ID + '.session';
	readonly templateId = SessionColumnRenderer.TEMPLATE_ID;

	constructor(
		@IHoverService private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): ISessionCellTemplateData {
		const cell = DOM.append(container, $('.agents-dashboard-cell.agents-dashboard-cell-session'));
		const title = DOM.append(cell, $('.agents-dashboard-label-text'));
		return { container: cell, title, hover: new MutableDisposable() };
	}

	renderElement(row: IAgentsDashboardSessionRow, index: number, templateData: ISessionCellTemplateData): void {
		templateData.title.textContent = row.title;
		templateData.hover.value = this.hoverService.setupDelayedHover(templateData.container, {
			content: row.title,
		});
	}

	disposeTemplate(templateData: ISessionCellTemplateData): void {
		templateData.hover.dispose();
	}
}

interface ISessionWorkingDirectoriesCellTemplateData {
	readonly container: HTMLElement;
	readonly directories: HTMLElement;
	readonly hover: MutableDisposable<IDisposable>;
}

class SessionWorkingDirectoriesColumnRenderer implements ITableRenderer<IAgentsDashboardSessionRow, ISessionWorkingDirectoriesCellTemplateData> {
	static readonly TEMPLATE_ID = SESSION_ROW_TEMPLATE_ID + '.workingDirectories';
	readonly templateId = SessionWorkingDirectoriesColumnRenderer.TEMPLATE_ID;

	constructor(
		@IHoverService private readonly hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): ISessionWorkingDirectoriesCellTemplateData {
		const cell = DOM.append(container, $('.agents-dashboard-cell.agents-dashboard-cell-path'));
		const directories = DOM.append(cell, $('.agents-dashboard-working-directories'));
		return { container: cell, directories, hover: new MutableDisposable() };
	}

	renderElement(row: IAgentsDashboardSessionRow, index: number, templateData: ISessionWorkingDirectoriesCellTemplateData): void {
		DOM.clearNode(templateData.directories);
		if (row.workingDirectories.length === 0) {
			DOM.append(templateData.directories, $(`span.agents-dashboard-working-directory-icon${ThemeIcon.asCSSSelector(Codicon.folderCompact)}`, { 'aria-hidden': 'true' }));
			DOM.append(templateData.directories, $('.agents-dashboard-path-text', undefined, localize('agentsDashboard.noWorkingDirectory', "No working directory")));
			templateData.hover.clear();
			return;
		}
		for (const directory of row.workingDirectories) {
			const item = DOM.append(templateData.directories, $('.agents-dashboard-working-directory'));
			const icon = directory.isWorktree ? Codicon.worktreeCompact : Codicon.folderCompact;
			DOM.append(item, $(`span.agents-dashboard-working-directory-icon${ThemeIcon.asCSSSelector(icon)}`, { 'aria-hidden': 'true' }));
			DOM.append(item, $('.agents-dashboard-path-text', undefined, directory.path));
		}
		templateData.hover.value = this.hoverService.setupDelayedHover(templateData.container, {
			content: row.workingDirectories.map(directory => directory.path).join('\n'),
		});
	}

	disposeTemplate(templateData: ISessionWorkingDirectoriesCellTemplateData): void {
		templateData.hover.dispose();
	}
}

interface ISessionMetricCellTemplateData {
	readonly container: HTMLElement;
	readonly value: HTMLElement;
	readonly detail: HTMLElement;
}

abstract class SessionMetricColumnRenderer implements ITableRenderer<IAgentsDashboardSessionRow, ISessionMetricCellTemplateData> {
	abstract readonly templateId: string;

	renderTemplate(container: HTMLElement): ISessionMetricCellTemplateData {
		const cell = DOM.append(container, $('.agents-dashboard-cell.agents-dashboard-cell-metric'));
		const value = DOM.append(cell, $('.agents-dashboard-metric-value'));
		const detail = DOM.append(cell, $('.agents-dashboard-metric-detail'));
		return { container: cell, value, detail };
	}

	abstract renderElement(row: IAgentsDashboardSessionRow, index: number, templateData: ISessionMetricCellTemplateData): void;

	disposeTemplate(): void { }
}

class SessionSizeColumnRenderer extends SessionMetricColumnRenderer {
	static readonly TEMPLATE_ID = SESSION_ROW_TEMPLATE_ID + '.size';
	readonly templateId = SessionSizeColumnRenderer.TEMPLATE_ID;

	renderElement(row: IAgentsDashboardSessionRow, index: number, templateData: ISessionMetricCellTemplateData): void {
		templateData.value.textContent = row.worktreeSizeBytes === undefined ? '—' : ByteSize.formatSize(row.worktreeSizeBytes);
		templateData.detail.textContent = '';
	}
}

class SessionCreditsColumnRenderer extends SessionMetricColumnRenderer {
	static readonly TEMPLATE_ID = SESSION_ROW_TEMPLATE_ID + '.credits';
	readonly templateId = SessionCreditsColumnRenderer.TEMPLATE_ID;

	renderElement(row: IAgentsDashboardSessionRow, index: number, templateData: ISessionMetricCellTemplateData): void {
		templateData.value.textContent = row.credits === undefined ? '—' : formatCopilotCredits(row.credits);
		templateData.detail.textContent = '';
	}
}

class SessionStatusColumnRenderer extends SessionMetricColumnRenderer {
	static readonly TEMPLATE_ID = SESSION_ROW_TEMPLATE_ID + '.status';
	readonly templateId = SessionStatusColumnRenderer.TEMPLATE_ID;

	renderElement(row: IAgentsDashboardSessionRow, index: number, templateData: ISessionMetricCellTemplateData): void {
		templateData.value.textContent = getSessionStatusLabel(row);
		templateData.detail.textContent = '';
	}
}

function getSessionStatusLabel(row: IAgentsDashboardSessionRow): string {
	if (row.archived) {
		return localize('agentsDashboard.status.archived', "Archived");
	}
	switch (row.status) {
		case SessionStatus.Untitled:
			return localize('agentsDashboard.status.new', "New");
		case SessionStatus.InProgress:
			return localize('agentsDashboard.status.working', "Working");
		case SessionStatus.NeedsInput:
			return localize('agentsDashboard.status.inputNeeded', "Input needed");
		case SessionStatus.Completed:
			return localize('agentsDashboard.status.done', "Done");
		case SessionStatus.Error:
			return localize('agentsDashboard.status.failed', "Failed");
	}
}

interface ISessionActionsCellTemplateData {
	readonly actionBar: ActionBar;
}

class SessionActionsColumnRenderer implements ITableRenderer<IAgentsDashboardSessionRow, ISessionActionsCellTemplateData> {
	static readonly TEMPLATE_ID = SESSION_ROW_TEMPLATE_ID + '.actions';
	readonly templateId = SessionActionsColumnRenderer.TEMPLATE_ID;

	constructor(
		private readonly view: AgentsDashboardCustomView,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	renderTemplate(container: HTMLElement): ISessionActionsCellTemplateData {
		const cell = DOM.append(container, $('.agents-dashboard-cell.agents-dashboard-cell-actions'));
		return { actionBar: new ActionBar(cell) };
	}

	renderElement(row: IAgentsDashboardSessionRow, index: number, templateData: ISessionActionsCellTemplateData): void {
		templateData.actionBar.clear();
		const archivePresentation = getChatSessionArchiveActionPresentation(getChatSessionArchiveActionWording(this.configurationService));
		const archiveAction = row.archived ? archivePresentation.unarchive : archivePresentation.archive;
		const archiveCommandId = row.archived ? UNARCHIVE_SESSION_COMMAND_ID : ARCHIVE_SESSION_COMMAND_ID;
		const actions = [{
			id: archiveCommandId,
			label: archiveAction.title.value,
			class: ThemeIcon.asClassName(archiveAction.icon),
			enabled: true,
			tooltip: archiveAction.title.value,
			run: () => this.view.toggleSessionArchived(row.session, row.archived),
		}];
		if (row.session.capabilities.get().supportsDelete) {
			const deleteLabel = localize('agentsDashboard.deleteSession', "Delete Session");
			actions.push({
				id: 'agentsDashboard.deleteSession',
				label: deleteLabel,
				class: ThemeIcon.asClassName(Codicon.trash),
				enabled: true,
				tooltip: deleteLabel,
				run: () => this.view.deleteSession(row.session),
			});
		}
		templateData.actionBar.push(actions, { icon: true, label: false });
	}

	disposeTemplate(templateData: ISessionActionsCellTemplateData): void {
		templateData.actionBar.dispose();
	}
}

//#endregion

interface ISessionsTabContent {
	readonly tableContainer: HTMLElement;
	readonly emptyState: HTMLElement;
}

interface ISummaryCard {
	readonly value: HTMLElement;
	readonly detail: HTMLElement;
}

interface ISummaryCards {
	readonly sessions: ISummaryCard;
	readonly done: ISummaryCard;
	readonly diskUsage: ISummaryCard;
}

type AgentsDashboardTab = 'statistics' | 'sessions';

interface IChartCard {
	readonly body: HTMLElement;
}

interface IStatisticsCharts {
	readonly sessions: IChartCard;
	readonly outcomes: IChartCard;
	readonly duration: IChartCard;
	readonly disk: IChartCard;
	readonly storagePerSession: IChartCard;
}

function createSummaryCard(parent: HTMLElement, label: string): ISummaryCard {
	const card = DOM.append(parent, $('.agents-dashboard-summary-card'));
	DOM.append(card, $('.agents-dashboard-summary-label', undefined, label));
	const value = DOM.append(card, $('.agents-dashboard-summary-value'));
	const detail = DOM.append(card, $('.agents-dashboard-summary-detail'));
	return { value, detail };
}

function createChartCard(parent: HTMLElement, title: string, description: string): IChartCard {
	const card = DOM.append(parent, $('section.agents-dashboard-chart-card'));
	DOM.append(card, $('h2.agents-dashboard-chart-title', undefined, title));
	DOM.append(card, $('.agents-dashboard-chart-description', undefined, description));
	const body = DOM.append(card, $('.agents-dashboard-chart-body'));
	return { body };
}

function chartSeries(label: string, color: string, values: readonly (number | undefined)[]): IAgentsDashboardChartSeries {
	return { label, color, values };
}

function valuesIfAny(values: readonly number[]): readonly (number | undefined)[] {
	return values.some(value => value !== 0) ? values : values.map(() => undefined);
}

function formatDuration(durationMs: number): string {
	const minutes = durationMs / 60_000;
	if (minutes < 60) {
		return localize('agentsDashboard.duration.minutes', "{0}m", Math.round(minutes));
	}
	const hours = minutes / 60;
	return localize('agentsDashboard.duration.hours', "{0}h", parseFloat(hours.toFixed(1)));
}

function createSessionsTabContent(
	parent: HTMLElement,
	className: string,
	emptyIcon: ThemeIcon,
	emptyTitle: string,
	emptyDescription: string,
): ISessionsTabContent {
	const element = DOM.append(parent, $(`.agents-dashboard-section.${className}`));
	const tableContainer = DOM.append(element, $('.agents-dashboard-table-container'));
	const emptyState = DOM.append(element, $('.agents-dashboard-empty.hidden'));
	DOM.append(emptyState, $(`span.agents-dashboard-empty-icon${ThemeIcon.asCSSSelector(emptyIcon)}`, { 'aria-hidden': 'true' }));
	const emptyText = DOM.append(emptyState, $('.agents-dashboard-empty-text'));
	DOM.append(emptyText, $('.agents-dashboard-empty-title', undefined, emptyTitle));
	DOM.append(emptyText, $('.agents-dashboard-empty-description', undefined, emptyDescription));

	return { tableContainer, emptyState };
}

/** Custom view with historical Statistics and live Sessions tabs. */
export class AgentsDashboardCustomView extends AbstractCustomView {

	readonly title: IObservable<string> = constObservable(localize('agentsDashboard.title', "Agents Dashboard"));
	override readonly description: IObservable<string | undefined> = constObservable(
		localize('agentsDashboard.description', "Monitor agent sessions, worktrees, and disk usage."));
	override readonly maxWidth = Number.POSITIVE_INFINITY;

	private container!: HTMLElement;
	private sessionsSection!: ISessionsTabContent;
	private sessionsTable!: WorkbenchTable<IAgentsDashboardSessionRow>;
	private summaryCards!: ISummaryCards;
	private statisticsCharts!: IStatisticsCharts;
	private statisticsTab!: HTMLElement;
	private sessionsTab!: HTMLElement;
	private statisticsPanel!: HTMLElement;
	private sessionsPanel!: HTMLElement;
	private readonly rangeButtons = new Map<AgentsDashboardHistoryRange, HTMLButtonElement>();
	private readonly viewDisposables = this._register(new DisposableStore());
	private readonly focusContext: IContextKey<boolean>;
	private sessionRowCount = 0;
	private lastLayoutWidth = 0;
	private lastLayoutHeight = 0;
	private activeTab: AgentsDashboardTab = 'statistics';
	private historyRange: AgentsDashboardHistoryRange = 'week';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IWorktreeDashboardService private readonly worktreeDashboardService: IWorktreeDashboardService,
		@IAgentsDashboardHistoryService private readonly historyService: IAgentsDashboardHistoryService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.focusContext = AgentsDashboardCustomViewFocusContext.bindTo(contextKeyService);
		this._register(toDisposable(() => this.focusContext.reset()));
	}

	render(container: HTMLElement): void {
		this.container = DOM.append(container, $('.agents-dashboard-editor'));
		this.container.tabIndex = -1;
		const focusTracker = this._register(DOM.trackFocus(this.container));
		this._register(focusTracker.onDidFocus(() => this.focusContext.set(true)));
		this._register(focusTracker.onDidBlur(() => this.focusContext.set(false)));

		const content = DOM.append(this.container, $('.agents-dashboard-content'));
		const tabs = DOM.append(content, $('.agents-dashboard-tabs.modern-ui-editor-tab-group.modern-ui-editor-tab-group-active', { role: 'tablist', 'aria-label': localize('agentsDashboard.tabs', "Agents Dashboard") }));
		this.statisticsTab = this.createTab(tabs, 'statistics', localize('agentsDashboard.tab.statistics', "Statistics"));
		this.sessionsTab = this.createTab(tabs, 'sessions', localize('agentsDashboard.tab.sessions', "Sessions"));
		const tabActions = DOM.append(tabs, $('.agents-dashboard-tab-actions'));
		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, tabActions, Menus.AgentsDashboardTabs, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'agentsDashboardTabs',
			toolbarOptions: { primaryGroup: () => true },
		}));

		this.statisticsPanel = DOM.append(content, $('.agents-dashboard-tab-panel.agents-dashboard-statistics-panel', {
			id: 'agents-dashboard-statistics-panel',
			role: 'tabpanel',
			'aria-labelledby': 'agents-dashboard-statistics-tab',
		}));
		this.sessionsPanel = DOM.append(content, $('.agents-dashboard-tab-panel.agents-dashboard-sessions-panel.hidden', {
			id: 'agents-dashboard-sessions-panel',
			role: 'tabpanel',
			'aria-labelledby': 'agents-dashboard-sessions-tab',
		}));

		const statisticsHeader = DOM.append(this.statisticsPanel, $('.agents-dashboard-statistics-header'));
		const summary = DOM.append(statisticsHeader, $('.agents-dashboard-summary', {
			role: 'group',
			'aria-label': localize('agentsDashboard.summaryAriaLabel', "Session summary"),
		}));
		this.summaryCards = {
			sessions: createSummaryCard(summary, localize('agentsDashboard.summary.sessions', "Sessions")),
			done: createSummaryCard(summary, localize('agentsDashboard.summary.done', "Done")),
			diskUsage: createSummaryCard(summary, localize('agentsDashboard.summary.diskUsage', "Disk usage")),
		};
		const rangeSelector = DOM.append(statisticsHeader, $('.agents-dashboard-range-selector', {
			role: 'group',
			'aria-label': localize('agentsDashboard.range', "Statistics range"),
		}));
		this.createRangeButton(rangeSelector, 'today', localize('agentsDashboard.range.today', "Today"));
		this.createRangeButton(rangeSelector, 'week', localize('agentsDashboard.range.week', "7 days"));
		this.createRangeButton(rangeSelector, 'month', localize('agentsDashboard.range.month', "30 days"));

		const charts = DOM.append(this.statisticsPanel, $('.agents-dashboard-charts'));
		this.statisticsCharts = {
			sessions: createChartCard(charts,
				localize('agentsDashboard.chart.sessions', "Sessions started vs done"),
				localize('agentsDashboard.chart.sessionsDescription', "New work compared with completed work.")),
			outcomes: createChartCard(charts,
				localize('agentsDashboard.chart.outcomes', "Done sessions and pull requests"),
				localize('agentsDashboard.chart.outcomesDescription', "Completed sessions compared with created and merged pull requests.")),
			duration: createChartCard(charts,
				localize('agentsDashboard.chart.duration', "Time to completion"),
				localize('agentsDashboard.chart.durationDescription', "Median completion time for sessions finished in each period.")),
			disk: createChartCard(charts,
				localize('agentsDashboard.chart.disk', "Disk usage"),
				localize('agentsDashboard.chart.diskDescription', "Storage occupied by session worktrees.")),
			storagePerSession: createChartCard(charts,
				localize('agentsDashboard.chart.storagePerSession', "Storage per session"),
				localize('agentsDashboard.chart.storagePerSessionDescription', "Median and largest session-owned worktree size.")),
		};
		this.selectTab('statistics');

		this.sessionsSection = createSessionsTabContent(
			this.sessionsPanel,
			'agents-dashboard-sessions-section',
			Codicon.commentDiscussion,
			localize('agentsDashboard.sessionsEmptyTitle', "No sessions yet"),
			localize('agentsDashboard.sessionsEmptyDescription', "Start an agent session and it will appear here."),
		);
		this.sessionsTable = (this._register(this.instantiationService.createInstance(
			WorkbenchTable,
			'AgentsDashboardSessions',
			this.sessionsSection.tableContainer,
			new SessionsTableDelegate(),
			[
				{
					label: localize('agentsDashboard.column.title', "Title"),
					tooltip: '',
					weight: 0.39,
					templateId: SessionColumnRenderer.TEMPLATE_ID,
					project(row: IAgentsDashboardSessionRow) { return row; },
				},
				{
					label: localize('agentsDashboard.column.workingDirectories', "Working directories"),
					tooltip: '',
					weight: 0.3,
					minimumWidth: 160,
					templateId: SessionWorkingDirectoriesColumnRenderer.TEMPLATE_ID,
					project(row: IAgentsDashboardSessionRow) { return row; },
				},
				{
					label: localize('agentsDashboard.column.size', "Size"),
					tooltip: '',
					weight: 0.08,
					minimumWidth: 90,
					templateId: SessionSizeColumnRenderer.TEMPLATE_ID,
					project(row: IAgentsDashboardSessionRow) { return row; },
				},
				{
					label: localize('agentsDashboard.column.credits', "Credits"),
					tooltip: '',
					weight: 0.08,
					minimumWidth: 80,
					templateId: SessionCreditsColumnRenderer.TEMPLATE_ID,
					project(row: IAgentsDashboardSessionRow) { return row; },
				},
				{
					label: localize('agentsDashboard.column.status', "Status"),
					tooltip: '',
					weight: 0.1,
					minimumWidth: 90,
					templateId: SessionStatusColumnRenderer.TEMPLATE_ID,
					project(row: IAgentsDashboardSessionRow) { return row; },
				},
				{
					label: '',
					tooltip: localize('agentsDashboard.column.actions', "Actions"),
					weight: 0.05,
					minimumWidth: 56,
					maximumWidth: 72,
					templateId: SessionActionsColumnRenderer.TEMPLATE_ID,
					project(row: IAgentsDashboardSessionRow) { return row; },
				},
			],
			[
				this.instantiationService.createInstance(SessionColumnRenderer),
				this.instantiationService.createInstance(SessionWorkingDirectoriesColumnRenderer),
				this.instantiationService.createInstance(SessionSizeColumnRenderer),
				this.instantiationService.createInstance(SessionCreditsColumnRenderer),
				this.instantiationService.createInstance(SessionStatusColumnRenderer),
				this.instantiationService.createInstance(SessionActionsColumnRenderer, this),
			],
			{
				identityProvider: { getId: (row: IAgentsDashboardSessionRow) => row.session.resource.toString() },
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('agentsDashboard.sessionsAriaLabel', "Sessions"),
					getAriaLabel: (row: IAgentsDashboardSessionRow) => localize(
						'agentsDashboard.sessionRowAriaLabel',
						"{0}, working directories {1}, size {2}, credits {3}, status {4}",
						row.title,
						row.workingDirectories.length === 0
							? localize('agentsDashboard.workingDirectoriesNoneAria', "none")
							: row.workingDirectories.map(directory => directory.isWorktree
								? localize('agentsDashboard.workingDirectoryWorktreeAria', "{0} (worktree)", directory.path)
								: localize('agentsDashboard.workingDirectoryFolderAria', "{0} (folder)", directory.path)).join(', '),
						row.worktreeSizeBytes === undefined ? localize('agentsDashboard.sizeUnknown', "unknown") : ByteSize.formatSize(row.worktreeSizeBytes),
						row.credits === undefined ? localize('agentsDashboard.creditsUnknown', "unknown") : formatCopilotCredits(row.credits),
						getSessionStatusLabel(row),
					),
				},
				multipleSelectionSupport: false,
			},
		))) as WorkbenchTable<IAgentsDashboardSessionRow>;
		this._register(this.sessionsTable.onDidOpen(event => {
			if (event.element) {
				void this.revealSession(event.element.session.resource);
			}
		}));

		const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
		this.viewDisposables.add(autorun(reader => {
			sessionsChanged.read(reader);
			const sessions = this.sessionsManagementService.getSessions();
			const worktreeEntries = this.worktreeDashboardService.entries.read(reader);
			const sessionRows = buildSessionRows(sessions, worktreeEntries);
			const historyEvents = this.historyService.events.read(reader);

			this.sessionsTable.splice(0, this.sessionsTable.length, sessionRows);
			this.updateSummary(buildAgentsDashboardSummary(sessionRows));
			if (this.activeTab === 'statistics') {
				this.updateStatistics(buildAgentsDashboardHistoryBuckets(historyEvents, this.historyRange, Date.now()));
			}
			this.sessionRowCount = sessionRows.length;
			this.updateSection(this.sessionsSection, this.sessionRowCount);
			this.layoutTables(this.lastLayoutWidth);
		}));

		void this.worktreeDashboardService.refresh();
	}

	private createTab(parent: HTMLElement, tab: AgentsDashboardTab, label: string): HTMLElement {
		const button = DOM.append(parent, $('.agents-dashboard-tab.modern-ui-editor-tab', {
			id: `agents-dashboard-${tab}-tab`,
			role: 'tab',
			'aria-controls': `agents-dashboard-${tab}-panel`,
		}));
		button.tabIndex = 0;
		DOM.append(button, $('.agents-dashboard-tab-fill.modern-ui-editor-tab-fill', { 'aria-hidden': 'true' }));
		DOM.append(button, $('.agents-dashboard-tab-label.modern-ui-editor-tab-label', undefined, label));
		this._register(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => this.selectTab(tab)));
		this._register(DOM.addDisposableListener(button, DOM.EventType.KEY_DOWN, event => {
			const keyboardEvent = event as KeyboardEvent;
			if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
				keyboardEvent.preventDefault();
				this.selectTab(tab);
			} else if (keyboardEvent.key === 'ArrowLeft' || keyboardEvent.key === 'ArrowRight') {
				keyboardEvent.preventDefault();
				const next = tab === 'statistics' ? 'sessions' : 'statistics';
				this.selectTab(next);
				(next === 'statistics' ? this.statisticsTab : this.sessionsTab).focus();
			}
		}));
		return button;
	}

	private createRangeButton(parent: HTMLElement, range: AgentsDashboardHistoryRange, label: string): void {
		const button = DOM.append(parent, $<HTMLButtonElement>('button.agents-dashboard-range-button', { type: 'button' }));
		button.textContent = label;
		button.setAttribute('aria-pressed', String(range === this.historyRange));
		button.classList.toggle('active', range === this.historyRange);
		this.rangeButtons.set(range, button);
		this._register(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => {
			this.historyRange = range;
			for (const [candidate, candidateButton] of this.rangeButtons) {
				candidateButton.classList.toggle('active', candidate === range);
				candidateButton.setAttribute('aria-pressed', String(candidate === range));
			}
			this.updateStatistics(buildAgentsDashboardHistoryBuckets(this.historyService.events.get(), range, Date.now()));
		}));
	}

	private selectTab(tab: AgentsDashboardTab): void {
		this.activeTab = tab;
		const statisticsSelected = tab === 'statistics';
		this.statisticsTab.classList.toggle('active', statisticsSelected);
		this.statisticsTab.setAttribute('aria-selected', String(statisticsSelected));
		this.statisticsTab.tabIndex = statisticsSelected ? 0 : -1;
		this.statisticsPanel.classList.toggle('hidden', !statisticsSelected);
		this.sessionsTab.classList.toggle('active', !statisticsSelected);
		this.sessionsTab.setAttribute('aria-selected', String(!statisticsSelected));
		this.sessionsTab.tabIndex = statisticsSelected ? -1 : 0;
		this.sessionsPanel.classList.toggle('hidden', statisticsSelected);
		if (statisticsSelected) {
			this.updateStatistics(buildAgentsDashboardHistoryBuckets(this.historyService.events.get(), this.historyRange, Date.now()));
		} else {
			this.layoutTables(this.lastLayoutWidth);
		}
	}

	private updateStatistics(buckets: readonly IAgentsDashboardHistoryBucket[]): void {
		const countFormat = (value: number) => Number.isInteger(value) ? value.toLocaleString() : parseFloat(value.toFixed(1)).toLocaleString();
		const durationFormat = (value: number) => formatDuration(value);
		const byteFormat = (value: number) => ByteSize.formatSize(value);
		renderAgentsDashboardChart(this.statisticsCharts.sessions.body, buckets, [
			chartSeries(localize('agentsDashboard.chart.started', "Started"), 'var(--vscode-charts-blue)', valuesIfAny(buckets.map(bucket => bucket.sessionsStarted))),
			chartSeries(localize('agentsDashboard.chart.done', "Done"), 'var(--vscode-charts-green)', valuesIfAny(buckets.map(bucket => bucket.sessionsDone))),
		], 'bar', countFormat);
		renderAgentsDashboardChart(this.statisticsCharts.outcomes.body, buckets, [
			chartSeries(localize('agentsDashboard.chart.done', "Done"), 'var(--vscode-charts-green)', valuesIfAny(buckets.map(bucket => bucket.sessionsDone))),
			chartSeries(localize('agentsDashboard.chart.prCreated', "PR created"), 'var(--vscode-charts-blue)', valuesIfAny(buckets.map(bucket => bucket.pullRequestsCreated))),
			chartSeries(localize('agentsDashboard.chart.prMerged', "PR merged"), 'var(--vscode-charts-purple)', valuesIfAny(buckets.map(bucket => bucket.pullRequestsMerged))),
		], 'bar', countFormat);
		renderAgentsDashboardChart(this.statisticsCharts.duration.body, buckets, [
			chartSeries(localize('agentsDashboard.chart.median', "Median"), 'var(--vscode-charts-orange)', buckets.map(bucket => bucket.medianCompletionDurationMs)),
		], 'line', durationFormat);
		renderAgentsDashboardChart(this.statisticsCharts.disk.body, buckets, [
			chartSeries(localize('agentsDashboard.chart.diskSeries', "Worktrees"), 'var(--vscode-charts-yellow)', buckets.map(bucket => bucket.diskUsageBytes)),
		], 'line', byteFormat);
		renderAgentsDashboardChart(this.statisticsCharts.storagePerSession.body, buckets, [
			chartSeries(localize('agentsDashboard.chart.storageMedian', "Median"), 'var(--vscode-charts-blue)', buckets.map(bucket => bucket.medianSessionStorageBytes)),
			chartSeries(localize('agentsDashboard.chart.storageLargest', "Largest"), 'var(--vscode-charts-orange)', buckets.map(bucket => bucket.largestSessionStorageBytes)),
		], 'line', byteFormat);
	}

	private updateSummary(summary: IAgentsDashboardSummary): void {
		this.summaryCards.sessions.value.textContent = String(summary.sessions);
		this.summaryCards.sessions.detail.textContent = localize(
			'agentsDashboard.summary.sessionsDetail',
			"{0} active · {1} archived",
			summary.activeSessions,
			summary.archivedSessions,
		);
		this.summaryCards.done.value.textContent = String(summary.doneSessions);
		this.summaryCards.done.detail.textContent = summary.pullRequests === 1
			? localize('agentsDashboard.summary.pullRequestDetail', "{0} pull request", summary.pullRequests)
			: localize('agentsDashboard.summary.pullRequestsDetail', "{0} pull requests", summary.pullRequests);
		this.summaryCards.diskUsage.value.textContent = ByteSize.formatSize(summary.worktreeSizeBytes);
		this.summaryCards.diskUsage.detail.textContent = localize('agentsDashboard.summary.diskUsageDetail', "Session worktrees");
	}

	layout(width: number, height: number): void {
		this.container.style.width = `${width}px`;
		this.container.style.height = `${height}px`;
		this.container.classList.toggle('compact', width < 800);
		this.lastLayoutWidth = width;
		this.lastLayoutHeight = height;
		this.layoutTables(width);
	}

	override focus(): void {
		if (this.activeTab === 'statistics') {
			this.statisticsTab.focus();
		} else if (this.sessionRowCount > 0) {
			this.sessionsTable.domFocus();
		} else {
			this.container.focus();
		}
	}

	private updateSection(section: ISessionsTabContent, count: number): void {
		section.tableContainer.classList.toggle('hidden', count === 0);
		section.emptyState.classList.toggle('hidden', count !== 0);
	}

	private layoutTables(width: number): void {
		if (this.activeTab !== 'sessions' || this.sessionRowCount === 0 || this.lastLayoutHeight === 0) {
			return;
		}
		const height = this.sessionsSection.tableContainer.clientHeight;
		if (height > 0) {
			this.sessionsTable.layout(height, this.sessionsSection.tableContainer.clientWidth || width);
		}
	}

	async revealSession(sessionResource: URI): Promise<void> {
		try {
			await this.sessionsService.openSession(sessionResource);
		} catch (err) {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('agentsDashboard.revealFailed', "Failed to open the session: {0}", toErrorMessage(err)),
			});
		}
	}

	async deleteSession(session: IAgentsDashboardSessionRow['session']): Promise<void> {
		await this.commandService.executeCommand('sessionsViewPane.deleteSession', session);
	}

	async toggleSessionArchived(session: IAgentsDashboardSessionRow['session'], archived: boolean): Promise<void> {
		await this.commandService.executeCommand(archived ? UNARCHIVE_SESSION_COMMAND_ID : ARCHIVE_SESSION_COMMAND_ID, session);
	}

}
