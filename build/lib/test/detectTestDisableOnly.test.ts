/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';
import ts from 'typescript';
import { checkChangedFiles, detectTestDisableOnly, type IChangedFile, type IDetectTestDisableOnlyOptions, verifyTestFileChange } from '../../../.github/actions/detect-test-disable-only/detect.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const actionPath = './.base/.github/actions/detect-test-disable-only';

const testFile = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isWindows } from '../../../base/common/platform.js';

suite('Foo', () => {
	test('adds', () => {
		assert.strictEqual(1 + 1, 2);
	});

	// Explains the next test.
	test('formats', () => {
		const text = \`
test('inside a template', () => { });
\`;
		assert.ok(text);
	});

	(isWindows ? test : test.skip)('runs on Windows', () => { });

	test('times out', () => {
	}).timeout(1000);

	setup(() => { });
});

suite('Bar', () => {
	// eslint-disable-next-line local/code-no-test-async-suite
	suite('async', async () => { });

	test('casts', () => {
		// eslint-disable-next-line local/code-no-any-casts
		assert.ok((1 as any) === 1);
	});
});
`;

/** Applies replacements to `text`, and fails when one does not apply. */
function edit(text: string, ...replacements: [string, string][]): string {
	for (const [search, replace] of replacements) {
		assert.ok(text.includes(search), `missing: ${search}`);
		text = text.replace(search, replace);
	}
	return text;
}

const skipAdds: [string, string] = ['\ttest(\'adds\'', '\ttest.skip(\'adds\''];

function verify(before: string, after: string): string | string[] {
	const result = verifyTestFileChange(ts, 'src/vs/foo/test/common/foo.test.ts', before, after);
	return typeof result === 'string' ? result : result.map(test => `${test.line}: ${test.call} '${test.title}'`);
}

function git(cwd: string, ...args: string[]): string {
	return execFileSync('git', ['-c', 'protocol.file.allow=always', '-C', cwd, ...args], { encoding: 'utf8' });
}

interface IWorkflowStep {
	readonly id?: string;
	readonly uses?: string;
	readonly run?: string;
	readonly with?: Record<string, string>;
	readonly 'continue-on-error'?: boolean;
}

interface IWorkflowJob {
	readonly needs?: string | readonly string[];
	readonly if?: string;
	readonly outputs?: Record<string, string>;
	readonly steps?: readonly IWorkflowStep[];
}

function loadWorkflow(name: string): Record<string, IWorkflowJob> {
	return (load(readFileSync(path.join(repositoryRoot, '.github/workflows', name), 'utf8')) as { readonly jobs: Record<string, IWorkflowJob> }).jobs;
}

/** Checks that a job loads the detection from the pull request base, and fails safe. */
function assertDetectsFromBase(job: IWorkflowJob): void {
	const steps = job.steps ?? [];
	const checkout = steps.find(step => step.with?.path === '.base');
	const detection = steps.find(step => step.id === 'test-disable-only');
	assert.deepStrictEqual([checkout?.with, checkout?.['continue-on-error'], detection?.uses, detection?.['continue-on-error'], job.outputs?.['test-disable-only']], [
		{ ref: '${{ github.event.pull_request.base.sha }}', path: '.base', filter: 'blob:none', 'sparse-checkout': '.github/actions/detect-test-disable-only' },
		true,
		actionPath,
		true,
		'${{ steps.test-disable-only.outputs.verified == \'true\' }}',
	]);
}

suite('Detect Test-Disable-Only Changes', () => {
	test('accepts .skip and comments added to test and suite calls, and rejects everything else', () => {
		const localTest = `function test(name: string, fn: () => void) { fn(); }\n${testFile}`;
		const importedTest = `import { test } from './utils';\n${testFile}`;
		const globalTest = `const original = globalThis['test'];\n${testFile}`;
		const vitest = 'import { describe, it } from \'vitest\';\n\ndescribe(\'a\', () => {\n\tit(\'b\', () => { });\n});\n';
		const cases: [string, string, string?][] = [
			['test.skip', edit(testFile, skipAdds)],
			['suite.skip', edit(testFile, ['suite(\'Foo\'', 'suite.skip(\'Foo\'']),],
			['both branches of a condition', edit(testFile, ['(isWindows ? test : test.skip)', '(isWindows ? test.skip : test.skip)'])],
			['two tests', edit(testFile, skipAdds, ['\ttest(\'formats\'', '\ttest.skip(\'formats\''])],
			['comment above', edit(testFile, ['\ttest(\'adds\'', '\t// Flaky: https://github.com/microsoft/vscode/issues/1\n\ttest.skip(\'adds\''])],
			['comments above a comment', edit(testFile, ['\t// Explains', '\t// TODO@someone flaky\n\t//\n\t// Explains'], ['\ttest(\'formats\'', '\ttest.skip(\'formats\''])],
			['comment appended', edit(testFile, ['\ttest(\'adds\', () => {', '\ttest.skip(\'adds\', () => { // Flaky \u2014 https://github.com/microsoft/vscode/issues/1'])],
			['vitest', edit(vitest, ['\tit(', '\tit.skip(']), vitest],
			['only adds comments', edit(testFile, ['\ttest(\'adds\'', '\t// Flaky\n\ttest(\'adds\''])],
			['un-skips', edit(testFile, ['(isWindows ? test : test.skip)', '(isWindows ? test : test)'])],
			['adds a condition', edit(testFile, ['\ttest(\'adds\'', '\t(isWindows ? test.skip : test)(\'adds\''])],
			['changes an assertion', edit(testFile, skipAdds, ['1 + 1, 2', '1 + 1, 3'])],
			['changes whitespace', edit(testFile, skipAdds, ['assert.ok(text);', 'assert.ok(text) ;'])],
			['adds this.skip()', edit(testFile, ['\ttest(\'adds\', () => {', '\ttest(\'adds\', function () {\n\t\tthis.skip();'])],
			['removes a line', edit(testFile, skipAdds, ['\t// Explains the next test.\n', ''])],
			['removes the final newline', edit(testFile, skipAdds).slice(0, -1)],
			['skips inside a template', edit(testFile, skipAdds, ['test(\'inside', 'test.skip(\'inside'])],
			['adds a comment inside a template', edit(testFile, skipAdds, ['test(\'inside', '// note\ntest(\'inside'])],
			['skips a call whose result is used', edit(testFile, ['\ttest(\'times out\'', '\ttest.skip(\'times out\''])],
			['skips another call', edit(testFile, ['\tsetup(', '\tsetup.skip('])],
			['skips a call that a directive applies to', edit(testFile, ['\tsuite(\'async\'', '\tsuite.skip(\'async\''])],
			['skips a test with a directive in its body', edit(testFile, ['\ttest(\'casts\'', '\ttest.skip(\'casts\''])],
			['adds a comment below a directive', edit(testFile, ['\tsuite(\'async\'', '\t// Flaky\n\tsuite.skip(\'async\''])],
			['adds a directive', edit(testFile, ['\ttest(\'adds\'', '\t// @ts-expect-error\n\ttest.skip(\'adds\''])],
			['adds non-ASCII', edit(testFile, ['\ttest(\'adds\'', '\t// Fl\u00e4ky\n\ttest.skip(\'adds\''])],
			['indents a comment differently', edit(testFile, ['\ttest(\'adds\'', '\t\t// Flaky\n\ttest.skip(\'adds\''])],
			['adds a comment elsewhere', edit(testFile, skipAdds, ['\tsetup(', '\t// Flaky\n\tsetup('])],
			['appends a comment to another line', edit(testFile, skipAdds, ['1 + 1, 2);', '1 + 1, 2); // Flaky'])],
			['skips a local test function', edit(localTest, skipAdds), localTest],
			['skips an imported test function', edit(importedTest, skipAdds), importedTest],
			['accesses a global test function', edit(globalTest, skipAdds), globalTest],
			['has carriage returns', edit(testFile, skipAdds).replace(/\n/g, '\r\n'), testFile.replace(/\n/g, '\r\n')],
		];
		assert.deepStrictEqual(cases.map(([name, after, before = testFile]) => [name, verify(before, after)]), [
			['test.skip', ['10: test.skip \'adds\'']],
			['suite.skip', ['9: suite.skip \'Foo\'']],
			['both branches of a condition', ['22: (... ? test.skip : ...) \'runs on Windows\'']],
			['two tests', ['10: test.skip \'adds\'', '15: test.skip \'formats\'']],
			['comment above', ['11: test.skip \'adds\'']],
			['comments above a comment', ['17: test.skip \'formats\'']],
			['comment appended', ['10: test.skip \'adds\'']],
			['vitest', ['4: it.skip \'b\'']],
			['only adds comments', 'adds no \'.skip\''],
			['un-skips', 'line 22: changes more than inserting \'.skip\' or comments'],
			['adds a condition', 'line 10: changes more than inserting \'.skip\' or comments'],
			['changes an assertion', 'line 11: changes more than inserting \'.skip\' or comments'],
			['changes whitespace', 'line 19: changes more than inserting \'.skip\' or comments'],
			['adds this.skip()', 'line 10: changes more than inserting \'.skip\' or comments'],
			['removes a line', 'line 14: changes more than inserting \'.skip\' or comments'],
			['removes the final newline', 'removes or changes line 39'],
			['skips inside a template', 'changes code other than inserting \'.skip\''],
			['adds a comment inside a template', 'changes code other than inserting \'.skip\''],
			['skips a call whose result is used', 'line 24: the result of \'test.skip(...)\' is used'],
			['skips another call', 'line 27: \'setup\' is not one of test, suite, it, describe'],
			['skips a call that a directive applies to', 'line 31: a directive may apply to the call on the next line'],
			['skips a test with a directive in its body', 'line 34: an ESLint directive applies to the call or its body'],
			['adds a comment below a directive', 'line 32: the comment would move a directive away from its line'],
			['adds a directive', 'line 10: changes more than inserting \'.skip\' or comments'],
			['adds non-ASCII', 'line 10: changes more than inserting \'.skip\' or comments'],
			['indents a comment differently', 'line 10: the comment must be indented like the call on line 11'],
			['adds a comment elsewhere', 'line 27: comments can only be added above a skipped call'],
			['appends a comment to another line', 'line 11: changes more than inserting \'.skip\' or comments'],
			['skips a local test function', 'line 11: \'test\' is not the test framework\'s (declared in the file)'],
			['skips an imported test function', 'line 11: \'test\' is not the test framework\'s (imported from \'./utils\')'],
			['accesses a global test function', 'accesses \'globalThis[...]\''],
			['has carriage returns', 'contains carriage returns'],
		]);
	});

	test('accepts only modified regular test files, outside of test inputs', () => {
		const file = (path: string, status = 'M', oldMode = '100644', newMode = oldMode): IChangedFile => ({ path, status, oldMode, newMode, oldBlob: '1', newBlob: '2' });
		const cases: [string, IChangedFile[]][] = [
			['test files', [file('src/vs/a/test/common/a.test.ts'), file('extensions/copilot/src/b.spec.ts'), file('src/vs/c/test/node/c.integrationTest.ts'), file('test/componentFixtures/playwright/tests/d.spec.ts')]],
			['no files', []],
			['21 files', Array.from({ length: 21 }, (_, i) => file(`src/vs/a/test/common/a${i}.test.ts`))],
			['a source file', [file('src/vs/a/test/common/a.test.ts'), file('src/vs/a/common/a.ts')]],
			['a test helper', [file('src/vs/a/test/common/testUtils.ts')]],
			['a test input', [file('extensions/copilot/test/simulation/fixtures/tests/a.test.ts')]],
			['an added test', [file('src/vs/a/test/common/a.test.ts', 'A', '000000', '100644')]],
			['a deleted test', [file('src/vs/a/test/common/a.test.ts', 'D', '100644', '000000')]],
			['a mode change', [file('src/vs/a/test/common/a.test.ts', 'M', '100644', '100755')]],
			['a symbolic link', [file('src/vs/a/test/common/a.test.ts', 'M', '120000')]],
		];
		assert.deepStrictEqual(cases.map(([name, files]) => [name, checkChangedFiles(files)]), [
			['test files', undefined],
			['no files', 'changes no files'],
			['21 files', 'changes 21 files'],
			['a source file', 'src/vs/a/common/a.ts: not a test file'],
			['a test helper', 'src/vs/a/test/common/testUtils.ts: not a test file'],
			['a test input', 'extensions/copilot/test/simulation/fixtures/tests/a.test.ts: in a folder of test inputs'],
			['an added test', 'src/vs/a/test/common/a.test.ts: only modifications are allowed (git status A)'],
			['a deleted test', 'src/vs/a/test/common/a.test.ts: only modifications are allowed (git status D)'],
			['a mode change', 'src/vs/a/test/common/a.test.ts: changes the mode or is not a regular file'],
			['a symbolic link', 'src/vs/a/test/common/a.test.ts: changes the mode or is not a regular file'],
		]);
	});

	test('verifies the merge commit that the checks test, and fails safe', async () => {
		const root = mkdtempSync(path.join(tmpdir(), 'detect-test-disable-only-'));
		try {
			// A remote with a pull request that skips a test, and the merge that the checks test.
			const remote = path.join(root, 'remote.git');
			const work = path.join(root, 'work');
			git(root, 'init', '-q', '--bare', remote);
			// --git-dir also works where safe.bareRepository requires it for bare repositories.
			git(root, `--git-dir=${remote}`, 'config', 'uploadpack.allowFilter', 'true');
			git(root, `--git-dir=${remote}`, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
			git(root, 'init', '-q', '-b', 'main', work);
			git(work, 'config', 'user.email', 'test@example.com');
			git(work, 'config', 'user.name', 'Test');
			git(work, 'config', 'commit.gpgsign', 'false');
			const file = 'src/vs/foo/test/common/foo.test.ts';
			mkdirSync(path.join(work, path.dirname(file)), { recursive: true });
			writeFileSync(path.join(work, file), testFile);
			writeFileSync(path.join(work, 'README.md'), 'base\n');
			git(work, 'add', '-A');
			git(work, 'commit', '-q', '-m', 'base');
			git(work, 'checkout', '-q', '-b', 'pr');
			writeFileSync(path.join(work, file), edit(testFile, skipAdds));
			git(work, 'commit', '-q', '-am', 'skip');
			const head = git(work, 'rev-parse', 'HEAD').trim();
			// The base branch moves on before the merge, which its diff to the merge must not include.
			git(work, 'checkout', '-q', 'main');
			writeFileSync(path.join(work, 'README.md'), 'changed on main\n');
			git(work, 'commit', '-q', '-am', 'main');
			git(work, 'merge', '-q', '--no-ff', '-m', 'merge', 'pr');
			const merge = git(work, 'rev-parse', 'HEAD').trim();
			git(work, 'push', '-q', remote, 'main~1:refs/heads/main', `${merge}:refs/pull/1/merge`);

			// A partial clone of the base, as actions/checkout creates it.
			const base = path.join(root, 'base');
			git(root, 'init', '-q', base);
			git(base, 'remote', 'add', 'origin', `file://${remote}`);
			git(base, 'fetch', '-q', '--no-tags', '--depth=1', '--filter=blob:none', 'origin', 'main');

			const run = async (options: { readonly files?: string[]; readonly headSha?: string; readonly git?: (args: readonly string[]) => string } = {}) => {
				const outputs: Record<string, string> = {};
				const messages: string[] = [];
				let summary = '';
				await detectTestDisableOnly({
					git: options.git ?? (args => git(base, ...args)),
					github: { paginate: async () => (options.files ?? [file]).map(filename => ({ filename, status: 'modified' })), rest: { pulls: { listFiles: {} } } },
					loadTypeScript: async () => ts,
					context: { eventName: 'pull_request', sha: merge, repo: { owner: 'microsoft', repo: 'vscode' }, payload: { pull_request: { number: 1, changed_files: 1, head: { sha: options.headSha ?? head } } } },
					core: {
						info: message => messages.push(message),
						notice: message => messages.push(`notice: ${message}`),
						warning: message => messages.push(`warning: ${message}`),
						setOutput: (name, value) => outputs[name] = value,
						summary: { addRaw(text) { summary += text; return this; }, write: async () => undefined },
					},
				} satisfies IDetectTestDisableOnlyOptions);
				return { verified: outputs.verified, message: messages.at(-1), summary };
			};

			const skipped = await run();
			assert.deepStrictEqual([skipped.verified, skipped.message], ['true', `notice: The pull request only disables tests, so the checks skip the tests: ${file}:10 test.skip 'adds'`]);
			assert.ok(skipped.summary.includes(`| \`test.skip\` | adds | ${file}:10 |`), skipped.summary);

			let gitCalls = 0;
			const results = await Promise.all([
				run({ files: [file, 'README.md'], git: args => { gitCalls++; return git(base, ...args); } }),
				run({ headSha: merge }),
				run({ git: () => { throw new Error('git failed'); } }),
			]);
			assert.deepStrictEqual([...results.map(({ verified, message }) => [verified, message]), gitCalls], [
				['false', 'All checks run: README.md: not a test file'],
				['false', `All checks run: ${merge} is not a merge of the pull request head ${merge}`],
				['false', 'All checks run: the detection failed'],
				0,
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('the checks load the detection from the pull request base, and skip only what it verifies', () => {
		const pr = loadWorkflow('pr.yml');
		assertDetectsFromBase(pr.changes);
		// Every output that selects jobs must be 'false' when the pull request only disables tests.
		const forced = '${{ steps.test-disable-only.outputs.verified == \'true\' && \'false\' || ';
		const selecting = Object.entries(pr.changes.outputs ?? {}).filter(([name]) => !['test-disable-only', 'agent-host-test-profile', 'agent-host-test-profile-reason', 'electron-tests'].includes(name));
		assert.deepStrictEqual(selecting.filter(([, value]) => !value.startsWith(forced)), []);
		assert.ok(pr.changes.outputs?.['electron-tests'].startsWith('${{ steps.test-disable-only.outputs.verified != \'true\' && ('));
		assert.deepStrictEqual([pr.compile.needs, pr.compile.if], ['changes', '${{ !cancelled() && (needs.changes.result != \'success\' || needs.changes.outputs.test-disable-only != \'true\') }}']);

		for (const [workflow, aggregator] of [['component-fixtures.yml', 'component-fixtures'], ['monaco-editor.yml', undefined]] as const) {
			const jobs = loadWorkflow(workflow);
			assertDetectsFromBase(jobs.changes);
			const gated = Object.entries(jobs).filter(([id]) => id !== 'changes' && id !== aggregator);
			assert.deepStrictEqual(gated.map(([id, job]) => [id, job.needs, job.if]), gated.map(([id]) => [id, 'changes', '${{ !cancelled() && needs.changes.outputs.test-disable-only != \'true\' }}']), workflow);
		}
		const aggregator = loadWorkflow('component-fixtures.yml')['component-fixtures'];
		assert.ok(aggregator.needs?.includes('changes'));
		assert.ok(aggregator.steps?.[0].run?.includes('if [[ \'${{ needs.changes.outputs.test-disable-only }}\' == \'true\' &&'));

		const workflows = ['pr.yml', 'component-fixtures.yml', 'monaco-editor.yml', 'pr-linux-test.yml', 'pr-darwin-test.yml', 'pr-win32-test.yml', 'telemetry.yml', 'codeql.yml'];
		const uses = workflows.flatMap(workflow => Object.values(loadWorkflow(workflow)).flatMap(job => (job.steps ?? []).map(step => step.uses)));
		assert.deepStrictEqual([...new Set(uses.filter(use => use?.includes('detect-test-disable-only')))], [actionPath]);

		assert.match(readFileSync(path.join(repositoryRoot, '.github/CODEOWNERS'), 'utf8'), /^\.github\/actions\/detect-test-disable-only\/ @/m);
	});
});
