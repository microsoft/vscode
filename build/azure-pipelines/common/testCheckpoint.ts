/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { globSync } from 'node:fs';
import path from 'node:path';
import { retry } from './retry.ts';

/**
 * Product test tasks that record a checkpoint once they pass.
 */
export const testIds = [
	'unit-electron',
	'unit-node',
	'unit-browser-chromium',
	'unit-browser-webkit',
	'integration-agent-host-e2e',
	'integration-electron',
	'integration-browser-chromium',
	'integration-browser-firefox',
	'integration-browser-webkit',
	'integration-remote',
	'smoke-electron',
	'smoke-agents-pac-proxy',
	'smoke-agents-kerberos-pac-proxy',
	'smoke-agents-basic-proxy',
	'smoke-wsl-kerberos-proxy',
	'smoke-wsl-basic-proxy',
	'smoke-wsl-basic-pac-proxy',
	'smoke-browser-chromium',
	'smoke-remote',
	'copilot-unit',
	'copilot-simulation',
	'copilot-prompt',
	'copilot-extension',
	'copilot-completions-core',
	'copilot-sanity',
] as const;

function required(env: NodeJS.ProcessEnv, name: string): string {
	const value = env[name];
	if (!value) {
		throw new Error(`Missing environment variable: ${name}`);
	}
	return value;
}

