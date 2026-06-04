/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as cp from 'child_process';
import { Application, Logger } from '../../../../automation';
import { getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer } from '../../utils';

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
}

const SESSIONS: readonly SessionConfig[] = [
	{ name: 'Copilot CLI', scenarioId: 'smoke-hello-copilot', reply: 'MOCKED_COPILOT_RESPONSE', scenarioId2: 'smoke-hello-copilot-2', reply2: 'MOCKED_COPILOT_RESPONSE_2' },
	{ name: 'Claude', scenarioId: 'smoke-hello-claude', reply: 'MOCKED_CLAUDE_RESPONSE', scenarioId2: 'smoke-hello-claude-2', reply2: 'MOCKED_CLAUDE_RESPONSE_2' },
	{ name: 'Local', scenarioId: 'smoke-hello-local', reply: 'MOCKED_LOCAL_RESPONSE', scenarioId2: 'smoke-hello-local-2', reply2: 'MOCKED_LOCAL_RESPONSE_2' },
];

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
			// so the assertion is unambiguous. A second scenario per session
			// covers the follow-up message in the same session.
			for (const session of SESSIONS) {
				registerScenario(session.scenarioId, new ScenarioBuilder().emit(session.reply).build());
				registerScenario(session.scenarioId2, new ScenarioBuilder().emit(session.reply2).build());
			}

			mockServer = await startServer(0, { logger: (msg: string) => logger.log(msg) });
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
				['chat.allowAnonymousAccess', 'true'],
				['github.copilot.chat.githubMcpServer.enabled', 'false'],
				['sessions.chat.localAgent.enabled', 'true'],
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

		for (const [i, session] of SESSIONS.entries()) {
			it(`Test ${session.name} session`, async function () {
				const app = this.app as Application;

				// The Agents Window is opened in `before` and lands on the new
				// session view; subsequent tests must start a fresh session to
				// return to that view.
				if (i > 0) {
					await app.workbench.agentsWindow.startNewSession();
				}
				await app.workbench.agentsWindow.waitForNewSessionView();
				await app.workbench.agentsWindow.selectSessionType(session.name);

				const requestsBefore = mockServer.requestCount();
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${session.scenarioId}]`);

				const text = await app.workbench.agentsWindow.waitForAssistantText(session.reply);
				logger.log(`Agents Window (${session.name}) response 1: ${text}`);

				// Copilot CLI: after a request completes, the Agents Window
				// auto-switches the active view to a fresh untitled session;
				// sending a follow-up prompt there would spawn a brand new
				// agent session (with its own session id and branch) rather
				// than continuing the existing one. Click back into the
				// just-completed session before sending message 2 so the
				// follow-up lands in the same session.
				if (session.name === 'Copilot CLI') {
					await app.workbench.agentsWindow.activateMostRecentSession();
				}

				// Follow-up message in the same session — exercises the
				// active-session input path (not the new-session homepage).
				await app.workbench.agentsWindow.sendFollowUpMessage(`hello again [scenario:${session.scenarioId2}]`);

				const text2 = await app.workbench.agentsWindow.waitForAssistantText(session.reply2);
				logger.log(`Agents Window (${session.name}) response 2: ${text2}`);

				assert.ok(
					mockServer.requestCount() > requestsBefore,
					`expected the mock LLM server to have received a new request from the ${session.name} session`
				);
			});
		}
	});
}
