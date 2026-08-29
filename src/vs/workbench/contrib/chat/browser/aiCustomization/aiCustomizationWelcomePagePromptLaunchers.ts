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
import { agentIcon, instructionsIcon, pluginIcon, skillIcon, hookIcon, toolsIcon } from './aiCustomizationIcons.js';
import { IAICustomizationWorkspaceService, IWelcomePageFeatures } from '../../common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import type { IAICustomizationWelcomePageImplementation, ICustomizationMigrationCategorySummary, IWelcomePageCallbacks } from './aiCustomizationWelcomePage.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID, CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID } from '../actions/configureVoiceInstructionsAction.js';

const $ = DOM.$;

interface IPromptLaunchersCategoryDescription {
	readonly id: AICustomizationManagementSection;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly description: string;
	readonly promptType?: PromptsType;
}

interface IStandaloneCustomizationDescription {
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly description: string;
	readonly commandId: string;
}

export class PromptLaunchersAICustomizationWelcomePage extends Disposable implements IAICustomizationWelcomePageImplementation {

	private readonly cardDisposables = this._register(new DisposableStore());

	readonly container: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private cardsContainer: HTMLElement | undefined;
	private firstCard: HTMLElement | undefined;
	private heading: HTMLElement | undefined;
	private inputElement: HTMLInputElement | undefined;
	private visibleSectionIds = new Set<AICustomizationManagementSection>();

	private sentLabel: HTMLElement | undefined;
	private submitBtn: HTMLElement | undefined;
	private inputRow: HTMLElement | undefined;
	private migrationCategories: readonly ICustomizationMigrationCategorySummary[] = [];

	private readonly categoryDescriptions: IPromptLaunchersCategoryDescription[] = [
		{
			id: AICustomizationManagementSection.Agents,
			label: localize('agents', "Agents"),
			icon: agentIcon,
			description: localize('agentsDesc', "Create specialized agents for focused development tasks. Control their instructions, tools, and behavior."),
			promptType: PromptsType.agent,
		},
		{
			id: AICustomizationManagementSection.Skills,
			label: localize('skills', "Skills"),
			icon: skillIcon,
			description: localize('skillsDesc', "Add reusable knowledge and workflows for specialized tasks. Agents load relevant skills when needed."),
			promptType: PromptsType.skill,
		},
		{
			id: AICustomizationManagementSection.Instructions,
			label: localize('instructions', "Instructions"),
			icon: instructionsIcon,
			description: localize('instructionsDesc', "Define guidance that shapes how agents work. Apply it across a workspace or keep it in your user profile."),
			promptType: PromptsType.instructions,
		},
		{
			id: AICustomizationManagementSection.Hooks,
			label: localize('hooks', "Hooks"),
			icon: hookIcon,
			description: localize('hooksDesc', "Run automated commands at key points in the agent lifecycle. Use hooks to validate, format, or coordinate work."),
			promptType: PromptsType.hook,
		},
		{
			id: AICustomizationManagementSection.McpServers,
			label: localize('mcpServers', "MCP Servers"),
			icon: Codicon.server,
			description: localize('mcpServersDesc', "Connect agents to external tools and data through MCP servers. Manage the servers available to your agent."),
		},
		{
			id: AICustomizationManagementSection.Plugins,
			label: localize('plugins', "Plugins"),
			icon: pluginIcon,
			description: localize('pluginsDesc', "Install reusable packages that extend the agent. Plugins can add tools, skills, agents, hooks, and MCP servers."),
		},
		{
			id: AICustomizationManagementSection.Tools,
			label: localize('tools', "Tools"),
			icon: toolsIcon,
			description: localize('toolsDesc', "Review the tools available to the active agent. Enable or disable configurable tool groups."),
		},
	];

