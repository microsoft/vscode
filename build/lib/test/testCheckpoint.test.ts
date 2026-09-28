/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';
import { testCheckpoint } from '../../azure-pipelines/common/testCheckpoint.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const helperPath = path.join(repositoryRoot, 'build/azure-pipelines/common/testCheckpoint.ts');
const reuseCondition = '${{ if eq(parameters.VSCODE_SKIP_SUCCESSFUL_TEST_TASKS, true) }}';
const powershell = process.platform === 'win32' ? 'powershell' : 'pwsh';
const hasPowerShell = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8' }).status === 0;

const unitTests = [
	{ id: 'unit-electron', command: '.\\scripts\\test.bat --build --tfs "Unit Tests"' },
	{ id: 'unit-node', command: 'npm run test-node -- --build' },
	{ id: 'unit-browser-chromium', command: 'npm run test-browser-no-install -- --build --browser chromium --tfs "Browser Unit Tests"' },
];

const environment: NodeJS.ProcessEnv = {
	AGENT_OS: 'Windows_NT',
	VSCODE_ARCH: 'x64',
	BUILD_BUILDID: '123',
	BUILD_SOURCEVERSION: 'source-commit',
	SYSTEM_COLLECTIONURI: 'https://dev.azure.com/organization/',
	SYSTEM_TEAMPROJECTID: 'project-id',
	SYSTEM_STAGENAME: 'Windows',
	SYSTEM_JOBNAME: 'Windows_x64_Test',
	SYSTEM_STAGEATTEMPT: '1',
	SYSTEM_JOBATTEMPT: '1',
	SYSTEM_ACCESSTOKEN: 'test-token',
};

function variables(messages: readonly string[]): Record<string, string> {
	return Object.fromEntries(messages.flatMap(message => {
		const match = /^##vso\[task.setvariable variable=(?<name>\w+)\](?<value>.*)$/.exec(message);
		return match?.groups ? [[match.groups.name, match.groups.value]] : [];
	}));
}

function artifactName(id: string, target = 'win32-x64'): string {
	return `test-pass-Windows-Windows_x64_Test-${target}-${id}`;
}

interface TestStep {
	script?: string;
	powershell?: string;
	condition?: string;
	template?: string;
	parameters?: { testId: string };
	[reuseCondition]?: TestStep | TestStep[];
	'${{ else }}'?: TestStep;
}

function testGroups(): TestStep[][] {
	const template = load(readFileSync(path.join(repositoryRoot, 'build/azure-pipelines/win32/steps/product-build-win32-test.yml'), 'utf8')) as {
		steps: Record<string, TestStep[]>[];
	};
	return [
		template.steps.find(step => Object.hasOwn(step, '${{ if eq(parameters.VSCODE_RUN_ELECTRON_TESTS, true) }}'))!['${{ if eq(parameters.VSCODE_RUN_ELECTRON_TESTS, true) }}'],
		template.steps.find(step => Object.hasOwn(step, '${{ if eq(parameters.VSCODE_RUN_BROWSER_TESTS, true) }}'))!['${{ if eq(parameters.VSCODE_RUN_BROWSER_TESTS, true) }}'],
	];
}

