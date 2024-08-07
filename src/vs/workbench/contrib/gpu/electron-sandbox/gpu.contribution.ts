/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel } from 'vs/base/browser/browser';
import { mainWindow } from 'vs/base/browser/window';
import { localize2 } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { IGPUStatusMainService } from 'vs/platform/gpu/common/gpuStatusMain';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import 'vs/workbench/contrib/gpu/electron-sandbox/gpuStatusMainService';

class ShowGPUStatusAction extends Action2 {

	static readonly ID = 'workbench.action.showGPUStatus';

	constructor() {
		super({
			id: ShowGPUStatusAction.ID,
			title: localize2('showGPUStatus', 'Show GPU Status'),
			category: Categories.Help,
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const gpuStatusService = accessor.get(IGPUStatusMainService);
		gpuStatusService.openGPUStatusWindow({
			zoomLevel: getZoomLevel(mainWindow)
		});
	}
}

registerAction2(ShowGPUStatusAction);
MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '5_tools',
	command: {
		id: ShowGPUStatusAction.ID,
		title: localize2('showGPUStatus', 'Show GPU Status')
	},
	order: 3,
});
