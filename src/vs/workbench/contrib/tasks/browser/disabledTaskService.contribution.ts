/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ITaskService } from '../common/taskService.js';
import { TaskSorter } from '../common/tasks.js';

/** Provides the task API contract to remaining workbench services without task support. */
class DisabledTaskService implements ITaskService {
	declare readonly _serviceBrand: undefined;

	readonly onDidStateChange = Event.None;
	readonly onDidChangeTaskProviders = Event.None;
	isReconnected = false;
	readonly onDidReconnectToTasks = Event.None;
	supportsMultipleTaskExecutions = false;
	readonly onDidChangeTaskSystemInfo = Event.None;
	readonly onDidChangeTaskConfig = Event.None;
	readonly hasTaskSystemInfo = false;

	configureAction(..._args: Parameters<ITaskService['configureAction']>): ReturnType<ITaskService['configureAction']> {
		return new Action('workbench.action.tasks.disabled', 'Tasks are disabled in this build.');
	}

	run(..._args: Parameters<ITaskService['run']>): ReturnType<ITaskService['run']> {
		return Promise.resolve(undefined);
	}

	inTerminal(..._args: Parameters<ITaskService['inTerminal']>): ReturnType<ITaskService['inTerminal']> {
		return false;
	}

	getActiveTasks(..._args: Parameters<ITaskService['getActiveTasks']>): ReturnType<ITaskService['getActiveTasks']> {
		return Promise.resolve([]);
	}

	getBusyTasks(..._args: Parameters<ITaskService['getBusyTasks']>): ReturnType<ITaskService['getBusyTasks']> {
		return Promise.resolve([]);
	}

	terminate(...args: Parameters<ITaskService['terminate']>): ReturnType<ITaskService['terminate']> {
		return Promise.resolve({ success: false, task: args[0] });
	}

	tasks(..._args: Parameters<ITaskService['tasks']>): ReturnType<ITaskService['tasks']> {
		return Promise.resolve([]);
	}

	rerun(..._args: Parameters<ITaskService['rerun']>): ReturnType<ITaskService['rerun']> { }

	getKnownTasks(..._args: Parameters<ITaskService['getKnownTasks']>): ReturnType<ITaskService['getKnownTasks']> {
		return Promise.resolve([]);
	}

	taskTypes(..._args: Parameters<ITaskService['taskTypes']>): ReturnType<ITaskService['taskTypes']> {
		return [];
	}

	getWorkspaceTasks(..._args: Parameters<ITaskService['getWorkspaceTasks']>): ReturnType<ITaskService['getWorkspaceTasks']> {
		return Promise.resolve(new Map());
	}

	getSavedTasks(..._args: Parameters<ITaskService['getSavedTasks']>): ReturnType<ITaskService['getSavedTasks']> {
		return Promise.resolve([]);
	}

	removeRecentlyUsedTask(..._args: Parameters<ITaskService['removeRecentlyUsedTask']>): ReturnType<ITaskService['removeRecentlyUsedTask']> { }

	getTerminalsForTasks(..._args: Parameters<ITaskService['getTerminalsForTasks']>): ReturnType<ITaskService['getTerminalsForTasks']> {
		return undefined;
	}

	getTaskProblems(..._args: Parameters<ITaskService['getTaskProblems']>): ReturnType<ITaskService['getTaskProblems']> {
		return undefined;
	}

	getTask(..._args: Parameters<ITaskService['getTask']>): ReturnType<ITaskService['getTask']> {
		return Promise.resolve(undefined);
	}

	tryResolveTask(..._args: Parameters<ITaskService['tryResolveTask']>): ReturnType<ITaskService['tryResolveTask']> {
		return Promise.resolve(undefined);
	}

	createSorter(..._args: Parameters<ITaskService['createSorter']>): ReturnType<ITaskService['createSorter']> {
		return new TaskSorter([]);
	}

	getTaskDescription(..._args: Parameters<ITaskService['getTaskDescription']>): ReturnType<ITaskService['getTaskDescription']> {
		return undefined;
	}

	customize(..._args: Parameters<ITaskService['customize']>): ReturnType<ITaskService['customize']> {
		return Promise.resolve();
	}

	openConfig(..._args: Parameters<ITaskService['openConfig']>): ReturnType<ITaskService['openConfig']> {
		return Promise.resolve(false);
	}

	registerTaskProvider(..._args: Parameters<ITaskService['registerTaskProvider']>): ReturnType<ITaskService['registerTaskProvider']> {
		return toDisposable(() => undefined);
	}

	registerTaskSystem(..._args: Parameters<ITaskService['registerTaskSystem']>): ReturnType<ITaskService['registerTaskSystem']> { }
	registerSupportedExecutions(..._args: Parameters<ITaskService['registerSupportedExecutions']>): ReturnType<ITaskService['registerSupportedExecutions']> { }

	extensionCallbackTaskComplete(..._args: Parameters<ITaskService['extensionCallbackTaskComplete']>): ReturnType<ITaskService['extensionCallbackTaskComplete']> {
		return Promise.resolve();
	}
}

registerSingleton(ITaskService, DisabledTaskService, InstantiationType.Delayed);
