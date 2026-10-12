/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CopilotClient } from '@github/copilot-sdk';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import type { ModelSelection } from '../../../common/state/protocol/state.js';
import { ByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService } from '../../../node/copilot/byokLmProxyService.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { ContextSizeConfigKey, synthesizeByokSessionConfig } from '../../../node/copilot/copilotSessionLauncher.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

/**
 * Pins the runtime contract behind a BYOK model's "Context Size" picker: the
 * bundled SDK compacts a session against the `maxPromptTokens` its per-session
 * `ProviderModelConfig` registers, re-reads that limit when `provider.sync`
 * replaces the registration (how `CopilotAgentSession.setModel` applies a
 * mid-session change), and honors it on resume. The limits come from the
 * production `synthesizeByokSessionConfig`, so a change to how a selection is
 * sized fails here, not just in the picker.
 */
suite('Agent Host Provider Integration - Copilot BYOK context size', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	type SdkSession = Awaited<ReturnType<CopilotClient['createSession']>>;

	const model: IByokLmModelInfo = {
		vendor: 'acme',
		id: 'opus',
		modelIdentifier: 'acme/opus',
		maxContextWindowTokens: 1_000_000,
		maxPromptTokens: 968_000,
		maxOutputTokens: 32_000,
		contextSizeOptions: { values: [200_000, 968_000], default: 968_000 },
	};
	const selection = (contextSize: number): ModelSelection => ({ id: 'acme/opus', config: { [ContextSizeConfigKey]: contextSize } });

	test('the bundled runtime compacts against the selected context size at launch, after a change, and on resume', async function () {
		this.timeout(180_000);

		const sessionId = 'byok-context-size';
		const baseDirectory = await mkdtemp(`${tmpdir()}/byok-context-size-`);
		const models = store.add(new Emitter<IByokLmModelInfo[]>());
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client', {
			chat: async () => ({ output: [{ type: 'message', content: [{ type: 'text', text: 'ok' }] }], usage: { inputTokens: 10, outputTokens: 1 } }),
			onDidChangeModels: models.event,
		});
		models.fire([model]);
		const proxy = new ByokLmProxyService(new NullLogService(), registry);
		const handle = await proxy.start();
		const client = new CopilotClient({
			mode: 'empty',
			baseDirectory,
			useLoggedInUser: false,
			logLevel: 'error',
			env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(baseDirectory)),
		});
		let clientStarted = false;
		let session: SdkSession | undefined;

		/** Runs one turn and reports the limits the runtime applied to it. */
		const turnLimits = async (session: SdkSession) => {
			const limits: { tokenLimit?: number; maxPromptTokens?: number } = {};
			const listeners = [
				session.on('session.usage_info', e => { limits.tokenLimit = e.data.tokenLimit; }),
				session.on('assistant.usage', e => { limits.maxPromptTokens = e.data.maxPromptTokens; }),
			];
			try {
				await session.sendAndWait({ prompt: 'Reply exactly ok.' }, 60_000);
			} finally {
				listeners.forEach(dispose => dispose());
			}
			return limits;
		};
		const configFor = (model: ModelSelection) => synthesizeByokSessionConfig(sessionId, registry, async () => handle, new NullLogService(), model);

		try {
			await client.start();
			clientStarted = true;
			session = await client.createSession({ sessionId, model: 'acme/opus', availableTools: [], ...await configFor(selection(200_000)) });
			const atLaunch = await turnLimits(session);

			// A mid-session change re-registers the model at the new size, then re-selects it.
			await session.rpc.provider.sync(await configFor(selection(968_000)));
			await session.setModel('acme/opus');
			const afterChange = await turnLimits(session);

			// A resume registers the model at the size stored with the session's selection.
			await session.disconnect();
			session = await client.resumeSession(sessionId, { availableTools: [], ...await configFor(selection(200_000)) });
			const afterResume = await turnLimits(session);

			assert.deepStrictEqual({ atLaunch, afterChange, afterResume }, {
				atLaunch: { tokenLimit: 200_000, maxPromptTokens: 200_000 },
				afterChange: { tokenLimit: 968_000, maxPromptTokens: 968_000 },
				afterResume: { tokenLimit: 200_000, maxPromptTokens: 200_000 },
			});
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
	});
});
