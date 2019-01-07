/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/feedback';
import * as nls from 'vs/nls';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { Dropdown } from 'vs/base/browser/ui/dropdown/dropdown';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import product from 'vs/platform/node/product';
import * as dom from 'vs/base/browser/dom';
import { ICommandService } from 'vs/platform/commands/common/commands';
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

export interface IFeedbackDelegate {
	submitFeedback(feedback: IFeedback): void;
	getCharacterLimit(sentiment: number): number;
}

export interface IFeedbackDropdownOptions {
	contextViewProvider: IContextViewService;
	feedbackService: IFeedbackDelegate;
	onFeedbackVisibilityChange?: (visible: boolean) => void;
}

export class FeedbackDropdown extends Dropdown {
	private maxFeedbackCharacters: number;

	private feedback: string = '';
	private sentiment: number = 1;
	private autoHideTimeout?: number;

	private readonly feedbackDelegate: IFeedbackDelegate;

	private feedbackForm: HTMLFormElement | null;
	private feedbackDescriptionInput: HTMLTextAreaElement | null;
	private smileyInput: HTMLElement | null;
	private frownyInput: HTMLElement | null;
	private sendButton: Button;
	private hideButton: HTMLInputElement;
	private remainingCharacterCount: HTMLElement;

	private requestFeatureLink: string;

	private isPure: boolean = true;

	constructor(
		container: HTMLElement,
		private options: IFeedbackDropdownOptions,
		@ICommandService private readonly commandService: ICommandService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IIntegrityService private readonly integrityService: IIntegrityService,
		@IThemeService private readonly themeService: IThemeService,
		@IWorkspaceConfigurationService private readonly configurationService: IWorkspaceConfigurationService
	) {
		super(container, {
			contextViewProvider: options.contextViewProvider,
			labelRenderer: (container: HTMLElement): IDisposable => {
				dom.addClasses(container, 'send-feedback', 'mask-icon');

				return Disposable.None;
			}
		});

		this.feedbackDelegate = options.feedbackService;
		this.maxFeedbackCharacters = this.feedbackDelegate.getCharacterLimit(this.sentiment);
		this.requestFeatureLink = product.sendASmile.requestFeatureUrl;

		this.integrityService.isPure().then(result => {
			if (!result.isPure) {
				this.isPure = false;
			}
		});

		dom.addClass(this.element, 'send-feedback');
		this.element.title = nls.localize('sendFeedback', "Tweet Feedback");
	}

	protected getAnchor(): HTMLElement | IAnchor {
		const position = dom.getDomNodePagePosition(this.element);

		return {
			x: position.left + position.width, // center above the container
			y: position.top - 9, // above status bar
			width: position.width,
			height: position.height
		} as IAnchor;
	}

