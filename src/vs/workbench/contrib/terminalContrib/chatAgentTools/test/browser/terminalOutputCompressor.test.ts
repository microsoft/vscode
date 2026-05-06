/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { gitDiffFilter, lsFilter, npmInstallFilter, parseCommandHead } from '../../browser/tools/terminalOutputCompressor.js';

suite('parseCommandHead', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined for empty input', () => {
		strictEqual(parseCommandHead(undefined), undefined);
		strictEqual(parseCommandHead(''), undefined);
		strictEqual(parseCommandHead('   '), undefined);
	});

	test('parses simple commands', () => {
		deepStrictEqual(parseCommandHead('git diff HEAD~5'), { head: 'git', sub: 'diff' });
		deepStrictEqual(parseCommandHead('ls -la'), { head: 'ls', sub: '-la' });
	});

	test('skips env-var prefixes', () => {
		deepStrictEqual(parseCommandHead('CI=1 NODE_ENV=test npm install'), { head: 'npm', sub: 'install' });
	});

	test('uses only first pipeline segment', () => {
		deepStrictEqual(parseCommandHead('git diff | cat'), { head: 'git', sub: 'diff' });
	});

	test('skips leading long flags before the subcommand', () => {
		deepStrictEqual(parseCommandHead('git --no-pager diff src/foo.ts'), { head: 'git', sub: 'diff' });
	});

	test('does not skip short-flag values before the subcommand', () => {
		deepStrictEqual(parseCommandHead('git -C /tmp/repo diff'), { head: 'git', sub: '-C' });
	});
});

suite('gitDiffFilter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const input = { command: 'git diff HEAD~1' };

	test('matches git diff', () => {
		ok(gitDiffFilter.matches('run_in_terminal', input));
	});

	test('matches git --no-pager diff', () => {
		ok(gitDiffFilter.matches('run_in_terminal', { command: 'git --no-pager diff src/foo.ts' }));
	});

	test('does not match git status', () => {
		ok(!gitDiffFilter.matches('run_in_terminal', { command: 'git status' }));
	});

	test('preserves +/- and hunk headers verbatim', () => {
		const text = [
			'diff --git a/foo.ts b/foo.ts',
			'index abc..def 100644',
			'--- a/foo.ts',
			'+++ b/foo.ts',
			'@@ -1,3 +1,3 @@',
			' unchanged',
			'-old',
			'+new',
			' unchanged',
		].join('\n');
		const out = gitDiffFilter.apply(text, input);
		ok(out.text.includes('-old'));
		ok(out.text.includes('+new'));
		ok(out.text.includes('@@ -1,3 +1,3 @@'));
		ok(!out.text.includes('index abc..def'));
	});

	test('collapses long unchanged-context runs into a single marker', () => {
		const ctxLines = Array.from({ length: 20 }, (_, i) => ` this is context line number ${i}`);
		const text = [
			'diff --git a/foo.ts b/foo.ts',
			'--- a/foo.ts',
			'+++ b/foo.ts',
			'@@ -1,22 +1,22 @@',
			...ctxLines,
			'-old',
			'+new',
		].join('\n');
		const out = gitDiffFilter.apply(text, input);
		ok(out.text.includes(' this is context line number 0'));
		ok(!out.text.includes(' this is context line number 5'));
		ok(!out.text.includes(' this is context line number 19'));
		ok(out.text.includes('19 unchanged context lines omitted'));
		ok(out.text.includes('-old'));
		ok(out.text.includes('+new'));
		strictEqual(out.compressed, true);
	});

	test('omits lockfile diffs', () => {
		const text = [
			'diff --git a/package-lock.json b/package-lock.json',
			'index 1..2 100644',
			'--- a/package-lock.json',
			'+++ b/package-lock.json',
			'@@ -1,3 +1,3 @@',
			'-old',
			'+new',
		].join('\n');
		const out = gitDiffFilter.apply(text, input);
		ok(out.text.includes('lockfile/snapshot diff omitted'));
		ok(!out.text.includes('-old'));
		strictEqual(out.compressed, true);
	});

	test('does not omit arbitrary .lock file diffs', () => {
		const text = [
			'diff --git a/custom.lock b/custom.lock',
			'--- a/custom.lock',
			'+++ b/custom.lock',
			'@@ -1,2 +1,2 @@',
			' unchanged',
			'-old',
			'+new',
		].join('\n');
		const out = gitDiffFilter.apply(text, input);
		ok(!out.text.includes('lockfile/snapshot diff omitted'));
		ok(out.text.includes('-old'));
		ok(out.text.includes('+new'));
	});

	test('preserves non-context metadata lines', () => {
		const text = [
			'diff --git a/foo.ts b/foo.ts',
			'new file mode 100644',
			'--- /dev/null',
			'+++ b/foo.ts',
			'@@ -0,0 +2,2 @@',
			'+line 1',
			'+line 2',
		].join('\n');
		const out = gitDiffFilter.apply(text, input);
		ok(out.text.includes('new file mode 100644'));
	});

	test('rewrites hunk header counts to match emitted body', () => {
		const ctxLines = Array.from({ length: 20 }, (_, i) => ` ctx line ${i}`);
		const text = [
			'diff --git a/foo.ts b/foo.ts',
			'--- a/foo.ts',
			'+++ b/foo.ts',
			'@@ -10,22 +10,22 @@',
			...ctxLines,
			'-old',
			'+new',
		].join('\n');
		const out = gitDiffFilter.apply(text, input);
		ok(out.text.includes('@@ -10,2 +10,2 @@'));
		ok(!out.text.includes('@@ -10,22 +10,22 @@'));
	});
});

