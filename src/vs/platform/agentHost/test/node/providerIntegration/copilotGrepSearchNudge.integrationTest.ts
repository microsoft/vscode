/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CopilotCliConfigKey } from '../../../common/copilotCliConfig.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../../common/state/sessionState.js';
import { driveTurnWithModelToCompletion } from '../e2e/harness/agentHostE2ETestHarness.js';
import { createTestDirectory } from '../e2e/harness/testDirectories.js';
import { createProviderSession } from '../providerIntegrationTestHelpers.js';
import { getActionEnvelope, isActionNotification, startRealServer, stopServer, TestProtocolClient, type IServerHandle } from '../serverIntegrationTestHelpers.js';

suite('Agent Host Provider Integration - Copilot grep search nudge', function () {
	this.timeout(120_000);
	ensureNoDisposablesAreLeakedInTestSuite();

	let directory: string;
	let host: IServerHandle | undefined;
	let client: TestProtocolClient | undefined;

	teardown(async () => {
		client?.close();
		client = undefined;
		try {
			await stopServer(host);
			host = undefined;
		} finally {
			await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
		}
	});

	for (const retryGrep of [true, false]) {
		test(retryGrep ? 'feeds the nudge to the model and executes an identical grep retry' : 'processes a normal search-subagent call after the nudge', async () => {
			directory = createTestDirectory(join(tmpdir(), 'copilot-grep-nudge-'));
			const workspace = join(directory, 'workspace');
			await mkdir(workspace);
			await writeFile(join(workspace, 'probe.txt'), 'NATIVE_GREP_MATCH_PROOF\n');
			const grep = { toolNamePattern: /^(grep|rg)$/, arguments: { pattern: 'NATIVE_GREP', path: workspace, output_mode: 'content' } };
			host = await startRealServer({
				homeDir: directory, userDataDir: join(directory, 'user-data'), mockLlm: true,
				mockScenarios: [{
					id: 'grep-nudge',
					definition: {
						type: 'multi-turn',
						turns: [
							{ kind: 'tool-calls', toolCalls: [grep, { ...grep, arguments: { ...grep.arguments, pattern: 'MATCH_PROOF' } }] },
							{
								kind: 'tool-calls',
								toolCalls: [retryGrep ? grep : {
									toolNamePattern: /^search_code_subagent$/,
									arguments: { query: 'Reply with exactly: SEARCH_SUBAGENT_PROOF', description: 'Find the probe', details: 'Read probe.txt to find the proof.' },
								}],
							},
							{ kind: 'content', chunks: [{ content: 'NUDGE_FLOW_COMPLETE', delayMs: 0 }] },
						],
					},
				}],
			});
			client = new TestProtocolClient(host.port);
			await client.connect();
			const connection = client;
			const session = await createProviderSession(connection, {
				provider: 'copilotcli', scheme: 'copilotcli', githubToken: 'synthetic-no-real-credential',
			}, 'grep-nudge-client', [], URI.file(workspace), async () => {
				await connection.call('subscribe', { channel: ROOT_STATE_URI });
				connection.dispatch({
					channel: ROOT_STATE_URI, clientSeq: 1,
					action: {
						type: ActionType.RootConfigChanged,
						config: {
							[CopilotCliConfigKey.SearchSubagent]: true,
							[CopilotCliConfigKey.SearchSubagentModel]: 'gpt-5.3-codex',
							[CopilotCliConfigKey.SearchSubagentGrepNudge]: true,
						},
					},
				});
				await connection.waitForNotification(notification => isActionNotification(notification, ActionType.RootConfigChanged) && getActionEnvelope(notification).origin?.clientSeq === 1);
			});
			const completed = await driveTurnWithModelToCompletion(connection, session, 'grep-nudge-turn', '[scenario:grep-nudge] Find the probe.', 'gpt-5.3-codex', 2);
			const requests = JSON.stringify(host.mockLlm?.getRequests?.());
			assert.ok(requests.includes('has NOT run'), 'The native runtime must feed the hook nudge back to the model');
			assert.ok(requests.includes('input_schema'), 'The nudge must include the live search tool schema');
			if (retryGrep) {
				assert.ok(requests.includes('NATIVE_GREP_MATCH_PROOF'), 'The retry must execute native grep and return real file contents');
				const completions = connection.receivedNotifications(notification => isActionNotification(notification, ActionType.ChatToolCallComplete))
					.map(notification => getActionEnvelope(notification).action)
					.filter(action => action.type === ActionType.ChatToolCallComplete);
				assert.deepStrictEqual(completions.map(action => action.result.success).sort(), [false, true, true], 'Only one grep is deferred per user message, including parallel calls and retries');
			} else {
				const starts = connection.receivedNotifications(notification => isActionNotification(notification, ActionType.ChatToolCallStart)).map(notification => getActionEnvelope(notification).action);
				const search = starts.find(action => action.type === ActionType.ChatToolCallStart && action.toolName === 'search_code_subagent');
				assert.ok(search?.type === ActionType.ChatToolCallStart);
				const completions = connection.receivedNotifications(notification => isActionNotification(notification, ActionType.ChatToolCallComplete)).map(notification => getActionEnvelope(notification).action);
				assert.ok(completions.some(action => action.type === ActionType.ChatToolCallComplete && action.toolCallId === search.toolCallId && action.result.success), 'The native search subagent must complete successfully');
			}
			assert.ok(completed.responseText.includes('NUDGE_FLOW_COMPLETE'));
		});
	}
});
