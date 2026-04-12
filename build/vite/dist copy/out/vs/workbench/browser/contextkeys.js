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
import { Disposable } from '../../base/common/lifecycle.js';
import { IContextKeyService, setConstant as setConstantContextKey } from '../../platform/contextkey/common/contextkey.js';
import { IsMacContext, IsLinuxContext, IsWindowsContext, IsWebContext, IsMacNativeContext, IsDevelopmentContext, IsIOSContext, ProductQualityContext, IsMobileContext } from '../../platform/contextkey/common/contextkeys.js';
import { SplitEditorsVertically, InEditorZenModeContext, AuxiliaryBarVisibleContext, SideBarVisibleContext, PanelAlignmentContext, PanelMaximizedContext, PanelVisibleContext, EmbedderIdentifierContext, EditorTabsVisibleContext, IsMainEditorCenteredLayoutContext, MainEditorAreaVisibleContext, DirtyWorkingCopiesContext, EmptyWorkspaceSupportContext, EnterMultiRootWorkspaceSupportContext, HasWebFileSystemAccess, IsMainWindowFullscreenContext, OpenFolderWorkspaceSupportContext, RemoteNameContext, VirtualWorkspaceContext, WorkbenchStateContext, WorkspaceFolderCountContext, PanelPositionContext, TemporaryWorkspaceContext, TitleBarVisibleContext, TitleBarStyleContext, IsAuxiliaryWindowFocusedContext, ActiveEditorGroupEmptyContext, ActiveEditorGroupIndexContext, ActiveEditorGroupLastContext, ActiveEditorGroupLockedContext, MultipleEditorGroupsContext, EditorsVisibleContext, AuxiliaryBarMaximizedContext, InAutomationContext, IsSessionsWindowContext } from '../common/contextkeys.js';
import { preferredSideBySideGroupDirection, IEditorGroupsService } from '../services/editor/common/editorGroupsService.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../services/environment/common/environmentService.js';
import { IWorkspaceContextService, isTemporaryWorkspace } from '../../platform/workspace/common/workspace.js';
import { IWorkbenchLayoutService, positionToString } from '../services/layout/browser/layoutService.js';
import { getRemoteName } from '../../platform/remote/common/remoteHosts.js';
import { getVirtualWorkspaceScheme } from '../../platform/workspace/common/virtualWorkspace.js';
import { IWorkingCopyService } from '../services/workingCopy/common/workingCopyService.js';
import { isNative } from '../../base/common/platform.js';
import { WebFileSystemAccess } from '../../platform/files/browser/webFileSystemAccess.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { getTitleBarStyle } from '../../platform/window/common/window.js';
import { mainWindow } from '../../base/browser/window.js';
import { isFullscreen, onDidChangeFullscreen } from '../../base/browser/browser.js';
import { IEditorService } from '../services/editor/common/editorService.js';
let WorkbenchContextKeysHandler = class WorkbenchContextKeysHandler extends Disposable {
    constructor(contextKeyService, contextService, configurationService, environmentService, productService, editorGroupService, editorService, layoutService, workingCopyService) {
        super();
        this.contextKeyService = contextKeyService;
        this.contextService = contextService;
        this.configurationService = configurationService;
        this.environmentService = environmentService;
        this.productService = productService;
        this.editorGroupService = editorGroupService;
        this.editorService = editorService;
        this.layoutService = layoutService;
        this.workingCopyService = workingCopyService;
        // Platform
        IsMacContext.bindTo(this.contextKeyService);
        IsLinuxContext.bindTo(this.contextKeyService);
        IsWindowsContext.bindTo(this.contextKeyService);
        IsWebContext.bindTo(this.contextKeyService);
        IsMacNativeContext.bindTo(this.contextKeyService);
        IsIOSContext.bindTo(this.contextKeyService);
        IsMobileContext.bindTo(this.contextKeyService);
        RemoteNameContext.bindTo(this.contextKeyService).set(getRemoteName(this.environmentService.remoteAuthority) || '');
        this.virtualWorkspaceContext = VirtualWorkspaceContext.bindTo(this.contextKeyService);
        this.temporaryWorkspaceContext = TemporaryWorkspaceContext.bindTo(this.contextKeyService);
        this.isSessionsWindowContext = IsSessionsWindowContext.bindTo(this.contextKeyService);
        this.isSessionsWindowContext.set(this.environmentService.isSessionsWindow);
        this.updateWorkspaceContextKeys();
        // Capabilities
        HasWebFileSystemAccess.bindTo(this.contextKeyService).set(WebFileSystemAccess.supported(mainWindow));
        // Development
        const isDevelopment = !this.environmentService.isBuilt || this.environmentService.isExtensionDevelopment;
        IsDevelopmentContext.bindTo(this.contextKeyService).set(isDevelopment);
        setConstantContextKey(IsDevelopmentContext.key, isDevelopment);
        // Product Service
        ProductQualityContext.bindTo(this.contextKeyService).set(this.productService.quality || '');
        EmbedderIdentifierContext.bindTo(this.contextKeyService).set(productService.embedderIdentifier);
        // Automation
        this.inAutomationContext = InAutomationContext.bindTo(this.contextKeyService);
        this.inAutomationContext.set(!!this.environmentService.enableSmokeTestDriver);
        // Editor Groups
        this.activeEditorGroupEmpty = ActiveEditorGroupEmptyContext.bindTo(this.contextKeyService);
        this.activeEditorGroupIndex = ActiveEditorGroupIndexContext.bindTo(this.contextKeyService);
        this.activeEditorGroupLast = ActiveEditorGroupLastContext.bindTo(this.contextKeyService);
        this.activeEditorGroupLocked = ActiveEditorGroupLockedContext.bindTo(this.contextKeyService);
        this.multipleEditorGroupsContext = MultipleEditorGroupsContext.bindTo(this.contextKeyService);
        // Editors
        this.editorsVisibleContext = EditorsVisibleContext.bindTo(this.contextKeyService);
        // Working Copies
        this.dirtyWorkingCopiesContext = DirtyWorkingCopiesContext.bindTo(this.contextKeyService);
        this.dirtyWorkingCopiesContext.set(this.workingCopyService.hasDirty);
        // Workbench State
        this.workbenchStateContext = WorkbenchStateContext.bindTo(this.contextKeyService);
        this.updateWorkbenchStateContextKey();
        // Workspace Folder Count
        this.workspaceFolderCountContext = WorkspaceFolderCountContext.bindTo(this.contextKeyService);
        this.updateWorkspaceFolderCountContextKey();
        // Opening folder support: support for opening a folder workspace
        // (e.g. "Open Folder...") is limited in web when not connected
        // to a remote.
        this.openFolderWorkspaceSupportContext = OpenFolderWorkspaceSupportContext.bindTo(this.contextKeyService);
        this.openFolderWorkspaceSupportContext.set(isNative || typeof this.environmentService.remoteAuthority === 'string');
        // Empty workspace support: empty workspaces require built-in file system
        // providers to be available that allow to enter a workspace or open loose
        // files. This condition is met:
        // - desktop: always
        // -     web: only when connected to a remote
        this.emptyWorkspaceSupportContext = EmptyWorkspaceSupportContext.bindTo(this.contextKeyService);
        this.emptyWorkspaceSupportContext.set(isNative || typeof this.environmentService.remoteAuthority === 'string');
        // Entering a multi root workspace support: support for entering a multi-root
        // workspace (e.g. "Open Workspace from File...", "Duplicate Workspace", "Save Workspace")
        // is driven by the ability to resolve a workspace configuration file (*.code-workspace)
        // with a built-in file system provider.
        // This condition is met:
        // - desktop: always
        // -     web: only when connected to a remote
        this.enterMultiRootWorkspaceSupportContext = EnterMultiRootWorkspaceSupportContext.bindTo(this.contextKeyService);
        this.enterMultiRootWorkspaceSupportContext.set(isNative || typeof this.environmentService.remoteAuthority === 'string');
        // Editor Layout
        this.splitEditorsVerticallyContext = SplitEditorsVertically.bindTo(this.contextKeyService);
        this.updateSplitEditorsVerticallyContext();
        // Window
        this.isMainWindowFullscreenContext = IsMainWindowFullscreenContext.bindTo(this.contextKeyService);
        this.isAuxiliaryWindowFocusedContext = IsAuxiliaryWindowFocusedContext.bindTo(this.contextKeyService);
        // Zen Mode
        this.inZenModeContext = InEditorZenModeContext.bindTo(this.contextKeyService);
        // Centered Layout (Main Editor)
        this.isMainEditorCenteredLayoutContext = IsMainEditorCenteredLayoutContext.bindTo(this.contextKeyService);
        // Editor Area
        this.mainEditorAreaVisibleContext = MainEditorAreaVisibleContext.bindTo(this.contextKeyService);
        this.editorTabsVisibleContext = EditorTabsVisibleContext.bindTo(this.contextKeyService);
        // Sidebar
        this.sideBarVisibleContext = SideBarVisibleContext.bindTo(this.contextKeyService);
        this.sideBarVisibleContext.set(this.layoutService.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */));
        // Title Bar
        this.titleAreaVisibleContext = TitleBarVisibleContext.bindTo(this.contextKeyService);
        this.titleBarStyleContext = TitleBarStyleContext.bindTo(this.contextKeyService);
        this.updateTitleBarContextKeys();
        // Panel
        this.panelPositionContext = PanelPositionContext.bindTo(this.contextKeyService);
        this.panelPositionContext.set(positionToString(this.layoutService.getPanelPosition()));
        this.panelVisibleContext = PanelVisibleContext.bindTo(this.contextKeyService);
        this.panelVisibleContext.set(this.layoutService.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */));
        this.panelMaximizedContext = PanelMaximizedContext.bindTo(this.contextKeyService);
        this.panelMaximizedContext.set(this.layoutService.isPanelMaximized());
        this.panelAlignmentContext = PanelAlignmentContext.bindTo(this.contextKeyService);
        this.panelAlignmentContext.set(this.layoutService.getPanelAlignment());
        // Auxiliary Bar
        this.auxiliaryBarVisibleContext = AuxiliaryBarVisibleContext.bindTo(this.contextKeyService);
        this.auxiliaryBarVisibleContext.set(this.layoutService.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */));
        this.auxiliaryBarMaximizedContext = AuxiliaryBarMaximizedContext.bindTo(this.contextKeyService);
        this.auxiliaryBarMaximizedContext.set(this.layoutService.isAuxiliaryBarMaximized());
        this.registerListeners();
    }
    registerListeners() {
        this.editorGroupService.whenReady.then(() => {
            this.updateEditorAreaContextKeys();
            this.updateActiveEditorGroupContextKeys();
            this.updateVisiblePanesContextKeys();
        });
        this._register(this.editorService.onDidActiveEditorChange(() => this.updateActiveEditorGroupContextKeys()));
        this._register(this.editorService.onDidVisibleEditorsChange(() => this.updateVisiblePanesContextKeys()));
        this._register(this.editorGroupService.onDidAddGroup(() => this.updateEditorGroupsContextKeys()));
        this._register(this.editorGroupService.onDidRemoveGroup(() => this.updateEditorGroupsContextKeys()));
        this._register(this.editorGroupService.onDidChangeGroupIndex(() => this.updateActiveEditorGroupContextKeys()));
        this._register(this.editorGroupService.onDidChangeGroupLocked(() => this.updateActiveEditorGroupContextKeys()));
        this._register(this.editorGroupService.onDidChangeEditorPartOptions(() => this.updateEditorAreaContextKeys()));
        this._register(this.contextService.onDidChangeWorkbenchState(() => this.updateWorkbenchStateContextKey()));
        this._register(this.contextService.onDidChangeWorkspaceFolders(() => {
            this.updateWorkspaceFolderCountContextKey();
            this.updateWorkspaceContextKeys();
        }));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workbench.editor.openSideBySideDirection')) {
                this.updateSplitEditorsVerticallyContext();
            }
        }));
        this._register(this.layoutService.onDidChangeZenMode(enabled => this.inZenModeContext.set(enabled)));
        this._register(this.layoutService.onDidChangeActiveContainer(() => this.isAuxiliaryWindowFocusedContext.set(this.layoutService.activeContainer !== this.layoutService.mainContainer)));
        this._register(onDidChangeFullscreen(windowId => {
            if (windowId === mainWindow.vscodeWindowId) {
                this.isMainWindowFullscreenContext.set(isFullscreen(mainWindow));
            }
        }));
        this._register(this.layoutService.onDidChangeMainEditorCenteredLayout(centered => this.isMainEditorCenteredLayoutContext.set(centered)));
        this._register(this.layoutService.onDidChangePanelPosition(position => this.panelPositionContext.set(position)));
        this._register(this.layoutService.onDidChangePanelAlignment(alignment => this.panelAlignmentContext.set(alignment)));
        this._register(this.layoutService.onDidChangePartVisibility(() => {
            this.mainEditorAreaVisibleContext.set(this.layoutService.isVisible("workbench.parts.editor" /* Parts.EDITOR_PART */, mainWindow));
            this.panelVisibleContext.set(this.layoutService.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */));
            this.panelMaximizedContext.set(this.layoutService.isPanelMaximized());
            this.auxiliaryBarVisibleContext.set(this.layoutService.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */));
            this.sideBarVisibleContext.set(this.layoutService.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */));
            this.updateTitleBarContextKeys();
        }));
        this._register(this.layoutService.onDidChangeAuxiliaryBarMaximized(() => {
            this.auxiliaryBarMaximizedContext.set(this.layoutService.isAuxiliaryBarMaximized());
        }));
        this._register(this.workingCopyService.onDidChangeDirty(workingCopy => this.dirtyWorkingCopiesContext.set(workingCopy.isDirty() || this.workingCopyService.hasDirty)));
    }
    updateVisiblePanesContextKeys() {
        const visibleEditorPanes = this.editorService.visibleEditorPanes;
        if (visibleEditorPanes.length > 0) {
            this.editorsVisibleContext.set(true);
        }
        else {
            this.editorsVisibleContext.reset();
        }
    }
    // Context keys depending on the state of the editor group itself
    updateActiveEditorGroupContextKeys() {
        if (!this.editorService.activeEditor) {
            this.activeEditorGroupEmpty.set(true);
        }
        else {
            this.activeEditorGroupEmpty.reset();
        }
        const activeGroup = this.editorGroupService.activeGroup;
        this.activeEditorGroupIndex.set(activeGroup.index + 1); // not zero-indexed
        this.activeEditorGroupLocked.set(activeGroup.isLocked);
        this.updateEditorGroupsContextKeys();
    }
    // Context keys depending on the state of other editor groups
    updateEditorGroupsContextKeys() {
        const groupCount = this.editorGroupService.count;
        if (groupCount > 1) {
            this.multipleEditorGroupsContext.set(true);
        }
        else {
            this.multipleEditorGroupsContext.reset();
        }
        const activeGroup = this.editorGroupService.activeGroup;
        this.activeEditorGroupLast.set(activeGroup.index === groupCount - 1);
    }
    updateEditorAreaContextKeys() {
        this.editorTabsVisibleContext.set(this.editorGroupService.partOptions.showTabs === 'multiple');
    }
    updateWorkbenchStateContextKey() {
        this.workbenchStateContext.set(this.getWorkbenchStateString());
    }
    updateWorkspaceFolderCountContextKey() {
        this.workspaceFolderCountContext.set(this.contextService.getWorkspace().folders.length);
    }
    updateSplitEditorsVerticallyContext() {
        const direction = preferredSideBySideGroupDirection(this.configurationService);
        this.splitEditorsVerticallyContext.set(direction === 1 /* GroupDirection.DOWN */);
    }
    getWorkbenchStateString() {
        switch (this.contextService.getWorkbenchState()) {
            case 1 /* WorkbenchState.EMPTY */: return 'empty';
            case 2 /* WorkbenchState.FOLDER */: return 'folder';
            case 3 /* WorkbenchState.WORKSPACE */: return 'workspace';
        }
    }
    updateTitleBarContextKeys() {
        this.titleAreaVisibleContext.set(this.layoutService.isVisible("workbench.parts.titlebar" /* Parts.TITLEBAR_PART */, mainWindow));
        this.titleBarStyleContext.set(getTitleBarStyle(this.configurationService));
    }
    updateWorkspaceContextKeys() {
        this.virtualWorkspaceContext.set(getVirtualWorkspaceScheme(this.contextService.getWorkspace()) || '');
        this.temporaryWorkspaceContext.set(isTemporaryWorkspace(this.contextService.getWorkspace()));
    }
};
WorkbenchContextKeysHandler = __decorate([
    __param(0, IContextKeyService),
    __param(1, IWorkspaceContextService),
    __param(2, IConfigurationService),
    __param(3, IWorkbenchEnvironmentService),
    __param(4, IProductService),
    __param(5, IEditorGroupsService),
    __param(6, IEditorService),
    __param(7, IWorkbenchLayoutService),
    __param(8, IWorkingCopyService)
], WorkbenchContextKeysHandler);
export { WorkbenchContextKeysHandler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dGtleXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9jb250ZXh0a2V5cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDNUQsT0FBTyxFQUFFLGtCQUFrQixFQUFlLFdBQVcsSUFBSSxxQkFBcUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3ZJLE9BQU8sRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxZQUFZLEVBQUUscUJBQXFCLEVBQUUsZUFBZSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDL04sT0FBTyxFQUFFLHNCQUFzQixFQUFFLHNCQUFzQixFQUFFLDBCQUEwQixFQUFFLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUFFLHlCQUF5QixFQUFFLHdCQUF3QixFQUFFLGlDQUFpQyxFQUFFLDRCQUE0QixFQUFFLHlCQUF5QixFQUFFLDRCQUE0QixFQUFFLHFDQUFxQyxFQUFFLHNCQUFzQixFQUFFLDZCQUE2QixFQUFFLGlDQUFpQyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLHFCQUFxQixFQUFFLDJCQUEyQixFQUFFLG9CQUFvQixFQUFFLHlCQUF5QixFQUFFLHNCQUFzQixFQUFFLG9CQUFvQixFQUFFLCtCQUErQixFQUFFLDZCQUE2QixFQUFFLDZCQUE2QixFQUFFLDRCQUE0QixFQUFFLDhCQUE4QixFQUFFLDJCQUEyQixFQUFFLHFCQUFxQixFQUFFLDRCQUE0QixFQUFFLG1CQUFtQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDNTlCLE9BQU8sRUFBRSxp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