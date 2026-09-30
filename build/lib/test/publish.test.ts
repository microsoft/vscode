/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { getGatingJob, type TimelineRecord } from '../../azure-pipelines/common/publish.ts';

function job(stage: string, name: string, state: string, result = ''): TimelineRecord {
	return { name: `${name} (display name)`, identifier: `${stage}.${name}.__default`, type: 'Job', state, result };
}

suite('Publish gating', () => {
	test('artifacts wait for every job of their gating job', () => {
		const compile = job('Windows', 'Windows_x64_Compile', 'completed', 'succeeded');
		const scenarios: Record<string, { artifact: string; records: TimelineRecord[] }> = {
			ungated: { artifact: 'vscode_client_win32_arm64_archive', records: [compile] },
			testsSkipped: { artifact: 'vscode_client_win32_x64_archive', records: [compile, job('Windows', 'Windows_x64_Testing', 'completed', 'failed')] },
			unshardedSucceeded: { artifact: 'vscode_client_linux_x64_archive-unsigned', records: [job('LinuxX64', 'Linux_x64_Test', 'completed', 'succeeded')] },
			shardPending: {
				artifact: 'vscode_client_win32_x64_archive', records: [
					compile,
					job('Windows', 'Windows_x64_Test_Unit', 'completed', 'succeeded'),
					job('Windows', 'Windows_x64_Test_Smoke', 'inProgress'),
				]
			},
			shardFailedWhileOtherPending: {
				artifact: 'vscode_client_win32_x64_archive', records: [
					job('Windows', 'Windows_x64_Test_Unit', 'inProgress'),
					job('Windows', 'Windows_x64_Test_Smoke', 'completed', 'failed'),
				]
			},
			failedShardRetried: {
				artifact: 'vscode_client_win32_x64_archive', records: [
					job('Windows', 'Windows_x64_Test_Unit', 'completed', 'succeeded'),
					job('Windows', 'Windows_x64_Test_Smoke', 'completed', 'failed'),
					job('Windows', 'Windows_x64_Test_Smoke', 'inProgress'),
				]
			},
			allShardsSucceeded: {
				artifact: 'vscode_client_win32_x64_archive', records: [
					compile,
					job('Windows', 'Windows_x64_Test_Unit', 'completed', 'succeeded'),
					job('Windows', 'Windows_x64_Test_Smoke', 'completed', 'failed'),
					job('Windows', 'Windows_x64_Test_Smoke', 'completed', 'succeededWithIssues'),
				]
			},
		};

		assert.deepStrictEqual(
			Object.fromEntries(Object.entries(scenarios).map(([name, { artifact, records }]) => [name, getGatingJob({ records }, artifact)])),
			{
				ungated: undefined,
				testsSkipped: { name: 'Windows_x64_Test', state: 'missing' },
				unshardedSucceeded: { name: 'Linux_x64_Test', state: 'succeeded' },
				shardPending: { name: 'Windows_x64_Test_Smoke', state: 'pending' },
				shardFailedWhileOtherPending: { name: 'Windows_x64_Test_Smoke', state: 'failed' },
				failedShardRetried: { name: 'Windows_x64_Test_Smoke', state: 'pending' },
				allShardsSucceeded: { name: 'Windows_x64_Test_Unit, Windows_x64_Test_Smoke', state: 'succeeded' },
			}
		);
	});
});
