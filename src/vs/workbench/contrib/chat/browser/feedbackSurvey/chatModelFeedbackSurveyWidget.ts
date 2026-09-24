/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatModelFeedbackSurveyStepKind, IChatModelFeedbackSurveyTextStep } from '../../common/feedbackSurvey/chatModelFeedbackSurveyConfig.js';
import { IChatResponseViewModel } from '../../common/model/chatViewModel.js';
import { CHAT_CARD_HEADER_CLASS, CHAT_CARD_LARGE_CLASS, CHAT_CARD_TITLE_CLASS, createChatCardIconButton } from '../widget/chatCard.js';
import { ChatCardListbox } from '../widget/chatCardListbox.js';
import { ChatModelFeedbackSurveyStatus, IChatModelFeedbackSurveyService, IChatModelFeedbackSurveyState } from './chatModelFeedbackSurveyService.js';
import './media/chatModelFeedbackSurvey.css';

/** Keys the chat list acts on, which the survey has to claim while it is focused. */
const KEYS_HANDLED_BY_LIST = new Set<KeyCode>([
	KeyCode.UpArrow,
	KeyCode.DownArrow,
	KeyCode.LeftArrow,
	KeyCode.RightArrow,
	KeyCode.PageUp,
	KeyCode.PageDown,
	KeyCode.Enter,
	KeyCode.Space,
	KeyCode.Escape,
	KeyCode.Home,
	KeyCode.End,
]);

const TEXT_INPUT_MAX_HEIGHT = 96;

/** Stands in for a step key once the survey is answered and only acknowledges. */
const ACKNOWLEDGEMENT_STEP_KEY = 'acknowledged';

/**
 * The inline survey shown beneath a chat response footer.
 *
 * It renders below the footer toolbar so opening it never moves the footer icons. All durable
 * state lives in the survey service, since chat rows are virtualized and recycle this widget.
 */
export class ChatModelFeedbackSurveyWidget extends Disposable {

	private readonly renderDisposables = this._register(new DisposableStore());
	private response: IChatResponseViewModel | undefined;
	private readonly hasSurveyContextKey: IContextKey<boolean>;
	private readonly surveyOpenContextKey: IContextKey<boolean>;
	/** Step focus was last moved to, so an unrelated re-render does not move it again. */
	private lastFocusedStep: string | undefined;
	private isPanelOpen = false;
	/** Guards against `render` being re-entered when reading state changes that state. */
	private isRendering = false;

