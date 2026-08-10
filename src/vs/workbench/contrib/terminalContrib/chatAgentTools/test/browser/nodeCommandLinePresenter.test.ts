/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { extractNodeCommand, NodeCommandLinePresenter } from '../../browser/tools/commandLinePresenter/nodeCommandLinePresenter.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('extractNodeCommand', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('basic extraction', () => {
		test('should extract simple node -e command with double quotes', () => {
			const result = extractNodeCommand(`node -e "console.log('hello')"`, 'bash', OperatingSystem.Linux);
			strictEqual(result, `console.log('hello')`);
		});

		test('should extract nodejs -e command', () => {
			const result = extractNodeCommand(`nodejs -e "console.log('hello')"`, 'bash', OperatingSystem.Linux);
			strictEqual(result, `console.log('hello')`);
		});

		test('should extract node --eval command', () => {
			const result = extractNodeCommand(`node --eval "console.log('hello')"`, 'bash', OperatingSystem.Linux);
			strictEqual(result, `console.log('hello')`);
		});

		test('should extract nodejs --eval command', () => {
			const result = extractNodeCommand(`nodejs --eval "console.log('hello')"`, 'bash', OperatingSystem.Linux);
			strictEqual(result, `console.log('hello')`);
		});

		test('should return undefined for non-node commands', () => {
			const result = extractNodeCommand('echo hello', 'bash', OperatingSystem.Linux);
			strictEqual(result, undefined);
		});

		test('should return undefined for node without -e flag', () => {
			const result = extractNodeCommand('node script.js', 'bash', OperatingSystem.Linux);
			strictEqual(result, undefined);
		});

		test('should extract node -e with single quotes', () => {
			const result = extractNodeCommand(`node -e 'console.log("hello")'`, 'bash', OperatingSystem.Linux);
			strictEqual(result, 'console.log("hello")');
		});

		test('should extract nodejs -e with single quotes', () => {
			const result = extractNodeCommand(`nodejs -e 'const x = 1; console.log(x)'`, 'bash', OperatingSystem.Linux);
			strictEqual(result, 'const x = 1; console.log(x)');
		});

		test('should extract node --eval with single quotes', () => {
			const result = extractNodeCommand(`node --eval 'console.log("hello")'`, 'bash', OperatingSystem.Linux);
			strictEqual(result, 'console.log("hello")');
		});
	});

	suite('quote unescaping - Bash', () => {
		test('should unescape backslash-escaped quotes in bash', () => {
			const result = extractNodeCommand('node -e "console.log(\\"hello\\")"', 'bash', OperatingSystem.Linux);
			strictEqual(result, 'console.log("hello")');
		});

		test('should handle multiple escaped quotes', () => {
			const result = extractNodeCommand('node -e "const x = \\"hello\\"; console.log(x)"', 'bash', OperatingSystem.Linux);
			strictEqual(result, 'const x = "hello"; console.log(x)');
		});
	});

	suite('single quotes - literal content', () => {
		test('should preserve content literally in single quotes (no unescaping)', () => {
			// Single quotes in bash are literal - backslashes are not escape sequences
			const result = extractNodeCommand(`node -e 'console.log(\\"hello\\")'`, 'bash', OperatingSystem.Linux);
			strictEqual(result, 'console.log(\\"hello\\")');
		});

		test('should handle single quotes in PowerShell', () => {
			const result = extractNodeCommand(`node -e 'console.log("hello")'`, 'pwsh', OperatingSystem.Windows);
			strictEqual(result, 'console.log("hello")');
		});

		test('should extract multiline code in single quotes', () => {
			const code = `node -e 'for (let i = 0; i < 3; i++) {\n    console.log(i);\n}'`;
			const result = extractNodeCommand(code, 'bash', OperatingSystem.Linux);
			strictEqual(result, `for (let i = 0; i < 3; i++) {\n    console.log(i);\n}`);
		});
	});

	suite('quote unescaping - PowerShell', () => {
		test('should unescape backtick-escaped quotes in PowerShell', () => {
			const result = extractNodeCommand('node -e "console.log(`"hello`")"', 'pwsh', OperatingSystem.Windows);
			strictEqual(result, 'console.log("hello")');
		});

		test('should handle multiple backtick-escaped quotes', () => {
			const result = extractNodeCommand('node -e "const x = `"hello`"; console.log(x)"', 'pwsh', OperatingSystem.Windows);
			strictEqual(result, 'const x = "hello"; console.log(x)');
		});

		test('should not unescape backslash quotes in PowerShell', () => {
			const result = extractNodeCommand('node -e "console.log(\\"hello\\")"', 'pwsh', OperatingSystem.Windows);
			strictEqual(result, 'console.log(\\"hello\\")');
		});
	});

	suite('multiline code', () => {
		test('should extract multiline JavaScript code', () => {
			const code = `node -e "for (let i = 0; i < 3; i++) {\n    console.log(i);\n}"`;
			const result = extractNodeCommand(code, 'bash', OperatingSystem.Linux);
			strictEqual(result, `for (let i = 0; i < 3; i++) {\n    console.log(i);\n}`);
		});
	});

	suite('edge cases', () => {
		test('should handle code with trailing whitespace trimmed', () => {
			const result = extractNodeCommand('node -e "  console.log(1)  "', 'bash', OperatingSystem.Linux);
			strictEqual(result, 'console.log(1)');
		});

		test('should return undefined for empty code', () => {
			const result = extractNodeCommand('node -e ""', 'bash', OperatingSystem.Linux);
			strictEqual(result, undefined);
		});

		test('should return undefined when quotes are unmatched', () => {
			const result = extractNodeCommand('node -e "console.log(1)', 'bash', OperatingSystem.Linux);
			strictEqual(result, undefined);
		});
	});
});

