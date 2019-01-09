/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/explorerviewlet';
import { localize } from 'vs/nls';
import { IActionRunner } from 'vs/base/common/actions';
import * as DOM from 'vs/base/browser/dom';
import { VIEWLET_ID, ExplorerViewletVisibleContext, IFilesConfiguration, OpenEditorsVisibleContext, OpenEditorsVisibleCondition, IExplorerViewlet, VIEW_CONTAINER } from 'vs/workbench/parts/files/common/files';
import { ViewContainerViewlet, IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { ActionRunner, FileViewletState } from 'vs/workbench/parts/files/electron-browser/views/explorerViewer';
import { ExplorerView, IExplorerViewOptions } from 'vs/workbench/parts/files/electron-browser/views/explorerView';
import { EmptyView } from 'vs/workbench/parts/files/electron-browser/views/emptyView';
import { OpenEditorsView } from 'vs/workbench/parts/files/electron-browser/views/openEditorsView';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewsRegistry, IViewDescriptor } from 'vs/workbench/common/views';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { DelegatingEditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorInput } from 'vs/workbench/common/editor';
import { ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { KeyChord, KeyMod, KeyCode } from 'vs/base/common/keyCodes';

export class ExplorerViewletViewsContribution extends Disposable implements IWorkbenchContribution {

	private openEditorsVisibleContextKey: IContextKey<boolean>;

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();

		this.registerViews();

		this.openEditorsVisibleContextKey = OpenEditorsVisibleContext.bindTo(contextKeyService);
		this.updateOpenEditorsVisibility();

		this._register(workspaceContextService.onDidChangeWorkbenchState(() => this.registerViews()));
		this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => this.registerViews()));
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
	}

	private registerViews(): void {
		const viewDescriptors = ViewsRegistry.getViews(VIEW_CONTAINER);

		let viewDescriptorsToRegister: IViewDescriptor[] = [];
		let viewDescriptorsToDeregister: string[] = [];

		const openEditorsViewDescriptor = this.createOpenEditorsViewDescriptor();
		const openEditorsViewDescriptorExists = viewDescriptors.some(v => v.id === openEditorsViewDescriptor.id);
		const explorerViewDescriptor = this.createExplorerViewDescriptor();
		const explorerViewDescriptorExists = viewDescriptors.some(v => v.id === explorerViewDescriptor.id);
		const emptyViewDescriptor = this.createEmptyViewDescriptor();
		const emptyViewDescriptorExists = viewDescriptors.some(v => v.id === emptyViewDescriptor.id);

		if (!openEditorsViewDescriptorExists) {
			viewDescriptorsToRegister.push(openEditorsViewDescriptor);
		}
		if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY || this.workspaceContextService.getWorkspace().folders.length === 0) {
			if (explorerViewDescriptorExists) {
				viewDescriptorsToDeregister.push(explorerViewDescriptor.id);
			}
			if (!emptyViewDescriptorExists) {
				viewDescriptorsToRegister.push(emptyViewDescriptor);
			}
		} else {
			if (emptyViewDescriptorExists) {
				viewDescriptorsToDeregister.push(emptyViewDescriptor.id);
			}
			if (!explorerViewDescriptorExists) {
				viewDescriptorsToRegister.push(explorerViewDescriptor);
			}
		}

		if (viewDescriptorsToRegister.length) {
			ViewsRegistry.registerViews(viewDescriptorsToRegister);
		}
		if (viewDescriptorsToDeregister.length) {
			ViewsRegistry.deregisterViews(viewDescriptorsToDeregister, VIEW_CONTAINER);
		}
	}

	private createOpenEditorsViewDescriptor(): IViewDescriptor {
		return {
			id: OpenEditorsView.ID,
			name: OpenEditorsView.NAME,
			container: VIEW_CONTAINER,
			ctor: OpenEditorsView,
			order: 0,
			when: OpenEditorsVisibleCondition,
			canToggleVisibility: true,
			focusCommand: {
				id: 'workbench.files.action.focusOpenEditorsView',
				keybindings: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_E) }
			}
		};
	}

	private createEmptyViewDescriptor(): IViewDescriptor {
		return {
			id: EmptyView.ID,
			name: EmptyView.NAME,
			container: VIEW_CONTAINER,
			ctor: EmptyView,
			order: 1,
			canToggleVisibility: false
		};
	}

	private createExplorerViewDescriptor(): IViewDescriptor {
		return {
			id: ExplorerView.ID,
			name: localize('folders', "Folders"),
			container: VIEW_CONTAINER,
			ctor: ExplorerView,
			order: 1,
			canToggleVisibility: false
		};
	}

	private onConfigurationUpdated(e: IConfigurationChangeEvent): void {
		if (e.affectsConfiguration('explorer.openEditors.visible')) {
			this.updateOpenEditorsVisibility();
		}
	}

	private updateOpenEditorsVisibility(): void {
		this.openEditorsVisibleContextKey.set(this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY || this.configurationService.getValue('explorer.openEditors.visible') !== 0);
	}
}

