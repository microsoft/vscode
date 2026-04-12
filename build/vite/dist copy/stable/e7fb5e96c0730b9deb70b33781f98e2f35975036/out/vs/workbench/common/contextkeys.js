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
var AbstractResourceContextKey_1;
import { DisposableStore } from '../../base/common/lifecycle.js';
import { localize } from '../../nls.js';
import { IContextKeyService, RawContextKey } from '../../platform/contextkey/common/contextkey.js';
import { basename, dirname, extname, isEqual } from '../../base/common/resources.js';
import { ILanguageService } from '../../editor/common/languages/language.js';
import { IFileService } from '../../platform/files/common/files.js';
import { IModelService } from '../../editor/common/services/model.js';
import { Schemas } from '../../base/common/network.js';
import { DEFAULT_EDITOR_ASSOCIATION } from './editor.js';
import { DiffEditorInput } from './editor/diffEditorInput.js';
//#region < --- Workbench --- >
export const WorkbenchStateContext = new RawContextKey('workbenchState', undefined, { type: 'string', description: localize('workbenchState', "The kind of workspace opened in the window, either 'empty' (no workspace), 'folder' (single folder) or 'workspace' (multi-root workspace)") });
export const WorkspaceFolderCountContext = new RawContextKey('workspaceFolderCount', 0, localize('workspaceFolderCount', "The number of root folders in the workspace"));
export const OpenFolderWorkspaceSupportContext = new RawContextKey('openFolderWorkspaceSupport', true, true);
export const EnterMultiRootWorkspaceSupportContext = new RawContextKey('enterMultiRootWorkspaceSupport', true, true);
export const EmptyWorkspaceSupportContext = new RawContextKey('emptyWorkspaceSupport', true, true);
export const DirtyWorkingCopiesContext = new RawContextKey('dirtyWorkingCopies', false, localize('dirtyWorkingCopies', "Whether there are any working copies with unsaved changes"));
export const RemoteNameContext = new RawContextKey('remoteName', '', localize('remoteName', "The name of the remote the window is connected to or an empty string if not connected to any remote"));
export const VirtualWorkspaceContext = new RawContextKey('virtualWorkspace', '', localize('virtualWorkspace', "The scheme of the current workspace is from a virtual file system or an empty string."));
export const TemporaryWorkspaceContext = new RawContextKey('temporaryWorkspace', false, localize('temporaryWorkspace', "The scheme of the current workspace is from a temporary file system."));
export const IsSessionsWindowContext = new RawContextKey('isSessionsWindow', false, localize('isSessionsWindow', "Whether the current window is a agent sessions window."));
export const HasWebFileSystemAccess = new RawContextKey('hasWebFileSystemAccess', false, true); // Support for FileSystemAccess web APIs (https://wicg.github.io/file-system-access)
export const EmbedderIdentifierContext = new RawContextKey('embedderIdentifier', undefined, localize('embedderIdentifier', 'The identifier of the embedder according to the product service, if one is defined'));
export const InAutomationContext = new RawContextKey('inAutomation', false, localize('inAutomation', "Whether VS Code is running under automation/smoke test"));
//#endregion
//#region < --- Window --- >
export const IsMainWindowFullscreenContext = new RawContextKey('isFullscreen', false, localize('isFullscreen', "Whether the main window is in fullscreen mode"));
export const IsAuxiliaryWindowFocusedContext = new RawContextKey('isAuxiliaryWindowFocusedContext', false, localize('isAuxiliaryWindowFocusedContext', "Whether an auxiliary window is focused"));
export const IsWindowAlwaysOnTopContext = new RawContextKey('isWindowAlwaysOnTop', false, localize('isWindowAlwaysOnTop', "Whether the window is always on top"));
export const IsAuxiliaryWindowContext = new RawContextKey('isAuxiliaryWindow', false, localize('isAuxiliaryWindow', "Window is an auxiliary window"));
//#endregion
//#region < --- Editor --- >
// Editor State Context Keys
export const ActiveEditorDirtyContext = new RawContextKey('activeEditorIsDirty', false, localize('activeEditorIsDirty', "Whether the active editor has unsaved changes"));
export const ActiveEditorPinnedContext = new RawContextKey('activeEditorIsNotPreview', false, localize('activeEditorIsNotPreview', "Whether the active editor is not in preview mode"));
export const ActiveEditorFirstInGroupContext = new RawContextKey('activeEditorIsFirstInGroup', false, localize('activeEditorIsFirstInGroup', "Whether the active editor is the first one in its group"));
export const ActiveEditorLastInGroupContext = new RawContextKey('activeEditorIsLastInGroup', false, localize('activeEditorIsLastInGroup', "Whether the active editor is the last one in its group"));
export const ActiveEditorStickyContext = new RawContextKey('activeEditorIsPinned', false, localize('activeEditorIsPinned', "Whether the active editor is pinned"));
export const ActiveEditorReadonlyContext = new RawContextKey('activeEditorIsReadonly', false, localize('activeEditorIsReadonly', "Whether the active editor is read-only"));
export const ActiveCompareEditorCanSwapContext = new RawContextKey('activeCompareEditorCanSwap', false, localize('activeCompareEditorCanSwap', "Whether the active compare editor can swap sides"));
export const ActiveEditorCanToggleReadonlyContext = new RawContextKey('activeEditorCanToggleReadonly', true, localize('activeEditorCanToggleReadonly', "Whether the active editor can toggle between being read-only or writeable"));
export const ActiveEditorCanRevertContext = new RawContextKey('activeEditorCanRevert', false, localize('activeEditorCanRevert', "Whether the active editor can revert"));
export const ActiveEditorCanSplitInGroupContext = new RawContextKey('activeEditorCanSplitInGroup', true);
// Editor Kind Context Keys
export const ActiveEditorContext = new RawContextKey('activeEditor', null, { type: 'string', description: localize('activeEditor', "The identifier of the active editor") });
export const ActiveEditorAvailableEditorIdsContext = new RawContextKey('activeEditorAvailableEditorIds', '', localize('activeEditorAvailableEditorIds', "The available editor identifiers that are usable for the active editor"));
export const TextCompareEditorVisibleContext = new RawContextKey('textCompareEditorVisible', false, localize('textCompareEditorVisible', "Whether a text compare editor is visible"));
export const TextCompareEditorActiveContext = new RawContextKey('textCompareEditorActive', false, localize('textCompareEditorActive', "Whether a text compare editor is active"));
export const SideBySideEditorActiveContext = new RawContextKey('sideBySideEditorActive', false, localize('sideBySideEditorActive', "Whether a side by side editor is active"));
// Editor Group Context Keys
export const EditorGroupEditorsCountContext = new RawContextKey('groupEditorsCount', 0, localize('groupEditorsCount', "The number of opened editor groups"));
export const ActiveEditorGroupEmptyContext = new RawContextKey('activeEditorGroupEmpty', false, localize('activeEditorGroupEmpty', "Whether the active editor group is empty"));
export const ActiveEditorGroupIndexContext = new RawContextKey('activeEditorGroupIndex', 0, localize('activeEditorGroupIndex', "The index of the active editor group"));
export const ActiveEditorGroupLastContext = new RawContextKey('activeEditorGroupLast', false, localize('activeEditorGroupLast', "Whether the active editor group is the last group"));
export const ActiveEditorGroupLockedContext = new RawContextKey('activeEditorGroupLocked', false, localize('activeEditorGroupLocked', "Whether the active editor group is locked"));
export const MultipleEditorGroupsContext = new RawContextKey('multipleEditorGroups', false, localize('multipleEditorGroups', "Whether there are multiple editor groups opened"));
export const SingleEditorGroupsContext = MultipleEditorGroupsContext.toNegated();
export const MultipleEditorsSelectedInGroupContext = new RawContextKey('multipleEditorsSelectedInGroup', false, localize('multipleEditorsSelectedInGroup', "Whether multiple editors have been selected in an editor group"));
export const TwoEditorsSelectedInGroupContext = new RawContextKey('twoEditorsSelectedInGroup', false, localize('twoEditorsSelectedInGroup', "Whether exactly two editors have been selected in an editor group"));
export const SelectedEditorsInGroupFileOrUntitledResourceContextKey = new RawContextKey('SelectedEditorsInGroupFileOrUntitledResourceContextKey', true, localize('SelectedEditorsInGroupFileOrUntitledResourceContextKey', "Whether all selected editors in a group have a file or untitled resource associated"));
// Editor Part Context Keys
export const EditorPartMultipleEditorGroupsContext = new RawContextKey('editorPartMultipleEditorGroups', false, localize('editorPartMultipleEditorGroups', "Whether there are multiple editor groups opened in an editor part"));
export const EditorPartSingleEditorGroupsContext = EditorPartMultipleEditorGroupsContext.toNegated();
export const EditorPartMaximizedEditorGroupContext = new RawContextKey('editorPartMaximizedEditorGroup', false, localize('editorPartEditorGroupMaximized', "Editor Part has a maximized group"));
export const EditorPartModalContext = new RawContextKey('editorPartModal', false, localize('editorPartModal', "Whether focus is in a modal editor part"));
export const EditorPartModalMaximizedContext = new RawContextKey('editorPartModalMaximized', false, localize('editorPartModalMaximized', "Whether the modal editor part is maximized"));
export const EditorPartModalNavigationContext = new RawContextKey('editorPartModalNavigation', false, localize('editorPartModalNavigation', "Whether the modal editor part has navigation context"));
export const EditorPartModalSidebarContext = new RawContextKey('editorPartModalSidebar', false, localize('editorPartModalSidebar', "Whether the modal editor part has a sidebar"));
export const EditorPartModalSidebarVisibleContext = new RawContextKey('editorPartModalSidebarVisible', false, localize('editorPartModalSidebarVisible', "Whether the modal editor part sidebar is visible"));
// Editor Layout Context Keys
export const EditorsVisibleContext = new RawContextKey('editorIsOpen', false, localize('editorIsOpen', "Whether an editor is open"));
export const InEditorZenModeContext = new RawContextKey('inZenMode', false, localize('inZenMode', "Whether Zen mode is enabled"));
export const IsMainEditorCenteredLayoutContext = new RawContextKey('isCenteredLayout', false, localize('isMainEditorCenteredLayout', "Whether centered layout is enabled for the main editor"));
export const SplitEditorsVertically = new RawContextKey('splitEditorsVertically', false, localize('splitEditorsVertically', "Whether editors split vertically"));
export const MainEditorAreaVisibleContext = new RawContextKey('mainEditorAreaVisible', true, localize('mainEditorAreaVisible', "Whether the editor area in the main window is visible"));
export const EditorTabsVisibleContext = new RawContextKey('editorTabsVisible', true, localize('editorTabsVisible', "Whether editor tabs are visible"));
//#endregion
//#region < --- Side Bar --- >
export const SideBarVisibleContext = new RawContextKey('sideBarVisible', false, localize('sideBarVisible', "Whether the sidebar is visible"));
export const SidebarFocusContext = new RawContextKey('sideBarFocus', false, localize('sideBarFocus', "Whether the sidebar has keyboard focus"));
export const ActiveViewletContext = new RawContextKey('activeViewlet', '', localize('activeViewlet', "The identifier of the active viewlet"));
//#endregion
//#region < --- Status Bar --- >
export const StatusBarFocused = new RawContextKey('statusBarFocused', false, localize('statusBarFocused', "Whether the status bar has keyboard focus"));
//#endregion
//#region < --- Title Bar --- >
export const TitleBarStyleContext = new RawContextKey('titleBarStyle', 'custom', localize('titleBarStyle', "Style of the window title bar"));
export const TitleBarVisibleContext = new RawContextKey('titleBarVisible', false, localize('titleBarVisible', "Whether the title bar is visible"));
export const IsCompactTitleBarContext = new RawContextKey('isCompactTitleBar', false, localize('isCompactTitleBar', "Title bar is in compact mode"));
//#endregion
//#region < --- Banner --- >
export const BannerFocused = new RawContextKey('bannerFocused', false, localize('bannerFocused', "Whether the banner has keyboard focus"));
//#endregion
//#region < --- Notifications --- >
export const NotificationFocusedContext = new RawContextKey('notificationFocus', true, localize('notificationFocus', "Whether a notification has keyboard focus"));
export const NotificationsCenterVisibleContext = new RawContextKey('notificationCenterVisible', false, localize('notificationCenterVisible', "Whether the notifications center is visible"));
export const NotificationsToastsVisibleContext = new RawContextKey('notificationToastsVisible', false, localize('notificationToastsVisible', "Whether a notification toast is visible"));
//#endregion
//#region < --- Auxiliary Bar --- >
export const ActiveAuxiliaryContext = new RawContextKey('activeAuxiliary', '', localize('activeAuxiliary', "The identifier of the active auxiliary panel"));
export const AuxiliaryBarFocusContext = new RawContextKey('auxiliaryBarFocus', false, localize('auxiliaryBarFocus', "Whether the auxiliary bar has keyboard focus"));
export const AuxiliaryBarVisibleContext = new RawContextKey('auxiliaryBarVisible', false, localize('auxiliaryBarVisible', "Whether the auxiliary bar is visible"));
export const AuxiliaryBarMaximizedContext = new RawContextKey('auxiliaryBarMaximized', false, localize('auxiliaryBarMaximized', "Whether the auxiliary bar is maximized"));
//#endregion
//#region < --- Panel --- >
export const ActivePanelContext = new RawContextKey('activePanel', '', localize('activePanel', "The identifier of the active panel"));
export const PanelFocusContext = new RawContextKey('panelFocus', false, localize('panelFocus', "Whether the panel has keyboard focus"));
export const PanelPositionContext = new RawContextKey('panelPosition', 'bottom', localize('panelPosition', "The position of the panel, always 'bottom'"));
export const PanelAlignmentContext = new RawContextKey('panelAlignment', 'center', localize('panelAlignment', "The alignment of the panel, either 'center', 'left', 'right' or 'justify'"));
export const PanelVisibleContext = new RawContextKey('panelVisible', false, localize('panelVisible', "Whether the panel is visible"));
export const PanelMaximizedContext = new RawContextKey('panelMaximized', false, localize('panelMaximized', "Whether the panel is maximized"));
//#endregion
//#region < --- Views --- >
export const FocusedViewContext = new RawContextKey('focusedView', '', localize('focusedView', "The identifier of the view that has keyboard focus"));
export function getVisbileViewContextKey(viewId) { return `view.${viewId}.visible`; }
//#endregion
//#region < --- Resources --- >
let AbstractResourceContextKey = class AbstractResourceContextKey {
    static { AbstractResourceContextKey_1 = this; }
    // NOTE: DO NOT CHANGE THE DEFAULT VALUE TO ANYTHING BUT
    // UNDEFINED! IT IS IMPORTANT THAT DEFAULTS ARE INHERITED
    // FROM THE PARENT CONTEXT AND ONLY UNDEFINED DOES THIS
    static { this.Scheme = new RawContextKey('resourceScheme', undefined, { type: 'string', description: localize('resourceScheme', "The scheme of the resource") }); }
    static { this.Filename = new RawContextKey('resourceFilename', undefined, { type: 'string', description: localize('resourceFilename', "The file name of the resource") }); }
    static { this.Dirname = new RawContextKey('resourceDirname', undefined, { type: 'string', description: localize('resourceDirname', "The folder name the resource is contained in") }); }
    static { this.Path = new RawContextKey('resourcePath', undefined, { type: 'string', description: localize('resourcePath', "The full path of the resource") }); }
    static { this.LangId = new RawContextKey('resourceLangId', undefined, { type: 'string', description: localize('resourceLangId', "The language identifier of the resource") }); }
    static { this.Resource = new RawContextKey('resource', undefined, { type: 'URI', description: localize('resource', "The full value of the resource including scheme and path") }); }
    static { this.Extension = new RawContextKey('resourceExtname', undefined, { type: 'string', description: localize('resourceExtname', "The extension name of the resource") }); }
    static { this.HasResource = new RawContextKey('resourceSet', undefined, { type: 'boolean', description: localize('resourceSet', "Whether a resource is present or not") }); }
    static { this.IsFileSystemResource = new RawContextKey('isFileSystemResource', undefined, { type: 'boolean', description: localize('isFileSystemResource', "Whether the resource is backed by a file system provider") }); }
    constructor(_contextKeyService, _fileService, _languageService, _modelService) {
        this._contextKeyService = _contextKeyService;
        this._fileService = _fileService;
        this._languageService = _languageService;
        this._modelService = _modelService;
        this._schemeKey = AbstractResourceContextKey_1.Scheme.bindTo(this._contextKeyService);
        this._filenameKey = AbstractResourceContextKey_1.Filename.bindTo(this._contextKeyService);
        this._dirnameKey = AbstractResourceContextKey_1.Dirname.bindTo(this._contextKeyService);
        this._pathKey = AbstractResourceContextKey_1.Path.bindTo(this._contextKeyService);
        this._langIdKey = AbstractResourceContextKey_1.LangId.bindTo(this._contextKeyService);
        this._resourceKey = AbstractResourceContextKey_1.Resource.bindTo(this._contextKeyService);
        this._extensionKey = AbstractResourceContextKey_1.Extension.bindTo(this._contextKeyService);
        this._hasResource = AbstractResourceContextKey_1.HasResource.bindTo(this._contextKeyService);
        this._isFileSystemResource = AbstractResourceContextKey_1.IsFileSystemResource.bindTo(this._contextKeyService);
    }
    _setLangId() {
        const value = this.get();
        if (!value) {
            this._langIdKey.set(null);
            return;
        }
        const langId = this._modelService.getModel(value)?.getLanguageId() ?? this._languageService.guessLanguageIdByFilepathOrFirstLine(value);
        this._langIdKey.set(langId);
    }
    set(value) {
        value = value ?? undefined;
        if (isEqual(this._value, value)) {
            return;
        }
        this._value = value;
        this._contextKeyService.bufferChangeEvents(() => {
            this._resourceKey.set(value ? value.toString() : null);
            this._schemeKey.set(value ? value.scheme : null);
            this._filenameKey.set(value ? basename(value) : null);
            this._dirnameKey.set(value ? this.uriToPath(dirname(value)) : null);
            this._pathKey.set(value ? this.uriToPath(value) : null);
            this._setLangId();
            this._extensionKey.set(value ? extname(value) : null);
            this._hasResource.set(Boolean(value));
            this._isFileSystemResource.set(value ? this._fileService.hasProvider(value) : false);
        });
    }
    uriToPath(uri) {
        if (uri.scheme === Schemas.file) {
            return uri.fsPath;
        }
        return uri.path;
    }
    reset() {
        this._value = undefined;
        this._contextKeyService.bufferChangeEvents(() => {
            this._resourceKey.reset();
            this._schemeKey.reset();
            this._filenameKey.reset();
            this._dirnameKey.reset();
            this._pathKey.reset();
            this._langIdKey.reset();
            this._extensionKey.reset();
            this._hasResource.reset();
            this._isFileSystemResource.reset();
        });
    }
    get() {
        return this._value;
    }
};
AbstractResourceContextKey = AbstractResourceContextKey_1 = __decorate([
    __param(0, IContextKeyService),
    __param(1, IFileService),
    __param(2, ILanguageService),
    __param(3, IModelService)
], AbstractResourceContextKey);
let ResourceContextKey = class ResourceContextKey extends AbstractResourceContextKey {
    constructor(contextKeyService, fileService, languageService, modelService) {
        super(contextKeyService, fileService, languageService, modelService);
        this._disposables = new DisposableStore();
        this._disposables.add(fileService.onDidChangeFileSystemProviderRegistrations(() => {
            const resource = this.get();
            this._isFileSystemResource.set(Boolean(resource && fileService.hasProvider(resource)));
        }));
        this._disposables.add(modelService.onModelAdded(model => {
            if (isEqual(model.uri, this.get())) {
                this._setLangId();
            }
        }));
        this._disposables.add(modelService.onModelLanguageChanged(e => {
            if (isEqual(e.model.uri, this.get())) {
                this._setLangId();
            }
        }));
    }
    dispose() {
        this._disposables.dispose();
    }
};
ResourceContextKey = __decorate([
    __param(0, IContextKeyService),
    __param(1, IFileService),
    __param(2, ILanguageService),
    __param(3, IModelService)
], ResourceContextKey);
export { ResourceContextKey };
/**
 * This is a version of ResourceContextKey that is not disposable and has no listeners for model change events.
 * It will configure itself for the state/presence of a model only when created and not update.
 */
