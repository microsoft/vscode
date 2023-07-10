/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { notEqual, strictEqual, throws } from 'assert';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { DecorationAddon } from 'vs/workbench/contrib/terminal/browser/xterm/decorationAddon';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import type { IDecoration, IDecorationOptions } from 'xterm';
import { ITerminalCommand, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { CommandDetectionCapability } from 'vs/platform/terminal/common/capabilities/commandDetectionCapability';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { TestLifecycleService } from 'vs/workbench/test/browser/workbenchTestServices';
import { importAMDNodeModule } from 'vs/amdX';

suite('DecorationAddon', async () => {

	const TerminalCtor = (await importAMDNodeModule<typeof import('xterm')>('xterm', 'lib/xterm.js')).Terminal;
	class TestTerminal extends TerminalCtor {
		override registerDecoration(decorationOptions: IDecorationOptions): IDecoration | undefined {
			if (decorationOptions.marker.isDisposed) {
				return undefined;
			}
			const element = document.createElement('div');
			return { marker: decorationOptions.marker, element, onDispose: () => { }, isDisposed: false, dispose: () => { }, onRender: (element: HTMLElement) => { return element; } } as unknown as IDecoration;
		}
	}

	let decorationAddon: DecorationAddon;
	let xterm: TestTerminal;

	setup(() => {
		const instantiationService = new TestInstantiationService();
		const configurationService = new TestConfigurationService({
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
		});
		instantiationService.stub(IThemeService, new TestThemeService());
		xterm = new TestTerminal({
			allowProposedApi: true,
			cols: 80,
			rows: 30
		});
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextMenuService, instantiationService.createInstance(ContextMenuService));
		instantiationService.stub(ILogService, NullLogService);
		const capabilities = new TerminalCapabilityStore();
		capabilities.add(TerminalCapability.CommandDetection, instantiationService.createInstance(CommandDetectionCapability, xterm));
		instantiationService.stub(ILifecycleService, new TestLifecycleService());
		decorationAddon = instantiationService.createInstance(DecorationAddon, capabilities);
		xterm.loadAddon(decorationAddon);
	});

	suite('registerDecoration', async () => {
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
	});
});
