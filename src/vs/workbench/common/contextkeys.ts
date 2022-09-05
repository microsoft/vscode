/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IContextKeyService, IContextKey, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { basename, dirname, extname, isEqual } from 'vs/base/common/resources';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IFileService } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/model';

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

export const IsFullscreenContext = new RawContextKey<boolean>('isFullscreen', false, localize('isFullscreen', "Whether the window is in fullscreen mode"));

export const HasWebFileSystemAccess = new RawContextKey<boolean>('hasWebFileSystemAccess', false, true); // Support for FileSystemAccess web APIs (https://wicg.github.io/file-system-access)

//#endregion


//#region < --- Editor --- >

// Editor State Context Keys
export const ActiveEditorDirtyContext = new RawContextKey<boolean>('activeEditorIsDirty', false, localize('activeEditorIsDirty', "Whether the active editor has unsaved changes"));
export const ActiveEditorPinnedContext = new RawContextKey<boolean>('activeEditorIsNotPreview', false, localize('activeEditorIsNotPreview', "Whether the active editor is not in preview mode"));
export const ActiveEditorFirstInGroupContext = new RawContextKey<boolean>('activeEditorIsFirstInGroup', false, localize('activeEditorIsFirstInGroup', "Whether the active editor is the first one in its group"));
export const ActiveEditorLastInGroupContext = new RawContextKey<boolean>('activeEditorIsLastInGroup', false, localize('activeEditorIsLastInGroup', "Whether the active editor is the last one in its group"));
export const ActiveEditorStickyContext = new RawContextKey<boolean>('activeEditorIsPinned', false, localize('activeEditorIsPinned', "Whether the active editor is pinned"));
export const ActiveEditorReadonlyContext = new RawContextKey<boolean>('activeEditorIsReadonly', false, localize('activeEditorIsReadonly', "Whether the active editor is readonly"));
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

// Editor Layout Context Keys
export const EditorsVisibleContext = new RawContextKey<boolean>('editorIsOpen', false, localize('editorIsOpen', "Whether an editor is open"));
export const InEditorZenModeContext = new RawContextKey<boolean>('inZenMode', false, localize('inZenMode', "Whether Zen mode is enabled"));
export const IsCenteredLayoutContext = new RawContextKey<boolean>('isCenteredLayout', false, localize('isCenteredLayout', "Whether centered layout is enabled"));
export const SplitEditorsVertically = new RawContextKey<boolean>('splitEditorsVertically', false, localize('splitEditorsVertically', "Whether editors split vertically"));
export const EditorAreaVisibleContext = new RawContextKey<boolean>('editorAreaVisible', true, localize('editorAreaVisible', "Whether the editor area is visible"));
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
export function getEnabledViewContainerContextKey(viewContainerId: string): string { return `viewContainer.${viewContainerId}.enabled`; }

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
		@IModelService private readonly _modelService: IModelService,
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
		this._resourceKey.set(value ? value.toString() : null);
		this._schemeKey.set(value ? value.scheme : null);
		this._filenameKey.set(value ? basename(value) : null);
		this._dirnameKey.set(value ? dirname(value).fsPath : null);
		this._pathKey.set(value ? value.fsPath : null);
		this._setLangId();
		this._extensionKey.set(value ? extname(value) : null);
		this._hasResource.set(Boolean(value));
		this._isFileSystemResource.set(value ? this._fileService.hasProvider(value) : false);
	}

	reset(): void {
		this._value = undefined;
		this._resourceKey.reset();
		this._schemeKey.reset();
		this._filenameKey.reset();
		this._dirnameKey.reset();
		this._pathKey.reset();
		this._langIdKey.reset();
		this._extensionKey.reset();
		this._hasResource.reset();
		this._isFileSystemResource.reset();
	}

	get(): URI | undefined {
		return this._value;
	}
}

//#endregion
