/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createJevScorer } from './jevClient';

async function main(): Promise<void> {
	const apiKey = process.env.JEV_API_KEY;
	if (!apiKey) {
		throw new Error('Set JEV_API_KEY locally to run this explicit live, synthetic-only probe. No workspace files are read.');
	}
	const model = process.env.JEV_MODEL ?? 'jev-latest';
	const scorer = createJevScorer({ apiKey, model });
	const results = await scorer('Which snippet retries a failed request?', [
		{ id: 'retry', text: 'async function retryRequest(request) { try { return await request(); } catch { return request(); } }' },
		{ id: 'cache', text: 'function clearCache(cache) { cache.clear(); }' },
	], new AbortController().signal);
	console.log(JSON.stringify({ mode: 'live-jev-synthetic-probe', model, results }, null, 2));
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : 'The Jev probe failed.');
	process.exitCode = 1;
});
