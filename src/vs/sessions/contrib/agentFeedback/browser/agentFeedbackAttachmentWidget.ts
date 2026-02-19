/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentFeedbackAttachment.css';
import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as event from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAgentFeedbackVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { AgentFeedbackHover } from './agentFeedbackHover.js';

/**
 * Attachment widget that renders "N comments" with a comment icon
 * and a custom hover showing all feedback items with actions.
 */
export class AgentFeedbackAttachmentWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidDelete = this._store.add(new event.Emitter<Event>());
	readonly onDidDelete = this._onDidDelete.event;

	private readonly _onDidOpen = this._store.add(new event.Emitter<void>());
	readonly onDidOpen = this._onDidOpen.event;

	constructor(
		private readonly _attachment: IAgentFeedbackVariableEntry,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this.element = dom.append(container, dom.$('.chat-attached-context-attachment.agent-feedback-attachment'));
		this.element.tabIndex = 0;
		this.element.role = 'button';

		// Icon
		const iconSpan = dom.$('span');
		iconSpan.classList.add(...ThemeIcon.asClassNameArray(Codicon.comment));
		const pillIcon = dom.$('div.chat-attached-context-pill', {}, iconSpan);
		this.element.appendChild(pillIcon);

		// Label
		const label = dom.$('span.chat-attached-context-custom-text', {}, this._attachment.name);
		this.element.appendChild(label);

		// Clear button
		if (options.supportsDeletion) {
			const clearBtn = dom.append(this.element, dom.$('.chat-attached-context-clear-button'));
			const clearIcon = dom.$('span');
			clearIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
			clearBtn.appendChild(clearIcon);
			clearBtn.title = localize('removeAttachment', "Remove");
			this._store.add(dom.addDisposableListener(clearBtn, dom.EventType.CLICK, (e) => {
				e.preventDefault();
				e.stopPropagation();
				this._onDidDelete.fire(e);
			}));
			if (options.shouldFocusClearButton) {
				clearBtn.focus();
			}
		}

		// Aria label
		this.element.ariaLabel = localize('chat.agentFeedback', "Attached agent feedback, {0}", this._attachment.name);

		// Custom interactive hover
		this._store.add(this._instantiationService.createInstance(AgentFeedbackHover, this.element, this._attachment));
	}
}
