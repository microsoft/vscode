/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Chat, Logger } from '../../../../automation';
import { dumpFailureDiagnostics, getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer, preseedChatExtensionEnablement } from '../../utils';

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
 * selects a Context Size (and, unless it is verifying the untouched default, a
 * Thinking Effort) in the model-picker UI, sends a tagged prompt, and verifies
 * the values the mock server received in the `/responses` request body:
 *  - reasoning effort  → `body.reasoning.effort`
 *  - context size      → `body.context_management[0].compact_threshold`
 *
 * Numbers mirror a GPT-5.5-class model. The compaction threshold is
 * `floor(maxPromptTokens * 0.9)`. The default tier exposes a 272000 prompt
 * window (→ 244800). The long tier is the full window minus the 128000 output
 * reserve — `1050000 - 128000 = 922000` (→ 829800); note `formatTokenCount`
 * renders 922000 as "1M" (its `>900K → 1M` branch). The context-usage gauge
 * total is `maxInputTokens(tier) + maxOutputTokens`, i.e. `272000 + 128000 =
 * 400000` ("400K") and `922000 + 128000 = 1050000` ("1M").
 */
interface ConfigCase {
	readonly name: string;
	/**
	 * Thinking Effort label to select, or `undefined` to leave the picker
	 * untouched and verify its schema default (`medium`) is forwarded. A case
	 * that relies on the default must run before any case selects an effort (the
	 * per-editor config is sticky), so it is listed first.
	 */
	readonly effortLabel?: string;
	readonly expectedEffort: string;
	readonly contextLabel: string;
	readonly expectedCompactThreshold: number;
	/** The combined label the model-config button should show after selection (e.g. "High 1M"). */
	readonly expectedConfigLabel: string;
	/** The context-window denominator the context-usage gauge details popup should show. */
	readonly expectedContextWindowLabel: string;
	readonly scenarioId: string;
	readonly reply: string;
}

const CONFIG_CASES: readonly ConfigCase[] = [
	// Listed first so the Thinking Effort picker is still at its schema default
	// (`medium`): this case leaves the effort untouched and only selects the
	// context size, verifying that an unmodified picker forwards its default.
	{ name: 'Default effort (untouched), full context', expectedEffort: 'medium', contextLabel: '1M', expectedCompactThreshold: 829_800, expectedConfigLabel: 'Medium 1M', expectedContextWindowLabel: '1M', scenarioId: 'smoke-model-config-default-long', reply: 'MOCKED_MODEL_CONFIG_DEFAULT_LONG' },
	{ name: 'High effort, full context', effortLabel: 'High', expectedEffort: 'high', contextLabel: '1M', expectedCompactThreshold: 829_800, expectedConfigLabel: 'High 1M', expectedContextWindowLabel: '1M', scenarioId: 'smoke-model-config-high-long', reply: 'MOCKED_MODEL_CONFIG_HIGH_LONG' },
	{ name: 'Medium effort, default context', effortLabel: 'Medium', expectedEffort: 'medium', contextLabel: '272K', expectedCompactThreshold: 244_800, expectedConfigLabel: 'Medium 272K', expectedContextWindowLabel: '400K', scenarioId: 'smoke-model-config-medium-default', reply: 'MOCKED_MODEL_CONFIG_MEDIUM_DEFAULT' },
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
		if (request.path !== '/responses' || request.body?.model !== MODEL_ID) {
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

			mockServer = await startServer(0, { logger: (msg: string) => logger.log(`[mock-llm] ${msg}`), captureRequests: true });
			logger.log(`[Chat Model Config] mock LLM server started at ${mockServer.url}`);
		});

		installAllHandlers(logger, opts => {
			const copilotEnv = getCopilotSmokeTestEnv(mockServer);
			return {
				...opts,
				extraArgs: [...(opts.extraArgs ?? []), '--log=trace'],
				extraEnv: {
					...(opts.extraEnv ?? {}),
					...copilotEnv,
				},
			};
		}, app => {
			// Seed the migration storage key so the from-source built-in
			// copilot-chat stays enabled on the fresh per-run profile. Without
			// this, BuiltinChatExtensionEnablementMigration disables it (chat
			// setup is never "completed" in automation) and the first send fails
			// through chat-setup's install path before the warm-up retry recovers.
			preseedChatExtensionEnablement(app.userDataPath);
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
				// Show the context-usage gauge so the test can verify the denominator
				// (context window) reflects the selected Context Size.
				['chat.contextUsage.enabled', 'true'],
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
				// override is applied on the agent request path). Select the local
				// harness explicitly since the panel default is Agent Host Copilot
				// when the agent host is enabled.
				await app.workbench.quickaccess.runCommand('smoketest.openLocalChat');
				await chat.waitForChatView();

				// Retry the warm-up send until the model actually replies, which
				// confirms copilot-chat is active and the panel is usable.
				await sendWarmUpUntilReady(chat, logger);

				// Select the mock model that exposes both configuration pickers.
				await chat.selectModel(MODEL_NAME);

				for (const testCase of CONFIG_CASES) {
					logger.log(`[Chat Model Config] case '${testCase.name}': selecting effort='${testCase.effortLabel ?? '(default)'}', context='${testCase.contextLabel}'`);

					// Select the Thinking Effort (when the case specifies one) and the
					// Context Size in the combined model-configuration dropdown. Cases
					// without an `effortLabel` leave the effort picker untouched to verify
					// its default is forwarded.
					await chat.openModelConfig();
					if (testCase.effortLabel) {
						await chat.selectModelConfigOption(testCase.effortLabel);
					}
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

					// Consistency check #2: the context-usage gauge's context-window
					// denominator reflects the selected Context Size (gauge total =
					// maxInputTokens(tier) + maxOutputTokens). The gauge renders once the
					// response's token usage lands, so this reads the details popup.
					const usageLabel = await chat.readContextUsageTokenLabel();
					const contextWindowLabel = usageLabel.match(/\/\s*([\d.]+[KM]?)\s*tokens/)?.[1];
					assert.strictEqual(
						contextWindowLabel,
						testCase.expectedContextWindowLabel,
						`Expected context-usage gauge denominator='${testCase.expectedContextWindowLabel}' for '${testCase.name}', got '${contextWindowLabel}' (full label '${usageLabel}').`
					);

					logger.log(`[Chat Model Config] case '${testCase.name}' verified: reasoning.effort='${requestBody.reasoning?.effort}', compact_threshold=${compactThreshold}, contextWindow='${contextWindowLabel}'`);
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