suite('NodeCommandLinePresenter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const presenter = new NodeCommandLinePresenter();

	test('should return JavaScript presentation for node -e command', () => {
		const result = presenter.present({
			commandLine: { forDisplay: `node -e "console.log('hello')"` },
			shell: 'bash',
			os: OperatingSystem.Linux
		});
		ok(result);
		strictEqual(result.commandLine, `console.log('hello')`);
		strictEqual(result.language, 'javascript');
		strictEqual(result.languageDisplayName, 'Node.js');
	});

	test('should return JavaScript presentation for nodejs -e command', () => {
		const result = presenter.present({
			commandLine: { forDisplay: `nodejs -e 'const x = 1; console.log(x)'` },
			shell: 'bash',
			os: OperatingSystem.Linux
		});
		ok(result);
		strictEqual(result.commandLine, 'const x = 1; console.log(x)');
		strictEqual(result.language, 'javascript');
		strictEqual(result.languageDisplayName, 'Node.js');
	});

	test('should return JavaScript presentation for node --eval command', () => {
		const result = presenter.present({
			commandLine: { forDisplay: `node --eval "console.log('hello')"` },
			shell: 'bash',
			os: OperatingSystem.Linux
		});
		ok(result);
		strictEqual(result.commandLine, `console.log('hello')`);
		strictEqual(result.language, 'javascript');
		strictEqual(result.languageDisplayName, 'Node.js');
	});

	test('should return undefined for non-node commands', () => {
		const result = presenter.present({
			commandLine: { forDisplay: 'echo hello' },
			shell: 'bash',
			os: OperatingSystem.Linux
		});
		strictEqual(result, undefined);
	});

	test('should return undefined for regular node script execution', () => {
		const result = presenter.present({
			commandLine: { forDisplay: 'node script.js' },
			shell: 'bash',
			os: OperatingSystem.Linux
		});
		strictEqual(result, undefined);
	});

	test('should handle PowerShell backtick escaping', () => {
		const result = presenter.present({
			commandLine: { forDisplay: 'node -e "console.log(`"hello`")"' },
			shell: 'pwsh',
			os: OperatingSystem.Windows
		});
		ok(result);
		strictEqual(result.commandLine, 'console.log("hello")');
	});
});
