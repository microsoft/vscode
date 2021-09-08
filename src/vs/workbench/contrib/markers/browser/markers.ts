/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { localize } from 'vs/nls';
import Constants from './constants';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { MarkersFilters } from 'vs/workbench/contrib/markers/browser/markersViewActions';
import { Event } from 'vs/base/common/event';
import { IView } from 'vs/workbench/common/views';
import { MarkerElement } from 'vs/workbench/contrib/markers/browser/markersModel';

export interface IMarkersView extends IView {

	readonly onDidFocusFilter: Event<void>;
	readonly onDidClearFilterText: Event<void>;
	readonly filters: MarkersFilters;
	readonly onDidChangeFilterStats: Event<{ total: number, filtered: number }>;
	focusFilter(): void;
	clearFilterText(): void;
	getFilterStats(): { total: number, filtered: number };

	getFocusElement(): MarkerElement | undefined;

	collapseAll(): void;
	setMultiline(multiline: boolean): void;
}

export class ActivityUpdater extends Disposable implements IWorkbenchContribution {

	private readonly activity = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@IActivityService private readonly activityService: IActivityService,
		@IMarkerService private readonly markerService: IMarkerService
	) {
		super();
		this._register(this.markerService.onMarkerChanged(() => this.updateBadge()));
		this.updateBadge();
	}

	private updateBadge(): void {
		const { errors, warnings, infos } = this.markerService.getStatistics();
		const total = errors + warnings + infos;
		const message = localize('totalProblems', 'Total {0} Problems', total);
		this.activity.value = this.activityService.showViewActivity(Constants.MARKERS_VIEW_ID, { badge: new NumberBadge(total, () => message) });
	}
}
