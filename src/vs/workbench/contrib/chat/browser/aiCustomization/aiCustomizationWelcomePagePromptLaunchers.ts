/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationWelcomePromptLaunchers.css';
import * as DOM from '../../../../../base/browser/dom.js';
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
	private cardsContainer: HTMLElement | undefined;
	private inputElement: HTMLInputElement | undefined;

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
	) {
		super();

		this.container = DOM.append(parent, $('.welcome-prompts-content-container'));
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
			title.textContent = localize('gettingStartedTitle', "Generate Workflow");

			const description = DOM.append(gettingStarted, $('p.welcome-prompts-input-helper'));
			description.textContent = localize('gettingStartedDesc', "Describe your stack, conventions, and workflow to draft agents, skills, and instructions.");

			const inputRow = DOM.append(gettingStarted, $('.welcome-prompts-input-row'));
			this.inputElement = DOM.append(inputRow, $('input.welcome-prompts-input')) as HTMLInputElement;
			this.inputElement.type = 'text';
			this.inputElement.placeholder = localize('workflowInputPlaceholder', "I'm building a React app with TypeScript and Tailwind...");
			this.inputElement.setAttribute('aria-label', localize('workflowInputAriaLabel', "Describe your project to generate a workflow"));

			const submitBtn = DOM.append(inputRow, $('button.welcome-prompts-input-submit'));
			submitBtn.setAttribute('aria-label', localize('workflowSubmitAriaLabel', "Generate workflow"));
			const chevron = DOM.append(submitBtn, $('span.codicon.codicon-arrow-up'));
			chevron.setAttribute('aria-hidden', 'true');

			const submit = () => {
				const value = this.inputElement?.value?.trim();
				this.callbacks.closeEditor();
				let query: string;
				if (this.workspaceService.isSessionsWindow) {
					query = value ? `Generate agent customizations. ${value}` : 'Generate agent customizations. ';
				} else {
					query = value ? `/init ${value}` : '/init ';
				}
				this.callbacks.prefillChat(query, { isPartialQuery: !value });
			};
			this._register(DOM.addDisposableListener(submitBtn, 'click', submit));
			this._register(DOM.addDisposableListener(this.inputElement, 'keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					submit();
				}
			}));
		}

		this.cardsContainer = DOM.append(welcomeInner, $('.welcome-prompts-cards'));
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
						this.callbacks.prefillChat(`Create me a custom ${typeLabel} that `, { isPartialQuery: true });
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
	}

	focus(): void {
		this.inputElement?.focus();
	}
}
