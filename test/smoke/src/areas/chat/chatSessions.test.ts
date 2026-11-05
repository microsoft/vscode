/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { Application, Chat, Logger } from '../../../../automation';
import { dumpFailureDiagnostics, getCopilotSmokeTestEnv, getMockLlmServerPath, getMockLlmServerUrl, installAllHandlers, MockLlmServer, preseedChatExtensionEnablement } from '../../utils';
import { runInTerminalScenario, shellEchoResponseMatcher, shellEchoScenario } from './shellScenarios';

/**
 * Per-session scenarios. Each session uses a pair of unique scenario ids so
 * that the mock reply is distinct — this catches stale-content bugs where a
 * previous response is mistakenly accepted as the current one. We send two
 * prompts per session to also exercise the follow-up message path.
 *
 * `kind` selects between the two chat surfaces in the VS Code window:
 *  - 'editor': the chat opens as an editor tab (Copilot CLI, Agent Host Copilot).
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
	/**
	 * An Agent Host session: its chat editor keeps its untitled resource
	 * instead of swapping to a committed one, and each response bubble is
	 * marked complete when its turn ends.
	 */
	readonly agentHost?: boolean;
}

const SESSIONS: readonly SessionConfig[] = [
	{ name: 'Copilot CLI', command: 'smoketest.openCopilotCliChat', kind: 'editor', scenarioId: 'smoke-chat-sessions-copilot-cli', reply: 'MOCKED_CHAT_SESSIONS_COPILOT_CLI_RESPONSE', scenarioId2: 'smoke-chat-sessions-copilot-cli-2', reply2: 'MOCKED_CHAT_SESSIONS_COPILOT_CLI_RESPONSE_2' },
	{ name: 'Local', command: 'smoketest.openLocalChat', kind: 'view', scenarioId: 'smoke-chat-sessions-local', reply: 'MOCKED_CHAT_SESSIONS_LOCAL_RESPONSE', scenarioId2: 'smoke-chat-sessions-local-2', reply2: 'MOCKED_CHAT_SESSIONS_LOCAL_RESPONSE_2' },
];

/**
 * Per-session shell-tool scenarios. Each session triggers a shell tool call
 * on the first prompt and verifies the echoed marker appears in the chat
 * (which proves both that the command ran and that the reply was rendered).
 * Copilot CLI advertises `bash`/`pwsh`/`powershell`; the Local chat agent
 * advertises `run_in_terminal`.
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
	{ name: 'Local', command: 'smoketest.openLocalChat', kind: 'view', scenarioId: 'smoke-chat-sessions-local-terminal', reply: 'MOCKED_CHAT_SESSIONS_LOCAL_TERMINAL_RESPONSE', scenarioFactory: runInTerminalScenario },
];

/**
 * Agent Host Copilot sessions in a chat editor of the VS Code window. They
 * replace the extension-host Copilot CLI rows above once that provider is
 * removed. The Agent Host's shell tool is covered by the
 * `Agents Window (local AgentHost, SDK sandbox)` suite.
 */
const AGENT_HOST_SESSIONS: readonly SessionConfig[] = [
	{ name: 'Agent Host Copilot', command: 'smoketest.openAgentHostChat', kind: 'editor', agentHost: true, scenarioId: 'smoke-chat-sessions-agent-host', reply: 'MOCKED_CHAT_SESSIONS_AGENT_HOST_RESPONSE', scenarioId2: 'smoke-chat-sessions-agent-host-2', reply2: 'MOCKED_CHAT_SESSIONS_AGENT_HOST_RESPONSE_2' },
];

const AGENT_HOST_COPILOT_SCHEME = 'agent-host-copilotcli';
const AGENT_HOST_TOKEN = 'smoketest-fake-agent-host-token';
const AGENT_HOST_WARMUP_SCENARIO_ID = 'smoke-chat-sessions-agent-host-warmup';
const AGENT_HOST_WARMUP_REPLY = 'MOCKED_CHAT_SESSIONS_AGENT_HOST_WARMUP_RESPONSE';

/**
 * What differs between the Chat Sessions suites: the sessions they test and
 * the app profile those sessions need.
 */
