/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Chat, Logger } from '../../../../automation';
import { dumpFailureDiagnostics, getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer } from '../../utils';
import { runInTerminalScenario, shellEchoResponseMatcher, shellEchoScenario } from './shellScenarios';

/**
 * Per-session scenarios. Each session uses a pair of unique scenario ids so
 * that the mock reply is distinct — this catches stale-content bugs where a
 * previous response is mistakenly accepted as the current one. We send two
 * prompts per session to also exercise the follow-up message path.
 *
 * `kind` selects between the two chat surfaces in the VS Code window:
 *  - 'editor': the chat opens as an editor tab (Copilot CLI, Claude).
 *  - 'view':   the default chat panel in the sidebar / aux bar (Local).
 */
interface SessionConfig {
	readonly name: string;
	readonly command: string;
	readonly kind: 'editor' | 'view';
	readonly scenarioId: string;
	readonly reply: string;
	readonly scenarioId2: string;
	readonly reply2: string;
	/** Skip the second message/assertion (e.g. while a known flake is being investigated). */
	readonly skipReply2?: boolean;
}

const SESSIONS: readonly SessionConfig[] = [
	{ name: 'Copilot CLI', command: 'smoketest.openCopilotCliChat', kind: 'editor', scenarioId: 'smoke-chat-sessions-copilot-cli', reply: 'MOCKED_CHAT_SESSIONS_COPILOT_CLI_RESPONSE', scenarioId2: 'smoke-chat-sessions-copilot-cli-2', reply2: 'MOCKED_CHAT_SESSIONS_COPILOT_CLI_RESPONSE_2' },
	{ name: 'Claude', command: 'smoketest.openClaudeChat', kind: 'editor', scenarioId: 'smoke-chat-sessions-claude', reply: 'MOCKED_CHAT_SESSIONS_CLAUDE_RESPONSE', scenarioId2: 'smoke-chat-sessions-claude-2', reply2: 'MOCKED_CHAT_SESSIONS_CLAUDE_RESPONSE_2' },
	{ name: 'Local', command: 'workbench.action.chat.open', kind: 'view', scenarioId: 'smoke-chat-sessions-local', reply: 'MOCKED_CHAT_SESSIONS_LOCAL_RESPONSE', scenarioId2: 'smoke-chat-sessions-local-2', reply2: 'MOCKED_CHAT_SESSIONS_LOCAL_RESPONSE_2' },
];

/**
 * Per-session shell-tool scenarios. Each session triggers a shell tool call
 * on the first prompt and verifies the echoed marker appears in the chat
 * (which proves both that the command ran and that the reply was rendered).
 * SDK-based sessions (Copilot CLI, Claude) advertise `bash`/`pwsh`/
 * `powershell`; the Local chat agent advertises `run_in_terminal`.
 */
interface ShellSessionConfig {
	readonly name: string;
	readonly command: string;
	readonly kind: 'editor' | 'view';
	readonly scenarioId: string;
	readonly reply: string;
	readonly scenarioFactory: (reply: string) => unknown;
}

const SHELL_SESSIONS: readonly ShellSessionConfig[] = [
	{ name: 'Copilot CLI', command: 'smoketest.openCopilotCliChat', kind: 'editor', scenarioId: 'smoke-chat-sessions-copilot-cli-shell', reply: 'MOCKED_CHAT_SESSIONS_COPILOT_CLI_SHELL_RESPONSE', scenarioFactory: shellEchoScenario },
	{ name: 'Claude', command: 'smoketest.openClaudeChat', kind: 'editor', scenarioId: 'smoke-chat-sessions-claude-shell', reply: 'MOCKED_CHAT_SESSIONS_CLAUDE_SHELL_RESPONSE', scenarioFactory: shellEchoScenario },
	{ name: 'Local', command: 'workbench.action.chat.open', kind: 'view', scenarioId: 'smoke-chat-sessions-local-terminal', reply: 'MOCKED_CHAT_SESSIONS_LOCAL_TERMINAL_RESPONSE', scenarioFactory: runInTerminalScenario },
];

async function openSession(app: Application, session: { readonly command: string; readonly kind: 'editor' | 'view' }): Promise<void> {
	await app.workbench.quickaccess.runCommand(session.command);
	if (session.kind === 'editor') {
		await app.workbench.chat.waitForChatEditor(600);
	} else {
		await app.workbench.chat.waitForChatView();
	}
}

