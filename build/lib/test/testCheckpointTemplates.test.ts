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
import { testCheckpoint } from '../../azure-pipelines/common/testCheckpoint.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const pipelineRoot = path.join(repositoryRoot, 'build/azure-pipelines');
const reuse = '${{ parameters.VSCODE_SKIP_SUCCESSFUL_TEST_TASKS }}';
const powershell = process.platform === 'win32' ? 'powershell' : 'pwsh';
const hasPowerShell = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']).status === 0;
const platforms = [
	{ id: 'linux', os: 'Linux', arch: 'x64', browser: 'chromium' },
	{ id: 'win32', os: 'Windows_NT', arch: 'x64', browser: 'firefox' },
	{ id: 'darwin', os: 'Darwin', arch: 'arm64', browser: 'webkit' },
];

interface ScriptStep {
	[key: string]: unknown;
	script?: string;
	powershell?: string;
	condition?: string;
	displayName?: string;
}

interface CheckpointParameters {
	enabled: string;
	testId: string;
	testStep: ScriptStep;
}

function readTemplate(file: string) {
	return load(readFileSync(path.join(pipelineRoot, file), 'utf8')) as {
		parameters: { name: string; type: string; default?: boolean; values?: string[] }[];
		steps: ScriptStep[];
	};
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

function calls(file: string): CheckpointParameters[] {
	return records(readTemplate(file)).filter(record =>
		typeof record.template === 'string' && record.template.endsWith('/run-test-with-checkpoint.yml@self')
	).map(record => record.parameters as CheckpointParameters);
}

const wrapper = readTemplate('common/run-test-with-checkpoint.yml');
const enabledSteps = wrapper.steps[1]['${{ else }}'] as ScriptStep[];
const pairs = enabledSteps[0]['${{ each pair in parameters.testStep }}'] as Record<string, ScriptStep>;

function wrapScript(step: ScriptStep, testId: string): string {
	const shell = step.powershell !== undefined ? 'powershell' : 'script';
	const key = shell === 'script' ? '${{ if eq(pair.key, \'script\') }}' : '${{ elseif eq(pair.key, \'powershell\') }}';
	const script = pairs[key][shell];
	assert.ok(script && step[shell]);
	return script.replace('${{ pair.value }}', () => step[shell]!)
		.replaceAll('${{ parameters.testId }}', testId)
		.replaceAll('$(Build.SourcesDirectory)', repositoryRoot);
}

suite('Product test checkpoint templates', () => {
	test('every caller supplies the required flag and only entry points choose its value', () => {
		const flag = 'VSCODE_SKIP_SUCCESSFUL_TEST_TASKS';
		const entryPoints = new Set(['product-build.yml', 'product-build-ado-ci.yml', 'product-build-TSA.yml', 'product-smoke-flaky.yml']);
		const templates = new Map(globSync('**/*.yml', { cwd: pipelineRoot }).map(file => [
			path.resolve(pipelineRoot, file), readTemplate(file),
		]));
		const required = new Map<string, string>();
		for (const [file, template] of templates) {
			const alias = ['restore-test-checkpoints.yml', 'run-test-with-checkpoint.yml'].includes(path.basename(file));
			const parameter = template.parameters?.find(parameter => parameter.name === (alias ? 'enabled' : flag));
			if (!parameter) {
				continue;
			}
			assert.equal(parameter.type, 'boolean', file);
			if (file === path.join(pipelineRoot, 'product-build.yml')) {
				assert.equal(parameter.default, true);
			} else {
				assert.equal(Object.hasOwn(parameter, 'default'), false, `Unexpected template default: ${file}`);
			}
			required.set(file, parameter.name);
		}
		const referenced = new Set<string>();
		for (const [file, template] of templates) {
			for (const call of records(template)) {
				if (typeof call.template !== 'string' || (call.template.includes('@') && !call.template.endsWith('@self'))) {
					continue;
				}
				const reference = call.template.replace(/@self$/, '');
				const target = path.resolve(reference.startsWith('build/') ? repositoryRoot : path.dirname(file), reference);
				const parameter = required.get(target);
				if (!parameter) {
					continue;
				}
				const args = call.parameters as Record<string, unknown> | undefined;
				const label = `${path.relative(pipelineRoot, file)} -> ${reference}`;
				assert.ok(args && Object.hasOwn(args, parameter), `Missing ${parameter}: ${label}`);
				referenced.add(target);
				if (!entryPoints.has(path.basename(file))) {
					assert.equal(args[parameter], reuse, `Template must forward without overriding: ${label}`);
					assert.ok(template.parameters.some(parameter => parameter.name === flag), label);
				} else if (path.basename(file) === 'product-build.yml') {
					const disabled = target.endsWith('-ci.yml')
						|| (path.basename(target) === 'product-build-linux.yml' && args.VSCODE_ARCH !== 'x64');
					assert.equal(args[parameter], disabled ? false : reuse, label);
				} else {
					assert.equal(args[parameter], false, `Non-product entry point must preserve existing behavior: ${label}`);
				}
			}
		}
		assert.deepStrictEqual([...required.keys()].filter(file => file !== path.join(pipelineRoot, 'product-build.yml') && !referenced.has(file)), []);
	});

	test('disabled wrapper inserts the original task and enabled wrapper preserves metadata', () => {
		assert.deepStrictEqual({
			enabledParameter: wrapper.parameters.find(parameter => parameter.name === 'enabled'),
			disabledSteps: wrapper.steps[0]['${{ if eq(parameters.enabled, false) }}'],
			copiedMetadata: pairs['${{ elseif ne(pair.key, \'condition\') }}'],
			condition: enabledSteps[0].condition,
			publisher: enabledSteps[1],
		}, {
			enabledParameter: { name: 'enabled', type: 'boolean' },
			disabledSteps: ['${{ parameters.testStep }}'],
			copiedMetadata: { '${{ pair.key }}': '${{ pair.value }}' },
			condition: 'and(${{ coalesce(parameters.testStep.condition, \'succeeded()\') }}, ne(variables[\'TEST_CHECKPOINT_${{ upper(replace(parameters.testId, \'-\', \'_\')) }}_HIT\'], \'true\'))',
			publisher: { template: './publish-test-checkpoint.yml@self', parameters: { testId: '${{ parameters.testId }}' } },
		});
	});

	test('restore requires explicit enablement and never resets an already initialized job', () => {
		const restore = readTemplate('common/restore-test-checkpoints.yml');
		assert.deepStrictEqual({
			enabled: restore.parameters.find(parameter => parameter.name === 'enabled'),
			steps: restore.steps,
		}, {
			enabled: { name: 'enabled', type: 'boolean' },
			steps: [{
				'${{ if eq(parameters.enabled, true) }}': [{
					script: 'node "$(Build.SourcesDirectory)/build/azure-pipelines/common/testCheckpoint.ts" restore',
					env: { SYSTEM_ACCESSTOKEN: '$(System.AccessToken)' },
					condition: 'and(succeeded(), ne(variables[\'TEST_CHECKPOINTS_RESTORED\'], \'true\'))',
					displayName: 'Restore test checkpoints',
					timeoutInMinutes: 3,
				}],
			}],
		});
	});

	for (const platform of platforms) {
		test(`${platform.id}: missing outputs cannot fail a fully checkpointed retry`, () => {
			const enabled = '${{ if eq(parameters.VSCODE_SKIP_SUCCESSFUL_TEST_TASKS, true) }}';
			const steps = readTemplate(`${platform.id}/steps/product-build-${platform.id}-test.yml`).steps;
			const index = steps.findIndex(step => step.task === 'PublishTestResults@2');
			assert.ok(index > 0);
			const collectors = steps[index - 1][enabled] as ScriptStep[];
			assert.deepStrictEqual(collectors, [{
				[platform.id === 'win32' ? 'powershell' : 'script']: 'node build/azure-pipelines/common/testCheckpoint.ts collect-results',
				displayName: 'Check test output availability',
				condition: 'succeededOrFailed()',
			}]);
			assert.deepStrictEqual({
				enabled: steps[index][enabled],
				disabled: steps[index]['${{ else }}'],
			}, {
				enabled: { condition: 'and(succeededOrFailed(), eq(variables[\'TEST_CHECKPOINT_RESULTS_AVAILABLE\'], \'true\'))' },
				disabled: { condition: 'succeededOrFailed()' },
			});
			const outputs = records(readTemplate(`${platform.id}/product-build-${platform.id}.yml`));
			for (const [title, flag, condition] of [
				['Publish Log Files', 'LOGS', 'succeededOrFailed()'],
				['Publish Crash Reports', 'CRASHES', 'failed()'],
			]) {
				const output = outputs.find(output => output.displayName === title);
				assert.deepStrictEqual({
					enabled: output?.[enabled],
					disabled: output?.['${{ else }}'],
				}, {
					enabled: { condition: `and(${condition}, eq(variables['TEST_CHECKPOINT_${flag}_AVAILABLE'], 'true'))` },
					disabled: { condition },
				});
			}
		});

		test(`${platform.id}: every integration/smoke task is registered, independently published and gated`, async t => {
			const testFile = `${platform.id}/steps/product-build-${platform.id}-test.yml`;
			const compileFile = `${platform.id}/steps/product-build-${platform.id}-compile.yml`;
			const platformCalls = calls(testFile);
			const compileCalls = calls(compileFile);
			const copilot = readTemplate('copilot/test-integration-steps.yml');
			const copilotGroups = copilot.steps.filter(step => Object.hasOwn(step, `\${{ if eq(parameters.OS, '${platform.id}') }}`));
			const copilotCalls = copilotGroups.flatMap(records).filter(record => typeof record.template === 'string')
				.map(record => record.parameters as CheckpointParameters);
			const expected = [
				'integration-electron', `integration-browser-${platform.browser}`, 'integration-remote',
				'smoke-electron',
				...(platform.id === 'darwin' ? ['smoke-agents-pac', 'smoke-agents-pac-kerberos'] : []),
				'smoke-browser-chromium', 'smoke-remote',
				'smoke-packaged-agent-host', 'copilot-extension', 'copilot-completions-core', 'copilot-sanity',
			];
			const allCalls = [...platformCalls, ...compileCalls, ...copilotCalls];
			assert.deepStrictEqual(allCalls.map(call => [call.testId, call.enabled]), expected.map(id => [id, reuse]));
			assert.equal(new Set(expected).size, expected.length);
			const publishedIds = readTemplate('common/publish-test-checkpoint.yml').parameters.find(parameter => parameter.name === 'testId')?.values;
			assert.ok(publishedIds && expected.every(id => publishedIds.includes(id)));

			const temp = mkdtempSync(path.join(os.tmpdir(), 'checkpoint-inventory-'));
			t.after(() => rmSync(temp, { recursive: true, force: true }));
			const env: NodeJS.ProcessEnv = {
				AGENT_OS: platform.os, VSCODE_ARCH: platform.arch, BUILD_BUILDID: '123',
				SYSTEM_STAGENAME: 'Tests', SYSTEM_JOBNAME: 'Tests', SYSTEM_JOBATTEMPT: '1', SYSTEM_STAGEATTEMPT: '1',
				BUILD_SOURCEVERSION: 'source', AGENT_TEMPDIRECTORY: temp,
				SYSTEM_COLLECTIONURI: 'https://dev.azure.com/organization/', SYSTEM_TEAMPROJECTID: 'project', SYSTEM_ACCESSTOKEN: 'test-token',
			};
			const artifacts: { name: string; resource: { type: string } }[] = [];
			for (const id of expected) {
				const messages: string[] = [];
				await testCheckpoint(['record', id], env, fetch, message => messages.push(message));
				assert.ok(messages.some(message => message.endsWith('_READY]true')), id);
				const artifact = messages.find(message => message.includes('_ARTIFACT]'))?.split(']')[1];
				assert.ok(artifact);
				artifacts.push({ name: artifact, resource: { type: 'PipelineArtifact' } });
			}
			const restored: string[] = [];
			await testCheckpoint(['restore'], { ...env, SYSTEM_JOBATTEMPT: '2' }, async () => Response.json({ value: artifacts }), message => restored.push(message));
			assert.deepStrictEqual(restored.filter(message => message.endsWith('_HIT]true')).sort(), expected.map(id =>
				`##vso[task.setvariable variable=TEST_CHECKPOINT_${id.replaceAll('-', '_').toUpperCase()}_HIT]true`
			).sort());

			const steps = readTemplate(testFile).steps;
			const restoreIndex = steps.findIndex(step => step.template === '../../common/restore-test-checkpoints.yml@self');
			assert.ok(restoreIndex >= 0 && restoreIndex < steps.findIndex(step => Object.hasOwn(step, '${{ if eq(parameters.VSCODE_RUN_ELECTRON_TESTS, true) }}')));
			assert.deepStrictEqual(steps[restoreIndex].parameters, { enabled: reuse });
			const compileGroup = records(readTemplate(compileFile)).find(record =>
				Array.isArray(record[`\${{ if eq(parameters.VSCODE_ARCH, '${platform.arch}') }}`])
				&& records(record).some(child => child.template === '../../common/run-test-with-checkpoint.yml@self')
			);
			assert.ok(compileGroup);
			const compileSteps = compileGroup[`\${{ if eq(parameters.VSCODE_ARCH, '${platform.arch}') }}`] as ScriptStep[];
			assert.deepStrictEqual(compileSteps.slice(0, 2).map(step => step.template), [
				'../../common/restore-test-checkpoints.yml@self', '../../common/run-test-with-checkpoint.yml@self',
			]);
			const nestedCopilot = records(steps).find(step => step.template === '../../copilot/test-integration-steps.yml@self');
			assert.deepStrictEqual(nestedCopilot?.parameters, { OS: platform.id, VSCODE_SKIP_SUCCESSFUL_TEST_TASKS: reuse });
		});

		const windows = platform.id === 'win32';
		const skip = windows ? (!hasPowerShell && 'PowerShell is not available') : (process.platform === 'win32' && 'Requires bash');
		test(`${platform.id}: all wrapped integration and smoke scripts retain valid shell syntax`, { skip }, () => {
			const copilot = readTemplate('copilot/test-integration-steps.yml').steps
				.filter(step => Object.hasOwn(step, `\${{ if eq(parameters.OS, '${platform.id}') }}`))
				.flatMap(records).filter(record => typeof record.template === 'string')
				.map(record => record.parameters as CheckpointParameters);
			const scripts = [
				...calls(`${platform.id}/steps/product-build-${platform.id}-test.yml`),
				...calls(`${platform.id}/steps/product-build-${platform.id}-compile.yml`),
				...copilot,
			].map(call => ({ id: call.testId, script: wrapScript(call.testStep, call.testId) }));
			if (windows) {
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
			} else {
				for (const { id, script } of scripts) {
					const result = spawnSync('bash', ['-n'], { input: script, encoding: 'utf8' });
					assert.deepStrictEqual({ status: result.status, stderr: result.stderr }, { status: 0, stderr: '' }, id);
				}
			}
		});

		test(`${platform.id}: wrapper records success only after a successful test, including nested working directories`, { skip }, t => {
			const directory = mkdtempSync(path.join(os.tmpdir(), 'checkpoint-wrapper-'));
			t.after(() => rmSync(directory, { recursive: true, force: true }));
			const workingDirectory = path.join(directory, 'nested working directory');
			mkdirSync(workingDirectory);
			const quotePowerShell = (value: string) => `'${value.replaceAll('\'', '\'\'')}'`;
			const results = [17, 0].map(exitCode => {
				const original = windows
					? `& ${quotePowerShell(process.execPath)} -e "process.exit(${exitCode})"`
					: `"${process.execPath}" -e "process.exit(${exitCode})"`;
				const script = wrapScript(windows ? { powershell: original } : { script: original }, 'copilot-extension');
				const result = spawnSync(windows ? powershell : 'bash', windows ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script] : ['-c', script], {
					cwd: workingDirectory,
					env: {
						...process.env, AGENT_OS: platform.os, VSCODE_ARCH: platform.arch, BUILD_BUILDID: '123',
						SYSTEM_STAGENAME: 'Tests', SYSTEM_JOBNAME: 'Tests', SYSTEM_JOBATTEMPT: '1', SYSTEM_STAGEATTEMPT: '1',
						BUILD_SOURCEVERSION: 'source', AGENT_TEMPDIRECTORY: directory,
					},
					encoding: 'utf8',
				});
				assert.ifError(result.error);
				return {
					status: result.status,
					stderr: windows && exitCode !== 0 ? result.stderr.includes('exit code 17') : result.stderr,
					ready: result.stdout.includes('_READY]true'),
					present: existsSync(path.join(directory, 'test-checkpoints/123/Tests/Tests/1/1/copilot-extension/test-checkpoint.json')),
				};
			});
			assert.deepStrictEqual(results, [
				{ status: windows ? 1 : 17, stderr: windows ? true : '', ready: false, present: false },
				{ status: 0, stderr: '', ready: true, present: true },
			]);
		});
	}
});
