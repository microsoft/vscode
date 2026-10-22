/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/tunnelHost.css';
import * as dom from '../../../../base/browser/dom.js';
import { IManagedHover, IManagedHoverContent } from '../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, IAction, IActionRunner, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionListOptions } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, IMissionControlSharingService, isGitHubEnvironmentBackend } from '../../../../platform/agentHost/common/missionControlEnvironment.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { CONFIGURATION_KEY_HOST_NAME, IRemoteTunnelService, INACTIVE_TUNNEL_MODE, TunnelMode, TunnelStatus } from '../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { promptToRenameRemoteTunnel, RemoteTunnelCommandIds } from '../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';

const TUNNEL_ACCESS_DOCS_URL = 'https://aka.ms/vscode-agent-tunnel-access';

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

class RemoteConnectionsDropdownActionViewItem extends ActionWidgetDropdownActionViewItem {
	protected override renderLabel(element: HTMLElement) {
		element.classList.add('tunnel-host-toggle');
		const icon = dom.append(element, dom.$('span.tunnel-host-icon', { 'aria-hidden': 'true' }));
		icon.append(...renderLabelWithIcons(`$(${Codicon.radioTower.id})`));
		return super.renderLabel(element);
	}

	protected override setAriaLabelAttributes(element: HTMLElement): void {
		super.setAriaLabelAttributes(element);
		element.setAttribute('aria-label', this.action.tooltip || this.action.label);
	}
}

export class RemoteConnectionsActionViewItem extends BaseActionViewItem {

	private readonly _primaryAction: ToggleRemoteConnectionsActionViewItem;
	private readonly _dropdown: ActionWidgetDropdownActionViewItem | undefined;
	private _environmentName: string | undefined;
	private _tunnelName: string | undefined;
	private _namesLoaded = false;
	private _nameRequest = 0;

