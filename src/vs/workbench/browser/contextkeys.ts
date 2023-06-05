/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IContextKeyService, IContextKey, setConstant as setConstantContextKey } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext, IsMacContext, IsLinuxContext, IsWindowsContext, IsWebContext, IsMacNativeContext, IsDevelopmentContext, IsIOSContext, ProductQualityContext, IsMobileContext } from 'vs/platform/contextkey/common/contextkeys';
import { SplitEditorsVertically, InEditorZenModeContext, ActiveEditorCanRevertContext, ActiveEditorGroupLockedContext, ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext, AuxiliaryBarVisibleContext, SideBarVisibleContext, PanelAlignmentContext, PanelMaximizedContext, PanelVisibleContext, ActiveEditorContext, EditorsVisibleContext, TextCompareEditorVisibleContext, TextCompareEditorActiveContext, ActiveEditorGroupEmptyContext, MultipleEditorGroupsContext, EmbedderIdentifierContext, EditorTabsVisibleContext, IsCenteredLayoutContext, ActiveEditorGroupIndexContext, ActiveEditorGroupLastContext, ActiveEditorReadonlyContext, EditorAreaVisibleContext, ActiveEditorAvailableEditorIdsContext, DirtyWorkingCopiesContext, EmptyWorkspaceSupportContext, EnterMultiRootWorkspaceSupportContext, HasWebFileSystemAccess, IsFullscreenContext, OpenFolderWorkspaceSupportContext, RemoteNameContext, VirtualWorkspaceContext, WorkbenchStateContext, WorkspaceFolderCountContext, PanelPositionContext, TemporaryWorkspaceContext, ActiveEditorCanToggleReadonlyContext } from 'vs/workbench/common/contextkeys';
import { TEXT_DIFF_EDITOR_ID, EditorInputCapabilities, SIDE_BY_SIDE_EDITOR_ID, DEFAULT_EDITOR_ASSOCIATION, EditorResourceAccessor, SideBySideEditor } from 'vs/workbench/common/editor';
import { trackFocus, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { preferredSideBySideGroupDirection, GroupDirection, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { WorkbenchState, IWorkspaceContextService, isTemporaryWorkspace } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchLayoutService, Parts, positionToString } from 'vs/workbench/services/layout/browser/layoutService';
import { getRemoteName } from 'vs/platform/remote/common/remoteHosts';
import { getVirtualWorkspaceScheme } from 'vs/platform/workspace/common/virtualWorkspace';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { isNative } from 'vs/base/common/platform';
import { IEditorResolverService } from 'vs/workbench/services/editor/common/editorResolverService';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { Schemas } from 'vs/base/common/network';
import { WebFileSystemAccess } from 'vs/platform/files/browser/webFileSystemAccess';
import { IProductService } from 'vs/platform/product/common/productService';
import { FileSystemProviderCapabilities, IFileService } from 'vs/platform/files/common/files';

export class WorkbenchContextKeysHandler extends Disposable {
	private inputFocusedContext: IContextKey<boolean>;

	private dirtyWorkingCopiesContext: IContextKey<boolean>;

	private activeEditorContext: IContextKey<string | null>;
	private activeEditorCanRevert: IContextKey<boolean>;
	private activeEditorCanSplitInGroup: IContextKey<boolean>;
	private activeEditorAvailableEditorIds: IContextKey<string>;

	private activeEditorIsReadonly: IContextKey<boolean>;
	private activeEditorCanToggleReadonly: IContextKey<boolean>;

	private activeEditorGroupEmpty: IContextKey<boolean>;
	private activeEditorGroupIndex: IContextKey<number>;
	private activeEditorGroupLast: IContextKey<boolean>;
	private activeEditorGroupLocked: IContextKey<boolean>;
	private multipleEditorGroupsContext: IContextKey<boolean>;

	private editorsVisibleContext: IContextKey<boolean>;

	private textCompareEditorVisibleContext: IContextKey<boolean>;
	private textCompareEditorActiveContext: IContextKey<boolean>;

	private sideBySideEditorActiveContext: IContextKey<boolean>;
	private splitEditorsVerticallyContext: IContextKey<boolean>;

	private workbenchStateContext: IContextKey<string>;
	private workspaceFolderCountContext: IContextKey<number>;

	private openFolderWorkspaceSupportContext: IContextKey<boolean>;
	private enterMultiRootWorkspaceSupportContext: IContextKey<boolean>;
	private emptyWorkspaceSupportContext: IContextKey<boolean>;

	private virtualWorkspaceContext: IContextKey<string>;
	private temporaryWorkspaceContext: IContextKey<boolean>;

	private inZenModeContext: IContextKey<boolean>;
	private isFullscreenContext: IContextKey<boolean>;
	private isCenteredLayoutContext: IContextKey<boolean>;
	private sideBarVisibleContext: IContextKey<boolean>;
	private editorAreaVisibleContext: IContextKey<boolean>;
	private panelPositionContext: IContextKey<string>;
	private panelVisibleContext: IContextKey<boolean>;
	private panelAlignmentContext: IContextKey<string>;
	private panelMaximizedContext: IContextKey<boolean>;
	private auxiliaryBarVisibleContext: IContextKey<boolean>;
	private editorTabsVisibleContext: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IProductService private readonly productService: IProductService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

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
		this.updateWorkspaceContextKeys();

		// Capabilities
		HasWebFileSystemAccess.bindTo(this.contextKeyService).set(WebFileSystemAccess.supported(window));

		// Development
		const isDevelopment = !this.environmentService.isBuilt || this.environmentService.isExtensionDevelopment;
		IsDevelopmentContext.bindTo(this.contextKeyService).set(isDevelopment);
		setConstantContextKey(IsDevelopmentContext.key, isDevelopment);

		// Product Service
		ProductQualityContext.bindTo(this.contextKeyService).set(this.productService.quality || '');
		EmbedderIdentifierContext.bindTo(this.contextKeyService).set(productService.embedderIdentifier);

		// Editors
		this.activeEditorContext = ActiveEditorContext.bindTo(this.contextKeyService);
		this.activeEditorIsReadonly = ActiveEditorReadonlyContext.bindTo(this.contextKeyService);
		this.activeEditorCanToggleReadonly = ActiveEditorCanToggleReadonlyContext.bindTo(this.contextKeyService);
		this.activeEditorCanRevert = ActiveEditorCanRevertContext.bindTo(this.contextKeyService);
		this.activeEditorCanSplitInGroup = ActiveEditorCanSplitInGroupContext.bindTo(this.contextKeyService);
		this.activeEditorAvailableEditorIds = ActiveEditorAvailableEditorIdsContext.bindTo(this.contextKeyService);
		this.editorsVisibleContext = EditorsVisibleContext.bindTo(this.contextKeyService);
		this.textCompareEditorVisibleContext = TextCompareEditorVisibleContext.bindTo(this.contextKeyService);
		this.textCompareEditorActiveContext = TextCompareEditorActiveContext.bindTo(this.contextKeyService);
		this.sideBySideEditorActiveContext = SideBySideEditorActiveContext.bindTo(this.contextKeyService);
		this.activeEditorGroupEmpty = ActiveEditorGroupEmptyContext.bindTo(this.contextKeyService);
		this.activeEditorGroupIndex = ActiveEditorGroupIndexContext.bindTo(this.contextKeyService);
		this.activeEditorGroupLast = ActiveEditorGroupLastContext.bindTo(this.contextKeyService);
		this.activeEditorGroupLocked = ActiveEditorGroupLockedContext.bindTo(this.contextKeyService);
		this.multipleEditorGroupsContext = MultipleEditorGroupsContext.bindTo(this.contextKeyService);

		// Working Copies
		this.dirtyWorkingCopiesContext = DirtyWorkingCopiesContext.bindTo(this.contextKeyService);
		this.dirtyWorkingCopiesContext.set(this.workingCopyService.hasDirty);

		// Inputs
		this.inputFocusedContext = InputFocusedContext.bindTo(this.contextKeyService);

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

		// Fullscreen
		this.isFullscreenContext = IsFullscreenContext.bindTo(this.contextKeyService);

		// Zen Mode
		this.inZenModeContext = InEditorZenModeContext.bindTo(this.contextKeyService);

		// Centered Layout
		this.isCenteredLayoutContext = IsCenteredLayoutContext.bindTo(this.contextKeyService);

		// Editor Area
		this.editorAreaVisibleContext = EditorAreaVisibleContext.bindTo(this.contextKeyService);
		this.editorTabsVisibleContext = EditorTabsVisibleContext.bindTo(this.contextKeyService);

		// Sidebar
		this.sideBarVisibleContext = SideBarVisibleContext.bindTo(this.contextKeyService);

		// Panel
		this.panelPositionContext = PanelPositionContext.bindTo(this.contextKeyService);
		this.panelPositionContext.set(positionToString(this.layoutService.getPanelPosition()));
		this.panelVisibleContext = PanelVisibleContext.bindTo(this.contextKeyService);
		this.panelVisibleContext.set(this.layoutService.isVisible(Parts.PANEL_PART));
		this.panelMaximizedContext = PanelMaximizedContext.bindTo(this.contextKeyService);
		this.panelMaximizedContext.set(this.layoutService.isPanelMaximized());
		this.panelAlignmentContext = PanelAlignmentContext.bindTo(this.contextKeyService);
		this.panelAlignmentContext.set(this.layoutService.getPanelAlignment());

		// Auxiliary Bar
		this.auxiliaryBarVisibleContext = AuxiliaryBarVisibleContext.bindTo(this.contextKeyService);
		this.auxiliaryBarVisibleContext.set(this.layoutService.isVisible(Parts.AUXILIARYBAR_PART));

		this.registerListeners();
	}

	private registerListeners(): void {
		this.editorGroupService.whenReady.then(() => {
			this.updateEditorAreaContextKeys();
			this.updateEditorContextKeys();
		});

		this._register(this.editorService.onDidActiveEditorChange(() => this.updateEditorContextKeys()));
		this._register(this.editorService.onDidVisibleEditorsChange(() => this.updateEditorContextKeys()));

		this._register(this.editorGroupService.onDidAddGroup(() => this.updateEditorContextKeys()));
		this._register(this.editorGroupService.onDidRemoveGroup(() => this.updateEditorContextKeys()));
		this._register(this.editorGroupService.onDidChangeGroupIndex(() => this.updateEditorContextKeys()));

		this._register(this.editorGroupService.onDidChangeActiveGroup(() => this.updateEditorGroupContextKeys()));
		this._register(this.editorGroupService.onDidChangeGroupLocked(() => this.updateEditorGroupContextKeys()));

		this._register(this.editorGroupService.onDidChangeEditorPartOptions(() => this.updateEditorAreaContextKeys()));

		this._register(addDisposableListener(window, EventType.FOCUS_IN, () => this.updateInputContextKeys(), true));

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
		this._register(this.layoutService.onDidChangeFullscreen(fullscreen => this.isFullscreenContext.set(fullscreen)));
		this._register(this.layoutService.onDidChangeCenteredLayout(centered => this.isCenteredLayoutContext.set(centered)));
		this._register(this.layoutService.onDidChangePanelPosition(position => this.panelPositionContext.set(position)));

		this._register(this.layoutService.onDidChangePanelAlignment(alignment => this.panelAlignmentContext.set(alignment)));

		this._register(this.paneCompositeService.onDidPaneCompositeClose(() => this.updateSideBarContextKeys()));
		this._register(this.paneCompositeService.onDidPaneCompositeOpen(() => this.updateSideBarContextKeys()));

		this._register(this.layoutService.onDidChangePartVisibility(() => {
			this.editorAreaVisibleContext.set(this.layoutService.isVisible(Parts.EDITOR_PART));
			this.panelVisibleContext.set(this.layoutService.isVisible(Parts.PANEL_PART));
			this.panelMaximizedContext.set(this.layoutService.isPanelMaximized());
			this.auxiliaryBarVisibleContext.set(this.layoutService.isVisible(Parts.AUXILIARYBAR_PART));
		}));

		this._register(this.workingCopyService.onDidChangeDirty(workingCopy => this.dirtyWorkingCopiesContext.set(workingCopy.isDirty() || this.workingCopyService.hasDirty)));
	}

	private updateEditorAreaContextKeys(): void {
		this.editorTabsVisibleContext.set(!!this.editorGroupService.partOptions.showTabs);
	}

	private updateEditorContextKeys(): void {
		const activeEditorPane = this.editorService.activeEditorPane;
		const visibleEditorPanes = this.editorService.visibleEditorPanes;

		this.textCompareEditorActiveContext.set(activeEditorPane?.getId() === TEXT_DIFF_EDITOR_ID);
		this.textCompareEditorVisibleContext.set(visibleEditorPanes.some(editorPane => editorPane.getId() === TEXT_DIFF_EDITOR_ID));

		this.sideBySideEditorActiveContext.set(activeEditorPane?.getId() === SIDE_BY_SIDE_EDITOR_ID);

		if (visibleEditorPanes.length > 0) {
			this.editorsVisibleContext.set(true);
		} else {
			this.editorsVisibleContext.reset();
		}

		if (!this.editorService.activeEditor) {
			this.activeEditorGroupEmpty.set(true);
		} else {
			this.activeEditorGroupEmpty.reset();
		}

		this.updateEditorGroupContextKeys();

		if (activeEditorPane) {
			this.activeEditorContext.set(activeEditorPane.getId());
			this.activeEditorCanRevert.set(!activeEditorPane.input.hasCapability(EditorInputCapabilities.Untitled));
			this.activeEditorCanSplitInGroup.set(activeEditorPane.input.hasCapability(EditorInputCapabilities.CanSplitInGroup));

			const activeEditorResource = activeEditorPane.input.resource;
			const editors = activeEditorResource ? this.editorResolverService.getEditors(activeEditorResource).map(editor => editor.id) : [];
			if (activeEditorResource?.scheme === Schemas.untitled && activeEditorPane.input.editorId !== DEFAULT_EDITOR_ASSOCIATION.id) {
				// Non text editor untitled files cannot be easily serialized between extensions
				// so instead we disable this context key to prevent common commands that act on the active editor
				this.activeEditorAvailableEditorIds.set('');
			} else {
				this.activeEditorAvailableEditorIds.set(editors.join(','));
			}

			this.activeEditorIsReadonly.set(activeEditorPane.input.hasCapability(EditorInputCapabilities.Readonly));
			const primaryEditorResource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.PRIMARY });
			this.activeEditorCanToggleReadonly.set(!!primaryEditorResource && this.fileService.hasProvider(primaryEditorResource) && !this.fileService.hasCapability(primaryEditorResource, FileSystemProviderCapabilities.Readonly));
		} else {
			this.activeEditorContext.reset();
			this.activeEditorIsReadonly.reset();
			this.activeEditorCanToggleReadonly.reset();
			this.activeEditorCanRevert.reset();
			this.activeEditorCanSplitInGroup.reset();
			this.activeEditorAvailableEditorIds.reset();
		}
	}

	private updateEditorGroupContextKeys(): void {
		const groupCount = this.editorGroupService.count;
		if (groupCount > 1) {
			this.multipleEditorGroupsContext.set(true);
		} else {
			this.multipleEditorGroupsContext.reset();
		}

		const activeGroup = this.editorGroupService.activeGroup;
		this.activeEditorGroupIndex.set(activeGroup.index + 1); // not zero-indexed
		this.activeEditorGroupLast.set(activeGroup.index === groupCount - 1);
		this.activeEditorGroupLocked.set(activeGroup.isLocked);
	}

	private updateInputContextKeys(): void {

		function activeElementIsInput(): boolean {
			return !!document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
		}

		const isInputFocused = activeElementIsInput();
		this.inputFocusedContext.set(isInputFocused);

		if (isInputFocused) {
			const tracker = trackFocus(document.activeElement as HTMLElement);
			Event.once(tracker.onDidBlur)(() => {
				this.inputFocusedContext.set(activeElementIsInput());

				tracker.dispose();
			});
		}
	}

	private updateWorkbenchStateContextKey(): void {
		this.workbenchStateContext.set(this.getWorkbenchStateString());
	}

	private updateWorkspaceFolderCountContextKey(): void {
		this.workspaceFolderCountContext.set(this.contextService.getWorkspace().folders.length);
	}

	private updateSplitEditorsVerticallyContext(): void {
		const direction = preferredSideBySideGroupDirection(this.configurationService);
		this.splitEditorsVerticallyContext.set(direction === GroupDirection.DOWN);
	}

	private getWorkbenchStateString(): string {
		switch (this.contextService.getWorkbenchState()) {
			case WorkbenchState.EMPTY: return 'empty';
			case WorkbenchState.FOLDER: return 'folder';
			case WorkbenchState.WORKSPACE: return 'workspace';
		}
	}

	private updateSideBarContextKeys(): void {
		this.sideBarVisibleContext.set(this.layoutService.isVisible(Parts.SIDEBAR_PART));
	}

	private updateWorkspaceContextKeys(): void {
		this.virtualWorkspaceContext.set(getVirtualWorkspaceScheme(this.contextService.getWorkspace()) || '');
		this.temporaryWorkspaceContext.set(isTemporaryWorkspace(this.contextService.getWorkspace()));
	}
}
