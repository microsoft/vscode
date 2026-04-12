/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ok, strictEqual } from 'assert';
import { extractPythonCommand, PythonCommandLinePresenter } from '../../browser/tools/commandLinePresenter/pythonCommandLinePresenter.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
suite('extractPythonCommand', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('basic extraction', () => {
        test('should extract simple python -c command with double quotes', () => {
            const result = extractPythonCommand('python -c "print(\'hello\')"', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `print('hello')`);
        });
        test('should extract python3 -c command', () => {
            const result = extractPythonCommand('python3 -c "print(\'hello\')"', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `print('hello')`);
        });
        test('should return undefined for non-python commands', () => {
            const result = extractPythonCommand('echo hello', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, undefined);
        });
        test('should return undefined for python without -c flag', () => {
            const result = extractPythonCommand('python script.py', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, undefined);
        });
        test('should extract python -c with single quotes', () => {
            const result = extractPythonCommand(`python -c 'print("hello")'`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'print("hello")');
        });
        test('should extract python3 -c with single quotes', () => {
            const result = extractPythonCommand(`python3 -c 'x = 1; print(x)'`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'x = 1; print(x)');
        });
    });
    suite('quote unescaping - Bash', () => {
        test('should unescape backslash-escaped quotes in bash', () => {
            const result = extractPythonCommand('python -c "print(\\"hello\\")"', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'print("hello")');
        });
        test('should handle multiple escaped quotes', () => {
            const result = extractPythonCommand('python -c "x = \\\"hello\\\"; print(x)"', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'x = "hello"; print(x)');
        });
    });
    suite('single quotes - literal content', () => {
        test('should preserve content literally in single quotes (no unescaping)', () => {
            // Single quotes in bash are literal - backslashes are not escape sequences
            const result = extractPythonCommand(`python -c 'print(\\"hello\\")'`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'print(\\"hello\\")');
        });
        test('should handle single quotes in PowerShell', () => {
            const result = extractPythonCommand(`python -c 'print("hello")'`, 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result, 'print("hello")');
        });
        test('should extract multiline code in single quotes', () => {
            const code = `python -c 'for i in range(3):\n    print(i)'`;
            const result = extractPythonCommand(code, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `for i in range(3):\n    print(i)`);
        });
    });
    suite('quote unescaping - PowerShell', () => {
        test('should unescape backtick-escaped quotes in PowerShell', () => {
            const result = extractPythonCommand('python -c "print(`"hello`")"', 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result, 'print("hello")');
        });
        test('should handle multiple backtick-escaped quotes', () => {
            const result = extractPythonCommand('python -c "x = `"hello`"; print(x)"', 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result, 'x = "hello"; print(x)');
        });
        test('should not unescape backslash quotes in PowerShell', () => {
            const result = extractPythonCommand('python -c "print(\\"hello\\")"', 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result, 'print(\\"hello\\")');
        });
    });
    suite('multiline code', () => {
        test('should extract multiline python code', () => {
            const code = `python -c "for i in range(3):\n    print(i)"`;
            const result = extractPythonCommand(code, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `for i in range(3):\n    print(i)`);
        });
    });
    suite('edge cases', () => {
        test('should handle code with trailing whitespace trimmed', () => {
            const result = extractPythonCommand('python -c "  print(1)  "', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'print(1)');
        });
        test('should return undefined for empty code', () => {
            const result = extractPythonCommand('python -c ""', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, undefined);
        });
        test('should return undefined when quotes are unmatched', () => {
            const result = extractPythonCommand('python -c "print(1)', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, undefined);
        });
    });
});
suite('PythonCommandLinePresenter', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const presenter = new PythonCommandLinePresenter();
    test('should return Python presentation for python -c command', () => {
        const result = presenter.present({
            commandLine: { forDisplay: `python -c "print('hello')"` },
            shell: 'bash',
            os: 3 /* OperatingSystem.Linux */
        });
        ok(result);
        strictEqual(result.commandLine, `print('hello')`);
        strictEqual(result.language, 'python');
        strictEqual(result.languageDisplayName, 'Python');
    });
    test('should return Python presentation for python3 -c command', () => {
        const result = presenter.present({
            commandLine: { forDisplay: `python3 -c 'x = 1; print(x)'` },
            shell: 'bash',
            os: 3 /* OperatingSystem.Linux */
        });
        ok(result);
        strictEqual(result.commandLine, 'x = 1; print(x)');
        strictEqual(result.language, 'python');
        strictEqual(result.languageDisplayName, 'Python');
    });
    test('should return undefined for non-python commands', () => {
        const result = presenter.present({
            commandLine: { forDisplay: 'echo hello' },
            shell: 'bash',
            os: 3 /* OperatingSystem.Linux */
        });
        strictEqual(result, undefined);
    });
    test('should return undefined for regular python script execution', () => {
        const result = presenter.present({
            commandLine: { forDisplay: 'python script.py' },
            shell: 'bash',
            os: 3 /* OperatingSystem.Linux */
        });
        strictEqual(result, undefined);
    });
    test('should handle PowerShell backtick escaping', () => {
        const result = presenter.present({
            commandLine: { forDisplay: 'python -c "print(`"hello`")"' },
            shell: 'pwsh',
            os: 1 /* OperatingSystem.Windows */
        });
        ok(result);
        strictEqual(result.commandLine, 'print("hello")');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHl0aG9uQ29tbWFuZExpbmVQcmVzZW50ZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvcHl0aG9uQ29tbWFuZExpbmVQcmVzZW50ZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN6QyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUUxSSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV0RyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO0lBQ2xDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtRQUM5QixJQUFJLENBQUMsNERBQTRELEVBQUUsR0FBRyxFQUFFO1lBQ3ZFLE1BQU0sTUFBTSxHQUFHLG9CQUFvQixDQUFDLDhCQUE4QixFQUFFLE1BQU0sZ0NBQXdCLENBQUM7WUFDbkcsV0FBVyxDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG1DQUFtQyxFQUFFLEdBQUcsRUFBRTtZQUM5QyxNQUFNLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQywrQkFBK0IsRUFBRSxNQUFNLGdDQUF3QixDQUFDO1lBQ3BHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUN2QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxpREFBaUQsRUFBRSxHQUFHLEVBQUU7WUFDNUQsTUFBTSxNQUFNLEdBQUcs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