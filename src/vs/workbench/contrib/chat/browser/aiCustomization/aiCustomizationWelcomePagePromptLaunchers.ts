/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationWelcomePromptLaunchers.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import type { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { AICustomizationManagementSection } from './aiCustomizationManagement.js';
import { agentIcon, instructionsIcon, pluginIcon, skillIcon, hookIcon } from './aiCustomizationIcons.js';
import { IAICustomizationWorkspaceService, IWelcomePageFeatures } from '../../common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import type { IAICustomizationWelcomePageImplementation, IWelcomePageCallbacks } from './aiCustomizationWelcomePage.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';

const $ = DOM.$;

interface IPromptLaunchersCategoryDescription {
	readonly id: AICustomizationManagementSection;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly description: string;
	readonly promptType?: PromptsType;
}

export class PromptLaunchersAICustomizationWelcomePage extends Disposable implements IAICustomizationWelcomePageImplementation {

	private readonly cardDisposables = this._register(new DisposableStore());

	readonly container: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private cardsContainer: HTMLElement | undefined;
	private inputElement: HTMLInputElement | undefined;

	private sentLabel: HTMLElement | undefined;
	private submitBtn: HTMLElement | undefined;
	private inputRow: HTMLElement | undefined;

	private readonly categoryDescriptions: IPromptLaunchersCategoryDescription[] = [
		{
			id: AICustomizationManagementSection.Agents,
			label: localize('agents', "Agents"),
			icon: agentIcon,
			description: localize('agentsDesc', "Define custom agents with specialized personas, tool access, and instructions for specific tasks."),
			promptType: PromptsType.agent,
		},
		{
			id: AICustomizationManagementSection.Skills,
			label: localize('skills', "Skills"),
			icon: skillIcon,
			description: localize('skillsDesc', "Create reusable skill files that provide domain-specific knowledge and workflows."),
			promptType: PromptsType.skill,
		},
		{
			id: AICustomizationManagementSection.Instructions,
			label: localize('instructions', "Instructions"),
			icon: instructionsIcon,
			description: localize('instructionsDesc', "Set always-on instructions that guide AI behavior across your workspace or user profile."),
			promptType: PromptsType.instructions,
		},
		{
			id: AICustomizationManagementSection.Hooks,
			label: localize('hooks', "Hooks"),
			icon: hookIcon,
			description: localize('hooksDesc', "Configure automated actions triggered by events like saving files or running tasks."),
			promptType: PromptsType.hook,
		},
		{
			id: AICustomizationManagementSection.McpServers,
			label: localize('mcpServers', "MCP Servers"),
			icon: Codicon.server,
			description: localize('mcpServersDesc', "Connect external tool servers that extend AI capabilities with custom tools and data sources."),
		},
		{
			id: AICustomizationManagementSection.Plugins,
			label: localize('plugins', "Plugins"),
			icon: pluginIcon,
			description: localize('pluginsDesc', "Install and manage agent plugins that add additional tools, skills, and integrations."),
		},
	];

	constructor(
		parent: HTMLElement,
		private readonly welcomePageFeatures: IWelcomePageFeatures | undefined,
		private readonly callbacks: IWelcomePageCallbacks,
		_commandService: ICommandService,
		private readonly workspaceService: IAICustomizationWorkspaceService,
		private readonly hoverService: IHoverService,
	) {
		super();

		this.container = $('.welcome-prompts-content-container');
		this.scrollable = this._register(new DomScrollableElement(this.container, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			useShadows: false,
		}));
		const scrollableNode = this.scrollable.getDomNode();
		scrollableNode.classList.add('welcome-prompts-scrollable');
		parent.appendChild(scrollableNode);

		// Re-scan whenever the wrapper changes size so the scrollbar reflects
		// the current overflow state. rebuildCards() scans after content changes.
		const resizeObserver = this._register(new DOM.DisposableResizeObserver(() => this.scrollable.scanDomNode()));
		this._register(resizeObserver.observe(scrollableNode));

		const welcomeInner = DOM.append(this.container, $('.welcome-prompts-inner'));

		const heading = DOM.append(welcomeInner, $('h2.welcome-prompts-heading'));
		heading.textContent = localize('welcomeHeading', "Agent Customizations");

		const subtitle = DOM.append(welcomeInner, $('p.welcome-prompts-subtitle'));
		subtitle.textContent = localize('welcomeSubtitle', "Tailor how agents work in your projects. Configure workspace customizations for the entire team, or create personal ones that follow you across projects.");

		if (this.welcomePageFeatures?.showGettingStartedBanner !== false) {
			const gettingStarted = DOM.append(welcomeInner, $('.welcome-prompts-primary'));
			const header = DOM.append(gettingStarted, $('.welcome-prompts-section-label'));
			const icon = DOM.append(header, $('span.welcome-prompts-section-label-icon.codicon.codicon-sparkle'));
			icon.setAttribute('aria-hidden', 'true');
			const title = DOM.append(header, $('span'));
			title.textContent = localize('gettingStartedTitle', "Customize Your Agent");

			const description = DOM.append(gettingStarted, $('p.welcome-prompts-input-helper'));
			description.textContent = localize('gettingStartedDesc', "Describe your preferences and conventions to draft agents, skills, and instructions.");

			const inputRow = DOM.append(gettingStarted, $('.welcome-prompts-input-row'));
			this.inputRow = inputRow;
			this.inputElement = DOM.append(inputRow, $('input.welcome-prompts-input')) as HTMLInputElement;
			this.inputElement.type = 'text';
			this.inputElement.placeholder = localize('workflowInputPlaceholder', "Prefer concise commits, thorough reviews, and tested code...");
			this.inputElement.setAttribute('aria-label', localize('workflowInputAriaLabel', "Describe your preferences to customize your agent"));

			const submitBtn = DOM.append(inputRow, $('button.welcome-prompts-input-submit'));
			this.submitBtn = submitBtn;
			submitBtn.setAttribute('aria-label', localize('workflowSubmitAriaLabel', "Customize agent"));
			this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), submitBtn, localize('workflowSubmitTooltip', "Open in Chat")));
			const chevron = DOM.append(submitBtn, $('span.codicon.codicon-arrow-up'));
			chevron.setAttribute('aria-hidden', 'true');

			const updateSubmitState = () => {
				const hasValue = !!(this.inputElement?.value?.trim());
				(submitBtn as HTMLButtonElement).disabled = !hasValue;
				submitBtn.classList.toggle('welcome-prompts-input-submit-disabled', !hasValue);
			};

			const submit = () => {
				const value = this.inputElement?.value?.trim();
				if (!value) {
					return;
				}
				let query: string;
				if (this.workspaceService.isSessionsWindow) {
					query = `Generate agent customizations. ${value}`;
				} else {
					query = `/init ${value}`;
				}

				// Show confirmation immediately — before prefillChat so it's visible
				// even if prefillChat navigates focus away from this editor
				if (this.inputElement) {
					this.inputElement.value = '';
				}
				updateSubmitState();
				inputRow.classList.add('sent');
				submitBtn.style.display = 'none';
				if (this.sentLabel) {
					this.sentLabel.remove();
				}
				this.sentLabel = DOM.append(inputRow, $('span.welcome-prompts-sent-label'));
				this.sentLabel.textContent = localize('sentToChat', "Sent to chat \u2713");

				this.callbacks.prefillChat(query, { isPartialQuery: false, newChat: true });
			};

			this._register(DOM.addDisposableListener(submitBtn, 'click', e => { e.stopPropagation(); submit(); }));
			this._register(DOM.addDisposableListener(this.inputElement, 'keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					submit();
				}
			}));
			this._register(DOM.addDisposableListener(this.inputElement, 'input', () => {
				updateSubmitState();
				// Typing restores the input row from sent state
				this._clearSentState();
			}));
			updateSubmitState();
		}

		this.cardsContainer = DOM.append(welcomeInner, $('.welcome-prompts-cards'));
	}

	private _clearSentState(): void {
		if (this.sentLabel) {
			this.sentLabel.remove();
			this.sentLabel = undefined;
		}
		if (this.submitBtn) {
			this.submitBtn.style.display = '';
		}
		if (this.inputRow) {
			this.inputRow.classList.remove('sent');
		}
	}

	reset(): void {
		this._clearSentState();
	}

	rebuildCards(visibleSectionIds: ReadonlySet<AICustomizationManagementSection>): void {
		if (!this.cardsContainer) {
			return;
		}

		this.cardDisposables.clear();
		DOM.clearNode(this.cardsContainer);

		for (const category of this.categoryDescriptions) {
			if (!visibleSectionIds.has(category.id)) {
				continue;
			}

			const card = DOM.append(this.cardsContainer, $('.welcome-prompts-card'));
			card.setAttribute('tabindex', '0');
			card.setAttribute('role', 'button');

			const cardHeader = DOM.append(card, $('.welcome-prompts-card-header'));
			const iconEl = DOM.append(cardHeader, $('.welcome-prompts-card-icon'));
			iconEl.classList.add(...ThemeIcon.asClassNameArray(category.icon));
			const labelEl = DOM.append(cardHeader, $('span.welcome-prompts-card-label'));
			labelEl.textContent = category.label;

			const descEl = DOM.append(card, $('p.welcome-prompts-card-description'));
			descEl.textContent = category.description;

			const footer = DOM.append(card, $('.welcome-prompts-card-footer'));
			if (category.promptType) {
				const generateBtn = DOM.append(footer, $('button.welcome-prompts-card-action'));
				generateBtn.textContent = localize('new', "New...");
				this.cardDisposables.add(DOM.addDisposableListener(generateBtn, 'click', e => {
					e.stopPropagation();
					this.callbacks.closeEditor();
					if (this.workspaceService.isSessionsWindow) {
						const typeLabel = category.label.toLowerCase().replace(/s$/, '');
						this.callbacks.prefillChat(`Create me a custom ${typeLabel} that `, { isPartialQuery: true, newChat: true });
					} else {
						this.workspaceService.generateCustomization(category.promptType!);
					}
				}));
			} else {
				const browseBtn = DOM.append(footer, $('button.welcome-prompts-card-action'));
				browseBtn.textContent = localize('browse', "Browse...");
				this.cardDisposables.add(DOM.addDisposableListener(browseBtn, 'click', e => {
					e.stopPropagation();
					this.callbacks.selectSectionWithMarketplace(category.id);
				}));
			}

			this.cardDisposables.add(DOM.addDisposableListener(card, 'click', () => {
				this.callbacks.selectSection(category.id);
			}));
			this.cardDisposables.add(DOM.addDisposableListener(card, 'keydown', e => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.callbacks.selectSection(category.id);
				}
			}));
		}

		// Content changed — recompute scroll dimensions.
		this.scrollable.scanDomNode();
	}

	focus(): void {
		this.inputElement?.focus();
	}
}
