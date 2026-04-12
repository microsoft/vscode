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
import './media/aiCustomizationTreeView.css';
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { createActionViewItem, getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IPromptsService, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { agentIcon, extensionIcon, instructionsIcon, mcpServerIcon, pluginIcon, promptIcon, skillIcon, userIcon, workspaceIcon, builtinIcon } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js';
import { AICustomizationItemMenuId } from './aiCustomizationTreeView.js';
import { AICustomizationManagementSection } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js';
import { BUILTIN_STORAGE } from '../../chat/common/builtinPromptsStorage.js';
import { AICustomizationManagementEditorInput } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js';
import { AICustomizationManagementEditor } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
//#region Context Keys
/**
 * Context key indicating whether the AI Customization view has no items.
 */
export const AICustomizationIsEmptyContextKey = new RawContextKey('aiCustomization.isEmpty', true);
/**
 * Context key for the current item's prompt type in context menus.
 */
export const AICustomizationItemTypeContextKey = new RawContextKey('aiCustomizationItemType', '');
/**
 * Context key indicating whether the current item is disabled.
 */
export const AICustomizationItemDisabledContextKey = new RawContextKey('aiCustomizationItemDisabled', false);
/**
 * Context key for the current item's storage type in context menus.
 */
export const AICustomizationItemStorageContextKey = new RawContextKey('aiCustomizationItemStorage', '');
//#endregion
//#region Tree Item Types
/**
 * Root element marker for the tree.
 */
const ROOT_ELEMENT = Symbol('root');
//#endregion
//#region Tree Infrastructure
class AICustomizationTreeDelegate {
    getHeight(_element) {
        return 22;
    }
    getTemplateId(element) {
        switch (element.type) {
            case 'category':
            case 'link':
                return 'category';
            case 'group':
                return 'group';
            case 'file':
                return 'file';
        }
    }
}
class AICustomizationCategoryRenderer {
    constructor() {
        this.templateId = 'category';
    }
    renderTemplate(container) {
        const element = dom.append(container, dom.$('.ai-customization-category'));
        const icon = dom.append(element, dom.$('.icon'));
        const label = dom.append(element, dom.$('.label'));
        return { container: element, icon, label };
    }
    renderElement(node, _index, templateData) {
        templateData.icon.className = 'icon';
        templateData.icon.classList.add(...ThemeIcon.asClassNameArray(node.element.icon));
        templateData.label.textContent = node.element.label;
    }
    disposeTemplate(_templateData) { }
}
class AICustomizationGroupRenderer {
    constructor() {
        this.templateId = 'group';
    }
    renderTemplate(container) {
        const element = dom.append(container, dom.$('.ai-customization-group-header'));
        const label = dom.append(element, dom.$('.label'));
        return { container: element, label };
    }
    renderElement(node, _index, templateData) {
        templateData.label.textContent = node.element.label;
    }
    disposeTemplate(_templateData) { }
}
class AICustomizationFileRenderer {
    constructor(menuService, contextKeyService, instantiationService) {
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.instantiationService = instantiationService;
        this.templateId = 'file';
    }
    renderTemplate(container) {
        const element = dom.append(container, dom.$('.ai-customization-tree-item'));
        const icon = dom.append(element, dom.$('.icon'));
        const name = dom.append(element, dom.$('.name'));
        const actionsContainer = dom.append(element, dom.$('.actions'));
        const templateDisposables = new DisposableStore();
        const actionBar = templateDisposables.add(new ActionBar(actionsContainer, {
            actionViewItemProvider: createActionViewItem.bind(undefined, this.instantiationService),
        }));
        return { container: element, icon, name, actionBar, elementDisposables: new DisposableStore(), templateDisposables };
    }
    renderElement(node, _index, templateData) {
        const item = node.element;
        templateData.elementDisposables.clear();
        // Set icon based on prompt type
        let icon;
        switch (item.promptType) {
            case PromptsType.agent:
                icon = agentIcon;
                break;
            case PromptsType.skill:
                icon = skillIcon;
                break;
            case PromptsType.instructions:
                icon = instructionsIcon;
                break;
            case PromptsType.prompt:
            default:
                icon = promptIcon;
                break;
        }
        templateData.icon.className = 'icon';
        templateData.icon.classList.add(...ThemeIcon.asClassNameArray(icon));
        templateData.name.textContent = item.name;
        // Apply disabled styling
        templateData.container.classList.toggle('disabled', item.disabled);
        // Set tooltip with name and description
        const tooltip = item.description ? `${item.name} - ${item.description}` : item.name;
        templateData.container.title = tooltip;
        // Build context for menu actions
        const context = {
            uri: item.uri.toString(),
            name: item.name,
            promptType: item.promptType,
            storage: item.storage,
        };
        // Create scoped context key service with item type for when-clause filtering
        const overlay = this.contextKeyService.createOverlay([
            [AICustomizationItemTypeContextKey.key, item.promptType],
            [AICustomizationItemDisabledContextKey.key, item.disabled],
            [AICustomizationItemStorageContextKey.key, item.storage],
        ]);
        // Create menu and extract inline actions
        const menu = templateData.elementDisposables.add(this.menuService.createMenu(AICustomizationItemMenuId, overlay));
        const updateActions = () => {
            const actions = menu.getActions({ arg: context, shouldForwardArgs: true });
            const { primary } = getContextMenuActions(actions, 'inline');
            templateData.actionBar.clear();
            templateData.actionBar.push(primary, { icon: true, label: false });
        };
        updateActions();
        templateData.elementDisposables.add(menu.onDidChange(updateActions));
        templateData.actionBar.context = context;
    }
    disposeElement(_node, _index, templateData) {
        templateData.elementDisposables.clear();
    }
    disposeTemplate(templateData) {
        templateData.templateDisposables.dispose();
        templateData.elementDisposables.dispose();
    }
}
/**
 * Data source for the AI Customization tree with efficient caching.
 * Caches data per-type to avoid redundant fetches when expanding groups.
 */
class UnifiedAICustomizationDataSource {
    constructor(promptsService, logService, onItemCountChanged) {
        this.promptsService = promptsService;
        this.logService = logService;
        this.onItemCountChanged = onItemCountChanged;
        this.cache = new Map();
        this.totalItemCount = 0;
    }
    /**
     * Clears the cache. Should be called when the view refreshes.
     */
    clearCache() {
        this.cache.clear();
        this.totalItemCount = 0;
    }
    hasChildren(element) {
        if (element === ROOT_ELEMENT) {
            return true;
        }
        if (element.type === 'link') {
            return false;
        }
        return element.type === 'category' || element.type === 'group';
    }
    async getChildren(element) {
        try {
            if (element === ROOT_ELEMENT) {
                return this.getTypeCategories();
            }
            if (element.type === 'category') {
                return this.getStorageGroups(element.promptType);
            }
            if (element.type === 'group') {
                return this.getFilesForStorageAndType(element.storage, element.promptType);
            }
            return [];
        }
        catch (error) {
            this.logService.error('[AICustomization] Error fetching tree children:', error);
            return [];
        }
    }
    getTypeCategories() {
        return [
            {
                type: 'category',
                id: 'category-agents',
                label: localize('customAgents', "Custom Agents"),
                promptType: PromptsType.agent,
                icon: agentIcon,
            },
            {
                type: 'category',
                id: 'category-skills',
                label: localize('skills', "Skills"),
                promptType: PromptsType.skill,
                icon: skillIcon,
            },
            {
                type: 'category',
                id: 'category-instructions',
                label: localize('instructions', "Instructions"),
                promptType: PromptsType.instructions,
                icon: instructionsIcon,
            },
            {
                type: 'category',
                id: 'category-prompts',
                label: localize('prompts', "Prompts"),
                promptType: PromptsType.prompt,
                icon: promptIcon,
            },
            {
                type: 'link',
                id: 'link-mcp-servers',
                label: localize('mcpServers', "MCP Servers"),
                icon: mcpServerIcon,
                section: AICustomizationManagementSection.McpServers,
            },
        ];
    }
    /**
     * Fetches and caches data for a prompt type, returning storage groups with items.
     */
    async getStorageGroups(promptType) {
        const groups = [];
        // Check cache first
        let cached = this.cache.get(promptType);
        if (!cached) {
            cached = {};
            this.cache.set(promptType, cached);
        }
        // For skills, use findAgentSkills which has the proper names from frontmatter
        if (promptType === PromptsType.skill) {
            if (!cached.skills) {
                const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
                cached.skills = skills || [];
                this.totalItemCount += cached.skills.length;
                this.onItemCountChanged(this.totalItemCount);
            }
            const workspaceSkills = cached.skills.filter(s => s.storage === PromptsStorage.local);
            const userSkills = cached.skills.filter(s => s.storage === PromptsStorage.user);
            const extensionSkills = cached.skills.filter(s => s.storage === PromptsStorage.extension);
            const builtinSkills = cached.skills.filter(s => s.storage === BUILTIN_STORAGE);
            if (workspaceSkills.length > 0) {
                groups.push(this.createGroupItem(promptType, PromptsStorage.local, workspaceSkills.length));
            }
            if (userSkills.length > 0) {
                groups.push(this.createGroupItem(promptType, PromptsStorage.user, userSkills.length));
            }
            if (extensionSkills.length > 0) {
                groups.push(this.createGroupItem(promptType, PromptsStorage.extension, extensionSkills.length));
            }
            if (builtinSkills.length > 0) {
                groups.push(this.createGroupItem(promptType, BUILTIN_STORAGE, builtinSkills.length));
            }
            return groups;
        }
        // For other types, fetch once and cache grouped by storage
        if (!cached.files) {
            const allItems = await this.promptsService.listPromptFiles(promptType, CancellationToken.None);
            const workspaceItems = allItems.filter(item => item.storage === PromptsStorage.local);
            const userItems = allItems.filter(item => item.storage === PromptsStorage.user);
            const extensionItems = allItems.filter(item => item.storage === PromptsStorage.extension);
            const builtinItems = allItems.filter(item => item.storage === BUILTIN_STORAGE);
            cached.files = new Map([
                [PromptsStorage.local, workspaceItems],
                [PromptsStorage.user, userItems],
                [PromptsStorage.extension, extensionItems],
                [BUILTIN_STORAGE, builtinItems],
            ]);
            const itemCount = allItems.length;
            this.totalItemCount += itemCount;
            this.onItemCountChanged(this.totalItemCount);
        }
        const workspaceItems = cached.files.get(PromptsStorage.local) || [];
        const userItems = cached.files.get(PromptsStorage.user) || [];
        const extensionItems = cached.files.get(PromptsStorage.extension) || [];
        const builtinItems = cached.files.get(BUILTIN_STORAGE) || [];
        if (workspaceItems.length > 0) {
            groups.push(this.createGroupItem(promptType, PromptsStorage.local, workspaceItems.length));
        }
        if (userItems.length > 0) {
            groups.push(this.createGroupItem(promptType, PromptsStorage.user, userItems.length));
        }
        if (extensionItems.length > 0) {
            groups.push(this.createGroupItem(promptType, PromptsStorage.extension, extensionItems.length));
        }
        if (builtinItems.length > 0) {
            groups.push(this.createGroupItem(promptType, BUILTIN_STORAGE, builtinItems.length));
        }
        return groups;
    }
    /**
     * Creates a group item with consistent structure.
     */
    createGroupItem(promptType, storage, count) {
        const storageLabels = {
            [PromptsStorage.local]: localize('workspaceWithCount', "Workspace ({0})", count),
            [PromptsStorage.user]: localize('userWithCount', "User ({0})", count),
            [PromptsStorage.extension]: localize('extensionsWithCount', "Extensions ({0})", count),
            [PromptsStorage.plugin]: localize('pluginsWithCount', "Plugins ({0})", count),
            [BUILTIN_STORAGE]: localize('builtinWithCount', "Built-in ({0})", count),
        };
        const storageIcons = {
            [PromptsStorage.local]: workspaceIcon,
            [PromptsStorage.user]: userIcon,
            [PromptsStorage.extension]: extensionIcon,
            [PromptsStorage.plugin]: pluginIcon,
            [BUILTIN_STORAGE]: builtinIcon,
        };
        const storageSuffixes = {
            [PromptsStorage.local]: 'workspace',
            [PromptsStorage.user]: 'user',
            [PromptsStorage.extension]: 'extensions',
            [PromptsStorage.plugin]: 'plugins',
            [BUILTIN_STORAGE]: 'builtin',
        };
        return {
            type: 'group',
            id: `group-${promptType}-${storageSuffixes[storage]}`,
            label: storageLabels[storage],
            storage,
            promptType,
            icon: storageIcons[storage],
        };
    }
    /**
     * Returns files for a specific storage/type combination from cache.
     * getStorageGroups must be called first to populate the cache.
     */
    async getFilesForStorageAndType(storage, promptType) {
        const cached = this.cache.get(promptType);
        const disabledUris = this.promptsService.getDisabledPromptFiles(promptType);
        // For skills, use the cached skills data and merge in disabled skills
        if (promptType === PromptsType.skill) {
            const skills = cached?.skills || [];
            const filtered = skills.filter(skill => skill.storage === storage);
            const seenUris = new Set();
            const result = filtered
                .map(skill => {
                seenUris.add(skill.uri.toString());
                // Use skill name from frontmatter, or fallback to parent folder name
                const skillName = skill.name || basename(dirname(skill.uri)) || basename(skill.uri);
                return {
                    type: 'file',
                    id: skill.uri.toString(),
                    uri: skill.uri,
                    name: skillName,
                    description: skill.description,
                    storage: skill.storage,
                    promptType,
                    disabled: disabledUris.has(skill.uri),
                };
            });
            // Include disabled skills not already in the enabled list
            if (disabledUris.size > 0) {
                const allSkillFiles = await this.promptsService.listPromptFiles(PromptsType.skill, CancellationToken.None);
                for (const file of allSkillFiles) {
                    if (file.storage === storage && !seenUris.has(file.uri.toString()) && disabledUris.has(file.uri)) {
                        result.push({
                            type: 'file',
                            id: file.uri.toString(),
                            uri: file.uri,
                            name: file.name || basename(dirname(file.uri)) || basename(file.uri),
                            description: file.description,
                            storage: file.storage,
                            promptType,
                            disabled: true,
                        });
                    }
                }
            }
            return result;
        }
        // Use cached files data (already fetched in getStorageGroups)
        const items = [...(cached?.files?.get(storage) || [])];
        return items.map(item => ({
            type: 'file',
            id: item.uri.toString(),
            uri: item.uri,
            name: item.name || basename(item.uri),
            description: item.description,
            storage: item.storage,
            promptType,
            disabled: disabledUris.has(item.uri),
        }));
    }
}
//#endregion
//#region Unified View Pane
/**
 * Unified view pane for all AI Customization items (agents, skills, instructions, prompts).
 */
let AICustomizationViewPane = class AICustomizationViewPane extends ViewPane {
    static { this.ID = 'aiCustomization.view'; }
    constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, promptsService, editorService, menuService, logService, workspaceContextService, workspaceService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.promptsService = promptsService;
        this.editorService = editorService;
        this.menuService = menuService;
        this.logService = logService;
        this.workspaceContextService = workspaceContextService;
        this.workspaceService = workspaceService;
        this.treeDisposables = this._register(new DisposableStore());
        // Initialize context keys
        this.isEmptyContextKey = AICustomizationIsEmptyContextKey.bindTo(contextKeyService);
        this.itemTypeContextKey = AICustomizationItemTypeContextKey.bindTo(contextKeyService);
        this.itemDisabledContextKey = AICustomizationItemDisabledContextKey.bindTo(contextKeyService);
        this.itemStorageContextKey = AICustomizationItemStorageContextKey.bindTo(contextKeyService);
        // Subscribe to prompt service events to refresh tree
        this._register(this.promptsService.onDidChangeCustomAgents(() => this.refresh()));
        this._register(this.promptsService.onDidChangeSlashCommands(() => this.refresh()));
        // Listen to workspace folder changes to refresh tree
        this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.refresh()));
        this._register(autorun(reader => {
            this.workspaceService.activeProjectRoot.read(reader);
            this.refresh();
        }));
    }
    renderBody(container) {
        super.renderBody(container);
        container.classList.add('ai-customization-view');
        this.treeContainer = dom.append(container, dom.$('.tree-container'));
        this.createTree();
    }
    createTree() {
        if (!this.treeContainer) {
            return;
        }
        // Create data source with callback for tracking item count
        this.dataSource = new UnifiedAICustomizationDataSource(this.promptsService, this.logService, (count) => this.isEmptyContextKey.set(count === 0));
        this.tree = this.treeDisposables.add(this.instantiationService.createInstance((WorkbenchAsyncDataTree), 'AICustomization', this.treeContainer, new AICustomizationTreeDelegate(), [
            new AICustomizationCategoryRenderer(),
            new AICustomizationGroupRenderer(),
            new AICustomizationFileRenderer(this.menuService, this.contextKeyService, this.instantiationService),
        ], this.dataSource, {
            identityProvider: {
                getId: (element) => element.id,
            },
            accessibilityProvider: {
                getAriaLabel: (element) => {
                    if (element.type === 'category' || element.type === 'link') {
                        return element.label;
                    }
                    if (element.type === 'group') {
                        return element.label;
                    }
                    // For files, include description and disabled state
                    const nameAndDesc = element.description
                        ? localize('fileAriaLabel', "{0}, {1}", element.name, element.description)
                        : element.name;
                    return element.disabled
                        ? localize('fileAriaLabelDisabled', "{0}, disabled", nameAndDesc)
                        : nameAndDesc;
                },
                getWidgetAriaLabel: () => localize('aiCustomizationTree', "Chat Customization Items"),
            },
            keyboardNavigationLabelProvider: {
                getKeyboardNavigationLabel: (element) => {
                    if (element.type === 'file') {
                        return element.name;
                    }
                    return element.label;
                },
            },
        }));
        // Handle double-click to open file or navigate to section
        this.treeDisposables.add(this.tree.onDidOpen(async (e) => {
            if (e.element && e.element.type === 'file') {
                this.editorService.openEditor({
                    resource: e.element.uri,
                });
            }
            else if (e.element && e.element.type === 'link') {
                const input = AICustomizationManagementEditorInput.getOrCreate();
                const editor = await this.editorService.openEditor(input, { pinned: true });
                if (editor instanceof AICustomizationManagementEditor) {
                    editor.selectSectionById(e.element.section);
                }
            }
        }));
        // Handle context menu
        this.treeDisposables.add(this.tree.onContextMenu(e => this.onContextMenu(e)));
        // Initial load and auto-expand category nodes
        void this.tree.setInput(ROOT_ELEMENT).then(() => this.autoExpandCategories());
    }
    async autoExpandCategories() {
        if (!this.tree) {
            return;
        }
        // Auto-expand all category nodes to show storage groups
        const rootNode = this.tree.getNode(ROOT_ELEMENT);
        for (const child of rootNode.children) {
            if (child.element !== ROOT_ELEMENT) {
                await this.tree.expand(child.element);
            }
        }
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this.tree?.layout(height, width);
    }
    refresh() {
        // Clear the cache before refreshing
        this.dataSource?.clearCache();
        this.isEmptyContextKey.set(true); // Reset until we know the count
        void this.tree?.setInput(ROOT_ELEMENT).then(() => this.autoExpandCategories());
    }
    collapseAll() {
        this.tree?.collapseAll();
    }
    expandAll() {
        this.tree?.expandAll();
    }
    onContextMenu(e) {
        // Only show context menu for file items
        if (!e.element || e.element.type !== 'file') {
            return;
        }
        const element = e.element;
        // Set context keys for the item so menu items can use `when` clauses
        this.itemTypeContextKey.set(element.promptType);
        this.itemDisabledContextKey.set(element.disabled);
        this.itemStorageContextKey.set(element.storage);
        // Get menu actions from the menu service
        const context = {
            uri: element.uri.toString(),
            name: element.name,
            promptType: element.promptType,
            disabled: element.disabled,
        };
        const menu = this.menuService.getMenuActions(AICustomizationItemMenuId, this.contextKeyService, { arg: context, shouldForwardArgs: true });
        const { secondary } = getContextMenuActions(menu, 'inline');
        // Show the context menu
        if (secondary.length > 0) {
            this.contextMenuService.showContextMenu({
                getAnchor: () => e.anchor,
                getActions: () => secondary,
                getActionsContext: () => context,
                onHide: () => {
                    // Clear the context keys when menu closes
                    this.itemTypeContextKey.reset();
                    this.itemDisabledContextKey.reset();
                    this.itemStorageContextKey.reset();
                },
            });
        }
    }
};
AICustomizationViewPane = __decorate([
    __param(1, IKeybindingService),
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IContextKeyService),
    __param(5, IViewDescriptorService),
    __param(6, IInstantiationService),
    __param(7, IOpenerService),
    __param(8, IThemeService),
    __param(9, IHoverService),
    __param(10, IPromptsService),
    __param(11, IEditorService),
    __param(12, IMenuService),
    __param(13, ILogService),
    __param(14, IWorkspaceContextService),
    __param(15, IAICustomizationWorkspaceService)
], AICustomizationViewPane);
export { AICustomizationViewPane };
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uVHJlZVZpZXdWaWV3cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvYWlDdXN0b21pemF0aW9uVHJlZVZpZXcvYnJvd3Nlci9haUN1c3RvbWl6YXRpb25UcmVlVmlld1ZpZXdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8scUNBQXFDLENBQUM7QUFDN0MsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDL0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLG9CQUFvQixFQUFFLHFCQUFxQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDOUgsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzlFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0SCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM5RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1B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