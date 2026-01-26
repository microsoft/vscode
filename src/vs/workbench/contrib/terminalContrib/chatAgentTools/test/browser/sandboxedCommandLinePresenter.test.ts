/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { SandboxedCommandLinePresenter } from '../../browser/tools/commandLinePresenter/sandboxedCommandLinePresenter.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';

suite('SandboxedCommandLinePresenter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	const createPresenter = (enabled: boolean = true) => {
		instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ITerminalSandboxService, {
			_serviceBrand: undefined,
			isEnabled: async () => enabled,
			wrapCommand: command => command,
			getSandboxConfigPath: async () => '/tmp/sandbox.json',
			getTempDir: () => undefined,
			setNeedsForceUpdateConfigFile: () => { },
		});
		return instantiationService.createInstance(SandboxedCommandLinePresenter);
	};

	test('should return command line when sandboxing is enabled', async () => {
		const presenter = createPresenter();
		const commandLine = 'ELECTRON_RUN_AS_NODE=1 "/path/to/electron" "/path/to/srt/cli.js" TMPDIR=/tmp --settings "/tmp/sandbox.json" -c "echo hello"';
		const result = await presenter.present({
			commandLine: { forDisplay: commandLine },
			shell: 'bash',
			os: OperatingSystem.Linux
		});
		ok(result);
		strictEqual(result.commandLine, commandLine);
		strictEqual(result.language, undefined);
		strictEqual(result.languageDisplayName, undefined);
	});

	test('should return command line for non-sandboxed command when enabled', async () => {
		const presenter = createPresenter();
		const commandLine = 'echo hello';
		const result = await presenter.present({
			commandLine: { forDisplay: commandLine },
			shell: 'bash',
			os: OperatingSystem.Linux
		});
		ok(result);
		strictEqual(result.commandLine, commandLine);
		strictEqual(result.language, undefined);
		strictEqual(result.languageDisplayName, undefined);
	});

	test('should return undefined when sandboxing is disabled', async () => {
		const presenter = createPresenter(false);
		const result = await presenter.present({
			commandLine: { forDisplay: 'ELECTRON_RUN_AS_NODE=1 "/path/to/electron" "/path/to/srt/cli.js" TMPDIR=/tmp --settings "/tmp/sandbox.json" -c "echo hello"' },
			shell: 'bash',
			os: OperatingSystem.Linux
		});
		strictEqual(result, undefined);
	});
});
