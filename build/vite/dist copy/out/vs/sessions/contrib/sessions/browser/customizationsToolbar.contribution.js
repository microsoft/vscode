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
import '../../../browser/media/sidebarActionButton.css';
import './media/customizationsToolbar.css';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementEditorInput } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IMcpService } from '../../../../workbench/contrib/mcp/common/mcpTypes.js';
import { Menus } from '../../../browser/menus.js';
import { agentIcon, instructionsIcon, mcpServerIcon, pluginIcon, promptIcon, skillIcon, hookIcon } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { $, append } from '../../../../base/browser/dom.js';
import { autorun } from '../../../../base/common/observable.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ISessionsManagementService } from './sessionsManagementService.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { getSourceCounts, getSourceCountsTotal } from './customizationCounts.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IAgentPluginService } from '../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
export const CUSTOMIZATION_ITEMS = [
    {
        id: 'sessions.customization.agents',
        label: localize('agents', "Agents"),
        icon: agentIcon,
        section: AICustomizationManagementSection.Agents,
        promptType: PromptsType.agent,
    },
    {
        id: 'sessions.customization.skills',
        label: localize('skills', "Skills"),
        icon: skillIcon,
        section: AICustomizationManagementSection.Skills,
        promptType: PromptsType.skill,
    },
    {
        id: 'sessions.customization.instructions',
        label: localize('instructions', "Instructions"),
        icon: instructionsIcon,
        section: AICustomizationManagementSection.Instructions,
        promptType: PromptsType.instructions,
    },
    {
        id: 'sessions.customization.prompts',
        label: localize('prompts', "Prompts"),
        icon: promptIcon,
        section: AICustomizationManagementSection.Prompts,
        promptType: PromptsType.prompt,
    },
    {
        id: 'sessions.customization.hooks',
        label: localize('hooks', "Hooks"),
        icon: hookIcon,
        section: AICustomizationManagementSection.Hooks,
        promptType: PromptsType.hook,
    },
    {
        id: 'sessions.customization.mcpServers',
        label: localize('mcpServers', "MCP Servers"),
        icon: mcpServerIcon,
        section: AICustomizationManagementSection.McpServers,
        isMcp: true,
    },
    {
        id: 'sessions.customization.plugins',
        label: localize('plugins', "Plugins"),
        icon: pluginIcon,
        section: AICustomizationManagementSection.Plugins,
        isPlugins: true,
    },
];
/**
 * Custom ActionViewItem for each customization link in the toolbar.
 * Renders icon + label + source count badges, matching the sidebar footer style.
 */
