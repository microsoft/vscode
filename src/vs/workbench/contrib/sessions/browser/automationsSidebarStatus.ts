/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

/** The automation runs that explain the status dot on the Automations entry, by automation name. */
export interface IAutomationsRunStatusSummary {
	readonly needsInput: readonly string[];
	readonly inProgress: readonly string[];
	readonly finished: readonly string[];
}

/** One line per kind of run that shows the dot, such as "1 run needs input: Issue triage" or "2 runs in progress". */
export function formatAutomationsRunStatus(summary: IAutomationsRunStatusSummary): string[] {
	const lines: string[] = [];
	const { needsInput, inProgress, finished } = summary;
	if (needsInput.length === 1) {
		lines.push(localize('automationsRunStatus.needsInputOne', "1 run needs input: {0}", needsInput[0]));
	} else if (needsInput.length > 1) {
		lines.push(localize('automationsRunStatus.needsInputMany', "{0} runs need input", needsInput.length));
	}
	if (inProgress.length === 1) {
		lines.push(localize('automationsRunStatus.inProgressOne', "1 run in progress: {0}", inProgress[0]));
	} else if (inProgress.length > 1) {
		lines.push(localize('automationsRunStatus.inProgressMany', "{0} runs in progress", inProgress.length));
	}
	if (finished.length === 1) {
		lines.push(localize('automationsRunStatus.finishedOne', "1 run finished: {0}", finished[0]));
	} else if (finished.length > 1) {
		lines.push(localize('automationsRunStatus.finishedMany', "{0} runs finished", finished.length));
	}
	return lines;
}
