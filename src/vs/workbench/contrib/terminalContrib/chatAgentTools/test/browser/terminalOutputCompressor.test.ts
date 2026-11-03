/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { gitDiffFilter, gitLogFilter, gitStatusFilter, lsFilter, npmInstallFilter, parseCommandHead, testRunnerFilter, buildToolFilter, linterFilter, envFilter, findFilter, grepFilter, treeFilter } from '../../browser/tools/terminalOutputCompressor.js';
import { isProtectedFromCompression } from '../../../../chat/common/tools/toolResultCompressor.js';

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

suite('gitDiffFilter - regression', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('does not match `git difftool` (only diff/show)', () => {
		ok(!gitDiffFilter.matches('run_in_terminal', { command: 'git difftool HEAD~1' }));
		ok(!gitDiffFilter.matches('run_in_terminal', { command: 'git difftool --tool=vscode' }));
	});

	test('does not match `git diff-tree` or `git diff-files`', () => {
		ok(!gitDiffFilter.matches('run_in_terminal', { command: 'git diff-tree HEAD' }));
		ok(!gitDiffFilter.matches('run_in_terminal', { command: 'git diff-files' }));
	});

	test('matches git show', () => {
		ok(gitDiffFilter.matches('run_in_terminal', { command: 'git show HEAD' }));
	});

	test('matches inside a pipeline', () => {
		ok(gitDiffFilter.matches('run_in_terminal', { command: 'git diff | cat' }));
	});

	test('matches when wrapped in sudo / time', () => {
		ok(gitDiffFilter.matches('run_in_terminal', { command: 'sudo time git diff' }));
	});
});

suite('gitLogFilter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches git log', () => {
		ok(gitLogFilter.matches('run_in_terminal', { command: 'git log' }));
		ok(gitLogFilter.matches('run_in_terminal', { command: 'git --no-pager log --oneline -n 20' }));
	});
	test('does not match git logout / unrelated', () => {
		ok(!gitLogFilter.matches('run_in_terminal', { command: 'git status' }));
	});
});

suite('gitStatusFilter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches git status', () => {
		ok(gitStatusFilter.matches('run_in_terminal', { command: 'git status' }));
		ok(gitStatusFilter.matches('run_in_terminal', { command: 'git status -s' }));
	});
	test('does not match git stash', () => {
		ok(!gitStatusFilter.matches('run_in_terminal', { command: 'git stash list' }));
	});
});

suite('find / grep / tree filters', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('findFilter caps output and adds summary', () => {
		const lines = Array.from({ length: 500 }, (_, i) => `./file${i}.ts`).join('\n');
		const out = findFilter.apply(lines, { command: 'find . -name "*.ts"' });
		strictEqual(out.compressed, true);
		ok(out.text.includes('omitted'));
		// First file should still appear.
		ok(out.text.includes('./file0.ts'));
	});

	test('grepFilter caps output', () => {
		const lines = Array.from({ length: 500 }, (_, i) => `file${i}.ts:1:match`).join('\n');
		const out = grepFilter.apply(lines, { command: 'grep -rn match .' });
		strictEqual(out.compressed, true);
		ok(out.text.includes('omitted'));
	});

	test('treeFilter caps output', () => {
		const lines = Array.from({ length: 500 }, (_, i) => `├── file${i}.ts`).join('\n');
		const out = treeFilter.apply(lines, { command: 'tree' });
		strictEqual(out.compressed, true);
	});
});

suite('testRunnerFilter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches common test runners', () => {
		ok(testRunnerFilter.matches('run_in_terminal', { command: 'npm test' }));
		ok(testRunnerFilter.matches('run_in_terminal', { command: 'pytest' }));
		ok(testRunnerFilter.matches('run_in_terminal', { command: 'cargo test' }));
		ok(testRunnerFilter.matches('run_in_terminal', { command: 'go test ./...' }));
		ok(testRunnerFilter.matches('run_in_terminal', { command: 'npx vitest run' }));
	});
});

suite('buildToolFilter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches build commands', () => {
		ok(buildToolFilter.matches('run_in_terminal', { command: 'cargo build' }));
		ok(buildToolFilter.matches('run_in_terminal', { command: 'cargo check' }));
		ok(buildToolFilter.matches('run_in_terminal', { command: 'go build ./...' }));
		ok(buildToolFilter.matches('run_in_terminal', { command: 'make' }));
		ok(buildToolFilter.matches('run_in_terminal', { command: 'tsc -p .' }));
	});
});

suite('linterFilter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches linters', () => {
		ok(linterFilter.matches('run_in_terminal', { command: 'eslint src' }));
		ok(linterFilter.matches('run_in_terminal', { command: 'ruff check .' }));
		ok(linterFilter.matches('run_in_terminal', { command: 'cargo clippy' }));
	});
});

suite('envFilter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches env / printenv with no args', () => {
		ok(envFilter.matches('run_in_terminal', { command: 'env' }));
		ok(envFilter.matches('run_in_terminal', { command: 'printenv' }));
	});

	test('sorts and dedupes lines', () => {
		const text = ['ZSH=/bin/zsh', 'PATH=/usr/bin', 'PATH=/usr/bin', 'HOME=/home/u'].join('\n');
		const out = envFilter.apply(text, { command: 'env' });
		strictEqual(out.compressed, true);
		// Sorted alphabetically.
		const lines = out.text.split('\n');
		ok(lines.indexOf('HOME=/home/u') < lines.indexOf('PATH=/usr/bin'));
		ok(lines.indexOf('PATH=/usr/bin') < lines.indexOf('ZSH=/bin/zsh'));
		// Deduped.
		strictEqual(lines.filter(l => l === 'PATH=/usr/bin').length, 1);
	});
});

suite('isProtectedFromCompression', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('protects JSON object output', () => {
		ok(isProtectedFromCompression('{"a":1,"b":[1,2,3]}'));
	});
	test('protects JSON array output', () => {
		ok(isProtectedFromCompression('[1, 2, 3, {"k":"v"}]'));
	});
	test('protects YAML headers', () => {
		ok(isProtectedFromCompression('---\nfoo: bar\nbaz: 1\n'));
	});
	test('protects TOML headers', () => {
		ok(isProtectedFromCompression('[package]\nname = "x"\n'));
	});
	test('does not protect plain text', () => {
		ok(!isProtectedFromCompression('hello world\nsome output\n'));
	});
	test('does not protect malformed JSON', () => {
		ok(!isProtectedFromCompression('{ this is { not json }'));
	});
});
