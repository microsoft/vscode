/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { IRadioOptionItem, Radio } from '../../../../../../base/browser/ui/radio/radio.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Action } from '../../../../../../base/common/actions.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
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
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchTable } from '../../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { IEditorService, MODAL_GROUP } from '../../../../../services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../services/preferences/common/preferences.js';
import { getVisibleRemoteKinds, ICustomizationRemote, IRemotesModel, RemoteKind, remoteKindLabels } from './remotesModel.js';
import { getConnectionLabel, getConnectionWarning, getGitHubEnvironmentLabel, getRemoteStatusGroup, getRemoteStatusGroupDescription, getRemoteStatusGroupLabel, getRemoteTypeLabel, IRemoteEmptyEntry, IRemoteTableRow, RemotesTableRenderer, RemoteRowAction, RemoteStatusGroup, remoteStatusGroups, RemoteTableEntry } from './remotesTable.js';
import './media/remotesWidget.css';

const remoteSetup: Record<RemoteKind, { readonly label: string; readonly description: string; readonly documentation?: { readonly label: string; readonly href: string } }> = {
	ssh: {
		label: localize('remotes.empty.ssh', "No SSH hosts configured."),
		description: localize('remotes.empty.ssh.description', "Use the SSH settings action to add a host."),
		documentation: { label: localize('remotes.docs.ssh', "SSH Setup Guide"), href: 'https://aka.ms/vscode-agent-ssh' },
	},
	wsl: {
		label: localize('remotes.empty.wsl', "No WSL 2 distributions found."),
		description: localize('remotes.empty.wsl.description', "Install WSL and a Linux distribution to get started."),
		documentation: { label: localize('remotes.docs.wsl', "Install WSL"), href: WSL_INSTALL_DOCS_URL },
	},
	tunnel: {
		label: localize('remotes.empty.tunnels', "No dev tunnels found for this account."),
		description: localize('remotes.empty.tunnels.description', "Enable a dev tunnel on another computer, then sign in with the same account."),
		documentation: { label: localize('remotes.docs.tunnels', "Dev Tunnels Guide"), href: 'https://aka.ms/vscode-agent-tunnel' },
	},
	environment: {
		label: localize('remotes.empty.environments', "No GitHub environments available."),
		description: localize('remotes.empty.environments.description', "Sign in to GitHub and enable environment sharing on another machine."),
		documentation: { label: localize('remotes.docs.environments', "GitHub Environments Setup Guide"), href: GITHUB_ENVIRONMENTS_DOCS_URL },
	},
};