function identifier(env: NodeJS.ProcessEnv, name: string, pattern: RegExp): string {
	const value = required(env, name);
	if (!pattern.test(value)) {
		throw new Error(`Invalid checkpoint identity: ${name}`);
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface TimelineRecord {
	readonly id: string;
	readonly parentId: string | null;
	readonly type: string;
	readonly name: string;
	readonly result: string | null;
	readonly previousAttempts: readonly { readonly timelineId: string; readonly recordId: string }[];
}

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timelineRecords(body: unknown): TimelineRecord[] {
	if (!isRecord(body) || !Array.isArray(body.records)) {
		throw new Error('Invalid build timeline');
	}

	const records: readonly unknown[] = body.records;
	return records.map(record => {
		if (!isRecord(record) || typeof record.id !== 'string' || typeof record.type !== 'string' || typeof record.name !== 'string'
			|| (record.parentId !== null && record.parentId !== undefined && typeof record.parentId !== 'string')
			|| (record.result !== null && record.result !== undefined && typeof record.result !== 'string')
			|| (record.previousAttempts !== null && record.previousAttempts !== undefined && !Array.isArray(record.previousAttempts))) {
			throw new Error('Invalid build timeline record');
		}
		const previousAttempts: readonly unknown[] = Array.isArray(record.previousAttempts) ? record.previousAttempts : [];
		return {
			id: record.id,
			parentId: typeof record.parentId === 'string' ? record.parentId : null,
			type: record.type,
			name: record.name,
			result: typeof record.result === 'string' ? record.result : null,
			previousAttempts: previousAttempts.map(attempt => {
				if (!isRecord(attempt) || typeof attempt.timelineId !== 'string' || !guid.test(attempt.timelineId)
					|| typeof attempt.recordId !== 'string' || !guid.test(attempt.recordId)) {
					throw new Error('Invalid build timeline attempt');
				}
				return { timelineId: attempt.timelineId, recordId: attempt.recordId };
			}),
		};
	});
}

function setVariable(log: (message: string) => void, name: string, value: string): void {
	const escaped = value.replaceAll('%', '%AZP25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
	log(`##vso[task.setvariable variable=${name}]${escaped}`);
}

/**
 * Restores, records and collects test checkpoints of the current pipeline run.
 *
 * A test passed in an earlier attempt of this job when its `Record <id> checkpoint`
 * step succeeded there. That step runs on the condition of its test step, right
 * after it, so it only succeeds when the test did. Only the pipeline writes build
 * timelines, so a checkpoint can't be created by anything but a passing test, and
 * nothing is published or scanned to record one.
 */
export async function testCheckpoint(
	args: readonly string[],
	env: NodeJS.ProcessEnv = process.env,
	request: typeof fetch = fetch,
	log: (message: string) => void = console.log,
): Promise<void> {
	const [command, testId] = args;
	if (!((command === 'restore' || command === 'collect-results') && args.length === 1)
		&& !(command === 'record' && args.length === 2 && testIds.some(id => id === testId))) {
		throw new Error(`Usage: node testCheckpoint.ts restore | collect-results | record <${testIds.join('|')}>`);
	}

	if (command === 'collect-results') {
		const results = path.join(required(env, 'BUILD_ARTIFACTSTAGINGDIRECTORY'), 'test-results');
		setVariable(log, 'TEST_CHECKPOINT_RESULTS_AVAILABLE', String(globSync('**/*-results.xml', { cwd: results }).length > 0));
		return;
	}

	if (command === 'record') {
		log(`Test ${testId} passed. A retry of this job reuses it instead of running it again.`);
		return;
	}

	const variablePrefix = (id: string) => `TEST_CHECKPOINT_${id.replaceAll('-', '_').toUpperCase()}`;
	setVariable(log, 'TEST_CHECKPOINTS_RESTORED', 'false');
	for (const id of testIds) {
		setVariable(log, `${variablePrefix(id)}_HIT`, 'false');
	}

	const buildId = identifier(env, 'BUILD_BUILDID', /^[1-9]\d*$/);
	const jobId = identifier(env, 'SYSTEM_JOBID', guid);
	const jobAttempt = identifier(env, 'SYSTEM_JOBATTEMPT', /^[1-9]\d*$/);
	const collection = new URL(required(env, 'SYSTEM_COLLECTIONURI'));
	if (collection.protocol !== 'https:' || collection.username || collection.password || collection.search || collection.hash) {
		throw new Error('Expected an HTTPS Azure DevOps collection URL');
	}
	const project = encodeURIComponent(required(env, 'SYSTEM_TEAMPROJECTID'));
	const token = required(env, 'SYSTEM_ACCESSTOKEN');

	const passed = new Set<string>();
	if (jobAttempt !== '1') {
		const timelines = `${collection.href.replace(/\/$/, '')}/${project}/_apis/build/builds/${buildId}/timeline`;
		const signal = AbortSignal.timeout(120_000);
		const getTimeline = (url: string) => retry(async () => {
			signal.throwIfAborted();
			const response = await request(url, {
				headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
				signal,
			});
			if (!response.ok) {
				throw new Error(`Unexpected status code: ${response.status} while restoring test checkpoints`);
			}
			return timelineRecords(await response.json());
		});

		const job = (await getTimeline(`${timelines}?api-version=7.1`))
			.find(record => record.type === 'Job' && record.id.toLowerCase() === jobId.toLowerCase());
		if (!job) {
			throw new Error(`Job ${jobId} is not in the timeline of build ${buildId}`);
		}

		for (const attempt of job.previousAttempts) {
			for (const record of await getTimeline(`${timelines}/${attempt.timelineId}?api-version=7.1`)) {
				const id = /^Record (?<id>[a-z0-9-]+) checkpoint$/.exec(record.name)?.groups?.id;
				if (id && record.type === 'Task' && record.parentId === attempt.recordId && record.result === 'succeeded') {
					passed.add(id);
				}
			}
		}
	}

	for (const id of testIds) {
		const hit = passed.has(id);
		setVariable(log, `${variablePrefix(id)}_HIT`, String(hit));
		log(hit ? `Reusing successful test ${id} from an earlier attempt of this job.` : `No checkpoint for ${id}; the test remains eligible to run.`);
	}
	setVariable(log, 'TEST_CHECKPOINTS_RESTORED', 'true');
}

if (import.meta.main) {
	testCheckpoint(process.argv.slice(2)).catch(error => {
		console.error(error);
		process.exitCode = 1;
	});
}
