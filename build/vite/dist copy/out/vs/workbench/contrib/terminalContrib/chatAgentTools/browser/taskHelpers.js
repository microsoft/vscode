/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { timeout } from '../../../../../base/common/async.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { getOutput } from './outputHelpers.js';
import { OutputMonitor } from './tools/monitoring/outputMonitor.js';
import { OutputMonitorState } from './tools/monitoring/types.js';
import { Event } from '../../../../../base/common/event.js';
import { isString } from '../../../../../base/common/types.js';
export function getTaskDefinition(id) {
    const idx = id.indexOf(': ');
    const taskType = id.substring(0, idx);
    let taskLabel = idx > 0 ? id.substring(idx + 2) : id;
    if (/^\d+$/.test(taskLabel)) {
        taskLabel = id;
    }
    return { taskLabel, taskType };
}
export function getTaskRepresentation(task) {
    if (Object.hasOwn(task, 'label') && task.label) {
        return task.label;
    }
    else if (Object.hasOwn(task, 'script') && task.script) {
        return task.script;
    }
    else if (Object.hasOwn(task, 'command') && task.command) {
        const command = task.command;
        return isString(command) ? command : command.name?.toString() || '';
    }
    return '';
}
export function getTaskKey(task) {
    return task.getKey() ?? task.getMapKey();
}
export function tasksMatch(a, b) {
    if (!a || !b) {
        return false;
    }
    if (getTaskKey(a) === getTaskKey(b)) {
        return true;
    }
    if (a.getCommonTaskId?.() === b.getCommonTaskId?.()) {
        return true;
    }
    return a._id === b._id;
}
export async function getTaskForTool(id, taskDefinition, workspaceFolder, configurationService, taskService, allowParentTask) {
    let index = 0;
    let task;
    const workspaceFolderToTaskMap = await taskService.getWorkspaceTasks();
    let configTasks = [];
    for (const folder of workspaceFolderToTaskMap.keys()) {
        const tasksConfig = configurationService.getValue('tasks', { resource: URI.parse(folder) });
        if (tasksConfig?.tasks) {
            configTasks = configTasks.concat(tasksConfig.tasks);
        }
    }
    for (const configTask of configTasks) {
        if ((!allowParentTask && !configTask.type) || (Object.hasOwn(configTask, 'hide') && configTask.hide)) {
            // Skip these as they are not included in the agent prompt and we need to align with
            // the indices used there.
            continue;
        }
        if ((configTask.type && taskDefinition.taskType ? configTask.type === taskDefinition.taskType : true) &&
            ((getTaskRepresentation(configTask) === taskDefinition?.taskLabel) || (id === configTask.label))) {
            task = configTask;
            break;
        }
        else if (!configTask.label && id === `${configTask.type}: ${index}`) {
            task = configTask;
            break;
        }
        index++;
    }
    if (!task) {
        return;
    }
    let tasksForWorkspace;
    const workspaceFolderPath = URI.file(workspaceFolder).path;
    for (const [folder, tasks] of workspaceFolderToTaskMap) {
        if (URI.parse(folder).path === workspaceFolderPath) {
            tasksForWorkspace = tasks;
            break;
        }
    }
    if (!tasksForWorkspace) {
        return;
    }
    const configuringTasks = tasksForWorkspace.configurations?.byIdentifier;
    const configuredTask = Object.values(configuringTasks ?? {}).find(t => {
        return t.type === task.type && (t._label === task.label || t._label === `${task.type}: ${getTaskRepresentation(task)}` || t._label === getTaskRepresentation(task));
    });
    let resolvedTask;
    if (configuredTask) {
        resolvedTask = await taskService.tryResolveTask(configuredTask);
    }
    if (!resolvedTask) {
        const customTasks = tasksForWorkspace.set?.tasks;
        resolvedTask = customTasks?.find(t => task.label === t._label || task.label === t._label);
    }
    return resolvedTask;
}
export async function resolveDependencyTasks(parentTask, workspaceFolder, configurationService, taskService) {
    if (!parentTask.configurationProperties?.dependsOn) {
        return undefined;
    }
    const dependencyTasks = await Promise.all(parentTask.configurationProperties.dependsOn.map(async (dep) => {
        const depId = isString(dep.task) ? dep.task : dep.task?._key;
        if (!depId) {
            return undefined;
        }
        return await getTaskForTool(depId, { taskLabel: depId }, workspaceFolder, configurationService, taskService);
    }));
    return dependencyTasks.filter((t) => t !== undefined);
}
/**
 * Collects output, polling duration, and idle status for all terminals.
 */
