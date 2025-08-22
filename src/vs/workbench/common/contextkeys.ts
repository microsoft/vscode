/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../base/common/lifecycle.js';
import { URI } from '../../base/common/uri.js';
import { localize } from '../../nls.js';
import { IContextKeyService, IContextKey, RawContextKey } from '../../platform/contextkey/common/contextkey.js';
import { basename, dirname, extname, isEqual } from '../../base/common/resources.js';
import { ILanguageService } from '../../editor/common/languages/language.js';
import { IFileService } from '../../platform/files/common/files.js';
import { IModelService } from '../../editor/common/services/model.js';
import { Schemas } from '../../base/common/network.js';
import { EditorInput } from './editor/editorInput.js';
import { IEditorResolverService } from '../services/editor/common/editorResolverService.js';
import { DEFAULT_EDITOR_ASSOCIATION } from './editor.js';
import { DiffEditorInput } from './editor/diffEditorInput.js';

//#region < --- Workbench --- >

export const WorkbenchStateContext = new RawContextKey<string>('workbenchState', undefined, { type: 'string', description: localize('workbenchState', "The kind of workspace opened in the window, either 'empty' (no workspace), 'folder' (single folder) or 'workspace' (multi-root workspace)") });
export const WorkspaceFolderCountContext = new RawContextKey<number>('workspaceFolderCount', 0, localize('workspaceFolderCount', "The number of root folders in the workspace"));

export const OpenFolderWorkspaceSupportContext = new RawContextKey<boolean>('openFolderWorkspaceSupport', true, true);
export const EnterMultiRootWorkspaceSupportContext = new RawContextKey<boolean>('enterMultiRootWorkspaceSupport', true, true);
export const EmptyWorkspaceSupportContext = new RawContextKey<boolean>('emptyWorkspaceSupport', true, true);

export const DirtyWorkingCopiesContext = new RawContextKey<boolean>('dirtyWorkingCopies', false, localize('dirtyWorkingCopies', "Whether there are any working copies with unsaved changes"));

export const RemoteNameContext = new RawContextKey<string>('remoteName', '', localize('remoteName', "The name of the remote the window is connected to or an empty string if not connected to any remote"));

export const VirtualWorkspaceContext = new RawContextKey<string>('virtualWorkspace', '', localize('virtualWorkspace', "The scheme of the current workspace is from a virtual file system or an empty string."));
export const TemporaryWorkspaceContext = new RawContextKey<boolean>('temporaryWorkspace', false, localize('temporaryWorkspace', "The scheme of the current workspace is from a temporary file system."));

export const HasWebFileSystemAccess = new RawContextKey<boolean>('hasWebFileSystemAccess', false, true); // Support for FileSystemAccess web APIs (https://wicg.github.io/file-system-access)

export const EmbedderIdentifierContext = new RawContextKey<string | undefined>('embedderIdentifier', undefined, localize('embedderIdentifier', 'The identifier of the embedder according to the product service, if one is defined'));

export const InAutomationContext = new RawContextKey<boolean>('inAutomation', false, localize('inAutomation', "Whether VS Code is running under automation/smoke test"));

//#endregion

//#region < --- Window --- >

export const IsMainWindowFullscreenContext = new RawContextKey<boolean>('isFullscreen', false, localize('isFullscreen', "Whether the main window is in fullscreen mode"));
export const IsAuxiliaryWindowFocusedContext = new RawContextKey<boolean>('isAuxiliaryWindowFocusedContext', false, localize('isAuxiliaryWindowFocusedContext', "Whether an auxiliary window is focused"));

export const IsWindowAlwaysOnTopContext = new RawContextKey<boolean>('isWindowAlwaysOnTop', false, localize('isWindowAlwaysOnTop', "Whether the window is always on top"));

export const IsAuxiliaryWindowContext = new RawContextKey<boolean>('isAuxiliaryWindow', false, localize('isAuxiliaryWindow', "Window is an auxiliary window"));


