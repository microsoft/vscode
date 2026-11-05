/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { suite, test } from 'node:test';
import { FAILSAFE_SCHEMA, load } from 'js-yaml';
import { NATIVE_BUILD_INPUTS } from '../../../.github/workflows/workspace_image/image.ts';
import { computeNodeModulesBaseCacheKey } from '../../azure-pipelines/common/cacheKeys.ts';
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
	// test workflow share their steps, so its first job stands for all of them.
	test('the test jobs download the scripts like the jobs that build the images', () => {
		const download = (workflow: string, job: string) => {
			const step = loadSteps(workflow, job).find(step => step.id === 'image-scripts');
			return { name: step?.name, shell: step?.shell, env: step?.env, run: step?.run };
		};
		assert.deepEqual(
			{ linux: download('pr-linux-test.yml', 'electron-unit-electron'), windows: download('pr-win32-test.yml', 'electron-unit') },
			{ linux: download('pr-workspace-images.yml', 'linux'), windows: download('pr-workspace-images.yml', 'windows') }
		);
	});

	// image.ts runs before the checkout, without the files of the repository, so it lists the inputs
	// of the base key of the node_modules caches itself
	test('compare the inputs of the base key of the node_modules caches', () => {
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
});
