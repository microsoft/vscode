/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Schemas } from '../../../../../base/common/network.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { dirname } from '../../../../../base/common/resources.js';
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
import { IMcpSandboxConfiguration } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IMcpResourceScannerService } from '../../../../../platform/mcp/common/mcpResourceScannerService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { McpSandboxService, mcpDefaultCwdToFsPath, resolveMcpServerSandboxWorkingDirectory } from '../../common/mcpSandboxService.js';
import { McpServerDefinition, McpServerTransportStdio, McpServerTransportType } from '../../common/mcpTypes.js';

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
		instantiationService.stub(IMcpResourceScannerService, {});
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

		const launchServer = async (cwd: string | undefined, configTarget: ConfigurationTarget, sandbox?: IMcpSandboxConfiguration): Promise<URI> => {
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
				label: 'Test Server',
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

		const generateSettings = async (cwd: string | undefined, configTarget: ConfigurationTarget, sandbox?: IMcpSandboxConfiguration): Promise<IMcpSandboxConfiguration> => {
			const configFile = await launchServer(cwd, configTarget, sandbox);
			const contents = await fileService.readFile(configFile);
			return JSON.parse(contents.value.toString());
		};

		return { generateSettings, configFiles, fileService, sandboxedLaunches };
	}

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
