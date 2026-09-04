/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { parse } from '../../../../../../base/common/jsonc.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IFileWriteOptions, IStat } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { McpServerCustomizationMigrator } from '../../../browser/aiCustomization/mcpServerCustomizationMigration.js';
import { AgentHostMcpServerApplicability, AgentHostMcpServerDelivery, AgentHostMcpServerEnablementState, AgentHostMcpServerSourceKind, IAgentHostMcpServerSupport, IAgentHostMcpServerSupportSnapshot } from '../../../browser/agentSessions/agentHost/agentHostMcpServerSupport.js';
import { CustomizationMigrationType, IMcpServerCustomizationMigrationCandidate, McpServerCustomizationMigrationFailureReason } from '../../../common/promptSyntax/service/customizationMigrationService.js';

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

suite('McpServerCustomizationMigration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFileService(provider: InMemoryFileSystemProvider = new InMemoryFileSystemProvider()): FileService {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(provider);
		store.add(fileService.registerProvider(Schemas.file, provider));
		return fileService;
	}

	function candidate(root: URI, name: string, projectedConfiguration: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: 'node' }): IMcpServerCustomizationMigrationCandidate {
		return {
			type: CustomizationMigrationType.McpServers,
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

	test('plans only enabled, applicable, fully supported and exactly representable workspace-folder servers', async () => {
		const root = URI.file('/plan');
		const fileService = createFileService();
		await fileService.writeFile(URI.joinPath(root, '.vscode', 'mcp.json'), VSBuffer.fromString(`{
			"servers": {
				"eligible": { "type": "stdio", "command": "node" },
				"variable": { "type": "stdio", "command": "\${workspaceFolder}/server" },
				"metadata": { "type": "stdio", "command": "node", "version": "1" },
				"cwd": { "type": "stdio", "command": "node", "cwd": "/tmp" },
				"sse": { "type": "http", "transport": "sse", "url": "https://example.com" },
				"disabled": { "type": "stdio", "command": "node" }
			}
		}`));
		const snapshot: IAgentHostMcpServerSupportSnapshot = {
			servers: [
				support(root, 'eligible'),
				support(root, 'variable', { projectedConfiguration: { type: McpServerType.LOCAL, command: '/plan/server' } }),
				support(root, 'metadata'),
				support(root, 'cwd', { projectedConfiguration: { type: McpServerType.LOCAL, command: 'node', cwd: '/tmp' } }),
				support(root, 'sse', { projectedConfiguration: { type: McpServerType.REMOTE, transport: 'sse', url: 'https://example.com' } }),
				support(root, 'disabled', { enablement: { enabled: false, state: AgentHostMcpServerEnablementState.DisabledWorkspace } }),
				support(URI.file('/outside'), 'outside'),
			],
			discoveryComplete: true,
			coverage: { restrictedByMcpAccess: false, restrictedByCustomizationPolicy: false },
		};

		const plan = await new McpServerCustomizationMigrator(fileService).createPlan(snapshot, [root]);

		assert.deepStrictEqual({
			candidates: plan.candidates.map(item => item.name),
			exclusions: plan.exclusions.map(item => [item.name, item.reason]),
		}, {
			candidates: ['eligible'],
			exclusions: [
				['variable', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
				['metadata', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
				['cwd', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
				['sse', McpServerCustomizationMigrationFailureReason.UnrepresentableConfiguration],
				['disabled', McpServerCustomizationMigrationFailureReason.NoLongerEligible],
			],
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

		const result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'selected')]);
		const source = (await fileService.readFile(sourceUri)).value.toString();

		assert.deepStrictEqual({
			result: { migratedCount: result.migratedCount, failures: result.failures },
			source: parse(source),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
			commentPreserved: source.includes('// preserved'),
		}, {
			result: { migratedCount: 1, failures: [] },
			source: { servers: { unselected: { type: 'stdio', command: 'other' } } },
			target: { mcpServers: { existing: { type: 'stdio', command: 'existing' }, selected: { type: 'stdio', command: 'node' } } },
			commentPreserved: true,
		});
	});

	test('accepts an equivalent target and rejects a conflicting target', async () => {
		const root = URI.file('/targets');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"equivalent":{"command":"node","args":[]},"conflict":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{"equivalent":{"type":"stdio","command":"node"},"conflict":{"type":"stdio","command":"other"}}}'));

		const result = await new McpServerCustomizationMigrator(fileService).migrate([
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

	test('rejects changed source configuration and invalid targets without writes', async () => {
		const root = URI.file('/invalid');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"changed"}}}'));
		let result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'server')]);
		assert.deepStrictEqual(result.failures.map(failure => failure.reason), [McpServerCustomizationMigrationFailureReason.SourceChanged]);

		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":[]}'));
		result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'server')]);
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

		const result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'server')]);
		const target = (await fileService.readFile(targetUri)).value.toString();

		assert.deepStrictEqual({
			result,
			target: parse(target),
			commentPreserved: target.includes('// preserved'),
		}, {
			result: { migratedCount: 1, failures: [] },
			target: {
				existing: { command: 'existing' },
				server: { type: 'stdio', command: 'node' },
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

		const result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'server')]);

		assert.deepStrictEqual({
			failures: result.failures.map(failure => failure.reason),
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			failures: [McpServerCustomizationMigrationFailureReason.RollbackFailed],
			source: { servers: { server: { command: 'node' } } },
			target: { mcpServers: { server: { type: 'stdio', command: 'node' } } },
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

		const result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'server')]);

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

		const result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'server')]);

		assert.deepStrictEqual({
			failures: result.failures.map(failure => failure.reason),
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			failures: [McpServerCustomizationMigrationFailureReason.RollbackFailed],
			source: { servers: { server: { command: 'changed' }, concurrent: { command: 'other' } } },
			target: { mcpServers: { existing: { command: 'existing' }, server: { type: 'stdio', command: 'node' } } },
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

		const result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'server')]);

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

		const result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'server')]);

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

		const result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'server')]);

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

		const result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'server')]);

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

		const result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'server')]);

		assert.deepStrictEqual({
			failures: result.failures.map(failure => failure.reason),
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			failures: [McpServerCustomizationMigrationFailureReason.RollbackFailed],
			source: { servers: { server: { command: 'node' } } },
			target: { mcpServers: { server: { type: 'stdio', command: 'node' } } },
		});
	});

	test('checks execution context immediately before writes', async () => {
		const root = URI.file('/context');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		const fileService = createFileService();
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"command":"node"}}}'));

		const result = await new McpServerCustomizationMigrator(fileService).migrate([candidate(root, 'server')], {
			isContextCurrent: () => false,
		});

		assert.deepStrictEqual(result.failures.map(failure => failure.reason), [McpServerCustomizationMigrationFailureReason.NoLongerEligible]);
		assert.strictEqual(await fileService.exists(targetUri), false);
	});
});
