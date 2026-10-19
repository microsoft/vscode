/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';
import { cacheWarmingJobs, detectMissingCaches, getCacheKeys, type ICacheWarmingJob } from '../../../.github/actions/detect-missing-caches/detect.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

interface IStep {
	readonly uses?: string;
	readonly run?: string;
	readonly with?: Record<string, string>;
}

interface IJob {
	readonly 'runs-on': string | readonly string[];
	readonly needs?: string;
	readonly if?: string;
	readonly env?: Record<string, string>;
	readonly steps: readonly IStep[];
}

function loadYaml<T>(relativePath: string): T {
	return load(readFileSync(path.join(repositoryRoot, relativePath), 'utf8')) as T;
}

function readRepositoryFile(relativePath: string): Buffer {
	return readFileSync(path.join(repositoryRoot, relativePath));
}

/**
 * The runners of the cache warming jobs, as the cache keys see them.
 */
const runners: Record<string, { platform: string; arch: string; os: string; lineEndings: ICacheWarmingJob['lineEndings'] }> = {
	'1ES.Pool=1es-vscode-oss-ubuntu-22.04-x64': { platform: 'linux', arch: 'x64', os: 'Linux', lineEndings: 'lf' },
	'1ES.Pool=1es-vscode-oss-windows-2022-x64': { platform: 'win32', arch: 'x64', os: 'Windows', lineEndings: 'crlf' },
	'macos-26-xlarge': { platform: 'darwin', arch: 'arm64', os: 'macOS', lineEndings: 'lf' },
};

