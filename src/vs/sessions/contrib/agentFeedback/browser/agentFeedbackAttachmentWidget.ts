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
import { truncate } from '../../../../base/common/strings.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAgentFeedbackVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { AgentFeedbackContextView } from './agentFeedbackContextView.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';

/**
 * Attachment widget that renders feedback comments and reveals them from a context view.
 */
export class AgentFeedbackAttachmentWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidDelete = this._store.add(new event.Emitter<Event>());
	readonly onDidDelete = this._onDidDelete.event;

	private readonly _onDidOpen = this._store.add(new event.Emitter<void>());
	readonly onDidOpen = this._onDidOpen.event;

	private readonly _contextView: AgentFeedbackContextView;

	constructor(
		private readonly _attachment: IAgentFeedbackVariableEntry,
		options: { shouldFocusClearButton: boolean; supportsDeletion: boolean },
		container: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentFeedbackService private readonly _agentFeedbackService: IAgentFeedbackService,
	) {
		super();

		this.element = dom.append(container, dom.$('.chat-attached-context-attachment.agent-feedback-attachment'));
		this.element.tabIndex = 0;
		this.element.role = 'button';
		const singleFeedback = this._attachment.feedbackItems.length === 1 ? this._attachment.feedbackItems[0] : undefined;
		if (this._attachment.feedbackItems.length > 1) {
			this.element.ariaHasPopup = 'tree';
			this.element.ariaExpanded = 'false';
		}

		const iconSpan = dom.$('span');
		iconSpan.classList.add(...ThemeIcon.asClassNameArray(Codicon.comment));
		iconSpan.ariaHidden = 'true';
		const pillIcon = dom.$('div.chat-attached-context-pill', {}, iconSpan);
		this.element.appendChild(pillIcon);

		const attachmentLabel = singleFeedback ? truncate(singleFeedback.text, 25) : this._attachment.name;
		const label = dom.$('span.chat-attached-context-custom-text', {}, attachmentLabel);
		this.element.appendChild(label);

		const deletionCurrentlyNotSupported = true;

		// Clear button
		if (options.supportsDeletion && !deletionCurrentlyNotSupported) {
			const clearBtn = dom.append(this.element, dom.$('.chat-attached-context-clear-button'));
			const clearIcon = dom.$('span');
			clearIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.closeCompact));
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

		this.element.ariaLabel = localize('chat.agentFeedback', "Attached agent feedback, {0}", this._attachment.name);

		this._store.add(dom.addDisposableListener(this.element, dom.EventType.CLICK, e => {
			e.preventDefault();
			e.stopPropagation();
			this._activateAttachment();
		}));
		this._store.add(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				this._activateAttachment();
			}
		}));

		this._contextView = this._store.add(this._instantiationService.createInstance(AgentFeedbackContextView, this.element, this._attachment, options.supportsDeletion));
	}

	private _activateAttachment(): void {
		const feedbackItems = this._attachment.feedbackItems;
		if (feedbackItems.length === 0) {
			return;
		}
		if (feedbackItems.length === 1) {
			void this._agentFeedbackService.revealFeedback(this._attachment.sessionResource, feedbackItems[0].id);
			return;
		}
		this._contextView.toggle();
	}
}
