/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import * as Platform from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { TaskService } from '../../browser/taskService.js';
import { ITaskService } from '../../common/taskService.js';
import { ITaskSystemInfo } from '../../common/taskSystem.js';

class TestTaskService extends TaskService {
	get whenTaskSystemReady(): Promise<void> {
		return this._whenTaskSystemReady;
	}

	getTaskSystemInfo(key: string): ITaskSystemInfo | undefined {
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Inspect registration selection without a production test API.
		return this['_getTaskSystemInfo'](key);
	}

	removeTaskSystem(key: string): void {
		this._taskSystemInfos.delete(key);
		const emitter = Reflect.get(this, '_onDidChangeTaskSystemInfo') as Emitter<void>;
		emitter.fire();
	}
}

export function createTaskService(store: DisposableStore, remoteAuthority: string | undefined = undefined) {
	const instantiationService = workbenchInstantiationService(undefined, store);
	instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
		override readonly remoteAuthority = remoteAuthority;
	});
	instantiationService.stub(IOutputService, { getChannel: () => undefined });
	instantiationService.stub(IConfigurationResolverService, { contributeVariable: () => { } });
	instantiationService.stub(ITerminalService, { whenConnected: Promise.resolve(), instances: [] });
	const registerCommand = sinon.spy(CommandsRegistry, 'registerCommand');
	let taskService: TestTaskService;
	try {
		taskService = store.add(instantiationService.createInstance(TestTaskService));
	} finally {
		for (const call of registerCommand.getCalls()) {
			store.add(call.returnValue);
		}
		registerCommand.restore();
	}
	taskService.registerSupportedExecutions(true, true, true);
	instantiationService.stub(ITaskService, taskService);
	return { taskService, instantiationService };
}

export function taskSystemInfo(platform: Platform.Platform): ITaskSystemInfo {
	return {
		platform,
		context: undefined,
		uriProvider: path => URI.file(path),
		resolveVariables: async () => undefined,
		findExecutable: async () => undefined,
	};
}
