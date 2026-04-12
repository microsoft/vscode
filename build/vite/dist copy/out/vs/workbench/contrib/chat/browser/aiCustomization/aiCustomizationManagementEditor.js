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
var AICustomizationManagementEditor_1;
import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { autorun } from '../../../../../base/common/observable.js';
import { Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { localize } from '../../../../../nls.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { basename, dirname, isEqual, isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { registerColor } from '../../../../../platform/theme/common/colorRegistry.js';
import { PANEL_BORDER } from '../../../../common/theme.js';
import { AICustomizationManagementEditorInput } from './aiCustomizationManagementEditorInput.js';
import { AICustomizationListWidget } from './aiCustomizationListWidget.js';
import { McpListWidget } from './mcpListWidget.js';
import { PluginListWidget } from './pluginListWidget.js';
import { AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID, AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY, AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, AICustomizationManagementSection, BUILTIN_STORAGE, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION, CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_HARNESS, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, CONTENT_MIN_WIDTH, } from './aiCustomizationManagement.js';
import { agentIcon, instructionsIcon, promptIcon, skillIcon, hookIcon, pluginIcon } from './aiCustomizationIcons.js';
import { ChatModelsWidget } from '../chatManagement/chatModelsWidget.js';
import { PromptsType, Target } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { AGENT_MD_FILENAME } from '../../common/promptSyntax/config/promptFileLocations.js';
import { NEW_PROMPT_COMMAND_ID, NEW_INSTRUCTIONS_COMMAND_ID, NEW_AGENT_COMMAND_ID, NEW_SKILL_COMMAND_ID } from '../promptSyntax/newPromptFileActions.js';
import { showConfigureHooksQuickPick } from '../promptSyntax/hookActions.js';
import { resolveWorkspaceTargetDirectory, resolveUserTargetDirectory } from './customizationCreatorService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { getSimpleEditorOptions } from '../../../codeEditor/browser/simpleEditorOptions.js';
import { IWorkingCopyService } from '../../../../services/workingCopy/common/workingCopyService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { Action } from '../../../../../base/common/actions.js';
import { McpServerEditorInput } from '../../../mcp/browser/mcpServerEditorInput.js';
import { McpServerEditor } from '../../../mcp/browser/mcpServerEditor.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { AgentPluginEditor } from '../agentPluginEditor/agentPluginEditor.js';
import { AgentPluginEditorInput } from '../agentPluginEditor/agentPluginEditorInput.js';
import { ICustomizationHarnessService, CustomizationHarness, matchesWorkspaceSubpath } from '../../common/customizationHarnessService.js';
import { ChatConfiguration } from '../../common/constants.js';
const $ = DOM.$;
//#endregion
export const aiCustomizationManagementSashBorder = registerColor('aiCustomizationManagement.sashBorder', PANEL_BORDER, localize('aiCustomizationManagementSashBorder', "The color of the Chat Customization Management editor splitview sash border."));
class SectionItemDelegate {
    getHeight() {
        return 26;
    }
    getTemplateId() {
        return 'sectionItem';
    }
}
class SectionItemRenderer {
    constructor() {
        this.templateId = 'sectionItem';
    }
    renderTemplate(container) {
        container.classList.add('section-list-item');
        const icon = DOM.append(container, $('.section-icon'));
        const label = DOM.append(container, $('.section-label'));
        const count = DOM.append(container, $('.section-count'));
        return { container, icon, label, count };
    }
    renderElement(element, index, templateData) {
        templateData.icon.className = 'section-icon';
        templateData.icon.classList.add(...ThemeIcon.asClassNameArray(element.icon));
        templateData.label.textContent = element.label;
        if (element.count > 0) {
            templateData.count.textContent = String(element.count);
            templateData.count.style.display = '';
        }
        else {
            templateData.count.textContent = '';
            templateData.count.style.display = 'none';
        }
    }
    disposeTemplate() { }
}
//#endregion
/**
 * Editor pane for the AI Customizations Management Editor.
 * Provides a global view of all AI customizations with a sidebar for navigation
 * and a content area showing a searchable list of items.
 */
let AICustomizationManagementEditor = class AICustomizationManagementEditor extends EditorPane {
    static { AICustomizationManagementEditor_1 = this; }
    static { this.ID = AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID; }
    constructor(group, telemetryService, themeService, storageService, instantiationService, contextKeyService, openerService, commandService, workspaceService, promptsService, textModelService, configurationService, workingCopyService, fileDialogService, hoverService, modelService, quickInputService, contextMenuService, fileService, notificationService, harnessService) {
        super(AICustomizationManagementEditor_1.ID, group, telemetryService, themeService, storageService);
        this.storageService = storageService;
        this.instantiationService = instantiationService;
        this.openerService = openerService;
        this.commandService = commandService;
        this.workspaceService = workspaceService;
        this.promptsService = promptsService;
        this.textModelService = textModelService;
        this.configurationService = configurationService;
        this.workingCopyService = workingCopyService;
        this.fileDialogService = fileDialogService;
        this.hoverService = hoverService;
        this.modelService = modelService;
        this.quickInputService = quickInputService;
        this.contextMenuService = contextMenuService;
        this.fileService = fileService;
        this.notificationService = notificationService;
        this.harnessService = harnessService;
        this.editorActionButtonInProgress = false;
        this.editorModelChangeDisposables = this._register(new DisposableStore());
        this.builtinEditingSessions = new Map();
        this.viewMode = 'list';
        this.mcpDetailDisposables = this._register(new DisposableStore());
        this.pluginDetailDisposables = this._register(new DisposableStore());
        this.sections = [];
        this.allSections = [];
        this.selectedSection = AICustomizationManagementSection.Agents;
        this.editorDisposables = this._register(new DisposableStore());
        this.promptsSectionCountScheduler = this._register(new RunOnceScheduler(() => this._doRefreshAllPromptsSectionCounts(), 100));
        this._editorContentChanged = false;
        this.inEditorContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR.bindTo(contextKeyService);
        this.sectionContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.bindTo(contextKeyService);
        this.harnessContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_HARNESS.bindTo(contextKeyService);
        // Track workspace changes for embedded editor
        this._register(autorun(reader => {
            this.workspaceService.activeProjectRoot.read(reader);
            if (this.viewMode === 'editor') {
                this.currentEditingProjectRoot = this.workspaceService.getActiveProjectRoot();
            }
        }));
        this._register(toDisposable(() => {
            this.currentModelRef?.dispose();
            this.currentModelRef = undefined;
        }));
        this._register(toDisposable(() => this.disposeBuiltinEditingSessions()));
        // Build sections from the workspace service configuration
        const sectionInfo = {
            [AICustomizationManagementSection.Agents]: { label: localize('agents', "Agents"), icon: agentIcon },
            [AICustomizationManagementSection.Skills]: { label: localize('skills', "Skills"), icon: skillIcon },
            [AICustomizationManagementSection.Instructions]: { label: localize('instructions', "Instructions"), icon: instructionsIcon },
            [AICustomizationManagementSection.Prompts]: { label: localize('prompts', "Prompts"), icon: promptIcon },
            [AICustomizationManagementSection.Hooks]: { label: localize('hooks', "Hooks"), icon: hookIcon },
            [AICustomizationManagementSection.McpServers]: { label: localize('mcpServers', "MCP Servers"), icon: Codicon.server },
            [AICustomizationManagementSection.Plugins]: { label: localize('plugins', "Plugins"), icon: pluginIcon },
            [AICustomizationManagementSection.Models]: { label: localize('models', "Models"), icon: Codicon.vm },
        };
        for (const id of this.workspaceService.managementSections) {
            const info = sectionInfo[id];
            if (info) {
                this.allSections.push({ id, ...info, count: 0 });
            }
        }
        this.rebuildVisibleSections();
        // Restore selected section from storage, falling back to first available
        const savedSection = this.storageService.get(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, 0 /* StorageScope.PROFILE */);
        if (savedSection && this.sections.some(s => s.id === savedSection)) {
            this.selectedSection = savedSection;
        }
        else if (this.sections.length > 0) {
            this.selectedSection = this.sections[0].id;
        }
    }
    createEditor(parent) {
        this.editorDisposables.clear();
        this.container = DOM.append(parent, $('.ai-customization-management-editor'));
        this.createSplitView();
        this.updateStyles();
    }
    createSplitView() {
        this.splitViewContainer = DOM.append(this.container, $('.management-split-view'));
        this.sidebarContainer = $('.management-sidebar');
        this.contentContainer = $('.management-content');
        this.createSidebar();
        this.createContent();
        this.splitView = this.editorDisposables.add(new SplitView(this.splitViewContainer, {
            orientation: 1 /* Orientation.HORIZONTAL */,
            proportionalLayout: true,
        }));
        const savedWidth = this.storageService.getNumber(AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY, 0 /* StorageScope.PROFILE */, SIDEBAR_DEFAULT_WIDTH);
        // Sidebar view
        this.splitView.addView({
            onDidChange: Event.None,
            element: this.sidebarContainer,
            minimumSize: SIDEBAR_MIN_WIDTH,
            maximumSize: SIDEBAR_MAX_WIDTH,
            layout: (width, _, height) => {
                this.sidebarContainer.style.width = `${width}px`;
                if (height !== undefined) {
                    const footerHeight = this.folderPickerContainer?.offsetHeight ?? 0;
                    const listHeight = height - 8 - footerHeight;
                    this.sectionsList.layout(listHeight, width);
                }
            },
        }, savedWidth, undefined, true);
        // Content view
        this.splitView.addView({
            onDidChange: Event.None,
            element: this.contentContainer,
            minimumSize: CONTENT_MIN_WIDTH,
            maximumSize: Number.POSITIVE_INFINITY,
            layout: (width, _, height) => {
                this.contentContainer.style.width = `${width}px`;
                if (height !== undefined) {
                    this.listWidget.layout(height - 16, width - 24);
                    this.mcpListWidget?.layout(height - 16, width - 24);
                    this.pluginListWidget?.layout(height - 16, width - 24);
                    const modelsFooterHeight = this.modelsFooterElement?.offsetHeight || 80;
                    this.modelsWidget?.layout(height - 16 - modelsFooterHeight, width);
                    if (this.viewMode === 'editor' && this.embeddedEditor) {
                        const editorHeaderHeight = 50;
                        const padding = 24;
                        this.embeddedEditor.layout({ width: Math.max(0, width - padding), height: Math.max(0, height - editorHeaderHeight - padding) });
                    }
                    if (this.viewMode === 'mcpDetail' && this.embeddedMcpEditor) {
                        const backHeaderHeight = 40;
                        this.embeddedMcpEditor.layout(new DOM.Dimension(width, Math.max(0, height - backHeaderHeight)));
                    }
                    if (this.viewMode === 'pluginDetail' && this.embeddedPluginEditor) {
                        const backHeaderHeight = 40;
                        this.embeddedPluginEditor.layout(new DOM.Dimension(width, Math.max(0, height - backHeaderHeight)));
                    }
                }
            },
        }, Sizing.Distribute, undefined, true);
        // Persist sidebar width
        this.editorDisposables.add(this.splitView.onDidSashChange(() => {
            const width = this.splitView.getViewSize(0);
            this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY, width, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }));
        // Reset on double-click
        this.editorDisposables.add(this.splitView.onDidSashReset(() => {
            const totalWidth = this.splitView.getViewSize(0) + this.splitView.getViewSize(1);
            this.splitView.resizeView(0, SIDEBAR_DEFAULT_WIDTH);
            this.splitView.resizeView(1, totalWidth - SIDEBAR_DEFAULT_WIDTH);
        }));
    }
    /**
     * Whether the harness selector UI is enabled.
     * When disabled, the editor behaves as if "Local" is always selected.
     */
    get isHarnessSelectorEnabled() {
        return this.configurationService.getValue(ChatConfiguration.ChatCustomizationHarnessSelectorEnabled) !== false;
    }
    /**
     * Rebuilds the visible sections list based on the active harness's
     * `hiddenSections`. If the current selection falls into a hidden
     * section, the first visible section is selected instead.
     */
    rebuildVisibleSections() {
        let hidden;
        if (this.isHarnessSelectorEnabled) {
            const activeId = this.harnessService.activeHarness.get();
            const descriptor = this.harnessService.availableHarnesses.get().find(h => h.id === activeId);
            hidden = new Set(descriptor?.hiddenSections ?? []);
        }
        else {
            hidden = new Set(); // Local harness has no hidden sections
        }
        this.sections.length = 0;
        for (const s of this.allSections) {
            if (!hidden.has(s.id)) {
                this.sections.push(s);
            }
        }
        // Update the list widget if it exists
        if (this.sectionsList) {
            this.sectionsList.splice(0, this.sectionsList.length, this.sections);
        }
        // If the current selection is hidden, fall back to first visible
        if (!this.sections.some(s => s.id === this.selectedSection) && this.sections.length > 0) {
            this.selectSection(this.sections[0].id);
        }
        else {
            this.ensureSectionsListReflectsActiveSection();
        }
    }
    createSidebar() {
        const sidebarContent = this.sidebarContent = DOM.append(this.sidebarContainer, $('.sidebar-content'));
        // Harness dropdown (shown when multiple harnesses available)
        this.createHarnessDropdown(sidebarContent);
        // Main sections list container (takes remaining space)
        const sectionsListContainer = DOM.append(sidebarContent, $('.sidebar-sections-list'));
        this.sectionsList = this.editorDisposables.add(this.instantiationService.createInstance((WorkbenchList), 'AICustomizationManagementSections', sectionsListContainer, new SectionItemDelegate(), [new SectionItemRenderer()], {
            multipleSelectionSupport: false,
            setRowLineHeight: false,
            horizontalScrolling: false,
            accessibilityProvider: {
                getAriaLabel: (item) => item.label,
                getWidgetAriaLabel: () => localize('sectionsAriaLabel', "Chat Customization Sections"),
            },
            openOnSingleClick: true,
            identityProvider: {
                getId: (item) => item.id,
            },
        }));
        this.sectionsList.splice(0, this.sectionsList.length, this.sections);
        this.ensureSectionsListReflectsActiveSection();
        this.editorDisposables.add(this.sectionsList.onDidChangeSelection(e => {
            if (e.elements.length === 0) {
                this.ensureSectionsListReflectsActiveSection();
                return;
            }
            this.selectSection(e.elements[0].id);
        }));
        // React to harness changes — rebuild visible sections and refresh counts.
        // Also track availableHarnesses to handle agent registration/unregistration.
        this.editorDisposables.add(autorun(reader => {
            const available = this.harnessService.availableHarnesses.read(reader);
            const activeId = this.harnessService.activeHarness.read(reader);
            // If the active harness is no longer available, fall back to the default
            if (!available.some(h => h.id === activeId) && available.length > 0) {
                this.harnessService.setActiveHarness(available[0].id);
                return; // setActiveHarness will trigger another autorun cycle
            }
            this.harnessContextKey.set(activeId);
            this.rebuildVisibleSections();
            this.ensureHarnessDropdown();
            this.updateHarnessDropdown();
            this.refreshAllPromptsSectionCounts();
        }));
        // When the harness selector setting is off, lock to Local harness.
        // In Sessions (single CLI harness) the dropdown is already hidden and
        // setActiveHarness(VSCode) is a safe no-op since the CLI harness
        // remains active — filtering stays correct for that window.
        if (!this.isHarnessSelectorEnabled) {
            this.harnessService.setActiveHarness(CustomizationHarness.VSCode);
        }
        this.editorDisposables.add(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ChatConfiguration.ChatCustomizationHarnessSelectorEnabled)) {
                if (!this.isHarnessSelectorEnabled) {
                    this.harnessService.setActiveHarness(CustomizationHarness.VSCode);
                }
            }
        }));
        // Folder picker (sessions window only)
        if (this.workspaceService.isSessionsWindow) {
            this.createFolderPicker(sidebarContent);
        }
    }
    createHarnessDropdown(sidebarContent) {
        if (!this.isHarnessSelectorEnabled) {
            return;
        }
        const container = this.harnessDropdownContainer = DOM.append(sidebarContent, $('.sidebar-harness-dropdown'));
        this.harnessDropdownButton = DOM.append(container, $('button.harness-dropdown-button'));
        this.harnessDropdownButton.setAttribute('aria-label', localize('selectHarness', "Select customization target"));
        this.harnessDropdownButton.setAttribute('aria-haspopup', 'listbox');
        this.harnessDropdownIcon = DOM.append(this.harnessDropdownButton, $('span.harness-dropdown-icon'));
        this.harnessDropdownLabel = DOM.append(this.harnessDropdownButton, $('span.harness-dropdown-label'));
        DOM.append(this.harnessDropdownButton, $('span.harness-dropdown-chevron.codicon.codicon-chevron-down'));
        this.updateHarnessDropdown();
        this.editorDisposables.add(DOM.addDisposableListener(this.harnessDropdownButton, 'click', () => {
            this.showHarnessMenu();
        }));
    }
    /**
     * Lazily creates the harness dropdown if it doesn't exist but
     * multiple harnesses are now available, or hides it if only one
     * harness remains (e.g. after an extension-contributed harness is
     * unregistered).
     */
    ensureHarnessDropdown() {
        const harnesses = this.harnessService.availableHarnesses.get();
        const shouldShow = this.isHarnessSelectorEnabled && harnesses.length > 1;
        if (shouldShow && !this.harnessDropdownContainer && this.sidebarContent) {
            this.createHarnessDropdown(this.sidebarContent);
        }
        else if (!shouldShow && this.harnessDropdownContainer) {
            this.harnessDropdownContainer.remove();
            this.harnessDropdownContainer = undefined;
            this.harnessDropdownButton = undefined;
            this.harnessDropdownIcon = undefined;
            this.harnessDropdownLabel = undefined;
        }
    }
    updateHarnessDropdown() {
        if (!this.harnessDropdownContainer || !this.harnessDropdownIcon || !this.harnessDropdownLabel) {
            return;
        }
        const harnesses = this.harnessService.availableHarnesses.get();
        // Hide dropdown when only one harness is available
        this.harnessDropdownContainer.style.display = harnesses.length <= 1 ? 'none' : '';
        const activeId = this.harnessService.activeHarness.get();
        const descriptor = harnesses.find(h => h.id === activeId);
        if (descriptor) {
            this.harnessDropdownIcon.className = 'harness-dropdown-icon';
            this.harnessDropdownIcon.classList.add(...ThemeIcon.asClassNameArray(descriptor.icon));
            this.harnessDropdownLabel.textContent = descriptor.label;
        }
    }
    showHarnessMenu() {
        if (!this.harnessDropdownButton) {
            return;
        }
        const harnesses = this.harnessService.availableHarnesses.get();
        const activeId = this.harnessService.activeHarness.get();
        const actions = harnesses.map(h => {
            const action = new Action(h.id, h.label, ThemeIcon.asClassName(h.icon), true, () => {
                this.harnessService.setActiveHarness(h.id);
            });
            action.checked = h.id === activeId;
            return action;
        });
        this.contextMenuService.showContextMenu({
            getAnchor: () => this.harnessDropdownButton,
            getActions: () => actions,
            getCheckedActionsRepresentation: () => 'radio',
        });
    }
    createFolderPicker(sidebarContent) {
        const footer = this.folderPickerContainer = DOM.append(sidebarContent, $('.sidebar-folder-picker'));
        const button = DOM.append(footer, $('button.folder-picker-button'));
        button.setAttribute('aria-label', localize('browseFolder', "Browse folder"));
        const folderIcon = DOM.append(button, $(`.codicon.codicon-${Codicon.folder.id}`));
        folderIcon.classList.add('folder-picker-icon');
        this.folderPickerLabel = DOM.append(button, $('span.folder-picker-label'));
        this.folderPickerClearButton = DOM.append(footer, $('button.folder-picker-clear'));
        this.folderPickerClearButton.setAttribute('aria-label', localize('clearFolderOverride', "Reset to session folder"));
        DOM.append(this.folderPickerClearButton, $(`.codicon.codicon-${Codicon.close.id}`));
        // Clicking the main button opens the folder dialog
        this.editorDisposables.add(DOM.addDisposableListener(button, 'click', () => {
            this.browseForFolder();
        }));
        // Clear button resets to session default
        this.editorDisposables.add(DOM.addDisposableListener(this.folderPickerClearButton, 'click', () => {
            this.workspaceService.clearOverrideProjectRoot();
        }));
        // Hover showing full path
        this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), button, () => {
            const root = this.workspaceService.getActiveProjectRoot();
            return root?.fsPath ?? '';
        }));
        // Keep label and clear button in sync with the active root
        this.editorDisposables.add(autorun(reader => {
            const root = this.workspaceService.activeProjectRoot.read(reader);
            const hasOverride = this.workspaceService.hasOverrideProjectRoot.read(reader);
            this.updateFolderPickerLabel(root, hasOverride);
        }));
    }
    updateFolderPickerLabel(root, hasOverride) {
        if (this.folderPickerLabel) {
            this.folderPickerLabel.textContent = root ? basename(root) : localize('noFolder', "No folder");
        }
        if (this.folderPickerClearButton) {
            this.folderPickerClearButton.style.display = hasOverride ? '' : 'none';
        }
    }
    async browseForFolder() {
        const result = await this.fileDialogService.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            title: localize('selectFolder', "Select Folder to Explore"),
            defaultUri: this.workspaceService.getActiveProjectRoot(),
        });
        if (result?.[0]) {
            this.workspaceService.setOverrideProjectRoot(result[0]);
        }
    }
    createContent() {
        const contentInner = DOM.append(this.contentContainer, $('.content-inner'));
        // Container for prompts-based content (Agents, Skills, Instructions, Prompts)
        this.promptsContentContainer = DOM.append(contentInner, $('.prompts-content-container'));
        this.listWidget = this.editorDisposables.add(this.instantiationService.createInstance(AICustomizationListWidget));
        this.promptsContentContainer.appendChild(this.listWidget.element);
        // Handle item selection
        this.editorDisposables.add(this.listWidget.onDidSelectItem(item => {
            this.telemetryService.publicLog2('chatCustomizationEditor.itemSelected', {
                section: this.selectedSection,
                promptType: item.promptType,
                storage: item.storage ?? 'external',
            });
            const storage = item.storage;
            const isWorkspaceFile = storage === PromptsStorage.local;
            const isReadOnly = !storage || storage === PromptsStorage.extension || storage === PromptsStorage.plugin || storage === BUILTIN_STORAGE;
            this.showEmbeddedEditor(item.uri, item.name, item.promptType, storage ?? BUILTIN_STORAGE, isWorkspaceFile, isReadOnly);
        }));
        // Handle create actions - AI-guided creation
        this.editorDisposables.add(this.listWidget.onDidRequestCreate(promptType => {
            this.createNewItemWithAI(promptType);
        }));
        // Handle manual create actions - open editor directly
        this.editorDisposables.add(this.listWidget.onDidRequestCreateManual(({ type, target, rootFileName }) => {
            this.createNewItemManual(type, target, rootFileName);
        }));
        // Container for Models content (only in sessions)
        const hasSections = new Set(this.workspaceService.managementSections);
        if (hasSections.has(AICustomizationManagementSection.Models)) {
            this.modelsContentContainer = DOM.append(contentInner, $('.models-content-container'));
            this.modelsWidget = this.editorDisposables.add(this.instantiationService.createInstance(ChatModelsWidget));
            this.modelsContentContainer.appendChild(this.modelsWidget.element);
            this.modelsFooterElement = DOM.append(this.modelsContentContainer, $('.section-footer'));
            const modelsDescription = DOM.append(this.modelsFooterElement, $('p.section-footer-description'));
            modelsDescription.textContent = localize('modelsDescription', "Browse and manage language models from different providers. Select models for use in chat, code completion, and other AI features.");
            const modelsLink = DOM.append(this.modelsFooterElement, $('a.section-footer-link'));
            modelsLink.textContent = localize('learnMoreModels', "Learn more about language models");
            modelsLink.href = 'https://code.visualstudio.com/docs/copilot/customization/language-models';
            this.editorDisposables.add(DOM.addDisposableListener(modelsLink, 'click', (e) => {
                e.preventDefault();
                this.openerService.open(URI.parse(modelsLink.href));
            }));
        }
        // Container for MCP content
        if (hasSections.has(AICustomizationManagementSection.McpServers)) {
            this.mcpContentContainer = DOM.append(contentInner, $('.mcp-content-container'));
            this.mcpListWidget = this.editorDisposables.add(this.instantiationService.createInstance(McpListWidget));
            this.mcpContentContainer.appendChild(this.mcpListWidget.element);
            // Embedded MCP server detail view
            this.mcpDetailContainer = DOM.append(contentInner, $('.mcp-detail-container'));
            this.createEmbeddedMcpDetail();
            this.editorDisposables.add(this.mcpListWidget.onDidSelectServer(server => {
                this.showEmbeddedMcpDetail(server);
            }));
            this.editorDisposables.add(this.mcpListWidget.onDidRequestShowPlugin(item => {
                this.showPluginDetail(item);
            }));
        }
        // Container for Plugins content
        if (hasSections.has(AICustomizationManagementSection.Plugins)) {
            this.pluginContentContainer = DOM.append(contentInner, $('.plugin-content-container'));
            this.pluginListWidget = this.editorDisposables.add(this.instantiationService.createInstance(PluginListWidget));
            this.pluginContentContainer.appendChild(this.pluginListWidget.element);
            // Embedded plugin detail view
            this.pluginDetailContainer = DOM.append(contentInner, $('.plugin-detail-container'));
            this.createEmbeddedPluginDetail();
            this.editorDisposables.add(this.pluginListWidget.onDidSelectPlugin(item => {
                this.pluginDetailReturnSection = undefined;
                this.showEmbeddedPluginDetail(item);
            }));
        }
        // Embedded editor container
        this.editorContentContainer = DOM.append(contentInner, $('.editor-content-container'));
        this.createEmbeddedEditor();
        // Set initial visibility based on selected section
        this.updateContentVisibility();
        // Wire up section count updates — active prompts section gets its count
        // from the list widget; all prompts sections are also refreshed from
        // the prompts service on every change event for consistency.
        this.editorDisposables.add(this.listWidget.onDidChangeItemCount(count => {
            if (this.isPromptsSection(this.selectedSection)) {
                this.updateSectionCount(this.selectedSection, count);
            }
        }));
        if (this.mcpListWidget) {
            this.editorDisposables.add(this.mcpListWidget.onDidChangeItemCount(count => {
                this.updateSectionCount(AICustomizationManagementSection.McpServers, count);
            }));
            this.mcpListWidget.fireItemCount();
        }
        if (this.pluginListWidget) {
            this.editorDisposables.add(this.pluginListWidget.onDidChangeItemCount(count => {
                this.updateSectionCount(AICustomizationManagementSection.Plugins, count);
            }));
            this.pluginListWidget.fireItemCount();
        }
        if (this.modelsWidget) {
            this.editorDisposables.add(this.modelsWidget.onDidChangeItemCount(count => {
                this.updateSectionCount(AICustomizationManagementSection.Models, count);
            }));
            this.modelsWidget.fireItemCount();
        }
        // Any prompts data change → refresh ALL prompts section counts (debounced)
        this.editorDisposables.add(this.promptsService.onDidChangeCustomAgents(() => this.refreshAllPromptsSectionCounts()));
        this.editorDisposables.add(this.promptsService.onDidChangeSkills(() => this.refreshAllPromptsSectionCounts()));
        this.editorDisposables.add(this.promptsService.onDidChangeInstructions(() => this.refreshAllPromptsSectionCounts()));
        this.editorDisposables.add(this.promptsService.onDidChangeSlashCommands(() => this.refreshAllPromptsSectionCounts()));
        // Load initial counts for all sections
        this.refreshAllPromptsSectionCounts();
        // Load items for the initial section
        if (this.isPromptsSection(this.selectedSection)) {
            void this.listWidget.setSection(this.selectedSection);
        }
    }
    isPromptsSection(section) {
        return section === AICustomizationManagementSection.Agents ||
            section === AICustomizationManagementSection.Skills ||
            section === AICustomizationManagementSection.Instructions ||
            section === AICustomizationManagementSection.Prompts ||
            section === AICustomizationManagementSection.Hooks;
    }
    //#region Section Counts
    /**
     * Updates the count for a specific section and re-renders the sidebar.
     */
    updateSectionCount(sectionId, count) {
        const section = this.sections.find(s => s.id === sectionId);
        if (!section || section.count === count) {
            return;
        }
        section.count = count;
        // Re-splice the sections list to trigger re-render
        this.sectionsList.splice(0, this.sectionsList.length, this.sections);
        this.ensureSectionsListReflectsActiveSection();
    }
    /**
     * Schedules a debounced refresh of all prompts-based section counts.
     */
    refreshAllPromptsSectionCounts() {
        this.promptsSectionCountScheduler.schedule();
    }
    /**
     * Performs the actual refresh of all prompts-based section counts.
     * Uses the list widget's shared item-loading logic so sidebar counts
     * match the per-group counts shown inside each section.
     */
    _doRefreshAllPromptsSectionCounts() {
        for (const section of this.sections) {
            if (this.isPromptsSection(section.id)) {
                this.listWidget.computeItemCountForSection(section.id).then(count => {
                    this.updateSectionCount(section.id, count);
                }, onUnexpectedError);
            }
        }
    }
    //#endregion
    selectSection(section) {
        if (this.selectedSection === section) {
            this.ensureSectionsListReflectsActiveSection(section);
            return;
        }
        this.telemetryService.publicLog2('chatCustomizationEditor.sectionChanged', {
            section,
        });
        if (this.viewMode === 'editor') {
            this.goBackToList();
        }
        if (this.viewMode === 'mcpDetail') {
            this.goBackFromMcpDetail();
        }
        if (this.viewMode === 'pluginDetail') {
            this.goBackFromPluginDetail();
        }
        this.selectedSection = section;
        this.sectionContextKey.set(section);
        // Persist selection
        this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, section, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        // Update content visibility
        this.updateContentVisibility();
        // Load items for the new section (only for prompts-based sections)
        if (this.isPromptsSection(section)) {
            void this.listWidget.setSection(section);
        }
        this.ensureSectionsListReflectsActiveSection(section);
    }
    ensureSectionsListReflectsActiveSection(section = this.selectedSection) {
        if (!this.sectionsList) {
            return;
        }
        const index = this.sections.findIndex(s => s.id === section);
        if (index < 0) {
            return;
        }
        const selection = this.sectionsList.getSelection();
        if (selection.length !== 1 || selection[0] !== index) {
            this.sectionsList.setSelection([index]);
        }
        const focus = this.sectionsList.getFocus();
        if (focus.length !== 1 || focus[0] !== index) {
            this.sectionsList.setFocus([index]);
        }
    }
    updateContentVisibility() {
        const isEditorMode = this.viewMode === 'editor';
        const isMcpDetailMode = this.viewMode === 'mcpDetail';
        const isPluginDetailMode = this.viewMode === 'pluginDetail';
        const isDetailMode = isMcpDetailMode || isPluginDetailMode;
        const isPromptsSection = this.isPromptsSection(this.selectedSection);
        const isModelsSection = this.selectedSection === AICustomizationManagementSection.Models;
        const isMcpSection = this.selectedSection === AICustomizationManagementSection.McpServers;
        const isPluginsSection = this.selectedSection === AICustomizationManagementSection.Plugins;
        if (this.promptsContentContainer) {
            this.promptsContentContainer.style.display = !isEditorMode && !isDetailMode && isPromptsSection ? '' : 'none';
        }
        if (this.modelsContentContainer) {
            this.modelsContentContainer.style.display = !isEditorMode && !isDetailMode && isModelsSection ? '' : 'none';
        }
        if (this.mcpContentContainer) {
            this.mcpContentContainer.style.display = !isEditorMode && !isDetailMode && isMcpSection ? '' : 'none';
        }
        if (this.mcpDetailContainer) {
            this.mcpDetailContainer.style.display = isMcpDetailMode ? '' : 'none';
        }
        if (this.pluginContentContainer) {
            this.pluginContentContainer.style.display = !isEditorMode && !isDetailMode && isPluginsSection ? '' : 'none';
        }
        if (this.pluginDetailContainer) {
            this.pluginDetailContainer.style.display = isPluginDetailMode ? '' : 'none';
        }
        if (this.editorContentContainer) {
            this.editorContentContainer.style.display = isEditorMode ? '' : 'none';
        }
        // Render and layout models widget when switching to it
        if (isModelsSection && this.modelsWidget) {
            this.modelsWidget.render();
            if (this.dimension) {
                this.layout(this.dimension);
            }
        }
    }
    /**
     * Creates a new customization using the AI-guided flow.
     */
    async createNewItemWithAI(type) {
        this.telemetryService.publicLog2('chatCustomizationEditor.createItem', {
            section: this.selectedSection,
            promptType: type,
            creationMode: 'ai',
            target: 'workspace',
        });
        if (this.input) {
            this.group.closeEditor(this.input);
        }
        await this.workspaceService.generateCustomization(type);
    }
    /**
     * Creates a new prompt file and opens it in the embedded editor.
     */
    async createNewItemManual(type, target, rootFileName) {
        this.telemetryService.publicLog2('chatCustomizationEditor.createItem', {
            section: this.selectedSection,
            promptType: type,
            creationMode: 'manual',
            target: target === 'workspace-root' ? 'workspace' : target,
        });
        // Handle workspace-root files (e.g. AGENTS.md or CLAUDE.md at project root).
        // rootFileName is passed from rootFileShortcuts; falls back to
        // the section override's rootFile, then AGENTS.md as the default.
        if (target === 'workspace-root') {
            const projectRoot = this.workspaceService.getActiveProjectRoot();
            if (!projectRoot) {
                return;
            }
            const override = this.harnessService.getActiveDescriptor().sectionOverrides?.get(this.selectedSection);
            const fileName = rootFileName ?? override?.rootFile ?? AGENT_MD_FILENAME;
            const fileUri = URI.joinPath(projectRoot, fileName);
            if (await this.fileService.exists(fileUri)) {
                // File already exists — just open it
                await this.showEmbeddedEditor(fileUri, fileName, PromptsType.instructions, PromptsStorage.local, true);
            }
            else {
                await this.fileService.createFile(fileUri);
                await this.showEmbeddedEditor(fileUri, fileName, PromptsType.instructions, PromptsStorage.local, true);
            }
            void this.listWidget.refresh();
            return;
        }
        if (type === PromptsType.hook) {
            if (this.workspaceService.isSessionsWindow) {
                // Sessions: show hooks filtered to Copilot CLI (GitHub Copilot) hook types
                await this.instantiationService.invokeFunction(showConfigureHooksQuickPick, {
                    openEditor: async (resource) => {
                        await this.showEmbeddedEditor(resource, basename(resource), PromptsType.hook, PromptsStorage.local, true);
                        return;
                    },
                    target: Target.GitHubCopilot,
                });
            }
            else {
                // Core: use the default core behaviour
                await this.instantiationService.invokeFunction(showConfigureHooksQuickPick, {
                    openEditor: async (resource) => {
                        await this.showEmbeddedEditor(resource, basename(resource), PromptsType.hook, PromptsStorage.local, true);
                        return;
                    }
                });
            }
            return;
        }
        const targetDir = await this.resolveTargetDirectoryWithPicker(type, target);
        if (targetDir === null) {
            return; // User cancelled the picker
        }
        // targetDir may be undefined when no matching folder exists for the
        // requested storage type (e.g. skills have no user-storage folder).
        // Pass it through — the command handles undefined by showing its own
        // folder picker via askForPromptSourceFolder.
        // When the active harness overrides the file extension (e.g. Claude
        // rules use .md instead of .instructions.md), pass it through so the
        // name picker and file creation use the correct extension.
        const override = this.harnessService.getActiveDescriptor().sectionOverrides?.get(this.selectedSection);
        const options = {
            targetFolder: targetDir,
            targetStorage: target === 'user' ? PromptsStorage.user : PromptsStorage.local,
            fileExtension: override?.fileExtension,
            openFile: async (uri) => {
                const isWorkspace = target === 'workspace';
                await this.showEmbeddedEditor(uri, basename(uri), type, target === 'user' ? PromptsStorage.user : PromptsStorage.local, isWorkspace);
                return this.embeddedEditor;
            },
        };
        let commandId;
        switch (type) {
            case PromptsType.prompt:
                commandId = NEW_PROMPT_COMMAND_ID;
                break;
            case PromptsType.instructions:
                commandId = NEW_INSTRUCTIONS_COMMAND_ID;
                break;
            case PromptsType.agent:
                commandId = NEW_AGENT_COMMAND_ID;
                break;
            case PromptsType.skill:
                commandId = NEW_SKILL_COMMAND_ID;
                break;
            default: return;
        }
        await this.commandService.executeCommand(commandId, options);
        void this.listWidget.refresh();
    }
    /**
     * Resolves the target directory for creating a new customization file.
     * If multiple source folders exist for the given storage type, shows a
     * picker to let the user choose. Otherwise, returns the single match.
     *
     * @returns the resolved URI, `undefined` when no folder is available,
     *          or `null` when the user cancelled the picker.
     */
    async resolveTargetDirectoryWithPicker(type, target) {
        const allFolders = await this.promptsService.getSourceFolders(type);
        const projectRoot = this.workspaceService.getActiveProjectRoot();
        const descriptor = this.harnessService.getActiveDescriptor();
        const subpaths = descriptor.workspaceSubpaths;
        // Partition folders by whether they're under the active project root.
        // The storage tags from getSourceFolders() are unreliable (tilde-expanded
        // user paths like ~/.copilot/skills get tagged PromptsStorage.local),
        // so we use the project root as the authoritative boundary.
        let matchingFolders;
        if (target === 'workspace') {
            matchingFolders = projectRoot
                ? allFolders.filter(f => {
                    if (!isEqualOrParent(f.uri, projectRoot)) {
                        return false;
                    }
                    // When the active harness specifies workspaceSubpaths, only offer
                    // directories whose path includes one of those sub-paths.
                    if (subpaths) {
                        return matchesWorkspaceSubpath(f.uri.path, subpaths);
                    }
                    return true;
                })
                : [];
        }
        else {
            matchingFolders = projectRoot
                ? allFolders.filter(f => !isEqualOrParent(f.uri, projectRoot))
                : allFolders;
            // When the active harness restricts user roots, only offer
            // directories under the harness-accessible user roots
            // (e.g. Claude → ~/.claude only, not ~/.copilot or profile paths).
            const filter = this.harnessService.getStorageSourceFilter(type);
            if (filter.includedUserFileRoots) {
                const roots = filter.includedUserFileRoots;
                matchingFolders = matchingFolders.filter(f => roots.some(root => isEqualOrParent(f.uri, root)));
            }
        }
        // Deduplicate by URI (getSourceFolders may return the same path
        // from both config-based discovery and the AgenticPromptsService override)
        const seen = new Set();
        matchingFolders = matchingFolders.filter(f => {
            const key = f.uri.toString();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
        if (matchingFolders.length === 0) {
            // No matching folders — return undefined so the command can fall
            // back to askForPromptSourceFolder (not null which means cancellation)
            return undefined;
        }
        if (matchingFolders.length === 1) {
            return matchingFolders[0].uri;
        }
        // Multiple directories — ask the user which one to use
        const items = matchingFolders.map(folder => ({
            label: this.promptsService.getPromptLocationLabel(folder),
            description: folder.uri.fsPath,
            uri: folder.uri,
        }));
        const picked = await this.quickInputService.pick(items, {
            placeHolder: localize('selectTargetDirectory', "Select a directory for the new customization file"),
        });
        return picked?.uri ?? null;
    }
    updateStyles() {
        const borderColor = this.theme.getColor(aiCustomizationManagementSashBorder);
        if (borderColor) {
            this.splitView?.style({ separatorBorder: borderColor });
        }
    }
    async setInput(input, options, context, token) {
        // On (re)open, clear any override so the root comes from the default source
        this.workspaceService.clearOverrideProjectRoot();
        this.inEditorContextKey.set(true);
        this.sectionContextKey.set(this.selectedSection);
        input.setSaveHandler(() => this.handleBuiltinSave());
        this.telemetryService.publicLog2('chatCustomizationEditor.opened', {
            section: this.selectedSection,
        });
        await super.setInput(input, options, context, token);
        if (this.dimension) {
            this.layout(this.dimension);
        }
    }
    clearInput() {
        const input = this.input;
        if (input instanceof AICustomizationManagementEditorInput) {
            input.setSaveHandler(undefined);
            input.setDirty(false);
        }
        this.inEditorContextKey.set(false);
        if (this.viewMode === 'editor') {
            this.goBackToList();
        }
        if (this.viewMode === 'mcpDetail') {
            this.goBackFromMcpDetail();
        }
        if (this.viewMode === 'pluginDetail') {
            this.goBackFromPluginDetail();
        }
        // Clear transient folder override on close
        this.workspaceService.clearOverrideProjectRoot();
        this.disposeBuiltinEditingSessions();
        super.clearInput();
    }
    layout(dimension) {
        this.dimension = dimension;
        if (this.container && this.splitView) {
            this.splitViewContainer.style.height = `${dimension.height}px`;
            this.splitView.layout(dimension.width, dimension.height);
        }
    }
    focus() {
        super.focus();
        if (this.viewMode === 'editor') {
            this.embeddedEditor?.focus();
            return;
        }
        if (this.selectedSection === AICustomizationManagementSection.McpServers) {
            this.mcpListWidget?.focusSearch();
        }
        else if (this.selectedSection === AICustomizationManagementSection.Plugins) {
            this.pluginListWidget?.focusSearch();
        }
        else if (this.selectedSection === AICustomizationManagementSection.Models) {
            this.modelsWidget?.focusSearch();
        }
        else {
            this.listWidget?.focusSearch();
        }
    }
    /**
     * Selects a specific section programmatically.
     */
    selectSectionById(sectionId) {
        const index = this.sections.findIndex(s => s.id === sectionId);
        if (index >= 0) {
            // Directly update state and UI, bypassing the early-return guard in selectSection
            // to handle the case where the editor just opened with a persisted section that
            // matches the requested one (content might not be loaded yet).
            if (this.viewMode === 'editor') {
                this.goBackToList();
            }
            if (this.viewMode === 'mcpDetail') {
                this.goBackFromMcpDetail();
            }
            if (this.viewMode === 'pluginDetail') {
                this.goBackFromPluginDetail();
            }
            this.selectedSection = sectionId;
            this.sectionContextKey.set(sectionId);
            this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, sectionId, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            this.updateContentVisibility();
            if (this.isPromptsSection(sectionId)) {
                void this.listWidget.setSection(sectionId);
            }
            // Re-layout after visibility change so the newly-visible widget
            // can measure its flex-computed container height correctly.
            if (this.dimension) {
                this.layout(this.dimension);
            }
            this.ensureSectionsListReflectsActiveSection(sectionId);
        }
    }
    /**
     * Refreshes the list widget.
     */
    refreshList() {
        void this.listWidget.refresh();
    }
    /**
     * Scrolls the active list widget so the last item is visible.
     */
    revealLastItem() {
        if (this.selectedSection === AICustomizationManagementSection.McpServers) {
            this.mcpListWidget?.revealLastItem();
        }
        else if (this.selectedSection === AICustomizationManagementSection.Plugins) {
            this.pluginListWidget?.revealLastItem();
        }
        else {
            this.listWidget.revealLastItem();
        }
    }
    /**
     * Generates a debug report for the current section.
     */
    async generateDebugReport() {
        return this.listWidget.generateDebugReport();
    }
    //#region Embedded Editor
    createEmbeddedEditor() {
        if (!this.editorContentContainer) {
            return;
        }
        const editorHeader = DOM.append(this.editorContentContainer, $('.editor-header'));
        this.editorActionButton = DOM.append(editorHeader, $('button.editor-back-button'));
        this.editorActionButton.setAttribute('aria-label', localize('backToList', "Back to list"));
        this.editorActionButtonIcon = DOM.append(this.editorActionButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}.editor-action-button-icon`));
        this.editorActionButtonIcon.setAttribute('aria-hidden', 'true');
        this.editorDisposables.add(DOM.addDisposableListener(this.editorActionButton, 'click', () => {
            void this.handleEditorActionButton().catch(error => {
                console.error('Failed to handle editor back action:', error);
                this.notificationService.error(localize('editorActionButtonFailed', "Failed to finish the prompt action."));
            });
        }));
        const itemInfo = DOM.append(editorHeader, $('.editor-item-info'));
        this.editorItemNameElement = DOM.append(itemInfo, $('.editor-item-name'));
        this.editorItemPathElement = DOM.append(itemInfo, $('.editor-item-path'));
        this.editorSaveIndicator = DOM.append(editorHeader, $('.editor-save-indicator'));
        const embeddedEditorContainer = DOM.append(this.editorContentContainer, $('.embedded-editor-container'));
        const overflowWidgetsDomNode = DOM.append(this.editorContentContainer, $('.embedded-editor-overflow-widgets.monaco-editor'));
        this.editorDisposables.add(toDisposable(() => overflowWidgetsDomNode.remove()));
        this.embeddedEditor = this.editorDisposables.add(this.instantiationService.createInstance(CodeEditorWidget, embeddedEditorContainer, {
            ...getSimpleEditorOptions(this.configurationService),
            readOnly: false,
            minimap: { enabled: false },
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: false,
            folding: true,
            renderLineHighlight: 'all',
            scrollbar: { vertical: 'auto', horizontal: 'auto' },
            overflowWidgetsDomNode,
        }, { isSimpleWidget: false }));
    }
    async showEmbeddedEditor(uri, displayName, promptType, storage, isWorkspaceFile = false, isReadOnly = false) {
        this.currentModelRef?.dispose();
        this.currentModelRef = undefined;
        this.editorModelChangeDisposables.clear();
        this.currentEditingUri = uri;
        this.currentEditingProjectRoot = isWorkspaceFile ? this.workspaceService.getActiveProjectRoot() : undefined;
        this.currentEditingStorage = storage;
        this.currentEditingPromptType = promptType;
        this.viewMode = 'editor';
        this.editorItemNameElement.textContent = displayName;
        this.editorItemPathElement.textContent = basename(uri);
        this._editorContentChanged = false;
        this.resetEditorSaveIndicator();
        this.updateEditorActionButton();
        this.updateContentVisibility();
        try {
            if (storage === BUILTIN_STORAGE && (promptType === PromptsType.prompt || promptType === PromptsType.skill)) {
                const session = await this.getOrCreateBuiltinEditingSession(uri);
                if (!isEqual(this.currentEditingUri, uri)) {
                    return;
                }
                this.embeddedEditor.setModel(session.model);
                this.embeddedEditor.updateOptions({ readOnly: false });
                this._editorContentChanged = session.model.getValue() !== session.originalContent;
                this.updateEditorActionButton();
                if (this.dimension) {
                    this.layout(this.dimension);
                }
                this.embeddedEditor.focus();
                this.editorModelChangeDisposables.add(session.model.onDidChangeContent(() => {
                    this._editorContentChanged = session.model.getValue() !== session.originalContent;
                    this.updateEditorActionButton();
                }));
                return;
            }
            const ref = await this.textModelService.createModelReference(uri);
            if (!isEqual(this.currentEditingUri, uri)) {
                ref.dispose();
                return; // another item was selected while loading
            }
            this.currentModelRef = ref;
            this.embeddedEditor.setModel(ref.object.textEditorModel);
            this.embeddedEditor.updateOptions({ readOnly: isReadOnly });
            if (this.dimension) {
                this.layout(this.dimension);
            }
            this.embeddedEditor.focus();
            this._editorContentChanged = this.workingCopyService.isDirty(uri);
            this.editorModelChangeDisposables.add(ref.object.textEditorModel.onDidChangeContent(() => {
                this._editorContentChanged = true;
                this.resetEditorSaveIndicator();
            }));
            this.editorModelChangeDisposables.add(this.workingCopyService.onDidSave(e => {
                if (isEqual(e.workingCopy.resource, uri)) {
                    this._editorContentChanged = this.workingCopyService.isDirty(uri);
                    this.editorSaveIndicator.className = 'editor-save-indicator visible saved';
                    this.editorSaveIndicator.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
                    this.editorSaveIndicator.title = localize('saved', "Saved");
                }
            }));
        }
        catch (error) {
            console.error('Failed to load model for embedded editor:', error);
            if (isEqual(this.currentEditingUri, uri)) {
                this.goBackToList();
            }
        }
    }
    goBackToList() {
        const fileUri = this.currentEditingUri;
        const backgroundSaveRequest = this.createExistingCustomizationSaveRequest();
        if (backgroundSaveRequest) {
            this.telemetryService.publicLog2('chatCustomizationEditor.saveItem', {
                promptType: this.currentEditingPromptType ?? '',
                storage: String(this.currentEditingStorage ?? ''),
                saveTarget: 'existing',
            });
        }
        if (fileUri && this.currentEditingStorage === BUILTIN_STORAGE) {
            this.disposeBuiltinEditingSession(fileUri);
        }
        this.currentModelRef?.dispose();
        this.currentModelRef = undefined;
        this.currentEditingUri = undefined;
        this.currentEditingProjectRoot = undefined;
        this.currentEditingStorage = undefined;
        this.currentEditingPromptType = undefined;
        this._editorContentChanged = false;
        this.editorModelChangeDisposables.clear();
        this.resetEditorSaveIndicator();
        this.updateEditorActionButton();
        this.embeddedEditor?.setModel(null);
        this.viewMode = 'list';
        this.updateContentVisibility();
        // Refresh the list to pick up newly created/edited files
        void this.listWidget?.refresh();
        if (this.dimension) {
            this.layout(this.dimension);
        }
        this.listWidget?.focusSearch();
        if (backgroundSaveRequest) {
            const saveRequest = backgroundSaveRequest;
            void this.saveExistingCustomization(saveRequest).catch(error => {
                console.error('Failed to save customization changes on exit:', error);
                this.notificationService.warn(localize('saveCustomizationOnExitFailed', "Could not save changes to {0}.", basename(saveRequest.fileUri)));
            });
        }
    }
    //#endregion
    async getOrCreateBuiltinEditingSession(uri) {
        const key = uri.toString();
        const existing = this.builtinEditingSessions.get(key);
        if (existing && !existing.model.isDisposed()) {
            return existing;
        }
        const ref = await this.textModelService.createModelReference(uri);
        try {
            const session = {
                model: this.modelService.createModel(createTextBufferFactoryFromSnapshot(ref.object.textEditorModel.createSnapshot()), { languageId: ref.object.textEditorModel.getLanguageId(), onDidChange: Event.None }, URI.from({ scheme: 'ai-customization-builtin', path: uri.path, query: generateUuid() }), false),
                originalContent: ref.object.textEditorModel.getValue(),
            };
            this.builtinEditingSessions.set(key, session);
            return session;
        }
        finally {
            ref.dispose();
        }
    }
    createBuiltinPromptSaveRequest(target) {
        const sourceUri = this.currentEditingUri;
        const promptType = this.currentEditingPromptType;
        if (!sourceUri || this.currentEditingStorage !== BUILTIN_STORAGE || (promptType !== PromptsType.prompt && promptType !== PromptsType.skill) || !target.folder || target.target === 'cancel') {
            return;
        }
        const session = this.builtinEditingSessions.get(sourceUri.toString());
        if (!session || !this._editorContentChanged) {
            return;
        }
        return {
            target: target.target,
            folder: target.folder,
            sourceUri,
            content: session.model.getValue(),
            promptType,
            projectRoot: target.target === 'workspace' ? this.workspaceService.getActiveProjectRoot() : undefined,
        };
    }
    createExistingCustomizationSaveRequest() {
        if (!this._editorContentChanged || this.currentEditingStorage === BUILTIN_STORAGE || !this.currentEditingUri) {
            return undefined;
        }
        const model = this.currentModelRef?.object.textEditorModel;
        if (!model) {
            return undefined;
        }
        return {
            fileUri: this.currentEditingUri,
            content: model.getValue(),
            projectRoot: this.currentEditingProjectRoot,
        };
    }
    async saveBuiltinPromptCopy(request) {
        let targetUri;
        if (request.promptType === PromptsType.skill) {
            // Skills use {skillName}/SKILL.md directory structure
            const skillFolderName = basename(dirname(request.sourceUri));
            targetUri = URI.joinPath(request.folder, skillFolderName, basename(request.sourceUri));
        }
        else {
            targetUri = URI.joinPath(request.folder, basename(request.sourceUri));
        }
        await this.fileService.createFolder(dirname(targetUri));
        await this.fileService.writeFile(targetUri, VSBuffer.fromString(request.content));
        if (request.target === 'workspace' && request.projectRoot) {
            await this.workspaceService.commitFiles(request.projectRoot, [targetUri]);
        }
    }
    async saveExistingCustomization(request) {
        await this.fileService.writeFile(request.fileUri, VSBuffer.fromString(request.content));
        if (request.projectRoot) {
            await this.workspaceService.commitFiles(request.projectRoot, [request.fileUri]);
        }
    }
    async pickBuiltinPromptSaveTarget() {
        const items = [];
        const promptType = this.currentEditingPromptType ?? PromptsType.prompt;
        const workspaceFolder = resolveWorkspaceTargetDirectory(this.workspaceService, promptType);
        if (workspaceFolder) {
            items.push({
                label: localize('workspaceSaveTarget', "Workspace"),
                description: workspaceFolder.fsPath,
                target: 'workspace',
                folder: workspaceFolder,
            });
        }
        const userFolder = await resolveUserTargetDirectory(this.promptsService, promptType);
        if (userFolder) {
            items.push({
                label: localize('userSaveTarget', "User"),
                description: userFolder.fsPath,
                target: 'user',
                folder: userFolder,
            });
        }
        items.push({
            label: localize('cancelSaveTarget', "Cancel"),
            target: 'cancel',
        });
        return this.quickInputService.pick(items, {
            canPickMany: false,
            placeHolder: localize('saveBuiltinCopyPlaceholder', "Select Workspace, User, or Cancel"),
            matchOnDescription: true,
        });
    }
    async handleEditorActionButton() {
        if (this.editorActionButtonInProgress) {
            return;
        }
        this.editorActionButtonInProgress = true;
        this.updateEditorActionButton();
        let backgroundSaveRequest;
        try {
            if (this.shouldShowBuiltinSaveAction()) {
                const selection = await this.pickBuiltinPromptSaveTarget();
                if (!selection || selection.target === 'cancel') {
                    return;
                }
                backgroundSaveRequest = this.createBuiltinPromptSaveRequest(selection);
                if (backgroundSaveRequest) {
                    this.telemetryService.publicLog2('chatCustomizationEditor.saveItem', {
                        promptType: this.currentEditingPromptType ?? '',
                        storage: String(this.currentEditingStorage ?? ''),
                        saveTarget: selection.target,
                    });
                }
            }
            this.goBackToList();
            if (backgroundSaveRequest) {
                const saveRequest = backgroundSaveRequest;
                void this.saveBuiltinPromptCopy(saveRequest).then(() => {
                    void this.listWidget?.refresh();
                }, error => {
                    console.error('Failed to save built-in override:', error);
                    this.notificationService.warn(saveRequest.target === 'workspace'
                        ? localize('saveBuiltinCopyFailedWorkspace', "Could not save the override to the workspace.")
                        : localize('saveBuiltinCopyFailedUser', "Could not save the override to your user folder."));
                });
            }
        }
        finally {
            this.editorActionButtonInProgress = false;
            this.updateEditorActionButton();
        }
    }
    updateEditorActionButton() {
        this.updateInputDirtyState();
        if (!this.editorActionButton || !this.editorActionButtonIcon) {
            return;
        }
        const shouldShowBuiltinSaveAction = this.shouldShowBuiltinSaveAction();
        this.editorActionButtonIcon.className = `codicon codicon-${shouldShowBuiltinSaveAction ? Codicon.save.id : Codicon.arrowLeft.id} editor-action-button-icon`;
        this.editorActionButton.disabled = this.editorActionButtonInProgress;
        this.editorActionButton.setAttribute('aria-label', shouldShowBuiltinSaveAction
            ? localize('saveBuiltinCopyAndChooseLocation', "Save override")
            : localize('backToList', "Back to list"));
        this.editorActionButton.title = shouldShowBuiltinSaveAction
            ? localize('saveBuiltinCopyAndChooseLocationTooltip', "Save override (choose Workspace, User, or Cancel)")
            : localize('backToList', "Back to list");
    }
    shouldShowBuiltinSaveAction() {
        return this._editorContentChanged
            && this.currentEditingStorage === BUILTIN_STORAGE
            && (this.currentEditingPromptType === PromptsType.prompt || this.currentEditingPromptType === PromptsType.skill);
    }
    updateInputDirtyState() {
        const input = this.input;
        if (input instanceof AICustomizationManagementEditorInput) {
            input.setDirty(this.shouldShowBuiltinSaveAction());
        }
    }
    async handleBuiltinSave() {
        if (!this.shouldShowBuiltinSaveAction()) {
            return false;
        }
        const target = await this.pickBuiltinPromptSaveTarget();
        if (!target || target.target === 'cancel') {
            return false;
        }
        const saveRequest = this.createBuiltinPromptSaveRequest(target);
        if (!saveRequest) {
            return false;
        }
        try {
            await this.saveBuiltinPromptCopy(saveRequest);
            this.telemetryService.publicLog2('chatCustomizationEditor.saveItem', {
                promptType: this.currentEditingPromptType ?? '',
                storage: String(this.currentEditingStorage ?? ''),
                saveTarget: target.target,
            });
            this._editorContentChanged = false;
            this.updateEditorActionButton();
            return true;
        }
        catch (error) {
            console.error('Failed to save built-in override:', error);
            this.notificationService.warn(target.target === 'workspace'
                ? localize('saveBuiltinCopyFailedWorkspace', "Could not save the override to the workspace.")
                : localize('saveBuiltinCopyFailedUser', "Could not save the override to your user folder."));
            return false;
        }
    }
    resetEditorSaveIndicator() {
        this.editorSaveIndicator.className = 'editor-save-indicator';
        this.editorSaveIndicator.title = '';
    }
    disposeBuiltinEditingSessions() {
        for (const session of this.builtinEditingSessions.values()) {
            session.model.dispose();
        }
        this.builtinEditingSessions.clear();
    }
    disposeBuiltinEditingSession(uri) {
        const key = uri.toString();
        const session = this.builtinEditingSessions.get(key);
        if (!session) {
            return;
        }
        session.model.dispose();
        this.builtinEditingSessions.delete(key);
    }
    //#region Embedded MCP Server Detail
    createEmbeddedMcpDetail() {
        if (!this.mcpDetailContainer) {
            return;
        }
        // Back button header
        const detailHeader = DOM.append(this.mcpDetailContainer, $('.editor-header'));
        const backButton = DOM.append(detailHeader, $('button.editor-back-button'));
        backButton.setAttribute('aria-label', localize('backToMcpList', "Back to MCP servers"));
        const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
        backIconEl.setAttribute('aria-hidden', 'true');
        this.editorDisposables.add(DOM.addDisposableListener(backButton, 'click', () => {
            this.goBackFromMcpDetail();
        }));
        // Container for the MCP server editor
        const editorContainer = DOM.append(this.mcpDetailContainer, $('.mcp-detail-editor-container'));
        // Create the embedded MCP server editor pane
        this.embeddedMcpEditor = this.editorDisposables.add(this.instantiationService.createInstance(McpServerEditor, this.group));
        this.embeddedMcpEditor.create(editorContainer);
    }
    async showEmbeddedMcpDetail(server) {
        if (!this.embeddedMcpEditor) {
            return;
        }
        this.viewMode = 'mcpDetail';
        this.updateContentVisibility();
        const input = this.instantiationService.createInstance(McpServerEditorInput, server);
        this.mcpDetailDisposables.clear();
        this.mcpDetailDisposables.add(input);
        try {
            await this.embeddedMcpEditor.setInput(input, undefined, {}, CancellationToken.None);
        }
        catch {
            this.goBackFromMcpDetail();
            return;
        }
        if (this.dimension) {
            this.layout(this.dimension);
        }
    }
    goBackFromMcpDetail() {
        this.mcpDetailDisposables.clear();
        this.embeddedMcpEditor?.clearInput();
        this.viewMode = 'list';
        this.updateContentVisibility();
        if (this.dimension) {
            this.layout(this.dimension);
        }
        this.mcpListWidget?.focusSearch();
    }
    //#endregion
    //#region Embedded Plugin Detail
    createEmbeddedPluginDetail() {
        if (!this.pluginDetailContainer) {
            return;
        }
        // Back button header
        const detailHeader = DOM.append(this.pluginDetailContainer, $('.editor-header'));
        const backButton = DOM.append(detailHeader, $('button.editor-back-button'));
        backButton.setAttribute('aria-label', localize('backToPluginList', "Back to plugins"));
        const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
        backIconEl.setAttribute('aria-hidden', 'true');
        this.editorDisposables.add(DOM.addDisposableListener(backButton, 'click', () => {
            this.goBackFromPluginDetail();
        }));
        // Container for the plugin editor
        const editorContainer = DOM.append(this.pluginDetailContainer, $('.plugin-detail-editor-container'));
        // Create the embedded plugin editor pane
        this.embeddedPluginEditor = this.editorDisposables.add(this.instantiationService.createInstance(AgentPluginEditor, this.group));
        this.embeddedPluginEditor.create(editorContainer);
    }
    async showEmbeddedPluginDetail(item) {
        if (!this.embeddedPluginEditor) {
            return;
        }
        this.viewMode = 'pluginDetail';
        this.updateContentVisibility();
        const input = new AgentPluginEditorInput(item);
        this.pluginDetailDisposables.clear();
        this.pluginDetailDisposables.add(input);
        try {
            await this.embeddedPluginEditor.setInput(input, undefined, {}, CancellationToken.None);
        }
        catch {
            this.goBackFromPluginDetail();
            return;
        }
        if (this.dimension) {
            this.layout(this.dimension);
        }
    }
    /**
     * Public method to show a plugin detail from any section (e.g. from "Show Plugin" context menu).
     * Saves the current section so the back button returns the user to it.
     */
    async showPluginDetail(item) {
        if (this.selectedSection !== AICustomizationManagementSection.Plugins) {
            this.pluginDetailReturnSection = this.selectedSection;
        }
        await this.showEmbeddedPluginDetail(item);
    }
    goBackFromPluginDetail() {
        this.pluginDetailDisposables.clear();
        this.embeddedPluginEditor?.clearInput();
        const returnSection = this.pluginDetailReturnSection;
        this.pluginDetailReturnSection = undefined;
        if (returnSection) {
            // Return to the section the user was on before opening the plugin detail.
            // selectSection may early-return when the section hasn't changed, so always
            // ensure viewMode and content visibility are updated.
            this.viewMode = 'list';
            this.updateContentVisibility();
            this.selectSection(returnSection);
        }
        else {
            this.viewMode = 'list';
            this.updateContentVisibility();
            this.pluginListWidget?.focusSearch();
        }
        if (this.dimension) {
            this.layout(this.dimension);
        }
    }
};
AICustomizationManagementEditor = AICustomizationManagementEditor_1 = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IStorageService),
    __param(4, IInstantiationService),
    __param(5, IContextKeyService),
    __param(6, IOpenerService),
    __param(7, ICommandService),
    __param(8, IAICustomizationWorkspaceService),
    __param(9, IPromptsService),
    __param(10, ITextModelService),
    __param(11, IConfigurationService),
    __param(12, IWorkingCopyService),
    __param(13, IFileDialogService),
    __param(14, IHoverService),
    __param(15, IModelService),
    __param(16, IQuickInputService),
    __param(17, IContextMenuService),
    __param(18, IFileService),
    __param(19, INotificationService),
    __param(20, ICustomizationHarnessService)
], AICustomizationManagementEditor);
export { AICustomizationManagementEditor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyx1Q0FBdUMsQ0FBQztBQUMvQyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZUFBZSxFQUFjLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkUsT0FBTyxFQUFlLE1BQU0sRUFBRSxTQUFTLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN2RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sbURBQW1ELENBQUM7QUFDakgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDMUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFz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