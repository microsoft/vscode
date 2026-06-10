/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Application, ApplicationOptions, Logger } from '../../../../automation';
import { createApp, dumpFailureDiagnostics, getCopilotSmokeTestEnv, getMockLlmServerPath, installAppAfterHandler, installDiagnosticsHandler, installAllHandlers, MockLlmServer, suiteCrashPath, suiteLogsPath } from '../../utils';

// Selector for the send button in the Agents Window new-session homepage.
// Kept in sync with `SEND_BUTTON_ENABLED` in `test/automation/src/agentsWindow.ts`
// (without the `:not(.disabled)` filter so we can observe the disabled state).
const AGENTS_SEND_BUTTON_SELECTOR = '.sessions-chat-widget .new-chat-widget-container .sessions-chat-send-button .monaco-button';

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

const AGENT_HOST_SCENARIO_ID = 'smoke-hello-agent-host';
const AGENT_HOST_REPLY = 'MOCKED_AGENT_HOST_RESPONSE';

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

			mockServer = await startServer(0, { logger: (msg: string) => logger.log(`[mock-llm] ${msg}`), verbose: true });
			logger.log(`[Agents Window] mock LLM server started at ${mockServer.url} (platform=${process.platform}, arch=${process.arch}, node=${process.version})`);
			logger.log(`[Agents Window] env: VSCODE_DEV=${process.env.VSCODE_DEV ?? '<unset>'}, VSCODE_QUALITY=${process.env.VSCODE_QUALITY ?? '<unset>'}, BUILD_SOURCEBRANCH=${process.env.BUILD_SOURCEBRANCH ?? '<unset>'}, GITHUB_RUN_ID=${process.env.GITHUB_RUN_ID ?? '<unset>'}, GITHUB_ACTIONS=${process.env.GITHUB_ACTIONS ?? '<unset>'}`);
		});

		installAllHandlers(logger, opts => {
			const copilotEnv = getCopilotSmokeTestEnv(mockServer);
			logger.log(`[Agents Window] extraEnv keys for app: ${Object.keys(copilotEnv).join(', ')} (token len=${(copilotEnv.VSCODE_COPILOT_CHAT_TOKEN ?? '').length})`);
			return {
				...opts,
				extraEnv: {
					...(opts.extraEnv ?? {}),
					...copilotEnv,
				},
			};
		});

		before(async function () {
			// One-time setup: write VS Code settings and open the Agents Window
			// with the smoke-test workspace folder pre-selected. Subsequent tests
			// reuse this window and just start fresh sessions.
			const app = this.app as Application;
			logger.log(`[Agents Window] one-time setup begin; workspace=${app.workspacePathOrFolder}; mock URL=${mockServer.url}; requestCount=${mockServer.requestCount()}`);

			// Reset any uncommitted changes left by earlier smoke test suites
			// (e.g. the Tasks test modifies .vscode/tasks.json). A dirty
			// workspace prevents worktree creation and triggers the
			// "uncommitted changes" confirmation flow which aborts the session.
			cp.execSync('git checkout . --quiet', { cwd: app.workspacePathOrFolder });
			logger.log(`[Agents Window] reset workspace via 'git checkout .'`);

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
			logger.log(`[Agents Window] user settings written; requestCount=${mockServer.requestCount()}`);

			// `--enable-smoke-test-driver` (set by the runner) skips the auth dialog.
			const windowsBefore = app.code.driver.getAllWindows().length;
			logger.log(`[Agents Window] windowsBefore=${windowsBefore}; opening current folder in Agents Window`);
			await app.workbench.agentsWindow.openCurrentFolderInAgentsWindow();
			logger.log(`[Agents Window] command dispatched; awaiting new Agents Window to appear (current windows=${app.code.driver.getAllWindows().length})`);
			await app.workbench.agentsWindow.switchToAgentsWindow(windowsBefore);
			logger.log(`[Agents Window] switched to Agents Window (current windows=${app.code.driver.getAllWindows().length}); requestCount=${mockServer.requestCount()}`);
		});

		after(async function () {
			if (mockServer) {
				logger.log(`[Agents Window] closing mock LLM server; total requestCount=${mockServer.requestCount()}`);
				await mockServer.close();
			}
		});

		it('Test Copilot CLI session', async function () {
			const app = this.app as Application;
			logger.log(`[Agents Window/Copilot] starting test; requestCount=${mockServer.requestCount()}`);

			try {
				logger.log(`[Agents Window/Copilot] waiting for new session view`);
				await app.workbench.agentsWindow.waitForNewSessionView();
				logger.log(`[Agents Window/Copilot] selecting session type 'Copilot CLI'`);
				await app.workbench.agentsWindow.selectSessionType('Copilot CLI');

				const requestsBefore = mockServer.requestCount();
				logger.log(`[Agents Window/Copilot] submitting prompt; requestCount=${requestsBefore}`);
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${COPILOT_SCENARIO_ID}]`);
				logger.log(`[Agents Window/Copilot] prompt submitted; waiting for assistant text '${COPILOT_REPLY}'; requestCount=${mockServer.requestCount()}`);

				const text = await app.workbench.agentsWindow.waitForAssistantText(COPILOT_REPLY);
				logger.log(`[Agents Window/Copilot] response (length=${text.length}): ${text}`);
				logger.log(`[Agents Window/Copilot] mock server requestCount after response: ${mockServer.requestCount()} (before=${requestsBefore})`);

				assert.ok(
					mockServer.requestCount() > requestsBefore,
					`expected the mock LLM server to have received a new request from the Copilot session (before=${requestsBefore}, after=${mockServer.requestCount()})`
				);
			} catch (error) {
				logger.log(`[Agents Window/Copilot] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				logger.log(`[Agents Window/Copilot] mock server requestCount at failure: ${mockServer.requestCount()}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window/Copilot', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
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
			logger.log(`[Agents Window/Claude] starting test; requestCount=${mockServer.requestCount()}`);

			try {
				logger.log(`[Agents Window/Claude] starting new session (Ctrl+L)`);
				await app.workbench.agentsWindow.startNewSession();
				logger.log(`[Agents Window/Claude] waiting for new session view`);
				await app.workbench.agentsWindow.waitForNewSessionView();
				logger.log(`[Agents Window/Claude] selecting session type 'Claude'`);
				await app.workbench.agentsWindow.selectSessionType('Claude');

				const requestsBefore = mockServer.requestCount();
				logger.log(`[Agents Window/Claude] submitting prompt; requestCount=${requestsBefore}`);
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${CLAUDE_SCENARIO_ID}]`);
				logger.log(`[Agents Window/Claude] prompt submitted; waiting for assistant text '${CLAUDE_REPLY}'; requestCount=${mockServer.requestCount()}`);

				const text = await app.workbench.agentsWindow.waitForAssistantText(CLAUDE_REPLY);
				logger.log(`[Agents Window/Claude] response (length=${text.length}): ${text}`);
				logger.log(`[Agents Window/Claude] mock server requestCount after response: ${mockServer.requestCount()} (before=${requestsBefore})`);

				assert.ok(
					mockServer.requestCount() > requestsBefore,
					`expected the mock LLM server to have received a new request from the Claude session (before=${requestsBefore}, after=${mockServer.requestCount()})`
				);
			} catch (error) {
				logger.log(`[Agents Window/Claude] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				logger.log(`[Agents Window/Claude] mock server requestCount at failure: ${mockServer.requestCount()}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window/Claude', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});

		it('Test Local session', async function () {
			const app = this.app as Application;
			logger.log(`[Agents Window/Local] starting test; requestCount=${mockServer.requestCount()}`);

			try {
				logger.log(`[Agents Window/Local] starting new session (Ctrl+L)`);
				await app.workbench.agentsWindow.startNewSession();
				logger.log(`[Agents Window/Local] waiting for new session view`);
				await app.workbench.agentsWindow.waitForNewSessionView();
				logger.log(`[Agents Window/Local] selecting session type 'Local'`);
				await app.workbench.agentsWindow.selectSessionType('Local');

				const requestsBefore = mockServer.requestCount();
				logger.log(`[Agents Window/Local] submitting prompt; requestCount=${requestsBefore}`);
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${LOCAL_SCENARIO_ID}]`);
				logger.log(`[Agents Window/Local] prompt submitted; waiting for assistant text '${LOCAL_REPLY}'; requestCount=${mockServer.requestCount()}`);

				const text = await app.workbench.agentsWindow.waitForAssistantText(LOCAL_REPLY);
				logger.log(`[Agents Window/Local] response (length=${text.length}): ${text}`);
				logger.log(`[Agents Window/Local] mock server requestCount after response: ${mockServer.requestCount()} (before=${requestsBefore})`);

				assert.ok(
					mockServer.requestCount() > requestsBefore,
					`expected the mock LLM server to have received a new request from the Local session (before=${requestsBefore}, after=${mockServer.requestCount()})`
				);
			} catch (error) {
				logger.log(`[Agents Window/Local] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				logger.log(`[Agents Window/Local] mock server requestCount at failure: ${mockServer.requestCount()}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window/Local', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});
	});

	describe('Agents Window (local AgentHost)', () => {

		let mockServer: MockLlmServer;
		let logsPath: string;

		before(async function () {
			const { startServer, ScenarioBuilder, registerScenario } = require(getMockLlmServerPath());

			registerScenario('text-only', new ScenarioBuilder().emit('OK').build());
			registerScenario(AGENT_HOST_SCENARIO_ID, new ScenarioBuilder().emit(AGENT_HOST_REPLY).build());

			mockServer = await startServer(0, { logger: (msg: string) => logger.log(msg) });
			logger.log(`Mock LLM server (AgentHost) started at ${mockServer.url}`);
		});

		installDiagnosticsHandler(logger);

		before(async function () {
			const suiteName = this.test?.parent?.title ?? 'unknown';
			const defaultOptions: ApplicationOptions = {
				...this.defaultOptions,
				logsPath: suiteLogsPath(this.defaultOptions, suiteName),
				crashesPath: suiteCrashPath(this.defaultOptions, suiteName),
			};
			logsPath = defaultOptions.logsPath;
			this.app = createApp(defaultOptions, opts => ({
				...opts,
				extraEnv: {
					...(opts.extraEnv ?? {}),
					...getCopilotSmokeTestEnv(mockServer),
					COPILOT_ENABLE_ALT_PROVIDERS: 'true',
					COPILOT_API_URL: mockServer.url,
					COPILOT_DEBUG_GITHUB_API_URL: mockServer.url,
					GITHUB_COPILOT_API_TOKEN: 'smoketest-fake-agent-host-token',
				},
			}));

			// Pre-seed settings.json on disk into BOTH the default profile and the Agents profile.
			const userDataDir = (this.app as Application).userDataPath;
			if (userDataDir) {
				const settings = JSON.stringify({
					'github.copilot.advanced.debug.overrideProxyUrl': mockServer.url,
					'chat.allowAnonymousAccess': true,
					'github.copilot.chat.githubMcpServer.enabled': false,
					'chat.agentHost.enabled': true,
					'chat.agentHost.ahpJsonlLoggingEnabled': true,
					'chat.agentHost.unsafeTestToken': 'smoketest-fake-agent-host-token',
				}, null, 2);
				for (const settingsPath of [
					path.join(userDataDir, 'User', 'settings.json'),
					path.join(userDataDir, 'User', 'profiles', 'builtin', 'agents', 'settings.json'),
				]) {
					fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
					fs.writeFileSync(settingsPath, settings);
				}
			}

			await (this.app as Application).start();
		});

		installAppAfterHandler();

		before(async function () {
			const app = this.app as Application;

			cp.execSync('git checkout . --quiet', { cwd: app.workspacePathOrFolder });

			// Settings are pre-seeded to disk via `optionsTransform` above; no
			// `addUserSettings` call here because writing settings after the
			// workbench is up would race with AgentHostContribution’s startup
			// (it gates on `chat.agentHost.enabled` at construction).

			const windowsBefore = app.code.driver.getAllWindows().length;
			await app.workbench.agentsWindow.openCurrentFolderInAgentsWindow();
			await app.workbench.agentsWindow.switchToAgentsWindow(windowsBefore);
		});

		after(async function () {
			if (mockServer) {
				await mockServer.close();
			}
		});

		it('Test Copilot CLI session via AgentHost', async function () {
			this.timeout(5 * 60 * 1000);

			const app = this.app as Application;

			const requestsBefore = mockServer.requestCount();
			await app.workbench.agentsWindow.waitForNewSessionView();
			await app.workbench.agentsWindow.selectSessionType('Local Agent Host');

			// The very first query in the AgentHost process lifetime can reach
			// the CLI before its model list has resolved, surfacing as a
			// `session/error` ("No model available. Check policy enablement ...")
			// — a cold-start race (github/copilot-agent-runtime#9876). A fresh
			// session resolves it because the model list is cached by then, so
			// send a throwaway warm-up prompt first and ignore its outcome,
			// then assert on a second session.
			await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${AGENT_HOST_SCENARIO_ID}]`);
			try {
				await app.workbench.agentsWindow.waitForAssistantText(AGENT_HOST_REPLY, 30_000);
			} catch (error) {
				// Ignore — the warm-up may hit the cold-start race; the real
				// attempt below runs against an already-warmed model list.
				logger.log(`Agents Window (AgentHost) warm-up attempt did not produce the expected reply (likely the cold-start race); proceeding with the real attempt. Reason: ${error instanceof Error ? error.message : String(error)}`);
			}

			await app.workbench.agentsWindow.startNewSession();
			await app.workbench.agentsWindow.waitForNewSessionView();
			await app.workbench.agentsWindow.selectSessionType('Local Agent Host');
			// May intermittently hit the CLI cold-start "No model available" race: github/copilot-agent-runtime#9876
			await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${AGENT_HOST_SCENARIO_ID}]`);

			const text = await app.workbench.agentsWindow.waitForAssistantText(AGENT_HOST_REPLY);
			logger.log(`Agents Window (AgentHost) response: ${text}`);

			assert.ok(
				mockServer.requestCount() > requestsBefore,
				'expected the mock LLM server to have received a new request from the AgentHost session'
			);

			// Confirm the request flowed through the AgentHost process (not
			// the renderer-side Copilot Chat extension fallback) by checking
			// for a `session/turnStarted` frame in the AHP JSONL transcript.
			// The transcript is written through an async queue (see
			// AhpJsonlLogger), so the frame may not be on disk yet even
			// after the assistant reply has rendered — poll briefly.
			const ahpLogDir = path.join(logsPath, 'ahp');
			const deadline = Date.now() + 5_000;
			let ahpEntries: string[] = [];
			let ahpFrames = '';
			while (Date.now() < deadline) {
				ahpEntries = fs.existsSync(ahpLogDir)
					? fs.readdirSync(ahpLogDir).filter(f => f.endsWith('.jsonl'))
					: [];
				ahpFrames = ahpEntries
					.map(f => fs.readFileSync(path.join(ahpLogDir, f), 'utf8'))
					.join('\n');
				if (ahpFrames.includes('"type":"session/turnStarted"')) {
					break;
				}
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			assert.ok(
				ahpFrames.includes('"type":"session/turnStarted"'),
				`expected the AgentHost process to have received a session/turnStarted dispatchAction (checked ${ahpEntries.length} jsonl files under ${ahpLogDir}); if missing, the renderer-side extension likely served the reply instead`
			);
		});
	});
}
