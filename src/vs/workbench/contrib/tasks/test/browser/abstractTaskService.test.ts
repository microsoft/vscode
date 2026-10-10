/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import * as Platform from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AbstractTaskService } from '../../browser/abstractTaskService.js';
import { ITaskSystemInfo } from '../../common/taskSystem.js';

suite('AbstractTaskService', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('removes task system info and emits a change when disposed', function () {
		const taskSystemInfoEmitter = store.add(new Emitter<void>());
		const taskService = Object.create(AbstractTaskService.prototype) as AbstractTaskService;
		Reflect.set(taskService, '_taskSystemInfos', new Map<string, ITaskSystemInfo[]>());
		Reflect.set(taskService, '_environmentService', { remoteAuthority: undefined });
		Reflect.set(taskService, '_onDidChangeTaskSystemInfo', taskSystemInfoEmitter);
		Reflect.set(taskService, 'onDidChangeTaskSystemInfo', taskSystemInfoEmitter.event);

		const states: boolean[] = [];
		store.add(taskService.onDidChangeTaskSystemInfo(() => states.push(taskService.hasTaskSystemInfo)));
		const registration = store.add(taskService.registerTaskSystem('file', {
			platform: Platform.Platform.Linux,
			context: undefined,
			uriProvider: path => URI.file(path),
			resolveVariables: async () => undefined,
			findExecutable: async () => undefined
		}));

		registration.dispose();

		assert.deepStrictEqual(states, [true, false]);
	});
});
