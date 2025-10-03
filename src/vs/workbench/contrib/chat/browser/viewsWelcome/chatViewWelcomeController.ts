/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IMarkdownRenderResult, MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatWidgetService } from '../chat.js';
import { chatViewsWelcomeRegistry, IChatViewsWelcomeDescriptor } from './chatViewsWelcome.js';

const $ = dom.$;

export interface IViewWelcomeDelegate {
	readonly onDidChangeViewWelcomeState: Event<void>;
	shouldShowWelcome(): boolean;
}

export class ChatViewWelcomeController extends Disposable {
	private element: HTMLElement | undefined;

	private enabled = false;
	private readonly enabledDisposables = this._register(new DisposableStore());
	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		private readonly container: HTMLElement,
		private readonly delegate: IViewWelcomeDelegate,
		private readonly location: ChatAgentLocation,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super();

		this.element = dom.append(this.container, dom.$('.chat-view-welcome'));
		this._register(Event.runAndSubscribe(
			delegate.onDidChangeViewWelcomeState,
			() => this.update()));
		this._register(chatViewsWelcomeRegistry.onDidChange(() => this.update(true)));
	}

	private update(force?: boolean): void {
		const enabled = this.delegate.shouldShowWelcome();
		if (this.enabled === enabled && !force) {
			return;
		}

		this.enabled = enabled;
		this.enabledDisposables.clear();

		if (!enabled) {
			this.container.classList.toggle('chat-view-welcome-visible', false);
			this.renderDisposables.clear();
			return;
		}

		const descriptors = chatViewsWelcomeRegistry.get();
		if (descriptors.length) {
			this.render(descriptors);

			const descriptorKeys: Set<string> = new Set(descriptors.flatMap(d => d.when.keys()));
			this.enabledDisposables.add(this.contextKeyService.onDidChangeContext(e => {
				if (e.affectsSome(descriptorKeys)) {
					this.render(descriptors);
				}
			}));
		}
	}

	private render(descriptors: ReadonlyArray<IChatViewsWelcomeDescriptor>): void {
		this.renderDisposables.clear();
		dom.clearNode(this.element!);

		const matchingDescriptors = descriptors.filter(descriptor => this.contextKeyService.contextMatchesRules(descriptor.when));
		const enabledDescriptor = matchingDescriptors.at(0);
		if (enabledDescriptor) {
			const content: IChatViewWelcomeContent = {
				icon: enabledDescriptor.icon,
				title: enabledDescriptor.title,
				message: enabledDescriptor.content
			};
			const welcomeView = this.renderDisposables.add(this.instantiationService.createInstance(ChatViewWelcomePart, content, { firstLinkToButton: true, location: this.location }));
			this.element!.appendChild(welcomeView.element);
			this.container.classList.toggle('chat-view-welcome-visible', true);
		} else {
			this.container.classList.toggle('chat-view-welcome-visible', false);
		}
	}
}

export interface IChatViewWelcomeContent {
	readonly icon?: ThemeIcon;
	readonly title: string;
	readonly message: IMarkdownString;
	readonly additionalMessage?: string | IMarkdownString;
	tips?: IMarkdownString;
	readonly inputPart?: HTMLElement;
	readonly isNew?: boolean;
	readonly suggestedPrompts?: readonly IChatSuggestedPrompts[];
}

export interface IChatSuggestedPrompts {
	readonly icon?: ThemeIcon;
	readonly label: string;
	readonly description?: string;
	readonly prompt: string;
}

export interface IChatViewWelcomeRenderOptions {
	readonly firstLinkToButton?: boolean;
	readonly location: ChatAgentLocation;
	readonly isWidgetAgentWelcomeViewContent?: boolean;
}

export class ChatViewWelcomePart extends Disposable {
	public readonly element: HTMLElement;