interface ChatSessionsSuite {
	readonly title: string;
	readonly sessions: readonly SessionConfig[];
	readonly shellSessions: readonly ShellSessionConfig[];
	/** Extra environment for the app, on top of the Copilot extension's mock setup. */
	readonly env?: (mockServerUrl: string) => Record<string, string>;
	/** Extra settings written before VS Code starts. */
	readonly settings?: Record<string, unknown>;
	/** Extra scenarios for {@link warmUp}. */
	readonly registerScenarios?: (api: { ScenarioBuilder: any; registerScenario: (id: string, scenario: unknown) => void }) => void;
	/** Runs once after the app started, before the first test. */
	readonly warmUp?: (app: Application, logger: Logger) => Promise<void>;
}

const CHAT_SESSIONS_SUITES: readonly ChatSessionsSuite[] = [
	{ title: 'Chat Sessions', sessions: SESSIONS, shellSessions: SHELL_SESSIONS },
	{
		title: 'Chat Sessions (Agent Host)',
		sessions: AGENT_HOST_SESSIONS,
		shellSessions: [],
		// Point the Agent Host's Copilot SDK and its CAPI client at the mock
		// server, authenticated with a fake token the mock accepts.
		env: mockServerUrl => ({
			COPILOT_API_URL: mockServerUrl,
			COPILOT_DEBUG_GITHUB_API_URL: mockServerUrl,
			GITHUB_COPILOT_API_TOKEN: AGENT_HOST_TOKEN,
			VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: mockServerUrl,
		}),
		settings: {
			'chat.agentHost.unsafeTestToken': AGENT_HOST_TOKEN,
			'chat.agentHost.ahpJsonlLoggingEnabled': true,
			// Verbose Copilot runtime logging for capturable failure diagnostics.
			'chat.agentHost.copilotSdk.logLevel': 'trace',
			// This suite exercises the Agent Host session, not Auto routing.
			'chat.defaultModel': 'gpt-5.3-codex',
		},
		registerScenarios: ({ ScenarioBuilder, registerScenario }) => {
			registerScenario(AGENT_HOST_WARMUP_SCENARIO_ID, new ScenarioBuilder().emit(AGENT_HOST_WARMUP_REPLY).build());
		},
		warmUp: warmUpAgentHost,
	},
];

/**
 * Write all activation-sensitive settings before VS Code starts. Pre-seeding
 * only the enablement migration can activate Copilot Chat before its mock
 * endpoints are configured.
 */
async function preseedChatSessionProfile(userDataDir: string | undefined, mockServerUrl: string, settings: Record<string, unknown> | undefined): Promise<void> {
	if (!userDataDir) {
		throw new Error('Cannot pre-seed Chat Sessions profile without a user data directory');
	}

	const settingsPath = path.join(userDataDir, 'User', 'settings.json');
	fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
	fs.writeFileSync(settingsPath, JSON.stringify({
		'github.copilot.advanced.debug.overrideProxyUrl': mockServerUrl,
		'github.copilot.advanced.debug.overrideCapiUrl': mockServerUrl,
		'github.copilot.advanced.debug.overrideAuthType': 'token',
		'chat.allowAnonymousAccess': true,
		'github.copilot.chat.githubMcpServer.enabled': false,
		'chat.mcp.discovery.enabled': false,
		'chat.mcp.enabled': false,
		'chat.disableAIFeatures': false,
		'chat.agentHost.claudeAgent.enabled': true,
		'github.copilot.chat.backgroundAgent.enabled': true,
		'chat.tools.riskAssessment.enabled': false,
		...settings,
	}, undefined, '\t'));

	await preseedChatExtensionEnablement(userDataDir);
}

/**
 * Pays the Agent Host's cold-start costs before the first test, so they cannot
 * make it flaky: the Agent Host registers its Copilot agent asynchronously
 * after the window opens, and the first query of a fresh Agent Host can reach
 * the Copilot SDK before its model list has resolved, which fails that turn
 * with "No model available" (github/copilot-agent-runtime#9876). A second
 * session succeeds because the model list is cached by then. Every wait ends
 * on a condition; a warm-up that cannot get a reply fails the suite.
 */
