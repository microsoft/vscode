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
import * as DOM from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { autorun } from '../../../../../base/common/observable.js';
import { basename, dirname, isEqual, isEqualOrParent } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { agentIcon, instructionsIcon, promptIcon, skillIcon, hookIcon, userIcon, workspaceIcon, extensionIcon, pluginIcon, builtinIcon } from './aiCustomizationIcons.js';
import { AI_CUSTOMIZATION_ITEM_STORAGE_KEY, AI_CUSTOMIZATION_ITEM_TYPE_KEY, AI_CUSTOMIZATION_ITEM_URI_KEY, AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY, AICustomizationManagementItemMenuId, AICustomizationManagementCreateMenuId, AICustomizationManagementSection, BUILTIN_STORAGE, AI_CUSTOMIZATION_ITEM_DISABLED_KEY } from './aiCustomizationManagement.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { Delayer } from '../../../../../base/common/async.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { matchesContiguousSubString } from '../../../../../base/common/filters.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { Button, ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { createActionViewItem, getContextMenuActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IAICustomizationWorkspaceService, applyStorageSourceFilter } from '../../common/aiCustomizationWorkspaceService.js';
import { Action, Separator } from '../../../../../base/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { generateCustomizationDebugReport } from './aiCustomizationDebugPanel.js';
import { getCustomizationSecondaryText } from './aiCustomizationListWidgetUtils.js';
import { parseHooksFromFile } from '../../common/promptSyntax/hookCompatibility.js';
import { formatHookCommandLabel } from '../../common/promptSyntax/hookSchema.js';
import { HookType, HOOK_METADATA } from '../../common/promptSyntax/hookTypes.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { Schemas } from '../../../../../base/common/network.js';
import { OS } from '../../../../../base/common/platform.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ICustomizationHarnessService, matchesWorkspaceSubpath, matchesInstructionFileFilter } from '../../common/customizationHarnessService.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
export { truncateToFirstLine } from './aiCustomizationListWidgetUtils.js';
const $ = DOM.$;
//#endregion
const ITEM_HEIGHT = 44;
const GROUP_HEADER_HEIGHT = 36;
const GROUP_HEADER_HEIGHT_WITH_SEPARATOR = 40;
/**
 * Delegate for the AI Customization list.
 */
class AICustomizationListDelegate {
    getHeight(element) {
        if (element.type === 'group-header') {
            return element.isFirst ? GROUP_HEADER_HEIGHT : GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
        }
        return ITEM_HEIGHT;
    }
    getTemplateId(element) {
        return element.type === 'group-header' ? 'groupHeader' : 'aiCustomizationItem';
    }
}
/**
 * Renderer for collapsible group headers (Workspace, User, Extensions).
 * Note: Click handling is done via the list's onDidOpen event, not here.
 */
class GroupHeaderRenderer {
    constructor(hoverService) {
        this.hoverService = hoverService;
        this.templateId = 'groupHeader';
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elementDisposables = new DisposableStore();
        container.classList.add('ai-customization-group-header');
        const chevron = DOM.append(container, $('.group-chevron'));
        const icon = DOM.append(container, $('.group-icon'));
        const labelGroup = DOM.append(container, $('.group-label-group'));
        const label = DOM.append(labelGroup, $('.group-label'));
        const infoIcon = DOM.append(labelGroup, $('.group-info'));
        infoIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
        const count = DOM.append(container, $('.group-count'));
        return { container, chevron, icon, label, count, infoIcon, disposables, elementDisposables };
    }
    renderElement(element, _index, templateData) {
        templateData.elementDisposables.clear();
        // Chevron
        templateData.chevron.className = 'group-chevron';
        templateData.chevron.classList.add(...ThemeIcon.asClassNameArray(element.collapsed ? Codicon.chevronRight : Codicon.chevronDown));
        // Icon
        templateData.icon.className = 'group-icon';
        templateData.icon.classList.add(...ThemeIcon.asClassNameArray(element.icon));
        // Label + count
        templateData.label.textContent = element.label;
        templateData.count.textContent = `${element.count}`;
        // Info icon hover
        templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.infoIcon, () => ({
            content: element.description,
            appearance: {
                compact: true,
                skipFadeInAnimation: true,
            }
        })));
        // Collapsed state and separator for non-first groups
        templateData.container.classList.toggle('collapsed', element.collapsed);
        templateData.container.classList.toggle('has-previous-group', !element.isFirst);
    }
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
        templateData.disposables.dispose();
    }
}
/**
 * Returns the icon for a given prompt type.
 */
function promptTypeToIcon(type) {
    switch (type) {
        case PromptsType.agent: return agentIcon;
        case PromptsType.skill: return skillIcon;
        case PromptsType.instructions: return instructionsIcon;
        case PromptsType.prompt: return promptIcon;
        case PromptsType.hook: return hookIcon;
        default: return promptIcon;
    }
}
/**
 * Returns the icon for a given storage type.
 */
function storageToIcon(storage) {
    switch (storage) {
        case PromptsStorage.local: return workspaceIcon;
        case PromptsStorage.user: return userIcon;
        case PromptsStorage.extension: return extensionIcon;
        case PromptsStorage.plugin: return pluginIcon;
        default: return instructionsIcon;
    }
}
/**
 * Formats a name for display by stripping a trailing .md extension.
 * Names from frontmatter headers are shown as-is to stay consistent
 * with how they appear in agent dropdowns and error messages.
 */
export function formatDisplayName(name) {
    return name.replace(/\.md$/i, '');
}
/**
 * Renderer for AI customization list items.
 */
