/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/platform';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

const treeExplorerNodeProviderId = 'pineTree';
const VIEWLET_ID = 'workbench.view.customTreeExplorerViewlet.' + treeExplorerNodeProviderId;

export class ToggleExternalViewletAction extends ToggleViewletAction {
	public static ID = VIEWLET_ID;
	public static LABEL = nls.localize('toggleExternalViewlet', "Toggle External Viewlet pineTree");

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

registry.registerWorkbenchAction(
	new SyncActionDescriptor(ToggleExternalViewletAction, ToggleExternalViewletAction.ID, ToggleExternalViewletAction.LABEL),
	"View: Toggle External Viewlet pineTree",
	nls.localize('view', "View")
);