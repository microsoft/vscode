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

	let approver: CommandAutoApprover;

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
