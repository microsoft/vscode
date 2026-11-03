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
import { getByokLmAgentModelId, isByokLmAgentModelId, type IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import { ByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService } from '../../../node/copilot/byokLmProxyService.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { synthesizeByokSessionConfig } from '../../../node/copilot/copilotSessionLauncher.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

/**
 * Pins the SDK contract that `getByokLmAgentModelId` and `isByokLmAgentModelId`
 * rely on: the runtime lists and selects a BYOK model under the
 * provider-qualified id `provider/id`, and no Copilot (CAPI) model it lists
 * takes that shape. The utility model service uses `isByokLmAgentModelId` to
 * keep a retained BYOK selection off the Copilot route while no renderer serves
 * BYOK models, so a runtime change to the BYOK id format must fail here.
 */
suite('Agent Host Provider Integration - Copilot BYOK selection ids', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const byokModels: IByokLmModelInfo[] = [
		{ vendor: 'acme', id: 'test-model', modelIdentifier: 'acme/test-model' },
		// A configured provider group becomes part of the selection id.
		{ vendor: 'azure', id: 'gpt-5', modelIdentifier: 'azure/work/gpt-5' },
		// Provider-local ids may themselves contain slashes (e.g. Gemini's `models/...`).
		{ vendor: 'gemini', id: 'models/gemini-flash', modelIdentifier: 'gemini/Google/models/gemini-flash' },
	];

	test('the bundled runtime lists and selects BYOK models under the agent host model ids', async function () {
		this.timeout(120_000);

		const sessionId = 'byok-selection-ids';
		const baseDirectory = await mkdtemp(`${tmpdir()}/byok-selection-ids-`);
		const models = store.add(new Emitter<IByokLmModelInfo[]>());
		const registry = new ByokLmBridgeRegistry();
		const registration = registry.register('client', { chat: async () => ({ output: [] }), onDidChangeModels: models.event });
		models.fire(byokModels);
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
		let session: Awaited<ReturnType<CopilotClient['createSession']>> | undefined;

		try {
			const agentModelIds = byokModels.map(getByokLmAgentModelId);
			// The same providers/models config the session launcher passes to the runtime.
			const byok = await synthesizeByokSessionConfig(sessionId, registry, async () => handle, new NullLogService());
			await client.start();
			clientStarted = true;
			session = await client.createSession({ sessionId, model: agentModelIds[0], availableTools: [], ...byok });

			const listedIds = (await session.rpc.model.list()).list.map(entry => (entry as { id: string }).id);
			const selectedIds: (string | undefined)[] = [];
			for (const id of agentModelIds) {
				await session.rpc.model.switchTo({ modelId: id });
				selectedIds.push((await session.rpc.model.getCurrent()).modelId);
			}

			assert.deepStrictEqual({
				agentModelIds,
				byokIdsListed: agentModelIds.every(id => listedIds.includes(id)),
				// Also excludes any Copilot model the runtime lists. Whether it lists
				// Copilot models while signed out depends on whether it can reach the
				// Copilot API, so their presence is not asserted; the agentHostByokLm
				// unit test pins bare Copilot ids deterministically.
				listedIdsWithByokShape: listedIds.filter(isByokLmAgentModelId).sort(),
				selectedIds,
			}, {
				agentModelIds: ['acme/test-model', 'azure/work/gpt-5', 'gemini/Google/models/gemini-flash'],
				byokIdsListed: true,
				listedIdsWithByokShape: [...agentModelIds].sort(),
				selectedIds: agentModelIds,
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
