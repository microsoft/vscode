/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/markers';

import * as errors from 'vs/base/common/errors';
import * as Set from 'vs/base/common/set';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import dom = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import builder = require('vs/base/browser/builder');
import {Action} from 'vs/base/common/actions';
import {IActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEventService } from 'vs/platform/event/common/event';
import { Panel } from 'vs/workbench/browser/panel';
import {IAction} from 'vs/base/common/actions';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import Constants from 'vs/workbench/parts/markers/common/constants';
import { MarkersModel } from 'vs/workbench/parts/markers/common/markersModel';
import {Controller} from 'vs/workbench/parts/markers/browser/markersTreeController';
import Tree = require('vs/base/parts/tree/browser/tree');
import {CollapseAllAction} from 'vs/base/parts/tree/browser/treeDefaults';
import TreeImpl = require('vs/base/parts/tree/browser/treeImpl');
import * as Viewer from 'vs/workbench/parts/markers/browser/markersTreeViewer';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import { ActionProvider } from 'vs/workbench/parts/markers/browser/markersActionProvider';
import { FilterAction, FilterInputBoxActionItem } from 'vs/workbench/parts/markers/browser/markersPanelActions';

export class MarkersPanel extends Panel {

	public markersModel: MarkersModel;
	private tree: Tree.ITree;
	private toDispose: lifecycle.IDisposable[];
	private autoExpanded: Set.ArraySet<string>;

	private actions: IAction[];
	private filterAction: FilterAction;
	private collapseAllAction: IAction;

	private treeContainer: HTMLElement;
	private messageBoxContainer: HTMLElement;
	private messageBox: HTMLElement;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMarkerService private markerService: IMarkerService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEventService private eventService: IEventService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(Constants.MARKERS_PANEL_ID, telemetryService);
		this.markersModel= new MarkersModel();
		this.toDispose = [];
		this.autoExpanded= new Set.ArraySet<string>();
	}

	public create(parent: builder.Builder): TPromise<void> {
		super.create(parent);
		dom.addClass(parent.getHTMLElement(), 'markers-panel');

		let container= dom.append(parent.getHTMLElement(), dom.emmet('.markers-panel-container'));

		this.createMessageBox(container);
		this.createTree(container);

		this.createActions();
		this.createListeners();

		this.render();

		return TPromise.as(null);
	}

	public getTitle():string {
		let markerStatistics= this.markerService.getStatistics();
		return this.markersModel.getTitle(markerStatistics);
	}

	public layout(dimension: builder.Dimension): void {
		this.tree.layout(dimension.height);
	}

	public focus(): void {
		if (this.markersModel.hasFilteredResources()) {
			this.tree.DOMFocus();
			if (!this.tree.getFocus()) {
				this.tree.focusFirst();
			}
		}
	}

	public getActions(): IAction[] {
		this.collapseAllAction.enabled= this.markersModel.hasFilteredResources();
		return this.actions;
	}

	public refreshPanel(updateTitleArea: boolean= false):TPromise<any> {
		this.collapseAllAction.enabled= this.markersModel.hasFilteredResources();
		this.refreshAutoExpanded();
		if (updateTitleArea) {
			this.updateTitleArea();
		}
		dom.toggleClass(this.treeContainer, 'hidden', !this.markersModel.hasFilteredResources());
		this.renderMessage();
		if (this.markersModel.hasFilteredResources()) {
			return this.tree.refresh().then(() => {
				this.autoExpand();
			});
		}
		return TPromise.as(null);
	}

	private createMessageBox(parent: HTMLElement): void {
		this.messageBoxContainer= dom.append(parent, dom.emmet('.message-box-container'));
		this.messageBox= dom.append(this.messageBoxContainer, dom.emmet('p'));
	}

	private createTree(parent: HTMLElement):void {
		this.treeContainer= dom.append(parent, dom.emmet('.tree-container'));
		var actionProvider = this.instantiationService.createInstance(ActionProvider);
		var renderer = this.instantiationService.createInstance(Viewer.Renderer, this.getActionRunner(), actionProvider);
		var controller = this.instantiationService.createInstance(Controller);
		this.tree= new TreeImpl.Tree(this.treeContainer, {
			dataSource: new Viewer.DataSource(),
			renderer: renderer,
			controller: controller
		}, {
			indentPixels: 0,
			twistiePixels: 20,
		});
	}

	private createActions():void {
		this.collapseAllAction= this.instantiationService.createInstance(CollapseAllAction, this.tree, true);
		this.filterAction= new FilterAction(this);
		this.actions= [
					this.filterAction,
					this.collapseAllAction
				];
		this.actions.forEach(a => {
			this.toDispose.push(a);
		});
	}

	private createListeners(): void {
		this.toDispose.push(this.markerService.onMarkerChanged(this.onMarkerChanged.bind(this)));
	}

	private onMarkerChanged(changedResources: URI[]) {
		this.updateResources(changedResources);
		this.refreshPanel(true);
	}

	private updateResources(resources: URI[]) {
		resources.forEach((resource) => {
			let markers= this.markerService.read({resource: resource}).slice(0);
			this.markersModel.update(resource, markers);
			if (!this.markersModel.hasResource(resource)) {
				this.autoExpanded.unset(resource.toString());
			}
		});
	}

	private render(): void {
		let allMarkers = this.markerService.read().slice(0);
		this.markersModel.update(allMarkers);
		this.tree.setInput(this.markersModel).then(this.autoExpand.bind(this));
		dom.toggleClass(this.treeContainer, 'hidden', !this.markersModel.hasFilteredResources());
		this.renderMessage();
	}

	private renderMessage():void {
		let message= this.markersModel.getMessage();
		this.messageBox.textContent= message;
		dom.toggleClass(this.messageBoxContainer, 'hidden', this.markersModel.hasFilteredResources());
	}

	private refreshAutoExpanded(): void {
		this.markersModel.nonFilteredResources.forEach((resource) => {
			if (this.tree.isExpanded(resource)) {
				this.autoExpanded.unset(resource.uri.toString());
			}
		});
	}

	private autoExpand(): void {
		this.markersModel.filteredResources.forEach((resource) => {
			if (this.autoExpanded.contains(resource.uri.toString())) {
				return;
			}
			if (resource.markers.length > 0 && resource.markers.length < 10) {
				this.tree.expand(resource).done(null, errors.onUnexpectedError);
			} else {
				this.tree.collapse(resource).done(null, errors.onUnexpectedError);
			}
			this.autoExpanded.set(resource.uri.toString());
		});
	}

	public getActionItem(action: Action): IActionItem {
		if (action.id === 'workbench.markers.panel.action.filter') {
			return this.instantiationService.createInstance(FilterInputBoxActionItem, this, action);
		}
		return super.getActionItem(action);
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		super.dispose();
	}
}