/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext } from 'vs/platform/contextkey/common/contextkeys';
import { IWindowConfiguration, IWindowService } from 'vs/platform/windows/common/windows';
import { ActiveEditorContext, EditorsVisibleContext, TextCompareEditorVisibleContext, TextCompareEditorActiveContext, ActiveEditorGroupEmptyContext, MultipleEditorGroupsContext, TEXT_DIFF_EDITOR_ID, SplitEditorsVertically, InEditorZenModeContext } from 'vs/workbench/common/editor';
import { IsMacContext, IsLinuxContext, IsWindowsContext, HasMacNativeTabsContext, IsDevelopmentContext, SupportsWorkspacesContext, SupportsOpenFileFolderContext, WorkbenchStateContext, WorkspaceFolderCountContext } from 'vs/workbench/common/contextkeys';
import { trackFocus, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { preferredSideBySideGroupDirection, GroupDirection, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { WorkbenchState, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EditorGroupsServiceImpl } from 'vs/workbench/browser/parts/editor/editor';
import { SidebarVisibleContext } from 'vs/workbench/common/viewlet';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';

export class WorkbenchContextKeysHandler extends Disposable {
	private inputFocusedContext: IContextKey<boolean>;

	private activeEditorContext: IContextKey<string | null>;
	private editorsVisibleContext: IContextKey<boolean>;
	private textCompareEditorVisibleContext: IContextKey<boolean>;
	private textCompareEditorActiveContext: IContextKey<boolean>;
	private activeEditorGroupEmpty: IContextKey<boolean>;
	private multipleEditorGroupsContext: IContextKey<boolean>;
	private splitEditorsVerticallyContext: IContextKey<boolean>;

	private workbenchStateContext: IContextKey<string>;
	private workspaceFolderCountContext: IContextKey<number>;


	private inZenModeContext: IContextKey<boolean>;

	private sideBarVisibleContext: IContextKey<boolean>;

	constructor(
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWindowService private windowService: IWindowService,
		@IEditorService private editorService: IEditorService,
		@IEditorGroupsService private editorGroupService: EditorGroupsServiceImpl,
		@IPartService private partService: IPartService,
		@IViewletService private viewletService: IViewletService
	) {
		super();

		this.initContextKeys();
		this.registerListeners();
	}

	private registerListeners(): void {
		this.editorGroupService.whenRestored.then(() => this.updateEditorContextKeys());

		this._register(this.editorService.onDidActiveEditorChange(() => this.updateEditorContextKeys()));
		this._register(this.editorService.onDidVisibleEditorsChange(() => this.updateEditorContextKeys()));
		this._register(this.editorGroupService.onDidAddGroup(() => this.updateEditorContextKeys()));
		this._register(this.editorGroupService.onDidRemoveGroup(() => this.updateEditorContextKeys()));

		this._register(addDisposableListener(window, EventType.FOCUS_IN, () => this.updateInputContextKeys(), true));

		this._register(this.contextService.onDidChangeWorkbenchState(() => this.updateWorkbenchStateContextKey()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.updateWorkspaceFolderCountContextKey()));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.editor.openSideBySideDirection')) {
				this.updateSplitEditorsVerticallyContext();
			}
		}));

		this._register(this.partService.onZenModeChange(enabled => this.inZenModeContext.set(enabled)));

		this._register(this.viewletService.onDidViewletClose(() => this.updateSideBarContextKeys()));
		this._register(this.viewletService.onDidViewletOpen(() => this.updateSideBarContextKeys()));
	}

	private initContextKeys(): void {

		// Platform
		IsMacContext.bindTo(this.contextKeyService);
		IsLinuxContext.bindTo(this.contextKeyService);
		IsWindowsContext.bindTo(this.contextKeyService);

		// macOS Native Tabs
		const windowConfig = this.configurationService.getValue<IWindowConfiguration>();
		HasMacNativeTabsContext.bindTo(this.contextKeyService).set(windowConfig && windowConfig.window && windowConfig.window.nativeTabs);

		// Development
		IsDevelopmentContext.bindTo(this.contextKeyService).set(!this.environmentService.isBuilt || this.environmentService.isExtensionDevelopment);

		// File Pickers
		SupportsWorkspacesContext.bindTo(this.contextKeyService);
		SupportsOpenFileFolderContext.bindTo(this.contextKeyService).set(!!this.windowService.getConfiguration().remoteAuthority);

		// Editors
		this.activeEditorContext = ActiveEditorContext.bindTo(this.contextKeyService);
		this.editorsVisibleContext = EditorsVisibleContext.bindTo(this.contextKeyService);
		this.textCompareEditorVisibleContext = TextCompareEditorVisibleContext.bindTo(this.contextKeyService);
		this.textCompareEditorActiveContext = TextCompareEditorActiveContext.bindTo(this.contextKeyService);
		this.activeEditorGroupEmpty = ActiveEditorGroupEmptyContext.bindTo(this.contextKeyService);
		this.multipleEditorGroupsContext = MultipleEditorGroupsContext.bindTo(this.contextKeyService);

		// Inputs
		this.inputFocusedContext = InputFocusedContext.bindTo(this.contextKeyService);

		// Workbench State
		this.workbenchStateContext = WorkbenchStateContext.bindTo(this.contextKeyService);
		this.updateWorkbenchStateContextKey();

		// Workspace Folder Count
		this.workspaceFolderCountContext = WorkspaceFolderCountContext.bindTo(this.contextKeyService);
		this.updateWorkspaceFolderCountContextKey();

		// Editor Layout
		this.splitEditorsVerticallyContext = SplitEditorsVertically.bindTo(this.contextKeyService);
		this.updateSplitEditorsVerticallyContext();

		// Zen Mode
		this.inZenModeContext = InEditorZenModeContext.bindTo(this.contextKeyService);

		// Sidebar
		this.sideBarVisibleContext = SidebarVisibleContext.bindTo(this.contextKeyService);
	}

	private updateEditorContextKeys(): void {
		const activeControl = this.editorService.activeControl;
		const visibleEditors = this.editorService.visibleControls;

		this.textCompareEditorActiveContext.set(!!activeControl && activeControl.getId() === TEXT_DIFF_EDITOR_ID);
		this.textCompareEditorVisibleContext.set(visibleEditors.some(control => control.getId() === TEXT_DIFF_EDITOR_ID));

		if (visibleEditors.length > 0) {
			this.editorsVisibleContext.set(true);
		} else {
			this.editorsVisibleContext.reset();
		}

		if (!this.editorService.activeEditor) {
			this.activeEditorGroupEmpty.set(true);
		} else {
			this.activeEditorGroupEmpty.reset();
		}

		if (this.editorGroupService.count > 1) {
			this.multipleEditorGroupsContext.set(true);
		} else {
			this.multipleEditorGroupsContext.reset();
		}

		if (activeControl) {
			this.activeEditorContext.set(activeControl.getId());
		} else {
			this.activeEditorContext.reset();
		}
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
		this.sideBarVisibleContext.set(this.partService.isVisible(Parts.SIDEBAR_PART));
	}
}