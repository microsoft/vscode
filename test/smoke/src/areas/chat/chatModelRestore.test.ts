/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import fetch from 'node-fetch';
import { Application, ApplicationOptions, Chat, Logger } from '../../../../automation';
import { getCopilotSmokeTestEnv, getMockLlmServerPath, installAllHandlers, MockLlmServer, preseedChatExtensionEnablement } from '../../utils';

/**
 * A non-default, picker-enabled mock model. Reused from the `Chat Model
 * Configuration` suite because it is already proven selectable in the panel
 * chat, and it is NOT the chat default — so a successful restore assertion
 * cannot be a coincidence of the default happening to match.
 */
const MODEL_NAME = 'Mock Config Model';
const MODEL_ID = 'mock-config-model';

const WARMUP_SCENARIO_ID = 'smoke-model-restore-warmup';
const WARMUP_REPLY = 'MOCKED_MODEL_RESTORE_WARMUP';

/**
 * Hide (or, with an empty array, re-show) the given models on the mock server so
 * a reloaded client re-fetching `/models` sees the updated set. Uses the mock's
 * `POST /_control/models` test endpoint (see `mock-llm-server.ts`).
 */
async function setHiddenModels(mockUrl: string, ids: string[]): Promise<void> {
	const res = await fetch(`${mockUrl}/_control/models`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ hidden: ids }),
	});
	if (!res.ok) {
		throw new Error(`Failed to set hidden models (HTTP ${res.status})`);
	}
}

/**
 * Sends the warm-up message and waits for the model's reply, retrying until the
 * panel is actually usable. In a from-source build the panel's first send can
 * route to the (failing) chat-setup install path until the anonymous
 * entitlement resolves, so a single send is not reliable — each retry gives the
 * entitlement service more time to settle. Mirrors `chatModelConfig.test.ts`.
 */
