/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostRemoteConnectionsSettingId, GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlSharingService } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { INACTIVE_TUNNEL_MODE, IRemoteTunnelService, TunnelMode, TunnelStatus } from '../../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ThisComputerSection } from '../../electron-browser/thisComputerSection.js';

interface IThisComputerFixtureState {
	readonly method: 'off' | 'devTunnel' | 'githubEnvironment';
	readonly starting?: boolean;
	readonly width?: number;
}

async function render({ container, disposableStore, theme }: ComponentFixtureContext, state: IThisComputerFixtureState): Promise<void> {
	container.style.width = `${state.width ?? 900}px`;
	container.classList.add('remotes-editor');
	container.style.height = 'auto';
	const github = state.method === 'githubEnvironment';
	const tunnelStatus: TunnelStatus = state.method !== 'devTunnel' ? { type: 'disconnected' }
		: state.starting ? { type: 'connecting' }
			: { type: 'connected', info: { tunnelName: 'dev-workstation', isAttached: false }, serviceInstallFailed: false };
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IHoverService, HoverService);
			reg.definePartialInstance(ILayoutService, { getContainer: () => container });
			reg.definePartialInstance(IQuickInputService, {});
			reg.defineInstance(IRemoteTunnelService, new class extends mock<IRemoteTunnelService>() {
				override readonly onDidChangeTunnelStatus = Event.None;
				override readonly onDidChangeMode = Event.None;
				override async getMode(): Promise<TunnelMode> { return INACTIVE_TUNNEL_MODE; }
				override async getTunnelStatus(): Promise<TunnelStatus> { return tunnelStatus; }
				override async getTunnelName(): Promise<string | undefined> { return 'dev-workstation'; }
			}());
			reg.defineInstance(IMissionControlSharingService, new class extends mock<IMissionControlSharingService>() {
				override readonly state = observableValue<'disabled' | 'connecting' | 'enabled'>(this, !github ? 'disabled' : state.starting ? 'connecting' : 'enabled');
				override readonly environmentName = observableValue<string | undefined>(this, 'Developer Workstation (Code - OSS)');
			}());
			reg.definePartialInstance(IMissionControlAvailabilityService, { available: observableValue('available', true) });
			reg.defineInstance(IAgentHostService, new class extends mock<IAgentHostService>() {
				override async getMissionControlEnvironmentName() { return 'Developer Workstation (Code - OSS)'; }
			}());
		},
	});
	const configuration = instantiationService.get(IConfigurationService) as TestConfigurationService;
	await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
	await configuration.setUserConfiguration(AgentHostRemoteConnectionsSettingId, github ? 'githubEnvironment' : 'devTunnel');
	disposableStore.add(instantiationService.createInstance(ThisComputerSection, container));
	await waitForFixtureCondition(() => !!container.querySelector('.remotes-this-computer-name')?.textContent, 'This Computer should show its sharing name before capture');
}

export default defineThemedFixtureGroup({ path: 'sessions/remotes/' }, {
	Off: defineComponentFixture({
		labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => render(context, { method: 'off' }),
	}),
	DevTunnels: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, { method: 'devTunnel' }) }),
	GitHubEnvironments: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, { method: 'githubEnvironment' }) }),
	GitHubEnvironmentsStarting: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, { method: 'githubEnvironment', starting: true }) }),
	Narrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, { method: 'githubEnvironment', width: 360 }) }),
});
