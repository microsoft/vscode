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
const platforms = [
	{ id: 'linux', os: 'Linux', arch: 'x64', browser: 'chromium' },
	{ id: 'win32', os: 'Windows_NT', arch: 'x64', browser: 'chromium' },
	{ id: 'darwin', os: 'Darwin', arch: 'arm64', browser: 'webkit' },
] as const;
type Platform = typeof platforms[number];
const powershell = process.platform === 'win32' ? 'powershell' : 'pwsh';
const hasPowerShell = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8' }).status === 0;

function unitTests(platform: Platform) {
	return [
		{ id: 'unit-electron', command: platform.id === 'win32' ? '.\\scripts\\test.bat --build --tfs "Unit Tests"' : './scripts/test.sh --build --tfs "Unit Tests"' },
		{ id: 'unit-node', command: 'npm run test-node -- --build' },
		{ id: `unit-browser-${platform.browser}`, command: `npm run test-browser-no-install -- --build --browser ${platform.browser} --tfs "Browser Unit Tests"` },
	];
}

const environment: NodeJS.ProcessEnv = {
	AGENT_OS: 'Linux',
	VSCODE_ARCH: 'x64',
	BUILD_BUILDID: '123',
	BUILD_SOURCEVERSION: 'source-commit',
	SYSTEM_COLLECTIONURI: 'https://dev.azure.com/organization/',
	SYSTEM_TEAMPROJECTID: 'project-id',
	SYSTEM_STAGENAME: 'Linux',
	SYSTEM_JOBNAME: 'Linux_x64',
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

function artifactName(id: string, target = 'linux-x64'): string {
	return `test-pass-Linux-Linux_x64-${target}-${id}`;
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

function testGroups(platform: Platform): TestStep[][] {
	const template = load(readFileSync(path.join(repositoryRoot, `build/azure-pipelines/${platform.id}/steps/product-build-${platform.id}-test.yml`), 'utf8')) as {
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
			return Response.json({ value: [
				{ name: artifactName('unit-electron'), resource: { type: 'PipelineArtifact' } },
				{ name: artifactName('unit-node'), resource: { type: 'Container' } },
				{ name: artifactName('unit-browser-chromium') + '-attempt1', resource: { type: 'PipelineArtifact' } },
				{ name: artifactName('unit-node').replace('Linux_x64', 'Linux_arm64'), resource: { type: 'PipelineArtifact' } },
				{ name: artifactName('unit-node').replace('test-pass-', 'test-pass-v2-'), resource: { type: 'PipelineArtifact' } },
			] });
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
				TEST_CHECKPOINT_UNIT_NODE_HIT: 'false',
				TEST_CHECKPOINT_UNIT_NODE_READY: 'false',
				TEST_CHECKPOINT_UNIT_BROWSER_CHROMIUM_HIT: 'false',
				TEST_CHECKPOINT_UNIT_BROWSER_CHROMIUM_READY: 'false',
				...Object.fromEntries([
					'INTEGRATION_ELECTRON', 'INTEGRATION_REMOTE', 'INTEGRATION_BROWSER_CHROMIUM',
					'SMOKE_ELECTRON', 'SMOKE_BROWSER_CHROMIUM', 'SMOKE_REMOTE', 'SMOKE_PACKAGED_AGENT_HOST',
					'COPILOT_EXTENSION', 'COPILOT_COMPLETIONS_CORE', 'COPILOT_SANITY',
				].flatMap(id => [`TEST_CHECKPOINT_${id}_HIT`, `TEST_CHECKPOINT_${id}_READY`].map(name => [name, 'false']))),
			},
			reused: [`Reusing successful test unit-electron: ${artifactName('unit-electron')}`],
		});
	});

	test('job and stage attempts share names but a new run has its own lookup', async () => {
		const restored: { buildId: string; hit: string }[] = [];
		const request: typeof fetch = async url => Response.json({ value: String(url).includes('/builds/123/')
			? [{ name: artifactName('unit-electron'), resource: { type: 'PipelineArtifact' } }]
			: [] });
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
		for (const args of [[], ['restore', 'extra'], ['record', '../escape'], ['record', 'unit-electron', 'extra']]) {
			await assert.rejects(testCheckpoint(args, environment, request), /Usage:/);
		}
		for (const overrides of [
			{ VSCODE_ARCH: 'arm64' },
			{ AGENT_OS: 'FreeBSD' },
			{ AGENT_OS: 'Darwin', VSCODE_ARCH: 'armhf' },
			{ BUILD_BUILDID: '' },
			{ SYSTEM_JOBNAME: '../job' },
			{ SYSTEM_STAGENAME: 'stage\ninjection' },
			{ SYSTEM_COLLECTIONURI: 'http://dev.azure.com/org/' },
			{ SYSTEM_ACCESSTOKEN: '' },
		]) {
			await assert.rejects(testCheckpoint(['restore'], { ...environment, ...overrides }, request, () => { }), /require|Missing|Invalid|HTTPS/);
		}
	});

	for (const platform of platforms) {
		for (const arch of platform.id === 'linux' ? ['x64'] : ['x64', 'arm64']) {
			test(`${platform.id}-${arch}: checkpoints isolate targets and use the platform's browser`, async t => {
				const directory = mkdtempSync(path.join(os.tmpdir(), 'test-checkpoint-target-'));
				t.after(() => rmSync(directory, { recursive: true, force: true }));
				const target = `${platform.id}-${arch}`;
				const id = `unit-browser-${platform.browser}`;
				const prefix = `TEST_CHECKPOINT_${id.replaceAll('-', '_').toUpperCase()}`;
				const env = { ...environment, AGENT_OS: platform.os, VSCODE_ARCH: arch, AGENT_TEMPDIRECTORY: directory };
				const recorded: string[] = [];
				await testCheckpoint(['record', id], env, fetch, message => recorded.push(message));
				const state = variables(recorded);
				const metadata: Record<string, unknown> = JSON.parse(readFileSync(state[`${prefix}_FILE`], 'utf8'));
				const hits: string[] = [];
				for (const artifactTarget of ['wrong-target', target]) {
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
				}, { target, testId: id, artifact: artifactName(id, target), ready: 'true', hits: ['false', 'true'] });
				const wrongBrowser = platform.browser === 'webkit' ? 'chromium' : 'webkit';
				await assert.rejects(testCheckpoint(['record', `unit-browser-${wrongBrowser}`], env), /Usage:/);
			});
		}
	}

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
			stageName: 'Linux',
			jobName: 'Linux_x64',
			target: 'linux-x64',
			testId: 'unit-node',
			jobAttempt: 2,
			stageAttempt: 1,
			completedAt: true,
		});
		assert.deepStrictEqual(state, {
			TEST_CHECKPOINT_UNIT_NODE_FILE: path.join(directory, 'test-checkpoints/123/Linux/Linux_x64/1/2/unit-node/test-checkpoint.json'),
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

	test('collects only existing outputs when all tests may have been reused', async t => {
		const directory = mkdtempSync(path.join(os.tmpdir(), 'test-checkpoint-outputs-'));
		t.after(() => rmSync(directory, { recursive: true, force: true }));
		const env = {
			...environment,
			SYSTEM_ACCESSTOKEN: undefined,
			BUILD_SOURCESDIRECTORY: path.join(directory, 'sources'),
			BUILD_ARTIFACTSTAGINGDIRECTORY: path.join(directory, 'staging'),
		};
		const observed: Record<string, string>[] = [];
		const collect = async () => {
			const messages: string[] = [];
			await testCheckpoint(['collect-results'], env, fetch, message => messages.push(message));
			observed.push(variables(messages));
		};
		await collect();
		mkdirSync(path.join(env.BUILD_SOURCESDIRECTORY, '.build/logs'), { recursive: true });
		mkdirSync(path.join(env.BUILD_SOURCESDIRECTORY, '.build/crashes'), { recursive: true });
		const results = path.join(env.BUILD_ARTIFACTSTAGINGDIRECTORY, 'test-results/nested');
		mkdirSync(results, { recursive: true });
		writeFileSync(path.join(results, 'unrelated.txt'), 'not a test result');
		await collect();
		writeFileSync(path.join(results, 'integration-results.xml'), '<testsuites/>');
		await collect();
		assert.deepStrictEqual(observed, [
			{ TEST_CHECKPOINT_LOGS_AVAILABLE: 'false', TEST_CHECKPOINT_CRASHES_AVAILABLE: 'false', TEST_CHECKPOINT_RESULTS_AVAILABLE: 'false' },
			{ TEST_CHECKPOINT_LOGS_AVAILABLE: 'true', TEST_CHECKPOINT_CRASHES_AVAILABLE: 'true', TEST_CHECKPOINT_RESULTS_AVAILABLE: 'false' },
			{ TEST_CHECKPOINT_LOGS_AVAILABLE: 'true', TEST_CHECKPOINT_CRASHES_AVAILABLE: 'true', TEST_CHECKPOINT_RESULTS_AVAILABLE: 'true' },
		]);
	});

	test('only the product entry point owns the default and compile templates forward the value', () => {
		const files = [
			'product-build.yml',
			...platforms.flatMap(({ id }) => [
				`${id}/product-build-${id}.yml`,
				`${id}/steps/product-build-${id}-compile.yml`,
				`${id}/steps/product-build-${id}-test.yml`,
			]),
		];
		const defaults = files.map(file => {
			const template = load(readFileSync(path.join(repositoryRoot, 'build/azure-pipelines', file), 'utf8')) as {
				parameters: { name: string; type: string; default?: boolean }[];
			};
			const parameter = template.parameters.find(parameter => parameter.name === 'VSCODE_SKIP_SUCCESSFUL_TEST_TASKS');
			return { file, type: parameter?.type, default: parameter?.default };
		});
		assert.deepStrictEqual(defaults, files.map(file => ({ file, type: 'boolean', default: file === 'product-build.yml' ? true : undefined })));
		for (const { id } of platforms) {
			const compile = readFileSync(path.join(repositoryRoot, `build/azure-pipelines/${id}/steps/product-build-${id}-compile.yml`), 'utf8');
			assert.ok(compile.includes('VSCODE_SKIP_SUCCESSFUL_TEST_TASKS: ${{ parameters.VSCODE_SKIP_SUCCESSFUL_TEST_TASKS }}'), id);
		}
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

	for (const platform of platforms) {
		test(`${platform.id}: each unit test has a guarded script and an immediate guarded publisher`, () => {
			const groups = testGroups(platform);
			const snapshots = groups.flatMap(group => group.flatMap((step, index) => {
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
			const nodeSetup = platform.id === 'win32'
				? 'New-Item -ItemType Directory -Force -Path .build\\crashes | Out-Null\n'
				: 'set -e\nmkdir -p .build/crashes\n';
			assert.deepStrictEqual(snapshots, unitTests(platform).map(({ id, command }) => ({
				id,
				shell: platform.id === 'win32' ? 'powershell' : 'script',
				condition: `and(succeeded(), ne(variables['TEST_CHECKPOINT_${id.replaceAll('-', '_').toUpperCase()}_HIT'], 'true'))`,
				publisher: { template: '../../common/publish-test-checkpoint.yml@self', parameters: { testId: id } },
				disabledScript: id === 'unit-node' ? `${nodeSetup}${command}\n` : command,
			})));
		});

		for (const { id, command } of unitTests(platform)) {
			const windows = platform.id === 'win32';
			const skip = windows ? (!hasPowerShell && 'PowerShell is not available') : (process.platform === 'win32' && 'Requires bash');
			test(`${platform.id} ${id}: actual enabled shell only records after a successful runner`, { skip }, t => {
				const directory = mkdtempSync(path.join(os.tmpdir(), 'test-checkpoint-shell-'));
				t.after(() => rmSync(directory, { recursive: true, force: true }));
				const enabled = testGroups(platform).flat().map(step => step[reuseCondition])
					.find(step => step && !Array.isArray(step) && (step.script ?? step.powershell)?.includes(`record ${id}`));
				assert.ok(enabled && !Array.isArray(enabled));
				const original = enabled.script ?? enabled.powershell;
				assert.ok(original);
				const results = [17, 0].map(exitCode => {
					const quotePowerShell = (value: string) => `'${value.replaceAll('\'', '\'\'')}'`;
					const script = windows
						? original.replace(command, `& ${quotePowerShell(process.execPath)} -e "process.exit(${exitCode})"`)
							.replace('. build/azure-pipelines/win32/exec.ps1', `. ${quotePowerShell(path.join(repositoryRoot, 'build/azure-pipelines/win32/exec.ps1'))}`)
							.replace('node build/azure-pipelines/common/testCheckpoint.ts', `& ${quotePowerShell(process.execPath)} ${quotePowerShell(helperPath)}`)
						: original.replace(command, `(exit ${exitCode})`)
							.replace('node build/azure-pipelines/common/testCheckpoint.ts', `"${process.execPath}" "${helperPath}"`);
					const result = spawnSync(windows ? powershell : 'bash', windows ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script] : ['-c', script], {
						cwd: directory,
						env: { ...process.env, ...environment, AGENT_OS: platform.os, VSCODE_ARCH: platform.arch, AGENT_TEMPDIRECTORY: directory },
						encoding: 'utf8',
					});
					assert.ifError(result.error);
					return {
						status: result.status,
						stderr: windows && exitCode !== 0 ? result.stderr.includes('exit code 17') : result.stderr,
						ready: result.stdout.includes('_READY]true'),
						fileExists: existsSync(path.join(directory, 'test-checkpoints/123/Linux/Linux_x64/1/1', id, 'test-checkpoint.json')),
					};
				});
				assert.deepStrictEqual(results, [
					{ status: windows ? 1 : 17, stderr: windows ? true : '', ready: false, fileExists: false },
					{ status: 0, stderr: '', ready: true, fileExists: true },
				]);
			});
		}
	}
});
