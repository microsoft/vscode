/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../files/common/files.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { ISandboxDependencyStatus } from '../../common/sandboxHelperService.js';
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from '../../common/settings.js';
import { ITerminalSandboxEngineHost, ITerminalSandboxRuntimeInfo, TerminalSandboxEngine } from '../../common/terminalSandboxEngine.js';

suite('TerminalSandboxEngine', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let fileService: MockFileService;
	let createdFiles: Map<string, string>;
	let createFileCount: number;
	let createdFolders: string[];

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
			createdFiles.set(uri.path, content.toString());
			return {};
		}
		async createFolder(uri: URI): Promise<any> {
			createdFolders.push(uri.path);
			return {};
		}
		async del(_uri: URI): Promise<void> { }
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
			checkSandboxDependencies: (): Promise<ISandboxDependencyStatus | undefined> => Promise.resolve({ bubblewrapInstalled: true, socatInstalled: true }),
			...overrides,
		};
		return Object.assign(host, { rootsEmitter });
	}

	setup(() => {
		createdFiles = new Map();
		createFileCount = 0;
		createdFolders = [];
		instantiationService = store.add(new TestInstantiationService());
		configurationService = new TestConfigurationService();
		fileService = new MockFileService();

		configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.On);

		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());
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

	test('resolves filesystem paths and expands home on Linux when writing the config', async () => {
		configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
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
		ok(config.filesystem.allowWrite.includes('/real/workspace'), 'Workspace write root symlink should be resolved');
		ok(config.filesystem.allowWrite.includes('/real/write'), 'Configured allowWrite symlink should be resolved');
		ok(config.filesystem.allowRead.includes('/real/read'), 'Configured allowRead should expand ~ and resolve symlink');
		ok(config.filesystem.allowRead.includes('/real/gnupg'), 'Command runtime allowRead should expand ~ and resolve symlink');
		ok(config.filesystem.allowWrite.includes('/real/gnupg'), 'Command runtime allowWrite should expand ~ and resolve symlink');
		ok(config.filesystem.denyRead.includes('/real/deny-read'), 'Configured denyRead should expand ~ and resolve symlink');
		ok(config.filesystem.denyWrite.includes('/real/deny-write'), 'Configured denyWrite symlink should be resolved');
	});

	test('keeps filesystem paths without symlinks when writing the config', async () => {
		configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
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
		configurationService.setUserConfiguration(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);

		strictEqual(engine.getTempDir(), undefined);
		await engine.cleanupTempDir(); // must not throw
	});

	test('isEnabled returns false on Windows regardless of configuration', async () => {
		const host = createHost({ getOS: () => Promise.resolve(OperatingSystem.Windows) });
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		strictEqual(await engine.isEnabled(), false);
		strictEqual(await engine.isSandboxAllowNetworkEnabled(), false);
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
		let status: ISandboxDependencyStatus = { bubblewrapInstalled: false, socatInstalled: true };
		const host = createHost({
			checkSandboxDependencies: () => Promise.resolve(status),
		});
		const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));

		const result = await engine.checkForSandboxingPrereqs();
		strictEqual(result.enabled, true);
		strictEqual(result.failedCheck, 'dependencies');
		strictEqual(result.missingDependencies?.[0], 'bubblewrap');

		status = { bubblewrapInstalled: true, socatInstalled: true };
		const result2 = await engine.checkForSandboxingPrereqs(true);
		strictEqual(result2.failedCheck, undefined);
	});
});