//#endregion


//#region < --- Editor --- >

// Editor State Context Keys
export const ActiveEditorDirtyContext = new RawContextKey<boolean>('activeEditorIsDirty', false, localize('activeEditorIsDirty', "Whether the active editor has unsaved changes"));
export const ActiveEditorPinnedContext = new RawContextKey<boolean>('activeEditorIsNotPreview', false, localize('activeEditorIsNotPreview', "Whether the active editor is not in preview mode"));
export const ActiveEditorFirstInGroupContext = new RawContextKey<boolean>('activeEditorIsFirstInGroup', false, localize('activeEditorIsFirstInGroup', "Whether the active editor is the first one in its group"));
export const ActiveEditorLastInGroupContext = new RawContextKey<boolean>('activeEditorIsLastInGroup', false, localize('activeEditorIsLastInGroup', "Whether the active editor is the last one in its group"));
export const ActiveEditorStickyContext = new RawContextKey<boolean>('activeEditorIsPinned', false, localize('activeEditorIsPinned', "Whether the active editor is pinned"));
export const ActiveEditorReadonlyContext = new RawContextKey<boolean>('activeEditorIsReadonly', false, localize('activeEditorIsReadonly', "Whether the active editor is read-only"));
export const ActiveCompareEditorCanSwapContext = new RawContextKey<boolean>('activeCompareEditorCanSwap', false, localize('activeCompareEditorCanSwap', "Whether the active compare editor can swap sides"));
export const ActiveEditorCanToggleReadonlyContext = new RawContextKey<boolean>('activeEditorCanToggleReadonly', true, localize('activeEditorCanToggleReadonly', "Whether the active editor can toggle between being read-only or writeable"));
export const ActiveEditorCanRevertContext = new RawContextKey<boolean>('activeEditorCanRevert', false, localize('activeEditorCanRevert', "Whether the active editor can revert"));
export const ActiveEditorCanSplitInGroupContext = new RawContextKey<boolean>('activeEditorCanSplitInGroup', true);

// Editor Kind Context Keys
export const ActiveEditorContext = new RawContextKey<string | null>('activeEditor', null, { type: 'string', description: localize('activeEditor', "The identifier of the active editor") });
export const ActiveEditorAvailableEditorIdsContext = new RawContextKey<string>('activeEditorAvailableEditorIds', '', localize('activeEditorAvailableEditorIds', "The available editor identifiers that are usable for the active editor"));
export const TextCompareEditorVisibleContext = new RawContextKey<boolean>('textCompareEditorVisible', false, localize('textCompareEditorVisible', "Whether a text compare editor is visible"));
export const TextCompareEditorActiveContext = new RawContextKey<boolean>('textCompareEditorActive', false, localize('textCompareEditorActive', "Whether a text compare editor is active"));
export const SideBySideEditorActiveContext = new RawContextKey<boolean>('sideBySideEditorActive', false, localize('sideBySideEditorActive', "Whether a side by side editor is active"));

