/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { getChatHarness, SessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IHarnessPresentation } from '../../../services/sessions/common/sessionsProvider.js';

interface IChatHarnessChoice {
	readonly harness: string;
	readonly presentation: IHarnessPresentation;
	readonly checked?: boolean;
}

/**
 * The harness choices for a new peer chat of `session`: offered only while its
 * active chat is an unsent peer draft and the session advertises more than one.
 */
export function getChatHarnessChoices(session: IActiveSession | undefined, getPresentation: (harness: string) => IHarnessPresentation | undefined, reader: IReader | undefined): readonly IChatHarnessChoice[] {
	if (!session || !session.isCreated.read(reader)) {
		return [];
	}
	const harnesses = session.capabilities.read(reader).supportsChatHarnesses ?? [];
	const activeChat = session.activeChat.read(reader);
	if (harnesses.length < 2 || isEqual(activeChat.resource, session.mainChat.read(reader).resource) || activeChat.status.read(reader) !== SessionStatus.Untitled) {
		return [];
	}
	return harnesses.map(harness => ({ harness, presentation: getPresentation(harness) ?? { label: harness, icon: Codicon.agent } }));
}

/**
 * Lets the user choose the harness of a new peer chat in the composer. Choosing
 * another harness replaces the unsent draft with a draft of that harness.
 */
export class ChatHarnessPicker extends Disposable {

	private readonly _choices: IObservable<readonly IChatHarnessChoice[]>;
	readonly isVisible: IObservable<boolean>;
	private readonly _renderDisposables = this._register(new DisposableStore());
	private _triggerElement: HTMLElement | undefined;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._choices = derived(this, reader => {
			const session = this._session.read(reader);
			const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : undefined;
			return getChatHarnessChoices(session, harness => provider?.getHarnessPresentation?.(harness), reader);
		});
		this.isVisible = this._choices.map(choices => choices.length > 0);
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-harness-picker'));
		this._renderDisposables.add({ dispose: () => slot.remove() });
		const trigger = this._triggerElement = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		trigger.setAttribute('aria-haspopup', 'listbox');
		trigger.setAttribute('aria-expanded', 'false');
		this._renderDisposables.add({ dispose: () => { this._triggerElement = undefined; } });

		this._renderDisposables.add(autorun(reader => {
			const choices = this._choices.read(reader);
			const session = this._session.read(reader);
			slot.classList.toggle('hidden', choices.length === 0);
			dom.clearNode(trigger);
			if (!session || choices.length === 0) {
				return;
			}
			const current = getChatHarness(session, session.activeChat.read(reader));
			const presentation = choices.find(choice => choice.harness === current)?.presentation ?? { label: current, icon: Codicon.agent };
			dom.append(trigger, renderIcon(presentation.icon));
			dom.append(trigger, dom.$('span.sessions-chat-dropdown-label')).textContent = presentation.label;
			dom.append(trigger, renderIcon(Codicon.chevronDownCompact)).classList.add('sessions-chat-dropdown-chevron');
			trigger.ariaLabel = localize('chatHarnessPicker.triggerAriaLabel', "Pick Harness for New Chat, {0}", presentation.label);
		}));

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				this.showPicker();
			}));
		}
		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this.showPicker();
			}
		}));
	}

	showPicker(): void {
		const trigger = this._triggerElement;
		const session = this._session.get();
		const choices = this._choices.get();
		if (!trigger || !session || choices.length === 0 || this._actionWidgetService.isVisible) {
			return;
		}
		const current = getChatHarness(session, session.activeChat.get());
		const items: IActionListItem<IChatHarnessChoice>[] = choices.map(choice => ({
			kind: ActionListItemKind.Action,
			label: choice.presentation.label,
			group: { title: '', icon: choice.presentation.icon },
			item: choice.harness === current ? { ...choice, checked: true } : choice,
		}));
		const delegate: IActionListDelegate<IChatHarnessChoice> = {
			onSelect: choice => {
				this._actionWidgetService.hide();
				this._select(session, choice.harness).catch(error => this._logService.error('[ChatHarnessPicker] Failed to switch the new chat\'s harness', error));
			},
			onHide: () => {
				trigger.setAttribute('aria-expanded', 'false');
				if (trigger.isConnected) {
					trigger.focus();
				}
			},
		};
		trigger.setAttribute('aria-expanded', 'true');
		this._actionWidgetService.show<IChatHarnessChoice>(
			'chatHarnessPicker',
			false,
			items,
			delegate,
			trigger,
			undefined,
			[],
			{
				getAriaLabel: element => element.label ?? '',
				getWidgetAriaLabel: () => localize('chatHarnessPicker.ariaLabel', "Harness for New Chat"),
			},
			{ className: 'sessions-new-chat-picker-list', minWidth: 200 },
		);
	}

	private async _select(session: IActiveSession, harness: string): Promise<void> {
		const draft = session.activeChat.get();
		if (getChatHarness(session, draft) === harness) {
			return;
		}
		await this._sessionsService.openNewChatInSession(session, { harness });
		// The unsent draft of the previous harness is replaced, not left behind as an empty tab.
		const replaced = !isEqual(session.activeChat.get().resource, draft.resource)
			&& !isEqual(draft.resource, session.mainChat.get().resource)
			&& draft.status.get() === SessionStatus.Untitled;
		if (replaced) {
			await this._sessionsManagementService.deleteChat(session, draft.resource, { skipConfirmation: true });
		}
	}
}
