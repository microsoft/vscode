/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';
import { detectChanges } from '../../../.github/actions/detect-changes/detect.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const coreTestOutputs = ['unit-tests', 'browser-integration', 'product-tests'];

interface IWorkflowJob {
	readonly name?: string;
	readonly needs?: string | readonly string[];
	readonly if?: string;
	readonly uses?: string;
	readonly with?: Record<string, unknown>;
	readonly outputs?: Record<string, string>;
	readonly strategy?: { readonly matrix: { readonly include?: readonly IRequiredCheck[] } };
}

interface IRequiredCheck {
	readonly check: string;
	readonly parts: readonly { readonly job: string; readonly output: string }[];
}

async function detect(files: readonly { filename: string; previous_filename?: string }[], expectedCount = files.length, failure?: Error) {
	const outputs: Record<string, string> = {};
	await detectChanges({
		paginate: async (_method, parameters) => {
			assert.equal(parameters.per_page, 100);
			if (failure) {
				throw failure;
			}
			return files;
		},
		rest: { pulls: { listFiles: {} } },
	}, {
		repo: { owner: 'microsoft', repo: 'vscode' },
		issue: { number: 1 },
		payload: { pull_request: { changed_files: expectedCount } },
	}, {
		info: () => { },
		warning: () => { },
		setOutput: (name, value) => outputs[name] = value,
	});
	return outputs;
}

async function detectCoreTests(...filenames: string[]): Promise<string[]> {
	const outputs = await detect(filenames.map(filename => ({ filename })));
	return coreTestOutputs.map(output => outputs[output]);
}

function loadWorkflow(): { readonly jobs: Record<string, IWorkflowJob> } {
	return load(readFileSync(path.join(repositoryRoot, '.github/workflows/pr.yml'), 'utf8')) as { readonly jobs: Record<string, IWorkflowJob> };
}

