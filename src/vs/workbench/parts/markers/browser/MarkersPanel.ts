/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/markers';
import { TPromise } from 'vs/base/common/winjs.base';
import lifecycle = require('vs/base/common/lifecycle');
import builder = require('vs/base/browser/builder');
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Panel } from 'vs/workbench/browser/panel';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import Constants from 'vs/workbench/parts/markers/common/Constants';
import * as MarkersModel from 'vs/workbench/parts/markers/common/MarkersModel';
import Tree = require('vs/base/parts/tree/browser/tree');
import TreeImpl = require('vs/base/parts/tree/browser/treeImpl');
import * as Viewer from 'vs/workbench/parts/markers/browser/MarkersTreeViewer';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

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
		addClass(parent.getHTMLElement(), 'markers-panel');

		var renderer = this.instantiationService.createInstance(Viewer.Renderer);
		this.tree = new TreeImpl.Tree(parent.getHTMLElement(), {
			dataSource: new Viewer.DataSource(),
			renderer: renderer,
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

	public layout(dimension: builder.Dimension): void {
		this.tree.layout(dimension.height);
	}

	private render(): void {
		let allMarkers = this.markerService.read().slice(0);
		let model= MarkersModel.toModel(allMarkers);
		this.tree.setInput(model);
	}

	public dispose(): void {
		this._toDispose = lifecycle.dispose(this._toDispose);
		super.dispose();
	}
}