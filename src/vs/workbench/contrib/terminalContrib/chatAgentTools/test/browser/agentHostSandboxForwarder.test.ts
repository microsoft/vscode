/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { AgentHostSdkSandboxEnabledSettingId, IAgentConnection, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AgentHostCustomTerminalToolEnabledSettingId } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostConnectionsService } from '../../../../../../platform/agentHost/browser/agentHostConnectionsService.js';
import { IRemoteAgentHostService, IRemoteAgentHostConnectionInfo } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey } from '../../../../../../platform/agentHost/common/sandboxConfigSchema.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { ActionEnvelope, IRootConfigChangedAction, INotification, SessionAction, TerminalAction, ClientAnnotationsAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentNetworkDomainSettingId } from '../../../../../../platform/networkFilter/common/settings.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../../../../../platform/sandbox/common/settings.js';
import { AgentHostSandboxForwarder } from '../../browser/agentHostSandboxForwarder.js';

// ---- Mocks ------------------------------------------------------------------

class MockAgentConnection {
	declare readonly _serviceBrand: undefined;

	public readonly clientId = 'mock-client';
	public dispatched: (SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction)[] = [];

	private _rootStateValue: RootState | undefined;
	private readonly _rootStateOnDidChange = new Emitter<RootState>();

	readonly rootState: IAgentSubscription<RootState> = (() => {
		const self = this;
		return {
			get value() { return self._rootStateValue; },
			get verifiedValue() { return self._rootStateValue; },
			onDidChange: this._rootStateOnDidChange.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	})();

	readonly onDidAction: Event<ActionEnvelope> = Event.None;
	readonly onDidNotification: Event<INotification> = Event.None;

	dispatch(_channel: string, action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
		this.dispatched.push(action);
	}

	setRootState(state: RootState | undefined): void {
		this._rootStateValue = state;
		if (state) {
			this._rootStateOnDidChange.fire(state);
		}
	}

	dispose(): void {
		this._rootStateOnDidChange.dispose();
	}
}

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;
	public readonly inner = new MockAgentConnection();

	override readonly clientId = this.inner.clientId;
	override readonly onAgentHostStart = Event.None;
	override readonly onAgentHostExit = Event.None;
	override readonly onDidAction = this.inner.onDidAction;
	override readonly onDidNotification = this.inner.onDidNotification;
	override readonly rootState = this.inner.rootState;

	override dispatch(channel: string, action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
		this.inner.dispatch(channel, action);
	}

	get dispatched(): readonly (SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction)[] {
		return this.inner.dispatched;
	}

	setRootState(state: RootState | undefined): void {
		this.inner.setRootState(state);
	}

	dispose(): void {
		this.inner.dispose();
	}
}

class MockRemoteAgentHostService extends mock<IRemoteAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = new Emitter<void>();
	override readonly onDidChangeConnections = this._onDidChangeConnections.event;

	private _connections: IRemoteAgentHostConnectionInfo[] = [];
	private readonly _byAddress = new Map<string, MockAgentConnection>();

	override get connections(): readonly IRemoteAgentHostConnectionInfo[] {
		return this._connections;
	}

	override getConnection(address: string): IAgentConnection | undefined {
		return this._byAddress.get(address) as unknown as IAgentConnection | undefined;
	}

	addConnection(address: string): MockAgentConnection {
		const conn = new MockAgentConnection();
		this._byAddress.set(address, conn);
		this._connections = [...this._connections, { address, name: address, clientId: conn.clientId, status: { kind: 'connected' } }];
		this._onDidChangeConnections.fire();
		return conn;
	}

	removeConnection(address: string): void {
		const conn = this._byAddress.get(address);
		conn?.dispose();
		this._byAddress.delete(address);
		this._connections = this._connections.filter(c => c.address !== address);
		this._onDidChangeConnections.fire();
	}

	dispose(): void {
		for (const conn of this._byAddress.values()) {
			conn.dispose();
		}
		this._byAddress.clear();
		this._onDidChangeConnections.dispose();
	}
}

// ---- Helpers ----------------------------------------------------------------

function rootStateWithSandboxSchema(sandbox: Record<string, unknown> = {}): RootState {
	return {
		agents: [],
		config: {
			schema: {
				type: 'object',
				properties: {
					[AgentHostSandboxConfigKey.Sandbox]: { type: 'object', title: 'Agent Sandbox' },
				},
			},
			values: { [AgentHostSandboxConfigKey.Sandbox]: sandbox },
		},
	};
}

