/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Application, ApplicationOptions, Logger } from '../../../../automation';
import { createApp, dumpFailureDiagnostics, getCopilotSmokeTestEnv, getMockLlmServerPath, getMockLlmServerUrl, installAppAfterHandler, installDiagnosticsHandler, installAllHandlers, MockLlmServer, suiteCrashPath, suiteLogsPath } from '../../utils';
import { shellEchoResponseMatcher, shellEchoScenario } from '../chat/shellScenarios';

// Selector for the send button in the Agents Window new-session homepage.
// Kept in sync with `SEND_BUTTON_ENABLED` in `test/automation/src/agentsWindow.ts`
// (without the `:not(.disabled)` filter so we can observe the disabled state).
const AGENTS_SEND_BUTTON_SELECTOR = '.sessions-chat-widget .new-chat-widget-container .sessions-chat-send-button .monaco-button';
const NETWORK_PROXY_HEADER_NAME = 'X-VSCode-Smoke-Proxy';

function mockServerStartOptions(logger: (message: string) => void, captureRequests = false) {
	const requiredRequestHeaderValue = process.env.VSCODE_SMOKE_TEST_PROXY_HEADER;
	return {
		logger,
		verbose: true,
		captureRequests,
		requiredRequestHeader: requiredRequestHeaderValue ? { name: NETWORK_PROXY_HEADER_NAME, value: requiredRequestHeaderValue } : undefined,
		trustedRequestHost: requiredRequestHeaderValue ? process.env.VSCODE_SMOKE_TEST_MOCK_HOST : undefined,
	};
}

/**
 * Per-session scenarios. Each session uses a pair of unique scenario ids so
 * that the mock reply is distinct — this catches stale-content bugs where a
 * previous response is mistakenly accepted as the current one. We send two
 * prompts per session to also exercise the follow-up message path.
 */
interface SessionConfig {
	readonly name: string;
	readonly scenarioId: string;
	readonly reply: string;
	readonly scenarioId2: string;
	readonly reply2: string;
	/** Skip the second message/assertion (e.g. while a known flake is being investigated). */
	readonly skipReply2?: boolean;
}

const SESSIONS: readonly SessionConfig[] = [
	{ name: 'Copilot', scenarioId: 'smoke-hello-copilot', reply: 'MOCKED_COPILOT_RESPONSE', scenarioId2: 'smoke-hello-copilot-2', reply2: 'MOCKED_COPILOT_RESPONSE_2' },
	{ name: 'Claude', scenarioId: 'smoke-hello-claude', reply: 'MOCKED_CLAUDE_RESPONSE', scenarioId2: 'smoke-hello-claude-2', reply2: 'MOCKED_CLAUDE_RESPONSE_2' },
	{ name: 'Local', scenarioId: 'smoke-hello-local', reply: 'MOCKED_LOCAL_RESPONSE', scenarioId2: 'smoke-hello-local-2', reply2: 'MOCKED_LOCAL_RESPONSE_2' },
];

const COPILOT_SANDBOX_SCENARIO_ID = 'smoke-hello-copilot-sandbox';
const COPILOT_SANDBOX_REPLY = 'MOCKED_COPILOT_SANDBOX_RESPONSE';

const CODEX_SCENARIO_ID = 'smoke-hello-codex';
const CODEX_REPLY = 'MOCKED_CODEX_RESPONSE';

// Lightweight throwaway scenario used by {@link warmUpCodexModel} to pre-pay
// the Codex session cold-start cost (native codex app-server spawn + model
// list resolution) before the real assertion runs.
const CODEX_WARMUP_SCENARIO_ID = 'smoke-hello-codex-warmup';
const CODEX_WARMUP_REPLY = 'MOCKED_CODEX_WARMUP_RESPONSE';

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

// --- Model configuration (Local session) ---

/**
 * Display name of the dedicated mock model that advertises both a Thinking
 * Effort and a Context Size picker (see `mock-config-model` in the mock
 * server). Selected in the Agents Window's active-session model picker by the
 * `Agents Window (model configuration)` suite.
 */
const MODEL_CONFIG_MODEL_NAME = 'Mock Config Model';

/**
 * Model id the mock server advertises for {@link MODEL_CONFIG_MODEL_NAME}. Used
 * to single out the main agent `/responses` request from ancillary requests
 * (e.g. title generation) that may also carry the conversation history.
 */
const MODEL_CONFIG_MODEL_ID = 'mock-config-model';

// Warm-up scenario for the model-configuration suite: the first Local message
// activates copilot-chat in the Agents Window exthost and registers the
// models, which populates the model picker, and creates the active session
// whose input hosts the model + config pickers.
const MODEL_CONFIG_WARMUP_SCENARIO_ID = 'smoke-agents-model-config-warmup';
const MODEL_CONFIG_WARMUP_REPLY = 'MOCKED_AGENTS_MODEL_CONFIG_WARMUP';

/**
 * A chat request captured by the mock LLM server, exposed via
 * {@link MockServerWithRequests.getRequests}.
 */
interface CapturedRequest {
	readonly path: string;
	readonly method: string;
	readonly body: any;
}

/**
 * The mock server handle plus the request-capture accessor the perf/smoke
 * harness exposes (see `scripts/chat-simulation/common/mock-llm-server.ts`).
 */
interface MockServerWithRequests extends MockLlmServer {
	getRequests(): CapturedRequest[];
}

