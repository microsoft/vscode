/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { toAction } from '../../../../../base/common/actions.js';
import { isDefined } from '../../../../../base/common/types.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IChatScheduledRequest } from '../../../chat/common/model/chatViewModel.js';
import { renderScheduledRequestTime } from '../../../chat/browser/widget/chatScheduledRequestTime.js';

// Rescheduling stays in the session's inline editor.
const CARD_ACTION_IDS = ['sessions.scheduled.edit', 'sessions.scheduled.sendNow', 'sessions.scheduled.cancel'];

let cardIdPool = 0;

function firstLine(text: string): string {
	return text.trim().split(/\r?\n/)[0] ?? '';
}

export function getScheduledRequestsCardKey(requests: readonly IChatScheduledRequest[]): string {
	return JSON.stringify(requests.map(request => [
		request.id, request.runAt, request.description, request.text,
		request.actions.map(action => [action.id, action.label, action.class, action.enabled]),
	]));
}

export function renderScheduledRequestsCard(requests: readonly IChatScheduledRequest[], store: DisposableStore, run: (requestId: string, actionId: string) => Promise<void>): HTMLElement {
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
		append(row, $(`span.session-scheduled-card-icon${ThemeIcon.asCSSSelector(Codicon.clock)}`, { 'aria-hidden': 'true' }));
		const time = append(row, $('span.session-scheduled-card-time', { 'aria-hidden': 'true' }));
		const updateTime = (label: string) => {
			time.textContent = label;
			row.setAttribute('aria-label', localize('sessionScheduledCard.row', "{0}, {1}", text, label));
		};
		if (request.runAt) {
			store.add(renderScheduledRequestTime(request.runAt, time, updateTime));
		} else {
			updateTime(request.description);
		}
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
			run: () => run(request.id, action.id),
		})), { icon: true, label: false });
	}
	return card;
}
