/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarker, IMarkerService } from '../../../../../../../platform/markers/common/markers.js';
import { ProblemMatcher, ProblemMatcherRegistry } from '../../../../../tasks/common/problemMatcher.js';
import { Task } from '../../../../../tasks/common/tasks.js';

/**
 * Utility to collect problems for a given task and its dependencies using problem matchers.
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
