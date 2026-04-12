/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CommandAutoApprover } from '../../node/commandAutoApprover.js';
suite('CommandAutoApprover', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let approver;
    setup(() => {
        approver = disposables.add(new CommandAutoApprover(new NullLogService()));
    });
    suite('shouldAutoApprove', () => {
        test('approves empty command', () => {
            assert.strictEqual(approver.shouldAutoApprove(''), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('   '), 'approved');
        });
        // Safe readonly commands
        test('approves allowed readonly commands', () => {
            assert.strictEqual(approver.shouldAutoApprove('ls'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('ls -la'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('cat file.txt'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('head -n 10 file.txt'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('tail -f log.txt'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('pwd'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('echo hello'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('grep -r pattern .'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('wc -l file.txt'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('which node'), 'approved');
        });
        // Dangerous commands
        test('denies denied commands', () => {
            assert.strictEqual(approver.shouldAutoApprove('rm file.txt'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('rm -rf /'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('rmdir folder'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('kill -9 1234'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('curl http://evil.com'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('wget http://evil.com'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('chmod 777 file'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('chown root file'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('eval "bad stuff"'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('xargs rm'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('dd if=/dev/zero of=/dev/sda'), 'denied');
        });
        // Safe git sub-commands
        test('approves allowed git sub-commands', () => {
            assert.strictEqual(approver.shouldAutoApprove('git status'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('git log --oneline'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('git diff HEAD'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('git show HEAD'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('git ls-files'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('git branch'), 'approved');
        });
        // Unsafe git sub-commands
        test('denies denied git operations', () => {
            assert.strictEqual(approver.shouldAutoApprove('git branch -D main'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('git branch --delete main'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('git log --output=/tmp/out'), 'denied');
        });
        // Safe commands with dangerous arg blocking
        test('handles find with blocked args', () => {
            assert.strictEqual(approver.shouldAutoApprove('find . -name "*.ts"'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('find . -delete'), 'denied');
            // find -exec with ; is treated as a compound command, requiring confirmation
            assert.strictEqual(approver.shouldAutoApprove('find . -exec rm {} ;'), 'noMatch');
        });
        test('handles sed with blocked args', () => {
            assert.strictEqual(approver.shouldAutoApprove('sed "s/foo/bar/g" file.txt'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('sed -e "s/foo/bar/"'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('sed --expression "s/foo/bar/"'), 'denied');
        });
        // npm/package managers
        test('approves allowed npm commands', () => {
            assert.strictEqual(approver.shouldAutoApprove('npm ci'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('npm ls'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('npm audit'), 'approved');
        });
        // Unknown commands get noMatch
        test('returns noMatch for unknown commands', () => {
            assert.strictEqual(approver.shouldAutoApprove('my-custom-script'), 'noMatch');
            assert.strictEqual(approver.shouldAutoApprove('python script.py'), 'noMatch');
            assert.strictEqual(approver.shouldAutoApprove('node index.js'), 'noMatch');
        });
        // Transient env vars
        test('denies transient environment variable assignments', () => {
            assert.strictEqual(approver.shouldAutoApprove('FOO=bar some-command'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('PATH=/evil:$PATH ls'), 'denied');
        });
        // PowerShell
        test('approves allowed PowerShell commands', () => {
            assert.strictEqual(approver.shouldAutoApprove('Get-ChildItem'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('Get-Content file.txt'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('Write-Host "hello"'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('Select-Object Name'), 'approved');
        });
        test('PowerShell case-insensitive rules work', () => {
            // Rules with /i flag (like Select-*, Measure-*, etc.) are case-insensitive
            assert.strictEqual(approver.shouldAutoApprove('select-object Name'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('SELECT-OBJECT Name'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('Measure-Command'), 'approved');
            assert.strictEqual(approver.shouldAutoApprove('measure-command'), 'approved');
        });
        test('denies denied PowerShell commands', () => {
            assert.strictEqual(approver.shouldAutoApprove('Remove-Item file.txt'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('Invoke-Expression "bad"'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('Invoke-WebRequest http://evil.com'), 'denied');
            assert.strictEqual(approver.shouldAutoApprove('Stop-Process -Id 1234'), 'denied');
        });
        // Compound commands containing denied sub-commands should never be auto-approved,
        // regardless of whether tree-sitter is available (with tree-sitter they are
        // 'denied', without they are 'noMatch' — both are safe).
        test('compound commands with denied sub-commands are not auto-approved', () => {
            assert.notStrictEqual(approver.shouldAutoApprove('echo ok && rm -rf /'), 'approved');
            assert.notStrictEqual(approver.shouldAutoApprove('ls || curl evil.com'), 'approved');
            assert.notStrictEqual(approver.shouldAutoApprove('cat file; rm file'), 'approved');
            assert.notStrictEqual(approver.shouldAutoApprove('echo $(whoami)'), 'approved');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZEF1dG9BcHByb3Zlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3Qvbm9kZS9jb21tYW5kQXV0b0FwcHJvdmVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV4RSxLQUFLLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO0lBRWpDLE1BQU0sV0FBVyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFOUQsSUFBSSxRQUE2QixDQUFDO0lBRWxDLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixRQUFRLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLG1CQUFtQixDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzNFLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtRQUUvQixJQUFJLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1lBQ25DLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQy9ELE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ25FLENBQUMsQ0FBQyxDQUFDO1FBRUgseUJBQXlCO1FBQ3pCLElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxH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