let AICustomizationItemRenderer = class AICustomizationItemRenderer {
    constructor(hoverService, labelService, menuService, contextKeyService, instantiationService, agentPluginService, harnessService) {
        this.hoverService = hoverService;
        this.labelService = labelService;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.instantiationService = instantiationService;
        this.agentPluginService = agentPluginService;
        this.harnessService = harnessService;
        this.templateId = 'aiCustomizationItem';
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elementDisposables = new DisposableStore();
        container.classList.add('ai-customization-list-item');
        const leftSection = DOM.append(container, $('.item-left'));
        const syncCheckboxContainer = DOM.append(leftSection, $('.item-sync-checkbox'));
        syncCheckboxContainer.style.display = 'none';
        const typeIcon = DOM.append(leftSection, $('.item-type-icon'));
        const textContainer = DOM.append(leftSection, $('.item-text'));
        const nameRow = DOM.append(textContainer, $('.item-name-row'));
        const nameLabel = disposables.add(new HighlightedLabel(DOM.append(nameRow, $('.item-name'))));
        const badge = DOM.append(nameRow, $('.inline-badge.item-badge'));
        const statusIcon = DOM.append(nameRow, $('.item-status-icon'));
        const description = disposables.add(new HighlightedLabel(DOM.append(textContainer, $('.item-description'))));
        // Right section for actions (hover-visible)
        const actionsContainer = DOM.append(container, $('.item-right'));
        const actionBar = disposables.add(new ActionBar(actionsContainer, {
            actionViewItemProvider: createActionViewItem.bind(undefined, this.instantiationService),
        }));
        return {
            container,
            actionsContainer,
            actionBar,
            syncCheckboxContainer,
            typeIcon,
            nameLabel,
            badge,
            statusIcon,
            description,
            disposables,
            elementDisposables,
        };
    }
    renderElement(entry, index, templateData) {
        templateData.elementDisposables.clear();
        const element = entry.item;
        // Sync checkbox: shown for syncable local items
        if (element.syncable) {
            templateData.syncCheckboxContainer.style.display = '';
            const title = element.synced
                ? localize('unsyncItem', "Remove {0} from sync", element.name)
                : localize('syncItem', "Add {0} to sync", element.name);
            const checkbox = templateData.elementDisposables.add(new Checkbox(title, !!element.synced, defaultCheckboxStyles));
            templateData.syncCheckboxContainer.replaceChildren(checkbox.domNode);
            templateData.elementDisposables.add(checkbox.onChange(() => {
                const syncProvider = this.harnessService.getActiveDescriptor().syncProvider;
                syncProvider?.toggleUri(element.uri, element.promptType);
            }));
        }
        else {
            templateData.syncCheckboxContainer.style.display = 'none';
            templateData.syncCheckboxContainer.replaceChildren();
        }
        // Type icon: use per-item override or fall back to prompt type
        templateData.typeIcon.className = 'item-type-icon';
        templateData.typeIcon.classList.add(...ThemeIcon.asClassNameArray(element.typeIcon ?? promptTypeToIcon(element.promptType)));
        // Hover tooltip: name + source + badge context + plugin source
        templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.container, () => {
            let content;
            if (element.isBuiltin) {
                content = `${element.name}\n${localize('builtinSource', "Built-in")}`;
            }
            else if (element.extensionLabel) {
                content = `${element.name}\n${localize('fromExtension', "Extension: {0}", element.extensionLabel)}`;
            }
            else {
                const isWorkspaceItem = element.storage === PromptsStorage.local;
                const uriLabel = this.labelService.getUriLabel(element.uri, { relative: isWorkspaceItem });
                content = `${element.name}\n${uriLabel}`;
            }
            if (element.badgeTooltip) {
                content += `\n\n${element.badgeTooltip}`;
            }
            const plugin = element.pluginUri && this.agentPluginService.plugins.get().find(p => isEqual(p.uri, element.pluginUri));
            if (plugin) {
                content += `\n${localize('fromPlugin', "Plugin: {0}", plugin.label)}`;
            }
            return {
                content,
                appearance: {
                    compact: true,
                    skipFadeInAnimation: true,
                }
            };
        }));
        // Apply disabled styling
        templateData.container.classList.toggle('disabled', element.disabled);
        // Name with highlights — nameMatches are pre-computed against the formatted display name
        const displayName = element.displayName ?? formatDisplayName(element.name);
        templateData.nameLabel.set(displayName, element.nameMatches);
        // Optional inline badge (e.g. "always added", "*.ts")
        if (element.badge) {
            templateData.badge.textContent = element.badge;
            templateData.badge.style.display = '';
            if (element.badgeTooltip) {
                templateData.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), templateData.badge, element.badgeTooltip));
            }
        }
        else {
            templateData.badge.textContent = '';
            templateData.badge.style.display = 'none';
        }
        // Status icon for external items with sync/loading status
        if (element.status) {
            templateData.statusIcon.style.display = '';
            templateData.statusIcon.className = 'item-status-icon';
            switch (element.status) {
                case 'loading':
                    templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
                    break;
                case 'loaded':
                    templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
                    break;
                case 'degraded':
                    templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
                    break;
                case 'error':
                    templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
                    break;
            }
            if (element.statusMessage) {
                templateData.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), templateData.statusIcon, element.statusMessage));
            }
        }
        else {
            templateData.statusIcon.style.display = 'none';
            templateData.statusIcon.className = 'item-status-icon';
        }
        // Hooks show shell commands here, so keep the full text instead of truncating to the first sentence.
        const secondaryText = getCustomizationSecondaryText(element.description, element.filename, element.promptType);
        let secondaryTextMatches;
        if (secondaryText && element.description && element.descriptionMatches) {
            if (secondaryText === element.description) {
                // No truncation, matches can be used as-is.
                secondaryTextMatches = element.descriptionMatches;
            }
            else {
                // Description was truncated for display; clamp matches to the visible range.
                const maxLength = secondaryText.length;
                const clampedMatches = element.descriptionMatches.map(match => {
                    // Discard matches that are entirely outside the visible portion.
                    if (match.start >= maxLength || match.end <= 0) {
                        return undefined;
                    }
                    const clampedStart = Math.max(0, match.start);
                    const clampedEnd = Math.min(match.end, maxLength);
                    return clampedEnd > clampedStart ? { start: clampedStart, end: clampedEnd } : undefined;
                }).filter((match) => !!match);
                secondaryTextMatches = clampedMatches.length ? clampedMatches : undefined;
            }
        }
        if (secondaryText) {
            templateData.description.set(secondaryText, secondaryTextMatches);
            templateData.description.element.style.display = '';
            // Style differently for filename vs description
            templateData.description.element.classList.toggle('is-filename', !element.description);
        }
        else {
            templateData.description.set('', undefined);
            templateData.description.element.style.display = 'none';
        }
        // Inline action bar from menu
        const context = {
            uri: element.uri.toString(),
            name: element.name,
            promptType: element.promptType,
            storage: element.storage,
            pluginUri: element.pluginUri?.toString(),
        };
        // Create scoped context key service with item-specific keys for when-clause filtering
        const overlayPairs = [
            [AI_CUSTOMIZATION_ITEM_TYPE_KEY, element.promptType],
            [AI_CUSTOMIZATION_ITEM_URI_KEY, element.uri.toString()],
            [AI_CUSTOMIZATION_ITEM_DISABLED_KEY, element.disabled],
        ];
        if (element.storage) {
            overlayPairs.push([AI_CUSTOMIZATION_ITEM_STORAGE_KEY, element.storage]);
        }
        if (element.pluginUri) {
            overlayPairs.push([AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY, element.pluginUri.toString()]);
        }
        const overlay = this.contextKeyService.createOverlay(overlayPairs);
        const menu = templateData.elementDisposables.add(this.menuService.createMenu(AICustomizationManagementItemMenuId, overlay));
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
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
        templateData.disposables.dispose();
    }
};
AICustomizationItemRenderer = __decorate([
    __param(0, IHoverService),
    __param(1, ILabelService),
    __param(2, IMenuService),
    __param(3, IContextKeyService),
    __param(4, IInstantiationService),
    __param(5, IAgentPluginService),
    __param(6, ICustomizationHarnessService)
], AICustomizationItemRenderer);
/**
 * Maps section ID to prompt type.
 */
export function sectionToPromptType(section) {
    switch (section) {
        case AICustomizationManagementSection.Agents:
            return PromptsType.agent;
        case AICustomizationManagementSection.Skills:
            return PromptsType.skill;
        case AICustomizationManagementSection.Instructions:
            return PromptsType.instructions;
        case AICustomizationManagementSection.Hooks:
            return PromptsType.hook;
        case AICustomizationManagementSection.Prompts:
        default:
            return PromptsType.prompt;
    }
}
/**
 * Widget that displays a searchable list of AI customization items.
 */