export class StaticResourceContextKey extends AbstractResourceContextKey {
}
//#endregion
export function applyAvailableEditorIds(contextKey, editor, editorResolverService) {
    if (!editor) {
        contextKey.set('');
        return;
    }
    const editors = getAvailableEditorIds(editor, editorResolverService);
    contextKey.set(editors.join(','));
}
function getAvailableEditorIds(editor, editorResolverService) {
    // Non text editor untitled files cannot be easily serialized between
    // extensions so instead we disable this context key to prevent common
    // commands that act on the active editor.
    if (editor.resource?.scheme === Schemas.untitled && editor.editorId !== DEFAULT_EDITOR_ASSOCIATION.id) {
        return [];
    }
    // Diff editors. The original and modified resources of a diff editor
    // *should* be the same, but calculate the set intersection just to be safe.
    if (editor instanceof DiffEditorInput) {
        const original = getAvailableEditorIds(editor.original, editorResolverService);
        const modified = new Set(getAvailableEditorIds(editor.modified, editorResolverService));
        return original.filter(editor => modified.has(editor));
    }
    // Normal editors.
    if (editor.resource) {
        return editorResolverService.getEditors(editor.resource).map(editor => editor.id);
    }
    return [];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dGtleXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUN4QyxPQUFPLEVBQUUsa0JBQWtCLEVBQWUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEgsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBR3ZELE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUN6RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFOUQsK0JBQStCO0FBRS9CLE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLElBQUksYUFBYSxDQUFTLGdCQUFnQixFQUFFLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSwySUFBMkksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN0UyxNQUFNLENBQUMsTUFBTSwyQkFBMkIsR0FBRyxJQUFJLGFBQWEsQ0FBUyxzQkFBc0IsRUFBRSxDQUFDLEVBQUUsUUFB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