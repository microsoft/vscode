/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/markers';

import nls = require('vs/nls');
import * as errors from 'vs/base/common/errors';
import * as Set from 'vs/base/common/set';
import URI from 'vs/base/common/uri';
import {Widget} from 'vs/base/browser/ui/widget';
import { TPromise } from 'vs/base/common/winjs.base';
import dom = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import builder = require('vs/base/browser/builder');
import {Action} from 'vs/base/common/actions';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Panel } from 'vs/workbench/browser/panel';
import {IAction} from 'vs/base/common/actions';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import Constants from 'vs/workbench/parts/markers/common/Constants';
import { MarkersModel } from 'vs/workbench/parts/markers/common/MarkersModel';
import {Controller} from 'vs/workbench/parts/markers/browser/MarkersTreeController';
import Tree = require('vs/base/parts/tree/browser/tree');
import {CollapseAllAction} from 'vs/base/parts/tree/browser/treeDefaults';
import TreeImpl = require('vs/base/parts/tree/browser/treeImpl');
import * as Viewer from 'vs/workbench/parts/markers/browser/MarkersTreeViewer';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import { ActionProvider } from 'vs/workbench/parts/markers/browser/MarkersActionProvider';
import Messages from 'vs/workbench/parts/markers/common/Messages';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';

import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';

export class MarkersPanel extends Panel {

	private markersModel: MarkersModel;
	private tree: Tree.ITree;
	private toDispose: lifecycle.IDisposable[];
	private actions: IAction[];
	private handled: Set.ArraySet<string>;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMarkerService private markerService: IMarkerService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IContextViewService private contextViewService: IContextViewService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(Constants.MARKERS_PANEL_ID, telemetryService);
		this.markersModel= new MarkersModel();
		this.toDispose = [];
		this.handled= new Set.ArraySet<string>();
	}

	public create(parent: builder.Builder): TPromise<void> {
		super.create(parent);
		dom.addClass(parent.getHTMLElement(), 'markers-panel');

		var actionProvider = this.instantiationService.createInstance(ActionProvider);
		var renderer = this.instantiationService.createInstance(Viewer.Renderer, this.getActionRunner(), actionProvider);
		var controller = this.instantiationService.createInstance(Controller);
		this.tree = new TreeImpl.Tree(parent.getHTMLElement(), {
			dataSource: new Viewer.DataSource(),
			renderer: renderer,
			controller: controller
		}, {
			indentPixels: 0,
			twistiePixels: 20,
		});

		this.toDispose.push(this.markerService.onMarkerChanged((changedResources) => {
			this.updateTitleArea();
			this.updateResources(changedResources);
			this.tree.refresh().then(this.autoExpand.bind(this));
		}));
		this.render();
		return TPromise.as(null);
	}

	public getTitle():string {
		let markerStatistics= this.markerService.getStatistics();
		let title= MarkersModel.getStatisticsLabel(markerStatistics);
		return title ? title : Messages.getString('markers.panel.no.problems');
	}

	public layout(dimension: builder.Dimension): void {
		this.tree.layout(dimension.height);
	}

	public focus(): void {
		this.tree.DOMFocus();
		this.tree.focusFirst();
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [
				new Action('workbench.markers.panel.action.filter', nls.localize('filter.markers', "Filter"), 'markers-panel-action-filter', true, this.showFilter.bind(this)),
				new Action('workbench.markers.panel.action.toggle.errors', nls.localize('toggle.errors', "Show only errors"), 'markers-panel-action-toggle-errors', true, this.toggleShowOnlyErrors.bind(this)),
				this.instantiationService.createInstance(CollapseAllAction, this.tree, true)
			];

			this.actions.forEach(a => {
				this.toDispose.push(a);
			});
		}
		return this.actions;
	}

	private updateResources(resources: URI[]) {
		resources.forEach((resource) => {
			let markers= this.markerService.read({resource: resource}).slice(0);
			this.markersModel.updateResource(resource, markers);
		});
	}

	private render(): void {
		let allMarkers = this.markerService.read().slice(0);
		this.markersModel.updateMarkers(allMarkers);
		this.tree.setInput(this.markersModel).then(this.autoExpand.bind(this));
	}

	private autoExpand(): void {
		this.markersModel.getResources().forEach((resource) => {
			if (this.handled.contains(resource.uri.toString())) {
				return;
			}
			if (resource.statistics.errors > 0 && resource.statistics.errors < 10) {
				this.tree.expand(resource).done(null, errors.onUnexpectedError);
			} else {
				this.tree.collapse(resource).done(null, errors.onUnexpectedError);
			}
			this.handled.set(resource.uri.toString());
		});
	}

	private showFilter(): any {
		return TPromise.as(null);
	}

	private toggleShowOnlyErrors(): any {
		this.markersModel.showOnlyErrors= !this.markersModel.showOnlyErrors;
		this.actions[1].label= this.markersModel.showOnlyErrors ? nls.localize('toggle.all', "Show all") : nls.localize('toggle.errors', "Show only errors");
		this.actions[1].class= this.markersModel.showOnlyErrors ? 'markers-panel-action-toggle-all' : 'markers-panel-action-toggle-errors'
		return this.tree.refresh().then(this.focus.bind(this));
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		super.dispose();
	}
}