/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Logger } from '../../../../automation';
import { dumpFailureDiagnostics, getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer } from '../../utils';

const RTL_SCENARIO_ID = 'smoke-chat-rtl-hebrew';
// A Hebrew sentence: the rendered response must be laid out right-to-left.
const RTL_REPLY = 'שלום עולם, זהו טקסט בעברית שצריך להופיע מימין לשמאל';

/**
 * E2E coverage for RTL support: a response containing Hebrew text is rendered with
 * `dir="rtl"` on its paragraph, so it reads right-to-left.
 */
export function setup(logger: Logger) {

	describe('Chat RTL', function () {
		this.timeout(5 * 60 * 1000);
		this.retries(0);

		let mockServer: MockLlmServer;

		before(async function () {
			const { startServer, ScenarioBuilder, registerScenario } = require(getMockLlmServerPath());
			registerScenario('text-only', new ScenarioBuilder().emit('OK').build());
			registerScenario(RTL_SCENARIO_ID, new ScenarioBuilder().emit(RTL_REPLY).build());
			mockServer = await startServer(0, { logger: (msg: string) => logger.log(`[mock-llm] ${msg}`) });
			logger.log(`[Chat RTL] mock LLM server started at ${mockServer.url}`);
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

		it('renders a Hebrew response right-to-left', async function () {
			const app = this.app as Application;

			try {
				await app.workbench.quickaccess.runCommand('workbench.action.chat.open');
				await app.workbench.chat.waitForChatView();

				// The input box itself should lay Hebrew out right-to-left while composing.
				await app.workbench.chat.typeInInput('שלום זהו טקסט בעברית');
				const inputDirection = await app.workbench.chat.getInputTextDirection();
				assert.strictEqual(inputDirection, 'rtl', `expected the Hebrew chat input line to be dir="rtl", saw ${inputDirection}`);

				await app.workbench.chat.sendMessage(`reply in hebrew [scenario:${RTL_SCENARIO_ID}]`);
				await app.workbench.chat.waitForResponse(1500);

				const responseText = (await app.workbench.chat.getLatestResponseText()).trim();
				assert.ok(
					responseText.includes('עברית'),
					`expected the Hebrew mock reply to be rendered.\n\nResponse:\n${responseText}`
				);

				const direction = await app.workbench.chat.getLatestResponseTextDirection();
				assert.strictEqual(direction, 'rtl', `expected the Hebrew response paragraph to be dir="rtl", saw ${direction}`);
			} catch (error) {
				logger.log(`[Chat RTL] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Chat RTL');
				throw error;
			} finally {
				await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
			}
		});
	});
}
