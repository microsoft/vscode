/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IMcpSandboxConfiguration, IMcpStdioServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IMcpResourceScannerService, McpResourceScannerService } from '../../../../../platform/mcp/common/mcpResourceScannerService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { McpSandboxService, mcpDefaultCwdToFsPath, resolveMcpServerSandboxWorkingDirectory } from '../../common/mcpSandboxService.js';
import { McpServerDefinition, McpServerLaunch, McpServerTransportStdio, McpServerTransportType } from '../../common/mcpTypes.js';

suite('MCP Sandbox Service', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSandboxSettingsGenerator(options: { windowId?: number; serverDataFolderName?: string } = { windowId: 7, serverDataFolderName: '.test-server-data' }) {
		const instantiationService = store.add(new TestInstantiationService());
		const logService = store.add(new NullLogService());
		const fileService = store.add(new FileService(logService));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IEnvironmentService, upcastPartial<IEnvironmentService & { window: { id: number | undefined } }>({
			window: { id: options.windowId },
		}));
		instantiationService.stub(IProductService, {
			dataFolderName: '.test-data',
			serverDataFolderName: options.serverDataFolderName,
		});
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({
			asCanonicalUri: resource => resource,
		}));
		const scanner = store.add(instantiationService.createInstance(McpResourceScannerService));
		instantiationService.stub(IMcpResourceScannerService, scanner);
		instantiationService.stub(IRemoteAgentService, {
			getEnvironment: async () => upcastPartial<IRemoteAgentEnvironment>({
				os: OperatingSystem.Linux,
				appRoot: URI.file('/app'),
				tmpDir: URI.file('/tmp'),
				userHome: URI.file('/home/test'),
			}),
		});
		const service = store.add(instantiationService.createInstance(McpSandboxService));
		const configFiles: URI[] = [];
		const sandboxedLaunches: McpServerTransportStdio[] = [];

		const launchServer = async (cwd: string | undefined, configTarget: ConfigurationTarget, sandbox?: IMcpSandboxConfiguration, label = 'Test Server'): Promise<URI> => {
			const launch: McpServerTransportStdio = {
				type: McpServerTransportType.Stdio,
				command: 'node',
				args: ['server.js'],
				cwd,
				env: {},
				envFile: undefined,
				sandbox,
			};
			const definition: McpServerDefinition = {
				id: cwd ?? 'no-cwd',
				label,
				cacheNonce: 'test',
				sandboxEnabled: true,
				launch,
			};
			const sandboxedLaunch = await service.launchInSandboxIfEnabled(definition, launch, 'ssh-remote+test', configTarget);
			assert.ok(sandboxedLaunch.type === McpServerTransportType.Stdio);
			sandboxedLaunches.push(sandboxedLaunch);
			const settingsIndex = sandboxedLaunch.args.indexOf('--settings');
			assert.notStrictEqual(settingsIndex, -1);
			const configFile = URI.file(sandboxedLaunch.args[settingsIndex + 1]);
			configFiles.push(configFile);
			return configFile;
		};

		const generateSettings = async (cwd: string | undefined, configTarget: ConfigurationTarget, sandbox?: IMcpSandboxConfiguration, label?: string): Promise<IMcpSandboxConfiguration> => {
			const configFile = await launchServer(cwd, configTarget, sandbox, label);
			const contents = await fileService.readFile(configFile);
			return JSON.parse(contents.value.toString());
		};

		return { generateSettings, configFiles, fileService, sandboxedLaunches, service, scanner };
	}

	test('names each settings file after its server with a unique UUID and a safe basename', async () => {
		const { generateSettings, configFiles } = createSandboxSettingsGenerator();
		await generateSettings('/servers/a', ConfigurationTarget.WORKSPACE_FOLDER, undefined, 'server-A');
		await generateSettings('/servers/a', ConfigurationTarget.WORKSPACE_FOLDER, undefined, 'server-A');
		await generateSettings('/servers/b', ConfigurationTarget.USER, undefined, '../server\\B?');

		const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
		assert.deepStrictEqual({
			namesMatch: configFiles.map((file, index) => new RegExp(`^vscode-${index < 2 ? 'server-A' : '\\.\\._server_B_'}-sandbox-settings-${uuid}\\.json$`).test(basename(file))),
			distinctFiles: new Set(configFiles.map(file => file.path)).size,
			directories: configFiles.map(file => dirname(file).path),
		}, {
			namesMatch: [true, true, true],
			distinctFiles: 3,
			directories: Array(3).fill('/home/test/.test-server-data/tmp/tmp_vscode_7'),
		});
	});

	for (const target of [ConfigurationTarget.USER, ConfigurationTarget.WORKSPACE, ConfigurationTarget.WORKSPACE_FOLDER] as const) {
		test(`persists dialog approvals only for the requesting server at target ${target}`, async () => {
			const { service, scanner, fileService, generateSettings } = createSandboxSettingsGenerator();
			const resource = URI.file('/config/mcp.json');
			const serverA: IMcpStdioServerConfiguration = {
				type: McpServerType.LOCAL,
				command: 'node',
				sandboxEnabled: true,
				sandbox: {
					network: { deniedDomains: ['blocked-a.test'] },
					filesystem: { denyRead: ['/private-a'], denyWrite: ['/readonly-a'] },
				},
			};
			const serverB: IMcpStdioServerConfiguration = { type: McpServerType.LOCAL, command: 'node', sandboxEnabled: true };
			const root: IMcpSandboxConfiguration = {
				network: { allowedDomains: ['shared.test'], deniedDomains: ['blocked.test'] },
				filesystem: { allowWrite: ['/shared'], denyRead: ['/private'], denyWrite: ['/readonly'] },
			};
			const data = { servers: { A: serverA, B: serverB }, sandbox: root };
			await fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify(target === ConfigurationTarget.WORKSPACE ? { settings: { mcp: data } } : data)));
			const launch = McpServerLaunch.fromServerConfiguration(serverA, root);
			assert.ok(launch);
			const definition: McpServerDefinition = { id: 'collection.A', label: 'A', cacheNonce: 'test', launch };
			const blocks = [{ kind: 'network' as const, host: 'google.com', message: 'Network access denied' }, { kind: 'filesystem' as const, path: '/only-a', message: 'Write access denied' }];
			const suggestion = service.getSandboxConfigSuggestionMessage('A', blocks);
			assert.ok(suggestion);
			const changed = await service.applySandboxConfigSuggestion(definition, resource, target, blocks, suggestion.sandboxConfig);
			const changedAgain = await service.applySandboxConfigSuggestion(definition, resource, target, blocks, suggestion.sandboxConfig);
			const scanned = await scanner.scanMcpServers(resource, target);
			const policies: IMcpSandboxConfiguration[] = [];
			for (const name of ['A', 'B']) {
				const config = scanned.servers?.[name];
				assert.ok(config);
				const nextLaunch = McpServerLaunch.fromServerConfiguration(config, scanned.sandbox);
				assert.ok(nextLaunch?.type === McpServerTransportType.Stdio);
				policies.push(await generateSettings(`/servers/${name}`, target, nextLaunch.sandbox, name));
			}
			assert.deepStrictEqual({
				changed, changedAgain,
				root: scanned.sandbox,
				serverB: scanned.servers?.B,
				policies,
				repeatedSuggestion: service.getSandboxConfigSuggestionMessage('A', blocks, policies[0]),
			}, {
				changed: true, changedAgain: false,
				root,
				serverB,
				policies: [
					{
						network: { allowedDomains: ['google.com', 'registry.npmjs.org'], deniedDomains: ['blocked.test', 'blocked-a.test'] },
						filesystem: { allowWrite: ['/only-a', '~/.npm', '/servers/A'], denyRead: ['/private', '/private-a'], denyWrite: ['/readonly', '/readonly-a'] },
					},
					{
						network: { allowedDomains: ['registry.npmjs.org'], deniedDomains: ['blocked.test'] },
						filesystem: { allowWrite: ['~/.npm', '/servers/B'], denyRead: ['/private'], denyWrite: ['/readonly'] },
					},
				],
				repeatedSuggestion: undefined,
			});
		});
	}

	test('does not save approvals for a removed server into the shared configuration', async () => {
		const { service, fileService } = createSandboxSettingsGenerator();
		const resource = URI.file('/config/mcp.json');
		const content = JSON.stringify({ servers: { B: { type: 'stdio', command: 'node' } } });
		await fileService.writeFile(resource, VSBuffer.fromString(content));
		const launch = McpServerLaunch.fromServerConfiguration({ type: McpServerType.LOCAL, command: 'node' });
		assert.ok(launch);
		await assert.rejects(service.applySandboxConfigSuggestion(
			{ id: 'collection.A', label: 'A', cacheNonce: 'test', launch },
			resource, ConfigurationTarget.USER, [], { network: { allowedDomains: ['google.com'] } },
		), /no longer available/);
		assert.strictEqual((await fileService.readFile(resource)).value.toString(), content);
	});

	test('uses the terminal sandbox configuration directory without changing the runtime temp directory', async () => {
		const results = [];
		for (const options of [
			{ windowId: 7, serverDataFolderName: '.test-server-data' },
			{ windowId: 7 },
			{ serverDataFolderName: '.test-server-data' },
		]) {
			const { generateSettings, configFiles, sandboxedLaunches } = createSandboxSettingsGenerator(options);
			await generateSettings('/servers/a', ConfigurationTarget.USER);
			results.push({
				directory: dirname(configFiles[0]).path,
				runtimeTempDirectory: sandboxedLaunches[0].env.TMPDIR,
			});
		}

		assert.deepStrictEqual(results, [
			{ directory: '/home/test/.test-server-data/tmp/tmp_vscode_7', runtimeTempDirectory: '/tmp' },
			{ directory: '/home/test/.test-data/tmp/tmp_vscode_7', runtimeTempDirectory: '/tmp' },
			{ directory: '/home/test/.test-server-data/tmp', runtimeTempDirectory: '/tmp' },
		]);
	});

	for (const secondTarget of [ConfigurationTarget.WORKSPACE, ConfigurationTarget.USER]) {
		test(`isolates working-directory write grants across launches with configuration target ${secondTarget}`, async () => {
			const { generateSettings } = createSandboxSettingsGenerator();
			const results: IMcpSandboxConfiguration[] = [];
			for (const [cwd, target] of [
				['/servers/a', ConfigurationTarget.USER],
				['/servers/b', secondTarget],
				['/servers/b', secondTarget],
				['/servers/a', ConfigurationTarget.USER],
				[undefined, secondTarget],
			] as const) {
				results.push(await generateSettings(cwd, target));
			}

			assert.deepStrictEqual(results.map(result => result.filesystem?.allowWrite), [
				['~/.npm', '/servers/a'],
				['~/.npm', '/servers/b'],
				['~/.npm', '/servers/b'],
				['~/.npm', '/servers/a'],
				['~/.npm'],
			]);
		});
	}

	test('preserves explicit sandbox permissions and defaults without mutating the input', async () => {
		const { generateSettings } = createSandboxSettingsGenerator();
		await generateSettings('/servers/a', ConfigurationTarget.USER);
		const sandbox: IMcpSandboxConfiguration = {
			network: { allowedDomains: ['example.test'], deniedDomains: ['blocked.test'] },
			filesystem: {
				allowWrite: ['/explicit', '/servers/b', '~/.npm'],
				denyRead: ['/private'],
				denyWrite: ['/servers/a'],
			},
		};
		const original = structuredClone(sandbox);
		const result = await generateSettings('/servers/b', ConfigurationTarget.WORKSPACE, sandbox);

		assert.deepStrictEqual({ result, input: sandbox }, {
			result: {
				network: {
					allowedDomains: ['example.test', 'registry.npmjs.org'],
					deniedDomains: ['blocked.test'],
				},
				filesystem: {
					allowWrite: ['/explicit', '/servers/b', '~/.npm'],
					denyRead: ['/private'],
					denyWrite: ['/servers/a'],
				},
			},
			input: original,
		});
	});

	test('keeps concurrent same-target launches in distinct settings files', async () => {
		const { generateSettings, configFiles, fileService } = createSandboxSettingsGenerator();
		const results = await Promise.all([
			generateSettings('/servers/a', ConfigurationTarget.USER),
			generateSettings('/servers/b', ConfigurationTarget.USER),
		]);
		const persisted = await Promise.all(configFiles.map(async file => {
			const contents = await fileService.readFile(file);
			const config: IMcpSandboxConfiguration = JSON.parse(contents.value.toString());
			return config.filesystem?.allowWrite;
		}));

		assert.deepStrictEqual({
			distinctFiles: new Set(configFiles.map(file => file.toString())).size,
			generated: results.map(result => result.filesystem?.allowWrite).sort(),
			persisted: persisted.sort(),
		}, {
			distinctFiles: 2,
			generated: [['~/.npm', '/servers/a'], ['~/.npm', '/servers/b']],
			persisted: [['~/.npm', '/servers/a'], ['~/.npm', '/servers/b']],
		});
	});

	test('converts default cwd URIs for the target operating system', () => {
		assert.deepStrictEqual({
			linuxRemote: mcpDefaultCwdToFsPath(URI.parse('vscode-remote://ssh-remote+linux/home/test/workspace'), OperatingSystem.Linux),
			windowsRemote: mcpDefaultCwdToFsPath(URI.parse('vscode-remote://ssh-remote+windows/c:/Users/test/workspace'), OperatingSystem.Windows),
			windowsUnc: mcpDefaultCwdToFsPath(URI.parse('file://server/share/workspace'), OperatingSystem.Windows),
		}, {
			linuxRemote: '/home/test/workspace',
			windowsRemote: 'c:\\Users\\test\\workspace',
			windowsUnc: '\\\\server\\share\\workspace',
		});
	});

	test('resolves relative cwd against the target-side default cwd', () => {
		const linuxDefaultCwd = URI.parse('vscode-remote://ssh-remote+linux/home/test/workspace');
		const windowsDefaultCwd = URI.parse('vscode-remote://ssh-remote+windows/c:/Users/test/workspace');
		const linuxUserHome = URI.parse('vscode-remote://ssh-remote+linux/home/test');

		assert.deepStrictEqual({
			linuxRelative: resolveMcpServerSandboxWorkingDirectory('./server', linuxDefaultCwd, linuxUserHome, OperatingSystem.Linux),
			windowsRelative: resolveMcpServerSandboxWorkingDirectory('.\\server', windowsDefaultCwd, undefined, OperatingSystem.Windows),
			homeRelative: resolveMcpServerSandboxWorkingDirectory('./server', undefined, linuxUserHome, OperatingSystem.Linux),
			tildeRelative: resolveMcpServerSandboxWorkingDirectory('~/server', linuxDefaultCwd, linuxUserHome, OperatingSystem.Linux),
			explicitAbsolute: resolveMcpServerSandboxWorkingDirectory('/explicit/server', linuxDefaultCwd, linuxUserHome, OperatingSystem.Linux),
			implicit: resolveMcpServerSandboxWorkingDirectory(undefined, linuxDefaultCwd, linuxUserHome, OperatingSystem.Linux),
		}, {
			linuxRelative: '/home/test/workspace/server',
			windowsRelative: 'c:\\Users\\test\\workspace\\server',
			homeRelative: '/home/test/server',
			tildeRelative: '/home/test/server',
			explicitAbsolute: '/explicit/server',
			implicit: '/home/test/workspace',
		});
	});
});
