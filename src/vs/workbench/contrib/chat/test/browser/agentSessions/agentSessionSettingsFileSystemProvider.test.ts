/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IReference } from '../../../../../../base/common/lifecycle.js';
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
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { IRootConfigChangedAction, ClientAnnotationsAction, INotification, SessionAction, TerminalAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { StateComponents, type ComponentToState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { SessionLifecycle, SessionStatus, type SessionConfigPropertySchema, type SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import type { IResourceEditorInput } from '../../../../../../platform/editor/common/editor.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IAgentSession, IMarshalledAgentSessionContext } from '../../../browser/agentSessions/agentSessionsModel.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import {
	agentSessionSettingsUri,
	AGENT_SESSION_SETTINGS_SCHEME,
	AgentSessionSettingsFileSystemProvider,
	AgentSessionSettingsSchemaRegistrar,
} from '../../../browser/agentSessions/agentHost/agentSessionSettingsFileSystemProvider.js';
import '../../../browser/agentSessions/agentHost/agentSessionSettings.contribution.js';

const CHAT_SESSION_RESOURCE = URI.from({ scheme: 'agent-host-copilotcli', path: '/abc-123' });
const BACKEND_SESSION = URI.from({ scheme: 'copilotcli', path: '/abc-123' });

class FakeSessionSubscription implements IAgentSubscription<SessionState> {

	private readonly _onDidChange = new Emitter<SessionState>();
	readonly onDidChange = this._onDidChange.event;
	readonly onWillApplyAction = Event.None;
	readonly onDidApplyAction = Event.None;

	private _value: SessionState | Error | undefined;

	get value(): SessionState | Error | undefined { return this._value; }
	get verifiedValue(): SessionState | undefined { return this._value instanceof Error ? undefined : this._value; }

	setState(state: SessionState | Error): void {
		this._value = state;
		if (!(state instanceof Error)) {
			this._onDidChange.fire(state);
		}
	}

	applyReplace(config: Record<string, unknown>): void {
		if (!this._value || this._value instanceof Error || !this._value.config) {
			return;
		}
		this._value = { ...this._value, config: { ...this._value.config, values: { ...config } } };
		this._onDidChange.fire(this._value);
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

interface ISubscriptionEntry {
	readonly sub: FakeSessionSubscription;
	acquireCount: number;
	disposeCount: number;
}

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	override readonly onAgentHostStart = Event.None;
	override readonly onAgentHostExit = Event.None;
	override readonly onDidAction = Event.None;
	override readonly onDidNotification: Event<INotification> = Event.None;

	readonly dispatchedActions: { channel: string; action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction }[] = [];

	private readonly _subs = new Map<string, ISubscriptionEntry>();

	private _entry(resource: URI): ISubscriptionEntry {
		const key = resource.toString();
		let entry = this._subs.get(key);
		if (!entry) {
			entry = { sub: new FakeSessionSubscription(), acquireCount: 0, disposeCount: 0 };
			this._subs.set(key, entry);
		}
		return entry;
	}

	override getSubscription<T extends StateComponents>(_kind: T, resource: URI, _owner: string): IReference<IAgentSubscription<ComponentToState[T]>> {
		const entry = this._entry(resource);
		entry.acquireCount++;
		return {
			object: entry.sub as unknown as IAgentSubscription<ComponentToState[T]>,
			dispose: () => { entry.disposeCount++; },
		};
	}

	override getSubscriptionUnmanaged<T extends StateComponents>(_kind: T, resource: URI): IAgentSubscription<ComponentToState[T]> | undefined {
		const entry = this._subs.get(resource.toString());
		return entry?.sub as unknown as IAgentSubscription<ComponentToState[T]> | undefined;
	}

	override dispatch(channel: string, action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
		this.dispatchedActions.push({ channel, action });
		const entry = this._subs.get(channel);
		if (entry && action.type === ActionType.SessionConfigChanged) {
			entry.sub.applyReplace((action as { config: Record<string, unknown> }).config);
		}
	}

	setSessionState(resource: URI, state: SessionState | Error): void {
		this._entry(resource).sub.setState(state);
	}

	acquireCount(resource: URI): number {
		return this._subs.get(resource.toString())?.acquireCount ?? 0;
	}

	disposeCount(resource: URI): number {
		return this._subs.get(resource.toString())?.disposeCount ?? 0;
	}

	dispose(): void {
		for (const entry of this._subs.values()) {
			entry.sub.dispose();
		}
	}
}

function makeSessionState(properties: Record<string, SessionConfigPropertySchema>, values: Record<string, unknown> = {}): SessionState {
	return {
		provider: 'copilotcli',
		title: 'Test session',
		status: SessionStatus.Idle,
		lifecycle: SessionLifecycle.Ready,
		activeClients: [],
		chats: [],
		config: {
			schema: { type: 'object', properties },
			values,
		},
	};
}

function readJson(buf: Uint8Array): unknown {
	const text = VSBuffer.wrap(buf).toString();
	return JSON.parse(text.substring(text.indexOf('{')));
}

/**
 * A {@link TestConfigurationService} whose `chat.tools.global.autoApprove`
 * policy value is pinned to `false`, simulating an organization policy that
 * disables auto-approval. Mirrors the identical helper in
 * `vs/sessions/contrib/providers/agentHost/test/browser/localAgentHostSessionsProvider.test.ts`.
 */
function createPolicyRestrictedConfigurationService(): TestConfigurationService {
	return new class extends TestConfigurationService {
		override inspect<T>(key: string) {
			const base = super.inspect<T>(key);
			if (key === 'chat.tools.global.autoApprove') {
				return { ...base, policyValue: false as unknown as T };
			}
			return base;
		}
	}();
}

suite('AgentSessionSettingsFileSystemProvider (editor-window per-session adapter)', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(initialState?: SessionState | Error, configurationService: IConfigurationService = new TestConfigurationService()) {
		const agentHostService = new MockAgentHostService();
		store.add({ dispose: () => agentHostService.dispose() });
		if (initialState) {
			agentHostService.setSessionState(BACKEND_SESSION, initialState);
		}

		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IAgentHostService, agentHostService],
			[IConfigurationService, configurationService],
			[ILogService, new NullLogService()],
		)));

		const schemaRegistrar = store.add(instantiationService.createInstance(AgentSessionSettingsSchemaRegistrar));
		const fs = store.add(instantiationService.createInstance(AgentSessionSettingsFileSystemProvider, schemaRegistrar));

		return { fs, agentHostService, uri: agentSessionSettingsUri(BACKEND_SESSION) };
	}

	test('URI routing: encodes and round-trips the backend session URI', () => {
		const uri = agentSessionSettingsUri(BACKEND_SESSION);
		assert.strictEqual(uri.scheme, AGENT_SESSION_SETTINGS_SCHEME);
		assert.strictEqual(uri.authority, 'copilotcli');
		assert.strictEqual(uri.path, '/abc-123.jsonc');
	});

	test('readFile filters to session-mutable, non-readOnly properties', async () => {
		const { fs, uri } = createHarness(makeSessionState({
			autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove'] },
			isolation: { type: 'string', title: 'Isolation', enum: ['worktree'] }, // non-mutable — omitted
			branch: { type: 'string', title: 'Branch', sessionMutable: true, readOnly: true, enum: ['main'] }, // readOnly — omitted
		}, { autoApprove: 'default', isolation: 'worktree', branch: 'main' }));

		const parsed = readJson(await fs.readFile(uri));
		assert.deepStrictEqual(parsed, { autoApprove: 'default' });
	});

	test('readFile before any session state has arrived returns an empty document', async () => {
		const { fs, uri } = createHarness();
		assert.deepStrictEqual(readJson(await fs.readFile(uri)), {});
	});

	test('writeFile with invalid JSON throws', async () => {
		const { fs, uri } = createHarness(makeSessionState({}, {}));
		await assert.rejects(async () => {
			await fs.writeFile(uri, VSBuffer.fromString('{ not json').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
		});
	});

	test('writeFile dispatches SessionConfigChanged with replace:true to the backend session channel', async () => {
		const { fs, uri, agentHostService } = createHarness(makeSessionState({
			autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove'] },
		}, { autoApprove: 'default' }));

		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.strictEqual(agentHostService.dispatchedActions.length, 1);
		const { channel, action } = agentHostService.dispatchedActions[0];
		assert.strictEqual(channel, BACKEND_SESSION.toString());
		assert.strictEqual(action.type, ActionType.SessionConfigChanged);
		assert.strictEqual((action as { replace?: boolean }).replace, true);
	});

	test('writeFile preserves non-editable values and clears an omitted editable value', async () => {
		const { fs, uri, agentHostService } = createHarness(makeSessionState({
			autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove'] },
			mode: { type: 'string', title: 'Mode', sessionMutable: true, enum: ['a', 'b'] },
			isolation: { type: 'string', title: 'Isolation', enum: ['worktree'] }, // non-mutable, must be preserved
			branch: { type: 'string', title: 'Branch', sessionMutable: true, readOnly: true, enum: ['main'] }, // readOnly, must be preserved
		}, { autoApprove: 'default', mode: 'a', isolation: 'worktree', branch: 'main' }));

		// Omit `mode` entirely — it should be cleared, not defaulted.
		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.strictEqual(agentHostService.dispatchedActions.length, 1);
		const action = agentHostService.dispatchedActions[0].action as { config: Record<string, unknown> };
		assert.deepStrictEqual(action.config, { autoApprove: 'autoApprove', isolation: 'worktree', branch: 'main' });
		assert.strictEqual(Object.hasOwn(action.config, 'mode'), false);
	});

	test('writeFile clamps autoApprove to default when org policy disables global auto-approve', async () => {
		const { fs, uri, agentHostService } = createHarness(makeSessionState({
			autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove', 'autopilot'] },
			mode: { type: 'string', title: 'Mode', sessionMutable: true, enum: ['a', 'b'] },
		}, { autoApprove: 'default', mode: 'a' }), createPolicyRestrictedConfigurationService());

		// The user edits the JSONC document directly to request an elevated
		// auto-approve level and a plain, unrestricted `mode` change.
		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autopilot", "mode": "b" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.strictEqual(agentHostService.dispatchedActions.length, 1);
		const action = agentHostService.dispatchedActions[0].action as { config: Record<string, unknown> };
		// autoApprove is clamped back to 'default' despite the requested 'autopilot' value;
		// the unrestricted `mode` property passes through unchanged.
		assert.deepStrictEqual(action.config, { autoApprove: 'default', mode: 'b' });
	});

	test('writeFile passes autoApprove through unchanged when org policy does not restrict auto-approve', async () => {
		const { fs, uri, agentHostService } = createHarness(makeSessionState({
			autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove', 'autopilot'] },
		}, { autoApprove: 'default' }), new TestConfigurationService());

		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autopilot" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.strictEqual(agentHostService.dispatchedActions.length, 1);
		const action = agentHostService.dispatchedActions[0].action as { config: Record<string, unknown> };
		assert.deepStrictEqual(action.config, { autoApprove: 'autopilot' });
	});

	test('writeFile does not dispatch when the only requested change is clamped away by policy', async () => {
		const { fs, uri, agentHostService } = createHarness(makeSessionState({
			autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove', 'autopilot'] },
		}, { autoApprove: 'default' }), createPolicyRestrictedConfigurationService());

		// Already 'default'; the requested 'autoApprove' clamps right back to
		// the current value, so nothing has actually changed.
		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.deepStrictEqual(agentHostService.dispatchedActions as readonly unknown[], []);
	});

	test('writeFile with structurally unchanged values does not dispatch', async () => {
		const { fs, uri, agentHostService } = createHarness(makeSessionState({
			autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove'] },
		}, { autoApprove: 'default' }));

		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.deepStrictEqual(agentHostService.dispatchedActions as readonly unknown[], []);
	});

	test('writeFile when no session state has arrived yet is a no-op', async () => {
		const { fs, uri, agentHostService } = createHarness();

		const events: URI[] = [];
		store.add(fs.onDidChangeFile(changes => { for (const c of changes) { events.push(c.resource); } }));

		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.deepStrictEqual(agentHostService.dispatchedActions as readonly unknown[], []);
		assert.strictEqual(events.length, 1);
	});

	test('readFile reflects the live subscription\'s optimistic value after a replace dispatch', async () => {
		const { fs, uri } = createHarness(makeSessionState({
			autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove'] },
		}, { autoApprove: 'default' }));

		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "autoApprove" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.deepStrictEqual(readJson(await fs.readFile(uri)), { autoApprove: 'autoApprove' });
	});

	test('onDidChangeFile fires when the backend session publishes new state while watched', async () => {
		const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));

		const events: URI[] = [];
		const listeners = new DisposableStore();
		store.add(listeners);
		listeners.add(fs.onDidChangeFile(changes => { for (const c of changes) { events.push(c.resource); } }));
		listeners.add(fs.watch(uri, { recursive: false, excludes: [] }));

		agentHostService.setSessionState(BACKEND_SESSION, makeSessionState({}, { autoApprove: 'default' }));

		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].toString(), uri.toString());
	});

	test('session state error leaves config unavailable (empty document, write ignored)', async () => {
		const { fs, uri, agentHostService } = createHarness(new Error('session disconnected'));

		assert.deepStrictEqual(readJson(await fs.readFile(uri)), {});

		await fs.writeFile(uri, VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
		assert.deepStrictEqual(agentHostService.dispatchedActions as readonly unknown[], []);
	});

	suite('subscription lifecycle', () => {

		test('readFile acquires and releases its own scoped reference', async () => {
			const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));

			await fs.readFile(uri);

			assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 1);
			assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1, 'the reference acquired for readFile is released once the call completes');
		});

		test('stat and writeFile also acquire and release their own scoped reference', async () => {
			const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));

			await fs.stat(uri);
			assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 1);
			assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1);

			await fs.writeFile(uri, VSBuffer.fromString('{}\n').buffer, { create: false, overwrite: true, unlock: false, atomic: false });
			assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 2);
			assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 2);
		});

		test('watch acquires its own reference and holds it until disposed', () => {
			const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));

			const watch1 = fs.watch(uri, { recursive: false, excludes: [] });
			assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 1);
			assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 0);

			watch1.dispose();
			assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1);
		});

		test('multiple watches each acquire and release their own reference independently', () => {
			const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));

			const watch1 = fs.watch(uri, { recursive: false, excludes: [] });
			const watch2 = fs.watch(uri, { recursive: false, excludes: [] });

			// Every resolution acquires its own reference — the provider keeps
			// no cache/refcount map; the underlying IAgentHostService is
			// responsible for deduping/refcounting a shared subscription.
			assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 2);

			watch1.dispose();
			assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1, 'disposing one watch releases only its own reference');

			watch2.dispose();
			assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 2, 'disposing the second watch releases its own reference too');
		});

		test('readFile while a watch is active releases only its own reference, leaving the watch\'s reference held', async () => {
			const { fs, uri, agentHostService } = createHarness(makeSessionState({}, {}));

			const watch = fs.watch(uri, { recursive: false, excludes: [] });
			assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 1);

			await fs.readFile(uri);
			assert.strictEqual(agentHostService.acquireCount(BACKEND_SESSION), 2);
			assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 1, 'readFile released its own reference; the watch reference is still held');

			watch.dispose();
			assert.strictEqual(agentHostService.disposeCount(BACKEND_SESSION), 2);
		});
	});

	suite('schema registration', () => {
		const schemaRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
		const schemaId = `vscode://schemas/agent-session-settings/copilotcli/abc-123.jsonc`;

		test('readFile lazily registers a schema + association', async () => {
			const { fs, uri } = createHarness(makeSessionState({
				autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default'] },
			}, { autoApprove: 'default' }));

			assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);

			await fs.readFile(uri);

			assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
			assert.deepStrictEqual(schemaRegistry.getSchemaAssociations()[schemaId], [uri.toString()]);
		});

		test('schema is refreshed on the next read after session state changes with a new schema identity', async () => {
			// Unlike the ambient host registrar, the per-session registrar
			// does not hold its own subscription/listener (by design — see
			// agentSessionSettingsFileSystemProvider.ts); it refreshes
			// lazily whenever `readFile` next calls `ensureRegistered`,
			// which is also how a real open editor picks up a change (it
			// re-reads after the filesystem provider's `onDidChangeFile`).
			const { fs, uri, agentHostService } = createHarness(makeSessionState({
				autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default'] },
			}, { autoApprove: 'default' }));

			await fs.readFile(uri);
			const initial = schemaRegistry.getSchemaContributions().schemas[schemaId];
			assert.ok(initial);

			agentHostService.setSessionState(BACKEND_SESSION, makeSessionState({
				autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove'] },
				mode: { type: 'string', title: 'Mode', sessionMutable: true, enum: ['a', 'b'] },
			}, { autoApprove: 'default', mode: 'a' }));

			await fs.readFile(uri);

			const refreshed = schemaRegistry.getSchemaContributions().schemas[schemaId];
			assert.notStrictEqual(refreshed, initial);
			assert.ok(refreshed.properties?.['mode'], 'refreshed schema should include the newly added property');
		});

		test('schema is disposed when the filesystem provider is disposed', async () => {
			const agentHostService = new MockAgentHostService();
			store.add({ dispose: () => agentHostService.dispose() });
			agentHostService.setSessionState(BACKEND_SESSION, makeSessionState({
				autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default'] },
			}, { autoApprove: 'default' }));

			const instantiationService = new TestInstantiationService(new ServiceCollection(
				[IAgentHostService, agentHostService],
				[IConfigurationService, new TestConfigurationService()],
				[ILogService, new NullLogService()],
			));
			const schemaRegistrar = instantiationService.createInstance(AgentSessionSettingsSchemaRegistrar);
			const fs = instantiationService.createInstance(AgentSessionSettingsFileSystemProvider, schemaRegistrar);

			const uri = agentSessionSettingsUri(BACKEND_SESSION);
			await fs.readFile(uri);
			assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);

			fs.dispose();
			schemaRegistrar.dispose();
			instantiationService.dispose();

			assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
		});
	});
});

