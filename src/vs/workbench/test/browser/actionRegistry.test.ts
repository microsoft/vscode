/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as Platform from 'vs/platform/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { Extensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actionRegistry';
import { prepareActions } from 'vs/workbench/browser/actionBarRegistry';
import { Action } from 'vs/base/common/actions';


class MyClass extends Action {
	constructor(id: string, label: string) {
		super(id, label);
	}
}

suite('Workbench Action Registry', () => {

	test('Workbench Action Registration', function () {
		let Registry = <IWorkbenchActionRegistry>Platform.Registry.as(Extensions.WorkbenchActions);

		let d = new SyncActionDescriptor(MyClass, 'id', 'name');

		let oldActions = Registry.getWorkbenchActions().slice(0);
		let oldCount = Registry.getWorkbenchActions().length;

		Registry.registerWorkbenchAction(d, 'My Alias', 'category');
		Registry.registerWorkbenchAction(d, null);

		assert.equal(Registry.getWorkbenchActions().length, 1 + oldCount);
		assert.strictEqual(d, Registry.getWorkbenchAction('id'));

		assert.deepEqual(Registry.getAlias(d.id), 'My Alias');
		assert.equal(Registry.getCategory(d.id), 'category');

		(<any>Registry).setWorkbenchActions(oldActions);
	});

	test('Workbench Action Bar prepareActions()', function () {
		let a1 = new Separator();
		let a2 = new Separator();
		let a3 = new Action('a3');
		let a4 = new Separator();
		let a5 = new Separator();
		let a6 = new Action('a6');
		let a7 = new Separator();

		let actions = prepareActions([a1, a2, a3, a4, a5, a6, a7]);
		assert.strictEqual(actions.length, 3); // duplicate separators get removed
		assert(actions[0] === a3);
		assert(actions[1] === a5);
		assert(actions[2] === a6);
	});
});