/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir, userInfo } from 'os';
import { join, posix, win32 } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CapiReplayProxy } from './e2e/harness/capiReplayProxy.js';
import { aggregateAnthropicSse, anthropicMessageToSse } from './e2e/harness/capiWireCodec.js';
import { scrubUserName } from './e2e/harness/userNameScrub.js';

suite('CapiReplayProxy path normalization', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	async function assertCopiedPluginPathReplay(pathStyle: typeof posix): Promise<void> {
		const testDirectory = mkdtempSync(join(tmpdir(), 'capi-replay-plugin-normalization-'));
		const fixturePath = join(testDirectory, 'capture.yaml');
		const homeDir = pathStyle.join(testDirectory, 'home');
		const pluginFile = (directory: string) => pathStyle.join(homeDir, 'user-data', 'agentPlugins', directory, '1', 'reference.txt');
		const request = (path: string) => JSON.stringify({
			model: 'claude-opus-5',
			system: 'system',
			messages: [{ role: 'user', content: `Read ${path}` }],
		});
		const recorder = new CapiReplayProxy({
			fixturePath,
			mode: 'record',
			homeDir,
			recordingModelResponse: {
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse({
					content: [{ type: 'tool_use', id: 'toolu_1', name: 'view', input: { path: pluginFile('recorded-copy') } }],
					stopReason: 'tool_use',
				}),
			},
		});
		try {
			const response = await fetch(`${await recorder.start()}/v1/messages`, { method: 'POST', body: request(pluginFile('recorded-copy')) });
			await response.text();
			await recorder.stop();
			const replay = new CapiReplayProxy({ fixturePath, mode: 'replay', homeDir });
			try {
				const url = await replay.start();
				const paths: string[] = [];
				for (const directory of ['first-copy', 'second-copy']) {
					replay.resetForReplay(fixturePath);
					const response = await fetch(`${url}/v1/messages`, { method: 'POST', body: request(pluginFile(directory)) });
					const message = aggregateAnthropicSse(await response.text());
					const block = message?.content[0];
					assert.ok(block?.type === 'tool_use' && typeof block.input === 'object' && block.input !== null);
					const path: unknown = Reflect.get(block.input, 'path');
					assert.ok(typeof path === 'string');
					paths.push(pathStyle.normalize(path));
					replay.assertNoReplayMismatches();
				}
				assert.deepStrictEqual(paths, [pluginFile('first-copy'), pluginFile('second-copy')]);
			} finally {
				await replay.stop();
			}
		} finally {
			await recorder.stop();
			rmSync(testDirectory, { recursive: true, force: true });
		}
	}

	test('binds copied plugin paths from live requests and resets bindings between fixtures', async () => {
		await assertCopiedPluginPathReplay(posix);
		await assertCopiedPluginPathReplay(win32);
	});

	test('normalizes truncated harness workspaces from session titles', async () => {
		const testDirectory = mkdtempSync(join(tmpdir(), 'capi-replay-path-normalization-'));
		const fixturePath = join(testDirectory, 'capture.yaml');
		const userName = userInfo().username;
		const recordedWorkspace = join(tmpdir(), 'ahp-server-tools-sessions-list-6Al4co');
		const truncatedWorkspace = scrubUserName(recordedWorkspace.slice(0, -2), userName);
		const truncatedWorkspaceUri = scrubUserName(URI.file(recordedWorkspace).toString().slice(0, -2), userName);
		const unrelatedCurrentWorkspace = join(tmpdir(), 'ahp-current-workspace-AbC12D');
		const proxy = new CapiReplayProxy({
			fixturePath,
			mode: 'record',
			workDir: unrelatedCurrentWorkspace,
			homeDir: userInfo().homedir,
			userName,
			recordingModelResponse: {
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse({
					content: [
						{ type: 'text', text: `${join(unrelatedCurrentWorkspace, 'child.txt')}\nnext` },
						{
							type: 'tool_use',
							id: 'toolu_2',
							name: 'Read',
							input: { file_path: join(unrelatedCurrentWorkspace, 'child.txt') },
						},
					],
					stopReason: 'tool_use',
				}),
			},
		});

		try {
			const url = await proxy.start();
			const title = `Call list_sessions with workspace "${truncatedWorkspace}" or "${truncatedWorkspaceUri}"`;
			const response = await fetch(`${url}/v1/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					model: 'claude-opus-5',
					system: 'system',
					messages: [{
						role: 'user',
						content: [{
							type: 'tool_result',
							tool_use_id: 'toolu_1',
							content: JSON.stringify({ sessions: [{ title }] }),
						}],
					}],
				}),
			});
			assert.strictEqual(response.status, 200);
			await response.text();
			await proxy.stop();

			const fixture = readFileSync(fixturePath, 'utf8');
			assert.deepStrictEqual({
				workdirPlaceholders: fixture.match(/\$\{workdir\}/g)?.length,
				hasPortableToolInput: fixture.includes('file_path: ${workdir}/child.txt'),
				hasCorruptedNewline: fixture.includes('${workdir}/n'),
				hasTempDirectory: fixture.includes(tmpdir()),
				hasScrubbedTempDirectory: fixture.includes(scrubUserName(tmpdir(), userName)),
				hasRandomSuffix: fixture.includes('6Al4'),
			}, {
				workdirPlaceholders: 4,
				hasPortableToolInput: true,
				hasCorruptedNewline: false,
				hasTempDirectory: false,
				hasScrubbedTempDirectory: false,
				hasRandomSuffix: false,
			});
		} finally {
			await proxy.stop();
			rmSync(testDirectory, { recursive: true, force: true });
		}
	});
});
