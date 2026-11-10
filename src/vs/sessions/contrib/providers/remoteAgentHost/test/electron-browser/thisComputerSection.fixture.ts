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
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { INACTIVE_TUNNEL_MODE, IRemoteTunnelService, TunnelMode, TunnelStatus } from '../../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition } from '../../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ThisComputerSection } from '../../../../../../workbench/contrib/sessions/providers/remoteAgentHost/electron-browser/thisComputerSection.js';
import '../../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/media/remotesWidget.css';

interface IThisComputerFixtureState {
	readonly method: 'off' | 'devTunnel' | 'githubEnvironment';
	readonly starting?: boolean;
	readonly width?: number;
	readonly policyDisabled?: boolean;
	readonly showOptions?: boolean;
	readonly failSharing?: boolean;
	readonly selectMethod?: 'devTunnel' | 'githubEnvironment' | 'none';
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
			if (state.failSharing) {
				reg.definePartialInstance(ICommandService, { executeCommand: async () => undefined });
			}
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
	await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, !state.policyDisabled);
	await configuration.setUserConfiguration(AgentHostRemoteConnectionsSettingId, github ? 'githubEnvironment' : 'devTunnel');
	if (state.policyDisabled) {
		const inspect = configuration.inspect.bind(configuration);
		configuration.inspect = <T>(key: string) => key === GitHubEnvironmentsEnabledSettingId
			? { ...inspect<T>(key), policyValue: false as T }
			: inspect<T>(key);
	}
	const section = disposableStore.add(instantiationService.createInstance(ThisComputerSection, container, () => { }));
	await waitForFixtureCondition(() => !!container.querySelector('.remotes-this-computer-name')?.textContent, 'This computer should show its sharing name before capture');
	if (state.showOptions) {
		container.style.height = state.width === 360 ? '800px' : '620px';
		container.querySelector<HTMLElement>('.remotes-this-computer-share > .monaco-button')!.click();
		if (state.selectMethod !== 'none') {
			const method = state.selectMethod ?? (state.policyDisabled || state.failSharing ? 'devTunnel' : 'githubEnvironment');
			container.querySelector<HTMLElement>(`[data-sharing-method="${method}"]`)!.click();
		}
		section.layout();
		await waitForFixtureCondition(() => section.isExpanded && container.querySelectorAll('.remotes-sharing-choice-description li').length === 6, 'Both sharing methods should be explained before capture');
		if (state.failSharing) {
			container.style.height = '660px';
			container.querySelector<HTMLElement>('.remotes-sharing-footer .monaco-button:not(.secondary)')!.click();
			await waitForFixtureCondition(() => !!container.querySelector('.remotes-sharing-feedback-container.sharing-failed'), 'Unsuccessful sharing should show recovery guidance');
		}
	}
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
	PolicyDisabled: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, { method: 'off', policyDisabled: true, showOptions: true }) }),
	GuidedSharing: defineComponentFixture({ labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => render(context, { method: 'off', showOptions: true }) }),
	GuidedSharingNarrow: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, { method: 'off', showOptions: true, width: 360 }) }),
	GuidedSharingInitial: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => render(context, { method: 'off', showOptions: true, selectMethod: 'none' }) }),
	GuidedSharingTunnel: defineComponentFixture({ labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => render(context, { method: 'off', showOptions: true, selectMethod: 'devTunnel' }) }),
	FailedSharing: defineComponentFixture({ labels: { kind: 'screenshot' }, additionalThemes: ['darkHighContrast', 'lightHighContrast'], render: context => render(context, { method: 'off', showOptions: true, failSharing: true }) }),
});
