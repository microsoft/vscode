/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { IMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { DropdownMenuActionViewItem } from '../../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { ITableRenderer } from '../../../../../../base/browser/ui/table/table.js';
import { Action, Separator, SubmenuAction, toAction } from '../../../../../../base/common/actions.js';
import { equals } from '../../../../../../base/common/arrays.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { GITHUB_ENVIRONMENTS_DOCS_URL, GitHubEnvironmentsEnabledSettingId } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { WSL_INSTALL_DOCS_URL } from '../../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';
import { IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { MANAGE_EXTENSION_COMMAND_ID } from '../../../../../../platform/extensions/common/extensions.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchTable } from '../../../../../../platform/list/browser/listService.js';
import { INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { IEditorService, MODAL_GROUP } from '../../../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../services/preferences/common/preferences.js';
import { ISessionsService } from '../../../browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { INewSessionComposerService } from '../../../browser/newSessionComposerService.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { getVisibleRemoteKinds, ICustomizationRemote, IRemotesModel, RemoteKind, remoteKindLabels } from './remotesModel.js';
import { getConnectionProblem, getGitHubEnvironmentLabel, getServerUpdateLabel, getRemoteActivityTime, getRemoteAddressLabel, getRemoteAvailabilityLabel, getRemoteMetadataDetails, getRemoteMetadataLabel, getRemoteRowMenuActions, getRemoteStatusGroup, getRemoteTypeLabel, IRemoteEmptyEntry, IRemoteTableRow, remoteStatusGroups as statusGroups, RemotesTableRenderer, RemoteRowAction, RemoteTableEntry } from './remotesTable.js';
import { RemoteEnvironmentDetails, RemoteEnvironmentDetailsMode } from './remoteEnvironmentDetails.js';
import './media/remotesWidget.css';
import '../../../browser/media/disclosure.css';

const remoteSetup: Record<RemoteKind, { readonly label: string; readonly description: string; readonly documentation?: { readonly label: string; readonly href: string } }> = {
	ssh: {
		label: localize('remotes.empty.ssh', "No SSH hosts configured."),
		description: localize('remotes.empty.ssh.description', "Add a Host entry to your SSH configuration, then refresh."),
		documentation: { label: localize('remotes.docs.ssh', "SSH setup guide"), href: 'https://aka.ms/vscode-agent-ssh' },
	},
	wsl: {
		label: localize('remotes.empty.wsl', "No WSL 2 distributions found."),
		description: localize('remotes.empty.wsl.description', "Install WSL and a Linux distribution to get started."),
		documentation: { label: localize('remotes.docs.wsl', "Install WSL"), href: WSL_INSTALL_DOCS_URL },
	},
	tunnel: {
		label: localize('remotes.empty.tunnels', "Connect to another computer with a Dev Tunnel"),
		description: localize('remotes.empty.tunnels.description', "No tunnels found. Enable Remote Tunnel Access in VS Code on the other computer, then sign in here with the same account."),
		documentation: { label: localize('remotes.docs.tunnels', "Dev tunnel setup guide"), href: 'https://aka.ms/vscode-agent-tunnel' },
	},
	environment: {
		label: localize('remotes.empty.environments', "No GitHub Environments available."),
		description: localize('remotes.empty.environments.description', "Sign in to GitHub and share a GitHub Environment on another computer."),
		documentation: { label: localize('remotes.docs.environments', "GitHub environments setup guide"), href: GITHUB_ENVIRONMENTS_DOCS_URL },
	},
	extension: {
		label: localize('remotes.empty.extensions', "No remotes registered by extensions."),
		description: localize('remotes.empty.extensions.description', "Extensions that provide agent hosts list them here while they are enabled."),
	},
	devContainer: {
		label: localize('remotes.empty.devContainers', "No Dev Containers yet."),
		description: localize('remotes.empty.devContainers.description', "Run sessions in an Ubuntu container that keeps its files in a Docker volume."),
	},
};

const compactTableWidth = 880;
const scrollbarGutterWidth = 16;
export const RemotesDetailsExpandedContext = new RawContextKey<boolean>('remotesDetailsExpanded', false);

type RemoteSortField = 'availability' | 'name' | 'activity' | 'system' | 'type';
type RemoteGrouping = 'none' | 'status' | 'type';

const remoteSortFields: readonly RemoteSortField[] = ['availability', 'name', 'activity', 'system', 'type'];
const remoteGroupings: readonly RemoteGrouping[] = ['none', 'type', 'status'];
const sortByStorageKey = 'remotesWidget.sortBy';
const sortDescendingStorageKey = 'remotesWidget.sortDescending';
const groupByStorageKey = 'remotesWidget.groupBy';

export class RemotesWidget extends Disposable {
	readonly domNode: HTMLElement;
	protected readonly table: WorkbenchTable<IRemoteTableRow>;
	private readonly tableContainer: HTMLElement;
	private readonly tableInner: HTMLElement;
	private emptyRowWidth = 0;
	private sandboxProfilesEnabled = false;
	private readonly message: HTMLElement;
	private readonly heading: HTMLElement;
	private readonly headingTitle: HTMLElement;
	private readonly messageText: HTMLElement;
	private readonly emptyStateBody: HTMLElement;
	private readonly emptyStateDisposables = this._register(new DisposableStore());
	private readonly emptyStateActions = new Map<string, { readonly element: HTMLElement; readonly enabled: boolean; readonly button?: Button }>();
	private emptyStateKey = '';
	private emptyStateContext = '';
	private emptyStateContent = '';
	private readonly searchInput: InputBox;
	private readonly filterAction: Action;
	private readonly refreshAction: Action;
	private readonly refreshButton: Button;
	private readonly groupingActions: readonly { readonly grouping: RemoteGrouping; readonly action: Action }[];
	private readonly orderingActions: readonly { readonly field: RemoteSortField; readonly action: Action }[];
	private sortBy: RemoteSortField = 'availability';
	private sortDescending = false;
	private readonly sortHeaders = new Map<RemoteSortField, { readonly button: Button; readonly indicator: HTMLElement; readonly label: string }>();
	private readonly refreshRequest = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly refreshingKinds = new Set<RemoteKind>();
	private readonly pendingActions = new Set<string>();
	private readonly pendingConnections = new Map<string, boolean>();
	private readonly collapsedGroups = new Set<string>();
	private groupBy: RemoteGrouping = 'none';
	private kinds: readonly RemoteKind[];
	private displayedRemotes: readonly ICustomizationRemote[] = [];
	private rows: IRemoteTableRow[] = [];
	private visible = false;
	private query = '';
	private failedKinds: readonly RemoteKind[] = [];
	private hasRefreshed = false;
	private signingInToTunnels = false;
	private readonly details = this._register(new MutableDisposable<RemoteEnvironmentDetails>());
	/** Removes the Troubleshoot action from connection failure notifications once this widget can't open the page anymore. */
	private readonly connectionFailures = this._register(new DisposableMap<string>());
	readonly detailsVisible = observableValue(this, false);
	private readonly overview: HTMLElement;
	private readonly detailsContainer: HTMLElement;
	private detailsRemoteId: string | undefined;
	private readonly detailsExpanded;

	constructor(
		container: HTMLElement,
		private readonly model: IRemotesModel,
		operatingSystem: OperatingSystem,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextViewService contextViewService: IContextViewService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ISSHRemoteAgentHostService private readonly sshService: ISSHRemoteAgentHostService,
		@IEditorService private readonly editorService: IEditorService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly providersService: ISessionsProvidersService,
		@INewSessionComposerService private readonly composerService: INewSessionComposerService,
		@IStorageService private readonly storageService: IStorageService,
		@IAgentHostConnectionsService connections: IAgentHostConnectionsService,
	) {
		super();
		this._register(model);
		const storedSortBy = storageService.get(sortByStorageKey, StorageScope.PROFILE);
		const storedGroupBy = storageService.get(groupByStorageKey, StorageScope.PROFILE);
		this.sortBy = remoteSortFields.find(field => field === storedSortBy) ?? this.sortBy;
		this.sortDescending = storageService.getBoolean(sortDescendingStorageKey, StorageScope.PROFILE, this.sortDescending);
		this.groupBy = remoteGroupings.find(grouping => grouping === storedGroupBy) ?? this.groupBy;
		this.detailsExpanded = RemotesDetailsExpandedContext.bindTo(contextKeyService);
		this.kinds = getVisibleRemoteKinds(operatingSystem);
		this.domNode = dom.append(container, dom.$('.remotes-widget'));
		this.overview = dom.append(this.domNode, dom.$('.remotes-overview'));
		this.overview.classList.add('remotes-overview');
		this.detailsContainer = dom.append(this.domNode, dom.$('.remotes-details-page'));
		this.detailsContainer.hidden = true;
		const overviewBody = dom.append(this.overview, dom.$('.remotes-overview-body'));
		const searchRow = dom.append(overviewBody, dom.$('.remotes-search-row'));
		this.heading = dom.append(searchRow, dom.$('.remotes-heading'));
		this.heading.classList.add('remotes-heading');
		this.heading.hidden = true;
		this.headingTitle = dom.append(this.heading, dom.$('h2.remotes-heading-title', { id: generateUuid() }));
		this.headingTitle.classList.add('remotes-heading-title');
		const filters = dom.append(searchRow, dom.$('.remotes-filters'));
		const searchControls = dom.append(filters, dom.$('.remotes-search-controls'));
		const actionHoverDelegate = this._register(createInstantHoverDelegate());
		this.refreshAction = this._register(new Action('remotes.refresh', localize('remotes.refresh', "Refresh"), undefined, true, () => this.refresh()));
		this.refreshAction.tooltip = localize('remotes.refreshDetail', "Refresh the list of remote environments without connecting");
		const statusLabel = localize('remotes.statusColumn', "Status");
		const lastActivityLabel = localize('remotes.activityColumn', "Last Activity");
		const typeLabel = localize('remotes.typeColumn', "Type");
		this.groupingActions = [
			{ grouping: 'none' as const, label: localize('remotes.groupingNone', "None") },
			{ grouping: 'type' as const, label: typeLabel },
			{ grouping: 'status' as const, label: statusLabel },
		].map(({ grouping, label }) => {
			const action = this._register(new Action(`remotes.group.${grouping}`, label, undefined, true, () => {
				this.setGrouping(grouping);
				this.updateViewOrder();
			}));
			action.checked = grouping === this.groupBy;
			return { grouping, action };
		});
		this.orderingActions = [
			{ field: 'availability' as const, label: statusLabel },
			{ field: 'name' as const, label: localize('remotes.orderingName', "Name") },
			{ field: 'activity' as const, label: lastActivityLabel },
			{ field: 'system' as const, label: localize('remotes.orderingSystem', "System") },
			{ field: 'type' as const, label: typeLabel },
		].map(({ field, label }) => {
			const action = this._register(new Action(`remotes.sort.${field}`, label, undefined, true, () => {
				this.setSortOrder(field, field === 'activity');
			}));
			action.checked = field === this.sortBy;
			return { field, action };
		});
		const resetFilters = this._register(new Action('remotes.resetFilters', localize('remotes.resetFilters', "Reset Filter"), undefined, true, () => {
			this.sortBy = 'availability';
			this.sortDescending = false;
			this.groupBy = 'none';
			for (const item of this.orderingActions) {
				item.action.checked = item.field === 'availability';
			}
			for (const item of this.groupingActions) {
				item.action.checked = item.grouping === 'none';
			}
			this.collapsedGroups.clear();
			this.saveViewOptions();
			this.updateSortHeaders();
			this.setSearchQuery('');
			this.updateViewOrder();
		}));
		this.filterAction = this._register(new Action('remotes.organize', localize('remotes.filter', "Filter"), ThemeIcon.asClassName(Codicon.filter)));
		this.searchInput = this._register(new InputBox(dom.append(searchControls, dom.$('.remotes-search-container')), contextViewService, {
			placeholder: localize('remotes.searchPlaceholder', "Search environments"),
			ariaLabel: localize('remotes.searchLabel', "Search environments"),
			inputBoxStyles: defaultInputBoxStyles,
			actions: [this.filterAction],
			actionViewItemProvider: (action, options) => new DropdownMenuActionViewItem(action, {
				getActions: () => [
					new SubmenuAction('remotes.ordering', localize('remotes.ordering', "Sort By"), this.orderingActions.map(item => item.action)),
					new SubmenuAction('remotes.grouping', localize('remotes.grouping', "Group By"), this.groupingActions.map(item => item.action)),
					new Separator(),
					resetFilters,
				],
			}, contextMenuService, { ...options, classNames: action.class, hoverDelegate: actionHoverDelegate }),
		}));
		this._register(this.searchInput.onDidChange(query => this.setSearchQuery(query)));
		const refreshButton = this.refreshButton = this._register(new Button(dom.append(searchControls, dom.$('.remotes-header-actions')), {
			...defaultButtonStyles, secondary: true, hoverDelegate: actionHoverDelegate, title: this.refreshAction.tooltip,
		}));
		refreshButton.label = this.refreshAction.label;
		refreshButton.setAriaLabel(this.refreshAction.tooltip);
		this._register(refreshButton.onDidClick(() => this.refreshAction.run()));
		this._register(this.refreshAction.onDidChange(() => refreshButton.enabled = this.refreshAction.enabled));
		this.tableContainer = dom.append(overviewBody, dom.$('.remotes-table-container'));
		this.tableInner = dom.append(this.tableContainer, dom.$('.remotes-table-inner'));
		this.message = dom.append(overviewBody, dom.$('.remotes-message'));
		this.messageText = dom.append(this.message, dom.$('span', { role: 'status' }));
		this.emptyStateBody = dom.append(this.message, dom.$('.remotes-empty-state-body'));

		let label = configurationService.getValue<boolean>(AgentSandboxSettingId.AgentSandboxProfilesEnabled) === true
			? localize('remotes.tableLabel', "Remote environments. Name, Status, Last Activity, System, Type, Sandbox Profile, and Actions. Activate a column header to sort. Grouped columns are shown in group headings.")
			: localize('remotes.tableLabelWithoutSandboxProfile', "Remote environments. Name, Status, Last Activity, System, Type, and Actions. Activate a column header to sort. Grouped columns are shown in group headings.");
		const helpKeybinding = keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
		if (configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Remotes) && helpKeybinding) {
			label = localize('remotes.tableLabelWithHelp', "{0} Use {1} for accessibility help.", label, helpKeybinding);
		}
		const compact = () => this.tableContainer.classList.contains('remotes-table-compact');
		const methodHidden = () => this.tableContainer.classList.contains('remotes-hide-method');
		const activityHidden = () => this.tableContainer.classList.contains('remotes-hide-activity');
		const systemHidden = () => this.tableContainer.classList.contains('remotes-hide-system');
		const sandboxProfileHidden = () => this.tableContainer.classList.contains('remotes-hide-sandbox-profile');
		const groupedByType = () => this.tableContainer.classList.contains('remotes-group-by-type');
		const groupedByStatus = () => this.tableContainer.classList.contains('remotes-group-by-status');
		const columnDefinitions = [
			{ id: 'name', label: localize('remotes.nameColumn', "Name"), weight: 300, minimumWidth: 100, maximumWidth: Number.POSITIVE_INFINITY },
			{ id: 'status', label: statusLabel, weight: 144, get minimumWidth() { return groupedByStatus() ? 0 : 124; }, get maximumWidth() { return groupedByStatus() ? 0 : Number.POSITIVE_INFINITY; } },
			{ id: 'activity', label: lastActivityLabel, weight: 160, get minimumWidth() { return activityHidden() ? 0 : 136; }, get maximumWidth() { return activityHidden() ? 0 : Number.POSITIVE_INFINITY; } },
			{ id: 'system', label: localize('remotes.systemColumn', "System"), weight: 120, get minimumWidth() { return systemHidden() ? 0 : 100; }, get maximumWidth() { return systemHidden() ? 0 : Number.POSITIVE_INFINITY; } },
			{ id: 'type', label: typeLabel, weight: 216, get minimumWidth() { return methodHidden() || groupedByType() ? 0 : 160; }, get maximumWidth() { return methodHidden() || groupedByType() ? 0 : Number.POSITIVE_INFINITY; } },
			{ id: 'sandboxProfile', label: localize('remotes.sandboxProfileColumn', "Sandbox Profile"), weight: 180, get minimumWidth() { return sandboxProfileHidden() ? 0 : 140; }, get maximumWidth() { return sandboxProfileHidden() ? 0 : Number.POSITIVE_INFINITY; } },
			{ id: 'actions', label: '', weight: 0, get minimumWidth() { return compact() ? 64 : 224; }, get maximumWidth() { return this.minimumWidth; } },
		] as const;
		const renderers = columnDefinitions.map(column => new RemotesTableRenderer(
			column.id, (entry, action) => this.runRowAction(entry, action), actionHoverDelegate,
			instantiationService, hoverService, openerService, connections, this.storageService, contextViewService, () => Math.max(0, this.tableContainer.clientWidth - 24 - scrollbarGutterWidth),
		));
		const emptyRowMeasure = dom.$('.remotes-empty-row-measure', { 'aria-hidden': 'true', inert: '' });
		const emptyRow = dom.append(emptyRowMeasure, dom.$('div'));
		const nameRenderer = renderers[0];
		const emptyTemplate = nameRenderer.renderTemplate(dom.append(emptyRow, dom.$('div')));
		this._register(toDisposable(() => nameRenderer.disposeTemplate(emptyTemplate)));
		const scrollbarGutterRenderer: ITableRenderer<IRemoteTableRow, void> = {
			templateId: 'remotes-scrollbar-gutter',
			renderTemplate: container => {
				container.classList.add('remotes-scrollbar-gutter');
				container.setAttribute('aria-hidden', 'true');
			},
			renderElement: () => { },
			disposeTemplate: () => { },
		};
		const columns = [...columnDefinitions.map((column, index) => ({
			...column,
			get minimumWidth() { return column.minimumWidth; },
			get maximumWidth() { return column.maximumWidth; },
			templateId: renderers[index].templateId, project: (row: IRemoteTableRow) => row,
		})), {
			label: '', weight: 0, minimumWidth: scrollbarGutterWidth, maximumWidth: scrollbarGutterWidth,
			templateId: scrollbarGutterRenderer.templateId, project: (row: IRemoteTableRow) => row,
		}];
		this.table = this._register(instantiationService.createInstance(WorkbenchTable<IRemoteTableRow>,
			'RemotesTable', this.tableInner, {
			headerRowHeight: 31, // Includes the header's bottom border.
			getHeight: row => {
				if (row.entry.type === 'empty') {
					nameRenderer.renderElement(row, 0, emptyTemplate);
					this.domNode.appendChild(emptyRowMeasure);
					const height = emptyRowMeasure.offsetHeight;
					emptyRowMeasure.remove();
					return height;
				}
				return row.entry.type === 'group' ? 32 : 28;
			},
		}, columns, [...renderers, scrollbarGutterRenderer], {
			identityProvider: { getId: row => row.id },
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: row => row.entry.type === 'remote' ? row.entry.remote.name : row.entry.label },
			accessibilityProvider: {
				getWidgetAriaLabel: () => label,
				getAriaLabel: row => {
					const entry = row.entry;
					if (entry.type === 'group') {
						const count = entry.count === 1
							? localize('remotes.groupCountOne', "1 environment")
							: localize('remotes.groupCount', "{0} environments", entry.count);
						return entry.refreshing
							? localize('remotes.groupRefreshingLabel', "{0}, {1}. Refreshing.", entry.label, count)
							: entry.warning
								? localize('remotes.groupWarningLabel', "{0}, {1}. Warning: {2}", entry.label, count, entry.warning)
								: entry.description
									? localize('remotes.groupDescriptionLabel', "{0}, {1}. {2}", entry.label, count, entry.description)
									: localize('remotes.groupLabel', "{0}, {1}", entry.label, count);
					}
					return entry.type === 'empty'
						? [entry.label, entry.description, entry.action?.label, entry.documentation?.label].filter(Boolean).join(' ')
						: this.getRemoteAriaLabel(entry.remote);
				},
			},
			multipleSelectionSupport: false,
			setRowLineHeight: false,
			horizontalScrolling: false,
			openOnSingleClick: true,
			alwaysConsumeMouseWheel: false,
		}));
		// eslint-disable-next-line eslint-js/no-restricted-syntax -- Table does not expose a header renderer.
		const headers = this.table.getHTMLElement().querySelectorAll<HTMLElement>('.monaco-table-th');
		columnDefinitions.forEach((column, index) => {
			if (column.id === 'actions' || column.id === 'sandboxProfile') {
				return;
			}
			const header = headers[index];
			const field = column.id === 'status' ? 'availability' : column.id;
			dom.clearNode(header);
			const button = this._register(new Button(header, { hoverDelegate: actionHoverDelegate, supportIcons: true }));
			button.element.classList.add('remotes-sort-header');
			button.label = column.label;
			const indicator = dom.append(button.element, dom.$('span.remotes-sort-indicator', { 'aria-hidden': 'true' }));
			this.sortHeaders.set(field, { button, indicator, label: column.label });
			this._register(button.onDidClick(() => this.setSortOrder(field, this.sortBy === field ? !this.sortDescending : field === 'activity')));
		});
		this.updateSortHeaders();
		this._register(this.table.onDidChangeFocus(event => {
			for (const renderer of renderers) {
				renderer.setFocusedId(event.elements[0]?.id);
			}
		}));
		this._register(this.table.onDidOpen(event => {
			if (event.element?.entry.type === 'group' && event.browserEvent?.type !== dom.EventType.KEY_DOWN) {
				this.toggleGroup(event.element.entry.id);
			}
		}));
		this._register(this.table.onContextMenu(event => {
			// Inline controls can have focus without the table focusing their row, such as a Sandbox Profile selector
			// restoring focus when it closes. A keyboard menu from such a control is for the control's row.
			const target = event.browserEvent.target;
			const controlRow = dom.isKeyboardEvent(event.browserEvent) && dom.isHTMLElement(target) ? nameRenderer.getRowContaining(target) : undefined;
			const row = controlRow ?? event.element;
			const actions = row ? getRemoteRowMenuActions(row.entry, (entry, action) => this.runRowAction(entry, action)) : [];
			if (!row || !actions.length) {
				return;
			}
			dom.EventHelper.stop(event.browserEvent, true);
			// The list has no anchor for a focused row scrolled out of view, so reveal the row and anchor the menu to it.
			let anchor: HTMLElement | IMouseEvent | null | undefined = controlRow ? nameRenderer.getRowElement(controlRow.id) : event.anchor;
			if (!anchor && event.index !== undefined) {
				this.table.reveal(event.index);
				anchor = nameRenderer.getRowElement(row.id);
			}
			contextMenuService.showContextMenu({
				getAnchor: () => anchor ?? this.table.getHTMLElement(),
				getActions: () => actions,
			});
		}));
		this._register(dom.addDisposableListener(this.table.getHTMLElement(), dom.EventType.KEY_DOWN, event => {
			if (!dom.isHTMLElement(event.target) || !event.target.classList.contains('monaco-list')) {
				return;
			}
			const keyboardEvent = new StandardKeyboardEvent(event);
			const entry = this.table.getFocusedElements()[0]?.entry;
			if (entry?.type === 'group' && (keyboardEvent.keyCode === KeyCode.LeftArrow || keyboardEvent.keyCode === KeyCode.RightArrow || keyboardEvent.keyCode === KeyCode.Enter || keyboardEvent.keyCode === KeyCode.Space)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				const collapse = keyboardEvent.keyCode === KeyCode.LeftArrow ? true : keyboardEvent.keyCode === KeyCode.RightArrow ? false : !entry.collapsed;
				if (entry.collapsed !== collapse) {
					this.toggleGroup(entry.id);
				}
			}
		}));
		this._register(dom.addDisposableListener(this.searchInput.inputElement, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.keyCode === KeyCode.DownArrow) {
				keyboardEvent.preventDefault();
				if (this.tableContainer.hidden) {
					[...this.emptyStateActions.values()].find(action => action.enabled)?.element.focus();
					return;
				}
				this.table.domFocus();
				if (!this.table.getFocus().length) {
					this.table.focusFirst();
				}
			}
		}));
		const resizeObserver = this._register(new dom.DisposableResizeObserver('RemotesWidget', () => this.layout(), dom.getWindow(this.domNode)));
		this._register(resizeObserver.observe(this.domNode));
		this.sandboxProfilesEnabled = configurationService.getValue<boolean>(AgentSandboxSettingId.AgentSandboxProfilesEnabled) === true;
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AgentSandboxSettingId.AgentSandboxProfilesEnabled)) {
				this.sandboxProfilesEnabled = configurationService.getValue<boolean>(AgentSandboxSettingId.AgentSandboxProfilesEnabled) === true;
				this.layout();
			}
		}));
		this._register(autorun(reader => {
			const remotes = this.model.remotes.read(reader);
			this.model.tunnelAuthenticationRequired.read(reader);
			const canCreateDevContainer = this.model.canCreateDevContainer.read(reader);
			const hasDevContainers = canCreateDevContainer || remotes.some(remote => remote.kind === 'devContainer');
			const kinds = getVisibleRemoteKinds(operatingSystem, this.model.environmentsEnabled.read(reader), remotes.some(remote => remote.kind === 'extension'), hasDevContainers);
			const kindsChanged = !equals(this.kinds, kinds);
			this.kinds = kinds;
			const remotesById = new Map(remotes.map(remote => [remote.id, remote]));
			// Freeze discovery details, not connection changes or inventory withdrawals.
			const displayedRemotes = this.refreshRequest.value ? this.displayedRemotes.flatMap(remote => {
				const current = remotesById.get(remote.id);
				if (!current) {
					return [];
				}
				return [remote.connectionStatus === current.connectionStatus && remote.lastConnectionError === current.lastConnectionError
					? remote
					: { ...remote, connectionStatus: current.connectionStatus, lastConnectionError: current.lastConnectionError, metadataIsStale: current.metadataIsStale }];
			}) : remotes;
			const remotesChanged = !equals(this.displayedRemotes, displayedRemotes);
			this.displayedRemotes = displayedRemotes;
			if (!this.refreshRequest.value || remotesChanged || kindsChanged) {
				this.render();
			}
		}));
	}

	private clearFilter(): void {
		this.setSearchQuery('');
		this.render();
		this.searchInput.focus();
	}

	private runRowAction(entry: RemoteTableEntry, action: RemoteRowAction): void {
		if (entry.type === 'empty' && action === 'signIn') {
			void this.notifyOnFailure(this.signInToTunnels());
		} else if (entry.type === 'empty' && action === 'createDevContainer' && entry.action?.enabled) {
			void this.createDevContainer();
		} else if (entry.type === 'group') {
			if (action === 'toggleGroup') {
				this.toggleGroup(entry.id);
			} else if (action === 'configure' && entry.kind) {
				void this.notifyOnFailure(this.openConfiguration(entry.kind));
			} else if (action === 'documentation' && entry.documentation) {
				void this.openDocumentation(entry.documentation.href);
			} else if (action === 'createDevContainer' && entry.canCreate) {
				void this.createDevContainer();
			}
		} else if (entry.type === 'remote') {
			if (action === 'toggleVisibility') {
				try {
					this.model.setHidden(entry.remote.id, !entry.remote.hidden);
				} catch (error) {
					if (!isCancellationError(error)) {
						this.notificationService.error(error);
					}
				}
			} else if (action === 'signIn' && this.displayedRemotes.some(remote => remote.id === entry.remote.id && remote.requiresTunnelSignIn)) {
				void this.notifyOnFailure(this.signInToTunnels());
			} else if (action === 'connect') {
				void this.setConnected(entry.remote.id, !RemoteAgentHostConnectionStatus.isConnected(entry.remote.connectionStatus));
			} else if (action === 'newSession') {
				void this.newSession(entry.remote.id);
			} else if (action === 'rename') {
				void this.manageRemote(entry.remote, 'rename');
			} else if (action === 'copyAddress') {
				void this.copyAddress(entry.remote.id);
			} else if (action === 'locationPreference' && (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh')) {
				this.openDetails(entry.remote, 'runBehavior');
			} else if (action === 'troubleshoot') {
				this.openDetails(entry.remote, 'troubleshoot');
			} else if (action === 'githubEnvironment' && entry.remote.gitHubEnvironment?.state !== 'unavailable' && (entry.remote.canShareAsGitHubEnvironment || entry.remote.gitHubEnvironment)) {
				void this.manageRemote(entry.remote, 'githubEnvironment');
			} else if (action === 'showExtension' && entry.remote.contributedBy) {
				void this.notifyOnFailure(this.showExtension(entry.remote.contributedBy.extensionId));
			} else if (action === 'updateServer') {
				void this.manageRemote(entry.remote, 'updateServer');
			} else if (action === 'restartDistribution' && entry.remote.kind === 'wsl') {
				void this.manageRemote(entry.remote, 'restartDistribution');
			} else if (action === 'createDevContainer' && entry.remote.canCreateDevContainer) {
				void this.createDevContainer(entry.remote.id);
			} else if (action === 'delete' && (entry.remote.kind === 'environment' && entry.remote.canRemove || (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh' || entry.remote.kind === 'devContainer') && entry.remote.canDelete)) {
				void this.deleteRemote(entry.remote.id, entry.remote.kind);
			}
		}
	}

	private openDetails(remote: ICustomizationRemote, mode: RemoteEnvironmentDetailsMode): void {
		if (this.details.value?.isBusy || this.pendingActions.has(remote.id)) {
			return;
		}
		if (this.detailsRemoteId === remote.id && this.details.value?.mode === mode) {
			this.closeDetails();
			return;
		}
		this.detailsRemoteId = remote.id;
		const id = remote.id;
		this.details.value = this.instantiationService.createInstance(RemoteEnvironmentDetails, remote, mode, this.model, {
			close: () => this.closeDetails(),
			onDidChangeBusy: busy => {
				if (busy) {
					this.pendingActions.add(id);
				} else {
					this.pendingActions.delete(id);
				}
				if (!this._store.isDisposed) {
					this.render();
				}
			},
			newSession: () => this.newSession(id),
			// The page runs these itself, marking the remote pending and showing their failures.
			openConfiguration: kind => this.openConfiguration(kind),
			showExtension: extensionId => this.showExtension(extensionId),
			signInToTunnels: () => this.signInToTunnels(),
			refresh: async () => {
				await this.discover();
				const kind = this.model.remotes.get().find(remote => remote.id === id)?.kind;
				const warning = kind && this.getRefreshWarning(kind);
				if (warning) {
					throw new Error(warning);
				}
			},
			deleteRemote: async () => {
				const current = this.model.remotes.get().find(remote => remote.id === id);
				if (current && (current.kind === 'environment' || current.kind === 'tunnel' || current.kind === 'ssh' || current.kind === 'devContainer')) {
					await this.removeRemote(id, current.kind);
				}
			},
		});
		this.detailsContainer.appendChild(this.details.value.domNode);
		this.overview.hidden = true;
		this.detailsContainer.hidden = false;
		this.detailsVisible.set(true, undefined);
		this.detailsExpanded.set(true);
		this.render();
		this.details.value?.focus();
	}

	closeDetails(): void {
		if (this.details.value?.isBusy) {
			return;
		}
		const id = this.detailsRemoteId;
		this.detailsRemoteId = undefined;
		this.details.clear();
		this.overview.hidden = false;
		this.detailsContainer.hidden = true;
		this.detailsVisible.set(false, undefined);
		this.detailsExpanded.reset();
		this.render();
		const index = this.rows.findIndex(row => row.id === id);
		if (index >= 0) {
			this.table.setFocus([index]);
			this.table.reveal(index);
		}
		this.table.domFocus();
	}

	private async signInToTunnels(): Promise<void> {
		if (this.signingInToTunnels || !this.model.tunnelAuthenticationRequired.get()) {
			return;
		}
		this.signingInToTunnels = true;
		this.render();
		try {
			await this.model.signInToTunnels();
			if (!this._store.isDisposed && this.visible) {
				await this.refresh();
			}
		} finally {
			this.signingInToTunnels = false;
			if (!this._store.isDisposed) {
				this.render();
			}
		}
	}

	/** Shows a failure of an overview action as a notification; the details page shows the failures of its actions itself. */
	private async notifyOnFailure(operation: Promise<void>): Promise<void> {
		try {
			await operation;
		} catch (error) {
			if (!isCancellationError(error) && !this._store.isDisposed) {
				this.notificationService.error(error);
			}
		}
	}

	private async openDocumentation(href: string): Promise<void> {
		try {
			await this.openerService.open(href);
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	/** Shows the extension's page, where disabling or uninstalling it removes the remotes it registers. */
	private async showExtension(extensionId: string): Promise<void> {
		await this.commandService.executeCommand(MANAGE_EXTENSION_COMMAND_ID, extensionId);
	}

	setGrouping(groupBy: RemoteGrouping): void {
		this.groupBy = groupBy;
		for (const item of this.groupingActions) {
			item.action.checked = item.grouping === groupBy;
		}
		this.saveViewOptions();
		this.render();
	}

	/** Remembers sorting and grouping for the profile, so they survive reopening the editor. */
	private saveViewOptions(): void {
		this.storageService.store(sortByStorageKey, this.sortBy === 'availability' ? undefined : this.sortBy, StorageScope.PROFILE, StorageTarget.USER);
		this.storageService.store(sortDescendingStorageKey, this.sortDescending || undefined, StorageScope.PROFILE, StorageTarget.USER);
		this.storageService.store(groupByStorageKey, this.groupBy === 'none' ? undefined : this.groupBy, StorageScope.PROFILE, StorageTarget.USER);
	}

	private updateViewOrder(): void {
		this.render();
		this.table.scrollTop = 0;
	}

	private toggleGroup(id: string): void {
		const entry = this.rows.find(row => row.id === id)?.entry;
		if (entry?.type === 'group' && entry.collapsed) {
			this.collapsedGroups.delete(id);
		} else {
			this.collapsedGroups.add(id);
		}
		this.render();
		const index = this.rows.findIndex(row => row.id === id);
		this.table.setFocus([index]);
		this.table.domFocus();
	}

	private async openConfiguration(kind: RemoteKind): Promise<void> {
		if (kind === 'ssh') {
			const resource = await this.sshService.ensureUserSSHConfig();
			await this.editorService.openEditor({ resource, options: { pinned: true } }, MODAL_GROUP);
		} else if (kind === 'tunnel') {
			await this.preferencesService.openSettings({ query: 'chat.remoteAgentHosts' });
		} else if (kind === 'environment') {
			await this.preferencesService.openSettings({ query: GitHubEnvironmentsEnabledSettingId });
		}
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}
		this.visible = visible;
		if (visible) {
			void this.refresh();
		} else {
			this.cancelRefresh();
			// Troubleshoot actions of failure notifications can't open the page while it's hidden.
			this.connectionFailures.clearAndDisposeAll();
		}
	}

	setSearchQuery(query: string): void {
		const normalizedQuery = query.toLowerCase().trim();
		const changed = this.query !== normalizedQuery;
		this.query = normalizedQuery;
		this.searchInput.value = query;
		if (changed) {
			if (this.query) {
				this.collapsedGroups.clear();
			}
			this.render();
		}
	}

	private cancelRefresh(): void {
		this.refreshRequest.value?.cancel();
		this.refreshRequest.clear();
		this.refreshAction.enabled = true;
		this.tableContainer.setAttribute('aria-busy', 'false');
		if (this.refreshingKinds.size) {
			this.refreshingKinds.clear();
			this.render();
		}
	}

	private async refresh(): Promise<void> {
		await this.notifyOnFailure(this.discover());
	}

	/** Refreshes discovery, rejecting when it fails unexpectedly; kinds whose discovery failed are in {@link failedKinds}. */
	private async discover(): Promise<void> {
		this.cancelRefresh();
		const request = new CancellationTokenSource();
		this.refreshRequest.value = request;
		this.refreshAction.enabled = false;
		this.tableContainer.setAttribute('aria-busy', 'true');
		for (const kind of this.kinds) {
			this.refreshingKinds.add(kind);
		}
		this.render();
		try {
			const failedKinds = await this.model.refresh(request.token, {
				report: progress => {
					if (request.token.isCancellationRequested || this._store.isDisposed || this.refreshRequest.value !== request) {
						return;
					}
					if (progress.refreshing) {
						this.refreshingKinds.add(progress.kind);
					}
				},
			});
			if (!request.token.isCancellationRequested && !this._store.isDisposed) {
				this.failedKinds = failedKinds;
				this.hasRefreshed = true;
				if (failedKinds.some(kind => this.kinds.includes(kind) && this.getRefreshWarning(kind))) {
					status(localize('remotes.refreshWarnings', "Some remote locations could not be refreshed. Check the discovery warnings for details."));
				}
			}
		} catch (error) {
			if (!request.token.isCancellationRequested) {
				this.failedKinds = this.kinds;
				this.hasRefreshed = true;
				throw error;
			}
		} finally {
			if (this.refreshRequest.value === request) {
				this.refreshAction.enabled = true;
				this.refreshRequest.clear();
				this.tableContainer.setAttribute('aria-busy', 'false');
				this.refreshingKinds.clear();
				this.displayedRemotes = this.model.remotes.get();
				this.render();
			}
		}
	}

	private getFilteredRemotes(): readonly ICustomizationRemote[] {
		return this.displayedRemotes.filter(remote => this.kinds.includes(remote.kind)
			&& `${remote.name} ${remote.description ?? ''} ${remote.contributedBy?.displayName ?? ''} ${getRemoteAddressLabel(remote)} ${remoteKindLabels[remote.kind]} ${getRemoteTypeLabel(remote.kind)} ${getRemoteAvailabilityLabel(remote)} ${getRemoteMetadataDetails(remote, 'system')} ${getRemoteMetadataDetails(remote, 'activity')} ${getRemoteMetadataLabel(remote, 'activity')}`.toLowerCase().includes(this.query))
			.sort((a, b) => {
				if (this.sortBy === 'availability') {
					const rank = (remote: ICustomizationRemote) => {
						const group = getRemoteStatusGroup(remote);
						const index = statusGroups.findIndex(candidate => candidate.key === group);
						return index < 0 ? statusGroups.length : index;
					};
					const difference = rank(a) - rank(b);
					if (difference) {
						return this.sortDescending ? -difference : difference;
					}
				}
				if (this.sortBy === 'activity') {
					const aTime = getRemoteActivityTime(a);
					const bTime = getRemoteActivityTime(b);
					if (aTime !== bTime) {
						return aTime === undefined ? 1 : bTime === undefined ? -1 : this.sortDescending ? bTime - aTime : aTime - bTime;
					}
				}
				if (this.sortBy === 'system' || this.sortBy === 'type') {
					const aLabel = this.sortBy === 'system' ? getRemoteMetadataLabel(a, 'system') : getRemoteTypeLabel(a.kind);
					const bLabel = this.sortBy === 'system' ? getRemoteMetadataLabel(b, 'system') : getRemoteTypeLabel(b.kind);
					if (aLabel !== bLabel) {
						return !aLabel ? 1 : !bLabel ? -1 : (this.sortDescending ? -1 : 1) * aLabel.localeCompare(bLabel);
					}
				}
				const nameOrder = a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
				return this.sortBy === 'name' && this.sortDescending ? -nameOrder : nameOrder;
			});
	}

	private setSortOrder(field: RemoteSortField, descending: boolean): void {
		this.sortBy = field;
		this.sortDescending = descending;
		for (const item of this.orderingActions) {
			item.action.checked = item.field === field;
		}
		this.saveViewOptions();
		this.updateSortHeaders();
		this.updateViewOrder();
	}

	private updateSortHeaders(): void {
		for (const [field, { button, indicator, label }] of this.sortHeaders) {
			const sorted = field === this.sortBy;
			dom.clearNode(indicator);
			if (sorted) {
				dom.append(indicator, renderIcon(this.sortDescending ? Codicon.arrowDown : Codicon.arrowUp));
			}
			const nextDescending = sorted ? !this.sortDescending : field === 'activity';
			const description = nextDescending
				? localize('remotes.sortDescending', "Sort {0} descending", label)
				: localize('remotes.sortAscending', "Sort {0} ascending", label);
			button.setAriaLabel(!sorted ? description : this.sortDescending
				? localize('remotes.sortedDescending', "{0}, sorted descending. {1}", label, description)
				: localize('remotes.sortedAscending', "{0}, sorted ascending. {1}", label, description));
			button.setTitle(description);
		}
	}

	private getEmptyEntry(kind: RemoteKind): IRemoteEmptyEntry {
		const id = `remote-empty-${kind}`;
		if (this.refreshingKinds.has(kind)) {
			return { type: 'empty', id, label: localize('remotes.empty.checkingKind', "Looking for {0}...", remoteKindLabels[kind]) };
		}
		const authProvider = kind === 'tunnel' ? this.model.tunnelAuthenticationRequired.get() : undefined;
		if (authProvider) {
			const providerLabel = authProvider === 'github' ? 'GitHub' : 'Microsoft';
			return {
				type: 'empty', id,
				label: remoteSetup.tunnel.label,
				action: {
					id: 'signIn',
					label: this.signingInToTunnels
						? localize('remotes.tunnels.signingIn', "Signing in...")
						: localize('remotes.tunnels.signInAccount', "Sign in to {0}", providerLabel),
					enabled: !this.signingInToTunnels,
				},
				description: localize('remotes.tunnels.signInDescription', "Sign in to {0} with the same account you use for Remote Tunnel Access on the other computer.", providerLabel),
				documentation: remoteSetup.tunnel.documentation,
			};
		}
		if (this.failedKinds.includes(kind)) {
			return {
				type: 'empty', id, label: localize('remotes.empty.failed', "Couldn't refresh {0}.", remoteKindLabels[kind]),
				description: this.getRefreshWarning(kind),
				documentation: remoteSetup[kind].documentation,
			};
		}
		if (kind === 'devContainer' && this.model.canCreateDevContainer.get()) {
			return { type: 'empty', id, ...remoteSetup[kind], action: { id: 'createDevContainer', label: localize('remotes.empty.devContainers.create', "Create Dev Container"), enabled: true } };
		}
		if (!this.hasRefreshed) {
			return { type: 'empty', id, label: localize('remotes.empty.findKind', "Refresh to look for {0}.", remoteKindLabels[kind]), documentation: remoteSetup[kind].documentation };
		}
		return { type: 'empty', id, ...remoteSetup[kind] };
	}

	private showSetupGroups(remotes: readonly ICustomizationRemote[]): boolean {
		return !remotes.length && !this.query && this.hasRefreshed && !this.refreshRequest.value
			&& !this.kinds.some(kind => this.getRefreshWarning(kind));
	}

	private render(): void {
		const remotes = this.getFilteredRemotes();
		const setup = this.showSetupGroups(remotes);
		const grouping = setup ? 'type' : this.groupBy;
		const tunnelWarning = grouping === 'type' ? undefined : this.getRefreshWarning('tunnel');
		this.refreshButton.setTitle(tunnelWarning ?? this.refreshAction.tooltip);
		this.refreshButton.element.setAttribute('aria-description', tunnelWarning ?? '');
		this.tableContainer.classList.toggle('remotes-group-by-type', grouping === 'type');
		this.tableContainer.classList.toggle('remotes-group-by-status', grouping === 'status');
		const active = dom.getActiveElement();
		const hadContentFocus = !!active && this.tableContainer.contains(active);
		this.renderMessages(remotes, grouping === 'type');
		const entries: RemoteTableEntry[] = [];
		const remoteEntry = (remote: ICustomizationRemote): RemoteTableEntry => ({
			type: 'remote', remote,
			busy: this.pendingActions.has(remote.id) || this.pendingConnections.has(remote.id) || !!remote.requiresTunnelSignIn && this.signingInToTunnels, connecting: this.pendingConnections.get(remote.id),
		});
		if (grouping === 'status') {
			for (const group of statusGroups) {
				const members = remotes.filter(remote => getRemoteStatusGroup(remote) === group.key);
				if (!members.length) {
					continue;
				}
				const id = `remote-status-${group.key}`;
				const collapsed = this.collapsedGroups.has(id);
				entries.push({ type: 'group', id, label: group.label, description: group.description, count: members.length, collapsed, refreshing: false });
				if (!collapsed) {
					entries.push(...members.map(remoteEntry));
				}
			}
			entries.push(...remotes.filter(remote => getRemoteStatusGroup(remote) === undefined).map(remoteEntry));
		} else if (grouping === 'none') {
			entries.push(...remotes.map(remoteEntry));
		}
		for (const kind of grouping === 'type' ? this.kinds : []) {
			const groupRemotes = remotes.filter(remote => remote.kind === kind);
			if (!groupRemotes.length && this.query) {
				continue;
			}
			const id = `remote-group-${kind}`;
			// Empty types stay expanded because their rows explain how to set up that type.
			const collapsed = this.collapsedGroups.has(id);
			entries.push({
				type: 'group', id, kind, label: remoteKindLabels[kind],
				count: groupRemotes.length, collapsed, refreshing: this.refreshingKinds.has(kind), warning: this.getRefreshWarning(kind),
				documentation: remoteSetup[kind].documentation,
				...(kind === 'devContainer' && this.model.canCreateDevContainer.get() ? { canCreate: true } : {}),
			});
			if (!collapsed) {
				entries.push(...(groupRemotes.length ? groupRemotes.map(remoteEntry) : [this.getEmptyEntry(kind)]));
			}
		}
		if (this.details.value) {
			const remote = this.displayedRemotes.find(remote => remote.id === this.detailsRemoteId && this.kinds.includes(remote.kind));
			if (remote) {
				this.details.value.update(remote);
			} else {
				this.details.clear();
				this.detailsRemoteId = undefined;
				this.detailsExpanded.reset();
				this.overview.hidden = false;
				this.detailsContainer.hidden = true;
				this.detailsVisible.set(false, undefined);
				this.searchInput.focus();
			}
		}
		this.rows = entries.map(entry => ({ id: entry.type === 'remote' ? entry.remote.id : entry.id, entry }));
		this.filterAction.checked = !!this.query || this.groupBy !== 'none' || this.sortBy !== 'availability' || this.sortDescending;
		const activeElement = dom.getActiveElement();
		const focusedConnection = dom.isHTMLElement(activeElement) && this.tableContainer.contains(activeElement)
			&& activeElement.classList.contains('remotes-connect-action') ? activeElement : undefined;
		const focusedRemoteId = focusedConnection?.closest<HTMLElement>('[data-remote-id]')?.dataset.remoteId;
		this.table.splice(0, this.table.length, this.rows);
		if (focusedConnection && (focusedConnection.hidden || !focusedConnection.isConnected)) {
			const index = this.rows.findIndex(row => row.id === focusedRemoteId);
			if (index >= 0) {
				this.table.setFocus([index]);
			}
			this.table.domFocus();
		}
		if (!this.table.getFocus().length) {
			this.table.focusFirst();
		}
		if (this.tableContainer.hidden && hadContentFocus) {
			this.searchInput.focus();
		}
		this.layout();
	}

	private getDiscoveryNoticeKinds(remotes: readonly ICustomizationRemote[]): readonly RemoteKind[] {
		if (!remotes.length || this.query) {
			return [];
		}
		return this.kinds.filter(kind => kind !== 'tunnel' && this.getRefreshWarning(kind));
	}

	private renderMessages(remotes: readonly ICustomizationRemote[], groupedByType: boolean): void {
		const show = !remotes.length && (!groupedByType || !!this.query);
		const notices = groupedByType ? [] : this.getDiscoveryNoticeKinds(remotes).map(kind => this.getEmptyEntry(kind));
		this.message.hidden = !show && !notices.length;
		this.message.classList.toggle('remotes-discovery-notices', !show && notices.length > 0);
		this.messageText.hidden = !show;
		this.tableContainer.hidden = show;
		const kinds = this.kinds;
		const loading = kinds.some(kind => this.refreshingKinds.has(kind));
		const failed = kinds.some(kind => this.getRefreshWarning(kind));
		const filtered = !!this.query;
		const title = !show ? '' : filtered
			? loading ? localize('remotes.empty.searching', "Looking for environments...") : localize('remotes.empty.filtered', "No environments match your filters.")
			: loading ? localize('remotes.empty.searching', "Looking for environments...")
				: failed ? localize('remotes.empty.refreshFailed', "Couldn't refresh environments.")
					: localize('remotes.empty.none', "No environments found.");
		const context = JSON.stringify([show, this.query]);
		this.message.setAttribute('aria-busy', String(loading || this.signingInToTunnels));
		for (const [id, action] of this.emptyStateActions) {
			if (action.button) {
				action.button.enabled = id.endsWith('refresh') ? this.refreshAction.enabled
					: id.endsWith('signIn') ? !this.signingInToTunnels && !loading : !loading || id === 'clearFilter';
			}
		}
		this.messageText.textContent = title;
		this.emptyStateContent = [title, ...this.emptyStateContent.split('\n').slice(1)].join('\n');
		if (show && loading && this.emptyStateContext === context && this.emptyStateActions.has('refresh')) {
			return;
		}
		this.emptyStateContext = context;
		const key = JSON.stringify([show, this.query, failed, loading, notices]);
		if (key === this.emptyStateKey) {
			return;
		}
		this.emptyStateKey = key;
		const active = dom.getActiveElement();
		const restoreFocus = dom.isHTMLElement(active) && this.message.contains(active);
		const focusedAction = [...this.emptyStateActions].find(([, action]) => action.element === active)?.[0];
		this.emptyStateDisposables.clear();
		this.emptyStateActions.clear();
		dom.clearNode(this.emptyStateBody);
		this.messageText.textContent = title;
		const content = title ? [title] : [];
		const addButton = (container: HTMLElement, id: string, label: string, run: () => void, enabled = true): void => {
			const button = this.emptyStateDisposables.add(new Button(container, { ...defaultButtonStyles, secondary: true, title: false }));
			button.label = label;
			button.enabled = enabled;
			button.element.dataset.emptyAction = id;
			this.emptyStateActions.set(id, { element: button.element, get enabled() { return button.enabled; }, button });
			this.emptyStateDisposables.add(button.onDidClick(run));
			content.push(label);
		};
		const addClearFilter = (container: HTMLElement): void => {
			if (filtered) {
				addButton(container, 'clearFilter', localize('remotes.clearFilter', "Clear Filter"), () => this.clearFilter());
			}
		};
		if (show) {
			const card = dom.append(this.emptyStateBody, dom.$('.remotes-empty-state-search'));
			if (!filtered && failed) {
				const guidance = localize('remotes.empty.retryGuidance', "Check your connection and try refreshing.");
				dom.append(card, dom.$('p.remotes-empty-state-description', undefined, guidance));
				content.push(guidance);
			}
			const actions = dom.append(card, dom.$('.remotes-empty-state-actions'));
			addClearFilter(actions);
			if (failed && !filtered) {
				addButton(actions, 'refresh', this.refreshAction.label, () => void this.refresh(), this.refreshAction.enabled);
			}
		}
		for (const entry of notices) {
			const notice = dom.append(this.emptyStateBody, dom.$('.remotes-discovery-notice'));
			const label = dom.append(notice, dom.$('span.remotes-discovery-notice-label', undefined, entry.label));
			if (entry.description) {
				this.emptyStateDisposables.add(this.hoverService.setupDelayedHover(label, { content: entry.description }));
			}
			content.push(entry.label);
		}
		this.emptyStateContent = content.join('\n');
		if (restoreFocus) {
			const replacement = focusedAction ? this.emptyStateActions.get(focusedAction) : undefined;
			if (replacement) {
				replacement.element.focus();
			} else {
				this.searchInput.focus();
			}
		}
	}

	private async copyAddress(id: string): Promise<void> {
		try {
			await this.model.copyAddress(id);
		} catch (error) {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		}
	}

	private async manageRemote(remote: ICustomizationRemote, action: 'rename' | 'githubEnvironment' | 'updateServer' | 'restartDistribution'): Promise<void> {
		const { id } = remote;
		if (this.pendingActions.has(id) || this.pendingConnections.has(id)) {
			return;
		}
		const focusedAction = dom.getActiveElement();
		const restoreFocus = dom.isHTMLElement(focusedAction) && this.domNode.contains(focusedAction) && focusedAction.closest<HTMLElement>('[data-remote-id]')?.dataset.remoteId === id;
		this.pendingActions.add(id);
		this.render();
		try {
			if (action === 'githubEnvironment') {
				await this.model.setSharedAsGitHubEnvironment(id, !remote.gitHubEnvironment);
			} else if (action === 'updateServer') {
				await this.model.updateServer(id);
			} else if (action === 'restartDistribution') {
				await this.model.restartWSLDistribution(id);
			} else {
				await this.model.rename(id);
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		} finally {
			this.pendingActions.delete(id);
			if (!this._store.isDisposed) {
				this.render();
				const active = dom.getActiveElement();
				const activeRow = dom.isHTMLElement(active) && this.domNode.contains(active) ? active.closest<HTMLElement>('[data-remote-id]') : undefined;
				const index = this.rows.findIndex(row => row.id === id);
				if (index >= 0 && (activeRow && activeRow.dataset.remoteId !== id
					|| restoreFocus && !focusedAction?.isConnected && active === this.domNode.ownerDocument.body)) {
					this.table.setFocus([index]);
					this.table.domFocus();
				}
			}
		}
	}

	/**
	 * Creates a Dev Container on a host, or from the section, asking where to create it when there is more than one choice.
	 * Its new row shows its progress, so the create actions stay available for creating more in parallel.
	 */
	private async createDevContainer(id?: string): Promise<void> {
		try {
			await this.model.createDevContainer(id);
		} catch (error) {
			if (!isCancellationError(error) && !this._store.isDisposed) {
				this.notificationService.error(error);
			}
		}
	}

	private removeRemote(id: string, kind: 'environment' | 'tunnel' | 'ssh' | 'devContainer'): Promise<void> {
		switch (kind) {
			case 'tunnel': return this.model.deleteTunnel(id);
			case 'ssh': return this.model.deleteSSHHost(id);
			case 'devContainer': return this.model.deleteDevContainer(id);
			case 'environment': return this.model.remove(id);
		}
	}

	private async deleteRemote(id: string, kind: 'environment' | 'tunnel' | 'ssh' | 'devContainer'): Promise<void> {
		if (this.pendingActions.has(id) || this.pendingConnections.has(id)) {
			return;
		}
		const active = dom.getActiveElement();
		const restoreFocus = dom.isHTMLElement(active) && this.domNode.contains(active) && active.closest<HTMLElement>('[data-remote-id]')?.dataset.remoteId === id;
		this.pendingActions.add(id);
		this.render();
		try {
			await this.removeRemote(id, kind);
		} catch (error) {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		} finally {
			this.pendingActions.delete(id);
			if (!this._store.isDisposed) {
				this.render();
				const currentActive = dom.getActiveElement();
				if (restoreFocus && !this.rows.some(row => row.id === id)
					&& (currentActive === active || !active?.isConnected && currentActive === this.domNode.ownerDocument.body)) {
					if (this.tableContainer.hidden) {
						this.searchInput.focus();
					} else {
						this.table.domFocus();
					}
				}
			}
		}
	}

	private async setConnected(id: string, connected: boolean): Promise<void> {
		if (this.pendingActions.has(id) || this.pendingConnections.has(id)) {
			return;
		}
		this.pendingConnections.set(id, connected);
		this.render();
		try {
			await this.model.setConnected(id, connected);
			this.connectionFailures.deleteAndDispose(id);
		} catch (error) {
			if (!isCancellationError(error)) {
				const remote = this.model.remotes.get().find(remote => remote.id === id);
				if (connected && remote) {
					// The page can only open while Remote Environments is open; the error itself stays in the notification.
					const troubleshoot = this.visible && !this._store.isDisposed;
					const handle = this.notificationService.notify({
						severity: Severity.Error,
						message: localize('remotes.connectionFailureFor', "Connection to {0} failed: {1}", remote.name, toErrorMessage(error)),
						actions: troubleshoot ? {
							primary: [toAction({
								id: 'remotes.troubleshootFailure', label: localize('remotes.troubleshootAction', "Troubleshoot"),
								run: () => {
									const current = this.displayedRemotes.find(remote => remote.id === id);
									if (this.detailsRemoteId === id && this.details.value?.mode === 'troubleshoot') {
										this.details.value.focus();
									} else if (current) {
										this.openDetails(current, 'troubleshoot');
									}
								},
							})],
						} : undefined,
					});
					if (troubleshoot) {
						this.connectionFailures.set(id, toDisposable(() => handle.updateActions()));
					}
				} else {
					this.notificationService.error(error);
				}
			}
		} finally {
			this.pendingConnections.delete(id);
			if (!this._store.isDisposed) {
				this.render();
			}
		}
	}

	private async newSession(id: string): Promise<void> {
		if (this.pendingActions.has(id) || this.pendingConnections.has(id)) {
			return;
		}
		try {
			const remote = this.model.remotes.get().find(remote => remote.id === id);
			const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
			if (!remote || !RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus) || !provider) {
				throw new Error(localize('remotes.newSessionUnavailable', "Connect to this environment before starting a session."));
			}
			await this.commandService.executeCommand('workbench.action.closeModalEditor');
			await this.sessionsService.openNewSession();
			const composer = this.composerService.activeComposer.get();
			if (!composer?.selectEnvironment) {
				throw new Error(localize('remotes.composerUnavailable', "Couldn't open the new session composer."));
			}
			await composer.selectEnvironment(provider.id);
		} catch (error) {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		}
	}

	private getRemoteAriaLabel(remote: ICustomizationRemote): string {
		const displayName = remote.description ? localize('remotes.nameWithDescription', "{0} on {1}", remote.name, remote.description) : remote.name;
		const name = remote.pickerUnavailableReason
			? localize('remotes.unavailablePickerName', "{0} (not shown in environment picker: {1})", displayName, remote.pickerUnavailableReason)
			: remote.hidden ? localize('remotes.hiddenName', "{0} (hidden from environment picker)", displayName) : displayName;
		const availability = getRemoteAvailabilityLabel(remote);
		const sentences = [
			availability ? localize('remotes.accessibleRow', "{0}. Status: {1}.", name, availability) : localize('remotes.accessibleRowWithoutStatus', "{0}.", name),
		];
		const problem = this.pendingConnections.has(remote.id) ? undefined : getConnectionProblem(remote);
		if (problem) {
			sentences.push(problem);
		}
		const metadata = (['activity', 'system'] as const).map(column => {
			return getRemoteMetadataDetails(remote, column);
		}).filter(Boolean);
		if (metadata.length) {
			sentences.push(localize('remotes.accessibleMetadata', "Last known details: {0}.", metadata.join(', ')));
		}
		sentences.push(localize('remotes.accessibleConnectionType', "Connection type: {0}.", getRemoteTypeLabel(remote.kind)));
		if (remote.requiresTunnelSignIn) {
			sentences.push(localize('remotes.signIn', "Sign In"));
		}
		const address = getRemoteAddressLabel(remote);
		if (address && address !== remote.name) {
			sentences.push(localize('remotes.accessibleIdentity', "Address: {0}.", address));
		}
		const gitHubEnvironment = getGitHubEnvironmentLabel(remote);
		if (gitHubEnvironment) {
			sentences.push(gitHubEnvironment);
		}
		const serverUpdate = getServerUpdateLabel(remote);
		if (serverUpdate) {
			sentences.push(serverUpdate);
		}
		if (remote.contributedBy) {
			sentences.push(localize('remotes.accessibleContributedBy', "Registered by the {0} extension.", remote.contributedBy.displayName));
		}
		return sentences.join(' ');
	}

	private getRefreshWarning(kind: RemoteKind): string | undefined {
		if (kind === 'tunnel' && this.model.tunnelAuthenticationRequired.get()) {
			return undefined;
		}
		if (!this.failedKinds.includes(kind)) {
			return undefined;
		}
		switch (kind) {
			case 'ssh': return localize('remotes.sshRefreshWarning', "Couldn't read your SSH hosts. Check your SSH configuration. See the Window log for more details.");
			case 'wsl': return localize('remotes.wslRefreshWarning', "Couldn't refresh WSL distributions. Check that WSL is available. See the Window log for more details.");
			case 'tunnel': return localize('remotes.tunnelRefreshWarning', "Couldn't refresh tunnels. Check your sign-in and network connection. See the Window log for more details.");
			case 'environment': return localize('remotes.environmentRefreshWarning', "Couldn't refresh environments. Check your GitHub sign-in and network connection. See the Window log for more details.");
			case 'extension': return undefined;
			case 'devContainer': return undefined;
		}
	}

	/**
	 * Shows a section heading beside the search controls and names the widget as a region after it,
	 * or removes both when `label` is undefined. Call {@link layout} afterwards.
	 */
	setHeading(label: string | undefined): void {
		this.heading.hidden = !label;
		this.headingTitle.textContent = label ?? '';
		if (label) {
			this.domNode.setAttribute('role', 'region');
			this.domNode.setAttribute('aria-labelledby', this.headingTitle.id);
		} else {
			this.domNode.removeAttribute('role');
			this.domNode.removeAttribute('aria-labelledby');
		}
	}

	getAccessibilityContent(): string {
		if (this.details.value) {
			return this.details.value.getAccessibilityContent();
		}
		const content = this.getRemotesAccessibilityContent();
		return this.heading.hidden ? content : `${this.headingTitle.textContent}\n${content}`;
	}

	private getRemotesAccessibilityContent(): string {
		const remotes = this.getFilteredRemotes();
		if (this.tableContainer.hidden) {
			return this.emptyStateContent;
		}
		const grouping = this.showSetupGroups(remotes) ? 'type' : this.groupBy;
		if (grouping === 'none') {
			const tunnelWarning = this.getRefreshWarning('tunnel');
			return [
				...remotes.map(remote => this.getRemoteAriaLabel(remote)),
				...(tunnelWarning ? [tunnelWarning] : []),
				...this.getDiscoveryNoticeKinds(remotes).flatMap(kind => {
					const entry = this.getEmptyEntry(kind);
					return [remoteKindLabels[kind], entry.label, entry.description ?? '', entry.action?.label ?? ''];
				}),
			].join('\n');
		}
		if (grouping === 'status') {
			const tunnelWarning = this.getRefreshWarning('tunnel');
			return [...statusGroups.flatMap(group => {
				const members = remotes.filter(remote => getRemoteStatusGroup(remote) === group.key);
				return members.length ? [group.label, group.description, ...members.map(remote => this.getRemoteAriaLabel(remote))] : [];
			}), ...remotes.filter(remote => getRemoteStatusGroup(remote) === undefined).map(remote => this.getRemoteAriaLabel(remote)),
			...(tunnelWarning ? [tunnelWarning] : []), ...this.getDiscoveryNoticeKinds(remotes).flatMap(kind => {
				const entry = this.getEmptyEntry(kind);
				return [remoteKindLabels[kind], entry.label, entry.description ?? '', entry.action?.label ?? ''];
			})].join('\n');
		}
		return this.kinds.flatMap(kind => {
			const warning = this.getRefreshWarning(kind);
			const entries = remotes.filter(remote => remote.kind === kind);
			if (!entries.length && this.query) {
				return [];
			}
			const empty = entries.length ? undefined : this.getEmptyEntry(kind);
			const documentation = remoteSetup[kind].documentation;
			return [
				remoteKindLabels[kind],
				...(this.refreshingKinds.has(kind) ? [localize('remotes.refreshingGroup', "Refreshing.")] : []),
				...(warning ? [warning] : []),
				...entries.map(remote => this.getRemoteAriaLabel(remote)),
				...(empty ? [empty.label, empty.description ?? '', empty.action?.label ?? ''] : []),
				...(documentation ? [`${documentation.label}: ${documentation.href}`] : []),
			];
		}).join('\n');
	}

	focus(): void {
		if (this.details.value) {
			this.details.value.focus();
		} else {
			this.searchInput.focus();
		}
	}

	layout(): void {
		if (this.details.value) {
			this.details.value.layout();
			return;
		}
		this.searchInput.paddingRight = this.searchInput.actionsWidth + 4;
		if (this.tableContainer.hidden) {
			return;
		}
		if (this.domNode.clientWidth > 0 && this.domNode.clientHeight > 0) {
			const height = this.tableContainer.clientHeight;
			const width = this.tableContainer.clientWidth;
			const compact = width < compactTableWidth;
			const activeElement = dom.getActiveElement();
			if (compact && !this.tableContainer.classList.contains('remotes-table-compact') && dom.isHTMLElement(activeElement) && this.tableContainer.contains(activeElement) && activeElement.closest('.monaco-button')) {
				this.table.domFocus();
			}
			this.tableContainer.classList.toggle('remotes-table-compact', compact);
			this.tableContainer.classList.toggle('remotes-hide-method', width < 1000);
			this.tableContainer.classList.toggle('remotes-hide-activity', width < 720);
			this.tableContainer.classList.toggle('remotes-hide-system', width < 520);
			this.tableContainer.classList.toggle('remotes-hide-sandbox-profile', width < 520 || !this.sandboxProfilesEnabled);
			if (dom.isHTMLElement(activeElement) && this.tableContainer.contains(activeElement) && activeElement.classList.contains('remotes-sort-header') && !activeElement.offsetWidth) {
				this.table.domFocus();
			}
			this.tableInner.style.height = `${height}px`;
			this.tableInner.style.width = `${width}px`;
			if (this.emptyRowWidth !== this.tableContainer.clientWidth) {
				this.emptyRowWidth = this.tableContainer.clientWidth;
				this.table.splice(0, this.table.length, this.rows);
			}
			this.table.layout(height, width);
		}
	}

	override dispose(): void {
		this.cancelRefresh();
		this.detailsExpanded.reset();
		super.dispose();
		this.domNode.remove();
	}
}
