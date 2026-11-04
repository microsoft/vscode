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
import { localize } from '../../../../nls.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionListOptions } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { GitHubEnvironmentsEnabledSettingId, IMissionControlSharingService } from '../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IRemoteTunnelService } from '../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { RemoteTunnelCommandIds } from '../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { getDevTunnelsDetail, getGitHubEnvironmentsDetail, getOffDetail, IRemoteTunnelAccessState, RemoteConnectionsMethod, RemoteConnectionsSharing, RemoteConnectionsState, TUNNEL_ACCESS_DOCS_URL } from './remoteConnectionsSharing.js';

export interface IRemoteConnectionsActionViewItemOptions {
	/** Adds a separate menu entry after the connection methods, e.g. to manage remote environments. */
	readonly getManagementAction?: () => IAction | undefined;
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
	private readonly _dropdown: ActionWidgetDropdownActionViewItem;
	private readonly _sharing: RemoteConnectionsSharing;

	constructor(
		action: IAction,
		private readonly _isChatInput: boolean,
		private readonly _options: IRemoteConnectionsActionViewItemOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IPreferencesService private readonly _preferencesService: IPreferencesService,
	) {
		super(undefined, action);

		this._primaryAction = this._register(instantiationService.createInstance(ToggleRemoteConnectionsActionViewItem, action));
		this._sharing = this._register(instantiationService.createInstance(RemoteConnectionsSharing, this._primaryAction, async () => { await this.action.run(this._context); }));
		const dropdownAction = this._register(new Action('remoteConnections.selectMethod', localize('remoteConnections.label', "Remote Connections")));
		this._dropdown = this._register(instantiationService.createInstance(RemoteConnectionsDropdownActionViewItem,
			dropdownAction,
			{
				actionProvider: { getActions: () => this._getConnectionMethods() },
				listOptionsProvider: { getListOptions: () => this._getListOptions() },
			},
		));
		this._register(this._primaryAction.onDidChangeState(() => this._updateDropdownState()));
	}

	override set actionRunner(actionRunner: IActionRunner) {
		super.actionRunner = actionRunner;
		this._primaryAction.actionRunner = actionRunner;
		this._dropdown.actionRunner = actionRunner;
	}

	override get actionRunner(): IActionRunner {
		return super.actionRunner;
	}

	override setActionContext(context: unknown): void {
		super.setActionContext(context);
		this._primaryAction.setActionContext(context);
		this._dropdown.setActionContext(context);
	}

	override render(container: HTMLElement): void {
		const dropdown = this._dropdown;
		dropdown.render(container);
		this.element = dropdown.element;
		this._updateDropdownState();
		this._updateTabStops();
	}

	override focus(_fromRight?: boolean): void {
		this._dropdown.focus();
	}

	override blur(): void {
		this._primaryAction.blur();
		this._dropdown.blur();
		this._updateTabStops();
	}

	override setFocusable(focusable: boolean): void {
		this._dropdown.setFocusable(focusable);
		this._updateTabStops();
	}

	protected override updateEnabled(): void {
		this._dropdown.action.enabled = this.isEnabled();
		this._updateTabStops();
	}

	private _updateTabStops(): void {
		if (this._isChatInput) {
			// Chat input controls keep a Tab stop independently of toolbar focus.
			this._primaryAction.setFocusable(this.isEnabled());
			this._dropdown.setFocusable(this.isEnabled());
		}
	}

	private _updateDropdownState(): void {
		const dropdown = this._dropdown;
		const state = this._primaryAction.getState();
		dropdown.action.enabled = this.isEnabled();
		dropdown.action.tooltip = state.isSharing || state.isConnecting
			? this._primaryAction.getAriaLabel()
			: localize('remoteConnections.offLabel', "Remote Connections: Off");
		dropdown.element?.classList.toggle('sharing', state.isSharing);
		dropdown.element?.classList.toggle('connecting', state.isConnecting);
	}

	private _getListOptions(): IActionListOptions {
		const options: IActionListOptions = {
			minWidth: 300,
			maxWidth: 320,
			wrapDetails: true,
			...this._getNameHeader(),
			widgetClassName: 'remote-connections-picker',
			hideDefaultKeybindingTooltip: true,
		};
		if (this._sharing.gitHubEnvironmentsAvailability !== 'policyDisabled') {
			return options;
		}
		const label = localize('remoteConnections.viewSetting', "View Setting");
		return {
			...options,
			footerText: localize('remoteConnections.policyFooter', "GitHub Environments is disabled by your organization. Contact your administrator. {0}", label),
			footerAction: toAction({
				id: 'remoteConnections.viewSetting',
				label,
				tooltip: localize('remoteConnections.viewManagedSetting', "View the Organization-Managed GitHub Environments Setting"),
				run: async () => {
					this._dropdown.hide();
					await this._preferencesService.openSettings({ query: `@id:${GitHubEnvironmentsEnabledSettingId}` });
				},
			}),
		};
	}

