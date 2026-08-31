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
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IFileWriteOptions } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { McpServerMigration } from '../../../browser/aiCustomization/customizationMigration.js';
import { CustomizationMigrationType, IMcpServerCustomizationMigrationCandidate, McpServerMigrationFailureReason } from '../../../common/promptSyntax/service/customizationMigrationService.js';

class SourceWriteFailingFileSystemProvider extends InMemoryFileSystemProvider {
	failSourceWrite = false;
	sourceUri: URI | undefined;

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		if (this.failSourceWrite && this.sourceUri && isEqual(resource, this.sourceUri)) {
			throw new Error('Expected source write failure');
		}
		await super.writeFile(resource, content, options);
	}
}

class TargetChangingFileSystemProvider extends InMemoryFileSystemProvider {
	sourceUri: URI | undefined;
	targetUri: URI | undefined;
	changeTargetBeforeSourceWrite = false;

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		if (this.changeTargetBeforeSourceWrite && this.sourceUri && this.targetUri && isEqual(resource, this.sourceUri)) {
			// Simulate another process replacing the target between the migration's target and source writes.
			this.changeTargetBeforeSourceWrite = false;
			await super.writeFile(this.targetUri, VSBuffer.fromString('{"mcpServers":{}}').buffer, {
				create: true,
				overwrite: true,
				unlock: false,
				atomic: false,
			});
		}
		await super.writeFile(resource, content, options);
	}
}

class DeletingBeforeExistsFileService extends FileService {
	deleteBeforeExists: URI | undefined;

	override async exists(resource: URI): Promise<boolean> {
		if (this.deleteBeforeExists && isEqual(resource, this.deleteBeforeExists)) {
			this.deleteBeforeExists = undefined;
			await this.del(resource);
		}
		return super.exists(resource);
	}
}

