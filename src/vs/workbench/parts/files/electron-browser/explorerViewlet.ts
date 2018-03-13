/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/explorerviewlet';
import { localize } from 'vs/nls';
import { IActionRunner } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import * as DOM from 'vs/base/browser/dom';
import { Builder } from 'vs/base/browser/builder';
import { VIEWLET_ID, ExplorerViewletVisibleContext, IFilesConfiguration, OpenEditorsVisibleContext, OpenEditorsVisibleCondition, IExplorerViewlet } from 'vs/workbench/parts/files/common/files';
import { PersistentViewsViewlet, IViewletViewOptions, ViewsViewletPanel } from 'vs/workbench/browser/parts/views/viewsViewlet';
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
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IWorkbenchEditorService, DelegatingWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewsRegistry, ViewLocation, IViewDescriptor } from 'vs/workbench/common/views';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPartService } from 'vs/workbench/services/part/common/partService';

export class ExplorerViewletViewsContribution extends Disposable implements IWorkbenchContribution {

	private openEditorsVisibleContextKey: IContextKey<boolean>;

	constructor(
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
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
		const viewDescriptors = ViewsRegistry.getViews(ViewLocation.Explorer);

		let viewDescriptorsToRegister = [];
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
			ViewsRegistry.deregisterViews(viewDescriptorsToDeregister, ViewLocation.Explorer);
		}
	}

	private createOpenEditorsViewDescriptor(): IViewDescriptor {
		return {
			id: OpenEditorsView.ID,
			name: OpenEditorsView.NAME,
			location: ViewLocation.Explorer,
			ctor: OpenEditorsView,
			order: 0,
			when: OpenEditorsVisibleCondition,
			canToggleVisibility: true
		};
	}

	private createEmptyViewDescriptor(): IViewDescriptor {
		return {
			id: EmptyView.ID,
			name: EmptyView.NAME,
			location: ViewLocation.Explorer,
			ctor: EmptyView,
			order: 1,
			canToggleVisibility: false
		};
	}

	private createExplorerViewDescriptor(): IViewDescriptor {
		return {
			id: ExplorerView.ID,
			name: localize('folders', "Folders"),
			location: ViewLocation.Explorer,
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

export class ExplorerViewlet extends PersistentViewsViewlet implements IExplorerViewlet {

	private static readonly EXPLORER_VIEWS_STATE = 'workbench.explorer.views.state';

	private viewletState: FileViewletState;
	private viewletVisibleContextKey: IContextKey<boolean>;

	constructor(
		@IPartService partService: IPartService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IStorageService protected storageService: IStorageService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService
	) {
		super(VIEWLET_ID, ViewLocation.Explorer, ExplorerViewlet.EXPLORER_VIEWS_STATE, true, partService, telemetryService, storageService, instantiationService, themeService, contextService, contextKeyService, contextMenuService, extensionService);

		this.viewletState = new FileViewletState();
		this.viewletVisibleContextKey = ExplorerViewletVisibleContext.bindTo(contextKeyService);

		this._register(this.contextService.onDidChangeWorkspaceName(e => this.updateTitleArea()));
	}

	async create(parent: Builder): TPromise<void> {
		await super.create(parent);

		const el = parent.getHTMLElement();
		DOM.addClass(el, 'explorer-viewlet');
	}

	private isOpenEditorsVisible(): boolean {
		return this.contextService.getWorkbenchState() === WorkbenchState.EMPTY || this.configurationService.getValue('explorer.openEditors.visible') !== 0;
	}

	protected createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): ViewsViewletPanel {
		if (viewDescriptor.id === ExplorerView.ID) {
			// Create a delegating editor service for the explorer to be able to delay the refresh in the opened
			// editors view above. This is a workaround for being able to double click on a file to make it pinned
			// without causing the animation in the opened editors view to kick in and change scroll position.
			// We try to be smart and only use the delay if we recognize that the user action is likely to cause
			// a new entry in the opened editors view.
			const delegatingEditorService = this.instantiationService.createInstance(DelegatingWorkbenchEditorService);
			delegatingEditorService.setEditorOpenHandler((input: EditorInput, options?: EditorOptions, arg3?: any) => {
				let openEditorsView = this.getOpenEditorsView();
				if (openEditorsView) {
					let delay = 0;

					const config = this.configurationService.getValue<IFilesConfiguration>();
					// No need to delay if preview is disabled
					const delayEditorOpeningInOpenedEditors = !!config.workbench.editor.enablePreview;

					if (delayEditorOpeningInOpenedEditors && (arg3 === false /* not side by side */ || typeof arg3 !== 'number' /* no explicit position */)) {
						const activeGroup = this.editorGroupService.getStacksModel().activeGroup;
						if (!activeGroup || !activeGroup.previewEditor) {
							delay = 250; // a new editor entry is likely because there is either no group or no preview in group
						}
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

				return this.editorService.openEditor(input, options, arg3).then(onSuccessOrError, onSuccessOrError);
			});

			const explorerInstantiator = this.instantiationService.createChild(new ServiceCollection([IWorkbenchEditorService, delegatingEditorService]));
			return explorerInstantiator.createInstance(ExplorerView, <IExplorerViewOptions>{ ...options, viewletState: this.viewletState });
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

	public setVisible(visible: boolean): TPromise<void> {
		this.viewletVisibleContextKey.set(visible);
		return super.setVisible(visible);
	}

	public getActionRunner(): IActionRunner {
		if (!this.actionRunner) {
			this.actionRunner = new ActionRunner(this.viewletState);
		}
		return this.actionRunner;
	}

	public getViewletState(): FileViewletState {
		return this.viewletState;
	}

	focus(): void {
		const explorerView = this.getExplorerView();
		if (explorerView && explorerView.isExpanded()) {
			explorerView.focus();
		} else {
			super.focus();
		}
	}

	protected loadViewsStates(): void {
		super.loadViewsStates();

		// Remove the open editors view state if it is removed globally
		if (!this.isOpenEditorsVisible()) {
			this.viewsStates.delete(OpenEditorsView.ID);
		}
	}
}