	constructor(
		action: IAction,
		private readonly _isChatInput: boolean,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IProductService productService: IProductService,
		@IRemoteTunnelService private readonly _remoteTunnelService: IRemoteTunnelService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IMissionControlSharingService private readonly _missionControlSharingService: IMissionControlSharingService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super(undefined, action);

		this._primaryAction = this._register(instantiationService.createInstance(ToggleRemoteConnectionsActionViewItem, action));
		if (productService.quality === 'stable') {
			return;
		}
		const dropdownAction = this._register(new Action('remoteConnections.selectMethod', localize('remoteConnections.label', "Remote Connections")));
		this._dropdown = this._register(instantiationService.createInstance(RemoteConnectionsDropdownActionViewItem,
			dropdownAction,
			{
				actionProvider: { getActions: () => this._getConnectionMethods() },
				listOptionsProvider: { getListOptions: () => this._getListOptions() },
			},
		));
		this._register(this._primaryAction.onDidChangeState(() => this._updateDropdownState()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CONFIGURATION_KEY_HOST_NAME)) {
				void this._loadNames();
			}
		}));
		this._register(autorun(reader => {
			this._missionControlSharingService.environmentName.read(reader);
			void this._loadNames();
		}));
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

		dropdown.render(container);
		this.element = dropdown.element;
		this._updateDropdownState();
		this._updateTabStops();
	}

	override focus(_fromRight?: boolean): void {
		if (this._dropdown) {
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
		if (this._dropdown) {
			this._dropdown.setFocusable(focusable);
		} else {
			this._primaryAction.setFocusable(focusable);
		}
		this._updateTabStops();
	}

	protected override updateEnabled(): void {
		if (this._dropdown) {
			this._dropdown.action.enabled = this.isEnabled();
		}
		this._updateTabStops();
	}

	private _updateTabStops(): void {
		if (this._isChatInput) {
			// Chat input controls keep a Tab stop independently of toolbar focus.
			this._primaryAction.setFocusable(this.isEnabled());
			this._dropdown?.setFocusable(this.isEnabled());
		}
	}

	private _updateDropdownState(): void {
		const dropdown = this._dropdown;
		if (!dropdown) {
			return;
		}
		const state = this._primaryAction.getState();
		dropdown.action.enabled = this.isEnabled();
		dropdown.action.tooltip = state.isSharing || state.isConnecting
			? this._primaryAction.getAriaLabel()
			: localize('remoteConnections.offLabel', "Remote Connections: Off");
		dropdown.element?.classList.toggle('sharing', state.isSharing);
		dropdown.element?.classList.toggle('connecting', state.isConnecting);
	}

	private async _loadNames(): Promise<void> {
		const request = ++this._nameRequest;
		try {
			const [environmentName, tunnelName] = await Promise.all([
				this._agentHostService.getMissionControlEnvironmentName?.(),
				this._remoteTunnelService.getTunnelName(),
			]);
			if (!this._store.isDisposed && request === this._nameRequest) {
				this._environmentName = this._missionControlSharingService.environmentName.get() ?? environmentName;
				this._tunnelName = tunnelName;
				this._namesLoaded = true;
			}
		} catch (error) {
			if (!this._store.isDisposed && request === this._nameRequest) {
				this._namesLoaded = true;
				this._notificationService.error(error);
			}
		}
	}

	private _getListOptions(): IActionListOptions {
		const state = this._primaryAction.getState();
		const usesGitHubEnvironment = isGitHubEnvironmentBackend(this._configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId));
		const name = usesGitHubEnvironment ? this._environmentName : state.tunnelName ?? this._tunnelName;
		const footerText = name
			? state.isSharing
				? usesGitHubEnvironment
					? localize('remoteConnections.registeredEnvironment', "Registered as GitHub environment: {0}", name)
					: localize('remoteConnections.sharedTunnel', "Shared as Dev Tunnel: {0}", name)
				: state.isConnecting
					? localize('remoteConnections.connectingName', "Connecting as: {0}", name)
					: localize('remoteConnections.name', "Will be shared as: {0}", name)
			: this._namesLoaded
				? localize('remoteConnections.nameUnavailable', "Remote name unavailable.")
				: localize('remoteConnections.loadingName', "Loading remote name...");
		return {
			minWidth: 300,
			maxWidth: 320,
			wrapDetails: true,
			footerText,
			footerAction: name ? toAction({
				id: 'remoteConnections.rename',
				label: name,
				tooltip: localize('remoteConnections.rename', "Rename Remote Environment"),
				enabled: this.isEnabled() && !state.isConnecting,
				run: () => this._renameEnvironment(usesGitHubEnvironment, name),
			}) : undefined,
			widgetClassName: 'remote-connections-picker',
			hideDefaultKeybindingTooltip: true,
		};
	}

	private async _renameEnvironment(githubEnvironment: boolean, currentName: string): Promise<void> {
		if (!this.isEnabled() || this._primaryAction.getState().isConnecting || githubEnvironment !== isGitHubEnvironmentBackend(this._configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId))) {
			return;
		}
		this._dropdown?.hide();
		try {
			if (githubEnvironment) {
				const name = await this._quickInputService.input({
					title: localize('remoteConnections.rename', "Rename Remote Environment"),
					prompt: localize('remoteConnections.renamePrompt', "Enter the name shown for this environment on other clients."),
					value: currentName,
					validateInput: async value => !value.trim() || /[\r\n\x00-\x1f\x7f]/.test(value)
						? localize('remoteConnections.invalidName', "Enter an environment name without control characters.")
						: undefined,
				});
				if (name !== undefined && name.trim() !== currentName && !this._store.isDisposed && this.isEnabled()
					&& isGitHubEnvironmentBackend(this._configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId))) {
					await this._missionControlSharingService.setEnvironmentName(name);
				}
			} else {
				await promptToRenameRemoteTunnel(this._quickInputService, this._configurationService, currentName);
			}
			await this._loadNames();
		} catch (error) {
			this._notificationService.error(error);
		}
	}

	private _getConnectionMethods(): IActionWidgetDropdownAction[] {
		const usesGitHubEnvironment = isGitHubEnvironmentBackend(this._configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId));
		const state = this._primaryAction.getState();
		const enabled = state.isSharing || state.isConnecting;
		return [
			toAction({
				id: 'remoteConnections.off',
				label: localize('remoteConnections.off', "Off"),
				checked: !enabled,
				run: () => this._selectConnectionMethod('off'),
			}),
			{
				...toAction({
					id: 'remoteConnections.devTunnel',
					label: localize('remoteConnections.devTunnel', "Dev Tunnels"),
					checked: enabled && !usesGitHubEnvironment,
					run: () => this._selectConnectionMethod('devTunnel'),
				}),
				labelIcon: Codicon.radioTower,
				detail: localize('remoteConnections.devTunnel.detail', "Access workspaces and agents on this machine from VS Code or vscode.dev/agents."),
			},
			{
				...toAction({
					id: 'remoteConnections.githubEnvironment',
					label: localize('remoteConnections.githubEnvironment', "GitHub Environments"),
					checked: enabled && usesGitHubEnvironment,
					run: () => this._selectConnectionMethod('githubEnvironment'),
				}),
				labelIcon: Codicon.github,
				detail: localize('remoteConnections.githubEnvironment.detail', "Access agents on this machine from VS Code, vscode.dev/agents, GitHub apps, or github.com/copilot."),
				badge: localize('remoteConnections.preview', "Preview"),
			},
		];
	}

	private async _selectConnectionMethod(backend: 'off' | 'devTunnel' | 'githubEnvironment'): Promise<void> {
		if (!this.isEnabled()) {
			return;
		}
		const current = this._configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId);
		const state = this._primaryAction.getState();
		const enabled = state.isSharing || state.isConnecting;
		try {
			if (backend === 'off') {
				if (enabled) {
					await this.action.run(this._context);
				}
				return;
			}
			if (isGitHubEnvironmentBackend(current) !== isGitHubEnvironmentBackend(backend)) {
				await this._configurationService.updateValue(AgentHostRemoteConnectionsSettingId, backend, ConfigurationTarget.USER);
				await this._remoteTunnelService.stopTunnel();
			} else if (enabled) {
				return;
			}
			await this.action.run(this._context);
		} catch (error) {
			this._notificationService.error(error);
		}
	}
}

export class ToggleRemoteConnectionsActionViewItem extends BaseActionViewItem {

	private readonly _onDidChangeState = this._register(new Emitter<void>());
	readonly onDidChangeState = this._onDidChangeState.event;
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
		const state = this.getState();
		this._onDidChangeState.fire();
		if (!this.element) {
			return;
		}

		this.element.classList.toggle('sharing', state.isSharing);
		this.element.classList.toggle('connecting', state.isConnecting);
		this._hover?.update(this._getHoverContent());
		this.element.setAttribute('aria-label', this.getAriaLabel());
		this.element.setAttribute('aria-pressed', String(state.isSharing));

	}

	private _usesMissionControl(): boolean {
		return isGitHubEnvironmentBackend(this._configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId));
	}

	getState(): IRemoteTunnelAccessState {
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
			return localize('missionControlSharing.hover', "{0}\n\n{1}",
				this.getAriaLabel(),
				localize('remoteConnections.githubEnvironment.detail', "Access agents on this machine from VS Code, vscode.dev/agents, GitHub apps, or github.com/copilot."),
			);
		}
		const lines: string[] = [];
		const state = this.getState();

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

	getAriaLabel(): string {
		const state = this.getState();
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
