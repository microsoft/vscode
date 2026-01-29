/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
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

	private _titlePart: ChatQueryTitlePart | undefined;
	private _progressElement: HTMLElement | undefined;
	private _questionContainer: HTMLElement | undefined;
	private _navigationButtons: HTMLElement | undefined;
	private _prevButton: Button | undefined;
	private _nextButton: Button | undefined;
	private _skipAllButton: Button | undefined;

	private _isSkipped = false;

	private readonly _textInputTextareas: Map<string, HTMLTextAreaElement> = new Map();
	private readonly _radioInputs: Map<string, HTMLInputElement[]> = new Map();
	private readonly _checkboxInputs: Map<string, HTMLInputElement[]> = new Map();
	private readonly _freeformTextareas: Map<string, HTMLTextAreaElement> = new Map();
	private readonly _inputBoxes: DisposableStore = this._register(new DisposableStore());

	/**
	 * Disposable store for interactive UI components (header, nav buttons, etc.)
	 * that should be disposed when transitioning to summary view.
	 */
	private readonly _interactiveUIStore: MutableDisposable<DisposableStore> = this._register(new MutableDisposable());

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

		// If carousel was already used, show summary of answers
		if (carousel.isUsed) {
			this._isSkipped = true;
			this.domNode.classList.add('chat-question-carousel-used');
			this.renderSummary();
			return;
		}

		// Create disposable store for interactive UI components
		const interactiveStore = new DisposableStore();
		this._interactiveUIStore.value = interactiveStore;

		// Header with title and navigation controls
		const header = dom.$('.chat-question-carousel-header');
		const titleElement = dom.$('.chat-question-carousel-title');
		this._titlePart = interactiveStore.add(this.instantiationService.createInstance(
			ChatQueryTitlePart,
			titleElement,
			new MarkdownString(localize('chat.questionCarousel.title', 'Please provide the following information')),
			undefined
		));
		interactiveStore.add(this._titlePart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		// Navigation controls in header (< 1 of 4 > X)
		this._navigationButtons = dom.$('.chat-question-carousel-nav');
		this._navigationButtons.setAttribute('role', 'navigation');
		this._navigationButtons.setAttribute('aria-label', localize('chat.questionCarousel.navigation', 'Question navigation'));

		const previousLabel = localize('previous', 'Previous');
		const prevButton = interactiveStore.add(new Button(this._navigationButtons, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: previousLabel }));
		prevButton.element.classList.add('chat-question-nav-arrow', 'chat-question-nav-prev');
		prevButton.label = `$(${Codicon.chevronLeft.id})`;
		prevButton.element.setAttribute('aria-label', previousLabel);
		this._prevButton = prevButton;

		const progressElement = dom.$('.chat-question-carousel-progress');
		this._navigationButtons.appendChild(progressElement);
		this._progressElement = progressElement;

		const nextLabel = localize('next', 'Next');
		const nextButton = interactiveStore.add(new Button(this._navigationButtons, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: nextLabel }));
		nextButton.element.classList.add('chat-question-nav-arrow', 'chat-question-nav-next');
		nextButton.label = `$(${Codicon.chevronRight.id})`;
		this._nextButton = nextButton;

		// Close/skip button (X) - only shown when allowSkip is true
		if (carousel.allowSkip) {
			const skipAllTitle = localize('chat.questionCarousel.skipAllTitle', 'Skip all questions');
			const skipAllButton = interactiveStore.add(new Button(this._navigationButtons, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: skipAllTitle }));
			skipAllButton.label = `$(${Codicon.close.id})`;
			skipAllButton.element.classList.add('chat-question-nav-arrow', 'chat-question-close');
			skipAllButton.element.setAttribute('aria-label', skipAllTitle);
			this._skipAllButton = skipAllButton;
		}

		header.append(titleElement, this._navigationButtons);
		this.domNode.append(header);

		// Question container
		this._questionContainer = dom.$('.chat-question-carousel-content');
		this.domNode.append(this._questionContainer);


		// Register event listeners
		interactiveStore.add(prevButton.onDidClick(() => this.navigate(-1)));
		interactiveStore.add(nextButton.onDidClick(() => this.handleNext()));
		if (this._skipAllButton) {
			interactiveStore.add(this._skipAllButton.onDidClick(() => this.skip()));
		}

		// Register keyboard navigation - only handle Enter on text inputs
		interactiveStore.add(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter && !event.shiftKey) {
				// Only handle Enter key for text inputs, not radio/checkbox or buttons
				// Buttons have their own Enter/Space handling via Button class
				const target = e.target as HTMLElement;
				const isTextInput = target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text';
				if (isTextInput) {
					e.preventDefault();
					e.stopPropagation();
					this.handleNext();
				}
			}
		}));

		// Initialize the carousel
		this.renderCurrentQuestion();
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
			this.hideAndShowSummary();
		}
	}

	/**
	 * Hides the carousel UI and shows a summary of answers.
	 */
	private hideAndShowSummary(): void {
		this._isSkipped = true;
		this.domNode.classList.add('chat-question-carousel-used');

		// Dispose interactive UI and clear DOM
		this.clearInteractiveResources();
		dom.clearNode(this.domNode);

		// Render summary
		this.renderSummary();
		this._onDidChangeHeight.fire();
	}

	/**
	 * Clears and disposes all interactive UI resources (header, nav buttons, input boxes, etc.)
	 * and resets references to disposed elements.
	 */
	private clearInteractiveResources(): void {
		// Dispose interactive UI disposables (header, nav buttons, etc.)
		this._interactiveUIStore.clear();
		this._inputBoxes.clear();
		this._textInputTextareas.clear();
		this._radioInputs.clear();
		this._checkboxInputs.clear();
		this._freeformTextareas.clear();

		// Clear references to disposed elements
		this._titlePart = undefined;
		this._prevButton = undefined;
		this._nextButton = undefined;
		this._skipAllButton = undefined;
		this._progressElement = undefined;
		this._questionContainer = undefined;
		this._navigationButtons = undefined;
	}

	/**
	 * Skips the carousel with default values - called when user wants to proceed quickly.
	 * Returns defaults for all questions.
	 */
	public skip(): boolean {
		if (this._isSkipped || !this.carousel.allowSkip) {
			return false;
		}

		const defaults = this.getDefaultAnswers();
		this._options.onSubmit(defaults);

		// Reset answers to match submitted defaults for summary display
		this._answers.clear();
		for (const [key, value] of defaults) {
			this._answers.set(key, value);
		}
		this.hideAndShowSummary();
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

		// Dispose interactive UI and clear DOM
		this.clearInteractiveResources();

		// Hide UI and show skipped message
		this.domNode.classList.add('chat-question-carousel-used');
		dom.clearNode(this.domNode);
		this.renderSkippedMessage();
		this._onDidChangeHeight.fire();
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

				// Note: Freeform input is always shown regardless of the `allowFreeformInput` API property.
				// The property is kept for backwards compatibility but is no longer used.
				return selectedValue !== undefined ? { selectedValue, freeformValue: undefined } : undefined;
			}

			case 'multiSelect': {
				const defaultIds = Array.isArray(question.defaultValue)
					? question.defaultValue
					: (typeof question.defaultValue === 'string' ? [question.defaultValue] : []);
				const selectedValues = question.options
					?.filter(opt => defaultIds.includes(opt.id))
					.map(opt => opt.value)
					.filter(v => v !== undefined) ?? [];

				// Note: Freeform input is always shown regardless of the `allowFreeformInput` API property.
				// The property is kept for backwards compatibility but is no longer used.
				return selectedValues.length > 0 ? { selectedValues, freeformValue: undefined } : undefined;
			}

			default:
				return question.defaultValue;
		}
	}

	private renderCurrentQuestion(): void {
		if (!this._questionContainer || !this._progressElement || !this._prevButton || !this._nextButton) {
			return;
		}

		// Clear previous input boxes and stale references
		this._inputBoxes.clear();
		this._textInputTextareas.clear();
		this._radioInputs.clear();
		this._checkboxInputs.clear();
		this._freeformTextareas.clear();

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

		// Update navigation button states (prevButton and nextButton are guaranteed non-null from guard above)
		this._prevButton!.enabled = this._currentIndex > 0;

		// Update next button icon/label for last question
		const isLastQuestion = this._currentIndex === this.carousel.questions.length - 1;
		const submitLabel = localize('submit', 'Submit');
		const nextLabel = localize('next', 'Next');
		if (isLastQuestion) {
			this._nextButton!.label = `$(${Codicon.check.id})`;
			this._nextButton!.element.title = submitLabel;
			this._nextButton!.element.setAttribute('aria-label', submitLabel);
		} else {
			this._nextButton!.label = `$(${Codicon.chevronRight.id})`;
			this._nextButton!.element.title = nextLabel;
			this._nextButton!.element.setAttribute('aria-label', nextLabel);
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

	/**
	 * Sets up auto-resize behavior for a textarea element.
	 * @returns A function that triggers the resize manually (useful for initial sizing).
	 */
	private setupTextareaAutoResize(textarea: HTMLTextAreaElement): () => void {
		const autoResize = () => {
			textarea.style.height = 'auto';
			textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
			this._onDidChangeHeight.fire();
		};
		this._inputBoxes.add(dom.addDisposableListener(textarea, dom.EventType.INPUT, autoResize));
		return autoResize;
	}

	private renderTextInput(container: HTMLElement, question: IChatQuestion): void {
		const textarea = dom.$<HTMLTextAreaElement>('textarea.chat-question-text-textarea');
		textarea.placeholder = localize('chat.questionCarousel.enterText', 'Enter your answer');
		textarea.rows = 1;
		textarea.setAttribute('aria-label', question.title);

		// Restore previous answer if exists
		const previousAnswer = this._answers.get(question.id);
		if (previousAnswer !== undefined) {
			textarea.value = String(previousAnswer);
		} else if (question.defaultValue !== undefined) {
			textarea.value = String(question.defaultValue);
		}

		// Setup auto-resize behavior
		const autoResize = this.setupTextareaAutoResize(textarea);

		// Handle Enter to submit (Shift+Enter for newline)
		this._inputBoxes.add(dom.addDisposableListener(textarea, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter && !event.shiftKey && textarea.value.trim()) {
				e.preventDefault();
				e.stopPropagation();
				this.handleNext();
			}
		}));

		container.appendChild(textarea);
		this._textInputTextareas.set(question.id, textarea);

		// Focus on input when rendered using proper DOM scheduling
		this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(textarea), () => {
			textarea.focus();
			autoResize();
		}));
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

		// Note: Freeform input is always shown regardless of the `allowFreeformInput` API property.
		// The property is kept for backwards compatibility but is no longer used.
		{
			const freeformContainer = dom.$('.chat-question-freeform');
			const freeformLabelId = `freeform-label-${question.id}`;
			const freeformLabel = dom.$('.chat-question-freeform-label');
			freeformLabel.id = freeformLabelId;
			freeformLabel.textContent = localize('chat.questionCarousel.orEnterOwn', 'Or enter your own:');
			freeformContainer.appendChild(freeformLabel);

			const freeformTextarea = dom.$<HTMLTextAreaElement>('textarea.chat-question-freeform-textarea');
			freeformTextarea.placeholder = localize('chat.questionCarousel.enterCustomAnswer', 'Enter custom answer');
			freeformTextarea.rows = 1;
			freeformTextarea.setAttribute('aria-labelledby', freeformLabelId);

			if (previousFreeform !== undefined) {
				freeformTextarea.value = previousFreeform;
			}

			this._inputBoxes.add(dom.addDisposableListener(freeformTextarea, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				const event = new StandardKeyboardEvent(e);
				if (event.keyCode === KeyCode.Enter && !event.shiftKey && freeformTextarea.value.trim()) {
					e.preventDefault();
					e.stopPropagation();
					this.handleNext();
				}
			}));

			// Setup auto-resize behavior
			const autoResize = this.setupTextareaAutoResize(freeformTextarea);

			// uncheck radio when there is text
			this._inputBoxes.add(dom.addDisposableListener(freeformTextarea, dom.EventType.INPUT, () => {
				if (freeformTextarea.value.trim()) {
					for (const radio of radioInputs) {
						radio.checked = false;
					}
				}
			}));

			freeformContainer.appendChild(freeformTextarea);
			container.appendChild(freeformContainer);
			this._freeformTextareas.set(question.id, freeformTextarea);

			// Resize textarea if it has restored content
			if (previousFreeform !== undefined) {
				this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(freeformTextarea), () => autoResize()));
			}
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

		// Note: Freeform input is always shown regardless of the `allowFreeformInput` API property.
		// The property is kept for backwards compatibility but is no longer used.
		{
			const freeformContainer = dom.$('.chat-question-freeform');
			const freeformLabelId = `freeform-label-${question.id}`;
			const freeformLabel = dom.$('.chat-question-freeform-label');
			freeformLabel.id = freeformLabelId;
			freeformLabel.textContent = localize('chat.questionCarousel.orEnterOwn', 'Or enter your own:');
			freeformContainer.appendChild(freeformLabel);

			const freeformTextarea = dom.$<HTMLTextAreaElement>('textarea.chat-question-freeform-textarea');
			freeformTextarea.placeholder = localize('chat.questionCarousel.enterCustomAnswer', 'Enter custom answer');
			freeformTextarea.rows = 1;
			freeformTextarea.setAttribute('aria-labelledby', freeformLabelId);

			if (previousFreeform !== undefined) {
				freeformTextarea.value = previousFreeform;
			}

			this._inputBoxes.add(dom.addDisposableListener(freeformTextarea, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				const event = new StandardKeyboardEvent(e);
				if (event.keyCode === KeyCode.Enter && !event.shiftKey && freeformTextarea.value.trim()) {
					e.preventDefault();
					e.stopPropagation();
					this.handleNext();
				}
			}));

			// Setup auto-resize behavior
			const autoResize = this.setupTextareaAutoResize(freeformTextarea);

			// For multiSelect, both checkboxes and freeform input are combined, so don't uncheck on input

			freeformContainer.appendChild(freeformTextarea);
			container.appendChild(freeformContainer);
			this._freeformTextareas.set(question.id, freeformTextarea);

			// Resize textarea if it has restored content
			if (previousFreeform !== undefined) {
				this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(freeformTextarea), () => autoResize()));
			}
		}
	}

	private getCurrentAnswer(): unknown {
		const question = this.carousel.questions[this._currentIndex];
		if (!question) {
			return undefined;
		}

		switch (question.type) {
			case 'text': {
				const textarea = this._textInputTextareas.get(question.id);
				return textarea?.value ?? question.defaultValue;
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

				// Note: Freeform input is always shown regardless of the `allowFreeformInput` API property.
				// The property is kept for backwards compatibility but is no longer used.
				// For singleSelect, if freeform value is provided, use only that (ignore selected value).
				const freeformTextarea = this._freeformTextareas.get(question.id);
				const freeformValue = freeformTextarea?.value !== '' ? freeformTextarea?.value : undefined;
				if (freeformValue || selectedValue !== undefined) {
					// if there is text in freeform, don't include selected
					return { selectedValue: freeformValue ? undefined : selectedValue, freeformValue };
				}
				return undefined;
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

				// Note: Freeform input is always shown regardless of the `allowFreeformInput` API property.
				// The property is kept for backwards compatibility but is no longer used.
				// For multiSelect, include both selected values and freeform input together.
				const freeformTextarea = this._freeformTextareas.get(question.id);
				const freeformValue = freeformTextarea?.value !== '' ? freeformTextarea?.value : undefined;
				if (freeformValue || finalSelectedValues.length > 0) {
					return { selectedValues: finalSelectedValues, freeformValue };
				}
				return undefined;
			}

			default:
				return question.defaultValue;
		}
	}

	/**
	 * Renders a "Skipped" message when the carousel is dismissed without answers.
	 */
	private renderSkippedMessage(): void {
		const skippedContainer = dom.$('.chat-question-carousel-summary');
		const skippedMessage = dom.$('.chat-question-summary-skipped');
		skippedMessage.textContent = localize('chat.questionCarousel.skipped', 'Skipped');
		skippedContainer.appendChild(skippedMessage);
		this.domNode.appendChild(skippedContainer);
	}

	/**
	 * Renders a summary of answers when the carousel is already used.
	 */
	private renderSummary(): void {
		// If no answers, show skipped message
		if (this._answers.size === 0) {
			this.renderSkippedMessage();
			return;
		}

		const summaryContainer = dom.$('.chat-question-carousel-summary');

		for (const question of this.carousel.questions) {
			const answer = this._answers.get(question.id);
			if (answer === undefined) {
				continue;
			}

			const summaryItem = dom.$('.chat-question-summary-item');

			const questionLabel = dom.$('.chat-question-summary-label');
			questionLabel.textContent = question.title;
			summaryItem.appendChild(questionLabel);

			const answerValue = dom.$('.chat-question-summary-value');
			answerValue.textContent = this.formatAnswerForSummary(question, answer);
			summaryItem.appendChild(answerValue);

			summaryContainer.appendChild(summaryItem);
		}

		this.domNode.appendChild(summaryContainer);
	}

	/**
	 * Formats an answer for display in the summary.
	 */
	private formatAnswerForSummary(question: IChatQuestion, answer: unknown): string {
		switch (question.type) {
			case 'text':
				return String(answer);

			case 'singleSelect': {
				if (typeof answer === 'object' && answer !== null && hasKey(answer, { selectedValue: true })) {
					const { selectedValue, freeformValue } = answer as { selectedValue?: unknown; freeformValue?: string };
					const selectedLabel = question.options?.find(opt => opt.value === selectedValue)?.label;
					if (freeformValue) {
						return selectedLabel
							? localize('chat.questionCarousel.answerWithFreeform', '{0} ({1})', selectedLabel, freeformValue)
							: freeformValue;
					}
					return selectedLabel ?? String(selectedValue ?? '');
				}
				const label = question.options?.find(opt => opt.value === answer)?.label;
				return label ?? String(answer);
			}

			case 'multiSelect': {
				if (typeof answer === 'object' && answer !== null && hasKey(answer, { selectedValues: true })) {
					const { selectedValues, freeformValue } = answer as { selectedValues?: unknown[]; freeformValue?: string };
					const labels = (selectedValues ?? [])
						.map(v => question.options?.find(opt => opt.value === v)?.label ?? String(v))
						.join(localize('chat.questionCarousel.listSeparator', ', '));
					if (freeformValue) {
						return labels
							? localize('chat.questionCarousel.answerWithFreeform', '{0} ({1})', labels, freeformValue)
							: freeformValue;
					}
					return labels;
				}
				if (Array.isArray(answer)) {
					return answer
						.map(v => question.options?.find(opt => opt.value === v)?.label ?? String(v))
						.join(localize('chat.questionCarousel.listSeparator', ', '));
				}
				return String(answer);
			}

			default:
				return String(answer);
		}
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return other.kind === 'questionCarousel' && other === this.carousel;
	}

	addDisposable(disposable: { dispose(): void }): void {
		this._register(disposable);
	}
}
