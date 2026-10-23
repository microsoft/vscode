/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
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

const remoteSetup: Record<RemoteKind, { readonly label: string; readonly description: string; readonly documentation: { readonly label: string; readonly href: string } }> = {
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
	devContainer: {
		label: localize('remotes.empty.devContainers', "No Dev Containers found."),
		description: localize('remotes.empty.devContainers.description', "Create a Dev Container for a local project."),
		documentation: { label: localize('remotes.docs.devContainers', "Dev Containers Guide"), href: 'https://aka.ms/vscode-remote/containers' },
	},
};

export class RemotesWidget extends Disposable {
	readonly domNode: HTMLElement;
	private readonly table: WorkbenchTable<IRemoteTableRow>;
	private readonly tableContainer: HTMLElement;
	private readonly tableInner: HTMLElement;
	private readonly tableScrollable: DomScrollableElement;
	private readonly tableMinWidth: number;
	private readonly message: HTMLElement;
	private readonly searchInput: InputBox;
	private readonly refreshAction: Action;
	private readonly refreshRequest = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly pendingActions = new Set<string>();
	private readonly pendingConnections = new Map<string, boolean>();
	private readonly collapsedKinds = new Set<RemoteKind>();
	private readonly kinds: readonly RemoteKind[];
	private rows: IRemoteTableRow[] = [];
	private visible = false;
	private query = '';
	private failedKinds: readonly RemoteKind[] = [];
	private refreshing = false;
	private hasRefreshed = false;

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
		@IOpenerService openerService: IOpenerService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
	) {
		super();
		this._register(model);
		this.kinds = getVisibleRemoteKinds(operatingSystem);
		this.domNode = dom.append(container, dom.$('.remotes-widget'));
		const searchRow = dom.append(this.domNode, dom.$('.remotes-search-row'));
		this.searchInput = this._register(new InputBox(dom.append(searchRow, dom.$('.remotes-search-container')), contextViewService, {
			placeholder: localize('remotes.searchPlaceholder', "Type to search..."),
			ariaLabel: localize('remotes.searchLabel', "Search remotes"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._register(this.searchInput.onDidChange(query => this.setSearchQuery(query)));
		this.refreshAction = this._register(new Action('remotes.refresh', localize('remotes.refresh', "Refresh"), ThemeIcon.asClassName(Codicon.refresh), true, () => this.refresh()));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, dom.append(searchRow, dom.$('.remotes-header-actions')), { ariaLabel: localize('remotes.actions', "Remotes actions") }));
		toolbar.setActions([this.refreshAction]);
		dom.append(this.domNode, dom.$('p.remotes-description')).textContent = localize('remotes.description', "Connect to remote environments and manage their settings.");
		this.message = dom.append(this.domNode, dom.$('.remotes-message', { role: 'status' }));
		this.tableContainer = dom.append(this.domNode, dom.$('.remotes-table-container'));
		const viewport = dom.$('.remotes-table-viewport');
		this.tableInner = dom.append(viewport, dom.$('.remotes-table-inner'));
		this.tableScrollable = this._register(new DomScrollableElement(viewport, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			useShadows: false,
			scrollYToX: true,
		}));
		this.tableContainer.appendChild(this.tableScrollable.getDomNode());

		let label = localize('remotes.tableLabel', "Remote environments. Columns: Name, Address, Connection, Actions.");
		const helpKeybinding = keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
		if (configurationService.getValue<boolean>(AccessibilityVerbositySettingId.Remotes) && helpKeybinding) {
			label = localize('remotes.tableLabelWithHelp', "{0} Use {1} for accessibility help.", label, helpKeybinding);
		}
		const columnDefinitions = [
			{ id: 'gutter', label: '', weight: 0, minimumWidth: 28, maximumWidth: 28 },
			{ id: 'name', label: localize('remotes.nameColumn', "Name"), weight: 0.35, minimumWidth: 160 },
			{ id: 'address', label: localize('remotes.addressColumn', "Address"), weight: 0.45, minimumWidth: 160 },
			{ id: 'connection', label: localize('remotes.connectionColumn', "Connection"), weight: 0.2, minimumWidth: 112 },
			{ id: 'actions', label: '', weight: 0, minimumWidth: 104, maximumWidth: 104 },
		] as const;
		const renderers = columnDefinitions.map(column => new RemotesTableRenderer(
			column.id, (entry, action) => this.runRowAction(entry, action),
			instantiationService, hoverService, openerService,
		));
		const columns = columnDefinitions.map((column, index) => ({
			...column, tooltip: column.label, templateId: renderers[index].templateId, project: (row: IRemoteTableRow) => row,
		}));
		this.tableMinWidth = columns.reduce((sum, column) => sum + column.minimumWidth, 0);
		this.table = this._register(instantiationService.createInstance(WorkbenchTable<IRemoteTableRow>,
			'RemotesTable', this.tableInner, {
			headerRowHeight: 30,
			getHeight: row => row.entry.type === 'group' ? 30 : row.entry.type === 'empty' ? 60 : 26,
		}, columns, renderers, {
			identityProvider: { getId: row => row.id },
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: row => row.entry.type === 'remote' ? row.entry.remote.name : row.entry.label },
			accessibilityProvider: {
				getWidgetAriaLabel: () => label,
				getAriaLabel: row => {
					const entry = row.entry;
					return entry.type === 'group'
						? entry.warning
							? localize('remotes.groupWarningLabel', "{0}, {1} remotes. Warning: {2}", entry.label, entry.count, entry.warning)
							: localize('remotes.groupLabel', "{0}, {1} remotes", entry.label, entry.count)
						: entry.type === 'empty'
							? [entry.label, entry.description, entry.documentation?.label].filter(Boolean).join(' ')
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
			this.render();
		}));
	}

	private runRowAction(entry: RemoteTableEntry, action: RemoteRowAction): void {
		if (entry.type === 'group') {
			if (action === 'toggleGroup') {
				this.toggleGroup(entry.kind);
			} else if (action === 'configure') {
				void this.openConfiguration(entry.kind);
			}
		} else if (entry.type === 'remote') {
			if (action === 'connect') {
				void this.setConnected(entry.remote.id, !RemoteAgentHostConnectionStatus.isConnected(entry.remote.connectionStatus));
			} else if (action === 'rename' || action === 'remove') {
				void this.manageRemote(entry.remote.id, action);
			}
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
		this.refreshing = false;
		this.refreshAction.enabled = true;
	}

	private async refresh(): Promise<void> {
		this.cancelRefresh();
		const request = new CancellationTokenSource();
		this.refreshRequest.value = request;
		this.refreshing = true;
		this.refreshAction.enabled = false;
		this.message.textContent = localize('remotes.loading', "Looking for remotes...");
		this.render();
		try {
			const failedKinds = await this.model.refresh(request.token);
			if (!request.token.isCancellationRequested && !this._store.isDisposed) {
				this.failedKinds = failedKinds;
				this.hasRefreshed = true;
				if (failedKinds.some(kind => this.kinds.includes(kind))) {
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
				this.refreshRequest.clear();
				this.refreshing = false;
				this.message.textContent = '';
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
		if (this.query) {
			return { type: 'empty', id, label: localize('remotes.empty.filtered', "No matching remotes.") };
		}
		if (this.refreshing || !this.hasRefreshed) {
			return { type: 'empty', id, label: localize('remotes.empty.loading', "Looking for {0} locations...", remoteKindLabels[kind]) };
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
		const entries: RemoteTableEntry[] = [];
		for (const kind of this.kinds) {
			const groupRemotes = remotes.filter(remote => remote.kind === kind);
			const collapsed = this.collapsedKinds.has(kind);
			entries.push({
				type: 'group', id: `remote-group-${kind}`, kind, label: remoteKindLabels[kind],
				count: groupRemotes.length, collapsed, warning: this.getRefreshWarning(kind),
			});
			if (!collapsed) {
				entries.push(...(groupRemotes.length ? groupRemotes.map((remote): RemoteTableEntry => ({
					type: 'remote', remote,
					busy: this.pendingActions.has(remote.id) || this.pendingConnections.has(remote.id), connecting: this.pendingConnections.get(remote.id),
				})) : [this.getEmptyEntry(kind)]));
			}
		}
		this.rows = entries.map(entry => ({ id: entry.type === 'remote' ? entry.remote.id : entry.id, entry }));
		this.table.splice(0, this.table.length, this.rows);
		if (!this.table.getFocus().length) {
			this.table.focusFirst();
		}
		this.layout();
	}

	private async manageRemote(id: string, action: 'rename' | 'remove'): Promise<void> {
		if (this.pendingActions.has(id) || this.pendingConnections.has(id)) {
			return;
		}
		this.pendingActions.add(id);
		this.render();
		try {
			await this.model[action](id);
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
				if (action === 'rename' && activeRow && activeRow.dataset.remoteId !== id && index >= 0) {
					this.table.setFocus([index]);
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
		return localize('remotes.accessibleRow', "{0}. Address: {1}. Connection: {2}", remote.name,
			remote.unavailableReason ?? remote.detail, getConnectionLabel(remote, this.pendingConnections.get(remote.id)));
	}

	private getRefreshWarning(kind: RemoteKind): string | undefined {
		if (!this.failedKinds.includes(kind)) {
			return undefined;
		}
		switch (kind) {
			case 'ssh': return localize('remotes.sshRefreshWarning', "Could not read your SSH hosts. Check your SSH configuration. See the Window log for more details.");
			case 'wsl': return localize('remotes.wslRefreshWarning', "Could not refresh WSL distributions. Check that WSL is available. See the Window log for more details.");
			case 'tunnel': return localize('remotes.tunnelRefreshWarning', "Could not refresh tunnels. Check your sign-in and network connection. See the Window log for more details.");
			case 'devContainer': return localize('remotes.devContainerRefreshWarning', "Could not refresh Dev Containers. Check that Docker is running. See the Window log for more details.");
		}
	}

	getAccessibilityContent(): string {
		const remotes = this.getFilteredRemotes();
		return this.kinds.flatMap(kind => {
			const warning = this.getRefreshWarning(kind);
			const entries = remotes.filter(remote => remote.kind === kind);
			const empty = entries.length ? undefined : this.getEmptyEntry(kind);
			return [
				remoteKindLabels[kind],
				...(warning ? [warning] : []),
				...entries.map(remote => this.getRemoteAriaLabel(remote)),
				...(empty ? [empty.label, empty.description ?? '', empty.documentation ? `${empty.documentation.label}: ${empty.documentation.href}` : ''] : []),
			];
		}).join('\n');
	}

	focus(): void {
		this.searchInput.focus();
	}

	layout(): void {
		if (this.domNode.clientWidth > 0 && this.domNode.clientHeight > 0) {
			const contentOffset = Math.max(0, this.tableContainer.getBoundingClientRect().top - this.domNode.getBoundingClientRect().top);
			const height = Math.max(0, this.domNode.clientHeight - contentOffset);
			const width = Math.max(this.tableMinWidth, this.tableContainer.clientWidth);
			this.tableContainer.style.height = `${height}px`;
			this.tableInner.style.width = `${width}px`;
			this.table.layout(height, width);
			this.tableScrollable.scanDomNode();
		}
	}

	override dispose(): void {
		this.cancelRefresh();
		super.dispose();
		this.domNode.remove();
	}
}