	protected renderContents(container: HTMLElement): IDisposable {
		const disposables: IDisposable[] = [];

		dom.addClass(container, 'monaco-menu-container');

		// Form
		this.feedbackForm = dom.append<HTMLFormElement>(container, dom.$('form.feedback-form'));
		this.feedbackForm.setAttribute('action', 'javascript:void(0);');

		// Title
		dom.append(this.feedbackForm, dom.$('h2.title')).textContent = nls.localize("label.sendASmile", "Tweet us your feedback.");

		// Close Button (top right)
		const closeBtn = dom.append(this.feedbackForm, dom.$('div.cancel'));
		closeBtn.tabIndex = 0;
		closeBtn.setAttribute('role', 'button');
		closeBtn.title = nls.localize('close', "Close");

		disposables.push(dom.addDisposableListener(closeBtn, dom.EventType.MOUSE_OVER, () => {
			const theme = this.themeService.getTheme();
			let darkenFactor: number | undefined;
			switch (theme.type) {
				case 'light':
					darkenFactor = 0.1;
					break;
				case 'dark':
					darkenFactor = 0.2;
					break;
			}

			if (darkenFactor) {
				const backgroundBaseColor = theme.getColor(editorWidgetBackground);
				if (backgroundBaseColor) {
					const backgroundColor = darken(backgroundBaseColor, darkenFactor)(theme);
					if (backgroundColor) {
						closeBtn.style.backgroundColor = backgroundColor.toString();
					}
				}
			}
		}));

		disposables.push(dom.addDisposableListener(closeBtn, dom.EventType.MOUSE_OUT, () => {
			closeBtn.style.backgroundColor = null;
		}));

		this.invoke(closeBtn, disposables, () => this.hide());

		// Content
		const content = dom.append(this.feedbackForm, dom.$('div.content'));

		// Sentiment Buttons
		const sentimentContainer = dom.append(content, dom.$('div'));

		if (!this.isPure) {
			dom.append(sentimentContainer, dom.$('span')).textContent = nls.localize("patchedVersion1", "Your installation is corrupt.");
			sentimentContainer.appendChild(document.createElement('br'));
			dom.append(sentimentContainer, dom.$('span')).textContent = nls.localize("patchedVersion2", "Please specify this if you submit a bug.");
			sentimentContainer.appendChild(document.createElement('br'));
		}

		dom.append(sentimentContainer, dom.$('span')).textContent = nls.localize("sentiment", "How was your experience?");

		const feedbackSentiment = dom.append(sentimentContainer, dom.$('div.feedback-sentiment'));

		// Sentiment: Smiley
		this.smileyInput = dom.append(feedbackSentiment, dom.$('div.sentiment'));
		dom.addClass(this.smileyInput, 'smile');
		this.smileyInput.setAttribute('aria-checked', 'false');
		this.smileyInput.setAttribute('aria-label', nls.localize('smileCaption', "Happy Feedback Sentiment"));
		this.smileyInput.setAttribute('role', 'checkbox');
		this.smileyInput.title = nls.localize('smileCaption', "Happy Feedback Sentiment");
		this.smileyInput.tabIndex = 0;

		this.invoke(this.smileyInput, disposables, () => this.setSentiment(true));

		// Sentiment: Frowny
		this.frownyInput = dom.append(feedbackSentiment, dom.$('div.sentiment'));
		dom.addClass(this.frownyInput, 'frown');
		this.frownyInput.setAttribute('aria-checked', 'false');
		this.frownyInput.setAttribute('aria-label', nls.localize('frownCaption', "Sad Feedback Sentiment"));
		this.frownyInput.setAttribute('role', 'checkbox');
		this.frownyInput.title = nls.localize('frownCaption', "Sad Feedback Sentiment");
		this.frownyInput.tabIndex = 0;

		this.invoke(this.frownyInput, disposables, () => this.setSentiment(false));

		if (this.sentiment === 1) {
			dom.addClass(this.smileyInput, 'checked');
			this.smileyInput.setAttribute('aria-checked', 'true');
		} else {
			dom.addClass(this.frownyInput, 'checked');
			this.frownyInput.setAttribute('aria-checked', 'true');
		}

		// Contact Us Box
		const contactUsContainer = dom.append(content, dom.$('div.contactus'));

		dom.append(contactUsContainer, dom.$('span')).textContent = nls.localize("other ways to contact us", "Other ways to contact us");

		const channelsContainer = dom.append(contactUsContainer, dom.$('div.channels'));

		// Contact: Submit a Bug
		const submitBugLinkContainer = dom.append(channelsContainer, dom.$('div'));

		const submitBugLink = dom.append(submitBugLinkContainer, dom.$('a'));
		submitBugLink.setAttribute('target', '_blank');
		submitBugLink.setAttribute('href', '#');
		submitBugLink.textContent = nls.localize("submit a bug", "Submit a bug");
		submitBugLink.tabIndex = 0;

		disposables.push(dom.addDisposableListener(submitBugLink, 'click', e => {
			dom.EventHelper.stop(e);
			const actionId = 'workbench.action.openIssueReporter';
			this.commandService.executeCommand(actionId);
			this.hide();

			/* __GDPR__
				"workbenchActionExecuted" : {
					"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog('workbenchActionExecuted', { id: actionId, from: 'feedback' });
		}));

		// Contact: Request a Feature
		if (!!this.requestFeatureLink) {
			const requestFeatureLinkContainer = dom.append(channelsContainer, dom.$('div'));

			const requestFeatureLink = dom.append(requestFeatureLinkContainer, dom.$('a'));
			requestFeatureLink.setAttribute('target', '_blank');
			requestFeatureLink.setAttribute('href', this.requestFeatureLink);
			requestFeatureLink.textContent = nls.localize("request a missing feature", "Request a missing feature");
			requestFeatureLink.tabIndex = 0;

			disposables.push(dom.addDisposableListener(requestFeatureLink, 'click', e => this.hide()));
		}

		// Remaining Characters
		const remainingCharacterCountContainer = dom.append(this.feedbackForm, dom.$('h3'));
		remainingCharacterCountContainer.textContent = nls.localize("tell us why", "Tell us why?");

		this.remainingCharacterCount = dom.append(remainingCharacterCountContainer, dom.$('span.char-counter'));
		this.remainingCharacterCount.textContent = this.getCharCountText(0);

		// Feedback Input Form
		this.feedbackDescriptionInput = dom.append<HTMLTextAreaElement>(this.feedbackForm, dom.$('textarea.feedback-description'));
		this.feedbackDescriptionInput.rows = 3;
		this.feedbackDescriptionInput.maxLength = this.maxFeedbackCharacters;
		this.feedbackDescriptionInput.textContent = this.feedback;
		this.feedbackDescriptionInput.required = true;
		this.feedbackDescriptionInput.setAttribute('aria-label', nls.localize("feedbackTextInput", "Tell us your feedback"));
		this.feedbackDescriptionInput.focus();

		disposables.push(dom.addDisposableListener(this.feedbackDescriptionInput, 'keyup', () => this.updateCharCountText()));

		// Feedback Input Form Buttons Container
		const buttonsContainer = dom.append(this.feedbackForm, dom.$('div.form-buttons'));

		// Checkbox: Hide Feedback Smiley
		const hideButtonContainer = dom.append(buttonsContainer, dom.$('div.hide-button-container'));

		this.hideButton = dom.append(hideButtonContainer, dom.$('input.hide-button'));
		this.hideButton.type = 'checkbox';
		this.hideButton.checked = true;
		this.hideButton.id = 'hide-button';

		const hideButtonLabel = dom.append(hideButtonContainer, dom.$('label'));
		hideButtonLabel.setAttribute('for', 'hide-button');
		hideButtonLabel.textContent = nls.localize('showFeedback', "Show Feedback Smiley in Status Bar");

		// Button: Send Feedback
		this.sendButton = new Button(buttonsContainer);
		this.sendButton.enabled = false;
		this.sendButton.label = nls.localize('tweet', "Tweet");
		dom.addClass(this.sendButton.element, 'send');
		this.sendButton.element.title = nls.localize('tweetFeedback', "Tweet Feedback");
		disposables.push(attachButtonStyler(this.sendButton, this.themeService));

		this.sendButton.onDidClick(() => this.onSubmit());

		disposables.push(attachStylerCallback(this.themeService, { widgetShadow, editorWidgetBackground, inputBackground, inputForeground, inputBorder, editorBackground, contrastBorder }, colors => {
			if (this.feedbackForm) {
				this.feedbackForm.style.backgroundColor = colors.editorWidgetBackground ? colors.editorWidgetBackground.toString() : null;
				this.feedbackForm.style.boxShadow = colors.widgetShadow ? `0 0 8px ${colors.widgetShadow}` : null;
			}
			if (this.feedbackDescriptionInput) {
				this.feedbackDescriptionInput.style.backgroundColor = colors.inputBackground ? colors.inputBackground.toString() : null;
				this.feedbackDescriptionInput.style.color = colors.inputForeground ? colors.inputForeground.toString() : null;
				this.feedbackDescriptionInput.style.border = `1px solid ${colors.inputBorder || 'transparent'}`;
			}

			contactUsContainer.style.backgroundColor = colors.editorBackground ? colors.editorBackground.toString() : null;
			contactUsContainer.style.border = `1px solid ${colors.contrastBorder || 'transparent'}`;
		}));

		return {
			dispose: () => {
				this.feedbackForm = null;
				this.feedbackDescriptionInput = null;
				this.smileyInput = null;
				this.frownyInput = null;

				dispose(disposables);
			}
		};
	}

	private getCharCountText(charCount: number): string {
		const remaining = this.maxFeedbackCharacters - charCount;
		const text = (remaining === 1)
			? nls.localize("character left", "character left")
			: nls.localize("characters left", "characters left");

		return `(${remaining} ${text})`;
	}

	private updateCharCountText(): void {
		if (this.feedbackDescriptionInput) {
			this.remainingCharacterCount.innerText = this.getCharCountText(this.feedbackDescriptionInput.value.length);
			this.sendButton.enabled = this.feedbackDescriptionInput.value.length > 0;
		}
	}

	private setSentiment(smile: boolean): void {
		if (smile) {
			if (this.smileyInput) {
				dom.addClass(this.smileyInput, 'checked');
				this.smileyInput.setAttribute('aria-checked', 'true');
			}
			if (this.frownyInput) {
				dom.removeClass(this.frownyInput, 'checked');
				this.frownyInput.setAttribute('aria-checked', 'false');
			}
		} else {
			if (this.frownyInput) {
				dom.addClass(this.frownyInput, 'checked');
				this.frownyInput.setAttribute('aria-checked', 'true');
			}
			if (this.smileyInput) {
				dom.removeClass(this.smileyInput, 'checked');
				this.smileyInput.setAttribute('aria-checked', 'false');
			}
		}

		this.sentiment = smile ? 1 : 0;
		this.maxFeedbackCharacters = this.feedbackDelegate.getCharacterLimit(this.sentiment);
		this.updateCharCountText();
		if (this.feedbackDescriptionInput) {
			this.feedbackDescriptionInput.maxLength = this.maxFeedbackCharacters;
		}
	}

	private invoke(element: HTMLElement, disposables: IDisposable[], callback: () => void): HTMLElement {
		disposables.push(dom.addDisposableListener(element, 'click', callback));

		disposables.push(dom.addDisposableListener(element, 'keypress', e => {
			if (e instanceof KeyboardEvent) {
				const keyboardEvent = <KeyboardEvent>e;
				if (keyboardEvent.keyCode === 13 || keyboardEvent.keyCode === 32) { // Enter or Spacebar
					callback();
				}
			}
		}));

		return element;
	}

	show(): void {
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

	hide(): void {
		if (this.feedbackDescriptionInput) {
			this.feedback = this.feedbackDescriptionInput.value;
		}

		if (this.autoHideTimeout) {
			clearTimeout(this.autoHideTimeout);
			this.autoHideTimeout = undefined;
		}

		if (this.hideButton && !this.hideButton.checked) {
			this.configurationService.updateValue(FEEDBACK_VISIBLE_CONFIG, false);
		}

		super.hide();
	}

	onEvent(e: Event, activeElement: HTMLElement): void {
		if (e instanceof KeyboardEvent) {
			const keyboardEvent = <KeyboardEvent>e;
			if (keyboardEvent.keyCode === 27) { // Escape
				this.hide();
			}
		}
	}

	private onSubmit(): void {
		if (!this.feedbackForm || !this.feedbackDescriptionInput || (this.feedbackForm.checkValidity && !this.feedbackForm.checkValidity())) {
			return;
		}

		this.feedbackDelegate.submitFeedback({
			feedback: this.feedbackDescriptionInput.value,
			sentiment: this.sentiment
		});

		this.hide();
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