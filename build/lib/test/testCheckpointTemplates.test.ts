/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';
import { testCheckpoint, testIds } from '../../azure-pipelines/common/testCheckpoint.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const pipelineRoot = path.join(repositoryRoot, 'build/azure-pipelines');
const testFile = 'win32/steps/product-build-win32-test.yml';
const powershell = process.platform === 'win32' ? 'powershell' : 'pwsh';
const hasPowerShell = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']).status === 0;
const skipPowerShell = !hasPowerShell && 'PowerShell is not available';

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

function copilotCalls(): CheckpointParameters[] {
	const steps = readTemplate('copilot/test-integration-steps.yml').steps;
	return calls(steps.filter(step => Object.hasOwn(step, '${{ if eq(parameters.OS, \'win32\') }}')));
}

function allCalls(): CheckpointParameters[] {
	return [...calls(readTemplate(testFile)), ...copilotCalls()];
}

const wrapper = readTemplate('common/run-test-with-checkpoint.yml');
const pairs = wrapper.steps[0]['${{ each pair in parameters.testStep }}'] as Record<string, ScriptStep>;

function wrapScript(step: ScriptStep, testId: string): string {
	const script = pairs['${{ elseif eq(pair.key, \'powershell\') }}'].powershell;
	assert.ok(script && step.powershell);
	return script.replace('${{ pair.value }}', () => step.powershell!)
		.replaceAll('${{ parameters.testId }}', testId)
		.replaceAll('$(Build.SourcesDirectory)', repositoryRoot);
}