function rootStateWithoutSandboxSchema(): RootState {
	return {
		agents: [],
		config: {
			schema: {
				type: 'object',
				// Older / third-party host that doesn't advertise sandbox keys.
				properties: { customizations: { type: 'array', title: 'Customizations' } },
			},
			values: {},
		},
	};
}

interface ITestSetup {
	forwarder: AgentHostSandboxForwarder;
	local: MockAgentHostService;
	remote: MockRemoteAgentHostService;
	configurationService: TestConfigurationService;
}

function setup(disposables: DisposableStore, configValues: Record<string, unknown> = {}): ITestSetup {
	const instantiationService = disposables.add(new TestInstantiationService());
	const local = new MockAgentHostService();
	disposables.add({ dispose: () => local.dispose() });
	const remote = new MockRemoteAgentHostService();
	disposables.add({ dispose: () => remote.dispose() });
	// Default the host-policy gates to "engine path" so existing tests that
	// only set `chat.agent.sandbox.*` continue to assert against the user's
	// raw forwarded values. The SDK-sandbox gating sub-suite below overrides
	// both gates explicitly to exercise the other branches.
	const configurationService = new TestConfigurationService({
		[AgentHostCustomTerminalToolEnabledSettingId]: true,
		...configValues,
	});

	instantiationService.stub(IAgentHostService, local);
	instantiationService.stub(IRemoteAgentHostService, remote);
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(ILogService, new NullLogService());
	const connectionsService = disposables.add(instantiationService.createInstance(AgentHostConnectionsService));
	instantiationService.stub(IAgentHostConnectionsService, connectionsService);

	const forwarder = disposables.add(instantiationService.createInstance(AgentHostSandboxForwarder));
	return { forwarder, local, remote, configurationService };
}

// =============================================================================