async function warmUpAgentHost(app: Application, logger: Logger): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		// The command retries until the Agent Host has registered its Copilot agent (up to 5 minutes).
		await app.workbench.quickaccess.runCommand('smoketest.openAgentHostChat');
		await app.workbench.chat.waitForChatEditor(5 * 60 * 10);
		const sessionResource = await app.workbench.chat.waitForChatEditorSessionResource();
		if (!sessionResource.startsWith(`${AGENT_HOST_COPILOT_SCHEME}:`)) {
			throw new Error(`The Agent Host Copilot warm-up editor is bound to ${sessionResource} instead of an ${AGENT_HOST_COPILOT_SCHEME} session (likely the local fallback)`);
		}
		await app.workbench.chat.sendEditorMessage(`hello world [scenario:${AGENT_HOST_WARMUP_SCENARIO_ID}]`);
		// Wait until the turn has finished, with the reply or an error, so it cannot overlap the first test.
		await app.workbench.chat.waitForEditorResponse(2 * 60 * 10);
		const response = (await app.workbench.chat.getLatestEditorResponseText()).trim();
		await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
		if (response.includes(AGENT_HOST_WARMUP_REPLY)) {
			return;
		}
		if (attempt === 2) {
			throw new Error(`Agent Host Copilot did not reply to the warm-up prompt in two sessions. Last response:\n${response}`);
		}
		logger.log(`[Chat Sessions (Agent Host)] warm-up session ${attempt} failed (likely the cold-start model race); retrying in a new session. Response:\n${response}`);
	}
}

async function openSession(app: Application, session: { readonly command: string; readonly kind: 'editor' | 'view' }): Promise<void> {
	if (session.kind === 'editor') {
		await app.workbench.quickaccess.runCommand(session.command);
		await app.workbench.chat.waitForChatEditor(600);
	} else {
		// The chat view may already be open, so wait for the command to bind a
		// new session to it rather than just for the view to exist. Otherwise
		// the prompt can be sent into the outgoing session, which the view then
		// replaces with an empty one.
		const previousSessionResource = await app.workbench.chat.getChatViewSessionResource();
		await app.workbench.quickaccess.runCommand(session.command);
		await app.workbench.chat.waitForChatViewSessionChange(previousSessionResource, 600);
	}
}

async function sendAndWaitForReply(chat: Chat, session: SessionConfig, message: string, expectedReply: string, expectedResponses: number): Promise<string> {
	if (session.kind === 'editor') {
		await chat.sendEditorMessage(message);
		// Poll for the actual reply text rather than just waiting for a
		// completed response bubble. Copilot CLI keeps the
		// `chat-response-loading` class on the bubble even after streaming
		// finishes, which would otherwise cause the follow-up assertion to
		// time out. Each scenario emits a unique reply so a single text
		// match unambiguously identifies the current response.
		const text = (await chat.waitForEditorResponseText(expectedReply, 120_000, { waitForCommittedResource: !session.agentHost })).trim();
		if (session.agentHost) {
			// Agent Host chat editors keep their untitled resource, so there is
			// no editor swap to wait for. Wait for the turn to end instead, so a
			// follow-up is not sent into a turn that is still running.
			await chat.waitForEditorResponse(60 * 10, expectedResponses);
		}
		return text;
	}
	await chat.sendMessage(message);
	return (await chat.waitForResponseText(expectedReply, 120_000)).trim();
}

export function setup(logger: Logger) {
	for (const suite of CHAT_SESSIONS_SUITES) {
		setupChatSessionsSuite(logger, suite);
	}
}