/**
 * Combinations of model-configuration picker selections to exercise. Each case
 * selects a Thinking Effort and a Context Size in the model-picker UI, sends a
 * tagged prompt, and verifies the values the mock server received in the
 * `/responses` request body:
 * - reasoning effort → `body.reasoning.effort`
 * - context size → `body.context_management[0].compact_threshold`
 *
 * Numbers mirror a GPT-5.5-class model. The compaction threshold is
 * `floor(maxPromptTokens * 0.9)`. The default tier exposes a 272000 prompt
 * window (→ 244800). The long tier is the full window minus the 128000 output
 * reserve — `1050000 - 128000 = 922000` (→ 829800); note `formatTokenCount`
 * renders 922000 as "1M" (its `>900K → 1M` branch). The context-usage gauge
 * total is `maxInputTokens(tier) + maxOutputTokens`, i.e. `272000 + 128000 =
 * 400000` ("400K") and `922000 + 128000 = 1050000` ("1M").
 */
interface ModelConfigCase {
	readonly name: string;
	readonly effortLabel: string;
	readonly expectedEffort: string;
	readonly contextLabel: string;
	readonly expectedCompactThreshold: number;
	/**
	 * The context-window denominator the context-usage gauge details popup should
	 * show after this case's selection (the gauge total is
	 * `maxInputTokens(tier) + maxOutputTokens`, formatted via `formatTokenCount`).
	 */
	readonly expectedContextWindowLabel: string;
	readonly scenarioId: string;
	readonly reply: string;
}

const MODEL_CONFIG_CASES: readonly ModelConfigCase[] = [
	{ name: 'Low effort, default context', effortLabel: 'Low', expectedEffort: 'low', contextLabel: '272K', expectedCompactThreshold: 244_800, expectedContextWindowLabel: '400K', scenarioId: 'smoke-agents-model-config-low-default', reply: 'MOCKED_AGENTS_MODEL_CONFIG_LOW_DEFAULT' },
	{ name: 'High effort, full context', effortLabel: 'High', expectedEffort: 'high', contextLabel: '1M', expectedCompactThreshold: 829_800, expectedContextWindowLabel: '1M', scenarioId: 'smoke-agents-model-config-high-long', reply: 'MOCKED_AGENTS_MODEL_CONFIG_HIGH_LONG' },
];

/**
 * Find the latest `/responses` request (at or after `fromIndex`) sent for the
 * mock model whose *current* user turn carries the given scenario tag.
 *
 * The Responses API request replays the whole conversation in its `input`
 * array, so an earlier turn's `[scenario:...]` tag lingers in the history of
 * later requests — and ancillary requests (e.g. title generation) can replay
 * that same history. Matching the serialized body anywhere would therefore pick
 * the wrong request, so we check only the latest `user` input item (the prompt
 * just sent for this turn), mirroring how the mock server resolves the active
 * scenario.
 */
function findResponsesRequest(requests: CapturedRequest[], fromIndex: number, scenarioTag: string): any | undefined {
	for (let i = requests.length - 1; i >= fromIndex; i--) {
		const request = requests[i];
		if (request.path !== '/responses' || request.body?.model !== MODEL_CONFIG_MODEL_ID) {
			continue;
		}
		if (latestUserInputCarriesTag(request.body, scenarioTag)) {
			return request.body;
		}
	}
	return undefined;
}

/**
 * Whether the latest `user` item in a Responses API request's `input` array
 * contains `scenarioTag`. The item's `content` is either a plain string or an
 * array of `{ text }` parts (matching the mock server's own scenario parsing).
 */
function latestUserInputCarriesTag(body: any, scenarioTag: string): boolean {
	const input = Array.isArray(body?.input) ? body.input : [];
	for (let i = input.length - 1; i >= 0; i--) {
		const item = input[i];
		if (item?.role !== 'user') {
			continue;
		}
		const content = typeof item.content === 'string'
			? item.content
			: Array.isArray(item.content)
				? item.content.map((part: any) => part?.text ?? '').join('')
				: '';
		return content.includes(scenarioTag);
	}
	return false;
}

