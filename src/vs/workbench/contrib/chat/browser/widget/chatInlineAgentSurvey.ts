/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
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
const OPEN_ISSUE_REPORTER_COMMAND_ID = 'workbench.action.openIssueReporter';

const REASONS: readonly { readonly reason: InlineAgentSurveyReason; readonly telemetryId: string; readonly label: string }[] = [
	{ reason: InlineAgentSurveyReason.WrongResult, telemetryId: 'wrong_result', label: localize('inlineAgentSurvey.reason.wrongResult', "Wrong result") },
	{ reason: InlineAgentSurveyReason.TooSlow, telemetryId: 'too_slow', label: localize('inlineAgentSurvey.reason.tooSlow', "Too slow") },
	{ reason: InlineAgentSurveyReason.Misunderstood, telemetryId: 'misunderstood', label: localize('inlineAgentSurvey.reason.misunderstood', "Misunderstood") },
	{ reason: InlineAgentSurveyReason.LostContext, telemetryId: 'lost_context', label: localize('inlineAgentSurvey.reason.lostContext', "Lost context") },
	{ reason: InlineAgentSurveyReason.Incomplete, telemetryId: 'incomplete', label: localize('inlineAgentSurvey.reason.incomplete', "Incomplete") },
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
			this.surveyService.recordImpression(context);
		}
		this.render();
	}

	hasFocus(): boolean {
		return this.focused;
	}

	private render(): void {
		this.renderDisposables.clear();
		dom.clearNode(this.domNode);

		if (this.submitted) {
			this.renderConfirmation();
		} else if (this.dismissed) {
			this.renderDismissed();
		} else {
			this.renderQuestion();
		}
	}

	private renderQuestion(): void {
		const primary = dom.append(this.domNode, dom.$('.chat-inline-agent-survey-primary'));
		dom.append(primary, dom.$('span.chat-inline-agent-survey-question', undefined, localize('inlineAgentSurvey.question', "Did this do what you wanted?")));

		const ratings = dom.append(primary, dom.$('.chat-inline-agent-survey-rating'));
		ratings.setAttribute('role', 'group');
		ratings.setAttribute('aria-label', localize('inlineAgentSurvey.ratingLabel', "Rate this agent response"));
		this.addRatingButton(ratings, InlineAgentSurveyRating.Yes, localize('inlineAgentSurvey.yes', "Yes"));
		this.addRatingButton(ratings, InlineAgentSurveyRating.Partly, localize('inlineAgentSurvey.partly', "Partly"));
		this.addRatingButton(ratings, InlineAgentSurveyRating.No, localize('inlineAgentSurvey.no', "No"));

		const dismiss = dom.append(primary, dom.$<HTMLButtonElement>('button.chat-inline-agent-survey-dismiss'));
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
			this.render();
		}));

		if (this.rating === InlineAgentSurveyRating.Partly || this.rating === InlineAgentSurveyRating.No) {
			this.renderReasons();
		}
	}

	private addRatingButton(container: HTMLElement, rating: InlineAgentSurveyRating, label: string): void {
		const button = this.renderDisposables.add(new Button(container, { secondary: true, ariaLabel: label }));
		button.label = label;
		button.checked = this.rating === rating;
		this.renderDisposables.add(button.onDidClick(() => {
			this.rating = rating;
			if (!this.isDebug) {
				this.surveyService.recordRating(this.context, rating);
			}
			if (rating === InlineAgentSurveyRating.Yes) {
				this.submit({ rating });
				return;
			}
			this.render();
		}));
	}

	private renderReasons(): void {
		const reasons = dom.append(this.domNode, dom.$('.chat-inline-agent-survey-reasons'));
		dom.append(reasons, dom.$('span.chat-inline-agent-survey-reason-label', undefined, localize('inlineAgentSurvey.reasonsLabel', "What went wrong?")));
		const options = dom.append(reasons, dom.$('.chat-inline-agent-survey-reason-options'));
		options.setAttribute('role', 'group');
		options.setAttribute('aria-label', localize('inlineAgentSurvey.reasonsAriaLabel', "Choose a reason"));
		for (const entry of REASONS) {
			const button = this.renderDisposables.add(new Button(options, { secondary: true, ariaLabel: entry.label }));
			button.label = entry.label;
			this.renderDisposables.add(button.onDidClick(() => {
				if (this.rating === InlineAgentSurveyRating.Partly || this.rating === InlineAgentSurveyRating.No) {
					this.submit({ rating: this.rating, reason: entry.reason });
				}
			}));
		}
	}

	private renderDismissed(): void {
		const dismissed = dom.append(this.domNode, dom.$('.chat-inline-agent-survey-dismissed'));
		dom.append(dismissed, dom.$('span', undefined, localize('inlineAgentSurvey.dismissed', "Feedback skipped.")));
		const undo = dom.append(dismissed, dom.$<HTMLButtonElement>('button.chat-inline-agent-survey-undo', undefined, localize('inlineAgentSurvey.undo', "Undo")));
		undo.type = 'button';
		this.renderDisposables.add(dom.addDisposableListener(undo, dom.EventType.CLICK, () => {
			this.dismissed = false;
			if (!this.isDebug) {
				this.surveyService.recordUndo(this.context);
			}
			this.render();
		}));
	}

	private renderConfirmation(): void {
		const confirmation = dom.append(this.domNode, dom.$('.chat-inline-agent-survey-confirmation'));
		const icon = dom.append(confirmation, dom.$('span'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
		icon.setAttribute('aria-hidden', 'true');
		if (this.rating === InlineAgentSurveyRating.No) {
			dom.append(confirmation, dom.$('span', undefined, localize('inlineAgentSurvey.confirmation.no', "Sorry this missed the mark.")));
			this.addIssueReporterAction(confirmation, localize('inlineAgentSurvey.reportIssue', "Report an issue"), localize('inlineAgentSurvey.reportIssue.title', "Copilot agent response did not meet expectations"));
		} else if (this.rating === InlineAgentSurveyRating.Partly) {
			dom.append(confirmation, dom.$('span', undefined, localize('inlineAgentSurvey.confirmation.partly', "Thanks. Tell us what would make this better.")));
			this.addIssueReporterAction(confirmation, localize('inlineAgentSurvey.requestFeature', "Request a feature"), localize('inlineAgentSurvey.requestFeature.title', "Feature request for Copilot agent"));
		} else {
			dom.append(confirmation, dom.$('span', undefined, localize('inlineAgentSurvey.confirmation.yes', "Thanks for your feedback.")));
		}
	}

	private addIssueReporterAction(parent: HTMLElement, label: string, issueTitle: string): void {
		const action = dom.append(parent, dom.$<HTMLButtonElement>('button.chat-inline-agent-survey-link', undefined, label));
		action.type = 'button';
		this.renderDisposables.add(dom.addDisposableListener(action, dom.EventType.CLICK, () => {
			void this.commandService.executeCommand(OPEN_ISSUE_REPORTER_COMMAND_ID, { issueTitle }).catch(onUnexpectedError);
		}));
	}

	private submit(submission: IInlineAgentSurveySubmission): void {
		if (!this.isDebug) {
			this.surveyService.recordSubmission(this.context, submission);
		}
		this.submitted = true;
		this.render();

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
