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
import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementEditorInput } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { agentIcon, instructionsIcon, mcpServerIcon, pluginIcon, promptIcon, skillIcon } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { IAgentPluginService } from '../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
const $ = DOM.$;
export const AI_CUSTOMIZATION_OVERVIEW_VIEW_ID = 'workbench.view.aiCustomizationOverview';
/**
 * A compact overview view that shows a snapshot of AI customizations
 * and provides deep-links to the management editor sections.
 */
let AICustomizationOverviewView = class AICustomizationOverviewView extends ViewPane {
    constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, editorService, promptsService, workspaceContextService, workspaceService, mcpService, agentPluginService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.editorService = editorService;
        this.promptsService = promptsService;
        this.workspaceContextService = workspaceContextService;
        this.workspaceService = workspaceService;
        this.mcpService = mcpService;
        this.agentPluginService = agentPluginService;
        this.sections = [];
        this.countElements = new Map();
        // Initialize sections
        this.sections.push({ id: AICustomizationManagementSection.Agents, label: localize('agents', "Agents"), icon: agentIcon, count: 0 }, { id: AICustomizationManagementSection.Skills, label: localize('skills', "Skills"), icon: skillIcon, count: 0 }, { id: AICustomizationManagementSection.Instructions, label: localize('instructions', "Instructions"), icon: instructionsIcon, count: 0 }, { id: AICustomizationManagementSection.Prompts, label: localize('prompts', "Prompts"), icon: promptIcon, count: 0 }, { id: AICustomizationManagementSection.McpServers, label: localize('mcpServers', "MCP Servers"), icon: mcpServerIcon, count: 0 }, { id: AICustomizationManagementSection.Plugins, label: localize('plugins', "Plugins"), icon: pluginIcon, count: 0 });
        // Listen to changes
        this._register(this.promptsService.onDidChangeCustomAgents(() => this.loadCounts()));
        this._register(this.promptsService.onDidChangeSlashCommands(() => this.loadCounts()));
        // Listen to workspace folder changes to update counts
        this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.loadCounts()));
        this._register(autorun(reader => {
            this.workspaceService.activeProjectRoot.read(reader);
            this.loadCounts();
        }));
    }
    renderBody(container) {
        super.renderBody(container);
        this.bodyElement = container;
        this.container = DOM.append(container, $('.ai-customization-overview'));
        this.sectionsContainer = DOM.append(this.container, $('.overview-sections'));
        this.renderSections();
        void this.loadCounts();
        // Force initial layout
        this.layoutBody(this.bodyElement.offsetHeight, this.bodyElement.offsetWidth);
    }
    renderSections() {
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
            this._register(DOM.addDisposableListener(sectionElement, 'keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.openSection(section.id);
                }
            }));
            // Hover tooltip
            this._register(this.hoverService.setupDelayedHoverAtMouse(sectionElement, () => ({
                content: localize('openSection', "Open {0} in Chat Customizations editor", section.label),
                appearance: { compact: true, skipFadeInAnimation: true }
            })));
        }
    }
    async loadCounts() {
        const sectionPromptTypes = [
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
            }
            else {
                const allItems = await this.promptsService.listPromptFiles(type, CancellationToken.None);
                count = allItems.length;
            }
            const sectionData = this.sections.find(s => s.id === section);
            if (sectionData) {
                sectionData.count = count;
            }
        }));
        // Update MCP server count reactively
        const mcpSection = this.sections.find(s => s.id === AICustomizationManagementSection.McpServers);
        if (mcpSection) {
            this._register(autorun(reader => {
                const servers = this.mcpService.servers.read(reader);
                mcpSection.count = servers.length;
                this.updateCountElements();
            }));
        }
        // Update plugin count reactively
        const pluginSection = this.sections.find(s => s.id === AICustomizationManagementSection.Plugins);
        if (pluginSection) {
            this._register(autorun(reader => {
                const plugins = this.agentPluginService.plugins.read(reader);
                pluginSection.count = plugins.length;
                this.updateCountElements();
            }));
        }
        this.updateCountElements();
    }
    updateCountElements() {
        for (const section of this.sections) {
            const countElement = this.countElements.get(section.id);
            if (countElement) {
                countElement.textContent = `${section.count}`;
            }
        }
    }
    async openSection(sectionId) {
        const input = AICustomizationManagementEditorInput.getOrCreate();
        const editor = await this.editorService.openEditor(input, { pinned: true });
        // Deep-link to the section
        if (editor instanceof AICustomizationManagementEditor) {
            editor.selectSectionById(sectionId);
        }
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this.container.style.height = `${height}px`;
    }
};
AICustomizationOverviewView = __decorate([
    __param(1, IKeybindingService),
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IContextKeyService),
    __param(5, IViewDescriptorService),
    __param(6, IInstantiationService),
    __param(7, IOpenerService),
    __param(8, IThemeService),
    __param(9, IHoverService),
    __param(10, IEditorService),
    __param(11, IPromptsService),
    __param(12, IWorkspaceContextService),
    __param(13, IAICustomizationWorkspaceService),
    __param(14, IMcpService),
    __param(15, IAgentPluginService)
], AICustomizationOverviewView);
export { AICustomizationOverviewView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uT3ZlcnZpZXdWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9haUN1c3RvbWl6YXRpb25UcmVlVmlldy9icm93c2VyL2FpQ3VzdG9taXphdGlvbk92ZXJ2aWV3Vmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLHVDQUF1QyxDQUFDO0FBQy9DLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFvQixRQUFRLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFB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