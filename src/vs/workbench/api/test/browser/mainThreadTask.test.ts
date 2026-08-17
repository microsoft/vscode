/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITaskService } from '../../../contrib/tasks/common/taskService.js';
import { MainThreadTask } from '../../browser/mainThreadTask.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadTask', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('unregisters task systems explicitly and on dispose', function () {
		const events: string[] = [];
		let registrations = 0;
		const taskService = new class extends mock<ITaskService>() {
			override readonly onDidStateChange = Event.None;

			override registerTaskSystem(): IDisposable {
				const registration = ++registrations;
				events.push(`register ${registration}`);
				return toDisposable(() => events.push(`dispose ${registration}`));
			}
		};
		const mainThreadTask = new MainThreadTask(SingleProxyRPCProtocol(null), taskService, undefined!, undefined!);

		mainThreadTask.$registerTaskSystem(0, 'file', { scheme: 'file', authority: '', platform: 'linux' });
		mainThreadTask.$unregisterTaskSystem(0);
		mainThreadTask.$registerTaskSystem(1, 'file', { scheme: 'file', authority: '', platform: 'linux' });

		mainThreadTask.dispose();
		assert.deepStrictEqual(events, ['register 1', 'dispose 1', 'register 2', 'dispose 2']);
	});
});
