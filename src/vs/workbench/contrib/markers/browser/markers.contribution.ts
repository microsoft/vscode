/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/contrib/markers/browser/markersFileDecorations';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { Marker, RelatedInformation } from 'vs/workbench/contrib/markers/browser/markersModel';
import { MarkersPanel } from 'vs/workbench/contrib/markers/browser/markersPanel';
import { MenuId, MenuRegistry, SyncActionDescriptor, registerAction } from 'vs/platform/actions/common/actions';
import { PanelRegistry, Extensions as PanelExtensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { Registry } from 'vs/platform/registry/common/platform';
import { ToggleMarkersPanelAction, ShowProblemsPanelAction } from 'vs/workbench/contrib/markers/browser/markersPanelActions';
import Constants from 'vs/workbench/contrib/markers/browser/constants';
import Messages from 'vs/workbench/contrib/markers/browser/messages';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IMarkersWorkbenchService, MarkersWorkbenchService, ActivityUpdater } from 'vs/workbench/contrib/markers/browser/markers';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ActivePanelContext } from 'vs/workbench/common/panel';
import { Disposable } from 'vs/base/common/lifecycle';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment, IStatusbarEntry } from 'vs/platform/statusbar/common/statusbar';
import { IMarkerService, MarkerStatistics } from 'vs/platform/markers/common/markers';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';

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

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.MARKER_SHOW_QUICK_FIX,
	weight: KeybindingWeight.WorkbenchContrib,
	when: Constants.MarkerFocusContextKey,
	primary: KeyMod.CtrlCmd | KeyCode.US_DOT,
	handler: (accessor, args: any) => {
		const markersPanel = (<MarkersPanel>accessor.get(IPanelService).getActivePanel());
		const focusedElement = markersPanel.getFocusElement();
		if (focusedElement instanceof Marker) {
			markersPanel.showQuickFixes(focusedElement);
		}
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
	title: { value: localize('copyMarker', "Copy"), original: 'Copy' },
	async handler(accessor) {
		await copyMarker(accessor.get(IPanelService), accessor.get(IClipboardService));
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
	title: { value: localize('copyMessage', "Copy Message"), original: 'Copy Message' },
	async handler(accessor) {
		await copyMessage(accessor.get(IPanelService), accessor.get(IClipboardService));
	},
	menu: {
		menuId: MenuId.ProblemsPanelContext,
		when: Constants.MarkerFocusContextKey,
		group: 'navigation'
	}
});
registerAction({
	id: Constants.RELATED_INFORMATION_COPY_MESSAGE_ACTION_ID,
	title: { value: localize('copyMessage', "Copy Message"), original: 'Copy Message' },
	async handler(accessor) {
		await copyRelatedInformationMessage(accessor.get(IPanelService), accessor.get(IClipboardService));
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
			panel.markersViewModel.multiline = true;
		}
	},
	title: { value: localize('show multiline', "Show message in multiple lines"), original: 'Problems: Show message in multiple lines' },
	category: localize('problems', "Problems"),
	menu: {
		menuId: MenuId.CommandPalette,
		when: ActivePanelContext.isEqualTo(Constants.MARKERS_PANEL_ID)
	}
});
registerAction({
	id: Constants.MARKERS_PANEL_SHOW_SINGLELINE_MESSAGE,
	handler(accessor) {
		const panelService = accessor.get(IPanelService);
		const panel = panelService.getActivePanel();
		if (panel instanceof MarkersPanel) {
			panel.markersViewModel.multiline = false;
		}
	},
	title: { value: localize('show singleline', "Show message in single line"), original: 'Problems: Show message in single line' },
	category: localize('problems', "Problems"),
	menu: {
		menuId: MenuId.CommandPalette,
		when: ActivePanelContext.isEqualTo(Constants.MARKERS_PANEL_ID)
	}
});

async function copyMarker(panelService: IPanelService, clipboardService: IClipboardService) {
	const activePanel = panelService.getActivePanel();
	if (activePanel instanceof MarkersPanel) {
		const element = (<MarkersPanel>activePanel).getFocusElement();
		if (element instanceof Marker) {
			await clipboardService.writeText(`${element}`);
		}
	}
}

