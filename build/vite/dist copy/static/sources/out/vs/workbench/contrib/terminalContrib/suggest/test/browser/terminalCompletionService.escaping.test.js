/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { escapeTerminalCompletionLabel } from '../../browser/terminalCompletionService.js';
import { strict as assert } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
suite('escapeTerminalCompletionLabel', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const shellType = "bash" /* PosixShellType.Bash */;
    const pathSeparator = '/';
    const cases = [
        { char: '[', label: '[abc', expected: '\\[abc' },
        { char: ']', label: 'abc]', expected: 'abc\\]' },
        { char: '(', label: '(abc', expected: '\\(abc' },
        { char: ')', label: 'abc)', expected: 'abc\\)' },
        { char: '\'', label: `'abc`, expected: `\\'abc` },
        { char: '"', label: '"abc', expected: '\\"abc' },
        { char: '\\', label: 'abc\\', expected: 'abc\\\\' },
        { char: '`', label: '`abc', expected: '\\`abc' },
        { char: '*', label: '*abc', expected: '\\*abc' },
        { char: '?', label: '?abc', expected: '\\?abc' },
        { char: ';', label: ';abc', expected: '\\;abc' },
        { char: '&', label: '&abc', expected: '\\&abc' },
        { char: '|', label: '|abc', expected: '\\|abc' },
        { char: '<', label: '<abc', expected: '\\<abc' },
        { char: '>', label: '>abc', expected: '\\>abc' },
    ];
    for (const { char, label, expected } of cases) {
        test(`should escape '${char}' in "${label}"`, () => {
            const result = escapeTerminalCompletionLabel(label, shellType, pathSeparator);
            assert.equal(result, expected);
        });
    }
    test('should not escape when no special chars', () => {
        const result = escapeTerminalCompletionLabel('abc', shellType, pathSeparator);
        assert.equal(result, 'abc');
    });
    test('should not escape for PowerShell', () => {
        const result = escapeTerminalCompletionLabel('[abc', "pwsh" /* GeneralShellType.PowerShell */, pathSeparator);
        assert.equal(result, '[abc');
    });
    test('should not escape for CommandPrompt', () => {
        const result = escapeTerminalCompletionLabel('[abc', "cmd" /* WindowsShellType.CommandPrompt */, pathSeparator);
        assert.equal(result, '[abc');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb21wbGV0aW9uU2VydmljZS5lc2NhcGluZy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3N1Z2dlc3QvdGVzdC9icm93c2VyL3Rlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UuZXNjYXBpbmcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUUzRixPQUFPLEVBQUUsTUFBTSxJQUFJLE1BQU0sRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUMxQyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUV0RyxLQUFLLENBQUMsK0JBQStCLEVBQUUsR0FBRyxFQUFFO0lBQzNDLHVDQUF1QyxFQUFFLENBQUM7SUFDMUMsTUFBTSxTQUFTLG1DQUF5QyxDQUFDO0lBQ3pELE1BQU0sYUFBYSxHQUFHLEdBQUcsQ0FBQztJQUMxQixNQUFNLEtBQUssR0FBRztRQUNiLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUU7UUFDaEQsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRTtRQUNoRCxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFO1FBQ2hELEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUU7UUFDaEQsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFFB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