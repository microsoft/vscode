/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IMcpResourceScannerService } from '../../../../../platform/mcp/common/mcpResourceScannerService.js';
import { IMcpSandboxConfiguration } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { ISandboxProcess, ISandboxRuntimeConfig } from '../../../../../platform/sandbox/common/sandboxHelperIpc.js';
import { ISandboxHelperService } from '../../../../../platform/sandbox/common/sandboxHelperService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { McpSandboxService } from '../../common/mcpSandboxService.js';
import { McpServerDefinition, McpServerTransportType } from '../../common/mcpTypes.js';

suite('Workbench - MCP - SandboxService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class MockRemoteAgentService extends mock<IRemoteAgentService>() {
		override _serviceBrand: undefined;

		override getConnection() {
			return null;
		}

		override async getEnvironment(): Promise<IRemoteAgentEnvironment> {
			return {
				os: OperatingSystem.Linux,
				tmpDir: URI.file('/tmp'),
				appRoot: URI.file('/app'),
				pid: 1,
				connectionToken: 'test',
				settingsPath: URI.file('/settings'),
				mcpResource: URI.file('/mcp.json'),
				logsPath: URI.file('/logs'),
				extensionHostLogsPath: URI.file('/ext-logs'),
				globalStorageHome: URI.file('/global'),
				workspaceStorageHome: URI.file('/workspace-storage'),
				localHistoryHome: URI.file('/history'),
				userHome: URI.file('/home/test'),
				arch: 'x64',
				marks: [],
				useHostProxy: false,
				profiles: {
					all: [],
					home: URI.file('/profiles'),
				},
				isUnsupportedGlibc: false,
			};
		}
	}

	class MockSandboxHelperService implements ISandboxHelperService {
		declare readonly _serviceBrand: undefined;
		readonly onDidRequestSandboxPermission = Event.None;
		lastRuntimeConfig: ISandboxRuntimeConfig | undefined;
		lastProcess: ISandboxProcess | undefined;

		async resetSandbox(): Promise<void> {
		}

		async resolveSandboxPermissionRequest(_requestId: string, _allowed: boolean): Promise<void> {
		}

		async wrapWithSandbox(_runtimeConfig: ISandboxRuntimeConfig, command: string): Promise<string> {
			return command;
		}

		async wrapProcessWithSandbox(runtimeConfig: ISandboxRuntimeConfig, targetProcess: ISandboxProcess): Promise<ISandboxProcess> {
			this.lastRuntimeConfig = runtimeConfig;
			this.lastProcess = targetProcess;
			return {
				command: 'sandbox-shell',
				args: ['-c', 'sandboxed command'],
				env: {
					...targetProcess.env,
					SANDBOXED: 'true',
				},
			};
		}
	}

	class MockMcpResourceScannerService implements IMcpResourceScannerService {
		declare readonly _serviceBrand: undefined;
		currentSandbox: IMcpSandboxConfiguration | undefined;
		lastServerName: string | undefined;

		async scanMcpServers(): Promise<any> {
			return {};
		}

		async addMcpServers(): Promise<void> {
		}

		async updateSandboxConfig(serverName: string, updateFn: (sandbox: IMcpSandboxConfiguration | undefined) => IMcpSandboxConfiguration | undefined): Promise<void> {
			this.lastServerName = serverName;
			this.currentSandbox = updateFn(this.currentSandbox);
		}

		async removeMcpServers(): Promise<void> {
		}
	}

	test('wraps stdio launches via sandbox helper with merged defaults', async () => {
		const sandboxHelperService = new MockSandboxHelperService();
		const scannerService = new MockMcpResourceScannerService();
		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[IMcpResourceScannerService, scannerService],
			[IRemoteAgentService, new MockRemoteAgentService()],
			[ISandboxHelperService, sandboxHelperService],
		);
		const instantiationService = store.add(new TestInstantiationService(services));
		const service = store.add(instantiationService.createInstance(McpSandboxService));

		const definition: McpServerDefinition = {
			id: 'test-server',
			label: 'Test Server',
			cacheNonce: '1',
			sandboxEnabled: true,
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'server-command',
				args: ['--serve'],
				env: { TEST_ENV: '1' },
				envFile: undefined,
				cwd: '/workspace/project',
				sandbox: {
					network: {
						allowedDomains: ['example.com'],
						deniedDomains: ['denied.example.com'],
					},
					filesystem: {
						allowWrite: ['/custom/write'],
						denyRead: ['/secret'],
						denyWrite: ['/readonly'],
					},
				},
			},
		};

		const wrappedLaunch = await service.launchInSandboxIfEnabled(definition, definition.launch, undefined, ConfigurationTarget.USER);

		assert.deepStrictEqual(sandboxHelperService.lastProcess, {
			command: 'server-command',
			args: ['--serve'],
			env: { TEST_ENV: '1' },
		});
		assert.deepStrictEqual(sandboxHelperService.lastRuntimeConfig, {
			network: {
				allowedDomains: ['example.com', 'registry.npmjs.org'],
				deniedDomains: ['denied.example.com'],
			},
			filesystem: {
				allowWrite: ['/custom/write', '~/.npm', '/workspace/project'],
				denyRead: ['/secret'],
				denyWrite: ['/readonly'],
			},
		});
		assert.deepStrictEqual(wrappedLaunch, {
			...definition.launch,
			command: 'sandbox-shell',
			args: ['-c', 'sandboxed command'],
			env: {
				TEST_ENV: '1',
				SANDBOXED: 'true',
			},
		});
	});

	test('applies sandbox suggestions to the specific server config', async () => {
		const sandboxHelperService = new MockSandboxHelperService();
		const scannerService = new MockMcpResourceScannerService();
		scannerService.currentSandbox = {
			network: { allowedDomains: ['example.com'] },
			filesystem: { allowWrite: ['/existing'] },
		};
		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[IMcpResourceScannerService, scannerService],
			[IRemoteAgentService, new MockRemoteAgentService()],
			[ISandboxHelperService, sandboxHelperService],
		);
		const instantiationService = store.add(new TestInstantiationService(services));
		const service = store.add(instantiationService.createInstance(McpSandboxService));

		const definition: McpServerDefinition = {
			id: 'test-server',
			label: 'testServer',
			cacheNonce: '1',
			sandboxEnabled: true,
			launch: {
				type: McpServerTransportType.Stdio,
				command: 'server-command',
				args: [],
				env: {},
				envFile: undefined,
				cwd: '/workspace/project',
				sandbox: {
					network: { allowedDomains: ['example.com'] },
					filesystem: { allowWrite: ['/existing'] },
				},
			},
		};

		const changed = await service.applySandboxConfigSuggestion(
			definition,
			URI.file('/mcp.json'),
			ConfigurationTarget.USER,
			[],
			{
				network: { allowedDomains: ['added.example.com'] },
				filesystem: { allowWrite: ['/new-path'] },
			}
		);

		assert.strictEqual(changed, true);
		assert.strictEqual(scannerService.lastServerName, 'testServer');
		assert.deepStrictEqual(scannerService.currentSandbox, {
			network: { allowedDomains: ['example.com', 'added.example.com'] },
			filesystem: { allowWrite: ['/existing', '/new-path'] },
		});
	});
});
