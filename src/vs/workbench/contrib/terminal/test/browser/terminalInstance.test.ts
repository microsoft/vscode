/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { ITerminalChildProcess, ITerminalProfile } from 'vs/platform/terminal/common/terminal';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { ITerminalConfigurationService, ITerminalInstance, ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalConfigurationService } from 'vs/workbench/contrib/terminal/browser/terminalConfigurationService';
import { parseExitResult, TerminalInstance, TerminalLabelComputer } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { IEnvironmentVariableService } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { EnvironmentVariableService } from 'vs/workbench/contrib/terminal/common/environmentVariableService';
import { ITerminalProfileResolverService, ProcessState } from 'vs/workbench/contrib/terminal/common/terminal';
import { TestViewDescriptorService } from 'vs/workbench/contrib/terminal/test/browser/xterm/xtermTerminal.test';
import { fixPath } from 'vs/workbench/services/search/test/browser/queryBuilder.test';
import { TestTerminalProfileResolverService, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

const root1 = '/foo/root1';
const ROOT_1 = fixPath(root1);
const root2 = '/foo/root2';
const ROOT_2 = fixPath(root2);

class MockTerminalProfileResolverService extends TestTerminalProfileResolverService {
	override async getDefaultProfile(): Promise<ITerminalProfile> {
		return {
			profileName: "my-sh",
			path: "/usr/bin/zsh",
			env: {
				TEST: "TEST",
			},
			isDefault: true,
			isUnsafePath: false,
			isFromPath: true,
			icon: {
				id: "terminal-linux",
			},
			color: "terminal.ansiYellow",
		};
	}
}

const terminalShellTypeContextKey = {
	set: () => { },
	reset: () => { },
	get: () => undefined
};

const terminalInRunCommandPicker = {
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

	onProcessOverrideDimensions?: Event<any> | undefined;
	onProcessResolvedShellLaunchConfig?: Event<any> | undefined;
	onDidChangeHasChildProcesses?: Event<any> | undefined;

	onDidChangeProperty = Event.None;
	onProcessData = Event.None;
	onProcessExit = Event.None;
	onProcessReady = Event.None;
	onProcessTitleChanged = Event.None;
	onProcessShellTypeChanged = Event.None;
	async start(): Promise<undefined> { return undefined; }
	shutdown(immediate: boolean): void { }
	input(data: string): void { }
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
	getBackend() {
		return {
			onPtyHostExit: Event.None,
			onPtyHostUnresponsive: Event.None,
			onPtyHostResponsive: Event.None,
			onPtyHostRestart: Event.None,
			onDidMoveWindowInstance: Event.None,
			onDidRequestDetach: Event.None,
			createProcess: (
				shellLaunchConfig: any,
				cwd: string,
				cols: number,
				rows: number,
				unicodeVersion: '6' | '11',
				env: any,
				windowsEnableConpty: boolean,
				shouldPersist: boolean
			) => this._register(new TestTerminalChildProcess(shouldPersist)),
			getLatency: () => Promise.resolve([])
		} as any;
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
							},
						}
					},
				})
			}, store);
			instantiationService.set(ITerminalProfileResolverService, new MockTerminalProfileResolverService());
			instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
			instantiationService.stub(IEnvironmentVariableService, store.add(instantiationService.createInstance(EnvironmentVariableService)));
			instantiationService.stub(ITerminalInstanceService, store.add(new TestTerminalInstanceService()));
			terminalInstance = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, terminalInRunCommandPicker, {}));
			// //Wait for the teminalInstance._xtermReadyPromise to resolve
			await new Promise(resolve => setTimeout(resolve, 100));
			deepStrictEqual(terminalInstance.shellLaunchConfig.env, { TEST: 'TEST' });
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

		function createInstance(partial?: Partial<ITerminalInstance>): Pick<ITerminalInstance, 'shellLaunchConfig' | 'userHome' | 'cwd' | 'initialCwd' | 'processName' | 'sequence' | 'workspaceFolder' | 'staticTitle' | 'capabilities' | 'title' | 'description'> {
			const capabilities = store.add(new TerminalCapabilityStore());
			if (!isWindows) {
				capabilities.add(TerminalCapability.NaiveCwdDetection, null!);
			}
			return {
				shellLaunchConfig: {},
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
});
