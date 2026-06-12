/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { arch } from '../../../../base/common/process.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IFileService } from '../../../files/common/files.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AgentNetworkDomainSettingId } from '../../../networkFilter/common/settings.js';
import type { ISandboxDependencyStatus, IWindowsMxcConfig, IWindowsMxcFilesystemPolicy, IWindowsMxcPolicyContainment, IWindowsMxcSandboxPolicy } from '../../common/sandboxHelperService.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../common/settings.js';
import { ITerminalSandboxEngineHost, ITerminalSandboxRuntimeInfo, TerminalSandboxEngine } from '../../common/terminalSandboxEngine.js';
import { IWindowsMxcTerminalSandboxRuntime, WindowsMxcTerminalSandboxRuntime } from '../../common/terminalSandboxMxcRuntime.js';
import { TerminalSandboxPrerequisiteCheck, TerminalSandboxPreCheckRemediation } from '../../common/terminalSandboxService.js';

suite('TerminalSandboxEngine', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let sandboxSettings: Map<string, unknown>;
	let sandboxSettingsEmitter: Emitter<void>;
	let fileService: MockFileService;
	let createdFiles: Map<string, string>;
	let createFileCount: number;
	let createdFolders: string[];

	function setSandboxSetting(key: string, value: unknown): void {
		sandboxSettings.set(key, value);
		sandboxSettingsEmitter.fire();
	}

	class MockFileService {
		private readonly _realpaths = new Map<string, string>();

		setRealpath(path: string, realpath: string): void {
			this._realpaths.set(path, realpath);
		}

		async realpath(uri: URI): Promise<URI | undefined> {
			const realpath = this._realpaths.get(uri.path);
			return realpath ? uri.with({ path: realpath }) : undefined;
		}

		async createFile(uri: URI, content: VSBuffer): Promise<any> {
			createFileCount++;
			const contentString = content.toString();
			createdFiles.set(uri.path, contentString);
			createdFiles.set(uri.fsPath, contentString);
			if (/^\/[a-zA-Z]:/.test(uri.path)) {
				createdFiles.set(uri.path.slice(1).replace(/\//g, '\\'), contentString);
			}
			return {};
		}
		async createFolder(uri: URI): Promise<any> {
			createdFolders.push(uri.path);
			return {};
		}
		async del(_uri: URI): Promise<void> { }
	}

	function buildMockWindowsMxcSandboxPayload(commandLine: string, policy: IWindowsMxcSandboxPolicy, workingDirectory?: string, containerName: string = 'vscode-terminal-sandbox', containment: IWindowsMxcPolicyContainment = 'process'): IWindowsMxcConfig {
		const clearPolicy = policy.filesystem?.clearPolicyOnExit ?? true;
		const network = {
			defaultPolicy: policy.network?.allowOutbound ? 'allow' : 'block' as 'allow' | 'block',
			...(policy.network?.allowLocalNetwork !== undefined ? { allowLocalNetwork: policy.network.allowLocalNetwork } : {}),
			...(policy.network?.allowedHosts ? { allowedHosts: policy.network.allowedHosts } : {}),
			...(policy.network?.blockedHosts ? { blockedHosts: policy.network.blockedHosts } : {}),
			...(policy.network ? { enforcementMode: policy.network.allowedHosts?.length || policy.network.blockedHosts?.length ? 'both' as const : 'capabilities' as const } : {}),
		};
		return {
			version: policy.version,
			containerId: containerName,
			containment,
			lifecycle: {
				destroyOnExit: true,
				preservePolicy: !clearPolicy,
			},
			process: {
				commandLine,
				cwd: workingDirectory,
				timeout: policy.timeoutMs ?? 0,
			},
			processContainer: {
				name: containerName,
				leastPrivilege: false,
				capabilities: policy.network?.allowOutbound ? ['internetClient'] : [],
				ui: {
					isolation: 'container',
					desktopSystemControl: false,
					systemSettings: 'none',
					ime: false,
				},
			},
			filesystem: {
				readwritePaths: [...(policy.filesystem?.readwritePaths ?? [])],
				readonlyPaths: [...(policy.filesystem?.readonlyPaths ?? [])],
				deniedPaths: [...(policy.filesystem?.deniedPaths ?? [])],
			},
			network,
			ui: {
				disable: !(policy.ui?.allowWindows ?? false),
				clipboard: policy.ui?.clipboard ?? 'none',
				injection: policy.ui?.allowInputInjection ?? false,
			},
		};
	}

	function createHost(overrides: Partial<ITerminalSandboxEngineHost> = {}): ITerminalSandboxEngineHost & { rootsEmitter: Emitter<void> } {
		const rootsEmitter = new Emitter<void>();
		const defaultRuntime: ITerminalSandboxRuntimeInfo = {
			appRoot: '/app',
			execPath: '/app/node',
			runAsNode: false,
		};
		const host: ITerminalSandboxEngineHost = {
			getOS: () => Promise.resolve(OperatingSystem.Linux),
			getRuntimeInfo: () => Promise.resolve(defaultRuntime),
			getUserHome: () => Promise.resolve(URI.file('/home/user')),
			getSandboxTempDir: () => Promise.resolve(URI.file('/home/user/.test-data/tmp')),
			getWorkspaceStorageReadRoot: () => Promise.resolve(undefined),
			getWriteRoots: () => [URI.file('/workspace')],
			onDidChangeRoots: rootsEmitter.event,
			checkSandboxDependencies: (): Promise<ISandboxDependencyStatus | undefined> => Promise.resolve({ bubblewrapInstalled: true, bubblewrapUsable: true, socatInstalled: true }),
			getWindowsMxcFilesystemPolicy: (): Promise<IWindowsMxcFilesystemPolicy | undefined> => Promise.resolve(undefined),
			getWindowsMxcEnvironment: (): Promise<string[] | undefined> => Promise.resolve(undefined),
			buildWindowsMxcSandboxPayload: (commandLine, policy, workingDirectory, containerName, containment): Promise<IWindowsMxcConfig | undefined> => Promise.resolve(buildMockWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment)),
			getSandboxSetting: <T>(settingId: string): T | undefined => sandboxSettings.has(settingId) ? sandboxSettings.get(settingId) as T : undefined,
			onDidChangeSandboxSettings: sandboxSettingsEmitter.event,
			...overrides,
		};
		return Object.assign(host, { rootsEmitter });
	}

	function createWindowsHost(overrides: Partial<ITerminalSandboxEngineHost> = {}): ITerminalSandboxEngineHost & { rootsEmitter: Emitter<void> } {
		return createHost({
			getOS: () => Promise.resolve(OperatingSystem.Windows),
			getRuntimeInfo: () => Promise.resolve({ appRoot: 'C:\\app', arch: 'x64' }),
			getUserHome: () => Promise.resolve(URI.from({ scheme: 'file', path: '/c:/Users/user' })),
			getSandboxTempDir: () => Promise.resolve(URI.from({ scheme: 'file', path: '/c:/Users/user/.test-data/tmp' })),
			getWorkspaceStorageReadRoot: () => Promise.resolve(URI.from({ scheme: 'file', path: '/c:/Users/user/workspaceStorage/workspace-id' })),
			getWriteRoots: () => [URI.from({ scheme: 'file', path: '/c:/workspace' })],
			getWindowsMxcFilesystemPolicy: () => Promise.resolve({ readonlyPaths: ['C:\\tools\\node', 'C:\\tools\\python', 'C:\\Users\\user\\AppData\\Local\\Programs\\Git'], readwritePaths: ['C:\\Users\\user\\AppData\\Local\\Temp'] }),
			getWindowsMxcEnvironment: () => Promise.resolve([
				'SystemRoot=C:\\Windows',
				'PATH=C:\\tools\\node;C:\\Windows\\System32',
				'ComSpec=C:\\Windows\\System32\\cmd.exe',
				'PATHEXT=.COM;.EXE;.BAT;.CMD;.PS1',
				'PSModulePath=C:\\Users\\user\\Documents\\PowerShell\\Modules;C:\\Program Files\\PowerShell\\Modules',
				'USERPROFILE=C:\\Users\\user',
				'APPDATA=C:\\Users\\user\\AppData\\Roaming',
				'LOCALAPPDATA=C:\\Users\\user\\AppData\\Local',
				'PSHOME=C:\\Program Files\\PowerShell\\7'
			]),
			...overrides,
		});
	}

	function normalizeWindowsPathForAssert(path: string): string {
		return path.replace(/\\/g, '/').toLowerCase();
	}

	function enableWindowsSandbox(): void {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsEnabled, AgentSandboxEnabledValue.AllowNetwork);
	}

	setup(() => {
		createdFiles = new Map();
		createFileCount = 0;
		createdFolders = [];
		instantiationService = store.add(new TestInstantiationService());
		sandboxSettings = new Map();
		sandboxSettingsEmitter = store.add(new Emitter<void>());
		fileService = new MockFileService();

		sandboxSettings.set(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.On);
		sandboxSettings.set(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);

		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IWindowsMxcTerminalSandboxRuntime, instantiationService.createInstance(WindowsMxcTerminalSandboxRuntime));
	});

	test('runAsNode=true prefixes the wrapped command with ELECTRON_RUN_AS_NODE=1', async () => {
		const host = createHost({
			getRuntimeInfo: () => Promise.resolve({ appRoot: '/app', execPath: '/app/electron', runAsNode: true }),
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
		await engine.getSandboxConfigPath();

		const wrapped = await engine.wrapCommand('echo hi');

		strictEqual(wrapped.isSandboxWrapped, true);
		ok(wrapped.command.startsWith('ELECTRON_RUN_AS_NODE=1 '), `Expected ELECTRON_RUN_AS_NODE=1 prefix. Actual: ${wrapped.command}`);
	});

	test('runAsNode=false omits the ELECTRON_RUN_AS_NODE=1 prefix', async () => {
		const host = createHost({
			getRuntimeInfo: () => Promise.resolve({ appRoot: '/app', execPath: '/app/node', runAsNode: false }),
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
		await engine.getSandboxConfigPath();

		const wrapped = await engine.wrapCommand('echo hi');

		strictEqual(wrapped.isSandboxWrapped, true);
		ok(!wrapped.command.startsWith('ELECTRON_RUN_AS_NODE='), `Did not expect ELECTRON_RUN_AS_NODE prefix. Actual: ${wrapped.command}`);
	});

	test('wrapCommand adds ripgrep-universal platform-arch bin directory to PATH', async () => {
		const host = createHost();
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
		await engine.getSandboxConfigPath();

		const wrapped = await engine.wrapCommand('echo hi');

		ok(wrapped.command.includes(`/app/node_modules/@vscode/ripgrep-universal/bin/linux-${arch}`), `Expected ripgrep-universal platform-arch path in command. Actual: ${wrapped.command}`);
	});

	test('requestAllowNetwork keeps the command sandboxed and refreshes its network config', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));

		const wrapped = await engine.wrapCommand('curl https://example.com', false, 'bash', undefined, undefined, true);
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const unrestrictedConfig = JSON.parse(createdFiles.get(configPath)!);

		strictEqual(wrapped.isSandboxWrapped, true);
		strictEqual(wrapped.requiresAllowNetworkConfirmation, true);
		deepStrictEqual(unrestrictedConfig.network, { allowedDomains: [], deniedDomains: [], enabled: false });

		await engine.wrapCommand('echo restricted again');
		const restrictedConfig = JSON.parse(createdFiles.get(configPath)!);
		deepStrictEqual(restrictedConfig.network, { allowedDomains: [], deniedDomains: [] });
	});

	test('requestAllowNetwork does not relax network access when per-command requests are disabled', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, false);
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));

		const wrapped = await engine.wrapCommand('curl https://example.com', false, 'bash', undefined, undefined, true);
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		strictEqual(wrapped.isSandboxWrapped, true);
		strictEqual(wrapped.requiresAllowNetworkConfirmation, undefined);
		deepStrictEqual(config.network, { allowedDomains: [], deniedDomains: [] });
	});

	test('blocked domains request sandboxed network access before execution when enabled', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
		setSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['example.com']);
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));

		const wrapped = await engine.wrapCommand('curl https://example.com', false, 'bash');
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		strictEqual(wrapped.isSandboxWrapped, true);
		strictEqual(wrapped.requiresAllowNetworkConfirmation, true);
		deepStrictEqual(wrapped.blockedDomains, ['example.com']);
		deepStrictEqual(wrapped.deniedDomains, ['example.com']);
		deepStrictEqual(config.network, { allowedDomains: [], deniedDomains: [], enabled: false });
	});

	test('onDidChangeRoots triggers a sandbox config rewrite on the next wrap', async () => {
		let writeRoots: URI[] = [URI.file('/workspace-a')];
		const host = createHost({
			getWriteRoots: () => writeRoots,
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
		await engine.getSandboxConfigPath();
		await engine.wrapCommand('echo a');
		const initialWriteCount = createFileCount;

		writeRoots = [URI.file('/workspace-b')];
		host.rootsEmitter.fire();
		await engine.wrapCommand('echo b');

		ok(createFileCount > initialWriteCount, `Expected sandbox config to be rewritten after onDidChangeRoots (initial=${initialWriteCount}, after=${createFileCount})`);
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath!)!);
		ok(config.filesystem.allowWrite.includes('/workspace-b'), 'Refreshed config should include the new write root');
		ok(!config.filesystem.allowWrite.includes('/workspace-a'), 'Refreshed config should drop the old write root');
	});

	test('preserves filesystem symlink paths and resolves their targets on Linux when writing the config', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
			allowRead: ['~/read-link'],
			allowWrite: ['/write-link'],
			denyRead: ['~/deny-read-link'],
			denyWrite: ['/deny-write-link'],
		});
		fileService.setRealpath('/workspace-link', '/real/workspace');
		fileService.setRealpath('/write-link', '/real/write');
		fileService.setRealpath('/home/user/read-link', '/real/read');
		fileService.setRealpath('/home/user/deny-read-link', '/real/deny-read');
		fileService.setRealpath('/deny-write-link', '/real/deny-write');
		fileService.setRealpath('/home/user/.gnupg', '/real/gnupg');
		const host = createHost({
			getWriteRoots: () => [URI.file('/workspace-link')],
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		await engine.wrapCommand('git commit -S', false, undefined, undefined, [{ keyword: 'git', args: ['commit', '-S'] }]);

		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);
		ok(config.filesystem.allowWrite.includes('/workspace-link'), 'Workspace write root symlink should be preserved');
		ok(config.filesystem.allowWrite.includes('/real/workspace'), 'Workspace write root symlink target should be included');
		ok(config.filesystem.allowWrite.includes('/write-link'), 'Configured allowWrite symlink should be preserved');
		ok(config.filesystem.allowWrite.includes('/real/write'), 'Configured allowWrite symlink target should be included');
		ok(config.filesystem.allowRead.includes('/home/user/read-link'), 'Configured allowRead should expand ~ and preserve the symlink');
		ok(config.filesystem.allowRead.includes('/real/read'), 'Configured allowRead symlink target should be included');
		ok(config.filesystem.allowRead.includes('/home/user/.gnupg'), 'Command runtime allowRead symlink should be preserved');
		ok(config.filesystem.allowRead.includes('/real/gnupg'), 'Command runtime allowRead symlink target should be included');
		ok(config.filesystem.allowWrite.includes('/home/user/.gnupg'), 'Command runtime allowWrite symlink should be preserved');
		ok(config.filesystem.allowWrite.includes('/real/gnupg'), 'Command runtime allowWrite symlink target should be included');
		ok(config.filesystem.denyRead.includes('/home/user/deny-read-link'), 'Configured denyRead should expand ~ and preserve the symlink');
		ok(config.filesystem.denyRead.includes('/real/deny-read'), 'Configured denyRead symlink target should be included');
		ok(config.filesystem.denyWrite.includes('/deny-write-link'), 'Configured denyWrite symlink should be preserved');
		ok(config.filesystem.denyWrite.includes('/real/deny-write'), 'Configured denyWrite symlink target should be included');
	});

	test('keeps filesystem paths without symlinks when writing the config', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
			allowRead: ['~/read-plain'],
			allowWrite: ['/write-plain'],
			denyRead: ['~/deny-read-plain'],
			denyWrite: ['/deny-write-plain'],
		});
		const host = createHost({
			getWriteRoots: () => [URI.file('/workspace-plain')],
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);
		ok(config.filesystem.allowWrite.includes('/workspace-plain'), 'Workspace write root without symlink should be preserved');
		ok(config.filesystem.allowWrite.includes('/write-plain'), 'Configured allowWrite without symlink should be preserved');
		ok(config.filesystem.allowRead.includes('/home/user/read-plain'), 'Configured allowRead without symlink should expand ~ and be preserved');
		ok(config.filesystem.denyRead.includes('/home/user/deny-read-plain'), 'Configured denyRead without symlink should expand ~ and be preserved');
		ok(config.filesystem.denyWrite.includes('/deny-write-plain'), 'Configured denyWrite without symlink should be preserved');
	});

	test('cleanupTempDir is a no-op when no temp dir was ever created', async () => {
		const host = createHost();
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		// Disable the sandbox so the engine never creates a temp dir.
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);

		strictEqual(engine.getTempDir(), undefined);
		await engine.cleanupTempDir(); // must not throw
	});

	test('precheck inputs can disable sandboxing when default approval permission is disabled', async () => {
		const host = createHost();
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		strictEqual(await engine.isEnabled({ isDefaultApprovalPermissionEnabled: true }), true);
		strictEqual(await engine.isEnabled({ isDefaultApprovalPermissionEnabled: false }), false);
		strictEqual(await engine.isSandboxAllowNetworkEnabled({ isDefaultApprovalPermissionEnabled: false }), false);
		strictEqual(await engine.getSandboxConfigPath(false, { isDefaultApprovalPermissionEnabled: false }), undefined);

		deepStrictEqual(await engine.checkForSandboxingPrereqs(false, { isDefaultApprovalPermissionEnabled: false }), {
			enabled: false,
			sandboxConfigPath: undefined,
			failedCheck: undefined,
		});

		strictEqual(createFileCount, 0, 'Disabled sandbox precheck should not create sandbox config files');
	});

	test('isEnabled returns false on Windows when Windows sandbox setting is disabled by default', async () => {
		const host = createWindowsHost();
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		strictEqual(await engine.isEnabled(), false);
		strictEqual(await engine.isSandboxAllowNetworkEnabled(), false);
		strictEqual(await engine.getSandboxConfigPath(), undefined);
	});

	test('isEnabled returns true on Windows when Windows sandbox setting allows network even if global sandboxing is off', async () => {
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);
		enableWindowsSandbox();
		const host = createWindowsHost();
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		strictEqual(await engine.isEnabled(), true);
		strictEqual(await engine.isSandboxAllowNetworkEnabled(), true);
	});

	test('wrapCommand uses MXC executable and writes MXC config on Windows', async () => {
		enableWindowsSandbox();
		const host = createWindowsHost();
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const wrapped = await engine.wrapCommand('echo hello', false, 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', URI.from({ scheme: 'file', path: '/c:/workspace' }));
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		strictEqual(wrapped.isSandboxWrapped, true);
		ok(wrapped.command.startsWith(`& 'C:\\app\\node_modules\\@microsoft\\mxc-sdk\\bin\\x64\\wxc-exec.exe'`), `Expected MXC executable. Actual: ${wrapped.command}`);
		ok(wrapped.command.includes(` '${configPath}'`), `Expected wrapped command to pass the MXC config path. Actual: ${wrapped.command}`);
		strictEqual(config.version, '0.4.0-alpha');
		strictEqual(config.containment, 'process');
		strictEqual(config.processContainer.name, 'vscode-terminal-sandbox');
		strictEqual(config.process.commandLine, '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoProfile -ExecutionPolicy Bypass -Command "echo hello"');
		strictEqual(normalizeWindowsPathForAssert(config.process.cwd), 'c:/workspace');
		strictEqual(config.ui.disable, false);
		ok(config.process.env.includes('SystemRoot=C:\\Windows'), 'SystemRoot should be injected into the MXC process env');
		ok(config.process.env.includes('PATH=C:\\tools\\node;C:\\Windows\\System32'), 'PATH should be injected into the MXC process env');
		ok(config.process.env.includes('ComSpec=C:\\Windows\\System32\\cmd.exe'), 'ComSpec should be injected into the MXC process env');
		ok(config.process.env.includes('PATHEXT=.COM;.EXE;.BAT;.CMD;.PS1'), 'PATHEXT should be injected into the MXC process env');
		ok(config.process.env.includes('PSModulePath=C:\\Users\\user\\Documents\\PowerShell\\Modules;C:\\Program Files\\PowerShell\\Modules'), 'PSModulePath should be injected into the MXC process env');
		ok(config.process.env.includes('USERPROFILE=C:\\Users\\user'), 'USERPROFILE should be injected into the MXC process env');
		ok(config.process.env.includes('APPDATA=C:\\Users\\user\\AppData\\Roaming'), 'APPDATA should be injected into the MXC process env');
		ok(config.process.env.includes('LOCALAPPDATA=C:\\Users\\user\\AppData\\Local'), 'LOCALAPPDATA should be injected into the MXC process env');
		ok(config.process.env.includes('PSHOME=C:\\Program Files\\PowerShell\\7'), 'PSHOME should be injected into the MXC process env');
		deepStrictEqual(config.network, { defaultPolicy: 'allow', enforcementMode: 'capabilities' });
		ok(config.filesystem.readwritePaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/workspace'), 'Workspace should be writable');
		ok(config.filesystem.readwritePaths.some((path: string) => normalizeWindowsPathForAssert(path).endsWith('/.test-data/tmp')), 'Sandbox temp dir should be writable');
		ok(config.filesystem.readwritePaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/users/user/appdata/local/temp'), 'MXC temporary files policy should add host temp path to writable paths');
		ok(config.filesystem.readonlyPaths.some((path: string) => normalizeWindowsPathForAssert(path).endsWith('/.test-data/tmp')), 'Sandbox temp dir should be readable through readonly paths');
		ok(config.filesystem.readonlyPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/tools/node'), 'MXC available tools policy should add tool paths to readonly paths');
		ok(config.filesystem.readonlyPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/program files/powershell/7'), 'Resolved PowerShell executable directory should be readable');
		ok(config.filesystem.readonlyPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/users/user/appdata/local/programs/git'), 'MXC user profile policy should add user profile paths to readonly paths');
		ok(!config.filesystem.deniedPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/users/user'), 'User home should not be denied by default on Windows');
	});

	test('wrapCommand applies Windows filesystem setting to MXC config', async () => {
		enableWindowsSandbox();
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsFileSystem, {
			allowWrite: ['C:/configured/write'],
			allowRead: ['C:/configured/read'],
			denyRead: ['C:/configured/secret'],
		});
		const host = createWindowsHost();
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		await engine.wrapCommand('echo hello', false, 'pwsh');
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const serializedConfig = createdFiles.get(configPath)!;
		const config = JSON.parse(serializedConfig);

		ok(serializedConfig.includes('C:\\\\configured\\\\write'), 'Configured Windows allowWrite path should be escaped in the serialized MXC config');
		ok(serializedConfig.includes('C:\\\\configured\\\\read'), 'Configured Windows allowRead path should be escaped in the serialized MXC config');
		ok(serializedConfig.includes('C:\\\\configured\\\\secret'), 'Configured Windows denyRead path should be escaped in the serialized MXC config');
		ok(config.filesystem.readwritePaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/configured/write'), 'Configured Windows allowWrite path should be writable');
		ok(config.filesystem.readonlyPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/configured/read'), 'Configured Windows allowRead path should be readonly');
		ok(config.filesystem.readwritePaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/users/user/appdata/local/temp'), 'Host temp path from Windows policy should be writable');
		ok(config.filesystem.deniedPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/configured/secret'), 'Configured Windows denyRead path should be denied');
		ok(!config.filesystem.deniedPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/users/user'), 'User home should not be denied by default on Windows');
	});

	test('wrapCommand applies configured Windows MXC schema version', async () => {
		enableWindowsSandbox();
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsSchemaVersion, '0.5.0-alpha');
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createWindowsHost()));

		await engine.wrapCommand('echo hello', false, 'pwsh');
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		strictEqual(config.version, '0.5.0-alpha');
	});

	test('preserves Windows filesystem symlink paths and resolves their targets when writing MXC config', async () => {
		enableWindowsSandbox();
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsFileSystem, {
			allowWrite: ['C:\\configured\\write-link'],
			allowRead: ['C:\\configured\\read-link'],
			denyRead: ['C:\\configured\\secret-link'],
		});
		fileService.setRealpath('/c:/workspace-link', '/c:/real/workspace');
		fileService.setRealpath('/c:/configured/write-link', '/c:/real/configured-write');
		fileService.setRealpath('/c:/configured/read-link', '/c:/real/configured-read');
		fileService.setRealpath('/c:/configured/secret-link', '/c:/real/configured-secret');
		fileService.setRealpath('/c:/tools/node', '/c:/real/tools-node');
		const host = createWindowsHost({
			getWriteRoots: () => [URI.from({ scheme: 'file', path: '/c:/workspace-link' })],
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		await engine.wrapCommand('echo hello', false, 'pwsh');
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		ok(config.filesystem.readwritePaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/workspace-link'), 'Workspace write root symlink should be preserved on Windows');
		ok(config.filesystem.readwritePaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/real/workspace'), 'Workspace write root symlink target should be included on Windows');
		ok(config.filesystem.readwritePaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/configured/write-link'), 'Configured Windows allowWrite symlink should be preserved');
		ok(config.filesystem.readwritePaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/real/configured-write'), 'Configured Windows allowWrite symlink target should be included');
		ok(config.filesystem.readonlyPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/configured/read-link'), 'Configured Windows allowRead symlink should be preserved');
		ok(config.filesystem.readonlyPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/real/configured-read'), 'Configured Windows allowRead symlink target should be included');
		ok(config.filesystem.readonlyPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/tools/node'), 'Windows policy readonly symlink should be preserved');
		ok(config.filesystem.readonlyPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/real/tools-node'), 'Windows policy readonly symlink target should be included');
		ok(config.filesystem.deniedPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/configured/secret-link'), 'Configured Windows denyRead symlink should be preserved');
		ok(config.filesystem.deniedPaths.some((path: string) => normalizeWindowsPathForAssert(path) === 'c:/real/configured-secret'), 'Configured Windows denyRead symlink target should be included');
	});

	test('wrapCommand uses arm64 MXC executable on Windows arm64', async () => {
		enableWindowsSandbox();
		const host = createWindowsHost({
			getRuntimeInfo: () => Promise.resolve({ appRoot: 'C:\\app', arch: 'arm64' }),
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const wrapped = await engine.wrapCommand('echo hello', false, 'pwsh');
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		strictEqual(wrapped.command, `& 'C:\\app\\node_modules\\@microsoft\\mxc-sdk\\bin\\arm64\\wxc-exec.exe' '${configPath}'`);
		strictEqual(normalizeWindowsPathForAssert(config.process.cwd), 'c:/workspace');
	});

	test('wrapCommand rewrites MXC config when Windows command changes', async () => {
		enableWindowsSandbox();
		const host = createWindowsHost();
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		await engine.wrapCommand('echo first', false, 'C:\\Program Files\\PowerShell\\7\\pwsh.exe');
		let configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const firstCommandLine = JSON.parse(createdFiles.get(configPath)!).process.commandLine;
		strictEqual(firstCommandLine, '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoProfile -ExecutionPolicy Bypass -Command "echo first"');

		await engine.wrapCommand('echo second', false, 'C:\\Program Files\\PowerShell\\7\\pwsh.exe');
		configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const secondCommandLine = JSON.parse(createdFiles.get(configPath)!).process.commandLine;
		strictEqual(secondCommandLine, '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoProfile -ExecutionPolicy Bypass -Command "echo second"');
	});

	test('allowNetwork maps to MXC allow network config on Windows', async () => {
		enableWindowsSandbox();
		setSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.AllowNetwork);
		const host = createWindowsHost();
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		await engine.wrapCommand('curl https://example.com', false, 'pwsh');
		const configPath = await engine.getSandboxConfigPath();
		ok(configPath, 'Config path should be defined');
		const config = JSON.parse(createdFiles.get(configPath)!);

		deepStrictEqual(config.network, { defaultPolicy: 'allow', enforcementMode: 'capabilities' });
	});

	test('uses OS-specific filesystem absolute path detection', async () => {
		const linuxEngine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
		await linuxEngine.getOS();
		const isLinuxAbsolutePath = (linuxEngine as unknown as { _isAbsoluteFileSystemPath(path: string): boolean })._isAbsoluteFileSystemPath.bind(linuxEngine);

		strictEqual(isLinuxAbsolutePath('/home/user'), true);
		strictEqual(isLinuxAbsolutePath('relative/path'), false);
		strictEqual(isLinuxAbsolutePath('C:\\Users\\user'), false);

		const windowsEngine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost({ getOS: () => Promise.resolve(OperatingSystem.Windows) })));
		await windowsEngine.getOS();
		const isWindowsAbsolutePath = (windowsEngine as unknown as { _isAbsoluteFileSystemPath(path: string): boolean })._isAbsoluteFileSystemPath.bind(windowsEngine);

		strictEqual(isWindowsAbsolutePath('/Users/user'), true);
		strictEqual(isWindowsAbsolutePath('C:\\Users\\user'), true);
		strictEqual(isWindowsAbsolutePath('C:/Users/user'), true);
		strictEqual(isWindowsAbsolutePath('\\\\server\\share'), true);
		strictEqual(isWindowsAbsolutePath('relative\\path'), false);
	});

	test('checkForSandboxingPrereqs reports missing dependencies', async () => {
		let status: ISandboxDependencyStatus = { bubblewrapInstalled: false, bubblewrapUsable: false, socatInstalled: true };
		const host = createHost({
			checkSandboxDependencies: () => Promise.resolve(status),
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const result = await engine.checkForSandboxingPrereqs();
		strictEqual(result.enabled, true);
		strictEqual(result.failedCheck, 'dependencies');
		strictEqual(result.missingDependencies?.[0], 'bubblewrap');

		status = { bubblewrapInstalled: true, bubblewrapUsable: true, socatInstalled: true };
		const result2 = await engine.checkForSandboxingPrereqs(true);
		strictEqual(result2.failedCheck, undefined);
	});

	test('checkForSandboxingPrereqs caches missing dependencies until force refresh', async () => {
		let callCount = 0;
		let status: ISandboxDependencyStatus = { bubblewrapInstalled: false, bubblewrapUsable: false, socatInstalled: true };
		const host = createHost({
			checkSandboxDependencies: () => {
				callCount++;
				return Promise.resolve(status);
			},
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const first = await engine.checkForSandboxingPrereqs();
		const second = await engine.checkForSandboxingPrereqs();

		strictEqual(first.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies);
		strictEqual(second.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies);
		strictEqual(callCount, 1, 'Missing dependencies should be checked once and cached');

		status = { bubblewrapInstalled: true, bubblewrapUsable: true, socatInstalled: true };
		const cached = await engine.checkForSandboxingPrereqs();
		strictEqual(cached.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies, 'Non-forced checks should keep using the cached missing status');
		strictEqual(callCount, 1);

		const refreshed = await engine.checkForSandboxingPrereqs(true);
		strictEqual(refreshed.failedCheck, undefined);
		strictEqual(callCount, 2, 'Force refresh should re-check dependencies after install or repair');
	});

	test('checkForSandboxingPrereqs reports remediation when bubblewrap is unusable', async () => {
		const host = createHost({
			checkSandboxDependencies: () => Promise.resolve({
				bubblewrapInstalled: true,
				bubblewrapUsable: false,
				bubblewrapError: 'Creating new namespace failed',
				socatInstalled: true,
			}),
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const result = await engine.checkForSandboxingPrereqs();

		strictEqual(result.failedCheck, TerminalSandboxPrerequisiteCheck.Bubblewrap);
		deepStrictEqual(result.remediations, [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction]);
		strictEqual(result.detail, 'Creating new namespace failed');
		strictEqual(result.missingDependencies, undefined);
	});
});
