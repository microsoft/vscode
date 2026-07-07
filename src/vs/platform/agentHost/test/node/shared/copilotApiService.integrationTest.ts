/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for {@link CopilotApiService.utilityChatCompletion} that
 * hit live GitHub Copilot CAPI. Opt-in only: requires a real GitHub OAuth
 * token with Copilot entitlement in the `COPILOT_GITHUB_TOKEN` environment
 * variable. We deliberately do NOT read `GITHUB_TOKEN` — GitHub Actions
 * sets it for every workflow run but it lacks Copilot access, which would
 * make `scripts/test-integration.sh` fail on PRs instead of skipping.
 *
 * Run via `scripts/test-integration.sh`.
 */

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import product from '../../../../product/common/product.js';
import { IProductService } from '../../../../product/common/productService.js';
import { CopilotApiService } from '../../../node/shared/copilotApiService.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';

suite('CopilotApiService.utilityChatCompletion (real CAPI)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const githubToken = process.env.COPILOT_GITHUB_TOKEN;
	const hasToken = !!githubToken;

	const productService: IProductService = { _serviceBrand: undefined, ...product };

	function createService(): CopilotApiService {
		// Bind fetch to its global receiver — calling an unbound
		// `globalThis.fetch` through `this._fetch(...)` throws
		// "Illegal invocation" in the Electron renderer.
		const boundFetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args);
		return new CopilotApiService(boundFetch, new NullLogService(), productService, createTestGitHubEndpointService());
	}

	(hasToken ? test : test.skip)('answers a trivial arithmetic prompt', async function () {
		this.timeout(30_000);
		const service = createService();
		const answer = await service.utilityChatCompletion(githubToken!, {
			messages: [
				{ role: 'system', content: 'You answer math questions with only the integer result, no words, no punctuation.' },
				{ role: 'user', content: 'What is 1+3?' },
			],
		});
		assert.ok(answer.includes('4'), `expected the answer to contain "4", got: ${JSON.stringify(answer)}`);
	});

	(hasToken ? test : test.skip)('returns the assistant text for a multi-turn prompt', async function () {
		this.timeout(30_000);
		const service = createService();
		const answer = await service.utilityChatCompletion(githubToken!, {
			messages: [
				{ role: 'system', content: 'You reverse the word the user gives you and reply with only the reversed word, nothing else.' },
				{ role: 'user', content: 'hello' },
			],
		});
		assert.strictEqual(answer.trim().toLowerCase(), 'olleh');
	});

	(hasToken ? test : test.skip)('caches the Copilot session token across calls', async function () {
		this.timeout(60_000);
		const service = createService();

		const first = await service.utilityChatCompletion(githubToken!, {
			messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
		});
		const second = await service.utilityChatCompletion(githubToken!, {
			messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
		});

		// Both calls succeed; the second is served from the cached
		// Copilot token + resolved model id. Cache-hit assertions live in
		// the unit-test suite (see copilotApiService.test.ts) where we can
		// count `RequestType.CopilotToken` calls against a fake fetch.
		assert.ok(first.toLowerCase().includes('ok'));
		assert.ok(second.toLowerCase().includes('ok'));
	});
});
