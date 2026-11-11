/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CopilotClient } from '@github/copilot-sdk';
import { DeferredPromise, raceTimeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { IByokLmChatRequest, IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import { ByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService } from '../../../node/copilot/byokLmProxyService.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { synthesizeByokSessionConfig } from '../../../node/copilot/copilotSessionLauncher.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

suite('Agent Host Provider Integration - Copilot model switch compaction', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a smaller-context switch requires compaction before the target serves the next turn', async function () {
		this.timeout(120_000);
		const sessionId = 'byok-model-switch-compaction';
		const baseDirectory = await mkdtemp(`${tmpdir()}/byok-model-switch-`);
		const models = store.add(new Emitter<IByokLmModelInfo[]>());
		const registry = new ByokLmBridgeRegistry();
		const requests: IByokLmChatRequest[] = [];
		const summaryStarted = new DeferredPromise<void>();
		const summaryCompleted = new DeferredPromise<void>();
		const registration = registry.register('client', {
			onDidChangeModels: models.event,
			chat: async request => {
				requests.push(request);
				if (requests.length === 2) {
					void summaryStarted.complete();
					await summaryCompleted.p;
				}
				return {
					output: [{ type: 'message', content: [{ type: 'text', text: '<summary>Preserve SENTINEL-SWITCH. This synthetic diagnostic changed no files; answer directly.</summary>' }] }],
					usage: { inputTokens: requests.length === 1 ? 90_000 : 4_000, outputTokens: 30 },
				};
			},
		});
		models.fire([
			{ vendor: 'acme', id: 'large', maxContextWindowTokens: 131_072, maxPromptTokens: 122_880, maxOutputTokens: 8_192 },
			{ vendor: 'acme', id: 'small', maxContextWindowTokens: 65_536, maxPromptTokens: 57_344, maxOutputTokens: 8_192 },
		]);
		const proxy = new ByokLmProxyService(new NullLogService(), registry);
		const handle = await proxy.start();
		const client = new CopilotClient({
			mode: 'empty', baseDirectory, useLoggedInUser: false, logLevel: 'error',
			env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(baseDirectory)),
		});
		let session: Awaited<ReturnType<CopilotClient['createSession']>> | undefined;
		let clientStarted = false;
		try {
			const byok = await synthesizeByokSessionConfig(sessionId, registry, async () => handle, new NullLogService());
			await client.start();
			clientStarted = true;
			session = await client.createSession({
				sessionId, model: 'acme/large', availableTools: [], ...byok,
				infiniteSessions: { enabled: false },
				systemMessage: { mode: 'replace', content: 'Preserve SENTINEL-SWITCH. Reply directly without tools.' },
			});
			const unchanged = await session.rpc.model.switchTo({ modelId: 'acme/large' });
			await session.sendAndWait({ prompt: 'Conversation detail. '.repeat(30_000) + 'SENTINEL-SWITCH' }, 30_000);
			const beforeSwitch = requests.length;
			const confirmation = await session.rpc.model.switchTo({ modelId: 'acme/small' });
			const retained = await session.rpc.model.getCurrent();
			const switching = session.rpc.model.switchTo({ modelId: 'acme/small', compactionDecision: 'compact' });
			const started = await raceTimeout(Promise.race([summaryStarted.p.then(() => true), switching.then(() => false)]), 30_000);
			assert.strictEqual(started, true, 'The switch must wait for summary inference');
			const duringSummary = await session.rpc.model.getCurrent();
			await summaryCompleted.complete();
			const applied = await switching;
			await session.sendAndWait({ prompt: 'Reply with the retained sentinel.' }, 30_000);
			const continuation = requests.at(-1)!;

			assert.deepStrictEqual({
				unchanged: { status: unchanged.status, model: unchanged.modelId },
				confirmation: confirmation.status,
				retainedModel: retained.modelId,
				duringSummary: duringSummary.modelId,
				applied: { status: applied.status, model: applied.modelId },
				summaryModel: requests[beforeSwitch].modelId,
				continuationModel: continuation.modelId,
				sentinel: JSON.stringify(continuation.input).includes('SENTINEL-SWITCH'),
				historyReduced: JSON.stringify(continuation.input).length < JSON.stringify(requests[0].input).length / 10,
			}, {
				unchanged: { status: 'applied', model: 'acme/large' },
				confirmation: 'confirmation_required', retainedModel: 'acme/large', duringSummary: 'acme/large',
				applied: { status: 'applied', model: 'acme/small' },
				summaryModel: 'large', continuationModel: 'small', sentinel: true, historyReduced: true,
			});
		} finally {
			await summaryCompleted.complete();
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
	});
});
