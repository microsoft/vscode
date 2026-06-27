/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Chat, Logger } from '../../../../automation';
import { buildCopilotChatToken, dumpFailureDiagnostics, getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer } from '../../utils';

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
 * Display name of the dedicated mock model that advertises both a Thinking
 * Effort and a Context Size picker (see `mock-config-model` in the mock server).
 */
const MODEL_NAME = 'Mock Config Model';

/**
 * Model id the mock server advertises for {@link MODEL_NAME}. Used to single out
 * the main agent `/responses` request from ancillary requests (e.g. title
 * generation) that may also carry the conversation history.
 */
const MODEL_ID = 'mock-config-model';

/**
 * Combinations of model-configuration picker selections to exercise. Each case
 * selects a Thinking Effort and a Context Size in the model-picker UI, sends a
 * tagged prompt, and verifies the values the mock server received in the
 * `/responses` request body:
 *  - reasoning effort  → `body.reasoning.effort`
 *  - context size      → `body.context_management[0].compact_threshold`
 *
 * The mock model's prompt window is 200000 tokens with a default tier of
 * 128000. The compaction threshold is `floor(maxPromptTokens * 0.9)`. The
 * default tier resolves to a 128000 prompt window (→ 115200). Selecting the
 * full 200000 tier reserves the output tokens
 * (`floor(min(32000, 200000 * 0.15)) = 30000`), clamping the prompt window to
 * `200000 - 30000 = 170000` (rendered "170K" → 153000).
 */
interface ConfigCase {
	readonly name: string;
	readonly effortLabel: string;
	readonly expectedEffort: string;
	readonly contextLabel: string;
	readonly expectedCompactThreshold: number;
	/** The combined label the model-config button should show after selection (e.g. "High 200K"). */
	readonly expectedConfigLabel: string;
	readonly scenarioId: string;
	readonly reply: string;
}

const CONFIG_CASES: readonly ConfigCase[] = [
	{ name: 'Low effort, default context', effortLabel: 'Low', expectedEffort: 'low', contextLabel: '128K', expectedCompactThreshold: 115_200, expectedConfigLabel: 'Low 128K', scenarioId: 'smoke-model-config-low-128', reply: 'MOCKED_MODEL_CONFIG_LOW_128' },
	{ name: 'High effort, full context', effortLabel: 'High', expectedEffort: 'high', contextLabel: '170K', expectedCompactThreshold: 153_000, expectedConfigLabel: 'High 170K', scenarioId: 'smoke-model-config-high-170', reply: 'MOCKED_MODEL_CONFIG_HIGH_170' },
	{ name: 'Medium effort, default context', effortLabel: 'Medium', expectedEffort: 'medium', contextLabel: '128K', expectedCompactThreshold: 115_200, expectedConfigLabel: 'Medium 128K', scenarioId: 'smoke-model-config-medium-128', reply: 'MOCKED_MODEL_CONFIG_MEDIUM_128' },
];

/**
 * Find the latest `/responses` request (at or after `fromIndex`) sent for the
 * mock model whose body carries the given scenario tag. The Responses API
 * request includes the user prompt (with its `[scenario:...]` tag) in the
 * `input` array, so a substring match on the serialized body — combined with
 * the `model` field — uniquely identifies the main agent request for a turn.
 */
function findResponsesRequest(requests: CapturedRequest[], fromIndex: number, scenarioTag: string): any | undefined {
	for (let i = requests.length - 1; i >= fromIndex; i--) {
		const request = requests[i];
		if (request.path !== '/responses' || request.body?.model !== MODEL_ID) {
			continue;
		}
		if (JSON.stringify(request.body).includes(scenarioTag)) {
			return request.body;
		}
	}
	return undefined;
}

/**
 * Sends the warm-up message and waits for the model's reply, retrying until the
 * panel is actually usable. In a from-source build the panel's first send can
 * route to the (failing) chat-setup install path until the anonymous
 * entitlement resolves, so a single send is not reliable — each retry gives the
 * entitlement service more time to settle and, once it has, the send reaches the
 * copilot chat participant which activates the extension and replies.
 */
