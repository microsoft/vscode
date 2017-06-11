/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/explorerviewlet';
import { IActionRunner } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import * as DOM from 'vs/base/browser/dom';
import { Builder } from 'vs/base/browser/builder';
import { VIEWLET_ID, ExplorerViewletVisibleContext, IFilesConfiguration } from 'vs/workbench/parts/files/common/files';
import { ComposedViewsViewlet, IView, IViewletViewOptions } from 'vs/workbench/parts/views/browser/views';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ActionRunner, FileViewletState } from 'vs/workbench/parts/files/browser/views/explorerViewer';
import { ExplorerView, IExplorerViewOptions } from 'vs/workbench/parts/files/browser/views/explorerView';
import { EmptyView } from 'vs/workbench/parts/files/browser/views/emptyView';
import { OpenEditorsView } from 'vs/workbench/parts/files/browser/views/openEditorsView';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DelegatingWorkbenchEditorService } from 'vs/workbench/services/editor/browser/editorService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewsRegistry, ViewLocation, IViewDescriptor } from 'vs/workbench/parts/views/browser/viewsRegistry';

export class ExplorerViewlet extends ComposedViewsViewlet {

	private static EXPLORER_VIEWS_STATE = 'workbench.explorer.views.state';

	private viewletState: FileViewletState;
	private viewletVisibleContextKey: IContextKey<boolean>;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IStorageService protected storageService: IStorageService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService
	) {
		super(VIEWLET_ID, ViewLocation.Explorer, ExplorerViewlet.EXPLORER_VIEWS_STATE, telemetryService, storageService, instantiationService, themeService, contextService, contextKeyService);

		this.viewletState = new FileViewletState();
		this.viewletVisibleContextKey = ExplorerViewletVisibleContext.bindTo(contextKeyService);

		this.registerViews();
		this._register(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated()));
	}

	public create(parent: Builder): TPromise<void> {
		return super.create(parent).then(() => DOM.addClass(this.viewletContainer, 'explorer-viewlet'));
	}

	private registerViews(): void {
		let viewDescriptors = [];
		if (this.isOpenEditorsVisible()) {
			viewDescriptors.push(this.createOpenEditorsViewDescriptor());
		}
		if (this.contextService.hasWorkspace()) {
			viewDescriptors.push(this.createExplorerViewDescriptor());
		} else {
			viewDescriptors.push(this.createEmptyViewDescriptor());
		}

		ViewsRegistry.registerViews(viewDescriptors);
	}

	private createOpenEditorsViewDescriptor(): IViewDescriptor {
		return {
			id: OpenEditorsView.ID,
			name: '',
			location: ViewLocation.Explorer,
			ctor: OpenEditorsView,
			order: 0
		};
	}

	private createEmptyViewDescriptor(): IViewDescriptor {
		return {
			id: EmptyView.ID,
			name: '',
			location: ViewLocation.Explorer,
			ctor: EmptyView,
			order: 1
		};
	}

	private createExplorerViewDescriptor(): IViewDescriptor {
		return {
			id: ExplorerView.ID,
			name: '',
			location: ViewLocation.Explorer,
			ctor: ExplorerView,
			order: 1
		};
	}

	private onConfigurationUpdated(): void {
		let openEditorsViewDescriptor = ViewsRegistry.getViews(ViewLocation.Explorer).filter(viewDescriptor => viewDescriptor.id === OpenEditorsView.ID)[0];
		let isOpenEditorsVisible = this.isOpenEditorsVisible();
		if (isOpenEditorsVisible) {
			if (!openEditorsViewDescriptor) {
				ViewsRegistry.registerViews([this.createOpenEditorsViewDescriptor()]);
			}
		} else {
			if (openEditorsViewDescriptor) {
				ViewsRegistry.deregisterViews([OpenEditorsView.ID], ViewLocation.Explorer);
			}
		}
	}

	private isOpenEditorsVisible(): boolean {
		return !this.contextService.hasWorkspace() || (<IFilesConfiguration>this.configurationService.getConfiguration()).explorer.openEditors.visible !== 0;
	}

	protected createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): IView {
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

					const config = this.configurationService.getConfiguration<IFilesConfiguration>();
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

	public focus(): void {
		const hasOpenedEditors = !!this.editorGroupService.getStacksModel().activeGroup;

		let openEditorsView = this.getOpenEditorsView();
		if (this.lastFocusedView && this.lastFocusedView.isExpanded() && this.hasSelectionOrFocus(this.lastFocusedView)) {
			if (this.lastFocusedView !== openEditorsView || hasOpenedEditors) {
				this.lastFocusedView.focusBody();
				return;
			}
		}

		if (this.hasSelectionOrFocus(openEditorsView) && hasOpenedEditors) {
			return openEditorsView.focusBody();
		}

		let explorerView = this.getExplorerView();
		if (this.hasSelectionOrFocus(explorerView)) {
			return explorerView.focusBody();
		}

		if (openEditorsView && openEditorsView.isExpanded() && hasOpenedEditors) {
			return openEditorsView.focusBody(); // we have entries in the opened editors view to focus on
		}

		if (explorerView && explorerView.isExpanded()) {
			return explorerView.focusBody();
		}

		let emptyView = this.getEmptyView();
		if (emptyView && emptyView.isExpanded()) {
			return emptyView.focusBody();
		}

		super.focus();
	}

	private hasSelectionOrFocus(view: IView): boolean {
		if (!view) {
			return false;
		}

		if (!view.isExpanded()) {
			return false;
		}

		if (view instanceof ExplorerView || view instanceof OpenEditorsView) {
			const viewer = view.getViewer();
			if (!viewer) {
				return false;
			}

			return !!viewer.getFocus() || (viewer.getSelection() && viewer.getSelection().length > 0);

		}

		return false;
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
}