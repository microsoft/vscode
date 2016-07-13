/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Messages from 'vs/workbench/parts/markers/common/messages';
import Constants from 'vs/workbench/parts/markers/common/constants';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import * as platform from 'vs/platform/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import * as panel from 'vs/workbench/browser/panel';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import * as markersPanelActions from 'vs/workbench/parts/markers/browser/markersPanelActions';

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
		Messages.MARKERS_PANEL_TITLE_NO_PROBLEMS,
		'markersPanel'
	));

	let registry = <IWorkbenchActionRegistry>platform.Registry.as(ActionExtensions.WorkbenchActions);

	registry.registerWorkbenchAction(new SyncActionDescriptor(markersPanelActions.ToggleMarkersPanelAction, markersPanelActions.ToggleMarkersPanelAction.ID, Messages.MARKERS_PANEL_TOGGLE_LABEL, {
		primary: null,
		win: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_M },
		linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_M },
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_M }
	}), 'View: ' + Messages.MARKERS_PANEL_TOGGLE_LABEL, Messages.MARKERS_PANEL_VIEW_CATEGORY);

	// Retaining old action to show errors and warnings, so that custom bindings to this action for existing users works.
	registry.registerWorkbenchAction(new SyncActionDescriptor(markersPanelActions.ToggleErrorsAndWarningsAction, markersPanelActions.ToggleErrorsAndWarningsAction.ID, ''), Messages.SHOW_ERRORS_WARNINGS_ACTION_LABEL);
}