/** Names of the built-in extensions whose files the core tests import or read by repository path. */
function extensionsReadByCoreTests(): Map<string, string> {
	const extensionsRoot = path.join(repositoryRoot, 'extensions');
	const reference = /(?:from\s+['"](?<relative>(?:\.\.\/)+)|['"`])extensions\/(?<name>[a-z0-9-]+)\/(?<rest>[^'"`\s]+)/g;
	// git grep narrows thousands of test files down to the few that mention an extension path.
	const candidates = execFileSync('git', ['grep', '-l', '-E', 'extensions/[a-z0-9-]+/', '--', 'src/**/test/**', 'test/unit/**'], { cwd: repositoryRoot, encoding: 'utf8' })
		.split('\n')
		.filter(file => /\.(ts|js|mjs)$/.test(file));
	const result = new Map<string, string>();
	for (const candidate of candidates) {
		const file = path.join(repositoryRoot, candidate);
		for (const match of readFileSync(file, 'utf8').matchAll(reference)) {
			const { relative, name, rest } = match.groups!;
			const extensionPath = relative !== undefined
				? path.resolve(path.dirname(file), `${relative}extensions/${name}`)
				: path.join(extensionsRoot, name);
			// Skips imports such as `../../extensions/common/...` that resolve into the core sources.
			if (extensionPath !== path.join(extensionsRoot, name) || !existsSync(extensionPath)) {
				continue;
			}
			// Template literals name a file only at runtime.
			if (rest.includes('${') || existsSync(path.join(extensionPath, rest))) {
				result.set(name, candidate);
			}
		}
	}
	return result;
}

suite('Detect Changes', () => {
	test('core test jobs run unless every change is one they cannot read', async () => {
		const cases: [string, string[]][] = [
			['src/vs/base/common/async.ts', ['true', 'true', 'true']],
			['src/vs/workbench/contrib/chat/README.md', ['true', 'true', 'true']],
			['test/smoke/README.md', ['true', 'true', 'true']],
			['README.md', ['false', 'false', 'false']],
			['.github/skills/unit-tests/SKILL.md', ['false', 'false', 'false']],
			['cli/src/commands/tunnels.rs', ['false', 'false', 'false']],
			['copilot_shim/src/main.rs', ['false', 'false', 'false']],
			['extensions/copilot/src/extension/extension.ts', ['false', 'false', 'true']],
			['extensions/git/src/repository.ts', ['false', 'true', 'true']],
			['extensions/markdown-language-features/test-workspace/a.md', ['false', 'true', 'true']],
			['extensions/theme-defaults/themes/dark_modern.json', ['true', 'true', 'true']],
			['extensions/typescript-basics/syntaxes/TypeScript.tmLanguage.json', ['true', 'true', 'true']],
			['extensions/package.json', ['true', 'true', 'true']],
			['.github/workflows/pr.yml', ['true', 'true', 'true']],
			['.github/workflows/pr-linux-test.yml', ['true', 'true', 'true']],
			['.github/actions/detect-changes/detect.ts', ['true', 'true', 'true']],
			['build/gulpfile.ts', ['true', 'true', 'true']],
			['package.json', ['true', 'true', 'true']],
		];
		const results: [string, string[]][] = [];
		for (const [filename] of cases) {
			results.push([filename, await detectCoreTests(filename)]);
		}
		assert.deepStrictEqual(results, cases);
	});

	test('every changed path must be one the tests cannot read', async () => {
		assert.deepStrictEqual([
			await detectCoreTests('extensions/copilot/package.json', 'README.md', 'cli/Cargo.toml'),
			await detectCoreTests('extensions/copilot/package.json', 'extensions/git/package.json'),
			await detectCoreTests('extensions/copilot/package.json', 'src/vs/base/common/async.ts'),
		], [
			['false', 'false', 'true'],
			['false', 'true', 'true'],
			['true', 'true', 'true'],
		]);
	});

	test('both sides of a rename participate in selection', async () => {
		const outputs = await detect([{ filename: 'docs/async.md', previous_filename: 'src/vs/base/common/async.ts' }]);
		assert.deepStrictEqual(coreTestOutputs.map(output => outputs[output]), ['true', 'true', 'true']);
	});

	test('failed, incomplete and empty changed-file lookups run the core tests', async () => {
		const [failed, incomplete, empty] = await Promise.all([
			detect([], 0, new Error('lookup unavailable')),
			detect([], 1),
			detect([]),
		]);
		for (const outputs of [failed, incomplete]) {
			assert.ok(Object.values(outputs).every(value => value === 'true'), JSON.stringify(outputs));
		}
		assert.deepStrictEqual(coreTestOutputs.map(output => empty[output]), ['true', 'true', 'true']);
	});

	test('the unit tests run for every built-in extension whose files the core tests read', async () => {
		const extensions = extensionsReadByCoreTests();
		assert.ok(extensions.has('theme-defaults'), 'the scan should find the component fixture themes');
		const skipped: string[] = [];
		for (const [name, reader] of extensions) {
			const [unitTests] = await detectCoreTests(`extensions/${name}/package.json`);
			if (unitTests !== 'true') {
				skipped.push(`extensions/${name}/ (read by ${reader})`);
			}
		}
		assert.deepStrictEqual(skipped, [], 'add these extensions to extensionsReadByUnitTests in .github/actions/detect-changes/detect.ts');
	});

	test('the action and the workflow pass on every output the detector sets', async () => {
		const outputs = Object.keys(await detect([{ filename: 'README.md' }])).sort();
		const action = load(readFileSync(path.join(repositoryRoot, '.github/actions/detect-changes/action.yml'), 'utf8')) as { readonly outputs: Record<string, unknown> };
		assert.deepStrictEqual(Object.keys(action.outputs).sort(), outputs);
		// The changes job also passes on the outputs of the Agent Host E2E change detection, and combines both for the
		// Linux and macOS Electron jobs, which also run Agent Host E2E.
		const agentHostOutputs = ['agent-host-e2e', 'agent-host-test-profile', 'agent-host-test-profile-reason', 'electron-tests'];
		assert.deepStrictEqual(Object.keys(loadWorkflow().jobs.changes.outputs ?? {}).sort(), [...outputs, ...agentHostOutputs].sort());
	});

	test('the required core test checks report from jobs that skip only when the changes cannot affect them', () => {
		const { jobs } = loadWorkflow();
		const reporter = jobs['required-checks'];
		const checks = reporter.strategy?.matrix.include ?? [];
		const expected = ['Linux', 'macOS', 'Windows'].flatMap(os =>
			['Electron-Unit', 'Electron', 'Electron-Smoke', 'Browser', 'Remote'].map(job => `${os} / ${job}`));
		assert.deepStrictEqual(checks.map(({ check }) => check).sort(), expected.sort());
		assert.equal(reporter.if, '${{ always() }}');
		assert.ok(reporter.needs?.includes('changes'));

		const declaredOutputs = Object.keys(jobs.changes.outputs ?? {});
		for (const { check, parts } of checks) {
			for (const { job, output } of parts) {
				const testJob = jobs[job];
				assert.ok(testJob, `${check}: missing job ${job}`);
				assert.ok(declaredOutputs.includes(output), `${check}: undeclared output ${output}`);
				assert.ok(reporter.needs?.includes(job), `${check}: required-checks does not need ${job}`);
				assert.equal(testJob.needs, 'changes', job);
				assert.equal(testJob.if, `\${{ !cancelled() && (needs.changes.result != 'success' || needs.changes.outputs.${output} == 'true') }}`, job);
				// A test job that reported the required name itself would report it as skipped, which passes.
				assert.notEqual(`${testJob.name} / ${testJob.with?.job_name}`, check, job);
			}
		}

		const testJobs = Object.entries(jobs)
			.filter(([, job]) => /^\.\/\.github\/workflows\/pr-(linux|darwin|win32)-test\.yml$/.test(job.uses ?? ''))
			.map(([id]) => id);
		assert.deepStrictEqual(testJobs.sort(), checks.flatMap(({ parts }) => parts.map(({ job }) => job)).sort());
	});
});