async function sendWarmUpUntilReady(chat: Chat, logger: Logger): Promise<void> {
	const tag = `[scenario:${WARMUP_SCENARIO_ID}]`;
	const deadline = Date.now() + 180_000;
	let attempt = 0;
	let lastError: unknown;
	while (Date.now() < deadline) {
		attempt++;
		try {
			await chat.sendMessage(`warm up ${tag}`);
			await chat.waitForResponseText(WARMUP_REPLY, 25_000);
			logger.log(`[Chat Model Restore] warm-up succeeded on attempt ${attempt}`);
			return;
		} catch (error) {
			lastError = error;
			logger.log(`[Chat Model Restore] warm-up attempt ${attempt} not ready yet; retrying`);
		}
	}
	throw new Error(`Chat did not become ready for warm-up within timeout. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

/**
 * Open the panel chat and warm it up so the Copilot extension is active and the
 * model list is populated (which makes the model picker usable). Safe to call
 * again after a window reload.
 */
async function openAndWarmUpChat(app: Application, logger: Logger): Promise<Chat> {
	await app.workbench.quickaccess.runCommand('workbench.action.chat.open');
	const chat = app.workbench.chat;
	await chat.waitForChatView();
	await sendWarmUpUntilReady(chat, logger);
	return chat;
}

/**
 * Register the mock LLM server, app env, and Copilot user settings for a panel
 * chat model-restore suite. Each suite gets its OWN app instance (its own
 * `installAllHandlers`) so a reload/restart in one test can't leave state that
 * corrupts another test's warm-up. Returns an accessor for the started mock URL.
 */
function installPanelChatSuite(logger: Logger): { readonly url: string } {
	let mockServer: MockLlmServer;

	before(async function () {
		const { startServer, ScenarioBuilder, registerScenario } = require(getMockLlmServerPath());
		// Fallback for ancillary requests (title generation etc.) with no tag.
		registerScenario('text-only', new ScenarioBuilder().emit('OK').build());
		registerScenario(WARMUP_SCENARIO_ID, new ScenarioBuilder().emit(WARMUP_REPLY).build());
		mockServer = await startServer(0, { logger: (msg: string) => logger.log(`[mock-llm] ${msg}`) });
		logger.log(`[Chat Model Restore] mock LLM server started at ${mockServer.url}`);
	});

	installAllHandlers(logger, (opts: ApplicationOptions) => {
		const copilotEnv = getCopilotSmokeTestEnv(mockServer);
		return {
			...opts,
			extraArgs: [...(opts.extraArgs ?? []), '--log=trace'],
			extraEnv: { ...(opts.extraEnv ?? {}), ...copilotEnv },
		};
	}, app => {
		// Keep the from-source built-in copilot-chat enabled on the fresh
		// per-run profile (see `chatModelConfig.test.ts`).
		preseedChatExtensionEnablement(app.userDataPath);
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
		logger.log(`[Chat Model Restore] user settings written (mock URL=${mockServer.url})`);
	});

	after(async function () {
		await mockServer?.close();
	});

	return { get url() { return mockServer.url; } };
}

export function setup(logger: Logger) {

	describe('Chat Model Restore', function () {
		this.timeout(6 * 60 * 1000);
		this.retries(0);

		installPanelChatSuite(logger);

		it('restores the last selected model after a window reload', async function () {
			const app = this.app as Application;

			// Select a non-default model, then confirm the picker committed to it.
			let chat = await openAndWarmUpChat(app, logger);
			await chat.selectModel(MODEL_NAME);
			await chat.waitForSelectedModel(MODEL_NAME);

			// Full window relaunch (reuses the same user-data dir, so the persisted
			// model selection survives — this is the scenario the "all windows
			// switched to Auto" regression broke).
			await app.restart();

			chat = await openAndWarmUpChat(app, logger);
			await chat.waitForSelectedModel(MODEL_NAME);
			const restored = await chat.getSelectedModelName();
			assert.ok(
				restored.includes(MODEL_NAME),
				`Expected the model picker to restore '${MODEL_NAME}' after reload, got '${restored}'.`
			);
		});
	});

	// Isolated in its own suite (own app) so the multi-restart flow can't
	// contaminate — or be contaminated by — the reload test above.
	describe('Chat Model Restore (fallback)', function () {
		this.timeout(8 * 60 * 1000);
		this.retries(0);

		const mock = installPanelChatSuite(logger);

		after(async function () {
			// Re-show all models so a hidden set can't leak into a later suite.
			try { await setHiddenModels(mock.url, []); } catch { /* server may be closing */ }
		});

		it('keeps the picked model when it is temporarily unavailable and restores it when it returns', async function () {
			const app = this.app as Application;

			// Pick the model — this persists it as the user's explicit choice.
			let chat = await openAndWarmUpChat(app, logger);
			await chat.selectModel(MODEL_NAME);
			await chat.waitForSelectedModel(MODEL_NAME);

			// The model disappears from the advertised list (as if removed
			// server-side or gated off after an update). After reload the client
			// must fall back to another model WITHOUT overwriting the stored pick.
			await setHiddenModels(mock.url, [MODEL_ID]);
			await app.restart();

			chat = await openAndWarmUpChat(app, logger);
			const fallback = await chat.getSelectedModelName();
			assert.ok(
				!fallback.includes(MODEL_NAME),
				`Expected the picker to fall back to another model while '${MODEL_NAME}' is unavailable, but it still shows '${fallback}'.`
			);

			// The model becomes available again. Because the fallback was never
			// stored as the user's choice, the persisted preference still points at
			// the picked model, so after reload the picker flips back to it.
			await setHiddenModels(mock.url, []);
			await app.restart();

			chat = await openAndWarmUpChat(app, logger);
			await chat.waitForSelectedModel(MODEL_NAME);
			const restored = await chat.getSelectedModelName();
			assert.ok(
				restored.includes(MODEL_NAME),
				`Expected the picker to flip back to '${MODEL_NAME}' once it is available again, got '${restored}'. ` +
				`This means the transient fallback was wrongly persisted as the user's choice.`
			);
		});
	});
}
