/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarker, IMarkerService } from '../../../../../../../platform/markers/common/markers.js';
import { ProblemMatcher, ProblemMatcherRegistry } from '../../../../../tasks/common/problemMatcher.js';
import { Task, ITaskEvent, TaskEventKind } from '../../../../../tasks/common/tasks.js';
import { ITaskService } from '../../../../../tasks/common/taskService.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../../base/common/event.js';

/**
 * A utility class that monitors task events to provide more direct access to problem matcher results.
 * This addresses the issue by using task events (ITaskProblemMatcherEndedEvent) more directly
 * instead of just querying the marker service.
 */
export class TaskProblemMonitor extends Disposable {
	private readonly _onTaskProblemInfo = this._register(new Emitter<{ taskId: string; hasErrors: boolean }>());
	public readonly onTaskProblemInfo = this._onTaskProblemInfo.event;

	private readonly _taskProblemStates = new Map<string, boolean>(); // taskId -> hasErrors

	constructor(
		@ITaskService private readonly _taskService: ITaskService
	) {
		super();
		this._register(this._taskService.onDidStateChange(this._handleTaskEvent, this));
	}

	private _handleTaskEvent(event: ITaskEvent): void {
		switch (event.kind) {
			case TaskEventKind.ProblemMatcherEnded:
				// Use the hasErrors flag from the event directly - this is the more direct approach!
				this._taskProblemStates.set(event.taskId, event.hasErrors);
				this._onTaskProblemInfo.fire({ taskId: event.taskId, hasErrors: event.hasErrors });
				break;

			case TaskEventKind.ProblemMatcherFoundErrors:
				// Mark task as having errors when problem matcher finds errors
				this._taskProblemStates.set(event.taskId, true);
				this._onTaskProblemInfo.fire({ taskId: event.taskId, hasErrors: true });
				break;

			case TaskEventKind.Start:
				// Clear previous error state when task starts
				this._taskProblemStates.delete(event.taskId);
				break;
		}
	}

	/**
	 * Get the current problem state for a task based on the most recent events.
	 * This is more direct than querying the marker service.
	 */
	public getTaskProblemState(taskId: string): { hasErrors: boolean; fromEvents: boolean } {
		const hasErrors = this._taskProblemStates.get(taskId) ?? false;
		return {
			hasErrors,
			fromEvents: this._taskProblemStates.has(taskId)
		};
	}
}

/**
 * Get problem information for a task using task events when available.
 * This is more direct than querying the marker service directly.
 *
 * @param task The task to check for problems
 * @param taskService Service to check for recent task events
 * @param markerService Fallback service to read markers directly
 * @param dependencyTasks Optional dependency tasks to check
 * @param knownMatchers Optional known problem matchers
 * @param taskProblemMonitor Optional monitor for accessing task events directly
 * @returns Object with hasErrors flag and detailed problems if available
 */
export function getTaskProblemsWithEvents(
	task: Pick<Task, 'configurationProperties' | '_id'>, taskService: Pick<ITaskService, 'onDidStateChange'>, markerService: Pick<IMarkerService, 'read'>, dependencyTasks?: Task[], knownMatchers?: ProblemMatcher[], taskProblemMonitor?: TaskProblemMonitor): { hasErrors: boolean; problems?: Map<string, IMarker[]>; fromEvents?: boolean } {

	// Try to get problem state from task events first (more direct approach)
	if (taskProblemMonitor) {
		const eventState = taskProblemMonitor.getTaskProblemState(task._id);
		if (eventState.fromEvents) {
			// We have recent task event data - use it! This is the more direct approach.
			const problems = getProblemsForTasks(task, markerService, dependencyTasks, knownMatchers);
			return {
				hasErrors: eventState.hasErrors,
				problems,
				fromEvents: true
			};
		}
	}

	// Fallback to marker service approach (less direct)
	const problems = getProblemsForTasks(task, markerService, dependencyTasks, knownMatchers);

	if (problems) {
		// If we have problem matchers defined, check if there are any problems
		const hasErrors = Array.from(problems.values()).some(markers => markers.length > 0);
		return { hasErrors, problems, fromEvents: false };
	}

	// No problem matchers configured, assume no errors
	return { hasErrors: false, fromEvents: false };
}

/**
 * Utility to collect problems for a given task and its dependencies using problem matchers.
 * @deprecated Use TaskProblemTracker for more direct access to problem matcher events
 */
export function getProblemsForTasks(task: Pick<Task, 'configurationProperties'>, markerService: Pick<IMarkerService, 'read'>, dependencyTasks?: Task[], knownMatchers?: ProblemMatcher[]): Map<string, IMarker[]> | undefined {
	const problemsMap = new Map<string, IMarker[]>();
	let hadDefinedMatcher = false;

	const collectProblems = (t: Pick<Task, 'configurationProperties'>) => {
		const matchers = Array.isArray(t.configurationProperties.problemMatchers)
			? t.configurationProperties.problemMatchers
			: (t.configurationProperties.problemMatchers ? [t.configurationProperties.problemMatchers] : []);
		for (const matcherRef of matchers) {
			const matcher = typeof matcherRef === 'string'
				? ProblemMatcherRegistry.get(matcherRef) ?? knownMatchers?.find(m => m.owner === matcherRef)
				: matcherRef;
			if (matcher?.owner) {
				const markers = markerService.read({ owner: matcher.owner });
				hadDefinedMatcher = true;
				if (markers.length) {
					problemsMap.set(matcher.owner, markers);
				}
			}
		}
	};

	collectProblems(task);

	if (problemsMap.size === 0 && dependencyTasks) {
		for (const depTask of dependencyTasks) {
			collectProblems(depTask);
		}
	}

	return hadDefinedMatcher ? problemsMap : undefined;
}
