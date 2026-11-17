/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Radio } from '../../../../../base/browser/ui/radio/radio.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, runOnChange } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { SessionsListKind } from './sessionsListFilters.js';
import { ISessionCategoriesService } from '../../common/sessionCategory.js';

export class SessionsWorkChatToggle extends Disposable {
	readonly kind: IObservable<SessionsListKind>;
	readonly element: HTMLElement;
	private readonly radio: Radio;

	constructor(
		@ISessionCategoriesService private readonly sessionCategoriesService: ISessionCategoriesService,
	) {
		super();
		this.kind = sessionCategoriesService.selectedCategory;
		const initial = this.kind.get();
		this.radio = this._register(new Radio({
			className: 'segmented',
			ariaLabel: localize('workChat.label', "Session category"),
			items: [
				{ text: localize('workChat.work', "{0} Work", '$(code)'), ariaLabel: localize('workChat.workLabel', "Work"), tooltip: localize('workChat.workDescription', "Sessions started in Work, grouped by workspace"), isActive: initial === 'work' },
				{ text: localize('workChat.chat', "{0} Chat", '$(comment-discussion)'), ariaLabel: localize('workChat.chatLabel', "Chat"), tooltip: localize('workChat.chatDescription', "Sessions started in Chat, without workspace groups"), isActive: initial === 'chat' },
			],
		}));
		this.element = this.radio.domNode;
		this.element.classList.add('sessions-work-chat-toggle');
		this._register(this.radio.onDidSelect(index => this.sessionCategoriesService.selectCategory(index === 0 ? 'work' : 'chat')));
		this._register(runOnChange(this.kind, kind => this.radio.setActiveItem(kind === 'work' ? 0 : 1)));
	}
}
