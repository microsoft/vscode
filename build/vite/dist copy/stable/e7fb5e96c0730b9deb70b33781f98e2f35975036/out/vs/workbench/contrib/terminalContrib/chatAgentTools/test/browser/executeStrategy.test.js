/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { detectsCommonPromptPattern } from '../../browser/executeStrategy/executeStrategy.js';
suite('Execute Strategy - Prompt Detection', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('detectsCommonPromptPattern should detect PowerShell prompts', () => {
        strictEqual(detectsCommonPromptPattern('PS C:\\>').detected, true);
        strictEqual(detectsCommonPromptPattern('PS C:\\Windows\\System32>').detected, true);
        strictEqual(detectsCommonPromptPattern('PS C:\\Users\\test> ').detected, true);
    });
    test('detectsCommonPromptPattern should detect Command Prompt', () => {
        strictEqual(detectsCommonPromptPattern('C:\\>').detected, true);
        strictEqual(detectsCommonPromptPattern('C:\\Windows\\System32>').detected, true);
        strictEqual(detectsCommonPromptPattern('D:\\test> ').detected, true);
    });
    test('detectsCommonPromptPattern should detect Bash prompts', () => {
        strictEqual(detectsCommonPromptPattern('user@host:~$ ').detected, true);
        strictEqual(detectsCommonPromptPattern('$ ').detected, true);
        strictEqual(detectsCommonPromptPattern('[user@host ~]$ ').detected, true);
    });
    test('detectsCommonPromptPattern should detect root prompts', () => {
        strictEqual(detectsCommonPromptPattern('root@host:~# ').detected, true);
        strictEqual(detectsCommonPromptPattern('# ').detected, true);
        strictEqual(detectsCommonPromptPattern('[root@host ~]# ').detected, true);
    });
    test('detectsCommonPromptPattern should detect Python REPL', () => {
        strictEqual(detectsCommonPromptPattern('>>> ').detected, true);
        strictEqual(detectsCommonPromptPattern('>>>').detected, true);
    });
    test('detectsCommonPromptPattern should detect starship prompts', () => {
        strictEqual(detectsCommonPromptPattern('~ \u276f ').detected, true);
        strictEqual(detectsCommonPromptPattern('/path/to/project \u276f').detected, true);
    });
    test('detectsCommonPromptPattern should detect generic prompts', () => {
        strictEqual(detectsCommonPromptPattern('test> ').detected, true);
        strictEqual(detectsCommonPromptPattern('someprompt% ').detected, true);
    });
    test('detectsCommonPromptPattern should handle multiline content', () => {
        const multilineContent = `command output line 1
command output line 2
user@host:~$ `;
        strictEqual(detectsCommonPromptPattern(multilineContent).detected, true);
    });
    test('detectsCommonPromptPattern should reject non-prompt content', () => {
        strictEqual(detectsCommonPromptPattern('just some output').detected, false);
        strictEqual(detectsCommonPromptPattern('error: command not found').detected, false);
        strictEqual(detectsCommonPromptPattern('').detected, false);
        strictEqual(detectsCommonPromptPattern('   ').detected, false);
    });
    test('detectsCommonPromptPattern should handle edge cases', () => {
        strictEqual(detectsCommonPromptPattern('output\n\n\n').detected, false);
        strictEqual(detectsCommonPromptPattern('\n\n$ \n\n').detected, true); // prompt with surrounding whitespace
        strictEqual(detectsCommonPromptPattern('output\nPS C:\\> ').detected, true); // prompt at end after output
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhlY3V0ZVN0cmF0ZWd5LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvdGVzdC9icm93c2VyL2V4ZWN1dGVTdHJhdGVneS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDckMsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFOUYsS0FBSyxDQUFDLHFDQUFxQyxFQUFFLEdBQUcsRUFBRTtJQUNqRCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyw2REFBNkQsRUFBRSxHQUFHLEVBQUU7UUFDeEUsV0FBVyxDQUFDLDBCQUEwQixDQUFDLFVBQVUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNuRSxXQUFXLENBQUMsMEJBQTBCLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDcEYsV0FBVyxDQUFDLDBCQUEwQixDQUFDLHNCQUFzQixDQUFDLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2hGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlEQUF5RCxFQUFFLEdBQUcsRUFBRTtRQUNwRSxXQUFXLENBQUMsMEJBQTBCLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2hFLFdBQVcsQ0FBQywwQkFBMEIsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNqRixXQUFXLENBQUMsMEJBQTBCLENB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