async function sendAndWaitForReply(chat: Chat, session: SessionConfig, message: string, expectedReply: string): Promise<string> {
	if (session.kind === 'editor') {
		await chat.sendEditorMessage(message);
		// Poll for the actual reply text rather than just waiting for a
		// completed response bubble. Copilot CLI keeps the
		// `chat-response-loading` class on the bubble even after streaming
		// finishes, which would otherwise cause the follow-up assertion to
		// time out. Each scenario emits a unique reply so a single text
		// match unambiguously identifies the current response.
		return (await chat.waitForEditorResponseText(expectedReply, 120_000)).trim();
	}
	await chat.sendMessage(message);
	return (await chat.waitForResponseText(expectedReply, 120_000)).trim();
}

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
			// so the assertion is unambiguous. A second scenario per session
			// covers the follow-up message in the same chat surface.
			for (const session of SESSIONS) {
				registerScenario(session.scenarioId, new ScenarioBuilder().emit(session.reply).build());
				registerScenario(session.scenarioId2, new ScenarioBuilder().emit(session.reply2).build());
			}

			// Shell-tool scenarios. `echo` is in the default
			// `chat.tools.terminal.autoApprove` list, so no extra settings
			// are required to auto-approve the command — these tests
			// deliberately exercise the non-sandbox shell-tool path.
			for (const shellSession of SHELL_SESSIONS) {
				registerScenario(shellSession.scenarioId, shellSession.scenarioFactory(shellSession.reply));
			}

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
				// Disable the LLM-generated tool risk assessment. It issues a
				// separate model request whose mock reply ("OK") never resolves
				// to a valid Safe/Caution/Review verdict, which would otherwise
				// leave the terminal confirmation stuck in the "Assessing risk…"
				// state so its "Allow" button never becomes available. The
				// shell-tool tests need to click "Allow" to proceed.
				['chat.tools.riskAssessment.enabled', 'false'],
			]);
			logger.log(`[Chat Sessions] user settings written; requestCount=${mockServer.requestCount()}`);
		});

		after(async function () {
			await mockServer?.close();
		});

		for (const session of SESSIONS) {
			it(`Test ${session.name} session`, async function () {
				const app = this.app as Application;
				const requestsBefore = mockServer.requestCount();
				logger.log(`[Chat Sessions/${session.name}] starting test; requestCount=${requestsBefore}`);

				try {
					await openSession(app, session);

					// First message + first scenario reply.
					logger.log(`[Chat Sessions/${session.name}] running command and waiting for chat editor`);
					const responseText = await sendAndWaitForReply(app.workbench.chat, session, `hello world [scenario:${session.scenarioId}]`, session.reply);
					logger.log(`Chat Sessions (${session.name}) response 1: ${responseText}`);

					assert.ok(
						responseText.includes(session.reply),
						`Expected ${session.name} response 1 to include mocked scenario response "${session.reply}".\n\nResponse:\n${responseText}`
					);

					// Follow-up message + second scenario reply, sent in the same
					// chat surface to exercise the follow-up code path.
					if (!session.skipReply2) {
						logger.log(`[Chat Sessions/${session.name}] running second command and waiting for chat editor`);
						const responseText2 = await sendAndWaitForReply(app.workbench.chat, session, `hello again [scenario:${session.scenarioId2}]`, session.reply2);
						logger.log(`Chat Sessions (${session.name}) response 2: ${responseText2}`);

						assert.ok(
							responseText2.includes(session.reply2),
							`Expected ${session.name} response 2 to include mocked scenario response "${session.reply2}".\n\nResponse:\n${responseText2}`
						);
					} else {
						logger.log(`[Chat Sessions/${session.name}] skipping second reply assertion (skipReply2=true)`);
					}
					assert.ok(
						mockServer.requestCount() > requestsBefore,
						`expected the mock LLM server to have received a new request from the ${session.name} session (before=${requestsBefore}, after=${mockServer.requestCount()})`
					);
				} catch (error) {
					logger.log(`[Chat Sessions/${session.name}] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
					logger.log(`[Chat Sessions/${session.name}] mock server requestCount at failure: ${mockServer.requestCount()} (before=${requestsBefore})`);
					await dumpFailureDiagnostics(app, logger, `Chat Sessions/${session.name}`);
					throw error;
				} finally {
					// Close the editor to avoid focus interference with the next test
					await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
				}
			});
		}

		// Shell-tool variant per session — exercises the model-driven shell
		// tool (`bash`/`pwsh`/`powershell` for the SDK sessions, or
		// `run_in_terminal` for the Local session) on the first prompt and
		// verifies both that the command actually ran (the JSON tool result
		// contains the echoed marker) and that the reply was rendered in the
		// chat. `echo` is in the default `chat.tools.terminal.autoApprove`
		// list, so no extra auto-approve settings are required.
		for (const shellSession of SHELL_SESSIONS) {
			it(`Test ${shellSession.name} session run in terminal`, async function () {
				const app = this.app as Application;
				const requestsBefore = mockServer.requestCount();
				logger.log(`[Chat Sessions/${shellSession.name} shell] starting test; requestCount=${requestsBefore}`);

				try {
					await openSession(app, shellSession);

					const prompt = `hello world [scenario:${shellSession.scenarioId}]`;
					const matcher = shellEchoResponseMatcher(shellSession.reply);
					let responseText: string;
					if (shellSession.kind === 'editor') {
						await app.workbench.chat.sendEditorMessage(prompt);
						// 120s timeout — SDK + shell tool round-trip can be slow on cold CI.
						// acceptToolConfirmations clicks "Allow" on the terminal
						// confirmation so the command runs (no-op when the session
						// auto-approves).
						responseText = (await app.workbench.chat.waitForEditorResponseText(matcher, 120_000, { acceptToolConfirmations: true })).trim();
					} else {
						await app.workbench.chat.sendMessage(prompt);
						responseText = (await app.workbench.chat.waitForResponseText(matcher, 120_000, { acceptToolConfirmations: true })).trim();
					}
					logger.log(`Chat Sessions (${shellSession.name} shell) response: ${responseText}`);

					assert.match(
						responseText,
						matcher,
						`Expected ${shellSession.name} shell response to include the echoed marker "${shellSession.reply}" inside a JSON tool result string.\n\nResponse:\n${responseText}`
					);

					assert.ok(
						mockServer.requestCount() > requestsBefore,
						`expected the mock LLM server to have received a new request from the ${shellSession.name} shell session (before=${requestsBefore}, after=${mockServer.requestCount()})`
					);
				} catch (error) {
					logger.log(`[Chat Sessions/${shellSession.name} shell] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
					logger.log(`[Chat Sessions/${shellSession.name} shell] mock server requestCount at failure: ${mockServer.requestCount()} (before=${requestsBefore})`);
					await dumpFailureDiagnostics(app, logger, `Chat Sessions/${shellSession.name} shell`);
					throw error;
				} finally {
					await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
				}
			});
		}
	});
}
