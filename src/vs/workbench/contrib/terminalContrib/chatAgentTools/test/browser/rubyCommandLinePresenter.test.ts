/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { extractRubyCommand, RubyCommandLinePresenter } from '../../browser/tools/commandLinePresenter/rubyCommandLinePresenter.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('extractRubyCommand', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('basic extraction', () => {
		test('should extract simple ruby -e command with double quotes', () => {
			const result = extractRubyCommand(`ruby -e "puts 'hello'"`, 'bash', OperatingSystem.Linux);
			strictEqual(result, `puts 'hello'`);
		});

		test('should return undefined for non-ruby commands', () => {
			const result = extractRubyCommand('echo hello', 'bash', OperatingSystem.Linux);
			strictEqual(result, undefined);
		});

		test('should return undefined for ruby without -e flag', () => {
			const result = extractRubyCommand('ruby script.rb', 'bash', OperatingSystem.Linux);
			strictEqual(result, undefined);
		});

		test('should extract ruby -e with single quotes', () => {
			const result = extractRubyCommand(`ruby -e 'puts "hello"'`, 'bash', OperatingSystem.Linux);
			strictEqual(result, 'puts "hello"');
		});
	});

	suite('quote unescaping - Bash', () => {
		test('should unescape backslash-escaped quotes in bash', () => {
			const result = extractRubyCommand('ruby -e "puts \\"hello\\""', 'bash', OperatingSystem.Linux);
			strictEqual(result, 'puts "hello"');
		});

		test('should handle multiple escaped quotes', () => {
			const result = extractRubyCommand('ruby -e "x = \\"hello\\"; puts x"', 'bash', OperatingSystem.Linux);
			strictEqual(result, 'x = "hello"; puts x');
		});
	});

	suite('single quotes - literal content', () => {
		test('should preserve content literally in single quotes (no unescaping)', () => {
			const result = extractRubyCommand(`ruby -e 'puts \\"hello\\"'`, 'bash', OperatingSystem.Linux);
			strictEqual(result, 'puts \\"hello\\"');
		});

		test('should handle single quotes in PowerShell', () => {
			const result = extractRubyCommand(`ruby -e 'puts "hello"'`, 'pwsh', OperatingSystem.Windows);
			strictEqual(result, 'puts "hello"');
		});

		test('should extract multiline code in single quotes', () => {
			const code = `ruby -e '3.times do |i|\n  puts i\nend'`;
			const result = extractRubyCommand(code, 'bash', OperatingSystem.Linux);
			strictEqual(result, `3.times do |i|\n  puts i\nend`);
		});
	});

	suite('quote unescaping - PowerShell', () => {
		test('should unescape backtick-escaped quotes in PowerShell', () => {
			const result = extractRubyCommand('ruby -e "puts `"hello`""', 'pwsh', OperatingSystem.Windows);
			strictEqual(result, 'puts "hello"');
		});

		test('should handle multiple backtick-escaped quotes', () => {
			const result = extractRubyCommand('ruby -e "x = `"hello`"; puts x"', 'pwsh', OperatingSystem.Windows);
			strictEqual(result, 'x = "hello"; puts x');
		});

		test('should not unescape backslash quotes in PowerShell', () => {
			const result = extractRubyCommand('ruby -e "puts \\"hello\\""', 'pwsh', OperatingSystem.Windows);
			strictEqual(result, 'puts \\"hello\\"');
		});
	});

	suite('multiline code', () => {
		test('should extract multiline Ruby code', () => {
			const code = `ruby -e "3.times do |i|\n  puts i\nend"`;
			const result = extractRubyCommand(code, 'bash', OperatingSystem.Linux);
			strictEqual(result, `3.times do |i|\n  puts i\nend`);
		});
	});

	suite('edge cases', () => {
		test('should handle code with trailing whitespace trimmed', () => {
			const result = extractRubyCommand('ruby -e "  puts 1  "', 'bash', OperatingSystem.Linux);
			strictEqual(result, 'puts 1');
		});

		test('should return undefined for empty code', () => {
			const result = extractRubyCommand('ruby -e ""', 'bash', OperatingSystem.Linux);
			strictEqual(result, undefined);
		});

		test('should return undefined when quotes are unmatched', () => {
			const result = extractRubyCommand('ruby -e "puts 1', 'bash', OperatingSystem.Linux);
			strictEqual(result, undefined);
		});
	});
});

suite('RubyCommandLinePresenter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const presenter = new RubyCommandLinePresenter();

	test('should return Ruby presentation for ruby -e command', () => {
		const result = presenter.present({
			commandLine: { forDisplay: `ruby -e "puts 'hello'"` },
			shell: 'bash',
			os: OperatingSystem.Linux
		});
		ok(result);
		strictEqual(result.commandLine, `puts 'hello'`);
		strictEqual(result.language, 'ruby');
		strictEqual(result.languageDisplayName, 'Ruby');
	});

	test('should return undefined for non-ruby commands', () => {
		const result = presenter.present({
			commandLine: { forDisplay: 'echo hello' },
			shell: 'bash',
			os: OperatingSystem.Linux
		});
		strictEqual(result, undefined);
	});

	test('should return undefined for regular ruby script execution', () => {
		const result = presenter.present({
			commandLine: { forDisplay: 'ruby script.rb' },
			shell: 'bash',
			os: OperatingSystem.Linux
		});
		strictEqual(result, undefined);
	});

	test('should handle PowerShell backtick escaping', () => {
		const result = presenter.present({
			commandLine: { forDisplay: 'ruby -e "puts `"hello`""' },
			shell: 'pwsh',
			os: OperatingSystem.Windows
		});
		ok(result);
		strictEqual(result.commandLine, 'puts "hello"');
	});
});
