/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Chat, Logger } from '../../../../automation';
import { getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer } from '../../utils';

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
}

const SESSIONS: readonly SessionConfig[] = [
	{ name: 'Copilot CLI', command: 'smoketest.openCopilotCliChat', kind: 'editor', scenarioId: 'smoke-chat-sessions-copilot-cli', reply: 'MOCKED_CHAT_SESSIONS_COPILOT_CLI_RESPONSE', scenarioId2: 'smoke-chat-sessions-copilot-cli-2', reply2: 'MOCKED_CHAT_SESSIONS_COPILOT_CLI_RESPONSE_2' },
	{ name: 'Claude', command: 'smoketest.openClaudeChat', kind: 'editor', scenarioId: 'smoke-chat-sessions-claude', reply: 'MOCKED_CHAT_SESSIONS_CLAUDE_RESPONSE', scenarioId2: 'smoke-chat-sessions-claude-2', reply2: 'MOCKED_CHAT_SESSIONS_CLAUDE_RESPONSE_2' },
	{ name: 'Local', command: 'workbench.action.chat.open', kind: 'view', scenarioId: 'smoke-chat-sessions-local', reply: 'MOCKED_CHAT_SESSIONS_LOCAL_RESPONSE', scenarioId2: 'smoke-chat-sessions-local-2', reply2: 'MOCKED_CHAT_SESSIONS_LOCAL_RESPONSE_2' },
];

async function openSession(app: Application, session: SessionConfig): Promise<void> {
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
		this.timeout(3 * 60 * 1000);
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

		for (const session of SESSIONS) {
			it(`Test ${session.name} session`, async function () {
				const app = this.app as Application;
				const requestsBefore = mockServer.requestCount();

				await openSession(app, session);

				// First message + first scenario reply.
				const responseText = await sendAndWaitForReply(app.workbench.chat, session, `hello world [scenario:${session.scenarioId}]`, session.reply);
				logger.log(`Chat Sessions (${session.name}) response 1: ${responseText}`);

				assert.ok(
					responseText.includes(session.reply),
					`Expected ${session.name} response 1 to include mocked scenario response "${session.reply}".\n\nResponse:\n${responseText}`
				);

				// Follow-up message + second scenario reply, sent in the same
				// chat surface to exercise the follow-up code path.
				const responseText2 = await sendAndWaitForReply(app.workbench.chat, session, `hello again [scenario:${session.scenarioId2}]`, session.reply2);
				logger.log(`Chat Sessions (${session.name}) response 2: ${responseText2}`);

				assert.ok(
					responseText2.includes(session.reply2),
					`Expected ${session.name} response 2 to include mocked scenario response "${session.reply2}".\n\nResponse:\n${responseText2}`
				);

				assert.ok(
					mockServer.requestCount() > requestsBefore,
					`expected the mock LLM server to have received a new request from the ${session.name} session`
				);
			});
		}
	});
}
