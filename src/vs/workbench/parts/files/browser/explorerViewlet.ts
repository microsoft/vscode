/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/explorerviewlet';
import {IDisposable} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {Dimension, Builder} from 'vs/base/browser/builder';
import {Scope} from 'vs/workbench/common/memento';
import {VIEWLET_ID} from 'vs/workbench/parts/files/common/files';
import {CollapsibleViewletView, IViewletView, Viewlet} from 'vs/workbench/browser/viewlet';
import {IActionRunner} from 'vs/base/common/actions';
import {SplitView} from 'vs/base/browser/ui/splitview/splitview';
import {ActionRunner, FileViewletState} from 'vs/workbench/parts/files/browser/views/explorerViewer';
import {ExplorerView} from 'vs/workbench/parts/files/browser/views/explorerView';
import {EmptyView} from 'vs/workbench/parts/files/browser/views/emptyView';
import {WorkingFilesView} from 'vs/workbench/parts/files/browser/views/workingFilesView';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {StructuredSelection} from 'vs/platform/selection/common/selection';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

export class ExplorerViewlet extends Viewlet {
	private viewletContainer: Builder;
	private splitView: SplitView;
	private views: IViewletView[];

	private explorerView: ExplorerView;
	private workingFilesView: WorkingFilesView;
	private lastFocusedView: ExplorerView | WorkingFilesView;
	private focusListener: IDisposable;

	private viewletSettings: any;
	private viewletState: FileViewletState;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IStorageService private storageService: IStorageService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(VIEWLET_ID, telemetryService);

		this.views = [];
		this.viewletState = new FileViewletState();

		this.viewletSettings = this.getMemento(storageService, Scope.WORKSPACE);
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.viewletContainer = parent.div().addClass('explorer-viewlet');

		this.splitView = new SplitView(this.viewletContainer.getHTMLElement());

		// Working files view
		this.addWorkingFilesView();

		// Explorer view
		this.addExplorerView();

		// Track focus
		this.focusListener = this.splitView.onFocus((view: ExplorerView | WorkingFilesView) => {
			this.lastFocusedView = view;
		});

		return TPromise.join(this.views.map((view) => view.create())).then(() => void 0);
	}

	private addWorkingFilesView(): void {
		this.workingFilesView = this.instantiationService.createInstance(WorkingFilesView, this.getActionRunner(), this.viewletSettings);
		this.splitView.addView(this.workingFilesView);

		this.views.push(this.workingFilesView);
	}

	private addExplorerView(): void {
		let explorerView: CollapsibleViewletView | EmptyView;

		// With a Workspace
		if (this.contextService.getWorkspace()) {
			this.explorerView = explorerView = this.instantiationService.createInstance(ExplorerView, this.viewletState, this.getActionRunner(), this.viewletSettings);
		}

		// No workspace
		else {
			explorerView = this.instantiationService.createInstance(EmptyView);
		}

		this.splitView.addView(explorerView);
		this.views.push(explorerView);
	}

	/**
	 * Refresh the contents of the explorer to get up to date data from the disk about the file structure.
	 *
	 * @param focus if set to true, the explorer viewer will receive keyboard focus
	 * @param reveal if set to true, the current active input will be revealed in the explorer
	 */
	public refresh(focus: boolean, reveal: boolean, instantProgress?: boolean): TPromise<void> {
		return TPromise.join(this.views.map((view) => view.refresh(focus, reveal, instantProgress))).then(() => void 0);
	}

	public getExplorerView(): ExplorerView {
		return this.explorerView;
	}

	public getWorkingFilesView(): WorkingFilesView {
		return this.workingFilesView;
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

		if (this.hasSelectionOrFocus(this.workingFilesView)) {
			return this.workingFilesView.focusBody();
		}

		if (this.hasSelectionOrFocus(this.explorerView)) {
			return this.explorerView.focusBody();
		}

		if (this.workingFilesView && this.workingFilesView.isExpanded()) {
			return this.workingFilesView.focusBody();
		}

		if (this.explorerView && this.explorerView.isExpanded()) {
			return this.explorerView.focusBody();
		}

		return this.workingFilesView.focus();
	}

	private hasSelectionOrFocus(view: ExplorerView|WorkingFilesView): boolean {
		if (!view) {
			return false;
		}

		if (!view.isExpanded()) {
			return false;
		}

		const viewer = view.getViewer();
		if (!viewer) {
			return false;
		}

		return !!viewer.getFocus() || (viewer.getSelection() && viewer.getSelection().length > 0);
	}

	public layout(dimension: Dimension): void {
		this.splitView.layout(dimension.height);
	}

	public getSelection(): StructuredSelection {
		return this.explorerView ? this.explorerView.getSelection() : this.workingFilesView.getSelection();
	}

	public getActionRunner(): IActionRunner {
		if (!this.actionRunner) {
			this.actionRunner = new ActionRunner(this.viewletState);
		}

		return this.actionRunner;
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

		if (this.focusListener) {
			this.focusListener.dispose();
			this.focusListener = null;
		}
	}
}