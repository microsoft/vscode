/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/explorerviewlet';
import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { VIEWLET_ID, ExplorerViewletVisibleContext, IFilesConfiguration, OpenEditorsVisibleContext, VIEW_CONTAINER } from 'vs/workbench/contrib/files/common/files';
import { ViewContainerViewlet, IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { ExplorerView } from 'vs/workbench/contrib/files/browser/views/explorerView';
import { EmptyView } from 'vs/workbench/contrib/files/browser/views/emptyView';
import { OpenEditorsView } from 'vs/workbench/contrib/files/browser/views/openEditorsView';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewsRegistry, IViewDescriptor, Extensions } from 'vs/workbench/common/views';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { DelegatingEditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorInput, IEditor } from 'vs/workbench/common/editor';
import { ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { KeyChord, KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Registry } from 'vs/platform/registry/common/platform';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { withUndefinedAsNull } from 'vs/base/common/types';

export class ExplorerViewletViewsContribution extends Disposable implements IWorkbenchContribution {

	private openEditorsVisibleContextKey!: IContextKey<boolean>;

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IProgressService progressService: IProgressService
	) {
		super();

		progressService.withProgress({ location: ProgressLocation.Explorer }, () => workspaceContextService.getCompleteWorkspace()).finally(() => {
			this.registerViews();

			this.openEditorsVisibleContextKey = OpenEditorsVisibleContext.bindTo(contextKeyService);
			this.updateOpenEditorsVisibility();

			this._register(workspaceContextService.onDidChangeWorkbenchState(() => this.registerViews()));
			this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => this.registerViews()));
			this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));
		});
	}

	private registerViews(): void {
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		const viewDescriptors = viewsRegistry.getViews(VIEW_CONTAINER);

		let viewDescriptorsToRegister: IViewDescriptor[] = [];
		let viewDescriptorsToDeregister: IViewDescriptor[] = [];

		const openEditorsViewDescriptor = this.createOpenEditorsViewDescriptor();
		if (!viewDescriptors.some(v => v.id === openEditorsViewDescriptor.id)) {
			viewDescriptorsToRegister.push(openEditorsViewDescriptor);
		}

		const explorerViewDescriptor = this.createExplorerViewDescriptor();
		const registeredExplorerViewDescriptor = viewDescriptors.filter(v => v.id === explorerViewDescriptor.id)[0];
		const emptyViewDescriptor = this.createEmptyViewDescriptor();
		const registeredEmptyViewDescriptor = viewDescriptors.filter(v => v.id === emptyViewDescriptor.id)[0];

		if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY || this.workspaceContextService.getWorkspace().folders.length === 0) {
			if (registeredExplorerViewDescriptor) {
				viewDescriptorsToDeregister.push(registeredExplorerViewDescriptor);
			}
			if (!registeredEmptyViewDescriptor) {
				viewDescriptorsToRegister.push(emptyViewDescriptor);
			}
		} else {
			if (registeredEmptyViewDescriptor) {
				viewDescriptorsToDeregister.push(registeredEmptyViewDescriptor);
			}
			if (!registeredExplorerViewDescriptor) {
				viewDescriptorsToRegister.push(explorerViewDescriptor);
			}
		}

		if (viewDescriptorsToRegister.length) {
			viewsRegistry.registerViews(viewDescriptorsToRegister, VIEW_CONTAINER);
		}
		if (viewDescriptorsToDeregister.length) {
			viewsRegistry.deregisterViews(viewDescriptorsToDeregister, VIEW_CONTAINER);
		}
	}

	private createOpenEditorsViewDescriptor(): IViewDescriptor {
		return {
			id: OpenEditorsView.ID,
			name: OpenEditorsView.NAME,
			ctorDescriptor: { ctor: OpenEditorsView },
			order: 0,
			when: OpenEditorsVisibleContext,
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
			ctorDescriptor: { ctor: EmptyView },
			order: 1,
			canToggleVisibility: false
		};
	}

	private createExplorerViewDescriptor(): IViewDescriptor {
		return {
			id: ExplorerView.ID,
			name: localize('folders', "Folders"),
			ctorDescriptor: { ctor: ExplorerView },
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

export class ExplorerViewlet extends ViewContainerViewlet {

	private static readonly EXPLORER_VIEWS_STATE = 'workbench.explorer.views.state';

	private viewletVisibleContextKey: IContextKey<boolean>;

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
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
		super(VIEWLET_ID, ExplorerViewlet.EXPLORER_VIEWS_STATE, true, configurationService, layoutService, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);

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
			delegatingEditorService.setEditorOpenHandler(async (group: IEditorGroup, editor: IEditorInput, options?: IEditorOptions): Promise<IEditor | null> => {
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

				let openedEditor: IEditor | undefined;
				try {
					openedEditor = await this.editorService.openEditor(editor, options, group);
				} catch (error) {
					// ignore
				} finally {
					const openEditorsView = this.getOpenEditorsView();
					if (openEditorsView) {
						openEditorsView.setStructuralRefreshDelay(0);
					}
				}

				return withUndefinedAsNull(openedEditor);
			});

			const explorerInstantiator = this.instantiationService.createChild(new ServiceCollection([IEditorService, delegatingEditorService]));
			return explorerInstantiator.createInstance(ExplorerView, options);
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

	focus(): void {
		const explorerView = this.getView(ExplorerView.ID);
		if (explorerView && explorerView.isExpanded()) {
			explorerView.focus();
		} else {
			super.focus();
		}
	}
}
