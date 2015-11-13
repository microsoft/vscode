/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import pal = require('vs/base/common/platform');
import {Promise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import {$} from 'vs/base/browser/builder';
import {IStatusbarItem} from 'vs/workbench/browser/parts/statusbar/statusbar';
import {FeedbackDropdown, IFeedback, IFeedbackService, IFeedbackDropdownOptions} from 'vs/workbench/parts/feedback/browser/feedback';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IRequestService} from 'vs/platform/request/common/request';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';

import os = require('os');

class NativeFeedbackService implements IFeedbackService {

	private serviceUrl: string;
	private appName: string;
	private appVersion: string;

	constructor(
		@IRequestService private requestService: IRequestService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		const env = contextService.getConfiguration().env;
		if (env.sendASmile) {
			this.serviceUrl = env.sendASmile.submitUrl;
		}

		this.appName = env.appName;
		this.appVersion = env.version;
	}

	public submitFeedback(feedback: IFeedback): Promise {
		let data = JSON.stringify({
			version: 1,
			user: feedback.alias,
			userType: 'External',
			text: feedback.feedback,
			source: 'Send a smile',
			sentiment: feedback.sentiment,
			tags: [
				{ type: 'product', value: this.appName },
				{ type: 'product-version', value: this.appVersion }
			]
		});

		return this.requestService.makeRequest({
			type: 'POST',
			url: this.serviceUrl,
			data: data,
			headers: {
				'Content-Type': 'application/json; charset=utf8',
				'Content-Length': data.length
			}
		});
	}
}

class NativeFeedbackDropdown extends FeedbackDropdown {
	private static MAX_FEEDBACK_CHARS: number = 140;

	private appVersion: string;
	private requestFeatureLink: string;
	private reportIssueLink: string;

	constructor(
		container: HTMLElement,
		options: IFeedbackDropdownOptions,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(container, options, telemetryService);

		const env = contextService.getConfiguration().env;
		this.appVersion = env.version;
		this.requestFeatureLink = env.sendASmile.requestFeatureUrl;
		this.reportIssueLink = env.sendASmile.reportIssueUrl;
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

		$('div').append($('a').attr('target', '_blank').attr('href', this.getReportIssueLink()).text(nls.localize("submit a bug", "Submit a bug")))
			.appendTo($contactUsContainer);

		$('div').append($('a').attr('target', '_blank').attr('href', this.requestFeatureLink).text(nls.localize("request a missing feature", "Request a missing feature")))
			.appendTo($contactUsContainer);

		let $charCounter = $('span.char-counter').text('(' + NativeFeedbackDropdown.MAX_FEEDBACK_CHARS + ' ' + nls.localize("characters left", "characters left") + ')');

		$('h3').text(nls.localize("tell us why?", "Tell us why?"))
			.append($charCounter)
			.appendTo($form);

		this.feedbackDescriptionInput = <HTMLTextAreaElement>$('textarea.feedback-description').attr({
			rows: 3,
			maxlength: NativeFeedbackDropdown.MAX_FEEDBACK_CHARS,
			'aria-label': nls.localize("commentsHeader", "Comments")
		})
			.text(this.feedback).attr('required', 'required')
			.on('keyup', () => {
				$charCounter.text('(' + (NativeFeedbackDropdown.MAX_FEEDBACK_CHARS - this.feedbackDescriptionInput.value.length) + ' ' + nls.localize("characters left", "characters left") + ')');
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

	private getReportIssueLink(): string {
		let reportIssueLink = this.reportIssueLink;
		let result = reportIssueLink + '&' + this.getReportIssuesQueryString() + '#vscode';
		return result;
	}

	private getReportIssuesQueryString(): string {

		let queryString: { [key: string]: any; } = Object.create(null);
		queryString['version'] = this.appVersion;
		let platform: number;
		switch (pal.platform) {
			case pal.Platform.Windows:
				platform = 3;
				break;
			case pal.Platform.Mac:
				platform = 2;
				break;
			case pal.Platform.Linux:
				platform = 1;
				break;
			default:
				platform = 0;
		}

		queryString['platform'] = platform;
		queryString['osversion'] = os.release();
		queryString['sessionid'] = this.telemetryService.getSessionId();

		let queryStringArray: string[] = [];
		for (let p in queryString) {
			queryStringArray.push(encodeURIComponent(p) + '=' + encodeURIComponent(queryString[p]));
		}

		let result = queryStringArray.join('&');
		return result;
	}
}

export class FeedbackStatusbarItem implements IStatusbarItem {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextViewService private contextViewService: IContextViewService
	) {
	}

	public render(element: HTMLElement): IDisposable {
		return this.instantiationService.createInstance(NativeFeedbackDropdown, element, {
			contextViewProvider: this.contextViewService,
			feedbackService: this.instantiationService.createInstance(NativeFeedbackService)
		});
	}
}