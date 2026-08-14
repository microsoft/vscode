/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';

const $ = dom.$;

/**
 * The rating a user cast on a chat response through the footer toolbar.
 */
export const enum ChatHelpfulnessVote {
	Yes = 'yes',
	No = 'no',
}

/**
 * Event fired when the user submits feedback through the {@link ChatHelpfulnessBanner}.
 */
export interface IChatHelpfulnessFeedback {
	readonly vote: ChatHelpfulnessVote;
	readonly detail: string;
}

/**
 * A prototype for the helpfulness feedback experiment shown to the Auto model
 * cohort in place of the footer thumbs. It presents "Helpful"/"Unhelpful"
 * buttons inline on the footer toolbar row; once a rating is cast it reveals an
 * optional full-width detail text box below, and once submitted the buttons are
 * replaced inline by a short "thanks" acknowledgement.
 */
export class ChatHelpfulnessBanner extends Disposable {

	private readonly _onDidSubmit = this._register(new Emitter<IChatHelpfulnessFeedback>());
	readonly onDidSubmit: Event<IChatHelpfulnessFeedback> = this._onDidSubmit.event;

	private readonly _onDidVote = this._register(new Emitter<ChatHelpfulnessVote>());
	readonly onDidVote: Event<ChatHelpfulnessVote> = this._onDidVote.event;

	private readonly promptRow: HTMLElement;
	private readonly thanksRow: HTMLElement;
	private readonly detailRow: HTMLElement;
	private readonly yesButton: Button;
	private readonly noButton: Button;
	private readonly detailInput: HTMLTextAreaElement;

	private visible = false;
	private submitted = false;
	private vote: ChatHelpfulnessVote | undefined;

	/**
	 * @param inlineContainer host for the prompt / thanks, rendered inline on the
	 * footer toolbar row.
	 * @param blockContainer host for the full-width detail box, rendered on its
	 * own row below the toolbar.
	 */
	constructor(inlineContainer: HTMLElement, blockContainer: HTMLElement) {
		super();

		// Prompt row: Helpful/Unhelpful buttons, shown by default inline on the
		// footer toolbar row as the obvious entry point into the feedback flow.
		this.promptRow = dom.append(inlineContainer, $('.chat-helpfulness-prompt.hidden'));

		const buttonsContainer = dom.append(this.promptRow, $('.chat-helpfulness-buttons'));
		this.yesButton = this._register(this.createVoteButton(buttonsContainer, Codicon.thumbsup, localize('chat.helpfulness.yes', "Helpful"), ChatHelpfulnessVote.Yes));
		this.noButton = this._register(this.createVoteButton(buttonsContainer, Codicon.thumbsdown, localize('chat.helpfulness.no', "Unhelpful"), ChatHelpfulnessVote.No));

		// Thanks row: replaces the prompt inline once feedback is submitted.
		this.thanksRow = dom.append(inlineContainer, $('.chat-helpfulness-thanks.hidden'));
		this.thanksRow.textContent = localize('chat.helpfulness.thanks', "Thanks for your feedback!");

		// Detail row: full-width textarea + submit button, revealed on its own
		// row below the toolbar once a rating is cast.
		this.detailRow = dom.append(blockContainer, $('.chat-helpfulness-details.hidden'));
		this.detailInput = dom.append(this.detailRow, $('textarea.chat-helpfulness-input')) as HTMLTextAreaElement;
		this.detailInput.rows = 2;
		this.detailInput.placeholder = localize('chat.helpfulness.detailPlaceholder', "Add more detail (optional)");
		this.detailInput.setAttribute('aria-label', localize('chat.helpfulness.detailAriaLabel', "Additional feedback detail (optional)"));

		const submitContainer = dom.append(this.detailRow, $('.chat-helpfulness-submit'));
		const submitButton = this._register(new Button(submitContainer, { ...defaultButtonStyles, title: localize('chat.helpfulness.submit', "Submit") }));
		submitButton.label = localize('chat.helpfulness.submit', "Submit");
		this._register(submitButton.onDidClick(() => this.submit()));
	}

	private createVoteButton(container: HTMLElement, icon: ThemeIcon, label: string, vote: ChatHelpfulnessVote): Button {
		const button = new Button(container, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: label });
		button.element.classList.add('chat-helpfulness-vote');
		button.label = `$(${icon.id}) ${label}`;
		this._register(button.onDidClick(() => {
			this._onDidVote.fire(vote);
			this.showForVote(vote);
			this.detailInput.focus();
		}));
		return button;
	}

	private render(): void {
		const showThanks = this.visible && this.submitted;
		const showPrompt = this.visible && !this.submitted;
		const showDetail = this.visible && !this.submitted && this.vote !== undefined;

		this.promptRow.classList.toggle('hidden', !showPrompt);
		this.thanksRow.classList.toggle('hidden', !showThanks);
		this.detailRow.classList.toggle('hidden', !showDetail);

		const yesSelected = this.vote === ChatHelpfulnessVote.Yes;
		const noSelected = this.vote === ChatHelpfulnessVote.No;
		this.yesButton.checked = yesSelected;
		this.noButton.checked = noSelected;
		this.yesButton.element.classList.toggle('selected', yesSelected);
		this.noButton.element.classList.toggle('selected', noSelected);
	}

	/**
	 * Reveals the optional detail text box for the given rating.
	 */
	showForVote(vote: ChatHelpfulnessVote): void {
		this.vote = vote;
		this.submitted = false;
		this.render();
	}

	/**
	 * Replaces the prompt inline with a short acknowledgement once feedback has
	 * been submitted.
	 */
	showThanks(): void {
		this.submitted = true;
		this.render();
	}

	private submit(): void {
		if (!this.vote || this.submitted) {
			return;
		}

		this._onDidSubmit.fire({ vote: this.vote, detail: this.detailInput.value.trim() });
		this.showThanks();
	}

	/**
	 * Resets the banner back to its initial (collapsed) state. Used when the row
	 * template is recycled for a different response.
	 */
	reset(): void {
		this.vote = undefined;
		this.submitted = false;
		this.detailInput.value = '';
		this.render();
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		this.render();
	}
}
