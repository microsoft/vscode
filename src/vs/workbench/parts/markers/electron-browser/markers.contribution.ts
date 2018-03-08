/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { clipboard } from 'electron';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KeybindingsRegistry, IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { Marker } from 'vs/workbench/parts/markers/electron-browser/markersModel';
import { MarkersPanel } from 'vs/workbench/parts/markers/electron-browser/markersPanel';
import { MenuId, MenuRegistry, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { PanelRegistry, Extensions as PanelExtensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { Registry } from 'vs/platform/registry/common/platform';
import { ToggleMarkersPanelAction, ShowProblemsPanelAction } from 'vs/workbench/parts/markers/electron-browser/markersPanelActions';
import Constants from 'vs/workbench/parts/markers/electron-browser/constants';
import Messages from 'vs/workbench/parts/markers/electron-browser/messages';

import './markers';
import './markersFileDecorations';

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

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.MARKER_SHOW_PANEL_ID,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: undefined,
	primary: undefined,
	handler: (accessor, args: any) => {
		accessor.get(IPanelService).openPanel(Constants.MARKERS_PANEL_ID);
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
	MarkersPanel,
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
}), 'View: Toggle Problems (Errors, Warnings, Infos)', Messages.MARKERS_PANEL_VIEW_CATEGORY);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowProblemsPanelAction, ShowProblemsPanelAction.ID, ShowProblemsPanelAction.LABEL), 'View: Focus Problems (Errors, Warnings, Infos)', Messages.MARKERS_PANEL_VIEW_CATEGORY);
registerAction({
	id: Constants.MARKER_COPY_ACTION_ID,
	title: localize('copyMarker', "Copy"),
	handler(accessor) {
		copyMarker(accessor.get(IPanelService));
	},
	menu: {
		menuId: MenuId.ProblemsPanelContext,
		when: Constants.MarkerFocusContextKey,
		group: 'navigation'
	},
	keybinding: {
		keys: {
			primary: KeyMod.CtrlCmd | KeyCode.KEY_C
		},
		when: Constants.MarkerFocusContextKey
	}
});
registerAction({
	id: Constants.MARKER_COPY_MESSAGE_ACTION_ID,
	title: localize('copyMarkerMessage', "Copy Message"),
	handler(accessor) {
		copyMessage(accessor.get(IPanelService));
	},
	menu: {
		menuId: MenuId.ProblemsPanelContext,
		when: Constants.MarkerFocusContextKey,
		group: 'navigation'
	}
});


function copyMarker(panelService: IPanelService) {
	const activePanel = panelService.getActivePanel();
	if (activePanel instanceof MarkersPanel) {
		const element = (<MarkersPanel>activePanel).getFocusElement();
		if (element instanceof Marker) {
			clipboard.writeText(`${element}`);
		}
	}
}

function copyMessage(panelService: IPanelService) {
	const activePanel = panelService.getActivePanel();
	if (activePanel instanceof MarkersPanel) {
		const element = (<MarkersPanel>activePanel).getFocusElement();
		if (element instanceof Marker) {
			clipboard.writeText(element.raw.message);
		}
	}
}

interface IActionDescriptor {
	id: string;
	handler: ICommandHandler;

	// ICommandUI
	title: string;
	category?: string;
	f1?: boolean;

	//
	menu?: {
		menuId: MenuId,
		when?: ContextKeyExpr;
		group?: string;
	};

	//
	keybinding?: {
		when?: ContextKeyExpr;
		weight?: number;
		keys: IKeybindings;
	};
}

function registerAction(desc: IActionDescriptor) {

	const { id, handler, title, category, menu, keybinding } = desc;

	// 1) register as command
	CommandsRegistry.registerCommand(id, handler);

	// 2) menus
	let command = { id, title, category };
	if (menu) {
		let { menuId, when, group } = menu;
		MenuRegistry.appendMenuItem(menuId, {
			command,
			when,
			group
		});
	}

	// 3) keybindings
	if (keybinding) {
		let { when, weight, keys } = keybinding;
		KeybindingsRegistry.registerKeybindingRule({
			id,
			when,
			weight,
			primary: keys.primary,
			secondary: keys.secondary,
			linux: keys.linux,
			mac: keys.mac,
			win: keys.win
		});
	}
}
