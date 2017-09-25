/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Action } from 'vs/base/common/actions';
import { MainThreadMessageService } from 'vs/workbench/api/electron-browser/mainThreadMessageService';
import { TPromise as Promise } from 'vs/base/common/winjs.base';

suite('ExtHostMessageService', function () {

	test('propagte handle on select', function () {

		let service = new MainThreadMessageService(null, null, <any>{
			show(sev: number, m: { message; actions: Action[] }) {
				assert.equal(m.actions.length, 1);
				setImmediate(() => m.actions[0].run());
				return () => { };
			}
		}, <any>{
			choose() {
				throw new Error('not implemented');
			}
		});

		return service.$showMessage(1, 'h', {}, [{ handle: 42, title: 'a thing', isCloseAffordance: true }]).then(handle => {
			assert.equal(handle, 42);
		});
	});

	test('isCloseAffordance', function () {

		let actions: Action[];
		let service = new MainThreadMessageService(null, null, <any>{
			show(sev: number, m: { message; actions: Action[] }) {
				actions = m.actions;
			}
		}, <any>{
			choose() {
				throw new Error('not implemented');
			}
		});

		// default close action
		service.$showMessage(1, '', {}, [{ title: 'a thing', isCloseAffordance: false, handle: 0 }]);
		assert.equal(actions.length, 2);
		let [first, second] = actions;
		assert.equal(first.label, 'a thing');
		assert.equal(second.label, 'Close');

		// override close action
		service.$showMessage(1, '', {}, [{ title: 'a thing', isCloseAffordance: true, handle: 0 }]);
		assert.equal(actions.length, 1);
		first = actions[0];
		assert.equal(first.label, 'a thing');
	});

	test('hide on select', function () {

		let actions: Action[];
		let c: number;
		let service = new MainThreadMessageService(null, null, <any>{
			show(sev: number, m: { message; actions: Action[] }) {
				c = 0;
				actions = m.actions;
				return () => {
					c += 1;
				};
			}
		}, <any>{
			choose() {
				throw new Error('not implemented');
			}
		});

		service.$showMessage(1, '', {}, [{ title: 'a thing', isCloseAffordance: true, handle: 0 }]);
		assert.equal(actions.length, 1);

		actions[0].run();
		assert.equal(c, 1);
	});

	suite('modal', () => {
		test('calls choice service', () => {
			const service = new MainThreadMessageService(null, null, <any>{
				show(sev: number, m: { message; actions: Action[] }) {
					throw new Error('not implemented');
				}
			}, <any>{
				choose(severity, message, options, modal) {
					assert.equal(severity, 1);
					assert.equal(message, 'h');
					assert.equal(options.length, 2);
					assert.equal(options[1], 'Cancel');
					return Promise.as(0);
				}
			});

			return service.$showMessage(1, 'h', { modal: true }, [{ handle: 42, title: 'a thing', isCloseAffordance: false }]).then(handle => {
				assert.equal(handle, 42);
			});
		});

		test('returns undefined when cancelled', () => {
			const service = new MainThreadMessageService(null, null, <any>{
				show(sev: number, m: { message; actions: Action[] }) {
					throw new Error('not implemented');
				}
			}, <any>{
				choose(severity, message, options, modal) {
					return Promise.as(1);
				}
			});

			return service.$showMessage(1, 'h', { modal: true }, [{ handle: 42, title: 'a thing', isCloseAffordance: false }]).then(handle => {
				assert.equal(handle, undefined);
			});
		});

		test('hides Cancel button when not needed', () => {
			const service = new MainThreadMessageService(null, null, <any>{
				show(sev: number, m: { message; actions: Action[] }) {
					throw new Error('not implemented');
				}
			}, <any>{
				choose(severity, message, options, modal) {
					assert.equal(options.length, 1);
					return Promise.as(0);
				}
			});

			return service.$showMessage(1, 'h', { modal: true }, [{ handle: 42, title: 'a thing', isCloseAffordance: true }]).then(handle => {
				assert.equal(handle, 42);
			});
		});
	});
});
