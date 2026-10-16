/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/tunnelHost.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IManagedHover, IManagedHoverContent } from '../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, IAction, IActionRunner, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionWidgetDropdownAction } from '../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, IMissionControlSharingService, isGitHubEnvironmentBackend } from '../../../../platform/agentHost/common/missionControlEnvironment.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IRemoteTunnelService, INACTIVE_TUNNEL_MODE, TunnelMode, TunnelStatus } from '../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { RemoteTunnelCommandIds } from '../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';

const TUNNEL_ACCESS_DOCS_URL = 'https://aka.ms/vscode-agent-tunnel-access';
const githubEnvironmentDataHandlingDescription = localize('remoteConnections.githubEnvironment.dataHandling', "Session actions are mirrored to GitHub for catalog and history storage. Conversation content is not end-to-end encrypted.");

export interface IRemoteTunnelAccessState {
	readonly isSharing: boolean;
	readonly isConnecting: boolean;
	readonly tunnelName: string | undefined;
}

export function getRemoteTunnelAccessState(mode: TunnelMode, status: TunnelStatus): IRemoteTunnelAccessState {
	return {
		isSharing: status.type === 'connected',
		isConnecting: status.type === 'connecting' || (mode.active && status.type === 'uninitialized'),
		tunnelName: status.type === 'connected' ? status.info.tunnelName : undefined,
	};
}

export class RemoteConnectionsActionViewItem extends BaseActionViewItem {

	private readonly _primaryAction: ToggleRemoteConnectionsActionViewItem;
	private readonly _dropdown: ActionWidgetDropdownActionViewItem | undefined;

	constructor(
		action: IAction,
		private readonly _isChatInput: boolean,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IProductService productService: IProductService,
	) {
		super(undefined, action);

		this._primaryAction = this._register(instantiationService.createInstance(ToggleRemoteConnectionsActionViewItem, action));
		if (productService.quality === 'stable') {
			return;
		}
		const dropdownAction = this._register(new Action('remoteConnections.selectMethod', localize('remoteConnections.selectMethod', "Select Remote Connection Method")));
		dropdownAction.tooltip = localize('remoteConnections.selectMethod.tooltip', "Select Remote Connection Method\nChanging the method turns remote connections off.");
		this._dropdown = this._register(instantiationService.createInstance(ActionWidgetDropdownActionViewItem,
			dropdownAction,
			{ actionProvider: { getActions: () => this._getConnectionMethods() } },
		));
	}

	override set actionRunner(actionRunner: IActionRunner) {
		super.actionRunner = actionRunner;
		this._primaryAction.actionRunner = actionRunner;
		if (this._dropdown) {
			this._dropdown.actionRunner = actionRunner;
		}
	}

	override get actionRunner(): IActionRunner {
		return super.actionRunner;
	}

	override setActionContext(context: unknown): void {
		super.setActionContext(context);
		this._primaryAction.setActionContext(context);
		this._dropdown?.setActionContext(context);
	}