async function copyMessage(panelService: IPanelService, clipboardService: IClipboardService) {
	const activePanel = panelService.getActivePanel();
	if (activePanel instanceof MarkersPanel) {
		const element = (<MarkersPanel>activePanel).getFocusElement();
		if (element instanceof Marker) {
			await clipboardService.writeText(element.marker.message);
		}
	}
}

async function copyRelatedInformationMessage(panelService: IPanelService, clipboardService: IClipboardService) {
	const activePanel = panelService.getActivePanel();
	if (activePanel instanceof MarkersPanel) {
		const element = (<MarkersPanel>activePanel).getFocusElement();
		if (element instanceof RelatedInformation) {
			await clipboardService.writeText(element.raw.message);
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

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '4_panels',
	command: {
		id: ToggleMarkersPanelAction.ID,
		title: localize({ key: 'miMarker', comment: ['&& denotes a mnemonic'] }, "&&Problems")
	},
	order: 4
});

CommandsRegistry.registerCommand('workbench.actions.view.toggleProblems', accessor => {
	const panelService = accessor.get(IPanelService);
	const panel = accessor.get(IPanelService).getActivePanel();
	if (panel && panel.getId() === Constants.MARKERS_PANEL_ID) {
		panelService.hideActivePanel();
	} else {
		panelService.openPanel(Constants.MARKERS_PANEL_ID, true);
	}
});

class MarkersStatusBarContributions extends Disposable implements IWorkbenchContribution {

	private markersStatusItem: IStatusbarEntryAccessor;

	constructor(
		@IMarkerService private readonly markerService: IMarkerService,
		@IStatusbarService private readonly statusbarService: IStatusbarService
	) {
		super();
		this.markersStatusItem = this._register(this.statusbarService.addEntry(this.getMarkersItem(), 'status.problems', localize('status.problems', "Problems"), StatusbarAlignment.LEFT, 50 /* Medium Priority */));
		this.markerService.onMarkerChanged(() => this.markersStatusItem.update(this.getMarkersItem()));
	}

	private getMarkersItem(): IStatusbarEntry {
		const markersStatistics = this.markerService.getStatistics();
		return {
			text: this.getMarkersText(markersStatistics),
			tooltip: this.getMarkersTooltip(markersStatistics),
			command: 'workbench.actions.view.toggleProblems'
		};
	}

	private getMarkersTooltip(stats: MarkerStatistics): string {
		const errorTitle = (n: number) => localize('totalErrors', "{0} Errors", n);
		const warningTitle = (n: number) => localize('totalWarnings', "{0} Warnings", n);
		const infoTitle = (n: number) => localize('totalInfos', "{0} Infos", n);

		const titles: string[] = [];

		if (stats.errors > 0) {
			titles.push(errorTitle(stats.errors));
		}

		if (stats.warnings > 0) {
			titles.push(warningTitle(stats.warnings));
		}

		if (stats.infos > 0) {
			titles.push(infoTitle(stats.infos));
		}

		if (titles.length === 0) {
			return localize('noProblems', "No Problems");
		}

		return titles.join(', ');
	}

	private getMarkersText(stats: MarkerStatistics): string {
		const problemsText: string[] = [];

		// Errors
		problemsText.push('$(error) ' + this.packNumber(stats.errors));

		// Warnings
		problemsText.push('$(warning) ' + this.packNumber(stats.warnings));

		// Info (only if any)
		if (stats.infos > 0) {
			problemsText.push('$(info) ' + this.packNumber(stats.infos));
		}

		return problemsText.join(' ');
	}

	private packNumber(n: number): string {
		const manyProblems = localize('manyProblems', "10K+");
		return n > 9999 ? manyProblems : n > 999 ? n.toString().charAt(0) + 'K' : n.toString();
	}
}

workbenchRegistry.registerWorkbenchContribution(MarkersStatusBarContributions, LifecyclePhase.Restored);