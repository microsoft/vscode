/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { classifyViewport, SessionsLayoutPolicy } from '../../browser/layoutPolicy.js';

suite('Sessions layout presentation policy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('default classification still follows the shared platform and width policy', () => {
		const policy = store.add(new SessionsLayoutPolicy());
		const widths = [390, 900, 1400];
		const actual = widths.map(width => {
			policy.update(width, 800);
			return policy.viewportClass.get();
		});
		assert.deepStrictEqual(actual, widths.map(classifyViewport));
	});

	test('an entry-owned viewport remains fixed across container changes', () => {
		const policy = store.add(new SessionsLayoutPolicy('phone'));
		const initial = policy.viewportClass.get();
		policy.update(1400, 800);
		assert.deepStrictEqual({
			initial, resized: policy.viewportClass.get(), phone: policy.isPhoneLayout.get(),
			visibility: policy.getPartVisibilityDefaults(),
		}, {
			initial: 'phone', resized: 'phone', phone: true,
			visibility: { sidebar: false, auxiliaryBar: false, panel: false, sessions: true, editor: false },
		});
	});
});
