/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { findContextMenuHost, markAsContextMenuHost } from '../../browser/contextmenu.js';
import { $ } from '../../browser/dom.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('Context menu hosts', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('finds the nearest declared host, including the element itself, until disposed', () => {
		const outer = $('div');
		const inner = outer.appendChild($('div'));
		const leaf = inner.appendChild($('span'));
		const outerDeclaration = store.add(markAsContextMenuHost(outer));
		const innerDeclaration = markAsContextMenuHost(inner);

		const nested = [findContextMenuHost(leaf), findContextMenuHost(inner), findContextMenuHost(outer)];
		innerDeclaration.dispose();
		const afterInnerDisposed = findContextMenuHost(leaf);
		outerDeclaration.dispose();

		assert.deepStrictEqual({ nested, afterInnerDisposed, afterAllDisposed: findContextMenuHost(leaf), none: findContextMenuHost(undefined) }, {
			nested: [inner, inner, outer],
			afterInnerDisposed: outer,
			afterAllDisposed: undefined,
			none: undefined,
		});
	});
});