function setupChatSessionsSuite(logger: Logger, suite: ChatSessionsSuite) {

	describe(suite.title, function () {
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
			for (const session of suite.sessions) {
				registerScenario(session.scenarioId, new ScenarioBuilder().emit(session.reply).build());
				registerScenario(session.scenarioId2, new ScenarioBuilder().emit(session.reply2).build());
			}

			// Shell-tool scenarios. `echo` is in the default
			// `chat.tools.terminal.autoApprove` list, so no extra settings
			// are required to auto-approve the command — these tests
			// deliberately exercise the non-sandbox shell-tool path.
			for (const shellSession of suite.shellSessions) {
				registerScenario(shellSession.scenarioId, shellSession.scenarioFactory(shellSession.reply));
			}
			suite.registerScenarios?.({ ScenarioBuilder, registerScenario });

			mockServer = await startServer(0, { logger: (msg: string) => logger.log(`[mock-llm] ${msg}`) });
			logger.log(`[${suite.title}] mock LLM server started at ${mockServer.url} (platform=${process.platform}, arch=${process.arch}, node=${process.version})`);
			logger.log(`[${suite.title}] env: VSCODE_DEV=${process.env.VSCODE_DEV ?? '<unset>'}, VSCODE_QUALITY=${process.env.VSCODE_QUALITY ?? '<unset>'}, BUILD_SOURCEBRANCH=${process.env.BUILD_SOURCEBRANCH ?? '<unset>'}, GITHUB_RUN_ID=${process.env.GITHUB_RUN_ID ?? '<unset>'}, GITHUB_ACTIONS=${process.env.GITHUB_ACTIONS ?? '<unset>'}`);
		});

		installAllHandlers(logger, opts => {
			const copilotEnv = getCopilotSmokeTestEnv(mockServer, { userDataDir: opts.userDataDir });
			logger.log(`[${suite.title}] extraEnv keys for app: ${Object.keys(copilotEnv).join(', ')} (token len=${(copilotEnv.VSCODE_COPILOT_CHAT_TOKEN ?? '').length})`);
			return {
				...opts,
				extraEnv: {
					...(opts.extraEnv ?? {}),
					...copilotEnv,
					...suite.env?.(getMockLlmServerUrl(mockServer)),
				},
			};
		}, app => preseedChatSessionProfile(app.userDataPath, mockServer.url, suite.settings));

		if (suite.warmUp) {
			before(async function () {
				const app = this.app as Application;
				try {
					await suite.warmUp?.(app, logger);
				} catch (error) {
					logger.log(`[${suite.title}] warm-up FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
					await dumpFailureDiagnostics(app, logger, `${suite.title} warm-up`);
					throw error;
				}
			});
		}

		after(async function () {
			await mockServer?.close();
		});

		for (const session of suite.sessions) {
			it(`Test ${session.name} session`, async function () {
				const app = this.app as Application;
				const requestsBefore = mockServer.requestCount();
				logger.log(`[Chat Sessions/${session.name}] starting test; requestCount=${requestsBefore}`);

				try {
					await openSession(app, session);
					if (session.agentHost) {
						// The editor falls back to a local chat session when the Agent Host
						// session cannot be created, and this profile points Local chat at
						// the same mock server, so a reply alone does not prove which one ran.
						const sessionResource = await app.workbench.chat.waitForChatEditorSessionResource();
						assert.ok(
							sessionResource.startsWith(`${AGENT_HOST_COPILOT_SCHEME}:`),
							`Expected the ${session.name} editor to be bound to an ${AGENT_HOST_COPILOT_SCHEME} session, but it is bound to ${sessionResource} (likely the local fallback)`
						);
					}

					// First message + first scenario reply.
					logger.log(`[Chat Sessions/${session.name}] running command and waiting for chat editor`);
					const responseText = await sendAndWaitForReply(app.workbench.chat, session, `hello world [scenario:${session.scenarioId}]`, session.reply, 1);
					logger.log(`Chat Sessions (${session.name}) response 1: ${responseText}`);

					assert.ok(
						responseText.includes(session.reply),
						`Expected ${session.name} response 1 to include mocked scenario response "${session.reply}".\n\nResponse:\n${responseText}`
					);

					// Follow-up message + second scenario reply, sent in the same
					// chat surface to exercise the follow-up code path.
					if (!session.skipReply2) {
						logger.log(`[Chat Sessions/${session.name}] running second command and waiting for chat editor`);
						const responseText2 = await sendAndWaitForReply(app.workbench.chat, session, `hello again [scenario:${session.scenarioId2}]`, session.reply2, 2);
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
		for (const shellSession of suite.shellSessions) {
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
