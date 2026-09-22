/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/inboxNotificationsView.css';
import { $, addDisposableListener, clearNode, EventType, getActiveElement, isHTMLElement, trackFocus } from '../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { triggerConfettiAnimation } from '../../../../base/browser/ui/animations/animations.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { fromNowByDay } from '../../../../base/common/date.js';
import { IChatQuestion, IChatQuestionAnswerValue, IChatQuestionAnswers, IChatSendRequestOptions, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { findQuestionValidationFailure, getDisplayedQuestionText, getOptionsWithDefaultsFirst } from '../../../../workbench/contrib/chat/common/chatService/chatQuestionCarouselHelpers.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { AgentMergeSessionOverrides } from '../../../../platform/agentHost/common/agentMerge.js';
import { SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { AbstractCustomView } from '../../../services/customView/browser/customView.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { InboxCustomViewFocusContext } from '../../../common/contextkeys.js';
import {
	IInboxNotificationAction,
	IInboxNotificationItem,
	IInboxNotificationConfirmationPart,
	IInboxNotificationQuestionCarouselPart,
	IInboxNotificationsService,
	InboxNotificationActionKind,
	InboxNotificationPriority,
	InboxNotificationsSortMode,
} from '../common/inboxNotificationsService.js';
import { getInboxNotificationKindLabel, getInboxNotificationPriorityLabel } from './inboxNotificationsLabels.js';

export class InboxNotificationsView extends AbstractCustomView {

	readonly title: IObservable<string> = constObservable(localize('inboxNotifications.title', "Inbox"));
	override readonly description: IObservable<string | undefined>;

	private readonly scrollableContentElement = $('div.inbox-notifications-list-scrollable');
	private readonly listContainer = observableValue<HTMLElement | undefined>('inboxNotificationsListContainer', undefined);
	private readonly listElement = $('div.inbox-notifications-list');
	private readonly scrollableElement = this._register(new DomScrollableElement(this.scrollableContentElement, {
		horizontal: ScrollbarVisibility.Hidden,
		vertical: ScrollbarVisibility.Auto,
		consumeMouseWheelIfScrollbarIsNeeded: true,
		className: 'inbox-notifications-scrollable',
	}));
	private readonly renderedListDisposables = this._register(new DisposableStore());
	private renderedCards: HTMLElement[] = [];

	constructor(
		@IInboxNotificationsService private readonly inboxNotificationsService: IInboxNotificationsService,
		@IChatService private readonly chatService: IChatService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
		this.description = this.inboxNotificationsService.notifications.map(items => {
			if (items.length === 0) {
				return localize('inboxNotifications.description.empty', "No active notifications.");
			}
			return items.length === 1
				? localize('inboxNotifications.description.single', "1 notification prioritized for action")
				: localize('inboxNotifications.description.plural', "{0} notifications prioritized for action", items.length);
		});
	}

	render(container: HTMLElement): void {
		container.classList.add('inbox-notifications-view');
		container.tabIndex = -1;
		if (!this.listElement.parentElement) {
			this.scrollableContentElement.appendChild(this.listElement);
		}

		const focusContext = InboxCustomViewFocusContext.bindTo(this.contextKeyService);
		const focusTracker = this._register(trackFocus(container));
		this._register(focusTracker.onDidFocus(() => focusContext.set(true)));
		this._register(focusTracker.onDidBlur(() => focusContext.set(false)));
		this._register({
			dispose: () => focusContext.reset(),
		});

		const toolbar = container.appendChild($('.inbox-notifications-toolbar'));
		const sortButtons = toolbar.appendChild($('.inbox-notifications-sort-buttons'));
		const sortByPriorityButton = this._register(new Button(sortButtons, {
			...defaultButtonStyles,
			secondary: true,
			small: true,
			ariaLabel: localize('inboxNotifications.sort.priorityAria', "Sort notifications by priority"),
		}));
		sortByPriorityButton.label = localize('inboxNotifications.sort.priority', "Priority");
		this._register(sortByPriorityButton.onDidClick(() => {
			this.inboxNotificationsService.setSortMode(InboxNotificationsSortMode.Priority);
		}));

		const sortByRecencyButton = this._register(new Button(sortButtons, {
			...defaultButtonStyles,
			secondary: true,
			small: true,
			ariaLabel: localize('inboxNotifications.sort.recencyAria', "Sort notifications by recency"),
		}));
		sortByRecencyButton.label = localize('inboxNotifications.sort.recency', "Recent");
		this._register(sortByRecencyButton.onDidClick(() => {
			this.inboxNotificationsService.setSortMode(InboxNotificationsSortMode.Recency);
		}));

		this._register(autorun(reader => {
			const sortMode = this.inboxNotificationsService.sortMode.read(reader);
			const prioritySelected = sortMode === InboxNotificationsSortMode.Priority;
			sortByPriorityButton.enabled = !prioritySelected;
			sortByRecencyButton.enabled = prioritySelected;
			sortByPriorityButton.element.classList.toggle('active', prioritySelected);
			sortByRecencyButton.element.classList.toggle('active', !prioritySelected);
		}));

		const clearDismissedButton = this._register(new Button(toolbar, {
			...defaultButtonStyles,
			secondary: true,
			ariaLabel: localize('inboxNotifications.clearDismissedAria', "Show dismissed notifications"),
		}));
		clearDismissedButton.label = localize('inboxNotifications.clearDismissed', "Show Dismissed");
		this._register(clearDismissedButton.onDidClick(() => {
			this.inboxNotificationsService.clearDismissedNotifications();
		}));

		container.appendChild(this.scrollableElement.getDomNode());
		const list = this.listElement;
		list.setAttribute('role', 'list');
		list.setAttribute('aria-label', localize('inboxNotifications.listAriaLabel', "Prioritized notifications"));
		this.listContainer.set(list, undefined);
		this._register(addDisposableListener(list, EventType.FOCUS_IN, event => this.onListFocusIn(event)));
		this._register(addDisposableListener(list, EventType.KEY_DOWN, event => this.onListKeyDown(event)));

		this._register(autorun(reader => {
			this.inboxNotificationsService.notifications.read(reader);
			this.renderList();
		}));
	}

	private renderList(): void {
		const list = this.listContainer.get();
		if (!list) {
			return;
		}

		const previouslyFocusedElement = getActiveElement();
		const hadFocusWithinList = isHTMLElement(previouslyFocusedElement) && list.contains(previouslyFocusedElement);
		const focusedNotificationId = hadFocusWithinList
			? previouslyFocusedElement.closest<HTMLElement>('.inbox-notifications-item')?.dataset.notificationId
			: undefined;

		this.renderedListDisposables.clear();
		clearNode(list);

		const items = this.inboxNotificationsService.notifications.get();
		this.renderedCards = [];
		if (items.length === 0) {
			list.appendChild($('.inbox-notifications-empty', undefined, localize('inboxNotifications.empty', "You're all caught up.")));
			return;
		}

		for (const item of items) {
			const card = this.renderItem(item);
			this.renderedCards.push(card);
			list.appendChild(card);
		}

		this.applyCardTabStops(focusedNotificationId);
		if (hadFocusWithinList) {
			const target = this.getNotificationCards().find(card => card.tabIndex === 0);
			target?.focus();
		}

		this.scrollableElement.scanDomNode();
	}

	private renderItem(item: IInboxNotificationItem): HTMLElement {
		const card = $('.inbox-notifications-item');
		card.classList.add(`priority-${item.priority}`);
		card.setAttribute('role', 'listitem');
		card.dataset.notificationId = item.id;
		card.setAttribute('aria-label', this.getCardAriaLabel(item));

		const heading = card.appendChild($('.inbox-notifications-item-header'));
		heading.appendChild($('.inbox-notifications-item-title', undefined, item.title));

		const badges = card.appendChild($('.inbox-notifications-item-badges'));
		badges.appendChild($('.inbox-notifications-item-badge kind', undefined, this.kindLabel(item.kind)));
		if (item.repositoryLabel) {
			badges.appendChild($('.inbox-notifications-item-badge repository', undefined, item.repositoryLabel));
		}
		if (item.pullRequestStates?.length) {
			const pullRequestStates = card.appendChild($('.inbox-notifications-item-pr-states'));
			for (const pullRequestState of item.pullRequestStates) {
				const pullRequestStateElement = pullRequestStates.appendChild($('.inbox-notifications-item-pr-state'));
				const icon = pullRequestStateElement.appendChild(renderIcon(pullRequestState.icon));
				icon.setAttribute('aria-hidden', 'true');
				const pullRequestUri = pullRequestState.pullRequestUri;
				if (pullRequestUri) {
					const pullRequestButton = this.renderedListDisposables.add(new Button(pullRequestStateElement, {
						...defaultButtonStyles,
						secondary: true,
						small: true,
						ariaLabel: localize('inboxNotifications.pullRequestStateLink.ariaLabel', "Open pull request {0}", pullRequestState.label),
					}));
					pullRequestButton.element.classList.add('inbox-notifications-item-pr-state-link');
					pullRequestButton.label = pullRequestState.label;
					this.renderedListDisposables.add(pullRequestButton.onDidClick(() => {
						void this.openerService.open(pullRequestUri).catch(onUnexpectedError);
					}));
				} else {
					pullRequestStateElement.appendChild($('span.inbox-notifications-item-pr-state-label', undefined, pullRequestState.label));
				}
			}
		}

		card.appendChild($('.inbox-notifications-item-description', undefined, item.description));
		this.renderNeedsInputPart(card, item);
		card.appendChild($('.inbox-notifications-item-time', undefined, fromNowByDay(item.timestamp, true, true)));

		const actions = card.appendChild($('.inbox-notifications-item-actions'));
		for (const action of item.actions) {
			const button = this.renderedListDisposables.add(new Button(actions, {
				...defaultButtonStyles,
				secondary: !action.primary,
				small: true,
				supportIcons: action.kind === InboxNotificationActionKind.MarkDone,
				ariaLabel: localize('inboxNotifications.actionAriaLabel', "{0} for {1}", action.ariaLabel ?? action.label, item.title),
			}));
			if (action.kind === InboxNotificationActionKind.MarkDone) {
				button.element.classList.add('inbox-notifications-item-action-done');
			}
			button.label = action.label;
			this.renderedListDisposables.add(button.onDidClick(() => void this.runAction(item, action, button.element)));
		}

		return card;
	}

	private renderNeedsInputPart(card: HTMLElement, item: IInboxNotificationItem): void {
		const part = item.needsInputPart;
		if (!part) {
			return;
		}

		if (part.kind === 'confirmation') {
			const container = card.appendChild($('.inbox-notifications-inline-input'));
			container.appendChild($('.inbox-notifications-inline-input-title', undefined, part.title));
			container.appendChild($('.inbox-notifications-inline-input-message', undefined, this.asPlainText(part.message)));
			const buttons = container.appendChild($('.inbox-notifications-inline-input-actions'));
			const buttonLabels = part.buttons?.length
				? part.buttons
				: [localize('inboxNotifications.confirmation.accept', "Accept"), localize('inboxNotifications.confirmation.dismiss', "Dismiss")];
			for (const [index, buttonLabel] of buttonLabels.entries()) {
				const button = this.renderedListDisposables.add(new Button(buttons, {
					...defaultButtonStyles,
					secondary: index !== 0,
					small: true,
					ariaLabel: localize('inboxNotifications.confirmation.buttonAria', "{0} for {1}", buttonLabel, item.title),
				}));
				button.label = buttonLabel;
				this.renderedListDisposables.add(button.onDidClick(() => void this.submitConfirmationPart(part, buttonLabel, index)));
			}
			return;
		}

		const container = card.appendChild($('.inbox-notifications-inline-input'));
		if (part.message) {
			container.appendChild($('.inbox-notifications-inline-input-message', undefined, this.asPlainText(part.message)));
		}

		const errorElement = container.appendChild($('.inbox-notifications-inline-input-error'));
		errorElement.setAttribute('role', 'status');
		errorElement.style.display = 'none';

		const answerReaders = new Map<string, () => IChatQuestionAnswerValue | undefined>();
		for (const question of part.questions) {
			this.renderQuestion(container, question, answerReaders);
		}

		const actions = container.appendChild($('.inbox-notifications-inline-input-actions'));
		if (part.allowSkip) {
			const skipButton = this.renderedListDisposables.add(new Button(actions, {
				...defaultButtonStyles,
				secondary: true,
				small: true,
				ariaLabel: localize('inboxNotifications.questionCarousel.skipAria', "Skip pending questions"),
			}));
			skipButton.label = localize('inboxNotifications.questionCarousel.skip', "Skip");
			this.renderedListDisposables.add(skipButton.onDidClick(() => void this.submitQuestionCarouselPart(part, answerReaders, errorElement, true)));
		}

		const submitButton = this.renderedListDisposables.add(new Button(actions, {
			...defaultButtonStyles,
			secondary: false,
			small: true,
			ariaLabel: localize('inboxNotifications.questionCarousel.submitAria', "Submit answers"),
		}));
		submitButton.label = localize('inboxNotifications.questionCarousel.submit', "Submit");
		this.renderedListDisposables.add(submitButton.onDidClick(() => void this.submitQuestionCarouselPart(part, answerReaders, errorElement, false)));
	}

	private renderQuestion(
		container: HTMLElement,
		question: IChatQuestion,
		answerReaders: Map<string, () => IChatQuestionAnswerValue | undefined>,
	): void {
		const questionContainer = container.appendChild($('.inbox-notifications-inline-question'));
		questionContainer.appendChild($('.inbox-notifications-inline-question-title', undefined, this.asPlainText(getDisplayedQuestionText(question))));
		if (question.description) {
			questionContainer.appendChild($('.inbox-notifications-inline-question-description', undefined, question.description));
		}

		switch (question.type) {
			case 'text': {
				const input = questionContainer.appendChild($('input.inbox-notifications-inline-question-input')) as HTMLInputElement;
				input.type = 'text';
				input.value = typeof question.defaultValue === 'string' ? question.defaultValue : '';
				input.setAttribute('aria-label', this.asPlainText(getDisplayedQuestionText(question)));
				answerReaders.set(question.id, () => {
					const value = input.value.trim();
					return value.length ? value : undefined;
				});
				return;
			}
			case 'singleSelect': {
				const select = questionContainer.appendChild($('select.inbox-notifications-inline-question-select')) as HTMLSelectElement;
				select.setAttribute('aria-label', this.asPlainText(getDisplayedQuestionText(question)));
				const orderedOptions = getOptionsWithDefaultsFirst(question);
				if (!question.required) {
					const emptyOption = $('option', { value: '' }, localize('inboxNotifications.questionCarousel.none', "Select an option"));
					select.appendChild(emptyOption);
				}
				for (const orderedOption of orderedOptions) {
					const option = $('option', { value: orderedOption.option.value }, orderedOption.option.label);
					select.appendChild(option);
				}
				const freeformInput = question.allowFreeformInput
					? questionContainer.appendChild($('input.inbox-notifications-inline-question-input')) as HTMLInputElement
					: undefined;
				if (freeformInput) {
					freeformInput.type = 'text';
					freeformInput.placeholder = localize('inboxNotifications.questionCarousel.freeformPlaceholder', "Optional additional input");
					freeformInput.setAttribute('aria-label', localize('inboxNotifications.questionCarousel.freeformAria', "Additional input for {0}", this.asPlainText(getDisplayedQuestionText(question))));
				}
				answerReaders.set(question.id, () => {
					const selectedValue = select.value || undefined;
					const freeformValue = freeformInput?.value.trim() || undefined;
					if (!selectedValue && !freeformValue) {
						return undefined;
					}
					return { selectedValue, freeformValue };
				});
				return;
			}
			case 'multiSelect': {
				const orderedOptions = getOptionsWithDefaultsFirst(question);
				const optionCheckboxes = orderedOptions.map(orderedOption => {
					const label = questionContainer.appendChild($('label.inbox-notifications-inline-question-checkbox'));
					const checkbox = label.appendChild($('input')) as HTMLInputElement;
					checkbox.type = 'checkbox';
					if (Array.isArray(question.defaultValue) && question.defaultValue.includes(orderedOption.option.id)) {
						checkbox.checked = true;
					}
					label.appendChild(document.createTextNode(orderedOption.option.label));
					return { checkbox, option: orderedOption.option };
				});
				const freeformInput = question.allowFreeformInput
					? questionContainer.appendChild($('input.inbox-notifications-inline-question-input')) as HTMLInputElement
					: undefined;
				if (freeformInput) {
					freeformInput.type = 'text';
					freeformInput.placeholder = localize('inboxNotifications.questionCarousel.freeformPlaceholder', "Optional additional input");
					freeformInput.setAttribute('aria-label', localize('inboxNotifications.questionCarousel.freeformAria', "Additional input for {0}", this.asPlainText(getDisplayedQuestionText(question))));
				}
				answerReaders.set(question.id, () => {
					const selectedValues = optionCheckboxes
						.filter(entry => entry.checkbox.checked)
						.map(entry => entry.option.value);
					const freeformValue = freeformInput?.value.trim() || undefined;
					if (!selectedValues.length && !freeformValue) {
						return undefined;
					}
					return { selectedValues, freeformValue };
				});
				return;
			}
		}
	}

	private async submitConfirmationPart(
		part: IInboxNotificationConfirmationPart,
		buttonLabel: string,
		buttonIndex: number,
	): Promise<void> {
		const prompt = `${buttonLabel}: "${part.title}"`;
		const options: IChatSendRequestOptions = buttonIndex === 0
			? { acceptedConfirmationData: [part.data] }
			: { rejectedConfirmationData: [part.data] };
		await this.chatService.sendRequest(part.chatResource, prompt, options);
	}

	private async submitQuestionCarouselPart(
		part: IInboxNotificationQuestionCarouselPart,
		answerReaders: Map<string, () => IChatQuestionAnswerValue | undefined>,
		errorElement: HTMLElement,
		skip: boolean,
	): Promise<void> {
		const answersRecord = skip ? undefined : this.buildQuestionAnswers(part.questions, answerReaders, errorElement);
		if (!skip && !answersRecord) {
			return;
		}
		if (!part.resolveId) {
			this.notificationService.error(localize('inboxNotifications.questionCarousel.resolveIdMissing', "Unable to submit this question yet. Open the session to continue."));
			return;
		}
		this.chatService.notifyQuestionCarouselAnswer(part.requestId, part.resolveId, answersRecord);
	}

	private buildQuestionAnswers(
		questions: readonly IChatQuestion[],
		answerReaders: Map<string, () => IChatQuestionAnswerValue | undefined>,
		errorElement: HTMLElement,
	): IChatQuestionAnswers | undefined {
		const answers = new Map<string, IChatQuestionAnswerValue>();
		for (const question of questions) {
			const readAnswer = answerReaders.get(question.id);
			if (!readAnswer) {
				continue;
			}
			const answer = readAnswer();
			if (question.required && answer === undefined) {
				this.showQuestionValidationError(errorElement, localize('inboxNotifications.questionCarousel.required', "This field is required."));
				return undefined;
			}

			const valueToValidate = typeof answer === 'string'
				? answer
				: (answer && 'freeformValue' in answer ? answer.freeformValue : undefined);
			if (question.validation && valueToValidate) {
				const failure = findQuestionValidationFailure(valueToValidate, question.validation);
				if (failure) {
					const limit = 'limit' in failure ? failure.limit : undefined;
					this.showQuestionValidationError(errorElement, this.getValidationErrorMessage(failure.kind, limit));
					return undefined;
				}
			}

			if (answer !== undefined) {
				answers.set(question.id, answer);
			}
		}

		errorElement.style.display = 'none';
		errorElement.textContent = '';
		return Object.fromEntries(answers.entries());
	}

	private showQuestionValidationError(errorElement: HTMLElement, message: string): void {
		errorElement.textContent = message;
		errorElement.style.display = '';
	}

	private getValidationErrorMessage(kind: 'minLength' | 'maxLength' | 'minimum' | 'maximum' | 'email' | 'uri' | 'date' | 'dateTime' | 'number' | 'integer', limit: number | undefined): string {
		switch (kind) {
			case 'minLength':
				return localize('inboxNotifications.questionCarousel.validation.minLength', "Minimum length is {0}.", limit);
			case 'maxLength':
				return localize('inboxNotifications.questionCarousel.validation.maxLength', "Maximum length is {0}.", limit);
			case 'email':
				return localize('inboxNotifications.questionCarousel.validation.email', "Please enter a valid email address.");
			case 'uri':
				return localize('inboxNotifications.questionCarousel.validation.uri', "Please enter a valid URI.");
			case 'date':
				return localize('inboxNotifications.questionCarousel.validation.date', "Please enter a valid date (YYYY-MM-DD).");
			case 'dateTime':
				return localize('inboxNotifications.questionCarousel.validation.dateTime', "Please enter a valid date-time.");
			case 'number':
				return localize('inboxNotifications.questionCarousel.validation.number', "Please enter a valid number.");
			case 'integer':
				return localize('inboxNotifications.questionCarousel.validation.integer', "Please enter a valid integer.");
			case 'minimum':
				return localize('inboxNotifications.questionCarousel.validation.minimum', "Minimum value is {0}.", limit);
			case 'maximum':
				return localize('inboxNotifications.questionCarousel.validation.maximum', "Maximum value is {0}.", limit);
			default:
				return localize('inboxNotifications.questionCarousel.validation.invalid', "Please provide a valid answer.");
		}
	}

	private asPlainText(value: string | IMarkdownString): string {
		return typeof value === 'string' ? value : renderAsPlaintext(value).trim();
	}

	private onListFocusIn(event: FocusEvent): void {
		const target = event.target;
		if (!isHTMLElement(target)) {
			return;
		}
		if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable) {
			return;
		}

		const card = target.closest<HTMLElement>('.inbox-notifications-item');
		if (!card) {
			return;
		}

		this.setActiveCard(card);
	}

	private onListKeyDown(event: KeyboardEvent): void {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
			return;
		}

		const target = event.target;
		if (!isHTMLElement(target)) {
			return;
		}

		const cards = this.getNotificationCards();
		const currentIndex = cards.findIndex(card => card === target || card.contains(target));
		if (currentIndex === -1) {
			return;
		}

		const delta = event.key === 'ArrowDown' ? 1 : -1;
		const nextIndex = Math.min(cards.length - 1, Math.max(0, currentIndex + delta));
		if (nextIndex === currentIndex) {
			return;
		}

		event.preventDefault();
		this.setActiveCard(cards[nextIndex]);
		cards[nextIndex].focus();
	}

	private applyCardTabStops(preferredNotificationId: string | undefined): void {
		const cards = this.getNotificationCards();
		if (cards.length === 0) {
			return;
		}

		const activeCard = preferredNotificationId
			? cards.find(card => card.dataset.notificationId === preferredNotificationId)
			: undefined;
		this.setActiveCard(activeCard ?? cards[0]);
	}

	private setActiveCard(activeCard: HTMLElement): void {
		const cards = this.getNotificationCards();
		const setSize = cards.length;
		for (const [index, card] of cards.entries()) {
			card.tabIndex = card === activeCard ? 0 : -1;
			card.setAttribute('aria-posinset', String(index + 1));
			card.setAttribute('aria-setsize', String(setSize));
		}
	}

	private getNotificationCards(): HTMLElement[] {
		return this.renderedCards;
	}

	private kindLabel(kind: IInboxNotificationItem['kind']): string {
		return getInboxNotificationKindLabel(kind);
	}

	private priorityLabel(priority: InboxNotificationPriority): string {
		return getInboxNotificationPriorityLabel(priority);
	}

	private getCardAriaLabel(item: IInboxNotificationItem): string {
		const segments = [
			localize('inboxNotifications.itemAriaLabel.priority', "Priority {0}", this.priorityLabel(item.priority)),
			this.kindLabel(item.kind),
		];
		if (item.repositoryLabel) {
			segments.push(localize('inboxNotifications.itemAriaLabel.repository', "Repository {0}", item.repositoryLabel));
		}
		const pullRequestStatesAria = this.getPullRequestStatesAriaLabel(item);
		if (pullRequestStatesAria) {
			segments.push(pullRequestStatesAria);
		}
		if (item.needsInputPart) {
			segments.push(localize('inboxNotifications.itemAriaLabel.inlineInput', "Contains inline input controls."));
		}
		segments.push(item.title, item.description);
		return segments.join('. ');
	}

	private getPullRequestStatesAriaLabel(item: IInboxNotificationItem): string | undefined {
		if (!item.pullRequestStates?.length) {
			return undefined;
		}
		if (item.pullRequestStates.length === 1) {
			const state = item.pullRequestStates[0];
			return localize('inboxNotifications.itemAriaLabel.pullRequestState.single', "Pull request {0}: {1}", state.label, state.statusLabel);
		}
		return localize(
			'inboxNotifications.itemAriaLabel.pullRequestState.multiple',
			"Pull requests: {0}",
			item.pullRequestStates.map(state => `${state.label}: ${state.statusLabel}`).join('; '),
		);
	}

	private async runAction(item: IInboxNotificationItem, action: IInboxNotificationAction, sourceElement?: HTMLElement): Promise<void> {
		try {
			switch (action.kind) {
				case InboxNotificationActionKind.OpenSession: {
					if (!item.sessionResource) {
						return;
					}
					await this.sessionsService.openSession(item.sessionResource);
					return;
				}
				case InboxNotificationActionKind.AgentMergeFixCI:
					await this.runAgentMergeAction(item, { fixCI: true });
					return;
				case InboxNotificationActionKind.AgentMergeAddressReviews:
					await this.runAgentMergeAction(item, { addressReviews: true });
					return;
				case InboxNotificationActionKind.AgentMergeMergePullRequest:
					await this.runAgentMergeAction(item, { mergePullRequest: 'always' });
					return;
				case InboxNotificationActionKind.MarkDone: {
					await this.markDone(item, sourceElement);
					return;
				}
				case InboxNotificationActionKind.Dismiss:
					this.inboxNotificationsService.dismissNotification(item.id);
					return;
				case InboxNotificationActionKind.Command:
					if (action.commandId) {
						await this.commandService.executeCommand(action.commandId, ...(action.commandArgs ?? []));
					}
					return;
			}
		} catch (error) {
			onUnexpectedError(error);
			this.notificationService.error(localize('inboxNotifications.actionError', "Unable to run inbox action."));
		}
	}

	private async runAgentMergeAction(item: IInboxNotificationItem, overrides: AgentMergeSessionOverrides): Promise<void> {
		if (!item.sessionResource) {
			return;
		}

		const session = this.sessionsManagementService.getSession(item.sessionResource);
		if (!session) {
			return;
		}

		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			await this.sessionsService.openSession(item.sessionResource);
			return;
		}

		await provider.setAgentMergeEnabled(session.sessionId, true);
		const currentOverrides = provider.getAgentMergeSessionState(session.sessionId)?.overrides;
		await provider.setAgentMergeOverrides(session.sessionId, {
			...currentOverrides,
			...overrides,
		});
	}

	private async markDone(item: IInboxNotificationItem, sourceElement: HTMLElement | undefined): Promise<void> {
		if (sourceElement
			&& this.configurationService.getValue<boolean>(SESSIONS_MARK_AS_DONE_CONFETTI_SETTING)
			&& !this.accessibilityService.isMotionReduced()) {
			triggerConfettiAnimation(sourceElement);
		}

		if (item.sessionResource) {
			const session = this.sessionsManagementService.getSession(item.sessionResource);
			if (session) {
				await this.sessionsManagementService.markRead(session);
			}
		}

		this.inboxNotificationsService.dismissNotification(item.id);
	}

	layout(_width: number, _height: number): void {
		this.scrollableElement.scanDomNode();
	}
}
