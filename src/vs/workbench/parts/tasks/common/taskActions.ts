/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Action } from 'vs/base/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';

export class RunTaskAction extends Action {

	public static ID = 'workbench.action.taskAction.runTask';
	public static LABEL = nls.localize('runTaskAction', "Run task");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(context?: any): TPromise<any> {
		this.commandService.executeCommand('workbench.action.tasks.runTask');
		return TPromise.as(null);
	}
}

export class RestartTaskAction extends Action {

	public static ID = 'workbench.action.taskAction.restartTask';
	public static LABEL = nls.localize('restartTaskAction', "Restart task");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(context?: any): TPromise<any> {
		this.commandService.executeCommand('workbench.action.tasks.restartTask');
		return TPromise.as(null);
	}
}

export class TerminateTaskAction extends Action {

	public static ID = 'workbench.action.taskAction.terminateTask';
	public static LABEL = nls.localize('terminateTaskAction', "Terminate task");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(context?: any): TPromise<any> {
		this.commandService.executeCommand('workbench.action.tasks.terminate');
		return TPromise.as(null);
	}
}

export class BuildTaskAction extends Action {

	public static ID = 'workbench.action.taskAction.build';
	public static LABEL = nls.localize('buildTaskAction', "Build task");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(context?: any): TPromise<any> {
		this.commandService.executeCommand('workbench.action.tasks.build');
		return TPromise.as(null);
	}
}

export class TestTaskAction extends Action {

	public static ID = 'workbench.action.taskAction.test';
	public static LABEL = nls.localize('testTaskAction', "Test task");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(context?: any): TPromise<any> {
		this.commandService.executeCommand('workbench.action.tasks.test');
		return TPromise.as(null);
	}
}

export class ShowTaskLogAction extends Action {

	public static ID = 'workbench.action.taskAction.showLog';
	public static LABEL = nls.localize('showTaskLogAction', "Show task log");

	constructor(
		id: string,
		label: string,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label);
	}

	public run(context?: any): TPromise<any> {
		this.commandService.executeCommand('workbench.action.tasks.showLog');
		return TPromise.as(null);
	}
}

Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(RunTaskAction, RunTaskAction.ID, RunTaskAction.LABEL), 'Run Task');
Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(RestartTaskAction, RestartTaskAction.ID, RestartTaskAction.LABEL), 'Restart Task');
Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(TerminateTaskAction, TerminateTaskAction.ID, TerminateTaskAction.LABEL), 'Terminate Task');
Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(BuildTaskAction, BuildTaskAction.ID, BuildTaskAction.LABEL), 'Build Task');
Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(TestTaskAction, TestTaskAction.ID, TestTaskAction.LABEL), 'Test Task');
Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(ShowTaskLogAction, ShowTaskLogAction.ID, ShowTaskLogAction.LABEL), 'Show Task Log');