	constructor(
		private readonly container: HTMLElement,
		/** Returns focus to whatever opened the survey once its controls are torn down. */
		private readonly restoreFocus: () => void,
		@IChatModelFeedbackSurveyService private readonly surveyService: IChatModelFeedbackSurveyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.hasSurveyContextKey = ChatContextKeys.responseHasFeedbackSurvey.bindTo(contextKeyService);
		this.surveyOpenContextKey = ChatContextKeys.responseFeedbackSurveyOpen.bindTo(contextKeyService);

		this._register(this.surveyService.onDidChangeSurveyState(e => {
			if (this.response && e.requestId === this.response.requestId && e.sessionResource.toString() === this.response.sessionResource.toString()) {
				this.render(this.response);
			}
		}));

		this._register(this.surveyService.onDidChangeConfiguration(() => this.render(this.response)));

		// Escape is handled in capture, because Button stops propagation on its own Escape.
		this._register(dom.addDisposableListener(this.container, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Escape) {
				event.stopPropagation();
				event.preventDefault();
				this.dismiss();
			}
		}, true));

		// Claimed on the way back up, after the survey has had its turn, so the chat list does
		// not also move its selection. Stopping these in capture would starve the option list.
		this._register(dom.addDisposableListener(this.container, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (KEYS_HANDLED_BY_LIST.has(event.keyCode) && !dom.isEditableElement(e.target as HTMLElement)) {
				event.stopPropagation();
			}
		}));
	}

	/** Renders the survey for `response`, or clears the panel when there is nothing to show. */
	render(response: IChatResponseViewModel | undefined): void {
		// Reading the survey can open it, which reports a state change back to this widget. The
		// call already in flight reads the latest state, so a nested render would only duplicate
		// what it is about to draw.
		if (this.isRendering) {
			return;
		}

		this.isRendering = true;
		try {
			this.doRender(response);
		} finally {
			this.isRendering = false;
		}
	}

	private doRender(response: IChatResponseViewModel | undefined): void {
		this.response = response;
		this.renderDisposables.clear();
		dom.clearNode(this.container);

		const state = response && this.surveyService.getSurvey(response);
		this.hasSurveyContextKey.set(!!state);

		const isOpen = !!state && state.status === ChatModelFeedbackSurveyStatus.Open;
		const wasOpen = this.isPanelOpen;
		this.isPanelOpen = isOpen;
		this.surveyOpenContextKey.set(isOpen);
		this.container.classList.toggle('hidden', !isOpen);
		if (!response || !state || !isOpen) {
			this.lastFocusedStep = undefined;
			// The focused control has just been removed, so hand focus back to the control that
			// opened the survey rather than letting it fall to the document body.
			if (wasOpen) {
				this.restoreFocus();
			}
			return;
		}

		this.renderPanel(response, state);
	}

	private renderPanel(response: IChatResponseViewModel, state: IChatModelFeedbackSurveyState): void {
		const step = state.config.steps[state.stepIndex];
		if (!step) {
			return;
		}

		const panel = dom.append(this.container, dom.$(`.chat-feedback-survey-container.${CHAT_CARD_LARGE_CLASS}`));
		const header = dom.append(panel, dom.$(`.chat-feedback-survey-header.${CHAT_CARD_HEADER_CLASS}`));
		const title = dom.append(header, dom.$(`.chat-feedback-survey-title.${CHAT_CARD_TITLE_CLASS}`));
		title.textContent = state.isSubmitted
			? localize('chat.feedbackSurvey.acknowledgement', "Thanks, your feedback has been recorded.")
			: step.title;

		const closeButton = this.renderCloseButton(header);

		// An answered survey has nothing left to ask, so it only acknowledges.
		if (state.isSubmitted) {
			if (this.lastFocusedStep !== ACKNOWLEDGEMENT_STEP_KEY) {
				this.lastFocusedStep = ACKNOWLEDGEMENT_STEP_KEY;
				status(localize('chat.feedbackSurvey.submitted', "Feedback submitted. Thank you."));
				// Submitting removed the control that had focus, so move it to the one left.
				closeButton.focus();
			}
			return;
		}

		const body = dom.append(panel, dom.$('.chat-feedback-survey-body'));
		const firstControl = step.kind === ChatModelFeedbackSurveyStepKind.Choice
			? this.renderChoiceStep(response, body, state.instanceId, step.id, step.options, step.title)
			: this.renderTextStep(response, state, body, step);

		if (state.config.steps.length > 1) {
			const progress = dom.append(panel, dom.$('.chat-feedback-survey-progress'));
			progress.textContent = localize('chat.feedbackSurvey.progress', "Step {0} of {1}", state.stepIndex + 1, state.config.steps.length);
		}

		const stepKey = `${state.instanceId}:${state.stepIndex}`;
		if (this.lastFocusedStep !== stepKey) {
			this.lastFocusedStep = stepKey;
			status(localize('chat.feedbackSurvey.stepAnnouncement', "{0}. Step {1} of {2}.", step.title, state.stepIndex + 1, state.config.steps.length));
			// A survey the user asked for takes focus, one that appeared on its own does not.
			if (state.openTrigger === 'manual' || state.stepIndex > 0) {
				firstControl?.focus();
			}
		}
	}

	private renderCloseButton(header: HTMLElement): Button {
		const label = localize('chat.feedbackSurvey.dismiss', "Dismiss Survey");
		const close = createChatCardIconButton(this.renderDisposables, header, this.hoverService, {
			icon: Codicon.closeSmall,
			ariaLabel: label,
			hoverContent: label,
		});
		this.renderDisposables.add(close.onDidClick(() => this.dismiss()));
		return close;
	}

	/** Renders the options as a single select list, matching the ask question tool. */
	private renderChoiceStep(response: IChatResponseViewModel, body: HTMLElement, instanceId: string, stepId: string, options: readonly { id: string; label: string }[], title: string): HTMLElement {
		const listbox = new ChatCardListbox(dom.append(body, dom.$('.chat-feedback-survey-list')), title, 'active');

		options.forEach((option, index) => {
			const item = dom.append(listbox.domNode, dom.$('.chat-feedback-survey-list-item'));
			listbox.addOption(item, `chat-feedback-survey-${instanceId}-${stepId}`);

			const label = dom.append(item, dom.$('.chat-feedback-survey-list-label'));
			label.textContent = option.label;

			this.renderDisposables.add(dom.addDisposableListener(item, dom.EventType.CLICK, e => {
				dom.EventHelper.stop(e, true);
				this.surveyService.answerChoice(response, stepId, option.id);
			}));
		});

		listbox.setActive(0);

		this.renderDisposables.add(dom.addDisposableListener(listbox.domNode, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.DownArrow) {
				event.preventDefault();
				listbox.setActive(listbox.wrappedIndex(listbox.activeIndex + 1));
			} else if (event.keyCode === KeyCode.UpArrow) {
				event.preventDefault();
				listbox.setActive(listbox.wrappedIndex(listbox.activeIndex - 1));
			} else if (event.keyCode === KeyCode.Home) {
				event.preventDefault();
				listbox.setActive(0);
			} else if (event.keyCode === KeyCode.End) {
				event.preventDefault();
				listbox.setActive(listbox.length - 1);
			} else if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
				event.preventDefault();
				this.surveyService.answerChoice(response, stepId, options[listbox.activeIndex].id);
			}
		}));

		return listbox.domNode;
	}

	private renderTextStep(response: IChatResponseViewModel, state: IChatModelFeedbackSurveyState, body: HTMLElement, step: IChatModelFeedbackSurveyTextStep): HTMLElement {
		const inputBox = this.renderDisposables.add(new InputBox(body, undefined, {
			placeholder: step.placeholder,
			ariaLabel: step.title,
			inputBoxStyles: defaultInputBoxStyles,
			flexibleHeight: true,
			flexibleMaxHeight: TEXT_INPUT_MAX_HEIGHT,
		}));
		inputBox.value = state.commentDraft || state.answers.get(step.id) || '';
		inputBox.inputElement.maxLength = step.maxLength;
		this.renderDisposables.add(inputBox.onDidChange(value => this.surveyService.setCommentDraft(response, value)));

		const actions = dom.append(body, dom.$('.chat-feedback-survey-actions'));
		const submit = this.renderDisposables.add(new Button(actions, { ...defaultButtonStyles }));
		submit.label = localize('chat.feedbackSurvey.submit', "Submit");
		this.renderDisposables.add(submit.onDidClick(() => this.surveyService.submit(response, inputBox.value)));

		return inputBox.inputElement;
	}

	private dismiss(): void {
		if (!this.response || !this.isPanelOpen) {
			return;
		}
		this.surveyService.dismiss(this.response);
	}
}
