/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';

export class RunAutomaticTasks extends Disposable implements IWorkbenchContribution {
	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IExtensionService extensionService: IExtensionService,
		@ITaskService taskService: ITaskService) {

		super();

		taskService.workspaceTasks().then(tasks => {
			tasks.forEach(task => {
				if (task.runOptions.startAutomatically) {
					taskService.run(task);
				}
			});
		});
	}

}