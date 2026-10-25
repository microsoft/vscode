/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { createInstantHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Action } from '../../../../../base/common/actions.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { GitHubEnvironmentsEnabledSettingId } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { ISSHRemoteAgentHostService } from '../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { WSL_INSTALL_DOCS_URL } from '../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchTable } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IEditorService, MODAL_GROUP } from '../../../../../workbench/services/editor/common/editorService.js';
import { IPreferencesService } from '../../../../../workbench/services/preferences/common/preferences.js';
import { getVisibleRemoteKinds, ICustomizationRemote, IRemotesModel, RemoteKind, remoteKindLabels } from './remotesModel.js';
import { getConnectionLabel, IRemoteEmptyEntry, IRemoteTableRow, RemotesTableRenderer, RemoteRowAction, RemoteTableEntry } from './remotesTable.js';
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
		label: localize('remotes.empty.tunnels', "No tunnels found for this account."),
		description: localize('remotes.empty.tunnels.description', "Enable a tunnel on another computer, then sign in with the same account."),
		documentation: { label: localize('remotes.docs.tunnels', "Remote Tunnels Guide"), href: 'https://aka.ms/vscode-agent-tunnel' },
	},
	environment: {
		label: localize('remotes.empty.environments', "No environments available."),
		description: localize('remotes.empty.environments.description', "Sign in to GitHub and enable environment sharing on another machine."),
		documentation: { label: localize('remotes.docs.environments', "Environments Setup Guide"), href: 'https://aka.ms/vscode-agent-environments' },
	},
	devContainer: {
		label: localize('remotes.empty.devContainers', "No Dev Containers found."),
		description: localize('remotes.empty.devContainers.description', "Create a Dev Container for a local project."),
		documentation: { label: localize('remotes.docs.devContainers', "Dev Containers Guide"), href: 'https://aka.ms/vscode-remote/containers' },
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
	private readonly searchInput: InputBox;
	private readonly clearSearchAction: Action;
	private readonly collapseAllAction: Action;
	private readonly refreshAction: Action;
	private readonly refreshRequest = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly refreshingKinds = new Set<RemoteKind>();
	private readonly pendingActions = new Set<string>();
	private readonly pendingConnections = new Map<string, boolean>();
	private readonly collapsedKinds = new Set<RemoteKind>();
	private kinds: readonly RemoteKind[];
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
		const searchRow = dom.append(this.domNode, dom.$('.remotes-search-row'));
		const actionHoverDelegate = this._register(createInstantHoverDelegate());
		this.clearSearchAction = this._register(new Action('remotes.clearSearch', localize('remotes.clearSearch', "Clear Search"), ThemeIcon.asClassName(Codicon.clearAll), false, () => {
			this.setSearchQuery('');
			this.searchInput.focus();
		}));
		this.collapseAllAction = this._register(new Action('remotes.collapseAll', localize('remotes.collapseAll', "Collapse All"), ThemeIcon.asClassName(Codicon.collapseAll), true, () => {
			for (const kind of this.kinds) {
				this.collapsedKinds.add(kind);
			}
			this.render();
		}));
		this.searchInput = this._register(new InputBox(dom.append(searchRow, dom.$('.remotes-search-container')), contextViewService, {
			placeholder: localize('remotes.searchPlaceholder', "Type to search..."),
			ariaLabel: localize('remotes.searchLabel', "Search remotes"),
			inputBoxStyles: defaultInputBoxStyles,
			actions: [this.clearSearchAction, this.collapseAllAction],
			actionViewItemProvider: (action, options) => new ActionViewItem(undefined, action, { ...options, hoverDelegate: actionHoverDelegate }),
		}));
		this._register(this.searchInput.onDidChange(query => this.setSearchQuery(query)));
		this.refreshAction = this._register(new Action('remotes.refresh', localize('remotes.refresh', "Refresh"), ThemeIcon.asClassName(Codicon.refresh), true, () => this.refresh()));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, dom.append(searchRow, dom.$('.remotes-header-actions')), { ariaLabel: localize('remotes.actions', "Remotes actions") }));
		toolbar.setActions([this.refreshAction]);
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

		let label = localize('remotes.tableLabel', "Remote environments. Columns: Name, Connection, Actions.");
		const helpKeybinding = keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
		if (configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Remotes) && helpKeybinding) {
			label = localize('remotes.tableLabelWithHelp', "{0} Use {1} for accessibility help.", label, helpKeybinding);
		}
		const columnDefinitions = [
			{ id: 'gutter', label: '', weight: 0, minimumWidth: 64, maximumWidth: 64 },
			{ id: 'name', label: localize('remotes.nameColumn', "Name"), weight: 0.8, minimumWidth: 220 },
			{ id: 'connection', label: localize('remotes.connectionColumn', "Connection"), weight: 0.2, minimumWidth: 144 },
			{ id: 'actions', label: '', weight: 0, minimumWidth: 72, maximumWidth: 72 },
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
			getHeight: row => row.entry.type === 'group' ? 30 : row.entry.type === 'empty' ? 76 : 26,
		}, columns, renderers, {
			identityProvider: { getId: row => row.id },
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: row => row.entry.type === 'remote' ? row.entry.remote.name : row.entry.label },
			accessibilityProvider: {
				getWidgetAriaLabel: () => label,
				getAriaLabel: row => {
					const entry = row.entry;
					if (entry.type === 'group' && entry.refreshing) {
						return localize('remotes.groupRefreshingLabel', "{0}, {1} remotes. Refreshing.", entry.label, entry.count);
					}
					return entry.type === 'group'
						? entry.warning
							? localize('remotes.groupWarningLabel', "{0}, {1} remotes. Warning: {2}", entry.label, entry.count, entry.warning)
							: localize('remotes.groupLabel', "{0}, {1} remotes", entry.label, entry.count)
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
				this.toggleGroup(event.element.entry.kind);
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
					this.toggleGroup(entry.kind);
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
				this.toggleGroup(entry.kind);
			} else if (action === 'configure') {
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
				void this.renameRemote(entry.remote.id);
			} else if (action === 'delete' && entry.remote.kind === 'environment' && entry.remote.canRemove) {
				void this.deleteEnvironment(entry.remote.id);
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

	private toggleGroup(kind: RemoteKind): void {
		if (!this.collapsedKinds.delete(kind)) {
			this.collapsedKinds.add(kind);
		}
		this.render();
		const index = this.rows.findIndex(row => row.entry.type === 'group' && row.entry.kind === kind);
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
				this.collapsedKinds.clear();
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
			&& `${remote.name} ${remote.detail} ${remoteKindLabels[remote.kind]}`.toLowerCase().includes(this.query));
	}

	private getEmptyEntry(kind: RemoteKind): IRemoteEmptyEntry {
		const id = `remote-empty-${kind}`;
		if (kind === 'tunnel' && this.model.tunnelAuthenticationRequired.get()) {
			return {
				type: 'empty', id,
				label: localize('remotes.tunnels.signInRequired', "Sign in to allow access to your tunnels."),
				action: { label: localize('remotes.tunnels.signIn', "Sign In"), enabled: !this.signingInToTunnels },
				documentation: remoteSetup.tunnel.documentation,
			};
		}
		if (this.failedKinds.includes(kind)) {
			return {
				type: 'empty', id, label: localize('remotes.empty.failed', "Could not refresh {0}.", remoteKindLabels[kind]),
				description: localize('remotes.empty.retry', "Check the group warning, then try Refresh."),
				documentation: remoteSetup[kind].documentation,
			};
		}
		return { type: 'empty', id, ...remoteSetup[kind] };
	}

	private render(): void {
		const remotes = this.getFilteredRemotes();
		this.message.textContent = this.query && remotes.length === 0 ? localize('remotes.empty.filtered', "No matching remotes.") : '';
		const entries: RemoteTableEntry[] = [];
		for (const kind of this.kinds) {
			const groupRemotes = remotes.filter(remote => remote.kind === kind);
			if (this.query && groupRemotes.length === 0) {
				continue;
			}
			const collapsed = this.collapsedKinds.has(kind);
			entries.push({
				type: 'group', id: `remote-group-${kind}`, kind, label: remoteKindLabels[kind],
				count: groupRemotes.length, collapsed, refreshing: this.refreshingKinds.has(kind), warning: this.getRefreshWarning(kind),
				documentation: remoteSetup[kind].documentation,
			});
			if (!collapsed) {
				if (kind === 'tunnel' && this.model.tunnelAuthenticationRequired.get()) {
					entries.push(this.getEmptyEntry(kind));
				}
				entries.push(...(groupRemotes.length ? groupRemotes.map((remote): RemoteTableEntry => ({
					type: 'remote', remote,
					busy: this.pendingActions.has(remote.id) || this.pendingConnections.has(remote.id), connecting: this.pendingConnections.get(remote.id),
				})) : kind === 'tunnel' && this.model.tunnelAuthenticationRequired.get() ? [] : this.hasRefreshed || this.failedKinds.includes(kind) ? [this.getEmptyEntry(kind)] : []));
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

	private async renameRemote(id: string): Promise<void> {
		if (this.pendingActions.has(id) || this.pendingConnections.has(id)) {
			return;
		}
		this.pendingActions.add(id);
		this.render();
		try {
			await this.model.rename(id);
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
				if (activeRow && activeRow.dataset.remoteId !== id && index >= 0) {
					this.table.setFocus([index]);
					this.table.domFocus();
				}
			}
		}
	}

	private async deleteEnvironment(id: string): Promise<void> {
		if (this.pendingActions.has(id) || this.pendingConnections.has(id)) {
			return;
		}
		const active = dom.getActiveElement();
		const restoreFocus = dom.isHTMLElement(active) && this.domNode.contains(active) && active.closest<HTMLElement>('[data-remote-id]')?.dataset.remoteId === id;
		this.pendingActions.add(id);
		this.render();
		try {
			await this.model.remove(id);
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
		let label = localize('remotes.accessibleRow', "{0}. Connection: {1}", name,
			getConnectionLabel(remote, this.pendingConnections.get(remote.id)));
		const error = remote.lastConnectionError;
		if (!this.pendingConnections.has(remote.id) && error) {
			label = localize('remotes.accessibleConnectionError', "{0}. Connection error: {1}", label, error);
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
			case 'devContainer': return localize('remotes.devContainerRefreshWarning', "Could not refresh Dev Containers. Check that Docker is running. See the Window log for more details.");
		}
	}

	getAccessibilityContent(): string {
		const remotes = this.getFilteredRemotes();
		if (this.query && remotes.length === 0) {
			return localize('remotes.empty.filtered', "No matching remotes.");
		}
		return this.kinds.flatMap(kind => {
			const warning = this.getRefreshWarning(kind);
			const entries = remotes.filter(remote => remote.kind === kind);
			if (this.query && entries.length === 0) {
				return [];
			}
			const empty = kind === 'tunnel' && this.model.tunnelAuthenticationRequired.get()
				? this.getEmptyEntry(kind) : entries.length || !this.hasRefreshed && !warning ? undefined : this.getEmptyEntry(kind);
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