const horizontalScrollbarSize = 10;

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
	private readonly searchInput: InputBox;
	private readonly clearSearchAction: Action;
	private readonly collapseAllAction: Action;
	private readonly refreshAction: Action;
	private readonly typeFilter: Radio;
	private readonly typeDocumentationAction: Action;
	private readonly typeSettingsAction: Action;
	private readonly typeActions: WorkbenchToolBar;
	private readonly refreshRequest = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly refreshingKinds = new Set<RemoteKind>();
	private readonly pendingActions = new Set<string>();
	private readonly pendingConnections = new Map<string, boolean>();
	private readonly collapsedGroups = new Set<RemoteStatusGroup>();
	private kinds: readonly RemoteKind[];
	/** The type the table is filtered to; `undefined` shows all types. */
	private filterKind: RemoteKind | undefined;
	private typeFilterKinds: readonly (RemoteKind | undefined)[] = [];
	private typeFilterItems = '';
	private typeActionsLayout: string | undefined;
	private rows: IRemoteTableRow[] = [];
	private visible = false;
	private query = '';
	private failedKinds: readonly RemoteKind[] = [];
	private hasRefreshed = false;
	private signingInToTunnels = false;

	constructor(
		container: HTMLElement,
		private readonly model: IRemotesModel,
		operatingSystem: OperatingSystem,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ISSHRemoteAgentHostService private readonly sshService: ISSHRemoteAgentHostService,
		@IEditorService private readonly editorService: IEditorService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
	) {
		super();
		this._register(model);
		this.kinds = getVisibleRemoteKinds(operatingSystem);
		this.domNode = dom.append(container, dom.$('.remotes-widget'));
		const searchRow = this.searchRow = dom.append(this.domNode, dom.$('.remotes-search-row'));
		this.heading = dom.append(searchRow, dom.$('.remotes-heading'));
		this.heading.hidden = true;
		dom.append(this.heading, renderIcon(Codicon.remoteExplorer)).setAttribute('aria-hidden', 'true');
		this.headingTitle = dom.append(this.heading, dom.$('h2.remotes-heading-title', { id: generateUuid() }));
		const searchControls = dom.append(searchRow, dom.$('.remotes-search-controls'));
		const actionHoverDelegate = this._register(createInstantHoverDelegate());
		this.clearSearchAction = this._register(new Action('remotes.clearSearch', localize('remotes.clearSearch', "Clear Search"), ThemeIcon.asClassName(Codicon.clearAll), false, () => {
			this.setSearchQuery('');
			this.searchInput.focus();
		}));
		this.collapseAllAction = this._register(new Action('remotes.collapseAll', localize('remotes.collapseAll', "Collapse All"), ThemeIcon.asClassName(Codicon.collapseAll), true, () => {
			for (const group of remoteStatusGroups) {
				this.collapsedGroups.add(group);
			}
			this.render();
		}));
		this.searchInput = this._register(new InputBox(dom.append(searchControls, dom.$('.remotes-search-container')), contextViewService, {
			placeholder: localize('remotes.searchPlaceholder', "Type to search..."),
			ariaLabel: localize('remotes.searchLabel', "Search remotes"),
			inputBoxStyles: defaultInputBoxStyles,
			actions: [this.clearSearchAction, this.collapseAllAction],
			actionViewItemProvider: (action, options) => new ActionViewItem(undefined, action, { ...options, hoverDelegate: actionHoverDelegate }),
		}));
		this._register(this.searchInput.onDidChange(query => this.setSearchQuery(query)));
		this.refreshAction = this._register(new Action('remotes.refresh', localize('remotes.refresh', "Refresh"), ThemeIcon.asClassName(Codicon.refresh), true, () => this.refresh()));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, dom.append(searchControls, dom.$('.remotes-header-actions')), { ariaLabel: localize('remotes.actions', "Remotes actions") }));
		toolbar.setActions([this.refreshAction]);
		const filterRow = dom.append(this.domNode, dom.$('.remotes-filter-row'));
		this.typeFilter = this._register(new Radio({
			items: [], className: 'pills', hoverDelegate: actionHoverDelegate,
			ariaLabel: localize('remotes.typeFilter', "Filter by type"),
		}));
		this.typeFilter.domNode.classList.add('remotes-type-filter');
		filterRow.appendChild(this.typeFilter.domNode);
		this._register(this.typeFilter.onDidSelect(index => this.setTypeFilter(this.typeFilterKinds[index])));
		this.typeDocumentationAction = this._register(new Action('remotes.typeDocumentation', '', ThemeIcon.asClassName(Codicon.info), true, () => {
			const documentation = this.filterKind && remoteSetup[this.filterKind].documentation;
			return documentation ? this.openDocumentation(documentation.href) : Promise.resolve();
		}));
		this.typeSettingsAction = this._register(new Action('remotes.typeSettings', '', ThemeIcon.asClassName(Codicon.settingsGear), true, () => {
			return this.filterKind ? this.openConfiguration(this.filterKind) : Promise.resolve();
		}));
		this.typeActions = this._register(instantiationService.createInstance(WorkbenchToolBar, dom.append(filterRow, dom.$('.remotes-type-actions')), {
			ariaLabel: localize('remotes.typeActions', "Type actions"), hoverDelegate: actionHoverDelegate,
		}));
		this.message = dom.append(this.domNode, dom.$('.remotes-message', { role: 'status' }));
		this.tableContainer = dom.append(this.domNode, dom.$('.remotes-table-container'));
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

		let label = localize('remotes.tableLabel', "Remote environments. Columns: Name, Type, Actions.");
		const helpKeybinding = keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
		if (configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Remotes) && helpKeybinding) {
			label = localize('remotes.tableLabelWithHelp', "{0} Use {1} for accessibility help.", label, helpKeybinding);
		}
		const columnDefinitions = [
			{ id: 'gutter', label: '', weight: 0, minimumWidth: 64, maximumWidth: 64 },
			{ id: 'name', label: localize('remotes.nameColumn', "Name"), weight: 0.75, minimumWidth: 220 },
			{ id: 'type', label: localize('remotes.typeColumn', "Type"), weight: 0.25, minimumWidth: 168 },
			{ id: 'actions', label: '', weight: 0, minimumWidth: 144, maximumWidth: 144 },
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
			getHeight: row => row.entry.type === 'group' ? 30 : row.entry.type === 'empty' ? row.entry.documentation ? 76 : 54 : 26,
		}, columns, renderers, {
			identityProvider: { getId: row => row.id },
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: row => row.entry.type === 'remote' ? row.entry.remote.name : row.entry.label },
			accessibilityProvider: {
				getWidgetAriaLabel: () => label,
				getAriaLabel: row => {
					const entry = row.entry;
					return entry.type === 'group'
						? localize('remotes.groupLabel', "{0}, {1} remotes. {2}", entry.label, entry.count, getRemoteStatusGroupDescription(entry.group))
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
				this.toggleGroup(event.element.entry.group);
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
					this.toggleGroup(entry.group);
				}
			}
		}));
		this._register(dom.addDisposableListener(this.searchInput.inputElement, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.keyCode === KeyCode.DownArrow) {
				keyboardEvent.preventDefault();
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
			this.kinds = getVisibleRemoteKinds(operatingSystem, this.model.environmentsEnabled.read(reader));
			this.render();
		}));
	}

	private runRowAction(entry: RemoteTableEntry, action: RemoteRowAction): void {
		if (entry.type === 'empty' && action === 'signIn') {
			void this.signInToTunnels();
		} else if (entry.type === 'group') {
			if (action === 'toggleGroup') {
				this.toggleGroup(entry.group);
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
				void this.manageRemote(entry.remote.id, 'locationPreference');
			} else if (action === 'githubEnvironment' && entry.remote.gitHubEnvironment?.state !== 'unavailable' && (entry.remote.canShareAsGitHubEnvironment || entry.remote.gitHubEnvironment)) {
				void this.manageRemote(entry.remote.id, 'githubEnvironment');
			} else if (action === 'updateServer') {
				void this.manageRemote(entry.remote.id, 'updateServer');
			} else if (action === 'delete' && (entry.remote.kind === 'environment' && entry.remote.canRemove || (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh') && entry.remote.canDelete)) {
				void this.deleteRemote(entry.remote.id, entry.remote.kind);
			}
		}
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

	private toggleGroup(group: RemoteStatusGroup): void {
		if (!this.collapsedGroups.delete(group)) {
			this.collapsedGroups.add(group);
		}
		this.render();
		const index = this.rows.findIndex(row => row.entry.type === 'group' && row.entry.group === group);
		this.table.setFocus([index]);
	}

	/** Shows only remotes of `kind` in the table, or all types when `kind` is `undefined`. */
	private setTypeFilter(kind: RemoteKind | undefined): void {
		if (this.filterKind === kind || kind && !this.kinds.includes(kind)) {
			return;
		}
		this.filterKind = kind;
		this.render();
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
						this.failedKinds = [...this.failedKinds.filter(kind => kind !== progress.kind), ...(progress.failed ? [progress.kind] : [])];
					}
					this.render();
				},
			});
			if (!request.token.isCancellationRequested && !this._store.isDisposed) {
				this.failedKinds = failedKinds;
				this.hasRefreshed = true;
				if (failedKinds.some(kind => this.kinds.includes(kind) && this.getRefreshWarning(kind))) {
					status(localize('remotes.refreshWarnings', "Some remote locations could not be refreshed. Check the warnings on the type filters for details."));
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
			&& `${remote.name} ${remote.detail} ${remoteKindLabels[remote.kind]} ${getRemoteTypeLabel(remote.kind)}`.toLowerCase().includes(this.query));
	}

	private getEmptyEntry(kind: RemoteKind, hasRemotes = false): IRemoteEmptyEntry {
		const id = `remote-empty-${kind}`;
		if (kind === 'tunnel' && this.model.tunnelAuthenticationRequired.get()) {
			return {
				type: 'empty', id,
				label: hasRemotes
					? localize('remotes.tunnels.signInToRefresh', "Sign in to refresh your tunnels.")
					: localize('remotes.tunnels.signInRequired', "Sign in to allow access to your tunnels."),
				action: { label: localize('remotes.tunnels.signIn', "Sign In"), enabled: !this.signingInToTunnels },
				// Setup guidance only helps while there are no tunnels; the Dev Tunnels filter's info action still opens it.
				...(hasRemotes ? {} : { documentation: remoteSetup.tunnel.documentation }),
			};
		}
		if (this.failedKinds.includes(kind)) {
			return {
				type: 'empty', id, label: localize('remotes.empty.failed', "Could not refresh {0}.", remoteKindLabels[kind]),
				description: localize('remotes.empty.retry', "Check the warning on its type filter, then try Refresh."),
				documentation: remoteSetup[kind].documentation,
			};
		}
		return { type: 'empty', id, ...remoteSetup[kind] };
	}

	/**
	 * Lists the remotes of the filtered type by status, after a tunnel sign-in notice. Types without
	 * remotes show setup guidance or their refresh failure when filtered to, or when there are no remotes at all.
	 */
	private getEntries(remotes: readonly ICustomizationRemote[], respectCollapse: boolean): RemoteTableEntry[] {
		const kinds = this.filterKind ? [this.filterKind] : this.kinds;
		const entries: RemoteTableEntry[] = [];
		const tunnelSignIn = kinds.includes('tunnel') && !!this.model.tunnelAuthenticationRequired.get();
		const hasTunnels = remotes.some(remote => remote.kind === 'tunnel');
		if (tunnelSignIn && (!this.query || hasTunnels)) {
			entries.push(this.getEmptyEntry('tunnel', hasTunnels));
		}
		for (const group of remoteStatusGroups) {
			const groupRemotes = remotes.filter(remote => getRemoteStatusGroup(remote) === group).sort((a, b) => a.name.localeCompare(b.name));
			if (!groupRemotes.length) {
				continue;
			}
			const collapsed = respectCollapse && this.collapsedGroups.has(group);
			entries.push({ type: 'group', id: `remote-group-${group}`, group, label: getRemoteStatusGroupLabel(group), count: groupRemotes.length, collapsed });
			if (!collapsed) {
				entries.push(...groupRemotes.map((remote): RemoteTableEntry => ({
					type: 'remote', remote,
					busy: this.pendingActions.has(remote.id) || this.pendingConnections.has(remote.id), connecting: this.pendingConnections.get(remote.id),
				})));
			}
		}
		if (!this.query && (this.filterKind || !remotes.length)) {
			for (const kind of kinds) {
				if (!(kind === 'tunnel' && tunnelSignIn) && !remotes.some(remote => remote.kind === kind) && (this.hasRefreshed || this.failedKinds.includes(kind))) {
					entries.push(this.getEmptyEntry(kind));
				}
			}
		}
		return entries;
	}

	private getScopedRemotes(matching: readonly ICustomizationRemote[]): readonly ICustomizationRemote[] {
		const kind = this.filterKind;
		return kind ? matching.filter(remote => remote.kind === kind) : matching;
	}

	private render(): void {
		if (this.filterKind && !this.kinds.includes(this.filterKind)) {
			this.filterKind = undefined;
		}
		const matching = this.getFilteredRemotes();
		const remotes = this.getScopedRemotes(matching);
		this.message.textContent = this.query && remotes.length === 0 ? localize('remotes.empty.filtered', "No matching remotes.") : '';
		this.updateTypeFilter(matching);
		this.updateTypeActions();
		const entries = this.getEntries(remotes, true);
		this.rows = entries.map(entry => ({ id: entry.type === 'remote' ? entry.remote.id : entry.id, entry }));
		this.collapseAllAction.enabled = entries.some(entry => entry.type === 'group' && !entry.collapsed);
		this.table.splice(0, this.table.length, this.rows);
		if (!this.table.getFocus().length) {
			this.table.focusFirst();
		}
		this.layout();
	}

	/** Updates the type pills with the number of matching remotes and each type's refresh state. */
	private updateTypeFilter(remotes: readonly ICustomizationRemote[]): void {
		const kinds = [undefined, ...this.kinds];
		const items = kinds.map((kind): IRadioOptionItem => {
			const count = kind ? remotes.filter(remote => remote.kind === kind).length : remotes.length;
			const label = kind ? remoteKindLabels[kind] : localize('remotes.typeFilter.all', "All");
			const warning = kind && this.getRefreshWarning(kind);
			if (kind && this.refreshingKinds.has(kind)) {
				return {
					text: localize('remotes.typeFilter.refreshingPill', "{0} {1} {2}", label, count, '$(loading~spin)'),
					ariaLabel: localize('remotes.typeFilter.refreshingLabel', "{0}, {1} remotes, refreshing", label, count),
				};
			}
			if (warning) {
				return {
					text: localize('remotes.typeFilter.warningPill', "{0} {1} {2}", label, count, '$(warning)'),
					ariaLabel: localize('remotes.typeFilter.warningLabel', "{0}, {1} remotes. Warning: {2}", label, count, warning),
					tooltip: warning,
				};
			}
			return {
				text: localize('remotes.typeFilter.pill', "{0} {1}", label, count),
				ariaLabel: localize('remotes.typeFilter.label', "{0}, {1} remotes", label, count),
			};
		});
		const serialized = JSON.stringify(items);
		if (serialized === this.typeFilterItems) {
			this.typeFilter.setActiveItem(this.typeFilterKinds.indexOf(this.filterKind));
			return;
		}
		const active = dom.getActiveElement();
		const focused = this.typeFilter.optionElements.findIndex(element => element === active);
		this.typeFilterItems = serialized;
		this.typeFilterKinds = kinds;
		this.typeFilter.setItems(items);
		this.typeFilter.setActiveItem(kinds.indexOf(this.filterKind));
		if (focused !== -1 && focused < items.length) {
			this.typeFilter.focusItem(focused);
		}
	}

	/** Offers the filtered type's setup guide and settings next to the type pills. */
	private updateTypeActions(): void {
		const kind = this.filterKind;
		const documentation = kind && remoteSetup[kind].documentation;
		const settings = kind === 'ssh' ? localize('remotes.openSSHConfig', "Open SSH Configuration")
			: kind === 'tunnel' ? localize('remotes.openTunnelSettings', "Open Dev Tunnels Settings")
				: kind === 'environment' ? localize('remotes.openEnvironmentSettings', "Open GitHub Environments Settings")
					: undefined;
		const layout = `${documentation?.label}:${settings}`;
		if (layout === this.typeActionsLayout) {
			return;
		}
		this.typeActionsLayout = layout;
		this.typeDocumentationAction.label = documentation?.label ?? '';
		this.typeSettingsAction.label = settings ?? '';
		this.typeActions.setActions([
			...(documentation ? [this.typeDocumentationAction] : []),
			...(settings ? [this.typeSettingsAction] : []),
		]);
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

	private async manageRemote(id: string, action: 'rename' | 'locationPreference' | 'githubEnvironment' | 'updateServer'): Promise<void> {
		if (this.pendingActions.has(id) || this.pendingConnections.has(id)) {
			return;
		}
		const focusedAction = dom.getActiveElement();
		const restoreFocus = dom.isHTMLElement(focusedAction) && this.domNode.contains(focusedAction) && focusedAction.closest<HTMLElement>('[data-remote-id]')?.dataset.remoteId === id;
		this.pendingActions.add(id);
		this.render();
		try {
			if (action === 'locationPreference') {
				await this.model.changePreferredAgentLocation(id);
			} else if (action === 'githubEnvironment') {
				const remote = this.model.remotes.get().find(remote => remote.id === id);
				await this.model.setSharedAsGitHubEnvironment(id, !remote?.gitHubEnvironment);
			} else if (action === 'updateServer') {
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
			? localize('remotes.unavailablePickerName', "{0} (not shown in Environment picker: {1})", remote.name, remote.pickerUnavailableReason)
			: remote.hidden ? localize('remotes.hiddenName', "{0} (hidden from Environment picker)", remote.name) : remote.name;
		let label = localize('remotes.accessibleRow', "{0}. Type: {1}. Status: {2}", name, getRemoteTypeLabel(remote.kind),
			getConnectionLabel(remote, this.pendingConnections.get(remote.id)));
		const pending = this.pendingConnections.get(remote.id);
		const error = pending === undefined ? remote.lastConnectionError : undefined;
		const warning = getConnectionWarning(remote, pending);
		if (error) {
			label = localize('remotes.accessibleConnectionError', "{0}. Connection error: {1}", label, error);
		} else if (warning) {
			label = localize('remotes.accessibleConnectionWarning', "{0}. {1}", label, warning);
		}
		const gitHubEnvironment = getGitHubEnvironmentLabel(remote);
		if (gitHubEnvironment) {
			label = localize('remotes.accessibleGitHubEnvironment', "{0}. {1}", label, gitHubEnvironment);
		}
		return remote.unavailableReason ? localize('remotes.accessibleUnavailableRow', "{0}. {1}", label, remote.unavailableReason) : label;
	}

	private getRefreshWarning(kind: RemoteKind): string | undefined {
		if (kind === 'tunnel' && this.model.tunnelAuthenticationRequired.get()) {
			return undefined;
		}
		if (!this.failedKinds.includes(kind)) {
			return undefined;
		}
		switch (kind) {
			case 'ssh': return localize('remotes.sshRefreshWarning', "Could not read your SSH hosts. Check your SSH configuration. See the Window log for more details.");
			case 'wsl': return localize('remotes.wslRefreshWarning', "Could not refresh WSL distributions. Check that WSL is available. See the Window log for more details.");
			case 'tunnel': return localize('remotes.tunnelRefreshWarning', "Could not refresh tunnels. Check your sign-in and network connection. See the Window log for more details.");
			case 'environment': return localize('remotes.environmentRefreshWarning', "Could not refresh environments. Check your GitHub sign-in and network connection. See the Window log for more details.");
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
		const content = this.getRemotesAccessibilityContent();
		return this.heading.hidden ? content : `${this.headingTitle.textContent}\n${content}`;
	}

	private getRemotesAccessibilityContent(): string {
		const kinds = this.filterKind ? [this.filterKind] : this.kinds;
		const remotes = this.getScopedRemotes(this.getFilteredRemotes());
		const lines: string[] = [];
		if (this.filterKind) {
			lines.push(localize('remotes.accessibleTypeFilter', "Showing {0} only.", remoteKindLabels[this.filterKind]));
		}
		for (const kind of kinds) {
			const warning = this.getRefreshWarning(kind);
			if (this.refreshingKinds.has(kind)) {
				lines.push(localize('remotes.refreshingType', "Refreshing {0}.", remoteKindLabels[kind]));
			} else if (warning) {
				lines.push(warning);
			}
		}
		if (this.query && remotes.length === 0) {
			lines.push(localize('remotes.empty.filtered', "No matching remotes."));
		}
		for (const entry of this.getEntries(remotes, false)) {
			if (entry.type === 'group') {
				lines.push(localize('remotes.accessibleGroup', "{0} ({1}): {2}", entry.label, entry.count, getRemoteStatusGroupDescription(entry.group)));
			} else if (entry.type === 'remote') {
				lines.push(this.getRemoteAriaLabel(entry.remote));
			} else {
				lines.push(...[entry.label, entry.description, entry.action?.label].filter((line): line is string => !!line));
			}
		}
		for (const kind of kinds) {
			const documentation = remoteSetup[kind].documentation;
			if (documentation) {
				lines.push(`${documentation.label}: ${documentation.href}`);
			}
		}
		return lines.join('\n');
	}

	focus(): void {
		this.searchInput.focus();
	}

	layout(): void {
		this.searchInput.paddingRight = this.searchInput.actionsWidth + 4;
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
		super.dispose();
		this.domNode.remove();
	}
}