suite('AgentHostSandboxForwarder', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('does not dispatch while rootState is unhydrated', () => {
		const { local } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
		assert.deepStrictEqual(local.dispatched, []);
	});

	test('dispatches sandbox values to the local host when rootState hydrates', () => {
		const { local } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });

		local.setRootState(rootStateWithSandboxSchema());

		assert.deepStrictEqual(local.dispatched, [{
			type: ActionType.RootConfigChanged,
			config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } },
		}]);
	});

	test('schema-guards keys: skips keys the host does not advertise', () => {
		const { local } = setup(disposables, {
			[AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
			[AgentNetworkDomainSettingId.AllowedNetworkDomains]: ['example.com'],
		});

		local.setRootState(rootStateWithoutSandboxSchema());

		assert.deepStrictEqual(local.dispatched, []);
	});

	test('skips no-op dispatch when rootState already matches workbench values', () => {
		const { local } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });

		local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));

		assert.deepStrictEqual(local.dispatched, []);
	});

	test('re-dispatches when the workbench sandbox setting changes', () => {
		const { local, configurationService } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });

		local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
		// Initial state already matches → no dispatch.
		assert.deepStrictEqual(local.dispatched, []);

		configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.AllowNetwork);
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectsConfiguration: (key: string) => key === AgentSandboxSettingId.AgentSandboxEnabled,
			affectedKeys: new Set([AgentSandboxSettingId.AgentSandboxEnabled]),
			change: { keys: [AgentSandboxSettingId.AgentSandboxEnabled], overrides: [] },
		});

		assert.deepStrictEqual(local.dispatched, [{
			type: ActionType.RootConfigChanged,
			config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.AllowNetwork } },
		}]);
	});

	test('dispatches to remote connections when they appear', () => {
		const { remote } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });

		const remoteConn = remote.addConnection('remote.example:9000');
		remoteConn.setRootState(rootStateWithSandboxSchema());

		assert.deepStrictEqual(remoteConn.dispatched, [{
			type: ActionType.RootConfigChanged,
			config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } },
		}]);
	});

	test('fans out workbench setting changes to all connected agent hosts', () => {
		const { local, remote, configurationService } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
		local.setRootState(rootStateWithSandboxSchema());
		const remoteConn = remote.addConnection('remote.example:9000');
		remoteConn.setRootState(rootStateWithSandboxSchema());

		configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, true);
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectsConfiguration: (key: string) => key === AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands,
			affectedKeys: new Set([AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]),
			change: { keys: [AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands], overrides: [] },
		});

		const expectedPatch = {
			type: ActionType.RootConfigChanged,
			config: {
				[AgentHostSandboxConfigKey.Sandbox]: {
					[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
					[AgentHostSandboxKey.AllowUnsandboxedCommands]: true,
				},
			},
		};
		assert.deepStrictEqual(local.dispatched.at(-1), expectedPatch);
		assert.deepStrictEqual(remoteConn.dispatched.at(-1), expectedPatch);
	});

	test('ignores unrelated configuration changes', () => {
		const { local, configurationService } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
		local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
		assert.deepStrictEqual(local.dispatched, []);

		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectsConfiguration: (key: string) => key === 'editor.fontSize',
			affectedKeys: new Set(['editor.fontSize']),
			change: { keys: ['editor.fontSize'], overrides: [] },
		});

		assert.deepStrictEqual(local.dispatched, []);
	});

	test('does not push back after initial push when the host updates rootState', () => {
		const { local } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });

		// Initial hydration triggers exactly one push.
		local.setRootState(rootStateWithSandboxSchema());
		assert.strictEqual(local.dispatched.length, 1);

		// Subsequent rootState changes from the host side (different sandbox
		// values, unrelated config keys, anything) must NOT trigger another
		// push — that's the push-back loop the forwarder is designed to avoid.
		local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.Off }));
		local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.AllowUnsandboxedCommands]: true }));
		local.setRootState(rootStateWithSandboxSchema());

		assert.strictEqual(local.dispatched.length, 1);
	});

	test('does not re-push to existing connections when a new remote appears', () => {
		const { local, remote } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });
		local.setRootState(rootStateWithSandboxSchema());
		assert.strictEqual(local.dispatched.length, 1);

		const firstRemote = remote.addConnection('remote-a.example:9000');
		firstRemote.setRootState(rootStateWithSandboxSchema());
		assert.strictEqual(firstRemote.dispatched.length, 1);
		assert.strictEqual(local.dispatched.length, 1);

		// Adding a second remote must not cause a redundant push to the local
		// host or to the already-pushed first remote.
		const secondRemote = remote.addConnection('remote-b.example:9000');
		secondRemote.setRootState(rootStateWithSandboxSchema());

		assert.strictEqual(local.dispatched.length, 1);
		assert.strictEqual(firstRemote.dispatched.length, 1);
		assert.strictEqual(secondRemote.dispatched.length, 1);
	});

	test('cleans up the pending listener when a remote disconnects before hydrating', () => {
		const { remote } = setup(disposables, { [AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On });

		const remoteConn = remote.addConnection('remote.example:9000');
		// Connection never hydrates → forwarder is still subscribed to its
		// rootState.onDidChange waiting for the schema.
		assert.deepStrictEqual(remoteConn.dispatched, []);

		remote.removeConnection('remote.example:9000');
		// If the listener wasn't disposed, the leak checker (see
		// ensureNoDisposablesAreLeakedInTestSuite) would flag it at teardown.
		// Firing here would also throw if the connection was still observed
		// after removal — explicitly assert no late dispatch happens.
		remoteConn.setRootState(rootStateWithSandboxSchema());
		assert.deepStrictEqual(remoteConn.dispatched, []);
	});

	suite('SDK-sandbox gating', () => {
		test('forwards user values verbatim when customTerminalTool is enabled, regardless of sdkSandbox', () => {
			const { local } = setup(disposables, {
				[AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.AllowNetwork,
				[AgentHostCustomTerminalToolEnabledSettingId]: true,
				[AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.Off,
			});

			local.setRootState(rootStateWithSandboxSchema());

			assert.deepStrictEqual(local.dispatched, [{
				type: ActionType.RootConfigChanged,
				config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.AllowNetwork } },
			}]);
		});

		test('forwards an empty sandbox object when both customTerminalTool and sdkSandbox are off (default)', () => {
			const { local } = setup(disposables, {
				[AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
				[AgentHostCustomTerminalToolEnabledSettingId]: false,
				// sdkSandbox unset → defaults to 'off'.
			});

			// Host already carries values from a prior session.
			local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));

			assert.deepStrictEqual(local.dispatched, [{
				type: ActionType.RootConfigChanged,
				config: { [AgentHostSandboxConfigKey.Sandbox]: {} },
			}]);
		});

		test('overrides Enabled/WindowsEnabled with the sdkSandbox value when set to `on`', () => {
			const { local } = setup(disposables, {
				// User has the engine sandbox off entirely — the SDK sandbox
				// setting should still drive the SDK path independently.
				[AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.Off,
				[AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands]: true,
				[AgentHostCustomTerminalToolEnabledSettingId]: false,
				[AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.On,
			});

			local.setRootState(rootStateWithSandboxSchema());

			assert.deepStrictEqual(local.dispatched, [{
				type: ActionType.RootConfigChanged,
				config: {
					[AgentHostSandboxConfigKey.Sandbox]: {
						[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
						[AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.On,
						[AgentHostSandboxKey.AllowUnsandboxedCommands]: true,
					},
				},
			}]);
		});

		test('overrides Enabled/WindowsEnabled with `allowNetwork` when sdkSandbox is set to that', () => {
			const { local } = setup(disposables, {
				[AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
				[AgentHostCustomTerminalToolEnabledSettingId]: false,
				[AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.AllowNetwork,
			});

			local.setRootState(rootStateWithSandboxSchema());

			assert.deepStrictEqual(local.dispatched, [{
				type: ActionType.RootConfigChanged,
				config: {
					[AgentHostSandboxConfigKey.Sandbox]: {
						[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.AllowNetwork,
						[AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.AllowNetwork,
					},
				},
			}]);
		});

		test('re-dispatches when sdkSandbox toggles from `on` to `off`', () => {
			const { local, configurationService } = setup(disposables, {
				[AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
				[AgentHostCustomTerminalToolEnabledSettingId]: false,
				[AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.On,
			});
			local.setRootState(rootStateWithSandboxSchema({
				[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
				[AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.On,
			}));
			// Initial state already matches → no dispatch.
			assert.deepStrictEqual(local.dispatched, []);

			configurationService.setUserConfiguration(AgentHostSdkSandboxEnabledSettingId, AgentSandboxEnabledValue.Off);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectsConfiguration: (key: string) => key === AgentHostSdkSandboxEnabledSettingId,
				affectedKeys: new Set([AgentHostSdkSandboxEnabledSettingId]),
				change: { keys: [AgentHostSdkSandboxEnabledSettingId], overrides: [] },
			});

			assert.deepStrictEqual(local.dispatched, [{
				type: ActionType.RootConfigChanged,
				config: { [AgentHostSandboxConfigKey.Sandbox]: {} },
			}]);
		});

		test('re-dispatches when sdkSandbox switches between `on` and `allowNetwork`', () => {
			const { local, configurationService } = setup(disposables, {
				[AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
				[AgentHostCustomTerminalToolEnabledSettingId]: false,
				[AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.On,
			});
			local.setRootState(rootStateWithSandboxSchema({
				[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On,
				[AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.On,
			}));
			assert.deepStrictEqual(local.dispatched, []);

			configurationService.setUserConfiguration(AgentHostSdkSandboxEnabledSettingId, AgentSandboxEnabledValue.AllowNetwork);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectsConfiguration: (key: string) => key === AgentHostSdkSandboxEnabledSettingId,
				affectedKeys: new Set([AgentHostSdkSandboxEnabledSettingId]),
				change: { keys: [AgentHostSdkSandboxEnabledSettingId], overrides: [] },
			});

			assert.deepStrictEqual(local.dispatched, [{
				type: ActionType.RootConfigChanged,
				config: {
					[AgentHostSandboxConfigKey.Sandbox]: {
						[AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.AllowNetwork,
						[AgentHostSandboxKey.WindowsEnabled]: AgentSandboxEnabledValue.AllowNetwork,
					},
				},
			}]);
		});

		test('re-dispatches when customTerminalTool is toggled while sdkSandbox is off', () => {
			const { local, configurationService } = setup(disposables, {
				[AgentSandboxSettingId.AgentSandboxEnabled]: AgentSandboxEnabledValue.On,
				[AgentHostCustomTerminalToolEnabledSettingId]: false,
				[AgentHostSdkSandboxEnabledSettingId]: AgentSandboxEnabledValue.Off,
			});
			// Both gates off → forwarder pushes `{}`, which clears the host's
			// prior value.
			local.setRootState(rootStateWithSandboxSchema({ [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On }));
			assert.deepStrictEqual(local.dispatched, [{
				type: ActionType.RootConfigChanged,
				config: { [AgentHostSandboxConfigKey.Sandbox]: {} },
			}]);

			// Simulate the host applying that dispatch (the mock does not do this
			// automatically). Without this, the equals-check inside _tryPush would
			// short-circuit the second push because the host's view of the sandbox
			// values would still be the stale pre-clear value.
			local.setRootState(rootStateWithSandboxSchema({}));

			// Flip customTerminalTool ON → forwarder should push the real
			// sandbox values verbatim (engine path needs them).
			configurationService.setUserConfiguration(AgentHostCustomTerminalToolEnabledSettingId, true);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectsConfiguration: (key: string) => key === AgentHostCustomTerminalToolEnabledSettingId,
				affectedKeys: new Set([AgentHostCustomTerminalToolEnabledSettingId]),
				change: { keys: [AgentHostCustomTerminalToolEnabledSettingId], overrides: [] },
			});

			assert.deepStrictEqual(local.dispatched.at(-1), {
				type: ActionType.RootConfigChanged,
				config: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } },
			});
		});
	});
});
