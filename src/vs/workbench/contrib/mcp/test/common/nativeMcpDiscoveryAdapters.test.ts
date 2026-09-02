/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { Platform } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService, IFileSystemWatcher } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INativeMcpDiscoveryData } from '../../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { NativeFilesystemMcpDiscovery } from '../../common/discovery/nativeMcpDiscoveryAbstract.js';
import { claudeConfigToServerDefinition } from '../../common/discovery/nativeMcpDiscoveryAdapters.js';
import { ExternalDiscoverySource, mcpDiscoverySection } from '../../common/mcpConfiguration.js';
import { McpServerTransportType } from '../../common/mcpTypes.js';

class TestNativeFilesystemMcpDiscovery extends NativeFilesystemMcpDiscovery {
	override start(): void { }

	setDetailsForTest(details: INativeMcpDiscoveryData): void {
		this.setDetails(details);
	}
}

suite('MCP Discovery - nativeMcpDiscoveryAdapters', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function readNativeDiscoveryPaths(
		discoverySources: boolean | Partial<Record<ExternalDiscoverySource, boolean>>,
		details: Partial<INativeMcpDiscoveryData> = {},
	): string[] {
		const paths: string[] = [];
		const fileService = upcastPartial<IFileService>({
			createWatcher: () => upcastPartial<IFileSystemWatcher>({
				onDidChange: Event.None,
				dispose: () => { },
			}),
			readFile: resource => {
				paths.push(resource.path);
				return Promise.reject(new Error('Test does not provide configuration contents'));
			},
		});
		const instantiationService = store.add(new TestInstantiationService());
		const discovery = store.add(new TestNativeFilesystemMcpDiscovery(
			null,
			upcastPartial<ILabelService>({}),
			fileService,
			instantiationService,
			upcastPartial<IMcpRegistry>({}),
			new TestConfigurationService({ [mcpDiscoverySection]: discoverySources }),
		));
		discovery.setDetailsForTest({
			platform: Platform.Linux,
			homedir: URI.file('/home/test'),
			...details,
		});
		return paths;
	}

	test('watches existing external application MCP configurations', () => {
		assert.deepStrictEqual(readNativeDiscoveryPaths({
			[ExternalDiscoverySource.ClaudeDesktop]: true,
			[ExternalDiscoverySource.CursorGlobal]: true,
			[ExternalDiscoverySource.Windsurf]: true,
		}), [
			'/home/test/.config/Claude/claude_desktop_config.json',
			'/home/test/.cursor/mcp.json',
			'/home/test/.codeium/windsurf/mcp_config.json',
		]);
	});

	test('watches the Copilot user MCP configuration', () => {
		assert.deepStrictEqual(readNativeDiscoveryPaths({
			[ExternalDiscoverySource.Copilot]: true,
		}), ['/home/test/.copilot/mcp-config.json']);
	});

	test('does not watch the Copilot user MCP configuration by default', () => {
		assert.deepStrictEqual(readNativeDiscoveryPaths({}), []);
	});

	test('watches the configured Copilot home instead of the default', () => {
		assert.deepStrictEqual(readNativeDiscoveryPaths({
			[ExternalDiscoverySource.Copilot]: true,
		}, {
			copilotHome: URI.file('/custom/copilot'),
		}), ['/custom/copilot/mcp-config.json']);
	});

	test('parses the Copilot user MCP configuration schema', async () => {
		const definitions = await claudeConfigToServerDefinition('copilot', VSBuffer.fromString(JSON.stringify({
			mcpServers: {
				'local-server': {
					type: 'local',
					command: 'node',
					args: ['server.js'],
					env: { TOKEN: 'value' },
					tools: ['*'],
				},
				'remote-server': {
					type: 'http',
					url: 'https://example.com/mcp',
					headers: { Authorization: 'value' },
					tools: ['*'],
				},
			},
		})));

		assert.deepStrictEqual(definitions?.map(definition => ({
			label: definition.label,
			transport: definition.launch.type,
		})), [
			{ label: 'local-server', transport: McpServerTransportType.Stdio },
			{ label: 'remote-server', transport: McpServerTransportType.HTTP },
		]);
	});

	test('claudeConfigToServerDefinition forwards HTTP headers', async () => {
		const contents = VSBuffer.fromString(JSON.stringify({
			mcpServers: {
				'with-headers': {
					type: 'http',
					url: 'https://example.com/mcp',
					headers: { 'X-Custom-Header': 'my-value', 'Authorization': 'Bearer abc' },
				},
				'no-headers': {
					type: 'http',
					url: 'https://example.com/other',
				},
				'stdio': {
					command: 'my-cmd',
					args: ['--foo'],
				},
			},
		}));

		const defs = await claudeConfigToServerDefinition('prefix', contents);
		assert.ok(defs);
		assert.strictEqual(defs.length, 3);

		const withHeaders = defs.find(d => d.label === 'with-headers')!;
		assert.strictEqual(withHeaders.launch.type, McpServerTransportType.HTTP);
		assert.deepStrictEqual(
			(withHeaders.launch as { headers: [string, string][] }).headers,
			[['X-Custom-Header', 'my-value'], ['Authorization', 'Bearer abc']],
		);

		const noHeaders = defs.find(d => d.label === 'no-headers')!;
		assert.strictEqual(noHeaders.launch.type, McpServerTransportType.HTTP);
		assert.deepStrictEqual(
			(noHeaders.launch as { headers: [string, string][] }).headers,
			[],
		);

		const stdio = defs.find(d => d.label === 'stdio')!;
		assert.strictEqual(stdio.launch.type, McpServerTransportType.Stdio);
	});

	test('keeps a workspace default cwd as a URI', async () => {
		const contents = VSBuffer.fromString(JSON.stringify({
			mcpServers: {
				'echo': { command: '/bin/echo', args: ['hello'] },
			},
		}));
		const defaultCwd = URI.parse('vscode-remote://ssh-remote+linux/home/test/workspace');

		const defs = await claudeConfigToServerDefinition('prefix', contents, { defaultCwd });
		const legacyDefs = await claudeConfigToServerDefinition('prefix', contents, { cwd: defaultCwd });
		assert.ok(defs);
		assert.ok(legacyDefs);
		assert.strictEqual(defs.length, 1);

		const launch = defs[0].launch;
		if (launch.type !== McpServerTransportType.Stdio) {
			assert.fail(`Expected Stdio launch, got ${launch.type}`);
		}
		assert.deepStrictEqual({
			cwd: launch.cwd,
			defaultCwd: defs[0].defaultCwd?.toString(),
			preservesTrustedNonce: defs[0].cacheNonce === legacyDefs[0].cacheNonce,
		}, {
			cwd: undefined,
			defaultCwd: defaultCwd.toString(),
			preservesTrustedNonce: true,
		});
	});

	test('preserves a native discovery cwd', async () => {
		const contents = VSBuffer.fromString(JSON.stringify({
			mcpServers: {
				'echo': { command: 'echo' },
			},
		}));
		const cwd = URI.file('/home/test');

		const defs = await claudeConfigToServerDefinition('prefix', contents, { cwd });
		assert.ok(defs);
		assert.strictEqual(defs.length, 1);

		const launch = defs[0].launch;
		if (launch.type !== McpServerTransportType.Stdio) {
			assert.fail(`Expected Stdio launch, got ${launch.type}`);
		}
		assert.deepStrictEqual({
			cwd: launch.cwd,
			defaultCwd: defs[0].defaultCwd,
		}, {
			cwd: cwd.fsPath,
			defaultCwd: undefined,
		});
	});
});
