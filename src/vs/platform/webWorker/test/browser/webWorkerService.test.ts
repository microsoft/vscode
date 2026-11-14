/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { COI } from '../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getWorkerBootstrapUrl } from '../../browser/webWorkerServiceImpl.js';

suite('WebWorkerService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const [path, expectedPath, query] of [
		['worker.js?v=42', 'worker.js', 'v=42'],
		['worker.js#old', 'worker.js', ''],
		['worker.js?v=42#old', 'worker.js', 'v=42'],
		['worker.js#?not-a-query', 'worker.js', ''],
		['worker.js?v=a?b#old', 'worker.js', 'v=a?b'],
		['worker.js?', 'worker.js', ''],
		['worker.js', 'worker.js', ''],
		[`${globalThis.origin}/worker.js?v=42#old`, `${globalThis.origin}/worker.js`, 'v=42'],
		['worker.js?v=%23%3F&v=two+words#old', 'worker.js', 'v=%23%3F&v=two+words'],
	]) {
		test(`preserves query parameters and replaces fragments in ${path}`, async () => {
			const params = new URLSearchParams(query);
			COI.addSearchParam(params, true, true);
			const expectedUrl = `${expectedPath}${params.size ? `?${params}` : ''}#test-worker`;
			const blobUrl = getWorkerBootstrapUrl('test-worker', path, undefined);
			try {
				const script = await (await fetch(blobUrl)).text();
				assert.ok(script.includes(`await import(ttPolicy?.createScriptURL(${JSON.stringify(expectedUrl)}) ?? ${JSON.stringify(expectedUrl)});`), script);
			} finally {
				URL.revokeObjectURL(blobUrl);
			}
		});
	}

	test('leaves cross-origin worker URLs unchanged', async () => {
		const workerUrl = 'https://example.invalid/worker.js?v=42#old';
		const blobUrl = getWorkerBootstrapUrl('test-worker', workerUrl, undefined);
		try {
			const script = await (await fetch(blobUrl)).text();
			assert.ok(script.includes(`await import(ttPolicy?.createScriptURL(${JSON.stringify(workerUrl)}) ?? ${JSON.stringify(workerUrl)});`), script);
		} finally {
			URL.revokeObjectURL(blobUrl);
		}
	});

});