suite('mcpServerMigration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function candidate(root: URI, id: string, name: string, configuration: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: 'source' }): IMcpServerCustomizationMigrationCandidate {
		return {
			type: CustomizationMigrationType.McpServers,
			id,
			name,
			sourceUri: URI.joinPath(root, '.vscode', 'mcp.json'),
			targetUri: URI.joinPath(root, '.mcp.json'),
			configuration,
		};
	}

	async function migrateMcpServers(candidates: readonly IMcpServerCustomizationMigrationCandidate[], fileService: FileService) {
		const result = await new McpServerMigration(fileService).migrate(candidates);
		return {
			migratedCount: result.migratedCount,
			failures: result.failures.map(failure => ({
				name: failure.name,
				reason: failure.reason,
				message: failure.error?.message,
			})),
		};
	}

	test('moves only selected servers while preserving other eligible and unsupported source entries', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const root = URI.file('/workspace');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		await fileService.writeFile(sourceUri, VSBuffer.fromString(`{
	// Keep this source comment.
	"servers": {
		"stdio": { "type": "stdio", "command": "node", "args": ["/workspace/server.js"] },
		"unselected": { "type": "stdio", "command": "node", "args": ["other.js"] },
		"unsupported": { "type": "stdio", "command": "\${input:command}" },
		"http": { "type": "http", "url": "https://example.com/mcp" }
	}
}`));
		await fileService.writeFile(targetUri, VSBuffer.fromString(`{
	"mcpServers": {
		"existing": { "type": "stdio", "command": "existing" }
	}
}`));

		const result = await migrateMcpServers([
			candidate(root, 'stdio-id', 'stdio', { type: McpServerType.LOCAL, command: 'node', args: ['/workspace/server.js'] }),
			candidate(root, 'http-id', 'http', { type: McpServerType.REMOTE, url: 'https://example.com/mcp' }),
		], fileService);
		const sourceContent = (await fileService.readFile(sourceUri)).value.toString();
		const targetContent = (await fileService.readFile(targetUri)).value.toString();

		assert.deepStrictEqual({
			result,
			source: parse(sourceContent),
			target: parse(targetContent),
			sourceCommentPreserved: sourceContent.includes('// Keep this source comment.'),
		}, {
			result: { migratedCount: 2, failures: [] },
			source: {
				servers: {
					unselected: { type: 'stdio', command: 'node', args: ['other.js'] },
					unsupported: { type: 'stdio', command: '${input:command}' },
				},
			},
			target: {
				mcpServers: {
					existing: { type: 'stdio', command: 'existing' },
					stdio: { type: 'stdio', command: 'node', args: ['/workspace/server.js'] },
					http: { type: 'http', url: 'https://example.com/mcp' },
				},
			},
			sourceCommentPreserved: true,
		});
	});

	test('does not overwrite a conflicting destination server', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const root = URI.file('/workspace-conflict');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"type":"stdio","command":"source"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{"server":{"type":"stdio","command":"target"}}}'));

		const result = await migrateMcpServers([candidate(root, 'server-id', 'server')], fileService);

		assert.deepStrictEqual({
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			result: { migratedCount: 0, failures: [{ name: 'server', reason: McpServerMigrationFailureReason.TargetConflict, message: undefined }] },
			source: { servers: { server: { type: 'stdio', command: 'source' } } },
			target: { mcpServers: { server: { type: 'stdio', command: 'target' } } },
		});
	});

	test('does not remove a source server that changed after candidate discovery', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const root = URI.file('/workspace-changed-source');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"type":"stdio","command":"updated"}}}'));

		const result = await migrateMcpServers([candidate(root, 'server-id', 'server')], fileService);

		assert.deepStrictEqual({
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			targetExists: await fileService.exists(targetUri),
		}, {
			result: { migratedCount: 0, failures: [{ name: 'server', reason: McpServerMigrationFailureReason.SourceChanged, message: undefined }] },
			source: { servers: { server: { type: 'stdio', command: 'updated' } } },
			targetExists: false,
		});
	});

	test('rejects source behavior that root .mcp.json cannot preserve', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const root = URI.file('/workspace-unrepresentable');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"cwd":{"type":"stdio","command":"source","cwd":"/explicit"},"metadata":{"type":"http","url":"https://example.com","version":"1.0.0"},"oauth":{"type":"http","url":"https://example.com","oauth":{"enterpriseManaged":true}}}}'));

		const result = await migrateMcpServers([
			candidate(root, 'cwd-id', 'cwd', { type: McpServerType.LOCAL, command: 'source', cwd: '/explicit' }),
			candidate(root, 'metadata-id', 'metadata', { type: McpServerType.REMOTE, url: 'https://example.com' }),
			candidate(root, 'oauth-id', 'oauth', { type: McpServerType.REMOTE, url: 'https://example.com' }),
		], fileService);

		assert.deepStrictEqual({
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			targetExists: await fileService.exists(targetUri),
		}, {
			result: {
				migratedCount: 0,
				failures: [
					{ name: 'cwd', reason: McpServerMigrationFailureReason.UnrepresentableConfiguration, message: undefined },
					{ name: 'metadata', reason: McpServerMigrationFailureReason.SourceChanged, message: undefined },
					{ name: 'oauth', reason: McpServerMigrationFailureReason.SourceChanged, message: undefined },
				],
			},
			source: {
				servers: {
					cwd: { type: 'stdio', command: 'source', cwd: '/explicit' },
					metadata: { type: 'http', url: 'https://example.com', version: '1.0.0' },
					oauth: { type: 'http', url: 'https://example.com', oauth: { enterpriseManaged: true } },
				},
			},
			targetExists: false,
		});
	});

	test('treats JSON-equivalent destination configurations as duplicates', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const root = URI.file('/workspace-equivalent-target');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"type":"stdio","command":"source"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{"server":{"type":"stdio","command":"source","args":[]}}}'));

		const result = await migrateMcpServers([
			candidate(root, 'server-id', 'server', { type: McpServerType.LOCAL, command: 'source', args: undefined }),
		], fileService);

		assert.deepStrictEqual({
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			result: { migratedCount: 1, failures: [] },
			source: { servers: {} },
			target: { mcpServers: { server: { type: 'stdio', command: 'source', args: [] } } },
		});
	});

	test('does not recreate an existing target deleted during migration', async () => {
		const fileService = store.add(new DeletingBeforeExistsFileService(new NullLogService()));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const root = URI.file('/workspace-deleted-target');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"type":"stdio","command":"source"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{}}'));
		fileService.deleteBeforeExists = targetUri;

		const result = await migrateMcpServers([candidate(root, 'server-id', 'server')], fileService);

		assert.deepStrictEqual({
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			targetExists: await fileService.exists(targetUri),
		}, {
			result: { migratedCount: 0, failures: [{ name: 'server', reason: McpServerMigrationFailureReason.WriteFailed, message: 'File was deleted during MCP migration: file:///workspace-deleted-target/.mcp.json' }] },
			source: { servers: { server: { type: 'stdio', command: 'source' } } },
			targetExists: false,
		});
	});

	test('does not recreate an existing source deleted during migration', async () => {
		const fileService = store.add(new DeletingBeforeExistsFileService(new NullLogService()));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const root = URI.file('/workspace-deleted-source');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"type":"stdio","command":"source"}}}'));
		fileService.deleteBeforeExists = sourceUri;

		const result = await migrateMcpServers([candidate(root, 'server-id', 'server')], fileService);

		assert.deepStrictEqual({
			result,
			sourceExists: await fileService.exists(sourceUri),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			result: { migratedCount: 0, failures: [{ name: 'server', reason: McpServerMigrationFailureReason.RollbackFailed, message: 'Failed to migrate and roll back MCP servers from file:///workspace-deleted-source/.vscode/mcp.json.' }] },
			sourceExists: false,
			target: { mcpServers: { server: { type: 'stdio', command: 'source' } } },
		});
	});

	test('restores the source when an equivalent destination changes during migration', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new TargetChangingFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const root = URI.file('/workspace-concurrent-target');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"type":"stdio","command":"source"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('{"mcpServers":{"server":{"type":"stdio","command":"source"}}}'));
		provider.sourceUri = sourceUri;
		provider.targetUri = targetUri;
		provider.changeTargetBeforeSourceWrite = true;

		const result = await migrateMcpServers([candidate(root, 'server-id', 'server')], fileService);

		assert.deepStrictEqual({
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			result: { migratedCount: 0, failures: [{ name: 'server', reason: McpServerMigrationFailureReason.TargetChanged, message: `MCP server 'server' changed in file:///workspace-concurrent-target/.mcp.json during migration.` }] },
			source: { servers: { server: { type: 'stdio', command: 'source' } } },
			target: { mcpServers: {} },
		});
	});

	test('rejects an existing target that is not strict .mcp.json', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const root = URI.file('/workspace-empty-target');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"type":"stdio","command":"source"}}}'));
		await fileService.writeFile(targetUri, VSBuffer.fromString('// Workspace MCP servers\n'));

		const result = await migrateMcpServers([candidate(root, 'server-id', 'server')], fileService);
		const sourceContent = (await fileService.readFile(sourceUri)).value.toString();
		const targetContent = (await fileService.readFile(targetUri)).value.toString();

		assert.deepStrictEqual({
			result,
			source: parse(sourceContent),
			commentPreserved: targetContent.includes('// Workspace MCP servers'),
		}, {
			result: { migratedCount: 0, failures: [{ name: 'server', reason: McpServerMigrationFailureReason.InvalidTarget, message: 'MCP configuration file:///workspace-empty-target/.mcp.json must contain strict JSON.' }] },
			source: { servers: { server: { type: 'stdio', command: 'source' } } },
			commentPreserved: true,
		});
	});

	test('retains a newly created target when updating the source fails', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new SourceWriteFailingFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const root = URI.file('/workspace-rollback');
		const sourceUri = URI.joinPath(root, '.vscode', 'mcp.json');
		const targetUri = URI.joinPath(root, '.mcp.json');
		await fileService.writeFile(sourceUri, VSBuffer.fromString('{"servers":{"server":{"type":"stdio","command":"source"}}}'));
		provider.sourceUri = sourceUri;
		provider.failSourceWrite = true;
		const result = await migrateMcpServers([candidate(root, 'server-id', 'server')], fileService);

		assert.deepStrictEqual({
			result,
			source: parse((await fileService.readFile(sourceUri)).value.toString()),
			target: parse((await fileService.readFile(targetUri)).value.toString()),
		}, {
			result: {
				migratedCount: 0,
				failures: [{
					name: 'server',
					reason: McpServerMigrationFailureReason.RollbackFailed,
					message: 'Failed to migrate and roll back MCP servers from file:///workspace-rollback/.vscode/mcp.json.',
				}],
			},
			source: { servers: { server: { type: 'stdio', command: 'source' } } },
			target: { mcpServers: { server: { type: 'stdio', command: 'source' } } },
		});
	});
});
