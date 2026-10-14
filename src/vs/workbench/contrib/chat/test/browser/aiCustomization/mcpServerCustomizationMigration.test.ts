/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { parse } from '../../../../../../base/common/jsonc.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { sep } from '../../../../../../base/common/path.js';
import { IProcessEnvironment } from '../../../../../../base/common/platform.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationOverrides, IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IFileWriteOptions, IStat } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestSecretStorageService } from '../../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { parseWorkspaceRootMcpConfiguration } from '../../../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { IWorkspaceFolderData } from '../../../../../../platform/workspace/common/workspace.js';
import { AbstractVariableResolverService } from '../../../../../services/configurationResolver/common/variableResolver.js';
import { mcpOAuthClientSecretStorageKey } from '../../../../mcp/common/mcpTypes.js';
import { McpServerCustomizationMigrator } from '../../../browser/aiCustomization/mcpServerCustomizationMigration.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerDelivery, AgentHostMcpServerEnablementState, AgentHostMcpServerSourceKind, AgentHostMcpSupportReason, IAgentHostMcpServerSupport, IAgentHostMcpServerSupportSnapshot } from '../../../browser/agentSessions/agentHost/agentHostMcpServerSupport.js';
import { CustomizationMigrationType, IMcpServerCustomizationMigrationCandidate, McpServerCustomizationMigrationFailureReason } from '../../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';

class SourceWriteFailingProvider extends InMemoryFileSystemProvider {
	sourceUri: URI | undefined;
	failSourceWrite = false;

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		if (this.failSourceWrite && this.sourceUri && isEqual(resource, this.sourceUri)) {
			throw new Error('Expected source write failure');
		}
		await super.writeFile(resource, content, options);
	}
}

class SourceWriteCommitThenFailProvider extends InMemoryFileSystemProvider {
	sourceUri: URI | undefined;
	failAfterSourceWrite = false;

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		await super.writeFile(resource, content, options);
		if (this.failAfterSourceWrite && this.sourceUri && isEqual(resource, this.sourceUri)) {
			this.failAfterSourceWrite = false;
			throw new Error('Expected source write rejection after commit');
		}
	}
}

class ConcurrentSourceChangeProvider extends InMemoryFileSystemProvider {
	sourceUri: URI | undefined;
	changeSourceBeforeFailure = false;
	concurrentSourceContent = '';

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		if (this.changeSourceBeforeFailure && this.sourceUri && isEqual(resource, this.sourceUri)) {
			this.changeSourceBeforeFailure = false;
			await super.writeFile(resource, VSBuffer.fromString(this.concurrentSourceContent).buffer, options);
			throw new Error('Expected optimistic concurrency failure');
		}
		await super.writeFile(resource, content, options);
	}
}

class ConcurrentTargetProvider extends InMemoryFileSystemProvider {
	sourceUri: URI | undefined;
	targetUri: URI | undefined;
	changeTargetBeforeSourceWrite = false;

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		if (this.changeTargetBeforeSourceWrite && this.sourceUri && this.targetUri && isEqual(resource, this.sourceUri)) {
			this.changeTargetBeforeSourceWrite = false;
			await super.writeFile(this.targetUri, VSBuffer.fromString('{"mcpServers":{"foreign":{"command":"other"}}}').buffer, {
				create: true,
				overwrite: true,
				unlock: false,
				atomic: false,
			});
		}
		await super.writeFile(resource, content, options);
	}
}

class ConcurrentSourceRestoreProvider extends InMemoryFileSystemProvider {
	sourceUri: URI | undefined;
	restoreSourceAfterWrite = false;
	originalSourceContent = '';

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		await super.writeFile(resource, content, options);
		if (this.restoreSourceAfterWrite && this.sourceUri && isEqual(resource, this.sourceUri)) {
			this.restoreSourceAfterWrite = false;
			await super.writeFile(resource, VSBuffer.fromString(this.originalSourceContent).buffer, options);
		}
	}
}

class ConcurrentSameSizeReadProvider extends InMemoryFileSystemProvider {
	resource: URI | undefined;
	concurrentContent = '';
	private readCount = 0;

	override async readFile(resource: URI): Promise<Uint8Array> {
		if (this.resource && isEqual(resource, this.resource) && ++this.readCount === 2) {
			await super.writeFile(resource, VSBuffer.fromString(this.concurrentContent).buffer, {
				create: true,
				overwrite: true,
				unlock: false,
				atomic: false,
			});
		}
		return super.readFile(resource);
	}
}

class ResolveFailingProvider extends InMemoryFileSystemProvider {
	resource: URI | undefined;
	failAtStat = 0;
	private statCount = 0;

	override async stat(resource: URI): Promise<IStat> {
		if (this.resource && isEqual(resource, this.resource) && ++this.statCount === this.failAtStat) {
			throw new Error('Expected resolve failure');
		}
		return super.stat(resource);
	}
}

class InterleavedMigrationProvider extends InMemoryFileSystemProvider {
	resource: URI | undefined;
	afterWrite: (() => Promise<void>) | undefined;

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		await super.writeFile(resource, content, options);
		if (this.resource && isEqual(resource, this.resource)) {
			const afterWrite = this.afterWrite;
			this.afterWrite = undefined;
			await afterWrite?.();
		}
	}
}

class TestConfigurationResolverService extends AbstractVariableResolverService {
	constructor(folders: readonly IWorkspaceFolderData[] = [], env?: IProcessEnvironment, configurationService: IConfigurationService = new TestConfigurationService()) {
		super({
			getFolderUri: name => folders.find(folder => folder.name === name)?.uri,
			getWorkspaceFolderCount: () => folders.length,
			// Like the workbench resolver, which reads the setting in the folder's scope.
			getConfigurationValue: (folderUri, section) => configurationService.getValue<string>(section, folderUri ? { resource: folderUri } : {}),
			getAppRoot: () => undefined,
			getExecPath: () => undefined,
			getFilePath: () => undefined,
			getSelectedText: () => undefined,
			getLineNumber: () => undefined,
			getColumnNumber: () => undefined,
			getExtension: async () => undefined,
		}, undefined, undefined, env && Promise.resolve(env));
	}
}

/**
 * Reports the given settings as workspace settings, which `TestConfigurationService` reports as user settings.
 */
class WorkspaceSettingsTestConfigurationService extends TestConfigurationService {
	constructor(configuration: Record<string, unknown> = {}, private readonly workspaceKeys: ReadonlySet<string> = new Set(Object.keys(configuration))) {
		super(configuration);
	}

	override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		const inspected = super.inspect<T>(key, overrides);
		return this.workspaceKeys.has(key) ? { ...inspected, userValue: undefined, userLocalValue: undefined, workspaceValue: inspected.value } : inspected;
	}
}

