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
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEventService } from 'vs/platform/event/common/event';
import { EventType } from 'vs/workbench/common/events';
import { CommonKeybindings } from 'vs/base/common/keyCodes';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
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
import Messages from 'vs/workbench/parts/markers/common/messages';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';

export class MarkersPanel extends Panel {

	private markersModel: MarkersModel;
	private tree: Tree.ITree;
	private toDispose: lifecycle.IDisposable[];
	private handled: Set.ArraySet<string>;

	private actions: IAction[];
	private showFilterInputAction: IAction;
	private toggleErrorsAction: IAction;
	private collapseAllAction: IAction;

	private messageBoxContainer: HTMLElement;
	private messageBox: HTMLElement;
	private filterInputBoxContainer: HTMLElement;
	private filterInputBox: InputBox;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMarkerService private markerService: IMarkerService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IContextViewService private contextViewService: IContextViewService,
		@IEventService private eventService: IEventService,
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

		let container= dom.append(parent.getHTMLElement(), dom.emmet('.markers-panel-container'));

		this.createFilterInputBox(container);
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
		this.toggleErrorsAction.enabled= this.markersModel.hasResources();
		if (this.markersModel.hasFilteredResources()) {
			this.showFilterInputAction.enabled= true;
			this.collapseAllAction.enabled= true;
		} else {
			this.showFilterInputAction.enabled= !!this.markersModel.filter;
			this.collapseAllAction.enabled= false;
		}
		return this.actions;
	}

	private createMessageBox(parent: HTMLElement): void {
		this.messageBoxContainer= dom.append(parent, dom.emmet('.message-box-container'));
		this.messageBox= dom.append(this.messageBoxContainer, dom.emmet('p'));
	}

	private createFilterInputBox(parent: HTMLElement): void {
		var filterBoxContainer= dom.append(parent, dom.emmet('.filter-box-container'));
		this.filterInputBoxContainer= dom.append(filterBoxContainer, dom.emmet('.input-box-container'));
		this.filterInputBox= new InputBox(this.filterInputBoxContainer, this.contextViewService, {
			placeholder: Messages.MARKERS_PANEL_FILTER_PLACEHOLDER
		});
		this.toDispose.push(dom.addStandardDisposableListener(this.filterInputBox.inputElement, 'keyup', (e: IKeyboardEvent) => {
			if (e.equals(CommonKeybindings.ESCAPE)) {
				dom.removeClass(this.filterInputBoxContainer, 'visible');
				e.preventDefault();
				e.stopPropagation();
			}
		}));
		this.toDispose.push(this.filterInputBox.onDidChange((filter:string) => {
			this.markersModel.filter= filter;
			this.refreshPanel();
		}));
	}

	private createTree(parent: HTMLElement):void {
		var treeContainer= dom.append(parent, dom.emmet('.tree-container'));
		var actionProvider = this.instantiationService.createInstance(ActionProvider);
		var renderer = this.instantiationService.createInstance(Viewer.Renderer, this.getActionRunner(), actionProvider);
		var controller = this.instantiationService.createInstance(Controller);
		this.tree= new TreeImpl.Tree(treeContainer, {
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
		this.toggleErrorsAction= new Action('workbench.markers.panel.action.toggle.errors', Messages.MARKERS_PANEL_ACTION_TOOLTIP_ONLY_ERRORS, 'markers-panel-action-toggle-errors-on', true, this.toggleShowOnlyErrors.bind(this));
		this.showFilterInputAction= new Action('workbench.markers.panel.action.filter', Messages.MARKERS_PANEL_ACTION_TOOLTIP_FILTER, 'markers-panel-action-filter', true, this.toggleFilter.bind(this));
		this.actions= [
					this.showFilterInputAction,
					this.toggleErrorsAction,
					this.collapseAllAction
				];
		this.actions.forEach(a => {
			this.toDispose.push(a);
		});
	}

	private createListeners(): void {
		this.toDispose.push(this.markerService.onMarkerChanged(this.onMarkerChanged.bind(this)));
		this.toDispose.push(this.eventService.addListener2(EventType.COMPOSITE_OPENED, this.onPanelOpened.bind(this)));
	}

	private onMarkerChanged(changedResources: URI[]) {
		this.updateResources(changedResources);
		this.refreshPanel();
	}

	private onPanelOpened():void {
		if (this.markersModel.filter) {
			dom.addClass(this.filterInputBoxContainer, 'visible');
		}
	}

	private updateResources(resources: URI[]) {
		resources.forEach((resource) => {
			let markers= this.markerService.read({resource: resource}).slice(0);
			this.markersModel.updateResource(resource, markers);
		});
	}

	private refreshPanel(focus: boolean= false):void {
		this.updateTitleArea();
		this.tree.refresh().then(this.autoExpand.bind(this));
		this.renderMessage();
		if (focus) {
			this.focus();
		}
	}

	private render(): void {
		let allMarkers = this.markerService.read().slice(0);
		this.markersModel.updateMarkers(allMarkers);
		this.tree.setInput(this.markersModel).then(this.autoExpand.bind(this));
		this.renderMessage();
	}

	private renderMessage():void {
		let message= this.markersModel.getMessage();
		this.messageBox.textContent= message;
		dom.toggleClass(this.messageBoxContainer, 'visible', !this.markersModel.hasFilteredResources());
	}

	private autoExpand(): void {
		this.markersModel.getFilteredResources().forEach((resource) => {
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

	private toggleFilter(): any {
		this.tree.clearSelection();
		dom.toggleClass(this.filterInputBoxContainer, 'visible');
		this.filterInputBox.focus();
		return TPromise.as(null);
	}

	private toggleShowOnlyErrors(): any {
		this.markersModel.filterErrors= !this.markersModel.filterErrors;
		this.actions[1].label= this.markersModel.filterErrors ? Messages.MARKERS_PANEL_ACTION_TOOLTIP_ONLY_ERRORS_OFF : Messages.MARKERS_PANEL_ACTION_TOOLTIP_ONLY_ERRORS;
		this.actions[1].class= this.markersModel.filterErrors ? 'markers-panel-action-toggle-errors-off' : 'markers-panel-action-toggle-errors-on';
		this.refreshPanel(true);
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		super.dispose();
	}
}