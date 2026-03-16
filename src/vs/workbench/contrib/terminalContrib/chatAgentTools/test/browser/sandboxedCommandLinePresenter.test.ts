/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { SandboxedCommandLinePresenter } from '../../browser/tools/commandLinePresenter/sandboxedCommandLinePresenter.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import type { ISandboxRuntimeConfig } from '../../../../../../platform/sandbox/common/sandboxHelperIpc.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';

suite('SandboxedCommandLinePresenter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	class TestTerminalSandboxService implements ITerminalSandboxService {
		readonly _serviceBrand: undefined;

		constructor(private readonly _enabled: boolean) { }

		async isEnabled(): Promise<boolean> {
			return this._enabled;
		}

		async promptToAllowWritePath(_path: string): Promise<boolean> {
			return false;
		}

		async wrapCommand(command: string): Promise<string> {
			return command;
		}

		async wrapWithSandbox(_runtimeConfig: ISandboxRuntimeConfig, command: string): Promise<string> {
			return command;
		}
	}

	const createPresenter = (enabled: boolean = true) => {
		instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ITerminalSandboxService, new TestTerminalSandboxService(enabled));
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

	test('should prefer the original command line when provided', async () => {
		const presenter = createPresenter();
		const result = await presenter.present({
			commandLine: { forDisplay: 'wrapped', original: 'echo hello' },
			shell: 'bash',
			os: OperatingSystem.Linux
		});
		ok(result);
		strictEqual(result.commandLine, 'echo hello');
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
