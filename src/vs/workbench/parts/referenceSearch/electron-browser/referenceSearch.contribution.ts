/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/referenceSearch.contribution';
import { Registry } from 'vs/platform/registry/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import * as nls from 'vs/nls';
import { SyncActionDescriptor, MenuRegistry, MenuId, ICommandAction } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import * as Constants from 'vs/workbench/parts/referenceSearch/common/constants';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IReferenceSearchWorkbenchService, ReferenceSearchWorkbenchService } from 'vs/workbench/parts/referenceSearch/common/referenceSearchModel';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ReferenceSearchView } from 'vs/workbench/parts/referenceSearch/browser/referenceSearchView';
import { WorkbenchListFocusContextKey } from 'vs/platform/list/browser/listService';
import { PanelRegistry, Extensions as PanelExtensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { getReferenceSearchView, FocusNextReferenceSearchResultAction, FocusPreviousReferenceSearchResultAction, ShowReferenceSearchAction, CollapseDeepestExpandedLevelAction, RemoveAction, ClearReferenceSearchResultsAction, copyPathCommand, copyMatchCommand, copyAllCommand, RefreshAction, focusReferenceSearchListCommand } from 'vs/workbench/parts/referenceSearch/browser/referenceSearchActions';
import { VIEW_ID, IReferenceSearchConfigurationProperties } from 'vs/workbench/parts/referenceSearch/common/referenceSearch';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { ReferenceSearchViewLocationUpdater } from 'vs/workbench/parts/referenceSearch/browser/referenceSearchViewLocationUpdater';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

registerSingleton(IReferenceSearchWorkbenchService, ReferenceSearchWorkbenchService);

const category = nls.localize('referenceSearch', "ReferenceSearch");

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.OpenMatchToSide,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.ReferenceSearchViewVisibleKey, Constants.FileMatchOrMatchFocusKey),
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	mac: {
		primary: KeyMod.WinCtrl | KeyCode.Enter
	},
	handler: (accessor, args: any) => {
		const referenceSearchView = getReferenceSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
		const tree: ITree = referenceSearchView.getControl();
		referenceSearchView.open(tree.getFocus(), false, true, true);
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.CancelActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.ReferenceSearchViewVisibleKey, WorkbenchListFocusContextKey),
	primary: KeyCode.Escape,
	handler: (accessor, args: any) => {
		const referenceSearchView = getReferenceSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
		referenceSearchView.cancelReferenceSearch();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.RemoveActionId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: ContextKeyExpr.and(Constants.ReferenceSearchViewVisibleKey, Constants.FileMatchOrMatchFocusKey),
	primary: KeyCode.Delete,
	mac: {
		primary: KeyMod.CtrlCmd | KeyCode.Backspace,
	},
	handler: (accessor, args: any) => {
		const referenceSearchView = getReferenceSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
		const tree: ITree = referenceSearchView.getControl();
		accessor.get(IInstantiationService).createInstance(RemoveAction, tree, tree.getFocus(), referenceSearchView).run();
	}
});

MenuRegistry.appendMenuItem(MenuId.ReferenceSearchContext, {
	command: {
		id: Constants.RemoveActionId,
		title: RemoveAction.LABEL
	},
	when: Constants.FileMatchOrMatchFocusKey,
	group: 'referenceSearch',
	order: 2
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.CopyMatchCommandId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: Constants.FileMatchOrMatchFocusKey,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
	handler: copyMatchCommand
});

MenuRegistry.appendMenuItem(MenuId.ReferenceSearchContext, {
	command: {
		id: Constants.CopyMatchCommandId,
		title: nls.localize('copyMatchLabel', "Copy")
	},
	when: Constants.FileMatchOrMatchFocusKey,
	group: 'referenceSearch_2',
	order: 1
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: Constants.CopyPathCommandId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: Constants.FileMatchOrFolderMatchFocusKey,
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_C,
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_C
	},
	handler: copyPathCommand
});

