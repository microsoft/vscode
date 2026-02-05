/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { getBaseLayerHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { Checkbox } from '../../../../../../base/browser/ui/toggle/toggle.js';
import { IChatQuestion, IChatQuestionCarousel } from '../../../common/chatService/chatService.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatRendererContent, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import './media/chatQuestionCarousel.css';

export interface IChatQuestionCarouselOptions {
	onSubmit: (answers: Map<string, unknown> | undefined) => void;
	shouldAutoFocus?: boolean;
}

export class ChatQuestionCarouselPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private _currentIndex = 0;
	private readonly _answers = new Map<string, unknown>();

	private _questionContainer: HTMLElement | undefined;
	private _closeButtonContainer: HTMLElement | undefined;
	private _footerRow: HTMLElement | undefined;
	private _stepIndicator: HTMLElement | undefined;
	private _navigationButtons: HTMLElement | undefined;
	private _prevButton: Button | undefined;
	private _nextButton: Button | undefined;
	private _skipAllButton: Button | undefined;

	private _isSkipped = false;

	private readonly _textInputBoxes: Map<string, InputBox> = new Map();
	private readonly _singleSelectItems: Map<string, { items: HTMLElement[]; selectedIndex: number }> = new Map();
	private readonly _multiSelectCheckboxes: Map<string, Checkbox[]> = new Map();
	private readonly _freeformTextareas: Map<string, HTMLTextAreaElement> = new Map();
	private readonly _inputBoxes: DisposableStore = this._register(new DisposableStore());

	/**
	 * Disposable store for interactive UI components (header, nav buttons, etc.)
	 * that should be disposed when transitioning to summary view.
	 */
	private readonly _interactiveUIStore: MutableDisposable<DisposableStore> = this._register(new MutableDisposable());

	constructor(
		private readonly carousel: IChatQuestionCarousel,
		context: IChatContentPartRenderContext,
		private readonly _options: IChatQuestionCarouselOptions,
	) {
		super();

		this.domNode = dom.$('.chat-question-carousel-container');

		// Restore answers from carousel data if already submitted (e.g., after re-render due to virtualization)
		if (carousel.data) {
			for (const [key, value] of Object.entries(carousel.data)) {
				this._answers.set(key, value);
			}
		}

		// If carousel was already used OR the response is complete, show summary of answers
		// When response is complete, the carousel can no longer be interacted with
		const responseIsComplete = isResponseVM(context.element) && context.element.isComplete;
		if (carousel.isUsed || responseIsComplete) {
			this._isSkipped = true;
			this.domNode.classList.add('chat-question-carousel-used');
			this.renderSummary();
			return;
		}

		// Create disposable store for interactive UI components
		const interactiveStore = new DisposableStore();
		this._interactiveUIStore.value = interactiveStore;

		// Question container
		this._questionContainer = dom.$('.chat-question-carousel-content');
		this.domNode.append(this._questionContainer);

		// Close/skip button (X) - placed in header row, only shown when allowSkip is true
		if (carousel.allowSkip) {
			this._closeButtonContainer = dom.$('.chat-question-close-container');
			const skipAllTitle = localize('chat.questionCarousel.skipAllTitle', 'Skip all questions');
			const skipAllButton = interactiveStore.add(new Button(this._closeButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: skipAllTitle }));
			skipAllButton.label = `$(${Codicon.close.id})`;
			skipAllButton.element.classList.add('chat-question-nav-arrow', 'chat-question-close');
			skipAllButton.element.setAttribute('aria-label', skipAllTitle);
			this._skipAllButton = skipAllButton;
		}

		// Footer row with step indicator and navigation buttons
		this._footerRow = dom.$('.chat-question-footer-row');

		// Step indicator (e.g., "2/4") on the left
		this._stepIndicator = dom.$('.chat-question-step-indicator');
		this._footerRow.appendChild(this._stepIndicator);

		// Navigation controls (< >) - placed in footer row
		this._navigationButtons = dom.$('.chat-question-carousel-nav');
		this._navigationButtons.setAttribute('role', 'navigation');
		this._navigationButtons.setAttribute('aria-label', localize('chat.questionCarousel.navigation', 'Question navigation'));

		// Group prev/next buttons together
		const arrowsContainer = dom.$('.chat-question-nav-arrows');

		const previousLabel = localize('previous', 'Previous');
		const prevButton = interactiveStore.add(new Button(arrowsContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: previousLabel }));
		prevButton.element.classList.add('chat-question-nav-arrow', 'chat-question-nav-prev');
		prevButton.label = `$(${Codicon.chevronLeft.id})`;
		prevButton.element.setAttribute('aria-label', previousLabel);
		this._prevButton = prevButton;

		const nextLabel = localize('next', 'Next');
		const nextButton = interactiveStore.add(new Button(arrowsContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: nextLabel }));
		nextButton.element.classList.add('chat-question-nav-arrow', 'chat-question-nav-next');
		nextButton.label = `$(${Codicon.chevronRight.id})`;
		this._nextButton = nextButton;

		this._navigationButtons.appendChild(arrowsContainer);
		this._footerRow.appendChild(this._navigationButtons);
		this.domNode.append(this._footerRow);


		// Register event listeners
		interactiveStore.add(prevButton.onDidClick(() => this.navigate(-1)));
		interactiveStore.add(nextButton.onDidClick(() => this.handleNext()));
		if (this._skipAllButton) {
			interactiveStore.add(this._skipAllButton.onDidClick(() => this.ignore()));
		}

		// Register keyboard navigation - handle Enter on text inputs and freeform textareas
		interactiveStore.add(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Escape && this.carousel.allowSkip) {
				e.preventDefault();
				e.stopPropagation();
				this.ignore();
			} else if (event.keyCode === KeyCode.Enter && !event.shiftKey) {
				// Handle Enter key for text inputs and freeform textareas, not radio/checkbox or buttons
				// Buttons have their own Enter/Space handling via Button class
				const target = e.target as HTMLElement;
				const isTextInput = target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text';
				const isFreeformTextarea = target.tagName === 'TEXTAREA' && target.classList.contains('chat-question-freeform-textarea');
				if (isTextInput || isFreeformTextarea) {
					e.preventDefault();
					e.stopPropagation();
					this.handleNext();
				}
			} else if ((event.ctrlKey || event.metaKey) && (event.keyCode === KeyCode.Backspace || event.keyCode === KeyCode.Delete)) {
				e.stopPropagation();
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
		this._textInputBoxes.clear();
		this._singleSelectItems.clear();
		this._multiSelectCheckboxes.clear();
		this._freeformTextareas.clear();

		// Clear references to disposed elements
		this._prevButton = undefined;
		this._nextButton = undefined;
		this._skipAllButton = undefined;
		this._questionContainer = undefined;
		this._navigationButtons = undefined;
		this._closeButtonContainer = undefined;
		this._footerRow = undefined;
		this._stepIndicator = undefined;
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

				// Always return structured format for single-select (freeform is always shown)
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

				// Always return structured format for multi-select (freeform is always shown)
				return selectedValues.length > 0 ? { selectedValues, freeformValue: undefined } : undefined;
			}

			default:
				return question.defaultValue;
		}
	}

	private renderCurrentQuestion(): void {
		if (!this._questionContainer || !this._prevButton || !this._nextButton) {
			return;
		}

		// Clear previous input boxes and stale references
		this._inputBoxes.clear();
		this._textInputBoxes.clear();
		this._singleSelectItems.clear();
		this._multiSelectCheckboxes.clear();
		this._freeformTextareas.clear();

		// Clear previous content
		dom.clearNode(this._questionContainer);

		const question = this.carousel.questions[this._currentIndex];
		if (!question) {
			return;
		}

		// Render question header row with title and close button
		const headerRow = dom.$('.chat-question-header-row');

		// Render question message with title styling (no progress prefix)
		// Fall back to question.title if message is not provided
		const questionText = question.message ?? question.title;
		if (questionText) {
			const title = dom.$('.chat-question-title');
			const messageContent = typeof questionText === 'string'
				? questionText
				: questionText.value;

			title.setAttribute('aria-label', messageContent);

			// Check for subtitle in parentheses at the end
			const parenMatch = messageContent.match(/^(.+?)\s*(\([^)]+\))\s*$/);
			if (parenMatch) {
				// Main title (bold)
				const mainTitle = dom.$('span.chat-question-title-main');
				mainTitle.textContent = parenMatch[1];
				title.appendChild(mainTitle);

				// Subtitle in parentheses (normal weight)
				const subtitle = dom.$('span.chat-question-title-subtitle');
				subtitle.textContent = ' ' + parenMatch[2];
				title.appendChild(subtitle);
			} else {
				title.textContent = messageContent;
			}
			headerRow.appendChild(title);
		}

		// Add close button to header row (if allowSkip is enabled)
		if (this._closeButtonContainer) {
			headerRow.appendChild(this._closeButtonContainer);
		}

		this._questionContainer.appendChild(headerRow);

		const isSingleQuestion = this.carousel.questions.length === 1;
		// Update step indicator in footer
		if (this._stepIndicator) {
			this._stepIndicator.textContent = `${this._currentIndex + 1}/${this.carousel.questions.length}`;
			this._stepIndicator.style.display = isSingleQuestion ? 'none' : '';
		}

		// Render input based on question type
		const inputContainer = dom.$('.chat-question-input-container');
		this.renderInput(inputContainer, question);
		this._questionContainer.appendChild(inputContainer);

		// Update navigation button states (prevButton and nextButton are guaranteed non-null from guard above)
		this._prevButton!.enabled = this._currentIndex > 0;
		this._prevButton!.element.style.display = isSingleQuestion ? 'none' : '';

		// Update next button icon/label for last question
		const isLastQuestion = this._currentIndex === this.carousel.questions.length - 1;
		const submitLabel = localize('submit', 'Submit');
		const nextLabel = localize('next', 'Next');
		if (isLastQuestion) {
			this._nextButton!.label = submitLabel;
			this._nextButton!.element.title = submitLabel;
			this._nextButton!.element.setAttribute('aria-label', submitLabel);
			// Switch to primary style for submit
			this._nextButton!.element.classList.add('chat-question-nav-submit');
		} else {
			this._nextButton!.label = `$(${Codicon.chevronRight.id})`;
			this._nextButton!.element.title = nextLabel;
			this._nextButton!.element.setAttribute('aria-label', nextLabel);
			// Keep secondary style for next
			this._nextButton!.element.classList.remove('chat-question-nav-submit');
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
		if (this._options.shouldAutoFocus !== false) {
			this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(inputBox.element), () => inputBox.focus()));
		}
	}

	private renderSingleSelect(container: HTMLElement, question: IChatQuestion): void {
		const options = question.options || [];
		const selectContainer = dom.$('.chat-question-list');
		selectContainer.setAttribute('role', 'listbox');
		selectContainer.setAttribute('aria-label', question.title);
		selectContainer.tabIndex = 0;
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

		// Determine initially selected index
		let selectedIndex = -1;
		options.forEach((option, index) => {
			if (previousSelectedValue !== undefined && option.value === previousSelectedValue) {
				selectedIndex = index;
			} else if (selectedIndex === -1 && defaultOptionId !== undefined && option.id === defaultOptionId) {
				selectedIndex = index;
			}
		});

		const listItems: HTMLElement[] = [];
		const indicators: HTMLElement[] = [];
		const updateSelection = (newIndex: number) => {
			// Update visual state
			listItems.forEach((item, i) => {
				const isSelected = i === newIndex;
				item.classList.toggle('selected', isSelected);
				item.setAttribute('aria-selected', String(isSelected));
				const indicator = indicators[i];
				indicator.classList.toggle('codicon', isSelected);
				indicator.classList.toggle('codicon-check', isSelected);
			});
			// Update aria-activedescendant for screen reader announcements
			if (newIndex >= 0 && newIndex < listItems.length) {
				selectContainer.setAttribute('aria-activedescendant', listItems[newIndex].id);
			}
			// Update tracked state
			const data = this._singleSelectItems.get(question.id);
			if (data) {
				data.selectedIndex = newIndex;
			}
		};

		options.forEach((option, index) => {
			const isSelected = index === selectedIndex;
			const listItem = dom.$('.chat-question-list-item');
			listItem.setAttribute('role', 'option');
			listItem.setAttribute('aria-selected', String(isSelected));
			listItem.setAttribute('aria-label', localize('chat.questionCarousel.optionLabel', "Option {0}: {1}", index + 1, option.label));
			listItem.id = `option-${question.id}-${index}`;
			listItem.tabIndex = -1;

			const number = dom.$('.chat-question-list-number');
			number.textContent = `${index + 1}`;
			listItem.appendChild(number);

			// Selection indicator (checkmark when selected)
			const indicator = dom.$('.chat-question-list-indicator');
			if (isSelected) {
				indicator.classList.add('codicon', 'codicon-check');
			}
			indicators.push(indicator);

			// Label with optional description (format: "Title - Description")
			const label = dom.$('.chat-question-list-label');
			const separatorIndex = option.label.indexOf(' - ');
			if (separatorIndex !== -1) {
				const titleSpan = dom.$('span.chat-question-list-label-title');
				titleSpan.textContent = option.label.substring(0, separatorIndex);
				label.appendChild(titleSpan);

				const descSpan = dom.$('span.chat-question-list-label-desc');
				descSpan.textContent = ': ' + option.label.substring(separatorIndex + 3);
				label.appendChild(descSpan);
			} else {
				label.textContent = option.label;
			}
			listItem.appendChild(label);
			listItem.appendChild(indicator);

			if (isSelected) {
				listItem.classList.add('selected');
			}

			this._inputBoxes.add(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), listItem, option.label));

			// Click handler
			this._inputBoxes.add(dom.addDisposableListener(listItem, dom.EventType.CLICK, (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				updateSelection(index);
			}));

			selectContainer.appendChild(listItem);
			listItems.push(listItem);
		});

		this._singleSelectItems.set(question.id, { items: listItems, selectedIndex });

		// Set initial aria-activedescendant if there's a selected item
		if (selectedIndex >= 0 && selectedIndex < listItems.length) {
			selectContainer.setAttribute('aria-activedescendant', listItems[selectedIndex].id);
		}

		// Always show freeform input for single-select questions
		const freeformContainer = dom.$('.chat-question-freeform');

		const freeformNumber = dom.$('.chat-question-freeform-number');
		freeformNumber.textContent = `${options.length + 1}`;
		freeformContainer.appendChild(freeformNumber);

		const freeformTextarea = dom.$<HTMLTextAreaElement>('textarea.chat-question-freeform-textarea');
		freeformTextarea.placeholder = localize('chat.questionCarousel.enterCustomAnswer', 'Enter custom answer');
		freeformTextarea.rows = 1;

		if (previousFreeform !== undefined) {
			freeformTextarea.value = previousFreeform;
		}

		// Setup auto-resize behavior
		const autoResize = this.setupTextareaAutoResize(freeformTextarea);

		// clear when we start typing in freeform
		this._inputBoxes.add(dom.addDisposableListener(freeformTextarea, dom.EventType.INPUT, () => {
			if (freeformTextarea.value.length > 0) {
				updateSelection(-1);
			}
		}));

		freeformContainer.appendChild(freeformTextarea);
		container.appendChild(freeformContainer);
		this._freeformTextareas.set(question.id, freeformTextarea);

		// Keyboard navigation for the list
		this._inputBoxes.add(dom.addDisposableListener(selectContainer, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			const data = this._singleSelectItems.get(question.id);
			if (!data || !listItems.length) {
				return;
			}
			let newIndex = data.selectedIndex;

			if (event.keyCode === KeyCode.DownArrow) {
				e.preventDefault();
				newIndex = Math.min(data.selectedIndex + 1, listItems.length - 1);
			} else if (event.keyCode === KeyCode.UpArrow) {
				e.preventDefault();
				newIndex = Math.max(data.selectedIndex - 1, 0);
			} else if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
				// Enter confirms current selection and advances to next question
				e.preventDefault();
				e.stopPropagation();
				this.handleNext();
				return;
			} else if (event.keyCode >= KeyCode.Digit1 && event.keyCode <= KeyCode.Digit9) {
				// Number keys 1-9 select the corresponding option, or focus freeform for next number
				const numberIndex = event.keyCode - KeyCode.Digit1;
				if (numberIndex < listItems.length) {
					e.preventDefault();
					updateSelection(numberIndex);
				} else if (numberIndex === listItems.length) {
					e.preventDefault();
					updateSelection(-1);
					freeformTextarea.focus();
				}
				return;
			}

			if (newIndex !== data.selectedIndex && newIndex >= 0) {
				updateSelection(newIndex);
			}
		}));

		// Resize textarea if it has restored content
		if (previousFreeform !== undefined) {
			this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(freeformTextarea), () => autoResize()));
		}

		// focus on the row when first rendered
		if (this._options.shouldAutoFocus !== false && listItems.length > 0) {
			const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;
			// if no default, select the first answer
			if (selectedIndex < 0) {
				updateSelection(0);
			}
			this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(selectContainer), () => {
				listItems[focusIndex]?.focus();
			}));
		}
	}

	private renderMultiSelect(container: HTMLElement, question: IChatQuestion): void {
		const options = question.options || [];
		const selectContainer = dom.$('.chat-question-list');
		selectContainer.setAttribute('role', 'listbox');
		selectContainer.setAttribute('aria-multiselectable', 'true');
		selectContainer.setAttribute('aria-label', question.title);
		selectContainer.tabIndex = 0;
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

		const checkboxes: Checkbox[] = [];
		const listItems: HTMLElement[] = [];
		let focusedIndex = 0;
		let firstCheckedIndex = -1;

		options.forEach((option, index) => {
			// Determine initial checked state
			let isChecked = false;
			if (previousSelectedValues && previousSelectedValues.length > 0) {
				isChecked = previousSelectedValues.includes(option.value);
			} else if (defaultOptionIds.includes(option.id)) {
				isChecked = true;
			}

			const listItem = dom.$('.chat-question-list-item.multi-select');
			listItem.setAttribute('role', 'option');
			listItem.setAttribute('aria-selected', String(isChecked));
			listItem.setAttribute('aria-label', localize('chat.questionCarousel.optionLabel', "Option {0}: {1}", index + 1, option.label));
			listItem.id = `option-${question.id}-${index}`;
			listItem.tabIndex = -1;

			const number = dom.$('.chat-question-list-number');
			number.textContent = `${index + 1}`;
			listItem.appendChild(number);

			// Create checkbox using the VS Code Checkbox component
			const checkbox = this._inputBoxes.add(new Checkbox(option.label, isChecked, defaultCheckboxStyles));
			checkbox.domNode.classList.add('chat-question-list-checkbox');
			// Remove checkbox from tab order since list items are navigable with arrow keys
			checkbox.domNode.tabIndex = -1;
			listItem.appendChild(checkbox.domNode);

			// Label with optional description (format: "Title - Description")
			const label = dom.$('.chat-question-list-label');
			const separatorIndex = option.label.indexOf(' - ');
			if (separatorIndex !== -1) {
				const titleSpan = dom.$('span.chat-question-list-label-title');
				titleSpan.textContent = option.label.substring(0, separatorIndex);
				label.appendChild(titleSpan);

				const descSpan = dom.$('span.chat-question-list-label-desc');
				descSpan.textContent = ': ' + option.label.substring(separatorIndex + 3);
				label.appendChild(descSpan);
			} else {
				label.textContent = option.label;
			}
			listItem.appendChild(label);

			if (isChecked) {
				listItem.classList.add('checked');
				if (firstCheckedIndex === -1) {
					firstCheckedIndex = index;
				}
			}

			// Sync checkbox state with list item visual state
			this._inputBoxes.add(checkbox.onChange(() => {
				listItem.classList.toggle('checked', checkbox.checked);
				listItem.setAttribute('aria-selected', String(checkbox.checked));
			}));

			// Click handler for the entire row (toggle checkbox)
			this._inputBoxes.add(dom.addDisposableListener(listItem, dom.EventType.CLICK, (e: MouseEvent) => {
				// Update focusedIndex when clicking a row
				focusedIndex = index;
				// Don't toggle if the click was on the checkbox itself (it handles itself)
				if (e.target !== checkbox.domNode && !checkbox.domNode.contains(e.target as Node)) {
					// Use click() to trigger onChange and sync visual state
					checkbox.domNode.click();
				}
			}));

			this._inputBoxes.add(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), listItem, option.label));

			selectContainer.appendChild(listItem);
			checkboxes.push(checkbox);
			listItems.push(listItem);
		});

		this._multiSelectCheckboxes.set(question.id, checkboxes);

		// Always show freeform input for multi-select questions
		const freeformContainer = dom.$('.chat-question-freeform');

		// Number indicator for freeform (comes after all options)
		const freeformNumber = dom.$('.chat-question-freeform-number');
		freeformNumber.textContent = `${options.length + 1}`;
		freeformContainer.appendChild(freeformNumber);

		const freeformTextarea = dom.$<HTMLTextAreaElement>('textarea.chat-question-freeform-textarea');
		freeformTextarea.placeholder = localize('chat.questionCarousel.enterCustomAnswer', 'Enter custom answer');
		freeformTextarea.rows = 1;

		if (previousFreeform !== undefined) {
			freeformTextarea.value = previousFreeform;
		}

		// Setup auto-resize behavior
		const autoResize = this.setupTextareaAutoResize(freeformTextarea);

		freeformContainer.appendChild(freeformTextarea);
		container.appendChild(freeformContainer);
		this._freeformTextareas.set(question.id, freeformTextarea);

		// Keyboard navigation for the list
		this._inputBoxes.add(dom.addDisposableListener(selectContainer, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			// Guard against empty list
			if (!listItems.length) {
				return;
			}

			if (event.keyCode === KeyCode.DownArrow) {
				e.preventDefault();
				focusedIndex = Math.min(focusedIndex + 1, listItems.length - 1);
				listItems[focusedIndex].focus();
			} else if (event.keyCode === KeyCode.UpArrow) {
				e.preventDefault();
				focusedIndex = Math.max(focusedIndex - 1, 0);
				listItems[focusedIndex].focus();
			} else if (event.keyCode === KeyCode.Enter) {
				e.preventDefault();
				e.stopPropagation();
				this.handleNext();
			} else if (event.keyCode === KeyCode.Space) {
				e.preventDefault();
				// Toggle the currently focused checkbox using click() to trigger onChange
				if (focusedIndex >= 0 && focusedIndex < checkboxes.length) {
					checkboxes[focusedIndex].domNode.click();
				}
			} else if (event.keyCode >= KeyCode.Digit1 && event.keyCode <= KeyCode.Digit9) {
				// Number keys 1-9 toggle the corresponding checkbox, or focus freeform for next number
				const numberIndex = event.keyCode - KeyCode.Digit1;
				if (numberIndex < checkboxes.length) {
					e.preventDefault();
					checkboxes[numberIndex].domNode.click();
				} else if (numberIndex === checkboxes.length) {
					e.preventDefault();
					freeformTextarea.focus();
				}
			}
		}));

		// Resize textarea if it has restored content
		if (previousFreeform !== undefined) {
			this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(freeformTextarea), () => autoResize()));
		}

		// Focus on the appropriate row when rendered (first checked row, or first row if none)
		if (this._options.shouldAutoFocus !== false && listItems.length > 0) {
			const initialFocusIndex = firstCheckedIndex >= 0 ? firstCheckedIndex : 0;
			focusedIndex = initialFocusIndex;
			this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(selectContainer), () => {
				listItems[initialFocusIndex]?.focus();
			}));
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
				const data = this._singleSelectItems.get(question.id);
				let selectedValue: unknown = undefined;
				if (data && data.selectedIndex >= 0) {
					selectedValue = question.options?.[data.selectedIndex]?.value;
				}
				// Find default option if nothing selected (defaultValue is the option id)
				if (selectedValue === undefined && typeof question.defaultValue === 'string') {
					const defaultOption = question.options?.find(opt => opt.id === question.defaultValue);
					selectedValue = defaultOption?.value;
				}

				// For single-select: if freeform is provided, use ONLY freeform (ignore selection)
				const freeformTextarea = this._freeformTextareas.get(question.id);
				const freeformValue = freeformTextarea?.value !== '' ? freeformTextarea?.value : undefined;
				if (freeformValue) {
					// Freeform takes priority - ignore selectedValue
					return { selectedValue: undefined, freeformValue };
				}
				if (selectedValue !== undefined) {
					return { selectedValue, freeformValue: undefined };
				}
				return undefined;
			}

			case 'multiSelect': {
				const checkboxes = this._multiSelectCheckboxes.get(question.id);
				const selectedValues: unknown[] = [];
				if (checkboxes) {
					checkboxes.forEach((checkbox, index) => {
						if (checkbox.checked) {
							const value = question.options?.[index]?.value;
							if (value !== undefined) {
								selectedValues.push(value);
							}
						}
					});
				}

				// Always include freeform value for multi-select questions
				const freeformTextarea = this._freeformTextareas.get(question.id);
				const freeformValue = freeformTextarea?.value !== '' ? freeformTextarea?.value : undefined;

				// Only include defaults if nothing selected AND no freeform input
				let finalSelectedValues = selectedValues;
				if (selectedValues.length === 0 && !freeformValue && question.defaultValue !== undefined) {
					const defaultIds = Array.isArray(question.defaultValue)
						? question.defaultValue
						: [question.defaultValue];
					const defaultValues = question.options
						?.filter(opt => defaultIds.includes(opt.id))
						.map(opt => opt.value);
					finalSelectedValues = defaultValues?.filter(v => v !== undefined) || [];
				}

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

			// Category label (use same text as shown in question UI: message ?? title)
			const questionLabel = dom.$('span.chat-question-summary-label');
			const questionText = question.message ?? question.title;
			let labelText = typeof questionText === 'string' ? questionText : questionText.value;
			// Remove trailing colons and whitespace to avoid double colons (CSS adds ': ')
			labelText = labelText.replace(/[:\s]+$/, '');
			questionLabel.textContent = labelText;
			summaryItem.appendChild(questionLabel);

			// Format answer with title and description parts
			const formattedAnswer = this.formatAnswerForSummary(question, answer);
			const separatorIndex = formattedAnswer.indexOf(' - ');

			if (separatorIndex !== -1) {
				// Answer title (bold)
				const answerTitle = dom.$('span.chat-question-summary-answer-title');
				answerTitle.textContent = formattedAnswer.substring(0, separatorIndex);
				summaryItem.appendChild(answerTitle);

				// Answer description (normal)
				const answerDesc = dom.$('span.chat-question-summary-answer-desc');
				answerDesc.textContent = ' - ' + formattedAnswer.substring(separatorIndex + 3);
				summaryItem.appendChild(answerDesc);
			} else {
				// Just the answer value (bold)
				const answerValue = dom.$('span.chat-question-summary-answer-title');
				answerValue.textContent = formattedAnswer;
				summaryItem.appendChild(answerValue);
			}

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
					// For singleSelect, freeform takes priority over selection
					if (freeformValue) {
						return freeformValue;
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
						.map(v => question.options?.find(opt => opt.value === v)?.label ?? String(v));
					// For multiSelect, combine selections and freeform with comma separator
					if (freeformValue) {
						labels.push(freeformValue);
					}
					return labels.join(localize('chat.questionCarousel.listSeparator', ', '));
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

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		// does not have same content when it is not skipped and is active and we stop the response
		if (!this._isSkipped && !this.carousel.isUsed && isResponseVM(element) && element.isComplete) {
			return false;
		}
		return other.kind === 'questionCarousel' && other === this.carousel;
	}

	addDisposable(disposable: { dispose(): void }): void {
		this._register(disposable);
	}
}
