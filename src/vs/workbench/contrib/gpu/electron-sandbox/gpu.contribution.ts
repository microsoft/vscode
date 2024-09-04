/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel } from '../../../../base/browser/browser.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IGPUStatusMainService } from '../../../../platform/gpu/common/gpuStatusMain.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import './gpuStatusMainService.js';

class ShowGPUStatusAction extends Action2 {

	static readonly ID = 'workbench.action.showGPUInfo';

	constructor() {
		super({
			id: ShowGPUStatusAction.ID,
			title: localize2('showGPUInfo', 'Show GPU Info'),
			category: Categories.Developer,
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
