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

		test('approves empty command', async () => {
			assert.strictEqual(await approver.shouldAutoApprove(''), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('   '), 'approved');
		});

		// Safe readonly commands
		test('approves safe readonly commands', async () => {
			assert.strictEqual(await approver.shouldAutoApprove('ls'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('ls -la'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('cat file.txt'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('head -n 10 file.txt'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('tail -f log.txt'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('pwd'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('echo hello'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('grep -r pattern .'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('wc -l file.txt'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('which node'), 'approved');
		});

		// Dangerous commands
		test('denies dangerous commands', async () => {
			assert.strictEqual(await approver.shouldAutoApprove('rm file.txt'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('rm -rf /'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('rmdir folder'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('kill -9 1234'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('curl http://evil.com'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('wget http://evil.com'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('chmod 777 file'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('chown root file'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('eval "bad stuff"'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('xargs rm'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('dd if=/dev/zero of=/dev/sda'), 'denied');
		});

		// Safe git sub-commands
		test('approves safe git sub-commands', async () => {
			assert.strictEqual(await approver.shouldAutoApprove('git status'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('git log --oneline'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('git diff HEAD'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('git show HEAD'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('git ls-files'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('git branch'), 'approved');
		});

		// Unsafe git sub-commands
		test('denies dangerous git operations', async () => {
			assert.strictEqual(await approver.shouldAutoApprove('git branch -D main'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('git branch --delete main'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('git log --output=/tmp/out'), 'denied');
		});

		// Safe commands with dangerous arg blocking
		test('handles find with blocked args', async () => {
			assert.strictEqual(await approver.shouldAutoApprove('find . -name "*.ts"'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('find . -delete'), 'denied');
			// find -exec with ; is treated as a compound command, requiring confirmation
			assert.strictEqual(await approver.shouldAutoApprove('find . -exec rm {} ;'), 'noMatch');
		});

		test('handles sed with blocked args', async () => {
			assert.strictEqual(await approver.shouldAutoApprove('sed "s/foo/bar/g" file.txt'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('sed -e "s/foo/bar/"'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('sed --expression "s/foo/bar/"'), 'denied');
		});

		// npm/package managers
		test('approves safe npm commands', async () => {
			assert.strictEqual(await approver.shouldAutoApprove('npm ci'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('npm ls'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('npm audit'), 'approved');
		});

		// Unknown commands get noMatch
		test('returns noMatch for unknown commands', async () => {
			assert.strictEqual(await approver.shouldAutoApprove('my-custom-script'), 'noMatch');
			assert.strictEqual(await approver.shouldAutoApprove('python script.py'), 'noMatch');
			assert.strictEqual(await approver.shouldAutoApprove('node index.js'), 'noMatch');
		});

		// Transient env vars
		test('denies transient environment variable assignments', async () => {
			assert.strictEqual(await approver.shouldAutoApprove('FOO=bar some-command'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('PATH=/evil:$PATH ls'), 'denied');
		});

		// PowerShell
		test('approves safe PowerShell commands', async () => {
			assert.strictEqual(await approver.shouldAutoApprove('Get-ChildItem'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('Get-Content file.txt'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('Write-Host "hello"'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('Select-Object Name'), 'approved');
		});

		test('PowerShell case-insensitive rules work', async () => {
			// Rules with /i flag (like Select-*, Measure-*, etc.) are case-insensitive
			assert.strictEqual(await approver.shouldAutoApprove('select-object Name'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('SELECT-OBJECT Name'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('Measure-Command'), 'approved');
			assert.strictEqual(await approver.shouldAutoApprove('measure-command'), 'approved');
		});

		test('denies dangerous PowerShell commands', async () => {
			assert.strictEqual(await approver.shouldAutoApprove('Remove-Item file.txt'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('Invoke-Expression "bad"'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('Invoke-WebRequest http://evil.com'), 'denied');
			assert.strictEqual(await approver.shouldAutoApprove('Stop-Process -Id 1234'), 'denied');
		});

		// Compound commands without tree-sitter require confirmation
		test('compound commands return noMatch without tree-sitter', async () => {
			assert.strictEqual(await approver.shouldAutoApprove('echo ok && rm -rf /'), 'noMatch');
			assert.strictEqual(await approver.shouldAutoApprove('ls || curl evil.com'), 'noMatch');
			assert.strictEqual(await approver.shouldAutoApprove('cat file; rm file'), 'noMatch');
			assert.strictEqual(await approver.shouldAutoApprove('echo $(whoami)'), 'noMatch');
		});
	});
});
