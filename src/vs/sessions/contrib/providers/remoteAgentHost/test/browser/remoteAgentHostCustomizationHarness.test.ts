/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType, isSessionAction, type ActionEnvelope, type INotification, type StateAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { CustomizationLoadStatus, CustomizationType, type AgentInfo, type Customization, type RootState, type SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { StateComponents, type ComponentToState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { sessionReducer } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { type IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { IFileService, type IFileContent, type IFileStat, type IFileStatResult } from '../../../../../../platform/files/common/files.js';
import { PromptsType } from '../../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IAICustomizationWorkspaceService } from '../../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';
import { RemoteAgentPluginController } from '../../browser/remoteAgentHostCustomizationHarness.js';
import { CustomizationHarnessServiceBase, IHarnessDescriptor } from '../../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { MockPromptsService } from '../../../../../../workbench/contrib/chat/test/common/promptSyntax/service/mockPromptsService.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IAgentHostCustomizationService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentCustomizationItemProvider } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { ContributionEnablementState } from '../../../../../../workbench/contrib/chat/common/enablement.js';

class MockAgentConnection extends mock<IAgentConnection>() {

	private readonly _onDidAction = new Emitter<ActionEnvelope>();
	override readonly onDidAction = this._onDidAction.event;
	override readonly onDidNotification = Event.None as Event<INotification>;
	override readonly clientId = 'test-client';

	private _rootStateValue: RootState = { agents: [] };
	override readonly rootState;

	private readonly _sessionStates = new Map<string, SessionState>();

	readonly dispatchedActions: { channel: string; action: StateAction }[] = [];

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

	override dispatch(channel: string, action: StateAction): void {
		this.dispatchedActions.push({ channel, action });
	}

	override getSubscriptionUnmanaged<T extends StateComponents>(kind: T, resource: URI): IAgentSubscription<ComponentToState[T]> | undefined {
		if (kind !== StateComponents.Session) {
			return undefined;
		}
		const self = this;
		const channel = resource.toString();
		if (!self._sessionStates.has(channel)) {
			return undefined;
		}
		const subscription: IAgentSubscription<SessionState> = {
			get value() { return self._sessionStates.get(channel); },
			get verifiedValue() { return self._sessionStates.get(channel); },
			onDidChange: Event.None,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		return subscription as IAgentSubscription<ComponentToState[T]>;
	}

	fireAction(envelope: ActionEnvelope): void {
		if (isSessionAction(envelope.action)) {
			const current = this._sessionStates.get(envelope.channel) ?? {} as SessionState;
			this._sessionStates.set(envelope.channel, sessionReducer(current, envelope.action));
		}
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
const testSessionResource = URI.parse('agent-host-copilotcli:/session-1');
const agentHostProviderId = 'copilotcli';
const agentHostSessionId = `${agentHostProviderId}:/session-1`;

function createAgentInfo(customizations: readonly Customization[]): AgentInfo {
	return {
		provider: agentHostProviderId,
		displayName: 'Copilot',
		description: 'Test Agent',
		models: [],
		customizations: [...customizations],
	};
}

function createTestCustomAgentsService(connection: MockAgentConnection, rootCustomizations: readonly Customization[]): IAgentHostCustomizationService {
	const onDidChangeCustomizations = Event.map(
		Event.filter(connection.onDidAction, envelope =>
			envelope.action.type === ActionType.SessionCustomizationsChanged
			|| envelope.action.type === ActionType.SessionCustomizationUpdated
		),
		() => undefined,
	);

	const onDidChangeCustomAgents = Event.map(
		Event.filter(connection.onDidAction, envelope =>
			envelope.action.type === ActionType.SessionCustomizationsChanged
			|| envelope.action.type === ActionType.SessionCustomizationUpdated
		),
		() => undefined,
	);

	return {
		_serviceBrand: undefined,
		onDidChangeCustomAgents,
		onDidChangeCustomizations,
		getCustomAgents: () => [],
		getCustomizations: (sessionResource: URI) => {
			const provider = sessionResource.scheme.replace(/^agent-host-/, '');
			const sessionChannel = `${provider}:${sessionResource.path}`;
			const sessionState = connection.getSubscriptionUnmanaged(StateComponents.Session, URI.parse(sessionChannel))?.value;
			if (!sessionState || sessionState instanceof Error) {
				return [...rootCustomizations];
			}
			return [...rootCustomizations, ...(sessionState.customizations ?? [])];
		},
		getWorkingDirectory(sessionResource: URI): string | undefined {
			return undefined;
		},
		getMcpServers(_sessionResource: URI) {
			return [];
		},
		addMcpServer(_sessionResource: URI, _name: string, _config) {
			// no-op
		},
		authenticateMcpServer(_sessionResource: URI, _serverId: string) {
			return Promise.resolve(false);
		},
		getMcpServerEnablement() {
			return ContributionEnablementState.EnabledProfile;
		},
		setMcpServerEnablement() { },
		prepareMcpServersForTurn() { },
		async showMcpServerLog(_sessionResource: URI, _serverId: string, beforeShow?: () => Promise<void>) {
			await beforeShow?.();
		},
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
		const pluginA: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/shared', uri: 'file:///plugins/shared', name: 'Shared Plugin', enabled: true };
		connection.setRootState({
			agents: [],
			config: {
				schema: { type: 'object', properties: {} },
				values: {
					customizations: [
						{ uri: 'file:///plugins/shared', displayName: 'Shared Plugin' },
						{ uri: 'file:///plugins/other', displayName: 'Other Plugin' },
					],
				},
			},
		});

		await controller.removeConfiguredPlugin(pluginA);

		assert.deepStrictEqual(connection.dispatchedActions, [{
			channel: 'ahp-root://',
			action: {
				type: ActionType.RootConfigChanged,
				config: {
					customizations: [{ uri: 'file:///plugins/other', displayName: 'Other Plugin' }],
				},
			},
		}]);
	});

	test('provider assigns distinct item keys to plugins with different URIs', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const pluginA: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/a', uri: 'file:///plugins/a', name: 'Plugin A', enabled: true };
		const pluginB: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/b', uri: 'file:///plugins/b', name: 'Plugin B', enabled: true };

		connection.setRootState({
			agents: [createAgentInfo([pluginA, pluginB])],
		});

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'test-authority',
			() => { },
			undefined,
			fileService,
			new NullLogService(),
			createTestCustomAgentsService(connection, [pluginA, pluginB]),
		));

		const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
		assert.strictEqual(items.length, 2);
		assert.notStrictEqual(items[0].itemKey, items[1].itemKey);
	});

	test('provider keeps client-synced entries distinct from host-owned entries', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const hostScoped: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/shared', uri: 'file:///plugins/shared', name: 'Shared Plugin', enabled: true };
		const synced: Customization = {
			...hostScoped,
			clientId: 'test-client',
		};

		connection.setRootState({
			agents: [createAgentInfo([hostScoped])],
		});

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'test-authority',
			() => { },
			undefined,
			fileService,
			new NullLogService(),
			createTestCustomAgentsService(connection, [hostScoped]),
		));

		connection.fireAction({
			channel: agentHostSessionId,
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				customizations: [synced],
			},
		});

		const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
		assert.strictEqual(items.length, 2);
		assert.notStrictEqual(items[0].itemKey, items[1].itemKey);
	});

	test('provider assigns client group to client-synced entries and host group to host entries', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const hostPlugin: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/host-plugin', uri: 'file:///plugins/host-plugin', name: 'Host Plugin', enabled: true };
		const clientPlugin: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/client-plugin', uri: 'file:///plugins/client-plugin', name: 'Client Plugin', enabled: true };
		const synced: Customization = {
			...clientPlugin,
			clientId: 'test-client',
		};

		connection.setRootState({
			agents: [createAgentInfo([hostPlugin])],
		});

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'test-authority',
			() => { },
			undefined,
			fileService,
			new NullLogService(),
			createTestCustomAgentsService(connection, [hostPlugin]),
		));

		connection.fireAction({
			channel: agentHostSessionId,
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				customizations: [synced],
			},
		});

		const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
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

		const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
		const bundleRef: Customization = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: 'VS Code Synced Data', enabled: true, load: { kind: CustomizationLoadStatus.Loaded } };
		const synced: Customization = {
			...bundleRef,
			clientId: 'test-client',
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
			override async readFile(resource: URI): Promise<IFileContent> {
				if (resource.path.endsWith('/my-skill/SKILL.md')) {
					const content = '---\n---\n';
					return { resource, name: 'SKILL.md', value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: '', size: content.length, readonly: false, locked: false, executable: false };
				}
				throw new Error('ENOENT');
			}
		};

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'test-authority',
			() => { },
			undefined,
			fileService,
			new NullLogService(),
			createTestCustomAgentsService(connection, []),
		));

		connection.fireAction({
			channel: agentHostSessionId,
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				customizations: [synced],
			},
		});

		const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
		// The synthetic bundle itself should NOT appear as a top-level item
		assert.ok(!items.some(i => i.name === 'VS Code Synced Data'), 'synthetic bundle should be hidden');
		// But its expanded child should appear
		const skillItem = items.find(i => i.name === 'my-skill');
		assert.ok(skillItem, 'expanded skill from bundle should be present');
		assert.strictEqual(skillItem.groupKey, 'remote-client', 'expanded children from bundle should be in client group');
	});

	test('toRemoteUri preserves synced-customization scheme URIs', async () => {
		const connection = disposables.add(new MockAgentConnection());

		const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
		const bundleRef: Customization = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: 'VS Code Synced Data', enabled: true };
		const synced: Customization = {
			...bundleRef,
			clientId: 'test-client',
		};

		connection.setRootState({ agents: [createAgentInfo([])] });

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'test-authority',
			() => { },
			undefined,
			fileService,
			new NullLogService(),
			createTestCustomAgentsService(connection, []),
		));

		connection.fireAction({
			channel: agentHostSessionId,
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				customizations: [synced],
			},
		});

		const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
		// No top-level item (bundle is hidden), but check that plugin expansion
		// attempted with the original scheme — not agent-host://
		// This is verified indirectly: canHandleResource returns false so
		// no children are produced, but importantly no crash occurred
		// (toAgentHostUri would throw for this scheme).
		assert.strictEqual(items.length, 0);
	});

	test('provider propagates status and enabled from session customizations', async () => {
		const connection = disposables.add(new MockAgentConnection());

		const pluginRef: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/my-plugin', uri: 'file:///plugins/my-plugin', name: 'My Plugin', enabled: true };
		const sessionCustomization: Customization = {
			...pluginRef,
			enabled: false,
			load: { kind: CustomizationLoadStatus.Error, message: 'something went wrong' },
		};

		connection.setRootState({ agents: [createAgentInfo([pluginRef])] });

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'test-authority',
			() => { },
			undefined,
			fileService,
			new NullLogService(),
			createTestCustomAgentsService(connection, [pluginRef]),
		));

		connection.fireAction({
			channel: agentHostSessionId,
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				customizations: [sessionCustomization],
			},
		});

		const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
		// Host-scoped plugin from root + session customization → merged into one entry
		// The session customization entry updates status/statusMessage
		const sessionItem = items.find(i => i.status === 'error');
		assert.ok(sessionItem, 'should have an item with error status');
		assert.strictEqual(sessionItem.statusMessage, 'something went wrong');
	});

	test('provider fires one change event on SessionCustomizationsChanged action', async () => {
		const connection = disposables.add(new MockAgentConnection());

		const pluginRef: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/host', uri: 'file:///plugins/host', name: 'Host Plugin', enabled: true };
		connection.setRootState({ agents: [createAgentInfo([pluginRef])] });

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'test-authority',
			() => { },
			undefined,
			fileService,
			new NullLogService(),
			createTestCustomAgentsService(connection, [pluginRef]),
		));

		let changeCount = 0;
		disposables.add(provider.onDidChange(() => changeCount++));

		connection.fireAction({
			channel: agentHostSessionId,
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				customizations: [pluginRef],
			},
		});

		assert.strictEqual(changeCount, 1, 'should fire one change event from customization service');
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

		const pluginB: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/b', uri: 'file:///plugins/b', name: 'Plugin B', enabled: true };

		connection.setRootState({
			agents: [],
			config: {
				schema: { type: 'object', properties: {} },
				values: {
					customizations: [
						{ uri: 'file:///plugins/a', displayName: 'Plugin A' },
						{ uri: 'file:///plugins/b', displayName: 'Plugin B' },
						{ uri: 'file:///plugins/c', displayName: 'Plugin C' },
					],
				},
			},
		});

		await controller.removeConfiguredPlugin(pluginB);

		assert.strictEqual(connection.dispatchedActions.length, 1);
		assert.deepStrictEqual(connection.dispatchedActions[0], {
			channel: 'ahp-root://',
			action: {
				type: ActionType.RootConfigChanged,
				config: {
					customizations: [
						{ uri: 'file:///plugins/a', displayName: 'Plugin A' },
						{ uri: 'file:///plugins/c', displayName: 'Plugin C' },
					],
				},
			},
		});
	});

	test('multiple client-synced entries all appear with distinct keys', async () => {
		const connection = disposables.add(new MockAgentConnection());

		const clientA: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/client-a', uri: 'file:///plugins/client-a', name: 'Client A', enabled: true };
		const clientB: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/client-b', uri: 'file:///plugins/client-b', name: 'Client B', enabled: true };

		connection.setRootState({ agents: [createAgentInfo([])] });

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return false; }
			override async resolveAll() { return []; }
		};

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'test-authority',
			() => { },
			undefined,
			fileService,
			new NullLogService(),
			createTestCustomAgentsService(connection, []),
		));

		connection.fireAction({
			channel: agentHostSessionId,
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				customizations: [
					{ ...clientA, clientId: 'test-client' },
					{ ...clientB, clientId: 'test-client' },
				],
			},
		});

		const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
		assert.strictEqual(items.length, 2);
		assert.ok(items.find(i => i.name === 'Client A'), 'should have Client A');
		assert.ok(items.find(i => i.name === 'Client B'), 'should have Client B');
		const keys = items.map(i => i.itemKey);
		assert.strictEqual(new Set(keys).size, 2, 'all item keys should be unique');
	});

	test('provider parses skill metadata, rewrites folder URIs to SKILL.md, and skips unreadable folder skills', async () => {
		const connection = disposables.add(new MockAgentConnection());
		const plugin: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/skills-bundle', uri: 'file:///plugins/skills-bundle', name: 'Skills Bundle', enabled: true };

		connection.setRootState({ agents: [createAgentInfo([plugin])] });

		// Build a synthetic plugin that contains a `skills/` directory with:
		//  - `valid-skill/` folder (SKILL.md parses with name + description)
		//  - `broken-skill/` folder (SKILL.md read fails — entry should be skipped)
		//  - `legacy.skill.md` flat file (kept as-is, name from filename)
		const skillsDirChildren: IFileStat[] = [
			{ name: 'valid-skill', resource: URI.parse('vscode-agent-host://test/plugins/skills-bundle/skills/valid-skill'), isFile: false, isDirectory: true, isSymbolicLink: false, children: undefined },
			{ name: 'broken-skill', resource: URI.parse('vscode-agent-host://test/plugins/skills-bundle/skills/broken-skill'), isFile: false, isDirectory: true, isSymbolicLink: false, children: undefined },
			{ name: 'legacy.skill.md', resource: URI.parse('vscode-agent-host://test/plugins/skills-bundle/skills/legacy.skill.md'), isFile: true, isDirectory: false, isSymbolicLink: false, children: undefined },
		];

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return true; }
			override async resolveAll(toResolve: { resource: URI }[]): Promise<IFileStatResult[]> {
				return toResolve.map(({ resource }) => {
					if (resource.path.endsWith('/skills')) {
						return {
							success: true,
							stat: { name: 'skills', resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: skillsDirChildren },
						};
					}
					return { success: false };
				});
			}
			override async readFile(resource: URI): Promise<IFileContent> {
				if (resource.path.endsWith('/valid-skill/SKILL.md')) {
					const content = '---\nname: Pretty Name\ndescription: A friendly skill description\n---\n\n# Body\n';
					return { resource, name: 'SKILL.md', value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: '', size: content.length, readonly: false, locked: false, executable: false };
				}
				throw new Error('ENOENT');
			}
		};

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'test-authority',
			() => { },
			undefined,
			fileService,
			new NullLogService(),
			createTestCustomAgentsService(connection, [plugin]),
		));

		const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);

		const skillItems = items.filter(i => i.type === PromptsType.skill);
		assert.deepStrictEqual(
			skillItems.map(i => ({ name: i.name, description: i.description, uri: i.uri.toString() })).sort((a, b) => a.name.localeCompare(b.name)),
			[
				{ name: 'Pretty Name', description: 'A friendly skill description', uri: 'vscode-agent-host://test/plugins/skills-bundle/skills/valid-skill/SKILL.md' },
			].sort((a, b) => a.name.localeCompare(b.name)),
		);

		// Each expanded (non-bundle) item must carry a `pluginUri` so that
		// downstream slash-command resolution can build a `plugin:`-prefixed
		// command id via `getCanonicalPluginCommandId`.
		const expectedPluginUri = 'vscode-agent-host://test-authority/plugins/skills-bundle?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0';
		for (const skillItem of skillItems) {
			assert.strictEqual(skillItem.pluginUri?.toString(), expectedPluginUri, `skill ${skillItem.name} should carry pluginUri`);
		}
	});

	test('provider recovers original provenance for synthetic-bundle children via the origin resolver', async () => {
		const connection = disposables.add(new MockAgentConnection());

		// The synthetic "VS Code Synced Data" bundle lives under the synced scheme.
		const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
		const bundle: Customization = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: 'VS Code Synced Data', enabled: true };

		connection.setRootState({ agents: [createAgentInfo([])] });

		const ruleResource = URI.parse(`${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority/rules/my-rule.md`);
		const rulesDirChildren: IFileStat[] = [
			{ name: 'my-rule.md', resource: ruleResource, isFile: true, isDirectory: false, isSymbolicLink: false, children: undefined },
		];

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return true; }
			override async resolveAll(toResolve: { resource: URI }[]): Promise<IFileStatResult[]> {
				return toResolve.map(({ resource }) => resource.path.endsWith('/rules')
					? { success: true, stat: { name: 'rules', resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: rulesDirChildren } }
					: { success: false });
			}
			override async readFile(resource: URI): Promise<IFileContent> {
				const content = '---\nname: My Rule\ndescription: A synced rule\n---\n';
				return { resource, name: 'my-rule.md', value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: '', size: content.length, readonly: false, locked: false, executable: false };
			}
		};

		const originUri = URI.parse('file:///home/user/.config/rules/my-rule.md');
		const provider = disposables.add(new AgentCustomizationItemProvider(
			'test-authority',
			() => { },
			syncedUri => syncedUri.toString() === ruleResource.toString()
				? { uri: originUri, source: 'extension', extensionId: 'pub.ext', pluginUri: undefined }
				: undefined,
			fileService,
			new NullLogService(),
			createTestCustomAgentsService(connection, []),
		));

		connection.fireAction({
			channel: agentHostSessionId,
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				customizations: [{ ...bundle, clientId: 'test-client' }],
			},
		});

		const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
		const rule = items.find(i => i.type === PromptsType.instructions);
		assert.ok(rule, 'the synced rule should be expanded');
		assert.deepStrictEqual(
			{ uri: rule.uri.toString(), source: rule.source, extensionId: rule.extensionId, groupKey: rule.groupKey },
			{ uri: originUri.toString(), source: 'extension', extensionId: 'pub.ext', groupKey: undefined },
		);
	});

	test('provider leaves synthetic-bundle children unchanged when no origin is known', async () => {
		const connection = disposables.add(new MockAgentConnection());

		const bundleUri = `${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority`;
		const bundle: Customization = { type: CustomizationType.Plugin, id: bundleUri, uri: bundleUri, name: 'VS Code Synced Data', enabled: true };

		connection.setRootState({ agents: [createAgentInfo([])] });

		const ruleResource = URI.parse(`${SYNCED_CUSTOMIZATION_SCHEME}:///test-authority/rules/my-rule.md`);
		const rulesDirChildren: IFileStat[] = [
			{ name: 'my-rule.md', resource: ruleResource, isFile: true, isDirectory: false, isSymbolicLink: false, children: undefined },
		];

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return true; }
			override async resolveAll(toResolve: { resource: URI }[]): Promise<IFileStatResult[]> {
				return toResolve.map(({ resource }) => resource.path.endsWith('/rules')
					? { success: true, stat: { name: 'rules', resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: rulesDirChildren } }
					: { success: false });
			}
			override async readFile(resource: URI): Promise<IFileContent> {
				const content = '---\nname: My Rule\n---\n';
				return { resource, name: 'my-rule.md', value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: '', size: content.length, readonly: false, locked: false, executable: false };
			}
		};

		// No resolver wired: children keep their synced URI and default source.
		const provider = disposables.add(new AgentCustomizationItemProvider(
			'test-authority',
			() => { },
			undefined,
			fileService,
			new NullLogService(),
			createTestCustomAgentsService(connection, []),
		));

		connection.fireAction({
			channel: agentHostSessionId,
			serverSeq: 1,
			origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				customizations: [{ ...bundle, clientId: 'test-client' }],
			},
		});

		const items = await provider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
		const rule = items.find(i => i.type === PromptsType.instructions);
		assert.ok(rule, 'the synced rule should be expanded');
		assert.strictEqual(rule.uri.toString(), ruleResource.toString());
	});

	test('CustomizationHarnessService.getSlashCommands prefixes discovered skill names with the plugin id', async () => {
		const connection = disposables.add(new MockAgentConnection());

		const plugin: Customization = { type: CustomizationType.Plugin, id: 'file:///plugins/skills-bundle', uri: 'file:///plugins/skills-bundle', name: 'Skills Bundle', enabled: true };

		connection.setRootState({ agents: [createAgentInfo([plugin])] });

		const skillsDirChildren: IFileStat[] = [
			{ name: 'lint', resource: URI.parse('vscode-agent-host://test/plugins/skills-bundle/skills/lint'), isFile: false, isDirectory: true, isSymbolicLink: false, children: undefined },
		];

		const fileService = new class extends mock<IFileService>() {
			override async canHandleResource() { return true; }
			override async resolveAll(toResolve: { resource: URI }[]): Promise<IFileStatResult[]> {
				return toResolve.map(({ resource }) => {
					if (resource.path.endsWith('/skills')) {
						return {
							success: true,
							stat: { name: 'skills', resource, isFile: false, isDirectory: true, isSymbolicLink: false, children: skillsDirChildren },
						};
					}
					return { success: false };
				});
			}
			override async readFile(resource: URI): Promise<IFileContent> {
				if (resource.path.endsWith('/lint/SKILL.md')) {
					const content = '---\nname: Lint\ndescription: A lint skill\n---\n';
					return { resource, name: 'SKILL.md', value: VSBuffer.fromString(content), mtime: 0, ctime: 0, etag: '', size: content.length, readonly: false, locked: false, executable: false };
				}
				throw new Error('ENOENT');
			}
		};

		const provider = disposables.add(new AgentCustomizationItemProvider(
			'test-authority',
			() => { },
			undefined,
			fileService,
			new NullLogService(),
			createTestCustomAgentsService(connection, [plugin]),
		));

		const harnessId = 'remote-agent-host-test';
		const testSessionResource = URI.parse('remote-agent-host-test:///test-session');
		const descriptor: IHarnessDescriptor = {
			id: harnessId,
			label: 'Remote Agent Host (test)',
			icon: ThemeIcon.fromId(Codicon.remote.id),
			itemProvider: provider,
		};
		const harnessService = disposables.add(new CustomizationHarnessServiceBase([descriptor], harnessId, new MockPromptsService()));

		const commands = await harnessService.getSlashCommands(testSessionResource, CancellationToken.None);
		const skillCommand = commands.find(c => c.type === PromptsType.skill);
		assert.ok(skillCommand, 'should have a skill slash command');
		assert.strictEqual(skillCommand.name, 'skills-bundle:lint', 'skill command name should be plugin-prefixed');
	});
});
