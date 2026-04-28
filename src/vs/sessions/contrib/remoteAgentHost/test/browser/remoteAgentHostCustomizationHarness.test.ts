/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { type IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { ActionType, type ActionEnvelope, type INotification, type StateAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { CustomizationStatus, type AgentInfo, type CustomizationRef, type RootState, type SessionCustomization } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService, type IFileStatResult } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAICustomizationWorkspaceService } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';
import { RemoteAgentCustomizationItemProvider, RemoteAgentPluginController } from '../../browser/remoteAgentHostCustomizationHarness.js';

class MockAgentConnection extends mock<IAgentConnection>() {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAction = new Emitter<ActionEnvelope>();
	override readonly onDidAction = this._onDidAction.event;
	override readonly onDidNotification = Event.None as Event<INotification>;
	override readonly clientId = 'test-client';

	private _rootStateValue: RootState = { agents: [] };
	override readonly rootState;

	readonly dispatchedActions: StateAction[] = [];

	constructor() {
		super();
		const self = this;
		this.rootState = {
			get value(): RootState { return self._rootStateValue; },
			get verifiedValue(): RootState { return self._rootStateValue; },
			onDidChange: Event.None,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	}

	setRootState(rootState: RootState): void {
		this._rootStateValue = rootState;
	}

	override dispatch(action: StateAction): void {
		this.dispatchedActions.push(action);
	}

	fireAction(envelope: ActionEnvelope): void {
		this._onDidAction.fire(envelope);
	}

	dispose(): void {
		this._onDidAction.dispose();
	}
}

function createNotificationService(): INotificationService {
	return new class extends mock<INotificationService>() {
		override error(): never {
			throw new Error('Unexpected notification error');
		}
	};
}

function createAgentInfo(customizations: readonly CustomizationRef[]): AgentInfo {
	return {
		provider: 'copilotcli',
		displayName: 'Copilot',
		description: 'Test Agent',
		models: [],
		customizations: [...customizations],
	};
}

suite('RemoteAgentHostCustomizationHarness', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('removeConfiguredPlugin keeps sibling scopes for the same URI', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const controller = disposables.add(new RemoteAgentPluginController(
			'Test Host',
			'test-authority',
			connection,
			{} as IFileDialogService,
			createNotificationService(),
			{} as IAICustomizationWorkspaceService,
		));
		const pluginA: CustomizationRef = { uri: 'file:///plugins/shared', displayName: 'Shared Plugin' };
		const pluginB: CustomizationRef = {
			uri: 'file:///plugins/other',
			displayName: 'Other Plugin',
		};
		connection.setRootState({
			agents: [],
			config: {
				schema: { type: 'object', properties: {} },
				values: { customizations: [pluginA, pluginB] },
			},
		});

		await controller.removeConfiguredPlugin(pluginA);

		assert.deepStrictEqual(connection.dispatchedActions, [{
			type: ActionType.RootConfigChanged,
			config: {
				customizations: [pluginB],
			},
		}]);
	});

	test('provider assigns distinct item keys to plugins with different URIs', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const controller = disposables.add(new RemoteAgentPluginController(
			'Test Host',
			'test-authority',
			connection,
			{} as IFileDialogService,
			createNotificationService(),
			{} as IAICustomizationWorkspaceService,
		));
		const pluginA: CustomizationRef = { uri: 'file:///plugins/a', displayName: 'Plugin A' };
		const pluginB: CustomizationRef = { uri: 'file:///plugins/b', displayName: 'Plugin B' };

		connection.setRootState({
			agents: [createAgentInfo([pluginA, pluginB])],
		});

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new RemoteAgentCustomizationItemProvider(
			createAgentInfo([pluginA, pluginB]),
			connection,
			'test-authority',
			controller,
			fileService,
			new NullLogService(),
		));

