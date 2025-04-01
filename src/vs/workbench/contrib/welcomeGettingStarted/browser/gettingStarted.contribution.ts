/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { GettingStartedInputSerializer, GettingStartedPage, inWelcomeContext } from './gettingStarted.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { MenuId, registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IWalkthroughsService } from './gettingStartedService.js';
import { GettingStartedEditorOptions, GettingStartedInput } from './gettingStartedInput.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { isLinux, isMacintosh, isWindows, OperatingSystem as OS } from '../../../../base/common/platform.js';
import { IExtensionManagementServerService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { StartupPageEditorResolverContribution, StartupPageRunnerContribution } from './startupPage.js';
import { ExtensionsInput } from '../../extensions/common/extensionsInput.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { GettingStartedAccessibleView } from './gettingStartedAccessibleView.js';

export * as icons from './gettingStartedIcons.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openWalkthrough',
			title: localize2('miWelcome', 'Welcome'),
			category: Categories.Help,
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '1_welcome',
				order: 1,
			},
			metadata: {
				description: localize2('minWelcomeDescription', 'Opens a Walkthrough to help you get started in VS Code.')
			}
		});
	}

	public run(
		accessor: ServicesAccessor,
		walkthroughID: string | { category: string; step: string } | undefined,
		optionsOrToSide: { toSide?: boolean; inactive?: boolean } | boolean | undefined
	) {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const instantiationService = accessor.get(IInstantiationService);
		const editorService = accessor.get(IEditorService);
		const commandService = accessor.get(ICommandService);

		const toSide = typeof optionsOrToSide === 'object' ? optionsOrToSide.toSide : optionsOrToSide;
		const inactive = typeof optionsOrToSide === 'object' ? optionsOrToSide.inactive : false;

		if (walkthroughID) {
			const selectedCategory = typeof walkthroughID === 'string' ? walkthroughID : walkthroughID.category;
			let selectedStep: string | undefined;
			if (typeof walkthroughID === 'object' && 'category' in walkthroughID && 'step' in walkthroughID) {
				selectedStep = `${walkthroughID.category}#${walkthroughID.step}`;
			} else {
				selectedStep = undefined;
			}

			// We're trying to open the welcome page from the Help menu
			if (!selectedCategory && !selectedStep) {
				editorService.openEditor({
					resource: GettingStartedInput.RESOURCE,
					options: { preserveFocus: toSide ?? false, inactive }
				}, toSide ? SIDE_GROUP : undefined);
				return;
			}

			// Try first to select the walkthrough on an active welcome page with no selected walkthrough
			for (const group of editorGroupsService.groups) {
				if (group.activeEditor instanceof GettingStartedInput) {
					const activeEditor = group.activeEditor as GettingStartedInput;
					activeEditor.showWelcome = false;
					(group.activeEditorPane as GettingStartedPage).makeCategoryVisibleWhenAvailable(selectedCategory, selectedStep);
					return;
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
						editor.showWelcome = false;
						group.openEditor(editor, { revealIfOpened: true, inactive });
						return;
					}
				}
			}

			const activeEditor = editorService.activeEditor;
			// If the walkthrough is already open just reveal the step
			if (selectedStep && activeEditor instanceof GettingStartedInput && activeEditor.selectedCategory === selectedCategory) {
				activeEditor.showWelcome = false;
				commandService.executeCommand('walkthroughs.selectStep', selectedStep);
				return;
			}

			// If it's the extension install page then lets replace it with the getting started page
			if (activeEditor instanceof ExtensionsInput) {
				const activeGroup = editorGroupsService.activeGroup;
				activeGroup.replaceEditors([{
					editor: activeEditor,
					replacement: instantiationService.createInstance(GettingStartedInput, { selectedCategory: selectedCategory, selectedStep: selectedStep, showWelcome: false })
				}]);
			} else {
				// else open respecting toSide
				const options: GettingStartedEditorOptions = { selectedCategory: selectedCategory, selectedStep: selectedStep, showWelcome: false, preserveFocus: toSide ?? false, inactive };
				editorService.openEditor({
					resource: GettingStartedInput.RESOURCE,
					options
				}, toSide ? SIDE_GROUP : undefined).then((editor) => {
					(editor as GettingStartedPage)?.makeCategoryVisibleWhenAvailable(selectedCategory, selectedStep);
				});

			}
		} else {
			editorService.openEditor({
				resource: GettingStartedInput.RESOURCE,
				options: { preserveFocus: toSide ?? false, inactive }
			}, toSide ? SIDE_GROUP : undefined);
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

const category = localize2('welcome', "Welcome");

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'welcome.goBack',
			title: localize2('welcome.goBack', 'Go Back'),
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
			title: localize2('welcome.showAllWalkthroughs', 'Open Walkthrough...'),
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

		const disposables = new DisposableStore();
		const quickPick = disposables.add(quickInputService.createQuickPick());
		quickPick.canSelectMany = false;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;
		quickPick.placeholder = localize('pickWalkthroughs', 'Select a walkthrough to open');
		quickPick.items = await this.getQuickPickItems(contextService, gettingStartedService);
		quickPick.busy = true;
		disposables.add(quickPick.onDidAccept(() => {
			const selection = quickPick.selectedItems[0];
			if (selection) {
				commandService.executeCommand('workbench.action.openWalkthrough', selection.id);
			}
			quickPick.hide();
		}));
		disposables.add(quickPick.onDidHide(() => disposables.dispose()));
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

	static readonly ID = 'workbench.contrib.workspacePlatform';

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
			'enum': ['none', 'welcomePage', 'readme', 'newUntitledFile', 'welcomePageInEmptyWorkbench', 'terminal'],
			'enumDescriptions': [
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.none' }, "Start without an editor."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.welcomePage' }, "Open the Welcome page, with content to aid in getting started with VS Code and extensions."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.readme' }, "Open the README when opening a folder that contains one, fallback to 'welcomePage' otherwise. Note: This is only observed as a global configuration, it will be ignored if set in a workspace or folder configuration."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.newUntitledFile' }, "Open a new untitled text file (only applies when opening an empty window)."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.welcomePageInEmptyWorkbench' }, "Open the Welcome page when opening an empty workbench."),
				localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.terminal' }, "Open a new terminal in the editor area."),
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

registerWorkbenchContribution2(WorkspacePlatformContribution.ID, WorkspacePlatformContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(StartupPageEditorResolverContribution.ID, StartupPageEditorResolverContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(StartupPageRunnerContribution.ID, StartupPageRunnerContribution, WorkbenchPhase.AfterRestored);

AccessibleViewRegistry.register(new GettingStartedAccessibleView());

