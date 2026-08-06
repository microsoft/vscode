/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { createGenerationGuardedHandler } from '../../utils/generation';

suite('Generation guarded handler', () => {
	test('ignores values after the generation changes', () => {
		let currentGeneration = 1;
		const handled: string[] = [];
		const handler = createGenerationGuardedHandler<string>(
			currentGeneration,
			() => currentGeneration,
			value => handled.push(value),
		);

		handler('current');
		currentGeneration++;
		handler('stale');

		assert.deepStrictEqual(handled, ['current']);
	});
});