	override render(container: HTMLElement): void {
		const dropdown = this._dropdown;
		if (!dropdown) {
			this._primaryAction.render(container);
			this.element = this._primaryAction.element;
			this._updateTabStops();
			return;
		}

		super.render(container);
		container.classList.add('monaco-dropdown-with-primary', 'remote-connections-action');
		container.role = 'group';
		container.setAttribute('aria-label', localize('remoteConnections.label', "Remote Connections"));

		const primaryContainer = dom.append(container, dom.$('.action-container'));
		this._primaryAction.render(primaryContainer);
		const dropdownContainer = dom.append(container, dom.$('.dropdown-action-container'));
		dropdown.render(dropdownContainer);
		dropdown.element?.classList.add('codicon-chevron-down');

		this._register(dom.addDisposableListener(primaryContainer, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.RightArrow)) {
				this.blur();
				dropdown.focus();
				event.preventDefault();
				event.stopPropagation();
			}
		}));
		this._register(dom.addDisposableListener(dropdownContainer, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.LeftArrow)) {
				this.blur();
				this._primaryAction.focus();
				event.preventDefault();
				event.stopPropagation();
			}
		}));
		this._updateTabStops();
	}

	override focus(fromRight?: boolean): void {
		if (fromRight && this._dropdown) {
			this._dropdown.focus();
		} else {
			this._primaryAction.focus();
		}
	}

	override blur(): void {
		this._primaryAction.blur();
		this._dropdown?.blur();
		this._updateTabStops();
	}

	override setFocusable(focusable: boolean): void {
		this._primaryAction.setFocusable(focusable);
		this._dropdown?.setFocusable(false);
		this._updateTabStops();
	}

	protected override updateEnabled(): void {
		this._updateTabStops();
	}

	private _updateTabStops(): void {
		if (this._isChatInput) {
			// Like the other chat input pickers, these controls keep individual Tab stops.
			this._primaryAction.setFocusable(this.isEnabled());
			this._dropdown?.setFocusable(this.isEnabled());
		}
	}

	private _getConnectionMethods(): IActionWidgetDropdownAction[] {
		const usesGitHubEnvironment = isGitHubEnvironmentBackend(this._configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId));
		return [
			{
				...toAction({
					id: 'remoteConnections.devTunnel',
					label: localize('remoteConnections.devTunnel', "Dev Tunnels"),
					checked: !usesGitHubEnvironment,
					run: () => this._selectConnectionMethod('devTunnel'),
				}),
				detail: localize('remoteConnections.devTunnel.detail', "Connect from VS Code or a browser through a secure tunnel."),
			},
			{
				...toAction({
					id: 'remoteConnections.githubEnvironment',
					label: localize('remoteConnections.githubEnvironment', "GitHub Environments"),
					checked: usesGitHubEnvironment,
					run: () => this._selectConnectionMethod('githubEnvironment'),
				}),
				detail: localize('remoteConnections.githubEnvironment.detail', "Register this machine with GitHub for remote agent access."),
				badge: localize('remoteConnections.preview', "Preview"),
				hover: { content: githubEnvironmentDataHandlingDescription },
			},
		];
	}

	private async _selectConnectionMethod(backend: 'devTunnel' | 'githubEnvironment'): Promise<void> {
		const current = this._configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId);
		if (isGitHubEnvironmentBackend(current) === isGitHubEnvironmentBackend(backend)) {
			return;
		}
		try {
			await this._configurationService.updateValue(AgentHostRemoteConnectionsSettingId, backend, ConfigurationTarget.USER);
		} catch (error) {
			this._notificationService.error(error);
		}
	}
}

export class ToggleRemoteConnectionsActionViewItem extends BaseActionViewItem {

	private _iconElement: HTMLElement | undefined;
	private _hover: IManagedHover | undefined;
	private _mode: TunnelMode = INACTIVE_TUNNEL_MODE;
	private _status: TunnelStatus = { type: 'uninitialized' };
	private _hasReceivedMode = false;
	private _hasReceivedStatus = false;

