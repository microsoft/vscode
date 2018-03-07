/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { MainThreadMessageService } from 'vs/workbench/api/electron-browser/mainThreadMessageService';
import { TPromise as Promise, TPromise } from 'vs/base/common/winjs.base';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService, INotification, NoOpNotification, INotificationHandle } from 'vs/platform/notification/common/notification';
import { ICommandService } from 'vs/platform/commands/common/commands';

const emptyDialogService = new class implements IDialogService {
	_serviceBrand: 'choiceService';
	show(severity, message, options): never {
		throw new Error('not implemented');
	}

	confirm(...opts): never {
		throw new Error('not implemented');
	}
};

const emptyCommandService: ICommandService = {
	_serviceBrand: undefined,
	onWillExecuteCommand: () => ({ dispose: () => { } }),
	executeCommand: (commandId: string, ...args: any[]): TPromise<any> => {
		return TPromise.as(void 0);
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

class EmptyNotificationService implements INotificationService {

	_serviceBrand: any;

	constructor(private withNotify: (notification: INotification) => void) {
	}

	notify(notification: INotification): INotificationHandle {
		this.withNotify(notification);

		return new NoOpNotification();
	}
	info(message: any): void {
		throw new Error('Method not implemented.');
	}
	warn(message: any): void {
		throw new Error('Method not implemented.');
	}
	error(message: any): void {
		throw new Error('Method not implemented.');
	}
}

suite('ExtHostMessageService', function () {

	test('propagte handle on select', function () {

		let service = new MainThreadMessageService(null, new EmptyNotificationService(notification => {
			assert.equal(notification.actions.primary.length, 1);
			setImmediate(() => notification.actions.primary[0].run());
		}), emptyCommandService, emptyDialogService, null);

		return service.$showMessage(1, 'h', {}, [{ handle: 42, title: 'a thing', isCloseAffordance: true }]).then(handle => {
			assert.equal(handle, 42);
		});
	});

	suite('modal', () => {
		test('calls choice service', () => {
			const service = new MainThreadMessageService(null, emptyNotificationService, emptyCommandService, {
				show(severity, message, options) {
					assert.equal(severity, 1);
					assert.equal(message, 'h');
					assert.equal(options.length, 2);
					assert.equal(options[1], 'Cancel');
					return Promise.as(0);
				}
			} as IDialogService, null);

			return service.$showMessage(1, 'h', { modal: true }, [{ handle: 42, title: 'a thing', isCloseAffordance: false }]).then(handle => {
				assert.equal(handle, 42);
			});
		});

		test('returns undefined when cancelled', () => {
			const service = new MainThreadMessageService(null, emptyNotificationService, emptyCommandService, {
				show(severity, message, options) {
					return Promise.as(1);
				}
			} as IDialogService, null);

			return service.$showMessage(1, 'h', { modal: true }, [{ handle: 42, title: 'a thing', isCloseAffordance: false }]).then(handle => {
				assert.equal(handle, undefined);
			});
		});

		test('hides Cancel button when not needed', () => {
			const service = new MainThreadMessageService(null, emptyNotificationService, emptyCommandService, {
				show(severity, message, options) {
					assert.equal(options.length, 1);
					return Promise.as(0);
				}
			} as IDialogService, null);

			return service.$showMessage(1, 'h', { modal: true }, [{ handle: 42, title: 'a thing', isCloseAffordance: true }]).then(handle => {
				assert.equal(handle, 42);
			});
		});
	});
});
