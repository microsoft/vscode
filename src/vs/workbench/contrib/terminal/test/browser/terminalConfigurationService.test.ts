/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { notStrictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import type { ITerminalConfigurationService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalConfigurationService } from 'vs/workbench/contrib/terminal/browser/terminalConfigurationService';


suite('Workbench - TerminalConfigurationService', () => {
	let configurationService: TestConfigurationService;
	let terminalConfigurationService: ITerminalConfigurationService;

	setup(() => {
		const instantiationService = new TestInstantiationService();
		configurationService = new TestConfigurationService();
		instantiationService.set(IConfigurationService, configurationService);
		terminalConfigurationService = instantiationService.createInstance(TerminalConfigurationService);
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('config', () => {
		test('should update on any change to terminal.integrated', () => {
			const originalConfig = terminalConfigurationService.config;
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: configuration => configuration.startsWith('terminal.integrated'),
				affectedKeys: new Set(['terminal.integrated.fontWeight']),
				change: null!,
				source: ConfigurationTarget.USER
			});
			notStrictEqual(terminalConfigurationService.config, originalConfig, 'Object reference must change');
		});

		suite('onConfigChanged', () => {
			test('should fire on any change to terminal.integrated', async () => {
				await new Promise<void>(r => {
					store.add(terminalConfigurationService.onConfigChanged(() => r()));
					configurationService.onDidChangeConfigurationEmitter.fire({
						affectsConfiguration: configuration => configuration.startsWith('terminal.integrated'),
						affectedKeys: new Set(['terminal.integrated.fontWeight']),
						change: null!,
						source: ConfigurationTarget.USER
					});
				});
			});
		});
	});
});