suite('Product test checkpoint templates', () => {
	test('only the Windows test steps use checkpoints', () => {
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
			// Only the win32 branch of the shared Copilot steps records checkpoints
			nonWindowsCopilotCalls: calls(copilot.filter(step => !Object.hasOwn(step, '${{ if eq(parameters.OS, \'win32\') }}'))).length,
		}, {
			users: [
				'common/run-test-with-checkpoint.yml -> publish-test-checkpoint.yml',
				'copilot/test-integration-steps.yml -> run-test-with-checkpoint.yml',
				`${testFile} -> restore-test-checkpoints.yml`,
				`${testFile} -> run-test-with-checkpoint.yml`,
			],
			nonWindowsCopilotCalls: 0,
		});
	});

	test('wrapper preserves the test step and gates it on its checkpoint', () => {
		assert.deepStrictEqual({
			parameters: wrapper.parameters,
			copiedMetadata: pairs['${{ elseif ne(pair.key, \'condition\') }}'],
			condition: wrapper.steps[0].condition,
			publisher: wrapper.steps[1],
		}, {
			parameters: [{ name: 'testId', type: 'string' }, { name: 'testStep', type: 'step' }],
			copiedMetadata: { '${{ pair.key }}': '${{ pair.value }}' },
			condition: 'and(${{ coalesce(parameters.testStep.condition, \'succeeded()\') }}, ne(variables[\'TEST_CHECKPOINT_${{ upper(replace(parameters.testId, \'-\', \'_\')) }}_HIT\'], \'true\'))',
			publisher: { template: './publish-test-checkpoint.yml@self', parameters: { testId: '${{ parameters.testId }}' } },
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
		const steps = readTemplate(testFile).steps;
		const index = steps.findIndex(step => step.task === 'PublishTestResults@2');
		assert.ok(index > 0);
		assert.deepStrictEqual({
			collector: steps[index - 1],
			condition: steps[index].condition,
		}, {
			collector: {
				powershell: 'node build/azure-pipelines/common/testCheckpoint.ts collect-results',
				displayName: 'Check test output availability',
				condition: 'succeededOrFailed()',
			},
			condition: 'and(succeededOrFailed(), eq(variables[\'TEST_CHECKPOINT_RESULTS_AVAILABLE\'], \'true\'))',
		});
	});

	test('every test task is registered, independently published and gated', async t => {
		const expected = [
			'unit-electron', 'unit-node', 'unit-browser-chromium',
			'integration-electron', 'integration-browser-firefox', 'integration-remote',
			'smoke-electron', 'smoke-browser-chromium', 'smoke-remote',
			'copilot-extension', 'copilot-completions-core', 'copilot-sanity',
		];
		const publishedIds = readTemplate('common/publish-test-checkpoint.yml').parameters?.find(parameter => parameter.name === 'testId')?.values;
		const steps = readTemplate(testFile).steps;
		assert.deepStrictEqual({
			calls: allCalls().map(call => call.testId),
			publishedIds,
			scriptIds: [...testIds],
			firstStep: steps[0],
			restores: records([...steps, ...readTemplate('copilot/test-integration-steps.yml').steps]).filter(step => step.template?.toString().endsWith('/restore-test-checkpoints.yml@self')).length,
			copilot: records(steps).find(step => step.template === '../../copilot/test-integration-steps.yml@self')?.parameters,
		}, {
			calls: expected,
			publishedIds: expected,
			scriptIds: expected,
			// The checkpoints are restored once, before any other test step.
			firstStep: { template: '../../common/restore-test-checkpoints.yml@self' },
			restores: 1,
			copilot: { OS: 'win32' },
		});

		const temp = mkdtempSync(path.join(os.tmpdir(), 'checkpoint-inventory-'));
		t.after(() => rmSync(temp, { recursive: true, force: true }));
		const env: NodeJS.ProcessEnv = {
			AGENT_OS: 'Windows_NT', VSCODE_ARCH: 'x64', BUILD_BUILDID: '123',
			SYSTEM_STAGENAME: 'Windows', SYSTEM_JOBNAME: 'Windows_x64_Test', SYSTEM_JOBATTEMPT: '1', SYSTEM_STAGEATTEMPT: '1',
			BUILD_SOURCEVERSION: 'source', AGENT_TEMPDIRECTORY: temp,
			SYSTEM_COLLECTIONURI: 'https://dev.azure.com/organization/', SYSTEM_TEAMPROJECTID: 'project', SYSTEM_ACCESSTOKEN: 'test-token',
		};
		const artifacts: { name: string; resource: { type: string } }[] = [];
		for (const id of expected) {
			const messages: string[] = [];
			await testCheckpoint(['record', id], env, fetch, message => messages.push(message));
			const artifact = messages.find(message => message.includes('_ARTIFACT]'))?.split(']')[1];
			assert.ok(artifact && messages.some(message => message.endsWith('_READY]true')), id);
			artifacts.push({ name: artifact, resource: { type: 'PipelineArtifact' } });
		}
		const restored: string[] = [];
		await testCheckpoint(['restore'], { ...env, SYSTEM_JOBATTEMPT: '2' }, async () => Response.json({ value: artifacts }), message => restored.push(message));
		assert.deepStrictEqual(restored.filter(message => message.endsWith('_HIT]true')).sort(), expected.map(id =>
			`##vso[task.setvariable variable=TEST_CHECKPOINT_${id.replaceAll('-', '_').toUpperCase()}_HIT]true`
		).sort());
	});

	test('the WSL Dev Container setup is skipped together with the Electron smoke tests', () => {
		const electron = readTemplate(testFile).steps.flatMap(step => (step['${{ if eq(parameters.VSCODE_RUN_ELECTRON_TESTS, true) }}'] ?? []) as ScriptStep[]);
		const wsl = electron.flatMap(step => (step['${{ if eq(parameters.VSCODE_ARCH, \'x64\') }}'] ?? []) as ScriptStep[]);
		const gated = 'and(succeeded(), ne(variables[\'TEST_CHECKPOINT_SMOKE_ELECTRON_HIT\'], \'true\'))';
		assert.deepStrictEqual(wsl.map(step => ({ displayName: step.displayName, condition: step.condition })), [
			{ displayName: 'Set WSL kernel cache day', condition: gated },
			{ displayName: 'Restore WSL kernel installer cache', condition: gated },
			{ displayName: 'Prepare WSL Dev Container smoke tests', condition: gated },
			{ displayName: 'Clean up WSL Dev Container smoke tests', condition: 'and(always(), ne(variables[\'WSL_SMOKE_ROOT\'], \'\'))' },
		]);
	});

	test('all wrapped test scripts retain valid PowerShell syntax', { skip: skipPowerShell }, () => {
		const scripts = allCalls().map(call => ({ id: call.testId, script: wrapScript(call.testStep, call.testId) }));
		const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `
			$ErrorActionPreference = 'Stop'
			foreach ($script in (ConvertFrom-Json $env:CHECKPOINT_SCRIPTS)) {
				$tokens = $null
				$parseErrors = $null
				[System.Management.Automation.Language.Parser]::ParseInput($script.script, [ref]$tokens, [ref]$parseErrors) | Out-Null
				if ($parseErrors.Count) { throw "$($script.id): $parseErrors" }
			}
		`], { env: { ...process.env, CHECKPOINT_SCRIPTS: JSON.stringify(scripts) }, encoding: 'utf8' });
		assert.deepStrictEqual({ status: result.status, stderr: result.stderr }, { status: 0, stderr: '' });
	});

	test('wrapper records success only after a successful test, including nested working directories', { skip: skipPowerShell }, t => {
		const directory = mkdtempSync(path.join(os.tmpdir(), 'checkpoint-wrapper-'));
		t.after(() => rmSync(directory, { recursive: true, force: true }));
		const workingDirectory = path.join(directory, 'nested working directory');
		mkdirSync(workingDirectory);
		const quotePowerShell = (value: string) => `'${value.replaceAll('\'', '\'\'')}'`;
		const results = [17, 0].map(exitCode => {
			const script = wrapScript({ powershell: `& ${quotePowerShell(process.execPath)} -e "process.exit(${exitCode})"` }, 'copilot-extension');
			const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
				cwd: workingDirectory,
				env: {
					...process.env, AGENT_OS: 'Windows_NT', VSCODE_ARCH: 'x64', BUILD_BUILDID: '123',
					SYSTEM_STAGENAME: 'Windows', SYSTEM_JOBNAME: 'Windows_x64_Test', SYSTEM_JOBATTEMPT: '1', SYSTEM_STAGEATTEMPT: '1',
					BUILD_SOURCEVERSION: 'source', AGENT_TEMPDIRECTORY: directory,
				},
				encoding: 'utf8',
			});
			assert.ifError(result.error);
			return {
				status: result.status,
				stderr: exitCode !== 0 ? result.stderr.includes('exit code 17') : result.stderr,
				ready: result.stdout.includes('_READY]true'),
				present: existsSync(path.join(directory, 'test-checkpoints/123/Windows/Windows_x64_Test/1/1/copilot-extension/test-checkpoint.json')),
			};
		});
		assert.deepStrictEqual(results, [
			{ status: 1, stderr: true, ready: false, present: false },
			{ status: 0, stderr: '', ready: true, present: true },
		]);
	});
});
