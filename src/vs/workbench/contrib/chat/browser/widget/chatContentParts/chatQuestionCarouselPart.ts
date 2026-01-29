/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { Checkbox } from '../../../../../../base/browser/ui/toggle/toggle.js';
import { IChatQuestion, IChatQuestionCarousel } from '../../../common/chatService/chatService.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
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

	private _questionContainer: HTMLElement | undefined;
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
		_context: IChatContentPartRenderContext,
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

		// Question container
		this._questionContainer = dom.$('.chat-question-carousel-content');
		this.domNode.append(this._questionContainer);

		// Navigation controls (< > X) - will be placed in header row with question
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

		// Close/skip button (X) - only shown when allowSkip is true
		if (carousel.allowSkip) {
			const skipAllTitle = localize('chat.questionCarousel.skipAllTitle', 'Skip all questions');
			const skipAllButton = interactiveStore.add(new Button(this._navigationButtons, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: skipAllTitle }));
			skipAllButton.label = `$(${Codicon.close.id})`;
			skipAllButton.element.classList.add('chat-question-nav-arrow', 'chat-question-close');
			skipAllButton.element.setAttribute('aria-label', skipAllTitle);
			this._skipAllButton = skipAllButton;
		}


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

		// Render question header row with navigation and title
		const headerRow = dom.$('.chat-question-header-row');

		// Render question message with title styling, prefixed with progress indicator
		if (question.message) {
			const title = dom.$('.chat-question-title');
			const messageContent = typeof question.message === 'string'
				? question.message
				: question.message.value;
			const progressPrefix = localize('chat.questionCarousel.progressPrefix', '({0}/{1}) ', this._currentIndex + 1, this.carousel.questions.length);
			title.textContent = progressPrefix + messageContent;
			headerRow.appendChild(title);
		}

		// Add navigation buttons to header row
		if (this._navigationButtons) {
			headerRow.appendChild(this._navigationButtons);
		}

		this._questionContainer.appendChild(headerRow);

		// Render input based on question type
		const inputContainer = dom.$('.chat-question-input-container');
		this.renderInput(inputContainer, question);
		this._questionContainer.appendChild(inputContainer);

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
			listItem.id = `option-${question.id}-${index}`;
			listItem.tabIndex = -1;

			// Selection indicator (checkmark when selected)
			const indicator = dom.$('.chat-question-list-indicator');
			if (isSelected) {
				indicator.classList.add('codicon', 'codicon-check');
			}
			listItem.appendChild(indicator);
			indicators.push(indicator);

			// Label
			const label = dom.$('.chat-question-list-label');
			label.textContent = option.label;
			listItem.appendChild(label);

			if (isSelected) {
				listItem.classList.add('selected');
			}

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

		// Keyboard navigation for the list
		this._inputBoxes.add(dom.addDisposableListener(selectContainer, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			const data = this._singleSelectItems.get(question.id);
			if (!data) {
				return;
			}
			let newIndex = data.selectedIndex;

			if (event.keyCode === KeyCode.DownArrow) {
				e.preventDefault();
				newIndex = Math.min(data.selectedIndex + 1, listItems.length - 1);
			} else if (event.keyCode === KeyCode.UpArrow) {
				e.preventDefault();
				newIndex = Math.max(data.selectedIndex - 1, 0);
			} else if (event.keyCode === KeyCode.Space || event.keyCode === KeyCode.Enter) {
				// Space/Enter confirms current selection (already selected, nothing extra to do)
				e.preventDefault();
				return;
			}

			if (newIndex !== data.selectedIndex && newIndex >= 0) {
				updateSelection(newIndex);
			}
		}));

		// Add freeform input if allowed
		if (question.allowFreeformInput) {
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
			listItem.id = `option-${question.id}-${index}`;
			listItem.tabIndex = -1;

			// Create checkbox using the VS Code Checkbox component
			const checkbox = this._inputBoxes.add(new Checkbox(option.label, isChecked, defaultCheckboxStyles));
			checkbox.domNode.classList.add('chat-question-list-checkbox');
			// Remove checkbox from tab order since list items are navigable with arrow keys
			checkbox.domNode.tabIndex = -1;
			listItem.appendChild(checkbox.domNode);

			// Label
			const label = dom.$('.chat-question-list-label');
			label.textContent = option.label;
			listItem.appendChild(label);

			if (isChecked) {
				listItem.classList.add('checked');
			}

			// Sync checkbox state with list item visual state
			this._inputBoxes.add(checkbox.onChange(() => {
				listItem.classList.toggle('checked', checkbox.checked);
				listItem.setAttribute('aria-selected', String(checkbox.checked));
			}));

			// Click handler for the entire row (toggle checkbox)
			this._inputBoxes.add(dom.addDisposableListener(listItem, dom.EventType.CLICK, (e: MouseEvent) => {
				// Don't toggle if the click was on the checkbox itself (it handles itself)
				if (e.target !== checkbox.domNode && !checkbox.domNode.contains(e.target as Node)) {
					checkbox.checked = !checkbox.checked;
				}
			}));

			selectContainer.appendChild(listItem);
			checkboxes.push(checkbox);
			listItems.push(listItem);
		});

		this._multiSelectCheckboxes.set(question.id, checkboxes);

		// Keyboard navigation for the list
		this._inputBoxes.add(dom.addDisposableListener(selectContainer, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			if (event.keyCode === KeyCode.DownArrow) {
				e.preventDefault();
				focusedIndex = Math.min(focusedIndex + 1, listItems.length - 1);
				listItems[focusedIndex].focus();
			} else if (event.keyCode === KeyCode.UpArrow) {
				e.preventDefault();
				focusedIndex = Math.max(focusedIndex - 1, 0);
				listItems[focusedIndex].focus();
			} else if (event.keyCode === KeyCode.Space) {
				e.preventDefault();
				// Toggle the currently focused checkbox
				if (focusedIndex >= 0 && focusedIndex < checkboxes.length) {
					checkboxes[focusedIndex].checked = !checkboxes[focusedIndex].checked;
				}
			}
		}));

		// Add freeform input if allowed
		if (question.allowFreeformInput) {
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

			// uncheck checkboxes when there is text
			this._inputBoxes.add(dom.addDisposableListener(freeformTextarea, dom.EventType.INPUT, () => {
				if (freeformTextarea.value.trim()) {
					for (const checkbox of checkboxInputs) {
						checkbox.checked = false;
					}
				}
			}));

			freeformContainer.appendChild(freeformTextarea);
			container.appendChild(freeformContainer);
			this._freeformTextareas.set(question.id, freeformTextarea);
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

				// Include freeform value if allowed
				if (question.allowFreeformInput) {
					const freeformTextarea = this._freeformTextareas.get(question.id);
					const freeformValue = freeformTextarea?.value !== '' ? freeformTextarea?.value : undefined;
					if (freeformValue || selectedValue !== undefined) {
						// if there is text in freeform, don't include selected
						return { selectedValue: freeformValue ? undefined : selectedValue, freeformValue };
					}
					return undefined;
				}

				return selectedValue;
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
					const freeformTextarea = this._freeformTextareas.get(question.id);
					const freeformValue = freeformTextarea?.value !== '' ? freeformTextarea?.value : undefined;
					if (freeformValue || finalSelectedValues.length > 0) {
						// if there is text in freeform, don't include selected
						return { selectedValues: freeformValue ? [] : finalSelectedValues, freeformValue };
					}
					return undefined;
				}

				return finalSelectedValues;
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
