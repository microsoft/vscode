/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { derived, IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { type IChatPillEntry } from '../../../browser/chatPills.js';
import { type ISessionChatPillFilter, SessionChatPillKind } from '../common/sessionChatPills.js';
import type { IStandardChatInputPillSections } from './chatInputPills.js';
import { getSessionChatPillFilterActions } from './sessionChatPillOptions.js';

export interface IChatSubagentPillEntry {
	readonly id: string;
	readonly title: string;
	readonly isActive: boolean;
	open(): void | Promise<void>;
}

const SUBAGENT_LABEL_MAX_LENGTH = 30;

/** Groups direct subagents newest first, using the shared status filter and presentation. */
export function createSessionSubagentsPillData(
	subagents: IObservable<readonly IChatSubagentPillEntry[]>,
	filter: ISessionChatPillFilter,
) {
	return {
		hasData: derived(reader => subagents.read(reader).length > 0),
		sections: derived(reader => {
			const inProgress: IChatPillEntry[] = [];
			const completed: IChatPillEntry[] = [];
			for (const subagent of [...subagents.read(reader)].reverse()) {
				const name = subagent.title.trim() || localize('backgroundActivities.subagent', "Subagent");
				const entries = subagent.isActive ? inProgress : completed;
				entries.push({
					id: subagent.id,
					label: name.length > SUBAGENT_LABEL_MAX_LENGTH ? `${name.slice(0, SUBAGENT_LABEL_MAX_LENGTH)}...` : name,
					icon: Codicon.agent,
					open: () => subagent.open(),
				});
			}
			return [
				{ title: localize('backgroundActivities.subagents.inProgress', "Subagents: In Progress"), entries: inProgress },
				{ title: localize('backgroundActivities.subagents.completed', "Subagents: Completed"), entries: filter.showAll.read(reader) ? completed : [] },
			].filter(section => section.entries.length > 0);
		}),
		getContextMenuActions: () => getSessionChatPillFilterActions(SessionChatPillKind.Subagents, filter, {
			id: 'showInProgress',
			label: localize('backgroundActivities.subagents.showInProgress', "Show In Progress"),
		}),
	} satisfies IStandardChatInputPillSections;
}
