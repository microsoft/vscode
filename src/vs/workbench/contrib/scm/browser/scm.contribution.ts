/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { DirtyDiffWorkbenchController } from './dirtydiffDecorator';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ShowViewletAction } from 'vs/workbench/browser/viewlet';
import { VIEWLET_ID, ISCMRepository, ISCMService } from 'vs/workbench/contrib/scm/common/scm';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { SCMStatusController } from './scmActivity';
import { SCMViewlet } from 'vs/workbench/contrib/scm/browser/scmViewlet';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { SCMService } from 'vs/workbench/contrib/scm/common/scmService';

class OpenSCMViewletAction extends ShowViewletAction {

	static readonly ID = VIEWLET_ID;
	static LABEL = localize('toggleGitViewlet', "Show Git");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IEditorGroupsService editorGroupService: IEditorGroupsService, @IWorkbenchLayoutService layoutService: IWorkbenchLayoutService) {
		super(id, label, VIEWLET_ID, viewletService, editorGroupService, layoutService);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(DirtyDiffWorkbenchController, LifecyclePhase.Restored);

Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
	SCMViewlet,
	VIEWLET_ID,
	localize('source control', "Source Control"),
	'scm',
	2
));

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(SCMStatusController, LifecyclePhase.Restored);

// Register Action to Open Viewlet
Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(OpenSCMViewletAction, VIEWLET_ID, localize('toggleSCMViewlet', "Show SCM"), {
		primary: 0,
		win: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G },
		linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G },
		mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_G }
	}),
	'View: Show SCM',
	localize('view', "View")
);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'scm',
	order: 5,
	title: localize('scmConfigurationTitle', "SCM"),
	type: 'object',
	scope: ConfigurationScope.RESOURCE,
	properties: {
		'scm.alwaysShowProviders': {
			type: 'boolean',
			description: localize('alwaysShowProviders', "Controls whether to show the Source Control Provider section even when there's only one Provider registered."),
			default: false
		},
		'scm.providers.visible': {
			type: 'number',
			description: localize('providersVisible', "Controls how many providers are visible in the Source Control Provider section. Set to `0` to be able to manually resize the view."),
			default: 10
		},
		'scm.diffDecorations': {
			type: 'string',
			enum: ['all', 'gutter', 'overview', 'none'],
			default: 'all',
			description: localize('diffDecorations', "Controls diff decorations in the editor.")
		},
		'scm.diffDecorationsGutterWidth': {
			type: 'number',
			enum: [1, 2, 3, 4, 5],
			default: 3,
			description: localize('diffGutterWidth', "Controls the width(px) of diff decorations in gutter (added & modified).")
		},
		'scm.alwaysShowActions': {
			type: 'boolean',
			description: localize('alwaysShowActions', "Controls whether inline actions are always visible in the Source Control view."),
			default: false
		},
		'scm.countBadge': {
			type: 'string',
			enum: ['all', 'focused', 'off'],
			enumDescriptions: [
				localize('scm.countBadge.all', "Show the sum of all Source Control Providers count badges."),
				localize('scm.countBadge.focused', "Show the count badge of the focused Source Control Provider."),
				localize('scm.countBadge.off', "Disable the Source Control count badge.")
			],
			description: localize('scm.countBadge', "Controls the Source Control count badge."),
			default: 'all'
		}
	}
});

// View menu

MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '3_views',
	command: {
		id: VIEWLET_ID,
		title: localize({ key: 'miViewSCM', comment: ['&& denotes a mnemonic'] }, "S&&CM")
	},
	order: 3
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'scm.acceptInput',
	description: { description: localize('scm accept', "SCM: Accept Input"), args: [] },
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.has('scmRepository'),
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	handler: accessor => {
		const contextKeyService = accessor.get(IContextKeyService);
		const context = contextKeyService.getContext(document.activeElement);
		const repository = context.getValue<ISCMRepository>('scmRepository');

		if (!repository || !repository.provider.acceptInputCommand) {
			return Promise.resolve(null);
		}

		const id = repository.provider.acceptInputCommand.id;
		const args = repository.provider.acceptInputCommand.arguments;

		const commandService = accessor.get(ICommandService);
		return commandService.executeCommand(id, ...(args || []));
	}
});

registerSingleton(ISCMService, SCMService);
