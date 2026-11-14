/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { throttle } from '../decorators';

suite('Git decorators', () => {
	test('throttle runs queued calls after rejection', async () => {
		class Runner {
			@throttle
			run(result: Promise<string>): Promise<string> {
				return result;
			}
		}

		const runner = new Runner();
		const error = new Error('Connection failed');
		const first = runner.run(Promise.reject(error));
		const queued = runner.run(Promise.resolve('retried'));

		await assert.rejects(first, reason => reason === error);
		assert.strictEqual(await queued, 'retried');
		assert.strictEqual(await runner.run(Promise.resolve('later')), 'later');
	});
});
