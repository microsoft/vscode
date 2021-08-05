/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { GettingStartedInputSerializer, GettingStartedPage, inWelcomeContext } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStarted';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { MenuId, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IGettingStartedService } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedService';
import { GettingStartedInput } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedInput';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorResolution } from 'vs/platform/editor/common/editor';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { ITASExperimentService } from 'vs/workbench/services/experiment/common/experimentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';


export * as icons from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedIcons';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openWalkthrough',
			title: localize('Welcome', "Welcome"),
			category: localize('help', "Help"),
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '1_welcome',
				order: 1,
			}
		});
	}

	public run(accessor: ServicesAccessor, walkthroughID: string | { category: string, step: string } | undefined, toSide: boolean | undefined) {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const instantiationService = accessor.get(IInstantiationService);
		const editorService = accessor.get(IEditorService);

		if (walkthroughID) {
			const selectedCategory = typeof walkthroughID === 'string' ? walkthroughID : walkthroughID.category;
			const selectedStep = typeof walkthroughID === 'string' ? undefined : walkthroughID.step;
			// Try first to select the walkthrough on an active welcome page with no selected walkthrough
			for (const group of editorGroupsService.groups) {
				if (group.activeEditor instanceof GettingStartedInput) {
					if (!group.activeEditor.selectedCategory) {
						(group.activeEditorPane as GettingStartedPage).makeCategoryVisibleWhenAvailable(selectedCategory, selectedStep);
						return;
					}
				}
			}

			// Otherwise, try to find a welcome input somewhere with no selected walkthrough, and open it to this one.
			const result = editorService.findEditors({ typeId: GettingStartedInput.ID, editorId: undefined, resource: GettingStartedInput.RESOURCE });
			for (const { editor, groupId } of result) {
				if (editor instanceof GettingStartedInput) {
					if (!editor.selectedCategory) {
						editor.selectedCategory = selectedCategory;
						editor.selectedStep = selectedStep;
						editorService.openEditor(editor, { revealIfOpened: true, override: EditorResolution.DISABLED }, groupId);
						return;
					}
				}
			}

			// Otherwise, just make a new one.
			editorService.openEditor(instantiationService.createInstance(GettingStartedInput, { selectedCategory: selectedCategory, selectedStep: selectedStep }), {}, toSide ? SIDE_GROUP : undefined);
		} else {
			editorService.openEditor(new GettingStartedInput({}), {});
		}
	}
});

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(GettingStartedInput.ID, GettingStartedInputSerializer);
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		GettingStartedPage,
		GettingStartedPage.ID,
		localize('welcome', "Welcome")
	),
	[
		new SyncDescriptor(GettingStartedInput)
	]
);

const category = localize('welcome', "Welcome");

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'welcome.goBack',
			title: localize('welcome.goBack', "Go Back"),
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape,
				when: inWelcomeContext
			},
			precondition: ContextKeyEqualsExpr.create('activeEditor', 'gettingStartedPage'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof GettingStartedPage) {
			editorPane.escape();
		}
	}
});

CommandsRegistry.registerCommand({
	id: 'walkthroughs.selectStep',
	handler: (accessor, stepID: string) => {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof GettingStartedPage) {
			editorPane.selectStepLoose(stepID);
		} else {
			console.error('Cannot run walkthroughs.selectStep outside of walkthrough context');
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'gettingStarted.next',
			title: localize('gettingStarted.goNext', "Next"),
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.DownArrow,
				secondary: [KeyCode.RightArrow],
				when: inWelcomeContext
			},
			precondition: ContextKeyEqualsExpr.create('activeEditor', 'gettingStartedPage'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof GettingStartedPage) {
			editorPane.focusNext();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'gettingStarted.prev',
			title: localize('gettingStarted.goPrev', "Previous"),
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.UpArrow,
				secondary: [KeyCode.LeftArrow],
				when: inWelcomeContext
			},
			precondition: ContextKeyEqualsExpr.create('activeEditor', 'gettingStartedPage'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof GettingStartedPage) {
			editorPane.focusPrevious();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'welcome.markStepComplete',
			title: localize('welcome.markStepComplete', "Mark Step Complete"),
			category,
		});
	}

	run(accessor: ServicesAccessor, arg: string) {
		if (!arg) { return; }
		const gettingStartedService = accessor.get(IGettingStartedService);
		gettingStartedService.progressStep(arg);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'welcome.markStepIncomplete',
			title: localize('welcome.markStepInomplete', "Mark Step Incomplete"),
			category,
		});
	}

	run(accessor: ServicesAccessor, arg: string) {
		if (!arg) { return; }
		const gettingStartedService = accessor.get(IGettingStartedService);
		gettingStartedService.deprogressStep(arg);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'welcome.showAllWalkthroughs',
			title: localize('welcome.showAllWalkthroughs', "Open Walkthrough..."),
			category,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor) {
		const commandService = accessor.get(ICommandService);
		const quickInputService = accessor.get(IQuickInputService);
		const gettingStartedService = accessor.get(IGettingStartedService);
		const categories = gettingStartedService.getCategories().filter(x => x.content.type === 'steps');
		const selection = await quickInputService.pick(categories.map(x => ({
			id: x.id,
			label: x.title,
			detail: x.description,
			description: x.source,
		})), { canPickMany: false, matchOnDescription: true, matchOnDetail: true, title: localize('pickWalkthroughs', "Open Walkthrough...") });
		if (selection) {
			commandService.executeCommand('workbench.action.openWalkthrough', selection.id);
		}
	}
});

const prefersReducedMotionConfig = {
	...workbenchConfigurationNodeBase,
	'properties': {
		'workbench.welcomePage.preferReducedMotion': {
			scope: ConfigurationScope.APPLICATION,
			type: 'boolean',
			default: true,
			description: localize('workbench.welcomePage.preferReducedMotion', "When enabled, reduce motion in welcome page.")
		}
	}
} as const;

const prefersStandardMotionConfig = {
	...workbenchConfigurationNodeBase,
	'properties': {
		'workbench.welcomePage.preferReducedMotion': {
			scope: ConfigurationScope.APPLICATION,
			type: 'boolean',
			default: false,
			description: localize('workbench.welcomePage.preferReducedMotion', "When enabled, reduce motion in welcome page.")
		}
	}
} as const;

class WorkbenchConfigurationContribution {
	constructor(
		@IInstantiationService _instantiationService: IInstantiationService,
		@IGettingStartedService _gettingStartedService: IGettingStartedService,
		@IConfigurationService _configurationService: IConfigurationService,
		@ITASExperimentService _experimentSevice: ITASExperimentService,
	) {
		// Init the getting started service via DI.
		this.registerConfigs(_experimentSevice);
	}

	private async registerConfigs(_experimentSevice: ITASExperimentService) {
		const preferReduced = await _experimentSevice.getTreatment('welcomePage.preferReducedMotion').catch(e => false);
		if (preferReduced) {
			configurationRegistry.deregisterConfigurations([prefersStandardMotionConfig]);
			configurationRegistry.registerConfiguration(prefersReducedMotionConfig);
		}
		else {
			configurationRegistry.deregisterConfigurations([prefersReducedMotionConfig]);
			configurationRegistry.registerConfiguration(prefersStandardMotionConfig);
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WorkbenchConfigurationContribution, LifecyclePhase.Restored);


const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.welcomePage.walkthroughs.openOnInstall': {
			scope: ConfigurationScope.APPLICATION,
			type: 'boolean',
			default: true,
			description: localize('workbench.welcomePage.walkthroughs.openOnInstall', "When enabled, an extension's walkthrough will open upon install the extension.")
		}
	}
});
