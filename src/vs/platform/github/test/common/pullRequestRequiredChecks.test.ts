/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PullRequestCheck, PullRequestChecks } from '../../common/githubPullRequestService.js';
import { annotateRequiredCheckDependencies, classifyRequiredPullRequestChecks, getRequiredPullRequestChecksStatus, getUnfinishedRequiredPullRequestCheckNames, parseWorkflowJobs } from '../../common/pullRequestRequiredChecks.js';

/**
 * A workflow whose `PR Gate` aggregates the jobs it needs, as microsoft/vscode's does. YAML must be indented with spaces.
 * The parser reports the empty triggers as errors, but reads the rest.
 */
const gateWorkflow = [
	'name: Code OSS',
	'on:',
	'  workflow_dispatch:',
	'  pull_request:',
	'    branches: [main]',
	'  merge_group:',
	'jobs:',
	'  changes:',
	'    name: Detect Changes',
	'    runs-on: ubuntu-latest',
	'  compile:',
	'    name: Compile & Hygiene',
	'    needs: changes',
	'    runs-on: ubuntu-latest',
	'  linux:',
	'    name: Linux',
	'    needs: [changes]',
	'    uses: ./.github/workflows/linux.yml',
	'  copilot:',
	'    name: Copilot - Test (Linux)',
	'    needs:',
	'      - compile',
	'    runs-on: ubuntu-latest',
	'  matrix:',
	'    needs: compile',
	'    strategy:',
	'      matrix:',
	'        os: [ubuntu, windows]',
	'    runs-on: ${{ matrix.os }}',
	'  smoke:',
	'    name: Smoke ${{ matrix.shard }}',
	'    needs: compile',
	'    runs-on: ubuntu-latest',
	'  report:',
	'    name: Report',
	'    needs: pr-gate',
	'    runs-on: ubuntu-latest',
	'  pr-gate:',
	'    name: PR Gate',
	'    needs:',
	'      - copilot',
	'      - linux',
	'      - matrix',
	'      - smoke',
	'    if: ${{ always() }}',
	'    runs-on: ubuntu-latest',
].join('\n');

function check(name: string, status: string, conclusion?: string, options: Partial<PullRequestCheck> = {}): PullRequestCheck {
	return { id: options.id ?? name, type: 'checkRun', name, status, ...(conclusion ? { conclusion } : {}), required: false, ...options };
}

function inRun(run: string, path = '.github/workflows/pr.yml'): Partial<PullRequestCheck> {
	return { workflowRunId: run, workflowPath: path };
}

function checks(value: readonly PullRequestCheck[], requiredContexts?: readonly string[]): PullRequestChecks {
	return { headSha: 'head', checks: value, requirednessComplete: true, ...(requiredContexts ? { requiredContexts } : {}), expectedSuites: [], expectedSuitesComplete: true };
}

