/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { CustomizationEnablementKind } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type IRootConfigChangedAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { PluginFormat } from '../../../../../../platform/agentPlugins/common/pluginParsers.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ContributionEnablementState, type IEnablementModel } from '../../../common/enablement.js';
import { IAgentPluginService, type IAgentPlugin } from '../../../common/plugins/agentPluginService.js';
import { AgentHostAutomationPluginsContribution } from '../../../browser/agentSessions/agentHost/agentHostAutomationPluginsContribution.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	override readonly onAgentHostStart = Event.None;
	override readonly onAgentHostExit = Event.None;
	override readonly onDidAction = Event.None;
	override readonly onDidNotification = Event.None;

	readonly dispatchedActions: IRootConfigChangedAction[] = [];

	override dispatch(_channel: string, action: IRootConfigChangedAction): void {
		this.dispatchedActions.push(action);
	}

	private readonly _rootStateValue: RootState = {
		agents: [],
		config: {
			schema: {
				type: 'object',
				properties: {
					[AgentHostConfigKey.AutomationClientPlugins]: { type: 'array', title: 'Automation Client Plugins' },
				},
			},
			values: {},
		},
	};
	private readonly _rootStateOnDidChange = new Emitter<RootState>();
	override readonly rootState: IAgentSubscription<RootState> = {
		value: this._rootStateValue,
		verifiedValue: this._rootStateValue,
		onDidChange: this._rootStateOnDidChange.event,
		onWillApplyAction: Event.None,
		onDidApplyAction: Event.None,
	};

	dispose(): void {
		this._rootStateOnDidChange.dispose();
	}
}

class MockAgentPluginService extends mock<IAgentPluginService>() {
	declare readonly _serviceBrand: undefined;

	override readonly plugins = observableValue<readonly IAgentPlugin[]>(this, []);
	private readonly _profileEnablement = new Map<string, ReturnType<typeof observableValue<boolean>>>();
	override readonly enablementModel: IEnablementModel = {
		readEnabled: key => this._readProfileEnabled(key) ? ContributionEnablementState.EnabledProfile : ContributionEnablementState.DisabledProfile,
		readProfileEnabled: (key, reader) => this._getProfileEnablement(key).read(reader),
		setEnabled: () => { },
		remove: () => { },
	};

	setPlugins(plugins: readonly IAgentPlugin[]): void {
		this.plugins.set(plugins, undefined);
	}

	setProfileEnabled(uri: URI, enabled: boolean): void {
		this._getProfileEnablement(uri.toString()).set(enabled, undefined);
	}

	private _readProfileEnabled(key: string): boolean {
		return this._getProfileEnablement(key).get();
	}

	private _getProfileEnablement(key: string): ReturnType<typeof observableValue<boolean>> {
		let value = this._profileEnablement.get(key);
		if (!value) {
			value = observableValue(this, true);
			this._profileEnablement.set(key, value);
		}
		return value;
	}
}

function plugin(uri: URI, label: string, policyBlocked = false): IAgentPlugin {
	return {
		uri,
		label,
		format: PluginFormat.OpenPlugin,
		enablement: constObservable(ContributionEnablementState.DisabledWorkspace),
		policyBlocked: constObservable(policyBlocked),
		hooks: constObservable([]),
		commands: constObservable([]),
		skills: constObservable([]),
		agents: constObservable([]),
		instructions: constObservable([]),
		mcpServerDefinitions: constObservable([]),
	};
}

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

function readForwardedPlugins(action: IRootConfigChangedAction) {
	const value = action.config[AgentHostConfigKey.AutomationClientPlugins];
	if (!agentHostCustomizationConfigSchema.validate(AgentHostConfigKey.AutomationClientPlugins, value)) {
		throw new Error('Expected valid Automation client plugins');
	}
	return value;
}

suite('AgentHostAutomationPluginsContribution', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards sorted file plugins with profile and policy enablement', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const agentHostService = disposables.add(new MockAgentHostService());
		const agentPluginService = new MockAgentPluginService();
		const enabled = plugin(URI.file('/plugins/a'), 'A');
		const profileDisabled = plugin(URI.file('/plugins/z'), 'Z');
		const policyBlocked = plugin(URI.file('/plugins/b'), 'B', true);
		const remote = plugin(URI.from({ scheme: Schemas.https, authority: 'example.com', path: '/plugin' }), 'Remote');
		agentPluginService.setProfileEnabled(profileDisabled.uri, false);
		agentPluginService.setPlugins([profileDisabled, remote, policyBlocked, enabled]);
		instantiationService.stub(IAgentHostService, agentHostService);
		instantiationService.stub(IAgentPluginService, agentPluginService);
		instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(true), managedSandboxEnforced: constObservable(false) });
		instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly isSessionsWindow = false;
		});
		disposables.add(instantiationService.createInstance(AgentHostAutomationPluginsContribution));
		await flush();

		assert.deepStrictEqual(agentHostService.dispatchedActions.map(action => action.config[AgentHostConfigKey.AutomationClientPlugins]), [[
			{
				uri: enabled.uri.toString(),
				displayName: 'A',
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
			},
			{
				uri: policyBlocked.uri.toString(),
				displayName: 'B',
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			},
			{
				uri: profileDisabled.uri.toString(),
				displayName: 'Z',
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			},
		]]);
	});

	test('republishes when plugins or profile enablement change', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const agentHostService = disposables.add(new MockAgentHostService());
		const agentPluginService = new MockAgentPluginService();
		const first = plugin(URI.file('/plugins/a'), 'A');
		const second = plugin(URI.file('/plugins/b'), 'B');
		agentPluginService.setPlugins([first]);
		instantiationService.stub(IAgentHostService, agentHostService);
		instantiationService.stub(IAgentPluginService, agentPluginService);
		instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(true), managedSandboxEnforced: constObservable(false) });
		instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly isSessionsWindow = false;
		});
		disposables.add(instantiationService.createInstance(AgentHostAutomationPluginsContribution));
		await flush();
		agentPluginService.setProfileEnabled(first.uri, false);
		await flush();
		agentPluginService.setPlugins([first, second]);
		await flush();

		assert.deepStrictEqual(agentHostService.dispatchedActions.map(action =>
			readForwardedPlugins(action).map(entry => ({
				uri: entry.uri,
				enabled: entry.enablement[0].enabled,
			}))
		), [
			[{ uri: first.uri.toString(), enabled: true }],
			[{ uri: first.uri.toString(), enabled: false }],
			[
				{ uri: first.uri.toString(), enabled: false },
				{ uri: second.uri.toString(), enabled: true },
			],
		]);
	});
});
