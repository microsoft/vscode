/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { GettingStartedInputSerializer, GettingStartedPage, inWelcomeContext } from 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { MenuId, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IWalkthroughsService } from 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedService';
import { GettingStartedEditorOptions, GettingStartedInput } from 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedInput';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { isLinux, isMacintosh, isWindows, OperatingSystem as OS } from 'vs/base/common/platform';
import { IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { StartupPageContribution, } from 'vs/workbench/contrib/welcomeGettingStarted/browser/startupPage';
import { ExtensionsInput } from 'vs/workbench/contrib/extensions/common/extensionsInput';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';

export * as icons from 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedIcons';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openWalkthrough',
			title: { value: localize('miWelcome', "Welcome"), original: 'Welcome' },
			category: Categories.Help,
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '1_welcome',
				order: 1,
			}
		});
	}

	public run(
		accessor: ServicesAccessor,
		walkthroughID: string | { category: string; step: string } | undefined,
		toSide: boolean | undefined
	) {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const instantiationService = accessor.get(IInstantiationService);
		const editorService = accessor.get(IEditorService);
		const commandService = accessor.get(ICommandService);

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
					const group = editorGroupsService.getGroup(groupId);
					if (!editor.selectedCategory && group) {
						editor.selectedCategory = selectedCategory;
						editor.selectedStep = selectedStep;
						group.openEditor(editor, { revealIfOpened: true });
						return;
					}
				}
			}

			const activeEditor = editorService.activeEditor;
			// If the walkthrough is already open just reveal the step
			if (selectedStep && activeEditor instanceof GettingStartedInput && activeEditor.selectedCategory === selectedCategory) {
				commandService.executeCommand('walkthroughs.selectStep', selectedStep);
				return;
			}

			// If it's the extension install page then lets replace it with the getting started page
			if (activeEditor instanceof ExtensionsInput) {
				const activeGroup = editorGroupsService.activeGroup;
				activeGroup.replaceEditors([{
					editor: activeEditor,
					replacement: instantiationService.createInstance(GettingStartedInput, { selectedCategory: selectedCategory, selectedStep: selectedStep })
				}]);
			} else {
				// else open respecting toSide
				editorService.openEditor({
					resource: GettingStartedInput.RESOURCE,
					options: <GettingStartedEditorOptions>{ selectedCategory: selectedCategory, selectedStep: selectedStep, preserveFocus: toSide ?? false }
				}, toSide ? SIDE_GROUP : undefined);
			}
		} else {
			editorService.openEditor({ resource: GettingStartedInput.RESOURCE });
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

const category = { value: localize('welcome', "Welcome"), original: 'Welcome' };

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'welcome.goBack',
			title: { value: localize('welcome.goBack', "Go Back"), original: 'Go Back' },
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape,
				when: inWelcomeContext
			},
			precondition: ContextKeyExpr.equals('activeEditor', 'gettingStartedPage'),
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
			id: 'welcome.markStepComplete',
			title: localize('welcome.markStepComplete', "Mark Step Complete"),
			category,
		});
	}

	run(accessor: ServicesAccessor, arg: string) {
		if (!arg) { return; }
		const gettingStartedService = accessor.get(IWalkthroughsService);
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
		const gettingStartedService = accessor.get(IWalkthroughsService);
		gettingStartedService.deprogressStep(arg);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'welcome.showAllWalkthroughs',
			title: { value: localize('welcome.showAllWalkthroughs', "Open Walkthrough..."), original: 'Open Walkthrough...' },
			category,
			f1: true,
		});
	}

	private async getQuickPickItems(
		contextService: IContextKeyService,
		gettingStartedService: IWalkthroughsService
	): Promise<IQuickPickItem[]> {
		const categories = await gettingStartedService.getWalkthroughs();
		return categories
			.filter(c => contextService.contextMatchesRules(c.when))
			.map(x => ({
				id: x.id,
				label: x.title,
				detail: x.description,
				description: x.source,
			}));
	}

	async run(accessor: ServicesAccessor) {
		const commandService = accessor.get(ICommandService);
		const contextService = accessor.get(IContextKeyService);
		const quickInputService = accessor.get(IQuickInputService);
		const gettingStartedService = accessor.get(IWalkthroughsService);
		const extensionService = accessor.get(IExtensionService);

		const quickPick = quickInputService.createQuickPick();
		quickPick.canSelectMany = false;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.placeholder = localize('pickWalkthroughs', 'Select a walkthrough to open');
		quickPick.items = await this.getQuickPickItems(contextService, gettingStartedService);
		quickPick.busy = true;
		quickPick.onDidAccept(() => {
			const selection = quickPick.selectedItems[0];
			if (selection) {
				commandService.executeCommand('workbench.action.openWalkthrough', selection.id);
			}
			quickPick.hide();
		});
		quickPick.onDidHide(() => quickPick.dispose());
		await extensionService.whenInstalledExtensionsRegistered();
		gettingStartedService.onDidAddWalkthrough(async () => {
			quickPick.items = await this.getQuickPickItems(contextService, gettingStartedService);
		});
		quickPick.show();
		quickPick.busy = false;
	}
});

