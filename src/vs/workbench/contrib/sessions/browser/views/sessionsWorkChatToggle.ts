/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Radio } from '../../../../../base/browser/ui/radio/radio.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { SessionsListKind } from './sessionsListFilters.js';

export class SessionsWorkChatToggle extends Disposable {
	private static readonly STORAGE_KEY = 'sessionsViewPane.workChat';
	private readonly selectedKind;
	readonly kind: IObservable<SessionsListKind>;
	readonly element: HTMLElement;
	private readonly radio: Radio;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		const initial = storageService.get(SessionsWorkChatToggle.STORAGE_KEY, StorageScope.PROFILE) === 'chat' ? 'chat' : 'work';
		this.selectedKind = observableValue<SessionsListKind>(this, initial);
		this.kind = this.selectedKind;
		this.radio = this._register(new Radio({
			className: 'segmented',
			ariaLabel: localize('workChat.label', "Session category"),
			items: [
				{ text: localize('workChat.work', "{0} Work", '$(code)'), ariaLabel: localize('workChat.workLabel', "Work"), tooltip: localize('workChat.workDescription', "Work: sessions with a project"), isActive: initial === 'work' },
				{ text: localize('workChat.chat', "{0} Chat", '$(comment-discussion)'), ariaLabel: localize('workChat.chatLabel', "Chat"), tooltip: localize('workChat.chatDescription', "Chat: conversations without a project"), isActive: initial === 'chat' },
			],
		}));
		this.element = this.radio.domNode;
		this.element.classList.add('sessions-work-chat-toggle');
		this._register(this.radio.onDidSelect(index => this.select(index === 0 ? 'work' : 'chat')));
	}

	private select(kind: SessionsListKind): void {
		this.radio.setActiveItem(kind === 'work' ? 0 : 1);
		this.selectedKind.set(kind, undefined);
		this.storageService.store(SessionsWorkChatToggle.STORAGE_KEY, kind, StorageScope.PROFILE, StorageTarget.MACHINE);
	}
}
