/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString, isMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../../base/common/platform.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { Checkbox } from '../../../../../../base/browser/ui/toggle/toggle.js';
import { IChatQuestion, IChatQuestionCarousel } from '../../../common/chatService/chatService.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatRendererContent, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { HoverPosition } from '../../../../../../base/browser/ui/hover/hoverWidget.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
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
	private readonly _explicitlyAnsweredQuestionIds = new Set<string>();

	private _questionContainer: HTMLElement | undefined;
	private _closeButtonContainer: HTMLElement | undefined;
	private _tabBar: HTMLElement | undefined;
	private _tabItems: HTMLElement[] = [];
	private readonly _questionTabIndicators = new Map<string, HTMLElement>();
	private _reviewIndex = -1;
	private _footerRow: HTMLElement | undefined;
	private _skipAllButton: Button | undefined;

	private _isSkipped = false;

	private readonly _textInputBoxes: Map<string, InputBox> = new Map();
	private readonly _singleSelectItems: Map<string, { items: HTMLElement[]; selectedIndex: number }> = new Map();
	private readonly _multiSelectCheckboxes: Map<string, Checkbox[]> = new Map();
	private readonly _freeformTextareas: Map<string, HTMLTextAreaElement> = new Map();
	private readonly _inputBoxes: DisposableStore = this._register(new DisposableStore());
	private readonly _questionRenderStore = this._register(new MutableDisposable<DisposableStore>());

	/**
	 * Disposable store for interactive UI components (header, nav buttons, etc.)
	 * that should be disposed when transitioning to summary view.
	 */
	private readonly _interactiveUIStore: MutableDisposable<DisposableStore> = this._register(new MutableDisposable());
	private readonly _inChatQuestionCarouselContextKey: IContextKey<boolean>;

	constructor(
		public readonly carousel: IChatQuestionCarousel,
		context: IChatContentPartRenderContext,
		private readonly _options: IChatQuestionCarouselOptions,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();

		this.domNode = dom.$('.chat-question-carousel-container');
		this._inChatQuestionCarouselContextKey = ChatContextKeys.inChatQuestionCarousel.bindTo(this._contextKeyService);
		const focusTracker = this._register(dom.trackFocus(this.domNode));
		this._register(focusTracker.onDidFocus(() => this._inChatQuestionCarouselContextKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this._inChatQuestionCarouselContextKey.set(false)));
		this._register({ dispose: () => this._inChatQuestionCarouselContextKey.reset() });

		// Set up accessibility attributes for the carousel container
		this.domNode.tabIndex = 0;
		this.domNode.setAttribute('role', 'region');
		this.domNode.setAttribute('aria-roledescription', localize('chat.questionCarousel.roleDescription', 'chat question'));
		this._updateAriaLabel();

		// Restore draft state from transient runtime fields when available.
		if (carousel instanceof ChatQuestionCarouselData) {
			if (typeof carousel.draftCurrentIndex === 'number') {
				this._currentIndex = Math.max(0, Math.min(carousel.draftCurrentIndex, carousel.questions.length - 1));
			}

			if (carousel.draftAnswers) {
				for (const [key, value] of Object.entries(carousel.draftAnswers)) {
					this._answers.set(key, value);
				}
			}
		}

		// Restore submitted answers for summary rendering.
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
		const questionPanelId = `question-panel-${this.carousel.questions[0]?.id ?? 'default'}`;
		this._questionContainer = dom.$('.chat-question-carousel-content');
		this._questionContainer.setAttribute('role', 'tabpanel');
		this._questionContainer.id = questionPanelId;
		this.domNode.append(this._questionContainer);

		// Close/skip button (X) - placed in header row, only shown when allowSkip is true
		if (carousel.allowSkip) {
			this._closeButtonContainer = dom.$('.chat-question-close-container');
			const skipAllTitle = localize('chat.questionCarousel.skipAllTitle', 'Skip all questions');
			const skipAllButton = interactiveStore.add(new Button(this._closeButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
			skipAllButton.label = `$(${Codicon.close.id})`;
			skipAllButton.element.classList.add('chat-question-nav-arrow', 'chat-question-close');
			skipAllButton.element.setAttribute('aria-label', skipAllTitle);
			interactiveStore.add(this._hoverService.setupDelayedHover(skipAllButton.element, { content: skipAllTitle }));
			this._skipAllButton = skipAllButton;
		}

		const isSingleQuestion = this.carousel.questions.length === 1;

		if (!isSingleQuestion) {
			this._reviewIndex = this.carousel.questions.length;

			// Multi-question: Create tab bar with question tabs and Review tab
			this._tabBar = dom.$('.chat-question-tab-bar');
			const tabList = dom.$('.chat-question-tabs');
			tabList.setAttribute('role', 'tablist');
			tabList.setAttribute('aria-label', localize('chat.questionCarousel.tabBarLabel', 'Questions'));
			this._tabBar.appendChild(tabList);

			this.carousel.questions.forEach((question, index) => {
				const tab = dom.$('.chat-question-tab');
				tab.setAttribute('role', 'tab');
				tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
				tab.tabIndex = index === 0 ? 0 : -1;
				tab.id = `question-tab-${question.id}-${index}`;
				tab.setAttribute('aria-controls', questionPanelId);

				const displayTitle = this.getQuestionText(question.title);
				const tabIndicator = dom.$('.chat-question-tab-indicator.codicon');
				const tabLabel = dom.$('span.chat-question-tab-label');
				tabLabel.textContent = displayTitle;
				tab.append(tabIndicator, tabLabel);
				tab.setAttribute('aria-label', displayTitle);
				this._questionTabIndicators.set(question.id, tabIndicator);

				interactiveStore.add(dom.addDisposableListener(tab, dom.EventType.CLICK, () => {
					this.saveCurrentAnswer();
					this._currentIndex = index;
					this.renderCurrentQuestion(true);
					tab.focus();
				}));

				tabList.appendChild(tab);
				this._tabItems.push(tab);
			});

			// Review tab
			const reviewTab = dom.$('.chat-question-tab.no-icon');
			reviewTab.setAttribute('role', 'tab');
			reviewTab.setAttribute('aria-selected', 'false');
			reviewTab.tabIndex = -1;
			reviewTab.id = 'question-tab-review';
			reviewTab.setAttribute('aria-controls', questionPanelId);
			const reviewLabel = localize('chat.questionCarousel.review', 'Review');
			reviewTab.textContent = reviewLabel;
			reviewTab.setAttribute('aria-label', reviewLabel);
			interactiveStore.add(dom.addDisposableListener(reviewTab, dom.EventType.CLICK, () => {
				this.saveCurrentAnswer();
				this._currentIndex = this._reviewIndex;
				this.renderCurrentQuestion(true);
				reviewTab.focus();
			}));
			tabList.appendChild(reviewTab);
			this._tabItems.push(reviewTab);

			// Controls container for close button only
			if (this._closeButtonContainer) {
				const controlsContainer = dom.$('.chat-question-tab-controls');
				controlsContainer.appendChild(this._closeButtonContainer);
				this._tabBar.appendChild(controlsContainer);
			}

			this.domNode.insertBefore(this._tabBar, this._questionContainer!);
		}

		// Register event listeners
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
			} else if (!isSingleQuestion && (event.keyCode === KeyCode.RightArrow || event.keyCode === KeyCode.LeftArrow)) {
				// Arrow L/R navigates tabs from anywhere in the carousel,
				// except when focus is in a text input or textarea (where arrows move cursor)
				const target = e.target as HTMLElement;
				const isTextInput = target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text';
				const isTextarea = target.tagName === 'TEXTAREA';
				if (!isTextInput && !isTextarea) {
					e.preventDefault();
					e.stopPropagation();
					const totalTabs = this._tabItems.length; // includes Review tab
					if (event.keyCode === KeyCode.RightArrow) {
						if (this._currentIndex < totalTabs - 1) {
							this.saveCurrentAnswer();
							this._currentIndex++;
							this.renderCurrentQuestion(true);
							this._tabItems[this._currentIndex]?.focus();
						}
					} else {
						if (this._currentIndex > 0) {
							this.saveCurrentAnswer();
							this._currentIndex--;
							this.renderCurrentQuestion(true);
							this._tabItems[this._currentIndex]?.focus();
						}
					}
				}
			} else if (event.keyCode === KeyCode.Enter && (event.metaKey || event.ctrlKey)) {
				// Cmd/Ctrl+Enter submits immediately from anywhere
				e.preventDefault();
				e.stopPropagation();
				this.submit();
			} else if (event.keyCode === KeyCode.Enter && !event.shiftKey) {
				// Handle Enter key for text inputs and freeform textareas, not radio/checkbox or buttons
				// Buttons have their own Enter/Space handling via Button class
				const target = e.target as HTMLElement;
				const isTextInput = target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text';
				const isFreeformTextarea = target.tagName === 'TEXTAREA' && target.classList.contains('chat-question-freeform-textarea');
				if (isTextInput || isFreeformTextarea) {
					e.preventDefault();
					e.stopPropagation();
					this.handleNextOrSubmit();
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
		if (!currentQuestion) {
			return; // Review tab or out of bounds
		}
		const answer = this.getCurrentAnswer();
		if (answer !== undefined) {
			this._answers.set(currentQuestion.id, answer);
		} else {
			this._answers.delete(currentQuestion.id);
		}

		this.persistDraftState();
	}

	private persistDraftState(): void {
		if (this.carousel.isUsed || !(this.carousel instanceof ChatQuestionCarouselData)) {
			return;
		}

		this.carousel.draftAnswers = Object.fromEntries(this._answers.entries());
		this.carousel.draftCurrentIndex = this._currentIndex;
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
			this.persistDraftState();
			this.renderCurrentQuestion(true);
		}
	}

	/**
	 * Handles the next/submit behavior for keyboard and option selection flows.
	 * Either advances to the next question or submits when on the last question.
	 */
	private handleNextOrSubmit(): void {
		this.saveCurrentAnswer();
		const currentQuestion = this.carousel.questions[this._currentIndex];
		if (currentQuestion && this.getCurrentAnswer() !== undefined) {
			this._explicitlyAnsweredQuestionIds.add(currentQuestion.id);
			this.updateQuestionTabIndicators();
		}

		if (this._currentIndex < this.carousel.questions.length - 1) {
			// Move to next question
			this._currentIndex++;
			this.persistDraftState();
			this.renderCurrentQuestion(true);
		} else if (this.carousel.questions.length > 1) {
			// Multi-question: navigate to Review tab
			this._currentIndex = this._reviewIndex;
			this.renderCurrentQuestion(true);
			this._tabItems[this._currentIndex]?.focus();
		} else {
			// Single question: submit directly
			this._options.onSubmit(this._answers);
			this.hideAndShowSummary();
		}
	}

	/**
	 * Handles explicit submit action from the dedicated submit button.
	 */
	private submit(): void {
		this.saveCurrentAnswer();
		const currentQuestion = this.carousel.questions[this._currentIndex];
		if (currentQuestion) {
			this._explicitlyAnsweredQuestionIds.add(currentQuestion.id);
		}
		this._options.onSubmit(this._answers);
		this.hideAndShowSummary();
	}

	/**
	 * Focuses the container element and announces the question for screen reader users.
	 */
	private _focusContainerAndAnnounce(): void {
		this.domNode.focus();
		const question = this.carousel.questions[this._currentIndex];
		if (question) {
			const questionText = question.message ?? question.title;
			const messageContent = this.getQuestionText(questionText);
			const questionCount = this.carousel.questions.length;
			const alertMessage = questionCount === 1
				? messageContent
				: localize('chat.questionCarousel.questionAlertMulti', 'Question {0} of {1}: {2}', this._currentIndex + 1, questionCount, messageContent);
			this._accessibilityService.alert(alertMessage);
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
		this._questionRenderStore.clear();
		this._inputBoxes.clear();
		this._textInputBoxes.clear();
		this._singleSelectItems.clear();
		this._multiSelectCheckboxes.clear();
		this._freeformTextareas.clear();

		// Clear references to disposed elements
		this._skipAllButton = undefined;
		this._questionContainer = undefined;
		this._closeButtonContainer = undefined;
		this._tabBar = undefined;
		this._tabItems = [];
		this._questionTabIndicators.clear();
		this._reviewIndex = -1;
		this._footerRow = undefined;
		this._explicitlyAnsweredQuestionIds.clear();
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

	/**
	 * Returns whether auto-focus should be enabled.
	 * Disabled when screen reader mode is active or when explicitly disabled via options.
	 */
	private _shouldAutoFocus(): boolean {
		if (this._options.shouldAutoFocus === false) {
			return false;
		}
		// Disable auto-focus for screen reader users to allow them to read the question first
		return !this._accessibilityService.isScreenReaderOptimized();
	}

	/**
	 * Updates the aria-label of the carousel container based on the current question.
	 */
	private _updateAriaLabel(): void {
		const question = this.carousel.questions[this._currentIndex];
		if (!question) {
			this.domNode.setAttribute('aria-label', localize('chat.questionCarousel.label', 'Chat question'));
			return;
		}

		const questionText = question.message ?? question.title;
		const messageContent = this.getQuestionText(questionText);
		const questionCount = this.carousel.questions.length;

		if (questionCount === 1) {
			this.domNode.setAttribute('aria-label', localize('chat.questionCarousel.singleQuestionLabel', 'Chat question: {0}', messageContent));
		} else {
			this.domNode.setAttribute('aria-label', localize('chat.questionCarousel.multiQuestionLabel', 'Chat question {0} of {1}: {2}', this._currentIndex + 1, questionCount, messageContent));
		}
	}

	/**
	 * Focuses the carousel container element.
	 */
	public focus(): void {
		this.domNode.focus();
	}

	/**
	 * Returns whether the carousel container has focus.
	 */
	public hasFocus(): boolean {
		return dom.isAncestorOfActiveElement(this.domNode);
	}

	public navigateToPreviousQuestion(): boolean {
		if (this._currentIndex <= 0) {
			return false;
		}

		this.navigate(-1);
		return true;
	}

	public navigateToNextQuestion(): boolean {
		if (this._currentIndex >= this.carousel.questions.length - 1) {
			return false;
		}

		this.navigate(1);
		return true;
	}

	private renderCurrentQuestion(focusContainerForScreenReader: boolean = false): void {
		if (!this._questionContainer) {
			return;
		}

		const questionRenderStore = new DisposableStore();
		this._questionRenderStore.value = questionRenderStore;

		// Clear previous input boxes and stale references
		this._inputBoxes.clear();
		this._textInputBoxes.clear();
		this._singleSelectItems.clear();
		this._multiSelectCheckboxes.clear();
		this._freeformTextareas.clear();

		// Remove footer if it exists from a previous Review render
		if (this._footerRow) {
			this._footerRow.remove();
			this._footerRow = undefined;
		}

		// Clear previous content
		dom.clearNode(this._questionContainer);

		const isSingleQuestion = this.carousel.questions.length === 1;
		const isReview = !isSingleQuestion && this._currentIndex === this._reviewIndex;

		// Update tab bar active state for multi-question carousels
		if (!isSingleQuestion) {
			this._tabItems.forEach((tab, index) => {
				const isActive = index === this._currentIndex;
				tab.classList.toggle('active', isActive);
				tab.setAttribute('aria-selected', String(isActive));
				tab.tabIndex = isActive ? 0 : -1;
			});
			// Link the panel to the active tab for screen readers
			const activeTab = this._tabItems[this._currentIndex];
			if (activeTab) {
				this._questionContainer.setAttribute('aria-labelledby', activeTab.id);
			}
			this.updateQuestionTabIndicators();
		}

		if (isReview) {
			this.renderReviewPanel(questionRenderStore);
		} else {
			this.renderQuestionPanel(questionRenderStore, isSingleQuestion);
		}

		// Update aria-label to reflect the current question
		this._updateAriaLabel();

		// In screen reader mode, focus the container and announce the question
		if (focusContainerForScreenReader && this._accessibilityService.isScreenReaderOptimized()) {
			this._focusContainerAndAnnounce();
		}

		this._onDidChangeHeight.fire();
	}

	/**
	 * Renders a question panel (title, message, input) inside the question container.
	 */
	private renderQuestionPanel(questionRenderStore: DisposableStore, isSingleQuestion: boolean): void {
		const question = this.carousel.questions[this._currentIndex];
		if (!question || !this._questionContainer) {
			return;
		}

		// Render question header row with title and close button (single question only)
		if (isSingleQuestion) {
			const headerRow = dom.$('.chat-question-header-row');
			const titleRow = dom.$('.chat-question-title-row');

			if (question.title) {
				const title = dom.$('.chat-question-title');
				const questionText = question.title;
				const messageContent = this.getQuestionText(questionText);

				title.setAttribute('aria-label', messageContent);

				if (question.message !== undefined) {
					const messageMd = isMarkdownString(questionText) ? MarkdownString.lift(questionText) : new MarkdownString(questionText);
					const renderedTitle = questionRenderStore.add(this._markdownRendererService.render(messageMd));
					title.appendChild(renderedTitle.element);
				} else {
					const parenMatch = messageContent.match(/^(.+?)\s*(\([^)]+\))\s*$/);
					if (parenMatch) {
						const mainTitle = dom.$('span.chat-question-title-main');
						mainTitle.textContent = parenMatch[1];
						title.appendChild(mainTitle);

						const subtitle = dom.$('span.chat-question-title-subtitle');
						subtitle.textContent = ' ' + parenMatch[2];
						title.appendChild(subtitle);
					} else {
						title.textContent = messageContent;
					}
				}
				titleRow.appendChild(title);
			}

			if (this._closeButtonContainer) {
				titleRow.appendChild(this._closeButtonContainer);
			}

			headerRow.appendChild(titleRow);
			this._questionContainer.appendChild(headerRow);
		}

		// Render full question text below the header row
		if (question.message) {
			const messageEl = dom.$('.chat-question-message');
			if (isMarkdownString(question.message)) {
				const renderedMessage = questionRenderStore.add(this._markdownRendererService.render(MarkdownString.lift(question.message)));
				messageEl.appendChild(renderedMessage.element);
			} else {
				messageEl.textContent = this.getQuestionText(question.message);
			}
			this._questionContainer.appendChild(messageEl);
		}

		// Render input based on question type
		const inputContainer = dom.$('.chat-question-input-container');
		this.renderInput(inputContainer, question);
		this._questionContainer.appendChild(inputContainer);
	}

	/**
	 * Renders the review panel with a summary of all answers and a submit footer.
	 */
	private renderReviewPanel(questionRenderStore: DisposableStore): void {
		if (!this._questionContainer) {
			return;
		}

		// Render inline review summary.
		// If no explicit answers exist yet, show a single empty-state label.
		// If some explicit answers exist, show all questions and mark missing ones as not answered yet.
		const summaryContainer = dom.$('.chat-question-carousel-summary');
		const answeredCount = this.carousel.questions.filter(q => this._explicitlyAnsweredQuestionIds.has(q.id)).length;

		if (answeredCount === 0) {
			const emptyLabel = dom.$('div.chat-question-summary-empty');
			emptyLabel.textContent = localize('chat.questionCarousel.noQuestionsAnsweredYet', 'No questions answered yet');
			summaryContainer.appendChild(emptyLabel);
			this._questionContainer.appendChild(summaryContainer);
		} else {
			for (const question of this.carousel.questions) {
				const summaryItem = dom.$('.chat-question-summary-item');

				const questionRow = dom.$('div.chat-question-summary-label');
				const questionText = question.message ?? question.title;
				let labelText = typeof questionText === 'string' ? questionText : questionText.value;
				labelText = labelText.replace(/[:\s]+$/, '');
				questionRow.textContent = localize('chat.questionCarousel.summaryQuestion', 'Q: {0}', labelText);
				summaryItem.appendChild(questionRow);

				const hasExplicitAnswer = this._explicitlyAnsweredQuestionIds.has(question.id);
				const answer = this._answers.get(question.id);

				if (hasExplicitAnswer && answer !== undefined) {
					const formattedAnswer = this.formatAnswerForSummary(question, answer);
					const answerRow = dom.$('div.chat-question-summary-answer');
					answerRow.textContent = localize('chat.questionCarousel.summaryAnswer', 'A: {0}', formattedAnswer);
					summaryItem.appendChild(answerRow);
				} else {
					const unanswered = dom.$('div.chat-question-summary-unanswered');
					unanswered.textContent = localize('chat.questionCarousel.notAnsweredYet', 'Not answered yet');
					summaryItem.appendChild(unanswered);
				}

				summaryContainer.appendChild(summaryItem);
			}

			this._questionContainer.appendChild(summaryContainer);
		}

		// Footer with Submit/Cancel appears only once at least one question is answered.
		if (answeredCount > 0) {
			this._footerRow = dom.$('.chat-question-footer-row');

			const hint = dom.$('span.chat-question-submit-hint');
			hint.textContent = isMacintosh
				? localize('chat.questionCarousel.submitHintMac', '\u2318\u23CE to submit')
				: localize('chat.questionCarousel.submitHintOther', 'Ctrl+Enter to submit');
			this._footerRow.appendChild(hint);

			const submitButton = questionRenderStore.add(new Button(this._footerRow, { ...defaultButtonStyles }));
			submitButton.element.classList.add('chat-question-submit-button');
			submitButton.label = localize('submit', 'Submit');
			questionRenderStore.add(submitButton.onDidClick(() => this.submit()));

			this.domNode.append(this._footerRow);
		}
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
		this._inputBoxes.add(inputBox.onDidChange(() => this.saveCurrentAnswer()));

		// Restore previous answer if exists
		const previousAnswer = this._answers.get(question.id);
		if (previousAnswer !== undefined) {
			inputBox.value = String(previousAnswer);
		} else if (question.defaultValue !== undefined) {
			inputBox.value = String(question.defaultValue);
		}

		this._textInputBoxes.set(question.id, inputBox);

		// Focus on input when rendered using proper DOM scheduling
		if (this._shouldAutoFocus()) {
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
			} else if (selectedIndex === -1 && !previousFreeform && defaultOptionId !== undefined && option.id === defaultOptionId) {
				selectedIndex = index;
			}
		});

		const listItems: HTMLElement[] = [];
		const indicators: HTMLElement[] = [];
		const updateSelection = (newIndex: number, isUserInitiated: boolean = false) => {
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
			if (isUserInitiated) {
				this.updateQuestionTabIndicators();
			}

			this.saveCurrentAnswer();
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
				const titleSpan = dom.$('div.chat-question-list-label-title');
				titleSpan.textContent = option.label.substring(0, separatorIndex);
				label.appendChild(titleSpan);

				const descSpan = dom.$('div.chat-question-list-label-desc');
				descSpan.textContent = option.label.substring(separatorIndex + 3);
				label.appendChild(descSpan);
			} else {
				label.textContent = option.label;
			}
			listItem.appendChild(label);
			listItem.appendChild(indicator);

			if (isSelected) {
				listItem.classList.add('selected');
			}

			// if we select an option, clear text and go to next question
			this._inputBoxes.add(dom.addDisposableListener(listItem, dom.EventType.CLICK, (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				updateSelection(index, true);
				const freeform = this._freeformTextareas.get(question.id);
				if (freeform) {
					freeform.value = '';
				}
				this.handleNextOrSubmit();
			}));

			this._inputBoxes.add(this._hoverService.setupDelayedHover(listItem, {
				content: option.label,
				position: { hoverPosition: HoverPosition.BELOW },
				appearance: { showPointer: true }
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
				updateSelection(-1, true);
			}
		}));

		this._inputBoxes.add(dom.addDisposableListener(freeformTextarea, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.UpArrow && freeformTextarea.selectionStart === 0 && freeformTextarea.selectionEnd === 0 && listItems.length) {
				e.preventDefault();
				const lastIndex = listItems.length - 1;
				updateSelection(lastIndex, true);
				listItems[lastIndex].focus();
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
				if (data.selectedIndex >= listItems.length - 1) {
					updateSelection(-1);
					freeformTextarea.focus();
					return;
				}
				newIndex = Math.min(data.selectedIndex + 1, listItems.length - 1);
			} else if (event.keyCode === KeyCode.UpArrow) {
				e.preventDefault();
				newIndex = Math.max(data.selectedIndex - 1, 0);
			} else if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
				// Enter confirms current selection and advances to next question
				e.preventDefault();
				e.stopPropagation();
				this.handleNextOrSubmit();
				return;
			} else if (event.keyCode >= KeyCode.Digit1 && event.keyCode <= KeyCode.Digit9) {
				// Number keys 1-9 select the corresponding option, or focus freeform for next number
				const numberIndex = event.keyCode - KeyCode.Digit1;
				if (numberIndex < listItems.length) {
					e.preventDefault();
					updateSelection(numberIndex, true);
				} else if (numberIndex === listItems.length) {
					e.preventDefault();
					updateSelection(-1, true);
					freeformTextarea.focus();
				}
				return;
			}

			if (newIndex !== data.selectedIndex && newIndex >= 0) {
				updateSelection(newIndex, true);
			}
		}));

		// Resize textarea if it has restored content
		if (previousFreeform !== undefined) {
			this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(freeformTextarea), () => autoResize()));
		}

		// focus on the row when first rendered or textarea if it has content
		if (this._shouldAutoFocus()) {
			if (previousFreeform) {
				this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(freeformTextarea), () => {
					freeformTextarea.focus();
				}));
			} else if (listItems.length > 0) {
				const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;
				// if no default and no freeform text, select the first answer
				if (selectedIndex < 0) {
					updateSelection(0);
				}
				this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(selectContainer), () => {
					listItems[focusIndex]?.focus();
				}));
			}
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
			} else if (!previousFreeform && defaultOptionIds.includes(option.id)) {
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
				const titleSpan = dom.$('div.chat-question-list-label-title');
				titleSpan.textContent = option.label.substring(0, separatorIndex);
				label.appendChild(titleSpan);

				const descSpan = dom.$('div.chat-question-list-label-desc');
				descSpan.textContent = option.label.substring(separatorIndex + 3);
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
				this.updateQuestionTabIndicators();
				this.saveCurrentAnswer();
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

			this._inputBoxes.add(this._hoverService.setupDelayedHover(listItem, {
				content: option.label,
				position: { hoverPosition: HoverPosition.BELOW },
				appearance: { showPointer: true }
			}));

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
		this._inputBoxes.add(dom.addDisposableListener(freeformTextarea, dom.EventType.INPUT, () => this.saveCurrentAnswer()));

		this._inputBoxes.add(dom.addDisposableListener(freeformTextarea, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.UpArrow && freeformTextarea.selectionStart === 0 && freeformTextarea.selectionEnd === 0 && listItems.length) {
				e.preventDefault();
				focusedIndex = listItems.length - 1;
				listItems[focusedIndex].focus();
			}
		}));
		this._inputBoxes.add(dom.addDisposableListener(freeformTextarea, dom.EventType.INPUT, () => {
			this.updateQuestionTabIndicators();
		}));

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
				if (focusedIndex >= listItems.length - 1) {
					freeformTextarea.focus();
					return;
				}
				focusedIndex = Math.min(focusedIndex + 1, listItems.length - 1);
				listItems[focusedIndex].focus();
			} else if (event.keyCode === KeyCode.UpArrow) {
				e.preventDefault();
				focusedIndex = Math.max(focusedIndex - 1, 0);
				listItems[focusedIndex].focus();
			} else if (event.keyCode === KeyCode.Enter) {
				e.preventDefault();
				e.stopPropagation();
				this.handleNextOrSubmit();
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

		// Focus on the appropriate row when rendered or textarea if it has content
		if (this._shouldAutoFocus()) {
			if (previousFreeform) {
				this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(freeformTextarea), () => {
					freeformTextarea.focus();
				}));
			} else if (listItems.length > 0) {
				const initialFocusIndex = firstCheckedIndex >= 0 ? firstCheckedIndex : 0;
				focusedIndex = initialFocusIndex;
				this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(selectContainer), () => {
					listItems[initialFocusIndex]?.focus();
				}));
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
				const inputBox = this._textInputBoxes.get(question.id);
				return inputBox?.value ?? question.defaultValue;
			}

			case 'singleSelect': {
				const data = this._singleSelectItems.get(question.id);
				let selectedValue: unknown = undefined;
				if (data && data.selectedIndex >= 0) {
					selectedValue = question.options?.[data.selectedIndex]?.value;
				}

				// For single-select: freeform takes priority over selection.
				const freeformTextarea = this._freeformTextareas.get(question.id);
				const freeformValue = freeformTextarea?.value !== '' ? freeformTextarea?.value : undefined;
				if (freeformValue) {
					return { selectedValue: undefined, freeformValue };
				}

				// Find default option if nothing selected and no freeform text (defaultValue is the option id)
				if (selectedValue === undefined && typeof question.defaultValue === 'string') {
					const defaultOption = question.options?.find(opt => opt.id === question.defaultValue);
					selectedValue = defaultOption?.value;
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

				// Return whatever was selected - defaults are applied at render time when
				// checkboxes are initially checked, so empty selection means user unchecked all
				if (freeformValue || selectedValues.length > 0) {
					return { selectedValues, freeformValue };
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
			if (this.carousel.isUsed) {
				this.renderSkippedMessage();
			}
			return;
		}

		const summaryContainer = dom.$('.chat-question-carousel-summary');

		for (const question of this.carousel.questions) {
			const answer = this._answers.get(question.id);
			if (answer === undefined) {
				continue;
			}

			const summaryItem = dom.$('.chat-question-summary-item');

			// Question row with Q: prefix
			const questionRow = dom.$('div.chat-question-summary-label');
			const questionText = question.message ?? question.title;
			let labelText = typeof questionText === 'string' ? questionText : questionText.value;
			labelText = labelText.replace(/[:\s]+$/, '');
			questionRow.textContent = localize('chat.questionCarousel.summaryQuestion', 'Q: {0}', labelText);
			summaryItem.appendChild(questionRow);

			// Answer row with A: prefix
			const formattedAnswer = this.formatAnswerForSummary(question, answer);
			const answerRow = dom.$('div.chat-question-summary-answer');
			answerRow.textContent = localize('chat.questionCarousel.summaryAnswer', 'A: {0}', formattedAnswer);
			summaryItem.appendChild(answerRow);

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

	private getQuestionText(questionText: string | IMarkdownString): string {
		const md = typeof questionText === 'string' ? new MarkdownString(questionText) : questionText;
		return renderAsPlaintext(md);
	}



	private updateQuestionTabIndicators(): void {
		for (const question of this.carousel.questions) {
			const indicator = this._questionTabIndicators.get(question.id);
			if (!indicator) {
				continue;
			}

			const hasExplicitAnswer = this._explicitlyAnsweredQuestionIds.has(question.id);
			indicator.classList.toggle('codicon-check', hasExplicitAnswer);
			indicator.classList.toggle('codicon-circle-filled', !hasExplicitAnswer);
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

	override dispose(): void {
		if (!this._isSkipped && !this.carousel.isUsed) {
			this.saveCurrentAnswer();
		}

		super.dispose();
	}
}
