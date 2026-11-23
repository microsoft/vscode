/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, addStandardDisposableListener, append, EventHelper, EventType, isAncestorOfActiveElement } from '../../../../../base/browser/dom.js';
import { Gesture } from '../../../../../base/browser/touch.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { IDelayedHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { toAction } from '../../../../../base/common/actions.js';
import { isDefined } from '../../../../../base/common/types.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader } from '../../../../../base/common/observable.js';
import { getComparisonKey } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatScheduledRequest } from '../../../chat/common/model/chatViewModel.js';
import { renderScheduledRequestTime } from '../../../chat/browser/widget/chatScheduledRequestTime.js';

// Rescheduling stays in the session's inline editor.
const CARD_ACTION_IDS = ['sessions.scheduled.edit', 'sessions.scheduled.sendNow', 'sessions.scheduled.cancel'];

let cardIdPool = 0;

interface IScheduledRequestsIndicatorTemplate {
	readonly compactHoverDescription: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	scheduledIndicator?: HTMLElement;
}

export class ScheduledRequestsIndicatorRenderer {
	private readonly cards = new WeakMap<IScheduledRequestsIndicatorTemplate, { readonly key: string; readonly element: HTMLElement; readonly store: DisposableStore }>();

	constructor(
		private readonly hoverService: IHoverService,
		private readonly notificationService: INotificationService,
		private readonly requests: IObservable<ReadonlyMap<string, readonly IChatScheduledRequest[]>> | undefined,
	) { }

	render(getResource: (reader: IReader | undefined) => URI, template: IScheduledRequestsIndicatorTemplate, focusRow: () => void, fallbackScheduled?: (reader: IReader) => boolean): void {
		if (!this.requests && !fallbackScheduled) {
			return;
		}
		const store = template.elementDisposables;
		const indicator = template.scheduledIndicator ??= $(`span.session-scheduled-indicator${ThemeIcon.asCSSSelector(Codicon.clock)}`, { 'aria-hidden': 'true' });
		if (template.compactHoverDescription.nextSibling !== indicator) {
			template.compactHoverDescription.after(indicator);
		}
		store.add(autorun(reader => {
			const visible = this.requests
				? !!this.requests.read(reader).get(getComparisonKey(getResource(reader)))?.length
				: !!fallbackScheduled?.(reader);
			const hadFocus = isAncestorOfActiveElement(indicator);
			indicator.classList.toggle('visible', visible);
			if (!visible && hadFocus) {
				focusRow();
			}
		}));
		const getRequests = () => this.requests?.get().get(getComparisonKey(getResource(undefined))) ?? [];
		const run = async (requestId: string, actionId: string) => {
			this.hoverService.hideHover(true);
			try {
				const request = getRequests().find(request => request.id === requestId);
				const action = request?.actions.find(action => action.id === actionId)
					?? (request?.editAction?.id === actionId ? request.editAction : undefined);
				if (!action?.enabled) {
					throw new Error(localize('scheduledSessionActionUnavailable', "This scheduled message has changed. Open its session to manage it."));
				}
				await action.run();
			} catch (error) {
				this.notificationService.error(error);
			}
		};
		const hoverOptions = (): IDelayedHoverOptions => {
			const requests = getRequests();
			if (!requests.length) {
				return { content: localize('scheduledSessionIndicator', "Has scheduled messages"), appearance: { showPointer: true } };
			}
			// Keep open-card actions alive when the list re-renders the same row.
			const key = getScheduledRequestsCardKey(requests);
			let card = this.cards.get(template);
			if (card?.key !== key) {
				if (!card) {
					template.disposables.add(toDisposable(() => this.cards.get(template)?.store.dispose()));
				}
				card?.store.dispose();
				const cardStore = new DisposableStore();
				card = { key, store: cardStore, element: renderScheduledRequestsCard(requests, cardStore, run) };
				this.cards.set(template, card);
			}
			return {
				content: card.element,
				additionalClasses: ['session-scheduled-card-hover'],
				position: { hoverPosition: HoverPosition.RIGHT },
				persistence: { hideOnHover: false },
				appearance: { showPointer: true },
			};
		};
		store.add(this.hoverService.setupDelayedHover(indicator, hoverOptions));
		if (!this.requests) {
			return;
		}
		indicator.classList.add('actionable');
		indicator.tabIndex = 0;
		indicator.removeAttribute('aria-hidden');
		indicator.setAttribute('role', 'button');
		indicator.setAttribute('aria-label', localize('showScheduledMessages', "Show Scheduled Messages"));
		const showHover = () => {
			this.hoverService.hideHover(true);
			indicator.focus();
			this.hoverService.showInstantHover({
				...hoverOptions(), target: indicator, trapFocus: true, persistence: { hideOnHover: false, sticky: true },
			}, true);
		};
		store.add(Gesture.ignoreTarget(indicator));
		for (const type of [EventType.MOUSE_OVER, EventType.POINTER_DOWN, EventType.MOUSE_DOWN, EventType.POINTER_UP, EventType.MOUSE_UP, EventType.DBLCLICK]) {
			store.add(addDisposableListener(indicator, type, e => e.stopPropagation()));
		}
		store.add(addDisposableListener(indicator, EventType.CLICK, e => {
			EventHelper.stop(e, true);
			showHover();
		}));
		store.add(addStandardDisposableListener(indicator, EventType.KEY_DOWN, e => {
			if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
				e.preventDefault();
				e.stopPropagation();
				showHover();
			}
		}));
	}
}

function firstLine(text: string): string {
	return text.trim().split(/\r?\n/)[0] ?? '';
}

function getScheduledRequestsCardKey(requests: readonly IChatScheduledRequest[]): string {
	return JSON.stringify(requests.map(request => [
		request.id, request.runAt, request.description, request.text,
		request.actions.map(action => [action.id, action.label, action.class, action.enabled]),
		request.editAction && [request.editAction.id, request.editAction.label, request.editAction.class, request.editAction.enabled],
	]));
}

function renderScheduledRequestsCard(requests: readonly IChatScheduledRequest[], store: DisposableStore, run: (requestId: string, actionId: string) => Promise<void>): HTMLElement {
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
		const actions = CARD_ACTION_IDS.map(id => request.actions.find(action => action.id === id)
			?? (request.editAction?.id === id ? request.editAction : undefined)).filter(isDefined);
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