	constructor(
		public readonly content: IChatViewWelcomeContent,
		options: IChatViewWelcomeRenderOptions | undefined,
		@IOpenerService private openerService: IOpenerService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ILogService private logService: ILogService,
		@IChatWidgetService private chatWidgetService: IChatWidgetService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
	) {
		super();

		this.element = dom.$('.chat-welcome-view');

		try {
			const renderer = this.instantiationService.createInstance(MarkdownRenderer, {});

			// Icon
			const icon = dom.append(this.element, $('.chat-welcome-view-icon'));
			if (content.icon) {
				icon.appendChild(renderIcon(content.icon));
			}

			// Title
			const title = dom.append(this.element, $('.chat-welcome-view-title'));
			title.textContent = content.title;

			// Preview indicator (no experimental variants)
			const expEmptyState = this.configurationService.getValue<boolean>('chat.emptyChatState.enabled');
			if (typeof content.message !== 'function' && options?.isWidgetAgentWelcomeViewContent && !expEmptyState) {
				const container = dom.append(this.element, $('.chat-welcome-view-indicator-container'));
				dom.append(container, $('.chat-welcome-view-subtitle', undefined, localize('agentModeSubtitle', "Agent Mode")));
			}

			// Message
			const message = dom.append(this.element, content.isNew ? $('.chat-welcome-new-view-message') : $('.chat-welcome-view-message'));
			message.classList.toggle('empty-state', expEmptyState);

			const messageResult = this.renderMarkdownMessageContent(renderer, content.message, options);
			dom.append(message, messageResult.element);

			if (content.isNew && content.inputPart) {
				content.inputPart.querySelector('.chat-attachments-container')?.remove();
				dom.append(this.element, content.inputPart);
			}

			// Additional message (new user mode)
			if (!content.isNew && content.additionalMessage) {
				const disclaimers = dom.append(this.element, $('.chat-welcome-view-disclaimer'));
				if (typeof content.additionalMessage === 'string') {
					disclaimers.textContent = content.additionalMessage;
				} else {
					const additionalMessageResult = this.renderMarkdownMessageContent(renderer, content.additionalMessage, options);
					disclaimers.appendChild(additionalMessageResult.element);
				}
			}

			// Render suggested prompts for both new user and regular modes
			if (content.suggestedPrompts && content.suggestedPrompts.length) {
				const suggestedPromptsContainer = dom.append(this.element, $('.chat-welcome-view-suggested-prompts'));
				const titleElement = dom.append(suggestedPromptsContainer, $('.chat-welcome-view-suggested-prompts-title'));
				titleElement.textContent = localize('chatWidget.suggestedActions', 'Suggested Actions');

				for (const prompt of content.suggestedPrompts) {
					const promptElement = dom.append(suggestedPromptsContainer, $('.chat-welcome-view-suggested-prompt'));
					// Make the prompt element keyboard accessible
					promptElement.setAttribute('role', 'button');
					promptElement.setAttribute('tabindex', '0');
					const promptAriaLabel = prompt.description
						? localize('suggestedPromptAriaLabelWithDescription', 'Suggested prompt: {0}, {1}', prompt.label, prompt.description)
						: localize('suggestedPromptAriaLabel', 'Suggested prompt: {0}', prompt.label);
					promptElement.setAttribute('aria-label', promptAriaLabel);
					const titleElement = dom.append(promptElement, $('.chat-welcome-view-suggested-prompt-title'));
					titleElement.textContent = prompt.label;
					const tooltip = localize('runPromptTitle', "Suggested prompt: {0}", prompt.prompt);
					promptElement.title = tooltip;
					titleElement.title = tooltip;
					if (prompt.description) {
						const descriptionElement = dom.append(promptElement, $('.chat-welcome-view-suggested-prompt-description'));
						descriptionElement.textContent = prompt.description;
						descriptionElement.title = prompt.description;
					}
					const executePrompt = () => {
						type SuggestedPromptClickEvent = { suggestedPrompt: string };

						type SuggestedPromptClickData = {
							owner: 'bhavyaus';
							comment: 'Event used to gain insights into when suggested prompts are clicked.';
							suggestedPrompt: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The suggested prompt clicked.' };
						};

						this.telemetryService.publicLog2<SuggestedPromptClickEvent, SuggestedPromptClickData>('chat.clickedSuggestedPrompt', {
							suggestedPrompt: prompt.prompt,
						});

						if (!this.chatWidgetService.lastFocusedWidget) {
							const widgets = this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat);
							if (widgets.length) {
								widgets[0].setInput(prompt.prompt);
							}
						} else {
							this.chatWidgetService.lastFocusedWidget.setInput(prompt.prompt);
						}
					};
					// Add click handler
					this._register(dom.addDisposableListener(promptElement, dom.EventType.CLICK, executePrompt));
					// Add keyboard handler for Enter and Space keys
					this._register(dom.addDisposableListener(promptElement, dom.EventType.KEY_DOWN, (e) => {
						const event = new StandardKeyboardEvent(e);
						if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
							e.preventDefault();
							e.stopPropagation();
							executePrompt();
						}
					}));
				}
			}

			// Tips
			if (content.tips) {
				const tips = dom.append(this.element, $('.chat-welcome-view-tips'));
				const tipsResult = this._register(renderer.render(content.tips));
				tips.appendChild(tipsResult.element);
			}

			// In new user mode, render the additional message after suggested prompts (deferred)
			if (content.isNew && content.additionalMessage) {
				const additionalMsg = dom.append(this.element, $('.chat-welcome-view-additional-message'));
				if (typeof content.additionalMessage === 'string') {
					additionalMsg.textContent = content.additionalMessage;
				} else {
					const additionalMessageResult = this.renderMarkdownMessageContent(renderer, content.additionalMessage, options);
					additionalMsg.appendChild(additionalMessageResult.element);
				}
			}
		} catch (err) {
			this.logService.error('Failed to render chat view welcome content', err);
		}
	}

	public needsRerender(content: IChatViewWelcomeContent): boolean {
		// Heuristic based on content that changes between states
		return !!(content.isNew ||
			this.content.title !== content.title ||
			this.content.isNew !== content.isNew ||
			this.content.message.value !== content.message.value ||
			this.content.additionalMessage !== content.additionalMessage ||
			this.content.tips?.value !== content.tips?.value ||
			this.content.suggestedPrompts?.length !== content.suggestedPrompts?.length ||
			this.content.suggestedPrompts?.some((prompt, index) => {
				const incoming = content.suggestedPrompts?.[index];
				return incoming?.label !== prompt.label || incoming?.description !== prompt.description;
			}));
	}

	private renderMarkdownMessageContent(renderer: MarkdownRenderer, content: IMarkdownString, options: IChatViewWelcomeRenderOptions | undefined): IMarkdownRenderResult {
		const messageResult = this._register(renderer.render(content));
		const firstLink = options?.firstLinkToButton ? messageResult.element.querySelector('a') : undefined;
		if (firstLink) {
			const target = firstLink.getAttribute('data-href');
			const button = this._register(new Button(firstLink.parentElement!, defaultButtonStyles));
			button.label = firstLink.textContent ?? '';
			if (target) {
				this._register(button.onDidClick(() => {
					this.openerService.open(target, { allowCommands: true });
				}));
			}
			firstLink.replaceWith(button.element);
		}
		return messageResult;
	}
}
