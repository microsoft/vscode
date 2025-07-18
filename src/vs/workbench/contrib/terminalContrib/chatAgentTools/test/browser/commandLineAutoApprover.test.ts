/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import type { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';
import { CommandLineAutoApprover } from '../../browser/commandLineAutoApprover.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { ok } from 'assert';

suite('CommandLineAutoApprover', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: IInstantiationService;
	let configurationService: TestConfigurationService;

	let commandLineAutoApprover: CommandLineAutoApprover;
	let shell: string;
	let os: OperatingSystem;

	setup(() => {
		configurationService = new TestConfigurationService();
		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService
		}, store);

		shell = 'bash';
		os = OperatingSystem.Linux;
		commandLineAutoApprover = store.add(instantiationService.createInstance(CommandLineAutoApprover));
	});

	function setAutoApprove(value: { [key: string]: boolean }) {
		setConfig(TerminalChatAgentToolsSettingId.AutoApprove, value);
	}

	function setConfig(key: string, value: unknown) {
		configurationService.setUserConfiguration(key, value);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: () => true,
			affectedKeys: new Set([key]),
			source: ConfigurationTarget.USER,
			change: null!,
		});
	}

	function isAutoApproved(commandLine: string): boolean {
		return commandLineAutoApprover.isAutoApproved(commandLine, shell, os);
	}

	suite('autoApprove with allow patterns only', () => {
		test('should auto-approve exact command match', () => {
			setAutoApprove({
				"echo": true
			});
			ok(isAutoApproved('echo'));
		});

		test('should auto-approve command with arguments', () => {
			setAutoApprove({
				"echo": true
			});
			ok(isAutoApproved('echo hello world'));
		});

		test('should not auto-approve when there is no match', () => {
			setAutoApprove({
				"echo": true
			});
			ok(!isAutoApproved('ls'));
		});

		test('should not auto-approve partial command matches', () => {
			setAutoApprove({
				"echo": true
			});
			ok(!isAutoApproved('echotest'));
		});

		test('should handle multiple commands in autoApprove', () => {
			setAutoApprove({
				"echo": true,
				"ls": true,
				"pwd": true
			});
			ok(isAutoApproved('echo'));
			ok(isAutoApproved('ls -la'));
			ok(isAutoApproved('pwd'));
			ok(!isAutoApproved('rm'));
		});
	});

	suite('autoApprove with deny patterns only', () => {
		test('should deny commands in autoApprove', () => {
			setAutoApprove({
				"rm": false,
				"del": false
			});
			ok(!isAutoApproved('rm file.txt'));
			ok(!isAutoApproved('del file.txt'));
		});

		test('should not auto-approve safe commands when no allow patterns are present', () => {
			setAutoApprove({
				"rm": false
			});
			ok(!isAutoApproved('echo hello'));
			ok(!isAutoApproved('ls'));
		});
	});

	suite('autoApprove with mixed allow and deny patterns', () => {
		test('should deny commands set to false even if other commands are set to true', () => {
			setAutoApprove({
				"echo": true,
				"rm": false
			});
			ok(isAutoApproved('echo hello'));
			ok(!isAutoApproved('rm file.txt'));
		});

		test('should auto-approve allow patterns not set to false', () => {
			setAutoApprove({
				"echo": true,
				"ls": true,
				"pwd": true,
				"rm": false,
				"del": false
			});
			ok(isAutoApproved('echo'));
			ok(isAutoApproved('ls'));
			ok(isAutoApproved('pwd'));
			ok(!isAutoApproved('rm'));
			ok(!isAutoApproved('del'));
		});
	});

	suite('regex patterns', () => {
		test('should handle regex patterns in autoApprove', () => {
			setAutoApprove({
				"/^echo/": true,
				"/^ls/": true,
				"pwd": true
			});

			ok(isAutoApproved('echo hello'));
			ok(isAutoApproved('ls -la'));
			ok(isAutoApproved('pwd'));
			ok(!isAutoApproved('rm file'));
		});

		test('should handle regex patterns for deny', () => {
			setAutoApprove({
				"echo": true,
				"rm": true,
				"/^rm\\s+/": false,
				"/^del\\s+/": false
			});

			ok(isAutoApproved('echo hello'));
			ok(isAutoApproved('rm'));
			ok(!isAutoApproved('rm file.txt'));
			ok(!isAutoApproved('del file.txt'));
		});

		test('should handle complex regex patterns', () => {
			setAutoApprove({
				"/^(echo|ls|pwd)\\b/": true,
				"/^git (status|show\\b.*)$/": true,
				"/rm|del|kill/": false
			});

			ok(isAutoApproved('echo test'));
			ok(isAutoApproved('ls -la'));
			ok(isAutoApproved('pwd'));
			ok(isAutoApproved('git status'));
			ok(isAutoApproved('git show'));
			ok(isAutoApproved('git show HEAD'));
			ok(!isAutoApproved('rm file'));
			ok(!isAutoApproved('del file'));
			ok(!isAutoApproved('kill process'));
		});
	});

	suite('edge cases', () => {
		test('should handle empty autoApprove', () => {
			setAutoApprove({});

			ok(!isAutoApproved('echo hello'));
			ok(!isAutoApproved('ls'));
			ok(!isAutoApproved('rm file'));
		});

		test('should handle empty command strings', () => {
			setAutoApprove({
				"echo": true
			});

			ok(!isAutoApproved(''));
			ok(!isAutoApproved('   '));
		});

		test('should handle whitespace in commands', () => {
			setAutoApprove({
				"echo": true
			});

			ok(isAutoApproved('echo   hello   world'));
			ok(!isAutoApproved('  echo hello'));
		});

		test('should be case-sensitive by default', () => {
			setAutoApprove({
				"echo": true
			});

			ok(isAutoApproved('echo hello'));
			ok(!isAutoApproved('ECHO hello'));
			ok(!isAutoApproved('Echo hello'));
		});

		// https://github.com/microsoft/vscode/issues/252411
		test('should handle string-based values with special regex characters', () => {
			setAutoApprove({
				"pwsh.exe -File D:\\foo.bar\\a-script.ps1": true
			});

			ok(isAutoApproved('pwsh.exe -File D:\\foo.bar\\a-script.ps1'));
			ok(isAutoApproved('pwsh.exe -File D:\\foo.bar\\a-script.ps1 -AnotherArg'));
		});
	});

	suite('PowerShell-specific commands', () => {
		setup(() => {
			shell = 'pwsh';
		});

		test('should handle Windows PowerShell commands', () => {
			setAutoApprove({
				"Get-ChildItem": true,
				"Get-Content": true,
				"Get-Location": true,
				"Remove-Item": false,
				"del": false
			});

			ok(isAutoApproved('Get-ChildItem'));
			ok(isAutoApproved('Get-Content file.txt'));
			ok(isAutoApproved('Get-Location'));
			ok(!isAutoApproved('Remove-Item file.txt'));
		});

		test('should handle ( prefixes', () => {
			setAutoApprove({
				"Get-Content": true
			});

			ok(isAutoApproved('Get-Content file.txt'));
			ok(isAutoApproved('(Get-Content file.txt'));
			ok(!isAutoApproved('[Get-Content'));
			ok(!isAutoApproved('foo'));
		});
	});
});