suite('Product test checkpoints', () => {
	test('restores only exact pipeline artifacts and resets readiness', async () => {
		const messages: string[] = [];
		let requestedUrl = '';
		const request: typeof fetch = async (url, options) => {
			requestedUrl = String(url);
			assert.deepStrictEqual(options?.headers, { Authorization: 'Bearer test-token', Accept: 'application/json' });
			return Response.json({
				value: [
					{ name: artifactName('unit-electron'), resource: { type: 'PipelineArtifact' } },
					{ name: artifactName('unit-node'), resource: { type: 'Container' } },
					{ name: artifactName('unit-browser-chromium') + '-attempt1', resource: { type: 'PipelineArtifact' } },
					{ name: artifactName('unit-node').replace('Windows_x64_Test', 'Windows_arm64_Test'), resource: { type: 'PipelineArtifact' } },
					{ name: artifactName('unit-node').replace('test-pass-', 'test-pass-v2-'), resource: { type: 'PipelineArtifact' } },
				]
			});
		};
		await testCheckpoint(['restore'], environment, request, message => messages.push(message));
		assert.deepStrictEqual({
			requestedUrl,
			variables: variables(messages),
			reused: messages.filter(message => message.startsWith('Reusing')),
		}, {
			requestedUrl: 'https://dev.azure.com/organization/project-id/_apis/build/builds/123/artifacts?api-version=7.1',
			variables: {
				TEST_CHECKPOINTS_RESTORED: 'true',
				TEST_CHECKPOINT_UNIT_ELECTRON_HIT: 'true',
				TEST_CHECKPOINT_UNIT_ELECTRON_READY: 'false',
				...Object.fromEntries([
					'UNIT_NODE', 'UNIT_BROWSER_CHROMIUM',
					'INTEGRATION_ELECTRON', 'INTEGRATION_BROWSER_FIREFOX', 'INTEGRATION_REMOTE',
					'SMOKE_ELECTRON', 'SMOKE_BROWSER_CHROMIUM', 'SMOKE_REMOTE',
					'COPILOT_EXTENSION', 'COPILOT_COMPLETIONS_CORE', 'COPILOT_SANITY',
				].flatMap(id => [`TEST_CHECKPOINT_${id}_HIT`, `TEST_CHECKPOINT_${id}_READY`].map(name => [name, 'false']))),
			},
			reused: [`Reusing successful test unit-electron: ${artifactName('unit-electron')}`],
		});
	});

	test('job and stage attempts share names but a new run has its own lookup', async () => {
		const restored: { buildId: string; hit: string }[] = [];
		const request: typeof fetch = async url => Response.json({
			value: String(url).includes('/builds/123/')
				? [{ name: artifactName('unit-electron'), resource: { type: 'PipelineArtifact' } }]
				: []
		});
		for (const overrides of [
			{ SYSTEM_JOBATTEMPT: '2' },
			{ SYSTEM_JOBATTEMPT: '1', SYSTEM_STAGEATTEMPT: '3' },
			{ BUILD_BUILDID: '456' },
		]) {
			const env = { ...environment, ...overrides };
			const messages: string[] = [];
			await testCheckpoint(['restore'], env, request, message => messages.push(message));
			restored.push({ buildId: env.BUILD_BUILDID!, hit: variables(messages).TEST_CHECKPOINT_UNIT_ELECTRON_HIT });
		}
		assert.deepStrictEqual(restored, [
			{ buildId: '123', hit: 'true' },
			{ buildId: '123', hit: 'true' },
			{ buildId: '456', hit: 'false' },
		]);
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
			return ++requests === 1 ? new Response(null, { status: 503 }) : Response.json({ value: [] });
		}, () => { });
		assert.equal(requests, 2);
	});

	for (const body of [{}, { value: null }, { value: [{ name: 'incomplete' }] }]) {
		test(`rejects malformed artifact response ${JSON.stringify(body)}`, async () => {
			await assert.rejects(testCheckpoint(['restore'], environment, async () => Response.json(body), () => { }), /Invalid pipeline artifact/);
		});
	}

	test('validates commands, supported targets and identity before accessing the API', async () => {
		const request: typeof fetch = async () => { throw new Error('Unexpected network access'); };
		for (const args of [[], ['restore', 'extra'], ['record', '../escape'], ['record', 'unit-electron', 'extra'], ['record', 'unit-browser-webkit']]) {
			await assert.rejects(testCheckpoint(args, environment, request), /Usage:/);
		}
		for (const overrides of [
			{ VSCODE_ARCH: 'arm64' },
			{ AGENT_OS: 'Linux' },
			{ AGENT_OS: 'Darwin' },
			{ BUILD_BUILDID: '' },
			{ SYSTEM_JOBNAME: '../job' },
			{ SYSTEM_STAGENAME: 'stage\ninjection' },
			{ SYSTEM_COLLECTIONURI: 'http://dev.azure.com/org/' },
			{ SYSTEM_ACCESSTOKEN: '' },
		]) {
			await assert.rejects(testCheckpoint(['restore'], { ...environment, ...overrides }, request, () => { }), /require|Missing|Invalid|HTTPS/);
		}
	});

	test('checkpoints are isolated by target', async t => {
		const directory = mkdtempSync(path.join(os.tmpdir(), 'test-checkpoint-target-'));
		t.after(() => rmSync(directory, { recursive: true, force: true }));
		const id = 'unit-browser-chromium';
		const prefix = 'TEST_CHECKPOINT_UNIT_BROWSER_CHROMIUM';
		const env = { ...environment, AGENT_TEMPDIRECTORY: directory };
		const recorded: string[] = [];
		await testCheckpoint(['record', id], env, fetch, message => recorded.push(message));
		const state = variables(recorded);
		const metadata: Record<string, unknown> = JSON.parse(readFileSync(state[`${prefix}_FILE`], 'utf8'));
		const hits: string[] = [];
		for (const artifactTarget of ['win32-arm64', 'win32-x64']) {
			const restored: string[] = [];
			await testCheckpoint(['restore'], { ...env, SYSTEM_JOBATTEMPT: '2' }, async () => Response.json({
				value: [{ name: artifactName(id, artifactTarget), resource: { type: 'PipelineArtifact' } }],
			}), message => restored.push(message));
			hits.push(variables(restored)[`${prefix}_HIT`]);
		}
		assert.deepStrictEqual({
			target: metadata.target,
			testId: metadata.testId,
			artifact: state[`${prefix}_ARTIFACT`],
			ready: state[`${prefix}_READY`],
			hits,
		}, { target: 'win32-x64', testId: id, artifact: artifactName(id), ready: 'true', hits: ['false', 'true'] });
	});

	test('records metadata without a token and ignores local files during restore', async t => {
		const directory = mkdtempSync(path.join(os.tmpdir(), 'test-checkpoint-'));
		t.after(() => rmSync(directory, { recursive: true, force: true }));
		const env = { ...environment, AGENT_TEMPDIRECTORY: directory, SYSTEM_JOBATTEMPT: '2', SYSTEM_ACCESSTOKEN: undefined };
		const recorded: string[] = [];
		const request: typeof fetch = async () => Response.json({ value: [] });
		await testCheckpoint(['record', 'unit-node'], env, request, message => recorded.push(message));
		const state = variables(recorded);
		const metadata: Record<string, unknown> = JSON.parse(readFileSync(state.TEST_CHECKPOINT_UNIT_NODE_FILE, 'utf8'));
		assert.deepStrictEqual({ ...metadata, completedAt: typeof metadata.completedAt === 'string' && Number.isFinite(Date.parse(metadata.completedAt)) }, {
			schemaVersion: 1,
			buildId: '123',
			sourceVersion: 'source-commit',
			stageName: 'Windows',
			jobName: 'Windows_x64_Test',
			target: 'win32-x64',
			testId: 'unit-node',
			jobAttempt: 2,
			stageAttempt: 1,
			completedAt: true,
		});
		assert.deepStrictEqual(state, {
			TEST_CHECKPOINT_UNIT_NODE_FILE: path.join(directory, 'test-checkpoints/123/Windows/Windows_x64_Test/1/2/unit-node/test-checkpoint.json'),
			TEST_CHECKPOINT_UNIT_NODE_ARTIFACT: artifactName('unit-node'),
			TEST_CHECKPOINT_UNIT_NODE_READY: 'true',
		});
		const restored: string[] = [];
		await testCheckpoint(['restore'], { ...env, SYSTEM_ACCESSTOKEN: 'test-token' }, request, message => restored.push(message));
		assert.equal(variables(restored).TEST_CHECKPOINT_UNIT_NODE_HIT, 'false');
	});

	test('metadata write failures cannot signal readiness', async () => {
		const messages: string[] = [];
		await assert.rejects(testCheckpoint(['record', 'unit-node'], {
			...environment, AGENT_TEMPDIRECTORY: helperPath,
		}, fetch, message => messages.push(message)));
		assert.deepStrictEqual(messages, []);
	});

	test('reports test results only when a test produced them', async t => {
		const directory = mkdtempSync(path.join(os.tmpdir(), 'test-checkpoint-outputs-'));
		t.after(() => rmSync(directory, { recursive: true, force: true }));
		const env = { ...environment, SYSTEM_ACCESSTOKEN: undefined, BUILD_ARTIFACTSTAGINGDIRECTORY: directory };
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

	test('publisher requires success, explicit readiness and a restore miss', () => {
		const publisher = load(readFileSync(path.join(repositoryRoot, 'build/azure-pipelines/common/publish-test-checkpoint.yml'), 'utf8')) as { steps: object[] };
		const prefix = 'TEST_CHECKPOINT_${{ upper(replace(parameters.testId, \'-\', \'_\')) }}';
		assert.deepStrictEqual(publisher.steps, [{
			task: '1ES.PublishPipelineArtifact@1',
			inputs: {
				targetPath: `$(${prefix}_FILE)`,
				artifactName: `$(${prefix}_ARTIFACT)`,
				sbomEnabled: false,
				isProduction: false,
			},
			condition: `and(succeeded(), eq(variables['${prefix}_READY'], 'true'), ne(variables['${prefix}_HIT'], 'true'))`,
			displayName: 'Publish ${{ parameters.testId }} checkpoint',
			timeoutInMinutes: 2,
		}]);
	});

	test('each unit test has a guarded script and an immediate guarded publisher', () => {
		const snapshots = testGroups().flatMap(group => group.flatMap((step, index) => {
			const enabled = step[reuseCondition];
			if (!enabled || Array.isArray(enabled)) {
				return [];
			}
			const script = enabled.script ?? enabled.powershell;
			assert.ok(script);
			const id = /record (?<id>[\w-]+)/.exec(script)?.groups?.id;
			const publisher = group[index + 1][reuseCondition];
			assert.ok(Array.isArray(publisher));
			return [{
				id,
				shell: enabled.powershell ? 'powershell' : 'script',
				condition: enabled.condition,
				publisher: publisher[0],
				disabledScript: step['${{ else }}']?.script ?? step['${{ else }}']?.powershell,
			}];
		}));
		assert.deepStrictEqual(snapshots, unitTests.map(({ id, command }) => ({
			id,
			shell: 'powershell',
			condition: `and(succeeded(), ne(variables['TEST_CHECKPOINT_${id.replaceAll('-', '_').toUpperCase()}_HIT'], 'true'))`,
			publisher: { template: '../../common/publish-test-checkpoint.yml@self', parameters: { testId: id } },
			disabledScript: id === 'unit-node' ? `New-Item -ItemType Directory -Force -Path .build\\crashes | Out-Null\n${command}\n` : command,
		})));
	});

	for (const { id, command } of unitTests) {
		test(`${id}: actual enabled shell only records after a successful runner`, { skip: !hasPowerShell && 'PowerShell is not available' }, t => {
			const directory = mkdtempSync(path.join(os.tmpdir(), 'test-checkpoint-shell-'));
			t.after(() => rmSync(directory, { recursive: true, force: true }));
			const enabled = testGroups().flat().map(step => step[reuseCondition])
				.find(step => step && !Array.isArray(step) && step.powershell?.includes(`record ${id}`));
			assert.ok(enabled && !Array.isArray(enabled) && enabled.powershell);
			const original = enabled.powershell;
			const quotePowerShell = (value: string) => `'${value.replaceAll('\'', '\'\'')}'`;
			const results = [17, 0].map(exitCode => {
				const script = original.replace(command, `& ${quotePowerShell(process.execPath)} -e "process.exit(${exitCode})"`)
					.replace('. build/azure-pipelines/win32/exec.ps1', `. ${quotePowerShell(path.join(repositoryRoot, 'build/azure-pipelines/win32/exec.ps1'))}`)
					.replace('node build/azure-pipelines/common/testCheckpoint.ts', `& ${quotePowerShell(process.execPath)} ${quotePowerShell(helperPath)}`);
				const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
					cwd: directory,
					env: { ...process.env, ...environment, AGENT_TEMPDIRECTORY: directory },
					encoding: 'utf8',
				});
				assert.ifError(result.error);
				return {
					status: result.status,
					stderr: exitCode !== 0 ? result.stderr.includes('exit code 17') : result.stderr,
					ready: result.stdout.includes('_READY]true'),
					fileExists: existsSync(path.join(directory, 'test-checkpoints/123/Windows/Windows_x64_Test/1/1', id, 'test-checkpoint.json')),
				};
			});
			assert.deepStrictEqual(results, [
				{ status: 1, stderr: true, ready: false, fileExists: false },
				{ status: 0, stderr: '', ready: true, fileExists: true },
			]);
		});
	}
});