	private readonly standaloneCustomizations: IStandaloneCustomizationDescription[] = [
		{
			label: localize('voiceModeInstructions', "Voice Mode Instructions"),
			icon: Codicon.voiceMode,
			description: localize('voiceModeInstructionsDesc', "Customize Voice Mode behavior and terminology with voice.md."),
			commandId: CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID,
		},
		{
			label: localize('dictationInstructions', "Dictation Instructions"),
			icon: Codicon.mic,
			description: localize('dictationInstructionsDesc', "Customize Dictation terminology and transcript formatting with dictation.md."),
			commandId: CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID,
		},
	];

	constructor(
		parent: HTMLElement,
		private readonly welcomePageFeatures: IWelcomePageFeatures | undefined,
		private readonly callbacks: IWelcomePageCallbacks,
		private readonly commandService: ICommandService,
		private readonly workspaceService: IAICustomizationWorkspaceService,
		private readonly hoverService: IHoverService,
		private harnessLabel: string,
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
		const resizeObserver = this._register(new DOM.DisposableResizeObserver('AICustomizationWelcomePagePromptLaunchers.scrollable', () => this.scrollable.scanDomNode()));
		this._register(resizeObserver.observe(scrollableNode));

		const welcomeInner = DOM.append(this.container, $('.welcome-prompts-inner'));

		this.heading = DOM.append(welcomeInner, $('h2.welcome-prompts-heading'));
		this.updateHeading();

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
				this.sentLabel.setAttribute('role', 'status');
				this.sentLabel.setAttribute('aria-live', 'polite');
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
		this.visibleSectionIds = new Set(visibleSectionIds);

		this.cardDisposables.clear();
		DOM.clearNode(this.cardsContainer);
		this.firstCard = undefined;

		if (this.migrationCategories.length > 0) {
			const migrationGrid = this.renderOverviewSection(
				localize('overviewNeedsAttention', "Needs Attention"),
				localize('overviewNeedsAttentionDescription', "Review customizations that need an update for the active agent."),
				'welcome-prompts-attention-section',
			);
			for (const category of this.migrationCategories) {
				this.renderCustomizationMigrationCard(migrationGrid, category);
			}
		}

		const exploreGrid = this.renderOverviewSection(
			localize('overviewExploreCustomizations', "Explore Customizations"),
			localize('overviewExploreCustomizationsDescription', "Manage what the active agent knows and can do."),
			'welcome-prompts-explore-section',
		);
		for (const section of this.workspaceService.managementSections) {
			const category = this.categoryDescriptions.find(candidate => candidate.id === section);
			if (!category || !visibleSectionIds.has(category.id)) {
				continue;
			}

			const card = DOM.append(exploreGrid, $('button.welcome-prompts-card.welcome-prompts-navigation-card')) as HTMLButtonElement;
			card.type = 'button';
			card.setAttribute('aria-label', localize('openCustomizationCategory', "Open {0}", category.label));
			if (!this.firstCard) {
				this.firstCard = card;
			}

			const cardHeader = DOM.append(card, $('.welcome-prompts-card-header'));
			const iconEl = DOM.append(cardHeader, $('.welcome-prompts-card-icon'));
			iconEl.classList.add(...ThemeIcon.asClassNameArray(category.icon));
			const labelEl = DOM.append(cardHeader, $('span.welcome-prompts-card-label'));
			labelEl.textContent = category.label;

			const descEl = DOM.append(card, $('p.welcome-prompts-card-description'));
			descEl.textContent = category.description;

			this.cardDisposables.add(DOM.addDisposableListener(card, 'click', () => {
				this.callbacks.selectSection(category.id);
			}));
		}

		if (!this.workspaceService.isSessionsWindow) {
			const otherGrid = this.renderOverviewSection(
				localize('overviewOtherCustomizations', "Other Customizations"),
				localize('overviewOtherCustomizationsDescription', "Configure specialized voice and dictation behavior."),
				'welcome-prompts-other-section',
			);
			for (const customization of this.standaloneCustomizations) {
				this.renderStandaloneCustomization(otherGrid, customization);
			}
		}

		// Content changed — recompute scroll dimensions.
		this.scrollable.scanDomNode();
	}

