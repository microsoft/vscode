/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/feedback';
import nls = require('vs/nls');
import {IDisposable} from 'vs/base/common/lifecycle';
import {Builder, $} from 'vs/base/browser/builder';
import {Dropdown} from 'vs/base/browser/ui/dropdown/dropdown';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';

export interface IFeedback {
	feedback: string;
	sentiment: number;
}

export interface IFeedbackService {
	submitFeedback(feedback: IFeedback): void;
}

export interface IFeedbackDropdownOptions {
	contextViewProvider: IContextViewService;
	feedbackService?: IFeedbackService;
}

enum FormEvent {
	SENDING,
	SENT,
	SEND_ERROR
}

export class FeedbackDropdown extends Dropdown {
	protected static MAX_FEEDBACK_CHARS: number = 140;

	protected feedback: string;
	protected sentiment: number;
	protected aliasEnabled: boolean;
	protected isSendingFeedback: boolean;
	protected autoHideTimeout: number;

	protected feedbackService: IFeedbackService;

	protected feedbackForm: HTMLFormElement;
	protected feedbackDescriptionInput: HTMLTextAreaElement;
	protected smileyInput: Builder;
	protected frownyInput: Builder;
	protected sendButton: Builder;

	protected requestFeatureLink: string;
	protected reportIssueLink: string;

	constructor(
		container: HTMLElement,
		options: IFeedbackDropdownOptions,
		@ITelemetryService protected telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(container, {
			contextViewProvider: options.contextViewProvider,
			labelRenderer: (container: HTMLElement): IDisposable => {
				$(container).addClass('send-feedback');
				return null;
			}
		});

		this.$el.addClass('send-feedback');
		this.$el.title(nls.localize('sendFeedback', "Tweet Feedback"));

		this.feedbackService = options.feedbackService;

		this.feedback = '';
		this.sentiment = 1;

		this.feedbackForm = null;
		this.feedbackDescriptionInput = null;

		this.smileyInput = null;
		this.frownyInput = null;

		this.sendButton = null;

		const env = contextService.getConfiguration().env;
		this.reportIssueLink = env.sendASmile.reportIssueUrl;
		this.requestFeatureLink = env.sendASmile.requestFeatureUrl;
	}

	public renderContents(container: HTMLElement): IDisposable {
		let $form = $('form.feedback-form').attr({
			action: 'javascript:void(0);',
			tabIndex: '-1'
		}).appendTo(container);

		$(container).addClass('monaco-menu-container');

		this.feedbackForm = <HTMLFormElement>$form.getHTMLElement();

		$('h2.title').text(nls.localize("label.sendASmile", "Tweet us your feedback.")).appendTo($form);

		this.invoke($('div.cancel').attr('tabindex', '0'), () => {
			this.hide();
		}).appendTo($form);

		let $content = $('div.content').appendTo($form);

		let $sentimentContainer = $('div').appendTo($content);
		$('span').text(nls.localize("sentiment", "How was your experience?")).appendTo($sentimentContainer);

		let $feedbackSentiment = $('div.feedback-sentiment').appendTo($sentimentContainer);

		this.smileyInput = $('div').addClass('sentiment smile').attr({
			'aria-checked': 'false',
			'aria-label': nls.localize('smileCaption', "Happy"),
			'tabindex': 0,
			'role': 'checkbox'
		});
		this.invoke(this.smileyInput, () => { this.setSentiment(true); }).appendTo($feedbackSentiment);

		this.frownyInput = $('div').addClass('sentiment frown').attr({
			'aria-checked': 'false',
			'aria-label': nls.localize('frownCaption', "Sad"),
			'tabindex': 0,
			'role': 'checkbox'
		});

		this.invoke(this.frownyInput, () => { this.setSentiment(false); }).appendTo($feedbackSentiment);

		if (this.sentiment === 1) {
			this.smileyInput.addClass('checked').attr('aria-checked', 'true');
		} else {
			this.frownyInput.addClass('checked').attr('aria-checked', 'true');
		}

		let $contactUs = $('div.contactus').appendTo($content);

		$('span').text(nls.localize("other ways to contact us", "Other ways to contact us")).appendTo($contactUs);

		let $contactUsContainer = $('div.channels').appendTo($contactUs);

		$('div').append($('a').attr('target', '_blank').attr('href', this.reportIssueLink).text(nls.localize("submit a bug", "Submit a bug")).attr('tabindex', '0'))
			.appendTo($contactUsContainer);

		$('div').append($('a').attr('target', '_blank').attr('href', this.requestFeatureLink).text(nls.localize("request a missing feature", "Request a missing feature")).attr('tabindex', '0'))
			.appendTo($contactUsContainer);

		let $charCounter = $('span.char-counter').text(this.getCharCountText(0));

		$('h3').text(nls.localize("tell us why?", "Tell us why?"))
			.append($charCounter)
			.appendTo($form);

		this.feedbackDescriptionInput = <HTMLTextAreaElement>$('textarea.feedback-description').attr({
			rows: 3,
			maxlength: FeedbackDropdown.MAX_FEEDBACK_CHARS,
			'aria-label': nls.localize("commentsHeader", "Comments")
		})
			.text(this.feedback).attr('required', 'required')
			.on('keyup', () => {
				$charCounter.text(this.getCharCountText(this.feedbackDescriptionInput.value.length));
				this.feedbackDescriptionInput.value ? this.sendButton.removeAttribute('disabled') : this.sendButton.attr('disabled', '');
			})
			.appendTo($form).domFocus().getHTMLElement();

		let $buttons = $('div.form-buttons').appendTo($form);

		this.sendButton = this.invoke($('input.send').type('submit').attr('disabled', '').value(nls.localize('tweet', "Tweet")).appendTo($buttons), () => {
			if (this.isSendingFeedback) {
				return;
			}
			this.onSubmit();
		});

		return {
			dispose: () => {
				this.feedbackForm = null;
				this.feedbackDescriptionInput = null;
				this.smileyInput = null;
				this.frownyInput = null;
			}
		};
	}

