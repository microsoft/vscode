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
				{
					text: localize('sessionCategory.work', "{0} Work", '$(briefcase)'),
					ariaLabel: localize('sessionCategory.workLabel', "Work"),
					tooltip: localize('sessionCategory.workDescription', "Sessions in your work folders, and conversations without a folder started here. Switching changes only which sessions are listed: Work and Personal use the same account, agents, and tools."),
					isActive: initial === 'work',
				},
				{
					text: localize('sessionCategory.personal', "{0} Personal", '$(home)'),
					ariaLabel: localize('sessionCategory.personalLabel', "Personal"),
					tooltip: localize('sessionCategory.personalDescription', "Sessions in your personal folders, and conversations without a folder started here. Switching changes only which sessions are listed: Work and Personal use the same account, agents, and tools."),
					isActive: initial === 'personal',
				},
			],
		}));
		this.element = this.radio.domNode;
		this.element.classList.add('sessions-work-chat-toggle');
		this._register(this.radio.onDidSelect(index => this.sessionCategoriesService.selectCategory(index === 0 ? 'work' : 'personal')));
		this._register(runOnChange(this.kind, kind => this.radio.setActiveItem(kind === 'work' ? 0 : 1)));
	}
}
