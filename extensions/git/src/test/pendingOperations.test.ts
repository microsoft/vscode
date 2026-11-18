/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { PendingOperations } from '../util';

suite('PendingOperations', () => {

	test('settled resolves immediately without operations', async () => {
		await new PendingOperations().settled();
	});

	test('settled waits for tracked operations, including failed and later ones', async () => {
		const operations = new PendingOperations();
		const log: string[] = [];

		let finishFirst!: () => void;
		operations.track(new Promise<void>(resolve => finishFirst = resolve).then(() => {
			log.push('first');
			// Started while waiting
			operations.track(new Promise<void>(resolve => setTimeout(resolve, 10)).then(() => log.push('nested')));
		}));
		operations.track(Promise.reject(new Error('failed'))).catch(() => log.push('failed'));

		const settled = operations.settled().then(() => log.push('settled'));
		finishFirst();
		await settled;

		assert.deepStrictEqual(log, ['failed', 'first', 'nested', 'settled']);
	});
});
