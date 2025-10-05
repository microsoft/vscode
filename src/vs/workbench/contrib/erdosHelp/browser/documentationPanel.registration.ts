/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
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
import { HelpView } from './views/helpView.js';
import { IErdosHelpService, ERDOS_HELP_VIEW_ID } from './services/helpService.js';
import { ITopicQueryService, TopicQueryService } from './topicQueryService.js';
import { DOC_PANEL_COPY_ACTION, DOC_PANEL_FIND_ACTION } from './documentationPanelConstants.js';
import { ICommandAndKeybindingRule, KeybindingWeight, KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ViewContainer, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, IViewsRegistry } from '../../../common/views.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { DisplayTopicAtPosition, SearchDocumentation } from './topicLookupCommands.js';

const documentationPanelIcon = registerIcon('erdos-help-view-icon', Codicon.book, nls.localize('erdosHelpViewIcon', 'View icon of the Erdos help view.'));

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
registerSingleton(ITopicQueryService, TopicQueryService, InstantiationType.Delayed);

const PANEL_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(
	ViewContainerExtensions.ViewContainersRegistry
).registerViewContainer(
	{
		id: ERDOS_HELP_VIEW_ID,
		title: {
			value: nls.localize('erdos.help', "Help"),
			original: 'Help'
		},
		icon: documentationPanelIcon,
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
	containerIcon: documentationPanelIcon,
	canMoveView: true,
	canToggleVisibility: false,
	ctorDescriptor: new SyncDescriptor(HelpView),
	openCommandActionDescriptor: {
		id: 'workbench.action.erdos.openHelp',
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyH,
		},
		order: 1,
	}
}], PANEL_CONTAINER);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: DOC_PANEL_COPY_ACTION,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.KeyC,
	when: ErdosHelpFocused,
	handler: accessor => { }
} satisfies ICommandAndKeybindingRule);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: DOC_PANEL_FIND_ACTION,
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyMod.CtrlCmd | KeyCode.KeyF,
	when: ErdosHelpFocused,
	handler: (accessor: any) => {
		accessor.get(IErdosHelpService).find();
	}
} satisfies ICommandAndKeybindingRule);

class DocumentationPanelBootstrap extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.erdosHelp';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this.initializeCommands();
	}

	private initializeCommands(): void {
		registerAction2(DisplayTopicAtPosition);
		registerAction2(SearchDocumentation);

		CommandsRegistry.registerCommand('erdos.help.searchTopics', async (accessor: any, languageId: string, query: string) => {
			const helpAccess = accessor.get(IErdosHelpService);
			return await helpAccess.searchHelpTopics(languageId, query);
		});

		CommandsRegistry.registerCommand('erdos.help.showTopic', async (accessor: any, languageId: string, topic: string) => {
			const helpAccess = accessor.get(IErdosHelpService);
			return await helpAccess.showHelpTopic(languageId, topic);
		});
	}
}

registerWorkbenchContribution2(DocumentationPanelBootstrap.ID, DocumentationPanelBootstrap, WorkbenchPhase.BlockStartup);

