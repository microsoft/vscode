/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as Platform from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { TaskService } from '../../browser/taskService.js';

suite('AbstractTaskService', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('removes task system info and emits a change when disposed', function () {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly remoteAuthority = undefined;
		});
		instantiationService.stub(IOutputService, { getChannel: () => undefined });
		instantiationService.stub(IConfigurationResolverService, { contributeVariable: () => { } });
		instantiationService.stub(ITerminalService, { whenConnected: Promise.resolve(), instances: [] });
		const registerCommand = sinon.spy(CommandsRegistry, 'registerCommand');
		let taskService: TaskService;
		try {
			taskService = store.add(instantiationService.createInstance(TaskService));
		} finally {
			for (const call of registerCommand.getCalls()) {
				store.add(call.returnValue);
			}
			registerCommand.restore();
		}
		taskService.registerSupportedExecutions(true, true, true);

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