export function setup(logger: Logger) {

	const extensionSuite = process.env.VSCODE_SMOKE_TEST_PROXY_HEADER ? describe.skip : describe;

	extensionSuite('Agents Window', function () {
		// Cold start of the Copilot CLI SDK (first turn) routinely takes ~60-90s
		// on Windows CI. The default 120s mocha timeout fires while msg1 is
		// still in flight, which then leaks the deferred msg2 send into the
		// next test's window and corrupts that test's session view. Match the
		// 5-minute budget that the other Agents Window describes already use.
		this.timeout(5 * 60 * 1000);

		let mockServer: MockLlmServer;

		// Shell-tool scenarios for each session type. Each entry carries
		// everything the registration step and the corresponding test need —
		// scenario id, expected echoed reply, and the mock-LLM scenario
		// factory (different tool names per surface: `bash`/`pwsh`/
		// `powershell` for SDK sessions vs `run_in_terminal` for the Local
		// agent), plus optional per-session hooks for cold-start warm-up and
		// extra assertions. Keeping the data here avoids drift between the
		// scenario registration and the test that consumes it.
		interface ShellSession {
			readonly name: string;
			readonly sessionType: string;
			readonly scenarioId: string;
			readonly reply: string;
			readonly scenarioFactory: (reply: string) => unknown;
			/**
			 * Override `chat.cli.sandbox.enabled` to `'off'` for this test.
			 * The Agents Window suite enables the Copilot CLI sandbox at the
			 * suite level (for the "Test Copilot CLI session (sandbox)"
			 * test), but the Win32 AppContainer backend returns
			 * `Experimental_CreateProcessInSandbox returned E_NOTIMPL` on dev
			 * machines without the corresponding velocity feature flags
			 * (61389575, 61155944) enabled, which would fail any Copilot
			 * shell-tool test on Windows. Set this for non-sandbox Copilot
			 * tests so they exercise the plain (non-sandboxed) shell path
			 * everywhere — including Windows dev machines and CI.
			 */
			readonly disableCliSandbox?: boolean;
			/** Optional cold-start warm-up (e.g. Claude SDK bundling). */
			readonly warmUp?: (app: Application, label: string) => Promise<void>;
			/** Optional extra assertion run after the chat reply lands. */
			readonly extraAssertion?: (app: Application) => Promise<void>;
		}

		const SHELL_SESSIONS: readonly ShellSession[] = [
			{
				name: 'Copilot',
				sessionType: 'Copilot',
				scenarioId: 'smoke-hello-copilot-shell',
				reply: 'MOCKED_COPILOT_SHELL_RESPONSE',
				scenarioFactory: shellEchoScenario,
				disableCliSandbox: true,
				// Confirm the shell tool actually executed by checking the
				// CopilotCLISession diagnostic log. We don't care whether
				// the command was sandboxed for this test.
				extraAssertion: async (app) => {
					const chatLogPath = path.join(app.logsPath, 'window2', 'exthost', 'GitHub.copilot-chat', 'GitHub Copilot Chat.log');
					const chatLog = await fs.promises.readFile(chatLogPath, 'utf8');
					assert.match(
						chatLog,
						/\[CopilotCLISession\] tool\.execution_complete /,
						`expected tool.execution_complete in ${chatLogPath}`
					);
				},
			},
			{
				name: 'Claude',
				sessionType: 'Claude',
				scenarioId: 'smoke-hello-claude-shell',
				reply: 'MOCKED_CLAUDE_SHELL_RESPONSE',
				scenarioFactory: shellEchoScenario,
				// Pre-pay the Claude cold-start cost so the real assertion
				// below runs against a warm pipeline (see warmUpClaudeModel).
				warmUp: (app, label) => warmUpClaudeModel(app, logger, label),
			},
			// Note: there is intentionally no "Local" entry. The Local agent
			// in the Agents Window does not include `run_in_terminal` in its
			// advertised tool set, so the model's tool call is rejected with
			// "Tool run_in_terminal is currently disabled by the user".
			// The Chat Sessions "Test Local session run in terminal" test
			// already covers `run_in_terminal` against the regular chat panel
			// where the tool is available.
		];

		// Start the mock server BEFORE installAllHandlers' `before` runs so
		// the mock URL is available when we configure the app's env vars via
		// `optionsTransform`.
		before(async function () {
			const { startServer, ScenarioBuilder, registerScenario } = require(getMockLlmServerPath());

			// Fallback for ancillary requests (title/branch) that don't carry a [scenario:...] tag.
			registerScenario('text-only', new ScenarioBuilder().emit('OK').build());

			// One scenario per session type, each emitting a distinct reply
			// so the assertion is unambiguous. A second scenario per session
			// covers the follow-up message in the same session.
			for (const session of SESSIONS) {
				registerScenario(session.scenarioId, new ScenarioBuilder().emit(session.reply).build());
				registerScenario(session.scenarioId2, new ScenarioBuilder().emit(session.reply2).build());
			}

			registerScenario(COPILOT_SANDBOX_SCENARIO_ID, shellEchoScenario(COPILOT_SANDBOX_REPLY));

			// Shell-tool scenarios for the non-sandbox shell-tool tests
			// (auto-approved by the default `chat.tools.terminal.autoApprove`
			// entry for `echo`).
			for (const shellSession of SHELL_SESSIONS) {
				registerScenario(shellSession.scenarioId, shellSession.scenarioFactory(shellSession.reply));
			}

			registerScenario(CLAUDE_WARMUP_SCENARIO_ID, new ScenarioBuilder().emit(CLAUDE_WARMUP_REPLY).build());

			mockServer = await startServer(0, mockServerStartOptions((msg: string) => logger.log(`[mock-llm] ${msg}`)));
			logger.log(`[Agents Window] mock LLM server started at ${getMockLlmServerUrl(mockServer)} (platform=${process.platform}, arch=${process.arch}, node=${process.version})`);
			logger.log(`[Agents Window] env: VSCODE_DEV=${process.env.VSCODE_DEV ?? '<unset>'}, VSCODE_QUALITY=${process.env.VSCODE_QUALITY ?? '<unset>'}, BUILD_SOURCEBRANCH=${process.env.BUILD_SOURCEBRANCH ?? '<unset>'}, GITHUB_RUN_ID=${process.env.GITHUB_RUN_ID ?? '<unset>'}, GITHUB_ACTIONS=${process.env.GITHUB_ACTIONS ?? '<unset>'}`);
		});

		installAllHandlers(logger, opts => {
			const copilotEnv = getCopilotSmokeTestEnv(mockServer, { userDataDir: opts.userDataDir });
			logger.log(`[Agents Window] XDG_STATE_HOME=${copilotEnv.XDG_STATE_HOME ?? '<unset>'}`);
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
			logger.log(`[Agents Window] one-time setup begin; workspace=${app.workspacePathOrFolder}; mock URL=${getMockLlmServerUrl(mockServer)}; requestCount=${mockServer.requestCount()}`);

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
				['github.copilot.advanced.debug.overrideProxyUrl', JSON.stringify(getMockLlmServerUrl(mockServer))],
				// Use token auth (not HMAC) so the SDK can call /models and
				// /models/session against the mock server without HMAC validation.
				['github.copilot.advanced.debug.overrideAuthType', '"token"'],
				['chat.allowAnonymousAccess', 'true'],
				['github.copilot.chat.githubMcpServer.enabled', 'false'],
				['sessions.chat.localAgent.enabled', 'true'],
				['github.copilot.chat.cli.sandbox.enabled', '"on"'],
				['github.copilot.chat.cli.sessionEventLogging.enabled', 'true'],
				// Disable multi-chat per Copilot CLI session for this smoke
				// test. With multi-chat enabled (default), each follow-up
				// turn creates a *new sub-chat* with its own SDK session
				// nested under the parent session: the workbench
				// auto-swaps the active slot to a fresh new-session
				// homepage right after the previous turn commits, and
				// each turn ends up in its own isolated worktree
				// (`isolationEnabled: true, worktreePath: agents-...`).
				// That interferes with the smoke test driver's
				// activate/send sequence and makes msg2 land in a
				// different VS Code session than the assertion expects.
				// With this setting off, `supportsMultipleChats` is
				// false for Copilot CLI and turns share a workspace
				// (`isolationEnabled: false, worktreePath: undefined`),
				// which keeps the test flow deterministic.
				['sessions.github.copilot.multiChatSessions', 'false'],
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

		for (const [i, session] of SESSIONS.entries()) {
			it(`Test ${session.name} session`, async function () {
				const app = this.app as Application;
				logger.log(`[Agents Window/${session.name}] starting test; requestCount=${mockServer.requestCount()}`);
				try {

					// The Agents Window is opened in `before` and lands on the new
					// session view; subsequent tests must start a fresh session to
					// return to that view.
					if (i > 0) {
						await app.workbench.agentsWindow.startNewSession();
					}
					logger.log(`[Agents Window/${session.name}] waiting for new session view`);
					await app.workbench.agentsWindow.waitForNewSessionView();
					logger.log(`[Agents Window/${session.name}] new session view ready`);

					if (session.name === 'Claude') {
						// Pre-pay the Claude session cold-start cost (#321072): the first
						// Claude session in the Agents Window's extension host has to
						// bundle-load the SDK, start the localhost language model server,
						// spawn the SDK subprocess and load plugins — collectively often
						// >60s on macOS arm64 CI. A throwaway prompt absorbs that cost so
						// the real assertion below runs against a warm pipeline.
						await warmUpClaudeModel(app, logger, 'Agents Window/Claude');
					}

					logger.log(`[Agents Window/${session.name}] selecting session type '${session.name}'`);
					await app.workbench.agentsWindow.selectSessionType(session.name);

					const requestsBefore = mockServer.requestCount();
					const firstPrompt = `hello world [scenario:${session.scenarioId}]`;
					logger.log(`[Agents Window/${session.name}] submitting prompt; requestCount=${requestsBefore}`);
					await app.workbench.agentsWindow.submitNewSessionPrompt(firstPrompt);
					logger.log(`[Agents Window/${session.name}] prompt submitted; waiting for assistant text '${session.reply}'; requestCount=${mockServer.requestCount()}`);

					const text = await app.workbench.agentsWindow.waitForAssistantText(session.reply);
					logger.log(`Agents Window (${session.name}) response 1: ${text}`);

					if (!session.skipReply2) {
						// Copilot CLI: after a request completes, the Agents Window
						// auto-switches the active view to a fresh untitled session;
						// sending a follow-up prompt there would spawn a brand new
						// agent session (with its own session id and branch) rather
						// than continuing the existing one. Click back into the
						// just-completed session before sending message 2 so the
						// follow-up lands in the same session. Identify the row by
						// EITHER the first prompt or the msg1 reply: the row text is
						// the session title, which starts as the prompt (synchronous
						// fallback) and is asynchronously replaced by a generated
						// title (the reply, in the mock). Matching either avoids a
						// race on when title generation lands. The sessions list also
						// contains workspace folder group headers and historical
						// sessions, so we can't just click the topmost row.
						if (session.name === 'Copilot') {
							await app.workbench.agentsWindow.activateSessionByLabel([firstPrompt, session.reply], session.reply);
						}

						// Follow-up message in the same session — exercises the
						// active-session input path (not the new-session homepage).
						// For Copilot CLI, pass the expected active label so
						// `sendFollowUpMessage` re-verifies the active slot right
						// before sending (the workbench can auto-swap the slot to
						// a fresh untitled session between `activateSessionByLabel`
						// returning and the send-button click).
						const expectedActiveLabel = session.name === 'Copilot' ? session.reply : undefined;
						const activeRowMatch = session.name === 'Copilot' ? [firstPrompt, session.reply] : undefined;
						await app.workbench.agentsWindow.sendFollowUpMessage(
							`hello again [scenario:${session.scenarioId2}]`,
							undefined,
							expectedActiveLabel,
							activeRowMatch,
						);

						const secondTurnTimeout = session.name === 'Copilot' ? 180_000 : 60_000;
						const text2 = await app.workbench.agentsWindow.waitForAssistantText(session.reply2, secondTurnTimeout);
						logger.log(`Agents Window (${session.name}) response 2: ${text2}`);
					} else {
						logger.log(`[Agents Window/${session.name}] skipping second reply assertion (skipReply2=true)`);
					}

					assert.ok(
						mockServer.requestCount() > requestsBefore,
						`expected the mock LLM server to have received a new request from the ${session.name} session`
					);
				} catch (error) {
					logger.log(`[Agents Window/Copilot] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
					logger.log(`[Agents Window/Copilot] mock server requestCount at failure: ${mockServer.requestCount()}`);
					await dumpFailureDiagnostics(app, logger, 'Agents Window/Copilot', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
					throw error;
				}
			});
		}

		it('Test Copilot CLI session (sandbox)', async function () {
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
			if (process.platform === 'win32') {
				this.skip();
			}

			const app = this.app as Application;

			await app.workbench.agentsWindow.startNewSession();
			await app.workbench.agentsWindow.waitForNewSessionView();
			await app.workbench.agentsWindow.selectSessionType('Copilot');

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

		// Shell-tool variants for each session type — exercise the
		// model-driven shell tool (`bash` / `pwsh` / `powershell` for the SDK
		// sessions) on the first prompt and verify both that the command
		// actually ran (the JSON tool result contains the echoed marker) and
		// that the reply rendered in the chat. These run the "non-sandbox"
		// path: the shell command surfaces a terminal confirmation, which the
		// wait helper accepts by clicking "Allow" (a no-op for sessions that
		// auto-approve their shell commands).
		for (const shellSession of SHELL_SESSIONS) {
			it(`Test ${shellSession.name} session run in terminal`, async function () {
				const app = this.app as Application;
				const label = `Agents Window/${shellSession.name} shell`;
				try {
					if (shellSession.disableCliSandbox) {
						// Override the suite-level `chat.cli.sandbox.enabled: 'on'`
						// (set in the suite `before` for the sandbox test) so the
						// SDK runs the shell tool without the Win32 AppContainer
						// backend, which fails with E_NOTIMPL on dev machines and
						// CI agents that lack the velocity feature flags. Write
						// directly to settings.json on disk (the configuration
						// service has a file watcher) rather than opening the
						// settings editor — that would steal focus from the
						// Agents Window UI under test.
						await overrideUserSettingOnDisk(app, 'github.copilot.chat.cli.sandbox.enabled', 'off');
					}
					await app.workbench.agentsWindow.startNewSession();
					await app.workbench.agentsWindow.waitForNewSessionView();
					if (shellSession.warmUp) {
						await shellSession.warmUp(app, label);
					} else {
						await app.workbench.agentsWindow.selectSessionType(shellSession.sessionType);
					}

					const requestsBefore = mockServer.requestCount();
					await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${shellSession.scenarioId}]`);

					const text = await app.workbench.agentsWindow.waitForAssistantText(shellEchoResponseMatcher(shellSession.reply), 120_000, { acceptToolConfirmations: true });
					logger.log(`${label} response: ${text}`);

					assert.ok(
						mockServer.requestCount() > requestsBefore,
						`expected the mock LLM server to have received a new request from the ${shellSession.name} shell session`
					);

					if (shellSession.extraAssertion) {
						await shellSession.extraAssertion(app);
					}
				} catch (error) {
					logger.log(`[${label}] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
					await dumpFailureDiagnostics(app, logger, label, { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
					throw error;
				}
			});
		}
	});

	extensionSuite('Agents Window (model configuration)', function () {
		// Cold start of the Local session's copilot-chat exthost plus model
		// registration can take a while on CI; match the 5-minute budget used
		// by the other Agents Window describes.
		this.timeout(5 * 60 * 1000);

		let mockServer: MockServerWithRequests;

		// Start the mock server BEFORE installAllHandlers' `before` runs so the
		// mock URL is available when we configure the app's env vars.
		before(async function () {
			const { startServer, ScenarioBuilder, registerScenario } = require(getMockLlmServerPath());

			// Fallback for ancillary requests (title/branch) that don't carry a [scenario:...] tag.
			registerScenario('text-only', new ScenarioBuilder().emit('OK').build());
			registerScenario(MODEL_CONFIG_WARMUP_SCENARIO_ID, new ScenarioBuilder().emit(MODEL_CONFIG_WARMUP_REPLY).build());

			// One scenario per case, each emitting a distinct reply so the
			// response-text assertion unambiguously identifies the current turn.
			for (const testCase of MODEL_CONFIG_CASES) {
				registerScenario(testCase.scenarioId, new ScenarioBuilder().emit(testCase.reply).build());
			}

			mockServer = await startServer(0, mockServerStartOptions((msg: string) => logger.log(`[mock-llm] ${msg}`), true)) as MockServerWithRequests;
			logger.log(`[Agents Window/model-config] mock LLM server started at ${getMockLlmServerUrl(mockServer)}`);
		});

		installAllHandlers(logger, opts => {
			const copilotEnv = getCopilotSmokeTestEnv(mockServer, { userDataDir: opts.userDataDir });
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
			// with the smoke-test workspace folder pre-selected.
			const app = this.app as Application;

			// Reset any uncommitted changes left by earlier smoke test suites so
			// session/worktree creation isn't blocked by a dirty workspace.
			cp.execSync('git checkout . --quiet', { cwd: app.workspacePathOrFolder });

			await app.workbench.settingsEditor.addUserSettings([
				['github.copilot.advanced.debug.overrideProxyUrl', JSON.stringify(getMockLlmServerUrl(mockServer))],
				['github.copilot.advanced.debug.overrideCapiUrl', JSON.stringify(getMockLlmServerUrl(mockServer))],
				// Use token auth (not HMAC) so the SDK can call /models and
				// /models/session against the mock server without HMAC validation.
				['github.copilot.advanced.debug.overrideAuthType', '"token"'],
				['chat.allowAnonymousAccess', 'true'],
				['github.copilot.chat.githubMcpServer.enabled', 'false'],
				['chat.mcp.discovery.enabled', 'false'],
				['chat.mcp.enabled', 'false'],
				// Expose the "Local" session type, whose copilot-chat-backed model
				// picker surfaces the mock-config-model.
				['sessions.chat.localAgent.enabled', 'true'],
				// Enable Responses-API context management so the chosen Context Size
				// is forwarded as a `compact_threshold`. This is an experiment-based
				// setting (default off); set it explicitly for a deterministic run.
				['github.copilot.chat.responsesApiContextManagement.enabled', 'true'],
				// Show the context-usage gauge so the test can verify the denominator
				// (context window) reflects the selected Context Size.
				['chat.contextUsage.enabled', 'true'],
			]);

			const windowsBefore = app.code.driver.getAllWindows().length;
			await app.workbench.agentsWindow.openCurrentFolderInAgentsWindow();
			await app.workbench.agentsWindow.switchToAgentsWindow(windowsBefore);
			logger.log(`[Agents Window/model-config] switched to Agents Window; requestCount=${mockServer.requestCount()}`);
		});

		after(async function () {
			if (mockServer) {
				await mockServer.close();
			}
		});

		it('forwards the selected reasoning effort and context size from the Local session', async function () {
			const app = this.app as Application;

			try {
				await app.workbench.agentsWindow.waitForNewSessionView();
				await app.workbench.agentsWindow.selectSessionType('Local');

				// Warm up: the first Local message activates copilot-chat in the
				// Agents Window exthost (registering the models that populate the
				// picker) and creates the active session whose input hosts the
				// model + config pickers.
				await app.workbench.agentsWindow.submitNewSessionPrompt(`warm up [scenario:${MODEL_CONFIG_WARMUP_SCENARIO_ID}]`);
				await app.workbench.agentsWindow.waitForAssistantText(MODEL_CONFIG_WARMUP_REPLY, 120_000);

				// Select the mock model that exposes both configuration pickers in
				// the active session input.
				await app.workbench.agentsWindow.selectModel(MODEL_CONFIG_MODEL_NAME);

				for (const testCase of MODEL_CONFIG_CASES) {
					logger.log(`[Agents Window/model-config] case '${testCase.name}': selecting effort='${testCase.effortLabel}', context='${testCase.contextLabel}'`);

					// Select the Thinking Effort and Context Size in the combined
					// model-configuration dropdown.
					await app.workbench.agentsWindow.openModelConfig();
					await app.workbench.agentsWindow.selectModelConfigOption(testCase.effortLabel);
					await app.workbench.agentsWindow.selectModelConfigOption(testCase.contextLabel);
					await app.workbench.agentsWindow.closeModelConfig();

					const requestsBefore = mockServer.getRequests().length;
					const scenarioTag = `[scenario:${testCase.scenarioId}]`;

					await app.workbench.agentsWindow.sendFollowUpMessage(`explain this ${scenarioTag}`);
					const responseText = (await app.workbench.agentsWindow.waitForAssistantText(testCase.reply, 120_000)).trim();

					assert.ok(
						responseText.includes(testCase.reply),
						`Expected response for '${testCase.name}' to include "${testCase.reply}".\n\nResponse:\n${responseText}`
					);

					const requestBody = findResponsesRequest(mockServer.getRequests(), requestsBefore, scenarioTag);
					assert.ok(
						requestBody,
						`Expected a /responses request carrying ${scenarioTag} for '${testCase.name}'.`
					);

					assert.strictEqual(
						requestBody.reasoning?.effort,
						testCase.expectedEffort,
						`Expected reasoning.effort='${testCase.expectedEffort}' for '${testCase.name}', got '${requestBody.reasoning?.effort}'.`
					);

					const compactThreshold = requestBody.context_management?.[0]?.compact_threshold;
					assert.strictEqual(
						compactThreshold,
						testCase.expectedCompactThreshold,
						`Expected context_management compact_threshold=${testCase.expectedCompactThreshold} for '${testCase.name}', got ${compactThreshold}.`
					);

					// Verify the context-usage gauge's context-window denominator reflects
					// the selected Context Size (gauge total = maxInputTokens(tier) +
					// maxOutputTokens). The gauge renders once the response's token usage
					// lands, so this reads the click-through details popup.
					const usageLabel = await app.workbench.agentsWindow.readContextUsageTokenLabel();
					const contextWindowLabel = usageLabel.match(/\/\s*([\d.]+[KM]?)\s*tokens/)?.[1];
					logger.log(`[Agents Window/model-config] case '${testCase.name}' context-usage label: '${usageLabel}' (denominator='${contextWindowLabel}')`);
					assert.strictEqual(
						contextWindowLabel,
						testCase.expectedContextWindowLabel,
						`Expected context-usage gauge denominator='${testCase.expectedContextWindowLabel}' for '${testCase.name}', got '${contextWindowLabel}' (full label '${usageLabel}').`
					);

					logger.log(`[Agents Window/model-config] case '${testCase.name}' verified: reasoning.effort='${requestBody.reasoning?.effort}', compact_threshold=${compactThreshold}, contextWindow='${contextWindowLabel}'`);
				}
			} catch (error) {
				logger.log(`[Agents Window/model-config] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window (model configuration)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
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
				// CI macOS runners commonly resolve the default shell as /bin/sh, which
				// exercises the sentinel-based completion parser path. Force the same
				// profile on macOS so local runs cover the same branch.
				...(process.platform === 'darwin' ? {
					'terminal.integrated.profiles.osx': {
						'Smoke AgentHost Sandbox sh': { path: '/bin/sh' },
					},
					'terminal.integrated.defaultProfile.osx': 'Smoke AgentHost Sandbox sh',
				} : {}),
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
				// for a `chat/turnStarted` frame in the AHP JSONL transcript.
				// In the multi-chat protocol turns are dispatched as chat
				// actions on the session's default chat channel. The transcript
				// is written through an async queue (see AhpJsonlLogger), so the
				// frame may not be on disk yet even after the assistant reply has
				// rendered — poll briefly.
				const ahpLogDir = path.join(agentHost.logsPath, 'ahp');
				const ahpFrames = await waitForLogContent(() => readAhpFrames(ahpLogDir), '"type":"chat/turnStarted"');
				assert.ok(
					ahpFrames.includes('"type":"chat/turnStarted"'),
					`expected the AgentHost process to have received a chat/turnStarted dispatchAction (checked ${ahpJsonlFiles(ahpLogDir).length} jsonl files under ${ahpLogDir}); if missing, the renderer-side extension likely served the reply instead`
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
			if (process.platform === 'win32') {
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
				if (process.platform === 'darwin') {
					assert.match(
						agentHostLog,
						/\[ShellManager\] Created \w+ shell .*executable=\/bin\/sh\)/,
						`expected the macOS AgentHost sandbox smoke test to run under /bin/sh (CI parity and sentinel-parser coverage), in ${agentHostLogPath}`
					);
				}
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
			if (process.platform === 'win32') {
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

	describe('Agents Window (Codex)', () => {

		const codex = setupAgentHostSuite(logger, {
			serverLabel: 'Codex',
			registerScenarios: ({ ScenarioBuilder, registerScenario }) => {
				registerScenario(CODEX_SCENARIO_ID, new ScenarioBuilder().emit(CODEX_REPLY).build());
				registerScenario(CODEX_WARMUP_SCENARIO_ID, new ScenarioBuilder().emit(CODEX_WARMUP_REPLY).build());
			},
			settings: {
				// Register the Codex provider in the agent host process (it is
				// off by default). The provider resolves the codex SDK from the
				// repo's `node_modules` in dev, or `product.agentSdks.codex` in
				// packaged builds (or the VSCODE_AGENT_HOST_CODEX_SDK_ROOT
				// override) — so the test below is a hard requirement in dev and
				// skips only in built products where the SDK is genuinely absent.
				'chat.agentHost.codexAgent.enabled': true,
			},
		});

		it('Test Codex session', async function () {
			this.timeout(5 * 60 * 1000);

			const app = this.app as Application;

			// Resolve Codex availability OUTSIDE the try/catch below so that the
			// Pending thrown by `this.skip()` is not swallowed (and re-thrown as a
			// failure) by the failure-diagnostics handler.
			await app.workbench.agentsWindow.waitForNewSessionView();
			const codexAvailable = await app.workbench.agentsWindow.isSessionTypeAvailable('Codex');
			if (!codexAvailable) {
				// Codex must be available — and so this test must run rather than
				// skip — whenever the build under test is supposed to be able to
				// resolve the SDK:
				//   - Running from source (VSCODE_DEV=1, set by the smoke runner
				//     when no `--build` is passed): the agent host is not built, so
				//     it resolves the SDK from the repo's `node_modules`
				//     (`@openai/codex` is a devDependency).
				//   - Publish builds: `product.agentSdks.codex` is stamped (only
				//     when VSCODE_PUBLISH=true, see build/azure-pipelines/common/
				//     agent-sdk-produce.yml) so the SDK is fetched from the CDN.
				// In both cases an unavailable Codex is a regression — fail loudly.
				// Otherwise (built non-publish CI, where the SDK is neither shipped
				// nor stamped) Codex is legitimately absent, so skip gracefully.
				//
				// VSCODE_DEV (not app.quality === Quality.Dev) is the precise
				// "from source" signal: parseQuality() also returns Quality.Dev for
				// a `--build` product when VSCODE_QUALITY is unset, which would
				// wrongly hard-fail a packaged build that legitimately lacks Codex.
				const isFromSource = process.env['VSCODE_DEV'] === '1';
				const isPublishBuild = (process.env['VSCODE_PUBLISH'] ?? '').toLowerCase() === 'true';
				if (isFromSource || isPublishBuild) {
					throw new Error(`[Agents Window/Codex] Codex session type unexpectedly unavailable (VSCODE_DEV=${process.env['VSCODE_DEV'] ?? '<unset>'}, VSCODE_PUBLISH=${process.env['VSCODE_PUBLISH'] ?? '<unset>'}) — the SDK should be resolvable from node_modules (from source) or product.agentSdks.codex (publish build)`);
				}
				logger.log('[Agents Window/Codex] Codex session type not available in this built product (no product.agentSdks.codex); skipping');
				this.skip();
			}

			// Codex reports as "available" once the `@openai/codex` launcher shim
			// resolves, but the native binary ships as a separate per-platform
			// optional dependency that npm silently skips when its install fails.
			// A stale `node_modules` cache can thus have the shim but no binary, so
			// fail fast here (from source) instead of timing out at spawn time.
			if (process.env['VSCODE_DEV'] === '1') {
				const repoRoot = path.resolve(process.cwd(), '..', '..');
				const platformPkgDir = path.join(repoRoot, 'node_modules', `@openai/codex-${process.platform}-${process.arch}`);
				const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex';
				let codexBinaryFound = false;
				try {
					const vendorDir = path.join(platformPkgDir, 'vendor');
					codexBinaryFound = fs.readdirSync(vendorDir).some(triple => fs.existsSync(path.join(vendorDir, triple, 'bin', binaryName)));
				} catch {
					// vendor dir (or the whole platform package) is missing → treated as not found
				}
				if (!codexBinaryFound) {
					throw new Error(`[Agents Window/Codex] Codex native binary missing at ${platformPkgDir}. We depend on \`@openai/codex\`, which is only a thin launcher shim; the actual native binaries ship as its per-platform optional dependencies (\`@openai/codex-<platform>-<arch>\`). \`npm install\` does not fail when an optional dependency can't be installed, so node_modules can end up with the shim but no binary — Codex then reports as "available" but has nothing to spawn. Try bumping build/.cachesalt to force a fresh \`npm ci\` that reinstalls the binary.`);
				}
			}

			try {
				// Pre-pay the Codex session cold-start cost: the first Codex session
				// in a fresh agent host has to spawn the native codex app-server and
				// resolve its model list before the first /responses request can
				// complete. A throwaway prompt absorbs that so the real assertion
				// runs against a warm pipeline.
				await warmUpCodexModel(app, logger, 'Agents Window/Codex');

				const requestsBefore = codex.mockServer.requestCount();
				logger.log(`[Agents Window/Codex] submitting prompt; requestCount=${requestsBefore}`);
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${CODEX_SCENARIO_ID}]`);

				const text = await app.workbench.agentsWindow.waitForAssistantText(CODEX_REPLY);
				logger.log(`[Agents Window/Codex] response (length=${text.length}): ${text}`);

				assert.ok(
					codex.mockServer.requestCount() > requestsBefore,
					`expected the mock LLM server to have received a new request from the Codex session (before=${requestsBefore}, after=${codex.mockServer.requestCount()})`
				);

				// Confirm the request flowed through the AgentHost process (the codex
				// harness) and not a renderer-side fallback by checking for a
				// `chat/turnStarted` frame in the AHP JSONL transcript. The transcript
				// is written through an async queue, so poll briefly.
				const ahpLogDir = path.join(codex.logsPath, 'ahp');
				const ahpFrames = await waitForLogContent(() => readAhpFrames(ahpLogDir), '"type":"chat/turnStarted"');
				assert.ok(
					ahpFrames.includes('"type":"chat/turnStarted"'),
					`expected the AgentHost process to have received a chat/turnStarted dispatchAction (checked ${ahpJsonlFiles(ahpLogDir).length} jsonl files under ${ahpLogDir}); if missing, the renderer-side extension likely served the reply instead`
				);
			} catch (error) {
				logger.log(`[Agents Window/Codex] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window/Codex', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});
	});
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
 * Pre-pays the Codex session cold-start cost: the first Codex session in a
 * fresh agent host has to spawn the native `codex app-server` binary and
 * resolve its model list before the first `/responses` request can complete.
 *
 * Assumes the Agents Window is showing a new-session view AND that the 'Codex'
 * session type is available (callers gate on
 * {@link AgentsWindow.isSessionTypeAvailable} first). Sends a throwaway prompt
 * to a 'Codex' session, ignores its outcome (the warm-up itself may hit the
 * cold start), then leaves a fresh new-session view with 'Codex' selected so
 * the caller can submit the real prompt against a warm pipeline.
 */
async function warmUpCodexModel(app: Application, logger: Logger, label: string): Promise<void> {
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Codex');
	await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${CODEX_WARMUP_SCENARIO_ID}]`);
	try {
		await app.workbench.agentsWindow.waitForAssistantText(CODEX_WARMUP_REPLY, 60_000);
	} catch (error) {
		// Ignore — the warm-up itself may hit the cold-start race; the caller's
		// real attempt runs against an already-warmed pipeline.
		logger.log(`${label} warm-up attempt did not produce the expected reply (likely the cold-start race); proceeding with the real attempt. Reason: ${error instanceof Error ? error.message : String(error)}`);
	}
	await app.workbench.agentsWindow.startNewSession();
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Codex');
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

		mockServer = await startServer(0, mockServerStartOptions((msg: string) => logger.log(msg)));
		logger.log(`Mock LLM server (${config.serverLabel}) started at ${getMockLlmServerUrl(mockServer)}`);
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
				...getCopilotSmokeTestEnv(mockServer, { userDataDir: opts.userDataDir }),
				COPILOT_ENABLE_ALT_PROVIDERS: 'true',
				COPILOT_API_URL: getMockLlmServerUrl(mockServer),
				COPILOT_DEBUG_GITHUB_API_URL: getMockLlmServerUrl(mockServer),
				GITHUB_COPILOT_API_TOKEN: 'smoketest-fake-agent-host-token',
				// Route the agent host's shared CAPI client (used by the Codex /
				// agent-host harnesses for model discovery + requests) at the mock
				// instead of api.github.com, which would 401 with the fake token.
				VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: getMockLlmServerUrl(mockServer),
			},
		}));

		// Pre-seed settings.json on disk into BOTH the default profile and the
		// Agents profile. Writing settings after the workbench is up would race
		// with AgentHostContribution’s startup (it gates on
		// `chat.agentHost.enabled` at construction).
		const userDataDir = (this.app as Application).userDataPath;
		if (userDataDir) {
			const settings = JSON.stringify({
				'github.copilot.advanced.debug.overrideProxyUrl': getMockLlmServerUrl(mockServer),
				// AgentHost's fetch patch honors PAC/system proxy resolution only
				// when proxy support is enabled. The smoke profile is pre-seeded from
				// scratch, so set the production default explicitly rather than
				// relying on configuration registration timing.
				'http.proxySupport': 'override',
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

/**
 * Override a single user-scope VS Code setting by editing
 * `<userDataDir>/User/settings.json` directly on disk. The configuration
 * service watches the file and picks up the change. Preferred over
 * {@link Settings.addUserSetting} when the workbench has switched to a
 * secondary window (Agents Window) where opening the settings editor would
 * steal focus from the UI under test.
 */
async function overrideUserSettingOnDisk(app: Application, key: string, value: unknown): Promise<void> {
	const userDataDir = app.userDataPath;
	if (!userDataDir) {
		throw new Error('overrideUserSettingOnDisk: app.userDataPath is unset');
	}
	const settingsPath = path.join(userDataDir, 'User', 'settings.json');
	let current: Record<string, unknown> = {};
	try {
		const raw = await fs.promises.readFile(settingsPath, 'utf8');
		// Strip trailing comma the settings editor may emit and accept JSONC.
		current = JSON.parse(raw.replace(/,(\s*[}\]])/g, '$1')) as Record<string, unknown>;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw err;
		}
	}
	current[key] = value;
	await fs.promises.writeFile(settingsPath, JSON.stringify(current, null, '\t'));
	// The configuration service debounces file watcher events; give it a
	// moment to pick up the change before downstream code reads the setting.
	await new Promise(resolve => setTimeout(resolve, 500));
}