async function sendWarmUpUntilReady(chat: Chat, logger: Logger): Promise<void> {
	const tag = '[scenario:smoke-model-config-warmup]';
	const deadline = Date.now() + 180_000;
	let attempt = 0;
	let lastError: unknown;
	while (Date.now() < deadline) {
		attempt++;
		try {
			await chat.sendMessage(`warm up ${tag}`);
			await chat.waitForResponseText('MOCKED_WARMUP', 25_000);
			logger.log(`[Chat Model Config] warm-up succeeded on attempt ${attempt}`);
			return;
		} catch (error) {
			lastError = error;
			logger.log(`[Chat Model Config] warm-up attempt ${attempt} not ready yet; retrying`);
		}
	}
	throw new Error(`Chat did not become ready for warm-up within timeout. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export function setup(logger: Logger) {

	describe('Chat Model Configuration', function () {
		this.timeout(5 * 60 * 1000);
		this.retries(0);

		let mockServer: MockServerWithRequests;

		before(async function () {
			const { startServer, ScenarioBuilder, registerScenario } = require(getMockLlmServerPath());

			// Fallback for ancillary requests (title generation etc.) that don't
			// carry a [scenario:...] tag.
			registerScenario('text-only', new ScenarioBuilder().emit('OK').build());

			// Warm-up scenario: the first message activates the Copilot extension
			// and registers the models, which populates the model picker.
			registerScenario('smoke-model-config-warmup', new ScenarioBuilder().emit('MOCKED_WARMUP').build());

			// One scenario per case, each emitting a distinct reply so the
			// response-text assertion unambiguously identifies the current turn.
			for (const testCase of CONFIG_CASES) {
				registerScenario(testCase.scenarioId, new ScenarioBuilder().emit(testCase.reply).build());
			}

			mockServer = await startServer(0, { logger: (msg: string) => logger.log(`[mock-llm] ${msg}`) });
			logger.log(`[Chat Model Config] mock LLM server started at ${mockServer.url}`);
		});

		installAllHandlers(logger, opts => {
			const copilotEnv = getCopilotSmokeTestEnv(mockServer);
			return {
				...opts,
				extraArgs: [...(opts.extraArgs ?? []), '--log=trace', '--disable-extensions'],
				extraEnv: {
					...(opts.extraEnv ?? {}),
					...copilotEnv,
					// Keep the built-in copilot-chat extension enabled on the fresh
					// per-run profile. Without this, BuiltinChatExtensionEnablementMigration
					// disables it (since chat setup is never "completed" in automation),
					// so no model provider registers and the panel falls into the
					// failing chat-setup install path. Listing the chat extension here
					// only skips that disable-migration (mirrors what the perf:chat
					// harness does by pre-seeding the storage DB).
					VSCODE_SKIP_BUILTIN_EXTENSIONS: 'GitHub.copilot-chat',
					// Issue a usage-based-billing (UBB) token so the model picker shows
					// the combined "Effort · Context" configuration dropdown (e.g.
					// "High 200K"). `token_based_billing` drives `isUsageBasedBilling`,
					// and the quota snapshots make the extension push the UBB quota
					// state to core (in PRU mode the picker instead appends the effort
					// to the model name and offers no combined dropdown).
					VSCODE_COPILOT_CHAT_TOKEN: buildCopilotChatToken(mockServer.url, {
						token_based_billing: true,
						quota_reset_date: '2099-01-01T00:00:00Z',
						quota_snapshots: {
							chat: { unlimited: true, percent_remaining: 100, has_quota: true, overage_count: 0, overage_permitted: true },
							completions: { unlimited: true, percent_remaining: 100, has_quota: true, overage_count: 0, overage_permitted: true },
							premium_interactions: { unlimited: true, percent_remaining: 100, has_quota: true, overage_count: 0, overage_permitted: true },
						},
					}),
				},
			};
		});

		before(async function () {
			const app = this.app as Application;
			logger.log(`[Chat Model Config] writing user settings (mock URL=${mockServer.url})`);

			await app.workbench.settingsEditor.addUserSettings([
				['github.copilot.advanced.debug.overrideProxyUrl', JSON.stringify(mockServer.url)],
				['github.copilot.advanced.debug.overrideCapiUrl', JSON.stringify(mockServer.url)],
				['github.copilot.advanced.debug.overrideAuthType', '"token"'],
				['chat.allowAnonymousAccess', 'true'],
				['github.copilot.chat.githubMcpServer.enabled', 'false'],
				['chat.mcp.discovery.enabled', 'false'],
				['chat.mcp.enabled', 'false'],
				['chat.disableAIFeatures', 'false'],
				// Enable Responses-API context management so the chosen Context Size
				// is forwarded as a `compact_threshold`. This is an experiment-based
				// setting (default off); set it explicitly for a deterministic run.
				['github.copilot.chat.responsesApiContextManagement.enabled', 'true'],
			]);
			logger.log(`[Chat Model Config] user settings written`);
		});

		after(async function () {
			await mockServer?.close();
		});

		it('forwards the selected reasoning effort and context size to the server', async function () {
			const app = this.app as Application;
			const chat = app.workbench.chat;

			try {
				// Open the panel chat (Agent mode is the default; the context-size
				// override is applied on the agent request path).
				await app.workbench.quickaccess.runCommand('workbench.action.chat.open');
				await chat.waitForChatView();

				// Retry the warm-up send until the model actually replies, which
				// confirms copilot-chat is active and the panel is usable.
				await sendWarmUpUntilReady(chat, logger);

				// Select the mock model that exposes both configuration pickers.
				await chat.selectModel(MODEL_NAME);

				for (const testCase of CONFIG_CASES) {
					logger.log(`[Chat Model Config] case '${testCase.name}': selecting effort='${testCase.effortLabel}', context='${testCase.contextLabel}'`);

					// Select the Thinking Effort and Context Size in the combined
					// model-configuration dropdown.
					await chat.openModelConfig();
					await chat.selectModelConfigOption(testCase.effortLabel);
					await chat.selectModelConfigOption(testCase.contextLabel);
					await chat.closeModelConfig();

					// Consistency check #1: the model-config button reflects the
					// selection (e.g. "High 200K").
					const configLabel = await chat.getModelConfigLabel();
					assert.strictEqual(
						configLabel.replace(/\s+/g, ' ').trim(),
						testCase.expectedConfigLabel,
						`Expected model-config button label '${testCase.expectedConfigLabel}' for '${testCase.name}', got '${configLabel}'.`
					);

					const requestsBefore = mockServer.getRequests().length;
					const scenarioTag = `[scenario:${testCase.scenarioId}]`;

					await chat.sendMessage(`explain this ${scenarioTag}`);
					const responseText = (await chat.waitForResponseText(testCase.reply, 120_000)).trim();

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

					logger.log(`[Chat Model Config] case '${testCase.name}' verified: reasoning.effort='${requestBody.reasoning?.effort}', compact_threshold=${compactThreshold}`);
				}
			} catch (error) {
				logger.log(`[Chat Model Config] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Chat Model Configuration');
				throw error;
			} finally {
				await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
			}
		});
	});
}
