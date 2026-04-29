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

		test('should not duplicate trailing & when command already backgrounds itself', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('pypi-server ... &', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: 'nohup pypi-server ... &',
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'pypi-server ... &',
			});
		});

		test('should not duplicate trailing & when command ends with chained background command', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('cd /app && python3 service.py &', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: 'nohup cd /app && python3 service.py &',
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'cd /app && python3 service.py &',
			});
		});

		test('should trim trailing whitespace before detecting existing &', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('node server.js &   ', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: 'nohup node server.js &',
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'node server.js &   ',
			});
		});
	});

	suite('POSIX shell -c wrapping for compound commands and builtins', () => {
		test('for loop should be wrapped using bash shell path', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('for i in $(seq 1 90); do echo $i; sleep 1; done', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: `nohup /bin/bash -c 'for i in $(seq 1 90); do echo $i; sleep 1; done' &`,
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'for i in $(seq 1 90); do echo $i; sleep 1; done',
			});
		});

		test('while loop should be wrapped in shell -c', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('while true; do sleep 1; done', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: `nohup /bin/bash -c 'while true; do sleep 1; done' &`,
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'while true; do sleep 1; done',
			});
		});

		test('if statement should be wrapped in shell -c', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('if [ -f file ]; then cat file; fi', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: `nohup /bin/bash -c 'if [ -f file ]; then cat file; fi' &`,
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'if [ -f file ]; then cat file; fi',
			});
		});

		test('eval builtin should be wrapped in shell -c', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('eval $SETUP_ENV && opam install coq --yes', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: `nohup /bin/bash -c 'eval $SETUP_ENV && opam install coq --yes' &`,
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'eval $SETUP_ENV && opam install coq --yes',
			});
		});

		test('set builtin should be wrapped in shell -c', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('set -e; cmd1; cmd2', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: `nohup /bin/bash -c 'set -e; cmd1; cmd2' &`,
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'set -e; cmd1; cmd2',
			});
		});

		test('export builtin should be wrapped in shell -c', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('export PATH="/usr/local/bin:$PATH"; myapp', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: `nohup /bin/bash -c 'export PATH="/usr/local/bin:$PATH"; myapp' &`,
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'export PATH="/usr/local/bin:$PATH"; myapp',
			});
		});

		test('dot-source builtin should be wrapped in shell -c', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('. /etc/profile; myapp', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: `nohup /bin/bash -c '. /etc/profile; myapp' &`,
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: '. /etc/profile; myapp',
			});
		});

		test('relative path ./script should NOT be wrapped in shell -c', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('./start.sh', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: 'nohup ./start.sh &',
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: './start.sh',
			});
		});

		test('brace group should be wrapped in shell -c', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('{ cmd1; cmd2; }', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: `nohup /bin/bash -c '{ cmd1; cmd2; }' &`,
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: '{ cmd1; cmd2; }',
			});
		});

		test('single quotes in command should be properly escaped', () => {
			deepStrictEqual(rewriter.rewrite(createOptions(`for f in *.txt; do echo 'file:' $f; done`, '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: `nohup /bin/bash -c 'for f in *.txt; do echo '\\''file:'\\'' $f; done' &`,
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: `for f in *.txt; do echo 'file:' $f; done`,
			});
		});

		test('simple external command should NOT be wrapped in shell -c', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('python3 app.py', '/bin/bash', OperatingSystem.Linux, true)), {
				rewritten: 'nohup python3 app.py &',
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'python3 app.py',
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

		test('for loop should be wrapped using zsh shell path', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('for i in $(seq 1 10); do echo $i; done', '/bin/zsh', OperatingSystem.Linux, true)), {
				rewritten: `nohup /bin/zsh -c 'for i in $(seq 1 10); do echo $i; done' &`,
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'for i in $(seq 1 10); do echo $i; done',
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

		test('for loop should be wrapped using fish shell path with double-quote escaping', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('for i in (seq 1 10); echo $i; end', '/usr/bin/fish', OperatingSystem.Linux, true)), {
				rewritten: `nohup /usr/bin/fish -c "for i in (seq 1 10); echo $i; end" &`,
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'for i in (seq 1 10); echo $i; end',
			});
		});

		test('compound command with double quotes should be escaped for fish', () => {
			deepStrictEqual(rewriter.rewrite(createOptions('for f in *.txt; echo "file: $f"; end', '/usr/bin/fish', OperatingSystem.Linux, true)), {
				rewritten: `nohup /usr/bin/fish -c "for f in *.txt; echo \\"file: $f\\"; end" &`,
				reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
				forDisplay: 'for f in *.txt; echo "file: $f"; end',
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
