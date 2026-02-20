/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { AICustomizationManagementSection } from './aiCustomizationManagement.js';
import { AICustomizationManagementEditorInput } from './aiCustomizationManagementEditorInput.js';
import { AICustomizationManagementEditor } from './aiCustomizationManagementEditor.js';
import { agentIcon, instructionsIcon, promptIcon, skillIcon } from '../../aiCustomizationTreeView/browser/aiCustomizationTreeViewIcons.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';

const $ = DOM.$;

export const AI_CUSTOMIZATION_OVERVIEW_VIEW_ID = 'workbench.view.aiCustomizationOverview';

interface ISectionSummary {
	readonly id: AICustomizationManagementSection;
	readonly label: string;
	readonly icon: ThemeIcon;
	count: number;
}

/**
 * A compact overview view that shows a snapshot of AI customizations
 * and provides deep-links to the management editor sections.
 */
export class AICustomizationOverviewView extends ViewPane {

	private bodyElement!: HTMLElement;
	private container!: HTMLElement;
	private sectionsContainer!: HTMLElement;
	private readonly sections: ISectionSummary[] = [];
	private readonly countElements = new Map<AICustomizationManagementSection, HTMLElement>();

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ISessionsManagementService private readonly activeSessionService: ISessionsManagementService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Initialize sections
		this.sections.push(
			{ id: AICustomizationManagementSection.Agents, label: localize('agents', "Agents"), icon: agentIcon, count: 0 },
			{ id: AICustomizationManagementSection.Skills, label: localize('skills', "Skills"), icon: skillIcon, count: 0 },
			{ id: AICustomizationManagementSection.Instructions, label: localize('instructions', "Instructions"), icon: instructionsIcon, count: 0 },
			{ id: AICustomizationManagementSection.Prompts, label: localize('prompts', "Prompts"), icon: promptIcon, count: 0 },
		);

		// Listen to changes
		this._register(this.promptsService.onDidChangeCustomAgents(() => this.loadCounts()));
		this._register(this.promptsService.onDidChangeSlashCommands(() => this.loadCounts()));

		// Listen to workspace folder changes to update counts
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.loadCounts()));
		this._register(autorun(reader => {
			this.activeSessionService.activeSession.read(reader);
			this.loadCounts();
		}));

	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.bodyElement = container;
		this.container = DOM.append(container, $('.ai-customization-overview'));
		this.sectionsContainer = DOM.append(this.container, $('.overview-sections'));

		this.renderSections();
		void this.loadCounts();

		// Force initial layout
		this.layoutBody(this.bodyElement.offsetHeight, this.bodyElement.offsetWidth);
	}

	private renderSections(): void {
		DOM.clearNode(this.sectionsContainer);
		this.countElements.clear();

		for (const section of this.sections) {
			const sectionElement = DOM.append(this.sectionsContainer, $('.overview-section'));
			sectionElement.tabIndex = 0;
			sectionElement.setAttribute('role', 'button');
			sectionElement.setAttribute('aria-label', `${section.label}: ${section.count} items`);

			const iconElement = DOM.append(sectionElement, $('.section-icon'));
			iconElement.classList.add(...ThemeIcon.asClassNameArray(section.icon));

			const textContainer = DOM.append(sectionElement, $('.section-text'));
			const labelElement = DOM.append(textContainer, $('.section-label'));
			labelElement.textContent = section.label;

			const countElement = DOM.append(sectionElement, $('.section-count'));
			countElement.textContent = `${section.count}`;
			this.countElements.set(section.id, countElement);

			// Click handler to open management editor at section
			this._register(DOM.addDisposableListener(sectionElement, 'click', () => {
				this.openSection(section.id);
			}));

			// Keyboard support
			this._register(DOM.addDisposableListener(sectionElement, 'keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.openSection(section.id);
				}
			}));

			// Hover tooltip
			this._register(this.hoverService.setupDelayedHoverAtMouse(sectionElement, () => ({
				content: localize('openSection', "Open {0} in AI Customizations editor", section.label),
				appearance: { compact: true, skipFadeInAnimation: true }
			})));
		}
	}

	private async loadCounts(): Promise<void> {
		const sectionPromptTypes: Array<{ section: AICustomizationManagementSection; type: PromptsType }> = [
			{ section: AICustomizationManagementSection.Agents, type: PromptsType.agent },
			{ section: AICustomizationManagementSection.Skills, type: PromptsType.skill },
			{ section: AICustomizationManagementSection.Instructions, type: PromptsType.instructions },
			{ section: AICustomizationManagementSection.Prompts, type: PromptsType.prompt },
		];

		await Promise.all(sectionPromptTypes.map(async ({ section, type }) => {
			let count = 0;
			if (type === PromptsType.skill) {
				const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
				if (skills) {
					count = skills.length;
				}
			} else {
				const allItems = await this.promptsService.listPromptFiles(type, CancellationToken.None);
				count = allItems.length;
			}

			const sectionData = this.sections.find(s => s.id === section);
			if (sectionData) {
				sectionData.count = count;
			}
		}));

		this.updateCountElements();
	}

	private updateCountElements(): void {
		for (const section of this.sections) {
			const countElement = this.countElements.get(section.id);
			if (countElement) {
				countElement.textContent = `${section.count}`;
			}
		}
	}

	private async openSection(sectionId: AICustomizationManagementSection): Promise<void> {
		const input = AICustomizationManagementEditorInput.getOrCreate();
		const editor = await this.editorGroupsService.activeGroup.openEditor(input, { pinned: true });

		// Deep-link to the section
		if (editor instanceof AICustomizationManagementEditor) {
			editor.selectSectionById(sectionId);
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.container.style.height = `${height}px`;
	}
}
