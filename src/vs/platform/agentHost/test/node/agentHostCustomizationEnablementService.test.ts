/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, type IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agentService.js';
import { isCustomizationEnabled } from '../../common/customizationEnablement.js';
import { withSessionWorkspaceless } from '../../common/state/sessionState.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { CustomizationEnablementKind, CustomizationType } from '../../common/state/protocol/channels-session/state.js';
import { AgentHostCustomizationEnablementService, getCustomizationEnablementKey, type ICustomizationEnablementConfigurationService, type ICustomizationEnablementSessionState, type ICustomizationEnablementTarget, type ISessionEnablementDataService, type ISessionEnablementDatabase } from '../../node/agentHostCustomizationEnablementService.js';
import { AgentHostStorageService } from '../../node/agentHostStorageService.js';

class TestSessionDataService implements ISessionEnablementDataService {
	readonly values = new Map<string, string>();
	metadataLoad: Promise<string | undefined> | undefined;

	openDatabase(_session: URI): IReference<ISessionEnablementDatabase> {
		return {
			object: {
				getMetadata: async key => this.metadataLoad ?? this.values.get(key),
				setMetadata: async (key, value) => { this.values.set(key, value); },
			},
			dispose: () => { },
		};
	}
}

class TestConfigurationService implements ICustomizationEnablementConfigurationService {
	readonly directories = new Map<string, string[] | undefined>();
	readonly pending = new Set<string>();
	private readonly _onDidChangeWorkingDirectoryPending = new Emitter<string>();
	readonly onDidChangeWorkingDirectoryPending: Event<string> = this._onDidChangeWorkingDirectoryPending.event;

	getEffectiveWorkingDirectories(session: string): string[] | undefined {
		return this.directories.get(session);
	}

	isWorkingDirectoryPending(session: string): boolean {
		return this.pending.has(session);
	}

	firePendingChange(sessionId: string): void {
		this._onDidChangeWorkingDirectoryPending.fire(sessionId);
	}
}

class TestSessionState implements ICustomizationEnablementSessionState {
	readonly summaries = new Map<string, { readonly _meta?: Record<string, unknown> }>();
	private readonly _onDidEmitEnvelope = new Emitter<{ readonly channel: string; readonly action: { readonly type: ActionType } }>();
	readonly onDidEmitEnvelope = this._onDidEmitEnvelope.event;

	getSessionSummary(session: string): { readonly _meta?: Record<string, unknown> } | undefined {
		return this.summaries.get(session);
	}

	fireEnvelope(channel: string, type: ActionType): void {
		this._onDidEmitEnvelope.fire({ channel, action: { type } });
	}
}

