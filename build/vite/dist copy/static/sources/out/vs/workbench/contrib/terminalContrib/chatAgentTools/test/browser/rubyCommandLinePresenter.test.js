/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ok, strictEqual } from 'assert';
import { extractRubyCommand, RubyCommandLinePresenter } from '../../browser/tools/commandLinePresenter/rubyCommandLinePresenter.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
suite('extractRubyCommand', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('basic extraction', () => {
        test('should extract simple ruby -e command with double quotes', () => {
            const result = extractRubyCommand(`ruby -e "puts 'hello'"`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `puts 'hello'`);
        });
        test('should return undefined for non-ruby commands', () => {
            const result = extractRubyCommand('echo hello', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, undefined);
        });
        test('should return undefined for ruby without -e flag', () => {
            const result = extractRubyCommand('ruby script.rb', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, undefined);
        });
        test('should extract ruby -e with single quotes', () => {
            const result = extractRubyCommand(`ruby -e 'puts "hello"'`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'puts "hello"');
        });
    });
    suite('quote unescaping - Bash', () => {
        test('should unescape backslash-escaped quotes in bash', () => {
            const result = extractRubyCommand('ruby -e "puts \\"hello\\""', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'puts "hello"');
        });
        test('should handle multiple escaped quotes', () => {
            const result = extractRubyCommand('ruby -e "x = \\"hello\\"; puts x"', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'x = "hello"; puts x');
        });
    });
    suite('single quotes - literal content', () => {
        test('should preserve content literally in single quotes (no unescaping)', () => {
            const result = extractRubyCommand(`ruby -e 'puts \\"hello\\"'`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'puts \\"hello\\"');
        });
        test('should handle single quotes in PowerShell', () => {
            const result = extractRubyCommand(`ruby -e 'puts "hello"'`, 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result, 'puts "hello"');
        });
        test('should extract multiline code in single quotes', () => {
            const code = `ruby -e '3.times do |i|\n  puts i\nend'`;
            const result = extractRubyCommand(code, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `3.times do |i|\n  puts i\nend`);
        });
    });
    suite('quote unescaping - PowerShell', () => {
        test('should unescape backtick-escaped quotes in PowerShell', () => {
            const result = extractRubyCommand('ruby -e "puts `"hello`""', 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result, 'puts "hello"');
        });
        test('should handle multiple backtick-escaped quotes', () => {
            const result = extractRubyCommand('ruby -e "x = `"hello`"; puts x"', 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result, 'x = "hello"; puts x');
        });
        test('should not unescape backslash quotes in PowerShell', () => {
            const result = extractRubyCommand('ruby -e "puts \\"hello\\""', 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result, 'puts \\"hello\\"');
        });
    });
    suite('multiline code', () => {
        test('should extract multiline Ruby code', () => {
            const code = `ruby -e "3.times do |i|\n  puts i\nend"`;
            const result = extractRubyCommand(code, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `3.times do |i|\n  puts i\nend`);
        });
    });
    suite('edge cases', () => {
        test('should handle code with trailing whitespace trimmed', () => {
            const result = extractRubyCommand('ruby -e "  puts 1  "', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'puts 1');
        });
        test('should return undefined for empty code', () => {
            const result = extractRubyCommand('ruby -e ""', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, undefined);
        });
        test('should return undefined when quotes are unmatched', () => {
            const result = extractRubyCommand('ruby -e "puts 1', 'bash', 3 /* OperatingSystem.Linux */);
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
            os: 3 /* OperatingSystem.Linux */
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
            os: 3 /* OperatingSystem.Linux */
        });
        strictEqual(result, undefined);
    });
    test('should return undefined for regular ruby script execution', () => {
        const result = presenter.present({
            commandLine: { forDisplay: 'ruby script.rb' },
            shell: 'bash',
            os: 3 /* OperatingSystem.Linux */
        });
        strictEqual(result, undefined);
    });
    test('should handle PowerShell backtick escaping', () => {
        const result = presenter.present({
            commandLine: { forDisplay: 'ruby -e "puts `"hello`""' },
            shell: 'pwsh',
            os: 1 /* OperatingSystem.Windows */
        });
        ok(result);
        strictEqual(result.commandLine, 'puts "hello"');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVieUNvbW1hbmRMaW5lUHJlc2VudGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvdGVzdC9icm93c2VyL3J1YnlDb21tYW5kTGluZVByZXNlbnRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ3pDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBRXBJLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXRHLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7SUFDaEMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO1FBQzlCLElBQUksQ0FBQywwREFBMEQsRUFBRSxHQUFHLEVBQUU7WUFDckUsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsd0JBQXdCLEVBQUUsTUFBTSxnQ0FBd0IsQ0FBQztZQUMzRixXQUFXLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEdBQUcsRUFBRTtZQUMxRCxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxZQUFZLEVBQUUsTUFBTSxnQ0FBd0IsQ0FBQztZQUMvRSxXQUFXLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ2hDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGtEQUFrRCxFQUFFLEdBQUcsRUFBRTtZQUM3RCxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FB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