suite('lsFilter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches only when -l flag present', () => {
		ok(!lsFilter.matches('run_in_terminal', { command: 'ls' }));
		ok(lsFilter.matches('run_in_terminal', { command: 'ls -la' }));
		ok(lsFilter.matches('run_in_terminal', { command: 'ls -al src/' }));
	});

	test('strips long-form columns and keeps file names', () => {
		const text = [
			'total 24',
			'-rw-r--r--   1 user  staff   123 Jan 01 12:34 README.md',
			'drwxr-xr-x   5 user  staff   160 Jan 01 12:34 src',
		].join('\n');
		const out = lsFilter.apply(text, { command: 'ls -la' });
		ok(out.text.includes('README.md'));
		ok(out.text.includes('src/'));
		ok(!out.text.includes('user  staff'));
		ok(!out.text.includes('total 24'));
		strictEqual(out.compressed, true);
	});
});

suite('npmInstallFilter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches npm install', () => {
		ok(npmInstallFilter.matches('run_in_terminal', { command: 'npm install' }));
		ok(npmInstallFilter.matches('run_in_terminal', { command: 'npm ci' }));
		ok(!npmInstallFilter.matches('run_in_terminal', { command: 'npm test' }));
	});

	test('does not match flag-only yarn commands', () => {
		ok(!npmInstallFilter.matches('run_in_terminal', { command: 'yarn --version' }));
		ok(!npmInstallFilter.matches('run_in_terminal', { command: 'FOO=1 yarn --help' }));
	});

	test('drops audit and funding noise', () => {
		const text = [
			'added 250 packages in 12s',
			'npm warn deprecated foo@1.0.0: please update',
			'42 packages are looking for funding',
			'  run `npm fund` for details',
			'',
			'3 vulnerabilities (1 low, 2 moderate)',
			'Run `npm audit` for details.',
		].join('\n');
		const out = npmInstallFilter.apply(text, { command: 'npm install' });
		ok(out.text.includes('added 250 packages'));
		ok(!out.text.includes('deprecated foo'));
		ok(!out.text.includes('looking for funding'));
		ok(!out.text.includes('npm audit'));
		strictEqual(out.compressed, true);
	});
});
