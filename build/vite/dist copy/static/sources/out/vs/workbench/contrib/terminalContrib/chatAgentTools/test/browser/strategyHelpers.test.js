/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { stripCommandEchoAndPrompt } from '../../browser/executeStrategy/strategyHelpers.js';
suite('stripCommandEchoAndPrompt', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('strips single-line command echo and trailing prompt', () => {
        const output = [
            'user@host:~/src $ echo hello',
            'hello',
            'user@host:~/src $ ',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo hello'), 'hello');
    });
    test('strips command echo with zsh-style prompt (] $ )', () => {
        const output = [
            's/testWorkspace (main**) ] $  true',
            '[ alex@Alexandrus-MacBook-Pro:/Users/alex/src/vscode4/extensions/vscode-api-test',
            's/testWorkspace (main**) ] $ ',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'true'), '');
    });
    test('preserves actual command output between echo and prompt', () => {
        const output = [
            's/testWorkspace (main**) ] $  echo MARKER_123',
            'MARKER_123',
            '[ alex@host:/some/path',
            's/testWorkspace (main**) ] $ ',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo MARKER_123'), 'MARKER_123');
    });
    test('preserves multi-line command output', () => {
        const output = [
            'user@host:~ $ echo line1 && echo line2 && echo line3',
            'line1',
            'line2',
            'line3',
            'user@host:~ $ ',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo line1 && echo line2 && echo line3'), 'line1\nline2\nline3');
    });
    test('handles empty output (no-output command)', () => {
        const output = [
            's/testWorkspace (main**) ] $  true',
            '[ alex@host:/Users/alex/src/vscode4/extensions/vscode-api-test',
            's/testWorkspace (main**) ] $',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'true'), '');
    });
    test('strips sandbox-wrapped command echo (long wrapped lines)', () => {
        const sandboxCommand = 'ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/app/rg/bin" TMPDIR="/tmp/sandbox" "/app/sandbox-runtime/dist/cli.js" --settings "/tmp/sandbox-settings.json" -c \'curl -s https://example.com\'';
        const output = [
            's/testWorkspace (main**) ] $ ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/app/rg/bin" T',
            'MPDIR="/tmp/sandbox" "/app/sandbox-runtime/dist/cli.js" --settings "/tmp/sand',
            'box-settings.json" -c \'curl -s https://example.com\'',
            '[ alex@host:/Users/alex/src/vscode4/extensions/vscode-api-test',
            's/testWorkspace (main**) ] $ ',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, sandboxCommand), '');
    });
    test('strips trailing prompt with various prompt styles', () => {
        // bash user@host:path $
        assert.strictEqual(stripCommandEchoAndPrompt(['user@host:~ $ echo hello', 'hello', 'user@host:~ $ '].join('\n'), 'echo hello'), 'hello', 'Failed for bash $ prompt');
        // root user@host:path #
        assert.strictEqual(stripCommandEchoAndPrompt(['root@server:/var/log# echo hello', 'hello', 'root@server:/var/log# '].join('\n'), 'echo hello'), 'hello', 'Failed for root # prompt');
        // bracketed prompt ending with ] $
        assert.strictEqual(stripCommandEchoAndPrompt(['s/workspace ] $ echo hello', 'hello', 's/workspace ] $ '].join('\n'), 'echo hello'), 'hello', 'Failed for bracketed ] $ prompt');
        // PowerShell PS C:\>
        assert.strictEqual(stripCommandEchoAndPrompt(['PS C:\\Users\\test> echo hello', 'hello', 'PS C:\\Users\\test>'].join('\n'), 'echo hello'), 'hello', 'Failed for PowerShell prompt');
    });
    test('does not strip output lines ending with prompt-like characters', () => {
        // Output ending with % (e.g. percentage)
        assert.strictEqual(stripCommandEchoAndPrompt(['user@host:~ $ echo "100%"', '100%', 'user@host:~ $ '].join('\n'), 'echo "100%"'), '100%', 'Should not strip line ending with %');
        // Output ending with > (e.g. HTML or comparison)
        assert.strictEqual(stripCommandEchoAndPrompt(['user@host:~ $ echo "<div>"', '<div>', 'user@host:~ $ '].join('\n'), 'echo "<div>"'), '<div>', 'Should not strip line ending with >');
        // Output ending with # (e.g. comment marker)
        assert.strictEqual(stripCommandEchoAndPrompt(['user@host:~ $ echo "item #"', 'item #', 'user@host:~ $ '].join('\n'), 'echo "item #"'), 'item #', 'Should not strip line ending with #');
    });
    test('handles command with leading space (history prevention)', () => {
        const output = [
            'user@host:~ $  echo hello',
            'hello',
            'user@host:~ $ ',
        ].join('\n');
        // The command has a leading space (from CommandLinePreventHistoryRewriter)
        assert.strictEqual(stripCommandEchoAndPrompt(output, ' echo hello'), 'hello');
    });
    test('does not strip actual output lines that happen to contain prompt chars', () => {
        const output = [
            'user@host:~ $ echo "price is $5"',
            'price is $5',
            'user@host:~ $ ',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo "price is $5"'), 'price is $5');
    });
    test('handles output with no trailing prompt (e.g. command still running)', () => {
        const output = [
            'user@host:~ $ echo hello',
            'hello',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo hello'), 'hello');
    });
    test('handles output with only the command echo and no prompt', () => {
        const output = 'user@host:~ $ true';
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'true'), '');
    });
    test('handles empty string input', () => {
        assert.strictEqual(stripCommandEchoAndPrompt('', 'echo hello'), '');
    });
    test('handles bash -c subshell command echo', () => {
        const output = [
            's/testWorkspace (main**) ] $  bash -c "exit 42"',
            '[ alex@host:/Users/alex/src/vscode4/extensions/vscode-api-test',
            's/testWorkspace (main**) ] $ ',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'bash -c "exit 42"'), '');
    });
    test('strips wrapped prompt lines with user@hostname pattern', () => {
        const output = [
            'user@host:~ $ echo hi',
            'hi',
            '[ alex@Alexandrus-MacBook-Pro:/very/long/path/that/wraps/across/terminal/col',
            'umns/in/the/test/workspace ] $',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo hi'), 'hi');
    });
    test('handles PowerShell-style prompt (PS C:\\>)', () => {
        const output = [
            'PS C:\\Users\\test> echo hello',
            'hello',
            'PS C:\\Users\\test>',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo hello'), 'hello');
    });
    test('strips stale prompt fragments and ^C residue before command echo', () => {
        // Simulates CI environment where previous ^C produces stale prompt
        // fragments before the actual command echo line
        const output = [
            'ts/testWorkspace$ ^C',
            'cloudtest@5ac6b023c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes',
            'ts/testWorkspace$  echo MARKER_123',
            'MARKER_123',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo MARKER_123'), 'MARKER_123');
    });
    test('strips stale prompt fragments for no-output command', () => {
        const output = [
            'ts/testWorkspace$ ^C',
            'cloudtest@5ac6b023c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes',
            'ts/testWorkspace$  true',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'true'), '');
    });
    test('strips stale prompt fragments for multi-line output', () => {
        const output = [
            'ts/testWorkspace$ ^C',
            'cloudtest@5ac6b023c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes',
            'ts/testWorkspace$  echo M1 && echo M2 && echo M3',
            'M1',
            'M2',
            'M3',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo M1 && echo M2 && echo M3'), 'M1\nM2\nM3');
    });
    test('strips trailing prompt without @ (hostname:path user$)', () => {
        const output = [
            'dsm12-be220-abc:testWorkspace runner$  echo hello',
            'hello',
            'dsm12-be220-abc:testWorkspace runner$',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo hello'), 'hello');
    });
    test('strips wrapped trailing prompt without @ (hostname:path + fragment$)', () => {
        const output = [
            'dsm12-be220-abc:testWorkspace runner$  echo hello',
            'hello',
            'dsm12-be220-8627ea7f-2c5a-40cd-8ba1-bf324bb4f59a-DA35C080942E:testWorkspace runn',
            'er$',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo hello'), 'hello');
    });
    test('strips wrapped trailing prompt with path-like fragment (ts/testWorkspace$)', () => {
        const output = [
            'user@host:~ $ echo hello',
            'hello',
            'cloudtest@d4b0d881c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes',
            'ts/testWorkspace$',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo hello'), 'hello');
    });
    test('strips trailing prompt fragment for no-output command', () => {
        const output = [
            'dsm12-be220-abc:testWorkspace runner$  true',
            'dsm12-be220-8627ea7f-2c5a-40cd-8ba1-bf324bb4f59a-DA35C080942E:testWorkspace runn',
            'er$',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'true'), '');
    });
    test('strips mid-word wrapped command continuation (PowerShell/Windows)', () => {
        // PowerShell wraps "echo MARKER_123_ECHO" across lines at column boundary
        const output = [
            'PS D:\\a\\_work\\vscode\\testWorkspace> echo MARK',
            'ER_123_ECHO',
            'MARKER_123_ECHO',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo MARKER_123_ECHO'), 'MARKER_123_ECHO');
    });
    test('strips PowerShell prompt from getOutput() result', () => {
        // When shell integration markers misfire, getOutput() includes the prompt + command
        const output = 'PS D:\\a\\_work\\vscode\\testWorkspace> cmd /c exit 42';
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'cmd /c exit 42'), '');
    });
    test('strips partial command echo (suffix from wrapped getOutput)', () => {
        // When getOutput() doesn't include the prompt line, only the wrapped
        // continuation of the command echo appears at the start of the output.
        const output = [
            '90741 ; echo M2_1774133190741 ; echo M3_1774133190741',
            'M1_1774133190741',
            'M2_1774133190741',
            'M3_1774133190741',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo M1_1774133190741 ; echo M2_1774133190741 ; echo M3_1774133190741'), 'M1_1774133190741\nM2_1774133190741\nM3_1774133190741');
    });
    test('strips bracketed prompt without @ (hostname:path format)', () => {
        // macOS CI prompt: [hostname:path] username$ (wrapped so username is truncated)
        const output = [
            '[W007DV9PF9-1:~/vss/_work/1/s/extensions/vscode-api-tests/testWorkspace] cloudte',
            'st$',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'true'), '');
    });
    test('strips bracketed prompt without @ (single line, no trailing $)', () => {
        // When the terminal captures just the prompt (no-output command)
        const output = '[W007DV9PF9-1:~/vss/_work/1/s/extensions/vscode-api-tests/testWorkspace] cloudte';
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'true'), '');
    });
    test('strips bracketed prompt without @ with command echo', () => {
        const output = [
            '[W007DV9PF9-1:~/vss/_work] cloudtest$  echo MARKER_123',
            'MARKER_123',
            '[W007DV9PF9-1:~/vss/_work] cloudtest$',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo MARKER_123'), 'MARKER_123');
    });
    test('strips sandbox-wrapped command echo with error output and trailing prompt', () => {
        const commandLine = 'ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/Users/alex/src/vscode4/node_modules/@vscode/ripgrep/bin" TMPDIR="/Users/alex/.vscode-oss-dev/tmp" CLAUDE_TMPDIR="/Users/alex/.vscode-oss-dev/tmp" "/Users/alex/src/vscode4/node_modules/@anthropic-ai/sandbox-runtime/dist/cli.js" --settings "/Users/alex/.vscode-oss-dev/tmp/vscode-sandbox-settings-cf5b6232-825b-4f4c-8902-32a8591007fd.json" -c \' echo "SANDBOX_TMP_1774127409076" > /tmp/SANDBOX_TMP_1774127409076.txt\'';
        const output = [
            'ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/Users/alex/src/vscode4/node_modules/@vscode/',
            'ripgrep/bin" TMPDIR="/Users/alex/.vscode-oss-dev/tmp" CLAUDE_TMPDIR="/Users/alex',
            '/.vscode-oss-dev/tmp" "/Users/alex/src/vscode4/node_modules/@anthropic-ai/sandbo',
            'x-runtime/dist/cli.js" --settings "/Users/alex/.vscode-oss-dev/tmp/vscode-sandbo',
            'x-settings-cf5b6232-825b-4f4c-8902-32a8591007fd.json" -c \' echo "SANDBOX_TMP_177',
            '4127409076" > /tmp/SANDBOX_TMP_1774127409076.txt\'',
            '[ alex@Alexandrus-MacBook-Pro:/Users/alex/src/vscode4/extensions/vscode-api-test',
            's/testWorkspace (alexdima/fix-303531-sandbox-no-output-leak**) ] $ ELECTRON_RUN_',
            'AS_NODE=1 PATH="$PATH:/Users/alex/src/vscode4/node_modules/@vscode/ripgrep/bin" ',
            'TMPDIR="/Users/alex/.vscode-oss-dev/tmp" CLAUDE_TMPDIR="/Users/alex/.vscode-oss-',
            'dev/tmp" "/Users/alex/src/vscode4/node_modules/@anthropic-ai/sandbox-runtime/dis',
            't/cli.js" --settings "/Users/alex/.vscode-oss-dev/tmp/vscode-sandbox-settings-cf',
            '5b6232-825b-4f4c-8902-32a8591007fd.json" -c \' echo "SANDBOX_TMP_1774127409076" >',
            ' /tmp/SANDBOX_TMP_1774127409076.txt\'',
        ].join('\n');
        assert.strictEqual(stripCommandEchoAndPrompt(output, commandLine), '');
    });
    // --- Adversarial tests: output that looks like prompts ---
    // These verify that realistic output is NOT falsely stripped.
    suite('adversarial: output resembling prompts', () => {
        test('output ending with $ is preserved (not confused with wrapped prompt)', () => {
            const output = [
                'user@host:~ $ echo \'test$\'',
                'test$',
                'user@host:~ $',
            ].join('\n');
            // 'user@host:~ $' is a complete prompt → stripped and loop stops.
            // 'test$' is preserved because nothing above a complete prompt is stripped.
            assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo \'test$\''), 'test$');
        });
        test('output ending with # is preserved (not confused with wrapped prompt)', () => {
            const output = [
                'user@host:~ $ echo \'div#\'',
                'div#',
                'user@host:~ $',
            ].join('\n');
            assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo \'div#\''), 'div#');
        });
        test('bracketed log output [tag:~/path] is preserved', () => {
            const output = [
                'user@host:~ $ node build.js',
                '[build:~/dist] compiled successfully',
                'user@host:~ $',
            ].join('\n');
            assert.strictEqual(stripCommandEchoAndPrompt(output, 'node build.js'), '[build:~/dist] compiled successfully');
        });
        test('output containing user@host:path ending with # is preserved', () => {
            const output = [
                'user@host:~ $ cat /etc/motd',
                'admin@server:~/docs #',
                'user@host:~ $',
            ].join('\n');
            assert.strictEqual(stripCommandEchoAndPrompt(output, 'cat /etc/motd'), 'admin@server:~/docs #');
        });
        test('output ending with ] $ is preserved', () => {
            const output = [
                'user@host:~ $ echo \'values: [a, b] $\'',
                'values: [a, b] $',
                'user@host:~ $',
            ].join('\n');
            assert.strictEqual(stripCommandEchoAndPrompt(output, 'echo \'values: [a, b] $\''), 'values: [a, b] $');
        });
        test('multiple prompt-like output lines are all preserved', () => {
            // Complete prompt at the bottom stops stripping immediately,
            // so all prompt-like output lines above are preserved.
            const output = [
                'user@host:~ $ cat prompts.txt',
                'admin@server:~/docs $',
                'root@box:/var/log #',
                'test@dev:~ $',
                'user@host:~ $',
            ].join('\n');
            assert.strictEqual(stripCommandEchoAndPrompt(output, 'cat prompts.txt'), 'admin@server:~/docs $\nroot@box:/var/log #\ntest@dev:~ $');
        });
        test('multi-line output where last line has $ after non-word chars is preserved', () => {
            const output = [
                'user@host:~ $ ./report.sh',
                'Revenue: 1000',
                'Currency: USD$',
                'user@host:~ $',
            ].join('\n');
            assert.strictEqual(stripCommandEchoAndPrompt(output, './report.sh'), 'Revenue: 1000\nCurrency: USD$');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyYXRlZ3lIZWxwZXJzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvdGVzdC9icm93c2VyL3N0cmF0ZWd5SGVscGVycy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUU3RixLQUFLLENBQUMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFO0lBQ3ZDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLHFEQUFxRCxFQUFFLEdBQUcsRUFBRTtRQUNoRSxNQUFNLE1BQU0sR0FBRztZQUNkLDhCQUE4QjtZQUM5QixPQUFPO1lBQ1Asb0JBQW9CO1NBQ3BCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWIsTUFBTSxDQUFDLFdBQVcsQ0FDakIseUJBQXlCLENBQUMsTUFBTSxFQUFFLFlBQVksQ0FBQyxFQUMvQyxPQUFPLENBQ1AsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtEQUFrRCxFQUFFLEdBQUcsRUFBRTtRQUM3RCxNQUFNLE1BQU0sR0FBRztZQUNkLG9DQUFvQztZQUNwQyxrRkFBa0Y7WUFDbEYsK0JBQStCO1NBQy9CLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWIsTUFBTSxDQUFDLFdBQVcsQ0FDakIseUJBQXlCLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxFQUN6QyxFQUFFLENBQ0YsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlE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