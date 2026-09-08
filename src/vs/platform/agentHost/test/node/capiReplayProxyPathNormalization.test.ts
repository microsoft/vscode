/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir, userInfo } from 'os';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CapiReplayProxy } from './e2e/harness/capiReplayProxy.js';
import { aggregateAnthropicSse, anthropicMessageToSse, IAnthropicMessage } from './e2e/harness/capiWireCodec.js';
import { scrubUserName } from './e2e/harness/userNameScrub.js';

suite('CapiReplayProxy path normalization', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	for (const [name, recordedDirectory, replayDirectory, recordedHome, replayHome] of [
		['POSIX to Windows', '/var/folders/recorded-user/T/', 'C:\\Users\\Replay User\\AppData\\Local\\Temp\\', undefined, undefined],
		['Windows to POSIX', 'C:\\Users\\Recorded User\\AppData\\Local\\Temp\\', '/tmp/', undefined, undefined],
		['normalized home directories', '/recorded-home/tmp/', '/replay-home/tmp/', '/recorded-home', '/replay-home'],
	] as const) {
		test(`normalizes and rebinds full tool-output paths from ${name}`, async () => {
			const testDirectory = mkdtempSync(join(tmpdir(), 'capi-replay-tool-output-'));
			const fixturePath = join(testDirectory, 'capture.yaml');
			const recordedFile = '1700000000000-copilot-tool-output-1234-11111111-1111-4111-8111-111111111111.txt';
			const replayFile = '1800000000000-copilot-tool-output-5678-22222222-2222-4222-8222-222222222222.txt';
			const recordedPath = recordedDirectory + recordedFile;
			const replayPath = replayDirectory + replayFile;
			const firstRequest = JSON.stringify({
				model: 'claude-sonnet-5',
				system: 'system',
				messages: [{ role: 'user', content: 'Generate output' }],
			});
			const request = (path: string, toolId: string, toolName: string, viewId?: string) => JSON.stringify({
				model: 'claude-sonnet-5',
				system: 'system',
				messages: [
					{ role: 'user', content: 'Generate output' },
					{ role: 'assistant', content: [{ type: 'tool_use', id: toolId, name: toolName, input: { command: 'echo output' } }] },
					{ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolId, content: `Saved to: ${path}` }] },
					...(viewId ? [
						{ role: 'assistant', content: [{ type: 'tool_use', id: viewId, name: 'view', input: { path } }] },
						{ role: 'user', content: [{ type: 'tool_result', tool_use_id: viewId, content: 'complete output' }] },
					] : []),
				],
			});
			const modelResponse = (message: IAnthropicMessage) => ({
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse(message),
			});
			const recording = new CapiReplayProxy({
				fixturePath,
				mode: 'record',
				homeDir: recordedHome,
				recordingModelResponse: modelResponse({
					content: [{ type: 'tool_use', id: 'toolu_1', name: 'bash', input: { command: 'echo output' } }],
					stopReason: 'tool_use',
				}),
			});
			let replayToDispose: CapiReplayProxy | undefined;
			try {
				const recordingUrl = await recording.start();
				const firstRecordedResponse = await fetch(`${recordingUrl}/v1/messages`, {
					method: 'POST', headers: { 'content-type': 'application/json' }, body: firstRequest,
				});
				await firstRecordedResponse.text();
				recording.setRecordingModelResponse(modelResponse({
					content: [{ type: 'tool_use', id: 'toolu_2', name: 'view', input: { path: recordedPath } }],
					stopReason: 'tool_use',
				}));
				const recordedResponse = await fetch(`${recordingUrl}/v1/messages`, {
					method: 'POST', headers: { 'content-type': 'application/json' }, body: request(recordedPath, 'toolu_1', 'bash'),
				});
				await recordedResponse.text();
				recording.setRecordingModelResponse(modelResponse({ content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' }));
				const finalRecordedResponse = await fetch(`${recordingUrl}/v1/messages`, {
					method: 'POST', headers: { 'content-type': 'application/json' }, body: request(recordedPath, 'toolu_1', 'bash', 'toolu_2'),
				});
				await finalRecordedResponse.text();
				await recording.stop();
				const fixture = readFileSync(fixturePath, 'utf8');
				const replay = new CapiReplayProxy({ fixturePath, mode: 'replay', homeDir: replayHome });
				replayToDispose = replay;
				const replayUrl = await replay.start();
				const firstReplayedResponse = await fetch(`${replayUrl}/v1/messages`, {
					method: 'POST', headers: { 'content-type': 'application/json' }, body: firstRequest,
				});
				const firstMessage = aggregateAnthropicSse(await firstReplayedResponse.text());
				assert.ok(firstMessage);
				const shell = firstMessage.content.find(block => block.type === 'tool_use');
				assert.ok(shell?.type === 'tool_use');
				const response = await fetch(`${replayUrl}/v1/messages`, {
					method: 'POST', headers: { 'content-type': 'application/json' }, body: request(replayPath, shell.id, shell.name),
				});
				const message = aggregateAnthropicSse(await response.text());
				assert.ok(message);
				const tool = message.content.find(block => block.type === 'tool_use');
				assert.ok(tool?.type === 'tool_use');
				const finalResponse = await fetch(`${replayUrl}/v1/messages`, {
					method: 'POST', headers: { 'content-type': 'application/json' }, body: request(replayPath, shell.id, shell.name, tool.id),
				});
				await finalResponse.text();
				replay.assertNoReplayMismatches();
				assert.deepStrictEqual({
					status: response.status,
					input: tool?.type === 'tool_use' ? tool.input : undefined,
					hasPlaceholder: fixture.includes('${tool_output_0}'),
					hasDirectory: fixture.includes(recordedDirectory),
					hasTimestamp: fixture.includes('1700000000000'),
					hasPid: fixture.includes('1234'),
				}, {
					status: 200,
					input: { path: replayPath },
					hasPlaceholder: true,
					hasDirectory: false,
					hasTimestamp: false,
					hasPid: false,
				});
			} finally {
				await recording.stop();
				await replayToDispose?.stop();
				rmSync(testDirectory, { recursive: true, force: true });
			}
		});
	}

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
