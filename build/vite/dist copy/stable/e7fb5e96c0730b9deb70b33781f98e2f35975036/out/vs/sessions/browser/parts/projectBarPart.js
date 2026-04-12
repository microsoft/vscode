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
import './media/projectBarPart.css';
import { Part } from '../../../workbench/browser/part.js';
import { IWorkbenchLayoutService } from '../../../workbench/services/layout/browser/layoutService.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../platform/workspace/common/workspace.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { $, addDisposableListener, append, clearNode, Dimension, EventType, getActiveDocument, getWindow } from '../../../base/browser/dom.js';
import { Emitter } from '../../../base/common/event.js';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND } from '../../../workbench/common/theme.js';
import { contrastBorder } from '../../../platform/theme/common/colorRegistry.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { Codicon } from '../../../base/common/codicons.js';
import { codiconsLibrary } from '../../../base/common/codiconsLibrary.js';
import { Lazy } from '../../../base/common/lazy.js';
import { GlobalCompositeBar } from '../../../workbench/browser/parts/globalCompositeBar.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { Action, Separator } from '../../../base/common/actions.js';
import { URI } from '../../../base/common/uri.js';
import { IFileDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { IPathService } from '../../../workbench/services/path/common/pathService.js';
import { IWorkspaceEditingService } from '../../../workbench/services/workspaces/common/workspaceEditing.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { basename } from '../../../base/common/resources.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { getIconRegistry } from '../../../platform/theme/common/iconRegistry.js';
import { defaultInputBoxStyles } from '../../../platform/theme/browser/defaultStyles.js';
import { WorkbenchIconSelectBox } from '../../../workbench/services/userDataProfile/browser/iconSelectBox.js';
import { localize } from '../../../nls.js';
const HOVER_GROUP_ID = 'projectbar';
const PROJECT_BAR_FOLDERS_KEY = 'workbench.agentsession.projectbar.folders';
const icons = new Lazy(() => {
    const iconDefinitions = getIconRegistry().getIcons();
    const includedChars = new Set();
    const dedupedIcons = iconDefinitions.filter(e => {
        if (e.id === codiconsLibrary.blank.id) {
            return false;
        }
        if (ThemeIcon.isThemeIcon(e.defaults)) {
            return false;
        }
        if (includedChars.has(e.defaults.fontCharacter)) {
            return false;
        }
        includedChars.add(e.defaults.fontCharacter);
        return true;
    });
    return dedupedIcons;
});
/**
 * ProjectBarPart displays project folder entries stored in workspace storage and allows selection between them.
 * When a folder is selected, the workspace editing service is used to replace the current workspace folder
 * with the selected one. It is positioned to the left of the sidebar and has the same visual style as the activity bar.
 * Also includes global activities (accounts, settings) at the bottom.
 */
let ProjectBarPart = class ProjectBarPart extends Part {
    static { this.ACTION_HEIGHT = 48; }
    constructor(layoutService, themeService, storageService, workspaceContextService, fileDialogService, pathService, workspaceEditingService, labelService, hoverService, contextMenuService, quickInputService, instantiationService) {
        super("workbench.parts.projectbar" /* AgenticParts.PROJECTBAR_PART */, { hasTitle: false }, themeService, storageService, layoutService);
        this.storageService = storageService;
        this.workspaceContextService = workspaceContextService;
        this.fileDialogService = fileDialogService;
        this.pathService = pathService;
        this.workspaceEditingService = workspaceEditingService;
        this.labelService = labelService;
        this.hoverService = hoverService;
        this.contextMenuService = contextMenuService;
        this.quickInputService = quickInputService;
        this.instantiationService = instantiationService;
        //#region IView
        this.minimumWidth = 48;
        this.maximumWidth = 48;
        this.minimumHeight = 0;
        this.maximumHeight = Number.POSITIVE_INFINITY;
        this.entries = [];
        this.workspaceEntryDisposables = this._register(new MutableDisposable());
        this._onDidSelectWorkspace = this._register(new Emitter());
        this.onDidSelectWorkspace = this._onDidSelectWorkspace.event;
        // Create the global composite bar for accounts and settings at the bottom
        this.globalCompositeBar = this._register(instantiationService.createInstance(GlobalCompositeBar, () => this.getContextMenuActions(), (theme) => ({
            activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
            inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
            badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
            badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
            activeBackgroundColor: undefined,
            inactiveBackgroundColor: undefined,
            activeBorderBottomColor: undefined,
        }), {
            position: () => this.layoutService.getSideBarPosition() === 0 /* Position.LEFT */ ? 1 /* HoverPosition.RIGHT */ : 0 /* HoverPosition.LEFT */,
        }));
        // Load entries from storage
        this.loadEntriesFromStorage();
    }
    getContextMenuActions() {
        return this.globalCompositeBar.getContextMenuActions();
    }
    loadEntriesFromStorage() {
        const raw = this.storageService.get(PROJECT_BAR_FOLDERS_KEY, 1 /* StorageScope.WORKSPACE */);
        if (raw) {
            try {
                const data = JSON.parse(raw);
                this.entries = data.map(item => {
                    // Support legacy format (just URIs as strings) and new format (objects with display settings)
                    if (typeof item === 'string') {
                        const uri = URI.parse(item);
                        return { uri, name: basename(uri), displayType: 'letter' };
                    }
                    else {
                        const uri = URI.parse(item.uri);
                        return {
                            uri,
                            name: basename(uri),
                            displayType: item.displayType ?? 'letter',
                            iconId: item.iconId
                        };
                    }
                });
            }
            catch {
                this.entries = [];
            }
        }
        else {
            this.entries = [];
        }
        // The selected folder is always the first workspace folder
        const currentFolders = this.workspaceContextService.getWorkspace().folders;
        this._selectedFolderUri = currentFolders.length > 0 ? currentFolders[0].uri : undefined;
    }
    saveEntriesToStorage() {
        const data = this.entries.map(e => ({
            uri: e.uri.toString(),
            displayType: e.displayType,
            iconId: e.iconId
        }));
        this.storageService.store(PROJECT_BAR_FOLDERS_KEY, JSON.stringify(data), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    addFolderEntry(uri) {
        // Don't add duplicates
        if (this.entries.some(e => e.uri.toString() === uri.toString())) {
            return;
        }
        this.entries.push({ uri, name: basename(uri), displayType: 'letter' });
        this.saveEntriesToStorage();
        // Select the newly added folder
        this._selectedFolderUri = uri;
        this.saveEntriesToStorage();
        this.applySelectedFolder();
        this._onDidSelectWorkspace.fire(this._selectedFolderUri);
        this.renderContent();
    }
    async applySelectedFolder() {
        if (!this._selectedFolderUri) {
            return;
        }
        const currentFolders = this.workspaceContextService.getWorkspace().folders;
        const foldersToRemove = currentFolders.map(f => f.uri);
        // Remove existing workspace folders and add the selected one
        await this.workspaceEditingService.updateFolders(0, foldersToRemove.length, [{ uri: this._selectedFolderUri }]);
    }
    createContentArea(parent) {
        this.element = parent;
        this.content = append(this.element, $('.content'));
        // Create actions container for workspace folders and add button
        this.actionsContainer = append(this.content, $('.actions-container'));
        // Create the UI for workspace folders
        this.renderContent();
        // Create global composite bar at the bottom (accounts, settings)
        this.globalCompositeBar.create(this.content);
        return this.content;
    }
    renderContent() {
        if (!this.actionsContainer) {
            return;
        }
        // Clear existing content
        clearNode(this.actionsContainer);
        this.workspaceEntryDisposables.value = new DisposableStore();
        // Create add folder button
        this.createAddFolderButton(this.actionsContainer);
        // Create workspace folder entries
        this.createWorkspaceEntries(this.actionsContainer);
    }
    createAddFolderButton(container) {
        this.addFolderButton = append(container, $('.action-item.add-folder'));
        const actionLabel = append(this.addFolderButton, $('span.action-label'));
        // Add the plus icon using codicon
        actionLabel.classList.add(...ThemeIcon.asClassNameArray(Codicon.add));
        // Add hover tooltip
        this.workspaceEntryDisposables.value?.add(this.hoverService.setupDelayedHover(this.addFolderButton, {
            appearance: { showPointer: true },
            position: { hoverPosition: 1 /* HoverPosition.RIGHT */ },
            content: 'Add Folder to Project'
        }, { groupId: HOVER_GROUP_ID }));
        // Click handler to add folder
        this.workspaceEntryDisposables.value?.add(addDisposableListener(this.addFolderButton, EventType.CLICK, () => {
            this.pickAndAddFolder();
        }));
        // Keyboard support
        this.addFolderButton.setAttribute('tabindex', '0');
        this.addFolderButton.setAttribute('role', 'button');
        this.addFolderButton.setAttribute('aria-label', 'Add Folder to Project');
        this.workspaceEntryDisposables.value?.add(addDisposableListener(this.addFolderButton, EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.pickAndAddFolder();
            }
        }));
    }
    async pickAndAddFolder() {
        const folders = await this.fileDialogService.showOpenDialog({
            openLabel: 'Add',
            title: 'Add Folder to Project',
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: await this.fileDialogService.defaultFolderPath(),
            availableFileSystems: [this.pathService.defaultUriScheme]
        });
        if (folders?.length) {
            this.addFolderEntry(folders[0]);
        }
    }
    createWorkspaceEntries(container) {
        for (let i = 0; i < this.entries.length; i++) {
            this.createWorkspaceEntry(container, this.entries[i], i);
        }
        // Auto-select first entry if available and none selected
        if (this.entries.length > 0 && this._selectedFolderUri) {
            this._onDidSelectWorkspace.fire(this._selectedFolderUri);
        }
    }
    createWorkspaceEntry(container, entry, index) {
        const entryDisposables = this.workspaceEntryDisposables.value;
        const entryElement = append(container, $('.action-item.workspace-entry'));
        const actionLabel = append(entryElement, $('span.action-label.workspace-icon'));
        append(entryElement, $('span.active-item-indicator'));
        // Render based on display type
        const folderName = entry.name;
        if (entry.displayType === 'icon' && entry.iconId) {
            // Render codicon
            const icon = ThemeIcon.fromId(entry.iconId);
            actionLabel.classList.add(...ThemeIcon.asClassNameArray(icon));
            actionLabel.classList.add('codicon-icon');
            actionLabel.textContent = '';
        }
        else {
            // Default: render first letter of folder name
            const firstLetter = folderName.charAt(0).toUpperCase();
            actionLabel.textContent = firstLetter;
        }
        // Set selected state
        const isSelected = this._selectedFolderUri?.toString() === entry.uri.toString();
        if (isSelected) {
            entryElement.classList.add('checked');
        }
        // Build hover content with full path
        const folderPath = this.labelService.getUriLabel(entry.uri, { relative: false });
        // Add hover tooltip with folder name
        entryDisposables.add(this.hoverService.setupDelayedHover(entryElement, {
            appearance: { showPointer: true },
            position: { hoverPosition: 1 /* HoverPosition.RIGHT */ },
            content: folderPath
        }, { groupId: HOVER_GROUP_ID }));
        // Click handler to select workspace
        entryDisposables.add(addDisposableListener(entryElement, EventType.CLICK, () => {
            this.selectWorkspace(index);
        }));
        // Keyboard support
        entryElement.setAttribute('tabindex', '0');
        entryElement.setAttribute('role', 'button');
        entryElement.setAttribute('aria-label', folderName);
        entryElement.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        entryDisposables.add(addDisposableListener(entryElement, EventType.KEY_DOWN, (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.selectWorkspace(index);
            }
        }));
        // Context menu with customize and remove actions
        entryDisposables.add(addDisposableListener(entryElement, EventType.CONTEXT_MENU, (e) => {
            e.preventDefault();
            e.stopPropagation();
            const event = new StandardMouseEvent(getWindow(entryElement), e);
            this.contextMenuService.showContextMenu({
                getAnchor: () => event,
                getActions: () => [
                    new Action('projectbar.customize', localize('projectbar.customize', "Customize"), undefined, true, () => this.showCustomizeQuickPick(index)),
                    new Separator(),
                    new Action('projectbar.removeFolder', localize('projectbar.removeFolder', "Remove Folder"), undefined, true, () => this.removeFolderEntry(index))
                ]
            });
        }));
    }
    selectWorkspace(index) {
        if (index < 0 || index >= this.entries.length) {
            return;
        }
        const entry = this.entries[index];
        if (this._selectedFolderUri?.toString() === entry.uri.toString()) {
            return; // Already selected
        }
        this._selectedFolderUri = entry.uri;
        this.saveEntriesToStorage();
        // Re-render to update visual state
        this.renderContent();
        // Apply the selected folder as the workspace folder
        this.applySelectedFolder();
        // Fire selection event
        this._onDidSelectWorkspace.fire(this._selectedFolderUri);
    }
    removeFolderEntry(index) {
        if (index < 0 || index >= this.entries.length) {
            return;
        }
        const removedUri = this.entries[index].uri;
        this.entries.splice(index, 1);
        this.saveEntriesToStorage();
        // If the removed entry was the selected one, select the first remaining entry
        if (this._selectedFolderUri?.toString() === removedUri.toString()) {
            if (this.entries.length > 0) {
                this._selectedFolderUri = this.entries[0].uri;
                this.applySelectedFolder();
                this._onDidSelectWorkspace.fire(this._selectedFolderUri);
            }
            else {
                this._selectedFolderUri = undefined;
                this._onDidSelectWorkspace.fire(undefined);
            }
        }
        this.renderContent();
    }
    async showCustomizeQuickPick(index) {
        if (index < 0 || index >= this.entries.length) {
            return;
        }
        const entry = this.entries[index];
        const items = [
            {
                customType: 'letter',
                label: localize('projectbar.customize.letter', "Letter"),
                description: localize('projectbar.customize.letter.description', "Show the first letter of the workspace name")
            },
            {
                customType: 'icon',
                label: localize('projectbar.customize.icon', "Icon"),
                description: localize('projectbar.customize.icon.description', "Choose a codicon to represent the workspace")
            }
        ];
        const picked = await this.quickInputService.pick(items, {
            placeHolder: localize('projectbar.customize.placeholder', "Choose how to display the workspace in the project bar"),
            title: localize('projectbar.customize.title', "Customize Workspace Appearance")
        });
        if (!picked) {
            return;
        }
        if (picked.customType === 'letter') {
            entry.displayType = 'letter';
            entry.iconId = undefined;
            this.saveEntriesToStorage();
            this.renderContent();
        }
        else if (picked.customType === 'icon') {
            const icon = await this.pickIcon();
            if (icon) {
                entry.displayType = 'icon';
                entry.iconId = icon.id;
                this.saveEntriesToStorage();
                this.renderContent();
            }
        }
    }
    async pickIcon() {
        const iconSelectBox = this.instantiationService.createInstance(WorkbenchIconSelectBox, {
            icons: icons.value,
            inputBoxStyles: defaultInputBoxStyles
        });
        const dimension = new Dimension(486, 260);
        return new Promise(resolve => {
            const disposables = new DisposableStore();
            disposables.add(iconSelectBox.onDidSelect(e => {
                resolve(e);
                disposables.dispose();
                iconSelectBox.dispose();
            }));
            iconSelectBox.clearInput();
            const body = getActiveDocument().body;
            const bodyRect = body.getBoundingClientRect();
            const hoverWidget = this.hoverService.showInstantHover({
                content: iconSelectBox.domNode,
                target: {
                    targetElements: [body],
                    x: bodyRect.left + (bodyRect.width - dimension.width) / 2,
                    y: bodyRect.top + this.layoutService.activeContainerOffset.top
                },
                position: {
                    hoverPosition: 2 /* HoverPosition.BELOW */,
                },
                persistence: {
                    sticky: true,
                },
            }, true);
            if (hoverWidget) {
                disposables.add(hoverWidget);
            }
            iconSelectBox.layout(dimension);
            iconSelectBox.focus();
        });
    }
    get selectedWorkspaceFolder() {
        return this._selectedFolderUri;
    }
    updateStyles() {
        super.updateStyles();
        const container = assertReturnsDefined(this.getContainer());
        const background = this.getColor(ACTIVITY_BAR_BACKGROUND) || '';
        container.style.backgroundColor = background;
        const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder) || '';
        container.classList.toggle('bordered', !!borderColor);
        container.style.borderColor = borderColor ? borderColor : '';
    }
    focus() {
        // Focus the add folder button (first focusable element)
        this.addFolderButton?.focus();
    }
    focusGlobalCompositeBar() {
        this.globalCompositeBar.focus();
    }
    layout(width, height) {
        super.layout(width, height, 0, 0);
        // The global composite bar takes some height at the bottom
        // The actions container will take the remaining space due to CSS flex layout
    }
    toJSON() {
        return {
            type: "workbench.parts.projectbar" /* AgenticParts.PROJECTBAR_PART */
        };
    }
};
ProjectBarPart = __decorate([
    __param(0, IWorkbenchLayoutService),
    __param(1, IThemeService),
    __param(2, IStorageService),
    __param(3, IWorkspaceContextService),
    __param(4, IFileDialogService),
    __param(5, IPathService),
    __param(6, IWorkspaceEditingService),
    __param(7, ILabelService),
    __param(8, IHoverService),
    __param(9, IContextMenuService),
    __param(10, IQuickInputService),
    __param(11, IInstantiationService)
], ProjectBarPart);
export { ProjectBarPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvamVjdEJhclBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9icm93c2VyL3BhcnRzL3Byb2plY3RCYXJQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sNEJBQTRCLENBQUM7QUFDcEMsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSx1QkFBdUIsRUFBWSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2hILE9BQU8sRUFBZSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLDZDQUE2QyxDQUFDO0FBQzNHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdkYsT0FBTyxFQUFFLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsU0FBUyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDL0ksT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSw2QkFBNkIsRUFBRSw2QkFBNkIsRUFBRSxtQkFBbUIsRUFBRSx1QkFBdUIsRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNOLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNyRSxP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