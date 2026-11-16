/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatScheduledRequestEditToolbar.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IChatScheduledRequestEditing } from '../../../common/model/chatViewModel.js';

/** Runs a button's command on click, Enter and Space, the way action items do. */
function onActivate(element: HTMLElement, store: DisposableStore, run: (e: UIEvent) => void): void {
	store.add(dom.addDisposableListener(element, dom.EventType.CLICK, e => {
		dom.EventHelper.stop(e, true);
		run(e);
	}));
	store.add(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, e => {
		const event = new StandardKeyboardEvent(e);
		if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
			dom.EventHelper.stop(e, true);
			run(e);
		}
	}));
}

/**
 * Cancel and a Save split button, in place of Send while a scheduled message is open in the input. Save says when the
 * message will send; its chevron changes that time.
 */
export class ChatScheduledRequestEditToolbar extends Disposable {

	readonly element: HTMLElement;
	private readonly saveLabel: HTMLElement;
	private readonly changeTime: HTMLElement;
	private editing: IChatScheduledRequestEditing | undefined;
	private readonly editingStore = this._register(new DisposableStore());

	constructor(
		container: HTMLElement,
		private readonly save: () => Promise<unknown>,
		private readonly focusInput: () => void,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.element = dom.append(container, dom.$('.chat-scheduled-edit-toolbar', { role: 'toolbar', 'aria-label': localize('chatScheduledEdit.toolbar', "Scheduled Message") }));
		const cancel = dom.append(this.element, dom.$('a.chat-scheduled-edit-cancel', { role: 'button', tabindex: '0' }, localize('chatScheduledEdit.cancel', "Cancel")));
		const split = dom.append(this.element, dom.$('.chat-scheduled-edit-save'));
		this.saveLabel = dom.append(split, dom.$('a.chat-scheduled-edit-save-label', { role: 'button', tabindex: '0' }));
		dom.append(split, dom.$('span.chat-scheduled-edit-save-separator', { 'aria-hidden': 'true' }));
		this.changeTime = dom.append(split, dom.$(`a.chat-scheduled-edit-change-time${ThemeIcon.asCSSSelector(Codicon.chevronDown)}`, { role: 'button', tabindex: '0', 'aria-haspopup': 'dialog' }));

		const store = this._register(new DisposableStore());
		onActivate(cancel, store, () => this.editing?.cancel());
		onActivate(this.saveLabel, store, () => this.run(this.save()));
		// Typing continues in the message once the time is chosen.
		onActivate(this.changeTime, store, () => this.run(Promise.resolve(this.editing?.selectTime.run(this.changeTime)).then(() => this.focusInput())));
	}

	update(editing: IChatScheduledRequestEditing | undefined): void {
		if (editing !== this.editing) {
			this.editing = editing;
			this.editingStore.clear();
			if (editing) {
				this.editingStore.add(autorun(reader => this.element.classList.toggle('saving', !!editing.isSaving?.read(reader))));
			}
		}
		if (!editing) {
			return;
		}
		const saveFor = localize('chatScheduledEdit.saveFor', "Save for {0}", editing.description);
		this.saveLabel.textContent = saveFor;
		this.saveLabel.setAttribute('aria-label', saveFor);
		this.changeTime.setAttribute('aria-label', localize('chatScheduledEdit.changeTime', "Change Send Time, {0}", editing.description));
	}

	private run(promise: Promise<unknown> | unknown): void {
		Promise.resolve(promise).catch(error => {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		});
	}
}
