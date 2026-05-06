/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { OS, OperatingSystem } from '../../../../../../base/common/platform.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AgentHostEnabledSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostConfigKey } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { ActionEnvelope, IRootConfigChangedAction, INotification, SessionAction, TerminalAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { TerminalSettingId, type ITerminalProfile } from '../../../../../../platform/terminal/common/terminal.js';
import { ITerminalProfileResolverService, ITerminalProfileService, type IShellLaunchConfigResolveOptions } from '../../../../terminal/common/terminal.js';
import { IAgentHostTerminalService } from '../../../../terminal/browser/agentHostTerminalService.js';
import { AgentHostTerminalContribution } from '../../../browser/agentSessions/agentHost/agentHostTerminalContribution.js';

// ---- Mock agent host service (minimal — only what the contribution touches) ----

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	override readonly clientId = 'test-window-1';

	private readonly _onAgentHostStart = new Emitter<void>();
	override readonly onAgentHostStart = this._onAgentHostStart.event;
	override readonly onAgentHostExit = Event.None;

	private readonly _onDidAction = new Emitter<ActionEnvelope>();
	override readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<INotification>();
	override readonly onDidNotification = this._onDidNotification.event;

	public dispatchedActions: (SessionAction | TerminalAction | IRootConfigChangedAction)[] = [];

	override dispatch(action: SessionAction | TerminalAction | IRootConfigChangedAction): void {
		this.dispatchedActions.push(action);
	}

	private _rootStateValue: RootState | undefined = undefined;
	private readonly _rootStateOnDidChange = new Emitter<RootState>();

	override readonly rootState: IAgentSubscription<RootState> = (() => {
		const self = this;
		return {
			get value() { return self._rootStateValue; },
			get verifiedValue() { return self._rootStateValue; },
			onDidChange: this._rootStateOnDidChange.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	})();

	/** Test helper: set rootState value and fire onDidChange. */
	setRootState(state: RootState): void {
		this._rootStateValue = state;
		this._rootStateOnDidChange.fire(state);
	}

	fireAgentHostStart(): void {
		this._onAgentHostStart.fire();
	}

	dispose(): void {
		this._onAgentHostStart.dispose();
		this._onDidAction.dispose();
		this._onDidNotification.dispose();
		this._rootStateOnDidChange.dispose();
	}
}

// ---- Mock terminal profile resolver (returns a configurable profile) ----

class MockTerminalProfileResolverService extends mock<ITerminalProfileResolverService>() {
	declare readonly _serviceBrand: undefined;

	public profile: ITerminalProfile | Error = {
		profileName: 'Bash',
		path: '/bin/bash',
		args: [],
		isDefault: true,
	};
	public lastOptions: IShellLaunchConfigResolveOptions | undefined;

	override async getDefaultProfile(options: IShellLaunchConfigResolveOptions): Promise<ITerminalProfile> {
		this.lastOptions = options;
		if (this.profile instanceof Error) {
			throw this.profile;
		}
		return this.profile;
	}
}

// ---- Mock terminal profile service (only onDidChangeAvailableProfiles is used) ----

class MockTerminalProfileService extends mock<ITerminalProfileService>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeAvailableProfiles = new Emitter<ITerminalProfile[]>();
	override readonly onDidChangeAvailableProfiles = this._onDidChangeAvailableProfiles.event;

	fireAvailableProfilesChanged(): void {
		this._onDidChangeAvailableProfiles.fire([]);
	}

	dispose(): void {
		this._onDidChangeAvailableProfiles.dispose();
	}
}

// ---- Helpers ----

function makeRootStateWithSchema(properties: Record<string, unknown>): RootState {
	return {
		agents: [],
		config: {
			schema: { type: 'object', properties: properties as Record<string, never> },
			values: {},
		},
	};
}

function rootStateWithDefaultShellKey(): RootState {
	return makeRootStateWithSchema({
		[AgentHostConfigKey.DefaultShell]: { type: 'string', title: 'Default Shell' },
	});
}

function rootStateWithoutDefaultShellKey(): RootState {
	return makeRootStateWithSchema({
		// Schema published by an older / third-party host that doesn't know
		// about defaultShell.
		[AgentHostConfigKey.Customizations]: { type: 'array', title: 'Customizations' },
	});
}

interface ITestSetup {
	contribution: AgentHostTerminalContribution;
	agentHostService: MockAgentHostService;
	resolver: MockTerminalProfileResolverService;
	profileService: MockTerminalProfileService;
	configurationService: TestConfigurationService;
}

function setup(disposables: DisposableStore, agentHostEnabled: boolean = true): ITestSetup {
	const instantiationService = disposables.add(new TestInstantiationService());
	const agentHostService = new MockAgentHostService();
	disposables.add({ dispose: () => agentHostService.dispose() });
	const resolver = new MockTerminalProfileResolverService();
	const profileService = new MockTerminalProfileService();
	disposables.add({ dispose: () => profileService.dispose() });
	const configurationService = new TestConfigurationService({
		[AgentHostEnabledSettingId]: agentHostEnabled,
	});

	instantiationService.stub(IAgentHostService, agentHostService);
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(ITerminalProfileResolverService, resolver);
	instantiationService.stub(ITerminalProfileService, profileService);
	instantiationService.stub(IAgentHostTerminalService, {
		registerEntry: (): IDisposable => ({ dispose() { } }),
		profiles: observableValue('test', []),
	});

	const contribution = disposables.add(instantiationService.createInstance(AgentHostTerminalContribution));
	return { contribution, agentHostService, resolver, profileService, configurationService };
}

