/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString, isMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../../base/common/platform.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Checkbox } from '../../../../../../base/browser/ui/toggle/toggle.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { isResponseVM } from '../../../common/model/chatViewModel.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import './media/chatQuestionCarousel.css';
const PREVIOUS_QUESTION_ACTION_ID = 'workbench.action.chat.previousQuestion';
const NEXT_QUESTION_ACTION_ID = 'workbench.action.chat.nextQuestion';
let ChatQuestionCarouselPart = class ChatQuestionCarouselPart extends Disposable {
    constructor(carousel, context, _options, _markdownRendererService, _hoverService, _accessibilityService, _contextKeyService, _keybindingService) {
        super();
        this.carousel = carousel;
        this._options = _options;
        this._markdownRendererService = _markdownRendererService;
        this._hoverService = _hoverService;
        this._accessibilityService = _accessibilityService;
        this._contextKeyService = _contextKeyService;
        this._keybindingService = _keybindingService;
        this._onDidChangeHeight = this._register(new Emitter());
        this.onDidChangeHeight = this._onDidChangeHeight.event;
        this._currentIndex = 0;
        this._answers = new Map();
        this._isCollapsed = false;
        this._isSkipped = false;
        this._textInputBoxes = new Map();
        this._singleSelectItems = new Map();
        this._multiSelectCheckboxes = new Map();
        this._freeformTextareas = new Map();
        this._inputBoxes = this._register(new DisposableStore());
        this._questionRenderStore = this._register(new MutableDisposable());
        /**
         * Disposable store for interactive UI components (header, nav buttons, etc.)
         * that should be disposed when transitioning to summary view.
         */
        this._interactiveUIStore = this._register(new MutableDisposable());
        this.domNode = dom.$('.chat-question-carousel-container');
        this.domNode.id = generateUuid();
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
            if (typeof carousel.draftCollapsed === 'boolean') {
                this._isCollapsed = carousel.draftCollapsed;
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
        this._questionContainer = dom.$('.chat-question-carousel-content');
        this.domNode.append(this._questionContainer);
        this._headerActionsContainer = dom.$('.chat-question-header-actions');
        const collapseToggleTitle = localize('chat.questionCarousel.collapseTitle', 'Collapse Questions');
        const collapseButton = interactiveStore.add(new Button(this._headerActionsContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
        collapseButton.element.classList.add('chat-question-collapse-toggle');
        collapseButton.element.setAttribute('aria-label', collapseToggleTitle);
        this._collapseButton = collapseButton;
        // Close/skip button (X) - placed in header row, only shown when allowSkip is true
        if (carousel.allowSkip) {
            this._closeButtonContainer = dom.$('.chat-question-close-container');
            const skipAllTitle = localize('chat.questionCarousel.skipAllTitle', 'Skip all questions');
            const skipAllButton = interactiveStore.add(new Button(this._closeButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
            skipAllButton.label = `$(${Codicon.close.id})`;
            skipAllButton.element.classList.add('chat-question-close');
            skipAllButton.element.setAttribute('aria-label', skipAllTitle);
            interactiveStore.add(this._hoverService.setupDelayedHover(skipAllButton.element, { content: skipAllTitle }));
            this._skipAllButton = skipAllButton;
        }
        // Register event listeners
        interactiveStore.add(collapseButton.onDidClick(() => this.toggleCollapsed()));
        if (this._skipAllButton) {
            interactiveStore.add(this._skipAllButton.onDidClick(() => this.ignore()));
        }
        // Register keyboard navigation
        interactiveStore.add(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.keyCode === 9 /* KeyCode.Escape */ && this.carousel.allowSkip) {
                e.preventDefault();
                e.stopPropagation();
                this.ignore();
            }
            else if (event.keyCode === 3 /* KeyCode.Enter */ && (event.metaKey || event.ctrlKey)) {
                // Cmd/Ctrl+Enter submits immediately from anywhere
                e.preventDefault();
                e.stopPropagation();
                this.submit();
            }
            else if (event.keyCode === 3 /* KeyCode.Enter */ && !event.shiftKey) {
                const target = e.target;
                const isTextInput = target.tagName === 'INPUT' && target.type === 'text';
                const isFreeformTextarea = target.tagName === 'TEXTAREA' && target.classList.contains('chat-question-freeform-textarea');
                if (isTextInput || isFreeformTextarea) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleNextOrSubmit();
                }
            }
            else if ((event.ctrlKey || event.metaKey) && (event.keyCode === 1 /* KeyCode.Backspace */ || event.keyCode === 20 /* KeyCode.Delete */)) {
                e.stopPropagation();
            }
        }));
        // Initialize the carousel
        this.renderCurrentQuestion();
    }
    /**
     * Saves the current question's answer to the answers map.
     */
    saveCurrentAnswer() {
        const currentQuestion = this.carousel.questions[this._currentIndex];
        const answer = this.getCurrentAnswer();
        if (answer !== undefined) {
            this._answers.set(currentQuestion.id, answer);
        }
        else {
            this._answers.delete(currentQuestion.id);
        }
        // Validate on change to update the Next button state
        if (currentQuestion?.validation && typeof answer === 'string' && answer !== '') {
            const error = this.getValidationError(answer, currentQuestion.validation);
            if (error) {
                this.showValidationError(error);
            }
            else {
                this.clearValidationError();
            }
        }
        else {
            this.clearValidationError();
        }
        this.updateFooterState();
        this.persistDraftState();
    }
    persistDraftState() {
        if (this.carousel.isUsed || !(this.carousel instanceof ChatQuestionCarouselData)) {
            return;
        }
        this.carousel.draftAnswers = Object.fromEntries(this._answers.entries());
        this.carousel.draftCurrentIndex = this._currentIndex;
        this.carousel.draftCollapsed = this._isCollapsed;
    }
    toggleCollapsed() {
        this._isCollapsed = !this._isCollapsed;
        this.persistDraftState();
        this.updateCollapsedPresentation();
        this._onDidChangeHeight.fire();
    }
    updateCollapsedPresentation() {
        this.domNode.classList.toggle('chat-question-carousel-collapsed', this._isCollapsed);
        if (this._collapseButton) {
            const collapsed = this._isCollapsed;
            const buttonTitle = collapsed
                ? localize('chat.questionCarousel.expandTitle', 'Expand Questions')
                : localize('chat.questionCarousel.collapseTitle', 'Collapse Questions');
            const contentId = this.domNode.id;
            this._collapseButton.label = collapsed ? `$(${Codicon.chevronUp.id})` : `$(${Codicon.chevronDown.id})`;
            this._collapseButton.element.setAttribute('aria-label', buttonTitle);
            this._collapseButton.element.setAttribute('aria-expanded', String(!collapsed));
            this._collapseButton.element.setAttribute('aria-controls', contentId);
            this._collapseButton.setTitle(buttonTitle);
        }
    }
    /**
     * Navigates the carousel by the given delta.
     * @param delta Negative for previous, positive for next
     */
    navigate(delta) {
        const newIndex = this._currentIndex + delta;
        if (newIndex >= 0 && newIndex < this.carousel.questions.length) {
            this.saveCurrentAnswer();
            this._currentIndex = newIndex;
            this.persistDraftState();
            this.renderCurrentQuestion(true);
            this.domNode.focus();
        }
    }
    /**
     * Handles the next/submit behavior for keyboard and option selection flows.
     * Either advances to the next question or submits when on the last question.
     */
    handleNextOrSubmit() {
        this.saveCurrentAnswer();
        if (!this.validateCurrentQuestion()) {
            return;
        }
        if (this._currentIndex < this.carousel.questions.length - 1) {
            // Move to next question
            this._currentIndex++;
            this.persistDraftState();
            this.renderCurrentQuestion(true);
        }
        else {
            // Submit
            if (!this.validateRequiredFields()) {
                return;
            }
            this._options.onSubmit(this._answers);
            this.hideAndShowSummary();
        }
    }
    /**
     * Handles explicit submit action from the dedicated submit button.
     */
    submit() {
        this.saveCurrentAnswer();
        if (!this.validateCurrentQuestion()) {
            return;
        }
        if (!this.validateRequiredFields()) {
            return;
        }
        this._options.onSubmit(this._answers);
        this.hideAndShowSummary();
    }
    /**
     * Focuses the container element and announces the question for screen reader users.
     */
    _focusContainerAndAnnounce() {
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
    hideAndShowSummary() {
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
    clearInteractiveResources() {
        // Dispose interactive UI disposables (header, nav buttons, etc.)
        this._interactiveUIStore.clear();
        this._questionRenderStore.clear();
        this._inputBoxes.clear();
        this._textInputBoxes.clear();
        this._singleSelectItems.clear();
        this._multiSelectCheckboxes.clear();
        this._freeformTextareas.clear();
        // Clear references to disposed elements
        this._prevButton = undefined;
        this._nextButton = undefined;
        this._submitButton = undefined;
        this._skipAllButton = undefined;
        this._questionContainer = undefined;
        this._headerActionsContainer = undefined;
        this._closeButtonContainer = undefined;
        this._collapseButton = undefined;
        this._footerRow = undefined;
        this._stepIndicator = undefined;
        this._submitHint = undefined;
        this._inputScrollable = undefined;
    }
    layoutInputScrollable(inputScrollable) {
        if (!this._questionContainer) {
            return;
        }
        const scrollableNode = inputScrollable.getDomNode();
        const scrollableContent = scrollableNode.firstElementChild;
        if (!dom.isHTMLElement(scrollableContent)) {
            return;
        }
        // Clear stale size constraints first so this step can shrink after
        // navigating from a taller question.
        if (scrollableNode.style.height !== '' || scrollableNode.style.maxHeight !== '') {
            scrollableNode.style.height = '';
            scrollableNode.style.maxHeight = '';
        }
        if (scrollableContent.style.height !== '' || scrollableContent.style.maxHeight !== '') {
            scrollableContent.style.height = '';
            scrollableContent.style.maxHeight = '';
        }
        // Use the flex-resolved container height (constrained by CSS max-height)
        // instead of window.innerHeight, so the scroll viewport tracks actual chat space.
        const maxContainerHeight = this._questionContainer.clientHeight;
        const computedStyle = dom.getWindow(this._questionContainer).getComputedStyle(this._questionContainer);
        const contentVerticalPadding = Number.parseFloat(computedStyle.paddingTop || '0') +
            Number.parseFloat(computedStyle.paddingBottom || '0');
        const nonScrollableContentHeight = Array.from(this._questionContainer.children)
            .filter(child => child !== scrollableNode)
            .reduce((sum, child) => sum + child.offsetHeight, 0);
        const availableScrollableHeight = Math.floor(maxContainerHeight - contentVerticalPadding - nonScrollableContentHeight);
        const contentScrollableHeight = scrollableContent.scrollHeight;
        const constrainedScrollableHeight = Math.max(0, Math.min(availableScrollableHeight, contentScrollableHeight));
        const constrainedScrollableHeightPx = `${constrainedScrollableHeight}px`;
        // Constrain wrapper + content so no stale flex sizing survives between steps.
        if (scrollableNode.style.height !== constrainedScrollableHeightPx || scrollableNode.style.maxHeight !== constrainedScrollableHeightPx) {
            scrollableNode.style.height = constrainedScrollableHeightPx;
            scrollableNode.style.maxHeight = constrainedScrollableHeightPx;
        }
        // Constrain the content element (DomScrollableElement._element) so that
        // scanDomNode sees clientHeight < scrollHeight and enables scrolling.
        if (scrollableContent.style.height !== constrainedScrollableHeightPx || scrollableContent.style.maxHeight !== constrainedScrollableHeightPx) {
            scrollableContent.style.height = constrainedScrollableHeightPx;
            scrollableContent.style.maxHeight = constrainedScrollableHeightPx;
        }
        inputScrollable.scanDomNode();
    }
    /**
     * Skips the carousel with default values - called when user wants to proceed quickly.
     * Returns defaults for all questions.
     */
    skip() {
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
    ignore() {
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
    getDefaultAnswers() {
        const answers = new Map();
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
    getDefaultAnswerForQuestion(question) {
        switch (question.type) {
            case 'text':
                return typeof question.defaultValue === 'string' ? question.defaultValue : undefined;
            case 'singleSelect': {
                const defaultOptionId = typeof question.defaultValue === 'string' ? question.defaultValue : undefined;
                const defaultOption = defaultOptionId !== undefined
                    ? question.options?.find(opt => opt.id === defaultOptionId)
                    : undefined;
                const selectedValue = defaultOption?.value;
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
                return selectedValues.length > 0 ? { selectedValues, freeformValue: undefined } : undefined;
            }
            default:
                return typeof question.defaultValue === 'string' ? question.defaultValue : Array.isArray(question.defaultValue) ? { selectedValues: question.defaultValue } : undefined;
        }
    }
    /**
     * Returns whether auto-focus should be enabled.
     * Disabled when screen reader mode is active or when explicitly disabled via options.
     */
    _shouldAutoFocus() {
        if (this._options.shouldAutoFocus === false) {
            return false;
        }
        // Disable auto-focus for screen reader users to allow them to read the question first
        return !this._accessibilityService.isScreenReaderOptimized();
    }
    /**
     * Updates the aria-label of the carousel container based on the current question.
     */
    _updateAriaLabel() {
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
        }
        else {
            this.domNode.setAttribute('aria-label', localize('chat.questionCarousel.multiQuestionLabel', 'Chat question {0} of {1}: {2}', this._currentIndex + 1, questionCount, messageContent));
        }
    }
    /**
     * Focuses the carousel container element.
     */
    focus() {
        this.domNode.focus();
    }
    /**
     * Returns whether the carousel container has focus.
     */
    hasFocus() {
        return dom.isAncestorOfActiveElement(this.domNode);
    }
    navigateToPreviousQuestion() {
        if (this._currentIndex <= 0) {
            return false;
        }
        this.navigate(-1);
        return true;
    }
    navigateToNextQuestion() {
        if (this._currentIndex >= this.carousel.questions.length - 1) {
            return false;
        }
        this.navigate(1);
        return true;
    }
    renderCurrentQuestion(focusContainerForScreenReader = false) {
        if (!this._questionContainer) {
            return;
        }
        const questionRenderStore = new DisposableStore();
        this._questionRenderStore.value = questionRenderStore;
        this._inputScrollable = undefined;
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
        // Render unified question title (message ?? title)
        const headerRow = dom.$('.chat-question-header-row');
        const titleRow = dom.$('.chat-question-title-row');
        // Render carousel-level message if present (e.g. from MCP elicitation)
        if (this.carousel.message && this._currentIndex === 0) {
            const messageMd = isMarkdownString(this.carousel.message) ? MarkdownString.lift(this.carousel.message) : new MarkdownString(this.carousel.message);
            const carouselMessage = dom.$('.chat-question-carousel-message');
            const renderedMessage = questionRenderStore.add(this._markdownRendererService.render(messageMd));
            carouselMessage.appendChild(renderedMessage.element);
            headerRow.appendChild(carouselMessage);
        }
        const questionText = question.message ?? question.title;
        if (questionText) {
            const title = dom.$('.chat-question-title');
            const messageContent = this.getQuestionText(questionText);
            title.setAttribute('aria-label', messageContent);
            const titleText = question.required
                ? new MarkdownString(`${isMarkdownString(questionText) ? questionText.value : questionText} *`)
                : (isMarkdownString(questionText) ? MarkdownString.lift(questionText) : new MarkdownString(questionText));
            const renderedTitle = questionRenderStore.add(this._markdownRendererService.render(titleText));
            title.appendChild(renderedTitle.element);
            titleRow.appendChild(title);
        }
        headerRow.appendChild(titleRow);
        if (this._headerActionsContainer) {
            dom.clearNode(this._headerActionsContainer);
            if (this._closeButtonContainer) {
                this._headerActionsContainer.appendChild(this._closeButtonContainer);
            }
            if (this._collapseButton) {
                this._headerActionsContainer.appendChild(this._collapseButton.element);
            }
            titleRow.appendChild(this._headerActionsContainer);
        }
        this._questionContainer.appendChild(headerRow);
        // Render description if present
        if (question.description) {
            const descriptionEl = dom.$('.chat-question-description');
            descriptionEl.textContent = question.description;
            this._questionContainer.appendChild(descriptionEl);
        }
        // Render input based on question type
        const inputContainer = dom.$('.chat-question-input-container');
        this.renderInput(inputContainer, question);
        const inputScrollable = questionRenderStore.add(new DomScrollableElement(inputContainer, {
            vertical: 3 /* ScrollbarVisibility.Visible */,
            horizontal: 2 /* ScrollbarVisibility.Hidden */,
            consumeMouseWheelIfScrollbarIsNeeded: true,
        }));
        this._inputScrollable = inputScrollable;
        const inputScrollableNode = inputScrollable.getDomNode();
        inputScrollableNode.classList.add('chat-question-input-scrollable');
        this._questionContainer.appendChild(inputScrollableNode);
        // Validation message element below the scrollable area (not inside it)
        this._validationMessageElement = dom.$('.chat-question-validation-message');
        this._validationMessageElement.style.display = 'none';
        this._questionContainer.appendChild(this._validationMessageElement);
        const isSingleQuestion = this.carousel.questions.length === 1;
        // Render footer before first layout so the scrollable area is measured against
        // its final available height and does not visibly resize twice.
        if (!isSingleQuestion) {
            this.renderFooter();
        }
        else {
            this.renderSingleQuestionFooter();
        }
        let relayoutScheduled = false;
        const relayoutScheduler = questionRenderStore.add(new MutableDisposable());
        const scheduleLayoutInputScrollable = () => {
            if (relayoutScheduled) {
                return;
            }
            relayoutScheduled = true;
            relayoutScheduler.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => {
                relayoutScheduled = false;
                this.layoutInputScrollable(inputScrollable);
            });
        };
        const inputResizeObserver = questionRenderStore.add(new dom.DisposableResizeObserver(() => scheduleLayoutInputScrollable()));
        questionRenderStore.add(inputResizeObserver.observe(inputScrollableNode));
        questionRenderStore.add(inputResizeObserver.observe(inputContainer));
        questionRenderStore.add(dom.addDisposableListener(dom.getWindow(this.domNode), dom.EventType.RESIZE, () => scheduleLayoutInputScrollable()));
        scheduleLayoutInputScrollable();
        questionRenderStore.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => {
            inputContainer.scrollTop = 0;
            inputContainer.scrollLeft = 0;
            inputScrollable.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
            inputScrollable.scanDomNode();
        }));
        // Update aria-label to reflect the current question
        this._updateAriaLabel();
        this.updateCollapsedPresentation();
        // In screen reader mode, focus the container and announce the question
        // This must happen after all render calls to avoid focus being stolen
        if (focusContainerForScreenReader && this._accessibilityService.isScreenReaderOptimized()) {
            this._focusContainerAndAnnounce();
        }
        this._onDidChangeHeight.fire();
    }
    /**
     * Renders or updates the persistent footer with nav arrows, step indicator, and submit button.
     */
    renderFooter() {
        if (!this._footerRow) {
            const interactiveStore = this._interactiveUIStore.value;
            if (!interactiveStore) {
                return;
            }
            this._footerRow = dom.$('.chat-question-footer-row');
            // Left side: nav arrows + step indicator
            const leftControls = dom.$('.chat-question-footer-left.chat-question-carousel-nav');
            leftControls.setAttribute('role', 'navigation');
            leftControls.setAttribute('aria-label', localize('chat.questionCarousel.navigation', 'Question navigation'));
            const arrowsContainer = dom.$('.chat-question-nav-arrows');
            const previousLabel = this.getLabelWithKeybinding(localize('previous', 'Previous'), PREVIOUS_QUESTION_ACTION_ID);
            const prevButton = interactiveStore.add(new Button(arrowsContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
            prevButton.element.classList.add('chat-question-nav-arrow', 'chat-question-nav-prev');
            prevButton.label = `$(${Codicon.chevronLeft.id})`;
            prevButton.element.setAttribute('aria-label', previousLabel);
            interactiveStore.add(this._hoverService.setupDelayedHover(prevButton.element, { content: previousLabel }));
            interactiveStore.add(prevButton.onDidClick(() => this.navigate(-1)));
            this._prevButton = prevButton;
            const nextLabel = this.getLabelWithKeybinding(localize('next', 'Next'), NEXT_QUESTION_ACTION_ID);
            const nextButton = interactiveStore.add(new Button(arrowsContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
            nextButton.element.classList.add('chat-question-nav-arrow', 'chat-question-nav-next');
            nextButton.label = `$(${Codicon.chevronRight.id})`;
            nextButton.element.setAttribute('aria-label', nextLabel);
            interactiveStore.add(this._hoverService.setupDelayedHover(nextButton.element, { content: nextLabel }));
            interactiveStore.add(nextButton.onDidClick(() => this.navigate(1)));
            this._nextButton = nextButton;
            leftControls.appendChild(arrowsContainer);
            this._stepIndicator = dom.$('.chat-question-step-indicator');
            leftControls.appendChild(this._stepIndicator);
            this._footerRow.appendChild(leftControls);
            // Right side: hint + submit
            const rightControls = dom.$('.chat-question-footer-right');
            const hint = dom.$('span.chat-question-submit-hint');
            hint.textContent = isMacintosh
                ? localize('chat.questionCarousel.submitHintMac', '\u2318\u23CE to submit')
                : localize('chat.questionCarousel.submitHintOther', 'Ctrl+Enter to submit');
            rightControls.appendChild(hint);
            this._submitHint = hint;
            const submitButton = interactiveStore.add(new Button(rightControls, { ...defaultButtonStyles }));
            submitButton.element.classList.add('chat-question-submit-button');
            submitButton.label = localize('submit', 'Submit');
            interactiveStore.add(submitButton.onDidClick(() => this.submit()));
            this._submitButton = submitButton;
            this._footerRow.appendChild(rightControls);
            this.domNode.append(this._footerRow);
        }
        this.updateFooterState();
    }
    /**
     * Updates the footer nav button enabled state and step indicator text.
     */
    updateFooterState() {
        if (this._prevButton) {
            this._prevButton.enabled = this._currentIndex > 0;
        }
        if (this._nextButton) {
            const canAdvance = this._currentIndex < this.carousel.questions.length - 1;
            const question = this.carousel.questions[this._currentIndex];
            const answer = this._answers.get(question?.id);
            const hasAnswer = answer !== undefined && answer !== '';
            const hasValidationError = !!this._currentValidationError;
            this._nextButton.enabled = canAdvance && (!question?.required || hasAnswer) && !hasValidationError;
        }
        if (this._stepIndicator) {
            this._stepIndicator.textContent = localize('chat.questionCarousel.stepIndicator', '{0}/{1}', this._currentIndex + 1, this.carousel.questions.length);
        }
        if (this._submitButton) {
            const isLastQuestion = this._currentIndex === this.carousel.questions.length - 1;
            this._submitButton.element.style.display = isLastQuestion ? '' : 'none';
            if (this._submitHint) {
                this._submitHint.style.display = isLastQuestion ? '' : 'none';
            }
        }
    }
    /**
     * Renders a simplified footer with just a submit button for single-question multi-select carousels.
     */
    renderSingleQuestionFooter() {
        if (!this._footerRow) {
            const interactiveStore = this._interactiveUIStore.value;
            if (!interactiveStore) {
                return;
            }
            this._footerRow = dom.$('.chat-question-footer-row');
            // Spacer to push controls to the right
            const leftControls = dom.$('.chat-question-footer-left.chat-question-carousel-nav');
            leftControls.setAttribute('role', 'navigation');
            leftControls.setAttribute('aria-label', localize('chat.questionCarousel.navigation', 'Question navigation'));
            this._footerRow.appendChild(leftControls);
            const rightControls = dom.$('.chat-question-footer-right');
            const hint = dom.$('span.chat-question-submit-hint');
            hint.textContent = isMacintosh
                ? localize('chat.questionCarousel.submitHintMac', '\u2318\u23CE to submit')
                : localize('chat.questionCarousel.submitHintOther', 'Ctrl+Enter to submit');
            rightControls.appendChild(hint);
            this._submitHint = hint;
            const submitButton = interactiveStore.add(new Button(rightControls, { ...defaultButtonStyles }));
            submitButton.element.classList.add('chat-question-submit-button');
            submitButton.label = localize('submit', 'Submit');
            interactiveStore.add(submitButton.onDidClick(() => this.submit()));
            this._submitButton = submitButton;
            this._footerRow.appendChild(rightControls);
            this.domNode.append(this._footerRow);
        }
    }
    getLabelWithKeybinding(label, actionId) {
        const keybindingLabel = this._keybindingService.lookupKeybinding(actionId, this._contextKeyService)?.getLabel();
        return keybindingLabel
            ? localize('chat.questionCarousel.labelWithKeybinding', '{0} ({1})', label, keybindingLabel)
            : label;
    }
    renderInput(container, question) {
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
    setupTextareaAutoResize(textarea) {
        const autoResize = () => {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
            if (this._inputScrollable) {
                this.layoutInputScrollable(this._inputScrollable);
            }
            this._onDidChangeHeight.fire();
        };
        this._inputBoxes.add(dom.addDisposableListener(textarea, dom.EventType.INPUT, autoResize));
        return autoResize;
    }
    renderTextInput(container, question) {
        const inputBox = this._inputBoxes.add(new InputBox(container, undefined, {
            placeholder: localize('chat.questionCarousel.enterText', 'Enter your answer'),
            inputBoxStyles: defaultInputBoxStyles,
            validationOptions: question.validation ? {
                validation: (value) => {
                    if (!value && !question.required) {
                        return null;
                    }
                    const error = this.getValidationError(value, question.validation);
                    if (error) {
                        return { type: 2 /* MessageType.WARNING */, content: error };
                    }
                    return null;
                }
            } : undefined,
        }));
        this._inputBoxes.add(inputBox.onDidChange(() => {
            this.saveCurrentAnswer();
        }));
        // Restore previous answer if exists
        const previousAnswer = this._answers.get(question.id);
        if (previousAnswer !== undefined) {
            inputBox.value = String(previousAnswer);
        }
        else if (question.defaultValue !== undefined) {
            inputBox.value = String(question.defaultValue);
        }
        this._textInputBoxes.set(question.id, inputBox);
        // Focus on input when rendered using proper DOM scheduling
        if (this._shouldAutoFocus()) {
            this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(inputBox.element), () => inputBox.focus()));
        }
    }
    renderSingleSelect(container, question) {
        const orderedOptions = this.getOptionsWithDefaultsFirst(question);
        const selectContainer = dom.$('.chat-question-list');
        selectContainer.setAttribute('role', 'listbox');
        selectContainer.setAttribute('aria-label', question.title);
        selectContainer.tabIndex = 0;
        container.appendChild(selectContainer);
        // Restore previous answer if exists
        const previousAnswer = this._answers.get(question.id);
        const prevSingle = typeof previousAnswer === 'object' && previousAnswer !== null && hasKey(previousAnswer, { selectedValue: true }) ? previousAnswer : undefined;
        const previousFreeform = prevSingle?.freeformValue;
        const previousSelectedValue = prevSingle?.selectedValue;
        // Get default option id (for singleSelect, defaultValue is a single string)
        const defaultOptionId = typeof question.defaultValue === 'string' ? question.defaultValue : undefined;
        // Determine initially selected index
        let selectedIndex = -1;
        orderedOptions.forEach(({ option }, index) => {
            if (previousSelectedValue !== undefined && option.value === previousSelectedValue) {
                selectedIndex = index;
            }
            else if (selectedIndex === -1 && !previousFreeform && defaultOptionId !== undefined && option.id === defaultOptionId) {
                selectedIndex = index;
            }
        });
        const listItems = [];
        const indicators = [];
        const updateSelection = (newIndex) => {
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
            this.saveCurrentAnswer();
        };
        orderedOptions.forEach(({ option }, index) => {
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
                listItem.classList.add('has-description');
                const titleSpan = dom.$('span.chat-question-list-label-title');
                titleSpan.textContent = option.label.substring(0, separatorIndex);
                label.appendChild(titleSpan);
                const descSpan = dom.$('span.chat-question-list-label-desc');
                descSpan.textContent = option.label.substring(separatorIndex + 3);
                label.appendChild(descSpan);
            }
            else {
                label.textContent = option.label;
            }
            listItem.appendChild(label);
            listItem.appendChild(indicator);
            if (isSelected) {
                listItem.classList.add('selected');
            }
            // if we select an option, clear text and go to next question
            this._inputBoxes.add(dom.addDisposableListener(listItem, dom.EventType.CLICK, (e) => {
                e.preventDefault();
                e.stopPropagation();
                updateSelection(index);
                const freeform = this._freeformTextareas.get(question.id);
                if (freeform) {
                    freeform.value = '';
                }
                this.handleNextOrSubmit();
            }));
            this._inputBoxes.add(this._hoverService.setupDelayedHover(listItem, {
                content: option.label,
                position: { hoverPosition: 2 /* HoverPosition.BELOW */ },
                appearance: { showPointer: true }
            }));
            selectContainer.appendChild(listItem);
            listItems.push(listItem);
        });
        this._singleSelectItems.set(question.id, { items: listItems, selectedIndex, optionIndices: orderedOptions.map(o => o.originalIndex) });
        // Set initial aria-activedescendant if there's a selected item
        if (selectedIndex >= 0 && selectedIndex < listItems.length) {
            selectContainer.setAttribute('aria-activedescendant', listItems[selectedIndex].id);
        }
        // Show freeform input only when explicitly allowed
        let freeformTextarea;
        if (question.allowFreeformInput !== false) {
            const freeformContainer = dom.$('.chat-question-freeform');
            const freeformNumber = dom.$('.chat-question-freeform-number');
            freeformNumber.textContent = `${orderedOptions.length + 1}`;
            freeformContainer.appendChild(freeformNumber);
            freeformTextarea = dom.$('textarea.chat-question-freeform-textarea');
            freeformTextarea.placeholder = localize('chat.questionCarousel.enterCustomAnswer', 'Enter custom answer');
            freeformTextarea.rows = 1;
            if (previousFreeform !== undefined) {
                freeformTextarea.value = previousFreeform;
            }
            // Setup auto-resize behavior
            const autoResize = this.setupTextareaAutoResize(freeformTextarea);
            // clear when we start typing in freeform
            const capturedFreeform = freeformTextarea;
            this._inputBoxes.add(dom.addDisposableListener(capturedFreeform, dom.EventType.INPUT, () => {
                if (capturedFreeform.value.length > 0) {
                    updateSelection(-1);
                }
                else {
                    this.saveCurrentAnswer();
                }
            }));
            freeformContainer.appendChild(freeformTextarea);
            container.appendChild(freeformContainer);
            this._freeformTextareas.set(question.id, freeformTextarea);
            // Resize textarea if it has restored content
            if (previousFreeform !== undefined) {
                this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(capturedFreeform), () => autoResize()));
            }
        }
        // Keyboard navigation for the list
        this._inputBoxes.add(dom.addDisposableListener(selectContainer, dom.EventType.KEY_DOWN, (e) => {
            const event = new StandardKeyboardEvent(e);
            const data = this._singleSelectItems.get(question.id);
            if (!data || !listItems.length) {
                return;
            }
            let newIndex = data.selectedIndex;
            if (event.keyCode === 18 /* KeyCode.DownArrow */) {
                e.preventDefault();
                newIndex = Math.min(data.selectedIndex + 1, listItems.length - 1);
            }
            else if (event.keyCode === 16 /* KeyCode.UpArrow */) {
                e.preventDefault();
                newIndex = Math.max(data.selectedIndex - 1, 0);
            }
            else if ((event.keyCode === 3 /* KeyCode.Enter */ || event.keyCode === 10 /* KeyCode.Space */) && !event.metaKey && !event.ctrlKey) {
                // Enter confirms current selection and advances to next question
                e.preventDefault();
                e.stopPropagation();
                this.handleNextOrSubmit();
                return;
            }
            else if (event.keyCode >= 22 /* KeyCode.Digit1 */ && event.keyCode <= 30 /* KeyCode.Digit9 */) {
                // Number keys 1-9 select the corresponding option, or focus freeform for next number
                const numberIndex = event.keyCode - 22 /* KeyCode.Digit1 */;
                if (numberIndex < listItems.length) {
                    e.preventDefault();
                    updateSelection(numberIndex);
                }
                else if (freeformTextarea && numberIndex === listItems.length) {
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
        // focus on the row when first rendered or textarea if it has content
        if (this._shouldAutoFocus()) {
            if (freeformTextarea && previousFreeform) {
                const capturedFreeform = freeformTextarea;
                this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(capturedFreeform), () => {
                    capturedFreeform.focus();
                }));
            }
            else if (listItems.length > 0) {
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
    renderMultiSelect(container, question) {
        const orderedOptions = this.getOptionsWithDefaultsFirst(question);
        const selectContainer = dom.$('.chat-question-list');
        selectContainer.setAttribute('role', 'listbox');
        selectContainer.setAttribute('aria-multiselectable', 'true');
        selectContainer.setAttribute('aria-label', question.title);
        selectContainer.tabIndex = 0;
        container.appendChild(selectContainer);
        // Restore previous answer if exists
        const previousAnswer = this._answers.get(question.id);
        const prevMulti = typeof previousAnswer === 'object' && previousAnswer !== null && hasKey(previousAnswer, { selectedValues: true }) ? previousAnswer : undefined;
        const previousFreeform = prevMulti?.freeformValue;
        const previousSelectedValues = prevMulti?.selectedValues ?? [];
        // Get default option ids (for multiSelect, defaultValue can be string or string[])
        const defaultOptionIds = Array.isArray(question.defaultValue)
            ? question.defaultValue
            : (typeof question.defaultValue === 'string' ? [question.defaultValue] : []);
        const checkboxes = [];
        const listItems = [];
        let focusedIndex = 0;
        let firstCheckedIndex = -1;
        orderedOptions.forEach(({ option }, index) => {
            // Determine initial checked state
            let isChecked = false;
            if (previousSelectedValues && previousSelectedValues.length > 0) {
                isChecked = previousSelectedValues.includes(option.value);
            }
            else if (!previousFreeform && defaultOptionIds.includes(option.id)) {
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
                listItem.classList.add('has-description');
                const titleSpan = dom.$('span.chat-question-list-label-title');
                titleSpan.textContent = option.label.substring(0, separatorIndex);
                label.appendChild(titleSpan);
                const descSpan = dom.$('span.chat-question-list-label-desc');
                descSpan.textContent = option.label.substring(separatorIndex + 3);
                label.appendChild(descSpan);
            }
            else {
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
                this.saveCurrentAnswer();
            }));
            // Click handler for the entire row (toggle checkbox)
            this._inputBoxes.add(dom.addDisposableListener(listItem, dom.EventType.CLICK, (e) => {
                // Update focusedIndex when clicking a row
                focusedIndex = index;
                // Don't toggle if the click was on the checkbox itself (it handles itself)
                if (e.target !== checkbox.domNode && !checkbox.domNode.contains(e.target)) {
                    // Use click() to trigger onChange and sync visual state
                    checkbox.domNode.click();
                }
            }));
            this._inputBoxes.add(this._hoverService.setupDelayedHover(listItem, {
                content: option.label,
                position: { hoverPosition: 2 /* HoverPosition.BELOW */ },
                appearance: { showPointer: true }
            }));
            selectContainer.appendChild(listItem);
            checkboxes.push(checkbox);
            listItems.push(listItem);
        });
        this._multiSelectCheckboxes.set(question.id, { checkboxes, optionIndices: orderedOptions.map(o => o.originalIndex) });
        // Show freeform input only when explicitly allowed
        let freeformTextarea;
        if (question.allowFreeformInput !== false) {
            const freeformContainer = dom.$('.chat-question-freeform');
            // Number indicator for freeform (comes after all options)
            const freeformNumber = dom.$('.chat-question-freeform-number');
            freeformNumber.textContent = `${orderedOptions.length + 1}`;
            freeformContainer.appendChild(freeformNumber);
            freeformTextarea = dom.$('textarea.chat-question-freeform-textarea');
            freeformTextarea.placeholder = localize('chat.questionCarousel.enterCustomAnswer', 'Enter custom answer');
            freeformTextarea.rows = 1;
            if (previousFreeform !== undefined) {
                freeformTextarea.value = previousFreeform;
            }
            // Setup auto-resize behavior
            const autoResize = this.setupTextareaAutoResize(freeformTextarea);
            this._inputBoxes.add(dom.addDisposableListener(freeformTextarea, dom.EventType.INPUT, () => this.saveCurrentAnswer()));
            freeformContainer.appendChild(freeformTextarea);
            container.appendChild(freeformContainer);
            this._freeformTextareas.set(question.id, freeformTextarea);
            // Resize textarea if it has restored content
            if (previousFreeform !== undefined) {
                this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(freeformTextarea), () => autoResize()));
            }
        }
        // Keyboard navigation for the list
        this._inputBoxes.add(dom.addDisposableListener(selectContainer, dom.EventType.KEY_DOWN, (e) => {
            const event = new StandardKeyboardEvent(e);
            // Guard against empty list
            if (!listItems.length) {
                return;
            }
            if (event.keyCode === 18 /* KeyCode.DownArrow */) {
                e.preventDefault();
                focusedIndex = Math.min(focusedIndex + 1, listItems.length - 1);
                listItems[focusedIndex].focus();
            }
            else if (event.keyCode === 16 /* KeyCode.UpArrow */) {
                e.preventDefault();
                focusedIndex = Math.max(focusedIndex - 1, 0);
                listItems[focusedIndex].focus();
            }
            else if (event.keyCode === 3 /* KeyCode.Enter */ && !event.metaKey && !event.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                this.handleNextOrSubmit();
            }
            else if (event.keyCode === 10 /* KeyCode.Space */) {
                e.preventDefault();
                // Toggle the currently focused checkbox using click() to trigger onChange
                if (focusedIndex >= 0 && focusedIndex < checkboxes.length) {
                    checkboxes[focusedIndex].domNode.click();
                }
            }
            else if (event.keyCode >= 22 /* KeyCode.Digit1 */ && event.keyCode <= 30 /* KeyCode.Digit9 */) {
                // Number keys 1-9 toggle the corresponding checkbox, or focus freeform for next number
                const numberIndex = event.keyCode - 22 /* KeyCode.Digit1 */;
                if (numberIndex < checkboxes.length) {
                    e.preventDefault();
                    checkboxes[numberIndex].domNode.click();
                }
                else if (freeformTextarea && numberIndex === checkboxes.length) {
                    e.preventDefault();
                    freeformTextarea.focus();
                }
            }
        }));
        // Focus on the appropriate row when rendered or textarea if it has content
        if (this._shouldAutoFocus()) {
            if (freeformTextarea && previousFreeform) {
                const capturedFreeform = freeformTextarea;
                this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(capturedFreeform), () => {
                    capturedFreeform.focus();
                }));
            }
            else if (listItems.length > 0) {
                const initialFocusIndex = firstCheckedIndex >= 0 ? firstCheckedIndex : 0;
                focusedIndex = initialFocusIndex;
                this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(selectContainer), () => {
                    listItems[initialFocusIndex]?.focus();
                }));
            }
        }
    }
    getCurrentAnswer() {
        const question = this.carousel.questions[this._currentIndex];
        if (!question) {
            return undefined;
        }
        switch (question.type) {
            case 'text': {
                const inputBox = this._textInputBoxes.get(question.id);
                return inputBox?.value ?? (typeof question.defaultValue === 'string' ? question.defaultValue : Array.isArray(question.defaultValue) ? { selectedValues: question.defaultValue } : undefined);
            }
            case 'singleSelect': {
                const data = this._singleSelectItems.get(question.id);
                let selectedValue = undefined;
                if (data && data.selectedIndex >= 0) {
                    const originalIndex = data.optionIndices[data.selectedIndex];
                    selectedValue = originalIndex !== undefined ? question.options?.[originalIndex]?.value : undefined;
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
                const data = this._multiSelectCheckboxes.get(question.id);
                const selectedValues = [];
                if (data) {
                    data.checkboxes.forEach((checkbox, index) => {
                        if (checkbox.checked) {
                            const originalIndex = data.optionIndices[index];
                            const value = originalIndex !== undefined ? question.options?.[originalIndex]?.value : undefined;
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
                return typeof question.defaultValue === 'string' ? question.defaultValue : Array.isArray(question.defaultValue) ? { selectedValues: question.defaultValue } : undefined;
        }
    }
    getOptionsWithDefaultsFirst(question) {
        const options = question.options ?? [];
        const orderedOptions = options.map((option, index) => ({ option, originalIndex: index }));
        const defaultOptionIds = Array.isArray(question.defaultValue)
            ? question.defaultValue
            : (typeof question.defaultValue === 'string' ? [question.defaultValue] : []);
        if (defaultOptionIds.length === 0) {
            return orderedOptions;
        }
        const defaultIds = new Set(defaultOptionIds);
        const defaults = [];
        const nonDefaults = [];
        for (const item of orderedOptions) {
            if (defaultIds.has(item.option.id)) {
                defaults.push(item);
            }
            else {
                nonDefaults.push(item);
            }
        }
        return [...defaults, ...nonDefaults];
    }
    /**
     * Renders a "Skipped" message when the carousel is dismissed without answers.
     */
    renderSkippedMessage() {
        const skippedContainer = dom.$('.chat-question-carousel-summary');
        const skippedMessage = dom.$('.chat-question-summary-skipped');
        skippedMessage.textContent = localize('chat.questionCarousel.skipped', 'Skipped');
        skippedContainer.appendChild(skippedMessage);
        this.domNode.appendChild(skippedContainer);
    }
    /**
     * Renders a summary of answers when the carousel is already used.
     */
    renderSummary() {
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
            const summaryItem = dom.$('.chat-question-summary-item');
            const questionRow = dom.$('div.chat-question-summary-label');
            const questionText = question.message ?? question.title;
            let labelText = typeof questionText === 'string' ? questionText : questionText.value;
            labelText = labelText.replace(/[:\s]+$/, '');
            questionRow.textContent = localize('chat.questionCarousel.summaryQuestion', 'Q: {0}', labelText);
            summaryItem.appendChild(questionRow);
            if (answer !== undefined) {
                const formattedAnswer = this.formatAnswerForSummary(question, answer);
                const answerRow = dom.$('div.chat-question-summary-answer-title');
                answerRow.textContent = localize('chat.questionCarousel.summaryAnswer', 'A: {0}', formattedAnswer);
                summaryItem.appendChild(answerRow);
            }
            else {
                const unanswered = dom.$('div.chat-question-summary-unanswered');
                unanswered.textContent = localize('chat.questionCarousel.notAnsweredYet', 'Not answered yet');
                summaryItem.appendChild(unanswered);
            }
            summaryContainer.appendChild(summaryItem);
        }
        this.domNode.appendChild(summaryContainer);
    }
    /**
     * Formats an answer for display in the summary.
     */
    formatAnswerForSummary(question, answer) {
        switch (question.type) {
            case 'text':
                return String(answer);
            case 'singleSelect': {
                if (typeof answer === 'object') {
                    const { selectedValue, freeformValue } = answer;
                    const selectedLabel = selectedValue !== undefined ? question.options?.find(opt => opt.value === selectedValue)?.label : undefined;
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
                if (typeof answer === 'object' && hasKey(answer, { selectedValues: true })) {
                    const { selectedValues, freeformValue } = answer;
                    const labels = selectedValues
                        .map(v => question.options?.find(opt => opt.value === v)?.label ?? String(v));
                    // For multiSelect, combine selections and freeform with comma separator
                    if (freeformValue) {
                        labels.push(freeformValue);
                    }
                    return labels.join(localize('chat.questionCarousel.listSeparator', ', '));
                }
                return String(answer);
            }
            default:
                return String(answer);
        }
    }
    getQuestionText(questionText) {
        const md = typeof questionText === 'string' ? new MarkdownString(questionText) : questionText;
        return renderAsPlaintext(md);
    }
    /**
     * Validates the current question's answer against its validation rules.
     * Returns true if valid, false if validation errors were shown.
     */
    validateCurrentQuestion() {
        const question = this.carousel.questions[this._currentIndex];
        if (!question) {
            return true;
        }
        const answer = this._answers.get(question.id);
        // Check required
        if (question.required && (answer === undefined || answer === '')) {
            this.showValidationError(localize('chat.questionCarousel.required', 'This field is required'));
            return false;
        }
        // Validate text inputs
        if (question.type === 'text' && question.validation && typeof answer === 'string' && answer !== '') {
            const error = this.getValidationError(answer, question.validation);
            if (error) {
                this.showValidationError(error);
                return false;
            }
        }
        this.clearValidationError();
        return true;
    }
    /**
     * Validates that all required questions have been answered.
     * Returns true if all required fields are satisfied.
     */
    validateRequiredFields() {
        for (let i = 0; i < this.carousel.questions.length; i++) {
            const question = this.carousel.questions[i];
            if (!question.required) {
                continue;
            }
            const answer = this._answers.get(question.id);
            if (answer === undefined || answer === '') {
                // Navigate to the unanswered required question
                this.saveCurrentAnswer();
                this._currentIndex = i;
                this.persistDraftState();
                this.renderCurrentQuestion(true);
                this.showValidationError(localize('chat.questionCarousel.required', 'This field is required'));
                return false;
            }
        }
        return true;
    }
    /**
     * Returns a validation error message for the given value, or undefined if valid.
     */
    getValidationError(value, validation) {
        if (validation.minLength !== undefined && value.length < validation.minLength) {
            return localize('chat.questionCarousel.validation.minLength', 'Minimum length is {0}', validation.minLength);
        }
        if (validation.maxLength !== undefined && value.length > validation.maxLength) {
            return localize('chat.questionCarousel.validation.maxLength', 'Maximum length is {0}', validation.maxLength);
        }
        if (validation.format) {
            switch (validation.format) {
                case 'email':
                    if (!value.includes('@')) {
                        return localize('chat.questionCarousel.validation.email', 'Please enter a valid email address');
                    }
                    break;
                case 'uri':
                    if (!URL.canParse(value)) {
                        return localize('chat.questionCarousel.validation.uri', 'Please enter a valid URI');
                    }
                    break;
                case 'date': {
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    if (!dateRegex.test(value) || isNaN(new Date(value).getTime())) {
                        return localize('chat.questionCarousel.validation.date', 'Please enter a valid date (YYYY-MM-DD)');
                    }
                    break;
                }
                case 'date-time':
                    if (isNaN(new Date(value).getTime())) {
                        return localize('chat.questionCarousel.validation.dateTime', 'Please enter a valid date-time');
                    }
                    break;
            }
        }
        if (validation.isInteger !== undefined || validation.minimum !== undefined || validation.maximum !== undefined) {
            const num = Number(value);
            if (isNaN(num)) {
                return localize('chat.questionCarousel.validation.number', 'Please enter a valid number');
            }
            if (validation.isInteger && !Number.isInteger(num)) {
                return localize('chat.questionCarousel.validation.integer', 'Please enter a valid integer');
            }
            if (validation.minimum !== undefined && num < validation.minimum) {
                return localize('chat.questionCarousel.validation.minimum', 'Minimum value is {0}', validation.minimum);
            }
            if (validation.maximum !== undefined && num > validation.maximum) {
                return localize('chat.questionCarousel.validation.maximum', 'Maximum value is {0}', validation.maximum);
            }
        }
        return undefined;
    }
    showValidationError(message) {
        this._currentValidationError = message;
        if (this._validationMessageElement) {
            this._validationMessageElement.textContent = message;
            this._validationMessageElement.style.display = '';
        }
    }
    clearValidationError() {
        this._currentValidationError = undefined;
        if (this._validationMessageElement) {
            this._validationMessageElement.textContent = '';
            this._validationMessageElement.style.display = 'none';
        }
    }
    hasSameContent(other, _followingContent, element) {
        // does not have same content when it is not skipped and is active and we stop the response
        if (!this._isSkipped && !this.carousel.isUsed && isResponseVM(element) && element.isComplete) {
            return false;
        }
        return other.kind === 'questionCarousel' && other === this.carousel;
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
    dispose() {
        if (!this._isSkipped && !this.carousel.isUsed) {
            this.saveCurrentAnswer();
        }
        super.dispose();
    }
};
ChatQuestionCarouselPart = __decorate([
    __param(3, IMarkdownRendererService),
    __param(4, IHoverService),
    __param(5, IAccessibilityService),
    __param(6, IContextKeyService),
    __param(7, IKeybindingService)
], ChatQuestionCarouselPart);
export { ChatQuestionCarouselPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRRdWVzdGlvbkNhcm91c2VsUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQW1CLGNBQWMsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRWpILE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDNUcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQzNHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxxQkFBcUIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzlJLE9BQU8sRUFBRSxNQUFNLEVBQUUs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