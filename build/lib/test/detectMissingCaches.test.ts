/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { suite, test } from 'node:test';
import { FAILSAFE_SCHEMA, load } from 'js-yaml';
import { cacheWarmingJobs, detectMissingCaches, getCaches, type ICacheWarmingJob } from '../../../.github/actions/detect-missing-caches/detect.ts';

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

/**
 * Loads a workflow or action with all values as strings.
 */
function loadYaml<T>(relativePath: string): T {
	return load(readFileSync(path.join(repositoryRoot, relativePath), 'utf8'), { schema: FAILSAFE_SCHEMA }) as T;
}

function loadActionSteps(name: string): readonly IStep[] {
	return loadYaml<{ runs: { steps: IStep[] } }>(`.github/actions/${name}/action.yml`).runs.steps;
}

function readRepositoryFile(relativePath: string): Buffer {
	return readFileSync(path.join(repositoryRoot, relativePath));
}

/**
 * The runners of the cache warming jobs, as the cache keys see them.
 */
const runners: Record<string, { platform: string; arch: string; os: ICacheWarmingJob['os'] }> = {
	'1ES.Pool=1es-vscode-oss-ubuntu-22.04-x64': { platform: 'linux', arch: 'x64', os: 'Linux' },
	'1ES.Pool=1es-vscode-oss-windows-2022-x64': { platform: 'win32', arch: 'x64', os: 'Windows' },
	'macos-26-xlarge': { platform: 'darwin', arch: 'arm64', os: 'macOS' },
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
				os: runner.os,
				nodeModules: { prefix: nodeModules?.['key-prefix'] ?? '', args: evaluate(nodeModules?.['key-args'] ?? '').split(/\s+/) },
				...electron ? { electron: { arch: evaluate(electron.arch) } } : {},
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

	test('the action and the caches job forward an output for each job', () => {
		// The runner only loads the action when the workflow runs on main, so parse it here.
		const action = loadYaml<{ outputs: Record<string, { value: string }> }>('.github/actions/detect-missing-caches/action.yml');
		const workflow = loadYaml<{ jobs: { caches: { outputs: Record<string, string> } } }>('.github/workflows/pr-node-modules.yml');
		const expected = Object.fromEntries(Object.keys(cacheWarmingJobs).map(name => [name, `\${{ steps.detect.outputs.${name} }}`]));
		assert.deepStrictEqual({
			action: Object.fromEntries(Object.entries(action.outputs).map(([name, output]) => [name, output.value])),
			workflow: workflow.jobs.caches.outputs,
		}, { action: expected, workflow: expected });
	});

	test('the cache keys and versions match the actions that save them', () => {
		// The cache keys and versions depend on these keys, paths, commands and cross-OS settings.
		// When they change, update getCaches in .github/actions/detect-missing-caches/detect.ts to match.
		const caches = (steps: readonly IStep[]) => steps
			.filter(step => step.uses?.startsWith('actions/cache'))
			.map(step => ({ key: step.with?.key, path: step.with?.path, enableCrossOsArchive: step.with?.enableCrossOsArchive }));
		const commands = (steps: readonly IStep[], pattern: RegExp) => steps.flatMap(step => step.run?.split('\n').filter(line => pattern.test(line)).map(line => line.trim()) ?? []);
		const compile = loadYaml<{ jobs: Record<string, IJob> }>('.github/workflows/pr-node-modules.yml').jobs.compile.steps;
		assert.deepStrictEqual({
			nodeModules: [...caches(loadActionSteps('restore-node-modules')), ...caches(loadActionSteps('save-node-modules')), ...commands(loadActionSteps('restore-node-modules'), /computeNodeModulesCacheKey/)],
			electron: [...caches(loadActionSteps('setup-electron')), ...commands(loadActionSteps('setup-electron'), /ELECTRON_CACHE_PATH=|\$cacheRoot =/)],
			builtInExtensions: [...caches(compile), ...commands(compile, /computeBuiltInDepsCacheKey/)],
			wslInstaller: caches(loadActionSteps('restore-wsl-installer')),
		}, {
			nodeModules: [
				{ key: '${{ inputs.key-prefix }}-${{ hashFiles(\'.build/packagelockhash\') }}', path: '.build/node_modules_cache', enableCrossOsArchive: undefined },
				{ key: '${{ env.NODE_MODULES_CACHE_KEY }}', path: '.build/node_modules_cache', enableCrossOsArchive: undefined },
				'mkdir -p .build && node build/azure-pipelines/common/computeNodeModulesCacheKey.ts ${{ inputs.key-args }} > .build/packagelockhash',
				'node build/azure-pipelines/common/computeNodeModulesCacheKey.ts ${{ inputs.key-args }} > .build/packagelockhash',
			],
			electron: [
				{ key: 'electron-download-v1-${{ runner.os }}-${{ inputs.arch }}-${{ hashFiles(\'.npmrc\', \'build/checksums/electron.txt\') }}', path: '${{ env.ELECTRON_CACHE_PATH }}', enableCrossOsArchive: undefined },
				{ key: '${{ steps.restore.outputs.cache-primary-key }}', path: '${{ env.ELECTRON_CACHE_PATH }}', enableCrossOsArchive: undefined },
				'echo "ELECTRON_CACHE_PATH=$HOME/Library/Caches/electron" >> "$GITHUB_ENV"',
				'echo "ELECTRON_CACHE_PATH=${XDG_CACHE_HOME:-$HOME/.cache}/electron" >> "$GITHUB_ENV"',
				'$cacheRoot = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME \'AppData/Local\' }',
				'Add-Content -Path $env:GITHUB_ENV -Value "ELECTRON_CACHE_PATH=$(Join-Path $cacheRoot \'electron/Cache\')"',
			],
			builtInExtensions: [
				{ key: 'builtin-extensions-${{ hashFiles(\'.build/builtindepshash\') }}', path: '.build/builtInExtensions', enableCrossOsArchive: 'true' },
				'node build/azure-pipelines/common/computeBuiltInDepsCacheKey.ts > .build/builtindepshash',
			],
			wslInstaller: [
				{ key: 'wsl-installer-v1-${{ runner.os }}-${{ hashFiles(\'build/checksums/wsl.txt\') }}', path: '.build/wsl-installer', enableCrossOsArchive: undefined },
				{ key: '${{ steps.restore.outputs.cache-primary-key }}', path: '.build/wsl-installer', enableCrossOsArchive: undefined },
			],
		});
	});

	test('jobs run when one of their caches is missing, has another version or cannot be listed', async () => {
		const [missing, incompatible] = [getCaches(cacheWarmingJobs.windows, readRepositoryFile)[1], getCaches(cacheWarmingJobs.macOS, readRepositoryFile)[1]];
		const existing = Object.values(cacheWarmingJobs)
			.flatMap(job => getCaches(job, readRepositoryFile))
			.filter(cache => cache.key !== missing.key)
			.map(cache => cache.key === incompatible.key ? { ...cache, version: 'other' } : cache);

		const detect = async (listCaches: (key: string) => { key: string; version: string }[]) => {
			const outputs: Record<string, string> = {};
			await detectMissingCaches({
				rest: {
					actions: {
						getActionsCacheList: async parameters => {
							assert.deepStrictEqual([parameters.ref, parameters.per_page], ['refs/heads/main', 100]);
							return { data: { actions_caches: listCaches(parameters.key) } };
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
			detect(key => existing.filter(cache => cache.key.startsWith(key)).concat({ key: `${key}-other`, version: 'other' })),
			detect(() => { throw new Error('Not available'); }),
		]), [
			{ 'compile': 'false', 'linux': 'false', 'macOS': 'true', 'windows': 'true', 'copilot-linux': 'false', 'copilot-windows': 'false' },
			{ 'compile': 'true', 'linux': 'true', 'macOS': 'true', 'windows': 'true', 'copilot-linux': 'true', 'copilot-windows': 'true' },
		]);
	});
});
