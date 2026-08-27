/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CommandAutoApprover, type ICommandApprovalEvaluation } from '../../node/commandAutoApprover.js';

suite('CommandAutoApprover initialization', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('initializes concurrent approvers', async () => {
		const approvers = Array.from({ length: 20 }, () => disposables.add(new CommandAutoApprover(new NullLogService())));

		await Promise.all(approvers.map(approver => approver.initialize()));

		assert.deepStrictEqual(
			approvers.map(approver => [
				approver.shouldAutoApprove('ls'),
				approver.shouldAutoApprove('Get-ChildItem', { language: 'powershell' }),
			]),
			Array.from({ length: approvers.length }, () => ['approved', 'approved']),
		);
	});
});

suite('CommandAutoApprover', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let approver: CommandAutoApprover;

	setup(async () => {
		approver = disposables.add(new CommandAutoApprover(new NullLogService()));
		await approver.initialize();
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
			assert.deepStrictEqual([
				approver.shouldAutoApprove('git status'),
				approver.shouldAutoApprove('git log --oneline'),
				approver.shouldAutoApprove('git diff HEAD'),
				approver.shouldAutoApprove('git show HEAD'),
				approver.shouldAutoApprove('git show --format=%B HEAD'),
				approver.shouldAutoApprove('git --no-pager show HEAD'),
				approver.shouldAutoApprove('git -C repo show HEAD'),
				approver.shouldAutoApprove('git show --output-format=text HEAD'),
				approver.shouldAutoApprove('git ls-files'),
				approver.shouldAutoApprove('git branch'),
			], [
				'approved',
				'approved',
				'approved',
				'approved',
				'approved',
				'approved',
				'approved',
				'approved',
				'approved',
				'approved',
			]);
		});

		// Unsafe git sub-commands
		test('denies denied git operations', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('git branch -D main'),
				approver.shouldAutoApprove('git branch --delete main'),
				approver.shouldAutoApprove('git log --output=/tmp/out'),
				approver.shouldAutoApprove('git show --output=message.txt HEAD'),
				approver.shouldAutoApprove('git show --output message.txt HEAD'),
				approver.shouldAutoApprove('git show --format=%B --output=message.txt HEAD'),
				approver.shouldAutoApprove('git --no-pager show --output=message.txt HEAD'),
				approver.shouldAutoApprove('git -C repo show --output message.txt HEAD'),
			], [
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
			]);
		});

		// Safe commands with dangerous arg blocking
		test('handles find with blocked args', () => {
			assert.strictEqual(approver.shouldAutoApprove('find . -name "*.ts"'), 'approved');
			assert.strictEqual(approver.shouldAutoApprove('find . -delete'), 'denied');
			// find -exec matches the deny rule for find's dangerous args.
			assert.strictEqual(approver.shouldAutoApprove('find . -exec rm {} ;'), 'denied');
		});

		test('handles sort with blocked args', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('sort input.txt'),
				approver.shouldAutoApprove('sort --check input.txt'),
				approver.shouldAutoApprove('sort --check=quiet input.txt'),
				approver.shouldAutoApprove('sort "--check" input.txt'),
				approver.shouldAutoApprove('sort --buffer-size=1K input.txt'),
				approver.shouldAutoApprove('sort -o output.txt input.txt'),
				approver.shouldAutoApprove('sort -S 1G input.txt'),
				approver.shouldAutoApprove('sort --compress-program=/bin/sh input.txt'),
				approver.shouldAutoApprove('sort --compress-program /bin/sh input.txt'),
				approver.shouldAutoApprove('sort --compress-prog=/bin/sh input.txt'),
				approver.shouldAutoApprove('sort --compress-p=/bin/sh input.txt'),
				approver.shouldAutoApprove('sort --com=/bin/sh input.txt'),
				approver.shouldAutoApprove('sort --co=/bin/sh input.txt'),
				approver.shouldAutoApprove('sort "--compress-program=/bin/sh" input.txt'),
				approver.shouldAutoApprove('sort \'--compress-prog=/bin/sh\' input.txt'),
				approver.shouldAutoApprove('sort \\-\\-compress-program=/bin/sh input.txt'),
				approver.shouldAutoApprove('sort --compress-program\\=/bin/sh input.txt'),
				approver.shouldAutoApprove('sort --"compress-program=/bin/sh" input.txt'),
				approver.shouldAutoApprove('sort $\'--compress-program=/bin/sh\' input.txt'),
			], [
				'approved',
				'approved',
				'approved',
				'approved',
				'approved',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
			]);
		});

		test('handles sed with blocked args', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('sed "s/foo/bar/g" file.txt'),
				approver.shouldAutoApprove('sed -e "s/foo/bar/"'),
				approver.shouldAutoApprove('sed --expression "s/foo/bar/"'),
				approver.shouldAutoApprove('sed "s/foo/bar/e"'),
				approver.shouldAutoApprove('sed "s/foo/bar/w"'),
				approver.shouldAutoApprove('sed "1e id > /tmp/SECURITY_TEST_pwned"'),
				approver.shouldAutoApprove('sed "1w /tmp/SECURITY_TEST_pwned_file" input.txt'),
				approver.shouldAutoApprove('sed "1r /etc/passwd" input.txt'),
				approver.shouldAutoApprove('sed "1W /tmp/x" input.txt'),
				approver.shouldAutoApprove('sed "e id"'),
				approver.shouldAutoApprove('sed "s/a/b/;e id"'),
				approver.shouldAutoApprove('sed "/pat/e id"'),
				approver.shouldAutoApprove('sed -n "1e id" file.txt'),
				approver.shouldAutoApprove('sed 1e id'),
				approver.shouldAutoApprove('sed "s/a/b/; e id"'),
				approver.shouldAutoApprove('sed "s/a/\'/;e id"'),
				approver.shouldAutoApprove('sed /pat/e input.txt'),
				approver.shouldAutoApprove('sed "1 e id"'),
				approver.shouldAutoApprove('sed "1!e id"'),
				approver.shouldAutoApprove('sed "1, 3 w /tmp/x" input.txt'),
				approver.shouldAutoApprove('sed -l 80 "e id" input.txt'),
				approver.shouldAutoApprove('sed --line-length 80 "1w /tmp/x" input.txt'),
				approver.shouldAutoApprove('sed --line-length=80 "1r /etc/passwd" input.txt'),
				approver.shouldAutoApprove('sed "s/a/\\"/;e id" input.txt'),
				approver.shouldAutoApprove('sed "/x/p;//e id" input.txt'),
				approver.shouldAutoApprove('sed e'),
				approver.shouldAutoApprove('sed -i "s/foo/bar/" file.txt'),
				approver.shouldAutoApprove('sed -I "s/foo/bar/" file.txt'),
				approver.shouldAutoApprove('sed -ni "s/foo/bar/" file.txt'),
				approver.shouldAutoApprove('sed -i.bak "s/foo/bar/" file.txt'),
				approver.shouldAutoApprove('sed -i \'\' "s/foo/bar/" file.txt'),
				approver.shouldAutoApprove('sed --in-place "s/foo/bar/" file.txt'),
				approver.shouldAutoApprove('sed --in-place=.bak "s/foo/bar/" file.txt'),
			], [
				'approved',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
				'denied',
			]);
		});

		test('sed in-place commands cannot be allowed by a full-command rule', () => {
			const commandLine = 'sed -i "s/foo/bar/" file.txt';
			assert.deepStrictEqual(approver.evaluate(commandLine, {
				autoApproveRules: {
					sed: true,
					'/^sed -i "s\\/foo\\/bar\\/" file\\.txt$/': { approve: true, matchCommandLine: true },
				},
			}), { result: 'denied', autoApproveRuleResolvable: false });
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

		test('respects forwarded terminal auto-approve rule config', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('echo hello', { autoApproveRules: { echo: false } }),
				approver.shouldAutoApprove('python script.py', { autoApproveRules: { python: true } }),
				approver.shouldAutoApprove('echo hello', { autoApproveRules: { echo: null } }),
				approver.shouldAutoApprove('npm run build', { autoApproveRules: { '/^npm run build$/': { approve: true, matchCommandLine: true } } }),
				approver.shouldAutoApprove('echo hello', { autoApproveRules: { echo: true, '/^echo hello$/': { approve: false, matchCommandLine: true } } }),
			], [
				'denied',
				'approved',
				'noMatch',
				'approved',
				'denied',
			]);
		});

		test('uses forwarded terminal auto-approve rules instead of fallback defaults', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('echo hello', { autoApproveRules: {} }),
				approver.shouldAutoApprove('rm file.txt', { autoApproveRules: {} }),
			], [
				'noMatch',
				'noMatch',
			]);
		});

		// Transient env vars
		test('denies transient environment variable assignments', () => {
			assert.strictEqual(approver.shouldAutoApprove('FOO=bar some-command'), 'denied');
			assert.strictEqual(approver.shouldAutoApprove('PATH=/evil:$PATH ls'), 'denied');
		});

		test('fails closed on Bash shell state mutations', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('FOO=bar && git status'),
				approver.shouldAutoApprove('export FOO=bar && git status'),
				approver.shouldAutoApprove('declare -x FOO=bar && git status'),
				approver.shouldAutoApprove('typeset FOO=bar && git status'),
				approver.shouldAutoApprove('readonly FOO=bar && git status'),
				approver.shouldAutoApprove('local FOO=bar && git status'),
				approver.shouldAutoApprove('FOO=bar git status'),
			], ['noMatch', 'noMatch', 'noMatch', 'noMatch', 'noMatch', 'noMatch', 'denied']);
		});

		// PowerShell
		test('approves allowed PowerShell commands', () => {
			const pwsh = { language: 'powershell' } as const;
			assert.deepStrictEqual([
				approver.shouldAutoApprove('Get-ChildItem', pwsh),
				approver.shouldAutoApprove('Get-Content file.txt', pwsh),
				approver.shouldAutoApprove('Write-Host "hello"', pwsh),
				approver.shouldAutoApprove('Select-Object Name', pwsh),
				approver.shouldAutoApprove('Measure-Object Length', pwsh),
				approver.shouldAutoApprove('Compare-Object $a $b', pwsh),
				approver.shouldAutoApprove('Format-Table', pwsh),
				approver.shouldAutoApprove('Sort-Object Name', pwsh),
			], ['approved', 'approved', 'approved', 'approved', 'approved', 'approved', 'approved', 'approved']);
		});

		test('PowerShell case-insensitive rules work', () => {
			const pwsh = { language: 'powershell' } as const;
			assert.deepStrictEqual([
				approver.shouldAutoApprove('select-object Name', pwsh),
				approver.shouldAutoApprove('SELECT-OBJECT Name', pwsh),
				approver.shouldAutoApprove('measure-object Length', pwsh),
			], ['approved', 'approved', 'approved']);
		});

		test('does not auto-approve arbitrary PowerShell cmdlets by verb', () => {
			const pwsh = { language: 'powershell' } as const;
			assert.deepStrictEqual([
				approver.shouldAutoApprove('Select-Custom', pwsh),
				approver.shouldAutoApprove('Measure-Command', pwsh),
				approver.shouldAutoApprove('Compare-Custom', pwsh),
				approver.shouldAutoApprove('Format-Hex', pwsh),
				approver.shouldAutoApprove('Sort-Custom', pwsh),
			], ['noMatch', 'noMatch', 'noMatch', 'noMatch', 'noMatch']);
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

		// Output redirections turn an otherwise read-only command into one that
		// writes to an arbitrary file path. Even when the command name is on
		// the allowlist, a redirection target (which can point outside the
		// workspace, e.g. ~/.bashrc) must not be auto-approved.
		test('does not auto-approve commands with write redirections to arbitrary paths', () => {
			assert.notStrictEqual(approver.shouldAutoApprove('echo id > /tmp/fake-home/.bashrc'), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove(`echo id > '/tmp/fake-home/.bashrc'`), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove('echo id >> ~/.bashrc'), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove('cat file > out.txt'), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove('ls -la > listing.txt'), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove('pwd > /etc/passwd'), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove('echo hello 2> err.log'), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove('echo hello &> all.log'), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove('echo hello >| force.txt'), 'approved');
		});

		// Input-only redirections (`<`, here-docs, here-strings) do not write
		// to the filesystem, so they remain eligible for auto-approval when
		// the command name is on the allowlist.
		test('input redirections do not block auto-approval', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('cat < file.txt'),
				approver.shouldAutoApprove('sort<input.txt'),
			], ['approved', 'approved']);
		});

		// Redirections to /dev/null and other known-safe sinks do not write
		// arbitrary files on disk and remain eligible for auto-approval.
		// File-descriptor duplications like `2>&1` are also safe.
		test('write redirections to safe sinks remain auto-approved', () => {
			assert.strictEqual(approver.shouldAutoApprove('echo hello > /dev/null'), 'approved');
			assert.strictEqual(approver.shouldAutoApprove('echo hello >/dev/null'), 'approved');
			assert.strictEqual(approver.shouldAutoApprove(`echo hello > '/dev/null'`), 'approved');
			assert.strictEqual(approver.shouldAutoApprove('echo hello >> /dev/null'), 'approved');
			assert.strictEqual(approver.shouldAutoApprove('echo hello 2> /dev/null'), 'approved');
			assert.strictEqual(approver.shouldAutoApprove('echo hello > /dev/stdout'), 'approved');
			assert.strictEqual(approver.shouldAutoApprove('echo hello > /dev/stderr'), 'approved');
			assert.strictEqual(approver.shouldAutoApprove('echo hello 2>&1'), 'approved');
			assert.strictEqual(approver.shouldAutoApprove('ls 2>&1 > /dev/null'), 'approved');
		});

		// Mixing a safe redirect with an unsafe one still requires
		// confirmation because the unsafe target writes to an arbitrary file.
		test('mixed safe and unsafe redirections still require confirmation', () => {
			assert.notStrictEqual(approver.shouldAutoApprove('echo hello 2> /dev/null > /tmp/out'), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove('echo hello > out.txt 2> /dev/null'), 'approved');
		});

		// The read-write open operator `<>` can write to its target and must
		// not be treated as a read-only redirect. Process substitution
		// `<(...)` contains arbitrary commands and must not be approved via
		// the outer command name.
		test('does not auto-approve <> read-write redirects or process substitution targets', () => {
			assert.notStrictEqual(approver.shouldAutoApprove('echo data 1<>/etc/passwd'), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove('echo data <>/tmp/file'), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove('cat < <(tee ~/.bashrc <<< id)'), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove('ls > >(tee ~/.bashrc)'), 'approved');
		});

		// When the caller supplies an `isWriteDestApproved` predicate, write
		// redirections to destinations approved by the predicate no longer
		// downgrade the command to `noMatch`. The predicate is consulted
		// once per destination; a single non-approved destination is enough
		// to require user confirmation. Safe sinks (`/dev/null` etc.) and
		// fd duplications (`2>&1`) bypass the predicate entirely.
		test('respects the isWriteDestApproved predicate for write redirections', () => {
			const seen: string[] = [];
			const opts = {
				isWriteDestApproved: (d: string) => {
					seen.push(d);
					return d === 'out.txt' || d === '/workspace/log.txt';
				},
			};
			assert.strictEqual(approver.shouldAutoApprove('echo hi > out.txt', opts), 'approved');
			assert.strictEqual(approver.shouldAutoApprove('echo hi > /workspace/log.txt', opts), 'approved');
			assert.strictEqual(approver.shouldAutoApprove(`echo hi > 'out.txt'`, opts), 'approved');
			assert.notStrictEqual(approver.shouldAutoApprove('echo hi > /tmp/elsewhere', opts), 'approved');
			// Mixed: one approved, one not — still requires confirmation.
			assert.notStrictEqual(approver.shouldAutoApprove('echo hi > out.txt 2> /tmp/err', opts), 'approved');
			// Safe sinks and fd duplications do not invoke the predicate.
			seen.length = 0;
			assert.strictEqual(approver.shouldAutoApprove('echo hi > /dev/null 2>&1', opts), 'approved');
			assert.deepStrictEqual(seen, []);
		});
	});

	suite('evaluate', () => {

		test('reports whether a persistent rule could resolve the outcome', () => {
			const cases: [commandLine: string, expected: ICommandApprovalEvaluation][] = [
				// Approved and denied outcomes leave nothing for a rule to resolve.
				['ls', { result: 'approved', autoApproveRuleResolvable: false }],
				['rm file.txt', { result: 'denied', autoApproveRuleResolvable: false }],
				// Unknown command blocked only by a missing allow rule.
				['my-custom-script', { result: 'noMatch', autoApproveRuleResolvable: true }],
				// Transient env-var assignments are denied outright.
				['FOO=bar my-custom-script', { result: 'denied', autoApproveRuleResolvable: false }],
				// Unapproved write redirects block regardless of rules, whether
				// the command itself is approved or unmatched.
				['echo hi > /etc/passwd', { result: 'noMatch', autoApproveRuleResolvable: false }],
				['my-custom-script > /etc/passwd', { result: 'noMatch', autoApproveRuleResolvable: false }],
				// Safe sinks do not block.
				['echo hi > /dev/null', { result: 'approved', autoApproveRuleResolvable: false }],
			];
			assert.deepStrictEqual(cases.map(([commandLine]) => approver.evaluate(commandLine)), cases.map(([, expected]) => expected));
		});

		test('is not rule-resolvable while the parser is unavailable', () => {
			const uninitialized = disposables.add(new CommandAutoApprover(new NullLogService()));
			assert.deepStrictEqual(uninitialized.evaluate('ls'), { result: 'noMatch', autoApproveRuleResolvable: false });
		});
	});

	suite('PowerShell grammar', () => {

		const pwsh = { language: 'powershell' } as const;

		test('parses PowerShell-specific syntax that the bash grammar mangles', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('Get-ChildItem -Recurse', pwsh),
				approver.shouldAutoApprove('Get-ChildItem | Select-Object Name', pwsh),
				// Backtick line continuations are valid PowerShell and parse as a single command.
				approver.shouldAutoApprove('Get-ChildItem `\n  -Path .', pwsh),
				// Expression-style invocations capture the inner command without the parentheses.
				approver.shouldAutoApprove('(Get-Content README.md).Length', pwsh),
				// Subexpressions are traversed so their nested commands are checked.
				approver.shouldAutoApprove('Write-Host $(Get-Date)', pwsh),
				approver.shouldAutoApprove('Write-Host $(Remove-Item x)', pwsh),
			], ['approved', 'approved', 'approved', 'approved', 'approved', 'denied']);
		});

		test('matches rules case-insensitively like PowerShell itself', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('get-childitem', pwsh),
				approver.shouldAutoApprove('IEX "bad"', pwsh),
				// bash rule matching stays case-sensitive.
				approver.shouldAutoApprove('get-childitem'),
			], ['approved', 'denied', 'noMatch']);
		});

		// The PowerShell grammar descends into script blocks, so commands nested
		// inside `{ ... }` are checked individually. The bash grammar keeps the
		// block opaque, which would let an allow rule on the outer cmdlet
		// blanket-approve arbitrary nested commands. Nested content that is not
		// a command (e.g. a .NET invocation) is handled by the fail-closed check
		// below, not by this traversal.
		test('denies commands nested inside script blocks', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('Get-ChildItem | Where-Object { Remove-Item $_ }', pwsh),
				approver.shouldAutoApprove('Get-ChildItem | ForEach-Object { Invoke-Expression $_ }', pwsh),
			], ['denied', 'denied']);
		});

		// Reported PowerShell wrapper shapes: an outer allowed cmdlet must not
		// hide nested denied/non-allowed commands inside a script block. The Bash
		// grammar keeps `{ ... }` opaque, so the same rules can incorrectly
		// approve the line when the wrong dialect is selected.
		test('does not auto-approve denied commands nested in Measure-Command script blocks', () => {
			const rules = {
				...pwsh,
				autoApproveRules: {
					'Measure-Command': true,
					'Where-Object': true,
					'Set-Content': false,
					'Start-Process': false,
					'Invoke-Expression': false,
				},
			};
			assert.deepStrictEqual([
				approver.shouldAutoApprove('Measure-Command { Set-Content -Path out.txt -Value pwned }', rules),
				approver.shouldAutoApprove('Measure-Command { Invoke-Expression "Write-Output hi" }', rules),
				approver.shouldAutoApprove('Get-ChildItem | Where-Object { Start-Process notepad }', rules),
				// Visible separators already rejected nested denied commands.
				approver.shouldAutoApprove('Write-Host hi; Set-Content -Path out.txt -Value pwned', rules),
				// The wrong dialect demonstrates the opaque-block bypass.
				approver.shouldAutoApprove('Measure-Command { Set-Content -Path out.txt -Value pwned }', { language: 'bash', autoApproveRules: rules.autoApproveRules }),
			], ['denied', 'denied', 'denied', 'denied', 'approved']);
		});

		// An unquoted `$null` discards PowerShell output; both the spaced form (a
		// `redirection` node) and the no-space form (a `generic_token`) must be
		// recognized. POSIX sinks and real file targets still require confirmation.
		test('treats unquoted $null redirects as safe sinks but blocks file writes', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('Get-Content file.txt 2>$null', pwsh),
				approver.shouldAutoApprove('Get-Content file.txt 2> $null', pwsh),
				approver.shouldAutoApprove('Write-Host hi >$null', pwsh),
				approver.shouldAutoApprove('Write-Host hi 2>&1', pwsh),
				approver.shouldAutoApprove('Write-Host hi > /dev/null', pwsh),
				approver.shouldAutoApprove('Write-Host hi >/dev/null', pwsh),
				approver.shouldAutoApprove(`Write-Host hi > '$null'`, pwsh),
				approver.shouldAutoApprove('Write-Host hi > out.txt', pwsh),
				approver.shouldAutoApprove('Write-Host hi >out.txt', pwsh),
			], ['approved', 'approved', 'approved', 'approved', 'noMatch', 'noMatch', 'noMatch', 'noMatch', 'noMatch']);
		});

		test('distinguishes embedded greater-than text from a redirect operator', () => {
			const seen: string[] = [];
			const options = {
				...pwsh,
				isWriteDestApproved: (dest: string) => {
					seen.push(dest);
					return false;
				},
			};
			assert.deepStrictEqual([
				approver.shouldAutoApprove('Write-Host hi>../../outside.txt', options),
				approver.shouldAutoApprove('Write-Host hi >../../outside.txt', options),
			], ['approved', 'noMatch']);
			assert.deepStrictEqual(seen, ['../../outside.txt']);
		});

		// The grammar parses `--flag=value` as an assignment expression that
		// truncates the command (microsoft/vscode#294010). Without masking, the
		// truncated capture could match an allow rule while the real command
		// line runs.
		test('masks --flag=value arguments before parsing', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('git log --format="%h|%s" -5', pwsh),
				approver.shouldAutoApprove('git log --format="a|b"; Remove-Item x', pwsh),
			], ['approved', 'denied']);
		});

		test('requires confirmation for incomplete PowerShell parses', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('Write-Output before; "unterminated', pwsh),
				approver.shouldAutoApprove('Write-Output before; `Write-Output after', pwsh),
				approver.shouldAutoApprove('Get-ChildItem -Recurse', pwsh),
			], ['noMatch', 'noMatch', 'approved']);
		});

		test('PowerShell matchCommandLine allow rules stay case-sensitive', () => {
			const autoApproveRules = { '/^Get-ChildItem$/': { approve: true, matchCommandLine: true } };
			assert.deepStrictEqual([
				approver.shouldAutoApprove('Get-ChildItem', { language: 'powershell', autoApproveRules }),
				approver.shouldAutoApprove('get-childitem', { language: 'powershell', autoApproveRules }),
			], ['approved', 'noMatch']);
		});

		test('PowerShell matchCommandLine deny rules retain configured casing', () => {
			const caseSensitiveRules = {
				'Get-ChildItem': true,
				'/^Get-ChildItem -Force$/': { approve: false, matchCommandLine: true },
			};
			const caseInsensitiveRules = {
				'Get-ChildItem': true,
				'/^Get-ChildItem -Force$/i': { approve: false, matchCommandLine: true },
			};
			assert.deepStrictEqual([
				approver.shouldAutoApprove('Get-ChildItem -Force', { language: 'powershell', autoApproveRules: caseSensitiveRules }),
				approver.shouldAutoApprove('get-childitem -Force', { language: 'powershell', autoApproveRules: caseSensitiveRules }),
				approver.shouldAutoApprove('get-childitem -Force', { language: 'powershell', autoApproveRules: caseInsensitiveRules }),
				approver.shouldAutoApprove('get-childitem -Force', { language: 'bash', autoApproveRules: caseSensitiveRules }),
			], ['denied', 'approved', 'denied', 'noMatch']);
		});

		test('reports rule resolvability', () => {
			const cases: [commandLine: string, expected: ICommandApprovalEvaluation][] = [
				['My-CustomCmdlet', { result: 'noMatch', autoApproveRuleResolvable: true }],
				// Unapproved write redirects block regardless of rules.
				['Write-Host hi > out.txt', { result: 'noMatch', autoApproveRuleResolvable: false }],
				// Commands the grammar cannot parse are never rule-resolvable.
				['if ($x -eq', { result: 'noMatch', autoApproveRuleResolvable: false }],
			];
			assert.deepStrictEqual(cases.map(([commandLine]) => approver.evaluate(commandLine, pwsh)), cases.map(([, expected]) => expected));
		});

		test('fails closed on PowerShell assignments and invocations', () => {
			assert.deepStrictEqual([
				approver.shouldAutoApprove('$env:GIT_SSH_COMMAND="evil"; git status', pwsh),
				approver.shouldAutoApprove('Write-Output ($env:FOO="evil"); Get-ChildItem', pwsh),
				approver.shouldAutoApprove('Get-ChildItem | Where-Object { $env:FOO="evil"; $true }', pwsh),
				approver.shouldAutoApprove('Get-ChildItem; [System.IO.File]::Delete("x")', pwsh),
				approver.shouldAutoApprove('Get-ChildItem | Where-Object { [System.IO.File]::Delete($_.FullName) }', pwsh),
				approver.shouldAutoApprove('Get-ChildItem; $obj.Delete()', pwsh),
				approver.shouldAutoApprove('[Math]::Max(1, 2) | Out-String', pwsh),
				approver.shouldAutoApprove(`Out-String -InputObject ([scriptblock]::Create('Write-Output ok').Invoke())`, pwsh),
				// Deliberate over-block: an invocation in an argument is usually
				// harmless, but the rules cannot tell `[math]::Round` from
				// `[System.IO.File]::Delete`, so both require confirmation.
				approver.shouldAutoApprove('Write-Output ([math]::Round(1.5))', pwsh),
				// Property access executes no method, so it stays approved.
				approver.shouldAutoApprove('(Get-Content README.md).Length', pwsh),
			], ['noMatch', 'noMatch', 'noMatch', 'noMatch', 'noMatch', 'noMatch', 'noMatch', 'noMatch', 'noMatch', 'approved']);
		});

		test('exact allow rules require a safely analyzable command line', () => {
			const parseErrorAllow = { '/^if \\(\\$x -eq$/': { approve: true, matchCommandLine: true } };
			const parseErrorDeny = { '/^if \\(\\$x -eq$/': { approve: false, matchCommandLine: true } };
			const invocationAllow = { '/^Write-Output \\(\\[math\\]::Round\\(1\\.5\\)\\)$/': { approve: true, matchCommandLine: true } };
			const redirectAllow = {
				Write: true,
				'/^Write-Host hi >out\\.txt$/': { approve: true, matchCommandLine: true },
			};
			const deniedSubCommand = {
				Get: true,
				Remove: false,
				'/^Get-ChildItem; Remove-Item x$/': { approve: true, matchCommandLine: true },
			};
			assert.deepStrictEqual([
				approver.shouldAutoApprove('if ($x -eq', { language: 'powershell', autoApproveRules: parseErrorAllow }),
				approver.shouldAutoApprove('if ($x -eq', { language: 'powershell', autoApproveRules: parseErrorDeny }),
				approver.shouldAutoApprove('Write-Output ([math]::Round(1.5))', { language: 'powershell', autoApproveRules: invocationAllow }),
				approver.shouldAutoApprove('Write-Host hi >out.txt', { language: 'powershell', autoApproveRules: redirectAllow }),
				approver.shouldAutoApprove('Get-ChildItem; Remove-Item x', { language: 'powershell', autoApproveRules: deniedSubCommand }),
			], ['noMatch', 'denied', 'noMatch', 'noMatch', 'denied']);
		});
	});
});
