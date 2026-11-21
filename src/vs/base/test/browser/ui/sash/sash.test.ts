/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Orientation, Sash } from '../../../../browser/ui/sash/sash.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Sash', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps leased and pre-existing classes until their owners release them', () => {
		const container = document.createElement('div');
		const sash = store.add(new Sash(container, { getVerticalSashLeft: () => 0 }, { orientation: Orientation.VERTICAL }));
		const firstLease = store.add(sash.addClass('leased'));
		const secondLease = store.add(sash.addClass('leased'));
		const preExistingClassLease = store.add(sash.addClass('vertical'));
		const sashElement = container.querySelector('.monaco-sash');
		const leasedClassStates = [sashElement?.classList.contains('leased')];

		firstLease.dispose();
		leasedClassStates.push(sashElement?.classList.contains('leased'));

		secondLease.dispose();
		leasedClassStates.push(sashElement?.classList.contains('leased'));

		preExistingClassLease.dispose();

		assert.deepStrictEqual({
			leasedClassStates,
			preExistingClassAfterRelease: sashElement?.classList.contains('vertical'),
		}, {
			leasedClassStates: [true, true, false],
			preExistingClassAfterRelease: true,
		});
	});
});
