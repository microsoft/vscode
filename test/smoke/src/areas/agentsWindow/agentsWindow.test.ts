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

// Lightweight throwaway scenario used by {@link warmUpClaudeModel} to
// pre-pay the Claude session cold-start cost (bundled SDK import, language
// model server startup, SDK subprocess spawn, plugin loading) before the
// real assertion runs.
const CLAUDE_WARMUP_SCENARIO_ID = 'smoke-hello-claude-warmup';
const CLAUDE_WARMUP_REPLY = 'MOCKED_CLAUDE_WARMUP_RESPONSE';

const AGENT_HOST_SCENARIO_ID = 'smoke-hello-agent-host';
const AGENT_HOST_REPLY = 'MOCKED_AGENT_HOST_RESPONSE';

const AGENT_HOST_SANDBOX_SCENARIO_ID = 'smoke-hello-agent-host-sandbox';
const AGENT_HOST_SANDBOX_REPLY = 'MOCKED_AGENT_HOST_SANDBOX_RESPONSE';

const AGENT_HOST_SDK_SANDBOX_SCENARIO_ID = 'smoke-hello-agent-host-sdk-sandbox';
const AGENT_HOST_SDK_SANDBOX_REPLY = 'MOCKED_AGENT_HOST_SDK_SANDBOX_RESPONSE';

