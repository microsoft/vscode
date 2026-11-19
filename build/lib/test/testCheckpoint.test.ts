/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';
import { testCheckpoint, testIds } from '../../azure-pipelines/common/testCheckpoint.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const jobId = '11111111-1111-1111-1111-111111111111';
const otherJobId = '22222222-2222-2222-2222-222222222222';
const attempt1 = { timelineId: 'aaaaaaaa-0000-0000-0000-000000000001', recordId: '33333333-3333-3333-3333-333333333331' };
const attempt2 = { timelineId: 'aaaaaaaa-0000-0000-0000-000000000002', recordId: '33333333-3333-3333-3333-333333333332' };
const environment: NodeJS.ProcessEnv = {
	BUILD_BUILDID: '123',
	SYSTEM_COLLECTIONURI: 'https://dev.azure.com/organization/',
	SYSTEM_TEAMPROJECTID: 'project-id',
	SYSTEM_JOBID: jobId,
	SYSTEM_JOBATTEMPT: '2',
	SYSTEM_ACCESSTOKEN: 'test-token',
};
const timelines = 'https://dev.azure.com/organization/project-id/_apis/build/builds/123/timeline';

function variables(messages: readonly string[]): Record<string, string> {
	return Object.fromEntries(messages.flatMap(message => {
		const match = /^##vso\[task.setvariable variable=(?<name>\w+)\](?<value>.*)$/.exec(message);
		return match?.groups ? [[match.groups.name, match.groups.value]] : [];
	}));
}

function hits(messages: readonly string[]): string[] {
	return Object.entries(variables(messages)).filter(([name, value]) => name.endsWith('_HIT') && value === 'true').map(([name]) => name).sort();
}

function job(id: string, previousAttempts: readonly object[] = []) {
	return { id, parentId: null, type: 'Job', name: 'Tests', result: null, previousAttempts };
}

function task(parentId: string, name: string, result: string | null) {
	return { id: crypto.randomUUID(), parentId, type: 'Task', name, result };
}

/**
 * Serves the current timeline and the timelines of earlier attempts by URL.
 */
function server(responses: Record<string, unknown>, requested: string[] = []): typeof fetch {
	return async (url, options) => {
		requested.push(String(url));
		assert.deepStrictEqual(options?.headers, { Authorization: 'Bearer test-token', Accept: 'application/json' });
		const body = responses[String(url)];
		return body === undefined ? new Response(null, { status: 404 }) : Response.json(body);
	};
}

