/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { suite, test } from 'node:test';
import { FAILSAFE_SCHEMA, load } from 'js-yaml';
import { NATIVE_BUILD_INPUTS } from '../../../.github/workflows/workspace_image/image.ts';
import { computeNodeModulesBaseCacheKey } from '../../azure-pipelines/common/cacheKeys.ts';
import { findLinksToRoot } from '../../azure-pipelines/common/workspaceImage.ts';
import { distroRoots } from '../../npm/dirs.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

function readRepositoryFile(file: string): Buffer {
	return readFileSync(path.join(repositoryRoot, file));
}

interface IStep {
	readonly id?: string;
	readonly name?: string;
	readonly shell?: string;
	readonly env?: Record<string, string>;
	readonly run?: string;
}

function loadSteps(workflow: string, job: string): readonly IStep[] {
	const { jobs } = load(readRepositoryFile(`.github/workflows/${workflow}`).toString(), { schema: FAILSAFE_SCHEMA }) as { jobs: Record<string, { steps: IStep[] }> };
	return jobs[job].steps;
}

suite('workspace images', () => {
	// image.ts finds vhd.ps1 in the win32 folder beside it, which the download keeps. The jobs of a
	// test workflow share their steps, so its first job stands for all of them. The jobs of pr.yml
	// and component-fixtures.yml list the jobs that start from an image.
	test('the jobs that use the images download the scripts like the jobs that build them', () => {
		const download = (workflow: string, job: string) => {
			const step = loadSteps(workflow, job).find(step => step.id === 'image-scripts');
			return { name: step?.name, shell: step?.shell, env: step?.env, run: step?.run };
		};
		const jobs: readonly (readonly [workflow: string, job: string])[] = [
			['pr-workspace-images.yml', 'windows'],
			['pr-linux-test.yml', 'electron-unit-electron'],
			['pr-win32-test.yml', 'electron-unit'],
			...['compile', 'monaco-editor', 'copilot-check-test-cache', 'copilot-linux-tests', 'copilot-windows-tests', 'chat-lib-linux-tests', 'chat-lib-windows-tests'].map(job => ['pr.yml', job] as const),
			['component-fixtures.yml', 'playwright'],
			['component-fixtures.yml', 'screenshots'],
		];
		const builder = download('pr-workspace-images.yml', 'linux');
		assert.deepEqual(
			jobs.map(([workflow, job]) => ({ workflow, job, download: download(workflow, job) })),
			jobs.map(([workflow, job]) => ({ workflow, job, download: builder }))
		);
	});

	// image.ts runs before the checkout, without the files of the repository, so it lists the inputs
	// of the base key of node_modules folders itself
	test('compare the inputs of the base key of node_modules folders', () => {
		const read = new Set<string>();
		const key = computeNodeModulesBaseCacheKey([], file => {
			read.add(file);
			return readRepositoryFile(file);
		});
		const files = [...read].filter(file => !distroRoots.some(root => file.startsWith(`${root}/`)));
		const packageJsonFiles = files.filter(file => path.posix.basename(file) === 'package.json');

		const packageJsonFields: Record<string, string[]> = {};
		for (const file of packageJsonFiles) {
			const packageJson = JSON.parse(readRepositoryFile(file).toString());
			for (const field of new Set([...Object.keys(packageJson), ...NATIVE_BUILD_INPUTS.packageJsonFields[file] ?? []])) {
				const changed = Buffer.from(JSON.stringify({ ...packageJson, [field]: 'changed' }));
				if (computeNodeModulesBaseCacheKey([], other => other === file ? changed : readRepositoryFile(other)) !== key) {
					(packageJsonFields[file] ??= []).push(field);
				}
			}
		}

		assert.deepEqual({
			files: files.filter(file => !packageJsonFiles.includes(file)).sort(),
			packageJsonFields: Object.fromEntries(Object.entries(packageJsonFields).map(([file, fields]) => [file, fields.sort()])),
		}, {
			files: [...NATIVE_BUILD_INPUTS.files].sort(),
			packageJsonFields: Object.fromEntries(Object.entries(NATIVE_BUILD_INPUTS.packageJsonFields).map(([file, fields]) => [file, [...fields].sort()])),
		});
	});

	// The cache task saves its folder at the end of every job that didn't restore its key exactly, and
	// only the image job of Azure Pipelines may save images. So a test job changes the key
	// files that the cache task hashes to a key that no image has, and empties the folder it saves.
	test('Azure Pipelines test jobs save no image under the key of one', () => {
		const { steps } = load(readRepositoryFile('build/azure-pipelines/common/workspace-image.yml').toString(), { schema: FAILSAFE_SCHEMA }) as { steps: { task?: string; inputs?: Record<string, unknown> }[] };
		const inputs = steps.find(step => step.task === 'Cache@2')!.inputs!;
		const segments = (input: string) => input.split('|').map(segment => segment.trim());
		const key = segments(inputs.key as string);
		const restoreKeys = segments((inputs['${{ if eq(parameters.mode, \'use\') }}'] as { restoreKeys: string }).restoreKeys);
		const temp = mkdtempSync(path.join(tmpdir(), 'workspace-image-'));
		const agentPath = (input: string) => path.join(temp, input.replace('$(Agent.TempDirectory)/', ''));
		const keyFiles = key.filter(segment => segment.startsWith('$(Agent.TempDirectory)/')).map(agentPath);
		const cacheFolder = agentPath(inputs.path as string);
		try {
			const results = ['true', 'inexact', 'false', ''].map(restored => {
				rmSync(temp, { recursive: true, force: true });
				mkdirSync(path.join(temp, 's'), { recursive: true });
				mkdirSync(cacheFolder, { recursive: true });
				keyFiles.forEach((file, i) => {
					mkdirSync(path.dirname(file), { recursive: true });
					writeFileSync(file, ['base', 'image'][i]);
				});
				writeFileSync(path.join(cacheFolder, 'restored'), '');
				const { stdout } = spawnSync(process.execPath, [path.join(repositoryRoot, 'build/azure-pipelines/common/workspaceImage.ts'), 'restore'], {
					encoding: 'utf8',
					env: { ...process.env, AGENT_TEMPDIRECTORY: temp, BUILD_SOURCESDIRECTORY: path.join(temp, 's'), WORKSPACE_IMAGE_RESTORED: restored },
				});
				return { restored, keys: keyFiles.map(file => readFileSync(file, 'utf8')), folder: readdirSync(cacheFolder), used: /variable=WORKSPACE_IMAGE_USED\](\w+)/.exec(stdout)?.[1] };
			});
			assert.deepEqual({ restoreKeys, results }, {
				// The test jobs restore the newest image of their native build inputs
				restoreKeys: key.slice(0, -1),
				results: [
					{ restored: 'true', keys: ['base', 'image'], folder: [], used: 'false' },
					{ restored: 'inexact', keys: ['discarded', 'discarded'], folder: [], used: 'false' },
					{ restored: 'false', keys: ['discarded', 'discarded'], folder: [], used: 'false' },
					{ restored: '', keys: ['discarded', 'discarded'], folder: [], used: 'false' },
				],
			});
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});

	// Only the CI test jobs of product-build-ci.yml start from images, and the image jobs only run in CI
	// builds. The Windows smoke tests, like the WSL smoke test job of pull requests, don't: WSL cannot
	// open folders on a volume that is mounted in a folder.
	test('Azure Pipelines CI test jobs start from images, except the Windows smoke tests', () => {
		// Alone, or in an and() with the conditions of a stage
		const ciBuild = /^\$\{\{ if (?:and\(.*, )?eq\(variables\['VSCODE_CIBUILD'\], true\)\)? \}\}$/;
		const templates = (value: unknown, conditions: readonly string[] = []): { template: string; ci: boolean; parameters: Record<string, string> }[] => {
			if (Array.isArray(value)) {
				return value.flatMap(item => templates(item, conditions));
			}
			if (!value || typeof value !== 'object') {
				return [];
			}
			const record = value as Record<string, unknown>;
			return [
				...(typeof record.template === 'string' ? [{ template: record.template, ci: conditions.some(condition => ciBuild.test(condition)), parameters: (record.parameters ?? {}) as Record<string, string> }] : []),
				...Object.entries(record).flatMap(([key, child]) => templates(child, key.startsWith('${{ if ') ? [...conditions, key] : conditions)),
			];
		};
		const observed = ['product-build.yml', 'product-build-template.yml', 'product-build-ado-ci.yml', 'product-build-ci.yml'].map(file => {
			// Every job of product-build-ci.yml is a CI job
			const all = templates(load(readRepositoryFile(`build/azure-pipelines/${file}`).toString(), { schema: FAILSAFE_SCHEMA }), file === 'product-build-ci.yml' ? [`\${{ if eq(variables['VSCODE_CIBUILD'], true) }}`] : []);
			return {
				file,
				imageJobs: all.filter(({ template }) => template.endsWith('-workspace-image.yml@self')).map(({ template, ci }) => ({ template: path.posix.basename(template), ci })),
				testJobs: Object.fromEntries(all.flatMap(({ template, parameters }) => {
					const platform = /\/product-build-(?<platform>linux|win32|darwin)-ci\.yml@self$/.exec(template)?.groups?.platform;
					return platform ? [[`${platform} ${parameters.VSCODE_JOB_NAME}`, parameters.VSCODE_WORKSPACE_IMAGE ?? 'none']] : [];
				})),
			};
		});
		const jobs = ['UnitElectron', 'Unit', 'BrowserRemote', 'Integration', 'AgentHostE2E', 'Smoke'];
		const testJobs = (image: (platform: string, job: string) => string) => Object.fromEntries([
			...['win32', 'linux'].flatMap(platform => [...jobs, 'Copilot'].map(job => [`${platform} ${job}`, image(platform, job)])),
			...jobs.map(job => [`darwin ${job}`, image('darwin', job)]),
		]);
		assert.deepEqual(observed, [
			// The product build has no CI test jobs
			{ file: 'product-build.yml', imageJobs: [], testJobs: {} },
			{ file: 'product-build-template.yml', imageJobs: [], testJobs: testJobs(() => 'none') },
			{ file: 'product-build-ado-ci.yml', imageJobs: [], testJobs: testJobs(() => 'none') },
			{
				file: 'product-build-ci.yml',
				imageJobs: [
					{ template: 'product-build-win32-workspace-image.yml@self', ci: true },
					{ template: 'product-build-linux-workspace-image.yml@self', ci: true },
					{ template: 'product-build-darwin-workspace-image.yml@self', ci: true },
				],
				testJobs: testJobs((platform, job) => platform === 'win32' && job === 'Smoke' ? 'none' : 'use'),
			},
		]);
	});

	// The Windows test jobs replace these with junctions, as esbuild can't follow them to the root of
	// an image, which they mount at the sources directory without a drive letter
	test('find the relative links of pnpm that go up to the root of the sources directory', () => {
		const ws = mkdtempSync(path.join(tmpdir(), 'workspace-image-links-'));
		try {
			const link = (file: string, target: string) => {
				mkdirSync(path.dirname(path.join(ws, file)), { recursive: true });
				symlinkSync(target, path.join(ws, file), 'dir');
			};
			mkdirSync(path.join(ws, 'node_modules/.pnpm/which@4.0.0/node_modules/which'), { recursive: true });
			link('node_modules/which', '.pnpm/which@4.0.0/node_modules/which');
			link('node_modules/.pnpm/which@4.0.0/node_modules/isexe', '../../isexe@3.1.1/node_modules/isexe');
			link('node_modules/.pnpm/node_modules/isexe', '../isexe@3.1.1/node_modules/isexe');
			link('node_modules/.pnpm/x@1.0.0/node_modules/npm', '../../../../extensions/npm');
			link('node_modules/vscode-git', '../extensions/git');
			link('extensions/npm/node_modules/which', '../../../node_modules/.pnpm/which@4.0.0/node_modules/which');
			link('extensions/npm/node_modules/@types/node', '../../../../node_modules/.pnpm/@types+node@22.0.0/node_modules/@types/node');
			link('extensions/npm/node_modules/absolute', path.join(ws, 'node_modules/.pnpm/which@4.0.0/node_modules/which'));
			link('build/rspack/node_modules/x', '../../node_modules/.pnpm/x@1.0.0/node_modules/x');
			link('not-installed/node_modules/x', '../../node_modules/x');

			assert.deepEqual(
				findLinksToRoot(ws).map(({ link, target }) => [link, target].map(file => path.relative(ws, file).replaceAll(path.sep, '/')).join(' -> ')).sort(),
				[
					'extensions/npm/node_modules/@types/node -> node_modules/.pnpm/@types+node@22.0.0/node_modules/@types/node',
					'extensions/npm/node_modules/which -> node_modules/.pnpm/which@4.0.0/node_modules/which',
					'node_modules/.pnpm/x@1.0.0/node_modules/npm -> extensions/npm',
					'node_modules/vscode-git -> extensions/git',
				]
			);
		} finally {
			rmSync(ws, { recursive: true, force: true });
		}
	});
});
