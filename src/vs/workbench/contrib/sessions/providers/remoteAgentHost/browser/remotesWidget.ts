/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Action } from '../../../../../../base/common/actions.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { GITHUB_ENVIRONMENTS_DOCS_URL, GitHubEnvironmentsEnabledSettingId } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { WSL_INSTALL_DOCS_URL } from '../../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchTable } from '../../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { IEditorService, MODAL_GROUP } from '../../../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../services/preferences/common/preferences.js';
import { getVisibleRemoteKinds, ICustomizationRemote, IRemotesModel, RemoteKind, remoteKindLabels } from './remotesModel.js';
import { getConnectionLabel, getRemoteMetadataLabel, getRemoteStatusGroup, getRemoteTypeLabel, IRemoteEmptyEntry, IRemoteTableRow, RemotesTableRenderer, RemoteRowAction, RemoteTableEntry } from './remotesTable.js';
import { RemoteEnvironmentDetails, RemoteEnvironmentDetailsMode } from './remoteEnvironmentDetails.js';
import './media/remotesWidget.css';

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
		label: localize('remotes.empty.tunnels', "No dev tunnels found for this account."),
		description: localize('remotes.empty.tunnels.description', "Enable a dev tunnel on another computer, then sign in with the same account."),
		documentation: { label: localize('remotes.docs.tunnels', "Dev Tunnel setup guide"), href: 'https://aka.ms/vscode-agent-tunnel' },
	},
	environment: {
		label: localize('remotes.empty.environments', "No GitHub Environments available."),
		description: localize('remotes.empty.environments.description', "Sign in to GitHub and enable environment sharing on another machine."),
		documentation: { label: localize('remotes.docs.environments', "GitHub Environments setup guide"), href: GITHUB_ENVIRONMENTS_DOCS_URL },
	},
};

const horizontalScrollbarSize = 10;
export const RemotesDetailsExpandedContext = new RawContextKey<boolean>('remotesDetailsExpanded', false);
const statusGroups = [
	{ key: 'ready', label: localize('remotes.ready', "Ready to use"), description: localize('remotes.ready.detail', "Connected from this computer") },
	{ key: 'available', label: localize('remotes.available', "Available"), description: localize('remotes.available.detail', "Connect when you need them") },
	{ key: 'offline', label: localize('remotes.offlineGroup', "Offline"), description: localize('remotes.offlineGroup.detail', "Can't be reached right now") },
] as const;

