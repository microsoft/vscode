/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {Action} from 'vs/base/common/actions';
import {MainThreadMessageService} from 'vs/workbench/api/node/mainThreadMessageService';

suite('ExtHostMessageService', function () {

	test('propagte handle on select', function () {

		let service = new MainThreadMessageService(<any>{
			show(sev: number, m: { message; actions: Action[] }) {
				assert.equal(m.actions.length, 1);
				setImmediate(() => m.actions[0].run());
				return () => { };
			}
		});

		return service.$showMessage(1, 'h', [{ handle: 42, title: 'a thing', isCloseAffordance: true }]).then(handle => {
			assert.equal(handle, 42);
		});
	});

	test('isCloseAffordance', function () {

		let actions: Action[];
		let service = new MainThreadMessageService(<any>{
			show(sev: number, m: { message; actions: Action[] }) {
				actions = m.actions;
			}
		});

		// default close action
		service.$showMessage(1, '', [{ title: 'a thing', isCloseAffordance: false, handle: 0 }]);
		assert.equal(actions.length, 2);
		let [first, second] = actions;
		assert.equal(first.label, 'a thing');
		assert.equal(second.label, 'Close');

		// override close action
		service.$showMessage(1, '', [{ title: 'a thing', isCloseAffordance: true, handle: 0 }]);
		assert.equal(actions.length, 1);
		first = actions[0];
		assert.equal(first.label, 'a thing');
	});

	test('hide on select', function () {

		let actions: Action[];
		let c: number;
		let service = new MainThreadMessageService(<any>{
			show(sev: number, m: { message; actions: Action[] }) {
				c = 0;
				actions = m.actions;
				return () => {
					c += 1;
				};
			}
		});

		service.$showMessage(1, '', [{ title: 'a thing', isCloseAffordance: true, handle: 0 }]);
		assert.equal(actions.length, 1);

		actions[0].run();
		assert.equal(c, 1);
	});
});