	/** Shows the name this computer is shared under above the connection methods, linked to rename it. */
	private _getNameHeader(): Pick<IActionListOptions, 'headerIcon' | 'headerText' | 'headerAction'> {
		const state = this._sharing.getState();
		const usesGitHubEnvironment = this._sharing.usesGitHubEnvironment;
		const name = this._sharing.name;
		const headerText = name
			? state.isSharing
				? usesGitHubEnvironment
					? localize('remoteConnections.registeredEnvironment', "Registered as GitHub environment: {0}", name)
					: localize('remoteConnections.sharedTunnel', "Shared as Dev Tunnel: {0}", name)
				: state.isConnecting
					? localize('remoteConnections.connectingName', "Connecting as: {0}", name)
					: localize('remoteConnections.name', "Will be shared as: {0}", name)
			: this._sharing.namesLoaded
				? localize('remoteConnections.nameUnavailable', "Remote name unavailable.")
				: localize('remoteConnections.loadingName', "Loading remote name...");
		return {
			headerIcon: Codicon.deviceDesktop,
			headerText,
			headerAction: name ? toAction({
				id: 'remoteConnections.rename',
				label: name,
				tooltip: localize('remoteConnections.rename', "Rename Remote Environment"),
				enabled: this.isEnabled() && !state.isConnecting,
				run: () => this._rename(usesGitHubEnvironment),
			}) : undefined,
		};
	}

	private async _rename(githubEnvironment: boolean): Promise<void> {
		if (!this.isEnabled() || this._sharing.getState().isConnecting || githubEnvironment !== this._sharing.usesGitHubEnvironment) {
			return;
		}
		this._dropdown.hide();
		await this._sharing.rename();
	}

	private _getConnectionMethods(): IActionWidgetDropdownAction[] {
		const environments = this._sharing.gitHubEnvironmentsAvailability;
		const active = this._sharing.activeMethod;
		const methods: IActionWidgetDropdownAction[] = [
			{
				...toAction({
					id: 'remoteConnections.off',
					label: localize('remoteConnections.off', "Off"),
					checked: active === 'off',
					run: () => this._selectConnectionMethod('off'),
				}),
				labelIcon: Codicon.circleSlash,
				detail: getOffDetail(),
			},
		];
		if (environments !== 'unavailable') {
			methods.push({
				...toAction({
					id: 'remoteConnections.githubEnvironment',
					label: localize('remoteConnections.githubEnvironment', "GitHub Environments"),
					enabled: environments === 'enabled',
					checked: active === 'githubEnvironment',
					run: () => this._selectConnectionMethod('githubEnvironment'),
				}),
				labelIcon: environments === 'policyDisabled' ? Codicon.briefcase : Codicon.github,
				detail: getGitHubEnvironmentsDetail(environments),
				badge: localize('remoteConnections.preview', "Preview"),
			});
		}
		methods.push({
			...toAction({
				id: 'remoteConnections.devTunnel',
				label: localize('remoteConnections.devTunnel', "Dev Tunnels"),
				checked: active === 'devTunnel',
				run: () => this._selectConnectionMethod('devTunnel'),
			}),
			labelIcon: Codicon.radioTower,
			detail: getDevTunnelsDetail(),
		});
		const management = this._options.getManagementAction?.();
		if (management) {
			// Uncategorized entries sort last, so the connection methods need their own category to stay first.
			for (const method of methods) {
				method.category = { label: 'methods', order: 0 };
			}
			methods.push({
				...toAction({
					id: management.id,
					label: management.label,
					enabled: management.enabled,
					run: () => management.run(),
				}),
				// Keeps the label aligned with the checkable connection methods.
				icon: Codicon.blank,
				labelIcon: Codicon.settingsGear,
				category: { label: 'management', order: 1 },
			});
		}
		return methods;
	}

	private async _selectConnectionMethod(method: RemoteConnectionsMethod): Promise<void> {
		if (!this.isEnabled()) {
			return;
		}
		await this._sharing.selectMethod(method);
	}
}

export class ToggleRemoteConnectionsActionViewItem extends BaseActionViewItem {

	private readonly _onDidChangeState = this._register(new Emitter<void>());
	readonly onDidChangeState = this._onDidChangeState.event;
	private _iconElement: HTMLElement | undefined;
	private _hover: IManagedHover | undefined;
	private readonly _state: RemoteConnectionsState;

	constructor(
		action: IAction,
		@IRemoteTunnelService remoteTunnelService: IRemoteTunnelService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IProductService private readonly _productService: IProductService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMissionControlSharingService missionControlSharingService: IMissionControlSharingService,
	) {
		super(undefined, action);

		this._state = this._register(new RemoteConnectionsState(remoteTunnelService, configurationService, missionControlSharingService));
		this._register(this._state.onDidChangeState(() => this._updateState()));
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
		return this._state.usesGitHubEnvironment;
	}

	getState(): IRemoteTunnelAccessState {
		return this._state.getState();
	}

	private _getHoverContent(): IManagedHoverContent {
		if (this._usesMissionControl()) {
			return localize('missionControlSharing.hover', "{0}\n\n{1}",
				this.getAriaLabel(),
				getGitHubEnvironmentsDetail('enabled'),
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
