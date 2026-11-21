/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { artifactsByGatingJob, getGatingJob, runArtifactPublishOperation, warnIfMobileArtifactMissing, type TimelineRecord } from '../../azure-pipelines/common/publishGate.ts';

function phase(identifier: string, state: string, result: string | null = null): TimelineRecord {
	return { type: 'Phase', identifier, name: identifier.split('.').pop()!, state, result };
}

function job(identifier: string, state: string, result: string | null = null): TimelineRecord {
	return { type: 'Job', identifier: `${identifier}.__default`, name: identifier.split('.').pop()!, state, result };
}

const linuxTests = ['Unit', 'UnitElectron', 'Integration', 'BrowserRemote', 'Smoke', 'AgentHostE2E'].map(name => `LinuxX64.Linux_x64_Test_${name}`);

function gate(records: TimelineRecord[], artifact = 'vscode_cli_linux_x64_cli') {
	return getGatingJob({ records }, artifact);
}

suite('Publish gate', () => {
	test('an enabled mobile job that produces no archive warns instead of silently disappearing', t => {
		const messages: string[] = [];
		t.mock.method(console, 'log', (message: string) => messages.push(message));
		warnIfMobileArtifactMissing({ records: [] }, []);
		const mobile: TimelineRecord = { type: 'Stage', identifier: 'Mobile', name: 'Mobile target', state: 'inProgress', result: null };
		warnIfMobileArtifactMissing({ records: [mobile] }, []);
		const timeline = { records: [{ ...mobile, state: 'completed', result: 'succeededWithIssues' }] };
		warnIfMobileArtifactMissing(timeline, ['vscode_web_linux_mobile_archive-unsigned']);
		warnIfMobileArtifactMissing(timeline, ['vscode_web_linux_standalone_archive-unsigned']);
		assert.deepStrictEqual(messages, ['##vso[task.logissue type=warning]Mobile was enabled but vscode_web_linux_mobile_archive-unsigned was not produced. Check the Mobile stage; continuing the ordinary release.']);
	});

	test('mobile operation failures warn without reporting a successful publication', async t => {
		const messages: string[] = [];
		t.mock.method(console, 'log', (message: string) => messages.push(message));
		const result = await runArtifactPublishOperation('vscode_web_linux_mobile_archive-unsigned', async () => {
			throw new Error('download failed: 100%\r\nretry');
		});
		assert.deepStrictEqual({ result, messages }, {
			result: { succeeded: false },
			messages: ['##vso[task.logissue type=warning][vscode_web_linux_mobile_archive-unsigned] Mobile publication failed; continuing the ordinary release: Error: download failed: 100%AZP25%0D%0Aretry'],
		});
	});

	test('ordinary artifact failures still reject and successful mobile operations retain their value', async () => {
		const error = new Error('publication failed');
		for (const artifact of ['vscode_web_linux_standalone_archive-unsigned', 'vscode_client_linux_x64_archive-unsigned', 'vscode_web_linux_mobile_archive']) {
			await assert.rejects(runArtifactPublishOperation(artifact, async () => { throw error; }), error);
		}
		assert.deepStrictEqual(await runArtifactPublishOperation('vscode_web_linux_mobile_archive-unsigned', async () => 'archive.tar.gz'), { succeeded: true, value: 'archive.tar.gz' });
	});

	test('artifacts without a gating job are not gated', () => {
		assert.strictEqual(gate([phase('LinuxX64.Linux_x64_Test_Unit', 'pending')], 'vscode_cli_alpine_x64_cli'), undefined);
	});

	test('an artifact is not gated when its tests are not part of the run', () => {
		assert.deepStrictEqual(gate([
			phase('LinuxX64.LinuxCLI_x64', 'completed', 'succeeded'),
			job('LinuxX64.LinuxCLI_x64', 'completed', 'succeeded'),
			phase('LinuxX64.Linux_x64_Compile', 'inProgress'),
		]), { name: 'Linux_x64_Test', state: 'missing' });
	});

	test('waits for tests that are not scheduled yet', () => {
		// The CLI job finishes long before the tests, which wait for the compile job and have no job records yet
		assert.deepStrictEqual(gate([
			phase('LinuxX64.LinuxCLI_x64', 'completed', 'succeeded'),
			job('LinuxX64.LinuxCLI_x64', 'completed', 'succeeded'),
			phase('LinuxX64.Linux_x64_Compile', 'inProgress'),
			job('LinuxX64.Linux_x64_Compile', 'inProgress'),
			...linuxTests.map(id => phase(id, 'pending')),
		]), { name: 'Linux_x64_Test_Unit', state: 'pending' });
	});

	test('waits for tests that a stage retry reset, even though an earlier attempt has job records', () => {
		// Build 494123: the Linux stage was retried, and the compile job published the artifacts again before the tests ran
		assert.deepStrictEqual(gate([
			phase('LinuxX64.Linux_x64_Compile', 'completed', 'succeeded'),
			...linuxTests.map(id => phase(id, 'pending')),
			...linuxTests.map(id => job(id, 'completed', id.endsWith('_Unit') ? 'failed' : 'succeeded')),
		], 'vscode_client_linux_x64_archive-unsigned'), { name: 'Linux_x64_Test_Unit', state: 'pending' });
	});

	test('blocks when any shard failed, was canceled or was skipped', () => {
		for (const result of ['failed', 'canceled', 'skipped', 'abandoned']) {
			assert.deepStrictEqual(gate([
				...linuxTests.map(id => phase(id, 'completed', id.endsWith('_Smoke') ? result : 'succeeded')),
				phase('LinuxX64.Linux_x64_Test_Unit', 'inProgress'),
			]), { name: 'Linux_x64_Test_Smoke', state: 'failed' }, result);
		}
	});

	test('passes once every shard succeeded', () => {
		assert.deepStrictEqual(gate(linuxTests.map(id => phase(id, 'completed', id.endsWith('_Smoke') ? 'succeededWithIssues' : 'succeeded'))), {
			name: linuxTests.map(id => id.split('.').pop()).join(', '),
			state: 'succeeded',
		});
	});

	test('only matches the gating job of the artifact\'s platform', () => {
		assert.deepStrictEqual(gate([
			phase('LinuxARM64.Linux_arm64_Test_Unit', 'completed', 'failed'),
			phase('Windows.Windows_x64_Test_Unit', 'completed', 'failed'),
			phase('LinuxX64.Linux_x64_Tests', 'completed', 'failed'),
			phase('LinuxX64.Linux_x64_Test_Unit', 'completed', 'succeeded'),
		]), { name: 'Linux_x64_Test_Unit', state: 'succeeded' });
	});

	test('every gated artifact belongs to exactly one gating job', () => {
		const artifacts = Object.values(artifactsByGatingJob).flat();
		assert.strictEqual(new Set(artifacts).size, artifacts.length);
	});
});
