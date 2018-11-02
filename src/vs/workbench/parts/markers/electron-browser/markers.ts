/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MarkersModel, compareMarkersByUri } from './markersModel';
import { Disposable } from 'vs/base/common/lifecycle';
import { IMarkerService, MarkerSeverity, IMarker } from 'vs/platform/markers/common/markers';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { localize } from 'vs/nls';
import Constants from './constants';
import { URI } from 'vs/base/common/uri';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { groupBy } from 'vs/base/common/arrays';

export const IMarkersWorkbenchService = createDecorator<IMarkersWorkbenchService>('markersWorkbenchService');

export interface IFilter {
	filterText: string;
	useFilesExclude: boolean;
}

export interface IMarkersWorkbenchService {
	_serviceBrand: any;
	readonly markersModel: MarkersModel;
}

export class MarkersWorkbenchService extends Disposable implements IMarkersWorkbenchService {
	_serviceBrand: any;

	readonly markersModel: MarkersModel;

	constructor(
		@IMarkerService private markerService: IMarkerService,
		@IActivityService private activityService: IActivityService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this.markersModel = this._register(instantiationService.createInstance(MarkersModel, this.readMarkers()));

		for (const group of groupBy(this.readMarkers(), compareMarkersByUri)) {
			this.markersModel.setResourceMarkers(group[0].resource, group);
		}

		this._register(markerService.onMarkerChanged(resources => this.onMarkerChanged(resources)));
	}

	private onMarkerChanged(resources: URI[]): void {
		for (const resource of resources) {
			this.markersModel.setResourceMarkers(resource, this.readMarkers(resource));
		}

		this.refreshBadge();
	}

	private readMarkers(resource?: URI): IMarker[] {
		return this.markerService.read({ resource, severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
	}

	private refreshBadge(): void {
		const total = this.markersModel.resourceMarkers.reduce((r, rm) => r + rm.markers.length, 0);
		const message = localize('totalProblems', 'Total {0} Problems', total);
		this.activityService.showActivity(Constants.MARKERS_PANEL_ID, new NumberBadge(total, () => message));
	}
}

registerSingleton(IMarkersWorkbenchService, MarkersWorkbenchService, true);
