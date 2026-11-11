/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../base/common/event.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { IProcessEnvironment } from '../../base/common/platform.js';
import { URI } from '../../base/common/uri.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { ITerminalBackend, ITerminalBackendRegistry, IProcessReadyEvent, IProcessProperty, ProcessPropertyType, TerminalExtensions, ITerminalProcessOptions, IShellLaunchConfig } from '../../platform/terminal/common/terminal.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../workbench/common/contributions.js';
import { ITerminalService } from '../../workbench/contrib/terminal/browser/terminal.js';

/**
 * Registers an in-memory terminal backend so E2E scenarios that open a
 * terminal do not need a pty host. Loaded only by the desktop web test entry
 * point: the mobile bundle ships no terminal service.
 */
class MockTerminalBackendContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.test.mockTerminalBackend';

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService,
	) {
		super();
		this.registerMockTerminalBackend();
	}

	private registerMockTerminalBackend(): void {
		const backend = this.createMockTerminalBackend();
		Registry.as<ITerminalBackendRegistry>(TerminalExtensions.Backend).registerTerminalBackend(backend);
		this.terminalService.registerProcessSupport(true);
		console.log('[Sessions Web Test] Registered mock terminal backend');
	}

	private createMockTerminalBackend(): ITerminalBackend {
		return {
			remoteAuthority: undefined,
			isResponsive: true,
			whenReady: Promise.resolve(),
			setReady: () => { },
			onDidRequestDetach: Event.None,
			attachToProcess: async () => { throw new Error('Not supported'); },
			attachToRevivedProcess: async () => { throw new Error('Not supported'); },
			listProcesses: async () => [],
			getProfiles: async () => [],
			getDefaultSystemShell: async () => '/bin/mock-shell',
			getShellEnvironment: async () => ({}),
			setTerminalLayoutInfo: async () => { },
			getTerminalLayoutInfo: async () => undefined,
			reduceConnectionGraceTime: async () => { },
			requestDetachInstance: async () => undefined,
			acceptDetachInstanceReply: async () => { },
			persistTerminalState: async () => { },
			createProcess: async (_shellLaunchConfig: IShellLaunchConfig, _cwd: string | URI, _cols: number, _rows: number, _unicodeVersion: string, _env: IProcessEnvironment, _options: ITerminalProcessOptions, _shouldPersist: boolean) => {
				const onProcessData = new Emitter<string>();
				const onProcessReady = new Emitter<IProcessReadyEvent>();
				const onProcessExit = new Emitter<number | undefined>();
				const onDidChangeHasChildProcesses = new Emitter<boolean>();
				const onDidChangeProperty = new Emitter<IProcessProperty<ProcessPropertyType>>();

				// Resolve cwd from createProcess arg or shellLaunchConfig
				const rawCwd = _cwd || _shellLaunchConfig.cwd;
				const cwd = !rawCwd ? '/' : typeof rawCwd === 'string' ? rawCwd : rawCwd.path;
				console.log(`[Sessions Web Test] Mock terminal createProcess cwd: '${cwd}' (raw _cwd: '${_cwd}', slc.cwd: '${_shellLaunchConfig.cwd}')`);

				// Fire ready after a microtask so the terminal service can wire up listeners
				setTimeout(() => {
					onProcessReady.fire({ pid: 1, cwd, windowsPty: undefined });
				}, 0);

				return {
					id: 0,
					shouldPersist: false,
					onProcessData: onProcessData.event,
					onProcessReady: onProcessReady.event,
					onDidChangeHasChildProcesses: onDidChangeHasChildProcesses.event,
					onDidChangeProperty: onDidChangeProperty.event,
					onProcessExit: onProcessExit.event,
					start: async () => undefined,
					shutdown: async () => { },
					input: async () => { },
					sendSignal: () => { },
					resize: () => { },
					clearBuffer: () => { },
					acknowledgeDataEvent: () => { },
					setUnicodeVersion: async () => { },
					getInitialCwd: async () => cwd,
					getCwd: async () => cwd,
					getLatency: async () => [],
					processBinary: async () => { },
					refreshProperty: async (property: ProcessPropertyType) => { throw new Error(`Not supported: ${property}`); },
					updateProperty: async () => { },
					clearUnrespondedRequest: () => { },
				};
			},
			getWslPath: async (original: string, _direction: 'unix-to-win' | 'win-to-unix') => original,
			getEnvironment: async () => ({}),
			getLatency: async () => [],
			getPerformanceMarks: async () => [],
			updateTitle: async () => { },
			updateIcon: async () => { },
			setNextCommandId: async () => { },
			restartPtyHost: () => { },
			installAutoReply: async () => { },
			uninstallAllAutoReplies: async () => { },
			onPtyHostUnresponsive: Event.None,
			onPtyHostResponsive: Event.None,
			onPtyHostRestart: Event.None,
		};
	}

}

registerWorkbenchContribution2(MockTerminalBackendContribution.ID, MockTerminalBackendContribution, WorkbenchPhase.BlockStartup);
