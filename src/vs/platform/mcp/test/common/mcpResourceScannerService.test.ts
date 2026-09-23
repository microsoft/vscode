/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { parse } from '../../../../base/common/json.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../configuration/common/configuration.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileContent, IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { IInstallableMcpServer } from '../../common/mcpManagement.js';
import { McpServerType, McpServerVariableType } from '../../common/mcpPlatformTypes.js';
import { McpResourceScannerService } from '../../common/mcpResourceScannerService.js';
import { McpResourceFormat } from '../../common/mcpWorkspaceConfiguration.js';

class ConcurrentEditFileService extends FileService {
	afterRead: (() => Promise<void>) | undefined;
	afterMissingRead: (() => Promise<void>) | undefined;

	override async readFile(...args: Parameters<IFileService['readFile']>): Promise<IFileContent> {
		let file: IFileContent;
		try {
			file = await super.readFile(...args);
		} catch (error) {
			const afterMissingRead = this.afterMissingRead;
			this.afterMissingRead = undefined;
			await afterMissingRead?.();
			throw error;
		}
		const afterRead = this.afterRead;
		this.afterRead = undefined;
		await afterRead?.();
		return file;
	}
}

suite('McpResourceScannerService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.from({ scheme: Schemas.inMemory, path: '/workspace/.mcp.json' });
	const target = ConfigurationTarget.WORKSPACE_FOLDER;
	const format = McpResourceFormat.WorkspaceRoot;
	let fileService: ConcurrentEditFileService;
	let scanner: McpResourceScannerService;

	setup(() => {
		fileService = store.add(new ConcurrentEditFileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		scanner = store.add(new McpResourceScannerService(fileService, store.add(new UriIdentityService(fileService))));
	});

	const server = (name: string): IInstallableMcpServer => ({ name, config: { type: McpServerType.LOCAL, command: name } });
	const read = async () => (await fileService.readFile(resource)).value.toString();
	const write = (content: string) => fileService.writeFile(resource, VSBuffer.fromString(content));

	test('creates a canonical wrapped JSON document and merges concurrent additions', async () => {
		await Promise.all([
			scanner.addMcpServers([server('one')], resource, target, format),
			scanner.addMcpServers([server('two')], resource, target, format),
		]);
		assert.deepStrictEqual(JSON.parse(await read()), { mcpServers: { one: server('one').config, two: server('two').config } });
	});

	for (const wrapped of [true, false]) {
		test(`preserves ${wrapped ? 'wrapped' : 'flat'} JSONC, unknown properties and invalid neighboring entries`, async () => {
			const entries = '"keep": { "command": "keep", "custom": true }, "invalid": null, "remove": { "command": "old" },';
			await write(wrapped
				? `{\r\n  // document comment\r\n  "mcpServers": { ${entries} },\r\n  "other": { "value": 1 },\r\n}\r\n`
				: `{\r\n  // document comment\r\n  ${entries}\r\n  "other": { "value": 1 },\r\n}\r\n`);
			await scanner.addMcpServers([server('new')], resource, target, format);
			await scanner.removeMcpServers(['remove'], resource, target, format);
			const content = await read();
			const scanned = await scanner.scanMcpServers(resource, target, format);
			const expected = { keep: { command: 'keep', custom: true }, invalid: null, new: server('new').config };
			assert.deepStrictEqual({
				content: parse(content),
				comment: content.includes('// document comment'),
				lineEndings: content.includes('\r\n') && !content.replaceAll('\r\n', '').includes('\n'),
				scannedNames: Object.keys(scanned.servers ?? {}),
			}, {
				content: wrapped ? { mcpServers: expected, other: { value: 1 } } : { ...expected, other: { value: 1 } },
				comment: true,
				lineEndings: true,
				scannedNames: ['keep', 'new'],
			});
		});
	}

	test('removes malformed entries and keeps the empty root document', async () => {
		await write('{"mcpServers":{"invalid":null,"one":{"command":"one"}},"other":true}');
		await scanner.removeMcpServers(['invalid', 'one', 'absent'], resource, target, format);
		assert.deepStrictEqual(JSON.parse(await read()), { mcpServers: {}, other: true });
	});

	test('missing root reads and removals do not create a file', async () => {
		const scanned = await scanner.scanMcpServers(resource, target, format);
		await scanner.removeMcpServers(['absent'], resource, target, format);
		assert.deepStrictEqual({ scanned, exists: await fileService.exists(resource) }, { scanned: { servers: {} }, exists: false });
	});

	test('rejects invalid batches and unsupported sandbox changes without writes', async () => {
		const original = '{"mcpServers":{"keep":{"command":"keep"}}}';
		await write(original);
		await assert.rejects(scanner.addMcpServers([server('valid'), { ...server('invalid'), config: { ...server('invalid').config, gallery: true } }], resource, target, format));
		await assert.rejects(scanner.addMcpServers([{
			...server('assisted'),
			inputs: [{ id: 'token', type: McpServerVariableType.PROMPT, description: 'Token', password: true }],
		}], resource, target, format));
		await assert.rejects(scanner.updateSandboxConfig(data => ({ ...data, sandbox: {} }), resource, target, format));
		assert.strictEqual(await read(), original);
	});

	for (const content of ['{ broken', '{"mcpServers":null}', '{"mcpServers":[]}', '{"mcpServers":"bad"}']) {
		test(`never overwrites invalid root content: ${content}`, async () => {
			await write(content);
			await assert.rejects(scanner.scanMcpServers(resource, target, format));
			await assert.rejects(scanner.addMcpServers([server('new')], resource, target, format));
			await assert.rejects(scanner.removeMcpServers(['old'], resource, target, format));
			assert.strictEqual(await read(), content);
		});
	}

	test('does not turn a flat server named mcpServers into a wrapper accidentally', async () => {
		const content = '{"existing":{"command":"node"}}';
		await write(content);
		await assert.rejects(scanner.addMcpServers([server('mcpServers')], resource, target, format));
		assert.strictEqual(await read(), content);
	});

	test('detects a same-size concurrent edit before overwriting an existing file', async () => {
		await write('{"mcpServers":{"old":{"command":"old"}}}');
		const concurrent = '{"mcpServers":{"new":{"command":"new"}}}';
		fileService.afterRead = async () => { await write(concurrent); };
		await assert.rejects(scanner.addMcpServers([server('mine')], resource, target, format));
		assert.strictEqual(await read(), concurrent);
	});

	test('does not overwrite a concurrently created root file', async () => {
		const concurrent = '{"mcpServers":{"other":{"command":"other"}}}';
		fileService.afterMissingRead = async () => { await write(concurrent); };
		await assert.rejects(scanner.addMcpServers([server('mine')], resource, target, format));
		assert.strictEqual(await read(), concurrent);
	});

	test('does not recreate a concurrently deleted root file', async () => {
		await write('{"mcpServers":{"old":{"command":"old"}}}');
		fileService.afterRead = () => fileService.del(resource);
		await assert.rejects(scanner.addMcpServers([server('mine')], resource, target, format));
		assert.strictEqual(await fileService.exists(resource), false);
	});

	test('omitting format preserves legacy configuration and inputs even for a root-named resource', async () => {
		const inputs = [{ id: 'token', type: McpServerVariableType.PROMPT, description: 'Token', password: true }];
		await scanner.addMcpServers([{ ...server('legacy'), inputs }], resource, target);
		await scanner.updateSandboxConfig(data => ({ ...data, sandbox: { network: { allowedDomains: ['example.com'] } } }), resource, target);
		assert.deepStrictEqual(JSON.parse(await read()), {
			servers: { legacy: server('legacy').config },
			inputs,
			sandbox: { network: { allowedDomains: ['example.com'] } },
		});
	});
});