let AICustomizationListWidget = class AICustomizationListWidget extends Disposable {
    constructor(instantiationService, promptsService, contextViewService, openerService, contextMenuService, menuService, contextKeyService, workspaceContextService, labelService, workspaceService, clipboardService, hoverService, fileService, pathService, telemetryService, harnessService, agentPluginService, commandService, productService) {
        super();
        this.instantiationService = instantiationService;
        this.promptsService = promptsService;
        this.contextViewService = contextViewService;
        this.openerService = openerService;
        this.contextMenuService = contextMenuService;
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.workspaceContextService = workspaceContextService;
        this.labelService = labelService;
        this.workspaceService = workspaceService;
        this.clipboardService = clipboardService;
        this.hoverService = hoverService;
        this.fileService = fileService;
        this.pathService = pathService;
        this.telemetryService = telemetryService;
        this.harnessService = harnessService;
        this.agentPluginService = agentPluginService;
        this.commandService = commandService;
        this.productService = productService;
        this.currentSection = AICustomizationManagementSection.Agents;
        this.allItems = [];
        this.displayEntries = [];
        this.searchQuery = '';
        this.collapsedGroups = new Set();
        this.dropdownActionDisposables = this._register(new DisposableStore());
        this.delayedFilter = new Delayer(200);
        this._onDidSelectItem = this._register(new Emitter());
        this.onDidSelectItem = this._onDidSelectItem.event;
        this._onDidChangeItemCount = this._register(new Emitter());
        this.onDidChangeItemCount = this._onDidChangeItemCount.event;
        this._onDidRequestCreate = this._register(new Emitter());
        this.onDidRequestCreate = this._onDidRequestCreate.event;
        this._onDidRequestCreateManual = this._register(new Emitter());
        this.onDidRequestCreateManual = this._onDidRequestCreateManual.event;
        this.element = $('.ai-customization-list-widget');
        this.create();
        this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.refresh()));
        this._register(autorun(reader => {
            this.workspaceService.activeProjectRoot.read(reader);
            this.updateAddButton();
            this.refresh();
        }));
        // Re-filter when the active harness changes
        this._register(autorun(reader => {
            this.harnessService.activeHarness.read(reader);
            this.updateAddButton();
            this.refresh();
        }));
        // Refresh when available harnesses change (external provider registered/unregistered)
        this._register(autorun(reader => {
            this.harnessService.availableHarnesses.read(reader);
            this.refresh();
        }));
        // Subscribe to the active provider's onDidChange event
        const providerChangeDisposable = this._register(new MutableDisposable());
        const syncChangeDisposable = this._register(new MutableDisposable());
        this._register(autorun(reader => {
            this.harnessService.activeHarness.read(reader);
            const activeDescriptor = this.harnessService.getActiveDescriptor();
            if (activeDescriptor.itemProvider) {
                providerChangeDisposable.value = activeDescriptor.itemProvider.onDidChange(() => this.refresh());
            }
            else {
                providerChangeDisposable.clear();
            }
            if (activeDescriptor.syncProvider) {
                syncChangeDisposable.value = activeDescriptor.syncProvider.onDidChange(() => this.refresh());
            }
            else {
                syncChangeDisposable.clear();
            }
        }));
    }
    create() {
        // Search and button container
        this.searchAndButtonContainer = DOM.append(this.element, $('.list-search-and-button-container'));
        // Search container
        this.searchContainer = DOM.append(this.searchAndButtonContainer, $('.list-search-container'));
        this.searchInput = this._register(new InputBox(this.searchContainer, this.contextViewService, {
            placeholder: localize('searchPlaceholder', "Type to search..."),
            inputBoxStyles: defaultInputBoxStyles,
        }));
        this._register(this.searchInput.onDidChange(() => {
            this.searchQuery = this.searchInput.value;
            this.delayedFilter.trigger(() => {
                const matchCount = this.filterItems();
                if (this.searchQuery.trim()) {
                    this.telemetryService.publicLog2('chatCustomizationEditor.search', {
                        section: this.currentSection,
                        resultCount: matchCount,
                    });
                }
            });
        }));
        // Add button container next to search
        this.addButtonContainer = DOM.append(this.searchAndButtonContainer, $('.list-add-button-container'));
        // Simple button (for single-action case, no dropdown)
        this.addButtonSimple = this._register(new Button(this.addButtonContainer, {
            ...defaultButtonStyles,
            supportIcons: true,
        }));
        this.addButtonSimple.element.classList.add('list-add-button');
        this._register(this.addButtonSimple.onDidClick(() => this.executePrimaryCreateAction()));
        // Button with dropdown (for multi-action case)
        this.addButton = this._register(new ButtonWithDropdown(this.addButtonContainer, {
            ...defaultButtonStyles,
            supportIcons: true,
            contextMenuProvider: this.contextMenuService,
            addPrimaryActionToDropdown: false,
            actions: { getActions: () => this.getDropdownActions() },
        }));
        this.addButton.element.classList.add('list-add-button');
        this._register(this.addButton.onDidClick(() => this.executePrimaryCreateAction()));
        this.updateAddButton();
        // List container
        this.listContainer = DOM.append(this.element, $('.list-container'));
        // Empty state container
        this.emptyStateContainer = DOM.append(this.element, $('.list-empty-state'));
        const emptyStateHeader = DOM.append(this.emptyStateContainer, $('.empty-state-header'));
        this.emptyStateIcon = DOM.append(emptyStateHeader, $('.empty-state-icon'));
        this.emptyStateText = DOM.append(emptyStateHeader, $('.empty-state-text'));
        this.emptyStateSubtext = DOM.append(this.emptyStateContainer, $('.empty-state-subtext'));
        this.emptyStateContainer.style.display = 'none';
        // Create list
        this.list = this._register(this.instantiationService.createInstance((WorkbenchList), 'AICustomizationManagementList', this.listContainer, new AICustomizationListDelegate(), [
            new GroupHeaderRenderer(this.hoverService),
            this.instantiationService.createInstance(AICustomizationItemRenderer),
        ], {
            identityProvider: {
                getId: (entry) => entry.type === 'group-header' ? entry.id : entry.item.id,
            },
            accessibilityProvider: {
                getAriaLabel: (entry) => {
                    if (entry.type === 'group-header') {
                        return localize('groupAriaLabel', "{0}, {1} items, {2}", entry.label, entry.count, entry.collapsed ? localize('collapsed', "collapsed") : localize('expanded', "expanded"));
                    }
                    const nameAndDesc = entry.item.description
                        ? localize('itemAriaLabel', "{0}, {1}", entry.item.name, entry.item.description)
                        : entry.item.name;
                    return entry.item.disabled
                        ? localize('itemAriaLabelDisabled', "{0}, disabled", nameAndDesc)
                        : nameAndDesc;
                },
                getWidgetAriaLabel: () => localize('listAriaLabel', "Chat Customizations"),
            },
            keyboardNavigationLabelProvider: {
                getKeyboardNavigationLabel: (entry) => entry.type === 'group-header' ? entry.label : entry.item.name,
            },
            multipleSelectionSupport: false,
            openOnSingleClick: true,
        }));
        // Handle item selection (single click opens item, group header toggles)
        this._register(this.list.onDidOpen(e => {
            if (e.element) {
                if (e.element.type === 'group-header') {
                    this.toggleGroup(e.element);
                }
                else {
                    this._onDidSelectItem.fire(e.element.item);
                }
            }
        }));
        // Handle context menu
        this._register(this.list.onContextMenu(e => this.onContextMenu(e)));
        // Subscribe to prompt service changes
        this._register(this.promptsService.onDidChangeCustomAgents(() => this.refresh()));
        this._register(this.promptsService.onDidChangeSlashCommands(() => this.refresh()));
        this._register(this.promptsService.onDidChangeSkills(() => this.refresh()));
        // Refresh on file deletions so the list updates after inline delete actions
        this._register(this.fileService.onDidFilesChange(e => {
            if (e.gotDeleted()) {
                this.refresh();
            }
        }));
        // Section footer at bottom with description and link
        this.sectionHeader = DOM.append(this.element, $('.section-footer'));
        this.sectionDescription = DOM.append(this.sectionHeader, $('p.section-footer-description'));
        this.sectionLink = DOM.append(this.sectionHeader, $('a.section-footer-link'));
        this._register(DOM.addDisposableListener(this.sectionLink, 'click', (e) => {
            e.preventDefault();
            const href = this.sectionLink.href;
            if (href) {
                this.openerService.open(URI.parse(href));
            }
        }));
        this.updateSectionHeader();
    }
    /**
     * Handles context menu for list items.
     */
    onContextMenu(e) {
        if (!e.element || e.element.type !== 'file-item') {
            return;
        }
        const item = e.element.item;
        // Create context for the menu actions
        const context = {
            uri: item.uri.toString(),
            name: item.name,
            promptType: item.promptType,
            storage: item.storage,
            pluginUri: item.pluginUri?.toString(),
        };
        // Create scoped context key service with item-specific keys for when-clause filtering
        const overlayPairs = [
            [AI_CUSTOMIZATION_ITEM_TYPE_KEY, item.promptType],
            [AI_CUSTOMIZATION_ITEM_URI_KEY, item.uri.toString()],
            [AI_CUSTOMIZATION_ITEM_DISABLED_KEY, item.disabled],
        ];
        if (item.storage) {
            overlayPairs.push([AI_CUSTOMIZATION_ITEM_STORAGE_KEY, item.storage]);
        }
        if (item.pluginUri) {
            overlayPairs.push([AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY, item.pluginUri.toString()]);
        }
        const overlay = this.contextKeyService.createOverlay(overlayPairs);
        // Get menu actions, excluding inline actions to avoid duplicates
        const actions = this.menuService.getMenuActions(AICustomizationManagementItemMenuId, overlay, {
            arg: context,
            shouldForwardArgs: true,
        });
        const { secondary } = getContextMenuActions(actions, 'inline');
        // Add copy path actions (not shown for built-in items where the path is an implementation detail)
        const copyActions = item.isBuiltin ? [] : [
            new Separator(),
            new Action('copyFullPath', localize('copyFullPath', "Copy Full Path"), undefined, true, async () => {
                await this.clipboardService.writeText(item.uri.fsPath);
            }),
            new Action('copyRelativePath', localize('copyRelativePath', "Copy Relative Path"), undefined, true, async () => {
                const basePath = this.workspaceService.getActiveProjectRoot();
                if (basePath && item.uri.fsPath.startsWith(basePath.fsPath)) {
                    const relative = item.uri.fsPath.substring(basePath.fsPath.length + 1);
                    await this.clipboardService.writeText(relative);
                }
                else {
                    // Fallback to workspace-relative via label service
                    const relativePath = this.labelService.getUriLabel(item.uri, { relative: true });
                    await this.clipboardService.writeText(relativePath);
                }
            }),
        ];
        this.contextMenuService.showContextMenu({
            getAnchor: () => e.anchor,
            getActions: () => [...secondary, ...copyActions],
        });
    }
    /**
     * Sets the current section and loads items for that section.
     */
    async setSection(section) {
        this.currentSection = section;
        this.updateSectionHeader();
        await this.loadItems();
        this.updateAddButton();
    }
    /**
     * Updates the section header based on the current section.
     */
    updateSectionHeader() {
        let description;
        let docsUrl;
        let learnMoreLabel;
        switch (this.currentSection) {
            case AICustomizationManagementSection.Agents:
                description = localize('agentsDescription', "Configure the AI to adopt different personas tailored to specific development tasks. Each agent has its own instructions, tools, and behavior.");
                docsUrl = 'https://code.visualstudio.com/docs/copilot/customization/custom-agents';
                learnMoreLabel = localize('learnMoreAgents', "Learn more about custom agents");
                break;
            case AICustomizationManagementSection.Skills:
                description = localize('skillsDescription', "Folders of instructions, scripts, and resources that Copilot loads when relevant to perform specialized tasks.");
                docsUrl = 'https://code.visualstudio.com/docs/copilot/customization/agent-skills';
                learnMoreLabel = localize('learnMoreSkills', "Learn more about agent skills");
                break;
            case AICustomizationManagementSection.Instructions:
                description = localize('instructionsDescription', "Define common guidelines and rules that automatically influence how AI generates code and handles development tasks.");
                docsUrl = 'https://code.visualstudio.com/docs/copilot/customization/custom-instructions';
                learnMoreLabel = localize('learnMoreInstructions', "Learn more about custom instructions");
                break;
            case AICustomizationManagementSection.Hooks:
                description = localize('hooksDescription', "Prompts executed at specific points during an agentic lifecycle.");
                docsUrl = 'https://code.visualstudio.com/docs/copilot/customization/hooks';
                learnMoreLabel = localize('learnMoreHooks', "Learn more about hooks");
                break;
            case AICustomizationManagementSection.Prompts:
            default:
                description = localize('promptsDescription', "Reusable prompts for common development tasks like generating code, performing reviews, or scaffolding components.");
                docsUrl = 'https://code.visualstudio.com/docs/copilot/customization/prompt-files';
                learnMoreLabel = localize('learnMorePrompts', "Learn more about prompt files");
                break;
        }
        this.sectionDescription.textContent = description;
        this.sectionLink.textContent = learnMoreLabel;
        this.sectionLink.href = docsUrl;
    }
    /**
     * Updates the add button by building a unified action list.
     * The first action becomes the primary button; the rest go in the dropdown.
     */
    updateAddButton() {
        const actions = this.buildCreateActions();
        const [primary, ...dropdown] = actions;
        const hasDropdown = dropdown.length > 0;
        // Toggle which button is visible
        this.addButton.element.style.display = hasDropdown ? '' : 'none';
        this.addButtonSimple.element.style.display = hasDropdown ? 'none' : '';
        if (!primary) {
            this.addButtonSimple.element.style.display = 'none';
            this.addButton.element.style.display = 'none';
            return;
        }
        if (hasDropdown) {
            this.addButton.label = primary.label;
            this.addButton.enabled = primary.enabled;
            this.addButton.primaryButton.setTitle(primary.tooltip ?? '');
            this.addButton.dropdownButton.setTitle('');
        }
        else {
            this.addButtonSimple.label = primary.label;
            this.addButtonSimple.enabled = primary.enabled;
            this.addButtonSimple.setTitle(primary.tooltip ?? '');
        }
    }
    /**
     * Builds an ordered list of create actions for the current section.
     * The first entry is the primary button; remaining entries are dropdown items.
     */
    buildCreateActions() {
        const typeLabel = this.getTypeLabel();
        const promptType = sectionToPromptType(this.currentSection);
        const descriptor = this.harnessService.getActiveDescriptor();
        const override = descriptor.sectionOverrides?.get(this.currentSection);
        const hasWorkspace = this.hasActiveWorkspace();
        // Full command override (e.g. Claude hooks) — single action, no dropdown
        if (override?.commandId) {
            return [{
                    label: `$(${Codicon.add.id}) ${override.label}`,
                    enabled: true,
                    run: () => { this.commandService.executeCommand(override.commandId); },
                }];
        }
        // Check for menu-contributed create actions from extensions.
        // Extensions contribute to AICustomizationManagementCreateMenuId with
        // when-clauses targeting chatCustomizationSessionType and
        // chatCustomizationSection context keys.
        // When a harness contributes create actions, they REPLACE the built-in ones
        // for all section types, including hooks.
        const menuActions = this.menuService.getMenuActions(AICustomizationManagementCreateMenuId, this.contextKeyService, { shouldForwardArgs: true });
        const extensionCreateActions = [];
        for (const [, group] of menuActions) {
            for (const menuItem of group) {
                if (menuItem instanceof MenuItemAction) {
                    const icon = ThemeIcon.isThemeIcon(menuItem.item.icon) ? menuItem.item.icon.id : Codicon.add.id;
                    extensionCreateActions.push({
                        label: `$(${icon}) ${typeof menuItem.item.title === 'string' ? menuItem.item.title : menuItem.item.title.value}`,
                        enabled: menuItem.enabled,
                        run: () => { menuItem.run(); },
                    });
                }
            }
        }
        if (extensionCreateActions.length > 0) {
            return extensionCreateActions;
        }
        const createTypeLabel = override?.typeLabel ?? typeLabel;
        const actions = [];
        const addedTargets = new Set();
        // Root-file primary button (e.g. "Add CLAUDE.md") — only when workspace is open.
        // Without a workspace, user creation becomes primary and rootFile goes to dropdown.
        if (override?.rootFile && hasWorkspace) {
            actions.push({
                label: `$(${Codicon.add.id}) ${override.label}`,
                enabled: true,
                run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'workspace-root' }); },
            });
            addedTargets.add('workspace-root');
        }
        // Hooks have a simplified action set
        if (promptType === PromptsType.hook) {
            if (!this.workspaceService.isSessionsWindow && !descriptor.hideGenerateButton) {
                // Core Local: Generate is primary, configure hooks in dropdown
                actions.push({
                    label: `$(${Codicon.sparkle.id}) Generate ${typeLabel}`,
                    enabled: true,
                    run: () => { this._onDidRequestCreate.fire(promptType); },
                });
                if (hasWorkspace) {
                    actions.push({
                        label: `$(${Codicon.add.id}) Configure Hooks`,
                        enabled: true,
                        run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'workspace' }); },
                    });
                }
            }
            else if (!override?.commandId) {
                // Sessions / non-local: workspace creation only
                actions.push({
                    label: `$(${Codicon.add.id}) New ${typeLabel} (Workspace)`,
                    enabled: hasWorkspace,
                    tooltip: hasWorkspace ? undefined : localize('createDisabled', "Open a workspace folder to create customizations."),
                    run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'workspace' }); },
                });
            }
            return actions;
        }
        // Non-hook sections: build the full action list
        if (!override?.rootFile) {
            // Determine the primary action (first in list)
            if (!this.workspaceService.isSessionsWindow && !descriptor.hideGenerateButton) {
                // Core Local: Generate is primary
                actions.push({
                    label: `$(${Codicon.sparkle.id}) Generate ${typeLabel}`,
                    enabled: true,
                    run: () => { this._onDidRequestCreate.fire(promptType); },
                });
            }
            else if (hasWorkspace) {
                // Sessions or non-local harness with workspace: workspace is primary
                actions.push({
                    label: `$(${Codicon.add.id}) New ${createTypeLabel} (Workspace)`,
                    enabled: true,
                    run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'workspace' }); },
                });
                addedTargets.add('workspace');
            }
            else {
                // No workspace: user is primary
                actions.push({
                    label: `$(${Codicon.add.id}) New ${createTypeLabel} (User)`,
                    enabled: true,
                    run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'user' }); },
                });
                addedTargets.add('user');
            }
        }
        // Secondary actions (dropdown) — only add if not already present
        if (hasWorkspace && !addedTargets.has('workspace')) {
            actions.push({
                label: `$(${Codicon.folder.id}) New ${createTypeLabel} (Workspace)`,
                enabled: true,
                run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'workspace' }); },
            });
        }
        if (!addedTargets.has('user')) {
            actions.push({
                label: `$(${Codicon.account.id}) New ${createTypeLabel} (User)`,
                enabled: true,
                run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'user' }); },
            });
        }
        // Root-file shortcuts from the descriptor (e.g. "New AGENTS.md")
        if (hasWorkspace && override?.rootFileShortcuts && !addedTargets.has('workspace-root')) {
            for (const fileName of override.rootFileShortcuts) {
                actions.push({
                    label: `$(${Codicon.file.id}) New ${fileName}`,
                    enabled: true,
                    run: () => { this._onDidRequestCreateManual.fire({ type: promptType, target: 'workspace-root', rootFileName: fileName }); },
                });
            }
        }
        return actions;
    }
    /**
     * Gets the dropdown actions for the add button (consumed by ButtonWithDropdown).
     * Returns all actions except the primary (first) from buildCreateActions.
     */
    getDropdownActions() {
        this.dropdownActionDisposables.clear();
        const allActions = this.buildCreateActions();
        // Skip the first (primary) action
        return allActions.slice(1).map((a, i) => this.dropdownActionDisposables.add(new Action(`create_${i}`, a.label, undefined, a.enabled, () => a.run())));
    }
    /**
     * Checks if there's an active project root (workspace folder or session repository).
     */
    hasActiveWorkspace() {
        return !!this.workspaceService.getActiveProjectRoot();
    }
    /**
     * Executes the primary create action based on context.
     */
    executePrimaryCreateAction() {
        const actions = this.buildCreateActions();
        if (actions.length > 0 && actions[0].enabled) {
            actions[0].run();
        }
    }
    /**
     * Gets the type label for the current section.
     */
    getTypeLabel() {
        switch (this.currentSection) {
            case AICustomizationManagementSection.Agents:
                return localize('agent', "Agent");
            case AICustomizationManagementSection.Skills:
                return localize('skill', "Skill");
            case AICustomizationManagementSection.Instructions:
                return localize('instructions', "Instructions");
            case AICustomizationManagementSection.Hooks:
                return localize('hook', "Hook");
            case AICustomizationManagementSection.Prompts:
            default:
                return localize('prompt', "Prompt");
        }
    }
    /**
     * Refreshes the current section's items.
     */
    async refresh() {
        await this.loadItems();
        this.updateAddButton();
    }
    /**
     * Loads items for the current section.
     */
    async loadItems() {
        const section = this.currentSection;
        let items;
        try {
            items = await this.fetchItemsForSection(section);
        }
        catch (err) {
            onUnexpectedError(err);
            items = [];
        }
        if (this.currentSection !== section) {
            return; // section changed while loading
        }
        this.allItems = items;
        this.filterItems();
        this._onDidChangeItemCount.fire(items.length);
    }
    /**
     * Computes the item count for a given section without updating the display.
     * Uses the same loading and filtering logic as `loadItems` for consistency.
     */
    async computeItemCountForSection(section) {
        const items = await this.fetchItemsForSection(section);
        return items.length;
    }
    /**
     * Returns true if the given extension identifier matches the default
     * chat extension (e.g. GitHub Copilot Chat). Used to group items from
     * the chat extension under "Built-in" instead of "Extensions", similar
     * to how MCP categorizes built-in servers.
     */
    isChatExtensionItem(extensionId) {
        const chatExtensionId = this.productService.defaultChatAgent?.chatExtensionId;
        return !!chatExtensionId && ExtensionIdentifier.equals(extensionId, chatExtensionId);
    }
    /**
     * Post-processes items to assign groupKey overrides for extension-sourced
     * items. Applies the built-in grouping consistently across all item types.
     *
     * Items that already have an explicit groupKey (e.g. instruction categories,
     * agent hooks) are left untouched — groupKey overrides are only applied to
     * items whose current groupKey is `undefined`.
     */
    applyBuiltinGroupKeys(items, extensionInfoByUri) {
        return items.map(item => {
            if (item.storage !== PromptsStorage.extension) {
                return item;
            }
            const extInfo = extensionInfoByUri.get(item.uri);
            if (!extInfo) {
                return item;
            }
            const isBuiltin = this.isChatExtensionItem(extInfo.id);
            if (isBuiltin) {
                return {
                    ...item,
                    isBuiltin: true,
                    groupKey: item.groupKey ?? BUILTIN_STORAGE,
                };
            }
            return {
                ...item,
                extensionLabel: extInfo.displayName || extInfo.id.value,
            };
        });
    }
    /**
     * Fetches and filters items for a given section.
     * Delegates to the provider path or core path based on the active harness.
     */
    async fetchItemsForSection(section) {
        const promptType = sectionToPromptType(section);
        const activeDescriptor = this.harnessService.getActiveDescriptor();
        if (activeDescriptor.itemProvider && promptType) {
            return this.fetchProviderItemsForSection(activeDescriptor, promptType);
        }
        return this.fetchCoreItemsForSection(promptType);
    }
    /**
     * Fetches items from an external customization provider.
     * When a syncProvider is present, blends remote items with local sync items.
     */
    async fetchProviderItemsForSection(descriptor, promptType) {
        const remoteItems = await this.fetchItemsFromProvider(descriptor.itemProvider, promptType);
        if (!descriptor.syncProvider) {
            return remoteItems;
        }
        const localItems = await this.fetchLocalSyncableItems(promptType, descriptor.syncProvider);
        return [...remoteItems, ...localItems];
    }
    /**
     * Fetches items from the core promptsService with full filtering pipeline.
     * This is the legacy path used when no external provider is active.
     * TODO: Remove when provider API is the sole code path.
     */
    async fetchCoreItemsForSection(promptType) {
        const items = [];
        const disabledUris = this.promptsService.getDisabledPromptFiles(promptType);
        const extensionInfoByUri = new ResourceMap();
        if (promptType === PromptsType.agent) {
            // Use getCustomAgents which has parsed name/description from frontmatter
            const agents = await this.promptsService.getCustomAgents(CancellationToken.None);
            // Build extension display name lookup from raw file list
            const allAgentFiles = await this.promptsService.listPromptFiles(PromptsType.agent, CancellationToken.None);
            for (const file of allAgentFiles) {
                if (file.extension) {
                    extensionInfoByUri.set(file.uri, { id: file.extension.identifier, displayName: file.extension.displayName });
                }
            }
            for (const agent of agents) {
                const filename = basename(agent.uri);
                items.push({
                    id: agent.uri.toString(),
                    uri: agent.uri,
                    name: agent.name,
                    filename,
                    description: agent.description,
                    storage: agent.source.storage,
                    promptType,
                    pluginUri: agent.source.storage === PromptsStorage.plugin ? agent.source.pluginUri : undefined,
                    disabled: disabledUris.has(agent.uri),
                });
                // Track extension ID for built-in grouping (if not already set from file list)
                if (agent.source.storage === PromptsStorage.extension && !extensionInfoByUri.has(agent.uri)) {
                    extensionInfoByUri.set(agent.uri, { id: agent.source.extensionId });
                }
            }
        }
        else if (promptType === PromptsType.skill) {
            // Use findAgentSkills for enabled skills (has parsed name/description from frontmatter)
            const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
            // Build extension ID lookup from raw file list (like MCP builds collectionSources)
            const allSkillFiles = await this.promptsService.listPromptFiles(PromptsType.skill, CancellationToken.None);
            for (const file of allSkillFiles) {
                if (file.extension) {
                    extensionInfoByUri.set(file.uri, { id: file.extension.identifier, displayName: file.extension.displayName });
                }
            }
            const uiIntegrations = this.workspaceService.getSkillUIIntegrations();
            const seenUris = new ResourceSet();
            for (const skill of skills || []) {
                const filename = basename(skill.uri);
                const skillName = skill.name || basename(dirname(skill.uri)) || filename;
                seenUris.add(skill.uri);
                const skillFolderName = basename(dirname(skill.uri));
                const uiTooltip = uiIntegrations.get(skillFolderName);
                items.push({
                    id: skill.uri.toString(),
                    uri: skill.uri,
                    name: skillName,
                    filename,
                    description: skill.description,
                    storage: skill.storage,
                    promptType,
                    pluginUri: skill.storage === PromptsStorage.plugin ? this.findPluginUri(skill.uri) : undefined,
                    disabled: false,
                    badge: uiTooltip ? localize('uiIntegrationBadge', "UI Integration") : undefined,
                    badgeTooltip: uiTooltip,
                });
            }
            // Also include disabled skills from the raw file list
            if (disabledUris.size > 0) {
                for (const file of allSkillFiles) {
                    if (!seenUris.has(file.uri) && disabledUris.has(file.uri)) {
                        const filename = basename(file.uri);
                        const disabledName = file.name || basename(dirname(file.uri)) || filename;
                        const disabledFolderName = basename(dirname(file.uri));
                        const uiTooltip = uiIntegrations.get(disabledFolderName);
                        items.push({
                            id: file.uri.toString(),
                            uri: file.uri,
                            name: disabledName,
                            filename,
                            description: file.description,
                            storage: file.storage,
                            promptType,
                            disabled: true,
                            badge: uiTooltip ? localize('uiIntegrationBadge', "UI Integration") : undefined,
                            badgeTooltip: uiTooltip,
                        });
                    }
                }
            }
        }
        else if (promptType === PromptsType.prompt) {
            // Use getPromptSlashCommands which has parsed name/description from frontmatter
            // Filter out skills since they have their own section
            const commands = await this.promptsService.getPromptSlashCommands(CancellationToken.None);
            for (const command of commands) {
                if (command.type === PromptsType.skill) {
                    continue;
                }
                const filename = basename(command.uri);
                items.push({
                    id: command.uri.toString(),
                    uri: command.uri,
                    name: command.name,
                    filename,
                    description: command.description,
                    storage: command.storage,
                    promptType,
                    pluginUri: command.storage === PromptsStorage.plugin ? command.pluginUri : undefined,
                    disabled: disabledUris.has(command.uri),
                });
                if (command.extension) {
                    extensionInfoByUri.set(command.uri, { id: command.extension.identifier, displayName: command.extension.displayName });
                }
            }
        }
        else if (promptType === PromptsType.hook) {
            // Try to parse individual hooks from each file; fall back to showing the file itself
            const hookFiles = await this.promptsService.listPromptFiles(PromptsType.hook, CancellationToken.None);
            const activeRoot = this.workspaceService.getActiveProjectRoot();
            const userHomeUri = await this.pathService.userHome();
            const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;
            for (const hookFile of hookFiles) {
                // Plugins parse their own hooks and emit them individually because they can
                // be embedded with interpolations in the plugin manifests; don't re-parse them
                if (hookFile.storage === PromptsStorage.plugin) {
                    const filename = basename(hookFile.uri);
                    items.push({
                        id: hookFile.uri.toString() + ':' + hookFile.name,
                        uri: hookFile.uri,
                        name: hookFile.name || this.getFriendlyName(filename),
                        filename,
                        storage: hookFile.storage,
                        promptType,
                        pluginUri: hookFile.pluginUri,
                        disabled: disabledUris.has(hookFile.uri),
                    });
                    continue;
                }
                let parsedHooks = false;
                try {
                    const content = await this.fileService.readFile(hookFile.uri);
                    const json = parseJSONC(content.value.toString());
                    const { hooks } = parseHooksFromFile(hookFile.uri, json, activeRoot, userHome);
                    if (hooks.size > 0) {
                        parsedHooks = true;
                        for (const [hookType, entry] of hooks) {
                            const hookMeta = HOOK_METADATA[hookType];
                            for (let i = 0; i < entry.hooks.length; i++) {
                                const hook = entry.hooks[i];
                                const cmdLabel = formatHookCommandLabel(hook, OS);
                                const truncatedCmd = cmdLabel.length > 60 ? cmdLabel.substring(0, 57) + '...' : cmdLabel;
                                items.push({
                                    id: `${hookFile.uri.toString()}#${entry.originalId}[${i}]`,
                                    uri: hookFile.uri,
                                    name: hookMeta?.label ?? entry.originalId,
                                    filename: basename(hookFile.uri),
                                    description: truncatedCmd || localize('hookUnset', "(unset)"),
                                    storage: hookFile.storage,
                                    promptType,
                                    disabled: disabledUris.has(hookFile.uri),
                                });
                            }
                        }
                    }
                }
                catch {
                    // Parse failed — fall through to show raw file
                }
                if (!parsedHooks) {
                    const filename = basename(hookFile.uri);
                    items.push({
                        id: hookFile.uri.toString(),
                        uri: hookFile.uri,
                        name: hookFile.name || this.getFriendlyName(filename),
                        filename,
                        storage: hookFile.storage,
                        promptType,
                        disabled: disabledUris.has(hookFile.uri),
                    });
                }
            }
            // Also include hooks defined in agent frontmatter (not in sessions window)
            // TODO: add this back when Copilot CLI supports this
            const agents = !this.workspaceService.isSessionsWindow ? await this.promptsService.getCustomAgents(CancellationToken.None) : [];
            for (const agent of agents) {
                if (!agent.hooks) {
                    continue;
                }
                for (const hookType of Object.values(HookType)) {
                    const hookCommands = agent.hooks[hookType];
                    if (!hookCommands || hookCommands.length === 0) {
                        continue;
                    }
                    const hookMeta = HOOK_METADATA[hookType];
                    for (let i = 0; i < hookCommands.length; i++) {
                        const hook = hookCommands[i];
                        const cmdLabel = formatHookCommandLabel(hook, OS);
                        const truncatedCmd = cmdLabel.length > 60 ? cmdLabel.substring(0, 57) + '...' : cmdLabel;
                        items.push({
                            id: `${agent.uri.toString()}#hook:${hookType}[${i}]`,
                            uri: agent.uri,
                            name: hookMeta?.label ?? hookType,
                            filename: basename(agent.uri),
                            description: `${agent.name}: ${truncatedCmd || localize('hookUnset', "(unset)")}`,
                            storage: agent.source.storage,
                            groupKey: 'agents',
                            promptType,
                            pluginUri: agent.source.storage === PromptsStorage.plugin ? agent.source.pluginUri : undefined,
                            disabled: disabledUris.has(agent.uri),
                        });
                    }
                }
            }
        }
        else {
            // For instructions, group by category: agent instructions, context instructions, on-demand instructions
            const instructionFiles = await this.promptsService.getInstructionFiles(CancellationToken.None);
            for (const file of instructionFiles) {
                if (file.extension) {
                    extensionInfoByUri.set(file.uri, { id: file.extension.identifier, displayName: file.extension.displayName });
                }
            }
            const agentInstructionFiles = await this.promptsService.listAgentInstructions(CancellationToken.None, undefined);
            const agentInstructionUris = new ResourceSet(agentInstructionFiles.map(f => f.uri));
            // Add agent instruction items
            const workspaceFolderUris = this.workspaceContextService.getWorkspace().folders.map(f => f.uri);
            const activeRoot = this.workspaceService.getActiveProjectRoot();
            if (activeRoot) {
                workspaceFolderUris.push(activeRoot);
            }
            for (const file of agentInstructionFiles) {
                const storage = PromptsStorage.local;
                const filename = basename(file.uri);
                items.push({
                    id: file.uri.toString(),
                    uri: file.uri,
                    name: filename,
                    filename: this.labelService.getUriLabel(file.uri, { relative: true }),
                    displayName: filename,
                    storage,
                    promptType,
                    typeIcon: storageToIcon(storage),
                    groupKey: 'agent-instructions',
                    disabled: disabledUris.has(file.uri),
                });
            }
            // Parse prompt files to separate into context vs on-demand
            for (const { uri, pattern, name, description, storage, pluginUri } of instructionFiles) {
                if (agentInstructionUris.has(uri)) {
                    continue; // already added as agent instruction
                }
                const friendlyName = this.getFriendlyName(name);
                if (pattern !== undefined) {
                    // Context instruction
                    const badge = pattern === '**'
                        ? localize('alwaysAdded', "always added")
                        : pattern;
                    const badgeTooltip = pattern === '**'
                        ? localize('alwaysAddedTooltip', "This instruction is automatically included in every interaction.")
                        : localize('onContextTooltip', "This instruction is automatically included when files matching '{0}' are in context.", pattern);
                    items.push({
                        id: uri.toString(),
                        uri,
                        name: friendlyName,
                        filename: this.labelService.getUriLabel(uri, { relative: true }),
                        displayName: friendlyName,
                        badge,
                        badgeTooltip,
                        description,
                        storage,
                        promptType,
                        typeIcon: storageToIcon(storage),
                        groupKey: 'context-instructions',
                        pluginUri,
                        disabled: disabledUris.has(uri),
                    });
                }
                else {
                    // On-demand instruction
                    items.push({
                        id: uri.toString(),
                        uri,
                        name: friendlyName,
                        filename: basename(uri),
                        displayName: friendlyName,
                        description,
                        storage,
                        promptType,
                        typeIcon: storageToIcon(storage),
                        groupKey: 'on-demand-instructions',
                        pluginUri,
                        disabled: disabledUris.has(uri),
                    });
                }
            }
        }
        // Assign built-in groupKeys — items from the default chat extension
        // are re-grouped under "Built-in" instead of "Extensions".
        // This is a single-pass transformation applied after all items are
        // collected, keeping the item-building code free of grouping logic.
        const groupedItems = this.applyBuiltinGroupKeys(items, extensionInfoByUri);
        // Apply storage source filter (removes items not in visible sources or excluded user roots)
        const filter = this.workspaceService.getStorageSourceFilter(promptType);
        const withStorage = groupedItems.filter((item) => item.storage !== undefined);
        const withoutStorage = groupedItems.filter(item => item.storage === undefined);
        const filteredItems = [...applyStorageSourceFilter(withStorage, filter), ...withoutStorage];
        items.length = 0;
        items.push(...filteredItems);
        // Apply workspace subpath filter — when the active harness specifies
        // workspaceSubpaths, hide workspace-local items that aren't under one
        // of the recognized sub-paths (e.g. Claude only shows .claude/ items).
        // Exception: instruction files matched by the harness's instructionFileFilter
        // are exempt (e.g. CLAUDE.md at workspace root is a Claude-native file
        // even though it's not under .claude/).
        const descriptor = this.harnessService.getActiveDescriptor();
        const subpaths = descriptor.workspaceSubpaths;
        const instrFilter = descriptor.instructionFileFilter;
        if (subpaths) {
            const projectRoot = this.workspaceService.getActiveProjectRoot();
            for (let i = items.length - 1; i >= 0; i--) {
                const item = items[i];
                if (item.storage === PromptsStorage.local && projectRoot && isEqualOrParent(item.uri, projectRoot)) {
                    if (!matchesWorkspaceSubpath(item.uri.path, subpaths)) {
                        // Keep instruction files that match the harness's native patterns
                        if (instrFilter && promptType === PromptsType.instructions && matchesInstructionFileFilter(item.uri.path, instrFilter)) {
                            continue;
                        }
                        items.splice(i, 1);
                    }
                }
            }
        }
        // Apply instruction file filter — when the active harness specifies
        // instructionFileFilter, hide instruction files that don't match the
        // recognized patterns (e.g. Claude doesn't support *.instructions.md).
        if (instrFilter && promptType === PromptsType.instructions) {
            for (let i = items.length - 1; i >= 0; i--) {
                if (!matchesInstructionFileFilter(items[i].uri.path, instrFilter)) {
                    items.splice(i, 1);
                }
            }
        }
        // Sort items by name
        items.sort((a, b) => a.name.localeCompare(b.name));
        return items;
    }
    /**
     * Fetches items from an external customization provider, converting
     * the provider's items into the list widget format.
     */
    async fetchItemsFromProvider(provider, promptType) {
        const allItems = await provider.provideChatSessionCustomizations(CancellationToken.None);
        if (!allItems) {
            return [];
        }
        const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
        // Build a URI→description lookup from promptsService for items the provider
        // doesn't supply descriptions for (e.g. skills and instructions from ChatResource).
        const descriptionsByUri = new ResourceMap();
        if (promptType === PromptsType.skill) {
            const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
            for (const s of skills ?? []) {
                if (s.description) {
                    descriptionsByUri.set(s.uri, s.description);
                }
            }
        }
        return allItems
            .filter(item => item.type === promptType)
            .map((item) => {
            const { storage, groupKey } = item.groupKey
                ? { storage: undefined, groupKey: item.groupKey }
                : this._inferStorageAndGroup(item.uri, workspaceFolders);
            return {
                id: item.uri.toString(),
                uri: item.uri,
                name: item.name,
                filename: basename(item.uri),
                description: item.description ?? descriptionsByUri.get(item.uri),
                promptType,
                disabled: item.enabled === false,
                status: item.status,
                statusMessage: item.statusMessage,
                groupKey,
                badge: item.badge,
                badgeTooltip: item.badgeTooltip,
                storage,
            };
        })
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    /**
     * Infers storage and groupKey from a URI for auto-grouping.
     *
     * - `file:` URIs under a workspace folder → storage `local` (Workspace group)
     * - `file:` URIs elsewhere (e.g. `~/.copilot/`) → storage `user` (User group)
     * - Non-file schemes (synthetic URIs, vscode-userdata:, etc.) → groupKey `builtin` (Built-in group)
     */
    _inferStorageAndGroup(uri, workspaceFolders) {
        // Non-file schemes are synthetic/built-in (includes vscode-userdata: for extension-contributed items)
        if (uri.scheme !== Schemas.file) {
            return { groupKey: BUILTIN_STORAGE };
        }
        // file: URI under a workspace folder = workspace (local)
        for (const folder of workspaceFolders) {
            if (isEqualOrParent(uri, folder.uri)) {
                return { storage: PromptsStorage.local };
            }
        }
        // file: URI elsewhere = user directory
        return { storage: PromptsStorage.user };
    }
    /**
     * Fetches local customization items and marks them as syncable, using
     * the sync provider to determine their current selection state.
     * These items appear alongside remote items with sync checkboxes.
     */
    async fetchLocalSyncableItems(promptType, syncProvider) {
        const files = await this.promptsService.listPromptFiles(promptType, CancellationToken.None);
        if (!files.length) {
            return [];
        }
        return files
            .filter(f => f.storage === PromptsStorage.local || f.storage === PromptsStorage.user)
            .map(f => ({
            id: `sync-${f.uri.toString()}`,
            uri: f.uri,
            name: this.getFriendlyName(basename(f.uri)),
            filename: basename(f.uri),
            promptType,
            disabled: false,
            storage: f.storage,
            groupKey: 'sync-local',
            syncable: true,
            synced: syncProvider.isSelected(f.uri),
        }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    /**
     * Derives a friendly name from a filename by removing extension suffixes.
     */
    getFriendlyName(filename) {
        // Remove common prompt file extensions like .instructions.md, .prompt.md, etc.
        let name = filename
            .replace(/\.instructions\.md$/i, '')
            .replace(/\.prompt\.md$/i, '')
            .replace(/\.agent\.md$/i, '')
            .replace(/\.md$/i, '');
        // Convert kebab-case or snake_case to Title Case
        name = name
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
        return name || filename;
    }
    /**
     * Filters items based on the current search query and builds grouped display entries.
     */
    /**
     * Applies the search query to items, returning matched items with highlight info.
     */
    applySearchFilter(items) {
        if (!this.searchQuery.trim()) {
            return items.map(item => ({ ...item, nameMatches: undefined, descriptionMatches: undefined }));
        }
        const query = this.searchQuery.toLowerCase();
        const matched = [];
        for (const item of items) {
            const displayName = item.displayName ?? formatDisplayName(item.name);
            const nameMatches = matchesContiguousSubString(query, displayName);
            const descriptionMatches = item.description ? matchesContiguousSubString(query, item.description) : null;
            const filenameMatches = matchesContiguousSubString(query, item.filename);
            const badgeMatches = item.badge ? matchesContiguousSubString(query, item.badge) : null;
            if (nameMatches || descriptionMatches || filenameMatches || badgeMatches) {
                matched.push({
                    ...item,
                    nameMatches: nameMatches || undefined,
                    descriptionMatches: descriptionMatches || undefined,
                });
            }
        }
        return matched;
    }
    /**
     * Builds grouped display entries from items assigned to groups.
     * Empty groups are omitted. Collapsed groups show only their header.
     */
    buildGroupedEntries(groups) {
        // Sort items within each group
        for (const group of groups) {
            group.items.sort((a, b) => a.name.localeCompare(b.name));
        }
        this.displayEntries = [];
        let isFirstGroup = true;
        for (const group of groups) {
            if (group.items.length === 0) {
                continue;
            }
            const collapsed = this.collapsedGroups.has(group.groupKey);
            this.displayEntries.push({
                type: 'group-header',
                id: `group-${group.groupKey}`,
                groupKey: group.groupKey,
                label: group.label,
                icon: group.icon,
                count: group.items.length,
                isFirst: isFirstGroup,
                description: group.description,
                collapsed,
            });
            isFirstGroup = false;
            if (!collapsed) {
                for (const item of group.items) {
                    this.displayEntries.push({ type: 'file-item', item });
                }
            }
        }
    }
    /**
     * Commits the current displayEntries to the list and updates empty state.
     */
    commitDisplayEntries() {
        this.list.splice(0, this.list.length, this.displayEntries);
        this.updateEmptyState();
    }
    /**
     * Filters and groups items from an external provider.
     * When a syncProvider is present, shows remote items + local sync items.
     * Otherwise, groups items by inferred storage/groupKey.
     */
    filterItemsForProvider(matchedItems) {
        const activeDescriptor = this.harnessService.getActiveDescriptor();
        if (activeDescriptor.syncProvider) {
            // Sync layout: remote items flat, then local items with sync checkboxes
            const remoteItems = matchedItems.filter(i => !i.syncable);
            const localItems = matchedItems.filter(i => i.syncable);
            const entries = [];
            for (const item of remoteItems.sort((a, b) => a.name.localeCompare(b.name))) {
                entries.push({ type: 'file-item', item });
            }
            if (localItems.length > 0) {
                const syncedCount = localItems.filter(i => i.synced).length;
                entries.push({
                    type: 'group-header',
                    id: 'group-sync-local',
                    groupKey: 'sync-local',
                    label: localize('localGroup', "Local"),
                    icon: Codicon.folder,
                    count: syncedCount,
                    isFirst: remoteItems.length === 0,
                    description: localize('localGroupDescription', "Local customizations available to sync to the remote agent."),
                    collapsed: false,
                });
                const sorted = localItems.sort((a, b) => {
                    if (a.synced !== b.synced) {
                        return a.synced ? -1 : 1;
                    }
                    return a.name.localeCompare(b.name);
                });
                for (const item of sorted) {
                    entries.push({ type: 'file-item', item: item.synced ? item : { ...item, disabled: true } });
                }
            }
            this.displayEntries = entries;
        }
        else {
            // Standard provider layout: group by inferred storage/groupKey
            const groups = [
                { groupKey: PromptsStorage.local, label: localize('workspaceGroup', "Workspace"), icon: workspaceIcon, description: localize('workspaceGroupDescription', "Customizations stored as files in your project folder and shared with your team via version control."), items: [] },
                { groupKey: PromptsStorage.user, label: localize('userGroup', "User"), icon: userIcon, description: localize('userGroupDescription', "Customizations stored locally on your machine in a central location. Private to you and available across all projects."), items: [] },
                { groupKey: PromptsStorage.extension, label: localize('extensionGroup', "Extensions"), icon: extensionIcon, description: localize('extensionGroupDescription', "Read-only customizations provided by installed extensions."), items: [] },
                { groupKey: BUILTIN_STORAGE, label: localize('builtinGroup', "Built-in"), icon: builtinIcon, description: localize('builtinGroupDescription', "Built-in customizations shipped with the application."), items: [] },
            ];
            for (const item of matchedItems) {
                const key = item.groupKey ?? item.storage ?? PromptsStorage.local;
                const group = groups.find(g => g.groupKey === key);
                if (group) {
                    group.items.push(item);
                }
            }
            this.buildGroupedEntries(groups);
        }
        this.commitDisplayEntries();
    }
    /**
     * Filters and groups items from the core promptsService (static harness path).
     * Instructions use semantic categories; other sections use storage-based groups.
     */
    filterItemsForCore(matchedItems) {
        const promptType = sectionToPromptType(this.currentSection);
        const visibleSources = new Set(this.workspaceService.getStorageSourceFilter(promptType).sources);
        const groups = this.currentSection === AICustomizationManagementSection.Instructions
            ? [
                { groupKey: 'agent-instructions', label: localize('agentInstructionsGroup', "Agent Instructions"), icon: instructionsIcon, description: localize('agentInstructionsGroupDescription', "Instruction files automatically loaded for all agent interactions (e.g. AGENTS.md, CLAUDE.md, copilot-instructions.md)."), items: [] },
                { groupKey: 'context-instructions', label: localize('contextInstructionsGroup', "Included Based on Context"), icon: instructionsIcon, description: localize('contextInstructionsGroupDescription', "Instructions automatically loaded when matching files are part of the context."), items: [] },
                { groupKey: 'on-demand-instructions', label: localize('onDemandInstructionsGroup', "Loaded on Demand"), icon: instructionsIcon, description: localize('onDemandInstructionsGroupDescription', "Instructions loaded only when explicitly referenced."), items: [] },
            ]
            : [
                { groupKey: PromptsStorage.local, label: localize('workspaceGroup', "Workspace"), icon: workspaceIcon, description: localize('workspaceGroupDescription', "Customizations stored as files in your project folder and shared with your team via version control."), items: [] },
                { groupKey: PromptsStorage.user, label: localize('userGroup', "User"), icon: userIcon, description: localize('userGroupDescription', "Customizations stored locally on your machine in a central location. Private to you and available across all projects."), items: [] },
                { groupKey: PromptsStorage.plugin, label: localize('pluginGroup', "Plugins"), icon: pluginIcon, description: localize('pluginGroupDescription', "Read-only customizations provided by installed plugins."), items: [] },
                { groupKey: PromptsStorage.extension, label: localize('extensionGroup', "Extensions"), icon: extensionIcon, description: localize('extensionGroupDescription', "Read-only customizations provided by installed extensions."), items: [] },
                { groupKey: BUILTIN_STORAGE, label: localize('builtinGroup', "Built-in"), icon: builtinIcon, description: localize('builtinGroupDescription', "Built-in customizations shipped with the application."), items: [] },
                { groupKey: 'agents', label: localize('agentsGroup', "Agents"), icon: agentIcon, description: localize('agentsGroupDescription', "Hooks defined in agent files."), items: [] },
            ].filter(g => g.groupKey === BUILTIN_STORAGE || g.groupKey === 'agents' || visibleSources.has(g.groupKey));
        for (const item of matchedItems) {
            const key = item.groupKey ?? item.storage ?? PromptsStorage.local;
            const group = groups.find(g => g.groupKey === key);
            if (group) {
                group.items.push(item);
            }
        }
        this.buildGroupedEntries(groups);
        this.commitDisplayEntries();
    }
    /**
     * Filters items based on the current search query and builds grouped display entries.
     */
    filterItems() {
        const matchedItems = this.applySearchFilter(this.allItems);
        const activeDescriptor = this.harnessService.getActiveDescriptor();
        if (activeDescriptor.itemProvider) {
            this.filterItemsForProvider(matchedItems);
        }
        else {
            this.filterItemsForCore(matchedItems);
        }
        return matchedItems.length;
    }
    /**
     * Toggles the collapsed state of a group.
     */
    toggleGroup(entry) {
        if (this.collapsedGroups.has(entry.groupKey)) {
            this.collapsedGroups.delete(entry.groupKey);
        }
        else {
            this.collapsedGroups.add(entry.groupKey);
        }
        this.filterItems();
    }
    updateEmptyState() {
        const hasItems = this.displayEntries.length > 0;
        if (!hasItems) {
            this.emptyStateContainer.style.display = 'flex';
            this.listContainer.style.display = 'none';
            // Update icon based on section
            this.emptyStateIcon.className = 'empty-state-icon';
            const sectionIcon = this.getSectionIcon();
            this.emptyStateIcon.classList.add(...ThemeIcon.asClassNameArray(sectionIcon));
            if (this.searchQuery.trim()) {
                // Search with no results
                this.emptyStateText.textContent = localize('noMatchingItems', "No items match '{0}'", this.searchQuery);
                this.emptyStateSubtext.textContent = localize('tryDifferentSearch', "Try a different search term");
            }
            else {
                // No items at all - show empty state with create hint
                const emptyInfo = this.getEmptyStateInfo();
                this.emptyStateText.textContent = emptyInfo.title;
                this.emptyStateSubtext.textContent = emptyInfo.description;
            }
        }
        else {
            this.emptyStateContainer.style.display = 'none';
            this.listContainer.style.display = '';
        }
    }
    getSectionIcon() {
        switch (this.currentSection) {
            case AICustomizationManagementSection.Agents:
                return agentIcon;
            case AICustomizationManagementSection.Skills:
                return skillIcon;
            case AICustomizationManagementSection.Instructions:
                return instructionsIcon;
            case AICustomizationManagementSection.Hooks:
                return hookIcon;
            case AICustomizationManagementSection.Prompts:
            default:
                return promptIcon;
        }
    }
    /**
     * Finds the plugin URI for an item URI by checking the known plugins.
     */
    findPluginUri(itemUri) {
        for (const plugin of this.agentPluginService.plugins.get()) {
            if (isEqualOrParent(itemUri, plugin.uri)) {
                return plugin.uri;
            }
        }
        return undefined;
    }
    getEmptyStateInfo() {
        switch (this.currentSection) {
            case AICustomizationManagementSection.Agents:
                return {
                    title: localize('noAgents', "No agents yet"),
                    description: localize('createFirstAgent', "Create your first custom agent to get started"),
                };
            case AICustomizationManagementSection.Skills:
                return {
                    title: localize('noSkills', "No skills yet"),
                    description: localize('createFirstSkill', "Create your first skill to extend agent capabilities"),
                };
            case AICustomizationManagementSection.Instructions:
                return {
                    title: localize('noInstructions', "No instructions yet"),
                    description: localize('createFirstInstructions', "Add instructions to teach Copilot about your codebase"),
                };
            case AICustomizationManagementSection.Hooks:
                return {
                    title: localize('noHooks', "No hooks yet"),
                    description: localize('createFirstHook', "Create hooks to execute commands at agent lifecycle events"),
                };
            case AICustomizationManagementSection.Prompts:
            default:
                return {
                    title: localize('noPrompts', "No prompts yet"),
                    description: localize('createFirstPrompt', "Create reusable prompts for common tasks"),
                };
        }
    }
    /**
     * Sets the search query programmatically.
     */
    setSearchQuery(query) {
        this.searchInput.value = query;
    }
    /**
     * Clears the search query.
     */
    clearSearch() {
        this.searchInput.value = '';
    }
    /**
     * Focuses the search input.
     */
    focusSearch() {
        this.searchInput.focus();
    }
    /**
     * Focuses the list.
     */
    focusList() {
        this.list.domFocus();
        if (this.displayEntries.length > 0) {
            this.list.setFocus([0]);
        }
    }
    /**
     * Scrolls the list so the last item is visible.
     */
    revealLastItem() {
        if (this.displayEntries.length > 0) {
            this.list.reveal(this.displayEntries.length - 1);
        }
    }
    /**
     * Layouts the widget.
     */
    layout(height, width) {
        this.element.style.height = `${height}px`;
        this.searchInput.layout();
        // Measure sibling elements to calculate the remaining space for the list.
        // When offsetHeight returns 0 the container just became visible
        // after display:none and the browser hasn't reflowed yet — defer
        // layout to the next frame so measurements are accurate.
        const searchBarHeight = this.searchAndButtonContainer.offsetHeight;
        if (searchBarHeight === 0) {
            DOM.getWindow(this.element).requestAnimationFrame(() => this.layout(height, width));
            return;
        }
        const footerHeight = this.sectionHeader.offsetHeight;
        const listHeight = Math.max(0, height - searchBarHeight - footerHeight);
        this.listContainer.style.height = `${listHeight}px`;
        this.list.layout(listHeight, width);
    }
    /**
     * Gets the total item count (before filtering).
     */
    get itemCount() {
        return this.allItems.length;
    }
    /**
     * Generates a debug report for the current section.
     */
    async generateDebugReport() {
        const activeDescriptor = this.harnessService.getActiveDescriptor();
        return generateCustomizationDebugReport(this.currentSection, this.promptsService, this.workspaceService, { allItems: this.allItems, displayEntries: this.displayEntries }, activeDescriptor);
    }
};
AICustomizationListWidget = __decorate([
    __param(0, IInstantiationService),
    __param(1, IPromptsService),
    __param(2, IContextViewService),
    __param(3, IOpenerService),
    __param(4, IContextMenuService),
    __param(5, IMenuService),
    __param(6, IContextKeyService),
    __param(7, IWorkspaceContextService),
    __param(8, ILabelService),
    __param(9, IAICustomizationWorkspaceService),
    __param(10, IClipboardService),
    __param(11, IHoverService),
    __param(12, IFileService),
    __param(13, IPathService),
    __param(14, ITelemetryService),
    __param(15, ICustomizationHarnessService),
    __param(16, IAgentPluginService),
    __param(17, ICommandService),
    __param(18, IProductService)
], AICustomizationListWidget);
export { AICustomizationListWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLHVDQUF1QyxDQUFDO0FBQy9DLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMzRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxF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