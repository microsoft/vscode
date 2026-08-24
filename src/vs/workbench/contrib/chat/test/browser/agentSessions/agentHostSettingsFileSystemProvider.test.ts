/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { isIMenuItem, MenuId, MenuRegistry, type IMenuItem } from '../../../../../../platform/actions/common/actions.js';
import { type ContextKeyExpression, type ContextKeyValue } from '../../../../../../platform/contextkey/common/contextkey.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { NullLogService, ILogService } from '../../../../../../platform/log/common/log.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { IRootConfigChangedAction, ClientAnnotationsAction, INotification, SessionAction, TerminalAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI, type ConfigPropertySchema, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import type { IResourceEditorInput } from '../../../../../../platform/editor/common/editor.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import {
	agentHostSettingsUri,
	AGENT_HOST_SETTINGS_SCHEME,
	AgentHostSettingsFileSystemProvider,
	AgentHostSettingsSchemaRegistrar,
} from '../../../browser/agentSessions/agentHost/agentHostSettingsFileSystemProvider.js';
import '../../../browser/agentSessions/agentHost/agentHostSettings.contribution.js';

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	override readonly onAgentHostStart = Event.None;
	override readonly onAgentHostExit = Event.None;
	override readonly onDidAction = Event.None;
	override readonly onDidNotification: Event<INotification> = Event.None;

	readonly dispatchedActions: { channel: string; action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction }[] = [];

	override dispatch(channel: string, action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
		this.dispatchedActions.push({ channel, action });
	}

	private _rootStateValue: RootState | Error | undefined = undefined;
	private readonly _rootStateOnDidChange = new Emitter<RootState>();
	override readonly rootState: IAgentSubscription<RootState> = (() => {
		const self = this;
		return {
			get value() { return self._rootStateValue; },
			get verifiedValue() { return self._rootStateValue instanceof Error ? undefined : self._rootStateValue; },
			onDidChange: this._rootStateOnDidChange.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	})();

	setRootState(state: RootState | Error): void {
		this._rootStateValue = state;
		if (!(state instanceof Error)) {
			this._rootStateOnDidChange.fire(state);
		}
	}

	dispose(): void {
		this._rootStateOnDidChange.dispose();
	}
}

function makeRootState(properties: Record<string, ConfigPropertySchema>, values: Record<string, unknown> = {}): RootState {
	return {
		agents: [],
		config: {
			schema: { type: 'object', properties },
			values,
		},
	};
}

