/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { ExecutionEngine } from '../common/tasks.js';
import { AbstractTaskService } from './abstractTaskService.js';
import { ITaskService } from '../common/taskService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
export class TaskService extends AbstractTaskService {
    static { this.ProcessTaskSystemSupportMessage = nls.localize('taskService.processTaskSystem', 'Process task system is not support in the web.'); }
    _getTaskSystem() {
        if (this._taskSystem) {
            return this._taskSystem;
        }
        if (this.executionEngine !== ExecutionEngine.Terminal) {
            throw new Error(TaskService.ProcessTaskSystemSupportMessage);
        }
        this._taskSystem = this._createTerminalTaskSystem();
        this._taskSystemListeners =
            [
                this._taskSystem.onDidStateChange((event) => {
                    this._taskRunningState.set(this._taskSystem.isActiveSync());
                    this._onDidStateChange.fire(event);
                }),
            ];
        return this._taskSystem;
    }
    _computeLegacyConfiguration(workspaceFolder) {
        throw new Error(TaskService.ProcessTaskSystemSupportMessage);
    }
    _versionAndEngineCompatible(filter) {
        return this.executionEngine === ExecutionEngine.Terminal;
    }
}
registerSingleton(ITaskService, TaskService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90YXNrcy9icm93c2VyL3Rhc2tTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFHMUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxtQkFBbUIsRUFBdUMsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRyxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDckUsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRS9HLE1BQU0sT0FBTyxXQUFZLFNBQVEsbUJBQW1CO2FBQzNCLG9DQUErQixHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsK0JBQStCLEVBQUUsZ0RBQWdELENBQUMsQ0FBQztJQUVoSixjQUFjO1FBQ3ZCLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3RCLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQztRQUN6QixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsZUFBZSxLQUFLLGVBQWUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUN2RCxNQUFNLElBQUksS0FBSyxDQUFDLFdBQVcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQzlELENBQUM7UUFDRCxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBQ3BELElBQUksQ0FBQyxvQkFBb0I7WUFDeEI7Z0JBQ0MsSUFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO29CQUMzQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFZLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztvQkFDN0QsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDcEMsQ0FBQyxDQUFDO2FBQ0YsQ0FBQztRQUNILE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUN6QixDQUFDO0lBRVMsMkJBQTJCLENBQUMsZUFBaUM7UUFDdEUsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLENBQUMsK0JBQStCLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRVMsMkJBQTJCLENBQUMsTUFBb0I7UUFDekQsT0FBTyxJQUFJLENBQUMsZUFBZSxLQUFLLGVBQWUsQ0FBQyxRQUFRLENBQUM7SUFDMUQsQ0FBQzs7QUFHRixpQkFBaUIsQ0FBQyxZQUFZLEVBQUUsV0FBVyxvQ0FBNEIsQ0FBQyJ9