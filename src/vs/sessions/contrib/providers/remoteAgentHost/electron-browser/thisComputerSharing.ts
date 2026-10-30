/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, IMissionControlSharingService, isGitHubEnvironmentBackend } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { ToggleRemoteConnectionsCommandId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IRemoteTunnelService, TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { RemoteConnectionsActionViewItem } from '../../../../../workbench/contrib/chat/electron-browser/toggleRemoteConnectionsActionViewItem.js';
import { isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';

export class ThisComputerSharing extends Disposable {
	readonly domNode: HTMLElement;
	private readonly name: HTMLElement;
	private readonly description: HTMLElement;

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICommandService commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@IRemoteTunnelService remoteTunnelService: IRemoteTunnelService,
		@IMissionControlSharingService sharingService: IMissionControlSharingService,
		@ISessionsProvidersService providersService: ISessionsProvidersService,
		@IClipboardService clipboardService: IClipboardService,
		@INotificationService notifications: INotificationService,
		@IHoverService hoverService: IHoverService,
	) {
		super();
		this.domNode = dom.append(container, dom.$('section.remotes-this-computer', { 'aria-label': localize('remotes.thisComputer', "This Computer") }));
		const heading = dom.append(this.domNode, dom.$('.remotes-local-heading'));
		dom.append(heading, dom.$('span.codicon.codicon-device-desktop', { 'aria-hidden': 'true' }));
		dom.append(heading, dom.$('h2', undefined, localize('remotes.thisComputer', "This Computer")));
		this.name = dom.append(heading, dom.$('span.remotes-local-name'));
		const nameHover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.name, ''));
		const toggle = this._register(new Action(ToggleRemoteConnectionsCommandId, localize('remotes.localConnections', "Remote Connections"), undefined, true,
			() => commandService.executeCommand(ToggleRemoteConnectionsCommandId)));
		const dropdown = this._register(instantiationService.createInstance(RemoteConnectionsActionViewItem, toggle, true, { showLabel: true }));
		const rename = this._register(new Action('remotes.renameThisComputer', localize('remotes.renameThisComputer', "Rename Shared Computer"), ThemeIcon.asClassName(Codicon.edit), false, () => dropdown.rename()));
		const tunnelStatus = observableValue<TunnelStatus | undefined>(this, undefined);
		let statusReceived = false;
		this._register(remoteTunnelService.onDidChangeTunnelStatus(status => {
			statusReceived = true;
			tunnelStatus.set(status, undefined);
		}));
		void remoteTunnelService.getTunnelStatus().then(status => {
			if (!this._store.isDisposed && !statusReceived) {
				tunnelStatus.set(status, undefined);
			}
		}, error => notifications.error(error));
		const copy = this._register(new Action('remotes.copyThisComputerLink', localize('remotes.copyThisComputerLink', "Copy Connection Link"), ThemeIcon.asClassName(Codicon.copy), false, async () => {
			const status = tunnelStatus.get();
			if (status?.type === 'connected' && status.info.link) {
				await clipboardService.writeText(status.info.link);
			}
		}));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, dom.append(heading, dom.$('.remotes-local-actions')), {
			ariaLabel: localize('remotes.localActions', "This computer actions"),
		}));
		toolbar.setActions([rename, copy]);
		const controls = dom.append(this.domNode, dom.$('.remotes-local-controls'));
		dom.append(controls, dom.$('span', undefined, localize('remotes.localConnections', "Remote Connections")));
		const sharingToolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, dom.append(controls, dom.$('.remotes-local-sharing')), {
			ariaLabel: localize('remotes.localConnections', "Remote Connections"),
			actionViewItemProvider: action => action === toggle ? dropdown : undefined,
		}));
		sharingToolbar.setActions([toggle]);
		this.description = dom.append(this.domNode, dom.$('p.remotes-local-description', { role: 'status' }));
		const providersChanged = observableSignalFromEvent(this, providersService.onDidChangeProviders);
		const configurationChanged = observableSignalFromEvent(this, configurationService.onDidChangeConfiguration);
		const nameChanged = observableSignalFromEvent(this, dropdown.onDidChangeName);
		let actionLayout = '';
		this._register(autorun(reader => {
			providersChanged.read(reader);
			configurationChanged.read(reader);
			nameChanged.read(reader);
			const github = isGitHubEnvironmentBackend(configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId));
			const status = tunnelStatus.read(reader);
			const state = sharingService.state.read(reader);
			const starting = github ? state === 'connecting' : status?.type === 'connecting';
			const active = github ? state === 'enabled' : status?.type === 'connected';
			const registration = github ? 'githubEnvironment' : 'devTunnel';
			const provider = providersService.getProviders().filter(isAgentHostProvider)
				.find(provider => provider.localRegistration?.read(reader) === registration);
			const name = github && (active || starting)
				? sharingService.environmentName.read(reader) ?? provider?.localRegistrationName?.read(reader)
				: !github && status?.type === 'connected' ? status.info.tunnelName : provider?.localRegistrationName?.read(reader);
			const displayName = active ? name ?? dropdown.getSharingName()
				: (github ? sharingService.environmentName.read(reader) : undefined) ?? dropdown.getSharingName() ?? name;
			this.name.textContent = displayName ?? '';
			nameHover.update(displayName ?? '');
			rename.enabled = !!displayName && !starting;
			copy.enabled = !github && status?.type === 'connected' && !!status.info.link;
			this.description.textContent = starting
				? localize('remotes.localStarting', "Starting remote connections. Local sessions remain available.")
				: active
					? localize('remotes.localShared', "Other clients can access agents and folders on this computer.")
					: !github && !status ? localize('remotes.localChecking', "Checking remote connections...")
						: localize('remotes.localNotShared', "Remote connections are off in this app. Local sessions remain available.");
			const layout = `${!!displayName}:${copy.enabled}`;
			if (actionLayout !== layout) {
				actionLayout = layout;
				toolbar.setActions(displayName ? copy.enabled ? [rename, copy] : [rename] : []);
			}
		}));
	}

	getAccessibilityContent(): string {
		return [localize('remotes.thisComputer', "This Computer"), this.name.textContent, this.description.textContent].filter(Boolean).join('\n');
	}

	override dispose(): void {
		super.dispose();
		this.domNode.remove();
	}
}
