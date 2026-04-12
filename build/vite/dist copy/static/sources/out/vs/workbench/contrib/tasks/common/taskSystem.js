/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var TaskErrors;
(function (TaskErrors) {
    TaskErrors[TaskErrors["NotConfigured"] = 0] = "NotConfigured";
    TaskErrors[TaskErrors["RunningTask"] = 1] = "RunningTask";
    TaskErrors[TaskErrors["NoBuildTask"] = 2] = "NoBuildTask";
    TaskErrors[TaskErrors["NoTestTask"] = 3] = "NoTestTask";
    TaskErrors[TaskErrors["ConfigValidationError"] = 4] = "ConfigValidationError";
    TaskErrors[TaskErrors["TaskNotFound"] = 5] = "TaskNotFound";
    TaskErrors[TaskErrors["NoValidTaskRunner"] = 6] = "NoValidTaskRunner";
    TaskErrors[TaskErrors["UnknownError"] = 7] = "UnknownError";
})(TaskErrors || (TaskErrors = {}));
export class VerifiedTask {
    constructor(task, resolver, trigger) {
        this.task = task;
        this.resolver = resolver;
        this.trigger = trigger;
    }
    verify() {
        let verified = false;
        if (this.trigger && this.resolvedVariables && this.workspaceFolder && (this.shellLaunchConfig !== undefined)) {
            verified = true;
        }
        return verified;
    }
    getVerifiedTask() {
        if (this.verify()) {
            return { task: this.task, resolver: this.resolver, trigger: this.trigger, resolvedVariables: this.resolvedVariables, systemInfo: this.systemInfo, workspaceFolder: this.workspaceFolder, shellLaunchConfig: this.shellLaunchConfig };
        }
        else {
            throw new Error('VerifiedTask was not checked. verify must be checked before getVerifiedTask.');
        }
    }
}
export class TaskError {
    constructor(severity, message, code) {
        this.severity = severity;
        this.message = message;
        this.code = code;
    }
}
export var Triggers;
(function (Triggers) {
    Triggers.shortcut = 'shortcut';
    Triggers.command = 'command';
    Triggers.reconnect = 'reconnect';
})(Triggers || (Triggers = {}));
export var TaskExecuteKind;
(function (TaskExecuteKind) {
    TaskExecuteKind[TaskExecuteKind["Started"] = 1] = "Started";
    TaskExecuteKind[TaskExecuteKind["Active"] = 2] = "Active";
})(TaskExecuteKind || (TaskExecuteKind = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza1N5c3RlbS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi90YXNrU3lzdGVtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBZWhHLE1BQU0sQ0FBTixJQUFrQixVQVNqQjtBQVRELFdBQWtCLFVBQVU7SUFDM0IsNkRBQWEsQ0FBQTtJQUNiLHlEQUFXLENBQUE7SUFDWCx5REFBVyxDQUFBO0lBQ1gsdURBQVUsQ0FBQTtJQUNWLDZFQUFxQixDQUFBO0lBQ3JCLDJEQUFZLENBQUE7SUFDWixxRUFBaUIsQ0FBQTtJQUNqQiwyREFBWSxDQUFBO0FBQ2IsQ0FBQyxFQVRpQixVQUFVLEtBQVYsVUFBVSxRQVMzQjtBQUVELE1BQU0sT0FBTyxZQUFZO0lBU3hCLFlBQVksSUFBVSxFQUFFLFFBQXVCLEVBQUUsT0FBZTtRQUMvRCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztJQUN4QixDQUFDO0lBRU0sTUFBTTtRQUNaLElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQztRQUNyQixJQUFJLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLGlCQUFpQixJQUFJLElBQUksQ0FBQyxlQUFlLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEtBQUssU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUM5RyxRQUFRLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLENBQUM7UUFDRCxPQUFPLFFBQVEsQ0FBQztJQUNqQixDQUFDO0lBRU0sZUFBZTtRQUNyQixJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO1lBQ25CLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxJQUFJLENBQUMsaUJBQWtCLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFXLEVBQUUsZUFBZSxFQUFFLElBQUksQ0FBQyxlQUFnQixFQUFFLGlCQUFpQixFQUFFLElBQUksQ0FBQyxpQkFBa0IsRUFBRSxDQUFDO1FBQzFPLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxJQUFJLEtBQUssQ0FBQyw4RUFBOEUsQ0FBQyxDQUFDO1FBQ2pHLENBQUM7SUFDRixDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sU0FBUztJQUtyQixZQUFZLFFBQWtCLEVBQUUsT0FBZSxFQUFFLElBQWdCO1FBQ2hFLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ2xCLENBQUM7Q0FDRDtBQUVELE1BQU0sS0FBVyxRQUFRLENBSXhCO0FBSkQsV0FBaUIsUUFBUTtJQUNYLGlCQUFRLEdBQVcsVUFBVSxDQUFDO0lBQzlCLGdCQUFPLEdBQVcsU0FBUyxDQUFDO0lBQzVCLGtCQUFTLEdBQVcsV0FBVyxDQUFDO0FBQzlDLENBQUMsRUFKZ0IsUUFBUSxLQUFSLFFBQVEsUUFJeEI7QUFTRCxNQUFNLENBQU4sSUFBa0IsZUFHakI7QUFIRCxXQUFrQixlQUFlO0lBQ2hDLDJEQUFXLENBQUE7SUFDWCx5REFBVSxDQUFBO0FBQ1gsQ0FBQyxFQUhpQixlQUFlLEtBQWYsZUFBZSxRQUdoQyJ9