export class ExplorerViewlet extends ViewContainerViewlet implements IExplorerViewlet {

	private static readonly EXPLORER_VIEWS_STATE = 'workbench.explorer.views.state';

	private fileViewletState: FileViewletState;
	private viewletVisibleContextKey: IContextKey<boolean>;

	constructor(
		@IPartService partService: IPartService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IStorageService protected storageService: IStorageService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService
	) {
		super(VIEWLET_ID, ExplorerViewlet.EXPLORER_VIEWS_STATE, true, configurationService, partService, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);

		this.fileViewletState = new FileViewletState();
		this.viewletVisibleContextKey = ExplorerViewletVisibleContext.bindTo(contextKeyService);

		this._register(this.contextService.onDidChangeWorkspaceName(e => this.updateTitleArea()));
	}

	create(parent: HTMLElement): void {
		super.create(parent);
		DOM.addClass(parent, 'explorer-viewlet');
	}

	protected createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): ViewletPanel {
		if (viewDescriptor.id === ExplorerView.ID) {
			// Create a delegating editor service for the explorer to be able to delay the refresh in the opened
			// editors view above. This is a workaround for being able to double click on a file to make it pinned
			// without causing the animation in the opened editors view to kick in and change scroll position.
			// We try to be smart and only use the delay if we recognize that the user action is likely to cause
			// a new entry in the opened editors view.
			const delegatingEditorService = this.instantiationService.createInstance(DelegatingEditorService);
			delegatingEditorService.setEditorOpenHandler((group: IEditorGroup, editor: IEditorInput, options?: IEditorOptions) => {
				let openEditorsView = this.getOpenEditorsView();
				if (openEditorsView) {
					let delay = 0;

					const config = this.configurationService.getValue<IFilesConfiguration>();
					const delayEditorOpeningInOpenedEditors = !!config.workbench.editor.enablePreview; // No need to delay if preview is disabled

					const activeGroup = this.editorGroupService.activeGroup;
					if (delayEditorOpeningInOpenedEditors && group === activeGroup && !activeGroup.previewEditor) {
						delay = 250; // a new editor entry is likely because there is either no group or no preview in group
					}

					openEditorsView.setStructuralRefreshDelay(delay);
				}

				const onSuccessOrError = (editor?: BaseEditor) => {
					let openEditorsView = this.getOpenEditorsView();
					if (openEditorsView) {
						openEditorsView.setStructuralRefreshDelay(0);
					}

					return editor;
				};

				return this.editorService.openEditor(editor, options, group).then(onSuccessOrError, onSuccessOrError);
			});

			const explorerInstantiator = this.instantiationService.createChild(new ServiceCollection([IEditorService, delegatingEditorService]));
			return explorerInstantiator.createInstance(ExplorerView, <IExplorerViewOptions>{ ...options, fileViewletState: this.fileViewletState });
		}
		return super.createView(viewDescriptor, options);
	}

	public getExplorerView(): ExplorerView {
		return <ExplorerView>this.getView(ExplorerView.ID);
	}

	public getOpenEditorsView(): OpenEditorsView {
		return <OpenEditorsView>this.getView(OpenEditorsView.ID);
	}

	public getEmptyView(): EmptyView {
		return <EmptyView>this.getView(EmptyView.ID);
	}

	public setVisible(visible: boolean): void {
		this.viewletVisibleContextKey.set(visible);
		super.setVisible(visible);
	}

	public getActionRunner(): IActionRunner {
		if (!this.actionRunner) {
			this.actionRunner = new ActionRunner(this.fileViewletState);
		}
		return this.actionRunner;
	}

	public getViewletState(): FileViewletState {
		return this.fileViewletState;
	}

	focus(): void {
		const explorerView = this.getExplorerView();
		if (explorerView && explorerView.isExpanded()) {
			explorerView.focus();
		} else {
			super.focus();
		}
	}
}