// Lightweight throwaway scenario used by {@link warmUpAgentHostModel} to
// prime the CLI model list before the real assertion. Registered in every
// AgentHost suite by {@link setupAgentHostSuite}.
const AGENT_HOST_WARMUP_SCENARIO_ID = 'smoke-hello-agent-host-warmup';
const AGENT_HOST_WARMUP_REPLY = 'MOCKED_AGENT_HOST_WARMUP_RESPONSE';

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
			registerScenario(COPILOT_SANDBOX_SCENARIO_ID, shellEchoScenario(COPILOT_SANDBOX_REPLY));
			registerScenario(LOCAL_SCENARIO_ID, new ScenarioBuilder().emit(LOCAL_REPLY).build());
			registerScenario(CLAUDE_SCENARIO_ID, new ScenarioBuilder().emit(CLAUDE_REPLY).build());
			registerScenario(CLAUDE_WARMUP_SCENARIO_ID, new ScenarioBuilder().emit(CLAUDE_WARMUP_REPLY).build());

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

		it('Test Copilot CLI session (sandbox)', async function () {
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
			// Match the JSON `output` field of the tool result in the final
			// response, not the `echo <reply>` command preview — see
			// shellEchoScenario / shellEchoResponseMatcher.
			const text = await app.workbench.agentsWindow.waitForAssistantText(shellEchoResponseMatcher(COPILOT_SANDBOX_REPLY), 120_000);
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

				// Pre-pay the Claude session cold-start cost (#321072): the first
				// Claude session in the Agents Window's extension host has to
				// bundle-load the SDK, start the localhost language model server,
				// spawn the SDK subprocess and load plugins — collectively often
				// >60s on macOS arm64 CI. A throwaway prompt absorbs that cost so
				// the real assertion below runs against a warm pipeline.
				await warmUpClaudeModel(app, logger, 'Agents Window/Claude');

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

		const agentHost = setupAgentHostSuite(logger, {
			serverLabel: 'AgentHost',
			registerScenarios: ({ ScenarioBuilder, registerScenario }) => {
				registerScenario(AGENT_HOST_SCENARIO_ID, new ScenarioBuilder().emit(AGENT_HOST_REPLY).build());
				registerScenario(AGENT_HOST_SANDBOX_SCENARIO_ID, shellEchoScenario(AGENT_HOST_SANDBOX_REPLY));
			},
			settings: {
				// AgentHost-side sandbox: customTerminalTool gates the AgentHost’s own
				// shell tools (which honor chat.agent.sandbox.*), and chat.agent.sandbox.enabled
				// turns the sandbox on for the auto-approve path used by the sandbox test.
				'chat.agentHost.customTerminalTool.enabled': true,
				'chat.agent.sandbox.enabled': 'on',
			},
		});

		it('Test Copilot CLI session via AgentHost', async function () {
			this.timeout(5 * 60 * 1000);

			const app = this.app as Application;

			try {
				await warmUpAgentHostModel(app, logger, 'Agents Window (AgentHost)');

				const requestsBefore = agentHost.mockServer.requestCount();
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${AGENT_HOST_SCENARIO_ID}]`);

				const text = await app.workbench.agentsWindow.waitForAssistantText(AGENT_HOST_REPLY);
				logger.log(`Agents Window (AgentHost) response: ${text}`);

				assert.ok(
					agentHost.mockServer.requestCount() > requestsBefore,
					'expected the mock LLM server to have received a new request from the AgentHost session'
				);

				// Confirm the request flowed through the AgentHost process (not
				// the renderer-side Copilot Chat extension fallback) by checking
				// for a `session/turnStarted` frame in the AHP JSONL transcript.
				// The transcript is written through an async queue (see
				// AhpJsonlLogger), so the frame may not be on disk yet even
				// after the assistant reply has rendered — poll briefly.
				const ahpLogDir = path.join(agentHost.logsPath, 'ahp');
				const ahpFrames = await waitForLogContent(() => readAhpFrames(ahpLogDir), '"type":"session/turnStarted"');
				assert.ok(
					ahpFrames.includes('"type":"session/turnStarted"'),
					`expected the AgentHost process to have received a session/turnStarted dispatchAction (checked ${ahpJsonlFiles(ahpLogDir).length} jsonl files under ${ahpLogDir}); if missing, the renderer-side extension likely served the reply instead`
				);
			} catch (error) {
				logger.log(`Agents Window (AgentHost) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window (AgentHost)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});

		it('Test Copilot CLI session via AgentHost (sandbox)', async function () {
			// See the Copilot CLI sandbox test above for the rationale on
			// platform gating and where to find logs when debugging CI runs.
			// The AgentHost-side sandbox log we assert on is
			// `<logsPath>/agenthost.log` (the utility-process log), produced by
			// CopilotAgentSession when it auto-approves a sandboxed shell call.
			if (process.platform !== 'darwin') {
				this.skip();
			}

			this.timeout(5 * 60 * 1000);

			const app = this.app as Application;

			try {
				await app.workbench.agentsWindow.startNewSession();
				await app.workbench.agentsWindow.waitForNewSessionView();
				await app.workbench.agentsWindow.selectSessionType('Local Agent Host');

				const requestsBefore = agentHost.mockServer.requestCount();
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${AGENT_HOST_SANDBOX_SCENARIO_ID}]`);

				// Match the JSON `output` field of the tool result in the final
				// response, not the `echo <reply>` command preview — see
				// shellEchoScenario / shellEchoResponseMatcher.
				const text = await app.workbench.agentsWindow.waitForAssistantText(shellEchoResponseMatcher(AGENT_HOST_SANDBOX_REPLY), 120_000);
				logger.log(`Agents Window (AgentHost sandbox) response: ${text}`);

				assert.ok(
					agentHost.mockServer.requestCount() > requestsBefore,
					'expected the mock LLM server to have received a new request from the AgentHost sandbox session'
				);

				// Confirm the command actually ran through the AgentHost's OWN shell
				// engine (the `createShellTools` path, wrapped by its
				// TerminalSandboxEngine) — not the SDK. Evidence in `agenthost.log`:
				//   - `Auto-approving sandboxed shell command` — the engine reported
				//     the command is sandboxed by default, so the prompt was skipped.
				//   - `[ShellManager] Created <shell> shell` — the AgentHost-provided
				//     shell tool executed the command (emitted when it runs, i.e.
				//     after auto-approve, so poll for this one).
				//   - NO `Applied SDK sandboxConfig` — the SDK sandbox path was not
				//     taken (custom terminal tool is on, so we don't push to the SDK).
				// The log is written through an async queue, so poll until it lands.
				const agentHostLogPath = path.join(agentHost.logsPath, 'agenthost.log');
				const engineShellRun = /\[ShellManager\] Created \w+ shell /;
				const agentHostLog = await waitForLogContent(() => readFileIfExists(agentHostLogPath), engineShellRun);
				assert.match(
					agentHostLog,
					/\[Copilot:[^\]]+\] Auto-approving sandboxed shell command for tool call /,
					`expected an "Auto-approving sandboxed shell command" entry in ${agentHostLogPath}`
				);
				assert.match(
					agentHostLog,
					engineShellRun,
					`expected the AgentHost's own shell engine ([ShellManager]) to have run the command in ${agentHostLogPath}`
				);
				assert.doesNotMatch(
					agentHostLog,
					/Applied SDK sandboxConfig/,
					`did not expect the SDK sandbox path (Applied SDK sandboxConfig) when the custom terminal tool is enabled, in ${agentHostLogPath}`
				);
			} catch (error) {
				logger.log(`Agents Window (AgentHost sandbox) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window (AgentHost sandbox)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});
	});

	describe('Agents Window (local AgentHost, SDK sandbox)', () => {

		// Variant of the AgentHost suite that leaves
		// `chat.agentHost.customTerminalTool.enabled` at its default (false), so
		// the SDK’s built-in shell tool runs commands. The AgentHost forwards
		// `chat.agent.sandbox.*` into the SDK via `session.options.update`
		// (mirroring how the Copilot extension configures the CLI sandbox), so
		// shell commands still run mxc-wrapped and the SDK’s pre-call shell
		// permission prompt is auto-approved on the same code path as the
		// custom-terminal-tool variant above.

		const agentHost = setupAgentHostSuite(logger, {
			serverLabel: 'AgentHost SDK sandbox',
			registerScenarios: ({ registerScenario }) => {
				registerScenario(AGENT_HOST_SDK_SANDBOX_SCENARIO_ID, shellEchoScenario(AGENT_HOST_SDK_SANDBOX_REPLY));
			},
			settings: {
				// customTerminalTool intentionally OFF (default) — the SDK runs
				// the shell tool, and the AgentHost is expected to forward
				// `chat.agent.sandbox.*` into the SDK so commands still run
				// sandboxed. The SDK-sandbox gate defaults to 'off'; set it
				// to 'on' explicitly so the test exercises the SDK sandbox
				// override path.
				'chat.agentHost.sdkSandbox.enabled': 'on',
				'chat.agent.sandbox.enabled': 'on',
			},
		});

		it('Test Copilot CLI session via AgentHost (SDK sandbox)', async function () {
			// See the Copilot CLI sandbox test above for the rationale on
			// platform gating and where to find logs when debugging CI runs.
			// The AgentHost-side sandbox log we assert on is
			// `<logsPath>/agenthost.log` (the utility-process log), produced by
			// CopilotAgentSession when it auto-approves a sandboxed shell call.
			if (process.platform !== 'darwin') {
				this.skip();
			}

			this.timeout(5 * 60 * 1000);

			const app = this.app as Application;

			try {
				await warmUpAgentHostModel(app, logger, 'Agents Window (AgentHost SDK sandbox)');

				const requestsBefore = agentHost.mockServer.requestCount();
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${AGENT_HOST_SDK_SANDBOX_SCENARIO_ID}]`);

				// Match the JSON `output` field of the tool result in the final
				// response, not the `echo <reply>` command preview — see
				// shellEchoScenario / shellEchoResponseMatcher.
				const text = await app.workbench.agentsWindow.waitForAssistantText(shellEchoResponseMatcher(AGENT_HOST_SDK_SANDBOX_REPLY), 120_000);
				logger.log(`Agents Window (AgentHost SDK sandbox) response: ${text}`);

				assert.ok(
					agentHost.mockServer.requestCount() > requestsBefore,
					'expected the mock LLM server to have received a new request from the AgentHost SDK sandbox session'
				);

				// Confirm the command ran through the SDK's built-in shell under the
				// sandbox policy we pushed — NOT the AgentHost's own engine. Evidence
				// in `agenthost.log`:
				//   1. `Applied SDK sandboxConfig via session.options.update` — the
				//      AgentHost pushed the mxc policy to the SDK.
				//   2. `Auto-approving sandboxed shell command` — the SDK-side branch
				//      of `_isShellSandboxedByDefault` confirmed the sandbox config
				//      resolves to enabled, so the pre-call prompt was skipped.
				//   3. NO `[ShellManager]` line — the AgentHost provided no shell tool
				//      (customTerminalTool is off), so the SDK, not our engine, ran it.
				// Poll for the auto-approve entry (the later of 1 & 2).
				const agentHostLogPath = path.join(agentHost.logsPath, 'agenthost.log');
				const autoApprove = /\[Copilot:[^\]]+\] Auto-approving sandboxed shell command for tool call /;
				const agentHostLog = await waitForLogContent(() => readFileIfExists(agentHostLogPath), autoApprove);
				assert.match(
					agentHostLog,
					/\[Copilot:[^\]]+\] Applied SDK sandboxConfig via session\.options\.update/,
					`expected an "Applied SDK sandboxConfig" entry in ${agentHostLogPath}`
				);
				assert.match(
					agentHostLog,
					autoApprove,
					`expected an "Auto-approving sandboxed shell command" entry in ${agentHostLogPath}`
				);
				assert.doesNotMatch(
					agentHostLog,
					/\[ShellManager\] Created \w+ shell /,
					`did not expect the AgentHost's own shell engine ([ShellManager]) to run the command on the SDK sandbox path, in ${agentHostLogPath}`
				);
			} catch (error) {
				logger.log(`Agents Window (AgentHost SDK sandbox) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window (AgentHost SDK sandbox)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});
	});
}

/**
 * Builds a two-turn mock scenario that exercises a sandboxed shell tool: the
 * model first runs `echo <reply>` via the bash/pwsh/powershell tool, then —
 * after the tool result round-trips — replays the last (tool-result) message
 * back as a ```json fenced block via `echo-last-message`.
 *
 * The reply text therefore appears in two kinds of `.rendered-markdown`
 * elements (both searched by {@link AgentsWindow.waitForAssistantText}):
 *   1. the terminal tool-call's command preview — rendered as `echo <reply>`
 *      (the bareword, no surrounding quotes), and
 *   2. the final assistant response — the JSON dump of the tool result, an
 *      object whose `output` field holds the echoed `<reply>` (possibly with
 *      a prefix, e.g. shell-integration noise, and an `<exited ...>` suffix).
 * To assert on the real response (2) and not the command preview (1), callers
 * match with {@link shellEchoResponseMatcher} — see the sandbox tests.
 */
function shellEchoScenario(reply: string) {
	return {
		type: 'multi-turn',
		turns: [
			{
				kind: 'tool-calls',
				toolCalls: [
					{
						toolNamePattern: /^(bash|pwsh|powershell)$/i,
						arguments: { command: `echo ${reply}` },
					},
				],
			},
			{ kind: 'echo-last-message' },
		],
	};
}

/**
 * Builds the {@link AgentsWindow.waitForAssistantText} matcher for a
 * {@link shellEchoScenario} reply. The final response renders the tool result
 * as a ```json block of the form
 * `{ ..., "output": "<reply>\n<exited with exit code 0>" }`, so anchoring on
 * `"output": ... <reply>` matches that JSON value specifically — not the
 * `echo <reply>` command preview (which has no `"output"` field) — while still
 * tolerating any prefix inside the captured output (e.g. shell-integration
 * noise). `<reply>` contains no regex metacharacters.
 */
function shellEchoResponseMatcher(reply: string): RegExp {
	return new RegExp(`"output":.*${reply}`);
}

/**
 * Primes a freshly-spawned AgentHost process's CLI model list to avoid the
 * cold-start "No model available" race (github/copilot-agent-runtime#9876):
 * the very first query in the process lifetime can reach the CLI before its
 * model list has resolved, surfacing as a `session/error`. A throwaway
 * session resolves it because the model list is cached by then.
 *
 * Assumes the Agents Window is showing a new-session view. Sends a throwaway
 * prompt, ignores its outcome, then leaves a fresh new-session view with
 * 'Local Agent Host' selected so the caller can submit the real prompt
 * against an already-warmed model list.
 */
async function warmUpAgentHostModel(app: Application, logger: Logger, label: string): Promise<void> {
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Local Agent Host');
	await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${AGENT_HOST_WARMUP_SCENARIO_ID}]`);
	try {
		await app.workbench.agentsWindow.waitForAssistantText(AGENT_HOST_WARMUP_REPLY, 30_000);
	} catch (error) {
		// Ignore — the warm-up itself may hit the cold-start race; the caller's
		// real attempt runs against an already-warmed model list.
		logger.log(`${label} warm-up attempt did not produce the expected reply (likely the cold-start race); proceeding with the real attempt. Reason: ${error instanceof Error ? error.message : String(error)}`);
	}
	await app.workbench.agentsWindow.startNewSession();
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Local Agent Host');
}

/**
 * Pre-pays the Claude session cold-start cost (#321072): the first Claude
 * session in a fresh Agents Window extension host has to first-import the
 * bundled `@anthropic-ai/claude-agent-sdk`, start a localhost
 * `ClaudeLanguageModelServer`, spawn the SDK subprocess and load plugins
 * (8 from skill locations) before the first /messages request can complete.
 * On a busy macOS arm64 CI runner this can collectively exceed the default
 * 60s {@link AgentsWindow.waitForAssistantText} timeout, surfacing as a
 * `:not(.chat-response-loading)` selector timeout.
 *
 * Assumes the Agents Window is showing a new-session view. Sends a throwaway
 * prompt to a 'Claude' session, ignores its outcome (the warm-up itself may
 * hit the cold start), then leaves a fresh new-session view with 'Claude'
 * selected so the caller can submit the real prompt against a warm pipeline.
 */
async function warmUpClaudeModel(app: Application, logger: Logger, label: string): Promise<void> {
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Claude');
	await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${CLAUDE_WARMUP_SCENARIO_ID}]`);
	try {
		// 60s mirrors the default response wait — long enough to absorb the
		// cold-start observed at ~60s in #321072, but not so long that a hung
		// pipeline blocks the test from making forward progress.
		await app.workbench.agentsWindow.waitForAssistantText(CLAUDE_WARMUP_REPLY, 60_000);
	} catch (error) {
		// Ignore — the warm-up itself may hit the cold-start race; the
		// caller's real attempt runs against an already-warmed pipeline.
		logger.log(`${label} warm-up attempt did not produce the expected reply (likely the cold-start race); proceeding with the real attempt. Reason: ${error instanceof Error ? error.message : String(error)}`);
	}
	await app.workbench.agentsWindow.startNewSession();
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Claude');
}

