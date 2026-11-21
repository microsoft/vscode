/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { _resetInitializedForTesting } from '../../../../base/common/worker/webWorkerBootstrap.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
// eslint-disable-next-line local/code-import-patterns
import { start } from '../../../editor.worker.start.js';

suite('editor.worker.start', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const globalWithOnmessage = globalThis as { onmessage?: ((e: MessageEvent) => void) | null };
	const originalOnMessage = globalWithOnmessage.onmessage;

	teardown(() => {
		globalWithOnmessage.onmessage = originalOnMessage;
		_resetInitializedForTesting();
	});

	test('allows calling ctx.getMirrorModels() synchronously in createClient (#347859)', () => {
		let modelsFromSyncCall: any[] | undefined;
		const client = start((ctx) => {
			modelsFromSyncCall = ctx.getMirrorModels();
			return {
				doWork: () => true
			};
		});

		assert.ok(client);
		assert.strictEqual(client.doWork(), true);
		assert.deepStrictEqual(modelsFromSyncCall, []);
	});

	test('does not permanently wedge initialization state if createClient throws (#347859)', () => {
		assert.throws(() => {
			start(() => {
				throw new Error('sync failure during client creation');
			});
		}, /sync failure during client creation/);

		const client = start(() => ({ ok: true }));
		assert.strictEqual(client.ok, true);
	});
});


