/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { Schemas } from '../../../../../base/common/network.js';
import * as Platform from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { createTaskService, taskSystemInfo } from './taskTestUtils.js';

suite('AbstractTaskService', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('removes task system info and emits a change when disposed', function () {
		const { taskService } = createTaskService(store);

		const states: boolean[] = [];
		store.add(taskService.onDidChangeTaskSystemInfo(() => states.push(taskService.hasTaskSystemInfo)));
		const registration = store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Linux)));

		registration.dispose();

		assert.deepStrictEqual(states, [true, false]);
	});

	for (const webFirst of [false, true]) {
		for (const disposeNativeFirst of [false, true]) {
			test(`preserves same-scheme task system selection (web registered first: ${webFirst}, native disposed first: ${disposeNativeFirst})`, () => {
				const { taskService, instantiationService } = createTaskService(store);
				const nativeInfo = taskSystemInfo(Platform.Platform.Linux);
				const webInfo = taskSystemInfo(Platform.Platform.Web);
				// Web registrations use the first workspace folder's scheme.
				const scheme = instantiationService.get(IWorkspaceContextService).getWorkspace().folders[0].uri.scheme;
				const [firstInfo, secondInfo] = webFirst ? [webInfo, nativeInfo] : [nativeInfo, webInfo];
				const first = store.add(taskService.registerTaskSystem(scheme, firstInfo));
				const second = store.add(taskService.registerTaskSystem(scheme, secondInfo));
				const native = webFirst ? second : first;
				const web = webFirst ? first : second;
				const states: (typeof nativeInfo | undefined)[] = [];
				const recordSelection = () => states.push(taskService.getTaskSystemInfo(scheme));
				store.add(taskService.onDidChangeTaskSystemInfo(recordSelection));
				recordSelection();

				const removed = disposeNativeFirst ? native : web;
				const survivor = disposeNativeFirst ? web : native;
				removed.dispose();
				// Repeated disposal must leave the survivor and notification count intact.
				removed.dispose();
				survivor.dispose();

				assert.deepStrictEqual({ states, hasTaskSystemInfo: taskService.hasTaskSystemInfo }, {
					states: [nativeInfo, disposeNativeFirst ? webInfo : nativeInfo, undefined], hasTaskSystemInfo: false
				});
			});
		}
	}
});
