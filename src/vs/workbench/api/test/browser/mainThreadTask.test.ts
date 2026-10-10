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

	test('unregisters task systems on dispose', function () {
		let registrations = 0;
		let disposals = 0;
		const taskService = new class extends mock<ITaskService>() {
			override readonly onDidStateChange = Event.None;

			override registerTaskSystem(): IDisposable {
				registrations++;
				return toDisposable(() => disposals++);
			}
		};
		const mainThreadTask = new MainThreadTask(SingleProxyRPCProtocol(null), taskService, undefined!, undefined!);

		mainThreadTask.$registerTaskSystem('file', { scheme: 'file', authority: '', platform: 'linux' });
		assert.strictEqual(registrations, 1);

		mainThreadTask.dispose();
		assert.strictEqual(disposals, 1);
	});
});
