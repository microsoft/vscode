/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { Registry } from 'vs/platform/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { DirtyDiffDecorator } from './dirtydiffDecorator';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actionRegistry';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { StatusUpdater } from './scmActivity';
import SCMPreview, { DisableSCMPreviewAction, EnableSCMPreviewAction } from '../browser/scmPreview';

class OpenSCMViewletAction extends ToggleViewletAction {

	static ID = VIEWLET_ID;
	static LABEL = localize('toggleGitViewlet', "Show Git");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

export class SwitchProvider extends Action {

	static readonly ID = 'scm.switch';
	static readonly LABEL = 'Switch SCM Provider';

	constructor(
		id = SwitchProvider.ID,
		label = SwitchProvider.LABEL,
		@ISCMService private scmService: ISCMService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super('scm.switchprovider', 'Switch SCM Provider', '', true);
	}

	run(): TPromise<any> {
		const picks = this.scmService.providers.map(provider => ({
			label: provider.label,
			run: () => this.scmService.activeProvider = provider
		}));

		return this.quickOpenService.pick(picks);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(DirtyDiffDecorator);

if (SCMPreview.enabled) {
	const viewletDescriptor = new ViewletDescriptor(
		'vs/workbench/parts/scm/electron-browser/scmViewlet',
		'SCMViewlet',
		VIEWLET_ID,
		localize('source control', "Source Control"),
		'scm',
		36
	);

	Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets)
		.registerViewlet(viewletDescriptor);

	Registry.as(WorkbenchExtensions.Workbench)
		.registerWorkbenchContribution(StatusUpdater);

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

	Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions)
		.registerWorkbenchAction(new SyncActionDescriptor(SwitchProvider, SwitchProvider.ID, SwitchProvider.LABEL), 'SCM: Switch Provider', 'SCM');

	Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions)
		.registerWorkbenchAction(new SyncActionDescriptor(DisableSCMPreviewAction, DisableSCMPreviewAction.ID, DisableSCMPreviewAction.LABEL), 'SCM: Disable Preview SCM', 'SCM');
} else {
	Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions)
		.registerWorkbenchAction(new SyncActionDescriptor(EnableSCMPreviewAction, EnableSCMPreviewAction.ID, EnableSCMPreviewAction.LABEL), 'SCM: Enable Preview SCM', 'SCM');
}