suite('McpServerCustomizationMigration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFileService(provider: InMemoryFileSystemProvider = new InMemoryFileSystemProvider()): FileService {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(provider);
		store.add(fileService.registerProvider(Schemas.file, provider));
		return fileService;
	}

	function createMigrator(fileService: FileService, folders: readonly IWorkspaceFolderData[] = [], env?: IProcessEnvironment, configurationService: IConfigurationService = new TestConfigurationService(), secretStorageService = createSecretStorageService()): McpServerCustomizationMigrator {
		return new McpServerCustomizationMigrator(fileService, new NullLogService(), new TestConfigurationResolverService(folders, env, configurationService), configurationService, secretStorageService);
	}

	function createSecretStorageService(): TestSecretStorageService {
		return store.add(new TestSecretStorageService());
	}

	function candidate(root: URI, name: string, projectedConfiguration: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: 'node' }): IMcpServerCustomizationMigrationCandidate {
		return {
			type: CustomizationMigrationType.McpServers,
			storage: PromptsStorage.local,
			id: `mcp.config.ws0.${name}`,
			name,
			sourceUri: URI.joinPath(root, '.vscode', 'mcp.json'),
			targetUri: URI.joinPath(root, '.mcp.json'),
			projectedConfiguration,
		};
	}

	function support(root: URI, name: string, overrides: Partial<IAgentHostMcpServerSupport> = {}): IAgentHostMcpServerSupport {
		return {
			id: `mcp.config.ws0.${name}`,
			name,
			collectionId: 'mcp.config.ws0',
			source: {
				group: undefined,
				kind: AgentHostMcpServerSourceKind.VscodeWorkspaceFolder,
				label: 'Workspace',
				collectionUri: URI.joinPath(root, '.vscode', 'mcp.json'),
				definitionLocation: undefined,
				remoteAuthority: null,
				extensionId: undefined,
				pluginUri: undefined,
			},
			enablement: { enabled: true, state: AgentHostMcpServerEnablementState.EnabledWorkspace },
			applicability: AgentHostMcpServerApplicability.Applicable,
			delivery: AgentHostMcpServerDelivery.ClientForwarded,
			compatibility: { kind: 'supported' },
			projectedConfiguration: { type: McpServerType.LOCAL, command: 'node' },
			...overrides,
		};
	}

	/**
	 * A server that uses `${input:}`, as the client reports it: not delivered from `.vscode/mcp.json`, or
	 * forwarded from the user configuration, with its variables unresolved in either case.
	 */
	function inputSupport(root: URI, name: string, projectedConfiguration: IMcpServerConfiguration, sourceUri?: URI): IAgentHostMcpServerSupport {
		const server = support(root, name, {
			delivery: sourceUri ? AgentHostMcpServerDelivery.ClientForwarded : AgentHostMcpServerDelivery.NotDelivered,
			compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.RequiresUserInteraction] },
			projectedConfiguration,
		});
		return sourceUri ? { ...server, source: { ...server.source, kind: AgentHostMcpServerSourceKind.UserProfile, collectionUri: sourceUri } } : server;
	}


	function userCandidate(name = 'demo'): IMcpServerCustomizationMigrationCandidate {
		return {
			...candidate(URI.file('/unused'), name),
			storage: PromptsStorage.user,
			sourceUri: URI.file('/profile/mcp.json'),
			targetUri: URI.file('/custom-copilot-home/mcp-config.json'),
		};
	}

	for (const remote of [false, true]) {
		test(`plans and migrates ${remote ? 'remote' : 'local'} user servers without a workspace`, async () => {
			const fileService = createFileService();
			if (remote) {
				store.add(fileService.registerProvider(Schemas.vscodeRemote, store.add(new InMemoryFileSystemProvider())));
			}
			const base = userCandidate();
			const sourceUri = remote ? base.sourceUri.with({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+test' }) : base.sourceUri;
			const targetUri = remote ? base.targetUri.with({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+test' }) : base.targetUri;
			await fileService.writeFile(sourceUri, VSBuffer.fromString(`{
				// Keep unrelated settings and servers.
				"inputs": [{"id": "secret", "type": "promptString"}],
				"servers": {
					"demo": {"command": "node"},
					"http": {"url": "https://example.com", "headers": {"X-Test": "value"}},
					"unselected": {"command": "other"},
					"workspace": {"command": "\${workspaceFolder}/server"},
					"input": {"command": "\${input:secret}"}
				}
			}`));
			const snapshot: IAgentHostMcpServerSupportSnapshot = {
				servers: ['demo', 'http', 'unselected', 'workspace', 'input'].map(name => {
					const server = support(URI.file('/unused'), name);
					return {
						...server,
						source: { ...server.source, kind: remote ? AgentHostMcpServerSourceKind.RemoteUser : AgentHostMcpServerSourceKind.UserProfile, collectionUri: sourceUri, remoteAuthority: remote ? sourceUri.authority : null },
						enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledProfile },
						projectedConfiguration: name === 'http'
							? { type: McpServerType.REMOTE, url: 'https://example.com', headers: { 'X-Test': 'value' } }
							: { type: McpServerType.LOCAL, command: name === 'unselected' ? 'other' : 'node' },
					};
				}),
				discoveryComplete: true,
				coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
			};
			const migrator = createMigrator(fileService);
			const plan = await migrator.createPlan(snapshot, [], CancellationToken.None, targetUri);
			const result = await migrator.migrate(plan.candidates.filter(candidate => candidate.name !== 'unselected'), { userTarget: targetUri });

			assert.deepStrictEqual({
				candidates: plan.candidates.map(candidate => [candidate.name, candidate.storage, candidate.targetUri.toString()]),
				exclusions: plan.exclusions.map(exclusion => [exclusion.name, exclusion.storage, exclusion.reason]),
				result,
				source: parse((await fileService.readFile(sourceUri)).value.toString()),
				target: JSON.parse((await fileService.readFile(targetUri)).value.toString()),
			}, {
				candidates: ['demo', 'http', 'unselected'].map(name => [name, PromptsStorage.user, targetUri.toString()]),
				exclusions: [
					['workspace', PromptsStorage.user, McpServerCustomizationMigrationFailureReason.UnsupportedVariable],
					// VS Code can't prompt for an input without a description.
					['input', PromptsStorage.user, McpServerCustomizationMigrationFailureReason.UnsupportedInputType],
				],
				result: { migratedCount: 2, failures: [] },
				source: {
					inputs: [{ id: 'secret', type: 'promptString' }],
					servers: { unselected: { command: 'other' }, workspace: { command: '${workspaceFolder}/server' }, input: { command: '${input:secret}' } },
				},
				target: {
					mcpServers: {
						demo: { type: 'local', command: 'node', args: [], tools: ['*'] },
						http: { type: 'http', url: 'https://example.com', headers: { 'X-Test': 'value' }, tools: ['*'] },
					},
				},
			});
		});
	}

	test('does not offer user migrations without a destination on the source machine', async () => {
		const fileService = createFileService();
		const server = support(URI.file('/unused'), 'demo');
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [{ ...server, source: { ...server.source, kind: AgentHostMcpServerSourceKind.UserProfile, collectionUri: userCandidate().sourceUri } }],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};
		const plans = await Promise.all([undefined, URI.parse('vscode-remote://ssh-remote+test/home/test/.copilot/mcp-config.json')]
			.map(target => createMigrator(fileService).createPlan(snapshot, [], CancellationToken.None, target)));
		assert.deepStrictEqual(plans, [{ candidates: [], exclusions: [] }, { candidates: [], exclusions: [] }]);
	});

	test('rejects null-valued environment variables for user migrations', async () => {
		const fileService = createFileService();
		const selected = userCandidate();
		const projectedConfiguration: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: 'node', env: { REMOVE_ME: null } };
		await fileService.writeFile(selected.sourceUri, VSBuffer.fromString('{"servers":{"demo":{"command":"node","env":{"REMOVE_ME":null}}}}'));
		const server = support(URI.file('/unused'), selected.name, { projectedConfiguration });
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [{
				...server,
				source: { ...server.source, kind: AgentHostMcpServerSourceKind.UserProfile, collectionUri: selected.sourceUri },
			}],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};
		const migrator = createMigrator(fileService);
		const plan = await migrator.createPlan(snapshot, [], CancellationToken.None, selected.targetUri);
		const result = await migrator.migrate([{ ...selected, projectedConfiguration }], { userTarget: selected.targetUri });

		assert.deepStrictEqual({
			candidates: plan.candidates,
			exclusions: plan.exclusions.map(exclusion => exclusion.reason),
			result: { migratedCount: result.migratedCount, failures: result.failures.map(failure => failure.reason) },
			source: parse((await fileService.readFile(selected.sourceUri)).value.toString()),
			targetExists: await fileService.exists(selected.targetUri),
		}, {
			candidates: [],
			exclusions: [McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
			result: { migratedCount: 0, failures: [McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration] },
			source: { servers: { demo: { command: 'node', env: { REMOVE_ME: null } } } },
			targetExists: false,
		});
	});

	for (const target of [
		{ content: '{"metadata":true}', reason: undefined },
		{ content: '{"mcpServers":{"demo":{"type":"local","command":"node"}},"metadata":true}', reason: undefined },
		{ content: '{"mcpServers":{"demo":{"type":"local","command":"node","tools":["read"]}}}', reason: McpServerCustomizationMigrationFailureReason.TargetConflict },
		{ content: '{"mcpServers":{"demo":{"type":"local","command":"other"}}}', reason: McpServerCustomizationMigrationFailureReason.TargetConflict },
		{ content: '{"mcpServers":{},}', reason: McpServerCustomizationMigrationFailureReason.InvalidTarget },
		{ content: '{"mcpServers":null}', reason: McpServerCustomizationMigrationFailureReason.InvalidTarget },
	]) {
		test(`preserves Copilot-owned configuration when migrating into ${target.content}`, async () => {
			const fileService = createFileService();
			const selected = userCandidate();
			const original = '{"servers":{"demo":{"command":"node"}}}';
			await fileService.writeFile(selected.sourceUri, VSBuffer.fromString(original));
			await fileService.writeFile(selected.targetUri, VSBuffer.fromString(target.content));

			const result = await createMigrator(fileService).migrate([selected], { userTarget: selected.targetUri });
			assert.deepStrictEqual({
				migrated: result.migratedCount,
				failures: result.failures.map(failure => failure.reason),
				source: parse((await fileService.readFile(selected.sourceUri)).value.toString()),
				target: target.reason ? (await fileService.readFile(selected.targetUri)).value.toString() : JSON.parse((await fileService.readFile(selected.targetUri)).value.toString()).metadata,
			}, {
				migrated: target.reason ? 0 : 1,
				failures: target.reason ? [target.reason] : [],
				source: target.reason ? parse(original) : { servers: {} },
				target: target.reason ? target.content : true,
			});
		});
	}

	test('rejects user destinations not supplied by the current host', async () => {
		const selected = userCandidate();
		const result = await createMigrator(createFileService()).migrate([selected], { userTarget: URI.file('/other/mcp-config.json') });
		assert.deepStrictEqual(result.failures.map(failure => failure.reason), [McpServerCustomizationMigrationFailureReason.InconsistentTarget]);
	});

	test('rolls back a user migration if removing the source fails', async () => {
		const provider = new SourceWriteFailingProvider();
		const fileService = createFileService(provider);
		const selected = userCandidate();
		const source = '{"servers":{"demo":{"command":"node"}}}';
		const target = '{"mcpServers":{},"metadata":true}';
		await fileService.writeFile(selected.sourceUri, VSBuffer.fromString(source));
		await fileService.writeFile(selected.targetUri, VSBuffer.fromString(target));
		provider.sourceUri = selected.sourceUri;
		provider.failSourceWrite = true;

		const result = await createMigrator(fileService).migrate([selected], { userTarget: selected.targetUri });
		assert.deepStrictEqual({
			migrated: result.migratedCount,
			failures: result.failures.map(failure => failure.reason),
			source: (await fileService.readFile(selected.sourceUri)).value.toString(),
			target: (await fileService.readFile(selected.targetUri)).value.toString(),
		}, { migrated: 0, failures: [McpServerCustomizationMigrationFailureReason.WriteFailed], source, target });
	});

	test('keeps workspace and user servers with the same name in their respective scopes', async () => {
		const fileService = createFileService();
		const workspace = candidate(URI.file('/workspace'), 'demo');
		const user = userCandidate();
		for (const selected of [workspace, user]) {
			await fileService.writeFile(selected.sourceUri, VSBuffer.fromString('{"servers":{"demo":{"command":"node"}}}'));
		}
		const result = await createMigrator(fileService).migrate([workspace, user], { userTarget: user.targetUri });
		assert.deepStrictEqual(result, { migratedCount: 2, failures: [] });
	});

	for (const cancelBeforeReading of [true, false]) {
		test(`stops cancelled planning ${cancelBeforeReading ? 'before' : 'during'} source reads`, async () => {
			const roots = [URI.file('/first'), URI.file('/second')];
			const source = store.add(new CancellationTokenSource());
			const reads: URI[] = [];
			const provider = new class extends InMemoryFileSystemProvider {
				override async readFile(resource: URI): Promise<Uint8Array> {
					reads.push(resource);
					source.cancel();
					return super.readFile(resource);
				}
			}();
			const fileService = createFileService(provider);
			for (const root of roots) {
				await fileService.writeFile(URI.joinPath(root, '.vscode', 'mcp.json'), VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
			}
			if (cancelBeforeReading) {
				source.cancel();
			}
			const snapshot: IAgentHostMcpServerSupportSnapshot = {
				servers: roots.map(root => support(root, 'server')),
				discoveryComplete: true,
				coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
			};

			await assert.rejects(createMigrator(fileService).createPlan(snapshot, roots, source.token), isCancellationError);
			assert.deepStrictEqual(reads.map(uri => uri.path), cancelBeforeReading ? [] : ['/first/.vscode/mcp.json']);
		});
	}

	test('plans applicable, supported and exactly representable workspace-folder servers regardless of enablement', async () => {
		const root = URI.file('/plan');
		const fileService = createFileService();
		await fileService.writeFile(URI.joinPath(root, '.vscode', 'mcp.json'), VSBuffer.fromString(`{
			"servers": {
				"eligible": { "type": "stdio", "command": "node" },
				"variable": { "type": "stdio", "command": "\${workspaceFolder}/server" },
				"metadata": { "type": "stdio", "command": "node", "version": "1" },
				"cwd": { "type": "stdio", "command": "node", "cwd": "/tmp" },
				"sse": { "type": "http", "transport": "sse", "url": "https://example.com" },
				"nullEnv": { "type": "stdio", "command": "node", "env": { "REMOVE_ME": null } },
				"disabled": { "type": "stdio", "command": "node" }
			}
		}`));
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [
				support(root, 'eligible'),
				support(root, 'variable', { projectedConfiguration: { type: McpServerType.LOCAL, command: `${root.fsPath}/server` } }),
				support(root, 'metadata'),
				support(root, 'cwd', { projectedConfiguration: { type: McpServerType.LOCAL, command: 'node', cwd: '/tmp' } }),
				support(root, 'sse', {
					compatibility: { kind: 'partiallySupported', reasons: [AgentHostMcpSupportReason.SseTransportNotPortable] },
					projectedConfiguration: { type: McpServerType.REMOTE, transport: 'sse', url: 'https://example.com' },
				}),
				support(root, 'nullEnv', { projectedConfiguration: { type: McpServerType.LOCAL, command: 'node', env: { REMOVE_ME: null } } }),
				support(root, 'disabled', { enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledWorkspace } }),
				support(URI.file('/outside'), 'outside'),
			],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};

		const plan = await createMigrator(fileService).createPlan(snapshot, [root]);

		assert.deepStrictEqual({
			candidates: plan.candidates.map(item => item.name),
			exclusions: plan.exclusions.map(item => [item.name, item.reason]),
		}, {
			candidates: ['eligible', 'variable', 'metadata', 'disabled'],
			exclusions: [
				['cwd', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
				['sse', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
				['nullEnv', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
			],
		});
	});

	for (const storage of [PromptsStorage.local, PromptsStorage.user] as const) {
		for (const type of [McpServerType.LOCAL, McpServerType.REMOTE]) {
			test(`plans and removes warned properties for ${storage} ${type} servers`, async () => {
				const root = URI.file('/removals');
				const selected = storage === PromptsStorage.user ? userCandidate() : candidate(root, 'demo');
				const projectedConfiguration: IMcpServerConfiguration = type === McpServerType.LOCAL
					? { type, command: 'node', args: ['server@1.0.0'], env: { PORT: 3000 } }
					: { type, url: 'https://example.com/v1', headers: { 'X-Test': 'value' } };
				const properties = [
					{ gallery: true },
					{ gallery: false },
					{ gallery: 'https://registry.example' },
					{ version: '1.0.0' },
					{ dev: { watch: '${input:watch}', debug: { type: 'node' } } },
					{ dev: { debug: { type: 'debugpy', debugpyPath: '${command:debugpy}' } } },
					{ gallery: true, version: '1.0.0', dev: {} },
					...(type === McpServerType.LOCAL ? [{ sandboxEnabled: true }, { sandboxEnabled: false }] : []),
				];
				const fileService = createFileService();
				const unselected = { command: 'other', sandboxEnabled: true };
				const sandbox = { network: { allowedDomains: ['example.com'] } };
				const inputs = [{ id: 'watch', type: 'promptString' }];
				await fileService.writeFile(selected.sourceUri, VSBuffer.fromString(JSON.stringify({
					sandbox,
					inputs,
					servers: {
						...Object.fromEntries(properties.map((removed, index) => [`server${index}`, { ...projectedConfiguration, ...removed }])),
						unselected,
					},
				})));
				const snapshot: IAgentHostMcpServerSupportSnapshot = {
					servers: properties.map((_, index) => {
						const server = support(root, `server${index}`, {
							projectedConfiguration,
							compatibility: { kind: 'partiallySupported', reasons: [AgentHostMcpSupportReason.DevelopmentModeIgnored] },
						});
						return {
							...server,
							source: { ...server.source, collectionUri: selected.sourceUri, kind: storage === PromptsStorage.user ? AgentHostMcpServerSourceKind.UserProfile : AgentHostMcpServerSourceKind.VscodeWorkspaceFolder },
						};
					}),
					discoveryComplete: true,
					coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
				};
				const migrator = createMigrator(fileService);
				const plan = await migrator.createPlan(snapshot, [root], CancellationToken.None, selected.targetUri);
				const result = await migrator.migrate(plan.candidates, { userTarget: selected.targetUri });
				const targetConfiguration = type === McpServerType.LOCAL
					? { type: 'local', command: 'node', args: ['server@1.0.0'], env: { PORT: '3000' }, tools: ['*'] }
					: { type: 'http', url: 'https://example.com/v1', headers: { 'X-Test': 'value' }, tools: ['*'] };

				assert.deepStrictEqual({
					removals: plan.candidates.map(candidate => candidate.removedProperties),
					exclusions: plan.exclusions,
					result,
					source: parse((await fileService.readFile(selected.sourceUri)).value.toString()),
					target: parse((await fileService.readFile(selected.targetUri)).value.toString()),
				}, {
					removals: properties,
					exclusions: [],
					result: { migratedCount: properties.length, failures: [] },
					source: { sandbox, inputs, servers: { unselected } },
					target: { mcpServers: Object.fromEntries(properties.map((_, index) => [`server${index}`, targetConfiguration])) },
				});
			});
		}
	}

	/** An OAuth server as the client reports it: the projection drops `oauth`. */
	function oauthSupport(root: URI, name: string, url: string, sourceUri?: URI): IAgentHostMcpServerSupport {
		const server = support(root, name, {
			compatibility: { kind: 'partiallySupported', reasons: [AgentHostMcpSupportReason.OAuthClientConfigurationIgnored] },
			projectedConfiguration: { type: McpServerType.REMOTE, url },
		});
		return sourceUri ? { ...server, source: { ...server.source, kind: AgentHostMcpServerSourceKind.UserProfile, collectionUri: sourceUri } } : server;
	}

	for (const storage of [PromptsStorage.local, PromptsStorage.user]) {
		test(`migrates the OAuth client ID of ${storage} servers, except with a stored client secret or enterprise-managed sign-in`, async () => {
			const root = URI.file('/oauth');
			const fileService = createFileService();
			const secretStorageService = createSecretStorageService();
			const user = storage === PromptsStorage.user ? userCandidate() : undefined;
			const sourceUri = user?.sourceUri ?? URI.joinPath(root, '.vscode', 'mcp.json');
			const targetUri = user?.targetUri ?? URI.joinPath(root, '.mcp.json');
			const servers = {
				clientOnly: { url: 'https://example.com/a', oauth: { clientId: 'client-a' } },
				withSecret: { url: 'https://example.com/b%20c', oauth: { clientId: 'client-b' } },
				notManaged: { url: 'https://example.com/c', oauth: { clientId: 'client-c', enterpriseManaged: false } },
				managed: { url: 'https://example.com/d', oauth: { clientId: 'client-d', enterpriseManaged: true } },
			};
			await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({ servers })));
			// The *Set Client Secret* code lens stores the secret under the URL without percent-encoding.
			await secretStorageService.set(mcpOAuthClientSecretStorageKey('https://example.com/b c', 'client-b'), 'secret');
			const migrator = createMigrator(fileService, [], undefined, undefined, secretStorageService);
			const plan = await migrator.createPlan({
				servers: Object.entries(servers).map(([name, server]) => oauthSupport(root, name, URI.parse(server.url).toString(), user?.sourceUri)),
				discoveryComplete: true,
				coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
			}, [root], CancellationToken.None, user?.targetUri);
			const result = await migrator.migrate(plan.candidates, { userTarget: user?.targetUri });

			assert.deepStrictEqual({
				candidates: plan.candidates.map(candidate => [candidate.name, candidate.oauth]),
				exclusions: plan.exclusions.map(exclusion => [exclusion.name, exclusion.reason]),
				result,
				source: parse((await fileService.readFile(sourceUri)).value.toString()),
				target: parse((await fileService.readFile(targetUri)).value.toString()),
				secretKeys: await secretStorageService.keys(),
			}, {
				candidates: [
					['clientOnly', { clientId: 'client-a' }],
					['notManaged', { clientId: 'client-c' }],
				],
				exclusions: [
					['withSecret', McpServerCustomizationMigrationFailureReason.OAuthClientSecret],
					['managed', McpServerCustomizationMigrationFailureReason.EnterpriseManagedOAuth],
				],
				result: { migratedCount: 2, failures: [] },
				source: { servers: { withSecret: servers.withSecret, managed: servers.managed } },
				target: {
					mcpServers: {
						clientOnly: { type: 'http', url: 'https://example.com/a', tools: ['*'], oauthClientId: 'client-a' },
						notManaged: { type: 'http', url: 'https://example.com/c', tools: ['*'], oauthClientId: 'client-c' },
					},
				},
				secretKeys: [mcpOAuthClientSecretStorageKey('https://example.com/b c', 'client-b')],
			});
		});
	}

	test('rejects an OAuth server whose client secret was stored after planning', async () => {
		const root = URI.file('/oauth-secret-added');
		const fileService = createFileService();
		const secretStorageService = createSecretStorageService();
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const content = JSON.stringify({ servers: { demo: { url: 'https://example.com/mcp', oauth: { clientId: 'client' } } } });
		await fileService.writeFile(sourceUri, VSBuffer.fromString(content));
		const migrator = createMigrator(fileService, [], undefined, undefined, secretStorageService);
		const plan = await migrator.createPlan({
			servers: [oauthSupport(root, 'demo', 'https://example.com/mcp')],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		await secretStorageService.set(mcpOAuthClientSecretStorageKey('https://example.com/mcp', 'client'), 'secret');
		const result = await migrator.migrate(plan.candidates);
		assert.deepStrictEqual({
			planned: plan.candidates.map(candidate => candidate.oauth),
			reasons: result.failures.map(failure => failure.reason),
			sourceUnchanged: (await fileService.readFile(sourceUri)).value.toString() === content,
			targetExists: await fileService.exists(URI.joinPath(root, '.mcp.json')),
		}, {
			planned: [{ clientId: 'client' }],
			reasons: [McpServerCustomizationMigrationFailureReason.OAuthClientSecret],
			sourceUnchanged: true,
			targetExists: false,
		});
	});

	test('reads the client secret with the source URL, as the Set Client Secret code lens does', async () => {
		const root = URI.file('/oauth-secret-variable-url');
		const fileService = createFileService();
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const rawUrl = 'https://${env:MCP_HOST}/mcp';
		// The code lens keys the secret by the URL as written, while the projection resolves its variables.
		const key = mcpOAuthClientSecretStorageKey(URI.parse(rawUrl).toString(true), 'client');
		const content = JSON.stringify({ servers: { demo: { url: rawUrl, oauth: { clientId: 'client' } } } });
		const folders = [{ uri: root, name: 'oauth-secret-variable-url', index: 0 }];
		const results = [];
		for (const storedBeforePlanning of [true, false]) {
			const secretStorageService = createSecretStorageService();
			await fileService.writeFile(sourceUri, VSBuffer.fromString(content));
			if (storedBeforePlanning) {
				await secretStorageService.set(key, 'secret');
			}
			const migrator = createMigrator(fileService, folders, { MCP_HOST: 'example.com' }, undefined, secretStorageService);
			const plan = await migrator.createPlan({
				servers: [oauthSupport(root, 'demo', 'https://example.com/mcp')],
				discoveryComplete: true,
				coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
			}, [root]);
			await secretStorageService.set(key, 'secret');
			const result = await migrator.migrate(plan.candidates);
			results.push({
				exclusions: plan.exclusions.map(exclusion => exclusion.reason),
				failures: result.failures.map(failure => failure.reason),
				sourceUnchanged: (await fileService.readFile(sourceUri)).value.toString() === content,
				targetExists: await fileService.exists(URI.joinPath(root, '.mcp.json')),
			});
		}
		assert.deepStrictEqual(results, [
			{ exclusions: [McpServerCustomizationMigrationFailureReason.OAuthClientSecret], failures: [], sourceUnchanged: true, targetExists: false },
			{ exclusions: [], failures: [McpServerCustomizationMigrationFailureReason.OAuthClientSecret], sourceUnchanged: true, targetExists: false },
		]);
	});

	test('keeps other unsupported properties blocked even with removable metadata', async () => {
		const root = URI.file('/unsupported');
		const fileService = createFileService();
		const configurations: IMcpServerConfiguration[] = [
			{ type: McpServerType.LOCAL, command: 'node', envFile: '.env' },
			{ type: McpServerType.LOCAL, command: 'node', cwd: '/tmp' },
			{ type: McpServerType.LOCAL, command: 'node', env: { SECRET: null } },
			{ type: McpServerType.LOCAL, command: 'node', args: ['${input:secret}'] },
			{ type: McpServerType.REMOTE, url: 'https://example.com', transport: 'sse' },
		];
		await fileService.writeFile(URI.joinPath(root, '.vscode', 'mcp.json'), VSBuffer.fromString(JSON.stringify({
			servers: Object.fromEntries(configurations.map((configuration, index) => [`server${index}`, { ...configuration, gallery: true }])),
		})));
		const plan = await createMigrator(fileService).createPlan({
			servers: configurations.map((projectedConfiguration, index) => support(root, `server${index}`, { projectedConfiguration })),
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		assert.deepStrictEqual({
			candidates: plan.candidates,
			reasons: plan.exclusions.map(exclusion => exclusion.reason),
		}, {
			candidates: [],
			reasons: configurations.map(configuration => configuration.type === McpServerType.LOCAL && configuration.args
				? McpServerCustomizationMigrationFailureReason.UnsupportedInputType
				: McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration),
		});
	});

	test('rejects new, changed, or unconfirmed property removals before writing', async () => {
		const root = URI.file('/stale-removals');
		const fileService = createFileService();
		const selected = candidate(root, 'demo');
		const changes = [
			{ before: undefined, after: { gallery: true } },
			{ before: { gallery: true }, after: { gallery: 'https://registry.example' } },
			{ before: { version: '1' }, after: { version: '2' } },
			{ before: { dev: {} }, after: { dev: { watch: '*.ts' } } },
			{ before: { sandboxEnabled: false }, after: { sandboxEnabled: true } },
			{ before: { sandboxEnabled: true }, after: {} },
		];
		const results = [];
		for (const { before, after } of changes) {
			const content = JSON.stringify({ servers: { demo: { command: 'node', ...after } } });
			await fileService.writeFile(selected.sourceUri, VSBuffer.fromString(content));
			const result = await createMigrator(fileService).migrate([{ ...selected, removedProperties: before }]);
			results.push({
				migratedCount: result.migratedCount,
				reasons: result.failures.map(failure => failure.reason),
				sourceUnchanged: (await fileService.readFile(selected.sourceUri)).value.toString() === content,
				targetExists: await fileService.exists(selected.targetUri),
			});
		}
		assert.deepStrictEqual(results, changes.map(() => ({
			migratedCount: 0,
			reasons: [McpServerCustomizationMigrationFailureReason.SourceChanged],
			sourceUnchanged: true,
			targetExists: false,
		})));
	});

	test('restores removed properties when the source write fails', async () => {
		const root = URI.file('/rollback-removals');
		const provider = new SourceWriteFailingProvider();
		const fileService = createFileService(provider);
		const selected = { ...candidate(root, 'demo'), removedProperties: { gallery: true, version: '1', dev: { watch: '*.ts' }, sandboxEnabled: true } };
		const source = JSON.stringify({ servers: { demo: { command: 'node', ...selected.removedProperties } } });
		const target = '{"mcpServers":{}}';
		await fileService.writeFile(selected.sourceUri, VSBuffer.fromString(source));
		await fileService.writeFile(selected.targetUri, VSBuffer.fromString(target));
		provider.sourceUri = selected.sourceUri;
		provider.failSourceWrite = true;

		const result = await createMigrator(fileService).migrate([selected]);
		assert.deepStrictEqual({
			migratedCount: result.migratedCount,
			reasons: result.failures.map(failure => failure.reason),
			source: (await fileService.readFile(selected.sourceUri)).value.toString(),
			target: (await fileService.readFile(selected.targetUri)).value.toString(),
		}, {
			migratedCount: 0,
			reasons: [McpServerCustomizationMigrationFailureReason.WriteFailed],
			source,
			target,
		});
	});

	test('resolves portable workspace and path variables while rejecting other interpolation', async () => {
		const first = URI.file('/workspace/first');
		const second = URI.file('/workspace/second');
		const fileService = createFileService();
		await fileService.writeFile(URI.joinPath(first, '.vscode', 'mcp.json'), VSBuffer.fromString(`{
			"servers": {
				"portable": {
					"type": "stdio",
					"command": "\${workspaceFolder}\${pathSeparator}server.js",
					"args": [
						"\${cwd}/argument",
						"\${workspaceFolder:backend}/\${workspaceFolderBasename:backend}",
						"\${workspaceFolderBasename}",
						"\${/}",
						"\${workspaceRoot}/\${workspaceRootFolderName}",
						"\${cwd:backend}"
					]
				},
				"unknownRoot": { "type": "stdio", "command": "\${workspaceFolder:missing}/server.js" }
			}
		}`));
		const projectedConfiguration: IMcpServerConfiguration = {
			type: McpServerType.LOCAL,
			command: `${first.fsPath}${sep}server.js`,
			args: [
				`${first.fsPath}/argument`,
				`${second.fsPath}/second`,
				'first',
				sep,
				`${first.fsPath}/first`,
				second.fsPath,
			],
		};
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [
				support(first, 'portable', { projectedConfiguration }),
				support(first, 'unknownRoot', { projectedConfiguration: { type: McpServerType.LOCAL, command: '/workspace/missing/server.js' } }),
			],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};

		const folders: IWorkspaceFolderData[] = [
			{ uri: first, name: 'frontend', index: 0 },
			{ uri: second, name: 'backend', index: 1 },
		];
		const plan = await createMigrator(fileService, folders).createPlan(snapshot, [first, second]);
		const result = await createMigrator(fileService, folders).migrate(plan.candidates);

		assert.deepStrictEqual({
			candidates: plan.candidates.map(candidate => candidate.name),
			exclusions: plan.exclusions.map(exclusion => [exclusion.name, exclusion.reason]),
			result,
			source: parse((await fileService.readFile(URI.joinPath(first, '.vscode', 'mcp.json'))).value.toString()),
			target: parse((await fileService.readFile(URI.joinPath(first, '.mcp.json'))).value.toString()),
		}, {
			candidates: ['portable'],
			exclusions: [
				['unknownRoot', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
			],
			result: { migratedCount: 1, failures: [] },
			source: {
				servers: {
					unknownRoot: { type: 'stdio', command: '${workspaceFolder:missing}/server.js' },
				},
			},
			target: {
				mcpServers: {
					portable: {
						type: 'local',
						command: projectedConfiguration.command,
						args: [...projectedConfiguration.args!],
						tools: ['*'],
					},
				},
			},
		});
	});

	test('rewrites ${env:} references in every supported position', async () => {
		const root = URI.file('/environment');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const env = { TOOLS: '/opt/tools', TOKEN: 'secret', REGION: 'eu', HOST: 'example.com', TENANT: 'acme' };
		const longPrefix = 'x'.repeat(992);
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({
			servers: {
				local: {
					command: '${env:TOOLS}/server',
					args: ['--token=${env:TOKEN}', '--root=${workspaceFolder}/data', '${env:TOKEN}${env:REGION}'],
					env: { API_KEY: '${env:TOKEN}', DEBUG: '${env:DEBUG}', PORT: 3000, ROOT: '${workspaceFolder}' },
				},
				remote: {
					type: 'http',
					url: 'https://${env:HOST}/mcp/${env:TENANT}?region=${env:REGION}',
					headers: { Authorization: 'Bearer ${env:TOKEN}' },
				},
				shared: { command: 'node', env: { TOKEN: '${env:TOKEN}' } },
				maxLength: { command: 'node', args: [`${longPrefix}\${env:TOKEN}`] },
			},
		})));
		// Projections as the client resolves them before forwarding. The remote URL assumes the raw URL is projected (E11 in #340161).
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [
				support(root, 'local', {
					projectedConfiguration: {
						type: McpServerType.LOCAL,
						command: '/opt/tools/server',
						args: ['--token=secret', `--root=${root.fsPath}/data`, 'secreteu'],
						env: { API_KEY: 'secret', DEBUG: '', PORT: 3000, ROOT: root.fsPath },
					},
				}),
				support(root, 'remote', { projectedConfiguration: { type: McpServerType.REMOTE, url: 'https://example.com/mcp/acme?region=eu', headers: { Authorization: 'Bearer secret' } } }),
				support(root, 'shared', { projectedConfiguration: { type: McpServerType.LOCAL, command: 'node', env: { TOKEN: 'secret' } } }),
				support(root, 'maxLength', { projectedConfiguration: { type: McpServerType.LOCAL, command: 'node', args: [`${longPrefix}secret`] } }),
			],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};

		const plan = await createMigrator(fileService, [], env).createPlan(snapshot, [root]);
		const result = await createMigrator(fileService, [], env).migrate(plan.candidates);
		const target = (await fileService.readFile(targetUri)).value.toString();

		assert.deepStrictEqual({
			candidates: plan.candidates.map(candidate => [candidate.name, candidate.migratedConfiguration !== undefined]),
			exclusions: plan.exclusions,
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse(target),
			writesValues: target.includes('secret'),
		}, {
			candidates: [['local', true], ['remote', true], ['shared', true], ['maxLength', true]],
			exclusions: [],
			result: { migratedCount: 4, failures: [] },
			source: { servers: {} },
			target: {
				mcpServers: {
					local: {
						type: 'local',
						command: '${TOOLS}/server',
						args: ['--token=${TOKEN}', `--root=${root.fsPath}/data`, '${TOKEN}${REGION}'],
						env: { API_KEY: '${TOKEN}', DEBUG: '${DEBUG}', PORT: '3000', ROOT: root.fsPath },
						tools: ['*'],
					},
					remote: { type: 'http', url: 'https://${HOST}/mcp/${TENANT}?region=${REGION}', headers: { Authorization: 'Bearer ${TOKEN}' }, tools: ['*'] },
					shared: { type: 'local', command: 'node', args: [], env: { TOKEN: '${TOKEN}' }, tools: ['*'] },
					maxLength: { type: 'local', command: 'node', args: [`${longPrefix}\${TOKEN}`], tools: ['*'] },
				},
			},
			writesValues: false,
		});
	});

	test('keeps servers with ${env:} references the destination cannot expand', async () => {
		const root = URI.file('/environment-excluded');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const servers = {
			envName: { command: 'node', env: { '${env:PREFIX}_TOKEN': 'value' } },
			headerName: { type: 'http', url: 'https://example.com/mcp', headers: { '${env:HEADER}': 'value' } },
			parentheses: { command: '${env:ProgramFiles(x86)}/server' },
			dash: { command: 'node', args: ['${env:my-var}'] },
			empty: { command: 'node', args: ['${env:}'] },
			defaultedHost: { type: 'http', url: 'https://${env:HOST:-example.com}/mcp' },
			tooLong: { command: 'node', args: [`${'x'.repeat(993)}\${env:TOKEN}`] },
			port: { type: 'http', url: 'http://localhost:${env:PORT}/mcp' },
			wholeUrl: { type: 'http', url: '${env:BASE}/mcp' },
			scheme: { type: 'http', url: '${env:SCHEME}://example.com/mcp' },
			input: { command: '${env:TOOLS}/server', args: ['${input:secret}'] },
			userHome: { command: '${userHome}/server', env: { TOKEN: '${env:TOKEN}' } },
			cwd: { command: 'node', cwd: '${env:HOME}', env: { TOKEN: '${env:TOKEN}' } },
			// VS Code resolves variables in an environment value, but the destination keeps the value verbatim.
			nestedEnvironment: { command: 'node', env: { TOKEN: '${env:ALIAS}' } },
			nestedWorkspace: { command: '${env:TOOLS}/server' },
		};
		const source = JSON.stringify({ servers });
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString(source));
		const names = Object.keys(servers);
		const migrator = createMigrator(fileService, [{ uri: root, name: 'environment-excluded', index: 0 }], { TOKEN: 'secret', ALIAS: '${env:TOKEN}', TOOLS: '${workspaceFolder}/tools' });

		const plan = await migrator.createPlan({
			servers: names.map(name => support(root, name)),
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		const result = await migrator.migrate(names.map(name => candidate(root, name)));

		const expected = [
			['envName', McpServerCustomizationMigrationFailureReason.EnvironmentVariableInName],
			['headerName', McpServerCustomizationMigrationFailureReason.EnvironmentVariableInName],
			['parentheses', McpServerCustomizationMigrationFailureReason.InvalidEnvironmentVariableName],
			['dash', McpServerCustomizationMigrationFailureReason.InvalidEnvironmentVariableName],
			['empty', McpServerCustomizationMigrationFailureReason.InvalidEnvironmentVariableName],
			['defaultedHost', McpServerCustomizationMigrationFailureReason.InvalidEnvironmentVariableName],
			['tooLong', McpServerCustomizationMigrationFailureReason.EnvironmentVariableValueTooLong],
			['port', McpServerCustomizationMigrationFailureReason.UnsupportedEnvironmentVariableInUrl],
			['wholeUrl', McpServerCustomizationMigrationFailureReason.UnsupportedEnvironmentVariableInUrl],
			['scheme', McpServerCustomizationMigrationFailureReason.UnsupportedEnvironmentVariableInUrl],
			['input', McpServerCustomizationMigrationFailureReason.UnsupportedInputType],
			['userHome', McpServerCustomizationMigrationFailureReason.UnsupportedVariable],
			['cwd', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
			['nestedEnvironment', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
			['nestedWorkspace', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
		];
		assert.deepStrictEqual({
			candidates: plan.candidates,
			exclusions: plan.exclusions.map(exclusion => [exclusion.name, exclusion.reason]),
			failures: result.failures.map(failure => [failure.name, failure.reason]),
			source: (await fileService.readFile(sourceUri)).value.toString(),
			targetExists: await fileService.exists(URI.joinPath(root, '.mcp.json')),
		}, {
			candidates: [],
			exclusions: expected,
			failures: expected,
			source,
			targetExists: false,
		});
	});

	test('migrates ${env:} references in user servers forwarded unresolved', async () => {
		const fileService = createFileService();
		const { sourceUri, targetUri } = userCandidate();
		const servers = {
			local: { command: '${env:TOOLS}/server', env: { API_KEY: '${env:TOKEN}' } },
			headers: { type: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer ${env:TOKEN}' } },
			url: { type: 'http', url: 'https://example.com/mcp?key=${env:TOKEN}' },
			userHome: { command: '${userHome}/server' },
			input: { command: '${input:secret}' },
		};
		await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({ servers })));
		const unresolved: IAgentHostMcpServerSupport['compatibility'] = { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.UnresolvedConfiguration] };
		const projections: Record<keyof typeof servers, [IMcpServerConfiguration, IAgentHostMcpServerSupport['compatibility']]> = {
			local: [{ type: McpServerType.LOCAL, command: '${env:TOOLS}/server', env: { API_KEY: '${env:TOKEN}' } }, unresolved],
			headers: [{ type: McpServerType.REMOTE, url: 'https://example.com/mcp', headers: { Authorization: 'Bearer ${env:TOKEN}' } }, unresolved],
			// The client projects the URL through `URI`, which encodes the reference (E11 in #340161).
			url: [{ type: McpServerType.REMOTE, url: URI.parse(servers.url.url).toString() }, { kind: 'supported' }],
			userHome: [{ type: McpServerType.LOCAL, command: '${userHome}/server' }, unresolved],
			input: [{ type: McpServerType.LOCAL, command: '${input:secret}' }, { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.RequiresUserInteraction] }],
		};
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: Object.entries(projections).map(([name, [projectedConfiguration, compatibility]]) => {
				const server = support(URI.file('/unused'), name, { projectedConfiguration, compatibility });
				return { ...server, source: { ...server.source, kind: AgentHostMcpServerSourceKind.UserProfile, collectionUri: sourceUri } };
			}),
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};
		const migrator = createMigrator(fileService, [], { TOOLS: '/opt/tools', TOKEN: 'secret' });

		const plan = await migrator.createPlan(snapshot, [], CancellationToken.None, targetUri);
		const result = await migrator.migrate(plan.candidates, { userTarget: targetUri });

		assert.deepStrictEqual({
			candidates: plan.candidates.map(candidate => candidate.name),
			exclusions: plan.exclusions.map(exclusion => [exclusion.name, exclusion.reason]),
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			candidates: ['local', 'headers'],
			exclusions: [
				['url', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
				['userHome', McpServerCustomizationMigrationFailureReason.UnsupportedVariable],
				['input', McpServerCustomizationMigrationFailureReason.UnsupportedInputType],
			],
			result: { migratedCount: 2, failures: [] },
			source: { servers: { url: servers.url, userHome: servers.userHome, input: servers.input } },
			target: {
				mcpServers: {
					local: { type: 'local', command: '${TOOLS}/server', args: [], env: { API_KEY: '${TOKEN}' }, tools: ['*'] },
					headers: { type: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer ${TOKEN}' }, tools: ['*'] },
				},
			},
		});
	});

	test('rejects ${env:} candidates whose rewrite no longer matches the source', async () => {
		const root = URI.file('/environment-changed');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"renamed":{"command":"node","env":{"TOKEN":"${env:TOKEN}"}},"literal":{"command":"node","env":{"TOKEN":"${env:TOKEN}"}}}}'));
		const projectedConfiguration: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: 'node', env: { TOKEN: 'secret' } };
		const migrator = createMigrator(fileService, [], { TOKEN: 'secret', ALIAS: 'secret' });
		const plan = await migrator.createPlan({
			servers: ['renamed', 'literal'].map(name => support(root, name, { projectedConfiguration })),
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		// Both variables resolve to the same value, so only the rewrite reveals the change.
		const changedSource = '{"servers":{"renamed":{"command":"node","env":{"TOKEN":"${env:ALIAS}"}},"literal":{"command":"node","env":{"TOKEN":"${env:TOKEN}"}}}}';
		await fileService.writeFile(sourceUri, VSBuffer.fromString(changedSource));

		const result = await migrator.migrate(plan.candidates.map(candidate => candidate.name === 'literal' ? { ...candidate, migratedConfiguration: undefined } : candidate));

		assert.deepStrictEqual({
			planned: plan.candidates.map(candidate => [candidate.name, candidate.migratedConfiguration]),
			failures: result.failures.map(failure => [failure.name, failure.reason]),
			source: (await fileService.readFile(sourceUri)).value.toString(),
			targetExists: await fileService.exists(URI.joinPath(root, '.mcp.json')),
		}, {
			planned: ['renamed', 'literal'].map(name => [name, { type: McpServerType.LOCAL, command: 'node', env: { TOKEN: '${TOKEN}' } }]),
			failures: [
				['renamed', McpServerCustomizationMigrationFailureReason.SourceChanged],
				['literal', McpServerCustomizationMigrationFailureReason.SourceChanged],
			],
			source: changedSource,
			targetExists: false,
		});
	});

	test('rolls back and then verifies a migration with ${env:} references', async () => {
		const root = URI.file('/environment-rollback');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const provider = new SourceWriteFailingProvider();
		const fileService = createFileService(provider);
		const source = '{"servers":{"server":{"command":"${env:TOOLS}/server","env":{"TOKEN":"${env:TOKEN}"}}}}';
		const target = '{"mcpServers":{}}';
		await fileService.writeFile(sourceUri, VSBuffer.fromString(source));
		await fileService.writeFile(targetUri, VSBuffer.fromString(target));
		const migrator = createMigrator(fileService, [], { TOOLS: '/opt/tools', TOKEN: 'secret' });
		const plan = await migrator.createPlan({
			servers: [support(root, 'server', { projectedConfiguration: { type: McpServerType.LOCAL, command: '/opt/tools/server', env: { TOKEN: 'secret' } } })],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		provider.sourceUri = sourceUri;
		provider.failSourceWrite = true;

		const failed = await migrator.migrate(plan.candidates);
		const afterRollback = {
			source: (await fileService.readFile(sourceUri)).value.toString(),
			target: (await fileService.readFile(targetUri)).value.toString(),
		};
		provider.failSourceWrite = false;
		const retried = await migrator.migrate(plan.candidates);

		assert.deepStrictEqual({
			failed: failed.failures.map(failure => failure.reason),
			afterRollback,
			retried,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			failed: [McpServerCustomizationMigrationFailureReason.WriteFailed],
			afterRollback: { source, target },
			retried: { migratedCount: 1, failures: [] },
			source: { servers: {} },
			target: { mcpServers: { server: { type: 'local', command: '${TOOLS}/server', args: [], env: { TOKEN: '${TOKEN}' }, tools: ['*'] } } },
		});
	});

	test('rewrites ${input:} references in every supported position', async () => {
		const root = URI.file('/inputs');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const unrelated = { id: 'unrelated', type: 'promptString', description: 'Not referenced by any server' };
		const servers = {
			local: {
				command: '${input:path}/server',
				args: ['--key=${input:api-key}', '--region', '${input:region}', '--level=${input:level}', '--root=${workspaceFolder}', '${env:TOOLS}'],
				env: { MODE: '${input:mode}', PORT: 3000, KEY: '${input:api-key}' },
			},
			remote: {
				type: 'http',
				url: 'https://example.com/mcp?region=${input:region}',
				headers: { 'X-Api-Key': '${input:api-key}', 'X-Mode': '${input:mode}' },
			},
		};
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({
			inputs: [
				{ id: 'api-key', type: 'promptString', description: 'API key' },
				{ id: 'region', type: 'promptString', description: 'Region', default: 'us-east-1' },
				{ id: 'level', type: 'pickString', description: 'Level', options: ['info', 'debug'] },
				{ id: 'mode', type: 'pickString', description: 'Mode', options: [{ label: 'Fast', value: 'fast' }, { label: 'Safe', value: 'safe' }], default: 'safe' },
				// `PATH` is set by the OS, so the input is migrated to `MCP_PATH`.
				{ id: 'path', type: 'promptString', description: 'Tools directory', default: '/opt/bin' },
				unrelated,
			],
			servers,
		})));
		// The client forwards nothing of a server with an input, not even its portable variables. The remote URL assumes the raw URL is projected (E11 in #340161).
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [
				inputSupport(root, 'local', { type: McpServerType.LOCAL, command: servers.local.command, args: servers.local.args, env: servers.local.env }),
				inputSupport(root, 'remote', { type: McpServerType.REMOTE, url: servers.remote.url, headers: servers.remote.headers }),
			],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};
		const migrator = createMigrator(fileService, [], { TOOLS: '/opt/tools' });

		const plan = await migrator.createPlan(snapshot, [root]);
		const result = await migrator.migrate(plan.candidates);

		assert.deepStrictEqual({
			candidates: plan.candidates.map(candidate => [candidate.name, candidate.environmentVariables?.map(variable => [variable.id, variable.name, variable.declaration.default])]),
			exclusions: plan.exclusions,
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			candidates: [
				['local', [
					['path', 'MCP_PATH', '/opt/bin'],
					['api-key', 'API_KEY', undefined],
					['region', 'REGION', 'us-east-1'],
					['level', 'LEVEL', undefined],
					['mode', 'MODE', 'safe'],
				]],
				['remote', [
					['region', 'REGION', 'us-east-1'],
					['api-key', 'API_KEY', undefined],
					['mode', 'MODE', 'safe'],
				]],
			],
			exclusions: [],
			result: { migratedCount: 2, failures: [] },
			source: { inputs: [unrelated], servers: {} },
			target: {
				mcpServers: {
					local: {
						type: 'local',
						command: '${MCP_PATH}/server',
						args: ['--key=${API_KEY}', '--region', '${REGION}', '--level=${LEVEL}', `--root=${root.fsPath}`, '${TOOLS}'],
						// Each input is declared with its default, or empty. `MODE` only referred to its input, so it is replaced.
						env: { MODE: 'safe', PORT: '3000', KEY: '${API_KEY}', MCP_PATH: '/opt/bin', API_KEY: '', REGION: 'us-east-1', LEVEL: '' },
						tools: ['*'],
					},
					remote: {
						type: 'http',
						url: 'https://example.com/mcp?region=${REGION:-us-east-1}',
						headers: { 'X-Api-Key': '${API_KEY}', 'X-Mode': '${MODE:-safe}' },
						tools: ['*'],
					},
				},
			},
		});
	});

	test('migrates inputs whose ids start with a digit, and numeric prompt defaults', async () => {
		const root = URI.file('/inputs-names');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const server = { command: 'node', args: ['--first=${input:1st}', '--count=${input:count}', '--ratio=${input:ratio}'] };
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({
			inputs: [
				{ id: '1st', type: 'promptString', description: 'First' },
				// VS Code shows a numeric default in the input box as text.
				{ id: 'count', type: 'promptString', description: 'Count', default: 5 },
				{ id: 'ratio', type: 'promptString', description: 'Ratio', default: 0.5 },
			],
			servers: { server },
		})));
		const migrator = createMigrator(fileService);

		const plan = await migrator.createPlan({
			servers: [inputSupport(root, 'server', { type: McpServerType.LOCAL, ...server })],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		const result = await migrator.migrate(plan.candidates);

		assert.deepStrictEqual({
			environmentVariables: plan.candidates.map(candidate => candidate.environmentVariables?.map(variable => [variable.id, variable.name, variable.declaration.default])),
			result,
			target: parse((await fileService.readFile(URI.joinPath(root, '.mcp.json'))).value.toString()),
		}, {
			environmentVariables: [[['1st', 'MCP_1ST', undefined], ['count', 'COUNT', '5'], ['ratio', 'RATIO', '0.5']]],
			result: { migratedCount: 1, failures: [] },
			target: { mcpServers: { server: { type: 'local', command: 'node', args: ['--first=${MCP_1ST}', '--count=${COUNT}', '--ratio=${RATIO}'], env: { MCP_1ST: '', COUNT: '5', RATIO: '0.5' }, tools: ['*'] } } },
		});
	});

	test('keeps servers with ${input:} references the destination cannot represent', async () => {
		const root = URI.file('/inputs-excluded');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const promptString = (id: string, extra: object = {}) => ({ id, type: 'promptString', description: id, ...extra });
		const inputs = [
			promptString('secret', { password: true }),
			{ id: 'picked', type: 'command', command: 'extension.pick' },
			{ id: 'undescribed', type: 'promptString' },
			promptString('api-key'),
			promptString('api_key'),
			promptString('path'),
			promptString('mcp_path'),
			promptString('token'),
			promptString('brace', { default: 'a}b' }),
			// Valid on its own, but the `}` after the reference ends the default later.
			promptString('suffix', { default: 'x${y' }),
			{ id: 'choice', type: 'pickString', description: 'choice', options: ['a', 'b'], default: 'c' },
			// VS Code matches a pick default with `===`, so a number never matches the option '5'.
			{ id: 'pick-number', type: 'pickString', description: 'pick-number', options: ['5'], default: 5 },
			promptString('flag', { default: true }),
			promptString('2nd'),
			promptString('mcp_2nd'),
			promptString('host', { default: 'example.com' }),
			promptString('port'),
			promptString('name'),
			promptString('long'),
			promptString('dir'),
			promptString('ok'),
			// A stdio server's `env` values are expanded too, so this default can't be written there as is.
			promptString('reference', { default: '${HOME}' }),
			promptString('declared'),
		];
		const servers = {
			password: { command: 'node', args: ['${input:secret}'] },
			commandInput: { command: '${input:picked}' },
			undeclared: { command: 'node', env: { KEY: '${input:missing}' } },
			undescribed: { command: '${input:undescribed}' },
			dash: { command: 'node', args: ['${input:api-key}'] },
			underscore: { command: 'node', args: ['${input:api_key}'] },
			reserved: { command: 'node', args: ['${input:path}'] },
			prefixed: { command: 'node', args: ['${input:mcp_path}'] },
			environment: { command: 'node', env: { TOKEN: '${input:token}' } },
			// The same file reads `TOKEN` from the environment.
			environmentReader: { command: '${command:extension.pick}', env: { TOKEN: '${env:TOKEN}' }, args: ['${input:ok}'] },
			// A remote server has no `env`, so its references carry the default.
			braceDefault: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Brace': '${input:brace}' } },
			suffixDefault: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Suffix': '${input:suffix}}z' } },
			referenceDefault: { command: 'node', args: ['${input:reference}'] },
			// `DECLARED` would be declared in `env`, which already sets it to something else.
			declaredInEnv: { command: 'node', args: ['${input:declared}'], env: { declared: 'other' } },
			pickDefault: { command: 'node', args: ['${input:choice}'] },
			pickNumber: { command: 'node', args: ['${input:pick-number}'] },
			booleanDefault: { command: 'node', args: ['${input:flag}'] },
			// `2nd` is prefixed to `MCP_2ND`, the same variable as `mcp_2nd`.
			digitPrefixed: { command: 'node', args: ['${input:2nd}'] },
			digitCollision: { command: 'node', args: ['${input:mcp_2nd}'] },
			hostDefault: { type: 'http', url: 'https://${input:host}/mcp' },
			port: { type: 'http', url: 'http://localhost:${input:port}/mcp' },
			envName: { command: 'node', env: { '${input:name}': 'value' } },
			headerName: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-${input:name}': 'value' } },
			tooLong: { command: 'node', args: [`${'x'.repeat(995)}\${input:long}`] },
			cwd: { command: 'node', cwd: '${input:dir}' },
			commandVariable: { command: 'node', args: ['${command:extension.pick}', '${input:ok}'] },
		};
		const source = JSON.stringify({ inputs, servers });
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString(source));
		const names = Object.keys(servers);
		const migrator = createMigrator(fileService, [{ uri: root, name: 'inputs-excluded', index: 0 }], { TOKEN: 'secret' });

		const plan = await migrator.createPlan({
			servers: names.map(name => support(root, name)),
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		const result = await migrator.migrate(names.map(name => candidate(root, name)));

		const expected = [
			['password', McpServerCustomizationMigrationFailureReason.UnsupportedInputType],
			['commandInput', McpServerCustomizationMigrationFailureReason.UnsupportedInputType],
			['undeclared', McpServerCustomizationMigrationFailureReason.UnsupportedInputType],
			['undescribed', McpServerCustomizationMigrationFailureReason.UnsupportedInputType],
			['dash', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['underscore', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['reserved', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['prefixed', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['environment', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['environmentReader', McpServerCustomizationMigrationFailureReason.UnsupportedVariable],
			['braceDefault', McpServerCustomizationMigrationFailureReason.UnsupportedInputDefault],
			['suffixDefault', McpServerCustomizationMigrationFailureReason.UnsupportedInputDefault],
			['referenceDefault', McpServerCustomizationMigrationFailureReason.UnsupportedInputDefault],
			['declaredInEnv', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['pickDefault', McpServerCustomizationMigrationFailureReason.UnsupportedInputDefault],
			['pickNumber', McpServerCustomizationMigrationFailureReason.UnsupportedInputDefault],
			['booleanDefault', McpServerCustomizationMigrationFailureReason.UnsupportedInputDefault],
			['digitPrefixed', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['digitCollision', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['hostDefault', McpServerCustomizationMigrationFailureReason.UnsupportedEnvironmentVariableInUrl],
			['port', McpServerCustomizationMigrationFailureReason.UnsupportedEnvironmentVariableInUrl],
			['envName', McpServerCustomizationMigrationFailureReason.EnvironmentVariableInName],
			['headerName', McpServerCustomizationMigrationFailureReason.EnvironmentVariableInName],
			['tooLong', McpServerCustomizationMigrationFailureReason.EnvironmentVariableValueTooLong],
			['cwd', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
			['commandVariable', McpServerCustomizationMigrationFailureReason.UnsupportedVariable],
		];
		assert.deepStrictEqual({
			candidates: plan.candidates,
			exclusions: plan.exclusions.map(exclusion => [exclusion.name, exclusion.reason]),
			failures: result.failures.map(failure => [failure.name, failure.reason]),
			source: (await fileService.readFile(sourceUri)).value.toString(),
			targetExists: await fileService.exists(URI.joinPath(root, '.mcp.json')),
		}, {
			candidates: [],
			exclusions: expected,
			failures: expected,
			source,
			targetExists: false,
		});
	});

	test('excludes a server with an input in its URL while the client forwards the URL encoded', async () => {
		const root = URI.file('/inputs-url');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const servers = {
			url: { type: 'http', url: 'https://example.com/${input:tenant}/mcp' },
			header: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Tenant': '${input:tenant}' } },
		};
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({ inputs: [{ id: 'tenant', type: 'promptString', description: 'Tenant' }], servers })));
		const migrator = createMigrator(fileService);

		const plan = await migrator.createPlan({
			servers: [
				// The client projects the URL through `URI`, which encodes the reference (E11 in #340161).
				inputSupport(root, 'url', { type: McpServerType.REMOTE, url: URI.parse(servers.url.url).toString() }),
				inputSupport(root, 'header', { type: McpServerType.REMOTE, url: URI.parse(servers.header.url).toString(), headers: servers.header.headers }),
			],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		const result = await migrator.migrate(plan.candidates);

		assert.deepStrictEqual({
			encodedUrl: URI.parse(servers.url.url).toString(),
			candidates: plan.candidates.map(candidate => candidate.name),
			exclusions: plan.exclusions.map(exclusion => [exclusion.name, exclusion.reason]),
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(URI.joinPath(root, '.mcp.json'))).value.toString()),
		}, {
			encodedUrl: 'https://example.com/%24%7Binput%3Atenant%7D/mcp',
			candidates: ['header'],
			exclusions: [['url', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration]],
			result: { migratedCount: 1, failures: [] },
			// The excluded server still references the input.
			source: { inputs: [{ id: 'tenant', type: 'promptString', description: 'Tenant' }], servers: { url: servers.url } },
			target: { mcpServers: { header: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Tenant': '${TENANT}' }, tools: ['*'] } } },
		});
	});

	test('removes an input declaration only once nothing left in the file references it', async () => {
		const root = URI.file('/inputs-cleanup');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const declaration = (id: string) => ({ id, type: 'promptString', description: id });
		const servers = {
			first: { command: 'node', args: ['${input:shared}', '${input:partial}', '${input:sandboxed}'] },
			second: { command: 'node', args: ['${input:shared}', '${input:solo}'] },
			unselected: { command: 'node', args: ['${input:partial}'] },
		};
		const sandbox = { network: { allowedDomains: ['${input:sandboxed}.example.com'] } };
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString(`{
			// Inputs that are still referenced, or were never referenced, are kept.
			"inputs": ${JSON.stringify(['shared', 'partial', 'sandboxed', 'unused', 'solo'].map(declaration))},
			"sandbox": ${JSON.stringify(sandbox)},
			"servers": ${JSON.stringify(servers)}
		}`));
		const migrator = createMigrator(fileService);
		const plan = await migrator.createPlan({
			servers: Object.entries(servers).map(([name, server]) => inputSupport(root, name, { type: McpServerType.LOCAL, command: server.command, args: server.args })),
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);

		const result = await migrator.migrate(plan.candidates.filter(candidate => candidate.name !== 'unselected'));

		assert.deepStrictEqual({
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
		}, {
			result: { migratedCount: 2, failures: [] },
			source: {
				inputs: ['partial', 'sandboxed', 'unused'].map(declaration),
				sandbox,
				servers: { unselected: servers.unselected },
			},
		});
	});

	test('migrates ${input:} references in user servers forwarded unresolved', async () => {
		const fileService = createFileService();
		const { sourceUri, targetUri } = userCandidate();
		const server = { command: 'node', env: { TOKEN: '${input:token}', SEPARATED: 'a${pathSeparator}b' } };
		await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({
			inputs: [{ id: 'token', type: 'promptString', description: 'Token', password: false }],
			servers: { server },
		})));
		const migrator = createMigrator(fileService);

		const plan = await migrator.createPlan({
			servers: [inputSupport(URI.file('/unused'), 'server', { type: McpServerType.LOCAL, ...server }, sourceUri)],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [], CancellationToken.None, targetUri);
		const result = await migrator.migrate(plan.candidates, { userTarget: targetUri });

		assert.deepStrictEqual({
			candidates: plan.candidates.map(candidate => [candidate.name, candidate.storage]),
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			candidates: [['server', PromptsStorage.user]],
			result: { migratedCount: 1, failures: [] },
			source: { servers: {} },
			target: { mcpServers: { server: { type: 'local', command: 'node', args: [], env: { TOKEN: '', SEPARATED: `a${sep}b` }, tools: ['*'] } } },
		});
	});

	test('rejects ${input:} candidates whose input declarations changed before writing', async () => {
		const root = URI.file('/inputs-changed');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const servers = {
			typeChanged: { command: 'node', args: ['${input:level}'] },
			optionsChanged: { command: 'node', args: ['${input:mode}'] },
		};
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({
			inputs: [
				{ id: 'level', type: 'promptString', description: 'Level', default: 'info' },
				{ id: 'mode', type: 'pickString', description: 'Mode', options: ['fast', 'safe'], default: 'safe' },
			],
			servers,
		})));
		const migrator = createMigrator(fileService);
		const plan = await migrator.createPlan({
			servers: Object.entries(servers).map(([name, server]) => inputSupport(root, name, { type: McpServerType.LOCAL, ...server })),
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		// Both changes still write the same `${NAME:-default}`, so only the declarations reveal them.
		const changedSource = JSON.stringify({
			inputs: [
				{ id: 'level', type: 'pickString', description: 'Level', options: ['info', 'debug'], default: 'info' },
				{ id: 'mode', type: 'pickString', description: 'Mode', options: ['fast', 'safe', 'strict'], default: 'safe' },
			],
			servers,
		});
		await fileService.writeFile(sourceUri, VSBuffer.fromString(changedSource));

		const result = await migrator.migrate(plan.candidates);

		assert.deepStrictEqual({
			planned: plan.candidates.map(candidate => [candidate.name, candidate.migratedConfiguration]),
			failures: result.failures.map(failure => [failure.name, failure.reason]),
			source: (await fileService.readFile(sourceUri)).value.toString(),
			targetExists: await fileService.exists(URI.joinPath(root, '.mcp.json')),
		}, {
			planned: [
				['typeChanged', { type: McpServerType.LOCAL, command: 'node', args: ['${LEVEL}'], env: { LEVEL: 'info' } }],
				['optionsChanged', { type: McpServerType.LOCAL, command: 'node', args: ['${MODE}'], env: { MODE: 'safe' } }],
			],
			failures: [
				['typeChanged', McpServerCustomizationMigrationFailureReason.SourceChanged],
				['optionsChanged', McpServerCustomizationMigrationFailureReason.SourceChanged],
			],
			source: changedSource,
			targetExists: false,
		});
	});

	test('rewrites ${config:} references in every supported position to environment variables set to their values', async () => {
		const root = URI.file('/settings');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const servers = {
			local: {
				command: '${config:mcp.command}',
				// The same setting used twice maps to one variable. `GITHUB_TOKEN` is reserved, so it is prefixed.
				// `user.secret` is only in the user's settings, so its value is not written into the workspace.
				args: ['--port=${config:mcp.port}', '${config:mcp.command}', '--token=${config:github.token}', '${env:TOOLS}', '--root=${workspaceFolder}', '--secret=${config:user.secret}'],
				env: { HOST: '${config:mcp.host}', MCP_PORT: '${config:mcp.port}', LEVEL: 3 },
			},
			remote: {
				type: 'http',
				url: 'https://example.com/${config:mcp.tenant}/mcp?port=${config:mcp.port}',
				headers: { 'X-Token': '${config:github.token}', 'X-Tools': '${env:TOOLS}' },
			},
			// With an input, the client projects the server as written.
			mixedLocal: { command: 'node', args: ['--region=${input:region}', '--port=${config:mcp.port}'], env: { RATIO: '${config:mcp.ratio}' } },
			mixedRemote: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Region': '${input:region}', 'X-Ratio': '${config:mcp.ratio}' } },
		};
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({
			inputs: [{ id: 'region', type: 'promptString', description: 'Region', default: 'eu' }],
			servers,
		})));
		const workspaceSettings = { 'mcp.command': 'npx', 'mcp.port': 8080, 'github.token': 'abc', 'mcp.host': 'localhost', 'mcp.tenant': 'contoso', 'mcp.ratio': 0.5 };
		const configurationService = new WorkspaceSettingsTestConfigurationService({}, new Set(Object.keys(workspaceSettings)));
		// The settings are only set for the workspace folder, so they must be read in its scope.
		for (const [key, value] of Object.entries({ ...workspaceSettings, 'user.secret': 'hunter2' })) {
			await configurationService.setUserConfiguration(key, value, root);
		}
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [
				// The client resolves the variables of `.vscode/mcp.json` servers, including settings, before forwarding them.
				support(root, 'local', {
					projectedConfiguration: {
						type: McpServerType.LOCAL,
						command: 'npx',
						args: ['--port=8080', 'npx', '--token=abc', '/opt/tools', `--root=${root.fsPath}`, '--secret=hunter2'],
						env: { HOST: 'localhost', MCP_PORT: '8080', LEVEL: 3 },
					},
				}),
				support(root, 'remote', { projectedConfiguration: { type: McpServerType.REMOTE, url: 'https://example.com/contoso/mcp?port=8080', headers: { 'X-Token': 'abc', 'X-Tools': '/opt/tools' } } }),
				inputSupport(root, 'mixedLocal', { type: McpServerType.LOCAL, ...servers.mixedLocal }),
				inputSupport(root, 'mixedRemote', { type: McpServerType.REMOTE, url: servers.mixedRemote.url, headers: servers.mixedRemote.headers }),
			],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};
		const migrator = createMigrator(fileService, [{ uri: root, name: 'settings', index: 0 }], { TOOLS: '/opt/tools' }, configurationService);

		const plan = await migrator.createPlan(snapshot, [root]);
		const result = await migrator.migrate(plan.candidates);

		assert.deepStrictEqual({
			candidates: plan.candidates.map(candidate => [candidate.name, candidate.settingVariables?.map(setting => [setting.key, setting.name, setting.value]), candidate.environmentVariables?.map(variable => variable.name)]),
			exclusions: plan.exclusions,
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			candidates: [
				['local', [['mcp.command', 'MCP_COMMAND', 'npx'], ['mcp.port', 'MCP_PORT', '8080'], ['github.token', 'MCP_GITHUB_TOKEN', 'abc'], ['user.secret', 'USER_SECRET', ''], ['mcp.host', 'MCP_HOST', 'localhost']], undefined],
				['remote', [['mcp.tenant', 'MCP_TENANT', 'contoso'], ['mcp.port', 'MCP_PORT', '8080'], ['github.token', 'MCP_GITHUB_TOKEN', 'abc']], undefined],
				['mixedLocal', [['mcp.port', 'MCP_PORT', '8080'], ['mcp.ratio', 'MCP_RATIO', '0.5']], ['REGION']],
				['mixedRemote', [['mcp.ratio', 'MCP_RATIO', '0.5']], ['REGION']],
			],
			exclusions: [],
			result: { migratedCount: 4, failures: [] },
			source: { servers: {} },
			target: {
				mcpServers: {
					local: {
						type: 'local',
						command: '${MCP_COMMAND}',
						args: ['--port=${MCP_PORT}', '${MCP_COMMAND}', '--token=${MCP_GITHUB_TOKEN}', '${TOOLS}', `--root=${root.fsPath}`, '--secret=${USER_SECRET}'],
						// `env` values are expanded from the host's environment, so a setting there is replaced with its value.
						// `MCP_PORT` already holds the value that `args` reads.
						env: { HOST: 'localhost', MCP_PORT: '8080', LEVEL: '3', MCP_COMMAND: 'npx', MCP_GITHUB_TOKEN: 'abc', USER_SECRET: '' },
						tools: ['*'],
					},
					remote: {
						type: 'http',
						url: 'https://example.com/${MCP_TENANT:-contoso}/mcp?port=${MCP_PORT:-8080}',
						headers: { 'X-Token': '${MCP_GITHUB_TOKEN:-abc}', 'X-Tools': '${TOOLS}' },
						tools: ['*'],
					},
					mixedLocal: {
						type: 'local',
						command: 'node',
						args: ['--region=${REGION}', '--port=${MCP_PORT}'],
						env: { RATIO: '0.5', REGION: 'eu', MCP_PORT: '8080' },
						tools: ['*'],
					},
					mixedRemote: {
						type: 'http',
						url: 'https://example.com/mcp',
						headers: { 'X-Region': '${REGION:-eu}', 'X-Ratio': '${MCP_RATIO:-0.5}' },
						tools: ['*'],
					},
				},
			},
		});
	});

	test('migrates ${config:} references in user servers forwarded unresolved, with user settings', async () => {
		const fileService = createFileService();
		const { sourceUri, targetUri } = userCandidate();
		const servers = {
			local: { command: '${config:mcp.command}', args: ['--port=${config:mcp.port}', '${env:TOOLS}'], env: { HOST: '${config:mcp.host}' } },
			remote: { type: 'http', url: 'https://example.com/mcp?port=${config:mcp.port}', headers: { 'X-Host': '${config:mcp.host}' } },
		};
		await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({ servers })));
		// User servers move to the user's own configuration, so values from the user's settings are kept.
		const configurationService = new TestConfigurationService({ 'mcp.command': 'npx', 'mcp.port': 8080, 'mcp.host': 'localhost' });
		// A workspace folder value doesn't apply to user servers, which VS Code resolves without a folder.
		await configurationService.setUserConfiguration('mcp.port', 9090, URI.file('/workspace'));
		const userSupport = (name: string, projectedConfiguration: IMcpServerConfiguration): IAgentHostMcpServerSupport => {
			const server = support(URI.file('/unused'), name, {
				compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.UnresolvedConfiguration] },
				projectedConfiguration,
			});
			return { ...server, source: { ...server.source, kind: AgentHostMcpServerSourceKind.UserProfile, collectionUri: sourceUri } };
		};
		const migrator = createMigrator(fileService, [{ uri: URI.file('/workspace'), name: 'workspace', index: 0 }], { TOOLS: '/opt/tools' }, configurationService);

		const plan = await migrator.createPlan({
			servers: [
				userSupport('local', { type: McpServerType.LOCAL, ...servers.local }),
				userSupport('remote', { type: McpServerType.REMOTE, url: servers.remote.url, headers: servers.remote.headers }),
			],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [], CancellationToken.None, targetUri);
		const result = await migrator.migrate(plan.candidates, { userTarget: targetUri });

		assert.deepStrictEqual({
			candidates: plan.candidates.map(candidate => [candidate.name, candidate.storage, candidate.settingVariables?.map(setting => [setting.name, setting.value])]),
			exclusions: plan.exclusions,
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			candidates: [
				['local', PromptsStorage.user, [['MCP_COMMAND', 'npx'], ['MCP_PORT', '8080'], ['MCP_HOST', 'localhost']]],
				['remote', PromptsStorage.user, [['MCP_PORT', '8080'], ['MCP_HOST', 'localhost']]],
			],
			exclusions: [],
			result: { migratedCount: 2, failures: [] },
			source: { servers: {} },
			target: {
				mcpServers: {
					local: { type: 'local', command: '${MCP_COMMAND}', args: ['--port=${MCP_PORT}', '${TOOLS}'], env: { HOST: 'localhost', MCP_COMMAND: 'npx', MCP_PORT: '8080' }, tools: ['*'] },
					remote: { type: 'http', url: 'https://example.com/mcp?port=${MCP_PORT:-8080}', headers: { 'X-Host': '${MCP_HOST:-localhost}' }, tools: ['*'] },
				},
			},
		});
	});

	test('migrates settings without a usable value to empty environment variables', async () => {
		const root = URI.file('/settings-empty');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const servers = {
			// VS Code can't resolve an unset or structured setting, so it projects the server as written.
			unresolvedLocal: { command: 'node', args: ['--name=${config:mcp.unset}', '--unnamed=${config:}'], env: { OPTIONS: '${config:mcp.object}', TOKEN: '${env:TOKEN}' } },
			unresolvedRemote: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Unset': '${config:mcp.unset}' } },
			// VS Code resolves these to text, but only strings and numbers are carried over, and a value with a
			// variable would be resolved by VS Code but not by the destination.
			resolvedLocal: { command: 'node', args: ['${config:mcp.flag}', '${config:mcp.array}', '${config:mcp.variable}', '${config:mcp.reference}'] },
			// VS Code can't resolve the `${input:}` in the value without interaction, so it forwards it as text.
			nestedInput: { command: 'node', args: ['${config:mcp.nested}'] },
			resolvedRemote: { type: 'http', url: 'https://example.com/mcp?flag=${config:mcp.flag}', headers: { 'X-Variable': '${config:mcp.variable}', 'X-Brace': '${config:mcp.brace}' } },
		};
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString(JSON.stringify({ servers })));
		const configurationService = new WorkspaceSettingsTestConfigurationService({
			'mcp.object': { a: 1 },
			'mcp.flag': true,
			'mcp.array': ['a'],
			'mcp.variable': '${env:HOME}/bin',
			'mcp.reference': '$HOME/bin',
			'mcp.brace': 'a}b',
			'mcp.nested': '${input:token}',
		});
		const asWritten = (name: keyof typeof servers, projectedConfiguration: IMcpServerConfiguration) => support(root, name, {
			delivery: AgentHostMcpServerDelivery.NotDelivered,
			compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.UnresolvedConfiguration] },
			projectedConfiguration,
		});
		const migrator = createMigrator(fileService, [{ uri: root, name: 'settings-empty', index: 0 }], { HOME: '/home/user', TOKEN: 'secret' }, configurationService);

		const plan = await migrator.createPlan({
			servers: [
				asWritten('unresolvedLocal', { type: McpServerType.LOCAL, ...servers.unresolvedLocal }),
				asWritten('unresolvedRemote', { type: McpServerType.REMOTE, url: servers.unresolvedRemote.url, headers: servers.unresolvedRemote.headers }),
				support(root, 'resolvedLocal', { projectedConfiguration: { type: McpServerType.LOCAL, command: 'node', args: ['true', 'a', '/home/user/bin', '$HOME/bin'] } }),
				support(root, 'nestedInput', { projectedConfiguration: { type: McpServerType.LOCAL, command: 'node', args: ['${input:token}'] } }),
				support(root, 'resolvedRemote', { projectedConfiguration: { type: McpServerType.REMOTE, url: 'https://example.com/mcp?flag=true', headers: { 'X-Variable': '/home/user/bin', 'X-Brace': 'a}b' } } }),
			],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		const result = await migrator.migrate(plan.candidates);

		assert.deepStrictEqual({
			candidates: plan.candidates.map(candidate => [candidate.name, candidate.settingVariables?.map(setting => [setting.name, setting.value])]),
			exclusions: plan.exclusions,
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(URI.joinPath(root, '.mcp.json'))).value.toString()),
		}, {
			candidates: [
				['unresolvedLocal', [['MCP_UNSET', ''], ['MCP_CONFIG', ''], ['MCP_OBJECT', '']]],
				['unresolvedRemote', [['MCP_UNSET', '']]],
				['resolvedLocal', [['MCP_FLAG', ''], ['MCP_ARRAY', ''], ['MCP_VARIABLE', ''], ['MCP_REFERENCE', '']]],
				['nestedInput', [['MCP_NESTED', '']]],
				['resolvedRemote', [['MCP_FLAG', ''], ['MCP_VARIABLE', ''], ['MCP_BRACE', 'a}b']]],
			],
			exclusions: [],
			result: { migratedCount: 5, failures: [] },
			source: { servers: {} },
			target: {
				mcpServers: {
					// A reference without a setting name migrates to an empty `MCP_CONFIG`.
					// In `env` values, a setting is replaced with its value, since they are expanded from the host's environment.
					unresolvedLocal: { type: 'local', command: 'node', args: ['--name=${MCP_UNSET}', '--unnamed=${MCP_CONFIG}'], env: { OPTIONS: '', TOKEN: '${TOKEN}', MCP_UNSET: '', MCP_CONFIG: '' }, tools: ['*'] },
					// Like an input without a default, an empty value is not written as a default.
					unresolvedRemote: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-Unset': '${MCP_UNSET}' }, tools: ['*'] },
					resolvedLocal: { type: 'local', command: 'node', args: ['${MCP_FLAG}', '${MCP_ARRAY}', '${MCP_VARIABLE}', '${MCP_REFERENCE}'], env: { MCP_FLAG: '', MCP_ARRAY: '', MCP_VARIABLE: '', MCP_REFERENCE: '' }, tools: ['*'] },
					nestedInput: { type: 'local', command: 'node', args: ['${MCP_NESTED}'], env: { MCP_NESTED: '' }, tools: ['*'] },
					// A value with a `}` is written as is, even though it ends the default early.
					resolvedRemote: { type: 'http', url: 'https://example.com/mcp?flag=${MCP_FLAG}', headers: { 'X-Variable': '${MCP_VARIABLE}', 'X-Brace': '${MCP_BRACE:-a}b}' }, tools: ['*'] },
				},
			},
		});
	});

	test('keeps servers with ${config:} references the destination cannot represent', async () => {
		const root = URI.file('/settings-excluded');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const servers = {
			// A reference without a setting name migrates to `MCP_CONFIG`, as does `mcp.config`.
			unnamedCollision: { command: 'node', args: ['${config:}', '${config:mcp.config}'] },
			// The same file reads `API_KEY` from the environment.
			environmentCollision: { command: 'node', args: ['${config:api.key}'], env: { OTHER: '${env:API_KEY}' } },
			inputCollision: { command: 'node', args: ['${config:region}', '${input:region}'] },
			settingCollision: { command: 'node', args: ['${config:mcp.level}', '${config:mcp_level}'] },
			// `MCP_MODE` would be declared in `env`, which already sets it to something else.
			declaredInEnv: { command: 'node', args: ['${config:mcp.mode}'], env: { mcp_mode: 'other' } },
			envName: { command: 'node', env: { '${config:mcp.name}': 'value' } },
			headerName: { type: 'http', url: 'https://example.com/mcp', headers: { 'X-${config:mcp.name}': 'value' } },
			urlHost: { type: 'http', url: 'https://${config:mcp.host}/mcp' },
			urlPort: { type: 'http', url: 'http://localhost:${config:mcp.port}/mcp' },
			tooLong: { command: 'node', args: [`${'x'.repeat(995)}\${config:mcp.long}`] },
			cwd: { command: 'node', cwd: '${config:mcp.dir}' },
		};
		const inputs = [{ id: 'region', type: 'promptString', description: 'Region' }];
		const source = JSON.stringify({ inputs, servers });
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString(source));
		const configurationService = new WorkspaceSettingsTestConfigurationService({
			'api.key': 'key',
			'region': 'eu',
			'mcp.level': 'info',
			'mcp_level': 'debug',
			'mcp.mode': 'fast',
			'mcp.name': 'name',
			'mcp.host': 'example.com',
			'mcp.port': 8080,
			'mcp.long': 'value',
			'mcp.dir': '/tmp',
			'mcp.config': 'value',
		});
		const names = Object.keys(servers);
		const migrator = createMigrator(fileService, [{ uri: root, name: 'settings-excluded', index: 0 }], undefined, configurationService);

		const plan = await migrator.createPlan({
			servers: names.map(name => support(root, name)),
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		const result = await migrator.migrate(names.map(name => candidate(root, name)));

		const expected = [
			['unnamedCollision', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['environmentCollision', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['inputCollision', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['settingCollision', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['declaredInEnv', McpServerCustomizationMigrationFailureReason.VariableNameCollision],
			['envName', McpServerCustomizationMigrationFailureReason.EnvironmentVariableInName],
			['headerName', McpServerCustomizationMigrationFailureReason.EnvironmentVariableInName],
			['urlHost', McpServerCustomizationMigrationFailureReason.UnsupportedEnvironmentVariableInUrl],
			['urlPort', McpServerCustomizationMigrationFailureReason.UnsupportedEnvironmentVariableInUrl],
			['tooLong', McpServerCustomizationMigrationFailureReason.EnvironmentVariableValueTooLong],
			['cwd', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
		];
		assert.deepStrictEqual({
			candidates: plan.candidates,
			exclusions: plan.exclusions.map(exclusion => [exclusion.name, exclusion.reason]),
			failures: result.failures.map(failure => [failure.name, failure.reason]),
			source: (await fileService.readFile(sourceUri)).value.toString(),
			targetExists: await fileService.exists(URI.joinPath(root, '.mcp.json')),
		}, {
			candidates: [],
			exclusions: expected,
			failures: expected,
			source,
			targetExists: false,
		});
	});

	test('rejects ${config:} candidates whose setting changed before writing', async () => {
		const root = URI.file('/settings-changed');
		const workspaceSourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const { sourceUri: userSourceUri, targetUri: userTargetUri } = userCandidate();
		const workspaceSource = JSON.stringify({ servers: { workspace: { command: 'node', args: ['--port=${config:mcp.port}'] } } });
		const userSource = JSON.stringify({ servers: { user: { type: 'http', url: 'https://example.com/mcp?port=${config:mcp.port}' } } });
		const fileService = createFileService();
		await fileService.writeFile(workspaceSourceUri, VSBuffer.fromString(workspaceSource));
		await fileService.writeFile(userSourceUri, VSBuffer.fromString(userSource));
		const configurationService = new WorkspaceSettingsTestConfigurationService({ 'mcp.port': 8080 });
		const workspaceServer = support(root, 'workspace', { projectedConfiguration: { type: McpServerType.LOCAL, command: 'node', args: ['--port=8080'] } });
		const userServer = support(URI.file('/unused'), 'user', {
			compatibility: { kind: 'unsupported', reasons: [AgentHostMcpSupportReason.UnresolvedConfiguration] },
			projectedConfiguration: { type: McpServerType.REMOTE, url: 'https://example.com/mcp?port=${config:mcp.port}' },
		});
		const migrator = createMigrator(fileService, [{ uri: root, name: 'settings-changed', index: 0 }], undefined, configurationService);
		const plan = await migrator.createPlan({
			servers: [workspaceServer, { ...userServer, source: { ...userServer.source, kind: AgentHostMcpServerSourceKind.UserProfile, collectionUri: userSourceUri } }],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root], CancellationToken.None, userTargetUri);
		// The user server is still forwarded the same way, so only the recorded value reveals the change.
		await configurationService.setUserConfiguration('mcp.port', 9090);

		const result = await migrator.migrate(plan.candidates, { userTarget: userTargetUri });

		assert.deepStrictEqual({
			planned: plan.candidates.map(candidate => [candidate.name, candidate.settingVariables]),
			failures: result.failures.map(failure => [failure.name, failure.reason]),
			sources: [(await fileService.readFile(workspaceSourceUri)).value.toString(), (await fileService.readFile(userSourceUri)).value.toString()],
			targetsExist: [await fileService.exists(URI.joinPath(root, '.mcp.json')), await fileService.exists(userTargetUri)],
		}, {
			planned: [
				['workspace', [{ key: 'mcp.port', name: 'MCP_PORT', value: '8080' }]],
				['user', [{ key: 'mcp.port', name: 'MCP_PORT', value: '8080' }]],
			],
			failures: [
				['workspace', McpServerCustomizationMigrationFailureReason.SourceChanged],
				['user', McpServerCustomizationMigrationFailureReason.SourceChanged],
			],
			sources: [workspaceSource, userSource],
			targetsExist: [false, false],
		});
	});

	test('restores removed input declarations when rolling back', async () => {
		const root = URI.file('/inputs-rollback');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const provider = new SourceWriteCommitThenFailProvider();
		const fileService = createFileService(provider);
		const source = '{"inputs":[{"id":"token","type":"promptString","description":"Token"}],"servers":{"server":{"command":"node","args":["${input:token}"]}}}';
		const target = '{"mcpServers":{}}';
		await fileService.writeFile(sourceUri, VSBuffer.fromString(source));
		await fileService.writeFile(targetUri, VSBuffer.fromString(target));
		const migrator = createMigrator(fileService);
		const plan = await migrator.createPlan({
			servers: [inputSupport(root, 'server', { type: McpServerType.LOCAL, command: 'node', args: ['${input:token}'] })],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		provider.sourceUri = sourceUri;
		provider.failAfterSourceWrite = true;

		const failed = await migrator.migrate(plan.candidates);
		const afterRollback = {
			source: (await fileService.readFile(sourceUri)).value.toString(),
			target: (await fileService.readFile(targetUri)).value.toString(),
		};
		const retried = await migrator.migrate(plan.candidates);

		assert.deepStrictEqual({
			failed: failed.failures.map(failure => failure.reason),
			afterRollback,
			retried,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			failed: [McpServerCustomizationMigrationFailureReason.WriteFailed],
			afterRollback: { source, target },
			retried: { migratedCount: 1, failures: [] },
			source: { servers: {} },
			target: { mcpServers: { server: { type: 'local', command: 'node', args: ['${TOKEN}'], env: { TOKEN: '' }, tools: ['*'] } } },
		});
	});

	test('preserves a concurrent completed migration that also removed its inputs', async () => {
		const root = URI.file('/inputs-concurrent');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const provider = new InterleavedMigrationProvider();
		const firstWindow = createFileService(provider);
		const secondWindow = store.add(new FileService(new NullLogService()));
		store.add(secondWindow.registerProvider(Schemas.file, provider));
		await firstWindow.writeFile(sourceUri, VSBuffer.fromString('{"inputs":[{"id":"token","type":"promptString","description":"Token"}],"servers":{"server":{"command":"node","args":["${input:token}"]}}}'));
		const plan = await createMigrator(firstWindow).createPlan({
			servers: [inputSupport(root, 'server', { type: McpServerType.LOCAL, command: 'node', args: ['${input:token}'] })],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		}, [root]);
		let peerMigratedCount = 0;
		provider.resource = targetUri;
		provider.afterWrite = async () => {
			peerMigratedCount = (await createMigrator(secondWindow).migrate(plan.candidates)).migratedCount;
		};

		const result = await createMigrator(firstWindow).migrate(plan.candidates);

		assert.deepStrictEqual({
			result,
			peerMigratedCount,
			source: parse((await firstWindow.readFile(sourceUri)).value.toString()),
			target: parse((await firstWindow.readFile(targetUri)).value.toString()),
		}, {
			result: { migratedCount: 1, failures: [] },
			peerMigratedCount: 1,
			source: { servers: {} },
			target: { mcpServers: { server: { type: 'local', command: 'node', args: ['${TOKEN}'], env: { TOKEN: '' }, tools: ['*'] } } },
		});
	});

	test('accepts the target representation after resolving portable source variables', async () => {
		const root = URI.file('/existing-variable-target');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"${workspaceFolder}/server.js"}}}'));
		const projectedConfiguration: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: `${root.fsPath}/server.js` };
		await fileService.writeFile(targetUri, VSBuffer.fromString(`{"mcpServers":{"server":{"type":"local","command":${JSON.stringify(projectedConfiguration.command)},"args":[],"tools":["*"]}}}`));
		const migrator = createMigrator(fileService, [{ uri: root, name: 'custom-name', index: 0 }]);

		const result = await migrator.migrate([candidate(root, 'server', projectedConfiguration)]);

		assert.deepStrictEqual({
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			result: { migratedCount: 1, failures: [] },
			source: { servers: {} },
			target: { mcpServers: { server: { type: 'local', command: projectedConfiguration.command, args: [], tools: ['*'] } } },
		});
	});

	test('migrates every server from a source with a trailing comma', async () => {
		const root = URI.file('/trailing-comma');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{\n  "servers": {\n    "first": { "command": "node" },\n    "second": { "command": "node" },\n  }\n}\n'));

		const result = await createMigrator(fileService).migrate([candidate(root, 'first'), candidate(root, 'second')]);

		assert.deepStrictEqual({
			result,
			source: (await fileService.readFile(sourceUri)).value.toString(),
			target: parse((await fileService.readFile(URI.joinPath(root, '.mcp.json'))).value.toString()),
		}, {
			result: { migratedCount: 2, failures: [] },
			source: '{\n  "servers": {\n  }\n}\n',
			target: {
				mcpServers: {
					first: { type: 'local', command: 'node', args: [], tools: ['*'] },
					second: { type: 'local', command: 'node', args: [], tools: ['*'] },
				},
			},
		});
	});

	test('moves selected servers target-first while preserving source comments and unselected entries', async () => {
		const root = URI.file('/move');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString(`{
			// preserved
			"servers": {
				"selected": { "type": "stdio", "command": "node" },
				"unselected": { "type": "stdio", "command": "other" }
			}
		}`));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{"existing":{"type":"stdio","command":"existing"}}}'));

		const result = await createMigrator(fileService).migrate([candidate(root, 'selected')]);
		const source = (await fileService.readFile(sourceUri)).value.toString();

		assert.deepStrictEqual({
			result: { migratedCount: result.migratedCount, failures: result.failures },
			source: parse(source),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
			commentPreserved: source.includes('// preserved'),
		}, {
			result: { migratedCount: 1, failures: [] },
			source: { servers: { unselected: { type: 'stdio', command: 'other' } } },
			target: { mcpServers: { existing: { type: 'stdio', command: 'existing' }, selected: { type: 'local', command: 'node', args: [], tools: ['*'] } } },
			commentPreserved: true,
		});
	});

	for (const wrapped of [true, false]) {
		test(`reads migrated servers from each root's ${wrapped ? 'wrapped' : 'flat'} configuration`, async () => {
			const roots = [URI.file('/first'), URI.file('/second')];
			const fileService = createFileService();
			const configurations: IMcpServerConfiguration[] = roots.map((root, index) => ({
				type: McpServerType.LOCAL,
				command: 'node',
				args: [`${root.path}/server.js`],
				env: { MODE: `root-${index}` },
			}));
			const existing = { type: 'http', url: 'https://example.com/mcp' };
			for (const [index, root] of roots.entries()) {
				await fileService.writeFile(URI.joinPath(root, '.vscode', 'mcp.json'), VSBuffer.fromString(JSON.stringify({
					servers: { selected: configurations[index], unselected: { command: 'other' } },
				})));
				const servers = { existing };
				await fileService.writeFile(URI.joinPath(root, '.mcp.json'), VSBuffer.fromString(JSON.stringify(wrapped ? { mcpServers: servers } : servers)));
			}

			const result = await createMigrator(fileService).migrate(roots.map((root, index) => candidate(root, 'selected', configurations[index])));

			assert.deepStrictEqual(JSON.parse(JSON.stringify({
				result,
				files: await Promise.all(roots.map(async root => ({
					source: parse((await fileService.readFile(URI.joinPath(root, '.vscode', 'mcp.json'))).value.toString()),
					target: parseWorkspaceRootMcpConfiguration((await fileService.readFile(URI.joinPath(root, '.mcp.json'))).value.toString()),
				}))),
			})), {
				result: { migratedCount: 2, failures: [] },
				files: configurations.map(configuration => ({
					source: { servers: { unselected: { command: 'other' } } },
					target: { wrapped, servers: { existing, selected: configuration } },
				})),
			});
		});
	}

	test('accepts an equivalent target and rejects a conflicting target', async () => {
		const root = URI.file('/targets');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"equivalent":{"command":"node","args":[]},"conflict":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{"equivalent":{"type":"local","command":"node","args":[],"tools":["*"]},"conflict":{"type":"local","command":"other","args":[],"tools":["*"]}}}'));

		const result = await createMigrator(fileService).migrate([
			candidate(root, 'equivalent'),
			candidate(root, 'conflict'),
		]);

		assert.deepStrictEqual({
			migratedCount: result.migratedCount,
			failures: result.failures.map(failure => [failure.name, failure.reason]),
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
		}, {
			migratedCount: 1,
			failures: [['conflict', McpServerCustomizationMigrationFailureReason.TargetConflict]],
			source: { servers: { conflict: { command: 'node' } } },
		});
	});

	for (const existingTarget of [false, true]) {
		test(`preserves a concurrent completed migration with ${existingTarget ? 'an existing' : 'a new'} target`, async () => {
			const root = URI.file('/concurrent');
			const selected = candidate(root, 'server');
			const provider = new InterleavedMigrationProvider();
			const firstWindow = createFileService(provider);
			const secondWindow = store.add(new FileService(new NullLogService()));
			store.add(secondWindow.registerProvider(Schemas.file, provider));
			await firstWindow.writeFile(selected.sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
			if (existingTarget) {
				await firstWindow.writeFile(selected.targetUri, VSBuffer.fromString('{"mcpServers":{}}'));
			}
			let peerMigratedCount = 0;
			provider.resource = selected.targetUri;
			provider.afterWrite = async () => {
				peerMigratedCount = (await createMigrator(secondWindow).migrate([selected])).migratedCount;
			};
			const messages: string[] = [];
			const logService = new class extends NullLogService {
				override info(message: string): void { messages.push(message); }
			}();

			const result = await new McpServerCustomizationMigrator(firstWindow, logService, new TestConfigurationResolverService(), new TestConfigurationService(), createSecretStorageService()).migrate([selected]);

			assert.deepStrictEqual({
				result,
				peerMigratedCount,
				source: parse((await firstWindow.readFile(selected.sourceUri)).value.toString()),
				target: parse((await firstWindow.readFile(selected.targetUri)).value.toString()),
				messages,
			}, {
				result: { migratedCount: 1, failures: [] },
				peerMigratedCount: 1,
				source: { servers: {} },
				target: { mcpServers: { server: { type: 'local', command: 'node', args: [], tools: ['*'] } } },
				messages: [`[MCP Customization Migration] Concurrent migration already completed for ${selected.sourceUri.toString()}; retaining ${selected.targetUri.toString()}.`],
			});
		});
	}

	for (const cause of ['partial peer completion', 'context change'] as const) {
		test(`retains the surviving target copy after ${cause}`, async () => {
			const root = URI.file('/retain-peer');
			const first = candidate(root, 'first');
			const second = candidate(root, 'second');
			const provider = new InterleavedMigrationProvider();
			const firstWindow = createFileService(provider);
			const secondWindow = store.add(new FileService(new NullLogService()));
			store.add(secondWindow.registerProvider(Schemas.file, provider));
			await firstWindow.writeFile(first.sourceUri, VSBuffer.fromString('{"servers":{"first":{"command":"node"},"second":{"command":"node"}}}'));
			await firstWindow.writeFile(first.targetUri, VSBuffer.fromString('{"mcpServers":{}}'));
			let isCurrent = true;
			let peerMigratedCount = 0;
			provider.resource = first.targetUri;
			provider.afterWrite = async () => {
				peerMigratedCount = (await createMigrator(secondWindow).migrate(cause === 'context change' ? [first, second] : [first])).migratedCount;
				isCurrent = cause !== 'context change';
			};

			const result = await createMigrator(firstWindow).migrate([first, second], { isContextCurrent: async () => isCurrent });

			assert.deepStrictEqual({
				migratedCount: result.migratedCount,
				failures: result.failures.map(failure => failure.reason),
				peerMigratedCount,
				source: parse((await firstWindow.readFile(first.sourceUri)).value.toString()),
				target: parse((await firstWindow.readFile(first.targetUri)).value.toString()),
			}, {
				migratedCount: 0,
				failures: [McpServerCustomizationMigrationFailureReason.RollbackFailed, McpServerCustomizationMigrationFailureReason.RollbackFailed],
				peerMigratedCount: cause === 'context change' ? 2 : 1,
				source: { servers: cause === 'context change' ? {} : { second: { command: 'node' } } },
				target: { mcpServers: { first: { type: 'local', command: 'node', args: [], tools: ['*'] }, second: { type: 'local', command: 'node', args: [], tools: ['*'] } } },
			});
		});
	}

	test('checks only newly added target entries when rolling back after a peer migration', async () => {
		const root = URI.file('/preexisting-peer');
		const first = candidate(root, 'first');
		const second = candidate(root, 'second');
		const provider = new InterleavedMigrationProvider();
		const firstWindow = createFileService(provider);
		const secondWindow = store.add(new FileService(new NullLogService()));
		store.add(secondWindow.registerProvider(Schemas.file, provider));
		await firstWindow.writeFile(first.sourceUri, VSBuffer.fromString('{"servers":{"first":{"command":"node"},"second":{"command":"node"}}}'));
		const targetContent = '{"mcpServers":{"first":{"type":"local","command":"node","args":[],"tools":["*"]}}}';
		await firstWindow.writeFile(first.targetUri, VSBuffer.fromString(targetContent));
		provider.resource = first.targetUri;
		provider.afterWrite = async () => { await createMigrator(secondWindow).migrate([first]); };

		const result = await createMigrator(firstWindow).migrate([first, second]);

		assert.deepStrictEqual({
			failures: result.failures.map(failure => failure.reason),
			source: parse((await firstWindow.readFile(first.sourceUri)).value.toString()),
			target: (await firstWindow.readFile(first.targetUri)).value.toString(),
		}, {
			failures: [McpServerCustomizationMigrationFailureReason.SourceChanged, McpServerCustomizationMigrationFailureReason.SourceChanged],
			source: { servers: { second: { command: 'node' } } },
			target: targetContent,
		});
	});

	for (const phase of ['target', 'source'] as const) {
		test(`awaits the final context guard after reading the ${phase} file`, async () => {
			const root = URI.file('/final-guard');
			const selected = candidate(root, 'server');
			const readCompleted = new DeferredPromise<void>();
			const guardReleased = new DeferredPromise<boolean>();
			let checking = false;
			let reads = 0;
			const writes: string[] = [];
			const provider = new class extends InMemoryFileSystemProvider {
				override async readFile(resource: URI): Promise<Uint8Array> {
					const content = await super.readFile(resource);
					if (checking && isEqual(resource, phase === 'target' ? selected.targetUri : selected.sourceUri) && ++reads === 2) {
						readCompleted.complete();
					}
					return content;
				}
				override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
					if (checking) { writes.push(resource.path); }
					await super.writeFile(resource, content, options);
				}
			}();
			const fileService = createFileService(provider);
			const sourceContent = '{"servers":{"server":{"command":"node"}}}';
			const targetContent = '{"mcpServers":{}}';
			await fileService.writeFile(selected.sourceUri, VSBuffer.fromString(sourceContent));
			await fileService.writeFile(selected.targetUri, VSBuffer.fromString(targetContent));
			checking = true;

			const pending = createMigrator(fileService).migrate([selected], { isContextCurrent: () => readCompleted.isSettled ? guardReleased.p : true });
			await readCompleted.p;
			const writesBeforeRelease = [...writes];
			guardReleased.complete(false);
			const result = await pending;

			assert.deepStrictEqual({
				writesBeforeRelease,
				failures: result.failures.map(failure => failure.reason),
				source: (await fileService.readFile(selected.sourceUri)).value.toString(),
				target: (await fileService.readFile(selected.targetUri)).value.toString(),
			}, {
				writesBeforeRelease: phase === 'target' ? [] : [selected.targetUri.path],
				failures: [McpServerCustomizationMigrationFailureReason.NoLongerEligible],
				source: sourceContent,
				target: targetContent,
			});
		});
	}

	test('rejects changed source configuration and invalid targets without writes', async () => {
		const root = URI.file('/invalid');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"changed"}}}'));
		let result = await createMigrator(fileService).migrate([candidate(root, 'server')]);
		assert.deepStrictEqual(result.failures.map(failure => failure.reason), [McpServerCustomizationMigrationFailureReason.SourceChanged]);

		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":[]}'));
		result = await createMigrator(fileService).migrate([candidate(root, 'server')]);
		assert.deepStrictEqual(result.failures.map(failure => failure.reason), [McpServerCustomizationMigrationFailureReason.InvalidTarget]);
		assert.deepStrictEqual(parse((await fileService.readFile(sourceUri)).value.toString()), { servers: { server: { command: 'node' } } });
	});

	test('preserves a flat JSONC target while adding migrated servers', async () => {
		const root = URI.file('/flat-target');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString(`{
			// preserved
			"existing": { "command": "existing" },
		}`));

		const result = await createMigrator(fileService).migrate([candidate(root, 'server')]);
		const target = (await fileService.readFile(targetUri)).value.toString();

		assert.deepStrictEqual({
			result,
			target: parse(target),
			commentPreserved: target.includes('// preserved'),
		}, {
			result: { migratedCount: 1, failures: [] },
			target: {
				existing: { command: 'existing' },
				server: { type: 'local', command: 'node', args: [], tools: ['*'] },
			},
			commentPreserved: true,
		});
	});

	test('retains a newly created target when the source write fails', async () => {
		const root = URI.file('/source-failure');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const provider = new SourceWriteFailingProvider();
		const fileService = createFileService(provider);
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		provider.sourceUri = sourceUri;
		provider.failSourceWrite = true;

		const result = await createMigrator(fileService).migrate([candidate(root, 'server')]);

		assert.deepStrictEqual({
			failures: result.failures.map(failure => failure.reason),
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			failures: [McpServerCustomizationMigrationFailureReason.RollbackFailed],
			source: { servers: { server: { command: 'node' } } },
			target: { mcpServers: { server: { type: 'local', command: 'node', args: [], tools: ['*'] } } },
		});
	});

	test('restores source and target after a source write commits and then rejects', async () => {
		const root = URI.file('/source-commit-then-fail');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const provider = new SourceWriteCommitThenFailProvider();
		const fileService = createFileService(provider);
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{"existing":{"command":"existing"}}}'));
		provider.sourceUri = sourceUri;
		provider.failAfterSourceWrite = true;

		const result = await createMigrator(fileService).migrate([candidate(root, 'server')]);

		assert.deepStrictEqual({
			failures: result.failures.map(failure => failure.reason),
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			failures: [McpServerCustomizationMigrationFailureReason.WriteFailed],
			source: { servers: { server: { command: 'node' } } },
			target: { mcpServers: { existing: { command: 'existing' } } },
		});
	});

	test('preserves concurrent source edits after a rejected source write', async () => {
		const root = URI.file('/source-concurrent-change');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const provider = new ConcurrentSourceChangeProvider();
		const fileService = createFileService(provider);
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{"existing":{"command":"existing"}}}'));
		provider.sourceUri = sourceUri;
		provider.concurrentSourceContent = '{"servers":{"server":{"command":"changed"},"concurrent":{"command":"other"}}}';
		provider.changeSourceBeforeFailure = true;

		const result = await createMigrator(fileService).migrate([candidate(root, 'server')]);

		assert.deepStrictEqual({
			failures: result.failures.map(failure => failure.reason),
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			failures: [McpServerCustomizationMigrationFailureReason.RollbackFailed],
			source: { servers: { server: { command: 'changed' }, concurrent: { command: 'other' } } },
			target: { mcpServers: { existing: { command: 'existing' }, server: { type: 'local', command: 'node', args: [], tools: ['*'] } } },
		});
	});

	test('preserves a same-size source edit made before the source overwrite', async () => {
		const root = URI.file('/source-same-size-change');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const provider = new ConcurrentSameSizeReadProvider();
		const fileService = createFileService(provider);
		const originalSource = '{"servers":{"server":{"command":"node"},"other":{"command":"first"}}}';
		const concurrentSource = '{"servers":{"server":{"command":"node"},"other":{"command":"other"}}}';
		await fileService.writeFile(sourceUri, VSBuffer.fromString(originalSource));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{"existing":{"command":"first"}}}'));
		provider.resource = sourceUri;
		provider.concurrentContent = concurrentSource;

		const result = await createMigrator(fileService).migrate([candidate(root, 'server')]);

		assert.deepStrictEqual({
			sameSize: originalSource.length === concurrentSource.length,
			failures: result.failures.map(failure => failure.reason),
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			sameSize: true,
			failures: [McpServerCustomizationMigrationFailureReason.SourceChanged],
			source: { servers: { server: { command: 'node' }, other: { command: 'other' } } },
			target: { mcpServers: { existing: { command: 'first' } } },
		});
	});

	test('preserves a same-size target edit made before the target overwrite', async () => {
		const root = URI.file('/target-same-size-change');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const provider = new ConcurrentSameSizeReadProvider();
		const fileService = createFileService(provider);
		const originalTarget = '{"mcpServers":{"existing":{"command":"first"}}}';
		const concurrentTarget = '{"mcpServers":{"existing":{"command":"other"}}}';
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString(originalTarget));
		provider.resource = targetUri;
		provider.concurrentContent = concurrentTarget;

		const result = await createMigrator(fileService).migrate([candidate(root, 'server')]);

		assert.deepStrictEqual({
			sameSize: originalTarget.length === concurrentTarget.length,
			failures: result.failures.map(failure => failure.reason),
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			sameSize: true,
			failures: [McpServerCustomizationMigrationFailureReason.TargetChanged],
			source: { servers: { server: { command: 'node' } } },
			target: { mcpServers: { existing: { command: 'other' } } },
		});
	});

	test('preserves provider errors while checking that a target still exists', async () => {
		const root = URI.file('/target-resolve-failure');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const provider = new ResolveFailingProvider();
		const fileService = createFileService(provider);
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{"existing":{"command":"existing"}}}'));
		provider.resource = targetUri;
		provider.failAtStat = 2;

		const result = await createMigrator(fileService).migrate([candidate(root, 'server')]);

		assert.deepStrictEqual({
			failures: result.failures.map(failure => [failure.reason, failure.error?.message]),
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			failures: [[McpServerCustomizationMigrationFailureReason.WriteFailed, 'Expected resolve failure']],
			source: { servers: { server: { command: 'node' } } },
			target: { mcpServers: { existing: { command: 'existing' } } },
		});
	});

	test('restores the source and reports rollback failure when the written target changes', async () => {
		const root = URI.file('/rollback-failure');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const provider = new ConcurrentTargetProvider();
		const fileService = createFileService(provider);
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		provider.sourceUri = sourceUri;
		provider.targetUri = targetUri;
		provider.changeTargetBeforeSourceWrite = true;

		const result = await createMigrator(fileService).migrate([candidate(root, 'server')]);

		assert.deepStrictEqual({
			failures: result.failures.map(failure => failure.reason),
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			failures: [McpServerCustomizationMigrationFailureReason.RollbackFailed],
			source: { servers: { server: { command: 'node' } } },
			target: { mcpServers: { foreign: { command: 'other' } } },
		});
	});

	test('retains the migrated target when source restoration cannot be verified', async () => {
		const root = URI.file('/source-restore-failure');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const originalSourceContent = '{"servers":{"server":{"command":"node"}}}';
		const provider = new ConcurrentSourceRestoreProvider();
		const fileService = createFileService(provider);
		await fileService.writeFile(sourceUri, VSBuffer.fromString(originalSourceContent));
		provider.sourceUri = sourceUri;
		provider.originalSourceContent = originalSourceContent;
		provider.restoreSourceAfterWrite = true;

		const result = await createMigrator(fileService).migrate([candidate(root, 'server')]);

		assert.deepStrictEqual({
			failures: result.failures.map(failure => failure.reason),
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			failures: [McpServerCustomizationMigrationFailureReason.RollbackFailed],
			source: { servers: { server: { command: 'node' } } },
			target: { mcpServers: { server: { type: 'local', command: 'node', args: [], tools: ['*'] } } },
		});
	});

	test('checks execution context immediately before writes', async () => {
		const root = URI.file('/context');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));

		const result = await createMigrator(fileService).migrate([candidate(root, 'server')], {
			isContextCurrent: () => false,
		});

		assert.deepStrictEqual(result.failures.map(failure => failure.reason), [McpServerCustomizationMigrationFailureReason.NoLongerEligible]);
		assert.strictEqual(await fileService.exists(targetUri), false);
	});

	for (const location of ['destination', 'source'] as const) {
		test(`migrates a server whose name is also present in another root's ${location}`, async () => {
			const primary = URI.file('/primary');
			const secondary = URI.file('/secondary');
			const selected = candidate(secondary, 'demo');
			const otherRootUri = location === 'destination'
				? URI.joinPath(primary, '.mcp.json')
				: URI.joinPath(primary, '.vscode', 'mcp.json');
			const fileService = createFileService();
			const otherRootContent = location === 'destination'
				? '{"mcpServers":{"demo":{"command":"other"}}}'
				: '{"servers":{"demo":{"command":"other"}}}';
			await fileService.writeFile(selected.sourceUri, VSBuffer.fromString('{"servers":{"demo":{"command":"node"}}}'));
			await fileService.writeFile(otherRootUri, VSBuffer.fromString(otherRootContent));

			const result = await createMigrator(fileService).migrate([selected]);

			assert.deepStrictEqual({
				result,
				source: parse((await fileService.readFile(selected.sourceUri)).value.toString()),
				target: parse((await fileService.readFile(selected.targetUri)).value.toString()),
				otherRoot: (await fileService.readFile(otherRootUri)).value.toString(),
			}, {
				result: { migratedCount: 1, failures: [] },
				source: { servers: {} },
				target: { mcpServers: { demo: { type: 'local', command: 'node', args: [], tools: ['*'] } } },
				otherRoot: otherRootContent,
			});
		});
	}

	test('plans and migrates same-name servers from every root into each root\'s own destination', async () => {
		const roots = [URI.file('/root-one'), URI.file('/root-two')];
		const fileService = createFileService();
		for (const root of roots) {
			await fileService.writeFile(URI.joinPath(root, '.vscode', 'mcp.json'), VSBuffer.fromString(`{
				"servers": {
					"migrate-me": { "type": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-everything"] },
					"leave-me": { "type": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-everything"] },
				}
			}`));
		}
		const projectedConfiguration: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: 'npx', args: ['-y', '@modelcontextprotocol/server-everything'] };
		const supportFor = (root: URI, index: number, name: string): IAgentHostMcpServerSupport => {
			const server = support(root, name, { id: `mcp.config.ws${index}.${name}`, collectionId: `mcp.config.ws${index}`, projectedConfiguration });
			// The client registers only the last folder's same-named server; the other one is shadowed.
			return index === 0
				? { ...server, enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledNotRegistered }, delivery: AgentHostMcpServerDelivery.NotDelivered, shadowedBy: `mcp.config.ws1.${name}` }
				: server;
		};
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: roots.flatMap((root, index) => [supportFor(root, index, 'migrate-me'), supportFor(root, index, 'leave-me')]),
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};
		const migrator = createMigrator(fileService);

		const plan = await migrator.createPlan(snapshot, roots);
		const result = await migrator.migrate(plan.candidates.filter(candidate => candidate.name === 'migrate-me'));

		const expectedTarget = { mcpServers: { 'migrate-me': { type: 'local', command: 'npx', args: ['-y', '@modelcontextprotocol/server-everything'], tools: ['*'] } } };
		const expectedSource = { servers: { 'leave-me': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-everything'] } } };
		assert.deepStrictEqual({
			candidates: plan.candidates.map(candidate => [candidate.id, candidate.targetUri.toString()]),
			exclusions: plan.exclusions,
			result,
			files: await Promise.all(roots.map(async root => ({
				source: parse((await fileService.readFile(URI.joinPath(root, '.vscode', 'mcp.json'))).value.toString()),
				target: parse((await fileService.readFile(URI.joinPath(root, '.mcp.json'))).value.toString()),
			}))),
		}, {
			candidates: [
				['mcp.config.ws0.migrate-me', URI.joinPath(roots[0], '.mcp.json').toString()],
				['mcp.config.ws0.leave-me', URI.joinPath(roots[0], '.mcp.json').toString()],
				['mcp.config.ws1.migrate-me', URI.joinPath(roots[1], '.mcp.json').toString()],
				['mcp.config.ws1.leave-me', URI.joinPath(roots[1], '.mcp.json').toString()],
			],
			exclusions: [],
			result: { migratedCount: 2, failures: [] },
			files: [
				{ source: expectedSource, target: expectedTarget },
				{ source: expectedSource, target: expectedTarget },
			],
		});
	});

	test('does not plan an unregistered server that is not shadowed by another root', async () => {
		const root = URI.file('/unregistered');
		const fileService = createFileService();
		await fileService.writeFile(URI.joinPath(root, '.vscode', 'mcp.json'), VSBuffer.fromString('{"servers":{"demo":{"command":"node"}}}'));
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [support(root, 'demo', { enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledNotRegistered }, delivery: AgentHostMcpServerDelivery.NotDelivered })],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};

		const plan = await createMigrator(fileService).createPlan(snapshot, [root]);

		assert.deepStrictEqual({
			candidates: plan.candidates.length,
			exclusions: plan.exclusions.map(exclusion => [exclusion.name, exclusion.reason]),
		}, {
			candidates: 0,
			exclusions: [['demo', McpServerCustomizationMigrationFailureReason.NoLongerEligible]],
		});
	});
});
