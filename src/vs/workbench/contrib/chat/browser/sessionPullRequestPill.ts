/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../base/common/actions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, isObservable } from '../../../../base/common/observable.js';
import type { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { observableMemento, ObservableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getChatPillEntries, type IChatPillEntry, type IChatPillSection } from '../../../browser/chatPills.js';
import { computePullRequestIcon, getHighestPriorityPullRequestIcon, type ChatPullRequestState } from '../../../common/chatPullRequest.js';
import type { IStandardChatInputPillSections } from './chatInputPills.js';

export interface IChatPullRequestPillEntry extends IChatPillEntry {
	readonly pullRequestState?: ChatPullRequestState;
}

export interface IChatPullRequestPillSection extends IChatPillSection {
	readonly entries: readonly IChatPullRequestPillEntry[];
}

const showAllSessionPullRequests = observableMemento<boolean>({
	defaultValue: true,
	key: 'sessions.chatPills.pullRequests.showAll',
	toStorage: value => String(value),
	fromStorage: value => value !== 'false',
});

export const ISessionPullRequestPillService = createDecorator<ISessionPullRequestPillService>('sessionPullRequestPillService');

export interface ISessionPullRequestPillService {
	readonly _serviceBrand: undefined;
	createPillData(sections: IObservable<readonly IChatPullRequestPillSection[]>, icon?: ThemeIcon | IObservable<ThemeIcon>): IStandardChatInputPillSections;
}

/** Supplies filtered PR data and options using the user's application-wide preference. */
export class SessionPullRequestPillService extends Disposable implements ISessionPullRequestPillService {

	declare readonly _serviceBrand: undefined;

	private readonly _showAllPullRequests: ObservableMemento<boolean>;

	constructor(
		@IStorageService storageService: IStorageService,
	) {
		super();
		this._showAllPullRequests = this._register(showAllSessionPullRequests(StorageScope.APPLICATION, StorageTarget.USER, storageService));
	}

	createPillData(sections: IObservable<readonly IChatPullRequestPillSection[]>, icon?: ThemeIcon | IObservable<ThemeIcon>) {
		const filteredSections = derived(reader => {
			const allSections = sections.read(reader);
			return this._showAllPullRequests.read(reader) ? allSections : allSections.map(section => ({
				...section,
				entries: section.entries.filter(entry => entry.pullRequestState !== 'closed' && entry.pullRequestState !== 'merged'),
			})).filter(section => section.entries.length > 0);
		});
		return {
			sections: filteredSections,
			hasData: derived(reader => getChatPillEntries(sections.read(reader)).length > 0),
			icon: derived(reader => {
				if (this._showAllPullRequests.read(reader)) {
					return (isObservable(icon) ? icon.read(reader) : icon) ?? computePullRequestIcon('open');
				}
				return getHighestPriorityPullRequestIcon(getChatPillEntries(filteredSections.read(reader)).map(entry => entry.icon)) ?? computePullRequestIcon('open');
			}),
			getContextMenuActions: () => {
				const showAll = this._showAllPullRequests.get();
				return [
					toAction({
						id: 'chatInputPills.pullRequests.showAll',
						label: localize('chatInputPills.pullRequests.showAll', "Show All"),
						checked: showAll,
						run: () => this._showAllPullRequests.set(true, undefined),
					}),
					toAction({
						id: 'chatInputPills.pullRequests.showOpen',
						label: localize('chatInputPills.pullRequests.showOpen', "Show Open/Draft"),
						checked: !showAll,
						run: () => this._showAllPullRequests.set(false, undefined),
					}),
				];
			},
		} satisfies IStandardChatInputPillSections;
	}
}
