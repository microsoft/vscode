/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationWelcomeClassic.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { AICustomizationManagementSection } from './aiCustomizationManagement.js';
import { agentIcon, instructionsIcon, pluginIcon, skillIcon, hookIcon } from './aiCustomizationIcons.js';
import { IAICustomizationWorkspaceService, IWelcomePageFeatures } from '../../common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import type { IAICustomizationWelcomePageImplementation, IWelcomePageCallbacks } from './aiCustomizationWelcomePage.js';

const $ = DOM.$;

interface IClassicCategoryDescription {
	readonly id: AICustomizationManagementSection;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly description: string;
	readonly promptType?: PromptsType;
}

export class ClassicAICustomizationWelcomePage extends Disposable implements IAICustomizationWelcomePageImplementation {

	private readonly cardDisposables = this._register(new DisposableStore());

	readonly container: HTMLElement;
	private cardsContainer: HTMLElement | undefined;
	private gettingStartedButton: HTMLButtonElement | undefined;

	private readonly categoryDescriptions: IClassicCategoryDescription[] = [
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
		private readonly commandService: ICommandService,
		private readonly workspaceService: IAICustomizationWorkspaceService,
	) {
		super();

		this.container = DOM.append(parent, $('.welcome-classic-content-container'));
		const welcomeInner = DOM.append(this.container, $('.welcome-classic-inner'));

		const heading = DOM.append(welcomeInner, $('h2.welcome-classic-heading'));
		heading.textContent = localize('welcomeHeading', "Chat Customizations");

		const subtitle = DOM.append(welcomeInner, $('p.welcome-classic-subtitle'));
		subtitle.textContent = localize('welcomeSubtitle', "Tailor how agents work in your projects. Configure workspace customizations for the entire team, or create personal ones that follow you across projects.");

		if (this.welcomePageFeatures?.showGettingStartedBanner !== false) {
			const gettingStarted = DOM.append(welcomeInner, $('button.welcome-classic-getting-started')) as HTMLButtonElement;
			this.gettingStartedButton = gettingStarted;
			const icon = DOM.append(gettingStarted, $('span.welcome-classic-getting-started-icon.codicon.codicon-sparkle'));
			icon.setAttribute('aria-hidden', 'true');
			const text = DOM.append(gettingStarted, $('.welcome-classic-getting-started-text'));
			const title = DOM.append(text, $('span.welcome-classic-getting-started-title'));
			title.textContent = localize('gettingStartedTitle', "Configure Your AI");
			const description = DOM.append(text, $('span.welcome-classic-getting-started-desc'));
			description.textContent = localize('gettingStartedDesc', "Describe your project and coding patterns. Copilot will generate agents, skills, and instructions tailored to your workflow.");
			const chevron = DOM.append(gettingStarted, $('span.welcome-classic-getting-started-chevron.codicon.codicon-chevron-right'));
			chevron.setAttribute('aria-hidden', 'true');
			this._register(DOM.addDisposableListener(gettingStarted, 'click', () => {
				this.callbacks.closeEditor();
				if (this.workspaceService.isSessionsWindow) {
					this.callbacks.prefillChat('Generate agent customizations. ', { isPartialQuery: true, newChat: true });
				} else {
					this.commandService.executeCommand('workbench.action.chat.open', { query: '/init ', isPartialQuery: true });
				}
			}));
		}

		this.cardsContainer = DOM.append(welcomeInner, $('.welcome-classic-cards'));
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

			const card = DOM.append(this.cardsContainer, $('.welcome-classic-card'));
			card.setAttribute('tabindex', '0');
			card.setAttribute('role', 'button');

			const cardHeader = DOM.append(card, $('.welcome-classic-card-header'));
			const iconEl = DOM.append(cardHeader, $('.welcome-classic-card-icon'));
			iconEl.classList.add(...ThemeIcon.asClassNameArray(category.icon));
			const labelEl = DOM.append(cardHeader, $('span.welcome-classic-card-label'));
			labelEl.textContent = category.label;

			const descEl = DOM.append(card, $('p.welcome-classic-card-description'));
			descEl.textContent = category.description;

			const footer = DOM.append(card, $('.welcome-classic-card-footer'));
			const browseBtn = DOM.append(footer, $('button.welcome-classic-card-browse'));
			browseBtn.textContent = localize('browse', "Browse");
			const hasMarketplace = category.id === AICustomizationManagementSection.McpServers || category.id === AICustomizationManagementSection.Plugins;
			this.cardDisposables.add(DOM.addDisposableListener(browseBtn, 'click', e => {
				e.stopPropagation();
				if (hasMarketplace) {
					this.callbacks.selectSectionWithMarketplace(category.id);
				} else {
					this.callbacks.selectSection(category.id);
				}
			}));

			if (category.promptType) {
				const generateBtn = DOM.append(footer, $('button.welcome-classic-card-generate'));
				DOM.append(generateBtn, $('span.codicon.codicon-sparkle'));
				const label = DOM.append(generateBtn, $('span'));
				label.textContent = localize('generateWithAI', "Generate with AI");
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
		this.gettingStartedButton?.focus();
	}
}