// Editor Group Context Keys
export const EditorGroupEditorsCountContext = new RawContextKey<number>('groupEditorsCount', 0, localize('groupEditorsCount', "The number of opened editor groups"));
export const ActiveEditorGroupEmptyContext = new RawContextKey<boolean>('activeEditorGroupEmpty', false, localize('activeEditorGroupEmpty', "Whether the active editor group is empty"));
export const ActiveEditorGroupIndexContext = new RawContextKey<number>('activeEditorGroupIndex', 0, localize('activeEditorGroupIndex', "The index of the active editor group"));
export const ActiveEditorGroupLastContext = new RawContextKey<boolean>('activeEditorGroupLast', false, localize('activeEditorGroupLast', "Whether the active editor group is the last group"));
export const ActiveEditorGroupLockedContext = new RawContextKey<boolean>('activeEditorGroupLocked', false, localize('activeEditorGroupLocked', "Whether the active editor group is locked"));
export const MultipleEditorGroupsContext = new RawContextKey<boolean>('multipleEditorGroups', false, localize('multipleEditorGroups', "Whether there are multiple editor groups opened"));
export const SingleEditorGroupsContext = MultipleEditorGroupsContext.toNegated();
export const MultipleEditorsSelectedInGroupContext = new RawContextKey<boolean>('multipleEditorsSelectedInGroup', false, localize('multipleEditorsSelectedInGroup', "Whether multiple editors have been selected in an editor group"));
export const TwoEditorsSelectedInGroupContext = new RawContextKey<boolean>('twoEditorsSelectedInGroup', false, localize('twoEditorsSelectedInGroup', "Whether exactly two editors have been selected in an editor group"));
export const SelectedEditorsInGroupFileOrUntitledResourceContextKey = new RawContextKey<boolean>('SelectedEditorsInGroupFileOrUntitledResourceContextKey', true, localize('SelectedEditorsInGroupFileOrUntitledResourceContextKey', "Whether all selected editors in a group have a file or untitled resource associated"));

// Editor Part Context Keys
export const EditorPartMultipleEditorGroupsContext = new RawContextKey<boolean>('editorPartMultipleEditorGroups', false, localize('editorPartMultipleEditorGroups', "Whether there are multiple editor groups opened in an editor part"));
export const EditorPartSingleEditorGroupsContext = EditorPartMultipleEditorGroupsContext.toNegated();
export const EditorPartMaximizedEditorGroupContext = new RawContextKey<boolean>('editorPartMaximizedEditorGroup', false, localize('editorPartEditorGroupMaximized', "Editor Part has a maximized group"));

// Editor Layout Context Keys
export const EditorsVisibleContext = new RawContextKey<boolean>('editorIsOpen', false, localize('editorIsOpen', "Whether an editor is open"));
export const InEditorZenModeContext = new RawContextKey<boolean>('inZenMode', false, localize('inZenMode', "Whether Zen mode is enabled"));
export const IsMainEditorCenteredLayoutContext = new RawContextKey<boolean>('isCenteredLayout', false, localize('isMainEditorCenteredLayout', "Whether centered layout is enabled for the main editor"));
export const SplitEditorsVertically = new RawContextKey<boolean>('splitEditorsVertically', false, localize('splitEditorsVertically', "Whether editors split vertically"));
export const MainEditorAreaVisibleContext = new RawContextKey<boolean>('mainEditorAreaVisible', true, localize('mainEditorAreaVisible', "Whether the editor area in the main window is visible"));
export const EditorTabsVisibleContext = new RawContextKey<boolean>('editorTabsVisible', true, localize('editorTabsVisible', "Whether editor tabs are visible"));

//#endregion


//#region < --- Side Bar --- >

export const SideBarVisibleContext = new RawContextKey<boolean>('sideBarVisible', false, localize('sideBarVisible', "Whether the sidebar is visible"));
export const SidebarFocusContext = new RawContextKey<boolean>('sideBarFocus', false, localize('sideBarFocus', "Whether the sidebar has keyboard focus"));
export const ActiveViewletContext = new RawContextKey<string>('activeViewlet', '', localize('activeViewlet', "The identifier of the active viewlet"));

//#endregion


//#region < --- Status Bar --- >

export const StatusBarFocused = new RawContextKey<boolean>('statusBarFocused', false, localize('statusBarFocused', "Whether the status bar has keyboard focus"));

//#endregion

//#region < --- Title Bar --- >

export const TitleBarStyleContext = new RawContextKey<string>('titleBarStyle', 'custom', localize('titleBarStyle', "Style of the window title bar"));
export const TitleBarVisibleContext = new RawContextKey<boolean>('titleBarVisible', false, localize('titleBarVisible', "Whether the title bar is visible"));
export const IsCompactTitleBarContext = new RawContextKey<boolean>('isCompactTitleBar', false, localize('isCompactTitleBar', "Title bar is in compact mode"));