suite('Product test checkpoints', () => {
	test('the first attempt of a job reuses nothing and makes no request', async () => {
		const messages: string[] = [];
		await testCheckpoint(['restore'], { ...environment, SYSTEM_JOBATTEMPT: '1' }, async () => { throw new Error('Unexpected network access'); }, message => messages.push(message));
		assert.deepStrictEqual({ restored: variables(messages).TEST_CHECKPOINTS_RESTORED, hits: hits(messages) }, { restored: 'true', hits: [] });
	});

	test('reuses only tests whose record step succeeded in an earlier attempt of this job', async () => {
		const requested: string[] = [];
		const messages: string[] = [];
		await testCheckpoint(['restore'], environment, server({
			[`${timelines}?api-version=7.1`]: {
				records: [
					job(jobId, [attempt1]),
					job(otherJobId, [{ timelineId: attempt1.timelineId, recordId: '44444444-4444-4444-4444-444444444444' }]),
					// The current attempt's own steps never count
					task(jobId, 'Record unit-node checkpoint', 'succeeded'),
				],
			},
			[`${timelines}/${attempt1.timelineId}?api-version=7.1`]: {
				records: [
					job(attempt1.recordId),
					task(attempt1.recordId, '🧪 Run unit tests (Electron)', 'succeeded'),
					task(attempt1.recordId, 'Record unit-electron checkpoint', 'succeeded'),
					task(attempt1.recordId, 'Record unit-browser-chromium checkpoint', 'succeeded'),
					task(attempt1.recordId, 'Record copilot-extension checkpoint', 'skipped'),
					task(attempt1.recordId, 'Record copilot-sanity checkpoint', 'failed'),
					task(attempt1.recordId, 'Record copilot-completions-core checkpoint', 'canceled'),
					task(attempt1.recordId, 'Record smoke-remote checkpoint', null),
					task(attempt1.recordId, 'Record unknown-test checkpoint', 'succeeded'),
					// Another job of the same attempt
					task('44444444-4444-4444-4444-444444444444', 'Record smoke-electron checkpoint', 'succeeded'),
				],
			},
		}, requested), message => messages.push(message));
		assert.deepStrictEqual({
			requested,
			hits: hits(messages),
			restored: variables(messages).TEST_CHECKPOINTS_RESTORED,
			reused: messages.filter(message => message.startsWith('Reusing')),
		}, {
			requested: [`${timelines}?api-version=7.1`, `${timelines}/${attempt1.timelineId}?api-version=7.1`],
			hits: ['TEST_CHECKPOINT_UNIT_BROWSER_CHROMIUM_HIT', 'TEST_CHECKPOINT_UNIT_ELECTRON_HIT'],
			restored: 'true',
			reused: [
				'Reusing successful test unit-electron from an earlier attempt of this job.',
				'Reusing successful test unit-browser-chromium from an earlier attempt of this job.',
			],
		});
	});

	test('combines every earlier attempt, including tests that a later attempt skipped', async () => {
		const messages: string[] = [];
		await testCheckpoint(['restore'], { ...environment, SYSTEM_JOBATTEMPT: '3' }, server({
			[`${timelines}?api-version=7.1`]: { records: [job(jobId.toUpperCase(), [attempt1, attempt2])] },
			[`${timelines}/${attempt1.timelineId}?api-version=7.1`]: {
				records: [task(attempt1.recordId, 'Record unit-electron checkpoint', 'succeeded')],
			},
			[`${timelines}/${attempt2.timelineId}?api-version=7.1`]: {
				records: [
					task(attempt2.recordId, 'Record unit-electron checkpoint', 'skipped'),
					task(attempt2.recordId, 'Record unit-node checkpoint', 'succeeded'),
				],
			},
		}), message => messages.push(message));
		assert.deepStrictEqual(hits(messages), ['TEST_CHECKPOINT_UNIT_ELECTRON_HIT', 'TEST_CHECKPOINT_UNIT_NODE_HIT']);
	});

	test('fails when this job is not in the build timeline', async () => {
		const messages: string[] = [];
		await assert.rejects(
			testCheckpoint(['restore'], environment, server({ [`${timelines}?api-version=7.1`]: { records: [job(otherJobId, [attempt1])] } }), message => messages.push(message)),
			/is not in the timeline of build 123/,
		);
		assert.deepStrictEqual(hits(messages), []);
	});

	for (const status of [401, 403, 429]) {
		test(`surfaces HTTP ${status} without treating it as a hit`, async () => {
			const messages: string[] = [];
			await assert.rejects(
				testCheckpoint(['restore'], environment, async () => new Response(null, { status }), message => messages.push(message)),
				new RegExp(`Unexpected status code: ${status}`),
			);
			assert.ok(Object.values(variables(messages)).every(value => value === 'false'));
		});
	}

	test('retries a transient server failure', async () => {
		let requests = 0;
		await testCheckpoint(['restore'], environment, async () => {
			return ++requests === 1 ? new Response(null, { status: 503 }) : Response.json({ records: [job(jobId)] });
		}, () => { });
		assert.equal(requests, 2);
	});

	for (const body of [{}, { records: null }, { records: [{ id: jobId }] }, { records: [job(jobId, [{ timelineId: '../escape', recordId: attempt1.recordId }])] }]) {
		test(`rejects malformed timeline ${JSON.stringify(body)}`, async () => {
			await assert.rejects(testCheckpoint(['restore'], environment, async () => Response.json(body), () => { }), /Invalid build timeline/);
		});
	}

	test('validates commands and identity before accessing the API', async () => {
		const request: typeof fetch = async () => { throw new Error('Unexpected network access'); };
		for (const args of [[], ['restore', 'extra'], ['record', '../escape'], ['record', 'unit-electron', 'extra'], ['record', 'unknown-test']]) {
			await assert.rejects(testCheckpoint(args, environment, request), /Usage:/);
		}
		for (const overrides of [
			{ BUILD_BUILDID: '' },
			{ BUILD_BUILDID: '1/../2' },
			{ SYSTEM_JOBID: '../job' },
			{ SYSTEM_JOBATTEMPT: '0' },
			{ SYSTEM_COLLECTIONURI: 'http://dev.azure.com/org/' },
			{ SYSTEM_ACCESSTOKEN: '' },
		]) {
			await assert.rejects(testCheckpoint(['restore'], { ...environment, ...overrides }, request, () => { }), /Missing|Invalid|HTTPS/);
		}
	});

	test('recording needs no token, files or network', async () => {
		for (const id of testIds) {
			const messages: string[] = [];
			await testCheckpoint(['record', id], {}, async () => { throw new Error('Unexpected network access'); }, message => messages.push(message));
			assert.deepStrictEqual(messages, [`Test ${id} passed. A retry of this job reuses it instead of running it again.`]);
		}
	});

	test('reports test results only when a test produced them', async t => {
		const directory = mkdtempSync(path.join(os.tmpdir(), 'test-checkpoint-outputs-'));
		t.after(() => rmSync(directory, { recursive: true, force: true }));
		const env = { BUILD_ARTIFACTSTAGINGDIRECTORY: directory };
		const observed: Record<string, string>[] = [];
		const collect = async () => {
			const messages: string[] = [];
			await testCheckpoint(['collect-results'], env, fetch, message => messages.push(message));
			observed.push(variables(messages));
		};
		await collect();
		const results = path.join(directory, 'test-results/nested');
		mkdirSync(results, { recursive: true });
		writeFileSync(path.join(results, 'unrelated.txt'), 'not a test result');
		await collect();
		writeFileSync(path.join(results, 'integration-results.xml'), '<testsuites/>');
		await collect();
		assert.deepStrictEqual(observed, [
			{ TEST_CHECKPOINT_RESULTS_AVAILABLE: 'false' },
			{ TEST_CHECKPOINT_RESULTS_AVAILABLE: 'false' },
			{ TEST_CHECKPOINT_RESULTS_AVAILABLE: 'true' },
		]);
	});

	test('the checkpoint is a step named after the test, on the condition of its test step, and nothing is published', () => {
		const publisher = load(readFileSync(path.join(repositoryRoot, 'build/azure-pipelines/common/publish-test-checkpoint.yml'), 'utf8')) as { steps: object[] };
		assert.deepStrictEqual(publisher.steps, [{
			script: 'node "$(Build.SourcesDirectory)/build/azure-pipelines/common/testCheckpoint.ts" record ${{ parameters.testId }}',
			condition: '${{ parameters.condition }}',
			displayName: 'Record ${{ parameters.testId }} checkpoint',
		}]);
	});
});