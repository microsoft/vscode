/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { IAction } from 'vs/base/common/actions';
import { MainThreadMessageService } from 'vs/workbench/api/electron-browser/mainThreadMessageService';
import { TPromise as Promise } from 'vs/base/common/winjs.base';
import { IChoiceService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService, INotification } from 'vs/platform/notification/common/notification';

const emptyChoiceService = new class implements IChoiceService {
	_serviceBrand: 'choiceService';
	choose(severity, message, options, modal): never {
		throw new Error('not implemented');
	}
};


const emptyNotificationService = new class implements INotificationService {
	_serviceBrand: 'notificiationService';
	notify(...args: any[]): never {
		throw new Error('not implemented');
	}
	info(...args: any[]): never {
		throw new Error('not implemented');
	}
	warn(...args: any[]): never {
		throw new Error('not implemented');
	}
	error(...args: any[]): never {
		throw new Error('not implemented');
	}
};

suite('ExtHostMessageService', function () {

	test('propagte handle on select', function () {

		let service = new MainThreadMessageService(null, {
			notify(m: INotification) {
				assert.equal(m.actions.primary.length, 1);
				setImmediate(() => m.actions.primary[0].run());
				return undefined;
			}
		} as INotificationService, emptyChoiceService);

		return service.$showMessage(1, 'h', {}, [{ handle: 42, title: 'a thing', isCloseAffordance: true }]).then(handle => {
			assert.equal(handle, 42);
		});
	});

	test('isCloseAffordance', function () {

		let actions: IAction[];
		let service = new MainThreadMessageService(null, {
			notify(m: INotification) {
				actions = m.actions.primary;

				return undefined;
			}
		} as INotificationService, emptyChoiceService);

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

		let actions: IAction[];
		let c: number;
		let service = new MainThreadMessageService(null, {
			notify(m: INotification) {
				c = 0;
				actions = m.actions.primary;
				return {
					dispose: () => {
						c += 1;
					}
				};
			}
		} as INotificationService, emptyChoiceService);

		service.$showMessage(1, '', {}, [{ title: 'a thing', isCloseAffordance: true, handle: 0 }]);
		assert.equal(actions.length, 1);

		actions[0].run();
		assert.equal(c, 1);
	});

	suite('modal', () => {
		test('calls choice service', () => {
			const service = new MainThreadMessageService(null, emptyNotificationService, {
				choose(severity, message, options, modal) {
					assert.equal(severity, 1);
					assert.equal(message, 'h');
					assert.equal(options.length, 2);
					assert.equal(options[1], 'Cancel');
					return Promise.as(0);
				}
			} as IChoiceService);

			return service.$showMessage(1, 'h', { modal: true }, [{ handle: 42, title: 'a thing', isCloseAffordance: false }]).then(handle => {
				assert.equal(handle, 42);
			});
		});

		test('returns undefined when cancelled', () => {
			const service = new MainThreadMessageService(null, emptyNotificationService, {
				choose(severity, message, options, modal) {
					return Promise.as(1);
				}
			} as IChoiceService);

			return service.$showMessage(1, 'h', { modal: true }, [{ handle: 42, title: 'a thing', isCloseAffordance: false }]).then(handle => {
				assert.equal(handle, undefined);
			});
		});

		test('hides Cancel button when not needed', () => {
			const service = new MainThreadMessageService(null, emptyNotificationService, {
				choose(severity, message, options, modal) {
					assert.equal(options.length, 1);
					return Promise.as(0);
				}
			} as IChoiceService);

			return service.$showMessage(1, 'h', { modal: true }, [{ handle: 42, title: 'a thing', isCloseAffordance: true }]).then(handle => {
				assert.equal(handle, 42);
			});
		});
	});
});
