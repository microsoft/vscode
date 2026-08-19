/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IInlineAgentSurveyPending, IInlineAgentSurveyResponseContext, IInlineAgentSurveyService, IInlineAgentSurveySubmission, InlineAgentSurveyRating, InlineAgentSurveyReason, InlineAgentSurveySurface, InlineAgentSurveyTrigger } from '../../../surveys/common/inlineAgentSurveyService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';

const INLINE_AGENT_SURVEY_SUBMIT_COMMAND_ID = 'github.copilot.chat.internal.inlineAgentSurvey.submit';

const REASONS: readonly { readonly reason: InlineAgentSurveyReason; readonly telemetryId: string; readonly label: string }[] = [
	{ reason: InlineAgentSurveyReason.TooHeavy, telemetryId: 'too_heavy', label: localize('inlineAgentSurvey.reason.tooHeavy', "No - too heavy") },
	{ reason: InlineAgentSurveyReason.TooLight, telemetryId: 'too_light', label: localize('inlineAgentSurvey.reason.tooLight', "No - too light") },
	{ reason: InlineAgentSurveyReason.DifferentModelFamily, telemetryId: 'different_model_family', label: localize('inlineAgentSurvey.reason.differentModelFamily', "No - different model family") },
];

export class ChatInlineAgentSurvey extends Disposable {

	readonly domNode: HTMLElement;

	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur: Event<void> = this._onDidBlur.event;
	private dismissed = false;
	private submitted = false;
	private rating: InlineAgentSurveyRating | undefined;
	private focused = false;
	private feedbackDisabled: boolean;
	private questionFirstButton: HTMLElement | undefined;
	private feedbackTextarea: HTMLTextAreaElement | undefined;
	private undoButton: HTMLElement | undefined;
	private confirmationElement: HTMLElement | undefined;
	/** Rating/reason chosen but not yet submitted, awaiting the optional free-text step. */
	private pendingSubmission: IInlineAgentSurveySubmission | undefined;

	constructor(
		parent: HTMLElement,
		private readonly context: IInlineAgentSurveyResponseContext,
		private readonly pending: IInlineAgentSurveyPending,
		private readonly isDebug = false,
		@IInlineAgentSurveyService private readonly surveyService: IInlineAgentSurveyService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this.dismissed = pending.dismissed;
		this.feedbackDisabled = !isDebug && !surveyService.isFeedbackEnabled;
		this.domNode = dom.append(parent, dom.$('.chat-inline-agent-survey'));
		this.domNode.setAttribute('role', 'group');
		this.domNode.setAttribute('aria-label', localize('inlineAgentSurvey.ariaLabel', "Agent quality survey"));
		const focusTracker = this._register(dom.trackFocus(this.domNode));
		this._register(focusTracker.onDidFocus(() => this.focused = true));
		this._register(focusTracker.onDidBlur(() => {
			this.focused = false;
			this._onDidBlur.fire();
		}));
		if (!this.isDebug) {
			this._register(this.surveyService.onDidChangeFeedbackEnabled(enabled => {
				if (!enabled) {
					this.feedbackDisabled = true;
					this.render();
				}
			}));
		}
		if (!this.isDebug) {
			this.surveyService.recordImpression(context);
		}
		this.render();
	}

	hasFocus(): boolean {
		return this.focused;
	}

	private render(focusTarget?: 'question' | 'feedback' | 'undo' | 'confirmation'): void {
		this.renderDisposables.clear();
		dom.clearNode(this.domNode);
		this.questionFirstButton = undefined;
		this.feedbackTextarea = undefined;
		this.undoButton = undefined;
		this.confirmationElement = undefined;

		if (this.feedbackDisabled) {
			this.renderDisabled();
		} else if (this.submitted) {
			this.renderConfirmation();
		} else if (this.dismissed) {
			this.renderDismissed();
		} else if (this.pendingSubmission) {
			this.renderFeedback();
		} else {
			this.renderQuestion();
		}
		this.focusAfterRender(focusTarget);
	}