export class RemotesWidget extends Disposable {
	readonly domNode: HTMLElement;
	protected readonly table: WorkbenchTable<IRemoteTableRow>;
	private readonly tableContainer: HTMLElement;
	private readonly tableInner: HTMLElement;
	private readonly tableScrollable: DomScrollableElement;
	private readonly tableMinWidth: number;
	private readonly message: HTMLElement;
	private readonly searchRow: HTMLElement;
	private readonly heading: HTMLElement;
	private readonly headingTitle: HTMLElement;
	private readonly messageText: HTMLElement;
	private readonly emptyStateBody: HTMLElement;
	private readonly emptyStateDisposables = this._register(new DisposableStore());
	private readonly emptyStateActions = new Map<string, { readonly element: HTMLElement; readonly enabled: boolean }>();
	private emptyStateKey = '';
	private emptyStateContent = '';
	private readonly searchInput: InputBox;
	private readonly clearSearchAction: Action;
	private readonly collapseAllAction: Action;
	private readonly refreshAction: Action;
	private readonly typeFilter: ActionBar;
	private readonly typeFilterContainer: HTMLElement;
	private readonly filterDisposables = this._register(new DisposableStore());
	private filterActions: { readonly kind: RemoteKind | undefined; readonly action: Action }[] = [];
	private readonly refreshRequest = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly refreshingKinds = new Set<RemoteKind>();
	private readonly refreshedKinds = new Set<RemoteKind>();
	private readonly pendingActions = new Set<string>();
	private readonly pendingConnections = new Map<string, boolean>();
	private readonly collapsedGroups = new Set<string>();
	private groupBy: 'status' | 'type' = 'status';
	private filterKind: RemoteKind | undefined;
	private kinds: readonly RemoteKind[];
	private rows: IRemoteTableRow[] = [];
	private visible = false;
	private query = '';
	private failedKinds: readonly RemoteKind[] = [];
	private hasRefreshed = false;
	private signingInToTunnels = false;
	private readonly details = this._register(new MutableDisposable<RemoteEnvironmentDetails>());
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
		@IHoverService hoverService: IHoverService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ISSHRemoteAgentHostService private readonly sshService: ISSHRemoteAgentHostService,
		@IEditorService private readonly editorService: IEditorService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._register(model);
		this.detailsExpanded = RemotesDetailsExpandedContext.bindTo(contextKeyService);
		this.kinds = getVisibleRemoteKinds(operatingSystem);
		this.domNode = dom.append(container, dom.$('.remotes-widget'));
		this.overview = dom.append(this.domNode, dom.$('.remotes-overview'));
		this.detailsContainer = dom.append(this.domNode, dom.$('.remotes-details-page'));
		this.detailsContainer.hidden = true;
		const searchRow = this.searchRow = dom.append(this.overview, dom.$('.remotes-search-row'));
		this.heading = dom.append(searchRow, dom.$('.remotes-heading'));
		this.heading.hidden = true;
		dom.append(this.heading, renderIcon(Codicon.remoteExplorer)).setAttribute('aria-hidden', 'true');
		this.headingTitle = dom.append(this.heading, dom.$('h2.remotes-heading-title', { id: generateUuid() }));
		const searchControls = dom.append(searchRow, dom.$('.remotes-search-controls'));
		const actionHoverDelegate = this._register(createInstantHoverDelegate());
		this.clearSearchAction = this._register(new Action('remotes.clearSearch', localize('remotes.clearSearch', "Clear search"), ThemeIcon.asClassName(Codicon.clearAll), false, () => {
			this.setSearchQuery('');
			this.searchInput.focus();
		}));
		this.collapseAllAction = this._register(new Action('remotes.collapseAll', localize('remotes.collapseAll', "Collapse all"), ThemeIcon.asClassName(Codicon.collapseAll), true, () => {
			for (const row of this.rows) {
				if (row.entry.type === 'group') {
					this.collapsedGroups.add(row.id);
				}
			}
			this.render();
		}));
		this.searchInput = this._register(new InputBox(dom.append(searchControls, dom.$('.remotes-search-container')), contextViewService, {
			placeholder: localize('remotes.searchPlaceholder', "Search environments"),
			ariaLabel: localize('remotes.searchLabel', "Search environments"),
			inputBoxStyles: defaultInputBoxStyles,
			actions: [this.clearSearchAction, this.collapseAllAction],
			actionViewItemProvider: (action, options) => new ActionViewItem(undefined, action, { ...options, hoverDelegate: actionHoverDelegate }),
		}));
		this._register(this.searchInput.onDidChange(query => this.setSearchQuery(query)));
		this.typeFilterContainer = dom.append(searchRow, dom.$('.remotes-type-filter'));
		this.typeFilter = this._register(new ActionBar(this.typeFilterContainer, {
			ariaLabel: localize('remotes.filterType', "Filter by type"), hoverDelegate: actionHoverDelegate,
		}));
		this.refreshAction = this._register(new Action('remotes.refresh', localize('remotes.refresh', "Refresh"), ThemeIcon.asClassName(Codicon.refresh), true, () => this.refresh()));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, dom.append(searchControls, dom.$('.remotes-header-actions')), { ariaLabel: localize('remotes.actions', "Remote environment actions") }));
		toolbar.setActions([this.refreshAction]);
		const addButton = this._register(new Button(dom.append(searchRow, dom.$('.remotes-add')), {
			...defaultButtonStyles, secondary: true, hoverDelegate: actionHoverDelegate,
			title: localize('remotes.addHost', "Add remote host"),
		}));
		addButton.label = localize('remotes.add', "Add remote host");
		this._register(addButton.onDidClick(async () => {
			try {
				await commandService.executeCommand('sessions.remoteAgentHost.add');
				if (!this._store.isDisposed) {
					await this.refresh();
				}
			} catch (error) {
				if (!isCancellationError(error)) {
					this.notificationService.error(error);
				}
			}
		}));
		this.message = dom.append(this.overview, dom.$('.remotes-message'));
		this.messageText = dom.append(this.message, dom.$('span', { role: 'status' }));
		this.emptyStateBody = dom.append(this.message, dom.$('.remotes-empty-state-body'));
		this.tableContainer = dom.append(this.overview, dom.$('.remotes-table-container'));
		const viewport = dom.$('.remotes-table-viewport');
		this.tableInner = dom.append(viewport, dom.$('.remotes-table-inner'));
		this.tableScrollable = this._register(new DomScrollableElement(viewport, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			useShadows: false,
			scrollYToX: true,
			horizontalScrollbarSize,
		}));
		this.tableContainer.appendChild(this.tableScrollable.getDomNode());

		let label = localize('remotes.tableLabel', "Remote environments. Columns: Name, Type, System, Sessions, Last connection, Actions.");
		const helpKeybinding = keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
		if (configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Remotes) && helpKeybinding) {
			label = localize('remotes.tableLabelWithHelp', "{0} Use {1} for accessibility help.", label, helpKeybinding);
		}
		const columnDefinitions = [
			{ id: 'gutter', label: '', weight: 0, minimumWidth: 32, maximumWidth: 32 },
			{ id: 'name', label: localize('remotes.nameColumn', "Name"), weight: 0.45, minimumWidth: 180 },
			{ id: 'type', label: localize('remotes.typeColumn', "Type"), weight: 0.2, minimumWidth: 164 },
			{ id: 'system', label: localize('remotes.systemColumn', "System"), weight: 0.1, minimumWidth: 80 },
			{ id: 'sessions', label: localize('remotes.sessionsColumn', "Sessions"), weight: 0.1, minimumWidth: 112 },
			{ id: 'activity', label: localize('remotes.activityColumn', "Last connection"), weight: 0.15, minimumWidth: 112 },
			{ id: 'actions', label: '', weight: 0, minimumWidth: 132, maximumWidth: 132 },
		] as const;
		const renderers = columnDefinitions.map(column => new RemotesTableRenderer(
			column.id, (entry, action) => this.runRowAction(entry, action), actionHoverDelegate,
			instantiationService, hoverService, openerService,
		));
		const columns = columnDefinitions.map((column, index) => ({
			...column, tooltip: column.label, templateId: renderers[index].templateId, project: (row: IRemoteTableRow) => row,
		}));
		this.tableMinWidth = columns.reduce((sum, column) => sum + column.minimumWidth, 0);
		this.table = this._register(instantiationService.createInstance(WorkbenchTable<IRemoteTableRow>,
			'RemotesTable', this.tableInner, {
			headerRowHeight: 31, // Includes the header's bottom border.
			getHeight: row => row.entry.type === 'group' ? 32 : row.entry.type === 'empty' ? row.entry.documentation ? 76 : 54 : row.entry.showConnectionStatus ? 44 : 36,
		}, columns, renderers, {
			identityProvider: { getId: row => row.id },
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: row => row.entry.type === 'remote' ? row.entry.remote.name : row.entry.label },
			accessibilityProvider: {
				getWidgetAriaLabel: () => label,
				getAriaLabel: row => {
					const entry = row.entry;
					if (entry.type === 'group' && entry.refreshing) {
						return localize('remotes.groupRefreshingLabel', "{0}, {1} environments. Refreshing.", entry.label, entry.count);
					}
					return entry.type === 'group'
						? entry.warning
							? localize('remotes.groupWarningLabel', "{0}, {1} environments. Warning: {2}", entry.label, entry.count, entry.warning)
							: entry.description
								? localize('remotes.groupDescriptionLabel', "{0}, {1} environments. {2}", entry.label, entry.count, entry.description)
								: localize('remotes.groupLabel', "{0}, {1} environments", entry.label, entry.count)
						: entry.type === 'empty'
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
		this._register(this.table.onDidChangeFocus(event => {
			for (const renderer of renderers) {
				renderer.setFocusedId(event.elements[0]?.id);
			}
		}));
		this._register(this.table.onDidOpen(event => {
			if (event.element?.entry.type === 'group') {
				this.toggleGroup(event.element.entry.id);
			}
		}));
		this._register(dom.addDisposableListener(this.table.getHTMLElement(), dom.EventType.KEY_DOWN, event => {
			if (!dom.isHTMLElement(event.target) || !event.target.classList.contains('monaco-list')) {
				return;
			}
			const keyboardEvent = new StandardKeyboardEvent(event);
			const entry = this.table.getFocusedElements()[0]?.entry;
			if (entry?.type === 'group' && (keyboardEvent.keyCode === KeyCode.LeftArrow || keyboardEvent.keyCode === KeyCode.RightArrow)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				const collapse = keyboardEvent.keyCode === KeyCode.LeftArrow;
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
		this._register(autorun(reader => {
			this.model.remotes.read(reader);
			this.model.tunnelAuthenticationRequired.read(reader);
			const kinds = getVisibleRemoteKinds(operatingSystem, this.model.environmentsEnabled.read(reader));
			if (kinds.join() !== this.kinds.join() || !this.filterActions.length) {
				const activeElement = dom.getActiveElement();
				const hadFocus = !!activeElement && this.typeFilterContainer.contains(activeElement);
				this.kinds = kinds;
				if (this.filterKind && !kinds.includes(this.filterKind)) {
					this.filterKind = undefined;
				}
				this.typeFilter.clear();
				this.filterDisposables.clear();
				this.filterActions = [undefined, ...kinds].map(kind => {
					const label = kind === undefined ? localize('remotes.filterAll', "All")
						: getRemoteTypeLabel(kind);
					const action = this.filterDisposables.add(new Action(`remotes.filter.${kind ?? 'all'}`, label, undefined, true, () => {
						this.setFilterKind(kind);
					}));
					action.checked = kind === this.filterKind;
					return { kind, action };
				});
				this.typeFilter.push(this.filterActions.map(item => item.action), { icon: false, label: true });
				if (hadFocus) {
					this.typeFilter.focus(this.filterActions.findIndex(item => item.kind === this.filterKind));
				}
			}
			this.render();
		}));
	}

	private setFilterKind(kind: RemoteKind | undefined): void {
		this.filterKind = kind;
		for (const item of this.filterActions) {
			item.action.checked = item.kind === kind;
		}
		this.render();
	}

	private runRowAction(entry: RemoteTableEntry, action: RemoteRowAction): void {
		if (entry.type === 'empty' && action === 'signIn') {
			void this.signInToTunnels();
		} else if (entry.type === 'group') {
			if (action === 'toggleGroup') {
				this.toggleGroup(entry.id);
			} else if (action === 'configure' && entry.kind) {
				void this.openConfiguration(entry.kind);
			} else if (action === 'documentation' && entry.documentation) {
				void this.openDocumentation(entry.documentation.href);
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
			} else if (action === 'connect') {
				void this.setConnected(entry.remote.id, !RemoteAgentHostConnectionStatus.isConnected(entry.remote.connectionStatus));
			} else if (action === 'rename') {
				void this.manageRemote(entry.remote.id, 'rename');
			} else if (action === 'copyAddress') {
				void this.copyAddress(entry.remote.id);
			} else if (action === 'locationPreference' && (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh')) {
				this.openDetails(entry.remote, 'runBehavior');
			} else if (action === 'troubleshoot') {
				this.openDetails(entry.remote, 'troubleshoot');
			} else if (action === 'updateServer') {
				void this.manageRemote(entry.remote.id, 'updateServer');
			} else if (action === 'delete' && (entry.remote.kind === 'environment' && entry.remote.canRemove || (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh') && entry.remote.canDelete)) {
				void this.deleteRemote(entry.remote.id, entry.remote.kind);
			}
		}
	}

	private openDetails(remote: ICustomizationRemote, mode: RemoteEnvironmentDetailsMode): void {
		if (this.details.value?.isBusy) {
			return;
		}
		if (this.detailsRemoteId === remote.id && this.details.value?.mode === mode) {
			this.closeDetails();
			return;
		}
		this.detailsRemoteId = remote.id;
		this.details.value = this.instantiationService.createInstance(RemoteEnvironmentDetails, remote, mode, this.model, () => this.closeDetails(), busy => {
			if (busy) {
				this.pendingActions.add(remote.id);
			} else {
				this.pendingActions.delete(remote.id);
			}
			if (!this._store.isDisposed) {
				this.render();
			}
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
		} catch (error) {
			if (!isCancellationError(error) && !this._store.isDisposed) {
				this.notificationService.error(error);
			}
		} finally {
			this.signingInToTunnels = false;
			if (!this._store.isDisposed) {
				this.render();
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

	setGrouping(groupBy: 'status' | 'type'): void {
		this.groupBy = groupBy;
		this.render();
	}

	private toggleGroup(id: string): void {
		if (!this.collapsedGroups.delete(id)) {
			this.collapsedGroups.add(id);
		}
		this.render();
		const index = this.rows.findIndex(row => row.id === id);
		this.table.setFocus([index]);
	}

	private async openConfiguration(kind: RemoteKind): Promise<void> {
		try {
			if (kind === 'ssh') {
				const resource = await this.sshService.ensureUserSSHConfig();
				await this.editorService.openEditor({ resource, options: { pinned: true } }, MODAL_GROUP);
			} else if (kind === 'tunnel') {
				await this.preferencesService.openSettings({ query: 'chat.remoteAgentHosts' });
			} else if (kind === 'environment') {
				await this.preferencesService.openSettings({ query: GitHubEnvironmentsEnabledSettingId });
			}
		} catch (error) {
			this.notificationService.error(error);
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
		}
	}

	setSearchQuery(query: string): void {
		const normalizedQuery = query.toLowerCase().trim();
		const changed = this.query !== normalizedQuery;
		this.query = normalizedQuery;
		this.searchInput.value = query;
		this.clearSearchAction.enabled = !!query;
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
		this.refreshAction.class = ThemeIcon.asClassName(Codicon.refresh);
		this.tableContainer.setAttribute('aria-busy', 'false');
		if (this.refreshingKinds.size) {
			this.refreshingKinds.clear();
			this.render();
		}
	}

	private async refresh(): Promise<void> {
		this.cancelRefresh();
		const request = new CancellationTokenSource();
		this.refreshRequest.value = request;
		this.refreshAction.enabled = false;
		this.refreshAction.class = ThemeIcon.asClassName(ThemeIcon.modify(Codicon.loading, 'spin'));
		this.tableContainer.setAttribute('aria-busy', 'true');
		try {
			const failedKinds = await this.model.refresh(request.token, {
				report: progress => {
					if (request.token.isCancellationRequested || this._store.isDisposed || this.refreshRequest.value !== request) {
						return;
					}
					if (progress.refreshing) {
						this.refreshingKinds.add(progress.kind);
					} else {
						this.refreshingKinds.delete(progress.kind);
						this.refreshedKinds.add(progress.kind);
						this.failedKinds = [...this.failedKinds.filter(kind => kind !== progress.kind), ...(progress.failed ? [progress.kind] : [])];
					}
					this.render();
				},
			});
			if (!request.token.isCancellationRequested && !this._store.isDisposed) {
				this.failedKinds = failedKinds;
				this.hasRefreshed = true;
				if (failedKinds.some(kind => this.kinds.includes(kind) && this.getRefreshWarning(kind))) {
					status(localize('remotes.refreshWarnings', "Some remote locations could not be refreshed. Check the warnings on the remote groups for details."));
				}
			}
		} catch (error) {
			if (!request.token.isCancellationRequested) {
				this.notificationService.error(error);
				this.failedKinds = this.kinds;
				this.hasRefreshed = true;
			}
		} finally {
			if (this.refreshRequest.value === request) {
				this.refreshAction.enabled = true;
				this.refreshAction.class = ThemeIcon.asClassName(Codicon.refresh);
				this.refreshRequest.clear();
				this.tableContainer.setAttribute('aria-busy', 'false');
				this.refreshingKinds.clear();
				this.render();
			}
		}
	}

	private getFilteredRemotes(): readonly ICustomizationRemote[] {
		return this.model.remotes.get().filter(remote => this.kinds.includes(remote.kind)
			&& (!this.filterKind || remote.kind === this.filterKind)
			&& `${remote.name} ${remote.detail} ${remoteKindLabels[remote.kind]} ${getRemoteTypeLabel(remote.kind)}`.toLowerCase().includes(this.query));
	}

	private getEmptyEntry(kind: RemoteKind, hasRemotes = false): IRemoteEmptyEntry {
		const id = `remote-empty-${kind}`;
		const authProvider = kind === 'tunnel' ? this.model.tunnelAuthenticationRequired.get() : undefined;
		if (authProvider) {
			const providerLabel = authProvider === 'github' ? 'GitHub' : 'Microsoft';
			return {
				type: 'empty', id,
				label: hasRemotes
					? localize('remotes.tunnels.signInToRefresh', "Sign in to refresh your tunnels.")
					: remoteSetup.tunnel.label,
				action: {
					label: this.signingInToTunnels
						? localize('remotes.tunnels.signingIn', "Signing in...")
						: localize('remotes.tunnels.signInAccount', "Sign in to {0}", providerLabel),
					enabled: !this.signingInToTunnels,
				},
				// Setup guidance only helps while the group is empty; the group's info action still opens it.
				...(hasRemotes ? {} : {
					description: localize('remotes.tunnels.signInDescription', "Sign in to {0} with the account used to enable the tunnel on the remote computer.", providerLabel),
					documentation: remoteSetup.tunnel.documentation,
				}),
			};
		}
		if (this.failedKinds.includes(kind)) {
			return {
				type: 'empty', id, label: localize('remotes.empty.failed', "Couldn't refresh {0}.", remoteKindLabels[kind]),
				description: this.getRefreshWarning(kind),
				documentation: remoteSetup[kind].documentation,
			};
		}
		return { type: 'empty', id, ...remoteSetup[kind] };
	}

	private render(): void {
		const remotes = this.getFilteredRemotes();
		this.renderEmptyState(remotes);
		const entries: RemoteTableEntry[] = [];
		const remoteEntry = (remote: ICustomizationRemote): RemoteTableEntry => ({
			type: 'remote', remote,
			busy: this.pendingActions.has(remote.id) || this.pendingConnections.has(remote.id), connecting: this.pendingConnections.get(remote.id),
			showConnectionStatus: !this.pendingConnections.has(remote.id)
				&& !RemoteAgentHostConnectionStatus.isConnecting(remote.connectionStatus) && !RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus)
				&& (this.groupBy === 'type' || RemoteAgentHostConnectionStatus.isIncompatible(remote.connectionStatus)),
		});
		if (this.groupBy === 'status') {
			for (const group of statusGroups) {
				const members = remotes.filter(remote => getRemoteStatusGroup(remote) === group.key)
					.sort((a, b) => a.name.localeCompare(b.name));
				if (!members.length) {
					continue;
				}
				for (const kind of this.getDiscoveryNoticeKinds(remotes)) {
					const id = `remote-notice-${kind}`;
					const collapsed = this.collapsedGroups.has(id);
					const members = remotes.filter(remote => remote.kind === kind);
					entries.push({
						type: 'group', id, kind, label: remoteKindLabels[kind], count: members.length, collapsed,
						refreshing: this.refreshingKinds.has(kind), warning: this.getRefreshWarning(kind),
						documentation: remoteSetup[kind].documentation,
					});
					if (!collapsed) {
						entries.push(this.getEmptyEntry(kind, members.length > 0));
					}
				}
				const id = `remote-status-${group.key}`;
				const collapsed = this.collapsedGroups.has(id);
				entries.push({ type: 'group', id, label: group.label, description: group.description, count: members.length, collapsed, refreshing: false });
				if (!collapsed) {
					entries.push(...members.map(remoteEntry));
				}
			}
		}
		for (const kind of this.groupBy === 'type' ? this.kinds.filter(kind => !this.filterKind || kind === this.filterKind) : []) {
			const groupRemotes = remotes.filter(remote => remote.kind === kind);
			if (this.query && groupRemotes.length === 0) {
				continue;
			}
			const collapsed = this.collapsedGroups.has(`remote-group-${kind}`);
			entries.push({
				type: 'group', id: `remote-group-${kind}`, kind, label: remoteKindLabels[kind],
				count: groupRemotes.length, collapsed, refreshing: this.refreshingKinds.has(kind), warning: this.getRefreshWarning(kind),
				documentation: remoteSetup[kind].documentation,
			});
			if (!collapsed) {
				if (kind === 'tunnel' && this.model.tunnelAuthenticationRequired.get()) {
					entries.push(this.getEmptyEntry(kind, groupRemotes.length > 0));
				}
				entries.push(...(groupRemotes.length ? groupRemotes.map(remoteEntry)
					: kind === 'tunnel' && this.model.tunnelAuthenticationRequired.get() ? [] : this.hasRefreshed || this.failedKinds.includes(kind) ? [this.getEmptyEntry(kind)] : []));
			}
		}
		if (this.details.value) {
			const remote = this.model.remotes.get().find(remote => remote.id === this.detailsRemoteId && this.kinds.includes(remote.kind));
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
		this.collapseAllAction.enabled = entries.some(entry => entry.type === 'group' && !entry.collapsed);
		this.table.splice(0, this.table.length, this.rows);
		if (!this.table.getFocus().length) {
			this.table.focusFirst();
		}
		this.layout();
	}

	private getDiscoveryNoticeKinds(remotes: readonly ICustomizationRemote[]): readonly RemoteKind[] {
		if (!remotes.length || this.query) {
			return [];
		}
		return this.kinds.filter(kind => (!this.filterKind || this.filterKind === kind) && (
			this.getRefreshWarning(kind)
			|| kind === 'tunnel' && this.model.tunnelAuthenticationRequired.get() && remotes.some(remote => remote.kind === kind)
		));
	}

	private renderEmptyState(remotes: readonly ICustomizationRemote[]): void {
		const show = !remotes.length && (this.groupBy === 'status' || !!this.query);
		this.message.hidden = !show;
		this.tableContainer.hidden = show;
		const kinds = this.kinds.filter(kind => !this.filterKind || this.filterKind === kind);
		const loading = kinds.some(kind => this.refreshingKinds.has(kind));
		const entries = show && !this.query ? kinds.map(kind => {
			const refreshing = this.refreshingKinds.has(kind);
			const unsearched = !this.hasRefreshed && !this.refreshedKinds.has(kind) && !this.failedKinds.includes(kind) && !(kind === 'tunnel' && this.model.tunnelAuthenticationRequired.get());
			const entry: IRemoteEmptyEntry = refreshing
				? { type: 'empty', id: `remote-empty-${kind}`, label: localize('remotes.empty.searchingType', "Looking for {0}...", remoteKindLabels[kind]) }
				: unsearched
					? { type: 'empty', id: `remote-empty-${kind}`, label: localize('remotes.empty.findType', "Refresh to look for {0}.", remoteKindLabels[kind]) }
					: this.getEmptyEntry(kind);
			return { kind, entry, refreshing, unsearched };
		}) : [];
		const title = !show ? '' : this.query
			? loading ? localize('remotes.empty.searching', "Looking for environments...") : localize('remotes.empty.filtered', "No environments match your search.")
			: this.filterKind ? remoteKindLabels[this.filterKind] : localize('remotes.empty.findEnvironment', "Find an environment");
		const key = JSON.stringify([show, title, this.filterKind, this.query, entries, this.signingInToTunnels, this.refreshAction.enabled]);
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
			this.emptyStateActions.set(id, button);
			this.emptyStateDisposables.add(button.onDidClick(run));
			content.push(label);
		};
		const addShowAllTypes = (container: HTMLElement): void => {
			if (this.filterKind) {
				addButton(container, 'allTypes', localize('remotes.empty.showAllTypes', "Show all types"), () => {
					this.setFilterKind(undefined);
					this.typeFilter.focus(0);
				});
			}
		};
		if (show && this.query) {
			const card = dom.append(this.emptyStateBody, dom.$('.remotes-empty-state-search'));
			const guidance = localize('remotes.empty.searchGuidance', "Try another name, address, or environment type, or clear your search.");
			dom.append(card, dom.$('p.remotes-empty-state-description', undefined, guidance));
			content.push(guidance);
			const actions = dom.append(card, dom.$('.remotes-empty-state-actions'));
			addButton(actions, 'clearSearch', localize('remotes.clearSearch', "Clear search"), () => {
				this.setSearchQuery('');
				this.searchInput.focus();
			});
			addShowAllTypes(actions);
		}
		for (const { kind, entry, refreshing, unsearched } of entries) {
			const card = dom.append(this.emptyStateBody, dom.$('.remotes-empty-state-kind', { 'data-remote-kind': kind, 'aria-busy': String(refreshing || kind === 'tunnel' && this.signingInToTunnels) }));
			if (!this.filterKind) {
				dom.append(card, dom.$('h3', undefined, remoteKindLabels[kind]));
				content.push(remoteKindLabels[kind]);
			}
			dom.append(card, dom.$('p', { role: 'status' }, entry.label));
			content.push(entry.label);
			if (entry.description) {
				dom.append(card, dom.$('p.remotes-empty-state-description', undefined, entry.description));
				content.push(entry.description);
			}
			const actions = dom.$('.remotes-empty-state-actions');
			if (entry.action) {
				addButton(actions, `${kind}.signIn`, entry.action.label, () => void this.signInToTunnels(), entry.action.enabled);
			}
			if (!refreshing) {
				if (kind === 'ssh') {
					addButton(actions, `${kind}.configure`, localize('remotes.ssh.configure', "Open SSH configuration"), () => void this.openConfiguration(kind));
				}
				if (unsearched || this.failedKinds.includes(kind) && !entry.action) {
					addButton(actions, `${kind}.refresh`, localize('remotes.empty.retry', "Refresh"), () => void this.refresh(), this.refreshAction.enabled);
				}
			}
			addShowAllTypes(actions);
			if (actions.childElementCount) {
				card.appendChild(actions);
			}
			if (!refreshing && entry.documentation) {
				const documentation = entry.documentation;
				const id = `${kind}.documentation`;
				const documentationRow = dom.append(card, dom.$('p'));
				const link = dom.append(documentationRow, dom.$('a.monaco-link.remotes-empty-state-documentation', {
					href: documentation.href, target: '_blank', rel: 'noopener noreferrer', 'data-empty-action': id,
					'aria-label': localize('remotes.docs.external', "{0} (opens in browser)", documentation.label),
				}, dom.$('span', undefined, documentation.label)));
				dom.append(link, renderIcon(Codicon.linkExternal)).setAttribute('aria-hidden', 'true');
				this.emptyStateActions.set(id, { element: link, enabled: true });
				this.emptyStateDisposables.add(dom.addDisposableListener(link, dom.EventType.CLICK, event => {
					dom.EventHelper.stop(event, true);
					void this.openDocumentation(documentation.href);
				}));
				content.push(documentation.label, documentation.href);
			}
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

	private async manageRemote(id: string, action: 'rename' | 'updateServer'): Promise<void> {
		if (this.pendingActions.has(id) || this.pendingConnections.has(id)) {
			return;
		}
		const focusedAction = dom.getActiveElement();
		const restoreFocus = dom.isHTMLElement(focusedAction) && this.domNode.contains(focusedAction) && focusedAction.closest<HTMLElement>('[data-remote-id]')?.dataset.remoteId === id;
		this.pendingActions.add(id);
		this.render();
		try {
			if (action === 'updateServer') {
				await this.model.updateServer(id);
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

	private async deleteRemote(id: string, kind: 'environment' | 'tunnel' | 'ssh'): Promise<void> {
		if (this.pendingActions.has(id) || this.pendingConnections.has(id)) {
			return;
		}
		const active = dom.getActiveElement();
		const restoreFocus = dom.isHTMLElement(active) && this.domNode.contains(active) && active.closest<HTMLElement>('[data-remote-id]')?.dataset.remoteId === id;
		this.pendingActions.add(id);
		this.render();
		try {
			if (kind === 'tunnel') {
				await this.model.deleteTunnel(id);
			} else if (kind === 'ssh') {
				await this.model.deleteSSHHost(id);
			} else {
				await this.model.remove(id);
			}
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
					this.table.domFocus();
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
		} catch (error) {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		} finally {
			this.pendingConnections.delete(id);
			if (!this._store.isDisposed) {
				this.render();
			}
		}
	}

	private getRemoteAriaLabel(remote: ICustomizationRemote): string {
		const name = remote.pickerUnavailableReason
			? localize('remotes.unavailablePickerName', "{0} (not shown in environment picker: {1})", remote.name, remote.pickerUnavailableReason)
			: remote.hidden ? localize('remotes.hiddenName', "{0} (hidden from environment picker)", remote.name) : remote.name;
		let label = localize('remotes.accessibleRow', "{0}. Status: {1}", name,
			getConnectionLabel(remote, this.pendingConnections.get(remote.id)));
		label = localize('remotes.accessibleType', "{0}. Type: {1}.", label, getRemoteTypeLabel(remote.kind));
		const metadata = (['system', 'sessions', 'activity'] as const).map(column => getRemoteMetadataLabel(remote, column)).filter(Boolean);
		if (metadata.length) {
			label = localize('remotes.accessibleMetadata', "{0} Last known details: {1}", label, metadata.join(', '));
		}
		const error = remote.lastConnectionError;
		if (!this.pendingConnections.has(remote.id) && error) {
			label = localize('remotes.accessibleConnectionError', "{0}. Connection error: {1}", label, error);
		}
		return !this.pendingConnections.has(remote.id) && RemoteAgentHostConnectionStatus.isDisconnected(remote.connectionStatus) && remote.unavailableReason
			? localize('remotes.accessibleUnavailableRow', "{0}. {1}", label, remote.unavailableReason) : label;
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
		}
	}

	/**
	 * Shows a section heading before the search field and names the widget as a region after it,
	 * or removes both when `label` is undefined. Call {@link layout} afterwards.
	 */
	setHeading(label: string | undefined): void {
		this.heading.hidden = !label;
		this.headingTitle.textContent = label ?? '';
		this.searchRow.classList.toggle('with-heading', !!label);
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
		if (!this.message.hidden) {
			return this.emptyStateContent;
		}
		if (this.groupBy === 'status') {
			return [...statusGroups.flatMap(group => {
				const members = remotes.filter(remote => getRemoteStatusGroup(remote) === group.key);
				return members.length ? [group.label, group.description, ...members.map(remote => this.getRemoteAriaLabel(remote))] : [];
			}), ...this.getDiscoveryNoticeKinds(remotes).flatMap(kind => {
				const entry = this.getEmptyEntry(kind, remotes.some(remote => remote.kind === kind));
				return [remoteKindLabels[kind], entry.label, entry.description ?? '', entry.action?.label ?? ''];
			})].join('\n');
		}
		return this.kinds.flatMap(kind => {
			if (this.filterKind && this.filterKind !== kind) {
				return [];
			}
			const warning = this.getRefreshWarning(kind);
			const entries = remotes.filter(remote => remote.kind === kind);
			if (this.query && entries.length === 0) {
				return [];
			}
			const empty = kind === 'tunnel' && this.model.tunnelAuthenticationRequired.get()
				? this.getEmptyEntry(kind, entries.length > 0) : entries.length || !this.hasRefreshed && !warning ? undefined : this.getEmptyEntry(kind);
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
			const contentOffset = Math.max(0, this.tableContainer.getBoundingClientRect().top - this.domNode.getBoundingClientRect().top);
			const height = Math.max(0, this.domNode.clientHeight - contentOffset);
			const width = Math.max(this.tableMinWidth, this.tableContainer.clientWidth);
			const tableHeight = Math.max(0, height - (width > this.tableContainer.clientWidth ? horizontalScrollbarSize : 0));
			this.tableContainer.style.height = `${height}px`;
			this.tableInner.style.height = `${tableHeight}px`;
			this.tableInner.style.width = `${width}px`;
			this.table.layout(tableHeight, width);
			this.tableScrollable.scanDomNode();
		}
	}

	override dispose(): void {
		this.cancelRefresh();
		this.detailsExpanded.reset();
		super.dispose();
		this.domNode.remove();
	}
}
