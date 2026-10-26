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
	readonly steps?: readonly { readonly id?: string; readonly name?: string; readonly 'continue-on-error'?: boolean; readonly env?: Record<string, string> }[];
}

/**
 * Returns the change detection output that a job reads to skip when the changes cannot affect it: in its `if:`, or, for a
 * job that calls a reusable workflow, in the `affected` input with which that workflow skips its job.
 */
function skipOutput(job: IWorkflowJob): string | undefined {
	const condition = typeof job.with?.affected === 'string' ? job.with.affected : job.if;
	return /needs\.changes\.outputs\.(?<output>[\w-]+) == 'true'/.exec(condition ?? '')?.groups?.output;
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

function loadWorkflow(file = 'pr.yml'): { readonly jobs: Record<string, IWorkflowJob> } {
	return load(readFileSync(path.join(repositoryRoot, '.github/workflows', file), 'utf8')) as { readonly jobs: Record<string, IWorkflowJob> };
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
		// And whether the pull request changes ripple, and whether ripple failed, for the Ripple job, and whether
		// the macOS and Windows test jobs have planned files to run: unit tests (for the Browser ones, browser tests),
		// node.js integration tests and Agent Host E2E suites.
		const rippleOutputs = ['ripple-changed', 'ripple-failed', 'selected-unit-tests', 'selected-browser-unit-tests', 'selected-node-integration-tests', 'selected-agent-host-e2e'];
		assert.deepStrictEqual(Object.keys(loadWorkflow().jobs.changes.outputs ?? {}).sort(), [...outputs, ...agentHostOutputs, ...rippleOutputs].sort());
	});

	test('the Ripple check runs for the pull requests that change ripple, and the planning never fails Detect Changes', () => {
		const { jobs } = loadWorkflow();
		assert.deepStrictEqual({
			outputs: [jobs.changes.outputs?.['ripple-changed'], jobs.changes.outputs?.['ripple-failed']],
			ripple: { name: jobs.ripple?.name, needs: jobs.ripple?.needs, if: jobs.ripple?.if },
			failingSteps: (jobs.changes.steps ?? []).filter(step => /ripple|plan/i.test(step.name ?? '') && step['continue-on-error'] !== true && step.id !== 'ripple').map(step => step.name),
		}, {
			outputs: ['${{ steps.ripple.outputs.changed }}', '${{ steps.ripple.outputs.failed }}'],
			ripple: { name: 'Ripple', needs: 'changes', if: `\${{ !cancelled() && needs.changes.outputs.ripple-changed == 'true' }}` },
			failingSteps: [],
		});
	});

	test('the macOS and Windows test jobs run only the planned files, and skip when the plan of a working ripple selects none', () => {
		const { jobs } = loadWorkflow();
		const macOSAndWindowsUnitTestJobs = ['macos-browser-unit-tests', 'macos-electron-unit-tests', 'windows-browser-unit-tests', 'windows-electron-unit-tests'];
		const macOSAndWindowsIntegrationTestJobs = ['macos-electron-tests', 'windows-agent-host-e2e-tests', 'windows-electron-tests'];
		const selected = (output: string) => `\${{ needs.changes.result != 'success' || needs.changes.outputs.${output} == 'true' }}`;
		assert.deepStrictEqual({
			outputs: ['selected-unit-tests', 'selected-browser-unit-tests', 'selected-node-integration-tests', 'selected-agent-host-e2e'].map(output => jobs.changes.outputs?.[output]),
			skippableUnitTests: Object.entries(jobs).filter(([, job]) => skipOutput(job) === 'selected-unit-tests').map(([id]) => id).sort(),
			skippableBrowserUnitTests: Object.entries(jobs).filter(([, job]) => skipOutput(job) === 'selected-browser-unit-tests').map(([id]) => id).sort(),
			skippableAgentHostE2E: Object.entries(jobs).filter(([, job]) => skipOutput(job) === 'selected-agent-host-e2e').map(([id]) => id).sort(),
			planned: Object.entries(jobs).filter(([, job]) => job.with?.test_selection === true).map(([id]) => id).sort(),
			// The macOS and Windows Electron jobs also run the extension host tests, so they skip their node.js
			// integration tests and Agent Host E2E steps instead.
			steps: Object.fromEntries(['linux-electron-tests', 'macos-electron-tests', 'windows-electron-tests'].map(id => [id, {
				nodeIntegrationTests: jobs[id].with?.node_integration_tests,
				agentHostE2E: jobs[id].with?.agent_host_e2e_tests,
			}])),
		}, {
			outputs: [
				`\${{ steps.detect.outputs.unit-tests == 'true' && steps.ripple.outputs.selects-nothing != 'true' }}`,
				`\${{ steps.detect.outputs.unit-tests == 'true' && steps.ripple.outputs.selects-nothing != 'true' && steps.ripple.outputs.selects-no-browser-tests != 'true' }}`,
				`\${{ steps.detect.outputs.product-tests == 'true' && steps.ripple.outputs.selects-no-node-integration-tests != 'true' }}`,
				`\${{ steps.detect-agent-host-e2e.outputs.affected == 'true' && steps.ripple.outputs.selects-no-agent-host-e2e != 'true' }}`,
			],
			skippableUnitTests: ['macos-electron-unit-tests', 'windows-electron-unit-tests'],
			skippableBrowserUnitTests: ['macos-browser-unit-tests', 'windows-browser-unit-tests'],
			skippableAgentHostE2E: ['windows-agent-host-e2e-tests'],
			planned: [...macOSAndWindowsUnitTestJobs, ...macOSAndWindowsIntegrationTestJobs].sort(),
			steps: {
				// Linux runs every node.js integration test.
				'linux-electron-tests': { nodeIntegrationTests: undefined, agentHostE2E: selected('agent-host-e2e') },
				'macos-electron-tests': { nodeIntegrationTests: selected('selected-node-integration-tests'), agentHostE2E: selected('selected-agent-host-e2e') },
				// Windows runs Agent Host E2E in its own job.
				'windows-electron-tests': { nodeIntegrationTests: selected('selected-node-integration-tests'), agentHostE2E: undefined },
			},
		});
	});

	test('the folders that Check ripple treats as not browser tests are the ones the browser runner excludes', () => {
		const runner = readFileSync(path.join(repositoryRoot, 'test/unit/browser/index.js'), 'utf8');
		const excludeGlob = /const excludeGlob = '(?<glob>[^']+)';/.exec(runner)?.groups!.glob;
		const folders = /^\*\*\/\{(?<folders>[^{}]+)\}\/\*\*\/\*\.test\.js$/.exec(excludeGlob ?? '')?.groups!.folders;
		assert.ok(folders, `unexpected excludeGlob in test/unit/browser/index.js: ${excludeGlob}`);
		const checkRipple = loadWorkflow().jobs.changes.steps?.find(step => step.id === 'ripple');
		assert.deepStrictEqual(checkRipple?.env?.BROWSER_EXCLUDED_FOLDERS, folders.split(',').join('|'));
	});

	test('the core test jobs skip only when the changes cannot affect them', () => {
		const { jobs } = loadWorkflow();
		const testJobs = Object.entries(jobs).filter(([, job]) => /^\.\/\.github\/workflows\/pr-(linux|darwin|win32)-test\.yml$/.test(job.uses ?? ''));
		const declaredOutputs = Object.keys(jobs.changes.outputs ?? {});
		// The calling jobs always run, and the job of their reusable workflow skips (see the test jobs in pr.yml).
		const skipsWhenUnaffected = (output: string) => ({
			needs: 'changes',
			if: '${{ !cancelled() }}',
			affected: `\${{ needs.changes.result != 'success' || needs.changes.outputs.${output} == 'true' }}`,
		});
		assert.deepStrictEqual({
			jobs: Object.fromEntries(testJobs.map(([id, job]) => [id, { needs: job.needs, if: job.if, affected: job.with?.affected }])),
			undeclaredOutputs: testJobs.map(([, job]) => skipOutput(job)).filter(output => !output || !declaredOutputs.includes(output)),
			reusableWorkflowJobs: ['linux', 'darwin', 'win32'].flatMap(platform => Object.values(loadWorkflow(`pr-${platform}-test.yml`).jobs).map(job => ({ name: job.name, if: job.if }))),
		}, {
			jobs: {
				'linux-electron-unit-tests': skipsWhenUnaffected('unit-tests'),
				'linux-electron-tests': skipsWhenUnaffected('electron-tests'),
				'linux-electron-smoke-test-shards': skipsWhenUnaffected('product-tests'),
				'linux-browser-unit-tests': skipsWhenUnaffected('unit-tests'),
				'linux-browser-integration-tests': skipsWhenUnaffected('browser-integration'),
				'linux-remote-tests': skipsWhenUnaffected('product-tests'),
				'macos-electron-unit-tests': skipsWhenUnaffected('selected-unit-tests'),
				'macos-electron-tests': skipsWhenUnaffected('electron-tests'),
				'macos-electron-smoke-test-shards': skipsWhenUnaffected('product-tests'),
				'macos-browser-unit-tests': skipsWhenUnaffected('selected-browser-unit-tests'),
				'macos-browser-integration-tests': skipsWhenUnaffected('browser-integration'),
				'macos-remote-tests': skipsWhenUnaffected('product-tests'),
				'windows-electron-unit-tests': skipsWhenUnaffected('selected-unit-tests'),
				'windows-electron-tests': skipsWhenUnaffected('product-tests'),
				'windows-agent-host-e2e-tests': skipsWhenUnaffected('selected-agent-host-e2e'),
				'windows-electron-smoke-test-shards': skipsWhenUnaffected('product-tests'),
				'windows-browser-unit-tests': skipsWhenUnaffected('selected-browser-unit-tests'),
				'windows-browser-integration-tests': skipsWhenUnaffected('browser-integration'),
				'windows-remote-tests': skipsWhenUnaffected('product-tests'),
			},
			undeclaredOutputs: [],
			reusableWorkflowJobs: [
				{ name: 'Linux', if: '${{ inputs.affected }}' },
				{ name: 'macOS', if: '${{ inputs.affected }}' },
				{ name: 'Windows', if: '${{ inputs.affected }}' },
			],
		});
	});

	test('a job that the changes can skip has a name without expressions', () => {
		// GitHub neither expands the matrix of a skipped job nor evaluates the expressions in its name, so a skipped
		// "chat-lib tests (${{ matrix.os }})" job would report under that name.
		const alwaysRun = ['${{ !cancelled() }}', '${{ always() }}'];
		const workflows = ['pr.yml', 'pr-linux-test.yml', 'pr-darwin-test.yml', 'pr-win32-test.yml', 'pr-linux-cli-test.yml'];
		assert.deepStrictEqual(workflows.flatMap(workflow => Object.entries(loadWorkflow(workflow).jobs)
			.filter(([, job]) => job.if !== undefined && !alwaysRun.includes(job.if) && job.name?.includes('${{'))
			.map(([id, job]) => `${workflow}: ${id}: ${job.name}`)), []);
	});

	test('compile, Monaco Editor and telemetry run after Detect Changes and appear first in the job group', () => {
		const { jobs } = loadWorkflow();
		assert.deepStrictEqual(Object.entries(jobs).slice(0, 4).map(([id, job]) => ({
			id,
			name: job.name,
			needs: job.needs,
			if: job.if,
			uses: job.uses,
		})), [
			{ id: 'changes', name: 'Detect Changes', needs: undefined, if: undefined, uses: undefined },
			{ id: 'compile', name: 'Compile & Hygiene', needs: 'changes', if: '${{ !cancelled() }}', uses: undefined },
			{ id: 'monaco-editor', name: 'Monaco Editor', needs: 'changes', if: '${{ !cancelled() }}', uses: undefined },
			{ id: 'telemetry', name: 'Telemetry', needs: 'changes', if: '${{ !cancelled() }}', uses: undefined },
		]);
	});

	test('PR Gate reports the result of every other job of the workflow', () => {
		const { jobs } = loadWorkflow();
		const gate = jobs['pr-gate'];
		const otherJobs = Object.keys(jobs).filter(id => id !== 'pr-gate');
		assert.deepStrictEqual({
			name: gate.name,
			if: gate.if,
			needs: [gate.needs ?? []].flat().sort(),
		}, {
			name: 'PR Gate',
			if: '${{ always() }}',
			needs: otherJobs.sort(),
		});
	});
});
