/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../../base/common/uri.js';
import { IMarker, IMarkerService } from '../../../../../../../platform/markers/common/markers.js';
import { ProblemMatcherRegistry } from '../../../../../tasks/common/problemMatcher.js';
import { Task } from '../../../../../tasks/common/tasks.js';
import { ILinkLocation } from '../../taskHelpers.js';
import { Location } from '../../../../../../../editor/common/languages.js';

/**
 * Utility to collect problems for a given task and its dependencies using problem matchers.
 */
export function getProblemsForTasks(task: Pick<Task, 'configurationProperties'>, markerService: Pick<IMarkerService, 'read'>, dependencyTasks?: Task[]): Map<string, IMarker[]> | undefined {
	const problemsMap = new Map<string, IMarker[]>();
	let hadDefinedMatcher = false;

	const collectProblems = (t: Pick<Task, 'configurationProperties'>) => {
		const matchers = Array.isArray(t.configurationProperties.problemMatchers)
			? t.configurationProperties.problemMatchers
			: (t.configurationProperties.problemMatchers ? [t.configurationProperties.problemMatchers] : []);
		for (const matcherRef of matchers) {
			const matcher = typeof matcherRef === 'string'
				? ProblemMatcherRegistry.get(matcherRef)
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


export function toolResultDetailsFromResponse(terminalResults: { output: string; resources?: ILinkLocation[] }[]): ((URI | Location)[]) {
	return Array.from(new Map(
		terminalResults
			.flatMap(r =>
				r.resources?.filter(res => res.uri).map(res => {
					const range = res.range;
					const item = range !== undefined ? { uri: res.uri, range } : res.uri;
					const key = range !== undefined
						? `${res.uri.toString()}-${range.toString()}`
						: `${res.uri.toString()}`;
					return [key, item] as [string, URI | Location];
				}) ?? []
			)
	).values());
}