		const items = await provider.provideChatSessionCustomizations(CancellationToken.None);
		assert.strictEqual(items.length, 2);
		assert.notStrictEqual(items[0].itemKey, items[1].itemKey);
	});

	test('provider keeps client-synced entries distinct from host-owned entries', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const controller = disposables.add(new RemoteAgentPluginController(
			'Test Host',
			'test-authority',
			connection,
			{} as IFileDialogService,
			createNotificationService(),
			{} as IAICustomizationWorkspaceService,
		));
		const hostScoped: CustomizationRef = { uri: 'file:///plugins/shared', displayName: 'Shared Plugin' };
		const synced: SessionCustomization = {
			customization: hostScoped,
			clientId: 'test-client',
			enabled: true,
		};

		connection.setRootState({
			agents: [createAgentInfo([hostScoped])],
		});

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new RemoteAgentCustomizationItemProvider(
			createAgentInfo([hostScoped]),
			connection,
			'test-authority',
			controller,
			fileService,
			new NullLogService(),
		));

		connection.fireAction({
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				session: 'agent://copilotcli/session-1',
				customizations: [synced],
			},
		});

		const items = await provider.provideChatSessionCustomizations(CancellationToken.None);
		assert.strictEqual(items.length, 2);
		assert.notStrictEqual(items[0].itemKey, items[1].itemKey);
	});

	test('provider assigns client group to client-synced entries and host group to host entries', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const controller = disposables.add(new RemoteAgentPluginController(
			'Test Host',
			'test-authority',
			connection,
			{} as IFileDialogService,
			createNotificationService(),
			{} as IAICustomizationWorkspaceService,
		));
		const hostPlugin: CustomizationRef = { uri: 'file:///plugins/host-plugin', displayName: 'Host Plugin' };
		const clientPlugin: CustomizationRef = { uri: 'file:///plugins/client-plugin', displayName: 'Client Plugin' };
		const synced: SessionCustomization = {
			customization: clientPlugin,
			clientId: 'test-client',
			enabled: true,
		};

		connection.setRootState({
			agents: [createAgentInfo([hostPlugin])],
		});

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new RemoteAgentCustomizationItemProvider(
			createAgentInfo([hostPlugin]),
			connection,
			'test-authority',
			controller,
			fileService,
			new NullLogService(),
		));

		connection.fireAction({
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				session: 'agent://copilotcli/session-1',
				customizations: [synced],
			},
		});

		const items = await provider.provideChatSessionCustomizations(CancellationToken.None);
		assert.strictEqual(items.length, 2);

		const hostItem = items.find(i => i.name === 'Host Plugin');
		const clientItem = items.find(i => i.name === 'Client Plugin');
		assert.ok(hostItem, 'should have a host item');
		assert.ok(clientItem, 'should have a client item');
		assert.strictEqual(hostItem.groupKey, 'remote-host');
		assert.strictEqual(clientItem.groupKey, 'remote-client');
	});

	test('provider hides synthetic bundle but still expands its contents', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const controller = disposables.add(new RemoteAgentPluginController(
			'Test Host',
			'test-authority',
			connection,
			{} as IFileDialogService,
			createNotificationService(),
			{} as IAICustomizationWorkspaceService,
		));

		const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
		const bundleRef: CustomizationRef = { uri: bundleUri, displayName: 'VS Code Synced Data', nonce: 'abc' };
		const synced: SessionCustomization = {
			customization: bundleRef,
			clientId: 'test-client',
			enabled: true,
			status: CustomizationStatus.Loaded,
		};

		connection.setRootState({ agents: [createAgentInfo([])] });

		// Mock file service that returns a skills directory with one child
		const skillFileUri = URI.parse(`${bundleUri}/skills/my-skill`);
		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return true; }
			override async resolveAll(resources: { resource: URI }[]): Promise<IFileStatResult[]> {
				return resources.map(r => {
					if (r.resource.path.endsWith('/skills')) {
						return {
							success: true,
							stat: {
								resource: r.resource,
								name: 'skills',
								isFile: false,
								isDirectory: true,
								isSymbolicLink: false,
								readonly: false,
								mtime: 0,
								ctime: 0,
								size: 0,
								children: [{
									name: 'my-skill',
									resource: skillFileUri,
									isFile: false,
									isDirectory: true,
									isSymbolicLink: false,
									readonly: false,
									mtime: 0,
									ctime: 0,
									size: 0,
									children: [],
								}],
							},
						} satisfies IFileStatResult;
					}
					return { success: false, stat: undefined } as unknown as IFileStatResult;
				});
			}
		};

		const provider = disposables.add(new RemoteAgentCustomizationItemProvider(
			createAgentInfo([]),
			connection,
			'test-authority',
			controller,
			fileService,
			new NullLogService(),
		));

		connection.fireAction({
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				session: 'agent://copilotcli/session-1',
				customizations: [synced],
			},
		});

		const items = await provider.provideChatSessionCustomizations(CancellationToken.None);
		// The synthetic bundle itself should NOT appear as a top-level item
		assert.ok(!items.some(i => i.name === 'VS Code Synced Data'), 'synthetic bundle should be hidden');
		// But its expanded child should appear
		const skillItem = items.find(i => i.name === 'my-skill');
		assert.ok(skillItem, 'expanded skill from bundle should be present');
		assert.strictEqual(skillItem.groupKey, 'remote-client', 'expanded children from bundle should be in client group');
	});

	test('toRemoteUri preserves synced-customization scheme URIs', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const controller = disposables.add(new RemoteAgentPluginController(
			'Test Host',
			'test-authority',
			connection,
			{} as IFileDialogService,
			createNotificationService(),
			{} as IAICustomizationWorkspaceService,
		));

		const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
		const bundleRef: CustomizationRef = { uri: bundleUri, displayName: 'VS Code Synced Data', nonce: 'abc' };
		const synced: SessionCustomization = {
			customization: bundleRef,
			clientId: 'test-client',
			enabled: true,
		};

		connection.setRootState({ agents: [createAgentInfo([])] });

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new RemoteAgentCustomizationItemProvider(
			createAgentInfo([]),
			connection,
			'test-authority',
			controller,
			fileService,
			new NullLogService(),
		));

		connection.fireAction({
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				session: 'agent://copilotcli/session-1',
				customizations: [synced],
			},
		});

		const items = await provider.provideChatSessionCustomizations(CancellationToken.None);
		// No top-level item (bundle is hidden), but check that plugin expansion
		// attempted with the original scheme — not agent-host://
		// This is verified indirectly: canHandleResource returns false so
		// no children are produced, but importantly no crash occurred
		// (toAgentHostUri would throw for this scheme).
		assert.strictEqual(items.length, 0);
	});

	test('provider propagates status and enabled from session customizations', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const controller = disposables.add(new RemoteAgentPluginController(
			'Test Host',
			'test-authority',
			connection,
			{} as IFileDialogService,
			createNotificationService(),
			{} as IAICustomizationWorkspaceService,
		));

		const pluginRef: CustomizationRef = { uri: 'file:///plugins/my-plugin', displayName: 'My Plugin' };
		const sessionCustomization: SessionCustomization = {
			customization: pluginRef,
			enabled: false,
			status: CustomizationStatus.Error,
			statusMessage: 'something went wrong',
		};

		connection.setRootState({ agents: [createAgentInfo([pluginRef])] });

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new RemoteAgentCustomizationItemProvider(
			createAgentInfo([pluginRef]),
			connection,
			'test-authority',
			controller,
			fileService,
			new NullLogService(),
		));

		connection.fireAction({
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				session: 'agent://copilotcli/session-1',
				customizations: [sessionCustomization],
			},
		});

		const items = await provider.provideChatSessionCustomizations(CancellationToken.None);
		// Host-scoped plugin from root + session customization → merged into one entry
		// The session customization entry updates status/statusMessage
		const sessionItem = items.find(i => i.status === 'error');
		assert.ok(sessionItem, 'should have an item with error status');
		assert.strictEqual(sessionItem.statusMessage, 'something went wrong');
	});

	test('provider fires change event on SessionCustomizationsChanged action', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const controller = disposables.add(new RemoteAgentPluginController(
			'Test Host',
			'test-authority',
			connection,
			{} as IFileDialogService,
			createNotificationService(),
			{} as IAICustomizationWorkspaceService,
		));

		const pluginRef: CustomizationRef = { uri: 'file:///plugins/host', displayName: 'Host Plugin' };
		connection.setRootState({ agents: [createAgentInfo([pluginRef])] });

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new RemoteAgentCustomizationItemProvider(
			createAgentInfo([pluginRef]),
			connection,
			'test-authority',
			controller,
			fileService,
			new NullLogService(),
		));

		let changeCount = 0;
		disposables.add(provider.onDidChange(() => changeCount++));

		connection.fireAction({
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				session: 'agent://copilotcli/session-1',
				customizations: [{
					customization: pluginRef,
					enabled: true,
				}],
			},
		});

		assert.strictEqual(changeCount, 1, 'should fire change event on session customization action');
	});

	test('provider does not show remove action for client-synced plugins', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const controller = disposables.add(new RemoteAgentPluginController(
			'Test Host',
			'test-authority',
			connection,
			{} as IFileDialogService,
			createNotificationService(),
			{} as IAICustomizationWorkspaceService,
		));

		const hostPlugin: CustomizationRef = { uri: 'file:///plugins/host', displayName: 'Host Plugin' };
		const clientPlugin: CustomizationRef = { uri: 'file:///plugins/client', displayName: 'Client Plugin' };

		connection.setRootState({ agents: [createAgentInfo([hostPlugin])] });

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new RemoteAgentCustomizationItemProvider(
			createAgentInfo([hostPlugin]),
			connection,
			'test-authority',
			controller,
			fileService,
			new NullLogService(),
		));

		connection.fireAction({
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				session: 'agent://copilotcli/session-1',
				customizations: [{
					customization: clientPlugin,
					clientId: 'test-client',
					enabled: true,
				}],
			},
		});

		const items = await provider.provideChatSessionCustomizations(CancellationToken.None);
		const hostItem = items.find(i => i.name === 'Host Plugin');
		const clientItem = items.find(i => i.name === 'Client Plugin');

		assert.ok(hostItem, 'should have host item');
		assert.ok(clientItem, 'should have client item');
		assert.ok(hostItem.actions && hostItem.actions.length > 0, 'host item should have remove action');
		assert.strictEqual(clientItem.actions, undefined, 'client item should have no actions');
	});

	test('removeConfiguredPlugin dispatches updated list without the removed plugin', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const controller = disposables.add(new RemoteAgentPluginController(
			'Test Host',
			'test-authority',
			connection,
			{} as IFileDialogService,
			createNotificationService(),
			{} as IAICustomizationWorkspaceService,
		));

		const pluginA: CustomizationRef = { uri: 'file:///plugins/a', displayName: 'Plugin A' };
		const pluginB: CustomizationRef = { uri: 'file:///plugins/b', displayName: 'Plugin B' };
		const pluginC: CustomizationRef = { uri: 'file:///plugins/c', displayName: 'Plugin C' };

		connection.setRootState({
			agents: [],
			config: {
				schema: { type: 'object', properties: {} },
				values: { customizations: [pluginA, pluginB, pluginC] },
			},
		});

		await controller.removeConfiguredPlugin(pluginB);

		assert.strictEqual(connection.dispatchedActions.length, 1);
		assert.deepStrictEqual(connection.dispatchedActions[0], {
			type: ActionType.RootConfigChanged,
			config: {
				customizations: [pluginA, pluginC],
			},
		});
	});

	test('multiple client-synced entries all appear with distinct keys', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const controller = disposables.add(new RemoteAgentPluginController(
			'Test Host',
			'test-authority',
			connection,
			{} as IFileDialogService,
			createNotificationService(),
			{} as IAICustomizationWorkspaceService,
		));

		const clientA: CustomizationRef = { uri: 'file:///plugins/client-a', displayName: 'Client A' };
		const clientB: CustomizationRef = { uri: 'file:///plugins/client-b', displayName: 'Client B' };

		connection.setRootState({ agents: [createAgentInfo([])] });

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new RemoteAgentCustomizationItemProvider(
			createAgentInfo([]),
			connection,
			'test-authority',
			controller,
			fileService,
			new NullLogService(),
		));

		connection.fireAction({
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				session: 'agent://copilotcli/session-1',
				customizations: [
					{ customization: clientA, clientId: 'test-client', enabled: true },
					{ customization: clientB, clientId: 'test-client', enabled: true },
				],
			},
		});

		const items = await provider.provideChatSessionCustomizations(CancellationToken.None);
		assert.strictEqual(items.length, 2);
		assert.ok(items.find(i => i.name === 'Client A'), 'should have Client A');
		assert.ok(items.find(i => i.name === 'Client B'), 'should have Client B');
		const keys = items.map(i => i.itemKey);
		assert.strictEqual(new Set(keys).size, 2, 'all item keys should be unique');
	});
});
