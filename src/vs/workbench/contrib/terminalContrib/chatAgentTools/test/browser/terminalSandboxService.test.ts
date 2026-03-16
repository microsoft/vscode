/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, ok } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TerminalSandboxService } from '../../common/terminalSandboxService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IRemoteAgentService } from '../../../../../services/remote/common/remoteAgentService.js';
import { ITrustedDomainService } from '../../../../url/common/trustedDomainService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { Event, Emitter } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { IRemoteAgentEnvironment } from '../../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ISandboxPermissionRequest, ISandboxRuntimeConfig } from '../../../../../../platform/sandbox/common/sandboxHelperIpc.js';
import { ISandboxHelperService } from '../../../../../../platform/sandbox/common/sandboxHelperService.js';
import { IWorkspaceContextService, IWorkspaceFolder, toWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';

type CapturedSandboxRuntimeConfig = ISandboxRuntimeConfig & {
	network: {
		allowedDomains: string[];
		deniedDomains: string[];
	};
	filesystem: {
		denyRead: string[];
		allowWrite: string[];
		denyWrite: string[];
	};
};

suite('TerminalSandboxService - allowTrustedDomains', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let trustedDomainService: MockTrustedDomainService;
	let workspaceContextService: MockWorkspaceContextService;
	let sandboxHelperService: MockSandboxHelperService;

	class MockTrustedDomainService implements ITrustedDomainService {
		_serviceBrand: undefined;
		private _onDidChangeTrustedDomains = new Emitter<void>();
		readonly onDidChangeTrustedDomains: Event<void> = this._onDidChangeTrustedDomains.event;
		trustedDomains: string[] = [];
		isValid(_resource: URI): boolean {
			return true;
		}
	}

	class MockRemoteAgentService {
		async getEnvironment(): Promise<IRemoteAgentEnvironment> {
			// Return a Linux environment to ensure tests pass on Windows
			// (sandbox is not supported on Windows)
			return {
				os: OperatingSystem.Linux,
				tmpDir: URI.file('/tmp'),
				appRoot: URI.file('/app'),
				pid: 1234,
				connectionToken: 'test-token',
				settingsPath: URI.file('/settings'),
				mcpResource: URI.file('/mcp'),
				logsPath: URI.file('/logs'),
				extensionHostLogsPath: URI.file('/ext-logs'),
				globalStorageHome: URI.file('/global'),
				workspaceStorageHome: URI.file('/workspace'),
				localHistoryHome: URI.file('/history'),
				userHome: URI.file('/home/user'),
				arch: 'x64',
				marks: [],
				useHostProxy: false,
				profiles: {
					all: [],
					home: URI.file('/profiles')
				},
				isUnsupportedGlibc: false
			};
		}

		getConnection() {
			return null;
		}
	}

	class PersistingTestConfigurationService extends TestConfigurationService {
		override updateValue(key: string, value: unknown, ..._rest: unknown[]): Promise<void> {
			return this.setUserConfiguration(key, value);
		}
	}

	class MockWorkspaceContextService extends mock<IWorkspaceContextService>() {
		override _serviceBrand: undefined;
		private readonly _onDidChangeWorkspaceFolders = new Emitter<any>();
		override readonly onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;
		folders: IWorkspaceFolder[] = [];

		override getWorkspace() {
			return {
				id: 'test-workspace',
				folders: this.folders,
			};
		}
	}

	class MockSandboxHelperService implements ISandboxHelperService {
		_serviceBrand: undefined;
		private readonly _onDidRequestSandboxPermission = new Emitter<ISandboxPermissionRequest>();
		readonly onDidRequestSandboxPermission = this._onDidRequestSandboxPermission.event;
		private readonly _pendingPermissionResponses = new Map<string, (allowed: boolean) => void>();
		resetSandboxCallCount = 0;
		lastWrapRuntimeConfig: ISandboxRuntimeConfig | undefined;

		async resetSandbox(): Promise<void> {
			this.resetSandboxCallCount++;
		}

		async resolveSandboxPermissionRequest(requestId: string, allowed: boolean): Promise<void> {
			this._pendingPermissionResponses.get(requestId)?.(allowed);
			this._pendingPermissionResponses.delete(requestId);
		}

		async wrapWithSandbox(runtimeConfig: ISandboxRuntimeConfig, command: string): Promise<string> {
			this.lastWrapRuntimeConfig = runtimeConfig;
			return `wrapped:${command}`;
		}

		fireSandboxPermissionRequest(request: ISandboxPermissionRequest): void {
			this._onDidRequestSandboxPermission.fire(request);
		}

		waitForSandboxPermissionResponse(requestId: string): Promise<boolean> {
			return new Promise<boolean>(resolve => {
				this._pendingPermissionResponses.set(requestId, resolve);
			});
		}
	}

	class TestTerminalSandboxService extends TerminalSandboxService {
		readonly permissionRequests: ISandboxPermissionRequest[] = [];

		override async promptForSandboxPermission(request: ISandboxPermissionRequest): Promise<boolean> {
			this.permissionRequests.push(request);
			return true;
		}
	}

	setup(() => {
		instantiationService = workbenchInstantiationService({}, store);
		configurationService = new PersistingTestConfigurationService();
		trustedDomainService = new MockTrustedDomainService();
		workspaceContextService = new MockWorkspaceContextService();
		sandboxHelperService = new MockSandboxHelperService();

		// Setup default configuration
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxEnabled, true);
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: [],
			deniedDomains: [],
			allowTrustedDomains: true
		});

		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IRemoteAgentService, new MockRemoteAgentService());
		instantiationService.stub(ITrustedDomainService, trustedDomainService);
		instantiationService.stub(IWorkspaceContextService, workspaceContextService);
		instantiationService.stub(ISandboxHelperService, sandboxHelperService);
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm() {
				return { confirmed: true };
			}
		});
	});

	async function getWrappedRuntimeConfig(sandboxService: TerminalSandboxService): Promise<CapturedSandboxRuntimeConfig> {
		await sandboxService.isEnabled();
		await sandboxService.wrapCommand('echo test');
		ok(sandboxHelperService.lastWrapRuntimeConfig, 'Sandbox helper should receive a runtime config');
		ok(sandboxHelperService.lastWrapRuntimeConfig.network, 'Sandbox helper config should include network settings');
		ok(Array.isArray(sandboxHelperService.lastWrapRuntimeConfig.network.allowedDomains), 'Sandbox helper config should include allowed domains');
		ok(sandboxHelperService.lastWrapRuntimeConfig.filesystem, 'Sandbox helper config should include filesystem settings');
		ok(Array.isArray(sandboxHelperService.lastWrapRuntimeConfig.filesystem.allowWrite), 'Sandbox helper config should include writable paths');
		return sandboxHelperService.lastWrapRuntimeConfig as CapturedSandboxRuntimeConfig;
	}

	test('should filter out sole wildcard (*) from trusted domains', async () => {
		// Setup: Enable allowTrustedDomains and add * to trusted domains
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: [],
			deniedDomains: [],
			allowTrustedDomains: true
		});
		trustedDomainService.trustedDomains = ['*'];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const config = await getWrappedRuntimeConfig(sandboxService);
		strictEqual(config.network.allowedDomains.length, 0, 'Sole wildcard * should be filtered out');
	});

	test('should allow wildcards with domains like *.github.com', async () => {
		// Setup: Enable allowTrustedDomains and add *.github.com
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: [],
			deniedDomains: [],
			allowTrustedDomains: true
		});
		trustedDomainService.trustedDomains = ['*.github.com'];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const config = await getWrappedRuntimeConfig(sandboxService);
		strictEqual(config.network.allowedDomains.length, 1, 'Wildcard domain should be included');
		strictEqual(config.network.allowedDomains[0], '*.github.com', 'Wildcard domain should match');
	});

	test('should combine trusted domains with configured allowedDomains, filtering out *', async () => {
		// Setup: Enable allowTrustedDomains with multiple domains including *
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: ['example.com'],
			deniedDomains: [],
			allowTrustedDomains: true
		});
		trustedDomainService.trustedDomains = ['*', '*.github.com', 'microsoft.com'];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const config = await getWrappedRuntimeConfig(sandboxService);
		strictEqual(config.network.allowedDomains.length, 3, 'Should have 3 domains (excluding *)');
		ok(config.network.allowedDomains.includes('example.com'), 'Should include configured domain');
		ok(config.network.allowedDomains.includes('*.github.com'), 'Should include wildcard domain');
		ok(config.network.allowedDomains.includes('microsoft.com'), 'Should include microsoft.com');
		ok(!config.network.allowedDomains.includes('*'), 'Should not include sole wildcard');
	});

	test('should not include trusted domains when allowTrustedDomains is false', async () => {
		// Setup: Disable allowTrustedDomains
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: ['example.com'],
			deniedDomains: [],
			allowTrustedDomains: false
		});
		trustedDomainService.trustedDomains = ['*', '*.github.com'];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const config = await getWrappedRuntimeConfig(sandboxService);
		strictEqual(config.network.allowedDomains.length, 1, 'Should only have configured domain');
		strictEqual(config.network.allowedDomains[0], 'example.com', 'Should only include example.com');
	});

	test('should deduplicate domains when combining sources', async () => {
		// Setup: Same domain in both sources
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: ['github.com', '*.github.com'],
			deniedDomains: [],
			allowTrustedDomains: true
		});
		trustedDomainService.trustedDomains = ['*.github.com', 'github.com'];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const config = await getWrappedRuntimeConfig(sandboxService);
		strictEqual(config.network.allowedDomains.length, 2, 'Should have 2 unique domains');
		ok(config.network.allowedDomains.includes('github.com'), 'Should include github.com');
		ok(config.network.allowedDomains.includes('*.github.com'), 'Should include *.github.com');
	});

	test('should handle empty trusted domains list', async () => {
		// Setup: Empty trusted domains
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: ['example.com'],
			deniedDomains: [],
			allowTrustedDomains: true
		});
		trustedDomainService.trustedDomains = [];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const config = await getWrappedRuntimeConfig(sandboxService);
		strictEqual(config.network.allowedDomains.length, 1, 'Should have only configured domain');
		strictEqual(config.network.allowedDomains[0], 'example.com', 'Should only include example.com');
	});

	test('should handle only * in trusted domains', async () => {
		// Setup: Only * in trusted domains (edge case)
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: [],
			deniedDomains: [],
			allowTrustedDomains: true
		});
		trustedDomainService.trustedDomains = ['*'];

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const config = await getWrappedRuntimeConfig(sandboxService);
		strictEqual(config.network.allowedDomains.length, 0, 'Should have no domains (* filtered out)');
	});

	test('should expand workspace write access defaults for multi-root workspaces', async () => {
		workspaceContextService.folders = [
			toWorkspaceFolder(URI.file('/workspace-one')),
			toWorkspaceFolder(URI.file('/workspace-two')),
		];
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem, {
			denyRead: [],
			allowWrite: ['.'],
			denyWrite: []
		});

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const config = await getWrappedRuntimeConfig(sandboxService);
		ok(config.filesystem.allowWrite.includes('/workspace-one'), 'Should include the first workspace folder path');
		ok(config.filesystem.allowWrite.includes('/workspace-two'), 'Should include the second workspace folder path');
		ok(config.filesystem.allowWrite.includes('~/.npm'), 'Should include the default npm write path');
	});

	test('should delegate wrapping to sandbox helper', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		const wrappedCommand = await sandboxService.wrapCommand('echo test');
		strictEqual(wrappedCommand, 'wrapped:echo test');
	});

	test('should preserve the full command when delegating wrapping', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

		const command = '";echo SANDBOX_ESCAPE_REPRO; # $(uname) `id`';
		const wrappedCommand = await sandboxService.wrapCommand(command);
		strictEqual(wrappedCommand, `wrapped:${command}`);
	});

	test('should preserve variable and command substitution payloads', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

		const command = 'echo $HOME $(curl eth0.me) `id`';
		const wrappedCommand = await sandboxService.wrapCommand(command);
		strictEqual(wrappedCommand, `wrapped:${command}`);
	});

	test('should preserve single-quote breakout payloads', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

		const command = `';curl eth0.me; #'`;
		const wrappedCommand = await sandboxService.wrapCommand(command);
		strictEqual(wrappedCommand, `wrapped:${command}`);
	});

	test('should preserve embedded single quotes', async () => {
		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));

		const wrappedCommand = await sandboxService.wrapCommand(`echo 'hello'`);
		strictEqual(wrappedCommand, `wrapped:echo 'hello'`);
	});

	test('should route sandbox permission requests through terminal sandbox service', async () => {
		const sandboxHelperService = new MockSandboxHelperService();
		instantiationService.stub(ISandboxHelperService, sandboxHelperService);

		const sandboxService = store.add(instantiationService.createInstance(TestTerminalSandboxService));
		await sandboxService.wrapWithSandbox({
			network: {
				allowedDomains: [],
				deniedDomains: []
			},
			filesystem: {
				denyRead: [],
				allowWrite: [],
				denyWrite: []
			}
		}, 'echo test');

		const responsePromise = sandboxHelperService.waitForSandboxPermissionResponse('request-1');
		sandboxHelperService.fireSandboxPermissionRequest({
			requestId: 'request-1',
			host: 'example.com',
			port: 443,
		});

		strictEqual(await responsePromise, true);
		strictEqual(sandboxService.permissionRequests.length, 1);
		strictEqual(sandboxService.permissionRequests[0].host, 'example.com');
		strictEqual(sandboxService.permissionRequests[0].port, 443);
	});

	test('should persist approved sandbox hosts to settings', async () => {
		const sandboxHelperService = new MockSandboxHelperService();
		instantiationService.stub(ISandboxHelperService, sandboxHelperService);
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork, {
			allowedDomains: ['existing.com'],
			deniedDomains: ['example.com'],
			allowTrustedDomains: false
		});

		const sandboxService = store.add(instantiationService.createInstance(TestTerminalSandboxService));
		await sandboxService.wrapWithSandbox({
			network: {
				allowedDomains: [],
				deniedDomains: []
			},
			filesystem: {
				denyRead: [],
				allowWrite: [],
				denyWrite: []
			}
		}, 'echo test');

		const responsePromise = sandboxHelperService.waitForSandboxPermissionResponse('request-2');
		sandboxHelperService.fireSandboxPermissionRequest({
			requestId: 'request-2',
			host: 'example.com',
			port: 443,
		});

		strictEqual(await responsePromise, true);
		const updatedSettings = configurationService.getValue<{
			allowedDomains?: string[];
			deniedDomains?: string[];
		}>(TerminalChatAgentToolsSettingId.TerminalSandboxNetwork);
		ok(updatedSettings?.allowedDomains?.includes('existing.com'));
		ok(updatedSettings?.allowedDomains?.includes('example.com'));
		ok(!updatedSettings?.deniedDomains?.includes('example.com'));
	});

	test('should persist approved sandbox write paths to settings', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem, {
			denyRead: [],
			allowWrite: ['/existing/path'],
			denyWrite: ['/tmp/blocked.txt']
		});

		const sandboxService = store.add(instantiationService.createInstance(TerminalSandboxService));
		strictEqual(await sandboxService.promptToAllowWritePath('/tmp/blocked.txt'), true);

		const updatedSettings = configurationService.getValue<{
			allowWrite?: string[];
			denyWrite?: string[];
		}>(TerminalChatAgentToolsSettingId.TerminalSandboxLinuxFileSystem);
		ok(updatedSettings?.allowWrite?.includes('/existing/path'));
		ok(updatedSettings?.allowWrite?.includes('/tmp/blocked.txt'));
		ok(!updatedSettings?.denyWrite?.includes('/tmp/blocked.txt'));
	});

	test('should not reset sandbox when unrelated settings change', async () => {
		store.add(instantiationService.createInstance(TerminalSandboxService));
		strictEqual(sandboxHelperService.resetSandboxCallCount, 0);

		configurationService.setUserConfiguration('window.zoomLevel', 1);

		strictEqual(sandboxHelperService.resetSandboxCallCount, 0);
	});
});
