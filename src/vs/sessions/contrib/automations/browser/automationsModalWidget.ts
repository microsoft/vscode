/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ActionRunner } from '../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { autorun, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { localize } from '../../../../nls.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMissionControlEnvironmentService } from '../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchTable } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { defaultButtonStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { observableShowSharedAutomationsByOthers } from '../../../../workbench/contrib/chat/common/automations/automationViewState.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { automationTriggerSummary, hasAutomationEventTrigger } from '../../../../workbench/contrib/chat/common/automations/automationTriggers.js';
import { CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../../../../workbench/contrib/sessions/common/chatConstants.js';
import { SESSIONS_SEND_LATER_ENABLED_SETTING } from '../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { ShowSharedAutomationsByOthersContext } from '../../../common/agentsWindowContextKeys.js';
import { formatAutomationRunStatus, formatSchedule, getAutomationsViewContent, getAutomationRemoteStatusPresentation, getConnectedAutomationRemoteCount, getUnavailableAutomationsReasons } from '../../sessions/browser/views/automationCataloguePresentation.js';
import { automationRunWithLocalProgress, isLocalAutomationRunStarting } from '../../sessions/browser/views/automationRunProgress.js';
import { AutomationCommands } from './automationCommands.js';
import { IAutomationRunDispatch } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { getAutomationAfterDate } from '../../../../platform/agentHost/common/automationDisableConditions.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { AutomationModalRowCloudContext, AutomationModalRowEventContext, AutomationModalRowExternalContext, AutomationModalRowHasLimitsContext, AutomationModalRowCanDeleteContext, AutomationModalRowCanRunContext, AutomationModalRowCanUpdateContext, AutomationModalRowEnabledContext, AutomationsModalContext, AutomationsModalHasOthersContext, createAutomationsModalActionViewItem, IAutomationsModalActionContext } from './automationsModalActions.js';
import { AutomationCategory, AutomationCellRenderer, AutomationColumn, AutomationRow, automationTableColumns, automationTableSortOptions } from './automationsTableRenderers.js';
import { AutomationsModalHistory } from './automationsModalHistory.js';
import './media/automationsModal.css';

export class AutomationsModalWidget extends Disposable {
	readonly domNode: HTMLElement;
	protected readonly table: WorkbenchTable<AutomationRow>;
	private readonly search: InputBox;
	private readonly tableContainer: HTMLElement;
	private readonly tableInner: HTMLElement;
	private readonly tableScrollable: DomScrollableElement;
	private readonly tableMinWidth: number;
	private readonly toggleRenderer: AutomationCellRenderer;
	private readonly message: HTMLElement;
	private readonly warnings: HTMLElement;
	private readonly detail: HTMLElement;
	private readonly detailContent: HTMLElement;
	private readonly history = this._register(new MutableDisposable<AutomationsModalHistory>());
	private readonly scopedInstantiationService: IInstantiationService;
	private readonly heading: HTMLElement;
	private readonly categories = new Map<AutomationCategory, Button>();
	private rows: AutomationRow[] = [];
	private allRows: AutomationRow[] = [];
	private category: AutomationCategory = 'all';
	private enabledFilter = 0;
	private sort: AutomationColumn = 'name';
	private descending = false;
	private selectedId: string | undefined;
	private readonly pending = new Set<string>();
	private readonly startingRuns = observableValue<ReadonlyMap<string, ReadonlySet<string>>>(this, new Map());

	constructor(
		container: HTMLElement,
		openWithAgent: () => Promise<void>,
		private readonly openRunSession: (resource: URI) => Promise<void>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAutomationService private readonly automationService: IAutomationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextViewService contextViewService: IContextViewService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService hoverService: IHoverService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@IMissionControlEnvironmentService missionControlEnvironmentService: IMissionControlEnvironmentService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
		@IChatService chatService: IChatService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IStorageService storageService: IStorageService,
	) {
		super();
		this.domNode = dom.append(container, dom.$('.automations-modal-widget'));
		this._register(toDisposable(() => this.domNode.remove()));
		const scopedContext = this._register(contextKeyService.createScoped(this.domNode));
		const scopedInstantiationService = this.scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContext])));
		AutomationsModalContext.bindTo(scopedContext).set(true);
		const hasOthersContext = AutomationsModalHasOthersContext.bindTo(scopedContext);
		const showOthersContext = ShowSharedAutomationsByOthersContext.bindTo(scopedContext);
		const showSharedByOthers = observableShowSharedAutomationsByOthers(this, storageService, this._store);
		const actionContext: IAutomationsModalActionContext = { openWithAgent, runAutomation: automation => this.runAutomation(automation) };
		const actionRunner = this._register(new ActionRunner());
		this._register(actionRunner.onDidRun(event => {
			if (event.error) {
				this.reportError(event.error);
			}
		}));
		const navigation = dom.append(this.domNode, dom.$('nav.automations-modal-categories', { 'aria-label': localize('automations.modal.categories', "Automation categories") }));
		const categoryLabels: Record<AutomationCategory, string> = {
			all: localize('automations.modal.all', "All automations"),
			personal: localize('automations.modal.personal', "Personal"),
			cloud: localize('automations.modal.cloud', "Cloud"),
			repository: localize('automations.modal.repository', "Repository"),
		};
		for (const category of ['all', 'personal', 'cloud', 'repository'] as const) {
			const button = this._register(new Button(navigation, {
				...defaultButtonStyles, secondary: true,
				buttonSecondaryBorder: undefined, buttonSecondaryBackground: undefined, buttonSecondaryForeground: undefined,
			}));
			this.categories.set(category, button);
			this._register(button.onDidClick(() => {
				this.category = category;
				this.heading.textContent = categoryLabels[category];
				this.renderRows();
			}));
		}
		const content = dom.append(this.domNode, dom.$('.automations-modal-content'));
		this.heading = dom.append(content, dom.$('h2'));
		this.heading.textContent = categoryLabels.all;
		dom.append(content, dom.$('p.automations-modal-description')).textContent = localize('automations.modal.description', "Agent sessions that run on a schedule or when something happens.");
		this.warnings = dom.append(content, dom.$('.automations-modal-warnings', { role: 'status' }));
		const warningIcon = dom.append(this.warnings, renderIcon(Codicon.warning));
		warningIcon.setAttribute('aria-hidden', 'true');
		const warningText = dom.append(this.warnings, dom.$('span'));
		const controls = dom.append(content, dom.$('.automations-modal-controls'));
		this.search = this._register(new InputBox(dom.append(controls, dom.$('.automations-modal-search')), contextViewService, {
			placeholder: localize('automations.modal.search', "Search automations"),
			ariaLabel: localize('automations.modal.search', "Search automations"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._register(this.search.onDidChange(() => this.renderRows()));
		const filter = this._register(new SelectBox([
			{ text: localize('automations.modal.anyState', "All States") },
			{ text: localize('automations.modal.onlyEnabled', "Enabled") },
			{ text: localize('automations.modal.onlyDisabled', "Disabled") },
		], 0, contextViewService, defaultSelectBoxStyles, { ariaLabel: localize('automations.modal.filter', "Filter automations by state") }));
		filter.render(dom.append(controls, dom.$('.automations-modal-filter')));
		this._register(filter.onDidSelect(event => {
			this.enabledFilter = event.index;
			this.renderRows();
		}));
		const sortContainer = dom.append(controls, dom.$('.automations-modal-sort'));
		dom.append(sortContainer, dom.$('span')).textContent = localize('automations.modal.sortBy', "Sort By");
		const sort = this._register(new SelectBox(automationTableSortOptions, 0, contextViewService, defaultSelectBoxStyles, {
			ariaLabel: localize('automations.modal.sortLabel', "Sort automations"),
		}));
		sort.render(sortContainer);
		this._register(sort.onDidSelect(event => {
			const option = automationTableSortOptions[event.index];
			this.sort = option.column;
			this.descending = option.descending;
			this.renderRows();
			status(localize('automations.modal.sortChanged', "Sorted by {0}.", option.text));
		}));
		this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, dom.append(controls, dom.$('.automations-modal-actions')), AgentsWindowMenus.AutomationsModalToolbar, {
			ariaLabel: localize('automations.modal.actions', "Automation actions"),
			actionRunner,
			menuOptions: { arg: actionContext },
			actionViewItemProvider: (action, options) => createAutomationsModalActionViewItem(action, options, scopedInstantiationService, actionRunner),
		}));
		this.message = dom.append(content, dom.$('.automations-modal-message', { role: 'status' }));
		this.tableContainer = dom.append(content, dom.$('.automations-modal-table'));
		const viewport = dom.$('.automations-modal-table-viewport');
		this.tableInner = dom.append(viewport, dom.$('.automations-modal-table-inner'));
		this.tableScrollable = this._register(new DomScrollableElement(viewport, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			useShadows: false,
			scrollYToX: true,
			horizontalScrollbarSize: 10,
		}));
		this.tableContainer.appendChild(this.tableScrollable.getDomNode());
		let ariaLabel = localize('automations.modal.table', "Automations. Columns: Name, Schedule, Runs on, Last run, On.");
		const help = keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
		if (configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Automations) && help) {
			ariaLabel = localize('automations.modal.tableWithHelp', "{0} Use {1} for accessibility help.", ariaLabel, help);
		}
		const toggle = (automation: IAutomationDescriptor) => { void this.toggle(automation); };
		this.toggleRenderer = new AutomationCellRenderer('enabled', toggle, hoverService);
		const renderers = automationTableColumns.map(column => column.id === 'enabled' ? this.toggleRenderer : new AutomationCellRenderer(column.id, toggle, hoverService));
		const columns = automationTableColumns.map((column, index) => ({
			id: column.id, label: column.label, weight: column.weight, minimumWidth: column.minimumWidth,
			templateId: renderers[index].templateId, project: (row: AutomationRow) => row,
		}));
		this.tableMinWidth = columns.reduce((width, column) => width + column.minimumWidth, 0);
		this.table = this._register(scopedInstantiationService.createInstance(WorkbenchTable<AutomationRow>, 'AutomationsTable', this.tableInner, {
			headerRowHeight: 32, getHeight: () => 36,
		}, columns, renderers, {
			identityProvider: { getId: row => row.automation.id },
			accessibilityProvider: { getWidgetAriaLabel: () => ariaLabel, getAriaLabel: row => this.rowSummary(row) },
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: row => row.name },
			multipleSelectionSupport: false,
			openOnSingleClick: true,
			horizontalScrolling: false,
			alwaysConsumeMouseWheel: false,
		}));
		this.detail = dom.append(this.domNode, dom.$('section.automations-modal-detail', { 'aria-label': localize('automations.modal.details', "Automation details") }));
		this.detail.hidden = true;
		const closeDetail = this._register(new Button(this.detail, { ...defaultButtonStyles, secondary: true }));
		closeDetail.label = localize('automations.modal.closeDetails', "Close Details");
		this._register(closeDetail.onDidClick(() => {
			this.selectedId = undefined;
			this.renderDetail();
			this.table.domFocus();
		}));
		this.detailContent = dom.append(this.detail, dom.$('.automations-modal-detail-content'));
		this._register(this.table.onDidOpen(event => {
			if (event.element) {
				this.showDetails(event.element.automation);
			}
		}));
		this._register(this.table.onContextMenu(event => {
			const automation = event.element && this.automationService.getAutomation(event.element.automation.id);
			if (!automation) {
				return;
			}
			const index = this.rows.findIndex(row => row.automation.id === automation.id);
			this.table.setFocus([index]);
			this.table.setSelection([index]);
			const rowContext = scopedContext.createOverlay([
				[AutomationModalRowEnabledContext.key, automation.enabled],
				[AutomationModalRowCanUpdateContext.key, this.automationService.canUpdateAutomation(automation.id)],
				[AutomationModalRowCanDeleteContext.key, this.automationService.canDeleteAutomation(automation.id)],
				[AutomationModalRowCanRunContext.key, !this.startingRuns.get().has(automation.id) && this.automationService.canRunAutomation(automation.id)],
				[AutomationModalRowExternalContext.key, automation.externalResource !== undefined],
				[AutomationModalRowHasLimitsContext.key, getAutomationAfterDate(automation.disableConditions) !== undefined],
				[AutomationModalRowCloudContext.key, automation.cloudTrigger !== undefined || automation.ownership !== undefined],
				[AutomationModalRowEventContext.key, hasAutomationEventTrigger(automation.cloudTrigger?.triggers ?? {})],
			]);
			contextMenuService.showContextMenu({
				getAnchor: () => event.anchor,
				menuId: AgentsWindowMenus.AutomationsModalRowContext,
				menuActionOptions: { arg: automation, shouldForwardArgs: true },
				getActionsContext: () => actionContext,
				contextKeyService: rowContext,
				actionRunner,
				onHide: () => {
					if (!this._store.isDisposed) {
						this.table.domFocus();
					}
				},
			});
		}));
		this._register(dom.addDisposableListener(this.search.inputElement, dom.EventType.KEY_DOWN, event => {
			if (new StandardKeyboardEvent(event).keyCode === KeyCode.DownArrow) {
				dom.EventHelper.stop(event, true);
				this.table.domFocus();
				this.table.focusFirst();
			}
		}));
		const resizeObserver = this._register(new dom.DisposableResizeObserver('AutomationsTable', () => this.layout(), dom.getWindow(this.domNode)));
		this._register(resizeObserver.observe(this.domNode));
		const configurationChanged = observableSignalFromEvent(this, configurationService.onDidChangeConfiguration);
		const remotesChanged = observableSignalFromEvent(this, Event.any(remoteAgentHostService.onDidChangeConfiguredEntries, remoteAgentHostService.onDidChangeConnections));
		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			configurationChanged.read(reader);
			remotesChanged.read(reader);
			sessionsChanged.read(reader);
			showOthersContext.set(showSharedByOthers.read(reader));
			hasOthersContext.set(automationService.automations.read(reader).some(automation => automation.ownership === 'repository' && automation.isCreatedByCurrentUser !== true));
			const { automations, runs } = getAutomationsViewContent(
				automationService.automations.read(reader),
				automationService.runs.read(reader),
				showSharedByOthers.read(reader),
				configurationService.getValue<boolean>(SESSIONS_SEND_LATER_ENABLED_SETTING) === true,
			);
			const providers = [...automationService.availableProviders.read(reader), ...automationService.unavailableProviders.read(reader)];
			const catalogueState = automationService.catalogueState.read(reader);
			const historyState = automationService.historyState?.read(reader) ?? catalogueState;
			const starting = this.startingRuns.read(reader);
			for (const [id, previousRuns] of starting) {
				if (!automations.some(automation => automation.id === id)
					|| runs.some(run => run.automationId === id && !previousRuns.has(run.id)
						&& !isLocalAutomationRunStarting(run, resource => this.sessionsManagementService.getSession(resource) !== undefined, resource => this.sessionsManagementService.getSession(resource) !== undefined))
					|| catalogueState === 'error' || historyState === 'error'
					|| catalogueState === 'unavailable' && !automationService.canRunAutomation(id)) {
					this.clearStartingRun(id);
				}
			}
			const chatModels = [...chatService.chatModels.read(reader)];
			const latestRuns = new Map<string, IAutomationRun>();
			for (const run of runs) {
				const previous = latestRuns.get(run.automationId);
				if (!previous || run.startedAt > previous.startedAt) {
					latestRuns.set(run.automationId, run);
				}
			}
			this.allRows = automations.map(automation => {
				const provider = providers.find(provider => provider.id === automation.target.providerId);
				const last = latestRuns.get(automation.id);
				const time = last?.startedAt ?? automation.lastRunAt ?? '';
				const requesting = this.startingRuns.read(reader).has(automation.id);
				const label = last ? formatAutomationRunStatus(automationRunWithLocalProgress(last, chatModels, reader)) : '';
				return {
					automation,
					category: automation.ownership === 'repository' ? 'repository' : automationService.getProviderConfiguration?.(automation.target.providerId) ? 'cloud' : 'personal',
					name: automation.name,
					schedule: automationTriggerSummary(automation.cloudTrigger?.triggers ?? {}, true) ?? formatSchedule(automation.schedule),
					target: automation.targetDisplay?.label ?? provider?.label ?? (automation.target.kind === 'workspace' ? basename(automation.target.folderUri) : localize('automations.modal.chat', "Chat")),
					lastRun: requesting ? localize('automations.modal.starting', "Starting run...") : time ? localize('automations.modal.runAt', "{0} {1}", label, new Date(time).toLocaleString()).trim()
						: historyState === 'ready' && catalogueState === 'ready' ? localize('automations.modal.never', "Never") : localize('automations.modal.unknownRun', "Unknown"),
					lastRunTime: time,
					enabled: automation.enabled ? localize('automations.modal.enabled', "Enabled") : localize('automations.modal.disabled', "Disabled"),
					canUpdate: automationService.canUpdateAutomation(automation.id),
				};
			});
			const managementEnabled = !!configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)
				&& !!configurationService.getValue<boolean>(ENVIRONMENT_PICKER_SETTING)
				&& !!configurationService.getValue<boolean>(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING);
			const remoteStatus = getAutomationRemoteStatusPresentation(automationService.unavailableProviders.read(reader), remoteAgentHostService.configuredEntries, missionControlEnvironmentService.hosts.read(reader).map(host => host.id), managementEnabled);
			const connected = getConnectedAutomationRemoteCount(remoteStatus.tunnelEntries, remoteAgentHostService.connections);
			const reasons = getUnavailableAutomationsReasons(remoteStatus.visibleUnavailableProviders);
			if (managementEnabled && remoteStatus.tunnelEntries.length > 0) {
				reasons.unshift(localize('automations.modal.remotes', "{0}/{1} remotes connected", connected, remoteStatus.tunnelEntries.length));
			}
			if (configurationService.getValue<boolean>(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING) === false) {
				reasons.push(localize('automations.modal.cloudDisabled', "Cloud automations are disabled."));
			}
			warningText.textContent = reasons.join(' ');
			this.warnings.hidden = reasons.length === 0;
			const hasWarning = remoteStatus.visibleUnavailableProviders.length > 0 || managementEnabled && connected < remoteStatus.tunnelEntries.length;
			warningIcon.hidden = !hasWarning;
			this.warnings.classList.toggle('has-warning', hasWarning);
			this.renderRows();
		}));
		const refreshScheduler = this._register(new RunOnceScheduler(() => {
			void refresh();
		}, 60_000));
		const refresh = async (): Promise<void> => {
			refreshScheduler.cancel();
			await this.refresh();
			if (!this._store.isDisposed && !this.automationService.isRefreshing?.get()) {
				refreshScheduler.schedule();
			}
		};
		this._register(autorun(reader => {
			if (this.automationService.isRefreshing?.read(reader)) {
				refreshScheduler.cancel();
			} else {
				refreshScheduler.schedule();
			}
		}));
		void refresh();
	}

	private async refresh(): Promise<void> {
		try {
			await this.automationService.refresh?.({ background: true });
		} catch (error) {
			this.logService.warn('[AutomationsTable] Failed to refresh automations', error);
			if (!this._store.isDisposed) {
				this.message.textContent = localize('automations.modal.refreshError', "Could not refresh automations. Use Refresh to try again.");
			}
		}
	}

	private async execute(command: string, ...args: readonly unknown[]): Promise<void> {
		try {
			await this.commandService.executeCommand(command, ...args);
		} catch (error) {
			this.reportError(error);
		}
	}

	private clearStartingRun(id: string): void {
		const pending = new Map(this.startingRuns.get());
		pending.delete(id);
		this.startingRuns.set(pending, undefined);
	}

	private async runAutomation(automation: IAutomationDescriptor): Promise<void> {
		if (this.startingRuns.get().has(automation.id)) {
			return;
		}
		this.startingRuns.set(new Map(this.startingRuns.get()).set(automation.id, new Set(this.automationService.runs.get().map(run => run.id))), undefined);
		let accepted = false;
		try {
			const result = await this.commandService.executeCommand<IAutomationRunDispatch | undefined>(AutomationCommands.run.id, automation);
			accepted = result?.kind === 'accepted';
		} finally {
			if (!accepted) {
				this.clearStartingRun(automation.id);
			}
		}
	}

	private reportError(error: unknown): void {
		this.logService.error('[AutomationsTable] Action failed', error);
		this.notificationService.error(error instanceof Error ? error : String(error));
	}

	private async toggle(automation: IAutomationDescriptor): Promise<void> {
		if (this.pending.has(automation.id) || !this.automationService.canUpdateAutomation(automation.id)) {
			return;
		}
		this.pending.add(automation.id);
		try {
			await this.execute(automation.enabled ? AutomationCommands.disable.id : AutomationCommands.enable.id, automation);
		} finally {
			this.pending.delete(automation.id);
			if (!this._store.isDisposed) {
				this.renderRows();
			}
		}
	}

	private renderRows(): void {
		const query = this.search.value.trim().toLocaleLowerCase();
		const activeElement = dom.getActiveElement();
		const hadFocus = !!activeElement && this.table.getHTMLElement().contains(activeElement);
		const toggleId = dom.isHTMLElement(activeElement) ? activeElement.dataset.automationId : undefined;
		const focusedId = toggleId ?? this.table.getFocusedElements()[0]?.automation.id;
		this.rows = this.allRows.filter(row => (this.category === 'all' || row.category === this.category)
			&& (this.enabledFilter === 0 || row.automation.enabled === (this.enabledFilter === 1))
			&& [row.name, row.automation.prompt, row.schedule, row.target].some(value => value.toLocaleLowerCase().includes(query)));
		this.rows.sort((first, second) => {
			const a = this.sort === 'lastRun' ? first.lastRunTime : first[this.sort];
			const b = this.sort === 'lastRun' ? second.lastRunTime : second[this.sort];
			const order = this.sort === 'enabled' ? Number(first.automation.enabled) - Number(second.automation.enabled) : a.localeCompare(b);
			return (this.descending ? -1 : 1) * (order || first.automation.id.localeCompare(second.automation.id));
		});
		this.table.splice(0, this.table.length, this.rows);
		const focus = this.rows.findIndex(row => row.automation.id === focusedId);
		if (focus >= 0) {
			this.table.setFocus([focus]);
		}
		if (hadFocus) {
			const toggle = this.toggleRenderer.getToggle(toggleId);
			if (toggle && toggle.getAttribute('aria-disabled') !== 'true') {
				toggle.focus();
			} else if (this.rows.length) {
				this.table.domFocus();
				if (focus < 0) {
					this.table.focusFirst();
				}
			} else {
				this.search.focus();
			}
		}
		for (const [category, button] of this.categories) {
			const label = category === 'all' ? localize('automations.modal.all', "All automations") : category === 'personal' ? localize('automations.modal.personal', "Personal") : category === 'cloud' ? localize('automations.modal.cloud', "Cloud") : localize('automations.modal.repository', "Repository");
			button.label = localize('automations.modal.categoryCount', "{0} ({1})", label, this.allRows.filter(row => category === 'all' || row.category === category).length);
			button.element.setAttribute('aria-pressed', String(category === this.category));
		}
		const state = this.automationService.catalogueState.get();
		this.message.textContent = state === 'loading' ? localize('automations.modal.loading', "Loading automations...")
			: state === 'error' ? localize('automations.modal.error', "The catalogue could not be read completely. Use Refresh to try again.")
				: state === 'unavailable' ? localize('automations.modal.unavailable', "Some providers are unavailable. Showing available automations.")
					: localize('automations.modal.count', "{0} automations found", this.rows.length);
		this.renderDetail();
	}

	private showDetails(automation: IAutomationDescriptor): void {
		if (this.selectedId !== automation.id) {
			this.history.clear();
		}
		this.selectedId = automation.id;
		this.renderDetail();
	}

	private renderDetail(): void {
		const row = this.rows.find(row => row.automation.id === this.selectedId);
		const hadDetailFocus = dom.isAncestorOfActiveElement(this.detail);
		this.detail.hidden = !row;
		dom.clearNode(this.detailContent);
		if (row) {
			dom.append(this.detailContent, dom.$('h3')).textContent = row.name;
			dom.append(this.detailContent, dom.$('p')).textContent = row.automation.prompt;
			dom.append(this.detailContent, dom.$('p')).textContent = this.rowSummary(row);
			if (row.automation.readOnlyReason) {
				dom.append(this.detailContent, dom.$('p')).textContent = row.automation.readOnlyReason;
			}
			if (!this.history.value) {
				this.history.value = this.scopedInstantiationService.createInstance(AutomationsModalHistory, this.detail, this.search.inputElement, this.openRunSession);
			}
			this.history.value.setAutomation(row.automation.id);
		} else {
			this.history.clear();
			if (hadDetailFocus) {
				this.search.focus();
			}
		}
		this.layout();
	}

	private rowSummary(row: AutomationRow): string {
		return localize('automations.modal.rowSummary', "{0}. {1}. Runs on {2}. Last run: {3}. {4}.", row.name, row.schedule, row.target, row.lastRun, row.enabled);
	}

	getAccessibilityContent(): string {
		const selected = this.rows.find(row => row.automation.id === this.selectedId);
		return [this.heading.textContent, this.warnings.textContent, this.message.textContent, ...this.rows.map(row => this.rowSummary(row)),
		...(!this.detail.hidden && selected ? [selected.automation.prompt, selected.automation.readOnlyReason] : []),
		this.history.value?.getAccessibilityContent()].filter(Boolean).join('\n');
	}

	focus(): void {
		this.search.focus();
	}

	layout(): void {
		this.domNode.classList.toggle('narrow', this.domNode.clientWidth < 760);
		const width = Math.max(this.tableMinWidth, this.tableContainer.clientWidth);
		const height = Math.max(100, this.tableContainer.clientHeight - (width > this.tableContainer.clientWidth ? 10 : 0));
		dom.size(this.tableInner, width, height);
		this.table.layout(height, width);
		this.tableScrollable.scanDomNode();
		this.history.value?.layout();
	}
}