suite('AgentHostSettingsFileSystemProvider (ambient editor-window adapter)', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(initialState?: RootState | Error) {
		const agentHostService = new MockAgentHostService();
		store.add({ dispose: () => agentHostService.dispose() });
		if (initialState) {
			agentHostService.setRootState(initialState);
		}

		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IAgentHostService, agentHostService],
			[ILogService, new NullLogService()],
		)));

		const schemaRegistrar = store.add(instantiationService.createInstance(AgentHostSettingsSchemaRegistrar));
		const fs = store.add(instantiationService.createInstance(AgentHostSettingsFileSystemProvider, schemaRegistrar));

		return { fs, agentHostService, uri: agentHostSettingsUri() };
	}

	test('URI identity: agent-host-settings://local/settings.jsonc', () => {
		const uri = agentHostSettingsUri();
		assert.strictEqual(uri.scheme, AGENT_HOST_SETTINGS_SCHEME);
		assert.strictEqual(uri.authority, 'local');
		assert.strictEqual(uri.path, '/settings.jsonc');
	});

	test('readFile returns root config values as JSON', async () => {
		const { fs, uri } = createHarness(makeRootState({
			autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'] },
		}, { autoApprove: 'default' }));

		const buf = await fs.readFile(uri);
		const text = VSBuffer.wrap(buf).toString();
		const parsed = JSON.parse(text.substring(text.indexOf('{')));
		assert.deepStrictEqual(parsed, { autoApprove: 'default' });
	});

	test('readFile before any root state has arrived returns an empty document', async () => {
		const { fs, uri } = createHarness();

		const buf = await fs.readFile(uri);
		const text = VSBuffer.wrap(buf).toString();
		const parsed = JSON.parse(text.substring(text.indexOf('{')));
		assert.deepStrictEqual(parsed, {});
	});

	test('writeFile with invalid JSON throws', async () => {
		const { fs, uri } = createHarness(makeRootState({}, {}));
		await assert.rejects(async () => {
			await fs.writeFile(uri, VSBuffer.fromString('{ not json').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
		});
	});

	test('writeFile with a JSON array throws (not an object)', async () => {
		const { fs, uri } = createHarness(makeRootState({}, {}));
		await assert.rejects(async () => {
			await fs.writeFile(uri, VSBuffer.fromString('[]').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
		});
	});

	test('writeFile filters out keys with no schema entry', async () => {
		const { fs, uri, agentHostService } = createHarness(makeRootState({
			autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'] },
		}, { autoApprove: 'default' }));

		const newContent = VSBuffer.fromString('{ "autoApprove": "autoApprove", "unknownKey": 123 }\n').buffer;
		await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.strictEqual(agentHostService.dispatchedActions.length, 1);
		const action = agentHostService.dispatchedActions[0].action as IRootConfigChangedAction;
		assert.deepStrictEqual(action.config, { autoApprove: 'autoApprove' });
	});

	test('writeFile dispatches RootConfigChanged with replace: true to ROOT_STATE_URI', async () => {
		const { fs, uri, agentHostService } = createHarness(makeRootState({
			autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'] },
		}, { autoApprove: 'default' }));

		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.strictEqual(agentHostService.dispatchedActions.length, 1);
		const { channel, action } = agentHostService.dispatchedActions[0];
		assert.strictEqual(channel, ROOT_STATE_URI);
		assert.strictEqual(action.type, ActionType.RootConfigChanged);
		assert.strictEqual((action as IRootConfigChangedAction).replace, true);
	});

	test('writeFile with structurally unchanged values does not dispatch', async () => {
		const { fs, uri, agentHostService } = createHarness(makeRootState({
			autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'] },
		}, { autoApprove: 'default' }));

		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.deepStrictEqual(agentHostService.dispatchedActions as readonly unknown[], []);
	});

	test('writeFile optimistically updates the local view before the dispatch round-trips', async () => {
		const { fs, uri, agentHostService } = createHarness(makeRootState({
			autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'] },
		}, { autoApprove: 'default' }));

		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });

		// Re-read without the host echoing anything back — the optimistic
		// local cache should already reflect the write.
		const buf = await fs.readFile(uri);
		const text = VSBuffer.wrap(buf).toString();
		const parsed = JSON.parse(text.substring(text.indexOf('{')));
		assert.deepStrictEqual(parsed, { autoApprove: 'autoApprove' });
		assert.strictEqual(agentHostService.dispatchedActions.length, 1);
	});

	test('writeFile when no root config has arrived yet is a no-op', async () => {
		const { fs, uri, agentHostService } = createHarness();

		const events: URI[] = [];
		store.add(fs.onDidChangeFile(changes => { for (const c of changes) { events.push(c.resource); } }));

		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.deepStrictEqual(agentHostService.dispatchedActions as readonly unknown[], []);
		assert.strictEqual(events.length, 1);
	});

	test('onDidChangeFile fires when the host publishes a new root state', async () => {
		const { fs, uri, agentHostService } = createHarness(makeRootState({}, {}));

		const events: URI[] = [];
		const listeners = new DisposableStore();
		store.add(listeners);
		listeners.add(fs.onDidChangeFile(changes => { for (const c of changes) { events.push(c.resource); } }));
		listeners.add(fs.watch(uri, { recursive: false, excludes: [] }));

		agentHostService.setRootState(makeRootState({}, { autoApprove: 'default' }));

		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].toString(), uri.toString());
	});

	test('root state hydrates after construction (readFile reflects late-arriving config)', async () => {
		const { fs, uri, agentHostService } = createHarness(); // no initial state

		const initial = await fs.readFile(uri);
		assert.deepStrictEqual(JSON.parse(VSBuffer.wrap(initial).toString().substring(VSBuffer.wrap(initial).toString().indexOf('{'))), {});

		agentHostService.setRootState(makeRootState({
			autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default'] },
		}, { autoApprove: 'default' }));

		const hydrated = await fs.readFile(uri);
		const text = VSBuffer.wrap(hydrated).toString();
		assert.deepStrictEqual(JSON.parse(text.substring(text.indexOf('{'))), { autoApprove: 'default' });
	});

	test('root state error leaves config unavailable (empty document, write ignored)', async () => {
		const { fs, uri, agentHostService } = createHarness(new Error('agent host disconnected'));

		const text = VSBuffer.wrap(await fs.readFile(uri)).toString();
		assert.deepStrictEqual(JSON.parse(text.substring(text.indexOf('{'))), {});

		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
		assert.deepStrictEqual(agentHostService.dispatchedActions as readonly unknown[], []);
	});

	suite('schema registration', () => {
		const schemaRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
		const schemaId = `vscode://schemas/agent-host-settings/local.jsonc`;

		test('readFile lazily registers a schema + association', async () => {
			const { fs, uri } = createHarness(makeRootState({
				autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default'] },
			}, { autoApprove: 'default' }));

			assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);

			await fs.readFile(uri);

			assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
			assert.deepStrictEqual(schemaRegistry.getSchemaAssociations()[schemaId], [uri.toString()]);
		});

		test('schema is refreshed when root state changes with a new schema identity', async () => {
			const { fs, uri, agentHostService } = createHarness(makeRootState({
				autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default'] },
			}, { autoApprove: 'default' }));

			await fs.readFile(uri);
			const initial = schemaRegistry.getSchemaContributions().schemas[schemaId];
			assert.ok(initial);

			agentHostService.setRootState(makeRootState({
				autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'] },
				mode: { type: 'string', title: 'Mode', enum: ['a', 'b'] },
			}, { autoApprove: 'default', mode: 'a' }));

			const refreshed = schemaRegistry.getSchemaContributions().schemas[schemaId];
			assert.notStrictEqual(refreshed, initial);
			assert.ok(refreshed.properties?.['mode'], 'refreshed schema should include the newly added property');
		});
	});
});

