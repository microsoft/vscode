/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { IAction, toAction } from '../../../../../base/common/actions.js';
import { isDefined } from '../../../../../base/common/types.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IChatScheduledRequest } from '../../../chat/common/model/chatViewModel.js';
import { formatScheduledRequestTime, formatScheduledRequestTimeFromNow } from '../../../chat/common/widget/chatScheduledRequestTime.js';

/** What a scheduled message offers from the sessions list, in this order. Rescheduling stays in the session. */
const CARD_ACTION_IDS = ['sessions.scheduled.edit', 'sessions.scheduled.sendNow', 'sessions.scheduled.cancel'];

let cardIdPool = 0;

function firstLine(text: string): string {
	return text.trim().split(/\r?\n/)[0] ?? '';
}

/** "In 3 hours", or the message's status while it is not set to send. */
function cardTime(request: IChatScheduledRequest, now: number): string {
	return request.runAt ? formatScheduledRequestTimeFromNow(request.runAt, now, true) : request.description;
}

/** Everything the card shows, so a card is rebuilt only when this changes. */
export function getScheduledRequestsCardKey(requests: readonly IChatScheduledRequest[], now: number = Date.now()): string {
	return requests.map(request => `${request.id}|${cardTime(request, now)}|${request.text}|${request.actions.map(action => `${action.id}:${action.enabled}`).join()}`).join('\n');
}

/**
 * The card a session's scheduled clock shows: "Scheduled" with the count, then a row for each message with how long
 * until it sends ("In 3 hours") and its first line, and Edit, Send Now and Cancel Schedule.
 */
export function renderScheduledRequestsCard(requests: readonly IChatScheduledRequest[], store: DisposableStore, run: (action: IAction) => void, now: number = Date.now()): HTMLElement {
	const titleId = `session-scheduled-card-title-${cardIdPool++}`;
	const card = $('.session-scheduled-card', { role: 'group', 'aria-labelledby': titleId });
	const header = append(card, $('.session-scheduled-card-header'));
	append(header, $('span.session-scheduled-card-title', { id: titleId }, localize('sessionScheduledCard.title', "Scheduled")));
	const count = append(header, $('span.session-scheduled-card-count', undefined, String(requests.length)));
	count.setAttribute('aria-label', requests.length === 1
		? localize('sessionScheduledCard.countOne', "1 message")
		: localize('sessionScheduledCard.count', "{0} messages", requests.length));

	const list = append(card, $('.session-scheduled-card-list', { role: 'list' }));
	for (const request of requests) {
		const text = firstLine(request.text) || localize('sessionScheduledCard.attachmentsOnly', "Attachments");
		const row = append(list, $('.session-scheduled-card-row', { role: 'listitem' }));
		const time = cardTime(request, now);
		row.setAttribute('aria-label', request.runAt
			? localize('sessionScheduledCard.rowScheduled', "{0}, {1}, {2}", text, formatScheduledRequestTimeFromNow(request.runAt, now), formatScheduledRequestTime(request.runAt, now))
			: localize('sessionScheduledCard.row', "{0}, {1}", text, request.description));
		append(row, $(`span.session-scheduled-card-icon${ThemeIcon.asCSSSelector(Codicon.clock)}`, { 'aria-hidden': 'true' }));
		append(row, $('span.session-scheduled-card-time', { 'aria-hidden': 'true' }, time));
		append(row, $('span.session-scheduled-card-text', { 'aria-hidden': 'true' }, text));
		const actions = CARD_ACTION_IDS.map(id => request.actions.find(action => action.id === id)).filter(isDefined);
		const actionBar = store.add(new ActionBar(append(row, $('.session-scheduled-card-actions')), {
			ariaLabel: localize('sessionScheduledCard.actions', "Actions for {0}", text),
		}));
		actionBar.push(actions.map(action => toAction({
			id: action.id,
			label: action.label,
			class: action.class,
			enabled: action.enabled,
			run: () => run(action),
		})), { icon: true, label: false });
	}
	return card;
}
