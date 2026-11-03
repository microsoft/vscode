/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { suite, test } from 'node:test';
import { load } from 'js-yaml';

interface SanityJob {
	parameters: {
		name: string;
		args?: string;
		'${{ if eq(parameters.VSCODE_BUILD_LINUX_SNAP, false) }}'?: { args: string };
	};
}

interface ConditionalStage {
	[condition: string]: { jobs: Record<string, SanityJob[]>[] }[];
}

suite('Product sanity test selection', () => {
	test('native Linux keeps non-Snap coverage when Snap building is disabled', () => {
		const pipeline = load(readFileSync(path.resolve(import.meta.dirname, '../../azure-pipelines/product-build.yml'), 'utf8')) as {
			extends: { parameters: { stages: ConditionalStage[] } };
		};
		const sanityCondition = '${{ if and(eq(variables[\'VSCODE_PUBLISH\'], \'true\'), eq(variables[\'VSCODE_STEP_ON_IT\'], false)) }}';
		const nativeLinux = pipeline.extends.parameters.stages
			.flatMap(stage => stage[sanityCondition] ?? [])
			.flatMap(stage => stage.jobs)
			.flatMap(jobs => jobs['${{ if eq(parameters.VSCODE_BUILD_LINUX, true) }}'] ?? [])
			.find(job => job.parameters.name === 'ubuntu_native_x64');
		assert.ok(nativeLinux, 'Native Linux sanity must remain enabled for Linux builds');

		const names = [
			'cli-linux-x64',
			'desktop-linux-x64',
			'desktop-linux-deb-x64',
			'desktop-linux-rpm-x64',
			'desktop-linux-snap-x64',
			'server-linux-x64',
			'server-web-linux-x64',
		];
		const selected = [true, false].map(snapBuilt => {
			const args = snapBuilt
				? nativeLinux.parameters.args
				: nativeLinux.parameters['${{ if eq(parameters.VSCODE_BUILD_LINUX_SNAP, false) }}']?.args ?? nativeLinux.parameters.args;
			const match = args?.match(/^--grep "(?<pattern>[^"]+)"$/);
			assert.ok(!args || match, `Unexpected sanity arguments: ${args}`);
			const grep = new RegExp(match?.groups?.pattern ?? '');
			return { snapBuilt, tests: names.filter(name => grep.test(name)) };
		});
		assert.deepStrictEqual(selected, [
			{ snapBuilt: true, tests: names },
			{ snapBuilt: false, tests: names.filter(name => name !== 'desktop-linux-snap-x64') },
		]);
	});
});
