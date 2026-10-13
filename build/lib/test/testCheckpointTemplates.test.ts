/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';
import { testCheckpoint, testIds } from '../../azure-pipelines/common/testCheckpoint.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const pipelineRoot = path.join(repositoryRoot, 'build/azure-pipelines');
const windowsTestFile = 'win32/steps/product-build-win32-test.yml';
const linuxTestFile = 'linux/steps/product-build-linux-test.yml';
const darwinTestFile = 'darwin/steps/product-build-darwin-test.yml';

interface ScriptStep {
	[key: string]: unknown;
	script?: string;
	powershell?: string;
	condition?: string;
	displayName?: string;
}

interface CheckpointParameters {
	testId: string;
	testStep: ScriptStep;
}

interface Template {
	parameters?: { name: string; type: string; default?: boolean | string | string[]; values?: string[] }[];
	steps: ScriptStep[];
}

function readTemplate(file: string): Template {
	return load(readFileSync(path.join(pipelineRoot, file), 'utf8')) as Template;
}

function records(value: unknown): Record<string, unknown>[] {
	if (Array.isArray(value)) {
		return value.flatMap(records);
	}
	if (value && typeof value === 'object') {
		return [value as Record<string, unknown>, ...Object.values(value).flatMap(records)];
	}
	return [];
}

function calls(value: unknown): CheckpointParameters[] {
	return records(value).filter(record =>
		typeof record.template === 'string' && record.template.endsWith('/run-test-with-checkpoint.yml@self')
	).map(record => record.parameters as CheckpointParameters);
}

function copilotCalls(os: 'darwin' | 'linux' | 'win32'): CheckpointParameters[] {
	const steps = readTemplate('copilot/test-integration-steps.yml').steps;
	return calls(steps.filter(step => Object.hasOwn(step, `\${{ if eq(parameters.OS, '${os}') }}`)));
}

function allCalls(testFile: string, os: 'darwin' | 'linux' | 'win32'): CheckpointParameters[] {
	return [...calls(readTemplate(testFile)), ...copilotCalls(os)];
}

function selectedTestIds(testFile: string): { selectedId: string; testId: string }[] {
	return readTemplate(testFile).steps.flatMap(step => Object.entries(step)
		.filter(([key]) => key.startsWith('${{ if ') && key.includes('containsValue(parameters.VSCODE_TEST_IDS, '))
		.flatMap(([key, branch]) => {
			const selectedId = key.match(/containsValue\(parameters\.VSCODE_TEST_IDS, '(?<id>[^']+)'\)/)?.groups?.id;
			if (!selectedId) {
				throw new Error(`Missing test ID in ${key}`);
			}
			return [
				...calls(branch).map(call => ({ selectedId, testId: call.testId })),
				...records(branch).filter(record => record.template === '../../copilot/test-integration-steps.yml@self').map(() => ({ selectedId, testId: 'copilot' })),
			];
		})
	);
}

function ciJobs(file: string, platform: 'darwin' | 'linux' | 'win32'): { name: string; displayName: string; ids: string[] }[] {
	return records(readTemplate(file))
		.filter(record => typeof record.template === 'string' && record.template.endsWith(`${platform}/product-build-${platform}-ci.yml@self`))
		.map(record => {
			const parameters = record.parameters as { VSCODE_JOB_NAME: string; VSCODE_JOB_DISPLAY_NAME: string; VSCODE_TEST_IDS: string[] };
			return { name: parameters.VSCODE_JOB_NAME, displayName: parameters.VSCODE_JOB_DISPLAY_NAME, ids: parameters.VSCODE_TEST_IDS };
		});
}

const wrapper = readTemplate('common/run-test-with-checkpoint.yml');

