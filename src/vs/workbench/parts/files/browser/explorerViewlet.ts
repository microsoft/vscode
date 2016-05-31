/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/explorerviewlet';
import {IDisposable} from 'vs/base/common/lifecycle';
import {IAction} from 'vs/base/common/actions';
import {TPromise} from 'vs/base/common/winjs.base';
import {Dimension, Builder} from 'vs/base/browser/builder';
import {Scope} from 'vs/workbench/common/memento';
import {VIEWLET_ID, IFilesConfiguration} from 'vs/workbench/parts/files/common/files';
import {IViewletView, Viewlet} from 'vs/workbench/browser/viewlet';
import {IActionRunner} from 'vs/base/common/actions';
import {SplitView, Orientation} from 'vs/base/browser/ui/splitview/splitview';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ActionRunner, FileViewletState} from 'vs/workbench/parts/files/browser/views/explorerViewer';
import {ExplorerView} from 'vs/workbench/parts/files/browser/views/explorerView';
import {EmptyView} from 'vs/workbench/parts/files/browser/views/emptyView';
import {OpenEditorsView} from 'vs/workbench/parts/files/browser/views/openEditorsView';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

export class ExplorerViewlet extends Viewlet {
	private viewletContainer: Builder;
	private splitView: SplitView;
	private views: IViewletView[];

	private explorerView: ExplorerView;
	private openEditorsView: OpenEditorsView;
	private openEditorsVisible: boolean;
	private lastFocusedView: ExplorerView | OpenEditorsView | EmptyView;
	private focusListener: IDisposable;

	private viewletSettings: any;
	private viewletState: FileViewletState;
	private dimension: Dimension;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IStorageService private storageService: IStorageService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(VIEWLET_ID, telemetryService);

		this.viewletState = new FileViewletState();

		this.viewletSettings = this.getMemento(storageService, Scope.WORKSPACE);
		this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config));
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.viewletContainer = parent.div().addClass('explorer-viewlet');
		return this.configurationService.loadConfiguration().then((config: IFilesConfiguration) => this.onConfigurationUpdated(config));
	}

	public getActions(): IAction[] {
		if (this.openEditorsVisible) {
			return [];
		} else {
			return this.explorerView.getActions();
		}
	}

	private onConfigurationUpdated(config: IFilesConfiguration): TPromise<void> {
		// Open editors view should always be visible in no folder workspace.
		let openEditorsVisible = !this.contextService.getWorkspace() || config.explorer.openEditors.visible !== 0;

		// Create views on startup and if open editors visibility has changed #6919
		if (this.openEditorsVisible !== openEditorsVisible) {
			this.dispose();
			this.openEditorsVisible = openEditorsVisible;
			this.views = [];
			this.viewletContainer.clearChildren();

			if (this.openEditorsVisible) {
				this.splitView = new SplitView(this.viewletContainer.getHTMLElement());

				// Open editors view
				this.addOpenEditorsView();

				// Track focus
				this.focusListener = this.splitView.onFocus((view: ExplorerView | OpenEditorsView | EmptyView) => {
					this.lastFocusedView = view;
				});
			}

			// Explorer view
			this.addExplorerView();
			this.lastFocusedView = this.explorerView;

			return TPromise.join(this.views.map(view => view.create())).then(() => void 0).then(() => {
				if (this.dimension) {
					this.layout(this.dimension);
				}

				// Update title area since the title actions have changed.
				this.updateTitleArea();
				// Focus the viewlet since that triggers a rerender.
				return this.setVisible(this.isVisible()).then(() => this.focus());
			});
		}

		return TPromise.as(null);
	}

	private addOpenEditorsView(): void {
		this.openEditorsView = this.instantiationService.createInstance(OpenEditorsView, this.getActionRunner(), this.viewletSettings);
		this.splitView.addView(this.openEditorsView);

		this.views.push(this.openEditorsView);
	}

	private addExplorerView(): void {
		let explorerView: ExplorerView | EmptyView;

		// With a Workspace
		if (this.contextService.getWorkspace()) {
			// If open editors are not visible set header size explicitly to 0, otherwise let it be computed by super class.
			const headerSize = this.openEditorsVisible ? undefined : 0;
			this.explorerView = explorerView = this.instantiationService.createInstance(ExplorerView, this.viewletState, this.getActionRunner(), this.viewletSettings, headerSize);
		}

		// No workspace
		else {
			explorerView = this.instantiationService.createInstance(EmptyView);
		}

		if (this.openEditorsVisible) {
			this.splitView.addView(explorerView);
		} else {
			explorerView.render(this.viewletContainer.getHTMLElement(), Orientation.VERTICAL);
		}
		this.views.push(explorerView);
	}

	public getExplorerView(): ExplorerView {
		return this.explorerView;
	}

	public getOpenEditorsView(): OpenEditorsView {
		return this.openEditorsView;
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {
			return TPromise.join(this.views.map((view) => view.setVisible(visible))).then(() => void 0);
		});
	}

	public focus(): void {
		super.focus();

		if (this.lastFocusedView && this.lastFocusedView.isExpanded() && this.hasSelectionOrFocus(this.lastFocusedView)) {
			this.lastFocusedView.focusBody();
			return;
		}

		if (this.hasSelectionOrFocus(this.openEditorsView)) {
			return this.openEditorsView.focusBody();
		}

		if (this.hasSelectionOrFocus(this.explorerView)) {
			return this.explorerView.focusBody();
		}

		if (this.openEditorsView && this.openEditorsView.isExpanded()) {
			return this.openEditorsView.focusBody();
		}

		if (this.explorerView && this.explorerView.isExpanded()) {
			return this.explorerView.focusBody();
		}

		return this.openEditorsView.focus();
	}

	private hasSelectionOrFocus(view: ExplorerView | OpenEditorsView | EmptyView): boolean {
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

	public layout(dimension: Dimension): void {
		this.dimension = dimension;
		if (this.openEditorsVisible) {
			this.splitView.layout(dimension.height);
		} else if (this.explorerView) {
			this.explorerView.layout(dimension.height, Orientation.VERTICAL);
		}
	}

	public getActionRunner(): IActionRunner {
		if (!this.actionRunner) {
			this.actionRunner = new ActionRunner(this.viewletState);
		}

		return this.actionRunner;
	}

	public getOptimalWidth(): number {
		let additionalMargin = 16;
		let openedEditorsViewWidth = this.openEditorsView.getOptimalWidth();
		let explorerView = this.getExplorerView();
		let explorerViewWidth = explorerView ? explorerView.getOptimalWidth() : 0;
		let optimalWidth = Math.max(openedEditorsViewWidth, explorerViewWidth);
		return optimalWidth + additionalMargin;
	}

	public shutdown(): void {
		this.views.forEach((view) => view.shutdown());

		super.shutdown();
	}

	public dispose(): void {
		if (this.splitView) {
			this.splitView.dispose();
			this.splitView = null;
		}
		if (this.explorerView) {
			this.explorerView.dispose();
			this.explorerView = null;
		}
		if (this.openEditorsView) {
			this.openEditorsView.dispose();
			this.openEditorsView = null;
		}

		if (this.focusListener) {
			this.focusListener.dispose();
			this.focusListener = null;
		}
	}
}