	private focusAfterRender(focusTarget: 'question' | 'feedback' | 'undo' | 'confirmation' | undefined): void {
		if (!focusTarget) {
			return;
		}
		switch (focusTarget) {
			case 'question':
				this.questionFirstButton?.focus();
				break;
			case 'feedback':
				this.feedbackTextarea?.focus();
				status(localize('inlineAgentSurvey.feedbackAnnounce', "Optional feedback. Submit when ready."));
				break;
			case 'undo':
				this.undoButton?.focus();
				status(localize('inlineAgentSurvey.dismissedAnnounce', "Feedback skipped. Undo is available."));
				break;
			case 'confirmation': {
				this.confirmationElement?.focus();
				status(this.confirmationMessage());
				break;
			}
		}
	}

	private renderDisabled(): void {
		const body = dom.append(this.domNode, dom.$('.chat-inline-agent-survey-body'));
		const disabled = dom.append(body, dom.$('.chat-inline-agent-survey-dismissed'));
		disabled.textContent = localize('inlineAgentSurvey.disabled', "Feedback is disabled.");
	}

	private renderQuestion(): void {
		this.renderHeader();

		const body = dom.append(this.domNode, dom.$('.chat-inline-agent-survey-body'));
		const ratings = dom.append(body, dom.$('.chat-inline-agent-survey-rating'));
		ratings.setAttribute('role', 'group');
		ratings.setAttribute('aria-label', localize('inlineAgentSurvey.ratingLabel', "Rate Auto's model choice"));

		this.addOptionButton(ratings, localize('inlineAgentSurvey.yes', "Yes"), () => ({ rating: InlineAgentSurveyRating.Yes }));
		for (const entry of REASONS) {
			this.addOptionButton(ratings, entry.label, () => ({ rating: InlineAgentSurveyRating.No, reason: entry.reason }));
		}
	}

	private renderHeader(): void {
		const header = dom.append(this.domNode, dom.$('.chat-inline-agent-survey-header'));
		dom.append(header, dom.$('span.chat-inline-agent-survey-question', undefined, localize('inlineAgentSurvey.question', "Did Auto choose the right model for the job?")));

		const dismiss = dom.append(header, dom.$<HTMLButtonElement>('button.chat-inline-agent-survey-dismiss'));
		dismiss.type = 'button';
		dismiss.setAttribute('aria-label', localize('inlineAgentSurvey.dismissAriaLabel', "Dismiss survey"));
		dismiss.title = localize('inlineAgentSurvey.dismissTitle', "Not now");
		dom.append(dismiss, dom.$('span'));
		dismiss.lastElementChild?.classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
		dismiss.lastElementChild?.setAttribute('aria-hidden', 'true');
		this.renderDisposables.add(dom.addDisposableListener(dismiss, dom.EventType.CLICK, () => {
			this.dismissed = true;
			if (!this.isDebug) {
				this.surveyService.recordDismiss(this.context);
			}
			this.render('undo');
		}));
	}

	private addOptionButton(container: HTMLElement, label: string, toSubmission: () => IInlineAgentSurveySubmission): void {
		const button = this.renderDisposables.add(new Button(container, { secondary: true, ariaLabel: label }));
		button.label = label;
		this.questionFirstButton ??= button.element;
		this.renderDisposables.add(button.onDidClick(() => {
			if (this.feedbackDisabled) {
				return;
			}
			const submission = toSubmission();
			this.rating = submission.rating;
			if (!this.isDebug) {
				this.surveyService.recordRating(this.context, submission.rating);
			}
			this.pendingSubmission = submission;
			this.render('feedback');
		}));
	}

