/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Application, Logger } from '../../../../automation';
import { getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer } from '../../utils';

/**
 * Per-test scenarios. Each test uses a unique scenario id so that the mock
 * reply is distinct — this catches stale-content bugs where the previous
 * test's response is mistakenly accepted as the current test's response.
 */
const COPILOT_SCENARIO_ID = 'smoke-hello-copilot';
const COPILOT_REPLY = 'MOCKED_COPILOT_RESPONSE';

const COPILOT_SANDBOX_SCENARIO_ID = 'smoke-hello-copilot-sandbox';
const COPILOT_SANDBOX_REPLY = 'MOCKED_COPILOT_SANDBOX_RESPONSE';

const LOCAL_SCENARIO_ID = 'smoke-hello-local';
const LOCAL_REPLY = 'MOCKED_LOCAL_RESPONSE';

const CLAUDE_SCENARIO_ID = 'smoke-hello-claude';
const CLAUDE_REPLY = 'MOCKED_CLAUDE_RESPONSE';

export function setup(logger: Logger) {

	describe('Agents Window', () => {

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
			registerScenario(COPILOT_SCENARIO_ID, new ScenarioBuilder().emit(COPILOT_REPLY).build());
			registerScenario(COPILOT_SANDBOX_SCENARIO_ID, {
				type: 'multi-turn',
				turns: [
					{
						kind: 'tool-calls',
						toolCalls: [
							{
								toolNamePattern: /^(bash|pwsh|powershell)$/i,
								arguments: { command: `echo ${COPILOT_SANDBOX_REPLY}` },
							},
						],
					},
					{ kind: 'echo-last-message' },
				],
			});
			registerScenario(LOCAL_SCENARIO_ID, new ScenarioBuilder().emit(LOCAL_REPLY).build());
			registerScenario(CLAUDE_SCENARIO_ID, new ScenarioBuilder().emit(CLAUDE_REPLY).build());

			mockServer = await startServer(0, { logger: (msg: string) => logger.log(msg), verbose: true });
			logger.log(`Mock LLM server started at ${mockServer.url}`);
		});

		installAllHandlers(logger, opts => ({
			...opts,
			extraEnv: {
				...(opts.extraEnv ?? {}),
				...getCopilotSmokeTestEnv(mockServer),
			},
		}));

		before(async function () {
			// One-time setup: write VS Code settings and open the Agents Window
			// with the smoke-test workspace folder pre-selected. Subsequent tests
			// reuse this window and just start fresh sessions.
			const app = this.app as Application;

			// Reset any uncommitted changes left by earlier smoke test suites
			// (e.g. the Tasks test modifies .vscode/tasks.json). A dirty
			// workspace prevents worktree creation and triggers the
			// "uncommitted changes" confirmation flow which aborts the session.
			cp.execSync('git checkout . --quiet', { cwd: app.workspacePathOrFolder });

			// overrideProxyUrl redirects all Copilot SDK traffic to our mock server
			// and enables HMAC auth — no real GitHub token required.
			// allowAnonymousAccess skips the token-validation gate in the
			// extension-host copilotTokenManager when there is no real GitHub session.
			// githubMcpServer is disabled to prevent a real-network MCP connection
			// to the GitHub MCP server during the test.
			// sessions.chat.localAgent.enabled exposes the "Local" session type.
			await app.workbench.settingsEditor.addUserSettings([
				['github.copilot.advanced.debug.overrideProxyUrl', JSON.stringify(mockServer.url)],
				// Use token auth (not HMAC) so the SDK can call /models and
				// /models/session against the mock server without HMAC validation.
				['github.copilot.advanced.debug.overrideAuthType', '"token"'],
				['chat.allowAnonymousAccess', 'true'],
				['github.copilot.chat.githubMcpServer.enabled', 'false'],
				['sessions.chat.localAgent.enabled', 'true'],
				['github.copilot.chat.cli.sandbox.enabled', '"on"'],
				['github.copilot.chat.cli.sessionEventLogging.enabled', 'true'],
			]);

			// `--enable-smoke-test-driver` (set by the runner) skips the auth dialog.
			const windowsBefore = app.code.driver.getAllWindows().length;
			await app.workbench.agentsWindow.openCurrentFolderInAgentsWindow();
			await app.workbench.agentsWindow.switchToAgentsWindow(windowsBefore);
		});

		after(async function () {
			if (mockServer) {
				await mockServer.close();
			}
		});

		it('Test Copilot CLI session', async function () {
			const app = this.app as Application;

			await app.workbench.agentsWindow.waitForNewSessionView();
			await app.workbench.agentsWindow.selectSessionType('Copilot CLI');

			const requestsBefore = mockServer.requestCount();
			await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${COPILOT_SCENARIO_ID}]`);

			const text = await app.workbench.agentsWindow.waitForAssistantText(COPILOT_REPLY);
			logger.log(`Agents Window (Copilot) response: ${text}`);

			assert.ok(
				mockServer.requestCount() > requestsBefore,
				'expected the mock LLM server to have received a new request from the Copilot session'
			);
		});

		it.skip('Test Copilot CLI session (sandbox)', async function () {
			// Sandbox-backed shell tool currently only runs cleanly on macOS
			// in CI. On Linux the bubblewrap policy fails to start bash inside
			// the sandbox; on Windows AppContainer cold-start usually exceeds
			// the 120s budget. Re-enable here once both backends are fixed.
			//
			// To debug a CI run, download the per-platform logs artifact from
			// the Azure DevOps build:
			//
			//   az pipelines runs artifact download \
			//     --org <ORG_URL> --project <PROJECT_NAME> \
			//     --run-id <BUILD_ID> --artifact-name logs-<os>-<arch>-1 \
			//     --path ./logs-<os>
			//
			// where <os>-<arch> is one of `linux-x64`, `macos-arm64`,
			// `windows-x64`. Inside the artifact:
			//
			// - `smoke-tests-electron/smoke-test-runner.log` — the mock LLM's
			//   verbose request/response bodies (look for `request body:`)
			//   alongside the mocha test driver output.
			// - `smoke-tests-electron/<N>_suite_Agents_Window/window2/exthost/
			//   GitHub.copilot-chat/GitHub Copilot Chat.log` — the
			//   CopilotCLISession diagnostic log: `[sandboxSpawn]` lines from
			//   the runtime and `[CopilotCLISession] tool.execution_complete
			//   ... success=… sandboxed=… [error=…] content=…` lines from
			//   `_logSessionEvent` (gated by the
			//   `github.copilot.chat.cli.sessionEventLogging.enabled`
			//   setting that this suite sets in the `before` hook).
			// - `smoke-tests-electron/<N>_suite_Agents_Window/playwright-screenshot-
			//   *-Test_Copilot_CLI_session*.png` — last-frame screenshot of
			//   the Agents Window when a test fails; the JSON dump in the
			//   chat usually surfaces the raw `tool_result` payload.
			if (process.platform !== 'darwin') {
				this.skip();
			}

			const app = this.app as Application;

			await app.workbench.agentsWindow.startNewSession();
			await app.workbench.agentsWindow.waitForNewSessionView();
			await app.workbench.agentsWindow.selectSessionType('Copilot CLI');

			const requestsBefore = mockServer.requestCount();
			await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${COPILOT_SANDBOX_SCENARIO_ID}]`);

			// 120s timeout: Windows sandbox cold-start can take ~60s before the
			// shell tool returns its first output.
			const text = await app.workbench.agentsWindow.waitForAssistantText(COPILOT_SANDBOX_REPLY, 120_000);
			logger.log(`Agents Window (Copilot sandbox) response: ${text}`);

			assert.ok(
				mockServer.requestCount() > requestsBefore,
				'expected the mock LLM server to have received a new request from the Copilot sandbox session'
			);

			// Confirm the shell tool actually ran inside the sandbox.
			const chatLogPath = path.join(app.logsPath, 'window2', 'exthost', 'GitHub.copilot-chat', 'GitHub Copilot Chat.log');
			const chatLog = await fs.promises.readFile(chatLogPath, 'utf8');
			assert.match(
				chatLog,
				/\[CopilotCLISession\] tool\.execution_complete .* sandboxed=true/,
				`expected tool.execution_complete with sandboxed=true in ${chatLogPath}`
			);
		});

		it('Test Claude session', async function () {
			const app = this.app as Application;

			await app.workbench.agentsWindow.startNewSession();
			await app.workbench.agentsWindow.waitForNewSessionView();
			await app.workbench.agentsWindow.selectSessionType('Claude');

			const requestsBefore = mockServer.requestCount();
			await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${CLAUDE_SCENARIO_ID}]`);

			const text = await app.workbench.agentsWindow.waitForAssistantText(CLAUDE_REPLY);
			logger.log(`Agents Window (Claude) response: ${text}`);

			assert.ok(
				mockServer.requestCount() > requestsBefore,
				'expected the mock LLM server to have received a new request from the Claude session'
			);
		});

		it('Test Local session', async function () {
			const app = this.app as Application;

			await app.workbench.agentsWindow.startNewSession();
			await app.workbench.agentsWindow.waitForNewSessionView();
			await app.workbench.agentsWindow.selectSessionType('Local');

			const requestsBefore = mockServer.requestCount();
			await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${LOCAL_SCENARIO_ID}]`);

			const text = await app.workbench.agentsWindow.waitForAssistantText(LOCAL_REPLY);
			logger.log(`Agents Window (Local) response: ${text}`);

			assert.ok(
				mockServer.requestCount() > requestsBefore,
				'expected the mock LLM server to have received a new request from the Local session'
			);
		});
	});
}
