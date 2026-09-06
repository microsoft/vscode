/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Application, ApplicationOptions, Logger } from '../../../../automation';
import { createApp, dumpFailureDiagnostics, getCopilotSmokeTestEnv, getMockLlmServerPath, getMockLlmServerUrl, installAppAfterHandler, installDiagnosticsHandler, MockLlmServer, suiteCrashPath, suiteLogsPath } from '../../utils';
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

const CODEX_SCENARIO_ID = 'smoke-hello-codex';
const CODEX_REPLY = 'MOCKED_CODEX_RESPONSE';

// Lightweight throwaway scenario used by {@link warmUpCodexModel} to pre-pay
// the Codex session cold-start cost (native codex app-server spawn + model
// list resolution) before the real assertion runs.
const CODEX_WARMUP_SCENARIO_ID = 'smoke-hello-codex-warmup';
const CODEX_WARMUP_REPLY = 'MOCKED_CODEX_WARMUP_RESPONSE';

const AGENT_HOST_SCENARIO_ID = 'smoke-hello-agent-host';
const AGENT_HOST_REPLY = 'MOCKED_AGENT_HOST_RESPONSE';
const AGENT_HOST_MODEL = 'gpt-5.3-codex';
const AGENT_HOST_REPLACEMENT_SCENARIO_ID = 'smoke-agent-host-session-replacement';
const AGENT_HOST_REPLACEMENT_REPLY = 'MOCKED_AGENT_HOST_REPLACEMENT_RESPONSE';

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

	describe('Agents Window (local AgentHost)', () => {

		const agentHost = setupAgentHostSuite(logger, {
			serverLabel: 'AgentHost',
			registerScenarios: ({ ScenarioBuilder, registerScenario }) => {
				registerScenario(AGENT_HOST_SCENARIO_ID, new ScenarioBuilder().emit(AGENT_HOST_REPLY).build());
				registerScenario(AGENT_HOST_REPLACEMENT_SCENARIO_ID, new ScenarioBuilder().emit(AGENT_HOST_REPLACEMENT_REPLY).build());
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

		it('Replaces the new session UI with the in-progress AgentHost session', async function () {
			this.timeout(5 * 60 * 1000);

			const app = this.app as Application;

			try {
				await app.workbench.agentsWindow.waitForNewSessionView();
				await app.workbench.agentsWindow.selectSessionType('Copilot');
				await app.workbench.agentsWindow.submitNewSessionPrompt(`replace the new session UI [scenario:${AGENT_HOST_REPLACEMENT_SCENARIO_ID}]`);
				await app.workbench.agentsWindow.waitForActiveSessionView();
				await app.workbench.agentsWindow.waitForAssistantText(AGENT_HOST_REPLACEMENT_REPLY);
				await app.workbench.agentsWindow.startNewSession();
			} catch (error) {
				logger.log(`Agents Window (AgentHost replacement) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window (AgentHost replacement)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
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
				await app.workbench.agentsWindow.selectSessionType('Copilot');

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
		// shell commands still run mxc-wrapped.

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
			// The AgentHost-side log we assert on is `<logsPath>/agenthost.log`
			// (the utility-process log), produced by CopilotAgentSession.
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
				//   2. `Tool started: bash` — the SDK's own shell tool ran the command.
				//   3. NO `[ShellManager]` line — the AgentHost provided no shell tool
				//      (customTerminalTool is off), so the SDK, not our engine, ran it.
				// There is deliberately no `Auto-approving sandboxed shell command`
				// entry on this path. The session enables the runtime's script-safety
				// classifier, which reports this `echo` as read-only, and the runtime
				// resolves a read-only command without ever raising a permission
				// request. The host's auto-approve branch still governs non-read-only
				// sandboxed commands and is asserted by the custom-terminal-tool test
				// above. Poll for the tool run: it lands after 1, and by that point a
				// competing `[ShellManager]` run would have been logged too.
				const agentHostLogPath = path.join(agentHost.logsPath, 'agenthost.log');
				const sdkShellRun = /\[Copilot:[^\]]+\] Tool started: bash/;
				const agentHostLog = await waitForLogContent(() => readFileIfExists(agentHostLogPath), sdkShellRun);
				assert.match(
					agentHostLog,
					/\[Copilot:[^\]]+\] Applied SDK sandboxConfig via session\.options\.update/,
					`expected an "Applied SDK sandboxConfig" entry in ${agentHostLogPath}`
				);
				assert.match(
					agentHostLog,
					sdkShellRun,
					`expected the SDK's own shell tool ("Tool started: bash") to have run the command in ${agentHostLogPath}`
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
			await app.workbench.agentsWindow.startNewSession();
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
 * Agent Host Copilot selected so the caller can submit the real prompt
 * against an already-warmed model list.
 */
async function warmUpAgentHostModel(app: Application, logger: Logger, label: string): Promise<void> {
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Copilot');
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
	await app.workbench.agentsWindow.selectSessionType('Copilot');
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
		// Agents profile so Agent Host startup observes the test configuration.
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
				'chat.agentHost.ahpJsonlLoggingEnabled': true,
				'chat.agentHost.unsafeTestToken': 'smoketest-fake-agent-host-token',
				// Verbose Copilot runtime logging for capturable failure diagnostics.
				'chat.agentHost.copilotSdk.logLevel': 'trace',
				// These suites exercise Agent Host and sandbox behavior, not Auto routing.
				'chat.defaultModel': AGENT_HOST_MODEL,
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
