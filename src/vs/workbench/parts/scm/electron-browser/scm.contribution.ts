/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { DirtyDiffWorkbenchController } from './dirtydiffDecorator';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { StatusUpdater, StatusBarController } from './scmActivity';
import { SCMViewlet } from 'vs/workbench/parts/scm/electron-browser/scmViewlet';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';

class OpenSCMViewletAction extends ToggleViewletAction {

	static readonly ID = VIEWLET_ID;
	static LABEL = localize('toggleGitViewlet', "Show Git");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IEditorGroupsService editorGroupService: IEditorGroupsService) {
		super(id, label, VIEWLET_ID, viewletService, editorGroupService);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(DirtyDiffWorkbenchController, LifecyclePhase.Running);

const viewletDescriptor = new ViewletDescriptor(
	SCMViewlet,
	VIEWLET_ID,
	localize('source control', "Source Control"),
	'scm',
	2
);

Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets)
	.registerViewlet(viewletDescriptor);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(StatusUpdater, LifecyclePhase.Running);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(StatusBarController, LifecyclePhase.Running);

// Register Action to Open Viewlet
Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(OpenSCMViewletAction, VIEWLET_ID, localize('toggleSCMViewlet', "Show SCM"), {
		primary: null,
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
	properties: {
		'scm.alwaysShowProviders': {
			type: 'boolean',
			description: localize('alwaysShowProviders', "Controls whether to always show the Source Control Provider section."),
			default: false
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
