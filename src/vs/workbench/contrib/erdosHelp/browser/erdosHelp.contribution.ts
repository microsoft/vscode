/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ErdosHelpFocused } from '../../../common/contextkeys.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { ErdosHelpView } from './erdosHelpView.js';
import { IErdosHelpService, ERDOS_HELP_VIEW_ID } from './erdosHelpService.js';
import { IErdosHelpSearchService, ErdosHelpSearchService } from './erdosHelpSearchService.js';
import { ERDOS_HELP_COPY, ERDOS_HELP_FIND } from './erdosHelpIdentifiers.js';
import { ICommandAndKeybindingRule, KeybindingWeight, KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ViewContainer, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, IViewsRegistry } from '../../../common/views.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { LookupHelpTopic, ShowHelpAtCursor } from './erdosHelpActions.js';

const erdosHelpViewIcon = registerIcon('erdos-help-view-icon', Codicon.book, nls.localize('erdosHelpViewIcon', 'View icon of the Erdos help view.'));

// Register the help search service
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
registerSingleton(IErdosHelpSearchService, ErdosHelpSearchService, InstantiationType.Delayed);

const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(
	ViewContainerExtensions.ViewContainersRegistry
).registerViewContainer(
	{
		id: ERDOS_HELP_VIEW_ID,
		title: {
			value: nls.localize('erdos.help', "Help"),
			original: 'Help'
		},
		icon: erdosHelpViewIcon,
		order: 2,
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ERDOS_HELP_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
		storageId: ERDOS_HELP_VIEW_ID,
		hideIfEmpty: true,
	},
	ViewContainerLocation.AuxiliaryBar,
	{
		doNotRegisterOpenCommand: false,
		isDefault: false
	}
);

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: ERDOS_HELP_VIEW_ID,
	name: {
		value: nls.localize('erdos.help', "Help"),
		original: 'Help'
	},
	containerIcon: erdosHelpViewIcon,
	canMoveView: true,
	canToggleVisibility: false,
	ctorDescriptor: new SyncDescriptor(ErdosHelpView),
	openCommandActionDescriptor: {
		id: 'workbench.action.erdos.openHelp',
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyH,
		},
		order: 1,
	}
}], VIEW_CONTAINER);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: ERDOS_HELP_COPY,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.KeyC,
	when: ErdosHelpFocused,
	handler: accessor => { }
} satisfies ICommandAndKeybindingRule);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: ERDOS_HELP_FIND,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.KeyF,
	when: ErdosHelpFocused,
	handler: accessor => {
		accessor.get(IErdosHelpService).find();
	}
} satisfies ICommandAndKeybindingRule);

class ErdosHelpContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.erdosHelp';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this.registerActions();
	}

	private registerActions(): void {
		registerAction2(ShowHelpAtCursor);
		registerAction2(LookupHelpTopic);

		// Register help search command
		CommandsRegistry.registerCommand('erdos.help.searchTopics', async (accessor, languageId: string, query: string) => {
			const helpService = accessor.get(IErdosHelpService);
			return await helpService.searchHelpTopics(languageId, query);
		});

		// Register show help topic command
		CommandsRegistry.registerCommand('erdos.help.showTopic', async (accessor, languageId: string, topic: string) => {
			const helpService = accessor.get(IErdosHelpService);
			return await helpService.showHelpTopic(languageId, topic);
		});
	}
}

registerWorkbenchContribution2(ErdosHelpContribution.ID, ErdosHelpContribution, WorkbenchPhase.BlockStartup);