export async function collectTerminalResults(terminals, task, instantiationService, invocationContext, progress, token, disposableStore, isActive, dependencyTasks, taskService, startMarkersByTerminalInstanceId) {
    const results = [];
    if (token.isCancellationRequested) {
        return results;
    }
    const commonTaskIdToTaskMap = {};
    const taskIdToTaskMap = {};
    const taskLabelToTaskMap = {};
    for (const dependencyTask of dependencyTasks ?? []) {
        commonTaskIdToTaskMap[dependencyTask.getCommonTaskId()] = dependencyTask;
        taskIdToTaskMap[dependencyTask._id] = dependencyTask;
        taskLabelToTaskMap[dependencyTask._label] = dependencyTask;
    }
    // Process all terminals in parallel
    const terminalNames = terminals.map(t => t.shellLaunchConfig.name ?? t.title ?? 'unknown');
    progress.report({ message: new MarkdownString(`Checking output for ${terminalNames.map(n => `\`${n}\``).join(', ')}`) });
    const terminalPromises = terminals.map(async (instance) => {
        const startMarker = startMarkersByTerminalInstanceId
            ? startMarkersByTerminalInstanceId.get(instance.instanceId)
            : instance.registerMarker();
        let terminalTask = task;
        // For composite tasks, find the actual dependency task running in this terminal
        if (dependencyTasks?.length) {
            // Use reconnection data if possible to match, since the properties here are unique
            const reconnectionData = instance.reconnectionProperties?.data;
            if (reconnectionData) {
                if (Object.hasOwn(commonTaskIdToTaskMap, reconnectionData.lastTask)) {
                    terminalTask = commonTaskIdToTaskMap[reconnectionData.lastTask];
                }
                else if (Object.hasOwn(taskIdToTaskMap, reconnectionData.id)) {
                    terminalTask = taskIdToTaskMap[reconnectionData.id];
                }
            }
            else {
                // Otherwise, fallback to label matching
                if (instance.shellLaunchConfig.name && Object.hasOwn(taskLabelToTaskMap, instance.shellLaunchConfig.name)) {
                    terminalTask = taskLabelToTaskMap[instance.shellLaunchConfig.name];
                }
                else if (Object.hasOwn(taskLabelToTaskMap, instance.title)) {
                    terminalTask = taskLabelToTaskMap[instance.title];
                }
            }
        }
        const execution = {
            getOutput: (marker) => getOutput(instance, marker ?? startMarker) ?? '',
            task: terminalTask,
            isActive: isActive ? () => isActive(terminalTask) : undefined,
            instance,
            dependencyTasks,
            sessionResource: invocationContext.sessionResource
        };
        // For tasks with problem matchers, wait until the task becomes busy before creating the output monitor
        if (terminalTask.configurationProperties.problemMatchers && terminalTask.configurationProperties.problemMatchers.length > 0 && taskService) {
            const maxWaitTime = 1000; // Wait up to 1 second
            const startTime = Date.now();
            while (!token.isCancellationRequested && Date.now() - startTime < maxWaitTime) {
                const busyTasks = await taskService.getBusyTasks();
                if (busyTasks.some(t => tasksMatch(t, terminalTask))) {
                    break;
                }
                await timeout(100);
            }
        }
        try {
            const hasProblemMatchers = terminalTask.configurationProperties.problemMatchers && terminalTask.configurationProperties.problemMatchers.length > 0;
            const outputMonitor = disposableStore.add(instantiationService.createInstance(OutputMonitor, execution, hasProblemMatchers ? taskProblemPollFn : undefined, invocationContext, token, task._label));
            await Promise.race([
                Event.toPromise(outputMonitor.onDidFinishCommand),
                Event.toPromise(token.onCancellationRequested)
            ]);
            const pollingResult = outputMonitor.pollingResult;
            return {
                name: instance.shellLaunchConfig.name ?? instance.title ?? 'unknown',
                output: pollingResult?.output ?? '',
                pollDurationMs: pollingResult?.pollDurationMs ?? 0,
                resources: pollingResult?.resources,
                state: pollingResult?.state || OutputMonitorState.Idle,
                inputToolManualAcceptCount: outputMonitor.outputMonitorTelemetryCounters.inputToolManualAcceptCount ?? 0,
                inputToolManualRejectCount: outputMonitor.outputMonitorTelemetryCounters.inputToolManualRejectCount ?? 0,
                inputToolManualChars: outputMonitor.outputMonitorTelemetryCounters.inputToolManualChars ?? 0,
                inputToolAutoAcceptCount: outputMonitor.outputMonitorTelemetryCounters.inputToolAutoAcceptCount ?? 0,
                inputToolAutoChars: outputMonitor.outputMonitorTelemetryCounters.inputToolAutoChars ?? 0,
                inputToolManualShownCount: outputMonitor.outputMonitorTelemetryCounters.inputToolManualShownCount ?? 0,
                inputToolFreeFormInputShownCount: outputMonitor.outputMonitorTelemetryCounters.inputToolFreeFormInputShownCount ?? 0,
                inputToolFreeFormInputCount: outputMonitor.outputMonitorTelemetryCounters.inputToolFreeFormInputCount ?? 0,
            };
        }
        finally {
            startMarker?.dispose();
        }
    });
    const parallelResults = await Promise.all(terminalPromises);
    results.push(...parallelResults);
    if (startMarkersByTerminalInstanceId) {
        const activeInstanceIds = new Set(terminals.map(instance => instance.instanceId));
        for (const [instanceId, marker] of startMarkersByTerminalInstanceId) {
            if (!activeInstanceIds.has(instanceId)) {
                marker?.dispose();
                startMarkersByTerminalInstanceId.delete(instanceId);
            }
        }
    }
    return results;
}
export async function taskProblemPollFn(execution, token, taskService) {
    if (token.isCancellationRequested) {
        return;
    }
    if (execution.task) {
        const data = taskService.getTaskProblems(execution.instance.instanceId);
        if (data) {
            // Problem matchers exist for this task
            const problemList = [];
            const resultResources = [];
            for (const [owner, { resources, markers }] of data.entries()) {
                for (let i = 0; i < markers.length; i++) {
                    const uri = resources[i];
                    const marker = markers[i];
                    resultResources.push({
                        uri,
                        range: marker.startLineNumber !== undefined && marker.startColumn !== undefined && marker.endLineNumber !== undefined && marker.endColumn !== undefined
                            ? new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn)
                            : undefined
                    });
                    const message = marker.message ?? '';
                    problemList.push(`Problem: ${message} in ${uri.fsPath} coming from ${owner} starting on line ${marker.startLineNumber}${marker.startColumn ? `, column ${marker.startColumn} and ending on line ${marker.endLineNumber}${marker.endColumn ? `, column ${marker.endColumn}` : ''}` : ''}`);
                }
            }
            if (problemList.length === 0) {
                const lastTenLines = execution.getOutput().split('\n').filter(line => line !== '').slice(-10).join('\n');
                return {
                    state: OutputMonitorState.Idle,
                    output: `Task completed with output:\n${lastTenLines}`,
                };
            }
            return {
                state: OutputMonitorState.Idle,
                output: problemList.join('\n'),
                resources: resultResources,
            };
        }
    }
    throw new Error('Polling failed');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza0hlbHBlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90YXNrSGVscGVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFHOUQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRTNFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFRbkUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNwRSxPQUFPLEVBQThCLGtCQUFrQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDN0YsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUkvRCxNQUFNLFVBQVUsaUJBQWlCLENBQUMsRUFBVTtJQUMzQyxNQUFNLEdBQUcsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzdCLE1BQU0sUUFBUSxHQUFHLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3RDLElBQUksU0FBUyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFFckQsSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDN0IsU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUNoQixDQUFDO0lBRUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsQ0FBQztBQUVoQyxDQUFDO0FBRUQsTUFBTSxVQUFVLHFCQUFxQixDQUFDLElBQTRCO0lBQ2pFLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUssSUFBd0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNyRSxPQUFRLElBQXdCLENBQUMsS0FBTSxDQUFDO0lBQ3pDLENBQUM7U0FBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFLLElBQXdCLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDOUUsT0FBUSxJQUF3QixDQUFDLE1BQU8sQ0FBQztJQUMxQyxDQUFDO1NBQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsSUFBSyxJQUF3QixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hGLE1BQU0sT0FBTyxHQUFJLElBQXdCLENBQUMsT0FBTyxDQUFDO1FBQ2xELE9BQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQVEsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDO0lBQ3RFLENBQUM7SUFDRCxPQUFPLEVBQUUsQ0FBQztBQUNYLENBQUM7QUFFRCxNQUFNLFVBQVUsVUFBVSxDQUFDLElBQVU7SUFDcEMsT0FBTyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO0FBQzFDLENBQUM7QUFFRCxNQUFNLFVBQVUsVUFBVSxDQUFDLENBQU8sRUFBRSxDQUFPO0lBQzFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNkLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ3JDLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELElBQUksQ0FBQyxDQUFDLGVBQWUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDLGVBQWUsRUFBRSxFQUFFLEVBQUUsQ0FBQztRQUNyRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxPQUFPLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQztBQUN4QixDQUFDO0FBRUQsTUFBTSxDQUFDLEtBQUssVUFBVSxjQUFjLENBQUMsRUFBc0IsRUFBRSxjQUF5RCxFQUFFLGVBQXVCLEVBQUUsb0JBQTJDLEVBQUUsV0FBeUIsRUFBRSxlQUF5QjtJQUNqUCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDZCxJQUFJLElBQWlDLENBQUM7SUFDdEMsTUFBTSx3QkFBd0IsR0FBRyxNQUFNLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQ3ZFLElBQUksV0FBVyxHQUFzQixFQUFFLENBQUM7SUFDeEMsS0FBSyxNQUFNLE1BQU0sSUFBSSx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDO1FBQ3RELE1BQU0sV0FBVyxHQUFHLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUE2QyxDQUFDO1FBQ3hJLElBQUksV0FBVyxFQUFFLEtBQUssRUFBRSxDQUFDO1lBQ3hCLFdBQVcsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyRCxDQUFDO0lBQ0YsQ0FBQztJQUNELEtBQUssTUFBTSxVQUFVLElBQUksV0FBVyxFQUFFLENBQUM7UUFDdEMsSUFBSSxDQUFDLENBQUMsZUFBZSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDdEcsb0ZBQW9GO1lBQ3BGLDBCQUEwQjtZQUMxQixTQUFTO1FBQ1YsQ0FBQztRQUVELElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEtBQUssY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ3BHLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxVQUFVLENBQUMsS0FBSyxjQUFjLEVBQUUsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUNuRyxJQUFJLEdBQUcsVUFBVSxDQUFDO1lBQ2xCLE1BQU07UUFDUCxDQUFDO2FBQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLElBQUksRUFBRSxLQUFLLEdBQUcsVUFBVSxDQUFDLElBQUksS0FBSyxLQUFLLEVBQUUsRUFBRSxDQUFDO1lBQ3ZFLElBQUksR0FBRyxVQUFVLENBQUM7WUFDbEIsTUFBTTtRQUNQLENBQUM7UUFDRCxLQUFLLEVBQUUsQ0FBQztJQUNULENBQUM7SUFDRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWCxPQUFPO0lBQ1IsQ0FBQztJQUVELElBQUksaUJBQWlCLENBQUM7SUFDdEIsTUFBTSxtQkFBbUIsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUMzRCxLQUFLLE1BQU0sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLElBQUksd0JBQXdCLEVBQUUsQ0FBQztRQUN4RCxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxLQUFLLG1CQUFtQixFQUFFLENBQUM7WUFDcEQsaUJBQWlCLEdBQUcsS0FBSyxDQUFDO1lBQzFCLE1BQU07UUFDUCxDQUFDO0lBQ0YsQ0FBQztJQUNELElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3hCLE9BQU87SUFDUixDQUFDO0lBQ0QsTUFBTSxnQkFBZ0IsR0FBbUQsaUJBQWlCLENBQUMsY0FBYyxFQUFFLFlBQVksQ0FBQztJQUN4SCxNQUFNLGNBQWMsR0FBZ0MsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDbEcsT0FBTyxDQUFDLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLEtBQUsscUJBQXFCLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsTUFBTSxLQUFLLHFCQUFxQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDckssQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLFlBQThCLENBQUM7SUFDbkMsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUNwQixZQUFZLEdBQUcsTUFBTSxXQUFXLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFDRCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbkIsTUFBTSxXQUFXLEdBQXVCLGlCQUFpQixDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUM7UUFDckUsWUFBWSxHQUFHLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxLQUFLLENBQUMsQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDM0YsQ0FBQztJQUNELE9BQU8sWUFBWSxDQUFDO0FBQ3JCLENBQUM7QUEyQkQsTUFBTSxDQUFDLEtBQUssVUFBVSxzQkFBc0IsQ0FBQyxVQUFnQixFQUFFLGVBQXVCLEVBQUUsb0JBQTJDLEVBQUUsV0FBeUI7SUFDN0osSUFBSSxDQUFDLFVBQVUsQ0FBQyx1QkFBdUIsRUFBRSxTQUFTLEVBQUUsQ0FBQztRQUNwRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBQ0QsTUFBTSxlQUFlLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyx1QkFBdUIsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxHQUFvQixFQUFFLEVBQUU7UUFDekgsTUFBTSxLQUFLLEdBQXVCLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ2pGLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPLE1BQU0sY0FBYyxDQUFDLEtBQUssRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsRUFBRSxlQUFlLEVBQUUsb0JBQW9CLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDOUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNKLE9BQU8sZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQW1CLEVBQWEsRUFBRSxDQUFDLENBQUMsS0FBSyxTQUFTLENBQUMsQ0FBQztBQUNwRixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLENBQUMsS0FBSyxVQUFVLHNCQUFzQixDQUMzQyxTQUE4QixFQUM5QixJQUFVLEVBQ1Ysb0JBQTJDLEVBQzNDLGlCQUF5QyxFQUN6QyxRQUFzQixFQUN0QixLQUF3QixFQUN4QixlQUFnQyxFQUNoQyxRQUEyQyxFQUMzQyxlQUF3QixFQUN4QixXQUEwQixFQUMxQixnQ0FBd0U7SUFjeEUsTUFBTSxPQUFPLEdBQWtaLEVBQUUsQ0FBQztJQUNsYSxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQ25DLE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFRCxNQUFNLHFCQUFxQixHQUE0QixFQUFFLENBQUM7SUFDMUQsTUFBTSxlQUFlLEdBQTRCLEVBQUUsQ0FBQztJQUNwRCxNQUFNLGtCQUFrQixHQUE0QixFQUFFLENBQUM7SUFFdkQsS0FBSyxNQUFNLGNBQWMsSUFBSSxlQUFlLElBQUksRUFBRSxFQUFFLENBQUM7UUFDcEQscUJBQXFCLENBQUMsY0FBYyxDQUFDLGVBQWUsRUFBRSxDQUFDLEdBQUcsY0FBYyxDQUFDO1FBQ3pFLGVBQWUsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEdBQUcsY0FBYyxDQUFDO1FBQ3JELGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsR0FBRyxjQUFjLENBQUM7SUFDNUQsQ0FBQztJQUVELG9DQUFvQztJQUNwQyxNQUFNLGFBQWEsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsS0FBSyxJQUFJLFNBQVMsQ0FBQyxDQUFDO0lBQzNGLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxjQUFjLENBQUMsdUJBQXVCLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7SUFFekgsTUFBTSxnQkFBZ0IsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsRUFBRTtRQUN6RCxNQUFNLFdBQVcsR0FBRyxnQ0FBZ0M7WUFDbkQsQ0FBQyxDQUFDLGdDQUFnQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO1lBQzNELENBQUMsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDN0IsSUFBSSxZQUFZLEdBQUcsSUFBSSxDQUFDO1FBRXhCLGdGQUFnRjtRQUNoRixJQUFJLGVBQWUsRUFBRSxNQUFNLEVBQUUsQ0FBQztZQUM3QixtRkFBbUY7WUFDbkYsTUFBTSxnQkFBZ0IsR0FBRyxRQUFRLENBQUMsc0JBQXNCLEVBQUUsSUFBeUMsQ0FBQztZQUNwRyxJQUFJLGdCQUFnQixFQUFFLENBQUM7Z0JBQ3RCLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO29CQUNyRSxZQUFZLEdBQUcscUJBQXFCLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ2pFLENBQUM7cUJBQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO29CQUNoRSxZQUFZLEdBQUcsZUFBZSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNyRCxDQUFDO1lBQ0YsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLHdDQUF3QztnQkFDeEMsSUFBSSxRQUFRLENBQUMsaUJBQWlCLENBQUMsSUFBSSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQzNHLFlBQVksR0FBRyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3BFLENBQUM7cUJBQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUM5RCxZQUFZLEdBQUcsa0JBQWtCLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNuRCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLFNBQVMsR0FBZTtZQUM3QixTQUFTLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsTUFBTSxJQUFJLFdBQVcsQ0FBQyxJQUFJLEVBQUU7WUFDdkUsSUFBSSxFQUFFLFlBQVk7WUFDbEIsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO1lBQzdELFFBQVE7WUFDUixlQUFlO1lBQ2YsZUFBZSxFQUFFLGlCQUFpQixDQUFDLGVBQWU7U0FDbEQsQ0FBQztRQUVGLHVHQUF1RztRQUN2RyxJQUFJLFlBQVksQ0FBQyx1QkFBdUIsQ0FBQyxlQUFlLElBQUksWUFBWSxDQUFDLHVCQUF1QixDQUFDLGVBQWUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQzVJLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxDQUFDLHNCQUFzQjtZQUNoRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDN0IsT0FBTyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsSUFBSSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsU0FBUyxHQUFHLFdBQVcsRUFBRSxDQUFDO2dCQUMvRSxNQUFNLFNBQVMsR0FBRyxNQUFNLFdBQVcsQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDbkQsSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ3RELE1BQU07Z0JBQ1AsQ0FBQztnQkFDRCxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNwQixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQztZQUNKLE1BQU0sa0JBQWtCLEdBQUcsWUFBWSxDQUFDLHVCQUF1QixDQUFDLGVBQWUsSUFBSSxZQUFZLENBQUMsdUJBQXVCLENBQUMsZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7WUFDbkosTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsYUFBYSxFQUFFLFNBQVMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDcE0sTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDO2dCQUNsQixLQUFLLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQztnQkFDakQsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsdUJBQXlDLENBQUM7YUFDaEUsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxhQUFhLEdBQUcsYUFBYSxDQUFDLGFBQWEsQ0FBQztZQUNsRCxPQUFPO2dCQUNOLElBQUksRUFBRSxRQUFRLENBQUMsaUJBQWlCLENBQUMsSUFBSSxJQUFJLFFBQVEsQ0FBQyxLQUFLLElBQUksU0FBUztnQkFDcEUsTUFBTSxFQUFFLGFBQWEsRUFBRSxNQUFNLElBQUksRUFBRTtnQkFDbkMsY0FBYyxFQUFFLGFBQWEsRUFBRSxjQUFjLElBQUksQ0FBQztnQkFDbEQsU0FBUyxFQUFFLGFBQWEsRUFBRSxTQUFTO2dCQUNuQyxLQUFLLEVBQUUsYUFBYSxFQUFFLEtBQUssSUFBSSxrQkFBa0IsQ0FBQyxJQUFJO2dCQUN0RCwwQkFBMEIsRUFBRSxhQUFhLENBQUMsOEJBQThCLENBQUMsMEJBQTBCLElBQUksQ0FBQztnQkFDeEcsMEJBQTBCLEVBQUUsYUFBYSxDQUFDLDhCQUE4QixDQUFDLDBCQUEwQixJQUFJLENBQUM7Z0JBQ3hHLG9CQUFvQixFQUFFLGFBQWEsQ0FBQyw4QkFBOEIsQ0FBQyxvQkFBb0IsSUFBSSxDQUFDO2dCQUM1Rix3QkFBd0IsRUFBRSxhQUFhLENBQUMsOEJBQThCLENBQUMsd0JBQXdCLElBQUksQ0FBQztnQkFDcEcsa0JBQWtCLEVBQUUsYUFBYSxDQUFDLDhCQUE4QixDQUFDLGtCQUFrQixJQUFJLENBQUM7Z0JBQ3hGLHlCQUF5QixFQUFFLGFBQWEsQ0FBQyw4QkFBOEIsQ0FBQyx5QkFBeUIsSUFBSSxDQUFDO2dCQUN0RyxnQ0FBZ0MsRUFBRSxhQUFhLENBQUMsOEJBQThCLENBQUMsZ0NBQWdDLElBQUksQ0FBQztnQkFDcEgsMkJBQTJCLEVBQUUsYUFBYSxDQUFDLDhCQUE4QixDQUFDLDJCQUEyQixJQUFJLENBQUM7YUFDMUcsQ0FBQztRQUNILENBQUM7Z0JBQVMsQ0FBQztZQUNWLFdBQVcsRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUN4QixDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLGVBQWUsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUM1RCxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsZUFBZSxDQUFDLENBQUM7SUFFakMsSUFBSSxnQ0FBZ0MsRUFBRSxDQUFDO1FBQ3RDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLEtBQUssTUFBTSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsSUFBSSxnQ0FBZ0MsRUFBRSxDQUFDO1lBQ3JFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztnQkFDeEMsTUFBTSxFQUFFLE9BQU8sRUFBRSxDQUFDO2dCQUNsQixnQ0FBZ0MsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDckQsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxPQUFPLENBQUM7QUFDaEIsQ0FBQztBQUVELE1BQU0sQ0FBQyxLQUFLLFVBQVUsaUJBQWlCLENBQUMsU0FBcUIsRUFBRSxLQUF3QixFQUFFLFdBQXlCO0lBQ2pILElBQUksS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDbkMsT0FBTztJQUNSLENBQUM7SUFDRCxJQUFJLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNwQixNQUFNLElBQUksR0FBMEUsV0FBVyxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQy9JLElBQUksSUFBSSxFQUFFLENBQUM7WUFDVix1Q0FBdUM7WUFDdkMsTUFBTSxXQUFXLEdBQWEsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sZUFBZSxHQUFvQixFQUFFLENBQUM7WUFDNUMsS0FBSyxNQUFNLENBQUMsS0FBSyxFQUFFLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7Z0JBQzlELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7b0JBQ3pDLE1BQU0sR0FBRyxHQUFvQixTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzFDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDMUIsZUFBZSxDQUFDLElBQUksQ0FBQzt3QkFDcEIsR0FBRzt3QkFDSCxLQUFLLEVBQUUsTUFBTSxDQUFDLGVBQWUsS0FBSyxTQUFTLElBQUksTUFBTSxDQUFDLFdBQVcsS0FBSyxTQUFTLElBQUksTUFBTSxDQUFDLGFBQWEsS0FBSyxTQUFTLElBQUksTUFBTSxDQUFDLFNBQVMsS0FBSyxTQUFTOzRCQUN0SixDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxNQUFNLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxhQUFhLEVBQUUsTUFBTSxDQUFDLFNBQVMsQ0FBQzs0QkFDL0YsQ0FBQyxDQUFDLFNBQVM7cUJBQ1osQ0FBQyxDQUFDO29CQUNILE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDO29CQUNyQyxXQUFXLENBQUMsSUFBSSxDQUFDLFlBQVksT0FBTyxPQUFPLEdBQUcsQ0FBQyxNQUFNLGdCQUFnQixLQUFLLHFCQUFxQixNQUFNLENBQUMsZUFBZSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLFlBQVksTUFBTSxDQUFDLFdBQVcsdUJBQXVCLE1BQU0sQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsWUFBWSxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUMzUixDQUFDO1lBQ0YsQ0FBQztZQUNELElBQUksV0FBVyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDOUIsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN6RyxPQUFPO29CQUNOLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxJQUFJO29CQUM5QixNQUFNLEVBQUUsZ0NBQWdDLFlBQVksRUFBRTtpQkFDdEQsQ0FBQztZQUNILENBQUM7WUFDRCxPQUFPO2dCQUNOLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxJQUFJO2dCQUM5QixNQUFNLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7Z0JBQzlCLFNBQVMsRUFBRSxlQUFlO2FBQzFCLENBQUM7UUFDSCxDQUFDO0lBQ0YsQ0FBQztJQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUNuQyxDQUFDIn0=