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
import { hasKey } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
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
import { Codicon } from '../../../../../../base/common/codicons.js';
import './media/chatQuestionCarousel.css';

export interface IChatQuestionCarouselOptions {
	onSubmit: (answers: Map<string, unknown> | undefined) => void;
}

export class ChatQuestionCarouselPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private _currentIndex = 0;
	private readonly _answers = new Map<string, unknown>();

	private readonly _titlePart: ChatQueryTitlePart;
	private readonly _progressElement: HTMLElement;
	private readonly _questionContainer: HTMLElement;
	private readonly _navigationButtons: HTMLElement;
	private readonly _prevButton: Button;
	private readonly _nextButton: Button;
	private readonly _skipAllButton: Button | undefined;

	private _isSkipped = false;

	private readonly _textInputBoxes: Map<string, InputBox> = new Map();
	private readonly _radioInputs: Map<string, HTMLInputElement[]> = new Map();
	private readonly _checkboxInputs: Map<string, HTMLInputElement[]> = new Map();
	private readonly _freeformInputBoxes: Map<string, InputBox> = new Map();
	private readonly _inputBoxes: DisposableStore = this._register(new DisposableStore());

	constructor(
		private readonly carousel: IChatQuestionCarousel,
		_context: IChatContentPartRenderContext,
		private readonly _options: IChatQuestionCarouselOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		super();

		this.domNode = dom.$('.chat-question-carousel-container');

		// Restore answers from carousel data if already submitted (e.g., after re-render due to virtualization)
		if (carousel.data) {
			for (const [key, value] of Object.entries(carousel.data)) {
				this._answers.set(key, value);
			}
		}

		// If carousel was already used, render in submitted state
		if (carousel.isUsed) {
			this._isSkipped = true;
		}

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

		// Skip all button (left side) with spacer to push navigation buttons to the right
		if (this.carousel.allowSkip) {
			this._skipAllButton = this._register(new Button(this._navigationButtons, { ...defaultButtonStyles, secondary: true }));
			this._skipAllButton.label = localize('skipAll', 'Skip All');
			this._skipAllButton.element.classList.add('chat-question-skip-all');
			this._register(this._skipAllButton.onDidClick(() => this.ignore()));

			// Spacer to push navigation buttons to the right
			const spacer = dom.$('.chat-question-nav-spacer');
			this._navigationButtons.appendChild(spacer);
		}

		// Back button (hidden for single-question carousels)
		this._prevButton = this._register(new Button(this._navigationButtons, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		this._prevButton.element.classList.add('chat-question-nav-arrow', 'chat-question-nav-prev');
		this._prevButton.label = `$(${Codicon.arrowLeft.id})`;
		this._prevButton.element.title = localize('previous', 'Previous');

		// Hide back button when there is at most one question
		if (this.carousel.questions.length <= 1) {
			this._prevButton.element.classList.add('chat-question-nav-hidden');
		}

		this._nextButton = this._register(new Button(this._navigationButtons, { ...defaultButtonStyles, supportIcons: true }));
		this._nextButton.element.classList.add('chat-question-nav-arrow', 'chat-question-nav-next');
		this._nextButton.label = `$(${Codicon.arrowRight.id})`;
		this._nextButton.element.title = localize('next', 'Next');
		this.domNode.append(this._navigationButtons);

		// Register event listeners
		this._register(this._prevButton.onDidClick(() => this.navigate(-1)));
		this._register(this._nextButton.onDidClick(() => this.handleNext()));

		// Register keyboard navigation - only handle Enter on text inputs or navigation buttons
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter && !event.shiftKey) {
				// Only handle Enter key for text inputs and buttons, not radio/checkbox
				const target = e.target as HTMLElement;
				const isTextInput = target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text';
				const isButton = target.classList.contains('monaco-button');
				if (isTextInput || isButton) {
					e.preventDefault();
					e.stopPropagation();
					this.handleNext();
				}
			}
		}));

		// Initialize the carousel
		this.renderCurrentQuestion();

		// If already submitted, disable interaction
		if (this.carousel.isUsed) {
			this.disableAllButtons();
		}
	}

	/**
	 * Saves the current question's answer to the answers map.
	 */
	private saveCurrentAnswer(): void {
		const currentQuestion = this.carousel.questions[this._currentIndex];
		const answer = this.getCurrentAnswer();
		if (answer !== undefined) {
			this._answers.set(currentQuestion.id, answer);
		}
	}

	/**
	 * Navigates the carousel by the given delta.
	 * @param delta Negative for previous, positive for next
	 */
	private navigate(delta: number): void {
		const newIndex = this._currentIndex + delta;
		if (newIndex >= 0 && newIndex < this.carousel.questions.length) {
			this.saveCurrentAnswer();
			this._currentIndex = newIndex;
			this.renderCurrentQuestion();
		}
	}

	/**
	 * Handles the next/submit button action.
	 * Either advances to the next question or submits.
	 */
	private handleNext(): void {
		this.saveCurrentAnswer();

		if (this._currentIndex < this.carousel.questions.length - 1) {
			// Move to next question
			this._currentIndex++;
			this.renderCurrentQuestion();
		} else {
			// Submit
			this._options.onSubmit(this._answers);
			this.disableAllButtons();
		}
	}

	/**
	 * Skips the carousel with default values - called when user wants to proceed quickly.
	 * Returns defaults for all questions.
	 */
	public skip(): boolean {
		if (this._isSkipped || !this.carousel.allowSkip) {
			return false;
		}
		this._isSkipped = true;

		const defaults = this.getDefaultAnswers();
		this._options.onSubmit(defaults);
		this.disableAllButtons();
		return true;
	}

	/**
	 * Ignores the carousel completely - called when user wants to dismiss without data.
	 * Returns undefined to signal the carousel was ignored.
	 */
	public ignore(): boolean {
		if (this._isSkipped || !this.carousel.allowSkip) {
			return false;
		}
		this._isSkipped = true;

		this._options.onSubmit(undefined);
		this.disableAllButtons();
		return true;
	}

	/**
	 * Collects default values for all questions in the carousel.
	 */
	private getDefaultAnswers(): Map<string, unknown> {
		const answers = new Map<string, unknown>();
		for (const question of this.carousel.questions) {
			const defaultAnswer = this.getDefaultAnswerForQuestion(question);
			if (defaultAnswer !== undefined) {
				answers.set(question.id, defaultAnswer);
			}
		}
		return answers;
	}

	/**
	 * Gets the default answer for a specific question.
	 */
	private getDefaultAnswerForQuestion(question: IChatQuestion): unknown {
		switch (question.type) {
			case 'text':
				return question.defaultValue;

			case 'singleSelect': {
				const defaultOptionId = typeof question.defaultValue === 'string' ? question.defaultValue : undefined;
				const defaultOption = defaultOptionId !== undefined
					? question.options?.find(opt => opt.id === defaultOptionId)
					: undefined;
				const selectedValue = defaultOption?.value;

				if (question.allowFreeformInput) {
					return selectedValue !== undefined ? { selectedValue, freeformValue: undefined } : undefined;
				}
				return selectedValue;
			}

			case 'multiSelect': {
				const defaultIds = Array.isArray(question.defaultValue)
					? question.defaultValue
					: (typeof question.defaultValue === 'string' ? [question.defaultValue] : []);
				const selectedValues = question.options
					?.filter(opt => defaultIds.includes(opt.id))
					.map(opt => opt.value)
					.filter(v => v !== undefined) ?? [];

				if (question.allowFreeformInput) {
					return selectedValues.length > 0 ? { selectedValues, freeformValue: undefined } : undefined;
				}
				return selectedValues;
			}

			default:
				return question.defaultValue;
		}
	}

	private disableAllButtons(): void {
		this._prevButton.enabled = false;
		this._nextButton.enabled = false;
		if (this._skipAllButton) {
			this._skipAllButton.enabled = false;
		}
	}

	private renderCurrentQuestion(): void {
		// Clear previous input boxes and stale references
		this._inputBoxes.clear();
		this._textInputBoxes.clear();
		this._radioInputs.clear();
		this._checkboxInputs.clear();
		this._freeformInputBoxes.clear();

		// Clear previous content
		dom.clearNode(this._questionContainer);

		const question = this.carousel.questions[this._currentIndex];
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
		this._progressElement.textContent = localize('chat.questionCarousel.progress', '{0} of {1}', this._currentIndex + 1, this.carousel.questions.length);

		// Update navigation button states
		this._prevButton.enabled = this._currentIndex > 0;

		// Update next button icon/label for last question
		const isLastQuestion = this._currentIndex === this.carousel.questions.length - 1;
		if (isLastQuestion) {
			this._nextButton.label = `$(${Codicon.check.id})`;
			this._nextButton.element.title = localize('submit', 'Submit');
		} else {
			this._nextButton.label = `$(${Codicon.arrowRight.id})`;
			this._nextButton.element.title = localize('next', 'Next');
		}

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
		const previousAnswer = this._answers.get(question.id);
		if (previousAnswer !== undefined) {
			inputBox.value = String(previousAnswer);
		} else if (question.defaultValue !== undefined) {
			inputBox.value = String(question.defaultValue);
		}

		this._textInputBoxes.set(question.id, inputBox);

		// Focus on input when rendered using proper DOM scheduling
		this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(inputBox.element), () => inputBox.focus()));
	}

	private renderSingleSelect(container: HTMLElement, question: IChatQuestion): void {
		const options = question.options || [];
		const selectContainer = dom.$('.chat-question-options');
		selectContainer.setAttribute('role', 'radiogroup');
		selectContainer.setAttribute('aria-label', question.title);
		container.appendChild(selectContainer);

		// Restore previous answer if exists
		const previousAnswer = this._answers.get(question.id);
		const previousFreeform = typeof previousAnswer === 'object' && previousAnswer !== null && hasKey(previousAnswer, { freeformValue: true })
			? (previousAnswer as { freeformValue?: string }).freeformValue
			: undefined;
		const previousSelectedValue = typeof previousAnswer === 'object' && previousAnswer !== null && hasKey(previousAnswer, { selectedValue: true })
			? (previousAnswer as { selectedValue?: unknown }).selectedValue
			: previousAnswer;

		// Get default option id (for singleSelect, defaultValue is a single string)
		const defaultOptionId = typeof question.defaultValue === 'string' ? question.defaultValue : undefined;

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
			if (previousSelectedValue !== undefined) {
				radioInput.checked = option.value === previousSelectedValue;
			} else if (defaultOptionId !== undefined && option.id === defaultOptionId) {
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

		this._radioInputs.set(question.id, radioInputs);

		// Add freeform input if allowed
		if (question.allowFreeformInput) {
			const freeformContainer = dom.$('.chat-question-freeform');
			const freeformLabel = dom.$('.chat-question-freeform-label');
			freeformLabel.textContent = localize('chat.questionCarousel.orEnterOwn', 'Or enter your own:');
			freeformContainer.appendChild(freeformLabel);

			const freeformInputBox = this._inputBoxes.add(new InputBox(freeformContainer, undefined, {
				placeholder: localize('chat.questionCarousel.enterCustomAnswer', 'Enter custom answer'),
				inputBoxStyles: defaultInputBoxStyles,
			}));

			if (previousFreeform !== undefined) {
				freeformInputBox.value = previousFreeform;
			}

			container.appendChild(freeformContainer);
			this._freeformInputBoxes.set(question.id, freeformInputBox);
		}
	}

	private renderMultiSelect(container: HTMLElement, question: IChatQuestion): void {
		const options = question.options || [];
		const selectContainer = dom.$('.chat-question-options');
		selectContainer.setAttribute('role', 'group');
		selectContainer.setAttribute('aria-label', question.title);
		container.appendChild(selectContainer);

		// Restore previous answer if exists
		const previousAnswer = this._answers.get(question.id);
		const previousFreeform = typeof previousAnswer === 'object' && previousAnswer !== null && hasKey(previousAnswer, { freeformValue: true })
			? (previousAnswer as { freeformValue?: string }).freeformValue
			: undefined;
		const previousSelectedValues = typeof previousAnswer === 'object' && previousAnswer !== null && hasKey(previousAnswer, { selectedValues: true })
			? (previousAnswer as { selectedValues?: unknown[] }).selectedValues
			: (Array.isArray(previousAnswer) ? previousAnswer : []);

		// Get default option ids (for multiSelect, defaultValue can be string or string[])
		const defaultOptionIds: string[] = Array.isArray(question.defaultValue)
			? question.defaultValue
			: (typeof question.defaultValue === 'string' ? [question.defaultValue] : []);

		const checkboxInputs: HTMLInputElement[] = [];
		options.forEach((option, index) => {
			const optionLabel = dom.$('.chat-question-option');
			const checkboxInput = dom.$<HTMLInputElement>('input.chat-question-checkbox');
			checkboxInput.type = 'checkbox';
			checkboxInput.value = String(index);
			checkboxInput.id = `option-${question.id}-${index}`;
			checkboxInput.setAttribute('aria-describedby', `label-${question.id}-${index}`);

			// Check if this was previously selected or is default
			if (previousSelectedValues && previousSelectedValues.length > 0) {
				checkboxInput.checked = previousSelectedValues.includes(option.value);
			} else if (defaultOptionIds.includes(option.id)) {
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

		this._checkboxInputs.set(question.id, checkboxInputs);

		// Add freeform input if allowed
		if (question.allowFreeformInput) {
			const freeformContainer = dom.$('.chat-question-freeform');
			const freeformLabel = dom.$('.chat-question-freeform-label');
			freeformLabel.textContent = localize('chat.questionCarousel.orEnterOwn', 'Or enter your own:');
			freeformContainer.appendChild(freeformLabel);

			const freeformInputBox = this._inputBoxes.add(new InputBox(freeformContainer, undefined, {
				placeholder: localize('chat.questionCarousel.enterCustomAnswer', 'Enter custom answer'),
				inputBoxStyles: defaultInputBoxStyles,
			}));

			if (previousFreeform !== undefined) {
				freeformInputBox.value = previousFreeform;
			}

			container.appendChild(freeformContainer);
			this._freeformInputBoxes.set(question.id, freeformInputBox);
		}
	}

	private getCurrentAnswer(): unknown {
		const question = this.carousel.questions[this._currentIndex];
		if (!question) {
			return undefined;
		}

		switch (question.type) {
			case 'text': {
				const inputBox = this._textInputBoxes.get(question.id);
				return inputBox?.value ?? question.defaultValue;
			}

			case 'singleSelect': {
				const radioInputs = this._radioInputs.get(question.id);
				let selectedValue: unknown = undefined;
				if (radioInputs) {
					for (const radio of radioInputs) {
						if (radio.checked) {
							const index = parseInt(radio.value);
							selectedValue = question.options?.[index]?.value;
							break;
						}
					}
				}
				// Find default option if nothing selected (defaultValue is the option id)
				if (selectedValue === undefined && typeof question.defaultValue === 'string') {
					const defaultOption = question.options?.find(opt => opt.id === question.defaultValue);
					selectedValue = defaultOption?.value;
				}

				// Include freeform value if allowed
				if (question.allowFreeformInput) {
					const freeformInput = this._freeformInputBoxes.get(question.id);
					const freeformValue = freeformInput?.value !== '' ? freeformInput?.value : undefined;
					if (freeformValue || selectedValue !== undefined) {
						return { selectedValue, freeformValue };
					}
					return undefined;
				}

				return selectedValue;
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
				// Include defaults if nothing selected (defaultValue is option id or array of ids)
				let finalSelectedValues = selectedValues;
				if (selectedValues.length === 0 && question.defaultValue !== undefined) {
					const defaultIds = Array.isArray(question.defaultValue)
						? question.defaultValue
						: [question.defaultValue];
					const defaultValues = question.options
						?.filter(opt => defaultIds.includes(opt.id))
						.map(opt => opt.value);
					finalSelectedValues = defaultValues?.filter(v => v !== undefined) || [];
				}

				// Include freeform value if allowed
				if (question.allowFreeformInput) {
					const freeformInput = this._freeformInputBoxes.get(question.id);
					const freeformValue = freeformInput?.value !== '' ? freeformInput?.value : undefined;
					if (freeformValue || finalSelectedValues.length > 0) {
						return { selectedValues: finalSelectedValues, freeformValue };
					}
					return undefined;
				}

				return finalSelectedValues;
			}

			default:
				return question.defaultValue;
		}
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'questionCarousel' && other === this.carousel;
	}

	addDisposable(disposable: { dispose(): void }): void {
		this._register(disposable);
	}
}