	private renderOverviewSection(title: string, description: string, className: string): HTMLElement {
		const section = DOM.append(this.cardsContainer!, $('.welcome-prompts-overview-section'));
		section.classList.add(className);
		const heading = DOM.append(section, $('h3.welcome-prompts-overview-section-title'));
		heading.textContent = title;
		const descriptionElement = DOM.append(section, $('p.welcome-prompts-overview-section-description'));
		descriptionElement.textContent = description;
		return DOM.append(section, $('.welcome-prompts-overview-grid'));
	}

	private renderStandaloneCustomization(parent: HTMLElement, customization: IStandaloneCustomizationDescription): void {
		const card = DOM.append(parent, $('button.welcome-prompts-card.welcome-prompts-navigation-card')) as HTMLButtonElement;
		card.type = 'button';
		card.setAttribute('aria-label', localize('configureCategoryAriaLabel', "Configure {0}", customization.label));
		if (!this.firstCard) {
			this.firstCard = card;
		}

		const cardHeader = DOM.append(card, $('.welcome-prompts-card-header'));
		const iconEl = DOM.append(cardHeader, $('.welcome-prompts-card-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(customization.icon));
		const labelEl = DOM.append(cardHeader, $('span.welcome-prompts-card-label'));
		labelEl.textContent = customization.label;

		const descEl = DOM.append(card, $('p.welcome-prompts-card-description'));
		descEl.textContent = customization.description;

		const configure = () => {
			void this.commandService.executeCommand(customization.commandId);
		};
		this.cardDisposables.add(DOM.addDisposableListener(card, 'click', configure));
	}

	setMigrationCategories(categories: readonly ICustomizationMigrationCategorySummary[]): void {
		const didChange = categories.length !== this.migrationCategories.length
			|| categories.some((category, index) => {
				const previous = this.migrationCategories[index];
				return previous.id !== category.id
					|| previous.count !== category.count
					|| previous.description !== category.description;
			});
		this.migrationCategories = categories;
		if (didChange) {
			this.rebuildCards(this.visibleSectionIds);
		}
	}

	setHarnessLabel(label: string): void {
		if (this.harnessLabel === label) {
			return;
		}
		this.harnessLabel = label;
		this.updateHeading();
	}

	private updateHeading(): void {
		if (this.heading) {
			this.heading.textContent = localize('welcomeHeading', "Agent Customizations");
		}
	}

	private renderCustomizationMigrationCard(parent: HTMLElement, category: ICustomizationMigrationCategorySummary): void {
		const migrationCard = DOM.append(parent, $('button.welcome-prompts-card.welcome-prompts-migration-card')) as HTMLButtonElement;
		migrationCard.type = 'button';
		migrationCard.setAttribute('aria-label', category.actionAriaLabel);

		const cardHeader = DOM.append(migrationCard, $('.welcome-prompts-card-header'));
		const iconEl = DOM.append(cardHeader, $('.welcome-prompts-card-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.sync));
		const labelEl = DOM.append(cardHeader, $('span.welcome-prompts-card-label'));
		labelEl.textContent = category.label;

		const descEl = DOM.append(migrationCard, $('p.welcome-prompts-card-description'));
		descEl.textContent = category.description;

		if (!this.firstCard) {
			this.firstCard = migrationCard;
		}
		const actionLabel = DOM.append(migrationCard, $('span.welcome-prompts-card-action-label'));
		actionLabel.textContent = category.actionLabel;
		this.cardDisposables.add(DOM.addDisposableListener(migrationCard, 'click', () => this.callbacks.migrateCustomizations(category.id)));
	}

	focus(): void {
		// Prefer the prompt input so screen reader / keyboard users land on a meaningful
		// control. If the input isn't rendered (e.g. when the getting-started banner is
		// disabled), fall back to the first focusable card so focus stays inside the
		// welcome page rather than escaping to the surrounding workbench editor.
		if (this.inputElement) {
			this.inputElement.focus();
			return;
		}
		this.firstCard?.focus();
	}
}