export const WorkspacePlatform = new RawContextKey<'mac' | 'linux' | 'windows' | 'webworker' | undefined>('workspacePlatform', undefined, localize('workspacePlatform', "The platform of the current workspace, which in remote or serverless contexts may be different from the platform of the UI"));
class WorkspacePlatformContribution {
	constructor(
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IContextKeyService private readonly contextService: IContextKeyService,
	) {
		this.remoteAgentService.getEnvironment().then(env => {
			const remoteOS = env?.os;

			const remotePlatform = remoteOS === OS.Macintosh ? 'mac'
				: remoteOS === OS.Windows ? 'windows'
					: remoteOS === OS.Linux ? 'linux'
						: undefined;

			if (remotePlatform) {
				WorkspacePlatform.bindTo(this.contextService).set(remotePlatform);
			} else if (this.extensionManagementServerService.localExtensionManagementServer) {
				if (isMacintosh) {
					WorkspacePlatform.bindTo(this.contextService).set('mac');
				} else if (isLinux) {
					WorkspacePlatform.bindTo(this.contextService).set('linux');
				} else if (isWindows) {
					WorkspacePlatform.bindTo(this.contextService).set('windows');
				}
			} else if (this.extensionManagementServerService.webExtensionManagementServer) {
				WorkspacePlatform.bindTo(this.contextService).set('webworker');
			} else {
				console.error('Error: Unable to detect workspace platform');
			}
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WorkspacePlatformContribution, LifecyclePhase.Restored);

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.welcomePage.walkthroughs.openOnInstall': {
			scope: ConfigurationScope.MACHINE,
			type: 'boolean',
			default: true,
			description: localize('workbench.welcomePage.walkthroughs.openOnInstall', "When enabled, an extension's walkthrough will open upon install of the extension.")
		},
		'workbench.startupEditor': {
			'scope': ConfigurationScope.RESOURCE,
			'type': 'string',
			'enum': ['none', 'welcomePage', 'readme', 'newUntitledFile', 'welcomePageInEmptyWorkbench'],
			'enumDescriptions': [
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.none' }, "Start without an editor."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.welcomePage' }, "Open the Welcome page, with content to aid in getting started with VS Code and extensions."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.readme' }, "Open the README when opening a folder that contains one, fallback to 'welcomePage' otherwise. Note: This is only observed as a global configuration, it will be ignored if set in a workspace or folder configuration."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.newUntitledFile' }, "Open a new untitled text file (only applies when opening an empty window)."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.welcomePageInEmptyWorkbench' }, "Open the Welcome page when opening an empty workbench."),
			],
			'default': 'welcomePage',
			'description': localize('workbench.startupEditor', "Controls which editor is shown at startup, if none are restored from the previous session.")
		},
		'workbench.welcomePage.preferReducedMotion': {
			scope: ConfigurationScope.APPLICATION,
			type: 'boolean',
			default: false,
			deprecationMessage: localize('deprecationMessage', "Deprecated, use the global `workbench.reduceMotion`."),
			description: localize('workbench.welcomePage.preferReducedMotion', "When enabled, reduce motion in welcome page.")
		}
	}
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(StartupPageContribution, LifecyclePhase.Restored);
