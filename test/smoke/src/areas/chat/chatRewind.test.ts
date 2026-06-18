/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Logger } from '../../../../automation';
import { dumpFailureDiagnostics, getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer } from '../../utils';

const REWIND_SCENARIO_ID = 'smoke-chat-rewind-local';
const REWIND_REPLY = 'MOCKED_CHAT_REWIND_RESPONSE';

/**
 * E2E coverage for the `/rewind` feature: after two turns, rewinding discards the
 * most recent turn in place (the conversation shrinks from two requests to one),
 * unlike Fork which would open a brand new session.
 */
export function setup(logger: Logger) {

	describe('Chat Rewind', function () {
		this.timeout(5 * 60 * 1000);
		this.retries(0);

		let mockServer: MockLlmServer;

		before(async function () {
			const { startServer, ScenarioBuilder, registerScenario } = require(getMockLlmServerPath());
			registerScenario('text-only', new ScenarioBuilder().emit('OK').build());
			registerScenario(REWIND_SCENARIO_ID, new ScenarioBuilder().emit(REWIND_REPLY).build());
			mockServer = await startServer(0, { logger: (msg: string) => logger.log(`[mock-llm] ${msg}`) });
			logger.log(`[Chat Rewind] mock LLM server started at ${mockServer.url}`);
		});

		installAllHandlers(logger, opts => {
			return {
				...opts,
				extraEnv: {
					...(opts.extraEnv ?? {}),
					...getCopilotSmokeTestEnv(mockServer),
				},
			};
		});

		before(async function () {
			const app = this.app as Application;
			await app.workbench.settingsEditor.addUserSettings([
				['github.copilot.advanced.debug.overrideProxyUrl', JSON.stringify(mockServer.url)],
				['github.copilot.advanced.debug.overrideCapiUrl', JSON.stringify(mockServer.url)],
				['github.copilot.advanced.debug.overrideAuthType', '"token"'],
				['chat.allowAnonymousAccess', 'true'],
				['github.copilot.chat.githubMcpServer.enabled', 'false'],
				['chat.mcp.discovery.enabled', 'false'],
				['chat.mcp.enabled', 'false'],
				['chat.disableAIFeatures', 'false'],
			]);
		});

		after(async function () {
			await mockServer?.close();
		});

		it('rewinds the most recent turn out of the conversation', async function () {
			const app = this.app as Application;
			const requestSelector = '.interactive-item-container.interactive-request';

			try {
				await app.workbench.quickaccess.runCommand('workbench.action.chat.open');
				await app.workbench.chat.waitForChatView();

				// Turn 1 — wait until its request row has rendered.
				await app.workbench.chat.sendMessage(`first turn [scenario:${REWIND_SCENARIO_ID}]`);
				await app.code.waitForElements(requestSelector, false, els => els.length === 1, 600);

				// Turn 2 — sendMessage waits for the send button to re-enable (i.e. turn 1
				// finished streaming) before submitting, so this can't race turn 1.
				await app.workbench.chat.sendMessage(`second turn [scenario:${REWIND_SCENARIO_ID}]`);
				await app.code.waitForElements(requestSelector, false, els => els.length === 2, 600);

				const countBefore = await app.workbench.chat.getRequestCount();
				assert.strictEqual(countBefore, 2, `expected two request turns before rewind, saw ${countBefore}`);

				// Rewind is offered as a button in the per-message checkpoint toolbar, next to
				// Fork (the discard icon sits beside the repo-forked icon on the same request).
				const hasForkAndRewind = await app.workbench.chat.checkpointToolbarHasForkAndRewind();
				if (!hasForkAndRewind) {
					logger.log(`[Chat Rewind] checkpoint DOM:\n${await app.workbench.chat.dumpCheckpointContainersHtml()}`);
				}
				assert.ok(hasForkAndRewind, 'expected the checkpoint toolbar to show a Rewind button next to Fork');

				// Rewind the most recent turn. The button and the slash command invoke the same
				// action; drive it via the slash command, which waits for the turn to settle and
				// confirms the destructive-action dialog deterministically.
				await app.workbench.chat.rewindLastTurnViaSlashCommand();

				await app.code.waitForElements(requestSelector, false, els => els.length === 1, 600);
				const countAfter = await app.workbench.chat.getRequestCount();
				assert.strictEqual(countAfter, 1, `expected one request turn after rewinding the last, saw ${countAfter}`);
			} catch (error) {
				logger.log(`[Chat Rewind] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Chat Rewind');
				throw error;
			} finally {
				await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
			}
		});
	});
}
