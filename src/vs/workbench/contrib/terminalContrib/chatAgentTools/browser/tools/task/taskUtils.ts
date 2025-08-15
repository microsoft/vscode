/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarker, IMarkerService } from '../../../../../../../platform/markers/common/markers.js';
import { ProblemMatcher, ProblemMatcherRegistry } from '../../../../../tasks/common/problemMatcher.js';
import { Task, ITaskEvent, TaskEventKind } from '../../../../../tasks/common/tasks.js';
import { ITaskService } from '../../../../../tasks/common/taskService.js';

/**
 * Get problem information for a task using task events when available.
 * This is more direct than querying the marker service directly.
 * 
 * @param task The task to check for problems
 * @param taskService Service to check for recent task events 
 * @param markerService Fallback service to read markers directly
 * @param dependencyTasks Optional dependency tasks to check
 * @param knownMatchers Optional known problem matchers
 * @returns Object with hasErrors flag and detailed problems if available
 */
export function getTaskProblemsWithEvents(
	task: Pick<Task, 'configurationProperties' | '_id'>,
	taskService: Pick<ITaskService, 'onDidStateChange'>,
	markerService: Pick<IMarkerService, 'read'>,
	dependencyTasks?: Task[],
	knownMatchers?: ProblemMatcher[]
): { hasErrors: boolean; problems?: Map<string, IMarker[]> } {
	// For now, we'll use the marker service approach but with better structure
	// In the future, this could be enhanced to listen to task events for more direct access
	const problems = getProblemsForTasks(task, markerService, dependencyTasks, knownMatchers);
	
	if (problems) {
		// If we have problem matchers defined, check if there are any problems
		const hasErrors = Array.from(problems.values()).some(markers => markers.length > 0);
		return { hasErrors, problems };
	}
	
	// No problem matchers configured, assume no errors
	return { hasErrors: false };
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