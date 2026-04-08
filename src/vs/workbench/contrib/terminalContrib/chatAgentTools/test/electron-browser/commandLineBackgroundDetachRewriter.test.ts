/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { CommandLineBackgroundDetachRewriter } from '../../browser/tools/commandLineRewriter/commandLineBackgroundDetachRewriter.js';
import type { ICommandLineRewriterOptions } from '../../browser/tools/commandLineRewriter/commandLineRewriter.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';

suite('CommandLineBackgroundDetachRewriter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let rewriter: CommandLineBackgroundDetachRewriter;

	function createOptions(command: string, shell: string, os: OperatingSystem, isBackground?: boolean): ICommandLineRewriterOptions {
		return {
			commandLine: command,
			cwd: undefined,
			shell,
			os,
			isBackground,
		};
	}

	setup(() => {
		configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.DetachBackgroundProcesses, true);
		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService
		}, store);
		rewriter = store.add(instantiationService.createInstance(CommandLineBackgroundDetachRewriter));
	});

	test('should return undefined for foreground commands', () => {
		strictEqual(rewriter.rewrite(createOptions('echo hello', '/bin/bash', OperatingSystem.Linux, false)), undefined);
	});

	test('should return undefined when isBackground is not set', () => {
		strictEqual(rewriter.rewrite(createOptions('echo hello', '/bin/bash', OperatingSystem.Linux)), undefined);
	});

	test('should return undefined when setting is disabled', () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.DetachBackgroundProcesses, false);
		strictEqual(rewriter.rewrite(createOptions('python3 app.py', '/bin/bash', OperatingSystem.Linux, true)), undefined);
	});

	suite('POSIX (bash)', () => {
		test('should wrap with nohup on Linux', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('python3 app.py', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: 'nohup python3 app.py &',
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'python3 app.py',
			});
		});

		test('should wrap with nohup on macOS', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('flask run', '/bin/bash', OperatingSystem.Macintosh, true)), {
				rewritten: 'nohup flask run &',
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'flask run',
			});
		});
	});

	suite('POSIX (zsh)', () => {
		test('should wrap with nohup', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('node server.js', '/bin/zsh', OperatingSystem.Linux, true)), {
				rewritten: 'nohup node server.js &',
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'node server.js',
			});
		});
	});

	suite('POSIX (fish)', () => {
		test('should wrap with nohup', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('ruby app.rb', '/usr/bin/fish', OperatingSystem.Linux, true)), {
				rewritten: 'nohup ruby app.rb &',
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'ruby app.rb',
			});
		});
	});

	suite('Windows (PowerShell)', () => {
		test('should wrap with Start-Process for pwsh', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('python app.py', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', OperatingSystem.Windows, true)), {
				rewritten: 'Start-Process -WindowStyle Hidden -FilePath "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -ArgumentList "-NoProfile", "-Command", "python app.py"',
				reasoning: 'Wrapped background command with Start-Process to survive terminal shutdown',
				forDisplay: 'python app.py',
			});
		});

		test('should wrap with Start-Process for Windows PowerShell', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('node server.js', 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', OperatingSystem.Windows, true)), {
				rewritten: 'Start-Process -WindowStyle Hidden -FilePath "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -ArgumentList "-NoProfile", "-Command", "node server.js"',
				reasoning: 'Wrapped background command with Start-Process to survive terminal shutdown',
				forDisplay: 'node server.js',
			});
		});

		test('should escape double quotes in PowerShell commands', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('echo "hello world"', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', OperatingSystem.Windows, true)), {
				rewritten: 'Start-Process -WindowStyle Hidden -FilePath "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -ArgumentList "-NoProfile", "-Command", "echo \\"hello world\\""',
				reasoning: 'Wrapped background command with Start-Process to survive terminal shutdown',
				forDisplay: 'echo "hello world"',
			});
		});

		test('should return undefined for non-PowerShell Windows shell', () => {
			strictEqual(rewriter.rewrite(createOptions('echo hello', 'cmd.exe', OperatingSystem.Windows, true)), undefined);
		});
	});
});
