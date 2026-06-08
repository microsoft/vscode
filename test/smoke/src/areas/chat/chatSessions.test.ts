/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Logger } from '../../../../automation';
import { getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer } from '../../utils';

/**
 * Per-test scenarios. Each test uses a unique scenario id so that the mock
 * reply is distinct — this catches stale-content bugs where the previous
 * test's response is mistakenly accepted as the current test's response.
 */
const COPILOT_CLI_SCENARIO_ID = 'smoke-chat-sessions-copilot-cli';
const COPILOT_CLI_REPLY = 'MOCKED_CHAT_SESSIONS_COPILOT_CLI_RESPONSE';

const CLAUDE_SCENARIO_ID = 'smoke-chat-sessions-claude';
const CLAUDE_REPLY = 'MOCKED_CHAT_SESSIONS_CLAUDE_RESPONSE';

const LOCAL_SCENARIO_ID = 'smoke-chat-sessions-local';
const LOCAL_REPLY = 'MOCKED_CHAT_SESSIONS_LOCAL_RESPONSE';

export function setup(logger: Logger) {

	describe('Chat Sessions', function () {
		this.timeout(5 * 60 * 1000);
		this.retries(0);

		let mockServer: MockLlmServer;

		// Start the mock server BEFORE installAllHandlers' `before` runs so
		// the mock URL is available when we configure the app's env vars via
		// `optionsTransform`.
		before(async function () {
			const { startServer, ScenarioBuilder, registerScenario } = require(getMockLlmServerPath());

			// Fallback for ancillary requests (title/branch) that don't carry a [scenario:...] tag.
			registerScenario('text-only', new ScenarioBuilder().emit('OK').build());

			// One scenario per session type, each emitting a distinct reply
			// so the assertion is unambiguous.
			registerScenario(COPILOT_CLI_SCENARIO_ID, new ScenarioBuilder().emit(COPILOT_CLI_REPLY).build());
			registerScenario(CLAUDE_SCENARIO_ID, new ScenarioBuilder().emit(CLAUDE_REPLY).build());
			registerScenario(LOCAL_SCENARIO_ID, new ScenarioBuilder().emit(LOCAL_REPLY).build());

			mockServer = await startServer(0, { logger: (msg: string) => logger.log(msg) });
			logger.log(`Chat Sessions mock LLM server started at ${mockServer.url}`);
		});

		installAllHandlers(logger, opts => ({
			...opts,
			extraEnv: {
				...(opts.extraEnv ?? {}),
				...getCopilotSmokeTestEnv(mockServer),
			},
		}));

		before(async function () {
			const app = this.app as Application;

			// overrideProxyUrl/overrideCapiUrl redirect Copilot SDK + CAPI traffic
			// to the mock server. allowAnonymousAccess skips the token-validation
			// gate when there is no real GitHub session. The MCP/githubMcpServer
			// settings prevent real-network MCP connections during the test.
			await app.workbench.settingsEditor.addUserSettings([
				['github.copilot.advanced.debug.overrideProxyUrl', JSON.stringify(mockServer.url)],
				['github.copilot.advanced.debug.overrideCapiUrl', JSON.stringify(mockServer.url)],
				// Use token auth (not HMAC) so the CLI SDK can call /models and
				// /models/session against the mock server without HMAC validation.
				['github.copilot.advanced.debug.overrideAuthType', '"token"'],
				['chat.allowAnonymousAccess', 'true'],
				['github.copilot.chat.githubMcpServer.enabled', 'false'],
				['chat.mcp.discovery.enabled', 'false'],
				['chat.mcp.enabled', 'false'],
				// Force the bundled Claude Agent SDK (avoid the experiment that
				// would route through the ms-vscode.vscode-claude-sdk extension,
				// which would attempt a network install during the smoke run).
				['github.copilot.chat.claudeAgent.useSdkExtension', 'false'],
			]);
		});

		after(async function () {
			await mockServer?.close();
		});

		it.skip('Test Copilot CLI session', async function () {
			const app = this.app as Application;
			const requestsBefore = mockServer.requestCount();

			await app.workbench.quickaccess.runCommand('smoketest.openCopilotCliChat');
			await app.workbench.chat.waitForChatEditor(600);
			await app.workbench.chat.sendEditorMessage(`hello world [scenario:${COPILOT_CLI_SCENARIO_ID}]`);
			await app.workbench.chat.waitForEditorResponse(1500);

			const responseText = (await app.workbench.chat.getLatestEditorResponseText()).trim();
			logger.log(`Chat Sessions (Copilot CLI) response: ${responseText}`);

			assert.ok(
				responseText.includes(COPILOT_CLI_REPLY),
				`Expected Copilot CLI response to include mocked scenario response "${COPILOT_CLI_REPLY}".\n\nResponse:\n${responseText}`
			);
			assert.ok(
				mockServer.requestCount() > requestsBefore,
				'expected the mock LLM server to have received a new request from the Copilot CLI session'
			);
		});

		it.skip('Test Claude session', async function () {
			const app = this.app as Application;
			const requestsBefore = mockServer.requestCount();
			logger.log(`Chat Sessions (Claude) mock requests before: ${requestsBefore}`);

			await app.workbench.quickaccess.runCommand('smoketest.openClaudeChat');
			await app.workbench.chat.waitForChatEditor(600);
			await app.workbench.chat.sendEditorMessage(`hello world [scenario:${CLAUDE_SCENARIO_ID}]`);
			logger.log(`Chat Sessions (Claude) mock requests after submit: ${mockServer.requestCount()}`);
			await app.workbench.chat.waitForEditorResponse(1500);

			const responseText = (await app.workbench.chat.getLatestEditorResponseText()).trim();
			logger.log(`Chat Sessions (Claude) response: ${responseText}`);
			logger.log(`Chat Sessions (Claude) mock requests after response: ${mockServer.requestCount()}`);

			assert.ok(
				responseText.includes(CLAUDE_REPLY),
				`Expected Claude response to include mocked scenario response "${CLAUDE_REPLY}".\n\nResponse:\n${responseText}`
			);
			assert.ok(
				mockServer.requestCount() > requestsBefore,
				'expected the mock LLM server to have received a new request from the Claude session'
			);
		});

		it('Test Local session', async function () {
			const app = this.app as Application;
			const requestsBefore = mockServer.requestCount();

			// "Local" in the regular VS Code window is the default chat
			// experience in the chat view (sidebar / aux bar).
			await app.workbench.quickaccess.runCommand('workbench.action.chat.open');
			await app.workbench.chat.waitForChatView();
			await app.workbench.chat.sendMessage(`hello world [scenario:${LOCAL_SCENARIO_ID}]`);
			await app.workbench.chat.waitForResponse(1500);

			const responseText = (await app.workbench.chat.getLatestResponseText()).trim();
			logger.log(`Chat Sessions (Local) response: ${responseText}`);

			assert.ok(
				responseText.includes(LOCAL_REPLY),
				`Expected Local response to include mocked scenario response "${LOCAL_REPLY}".\n\nResponse:\n${responseText}`
			);
			assert.ok(
				mockServer.requestCount() > requestsBefore,
				'expected the mock LLM server to have received a new request from the Local session'
			);
		});
	});
}
