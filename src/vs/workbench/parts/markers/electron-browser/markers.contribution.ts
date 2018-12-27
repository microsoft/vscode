/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { clipboard } from 'electron';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KeybindingsRegistry, KeybindingWeight, IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { Marker, RelatedInformation } from 'vs/workbench/parts/markers/electron-browser/markersModel';
import { MarkersPanel } from 'vs/workbench/parts/markers/electron-browser/markersPanel';
import { MenuId, MenuRegistry, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { PanelRegistry, Extensions as PanelExtensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { Registry } from 'vs/platform/registry/common/platform';
import { ToggleMarkersPanelAction, ShowProblemsPanelAction } from 'vs/workbench/parts/markers/electron-browser/markersPanelActions';
import Constants from 'vs/workbench/parts/markers/electron-browser/constants';
import Messages from 'vs/workbench/parts/markers/electron-browser/messages';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IMarkersWorkbenchService, MarkersWorkbenchService, ActivityUpdater } from 'vs/workbench/parts/markers/electron-browser/markers';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

import './markersFileDecorations';

registerSingleton(IMarkersWorkbenchService, MarkersWorkbenchService, false);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.MARKER_OPEN_SIDE_ACTION_ID,
	weight: KeybindingWeight.WorkbenchContrib,
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
	weight: KeybindingWeight.WorkbenchContrib,
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

// workbench
const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ActivityUpdater, LifecyclePhase.Restored);

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
	title: localize('copyMessage', "Copy Message"),
	handler(accessor) {
		copyMessage(accessor.get(IPanelService));
	},
	menu: {
		menuId: MenuId.ProblemsPanelContext,
		when: Constants.MarkerFocusContextKey,
		group: 'navigation'
	}
});
registerAction({
	id: Constants.RELATED_INFORMATION_COPY_MESSAGE_ACTION_ID,
	title: localize('copyMessage', "Copy Message"),
	handler(accessor) {
		copyRelatedInformationMessage(accessor.get(IPanelService));
	},
	menu: {
		menuId: MenuId.ProblemsPanelContext,
		when: Constants.RelatedInformationFocusContextKey,
		group: 'navigation'
	}
});
registerAction({
	id: Constants.FOCUS_PROBLEMS_FROM_FILTER,
	handler(accessor) {
		focusProblemsView(accessor.get(IPanelService));
	},
	keybinding: {
		when: Constants.MarkerPanelFilterFocusContextKey,
		keys: {
			primary: KeyMod.CtrlCmd | KeyCode.DownArrow
		},
	}
});
registerAction({
	id: Constants.MARKERS_PANEL_FOCUS_FILTER,
	handler(accessor) {
		focusProblemsFilter(accessor.get(IPanelService));
	},
	keybinding: {
		when: Constants.MarkerPanelFocusContextKey,
		keys: {
			primary: KeyMod.CtrlCmd | KeyCode.KEY_F
		},
	}
});
registerAction({
	id: Constants.MARKERS_PANEL_SHOW_MULTILINE_MESSAGE,
	handler(accessor) {
		const panelService = accessor.get(IPanelService);
		const panel = panelService.getActivePanel();
		if (panel instanceof MarkersPanel) {
			panel.markersViewState.multiline = true;
		}
	},
	title: localize('show multiline', "Show message in multiple lines"),
	category: localize('problems', "Problems"),
	menu: {
		menuId: MenuId.CommandPalette,
		when: new RawContextKey<string>('activePanel', Constants.MARKERS_PANEL_ID)
	}
});
registerAction({
	id: Constants.MARKERS_PANEL_SHOW_SINGLELINE_MESSAGE,
	handler(accessor) {
		const panelService = accessor.get(IPanelService);
		const panel = panelService.getActivePanel();
		if (panel instanceof MarkersPanel) {
			panel.markersViewState.multiline = false;
		}
	},
	title: localize('show singleline', "Show message in single line"),
	category: localize('problems', "Problems"),
	menu: {
		menuId: MenuId.CommandPalette,
		when: new RawContextKey<string>('activePanel', Constants.MARKERS_PANEL_ID)
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
			clipboard.writeText(element.marker.message);
		}
	}
}

function copyRelatedInformationMessage(panelService: IPanelService) {
	const activePanel = panelService.getActivePanel();
	if (activePanel instanceof MarkersPanel) {
		const element = (<MarkersPanel>activePanel).getFocusElement();
		if (element instanceof RelatedInformation) {
			clipboard.writeText(element.raw.message);
		}
	}
}

function focusProblemsView(panelService: IPanelService) {
	const activePanel = panelService.getActivePanel();
	if (activePanel instanceof MarkersPanel) {
		activePanel.focus();
	}
}

function focusProblemsFilter(panelService: IPanelService) {
	const activePanel = panelService.getActivePanel();
	if (activePanel instanceof MarkersPanel) {
		activePanel.focusFilter();
	}
}

interface IActionDescriptor {
	id: string;
	handler: ICommandHandler;

	// ICommandUI
	title?: string;
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

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '4_panels',
	command: {
		id: ToggleMarkersPanelAction.ID,
		title: localize({ key: 'miMarker', comment: ['&& denotes a mnemonic'] }, "&&Problems")
	},
	order: 4
});
