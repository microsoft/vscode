/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Orientation, Sash } from '../../../../browser/ui/sash/sash.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Sash', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps a class until all leases are disposed', () => {
		const container = document.createElement('div');
		const sash = store.add(new Sash(container, { getVerticalSashLeft: () => 0 }, { orientation: Orientation.VERTICAL }));
		const firstLease = store.add(sash.addClass('leased'));
		const secondLease = store.add(sash.addClass('leased'));
		const sashElement = container.querySelector('.monaco-sash');
		const states = [sashElement?.classList.contains('leased')];

		firstLease.dispose();
		states.push(sashElement?.classList.contains('leased'));

		secondLease.dispose();
		states.push(sashElement?.classList.contains('leased'));

		assert.deepStrictEqual(states, [true, true, false]);
	});
});