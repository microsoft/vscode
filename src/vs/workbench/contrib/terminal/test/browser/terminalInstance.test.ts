/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isWindows, type IProcessEnvironment } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalCapability, type ICwdDetectionCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { GeneralShellType, ITerminalChildProcess, ITerminalProfile, TitleEventSource, type IShellLaunchConfig, type ITerminalBackend, type ITerminalProcessOptions } from '../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { ITerminalConfigurationService, ITerminalInstance, ITerminalInstanceService, ITerminalService } from '../../browser/terminal.js';
import { TerminalConfigurationService } from '../../browser/terminalConfigurationService.js';
import { parseExitResult, TerminalInstance, TerminalLabelComputer } from '../../browser/terminalInstance.js';
import { IEnvironmentVariableService } from '../../common/environmentVariable.js';
import { EnvironmentVariableService } from '../../common/environmentVariableService.js';
import { ITerminalProfileResolverService, ProcessState } from '../../common/terminal.js';
import { TestViewDescriptorService } from './xterm/xtermTerminal.test.js';
import { fixPath } from '../../../../services/search/test/browser/queryBuilder.test.js';
import { TestTerminalProfileResolverService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

const root1 = '/foo/root1';
const ROOT_1 = fixPath(root1);
const root2 = '/foo/root2';
const ROOT_2 = fixPath(root2);

class MockTerminalProfileResolverService extends TestTerminalProfileResolverService {
	override async getDefaultProfile(): Promise<ITerminalProfile> {
		return {
			profileName: 'my-sh',
			path: '/usr/bin/zsh',
			env: {
				TEST: 'TEST',
			},
			isDefault: true,
			isUnsafePath: false,
			isFromPath: true,
			icon: {
				id: 'terminal-linux',
			},
			color: 'terminal.ansiYellow',
		};
	}
}

const terminalShellTypeContextKey = {
	set: () => { },
	reset: () => { },
	get: () => undefined
};

class TestTerminalChildProcess extends Disposable implements ITerminalChildProcess {
	id: number = 0;
	get capabilities() { return []; }
	constructor(
		readonly shouldPersist: boolean
	) {
		super();
	}
	updateProperty(property: any, value: any): Promise<void> {
		throw new Error('Method not implemented.');
	}

	readonly onProcessOverrideDimensions?: Event<any> | undefined;
	readonly onProcessResolvedShellLaunchConfig?: Event<any> | undefined;
	readonly onDidChangeHasChildProcesses?: Event<any> | undefined;

	onDidChangeProperty = Event.None;
	onProcessData = Event.None;
	onProcessExit = Event.None;
	onProcessReady = Event.None;
	onProcessTitleChanged = Event.None;
	onProcessShellTypeChanged = Event.None;
	async start(): Promise<undefined> { return undefined; }
	shutdown(immediate: boolean): void { }
	input(data: string): void { }
	sendSignal(signal: string): void { }
	resize(cols: number, rows: number): void { }
	clearBuffer(): void { }
	acknowledgeDataEvent(charCount: number): void { }
	async setUnicodeVersion(version: '6' | '11'): Promise<void> { }
	async getInitialCwd(): Promise<string> { return ''; }
	async getCwd(): Promise<string> { return ''; }
	async processBinary(data: string): Promise<void> { }
	refreshProperty(property: any): Promise<any> { return Promise.resolve(''); }
}

class TestTerminalInstanceService extends Disposable implements Partial<ITerminalInstanceService> {
	async getBackend() {
		return {
			onPtyHostExit: Event.None,
			onPtyHostUnresponsive: Event.None,
			onPtyHostResponsive: Event.None,
			onPtyHostRestart: Event.None,
			onDidMoveWindowInstance: Event.None,
			onDidRequestDetach: Event.None,
			createProcess: async (
				shellLaunchConfig: IShellLaunchConfig,
				cwd: string,
				cols: number,
				rows: number,
				unicodeVersion: '6' | '11',
				env: IProcessEnvironment,
				options: ITerminalProcessOptions,
				shouldPersist: boolean
			) => this._register(new TestTerminalChildProcess(shouldPersist)),
			getLatency: () => Promise.resolve([])
		} as unknown as ITerminalBackend;
	}
}

suite('Workbench - TerminalInstance', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('TerminalInstance', () => {
		let terminalInstance: ITerminalInstance;
		test('should create an instance of TerminalInstance with env from default profile', async () => {
			const instantiationService = workbenchInstantiationService({
				configurationService: () => new TestConfigurationService({
					files: {},
					terminal: {
						integrated: {
							fontFamily: 'monospace',
							scrollback: 1000,
							fastScrollSensitivity: 2,
							mouseWheelScrollSensitivity: 1,
							unicodeVersion: '6',
							shellIntegration: {
								enabled: true
							}
						}
					},
				})
			}, store);
			instantiationService.set(ITerminalProfileResolverService, new MockTerminalProfileResolverService());
			instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
			instantiationService.stub(IEnvironmentVariableService, store.add(instantiationService.createInstance(EnvironmentVariableService)));
			instantiationService.stub(ITerminalInstanceService, store.add(new TestTerminalInstanceService()));
			instantiationService.stub(ITerminalService, { setNextCommandId: async () => { } } as Partial<ITerminalService>);
			terminalInstance = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, {}));
			// //Wait for the teminalInstance._xtermReadyPromise to resolve
			await new Promise(resolve => setTimeout(resolve, 100));
			deepStrictEqual(terminalInstance.shellLaunchConfig.env, { TEST: 'TEST' });
		});

		test('should preserve title for task terminals', async () => {
			const instantiationService = workbenchInstantiationService({
				configurationService: () => new TestConfigurationService({
					files: {},
					terminal: {
						integrated: {
							fontFamily: 'monospace',
							scrollback: 1000,
							fastScrollSensitivity: 2,
							mouseWheelScrollSensitivity: 1,
							unicodeVersion: '6',
							shellIntegration: {
								enabled: true
							}
						}
					},
				})
			}, store);
			instantiationService.set(ITerminalProfileResolverService, new MockTerminalProfileResolverService());
			instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
			instantiationService.stub(IEnvironmentVariableService, store.add(instantiationService.createInstance(EnvironmentVariableService)));
			instantiationService.stub(ITerminalInstanceService, store.add(new TestTerminalInstanceService()));
			instantiationService.stub(ITerminalService, { setNextCommandId: async () => { } } as Partial<ITerminalService>);

			const taskTerminal = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, {
				type: 'Task',
				name: 'Test Task Name'
			}));


			// Simulate setting the title via API (as the task system would do)
			await taskTerminal.rename('Test Task Name');
			strictEqual(taskTerminal.title, 'Test Task Name');

			// Simulate a process title change (which happens when task completes)
			await taskTerminal.rename('some-process-name', TitleEventSource.Process);

			// Verify that the task name is preserved
			strictEqual(taskTerminal.title, 'Test Task Name', 'Task terminal should preserve API-set title');
		});
	});
	suite('parseExitResult', () => {
		test('should return no message for exit code = undefined', () => {
			deepStrictEqual(
				parseExitResult(undefined, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: undefined, message: undefined }
			);
			deepStrictEqual(
				parseExitResult(undefined, {}, ProcessState.KilledByUser, undefined),
				{ code: undefined, message: undefined }
			);
			deepStrictEqual(
				parseExitResult(undefined, {}, ProcessState.KilledByProcess, undefined),
				{ code: undefined, message: undefined }
			);
		});
		test('should return no message for exit code = 0', () => {
			deepStrictEqual(
				parseExitResult(0, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: 0, message: undefined }
			);
			deepStrictEqual(
				parseExitResult(0, {}, ProcessState.KilledByUser, undefined),
				{ code: 0, message: undefined }
			);
			deepStrictEqual(
				parseExitResult(0, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: 0, message: undefined }
			);
		});
		test('should return friendly message when executable is specified for non-zero exit codes', () => {
			deepStrictEqual(
				parseExitResult(1, { executable: 'foo' }, ProcessState.KilledDuringLaunch, undefined),
				{ code: 1, message: 'The terminal process "foo" failed to launch (exit code: 1).' }
			);
			deepStrictEqual(
				parseExitResult(1, { executable: 'foo' }, ProcessState.KilledByUser, undefined),
				{ code: 1, message: 'The terminal process "foo" terminated with exit code: 1.' }
			);
			deepStrictEqual(
				parseExitResult(1, { executable: 'foo' }, ProcessState.KilledByProcess, undefined),
				{ code: 1, message: 'The terminal process "foo" terminated with exit code: 1.' }
			);
		});
		test('should return friendly message when executable and args are specified for non-zero exit codes', () => {
			deepStrictEqual(
				parseExitResult(1, { executable: 'foo', args: ['bar', 'baz'] }, ProcessState.KilledDuringLaunch, undefined),
				{ code: 1, message: `The terminal process "foo 'bar', 'baz'" failed to launch (exit code: 1).` }
			);
			deepStrictEqual(
				parseExitResult(1, { executable: 'foo', args: ['bar', 'baz'] }, ProcessState.KilledByUser, undefined),
				{ code: 1, message: `The terminal process "foo 'bar', 'baz'" terminated with exit code: 1.` }
			);
			deepStrictEqual(
				parseExitResult(1, { executable: 'foo', args: ['bar', 'baz'] }, ProcessState.KilledByProcess, undefined),
				{ code: 1, message: `The terminal process "foo 'bar', 'baz'" terminated with exit code: 1.` }
			);
		});
		test('should return friendly message when executable and arguments are omitted for non-zero exit codes', () => {
			deepStrictEqual(
				parseExitResult(1, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: 1, message: `The terminal process failed to launch (exit code: 1).` }
			);
			deepStrictEqual(
				parseExitResult(1, {}, ProcessState.KilledByUser, undefined),
				{ code: 1, message: `The terminal process terminated with exit code: 1.` }
			);
			deepStrictEqual(
				parseExitResult(1, {}, ProcessState.KilledByProcess, undefined),
				{ code: 1, message: `The terminal process terminated with exit code: 1.` }
			);
		});
		test('should ignore pty host-related errors', () => {
			deepStrictEqual(
				parseExitResult({ message: 'Could not find pty with id 16' }, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: undefined, message: undefined }
			);
		});
		test('should format conpty failure code 5', () => {
			deepStrictEqual(
				parseExitResult({ code: 5, message: 'A native exception occurred during launch (Cannot create process, error code: 5)' }, { executable: 'foo' }, ProcessState.KilledDuringLaunch, undefined),
				{ code: 5, message: `The terminal process failed to launch: Access was denied to the path containing your executable "foo". Manage and change your permissions to get this to work.` }
			);
		});
		test('should format conpty failure code 267', () => {
			deepStrictEqual(
				parseExitResult({ code: 267, message: 'A native exception occurred during launch (Cannot create process, error code: 267)' }, {}, ProcessState.KilledDuringLaunch, '/foo'),
				{ code: 267, message: `The terminal process failed to launch: Invalid starting directory "/foo", review your terminal.integrated.cwd setting.` }
			);
		});
		test('should format conpty failure code 1260', () => {
			deepStrictEqual(
				parseExitResult({ code: 1260, message: 'A native exception occurred during launch (Cannot create process, error code: 1260)' }, { executable: 'foo' }, ProcessState.KilledDuringLaunch, undefined),
				{ code: 1260, message: `The terminal process failed to launch: Windows cannot open this program because it has been prevented by a software restriction policy. For more information, open Event Viewer or contact your system Administrator.` }
			);
		});
		test('should format generic failures', () => {
			deepStrictEqual(
				parseExitResult({ code: 123, message: 'A native exception occurred during launch (Cannot create process, error code: 123)' }, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: 123, message: `The terminal process failed to launch: A native exception occurred during launch (Cannot create process, error code: 123).` }
			);
			deepStrictEqual(
				parseExitResult({ code: 123, message: 'foo' }, {}, ProcessState.KilledDuringLaunch, undefined),
				{ code: 123, message: `The terminal process failed to launch: foo.` }
			);
		});
	});
	suite('TerminalLabelComputer', () => {
		let instantiationService: TestInstantiationService;
		let capabilities: TerminalCapabilityStore;

		function createInstance(partial?: Partial<ITerminalInstance>): Pick<ITerminalInstance, 'shellLaunchConfig' | 'shellType' | 'userHome' | 'cwd' | 'initialCwd' | 'processName' | 'sequence' | 'workspaceFolder' | 'staticTitle' | 'capabilities' | 'title' | 'description'> {
			const capabilities = store.add(new TerminalCapabilityStore());
			if (!isWindows) {
				capabilities.add(TerminalCapability.NaiveCwdDetection, null!);
			}
			return {
				shellLaunchConfig: {},
				shellType: GeneralShellType.PowerShell,
				cwd: 'cwd',
				initialCwd: undefined,
				processName: '',
				sequence: undefined,
				workspaceFolder: undefined,
				staticTitle: undefined,
				capabilities,
				title: '',
				description: '',
				userHome: undefined,
				...partial
			};
		}

		setup(async () => {
			instantiationService = workbenchInstantiationService(undefined, store);
			capabilities = store.add(new TerminalCapabilityStore());
			if (!isWindows) {
				capabilities.add(TerminalCapability.NaiveCwdDetection, null!);
			}
		});

		function createLabelComputer(configuration: any) {
			instantiationService.set(IConfigurationService, new TestConfigurationService(configuration));
			instantiationService.set(ITerminalConfigurationService, store.add(instantiationService.createInstance(TerminalConfigurationService)));
			return store.add(instantiationService.createInstance(TerminalLabelComputer));
		}

		test('should resolve to "" when the template variables are empty', () => {
			const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '', description: '' } } } });
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: '' }));
			// TODO:
			// terminalLabelComputer.onLabelChanged(e => {
			// 	strictEqual(e.title, '');
			// 	strictEqual(e.description, '');
			// });
			strictEqual(terminalLabelComputer.title, '');
			strictEqual(terminalLabelComputer.description, '');
		});
		test('should resolve cwd', () => {
			const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '${cwd}', description: '${cwd}' } } } });
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, cwd: ROOT_1 }));
			strictEqual(terminalLabelComputer.title, ROOT_1);
			strictEqual(terminalLabelComputer.description, ROOT_1);
		});
		test('should resolve workspaceFolder', () => {
			const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '${workspaceFolder}', description: '${workspaceFolder}' } } } });
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: 'folder' }) } as IWorkspaceFolder }));
			strictEqual(terminalLabelComputer.title, 'folder');
			strictEqual(terminalLabelComputer.description, 'folder');
		});
		test('should resolve local', () => {
			const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '${local}', description: '${local}' } } } });
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh', shellLaunchConfig: { type: 'Local' } }));
			strictEqual(terminalLabelComputer.title, 'Local');
			strictEqual(terminalLabelComputer.description, 'Local');
		});
		test('should resolve process', () => {
			const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '${process}', description: '${process}' } } } });
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh' }));
			strictEqual(terminalLabelComputer.title, 'zsh');
			strictEqual(terminalLabelComputer.description, 'zsh');
		});
		test('should resolve sequence', () => {
			const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' - ', title: '${sequence}', description: '${sequence}' } } } });
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, sequence: 'sequence' }));
			strictEqual(terminalLabelComputer.title, 'sequence');
			strictEqual(terminalLabelComputer.description, 'sequence');
		});
		test('should resolve task', () => {
			const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${task}', description: '${task}' } } } });
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh', shellLaunchConfig: { type: 'Task' } }));
			strictEqual(terminalLabelComputer.title, 'zsh ~ Task');
			strictEqual(terminalLabelComputer.description, 'Task');
		});
		test('should resolve separator', () => {
			const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${separator}', description: '${separator}' } } } });
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'zsh', shellLaunchConfig: { type: 'Task' } }));
			strictEqual(terminalLabelComputer.title, 'zsh');
			strictEqual(terminalLabelComputer.description, '');
		});
		test('should always return static title when specified', () => {
			const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}', description: '${workspaceFolder}' } } } });
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: 'folder' }) } as IWorkspaceFolder, staticTitle: 'my-title' }));
			strictEqual(terminalLabelComputer.title, 'my-title');
			strictEqual(terminalLabelComputer.description, 'folder');
		});
		test('should provide cwdFolder for all cwds only when in multi-root', () => {
			const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${cwdFolder}', description: '${cwdFolder}' } } } });
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) } as IWorkspaceFolder, cwd: ROOT_1 }));
			// single-root, cwd is same as root
			strictEqual(terminalLabelComputer.title, 'process');
			strictEqual(terminalLabelComputer.description, '');
			// multi-root
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) } as IWorkspaceFolder, cwd: ROOT_2 }));
			if (isWindows) {
				strictEqual(terminalLabelComputer.title, 'process');
				strictEqual(terminalLabelComputer.description, '');
			} else {
				strictEqual(terminalLabelComputer.title, 'process ~ root2');
				strictEqual(terminalLabelComputer.description, 'root2');
			}
		});
		test('should hide cwdFolder in single folder workspaces when cwd matches the workspace\'s default cwd even when slashes differ', async () => {
			let terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${cwdFolder}', description: '${cwdFolder}' } } } });
			terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) } as IWorkspaceFolder, cwd: ROOT_1 }));
			strictEqual(terminalLabelComputer.title, 'process');
			strictEqual(terminalLabelComputer.description, '');
			if (!isWindows) {
				terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: ' ~ ', title: '${process}${separator}${cwdFolder}', description: '${cwdFolder}' } } } });
				terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: 'process', workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) } as IWorkspaceFolder, cwd: ROOT_2 }));
				strictEqual(terminalLabelComputer.title, 'process ~ root2');
				strictEqual(terminalLabelComputer.description, 'root2');
			}
		});
	});

	suite('getCwdResource', () => {
		let mockFileService: any;
		let mockPathService: any;

		function createMockTerminalInstance(options: {
			cwd?: string;
			remoteAuthority?: string;
			fileExists?: boolean;
		}): Pick<ITerminalInstance, 'getCwdResource' | 'capabilities' | 'remoteAuthority'> {
			const capabilities = store.add(new TerminalCapabilityStore());

			if (options.cwd) {
				const mockCwdDetection = {
					getCwd: () => options.cwd
				};
				capabilities.add(TerminalCapability.CwdDetection, mockCwdDetection as unknown as ICwdDetectionCapability);
			}

			// Mock file service
			mockFileService = {
				exists: async (resource: URI) => options.fileExists !== false
			};

			// Mock path service
			mockPathService = {
				fileURI: async (path: string) => {
					if (options.remoteAuthority) {
						return URI.parse(`vscode-remote://${options.remoteAuthority}${path}`);
					}
					return URI.file(path);
				}
			};

			return {
				capabilities,
				remoteAuthority: options.remoteAuthority,
				async getCwdResource(): Promise<URI | undefined> {
					const cwd = this.capabilities.get(TerminalCapability.CwdDetection)?.getCwd();
					if (!cwd) {
						return undefined;
					}
					let resource: URI;
					if (this.remoteAuthority) {
						resource = await mockPathService.fileURI(cwd);
					} else {
						resource = URI.file(cwd);
					}
					if (await mockFileService.exists(resource)) {
						return resource;
					}
					return undefined;
				}
			};
		}

		test('should return undefined when no CwdDetection capability', async () => {
			const instance = createMockTerminalInstance({});

			const result = await instance.getCwdResource();
			strictEqual(result, undefined);
		});

		test('should return undefined when CwdDetection capability returns no cwd', async () => {
			const instance = createMockTerminalInstance({ cwd: undefined });

			const result = await instance.getCwdResource();
			strictEqual(result, undefined);
		});

		test('should return URI.file for local terminal when file exists', async () => {
			const testCwd = '/test/path';
			const instance = createMockTerminalInstance({ cwd: testCwd, fileExists: true });

			const result = await instance.getCwdResource();
			strictEqual(result?.scheme, 'file');
			strictEqual(result?.path, testCwd);
		});

		test('should return undefined when file does not exist', async () => {
			const testCwd = '/test/nonexistent';
			const instance = createMockTerminalInstance({ cwd: testCwd, fileExists: false });

			const result = await instance.getCwdResource();
			strictEqual(result, undefined);
		});

		test('should use pathService.fileURI for remote terminal', async () => {
			const testCwd = '/test/remote/path';
			const instance = createMockTerminalInstance({
				cwd: testCwd,
				remoteAuthority: 'test-remote',
				fileExists: true
			});

			const result = await instance.getCwdResource();
			strictEqual(result?.scheme, 'vscode-remote');
			strictEqual(result?.authority, 'test-remote');
			strictEqual(result?.path, testCwd);
		});

		test('should handle Windows paths correctly', async () => {
			const testCwd = isWindows ? 'C:\\test\\path' : '/test/path';
			const instance = createMockTerminalInstance({ cwd: testCwd, fileExists: true });

			const result = await instance.getCwdResource();
			strictEqual(result?.scheme, 'file');
			if (isWindows) {
				strictEqual(result?.path, '/C:/test/path');
			} else {
				strictEqual(result?.path, testCwd);
			}
		});

		test('should handle empty cwd string', async () => {
			const instance = createMockTerminalInstance({ cwd: '' });

			const result = await instance.getCwdResource();
			strictEqual(result, undefined);
		});
	});
});