let CustomizationLinkViewItem = class CustomizationLinkViewItem extends ActionViewItem {
    constructor(action, options, _config, _promptsService, _languageModelsService, _mcpService, _workspaceContextService, _activeSessionService, _workspaceService, _fileService, _agentPluginService) {
        super(undefined, action, { ...options, icon: false, label: false });
        this._config = _config;
        this._promptsService = _promptsService;
        this._languageModelsService = _languageModelsService;
        this._mcpService = _mcpService;
        this._workspaceContextService = _workspaceContextService;
        this._activeSessionService = _activeSessionService;
        this._workspaceService = _workspaceService;
        this._fileService = _fileService;
        this._agentPluginService = _agentPluginService;
        this._updateCountsRequestId = 0;
        this._viewItemDisposables = this._register(new DisposableStore());
    }
    getTooltip() {
        return undefined;
    }
    render(container) {
        super.render(container);
        container.classList.add('customization-link-widget', 'sidebar-action');
        // Button (left) - uses supportIcons to render codicon in label
        const buttonContainer = append(container, $('.customization-link-button-container'));
        this._button = this._viewItemDisposables.add(new Button(buttonContainer, {
            ...defaultButtonStyles,
            secondary: true,
            title: false,
            supportIcons: true,
            buttonSecondaryBackground: 'transparent',
            buttonSecondaryHoverBackground: undefined,
            buttonSecondaryForeground: undefined,
            buttonSecondaryBorder: undefined,
        }));
        this._button.element.classList.add('customization-link-button', 'sidebar-action-button');
        this._button.label = `$(${this._config.icon.id}) ${this._config.label}`;
        this._viewItemDisposables.add(this._button.onDidClick(() => {
            this._action.run();
        }));
        // Count container (inside button, floating right)
        this._countContainer = append(this._button.element, $('span.customization-link-counts'));
        // Subscribe to changes
        this._viewItemDisposables.add(this._promptsService.onDidChangeCustomAgents(() => this._updateCounts()));
        this._viewItemDisposables.add(this._promptsService.onDidChangeSlashCommands(() => this._updateCounts()));
        this._viewItemDisposables.add(this._languageModelsService.onDidChangeLanguageModels(() => this._updateCounts()));
        this._viewItemDisposables.add(autorun(reader => {
            this._mcpService.servers.read(reader);
            this._updateCounts();
        }));
        this._viewItemDisposables.add(autorun(reader => {
            this._agentPluginService.plugins.read(reader);
            this._updateCounts();
        }));
        this._viewItemDisposables.add(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._updateCounts()));
        this._viewItemDisposables.add(autorun(reader => {
            this._activeSessionService.activeSession.read(reader);
            this._updateCounts();
        }));
        // Initial count
        this._updateCounts();
    }
    async _updateCounts() {
        if (!this._countContainer) {
            return;
        }
        const requestId = ++this._updateCountsRequestId;
        if (this._config.promptType) {
            const type = this._config.promptType;
            const filter = this._workspaceService.getStorageSourceFilter(type);
            const counts = await getSourceCounts(this._promptsService, type, filter, this._workspaceContextService, this._workspaceService, this._fileService);
            if (requestId !== this._updateCountsRequestId) {
                return;
            }
            const total = getSourceCountsTotal(counts, filter);
            this._renderTotalCount(this._countContainer, total);
        }
        else if (this._config.isMcp) {
            const total = this._mcpService.servers.get().length;
            this._renderTotalCount(this._countContainer, total);
        }
        else if (this._config.isPlugins) {
            const total = this._agentPluginService.plugins.get().length;
            this._renderTotalCount(this._countContainer, total);
        }
    }
    _renderTotalCount(container, count) {
        container.textContent = '';
        container.classList.toggle('hidden', count === 0);
        if (count > 0) {
            const badge = append(container, $('span.source-count-badge'));
            const num = append(badge, $('span.source-count-num'));
            num.textContent = `${count}`;
        }
    }
};
CustomizationLinkViewItem = __decorate([
    __param(3, IPromptsService),
    __param(4, ILanguageModelsService),
    __param(5, IMcpService),
    __param(6, IWorkspaceContextService),
    __param(7, ISessionsManagementService),
    __param(8, IAICustomizationWorkspaceService),
    __param(9, IFileService),
    __param(10, IAgentPluginService)
], CustomizationLinkViewItem);
export { CustomizationLinkViewItem };
// --- Register actions and view items --- //
let CustomizationsToolbarContribution = class CustomizationsToolbarContribution extends Disposable {
    static { this.ID = 'workbench.contrib.sessionsCustomizationsToolbar'; }
    constructor(actionViewItemService, instantiationService) {
        super();
        for (const [index, config] of CUSTOMIZATION_ITEMS.entries()) {
            // Register the custom ActionViewItem for this action
            this._register(actionViewItemService.register(Menus.SidebarCustomizations, config.id, (action, options) => {
                return instantiationService.createInstance(CustomizationLinkViewItem, action, options, config);
            }, undefined));
            // Register the action with menu item
            this._register(registerAction2(class extends Action2 {
                constructor() {
                    super({
                        id: config.id,
                        title: localize2('customizationAction', '{0}', config.label),
                        menu: {
                            id: Menus.SidebarCustomizations,
                            group: 'navigation',
                            order: index + 1,
                        }
                    });
                }
                async run(accessor) {
                    const editorService = accessor.get(IEditorService);
                    const input = AICustomizationManagementEditorInput.getOrCreate();
                    const editor = await editorService.openEditor(input, { pinned: true });
                    if (editor instanceof AICustomizationManagementEditor) {
                        editor.selectSectionById(config.section);
                    }
                }
            }));
        }
    }
};
CustomizationsToolbarContribution = __decorate([
    __param(0, IActionViewItemService),
    __param(1, IInstantiationService)
], CustomizationsToolbarContribution);
export { CustomizationsToolbarContribution };
registerWorkbenchContribution2(CustomizationsToolbarContribution.ID, CustomizationsToolbarContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9taXphdGlvbnNUb29sYmFyLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci9jdXN0b21pemF0aW9uc1Rvb2xiYXIuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sZ0RBQWdELENBQUM7QUFDeEQsT0FBTyxtQ0FBbUMsQ0FBQztBQUMzQyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRW5GLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN2RyxPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDckgsT0FBTyxFQUEwQiw4QkFBOEIsRUFBa0IsTUFBTSwrQ0FBK0MsQ0FBQztBQUN2SSxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSwrRkFBK0YsQ0FBQztBQUNoSixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx5RkFBeUYsQ0FBQztBQUMzSSxPQUFPLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSxvR0FBb0csQ0FBQztBQUMxSixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDbkgsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzREFBc0QsQ0FB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