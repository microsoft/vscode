/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Messages from 'vs/workbench/parts/markers/common/messages';
import Constants from 'vs/workbench/parts/markers/common/constants';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { PanelRegistry, Extensions as PanelExtensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ToggleMarkersPanelAction, ToggleErrorsAndWarningsAction } from 'vs/workbench/parts/markers/browser/markersPanelActions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { MarkersPanel } from 'vs/workbench/parts/markers/browser/markersPanel';

export function registerContributions(): void {

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: Constants.MARKER_OPEN_SIDE_ACTION_ID,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: ContextKeyExpr.and(Constants.MarkerFocusContextKey),
		primary: KeyMod.CtrlCmd | KeyCode.Enter,
		mac: {
			primary: KeyMod.WinCtrl | KeyCode.Enter
		},
		handler: (accessor, args: any) => {
			const markersPanel = (<MarkersPanel>accessor.get(IPanelService).getActivePanel());
			markersPanel.openFileAtElement(markersPanel.getFocusElement(), false, true, true);
		}
	});

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