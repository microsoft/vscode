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
	parameters?: { name: string; type: string; default?: boolean; values?: string[] }[];
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
			{ file: darwinTestFile, os: 'darwin' as const, expected: darwinExpected, agentOS: 'Darwin', arch: 'arm64', target: 'darwin-arm64', stage: 'macOS', job: 'macOS_arm64_Test' },
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

	test('the Linux policy fixture is skipped with the Electron smoke test', () => {
		const electron = readTemplate(linuxTestFile).steps.flatMap(step => (step['${{ if eq(parameters.VSCODE_RUN_ELECTRON_TESTS, true) }}'] ?? []) as ScriptStep[]);
		assert.deepStrictEqual(electron.filter(step => step.displayName?.includes('native policy smoke fixture')).map(step => ({
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

	test('the WSL Dev Container setup is skipped together with the Electron smoke tests', () => {
		const electron = readTemplate(windowsTestFile).steps.flatMap(step => (step['${{ if eq(parameters.VSCODE_RUN_ELECTRON_TESTS, true) }}'] ?? []) as ScriptStep[]);
		const wsl = electron.flatMap(step => (step['${{ if eq(parameters.VSCODE_ARCH, \'x64\') }}'] ?? []) as ScriptStep[]);
		const gated = 'and(succeeded(), ne(variables[\'TEST_CHECKPOINT_SMOKE_ELECTRON_HIT\'], \'true\'))';
		assert.deepStrictEqual(wsl.map(step => ({ displayName: step.displayName, condition: step.condition })), [
			{ displayName: 'Set WSL kernel cache day', condition: gated },
			{ displayName: 'Restore WSL kernel installer cache', condition: gated },
			{ displayName: 'Prepare WSL Dev Container smoke tests', condition: gated },
			{ displayName: 'Clean up WSL Dev Container smoke tests', condition: 'and(always(), ne(variables[\'WSL_SMOKE_ROOT\'], \'\'))' },
		]);
	});
});
