/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtHostMeteredConnection } from '../../common/extHostMeteredConnection.js';

suite('ExtHostMeteredConnection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('initialization corrects the conservative state and fires a change', () => {
		const service = store.add(new ExtHostMeteredConnection());
		const changes: boolean[] = [];
		store.add(service.onDidChangeIsConnectionMetered(value => changes.push(value)));

		assert.strictEqual(service.isConnectionMetered, true);

		service.$initializeIsConnectionMetered(false);
		service.$initializeIsConnectionMetered(false);
		service.$onDidChangeIsConnectionMetered(true);

		assert.deepStrictEqual({
			isConnectionMetered: service.isConnectionMetered,
			changes,
		}, {
			isConnectionMetered: true,
			changes: [false, true],
		});
	});
});
