/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/markers';
import { TPromise } from 'vs/base/common/winjs.base';
import dom = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import builder = require('vs/base/browser/builder');
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Panel } from 'vs/workbench/browser/panel';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import Constants from 'vs/workbench/parts/markers/common/Constants';
import { MarkersModel } from 'vs/workbench/parts/markers/common/MarkersModel';
import {Controller} from 'vs/workbench/parts/markers/browser/MarkersTreeController';
import Tree = require('vs/base/parts/tree/browser/tree');
import TreeImpl = require('vs/base/parts/tree/browser/treeImpl');
import * as Viewer from 'vs/workbench/parts/markers/browser/MarkersTreeViewer';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import { ActionProvider } from 'vs/workbench/parts/markers/browser/MarkersActionProvider';
import Messages from 'vs/workbench/parts/markers/common/Messages';

export class MarkersPanel extends Panel {

	private tree: Tree.ITree;
	private _toDispose: lifecycle.IDisposable[];

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IMarkerService private markerService: IMarkerService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(Constants.MARKERS_PANEL_ID, telemetryService);
		this._toDispose = [];
	}

	public create(parent: builder.Builder): TPromise<void> {
		super.create(parent);
		dom.addClass(parent.getHTMLElement(), 'markers-panel');

		var actionProvider = this.instantiationService.createInstance(ActionProvider);
		var renderer = this.instantiationService.createInstance(Viewer.Renderer, this.getActionRunner(), actionProvider);
		var controller = this.instantiationService.createInstance(Controller, actionProvider);
		this.tree = new TreeImpl.Tree(parent.getHTMLElement(), {
			dataSource: new Viewer.DataSource(),
			renderer: renderer,
			controller: controller
		}, {
			indentPixels: 0,
			twistiePixels: 20,
		});

		this._toDispose.push(this.markerService.onMarkerChanged((changedResources) => {
			this.render();
		}));
		this.render();
		return TPromise.as(null);
	}

	public getTitle():string {
		let title= '';
		let marketStatistics= this.markerService.getStatistics();
		let addPipe= false;
		if (marketStatistics.errors > 0) {
			title += ' ' + marketStatistics.errors + ' Errors';
			addPipe= true;
		}
		if (marketStatistics.warnings > 0) {
			title= addPipe ? title + ', ' : title;
			title += ' ' + marketStatistics.warnings + ' Warnings';
			addPipe= true;
		}
		if (marketStatistics.infos > 0) {
			title= addPipe ? title + ', ' : title;
			title += ' ' + marketStatistics.infos + ' Info';
			addPipe= true;
		}
		if (marketStatistics.unknwons > 0) {
			title= addPipe ? title + ', ' : title;
			title += ' ' + marketStatistics.unknwons + ' Unknowns';
		}
		return title ? title : Messages.MARKERS_PANEL_NO_PROBLEMS_TITLE;
	}

	public layout(dimension: builder.Dimension): void {
		this.tree.layout(dimension.height);
	}

	private render(): void {
		this.updateTitleArea();
		let allMarkers = this.markerService.read().slice(0);
		let model= new MarkersModel(allMarkers);
		this.tree.setInput(model);
	}

	public dispose(): void {
		this._toDispose = lifecycle.dispose(this._toDispose);
		super.dispose();
	}
}