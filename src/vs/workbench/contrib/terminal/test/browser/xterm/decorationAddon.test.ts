/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDecoration, IDecorationOptions, Terminal as RawXtermTerminal } from '@xterm/xterm';
import { notEqual, strictEqual, throws } from 'assert';
import { importAMDNodeModule } from '../../../../../../amdX.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ITerminalCommand, TerminalCapability, CommandInvalidationReason } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { CommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { DecorationAddon } from '../../../browser/xterm/decorationAddon.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

suite('DecorationAddon', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let decorationAddon: DecorationAddon;
	let xterm: RawXtermTerminal;

	setup(async () => {
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		class TestTerminal extends TerminalCtor {
			override registerDecoration(decorationOptions: IDecorationOptions): IDecoration | undefined {
				if (decorationOptions.marker.isDisposed) {
					return undefined;
				}
				const element = document.createElement('div');
				return { marker: decorationOptions.marker, element, onDispose: () => { }, isDisposed: false, dispose: () => { }, onRender: (element: HTMLElement) => { return element; } } as unknown as IDecoration;
			}
		}

		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				files: {},
				workbench: {
					hover: { delay: 5 },
				},
				terminal: {
					integrated: {
						shellIntegration: {
							decorationsEnabled: 'both'
						}
					}
				}
			})
		}, store);
		xterm = store.add(new TestTerminal({
			allowProposedApi: true,
			cols: 80,
			rows: 30
		}));
		const capabilities = store.add(new TerminalCapabilityStore());
		capabilities.add(TerminalCapability.CommandDetection, store.add(instantiationService.createInstance(CommandDetectionCapability, xterm)));
		decorationAddon = store.add(instantiationService.createInstance(DecorationAddon, capabilities));
		xterm.loadAddon(decorationAddon);
	});

	suite('registerDecoration', () => {
		test('should throw when command has no marker', async () => {
			throws(() => decorationAddon.registerCommandDecoration({ command: 'cd src', timestamp: Date.now(), hasOutput: () => false } as ITerminalCommand));
		});
		test('should return undefined when marker has been disposed of', async () => {
			const marker = xterm.registerMarker(1);
			marker?.dispose();
			strictEqual(decorationAddon.registerCommandDecoration({ command: 'cd src', marker, timestamp: Date.now(), hasOutput: () => false } as ITerminalCommand), undefined);
		});
		test('should return decoration when marker has not been disposed of', async () => {
			const marker = xterm.registerMarker(2);
			notEqual(decorationAddon.registerCommandDecoration({ command: 'cd src', marker, timestamp: Date.now(), hasOutput: () => false } as ITerminalCommand), undefined);
		});
		test('should return decoration with mark properties', async () => {
			const marker = xterm.registerMarker(2);
			notEqual(decorationAddon.registerCommandDecoration(undefined, undefined, { marker }), undefined);
		});
		test('should clean up decorations when commands are invalidated', async () => {
			// Create some test commands with decorations
			const marker1 = xterm.registerMarker(1);
			const marker2 = xterm.registerMarker(2);
			const command1: ITerminalCommand = { command: 'ls', marker: marker1, timestamp: Date.now(), hasOutput: () => false, exitCode: 0 } as ITerminalCommand;
			const command2: ITerminalCommand = { command: 'pwd', marker: marker2, timestamp: Date.now(), hasOutput: () => false, exitCode: 0 } as ITerminalCommand;
			
			decorationAddon.registerCommandDecoration(command1);
			decorationAddon.registerCommandDecoration(command2);
			
			// Access the private _decorations map to verify the fix
			const decorations = (decorationAddon as any)._decorations;
			strictEqual(decorations.size, 2);
			
			// Get the command detection capability to simulate invalidation
			const capabilities = (decorationAddon as any)._capabilities;
			const capability = capabilities.get(TerminalCapability.CommandDetection) as CommandDetectionCapability;
			
			// Simulate command invalidation (like when terminal is cleared)
			(capability as any)._onCommandInvalidated.fire([command1, command2]);
			
			// Verify decorations map is properly cleaned up
			strictEqual(decorations.size, 0);
		});
		test('should clean up last decoration when current command is invalidated', async () => {
			// Create some test commands with decorations
			const marker1 = xterm.registerMarker(1);
			const marker2 = xterm.registerMarker(2);
			const command1: ITerminalCommand = { command: 'ls', marker: marker1, timestamp: Date.now(), hasOutput: () => false, exitCode: 0 } as ITerminalCommand;
			const command2: ITerminalCommand = { command: 'pwd', marker: marker2, timestamp: Date.now(), hasOutput: () => false, exitCode: 0 } as ITerminalCommand;
			
			decorationAddon.registerCommandDecoration(command1);
			decorationAddon.registerCommandDecoration(command2);
			
			// Access the private _decorations map to verify the fix
			const decorations = (decorationAddon as any)._decorations;
			strictEqual(decorations.size, 2);
			
			// Get the command detection capability to simulate invalidation
			const capabilities = (decorationAddon as any)._capabilities;
			const capability = capabilities.get(TerminalCapability.CommandDetection) as CommandDetectionCapability;
			
			// Simulate current command invalidation with NoProblemsReported reason
			(capability as any)._onCurrentCommandInvalidated.fire({ reason: CommandInvalidationReason.NoProblemsReported });
			
			// Verify last decoration was cleaned up
			strictEqual(decorations.size, 1);
		});
		test('should clear placeholder decoration when commands are invalidated', async () => {
			// Create a placeholder decoration (before command execution)
			const marker = xterm.registerMarker(1);
			const command: ITerminalCommand = { command: 'ls', marker, timestamp: Date.now(), hasOutput: () => false, exitCode: undefined } as ITerminalCommand;
			
			// Register as placeholder decoration (beforeCommandExecution = true)
			decorationAddon.registerCommandDecoration(command, true);
			
			// Verify placeholder decoration exists
			const placeholderDecoration = (decorationAddon as any)._placeholderDecoration;
			notEqual(placeholderDecoration, undefined);
			
			// Get the command detection capability to simulate invalidation
			const capabilities = (decorationAddon as any)._capabilities;
			const capability = capabilities.get(TerminalCapability.CommandDetection) as CommandDetectionCapability;
			
			// Simulate command invalidation (like when terminal is cleared)
			(capability as any)._onCommandInvalidated.fire([command]);
			
			// Verify placeholder decoration was cleared
			const placeholderAfter = (decorationAddon as any)._placeholderDecoration;
			strictEqual(placeholderAfter, undefined);
		});
	});
});
