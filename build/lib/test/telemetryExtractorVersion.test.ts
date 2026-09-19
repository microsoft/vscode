/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import fs from 'fs';
import { load } from 'js-yaml';
import { suite, test } from 'node:test';
import os from 'os';
import path from 'path';
import vm from 'vm';

const repositoryRoot = path.join(import.meta.dirname, '../../..');

interface IStep {
	name?: string;
	displayName?: string;
	run?: string;
	script?: string;
	'working-directory'?: string;
	with?: Record<string, string>;
	env?: Record<string, string>;
}

interface IWorkflow {
	jobs: Record<string, { steps: IStep[] }>;
}

interface IProductPipeline {
	jobs: { steps: IStep[] }[];
}

function getWorkflowSteps(file: string, job: string): IStep[] {
	const workflow = load(fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', file), 'utf8')) as IWorkflow;
	return workflow.jobs[job].steps;
}

suite('telemetry extractor version consistency', () => {
	for (const { file, job, stepName, lockfile, command } of [
		{
			file: 'telemetry.yml', job: 'check-metadata', stepName: 'Install telemetry extractor', lockfile: './package-lock.json',
			command: 'npm install --prefix "$RUNNER_TEMP/telemetry-extractor" --no-save --no-package-lock --no-audit --no-fund "@vscode/telemetry-extractor@$version"',
		},
		{
			file: 'pr.yml', job: 'copilot-check-telemetry', stepName: 'Validate telemetry events', lockfile: '../../package-lock.json',
			command: 'npx --package="@vscode/telemetry-extractor@$version" --yes vscode-telemetry-extractor -s . > /dev/null',
		},
	]) {
		test(`${job} follows the root lockfile rather than an independent version pin`, t => {
			const step = getWorkflowSteps(file, job).find(step => step.name === stepName);
			assert.ok(step?.run);
			const expression = step.run.match(/version=\$\(node -p "(?<expression>[^"]+)"\)/)?.groups?.expression;
			assert.ok(expression);

			const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-version-'));
			t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
			const workingDirectory = path.join(fixture, step['working-directory'] ?? '.');
			fs.mkdirSync(workingDirectory, { recursive: true });
			fs.writeFileSync(path.join(fixture, 'package-lock.json'), JSON.stringify({
				version: '1.0.0',
				packages: {
					'': { devDependencies: { '@vscode/telemetry-extractor': '^99.0.0' } },
					'node_modules/@vscode/telemetry-extractor': { version: '99.0.1-test' },
				},
			}));

			const currentLock = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
			assert.deepStrictEqual({
				expression,
				command: step.run.split('\n').find(line => line.startsWith('npm ') || line.startsWith('npx ')),
				currentVersion: execFileSync(process.execPath, ['-p', expression], {
					cwd: path.join(repositoryRoot, step['working-directory'] ?? '.'),
					encoding: 'utf8',
				}).trim(),
				futureVersion: execFileSync(process.execPath, ['-p', expression], {
					cwd: workingDirectory,
					encoding: 'utf8',
				}).trim(),
			}, {
				expression: `require('${lockfile}').packages['node_modules/@vscode/telemetry-extractor'].version`,
				command,
				currentVersion: currentLock.packages['node_modules/@vscode/telemetry-extractor'].version,
				futureVersion: '99.0.1-test',
			});
		});
	}

	test('the general metadata gate uses the build Node version', () => {
		const steps = getWorkflowSteps('telemetry.yml', 'check-metadata');
		assert.ok(steps.some(step => step.with?.['node-version-file'] === '.nvmrc'));
	});

	test('the general metadata gate uses the official core and extension extraction scopes', () => {
		const step = getWorkflowSteps('telemetry.yml', 'check-metadata').find(step => step.name === 'Run vscode-telemetry-extractor');
		assert.deepStrictEqual({
			command: step?.run,
			extractor: step?.env?.VSCODE_TELEMETRY_EXTRACTOR,
		}, {
			command: 'node build/azure-pipelines/common/extract-telemetry.ts',
			extractor: '${{ runner.temp }}/telemetry-extractor/node_modules/@vscode/telemetry-extractor/out/extractor.js',
		});
	});

	const pipeline = load(fs.readFileSync(path.join(repositoryRoot, 'build', 'azure-pipelines', 'product-copilot.yml'), 'utf8')) as IProductPipeline;
	const extraction = pipeline.jobs[0].steps.find(step => step.displayName === 'Extract telemetry');
	const script = extraction?.script?.match(/node << 'EOF'\n(?<script>[\s\S]*?)\nEOF/)?.groups?.script;
	assert.ok(script);

	function runCopilotExtraction(execFileSync: (command: string, args: string[], options: { stdio: string; shell: boolean }) => void): void {
		vm.runInNewContext(script!, {
			require: (name: string) => {
				switch (name) {
					case './package.json':
						return { publisher: 'publisher', name: 'extension' };
					case '../../package-lock.json':
						return { packages: { 'node_modules/@vscode/telemetry-extractor': { version: '99.0.1-test' } } };
					case 'child_process':
						return { execFileSync };
					default:
						throw new Error(`Unexpected dependency: ${name}`);
				}
			},
		});
	}

	test('the Copilot build uses the locked version and preserves extraction arguments', () => {
		const invocations: { command: string; args: string[]; stdio: string; shell: boolean }[] = [];
		runCopilotExtraction((command, args, options) => {
			invocations.push({ command, args: [...args], stdio: options.stdio, shell: options.shell });
		});
		assert.deepStrictEqual(invocations, [{
			command: 'npx',
			args: [
				'--package=@vscode/telemetry-extractor@99.0.1-test', '--yes', 'vscode-telemetry-extractor',
				'--eventPrefix', 'publisher.extension', '-s', '.', '-o', '.', '-f', 'telemetry',
			],
			stdio: 'inherit',
			shell: true,
		}]);
	});

	test('the Copilot build propagates an extractor validation failure', () => {
		const failure = new Error('Extractor exited with code 1');
		assert.throws(() => runCopilotExtraction(() => { throw failure; }), error => error === failure);
	});

	test('cloud session creation has compatible metadata for success and failure', () => {
		const source = fs.readFileSync(path.join(repositoryRoot, 'extensions/copilot/src/extension/chatSessions/vscode-node/cloudBackendTelemetry.ts'), 'utf8');
		const declarations = [...source.matchAll(/\/\*\s*__GDPR__\s*(?<body>[\s\S]*?)\*\//g)]
			.map(match => JSON.parse(`{${match.groups!.body}}`)['copilotcloud.chat.sessionCreate'] as Record<string, unknown> | undefined)
			.filter((event): event is Record<string, unknown> => !!event);
		assert.strictEqual(declarations.length, 2);
		const [failure, success] = declarations;
		const commonFields = Object.keys(failure).filter(field => Object.hasOwn(success, field));
		assert.deepStrictEqual(
			Object.fromEntries(commonFields.map(field => [field, failure[field]])),
			Object.fromEntries(commonFields.map(field => [field, success[field]])),
		);
	});
});
