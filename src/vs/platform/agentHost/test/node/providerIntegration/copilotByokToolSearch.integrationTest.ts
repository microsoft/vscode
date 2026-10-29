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
 *     `"toolSearch": true`).
 *
 *   - `plain-model` — no declaration.
 *
 * With tool search OFF (deferral inactive), the runtime sends the eager list
 * and BOTH models must be capped at {@link BYOK_MAX_TOOLS}: the capability
 * alone must not bypass the cap when the request shows no active deferral.
 * With tool search ON (the session config the production launcher sends), the
 * runtime defers the tools behind its tool-search tool and the declared
 * model's deferred list must pass through the bridge UNcapped.
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
	 * generic client-side tool search the way the production launcher does
	 * (`toolSearch: { enabled: true, deferThreshold: 1 }` in the session
	 * config — no harness-only feature flags).
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
		// tool definition up front): the eager list must still be capped for
		// BOTH models — the capability alone must not bypass the cap when the
		// request shows no active deferral (no tool-search tool in the list).
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

		// SCENARIO 2 — runtime deferral, tool search ON: the session opts into
		// generic client-side tool search the way the production launcher does,
		// so the runtime defers the 130 dummy tools behind its tool-search
		// tool and the proxy sees only the deferred subset. The declared model
		// must be forwarded UNcapped (the deferred list is already small); the
		// plain model's deferred list is under the cap either way, so the
		// deferral itself is the gate here.
		const declaredWithSearch = recordingBridge();
		await withSdkSession('byok-toolsearch-declared-withsearch', 'searchy-model', true, true, declaredWithSearch.chat, async session => {
			await session.sendAndWait({ prompt: 'Say hello and nothing else. Do not call any tools.' }, 60_000);
		});
		const withSearchCounts = declaredWithSearch.requests.map(request => request.tools?.length ?? 0);

		// Hard gates — scenario 1: the eager list is capped for both models.
		assert.ok(declaredNoSearch.requests.length > 0, 'declared model (tool search off): no request reached the bridge');
		assert.ok(plainNoSearch.requests.length > 0, 'plain model (tool search off): no request reached the bridge');
		assert.ok(declaredCounts.every(count => count <= BYOK_MAX_TOOLS),
			`declared model with deferral inactive must still be capped at ${BYOK_MAX_TOOLS} (tool counts: ${JSON.stringify(declaredCounts)})`);
		assert.ok(plainCounts.every(count => count <= BYOK_MAX_TOOLS),
			`plain model must be capped at ${BYOK_MAX_TOOLS} (tool counts: ${JSON.stringify(plainCounts)})`);

		// Hard gates — scenario 2: the runtime deferred the tools (every
		// request carries fewer than the full 130) and the declared model's
		// deferred list passed through the bridge uncapped.
		assert.ok(withSearchCounts.length > 0, 'declared model (tool search on): no request reached the bridge');
		assert.ok(withSearchCounts.every(count => count < TOOL_COUNT),
			`runtime must defer tools behind tool search when enabled (tool counts: ${JSON.stringify(withSearchCounts)})`);
		assert.ok(withSearchCounts.some(count => count > 0),
			`deferred requests must carry the tool-search tool (tool counts: ${JSON.stringify(withSearchCounts)})`);
	});
});
