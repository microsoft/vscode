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
import { VIEWLET_ID } from 'vs/workbench/parts/wize/common/wize';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actionRegistry';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWizeService } from 'vs/workbench/services/wize/common/wize';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { StatusUpdater } from './wizeActivity';
import WizePreview, { DisableWizePreviewAction, EnableWizePreviewAction } from '../browser/wizePreview';

class OpenWizeViewletAction extends ToggleViewletAction {

	static ID = VIEWLET_ID;
	static LABEL = localize('toggleGitViewlet', "Show Git");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

// TODO@Joao
export class SwitchProvider extends Action {

	static readonly ID = 'wize.switch';
	static readonly LABEL = 'Switch Wize Provider';

	constructor(
		id = SwitchProvider.ID,
		label = SwitchProvider.LABEL,
		@IWizeService private wizeService: IWizeService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super('wize.switchprovider', 'Switch Wize Provider', '', true);
	}

	run(): TPromise<any> {
		const picks = this.wizeService.providers.map(provider => ({
			id: provider.id,
			label: provider.label,
			run: () => this.wizeService.activeProvider = provider
		}));

		return this.quickOpenService.pick(picks);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(DirtyDiffDecorator);

if (WizePreview.enabled) {
	const viewletDescriptor = new ViewletDescriptor(
		'vs/workbench/parts/wize/electron-browser/wizeViewlet',
		'WizeViewlet',
		VIEWLET_ID,
		localize('wize', "Wize"),
		'wize',
		112
	);

	Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets)
		.registerViewlet(viewletDescriptor);

	Registry.as(WorkbenchExtensions.Workbench)
		.registerWorkbenchContribution(StatusUpdater);

	// Register Action to Open Viewlet
	Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions).registerWorkbenchAction(
		new SyncActionDescriptor(OpenWizeViewletAction, VIEWLET_ID, localize('toggleWizeViewlet', "Show Wize"), {
			primary: null,
			win: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G },
			linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G },
			mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_G }
		}),
		'View: Show Wize',
		localize('view', "View")
	);

	Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions)
		.registerWorkbenchAction(new SyncActionDescriptor(SwitchProvider, SwitchProvider.ID, SwitchProvider.LABEL), 'Wize: Switch Provider', 'Wize');

	Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions)
		.registerWorkbenchAction(new SyncActionDescriptor(DisableWizePreviewAction, DisableWizePreviewAction.ID, DisableWizePreviewAction.LABEL), 'Wize: Disable Preview Wize', 'Wize');
} else {
	Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions)
		.registerWorkbenchAction(new SyncActionDescriptor(EnableWizePreviewAction, EnableWizePreviewAction.ID, EnableWizePreviewAction.LABEL), 'Wize: Enable Preview Wize', 'Wize');
}