//#endregion


//#region < --- Banner --- >

export const BannerFocused = new RawContextKey<boolean>('bannerFocused', false, localize('bannerFocused', "Whether the banner has keyboard focus"));

//#endregion


//#region < --- Notifications --- >

export const NotificationFocusedContext = new RawContextKey<boolean>('notificationFocus', true, localize('notificationFocus', "Whether a notification has keyboard focus"));
export const NotificationsCenterVisibleContext = new RawContextKey<boolean>('notificationCenterVisible', false, localize('notificationCenterVisible', "Whether the notifications center is visible"));
export const NotificationsToastsVisibleContext = new RawContextKey<boolean>('notificationToastsVisible', false, localize('notificationToastsVisible', "Whether a notification toast is visible"));

//#endregion


//#region < --- Auxiliary Bar --- >

export const ActiveAuxiliaryContext = new RawContextKey<string>('activeAuxiliary', '', localize('activeAuxiliary', "The identifier of the active auxiliary panel"));
export const AuxiliaryBarFocusContext = new RawContextKey<boolean>('auxiliaryBarFocus', false, localize('auxiliaryBarFocus', "Whether the auxiliary bar has keyboard focus"));
export const AuxiliaryBarVisibleContext = new RawContextKey<boolean>('auxiliaryBarVisible', false, localize('auxiliaryBarVisible', "Whether the auxiliary bar is visible"));
export const AuxiliaryBarMaximizedContext = new RawContextKey<boolean>('auxiliaryBarMaximized', false, localize('auxiliaryBarMaximized', "Whether the auxiliary bar is maximized"));

//#endregion


//#region < --- Panel --- >

export const ActivePanelContext = new RawContextKey<string>('activePanel', '', localize('activePanel', "The identifier of the active panel"));
export const PanelFocusContext = new RawContextKey<boolean>('panelFocus', false, localize('panelFocus', "Whether the panel has keyboard focus"));
export const PanelPositionContext = new RawContextKey<string>('panelPosition', 'bottom', localize('panelPosition', "The position of the panel, always 'bottom'"));
export const PanelAlignmentContext = new RawContextKey<string>('panelAlignment', 'center', localize('panelAlignment', "The alignment of the panel, either 'center', 'left', 'right' or 'justify'"));
export const PanelVisibleContext = new RawContextKey<boolean>('panelVisible', false, localize('panelVisible', "Whether the panel is visible"));
export const PanelMaximizedContext = new RawContextKey<boolean>('panelMaximized', false, localize('panelMaximized', "Whether the panel is maximized"));

//#endregion


//#region < --- Views --- >

export const FocusedViewContext = new RawContextKey<string>('focusedView', '', localize('focusedView', "The identifier of the view that has keyboard focus"));
export function getVisbileViewContextKey(viewId: string): string { return `view.${viewId}.visible`; }

//#endregion


//#region < --- Resources --- >

export class ResourceContextKey {

	// NOTE: DO NOT CHANGE THE DEFAULT VALUE TO ANYTHING BUT
	// UNDEFINED! IT IS IMPORTANT THAT DEFAULTS ARE INHERITED
	// FROM THE PARENT CONTEXT AND ONLY UNDEFINED DOES THIS

