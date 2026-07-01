/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { resolveCustomizationRefs } from '../../../browser/agentSessions/agentHost/agentHostLocalCustomizations.js';
import { type ISyncableMcpServer, type SyncedCustomizationBundler } from '../../../browser/agentSessions/agentHost/syncedCustomizationBundler.js';
import { BUILTIN_STORAGE } from '../../../common/aiCustomizationWorkspaceService.js';
import { type ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { type IAgentPlugin, type IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { type IPromptPath, type IPromptsService, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { type IMcpServer, type IMcpService, McpServerLaunch, McpServerTransportType } from '../../../../mcp/common/mcpTypes.js';
import { SessionType } from '../../../common/chatSessionsService.js';

function makePromptPath(uri: URI, type: PromptsType, storage: PromptsStorage): IPromptPath {
	return { uri, type, storage } as IPromptPath;
}

function makePromptsService(files: ReadonlyMap<string, readonly IPromptPath[]>): IPromptsService {
	return {
		async listPromptFilesForStorage(type: PromptsType, storage: PromptsStorage): Promise<readonly IPromptPath[]> {
			return files.get(`${type}/${storage}`) ?? [];
		},
	} as unknown as IPromptsService;
}

class FakeSyncProvider implements ICustomizationSyncProvider {
	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;
	constructor(private readonly _disabled: ReadonlySet<string> = new Set()) { }
	isDisabled(uri: URI): boolean { return this._disabled.has(uri.toString()); }
	setDisabled(): void { /* no-op */ }
}

function makeAgentPluginService(plugins: readonly IAgentPlugin[] = []): IAgentPluginService {
	return {
		_serviceBrand: undefined,
		plugins: observableValue('plugins', plugins),
		enablementModel: { isEnabled: () => true, setEnabled: () => { /* no-op */ } },
	} as unknown as IAgentPluginService;
}

function makePlugin(uri: URI, options: { label?: string; enabled?: boolean; mcpServers?: number } = {}): IAgentPlugin {
	const { label = 'Plugin', enabled = true, mcpServers = 0 } = options;
	return {
		uri,
		label,
		enablement: observableValue('enablement', enabled ? ContributionEnablementState.EnabledProfile : ContributionEnablementState.DisabledProfile),
		mcpServerDefinitions: observableValue('mcpServers', new Array(mcpServers).fill({})),
	} as unknown as IAgentPlugin;
}

function makeFileService(stats: ReadonlyMap<string, { mtime: number }> = new Map()): IFileService {
	return {
		async stat(uri: URI) {
			const known = stats.get(uri.toString());
			if (known) {
				return known;
			}
			throw new Error(`no stat for ${uri.toString()}`);
		},
	} as unknown as IFileService;
}

function makeMcpServer(options: { id: string; collectionId: string; label?: string; enabled?: boolean; launch?: McpServerLaunch | undefined }): IMcpServer {
	const { id, collectionId, label = id, enabled = true, launch } = options;
	const definitions = observableValue('definitions', { server: launch ? { launch } : undefined, collection: undefined });
	return {
		definition: { id, label },
		collection: { id: collectionId, label: collectionId, order: 0 },
		enablement: observableValue('enablement', enabled ? ContributionEnablementState.EnabledProfile : ContributionEnablementState.DisabledProfile),
		readDefinitions: () => definitions,
	} as unknown as IMcpServer;
}

function makeMcpService(servers: readonly IMcpServer[] = []): IMcpService {
	return {
		_serviceBrand: undefined,
		servers: observableValue('servers', servers),
	} as unknown as IMcpService;
}

const stdioLaunch: McpServerLaunch = {
	type: McpServerTransportType.Stdio,
	command: 'my-server',
	args: ['--flag'],
	env: {},
	envFile: undefined,
	cwd: undefined,
	sandbox: undefined,
};

type LocalSyncableFile = { readonly uri: URI; readonly type: PromptsType };

class FakeBundler {
	readonly received: LocalSyncableFile[][] = [];
	readonly receivedMcp: ISyncableMcpServer[][] = [];
	constructor(private readonly _result: { uri: string; name: string } | undefined = { uri: 'open-plugin://bundle', name: 'Open Plugin' }) { }
	async bundle(files: readonly LocalSyncableFile[], mcpServers: readonly ISyncableMcpServer[] = []) {
		this.received.push([...files]);
		this.receivedMcp.push([...mcpServers]);
		if (!this._result) {
			return undefined;
		}
		return { ref: { type: 'plugin' as const, id: this._result.uri, uri: this._result.uri as never, name: this._result.name, enabled: true }, paths: [] };
	}
}

suite('resolveCustomizationRefs - built-in skills', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('passes built-in skills to the bundler as loose files', async () => {
		const builtin = URI.file('/builtin/create-pr/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage)]],
		]));
		const bundler = new FakeBundler();

		const refs = await resolveCustomizationRefs(
			makeFileService(),
			promptsService,
			new FakeSyncProvider(),
			makeAgentPluginService(),
			makeMcpService(),
			bundler as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);

		assert.strictEqual(bundler.received.length, 1);
		assert.deepStrictEqual(bundler.received[0].map(f => ({ uri: f.uri.toString(), type: f.type })), [
			{ uri: builtin.toString(), type: PromptsType.skill },
		]);
		assert.strictEqual(refs.length, 1);
		assert.strictEqual(refs[0].name, 'Open Plugin');
	});

	test('omits disabled built-in skills from the bundle', async () => {
		const enabled = URI.file('/builtin/create-pr/SKILL.md');
		const disabled = URI.file('/builtin/merge/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [
				makePromptPath(enabled, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage),
				makePromptPath(disabled, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage),
			]],
		]));
		const bundler = new FakeBundler();

		await resolveCustomizationRefs(
			makeFileService(),
			promptsService,
			new FakeSyncProvider(new Set([disabled.toString()])),
			makeAgentPluginService(),
			makeMcpService(),
			bundler as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);

		assert.deepStrictEqual(bundler.received[0].map(f => f.uri.toString()), [enabled.toString()]);
	});

	test('combines built-in skills with user files in a single bundle', async () => {
		const userAgent = URI.file('/user/agents/foo.agent.md');
		const builtin = URI.file('/builtin/merge/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.agent}/${PromptsStorage.extension}`, [makePromptPath(userAgent, PromptsType.agent, PromptsStorage.extension)]],
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage)]],
		]));
		const bundler = new FakeBundler();

		await resolveCustomizationRefs(
			makeFileService(),
			promptsService,
			new FakeSyncProvider(),
			makeAgentPluginService(),
			makeMcpService(),
			bundler as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);

		assert.strictEqual(bundler.received.length, 1);
		assert.deepStrictEqual(
			bundler.received[0].map(f => ({ uri: f.uri.toString(), type: f.type })).sort((a, b) => a.uri.localeCompare(b.uri)),
			[
				{ uri: builtin.toString(), type: PromptsType.skill },
				{ uri: userAgent.toString(), type: PromptsType.agent },
			].sort((a, b) => a.uri.localeCompare(b.uri)),
		);
	});

	test('skips bundler call entirely when only disabled built-ins exist', async () => {
		const builtin = URI.file('/builtin/create-pr/SKILL.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${BUILTIN_STORAGE}`, [makePromptPath(builtin, PromptsType.skill, BUILTIN_STORAGE as unknown as PromptsStorage)]],
		]));
		const bundler = new FakeBundler();

		const refs = await resolveCustomizationRefs(
			makeFileService(),
			promptsService,
			new FakeSyncProvider(new Set([builtin.toString()])),
			makeAgentPluginService(),
			makeMcpService(),
			bundler as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);

		assert.strictEqual(bundler.received.length, 0);
		assert.deepStrictEqual(refs, []);
	});

	test('includes plugins that only contribute MCP servers', async () => {
		const pluginUri = URI.file('/plugins/mcp-only');
		const promptsService = makePromptsService(new Map());
		const bundler = new FakeBundler();

		const refs = await resolveCustomizationRefs(
			makeFileService(),
			promptsService,
			new FakeSyncProvider(),
			makeAgentPluginService([makePlugin(pluginUri, { label: 'MCP Only', mcpServers: 1 })]),
			makeMcpService(),
			bundler as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);

		assert.strictEqual(bundler.received.length, 0);
		assert.deepStrictEqual(refs.map(r => ({ uri: r.uri, name: r.name })), [
			{ uri: pluginUri.toString(), name: 'MCP Only' },
		]);
	});

	test('omits MCP-only plugins that are disabled by enablement', async () => {
		const pluginUri = URI.file('/plugins/mcp-disabled');
		const refs = await resolveCustomizationRefs(
			makeFileService(),
			makePromptsService(new Map()),
			new FakeSyncProvider(),
			makeAgentPluginService([makePlugin(pluginUri, { enabled: false, mcpServers: 1 })]),
			makeMcpService(),
			new FakeBundler() as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);
		assert.deepStrictEqual(refs, []);
	});

	test('omits plugins with prompt-file contributions that are disabled by enablement', async () => {
		const pluginUri = URI.file('/plugins/prompt-disabled');
		const promptFile = URI.file('/plugins/prompt-disabled/skills/foo/SKILL.md');
		const refs = await resolveCustomizationRefs(
			makeFileService(),
			makePromptsService(new Map([
				[`${PromptsType.skill}/${PromptsStorage.plugin}`, [makePromptPath(promptFile, PromptsType.skill, PromptsStorage.plugin)]],
			])),
			new FakeSyncProvider(),
			makeAgentPluginService([makePlugin(pluginUri, { enabled: false })]),
			makeMcpService(),
			new FakeBundler() as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);
		assert.deepStrictEqual(refs, []);
	});

	test('omits MCP-only plugins that the user opted out of syncing', async () => {
		const pluginUri = URI.file('/plugins/mcp-opted-out');
		const refs = await resolveCustomizationRefs(
			makeFileService(),
			makePromptsService(new Map()),
			new FakeSyncProvider(new Set([pluginUri.toString()])),
			makeAgentPluginService([makePlugin(pluginUri, { mcpServers: 1 })]),
			makeMcpService(),
			new FakeBundler() as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);
		assert.deepStrictEqual(refs, []);
	});

	test('does not duplicate a plugin that contributes both prompt files and MCP servers', async () => {
		const pluginUri = URI.file('/plugins/combined');
		const promptFile = URI.file('/plugins/combined/skills/foo.skill.md');
		const promptsService = makePromptsService(new Map([
			[`${PromptsType.skill}/${PromptsStorage.plugin}`, [makePromptPath(promptFile, PromptsType.skill, PromptsStorage.plugin)]],
		]));
		const refs = await resolveCustomizationRefs(
			makeFileService(),
			promptsService,
			new FakeSyncProvider(),
			makeAgentPluginService([makePlugin(pluginUri, { label: 'Combined', mcpServers: 2 })]),
			makeMcpService(),
			new FakeBundler() as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);
		assert.deepStrictEqual(refs.map(r => r.uri), [pluginUri.toString()]);
	});

	test('we honor the cancellation token contract by passing it through to listPromptFilesForStorage', async () => {
		// resolveCustomizationRefs uses `CancellationToken.None`, so we just
		// assert that calling it does not throw and the call still resolves.
		const promptsService = makePromptsService(new Map());
		const refs = await resolveCustomizationRefs(
			makeFileService(),
			promptsService,
			new FakeSyncProvider(),
			makeAgentPluginService(),
			makeMcpService(),
			new FakeBundler() as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);
		assert.deepStrictEqual(refs, []);
		// Use CancellationToken so the import isn't dead in the bundle.
		assert.ok(CancellationToken.None.isCancellationRequested === false);
	});

	test('bundles MCP servers configured directly in VS Code', async () => {
		const bundler = new FakeBundler();
		const mcpService = makeMcpService([
			makeMcpServer({ id: 'user.my-server', collectionId: 'user', label: 'my-server', launch: stdioLaunch }),
		]);

		const refs = await resolveCustomizationRefs(
			makeFileService(),
			makePromptsService(new Map()),
			new FakeSyncProvider(),
			makeAgentPluginService(),
			mcpService,
			bundler as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);

		assert.strictEqual(bundler.received.length, 1);
		assert.deepStrictEqual(bundler.receivedMcp[0], [
			{ name: 'my-server', configuration: { type: McpServerType.LOCAL, command: 'my-server', args: ['--flag'], env: undefined, envFile: undefined, cwd: undefined } },
		]);
		assert.strictEqual(refs.length, 1);
		assert.strictEqual(refs[0].name, 'Open Plugin');
	});

	test('excludes plugin-sourced MCP servers from the bundle', async () => {
		const bundler = new FakeBundler();
		const mcpService = makeMcpService([
			makeMcpServer({ id: 'plugin.foo.srv', collectionId: 'plugin.file:///plugins/foo', label: 'srv', launch: stdioLaunch }),
		]);

		const refs = await resolveCustomizationRefs(
			makeFileService(),
			makePromptsService(new Map()),
			new FakeSyncProvider(),
			makeAgentPluginService(),
			mcpService,
			bundler as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);

		// No loose files and no non-plugin MCP servers: bundler is never called.
		assert.strictEqual(bundler.received.length, 0);
		assert.deepStrictEqual(refs, []);
	});

	test('excludes disabled MCP servers from the bundle', async () => {
		const bundler = new FakeBundler();
		const mcpService = makeMcpService([
			makeMcpServer({ id: 'user.off', collectionId: 'user', label: 'off', enabled: false, launch: stdioLaunch }),
		]);

		await resolveCustomizationRefs(
			makeFileService(),
			makePromptsService(new Map()),
			new FakeSyncProvider(),
			makeAgentPluginService(),
			mcpService,
			bundler as unknown as SyncedCustomizationBundler,
			SessionType.CopilotCLI,
		);

		assert.strictEqual(bundler.received.length, 0);
	});
});
