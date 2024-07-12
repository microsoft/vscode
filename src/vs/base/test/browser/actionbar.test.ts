/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ActionBar, prepareActions } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action, Separator } from 'vs/base/common/actions';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Actionbar', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('prepareActions()', function () {
		const a1 = new Separator();
		const a2 = new Separator();
		const a3 = store.add(new Action('a3'));
		const a4 = new Separator();
		const a5 = new Separator();
		const a6 = store.add(new Action('a6'));
		const a7 = new Separator();

		const actions = prepareActions([a1, a2, a3, a4, a5, a6, a7]);
		assert.strictEqual(actions.length, 3); // duplicate separators get removed
		assert(actions[0] === a3);
		assert(actions[1] === a5);
		assert(actions[2] === a6);
	});

	test('hasAction()', function () {
		const container = document.createElement('div');
		const actionbar = store.add(new ActionBar(container));

		const a1 = store.add(new Action('a1'));
		const a2 = store.add(new Action('a2'));

		actionbar.push(a1);
		assert.strictEqual(actionbar.hasAction(a1), true);
		assert.strictEqual(actionbar.hasAction(a2), false);

		actionbar.pull(0);
		assert.strictEqual(actionbar.hasAction(a1), false);

		actionbar.push(a1, { index: 1 });
		actionbar.push(a2, { index: 0 });
		assert.strictEqual(actionbar.hasAction(a1), true);
		assert.strictEqual(actionbar.hasAction(a2), true);

		actionbar.pull(0);
		assert.strictEqual(actionbar.hasAction(a1), true);
		assert.strictEqual(actionbar.hasAction(a2), false);

		actionbar.pull(0);
		assert.strictEqual(actionbar.hasAction(a1), false);
		assert.strictEqual(actionbar.hasAction(a2), false);

		actionbar.push(a1);
		assert.strictEqual(actionbar.hasAction(a1), true);
		actionbar.clear();
		assert.strictEqual(actionbar.hasAction(a1), false);
	});
});
