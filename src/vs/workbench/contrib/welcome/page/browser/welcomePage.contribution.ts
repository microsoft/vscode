/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { WelcomePageContribution, WelcomePageAction, WelcomeInputSerializer } from 'vs/workbench/contrib/welcome/page/browser/welcomePage';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions, CATEGORIES } from 'vs/workbench/common/actions';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IEditorInputFactoryRegistry, EditorExtensions } from 'vs/workbench/common/editor';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		...workbenchConfigurationNodeBase,
		'properties': {
			'workbench.startupEditor': {
				'scope': ConfigurationScope.RESOURCE,
				'type': 'string',
				'enum': ['none', 'welcomePage', 'readme', 'newUntitledFile', 'welcomePageInEmptyWorkbench', 'gettingStarted', 'gettingStartedInEmptyWorkbench'],
				'enumDescriptions': [
					localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.none' }, "Start without an editor."),
					localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.welcomePage' }, "Open the legacy Welcome page."),
					localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.readme' }, "Open the README when opening a folder that contains one, fallback to 'welcomePage' otherwise."),
					localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.newUntitledFile' }, "Open a new untitled file (only applies when opening an empty window)."),
					localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.welcomePageInEmptyWorkbench' }, "Open the legacy Welcome page when opening an empty workbench."),
					localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.gettingStarted' }, "Open the new Welcome Page with content to aid in getting started with VS Code and extensions."),
					localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'workbench.startupEditor.gettingStartedInEmptyWorkbench' }, "When opening an empty workbench, open the new Welcome Page with content to aid in getting started with VS Code and extensions.")
				],
				'default': 'welcomePage',
				'description': localize('workbench.startupEditor', "Controls which editor is shown at startup, if none are restored from the previous session.")
			},
		}
	});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WelcomePageContribution, LifecyclePhase.Restored);

Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(SyncActionDescriptor.from(WelcomePageAction), 'Help: Welcome', CATEGORIES.Help.value);

Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).registerEditorInputSerializer(WelcomeInputSerializer.ID, WelcomeInputSerializer);

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '1_welcome',
	command: {
		id: 'workbench.action.showWelcomePage',
		title: localize({ key: 'miWelcome', comment: ['&& denotes a mnemonic'] }, "&&Welcome")
	},
	order: 1
});