	private getCharCountText(charCount: number): string {
		let remaining = FeedbackDropdown.MAX_FEEDBACK_CHARS - charCount;
		let text = (remaining === 1)
			? nls.localize("character left", "character left")
			: nls.localize("characters left", "characters left");

		return '(' + remaining + ' ' + text + ')';
	}

	protected setSentiment(smile: boolean): void {
		if (smile) {
			this.smileyInput.addClass('checked');
			this.smileyInput.attr('aria-checked', 'true');
			this.frownyInput.removeClass('checked');
			this.frownyInput.attr('aria-checked', 'false');
		} else {
			this.frownyInput.addClass('checked');
			this.frownyInput.attr('aria-checked', 'true');
			this.smileyInput.removeClass('checked');
			this.smileyInput.attr('aria-checked', 'false');
		}
		this.sentiment = smile ? 1 : 0;
	}

	protected invoke(element: Builder, callback: () => void): Builder {
		element.on('click', callback);
		element.on('keypress', (e) => {
			if (e instanceof KeyboardEvent) {
				let keyboardEvent = <KeyboardEvent>e;
				if (keyboardEvent.keyCode === 13 || keyboardEvent.keyCode === 32) { // Enter or Spacebar
					callback();
				}
			}
		});
		return element;
	}

	public hide(): void {
		if (this.feedbackDescriptionInput) {
			this.feedback = this.feedbackDescriptionInput.value;
		}

		if (this.autoHideTimeout) {
			clearTimeout(this.autoHideTimeout);
			this.autoHideTimeout = null;
		}

		super.hide();
	}

	public onEvent(e: Event, activeElement: HTMLElement): void {
		if (e instanceof KeyboardEvent) {
			let keyboardEvent = <KeyboardEvent>e;
			if (keyboardEvent.keyCode === 27) { // Escape
				this.hide();
			}
		}
	}

	protected onSubmit(): void {
		if ((this.feedbackForm.checkValidity && !this.feedbackForm.checkValidity())) {
			return;
		}

		this.changeFormStatus(FormEvent.SENDING);

		this.feedbackService.submitFeedback({
			feedback: this.feedbackDescriptionInput.value,
			sentiment: this.sentiment
		});

		this.changeFormStatus(FormEvent.SENT);
	}


	private changeFormStatus(event: FormEvent): void {
		switch (event) {
			case FormEvent.SENDING:
				this.isSendingFeedback = true;
				this.sendButton.setClass('send in-progress');
				this.sendButton.value(nls.localize('feedbackSending', "Sending"));
				break;
			case FormEvent.SENT:
				this.isSendingFeedback = false;
				this.sendButton.setClass('send success').value(nls.localize('feedbackSent', "Thanks"));
				this.resetForm();
				this.autoHideTimeout = setTimeout(() => {
					this.hide();
				}, 1000);
				this.sendButton.off(['click', 'keypress']);
				this.invoke(this.sendButton, () => {
					this.hide();
					this.sendButton.off(['click', 'keypress']);
				});
				break;
			case FormEvent.SEND_ERROR:
				this.isSendingFeedback = false;
				this.sendButton.setClass('send error').value(nls.localize('feedbackSendingError', "Try again"));
				break;
		}
	}

	protected resetForm(): void {
		if (this.feedbackDescriptionInput) {
			this.feedbackDescriptionInput.value = '';
		}
		this.sentiment = 1;
		this.aliasEnabled = false;
	}
}