suite('Detect missing caches', () => {
	test('the jobs match pr-node-modules.yml', () => {
		const workflow = loadYaml<{ jobs: Record<string, IJob> }>('.github/workflows/pr-node-modules.yml');
		const jobs: Record<string, ICacheWarmingJob> = {};
		const gates: Record<string, string | undefined> = {};
		for (const [name, job] of Object.entries(workflow.jobs)) {
			if (name === 'caches') {
				continue;
			}
			const runsOn = typeof job['runs-on'] === 'string' ? [job['runs-on']] : job['runs-on'];
			const runner = runners[runsOn.find(label => runners[label]) ?? ''];
			assert.ok(runner, `Unknown runner of ${name}: ${runsOn.join(', ')}`);
			const evaluate = (value: string) => value
				.replaceAll('${{ env.VSCODE_ARCH }}', job.env?.VSCODE_ARCH ?? '')
				.replaceAll('$(node -p process.platform)', runner.platform)
				.replaceAll('$(node -p process.arch)', runner.arch);
			const step = (uses: string) => job.steps.find(step => step.uses === uses);

			const nodeModules = step('./.github/actions/restore-node-modules')?.with;
			const electron = step('./.github/actions/setup-electron')?.with;
			jobs[name] = {
				lineEndings: runner.lineEndings,
				nodeModules: { prefix: nodeModules?.['key-prefix'] ?? '', args: evaluate(nodeModules?.['key-args'] ?? '').split(/\s+/) },
				...electron ? { electron: { os: runner.os, arch: evaluate(electron.arch) } } : {},
				...job.steps.some(step => step.with?.key?.startsWith('builtin-extensions-')) ? { builtInExtensions: { target: `${runner.platform}-${runner.arch}` } } : {},
				...step('./.github/actions/restore-wsl-installer') ? { wslInstaller: true } : {},
			};
			gates[name] = `${job.needs} ${job.if}`;
		}

		assert.deepStrictEqual({ jobs, gates }, {
			jobs: cacheWarmingJobs,
			gates: Object.fromEntries(Object.keys(cacheWarmingJobs).map(name =>
				[name, `caches \${{ !cancelled() && (needs.caches.result != 'success' || needs.caches.outputs.${name} == 'true') }}`])),
		});
	});

	test('the cache keys match the actions that save them', () => {
		// When a key changes, update getCacheKeys in .github/actions/detect-missing-caches/detect.ts to match.
		const steps = (relativePath: string) => loadYaml<{ runs: { steps: IStep[] } }>(relativePath).runs.steps;
		const keyOf = (relativePath: string) => steps(relativePath).find(step => step.with?.key)?.with?.key;
		const commandLines = (steps: readonly IStep[], script: string) => steps.flatMap(step => step.run?.split('\n').filter(line => line.includes(script)).map(line => line.trim()) ?? []);
		const compile = loadYaml<{ jobs: Record<string, IJob> }>('.github/workflows/pr-node-modules.yml').jobs.compile;
		assert.deepStrictEqual({
			nodeModules: [keyOf('.github/actions/restore-node-modules/action.yml'), ...commandLines(steps('.github/actions/restore-node-modules/action.yml'), 'computeNodeModulesCacheKey.ts')],
			electron: keyOf('.github/actions/setup-electron/action.yml'),
			wslInstaller: keyOf('.github/actions/restore-wsl-installer/action.yml'),
			builtInExtensions: [compile.steps.find(step => step.with?.key?.startsWith('builtin-extensions-'))?.with?.key, ...commandLines(compile.steps, 'computeBuiltInDepsCacheKey.ts')],
		}, {
			nodeModules: [
				'${{ inputs.key-prefix }}-${{ hashFiles(\'.build/packagelockhash\') }}',
				'mkdir -p .build && node build/azure-pipelines/common/computeNodeModulesCacheKey.ts ${{ inputs.key-args }} > .build/packagelockhash',
				'node build/azure-pipelines/common/computeNodeModulesCacheKey.ts ${{ inputs.key-args }} > .build/packagelockhash',
			],
			electron: 'electron-download-v1-${{ runner.os }}-${{ inputs.arch }}-${{ hashFiles(\'.npmrc\', \'build/checksums/electron.txt\') }}',
			wslInstaller: 'wsl-installer-v1-${{ runner.os }}-${{ hashFiles(\'build/checksums/wsl.txt\') }}',
			builtInExtensions: [
				'builtin-extensions-${{ hashFiles(\'.build/builtindepshash\') }}',
				'node build/azure-pipelines/common/computeBuiltInDepsCacheKey.ts > .build/builtindepshash',
			],
		});
	});

	test('jobs run when one of their caches is missing or the caches cannot be listed', async () => {
		const existing = new Set(Object.values(cacheWarmingJobs).flatMap(job => getCacheKeys(job, readRepositoryFile)));
		existing.delete(getCacheKeys(cacheWarmingJobs.windows, readRepositoryFile)[1]);

		const detect = async (listCaches: (key: string) => string[]) => {
			const outputs: Record<string, string> = {};
			await detectMissingCaches({
				rest: {
					actions: {
						getActionsCacheList: async parameters => {
							assert.deepStrictEqual([parameters.ref, parameters.per_page], ['refs/heads/main', 100]);
							return { data: { actions_caches: listCaches(parameters.key).map(key => ({ key })) } };
						},
					},
				},
			}, {
				repo: { owner: 'microsoft', repo: 'vscode' },
				ref: 'refs/heads/main',
			}, {
				info: () => { },
				warning: () => { },
				setOutput: (name, value) => outputs[name] = value,
			}, { lf: readRepositoryFile, crlf: readRepositoryFile });
			return outputs;
		};

		assert.deepStrictEqual(await Promise.all([
			// Listing by key prefix also returns longer keys.
			detect(key => [...existing].filter(existingKey => existingKey.startsWith(key)).concat(`${key}-other`)),
			detect(() => { throw new Error('Not available'); }),
		]), [
			{ 'compile': 'false', 'linux': 'false', 'macOS': 'false', 'windows': 'true', 'copilot-linux': 'false', 'copilot-windows': 'false' },
			{ 'compile': 'true', 'linux': 'true', 'macOS': 'true', 'windows': 'true', 'copilot-linux': 'true', 'copilot-windows': 'true' },
		]);
	});
});
