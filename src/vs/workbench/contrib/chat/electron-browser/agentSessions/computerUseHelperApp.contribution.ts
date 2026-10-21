/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAuxiliaryWindow } from '../../../../../base/browser/window.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { IComputerUseSetupService, isComputerUseSetupPlatform } from '../../browser/agentSessions/agentHost/computerUseSetup.js';

/**
 * Lets the Computer Use setup modal hand Copilot Computer Use to System Settings by hand. System Settings only accepts
 * the app itself, which takes a native file drag.
 */
class ComputerUseHelperAppContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.computerUseHelperApp';

	constructor(
		@IComputerUseSetupService computerUseSetupService: IComputerUseSetupService,
		@INativeHostService nativeHostService: INativeHostService,
	) {
		super();
		if (!isComputerUseSetupPlatform()) {
			return;
		}
		this._register(computerUseSetupService.registerHelperAppSupport({
			startDrag: (path, targetWindow) => {
				void nativeHostService.startFileDrag(path, { targetWindowId: isAuxiliaryWindow(targetWindow) ? targetWindow.vscodeWindowId : undefined });
			},
			reveal: path => {
				void nativeHostService.showItemInFolder(path);
			},
		}));
	}
}

registerWorkbenchContribution2(ComputerUseHelperAppContribution.ID, ComputerUseHelperAppContribution, WorkbenchPhase.AfterRestored);