/**
 * Accessors for the per-suite state owned by {@link setupAgentHostSuite}.
 * Implemented with getters so tests read the values populated by the
 * `before` hooks (which run after the suite body registers the tests).
 */
interface IAgentHostSuiteContext {
	readonly mockServer: MockLlmServer;
	readonly logsPath: string;
}

/**
 * Installs the shared `before`/`after` hooks for a "local AgentHost" smoke
 * suite: starts the mock LLM server, creates the app with the AgentHost env
 * vars, pre-seeds `settings.json` into both the default and Agents profiles,
 * and opens the workspace folder in the Agents Window.
 *
 * The only per-suite differences are the registered scenarios and the
 * sandbox-related settings overlay, so those are passed in.
 */
function setupAgentHostSuite(logger: Logger, config: {
	readonly serverLabel: string;
	readonly registerScenarios: (api: { ScenarioBuilder: any; registerScenario: (id: string, scenario: unknown) => void }) => void;
	readonly settings: Record<string, unknown>;
}): IAgentHostSuiteContext {
	let mockServer: MockLlmServer;
	let logsPath: string;

	before(async function () {
		const { startServer, ScenarioBuilder, registerScenario } = require(getMockLlmServerPath());

		registerScenario('text-only', new ScenarioBuilder().emit('OK').build());
		registerScenario(AGENT_HOST_WARMUP_SCENARIO_ID, new ScenarioBuilder().emit(AGENT_HOST_WARMUP_REPLY).build());
		config.registerScenarios({ ScenarioBuilder, registerScenario });

		mockServer = await startServer(0, { logger: (msg: string) => logger.log(msg), verbose: true });
		logger.log(`Mock LLM server (${config.serverLabel}) started at ${mockServer.url}`);
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

		// Pre-seed settings.json on disk into BOTH the default profile and the
		// Agents profile. Writing settings after the workbench is up would race
		// with AgentHostContribution’s startup (it gates on
		// `chat.agentHost.enabled` at construction).
		const userDataDir = (this.app as Application).userDataPath;
		if (userDataDir) {
			const settings = JSON.stringify({
				'github.copilot.advanced.debug.overrideProxyUrl': mockServer.url,
				'chat.allowAnonymousAccess': true,
				'github.copilot.chat.githubMcpServer.enabled': false,
				'chat.agentHost.enabled': true,
				'chat.agentHost.ahpJsonlLoggingEnabled': true,
				'chat.agentHost.unsafeTestToken': 'smoketest-fake-agent-host-token',
				...config.settings,
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
		const windowsBefore = app.code.driver.getAllWindows().length;
		await app.workbench.agentsWindow.openCurrentFolderInAgentsWindow();
		await app.workbench.agentsWindow.switchToAgentsWindow(windowsBefore);
	});

	after(async function () {
		if (mockServer) {
			await mockServer.close();
		}
	});

	return {
		get mockServer() { return mockServer; },
		get logsPath() { return logsPath; },
	};
}

/**
 * Polls `readContent` until it returns a string matching `matcher` or the
 * timeout elapses, then returns the last content read. Log files in these
 * suites are written through async queues (e.g. AhpJsonlLogger), so an entry
 * may not be on disk yet even after the assistant reply has rendered.
 */
async function waitForLogContent(readContent: () => string, matcher: RegExp | string, timeoutMs = 5_000): Promise<string> {
	const matches = (content: string) => typeof matcher === 'string' ? content.includes(matcher) : matcher.test(content);
	const deadline = Date.now() + timeoutMs;
	let content = readContent();
	while (!matches(content) && Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, 100));
		content = readContent();
	}
	return content;
}

/** Reads a file, returning '' if it does not exist yet. */
function readFileIfExists(filePath: string): string {
	return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

/** Lists the `.jsonl` transcript files in an AHP log directory. */
function ahpJsonlFiles(ahpLogDir: string): string[] {
	return fs.existsSync(ahpLogDir) ? fs.readdirSync(ahpLogDir).filter(f => f.endsWith('.jsonl')) : [];
}

/** Concatenates every AHP JSONL transcript in `ahpLogDir` into one string. */
function readAhpFrames(ahpLogDir: string): string {
	return ahpJsonlFiles(ahpLogDir).map(f => fs.readFileSync(path.join(ahpLogDir, f), 'utf8')).join('\n');
}
