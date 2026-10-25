/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';

// ripple decides whether a pull request only disables tests (`ripple disables`, tested in
// build/ripple/src/disables.rs). These tests check how the workflows use its verdict.

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const actionPath = './.github/actions/detect-test-disable-only';

interface IStep {
	readonly id?: string;
	readonly name?: string;
	readonly if?: string;
	readonly uses?: string;
	readonly run?: string;
	readonly with?: Record<string, string | number>;
	readonly 'continue-on-error'?: boolean;
}

interface IJob {
	readonly needs?: string | readonly string[];
	readonly if?: string;
	readonly permissions?: Record<string, string>;
	readonly outputs?: Record<string, string>;
	readonly steps?: readonly IStep[];
}

function readYaml<T>(file: string): T {
	return load(readFileSync(path.join(repositoryRoot, file), 'utf8')) as T;
}

function loadWorkflow(name: string): Record<string, IJob> {
	return readYaml<{ readonly jobs: Record<string, IJob> }>(`.github/workflows/${name}`).jobs;
}

/** Checks how a job detects test-disable-only changes: with the action from its checkout, and failing open. */
function detection(job: IJob) {
	const steps = job.steps ?? [];
	const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'));
	const detect = steps.find(step => step.id === 'test-disable-only');
	return {
		fetchDepth: checkout?.with?.['fetch-depth'],
		uses: detect?.uses,
		failsOpen: detect?.['continue-on-error'],
		actions: job.permissions?.actions,
		output: job.outputs?.['test-disable-only'],
	};
}

const detects = {
	fetchDepth: 2,
	uses: actionPath,
	failsOpen: true,
	actions: 'read',
	output: '${{ steps.test-disable-only.outputs.verified == \'true\' }}',
};

suite('Detect Test-Disable-Only Changes', () => {
	test('the action runs the ripple binary that main builds, only when main built it', () => {
		const action = readYaml<{ readonly outputs: Record<string, { readonly value: string }>; readonly runs: { readonly steps: readonly IStep[] } }>('.github/actions/detect-test-disable-only/action.yml');
		const steps = action.runs.steps;
		const restore = steps.find(step => step.id === 'cache-ripple');
		const ripple = loadWorkflow('pr-ripple.yml').ripple.steps ?? [];
		const lookup = ripple.find(step => step.id === 'cache-ripple');
		const save = ripple.find(step => step.uses?.startsWith('actions/cache/save@'));
		assert.deepStrictEqual({
			restore: { uses: restore?.uses?.split('@')[0], path: restore?.with?.path, key: restore?.with?.key },
			builds: steps.some(step => /\bcargo\b/.test(step.run ?? '')),
			trusted: steps.find(step => step.id === 'trusted')?.if,
			disables: steps.find(step => step.id === 'disables'),
			verified: action.outputs.verified.value,
		}, {
			// The key and path of the cache that pr-ripple.yml saves on main.
			restore: { uses: 'actions/cache/restore', path: save?.with?.path, key: lookup?.with?.key },
			builds: false,
			trusted: 'steps.cache-ripple.outputs.cache-hit == \'true\'',
			disables: {
				name: 'Detect test-disable-only changes',
				id: 'disables',
				if: 'steps.trusted.outputs.trusted == \'true\'',
				shell: 'bash',
				run: 'build/ripple/target/release/ripple disables --config build/ripple/vscode.jsonc --base HEAD^1 --head HEAD',
			},
			verified: '${{ steps.disables.outputs.only-disables-tests }}',
		});
		// Only a binary that no run of the pull request saved can decide.
		const check = steps.find(step => step.id === 'trusted');
		assert.match(check?.run ?? '', /actions\/caches" -f ref="\$REF" -f key="\$KEY"/);
		assert.equal((check as { env?: Record<string, string> } | undefined)?.env?.REF, 'refs/pull/${{ github.event.pull_request.number }}/merge');
	});

	test('pull request checks skip only what a verified pull request cannot affect', () => {
		const pr = loadWorkflow('pr.yml');
		assert.deepStrictEqual(detection(pr.changes), detects);
		// Every output that selects jobs must be 'false' when the pull request only disables tests.
		const forced = '${{ steps.test-disable-only.outputs.verified == \'true\' && \'false\' || ';
		const notSelecting = ['test-disable-only', 'agent-host-test-profile', 'agent-host-test-profile-reason', 'electron-tests', 'selected-unit-tests', 'selected-browser-unit-tests', 'ripple-changed', 'ripple-failed'];
		const selecting = Object.entries(pr.changes.outputs ?? {}).filter(([name]) => !notSelecting.includes(name));
		assert.deepStrictEqual(selecting.filter(([, value]) => !value.startsWith(forced)), []);
		for (const output of ['electron-tests', 'selected-unit-tests', 'selected-browser-unit-tests']) {
			assert.ok(pr.changes.outputs?.[output].startsWith('${{ steps.test-disable-only.outputs.verified != \'true\' && '), output);
		}
		assert.deepStrictEqual([pr.compile.needs, pr.compile.if], ['changes', '${{ !cancelled() && (needs.changes.result != \'success\' || needs.changes.outputs.test-disable-only != \'true\') }}']);
	});

	test('the fixture and Monaco checks skip only for a verified pull request, and run when detection fails', () => {
		for (const [workflow, aggregator] of [['component-fixtures.yml', 'component-fixtures'], ['monaco-editor.yml', undefined]] as const) {
			const jobs = loadWorkflow(workflow);
			const checkout = (jobs.changes.steps ?? []).find(step => step.uses?.startsWith('actions/checkout@'));
			assert.deepStrictEqual({ ...detection(jobs.changes), checkout: checkout?.with }, {
				...detects,
				// ripple reads the files that the pull request changes; nothing else needs contents.
				checkout: { 'fetch-depth': 2, filter: 'blob:none', 'sparse-checkout': '.github/actions/detect-test-disable-only\nbuild/ripple\n' },
			}, workflow);
			const gated = Object.entries(jobs).filter(([id]) => id !== 'changes' && id !== aggregator);
			assert.deepStrictEqual(gated.map(([id, job]) => [id, job.needs, job.if]), gated.map(([id]) => [id, 'changes', '${{ !cancelled() && needs.changes.outputs.test-disable-only != \'true\' }}']), workflow);
		}
		const aggregator = loadWorkflow('component-fixtures.yml')['component-fixtures'];
		assert.ok(aggregator.needs?.includes('changes'));
		assert.ok(aggregator.steps?.[0].run?.includes('if [[ \'${{ needs.changes.outputs.test-disable-only }}\' == \'true\' &&'));
	});

	test('code owners review what decides that checks skip', () => {
		const codeOwners = readFileSync(path.join(repositoryRoot, '.github/CODEOWNERS'), 'utf8');
		const owned = ['.github/actions/detect-test-disable-only/', '.github/workflows/pr-ripple.yml', 'build/ripple/'];
		assert.deepStrictEqual(owned.filter(p => !new RegExp(`^${p.replace(/\./g, '\\.')} @`, 'm').test(codeOwners)), []);
	});
});
