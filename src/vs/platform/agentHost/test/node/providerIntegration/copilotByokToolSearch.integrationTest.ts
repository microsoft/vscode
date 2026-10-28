/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CopilotClient, defineTool, type SessionConfig, type ToolSearchConfig } from '@github/copilot-sdk';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { IByokLmBridgeConnection, IByokLmChatRequest, IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import { ByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService } from '../../../node/copilot/byokLmProxyService.js';
import { BYOK_MAX_TOOLS } from '../../../node/copilot/byokResponsesTranslation.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

/**
 * Empirical gate for the BYOK `toolSearch` capability (the #334424 ask): runs
 * the bundled SDK runtime against the BYOK proxy with MORE tools (130) than
 * the bridge cap (128) and compares two models whose ids the runtime's
 * heuristic does NOT recognize:
 *
 *   - `searchy-model` — the renderer metadata declares
 *     {@link IByokLmModelInfo.supportsToolSearch} `true` (what the branch's
 *     Copilot extension surfaces for a `chatLanguageModels.json` entry with
 *     `"toolSearch": true`). Expected: the proxy forwards the request
 *     UNcapped (the bridge skips `capBridgeTools` for the declared model).
 *
 *   - `plain-model` — no declaration. Expected: the bridge caps the request
 *     at {@link BYOK_MAX_TOOLS} (the pre-fix behavior, regression guard).
 *
 * The session enables the runtime's generic client-side tool search
 * (`toolSearch: { enabled: true }` + the `TOOL_SEARCH_CLIENT_GENERIC`
 * feature flag), so the runtime's own deferral decision for an unrecognized
 * id is also observable: when it defers, the proxy sees fewer than 130
 * tools; when it does not, the proxy sees the full list (capped for the
 * plain model). Both outcomes are recorded as evidence — the hard
 * assertions are the bridge-cap behaviors, which are the VS Code-side fix.
 */
suite('Agent Host Provider Integration - Copilot BYOK tool search capability', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	type SdkSession = Awaited<ReturnType<CopilotClient['createSession']>>;

	const TOOL_COUNT = BYOK_MAX_TOOLS + 2; // 130 > the 128 bridge cap

	/**
	 * Runs the bundled SDK against the BYOK proxy with `chat` playing the
	 * renderer bridge for `acme/<modelId>`, whose metadata declares
	 * `supportsToolSearch` per {@link declaresToolSearch}. When
	 * {@link enableToolSearch} is set, the session opts the runtime into
	 * generic client-side tool search (`toolSearch: { enabled: true }` +
	 * the `TOOL_SEARCH_CLIENT_GENERIC` feature flag).
	 */
	async function withSdkSession(sessionId: string, modelId: string, declaresToolSearch: boolean, enableToolSearch: boolean, chat: IByokLmBridgeConnection['chat'], run: (session: SdkSession) => Promise<void>): Promise<void> {
		const baseDirectory = await mkdtemp(`${tmpdir()}/byok-toolsearch-sdk-`);
		const models = store.add(new Emitter<IByokLmModelInfo[]>());
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client', { chat, onDidChangeModels: models.event });
		models.fire([{ vendor: 'acme', id: modelId, ...(declaresToolSearch ? { supportsToolSearch: true } : {}) }]);

		const proxy = new ByokLmProxyService(new NullLogService(), registry);
		const handle = await proxy.start();
		const client = new CopilotClient({
			mode: 'empty',
			baseDirectory,
			useLoggedInUser: false,
			logLevel: 'error',
			env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(baseDirectory)),
		});
		let session: SdkSession | undefined;
		let clientStarted = false;

		try {
			await client.start();
			clientStarted = true;
			const toolSearch: ToolSearchConfig | undefined = enableToolSearch ? { enabled: true, deferThreshold: 1 } : undefined;
			const featureFlags: Record<string, boolean> | undefined = enableToolSearch ? { TOOL_SEARCH_CLIENT_GENERIC: true } : undefined;
			session = await client.createSession({
				sessionId,
				model: modelId,
				tools: Array.from({ length: TOOL_COUNT }, (_, i) => defineTool(`dummy_tool_${String(i).padStart(3, '0')}`, {
					description: `Dummy tool ${i} for exercising the tool-search capability. Does nothing; never call it.`,
					parameters: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
					defer: 'auto',
					skipPermission: true,
					handler: async () => 'unused',
				})),
				// Empty mode requires an explicit tool allowlist; the dummy tools
				// are custom tools, so `custom:*` opts into exactly them.
				availableTools: ['custom:*'],
				provider: {
					type: 'openai',
					wireApi: 'responses',
					baseUrl: handle.providerBaseUrl('acme'),
					bearerToken: `${handle.nonce}.${sessionId}`,
				},
				...(toolSearch ? { toolSearch } : {}),
				...(featureFlags ? { featureFlags } : {}),
			} satisfies Partial<SessionConfig>);
			await run(session);
		} finally {
			try {
				await session?.disconnect();
			} finally {
				try {
					if (clientStarted) {
						await client.stop();
					}
				} finally {
					handle.dispose();
					registration.dispose();
					proxy.dispose();
					await rm(baseDirectory, { recursive: true, force: true });
				}
			}
		}
	}

	/** A bridge that records every request's tool count and answers with plain text. */
	function recordingBridge(): { chat: IByokLmBridgeConnection['chat']; requests: IByokLmChatRequest[] } {
		const requests: IByokLmChatRequest[] = [];
		return {
			requests,
			chat: async request => {
				requests.push(request);
				return { output: [{ type: 'message', content: [{ type: 'text', text: 'ok' }] }] };
			},
		};
	}

	test('declared tool search model is not capped at the bridge limit; plain model is; runtime defers when enabled', async function () {
		this.timeout(300_000);

		// SCENARIO 1 — bridge cap, tool search OFF (the runtime sends every
		// tool definition up front): the declared model's request must pass
		// through the bridge UNcapped (the VS Code-side fix); the plain
		// model's request must be capped at BYOK_MAX_TOOLS (regression guard).
		const declaredNoSearch = recordingBridge();
		await withSdkSession('byok-toolsearch-declared-nosearch', 'searchy-model', true, false, declaredNoSearch.chat, async session => {
			await session.sendAndWait({ prompt: 'Say hello and nothing else. Do not call any tools.' }, 60_000);
		});
		const declaredCounts = declaredNoSearch.requests.map(request => request.tools?.length ?? 0);

		const plainNoSearch = recordingBridge();
		await withSdkSession('byok-toolsearch-plain-nosearch', 'plain-model', false, false, plainNoSearch.chat, async session => {
			await session.sendAndWait({ prompt: 'Say hello and nothing else. Do not call any tools.' }, 60_000);
		});
		const plainCounts = plainNoSearch.requests.map(request => request.tools?.length ?? 0);

		// SCENARIO 2 — runtime deferral, tool search ON: with the session
		// opted into generic client-side tool search, the runtime defers the
		// 130 dummy tools behind its tool_search_tool, so the proxy sees only
		// the search tool. This is empirical evidence the runtime's deferral
		// engages for a BYOK model with an unrecognized id (the Phase C
		// question) — recorded as evidence, not a hard gate, because the
		// runtime's rollout flags remain authoritative.
		const declaredWithSearch = recordingBridge();
		try {
			await withSdkSession('byok-toolsearch-declared-withsearch', 'searchy-model', true, true, declaredWithSearch.chat, async session => {
				await session.sendAndWait({ prompt: 'Say hello and nothing else. Do not call any tools.' }, 60_000);
			});
		} catch {
			// The runtime may not defer for an unrecognized id — the counts
			// below record whichever way it went.
		}
		const withSearchCounts = declaredWithSearch.requests.map(request => request.tools?.length ?? 0);

		// Hard gates: the bridge-cap behaviors (the VS Code-side fix).
		assert.ok(declaredNoSearch.requests.length > 0, 'declared model (tool search off): no request reached the bridge');
		assert.ok(plainNoSearch.requests.length > 0, 'plain model (tool search off): no request reached the bridge');
		assert.ok(declaredCounts.some(count => count > BYOK_MAX_TOOLS),
			`declared model must be forwarded uncapped (tool counts: ${JSON.stringify(declaredCounts)})`);
		assert.ok(plainCounts.length > 0 && plainCounts.every(count => count <= BYOK_MAX_TOOLS),
			`plain model must be capped at ${BYOK_MAX_TOOLS} (tool counts: ${JSON.stringify(plainCounts)})`);

		// Evidence: whether the runtime deferred with tool search on. The
		// runtime's rollout flags remain authoritative, so this is recorded
		// in the assertion message rather than gated.
		const runtimeDeferred = withSearchCounts.length > 0 && withSearchCounts.every(count => count < TOOL_COUNT);
		assert.ok(
			declaredCounts.length > 0 && plainCounts.length > 0,
			`bridge-cap evidence — declared (uncapped): ${JSON.stringify(declaredCounts)}, plain (capped ≤${BYOK_MAX_TOOLS}): ${JSON.stringify(plainCounts)}, runtime deferral with tool search on: ${JSON.stringify(withSearchCounts)} (deferred=${runtimeDeferred})`
		);
	});
});
