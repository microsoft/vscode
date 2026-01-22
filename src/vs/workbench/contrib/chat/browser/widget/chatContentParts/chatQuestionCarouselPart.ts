/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue, ISettableObservable, transaction } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { runAtThisOrScheduleAtNextAnimationFrame } from '../../../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { IChatQuestion, IChatQuestionCarousel } from '../../../common/chatService/chatService.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatQueryTitlePart } from './chatConfirmationWidget.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import './media/chatQuestionCarousel.css';

export interface IChatQuestionCarouselOptions {
	questions: IChatQuestion[];
	allowSkip: boolean;
	onSubmit: (answers: Map<string, unknown> | undefined) => void;
}

export class ChatQuestionCarouselPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private readonly _currentIndex: ISettableObservable<number>;
	private readonly _answers: ISettableObservable<Map<string, unknown>>;

	private readonly _titlePart: ChatQueryTitlePart;
	private readonly _progressElement: HTMLElement;
	private readonly _questionContainer: HTMLElement;
	private readonly _navigationButtons: HTMLElement;
	private readonly _prevButton: Button;
	private readonly _nextButton: Button;
	private readonly _skipButton: Button;

	private readonly _inputElements: Map<string, HTMLElement> = new Map();
	private readonly _textInputBoxes: Map<string, InputBox> = new Map();
	private readonly _radioInputs: Map<string, HTMLInputElement[]> = new Map();
	private readonly _checkboxInputs: Map<string, HTMLInputElement[]> = new Map();
	private readonly _inputBoxes: DisposableStore = this._register(new DisposableStore());

	constructor(
		private readonly carousel: IChatQuestionCarousel,
		context: IChatContentPartRenderContext,
		private readonly _options: IChatQuestionCarouselOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		super();

		this._currentIndex = observableValue(this, 0);
		this._answers = observableValue(this, new Map<string, unknown>());

		this.domNode = dom.$('.chat-question-carousel-container');

		// Header with title and progress
		const header = dom.$('.chat-question-carousel-header');
		const titleElement = dom.$('.chat-question-carousel-title');
		this._titlePart = this._register(this.instantiationService.createInstance(
			ChatQueryTitlePart,
			titleElement,
			new MarkdownString(localize('chat.questionCarousel.title', 'Please provide the following information')),
			undefined
		));
		this._register(this._titlePart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		this._progressElement = dom.$('.chat-question-carousel-progress');
		header.append(titleElement, this._progressElement);
		this.domNode.append(header);

		// Question container
		this._questionContainer = dom.$('.chat-question-carousel-content');
		this.domNode.append(this._questionContainer);

		// Navigation buttons with accessibility attributes
		this._navigationButtons = dom.$('.chat-question-carousel-footer');
		this._navigationButtons.setAttribute('role', 'navigation');
		this._navigationButtons.setAttribute('aria-label', localize('chat.questionCarousel.navigation', 'Question navigation'));
		this._skipButton = this._register(new Button(this._navigationButtons, { ...defaultButtonStyles, secondary: true }));
		this._skipButton.label = localize('skip', 'Skip');
		this._prevButton = this._register(new Button(this._navigationButtons, { ...defaultButtonStyles, secondary: true }));
		this._prevButton.label = localize('previous', 'Previous');
		this._nextButton = this._register(new Button(this._navigationButtons, { ...defaultButtonStyles }));
		this._nextButton.label = localize('next', 'Next');
		this.domNode.append(this._navigationButtons);

		// Register event listeners
		this._register(this._prevButton.onDidClick(() => this.navigate(-1)));
		this._register(this._nextButton.onDidClick(() => this.handleNext()));
		this._register(this._skipButton.onDidClick(() => this.handleSkip()));

		// Register keyboard navigation
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter && !event.shiftKey) {
				// Enter key to proceed to next question or submit
				e.preventDefault();
				e.stopPropagation();
				this.handleNext();
			} else if (event.keyCode === KeyCode.Escape && this.carousel.allowSkip) {
				// Escape key to skip (if allowed)
				e.preventDefault();
				e.stopPropagation();
				this.handleSkip();
			}
		}));

		// Initialize the carousel
		this.renderCurrentQuestion();
	}

	/**
	 * Navigates the carousel by the given delta.
	 * @param delta Negative for previous, positive for next
	 */
	private navigate(delta: number): void {
		const newIndex = this._currentIndex.get() + delta;
		if (newIndex >= 0 && newIndex < this.carousel.questions.length) {
			// Save current answer before navigating
			const currentQuestion = this.carousel.questions[this._currentIndex.get()];
			const answer = this.getCurrentAnswer();

			// Use transaction and immutable map update for proper observable semantics
			transaction(tx => {
				if (answer !== undefined) {
					const newAnswers = new Map(this._answers.get());
					newAnswers.set(currentQuestion.id, answer);
					this._answers.set(newAnswers, tx);
				}
				this._currentIndex.set(newIndex, tx);
			});

			this.renderCurrentQuestion();
		}
	}

	/**
	 * Handles the next/submit button action.
	 * Validates required fields and either advances to the next question or submits.
	 */
	private handleNext(): void {
		const currentQuestion = this.carousel.questions[this._currentIndex.get()];
		const answer = this.getCurrentAnswer();

		if (currentQuestion.required && this.isAnswerEmpty(answer)) {
			// Required question - cannot proceed
			return;
		}

		// Use immutable map update for proper observable semantics
		if (answer !== undefined) {
			const newAnswers = new Map(this._answers.get());
			newAnswers.set(currentQuestion.id, answer);
			this._answers.set(newAnswers, undefined);
		}

		if (this._currentIndex.get() < this.carousel.questions.length - 1) {
			// Move to next question
			this.navigate(1);
		} else {
			// Submit
			this._options.onSubmit(this._answers.get());
			this.disableAllButtons();
		}
	}

	/**
	 * Handles the skip button action.
	 * Skips the entire carousel and returns undefined for answers.
	 */
	private handleSkip(): void {
		if (!this.carousel.allowSkip) {
			return;
		}
		// Skip entire carousel - return undefined
		this._options.onSubmit(undefined);
		this.disableAllButtons();
	}

	private disableAllButtons(): void {
		this._prevButton.enabled = false;
		this._nextButton.enabled = false;
		this._skipButton.enabled = false;
	}

	private renderCurrentQuestion(): void {
		// Clear previous input boxes
		this._inputBoxes.clear();
		this._inputElements.clear();

		// Clear previous content
		dom.clearNode(this._questionContainer);

		const question = this.carousel.questions[this._currentIndex.get()];
		if (!question) {
			return;
		}

		// Render question title
		const title = dom.$('.chat-question-title');
		title.textContent = question.title;
		this._questionContainer.appendChild(title);

		// Render question message if present (with markdown support)
		if (question.message) {
			const messageContainer = dom.$('.chat-question-message');
			const markdownContent = typeof question.message === 'string'
				? new MarkdownString(question.message)
				: question.message;
			const renderedMessage = this._inputBoxes.add(this.markdownRendererService.render(markdownContent));
			messageContainer.appendChild(renderedMessage.element);
			this._questionContainer.appendChild(messageContainer);
		}

		// Render input based on question type
		const inputContainer = dom.$('.chat-question-input-container');
		this.renderInput(inputContainer, question);
		this._questionContainer.appendChild(inputContainer);

		// Update progress indicator
		this._progressElement.textContent = localize('chat.questionCarousel.progress', '{0} of {1}', this._currentIndex.get() + 1, this.carousel.questions.length);

		// Update navigation button states
		this._prevButton.enabled = this._currentIndex.get() > 0;
		this._skipButton.enabled = this.carousel.allowSkip;

		// Update next button label
		const isLastQuestion = this._currentIndex.get() === this.carousel.questions.length - 1;
		this._nextButton.label = isLastQuestion ? localize('submit', 'Submit') : localize('next', 'Next');

		this._onDidChangeHeight.fire();
	}

	private renderInput(container: HTMLElement, question: IChatQuestion): void {
		switch (question.type) {
			case 'text':
				this.renderTextInput(container, question);
				break;
			case 'singleSelect':
				this.renderSingleSelect(container, question);
				break;
			case 'multiSelect':
				this.renderMultiSelect(container, question);
				break;
		}
	}

	private renderTextInput(container: HTMLElement, question: IChatQuestion): void {
		const inputBox = this._inputBoxes.add(new InputBox(container, undefined, {
			placeholder: localize('chat.questionCarousel.enterText', 'Enter your answer'),
			inputBoxStyles: defaultInputBoxStyles,
		}));

		// Restore previous answer if exists
		const previousAnswer = this._answers.get().get(question.id);
		if (previousAnswer !== undefined) {
			inputBox.value = String(previousAnswer);
		} else if (question.defaultValue !== undefined) {
			inputBox.value = String(question.defaultValue);
		}

		this._inputElements.set(question.id, inputBox.element);
		this._textInputBoxes.set(question.id, inputBox);

		// Focus on input when rendered using proper DOM scheduling
		this._inputBoxes.add(runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(inputBox.element), () => inputBox.focus()));
	}

	private renderSingleSelect(container: HTMLElement, question: IChatQuestion): void {
		const options = question.options || [];
		const selectContainer = dom.$('.chat-question-options');
		selectContainer.setAttribute('role', 'radiogroup');
		selectContainer.setAttribute('aria-label', question.title);
		if (question.required) {
			selectContainer.setAttribute('aria-required', 'true');
		}
		container.appendChild(selectContainer);

		// Restore previous answer if exists
		const previousAnswer = this._answers.get().get(question.id);

		const radioInputs: HTMLInputElement[] = [];
		options.forEach((option, index) => {
			const optionLabel = dom.$('.chat-question-option');
			const radioInput = dom.$<HTMLInputElement>('input.chat-question-radio');
			radioInput.type = 'radio';
			radioInput.name = `question-${question.id}`;
			radioInput.value = String(index);
			radioInput.id = `option-${question.id}-${index}`;
			radioInput.setAttribute('aria-describedby', `label-${question.id}-${index}`);

			// Check if this was previously selected or is default
			if (previousAnswer !== undefined) {
				radioInput.checked = option.value === previousAnswer;
			} else if (option.default) {
				radioInput.checked = true;
			}

			const label = dom.$<HTMLLabelElement>('label.chat-question-option-label');
			label.htmlFor = `option-${question.id}-${index}`;
			label.id = `label-${question.id}-${index}`;
			label.textContent = option.label;

			optionLabel.appendChild(radioInput);
			optionLabel.appendChild(label);
			selectContainer.appendChild(optionLabel);
			radioInputs.push(radioInput);
		});

		this._inputElements.set(question.id, selectContainer);
		this._radioInputs.set(question.id, radioInputs);
	}

	private renderMultiSelect(container: HTMLElement, question: IChatQuestion): void {
		const options = question.options || [];
		const selectContainer = dom.$('.chat-question-options');
		selectContainer.setAttribute('role', 'group');
		selectContainer.setAttribute('aria-label', question.title);
		if (question.required) {
			selectContainer.setAttribute('aria-required', 'true');
		}
		container.appendChild(selectContainer);

		// Restore previous answer if exists
		const previousAnswer = this._answers.get().get(question.id);
		const previousValues = Array.isArray(previousAnswer) ? previousAnswer : [];

		const checkboxInputs: HTMLInputElement[] = [];
		options.forEach((option, index) => {
			const optionLabel = dom.$('.chat-question-option');
			const checkboxInput = dom.$<HTMLInputElement>('input.chat-question-checkbox');
			checkboxInput.type = 'checkbox';
			checkboxInput.value = String(index);
			checkboxInput.id = `option-${question.id}-${index}`;
			checkboxInput.setAttribute('aria-describedby', `label-${question.id}-${index}`);

			// Check if this was previously selected or is default
			if (previousValues.length > 0) {
				checkboxInput.checked = previousValues.includes(option.value);
			} else if (option.default) {
				checkboxInput.checked = true;
			}

			const label = dom.$<HTMLLabelElement>('label.chat-question-option-label');
			label.htmlFor = `option-${question.id}-${index}`;
			label.id = `label-${question.id}-${index}`;
			label.textContent = option.label;

			optionLabel.appendChild(checkboxInput);
			optionLabel.appendChild(label);
			selectContainer.appendChild(optionLabel);
			checkboxInputs.push(checkboxInput);
		});

		this._inputElements.set(question.id, selectContainer);
		this._checkboxInputs.set(question.id, checkboxInputs);
	}

	private getCurrentAnswer(): unknown {
		const question = this.carousel.questions[this._currentIndex.get()];
		if (!question) {
			return undefined;
		}

		switch (question.type) {
			case 'text': {
				const inputBox = this._textInputBoxes.get(question.id);
				return inputBox?.value || question.defaultValue;
			}

			case 'singleSelect': {
				const radioInputs = this._radioInputs.get(question.id);
				if (radioInputs) {
					for (const radio of radioInputs) {
						if (radio.checked) {
							const index = parseInt(radio.value);
							return question.options?.[index]?.value;
						}
					}
				}
				// Find default option
				const defaultOption = question.options?.find(opt => opt.default);
				return defaultOption?.value;
			}

			case 'multiSelect': {
				const checkboxInputs = this._checkboxInputs.get(question.id);
				const selectedValues: unknown[] = [];
				if (checkboxInputs) {
					for (const checkbox of checkboxInputs) {
						if (checkbox.checked) {
							const index = parseInt(checkbox.value);
							const value = question.options?.[index]?.value;
							if (value !== undefined) {
								selectedValues.push(value);
							}
						}
					}
				}
				// Include defaults if nothing selected
				if (selectedValues.length === 0) {
					const defaultValues = question.options?.filter(opt => opt.default).map(opt => opt.value);
					return defaultValues?.filter(v => v !== undefined);
				}
				return selectedValues;
			}

			default:
				return question.defaultValue;
		}
	}

	private isAnswerEmpty(answer: unknown): boolean {
		if (answer === undefined || answer === null || answer === '') {
			return true;
		}
		if (Array.isArray(answer) && answer.length === 0) {
			return true;
		}
		return false;
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'questionCarousel' && other === this.carousel;
	}

	addDisposable(disposable: { dispose(): void }): void {
		this._register(disposable);
	}

	override dispose(): void {
		// Clear the input elements map to prevent potential memory leaks
		this._inputElements.clear();
		super.dispose();
	}
}
