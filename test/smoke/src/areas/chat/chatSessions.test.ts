/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Chat, Logger } from '../../../../automation';
import { getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer } from '../../utils';

/**
 * Per-session scenarios. Each session uses a unique scenario id so that the
 * mock reply is distinct — this catches stale-content bugs where the previous
 * test's response is mistakenly accepted as the current test's response.
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
}

const SESSIONS: readonly SessionConfig[] = [
	{ name: 'Copilot CLI', command: 'smoketest.openCopilotCliChat', kind: 'editor', scenarioId: 'smoke-chat-sessions-copilot-cli', reply: 'MOCKED_CHAT_SESSIONS_COPILOT_CLI_RESPONSE' },
	{ name: 'Claude', command: 'smoketest.openClaudeChat', kind: 'editor', scenarioId: 'smoke-chat-sessions-claude', reply: 'MOCKED_CHAT_SESSIONS_CLAUDE_RESPONSE' },
	{ name: 'Local', command: 'workbench.action.chat.open', kind: 'view', scenarioId: 'smoke-chat-sessions-local', reply: 'MOCKED_CHAT_SESSIONS_LOCAL_RESPONSE' },
];

async function openSession(app: Application, session: SessionConfig): Promise<void> {
	await app.workbench.quickaccess.runCommand(session.command);
	if (session.kind === 'editor') {
		await app.workbench.chat.waitForChatEditor(600);
	} else {
		await app.workbench.chat.waitForChatView();
	}
}

async function sendAndGetResponse(chat: Chat, session: SessionConfig, message: string): Promise<string> {
	if (session.kind === 'editor') {
		await chat.sendEditorMessage(message);
		await chat.waitForEditorResponse(1500);
		return (await chat.getLatestEditorResponseText()).trim();
	}
	await chat.sendMessage(message);
	await chat.waitForResponse(1500);
	return (await chat.getLatestResponseText()).trim();
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
			// so the assertion is unambiguous.
			for (const session of SESSIONS) {
				registerScenario(session.scenarioId, new ScenarioBuilder().emit(session.reply).build());
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
				const responseText = await sendAndGetResponse(app.workbench.chat, session, `hello world [scenario:${session.scenarioId}]`);
				logger.log(`Chat Sessions (${session.name}) response: ${responseText}`);

				assert.ok(
					responseText.includes(session.reply),
					`Expected ${session.name} response to include mocked scenario response "${session.reply}".\n\nResponse:\n${responseText}`
				);
				assert.ok(
					mockServer.requestCount() > requestsBefore,
					`expected the mock LLM server to have received a new request from the ${session.name} session`
				);
			});
		}
	});
}
