/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import * as lifecycle from 'vs/base/common/lifecycle';
import Messages from 'vs/workbench/parts/markers/common/messages';
import Constants from 'vs/workbench/parts/markers/common/constants';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import * as platform from 'vs/platform/platform';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activityService';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import * as panel from 'vs/workbench/browser/panel';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import * as markersPanelActions from 'vs/workbench/parts/markers/browser/markersPanelActions';

class StatusUpdater implements IWorkbenchContribution {
	static ID = 'vs.markers.statusUpdater';

	private toDispose: lifecycle.IDisposable[];

	constructor(
		@IMarkerService private markerService: IMarkerService,
		@IActivityService private activityService: IActivityService
	) {

		this.toDispose = [];
		this.toDispose.push(markerService.onMarkerChanged(() => this.updateActivityBadge()));
	}

	private updateActivityBadge(): void {
		const stats = this.markerService.getStatistics();
		const problemCount = stats.errors + stats.warnings + stats.infos + stats.unknowns;
		if (problemCount > 0) {
			const badge = new NumberBadge(problemCount, n => localize({ comment: ['Argument represents count (number) of errors and warnings.'], key: 'errorsAndWarnings' }, '{0} Errors and Warnings', n));
			this.activityService.showActivity(Constants.MARKERS_PANEL_ID, badge);
		} else {
			this.activityService.showActivity(Constants.MARKERS_PANEL_ID, null);
		}
	}

	public getId(): string {
		return StatusUpdater.ID;
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}

export function registerContributions(): void {

	(<IConfigurationRegistry>platform.Registry.as(Extensions.Configuration)).registerConfiguration({
		'id': 'problems',
		'order': 101,
		'title': Messages.PROBLEMS_PANEL_CONFIGURATION_TITLE,
		'type': 'object',
		'properties': {
			'problems.autoReveal': {
				'description': Messages.PROBLEMS_PANEL_CONFIGURATION_AUTO_REVEAL,
				'type': 'boolean',
				'default': true
			}
		}
	});

	// register markers panel
	(<panel.PanelRegistry>platform.Registry.as(panel.Extensions.Panels)).registerPanel(new panel.PanelDescriptor(
		'vs/workbench/parts/markers/browser/markersPanel',
		'MarkersPanel',
		Constants.MARKERS_PANEL_ID,
		Messages.MARKERS_PANEL_TITLE_PROBLEMS,
		'markersPanel',
		10

	));

	let registry = <IWorkbenchActionRegistry>platform.Registry.as(ActionExtensions.WorkbenchActions);

	registry.registerWorkbenchAction(new SyncActionDescriptor(markersPanelActions.ToggleMarkersPanelAction, markersPanelActions.ToggleMarkersPanelAction.ID, markersPanelActions.ToggleMarkersPanelAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_M
	}), 'View: ' + Messages.MARKERS_PANEL_TOGGLE_LABEL, Messages.MARKERS_PANEL_VIEW_CATEGORY);

	// Retaining old action to show errors and warnings, so that custom bindings to this action for existing users works.
	registry.registerWorkbenchAction(new SyncActionDescriptor(markersPanelActions.ToggleErrorsAndWarningsAction, markersPanelActions.ToggleErrorsAndWarningsAction.ID, markersPanelActions.ToggleErrorsAndWarningsAction.LABEL), '');

	// Register StatusUpdater
	(<IWorkbenchContributionsRegistry>platform.Registry.as(WorkbenchExtensions.Workbench)).registerWorkbenchContribution(
		StatusUpdater
	);
}