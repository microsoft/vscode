/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Logger } from '../../../../automation';
import { dumpFailureDiagnostics, getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer } from '../../utils';

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

			mockServer = await startServer(0, { logger: (msg: string) => logger.log(`[mock-llm] ${msg}`) });
			logger.log(`[Chat Sessions] mock LLM server started at ${mockServer.url} (platform=${process.platform}, arch=${process.arch}, node=${process.version})`);
			logger.log(`[Chat Sessions] env: VSCODE_DEV=${process.env.VSCODE_DEV ?? '<unset>'}, VSCODE_QUALITY=${process.env.VSCODE_QUALITY ?? '<unset>'}, BUILD_SOURCEBRANCH=${process.env.BUILD_SOURCEBRANCH ?? '<unset>'}, GITHUB_RUN_ID=${process.env.GITHUB_RUN_ID ?? '<unset>'}, GITHUB_ACTIONS=${process.env.GITHUB_ACTIONS ?? '<unset>'}`);
		});

		installAllHandlers(logger, opts => {
			const copilotEnv = getCopilotSmokeTestEnv(mockServer);
			logger.log(`[Chat Sessions] extraEnv keys for app: ${Object.keys(copilotEnv).join(', ')} (token len=${(copilotEnv.VSCODE_COPILOT_CHAT_TOKEN ?? '').length})`);
			return {
				...opts,
				extraEnv: {
					...(opts.extraEnv ?? {}),
					...copilotEnv,
				},
			};
		});

		before(async function () {
			const app = this.app as Application;
			logger.log(`[Chat Sessions] writing user settings (mock URL=${mockServer.url}); requestCount=${mockServer.requestCount()}`);

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
				// Pre-enable the chat session types that the tests open. Writing
				// these here (directly to settings.json) instead of from the
				// smoketest extension avoids racing with copilot-chat registering
				// its configuration schema — the original cause of the Chat
				// Sessions smoke test flake.
				['chat.disableAIFeatures', 'false'],
				['github.copilot.chat.backgroundAgent.enabled', 'true'],
				['github.copilot.chat.claudeAgent.enabled', 'true'],
				// Force the bundled Claude Agent SDK (avoid the experiment that
				// would route through the ms-vscode.vscode-claude-sdk extension,
				// which would attempt a network install during the smoke run).
				['github.copilot.chat.claudeAgent.useSdkExtension', 'false'],
			]);
			logger.log(`[Chat Sessions] user settings written; requestCount=${mockServer.requestCount()}`);
		});

		after(async function () {
			await mockServer?.close();
		});

		it('Test Copilot CLI session', async function () {
			const app = this.app as Application;
			const requestsBefore = mockServer.requestCount();
			logger.log(`[Chat Sessions/Copilot CLI] starting test; requestCount=${requestsBefore}`);

			try {
				logger.log(`[Chat Sessions/Copilot CLI] running command smoketest.openCopilotCliChat`);
				await app.workbench.quickaccess.runCommand('smoketest.openCopilotCliChat');
				logger.log(`[Chat Sessions/Copilot CLI] waiting for chat editor (timeout=600); requestCount=${mockServer.requestCount()}`);
				await app.workbench.chat.waitForChatEditor(600);
				logger.log(`[Chat Sessions/Copilot CLI] sending editor message; requestCount=${mockServer.requestCount()}`);
				await app.workbench.chat.sendEditorMessage(`hello world [scenario:${COPILOT_CLI_SCENARIO_ID}]`);
				logger.log(`[Chat Sessions/Copilot CLI] waiting for editor response (timeout=1500); requestCount=${mockServer.requestCount()}`);
				await app.workbench.chat.waitForEditorResponse(1500);
				logger.log(`[Chat Sessions/Copilot CLI] editor response received; requestCount=${mockServer.requestCount()}`);

				const responseText = (await app.workbench.chat.getLatestEditorResponseText()).trim();
				logger.log(`[Chat Sessions/Copilot CLI] response (length=${responseText.length}): ${responseText}`);

				assert.ok(
					responseText.includes(COPILOT_CLI_REPLY),
					`Expected Copilot CLI response to include mocked scenario response "${COPILOT_CLI_REPLY}".\n\nResponse:\n${responseText}`
				);
				assert.ok(
					mockServer.requestCount() > requestsBefore,
					`expected the mock LLM server to have received a new request from the Copilot CLI session (before=${requestsBefore}, after=${mockServer.requestCount()})`
				);
			} catch (error) {
				logger.log(`[Chat Sessions/Copilot CLI] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				logger.log(`[Chat Sessions/Copilot CLI] mock server requestCount at failure: ${mockServer.requestCount()} (before=${requestsBefore})`);
				await dumpFailureDiagnostics(app, logger, 'Chat Sessions/Copilot CLI');
				throw error;
			} finally {
				// Close the editor to avoid focus interference with the next test
				await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
			}
		});

		it('Test Claude session', async function () {
			const app = this.app as Application;
			const requestsBefore = mockServer.requestCount();
			logger.log(`[Chat Sessions/Claude] starting test; requestCount=${requestsBefore}`);

			try {
				logger.log(`[Chat Sessions/Claude] running command smoketest.openClaudeChat`);
				await app.workbench.quickaccess.runCommand('smoketest.openClaudeChat');
				logger.log(`[Chat Sessions/Claude] waiting for chat editor; requestCount=${mockServer.requestCount()}`);
				await app.workbench.chat.waitForChatEditor(600);
				logger.log(`[Chat Sessions/Claude] sending editor message; requestCount=${mockServer.requestCount()}`);
				await app.workbench.chat.sendEditorMessage(`hello world [scenario:${CLAUDE_SCENARIO_ID}]`);
				logger.log(`[Chat Sessions/Claude] mock requests after submit: ${mockServer.requestCount()}`);
				await app.workbench.chat.waitForEditorResponse(1500);
				logger.log(`[Chat Sessions/Claude] editor response received; requestCount=${mockServer.requestCount()}`);

				const responseText = (await app.workbench.chat.getLatestEditorResponseText()).trim();
				logger.log(`[Chat Sessions/Claude] response (length=${responseText.length}): ${responseText}`);
				logger.log(`[Chat Sessions/Claude] mock requests after response: ${mockServer.requestCount()}`);

				assert.ok(
					responseText.includes(CLAUDE_REPLY),
					`Expected Claude response to include mocked scenario response "${CLAUDE_REPLY}".\n\nResponse:\n${responseText}`
				);
				assert.ok(
					mockServer.requestCount() > requestsBefore,
					`expected the mock LLM server to have received a new request from the Claude session (before=${requestsBefore}, after=${mockServer.requestCount()})`
				);
			} catch (error) {
				logger.log(`[Chat Sessions/Claude] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				logger.log(`[Chat Sessions/Claude] mock server requestCount at failure: ${mockServer.requestCount()} (before=${requestsBefore})`);
				await dumpFailureDiagnostics(app, logger, 'Chat Sessions/Claude');
				throw error;
			} finally {
				// Close the editor to avoid focus interference with the next test
				await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
			}
		});

		it('Test Local session', async function () {
			const app = this.app as Application;
			const requestsBefore = mockServer.requestCount();
			logger.log(`[Chat Sessions/Local] starting test; requestCount=${requestsBefore}`);

			try {
				// "Local" in the regular VS Code window is the default chat
				// experience in the chat view (sidebar / aux bar).
				logger.log(`[Chat Sessions/Local] running command workbench.action.chat.open`);
				await app.workbench.quickaccess.runCommand('workbench.action.chat.open');
				logger.log(`[Chat Sessions/Local] waiting for chat view; requestCount=${mockServer.requestCount()}`);
				await app.workbench.chat.waitForChatView();
				logger.log(`[Chat Sessions/Local] sending message; requestCount=${mockServer.requestCount()}`);
				await app.workbench.chat.sendMessage(`hello world [scenario:${LOCAL_SCENARIO_ID}]`);
				logger.log(`[Chat Sessions/Local] waiting for response (timeout=1500); requestCount=${mockServer.requestCount()}`);
				await app.workbench.chat.waitForResponse(1500);
				logger.log(`[Chat Sessions/Local] response received; requestCount=${mockServer.requestCount()}`);

				const responseText = (await app.workbench.chat.getLatestResponseText()).trim();
				logger.log(`[Chat Sessions/Local] response (length=${responseText.length}): ${responseText}`);

				assert.ok(
					responseText.includes(LOCAL_REPLY),
					`Expected Local response to include mocked scenario response "${LOCAL_REPLY}".\n\nResponse:\n${responseText}`
				);
				assert.ok(
					mockServer.requestCount() > requestsBefore,
					`expected the mock LLM server to have received a new request from the Local session (before=${requestsBefore}, after=${mockServer.requestCount()})`
				);
			} catch (error) {
				logger.log(`[Chat Sessions/Local] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				logger.log(`[Chat Sessions/Local] mock server requestCount at failure: ${mockServer.requestCount()} (before=${requestsBefore})`);
				await dumpFailureDiagnostics(app, logger, 'Chat Sessions/Local');
				throw error;
			} finally {
				// Close the chat view to leave a clean state
				await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
			}
		});
	});
}