	static readonly Scheme = new RawContextKey<string>('resourceScheme', undefined, { type: 'string', description: localize('resourceScheme', "The scheme of the resource") });
	static readonly Filename = new RawContextKey<string>('resourceFilename', undefined, { type: 'string', description: localize('resourceFilename', "The file name of the resource") });
	static readonly Dirname = new RawContextKey<string>('resourceDirname', undefined, { type: 'string', description: localize('resourceDirname', "The folder name the resource is contained in") });
	static readonly Path = new RawContextKey<string>('resourcePath', undefined, { type: 'string', description: localize('resourcePath', "The full path of the resource") });
	static readonly LangId = new RawContextKey<string>('resourceLangId', undefined, { type: 'string', description: localize('resourceLangId', "The language identifier of the resource") });
	static readonly Resource = new RawContextKey<string>('resource', undefined, { type: 'URI', description: localize('resource', "The full value of the resource including scheme and path") });
	static readonly Extension = new RawContextKey<string>('resourceExtname', undefined, { type: 'string', description: localize('resourceExtname', "The extension name of the resource") });
	static readonly HasResource = new RawContextKey<boolean>('resourceSet', undefined, { type: 'boolean', description: localize('resourceSet', "Whether a resource is present or not") });
	static readonly IsFileSystemResource = new RawContextKey<boolean>('isFileSystemResource', undefined, { type: 'boolean', description: localize('isFileSystemResource', "Whether the resource is backed by a file system provider") });

	private readonly _disposables = new DisposableStore();

	private _value: URI | undefined;
	private readonly _resourceKey: IContextKey<string | null>;
	private readonly _schemeKey: IContextKey<string | null>;
	private readonly _filenameKey: IContextKey<string | null>;
	private readonly _dirnameKey: IContextKey<string | null>;
	private readonly _pathKey: IContextKey<string | null>;
	private readonly _langIdKey: IContextKey<string | null>;
	private readonly _extensionKey: IContextKey<string | null>;
	private readonly _hasResource: IContextKey<boolean>;
	private readonly _isFileSystemResource: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IFileService private readonly _fileService: IFileService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IModelService private readonly _modelService: IModelService
	) {
		this._schemeKey = ResourceContextKey.Scheme.bindTo(this._contextKeyService);
		this._filenameKey = ResourceContextKey.Filename.bindTo(this._contextKeyService);
		this._dirnameKey = ResourceContextKey.Dirname.bindTo(this._contextKeyService);
		this._pathKey = ResourceContextKey.Path.bindTo(this._contextKeyService);
		this._langIdKey = ResourceContextKey.LangId.bindTo(this._contextKeyService);
		this._resourceKey = ResourceContextKey.Resource.bindTo(this._contextKeyService);
		this._extensionKey = ResourceContextKey.Extension.bindTo(this._contextKeyService);
		this._hasResource = ResourceContextKey.HasResource.bindTo(this._contextKeyService);
		this._isFileSystemResource = ResourceContextKey.IsFileSystemResource.bindTo(this._contextKeyService);

		this._disposables.add(_fileService.onDidChangeFileSystemProviderRegistrations(() => {
			const resource = this.get();
			this._isFileSystemResource.set(Boolean(resource && _fileService.hasProvider(resource)));
		}));

		this._disposables.add(_modelService.onModelAdded(model => {
			if (isEqual(model.uri, this.get())) {
				this._setLangId();
			}
		}));
		this._disposables.add(_modelService.onModelLanguageChanged(e => {
			if (isEqual(e.model.uri, this.get())) {
				this._setLangId();
			}
		}));
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private _setLangId(): void {
		const value = this.get();
		if (!value) {
			this._langIdKey.set(null);
			return;
		}
		const langId = this._modelService.getModel(value)?.getLanguageId() ?? this._languageService.guessLanguageIdByFilepathOrFirstLine(value);
		this._langIdKey.set(langId);
	}

	set(value: URI | null | undefined) {
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

	private uriToPath(uri: URI): string {
		if (uri.scheme === Schemas.file) {
			return uri.fsPath;
		}

		return uri.path;
	}

	reset(): void {
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

	get(): URI | undefined {
		return this._value;
	}
}

//#endregion

export function applyAvailableEditorIds(contextKey: IContextKey<string>, editor: EditorInput | undefined | null, editorResolverService: IEditorResolverService): void {
	if (!editor) {
		contextKey.set('');
		return;
	}

	const editors = getAvailableEditorIds(editor, editorResolverService);
	contextKey.set(editors.join(','));
}

function getAvailableEditorIds(editor: EditorInput, editorResolverService: IEditorResolverService): string[] {
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