suite('workbench.action.chat.openAgentSessionSettings', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const ACTION_ID = 'workbench.action.chat.openAgentSessionSettings';

	function evalWhen(when: ContextKeyExpression | undefined, values: Record<string, ContextKeyValue>): boolean {
		assert.ok(when, 'expected a when clause');
		return when.evaluate({ getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string) => values[key] as T });
	}

	test('is NOT registered in the Command Palette (context-menu-only)', () => {
		const item = MenuRegistry.getMenuItems(MenuId.CommandPalette)
			.find((i): i is IMenuItem => isIMenuItem(i) && i.command.id === ACTION_ID);
		assert.strictEqual(item, undefined);
	});

	test('appears in the local agent-host session context menu, not for remote or non-agent-host sessions', () => {
		const item = MenuRegistry.getMenuItems(MenuId.AgentSessionsContext)
			.find((i): i is IMenuItem => isIMenuItem(i) && i.command.id === ACTION_ID);
		assert.ok(item, 'agent sessions context menu item is registered');

		const base = { [ChatContextKeys.enabled.key]: true, [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true };
		assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: 'agent-host-copilotcli' }), true);
		assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: 'remote-copilotcli' }), false);
		assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.agentSessionType.key]: 'copilotcli' }), false);
		assert.strictEqual(evalWhen(item.when, { ...base, [ChatContextKeys.enabled.key]: false, [ChatContextKeys.agentSessionType.key]: 'agent-host-copilotcli' }), false);
	});

	function makeAgentSession(resource: URI): IAgentSession {
		return {
			resource,
			isArchived: () => false,
			setArchived: () => { },
			isPinned: () => false,
			setPinned: () => { },
			isRead: () => true,
			isMarkedUnread: () => false,
			setRead: () => { },
		} as unknown as IAgentSession;
	}

	async function invokeWithContext(context: IAgentSession | IMarshalledAgentSessionContext | undefined): Promise<{ resource: URI | undefined; pinned: boolean | undefined }[]> {
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

		await instantiationService.invokeFunction(accessor => command.handler(accessor, context));
		return opened;
	}

	test('run() with a direct IAgentSession opens the routed session settings resource pinned', async () => {
		const session = makeAgentSession(CHAT_SESSION_RESOURCE);
		const opened = await invokeWithContext(session);
		assert.deepStrictEqual(opened, [{ resource: agentSessionSettingsUri(BACKEND_SESSION), pinned: true }]);
	});

	test('run() with a marshalled agent-session context routes via context.session, ignoring context.sessions', async () => {
		const session = makeAgentSession(CHAT_SESSION_RESOURCE);
		const otherSession = makeAgentSession(URI.from({ scheme: 'agent-host-copilotcli', path: '/other' }));
		const marshalled: IMarshalledAgentSessionContext = {
			$mid: MarshalledId.AgentSessionContext,
			session,
			sessions: [session, otherSession],
		};

		const opened = await invokeWithContext(marshalled);
		assert.deepStrictEqual(opened, [{ resource: agentSessionSettingsUri(BACKEND_SESSION), pinned: true }]);
	});

	test('run() with no context does not open anything (no last-focused-session inference)', async () => {
		const opened = await invokeWithContext(undefined);
		assert.deepStrictEqual(opened, []);
	});

	test('run() with a non-agent-host session resource does not open anything', async () => {
		const session = makeAgentSession(URI.from({ scheme: 'somethingElse', path: '/x' }));
		const opened = await invokeWithContext(session);
		assert.deepStrictEqual(opened, []);
	});
});