suite('Required pull request checks', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads job names, needs, reusable calls and matrices from a workflow', () => {
		const jobs = parseWorkflowJobs(gateWorkflow);
		assert.deepStrictEqual({
			jobs: jobs && [...jobs.values()].map(job => [job.id, job.name, job.needs.join(','), job.reusable, job.matrix]),
			withoutJobs: parseWorkflowJobs('name: Empty\non: push\n'),
			invalid: parseWorkflowJobs('jobs: [unclosed\n'),
		}, {
			jobs: [
				['changes', 'Detect Changes', '', false, false],
				['compile', 'Compile & Hygiene', 'changes', false, false],
				['linux', 'Linux', 'changes', true, false],
				['copilot', 'Copilot - Test (Linux)', 'compile', false, false],
				['matrix', 'matrix', 'compile', false, true],
				['smoke', 'Smoke ${{ matrix.shard }}', 'compile', false, false],
				['report', 'Report', 'pr-gate', false, false],
				['pr-gate', 'PR Gate', 'copilot,linux,matrix,smoke', false, false],
			],
			withoutJobs: undefined,
			invalid: undefined,
		});
	});

	test('marks the checks a required check waits for, through reusable workflows, matrices and expressions, only within its own run', () => {
		const jobs = parseWorkflowJobs(gateWorkflow);
		const annotated = annotateRequiredCheckDependencies([
			check('Detect Changes', 'COMPLETED', 'SUCCESS', inRun('1')),
			check('Compile & Hygiene', 'COMPLETED', 'SUCCESS', inRun('1')),
			check('Linux / Electron (shard 1/2)', 'IN_PROGRESS', undefined, inRun('1')),
			check('Copilot - Test (Linux)', 'COMPLETED', 'FAILURE', inRun('1')),
			check('matrix (windows)', 'QUEUED', undefined, inRun('1')),
			check('Smoke 2', 'QUEUED', undefined, inRun('1')),
			check('Report', 'QUEUED', undefined, inRun('1')),
			// Another workflow's check of the same name is not one of the gate's jobs.
			check('Compile & Hygiene', 'COMPLETED', 'FAILURE', { id: 'other', ...inRun('2', '.github/workflows/other.yml') }),
			check('license/cla', 'COMPLETED', 'SUCCESS'),
		], ['PR Gate'], path => path === '.github/workflows/pr.yml' ? jobs : undefined);
		assert.deepStrictEqual(annotated.map(check => [check.name, check.requiredBy?.join(',') ?? '']), [
			['Detect Changes', 'PR Gate'],
			['Compile & Hygiene', 'PR Gate'],
			['Linux / Electron (shard 1/2)', 'PR Gate'],
			['Copilot - Test (Linux)', 'PR Gate'],
			['matrix (windows)', 'PR Gate'],
			['Smoke 2', 'PR Gate'],
			['Report', ''],
			['Compile & Hygiene', ''],
			['license/cla', ''],
		]);
	});

	test('takes a required check for a job named literally in any workflow, and never for one whose name is only an expression', () => {
		const workflows = new Map([
			['gate.yml', parseWorkflowJobs([
				'jobs:',
				'  gate:',
				'    name: Gate',
				'    needs: lint',
				'    runs-on: ubuntu-latest',
				'  lint:',
				'    runs-on: ubuntu-latest',
			].join('\n'))],
			['matrix.yml', parseWorkflowJobs([
				'jobs:',
				'  build:',
				'    name: ${{ matrix.os }}',
				'    needs: setup',
				'    runs-on: ubuntu-latest',
				'  setup:',
				'    runs-on: ubuntu-latest',
			].join('\n'))],
		]);
		const annotate = (required: string) => annotateRequiredCheckDependencies([
			check('lint', 'COMPLETED', 'FAILURE', inRun('1', 'gate.yml')),
			check('setup', 'COMPLETED', 'FAILURE', inRun('2', 'matrix.yml')),
		], [required], path => workflows.get(path)).map(check => [check.name, check.requiredBy?.join(',') ?? '']);
		assert.deepStrictEqual({ literal: annotate('Gate'), expression: annotate('ubuntu') }, {
			literal: [['lint', 'Gate'], ['setup', '']],
			expression: [['lint', ''], ['setup', '']],
		});
	});

	test('counts a required check\'s dependencies until it finished, after which its own result decides', () => {
		const dependency = { requiredBy: ['PR Gate'] };
		const notReported = checks([
			check('Detect Changes', 'COMPLETED', 'FAILURE', dependency),
			check('Compile', 'IN_PROGRESS', undefined, dependency),
			check('Optional', 'COMPLETED', 'FAILURE'),
			check('license/cla', 'COMPLETED', 'SUCCESS', { required: true }),
		], ['PR Gate', 'license/cla']);
		const running = checks([...notReported.checks, check('PR Gate', 'IN_PROGRESS', undefined, { required: true })], ['PR Gate', 'license/cla']);
		const passed = checks([...notReported.checks, check('PR Gate', 'COMPLETED', 'SUCCESS', { required: true })], ['PR Gate', 'license/cla']);
		const summarize = (value: PullRequestChecks) => {
			const result = classifyRequiredPullRequestChecks(value);
			return { checks: result.checks.map(check => check.name), failed: result.failed.map(check => check.name), missing: result.missing, pending: result.pending, status: getRequiredPullRequestChecksStatus(value), unfinished: getUnfinishedRequiredPullRequestCheckNames(value) };
		};
		assert.deepStrictEqual([summarize(notReported), summarize(running), summarize(passed)], [
			{ checks: ['Detect Changes', 'Compile', 'license/cla'], failed: ['Detect Changes'], missing: ['PR Gate'], pending: true, status: 'failure', unfinished: ['PR Gate'] },
			{ checks: ['Detect Changes', 'Compile', 'license/cla', 'PR Gate'], failed: ['Detect Changes'], missing: [], pending: true, status: 'failure', unfinished: ['PR Gate'] },
			{ checks: ['license/cla', 'PR Gate'], failed: [], missing: [], pending: false, status: 'success', unfinished: [] },
		]);
	});

	test('counts every check, including unreported suites, only when nothing is required', () => {
		const value: PullRequestChecks = {
			...checks([check('Build', 'COMPLETED', 'SUCCESS'), check('Lint', 'COMPLETED', 'FAILURE')], []),
			expectedSuites: [{ id: 'suite', name: 'Analysis', status: 'QUEUED', checkRunsReported: false }],
		};
		const required = { ...value, checks: [...value.checks, check('Gate', 'COMPLETED', 'SUCCESS', { required: true })] };
		const summarize = (input: PullRequestChecks) => {
			const result = classifyRequiredPullRequestChecks(input);
			return { everyCheck: result.everyCheck, checks: result.checks.map(check => check.name), failed: result.failed.map(check => check.name), pending: result.pending };
		};
		assert.deepStrictEqual([summarize(value), summarize(required), getRequiredPullRequestChecksStatus(checks([], []))], [
			{ everyCheck: true, checks: ['Build', 'Lint', 'Analysis'], failed: ['Lint'], pending: true },
			{ everyCheck: false, checks: ['Gate'], failed: [], pending: false },
			undefined,
		]);
	});

	test('leaves out ignored checks with the dependencies of an ignored required check, and namesakes GitHub does not require', () => {
		const value = checks([
			check('Build', 'COMPLETED', 'FAILURE', { requiredBy: ['PR Gate'] }),
			check('VS Code PR Check', 'IN_PROGRESS', undefined, { required: true }),
			check('license/cla', 'COMPLETED', 'FAILURE', { id: 'namesake', required: false }),
			check('license/cla', 'COMPLETED', 'SUCCESS', { required: true }),
		], ['PR Gate', 'VS Code PR Check', 'license/cla']);
		const result = classifyRequiredPullRequestChecks(value, name => name === 'PR Gate' || name.startsWith('VS Code'));
		assert.deepStrictEqual({ checks: result.checks.map(check => check.id), missing: result.missing, pending: result.pending }, { checks: ['license/cla'], missing: [], pending: false });
	});
});
