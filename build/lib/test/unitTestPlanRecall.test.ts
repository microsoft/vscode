/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';
import { compareFailuresWithPlan } from '../unitTestPlanRecall.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

interface IStep {
	readonly id?: string;
	readonly name?: string;
	readonly if?: string;
	readonly uses?: string;
	readonly run?: string;
	readonly env?: Record<string, string>;
	readonly with?: Record<string, string>;
	readonly 'continue-on-error'?: boolean;
}

function miss(file: string): string {
	return `::warning file=${file},title=Unit test plan miss::${file} failed on Linux, but the unit test plan did not select it, so macOS and Windows did not run it.`;
}

suite('Unit test plan recall', () => {
	test('warns about each failed test file that the plan did not select', () => {
		assert.deepStrictEqual(compareFailuresWithPlan(new Set(['src/vs/a.test.ts', 'src/vs/b.test.ts']), [
			{ failed: ['src/vs/c.test.ts', 'src/vs/a.test.ts'], flaky: ['src/vs/b.test.ts', 'src/vs/e.test.ts'], unattributed: [] },
			{ failed: ['src/vs/c.test.ts'], flaky: ['src/vs/a.test.ts'], unattributed: ['Errors should not have unexpected errors in tests'] },
		]), {
			commands: [miss('src/vs/c.test.ts')],
			summary: [
				'### Unit test plan recall',
				'',
				'Linux runs every unit test, while macOS and Windows only ran the 2 unit test files that the unit test plan selected. The plan selected 1 of the 2 test files that failed in this job:',
				'',
				'- `src/vs/c.test.ts`: **not selected**, so macOS and Windows did not run it',
				'- `src/vs/a.test.ts`: selected',
				'',
				'Not counted, because they passed when rerun (flaky): `src/vs/b.test.ts`, `src/vs/e.test.ts`',
				'',
				'Not counted, because they do not belong to a test file: `Errors should not have unexpected errors in tests`',
				'',
			].join('\n'),
		});
	});

	test('every failed test file is a miss when the plan selects none, with at most 10 warnings', () => {
		const files = Array.from({ length: 11 }, (_, i) => `src/vs/f${String(i).padStart(2, '0')}.test.ts`);
		assert.deepStrictEqual(compareFailuresWithPlan(new Set(), [{ failed: files, flaky: [], unattributed: [] }]), {
			commands: [
				...files.slice(0, 9).map(miss),
				'::warning title=Unit test plan miss::2 more test files failed on Linux, but the unit test plan did not select them. See the job summary.',
			],
			summary: [
				'### Unit test plan recall',
				'',
				'Linux runs every unit test, while macOS and Windows ran none, because the unit test plan selected no unit test file. The plan selected 0 of the 11 test files that failed in this job:',
				'',
				...files.map(file => `- \`${file}\`: **not selected**, so macOS and Windows did not run it`),
				'',
			].join('\n'),
		});
	});

	test('failures outside test files and runs without a report cannot be compared', () => {
		const selected = new Set(['src/vs/a.test.ts']);
		assert.deepStrictEqual([
			compareFailuresWithPlan(selected, [{ failed: [], flaky: [], unattributed: ['"after all" hook:\nclean `state`'] }]),
			compareFailuresWithPlan(selected, [{ failed: [], flaky: ['src/vs/b.test.ts'], unattributed: [] }]),
		], [{
			commands: [],
			summary: [
				'### Unit test plan recall',
				'',
				'Linux runs every unit test, while macOS and Windows only ran the 1 unit test file that the unit test plan selected. No test file failed in this job.',
				'',
				'Not counted, because they do not belong to a test file: `"after all" hook: clean \'state\'`',
				'',
			].join('\n'),
		}, {
			commands: [],
			summary: [
				'### Unit test plan recall',
				'',
				'The unit tests failed without reporting which test files failed, for example because a test file failed to load or a test runner crashed, so the failures cannot be compared with the unit test plan.',
				'',
				'Not counted, because they passed when rerun (flaky): `src/vs/b.test.ts`',
				'',
			].join('\n'),
		}]);
	});

	test('warnings escape the test file', () => {
		assert.deepStrictEqual(compareFailuresWithPlan(new Set(), [{ failed: ['src/vs/50%,a:b.test.ts'], flaky: [], unattributed: [] }]).commands, [
			'::warning file=src/vs/50%25%2Ca%3Ab.test.ts,title=Unit test plan miss::src/vs/50%25,a:b.test.ts failed on Linux, but the unit test plan did not select it, so macOS and Windows did not run it.',
		]);
	});

	test('the Linux unit test jobs compare their failures with the plan only after a unit test step failed', () => {
		const workflow = load(readFileSync(path.join(repositoryRoot, '.github/workflows/pr-linux-test.yml'), 'utf8')) as { readonly jobs: Record<string, { readonly steps: readonly IStep[] }> };
		const steps = Object.values(workflow.jobs).flatMap(job => job.steps);
		const unitTestSteps = steps.filter(step => step.name?.startsWith('🧪 Run unit tests'));
		const download = steps.find(step => step.uses?.startsWith('actions/download-artifact@') && step.with?.pattern === 'unit-test-plan');
		const compare = steps.find(step => step.run?.startsWith('node build/lib/unitTestPlanRecall.ts '));
		assert.deepStrictEqual({
			reports: unitTestSteps.map(step => step.env?.VSCODE_TEST_FAILURE_REPORT),
			download: { if: download?.if, path: download?.with?.path, continueOnError: download?.['continue-on-error'] },
			compare: { if: compare?.if, run: compare?.run, continueOnError: compare?.['continue-on-error'] },
		}, {
			reports: ['.build/unit-test-failures/electron.json', '.build/unit-test-failures/node.json', '.build/unit-test-failures/browser.json'],
			download: {
				if: `\${{ !cancelled() && (${unitTestSteps.map(step => `steps.${step.id}.outcome == 'failure'`).join(' || ')}) }}`,
				path: '.build/unit-test-plan',
				continueOnError: true,
			},
			compare: {
				if: `\${{ !cancelled() && steps.${download?.id}.outcome == 'success' }}`,
				run: 'node build/lib/unitTestPlanRecall.ts .build/unit-test-plan .build/unit-test-failures',
				continueOnError: true,
			},
		});
	});
});