/** Wait for any in-flight `_pushDefaultShell` promises to settle. */
async function flush(): Promise<void> {
	// Two microtask hops: one for the await on getDefaultProfile, one for
	// the resolve→dispatch sequence.
	await Promise.resolve();
	await Promise.resolve();
}

// =============================================================================

suite('AgentHostTerminalContribution', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('does not dispatch when chat.agentHost.enabled is false', async () => {
		const { agentHostService } = setup(disposables, /*agentHostEnabled*/ false);

		// Even with a fully-hydrated rootState, nothing should fire because
		// the contribution short-circuits in _updateEnabled.
		agentHostService.setRootState(rootStateWithDefaultShellKey());
		agentHostService.fireAgentHostStart();
		await flush();

		assert.deepStrictEqual(agentHostService.dispatchedActions, []);
	});

	test('does not dispatch while rootState has not hydrated', async () => {
		const { agentHostService } = setup(disposables);

		// rootState.value is undefined — schema gate bails before dispatch.
		agentHostService.fireAgentHostStart();
		await flush();

		assert.deepStrictEqual(agentHostService.dispatchedActions, []);
	});

	test('does not dispatch when host schema does not advertise defaultShell', async () => {
		const { agentHostService } = setup(disposables);

		agentHostService.setRootState(rootStateWithoutDefaultShellKey());
		agentHostService.fireAgentHostStart();
		await flush();

		assert.deepStrictEqual(agentHostService.dispatchedActions, []);
	});

	test('dispatches RootConfigChanged with resolved shell path when host schema includes defaultShell', async () => {
		const { agentHostService, resolver } = setup(disposables);
		resolver.profile = { profileName: 'Git Bash', path: '/usr/bin/bash', args: [], isDefault: true };

		agentHostService.setRootState(rootStateWithDefaultShellKey());
		await flush();

		// The host-start fire from setRootState's onDidChange listener should
		// have produced exactly one dispatch with the resolved path.
		assert.strictEqual(agentHostService.dispatchedActions.length, 1);
		const action = agentHostService.dispatchedActions[0];
		assert.strictEqual(action.type, ActionType.RootConfigChanged);
		assert.deepStrictEqual((action as IRootConfigChangedAction).config, {
			[AgentHostConfigKey.DefaultShell]: '/usr/bin/bash',
		});

		// Resolver should have been called with the agent-host-shell flag.
		assert.strictEqual(resolver.lastOptions?.allowAgentHostShell, true);
		assert.strictEqual(resolver.lastOptions?.os, OS);
	});

	test('retries the push when rootState hydrates after agentHostStart', async () => {
		const { agentHostService } = setup(disposables);

		// Initial start happens before rootState hydration — push is gated.
		agentHostService.fireAgentHostStart();
		await flush();
		assert.deepStrictEqual(agentHostService.dispatchedActions, []);

		// Schema arrives — onDidChange listener triggers the retry.
		agentHostService.setRootState(rootStateWithDefaultShellKey());
		await flush();

		assert.strictEqual(agentHostService.dispatchedActions.length, 1);
	});

	test('re-dispatches when an agent-host-shell-dependent setting changes', async () => {
		const { agentHostService, resolver, configurationService } = setup(disposables);
		agentHostService.setRootState(rootStateWithDefaultShellKey());
		await flush();
		const initialCount = agentHostService.dispatchedActions.length;
		assert.strictEqual(initialCount, 1);

		// User changes their agent-host profile setting.
		resolver.profile = { profileName: 'PowerShell', path: '/usr/bin/pwsh', args: [], isDefault: true };
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectedKeys: new Set([TerminalSettingId.AgentHostProfileLinux]),
			affectsConfiguration: (key: string) => key === TerminalSettingId.AgentHostProfileLinux,
			source: 1, // ConfigurationTarget.USER
			change: { keys: [TerminalSettingId.AgentHostProfileLinux], overrides: [] },
		});
		await flush();

		assert.strictEqual(agentHostService.dispatchedActions.length, initialCount + 1);
		const last = agentHostService.dispatchedActions[agentHostService.dispatchedActions.length - 1];
		assert.deepStrictEqual((last as IRootConfigChangedAction).config, {
			[AgentHostConfigKey.DefaultShell]: '/usr/bin/pwsh',
		});
	});

	test('re-dispatches when terminal profiles become available', async () => {
		const { agentHostService, profileService } = setup(disposables);
		agentHostService.setRootState(rootStateWithDefaultShellKey());
		await flush();
		const initialCount = agentHostService.dispatchedActions.length;

		// Profile detection finished (e.g. cold-start race).
		profileService.fireAvailableProfilesChanged();
		await flush();

		assert.strictEqual(agentHostService.dispatchedActions.length, initialCount + 1);
	});

	test('skips dispatch when the resolver returns a profile without a path', async () => {
		const { agentHostService, resolver } = setup(disposables);
		resolver.profile = { profileName: 'Empty', path: '', args: [], isDefault: false };

		agentHostService.setRootState(rootStateWithDefaultShellKey());
		await flush();

		assert.deepStrictEqual(agentHostService.dispatchedActions, []);
	});

	test('skips dispatch when the resolver throws', async () => {
		const { agentHostService, resolver } = setup(disposables);
		resolver.profile = new Error('resolver failed');

		agentHostService.setRootState(rootStateWithDefaultShellKey());
		await flush();

		assert.deepStrictEqual(agentHostService.dispatchedActions, []);
	});

	test('uses the local OS when resolving the profile', async () => {
		const { agentHostService, resolver } = setup(disposables);
		agentHostService.setRootState(rootStateWithDefaultShellKey());
		await flush();

		assert.strictEqual(resolver.lastOptions?.os, OS as OperatingSystem);
		assert.strictEqual(resolver.lastOptions?.remoteAuthority, undefined);
	});
});
