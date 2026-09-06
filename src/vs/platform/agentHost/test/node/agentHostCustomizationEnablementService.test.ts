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
import { SessionStatus, withSessionWorkspaceless, type SessionSummary, type Turn } from '../../common/state/sessionState.js';
import { ISessionDataService, type ISessionDatabase } from '../../common/sessionDataService.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { CustomizationEnablementKind, CustomizationType } from '../../common/state/protocol/channels-session/state.js';
import { AgentHostCustomizationEnablementService, getCustomizationEnablementKey, type ICustomizationEnablementTarget } from '../../node/agentHostCustomizationEnablementService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostStorageService } from '../../node/agentHostStorageService.js';
import { NullAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';
import { TestSessionDatabase } from '../common/sessionTestHelpers.js';

class EnablementSessionDatabase extends TestSessionDatabase {
	metadataLoad: Promise<string | undefined> | undefined;

	override getMetadata(key: string): Promise<string | undefined> {
		return this.metadataLoad ?? super.getMetadata(key);
	}
}

class TestSessionDataService implements ISessionDataService {
	declare readonly _serviceBrand: undefined;
	private readonly _databases = new Map<string, EnablementSessionDatabase>();
	private _metadataLoad: Promise<string | undefined> | undefined;
	readonly onWillDeleteSessionData = Event.None;

	set metadataLoad(value: Promise<string | undefined> | undefined) {
		this._metadataLoad = value;
		for (const database of this._databases.values()) {
			database.metadataLoad = value;
		}
	}

	getSessionDataDir(session: URI): URI {
		return URI.joinPath(URI.from({ scheme: 'inmemory', path: '/session-data' }), session.path);
	}

	getSessionDataDirById(sessionId: string): URI {
		return URI.from({ scheme: 'inmemory', path: `/session-data/${sessionId}` });
	}

	openDatabase(session: URI): IReference<ISessionDatabase> {
		return {
			object: this._database(session),
			dispose: () => { },
		};
	}

	async tryOpenDatabase(session: URI): Promise<IReference<ISessionDatabase> | undefined> {
		return this.openDatabase(session);
	}

	async deleteSessionData(): Promise<void> { }

	async cleanupOrphanedData(): Promise<void> { }

	async whenIdle(): Promise<void> { }

	async getMetadata(session: string, key: string): Promise<string | undefined> {
		return this._database(URI.parse(session)).getMetadata(key);
	}

	private _database(session: URI): EnablementSessionDatabase {
		const key = session.toString();
		let database = this._databases.get(key);
		if (database === undefined) {
			database = new EnablementSessionDatabase();
			database.metadataLoad = this._metadataLoad;
			this._databases.set(key, database);
		}
		return database;
	}
}

function makeSummary(resource: string, workingDirectories?: string[], meta?: Record<string, unknown>): SessionSummary {
	return {
		resource,
		provider: 'copilot',
		title: 'Session',
		status: SessionStatus.Idle,
		createdAt: new Date().toISOString(),
		modifiedAt: new Date().toISOString(),
		project: { uri: 'file:///repo', displayName: 'repo' },
		workingDirectories,
		_meta: meta,
	};
}

function serializableResolution(resolution: ReturnType<AgentHostCustomizationEnablementService['resolve']>) {
	if (resolution.kind === 'pending' || resolution.workingDirectory.kind !== 'directory') {
		return resolution;
	}
	return {
		...resolution,
		workingDirectory: {
			kind: resolution.workingDirectory.kind,
			uri: resolution.workingDirectory.uri.toString(),
		},
	};
}

class TestWorktreeIsolation extends NullAgentHostWorktreeIsolation {
	override readonly supported = true;
	readonly pending = new Set<string>();
	private readonly _onDidChangeWorkingDirectoryPending = new Emitter<string>();
	override readonly onDidChangeWorkingDirectoryPending: Event<string> = this._onDidChangeWorkingDirectoryPending.event;

	override isWorkingDirectoryPending(session: string): boolean {
		return this.pending.has(session);
	}

	override async applyRestoreAnnouncement(_sessionUri: URI, turns: readonly Turn[]): Promise<readonly Turn[]> {
		return turns;
	}

	firePendingChange(sessionId: string): void {
		this._onDidChangeWorkingDirectoryPending.fire(sessionId);
	}
}

suite('AgentHostCustomizationEnablementService', () => {

	const disposables = new DisposableStore();
	const session = 'ahp://copilot/session-1';
	const workspace = URI.file('/repo');
	let storage: AgentHostStorageService;
	let sessionData: TestSessionDataService;
	let worktree: TestWorktreeIsolation;
	let state: AgentHostStateManager;
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
		state = disposables.add(new AgentHostStateManager(new NullLogService()));
		state.createSession(makeSummary(session, [workspace.toString()]));
		worktree = new TestWorktreeIsolation();
		service = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, state, new NullLogService(), worktree));
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

	test('resolves a workspace decision for a newly registered session', async () => {
		service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false);
		const newSession = 'ahp://copilot/session-2';
		state.createSession(makeSummary(newSession, [workspace.toString()]));
		await service.initializeSession(newSession);

		const resolved = service.resolve(newSession, plugin);

		assert.deepStrictEqual(serializableResolution(resolved), {
			kind: 'resolved',
			enabled: false,
			enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false }],
			workingDirectory: { kind: 'directory', uri: workspace.toString() },
		});
	});

	test('resolves a global decision for a newly registered plugin MCP child', async () => {
		const server: ICustomizationEnablementTarget = {
			id: 'mcp-materialized-hash-one',
			type: CustomizationType.McpServer,
			name: 'azure',
			source: URI.file('/agentPlugins/example/hash-one/.mcp.json'),
			owningPluginSource: plugin.source,
		};
		service.setEnablement(session, server, CustomizationEnablementKind.Global, false);
		const newSession = 'ahp://copilot/session-2';
		state.createSession(makeSummary(newSession, [workspace.toString()]));
		await service.initializeSession(newSession);

		assert.deepStrictEqual(serializableResolution(service.resolve(newSession, {
			...server,
			id: 'mcp-materialized-hash-two',
			source: URI.file('/agentPlugins/example/hash-two/.mcp.json'),
		})), {
			kind: 'resolved',
			enabled: false,
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			workingDirectory: { kind: 'directory', uri: workspace.toString() },
		});
	});

	test('resolves the complete global, workspace, and session matrix with sorted explicit decisions', () => {
		const values: Array<boolean | undefined> = [undefined, true, false];
		const cases = values.flatMap(global => values.flatMap(workspaceDecision => values.map(sessionDecision => {
			service.setEnablement(session, plugin, CustomizationEnablementKind.Global, true);
			service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, true);
			service.setEnablement(session, plugin, CustomizationEnablementKind.Session, true);

			if (global !== undefined) {
				service.setEnablement(session, plugin, CustomizationEnablementKind.Global, global);
			}
			if (workspaceDecision !== undefined) {
				service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, workspaceDecision);
			}
			if (sessionDecision !== undefined) {
				service.setEnablement(session, plugin, CustomizationEnablementKind.Session, sessionDecision);
			}

			const globalEnabled = global ?? true;
			const hasWorkspaceDecision = workspaceDecision !== undefined && workspaceDecision !== globalEnabled;
			const workspaceEnabled = hasWorkspaceDecision ? workspaceDecision! : globalEnabled;
			const hasSessionDecision = sessionDecision !== undefined && sessionDecision !== workspaceEnabled;
			const resolved = service.resolve(session, plugin);
			assert.strictEqual(resolved.kind, 'resolved');
			return {
				input: { global, workspace: workspaceDecision, session: sessionDecision },
				resolution: resolved.kind === 'resolved' ? {
					enabled: resolved.enabled,
					enablement: resolved.enablement,
				} : resolved,
				expected: {
					enabled: hasSessionDecision ? sessionDecision! : workspaceEnabled,
					enablement: [
						...(hasSessionDecision ? [{ kind: CustomizationEnablementKind.Session, enabled: sessionDecision! }] : []),
						...(hasWorkspaceDecision ? [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: workspaceDecision! }] : []),
						...(global === false ? [{ kind: CustomizationEnablementKind.Global, enabled: false }] : []),
					],
				},
			};
		})));

		assert.deepStrictEqual(cases.map(({ input, resolution }) => ({ input, resolution })), cases.map(({ input, expected }) => ({ input, resolution: expected })));
	});


	test('keeps host decisions above a client global base', () => {
		const clientPlugin = { ...plugin, isClientBundled: true };
		service.setEnablement(session, clientPlugin, CustomizationEnablementKind.Global, false);
		service.setEnablement(session, clientPlugin, CustomizationEnablementKind.Workspace, true);
		service.setEnablement(session, clientPlugin, CustomizationEnablementKind.Session, false);

		const resolution = service.applyClientGlobalEnablement(session, clientPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);

		assert.strictEqual(resolution.kind, 'resolved');
		if (resolution.kind === 'resolved') {
			assert.deepStrictEqual({
				enablement: resolution.enablement,
				enabled: resolution.enabled,
			}, {
				enablement: [
					{ kind: CustomizationEnablementKind.Session, enabled: false },
					{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: true },
					{ kind: CustomizationEnablementKind.Global, enabled: false },
				],
				enabled: false,
			});
		}
	});

	test('keeps a host global decision through a stale client republish', () => {
		const clientPlugin = { ...plugin, isClientBundled: true };

		service.replaceEnablement(session, clientPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
		const resolution = service.applyClientGlobalEnablement(session, clientPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);

		assert.deepStrictEqual({
			resolution: serializableResolution(resolution),
			persisted: storage.get('customizationEnablement'),
		}, {
			resolution: {
				kind: 'resolved',
				enabled: false,
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
			},
			persisted: {
				global: { 'file:///plugins/example': false },
			},
		});
	});

	test('uses a client global base when the host has no decision', () => {
		const clientPlugin = { ...plugin, isClientBundled: true };
		const disabled = service.applyClientGlobalEnablement(session, clientPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
		const enabled = service.applyClientGlobalEnablement(session, clientPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);

		assert.deepStrictEqual({
			disabled: serializableResolution(disabled),
			enabled: serializableResolution(enabled),
			persisted: storage.get('customizationEnablement'),
		}, {
			disabled: {
				kind: 'resolved',
				enabled: false,
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
			},
			enabled: {
				kind: 'resolved',
				enabled: true,
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
			},
			persisted: undefined,
		});
	});

	test('retains and clears host decisions relative to the client base', () => {
		const clientPlugin = { ...plugin, isClientBundled: true };
		service.applyClientGlobalEnablement(session, clientPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
		service.setEnablement(session, clientPlugin, CustomizationEnablementKind.Global, true);
		const hostOverride = structuredClone(storage.get('customizationEnablement'));
		service.setEnablement(session, clientPlugin, CustomizationEnablementKind.Workspace, false);
		service.setEnablement(session, clientPlugin, CustomizationEnablementKind.Global, false);

		assert.deepStrictEqual({
			hostOverride,
			afterInheritingClientBase: {
				resolution: serializableResolution(service.resolve(session, clientPlugin)),
				persisted: storage.get('customizationEnablement'),
			},
		}, {
			hostOverride: {
				global: { 'file:///plugins/example': true },
			},
			afterInheritingClientBase: {
				resolution: {
					kind: 'resolved',
					enabled: false,
					enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
					workingDirectory: { kind: 'directory', uri: workspace.toString() },
				},
				persisted: undefined,
			},
		});
	});

	test('retains host-owned MCP decisions when an unbundled client republish asserts enabled', async () => {
		const pluginSource = URI.parse('file:///Users/connor/.vscode-oss-dev-dev/agent-plugins/github.com/microsoft/azure-skills/.github/plugins/azure-skills');
		const azureSkillsPlugin: ICustomizationEnablementTarget = {
			id: 'azure-skills-plugin',
			type: CustomizationType.Plugin,
			name: 'azure-skills',
			source: pluginSource,
			isClientBundled: true,
		};
		const azure: ICustomizationEnablementTarget = {
			id: 'file:///Users/connor/.vscode-oss-dev/agentPlugins/file-azure-skills/19ff2ac36f2/.mcp.json#mcp=azure',
			type: CustomizationType.McpServer,
			name: 'azure',
			source: URI.parse('file:///Users/connor/.vscode-oss-dev/agentPlugins/file-azure-skills/19ff2ac36f2/.mcp.json'),
			owningPluginSource: pluginSource,
			isClientBundled: false,
		};
		service.setEnablement(session, azure, CustomizationEnablementKind.Global, false);
		service.applyClientGlobalEnablement(session, azureSkillsPlugin, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);
		const afterGlobalRepublish = service.resolve(session, azure);

		service.setEnablement(session, azure, CustomizationEnablementKind.Workspace, true);
		const afterWorkspaceRepublish = service.applyClientGlobalEnablement(session, azure, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);
		const newSession = 'ahp://copilot/session-azure';
		state.createSession(makeSummary(newSession, [workspace.toString()]));
		await service.initializeSession(newSession);

		assert.deepStrictEqual({
			afterGlobalRepublish: serializableResolution(afterGlobalRepublish),
			afterWorkspaceRepublish: serializableResolution(afterWorkspaceRepublish),
			newSession: serializableResolution(service.resolve(newSession, azure)),
			persisted: storage.get('customizationEnablement'),
		}, {
			afterGlobalRepublish: {
				kind: 'resolved',
				enabled: false,
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
			},
			afterWorkspaceRepublish: {
				kind: 'resolved',
				enabled: true,
				enablement: [
					{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: true },
					{ kind: CustomizationEnablementKind.Global, enabled: false },
				],
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
			},
			newSession: {
				kind: 'resolved',
				enabled: true,
				enablement: [
					{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: true },
					{ kind: CustomizationEnablementKind.Global, enabled: false },
				],
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
			},
			persisted: {
				global: {
					'file:///Users/connor/.vscode-oss-dev-dev/agent-plugins/github.com/microsoft/azure-skills/.github/plugins/azure-skills#mcp=azure': false,
				},
				workingDirectories: {
					'file:///repo': {
						'file:///Users/connor/.vscode-oss-dev-dev/agent-plugins/github.com/microsoft/azure-skills/.github/plugins/azure-skills#mcp=azure': true,
					},
				},
			},
		});
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

	test('persists only scope decisions that differ from their inherited values', async () => {
		service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, true);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Session, true);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
		await service.whenIdle();

		const withOverrides = {
			durable: structuredClone(storage.get<Record<string, unknown>>('customizationEnablement')),
			session: await sessionData.getMetadata(session, 'customizationEnablement'),
		};

		service.setEnablement(session, plugin, CustomizationEnablementKind.Session, true);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Global, true);
		await service.whenIdle();

		assert.deepStrictEqual({
			withOverrides,
			afterClearingInheritedValues: {
				durable: storage.get('customizationEnablement'),
				session: await sessionData.getMetadata(session, 'customizationEnablement'),
			},
		}, {
			withOverrides: {
				durable: {
					global: { 'file:///plugins/example': false },
					workingDirectories: {
						'file:///repo': { 'file:///plugins/example': true },
					},
				},
				session: '{"plugin-materialized-hash-one":false}',
			},
			afterClearingInheritedValues: {
				durable: undefined,
				session: '{}',
			},
		});
	});

	test('prunes workspace entries that match an incoming global decision without erasing opposing directories', async () => {
		const matchingDirectory = URI.file('/matching');
		const opposingDirectory = URI.file('/opposing');
		const untouchedDirectory = URI.file('/untouched');
		const preloadedStorage = disposables.add(new AgentHostStorageService(undefined, new NullLogService()));
		preloadedStorage.set('customizationEnablement', {
			workingDirectories: {
				[matchingDirectory.toString()]: { 'file:///plugins/example': false },
				[opposingDirectory.toString()]: { 'file:///plugins/example': true },
			},
		});
		const pruningService = disposables.add(new AgentHostCustomizationEnablementService(preloadedStorage, sessionData, state, new NullLogService(), worktree));
		await pruningService.initializeSession(session);

		pruningService.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);

		const resolutions = [];
		for (const directory of [matchingDirectory, opposingDirectory, untouchedDirectory]) {
			const directorySession = `ahp://copilot${directory.path}`;
			state.createSession(makeSummary(directorySession, [directory.toString()]));
			await pruningService.initializeSession(directorySession);
			const resolution = pruningService.resolve(directorySession, plugin);
			assert.strictEqual(resolution.kind, 'resolved');
			resolutions.push({
				directory: directory.toString(),
				resolution: resolution.kind === 'resolved' ? {
					enabled: resolution.enabled,
					enablement: resolution.enablement,
				} : resolution,
			});
		}

		assert.deepStrictEqual({
			persisted: preloadedStorage.get('customizationEnablement'),
			resolutions,
		}, {
			persisted: {
				global: { 'file:///plugins/example': false },
				workingDirectories: {
					'file:///opposing': { 'file:///plugins/example': true },
				},
			},
			resolutions: [
				{
					directory: 'file:///matching',
					resolution: {
						enabled: false,
						enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
					},
				},
				{
					directory: 'file:///opposing',
					resolution: {
						enabled: true,
						enablement: [
							{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///opposing', enabled: true },
							{ kind: CustomizationEnablementKind.Global, enabled: false },
						],
					},
				},
				{
					directory: 'file:///untouched',
					resolution: {
						enabled: false,
						enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
					},
				},
			],
		});
	});

	test('replaces rather than patches decisions through set, replacement, clear, and re-set transitions', async () => {
		service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, true);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
		await service.whenIdle();

		const globalOnly = service.replaceEnablement(session, plugin, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, true);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
		const sessionOnly = service.replaceEnablement(session, plugin, [{ kind: CustomizationEnablementKind.Session, enabled: false }]);
		const empty = service.replaceEnablement(session, plugin, []);
		await service.whenIdle();

		assert.deepStrictEqual({
			globalOnly: serializableResolution(globalOnly),
			sessionOnly: serializableResolution(sessionOnly),
			empty: serializableResolution(empty),
			persisted: {
				durable: storage.get('customizationEnablement'),
				session: await sessionData.getMetadata(session, 'customizationEnablement'),
			},
		}, {
			globalOnly: {
				kind: 'resolved',
				enabled: false,
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
			},
			sessionOnly: {
				kind: 'resolved',
				enabled: false,
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
				enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
			},
			empty: {
				kind: 'resolved',
				enabled: true,
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
				enablement: [],
			},
			persisted: {
				durable: undefined,
				session: '{}',
			},
		});
	});
	test('derives exact durable and session keys without plugin-child collisions across materialized edits', () => {
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
			sessionBeforeEdit: getCustomizationEnablementKey(pluginServer, CustomizationEnablementKind.Session),
			sessionAfterEdit: getCustomizationEnablementKey(editedPluginServer, CustomizationEnablementKind.Session),
			pluginAndChildAreDistinct: getCustomizationEnablementKey(plugin, CustomizationEnablementKind.Global) !== getCustomizationEnablementKey(pluginServer, CustomizationEnablementKind.Global),
		}, {
			plugin: 'file:///plugins/example',
			pluginServer: 'file:///plugins/example#mcp=slack',
			topLevelServer: 'mcpServers#stdio',
			sessionBeforeEdit: 'mcp-materialized-hash-one',
			sessionAfterEdit: 'mcp-materialized-hash-two',
			pluginAndChildAreDistinct: true,
		});

		service.setEnablement(session, pluginServer, CustomizationEnablementKind.Global, false);
		service.setEnablement(session, pluginServer, CustomizationEnablementKind.Workspace, true);
		service.setEnablement(session, pluginServer, CustomizationEnablementKind.Session, false);
		const editedResolution = service.resolve(session, editedPluginServer);
		assert.strictEqual(editedResolution.kind, 'resolved');
		if (editedResolution.kind === 'resolved') {
			assert.deepStrictEqual(editedResolution.enablement, [
				{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: true },
				{ kind: CustomizationEnablementKind.Global, enabled: false },
			]);
		}
	});

	test('models working-directory states without treating pending as workspace-less', () => {
		state.deleteSession(session);
		assert.deepStrictEqual(service.getWorkingDirectoryState(session), { kind: 'pending' });
		assert.deepStrictEqual(service.resolve(session, plugin), { kind: 'pending', reason: 'workingDirectory' });
		assert.deepStrictEqual(service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false), { kind: 'pending', reason: 'workingDirectory' });
		assert.deepStrictEqual(storage.get('customizationEnablement'), { global: { 'file:///plugins/example': false } });

		state.createSession(makeSummary(session, undefined, withSessionWorkspaceless(undefined, true)));
		assert.deepStrictEqual(service.getWorkingDirectoryState(session), { kind: 'workspaceless' });

		state.setSessionMeta(session, undefined);
		worktree.pending.add(AgentSession.id(session));
		assert.deepStrictEqual(service.getWorkingDirectoryState(session), { kind: 'pending' });

		worktree.pending.delete(AgentSession.id(session));
		state.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: workspace.toString() });
		const directoryState = service.getWorkingDirectoryState(session);
		assert.deepStrictEqual(directoryState.kind === 'directory' ? { kind: directoryState.kind, uri: directoryState.uri.toString() } : directoryState, { kind: 'directory', uri: workspace.toString() });
	});

	test('queues a workspace replacement while the working directory is pending and applies it when registered', () => {
		state.deleteSession(session);
		const replacement = service.replaceEnablement(session, plugin, [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false }]);
		state.createSession(makeSummary(session));
		state.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: workspace.toString() });

		assert.deepStrictEqual({
			replacement,
			resolution: serializableResolution(service.resolve(session, plugin)),
		}, {
			replacement: { kind: 'pending', reason: 'workingDirectory' },
			resolution: {
				kind: 'resolved',
				enabled: false,
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
				enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false }],
			},
		});

	});

	test('queues a workspace write while the working directory is pending and applies it when registered', () => {
		state.deleteSession(session);
		const write = service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false);
		state.createSession(makeSummary(session));
		state.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: workspace.toString() });

		assert.deepStrictEqual({
			write,
			resolution: serializableResolution(service.resolve(session, plugin)),
		}, {
			write: { kind: 'pending', reason: 'workingDirectory' },
			resolution: {
				kind: 'resolved',
				enabled: false,
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
				enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false }],
			},
		});
	});

	test('queues a replacement before loading the session cache and applies it after loading', async () => {
		let resolveLoad: (value: string | undefined) => void;
		sessionData.metadataLoad = new Promise(resolve => { resolveLoad = resolve; });
		const loading = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, state, new NullLogService(), worktree));
		const load = loading.initializeSession(session);
		const replacement = loading.replaceEnablement(session, plugin, [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false }]);
		resolveLoad!(undefined);
		await load;

		assert.deepStrictEqual({
			replacement,
			resolution: serializableResolution(loading.resolve(session, plugin)),
		}, {
			replacement: { kind: 'pending', reason: 'session' },
			resolution: {
				kind: 'resolved',
				enabled: false,
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
				enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: workspace.toString(), enabled: false }],
			},
		});
	});

	test('rejects workspace writes for workspace-less sessions', () => {
		state.deleteSession(session);
		state.createSession(makeSummary(session, undefined, withSessionWorkspaceless(undefined, true)));

		assert.throws(
			() => service.setEnablement(session, plugin, CustomizationEnablementKind.Workspace, false),
			/Cannot record workspace enablement for a workspace-less session/,
		);
	});

	test('announces when a session enablement cache transitions from pending to resolved', async () => {
		let resolveLoad: (value: string | undefined) => void;
		sessionData.metadataLoad = new Promise(resolve => { resolveLoad = resolve; });
		const loading = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, state, new NullLogService(), worktree));
		const changes: string[][] = [];
		disposables.add(loading.onDidChange(event => changes.push([...event.sessions])));

		const load = loading.initializeSession(session);
		assert.deepStrictEqual(loading.resolve(session, plugin), { kind: 'pending', reason: 'session' });
		resolveLoad!(undefined);
		await load;
		await loading.initializeSession(session);

		assert.deepStrictEqual({
			changes,
			resolution: loading.resolve(session, plugin).kind,
		}, {
			changes: [[session]],
			resolution: 'resolved',
		});
	});

	test('announces working-directory and worktree-pending transitions', () => {
		state.deleteSession(session);
		const changes: string[][] = [];
		disposables.add(service.onDidChange(event => changes.push([...event.sessions])));
		assert.deepStrictEqual(service.resolve(session, plugin), { kind: 'pending', reason: 'workingDirectory' });

		state.createSession(makeSummary(session));
		state.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: workspace.toString() });
		assert.strictEqual(service.resolve(session, plugin).kind, 'resolved');

		worktree.pending.add(AgentSession.id(session));
		assert.deepStrictEqual(service.resolve(session, plugin), { kind: 'pending', reason: 'workingDirectory' });
		worktree.pending.delete(AgentSession.id(session));
		worktree.firePendingChange(AgentSession.id(session));

		assert.deepStrictEqual({
			changes,
			resolution: service.resolve(session, plugin).kind,
		}, {
			changes: [[session], [session]],
			resolution: 'resolved',
		});
	});

	test('rebuilds the authoritative synchronous session cache after reopening', async () => {
		service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
		await service.whenIdle();
		const reopened = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, state, new NullLogService(), worktree));
		await reopened.initializeSession(session);

		const resolved = reopened.resolve(session, plugin);
		assert.strictEqual(resolved.kind, 'resolved');
		if (resolved.kind === 'resolved') {
			assert.deepStrictEqual(resolved.enablement, [{ kind: CustomizationEnablementKind.Session, enabled: false }]);
		}
	});

	test('isolates persisted session decisions between sessions for the same customization', async () => {
		const otherSession = 'ahp://copilot/session-2';
		state.createSession(makeSummary(otherSession, [workspace.toString()]));
		await service.initializeSession(otherSession);
		service.setEnablement(session, plugin, CustomizationEnablementKind.Session, false);
		await service.whenIdle();

		const reopened = disposables.add(new AgentHostCustomizationEnablementService(storage, sessionData, state, new NullLogService(), worktree));
		await Promise.all([reopened.initializeSession(session), reopened.initializeSession(otherSession)]);

		assert.deepStrictEqual({
			first: serializableResolution(reopened.resolve(session, plugin)),
			second: serializableResolution(reopened.resolve(otherSession, plugin)),
			persisted: {
				first: await sessionData.getMetadata(session, 'customizationEnablement'),
				second: await sessionData.getMetadata(otherSession, 'customizationEnablement'),
			},
		}, {
			first: {
				kind: 'resolved',
				enabled: false,
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
				enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
			},
			second: {
				kind: 'resolved',
				enabled: true,
				workingDirectory: { kind: 'directory', uri: workspace.toString() },
				enablement: [],
			},
			persisted: {
				first: '{"plugin-materialized-hash-one":false}',
				second: undefined,
			},
		});
	});

	test('emits once for a decision write and does not emit on a no-op session re-initialization', async () => {
		const changes: string[][] = [];
		disposables.add(service.onDidChange(event => changes.push([...event.sessions])));
		service.setEnablement(session, plugin, CustomizationEnablementKind.Global, false);
		await service.initializeSession(session);

		assert.deepStrictEqual(changes, [[session]]);
	});

	test('evicts across global and workspace entries, updating recency only on writes', () => {
		for (let i = 0; i <= 510; i++) {
			service.setEnablement(session, {
				id: `plugin-${i}`,
				type: CustomizationType.Plugin,
				name: `Plugin ${i}`,
				source: URI.file(`/plugins/${i}`),
			}, CustomizationEnablementKind.Global, false);
		}
		const workspaceTarget: ICustomizationEnablementTarget = {
			id: 'workspace-plugin',
			type: CustomizationType.Plugin,
			name: 'Workspace Plugin',
			source: URI.file('/plugins/workspace'),
		};
		service.setEnablement(session, workspaceTarget, CustomizationEnablementKind.Workspace, false);
		service.resolve(session, {
			id: 'plugin-0',
			type: CustomizationType.Plugin,
			name: 'Plugin 0',
			source: URI.file('/plugins/0'),
		});
		service.setEnablement(session, {
			id: 'plugin-511',
			type: CustomizationType.Plugin,
			name: 'Plugin 511',
			source: URI.file('/plugins/511'),
		}, CustomizationEnablementKind.Global, false);
		service.setEnablement(session, workspaceTarget, CustomizationEnablementKind.Workspace, false);
		service.setEnablement(session, {
			id: 'plugin-512',
			type: CustomizationType.Plugin,
			name: 'Plugin 512',
			source: URI.file('/plugins/512'),
		}, CustomizationEnablementKind.Global, false);

		const persisted = storage.get<{ global: Record<string, boolean>; workingDirectories: Record<string, Record<string, boolean>> }>('customizationEnablement')!;
		assert.deepStrictEqual({
			count: Object.keys(persisted.global).length + Object.values(persisted.workingDirectories).reduce((total, decisions) => total + Object.keys(decisions).length, 0),
			readDoesNotRefresh: persisted.global['file:///plugins/0'],
			workspaceRewriteRefreshes: persisted.workingDirectories['file:///repo']?.['file:///plugins/workspace'],
			oldestAfterRewrite: persisted.global['file:///plugins/1'],
			newest: persisted.global['file:///plugins/512'],
		}, {
			count: 512,
			readDoesNotRefresh: undefined,
			workspaceRewriteRefreshes: false,
			oldestAfterRewrite: undefined,
			newest: false,
		});
	});
});
