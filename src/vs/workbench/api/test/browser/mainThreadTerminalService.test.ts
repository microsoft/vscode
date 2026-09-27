/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../base/browser/window.js';
import { timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ITerminalInstanceService, ITerminalService } from '../../../contrib/terminal/browser/terminal.js';
import { TerminalInstanceService } from '../../../contrib/terminal/browser/terminalInstanceService.js';
import { TerminalService } from '../../../contrib/terminal/browser/terminalService.js';
import { ITerminalProfileService } from '../../../contrib/terminal/common/terminal.js';
import { TestViewDescriptorService } from '../../../contrib/terminal/test/browser/xterm/xtermTerminal.test.js';
import { ITerminalLinkProviderService } from '../../../contrib/terminalContrib/links/browser/links.js';
import { ITerminalQuickFixService } from '../../../contrib/terminalContrib/quickFix/browser/quickFix.js';
import { ITerminalCompletionService } from '../../../contrib/terminalContrib/suggest/browser/terminalCompletionService.js';
import { TestTerminalProfileService, workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { MainThreadTerminalService } from '../../browser/mainThreadTerminalService.js';
import { ExtHostTerminalServiceShape } from '../../common/extHost.protocol.js';
import { AnyCallRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadTerminalService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let service: MainThreadTerminalService;
	let terminals: TerminalService;
	let input: string[];

	setup(() => {
		input = [];
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				files: {},
				terminal: {
					integrated: {
						allowInUntrustedWorkspace: true,
						fontFamily: 'monospace',
						scrollback: 1000,
						fastScrollSensitivity: 2,
						mouseWheelScrollSensitivity: 1,
						unicodeVersion: '6',
						commandsToSkipShell: [],
						shellIntegration: { enabled: false },
						tabs: { title: '${process}', description: '' }
					}
				}
			})
		}, store);
		instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
		instantiationService.set(ITerminalProfileService, new class extends TestTerminalProfileService {
			override async getContributedDefaultProfile() { return undefined; }
			override refreshAvailableProfiles() { }
			override getDefaultProfileName() { return undefined; }
		});
		instantiationService.set(ITerminalInstanceService, store.add(instantiationService.createInstance(TerminalInstanceService)));
		terminals = store.add(instantiationService.createInstance(TerminalService));
		terminals.registerProcessSupport(true);
		instantiationService.set(ITerminalService, terminals);
		// These provider registries are not used by terminal creation or disposal.
		instantiationService.stub(ITerminalLinkProviderService, {});
		instantiationService.stub(ITerminalQuickFixService, {});
		instantiationService.stub(ITerminalCompletionService, {});
		service = store.add(instantiationService.createInstance(MainThreadTerminalService, AnyCallRPCProtocol<Pick<ExtHostTerminalServiceShape, '$startExtensionTerminal' | '$acceptProcessInput'>>({
			$startExtensionTerminal: async id => {
				service.$sendProcessReady(id, -1, '', undefined);
				return undefined;
			},
			$acceptProcessInput: (_id, data) => input.push(data)
		})));
	});

	test('releases the launch request after an API terminal closes', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip(); // Run the Electron suite with --js-flags=--expose-gc.
		}
		async function createAndClose() {
			const request = { name: 'Lifecycle test', shellPath: '/test-shell', hideFromUser: true };
			await service.$createTerminal('closed-terminal', request);
			const terminal = terminals.instances[0];
			await terminal.xtermReadyPromise;
			await service.$dispose('closed-terminal');
			assert.strictEqual(terminal.isDisposed, true);
			return new WeakRef(request);
		}
		const request = await createAndClose();
		// Process creation queues idle work. Let that complete before checking lifetime ownership.
		await new Promise<void>(resolve => mainWindow.requestIdleCallback(() => resolve()));
		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });
		assert.strictEqual(request.deref(), undefined, 'The closed terminal launch request is still retained');
	});

	test('closing one API terminal preserves a live terminal', async () => {
		await service.$createTerminal('closed-terminal', { name: 'Closed', hideFromUser: true, isExtensionCustomPtyTerminal: true });
		await service.$createTerminal('live-terminal', { name: 'Live', hideFromUser: true, isExtensionCustomPtyTerminal: true });
		const instances = [...terminals.instances];
		try {
			await Promise.all(instances.map(instance => instance.processReady));
			await service.$dispose('closed-terminal');
			await service.$dispose('closed-terminal');
			await service.$show('closed-terminal', false);
			await service.$sendText('closed-terminal', 'discarded', false);
			await service.$sendText('live-terminal', 'delivered', false);
			assert.deepStrictEqual({ input, disposed: instances.map(instance => instance.isDisposed) }, { input: ['delivered'], disposed: [true, false] });
		} finally {
			instances.forEach(instance => instance.dispose());
		}
	});

	test('a terminal closed outside the API no longer resolves its extension identifier', async () => {
		await service.$createTerminal('user-closed-terminal', { name: 'Closed by user', shellPath: '/test-shell', hideFromUser: true });
		const terminal = terminals.instances[0];
		terminal.dispose();
		await service.$show('user-closed-terminal', false);
		assert.strictEqual(terminals.instances.length, 0);
	});

	test('a process exit removes the extension identifier', async () => {
		await service.$createTerminal('exited-terminal', { name: 'Exited', hideFromUser: true, isExtensionCustomPtyTerminal: true });
		const terminal = terminals.instances[0];
		try {
			await terminal.processReady;
			const disposed = Event.toPromise(terminal.onDisposed);
			service.$sendProcessExit(terminal.instanceId, 0);
			await disposed;
			await service.$show('exited-terminal', false);
			assert.strictEqual(terminals.instances.length, 0);
		} finally {
			terminal.dispose();
		}
	});
});
