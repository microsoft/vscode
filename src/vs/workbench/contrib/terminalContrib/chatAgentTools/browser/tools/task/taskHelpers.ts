/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../../base/common/uri.js';
import { Location } from '../../../../../../../editor/common/languages.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { ITaskSummary, Task } from '../../../../../tasks/common/taskService.js';
import { localize } from '../../../../../../../nls.js';
import { OutputMonitorState } from '../monitoring/types.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';

export function toolResultDetailsFromResponse(terminalResults: { output: string; resources?: ILinkLocation[] }[]): (URI | Location)[] {
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

function taskIsWatching(task: Task, dependencyTasks?: Task[]): boolean {
	const hasWatchingMatcher = (t: Task) =>
		t.configurationProperties.isBackground &&
		Array.isArray(t.configurationProperties.problemMatchers) &&
		t.configurationProperties.problemMatchers.length > 0;

	return hasWatchingMatcher(task) || (dependencyTasks?.some(hasWatchingMatcher) ?? false);
}

export function toolResultMessageFromResponse(task: Task, result: ITaskSummary | undefined, taskLabel: string, toolResultDetails: (URI | Location)[], terminalResults: { output: string; resources?: ILinkLocation[]; state: OutputMonitorState }[], dependencyTasks?: Task[], getOutputTool?: boolean): MarkdownString {
	const isWatching = taskIsWatching(task, dependencyTasks);
	let resultSummary = '';
	if (result?.exitCode) {
		resultSummary = localize('copilotChat.taskFailedWithExitCode', 'Task `{0}` failed with exit code {1}.', taskLabel, result.exitCode);
	} else {
		resultSummary += `\`${taskLabel}\` task `;
		const problemCount = toolResultDetails.length;
		const isIdle = terminalResults.every(r => r.state === OutputMonitorState.Idle);
		let responseMessage = '';
		if (getOutputTool) {
			return problemCount ? new MarkdownString(`Got output for ${resultSummary} with \`${problemCount}\` problem${problemCount === 1 ? '' : 's'}`) : new MarkdownString(`Got output for ${resultSummary}`);
		} else if (isIdle) {
			if (problemCount) {
				if (isWatching) {
					responseMessage = `finished compilation with \`${problemCount}\` problem${problemCount === 1 ? '' : 's'}`;
				} else {
					responseMessage = `finished with \`${problemCount}\` problem${problemCount === 1 ? '' : 's'}`;
				}
			} else if (isWatching) {
				responseMessage = 'finished compilation';
			} else {
				responseMessage = 'finished';
			}
		} else {
			if (problemCount) {
				responseMessage = `started and will continue to run in the background with \`${problemCount}\` problem${problemCount === 1 ? '' : 's'}`;
			} else {
				responseMessage = 'started and will continue to run in the background';
			}
		}
		resultSummary += responseMessage;
	}
	return new MarkdownString(resultSummary);
}

export interface ILinkLocation { uri: URI; range?: Range }
