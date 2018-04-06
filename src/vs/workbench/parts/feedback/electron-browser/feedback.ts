/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/feedback';
import * as nls from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Builder, $ } from 'vs/base/browser/builder';
import { Dropdown } from 'vs/base/browser/ui/dropdown/dropdown';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import product from 'vs/platform/node/product';
import * as dom from 'vs/base/browser/dom';
import { ICommandService } from 'vs/platform/commands/common/commands';
import * as errors from 'vs/base/common/errors';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { attachButtonStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { editorWidgetBackground, widgetShadow, inputBorder, inputForeground, inputBackground, inputActiveOptionBorder, editorBackground, buttonBackground, contrastBorder, darken } from 'vs/platform/theme/common/colorRegistry';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { Button } from 'vs/base/browser/ui/button/button';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export const FEEDBACK_VISIBLE_CONFIG = 'workbench.statusBar.feedback.visible';

export interface IFeedback {
	feedback: string;
	sentiment: number;
}

export interface IFeedbackService {
	submitFeedback(feedback: IFeedback): void;
	getCharacterLimit(sentiment: number): number;
}

export interface IFeedbackDropdownOptions {
	contextViewProvider: IContextViewService;
	feedbackService?: IFeedbackService;
	onFeedbackVisibilityChange?: (visible: boolean) => void;
}

enum FormEvent {
	SENDING,
	SENT,
	SEND_ERROR
}

export class FeedbackDropdown extends Dropdown {
	private maxFeedbackCharacters: number;

	private feedback: string;
	private sentiment: number;
	private isSendingFeedback: boolean;
	private autoHideTimeout: number;

	private feedbackService: IFeedbackService;

	private feedbackForm: HTMLFormElement;
	private feedbackDescriptionInput: HTMLTextAreaElement;
	private smileyInput: Builder;
	private frownyInput: Builder;
	private sendButton: Button;
	private $sendButton: Builder;
	private hideButton: HTMLInputElement;
	private remainingCharacterCount: Builder;

	private requestFeatureLink: string;

	private _isPure: boolean;

	constructor(
		container: HTMLElement,
		private options: IFeedbackDropdownOptions,
		@ICommandService private commandService: ICommandService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IIntegrityService private integrityService: IIntegrityService,
		@IThemeService private themeService: IThemeService,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService
	) {
		super(container, {
			contextViewProvider: options.contextViewProvider,
			labelRenderer: (container: HTMLElement): IDisposable => {
				$(container).addClass('send-feedback', 'mask-icon');

				return null;
			}
		});

		this._isPure = true;
		this.integrityService.isPure().then(result => {
			if (!result.isPure) {
				this._isPure = false;
			}
		});

		dom.addClass(this.element, 'send-feedback');
		this.element.title = nls.localize('sendFeedback', "Tweet Feedback");

		this.feedbackService = options.feedbackService;

		this.feedback = '';
		this.sentiment = 1;
		this.maxFeedbackCharacters = this.feedbackService.getCharacterLimit(this.sentiment);

		this.feedbackForm = null;
		this.feedbackDescriptionInput = null;

		this.smileyInput = null;
		this.frownyInput = null;

		this.sendButton = null;
		this.$sendButton = null;

		this.requestFeatureLink = product.sendASmile.requestFeatureUrl;
	}

	protected getAnchor(): HTMLElement | IAnchor {
		const res = dom.getDomNodePagePosition(this.element);

		return {
			x: res.left,
			y: res.top - 9, /* above the status bar */
			width: res.width,
			height: res.height
		} as IAnchor;
	}

	protected renderContents(container: HTMLElement): IDisposable {
		const $form = $('form.feedback-form').attr({
			action: 'javascript:void(0);'
		}).appendTo(container);

		$(container).addClass('monaco-menu-container');

		this.feedbackForm = <HTMLFormElement>$form.getHTMLElement();

		$('h2.title').text(nls.localize("label.sendASmile", "Tweet us your feedback.")).appendTo($form);

		const cancelBtn = $('div.cancel').attr('tabindex', '0');
		cancelBtn.on(dom.EventType.MOUSE_OVER, () => {
			const theme = this.themeService.getTheme();
			let darkenFactor: number;
			switch (theme.type) {
				case 'light':
					darkenFactor = 0.1;
					break;
				case 'dark':
					darkenFactor = 0.2;
					break;
			}

			if (darkenFactor) {
				cancelBtn.getHTMLElement().style.backgroundColor = darken(theme.getColor(editorWidgetBackground), darkenFactor)(theme).toString();
			}
		});
		cancelBtn.on(dom.EventType.MOUSE_OUT, () => {
			cancelBtn.getHTMLElement().style.backgroundColor = null;
		});
		this.invoke(cancelBtn, () => {
			this.hide();
		}).appendTo($form);

		const $content = $('div.content').appendTo($form);

		const $sentimentContainer = $('div').appendTo($content);
		if (!this._isPure) {
			$('span').text(nls.localize("patchedVersion1", "Your installation is corrupt.")).appendTo($sentimentContainer);
			$('br').appendTo($sentimentContainer);
			$('span').text(nls.localize("patchedVersion2", "Please specify this if you submit a bug.")).appendTo($sentimentContainer);
			$('br').appendTo($sentimentContainer);
		}
		$('span').text(nls.localize("sentiment", "How was your experience?")).appendTo($sentimentContainer);

		const $feedbackSentiment = $('div.feedback-sentiment').appendTo($sentimentContainer);

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

		const $contactUs = $('div.contactus').appendTo($content);

		$('span').text(nls.localize("other ways to contact us", "Other ways to contact us")).appendTo($contactUs);

		const $contactUsContainer = $('div.channels').appendTo($contactUs);

		$('div').append($('a').attr('target', '_blank').attr('href', '#').text(nls.localize("submit a bug", "Submit a bug")).attr('tabindex', '0'))
			.on('click', event => {
				dom.EventHelper.stop(event);
				const actionId = 'workbench.action.openIssueReporter';
				this.commandService.executeCommand(actionId).done(null, errors.onUnexpectedError);

				/* __GDPR__
					"workbenchActionExecuted" : {
						"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog('workbenchActionExecuted', { id: actionId, from: 'feedback' });
			})
			.appendTo($contactUsContainer);

		$('div').append($('a').attr('target', '_blank').attr('href', this.requestFeatureLink).text(nls.localize("request a missing feature", "Request a missing feature")).attr('tabindex', '0'))
			.appendTo($contactUsContainer);

		this.remainingCharacterCount = $('span.char-counter').text(this.getCharCountText(0));

		$('h3').text(nls.localize("tell us why?", "Tell us why?"))
			.append(this.remainingCharacterCount)
			.appendTo($form);

		this.feedbackDescriptionInput = <HTMLTextAreaElement>$('textarea.feedback-description').attr({
			rows: 3,
			maxlength: this.maxFeedbackCharacters,
			'aria-label': nls.localize("commentsHeader", "Comments")
		})
			.text(this.feedback).attr('required', 'required')
			.on('keyup', () => {
				this.updateCharCountText();
			})
			.appendTo($form).domFocus().getHTMLElement();

		const $buttons = $('div.form-buttons').appendTo($form);

		const $hideButtonContainer = $('div.hide-button-container').appendTo($buttons);

		this.hideButton = $('input.hide-button').type('checkbox').attr('checked', '').id('hide-button').appendTo($hideButtonContainer).getHTMLElement() as HTMLInputElement;

		$('label').attr('for', 'hide-button').text(nls.localize('showFeedback', "Show Feedback Smiley in Status Bar")).appendTo($hideButtonContainer);

		this.sendButton = new Button($buttons.getHTMLElement());
		this.sendButton.enabled = false;
		this.sendButton.label = nls.localize('tweet', "Tweet");
		this.$sendButton = new Builder(this.sendButton.element);
		this.$sendButton.addClass('send');
		this.toDispose.push(attachButtonStyler(this.sendButton, this.themeService));

		this.invoke(this.$sendButton, () => {
			if (this.isSendingFeedback) {
				return;
			}
			this.onSubmit();
		});

		this.toDispose.push(attachStylerCallback(this.themeService, { widgetShadow, editorWidgetBackground, inputBackground, inputForeground, inputBorder, editorBackground, contrastBorder }, colors => {
			$form.style('background-color', colors.editorWidgetBackground ? colors.editorWidgetBackground.toString() : null);
			$form.style('box-shadow', colors.widgetShadow ? `0 0 8px ${colors.widgetShadow}` : null);

			if (this.feedbackDescriptionInput) {
				this.feedbackDescriptionInput.style.backgroundColor = colors.inputBackground ? colors.inputBackground.toString() : null;
				this.feedbackDescriptionInput.style.color = colors.inputForeground ? colors.inputForeground.toString() : null;
				this.feedbackDescriptionInput.style.border = `1px solid ${colors.inputBorder || 'transparent'}`;
			}

			$contactUs.style('background-color', colors.editorBackground ? colors.editorBackground.toString() : null);
			$contactUs.style('border', `1px solid ${colors.contrastBorder || 'transparent'}`);
		}));

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
		const remaining = this.maxFeedbackCharacters - charCount;
		const text = (remaining === 1)
			? nls.localize("character left", "character left")
			: nls.localize("characters left", "characters left");

		return '(' + remaining + ' ' + text + ')';
	}

	private updateCharCountText(): void {
		this.remainingCharacterCount.text(this.getCharCountText(this.feedbackDescriptionInput.value.length));
		this.sendButton.enabled = this.feedbackDescriptionInput.value.length > 0;
	}

	private setSentiment(smile: boolean): void {
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
		this.maxFeedbackCharacters = this.feedbackService.getCharacterLimit(this.sentiment);
		this.updateCharCountText();
		$(this.feedbackDescriptionInput).attr({ maxlength: this.maxFeedbackCharacters });
	}

	private invoke(element: Builder, callback: () => void): Builder {
		element.on('click', callback);

		element.on('keypress', (e) => {
			if (e instanceof KeyboardEvent) {
				const keyboardEvent = <KeyboardEvent>e;
				if (keyboardEvent.keyCode === 13 || keyboardEvent.keyCode === 32) { // Enter or Spacebar
					callback();
				}
			}
		});

		return element;
	}

	public show(): void {
		super.show();

		if (this.options.onFeedbackVisibilityChange) {
			this.options.onFeedbackVisibilityChange(true);
		}
	}

	protected onHide(): void {
		if (this.options.onFeedbackVisibilityChange) {
			this.options.onFeedbackVisibilityChange(false);
		}
	}

	public hide(): void {
		if (this.feedbackDescriptionInput) {
			this.feedback = this.feedbackDescriptionInput.value;
		}

		if (this.autoHideTimeout) {
			clearTimeout(this.autoHideTimeout);
			this.autoHideTimeout = null;
		}

		if (this.hideButton && !this.hideButton.checked) {
			this.configurationService.updateValue(FEEDBACK_VISIBLE_CONFIG, false).done(null, errors.onUnexpectedError);
		}

		super.hide();
	}

	public onEvent(e: Event, activeElement: HTMLElement): void {
		if (e instanceof KeyboardEvent) {
			const keyboardEvent = <KeyboardEvent>e;
			if (keyboardEvent.keyCode === 27) { // Escape
				this.hide();
			}
		}
	}

	private onSubmit(): void {
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
				this.sendButton.label = nls.localize('feedbackSending', "Sending");
				this.$sendButton.addClass('in-progress');
				break;
			case FormEvent.SENT:
				this.isSendingFeedback = false;
				this.sendButton.label = nls.localize('feedbackSent', "Thanks");
				this.$sendButton.addClass('success');
				this.resetForm();
				this.autoHideTimeout = setTimeout(() => {
					this.hide();
				}, 1000);
				this.$sendButton.off(['click', 'keypress']);
				this.invoke(this.$sendButton, () => {
					this.hide();
					this.$sendButton.off(['click', 'keypress']);
					this.$sendButton.removeClass('in-progress');
				});
				break;
			case FormEvent.SEND_ERROR:
				this.isSendingFeedback = false;
				this.$sendButton.addClass('error');
				this.sendButton.label = nls.localize('feedbackSendingError', "Try again");
				break;
		}
	}

	private resetForm(): void {
		if (this.feedbackDescriptionInput) {
			this.feedbackDescriptionInput.value = '';
		}

		this.sentiment = 1;
		this.maxFeedbackCharacters = this.feedbackService.getCharacterLimit(this.sentiment);
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	// Sentiment Buttons
	const inputActiveOptionBorderColor = theme.getColor(inputActiveOptionBorder);
	if (inputActiveOptionBorderColor) {
		collector.addRule(`.monaco-shell .feedback-form .sentiment.checked { border: 1px solid ${inputActiveOptionBorderColor}; }`);
	}

	// Links
	const linkColor = theme.getColor(buttonBackground) || theme.getColor(contrastBorder);
	if (linkColor) {
		collector.addRule(`.monaco-shell .feedback-form .content .channels a { color: ${linkColor}; }`);
	}
});