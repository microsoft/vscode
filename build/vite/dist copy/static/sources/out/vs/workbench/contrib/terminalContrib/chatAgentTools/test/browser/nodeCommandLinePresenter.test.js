/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ok, strictEqual } from 'assert';
import { extractNodeCommand, NodeCommandLinePresenter } from '../../browser/tools/commandLinePresenter/nodeCommandLinePresenter.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
suite('extractNodeCommand', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('basic extraction', () => {
        test('should extract simple node -e command with double quotes', () => {
            const result = extractNodeCommand(`node -e "console.log('hello')"`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `console.log('hello')`);
        });
        test('should extract nodejs -e command', () => {
            const result = extractNodeCommand(`nodejs -e "console.log('hello')"`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `console.log('hello')`);
        });
        test('should extract node --eval command', () => {
            const result = extractNodeCommand(`node --eval "console.log('hello')"`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `console.log('hello')`);
        });
        test('should extract nodejs --eval command', () => {
            const result = extractNodeCommand(`nodejs --eval "console.log('hello')"`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `console.log('hello')`);
        });
        test('should return undefined for non-node commands', () => {
            const result = extractNodeCommand('echo hello', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, undefined);
        });
        test('should return undefined for node without -e flag', () => {
            const result = extractNodeCommand('node script.js', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, undefined);
        });
        test('should extract node -e with single quotes', () => {
            const result = extractNodeCommand(`node -e 'console.log("hello")'`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'console.log("hello")');
        });
        test('should extract nodejs -e with single quotes', () => {
            const result = extractNodeCommand(`nodejs -e 'const x = 1; console.log(x)'`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'const x = 1; console.log(x)');
        });
        test('should extract node --eval with single quotes', () => {
            const result = extractNodeCommand(`node --eval 'console.log("hello")'`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'console.log("hello")');
        });
    });
    suite('quote unescaping - Bash', () => {
        test('should unescape backslash-escaped quotes in bash', () => {
            const result = extractNodeCommand('node -e "console.log(\\"hello\\")"', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'console.log("hello")');
        });
        test('should handle multiple escaped quotes', () => {
            const result = extractNodeCommand('node -e "const x = \\"hello\\"; console.log(x)"', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'const x = "hello"; console.log(x)');
        });
    });
    suite('single quotes - literal content', () => {
        test('should preserve content literally in single quotes (no unescaping)', () => {
            // Single quotes in bash are literal - backslashes are not escape sequences
            const result = extractNodeCommand(`node -e 'console.log(\\"hello\\")'`, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'console.log(\\"hello\\")');
        });
        test('should handle single quotes in PowerShell', () => {
            const result = extractNodeCommand(`node -e 'console.log("hello")'`, 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result, 'console.log("hello")');
        });
        test('should extract multiline code in single quotes', () => {
            const code = `node -e 'for (let i = 0; i < 3; i++) {\n    console.log(i);\n}'`;
            const result = extractNodeCommand(code, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `for (let i = 0; i < 3; i++) {\n    console.log(i);\n}`);
        });
    });
    suite('quote unescaping - PowerShell', () => {
        test('should unescape backtick-escaped quotes in PowerShell', () => {
            const result = extractNodeCommand('node -e "console.log(`"hello`")"', 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result, 'console.log("hello")');
        });
        test('should handle multiple backtick-escaped quotes', () => {
            const result = extractNodeCommand('node -e "const x = `"hello`"; console.log(x)"', 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result, 'const x = "hello"; console.log(x)');
        });
        test('should not unescape backslash quotes in PowerShell', () => {
            const result = extractNodeCommand('node -e "console.log(\\"hello\\")"', 'pwsh', 1 /* OperatingSystem.Windows */);
            strictEqual(result, 'console.log(\\"hello\\")');
        });
    });
    suite('multiline code', () => {
        test('should extract multiline JavaScript code', () => {
            const code = `node -e "for (let i = 0; i < 3; i++) {\n    console.log(i);\n}"`;
            const result = extractNodeCommand(code, 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, `for (let i = 0; i < 3; i++) {\n    console.log(i);\n}`);
        });
    });
    suite('edge cases', () => {
        test('should handle code with trailing whitespace trimmed', () => {
            const result = extractNodeCommand('node -e "  console.log(1)  "', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, 'console.log(1)');
        });
        test('should return undefined for empty code', () => {
            const result = extractNodeCommand('node -e ""', 'bash', 3 /* OperatingSystem.Linux */);
            strictEqual(result, undefined);
        });
        test('should return undefined when quotes are unmatched', () => {
            const result = extractNodeCommand('node -e "console.log(1)', 'bash', 3 /* OperatingSystem.Linux */);
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
            os: 3 /* OperatingSystem.Linux */
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
            os: 3 /* OperatingSystem.Linux */
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
            os: 3 /* OperatingSystem.Linux */
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
            os: 3 /* OperatingSystem.Linux */
        });
        strictEqual(result, undefined);
    });
    test('should return undefined for regular node script execution', () => {
        const result = presenter.present({
            commandLine: { forDisplay: 'node script.js' },
            shell: 'bash',
            os: 3 /* OperatingSystem.Linux */
        });
        strictEqual(result, undefined);
    });
    test('should handle PowerShell backtick escaping', () => {
        const result = presenter.present({
            commandLine: { forDisplay: 'node -e "console.log(`"hello`")"' },
            shell: 'pwsh',
            os: 1 /* OperatingSystem.Windows */
        });
        ok(result);
        strictEqual(result.commandLine, 'console.log("hello")');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZUNvbW1hbmRMaW5lUHJlc2VudGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvdGVzdC9icm93c2VyL25vZGVDb21tYW5kTGluZVByZXNlbnRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxFQUFFLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ3pDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBRXBJLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXRHLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7SUFDaEMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO1FBQzlCLElBQUksQ0FBQywwREFBMEQsRUFBRSxHQUFHLEVBQUU7WUFDckUsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsZ0NBQWdDLEVBQUUsTUFBTSxnQ0FBd0IsQ0FBQztZQUNuRyxXQUFXLENBQUMsTUFBTSxFQUFFLHNCQUFzQixDQUFDLENBQUM7UUFDN0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO1lBQzdDLE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLGtDQUFrQyxFQUFFLE1BQU0sZ0NBQXdCLENBQUM7WUFDckcsV0FBVyxDQUFDLE1BQU0sRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1FBQzdDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRTtZQUMvQyxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxvQ0FBb0MsRUFBRSxNQUFNLGdDQUF3QixDQUFDO1lBQ3ZHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztRQUM3QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxzQ0FBc0MsRUFBRSxHQUFHLEVBQUU7WUFDakQsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsc0NBQXNDLEVBQUUsTUFBTSxnQ0FBd0IsQ0FBQztZQUN6RyxXQUFXLENBQUMsTUFBTSxFQUFFLHNCQUFzQixDQUFDLENBQUM7UUFDN0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO1lBQzFELE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLFlBQVksRUFBRSxNQUFNLGdDQUF3QixDQUFDO1lBQy9FLFdBQVcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDaEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsa0RBQWtELEVBQUUsR0FBRyxFQUFFO1lBQzdELE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLGdCQUFnQixFQUFFLE1BQU0sZ0NBQXdCLENBQUM7WUFDbkYsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNoQyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLEVBQUU7WUFDdEQsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsZ0NBQWdDLEVBQUUsTUFBTSxnQ0FBd0IsQ0FBQztZQUNuRyxXQUFXLENBQUMsTUFBTSxFQUFFLHNCQUFzQixDQUFDLENBQUM7UUFDN0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFO1lBQ3hELE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLHlDQUF5QyxFQUFFLE1BQU0sZ0NBQXdCLENBQUM7WUFDNUcsV0FBVyxDQUFDLE1BQU0sRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO1FBQ3BELENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEdBQUcsRUFBRTtZQUMxRCxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxvQ0FBb0MsRUFBRSxNQUFNLGdDQUF3QixDQUFDO1lBQ3ZHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztRQUM3QyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtRQUNyQyxJQUFJLENBQUMsa0RBQWtELEVBQUUsR0FBRyxFQUFFO1lBQzdELE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLG9DQUFvQyxFQUFFLE1BQU0sZ0NBQXdCLENBQUM7WUFDdkcsV0FBVyxDQUFDLE1BQU0sRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1FBQzdDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsRUFBRTtZQUNsRCxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxpREFBaUQsRUFBRSxNQUFNLGdDQUF3QixDQUFDO1lBQ3BILFdBQVcsQ0FBQyxNQUFNLEVBQUUsbUNBQW1DLENBQUMsQ0FBQztRQUMxRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRTtRQUM3QyxJQUFJLENBQUMsb0VBQW9FLEVBQUUsR0FBRyxFQUFFO1lBQy9FLDJFQUEyRTtZQUMzRSxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxvQ0FBb0MsRUFBRSxNQUFNLGdDQUF3QixDQUFDO1lBQ3ZHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztRQUNqRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLEVBQUU7WUFDdEQsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsZ0NBQWdDLEVBQUUsTUFBTSxrQ0FBMEIsQ0FBQztZQUNyRyxXQUFXLENBQUMsTUFBTSxFQUFFLHNCQUFzQixDQUFDLENBQUM7UUFDN0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0RBQWdELEVBQUUsR0FBRyxFQUFFO1lBQzNELE1BQU0sSUFBSSxHQUFHLGlFQUFpRSxDQUFDO1lBQy9FLE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLElBQUksRUFBRSxNQUFNLGdDQUF3QixDQUFDO1lBQ3ZFLFdBQVcsQ0FBQyxNQUFNLEVBQUUsdURBQXVELENBQUMsQ0FBQztRQUM5RSxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRTtRQUMzQyxJQUFJLENBQUMsdURBQXVELEVBQUUsR0FBRyxFQUFFO1lBQ2xFLE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLGtDQUFrQyxFQUFFLE1BQU0sa0NBQTBCLENBQUM7WUFDdkcsV0FBVyxDQUFDLE1BQU0sRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1FBQzdDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGdEQUFnRCxFQUFFLEdBQUcsRUFBRTtZQUMzRCxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQywrQ0FBK0MsRUFBRSxNQUFNLGtDQUEwQixDQUFDO1lBQ3BILFdBQVcsQ0FBQyxNQUFNLEVBQUUsbUNBQW1DLENBQUMsQ0FBQztRQUMxRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7WUFDL0QsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsb0NBQW9DLEVBQUUsTUFBTSxrQ0FBMEIsQ0FBQztZQUN6RyxXQUFXLENBQUMsTUFBTSxFQUFFLDBCQUEwQixDQUFDLENBQUM7UUFDakQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUU7UUFDNUIsSUFBSSxDQUFDLDBDQUEwQyxFQUFFLEdBQUcsRUFBRTtZQUNyRCxNQUFNLElBQUksR0FBRyxpRUFBaUUsQ0FBQztZQUMvRSxNQUFNLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsTUFBTSxnQ0FBd0IsQ0FBQztZQUN2RSxXQUFXLENBQUMsTUFBTSxFQUFFLHVEQUF1RCxDQUFDLENBQUM7UUFDOUUsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFO1FBQ3hCLElBQUksQ0FBQyxxREFBcUQsRUFBRSxHQUFHLEVBQUU7WUFDaEUsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsOEJBQThCLEVBQUUsTUFBTSxnQ0FBd0IsQ0FBQztZQUNqRyxXQUFXLENBQUMsTUFBTSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDdkMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsd0NBQXdDLEVBQUUsR0FBRyxFQUFFO1lBQ25ELE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLFlBQVksRUFBRSxNQUFNLGdDQUF3QixDQUFDO1lBQy9FLFdBQVcsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDaEMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsbURBQW1ELEVBQUUsR0FBRyxFQUFFO1lBQzlELE1BQU0sTUFBTSxHQUFHLGtCQUFrQixDQUFDLHlCQUF5QixFQUFFLE1BQU0sZ0NBQXdCLENBQUM7WUFDNUYsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNoQyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUM7QUFFSCxLQUFLLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO0lBQ3RDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsTUFBTSxTQUFTLEdBQUcsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO0lBRWpELElBQUksQ0FBQywyREFBMkQsRUFBRSxHQUFHLEVBQUU7UUFDdEUsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQztZQUNoQyxXQUFXLEVBQUUsRUFBRSxVQUFVLEVBQUUsZ0NBQWdDLEVBQUU7WUFDN0QsS0FBSyxFQUFFLE1BQU07WUFDYixFQUFFLCtCQUF1QjtTQUN6QixDQUFDLENBQUM7UUFDSCxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDWCxXQUFXLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3hELFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzNDLFdBQVcsQ0FBQyxNQUFNLENBQUMsbUJBQW1CLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDcEQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNkRBQTZELEVBQUUsR0FBRyxFQUFFO1FBQ3hFLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUM7WUFDaEMsV0FBVyxFQUFFLEVBQUUsVUFBVSxFQUFFLHlDQUF5QyxFQUFFO1lBQ3RFLEtBQUssRUFBRSxNQUFNO1lBQ2IsRUFBRSwrQkFBdUI7U0FDekIsQ0FBQyxDQUFDO1FBQ0gsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ1gsV0FBVyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsNkJBQTZCLENBQUMsQ0FBQztRQUMvRCxXQUFXLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUMzQyxXQUFXLENBQUMsTUFBTSxDQUFDLG1CQUFtQixFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3BELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtEQUErRCxFQUFFLEdBQUcsRUFBRTtRQUMxRSxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDO1lBQ2hDLFdBQVcsRUFBRSxFQUFFLFVBQVUsRUFBRSxvQ0FBb0MsRUFBRTtZQUNqRSxLQUFLLEVBQUUsTUFBTTtZQUNiLEVBQUUsK0JBQXVCO1NBQ3pCLENBQUMsQ0FBQztRQUNILEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNYLFdBQVcsQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLHNCQUFzQixDQUFDLENBQUM7UUFDeEQsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDM0MsV0FBVyxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNwRCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywrQ0FBK0MsRUFBRSxHQUFHLEVBQUU7UUFDMUQsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQztZQUNoQyxXQUFXLEVBQUUsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFO1lBQ3pDLEtBQUssRUFBRSxNQUFNO1lBQ2IsRUFBRSwrQkFBdUI7U0FDekIsQ0FBQyxDQUFDO1FBQ0gsV0FBVyxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNoQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyREFBMkQsRUFBRSxHQUFHLEVBQUU7UUFDdEUsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQztZQUNoQyxXQUFXLEVBQUUsRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUU7WUFDN0MsS0FBSyxFQUFFLE1BQU07WUFDYixFQUFFLCtCQUF1QjtTQUN6QixDQUFDLENBQUM7UUFDSCxXQUFXLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ2hDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtRQUN2RCxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDO1lBQ2hDLFdBQVcsRUFBRSxFQUFFLFVBQVUsRUFBRSxrQ0FBa0MsRUFBRTtZQUMvRCxLQUFLLEVBQUUsTUFBTTtZQUNiLEVBQUUsaUNBQXlCO1NBQzNCLENBQUMsQ0FBQztRQUNILEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNYLFdBQVcsQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLHNCQUFzQixDQUFDLENBQUM7SUFDekQsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9