suite('Product test checkpoint templates', () => {
	test('only the product test steps use checkpoints', () => {
		const users: string[] = [];
		for (const file of globSync('**/*.yml', { cwd: pipelineRoot }).sort()) {
			for (const record of records(readTemplate(file))) {
				if (typeof record.template === 'string' && /\/(restore-test-checkpoints|run-test-with-checkpoint|publish-test-checkpoint)\.yml@self$/.test(record.template)) {
					users.push(`${file} -> ${path.basename(record.template.replace(/@self$/, ''))}`);
				}
			}
		}
		const copilot = readTemplate('copilot/test-integration-steps.yml').steps;
		assert.deepStrictEqual({
			users: [...new Set(users)],
			unsupportedCopilotCalls: calls(copilot.filter(step =>
				!Object.hasOwn(step, '${{ if eq(parameters.OS, \'darwin\') }}')
				&& !Object.hasOwn(step, '${{ if eq(parameters.OS, \'linux\') }}')
				&& !Object.hasOwn(step, '${{ if eq(parameters.OS, \'win32\') }}')
			)).length,
		}, {
			users: [
				'common/run-test-with-checkpoint.yml -> publish-test-checkpoint.yml',
				'copilot/test-integration-steps.yml -> run-test-with-checkpoint.yml',
				`${darwinTestFile} -> restore-test-checkpoints.yml`,
				`${darwinTestFile} -> run-test-with-checkpoint.yml`,
				`${linuxTestFile} -> restore-test-checkpoints.yml`,
				`${linuxTestFile} -> run-test-with-checkpoint.yml`,
				`${windowsTestFile} -> restore-test-checkpoints.yml`,
				`${windowsTestFile} -> run-test-with-checkpoint.yml`,
			],
			unsupportedCopilotCalls: 0,
		});
	});

	test('wrapper copies the test step and records and publishes its checkpoint on the same condition', () => {
		// Step parameters arrive normalized (e.g. `powershell:` as `task: PowerShell@2`), so the test step must be copied as is
		const condition = 'and(${{ coalesce(parameters.testStep.condition, \'succeeded()\') }}, ne(variables[\'TEST_CHECKPOINT_${{ upper(replace(parameters.testId, \'-\', \'_\')) }}_HIT\'], \'true\'))';
		assert.deepStrictEqual({ parameters: wrapper.parameters, steps: wrapper.steps }, {
			parameters: [{ name: 'testId', type: 'string' }, { name: 'testStep', type: 'step' }],
			steps: [
				{
					'${{ each pair in parameters.testStep }}': { '${{ if ne(pair.key, \'condition\') }}': { '${{ pair.key }}': '${{ pair.value }}' } },
					condition,
				},
				{ template: './publish-test-checkpoint.yml@self', parameters: { testId: '${{ parameters.testId }}', condition } },
			],
		});
	});

	test('restore never resets an already initialized job', () => {
		const restore = readTemplate('common/restore-test-checkpoints.yml');
		assert.deepStrictEqual({ parameters: restore.parameters, steps: restore.steps }, {
			parameters: undefined,
			steps: [{
				script: 'node "$(Build.SourcesDirectory)/build/azure-pipelines/common/testCheckpoint.ts" restore',
				env: { SYSTEM_ACCESSTOKEN: '$(System.AccessToken)' },
				condition: 'and(succeeded(), ne(variables[\'TEST_CHECKPOINTS_RESTORED\'], \'true\'))',
				displayName: 'Restore test checkpoints',
				timeoutInMinutes: 3,
			}],
		});
	});

	test('test results are only published when an attempt produced them', () => {
		const observed = [windowsTestFile, linuxTestFile, darwinTestFile].map(file => {
			const steps = readTemplate(file).steps;
			const index = steps.findIndex(step => step.task === 'PublishTestResults@2');
			assert.ok(index > 0);
			return { file, collector: steps[index - 1], condition: steps[index].condition };
		});
		assert.deepStrictEqual(observed, [{
			file: windowsTestFile,
			collector: {
				powershell: 'node build/azure-pipelines/common/testCheckpoint.ts collect-results',
				displayName: 'Check test output availability',
				condition: 'succeededOrFailed()',
			},
			condition: 'and(succeededOrFailed(), eq(variables[\'TEST_CHECKPOINT_RESULTS_AVAILABLE\'], \'true\'))',
		}, {
			file: linuxTestFile,
			collector: {
				script: 'node build/azure-pipelines/common/testCheckpoint.ts collect-results',
				displayName: 'Check test output availability',
				condition: 'succeededOrFailed()',
			},
			condition: 'and(succeededOrFailed(), eq(variables[\'TEST_CHECKPOINT_RESULTS_AVAILABLE\'], \'true\'))',
		}, {
			file: darwinTestFile,
			collector: {
				script: 'node build/azure-pipelines/common/testCheckpoint.ts collect-results',
				displayName: 'Check test output availability',
				condition: 'succeededOrFailed()',
			},
			condition: 'and(succeededOrFailed(), eq(variables[\'TEST_CHECKPOINT_RESULTS_AVAILABLE\'], \'true\'))',
		}]);
	});

	test('every test task is registered, independently published and gated', async t => {
		const windowsExpected = [
			'unit-electron', 'unit-node', 'unit-browser-chromium',
			'integration-electron', 'integration-browser-firefox', 'integration-remote',
			'smoke-electron', 'smoke-browser-chromium', 'smoke-remote',
			'copilot-extension', 'copilot-completions-core', 'copilot-sanity',
		];
		const linuxExpected = [
			'unit-electron', 'unit-node', 'unit-browser-chromium',
			'integration-electron', 'integration-browser-chromium', 'integration-remote',
			'smoke-electron', 'smoke-browser-chromium', 'smoke-remote',
			'copilot-extension', 'copilot-completions-core', 'copilot-sanity',
		];
		const darwinExpected = [
			'unit-electron', 'unit-node', 'unit-browser-webkit',
			'integration-electron', 'integration-browser-webkit', 'integration-remote',
			'smoke-electron', 'smoke-agents-pac-proxy', 'smoke-agents-kerberos-pac-proxy', 'smoke-browser-chromium', 'smoke-remote',
			'copilot-extension', 'copilot-completions-core', 'copilot-sanity',
		];
		const allExpected = [
			'unit-electron', 'unit-node', 'unit-browser-chromium', 'unit-browser-webkit',
			'integration-electron', 'integration-browser-chromium', 'integration-browser-firefox', 'integration-browser-webkit', 'integration-remote',
			'smoke-electron', 'smoke-agents-pac-proxy', 'smoke-agents-kerberos-pac-proxy', 'smoke-browser-chromium', 'smoke-remote',
			'copilot-extension', 'copilot-completions-core', 'copilot-sanity',
		];
		const targets = [
			{ file: windowsTestFile, os: 'win32' as const, expected: windowsExpected, agentOS: 'Windows_NT', arch: 'x64', target: 'win32-x64', stage: 'Windows', job: 'Windows_x64_Test' },
			{ file: linuxTestFile, os: 'linux' as const, expected: linuxExpected, agentOS: 'Linux', arch: 'x64', target: 'linux-x64', stage: 'LinuxX64', job: 'Linux_x64_Test' },
			{ file: darwinTestFile, os: 'darwin' as const, expected: darwinExpected, agentOS: 'Darwin', arch: 'arm64', target: 'darwin-arm64', stage: 'macOSARM64', job: 'macOS_arm64_Test' },
		];
		const publishedIds = readTemplate('common/publish-test-checkpoint.yml').parameters?.find(parameter => parameter.name === 'testId')?.values;
		assert.deepStrictEqual({
			targets: targets.map(target => {
				const steps = readTemplate(target.file).steps;
				return {
					file: target.file,
					calls: allCalls(target.file, target.os).map(call => call.testId),
					firstStep: steps[0],
					restores: records(steps).filter(step => step.template?.toString().endsWith('/restore-test-checkpoints.yml@self')).length,
					copilot: records(steps).find(step => step.template === '../../copilot/test-integration-steps.yml@self')?.parameters,
				};
			}),
			publishedIds,
			scriptIds: [...testIds],
		}, {
			targets: [{
				file: windowsTestFile,
				calls: windowsExpected,
				firstStep: { template: '../../common/restore-test-checkpoints.yml@self' },
				restores: 1,
				copilot: { OS: 'win32' },
			}, {
				file: linuxTestFile,
				calls: linuxExpected,
				firstStep: { template: '../../common/restore-test-checkpoints.yml@self' },
				restores: 1,
				copilot: { OS: 'linux' },
			}, {
				file: darwinTestFile,
				calls: darwinExpected,
				firstStep: { template: '../../common/restore-test-checkpoints.yml@self' },
				restores: 1,
				copilot: { OS: 'darwin' },
			}],
			publishedIds: allExpected,
			scriptIds: allExpected,
		});

		const temp = mkdtempSync(path.join(os.tmpdir(), 'checkpoint-inventory-'));
		t.after(() => rmSync(temp, { recursive: true, force: true }));
		const restoredTargets: { target: string; hits: string[] }[] = [];
		for (const target of targets) {
			const env: NodeJS.ProcessEnv = {
				AGENT_OS: target.agentOS, VSCODE_ARCH: target.arch, BUILD_BUILDID: '123',
				SYSTEM_STAGENAME: target.stage, SYSTEM_JOBNAME: target.job, SYSTEM_JOBATTEMPT: '1', SYSTEM_STAGEATTEMPT: '1',
				BUILD_SOURCEVERSION: 'source', AGENT_TEMPDIRECTORY: temp,
				SYSTEM_COLLECTIONURI: 'https://dev.azure.com/organization/', SYSTEM_TEAMPROJECTID: 'project', SYSTEM_ACCESSTOKEN: 'test-token',
			};
			const artifacts: { name: string; resource: { type: string } }[] = [];
			for (const id of target.expected) {
				const messages: string[] = [];
				await testCheckpoint(['record', id], env, fetch, message => messages.push(message));
				const artifact = messages.find(message => message.includes('_ARTIFACT]'))?.split(']')[1];
				assert.ok(artifact && messages.some(message => message.endsWith('_READY]true')), id);
				artifacts.push({ name: artifact, resource: { type: 'PipelineArtifact' } });
			}
			const restored: string[] = [];
			await testCheckpoint(['restore'], { ...env, SYSTEM_JOBATTEMPT: '2' }, async () => Response.json({ value: artifacts }), message => restored.push(message));
			restoredTargets.push({
				target: target.target,
				hits: restored.filter(message => message.endsWith('_HIT]true')).sort(),
			});
		}
		assert.deepStrictEqual(restoredTargets, targets.map(target => ({
			target: target.target,
			hits: target.expected.map(id => `##vso[task.setvariable variable=TEST_CHECKPOINT_${id.replaceAll('-', '_').toUpperCase()}_HIT]true`).sort(),
		})));
	});

	test('Windows x64 CI assigns every test ID to one job', () => {
		const steps = readTemplate(windowsTestFile).steps;
		const selectedIds = selectedTestIds(windowsTestFile);
		const ci = readTemplate('win32/product-build-win32-ci.yml');
		const job = records(ci).find(record => record.job === 'Windows${{ parameters.VSCODE_JOB_NAME }}');
		const compile = records(job).find(record => record.template === './steps/product-build-win32-compile.yml@self');
		const compileTemplate = readTemplate('win32/steps/product-build-win32-compile.yml');
		const setup = readTemplate('win32/steps/product-build-win32-setup.yml');
		const productTestTemplate = readTemplate('win32/product-build-win32-test.yml');
		const productTestJob = records(productTestTemplate).find(record => record.job === 'Windows_${{ parameters.VSCODE_ARCH }}_Test_${{ parameters.VSCODE_JOB_NAME }}');
		const productSteps = records(productTestTemplate).filter(record => record.template === './steps/product-build-win32-test.yml@self' || record.template === './steps/product-build-win32-setup.yml@self');
		const compileSteps = records(compileTemplate).filter(record => record.template === 'product-build-win32-test.yml@self' || record.template === 'product-build-win32-setup.yml@self');
		const pipelineFiles = ['product-build.yml', 'product-build-ado-ci.yml', 'product-build-template.yml'];
		const jobsByPipeline = pipelineFiles.map(file => ciJobs(file, 'win32'));
		const jobs = jobsByPipeline[0];
		const productJobsByPipeline = ['product-build.yml', 'product-build-template.yml'].map(file => {
			const pipeline = readTemplate(file);
			return {
				runTests: records(pipeline).filter(record => typeof record.template === 'string' && record.template.endsWith('win32/product-build-win32.yml@self'))
					.map(record => (record.parameters as Record<string, unknown>).VSCODE_RUN_TESTS),
				jobs: records(pipeline).filter(record => typeof record.template === 'string' && record.template.endsWith('win32/product-build-win32-test.yml@self'))
					.map(record => {
						const parameters = record.parameters as { VSCODE_ARCH: string; VSCODE_JOB_NAME: string; VSCODE_JOB_DISPLAY_NAME: string; VSCODE_TEST_IDS: string[] };
						return { arch: parameters.VSCODE_ARCH, name: parameters.VSCODE_JOB_NAME, displayName: parameters.VSCODE_JOB_DISPLAY_NAME, ids: parameters.VSCODE_TEST_IDS };
					}),
			};
		});
		const assignedIds = jobs.flatMap(job => job.ids).sort();
		const copilotCheckpoints = copilotCalls('win32').map(call => call.testId);
		const availableIds = [
			...allCalls(windowsTestFile, 'win32').map(call => call.testId).filter(id => !copilotCheckpoints.includes(id)),
			'copilot',
		].sort();

		assert.deepStrictEqual({
			testIdsType: ci.parameters?.find(parameter => parameter.name === 'VSCODE_TEST_IDS')?.type,
			jobDisplayName: job?.displayName,
			displayNames: jobs.filter(job => ['Smoke', 'Integration', 'Unit', 'BrowserRemote'].includes(job.name))
				.map(job => ({ name: job.name, displayName: job.displayName })),
			sameJobsInEachPipeline: jobsByPipeline.every(pipelineJobs => JSON.stringify(pipelineJobs) === JSON.stringify(jobs)),
			uniqueJobNames: new Set(jobs.map(job => job.name)).size === jobs.length,
			validJobNames: jobs.every(job => /^[A-Za-z_][A-Za-z0-9_]*$/.test(`Windows${job.name}`) && job.ids.length > 0),
			assignedIds,
			availableIds,
			ciTestIds: (compile?.parameters as Record<string, string> | undefined)?.VSCODE_TEST_IDS,
			defaultTestIds: [compileTemplate, setup, readTemplate(windowsTestFile)].map(template => template.parameters?.find(parameter => parameter.name === 'VSCODE_TEST_IDS')?.default),
			forwardedTestIds: compileSteps.map(step => (step.parameters as Record<string, string>).VSCODE_TEST_IDS),
			productTestIds: productSteps.map(step => (step.parameters as Record<string, string>).VSCODE_TEST_IDS).filter(value => value !== undefined),
			productTestJob: { dependsOn: productTestJob?.dependsOn, displayName: productTestJob?.displayName },
			productJobsByPipeline,
			copilotSetup: Object.keys(setup.steps.find(step => records(step).some(record => record.template === '../../copilot/pull-test-cache.yml@self')) ?? {}),
			copilotTests: Object.keys(steps.find(step => records(step).some(record => record.template === '../../copilot/test-integration-steps.yml@self')) ?? {}),
			agentHostSmoke: Object.keys(compileTemplate.steps.find(step => records(step).some(record => record.displayName === '🧪 Smoke test packaged Agent Host')) ?? {}),
			selectedIds: selectedIds.map(selection => selection.selectedId).sort(),
			selectionsMatchTests: selectedIds.every(selection => selection.selectedId === selection.testId),
			copilotCheckpoints,
			// Tests are only selected by test ID
			testEnvironmentParameters: [compileTemplate, setup, readTemplate(windowsTestFile)].flatMap(template => template.parameters ?? [])
				.map(parameter => parameter.name).filter(name => /^VSCODE_RUN_\w+_TESTS$/.test(name)),
		}, {
			testIdsType: 'object',
			jobDisplayName: '${{ parameters.VSCODE_JOB_DISPLAY_NAME }}',
			displayNames: [
				{ name: 'Unit', displayName: 'Unit Tests' },
				{ name: 'BrowserRemote', displayName: 'Browser & Remote Tests' },
				{ name: 'Integration', displayName: 'Integration Tests (Electron)' },
				{ name: 'Smoke', displayName: 'Smoke Tests (Electron)' },
			],
			sameJobsInEachPipeline: true,
			uniqueJobNames: true,
			validJobNames: true,
			assignedIds: availableIds,
			availableIds,
			ciTestIds: '${{ parameters.VSCODE_TEST_IDS }}',
			defaultTestIds: [[], [], []],
			forwardedTestIds: ['${{ parameters.VSCODE_TEST_IDS }}', '${{ parameters.VSCODE_TEST_IDS }}'],
			productTestIds: ['${{ parameters.VSCODE_TEST_IDS }}', '${{ parameters.VSCODE_TEST_IDS }}'],
			productTestJob: {
				dependsOn: 'Windows_${{ parameters.VSCODE_ARCH }}_Compile',
				displayName: 'Windows (${{ upper(parameters.VSCODE_ARCH) }}) - ${{ parameters.VSCODE_JOB_DISPLAY_NAME }}',
			},
			// The product build runs the same test jobs as CI, and only for x64
			productJobsByPipeline: [0, 1].map(() => ({
				runTests: ['${{ eq(parameters.VSCODE_STEP_ON_IT, false) }}', undefined],
				jobs: jobs.map(job => ({ arch: 'x64', ...job })),
			})),
			copilotSetup: ['${{ if containsValue(parameters.VSCODE_TEST_IDS, \'copilot\') }}'],
			copilotTests: ['${{ if containsValue(parameters.VSCODE_TEST_IDS, \'copilot\') }}'],
			agentHostSmoke: ['${{ if and(eq(parameters.VSCODE_ARCH, \'x64\'), or(ne(parameters.VSCODE_CIBUILD, true), eq(length(parameters.VSCODE_TEST_IDS), 0), containsValue(parameters.VSCODE_TEST_IDS, \'smoke-electron\'))) }}'],
			selectedIds: availableIds,
			selectionsMatchTests: true,
			copilotCheckpoints: ['copilot-extension', 'copilot-completions-core', 'copilot-sanity'],
			testEnvironmentParameters: [],
		});
	});

	test('Windows x64 CI gives unit tests and Electron smoke tests 70 minutes', () => {
		const ci = readTemplate('win32/product-build-win32-ci.yml');
		const job = records(ci).find(record => record.job === 'Windows${{ parameters.VSCODE_JOB_NAME }}');
		assert.ok(job);
		assert.deepStrictEqual({
			timeout: job.timeoutInMinutes,
			branches: Object.fromEntries(Object.entries(job).filter(([key]) => key.startsWith('${{ '))),
			cancelTimeoutInMinutes: job.cancelTimeoutInMinutes,
		}, {
			timeout: undefined,
			branches: {
				'${{ if or(eq(parameters.VSCODE_JOB_NAME, \'Unit\'), containsValue(parameters.VSCODE_TEST_IDS, \'smoke-electron\')) }}': { timeoutInMinutes: 70 },
				'${{ else }}': { timeoutInMinutes: 50 },
			},
			cancelTimeoutInMinutes: 10,
		});
	});

	test('Linux and macOS CI assign every test ID to one of four jobs', () => {
		const pipelineFiles = ['product-build.yml', 'product-build-ado-ci.yml', 'product-build-template.yml'];
		const observed = ([
			{ platform: 'linux', testFile: linuxTestFile, jobPrefix: 'Linux' },
			{ platform: 'darwin', testFile: darwinTestFile, jobPrefix: 'macOS' },
		] as const).map(({ platform, testFile, jobPrefix }) => {
			const steps = readTemplate(testFile).steps;
			const productTestTemplate = readTemplate(`${platform}/product-build-${platform}-test.yml`);
			const productTestJob = records(productTestTemplate).find(record => typeof record.job === 'string');
			const productJobsByPipeline = ['product-build.yml', 'product-build-template.yml'].map(file => {
				const pipeline = readTemplate(file);
				return {
					runTests: records(pipeline).filter(record => typeof record.template === 'string' && record.template.endsWith(`${platform}/product-build-${platform}.yml@self`))
						.map(record => (record.parameters as Record<string, unknown>).VSCODE_RUN_TESTS),
					jobs: records(pipeline).filter(record => typeof record.template === 'string' && record.template.endsWith(`${platform}/product-build-${platform}-test.yml@self`))
						.map(record => {
							const parameters = record.parameters as { VSCODE_ARCH: string; VSCODE_JOB_NAME: string; VSCODE_JOB_DISPLAY_NAME: string; VSCODE_TEST_IDS: string[] };
							return { arch: parameters.VSCODE_ARCH, name: parameters.VSCODE_JOB_NAME, displayName: parameters.VSCODE_JOB_DISPLAY_NAME, ids: parameters.VSCODE_TEST_IDS };
						}),
				};
			});
			const selectedIds = selectedTestIds(testFile);
			const ci = readTemplate(`${platform}/product-build-${platform}-ci.yml`);
			const job = records(ci).find(record => record.job === `${jobPrefix}\${{ parameters.VSCODE_JOB_NAME }}`);
			const compile = records(job).find(record => record.template === `./steps/product-build-${platform}-compile.yml@self`);
			const compileTemplate = readTemplate(`${platform}/steps/product-build-${platform}-compile.yml`);
			const setup = readTemplate(`${platform}/steps/product-build-${platform}-setup.yml`);
			const compileSteps = records(compileTemplate).filter(record => record.template === `product-build-${platform}-test.yml@self` || record.template === `product-build-${platform}-setup.yml@self`);
			const jobsByPipeline = pipelineFiles.map(file => ciJobs(file, platform));
			const jobs = jobsByPipeline[0];
			const copilotCheckpoints = copilotCalls(platform).map(call => call.testId);
			const availableIds = [
				...allCalls(testFile, platform).map(call => call.testId).filter(id => !copilotCheckpoints.includes(id)),
				'copilot',
			].sort();
			return {
				platform,
				jobName: job?.job,
				jobDisplayName: job?.displayName,
				jobDisplayNames: jobs.map(({ displayName }) => displayName),
				sameJobsInEachPipeline: jobsByPipeline.every(pipelineJobs => JSON.stringify(pipelineJobs) === JSON.stringify(jobs)),
				validJobNames: jobs.every(job => /^[A-Za-z_][A-Za-z0-9_]*$/.test(`${jobPrefix}${job.name}`) && job.ids.length > 0)
					&& new Set(jobs.map(job => job.name)).size === jobs.length,
				assignedIds: jobs.flatMap(job => job.ids).sort(),
				availableIds,
				testIdsType: ci.parameters?.find(parameter => parameter.name === 'VSCODE_TEST_IDS')?.type,
				ciTestIds: (compile?.parameters as Record<string, string> | undefined)?.VSCODE_TEST_IDS,
				defaultTestIds: [compileTemplate, setup, readTemplate(testFile)].map(template => template.parameters?.find(parameter => parameter.name === 'VSCODE_TEST_IDS')?.default),
				forwardedTestIds: compileSteps.map(step => (step.parameters as Record<string, string>).VSCODE_TEST_IDS),
				selectedIds: selectedIds.map(({ selectedId }) => selectedId).sort(),
				selectionsMatchTests: selectedIds.every(({ selectedId, testId }) => selectedId === testId),
				agentHostSmokeFollowsTest: records(compileTemplate).some(record => Object.keys(record).some(key =>
					key.includes('containsValue(parameters.VSCODE_TEST_IDS, \'smoke-electron\')')
					&& key.includes('eq(length(parameters.VSCODE_TEST_IDS), 0)')
					&& key.includes('ne(parameters.VSCODE_CIBUILD, true)'))),
				copilotSetup: Object.keys(setup.steps.find(step => records(step).some(record => record.template === '../../copilot/pull-test-cache.yml@self')) ?? {}),
				copilotTests: Object.keys(steps.find(step => records(step).some(record => record.template === '../../copilot/test-integration-steps.yml@self')) ?? {}),
				remoteNode: Object.keys(steps.find(step => records(step).some(record => record.displayName === 'Download Node.js')) ?? {}),
				productTestJob: { job: productTestJob?.job, dependsOn: productTestJob?.dependsOn, displayName: productTestJob?.displayName },
				// The product build runs the same test jobs as CI
				productJobsMatchCI: productJobsByPipeline.every(pipeline => JSON.stringify(pipeline.jobs) === JSON.stringify(jobs.map(job => ({ arch: pipeline.jobs[0]?.arch, ...job })))),
				productJobsByPipeline: productJobsByPipeline.map(pipeline => ({ runTests: pipeline.runTests, arches: [...new Set(pipeline.jobs.map(job => job.arch))] })),
				// Tests are only selected by test ID
				testEnvironmentParameters: [compileTemplate, setup, readTemplate(testFile)].flatMap(template => template.parameters ?? [])
					.map(parameter => parameter.name).filter(name => /^VSCODE_RUN_\w+_TESTS$/.test(name)),
			};
		});
		const jobDisplayNames = ['Unit Tests', 'Browser & Remote Tests', 'Integration Tests (Electron)', 'Smoke Tests (Electron)'];
		const copilotCondition = '${{ if containsValue(parameters.VSCODE_TEST_IDS, \'copilot\') }}';
		const remoteNodeCondition = '${{ if or(containsValue(parameters.VSCODE_TEST_IDS, \'integration-remote\'), containsValue(parameters.VSCODE_TEST_IDS, \'smoke-remote\')) }}';
		const runTests = '${{ eq(parameters.VSCODE_STEP_ON_IT, false) }}';
		assert.deepStrictEqual(observed, [
			{
				platform: 'linux',
				jobName: 'Linux${{ parameters.VSCODE_JOB_NAME }}',
				jobDisplayName: '${{ parameters.VSCODE_JOB_DISPLAY_NAME }}',
				jobDisplayNames,
				sameJobsInEachPipeline: true,
				validJobNames: true,
				assignedIds: observed[0].availableIds,
				availableIds: observed[0].availableIds,
				testIdsType: 'object',
				ciTestIds: '${{ parameters.VSCODE_TEST_IDS }}',
				defaultTestIds: [[], [], []],
				forwardedTestIds: ['${{ parameters.VSCODE_TEST_IDS }}', '${{ parameters.VSCODE_TEST_IDS }}'],
				selectedIds: observed[0].availableIds,
				selectionsMatchTests: true,
				agentHostSmokeFollowsTest: true,
				copilotSetup: [copilotCondition],
				copilotTests: [copilotCondition],
				remoteNode: [remoteNodeCondition],
				productTestJob: {
					job: 'Linux_${{ parameters.VSCODE_ARCH }}_Test_${{ parameters.VSCODE_JOB_NAME }}',
					dependsOn: 'Linux_${{ parameters.VSCODE_ARCH }}_Compile',
					displayName: 'Linux (${{ upper(parameters.VSCODE_ARCH) }}) - ${{ parameters.VSCODE_JOB_DISPLAY_NAME }}',
				},
				productJobsMatchCI: true,
				// Only Linux x64 runs tests, not arm64 or armhf
				productJobsByPipeline: [0, 1].map(() => ({ runTests: [runTests, undefined, undefined], arches: ['x64'] })),
				testEnvironmentParameters: [],
			},
			{
				platform: 'darwin',
				jobName: 'macOS${{ parameters.VSCODE_JOB_NAME }}',
				jobDisplayName: '${{ parameters.VSCODE_JOB_DISPLAY_NAME }}',
				jobDisplayNames,
				sameJobsInEachPipeline: true,
				validJobNames: true,
				assignedIds: observed[1].availableIds,
				availableIds: observed[1].availableIds,
				testIdsType: 'object',
				ciTestIds: '${{ parameters.VSCODE_TEST_IDS }}',
				defaultTestIds: [[], [], []],
				forwardedTestIds: ['${{ parameters.VSCODE_TEST_IDS }}', '${{ parameters.VSCODE_TEST_IDS }}'],
				selectedIds: observed[1].availableIds,
				selectionsMatchTests: true,
				agentHostSmokeFollowsTest: true,
				copilotSetup: [copilotCondition],
				copilotTests: [copilotCondition],
				remoteNode: [remoteNodeCondition],
				productTestJob: {
					job: 'macOS_${{ parameters.VSCODE_ARCH }}_Test_${{ parameters.VSCODE_JOB_NAME }}',
					dependsOn: 'macOS_${{ parameters.VSCODE_ARCH }}_Compile',
					displayName: 'macOS (${{ upper(parameters.VSCODE_ARCH) }}) - ${{ parameters.VSCODE_JOB_DISPLAY_NAME }}',
				},
				productJobsMatchCI: true,
				// Only macOS arm64 runs tests, not x64
				productJobsByPipeline: [0, 1].map(() => ({ runTests: [undefined, runTests], arches: ['arm64'] })),
				testEnvironmentParameters: [],
			},
		]);
	});

	test('Linux and macOS CI stage labels include the architecture', () => {
		const pipelineFiles = ['product-build.yml', 'product-build-ado-ci.yml', 'product-build-template.yml'];
		assert.deepStrictEqual(pipelineFiles.map(file => ({
			file,
			stages: records(readTemplate(file))
				.filter(record => record.stage === 'Linux' || record.stage === 'macOS')
				.map(record => ({ stage: record.stage, displayName: record.displayName })),
		})), pipelineFiles.map(file => ({
			file,
			stages: [
				{ stage: 'Linux', displayName: 'Linux X64' },
				{ stage: 'macOS', displayName: 'macOS ARM64' },
			],
		})));
	});

	test('macOS CI includes only the ARM64 CLI job', () => {
		const pipelineFiles = ['product-build.yml', 'product-build-ado-ci.yml', 'product-build-template.yml'];
		const observed = pipelineFiles.map(file => {
			const stage = records(readTemplate(file)).find(record => record.stage === 'macOS');
			if (!Array.isArray(stage?.jobs)) {
				throw new Error(`Missing macOS CI jobs in ${file}`);
			}
			return {
				file,
				cliJobs: (stage.jobs as Record<string, unknown>[]).flatMap(job => Object.entries(job)
					.filter(([key]) => key.startsWith('${{ if '))
					.flatMap(([when, branch]) => records(branch)
						.filter(record => typeof record.template === 'string' && record.template.endsWith('darwin/product-build-darwin-cli.yml@self'))
						.map(record => {
							const parameters = record.parameters as { VSCODE_ARCH: string; VSCODE_CHECK_ONLY: boolean | string };
							return { when, arch: parameters.VSCODE_ARCH, checkOnly: parameters.VSCODE_CHECK_ONLY };
						}))),
			};
		});
		assert.deepStrictEqual(observed, pipelineFiles.map(file => {
			const checkOnly = file === 'product-build-ado-ci.yml' ? true : '${{ variables.VSCODE_CIBUILD }}';
			return {
				file,
				cliJobs: [
					{ when: '${{ if eq(parameters.VSCODE_BUILD_MACOS_ARM64, true) }}', arch: 'arm64', checkOnly },
				],
			};
		}));
	});

	test('flaky-smoke builds keep the packaged Agent Host check without running product test steps', () => {
		const platforms = ['win32', 'linux', 'darwin'] as const;
		const observed = platforms.map(platform => {
			const flaky = readTemplate(`${platform}/product-smoke-flaky-${platform}.yml`);
			const compileCall = records(flaky).find(record => record.template === `./steps/product-build-${platform}-compile.yml@self`);
			const compileParameters = compileCall?.parameters as Record<string, unknown> | undefined;
			const compile = readTemplate(`${platform}/steps/product-build-${platform}-compile.yml`);
			const packagedHostGuards = records(compile.steps).flatMap(record => Object.entries(record)
				.filter(([key, branch]) => key.includes('containsValue(parameters.VSCODE_TEST_IDS, \'smoke-electron\')')
					&& records(branch).some(step => step.displayName === '🧪 Smoke test packaged Agent Host'))
				.map(([key]) => key));
			const productTestGuards = compile.steps.flatMap(step => Object.entries(step)
				.filter(([, branch]) => records(branch).some(record => record.template === `product-build-${platform}-test.yml@self`))
				.map(([key]) => key));
			return {
				platform,
				ciBuild: compileParameters?.VSCODE_CIBUILD,
				noProductTestSelection: ['VSCODE_TEST_IDS'].every(name => !Object.hasOwn(compileParameters ?? {}, name)),
				defaultTestIds: compile.parameters?.find(parameter => parameter.name === 'VSCODE_TEST_IDS')?.default,
				packagedHostGuards,
				productTestGuards,
				repeatedTestJobs: records(flaky).filter(record => record.template === '../common/product-smoke-flaky-test.yml@self').length,
			};
		});
		assert.deepStrictEqual(observed, platforms.map(platform => ({
			platform,
			ciBuild: true,
			noProductTestSelection: true,
			defaultTestIds: [],
			packagedHostGuards: [`\${{ if and(eq(parameters.VSCODE_ARCH, '${platform === 'darwin' ? 'arm64' : 'x64'}'), or(ne(parameters.VSCODE_CIBUILD, true), eq(length(parameters.VSCODE_TEST_IDS), 0), containsValue(parameters.VSCODE_TEST_IDS, 'smoke-electron'))) }}`],
			productTestGuards: ['${{ if gt(length(parameters.VSCODE_TEST_IDS), 0) }}'],
			repeatedTestJobs: 3,
		})));
	});

	test('the Linux policy fixture is skipped with the Electron smoke test', () => {
		const smoke = readTemplate(linuxTestFile).steps.flatMap(step =>
			Object.entries(step)
				.filter(([key]) => key === '${{ if containsValue(parameters.VSCODE_TEST_IDS, \'smoke-electron\') }}')
				.flatMap(([, branch]) => branch as ScriptStep[])
		);
		assert.deepStrictEqual(smoke.filter(step => step.displayName?.includes('native policy smoke fixture')).map(step => ({
			displayName: step.displayName,
			condition: step.condition,
		})), [{
			displayName: 'Set up native policy smoke fixture',
			condition: 'and(succeeded(), ne(variables[\'TEST_CHECKPOINT_SMOKE_ELECTRON_HIT\'], \'true\'))',
		}, {
			displayName: 'Clean up native policy smoke fixture',
			condition: 'and(always(), eq(variables[\'policyFixture.created\'], \'true\'))',
		}]);
	});

	test('macOS Squid setup runs with either PAC proxy smoke test', () => {
		const steps = readTemplate(darwinTestFile).steps;
		const squid = steps.find(step => records(step).some(record => record.displayName === 'Install Squid for network-isolated smoke tests'));
		assert.deepStrictEqual({
			setup: Object.keys(squid ?? {}),
			tests: steps.flatMap(step => Object.entries(step)
				.filter(([key]) => key.includes('containsValue(parameters.VSCODE_TEST_IDS, \'smoke-agents-'))
				.flatMap(([, branch]) => calls(branch).map(call => call.testId))),
		}, {
			setup: ['${{ if or(containsValue(parameters.VSCODE_TEST_IDS, \'smoke-agents-pac-proxy\'), containsValue(parameters.VSCODE_TEST_IDS, \'smoke-agents-kerberos-pac-proxy\')) }}'],
			tests: ['smoke-agents-pac-proxy', 'smoke-agents-kerberos-pac-proxy'],
		});
	});

	test('the WSL Dev Container setup is skipped together with the Electron smoke tests', () => {
		const smoke = readTemplate(windowsTestFile).steps.flatMap(step =>
			Object.entries(step)
				.filter(([key]) => key === '${{ if containsValue(parameters.VSCODE_TEST_IDS, \'smoke-electron\') }}')
				.flatMap(([, branch]) => branch as ScriptStep[])
		);
		const wsl = smoke.flatMap(step => (step['${{ if eq(parameters.VSCODE_ARCH, \'x64\') }}'] ?? []) as ScriptStep[]);
		const gated = 'and(succeeded(), ne(variables[\'TEST_CHECKPOINT_SMOKE_ELECTRON_HIT\'], \'true\'))';
		assert.deepStrictEqual(wsl.map(step => ({ displayName: step.displayName, condition: step.condition })), [
			{ displayName: 'Set WSL kernel cache day', condition: gated },
			{ displayName: 'Restore WSL kernel installer cache', condition: gated },
			{ displayName: 'Prepare WSL Dev Container smoke tests', condition: gated },
			{ displayName: 'Clean up WSL Dev Container smoke tests', condition: 'and(always(), ne(variables[\'WSL_SMOKE_ROOT\'], \'\'))' },
		]);
	});
});
