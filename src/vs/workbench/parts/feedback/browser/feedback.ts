/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/feedback';
import nls = require('vs/nls');
import {IDisposable} from 'vs/base/common/lifecycle';
import {Builder, $} from 'vs/base/browser/builder';
import errors = require('vs/base/common/errors');
import {Promise} from 'vs/base/common/winjs.base';
import {Dropdown} from 'vs/base/browser/ui/dropdown/dropdown';
import {IXHRResponse} from 'vs/base/common/http';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

const STATUS_TIMEOUT = 500;

export interface IFeedback {
	feedback: string;
	alias: string;
	sentiment: number;
}

export interface IFeedbackService {
	submitFeedback(feedback: IFeedback): Promise;
}

export interface IFeedbackDropdownOptions {
	contextViewProvider: IContextViewService;
	feedbackService?: IFeedbackService;
}

enum FormEvent {
	SENDING,
	SENT,
	SEND_ERROR
};

export class FeedbackDropdown extends Dropdown {

	protected feedback: string;
	protected alias: string;
	protected sentiment: number;
	protected aliasEnabled: boolean;
	protected isSendingFeedback: boolean;
	protected autoHideTimeout: number;

	protected feedbackService: IFeedbackService;

	protected feedbackForm: HTMLFormElement;
	protected feedbackDescriptionInput: HTMLTextAreaElement;
	protected feedbackAliasInput: HTMLInputElement;
	protected smileyInput: Builder;
	protected frownyInput: Builder;
	protected sendButton: Builder;

	constructor(
		container: HTMLElement,
		options: IFeedbackDropdownOptions,
		@ITelemetryService protected telemetryService: ITelemetryService
	) {
		super(container, {
			contextViewProvider: options.contextViewProvider,
			labelRenderer: (container: HTMLElement): IDisposable => {
				$(container).addClass('send-feedback');
				return null;
			}
		});

		this.$el.addClass('send-feedback');
		this.$el.title(nls.localize('sendFeedback', "Send Feedback"));

		this.feedbackService = options.feedbackService;

		this.feedback = '';
		this.alias = '';
		this.aliasEnabled = false;
		this.sentiment = 1;

		this.feedbackForm = null;
		this.feedbackDescriptionInput = null;
		this.feedbackAliasInput = null;

		this.smileyInput = null;
		this.frownyInput = null;

		this.sendButton = null;
	}

	public renderContents(container: HTMLElement): IDisposable {
		let $form = $('form.feedback-form').attr({
			action: 'javascript:void(0);',
			tabIndex: '-1'
		}).appendTo(container);

		$(container).addClass('monaco-menu-container');

		this.feedbackForm = <HTMLFormElement>$form.getHTMLElement();

		$('h2.title').text(nls.localize("label.sendASmile", "Let us know how we're doing")).appendTo($form);

		this.invoke($('div.cancel'), () => {
			this.hide();
		}).appendTo($form);

		$('h3').text(nls.localize("sentiment", "How was your experience?")).appendTo($form);

		let $feedbackSentiment = $('div.feedback-sentiment').appendTo($form);


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

		$('h3').text(nls.localize("commentsHeader", "Comments")).appendTo($form);

		this.feedbackDescriptionInput = <HTMLTextAreaElement>$('textarea.feedback-description').attr({
			rows: 8,
			'aria-label': nls.localize("commentsHeader", "Comments")
		})
			.text(this.feedback).attr('required', 'required')
			.on('keyup', () => {
				this.feedbackDescriptionInput.value ? this.sendButton.removeAttribute('disabled') : this.sendButton.attr('disabled', '');
			})
			.appendTo($form).domFocus().getHTMLElement();

		let aliasHeaderText = nls.localize('aliasHeader', "Add e-mail address");

		this.feedbackAliasInput = <HTMLInputElement>$('input.feedback-alias')
			.type('text')
			.text(aliasHeaderText)
			.attr('type', 'email')
			.attr('placeholder', nls.localize('aliasPlaceholder', "Optional e-mail address"))
			.value(this.alias)
			.attr('aria-label', aliasHeaderText)
			.appendTo($form)
			.getHTMLElement();

		let $buttons = $('div.form-buttons').appendTo($form);

		this.sendButton = this.invoke($('input.send').type('submit').attr('disabled', '').value(nls.localize('send', "Send")).appendTo($buttons), () => {
			if (this.isSendingFeedback) {
				return;
			}
			this.onSubmit().then(null, function() { });
		});

		return {
			dispose: () => {
				this.feedbackForm = null;
				this.feedbackDescriptionInput = null;
				this.feedbackAliasInput = null;
				this.smileyInput = null;
				this.frownyInput = null;
			}
		};
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

		if (this.feedbackAliasInput) {
			this.alias = this.feedbackAliasInput.value;
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

	protected onSubmit(): Promise {
		if ((this.feedbackForm.checkValidity && !this.feedbackForm.checkValidity())) {
			return Promise.as(null);
		}

		this.changeFormStatus(FormEvent.SENDING);

		return this.feedbackService.submitFeedback({
			feedback: this.feedbackDescriptionInput.value,
			alias: this.feedbackAliasInput.value,
			sentiment: this.sentiment
		}).then((response: IXHRResponse) => {
			setTimeout(() => { this.changeFormStatus(FormEvent.SENT); }, STATUS_TIMEOUT);
			return '';
		}, (xhr: IXHRResponse) => {
			setTimeout(() => { this.changeFormStatus(FormEvent.SEND_ERROR); }, STATUS_TIMEOUT);
			return Promise.wrapError(new errors.ConnectionError(xhr));
		});
	}


	private changeFormStatus(event: FormEvent): void {
		switch (event) {
			case FormEvent.SENDING:
				this.isSendingFeedback = true;
				this.sendButton.setClass('send in-progress');
				this.sendButton.value(nls.localize('feedbackSending', "Sending..."));
				break;
			case FormEvent.SENT:
				this.isSendingFeedback = false;
				this.sendButton.setClass('send success').value(nls.localize('feedbackSent', "Thanks :)"));
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
		this.feedbackDescriptionInput ? this.feedbackDescriptionInput.value = '' : null;
		this.feedbackAliasInput ? this.feedbackAliasInput.value = '' : null;
		this.sentiment = 1;
		this.aliasEnabled = false;
	}
}