	constructor(
		action: IAction,
		@IRemoteTunnelService private readonly _remoteTunnelService: IRemoteTunnelService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IProductService private readonly _productService: IProductService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IMissionControlSharingService private readonly _missionControlSharingService: IMissionControlSharingService,
	) {
		super(undefined, action);

		this._register(autorun(reader => {
			this._missionControlSharingService.state.read(reader);
			this._updateState();
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AgentHostRemoteConnectionsSettingId)) {
				this._updateState();
			}
		}));
		this._register(this._remoteTunnelService.onDidChangeTunnelStatus(status => {
			this._hasReceivedStatus = true;
			this._status = status;
			this._updateState();
		}));
		this._register(this._remoteTunnelService.onDidChangeMode(mode => {
			this._hasReceivedMode = true;
			this._mode = mode;
			this._updateState();
		}));
		void this._loadState();
	}

	override render(container: HTMLElement): void {
		super.render(container);

		if (!this.element) {
			return;
		}

		this.element.classList.add('tunnel-host-toggle');
		this.element.tabIndex = 0;
		this.element.role = 'button';

		this._iconElement = dom.append(this.element, dom.$('span.tunnel-host-icon'));
		this._iconElement.append(...renderLabelWithIcons(`$(${Codicon.radioTower.id})`));

		const hoverDelegate = getDefaultHoverDelegate('element');
		this._hover = this._register(this._hoverService.setupManagedHover(
			hoverDelegate, this.element, this._getHoverContent()
		));

		this._updateState();
	}

	private _updateState(): void {
		const state = this._getState();
		if (!this.element) {
			return;
		}

		this.element.classList.toggle('sharing', state.isSharing);
		this.element.classList.toggle('connecting', state.isConnecting);
		this._hover?.update(this._getHoverContent());
		this.element.setAttribute('aria-label', this._getAriaLabel());
		this.element.setAttribute('aria-pressed', String(state.isSharing));

	}

	private _usesMissionControl(): boolean {
		return isGitHubEnvironmentBackend(this._configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId));
	}

	private _getState(): IRemoteTunnelAccessState {
		if (this._usesMissionControl()) {
			const state = this._missionControlSharingService.state.get();
			return { isSharing: state === 'enabled', isConnecting: state === 'connecting', tunnelName: undefined };
		}
		return getRemoteTunnelAccessState(this._mode, this._status);
	}

	private async _loadState(): Promise<void> {
		const [mode, status] = await Promise.all([
			this._remoteTunnelService.getMode(),
			this._remoteTunnelService.getTunnelStatus(),
		]);
		if (!this._hasReceivedMode) {
			this._mode = mode;
		}
		if (!this._hasReceivedStatus) {
			this._status = status;
		}
		this._updateState();
	}

	private _getHoverContent(): IManagedHoverContent {
		if (this._usesMissionControl()) {
			return localize('missionControlSharing.hover', "{0}\n\n{1}\n\n{2}",
				this._getAriaLabel(),
				localize('missionControlSharing.fileSystemAccess', "Enabling remote connections allows clients authenticated as your GitHub account to read and modify files across this machine's accessible file systems, including sensitive files. Operating system permissions still apply."),
				githubEnvironmentDataHandlingDescription,
			);
		}
		const lines: string[] = [];
		const state = this._getState();

		if (state.isConnecting) {
			lines.push(localize('tunnelHost.hover.connecting', "Establishing tunnel connection..."));
		} else if (state.isSharing) {
			lines.push(state.tunnelName
				? localize('tunnelHost.hover.sharing', "Remote Tunnel Access is enabled via tunnel '{0}'", state.tunnelName)
				: localize('tunnelHost.hover.enabled', "Remote Tunnel Access is enabled"));
		} else {
			const agentsUrl = this._productService.webUrl ? `${this._productService.webUrl.replace(/\/$/, '')}/agents` : undefined;
			lines.push(agentsUrl
				? localize('tunnelHost.hover.idle', "Allow connections from other machines and {0}", `[${agentsUrl.replace(/https?:\/\//, '')}](${agentsUrl})`)
				: localize('tunnelHost.hover.idle.noWebUrl', "Allow connections from other machines"));
		}

		lines.push(localize('tunnelHost.hover.method', "Connection method: Dev Tunnels"));
		lines.push(`[${localize('tunnelHost.hover.showOutput', "Show Output")}](command:${RemoteTunnelCommandIds.showLog}) | [${localize('tunnelHost.hover.renameTunnel', "Rename Tunnel")}](command:${RemoteTunnelCommandIds.rename}) | [${localize('tunnelHost.hover.learnMore', "Learn More")}](${TUNNEL_ACCESS_DOCS_URL})`);

		const md = new MarkdownString(lines.join('\n\n'), { isTrusted: { enabledCommands: [RemoteTunnelCommandIds.showLog, RemoteTunnelCommandIds.rename] } });
		return { markdown: md, markdownNotSupportedFallback: lines[0] };
	}

	private _getAriaLabel(): string {
		const state = this._getState();
		if (this._usesMissionControl()) {
			return state.isConnecting
				? localize('missionControlSharing.connecting', "Registering GitHub environment...")
				: state.isSharing
					? localize('missionControlSharing.enabled', "Remote Connections via GitHub environment are enabled")
					: localize('missionControlSharing.disabled', "Allow Remote Connections via GitHub environment");
		}
		if (state.isConnecting) {
			return localize('tunnelHost.hover.connecting', "Establishing tunnel connection...");
		}
		if (state.isSharing) {
			return state.tunnelName
				? localize('tunnelHost.ariaLabel.remoteTunnelAccess', "Remote Tunnel Access is enabled via tunnel '{0}'", state.tunnelName)
				: localize('tunnelHost.hover.enabled', "Remote Tunnel Access is enabled");
		}
		const agentsUrl = this._productService.webUrl ? `${this._productService.webUrl.replace(/\/$/, '')}/agents` : undefined;
		return agentsUrl
			? localize('tunnelHost.hover.idle.ariaLabel', "Allow connections from other machines and {0}", agentsUrl.replace(/https?:\/\//, ''))
			: localize('tunnelHost.hover.idle.ariaLabel.noWebUrl', "Allow connections from other machines");
	}
}
