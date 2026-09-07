/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, globSync } from 'node:fs';
import path from 'node:path';
import { retry } from './retry.ts';

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

function pipelineArtifacts(body: unknown): Set<string> {
	if (!isRecord(body) || !Array.isArray(body.value)) {
		throw new Error('Invalid pipeline artifact list');
	}

	const artifacts: readonly unknown[] = body.value;
	const names = new Set<string>();
	for (const artifact of artifacts) {
		if (!isRecord(artifact) || typeof artifact.name !== 'string'
			|| !isRecord(artifact.resource) || typeof artifact.resource.type !== 'string') {
			throw new Error('Invalid pipeline artifact entry');
		}
		if (artifact.resource.type === 'PipelineArtifact') {
			names.add(artifact.name);
		}
	}
	return names;
}

function setVariable(log: (message: string) => void, name: string, value: string): void {
	const escaped = value.replaceAll('%', '%AZP25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
	log(`##vso[task.setvariable variable=${name}]${escaped}`);
}

/**
 * Only published artifacts from this run count as checkpoints; local files and
 * attempt numbers never indicate a hit.
 */
export async function testCheckpoint(
	args: readonly string[],
	env: NodeJS.ProcessEnv = process.env,
	request: typeof fetch = fetch,
	log: (message: string) => void = console.log,
): Promise<void> {
	const arch = env.VSCODE_ARCH;
	const platform = env.AGENT_OS === 'Linux' ? 'linux'
		: env.AGENT_OS === 'Windows_NT' ? 'win32'
			: env.AGENT_OS === 'Darwin' ? 'darwin'
				: undefined;
	if (!platform || (arch !== 'x64' && arch !== 'arm64') || (platform === 'linux' && arch !== 'x64')) {
		throw new Error('Test checkpoints require Linux x64 or Windows/macOS x64/arm64');
	}

	const target = `${platform}-${arch}`;
	const testIds = [
		'unit-electron',
		'unit-node',
		platform === 'darwin' ? 'unit-browser-webkit' : 'unit-browser-chromium',
		'integration-electron',
		'integration-remote',
		`integration-browser-${platform === 'darwin' ? 'webkit' : platform === 'win32' ? 'firefox' : 'chromium'}`,
		'smoke-electron',
		'smoke-browser-chromium',
		'smoke-remote',
		'smoke-packaged-agent-host',
		'copilot-extension',
		'copilot-completions-core',
		'copilot-sanity',
		...(platform === 'darwin' ? ['smoke-agents-pac', 'smoke-agents-pac-kerberos'] : []),
	];
	const [command, testId] = args;
	if (!((command === 'restore' || command === 'collect-results') && args.length === 1)
		&& !(command === 'record' && args.length === 2 && testIds.some(id => id === testId))) {
		throw new Error(`Usage: node testCheckpoint.ts restore | collect-results | record <${testIds.join('|')}>`);
	}

	if (command === 'collect-results') {
		const sources = required(env, 'BUILD_SOURCESDIRECTORY');
		const results = path.join(required(env, 'BUILD_ARTIFACTSTAGINGDIRECTORY'), 'test-results');
		setVariable(log, 'TEST_CHECKPOINT_LOGS_AVAILABLE', String(existsSync(path.join(sources, '.build/logs'))));
		setVariable(log, 'TEST_CHECKPOINT_CRASHES_AVAILABLE', String(existsSync(path.join(sources, '.build/crashes'))));
		setVariable(log, 'TEST_CHECKPOINT_RESULTS_AVAILABLE', String(globSync('**/*-results.xml', { cwd: results }).length > 0));
		return;
	}

	const buildId = identifier(env, 'BUILD_BUILDID', /^[1-9]\d*$/);
	const stage = identifier(env, 'SYSTEM_STAGENAME', /^[A-Za-z_][A-Za-z0-9_]*$/);
	const job = identifier(env, 'SYSTEM_JOBNAME', /^[A-Za-z_][A-Za-z0-9_]*$/);
	const artifactName = (id: string) => `test-pass-${stage}-${job}-${target}-${id}`;
	const variablePrefix = (id: string) => `TEST_CHECKPOINT_${id.replaceAll('-', '_').toUpperCase()}`;

	if (command === 'restore') {
		setVariable(log, 'TEST_CHECKPOINTS_RESTORED', 'false');
		for (const id of testIds) {
			setVariable(log, `${variablePrefix(id)}_HIT`, 'false');
			setVariable(log, `${variablePrefix(id)}_READY`, 'false');
		}

		const collection = new URL(required(env, 'SYSTEM_COLLECTIONURI'));
		if (collection.protocol !== 'https:' || collection.username || collection.password || collection.search || collection.hash) {
			throw new Error('Expected an HTTPS Azure DevOps collection URL');
		}
		const project = encodeURIComponent(required(env, 'SYSTEM_TEAMPROJECTID'));
		const url = new URL(`${collection.href.replace(/\/$/, '')}/${project}/_apis/build/builds/${buildId}/artifacts?api-version=7.1`);
		const token = required(env, 'SYSTEM_ACCESSTOKEN');
		const signal = AbortSignal.timeout(120_000);
		const names = await retry(async () => {
			signal.throwIfAborted();
			const response = await request(url, {
				headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
				signal,
			});
			if (!response.ok) {
				throw new Error(`Unexpected status code: ${response.status} while restoring test checkpoints`);
			}
			return pipelineArtifacts(await response.json());
		});

		for (const id of testIds) {
			const artifact = artifactName(id);
			const hit = names.has(artifact);
			setVariable(log, `${variablePrefix(id)}_HIT`, String(hit));
			log(hit ? `Reusing successful test ${id}: ${artifact}` : `No checkpoint for ${id}; the test remains eligible to run.`);
		}
		setVariable(log, 'TEST_CHECKPOINTS_RESTORED', 'true');
		return;
	}

	const jobAttempt = identifier(env, 'SYSTEM_JOBATTEMPT', /^[1-9]\d*$/);
	const stageAttempt = identifier(env, 'SYSTEM_STAGEATTEMPT', /^[1-9]\d*$/);
	const sourceVersion = required(env, 'BUILD_SOURCEVERSION');
	const directory = path.join(required(env, 'AGENT_TEMPDIRECTORY'), 'test-checkpoints', buildId, stage, job, stageAttempt, jobAttempt, testId);
	const file = path.join(directory, 'test-checkpoint.json');
	await mkdir(directory, { recursive: true });
	await writeFile(file, JSON.stringify({
		schemaVersion: 1,
		buildId,
		sourceVersion,
		stageName: stage,
		jobName: job,
		target,
		testId,
		jobAttempt: Number(jobAttempt),
		stageAttempt: Number(stageAttempt),
		completedAt: new Date().toISOString(),
	}, null, '\t') + '\n');
	setVariable(log, `${variablePrefix(testId)}_FILE`, file);
	setVariable(log, `${variablePrefix(testId)}_ARTIFACT`, artifactName(testId));
	setVariable(log, `${variablePrefix(testId)}_READY`, 'true');
}

if (import.meta.main) {
	testCheckpoint(process.argv.slice(2)).catch(error => {
		console.error(error);
		process.exitCode = 1;
	});
}
