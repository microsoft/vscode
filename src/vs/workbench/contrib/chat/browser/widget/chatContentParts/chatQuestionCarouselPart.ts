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
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Checkbox } from '../../../../../../base/browser/ui/toggle/toggle.js';
import { IChatQuestion, IChatQuestionCarousel, IChatQuestionAnswerValue, IChatQuestionValidation, IChatSingleSelectAnswer, IChatMultiSelectAnswer } from '../../../common/chatService/chatService.js';
import { findQuestionValidationFailure, getDisplayedQuestionText, getOptionsWithDefaultsFirst, isBooleanQuestion } from '../../../common/chatService/chatQuestionCarouselHelpers.js';
import { CHAT_QUESTION_PASSWORD_MASK, ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { IChatRendererContent, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { HoverPosition } from '../../../../../../base/browser/ui/hover/hoverWidget.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ITerminalChatService } from '../../../../terminal/browser/terminal.js';
import { AgentHostAutoReplyAnswer } from '../../../../../../platform/agentHost/common/agentHostSchema.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
import { ChatContentMarkdownRenderer } from '../chatContentMarkdownRenderer.js';
import { getCompactCodicon } from '../../chatIcons.js';
import { CHAT_CARD_HEADER_CLASS, CHAT_CARD_LARGE_CLASS, CHAT_CARD_TITLE_CLASS, createChatCardIconButton } from '../chatCard.js';
import { ChatCardListbox } from '../chatCardListbox.js';
import { ChatQuestionAnswerEditor } from './chatQuestionAnswerEditor.js';
import './media/chatQuestionCarousel.css';

const PREVIOUS_QUESTION_ACTION_ID = 'workbench.action.chat.previousQuestion';
const NEXT_QUESTION_ACTION_ID = 'workbench.action.chat.nextQuestion';
const MAX_CAROUSEL_HEIGHT = 420;
const MAX_CAROUSEL_VIEWPORT_RATIO = 0.45;
/** The answers count as in view once their top edge is this far above the bottom of the scroll body. */
const ANSWERS_VISIBLE_THRESHOLD = 24;
/** How much of the content preceding the answers stays visible when scrolling them into view. */
const ANSWERS_REVEAL_CONTEXT = 32;
/** How far the scroll body moves for one arrow key press. */
const BODY_SCROLL_LINE_HEIGHT = 20;

/**
 * The title renders as one line of inline markdown, so a leading block marker must not start a block:
 * "6. Timeframe" would otherwise render as an indented ordered list starting at 6.
 */
function escapeLeadingMarkdownBlockSyntax(value: string): string {
	return value.replace(/^(?<prefix>\s*\d*)(?<marker>[.)\-+*#>])(?=\s)/, '$<prefix>\\$<marker>');
}

export interface IChatQuestionCarouselOptions {
	/** `byUser` is `true` only when the person submitted or dismissed the carousel themselves. */
	onSubmit: (answers: Map<string, IChatQuestionAnswerValue> | undefined, byUser?: boolean) => void;
	onDidDismiss?: (answers: ReadonlyMap<string, IChatQuestionAnswerValue>) => void;
	dismissLabel?: string;
	submissionAcknowledgement?: {
		readonly message: string;
		readonly description?: IMarkdownString;
		readonly dismissLabel: string;
		readonly onDidDismiss: () => void;
	};
	shouldAutoFocus?: boolean;
	shouldAutoSelectFirstOption?: boolean;
	/** Node hosting the answer editors' overflow widgets (e.g. suggest) so they aren't clipped by the carousel. */
	editorOverflowWidgetsDomNode?: HTMLElement;
	/** Session the answers belong to, for hosts whose render context has no response element. */
	sessionResource?: URI;
}

class ChatQuestionAnswerCollapsiblePart extends ChatCollapsibleContentPart {
	constructor(
		title: string,
		private readonly prefix: string | undefined,
		private readonly value: string,
		private readonly answerIcon: ThemeIcon,
		context: IChatContentPartRenderContext,
		private readonly contentFactory: (() => HTMLElement) | undefined,
		private readonly onDidChangeHeight: () => void,
		hoverService: IHoverService,
		configurationService: IConfigurationService,
		telemetryService: ITelemetryService,
	) {
		super(title, context, undefined, hoverService, configurationService, telemetryService);
	}

	protected override get collapsibleKind(): string {
		return 'questionCarousel';
	}

	protected override init(): HTMLElement {
		const element = super.init();
		element.classList.toggle('chat-question-answer-expandable', !!this.contentFactory);
		if (this._collapseButton) {
			const labelElement = this._collapseButton.labelElement;
			labelElement.textContent = '';
			const icon = dom.$('span.chat-question-summary-answer-icon');
			icon.classList.add(...ThemeIcon.asClassNameArray(getCompactCodicon(this.answerIcon)));
			icon.setAttribute('aria-hidden', 'true');
			const value = dom.$('span.chat-question-summary-answer-value');
			value.textContent = this.value;
			this._register(this.hoverService.setupDelayedHover(value, { content: this.value }));
			labelElement.appendChild(icon);
			if (this.prefix) {
				const prefix = dom.$('span.chat-question-summary-prefix');
				prefix.textContent = this.prefix;
				labelElement.append(prefix, labelElement.ownerDocument.createTextNode(' '));
			}
			labelElement.appendChild(value);
			if (!this.contentFactory) {
				this._collapseButton.element.tabIndex = -1;
				this._collapseButton.element.setAttribute('aria-disabled', 'true');
				this._collapseButton.element.removeAttribute('aria-expanded');
				this._hoverChevron?.remove();
			}
		}
		return element;
	}

	protected override initContent(): HTMLElement {
		return this.contentFactory?.() ?? dom.$('.chat-question-summary-empty-content');
	}

	protected override expansionDidChange(): void {
		this.onDidChangeHeight();
	}

	hasSameContent(_other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		return false;
	}
}

export class ChatQuestionCarouselPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight: Event<void> = this._onDidChangeHeight.event;

	private _currentIndex = 0;
	private readonly _answers = new Map<string, IChatQuestionAnswerValue>();
	private _isCollapsed = false;
	private _isMaximized = false;

	private _questionContainer: HTMLElement | undefined;
	private _headerActionsContainer: HTMLElement | undefined;
	private _closeButtonContainer: HTMLElement | undefined;
	private _footerRow: HTMLElement | undefined;
	private _stepIndicator: HTMLElement | undefined;
	private _primaryButton: Button | undefined;
	private _primaryState: 'nav' | 'action' | undefined;
	private _primaryAnimations: Animation[] = [];
	private _collapseButton: Button | undefined;
	private _maximizeButton: Button | undefined;
	private _bodyScrollable: DomScrollableElement | undefined;
	private _answersContainer: HTMLElement | undefined;
	/** Focuses the current question's answer control; set by the input renderers. */
	private _focusAnswer: (() => void) | undefined;
	private _prevButton: Button | undefined;
	private _nextButton: Button | undefined;
	private _skipAllButton: Button | undefined;

	private _isSkipped = false;

	private readonly _textAnswerEditors: Map<string, ChatQuestionAnswerEditor> = new Map();
	private readonly _singleSelectItems: Map<string, { items: HTMLElement[]; selectedIndex: number; optionIndices: number[] }> = new Map();
	private readonly _multiSelectCheckboxes: Map<string, { checkboxes: Checkbox[]; optionIndices: number[] }> = new Map();
	private readonly _freeformAnswerEditors: Map<string, ChatQuestionAnswerEditor> = new Map();
	private readonly _passwordInputs: Map<string, InputBox> = new Map();
	/** Custom answer text that a selected option overrides, kept so it survives navigating between questions. */
	private readonly _ignoredFreeformValues = new Map<string, string>();
	private readonly _inputBoxes: DisposableStore = this._register(new DisposableStore());
	private readonly _questionRenderStore = this._register(new MutableDisposable<DisposableStore>());

	/**
	 * Disposable store for interactive UI components (header, nav buttons, etc.)
	 * that should be disposed when transitioning to summary view.
	 */
	private readonly _interactiveUIStore: MutableDisposable<DisposableStore> = this._register(new MutableDisposable());
	private readonly _inChatQuestionCarouselContextKey: IContextKey<boolean>;
	private readonly _chatQuestionCarouselHasTerminalContextKey: IContextKey<boolean>;
	private readonly _markdownRenderer: ChatContentMarkdownRenderer;
	private _validationMessageElement: HTMLElement | undefined;
	private _currentValidationError: string | undefined;
	private _focusTerminalButtonContainer: HTMLElement | undefined;

	constructor(
		public readonly carousel: IChatQuestionCarousel,
		private readonly _context: IChatContentPartRenderContext | undefined,
		private readonly _options: IChatQuestionCarouselOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
	) {
		super();

		this._markdownRenderer = this._instantiationService.createInstance(ChatContentMarkdownRenderer);
		this.domNode = dom.$(`.chat-question-carousel-container.${CHAT_CARD_LARGE_CLASS}`);
		this.domNode.style.setProperty('--chat-question-carousel-max-height', `min(${MAX_CAROUSEL_HEIGHT}px, ${MAX_CAROUSEL_VIEWPORT_RATIO * 100}vh)`);
		this.domNode.classList.toggle('chat-question-carousel-conversation', carousel.answerPresentation === 'conversation');
		this.domNode.id = generateUuid();
		this._inChatQuestionCarouselContextKey = ChatContextKeys.inChatQuestionCarousel.bindTo(this._contextKeyService);
		this._chatQuestionCarouselHasTerminalContextKey = ChatContextKeys.chatQuestionCarouselHasTerminal.bindTo(this._contextKeyService);
		const focusTracker = this._register(dom.trackFocus(this.domNode));
		this._register(focusTracker.onDidFocus(() => {
			this._inChatQuestionCarouselContextKey.set(true);
			this._chatQuestionCarouselHasTerminalContextKey.set(!!this.carousel.terminalId);
		}));
		this._register(focusTracker.onDidBlur(() => {
			this._inChatQuestionCarouselContextKey.set(false);
			this._chatQuestionCarouselHasTerminalContextKey.reset();
		}));
		this._register({ dispose: () => { this._inChatQuestionCarouselContextKey.reset(); this._chatQuestionCarouselHasTerminalContextKey.reset(); } });

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
		const responseIsComplete = !!this._context && isResponseVM(this._context.element) && this._context.element.isComplete;
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
		const collapseButton = createChatCardIconButton(interactiveStore, this._headerActionsContainer, this._hoverService, {
			ariaLabel: collapseToggleTitle,
		});
		collapseButton.element.classList.add('chat-question-collapse-toggle');
		this._collapseButton = collapseButton;

		// Maximize toggle - only visible when the body overflows or the carousel is maximized
		const maximizeButton = createChatCardIconButton(interactiveStore, this._headerActionsContainer, this._hoverService, {
			ariaLabel: localize('chat.questionCarousel.maximize', "Maximize"),
		});
		maximizeButton.element.classList.add('chat-question-maximize-toggle');
		this._maximizeButton = maximizeButton;

		// Close/skip button (X) - placed in header row, only shown when allowSkip is true
		if (carousel.allowSkip) {
			this._closeButtonContainer = dom.$('.chat-question-close-container');
			const skipAllTitle = this._options.dismissLabel ?? localize('chat.questionCarousel.skipAllTitle', 'Skip all questions');
			const skipAllButton = createChatCardIconButton(interactiveStore, this._closeButtonContainer, this._hoverService, {
				icon: Codicon.closeSmall,
				ariaLabel: skipAllTitle,
				hoverContent: skipAllTitle,
			});
			skipAllButton.element.classList.add('chat-question-close');
			this._skipAllButton = skipAllButton;
		}

		// Focus Terminal button - shown when the carousel was triggered by terminal input
		if (carousel.terminalId) {
			this._focusTerminalButtonContainer = dom.$('.chat-question-focus-terminal-container');
			const focusTerminalTitle = localize('chat.questionCarousel.focusTerminalTitle', 'Focus Terminal');
			const kbLabel = this._keybindingService.lookupKeybinding('workbench.action.chat.focusQuestionCarouselTerminal')?.getLabel();
			const focusTerminalAriaLabel = kbLabel
				? localize('chat.questionCarousel.focusTerminalAriaLabel', 'Focus Terminal ({0})', kbLabel)
				: focusTerminalTitle;
			const focusTerminalButton = createChatCardIconButton(interactiveStore, this._focusTerminalButtonContainer, this._hoverService, {
				icon: Codicon.terminal,
				ariaLabel: focusTerminalAriaLabel,
				hoverContent: focusTerminalTitle,
			});
			focusTerminalButton.element.classList.add('chat-question-focus-terminal');
			interactiveStore.add(focusTerminalButton.onDidClick(() => this._focusTerminal()));

			// Dismiss the carousel when the user types directly in the terminal,
			// since they are answering the prompt themselves.
			const terminalInstance = this._terminalChatService.getTerminalInstanceByExecutionId(carousel.terminalId);
			if (terminalInstance) {
				interactiveStore.add(terminalInstance.onDidInputData(() => {
					if (!this._isSkipped) {
						if (carousel instanceof ChatQuestionCarouselData) {
							carousel.dismissedByTerminalInput = true;
						}
						this.ignore();
					}
				}));
			}
		}

		// Register event listeners
		interactiveStore.add(collapseButton.onDidClick(() => this.toggleCollapsed()));
		interactiveStore.add(maximizeButton.onDidClick(() => this.toggleMaximized()));

		if (this._skipAllButton) {
			interactiveStore.add(this._skipAllButton.onDidClick(() => this.ignore(true)));
		}

		// Capture phase, because buttons consume Escape themselves and would otherwise leave the card maximized.
		interactiveStore.add(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (new StandardKeyboardEvent(e).keyCode !== KeyCode.Escape || !this._isMaximized) {
				return;
			}
			const answerEditor = this.getAnswerEditorForTarget(e.target);
			if (answerEditor?.isSuggestWidgetVisible()) {
				// Escape closes the suggest widget; leave it to the editor.
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			this.toggleMaximized();
			if (!dom.isAncestorOfActiveElement(this.domNode)) {
				maximizeButton.focus();
			}
		}, true));

		// Register keyboard navigation
		interactiveStore.add(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			const answerEditor = this.getAnswerEditorForTarget(e.target);
			if (event.keyCode === KeyCode.Escape && answerEditor?.isSuggestWidgetVisible()) {
				// Escape closes the suggest widget; leave it to the editor.
				return;
			}
			if (event.keyCode === KeyCode.Escape && this.carousel.allowSkip) {
				e.preventDefault();
				e.stopPropagation();
				this.ignore(true);
			} else if (event.keyCode === KeyCode.Enter && (event.metaKey || event.ctrlKey)) {
				// Cmd/Ctrl+Enter submits immediately from anywhere
				e.preventDefault();
				e.stopPropagation();
				this.submit();
			} else if (!answerEditor && (event.ctrlKey || event.metaKey) && (event.keyCode === KeyCode.Backspace || event.keyCode === KeyCode.Delete)) {
				e.stopPropagation();
			}
		}));

		// Initialize the carousel
		this.renderCurrentQuestion();
	}

	/**
	 * Finds the answer editor containing the given event target, if any.
	 */
	private getAnswerEditorForTarget(target: EventTarget | null): ChatQuestionAnswerEditor | undefined {
		if (!dom.isHTMLElement(target)) {
			return undefined;
		}
		for (const editors of [this._textAnswerEditors, this._freeformAnswerEditors]) {
			for (const editor of editors.values()) {
				if (editor.domNode.contains(target)) {
					return editor;
				}
			}
		}
		return undefined;
	}

	/**
	 * Saves the current question's answer to the answers map.
	 */
	private saveCurrentAnswer(): void {
		const currentQuestion = this.carousel.questions[this._currentIndex];
		const answer = this.getCurrentAnswer();
		if (answer !== undefined) {
			this._answers.set(currentQuestion.id, answer);
		} else {
			this._answers.delete(currentQuestion.id);
		}

		// Validate on change to update the Next button state
		if (currentQuestion?.validation && typeof answer === 'string' && answer !== '') {
			const error = this.getValidationError(answer, currentQuestion.validation);
			if (error) {
				this.showValidationError(error);
			} else {
				this.clearValidationError();
			}
		} else {
			this.clearValidationError();
		}

		this.updateFooterState();
		this.persistDraftState();
	}

	private persistDraftState(): void {
		if (this.carousel.isUsed || !(this.carousel instanceof ChatQuestionCarouselData)) {
			return;
		}

		this.carousel.draftAnswers = Object.fromEntries(this.getAnswersWithoutPasswords().entries());
		this.carousel.draftCurrentIndex = this._currentIndex;
		this.carousel.draftCollapsed = this._isCollapsed;
	}

	private getAnswersWithoutPasswords(): Map<string, IChatQuestionAnswerValue> {
		const answers = new Map(this._answers);
		for (const question of this.carousel.questions) {
			if (question.password) {
				answers.delete(question.id);
			}
		}
		return answers;
	}

	private submitAnswers(): void {
		this._options.onSubmit(new Map(this._answers), true);
		for (const question of this.carousel.questions) {
			if (question.password && this._answers.has(question.id)) {
				this._answers.set(question.id, CHAT_QUESTION_PASSWORD_MASK);
			}
		}
		this.hideAndShowSummary();
	}

	private toggleCollapsed(): void {
		this._isCollapsed = !this._isCollapsed;
		this.persistDraftState();
		this.updateCollapsedPresentation();
		this._onDidChangeHeight.fire();
	}

	private toggleMaximized(): void {
		this._isMaximized = !this._isMaximized;
		this.updateMaximizePresentation();
		this._onDidChangeHeight.fire();
	}

	private _focusTerminal(): void {
		const terminalId = this.carousel.terminalId;
		if (!terminalId) {
			return;
		}
		this._commandService.executeCommand('workbench.action.terminal.chat.focusTerminalByExecutionId', terminalId);
	}

	private updateCollapsedPresentation(): void {
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

		this.updateMaximizePresentation();
	}

	private updateMaximizePresentation(): void {
		this.domNode.classList.toggle('chat-question-carousel-maximized', this._isMaximized);
		this.updatePrimaryState();

		if (!this._maximizeButton) {
			return;
		}

		const maximized = this._isMaximized;
		const label = maximized
			? localize('chat.questionCarousel.restoreSize', "Restore Size")
			: localize('chat.questionCarousel.maximize', "Maximize");
		this._maximizeButton.label = maximized ? `$(${Codicon.screenNormal.id})` : `$(${Codicon.screenFull.id})`;
		this._maximizeButton.element.setAttribute('aria-label', label);
		this._maximizeButton.element.setAttribute('aria-expanded', String(maximized));
		this._maximizeButton.setTitle(label);

		this.updateMaximizeVisibility();
	}

	private updateMaximizeVisibility(): void {
		if (!this._maximizeButton) {
			return;
		}

		const dimensions = this._bodyScrollable?.getScrollDimensions();
		const overflows = !!dimensions && dimensions.scrollHeight > dimensions.height;
		if ((overflows || this._isMaximized) && !this._isCollapsed) {
			dom.show(this._maximizeButton.element);
		} else {
			dom.hide(this._maximizeButton.element);
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
			this.persistDraftState();
			this.renderCurrentQuestion(true);
			this.domNode.focus();
		}
	}

	/**
	 * Handles the next/submit behavior for keyboard and option selection flows.
	 * Either advances to the next question or submits when on the last question.
	 */
	private handleNextOrSubmit(): void {
		this.saveCurrentAnswer();

		if (!this.validateCurrentQuestion()) {
			return;
		}

		if (this._currentIndex < this.carousel.questions.length - 1) {
			// Move to next question
			this._currentIndex++;
			this.persistDraftState();
			this.renderCurrentQuestion(true);
		} else {
			// Submit
			if (!this.validateRequiredFields()) {
				return;
			}
			this.submitAnswers();
		}
	}

	/**
	 * Handles explicit submit action from the dedicated submit button.
	 */
	private submit(): void {
		this.saveCurrentAnswer();
		if (!this.validateCurrentQuestion()) {
			return;
		}
		if (!this.validateRequiredFields()) {
			return;
		}
		this.submitAnswers();
	}

	/**
	 * Focuses the container element and announces the question for screen reader users.
	 */
	private _focusContainerAndAnnounce(): void {
		this.domNode.focus();
		const question = this.carousel.questions[this._currentIndex];
		if (question) {
			const questionText = getDisplayedQuestionText(question);
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
		if (this._store.isDisposed) {
			return;
		}

		this._isSkipped = true;
		this.domNode.classList.add('chat-question-carousel-used');

		// Dispose interactive UI and clear DOM
		this.clearInteractiveResources();
		dom.clearNode(this.domNode);

		// Render summary
		if (this._options.submissionAcknowledgement) {
			this.renderSubmissionAcknowledgement(this._options.submissionAcknowledgement);
		} else {
			this.renderSummary();
		}
		this._onDidChangeHeight.fire();
	}

	private renderSubmissionAcknowledgement(acknowledgement: NonNullable<IChatQuestionCarouselOptions['submissionAcknowledgement']>): void {
		const acknowledgementStore = new DisposableStore();
		this._interactiveUIStore.value = acknowledgementStore;

		const titleRow = dom.$(`.chat-question-title-row.${CHAT_CARD_HEADER_CLASS}`);
		const title = dom.$(`.chat-question-title.${CHAT_CARD_TITLE_CLASS}`);
		title.textContent = acknowledgement.message;
		titleRow.appendChild(title);

		const actions = dom.$('.chat-question-header-actions');
		const closeButton = createChatCardIconButton(acknowledgementStore, actions, this._hoverService, {
			icon: Codicon.closeSmall,
			ariaLabel: acknowledgement.dismissLabel,
			hoverContent: acknowledgement.dismissLabel,
		});
		closeButton.element.classList.add('chat-question-close');
		acknowledgementStore.add(closeButton.onDidClick(() => acknowledgement.onDidDismiss()));
		titleRow.appendChild(actions);
		this.domNode.appendChild(titleRow);
		if (acknowledgement.description) {
			const description = dom.append(this.domNode, dom.$('.chat-question-description'));
			const renderedDescription = acknowledgementStore.add(this._markdownRenderer.render(acknowledgement.description));
			description.appendChild(renderedDescription.element);
		}
		this.domNode.setAttribute('aria-label', acknowledgement.message);
		this._accessibilityService.status(acknowledgement.message);
		closeButton.focus();

		acknowledgementStore.add(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.keyCode === KeyCode.Escape) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				acknowledgement.onDidDismiss();
			}
		}));
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
		this._textAnswerEditors.clear();
		this._singleSelectItems.clear();
		this._multiSelectCheckboxes.clear();
		this._freeformAnswerEditors.clear();
		this._passwordInputs.clear();
		this._focusAnswer = undefined;

		// Clear references to disposed elements
		this._prevButton = undefined;
		this._nextButton = undefined;
		this._primaryButton = undefined;
		this._primaryState = undefined;
		this._skipAllButton = undefined;
		this._questionContainer = undefined;
		this._headerActionsContainer = undefined;
		this._closeButtonContainer = undefined;
		this._focusTerminalButtonContainer = undefined;
		this._collapseButton = undefined;
		this._maximizeButton = undefined;
		this._bodyScrollable = undefined;
		this._answersContainer = undefined;
		this._footerRow = undefined;
		this._stepIndicator = undefined;
	}

	/**
	 * Skips the carousel with default values - called when user wants to proceed quickly.
	 * Returns defaults for all questions.
	 *
	 * `carousel.isUsed` covers resolution that did not come from this part: a
	 * voice answer dismisses the carousel directly, and a later auto-skip on
	 * request submit would otherwise overwrite the answer that actually landed
	 * with defaults.
	 */
	public skip(): boolean {
		if (this._isSkipped || this.carousel.isUsed || !this.carousel.allowSkip) {
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
	 *
	 * Guarded on `carousel.isUsed` for the same reason as {@link skip}.
	 *
	 * @param byUser Whether the person dismissed the carousel themselves, rather than it being dismissed for them.
	 */
	public ignore(byUser = false): boolean {
		if (this._isSkipped || this.carousel.isUsed || !this.carousel.allowSkip) {
			return false;
		}
		this.saveCurrentAnswer();
		this._options.onDidDismiss?.(this.getAnswersWithoutPasswords());
		this._isSkipped = true;

		this._options.onSubmit(undefined, byUser);

		// Dispose interactive UI and clear DOM
		this.clearInteractiveResources();

		// Hide UI and show terminal-state (Skipped/Answered) message
		this.domNode.classList.add('chat-question-carousel-used');
		dom.clearNode(this.domNode);
		this.renderTerminalStateMessage();
		this._onDidChangeHeight.fire();
		return true;
	}

	/**
	 * Collects default values for all questions in the carousel.
	 */
	private getDefaultAnswers(): Map<string, IChatQuestionAnswerValue> {
		const answers = new Map<string, IChatQuestionAnswerValue>();
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
	private getDefaultAnswerForQuestion(question: IChatQuestion): IChatQuestionAnswerValue | undefined {
		switch (question.type) {
			case 'text':
				return typeof question.defaultValue === 'string' && !question.password ? question.defaultValue : undefined;

			case 'singleSelect': {
				const defaultOptionId = typeof question.defaultValue === 'string' ? question.defaultValue : undefined;
				const defaultOption = defaultOptionId !== undefined
					? question.options?.find(opt => opt.id === defaultOptionId)
					: undefined;
				const selectedValue = defaultOption?.value;

				return selectedValue !== undefined ? { selectedValue, freeformValue: undefined } satisfies IChatSingleSelectAnswer : undefined;
			}

			case 'multiSelect': {
				const defaultIds = Array.isArray(question.defaultValue)
					? question.defaultValue
					: (typeof question.defaultValue === 'string' ? [question.defaultValue] : []);
				const selectedValues = question.options
					?.filter(opt => defaultIds.includes(opt.id))
					.map(opt => opt.value)
					.filter(v => v !== undefined) ?? [];

				return selectedValues.length > 0 ? { selectedValues, freeformValue: undefined } satisfies IChatMultiSelectAnswer : undefined;
			}

			default:
				return typeof question.defaultValue === 'string' ? question.defaultValue : Array.isArray(question.defaultValue) ? { selectedValues: question.defaultValue } : undefined;
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

		const questionText = getDisplayedQuestionText(question);
		const messageContent = this.getQuestionText(questionText);
		const questionCount = this.carousel.questions.length;

		let label: string;
		if (questionCount === 1) {
			label = localize('chat.questionCarousel.singleQuestionLabel', 'Chat question: {0}', messageContent);
		} else {
			label = localize('chat.questionCarousel.multiQuestionLabel', 'Chat question {0} of {1}: {2}', this._currentIndex + 1, questionCount, messageContent);
		}

		const verbose = this._configurationService.getValue<boolean>(AccessibilityVerbositySettingId.ChatQuestionCarousel);
		if (verbose && this.carousel.terminalId) {
			const kbLabel = this._keybindingService.lookupKeybinding('workbench.action.chat.focusQuestionCarouselTerminal')?.getLabel();
			if (kbLabel) {
				label = localize('chat.questionCarousel.combinedFocusTerminalHint', "{0} Use {1} to focus the terminal.", label, kbLabel);
			} else {
				label = localize('chat.questionCarousel.combinedFocusTerminalHintNoKb', "{0} Use the Focus Terminal from Question Carousel command to focus the terminal.", label);
			}
		}

		this.domNode.setAttribute('aria-label', label);
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

	public focusTerminal(): boolean {
		if (!this.carousel.terminalId) {
			return false;
		}
		this._focusTerminal();
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
		this._textAnswerEditors.clear();
		this._singleSelectItems.clear();
		this._multiSelectCheckboxes.clear();
		this._freeformAnswerEditors.clear();
		this._passwordInputs.clear();
		this._focusAnswer = undefined;

		// Clear previous content
		dom.clearNode(this._questionContainer);

		const question = this.carousel.questions[this._currentIndex];
		if (!question) {
			return;
		}

		const titleRow = dom.$(`.chat-question-title-row.${CHAT_CARD_HEADER_CLASS}`);

		// Everything except the pinned title row lives in one scroll body.
		const bodyContent = dom.$('.chat-question-input-container');

		// Render carousel-level message if present (e.g. from MCP elicitation)
		if (this.carousel.message && this._currentIndex === 0) {
			const messageMd = isMarkdownString(this.carousel.message) ? MarkdownString.lift(this.carousel.message) : new MarkdownString(this.carousel.message);
			const carouselMessage = dom.$('.chat-question-carousel-message');
			const renderedMessage = questionRenderStore.add(this._markdownRenderer.render(messageMd));
			carouselMessage.appendChild(renderedMessage.element);
			bodyContent.appendChild(carouselMessage);
		}

		// Only the short heading is pinned; a long message scrolls with the body so it can't crowd out the answers.
		const headingText = question.title || getDisplayedQuestionText(question);
		const rawValue = isMarkdownString(headingText) ? headingText.value : headingText;
		const shownTexts = [rawValue.trim()];
		if (headingText) {
			const title = dom.$(`.chat-question-title.${CHAT_CARD_TITLE_CLASS}`);
			const messageContent = this.getQuestionText(getDisplayedQuestionText(question));
			title.setAttribute('aria-label', messageContent);

			const titleValue = escapeLeadingMarkdownBlockSyntax(rawValue);
			const suffixed = question.required ? `${titleValue} *` : titleValue;
			const md = isMarkdownString(headingText)
				? MarkdownString.lift({ ...headingText, value: suffixed })
				: new MarkdownString(suffixed);
			const rendered = questionRenderStore.add(this._markdownRenderer.render(md));
			title.appendChild(rendered.element);
			titleRow.appendChild(title);
		}

		this._questionContainer.appendChild(titleRow);

		if (this._headerActionsContainer) {
			dom.clearNode(this._headerActionsContainer);
			if (this._focusTerminalButtonContainer) {
				this._headerActionsContainer.appendChild(this._focusTerminalButtonContainer);
			}
			if (this._maximizeButton) {
				this._headerActionsContainer.appendChild(this._maximizeButton.element);
			}
			if (this._closeButtonContainer) {
				this._headerActionsContainer.appendChild(this._closeButtonContainer);
			}
			if (this._collapseButton) {
				this._headerActionsContainer.appendChild(this._collapseButton.element);
			}
			titleRow.appendChild(this._headerActionsContainer);
		}

		// Render the full message in the body when the pinned heading is only a short title
		if (question.message) {
			const messageValue = isMarkdownString(question.message) ? question.message.value : question.message;
			if (messageValue.trim() && !shownTexts.includes(messageValue.trim())) {
				shownTexts.push(messageValue.trim());
				const messageMd = isMarkdownString(question.message) ? MarkdownString.lift(question.message) : new MarkdownString(question.message);
				const messageEl = dom.$('.chat-question-message');
				const renderedMessage = questionRenderStore.add(this._markdownRenderer.render(messageMd));
				messageEl.appendChild(renderedMessage.element);
				bodyContent.appendChild(messageEl);
			}
		}

		if (question.context) {
			const contextEl = dom.$('.chat-question-description.chat-question-context');
			contextEl.textContent = question.context;
			bodyContent.appendChild(contextEl);
		}

		// Render description if present
		if (question.description) {
			const descriptionEl = dom.$('.chat-question-description');
			descriptionEl.textContent = question.description;
			bodyContent.appendChild(descriptionEl);
		}

		// Render detailed markdown message
		const detailedValue = isMarkdownString(question.detailedMessage) ? question.detailedMessage.value : question.detailedMessage;
		// Agents often repeat the title or message; showing it twice adds nothing.
		if (question.detailedMessage && !shownTexts.includes(detailedValue?.trim() ?? '')) {
			const detailedMd = isMarkdownString(question.detailedMessage)
				? MarkdownString.lift(question.detailedMessage)
				: new MarkdownString(question.detailedMessage);
			const detailedMessageEl = dom.$('.chat-question-detailed-message');
			const renderedDetailedMessage = questionRenderStore.add(this._markdownRenderer.render(detailedMd));
			detailedMessageEl.appendChild(renderedDetailedMessage.element);
			bodyContent.appendChild(detailedMessageEl);
		}

		if (question.note) {
			const noteEl = dom.append(bodyContent, dom.$('.chat-question-note'));
			if (question.note.icon) {
				const icon = dom.append(noteEl, dom.$('span.chat-question-note-icon'));
				icon.classList.add(...ThemeIcon.asClassNameArray(question.note.icon));
				icon.setAttribute('aria-hidden', 'true');
			}
			dom.append(noteEl, dom.$('span', undefined, question.note.text));
		}

		// Render input based on question type
		const answersContainer = dom.append(bodyContent, dom.$('.chat-question-answers'));
		this._answersContainer = answersContainer;
		this.renderInput(answersContainer, question);

		const bodyScrollable = questionRenderStore.add(new DomScrollableElement(bodyContent, {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Hidden,
			consumeMouseWheelIfScrollbarIsNeeded: true,
		}));
		this._bodyScrollable = bodyScrollable;
		const bodyScrollableNode = bodyScrollable.getDomNode();
		bodyScrollableNode.classList.add('chat-question-body-scrollable');
		bodyScrollableNode.tabIndex = -1;
		bodyScrollableNode.setAttribute('role', 'group');
		bodyScrollableNode.setAttribute('aria-label', localize('chat.questionCarousel.details', "Question details"));
		this._questionContainer.appendChild(bodyScrollableNode);

		// The scrollable element has no keyboard support of its own, so scroll when the wrapper itself has focus.
		questionRenderStore.add(dom.addDisposableListener(bodyScrollableNode, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.target !== bodyScrollableNode) {
				return;
			}
			const { height, scrollHeight } = bodyScrollable.getScrollDimensions();
			const { scrollTop } = bodyScrollable.getScrollPosition();
			let newScrollTop: number;
			switch (new StandardKeyboardEvent(e).keyCode) {
				case KeyCode.UpArrow: newScrollTop = scrollTop - BODY_SCROLL_LINE_HEIGHT; break;
				case KeyCode.DownArrow: newScrollTop = scrollTop + BODY_SCROLL_LINE_HEIGHT; break;
				case KeyCode.PageUp: newScrollTop = scrollTop - Math.max(height - BODY_SCROLL_LINE_HEIGHT, BODY_SCROLL_LINE_HEIGHT); break;
				case KeyCode.PageDown: newScrollTop = scrollTop + Math.max(height - BODY_SCROLL_LINE_HEIGHT, BODY_SCROLL_LINE_HEIGHT); break;
				case KeyCode.Home: newScrollTop = 0; break;
				case KeyCode.End: newScrollTop = scrollHeight; break;
				default: return;
			}
			e.preventDefault();
			e.stopPropagation();
			bodyScrollable.setScrollPosition({ scrollTop: newScrollTop });
		}));

		// Validation message element below the scrollable area (not inside it)
		this._validationMessageElement = dom.$('.chat-question-validation-message');
		this._validationMessageElement.style.display = 'none';
		this._questionContainer.appendChild(this._validationMessageElement);

		// Render footer before observing so the scroll body is measured against its final available height.
		this.renderFooter();
		// Track whether the body is pinned to the bottom so it stays there when an answer editor grows.
		let wasAtBottom = false;
		const isAtBottom = () => {
			const dimensions = bodyScrollable.getScrollDimensions();
			return bodyScrollable.getScrollPosition().scrollTop + dimensions.height >= dimensions.scrollHeight - 1;
		};
		questionRenderStore.add(bodyScrollable.onScroll(e => {
			// Content growth also fires onScroll; only a real scroll changes whether the user is pinned to the bottom.
			if (e.scrollTopChanged) {
				wasAtBottom = isAtBottom();
			}
			this.updatePrimaryState();
		}));

		const targetWindow = dom.getWindow(this.domNode);
		const bodyResizeObserver = questionRenderStore.add(new dom.DisposableResizeObserver('ChatQuestionCarouselPart.bodyScrollable', () => {
			const bodyTabIndex = bodyContent.scrollHeight > bodyContent.clientHeight ? 0 : -1;
			if (bodyScrollableNode.tabIndex !== bodyTabIndex) {
				bodyScrollableNode.tabIndex = bodyTabIndex;
			}
			bodyScrollable.scanDomNode();
			if (wasAtBottom) {
				bodyScrollable.setScrollPosition({ scrollTop: bodyScrollable.getScrollDimensions().scrollHeight });
			}
			wasAtBottom = isAtBottom();
			this.updateMaximizeVisibility();
			this.updatePrimaryState();
		}, targetWindow));
		questionRenderStore.add(bodyResizeObserver.observe(bodyScrollableNode));
		questionRenderStore.add(bodyResizeObserver.observe(bodyContent));
		for (const content of bodyContent.children) {
			questionRenderStore.add(bodyResizeObserver.observe(content));
		}
		questionRenderStore.add(bodyResizeObserver.observe(this._validationMessageElement));
		if (this._footerRow) {
			questionRenderStore.add(bodyResizeObserver.observe(this._footerRow));
		}
		questionRenderStore.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => {
			bodyContent.scrollTop = 0;
			bodyContent.scrollLeft = 0;
			bodyScrollable.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
			bodyScrollable.scanDomNode();
			this.updateMaximizeVisibility();
			this.updatePrimaryState();
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
	 * Renders or updates the persistent footer: navigation arrows and step indicator on the left,
	 * the primary action (arrow/Next/Submit) on the right.
	 */
	private renderFooter(): void {
		if (!this._footerRow) {
			const interactiveStore = this._interactiveUIStore.value;
			if (!interactiveStore) {
				return;
			}

			this._footerRow = dom.$('.chat-question-footer-row');

			const leftControls = dom.$('.chat-question-footer-left.chat-question-carousel-nav');
			leftControls.setAttribute('role', 'navigation');
			leftControls.setAttribute('aria-label', localize('chat.questionCarousel.navigation', 'Question navigation'));

			if (this.carousel.questions.length > 1) {
				const arrowsContainer = dom.append(leftControls, dom.$('.chat-question-nav-arrows'));

				const previousLabel = this.getLabelWithKeybinding(localize('previous', 'Previous'), PREVIOUS_QUESTION_ACTION_ID);
				const prevButton = createChatCardIconButton(interactiveStore, arrowsContainer, this._hoverService, {
					icon: Codicon.chevronLeft,
					ariaLabel: previousLabel,
					hoverContent: previousLabel,
					variant: 'strong',
				});
				prevButton.element.classList.add('chat-question-nav-arrow', 'chat-question-nav-prev');
				interactiveStore.add(prevButton.onDidClick(() => this.navigate(-1)));
				this._prevButton = prevButton;

				const nextLabel = this.getLabelWithKeybinding(localize('next', 'Next'), NEXT_QUESTION_ACTION_ID);
				const nextButton = createChatCardIconButton(interactiveStore, arrowsContainer, this._hoverService, {
					icon: Codicon.chevronRight,
					ariaLabel: nextLabel,
					hoverContent: nextLabel,
					variant: 'strong',
				});
				nextButton.element.classList.add('chat-question-nav-arrow', 'chat-question-nav-next');
				interactiveStore.add(nextButton.onDidClick(() => this.navigate(1)));
				this._nextButton = nextButton;

				this._stepIndicator = dom.append(leftControls, dom.$('.chat-question-step-indicator'));
			}

			this._footerRow.appendChild(leftControls);

			const rightControls = dom.append(this._footerRow, dom.$('.chat-question-footer-right'));
			this.renderPrimaryButton(rightControls, interactiveStore);
			this.domNode.append(this._footerRow);
		}

		this._primaryState = undefined;
		this.updatePrimaryState();
		this.updateFooterState();
	}

	private renderPrimaryButton(container: HTMLElement, store: DisposableStore): void {
		const button = store.add(new Button(container, { ...defaultButtonStyles, small: true, supportIcons: true }));
		button.element.classList.add('chat-question-submit-button');
		store.add(button.onDidClick(() => {
			if (this._primaryState === 'nav') {
				this.scrollToAnswers();
			} else {
				this.handleNextOrSubmit();
			}
		}));
		store.add(toDisposable(() => this.cancelPrimaryAnimations()));
		this._primaryButton = button;
	}

	private getPrimaryActionLabel(): string {
		const isLastQuestion = this._currentIndex === this.carousel.questions.length - 1;
		return isLastQuestion ? localize('submit', 'Submit') : localize('next', 'Next');
	}

	/**
	 * Returns whether the top of the answers is within the visible part of the scroll body.
	 */
	private areAnswersInView(): boolean {
		if (this._isCollapsed || !this._bodyScrollable || !this._answersContainer) {
			return true;
		}
		const bodyRect = this._bodyScrollable.getDomNode().getBoundingClientRect();
		if (bodyRect.height === 0) {
			// Not laid out yet.
			return true;
		}
		return this._answersContainer.getBoundingClientRect().top < bodyRect.bottom - ANSWERS_VISIBLE_THRESHOLD;
	}

	/**
	 * Shows a "scroll to answers" arrow while the answers are out of view and the Next/Submit label once they are.
	 * Swapping between the two animates the button's width and slides the new content in the scroll direction.
	 */
	private updatePrimaryState(): void {
		const button = this._primaryButton;
		if (!button) {
			return;
		}

		const state = this.areAnswersInView() ? 'action' : 'nav';
		if (state === this._primaryState) {
			return;
		}

		const previousState = this._primaryState;
		const fromWidth = button.element.getBoundingClientRect().width;
		const fromRadius = dom.getWindow(button.element).getComputedStyle(button.element).borderTopLeftRadius;
		this.cancelPrimaryAnimations();
		this._primaryState = state;

		const label = state === 'nav' ? localize('chat.questionCarousel.scrollToAnswers', "Scroll to Answers") : this.getPrimaryActionLabel();
		button.label = state === 'nav' ? `$(${Codicon.arrowDown.id})` : label;
		button.element.classList.toggle('chat-question-submit-button-icon-only', state === 'nav');
		button.setAriaLabel(label);
		button.setTitle(label);

		if (previousState && !this._accessibilityService.isMotionReduced()) {
			this.animatePrimaryButton(button.element, fromWidth, fromRadius, state === 'action' ? 1 : -1);
		}
	}

	/**
	 * @param direction `1` when scrolling down to the answers, so the new content rises from below, `-1` when scrolling back up.
	 */
	private animatePrimaryButton(element: HTMLElement, fromWidth: number, fromRadius: string, direction: 1 | -1): void {
		const toWidth = element.getBoundingClientRect().width;
		const toRadius = dom.getWindow(element).getComputedStyle(element).borderTopLeftRadius;
		if (fromWidth !== toWidth) {
			this._primaryAnimations.push(element.animate(
				[{ width: `${fromWidth}px`, borderRadius: fromRadius }, { width: `${toWidth}px`, borderRadius: toRadius }],
				{ duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
			));
		}
		// Plain-text labels render as bare text nodes, which can't be transformed; wrap them for the slide.
		for (const node of [...element.childNodes]) {
			if (node.nodeType === Node.TEXT_NODE) {
				const wrapper = dom.$('span.chat-question-submit-button-content');
				node.replaceWith(wrapper);
				wrapper.appendChild(node);
			}
		}
		for (const child of element.children) {
			this._primaryAnimations.push(child.animate(
				[{ transform: `translateY(${direction * 6}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
				{ duration: 160, easing: 'ease-out' }
			));
		}
	}

	private cancelPrimaryAnimations(): void {
		for (const animation of this._primaryAnimations) {
			animation.cancel();
		}
		this._primaryAnimations = [];
	}

	/**
	 * Scrolls the body so the answers are revealed, keeping a little of the preceding content visible, and focuses the first answer control.
	 */
	private scrollToAnswers(): void {
		const scrollable = this._bodyScrollable;
		const answers = this._answersContainer;
		if (!scrollable || !answers) {
			return;
		}

		const offset = answers.getBoundingClientRect().top - scrollable.getDomNode().getBoundingClientRect().top;
		scrollable.setScrollPosition({ scrollTop: Math.max(0, scrollable.getScrollPosition().scrollTop + offset - ANSWERS_REVEAL_CONTEXT) });
		this._focusAnswer?.();
		this.updatePrimaryState();
	}

	/**
	 * Updates the nav button enabled state, the step indicator text and the primary footer controls.
	 */
	private updateFooterState(): void {
		if (this._prevButton) {
			this._prevButton.enabled = this._currentIndex > 0;
		}
		const question = this.carousel.questions[this._currentIndex];
		if (this._nextButton) {
			const canAdvance = this._currentIndex < this.carousel.questions.length - 1;
			const answer = this._answers.get(question?.id);
			const hasAnswer = answer !== undefined && answer !== '';
			const hasValidationError = !!this._currentValidationError;
			this._nextButton.enabled = canAdvance && (!question?.required || hasAnswer) && !hasValidationError;
		}
		if (this._stepIndicator) {
			this._stepIndicator.textContent = localize(
				'chat.questionCarousel.stepIndicator',
				'{0}/{1}',
				this._currentIndex + 1,
				this.carousel.questions.length
			);
		}
	}

	private getLabelWithKeybinding(label: string, actionId: string): string {
		const keybindingLabel = this._keybindingService.lookupKeybinding(actionId, this._contextKeyService)?.getLabel();
		return keybindingLabel
			? localize('chat.questionCarousel.labelWithKeybinding', '{0} ({1})', label, keybindingLabel)
			: label;
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
	 * Creates an answer editor in the container, tied to the lifetime of the rendered question.
	 */
	private createAnswerEditor(container: HTMLElement, placeholder: string, initialValue: string | undefined): ChatQuestionAnswerEditor {
		const editor = this._inputBoxes.add(this._instantiationService.createInstance(ChatQuestionAnswerEditor, container, {
			placeholder,
			ariaLabel: placeholder,
			initialValue,
			sessionResource: this._options.sessionResource ?? this._context?.element?.sessionResource,
			overflowWidgetsDomNode: this._options.editorOverflowWidgetsDomNode,
		}));
		this._inputBoxes.add(editor.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		this._inputBoxes.add(editor.onDidPressEnter(() => this.handleNextOrSubmit()));
		return editor;
	}

	private renderTextInput(container: HTMLElement, question: IChatQuestion): void {
		if (question.password) {
			this.renderPasswordInput(container, question);
			return;
		}

		// Restore previous answer if exists
		const previousAnswer = this._answers.get(question.id);
		const initialValue = previousAnswer !== undefined
			? String(previousAnswer)
			: question.defaultValue !== undefined ? String(question.defaultValue) : undefined;

		const editor = this.createAnswerEditor(container, localize('chat.questionCarousel.enterText', 'Enter your answer'), initialValue);
		this._inputBoxes.add(editor.onDidChangeValue(() => this.saveCurrentAnswer()));

		this._textAnswerEditors.set(question.id, editor);
		this._focusAnswer = () => editor.focus();

		// Focus on input when rendered using proper DOM scheduling
		if (this._shouldAutoFocus()) {
			this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(editor.domNode), () => editor.focus()));
		}
	}

	private renderPasswordInput(container: HTMLElement, question: IChatQuestion): void {
		const placeholder = localize('chat.questionCarousel.enterPassword', "Enter password");
		const inputBox = this._inputBoxes.add(new InputBox(container, undefined, {
			type: 'password',
			placeholder,
			ariaLabel: placeholder,
			inputBoxStyles: defaultInputBoxStyles,
		}));
		inputBox.inputElement.autocomplete = 'off';
		const previousAnswer = this._answers.get(question.id);
		if (typeof previousAnswer === 'string') {
			inputBox.value = previousAnswer;
		}
		this._inputBoxes.add(inputBox.onDidChange(() => this.saveCurrentAnswer()));
		this._inputBoxes.add(dom.addDisposableListener(inputBox.inputElement, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
				e.preventDefault();
				e.stopPropagation();
				this.handleNextOrSubmit();
			}
		}));

		this._passwordInputs.set(question.id, inputBox);
		this._focusAnswer = () => inputBox.focus();

		if (this._shouldAutoFocus()) {
			this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(inputBox.element), () => inputBox.focus()));
		}
	}

	private renderSingleSelect(container: HTMLElement, question: IChatQuestion): void {
		const booleanQuestion = isBooleanQuestion(question);
		const orderedOptions = getOptionsWithDefaultsFirst(question);
		const selectContainer = dom.$('.chat-question-list');
		container.appendChild(selectContainer);

		// Restore previous answer if exists
		const previousAnswer = this._answers.get(question.id);
		const prevSingle = typeof previousAnswer === 'object' && previousAnswer !== null && hasKey(previousAnswer, { selectedValue: true }) ? previousAnswer as IChatSingleSelectAnswer : undefined;
		const previousFreeform = prevSingle?.freeformValue;
		const previousSelectedValue = prevSingle?.selectedValue;

		// Get default option id (for singleSelect, defaultValue is a single string)
		const defaultOptionId = typeof question.defaultValue === 'string' ? question.defaultValue : undefined;

		// Determine initially selected index
		let selectedIndex = -1;
		orderedOptions.forEach(({ option }, index) => {
			if (previousSelectedValue !== undefined && option.value === previousSelectedValue) {
				selectedIndex = index;
			} else if (selectedIndex === -1 && !previousFreeform && defaultOptionId !== undefined && option.id === defaultOptionId) {
				selectedIndex = index;
			}
		});

		const listbox = new ChatCardListbox(selectContainer, question.title, 'selected');
		this._focusAnswer = () => listbox.focus();
		const indicators: HTMLElement[] = [];
		/** Paints the row state without committing, which is what initial render needs. */
		const paintSelection = (newIndex: number) => {
			listbox.setActive(newIndex);
			indicators.forEach((indicator, i) => {
				const isSelected = i === newIndex;
				indicator.classList.toggle('codicon', isSelected);
				indicator.classList.toggle('codicon-check', isSelected);
			});
		};
		const updateSelection = (newIndex: number) => {
			paintSelection(newIndex);
			// Update tracked state
			const data = this._singleSelectItems.get(question.id);
			if (data) {
				data.selectedIndex = newIndex;
			}

			this.saveCurrentAnswer();
		};

		const listItems: HTMLElement[] = [];
		orderedOptions.forEach(({ option }, index) => {
			const optionLabel = booleanQuestion
				? (option.value === 'true' ? localize('chat.questionCarousel.yes', "Yes") : localize('chat.questionCarousel.no', "No"))
				: option.label;
			const listItem = dom.$('.chat-question-list-item');
			listbox.addOption(listItem, `option-${question.id}`);
			listItem.setAttribute('aria-label', localize('chat.questionCarousel.optionLabel', "Option {0}: {1}", index + 1, optionLabel));

			const number = dom.$('.chat-question-list-number');
			number.textContent = `${index + 1}`;
			listItem.appendChild(number);

			const indicator = dom.$('.chat-question-list-indicator');
			indicators.push(indicator);

			// Label with optional description (format: "Title - Description")
			const label = dom.$('.chat-question-list-label');
			const separatorIndex = optionLabel.indexOf(' - ');
			if (separatorIndex !== -1) {
				listItem.classList.add('has-description');
				const titleSpan = dom.$('span.chat-question-list-label-title');
				titleSpan.textContent = optionLabel.substring(0, separatorIndex);
				label.appendChild(titleSpan);

				const descSpan = dom.$('span.chat-question-list-label-desc');
				descSpan.textContent = optionLabel.substring(separatorIndex + 3);
				label.appendChild(descSpan);
			} else {
				label.textContent = optionLabel;
			}
			listItem.appendChild(label);
			listItem.appendChild(indicator);

			// Selecting an option answers with it, ignoring any custom answer, and goes to the next question
			this._inputBoxes.add(dom.addDisposableListener(listItem, dom.EventType.CLICK, (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				updateSelection(index);
				this.handleNextOrSubmit();
			}));

			this._inputBoxes.add(this._hoverService.setupDelayedHover(listItem, {
				content: optionLabel,
				position: { hoverPosition: HoverPosition.BELOW },
				appearance: { showPointer: true }
			}));

			selectContainer.appendChild(listItem);
			listItems.push(listItem);
		});

		const selectionData = { items: listItems, selectedIndex, optionIndices: orderedOptions.map(o => o.originalIndex) };
		this._singleSelectItems.set(question.id, selectionData);

		// Paints the initial row and points `aria-activedescendant` at it. Deliberately not
		// `updateSelection`, which would commit an answer the user has not given yet.
		paintSelection(selectedIndex);

		// Show freeform input only when explicitly allowed
		let freeformEditor: ChatQuestionAnswerEditor | undefined;
		if (question.allowFreeformInput !== false) {
			const freeformContainer = dom.$('.chat-question-freeform');

			const freeformNumber = dom.$('.chat-question-freeform-number');
			freeformNumber.textContent = `${orderedOptions.length + 1}`;
			freeformContainer.appendChild(freeformNumber);
			container.appendChild(freeformContainer);

			const capturedFreeform = this.createAnswerEditor(freeformContainer, localize('chat.questionCarousel.enterCustomAnswer', 'Enter custom answer'), previousFreeform ?? this._ignoredFreeformValues.get(question.id));
			freeformEditor = capturedFreeform;
			// The saved answer leaves out text that a selected option overrides, so keep it here when the question is unrendered.
			this._inputBoxes.add(toDisposable(() => {
				if (selectionData.selectedIndex >= 0 && capturedFreeform.value) {
					this._ignoredFreeformValues.set(question.id, capturedFreeform.value);
				} else {
					this._ignoredFreeformValues.delete(question.id);
				}
			}));

			// clear when we start typing in freeform
			this._inputBoxes.add(capturedFreeform.onDidChangeValue(value => {
				if (value.length > 0) {
					updateSelection(-1);
				} else {
					this.saveCurrentAnswer();
				}
			}));

			// Up from the start of the custom answer selects the last option instead, keeping the text
			this._inputBoxes.add(capturedFreeform.onDidPressUpAtStart(() => {
				if (listItems.length) {
					updateSelection(listItems.length - 1);
					listbox.focus();
				}
			}));

			this._freeformAnswerEditors.set(question.id, capturedFreeform);
		}

		// Keyboard navigation for the list
		this._inputBoxes.add(dom.addDisposableListener(selectContainer, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			const data = this._singleSelectItems.get(question.id);
			if (!data || !listItems.length) {
				return;
			}
			let newIndex = data.selectedIndex;

			if (event.keyCode === KeyCode.DownArrow && freeformEditor && data.selectedIndex === listItems.length - 1) {
				// Down from the last option moves on to the custom answer
				e.preventDefault();
				updateSelection(-1);
				freeformEditor.focus();
				return;
			} else if (event.keyCode === KeyCode.DownArrow) {
				e.preventDefault();
				newIndex = listbox.clampedIndex(data.selectedIndex + 1);
			} else if (event.keyCode === KeyCode.UpArrow) {
				e.preventDefault();
				newIndex = listbox.clampedIndex(data.selectedIndex - 1);
			} else if ((event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) && !event.metaKey && !event.ctrlKey) {
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
					updateSelection(numberIndex);
				} else if (freeformEditor && numberIndex === listItems.length) {
					e.preventDefault();
					updateSelection(-1);
					freeformEditor.focus();
				}
				return;
			}

			if (newIndex !== data.selectedIndex && newIndex >= 0) {
				updateSelection(newIndex);
			}
		}));

		// Focus the list itself, not an option: `aria-activedescendant` is only honoured on the
		// focused element. Or the custom answer editor, when it already has content.
		if (this._shouldAutoFocus()) {
			if (freeformEditor && previousFreeform) {
				const capturedFreeform = freeformEditor;
				this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(capturedFreeform.domNode), () => {
					capturedFreeform.focus();
				}));
			} else if (listItems.length > 0) {
				if (selectedIndex < 0 && this._options.shouldAutoSelectFirstOption !== false) {
					updateSelection(0);
				}
				this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(selectContainer), () => {
					listbox.focus();
				}));
			}
		}
	}

	private renderMultiSelect(container: HTMLElement, question: IChatQuestion): void {
		const orderedOptions = getOptionsWithDefaultsFirst(question);
		const selectContainer = dom.$('.chat-question-list');
		selectContainer.setAttribute('role', 'listbox');
		selectContainer.setAttribute('aria-multiselectable', 'true');
		selectContainer.setAttribute('aria-label', question.title);
		selectContainer.tabIndex = 0;
		container.appendChild(selectContainer);

		// Restore previous answer if exists
		const previousAnswer = this._answers.get(question.id);
		const prevMulti = typeof previousAnswer === 'object' && previousAnswer !== null && hasKey(previousAnswer, { selectedValues: true }) ? previousAnswer as IChatMultiSelectAnswer : undefined;
		const previousFreeform = prevMulti?.freeformValue;
		const previousSelectedValues = prevMulti?.selectedValues ?? [];

		// Get default option ids (for multiSelect, defaultValue can be string or string[])
		const defaultOptionIds: string[] = Array.isArray(question.defaultValue)
			? question.defaultValue
			: (typeof question.defaultValue === 'string' ? [question.defaultValue] : []);

		const checkboxes: Checkbox[] = [];
		const listItems: HTMLElement[] = [];
		let focusedIndex = 0;
		this._focusAnswer = () => listItems[focusedIndex]?.focus();
		let firstCheckedIndex = -1;

		orderedOptions.forEach(({ option }, index) => {
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
				listItem.classList.add('has-description');
				const titleSpan = dom.$('span.chat-question-list-label-title');
				titleSpan.textContent = option.label.substring(0, separatorIndex);
				label.appendChild(titleSpan);

				const descSpan = dom.$('span.chat-question-list-label-desc');
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

		this._multiSelectCheckboxes.set(question.id, { checkboxes, optionIndices: orderedOptions.map(o => o.originalIndex) });

		// Show freeform input only when explicitly allowed
		let freeformEditor: ChatQuestionAnswerEditor | undefined;
		if (question.allowFreeformInput !== false) {
			const freeformContainer = dom.$('.chat-question-freeform');

			// Number indicator for freeform (comes after all options)
			const freeformNumber = dom.$('.chat-question-freeform-number');
			freeformNumber.textContent = `${orderedOptions.length + 1}`;
			freeformContainer.appendChild(freeformNumber);
			container.appendChild(freeformContainer);

			const capturedFreeform = this.createAnswerEditor(freeformContainer, localize('chat.questionCarousel.enterCustomAnswer', 'Enter custom answer'), previousFreeform);
			freeformEditor = capturedFreeform;
			this._inputBoxes.add(capturedFreeform.onDidChangeValue(() => this.saveCurrentAnswer()));
			// Up from the start of the custom answer moves to the last option, keeping the custom answer
			this._inputBoxes.add(capturedFreeform.onDidPressUpAtStart(() => {
				if (listItems.length) {
					focusedIndex = listItems.length - 1;
					listItems[focusedIndex].focus();
				}
			}));

			this._freeformAnswerEditors.set(question.id, capturedFreeform);
		}

		// Keyboard navigation for the list
		this._inputBoxes.add(dom.addDisposableListener(selectContainer, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			// Guard against empty list
			if (!listItems.length) {
				return;
			}

			if (event.keyCode === KeyCode.DownArrow && freeformEditor && focusedIndex === listItems.length - 1) {
				// Down from the last option moves on to the custom answer
				e.preventDefault();
				freeformEditor.focus();
			} else if (event.keyCode === KeyCode.DownArrow) {
				e.preventDefault();
				focusedIndex = Math.min(focusedIndex + 1, listItems.length - 1);
				listItems[focusedIndex].focus();
			} else if (event.keyCode === KeyCode.UpArrow) {
				e.preventDefault();
				focusedIndex = Math.max(focusedIndex - 1, 0);
				listItems[focusedIndex].focus();
			} else if (event.keyCode === KeyCode.Enter && !event.metaKey && !event.ctrlKey) {
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
				} else if (freeformEditor && numberIndex === checkboxes.length) {
					e.preventDefault();
					freeformEditor.focus();
				}
			}
		}));

		// Focus on the appropriate row when rendered or the custom answer editor if it has content
		if (this._shouldAutoFocus()) {
			if (freeformEditor && previousFreeform) {
				const capturedFreeform = freeformEditor;
				this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(capturedFreeform.domNode), () => {
					capturedFreeform.focus();
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

	private getCurrentAnswer(): IChatQuestionAnswerValue | undefined {
		const question = this.carousel.questions[this._currentIndex];
		if (!question) {
			return undefined;
		}

		switch (question.type) {
			case 'text': {
				if (question.password) {
					return this._passwordInputs.get(question.id)?.value;
				}
				const answerEditor = this._textAnswerEditors.get(question.id);
				return answerEditor?.value ?? (typeof question.defaultValue === 'string' ? question.defaultValue : Array.isArray(question.defaultValue) ? { selectedValues: question.defaultValue } : undefined);
			}

			case 'singleSelect': {
				// A selected option wins over the custom answer, which typing in it deselects; the text is kept but ignored.
				const data = this._singleSelectItems.get(question.id);
				let selectedValue: string | undefined = undefined;
				if (data && data.selectedIndex >= 0) {
					const originalIndex = data.optionIndices[data.selectedIndex];
					selectedValue = originalIndex !== undefined ? question.options?.[originalIndex]?.value : undefined;
				}

				const freeformValue = this._freeformAnswerEditors.get(question.id)?.value || undefined;
				if (selectedValue === undefined && freeformValue) {
					return { selectedValue: undefined, freeformValue } satisfies IChatSingleSelectAnswer;
				}
				// Find default option if nothing selected (defaultValue is the option id)
				if (selectedValue === undefined && typeof question.defaultValue === 'string') {
					const defaultOption = question.options?.find(opt => opt.id === question.defaultValue);
					selectedValue = defaultOption?.value;
				}
				if (selectedValue !== undefined) {
					return { selectedValue, freeformValue: undefined } satisfies IChatSingleSelectAnswer;
				}
				return undefined;
			}

			case 'multiSelect': {
				const data = this._multiSelectCheckboxes.get(question.id);
				const selectedValues: string[] = [];
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
				const freeformValue = this._freeformAnswerEditors.get(question.id)?.value || undefined;

				// Return whatever was selected - defaults are applied at render time when
				// checkboxes are initially checked, so empty selection means user unchecked all
				if (freeformValue || selectedValues.length > 0) {
					return { selectedValues, freeformValue } satisfies IChatMultiSelectAnswer;
				}
				return undefined;
			}

			default:
				return typeof question.defaultValue === 'string' ? question.defaultValue : Array.isArray(question.defaultValue) ? { selectedValues: question.defaultValue } : undefined;
		}
	}

	/**
	 * Renders a terminal-state message (Skipped/Answered) when the carousel is
	 * dismissed without structured answers.
	 */
	private renderTerminalStateMessage(): void {
		const summaryContainer = dom.$('.chat-question-carousel-summary');
		const isDismissedByTerminal = this.carousel instanceof ChatQuestionCarouselData && this.carousel.dismissedByTerminalInput;
		if (this.carousel.answeredExternally) {
			const answeredMessage = dom.$('.chat-question-summary-answered');
			answeredMessage.textContent = localize('chat.questionCarousel.answered', 'Answered');
			summaryContainer.appendChild(answeredMessage);
		} else {
			const skippedMessage = dom.$('.chat-question-summary-skipped');
			skippedMessage.textContent = isDismissedByTerminal
				? localize('chat.questionCarousel.deferredToTerminal', "Deferring to user's input in the terminal")
				: localize('chat.questionCarousel.skipped', 'Skipped question');
			summaryContainer.appendChild(skippedMessage);
		}
		this.domNode.appendChild(summaryContainer);
	}

	/**
	 * Renders a summary of answers when the carousel is already used.
	 */
	private renderSummary(): void {
		// If no answers, show the terminal-state (Skipped/Answered) message
		if (this._answers.size === 0) {
			if (this.carousel.answerPresentation === 'conversation') {
				if (this.carousel.autoReply) {
					this.renderConversationSummary({
						answerFallback: localize('chat.questionCarousel.answeredAutomatically', "Answered automatically"),
						answerIcon: Codicon.copilotCompact,
					});
				} else if (this.carousel.answeredExternally) {
					this.renderTerminalStateMessage();
				} else if (this.carousel.isUsed) {
					this.renderConversationSummary({
						answerFallback: localize('chat.questionCarousel.skippedConversation', "Skipped question"),
						answerIcon: Codicon.closeCompact,
						hideAnswerPrefix: true,
					});
				}
				return;
			}
			if (this.carousel.isUsed) {
				this.renderTerminalStateMessage();
			}
			return;
		}

		if (this.carousel.answerPresentation === 'conversation') {
			this.renderConversationSummary();
			return;
		}

		const summaryContainer = dom.$('.chat-question-carousel-summary');

		for (const question of this.carousel.questions) {
			const answer = this._answers.get(question.id);

			const summaryItem = dom.$('.chat-question-summary-item');

			const questionRow = dom.$('div.chat-question-summary-label');
			const questionText = getDisplayedQuestionText(question);
			let labelText = typeof questionText === 'string' ? questionText : questionText.value;
			labelText = labelText.replace(/[:\s]+$/, '');
			questionRow.textContent = localize('chat.questionCarousel.summaryQuestion', 'Q: {0}', labelText);
			summaryItem.appendChild(questionRow);

			if (answer !== undefined) {
				const formattedAnswer = this.formatAnswerForSummary(question, answer);
				const answerRow = dom.$('div.chat-question-summary-answer-title');
				answerRow.textContent = localize('chat.questionCarousel.summaryAnswer', 'A: {0}', formattedAnswer);
				summaryItem.appendChild(answerRow);
			} else {
				const unanswered = dom.$('div.chat-question-summary-unanswered');
				unanswered.textContent = localize('chat.questionCarousel.notAnsweredYet', 'Not answered yet');
				summaryItem.appendChild(unanswered);
			}

			summaryContainer.appendChild(summaryItem);
		}

		this.domNode.appendChild(summaryContainer);
	}

	private renderConversationSummary(options?: { answerFallback?: string; answerIcon?: ThemeIcon; hideAnswerPrefix?: boolean }): void {
		if (!this._context) {
			return;
		}

		const summaryStore = new DisposableStore();
		this._interactiveUIStore.value = summaryStore;
		const summaryContainer = dom.$('.chat-question-carousel-summary.chat-question-carousel-conversation-summary');
		this.domNode.setAttribute('aria-label', localize('chat.questionCarousel.answeredQuestions', "Answered chat questions"));

		for (const question of this.carousel.questions) {
			const answer = this._answers.get(question.id);
			const summaryItem = dom.$('.chat-question-summary-item');
			const questionValue = dom.$('.chat-question-summary-question');
			const questionText = getDisplayedQuestionText(question);
			const displayedQuestion = (typeof questionText === 'string' ? questionText : questionText.value).replace(/[:\s]+$/, '');
			const questionPrefix = dom.$('span.chat-question-summary-prefix');
			questionPrefix.textContent = localize('chat.questionCarousel.questionPrefix', "Question:");
			const questionTextValue = dom.$('span.chat-question-summary-question-value');
			questionTextValue.textContent = displayedQuestion;
			summaryStore.add(this._hoverService.setupDelayedHover(questionTextValue, { content: displayedQuestion }));
			questionValue.append(questionPrefix, questionValue.ownerDocument.createTextNode(' '), questionTextValue);
			summaryItem.appendChild(questionValue);

			const decision = dom.$('.chat-question-summary-decision');
			const answerValue = answer === undefined
				? options?.answerFallback ?? localize('chat.questionCarousel.conversationNotAnswered', "Not answered yet")
				: this.formatAnswerForSummary(question, answer);
			const answerPrefix = options?.hideAnswerPrefix ? undefined : localize('chat.questionCarousel.answerPrefix', "Answered:");
			const answerTitle = answerPrefix
				? localize('chat.questionCarousel.conversationAnswer', "{0} {1}", answerPrefix, answerValue)
				: answerValue;
			const collapsibleContext = {
				...this._context,
				content: this._context.content ?? [],
				contentIndex: this._context.contentIndex ?? 0,
			};
			const answerPart = summaryStore.add(new ChatQuestionAnswerCollapsiblePart(
				answerTitle,
				answerPrefix,
				answerValue,
				options?.answerIcon ?? (this.carousel.autoReply ? Codicon.copilotCompact : Codicon.commentCompact),
				collapsibleContext,
				question.options?.length ? () => this.renderConversationOptions(question, answer) : undefined,
				() => this._onDidChangeHeight.fire(),
				this._hoverService,
				this._configurationService,
				this._telemetryService,
			));
			answerPart.domNode.classList.add('chat-question-answer-collapsible');
			decision.appendChild(answerPart.domNode);
			summaryItem.appendChild(decision);
			summaryContainer.appendChild(summaryItem);
		}

		this.domNode.appendChild(summaryContainer);
	}

	private renderConversationOptions(question: IChatQuestion, answer: IChatQuestionAnswerValue | undefined): HTMLElement {
		const selectedValues = new Set<string>();
		let freeformValue: string | undefined;
		if (typeof answer === 'string') {
			selectedValues.add(answer);
		} else if (answer) {
			if (hasKey(answer, { selectedValues: true })) {
				for (const selectedValue of answer.selectedValues) {
					selectedValues.add(selectedValue);
				}
				freeformValue = answer.freeformValue;
			} else {
				const singleAnswer = answer as IChatSingleSelectAnswer;
				if (singleAnswer.selectedValue !== undefined) {
					selectedValues.add(singleAnswer.selectedValue);
				}
				freeformValue = singleAnswer.freeformValue;
			}
		}

		const container = dom.$('.chat-question-summary-option-details.chat-used-context-list');
		const optionsTitle = dom.$('.chat-question-summary-options-title');
		optionsTitle.textContent = localize('chat.questionCarousel.optionsTitle', "Options");
		container.appendChild(optionsTitle);

		const optionList = dom.$('ul.chat-question-summary-option-list');
		for (const option of question.options ?? []) {
			const selected = selectedValues.has(option.value);
			const optionItem = dom.$('li.chat-question-summary-option');
			optionItem.classList.toggle('selected', selected);
			optionItem.setAttribute('aria-label', selected
				? localize('chat.questionCarousel.selectedOptionAriaLabel', "{0}, selected", option.label)
				: option.label);
			const optionLabel = dom.$('span.chat-question-summary-option-label');
			optionLabel.textContent = option.label;
			optionItem.appendChild(optionLabel);
			if (selected) {
				optionItem.appendChild(this.renderSelectedOptionState());
			}
			optionList.appendChild(optionItem);
		}
		if (freeformValue) {
			const customItem = dom.$('li.chat-question-summary-option.selected');
			customItem.setAttribute('aria-label', localize('chat.questionCarousel.selectedCustomAnswerAriaLabel', "Custom answer: {0}, selected", freeformValue));
			const customLabel = dom.$('span.chat-question-summary-option-label');
			customLabel.textContent = localize('chat.questionCarousel.customAnswer', "Custom answer: {0}", freeformValue);
			customItem.append(customLabel, this.renderSelectedOptionState());
			optionList.appendChild(customItem);
		}
		container.appendChild(optionList);
		return container;
	}

	private renderSelectedOptionState(): HTMLElement {
		const selectedState = dom.$('span.chat-question-summary-option-selected');
		const selectedIcon = dom.$('span');
		selectedIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.checkCompact));
		selectedIcon.setAttribute('aria-hidden', 'true');
		selectedState.appendChild(selectedIcon);
		return selectedState;
	}

	/**
	 * Formats an answer for display in the summary.
	 */
	private formatAnswerForSummary(question: IChatQuestion, answer: IChatQuestionAnswerValue): string {
		if (this.carousel.autoReply && answer === AgentHostAutoReplyAnswer) {
			return localize('chat.questionCarousel.autoReplyAnswer', "The user is not available to answer your question. Choose a pragmatic option best aligned with the context of the request.");
		}

		switch (question.type) {
			case 'text':
				return question.password ? CHAT_QUESTION_PASSWORD_MASK : String(answer);

			case 'singleSelect': {
				const booleanValue = typeof answer === 'string' ? answer : (answer as IChatSingleSelectAnswer).selectedValue;
				if (isBooleanQuestion(question) && (booleanValue === 'true' || booleanValue === 'false')) {
					return booleanValue === 'true' ? localize('chat.questionCarousel.yes', "Yes") : localize('chat.questionCarousel.no', "No");
				}
				if (typeof answer === 'object') {
					const { selectedValue, freeformValue } = answer as IChatSingleSelectAnswer;
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

	private getQuestionText(questionText: string | IMarkdownString): string {
		const md = typeof questionText === 'string' ? new MarkdownString(questionText) : questionText;
		return renderAsPlaintext(md);
	}

	/**
	 * Validates the current question's answer against its validation rules.
	 * Returns true if valid, false if validation errors were shown.
	 */
	private validateCurrentQuestion(): boolean {
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
	private validateRequiredFields(): boolean {
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
	private getValidationError(value: string, validation: IChatQuestionValidation): string | undefined {
		const failure = findQuestionValidationFailure(value, validation);
		switch (failure?.kind) {
			case undefined:
				return undefined;
			case 'minLength':
				return localize('chat.questionCarousel.validation.minLength', 'Minimum length is {0}', failure.limit);
			case 'maxLength':
				return localize('chat.questionCarousel.validation.maxLength', 'Maximum length is {0}', failure.limit);
			case 'email':
				return localize('chat.questionCarousel.validation.email', 'Please enter a valid email address');
			case 'uri':
				return localize('chat.questionCarousel.validation.uri', 'Please enter a valid URI');
			case 'date':
				return localize('chat.questionCarousel.validation.date', 'Please enter a valid date (YYYY-MM-DD)');
			case 'dateTime':
				return localize('chat.questionCarousel.validation.dateTime', 'Please enter a valid date-time');
			case 'number':
				return localize('chat.questionCarousel.validation.number', 'Please enter a valid number');
			case 'integer':
				return localize('chat.questionCarousel.validation.integer', 'Please enter a valid integer');
			case 'minimum':
				return localize('chat.questionCarousel.validation.minimum', 'Minimum value is {0}', failure.limit);
			case 'maximum':
				return localize('chat.questionCarousel.validation.maximum', 'Maximum value is {0}', failure.limit);
		}
	}

	private showValidationError(message: string): void {
		this._currentValidationError = message;
		if (this._validationMessageElement) {
			this._validationMessageElement.textContent = message;
			this._validationMessageElement.style.display = '';
		}
	}

	private clearValidationError(): void {
		this._currentValidationError = undefined;
		if (this._validationMessageElement) {
			this._validationMessageElement.textContent = '';
			this._validationMessageElement.style.display = 'none';
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