suite('AgentHostCustomizationEnablementService', () => {

	const disposables = new DisposableStore();
	const session = 'ahp://copilot/session-1';
	const workspace = URI.file('/repo');
	let storage: AgentHostStorageService;
	let sessionData: TestSessionDataService;
	let configuration: TestConfigurationService;
	let state: TestSessionState;
	let service: AgentHostCustomizationEnablementService;

	const plugin: ICustomizationEnablementTarget = {
		id: 'plugin-materialized-hash-one',
		type: CustomizationType.Plugin,
		name: 'Plugin',
		source: URI.file('/plugins/example'),
	};

	setup(async () => {
		storage = disposables.add(new AgentHostStorageService(undefined, new NullLogService()));
		sessionData = new TestSessionDataService();
		configuration = new TestConfigurationService();
		configuration.directories.set(session, [workspace.toString()]);
		state = new TestSessionState();
		service = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, configuration, state, new NullLogService()));
		await service.initializeSession(session);
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves session, workspace, global, and default decisions in precedence order', () => {
		service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, true);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
		const resolved = service.resolve(session, plugin);
		assert.strictEqual(resolved.kind, 'resolved');
		if (resolved.kind === 'resolved') {
			assert.deepStrictEqual({
				enablement: resolved.enablement,
				enabled: resolved.enabled,
				derived: isCustomizationEnabled({ enablement: resolved.enablement }),
			}, {
				enablement: [
					{ kind: CustomizationEnablementKind.Session, enabled: false },
					{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: true },
					{ kind: CustomizationEnablementKind.Global, enabled: false },
				],
				enabled: false,
				derived: false,
			});
		}
	});

	test('clears entries that match inherited decisions through set, change, clear, and re-set transitions', () => {
		service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, true);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Global, true);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);

		assert.deepStrictEqual(storage.get('customizationEnablement'), {
			global: {
				'file:///plugins/example': false,
			},
		});
	});

	test('derives exact durable and session keys, preserving a plugin server decision across materialized edits', () => {
		const pluginServer: ICustomizationEnablementTarget = {
			id: 'mcp-materialized-hash-one',
			type: CustomizationType.McpServer,
			name: 'slack',
			source: URI.file('/agentPlugins/example/hash-one/.mcp.json'),
			owningPluginSource: URI.file('/plugins/example'),
		};
		const editedPluginServer: ICustomizationEnablementTarget = {
			...pluginServer,
			id: 'mcp-materialized-hash-two',
			source: URI.file('/agentPlugins/example/hash-two/.mcp.json'),
		};
		const topLevelServer: ICustomizationEnablementTarget = {
			id: 'session-mcp-id',
			type: CustomizationType.McpServer,
			name: 'stdio',
			source: URI.file('/repo/.vscode/mcp.json'),
		};

		assert.deepStrictEqual({
			plugin: getCustomizationEnablementKey(plugin, CustomizationEnablementKind.Global),
			pluginServer: getCustomizationEnablementKey(pluginServer, CustomizationEnablementKind.Workspace),
			topLevelServer: getCustomizationEnablementKey(topLevelServer, CustomizationEnablementKind.Global),
			session: getCustomizationEnablementKey(pluginServer, CustomizationEnablementKind.Session),
		}, {
			plugin: 'file:///plugins/example',
			pluginServer: 'file:///plugins/example#mcp=slack',
			topLevelServer: 'mcpServers#stdio',
			session: 'mcp-materialized-hash-one',
		});

		service.setEnablement(session, pluginServer, CustomizationEnablementKind.Global, false);
		const editedResolution = service.resolve(session, editedPluginServer);
		assert.strictEqual(editedResolution.kind, 'resolved');
		if (editedResolution.kind === 'resolved') {
			assert.deepStrictEqual(editedResolution.enablement, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
		}
	});

	test('models working-directory states without treating pending as workspace-less', () => {
		configuration.directories.delete(session);
		assert.deepStrictEqual(service.getWorkingDirectoryState(session), { kind: 'pending' });
		assert.deepStrictEqual(service.resolve(session, plugin), { kind: 'pending', reason: 'workingDirectory' });
		assert.deepStrictEqual(service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false), { kind: 'pending', reason: 'workingDirectory' });
		assert.deepStrictEqual(storage.get('customizationEnablement'), { global: { 'file:///plugins/example': false } });

		state.summaries.set(session, { _meta: withSessionWorkspaceless(undefined, true) });
		assert.deepStrictEqual(service.getWorkingDirectoryState(session), { kind: 'workspaceless' });

		state.summaries.set(session, {});
		configuration.pending.add(session);
		assert.deepStrictEqual(service.getWorkingDirectoryState(session), { kind: 'pending' });

		configuration.pending.delete(session);
		configuration.directories.set(session, [workspace.toString()]);
		const directoryState = service.getWorkingDirectoryState(session);
		assert.deepStrictEqual(directoryState.kind === 'directory' ? { kind: directoryState.kind, uri: directoryState.uri.toString() } : directoryState, { kind: 'directory', uri: workspace.toString() });
	});

	test('announces when a session enablement cache transitions from pending to resolved', async () => {
		let resolveLoad: (value: string | undefined) => void;
		sessionData.metadataLoad = new Promise(resolve => { resolveLoad = resolve; });
		const loading = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, configuration, state, new NullLogService()));
		const changes: string[] = [];
		disposables.add(loading.onDidChange(value => changes.push(value)));

		const load = loading.initializeSession(session);
		assert.deepStrictEqual(loading.resolve(session, plugin), { kind: 'pending', reason: 'session' });
		resolveLoad!(undefined);
		await load;
		await loading.initializeSession(session);

		assert.deepStrictEqual({
			changes,
			resolution: loading.resolve(session, plugin).kind,
		}, {
			changes: [session],
			resolution: 'resolved',
		});
	});

	test('announces working-directory and worktree-pending transitions', () => {
		state.summaries.set(session, {});
		configuration.directories.delete(session);
		const changes: string[] = [];
		disposables.add(service.onDidChange(value => changes.push(value)));
		assert.deepStrictEqual(service.resolve(session, plugin), { kind: 'pending', reason: 'workingDirectory' });

		configuration.directories.set(session, [workspace.toString()]);
		state.fireEnvelope(session, ActionType.SessionWorkingDirectorySet);
		assert.strictEqual(service.resolve(session, plugin).kind, 'resolved');

		configuration.pending.add(session);
		assert.deepStrictEqual(service.resolve(session, plugin), { kind: 'pending', reason: 'workingDirectory' });
		configuration.pending.delete(session);
		configuration.firePendingChange(AgentSession.id(session));

		assert.deepStrictEqual({
			changes,
			resolution: service.resolve(session, plugin).kind,
		}, {
			changes: [session, session],
			resolution: 'resolved',
		});
	});

	test('rebuilds the authoritative synchronous session cache after reopening', async () => {
		service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
		await service.whenIdle();
		const reopened = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, configuration, state, new NullLogService()));
		await reopened.initializeSession(session);

		const resolved = reopened.resolve(session, plugin);
		assert.strictEqual(resolved.kind, 'resolved');
		if (resolved.kind === 'resolved') {
			assert.deepStrictEqual(resolved.enablement, [{ kind: CustomizationEnablementKind.Session, enabled: false }]);
		}
	});

	test('evicts the least recently written durable decision at the 512-entry cap', () => {
		for (let i = 0; i <= 512; i++) {
			service.setEnablement(session, {
				id: `plugin-${i}`,
				type: CustomizationType.Plugin,
				name: `Plugin ${i}`,
				source: URI.file(`/plugins/${i}`),
			}, CustomizationEnablementKind.Global, false);
		}

		const persisted = storage.get<{ global: Record<string, boolean> }>('customizationEnablement')!;
		assert.deepStrictEqual({
			count: Object.keys(persisted.global).length,
			evicted: persisted.global['file:///plugins/0'],
			oldestRetained: persisted.global['file:///plugins/1'],
			newestRetained: persisted.global['file:///plugins/512'],
		}, {
			count: 512,
			evicted: undefined,
			oldestRetained: false,
			newestRetained: false,
		});
	});
});
