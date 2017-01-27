/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Messages from 'vs/workbench/parts/markers/common/messages';
import Constants from 'vs/workbench/parts/markers/common/constants';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Registry } from 'vs/platform/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { PanelRegistry, Extensions as PanelExtensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ToggleMarkersPanelAction, ToggleErrorsAndWarningsAction } from 'vs/workbench/parts/markers/browser/markersPanelActions';

export function registerContributions(): void {

	// configuration
	Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
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

	// markers panel
	Registry.as<PanelRegistry>(PanelExtensions.Panels).registerPanel(new PanelDescriptor(
		'vs/workbench/parts/markers/browser/markersPanel',
		'MarkersPanel',
		Constants.MARKERS_PANEL_ID,
		Messages.MARKERS_PANEL_TITLE_PROBLEMS,
		'markersPanel',
		10,
		ToggleMarkersPanelAction.ID
	));

	// actions
	const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
	registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMarkersPanelAction, ToggleMarkersPanelAction.ID, ToggleMarkersPanelAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_M
	}), 'View: Show Problems', Messages.MARKERS_PANEL_VIEW_CATEGORY);

	// Retaining old action to show errors and warnings, so that custom bindings to this action for existing users works.
	registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleErrorsAndWarningsAction, ToggleErrorsAndWarningsAction.ID, ToggleErrorsAndWarningsAction.LABEL), 'Show Errors and Warnings');
}