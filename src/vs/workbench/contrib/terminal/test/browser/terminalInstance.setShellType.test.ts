/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { GeneralShellType, ITerminalChildProcess, ITerminalProfile, PosixShellType } from '../../../../../platform/terminal/common/terminal.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { ITerminalInstanceService } from '../../browser/terminal.js';
import { TerminalInstance } from '../../browser/terminalInstance.js';
import { IEnvironmentVariableService } from '../../common/environmentVariable.js';
import { EnvironmentVariableService } from '../../common/environmentVariableService.js';
import { ITerminalProfileResolverService } from '../../common/terminal.js';
import { TestViewDescriptorService } from './xterm/xtermTerminal.test.js';
import { TestTerminalProfileResolverService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

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

suite('TerminalInstance - Shell Type Detection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('PowerShell to undefined shell transition', () => {
		let instantiationService: TestInstantiationService;

		setup(async () => {
			instantiationService = workbenchInstantiationService({
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
		});

		test('should handle PowerShell to R transition', async () => {
			const terminalInstance = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, {}));

			// Track shell type changes
			const shellTypeChanges: Array<any> = [];
			terminalInstance.onDidChangeShellType((shellType) => {
				shellTypeChanges.push(shellType);
			});

			// Initially should be undefined
			strictEqual(terminalInstance.shellType, undefined);

			// Simulate starting PowerShell
			terminalInstance.setShellType(GeneralShellType.PowerShell);
			strictEqual(terminalInstance.shellType, GeneralShellType.PowerShell);
			strictEqual(shellTypeChanges.length, 1);
			strictEqual(shellTypeChanges[0], GeneralShellType.PowerShell);

			// Simulate starting R from within PowerShell (should set shell type to undefined)
			terminalInstance.setShellType(undefined);
			strictEqual(terminalInstance.shellType, undefined);
			strictEqual(shellTypeChanges.length, 2);
			strictEqual(shellTypeChanges[1], undefined);
		});

		test('should handle zsh to R transition for comparison', async () => {
			const terminalInstance = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, {}));

			// Track shell type changes
			const shellTypeChanges: Array<any> = [];
			terminalInstance.onDidChangeShellType((shellType) => {
				shellTypeChanges.push(shellType);
			});

			// Initially should be undefined
			strictEqual(terminalInstance.shellType, undefined);

			// Simulate starting zsh
			terminalInstance.setShellType(PosixShellType.Zsh);
			strictEqual(terminalInstance.shellType, PosixShellType.Zsh);
			strictEqual(shellTypeChanges.length, 1);
			strictEqual(shellTypeChanges[0], PosixShellType.Zsh);

			// Simulate starting R from within zsh (should set shell type to undefined)
			terminalInstance.setShellType(undefined);
			strictEqual(terminalInstance.shellType, undefined);
			strictEqual(shellTypeChanges.length, 2);
			strictEqual(shellTypeChanges[1], undefined);
		});

		test('should detect shell type changes on data events for PowerShell', async () => {
			const terminalInstance = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, {}));

			// Track shell type changes
			const shellTypeChanges: Array<any> = [];
			terminalInstance.onDidChangeShellType((shellType) => {
				shellTypeChanges.push(shellType);
			});

			// Initially should be undefined
			strictEqual(terminalInstance.shellType, undefined);

			// Simulate PowerShell starting
			terminalInstance.setShellType(GeneralShellType.PowerShell);
			strictEqual(terminalInstance.shellType, GeneralShellType.PowerShell);
			strictEqual(shellTypeChanges.length, 1);

			// Simulate R starting from PowerShell (this should trigger shell type change to undefined)
			// This simulates the scenario where process title changes from "pwsh" to "R"
			// but the change might be missed by the title polling mechanism
			terminalInstance.setShellType(undefined);
			strictEqual(terminalInstance.shellType, undefined);
			strictEqual(shellTypeChanges.length, 2);
			strictEqual(shellTypeChanges[1], undefined);

			// Verify that going back to PowerShell works
			terminalInstance.setShellType(GeneralShellType.PowerShell);
			strictEqual(terminalInstance.shellType, GeneralShellType.PowerShell);
			strictEqual(shellTypeChanges.length, 3);
			strictEqual(shellTypeChanges[2], GeneralShellType.PowerShell);
		});
			const terminalInstance = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, {}));

			// Track shell type changes
			const shellTypeChanges: Array<any> = [];
			terminalInstance.onDidChangeShellType((shellType) => {
				shellTypeChanges.push(shellType);
			});

			// Test various transitions
			terminalInstance.setShellType(GeneralShellType.PowerShell);
			terminalInstance.setShellType(undefined);  // PowerShell -> undefined
			terminalInstance.setShellType(PosixShellType.Zsh);
			terminalInstance.setShellType(undefined);  // zsh -> undefined
			terminalInstance.setShellType(GeneralShellType.Python);
			terminalInstance.setShellType(undefined);  // Python -> undefined

			// Should have fired 6 events (3 sets of transitions)
			strictEqual(shellTypeChanges.length, 6);
			strictEqual(shellTypeChanges[0], GeneralShellType.PowerShell);
			strictEqual(shellTypeChanges[1], undefined);
			strictEqual(shellTypeChanges[2], PosixShellType.Zsh);
			strictEqual(shellTypeChanges[3], undefined);
			strictEqual(shellTypeChanges[4], GeneralShellType.Python);
			strictEqual(shellTypeChanges[5], undefined);
		});
	});
});