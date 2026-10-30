/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostRemoteConnectionsSettingId, GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlSharingService } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { INACTIVE_TUNNEL_MODE, IRemoteTunnelService, TunnelStatus } from '../../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { IPreferencesService } from '../../../../../../workbench/services/preferences/common/preferences.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ThisComputerSharing } from '../../electron-browser/thisComputerSharing.js';
import '../../browser/media/remotesWidget.css';

async function renderThisComputerSharing({ container, disposableStore, theme }: ComponentFixtureContext, state: 'off' | 'connecting' | 'on', github = false, width = 900): Promise<void> {
	container.style.width = `${width}px`;
	container.style.padding = '16px';
	const name = 'workmac-development-workstation-with-a-long-registration-name';
	const configuration = new TestConfigurationService({
		[AgentHostRemoteConnectionsSettingId]: github ? 'githubEnvironment' : 'devTunnel',
		[GitHubEnvironmentsEnabledSettingId]: true,
	});
	disposableStore.add(configuration.onDidChangeConfigurationEmitter);
	const tunnelStatus: TunnelStatus = state === 'on' && !github
		? { type: 'connected', info: { tunnelId: 'fixture-id', tunnelName: name, isAttached: false, link: 'https://vscode.dev/tunnel/fixture' }, serviceInstallFailed: false }
		: state === 'connecting' && !github ? { type: 'connecting', progress: undefined } : { type: 'disconnected' };
	const provider = new class extends mock<IAgentHostSessionsProvider>() {
		override readonly id = 'agenthost-remote-fixture';
		override readonly localRegistration = observableValue<'devTunnel' | 'githubEnvironment' | undefined>(this, github ? 'githubEnvironment' : 'devTunnel');
		override readonly localRegistrationName = observableValue<string | undefined>(this, name);
	}();
	const instantiation = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IActionWidgetService, ActionWidgetService);
			reg.defineInstance(IConfigurationService, configuration);
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return [provider]; }
			}());
			reg.defineInstance(IRemoteTunnelService, new class extends mock<IRemoteTunnelService>() {
				override readonly onDidChangeTunnelStatus = Event.None;
				override readonly onDidChangeMode = Event.None;
				override async getTunnelStatus() { return tunnelStatus; }
				override async getMode() { return INACTIVE_TUNNEL_MODE; }
				override async getTunnelName() { return name; }
			}());
			reg.defineInstance(IMissionControlSharingService, new class extends mock<IMissionControlSharingService>() {
				override readonly state = observableValue<'disabled' | 'connecting' | 'enabled'>(this, github ? state === 'on' ? 'enabled' : state === 'connecting' ? 'connecting' : 'disabled' : 'disabled');
				override readonly environmentName = observableValue<string | undefined>(this, name);
			}());
			reg.defineInstance(IMissionControlAvailabilityService, new class extends mock<IMissionControlAvailabilityService>() {
				override readonly available = observableValue<boolean | undefined>(this, true);
			}());
			reg.defineInstance(IAgentHostService, new class extends mock<IAgentHostService>() {
				override async getMissionControlEnvironmentName() { return name; }
			}());
			reg.defineInstance(IQuickInputService, new class extends mock<IQuickInputService>() { }());
			reg.defineInstance(IPreferencesService, new class extends mock<IPreferencesService>() { }());
			reg.defineInstance(IProductService, new class extends mock<IProductService>() {
				override readonly tunnelApplicationName = 'code';
				override readonly tunnelApplicationConfig = {
					authenticationProviders: {}, editorWebUrl: 'https://vscode.dev', extension: { extensionId: 'test.tunnels', friendlyName: 'Tunnels' },
				};
			}());
		},
	});
	disposableStore.add(instantiation.createInstance(ThisComputerSharing, container));
	await waitForFixtureCondition(() => container.querySelector('.tunnel-host-label')?.textContent ===
		(state === 'connecting' ? 'Starting...' : state === 'off' ? 'Off' : github ? 'GitHub Environments' : 'Dev Tunnels'), 'Sharing control should show the requested fixture state');
}

export default defineThemedFixtureGroup({ path: 'sessions/remotes/' }, {
	Off: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderThisComputerSharing(context, 'off') }),
	DevTunnel: defineComponentFixture({ labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => renderThisComputerSharing(context, 'on') }),
	GitHubEnvironment: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderThisComputerSharing(context, 'on', true) }),
	Connecting: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderThisComputerSharing(context, 'connecting', true) }),
	Narrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderThisComputerSharing(context, 'on', false, 480) }),
});
