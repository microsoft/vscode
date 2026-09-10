/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction, type IAction } from '../../../../base/common/actions.js';
import { derived, IObservable, isObservable } from '../../../../base/common/observable.js';
import type { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { getChatPillEntries, type IChatPillEntry, type IChatPillSection } from '../../../browser/chatPills.js';
import { computePullRequestIcon, getHighestPriorityPullRequestIcon, type ChatPullRequestState } from '../../../common/chatPullRequest.js';
import type { ISessionChatPillVisibilityService } from '../common/sessionChatPills.js';
import type { IStandardChatInputPillSections } from './chatInputPills.js';

export interface IChatPullRequestPillEntry extends IChatPillEntry {
	readonly pullRequestState?: ChatPullRequestState;
	/** Offered in the dropdown toolbar, or the context menu for a single visible entry. */
	readonly removeAction?: IAction;
}

export interface IChatPullRequestPillSection extends IChatPillSection {
	readonly entries: readonly IChatPullRequestPillEntry[];
}

/** Supplies filtered PR data and options using the user's application-wide preference. */
export function createSessionPullRequestPillData(
	sections: IObservable<readonly IChatPullRequestPillSection[]>,
	visibility: ISessionChatPillVisibilityService['pullRequests'],
	icon?: ThemeIcon | IObservable<ThemeIcon>,
) {
	const filteredSections = derived(reader => {
		const allSections = sections.read(reader);
		const visibleSections = visibility.showAll.read(reader) ? allSections : allSections.map(section => ({
			...section,
			entries: section.entries.filter(entry => visibility.isVisible(entry.pullRequestState, reader)),
		})).filter(section => section.entries.length > 0);
		if (getChatPillEntries(visibleSections).length <= 1) {
			return visibleSections;
		}
		return visibleSections.map(section => ({
			...section,
			entries: section.entries.map(entry => entry.removeAction ? {
				...entry,
				toolbarActions: [...entry.toolbarActions ?? [], entry.removeAction],
			} : entry),
		}));
	});
	return {
		sections: filteredSections,
		hasData: derived(reader => getChatPillEntries(sections.read(reader)).length > 0),
		icon: derived(reader => {
			if (visibility.showAll.read(reader)) {
				return (isObservable(icon) ? icon.read(reader) : icon) ?? computePullRequestIcon('open');
			}
			return getHighestPriorityPullRequestIcon(getChatPillEntries(filteredSections.read(reader)).map(entry => entry.icon)) ?? computePullRequestIcon('open');
		}),
		getContextMenuActions: () => {
			const showAll = visibility.showAll.get();
			return [
				toAction({
					id: 'chatInputPills.pullRequests.showAll',
					label: localize('chatInputPills.pullRequests.showAll', "Show All"),
					checked: showAll,
					run: () => visibility.setShowAll(true),
				}),
				toAction({
					id: 'chatInputPills.pullRequests.showOpen',
					label: localize('chatInputPills.pullRequests.showOpen', "Show Open/Draft"),
					checked: !showAll,
					run: () => visibility.setShowAll(false),
				}),
			];
		},
		getContextMenuPrimaryActions: () => {
			const entries = filteredSections.get().flatMap(section => section.entries);
			return entries.length === 1 && entries[0].removeAction ? [entries[0].removeAction] : [];
		},
	} satisfies IStandardChatInputPillSections;
}
