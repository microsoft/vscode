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
var WindowTitle_1;
import { localize } from '../../../../nls.js';
import { dirname, basename } from '../../../../base/common/resources.js';
import { IConfigurationService, isConfigured } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { isWindows, isWeb, isMacintosh, isNative } from '../../../../base/common/platform.js';
import { trim } from '../../../../base/common/strings.js';
import { template } from '../../../../base/common/labels.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { Emitter } from '../../../../base/common/event.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Schemas } from '../../../../base/common/network.js';
import { getVirtualWorkspaceLocation } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { getWindowById } from '../../../../base/browser/dom.js';
import { IDecorationsService } from '../../../services/decorations/common/decorations.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
var WindowSettingNames;
(function (WindowSettingNames) {
    WindowSettingNames["titleSeparator"] = "window.titleSeparator";
    WindowSettingNames["title"] = "window.title";
})(WindowSettingNames || (WindowSettingNames = {}));
export const defaultWindowTitle = (() => {
    if (isMacintosh && isNative) {
        return '${activeEditorShort}${separator}${rootName}${separator}${profileName}'; // macOS has native dirty indicator
    }
    const base = '${dirty}${activeEditorShort}${separator}${rootName}${separator}${profileName}${separator}${appName}';
    if (isWeb) {
        return base + '${separator}${remoteName}'; // Web: always show remote name
    }
    return base;
})();
export const defaultWindowTitleSeparator = isMacintosh ? ' \u2014 ' : ' - ';
let WindowTitle = class WindowTitle extends Disposable {
    static { WindowTitle_1 = this; }
    static { this.NLS_USER_IS_ADMIN = isWindows ? localize('userIsAdmin', "[Administrator]") : localize('userIsSudo', "[Superuser]"); }
    static { this.NLS_EXTENSION_HOST = localize('devExtensionWindowTitlePrefix', "[Extension Development Host]"); }
    static { this.TITLE_DIRTY = '\u25cf '; }
    get value() { return this.title ?? ''; }
    get workspaceName() { return this.labelService.getWorkspaceLabel(this.contextService.getWorkspace()); }
    get fileName() {
        const activeEditor = this.editorService.activeEditor;
        if (!activeEditor) {
            return undefined;
        }
        const fileName = activeEditor.getTitle(0 /* Verbosity.SHORT */);
        const dirty = activeEditor?.isDirty() && !activeEditor.isSaving() ? WindowTitle_1.TITLE_DIRTY : '';
        return `${dirty}${fileName}`;
    }
    constructor(targetWindow, configurationService, contextKeyService, editorService, environmentService, contextService, labelService, userDataProfileService, productService, viewsService, decorationsService, accessibilityService) {
        super();
        this.configurationService = configurationService;
        this.contextKeyService = contextKeyService;
        this.editorService = editorService;
        this.environmentService = environmentService;
        this.contextService = contextService;
        this.labelService = labelService;
        this.userDataProfileService = userDataProfileService;
        this.productService = productService;
        this.viewsService = viewsService;
        this.decorationsService = decorationsService;
        this.accessibilityService = accessibilityService;
        this.properties = { isPure: true, isAdmin: false, prefix: undefined };
        this.variables = new Map();
        this.activeEditorListeners = this._register(new DisposableStore());
        this.titleUpdater = this._register(new RunOnceScheduler(() => this.doUpdateTitle(), 0));
        this.onDidChangeEmitter = this._register(new Emitter());
        this.onDidChange = this.onDidChangeEmitter.event;
        this.titleIncludesFocusedView = false;
        this.titleIncludesEditorState = false;
        this.windowId = targetWindow.vscodeWindowId;
        this.checkTitleVariables();
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChanged(e)));
        this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChange()));
        this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.titleUpdater.schedule()));
        this._register(this.contextService.onDidChangeWorkbenchState(() => this.titleUpdater.schedule()));
        this._register(this.contextService.onDidChangeWorkspaceName(() => this.titleUpdater.schedule()));
        this._register(this.labelService.onDidChangeFormatters(() => this.titleUpdater.schedule()));
        this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this.titleUpdater.schedule()));
        this._register(this.viewsService.onDidChangeFocusedView(() => {
            if (this.titleIncludesFocusedView) {
                this.titleUpdater.schedule();
            }
        }));
        this._register(this.contextKeyService.onDidChangeContext(e => {
            if (e.affectsSome(this.variables)) {
                this.titleUpdater.schedule();
            }
        }));
        this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.titleUpdater.schedule()));
    }
    onConfigurationChanged(event) {
        const affectsTitleConfiguration = event.affectsConfiguration("window.title" /* WindowSettingNames.title */);
        if (affectsTitleConfiguration) {
            this.checkTitleVariables();
        }
        if (affectsTitleConfiguration || event.affectsConfiguration("window.titleSeparator" /* WindowSettingNames.titleSeparator */)) {
            this.titleUpdater.schedule();
        }
    }
    checkTitleVariables() {
        const titleTemplate = this.configurationService.getValue("window.title" /* WindowSettingNames.title */);
        if (typeof titleTemplate === 'string') {
            this.titleIncludesFocusedView = titleTemplate.includes('${focusedView}');
            this.titleIncludesEditorState = titleTemplate.includes('${activeEditorState}');
        }
    }
    onActiveEditorChange() {
        // Dispose old listeners
        this.activeEditorListeners.clear();
        // Calculate New Window Title
        this.titleUpdater.schedule();
        // Apply listener for dirty and label changes
        const activeEditor = this.editorService.activeEditor;
        if (activeEditor) {
            this.activeEditorListeners.add(activeEditor.onDidChangeDirty(() => this.titleUpdater.schedule()));
            this.activeEditorListeners.add(activeEditor.onDidChangeLabel(() => this.titleUpdater.schedule()));
        }
        // Apply listeners for tracking focused code editor
        if (this.titleIncludesFocusedView) {
            const activeTextEditorControl = this.editorService.activeTextEditorControl;
            const textEditorControls = [];
            if (isCodeEditor(activeTextEditorControl)) {
                textEditorControls.push(activeTextEditorControl);
            }
            else if (isDiffEditor(activeTextEditorControl)) {
                textEditorControls.push(activeTextEditorControl.getOriginalEditor(), activeTextEditorControl.getModifiedEditor());
            }
            for (const textEditorControl of textEditorControls) {
                this.activeEditorListeners.add(textEditorControl.onDidBlurEditorText(() => this.titleUpdater.schedule()));
                this.activeEditorListeners.add(textEditorControl.onDidFocusEditorText(() => this.titleUpdater.schedule()));
            }
        }
        // Apply listener for decorations to track editor state
        if (this.titleIncludesEditorState) {
            this.activeEditorListeners.add(this.decorationsService.onDidChangeDecorations(() => this.titleUpdater.schedule()));
        }
    }
    doUpdateTitle() {
        const title = this.getFullWindowTitle();
        if (title !== this.title) {
            // Always set the native window title to identify us properly to the OS
            let nativeTitle = title;
            if (!trim(nativeTitle)) {
                nativeTitle = this.productService.nameLong;
            }
            const window = getWindowById(this.windowId, true).window;
            if (!window.document.title && isMacintosh && nativeTitle === this.productService.nameLong) {
                // TODO@electron macOS: if we set a window title for
                // the first time and it matches the one we set in
                // `windowImpl.ts` somehow the window does not appear
                // in the "Windows" menu. As such, we set the title
                // briefly to something different to ensure macOS
                // recognizes we have a window.
                // See: https://github.com/microsoft/vscode/issues/191288
                window.document.title = `${this.productService.nameLong} ${WindowTitle_1.TITLE_DIRTY}`;
            }
            window.document.title = nativeTitle;
            this.title = title;
            this.onDidChangeEmitter.fire();
        }
    }
    getFullWindowTitle() {
        const { prefix, suffix } = this.getTitleDecorations();
        let title = this.getWindowTitle() || this.productService.nameLong;
        if (prefix) {
            title = `${prefix} ${title}`;
        }
        if (suffix) {
            title = `${title} ${suffix}`;
        }
        // Replace non-space whitespace
        return title.replace(/[^\S ]/g, ' ');
    }
    getTitleDecorations() {
        let prefix;
        let suffix;
        if (this.properties.prefix) {
            prefix = this.properties.prefix;
        }
        if (this.environmentService.isExtensionDevelopment) {
            prefix = !prefix
                ? WindowTitle_1.NLS_EXTENSION_HOST
                : `${WindowTitle_1.NLS_EXTENSION_HOST} - ${prefix}`;
        }
        if (this.properties.isAdmin) {
            suffix = WindowTitle_1.NLS_USER_IS_ADMIN;
        }
        return { prefix, suffix };
    }
    updateProperties(properties) {
        const isAdmin = typeof properties.isAdmin === 'boolean' ? properties.isAdmin : this.properties.isAdmin;
        const isPure = typeof properties.isPure === 'boolean' ? properties.isPure : this.properties.isPure;
        const prefix = typeof properties.prefix === 'string' ? properties.prefix : this.properties.prefix;
        if (isAdmin !== this.properties.isAdmin || isPure !== this.properties.isPure || prefix !== this.properties.prefix) {
            this.properties.isAdmin = isAdmin;
            this.properties.isPure = isPure;
            this.properties.prefix = prefix;
            this.titleUpdater.schedule();
        }
    }
    registerVariables(variables) {
        let changed = false;
        for (const { name, contextKey } of variables) {
            if (!this.variables.has(contextKey)) {
                this.variables.set(contextKey, name);
                changed = true;
            }
        }
        if (changed) {
            this.titleUpdater.schedule();
        }
    }
    /**
     * Possible template values:
     *
     * {activeEditorLong}: e.g. /Users/Development/myFolder/myFileFolder/myFile.txt
     * {activeEditorMedium}: e.g. myFolder/myFileFolder/myFile.txt
     * {activeEditorShort}: e.g. myFile.txt
     * {activeEditorLanguageId}: e.g. typescript
     * {activeFolderLong}: e.g. /Users/Development/myFolder/myFileFolder
     * {activeFolderMedium}: e.g. myFolder/myFileFolder
     * {activeFolderShort}: e.g. myFileFolder
     * {rootName}: e.g. myFolder1, myFolder2, myFolder3
     * {rootPath}: e.g. /Users/Development
     * {folderName}: e.g. myFolder
     * {folderPath}: e.g. /Users/Development/myFolder
     * {appName}: e.g. VS Code
     * {remoteName}: e.g. SSH
     * {dirty}: indicator
     * {focusedView}: e.g. Terminal
     * {separator}: conditional separator
     * {activeEditorState}: e.g. Modified
     */
    getWindowTitle() {
        const editor = this.editorService.activeEditor;
        const workspace = this.contextService.getWorkspace();
        // Compute root
        let root;
        if (workspace.configuration) {
            root = workspace.configuration;
        }
        else if (workspace.folders.length) {
            root = workspace.folders[0].uri;
        }
        // Compute active editor folder
        const editorResource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
        let editorFolderResource = editorResource ? dirname(editorResource) : undefined;
        if (editorFolderResource?.path === '.') {
            editorFolderResource = undefined;
        }
        // Compute folder resource
        // Single Root Workspace: always the root single workspace in this case
        // Otherwise: root folder of the currently active file if any
        let folder = undefined;
        if (this.contextService.getWorkbenchState() === 2 /* WorkbenchState.FOLDER */) {
            folder = workspace.folders[0];
        }
        else if (editorResource) {
            folder = this.contextService.getWorkspaceFolder(editorResource) ?? undefined;
        }
        // Compute remote
        // vscode-remtoe: use as is
        // otherwise figure out if we have a virtual folder opened
        let remoteName = undefined;
        if (this.environmentService.remoteAuthority && !isWeb) {
            remoteName = this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.remoteAuthority);
        }
        else {
            const virtualWorkspaceLocation = getVirtualWorkspaceLocation(workspace);
            if (virtualWorkspaceLocation) {
                remoteName = this.labelService.getHostLabel(virtualWorkspaceLocation.scheme, virtualWorkspaceLocation.authority);
            }
        }
        // Variables
        const activeEditorShort = editor ? editor.getTitle(0 /* Verbosity.SHORT */) : '';
        const activeEditorMedium = editor ? editor.getTitle(1 /* Verbosity.MEDIUM */) : activeEditorShort;
        const activeEditorLong = editor ? editor.getTitle(2 /* Verbosity.LONG */) : activeEditorMedium;
        const activeFolderShort = editorFolderResource ? basename(editorFolderResource) : '';
        const activeFolderMedium = editorFolderResource ? this.labelService.getUriLabel(editorFolderResource, { relative: true }) : '';
        const activeFolderLong = editorFolderResource ? this.labelService.getUriLabel(editorFolderResource) : '';
        const rootName = this.labelService.getWorkspaceLabel(workspace);
        const rootNameShort = this.labelService.getWorkspaceLabel(workspace, { verbose: 0 /* LabelVerbosity.SHORT */ });
        const rootPath = root ? this.labelService.getUriLabel(root) : '';
        const folderName = folder ? folder.name : '';
        const folderPath = folder ? this.labelService.getUriLabel(folder.uri) : '';
        const dirty = editor?.isDirty() && !editor.isSaving() ? WindowTitle_1.TITLE_DIRTY : '';
        const appName = this.productService.nameLong;
        const profileName = this.userDataProfileService.currentProfile.isDefault ? '' : this.userDataProfileService.currentProfile.name;
        const focusedView = this.viewsService.getFocusedViewName();
        const activeEditorState = editorResource ? this.decorationsService.getDecoration(editorResource, false)?.tooltip : undefined;
        const activeEditorLanguageId = this.editorService.activeTextEditorLanguageId;
        const variables = {};
        for (const [contextKey, name] of this.variables) {
            variables[name] = this.contextKeyService.getContextKeyValue(contextKey) ?? '';
        }
        let titleTemplate = this.configurationService.getValue("window.title" /* WindowSettingNames.title */);
        if (typeof titleTemplate !== 'string') {
            titleTemplate = defaultWindowTitle;
        }
        if (!this.titleIncludesEditorState && this.accessibilityService.isScreenReaderOptimized() && this.configurationService.getValue('accessibility.windowTitleOptimized')) {
            titleTemplate += '${separator}${activeEditorState}';
        }
        let separator = this.configurationService.getValue("window.titleSeparator" /* WindowSettingNames.titleSeparator */);
        if (typeof separator !== 'string') {
            separator = defaultWindowTitleSeparator;
        }
        return template(titleTemplate, {
            ...variables,
            activeEditorShort,
            activeEditorLong,
            activeEditorMedium,
            activeEditorLanguageId,
            activeFolderShort,
            activeFolderMedium,
            activeFolderLong,
            rootName,
            rootPath,
            rootNameShort,
            folderName,
            folderPath,
            dirty,
            appName,
            remoteName,
            profileName,
            focusedView,
            activeEditorState,
            separator: { label: separator }
        });
    }
    isCustomTitleFormat() {
        if (this.accessibilityService.isScreenReaderOptimized() || this.titleIncludesEditorState) {
            return true;
        }
        const title = this.configurationService.inspect("window.title" /* WindowSettingNames.title */);
        const titleSeparator = this.configurationService.inspect("window.titleSeparator" /* WindowSettingNames.titleSeparator */);
        if (isConfigured(title) || isConfigured(titleSeparator)) {
            return true;
        }
        // Check if the default value is overridden from the configuration registry
        const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
        const configurationProperties = configurationRegistry.getConfigurationProperties();
        return title.defaultValue !== configurationProperties["window.title" /* WindowSettingNames.title */]?.defaultDefaultValue;
    }
};
WindowTitle = WindowTitle_1 = __decorate([
    __param(1, IConfigurationService),
    __param(2, IContextKeyService),
    __param(3, IEditorService),
    __param(4, IBrowserWorkbenchEnvironmentService),
    __param(5, IWorkspaceContextService),
    __param(6, ILabelService),
    __param(7, IUserDataProfileService),
    __param(8, IProductService),
    __param(9, IViewsService),
    __param(10, IDecorationsService),
    __param(11, IAccessibilityService)
], WindowTitle);
export { WindowTitle };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93VGl0bGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy90aXRsZWJhci93aW5kb3dUaXRsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFekUsT0FBTyxFQUFFLHFCQUFxQixFQUE2QixZQUFZLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM1SSxPQUFPLEVBQUUsVUFBVSxJQUFJLHVCQUF1QixFQUEwQixNQUFNLG9FQUFvRSxDQUFDO0FBQ25KLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsc0JBQXNCLEVBQWEsZ0JBQWdCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNoRyxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNsSCxPQUFPLEVBQUUsd0JBQXdCLEVBQW9DLE1BQU0sb0RBQW9ELENBQUM7QUFDaEksT0FBTyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTlGLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLGFBQWEsRUFBK0IsTUFBTSw0Q0FBNEMsQ0FB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