MenuRegistry.appendMenuItem(MenuId.ReferenceSearchContext, {
	command: {
		id: Constants.CopyPathCommandId,
		title: nls.localize('copyPathLabel', "Copy Path")
	},
	when: Constants.FileMatchOrFolderMatchFocusKey,
	group: 'referenceSearch_2',
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.ReferenceSearchContext, {
	command: {
		id: Constants.CopyAllCommandId,
		title: nls.localize('copyAllLabel', "Copy All")
	},
	when: Constants.HasReferenceSearchResults,
	group: 'referenceSearch_2',
	order: 3
});

CommandsRegistry.registerCommand({
	id: Constants.CopyAllCommandId,
	handler: copyAllCommand
});

CommandsRegistry.registerCommand({
	id: Constants.ToggleReferenceSearchViewPositionCommandId,
	handler: (accessor) => {
		const configurationService = accessor.get(IConfigurationService);
		const currentValue = configurationService.getValue<IReferenceSearchConfigurationProperties>('referenceSearch').location;
		const toggleValue = currentValue === 'sidebar' ? 'panel' : 'sidebar';

		configurationService.updateValue('referenceSearch.location', toggleValue);
	}
});

const toggleReferenceSearchViewPositionLabel = nls.localize('toggleReferenceSearchViewPositionLabel', "Toggle ReferenceSearch View Position");
const ToggleReferenceSearchViewPositionCommand: ICommandAction = {
	id: Constants.ToggleReferenceSearchViewPositionCommandId,
	title: toggleReferenceSearchViewPositionLabel,
	category
};
MenuRegistry.addCommand(ToggleReferenceSearchViewPositionCommand);
MenuRegistry.appendMenuItem(MenuId.ReferenceSearchContext, {
	command: ToggleReferenceSearchViewPositionCommand,
	when: Constants.ReferenceSearchViewVisibleKey,
	group: 'referenceSearch_9',
	order: 1
});

CommandsRegistry.registerCommand({
	id: Constants.FocusReferenceSearchListCommandID,
	handler: focusReferenceSearchListCommand
});

const focusReferenceSearchListCommandLabel = nls.localize('focusReferenceSearchListCommandLabel', "Focus List");
const FocusReferenceSearchListCommand: ICommandAction = {
	id: Constants.FocusReferenceSearchListCommandID,
	title: focusReferenceSearchListCommandLabel,
	category
};
MenuRegistry.addCommand(FocusReferenceSearchListCommand);

CommandsRegistry.registerCommand({
	id: ClearReferenceSearchResultsAction.ID,
	handler: (accessor, args: any) => {
		accessor.get(IInstantiationService).createInstance(ClearReferenceSearchResultsAction, ClearReferenceSearchResultsAction.ID, '').run();
	}
});

CommandsRegistry.registerCommand({
	id: RefreshAction.ID,
	handler: (accessor, args: any) => {
		accessor.get(IInstantiationService).createInstance(RefreshAction, RefreshAction.ID, '').run();
	}
});

// Register View in Viewlet and Panel area
Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
	ReferenceSearchView,
	VIEW_ID,
	nls.localize('name', "ReferenceSearch"),
	'referenceSearch',
	1
));

Registry.as<PanelRegistry>(PanelExtensions.Panels).registerPanel(new PanelDescriptor(
	ReferenceSearchView,
	VIEW_ID,
	nls.localize('name', "ReferenceSearch"),
	'referenceSearch',
	10
));

// Register view location updater
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ReferenceSearchViewLocationUpdater, LifecyclePhase.Restoring);

// Actions
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

registry.registerWorkbenchAction(new SyncActionDescriptor(ShowReferenceSearchAction, VIEW_ID, nls.localize('showReferenceSearchViewl', "Show ReferenceSearch"), { primary: KeyMod.Alt | KeyMod.Shift | KeyCode.KEY_D }, Constants.ReferenceSearchViewVisibleKey.toNegated()), 'View: Show ReferenceSearch', nls.localize('view', "View"));

registry.registerWorkbenchAction(new SyncActionDescriptor(FocusNextReferenceSearchResultAction, FocusNextReferenceSearchResultAction.ID, FocusNextReferenceSearchResultAction.LABEL, { primary: KeyCode.F4 }, ContextKeyExpr.and(Constants.HasReferenceSearchResults)), 'Focus Next ReferenceSearch Result', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusPreviousReferenceSearchResultAction, FocusPreviousReferenceSearchResultAction.ID, FocusPreviousReferenceSearchResultAction.LABEL, { primary: KeyMod.Shift | KeyCode.F4 }, ContextKeyExpr.and(Constants.HasReferenceSearchResults)), 'Focus Previous ReferenceSearch Result', category);

registry.registerWorkbenchAction(new SyncActionDescriptor(CollapseDeepestExpandedLevelAction, CollapseDeepestExpandedLevelAction.ID, CollapseDeepestExpandedLevelAction.LABEL), 'ReferenceSearch: Collapse All', category);


// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'referenceSearch',
	order: 13,
	title: nls.localize('referenceSearchConfigurationTitle', "ReferenceSearch"),
	type: 'object',
	properties: {
		'referenceSearch.location': {
			type: 'string',
			enum: ['sidebar', 'panel'],
			default: 'sidebar',
			description: nls.localize('referenceSearch.location', "Controls if the referenceSearch will be shown as a view in the sidebar or as a panel in the panel area for more horizontal space."),
		}
	}
});

// View menu

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '3_views',
	command: {
		id: VIEW_ID,
		title: nls.localize({ key: 'miViewReferenceSearch', comment: ['&& denotes a mnemonic'] }, "&&ReferenceSearch")
	},
	order: 2
});