	private renderFeedback(): void {
		this.renderHeader();

		const body = dom.append(this.domNode, dom.$('.chat-inline-agent-survey-body'));
		dom.append(body, dom.$('span.chat-inline-agent-survey-feedback-label', undefined, localize('inlineAgentSurvey.feedbackLabel', "Anything else you'd like to share? (optional)")));

		const textarea = dom.append(body, dom.$<HTMLTextAreaElement>('textarea.chat-inline-agent-survey-feedback-textarea'));
		textarea.rows = 2;
		textarea.placeholder = localize('inlineAgentSurvey.feedbackPlaceholder', "Optional feedback");
		textarea.setAttribute('aria-label', localize('inlineAgentSurvey.feedbackLabel', "Anything else you'd like to share? (optional)"));
		this.feedbackTextarea = textarea;

		const actions = dom.append(body, dom.$('.chat-inline-agent-survey-feedback-actions'));
		const submitButton = this.renderDisposables.add(new Button(actions, { secondary: true, ariaLabel: localize('inlineAgentSurvey.submit', "Submit") }));
		submitButton.label = localize('inlineAgentSurvey.submit', "Submit");
		this.renderDisposables.add(submitButton.onDidClick(() => {
			const submission = this.pendingSubmission;
			if (!submission) {
				return;
			}
			this.submit(submission);
		}));
	}

	private renderDismissed(): void {
		const body = dom.append(this.domNode, dom.$('.chat-inline-agent-survey-body'));
		const dismissed = dom.append(body, dom.$('.chat-inline-agent-survey-dismissed'));
		dom.append(dismissed, dom.$('span', undefined, localize('inlineAgentSurvey.dismissed', "Feedback skipped.")));
		const undo = dom.append(dismissed, dom.$<HTMLButtonElement>('button.chat-inline-agent-survey-undo', undefined, localize('inlineAgentSurvey.undo', "Undo")));
		undo.type = 'button';
		this.undoButton = undo;
		this.renderDisposables.add(dom.addDisposableListener(undo, dom.EventType.CLICK, () => {
			this.dismissed = false;
			if (!this.isDebug) {
				this.surveyService.recordUndo(this.context);
			}
			this.render(this.pendingSubmission ? 'feedback' : 'question');
		}));
	}

	private renderConfirmation(): void {
		const body = dom.append(this.domNode, dom.$('.chat-inline-agent-survey-body'));
		const confirmation = dom.append(body, dom.$('.chat-inline-agent-survey-confirmation'));
		confirmation.tabIndex = -1;
		this.confirmationElement = confirmation;
		const icon = dom.append(confirmation, dom.$('span'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
		icon.setAttribute('aria-hidden', 'true');
		dom.append(confirmation, dom.$('span', undefined, this.confirmationMessage()));
	}

	private confirmationMessage(): string {
		return localize('inlineAgentSurvey.confirmation.yes', "Thanks for your feedback.");
	}

	private submit(submission: IInlineAgentSurveySubmission): void {
		if (this.feedbackDisabled || (!this.isDebug && !this.surveyService.isFeedbackEnabled)) {
			this.feedbackDisabled = true;
			this.render();
			return;
		}
		if (!this.isDebug) {
			this.surveyService.recordSubmission(this.context, submission);
		}
		this.pendingSubmission = undefined;
		this.submitted = true;
		this.render('confirmation');

		// The optional free-text comment is intentionally never included in this payload: the
		// event is documented and validated as structured-only, with no transcript, code, or
		// free-text content.
		const reason = submission.reason === undefined ? undefined : REASONS.find(entry => entry.reason === submission.reason)?.telemetryId;
		if (this.isDebug) {
			return;
		}
		void this.commandService.executeCommand(INLINE_AGENT_SURVEY_SUBMIT_COMMAND_ID, {
			rating: submission.rating,
			reason,
			trigger: this.toTelemetryTrigger(this.pending.trigger),
			surface: this.toTelemetrySurface(this.pending.surface),
			turnCount: this.context.completedUserTurns,
			conversationId: this.context.chatResource.toString(),
			requestId: this.context.requestId,
			model: this.context.modelId,
		}).catch(onUnexpectedError);
	}

	private toTelemetryTrigger(trigger: InlineAgentSurveyTrigger): string {
		return trigger === InlineAgentSurveyTrigger.FirstResponse ? 'first_response' : 'mature_response';
	}

	private toTelemetrySurface(surface: InlineAgentSurveySurface): string {
		return surface === InlineAgentSurveySurface.AgentsWindow ? 'agents_window' : 'editor_chat';
	}

	override dispose(): void {
		this.domNode.remove();
		super.dispose();
	}
}