suite('workbench.action.chat.openAgentHostSettings', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const ACTION_ID = 'workbench.action.chat.openAgentHostSettings';

	function evalWhen(when: ContextKeyExpression | undefined, values: Record<string, ContextKeyValue>): boolean {
		assert.ok(when, 'expected a when clause');
		return when.evaluate({ getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => values[key] as T });
	}

	test('is registered in the Command Palette gated on chat + agent-host enablement', () => {
		const item = MenuRegistry.getMenuItems(MenuId.CommandPalette)
			.find((i): i is IMenuItem => isIMenuItem(i) && i.command.id === ACTION_ID);
		assert.ok(item, 'command palette item is registered');

		assert.strictEqual(evalWhen(item.when, {
			[ChatContextKeys.enabled.key]: true,
			[AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true,
		}), true);
		assert.strictEqual(evalWhen(item.when, {
			[ChatContextKeys.enabled.key]: false,
			[AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true,
		}), false);
		assert.strictEqual(evalWhen(item.when, {
			[ChatContextKeys.enabled.key]: true,
			[AGENT_HOST_ENABLED_CONTEXT_KEY.key]: false,
		}), false);
	});

	test('appears in the local agent-host session context menu, not for remote or non-agent-host sessions', () => {
		const item = MenuRegistry.getMenuItems(MenuId.AgentSessionsContext)
			.find((i): i is IMenuItem => isIMenuItem(i) && i.command.id === ACTION_ID);
		assert.ok(item, 'agent sessions context menu item is registered');

		const base = { [ChatContextKeys.enabled.key]: true, [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true };
		assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: 'agent-host-copilotcli' }), true);
		assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: 'remote-copilotcli' }), false);
		assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: 'copilotcli' }), false);
	});

	test('run() opens the ambient settings resource pinned, ignoring any session context', async () => {
		const command = CommandsRegistry.getCommand(ACTION_ID);
		assert.ok(command, 'command is registered');

		const opened: { resource: URI | undefined; pinned: boolean | undefined }[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				const editor = args[0] as IResourceEditorInput;
				opened.push({ resource: editor.resource, pinned: editor.options?.pinned });
				return undefined;
			}
		});

		// Pass a bogus session-item-shaped argument to confirm it's ignored for routing.
		await instantiationService.invokeFunction(accessor => command.handler(accessor, { providerId: 'some-other-provider' }));

		assert.deepStrictEqual(opened, [{ resource: agentHostSettingsUri(), pinned: true }]);
	});
});
