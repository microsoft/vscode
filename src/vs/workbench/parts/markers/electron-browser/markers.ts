/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { MarkersModel, FilterOptions } from './markersModel';
import { Disposable } from 'vs/base/common/lifecycle';
import { IMarkerService, MarkerSeverity, IMarker } from 'vs/platform/markers/common/markers';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { localize } from 'vs/nls';
import Constants from './constants';
import URI from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export const IMarkersWorkbenchService = createDecorator<IMarkersWorkbenchService>('markersWorkbenchService');

export interface IMarkersWorkbenchService {
	_serviceBrand: any;

	readonly onDidChangeMarkersForResources: Event<URI[]>;
	readonly markersModel: MarkersModel;

	filter(filter: string): void;
}

export class MarkersWorkbenchService extends Disposable implements IMarkersWorkbenchService {
	_serviceBrand: any;

	readonly markersModel: MarkersModel;

	private readonly _onDidChangeMarkersForResources: Emitter<URI[]> = this._register(new Emitter<URI[]>());
	readonly onDidChangeMarkersForResources: Event<URI[]> = this._onDidChangeMarkersForResources.event;

	constructor(
		@IMarkerService private markerService: IMarkerService,
		@IActivityService private activityService: IActivityService
	) {
		super();
		this.markersModel = this._register(new MarkersModel(this.readMarkers()));
		this._register(markerService.onMarkerChanged(resources => this.onMarkerChanged(resources)));
	}

	filter(filter: string): void {
		this.markersModel.updateFilterOptions(new FilterOptions(filter));
		this.refreshBadge();
	}

	private onMarkerChanged(resources: URI[]): void {
		this.markersModel.updateMarkers(updater => {
			for (const resource of resources) {
				updater(resource, this.readMarkers(resource));
			}
		});
		this.refreshBadge();
		this._onDidChangeMarkersForResources.fire(resources);
	}

	private readMarkers(resource?: URI): IMarker[] {
		return this.markerService.read({ resource, severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
	}

	private refreshBadge(): void {
		const { total, filtered } = this.markersModel.stats();
		const message = total === filtered ? localize('totalProblems', 'Total {0} Problems', total) : localize('filteredProblems', 'Showing {0} of {1} Problems', filtered, total);
		this.activityService.showActivity(Constants.MARKERS_PANEL_ID, new NumberBadge(filtered, () => message));
	}
}


registerSingleton(IMarkersWorkbenchService, MarkersWorkbenchService);
